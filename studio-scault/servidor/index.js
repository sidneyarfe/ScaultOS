// studio.scault — servidor local. npm start sobe em localhost:3000.
// Motor de IA: Claude Agent SDK, rodando na sessão logada do Claude Code
// (nunca em API key paga — ver agente.js). Motor de render: build.py +
// Playwright, o mesmo que a skill /carrossel usa pelo terminal — post.json
// é o contrato compartilhado entre os dois caminhos.
'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const marcas = require('./lib/marcas');
const motor = require('./lib/motor');
const agente = require('./lib/agente');
const contasLib = require('./lib/contas');
const preferenciasLib = require('./lib/preferencias');
const imagens = require('./lib/imagens');
const publicarLib = require('./lib/publicar');
const exportarLib = require('./lib/exportar');
const acervoLib = require('./lib/acervo');
const templatesLib = require('./lib/templates');
const ingest = require('./lib/ingest');
const extrator = require('./lib/extrator');
const pele = require('./lib/pele');
const jobs = require('./lib/jobs');
const { apagarArquivo, apagarPasta } = require('./lib/arquivos');

const { RAIZ, PASTA_ESTUDIO } = marcas;
const PASTA_PAINEL = path.join(PASTA_ESTUDIO, 'painel');
const PORTA = process.env.PORTA_ESTUDIO || 3000;

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(PASTA_PAINEL, { etag: false, maxAge: 0 }));

