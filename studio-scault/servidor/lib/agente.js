// Ponte com o Claude Agent SDK — o "motor de IA" do estúdio, rodando na
// assinatura do Claude Code (nunca em API key paga).
//
// Duas travas validadas na mão antes deste arquivo existir (ver o histórico
// da sessão que criou o estúdio):
//
//   1. `settingSources: []` — sem isso, o agente carrega o CLAUDE.md global e
//      o da raiz do ScaultOS, que tem regras de outros domínios (ex: "invocar
//      ui-ux-pro-max pra qualquer tarefa visual") e o agente tenta segui-las
//      com ferramentas fora do que o estúdio autorizou. Isolamento total.
//   2. `tools` (não `allowedTools`) — `allowedTools` é só sugestão de
//      aprovação dentro do modo de permissão; com `bypassPermissions` ela NÃO
//      trava nada. `tools` é a lista real de ferramentas disponíveis.
//   3. Instruir caminho ABSOLUTO no prompt antes de pedir Write — o `cwd` da
//      option nem sempre bate com o cwd que a tool resolve (visto na prática
//      com o path acentuado do OneDrive). Caminho absoluto elimina a dúvida.
//
// `ANTHROPIC_API_KEY` é sempre removida do ambiente do processo antes de
// chamar — se ela estiver setada (o `.env` da raiz tem uma, pro
// gerar-imagem.js), o SDK prioriza ela sobre a sessão logada e passa a
// cobrar por token. Isso é o oposto do que o estúdio existe pra fazer.
'use strict';

const path = require('path');
const fs = require('fs');
const { query } = require('@anthropic-ai/claude-agent-sdk');
const imagens = require('./imagens');
const contratoLib = require('./contrato');
const pele = require('./pele');
const { apagarArquivo } = require('./arquivos');
const contasLib = require('./contas');
const preferenciasLib = require('./preferencias');

function ambienteSemApiKey() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

// Env final de uma chamada: sem API key (ver acima) + CLAUDE_CONFIG_DIR da
// conta ATIVA (ver contas.js) — se a conta ativa for a "padrao", configDir é
// null e a env var nem é tocada, então o comportamento continua idêntico a
// antes desta troca de conta existir.
function ambienteDaChamada(conta) {
  const env = ambienteSemApiKey();
  if (conta && conta.configDir) env.CLAUDE_CONFIG_DIR = conta.configDir;
  return env;
}

// Busca automática de foto pro post — o usuário não abre o banco de imagens
// na mão, o estúdio já entrega o post com foto de verdade (Pexels/Unsplash,
// licenciada) escolhida a partir do próprio tema. Nunca derruba a geração:
// sem chave de API, sem resultado, ou banco fora do ar, só segue sem foto —
// o agente já sabe usar fundo decorativo (mesh/glow) nesse caso.
function extrairConsultaBusca(briefing) {
  const semRotulo = briefing.replace(/^\s*tema\s*:\s*/i, '').replace(/objetivo\s*:.*/i, '');
  return semRotulo.trim().slice(0, 70) || briefing.slice(0, 70);
}

async function buscarFotosAutomatico(pastaAbs, briefing, n = 3) {
  try {
    const consulta = extrairConsultaBusca(briefing);
    const r = await imagens.buscarBanco(consulta, { n: Math.max(n + 2, 5) });
    const escolhidas = (r.fotos || []).slice(0, n);
    const baixadas = [];
    for (let i = 0; i < escolhidas.length; i++) {
      try {
        const b = await imagens.baixarBanco(escolhidas[i].id, { pastaAbs, nome: `banco-${i + 1}` });
        if (b.arquivos && b.arquivos[0]) {
          baixadas.push({ arquivo: b.arquivos[0], alt: escolhidas[i].alt, fotografo: escolhidas[i].fotografo });
        }
      } catch { /* uma foto falhando na hora de baixar nao derruba as outras */ }
    }
    return baixadas;
  } catch {
    return []; // banco fora do ar ou sem chave de API — segue sem foto, nao trava geracao
  }
}

// Regras do último slide e do rodapé — os dois controles de "Mais opções" do
// painel. Eles existiam na tela e não iam pro prompt: escolher "sem CTA" ou
// "só logo" não mudava nada no post gerado.
function blocoFecho(cta, mostrar) {
  const linhas = [];
  linhas.push(
    cta === false || cta === 0 || cta === '0'
      ? '- Último slide é fecho de marca SEM chamada de ação: {"wordmark": true} + frase de fechamento\n' +
        '  que encerra o raciocínio. Não peça pra comentar, salvar, seguir nem clicar em link.'
      : '- Último slide é sempre fecho de marca: {"wordmark": true} + frase de fechamento + CTA.'
  );
  if (mostrar === 'logo') {
    linhas.push('- Rodapé: NÃO escreva "handle" no post.json e deixe "rodape" vazio nos slides — a assinatura\n  é só o logo no topo ("logo": true nos slides que pedirem).');
  } else if (mostrar === 'ambos') {
    linhas.push('- Rodapé: use "handle" (@ do perfil) no post.json E "logo": true nos slides de abertura e fecho.');
  }
  return linhas.join('\n');
}

