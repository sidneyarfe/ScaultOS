// Ponte pro motor real: python build.py + node render.js, exatamente como a
// skill /carrossel já roda pelo terminal (SKILL.md, Passo 4). O estúdio não
// reimplementa nada disso — só chama os dois processos.
//
// REGRA QUE EXISTE POR CAUSA DE UM BUG REAL: o servidor executa SEMPRE a
// versão canônica do script (a que está na skill / em servidor/lib), com
// `cwd` na pasta do post — NUNCA a cópia que mora dentro da pasta do post.
// A cópia existe só pra pasta ficar portátil (dá pra zipar e rodar no
// terminal sem o estúdio). Executá-la era a causa de "o editor parou de
// funcionar": todo post criado antes de uma mudança no editor continuava
// rodando o código velho, e o contrato de retorno não batia mais com o que o
// painel esperava — falhava calado, com o canvas vazio.
//
// ---- pipeline de render (os dois motores) --------------------------------
//
//   estilo-editorial:  post.json --build.py--> carrossel.html
//                      --editor-html aplicar(overrides)--> carrossel.html
//                      --render.js--> instagram/*.png
//   carrossel-generico: carrossel.html (escrito pelo agente / editado direto)
//                      --editor-html aplicar(overrides)--> carrossel.html
//                      --render.js--> instagram/*.png
//
// O passo do meio existe porque o build.py reescreve o carrossel.html INTEIRO
// a cada render: qualquer ajuste fino de design feito no painel (tamanho de
// fonte, cor, filtro de foto) morreria a cada re-render se ficasse só no HTML.
// Os overrides moram no sidecar `estudio-edicoes.json`, dentro da pasta do
// post, e são reaplicados depois do build e antes do screenshot.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { RAIZ } = require('./marcas');
const { apagarArquivo } = require('./arquivos');

const SKILL_DIR = path.join(RAIZ, '.claude', 'skills', 'carrossel', 'estilo-editorial');
const NODE_PATH_PLAYWRIGHT = 'C:/Users/sidne/node_modules'; // mesma convenção da skill
const EDITOR_HTML_JS = path.join(__dirname, 'editor-html.js');
const BUILD_PY = path.join(SKILL_DIR, 'build.py');
const RENDER_JS = path.join(SKILL_DIR, 'render.js');
const LOGO_PADRAO = path.join(RAIZ, 'identidade', 'LOGO SCAULT.svg');
const ARQ_EDICOES = 'estudio-edicoes.json';

function envNode() {
  return { ...process.env, NODE_PATH: NODE_PATH_PLAYWRIGHT, PYTHONIOENCODING: 'utf-8' };
}

// Erro de subprocesso com o texto REAL (stderr + stdout), não só
// "Command failed" — é o que o agente de autocorreção precisa ler pra
// consertar o post.json, e o que o painel mostra pro usuário.
function erroDeProcesso(rotulo, e) {
  const partes = [];
  if (e.stderr) partes.push(String(e.stderr).trim());
  if (e.stdout) partes.push(String(e.stdout).trim());
  if (!partes.length && e.message) partes.push(e.message);
  const err = new Error(`${rotulo}: ${partes.join('\n').slice(0, 4000)}`);
  err.rotulo = rotulo;
  return err;
}

function rodar(rotulo, comando, args, pastaAbs, extra = {}) {
  try {
    return execFileSync(comando, args, {
      cwd: pastaAbs,
      encoding: 'utf-8',
      env: envNode(),
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      ...extra,
    });
  } catch (e) {
    throw erroDeProcesso(rotulo, e);
  }
}

// Copia (ou atualiza) as ferramentas dentro da pasta do post. Idempotente e
// barato — roda antes de qualquer operação, o que também CONSERTA posts
// antigos que ficaram com cópia velha na pasta.
function garantirFerramentas(pastaAbs, marca) {
  fs.mkdirSync(pastaAbs, { recursive: true });
  for (const [origem, destino] of [
    [BUILD_PY, 'build.py'],
    [RENDER_JS, 'render.js'],
    [EDITOR_HTML_JS, 'editor-html.js'],
  ]) {
    try {
      fs.copyFileSync(origem, path.join(pastaAbs, destino));
    } catch { /* pasta somente-leitura não impede rodar: executamos o canônico */ }
  }

  const logoDestino = path.join(pastaAbs, '_logo.svg');
  if (!fs.existsSync(logoDestino)) {
    const rel = marca && marca.logo;
    const abs = rel ? (path.isAbsolute(rel) ? rel : path.join(RAIZ, rel)) : LOGO_PADRAO;
    if (fs.existsSync(abs)) fs.copyFileSync(abs, logoDestino);
  }
}

