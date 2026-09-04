// Editor universal — funciona em QUALQUER carrossel.html, não importa se veio
// do motor estilo-editorial (build.py gera o HTML a partir do post.json) ou do
// carrossel-generico (o agente escreve o HTML direto). Abre o arquivo de
// verdade num Chrome headless e marca quatro tipos de alvo:
//
//   data-sl="{n}"               — no próprio .slide, 1-based. É a âncora de
//                                 toda regra de override por slide (fundo,
//                                 filtro de foto). Existe porque `.slide` não
//                                 tem id estável e :nth-of-type quebra quando
//                                 o render esconde slides pra capturar.
//   data-editid="s{slide}-{n}"  — elemento-FOLHA de texto (sem filho-elemento,
//                                 só texto/inline) — edição inline de texto
//   data-blk="{n}"              — elemento-BLOCO (item direto de um container
//                                 flex/grid dentro do slide) — unidade de
//                                 arraste. Mesma convenção de índice que o
//                                 build.py usa pra "posBlocos" no post.json.
//   data-txt="{n}"              — emitido pelo build.py, e só por ele: diz
//                                 qual nó {"texto":...} do post.json gerou
//                                 aquele elemento. É o que permite editar no
//                                 canvas e gravar no nó certo do post.json
//                                 sem adivinhar por contagem de DOM (o rodapé
//                                 e o cabeçalho também são folhas de texto,
//                                 então contar DOM erra sempre).
//
// Por que bloco e não folha pro arraste: tirar UM filho de um container flex
// pra position:absolute faz os irmãos colapsarem no vão que sobra — então o
// que se move é sempre o bloco (grupo) inteiro, nunca uma linha de texto
// isolada dentro dele.
//
// ---- OVERRIDES (o "Design" do painel) -----------------------------------
//
// Tamanho de fonte, cor, alinhamento, filtro de foto e cor de destaque NÃO
// são escritos como style inline em cada elemento: viram um único
// <style id="est-overrides"> no fim do <head>, gerado do zero a cada
// `aplicar`. Três motivos:
//   1. idempotente — aplicar duas vezes dá o mesmo arquivo;
//   2. reversível — tirar o override some com a regra, sem deixar sujeira
//      inline que o design system do cliente não previa;
//   3. sobrevive ao build.py — o motor editorial reescreve o carrossel.html
//      inteiro a cada render, então override inline morreria todo render. O
//      servidor guarda os overrides num sidecar (estudio-edicoes.json) e
//      reaplica DEPOIS do build.py, antes do render.js (ver motor.js).
//
// `extrair` devolve, numa linha só de JSON:
//   { head, campos, slidesHtml, slidesMeta, largura, altura }
// `head` é o <head> inteiro (fonte do Google + <style>), não só os <style> —
// sem o <link> das fontes a prévia do painel renderizava com fonte errada.
//
// IMPORTANTE (a regressão que quebrou o editor antes): este arquivo é copiado
// pra dentro da pasta de cada post só pra ela ficar portátil. O servidor
// SEMPRE executa a cópia canônica em servidor/lib/ (ver motor.js), nunca a da
// pasta do post — que envelhece no dia seguinte a qualquer mudança aqui.
//
// Uso (rodar com cwd = pasta do post):
//   NODE_PATH=... node editor-html.js extrair
//   NODE_PATH=... node editor-html.js aplicar <json {textos,posicoes,ordem,fundos,overrides}>
'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PLAYWRIGHT
  || 'C:\\Users\\sidne\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe';
const HTML_PATH = path.resolve(process.env.CARROSSEL_HTML || 'carrossel.html');
const MIN_LEN = 1;
const IGNORAR = ['SCRIPT', 'STYLE', 'SVG', 'BUTTON', 'IMG', 'BR', 'CANVAS', 'VIDEO'];

async function abrir() {
  if (!fs.existsSync(HTML_PATH)) {
    throw new Error('carrossel.html nao existe em ' + path.dirname(HTML_PATH)
      + ' — gere ou renderize o post antes de editar.');
  }
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });
  await page.goto('file:///' + HTML_PATH.replace(/\\/g, '/'));
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  return { browser, page };
}