function blocoFotosDisponiveis(fotos) {
  if (!fotos.length) {
    return '- Nenhuma foto disponível nesta pasta — use fundos decorativos (mesh/glow ou CSS do próprio' +
      ' design system do cliente), NUNCA invente nome de arquivo de foto.';
  }
  return `- FOTOS JÁ BAIXADAS nesta pasta, prontas pra usar (licenciadas — Pexels/Unsplash), escolha as que\n` +
    `  fizerem sentido pro conteúdo, não precisa usar todas:\n` +
    fotos.map((f) => `  · ${f.arquivo}${f.alt ? ` — "${f.alt}"` : ''}${f.fotografo ? ` (foto de ${f.fotografo})` : ''}`).join('\n');
}

// Roda uma chamada isolada do agente com um conjunto restrito de tools.
// Devolve o texto final (última mensagem assistant) e o resultado bruto.
// `onEvento(msg)` — se passado, recebe CADA mensagem do stream do SDK, crua,
// assim que chega — é o que alimenta a barra de progresso ao vivo no painel
// (ver jobs.js e a rota SSE em index.js). Sem isso, a chamada é síncrona por
// dentro mas o painel não sabe de nada até o fim.
async function rodar({ cwd, systemPrompt, prompt, tools, timeoutMs = 180000, onEvento, model }) {
  const t0 = Date.now();
  let textoFinal = '';
  let erro = null;
  let toolsUsadas = [];

  const conta = contasLib.obterAtiva();
  // model explícito (o seletor do "Gerar carrossel") ganha da preferência
  // global (Configurações); sem os dois, omite a opção e o CLI usa o padrão
  // dele mesmo — não força nome de modelo nenhum à toa.
  const modeloFinal = model || preferenciasLib.obterModeloAtivo() || undefined;

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const q = query({
      prompt,
      options: {
        cwd,
        systemPrompt,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: [], // isolamento — ver comentário do arquivo
        tools,
        env: ambienteDaChamada(conta),
        ...(modeloFinal ? { model: modeloFinal } : {}),
        abortController: controlador,
      },
    });

    for await (const msg of q) {
      if (onEvento) { try { onEvento(msg); } catch { /* progresso nunca pode derrubar a geracao */ } }
      if (msg.type === 'assistant') {
        for (const b of msg.message.content) {
          if (b.type === 'text') textoFinal = b.text;
          if (b.type === 'tool_use') toolsUsadas.push(b.name);
        }
      }
      if (msg.type === 'result') {
        if (msg.is_error) {
          erro = msg.subtype === 'success' ? msg.result : (msg.errors || []).map((e) => e.trim()).join('; ');
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (erro) throw new Error(`agente: ${erro}`);
  return { texto: textoFinal, toolsUsadas, tempoMs: Date.now() - t0, conta, modelo: modeloFinal };
}

// ---- geração pro motor "estilo-editorial" (post.json) ----------------

async function gerarPostJson({ pastaAbs, briefing, objetivo, nSlides, marca, promptExtra, template, onEvento, semFoto, formato, cta, mostrar, modelo }) {
  const skillDir = path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'carrossel', 'estilo-editorial');
  const postmd = fs.readFileSync(path.join(skillDir, 'POST.md'), 'utf-8');
  const layoutsmd = fs.readFileSync(path.join(skillDir, 'LAYOUTS.md'), 'utf-8');
  const caminhoPost = path.join(pastaAbs, 'post.json');
  const caminhoLegenda = path.join(pastaAbs, 'legenda.md');

  const fotos = semFoto ? [] : await buscarFotosAutomatico(pastaAbs, briefing, 3);

  // Template escolhido manda na quantidade de slides — o seletor de slides do
  // painel é o palpite pra quando NÃO há template. Sem isto, escolher um
  // template de 1 slide (post de imagem única) com o seletor em 7 mandava duas
  // ordens contraditórias no mesmo prompt.
  //
  // "1" no seletor de slides (sem template) é o mesmo pedido, direto: post de
  // imagem única também é um post de verdade, não só um jeito de importar
  // referência de 1 print.
  const nTemplate = template && Array.isArray(template.slides) ? template.slides.length : 0;
  const nFinal = nTemplate || nSlides;
  const umQuadroSo = nTemplate === 1 || (!nTemplate && Number(nSlides) === 1);

  const sistema = `Você gera o CONTEÚDO de um ${umQuadroSo ? 'POST DE IMAGEM ÚNICA' : 'carrossel'} de Instagram no estilo editorial da Scault.

Escreva DOIS arquivos, em caminho absoluto, usando a tool Write:
1. ${caminhoPost} — o post.json (formato abaixo)
2. ${caminhoLegenda} — legenda pronta pra postar no Instagram/Facebook, com hashtags relevantes.
   A legenda NÃO repete a headline do slide 1 palavra por palavra — expande o gancho, não o repete.
Não explique nada fora dos arquivos — sem preâmbulo, sem markdown solto.

Regras de conteúdo:
- ${nFinal || 'Entre 6 e 10'} slides.${nTemplate ? ' Essa quantidade vem do template escolhido e não se discute.' : ''}${nFinal >= 15 ? ' Com essa quantidade, varie MUITO o modo de grade\n  (t-split/t-tri/mid) entre slides — repetir o mesmo layout em série longa cansa o leitor.' : ''}${
    umQuadroSo
      ? '\n- UM QUADRO SÓ: a mensagem inteira cabe neste slide. Sem desdobramento, sem "arraste",\n' +
        '  sem slide de fecho — o que não couber aqui vai pra legenda. Texto grande e âncora\n' +
        '  centrada funcionam aqui justamente porque não há slide seguinte pra combinar.'
      : ''
  }
- Objetivo declarado: ${objetivo || 'gerar autoridade'}.
- Formato: "${formato || '4:5'}" — escreva o campo "formato": "${formato || '4:5'}" no post.json.${
    formato === '9:16'
      ? ' Slide fica MAIS ALTO (1080x1920 em vez de 1080x1350) — em capa com foto e zoom,\n  recalcule o background-size/position pra caber a proporção nova sem cortar o sujeito.'
      : ''
  }
${promptExtra ? `- Instrução específica do usuário pra ESTE post (siga à risca): ${promptExtra}\n` : ''}- Prefira nós de texto semântico ({"texto":..., "destaque":[...], "tag":...}) em vez de escrever
  <span class="acc"> à mão — mais fácil de editar depois no painel.
- Ritmo: nunca duas classes de fundo idênticas seguidas (o motor avisa no stderr se isso acontecer,
  mas o objetivo é você já entregar variado).
${blocoFotosDisponiveis(fotos)}
${umQuadroSo ? '- Sem slide de fecho de marca: não existe "último slide" separado num post de um quadro só.' : blocoFecho(cta, mostrar)}
${template ? `\nSIGA A ESTRUTURA deste template como esqueleto (mesma quantidade de slides, mesmo layout por\nslide, mesmo modo de grade) — só o conteúdo é seu, a estrutura vem daqui:\n${JSON.stringify(template, null, 2)}\n` : ''}
## Nomes de argumento das primitivas (assinatura real do motor)

Use EXATAMENTE estes nomes em "args" — nome inventado derruba o render com TypeError. "?" = opcional.

${contratoLib.paraPrompt()}

${layoutsmd}

${postmd}`;

  const r = await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: briefing,
    tools: ['Write'],
    onEvento,
    model: modelo,
  });

  if (!fs.existsSync(caminhoPost)) {
    throw new Error(`agente respondeu mas não escreveu post.json (tools usadas: ${r.toolsUsadas.join(', ') || 'nenhuma'})`);
  }
  const post = JSON.parse(fs.readFileSync(caminhoPost, 'utf-8'));
  if (marca && marca.paleta) post.paleta = marca.paleta;
  if (formato) post.formato = formato; // reforça — nao depende do agente ter escrito certo
  fs.writeFileSync(caminhoPost, JSON.stringify(post, null, 2), 'utf-8');

  // legenda e obrigatoria pro publicar.js encontrar (postar-instagram.js exige
  // legenda.md na pasta) — se o agente esqueceu, nao trava a geracao por isso,
  // so entra um placeholder visivel que precisa ser preenchido antes de publicar.
  if (!fs.existsSync(caminhoLegenda)) {
    fs.writeFileSync(caminhoLegenda, '(legenda não gerada — escrever antes de publicar)\n', 'utf-8');
  }
  const legenda = fs.readFileSync(caminhoLegenda, 'utf-8');

  return { post, legenda, fotos, meta: r };
}