function prepararPasta(pastaAbs, marca) {
  garantirFerramentas(pastaAbs, marca);
}

function escreverPost(pastaAbs, post) {
  fs.writeFileSync(path.join(pastaAbs, 'post.json'), JSON.stringify(post, null, 2), 'utf-8');
}

function lerPost(pastaAbs) {
  const p = path.join(pastaAbs, 'post.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function temPostJson(pastaAbs) {
  return fs.existsSync(path.join(pastaAbs, 'post.json'));
}

function listarPngs(pastaAbs) {
  const dir = path.join(pastaAbs, 'instagram');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort();
}

// ---- sidecar de edições de design --------------------------------------

function edicoesVazias() {
  return { overrides: { elementos: {}, slides: {}, acento: '', fonte: {}, guias: {} } };
}

function lerEdicoes(pastaAbs) {
  const p = path.join(pastaAbs, ARQ_EDICOES);
  if (!fs.existsSync(p)) return edicoesVazias();
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const ov = d.overrides || {};
    return {
      overrides: {
        elementos: ov.elementos || {},
        slides: ov.slides || {},
        acento: ov.acento || '',
        fonte: ov.fonte || {},
        // guias = margem de segurança e trava do canvas. Não vira CSS nenhum
        // no render (montarCssOverrides ignora): é preferência de edição, mas
        // mora aqui pra sobreviver a fechar o painel e voltar no post depois.
        guias: ov.guias || {},
      },
    };
  } catch {
    return edicoesVazias(); // sidecar corrompido nunca pode travar o render
  }
}

function escreverEdicoes(pastaAbs, edicoes) {
  fs.writeFileSync(path.join(pastaAbs, ARQ_EDICOES), JSON.stringify(edicoes, null, 2), 'utf-8');
}

function temOverrides(ed) {
  const ov = (ed && ed.overrides) || {};
  return !!(
    Object.keys(ov.elementos || {}).length ||
    Object.keys(ov.slides || {}).length ||
    ov.acento ||
    (ov.fonte && (ov.fonte.titulo || ov.fonte.corpo))
  ); // `guias` de propósito fora: mudar a margem do editor não obriga re-render
}

// Mescla um patch de overrides no sidecar. Valor null/'' remove a chave —
// é assim que o painel desfaz um ajuste sem precisar de uma rota "apagar".
function mesclarOverrides(pastaAbs, patch) {
  const atual = lerEdicoes(pastaAbs);
  if (!patch) return atual;
  const ov = atual.overrides;

  if (patch.acento !== undefined) ov.acento = patch.acento || '';
  if (patch.fonte) ov.fonte = { ...ov.fonte, ...patch.fonte };
  if (patch.guias) ov.guias = { ...ov.guias, ...patch.guias };

  for (const [id, props] of Object.entries(patch.elementos || {})) {
    if (props === null) { delete ov.elementos[id]; continue; }
    const alvo = { ...(ov.elementos[id] || {}) };
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === '') delete alvo[k];
      else alvo[k] = v;
    }
    if (Object.keys(alvo).length) ov.elementos[id] = alvo;
    else delete ov.elementos[id];
  }

  for (const [n, props] of Object.entries(patch.slides || {})) {
    if (props === null) { delete ov.slides[n]; continue; }
    const alvo = { ...(ov.slides[n] || {}) };
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === '') delete alvo[k];
      else alvo[k] = v;
    }
    if (Object.keys(alvo).length) ov.slides[n] = alvo;
    else delete ov.slides[n];
  }

  escreverEdicoes(pastaAbs, atual);
  return atual;
}

