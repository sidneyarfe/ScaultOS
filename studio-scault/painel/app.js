// studio.scault — front-end vanilla, sem framework, sem build.
//
// ---- como a edição funciona (o que estava quebrado antes) ----------------
//
// A prévia NÃO é uma captura de tela: é um <iframe srcdoc> com o <head> e o
// outerHTML de verdade do slide, servidos por /api/editor-html. Três coisas
// tinham que estar certas pra isso aparecer como a peça final, e nenhuma
// estava:
//
//   1. o CSS — o servidor devolve o <head> inteiro no campo `head`, e o
//      painel lia `r.css` (que nunca existiu). O srcdoc saía com a string
//      "undefined" no lugar do CSS e o slide virava uma pilha de texto cru.
//   2. o <base href> — sem ele, `foto-banco-1.jpg` e `_logo.svg` (caminhos
//      relativos à pasta do post) eram pedidos em http://localhost:3000/ e
//      voltavam 404: prévia sem foto e sem logo.
//   3. o destino da edição — no motor editorial o conteúdo mora no post.json,
//      não no HTML. O painel tentava achar o nó certo contando elementos do
//      DOM, o que erra sempre que o slide tem rodapé/cabeçalho; como ele
//      comparava as contagens antes de gravar, na prática desistia calado e
//      digitar na prévia não fazia nada. Agora quem casa DOM <-> post.json é
//      o servidor (motor.js), pelo data-txt que o build.py emite.
//
// Divisão de responsabilidade desta versão: o painel manda o que mudou
// (texto, posição, override de design) e o SERVIDOR decide onde grava. O
// painel não conhece mais post.json.
'use strict';

const API = '';

const FONTES = ['', 'Inter', 'Inter Tight', 'Poppins', 'Montserrat', 'Playfair Display',
  'Merriweather', 'Lora', 'Libre Baskerville', 'Oswald', 'Bebas Neue', 'Anton',
  'Space Grotesk', 'DM Sans', 'Manrope', 'Sora', 'Outfit', 'Archivo', 'Plus Jakarta Sans'];

const MARGEM_PADRAO = 72; // px no espaço do slide (1080 de largura)
const ACENTO_PADRAO = '#8dccff'; // cor de destaque quando o usuário nunca escolheu uma (ver alternarDestaque)

// Zera o <body> da PRÉVIA. O carrossel.html é uma página feita pra ser aberta
// inteira no navegador, com todos os slides empilhados: o motor editorial usa
// `body{background:#000;display:flex;align-items:center;gap:28px;padding:28px}`
// e o genérico costuma pôr `.slide{margin:0 auto 48px}`. Isso é respiro ENTRE
// slides — não faz parte da peça (o render.js captura por elemento, então
// nada disso entra no PNG).
//
// Na prévia, que mostra um slide só dentro de um iframe do tamanho exato dele,
// esse respiro virava sobra: o padding de 28px empurrava o slide pra baixo e
// aparecia uma FAIXA BRANCA no topo do card — o fundo do próprio <iframe>.
// Neutralizar aqui deixa a prévia mais fiel ao PNG, não menos.
const RESET_PREVIA = '<style id="est-reset-previa">'
  + 'html,body{margin:0!important;padding:0!important;background:transparent!important;'
  + 'overflow:hidden!important;display:block!important;gap:0!important;width:auto!important;height:auto!important}'
  + '.slide{margin:0!important}'
  + '</style>';

const estado = {
  marcas: [],
  marcaSlug: 'scault',
  // post aberto
  pasta: null,
  token: null,
  slug: null,
  motor: null,
  pngs: [],
  legenda: '',
  slideAtual: 0,
  // dados do canvas (/api/editor-html)
  head: null,
  slidesHtml: null,
  campos: [],
  slidesMeta: [],
  largura: 1080,
  altura: 1350,
  // edições pendentes (só vão pro servidor no "Salvar")
  textosPendentes: new Map(),
  posicoesPendentes: new Map(),
  overridesPendentes: { elementos: {}, slides: {}, fonte: {}, guias: {} },
  overridesSalvos: { elementos: {}, slides: {}, acento: '', fonte: {}, guias: {} },
  sujo: false,
  // canvas
  editidSelecionado: null,
  blocoSelecionado: null,
  zoom: null,
  escala: 1,
  margem: MARGEM_PADRAO,
  travaAreaSegura: true,
  // ui
  imagensBusca: { fonte: 'banco', itens: [], selecionado: null },
  templateSelecionado: '',
  templatesDisponiveis: [],
  nSlides: 7,
  formato: '4:5',
  cta: 1,
  mostrar: 'perfil',
  modelo: '',
  canal: 'instagram',
  alvoIa: null,
  refsTemplate: [],
  contas: [],
  modeloAtivo: '',
};

const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
const ico = (nome, classe) => `<svg class="ico ${classe || ''}"><use href="#i-${nome}"></use></svg>`;

// capturado antes de qualquer mutação, pra "Fechar post" devolver o mesmo
// HTML (com o <strong>) em vez de reescrever a frase à mão em dois lugares.
const PREVIA_VAZIA_HTML = $('#preview-vazio') ? $('#preview-vazio').innerHTML : '';

async function api(metodo, caminho, corpo) {
  const opts = { method: metodo, headers: {} };
  if (corpo) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(corpo); }
  const r = await fetch(API + caminho, opts);
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `erro ${r.status}`);
  return dados;
}

async function apiUpload(caminho, form) {
  const r = await fetch(API + caminho, { method: 'POST', body: form });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `erro ${r.status}`);
  return dados;
}

function escaparHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// "1 slides" e "1 slide" nao sao a mesma frase — e agora um template de 1
// slide e coisa de verdade no estudio (post de imagem unica, importado de uma
// referencia com uma imagem so).
function rotuloSlides(n) {
  return n === 1 ? 'imagem única' : `${n} slides`;
}

function status(el, texto, erro) {
  const alvo = typeof el === 'string' ? $(el) : el;
  if (!alvo) return;
  alvo.textContent = texto || '';
  alvo.classList.toggle('erro', !!erro);
}

function marcarSujo(v) {
  estado.sujo = v;
  $('#pill-sujo').hidden = !v;
  $('#btn-desfazer-editar').hidden = !v;
}

function cssEscape(s) {
  return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
}

// ---------------------------------------------------------------- diálogos
//
// alert/confirm/prompt do navegador estão fora de uso aqui. Três motivos:
// aparecem com o chrome do Chrome ("localhost:3000 diz"), fora da identidade;
// travam a página inteira; e o alert de erro despejava o stack trace do
// subprocesso na tela — a pessoa via 15 linhas de caminho de arquivo em vez
// da frase que explica o problema.
//
// dialogo() devolve Promise: false quando cancela, true quando confirma, e a
// string digitada no modo "texto".

let _fecharDialogo = null;

function dialogo({ titulo, texto, detalhe, tipo = 'confirmar', okRotulo, perigo, valor, placeholder }) {
  const fundo = $('#modal-dialogo');
  $('#dialogo-titulo').textContent = titulo || (tipo === 'aviso' ? 'Aviso' : tipo === 'texto' ? 'Nome' : 'Confirmar');
  $('#dialogo-texto').textContent = texto || '';
  $('#dialogo-icone').className = 'dialogo-icone' + (perigo ? ' perigo' : tipo === 'aviso' ? ' alerta' : '');
  $('#dialogo-icone').innerHTML = ico(perigo ? 'lixo' : tipo === 'aviso' ? 'alerta' : 'check');
  $('#dialogo-ok').textContent = okRotulo || (tipo === 'aviso' ? 'Entendi' : 'Confirmar');
  $('#dialogo-ok').classList.toggle('btn--danger', !!perigo);
  $('#dialogo-ok').classList.toggle('btn--fill', !perigo);
  $('#dialogo-cancelar').hidden = tipo === 'aviso';

  const campo = $('#dialogo-campo');
  const input = $('#dialogo-input');
  campo.hidden = tipo !== 'texto';
  input.value = valor || '';
  input.placeholder = placeholder || '';

  const det = $('#dialogo-detalhe');
  det.hidden = !detalhe;
  det.open = false;
  $('#dialogo-detalhe-texto').textContent = detalhe || '';

  fundo.hidden = false;
  setTimeout(() => (tipo === 'texto' ? input : $('#dialogo-ok')).focus(), 30);

  return new Promise((resolve) => {
    const encerrar = (valorSaida) => {
      fundo.hidden = true;
      document.removeEventListener('keydown', aoTeclar, true);
      _fecharDialogo = null;
      resolve(valorSaida);
    };
    const confirmar = () => {
      if (tipo === 'texto') {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        return encerrar(v);
      }
      encerrar(true);
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); encerrar(tipo === 'aviso' ? true : false); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); confirmar(); }
    };
    document.addEventListener('keydown', aoTeclar, true);
    _fecharDialogo = () => encerrar(tipo === 'aviso' ? true : false);
    $('#dialogo-ok').onclick = confirmar;
    $('#dialogo-cancelar').onclick = () => encerrar(false);
    $('#dialogo-fechar').onclick = () => encerrar(tipo === 'aviso' ? true : false);
    fundo.onclick = (e) => { if (e.target === fundo) encerrar(tipo === 'aviso' ? true : false); };
  });
}

const aviso = (texto, opts) => dialogo({ ...opts, texto, tipo: 'aviso' });
const confirmar = (texto, opts) => dialogo({ ...opts, texto, tipo: 'confirmar' });
const pedirTexto = (texto, opts) => dialogo({ ...opts, texto, tipo: 'texto' });

// Erro de subprocesso vem com traceback e caminho absoluto. A primeira linha
// é a frase útil; o resto vai pro "ver detalhe técnico", fechado.
function partesDoErro(e) {
  const bruto = String((e && e.message) || e || 'erro desconhecido');
  const linhas = bruto.split('\n');
  let frase = linhas[0].replace(/^[\w-]+ (aplicar|extrair|build\.py|render\.js): /, '').trim();
  frase = frase.replace(/^Error:\s*/, '');
  const resto = linhas.slice(1).join('\n').trim();
  return { frase: frase || bruto, detalhe: resto || (linhas.length > 1 ? bruto : '') };
}

function avisoDeErro(texto, e) {
  const p = partesDoErro(e);
  return aviso(`${texto}\n\n${p.frase}`, { titulo: 'Não deu certo', detalhe: p.detalhe });
}

// ---------------------------------------------------------------- navegação

$$('.topo nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.topo nav button').forEach((b) => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    const alvo = btn.dataset.view;
    $$('.view').forEach((v) => (v.hidden = v.id !== `view-${alvo}`));
    if (alvo === 'acervo') carregarAcervo();
    if (alvo === 'templates') carregarTemplates();
    if (alvo === 'criar') requestAnimationFrame(ajustarEscalaCanvas);
  });
});

function irParaCriar() {
  $$('.topo nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.view === 'criar'));
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-criar'));
}

$$('#tabs-entrada button').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#tabs-entrada button').forEach((b) => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    $$('.aba-conteudo').forEach((a) => (a.hidden = a.dataset.aba !== btn.dataset.tab));
  });
});

$('#btn-recolher-briefing').addEventListener('click', () => {
  $('#col-briefing').hidden = true;
  $('#briefing-recolhido').hidden = false;
  requestAnimationFrame(ajustarEscalaCanvas);
});
$('#btn-abrir-briefing').addEventListener('click', () => {
  $('#col-briefing').hidden = false;
  $('#briefing-recolhido').hidden = true;
  requestAnimationFrame(ajustarEscalaCanvas);
});

$$('#painel-editar .tabs button[data-tab-editar]').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('#painel-editar .tabs button[data-tab-editar]').forEach((b) => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    const alvo = btn.dataset.tabEditar;
    $$('.aba-editar').forEach((a) => (a.hidden = a.dataset.tabEditarConteudo !== alvo));
    if (alvo === 'design') renderizarDesign();
    if (alvo === 'camadas') renderizarCamadas();
    if (alvo === 'legenda') carregarLegenda();
  })
);

// ---------------------------------------------------------------- marcas

function iniciais(nome) {
  return String(nome || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join('');
}

// O <img> do avatar some sozinho se a marca não tiver foto (o servidor
// responde 404) e o monograma que está atrás aparece — sem precisar de duas
// requisições nem de saber de antemão quem tem foto.
//
// O posicionamento é todo no CSS (.avatar{position:relative} + .avatar img
// {position:absolute;inset:0}). Fazer isso por style inline no onload, como
// estava, dava um bug de verdade: enquanto o CSS do .avatar não tinha
// position:relative, a img absoluta se ancorava no <body> e virava uma camada
// invisível cobrindo a tela inteira — os cliques do acervo iam todos pra ela.
function htmlAvatar(marca, classe) {
  const foto = marca.temAvatar
    ? `<img src="/api/marca-avatar/${encodeURIComponent(marca.slug)}" alt="" onerror="this.remove()">`
    : '';
  return `<span class="avatar ${classe || ''}">${escaparHtml(iniciais(marca.nome))}${foto}</span>`;
}

async function carregarMarcas() {
  estado.marcas = await api('GET', '/api/marcas');
  renderizarListaMarcas();
  selecionarMarca(estado.marcaSlug, true);
}

function renderizarListaMarcas() {
  $('#lista-marcas').innerHTML = estado.marcas
    .map((m) => `<div class="opcao-marca ${m.slug === estado.marcaSlug ? 'ativa' : ''}">
        <button class="opcao-marca-selecionar" data-slug="${escaparHtml(m.slug)}">
          ${htmlAvatar(m)}
          <span>${escaparHtml(m.nome)}<span class="sub">${m.tipo === 'agencia' ? 'agência' : 'cliente'} · ${escaparHtml(m.motor)}</span></span>
        </button>
        <button class="opcao-marca-editar" data-editar-slug="${escaparHtml(m.slug)}" title="Editar identidade">
          <svg class="ico"><use href="#i-editar"></use></svg>
        </button>
      </div>`)
    .join('');
  $$('#lista-marcas .opcao-marca-selecionar').forEach((b) =>
    b.addEventListener('click', () => {
      selecionarMarca(b.dataset.slug);
      $('#lista-marcas').hidden = true;
    })
  );
  $$('#lista-marcas .opcao-marca-editar').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      $('#lista-marcas').hidden = true;
      abrirModalIdentidade(b.dataset.editarSlug);
    })
  );
}

function selecionarMarca(slug, silencioso) {
  const marca = estado.marcas.find((m) => m.slug === slug) || estado.marcas[0];
  if (!marca) return;
  estado.marcaSlug = marca.slug;
  $('#avatar-marca-atual').outerHTML = htmlAvatar(marca).replace('class="avatar ', 'id="avatar-marca-atual" class="avatar ');
  $('#nome-marca-atual').textContent = marca.nome;
  renderizarListaMarcas();

  const partes = [`<span class="chip-marca">motor: ${escaparHtml(marca.motor)}</span>`];
  if (marca.tipo === 'cliente' && !(marca.instagram && marca.instagram.sufixo_env)) {
    partes.push(`<span class="chip-marca aviso">${ico('alerta')}sem conta própria</span>`);
  }
  $('#aviso-marca').innerHTML = partes.join(' ');
  if (!silencioso) carregarContaDestino();
}

$('#btn-abrir-marcas').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#lista-marcas').hidden = !$('#lista-marcas').hidden;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#seletor-marca')) $('#lista-marcas').hidden = true;
});

// ---------------------------------------------------------------- ingestão

$('#btn-ingerir-link').addEventListener('click', async () => {
  const url = $('#input-link').value.trim();
  if (!url) return;
  status('#status-link', 'lendo…');
  try {
    const r = await api('POST', '/api/ingest/link', { url, pasta: 'studio-scault/acervo/_referencias-soltas' });
    $('#briefing').value += (($('#briefing').value ? '\n\n' : '') + `[Referência — ${r.titulo}]\n${r.resumo}`);
    status('#status-link', `OK — "${r.titulo}"`);
  } catch (e) {
    status('#status-link', 'erro: ' + e.message, true);
  }
});

$('#input-audio').addEventListener('change', async () => {
  const arq = $('#input-audio').files[0];
  if (!arq) return;
  status('#status-audio', 'transcrevendo (pode levar alguns minutos)…');
  const form = new FormData();
  form.append('audio', arq);
  form.append('pasta', 'studio-scault/acervo/_referencias-soltas');
  try {
    const r = await apiUpload('/api/ingest/audio', form);
    $('#briefing').value += (($('#briefing').value ? '\n\n' : '') + `[Transcrição de áudio, ${r.duracao}s]\n${r.texto}`);
    status('#status-audio', `OK — ${r.duracao}s transcritos`);
  } catch (e) {
    status('#status-audio', 'erro: ' + e.message, true);
  }
});