// ---- geração pro motor "carrossel-generico" (carrossel.html direto) --

async function gerarCarrosselGenerico({ pastaAbs, briefing, objetivo, nSlides, marca, raizProjeto, promptExtra, template, onEvento, semFoto, formato, cta, mostrar, modelo }) {
  const skillmd = fs.readFileSync(
    path.join(raizProjeto, '.claude', 'skills', 'carrossel', 'SKILL.md'),
    'utf-8'
  );
  let identidade = '(identidade do cliente não encontrada — usar bom senso e sinalizar isso na legenda)';
  if (marca.identidade_fonte) {
    const p = path.join(raizProjeto, marca.identidade_fonte);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      identidade = fs.readFileSync(p, 'utf-8').slice(0, 6000); // teto — nao estourar contexto com repo inteiro
    }
  }
  const caminhoHtml = path.join(pastaAbs, 'carrossel.html');
  const caminhoLegenda = path.join(pastaAbs, 'legenda.md');
  const fotos = semFoto ? [] : await buscarFotosAutomatico(pastaAbs, briefing, 3);
  const dimensoes = formato === '9:16' ? '1080x1920 (stories/reels)' : '1080x1350 (feed 4:5)';
  // "1" no seletor de slides pede POST DE IMAGEM ÚNICA — mesma ideia do
  // "umQuadroSo" do motor estilo-editorial (ver gerarPostJson acima): a
  // mensagem inteira cabe num quadro só, sem abertura/fechamento separados.
  const umQuadroSo = !template && Number(nSlides) === 1;

  const sistema = `Você gera um ${umQuadroSo ? 'POST DE IMAGEM ÚNICA' : 'carrossel'} de Instagram para o cliente "${marca.nome}".
Identidade visual deste cliente NÃO é a da Scault — segue o design system abaixo, à risca.

IMPORTANTE: escreva DOIS arquivos, em caminho absoluto, usando a tool Write:
1. ${caminhoHtml} — HTML com ${umQuadroSo ? 'o único <div class="slide">' : 'todos os slides como <div class="slide">'} (${dimensoes} cada), CSS inline,
   Google Fonts como única dependência externa. Ver "Padrão do carrossel" e "Passo 4" do guia abaixo.
2. ${caminhoLegenda} — legenda pronta pra postar (Instagram/Facebook), com hashtags.
Não explique nada fora dos arquivos.

Regras de conteúdo:
${umQuadroSo
    ? '- 1 slide — POST DE IMAGEM ÚNICA: a mensagem inteira cabe neste quadro. Sem abertura e\n  fechamento separados, sem "arraste pro lado" — o que não couber aqui vai pra legenda. Texto\n  direto e âncora centrada funcionam bem aqui, já que não há slide seguinte pra combinar.'
    : `- ${nSlides || 'Entre 5 e 10'} slides.${nSlides >= 15 ? ' Com essa quantidade, varie MUITO a composição visual entre slides —\n  repetir o mesmo layout em série longa cansa o leitor.' : ''}`}
- Objetivo declarado: ${objetivo || 'gerar autoridade'}.
${promptExtra ? `- Instrução específica do usuário pra ESTE post (siga à risca): ${promptExtra}\n` : ''}${blocoFotosDisponiveis(fotos)}
${umQuadroSo
    ? (cta === false || cta === 0 || cta === '0'
        ? '- Feche o raciocínio no próprio quadro, sem chamada de ação: nada de "comenta", "salva", "segue" ou link.'
        : '- A mensagem fecha nela mesma, com uma chamada de ação clara ao final do texto.')
    : (cta === false || cta === 0 || cta === '0'
        ? '- Último slide FECHA o raciocínio, sem chamada de ação: nada de "comenta", "salva", "segue" ou link.'
        : '- Último slide fecha com a marca e uma chamada de ação clara.')}
${mostrar === 'logo' ? '- Assinatura: só o logo/wordmark do cliente. Não escreva o @ do perfil em slide nenhum.'
    : mostrar === 'ambos' ? '- Assinatura: logo do cliente na abertura e no fecho, e o @ do perfil no rodapé de todos os slides.'
    : '- Assinatura: o @ do perfil no rodapé dos slides.'}
${template ? `- Use como referência de ARCO NARRATIVO (não de HTML/CSS — este cliente tem identidade própria):\n  ${template.slides ? template.slides.length : '?'} slides, progressão: ${(template.slides || []).map((s) => s.classe || 'slide').join(' → ')}\n` : ''}
## Identidade visual do cliente (fonte de verdade — usar estes tokens, não os da Scault)

${identidade}

## Guia de carrossel (SKILL.md do ScaultOS)

${skillmd}`;

  const r = await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: briefing,
    tools: ['Write'],
    onEvento,
    model: modelo,
    timeoutMs: 240000, // path generico escreve mais HTML na mao, sem primitiva pronta — da mais tempo
  });

  if (!fs.existsSync(caminhoHtml)) {
    throw new Error(`agente respondeu mas não escreveu carrossel.html (tools usadas: ${r.toolsUsadas.join(', ') || 'nenhuma'})`);
  }
  return {
    html: fs.readFileSync(caminhoHtml, 'utf-8'),
    legenda: fs.existsSync(caminhoLegenda) ? fs.readFileSync(caminhoLegenda, 'utf-8') : '',
    fotos,
    meta: r,
  };
}