// Reordenar/duplicar/apagar slide muda a numeração em que os overrides estão
// ancorados (`s{slide0}-{n}` e a chave 1-based por slide). Sem este remap, o
// ajuste de design de um slide "pulava" pro slide que tomou o lugar dele.
function remapearOverridesPorOrdem(pastaAbs, ordem) {
  const atual = lerEdicoes(pastaAbs);
  const ov = atual.overrides;
  const elementos = {};
  const slides = {};
  ordem.forEach((antigo, novo) => {
    for (const [id, props] of Object.entries(ov.elementos || {})) {
      const m = /^s(\d+)-(\d+)$/.exec(id);
      if (m && Number(m[1]) === antigo) elementos[`s${novo}-${m[2]}`] = props;
    }
    const doSlide = (ov.slides || {})[String(antigo + 1)];
    if (doSlide) slides[String(novo + 1)] = doSlide;
  });
  atual.overrides = { ...ov, elementos, slides };
  escreverEdicoes(pastaAbs, atual);
  return atual;
}

// ---- render --------------------------------------------------------------

function temBlocoDeOverrideNoHtml(pastaAbs) {
  const p = path.join(pastaAbs, 'carrossel.html');
  if (!fs.existsSync(p)) return false;
  try {
    return fs.readFileSync(p, 'utf-8').includes('id="est-overrides"');
  } catch {
    return false;
  }
}

function aplicarNoHtml(pastaAbs, edicoes) {
  rodar('editor-html aplicar', 'node', [EDITOR_HTML_JS, 'aplicar', JSON.stringify(edicoes)], pastaAbs);
}

// Renderiza uma pasta que já tem carrossel.html (motor genérico) OU post.json
// (estilo-editorial — build.py gera o carrossel.html primeiro).
function renderizar(pastaAbs, opcoes = {}) {
  const comPost = opcoes.temPostJson !== undefined ? opcoes.temPostJson : temPostJson(pastaAbs);
  garantirFerramentas(pastaAbs, opcoes.marca);
  const saida = { logs: [], pngs: [] };

  // limpa PNGs antigos: se o post encurtou de 10 pra 7 slides, os 3 finais
  // ficavam pra trás e o painel continuava mostrando slides que não existem
  // mais (e o publicar mandava eles pro Instagram).
  const dir = path.join(pastaAbs, 'instagram');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (/^slide-\d+\.png$/i.test(f)) apagarArquivo(path.join(dir, f));
    }
  }

  if (comPost) {
    saida.logs.push({ etapa: 'build.py', texto: rodar('build.py', 'python', [BUILD_PY], pastaAbs) });
  }

  // reaplica o design fino DEPOIS do build (que reescreve o HTML do zero) e
  // ANTES do screenshot. Sem override nenhum, não roda — post que nunca foi
  // ajustado sai byte a byte igual ao de antes deste passo existir.
  //
  // A segunda condição existe por causa de um bug real: no motor genérico o
  // carrossel.html NÃO é regerado, então o bloco <style id="est-overrides">
  // da rodada anterior continua no arquivo. Limpar o último ajuste esvaziava
  // o sidecar, o `temOverrides` dava falso, o passo era pulado — e o PNG saía
  // com o ajuste que a pessoa acabou de remover (foto continuava em preto e
  // branco depois de "limpar ajustes deste slide").
  const edicoes = lerEdicoes(pastaAbs);
  if (temOverrides(edicoes) || temBlocoDeOverrideNoHtml(pastaAbs)) {
    aplicarNoHtml(pastaAbs, { overrides: edicoes.overrides });
  }

  saida.logs.push({ etapa: 'render.js', texto: rodar('render.js', 'node', [RENDER_JS], pastaAbs) });
  saida.pngs = listarPngs(pastaAbs);
  if (!saida.pngs.length) throw new Error('render terminou sem gerar nenhum PNG em instagram/.');
  return saida;
}

