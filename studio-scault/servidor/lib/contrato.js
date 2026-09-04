// Contrato das primitivas do motor — a assinatura de verdade de `ficha`,
// `comparativo`, `fluxo` e companhia, lida do próprio build.py.
//
// Por que existe: POST.md lista os NOMES das primitivas e manda "ver
// build.py" pros argumentos, mas quem escreve post.json (o agente, no
// extrator e no readaptar) nunca recebe o build.py. Sem a assinatura na
// mão, ele escreve um nome plausível — e o motor só reclama na hora de
// renderizar, com um TypeError de Python.
//
// Foi exatamente isso que quebrou o template "decisao": ele foi gravado com
// `ficha(itens=...)` e `comparativo(itens_a=..., itens_b=..., destaque=...)`,
// quando o motor pede `linhas`, `linhas_a`, `linhas_b` e não tem `destaque`.
// O erro aparecia minutos depois, no meio do "aplicar template" — o build.py
// falhava, o self-healing chamava o agente duas vezes pra consertar, e a
// requisição HTTP passava tanto tempo aberta que o navegador desistia com
// "Failed to fetch", sem nunca mostrar a causa.
//
// Com isto no lugar, um template com argumento errado é pego em
// milissegundos, ANTES de entrar na galeria — e o que dá pra consertar sem
// adivinhar conteúdo (nome de argumento trocado) é consertado na hora.
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { RAIZ } = require('./marcas');

const BUILD_PY = path.join(RAIZ, '.claude', 'skills', 'carrossel', 'estilo-editorial', 'build.py');

let _cache = null;

// `python build.py --contrato` imprime {fn: {args:[{nome,obrigatorio}], doc}}.
// Cacheado no processo: a assinatura só muda quando o motor muda, e aí o
// servidor é reiniciado de qualquer jeito.
function ler() {
  if (_cache) return _cache;
  const saida = execFileSync('python', [BUILD_PY, '--contrato'], {
    encoding: 'utf-8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  _cache = JSON.parse(saida);
  return _cache;
}

// Versão curta pro prompt do agente: uma linha por primitiva, com o nome
// exato de cada argumento. É barato em token e elimina o chute.
function paraPrompt() {
  const c = ler();
  return Object.keys(c)
    .sort()
    .map((fn) => {
      const args = c[fn].args.map((a) => (a.obrigatorio ? a.nome : `${a.nome}?`)).join(', ');
      return `- ${fn}(${args})${c[fn].doc ? ` — ${c[fn].doc}` : ''}`;
    })
    .join('\n');
}

// Um argumento desconhecido quase sempre é sinônimo do certo (`itens` no
// lugar de `linhas`). Remapear é fidelidade, não invenção: o agente já disse
// QUAL conteúdo vai ali, só errou a etiqueta. Mas só remapeia quando o alvo
// é inequívoco — se sobrar mais de um candidato, vira problema reportado.
function alvoPara(chave, disponiveis) {
  if (!disponiveis.length) return null;
  if (disponiveis.length === 1) return disponiveis[0];
  // sufixo casado: itens_a -> linhas_a, itens_b -> linhas_b
  const sufixo = /_([a-z0-9]+)$/i.exec(chave);
  if (sufixo) {
    const casados = disponiveis.filter((d) => d.endsWith(`_${sufixo[1]}`));
    if (casados.length === 1) return casados[0];
  }
  return null;
}

// Percorre o template inteiro conferindo cada nó {"fn":..., "args":{...}}.
// Devolve uma cópia corrigida + a lista do que foi ajustado + a lista do que
// não deu pra consertar sem adivinhar.
function conferir(template) {
  const c = ler();
  const ajustes = [];
  const problemas = [];

  function no(v, onde) {
    if (v == null) return v;
    if (Array.isArray(v)) return v.map((x, i) => no(x, `${onde}[${i}]`));
    if (typeof v !== 'object') return v;

    if (!('fn' in v)) {
      // nó de texto semântico / wordmark / html cru: nada de assinatura pra conferir
      const copia = { ...v };
      for (const k of Object.keys(copia)) {
        if (k !== 'texto' && k !== 'destaque') copia[k] = no(copia[k], `${onde}.${k}`);
      }
      return copia;
    }

    const fn = v.fn;
    if (!c[fn]) {
      problemas.push(`${onde}: primitiva "${fn}" não existe no motor. Disponíveis: ${Object.keys(c).sort().join(', ')}.`);
      return v;
    }

    const validos = c[fn].args.map((a) => a.nome);
    const argsEntrada = v.args || {};
    const args = {};
    const desconhecidos = [];

    for (const [k, valor] of Object.entries(argsEntrada)) {
      if (validos.includes(k)) args[k] = no(valor, `${onde}.${fn}.${k}`);
      else desconhecidos.push([k, valor]);
    }

    for (const [k, valor] of desconhecidos) {
      const livres = validos.filter((n) => !(n in args));
      const alvo = alvoPara(k, livres);
      if (alvo) {
        args[alvo] = no(valor, `${onde}.${fn}.${alvo}`);
        ajustes.push(`${onde}: ${fn}("${k}") → "${alvo}"`);
      } else {
        problemas.push(
          `${onde}: ${fn} não aceita o argumento "${k}" (aceita: ${validos.join(', ') || 'nenhum'}).`
        );
      }
    }

    for (const a of c[fn].args) {
      if (a.obrigatorio && !(a.nome in args)) {
        problemas.push(`${onde}: ${fn} exige o argumento "${a.nome}", que não veio.`);
      }
    }

    return { ...v, args };
  }

  const slides = (template.slides || []).map((sl, i) => ({
    ...sl,
    corpo: no(sl.corpo, `slide ${i + 1}`),
    fundo: no(sl.fundo, `slide ${i + 1} (fundo)`),
  }));

  return { template: { ...template, slides }, ajustes, problemas };
}

module.exports = { ler, paraPrompt, conferir, BUILD_PY };