// Regrava o arquivo a partir do DOM serializado. Preserva a AUSÊNCIA de
// doctype de propósito: os dois motores emitem HTML sem doctype, ou seja o
// Chrome renderiza em quirks mode — acrescentar <!doctype html> aqui mudaria
// o modo de layout e o PNG sairia diferente do que foi aprovado na tela.
async function regravar(page) {
  const html = await page.evaluate(() => {
    const dt = document.doctype ? '<!doctype html>\n' : '';
    return dt + document.documentElement.outerHTML;
  });
  fs.writeFileSync(HTML_PATH, html, 'utf-8');
}

// Roda dentro da página: marca slides, blocos e folhas de texto; devolve os
// campos com o estilo computado de cada um (o painel precisa saber o
// tamanho/cor ATUAL pra mostrar o controle na posição certa, em vez de um
// campo vazio que zera o valor real no primeiro toque).
const MARCADOR = function (cfg) {
  const MIN_LEN = cfg.MIN_LEN;
  const IGNORAR = cfg.IGNORAR;
  const out = [];
  document.querySelectorAll('.slide').forEach(function (slide, si) {
    slide.dataset.sl = String(si + 1);

    // ---- passo 1: blocos (item direto de um flex/grid dentro do slide) ----
    // Um nível só: depois de marcar os filhos de um container flex/grid como
    // bloco, não desce mais dentro deles — senão um .grp (que é ele mesmo
    // flex, pra empilhar título+corpo) marcaria título e corpo como blocos
    // separados, e a unidade de arraste deixaria de ser "o grupo inteiro".
    var CHROME_CLASSES = ['head', 'foot', 'vshead', 'vsfoot'];
    var blk = 0;
    var marcarBlocos = function (el) {
      if (CHROME_CLASSES.some(function (c) { return el.classList && el.classList.contains(c); })) return;
      var estilo = getComputedStyle(el);
      if (estilo.display === 'flex' || estilo.display === 'grid') {
        Array.from(el.children).forEach(function (filho) {
          if (IGNORAR.indexOf(filho.tagName) >= 0) return;
          if (!filho.dataset.blk) filho.dataset.blk = String(blk++);
        });
        return;
      }
      Array.from(el.children).forEach(marcarBlocos);
    };
    marcarBlocos(slide);

    // ---- passo 2: folhas de texto (edição inline) ----
    // Os editids são reatribuídos DO ZERO a cada varredura, de propósito. A
    // versão anterior só numerava quem ainda não tinha (`if (!el.dataset.editid)`)
    // e o contador não avançava nos que já tinham — então, assim que a árvore
    // mudava, os elementos novos recomeçavam do 0 e COLIDIAM com os antigos.
    // Dois elementos com o mesmo editid é pior do que id trocado: querySelector
    // pega o primeiro, e editar um gravava por cima do outro.
    var INLINE = ['SPAN', 'B', 'I', 'EM', 'STRONG', 'BR', 'A', 'U', 'SMALL', 'MARK'];
    slide.querySelectorAll('[data-editid]').forEach(function (el) { el.removeAttribute('data-editid'); });
    var idx = 0;
    var caminharTexto = function (el) {
      var filhos = Array.from(el.children).filter(function (c) { return IGNORAR.indexOf(c.tagName) < 0; });
      var soInline = filhos.every(function (c) { return INLINE.indexOf(c.tagName) >= 0; });
      // Filho com data-role é campo SEPARADO, mesmo sendo inline. O rodapé do
      // motor editorial é
      //   <div class="foot"><span data-role="handle">@scault.mkt</span>
      //                     <span data-role="rodape">Arraste →</span></div>
      // — dois spans inline, então a varredura parava no .foot e o painel
      // mostrava um campo só, com o texto colado: "@scault.mktArraste →".
      // Editar esse campo gravava a string colada por cima dos dois e destruía
      // o rodapé.
      var temPapel = filhos.some(function (c) { return c.dataset && c.dataset.role; });
      var texto = (el.innerText || el.textContent || '').trim();
      if (soInline && !temPapel && texto.length >= MIN_LEN && IGNORAR.indexOf(el.tagName) < 0) {
        if (!el.dataset.editid) el.dataset.editid = 's' + si + '-' + (idx++);
        var blocoPai = el.closest('[data-blk]');
        var cs = getComputedStyle(el);
        var caixa = el.getBoundingClientRect();
        var caixaSlide = slide.getBoundingClientRect();
        out.push({
          editid: el.dataset.editid,
          slide: si + 1,
          tag: el.tagName.toLowerCase(),
          classe: typeof el.className === 'string' ? el.className : '',
          // innerText respeita text-transform: um título em CSS uppercase
          // voltava GRITANDO e, salvo assim, gravava o texto gritado por cima
          // do original. `texto` é só pra exibir; `textoRaw` é o que se salva.
          texto: texto,
          textoRaw: (el.textContent || '').replace(/\s+/g, ' ').trim(),
          html: el.innerHTML,
          txtid: el.dataset.txt != null ? Number(el.dataset.txt) : null,
          role: el.dataset.role || null,
          blk: blocoPai ? blocoPai.dataset.blk : null,
          chrome: !!el.closest('.head, .foot, .vshead, .vsfoot'),
          estilo: {
            fontSize: Math.round(parseFloat(cs.fontSize) || 0),
            color: cs.color,
            textAlign: cs.textAlign,
            fontWeight: cs.fontWeight,
            lineHeight: cs.lineHeight,
            letterSpacing: cs.letterSpacing,
            textTransform: cs.textTransform,
          },
          caixa: {
            x: Math.round(caixa.left - caixaSlide.left),
            y: Math.round(caixa.top - caixaSlide.top),
            w: Math.round(caixa.width),
            h: Math.round(caixa.height),
          },
        });
        return;
      }
      filhos.forEach(caminharTexto);
    };
    Array.from(slide.children).forEach(caminharTexto);
  });
  return out;
};

