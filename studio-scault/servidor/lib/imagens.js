// Ponte com os dois bancos de imagem: buscar-fotos.js (Pexels+Unsplash,
// licença resolvida na origem — padrão pra peça de cliente) e
// google-imagens.js (índice, NÃO licenciado — referência/moodboard).
// O painel NUNCA deve misturar os dois numa lista sem marcar a origem —
// ver o selo "não licenciado" no lado do painel.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { RAIZ } = require('./marcas');

const SCRIPTS = path.join(RAIZ, 'scripts');

function rodar(script, args, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      [path.join(SCRIPTS, script), ...args],
      { cwd: RAIZ, encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`${script}: ${stderr || err.message}`));
        resolve(stdout);
      }
    );
  });
}

// ---- Pexels + Unsplash (licenciado) ------------------------------------

async function buscarBanco(termo, { n = 8, orientacao, fonte, cor } = {}) {
  const previewDir = path.join(os.tmpdir(), 'scaultos-estudio-fotos', slugify(termo));
  const args = ['buscar', termo, '--n', String(n), '--json', '--previews', previewDir];
  if (orientacao) args.push('--orientacao', orientacao);
  if (fonte) args.push('--fonte', fonte);
  if (cor) args.push('--cor', cor);

  await rodar('buscar-fotos.js', args);

  const resultadosPath = path.join(previewDir, 'resultados.json');
  if (!fs.existsSync(resultadosPath)) return { query: termo, fotos: [] };
  const dados = JSON.parse(fs.readFileSync(resultadosPath, 'utf-8'));
  return {
    query: dados.query,
    fotos: dados.fotos.map((f, i) => ({ ...f, licenciada: true, preview: dados.previews[i] })),
  };
}

// buscar-fotos.js SEMPRE prefixa "foto-" no arquivo salvo, não importa o
// --nome passado (visto no código: `foto-${base}${extensao}`) — o filtro
// abaixo busca pelo nome real que o script grava, não pelo --nome cru.
async function baixarBanco(id, { pastaAbs, nome = 'capa' }) {
  await rodar('buscar-fotos.js', ['baixar', String(id), '--out', pastaAbs, '--nome', nome]);
  const prefixoReal = `foto-${nome}.`;
  const arquivos = fs.readdirSync(pastaAbs).filter((f) => f.startsWith(prefixoReal));
  return { arquivos, creditos: lerCreditos(pastaAbs) };
}

// ---- Google Imagens (não licenciado) ------------------------------------

const SESSAO_GOOGLE = path.join(os.tmpdir(), 'scaultos-gimg-sessao.json');

async function buscarGoogle(termo, { n = 12, fundo = true } = {}) {
  const args = ['buscar', termo, '--n', String(n)];
  if (fundo) args.push('--fundo');
  // busca dirige um Chrome de verdade — pode levar mais que o timeout padrao,
  // e se o Google pedir captcha a janela fica visivel esperando humano.
  await rodar('google-imagens.js', args, { timeoutMs: 90000 });

  if (!fs.existsSync(SESSAO_GOOGLE)) return { query: termo, imagens: [] };
  const dados = JSON.parse(fs.readFileSync(SESSAO_GOOGLE, 'utf-8'));
  return {
    query: dados.termo,
    imagens: dados.itens.map((x, i) => ({
      indice: i + 1,
      preview: x.preview,
      largura: x.w,
      altura: x.h,
      origem: x.origem,
      alt: x.alt,
      licenciada: false, // trava de exibicao — nunca renomear isto
    })),
  };
}

async function baixarGoogle(indices, { pastaAbs }) {
  const idx = Array.isArray(indices) ? indices : [indices];
  // fotografa a pasta ANTES: o filtro por padrão de nome (/^\d+-/) pegava
  // também as imagens de downloads anteriores, e quem chamou acabava
  // aplicando no slide uma foto velha em vez da que acabou de escolher.
  const antes = new Set(fs.existsSync(pastaAbs) ? fs.readdirSync(pastaAbs) : []);
  await rodar('google-imagens.js', ['baixar', ...idx.map(String), '--out', pastaAbs], { timeoutMs: 30000 });
  const novos = fs.readdirSync(pastaAbs).filter((f) => !antes.has(f) && /^\d+-/.test(f));
  const arquivos = novos.length ? novos : fs.readdirSync(pastaAbs).filter((f) => /^\d+-/.test(f));
  const fontesPath = path.join(pastaAbs, 'fontes.md');
  return {
    arquivos,
    licenciada: false,
    fontes: fs.existsSync(fontesPath) ? fs.readFileSync(fontesPath, 'utf-8') : null,
  };
}