// multer cria a pasta de destino UMA VEZ, no construtor — se ela sumir depois
// (limpeza de temp do Windows, reinício, antivírus), todo upload subsequente
// quebra com ENOENT dentro do próprio middleware, antes do try/catch da rota.
// Garantir que existe agora e de novo a cada requisição (barato, idempotente).
const PASTA_UPLOADS = path.join(os.tmpdir(), 'scaultos-estudio-uploads');
fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
      cb(null, PASTA_UPLOADS);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}`),
  }),
});

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function novaPastaPost(marcaSlug, tema) {
  const data = new Date().toISOString().slice(0, 10);
  let slug = `${slugify(tema) || 'post'}-${data}`;
  let pastaAbs = path.join(PASTA_ESTUDIO, 'acervo', marcaSlug, slug);
  // dois posts do mesmo tema no mesmo dia sobrescreviam um ao outro em
  // silêncio — agora o segundo vira "-2", "-3"…
  let n = 2;
  while (fs.existsSync(pastaAbs)) {
    slug = `${slugify(tema) || 'post'}-${data}-${n++}`;
    pastaAbs = path.join(PASTA_ESTUDIO, 'acervo', marcaSlug, slug);
  }
  return { pastaAbs, slug };
}

// Resolve uma pasta relativa vinda do painel (sempre relativa a RAIZ) pro
// caminho absoluto. Nunca aceita caminho pra fora do projeto.
function resolverPasta(pastaRelativa) {
  if (!pastaRelativa) throw new Error('faltou o caminho da pasta.');
  const abs = path.resolve(RAIZ, String(pastaRelativa));
  const dentro = abs === RAIZ || abs.startsWith(RAIZ + path.sep);
  if (!dentro) throw new Error('caminho fora do projeto — recusado.');
  return abs;
}

function rel(abs) {
  return path.relative(RAIZ, abs).split(path.sep).join('/');
}

// URL de PNG com selo de versão: sem isso o navegador continuava mostrando o
// PNG antigo do cache depois de re-renderizar, e a edição "não fazia nada"
// mesmo tendo funcionado no disco.
function urlArquivo(abs) {
  let v = 0;
  try { v = Math.round(fs.statSync(abs).mtimeMs); } catch { /* arquivo novo */ }
  return `/api/arquivo?caminho=${encodeURIComponent(rel(abs))}&v=${v}`;
}

function pngsParaUrls(pastaAbs, nomes) {
  return nomes.map((n) => urlArquivo(path.join(pastaAbs, 'instagram', n)));
}

// token opaco = pasta relativa em base64url. Serve pro <base href> do iframe
// de prévia: sem isso as fotos e o logo do slide (src/url relativos) tentavam
// carregar de http://localhost:3000/foto.jpg e vinham 404 — a prévia aparecia
// sem imagem nenhuma e parecia "quebrada".
function tokenDaPasta(pastaRelativa) {
  return Buffer.from(String(pastaRelativa), 'utf-8').toString('base64url');
}

function erroHttp(res, e) {
  console.error(e && e.stack ? e.stack : e);
  res.status(400).json({ erro: (e && e.message) || String(e) });
}

// ---------------------------------------------------------------- marcas

app.get('/api/marcas', (req, res) => {
  try {
    res.json(marcas.listar().map((m) => ({
      ...m,
      // `temAvatar:false` faz o painel desenhar direto o monograma, em vez de
      // pedir uma imagem que ele já sabe que não existe — era um 404 por marca
      // sem foto em cada render de lista, enchendo o console de erro à toa.
      temAvatar: !!caminhoAvatarLocal(m),
      avatar: `/api/marca-avatar/${m.slug}`,
    })));
  } catch (e) {
    erroHttp(res, e);
  }
});

// Foto de perfil da marca, pro seletor do painel. Três fontes, nesta ordem:
//   1. arquivo local em marcas/avatares/<slug>.(png|jpg|webp|svg) — o que o
//      Sidney colocar lá manda;
//   2. o `logo` cadastrado no marcas/<slug>.json (SVG da identidade);
//   3. a foto do perfil do Instagram, puxada da Graph API e GRAVADA em
//      marcas/avatares/<slug>.jpg — a URL que a Meta devolve expira em
//      poucos dias, então guardar o arquivo é o que faz o avatar continuar
//      aparecendo amanhã.
// Sem nenhuma das três: 404, e o painel desenha um monograma com as iniciais.
const PASTA_AVATARES = path.join(PASTA_ESTUDIO, 'marcas', 'avatares');

function caminhoAvatarLocal(marca) {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg']) {
    const local = path.join(PASTA_AVATARES, `${marca.slug}.${ext}`);
    if (fs.existsSync(local)) return local;
  }
  if (marca.logo) {
    const abs = path.isAbsolute(marca.logo) ? marca.logo : path.join(RAIZ, marca.logo);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

app.get('/api/marca-avatar/:slug', async (req, res) => {
  try {
    const marca = marcas.obter(req.params.slug);
    fs.mkdirSync(PASTA_AVATARES, { recursive: true });
    const local = caminhoAvatarLocal(marca);
    if (local) return enviarArquivo(res, local);
    const baixado = await baixarAvatarDaConta(marca);
    if (baixado) return enviarArquivo(res, baixado);
    res.status(404).end();
  } catch {
    res.status(404).end();
  }
});

async function baixarAvatarDaConta(marca) {
  try {
    const conta = await publicarLib.contaDestino(marca, 'instagram');
    if (!conta.foto) return null;
    const r = await fetch(conta.foto);
    if (!r.ok) return null;
    const destino = path.join(PASTA_AVATARES, `${marca.slug}.jpg`);
    fs.mkdirSync(PASTA_AVATARES, { recursive: true });
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
    return destino;
  } catch {
    return null;
  }
}

// Aquece o cache de avatares uma vez, ao subir: a URL da foto de perfil que a
// Meta devolve expira em dias, então o valor de guardar é o ARQUIVO. Roda em
// segundo plano e nunca derruba o boot — marca sem conta simplesmente fica
// com o monograma.
(async function aquecerAvatares() {
  try {
    for (const marca of marcas.listar()) {
      if (caminhoAvatarLocal(marca)) continue;
      await baixarAvatarDaConta(marca);
    }
  } catch { /* melhor-esforço */ }
})();

// -------------------------------------------------------- editar identidade
//
// Painel "editar identidade da marca": nome, @ do Instagram, avatar e paleta
// de cores (ver marcas.js#salvar e o comentário em cima de _TOKENS_MARCA no
// build.py — a paleta só é aplicada de verdade pelo motor estilo-editorial,
// mas fica cadastrada em qualquer marca como referência).

app.put('/api/marcas/:slug', (req, res) => {
  try {
    const atualizada = marcas.salvar(req.params.slug, req.body || {});
    res.json({
      ...atualizada,
      temAvatar: !!caminhoAvatarLocal(atualizada),
      avatar: `/api/marca-avatar/${atualizada.slug}`,
    });
  } catch (e) {
    erroHttp(res, e);
  }
});

const EXT_POR_MIME_AVATAR = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};
const EXTENSOES_AVATAR = ['png', 'jpg', 'jpeg', 'webp', 'svg'];

app.post('/api/marcas/:slug/avatar', upload.single('arquivo'), async (req, res) => {
  try {
    const marca = marcas.obter(req.params.slug); // valida o slug antes de tocar em disco
    if (!req.file) throw new Error('nenhum arquivo enviado.');
    const ext = EXT_POR_MIME_AVATAR[req.file.mimetype];
    if (!ext) throw new Error(`formato de imagem não aceito (${req.file.mimetype}). Use PNG, JPG, WEBP ou SVG.`);

    fs.mkdirSync(PASTA_AVATARES, { recursive: true });
    // apaga qualquer avatar antigo primeiro — a extensão pode ter mudado, e
    // caminhoAvatarLocal() lê a PRIMEIRA que encontrar numa ordem fixa, então
    // um .png velho ao lado do .jpg novo faria o antigo continuar aparecendo
    for (const outraExt of EXTENSOES_AVATAR) apagarArquivo(path.join(PASTA_AVATARES, `${marca.slug}.${outraExt}`));

    fs.copyFileSync(req.file.path, path.join(PASTA_AVATARES, `${marca.slug}.${ext}`));
    res.json({ ok: true, avatar: `/api/marca-avatar/${marca.slug}?v=${Date.now()}` });
  } catch (e) {
    erroHttp(res, e);
  } finally {
    if (req.file) apagarArquivo(req.file.path);
  }
});

// Sugestões de cor a partir de uma referência — imagem (mede pixel de verdade,
// paleta.py) ou documento de marca — PDF/DOCX/TXT (hex escrito no texto +
// swatch renderizado da página, paleta-documento.py). Só devolve candidatos;
// quem decide em qual token (fundo/painel/destaque/texto/muted/dim) cada um
// entra é o painel, clicando — o servidor não adivinha função de cor nenhuma.
const EXTENSOES_DOCUMENTO_PALETA = new Set(['.pdf', '.docx', '.txt', '.md']);

app.post('/api/paleta/extrair', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) throw new Error('nenhum arquivo enviado.');
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    let candidatos;
    if (req.file.mimetype.startsWith('image/')) {
      candidatos = (await extrator.medirPaleta(req.file.path)).map((c) => ({ ...c, fonte: 'imagem' }));
    } else if (EXTENSOES_DOCUMENTO_PALETA.has(ext)) {
      candidatos = await extrator.medirPaletaDocumento(req.file.path);
    } else {
      throw new Error(`arquivo não suportado (${ext || req.file.mimetype}). Envie uma imagem, PDF, DOCX ou TXT.`);
    }
    res.json({ candidatos });
  } catch (e) {
    erroHttp(res, e);
  } finally {
    if (req.file) apagarArquivo(req.file.path);
  }
});

// Conta de destino da publicação — @, nome e nº de seguidores, resolvidos na
// Graph API antes de qualquer clique em Publicar.
app.get('/api/conta', async (req, res) => {
  try {
    const marca = marcas.obter(req.query.marca);
    res.json(await publicarLib.contaDestino(marca, req.query.canal || 'instagram'));
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- contas (Claude Code) / preferências
//
// "Conta" aqui é sempre a assinatura do Claude Code (ver agente.js — nunca
// API key paga). Trocar de conta é só apontar o CLAUDE_CONFIG_DIR de cada
// chamada pra outra pasta de credenciais (contas.js); o login em si roda o
// mesmo `claude auth login` do terminal, só que num subprocesso cujo stdout
// vira o log ao vivo do painel (mesmo canal SSE do /api/gerar).

app.get('/api/contas', async (req, res) => {
  try {
    const contas = contasLib.listar();
    const comStatus = await Promise.all(contas.map(async (c) => {
      if (c.pendente) return { ...c, loggedIn: false };
      const s = await contasLib.status(c);
      if (typeof s.loggedIn === 'boolean' && (s.loggedIn || s.email)) {
        return { ...c, loggedIn: s.loggedIn, email: s.email || c.email || null, subscriptionType: s.subscriptionType || c.subscriptionType || null };
      }
      // checagem falhou (subprocesso não respondeu) — confia no cache do
      // registro em vez de mostrar "deslogada" por um problema passageiro.
      return { ...c, loggedIn: true, email: c.email || null, subscriptionType: c.subscriptionType || null };
    }));
    res.json(comStatus);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/contas', (req, res) => {
  try {
    res.json(contasLib.criar(req.body.nome));
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/contas/:id/ativar', (req, res) => {
  try {
    res.json(contasLib.ativar(req.params.id));
  } catch (e) {
    erroHttp(res, e);
  }
});

app.delete('/api/contas/:id', (req, res) => {
  try {
    res.json(contasLib.remover(req.params.id));
  } catch (e) {
    erroHttp(res, e);
  }
});

// Login espera o OAuth no navegador (pode levar minutos ou nunca terminar se
// a pessoa desistir) — mesmo padrão job+SSE do /api/gerar, reaproveitado.
app.post('/api/contas/:id/login', (req, res) => {
  let conta;
  try {
    conta = contasLib.obter(req.params.id);
  } catch (e) {
    return erroHttp(res, e);
  }

  const jobId = jobs.criar();
  res.json({ jobId });

  (async () => {
    try {
      jobs.etapa(jobId, 'abrindo o login do Claude Code…', 10);
      await contasLib.login({ conta, onLinha: (linha) => jobs.logar(jobId, 'login', linha) });
      jobs.etapa(jobId, 'confirmando a conta…', 85);
      const s = await contasLib.status(conta);
      if (!s.loggedIn) throw new Error('o login terminou mas a conta não aparece autenticada — tenta de novo.');
      contasLib.marcarLogada(conta.id, s);
      jobs.concluir(jobId, { id: conta.id, email: s.email || null, subscriptionType: s.subscriptionType || null });
    } catch (e) {
      jobs.falhar(jobId, e);
    }
  })();
});

// mesmo canal SSE do /api/gerar e do /api/extrator, só que sem prefixo de
// feature — o jobId sozinho já basta pra achar o job certo.
app.get('/api/jobs/:jobId/eventos', (req, res) => {
  const job = jobs.obter(req.params.jobId);
  if (!job) return res.status(404).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const enviar = (j) => res.write(`data: ${JSON.stringify(jobs.paraCliente(j))}\n\n`);
  enviar(job);
  const parar = jobs.ouvir(req.params.jobId, (j) => {
    enviar(j);
    if (j.status !== 'rodando') res.end();
  });
  req.on('close', parar);
});

app.get('/api/preferencias', (req, res) => {
  try {
    res.json({ modeloAtivo: preferenciasLib.obterModeloAtivo() });
  } catch (e) {
    erroHttp(res, e);
  }
});

app.put('/api/preferencias', (req, res) => {
  try {
    res.json({ modeloAtivo: preferenciasLib.definirModeloAtivo(req.body.modeloAtivo) });
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- acervo

app.get('/api/acervo', (req, res) => {
  try {
    res.json(acervoLib.listar());
  } catch (e) {
    erroHttp(res, e);
  }
});

app.delete('/api/acervo', (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.query.pasta);
    // trava dupla: só apaga dentro do acervo do próprio estúdio, nunca em
    // marketing/conteudo (que é histórico da marca, não rascunho).
    if (!pastaAbs.startsWith(path.join(PASTA_ESTUDIO, 'acervo') + path.sep)) {
      throw new Error('só dá pra apagar post criado pelo estúdio.');
    }
    if (!apagarPasta(pastaAbs)) throw new Error('não deu pra apagar a pasta inteira — algum arquivo está aberto em outro programa.');
    res.json({ ok: true });
  } catch (e) {
    erroHttp(res, e);
  }
});

// serve arquivo de dentro de uma pasta de post (PNG, post.json, legenda) —
// caminho vem sempre relativo a RAIZ, resolvido e travado por resolverPasta.
app.get('/api/arquivo', (req, res) => {
  try {
    enviarArquivo(res, resolverPasta(req.query.caminho));
  } catch (e) {
    erroHttp(res, e);
  }
});

// Lê o arquivo inteiro pra memória antes de responder, em vez de streamar do
// disco. Os PNGs são reescritos a cada render e o navegador costuma pedir a
// miniatura no meio disso: com sendFile (Content-Length medido antes, stream
// depois) o resultado era ERR_CONTENT_LENGTH_MISMATCH e a miniatura aparecia
// quebrada. Ler primeiro deixa a resposta consistente com o tamanho anunciado.
const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function enviarArquivo(res, abs) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return res.status(404).end();
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch (e) {
    // arquivo trocado embaixo da leitura (render rodando) — uma segunda
    // tentativa resolve; se falhar de novo, 503 e o painel repede.
    try { buf = fs.readFileSync(abs); } catch { return res.status(503).end(); }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}

// serve QUALQUER arquivo de dentro de uma pasta de post, por caminho relativo
// à pasta — é o alvo do <base href> do iframe de prévia.
app.get('/api/pasta/:token/*', (req, res) => {
  try {
    const base = resolverPasta(Buffer.from(req.params.token, 'base64url').toString('utf-8'));
    const alvo = path.resolve(base, decodeURIComponent(req.params[0] || ''));
    if (alvo !== base && !alvo.startsWith(base + path.sep)) return res.status(403).end();
    enviarArquivo(res, alvo);
  } catch (e) {
    erroHttp(res, e);
  }
});

// previews do banco de imagens vivem no temp do sistema, FORA da raiz do
// projeto — resolverPasta recusa (e deve recusar). Rota separada, restrita às
// duas pastas de preview que o próprio servidor cria.
const RAIZES_PREVIEW = [
  path.join(os.tmpdir(), 'scaultos-estudio-fotos'),
  path.join(os.tmpdir(), 'scaultos-gimg'),
  path.join(os.tmpdir(), 'scaultos-gimg-previews'),
];
app.get('/api/preview', (req, res) => {
  try {
    const abs = path.resolve(String(req.query.caminho || ''));
    const ok = RAIZES_PREVIEW.some((r) => abs.startsWith(r + path.sep) || abs.startsWith(r));
    if (!ok) return res.status(403).end();
    enviarArquivo(res, abs);
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- gerar
//
// Assíncrono: devolve um jobId na hora, o painel escuta o progresso de
// verdade por SSE em /api/gerar/:jobId/eventos. O mapeamento de mensagem do
// SDK -> % é um heurístico (não existe "35% pronto" de verdade num LLM),
// mas cada incremento corresponde a um evento real que chegou, não a um
// timer fake.

function progressoDoEvento(msg, atual) {
  if (msg.type === 'system' && msg.subtype === 'init') return { etapa: 'sessão iniciada', progresso: Math.max(atual, 10) };
  if (msg.type === 'assistant') {
    const temTool = (msg.message.content || []).some((b) => b.type === 'tool_use');
    if (temTool) return { etapa: 'escrevendo o post', progresso: Math.min(85, atual + 14) };
    return { etapa: 'pensando na estrutura', progresso: Math.min(78, atual + 5) };
  }
  if (msg.type === 'result') return { etapa: 'conteúdo pronto', progresso: 88 };
  return null;
}

const ROTULOS_MODELO = {
  'claude-sonnet-5': 'Sonnet 5',
  'claude-opus-5': 'Opus 5',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
};

function rotuloModelo(modelo) {
  return ROTULOS_MODELO[modelo] || (modelo ? modelo : 'padrão da assinatura');
}

// Preview detalhado (log ao vivo) do que o agente está fazendo — evento cru
// do SDK vira 0+ linhas legíveis. `progressoDoEvento` acima decide a % da
// barra; esta decide o que aparece no console abaixo dela. Reaproveitado
// pelo /api/gerar E pelo /api/extrator (mesmo formato de mensagem do SDK).
function logDoEvento(msg) {
  const linhas = [];
  if (msg.type === 'system' && msg.subtype === 'init') {
    linhas.push({ tipo: 'sistema', texto: 'sessão do Claude Code iniciada' });
  } else if (msg.type === 'assistant') {
    for (const b of msg.message.content || []) {
      if (b.type === 'tool_use') {
        const alvo = b.input && (b.input.file_path || b.input.path);
        linhas.push({ tipo: 'ferramenta', texto: `usando ${b.name}${alvo ? ` → ${path.basename(alvo)}` : ''}` });
      } else if (b.type === 'text' && b.text && b.text.trim()) {
        linhas.push({ tipo: 'texto', texto: b.text.trim().slice(0, 240) });
      }
    }
  } else if (msg.type === 'result') {
    linhas.push(msg.is_error
      ? { tipo: 'erro', texto: 'o motor sinalizou um erro — o agente vai tentar corrigir' }
      : { tipo: 'ok', texto: 'conteúdo pronto' });
  }
  return linhas;
}

// O briefing (tema, objetivo, prompt, nº de slides, formato, CTA, rodapé,
// modelo de IA, template) só existia na memória do navegador enquanto durava
// UMA geração — fechar a aba, recarregar a página ou reabrir o post do
// Acervo no dia seguinte perdia tudo, sem jeito de saber com que instrução
// aquele post tinha sido gerado. Grava num sidecar na própria pasta do post,
// igual o estúdio já faz com design (estudio-edicoes.json).
const ARQ_BRIEFING = 'estudio-briefing.json';

function salvarBriefing(pastaAbs, dados) {
  const registro = {
    briefing: dados.briefing || '',
    objetivo: dados.objetivo || '',
    promptExtra: dados.promptExtra || '',
    nSlides: dados.nSlides || null,
    formato: dados.formato || '4:5',
    cta: dados.cta !== false && dados.cta !== 0 && dados.cta !== '0',
    mostrar: dados.mostrar || 'perfil',
    modelo: dados.modelo || '',
    templateNome: dados.templateNome || '',
    criadoEm: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(pastaAbs, ARQ_BRIEFING), JSON.stringify(registro, null, 2), 'utf-8');
}

function lerBriefing(pastaAbs) {
  const p = path.join(pastaAbs, ARQ_BRIEFING);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null; // sidecar corrompido nunca pode travar a abertura do post
  }
}

function estadoDoPost(pastaAbs, marcaSlug, motorNome, slug) {
  const pngs = motor.listarPngs(pastaAbs);
  const legendaPath = path.join(pastaAbs, 'legenda.md');
  return {
    pasta: rel(pastaAbs),
    token: tokenDaPasta(rel(pastaAbs)),
    slug,
    marca: marcaSlug,
    motor: motorNome,
    post: motor.lerPost(pastaAbs),
    legenda: fs.existsSync(legendaPath) ? fs.readFileSync(legendaPath, 'utf-8') : '',
    pngs: pngsParaUrls(pastaAbs, pngs),
    briefing: lerBriefing(pastaAbs),
  };
}

// Geração de uma peça MODELADA (template com pele fiel). Separada porque tem
// um loop que as outras não têm: o pele.escreverCarrossel RECUSA o que o
// agente escreveu quando ele inventa classe, muda a contagem de slides ou
// tenta restilizar por style inline. Recusar sem dar chance de conserto
// jogaria fora uma geração inteira por causa de uma classe — então o erro
// volta pro agente com o texto exato do que foi recusado.
//
// É aqui que a fidelidade deixa de ser pedido e vira garantia: o CSS da
// referência é injetado pelo servidor, e a marca só toca nos nós data-perfil.
async function gerarPecaModelada({
  jobId, pastaAbs, marca, template, briefing, objetivo, promptExtra, onEvento, modelo, tentativas = 2,
}) {
  let erroAnterior = null;
  let slidesAnteriores = null;

  for (let i = 0; i <= tentativas; i++) {
    const r = await agente.gerarComPeleFiel({
      pastaAbs, briefing, objetivo, marca, promptExtra, template, onEvento, modelo,
      erroAnterior, slidesAnteriores,
    });
    if (r.legenda) fs.writeFileSync(path.join(pastaAbs, 'legenda.md'), r.legenda, 'utf-8');

    try {
      const montado = pele.escreverCarrossel(pastaAbs, template, r.slidesHtml, {
        marca,
        avatarAbs: caminhoAvatarLocal(marca),
        titulo: 'peça modelada',
      });
      montado.avisos.forEach((a) => jobs.logar(jobId, 'aviso', a));
      if (montado.perfilPreenchido.length) {
        jobs.logar(jobId, 'etapa', `perfil da marca preenchido no template: ${montado.perfilPreenchido.join(', ')}`);
      } else if (pele.temPerfil(template)) {
        jobs.logar(jobId, 'aviso',
          'o template tem bloco de perfil, mas a marca não tem nome/@/avatar cadastrado — ' +
          'os campos ficaram com o texto da referência. Preenche o cadastro da marca.');
      }
      return montado;
    } catch (e) {
      if (i >= tentativas) throw e;
      erroAnterior = e.message;
      slidesAnteriores = r.slidesHtml;
      jobs.logar(jobId, 'aviso', `trava de fidelidade recusou a peça — pedindo correção: ${e.message}`);
    }
  }
  return null;
}

app.post('/api/gerar', async (req, res) => {
  const {
    marca: marcaSlug, briefing, objetivo, promptExtra, nSlides, tema, templateNome, formato,
    cta, mostrar, modelo,
  } = req.body;
  let marca;
  try {
    if (!marcaSlug || !briefing) throw new Error('faltam "marca" e "briefing".');
    marca = marcas.obter(marcaSlug);
  } catch (e) {
    return erroHttp(res, e);
  }

  const jobId = jobs.criar();
  res.json({ jobId });

  (async () => {
    try {
      const { pastaAbs, slug } = novaPastaPost(marcaSlug, tema || briefing.slice(0, 40));
      jobs.etapa(jobId, 'preparando pasta do post', 5);
      motor.prepararPasta(pastaAbs, marca);
      salvarBriefing(pastaAbs, { briefing, objetivo, promptExtra, nSlides, formato, cta, mostrar, modelo, templateNome });

      const template = templateNome ? templatesLib.obter(templateNome) : null;
      const onEvento = (msg) => {
        const p = progressoDoEvento(msg, jobs.obter(jobId).progresso);
        if (p) jobs.atualizar(jobId, p);
        logDoEvento(msg).forEach((l) => jobs.logar(jobId, l.tipo, l.texto));
      };

      jobs.etapa(jobId, 'buscando fotos (Pexels/Unsplash)…', 7);
      const contaAtiva = contasLib.obterAtiva();
      const modeloEfetivo = modelo || preferenciasLib.obterModeloAtivo();
      jobs.etapa(jobId, `chamando o Claude Code — ${rotuloModelo(modeloEfetivo)} · conta ${contaAtiva.nome}`, 9);

      // Pele fiel ganha do motor cadastrado na marca. Um template importado de
      // referência TEM visual próprio — é ele que manda, não o design system de
      // quem publica. A marca só entra pelos nós data-perfil (avatar/nome/@),
      // e é o pele.escreverCarrossel quem os preenche. Ver lib/pele.js.
      const fiel = pele.ehFiel(template);
      const motorEfetivo = fiel ? 'carrossel-generico' : marca.motor;

      if (fiel) {
        await gerarPecaModelada({
          jobId, pastaAbs, marca, template, briefing, objetivo, promptExtra, onEvento, modelo,
        });
      } else if (marca.motor === 'estilo-editorial') {
        await agente.gerarPostJson({ pastaAbs, briefing, objetivo, nSlides, marca, promptExtra, template, onEvento, formato, cta, mostrar, modelo });
      } else {
        const r = await agente.gerarCarrosselGenerico({ pastaAbs, briefing, objetivo, nSlides, marca, promptExtra, template, raizProjeto: RAIZ, onEvento, formato, cta, mostrar, modelo });
        if (r.legenda) fs.writeFileSync(path.join(pastaAbs, 'legenda.md'), r.legenda, 'utf-8');
      }

      jobs.etapa(jobId, 'renderizando os slides…', 90);
      if (motorEfetivo === 'estilo-editorial') {
        await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson, marca });
      } else {
        motor.renderizar(pastaAbs, { temPostJson: false, marca });
      }

      jobs.concluir(jobId, estadoDoPost(pastaAbs, marcaSlug, motorEfetivo, slug));
    } catch (e) {
      jobs.falhar(jobId, e);
    }
  })();
});

// status pontual do job (JSON simples) — usado por quem não pode manter uma
// conexão SSE aberta; o painel em si usa a rota /eventos abaixo.
app.get('/api/gerar/:jobId', (req, res) => {
  const job = jobs.obter(req.params.jobId);
  if (!job) return res.status(404).json({ erro: 'job não encontrado' });
  res.json(jobs.paraCliente(job));
});

// SSE — o painel abre um EventSource nisto e recebe cada atualização de
// progresso assim que acontece, sem precisar dar poll.
app.get('/api/gerar/:jobId/eventos', (req, res) => {
  const job = jobs.obter(req.params.jobId);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const enviar = (j) => res.write(`data: ${JSON.stringify(jobs.paraCliente(j))}\n\n`);
  enviar(job);

  const parar = jobs.ouvir(req.params.jobId, (j) => {
    enviar(j);
    if (j.status !== 'rodando') res.end();
  });
  req.on('close', parar);
});

// ---------------------------------------------------------------- abrir/editar

// abre um post que já existe (acervo) com tudo que o editor precisa numa
// chamada só — antes o painel montava a URL de cada PNG no chute, adivinhando
// o padrão do nome, e errava sempre que o post tinha outra contagem.
app.get('/api/post', (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.query.pasta);
    const motorNome = motor.temPostJson(pastaAbs) ? 'estilo-editorial' : 'carrossel-generico';
    res.json(estadoDoPost(pastaAbs, req.query.marca || marcaDaPasta(pastaAbs), motorNome, path.basename(pastaAbs)));
  } catch (e) {
    erroHttp(res, e);
  }
});

// A marca de um post está no caminho: estudio/acervo/<marca>/<slug>. Post
// pré-estúdio (marketing/conteudo) é sempre da Scault. Sem isto o painel
// abria um post de cliente com a marca errada selecionada — e o botão
// publicar apontava pra conta errada.
function marcaDaPasta(pastaAbs) {
  const base = path.join(PASTA_ESTUDIO, 'acervo') + path.sep;
  if (pastaAbs.startsWith(base)) {
    const slug = pastaAbs.slice(base.length).split(path.sep)[0];
    try { marcas.obter(slug); return slug; } catch { return null; }
  }
  return 'scault';
}

// salva post.json editado no painel e re-renderiza
app.put('/api/post', async (req, res) => {
  try {
    const { pasta: pastaRelativa, post, renderizar: querRenderizar = true } = req.body;
    const pastaAbs = resolverPasta(pastaRelativa);
    if (!post || !Array.isArray(post.slides) || !post.slides.length) {
      throw new Error('post.json precisa de pelo menos um slide.');
    }
    motor.escreverPost(pastaAbs, post);
    if (!querRenderizar) return res.json({ ok: true, pngs: pngsParaUrls(pastaAbs, motor.listarPngs(pastaAbs)) });
    const saida = await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson });
    res.json({
      ok: true,
      post: motor.lerPost(pastaAbs), // pode ter mudado na autocorreção
      pngs: pngsParaUrls(pastaAbs, saida.pngs),
    });
  } catch (e) {
    erroHttp(res, e);
  }
});

// re-render puro (sem tocar em conteúdo) — o botão "renderizar de novo"
app.post('/api/render', async (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.body.pasta);
    const saida = motor.temPostJson(pastaAbs)
      ? await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson })
      : motor.renderizar(pastaAbs, { temPostJson: false });
    res.json({ ok: true, pngs: pngsParaUrls(pastaAbs, saida.pngs) });
  } catch (e) {
    erroHttp(res, e);
  }
});

// editor universal — funciona pros dois motores. Devolve o <head> + o
// outerHTML de cada slide (o canvas do painel é um iframe com isso, não uma
// captura de tela) junto com os campos de texto e os blocos arrastáveis.
app.get('/api/editor-html', (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.query.pasta);
    const r = motor.extrairTextosEditaveis(pastaAbs);
    res.json({ ...r, token: tokenDaPasta(rel(pastaAbs)) });
  } catch (e) {
    erroHttp(res, e);
  }
});

// Salva uma leva de edições e re-renderiza. É o botão "Salvar" do painel, e é
// o único lugar que sabe pra ONDE cada tipo de edição vai:
//
//   texto/destaque   -> post.json (motor editorial) | carrossel.html (genérico)
//   posição de bloco -> post.json "posBlocos"        | style inline no HTML
//   design (fonte, cor, tamanho, filtro de foto) -> sidecar estudio-edicoes.json,
//                                                   nos DOIS motores
//
// Antes o painel decidia isso do lado dele, chamava PUT /api/post pro editorial
// e PUT /api/editor-html pro genérico, e o caminho editorial simplesmente não
// gravava nada quando o texto vinha do canvas.
app.put('/api/editor-html', async (req, res) => {
  try {
    const {
      pasta: pastaRelativa, textos, posicoes, fundos, ordem, substituicoes, overrides,
      renderizar: querRenderizar = true,
    } = req.body;
    const pastaAbs = resolverPasta(pastaRelativa);
    const editorial = motor.temPostJson(pastaAbs);
    const avisos = [];

    if (editorial) {
      if ((textos || []).length) {
        const dados = motor.extrairTextosEditaveis(pastaAbs);
        const r = motor.aplicarTextosNoPost(pastaAbs, dados.campos, textos);
        if (r.naoMapeados.length) {
          avisos.push(
            `${r.naoMapeados.length} campo(s) não têm nó correspondente no post.json ` +
            '(texto gerado dentro de uma primitiva ilustrada) e ficaram como estavam — ' +
            'use "reescrever slide" pra mexer neles.'
          );
        }
      }
      if ((posicoes || []).length) {
        const post = motor.lerPost(pastaAbs);
        posicoes.forEach((p) => {
          const sl = post.slides[p.slide - 1];
          if (!sl) return;
          sl.posBlocos = sl.posBlocos || {};
          if (p.x === null || p.y === null) delete sl.posBlocos[p.blk];
          else sl.posBlocos[p.blk] = { x: p.x, y: p.y };
        });
        motor.escreverPost(pastaAbs, post);
      }
    }

    if (overrides) motor.mesclarOverrides(pastaAbs, overrides);

    if (!querRenderizar) {
      return res.json({ ok: true, avisos, pngs: pngsParaUrls(pastaAbs, motor.listarPngs(pastaAbs)) });
    }

    let saida;
    if (editorial) {
      saida = await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson });
    } else {
      saida = motor.aplicarEdicoesHtml(pastaAbs, {
        textos: textos || [],
        posicoes: posicoes || [],
        fundos: fundos || [],
        substituicoes: substituicoes || [],
        overrides,
        ...(Array.isArray(ordem) ? { ordem } : {}),
      });
    }
    res.json({
      ok: true,
      avisos,
      post: editorial ? motor.lerPost(pastaAbs) : null,
      pngs: pngsParaUrls(pastaAbs, saida.pngs),
    });
  } catch (e) {
    erroHttp(res, e);
  }
});

// reordenar / duplicar / apagar slides. `ordem` = índices atuais na ordem
// final desejada (repetido duplica, ausente apaga) — um contrato só pros dois
// motores.
app.put('/api/slides', async (req, res) => {
  try {
    const { pasta: pastaRelativa, ordem } = req.body;
    const pastaAbs = resolverPasta(pastaRelativa);
    if (!Array.isArray(ordem) || !ordem.length) throw new Error('"ordem" precisa ser uma lista não vazia.');

    if (motor.temPostJson(pastaAbs)) {
      const post = motor.lerPost(pastaAbs);
      const novos = ordem.map((i) => post.slides[i]).filter(Boolean);
      if (!novos.length) throw new Error('a nova ordem não sobrou nenhum slide válido.');
      // clone profundo: sem isso um slide duplicado compartilharia o mesmo
      // objeto do original e editar um mudaria os dois.
      post.slides = JSON.parse(JSON.stringify(novos));
      motor.escreverPost(pastaAbs, post);
      // os overrides de design estão ancorados no número do slide — sem
      // remapear, o ajuste do slide 3 pula pro que tomou o lugar dele
      motor.remapearOverridesPorOrdem(pastaAbs, ordem);
      const saida = await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson });
      return res.json({ ok: true, post: motor.lerPost(pastaAbs), pngs: pngsParaUrls(pastaAbs, saida.pngs) });
    }

    const saida = motor.aplicarEdicoesHtml(pastaAbs, { ordem });
    res.json({ ok: true, pngs: pngsParaUrls(pastaAbs, saida.pngs) });
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- legenda

app.get('/api/legenda', (req, res) => {
  try {
    const p = path.join(resolverPasta(req.query.pasta), 'legenda.md');
    res.json({ legenda: fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '' });
  } catch (e) {
    erroHttp(res, e);
  }
});

app.put('/api/legenda', (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.body.pasta);
    fs.writeFileSync(path.join(pastaAbs, 'legenda.md'), String(req.body.legenda || ''), 'utf-8');
    res.json({ ok: true });
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- reescrita assistida

app.post('/api/reescrever', async (req, res) => {
  try {
    const { pasta: pastaRelativa, escopo, instrucao } = req.body;
    const pastaAbs = resolverPasta(pastaRelativa);

    if (escopo === 'texto') {
      const novo = await agente.reescreverTexto({
        pastaAbs,
        texto: String(req.body.texto || ''),
        instrucao,
        contexto: req.body.contexto,
      });
      return res.json({ ok: true, texto: novo });
    }

    // "não gostou da legenda? reescreve" — mesma primitiva de reescrita, mas
    // gravando direto no legenda.md, que é de onde postar-instagram.js lê.
    if (escopo === 'legenda') {
      const arq = path.join(pastaAbs, 'legenda.md');
      const atual = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf-8') : '';
      if (!atual.trim()) throw new Error('não há legenda pra reescrever nesta pasta.');
      const post = motor.lerPost(pastaAbs);
      const novo = await agente.reescreverTexto({
        pastaAbs,
        texto: atual,
        instrucao: instrucao || 'Reescreva a legenda inteira mantendo o assunto, com outro ângulo de abertura e as hashtags no fim.',
        contexto: post ? JSON.stringify(post.slides).slice(0, 1500) : '',
      });
      fs.writeFileSync(arq, novo.endsWith('\n') ? novo : novo + '\n', 'utf-8');
      return res.json({ ok: true, legenda: novo });
    }

    if (escopo === 'slide') {
      const i = Number(req.body.slideIndex);
      if (!Number.isInteger(i) || i < 0) throw new Error('slideIndex inválido.');

      if (motor.temPostJson(pastaAbs)) {
        const post = motor.lerPost(pastaAbs);
        if (!post.slides[i]) throw new Error(`o post não tem slide ${i + 1}.`);
        const novo = await agente.reescreverSlide({ pastaAbs, post, slideIndex: i, instrucao });
        post.slides[i] = novo;
        motor.escreverPost(pastaAbs, post);
        const saida = await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson });
        return res.json({ ok: true, post: motor.lerPost(pastaAbs), pngs: pngsParaUrls(pastaAbs, saida.pngs) });
      }

      const dados = motor.extrairTextosEditaveis(pastaAbs);
      const htmlAtual = dados.slidesHtml[i];
      if (!htmlAtual) throw new Error(`o post não tem slide ${i + 1}.`);
      const novoHtml = await agente.reescreverSlideHtml({
        pastaAbs, htmlAtual, slideIndex: i, total: dados.slidesHtml.length, instrucao,
      });
      const saida = motor.aplicarEdicoesHtml(pastaAbs, { substituicoes: [{ slide: i + 1, html: novoHtml }] });
      return res.json({ ok: true, pngs: pngsParaUrls(pastaAbs, saida.pngs) });
    }

    // "post" = o carrossel INTEIRO numa tacada só — diferente de "slide",
    // aqui design e layout também estão liberados (ver comentário em
    // reescreverPost/reescreverCarrosselHtml em lib/agente.js). O servidor
    // confere que a quantidade de slides não mudou antes de gravar: se
    // mudasse, a trilha de PNGs (que o painel já tem carregada) ficaria
    // dessincronizada do post.
    if (escopo === 'post') {
      if (motor.temPostJson(pastaAbs)) {
        const post = motor.lerPost(pastaAbs);
        const novo = await agente.reescreverPost({ pastaAbs, post, instrucao });
        if (novo.slides.length !== post.slides.length) {
          throw new Error(`a reescrita voltou com ${novo.slides.length} slide(s), mas o post tem ${post.slides.length} — descartada pra não quebrar a trilha.`);
        }
        motor.escreverPost(pastaAbs, novo);
        const saida = await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson });
        return res.json({ ok: true, post: motor.lerPost(pastaAbs), pngs: pngsParaUrls(pastaAbs, saida.pngs) });
      }

      const caminhoHtml = path.join(pastaAbs, 'carrossel.html');
      const htmlAtual = fs.readFileSync(caminhoHtml, 'utf-8');
      // conta só <div class="slide ..."> de verdade — "slide" como token isolado
      // na lista de classes, senão "slide-icon"/"slideshow" também contariam.
      const CONTA_SLIDES = /<div\b[^>]*\bclass="(?:[^"]*\s)?slide(?:\s[^"]*)?"/gi;
      const totalAtual = (htmlAtual.match(CONTA_SLIDES) || []).length;
      const novoHtml = await agente.reescreverCarrosselHtml({ pastaAbs, htmlAtual, total: totalAtual, instrucao });
      const totalNovo = (novoHtml.match(CONTA_SLIDES) || []).length;
      if (totalNovo !== totalAtual) {
        throw new Error(`a reescrita voltou com ${totalNovo} slide(s), mas o post tem ${totalAtual} — descartada pra não quebrar a trilha.`);
      }
      fs.writeFileSync(caminhoHtml, novoHtml, 'utf-8');
      const saida = motor.renderizar(pastaAbs, { temPostJson: false });
      return res.json({ ok: true, pngs: pngsParaUrls(pastaAbs, saida.pngs) });
    }

    throw new Error('escopo precisa ser "texto", "legenda", "slide" ou "post".');
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- ingestão

app.post('/api/ingest/link', async (req, res) => {
  try {
    const { url, pasta: pastaRelativa } = req.body;
    const r = await ingest.ingerirLink(url, resolverPasta(pastaRelativa || 'estudio/acervo/_referencias-soltas'));
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/ingest/youtube', async (req, res) => {
  try {
    const { url, pasta: pastaRelativa } = req.body;
    const r = await ingest.ingerirYoutube(url, resolverPasta(pastaRelativa || 'estudio/acervo/_referencias-soltas'));
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/ingest/audio', upload.single('audio'), async (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.body.pasta || 'estudio/acervo/_referencias-soltas');
    const r = await ingest.ingerirAudio(req.file.path, pastaAbs, { descricao: req.body.descricao });
    apagarArquivo(req.file.path);
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/ingest/print', upload.single('imagem'), async (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.body.pasta || 'estudio/acervo/_referencias-soltas');
    const destino = path.join(pastaAbs, 'referencias', path.basename(req.file.originalname));
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(req.file.path, destino);
    apagarArquivo(req.file.path);
    const r = ingest.ingerirPrint(destino, pastaAbs);
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- imagens

app.get('/api/imagens/banco', async (req, res) => {
  try {
    const { termo, n, orientacao, fonte, cor } = req.query;
    const r = await imagens.buscarBanco(termo, { n: n && Number(n), orientacao, fonte, cor });
    // preview é caminho de arquivo no temp — o painel não consegue carregar
    // file:// de dentro de uma página http. Vira URL da rota /api/preview.
    r.fotos = (r.fotos || []).map((f) => ({
      ...f,
      previewUrl: f.preview ? `/api/preview?caminho=${encodeURIComponent(f.preview)}` : null,
    }));
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.get('/api/imagens/google', async (req, res) => {
  try {
    const { termo, n } = req.query;
    const r = await imagens.buscarGoogle(termo, { n: n && Number(n) });
    r.imagens = (r.imagens || []).map((f) => ({
      ...f,
      previewUrl: f.preview ? `/api/preview?caminho=${encodeURIComponent(f.preview)}` : null,
    }));
    res.json(r); // cada item já vem com licenciada:false — o painel usa isso pro selo
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/imagens/banco/baixar', async (req, res) => {
  try {
    const { id, pasta: pastaRelativa, nome } = req.body;
    const r = await imagens.baixarBanco(id, { pastaAbs: resolverPasta(pastaRelativa), nome });
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/imagens/google/baixar', async (req, res) => {
  try {
    const { indices, pasta: pastaRelativa } = req.body;
    const r = await imagens.baixarGoogle(indices, { pastaAbs: resolverPasta(pastaRelativa) });
    res.json(r); // r.licenciada === false sempre — o post carrega o guardrail na publicação
  } catch (e) {
    erroHttp(res, e);
  }
});

// terceira fonte, ao lado de banco (Pexels/Unsplash) e Google Imagens: foto
// que já está no sistema, na pasta do próprio cliente (site, fotos, conteúdo
// já entregue) — imagens.pastaDaMarca resolve a partir de marcas/*.json,
// nunca de um caminho que o painel mande, então não dá pra pedir arquivo de
// fora da pasta da marca.
app.get('/api/imagens/marca', async (req, res) => {
  try {
    const marca = marcas.obter(req.query.marca);
    const pastaAbs = imagens.pastaDaMarca(marca);
    if (!pastaAbs) return res.json({ itens: [] });
    const achados = await imagens.buscarMarca(pastaAbs, {
      termo: req.query.termo,
      n: req.query.n && Number(req.query.n),
    });
    res.json({
      itens: achados.map((f) => ({
        id: f.rel,
        nome: path.basename(f.rel),
        pasta: path.dirname(f.rel),
        tamanho: f.tamanho,
        previewUrl: `/api/imagens/marca/preview?marca=${encodeURIComponent(marca.slug)}&id=${encodeURIComponent(f.rel)}`,
      })),
    });
  } catch (e) {
    erroHttp(res, e);
  }
});

app.get('/api/imagens/marca/preview', (req, res) => {
  try {
    const marca = marcas.obter(req.query.marca);
    const pastaAbs = imagens.pastaDaMarca(marca);
    if (!pastaAbs) return res.status(404).end();
    const abs = path.resolve(path.join(pastaAbs, String(req.query.id || '')));
    if (abs !== pastaAbs && !abs.startsWith(pastaAbs + path.sep)) return res.status(403).end();
    enviarArquivo(res, abs);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/imagens/marca/usar', (req, res) => {
  try {
    const { marca: marcaSlug, id, pasta: pastaRelativa, nome } = req.body;
    const marca = marcas.obter(marcaSlug);
    const pastaMarcaAbs = imagens.pastaDaMarca(marca);
    if (!pastaMarcaAbs) throw new Error('essa marca não tem pasta de identidade cadastrada.');
    const origemAbs = path.resolve(path.join(pastaMarcaAbs, String(id || '')));
    if (origemAbs !== pastaMarcaAbs && !origemAbs.startsWith(pastaMarcaAbs + path.sep)) {
      throw new Error('caminho de imagem inválido.');
    }
    if (!fs.existsSync(origemAbs)) throw new Error('a imagem não existe mais nessa pasta.');
    const r = imagens.baixarMarca(origemAbs, { pastaAbs: resolverPasta(pastaRelativa), nome: nome || 'marca' });
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

// aplica uma foto já baixada como fundo do slide, nos DOIS motores — antes só
// o estilo-editorial tinha esse caminho e no genérico o botão não fazia nada.
app.post('/api/imagens/aplicar', async (req, res) => {
  try {
    const { pasta: pastaRelativa, arquivo, slideIndex, licenciada } = req.body;
    const pastaAbs = resolverPasta(pastaRelativa);
    const i = Number(slideIndex) || 0;
    if (!arquivo) throw new Error('faltou o arquivo da foto.');

    if (motor.temPostJson(pastaAbs)) {
      const post = motor.lerPost(pastaAbs);
      const slide = post.slides[i];
      if (!slide) throw new Error(`o post não tem slide ${i + 1}.`);
      const antigo = slide.fundo && slide.fundo.args ? slide.fundo.args : {};
      slide.fundo = { fn: 'foto', args: { ...antigo, arquivo, pos: antigo.pos || '50% 50%' } };
      if (licenciada === false) slide.__imagemNaoLicenciada = true;
      else delete slide.__imagemNaoLicenciada;
      motor.escreverPost(pastaAbs, post);
      const saida = await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson });
      return res.json({ ok: true, post: motor.lerPost(pastaAbs), pngs: pngsParaUrls(pastaAbs, saida.pngs) });
    }

    const saida = motor.aplicarEdicoesHtml(pastaAbs, { fundos: [{ slide: i + 1, arquivo }] });
    if (licenciada === false) {
      fs.writeFileSync(path.join(pastaAbs, '_nao-licenciada'), arquivo, 'utf-8');
    }
    res.json({ ok: true, pngs: pngsParaUrls(pastaAbs, saida.pngs) });
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- templates

app.get('/api/templates', (req, res) => {
  try {
    res.json(templatesLib.listar());
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/templates', (req, res) => {
  try {
    const { pasta: pastaRelativa, nome, origemDescricao } = req.body;
    const pastaAbs = resolverPasta(pastaRelativa);
    const post = motor.lerPost(pastaAbs);
    if (!post) throw new Error('só dá pra salvar modelo de post com post.json (motor estilo-editorial).');
    const t = templatesLib.salvarComoModelo(slugify(nome), post, origemDescricao, pastaAbs);
    res.json(t);
  } catch (e) {
    erroHttp(res, e);
  }
});

app.delete('/api/templates/:nome', (req, res) => {
  try {
    templatesLib.apagar(req.params.nome);
    res.json({ ok: true });
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/templates/:nome/aplicar', async (req, res) => {
  try {
    const pastaAbs = resolverPasta(req.body.pasta);
    const postAtual = motor.lerPost(pastaAbs);
    if (!postAtual) throw new Error('aplicar template só funciona em post com post.json.');
    const templateNovo = templatesLib.obter(req.params.nome);
    const r = await agente.readaptarParaTemplate({ pastaAbs, postAtual, templateNovo });
    const saida = await motor.renderizarComCorrecao(pastaAbs, { agenteCorrigir: agente.corrigirPostJson });
    res.json({ ok: true, post: r.post, pngs: pngsParaUrls(pastaAbs, saida.pngs) });
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- extrator

// Importar um carrossel de referência como template. Aceita VÁRIAS imagens
// (uma por slide, na ordem em que foram soltas) — antes era uma imagem só e o
// agente tinha que inventar o resto do arco a partir de um print de capa.
// Com o carrossel inteiro, a estrutura extraída é a de verdade.
//
// Assíncrono como o /api/gerar: devolve jobId na hora e o progresso vai por
// SSE, porque a extração chama o Agent SDK e leva minutos.
app.post('/api/extrator', upload.array('imagens', 20), async (req, res) => {
  const arquivos = req.files && req.files.length ? req.files : (req.file ? [req.file] : []);
  if (!arquivos.length) return erroHttp(res, new Error('anexa pelo menos uma imagem de referência.'));

  const nomeDesejado = slugify(req.body.nome || '') || `referencia-${Date.now()}`;
  const slugTemp = `extrator-${Date.now()}`;
  const pastaTrabalhoAbs = path.join(PASTA_ESTUDIO, 'acervo', '_extratos', slugTemp);
  fs.mkdirSync(pastaTrabalhoAbs, { recursive: true });

  const caminhos = arquivos.map((f, i) => {
    const destino = path.join(pastaTrabalhoAbs, `_referencia-${String(i + 1).padStart(2, '0')}${path.extname(f.originalname) || '.png'}`);
    fs.copyFileSync(f.path, destino);
    apagarArquivo(f.path);
    return destino;
  });

  const jobId = jobs.criar();
  res.json({ jobId, total: caminhos.length });

  (async () => {
    try {
      jobs.etapa(jobId, `medindo a paleta de ${caminhos.length} slide(s)…`, 12);
      const r = await extrator.extrairTemplate({
        caminhoImagemAbs: caminhos[0],
        caminhosImagens: caminhos,
        pastaTrabalhoAbs,
        onEvento: (msg) => {
          const p = progressoDoEvento(msg, jobs.obter(jobId).progresso);
          if (p) jobs.atualizar(jobId, p);
          logDoEvento(msg).forEach((l) => jobs.logar(jobId, l.tipo, l.texto));
        },
      });
      jobs.etapa(jobId, 'salvando o template…', 94);
      // as referências vão junto do template: sem elas não dá pra reconferir a
      // fidelidade de uma peça modelada depois (elas nunca entram em post nenhum)
      const salvo = templatesLib.salvarExtraido(nomeDesejado, r.template, caminhos[0], caminhos);
      if (r.conferencia && !r.conferencia.convergiu) {
        jobs.logar(jobId, 'aviso',
          'a conferência de fidelidade não fechou em todos os eixos — confere o template antes de usar: '
          + JSON.stringify(r.conferencia.historico).slice(0, 300));
      }
      jobs.concluir(jobId, {
        pasta: rel(pastaTrabalhoAbs),
        nome: salvo.nome,
        totalSlides: salvo.totalSlides,
        tipo: salvo.tipo,
        template: r.template,
        paletaMedida: r.paletaMedida,
        conferencia: r.conferencia || null,
      });
    } catch (e) {
      jobs.falhar(jobId, e);
    }
  })();
});

// mesmo canal SSE do /api/gerar, reaproveitado
app.get('/api/extrator/:jobId/eventos', (req, res) => {
  const job = jobs.obter(req.params.jobId);
  if (!job) return res.status(404).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const enviar = (j) => res.write(`data: ${JSON.stringify(jobs.paraCliente(j))}\n\n`);
  enviar(job);
  const parar = jobs.ouvir(req.params.jobId, (j) => {
    enviar(j);
    if (j.status !== 'rodando') res.end();
  });
  req.on('close', parar);
});

app.post('/api/extrator/convergir', async (req, res) => {
  try {
    const { pasta: pastaRelativa, caminhoImagemOriginal, caminhoRenderAtual, templateAtual } = req.body;
    const r = await extrator.convergir({
      pastaTrabalhoAbs: resolverPasta(pastaRelativa),
      caminhoImagemOriginal: resolverPasta(caminhoImagemOriginal),
      caminhoRenderAtual: resolverPasta(caminhoRenderAtual),
      templateAtual,
    });
    res.json(r);
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- exportar
//
// A saída que não é publicação: abrir a pasta dos PNGs no Explorer e copiar a
// peça pronta pra uma pasta de fora do projeto. Ver lib/exportar.js sobre por
// que o destino não passa pelo resolverPasta.

app.get('/api/exportar/info', (req, res) => {
  try {
    res.json(exportarLib.inspecionar(resolverPasta(req.query.pasta)));
  } catch (e) {
    erroHttp(res, e);
  }
});

// Abre uma pasta no explorador de arquivos. Dois modos, e nenhum deles aceita
// caminho livre: `pasta` é relativa à raiz (passa pelo resolverPasta como
// todas as outras rotas) e `destino` é absoluto, mas só passa se sobreviver às
// mesmas checagens de um destino de exportação — existe, é pasta, não é de
// sistema.
app.post('/api/exportar/abrir', (req, res) => {
  try {
    const { pasta: pastaRelativa, destino, alvo } = req.body || {};
    if (destino) return res.json(exportarLib.abrir(exportarLib.validarDestino(destino)));
    const info = exportarLib.inspecionar(resolverPasta(pastaRelativa));
    res.json(exportarLib.abrir(alvo === 'post' ? info.pastaAbs : info.pastaImagensAbs));
  } catch (e) {
    erroHttp(res, e);
  }
});

// Seletor nativo do Windows. Fica pendurado enquanto a janela está aberta —
// é o comportamento certo: a resposta é a escolha da pessoa.
app.post('/api/exportar/escolher', async (req, res) => {
  try {
    res.json(await exportarLib.escolherPasta({ inicial: (req.body || {}).inicial }));
  } catch (e) {
    erroHttp(res, e);
  }
});

app.post('/api/exportar', (req, res) => {
  try {
    const { pasta: pastaRelativa, destino, subpasta, renomear, incluir, sobrescrever } = req.body || {};
    const pastaAbs = resolverPasta(pastaRelativa);
    res.json(
      exportarLib.exportar({
        pastaAbs,
        slug: path.basename(pastaAbs),
        destino,
        subpasta: subpasta !== false,
        renomear: !!renomear,
        incluir: Array.isArray(incluir) ? incluir : [],
        sobrescrever: !!sobrescrever,
      })
    );
  } catch (e) {
    erroHttp(res, e);
  }
});

// ---------------------------------------------------------------- publicar

app.post('/api/publicar', async (req, res) => {
  try {
    const { pasta: pastaRelativa, marca: marcaSlug, canal, confirmar, confirmarImagemNaoLicenciada } = req.body;
    const pastaAbs = resolverPasta(pastaRelativa);
    const marca = marcas.obter(marcaSlug);

    // a origem da imagem é do SERVIDOR, não do painel: antes o painel calculava
    // isso a partir do post em memória e um post do motor genérico (que não tem
    // post.json) sempre dizia "não tem imagem do Google", furando o guardrail.
    const post = motor.lerPost(pastaAbs);
    const temImagemNaoLicenciada = post
      ? (post.slides || []).some((s) => s.__imagemNaoLicenciada)
      : fs.existsSync(path.join(pastaAbs, '_nao-licenciada'));

    const r = await publicarLib.publicar({
      pastaAbs,
      marca,
      canal,
      confirmar: !!confirmar,
      temImagemNaoLicenciada,
      confirmarImagemNaoLicenciada: !!confirmarImagemNaoLicenciada,
    });
    res.json({ ...r, temImagemNaoLicenciada });
  } catch (e) {
    erroHttp(res, e);
  }
});

// rede de segurança geral: qualquer erro que escape do try/catch de uma rota
// (multer incluído — ele quebra dentro do próprio middleware, antes da rota
// rodar) cai aqui em vez de virar a página HTML crua padrão do Express, que
// o painel não consegue parsear como JSON.
app.use((err, req, res, next) => {
  console.error('erro nao tratado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ erro: err && err.message ? err.message : String(err) });
});

// Escuta só em 127.0.0.1, não em 0.0.0.0 (que era o padrão do Express aqui).
// O painel nunca é aberto de outra máquina — o render, o acervo e o .env são
// todos locais — e a partir da exportação existe uma rota que GRAVA ARQUIVO em
// qualquer pasta do computador. Deixar isso escutando na rede seria oferecer
// pra Wi-Fi inteira o que só o navegador desta máquina precisa.
app.listen(PORTA, '127.0.0.1', () => {
  console.log(`studio.scault — http://localhost:${PORTA}`);
  console.log(`Marcas cadastradas: ${marcas.listar().map((m) => m.slug).join(', ')}`);
});
