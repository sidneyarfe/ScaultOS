// Galeria de templates. Desde 31/08/2026 ela guarda DOIS tipos, que não são a
// mesma coisa e não podem ser tratados igual:
//
//   · casca (sem "tipo", ou "casca") — sai de um post PRÓPRIO salvo como
//     modelo. É estrutura em vocabulário do motor editorial; o visual quem
//     dá é a marca que for publicar. Faz sentido porque o visual ali já é o
//     da Scault, não há nada de terceiro a preservar.
//
//   · fiel ("tipo": "fiel") — sai do extrator, importando a referência de um
//     terceiro. Carrega o CSS e o esqueleto de slide da referência e é
//     REPRODUZIDO como está: fonte, peso, caixa, escala, cor, âncora,
//     tratamento de foto e moldura. A marca de quem publica só entra pelos
//     nós `data-perfil` (avatar/nome/@), quando a referência tiver um bloco
//     de perfil. Ver pele.js.
//
// "salvar como modelo" tira a casca de um post.json
// (estrutura de slide/layout) sem o conteúdo literal; "aplicar" devolve essa
// casca pro agente (agente.js#readaptarParaTemplate), que reescreve a copy
// pra caber nos slots novos — é o "Copy adaptada ao novo template ✓" do
// concorrente, com Schwartz/Hormozi já carregados na skill de copy.
//
// A extração fica deliberadamente best-effort: ela tira o TEXTO literal dos
// nós semânticos ({"texto":...}) porque isso é inequívoco, mas não tenta
// adivinhar o que é "conteúdo" dentro de args de primitiva (ficha, serp,
// chat...) — essas primitivas viram só um marcador de "preencher no apply".
// O agente, com o post original em mãos, decide o resto — não o extrator.
'use strict';

const fs = require('fs');
const path = require('path');
const { PASTA_ESTUDIO } = require('./marcas');
const { apagarArquivo } = require('./arquivos');
const contrato = require('./contrato');

const PASTA_TEMPLATES = path.join(PASTA_ESTUDIO, 'templates');

function listar() {
  if (!fs.existsSync(PASTA_TEMPLATES)) return [];
  return fs
    .readdirSync(PASTA_TEMPLATES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const t = JSON.parse(fs.readFileSync(path.join(PASTA_TEMPLATES, f), 'utf-8'));
      return {
        nome: f.replace(/\.json$/, ''),
        totalSlides: (t.slides || []).length,
        origem: t.origem || null,
        // 'fiel' = pele importada de uma referência (visual próprio, reproduzido
        // como está). Sem tipo = casca de post da Scault, que veste a identidade
        // da marca no motor editorial. O painel precisa distinguir os dois.
        tipo: t.tipo || 'casca',
        temPerfil: (t.slides || []).some((s) => /\bdata-perfil\s*=/.test((s && s.html) || '')),
      };
    });
}

// Todo template sai daqui já conferido contra a assinatura real das primitivas
// (contrato.js). Antes, um template com o nome de argumento errado —
// `ficha(itens=...)` no lugar de `linhas` — atravessava intacto, ia parar no
// prompt do agente, virava post.json e só quebrava lá na frente, no build.py,
// depois de minutos de agente rodando. Agora o erro aparece na hora, com o
// nome certo do argumento na mensagem.
function obter(nome) {
  const arq = path.join(PASTA_TEMPLATES, `${nome}.json`);
  if (!fs.existsSync(arq)) throw new Error(`template desconhecido: "${nome}"`);
  const bruto = JSON.parse(fs.readFileSync(arq, 'utf-8'));

  // Template fiel não fala o vocabulário de primitivas do motor editorial —
  // ele É CSS e HTML da referência. Passá-lo pelo contrato do build.py não faz
  // sentido; quem confere a integridade dele é o pele.js, na hora de montar.
  if (bruto.tipo === 'fiel') {
    if (typeof bruto.css !== 'string' || !bruto.css.trim() || !Array.isArray(bruto.slides) || !bruto.slides.length) {
      throw new Error(`o template fiel "${nome}" está incompleto (falta css ou slides). Reimporta a referência.`);
    }
    return bruto;
  }

  const r = contrato.conferir(bruto);
  if (r.problemas.length) {
    throw new Error(
      `o template "${nome}" não bate com o motor:\n· ${r.problemas.join('\n· ')}\n` +
      'Conserta o JSON em studio-scault/templates/ (ou reimporta a referência) antes de usar.'
    );
  }
  return r.template;
}

// Percorre um nó de post.json e devolve a mesma forma com o texto literal
// removido — usado só nos nós de texto semântico, que são os únicos onde dá
// pra separar "conteúdo" de "estrutura" sem ambiguidade.
function despirNo(no) {
  if (no == null) return no;
  if (Array.isArray(no)) return no.map(despirNo);
  if (typeof no !== 'object') return no; // string/numero/bool: HTML cru ou dado de primitiva, preservado
  if ('texto' in no) {
    return { ...no, texto: '', destaque: [] };
  }
  if ('fn' in no) {
    // preserva a chamada (fn + a forma dos args), mas nao insiste em despir
    // conteudo de dentro de args de componente — isso fica pro agente decidir
    // no apply, olhando o post original.
    return no;
  }
  return no;
}

