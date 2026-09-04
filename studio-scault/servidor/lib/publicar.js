// Ponte com os scripts de publicação já existentes — nenhuma lógica de Graph
// API é reimplementada aqui, só o encaminhamento com uma trava a mais: post
// com imagem vinda do Google (não licenciada) em conta de CLIENTE exige
// confirmação explícita, sinalizada antes de chamar --confirmar de verdade.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { RAIZ } = require('./marcas');

const SCRIPTS = path.join(RAIZ, 'scripts');

function rodar(script, args, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      [path.join(SCRIPTS, script), ...args],
      { cwd: RAIZ, encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // os scripts saem com stdout normal mesmo sem --confirmar (dry-run) —
        // só tratamos como falha real se o processo morrer com erro
        if (err && err.killed) return reject(new Error(`${script}: tempo esgotado`));
        if (err && !stdout) return reject(new Error(`${script}: ${stderr || err.message}`));
        resolve({ stdout, stderr, ok: !err });
      }
    );
  });
}

// pastaAbs precisa ter instagram/*.png (ou facebook/) + legenda.md — mesma
// estrutura que o acervo do estúdio já grava.
//
// `temImagemNaoLicenciada` vem de quem chama (o servidor já sabe, porque
// gravou a origem de cada foto no post) e `confirmarImagemNaoLicenciada` é um
// campo SEPARADO do `confirmar` de publicar de fato — o painel só pode
// mandar os dois juntos depois de mostrar a origem (fontes.md) pro Sidney.
async function publicar({
  pastaAbs,
  marca,
  canal = 'instagram',
  confirmar = false,
  temImagemNaoLicenciada = false,
  confirmarImagemNaoLicenciada = false,
}) {
  if (confirmar && temImagemNaoLicenciada && marca.tipo === 'cliente' && !confirmarImagemNaoLicenciada) {
    throw new Error(
      'Este post tem imagem do Google Imagens (não licenciada) e o destino é uma conta de cliente. ' +
        'Confirme explicitamente vendo a origem em fontes.md antes de publicar — chame de novo com ' +
        '"confirmarImagemNaoLicenciada: true".'
    );
  }

  const sufixoConta = marca.instagram && marca.instagram.sufixo_env;
  if (marca.tipo === 'cliente' && !sufixoConta) {
    throw new Error(
      `${marca.nome} não tem conta de publicação própria configurada no .env. Sem o sufixo ` +
        '_<SLUG>, o script cairia nas chaves sem sufixo — que são a conta da Scault. Configure ' +
        'META_PAGE_ACCESS_TOKEN_<SLUG> / META_IG_USER_ID_<SLUG> antes de publicar por este cliente.'
    );
  }

  const script = canal === 'facebook' ? 'postar-facebook.js' : 'postar-instagram.js';
  const args = [pastaAbs];
  const sufixo = sufixoConta;
  if (sufixo) args.push('--conta', sufixo);
  if (confirmar) args.push('--confirmar');

  const r = await rodar(script, args, { timeoutMs: 90000 });
  return { ...r, dryRun: !confirmar };
}

// ---- quem é a conta de destino ------------------------------------------
//
// O painel mostrava só "Instagram / Facebook" — a pessoa clicava em Publicar
// sem saber PARA QUAL PERFIL ia, e a única confirmação vinha depois, no
// dry-run. Aqui a conta é resolvida antes: lê o .env da raiz (mesmas chaves
// que os scripts de publicação usam) e pergunta à Graph API o @ e o nome.
//
// Nada disso publica nem cria rascunho — é um GET de identidade.

function lerEnvRaiz() {
  const alvo = path.join(RAIZ, '.env');
  const fora = {};
  if (!fs.existsSync(alvo)) return fora;
  const linhas = fs.readFileSync(alvo, 'utf-8').split(/\r?\n/);
  for (const linha of linhas) {
    if (linha.trim().startsWith('#')) continue;
    const m = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(linha);
    if (!m) continue;
    fora[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return fora;
}

function chaveConta(base, sufixo) {
  return sufixo ? `${base}_${String(sufixo).toUpperCase()}` : base;
}

async function contaDestino(marca, canal = 'instagram') {
  const sufixo = marca && marca.instagram && marca.instagram.sufixo_env;
  const env = lerEnvRaiz();

  // Marca de CLIENTE sem sufixo próprio cairia nas chaves sem sufixo — que
  // são a conta da própria Scault. Ou seja: publicar um post da Schola
  // Cantorum mandaria o carrossel pro @scault.mkt, calado. Aqui isso é um
  // "não configurada" explícito, e publicar() recusa pelo mesmo motivo.
  if (marca && marca.tipo === 'cliente' && !sufixo) {
    return {
      configurada: false,
      canal,
      sufixo: null,
      motivo: `${marca.nome} não tem conta própria no .env. Publicar aqui usaria a conta da Scault — bloqueado.`,
    };
  }

  const token = env[chaveConta('META_PAGE_ACCESS_TOKEN', sufixo)];
  const id = canal === 'facebook'
    ? env[chaveConta('META_PAGE_ID', sufixo)]
    : env[chaveConta('META_IG_USER_ID', sufixo)];

  if (!token || !id) {
    return {
      configurada: false,
      canal,
      sufixo: sufixo || null,
      motivo: sufixo
        ? `faltam ${chaveConta('META_PAGE_ACCESS_TOKEN', sufixo)} / ${chaveConta(canal === 'facebook' ? 'META_PAGE_ID' : 'META_IG_USER_ID', sufixo)} no .env`
        : 'esta marca não tem conta de publicação configurada no .env',
    };
  }

  const campos = canal === 'facebook' ? 'name,link' : 'username,name,profile_picture_url,followers_count';
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(id)}?fields=${campos}&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) return { configurada: true, canal, sufixo: sufixo || null, id, erro: j.error.message };
    return {
      configurada: true,
      canal,
      sufixo: sufixo || null,
      id,
      usuario: j.username ? `@${j.username}` : (j.name || id),
      nome: j.name || null,
      foto: j.profile_picture_url || null,
      seguidores: typeof j.followers_count === 'number' ? j.followers_count : null,
      link: j.link || null,
    };
  } catch (e) {
    return { configurada: true, canal, sufixo: sufixo || null, id, erro: 'não deu pra falar com a Graph API: ' + e.message };
  }
}

module.exports = { publicar, contaDestino };