// ---- geração a partir de uma PELE FIEL (template importado) -----------
//
// O caminho de modelagem. Vale pra QUALQUER marca — inclusive a Scault —,
// porque quando o template tem visual próprio é ele que manda, não o motor
// cadastrado na marca. É essa a regra do Sidney (31/08/2026): "quando
// gerarmos conteúdo para a marca a partir de um template que tem seu próprio
// estilo, deve ser 100% fiel ao template; a identidade visual da marca só
// entra se tiver algo como as infos de um perfil (foto, nome e @)".
//
// Aqui o agente escreve SÓ o corpo dos slides. Ele não vê o design-guide da
// marca, não recebe o SKILL.md e não escreve uma linha de CSS — o estilo já
// está decidido, veio da referência. O carrossel.html é montado pelo servidor
// (pele.escreverCarrossel), que injeta o CSS canônico, recusa classe
// inventada, filtra style inline fora da allowlist e preenche os nós
// data-perfil com o cadastro da marca.
async function gerarComPeleFiel({
  pastaAbs, briefing, objetivo, marca, promptExtra, template, onEvento, semFoto, modelo,
  erroAnterior, slidesAnteriores,
}) {
  const caminhoSlides = path.join(pastaAbs, '_slides.html');
  const caminhoLegenda = path.join(pastaAbs, 'legenda.md');
  apagarArquivo(caminhoSlides);

  // uma foto por slot de foto da pele (com folga), não um número fixo
  const slots = new Set();
  (template.slides || []).forEach((s) => {
    const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let m;
    while ((m = re.exec(s.html || ''))) slots.add(m[1]);
  });
  const fotos = semFoto ? [] : await buscarFotosAutomatico(pastaAbs, briefing, Math.min(Math.max(slots.size, 1), 6));

  const sistema = `Você escreve o CONTEÚDO de uma peça MODELADA a partir de uma referência visual.

A peça já tem forma: ela reproduz um carrossel de referência. Seu trabalho é trocar o texto (e
apontar as fotos), mantendo tudo o mais exatamente como está. O resultado tem que ser
indistinguível da referência em desenho, e completamente diferente dela em conteúdo.

Escreva DOIS arquivos, em caminho absoluto, com a tool Write:
1. ${caminhoSlides} — SÓ os <div class="slide">, na ordem, um colado no outro.
2. ${caminhoLegenda} — legenda pronta pra Instagram/Facebook, com hashtags. A legenda não repete
   a headline do slide 1 palavra por palavra — expande o gancho.
Não explique nada fora dos arquivos.

Conteúdo:
- Objetivo declarado: ${objetivo || 'gerar autoridade'}.
${promptExtra ? `- Instrução específica do usuário pra ESTA peça (siga à risca): ${promptExtra}\n` : ''}- Escrita direta, sem chavão de IA, sem travessão decorativo, sem emoji, sem corporativês.
${blocoFotosDisponiveis(fotos)}
- Troque o \`url('foto-NN.jpg')\` de cada slide pelo arquivo real que fizer sentido no slide.
  Nome de arquivo que não existe na pasta = slide sem foto no render.

${pele.regrasDeFidelidade(template)}

${pele.paraPrompt(template)}${
  erroAnterior
    ? `\n\n## Sua tentativa anterior foi RECUSADA pelo servidor\n\n${erroAnterior}\n\n` +
      'Corrija exatamente isso. O restante do que você escreveu estava certo — não recomece do zero.' +
      (slidesAnteriores ? `\n\nO que você escreveu antes:\n\n\`\`\`html\n${slidesAnteriores.slice(0, 12000)}\n\`\`\`` : '')
    : ''
}`;

  const r = await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: briefing,
    tools: ['Write'],
    onEvento,
    model: modelo,
    timeoutMs: 240000,
  });

  if (!fs.existsSync(caminhoSlides)) {
    throw new Error(`agente respondeu mas não escreveu _slides.html (tools usadas: ${r.toolsUsadas.join(', ') || 'nenhuma'})`);
  }
  const slidesHtml = fs.readFileSync(caminhoSlides, 'utf-8');

  if (!fs.existsSync(caminhoLegenda)) {
    fs.writeFileSync(caminhoLegenda, '(legenda não gerada — escrever antes de publicar)\n', 'utf-8');
  }
  return {
    slidesHtml,
    legenda: fs.readFileSync(caminhoLegenda, 'utf-8'),
    fotos,
    meta: r,
  };
}

// ---- readaptar copy pra um template novo (Fase 4) ---------------------

async function readaptarParaTemplate({ pastaAbs, postAtual, templateNovo }) {
  const postmd = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'carrossel', 'estilo-editorial', 'POST.md'),
    'utf-8'
  );
  const caminhoSaida = path.join(pastaAbs, 'post.json');
  const nAlvo = (templateNovo.slides || []).length;

  const sistema = `Você readapta a COPY de um post.json existente pra caber nos slots de um template novo,