let mediaRecorder, chunksAudio = [];
$('#btn-gravar').addEventListener('click', async () => {
  const rotulo = $('#btn-gravar').querySelector('span');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    rotulo.textContent = 'Gravar';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksAudio = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => chunksAudio.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksAudio, { type: 'audio/webm' });
      status('#status-audio', 'transcrevendo…');
      const form = new FormData();
      form.append('audio', blob, 'gravacao.webm');
      form.append('pasta', 'studio-scault/acervo/_referencias-soltas');
      try {
        const r = await apiUpload('/api/ingest/audio', form);
        $('#briefing').value += (($('#briefing').value ? '\n\n' : '') + `[Áudio gravado, ${r.duracao}s]\n${r.texto}`);
        status('#status-audio', `OK — ${r.duracao}s transcritos`);
      } catch (e) {
        status('#status-audio', 'erro: ' + e.message, true);
      }
    };
    mediaRecorder.start();
    rotulo.textContent = 'Parar';
  } catch (e) {
    status('#status-audio', 'sem acesso ao microfone: ' + e.message, true);
  }
});

$('#input-print').addEventListener('change', async () => {
  const arq = $('#input-print').files[0];
  if (!arq) return;
  status('#status-print', 'lendo imagem…');
  const form = new FormData();
  form.append('imagem', arq);
  form.append('pasta', 'studio-scault/acervo/_referencias-soltas');
  try {
    const r = await apiUpload('/api/ingest/print', form);
    $('#briefing').value += (($('#briefing').value ? '\n\n' : '') + `[Imagem de referência anexada: ${r.caminhoImagem}]`);
    status('#status-print', 'OK — anexada ao briefing');
  } catch (e) {
    status('#status-print', 'erro: ' + e.message, true);
  }
});

// ---------------------------------------------------------------- segmentados

function ligarSegmentado(id, aoMudar) {
  const grupo = $(id);
  if (!grupo) return;
  $$('button', grupo).forEach((btn) =>
    btn.addEventListener('click', () => {
      $$('button', grupo).forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      aoMudar(btn.dataset.v);
    })
  );
}
ligarSegmentado('#seg-slides', (v) => { estado.nSlides = Number(v); });
ligarSegmentado('#seg-formato', (v) => { estado.formato = v; });
ligarSegmentado('#seg-cta', (v) => { estado.cta = Number(v); });
ligarSegmentado('#seg-mostrar', (v) => { estado.mostrar = v; });
ligarSegmentado('#seg-modelo', (v) => { estado.modelo = v; });
ligarSegmentado('#seg-canal', (v) => { estado.canal = v; carregarContaDestino(); });

// ---------------------------------------------------------------- template picker

async function carregarTemplatePicker() {
  try {
    estado.templatesDisponiveis = await api('GET', '/api/templates');
  } catch {
    estado.templatesDisponiveis = [];
  }
}

// Selo do template. Os dois tipos não fazem a mesma coisa e escolher errado
// muda o resultado inteiro: "fiel" reproduz o visual da referência importada
// (a marca só entra no bloco de perfil, se houver); "casca" é estrutura de um
// post próprio, vestida com a identidade de quem publica.
function seloTemplate(t) {
  if (t.tipo !== 'fiel') return '';
  return `<span class="selo-fiel" title="Peça sai visualmente idêntica à referência importada. A marca só entra no bloco de perfil.">fiel${t.temPerfil ? ' · perfil' : ''}</span>`;
}

function abrirModalTemplates() {
  const grade = $('#grade-templates-modal');
  const lista = estado.templatesDisponiveis || [];
  grade.innerHTML =
    `<div class="template-card" data-template="">
       <div class="template-auto">Automático</div>
       <div class="nome">Automático</div><div class="qtd">o agente decide a estrutura</div>
     </div>` +
    lista
      .map((t) => `<div class="template-card" data-template="${escaparHtml(t.nome)}">
        <img src="/api/arquivo?caminho=${encodeURIComponent(`studio-scault/templates/${t.nome}.png`)}" onerror="this.style.display='none'">
        <div class="nome">${escaparHtml(t.nome)} ${seloTemplate(t)}</div><div class="qtd">${rotuloSlides(t.totalSlides)}</div>
      </div>`)
      .join('');
  $$('.template-card', grade).forEach((card) =>
    card.addEventListener('click', () => {
      estado.templateSelecionado = card.dataset.template;
      $('#template-escolhido-label').textContent = card.dataset.template || 'Automático';
      $('#modal-templates').hidden = true;
    })
  );
  $('#modal-templates').hidden = false;
}

$('#btn-abrir-templates').addEventListener('click', abrirModalTemplates);
$('#fechar-modal-templates').addEventListener('click', () => { $('#modal-templates').hidden = true; });

// ---------------------------------------------------------------- log ao vivo ("o que a IA está fazendo")
//
// No lugar de uma barra crua, cada evento do SDK (ver logDoEvento no
// servidor) vira uma linha aqui — ferramenta usada, arquivo escrito, trecho
// do que o agente está "pensando". `sincronizar` recebe o log INTEIRO a cada
// evento do SSE (o servidor não manda só o incremento), então cada painel
// lembra quantas linhas já desenhou pra não redesenhar tudo do zero.
const ICONES_LOG = {
  etapa: 'seta-dir', sistema: 'render', ferramenta: 'ajustar', texto: 'ia', ok: 'check', erro: 'alerta', login: 'link',
};
const refsLog = {};

function painelLog(sel) {
  return typeof sel === 'string' ? $(sel) : sel;
}

function limparLog(sel) {
  const el = painelLog(sel);
  if (el) el.innerHTML = '';
  refsLog[sel] = 0;
}

function sincronizarLog(sel, log) {
  if (!log) return;
  const el = painelLog(sel);
  if (!el) return;
  const desenhadas = refsLog[sel] || 0;
  for (let i = desenhadas; i < log.length; i++) {
    const linha = log[i];
    const div = document.createElement('div');
    div.className = `log-linha log-linha--${linha.tipo || 'etapa'}`;
    div.innerHTML = `${ico(ICONES_LOG[linha.tipo] || 'seta-dir')}<span>${escaparHtml(linha.texto)}</span>`;
    el.appendChild(div);
  }
  if (log.length > desenhadas) el.scrollTop = el.scrollHeight;
  refsLog[sel] = log.length;
}

// ---------------------------------------------------------------- gerar

function mostrarProgresso(mostrar) {
  $('#barra-progresso-wrap').hidden = !mostrar;
  if (!mostrar) return;
  $('#barra-progresso-fill').style.width = '3%';
  $('#barra-progresso-label').innerHTML = '<span>iniciando…</span><b>3%</b>';
  limparLog('#log-ia-gerar');
}

function atualizarProgresso(job, fill, label, logSel) {
  const pct = Math.max(0, Math.min(100, job.progresso || 0));
  $(fill || '#barra-progresso-fill').style.width = pct + '%';
  $(label || '#barra-progresso-label').innerHTML = `<span>${escaparHtml(job.etapa || '…')}</span><b>${pct}%</b>`;
  sincronizarLog(logSel || '#log-ia-gerar', job.log);
}

$('#btn-log-toggle').addEventListener('click', () => {
  const btn = $('#btn-log-toggle');
  btn.setAttribute('aria-expanded', String(btn.getAttribute('aria-expanded') !== 'true'));
});
$('#btn-log-toggle-extrator').addEventListener('click', () => {
  const btn = $('#btn-log-toggle-extrator');
  btn.setAttribute('aria-expanded', String(btn.getAttribute('aria-expanded') !== 'true'));
});

// Escuta um job assíncrono do servidor (geração ou extração) por SSE.
function ouvirJob(caminhoEventos, aoProgresso) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(caminhoEventos);
    es.onmessage = (ev) => {
      const job = JSON.parse(ev.data);
      aoProgresso(job);
      if (job.status === 'concluido') { es.close(); resolve(job.resultado); }
      if (job.status === 'erro') { es.close(); reject(new Error(job.erro)); }
    };
    es.onerror = () => { es.close(); reject(new Error('conexão com o servidor caiu no meio do processo.')); };
  });
}

$('#btn-gerar').addEventListener('click', async () => {
  const briefing = $('#briefing').value.trim();
  if (!briefing) { status('#status-geracao', 'escreve um briefing primeiro.', true); return; }
  if (estado.sujo && !await confirmar('Tem alteração não salva no post aberto. Gerar um post novo descarta ela.', { okRotulo: 'Gerar mesmo assim' })) return;

  status('#status-geracao', '');
  $('#btn-gerar').disabled = true;
  mostrarProgresso(true);

  try {
    const { jobId } = await api('POST', '/api/gerar', {
      marca: estado.marcaSlug,
      briefing,
      objetivo: $('#objetivo').value,
      promptExtra: $('#prompt-extra').value.trim(),
      nSlides: estado.nSlides,
      formato: estado.formato,
      cta: estado.cta === 1,
      mostrar: estado.mostrar,
      modelo: estado.modelo || undefined,
      templateNome: estado.templateSelecionado || undefined,
    });
    const resultado = await ouvirJob(`/api/gerar/${jobId}/eventos`, (j) => atualizarProgresso(j));
    await abrirPost(resultado);
    status('#status-geracao', `pronto — ${resultado.pngs.length} slides.`);
  } catch (e) {
    status('#status-geracao', 'erro: ' + e.message, true);
  } finally {
    $('#btn-gerar').disabled = false;
    mostrarProgresso(false);
  }
});

// ---------------------------------------------------------------- abrir post

// Repõe o briefing (tema, objetivo, prompt, nº de slides, formato, CTA,
// rodapé, modelo de IA, template) na coluna esquerda quando um post abre —
// gerado agora ou reaberto do Acervo depois. Antes essa informação só existia
// na memória do navegador enquanto durava a geração: fechar a aba, recarregar
// a página ou reabrir o post no dia seguinte perdia tudo, e não tinha como
// saber com que briefing aquele post tinha sido gerado. O servidor grava em
// estudio-briefing.json (ver /api/gerar em servidor/index.js) e devolve no
// "briefing" de /api/post e /api/gerar — `dados.briefing` vem null em posts
// gerados antes dessa gravação existir, e o formulário só fica como estava.
function restaurarBriefing(b) {
  if (!b) return;
  $('#briefing').value = b.briefing || '';
  $('#objetivo').value = b.objetivo || 'gerar autoridade';
  $('#prompt-extra').value = b.promptExtra || '';
  if (b.nSlides) {
    estado.nSlides = Number(b.nSlides);
    marcarSegmentado('#seg-slides', String(b.nSlides));
  }
  if (b.formato) {
    estado.formato = b.formato;
    marcarSegmentado('#seg-formato', b.formato);
  }
  estado.cta = b.cta === false ? 0 : 1;
  marcarSegmentado('#seg-cta', String(estado.cta));
  estado.mostrar = b.mostrar || 'perfil';
  marcarSegmentado('#seg-mostrar', estado.mostrar);
  estado.modelo = b.modelo || '';
  marcarSegmentado('#seg-modelo', estado.modelo);
  estado.templateSelecionado = b.templateNome || '';
  $('#template-escolhido-label').textContent = b.templateNome || 'Automático';
}

function limparEdicoesPendentes() {
  estado.textosPendentes = new Map();
  estado.posicoesPendentes = new Map();
  estado.overridesPendentes = { elementos: {}, slides: {}, fonte: {}, guias: {} };
  marcarSujo(false);
}

async function abrirPost(dados) {
  estado.pasta = dados.pasta;
  estado.token = dados.token;
  estado.slug = dados.slug;
  estado.motor = dados.motor;
  estado.pngs = dados.pngs || [];
  estado.legenda = dados.legenda || '';
  estado.slideAtual = 0;
  estado.head = null;
  estado.slidesHtml = null;
  estado.campos = [];
  estado.slidesMeta = [];
  estado.editidSelecionado = null;
  estado.blocoSelecionado = null;
  limparEdicoesPendentes();

  if (dados.marca) selecionarMarca(dados.marca, true);
  $('#nome-post').textContent = `${dados.slug || dados.pasta}  ·  ${dados.motor === 'estilo-editorial' ? 'editorial' : 'identidade do cliente'}`;
  $('#painel-editar').hidden = false;
  $('#btn-salvar-editar').hidden = false;
  $('#btn-rerenderizar').hidden = false;
  $('#btn-trava-area').hidden = false;
  $('#zoom-ctrl').hidden = false;
  $('#trilha-acoes').hidden = false;
  $('#btn-sair-post').hidden = false;
  $('#barra-ia').hidden = false;
  $('#campo-legenda').value = estado.legenda;
  restaurarBriefing(dados.briefing);

  renderizarTrilha();
  await selecionarSlide(0);
  carregarContaDestino();
  atualizarBlocoArquivos();
}

async function recarregarDadosCanvas() {
  const r = await api('GET', `/api/editor-html?pasta=${encodeURIComponent(estado.pasta)}`);
  estado.head = r.head;
  estado.slidesHtml = r.slidesHtml;
  estado.campos = r.campos || [];
  estado.slidesMeta = r.slidesMeta || [];
  estado.largura = r.largura || 1080;
  estado.altura = r.altura || 1350;
  estado.token = r.token || estado.token;
  estado.overridesSalvos = r.overrides || { elementos: {}, slides: {}, acento: '', fonte: {}, guias: {} };
  const guias = estado.overridesSalvos.guias || {};
  estado.margem = Number(guias.margem) > 0 ? Number(guias.margem) : MARGEM_PADRAO;
  estado.travaAreaSegura = guias.travado !== false;
  atualizarBotaoTrava();
}

async function selecionarSlide(i) {
  estado.slideAtual = i;
  estado.editidSelecionado = null;
  estado.blocoSelecionado = null;
  esconderBarraSelecao();
  $$('.mini').forEach((el) => el.classList.toggle('ativa', Number(el.dataset.i) === i));
  await carregarCanvas();
  renderizarCamposEditar();
  renderizarCamadas();
  if (!$('.aba-editar[data-tab-editar-conteudo="design"]').hidden) renderizarDesign();
}

// ---------------------------------------------------------------- canvas

async function carregarCanvas() {
  const wrap = $('#canvas-frame-wrap');
  const dica = $('#canvas-dica');
  const vazio = $('#preview-vazio');

  if (!estado.slidesHtml) {
    vazio.hidden = false;
    vazio.textContent = 'carregando a prévia editável…';
    wrap.hidden = true;
    try {
      await recarregarDadosCanvas();
    } catch (e) {
      vazio.textContent = 'erro ao carregar a prévia: ' + e.message;
      return;
    }
  }

  const html = estado.slidesHtml[estado.slideAtual];
  if (!html) { vazio.hidden = false; vazio.textContent = 'este slide não existe mais.'; wrap.hidden = true; dica.hidden = true; return; }

  const iframe = $('#canvas-frame');
  wrap.hidden = false;
  dica.hidden = false;
  vazio.hidden = true;

  // <base> resolve foto-*.jpg e _logo.svg contra a pasta do post — sem isso a
  // prévia vinha sem imagem nenhuma (404 em localhost:3000/foto-*.jpg).
  const base = estado.token ? `<base href="/api/pasta/${estado.token}/">` : '';
  // o bloco de override JÁ SALVO sai do <head> de propósito: quem pinta os
  // overrides na prévia é aplicarOverridesAoVivo, que soma salvo + pendente.
  // Deixar os dois valendo faria "limpar ajuste" não limpar nada na tela —
  // o bloco salvo continuaria mandando, com !important.
  const head = (estado.head || '').replace(/<style id="est-overrides">[\s\S]*?<\/style>/i, '');
  iframe.srcdoc = `${base}${head}${RESET_PREVIA}<body>${html}</body>`;
  await new Promise((resolve) => { iframe.onload = resolve; });

  aplicarOverridesAoVivo();
  aplicarEdicoesPendentesAoVivo();
  ajustarEscalaCanvas();
  ligarEdicaoCanvas(iframe);
  desenharGuias();
}

// Reaplica, por cima do HTML original que acabou de entrar no iframe, o texto
// digitado e as posições arrastadas que ainda não foram salvas — sem isso,
// trocar de slide e voltar revertia o texto/posição pro original (só os
// overrides de design sobreviviam, porque aplicarOverridesAoVivo já lia de
// estado.overridesPendentes, que é global e nunca dependeu do cache de HTML).
function aplicarEdicoesPendentesAoVivo() {
  const doc = docCanvas();
  if (!doc) return;
  const n = estado.slideAtual + 1;
  estado.textosPendentes.forEach((t) => {
    const el = doc.querySelector(`[data-editid="${cssEscape(t.editid)}"]`);
    if (el && el.innerHTML !== t.html) el.innerHTML = t.html;
  });
  estado.posicoesPendentes.forEach((p) => {
    if (p.slide !== n) return;
    const el = doc.querySelector(`.slide [data-blk="${cssEscape(p.blk)}"]`);
    if (!el) return;
    el.style.position = 'absolute';
    el.style.left = Math.round(p.x) + 'px';
    el.style.top = Math.round(p.y) + 'px';
  });
}

function docCanvas() {
  const iframe = $('#canvas-frame');
  return iframe && iframe.contentDocument;
}

function slideDoCanvas() {
  const doc = docCanvas();
  return doc && doc.querySelector('.slide');
}

