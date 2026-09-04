#!/usr/bin/env node
/**
 * postar-instagram.js — publica um carrossel (ou foto única) na conta Instagram
 * Business via Meta Graph API.
 *
 * A API busca as imagens por URL pública — não aceita upload de arquivo local.
 * Duas formas de conseguir essa URL, nessa ordem de prioridade:
 *
 *   1) SITE_URL[_<SLUG>] configurado → usa <SITE_URL>/img/posts/<slug>/slide-NN.png
 *      (site já publicado, passos 4-6 da skill /aprovar-post)
 *   2) SITE_URL ausente → sobe cada slide pro Cloudinary na hora (precisa de
 *      CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET no .env — ver marketing/automacao-meta-setup.md)
 *
 * Uso:
 *   node scripts/postar-instagram.js marketing/conteudo/<slug>-<data> --confirmar
 *   node scripts/postar-instagram.js clientes/X/conteudo/<slug>-<data> --conta ONOFFICE --confirmar
 *
 * Sem --confirmar, só mostra pra qual conta ia publicar e para — não cria nada
 * na API. É a trava mecânica: publicar em conta de cliente exige confirmação
 * explícita, não só a confirmação em texto que a skill /aprovar-post já pede.
 *
 * --conta <SLUG> troca as chaves de META_PAGE_ACCESS_TOKEN/META_IG_USER_ID/SITE_URL
 * pelas com sufixo _<SLUG> (ex: META_IG_USER_ID_ONOFFICE) — uma por cliente.
 * Sem --conta, usa as chaves sem sufixo (conta própria da Scault).
 *
 * Requer no .env da raiz: META_PAGE_ACCESS_TOKEN[_<SLUG>], META_IG_USER_ID[_<SLUG>], SITE_URL[_<SLUG>]
 * Setup completo: marketing/automacao-meta-setup.md
 * Sem dependências — usa fetch nativo (Node 20+).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GRAPH_VERSION = 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------------------------------------------------------------- .env

// Sobe a árvore a partir de scripts/ até achar o .env da raiz do projeto.
function carregarEnv() {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const alvo = path.join(dir, '.env');
    if (fs.existsSync(alvo)) {
      for (const linha of fs.readFileSync(alvo, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([\w.-]+)\s*=\s*(.*)$/);
        if (!m || linha.trim().startsWith('#')) continue;
        const chave = m[1];
        const valor = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
        if (!(chave in process.env)) process.env[chave] = valor;
      }
      return;
    }
    const pai = path.dirname(dir);
    if (pai === dir) return;
    dir = pai;
  }
}

// Erro esperado (chave faltando, API recusou) — vira mensagem limpa, sem stack trace.
class ErroAmigavel extends Error {}
function erro(msg) {
  throw new ErroAmigavel(msg);
}

function exigirEnv(chave, comoConfigurar) {
  const v = process.env[chave];
  if (!v) erro(`${chave} não encontrada no .env.\n\n${comoConfigurar}\n\n  Guia completo: marketing/automacao-meta-setup.md`);
  return v;
}

// Parser de flags: `--nome valor` e `--flag`. O resto vira posicional.
function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const nome = a.slice(2);
      const prox = argv[i + 1];
      if (prox === undefined || prox.startsWith('--')) opts[nome] = true;
      else {
        opts[nome] = prox;
        i++;
      }
    } else pos.push(a);
  }
  return { opts, pos };
}

// --conta ONOFFICE → lê META_PAGE_ACCESS_TOKEN_ONOFFICE em vez de META_PAGE_ACCESS_TOKEN.
// Sem --conta, usa a chave sem sufixo (conta própria).
function exigirEnvConta(base, conta, comoConfigurar) {
  const chave = conta ? `${base}_${conta.toUpperCase()}` : base;
  return exigirEnv(chave, comoConfigurar);
}

// ---------------------------------------------------------------- graph api

async function graph(metodo, rota, params) {
  const url = new URL(`${GRAPH_URL}${rota}`);
  let opcoes;

  if (metodo === 'GET') {
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  } else {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) body.set(k, String(v));
    }
    opcoes = { method: 'POST', body };
  }

  const res = await fetch(url, opcoes);
  const dados = await res.json().catch(() => ({}));

  if (!res.ok || dados.error) {
    const e = dados.error || {};
    const dica =
      e.code === 190
        ? '\n  Token expirado/inválido — refaz o passo 2 de marketing/automacao-meta-setup.md.'
        : e.code === 100
        ? '\n  A API busca a imagem pela URL pública. Confere se o deploy do site já subiu (SITE_URL) ou se o upload no Cloudinary terminou.'
        : e.code === 10 || e.code === 200
        ? '\n  Falta permissão no token — refaz o passo 2 de marketing/automacao-meta-setup.md.'
        : '';
    erro(`Meta Graph API: ${e.message || res.statusText} (código ${e.code ?? res.status})${dica}`);
  }
  return dados;
}

// ---------------------------------------------------------------- cloudinary

// Fallback pra quando a conta não tem site publicado: sobe o PNG local pro
// Cloudinary (upload assinado — não precisa de upload preset configurado no
// painel) e devolve a URL pública. Uma conta Cloudinary só, compartilhada por
// todas as contas de posting — organiza por pasta, não por credencial.
async function subirCloudinary(caminhoArquivo, pastaDestino) {
  const cloudName = exigirEnv('CLOUDINARY_CLOUD_NAME', '  Cloud name da conta Cloudinary (grátis).');
  const apiKey = exigirEnv('CLOUDINARY_API_KEY', '  API Key da conta Cloudinary.');
  const apiSecret = exigirEnv('CLOUDINARY_API_SECRET', '  API Secret da conta Cloudinary.');

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsAssinados = { folder: pastaDestino, timestamp };
  const paramString = Object.keys(paramsAssinados)
    .sort()
    .map((k) => `${k}=${paramsAssinados[k]}`)
    .join('&');
  const signature = crypto
    .createHash('sha1')
    .update(paramString + apiSecret)
    .digest('hex');

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(caminhoArquivo)]), path.basename(caminhoArquivo));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', pastaDestino);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form });
  const dados = await res.json().catch(() => ({}));

  if (!res.ok || dados.error) {
    erro(`Cloudinary: ${dados.error?.message || res.statusText} — confere CLOUDINARY_* no .env.`);
  }
  return dados.secure_url;
}

// Sobe todos os slides e devolve as URLs na mesma ordem. Só chamado depois do
// --confirmar — subir imagem é efeito colateral (fica público, conta na cota),
// não deve acontecer num dry-run.
async function subirSlidesCloudinary(pastaConteudo, slides, slug, conta) {
  const pastaDestino = `scaultos-posts/${conta ? conta.toLowerCase() : 'scault'}/${slug}`;
  const urls = [];
  for (const [i, arquivo] of slides.entries()) {
    process.stdout.write(`  upload Cloudinary ${i + 1}/${slides.length}... `);
    const url = await subirCloudinary(path.join(pastaConteudo, 'instagram', arquivo), pastaDestino);
    urls.push(url);
    console.log('ok');
  }
  return urls;
}

async function aguardarPronto(creationId, token) {
  for (let i = 0; i < 15; i++) {
    const r = await graph('GET', `/${creationId}`, { fields: 'status_code', access_token: token });
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR') erro(`Container ${creationId} falhou ao processar no Instagram.`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  erro(`Container ${creationId} não ficou pronto a tempo (30s).`);
}

// ---------------------------------------------------------------- conteúdo

// A pasta vem no formato <slug>-<data>; o slug puro é o que bate com o path
// publicado em site/.../public/img/posts/<slug>/ (ver skill /aprovar-post).
function derivarSlug(pastaConteudo) {
  return path.basename(path.resolve(pastaConteudo)).replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

function listarSlides(pastaConteudo) {
  const dir = path.join(pastaConteudo, 'instagram');
  if (!fs.existsSync(dir)) erro(`Pasta não encontrada: ${dir}`);
  const arquivos = fs
    .readdirSync(dir)
    .filter((f) => /^slide-\d+(-.+)?\.png$/i.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  if (!arquivos.length) erro(`Nenhum slide-NN.png em ${dir}`);
  if (arquivos.length > 10) erro(`${arquivos.length} slides — Instagram aceita no máximo 10 por carrossel.`);
  const numeros = arquivos.map((f) => f.match(/\d+/)[0]);
  const duplicados = numeros.filter((n, i) => numeros.indexOf(n) !== i);
  if (duplicados.length) {
    erro(
      `Slide(s) duplicado(s) em ${dir}: número(s) ${[...new Set(duplicados)].join(', ')}.\n` +
        `Provável sobra de uma renderização antiga (carrossel.html mudou e o PNG velho não foi apagado). ` +
        `Arquivos: ${arquivos.join(', ')}`
    );
  }
  return arquivos;
}

function lerLegenda(pastaConteudo) {
  const arq = path.join(pastaConteudo, 'legenda.md');
  if (!fs.existsSync(arq)) erro(`legenda.md não encontrado em ${pastaConteudo}`);
  const bruto = fs.readFileSync(arq, 'utf8').trim();
  // legenda.md costuma trazer um cabeçalho editorial ("# Legenda...", nota de voz)
  // antes do "---" que separa do texto público — isso não vai pro Instagram/Facebook.
  const divisor = bruto.indexOf('\n---\n');
  if (bruto.startsWith('#') && divisor !== -1) return bruto.slice(divisor + 5).trim();
  return bruto;
}

// ---------------------------------------------------------------- main

async function main() {
  carregarEnv();

  const { opts, pos } = parseArgs(process.argv.slice(2));
  const pastaConteudo = pos[0];
  const conta = opts.conta ? String(opts.conta) : null;

  if (!pastaConteudo) {
    erro(
      'Falta a pasta do conteúdo.\n' +
        '  Ex: node scripts/postar-instagram.js marketing/conteudo/meu-post-2026-08-18 --confirmar\n' +
        '  Ex (cliente): node scripts/postar-instagram.js clientes/X/conteudo/post-2026-08-18 --conta ONOFFICE --confirmar'
    );
  }

  const token = exigirEnvConta('META_PAGE_ACCESS_TOKEN', conta, '  Token de longa duração da Página FB.');
  const igUserId = exigirEnvConta('META_IG_USER_ID', conta, '  ID da conta Instagram Business.');
  const chaveSiteUrl = conta ? `SITE_URL_${conta.toUpperCase()}` : 'SITE_URL';
  const siteUrl = (process.env[chaveSiteUrl] || '').replace(/\/$/, '') || null;

  const slug = derivarSlug(pastaConteudo);
  const slides = listarSlides(pastaConteudo);
  const legenda = lerLegenda(pastaConteudo);

  const quemSou = await graph('GET', `/${igUserId}`, { fields: 'username,name', access_token: token }).catch(
    () => ({ username: '(não foi possível confirmar — token/ID podem estar errados)' })
  );

  console.log(`\nConta destino:  @${quemSou.username || igUserId}${quemSou.name ? ` (${quemSou.name})` : ''}${conta ? `  [conta configurada: ${conta}]` : ''}`);
  console.log(`Pasta:          ${pastaConteudo}`);
  console.log(`Slides:         ${slides.length}`);
  console.log(`Legenda:        ${legenda.slice(0, 200).replace(/\n/g, ' ')}${legenda.length > 200 ? '…' : ''}`);
  console.log(`Imagens via:    ${siteUrl ? siteUrl : 'Cloudinary (upload no momento da confirmação)'}`);

  if (!opts.confirmar) {
    console.log('\n⚠ Nada foi publicado. Confere a conta destino acima e roda de novo com --confirmar.\n');
    return;
  }

  const urls = siteUrl
    ? slides.map((f) => `${siteUrl}/img/posts/${slug}/${f}`)
    : await subirSlidesCloudinary(pastaConteudo, slides, slug, conta);

  console.log(`\nPublicando ${slides.length} slide(s) no Instagram...`);

  let creationId;

  if (urls.length === 1) {
    const container = await graph('POST', `/${igUserId}/media`, {
      image_url: urls[0],
      caption: legenda,
      access_token: token,
    });
    creationId = container.id;
  } else {
    const filhos = [];
    for (const [i, url] of urls.entries()) {
      process.stdout.write(`  container ${i + 1}/${urls.length}... `);
      const filho = await graph('POST', `/${igUserId}/media`, {
        image_url: url,
        is_carousel_item: true,
        access_token: token,
      });
      await aguardarPronto(filho.id, token);
      filhos.push(filho.id);
      console.log('ok');
    }

    const container = await graph('POST', `/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      children: filhos.join(','),
      caption: legenda,
      access_token: token,
    });
    creationId = container.id;
  }

  await aguardarPronto(creationId, token);

  const publicado = await graph('POST', `/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  });

  const detalhes = await graph('GET', `/${publicado.id}`, { fields: 'permalink', access_token: token }).catch(() => ({}));

  console.log(`\n✓ Publicado no Instagram`);
  console.log(`  id:   ${publicado.id}`);
  console.log(`  link: ${detalhes.permalink || '(sem permalink retornado)'}\n`);
}

main().catch((e) => {
  console.error('\n✗ ' + (e instanceof ErroAmigavel ? e.message : e.stack) + '\n');
  // exitCode em vez de process.exit(): matar o processo com requisição em voo
  // estoura assert do libuv no Windows. Deixa o Node encerrar sozinho.
  process.exitCode = 1;
});