sem perder o sentido do conteúdo original. Escreva o resultado em ${caminhoSaida}, caminho absoluto,
usando a tool Write. Não explique nada fora do arquivo.

Regra: o template novo define a ESTRUTURA (quantidade de slides, layout de cada um). Sua tarefa é
encaixar o conteúdo do post atual nessa estrutura — cortar, resumir ou expandir texto pra caber,
nunca inventar fato novo que não estava no post original.

O resultado tem EXATAMENTE ${nAlvo} slide${nAlvo > 1 ? 's' : ''} — o mesmo número do template.${nAlvo === 1
    ? ` Um slide só: este template é de POST DE IMAGEM ÚNICA, não de carrossel.
Condense o post inteiro numa mensagem só — a tese central, sem desdobramento, sem "arraste",
sem slide de fecho. O que não couber nesse quadro fica de fora, e tudo bem: o resto vai na legenda.`
    : ''}

## Nomes de argumento das primitivas (assinatura real do motor)

Use EXATAMENTE estes nomes em "args" — nome inventado derruba o render com TypeError. "?" = opcional.

${contratoLib.paraPrompt()}

${postmd}

## Post atual (conteúdo a preservar)
${JSON.stringify(postAtual, null, 2)}

## Template novo (estrutura a seguir)
${JSON.stringify(templateNovo, null, 2)}`;

  const r = await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: 'Readaptar a copy pro template novo.',
    tools: ['Write'],
  });

  if (!fs.existsSync(caminhoSaida)) {
    throw new Error('agente não escreveu o post.json readaptado.');
  }
  return { post: JSON.parse(fs.readFileSync(caminhoSaida, 'utf-8')), meta: r };
}

// ---- autocorreção quando o render falha (Fase 2, self-healing) --------
//
// Com 19 primitivas no vocabulário do estilo-editorial, o agente às vezes
// erra o nome de um argumento (ex: escreveu ficha(pares=...) em vez de
// ficha(linhas=...) — visto na prática). Em vez de travar o "Gerar
// carrossel" inteiro por isso, devolve o traceback real do Python pro
// agente corrigir só o que quebrou, sem tocar no resto do conteúdo.
async function corrigirPostJson({ pastaAbs, erro }) {
  const postmd = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'carrossel', 'estilo-editorial', 'POST.md'),
    'utf-8'
  );
  const caminhoPost = path.join(pastaAbs, 'post.json');
  const postAtual = fs.readFileSync(caminhoPost, 'utf-8');

  const sistema = `O post.json abaixo falhou ao renderizar, com este erro do motor Python:

${erro}

Corrija SÓ o que causou esse erro específico (nome de argumento errado, tipo errado, nó mal
formado) — não mude o conteúdo nem o sentido do post. Releia o contrato abaixo pra confirmar o
nome certo do argumento antes de escrever.

Escreva o post.json corrigido em EXATAMENTE este caminho absoluto, usando a tool Write: ${caminhoPost}
Não explique nada fora do arquivo.

## Nomes de argumento das primitivas (assinatura real do motor)

Esta é a assinatura de verdade, lida do build.py. "?" = opcional.

${contratoLib.paraPrompt()}

${postmd}

## post.json atual (com erro)
${postAtual}`;

  await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: 'Corrigir o erro de render.',
    tools: ['Write'],
    timeoutMs: 120000,
  });
}

// ---- edicao assistida DEPOIS de gerar -------------------------------
//
// O que faltava pro estudio ser um editor de verdade e nao so um gerador:
// depois que o post existe, poder pedir "encurta isso", "troca o angulo deste
// slide" sem regerar o carrossel inteiro e perder o resto do trabalho. Duas
// granularidades, as duas escrevendo num arquivo temporario que o servidor le
// e apaga — o agente nunca reescreve o post inteiro numa edicao pontual, que
// e como se perde conteudo aprovado.

// Reescreve UM texto (headline, paragrafo, CTA). Devolve string.
async function reescreverTexto({ pastaAbs, texto, instrucao, contexto }) {
  const caminho = path.join(pastaAbs, '_reescrita.txt');
  apagarArquivo(caminho);

  const sistema = `Você reescreve UM trecho de copy de um carrossel de Instagram.

Escreva SÓ o texto novo em ${caminho} (caminho absoluto, tool Write). Sem aspas em volta,
sem markdown, sem explicação, sem título — só a frase final, pronta pra entrar no slide.

Regras:
- Mantenha a língua do original (português do Brasil).
- Mantenha a ordem de grandeza do tamanho, a não ser que a instrução peça outra coisa.
- Não invente fato, número, nome de cliente nem promessa que não estava no original.
- Escrita direta, sem chavão de IA, sem travessão decorativo, sem emoji.
${contexto ? `
Contexto do post (só pra você entender o assunto, não copie daqui):
${String(contexto).slice(0, 1500)}` : ''}