function ajustarEscalaCanvas() {
  const iframe = $('#canvas-frame');
  const wrapFrame = $('#canvas-frame-wrap');
  const slideEl = slideDoCanvas();
  if (!slideEl) return;
  const w = slideEl.offsetWidth || estado.largura;
  const h = slideEl.offsetHeight || estado.altura;
  iframe.style.width = w + 'px';
  iframe.style.height = h + 'px';
  iframe.style.transformOrigin = 'top left';

  const wrap = $('#preview-wrap');
  const cabe = Math.min((wrap.clientWidth - 56) / w, (wrap.clientHeight - 56) / h);
  const escala = estado.zoom || Math.min(cabe, 1);
  estado.escala = escala;
  iframe.style.transform = `scale(${escala})`;

  // transform NÃO reduz o espaço que o elemento reserva no layout — só a
  // pintura. Sem isto, o iframe em tamanho nativo (1080px) continua "pedindo"
  // 1080px de largura pro flexbox e empurra a coluna da direita pra fora.
  wrapFrame.style.width = Math.round(w * escala) + 'px';
  wrapFrame.style.height = Math.round(h * escala) + 'px';
  $('#zoom-label').textContent = estado.zoom ? Math.round(escala * 100) + '%' : 'ajustar';
  posicionarBarraSelecao();
}

window.addEventListener('resize', () => requestAnimationFrame(ajustarEscalaCanvas));

$$('#zoom-ctrl button').forEach((b) =>
  b.addEventListener('click', () => {
    const atual = estado.escala || 1;
    if (b.dataset.zoom === 'fit') estado.zoom = null;
    if (b.dataset.zoom === '+') estado.zoom = Math.min(2, atual + 0.1);
    if (b.dataset.zoom === '-') estado.zoom = Math.max(0.1, atual - 0.1);
    ajustarEscalaCanvas();
  })
);

// ---------------------------------------------------------------- área segura
//
// O arraste anterior era: pointerdown em qualquer lugar do bloco (com alt),
// mexe left/top absolutos, solta. Sem referência nenhuma na tela, sem limite,
// sem encaixe — dava pra empurrar um título metade pra fora do slide sem
// perceber, e o único jeito de voltar era desfazer na mão.
//
// Agora existe uma ÁREA SEGURA (margem em px no espaço do slide, guardada no
// sidecar do post) desenhada por cima da prévia. Enquanto ela está travada, o
// bloco arrastado nunca sai dela; encaixa nas bordas e nos centros com 10px
// de tolerância; e as guias acendem quando o encaixe acontece. Destravar (o
// cadeado no topo) libera o movimento pra fora — é uma escolha explícita, não
// um acidente.

function desenharGuias() {
  const doc = docCanvas();
  const slideEl = slideDoCanvas();
  if (!doc || !slideEl) return;
  let camada = doc.getElementById('est-guias');
  if (!camada) {
    camada = doc.createElement('div');
    camada.id = 'est-guias';
    slideEl.appendChild(camada);
  }
  const m = estado.margem;
  camada.setAttribute('style', [
    'position:absolute', 'inset:0', 'pointer-events:none', 'z-index:2147483000',
  ].join(';'));
  camada.innerHTML = `
    <div data-area style="position:absolute;left:${m}px;top:${m}px;right:${m}px;bottom:${m}px;
      border:1px dashed rgba(141,204,255,.45);border-radius:2px;opacity:0;transition:opacity .15s"></div>
    <div data-gx style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,110,180,.9);opacity:0"></div>
    <div data-gy style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(255,110,180,.9);opacity:0"></div>`;
}

function mostrarGuias(mostrarArea, snapX, snapY) {
  const doc = docCanvas();
  const camada = doc && doc.getElementById('est-guias');
  if (!camada) return;
  const area = camada.querySelector('[data-area]');
  const gx = camada.querySelector('[data-gx]');
  const gy = camada.querySelector('[data-gy]');
  if (area) area.style.opacity = mostrarArea ? '1' : '0';
  if (gx) gx.style.opacity = snapX ? '1' : '0';
  if (gy) gy.style.opacity = snapY ? '1' : '0';
}

function atualizarBotaoTrava() {
  const btn = $('#btn-trava-area');
  btn.classList.toggle('ativo', estado.travaAreaSegura);
  btn.querySelector('use').setAttribute('href', estado.travaAreaSegura ? '#i-cadeado' : '#i-cadeado-aberto');
  btn.querySelector('span').textContent = estado.travaAreaSegura ? 'área segura' : 'livre';
  btn.title = estado.travaAreaSegura
    ? 'Área segura ligada: nenhum elemento passa da margem. Clica pra liberar.'
    : 'Área segura desligada: dá pra arrastar pra fora da margem. Clica pra travar de novo.';
}

$('#btn-trava-area').addEventListener('click', () => {
  estado.travaAreaSegura = !estado.travaAreaSegura;
  estado.overridesPendentes.guias = { ...estado.overridesPendentes.guias, travado: estado.travaAreaSegura };
  marcarSujo(true);
  atualizarBotaoTrava();
  if (!estado.travaAreaSegura) mostrarGuias(true, false, false);
});

// Encaixa um valor nos pontos notáveis (borda da área segura e centro), com
// tolerância. Devolve [valor, encaixou].
function encaixar(valor, pontos, tolerancia = 10) {
  for (const p of pontos) {
    if (Math.abs(valor - p) <= tolerancia) return [p, true];
  }
  return [valor, false];
}

function limitesDoBloco(el) {
  const slideEl = slideDoCanvas();
  const m = estado.margem;
  const largura = slideEl.offsetWidth;
  const altura = slideEl.offsetHeight;
  const lb = el.offsetWidth;
  const ab = el.offsetHeight;
  return {
    minX: m, maxX: Math.max(m, largura - m - lb),
    minY: m, maxY: Math.max(m, altura - m - ab),
    centroX: Math.round((largura - lb) / 2),
    centroY: Math.round((altura - ab) / 2),
  };
}

function posicionarBloco(el, x, y, comEncaixe) {
  const lim = limitesDoBloco(el);
  let snapX = false;
  let snapY = false;
  if (comEncaixe) {
    [x, snapX] = encaixar(x, [lim.minX, lim.maxX, lim.centroX]);
    [y, snapY] = encaixar(y, [lim.minY, lim.maxY, lim.centroY]);
    snapX = snapX && x === lim.centroX;
    snapY = snapY && y === lim.centroY;
  }
  if (estado.travaAreaSegura) {
    x = Math.min(Math.max(x, lim.minX), lim.maxX);
    y = Math.min(Math.max(y, lim.minY), lim.maxY);
  }
  el.style.position = 'absolute';
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
  mostrarGuias(true, snapX, snapY);
  return { x: Math.round(x), y: Math.round(y) };
}

// ---------------------------------------------------------------- interação

let _drag = null;

function ligarEdicaoCanvas(iframe) {
  const doc = iframe.contentDocument;
  if (!doc) return;

  doc.querySelectorAll('[data-editid]').forEach((el) => {
    el.classList.add('est-editavel');
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selecionarElemento(el.dataset.editid);
      if (el.contentEditable !== 'true') {
        el.contentEditable = 'true';
        el.focus();
      }
    });
    el.addEventListener('input', () => {
      registrarTexto(el.dataset.editid, el.innerHTML, el.textContent);
      sincronizarCampoLateral(el.dataset.editid, el.textContent);
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      registrarTexto(el.dataset.editid, el.innerHTML, el.textContent);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.blur(); });
  });

  doc.addEventListener('selectionchange', posicionarBarraSelecao);
  doc.addEventListener('mouseup', () => setTimeout(posicionarBarraSelecao, 0));

  // ---- arraste de bloco ----
  // A unidade é o bloco (.grp), não a linha de texto: tirar um filho de um
  // flex pra absolute faz os irmãos colapsarem no vão que sobra.
  doc.querySelectorAll('[data-blk]').forEach((el) => {
    el.classList.add('est-bloco');
    el.addEventListener('pointerenter', () => { if (!_drag) mostrarGuias(true, false, false); });
    el.addEventListener('pointerleave', () => { if (!_drag) mostrarGuias(false, false, false); });

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[contenteditable="true"]')) return;
      // Clicar em texto entra em edição; arrastar o mesmo texto move o bloco.
      // A diferença é o MOVIMENTO, não uma tecla: só vira arraste depois de
      // 4px. Antes exigia segurar alt, que ninguém adivinha.
      const alvoTexto = e.target.closest('[data-editid]');
      const slideEl = el.closest('.slide');
      const rectSlide = slideEl.getBoundingClientRect();
      const rectEl = el.getBoundingClientRect();
      const jaAbsoluto = doc.defaultView.getComputedStyle(el).position === 'absolute';
      const offX = jaAbsoluto ? parseFloat(el.style.left) || 0 : Math.round(rectEl.left - rectSlide.left);
      const offY = jaAbsoluto ? parseFloat(el.style.top) || 0 : Math.round(rectEl.top - rectSlide.top);
      _drag = {
        el, blk: el.dataset.blk, startX: e.clientX, startY: e.clientY,
        offX, offY, ativo: false, viaTexto: !!alvoTexto,
      };
      estado.blocoSelecionado = el.dataset.blk;
    });
  });

  doc.addEventListener('pointermove', (e) => {
    if (!_drag) return;
    const dx = e.clientX - _drag.startX;
    const dy = e.clientY - _drag.startY;
    if (!_drag.ativo) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      _drag.ativo = true;
      _drag.el.classList.add('est-arrastando');
      _drag.el.style.zIndex = '50';
      // se o arraste começou em cima de um texto que entrou em edição, tira o
      // foco: senão o navegador começa a SELECIONAR texto em vez de mover
      if (_drag.viaTexto && doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
      doc.getSelection().removeAllRanges();
    }
    e.preventDefault();
    posicionarBloco(_drag.el, _drag.offX + dx, _drag.offY + dy, !e.shiftKey);
  });

  const soltar = () => {
    if (!_drag) return;
    const { el, blk, ativo } = _drag;
    _drag = null;
    if (!ativo) return; // foi um clique, não um arraste
    el.classList.remove('est-arrastando');
    mostrarGuias(false, false, false);
    registrarPosicao(estado.slideAtual + 1, blk,
      Math.round(parseFloat(el.style.left)), Math.round(parseFloat(el.style.top)));
  };
  doc.addEventListener('pointerup', soltar);
  doc.addEventListener('pointercancel', soltar);

  // setas movem o bloco selecionado de 1 em 1 px (10 com shift) — o ajuste
  // fino que o mouse não dá.
  doc.addEventListener('keydown', (e) => {
    if (doc.activeElement && doc.activeElement.getAttribute
      && doc.activeElement.getAttribute('contenteditable') === 'true') return;
    if (!estado.blocoSelecionado) return;
    const passo = e.shiftKey ? 10 : 1;
    const mapa = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    if (!mapa[e.key]) return;
    e.preventDefault();
    const alvo = doc.querySelector(`.slide [data-blk="${cssEscape(estado.blocoSelecionado)}"]`);
    if (!alvo) return;
    const slideEl = slideDoCanvas();
    const r = alvo.getBoundingClientRect();
    const rs = slideEl.getBoundingClientRect();
    const x0 = alvo.style.left ? parseFloat(alvo.style.left) : Math.round(r.left - rs.left);
    const y0 = alvo.style.top ? parseFloat(alvo.style.top) : Math.round(r.top - rs.top);
    const p = posicionarBloco(alvo, x0 + mapa[e.key][0], y0 + mapa[e.key][1], false);
    registrarPosicao(estado.slideAtual + 1, estado.blocoSelecionado, p.x, p.y);
    clearTimeout(_timerGuias);
    _timerGuias = setTimeout(() => mostrarGuias(false, false, false), 900);
  });

  // estilo do editor dentro do iframe — injetado só nesta cópia da prévia,
  // nunca escrito no arquivo que vira PNG.
  const st = doc.createElement('style');
  st.textContent = `
    .est-editavel{ cursor:text; outline:1px dashed rgba(141,204,255,0); outline-offset:2px; transition:outline-color .15s; }
    .est-editavel:hover{ outline-color:rgba(141,204,255,.5); }
    .est-editavel.est-sel{ outline:1px solid rgba(141,204,255,.95); }
    [contenteditable="true"]{ outline:2px solid rgba(141,204,255,.95) !important; }
    .est-bloco{ cursor:grab; }
    .est-bloco:hover{ box-shadow:0 0 0 1px rgba(141,204,255,.35); }
    .est-arrastando{ cursor:grabbing; opacity:.9; box-shadow:0 0 0 1px rgba(141,204,255,.9) !important; }
  `;
  doc.head.appendChild(st);
  doc.body.setAttribute('tabindex', '0');
}

let _timerGuias = null;

function selecionarElemento(editid) {
  estado.editidSelecionado = editid;
  const doc = docCanvas();
  if (doc) {
    doc.querySelectorAll('.est-sel').forEach((e) => e.classList.remove('est-sel'));
    const el = doc.querySelector(`[data-editid="${cssEscape(editid)}"]`);
    if (el) {
      el.classList.add('est-sel');
      const bloco = el.closest('[data-blk]');
      if (bloco) estado.blocoSelecionado = bloco.dataset.blk;
    }
  }
  $$('#campos-editar .no-editavel').forEach((b) => b.classList.toggle('focado', b.dataset.editid === editid));
  $$('#lista-camadas .camada-item').forEach((b) => b.classList.toggle('focado', b.dataset.editid === editid));
  atualizarBarraSelecao();
  posicionarBarraSelecao();
}

// ---------------------------------------------------------------- pendências

function registrarTexto(editid, html, texto) {
  const campo = estado.campos.find((c) => c.editid === editid);
  if (campo) { campo.html = html; campo.texto = texto; campo.textoRaw = texto; }
  estado.textosPendentes.set(editid, { editid, html, texto });
  marcarSujo(true);
}

function registrarPosicao(slide, blk, x, y) {
  estado.posicoesPendentes.set(`${slide}:${blk}`, { slide, blk, x, y });
  marcarSujo(true);
}

function overrideElemento(editid, props) {
  const atual = estado.overridesPendentes.elementos[editid] || {};
  estado.overridesPendentes.elementos[editid] = { ...atual, ...props };
  marcarSujo(true);
  aplicarOverridesAoVivo();
}

function overrideSlide(n, props) {
  const atual = estado.overridesPendentes.slides[String(n)] || {};
  estado.overridesPendentes.slides[String(n)] = { ...atual, ...props };
  marcarSujo(true);
  aplicarOverridesAoVivo();
}

function overrideEfetivoElemento(editid) {
  return { ...(estado.overridesSalvos.elementos || {})[editid], ...(estado.overridesPendentes.elementos[editid] || {}) };
}
function overrideEfetivoSlide(n) {
  return { ...(estado.overridesSalvos.slides || {})[String(n)], ...(estado.overridesPendentes.slides[String(n)] || {}) };
}
function acentoEfetivo() {
  return estado.overridesPendentes.acento !== undefined ? estado.overridesPendentes.acento : (estado.overridesSalvos.acento || '');
}
function fonteEfetiva() {
  return { ...(estado.overridesSalvos.fonte || {}), ...(estado.overridesPendentes.fonte || {}) };
}

