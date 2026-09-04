// Extrator de referência — "modelar" um carrossel de terceiro.
//
// ATENÇÃO AO QUE MUDOU AQUI (e por quê). A primeira versão deste arquivo
// extraía de propósito só a GRAMÁTICA de layout: "não a marca, não a cor
// final… cor e fonte finais vêm da marca de quem publica". Mapeava tudo pro
// vocabulário do estilo-editorial da Scault (t-split, panel, mesh, vidro) e,
// no motor genérico, o template ainda era degradado a uma frase de prompt
// ("use como referência de arco narrativo, não de HTML/CSS").
//
// Resultado prático, visto na peça do Dias Advogados de 31/08/2026: a
// referência era foto cheia + headline em serif condensada, caixa alta, sem
// moldura nenhuma; a peça saiu em Inter, com kicker de kerning aberto, régua,
// logo no topo e @handle no rodapé. "Semelhante", não igual — e o Sidney foi
// claro: modelar é entregar IDÊNTICO, o que muda é o conteúdo.
//
// Então o modo padrão agora é `fiel`, e ele extrai o SISTEMA VISUAL inteiro
// como uma pele (CSS + esqueleto de slide), não como gramática:
//
//   1. Cor vem MEDIDA (paleta.py) de TODOS os slides, não chutada no print e
//      não só da capa — texto e fundo costumam morar em slides diferentes.
//   2. O agente escreve CSS de verdade, com a tipografia que ele identifica
//      (família, peso, caixa, kerning, entrelinha, escala em px sobre o
//      quadro real) — nada é traduzido pro vocabulário da Scault.
//   3. Convergência com o render de VERDADE, em loop e eixo a eixo, com
//      critério de igualdade (não mais "bateu razoavelmente"). Isto agora
//      roda dentro da própria importação: antes era uma rota separada que o
//      painel nunca chamava — código morto justamente na hora em que teria
//      pego o erro.
//
// Não existe mais "modo gramática" na importação de referência. Importar uma
// referência é modelar, e modelar é sair igual — é o motivo de o extrator
// existir. Salvar um post PRÓPRIO como modelo (templates.js#salvarComoModelo)
// continua sendo outra coisa, e essa sim é casca de estrutura: ali o visual
// já é o da Scault, então não há nada a preservar.
//
// As imagens de referência ficam guardadas junto do template (não vão pra
// pasta de nenhum post, não são publicadas): sem elas não há como reconferir
// a fidelidade depois.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const { rodar: rodarAgente } = require('./agente');
const pele = require('./pele');
const { RAIZ } = require('./marcas');

const SKILL_DIR = path.join(RAIZ, '.claude', 'skills', 'carrossel', 'estilo-editorial');
const RENDER_JS = path.join(SKILL_DIR, 'render.js');
const NODE_PATH_PLAYWRIGHT = 'C:/Users/sidne/node_modules';

const CATALOGO_FONTES = `Catálogo de apoio (Google Fonts) pra nomear o que você está vendo. Escolha pela FORMA da
letra, não pelo nome; se reconhecer a fonte exata da referência e ela existir no Google Fonts,
use a exata.

- serifada display/editorial: Playfair Display, Bodoni Moda, DM Serif Display, Prata, Lora,
  Libre Baskerville, Source Serif 4, Instrument Serif, Newsreader
- serifada condensada/pesada (headline em caixa alta, muito escura): Archivo (com width),
  Bitter, Zilla Slab, Roboto Serif (variável, tem width), Ultra, Alfa Slab One, Bevan
- grotesca/neutra: Inter, Roboto, Archivo, Work Sans, Manrope, Barlow
- grotesca condensada: Oswald, Archivo Narrow, Barlow Condensed, Roboto Condensed, Anton
- geométrica: Poppins, Montserrat, Outfit, Sora
- humanista/editorial sans: Public Sans, Source Sans 3, Figtree
- mono: JetBrains Mono, IBM Plex Mono, Space Mono
- manuscrita/marcador: Caveat, Permanent Marker, Kalam

Serifa pesada em caixa alta costuma pedir 'Roboto Serif' com font-stretch condensado ou
'Archivo' em peso 800+; se a referência tem serifa fina e alto contraste, é Playfair/Bodoni.`;