Trecho original:
${texto}`;

  await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: instrucao || 'Deixe mais direto e mais forte, sem perder o sentido.',
    tools: ['Write'],
    timeoutMs: 90000,
  });

  if (!fs.existsSync(caminho)) throw new Error('o agente não escreveu a reescrita.');
  const novo = fs.readFileSync(caminho, 'utf-8').trim();
  apagarArquivo(caminho);
  if (!novo) throw new Error('a reescrita voltou vazia.');
  return novo;
}

// Reescreve UM slide inteiro do post.json (estilo-editorial). Devolve o objeto
// do slide — o servidor e quem encaixa no post, entao um erro do agente nunca
// corrompe os outros slides.
async function reescreverSlide({ pastaAbs, post, slideIndex, instrucao }) {
  const postmd = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'carrossel', 'estilo-editorial', 'POST.md'),
    'utf-8'
  );
  const caminho = path.join(pastaAbs, '_slide.json');
  apagarArquivo(caminho);
  const slideAtual = post.slides[slideIndex];

  const sistema = `Você reescreve UM slide de um carrossel que já existe.

Escreva em ${caminho} (caminho absoluto, tool Write) um JSON com UM objeto só: o slide novo,
no mesmo formato de um item de "slides" do post.json. Nada mais no arquivo — sem array em volta,
sem markdown, sem comentário.

Regras:
- É o slide ${slideIndex + 1} de ${post.slides.length}. Ele precisa continuar fazendo sentido
  na sequência: o slide anterior e o seguinte não vão mudar.
- Não invente fato, número ou promessa que não estava no post.
- Se a instrução não pedir mudança de layout, preserve a mesma estrutura de primitivas
  (mesmo "fn", mesma "classe", mesmo "fundo") — muda a copy, não a diagramação.

${postmd}

## Slide atual (o que reescrever)
${JSON.stringify(slideAtual, null, 2)}

## Post inteiro (contexto — NÃO reescreva os outros slides)
${JSON.stringify({ titulo: post.titulo, slides: post.slides.map((s, i) => (i === slideIndex ? '<<< ESTE >>>' : s)) }, null, 2).slice(0, 12000)}`;

  await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: instrucao || 'Reescreva este slide deixando a copy mais forte, sem mudar o layout.',
    tools: ['Write'],
    timeoutMs: 150000,
  });

  if (!fs.existsSync(caminho)) throw new Error('o agente não escreveu o slide novo.');
  const bruto = fs.readFileSync(caminho, 'utf-8');
  apagarArquivo(caminho);
  let novo;
  try {
    novo = JSON.parse(bruto);
  } catch (e) {
    throw new Error('o slide novo não é JSON válido: ' + e.message);
  }
  if (Array.isArray(novo)) novo = novo[0];
  if (!novo || typeof novo !== 'object' || !novo.corpo) {
    throw new Error('o slide novo veio sem "corpo" — descartado pra não quebrar o post.');
  }
  return novo;
}

// Reescreve UM slide do motor generico (HTML direto). Devolve o outerHTML.
async function reescreverSlideHtml({ pastaAbs, htmlAtual, slideIndex, total, instrucao }) {
  const caminho = path.join(pastaAbs, '_slide.html');
  apagarArquivo(caminho);

  const sistema = `Você reescreve UM slide de um carrossel de Instagram que já existe, em HTML.

Escreva em ${caminho} (caminho absoluto, tool Write) APENAS o elemento
<div class="slide">…</div> novo — um só, sem <html>, sem <style>, sem explicação.

Regras:
- É o slide ${slideIndex + 1} de ${total}. Os outros não vão mudar.
- Use SOMENTE classes CSS que já aparecem no slide atual — o <style> do arquivo não muda,
  então classe inventada sai sem estilo nenhum.
- Não troque nome de arquivo de imagem por um que não existe na pasta.
- Não invente fato, número ou promessa que não estava no slide.

## Slide atual
${htmlAtual}`;

  await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: instrucao || 'Reescreva este slide deixando a copy mais forte, mantendo o layout.',
    tools: ['Write'],
    timeoutMs: 150000,
  });

  if (!fs.existsSync(caminho)) throw new Error('o agente não escreveu o slide novo.');
  const novo = fs.readFileSync(caminho, 'utf-8').trim();
  apagarArquivo(caminho);
  if (!/<div[^>]*class="[^"]*slide/i.test(novo)) {
    throw new Error('o HTML novo não começa com <div class="slide"> — descartado.');
  }
  return novo;
}

// Reescreve o POST INTEIRO (estilo-editorial) — ao contrário de reescreverSlide,
// aqui texto, design (cor de destaque, fundo de cada slide) E layout (qual
// primitiva/"fn" cada slide usa) estão liberados, porque a mudança é
// deliberadamente pro carrossel inteiro, não uma ondulação silenciosa vinda de
// um pedido pensado pra um card só. Mantém a MESMA quantidade de slides — o
// servidor confere isso e descarta a reescrita se não bater, pra nunca deixar
// a trilha de PNGs dessincronizada do post.json.
async function reescreverPost({ pastaAbs, post, instrucao }) {
  const postmd = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'carrossel', 'estilo-editorial', 'POST.md'),
    'utf-8'
  );
  const caminho = path.join(pastaAbs, '_post_novo.json');
  apagarArquivo(caminho);

  const sistema = `Você reescreve um carrossel de Instagram que já existe — o POST INTEIRO, não um slide isolado.