// Renderiza com autocorreção: se python build.py falhar (o agente errou o
// nome de um argumento de primitiva — visto na prática com 19 primitivas no
// vocabulário), devolve o traceback real pro agente corrigir só o que
// quebrou, e tenta de novo. `tentativas` limita o custo.
async function renderizarComCorrecao(pastaAbs, opcoes = {}) {
  const { agenteCorrigir, tentativas = 2, marca } = opcoes;
  let ultimo;
  for (let i = 0; i <= tentativas; i++) {
    try {
      return renderizar(pastaAbs, { temPostJson: true, marca });
    } catch (e) {
      ultimo = e;
      // só faz sentido pedir correção quando o erro veio do build.py (post.json
      // malformado). Erro do render.js é infra (Chrome, disco) — reenviar pro
      // agente só queima tempo.
      if (i >= tentativas || !agenteCorrigir || e.rotulo !== 'build.py') throw e;
      await agenteCorrigir({ pastaAbs, erro: e.message });
    }
  }
  throw ultimo;
}

// ---- editor universal (funciona pra QUALQUER carrossel.html) -------------

// Extrair sobe um Chrome (2-4s). Como o painel pede os campos no GET e o
// servidor precisa deles DE NOVO no PUT (pra achar o nó do post.json), sem
// cache toda edição pagava dois Chromes. A chave é o mtime do carrossel.html
// gravado pelo próprio extrair — qualquer build/render posterior invalida.
const _cacheCampos = new Map();

function mtimeHtml(pastaAbs) {
  try {
    return fs.statSync(path.join(pastaAbs, 'carrossel.html')).mtimeMs;
  } catch {
    return 0;
  }
}

function extrairTextosEditaveis(pastaAbs, marca) {
  garantirFerramentas(pastaAbs, marca);
  if (!fs.existsSync(path.join(pastaAbs, 'carrossel.html'))) {
    // pasta com post.json mas sem HTML ainda (post gerado e nunca renderizado)
    if (temPostJson(pastaAbs)) renderizar(pastaAbs, { temPostJson: true, marca });
  }
  const emCache = _cacheCampos.get(pastaAbs);
  if (emCache && emCache.mtime === mtimeHtml(pastaAbs)) {
    const dados = JSON.parse(JSON.stringify(emCache.dados)); // cópia: quem chama anota destino em cima
    dados.overrides = lerEdicoes(pastaAbs).overrides;
    const postCache = lerPost(pastaAbs);
    if (postCache) anotarMapeamentoPost(dados.campos, postCache);
    return dados;
  }
  const saida = rodar('editor-html extrair', 'node', [EDITOR_HTML_JS, 'extrair'], pastaAbs);
  const linhas = String(saida).split('\n').map((l) => l.trim()).filter(Boolean);
  const ultima = linhas[linhas.length - 1];
  let dados;
  try {
    dados = JSON.parse(ultima);
  } catch {
    throw new Error(`editor-html extrair devolveu saída inesperada: ${String(saida).slice(0, 400)}`);
  }
  if (!dados || !Array.isArray(dados.slidesHtml)) {
    throw new Error('editor-html extrair devolveu um contrato antigo (sem slidesHtml).');
  }
  _cacheCampos.set(pastaAbs, { mtime: mtimeHtml(pastaAbs), dados: JSON.parse(JSON.stringify(dados)) });
  dados.overrides = lerEdicoes(pastaAbs).overrides;
  const post = lerPost(pastaAbs);
  if (post) anotarMapeamentoPost(dados.campos, post);
  return dados; // { head, campos, slidesHtml, slidesMeta, largura, altura, overrides }
}

function aplicarEdicoesHtml(pastaAbs, edicoes, marca) {
  garantirFerramentas(pastaAbs, marca);
  if (edicoes.overrides) mesclarOverrides(pastaAbs, edicoes.overrides);
  if (Array.isArray(edicoes.ordem) && edicoes.ordem.length) remapearOverridesPorOrdem(pastaAbs, edicoes.ordem);

  const direto = {
    textos: edicoes.textos || [],
    posicoes: edicoes.posicoes || [],
    fundos: edicoes.fundos || [],
    substituicoes: edicoes.substituicoes || [],
  };
  if (Array.isArray(edicoes.ordem)) direto.ordem = edicoes.ordem;

  // No motor editorial o carrossel.html é derivado: escrever conteúdo nele
  // seria perder tudo no próximo build.py. Lá o conteúdo vai pro post.json
  // (index.js cuida disso) e esta função só serve pros overrides de design,
  // que o renderizar reaplica depois do build.
  const editorial = temPostJson(pastaAbs);
  const temAlgoDireto = direto.textos.length || direto.posicoes.length || direto.fundos.length
    || direto.substituicoes.length || direto.ordem;
  if (!editorial && temAlgoDireto) aplicarNoHtml(pastaAbs, direto);
  return renderizar(pastaAbs, { temPostJson: editorial, marca });
}