function medirPaleta(caminhoImagem) {
  return new Promise((resolve, reject) => {
    execFile(
      'python',
      [path.join(__dirname, 'paleta.py'), caminhoImagem, '--n', '6'],
      { encoding: 'utf-8', timeout: 20000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`paleta.py: ${stderr || err.message}`));
        resolve(JSON.parse(stdout));
      }
    );
  });
}

// Irmã do medirPaleta acima, mas pra DOCUMENTO de referência de marca (PDF,
// DOCX, TXT) em vez de imagem — usada pelo editor de identidade do painel
// (importar paleta de um manual de marca). PDF com várias páginas renderizadas
// demora mais que uma imagem só, daí o timeout maior.
function medirPaletaDocumento(caminhoArquivo) {
  return new Promise((resolve, reject) => {
    execFile(
      'python',
      [path.join(__dirname, 'paleta-documento.py'), caminhoArquivo, '--n', '14'],
      { encoding: 'utf-8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`paleta-documento.py: ${stderr || err.message}`));
        resolve(JSON.parse(stdout));
      }
    );
  });
}

// ---------------------------------------------------------------- modo fiel

const DIMENSOES = { '4:5': [1080, 1350], '9:16': [1080, 1920], '1:1': [1080, 1080] };

// Nomes de arquivo de imagem citados pela pele. Na conferência eles ainda não
// existem (a foto é escolhida por peça, não pela referência), então viram
// placeholder cinza — o que se compara aqui é tipografia, escala, âncora e
// scrim, não a foto.
function fotosCitadas(css, html) {
  const nomes = new Set();
  const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let m;
  for (const texto of [css || '', html || '']) {
    while ((m = re.exec(texto))) {
      const nome = m[1].trim();
      if (!/^(data:|https?:)/i.test(nome)) nomes.add(path.basename(nome));
    }
  }
  return [...nomes];
}