Escreva em ${caminho} (caminho absoluto, tool Write) o post.json COMPLETO reescrito, no mesmo formato
do original, com EXATAMENTE ${post.slides.length} slides — a mesma quantidade, nem mais nem menos. Sem
markdown, sem comentário, só o JSON.

Regras:
- A instrução pode pedir mudança de TEXTO, de DESIGN (cor de destaque, fundo/paleta de cada slide) e de
  LAYOUT (qual primitiva/"fn" e "classe" cada slide usa) — os três estão liberados aqui, porque o pedido
  é pro carrossel inteiro. Se a instrução for só sobre texto, não mexa em design nem layout à toa.
- Não invente fato, número ou promessa que não estava no post.
- Mantenha a sequência fazendo sentido: abertura, desenvolvimento, fecho.
- Ritmo: nunca duas classes de fundo idênticas seguidas.

## Nomes de argumento das primitivas (assinatura real do motor)

Use EXATAMENTE estes nomes em "args" — nome inventado derruba o render com TypeError.

${contratoLib.paraPrompt()}

${postmd}

## Post atual (o que reescrever)
${JSON.stringify(post, null, 2).slice(0, 20000)}`;

  await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: instrucao || 'Deixe a copy mais forte em todos os slides, sem mudar layout nem design.',
    tools: ['Write'],
    timeoutMs: 300000, // reescreve N slides de uma vez — dá mais tempo que um slide só
  });

  if (!fs.existsSync(caminho)) throw new Error('o agente não escreveu o post novo.');
  const bruto = fs.readFileSync(caminho, 'utf-8');
  apagarArquivo(caminho);
  let novo;
  try {
    novo = JSON.parse(bruto);
  } catch (e) {
    throw new Error('o post novo não é JSON válido: ' + e.message);
  }
  if (!novo || !Array.isArray(novo.slides) || !novo.slides.length) {
    throw new Error('o post novo veio sem "slides" — descartado pra não quebrar o post.');
  }
  return novo;
}

// Reescreve o CARROSSEL INTEIRO do motor genérico (HTML direto) — diferente
// de reescreverSlideHtml, aqui o <style> compartilhado também pode mudar
// (cor, fonte, layout), porque a mudança vale pra todos os slides de uma vez.
// Uma reescrita de um slide isolado NÃO pode tocar o <style> (ele é
// compartilhado por todos) — daí a "IA no slide" ficar restrita a classes que
// já existem, e só esta rota (post inteiro) desbloquear design de verdade
// pro motor genérico.
async function reescreverCarrosselHtml({ pastaAbs, htmlAtual, total, instrucao }) {
  const caminho = path.join(pastaAbs, '_carrossel_novo.html');
  apagarArquivo(caminho);

  const sistema = `Você reescreve um carrossel de Instagram INTEIRO que já existe, em HTML — não um
slide isolado: pode mudar o <style> compartilhado (cor, fonte, layout) porque a mudança vale pra
todos os ${total} slides de uma vez.

Escreva em ${caminho} (caminho absoluto, tool Write) o arquivo HTML completo reescrito — mesma
estrutura de documento do original (<html>/<head>/<style>/<body> com um <div class="slide"> por
slide), com EXATAMENTE ${total} slides — a mesma quantidade, nem mais nem menos.

Regras:
- A instrução pode pedir mudança de TEXTO, DESIGN (cor, fonte, fundo — inclusive editar o <style>) e
  LAYOUT — os três estão liberados aqui. Se a instrução for só sobre texto, não mexa em design à toa.
- Não troque nome de arquivo de imagem por um que não existe na pasta.
- Não invente fato, número ou promessa que não estava no carrossel.
- Google Fonts como única dependência externa, se precisar trocar fonte.
- Não explique nada fora do arquivo.

## Carrossel atual (o que reescrever)
${htmlAtual}`;

  await rodar({
    cwd: pastaAbs,
    systemPrompt: sistema,
    prompt: instrucao || 'Deixe a copy mais forte em todos os slides, sem mudar o design.',
    tools: ['Write'],
    timeoutMs: 300000,
  });

  if (!fs.existsSync(caminho)) throw new Error('o agente não escreveu o carrossel novo.');
  const novo = fs.readFileSync(caminho, 'utf-8').trim();
  apagarArquivo(caminho);
  if (!/<div[^>]*class="[^"]*slide/i.test(novo)) {
    throw new Error('o HTML novo não tem nenhum <div class="slide"> — descartado.');
  }
  return novo;
}

module.exports = {
  rodar,
  gerarPostJson,
  gerarCarrosselGenerico,
  gerarComPeleFiel,
  readaptarParaTemplate,
  corrigirPostJson,
  reescreverTexto,
  reescreverSlide,
  reescreverSlideHtml,
  reescreverPost,
  reescreverCarrosselHtml,
  ambienteSemApiKey,
};
