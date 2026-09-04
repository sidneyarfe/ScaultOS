// Ingestão de referência: link, áudio, vídeo do YouTube e print — tudo vira
// um arquivo em referencias/<slug>.md com procedência (fonte, data), pra
// entrar como insumo do briefing e ficar reutilizável entre posts.
'use strict';

const fs = require('fs');
const path = require('path');
const { apagarArquivo } = require('./arquivos');
const os = require('os');
const { execFile } = require('child_process');

const YTDLP = 'C:/Users/sidne/AppData/Local/Python/pythoncore-3.14-64/Scripts/yt-dlp.exe';
const TRANSCREVER_PY = path.join(__dirname, 'transcrever.py');

function rodar(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd}: ${stderr || err.message}`));
      resolve(stdout);
    });
  });
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function pastaReferencias(pastaAbs) {
  const p = path.join(pastaAbs, 'referencias');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function gravarReferencia(pastaAbs, { titulo, fonte, tipo, texto }) {
  const slug = slugify(titulo || fonte || tipo);
  const arq = path.join(pastaReferencias(pastaAbs), `${slug}.md`);
  const cabecalho = `---\ntipo: ${tipo}\nfonte: ${fonte}\ncapturado_em: ${new Date().toISOString().slice(0, 10)}\n---\n\n`;
  fs.writeFileSync(arq, cabecalho + (texto || ''), 'utf-8');
  return arq;
}

// ---- link / artigo -------------------------------------------------------

// Extração de leitura BÁSICA — sem dependência nova. Remove script/style/nav,
// decodifica as entidades mais comuns, colapsa espaço. Não é tão fino quanto
// Readability.js, mas é suficiente como insumo de briefing (o objetivo é dar
// contexto pro agente, não reproduzir o artigo).
function htmlParaTexto(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<(h[1-6]|p|li|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t.slice(0, 12000); // teto — nao estourar contexto do briefing
}

async function ingerirLink(url, pastaAbs) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScaultOS-estudio/1.0)' } });
  if (!r.ok) throw new Error(`link respondeu ${r.status}: ${url}`);
  const html = await r.text();
  const tituloMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titulo = tituloMatch ? tituloMatch[1].trim() : url;
  const texto = htmlParaTexto(html);
  const arq = gravarReferencia(pastaAbs, { titulo, fonte: url, tipo: 'link', texto });
  return { titulo, arquivo: arq, resumo: texto.slice(0, 400) };
}

// ---- áudio (gravado no painel ou enviado) ---------------------------------

async function ingerirAudio(caminhoAudioOrig, pastaAbs, { descricao } = {}) {
  const tmp = path.join(os.tmpdir(), `scaultos-audio-${Date.now()}.wav`);
  await rodar('ffmpeg', ['-y', '-i', caminhoAudioOrig, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', tmp]);

  let saida;
  try {
    saida = await rodar('python', [TRANSCREVER_PY, tmp, '--idioma', 'pt'], { timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
  } finally {
    apagarArquivo(tmp);
  }

  const dados = JSON.parse(saida);
  const arq = gravarReferencia(pastaAbs, {
    titulo: descricao || `audio-${Date.now()}`,
    fonte: `áudio local (${dados.duracao}s, faster-whisper large-v3-turbo)`,
    tipo: 'audio',
    texto: dados.texto,
  });
  return { arquivo: arq, duracao: dados.duracao, texto: dados.texto };
}

// ---- YouTube ---------------------------------------------------------------

async function ingerirYoutube(url, pastaAbs) {
  const base = path.join(os.tmpdir(), `scaultos-yt-${Date.now()}`);

  // 1) tenta legenda automatica primeiro — muito mais rapido, sem baixar audio
  try {
    await rodar(YTDLP, [
      '--skip-download', '--write-auto-sub', '--sub-lang', 'pt.*,pt,en',
      '--sub-format', 'vtt', '-o', `${base}.%(ext)s`, url,
    ], { timeout: 60000 });
    const vtt = fs.readdirSync(os.tmpdir()).find((f) => f.startsWith(path.basename(base)) && f.endsWith('.vtt'));
    if (vtt) {
      const caminhoVtt = path.join(os.tmpdir(), vtt);
      const texto = vttParaTexto(fs.readFileSync(caminhoVtt, 'utf-8'));
      apagarArquivo(caminhoVtt);
      const arq = gravarReferencia(pastaAbs, { titulo: url, fonte: url, tipo: 'youtube (legenda)', texto });
      return { arquivo: arq, via: 'legenda', texto };
    }
  } catch {
    // sem legenda disponivel — cai pro audio abaixo
  }

  // 2) sem legenda: baixa so o audio e transcreve local
  const audioOut = `${base}.wav`;
  await rodar(YTDLP, ['-x', '--audio-format', 'wav', '-o', audioOut, url], { timeout: 180000 });
  const resultado = await ingerirAudio(audioOut, pastaAbs, { descricao: url });
  apagarArquivo(audioOut);
  return { ...resultado, via: 'audio (whisper)' };
}

function vttParaTexto(vtt) {
  return vtt
    .split('\n')
    .filter((l) => l && !/^WEBVTT/.test(l) && !/^\d+$/.test(l) && !/-->/.test(l) && !/^Kind:|^Language:/.test(l))
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

// ---- print / imagem / PDF --------------------------------------------------
// Não precisa de processamento — o Agent SDK lê o arquivo direto (multimodal)
// na hora de gerar. Só registra a referência com o caminho.

function ingerirPrint(caminhoArquivo, pastaAbs) {
  const arq = gravarReferencia(pastaAbs, {
    titulo: path.basename(caminhoArquivo),
    fonte: caminhoArquivo,
    tipo: 'imagem',
    texto: `Arquivo de imagem — ler direto: ${caminhoArquivo}`,
  });
  return { arquivo: arq, caminhoImagem: caminhoArquivo };
}

module.exports = { ingerirLink, ingerirAudio, ingerirYoutube, ingerirPrint, gravarReferencia };
