// Job em memória pra geração assíncrona — o painel dispara, recebe um jobId
// na hora, e escuta o progresso por SSE (Server-Sent Events, nativo do
// Express/HTTP, sem dependência nova) em vez de ficar preso num fetch()
// esperando minutos sem feedback nenhum.
'use strict';

const jobs = new Map();
let contador = 0;

function criar() {
  const id = `job-${++contador}-${Date.now()}`;
  jobs.set(id, {
    id,
    status: 'rodando', // rodando | concluido | erro
    etapa: 'iniciando…',
    progresso: 3,
    resultado: null,
    erro: null,
    log: [], // linhas do "o que a IA está fazendo" — ver logar()
    ouvintes: new Set(),
  });
  return id;
}

function obter(id) {
  return jobs.get(id);
}

function paraCliente(job) {
  if (!job) return null;
  const { id, status, etapa, progresso, resultado, erro, log } = job;
  return { id, status, etapa, progresso, resultado, erro, log };
}

function atualizar(id, patch) {
  const j = jobs.get(id);
  if (!j || j.status !== 'rodando') return;
  Object.assign(j, patch);
  j.ouvintes.forEach((fn) => fn(j));
}

// Uma linha do log ao vivo (preview detalhado no lugar da barra crua) —
// capado em 300 linhas pra não crescer sem fim numa geração de 20 slides.
// `tipo` decide o ícone no painel (ver ICONES em app.js): etapa, sistema,
// ferramenta, texto, ok, erro, login.
function logar(id, tipo, texto) {
  const j = jobs.get(id);
  if (!j || j.status !== 'rodando' || !texto) return;
  j.log.push({ t: Date.now(), tipo, texto });
  if (j.log.length > 300) j.log.shift();
  j.ouvintes.forEach((fn) => fn(j));
}

// Marca uma etapa E loga ela — todo checkpoint manual do servidor (não só os
// eventos crus do SDK) aparece no mesmo log, do início ao fim.
function etapa(id, texto, progresso) {
  atualizar(id, { etapa: texto, ...(progresso != null ? { progresso } : {}) });
  logar(id, 'etapa', texto);
}

function concluir(id, resultado) {
  atualizar(id, { status: 'concluido', progresso: 100, etapa: 'pronto', resultado });
}

function falhar(id, erro) {
  const j = jobs.get(id);
  if (!j) return;
  j.status = 'erro';
  j.erro = String((erro && erro.message) || erro);
  j.ouvintes.forEach((fn) => fn(j));
}

function ouvir(id, fn) {
  const j = jobs.get(id);
  if (!j) return () => {};
  j.ouvintes.add(fn);
  return () => j.ouvintes.delete(fn);
}

// limpeza simples — jobs concluídos há mais de 1h saem da memória
setInterval(() => {
  const umaHora = 60 * 60 * 1000;
  const agora = Date.now();
  for (const [id, j] of jobs) {
    if (j.status !== 'rodando' && agora - Number(id.split('-').pop()) > umaHora) jobs.delete(id);
  }
}, 15 * 60 * 1000).unref();

module.exports = { criar, obter, paraCliente, atualizar, logar, etapa, concluir, falhar, ouvir };
