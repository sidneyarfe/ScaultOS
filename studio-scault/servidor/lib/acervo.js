// Acervo de posts: o que o estúdio criou (estudio/acervo/<marca>/<slug>/) e o
// que já existia em marketing/conteudo/ antes do estúdio existir. Os dois
// entram na mesma listagem.
//
// Todo caminho sai daqui RELATIVO à raiz do projeto, com "/" — é o que o
// painel devolve pro servidor em toda rota (/api/arquivo, /api/editor-html,
// /api/post…). Antes saía caminho absoluto do Windows, o painel repassava a
// string crua e só funcionava por acidente do path.resolve.
'use strict';

const fs = require('fs');
const path = require('path');
const { RAIZ, PASTA_ESTUDIO } = require('./marcas');

const PASTA_ACERVO_ESTUDIO = path.join(PASTA_ESTUDIO, 'acervo');
const PASTA_MARKETING = path.join(RAIZ, 'marketing', 'conteudo');

function rel(abs) {
  return path.relative(RAIZ, abs).split(path.sep).join('/');
}

function ehPastaDePost(pastaAbs) {
  return (
    fs.existsSync(path.join(pastaAbs, 'carrossel.html')) ||
    fs.existsSync(path.join(pastaAbs, 'post.json')) ||
    fs.existsSync(path.join(pastaAbs, 'instagram'))
  );
}

function descreverPost(pastaAbs, origem) {
  const nome = path.basename(pastaAbs);
  const instagramDir = path.join(pastaAbs, 'instagram');
  const pngs = fs.existsSync(instagramDir)
    ? fs.readdirSync(instagramDir).filter((f) => f.toLowerCase().endsWith('.png')).sort()
    : [];
  const temPost = fs.existsSync(path.join(pastaAbs, 'post.json'));
  const temHtml = fs.existsSync(path.join(pastaAbs, 'carrossel.html'));
  const legendaPath = ['legenda.md', 'legenda.txt']
    .map((f) => path.join(pastaAbs, f))
    .find((p) => fs.existsSync(p));

  let atualizadoEm = 0;
  try {
    atualizadoEm = fs.statSync(temHtml ? path.join(pastaAbs, 'carrossel.html') : pastaAbs).mtimeMs;
  } catch { /* pasta sumiu no meio da varredura — ignora */ }

  return {
    slug: nome,
    pasta: rel(pastaAbs),
    origem, // 'estudio' | 'marketing'
    // o motor de um post é o que existe na pasta, não o cadastro da marca: um
    // post antigo da Scault feito à mão e um post do estúdio da mesma marca
    // podem ter motores diferentes.
    motor: temPost ? 'estilo-editorial' : 'carrossel-generico',
    // "editável" agora é qualquer post que tenha post.json OU carrossel.html —
    // o editor universal cobre os dois. Antes só post.json contava, e metade
    // do acervo aparecia como somente-leitura sem motivo real.
    editavel: temPost || temHtml,
    renderizado: pngs.length > 0,
    capa: pngs[0] ? rel(path.join(instagramDir, pngs[0])) : null,
    pngs: pngs.map((f) => rel(path.join(instagramDir, f))),
    totalSlides: pngs.length,
    atualizadoEm,
    legenda: legendaPath ? fs.readFileSync(legendaPath, 'utf-8').slice(0, 240) : null,
  };
}

function listar() {
  const itens = [];

  // acervo próprio do estúdio: acervo/<marca>/<slug>/
  if (fs.existsSync(PASTA_ACERVO_ESTUDIO)) {
    for (const marcaDir of fs.readdirSync(PASTA_ACERVO_ESTUDIO)) {
      if (marcaDir.startsWith('_')) continue; // _extratos, _referencias-soltas: não são posts
      const marcaAbs = path.join(PASTA_ACERVO_ESTUDIO, marcaDir);
      if (!fs.statSync(marcaAbs).isDirectory()) continue;
      for (const slug of fs.readdirSync(marcaAbs)) {
        const pastaAbs = path.join(marcaAbs, slug);
        if (fs.statSync(pastaAbs).isDirectory() && ehPastaDePost(pastaAbs)) {
          itens.push({ ...descreverPost(pastaAbs, 'estudio'), marca: marcaDir });
        }
      }
    }
  }

  // pré-existente: marketing/conteudo/<slug>/
  if (fs.existsSync(PASTA_MARKETING)) {
    for (const slug of fs.readdirSync(PASTA_MARKETING)) {
      const pastaAbs = path.join(PASTA_MARKETING, slug);
      if (fs.statSync(pastaAbs).isDirectory() && ehPastaDePost(pastaAbs)) {
        itens.push({ ...descreverPost(pastaAbs, 'marketing'), marca: 'scault' });
      }
    }
  }

  return itens.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

module.exports = { listar, descreverPost, ehPastaDePost, rel, PASTA_ACERVO_ESTUDIO, PASTA_MARKETING };