// ---- ponte campo do DOM <-> nó do post.json ------------------------------
//
// O motor editorial guarda o CONTEÚDO em post.json e só gera o HTML na hora
// do render. Editar no canvas e gravar no HTML seria perder a edição no
// próximo build. Então todo texto editado precisa achar o nó que o originou.
//
// Dois caminhos, nesta ordem:
//   1. data-txt (`txtid`) — emitido pelo próprio build.py pros nós
//      {"texto":...}. É exato: o índice é o mesmo contador que gerou o HTML.
//   2. casamento por texto — pros textos que chegam ao HTML como argumento
//      string de uma primitiva (rotulo(texto=...), ficha(linhas=[...])), que
//      não recebem data-txt. Compara o texto normalizado dentro do MESMO
//      slide; quem não casar fica sem mapeamento e o painel avisa que aquele
//      campo só dá pra editar via reescrita do slide.
//
// (A versão anterior correlacionava por índice de DOM. Errava sempre que o
// slide tinha rodapé ou cabeçalho — que também são folhas de texto —, e como
// a checagem era `nos.length === camposDoSlide.length`, na prática ela
// desistia calada e a edição no canvas não fazia nada.)

function nosSemanticosDoSlide(slide) {
  // mesma ordem de varredura do build.py: fn -> resolve(args) na ordem das
  // chaves; nó com "texto" não desce mais.
  const out = [];
  const anda = (no) => {
    if (no == null) return;
    if (Array.isArray(no)) { no.forEach(anda); return; }
    if (typeof no !== 'object') return;
    if (no.fn) { Object.values(no.args || {}).forEach(anda); return; }
    if ('texto' in no) { out.push(no); return; }
    Object.values(no.args || {}).forEach(anda);
  };
  anda(slide && slide.corpo);
  return out;
}

// Todo argumento string de primitiva, na mesma ordem de varredura — cada um
// vira um alvo endereçável por {caminho} dentro do slide.
function argumentosTextoDoSlide(slide) {
  const out = [];
  const anda = (no, caminho) => {
    if (no == null) return;
    if (Array.isArray(no)) { no.forEach((x, i) => anda(x, caminho.concat(i))); return; }
    if (typeof no !== 'object') return;
    if (no.fn) {
      Object.entries(no.args || {}).forEach(([k, v]) => {
        if (typeof v === 'string') out.push({ caminho: caminho.concat(['args', k]), valor: v });
        else anda(v, caminho.concat(['args', k]));
      });
      return;
    }
    if ('texto' in no) return;
    Object.entries(no.args || {}).forEach(([k, v]) => anda(v, caminho.concat(['args', k])));
  };
  anda(slide && slide.corpo, ['corpo']);
  return out;
}