// Prévia instantânea, sem ida ao servidor: os overrides viram UM bloco de CSS
// injetado dentro do iframe, com a mesma forma que o servidor gera no render
// (ver montarCssOverrides em servidor/lib/editor-html.js — esta função é o
// espelho dela no navegador).
//
// Por que CSS e não style inline em cada elemento, que era o jeito óbvio:
//   1. o bloco de override JÁ SALVO chega no <head> com !important — style
//      inline perde pra ele, então mexer no tamanho da fonte de um elemento
//      que já tinha override não fazia nada na tela;
//   2. o texto do canvas é serializado (innerHTML) e mandado pro servidor no
//      salvar — style inline posto pela prévia acabava GRAVADO dentro do
//      conteúdo do post ("<span class="acc" style="color:rgb(255,107,0)">"),
//      congelando a cor de destaque dentro do HTML da peça.
function aplicarOverridesAoVivo() {
  const doc = docCanvas();
  if (!doc) return;
  const n = estado.slideAtual + 1;
  const regras = [];

  const ov = overrideEfetivoSlide(n);
  const meta = (estado.slidesMeta || []).find((m) => m.slide === n) || {};
  const sel = `[data-sl="${n}"]`;
  const filtro = cssFiltro(ov.filtro);

  if (ov.corFundo) regras.push(`${sel}{background-color:${ov.corFundo} !important}`);
  if (ov.corTexto) {
    regras.push(`${sel},${sel} h1,${sel} h2,${sel} h3,${sel} p,${sel} li,${sel} span:not(.acc):not(.est-acc),${sel} div{color:${ov.corTexto} !important;-webkit-text-fill-color:${ov.corTexto} !important}`);
  }

  // quando a foto é o background do PRÓPRIO slide (padrão do motor genérico),
  // filtrar o elemento filtraria o texto junto — a foto é repintada num
  // ::before atrás do conteúdo, igual ao que o servidor faz no render.
  if (meta.fundoProprio && (filtro || ov.posFoto)) {
    const pos = ov.posFoto || meta.fundoProprio.pos || 'center';
    regras.push(`${sel}{background-image:none !important;isolation:isolate}`);
    regras.push(`${sel}::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;`
      + `background-image:url('${meta.fundoProprio.url}');background-size:${meta.fundoProprio.size || 'cover'};`
      + `background-repeat:no-repeat;background-position:${pos};${filtro ? `filter:${filtro};` : ''}}`);
  } else {
    if (filtro) regras.push(`${sel} .img i,${sel} > img,${sel} img,${sel} [data-fundo-estudio]{filter:${filtro} !important}`);
    if (ov.posFoto) {
      regras.push(`${sel} .img i{background-position:${ov.posFoto} !important}`);
      regras.push(`${sel} img{object-position:${ov.posFoto} !important}`);
    }
  }

  const fonte = fonteEfetiva();
  if (fonte.titulo) regras.push(`${sel} h1,${sel} h2,${sel} h3,${sel} .titulo,${sel} .headline{font-family:'${fonte.titulo}',sans-serif !important}`);
  if (fonte.corpo) {
    regras.push(`${sel},${sel} p,${sel} li,${sel} span,${sel} div{font-family:'${fonte.corpo}',sans-serif !important}`);
    if (fonte.titulo) regras.push(`${sel} h1,${sel} h2,${sel} h3,${sel} .titulo,${sel} .headline{font-family:'${fonte.titulo}',sans-serif !important}`);
  }
  if (fonte.titulo || fonte.corpo) garantirFonteNoIframe(doc, fonte);

  const acento = acentoEfetivo();
  if (acento) {
    regras.push(`${sel} .acc,${sel} .est-acc{background:none !important;-webkit-background-clip:border-box !important;background-clip:border-box !important;-webkit-text-fill-color:${acento} !important;color:${acento} !important}`);
  } else {
    regras.push(`${sel} .est-acc{font-weight:700}`);
  }

  doc.querySelectorAll('[data-editid]').forEach((el) => {
    const oe = overrideEfetivoElemento(el.dataset.editid);
    const decls = [];
    if (oe.fontSize) decls.push(`font-size:${oe.fontSize}px !important`);
    if (oe.textAlign) decls.push(`text-align:${oe.textAlign} !important`);
    if (oe.fontWeight) decls.push(`font-weight:${oe.fontWeight} !important`);
    if (oe.lineHeight) decls.push(`line-height:${oe.lineHeight} !important`);
    if (oe.letterSpacing != null && oe.letterSpacing !== '') decls.push(`letter-spacing:${oe.letterSpacing}em !important`);
    if (oe.textTransform) decls.push(`text-transform:${oe.textTransform} !important`);
    if (oe.fontFamily) decls.push(`font-family:'${oe.fontFamily}',sans-serif !important`);
    if (oe.color) decls.push(`color:${oe.color} !important;-webkit-text-fill-color:${oe.color} !important;background:none !important`);
    if (oe.oculto) decls.push('display:none !important');
    if (oe.sombra) decls.push(`text-shadow:${textShadowCss(oe.sombra)} !important`);
    if (decls.length) regras.push(`[data-editid="${el.dataset.editid}"]{${decls.join(';')}}`);
  });

  injetarEstiloPreview(doc, 'est-preview', regras.join('\n'));
}

function injetarEstiloPreview(doc, id, css) {
  let st = doc.getElementById(id);
  if (!css) { if (st) st.remove(); return; }
  if (!st) { st = doc.createElement('style'); st.id = id; doc.head.appendChild(st); }
  st.textContent = css;
}

function cssFiltro(f) {
  if (!f) return '';
  const p = [];
  if (f.brilho != null && Number(f.brilho) !== 1) p.push(`brightness(${f.brilho})`);
  if (f.contraste != null && Number(f.contraste) !== 1) p.push(`contrast(${f.contraste})`);
  if (f.saturacao != null && Number(f.saturacao) !== 1) p.push(`saturate(${f.saturacao})`);
  if (f.cinza) p.push(`grayscale(${f.cinza})`);
  if (f.desfoque) p.push(`blur(${f.desfoque}px)`);
  return p.join(' ');
}

function garantirFonteNoIframe(doc, fonte) {
  const nomes = [fonte.titulo, fonte.corpo].filter(Boolean);
  if (!nomes.length) return;
  const href = 'https://fonts.googleapis.com/css2?'
    + Array.from(new Set(nomes)).map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;500;600;700;800;900`).join('&')
    + '&display=swap';
  let link = doc.getElementById('est-fontes-preview');
  if (!link) {
    link = doc.createElement('link');
    link.id = 'est-fontes-preview';
    link.rel = 'stylesheet';
    doc.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

// ---------------------------------------------------------------- barra de seleção

function elementoSelecionado() {
  const doc = docCanvas();
  if (!doc || !estado.editidSelecionado) return null;
  return doc.querySelector(`[data-editid="${cssEscape(estado.editidSelecionado)}"]`);
}

function atualizarBarraSelecao() {
  const el = elementoSelecionado();
  const barra = $('#barra-selecao');
  if (!el) { barra.hidden = true; return; }
  barra.hidden = false;
  const campo = estado.campos.find((c) => c.editid === estado.editidSelecionado);
  const ov = overrideEfetivoElemento(estado.editidSelecionado);
  const tamanho = ov.fontSize || (campo && campo.estilo ? campo.estilo.fontSize : 0);
  $('#sel-tamanho').textContent = tamanho ? tamanho + 'px' : '—';
  const hex = corParaHex(ov.color || (campo && campo.estilo ? campo.estilo.color : ''));
  if (hex) $('#sel-cor').value = hex;
  const sombraVal = Number(ov.sombra) || 0;
  $('#sel-sombra').textContent = sombraVal ? Math.round(sombraVal * 100) + '%' : '—';
  $('#sel-sombra').classList.toggle('ativo', !!sombraVal);
}

function posicionarBarraSelecao() {
  const barra = $('#barra-selecao');
  const el = elementoSelecionado();
  if (!el || barra.hidden) return;
  const iframe = $('#canvas-frame');
  const escala = estado.escala || 1;
  const rectEl = el.getBoundingClientRect();
  const rectIframe = iframe.getBoundingClientRect();
  const rectWrap = $('#preview-wrap').getBoundingClientRect();
  const x = rectIframe.left - rectWrap.left + rectEl.left * escala + (rectEl.width * escala) / 2;
  const y = rectIframe.top - rectWrap.top + rectEl.top * escala;
  barra.style.left = Math.max(150, Math.min(rectWrap.width - 150, x)) + 'px';
  barra.style.top = Math.max(34, y - 10) + 'px';
}

function esconderBarraSelecao() { $('#barra-selecao').hidden = true; }

function corParaHex(cor) {
  if (!cor) return '';
  if (/^#[0-9a-f]{6}$/i.test(cor)) return cor;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(cor);
  if (!m) return '';
  return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('');
}

$$('#barra-selecao button[data-acao]').forEach((b) =>
  b.addEventListener('click', () => {
    const editid = estado.editidSelecionado;
    if (!editid) return;
    const campo = estado.campos.find((c) => c.editid === editid);
    const ov = overrideEfetivoElemento(editid);
    const base = ov.fontSize || (campo && campo.estilo ? campo.estilo.fontSize : 40) || 40;
    switch (b.dataset.acao) {
      case 'maior': overrideElemento(editid, { fontSize: Math.round(base * 1.08) + 1 }); break;
      case 'menor': overrideElemento(editid, { fontSize: Math.max(8, Math.round(base * 0.92) - 1) }); break;
      case 'esq': overrideElemento(editid, { textAlign: 'left' }); break;
      case 'centro': overrideElemento(editid, { textAlign: 'center' }); break;
      case 'dir': overrideElemento(editid, { textAlign: 'right' }); break;
      case 'destaque': alternarDestaque(); break;
      case 'sombra-menor': ajustarSombra(-0.2); break;
      case 'sombra-maior': ajustarSombra(0.2); break;
      case 'ia': abrirModalIa({ tipo: 'campo', editid }); break;
    }
    atualizarBarraSelecao();
    renderizarCamposEditar();
  })
);

$('#sel-cor').addEventListener('input', (e) => {
  if (!estado.editidSelecionado) return;
  overrideElemento(estado.editidSelecionado, { color: e.target.value });
});

// Envolve o trecho selecionado em <span class="acc est-acc">. `acc` é a
// classe do motor editorial (o servidor lê ela de volta e vira "destaque" no
// post.json); `est-acc` é a que o CSS de override colore no motor genérico.
function alternarDestaque() {
  const doc = docCanvas();
  const el = elementoSelecionado();
  if (!doc || !el) return;
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed || !el.contains(sel.anchorNode)) {
    aviso('Selecione com o mouse o trecho do texto que vai virar destaque.');
    return;
  }
  const trecho = sel.toString();
  const jaDentro = sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('.acc, .est-acc');
  if (jaDentro) {
    jaDentro.replaceWith(doc.createTextNode(jaDentro.textContent));
  } else {
    const span = doc.createElement('span');
    span.className = 'acc est-acc';
    span.textContent = trecho;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(span);
    // sem "cor de destaque" escolhida, .est-acc caía num fallback só em
    // negrito, sem cor nenhuma — clicar em "destaque" parecia não fazer
    // nada. O motor editorial tem gradiente nativo no .acc (não precisa
    // disso), mas o genérico (site do cliente) não tem estilo nenhum pra
    // essa classe: sem uma cor de verdade aqui, o destaque não aparece.
    if (!acentoEfetivo()) {
      estado.overridesPendentes.acento = ACENTO_PADRAO;
      marcarSujo(true);
    }
  }
  el.normalize();
  registrarTexto(el.dataset.editid, el.innerHTML, el.textContent);
  aplicarOverridesAoVivo();
  renderizarCamposEditar();
}

// Sombra é um stepper (− valor +), não liga/desliga — dá pra editar a
// intensidade de verdade em vez de só ligar num valor fixo. Passo de 0.2,
// 0 = sem sombra (some do override, igual os outros campos "limpos"). A
// mesma fórmula em número (0-1) vira o CSS aqui (prévia) e em
// servidor/lib/editor-html.js (render final) — os dois têm que casar, senão
// a prévia mostra uma sombra e o PNG sai com outra.
function textShadowCss(intensidade) {
  const n = Math.max(0, Math.min(1, Number(intensidade) || 0));
  const desfoque = Math.round(4 + n * 16);
  const alfa = (0.25 + n * 0.45).toFixed(2);
  const deslocamento = Math.round(1 + n * 3);
  return `0 ${deslocamento}px ${desfoque}px rgba(0,0,0,${alfa})`;
}

function ajustarSombra(delta) {
  const editid = estado.editidSelecionado;
  if (!editid) return;
  const ov = overrideEfetivoElemento(editid);
  const atual = Number(ov.sombra) || 0;
  const novo = Math.round(Math.max(0, Math.min(1, atual + delta)) * 100) / 100;
  overrideElemento(editid, { sombra: novo > 0 ? novo : '' });
  atualizarBarraSelecao();
}

// ---------------------------------------------------------------- aba Editar

function camposDoSlide() {
  return estado.campos.filter((c) => c.slide === estado.slideAtual + 1);
}

function renderizarCamposEditar() {
  const cont = $('#campos-editar');
  const lista = camposDoSlide();
  if (!lista.length) {
    cont.innerHTML = '<p class="ajuda">Nenhum texto editável neste slide.</p>';
    return;
  }
  cont.innerHTML = lista
    .map((c) => {
      const semDestino = estado.motor === 'estilo-editorial' && !c.destino;
      return `<div class="no-editavel${c.editid === estado.editidSelecionado ? ' focado' : ''}" data-editid="${escaparHtml(c.editid)}">
        <div class="tipo">
          <span>${escaparHtml(c.tag)}${c.classe ? '.' + escaparHtml(String(c.classe).split(' ')[0]) : ''}${c.chrome ? ' · rodapé' : ''}</span>
          <button class="btn-mini" data-ia title="Reescrever com IA">${ico('ia')}</button>
        </div>
        <textarea data-campo="texto" rows="3">${escaparHtml(c.textoRaw != null ? c.textoRaw : c.texto)}</textarea>
        ${(c.destaque || []).length
          ? `<div class="destaque-lista">${c.destaque.map((d) => `<span class="chip-destaque">${escaparHtml(d)}</span>`).join('')}</div>`
          : ''}
        ${semDestino ? `<div class="aviso-campo">${ico('alerta')} texto gerado dentro de uma primitiva ilustrada — use "reescrever slide" pra mexer nele</div>` : ''}
      </div>`;
    })
    .join('');

  $$('.no-editavel', cont).forEach((box) => {
    const editid = box.dataset.editid;
    box.addEventListener('click', () => selecionarElemento(editid));
    box.querySelector('[data-campo="texto"]').addEventListener('input', (e) => {
      const doc = docCanvas();
      const el = doc && doc.querySelector(`[data-editid="${cssEscape(editid)}"]`);
      if (el) el.textContent = e.target.value;
      registrarTexto(editid, el ? el.innerHTML : escaparHtml(e.target.value), e.target.value);
    });
    box.querySelector('[data-ia]').addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalIa({ tipo: 'campo', editid });
    });
  });
}

function sincronizarCampoLateral(editid, texto) {
  const box = $(`#campos-editar .no-editavel[data-editid="${cssEscape(editid)}"]`);
  if (!box) return;
  const ta = box.querySelector('[data-campo="texto"]');
  if (ta && ta.value !== texto) ta.value = texto;
}

// ---------------------------------------------------------------- aba Design

function renderizarDesign() {
  const cont = $('#campos-design');
  if (!estado.pasta) { cont.innerHTML = '<p class="ajuda">Abre ou gera um post primeiro.</p>'; return; }
  const n = estado.slideAtual + 1;
  const ov = overrideEfetivoSlide(n);
  const filtro = ov.filtro || {};
  const meta = (estado.slidesMeta || []).find((m) => m.slide === n) || {};
  const fonte = fonteEfetiva();

  cont.innerHTML = `
    <div class="grupo-design">
      <div class="grupo-design-titulo">Slide ${n}</div>
      <div class="linha-campo">
        <label>Cor de fundo</label>
        <div class="linha-cor">
          <input type="color" id="d-cor-fundo" value="${corParaHex(ov.corFundo || meta.corFundo) || '#000000'}">
          <button class="btn-mini" data-limpar="corFundo">limpar</button>
        </div>
      </div>
      <div class="linha-campo">
        <label>Cor do texto</label>
        <div class="linha-cor">
          <input type="color" id="d-cor-texto" value="${corParaHex(ov.corTexto) || '#ffffff'}">
          <button class="btn-mini" data-limpar="corTexto">limpar</button>
        </div>
      </div>
      ${meta.temFoto ? `
      <div class="grupo-design-titulo" style="margin-top:.8rem">Foto deste slide</div>
      ${sliderHtml('brilho', 'Brilho', filtro.brilho != null ? filtro.brilho : 1, 0.2, 2, 0.05)}
      ${sliderHtml('contraste', 'Contraste', filtro.contraste != null ? filtro.contraste : 1, 0.2, 2.5, 0.05)}
      ${sliderHtml('saturacao', 'Saturação', filtro.saturacao != null ? filtro.saturacao : 1, 0, 2.5, 0.05)}
      ${sliderHtml('cinza', 'Preto e branco', filtro.cinza != null ? filtro.cinza : 0, 0, 1, 0.05)}
      ${sliderHtml('desfoque', 'Desfoque', filtro.desfoque != null ? filtro.desfoque : 0, 0, 20, 1)}
      <div class="linha-campo">
        <label>Enquadramento</label>
        <select id="d-pos-foto">
          ${['', '50% 50%', '50% 20%', '50% 35%', '50% 80%', '20% 50%', '80% 50%']
            .map((v) => `<option value="${v}"${(ov.posFoto || '') === v ? ' selected' : ''}>${v || 'como veio'}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--line btn-sm btn-largo" id="d-trocar-foto">${ico('imagem')}Trocar a foto</button>
      ` : '<p class="ajuda">Este slide não tem foto — os controles de imagem aparecem quando tiver.</p>'}
      <button class="btn-mini btn-mini-largo" id="d-limpar-slide">limpar ajustes deste slide</button>
    </div>

    <div class="grupo-design">
      <div class="grupo-design-titulo">Post inteiro</div>
      <div class="linha-campo">
        <label>Cor de destaque</label>
        <div class="linha-cor">
          <input type="color" id="d-acento" value="${corParaHex(acentoEfetivo()) || ACENTO_PADRAO}">
          <button class="btn-mini" data-limpar-acento>limpar</button>
        </div>
      </div>
      <div class="linha-campo">
        <label>Fonte dos títulos</label>
        <select id="d-fonte-titulo">${FONTES.map((f) => `<option value="${f}"${(fonte.titulo || '') === f ? ' selected' : ''}>${f || 'como veio'}</option>`).join('')}</select>
      </div>
      <div class="linha-campo">
        <label>Fonte do corpo</label>
        <select id="d-fonte-corpo">${FONTES.map((f) => `<option value="${f}"${(fonte.corpo || '') === f ? ' selected' : ''}>${f || 'como veio'}</option>`).join('')}</select>
      </div>
    </div>

    <div class="grupo-design">
      <div class="grupo-design-titulo">Área segura</div>
      <div class="linha-campo linha-slider">
        <label>Margem <span class="valor-slider" id="v-margem">${estado.margem}px</span></label>
        <input type="range" id="d-margem" min="0" max="220" step="4" value="${estado.margem}">
      </div>
      <p class="ajuda">Com a trava ligada (cadeado no topo do canvas), nenhum bloco arrastado passa dessa margem.</p>
    </div>

    <hr>
    <button class="btn btn--line btn-sm btn-largo" id="btn-salvar-template">${ico('salvar')}Salvar como modelo</button>
    <p class="ajuda">Ajuste de design entra no PNG no próximo render — clica em "Salvar alterações" no topo.</p>`;

  const n1 = n;
  $('#d-cor-fundo').addEventListener('input', (e) => overrideSlide(n1, { corFundo: e.target.value }));
  $('#d-cor-texto').addEventListener('input', (e) => overrideSlide(n1, { corTexto: e.target.value }));
  $$('[data-limpar]', cont).forEach((b) =>
    b.addEventListener('click', () => { overrideSlide(n1, { [b.dataset.limpar]: '' }); renderizarDesign(); })
  );
  $('[data-limpar-acento]', cont).addEventListener('click', () => {
    estado.overridesPendentes.acento = '';
    estado.overridesSalvos.acento = '';
    marcarSujo(true);
    aplicarOverridesAoVivo();
    renderizarDesign();
  });
  $('#d-acento').addEventListener('input', (e) => {
    estado.overridesPendentes.acento = e.target.value;
    marcarSujo(true);
    aplicarOverridesAoVivo();
  });
  ['titulo', 'corpo'].forEach((qual) => {
    const el = $(`#d-fonte-${qual}`);
    if (el) el.addEventListener('change', (e) => {
      estado.overridesPendentes.fonte = { ...estado.overridesPendentes.fonte, [qual]: e.target.value };
      marcarSujo(true);
      aplicarOverridesAoVivo();
    });
  });
  $$('[data-filtro]', cont).forEach((inp) =>
    inp.addEventListener('input', (e) => {
      const atual = overrideEfetivoSlide(n1).filtro || {};
      overrideSlide(n1, { filtro: { ...atual, [inp.dataset.filtro]: Number(e.target.value) } });
      const saida = inp.parentElement.querySelector('.valor-slider');
      if (saida) saida.textContent = e.target.value;
    })
  );
  const posFoto = $('#d-pos-foto');
  if (posFoto) posFoto.addEventListener('change', (e) => overrideSlide(n1, { posFoto: e.target.value }));
  const trocar = $('#d-trocar-foto');
  if (trocar) trocar.addEventListener('click', () => { $('#modal-imagens').hidden = false; });
  $('#d-margem').addEventListener('input', (e) => {
    estado.margem = Number(e.target.value);
    $('#v-margem').textContent = estado.margem + 'px';
    estado.overridesPendentes.guias = { ...estado.overridesPendentes.guias, margem: estado.margem };
    marcarSujo(true);
    desenharGuias();
    mostrarGuias(true, false, false);
    clearTimeout(_timerGuias);
    _timerGuias = setTimeout(() => mostrarGuias(false, false, false), 1200);
  });
  $('#d-limpar-slide').addEventListener('click', () => {
    estado.overridesPendentes.slides[String(n1)] = null;
    estado.overridesSalvos.slides = estado.overridesSalvos.slides || {};
    delete estado.overridesSalvos.slides[String(n1)];
    marcarSujo(true);
    aplicarOverridesAoVivo();
    renderizarDesign();
  });
  $('#btn-salvar-template').addEventListener('click', salvarComoTemplate);
}