// `pastaAbs` (opcional) é a pasta do post de origem: dela sai a capa do
// template, copiando instagram/slide-01.png pra templates/<nome>.png. Sem
// isso o card do template ficava sempre sem miniatura — o painel monta a URL
// desse arquivo e ela vinha 404.
function salvarComoModelo(nomeArquivo, post, origemDescricao, pastaAbs) {
  fs.mkdirSync(PASTA_TEMPLATES, { recursive: true });
  const template = {
    tipo: 'casca', // post próprio: estrutura, não pele — ver cabeçalho
    origem: origemDescricao || null,
    salvo_em: new Date().toISOString().slice(0, 10),
    slides: (post.slides || []).map((sl) => ({
      classe: sl.classe || '',
      rodape: '', // rodape costuma ser literal ("Arraste →", cidade) — nao faz parte da casca
      logo: !!sl.logo,
      chrome: sl.chrome !== false,
      fundo: typeof sl.fundo === 'object' && sl.fundo && sl.fundo.fn === 'foto'
        ? { fn: 'foto', args: { ...sl.fundo.args, arquivo: '(substituir por foto real)' } }
        : sl.fundo, // fundo decorativo (mesh/glow) é casca de verdade, preserva
      corpo: despirNo(sl.corpo),
    })),
  };
  const arq = path.join(PASTA_TEMPLATES, `${nomeArquivo}.json`);
  fs.writeFileSync(arq, JSON.stringify(template, null, 2), 'utf-8');

  if (pastaAbs) {
    const capa = path.join(pastaAbs, 'instagram', 'slide-01.png');
    if (fs.existsSync(capa)) {
      try { fs.copyFileSync(capa, path.join(PASTA_TEMPLATES, `${nomeArquivo}.png`)); } catch { /* sem capa não impede salvar */ }
    }
  }
  return template;
}

// Apagar um template: o .json e a capa .png que anda junto.
//
// Esta função simplesmente NÃO EXISTIA — index.js já chamava
// `templatesLib.apagar(...)` na rota DELETE, então o botão "apagar template"
// estourava "templatesLib.apagar is not a function" e o painel só mostrava
// "erro 400" sem dizer o quê.
function apagar(nome) {
  const seguro = String(nome).replace(/[^a-z0-9-_]/gi, '');
  if (!seguro) throw new Error('nome de template inválido.');
  const arq = path.join(PASTA_TEMPLATES, `${seguro}.json`);
  if (!fs.existsSync(arq)) throw new Error(`template desconhecido: "${nome}"`);
  if (!apagarArquivo(arq)) throw new Error('não deu pra apagar o arquivo do template — está aberto em outro programa?');
  apagarArquivo(path.join(PASTA_TEMPLATES, `${seguro}.png`));

  // as referências guardadas junto (só existem em template fiel)
  const dirRefs = path.join(PASTA_TEMPLATES, `${seguro}.refs`);
  if (fs.existsSync(dirRefs)) {
    for (const f of fs.readdirSync(dirRefs)) apagarArquivo(path.join(dirRefs, f));
    try { fs.rmdirSync(dirRefs); } catch { /* pasta ocupada no OneDrive: os arquivos já saíram */ }
  }
  return { ok: true, nome: seguro };
}

// Grava um template vindo do extrator de referência, junto com a capa e — no
// caso do template fiel — as próprias imagens de referência.
//
// As referências ficam em `templates/<nome>.refs/`. Elas não vão pra pasta de
// post nenhum e nunca são publicadas: existem pra dar pra reconferir a
// fidelidade de uma peça modelada meses depois, comparando com o original.
function salvarExtraido(nomeArquivo, template, capaAbs, referencias) {
  fs.mkdirSync(PASTA_TEMPLATES, { recursive: true });
  const seguro = String(nomeArquivo).replace(/[^a-z0-9-_]/gi, '') || `extraido-${Date.now()}`;

  let paraGravar;
  let ajustes = [];
  if (template && template.tipo === 'fiel') {
    // Pele fiel não passa pelo contrato das primitivas — ela não usa primitiva
    // nenhuma. A conferência dela é outra: CSS presente, um slide por imagem
    // de referência (o extrator já garante) e vocabulário de classe fechado
    // (o pele.js confere na hora de montar cada peça).
    if (typeof template.css !== 'string' || !template.css.trim()) {
      throw new Error('a pele extraída veio sem CSS — não dá pra modelar nada com ela.');
    }
    paraGravar = template;
  } else {
    // Nada entra na galeria sem bater com o motor. O extrator gravava direto o
    // que o agente produzisse: foi assim que o "decisao" entrou com
    // `ficha(itens=...)` e só quebrou na hora de aplicar, minutos depois.
    const r = contrato.conferir(template);
    if (r.problemas.length) {
      throw new Error(`o template extraído não bate com o motor:\n· ${r.problemas.join('\n· ')}`);
    }
    ajustes = r.ajustes;
    paraGravar = r.ajustes.length ? { ...r.template, _ajustes_no_import: r.ajustes } : r.template;
  }

  fs.writeFileSync(path.join(PASTA_TEMPLATES, `${seguro}.json`), JSON.stringify(paraGravar, null, 2), 'utf-8');
  if (capaAbs && fs.existsSync(capaAbs)) {
    try { fs.copyFileSync(capaAbs, path.join(PASTA_TEMPLATES, `${seguro}.png`)); } catch { /* opcional */ }
  }

  if (Array.isArray(referencias) && referencias.length) {
    const dir = path.join(PASTA_TEMPLATES, `${seguro}.refs`);
    fs.mkdirSync(dir, { recursive: true });
    referencias.forEach((ref, i) => {
      if (!fs.existsSync(ref)) return;
      const destino = path.join(dir, `ref-${String(i + 1).padStart(2, '0')}${path.extname(ref) || '.png'}`);
      try { fs.copyFileSync(ref, destino); } catch { /* referência é para reconferência, não bloqueia */ }
    });
  }

  return {
    nome: seguro,
    tipo: paraGravar.tipo || 'casca',
    totalSlides: (paraGravar.slides || []).length,
    ajustes,
  };
}

module.exports = { listar, obter, salvarComoModelo, salvarExtraido, apagar, PASTA_TEMPLATES };