function normalizar(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function anotarMapeamentoPost(campos, post) {
  const porSlide = new Map();
  campos.forEach((c) => {
    if (!porSlide.has(c.slide)) porSlide.set(c.slide, []);
    porSlide.get(c.slide).push(c);
  });

  porSlide.forEach((lista, nSlide) => {
    const slide = post.slides[nSlide - 1];
    if (!slide) { lista.forEach((c) => { c.destino = null; }); return; }
    const nos = nosSemanticosDoSlide(slide);
    const args = argumentosTextoDoSlide(slide);
    const usados = new Set();

    lista.forEach((c) => {
      if (c.chrome) { c.destino = { tipo: 'chrome' }; return; }
      if (c.txtid != null && nos[c.txtid]) {
        c.destino = { tipo: 'no', txtid: c.txtid };
        c.destaque = Array.isArray(nos[c.txtid].destaque) ? nos[c.txtid].destaque.slice() : [];
        return;
      }
      const alvo = args.findIndex((a, i) => !usados.has(i) && normalizar(a.valor) === normalizar(c.textoRaw));
      if (alvo >= 0) {
        usados.add(alvo);
        c.destino = { tipo: 'arg', caminho: args[alvo].caminho };
        return;
      }
      c.destino = null;
    });
  });
  return campos;
}

// Aplica uma lista de {editid, texto, html, destaque} no post.json, usando o
// mapeamento acima. Devolve quantos campos foram gravados e quais não deu.
function aplicarTextosNoPost(pastaAbs, campos, textos) {
  const post = lerPost(pastaAbs);
  if (!post) throw new Error('esta pasta não tem post.json.');
  anotarMapeamentoPost(campos, post);
  const porId = new Map(campos.map((c) => [c.editid, c]));
  const naoMapeados = [];
  let gravados = 0;

  textos.forEach((t) => {
    const campo = porId.get(t.editid);
    if (!campo || !campo.destino || campo.destino.tipo === 'chrome') { naoMapeados.push(t.editid); return; }
    const slide = post.slides[campo.slide - 1];
    if (!slide) { naoMapeados.push(t.editid); return; }

    const { texto, destaque } = separarDestaque(t);
    if (campo.destino.tipo === 'no') {
      const no = nosSemanticosDoSlide(slide)[campo.destino.txtid];
      if (!no) { naoMapeados.push(t.editid); return; }
      no.texto = texto;
      if (destaque) {
        // só as frases que ainda existem no texto novo — destaque órfão vira
        // aviso no stderr do build.py a cada render
        const vivas = destaque.filter((d) => d && texto.includes(d));
        if (vivas.length) no.destaque = vivas;
        else delete no.destaque;
      } else if (Array.isArray(no.destaque)) {
        const vivas = no.destaque.filter((d) => texto.includes(d));
        if (vivas.length) no.destaque = vivas;
        else delete no.destaque;
      }
      gravados++;
      return;
    }

    if (campo.destino.tipo === 'arg') {
      const cam = campo.destino.caminho;
      let ref = slide;
      for (let i = 0; i < cam.length - 1; i++) ref = ref[cam[i]];
      ref[cam[cam.length - 1]] = texto;
      gravados++;
    }
  });

  escreverPost(pastaAbs, post);
  return { post, gravados, naoMapeados };
}

// Converte o que veio do canvas (html com <span class="acc"> dentro) em
// {texto puro, destaque[]} — que é como o post.json representa destaque.
// Editar no canvas e destacar uma frase passa a funcionar no motor editorial
// sem o usuário precisar abrir o campo lateral e digitar a frase de novo.
function separarDestaque(t) {
  if (typeof t.html !== 'string' || !/<span[^>]*class="[^"]*(acc|est-acc)/i.test(t.html)) {
    return { texto: typeof t.texto === 'string' ? t.texto : '', destaque: t.destaque || null };
  }
  const destaque = [];
  const semTags = t.html
    .replace(/<span[^>]*class="[^"]*(?:acc|est-acc)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, (m, dentro) => {
      const puro = dentro.replace(/<[^>]+>/g, '');
      if (puro.trim()) destaque.push(puro);
      return puro;
    })
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  const texto = decodificarEntidades(semTags).replace(/\s+/g, ' ').trim();
  return { texto, destaque: destaque.map((d) => decodificarEntidades(d).replace(/\s+/g, ' ').trim()) };
}

function decodificarEntidades(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

module.exports = {
  prepararPasta,
  garantirFerramentas,
  escreverPost,
  lerPost,
  temPostJson,
  listarPngs,
  renderizar,
  renderizarComCorrecao,
  extrairTextosEditaveis,
  aplicarEdicoesHtml,
  aplicarTextosNoPost,
  anotarMapeamentoPost,
  nosSemanticosDoSlide,
  separarDestaque,
  lerEdicoes,
  escreverEdicoes,
  mesclarOverrides,
  remapearOverridesPorOrdem,
  SKILL_DIR,
  NODE_PATH_PLAYWRIGHT,
  ARQ_EDICOES,
};