function sliderHtml(chave, rotulo, valor, min, max, passo) {
  return `<div class="linha-campo linha-slider">
    <label>${rotulo} <span class="valor-slider">${valor}</span></label>
    <input type="range" data-filtro="${chave}" min="${min}" max="${max}" step="${passo}" value="${valor}">
  </div>`;
}

async function salvarComoTemplate() {
  if (!estado.pasta) return;
  const nome = await pedirTexto('Como esse modelo vai se chamar?', { titulo: 'Salvar como modelo', placeholder: 'ex: editorial-foto-cheia', okRotulo: 'Salvar' });
  if (!nome) return;
  try {
    await api('POST', '/api/templates', { pasta: estado.pasta, nome, origemDescricao: estado.slug });
    await carregarTemplatePicker();
    await aviso(`Modelo "${nome}" salvo. Ele já aparece na aba Templates.`, { titulo: 'Pronto' });
  } catch (e) {
    avisoDeErro('Não deu pra salvar o modelo.', e);
  }
}

// ---------------------------------------------------------------- aba Camadas

function renderizarCamadas() {
  const cont = $('#lista-camadas');
  const lista = camposDoSlide();
  if (!lista.length) {
    cont.innerHTML = '<p class="ajuda">Nenhuma camada de texto neste slide.</p>';
    return;
  }
  cont.innerHTML = lista
    .map((c) => {
      const ov = overrideEfetivoElemento(c.editid);
      return `<div class="camada-item${c.editid === estado.editidSelecionado ? ' focado' : ''}" data-editid="${escaparHtml(c.editid)}">
        <button class="btn-olho" data-olho title="${ov.oculto ? 'Mostrar' : 'Esconder'}">${ico(ov.oculto ? 'olho-fechado' : 'olho')}</button>
        <span class="camada-tag">${escaparHtml(c.tag)}</span>
        <span class="camada-texto${ov.oculto ? ' oculta' : ''}">${escaparHtml((c.textoRaw || c.texto || '').slice(0, 42))}</span>
      </div>`;
    })
    .join('');
  $$('.camada-item', cont).forEach((it) => {
    const editid = it.dataset.editid;
    it.addEventListener('click', () => selecionarElemento(editid));
    it.querySelector('[data-olho]').addEventListener('click', (e) => {
      e.stopPropagation();
      const ov = overrideEfetivoElemento(editid);
      overrideElemento(editid, { oculto: ov.oculto ? '' : true });
      renderizarCamadas();
    });
  });
}

// ---------------------------------------------------------------- aba Legenda

async function carregarLegenda() {
  if (!estado.pasta) return;
  try {
    const r = await api('GET', `/api/legenda?pasta=${encodeURIComponent(estado.pasta)}`);
    estado.legenda = r.legenda || '';
    $('#campo-legenda').value = estado.legenda;
  } catch (e) {
    status('#status-legenda', 'erro: ' + e.message, true);
  }
}

$('#btn-salvar-legenda').addEventListener('click', async () => {
  if (!estado.pasta) return;
  status('#status-legenda', 'salvando…');
  try {
    await api('PUT', '/api/legenda', { pasta: estado.pasta, legenda: $('#campo-legenda').value });
    estado.legenda = $('#campo-legenda').value;
    status('#status-legenda', 'legenda salva.');
  } catch (e) {
    status('#status-legenda', 'erro: ' + e.message, true);
  }
});

$('#btn-reescrever-legenda').addEventListener('click', () => abrirModalIa({ tipo: 'legenda' }));

// ---------------------------------------------------------------- IA

function abrirModalIa(alvo) {
  estado.alvoIa = alvo;
  let original = '';
  if (alvo.tipo === 'campo') {
    const c = estado.campos.find((x) => x.editid === alvo.editid);
    original = c ? (c.textoRaw || c.texto) : '';
  } else {
    original = $('#campo-legenda').value;
  }
  $('#ia-original').value = original;
  $('#ia-instrucao').value = '';
  status('#status-ia', '');
  $('#modal-ia').hidden = false;
}

$('#fechar-modal-ia').addEventListener('click', () => { $('#modal-ia').hidden = true; });
$$('#ia-atalhos button').forEach((b) =>
  b.addEventListener('click', () => { $('#ia-instrucao').value = b.dataset.i; })
);

$('#btn-rodar-ia').addEventListener('click', async () => {
  const alvo = estado.alvoIa;
  if (!alvo || !estado.pasta) return;
  const instrucao = $('#ia-instrucao').value.trim();
  $('#btn-rodar-ia').disabled = true;
  status('#status-ia', 'pensando… (roda na tua assinatura do Claude Code, sem custo por token)');
  try {
    if (alvo.tipo === 'legenda') {
      const r = await api('POST', '/api/reescrever', { pasta: estado.pasta, escopo: 'legenda', instrucao });
      $('#campo-legenda').value = r.legenda;
      estado.legenda = r.legenda;
    } else {
      const r = await api('POST', '/api/reescrever', {
        pasta: estado.pasta,
        escopo: 'texto',
        texto: $('#ia-original').value,
        instrucao,
        contexto: camposDoSlide().map((c) => c.textoRaw || c.texto).join(' | '),
      });
      const doc = docCanvas();
      const el = doc && doc.querySelector(`[data-editid="${cssEscape(alvo.editid)}"]`);
      if (el) el.textContent = r.texto;
      registrarTexto(alvo.editid, el ? el.innerHTML : escaparHtml(r.texto), r.texto);
      renderizarCamposEditar();
    }
    $('#modal-ia').hidden = true;
  } catch (e) {
    status('#status-ia', 'erro: ' + e.message, true);
  } finally {
    $('#btn-rodar-ia').disabled = false;
  }
});

// ---------------------------------------------------------------- barra flutuante de IA
//
// Um elemento só, flutuando entre o canvas e a trilha, no lugar dos dois
// campos que existiam antes (um pro post inteiro, outro só pro slide) — o
// toggle "Este slide · Carrossel inteiro" decide o escopo, e a mesma pergunta
// serve pros dois. Reaproveita a mesma rota /api/reescrever de sempre, só
// troca o "escopo" mandado pro servidor.

let escopoIa = 'slide';

$$('#barra-ia-escopo button').forEach((btn) => {
  btn.addEventListener('click', () => {
    escopoIa = btn.dataset.escopo;
    $$('#barra-ia-escopo button').forEach((b) => b.classList.toggle('ativo', b === btn));
    $('#barra-ia-input').placeholder = escopoIa === 'post'
      ? 'ex: deixa a paleta mais escura em todos os slides · reescreve tudo num tom mais direto'
      : 'ex: deixa mais curto e direto · muda o layout desse card pra uma citação em destaque';
  });
});

$('#barra-ia-input').addEventListener('input', (e) => {
  $('#barra-ia-enviar').disabled = !e.target.value.trim();
});
$('#barra-ia-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !$('#barra-ia-enviar').disabled) {
    e.preventDefault();
    aplicarIaNaBarra();
  }
});
$('#barra-ia-enviar').addEventListener('click', aplicarIaNaBarra);

async function aplicarIaNaBarra() {
  if (!estado.pasta) return;
  const instrucao = $('#barra-ia-input').value.trim();
  if (!instrucao) return;
  const noPost = escopoIa === 'post';
  const aviso1 = noPost
    ? 'Aplicar essa mudança no carrossel inteiro re-renderiza o post agora e descarta TODAS as alterações não salvas.'
    : 'Aplicar essa mudança no slide re-renderiza o post agora e descarta TODAS as alterações não salvas (de todos os slides).';
  if (estado.sujo && !await confirmar(aviso1, { okRotulo: 'Aplicar' })) return;

  const input = $('#barra-ia-input');
  const btn = $('#barra-ia-enviar');
  input.disabled = true;
  btn.disabled = true;
  status('#status-barra-ia', noPost ? 'reescrevendo o carrossel inteiro… (2-5 min)' : 'reescrevendo o slide inteiro… (1-2 min)');
  try {
    const corpo = { pasta: estado.pasta, escopo: escopoIa, instrucao };
    if (!noPost) corpo.slideIndex = estado.slideAtual;
    const r = await api('POST', '/api/reescrever', corpo);
    estado.pngs = r.pngs;
    estado.slidesHtml = null;
    limparEdicoesPendentes();
    renderizarTrilha();
    await selecionarSlide(noPost ? Math.min(estado.slideAtual, r.pngs.length - 1) : estado.slideAtual);
    status('#status-barra-ia', noPost ? 'carrossel reescrito.' : 'slide reescrito.');
    input.value = '';
  } catch (e) {
    status('#status-barra-ia', 'erro: ' + e.message, true);
  } finally {
    input.disabled = false;
    btn.disabled = !input.value.trim();
  }
}

// ---------------------------------------------------------------- salvar

$('#btn-salvar-editar').addEventListener('click', salvarEdicoes);

async function salvarEdicoes() {
  if (!estado.pasta) return;
  const btn = $('#btn-salvar-editar');
  btn.disabled = true;
  status('#status-geracao', 'salvando e re-renderizando…');
  try {
    const corpo = {
      pasta: estado.pasta,
      textos: Array.from(estado.textosPendentes.values()),
      posicoes: Array.from(estado.posicoesPendentes.values()),
      overrides: {
        elementos: estado.overridesPendentes.elementos,
        slides: estado.overridesPendentes.slides,
        fonte: estado.overridesPendentes.fonte,
        guias: { margem: estado.margem, travado: estado.travaAreaSegura },
        ...(estado.overridesPendentes.acento !== undefined ? { acento: estado.overridesPendentes.acento } : {}),
      },
    };
    const r = await api('PUT', '/api/editor-html', corpo);
    estado.pngs = r.pngs;
    estado.slidesHtml = null; // força recarregar do servidor com o render novo
    limparEdicoesPendentes();
    renderizarTrilha();
    await selecionarSlide(estado.slideAtual);
    status('#status-geracao',
      (r.avisos && r.avisos.length) ? 'salvo — ' + r.avisos.join(' ') : 'salvo e renderizado.',
      (r.avisos || []).length > 0);
  } catch (e) {
    status('#status-geracao', 'erro ao salvar: ' + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

$('#btn-rerenderizar').addEventListener('click', async () => {
  if (!estado.pasta) return;
  status('#status-geracao', 'renderizando…');
  try {
    const r = await api('POST', '/api/render', { pasta: estado.pasta });
    estado.pngs = r.pngs;
    estado.slidesHtml = null;
    renderizarTrilha();
    await selecionarSlide(estado.slideAtual);
    status('#status-geracao', 'renderizado.');
    atualizarBlocoArquivos(); // a contagem e o peso dos PNGs mudaram
  } catch (e) {
    status('#status-geracao', 'erro: ' + e.message, true);
  }
});

$('#btn-desfazer-editar').addEventListener('click', async () => {
  if (!estado.pasta || !estado.sujo) return;
  if (!await confirmar('Desfaz todo texto, posição e ajuste de design ainda não salvo neste post (todos os slides). Continuar?', { okRotulo: 'Desfazer alterações', perigo: true })) return;
  estado.slidesHtml = null; // força reler do servidor o último estado salvo
  limparEdicoesPendentes();
  renderizarTrilha();
  await selecionarSlide(estado.slideAtual);
  status('#status-geracao', 'alterações desfeitas — voltou pro último salvo.');
});

// ---------------------------------------------------------------- sair do post

// Volta o briefing (esquerda) pros valores em branco/padrão — chamado só por
// "Fechar post", que é o botão pensado pra começar uma criação limpa. Abrir
// um post existente NÃO passa por aqui: ali o objetivo é o oposto, mostrar o
// briefing que gerou aquele post (ver restaurarBriefing).
function limparBriefing() {
  $('#briefing').value = '';
  $('#objetivo').value = 'gerar autoridade';
  $('#prompt-extra').value = '';
  estado.nSlides = 7;
  marcarSegmentado('#seg-slides', '7');
  estado.formato = '4:5';
  marcarSegmentado('#seg-formato', '4:5');
  estado.cta = 1;
  marcarSegmentado('#seg-cta', '1');
  estado.mostrar = 'perfil';
  marcarSegmentado('#seg-mostrar', 'perfil');
  estado.modelo = '';
  marcarSegmentado('#seg-modelo', '');
  estado.templateSelecionado = '';
  $('#template-escolhido-label').textContent = 'Automático';
}

function fecharPost() {
  estado.pasta = null;
  estado.token = null;
  estado.slug = null;
  estado.motor = null;
  estado.pngs = [];
  estado.legenda = '';
  estado.slideAtual = 0;
  estado.head = null;
  estado.slidesHtml = null;
  estado.campos = [];
  estado.slidesMeta = [];
  estado.editidSelecionado = null;
  estado.blocoSelecionado = null;
  limparEdicoesPendentes();

  $('#nome-post').textContent = 'nenhum post aberto';
  $('#painel-editar').hidden = true;
  $('#btn-salvar-editar').hidden = true;
  $('#btn-rerenderizar').hidden = true;
  $('#btn-trava-area').hidden = true;
  $('#zoom-ctrl').hidden = true;
  $('#trilha-acoes').hidden = true;
  $('#btn-sair-post').hidden = true;
  $('#trilha-slides').innerHTML = '';
  $('#canvas-frame-wrap').hidden = true;
  $('#canvas-dica').hidden = true;
  $('#barra-selecao').hidden = true;
  $('#barra-ia').hidden = true;
  $('#barra-ia-input').value = '';
  $('#barra-ia-enviar').disabled = true;
  status('#status-barra-ia', '');
  $('#preview-vazio').hidden = false;
  $('#preview-vazio').innerHTML = PREVIA_VAZIA_HTML;
  $('#campo-legenda').value = '';
  limparBriefing();
  atualizarBlocoArquivos();
}

$('#btn-sair-post').addEventListener('click', async () => {
  if (!estado.pasta) return;
  if (estado.sujo && !await confirmar('Sair sem salvar descarta as alterações não salvas deste post. O post já gerado continua na pasta e no Acervo.', { okRotulo: 'Sair mesmo assim', perigo: true })) return;
  fecharPost();
});

// ---------------------------------------------------------------- trilha

function renderizarTrilha() {
  const trilha = $('#trilha-slides');
  trilha.innerHTML = estado.pngs
    .map((src, i) => `<div class="mini ${i === estado.slideAtual ? 'ativa' : ''}" data-i="${i}" draggable="true">
        <img src="${src}" alt="slide ${i + 1}"><span class="mini-n">${i + 1}</span>
      </div>`)
    .join('');
  $$('.mini', trilha).forEach((el) => {
    el.addEventListener('click', async () => {
      if (Number(el.dataset.i) === estado.slideAtual) return;
      // trocar de slide fica em modo edição: nada é salvo nem re-renderizado
      // aqui — as alterações pendentes (texto, posição, design) continuam
      // guardadas e voltam à tela quando o slide for revisitado. Só "Salvar
      // alterações" manda tudo pro servidor e dispara o render de verdade.
      await selecionarSlide(Number(el.dataset.i));
    });
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.i); el.classList.add('arrastando'); });
    el.addEventListener('dragend', () => el.classList.remove('arrastando'));
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('alvo-drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('alvo-drop'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('alvo-drop');
      const de = Number(e.dataTransfer.getData('text/plain'));
      const para = Number(el.dataset.i);
      if (de === para || Number.isNaN(de)) return;
      const ordem = estado.pngs.map((_, i) => i);
      ordem.splice(para, 0, ordem.splice(de, 1)[0]);
      await reordenarSlides(ordem, para);
    });
  });
}