// Info por slide que o painel usa pra saber quais controles fazem sentido
// (não adianta mostrar "filtro da foto" num slide que não tem foto).
const META_SLIDES = function () {
  var extrairUrl = function (valor) {
    var m = /url\((['"]?)(.*?)\1\)/.exec(valor || '');
    return m ? m[2] : '';
  };
  return Array.from(document.querySelectorAll('.slide')).map(function (slide, i) {
    var camada = slide.querySelector('.img i');
    var img = slide.querySelector('img');
    var cs = getComputedStyle(slide);
    // o style INLINE vem primeiro de propósito: depois de um override, o
    // computado do slide pode estar com background-image:none (posto pelo
    // próprio bloco de override) e a foto "sumiria" da leitura.
    var urlPropria = extrairUrl(slide.style.backgroundImage) || extrairUrl(cs.backgroundImage);
    var urlCamada = camada ? extrairUrl(getComputedStyle(camada).backgroundImage) : '';
    var fundoProprio = (!camada && !img && urlPropria)
      ? {
        url: urlPropria.replace(/^.*[\\/]/, ''),
        size: slide.style.backgroundSize || cs.backgroundSize || 'cover',
        pos: slide.style.backgroundPosition || cs.backgroundPosition || 'center',
      }
      : null;
    return {
      slide: i + 1,
      temFoto: !!(camada || img || fundoProprio),
      arquivoFoto: img ? img.getAttribute('src')
        : (urlCamada ? urlCamada.replace(/^.*[\\/]/, '') : (fundoProprio ? fundoProprio.url : '')),
      fundoProprio: fundoProprio,
      corFundo: cs.backgroundColor,
      classe: typeof slide.className === 'string' ? slide.className : '',
    };
  });
};

// ---------------------------------------------------------------- overrides

const PROPS_ELEMENTO = {
  fontSize: (v) => `font-size:${Number(v)}px`,
  color: (v) => `color:${limparCor(v)};-webkit-text-fill-color:${limparCor(v)};background:none`,
  textAlign: (v) => `text-align:${palavra(v)}`,
  fontWeight: (v) => `font-weight:${Number(v)}`,
  lineHeight: (v) => `line-height:${Number(v)}`,
  letterSpacing: (v) => `letter-spacing:${Number(v)}em`,
  textTransform: (v) => `text-transform:${palavra(v)}`,
  fontFamily: (v) => `font-family:${familia(v)}`,
  opacity: (v) => `opacity:${Number(v)}`,
  oculto: (v) => (v ? 'display:none' : ''),
};

// Só o que a UI oferece entra no CSS — nada de string livre do cliente virando
// declaração CSS (é o único lugar do estúdio onde texto do painel vira código
// que o Chrome executa na hora de renderizar a peça).
function limparCor(v) {
  const s = String(v).trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\)|[a-z]+)$/i.test(s) ? s : 'inherit';
}
function palavra(v) {
  const s = String(v).trim();
  return /^[a-z-]+$/i.test(s) ? s : 'inherit';
}
function familia(v) {
  const s = String(v).replace(/[^\w\s,'-]/g, '').trim();
  return s ? `'${s.split(',')[0].trim()}', sans-serif` : 'inherit';
}

function cssFiltroFoto(f) {
  if (!f) return '';
  const partes = [];
  const num = (x, d) => (x == null || Number.isNaN(Number(x)) ? d : Number(x));
  if (f.brilho != null && num(f.brilho, 1) !== 1) partes.push(`brightness(${num(f.brilho, 1)})`);
  if (f.contraste != null && num(f.contraste, 1) !== 1) partes.push(`contrast(${num(f.contraste, 1)})`);
  if (f.saturacao != null && num(f.saturacao, 1) !== 1) partes.push(`saturate(${num(f.saturacao, 1)})`);
  if (f.cinza) partes.push(`grayscale(${num(f.cinza, 1)})`);
  if (f.desfoque) partes.push(`blur(${num(f.desfoque, 0)}px)`);
  if (f.sepia) partes.push(`sepia(${num(f.sepia, 0)})`);
  return partes.join(' ');
}

function limparUrl(v) {
  const s = String(v || '').trim();
  // só caminho relativo simples ou data: — nunca javascript:, nunca aspas soltas
  if (!s || /["'()\\]/.test(s)) return '';
  if (/^(https?:|data:image\/)/i.test(s) || /^[\w./-]+$/.test(s)) return s;
  return '';
}

// Monta o <style id="est-overrides"> inteiro a partir do objeto de overrides.
// Devolve '' quando não tem nada — assim um post sem override nenhum sai com
// o mesmo HTML de sempre, byte a byte.
//
// `fundosProprios` diz, por slide, se a FOTO é o background do próprio
// `.slide` (o padrão que o motor genérico escreve) em vez de uma camada
// dedicada como `.img i` (o padrão do motor editorial). Faz diferença real:
// pôr `filter` no `.slide` filtraria o texto junto. Nesse caso a foto é
// repintada num `::before` com z-index:-1 e `isolation:isolate` no slide —
// que garante a ordem "fundo do slide < foto filtrada < todo o conteúdo",
// sem depender de o design do cliente ter usado z-index nas camadas dele.
function montarCssOverrides(ov, fundosProprios) {
  if (!ov || typeof ov !== 'object') return '';
  const regras = [];
  const proprios = new Map((fundosProprios || []).map((f) => [Number(f.slide), f]));

  // ---- fonte global (a "trocar minha fonte" do painel) ----
  if (ov.fonte && ov.fonte.titulo) {
    regras.push(`[data-sl] h1,[data-sl] h2,[data-sl] h3,[data-sl] .titulo,[data-sl] .headline{font-family:${familia(ov.fonte.titulo)} !important}`);
  }
  if (ov.fonte && ov.fonte.corpo) {
    regras.push(`[data-sl],[data-sl] p,[data-sl] li,[data-sl] span,[data-sl] div{font-family:${familia(ov.fonte.corpo)} !important}`);
    if (ov.fonte.titulo) {
      regras.push(`[data-sl] h1,[data-sl] h2,[data-sl] h3,[data-sl] .titulo,[data-sl] .headline{font-family:${familia(ov.fonte.titulo)} !important}`);
    }
  }

  // ---- cor de destaque ----
  // .acc é a classe do motor editorial (gradiente metálico com
  // background-clip:text); .est-acc é a que o painel cria quando o usuário
  // destaca uma frase no motor genérico. Recolorir exige matar o
  // background-clip, senão a cor nova fica invisível atrás do gradiente.
  if (ov.acento) {
    const c = limparCor(ov.acento);
    regras.push(`[data-sl] .acc,[data-sl] .est-acc{background:none !important;-webkit-background-clip:border-box !important;background-clip:border-box !important;-webkit-text-fill-color:${c} !important;color:${c} !important}`);
  } else {
    // sem cor escolhida, .est-acc ainda precisa de ALGUM destaque visível —
    // herda o mesmo tratamento da .acc do motor quando ela existe.
    regras.push(`[data-sl] .est-acc{font-weight:700}`);
  }

  // ---- por slide ----
  Object.entries(ov.slides || {}).forEach(([n, s]) => {
    if (!s || !/^\d+$/.test(String(n))) return;
    const sel = `[data-sl="${Number(n)}"]`;
    if (s.corFundo) regras.push(`${sel}{background-color:${limparCor(s.corFundo)} !important}`);
    if (s.corTexto) regras.push(`${sel},${sel} h1,${sel} h2,${sel} h3,${sel} p,${sel} li,${sel} span:not(.acc):not(.est-acc),${sel} div{color:${limparCor(s.corTexto)} !important;-webkit-text-fill-color:${limparCor(s.corTexto)} !important}`);
    const filtro = cssFiltroFoto(s.filtro);
    const proprio = proprios.get(Number(n));
    const urlFoto = proprio ? limparUrl(proprio.url) : '';

    if (urlFoto && (filtro || s.posFoto)) {
      regras.push(`${sel}{background-image:none !important;isolation:isolate}`);
      regras.push(`${sel}::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;`
        + `background-image:url('${urlFoto}');background-size:${proprio.size || 'cover'};`
        + `background-repeat:no-repeat;`
        + `background-position:${palavraPos(s.posFoto || proprio.pos || 'center')};`
        + (filtro ? `filter:${filtro};` : '')
        + '}');
    } else {
      if (filtro) {
        regras.push(`${sel} .img i,${sel} > img,${sel} img,${sel} [data-fundo-estudio]{filter:${filtro} !important}`);
      }
      if (s.posFoto) {
        regras.push(`${sel} .img i{background-position:${palavraPos(s.posFoto)} !important}`);
        regras.push(`${sel} img{object-position:${palavraPos(s.posFoto)} !important}`);
      }
    }
    if (s.escalaTexto && Number(s.escalaTexto) !== 1) {
      regras.push(`${sel} .txt,${sel} .grp{zoom:${Number(s.escalaTexto)}}`);
    }
  });

  // ---- por elemento ----
  Object.entries(ov.elementos || {}).forEach(([editid, props]) => {
    if (!props || !/^s\d+-\d+$/.test(String(editid))) return;
    const decls = Object.entries(props)
      .filter(([k, v]) => PROPS_ELEMENTO[k] && v !== '' && v != null)
      .map(([k, v]) => PROPS_ELEMENTO[k](v))
      .filter(Boolean)
      .map((d) => d.split(';').map((x) => `${x} !important`).join(';'));
    if (decls.length) regras.push(`[data-editid="${editid}"]{${decls.join(';')}}`);
  });

  return regras.length ? regras.join('\n') : '';
}

function palavraPos(v) {
  const s = String(v).trim();
  return /^[\w%\s.]+$/.test(s) ? s : 'center';
}

// ---------------------------------------------------------------- comandos

async function extrair() {
  const alvo = await abrir();
  try {
    const campos = await alvo.page.evaluate(MARCADOR, { MIN_LEN, IGNORAR });
    const slidesMeta = await alvo.page.evaluate(META_SLIDES);
    const head = await alvo.page.evaluate(() => document.head.innerHTML);
    const slidesHtml = await alvo.page.$$eval('.slide', (els) => els.map((el) => el.outerHTML));
    const dim = await alvo.page.evaluate(() => {
      const s = document.querySelector('.slide');
      if (!s) return { largura: 1080, altura: 1350 };
      return { largura: Math.round(s.offsetWidth) || 1080, altura: Math.round(s.offsetHeight) || 1350 };
    });
    await regravar(alvo.page); // persiste data-sl/data-editid/data-blk pro "aplicar" achar depois
    process.stdout.write(JSON.stringify(Object.assign({ head, campos, slidesHtml, slidesMeta }, dim)) + '\n');
  } finally {
    await alvo.browser.close();
  }
}

async function aplicar(edicoesJson) {
  const edicoes = JSON.parse(edicoesJson || '{}');
  const textos = edicoes.textos || [];
  const posicoes = edicoes.posicoes || [];
  const fundos = edicoes.fundos || [];
  const substituicoes = edicoes.substituicoes || [];
  const ordem = Array.isArray(edicoes.ordem) ? edicoes.ordem : null;

  const alvo = await abrir();
  try {
    // garante que os marcadores existem mesmo se o HTML foi regerado desde o
    // último extrair (build.py reescreve o arquivo do zero a cada render)
    await alvo.page.evaluate(MARCADOR, { MIN_LEN, IGNORAR });
    // tira o bloco de override ANTES de medir qualquer coisa: ele mesmo apaga
    // o background-image do slide, e ler por cima dele devolveria "sem foto"
    await alvo.page.evaluate(() => {
      const st = document.getElementById('est-overrides');
      if (st) st.remove();
    });

    await alvo.page.evaluate(function (ed) {
      ed.textos.forEach(function (t) {
        var el = document.querySelector('[data-editid="' + CSS.escape(t.editid) + '"]');
        if (!el) return;
        // html preserva <span class="acc"> e afins quando a edição veio do
        // canvas (contenteditable); texto puro é o caminho do painel lateral
        if (typeof t.html === 'string') el.innerHTML = t.html;
        else if (typeof t.texto === 'string') el.textContent = t.texto;
      });
      ed.posicoes.forEach(function (p) {
        // "blk" reseta por slide — sem escopar pelo slide, o querySelector
        // pegaria sempre o bloco 0 do PRIMEIRO slide do arquivo.
        var slideEl = document.querySelectorAll('.slide')[p.slide - 1];
        var el = slideEl && slideEl.querySelector('[data-blk="' + CSS.escape(String(p.blk)) + '"]');
        if (!el) return;
        if (p.x === null || p.y === null) {
          el.style.position = ''; el.style.left = ''; el.style.top = '';
          return;
        }
        el.style.position = 'absolute';
        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
      });
      ed.fundos.forEach(function (f) {
        var slideEl = document.querySelectorAll('.slide')[f.slide - 1];
        if (!slideEl || !f.arquivo) return;
        // 1) se o slide já tem camada de foto do motor (.img i), troca a fonte
        // dela — preserva o tratamento (grayscale/contraste/véu) do design system
        var camada = slideEl.querySelector('.img i');
        if (camada) { camada.style.backgroundImage = "url('" + f.arquivo + "')"; return; }
        // 2) se a foto é o background do PRÓPRIO slide (o jeito que o motor
        // genérico escreve a capa), troca ali mesmo. Sem este caso a troca
        // caía no passo 4 e criava uma camada NOVA por cima da antiga: a foto
        // certa aparecia, mas os filtros continuavam mirando a foto velha
        // (que ainda estava no background do slide) e o arquivo antigo ficava
        // pendurado no HTML pra sempre.
        var fundoAtual = slideEl.style.backgroundImage || getComputedStyle(slideEl).backgroundImage;
        if (fundoAtual && fundoAtual !== 'none' && fundoAtual.indexOf('url(') >= 0) {
          slideEl.style.backgroundImage = "url('" + f.arquivo + "')";
          if (!slideEl.style.backgroundSize) slideEl.style.backgroundSize = 'cover';
          if (!slideEl.style.backgroundPosition) slideEl.style.backgroundPosition = 'center';
          return;
        }
        // 3) senão, troca o primeiro <img> do slide
        var img = slideEl.querySelector('img');
        if (img) { img.setAttribute('src', f.arquivo); return; }
        // 4) último caso: cria uma camada de fundo cobrindo o slide
        var antiga = slideEl.querySelector('[data-fundo-estudio]');
        if (antiga) antiga.remove();
        var nova = document.createElement('div');
        nova.setAttribute('data-fundo-estudio', '1');
        nova.style.cssText = 'position:absolute;inset:0;z-index:0;background:url(\'' + f.arquivo + "') center/cover no-repeat";
        slideEl.insertBefore(nova, slideEl.firstChild);
      });
    }, { textos, posicoes, fundos });

    // troca de slide inteiro (reescrita assistida do motor generico) — feita
    // ANTES da reordenacao, pra "ordem" continuar falando dos indices atuais.
    if (substituicoes.length) {
      await alvo.page.evaluate(function (subs) {
        subs.forEach(function (sub) {
          var slides = document.querySelectorAll('.slide');
          var alvoEl = slides[sub.slide - 1];
          if (!alvoEl || !sub.html) return;
          var molde = document.createElement('div');
          molde.innerHTML = sub.html;
          var novo = molde.querySelector('.slide');
          if (novo) alvoEl.replaceWith(novo);
        });
      }, substituicoes);
    }

    if (ordem && ordem.length) {
      // ordem = índices ORIGINAIS na ordem final desejada; índice repetido
      // duplica o slide, índice ausente remove. Um contrato só cobre
      // reordenar, duplicar e apagar.
      await alvo.page.evaluate(function (ordem) {
        var slides = Array.from(document.querySelectorAll('.slide'));
        var pai = slides[0] && slides[0].parentNode;
        if (!pai) return;
        var novos = ordem.map(function (i) { return slides[i] && slides[i].cloneNode(true); })
          .filter(Boolean);
        slides.forEach(function (s) { s.remove(); });
        novos.forEach(function (s) {
          // editid/sl são únicos por posição de slide; recalculados no próximo
          // MARCADOR (que roda no extrair e no começo de todo aplicar)
          s.removeAttribute('data-sl');
          s.querySelectorAll('[data-editid]').forEach(function (el) { el.removeAttribute('data-editid'); });
          pai.appendChild(s);
        });
      }, ordem);
      // re-marca já, pra o CSS de override abaixo achar os data-sl novos
      await alvo.page.evaluate(MARCADOR, { MIN_LEN, IGNORAR });
    }

    // ---- bloco de overrides: sempre regerado do zero ----
    const metaSlides = await alvo.page.evaluate(META_SLIDES);
    const cssOverrides = montarCssOverrides(
      edicoes.overrides,
      metaSlides.filter((m) => m.fundoProprio).map((m) => ({ slide: m.slide, ...m.fundoProprio }))
    );
    await alvo.page.evaluate(function (dados) {
      var antigo = document.getElementById('est-overrides');
      if (antigo) antigo.remove();
      var linkAntigo = document.getElementById('est-fontes');
      if (linkAntigo) linkAntigo.remove();
      if (dados.urlFontes) {
        var link = document.createElement('link');
        link.id = 'est-fontes';
        link.rel = 'stylesheet';
        link.href = dados.urlFontes;
        document.head.appendChild(link);
      }
      if (dados.css) {
        var st = document.createElement('style');
        st.id = 'est-overrides';
        st.textContent = dados.css;
        document.head.appendChild(st);
      }
    }, { css: cssOverrides, urlFontes: urlGoogleFonts(edicoes.overrides) });

    await regravar(alvo.page);
    process.stdout.write('OK\n');
  } finally {
    await alvo.browser.close();
  }
}

// Monta a URL do Google Fonts pras famílias escolhidas no painel. Só nome de
// família alfanumérico entra — a URL vai virar <link> dentro do HTML da peça.
function urlGoogleFonts(ov) {
  if (!ov || !ov.fonte) return '';
  const nomes = [ov.fonte.titulo, ov.fonte.corpo]
    .filter(Boolean)
    .map((f) => String(f).split(',')[0].trim())
    .filter((f) => /^[A-Za-z0-9 ]{2,40}$/.test(f));
  const unicos = Array.from(new Set(nomes));
  if (!unicos.length) return '';
  return 'https://fonts.googleapis.com/css2?'
    + unicos.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;500;600;700;800;900`).join('&')
    + '&display=swap';
}

// Só despacha quando é o processo principal — motor.js roda este arquivo como
// subprocesso, mas os testes o importam pra checar a geração de CSS sem subir
// um Chrome.
if (require.main === module) {
  const comando = process.argv[2];
  const arg = process.argv[3];
  const falhar = (e) => { console.error(e && e.stack ? e.stack : String(e)); process.exit(1); };
  if (comando === 'extrair') extrair().catch(falhar);
  else if (comando === 'aplicar') aplicar(arg).catch(falhar);
  else { console.error('uso: node editor-html.js extrair | aplicar <json>'); process.exit(1); }
}

module.exports = { montarCssOverrides, urlGoogleFonts };
