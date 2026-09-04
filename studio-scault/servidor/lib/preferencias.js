// Preferência global de modelo — qual "cérebro" a assinatura usa por padrão
// pra tudo que o estúdio pede (gerar, reescrever, corrigir, extrair). O
// seletor do formulário de "Gerar carrossel" pode pedir OUTRO modelo só pra
// aquele post (ver agente.js#rodar, que recebe "model" explícito); sem
// escolha explícita, toda chamada cai neste padrão.
'use strict';

const fs = require('fs');
const path = require('path');
const { PASTA_ESTUDIO } = require('./marcas');

const ARQ = path.join(PASTA_ESTUDIO, 'servidor', 'preferencias.json');

function ler() {
  if (!fs.existsSync(ARQ)) return { modeloAtivo: '' };
  try {
    return JSON.parse(fs.readFileSync(ARQ, 'utf-8'));
  } catch {
    return { modeloAtivo: '' };
  }
}

function obterModeloAtivo() {
  return ler().modeloAtivo || '';
}

function definirModeloAtivo(modelo) {
  const r = ler();
  r.modeloAtivo = String(modelo || '').trim();
  fs.writeFileSync(ARQ, JSON.stringify(r, null, 2), 'utf-8');
  return r.modeloAtivo;
}

module.exports = { obterModeloAtivo, definirModeloAtivo };