async function reordenarSlides(ordem, novoAtual) {
  if (estado.sujo && !await confirmar('Isso re-renderiza o post agora e descarta as alterações não salvas. Continuar?', { okRotulo: 'Continuar' })) return;
  status('#status-geracao', 'reorganizando e renderizando…');
  try {
    const r = await api('PUT', '/api/slides', { pasta: estado.pasta, ordem });
    estado.pngs = r.pngs;
    estado.slidesHtml = null;
    limparEdicoesPendentes();
    renderizarTrilha();
    await selecionarSlide(Math.max(0, Math.min(novoAtual, r.pngs.length - 1)));
    status('#status-geracao', 'pronto.');
  } catch (e) {
    status('#status-geracao', 'erro: ' + e.message, true);
  }
}

$('#btn-duplicar-slide').addEventListener('click', async () => {
  if (!estado.pasta) return;
  const i = estado.slideAtual;
  const ordem = [];
  estado.pngs.forEach((_, j) => { ordem.push(j); if (j === i) ordem.push(j); });
  await reordenarSlides(ordem, i + 1);
});

$('#btn-apagar-slide').addEventListener('click', async () => {
  if (!estado.pasta) return;
  if (estado.pngs.length <= 1) { aviso('Não dá pra apagar o único slide do post.'); return; }
  if (!await confirmar(`Apagar o slide ${estado.slideAtual + 1}?`, { okRotulo: 'Apagar', perigo: true })) return;
  const ordem = estado.pngs.map((_, j) => j).filter((j) => j !== estado.slideAtual);
  await reordenarSlides(ordem, Math.max(0, estado.slideAtual - 1));
});

// ---------------------------------------------------------------- banco de imagens

$('#btn-abrir-banco').addEventListener('click', () => { $('#modal-imagens').hidden = false; });
$('#fechar-modal-imagens').addEventListener('click', () => { $('#modal-imagens').hidden = true; });

$$('.abas-imagem button').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.abas-imagem button').forEach((x) => x.classList.remove('ativo'));
    b.classList.add('ativo');
    estado.imagensBusca.fonte = b.dataset.fonte;
    // "da marca" é pra folhear o que já existe, não pra digitar uma busca —
    // troca de aba já carrega, sem esperar Enter/clique em Buscar.
    if (b.dataset.fonte === 'marca') buscarImagens($('#busca-imagem').value.trim());
  })
);

$('#busca-imagem').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-buscar-imagem').click(); });

$('#btn-buscar-imagem').addEventListener('click', () => buscarImagens($('#busca-imagem').value.trim()));

async function buscarImagens(termo) {
  const fonte = estado.imagensBusca.fonte;
  if (!termo && fonte !== 'marca') return; // banco/Google precisam de termo; "da marca" folheia tudo
  const grade = $('#grade-imagens');
  grade.innerHTML = '<p class="ajuda">buscando…</p>';
  try {
    if (fonte === 'banco') {
      const r = await api('GET', `/api/imagens/banco?termo=${encodeURIComponent(termo)}&n=12`);
      estado.imagensBusca.itens = (r.fotos || []).map((f) => ({ ...f, tipo: 'banco' }));
    } else if (fonte === 'google') {
      const r = await api('GET', `/api/imagens/google?termo=${encodeURIComponent(termo)}&n=12`);
      estado.imagensBusca.itens = (r.imagens || []).map((f) => ({ ...f, tipo: 'google' }));
    } else {
      if (!estado.marcaSlug) { grade.innerHTML = '<p class="ajuda">escolhe uma marca primeiro.</p>'; return; }
      const r = await api('GET', `/api/imagens/marca?marca=${encodeURIComponent(estado.marcaSlug)}&termo=${encodeURIComponent(termo)}&n=60`);
      estado.imagensBusca.itens = (r.itens || []).map((f) => ({ ...f, tipo: 'marca' }));
    }
    estado.imagensBusca.selecionado = null;
    renderizarGradeImagens();
  } catch (e) {
    grade.innerHTML = `<p class="ajuda erro">${escaparHtml(e.message)}</p>`;
  }
}

function renderizarGradeImagens() {
  const grade = $('#grade-imagens');
  if (!estado.imagensBusca.itens.length) {
    grade.innerHTML = '<p class="ajuda">nenhum resultado.</p>';
    return;
  }
  // previewUrl vem do servidor (rota /api/preview). A versão anterior montava
  // um src="file:///C:/..." — que uma página http nunca consegue carregar, e
  // por isso a galeria aparecia sempre vazia.
  grade.innerHTML = estado.imagensBusca.itens
    .map((f, i) => `<div class="item-imagem" data-i="${i}">
      ${f.licenciada === false ? '<span class="selo-nao-licenciada">não licenciada</span>' : ''}
      <img src="${escaparHtml(f.previewUrl || '')}" loading="lazy" onerror="this.classList.add('falhou')">
      <div class="credito">${escaparHtml(f.tipo === 'marca' ? (f.pasta && f.pasta !== '.' ? f.pasta : f.nome) : (f.fotografo ? 'foto de ' + f.fotografo : (f.alt || '')))}</div>
    </div>`)
    .join('');
  $$('.item-imagem', grade).forEach((el) =>
    el.addEventListener('click', () => {
      $$('.item-imagem', grade).forEach((x) => x.classList.remove('selecionada'));
      el.classList.add('selecionada');
      estado.imagensBusca.selecionado = Number(el.dataset.i);
    })
  );
}

$('#btn-usar-imagem').addEventListener('click', async () => {
  const idx = estado.imagensBusca.selecionado;
  if (idx == null) { aviso('Escolhe uma foto na grade primeiro.'); return; }
  if (!estado.pasta) { aviso('Abre ou gera um post primeiro.'); return; }
  const item = estado.imagensBusca.itens[idx];
  const btn = $('#btn-usar-imagem');
  btn.disabled = true;
  btn.textContent = 'aplicando…';
  try {
    let arquivos;
    let licenciada = true;
    if (item.tipo === 'banco') {
      // "nome" chega SEM o prefixo "foto-" — buscar-fotos.js adiciona sozinho
      const r = await api('POST', '/api/imagens/banco/baixar', {
        id: item.id, pasta: estado.pasta, nome: `slide${estado.slideAtual + 1}`,
      });
      arquivos = r.arquivos;
    } else if (item.tipo === 'marca') {
      // já é nossa (pasta do cliente) — só copia pra dentro do post, sem
      // "não licenciada": essa marca não se aplica a imagem que já é do
      // próprio cliente.
      const r = await api('POST', '/api/imagens/marca/usar', {
        marca: estado.marcaSlug, id: item.id, pasta: estado.pasta, nome: `slide${estado.slideAtual + 1}`,
      });
      arquivos = r.arquivos;
    } else {
      const r = await api('POST', '/api/imagens/google/baixar', { indices: [item.indice], pasta: estado.pasta });
      arquivos = r.arquivos;
      licenciada = false;
    }
    if (!arquivos || !arquivos.length) throw new Error('a foto não chegou na pasta do post.');
    // /api/imagens/aplicar cobre os DOIS motores — o caminho antigo só existia
    // pro estilo-editorial e no genérico o botão não fazia nada.
    const r2 = await api('POST', '/api/imagens/aplicar', {
      pasta: estado.pasta,
      arquivo: arquivos[arquivos.length - 1],
      slideIndex: estado.slideAtual,
      licenciada,
    });
    estado.pngs = r2.pngs;
    estado.slidesHtml = null;
    renderizarTrilha();
    await selecionarSlide(estado.slideAtual);
    $('#modal-imagens').hidden = true;
  } catch (e) {
    avisoDeErro('Não deu pra aplicar a foto neste slide.', e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Usar neste slide';
  }
});

// ---------------------------------------------------------------- templates

async function carregarTemplates() {
  const grade = $('#grade-templates');
  grade.innerHTML = '<p class="ajuda">carregando…</p>';
  const templates = await api('GET', '/api/templates');
  estado.templatesDisponiveis = templates;
  if (!templates.length) {
    grade.innerHTML = '<p class="ajuda">Nenhum template salvo ainda. Importa um carrossel de referência ao lado, ou salva um post seu como modelo na aba Design.</p>';
    return;
  }
  grade.innerHTML = templates
    .map((t) => `<div class="card-post">
      <img src="/api/arquivo?caminho=${encodeURIComponent(`studio-scault/templates/${t.nome}.png`)}" onerror="this.style.display='none'">
      <div class="meta">
        <div class="slug">${escaparHtml(t.nome)} ${seloTemplate(t)}</div>
        <div class="info">${rotuloSlides(t.totalSlides)}${t.origem ? ' · ' + escaparHtml(t.origem) : ''}${t.tipo === 'fiel' ? ' · reproduz o visual da referência' : ''}</div>
        <div class="linha-botoes">
          <button class="btn btn--line btn-sm" data-aplicar="${escaparHtml(t.nome)}">Aplicar</button>
          <button class="btn btn--line btn-sm btn--danger" data-apagar="${escaparHtml(t.nome)}">${ico('lixo')}</button>
        </div>
      </div></div>`)
    .join('');

  $$('[data-aplicar]', grade).forEach((b) =>
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!estado.pasta) { aviso('Gera ou abre um post primeiro, na aba Criar.'); return; }
      const alvo = (estado.templatesDisponiveis || []).find((t) => t.nome === b.dataset.aplicar);
      if (alvo && alvo.tipo === 'fiel') {
        aviso('Template fiel não se "aplica" num post pronto: ele traz o visual inteiro da referência, então a peça nasce dele. Vai em Criar, escolhe este template e gera.');
        return;
      }
      if (estado.motor !== 'estilo-editorial') { aviso('Aplicar template só funciona em post do motor editorial (o que tem post.json). Este post tem a identidade própria do cliente.'); return; }
      b.textContent = 'aplicando…';
      try {
        const r = await api('POST', `/api/templates/${b.dataset.aplicar}/aplicar`, { pasta: estado.pasta });
        estado.pngs = r.pngs;
        estado.slidesHtml = null;
        limparEdicoesPendentes();
        irParaCriar();
        renderizarTrilha();
        await selecionarSlide(0);
      } catch (e) {
        avisoDeErro('Não deu pra aplicar o template.', e);
      } finally {
        b.textContent = 'Aplicar';
      }
    })
  );
  $$('[data-apagar]', grade).forEach((b) =>
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!await confirmar(`Apagar o template "${b.dataset.apagar}"?`, { okRotulo: 'Apagar', perigo: true })) return;
      try {
        await api('DELETE', `/api/templates/${encodeURIComponent(b.dataset.apagar)}`);
        await carregarTemplates();
        await carregarTemplatePicker();
      } catch (e) {
        avisoDeErro('Não deu pra apagar o template.', e);
      }
    })
  );
}

// ---------------------------------------------------------------- importar referência
//
// Antes: um <input type=file> de uma imagem só, e o resultado saía como um
// dump de JSON num <div>. Agora: solta o carrossel inteiro (um print por
// slide), reordena arrastando as tiras, dá nome, e o template já entra na
// galeria pronto pra usar.

const dropzone = $('#dropzone-extrator');
const inputRefs = $('#input-extrator-print');

dropzone.addEventListener('click', () => inputRefs.click());
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRefs.click(); } });
['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('arrastando'); })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('arrastando'); })
);
dropzone.addEventListener('drop', (e) => adicionarRefs(e.dataTransfer.files));
inputRefs.addEventListener('change', () => adicionarRefs(inputRefs.files));

// a página inteira aceita o arrasto quando a aba Templates está aberta — soltar
// fora da caixinha era o erro mais fácil de cometer
document.addEventListener('dragover', (e) => { if (!$('#view-templates').hidden) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if ($('#view-templates').hidden) return;
  if (e.target.closest('#dropzone-extrator')) return;
  e.preventDefault();
  adicionarRefs(e.dataTransfer.files);
});

function adicionarRefs(fileList) {
  const novos = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
  if (!novos.length) return;
  // ordem alfabética do nome do arquivo: prints de carrossel saem numerados
  // (slide-01, slide-02…) e o navegador não garante a ordem do drop
  novos.sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }));
  novos.forEach((f) => estado.refsTemplate.push({ arquivo: f, url: URL.createObjectURL(f) }));
  if (estado.refsTemplate.length > 20) estado.refsTemplate = estado.refsTemplate.slice(0, 20);
  renderizarRefs();
}

function renderizarRefs() {
  const cont = $('#tiras-referencia');
  cont.innerHTML = estado.refsTemplate
    .map((r, i) => `<div class="tira-ref" data-i="${i}" draggable="true">
        <img src="${r.url}" alt="">
        <span class="n">${i + 1}</span>
        <button class="x" data-remover="${i}" title="Tirar">${ico('fechar')}</button>
      </div>`)
    .join('');
  $$('[data-remover]', cont).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.remover);
      URL.revokeObjectURL(estado.refsTemplate[i].url);
      estado.refsTemplate.splice(i, 1);
      renderizarRefs();
    })
  );
  $$('.tira-ref', cont).forEach((el) => {
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.i); e.stopPropagation(); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const de = Number(e.dataTransfer.getData('text/plain'));
      const para = Number(el.dataset.i);
      if (Number.isNaN(de) || de === para) return;
      estado.refsTemplate.splice(para, 0, estado.refsTemplate.splice(de, 1)[0]);
      renderizarRefs();
    });
  });

  const tem = estado.refsTemplate.length > 0;
  $('#btn-extrair').disabled = !tem;
  $('#campo-nome-template').hidden = !tem;
  $('#btn-extrair').textContent = tem
    ? `Modelar ${estado.refsTemplate.length} slide${estado.refsTemplate.length > 1 ? 's' : ''} de referência`
    : 'Modelar referência';
}

$('#btn-extrair').addEventListener('click', async () => {
  if (!estado.refsTemplate.length) return;
  const btn = $('#btn-extrair');
  btn.disabled = true;
  $('#barra-extrator-wrap').hidden = false;
  limparLog('#log-ia-extrator');
  status('#status-extrator', '');

  const form = new FormData();
  estado.refsTemplate.forEach((r) => form.append('imagens', r.arquivo, r.arquivo.name));
  form.append('nome', $('#nome-template').value.trim());

  try {
    const { jobId } = await apiUpload('/api/extrator', form);
    const r = await ouvirJob(`/api/extrator/${jobId}/eventos`,
      (j) => atualizarProgresso(j, '#barra-extrator-fill', '#barra-extrator-label', '#log-ia-extrator'));
    // a conferência é o que separa "modelado" de "parecido" — quando ela não
    // fecha, o usuário precisa saber ANTES de gerar peça com esse template
    const conf = r.conferencia || {};
    const linhaConf = conf.convergiu === true
      ? 'Conferência de fidelidade: bateu em todos os eixos.'
      : conf.convergiu === false
        ? 'ATENÇÃO: a conferência de fidelidade não fechou. Abre o template e confere antes de usar.'
        : '';
    status('#status-extrator',
      `Template "${r.nome}" modelado — ${rotuloSlides(r.totalSlides)}.\n`
      + (linhaConf ? linhaConf + '\n' : '')
      + `Paleta medida: ${(r.paletaMedida || []).map((p) => p.hex).join(', ')}`,
      conf.convergiu === false);
    estado.refsTemplate.forEach((x) => URL.revokeObjectURL(x.url));
    estado.refsTemplate = [];
    renderizarRefs();
    await carregarTemplates();
    await carregarTemplatePicker();
  } catch (e) {
    status('#status-extrator', 'erro: ' + e.message, true);
  } finally {
    btn.disabled = !estado.refsTemplate.length;
    $('#barra-extrator-wrap').hidden = true;
  }
});

// ---------------------------------------------------------------- acervo

