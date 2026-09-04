// Contas do Claude Code — o estúdio sempre gera na sessão LOGADA (nunca API
// key paga, ver agente.js). Quem tem mais de uma assinatura (pessoal, outra
// organização) antes só conseguia trocar qual delas gera o post saindo pro
// terminal e rodando `claude auth logout` + `claude auth login` na mão.
//
// Cada conta extra vive isolada num CLAUDE_CONFIG_DIR próprio — uma pasta com
// as credenciais daquele login, criada aqui dentro. A conta "padrao" tem
// `configDir: null` DE PROPÓSITO: não seta a env var nenhuma, então o
// processo herda o CLAUDE_CONFIG_DIR de fora (ou o padrão do sistema) — é
// exatamente o comportamento de antes desta feature existir, sem mudar nada
// pra quem só usa uma conta.
//
// Login e status rodam o MESMO binário `claude` que roda esta sessão — não é
// reimplementação de OAuth, é o CLI de sempre apontado pra outra pasta.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PASTA_ESTUDIO } = require('./marcas');
const { apagarPasta } = require('./arquivos');

const ARQ_REGISTRO = path.join(PASTA_ESTUDIO, 'servidor', 'contas-claude.json');
const PASTA_CONTAS = path.join(PASTA_ESTUDIO, 'servidor', 'contas-claude');

function claudeBin() {
  // no Windows, spawn sem shell precisa do nome exato do executável — 'claude'
  // sozinho depende de resolução de PATHEXT que nem sempre acontece.
  return process.platform === 'win32' ? 'claude.exe' : 'claude';
}

function registroPadrao() {
  return { ativa: 'padrao', contas: [{ id: 'padrao', nome: 'Conta padrão', configDir: null, pendente: false }] };
}

function ler() {
  if (!fs.existsSync(ARQ_REGISTRO)) return registroPadrao();
  try {
    const r = JSON.parse(fs.readFileSync(ARQ_REGISTRO, 'utf-8'));
    if (!r.contas || !r.contas.some((c) => c.id === 'padrao')) throw new Error('sem conta padrão');
    return r;
  } catch {
    return registroPadrao();
  }
}

function gravar(registro) {
  fs.mkdirSync(path.dirname(ARQ_REGISTRO), { recursive: true });
  fs.writeFileSync(ARQ_REGISTRO, JSON.stringify(registro, null, 2), 'utf-8');
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'conta';
}

function listar() {
  const r = ler();
  return r.contas.map((c) => ({ ...c, ativa: c.id === r.ativa }));
}

function obterAtiva() {
  const r = ler();
  return r.contas.find((c) => c.id === r.ativa) || r.contas[0];
}

function obter(id) {
  const c = ler().contas.find((c) => c.id === id);
  if (!c) throw new Error(`conta desconhecida: "${id}".`);
  return c;
}

function ativar(id) {
  const r = ler();
  const c = r.contas.find((c) => c.id === id);
  if (!c) throw new Error(`conta desconhecida: "${id}".`);
  if (c.pendente) throw new Error(`"${c.nome}" ainda não terminou o login — conclui o login antes de trocar pra ela.`);
  r.ativa = id;
  gravar(r);
  return c;
}

function criar(nome) {
  const r = ler();
  const nomeFinal = String(nome || '').trim() || 'conta nova';
  let id = slugify(nomeFinal);
  let n = 2;
  while (r.contas.some((c) => c.id === id)) id = `${slugify(nomeFinal)}-${n++}`;
  const configDir = path.join(PASTA_CONTAS, id);
  fs.mkdirSync(configDir, { recursive: true });
  const conta = { id, nome: nomeFinal, configDir, pendente: true };
  r.contas.push(conta);
  gravar(r);
  return conta;
}

function remover(id) {
  const r = ler();
  if (id === 'padrao') throw new Error('a conta padrão não pode ser removida.');
  if (r.ativa === id) throw new Error('troca pra outra conta antes de remover esta.');
  const c = r.contas.find((c) => c.id === id);
  if (!c) throw new Error(`conta desconhecida: "${id}".`);
  r.contas = r.contas.filter((x) => x.id !== id);
  gravar(r);
  // apagarPasta, não fs.rmSync: dentro do OneDrive o rmSync retorna sem
  // apagar nada (ver lib/arquivos.js) — já nos mordeu em quatro lugares antes.
  if (c.configDir) apagarPasta(c.configDir);
  return { ok: true };
}

function marcarLogada(id, info) {
  const r = ler();
  const c = r.contas.find((x) => x.id === id);
  if (!c) return;
  c.pendente = false;
  c.email = (info && info.email) || null;
  c.subscriptionType = (info && info.subscriptionType) || null;
  gravar(r);
}

function ambienteDaConta(conta) {
  const env = { ...process.env };
  if (conta && conta.configDir) env.CLAUDE_CONFIG_DIR = conta.configDir;
  return env;
}

// `claude auth status --json` — confirma com o próprio CLI se a pasta de
// config tem login válido, sem o estúdio precisar entender token nenhum.
function status(conta) {
  return new Promise((resolve) => {
    let p;
    try {
      p = spawn(claudeBin(), ['auth', 'status', '--json'], { env: ambienteDaConta(conta) });
    } catch {
      return resolve({ loggedIn: false });
    }
    let saida = '';
    p.stdout.on('data', (d) => { saida += d; });
    p.on('error', () => resolve({ loggedIn: false }));
    p.on('close', () => {
      try { resolve(JSON.parse(saida)); } catch { resolve({ loggedIn: false }); }
    });
  });
}

// Dispara `claude auth login` apontado pra pasta de config desta conta —
// mesmo fluxo de OAuth de sempre, só que isolado. `onLinha` recebe cada linha
// de stdout/stderr assim que sai (é o que alimenta o log ao vivo do painel:
// a URL de autenticação chega por aqui). Resolve quando o processo termina;
// quem chama confere `status()` depois, porque o código de saída sozinho não
// garante login completo (o usuário pode fechar a janela do navegador antes
// de terminar o OAuth).
function login({ conta, onLinha, timeoutMs = 5 * 60 * 1000 }) {
  return new Promise((resolve, reject) => {
    let p;
    try {
      p = spawn(claudeBin(), ['auth', 'login', '--claudeai'], { env: ambienteDaConta(conta) });
    } catch (e) {
      return reject(e);
    }
    let ultimaLinha = '';
    const repassar = (buf) => {
      String(buf).split(/\r?\n/).filter((l) => l.trim()).forEach((linha) => {
        ultimaLinha = linha.trim();
        if (onLinha) onLinha(ultimaLinha);
      });
    };
    p.stdout.on('data', repassar);
    p.stderr.on('data', repassar);

    const timer = setTimeout(() => {
      p.kill();
      reject(new Error('tempo esgotado esperando o login no navegador — tenta de novo.'));
    }, timeoutMs);

    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(ultimaLinha || `o login terminou com código ${code}.`));
      resolve();
    });
  });
}

module.exports = { listar, obter, obterAtiva, ativar, criar, remover, marcarLogada, ambienteDaConta, status, login };