function lerCreditos(pastaAbs) {
  const p = path.join(pastaAbs, 'creditos.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

// ---- imagens que já existem no sistema, da marca (não é banco externo) --
//
// "banco" e "google" trazem foto de fora; aqui a foto já é NOSSA — post
// anterior da mesma marca, foto que o cliente entregou, print da pasta dele.
// Por isso não carrega "licenciada:false": o que já está na pasta do
// cliente é uso já autorizado, ao contrário de imagem pescada no Google.

const EXT_IMAGEM = new Set(['.jpg', '.jpeg', '.png', '.webp']);
// pasta de cliente que é um site (React/Next) carrega node_modules e build
// artifact cheios de ícone de biblioteca — teria centenas de imagens que não
// são FOTO nenhuma, só sujeira de dependência.
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', '.vercel', '.turbo']);
const TAMANHO_MIN = 8 * 1024; // ícone/favicon pequeno não é foto de conteúdo
const LIMITE_ARQUIVOS = 400; // teto pra pasta de cliente gigante não travar a busca

// A marca aponta o CLAUDE.md/design-guide dela em "identidade_fonte"
// (marcas/*.json) — a pasta do cliente é sempre o passo anterior a esse
// arquivo. Pra cliente de verdade (identidade_fonte começa com "clientes/")
// sobe até a raiz do cliente (clientes/<Nome>/), não só a subpasta onde o
// arquivo mora, porque foto de conteúdo costuma estar em site/, fotos/,
// conteudo/ — pastas irmãs do arquivo de identidade, não dentro dela.
function pastaDaMarca(marca) {
  if (!marca || !marca.identidade_fonte) return null;
  const partes = String(marca.identidade_fonte).split(/[\\/]/);
  const base = partes[0] === 'clientes' && partes[1]
    ? path.join(RAIZ, 'clientes', partes[1])
    : path.join(RAIZ, path.dirname(marca.identidade_fonte));
  try {
    return fs.statSync(base).isDirectory() ? base : null;
  } catch {
    return null;
  }
}

function listarImagensDaPasta(raizAbs) {
  const achados = [];
  const pilha = [raizAbs];
  while (pilha.length && achados.length < LIMITE_ARQUIVOS) {
    const dir = pilha.pop();
    let itens;
    try {
      itens = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // pasta sumiu ou sem permissão — pula, não derruba a busca inteira
    }
    for (const it of itens) {
      if (achados.length >= LIMITE_ARQUIVOS) break;
      if (it.name.startsWith('.')) continue;
      const abs = path.join(dir, it.name);
      if (it.isDirectory()) {
        if (!PASTAS_IGNORADAS.has(it.name)) pilha.push(abs);
        continue;
      }
      if (!EXT_IMAGEM.has(path.extname(it.name).toLowerCase())) continue;
      let info;
      try {
        info = fs.statSync(abs);
      } catch {
        continue;
      }
      if (info.size < TAMANHO_MIN) continue;
      achados.push({ abs, rel: path.relative(raizAbs, abs), tamanho: info.size, mtimeMs: info.mtimeMs });
    }
  }
  return achados;
}

// termo filtra pelo caminho relativo (pasta + nome do arquivo) — não é OCR
// nem busca semântica, só substring, porque a foto já está catalogada por
// onde o Sidney a organizou (ex: "site/hero", "fotos/equipe").
async function buscarMarca(raizAbs, { termo, n = 60 } = {}) {
  const todos = listarImagensDaPasta(raizAbs);
  const filtro = termo ? String(termo).trim().toLowerCase() : '';
  const filtrados = filtro ? todos.filter((f) => f.rel.toLowerCase().includes(filtro)) : todos;
  filtrados.sort((a, b) => b.mtimeMs - a.mtimeMs); // foto recente do cliente tende a ser a relevante
  return filtrados.slice(0, n);
}

function baixarMarca(origemAbs, { pastaAbs, nome = 'marca' }) {
  const ext = path.extname(origemAbs).toLowerCase() || '.jpg';
  const arquivo = `foto-${nome}${ext}`;
  fs.copyFileSync(origemAbs, path.join(pastaAbs, arquivo));
  return { arquivos: [arquivo] };
}

module.exports = {
  buscarBanco, baixarBanco, buscarGoogle, baixarGoogle,
  pastaDaMarca, buscarMarca, baixarMarca,
};