function criarPlaceholders(pastaAbs, nomes, [w, h]) {
  if (!nomes.length) return;
  const py = `
from PIL import Image
import sys
w, h = int(sys.argv[1]), int(sys.argv[2])
img = Image.new('RGB', (w, h), (118, 118, 118))
for nome in sys.argv[3:]:
    img.save(nome, quality=88) if nome.lower().endswith(('.jpg', '.jpeg')) else img.save(nome)
`;
  try {
    execFileSync('python', ['-c', py, String(w), String(h), ...nomes], {
      cwd: pastaAbs,
      encoding: 'utf-8',
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
  } catch {
    /* sem placeholder a conferência ainda roda — o fundo cai na cor de fallback do CSS */
  }
}

function renderizarPele(pastaAbs) {
  fs.copyFileSync(RENDER_JS, path.join(pastaAbs, 'render.js'));
  execFileSync('node', ['render.js'], {
    cwd: pastaAbs,
    encoding: 'utf-8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: NODE_PATH_PLAYWRIGHT },
  });
  const dir = path.join(pastaAbs, 'instagram');
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^slide-\d+\.png$/i.test(f)).sort()
        .map((f) => path.join(dir, f))
    : [];
}

// Separa o slides.html em itens do template. O agente marca cada slide com
// um comentário `<!-- slide N · papel: capa · notas: ... -->`; sem a marca,
// cai no corte por <div class="slide"> mesmo.
function fatiarSlides(html) {
  const marcas = [...html.matchAll(/<!--\s*slide\s*(\d+)([^>]*?)-->/gi)];
  const cortes = marcas.length
    ? marcas.map((m) => ({ i: m.index, fim: m.index + m[0].length, meta: m[2] || '' }))
    : [...html.matchAll(/<div[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi)]
        .map((m) => ({ i: m.index, fim: m.index, meta: '' }));

  return cortes.map((c, k) => {
    const ate = k + 1 < cortes.length ? cortes[k + 1].i : html.length;
    const trecho = html.slice(c.fim, ate).trim();
    const papel = (/papel\s*:\s*([^·|]+)/i.exec(c.meta) || [])[1];
    const notas = (/notas?\s*:\s*(.+)$/i.exec(c.meta.trim()) || [])[1];
    return {
      papel: papel ? papel.trim() : '',
      notas: notas ? notas.trim() : '',
      html: trecho,
    };
  }).filter((s) => s.html);
}

function lerSeExistir(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function montarTemplateFiel(pastaTrabalhoAbs, imagens) {
  const css = lerSeExistir(path.join(pastaTrabalhoAbs, 'pele.css')).trim();
  const html = lerSeExistir(path.join(pastaTrabalhoAbs, 'slides.html')).trim();
  if (!css) throw new Error('a extração não escreveu pele.css.');
  if (!html) throw new Error('a extração não escreveu slides.html.');

  let ficha = {};
  try {
    ficha = JSON.parse(lerSeExistir(path.join(pastaTrabalhoAbs, 'ficha-visual.json')) || '{}');
  } catch {
    ficha = {};
  }

  const slides = fatiarSlides(html);
  if (slides.length !== imagens.length) {
    throw new Error(
      `a pele saiu com ${slides.length} slide(s) para ${imagens.length} imagem(ns) de referência. ` +
      'Modelagem é fiel: um slide por imagem.'
    );
  }

  return {
    tipo: 'fiel',
    formato: ficha.formato || '4:5',
    fontes: ficha.fontes_html || '',
    css,
    slides,
    ficha_visual: ficha,
    _fidelidade: {
      slides_na_referencia: imagens.length,
      modo: 'fiel',
      nota:
        'Pele extraída da referência: tipografia, cor, escala, âncora e moldura vêm do print. ' +
        'Numa peça modelada só muda texto e foto.',
    },
  };
}

async function extrairPeleFiel({ imagens, paletas, pastaTrabalhoAbs, onEvento }) {
  const [w, h] = DIMENSOES['4:5'];
  const listaImagens = imagens.map((c, i) => `  slide ${i + 1}: ${c}`).join('\n');
  const listaPaletas = imagens
    .map((c, i) => `  slide ${i + 1}: ${JSON.stringify(paletas[i])}`)
    .join('\n');

  const sistema = `Você MODELA um carrossel de referência: reproduz o sistema visual dele com fidelidade,
pra que outra peça, com outro conteúdo, saia visualmente IDÊNTICA à referência.

Isto NÃO é "inspirado em", não é "no espírito de", não é adaptação pra outra marca. É reprodução.
Se ao final alguém puser a referência ao lado da peça nova e disser "parecido", falhou.

Leia TODAS as imagens abaixo com a tool Read — são os slides do MESMO carrossel, em ordem:
${listaImagens}

Os prints normalmente vêm do app: IGNORE a interface do Instagram que aparece neles — bolinhas
de paginação, setas laterais, barra de status, botão de curtir, borda arredondada do card. Isso
é o aplicativo, não a peça. Reproduzir bolinha de paginação em CSS é erro. Descontar essa
interface também importa pra escala: meça o texto contra o QUADRO da peça, não contra o print.

Paleta MEDIDA de verdade em cada slide (use isto, não chute olhando o print — o Instagram
comprime e distorce cor):
${listaPaletas}

## Escreva TRÊS arquivos (tool Write, caminho absoluto)

1. ${path.join(pastaTrabalhoAbs, 'ficha-visual.json')}
   O que você MEDIU na referência, em JSON:
   {
     "formato": "4:5" | "9:16" | "1:1",
     "fontes_html": "<link rel=\\"preconnect\\" ...><link href=\\"https://fonts.googleapis.com/css2?family=...\\" rel=\\"stylesheet\\">",
     "tipografia": {
       "titulo":  { "familia": "...", "peso": 800, "caixa": "uppercase|none", "tamanho_px": 92,
                    "entrelinha": 1.02, "kerning_em": -0.01, "alinhamento": "center|left|right" },
       "corpo":   { ... mesmos campos ... },
       "outras":  [ ... se houver terceira voz tipográfica ... ]
     },
     "cores": { "fundo": "#...", "texto": "#...", "destaque": "#..." },
     "tratamento_foto": "descrição do que a foto sofre: full-bleed? overlay? gradiente de onde
                         pra onde? filtro? textura de papel? nenhum?",
     "moldura": { "logo": false, "contador": false, "rodape": false, "regua": false, "tag": false,
                  "observacao": "o que EXISTE de moldura, e onde. Se não existe, false mesmo." },
     "perfil":  { "existe": false, "campos": ["avatar","nome","handle"], "onde": "em que slides
                  aparece e em que canto", "observacao": "só true se a referência mostra
                  IDENTIFICAÇÃO DE PERFIL — avatar redondo + nome + @, tipo print de tweet ou
                  cabeçalho de post. Logo solto NÃO é bloco de perfil." },
     "ancora": "onde o texto pousa no quadro em cada tipo de slide, em % do quadro",
     "observacoes": "o que mais define o visual e você não conseguiu encaixar acima"
   }

2. ${path.join(pastaTrabalhoAbs, 'pele.css')}
   O CSS COMPLETO da pele — é ele que vai ser usado, verbatim, em toda peça modelada.
   - \`.slide\` tem exatamente ${w}px de largura e a altura do formato que você identificou
     (${w}x${h} pra 4:5, 1080x1920 pra 9:16, 1080x1080 pra 1:1). \`box-sizing: border-box\`,
     \`overflow: hidden\`, \`position: relative\`.
   - Tipografia em PIXEL absoluto medido sobre esse quadro. Se na referência a headline ocupa
     um oitavo da altura do slide, ela tem ~${Math.round(h / 8)}px. Meça, não estime baixo:
     headline de capa em carrossel costuma ficar entre 70 e 130px nesse quadro.
   - Todo slide com foto declara TAMBÉM uma \`background-color\` de fallback (a foto de cada
     peça só entra depois; sem fallback a conferência renderiza branco).
   - Sem \`@media\`, sem unidade relativa ao viewport (vw/vh), sem variável que dependa de algo
     de fora. O arquivo tem que renderizar igual sozinho.
   - Só classes suas — não existe CSS herdado de lugar nenhum.

3. ${path.join(pastaTrabalhoAbs, 'slides.html')}
   Os ${imagens.length} slides, na ordem, cada um precedido de uma linha de marcação:
   <!-- slide 1 · papel: capa · notas: headline caixa alta sobre foto, âncora no terço inferior -->
   <div class="slide ...">…</div>
   Regras:
   - Um <div class="slide"> por imagem de referência. Exatamente ${imagens.length}.
   - Transcreva DENTRO deles o texto da própria referência (é gabarito de volume: quantos
     caracteres cabem ali). Não resuma, não melhore, não traduza.
   - Foto entra SEMPRE como \`style="background-image: url('foto-01.jpg')"\` INLINE no próprio
     elemento, nunca dentro do CSS — é o único ponto da peça que muda de uma modelagem pra
     outra, e por isso precisa ser trocável. Numere na ordem dos slides (\`foto-01.jpg\`,
     \`foto-02.jpg\`…); o arquivo não precisa existir agora. Enquadramento e escala
     (background-position / background-size) vão no CSS, que é onde eles são fixos.
   - Só HTML dos slides. Sem <html>, <head>, <style> ou <link>.

## Bloco de perfil — a única coisa que a marca vai poder trocar depois

Se (e SÓ se) a referência mostrar identificação de perfil — avatar + nome + @, como num print
de tweet, num cabeçalho de post ou numa assinatura de story — marque esses três nós com o
atributo \`data-perfil\`:

  <div class="perfil">
    <img class="avatar" data-perfil="avatar" src="_avatar.jpg" alt="">
    <div class="nome" data-perfil="nome">Nome Que Está Na Referência</div>
    <div class="arroba" data-perfil="handle">@arroba_da_referencia</div>
  </div>

Deixe o texto da referência dentro deles como gabarito — o servidor troca pelo nome e pelo @ de
quem for publicar. Este é o ÚNICO ponto da pele em que a identidade de outra marca entra depois.

Se a referência NÃO tem bloco de perfil, não invente um. Sem \`data-perfil\` nenhum, a peça
modelada sai sem nome, sem @ e sem logo — que é o certo quando a referência é assim.
Logo solto no canto não é bloco de perfil: se a referência tem um logo, ele é parte do desenho
dela e NÃO deve virar \`data-perfil\`; reproduza-o como o elemento gráfico que é (ou omita, se
for a marca de um terceiro que não pode ser reusada).

## O que "fiel" quer dizer, em detalhe

- FONTE: identifique a família pela forma da letra (serifada? condensada? contraste alto?
  terminal reto ou em gota?) e escolha a mais próxima que exista no Google Fonts.
${CATALOGO_FONTES}
- PESO e CAIXA: caixa alta é caixa alta. Se a referência está em maiúsculas, o CSS tem
  \`text-transform: uppercase\`. Se o traço é muito escuro, o peso é 800/900, não 600.
- ESCALA: meça em relação ao quadro. Uma headline que atravessa três linhas de ponta a ponta
  não é 48px num quadro de ${w}px.
- ÂNCORA: onde o bloco de texto pousa (topo/meio/base, esquerda/centro/direita) e até onde ele
  se estende. Reproduza a largura da caixa de texto, não só o alinhamento.
- FUNDO: foto cheia? overlay? gradiente? textura (papel amassado, grão, ruído)? cor chapada?
  Se é textura, reproduza com CSS (gradiente + ruído) ou registre como imagem de fundo.
- MOLDURA: se a referência NÃO tem logo, contador, rodapé, régua ou tag — a pele NÃO TEM.
  Este é o erro mais caro que existe aqui: acrescentar moldura "porque carrossel costuma ter"
  é o que faz uma peça modelada virar peça genérica. Não acrescente nada que você não vê.

Não escreva NADA fora dos três arquivos — sem preâmbulo, sem resumo, sem markdown solto.`;

  await rodarAgente({
    cwd: pastaTrabalhoAbs,
    systemPrompt: sistema,
    prompt: `Modelar este carrossel de ${imagens.length} slide(s): extrair a pele fiel.`,
    tools: ['Read', 'Write'],
    timeoutMs: 420000,
    onEvento,
  });

  return montarTemplateFiel(pastaTrabalhoAbs, imagens);
}

// Conferência com o render de verdade, em loop. É o passo que faltava: antes
// existia um `convergir` numa rota separada, que o painel nunca chamou, e que
// aceitava "bateu razoavelmente". Aqui o critério é igualdade eixo a eixo e a
// correção acontece dentro da própria importação.
async function conferirFidelidade({ pastaTrabalhoAbs, imagens, template, passes = 2, onEvento }) {
  const dims = DIMENSOES[template.formato] || DIMENSOES['4:5'];
  let atual = template;
  const historico = [];

  for (let passe = 1; passe <= passes; passe++) {
    const slidesHtml = atual.slides
      .map((s, i) => `<!-- slide ${i + 1} -->\n${s.html}`)
      .join('\n');
    fs.writeFileSync(
      path.join(pastaTrabalhoAbs, 'carrossel.html'),
      pele.montarCarrossel(atual, slidesHtml, { titulo: 'conferência de fidelidade' }),
      'utf-8'
    );
    criarPlaceholders(pastaTrabalhoAbs, fotosCitadas(atual.css, slidesHtml), dims);

    let renders;
    try {
      renders = renderizarPele(pastaTrabalhoAbs);
    } catch (e) {
      historico.push({ passe, erro: `render falhou: ${e.message}` });
      break; // sem render não há o que conferir; o template extraído ainda vale
    }
    if (!renders.length) {
      historico.push({ passe, erro: 'render não gerou PNG' });
      break;
    }

    const pares = imagens
      .map((ref, i) => `  slide ${i + 1}:  referência = ${ref}\n            render     = ${renders[i] || '(não gerado)'}`)
      .join('\n');

    const sistema = `Você confere a FIDELIDADE de uma pele extraída de um carrossel de referência.

Abra com a tool Read, aos pares, a referência e o render correspondente:
${pares}

O render usa cinza chapado no lugar das fotos (a foto de verdade entra por peça) e o texto é o
mesmo da referência. Então IGNORE a foto e IGNORE o conteúdo. Confira estes eixos, um por um,
em cada slide:

  1. família tipográfica — mesma classe de letra? (serifada/sem serifa, condensada ou não,
     contraste alto ou baixo)
  2. peso e caixa — mesma escuridão de traço, mesma caixa alta/baixa
  3. escala — o texto ocupa a mesma fração do quadro?
  4. entrelinha e kerning — mesmo número de linhas pro mesmo texto?
  5. âncora e largura — o bloco pousa no mesmo lugar e tem a mesma largura?
  6. cor de texto e tratamento de fundo (overlay/gradiente/textura)
  7. moldura — o render tem ALGUM elemento que a referência não tem (logo, contador, rodapé,
     régua, tag, "arraste"), ou falta algum que ela tem?
  8. nenhum texto estourando ou vazando o quadro

Se TODOS os eixos batem em TODOS os slides, responda exatamente OK, sem tocar em arquivo nenhum.

Se algum eixo não bate, corrija os arquivos (tool Write) e responda em uma frase o que mudou:
- ${path.join(pastaTrabalhoAbs, 'pele.css')}
- ${path.join(pastaTrabalhoAbs, 'slides.html')} (mesmas marcações \`<!-- slide N · papel: … -->\`)
Corrija a CAUSA no CSS — não empurre override inline, não acrescente classe nova sem estilo.
Eixo 7 é o mais importante: moldura a mais é o defeito que faz a peça parecer genérica.`;

    const r = await rodarAgente({
      cwd: pastaTrabalhoAbs,
      systemPrompt: sistema,
      prompt: `Conferir a fidelidade — passe ${passe} de ${passes}.`,
      tools: ['Read', 'Write'],
      timeoutMs: 420000,
      onEvento,
    });

    const texto = (r.texto || '').trim();
    const bateu = /^ok\b/i.test(texto);
    historico.push({ passe, veredito: bateu ? 'OK' : texto.slice(0, 400) });
    if (bateu) {
      atual = { ...atual, _fidelidade: { ...atual._fidelidade, conferencia: historico } };
      return { template: atual, historico, convergiu: true };
    }
    atual = { ...montarTemplateFiel(pastaTrabalhoAbs, imagens) };
  }

  atual = { ...atual, _fidelidade: { ...atual._fidelidade, conferencia: historico } };
  return { template: atual, historico, convergiu: false };
}

// ---------------------------------------------------------------- fachada

async function extrairTemplate({
  caminhoImagemAbs,
  caminhosImagens,
  pastaTrabalhoAbs,
  onEvento,
  passesConferencia = 2,
}) {
  if (!fs.existsSync(caminhoImagemAbs)) throw new Error(`imagem não encontrada: ${caminhoImagemAbs}`);
  fs.mkdirSync(pastaTrabalhoAbs, { recursive: true });

  const imagens = (caminhosImagens && caminhosImagens.length ? caminhosImagens : [caminhoImagemAbs])
    .filter((c) => fs.existsSync(c));

  // Paleta de TODOS os slides, não só da capa: o texto de um slide e o fundo
  // de outro são cores diferentes, e as duas fazem parte da pele.
  const paletas = await Promise.all(imagens.map((c) => medirPaleta(c)));

  const bruto = await extrairPeleFiel({ imagens, paletas, pastaTrabalhoAbs, onEvento });
  const { template, historico, convergiu } = await conferirFidelidade({
    pastaTrabalhoAbs, imagens, template: bruto, passes: passesConferencia, onEvento,
  });

  const caminhoTemplate = path.join(pastaTrabalhoAbs, 'template-extraido.json');
  fs.writeFileSync(caminhoTemplate, JSON.stringify(template, null, 2), 'utf-8');
  return {
    template,
    paletaMedida: paletas[0],
    paletas,
    caminhoTemplate,
    imagens,
    conferencia: { historico, convergiu },
  };
}

// Mantida por compatibilidade com a rota /api/extrator/convergir. A
// conferência de verdade agora roda dentro do extrairTemplate — esta função
// serve pra reconferir um template já salvo, quando se quer olhar de novo.
async function convergir({ pastaTrabalhoAbs, caminhoImagemOriginal, caminhoRenderAtual, templateAtual }) {
  const sistema = `Você conferiu um template extraído de: ${caminhoImagemOriginal}
Ele foi renderizado pelo motor de verdade em: ${caminhoRenderAtual}

Leia as duas imagens (tool Read) e compare eixo a eixo: família tipográfica, peso, caixa, escala,
entrelinha, âncora, largura do bloco, cor, tratamento de fundo e MOLDURA (logo/contador/rodapé/
régua que existam num e não no outro).

Modelagem é reprodução, não inspiração: "parecido" não passa. Se todos os eixos batem, responda
apenas OK. Se algum não bate, diga em uma frase qual eixo e em que slide.`;

  const r = await rodarAgente({
    cwd: pastaTrabalhoAbs,
    systemPrompt: sistema,
    prompt: 'Comparar referência e render.',
    tools: ['Read'],
    timeoutMs: 180000,
  });

  return {
    template: templateAtual,
    bateu: /^ok\b/i.test((r.texto || '').trim()),
    notaAgente: r.texto,
  };
}

module.exports = {
  medirPaleta,
  medirPaletaDocumento,
  extrairTemplate,
  conferirFidelidade,
  convergir,
  fotosCitadas,
  fatiarSlides,
  DIMENSOES,
};