async function carregarAcervo() {
  const grade = $('#grade-acervo');
  grade.innerHTML = '<p class="ajuda">carregando…</p>';
  const itens = await api('GET', '/api/acervo');
  if (!itens.length) { grade.innerHTML = '<p class="ajuda">Nada no acervo ainda.</p>'; return; }

  const porMarca = new Map();
  itens.forEach((p) => {
    const nomeMarca = (estado.marcas.find((m) => m.slug === p.marca) || {}).nome || p.marca;
    if (!porMarca.has(p.marca)) porMarca.set(p.marca, { nome: nomeMarca, slug: p.marca, itens: [] });
    porMarca.get(p.marca).itens.push(p);
  });

  grade.innerHTML = Array.from(porMarca.values())
    .map((grupo) => {
      const marca = estado.marcas.find((m) => m.slug === grupo.slug) || { slug: grupo.slug, nome: grupo.nome };
      return `<div class="grupo-marca">
        <div class="grupo-marca-titulo">${htmlAvatar(marca)}${escaparHtml(grupo.nome)}
          <span class="contagem">${grupo.itens.length} post${grupo.itens.length !== 1 ? 's' : ''}</span></div>
        <div class="grupo-marca-grade">
          ${grupo.itens
            .map((p) => `<div class="card-post" data-pasta="${escaparHtml(p.pasta)}">
                ${p.capa ? `<img src="/api/arquivo?caminho=${encodeURIComponent(p.capa)}">` : '<div class="capa-vazia"></div>'}
                <div class="meta">
                  <div class="slug">${escaparHtml(p.slug)}</div>
                  <div class="info">${p.totalSlides} slides · ${p.motor === 'estilo-editorial' ? 'editorial' : 'cliente'}</div>
                  <div class="linha-botoes">
                    <button class="btn btn--line btn-sm" data-abrir>Abrir</button>
                    <button class="btn btn--line btn-sm btn-so-icone" data-pasta-post title="Abrir a pasta dos PNGs">${ico('pasta')}</button>
                    <button class="btn btn--line btn-sm btn-so-icone" data-exportar-post title="Exportar pra outra pasta">${ico('exportar')}</button>
                    ${p.origem === 'estudio' ? `<button class="btn btn--line btn-sm btn-so-icone btn--danger" data-apagar-post title="Apagar o post">${ico('lixo')}</button>` : ''}
                  </div>
                </div>
              </div>`)
            .join('')}
        </div>
      </div>`;
    })
    .join('');

  $$('.card-post', grade).forEach((card) => {
    const pasta = card.dataset.pasta;
    const abrir = () => abrirPostDoAcervo(pasta);
    card.addEventListener('click', (e) => { if (!e.target.closest('button')) abrir(); });
    card.querySelector('[data-abrir]').addEventListener('click', (e) => { e.stopPropagation(); abrir(); });

    // exportar e abrir a pasta funcionam sem carregar o post no editor — é o
    // caso comum de quem já terminou a peça e só quer os arquivos na mão.
    card.querySelector('[data-pasta-post]').addEventListener('click', (e) => {
      e.stopPropagation();
      abrirPastaDoPost(pasta);
    });
    card.querySelector('[data-exportar-post]').addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalExportar(pasta);
    });

    const apagar = card.querySelector('[data-apagar-post]');
    if (apagar) apagar.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await confirmar('Apagar este post do acervo? A pasta inteira, com os PNGs e a legenda, vai embora.', { okRotulo: 'Apagar post', perigo: true })) return;
      try {
        await api('DELETE', `/api/acervo?pasta=${encodeURIComponent(pasta)}`);
        if (estado.pasta === pasta) { estado.pasta = null; $('#painel-editar').hidden = true; atualizarBlocoArquivos(); }
        await carregarAcervo();
      } catch (err) {
        avisoDeErro('Não deu pra apagar o post.', err);
      }
    });
  });
}

// Abre um post do acervo de volta na aba Criar. Uma chamada só: /api/post
// devolve pasta, token, motor, PNGs e legenda prontos — antes o painel
// adivinhava o nome de cada PNG e errava sempre que a contagem não batia.
async function abrirPostDoAcervo(pasta) {
  if (estado.sujo && !await confirmar('Tem alteração não salva no post aberto. Abrir outro post descarta ela.', { okRotulo: 'Abrir mesmo assim' })) return;
  irParaCriar();
  status('#status-geracao', 'abrindo o post…');
  try {
    const r = await api('GET', `/api/post?pasta=${encodeURIComponent(pasta)}`);
    await abrirPost(r);
    status('#status-geracao', `aberto — ${r.pngs.length} slides.`);
  } catch (e) {
    status('#status-geracao', 'erro ao abrir o post: ' + e.message, true);
  }
}

// ---------------------------------------------------------------- exportar
//
// A outra saída do post, ao lado de Publicar: abrir a pasta onde os PNGs já
// estão e copiar a peça pronta pra qualquer pasta do computador — cliente que
// aprova antes, WhatsApp, deck, agendamento na mão pelo Business Suite.
//
// O destino fica no localStorage porque é preferência de ESTA máquina, não
// dado do negócio: quem exporta pro Desktop uma vez exporta pro Desktop
// sempre, e não faz sentido versionar isso no repositório.

const DESTINOS_CHAVE = 'studio.scault.destinos';

function destinosRecentes() {
  try {
    const lista = JSON.parse(localStorage.getItem(DESTINOS_CHAVE) || '[]');
    return Array.isArray(lista) ? lista.filter(Boolean).slice(0, 4) : [];
  } catch {
    return []; // modo anônimo / storage bloqueado: só perde o atalho
  }
}

function lembrarDestino(caminho) {
  try {
    const lista = [caminho, ...destinosRecentes().filter((d) => d !== caminho)].slice(0, 4);
    localStorage.setItem(DESTINOS_CHAVE, JSON.stringify(lista));
  } catch { /* idem */ }
}

function formatarBytes(n) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Mesmo saneamento do servidor (lib/exportar.js), só pra PREVER o nome na
// tela. Quem decide de verdade é o servidor — aqui é espelho, não regra.
function nomeBaseDoPost(pasta) {
  const bruto = String(pasta || '').split('/').pop() || 'post';
  return bruto.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'post';
}

// post em exportação: pode ser o aberto no editor ou um card do acervo
let exportando = { pasta: null, info: null };
let ultimoDestinoExportado = null;

async function abrirPastaDoPost(pasta) {
  try {
    await api('POST', '/api/exportar/abrir', { pasta: pasta || estado.pasta });
  } catch (e) {
    avisoDeErro('Não deu pra abrir a pasta.', e);
  }
}

// Caminho da pasta no rodapé do editor. Antes o painel não dizia em lugar
// nenhum ONDE o post morava — pra achar os PNGs era garimpar no Explorer.
async function atualizarBlocoArquivos() {
  const alvo = $('#caminho-arquivos');
  const botoes = [$('#btn-abrir-pasta'), $('#btn-exportar')];
  const limpar = () => {
    alvo.classList.remove('clicavel');
    delete alvo.dataset.caminho; // senão o clique copia o caminho do post anterior
    $('#caminho-resumo').textContent = '';
    botoes.forEach((b) => (b.disabled = true));
  };
  if (!estado.pasta) {
    alvo.textContent = 'abre ou gera um post pra ver onde os PNGs ficam.';
    limpar();
    return;
  }
  try {
    const info = await api('GET', `/api/exportar/info?pasta=${encodeURIComponent(estado.pasta)}`);
    alvo.textContent = info.pastaImagensAbs;
    alvo.title = 'clica pra copiar o caminho';
    alvo.classList.add('clicavel');
    alvo.dataset.caminho = info.pastaImagensAbs;
    $('#caminho-resumo').textContent = info.nSlides
      ? `${info.nSlides} PNG · ${formatarBytes(info.bytesSlides)}`
      : 'ainda sem PNG renderizado';
    botoes.forEach((b) => (b.disabled = false));
    $('#btn-exportar').disabled = !info.nSlides;
  } catch (e) {
    alvo.textContent = 'não deu pra ler a pasta: ' + e.message;
    limpar();
  }
}

$('#caminho-arquivos').addEventListener('click', async (e) => {
  const caminho = e.currentTarget.dataset.caminho;
  if (!caminho) return;
  try {
    await navigator.clipboard.writeText(caminho);
    $('#caminho-resumo').textContent = 'caminho copiado';
    setTimeout(atualizarBlocoArquivos, 1600);
  } catch { /* sem permissão de clipboard: o caminho continua visível pra copiar na mão */ }
});

$('#btn-abrir-pasta').addEventListener('click', () => abrirPastaDoPost(estado.pasta));
$('#btn-exportar').addEventListener('click', () => abrirModalExportar(estado.pasta));

// ---- o diálogo ----------------------------------------------------------

async function abrirModalExportar(pastaAlvo) {
  const pasta = pastaAlvo || estado.pasta;
  if (!pasta) { aviso('Abre ou gera um post primeiro.'); return; }

  // Edição pendente = os PNGs no disco ainda são da versão anterior, e é
  // exatamente ELES que a exportação copia. Mesma pergunta que o Publicar
  // faz, pelo mesmo motivo.
  if (pasta === estado.pasta && estado.sujo) {
    const ok = await confirmar(
      'Tem alteração não salva neste post — os PNGs no disco ainda são da versão anterior. Salvar e renderizar antes de exportar?',
      { okRotulo: 'Salvar e seguir' }
    );
    if (!ok) return;
    await salvarEdicoes();
    if (estado.sujo) return;
  }

  let info;
  try {
    info = await api('GET', `/api/exportar/info?pasta=${encodeURIComponent(pasta)}`);
  } catch (e) {
    return avisoDeErro('Não deu pra ler a pasta do post.', e);
  }
  if (!info.nSlides) {
    return aviso('Esse post ainda não tem PNG renderizado. Abre ele e clica em "Renderizar de novo" antes de exportar.');
  }

  exportando = { pasta, info };
  ultimoDestinoExportado = null;

  $('#resumo-exportar').innerHTML = `<strong>${escaparHtml(nomeBaseDoPost(pasta))}</strong>
    <span>${info.nSlides} slides · ${formatarBytes(info.bytesSlides)}</span>`;

  const extras = info.extras.filter((e) => e.existe);
  $('#itens-exportar').innerHTML =
    `<label class="check-linha fixa"><input type="checkbox" checked disabled>
       <span>${info.nSlides} slides PNG<em>${formatarBytes(info.bytesSlides)}</em></span></label>` +
    extras
      .map(
        (e) => `<label class="check-linha ${e.fixo ? 'fixa' : ''}">
          <input type="checkbox" data-extra="${escaparHtml(e.chave)}" ${e.fixo || e.padrao ? 'checked' : ''} ${e.fixo ? 'disabled' : ''}>
          <span>${escaparHtml(e.rotulo)}<em>${e.fixo ? 'vai sempre junto' : formatarBytes(e.bytes)}</em></span>
        </label>`
      )
      .join('') +
    (extras.some((e) => e.fixo)
      ? '<p class="ajuda nota-fixa">Crédito e origem da foto acompanham a peça sempre — é a mesma regra da publicação: quem abrir a pasta depois precisa saber de quem é a imagem.</p>'
      : '');

  const recentes = destinosRecentes();
  const caixaRecentes = $('#destinos-recentes');
  caixaRecentes.hidden = !recentes.length;
  caixaRecentes.innerHTML = recentes
    .map((d) => `<button data-destino="${escaparHtml(d)}" title="${escaparHtml(d)}">${escaparHtml(d.split(/[\\/]/).pop() || d)}</button>`)
    .join('');
  if (recentes.length && !$('#destino-exportar').value) $('#destino-exportar').value = recentes[0];

  $('#btn-abrir-destino').hidden = true;
  status('#status-exportar', '');
  atualizarPreviaExportar();
  $('#modal-exportar').hidden = false;
  setTimeout(() => $('#destino-exportar').focus(), 30);
}

function atualizarPreviaExportar() {
  if (!exportando.info) return;
  const destino = $('#destino-exportar').value.trim().replace(/[\\/]+$/, '');
  const base = nomeBaseDoPost(exportando.pasta);
  const sub = $('#exp-subpasta').checked;
  const ren = $('#exp-renomear').checked;
  const pasta = destino ? (sub ? `${destino}\\${base}` : destino) : '(escolhe o destino)';
  const n = exportando.info.nSlides;
  const primeiro = ren ? `${base}-01.png` : (exportando.info.slides[0] || {}).nome;
  const ultimo = ren
    ? `${base}-${String(n).padStart(2, '0')}.png`
    : (exportando.info.slides[n - 1] || {}).nome;
  $('#previa-caminho').innerHTML = `<span class="rot">vai gravar em</span>
    <code>${escaparHtml(pasta)}</code>
    <span class="rot">${escaparHtml(primeiro)} … ${escaparHtml(ultimo)}</span>`;
}

['#destino-exportar', '#exp-subpasta', '#exp-renomear'].forEach((sel) => {
  $(sel).addEventListener('input', atualizarPreviaExportar);
  $(sel).addEventListener('change', atualizarPreviaExportar);
});

$('#destinos-recentes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-destino]');
  if (!b) return;
  $('#destino-exportar').value = b.dataset.destino;
  atualizarPreviaExportar();
});

$('#fechar-modal-exportar').addEventListener('click', () => ($('#modal-exportar').hidden = true));

