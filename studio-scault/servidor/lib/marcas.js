// Registro de marcas do estúdio — lê estudio/marcas/*.json.
// Cada marca decide o próprio motor (ver POST.md e o CLAUDE.md raiz: peça de
// cliente segue a identidade do cliente, não a da Scault).
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..', '..'); // .../ScaultOS
const PASTA_ESTUDIO = path.resolve(__dirname, '..', '..'); // .../ScaultOS/estudio
const PASTA_MARCAS = path.join(PASTA_ESTUDIO, 'marcas');

function listar() {
  return fs
    .readdirSync(PASTA_MARCAS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(PASTA_MARCAS, f), 'utf-8')));
}

function obter(slug) {
  const arq = path.join(PASTA_MARCAS, `${slug}.json`);
  if (!fs.existsSync(arq)) {
    throw new Error(`marca desconhecida: "${slug}". Marcas disponíveis: ${listar().map((m) => m.slug).join(', ')}`);
  }
  return JSON.parse(fs.readFileSync(arq, 'utf-8'));
}

// Atualiza campos de identidade de uma marca já cadastrada — nome, @ do
// Instagram e paleta de cores (painel "editar identidade"). Faz merge raso
// dos objetos aninhados (`instagram`) pra não apagar `sufixo_env` ao salvar
// só o handle, e nunca toca no resto do cadastro (motor, identidade_fonte,
// logo) — isso continua sendo editado só no JSON direto.
function salvar(slug, patch) {
  const marca = obter(slug); // lança se a marca não existir
  const atualizada = { ...marca };

  if (typeof patch.nome === 'string' && patch.nome.trim()) atualizada.nome = patch.nome.trim();

  if (patch.instagram && typeof patch.instagram === 'object') {
    atualizada.instagram = { ...marca.instagram, ...patch.instagram };
  }

  if ('paleta' in patch) {
    // objeto vazio == "limpar paleta", pra voltar ao null que os motores
    // tratam como "sem override" (ver estilo-editorial/build.py)
    const p = patch.paleta;
    atualizada.paleta = p && typeof p === 'object' && Object.keys(p).length ? p : null;
  }

  const arq = path.join(PASTA_MARCAS, `${slug}.json`);
  fs.writeFileSync(arq, JSON.stringify(atualizada, null, 2), 'utf-8');
  return atualizada;
}

module.exports = { listar, obter, salvar, RAIZ, PASTA_ESTUDIO, PASTA_MARCAS };