// Seletor nativo do Windows. A requisição fica pendurada enquanto a janela
// está aberta — é o esperado: a resposta É a escolha da pessoa.
$('#btn-escolher-destino').addEventListener('click', async () => {
  const btn = $('#btn-escolher-destino');
  btn.disabled = true;
  status('#status-exportar', 'escolhendo a pasta na janela do Windows…');
  try {
    const r = await api('POST', '/api/exportar/escolher', { inicial: $('#destino-exportar').value.trim() });
    if (r.cancelado) { status('#status-exportar', ''); return; }
    $('#destino-exportar').value = r.caminho;
    status('#status-exportar', '');
    atualizarPreviaExportar();
  } catch (e) {
    status('#status-exportar', e.message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#btn-abrir-destino').addEventListener('click', async () => {
  if (!ultimoDestinoExportado) return;
  try {
    await api('POST', '/api/exportar/abrir', { destino: ultimoDestinoExportado });
  } catch (e) {
    avisoDeErro('Não deu pra abrir a pasta.', e);
  }
});

$('#btn-rodar-exportar').addEventListener('click', async () => {
  if (!exportando.pasta) return;
  const destino = $('#destino-exportar').value.trim();
  if (!destino) { status('#status-exportar', 'escolhe a pasta de destino primeiro.', true); return; }

  const corpo = {
    pasta: exportando.pasta,
    destino,
    subpasta: $('#exp-subpasta').checked,
    renomear: $('#exp-renomear').checked,
    incluir: $$('#itens-exportar input[data-extra]:checked').map((i) => i.dataset.extra),
  };

  const btn = $('#btn-rodar-exportar');
  btn.disabled = true;
  status('#status-exportar', 'copiando…');
  try {
    let r = await api('POST', '/api/exportar', corpo);

    // conflito não é erro: o nome do slide é sempre slide-01.png, então
    // exportar dois posts pra mesma pasta sem subpasta colide sempre. O
    // servidor devolve a lista em vez de sobrescrever calado.
    if (!r.ok && r.conflitos) {
      const amostra = r.conflitos.slice(0, 6).join(', ');
      const resto = r.conflitos.length > 6 ? `, +${r.conflitos.length - 6}` : '';
      const sim = await confirmar(
        `Já tem ${r.conflitos.length} arquivo(s) com esse nome em ${r.destinoFinal}:\n\n${amostra}${resto}\n\nSubstituir?`,
        { titulo: 'Arquivo já existe', okRotulo: 'Substituir', perigo: true }
      );
      if (!sim) { status('#status-exportar', 'exportação cancelada.'); return; }
      status('#status-exportar', 'copiando…');
      r = await api('POST', '/api/exportar', { ...corpo, sobrescrever: true });
    }

    lembrarDestino(destino);
    ultimoDestinoExportado = r.destinoFinal;
    $('#btn-abrir-destino').hidden = false;
    status(
      '#status-exportar',
      `pronto — ${r.nSlides} slides${r.nExtras ? ` + ${r.nExtras} arquivo${r.nExtras > 1 ? 's' : ''}` : ''} em ${r.destinoFinal}`
    );
  } catch (e) {
    status('#status-exportar', e.message, true);
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------- publicar

async function carregarContaDestino() {
  const caixa = $('#conta-destino');
  caixa.classList.remove('bloqueada');
  caixa.innerHTML = '<div class="ajuda">conferindo a conta…</div>';
  try {
    const c = await api('GET', `/api/conta?marca=${encodeURIComponent(estado.marcaSlug)}&canal=${estado.canal}`);
    if (!c.configurada) {
      caixa.classList.add('bloqueada');
      caixa.innerHTML = `<div class="motivo">${ico('alerta')}<span>${escaparHtml(c.motivo)}</span></div>`;
      $('#btn-publicar').disabled = true;
      return;
    }
    if (c.erro) {
      caixa.classList.add('bloqueada');
      caixa.innerHTML = `<div class="motivo">${ico('alerta')}<span>${escaparHtml(c.erro)}</span></div>`;
      $('#btn-publicar').disabled = true;
      return;
    }
    $('#btn-publicar').disabled = false;
    caixa.innerHTML = `<div class="conta-linha">
        <span class="avatar grande">${escaparHtml(iniciais(c.nome || c.usuario))}${c.foto ? `<img src="${escaparHtml(c.foto)}" alt="" onerror="this.remove()">` : ''}</span>
        <span>
          <span class="conta-nome">${escaparHtml(c.usuario)}</span><br>
          <span class="conta-sub">${escaparHtml(c.nome || '')}${c.seguidores != null ? ` · ${c.seguidores.toLocaleString('pt-BR')} seguidores` : ''}</span>
        </span>
      </div>`;
  } catch (e) {
    caixa.classList.add('bloqueada');
    caixa.innerHTML = `<div class="motivo">${ico('alerta')}<span>${escaparHtml(e.message)}</span></div>`;
    $('#btn-publicar').disabled = true;
  }
}

$('#btn-publicar').addEventListener('click', async () => {
  if (!estado.pasta) { aviso('Abre ou gera um post primeiro.'); return; }

  if (estado.sujo) {
    if (!await confirmar('Tem alteração não salva neste post. Salvar e renderizar antes de publicar?', { okRotulo: 'Salvar e seguir' })) return;
    await salvarEdicoes();
    if (estado.sujo) return;
  }

  status('#status-publicar', 'conferindo a conta de destino…');
  try {
    const dry = await api('POST', '/api/publicar', {
      pasta: estado.pasta, marca: estado.marcaSlug, canal: estado.canal, confirmar: false,
    });
    status('#status-publicar', dry.stdout);

    let confirmarNaoLicenciada = false;
    if (dry.temImagemNaoLicenciada) {
      confirmarNaoLicenciada = await confirmar(
        'Este post usa imagem do Google Imagens, que não é licenciada. Confirma que já checou a origem em fontes.md e quer publicar mesmo assim?',
        { titulo: 'Imagem sem licença', okRotulo: 'Publicar mesmo assim', perigo: true }
      );
      if (!confirmarNaoLicenciada) { status('#status-publicar', 'publicação cancelada.'); return; }
    }
    const nomeConta = ($('#conta-destino').textContent || '').trim().split(/\s+/).find((t) => t.startsWith('@')) || 'a conta configurada';
    const confirmado = await confirmar(
      `Publicar agora em ${nomeConta}? Isso vai pro ar, no perfil de verdade.`,
      { titulo: 'Publicar de verdade', okRotulo: 'Publicar agora' }
    );
    if (!confirmado) { status('#status-publicar', 'publicação cancelada.'); return; }

    const r = await api('POST', '/api/publicar', {
      pasta: estado.pasta, marca: estado.marcaSlug, canal: estado.canal, confirmar: true,
      confirmarImagemNaoLicenciada: confirmarNaoLicenciada,
    });
    status('#status-publicar', r.stdout);
  } catch (e) {
    status('#status-publicar', 'erro: ' + e.message, true);
  }
});

// ---------------------------------------------------------------- configurações (modelo de IA + conta do Claude Code)

function marcarSegmentado(id, valor) {
  const grupo = $(id);
  if (!grupo) return;
  $$('button', grupo).forEach((b) => b.classList.toggle('ativo', b.dataset.v === (valor || '')));
}

function atualizarStatusAmbiente() {
  const ativa = (estado.contas || []).find((c) => c.ativa);
  $('#status-ambiente').textContent = ativa && ativa.id !== 'padrao' ? `conectado · ${ativa.nome}` : 'conectado';
}

function renderizarListaContas() {
  const contas = estado.contas || [];
  $('#lista-contas').innerHTML = contas.map((c) => {
    const sub = c.pendente ? 'aguardando login…' : (c.email || (c.loggedIn ? 'conta logada' : 'não logada'));
    const acoes = [];
    if (c.pendente) {
      acoes.push(`<button class="btn-mini" data-acao="login" data-id="${escaparHtml(c.id)}">continuar login</button>`);
    } else if (!c.ativa) {
      acoes.push(`<button class="btn-mini" data-acao="ativar" data-id="${escaparHtml(c.id)}">usar esta</button>`);
    }
    if (c.id !== 'padrao') {
      acoes.push(`<button class="btn-icone" data-acao="remover" data-id="${escaparHtml(c.id)}" title="Remover conta">${ico('lixo')}</button>`);
    }
    return `<div class="conta-item${c.ativa ? ' ativa' : ''}">
      <span class="conta-radio">${c.ativa ? ico('check') : ''}</span>
      <div class="conta-info">
        <div class="conta-nome">${escaparHtml(c.nome)}</div>
        <div class="conta-sub${c.pendente ? ' pendente' : ''}">${escaparHtml(sub)}</div>
      </div>
      <div class="conta-acoes">${acoes.join('')}</div>
    </div>`;
  }).join('');
}

async function carregarContas() {
  try {
    estado.contas = await api('GET', '/api/contas');
  } catch {
    estado.contas = [];
  }
  renderizarListaContas();
  atualizarStatusAmbiente();
}

async function carregarPreferencias() {
  try {
    const r = await api('GET', '/api/preferencias');
    estado.modeloAtivo = r.modeloAtivo || '';
  } catch {
    estado.modeloAtivo = '';
  }
  marcarSegmentado('#seg-modelo-padrao', estado.modeloAtivo);
}

// Login demora (espera OAuth no navegador) e usa o MESMO canal job+SSE do
// /api/gerar — só que aqui o "resultado" alimenta o log dentro do modal, não
// uma barra de progresso (não tem % que faça sentido pra um login).
async function iniciarLoginConta(id) {
  $('#login-conta-wrap').hidden = false;
  limparLog('#log-login-conta');
  status('#status-login-conta', 'abrindo o login do Claude Code no navegador…');
  try {
    const { jobId } = await api('POST', `/api/contas/${id}/login`, {});
    const resultado = await ouvirJob(`/api/jobs/${jobId}/eventos`, (j) => {
      sincronizarLog('#log-login-conta', j.log);
      if (j.etapa) status('#status-login-conta', j.etapa);
    });
    status('#status-login-conta', `login concluído${resultado.email ? ' — ' + resultado.email : ''}.`);
    await carregarContas();
  } catch (e) {
    status('#status-login-conta', 'erro: ' + e.message, true);
  }
}

$('#lista-contas').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const { acao, id } = btn.dataset;
  if (acao === 'ativar') {
    try {
      await api('POST', `/api/contas/${id}/ativar`, {});
      await carregarContas();
    } catch (e2) {
      await aviso(e2.message, { titulo: 'Não deu pra trocar de conta' });
    }
  } else if (acao === 'login') {
    iniciarLoginConta(id);
  } else if (acao === 'remover') {
    const nome = btn.closest('.conta-item').querySelector('.conta-nome').textContent;
    const ok = await confirmar(`Remover a conta "${nome}"? As credenciais salvas localmente somem.`, { titulo: 'Remover conta', perigo: true, okRotulo: 'Remover' });
    if (!ok) return;
    try {
      await api('DELETE', `/api/contas/${id}`);
      await carregarContas();
    } catch (e2) {
      await aviso(e2.message, { titulo: 'Não deu pra remover' });
    }
  }
});

$('#btn-nova-conta').addEventListener('click', async () => {
  const nome = await pedirTexto('Como você quer chamar essa conta?', { titulo: 'Adicionar conta', placeholder: 'ex: pessoal, agência' });
  if (!nome) return;
  try {
    const conta = await api('POST', '/api/contas', { nome });
    await carregarContas();
    iniciarLoginConta(conta.id);
  } catch (e) {
    await aviso(e.message, { titulo: 'Não deu pra criar a conta' });
  }
});

ligarSegmentado('#seg-modelo-padrao', async (v) => {
  estado.modeloAtivo = v;
  try {
    await api('PUT', '/api/preferencias', { modeloAtivo: v });
  } catch (e) {
    await aviso('não salvou o modelo padrão: ' + e.message, { titulo: 'Erro' });
  }
});

function abrirModalConfig() {
  $('#modal-config').hidden = false;
  $('#login-conta-wrap').hidden = true;
  carregarContas();
  carregarPreferencias();
}
$('#btn-config').addEventListener('click', abrirModalConfig);
$('#fechar-modal-config').addEventListener('click', () => { $('#modal-config').hidden = true; });
$('#fechar-modal-config-2').addEventListener('click', () => { $('#modal-config').hidden = true; });

// ---------------------------------------------------------------- identidade da marca
//
// Editar nome, @ do Instagram, avatar e paleta de cores de uma marca já
// cadastrada — os 6 tokens que o build.py aceita (ver _TOKENS_MARCA no motor
// estilo-editorial). Foto sobe na hora (mesmo padrão do input-print/áudio);
// nome/@/paleta só gravam ao clicar Salvar.

const TOKENS_PALETA = [
  { chave: 'base', rotulo: 'Fundo' },
  { chave: 'panel', rotulo: 'Painel' },
  { chave: 'accent', rotulo: 'Destaque' },
  { chave: 'text', rotulo: 'Texto' },
  { chave: 'muted', rotulo: 'Muted' },
  { chave: 'dim', rotulo: 'Dim' },
];

// tokenAtivo é ONDE uma sugestão clicada (imagem/documento importado) vai
// parar — o usuário escolhe clicando ou focando um campo de cor antes.
const identidadeEstado = { slug: null, tokenAtivo: 'accent' };

function corValida(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex || '');
}

function marcarTokenAtivo() {
  $$('#paleta-tokens .paleta-token').forEach((el) =>
    el.classList.toggle('ativo', el.dataset.token === identidadeEstado.tokenAtivo)
  );
  // sugestões já na tela (extraídas antes de trocar o campo ativo) precisam
  // do tooltip atualizado — senão diz "usar em: Destaque" com o Fundo focado
  const rotulo = (TOKENS_PALETA.find((t) => t.chave === identidadeEstado.tokenAtivo) || {}).rotulo || '';
  $$('#paleta-candidatos .candidato-cor').forEach((b) => (b.title = `usar em: ${rotulo}`));
}

function renderizarPaletaTokens(paleta) {
  const p = paleta || {};
  $('#paleta-tokens').innerHTML = TOKENS_PALETA
    .map(({ chave, rotulo }) => {
      const v = corValida(p[chave]) ? p[chave].toUpperCase() : '';
      return `<div class="paleta-token ${v ? '' : 'paleta-token-vazio'}" data-token="${chave}">
        <label>${rotulo}</label>
        <input type="color" value="${v || '#000000'}" data-token-cor="${chave}">
        <input type="text" value="${v}" placeholder="sem cor" maxlength="7" data-token-hex="${chave}">
      </div>`;
    })
    .join('');
  marcarTokenAtivo();

  $$('#paleta-tokens input[type=color]').forEach((el) =>
    el.addEventListener('input', () => {
      identidadeEstado.tokenAtivo = el.dataset.tokenCor;
      marcarTokenAtivo();
      const hexInput = $(`#paleta-tokens input[data-token-hex="${el.dataset.tokenCor}"]`);
      hexInput.value = el.value.toUpperCase();
      hexInput.closest('.paleta-token').classList.remove('paleta-token-vazio');
    })
  );
  $$('#paleta-tokens input[type=text]').forEach((el) => {
    el.addEventListener('focus', () => { identidadeEstado.tokenAtivo = el.dataset.tokenHex; marcarTokenAtivo(); });
    el.addEventListener('input', () => {
      const v = el.value.trim();
      if (corValida(v)) $(`#paleta-tokens input[data-token-cor="${el.dataset.tokenHex}"]`).value = v;
      el.closest('.paleta-token').classList.toggle('paleta-token-vazio', !v);
    });
  });
}

function paletaDosTokens() {
  const paleta = {};
  $$('#paleta-tokens input[type=text]').forEach((el) => {
    const v = el.value.trim();
    if (corValida(v)) paleta[el.dataset.tokenHex] = v.toUpperCase();
  });
  return paleta;
}

function abrirModalIdentidade(slug) {
  const marca = estado.marcas.find((m) => m.slug === slug);
  if (!marca) return;
  identidadeEstado.slug = slug;
  identidadeEstado.tokenAtivo = 'accent';

  $('#identidade-nome-titulo').textContent = marca.nome;
  $('#identidade-nome').value = marca.nome || '';
  $('#identidade-handle').value = (marca.instagram && marca.instagram.handle) || '';
  $('#identidade-avatar-preview').outerHTML = htmlAvatar(marca).replace('class="avatar ', 'id="identidade-avatar-preview" class="avatar ');
  renderizarPaletaTokens(marca.paleta);
  $('#paleta-candidatos').innerHTML = '';
  $('#input-paleta-referencia').value = '';
  $('#input-avatar-marca').value = '';
  status('#status-paleta-referencia', '');
  status('#status-avatar-marca', '');
  status('#status-identidade', '');
  $('#modal-identidade').hidden = false;
}

$('#btn-editar-marca-atual').addEventListener('click', () => abrirModalIdentidade(estado.marcaSlug));

$('#btn-trocar-avatar').addEventListener('click', () => $('#input-avatar-marca').click());

$('#input-avatar-marca').addEventListener('change', async () => {
  const arq = $('#input-avatar-marca').files[0];
  if (!arq || !identidadeEstado.slug) return;
  status('#status-avatar-marca', 'enviando…');
  const form = new FormData();
  form.append('arquivo', arq);
  try {
    await apiUpload(`/api/marcas/${identidadeEstado.slug}/avatar`, form);
    await carregarMarcas();
    const marca = estado.marcas.find((m) => m.slug === identidadeEstado.slug);
    $('#identidade-avatar-preview').outerHTML = htmlAvatar(marca).replace('class="avatar ', 'id="identidade-avatar-preview" class="avatar ');
    status('#status-avatar-marca', 'foto atualizada.');
  } catch (e) {
    status('#status-avatar-marca', 'erro: ' + e.message, true);
  }
});

$('#input-paleta-referencia').addEventListener('change', async () => {
  const arq = $('#input-paleta-referencia').files[0];
  if (!arq) return;
  status('#status-paleta-referencia', 'lendo cores da referência…');
  $('#paleta-candidatos').innerHTML = '';
  const form = new FormData();
  form.append('arquivo', arq);
  try {
    const r = await apiUpload('/api/paleta/extrair', form);
    if (!r.candidatos.length) {
      status('#status-paleta-referencia', 'nenhuma cor encontrada nessa referência.');
      return;
    }
    status('#status-paleta-referencia', `${r.candidatos.length} sugestão(ões) — clique num campo de cor acima pra escolher onde ela entra, depois clique na sugestão.`);
    $('#paleta-candidatos').innerHTML = r.candidatos
      .map((c) => `<button type="button" class="candidato-cor" data-hex="${c.hex}" title="usar em: ${TOKENS_PALETA.find((t) => t.chave === identidadeEstado.tokenAtivo).rotulo}">
          <span class="amostra" style="background:${c.hex}"></span>${c.hex}<span class="fonte">${c.fonte === 'texto' ? 'do texto' : 'da imagem'}</span>
        </button>`)
      .join('');
    $$('#paleta-candidatos .candidato-cor').forEach((b) =>
      b.addEventListener('click', () => {
        const hex = b.dataset.hex;
        const alvo = identidadeEstado.tokenAtivo;
        const corInput = $(`#paleta-tokens input[data-token-cor="${alvo}"]`);
        const hexInput = $(`#paleta-tokens input[data-token-hex="${alvo}"]`);
        if (!corInput || !hexInput) return;
        corInput.value = hex;
        hexInput.value = hex;
        hexInput.closest('.paleta-token').classList.remove('paleta-token-vazio');
      })
    );
  } catch (e) {
    status('#status-paleta-referencia', 'erro: ' + e.message, true);
  }
});

$('#btn-salvar-identidade').addEventListener('click', async () => {
  if (!identidadeEstado.slug) return;
  status('#status-identidade', 'salvando…');
  try {
    await api('PUT', `/api/marcas/${identidadeEstado.slug}`, {
      nome: $('#identidade-nome').value.trim(),
      instagram: { handle: $('#identidade-handle').value.trim() },
      paleta: paletaDosTokens(),
    });
    await carregarMarcas();
    $('#modal-identidade').hidden = true;
  } catch (e) {
    status('#status-identidade', 'erro: ' + e.message, true);
  }
});

$('#fechar-modal-identidade').addEventListener('click', () => { $('#modal-identidade').hidden = true; });
$('#fechar-modal-identidade-2').addEventListener('click', () => { $('#modal-identidade').hidden = true; });

// ---------------------------------------------------------------- atalhos

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (estado.pasta) salvarEdicoes();
  }
  // o diálogo tem o próprio Escape (em captura), que resolve a Promise antes
  // de fechar — fechar ele por aqui deixaria quem chamou esperando pra sempre
  if (e.key === 'Escape') $$('.modal-fundo:not(#modal-dialogo)').forEach((m) => { m.hidden = true; });
});

window.addEventListener('beforeunload', (e) => {
  if (!estado.sujo) return;
  e.preventDefault();
  e.returnValue = '';
});

// ---------------------------------------------------------------- boot

(async function iniciar() {
  try {
    await carregarMarcas();
    await carregarTemplatePicker();
    await carregarContas();
    await carregarPreferencias();
  } catch (e) {
    $('#status-ambiente').textContent = 'erro ao conectar: ' + e.message;
  }
})();
