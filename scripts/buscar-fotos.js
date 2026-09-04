#!/usr/bin/env node
/**
 * buscar-fotos.js — sourcing de imagens de banco (Pexels + Unsplash) pro conteúdo do ScaultOS.
 *
 * Dois passos, pra encaixar no checkpoint de aprovação das skills visuais:
 *
 *   1) buscar  → procura nos dois bancos, baixa previews pequenos e lista os candidatos
 *   2) baixar  → baixa em alta os IDs escolhidos e escreve os créditos
 *
 * O formato do ID já diz a fonte: Pexels é numérico (3184291), Unsplash é
 * alfanumérico (Dwu85P9SOIk). Dá pra forçar com prefixo — px:3184291, un:Dwu85P9SOIk.
 *
 * Exemplos:
 *   node scripts/buscar-fotos.js buscar "coral ensaio" --orientacao portrait --n 8
 *   node scripts/buscar-fotos.js buscar "escritório" --fonte unsplash
 *   node scripts/buscar-fotos.js baixar Dwu85P9SOIk --out marketing/conteudo/post-x --nome capa
 *   node scripts/buscar-fotos.js baixar 2014422 31855 --out . --tamanho large2x
 *
 * Requer PEXELS_API_KEY e/ou UNSPLASH_ACCESS_KEY no .env da raiz — com uma só já roda.
 * Sem dependências — usa fetch nativo (Node 20+).
 */

const fs = require('fs');
const path = require('path');

const TAMANHOS = ['original', 'large2x', 'large', 'portrait', 'landscape', 'medium', 'small', 'tiny'];

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

// ---------------------------------------------------------------- utils

// Erro esperado (chave faltando, 401, argumento inválido) — vira mensagem limpa,
// sem stack trace. Lançar em vez de process.exit() porque matar o processo com
// uma requisição em voo estoura assert do libuv no Windows.
class ErroAmigavel extends Error {}

function erro(msg) {
  throw new ErroAmigavel(msg);
}

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function corta(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
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

async function baixarArquivo(url, destino) {
  const res = await fetch(url);
  if (!res.ok) {
    await res.text().catch(() => {});
    erro(`Falha ao baixar ${url} (${res.status})`);
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
  return destino;
}

function extensao(url) {
  const m = new URL(url).pathname.match(/\.(jpe?g|png|webp)$/i);
  return m ? m[0].toLowerCase().replace('.jpeg', '.jpg') : '.jpg';
}

function raizProjeto() {
  return path.resolve(__dirname, '..');
}

// ---------------------------------------------------------------- provedores

/**
 * Cada provedor expõe a mesma interface e devolve a foto no formato normalizado:
 *
 *   { fonte, id, largura, altura, cor, alt, fotografo, fotografo_url, url, preview, bruto }
 *
 * O resto do script (busca, download, créditos) só conhece esse formato — quem
 * traduz o payload de cada API é o provedor.
 */

const PEXELS = {
  id: 'pexels',
  nome: 'Pexels',
  prefixo: 'px',
  envChave: 'PEXELS_API_KEY',
  maxPorPagina: 80,
  licenca: 'https://www.pexels.com/license/',
  comoConfigurar:
    '  1. Pega a chave grátis em https://www.pexels.com/api/ (login + "Your API Key")\n' +
    '  2. Põe no .env da raiz do projeto:\n' +
    '       PEXELS_API_KEY=sua_chave_aqui',

  async requisicao(rota, params = {}) {
    const url = new URL('https://api.pexels.com/v1' + rota);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }

    const res = await fetch(url, { headers: { Authorization: chaveDe(PEXELS) } });

    if (!res.ok) {
      // Drenar o corpo antes de abortar, senão o socket fica aberto e o
      // process.exit() derruba o libuv com assert no Windows.
      await res.text().catch(() => {});

      if (res.status === 401) erro('Chave rejeitada pelo Pexels (401). Confere PEXELS_API_KEY no .env.');
      if (res.status === 429) {
        erro(
          'Limite de requisições do Pexels estourado (429).\n' +
            '  O plano grátis dá 200 buscas/hora e 20.000/mês.\n' +
            '  Espera a virada da hora, usa --fonte unsplash, ou pede aumento em https://www.pexels.com/api/'
        );
      }
      erro(`Pexels respondeu ${res.status} ${res.statusText} em ${rota}`);
    }

    return { dados: await res.json(), restante: res.headers.get('x-ratelimit-remaining') };
  },

  async buscar({ query, n, pagina, orientacao, cor, locale }) {
    const { dados, restante } = await PEXELS.requisicao('/search', {
      query,
      per_page: Math.min(n, PEXELS.maxPorPagina),
      page: pagina,
      orientation: orientacao,
      color: cor,
      locale: locale || 'pt-BR',
    });
    return { fotos: (dados.photos || []).map(PEXELS.normalizar), restante };
  },

  async porId(id) {
    const { dados } = await PEXELS.requisicao(`/photos/${encodeURIComponent(id)}`);
    return PEXELS.normalizar(dados);
  },

  normalizar(f) {
    return {
      fonte: 'Pexels',
      id: String(f.id),
      largura: f.width,
      altura: f.height,
      cor: f.avg_color,
      alt: f.alt,
      fotografo: f.photographer,
      fotografo_url: f.photographer_url,
      url: f.url,
      preview: f.src.medium,
      bruto: f,
    };
  },

  urlDoTamanho(foto, tamanho) {
    const url = foto.bruto.src[tamanho];
    if (!url) erro(`Foto ${foto.id} (Pexels) não tem a variante "${tamanho}".`);
    return url;
  },

  // As variantes do Pexels trazem a dimensão na própria query da URL — ler dali
  // é mais confiável que manter uma tabela de larguras aqui.
  larguraEntregue(foto, tamanho, url) {
    if (tamanho === 'original') return foto.largura;
    const q = new URL(url).searchParams;
    const dpr = parseInt(q.get('dpr') || '1', 10) || 1;
    const w = parseInt(q.get('w') || '', 10);
    if (w) return w * dpr;
    // medium/small são limitados só pela altura: deriva a largura do aspecto.
    const h = parseInt(q.get('h') || '', 10);
    if (h && foto.altura) return Math.round(h * dpr * (foto.largura / foto.altura));
    return null;
  },

  async registrarUso() {
    /* Pexels não tem endpoint de contagem de download */
  },
};

// Cores aceitas pelo filtro do Unsplash — hex não passa (o Pexels aceita).
const CORES_UNSPLASH = [
  'black_and_white', 'black', 'white', 'yellow', 'orange',
  'red', 'purple', 'magenta', 'green', 'teal', 'blue',
];

// O Unsplash serve por CDN com resize sob demanda, então em vez de variantes
// prontas a gente pede a largura equivalente à do Pexels — assim o vocabulário
// de --tamanho é o mesmo nos dois bancos.
const LARGURA_UNSPLASH = {
  original: 3000, large2x: 2400, large: 1880, portrait: 1200,
  landscape: 1200, medium: 1000, small: 640, tiny: 280,
};

const UNSPLASH = {
  id: 'unsplash',
  nome: 'Unsplash',
  prefixo: 'un',
  envChave: 'UNSPLASH_ACCESS_KEY',
  maxPorPagina: 30,
  licenca: 'https://unsplash.com/license',
  comoConfigurar:
    '  1. Cria uma app em https://unsplash.com/oauth/applications e copia a "Access Key"\n' +
    '  2. Põe no .env da raiz do projeto:\n' +
    '       UNSPLASH_ACCESS_KEY=sua_chave_aqui\n' +
    '  (a Secret Key é do fluxo OAuth — o ScaultOS não usa)',

  cabecalho() {
    return { Authorization: `Client-ID ${chaveDe(UNSPLASH)}`, 'Accept-Version': 'v1' };
  },

  async requisicao(rota, params = {}) {
    const url = new URL('https://api.unsplash.com' + rota);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }

    const res = await fetch(url, { headers: UNSPLASH.cabecalho() });

    if (!res.ok) {
      const corpo = await res.text().catch(() => '');

      if (res.status === 401) {
        erro('Chave rejeitada pelo Unsplash (401). Confere UNSPLASH_ACCESS_KEY no .env.');
      }
      if (res.status === 403 && /rate limit/i.test(corpo)) {
        erro(
          'Limite de requisições do Unsplash estourado (403).\n' +
            '  App em Demo tem 50 requisições/hora. Espera a virada da hora,\n' +
            '  usa --fonte pexels, ou pede aprovação pra Production em\n' +
            '  https://unsplash.com/oauth/applications (aí sobe pra 5.000/hora).'
        );
      }
      if (res.status === 404) erro(`Foto não encontrada no Unsplash em ${rota}.`);
      erro(`Unsplash respondeu ${res.status} ${res.statusText} em ${rota}`);
    }

    return { dados: await res.json(), restante: res.headers.get('x-ratelimit-remaining') };
  },

  async buscar({ query, n, pagina, orientacao, cor }) {
    const { dados, restante } = await UNSPLASH.requisicao('/search/photos', {
      query,
      per_page: Math.min(n, UNSPLASH.maxPorPagina),
      page: pagina,
      // O Unsplash chama de "squarish" o que o Pexels chama de "square".
      orientation: orientacao === 'square' ? 'squarish' : orientacao,
      // Filtro de cor aqui só aceita nome de uma lista fechada — hex vira ruído.
      color: cor && CORES_UNSPLASH.includes(String(cor).toLowerCase()) ? String(cor).toLowerCase() : undefined,
      content_filter: 'high',
    });
    return { fotos: (dados.results || []).map(UNSPLASH.normalizar), restante };
  },

  async porId(id) {
    const { dados } = await UNSPLASH.requisicao(`/photos/${encodeURIComponent(id)}`);
    return UNSPLASH.normalizar(dados);
  },

  normalizar(f) {
    const user = f.user || {};
    return {
      fonte: 'Unsplash',
      id: f.id,
      largura: f.width,
      altura: f.height,
      cor: f.color,
      alt: f.alt_description || f.description,
      fotografo: user.name || user.username || '—',
      fotografo_url: comUtm((user.links && user.links.html) || `https://unsplash.com/@${user.username}`),
      url: comUtm(f.links && f.links.html),
      preview: f.urls.small,
      bruto: f,
    };
  },

  urlDoTamanho(foto, tamanho) {
    const largura = LARGURA_UNSPLASH[tamanho];
    if (!largura) erro(`--tamanho "${tamanho}" não vale pro Unsplash.`);
    const url = new URL(foto.bruto.urls.raw);
    url.searchParams.set('fm', 'jpg');
    url.searchParams.set('q', '90');
    url.searchParams.set('fit', 'max'); // fit=max nunca faz upscale
    url.searchParams.set('w', String(largura));
    return url.toString();
  },

  larguraEntregue(foto, tamanho) {
    return Math.min(foto.largura, LARGURA_UNSPLASH[tamanho] || foto.largura);
  },

  // Exigido pelas API Guidelines do Unsplash: ao efetivamente usar a foto, bater
  // no download_location pra creditar o download ao fotógrafo. Não baixa nada.
  async registrarUso(foto) {
    const loc = foto.bruto.links && foto.bruto.links.download_location;
    if (!loc) return;
    try {
      const res = await fetch(loc, { headers: UNSPLASH.cabecalho() });
      await res.text().catch(() => {});
    } catch {
      // Rede instável não pode travar o download da foto em si.
    }
  },
};

function porNomeDeFonte(nome) {
  return nome === 'Unsplash' ? UNSPLASH : PEXELS;
}

function chaveDe(prov) {
  const k = process.env[prov.envChave];
  if (!k) {
    erro(
      `${prov.envChave} não encontrada.\n\n${prov.comoConfigurar}\n\n` +
        '  O .env já está no .gitignore — a chave não vai pro repositório.'
    );
  }
  return k;
}

function temChave(prov) {
  return Boolean(process.env[prov.envChave]);
}

// Atribuição do Unsplash exige utm_source/utm_medium nos links de volta.
function comUtm(u) {
  if (!u) return u;
  try {
    const url = new URL(u);
    url.searchParams.set('utm_source', process.env.UNSPLASH_APP_NAME || 'scaultos');
    url.searchParams.set('utm_medium', 'referral');
    return url.toString();
  } catch {
    return u;
  }
}

// --fonte pexels|unsplash|ambos (padrão: ambos, filtrado pelas chaves que existem)
function resolverFontes(opt) {
  const pedido = String(opt === true ? 'ambos' : opt || 'ambos').toLowerCase();

  // Fonte pedida na mão: cobra a chave dela (chaveDe explica como configurar).
  if (['pexels', 'px'].includes(pedido)) return chaveDe(PEXELS) && [PEXELS];
  if (['unsplash', 'un'].includes(pedido)) return chaveDe(UNSPLASH) && [UNSPLASH];
  if (!['ambos', 'ambas', 'todos', 'todas', 'all'].includes(pedido)) {
    erro('--fonte aceita: pexels, unsplash ou ambos');
  }

  const disponiveis = [PEXELS, UNSPLASH].filter(temChave);
  if (!disponiveis.length) {
    erro(
      'Nenhuma chave de banco de imagem configurada.\n\n' +
        `Pexels:\n${PEXELS.comoConfigurar}\n\nUnsplash:\n${UNSPLASH.comoConfigurar}\n\n` +
        '  Uma só já resolve — o script busca no que estiver configurado.'
    );
  }
  return disponiveis;
}

// ---------------------------------------------------------------- créditos

// creditos.json é a fonte de verdade; o .md é regerado a partir dele.
// Assim rodar o comando duas vezes na mesma pasta não duplica linha.
function registrarCreditos(dir, entradas) {
  const jsonPath = path.join(dir, 'creditos.json');
  let base = { fotos: [] };

  if (fs.existsSync(jsonPath)) {
    try {
      base = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (!Array.isArray(base.fotos)) base.fotos = [];
      // Arquivos gerados antes do Unsplash tinham a fonte só no topo.
      const antiga = base.fonte || 'Pexels';
      for (const f of base.fotos) if (!f.fonte) f.fonte = antiga;
    } catch {
      base = { fotos: [] };
    }
  }

  for (const nova of entradas) {
    const i = base.fotos.findIndex((f) => f.arquivo === nova.arquivo);
    if (i >= 0) base.fotos[i] = nova;
    else base.fotos.push(nova);
  }

  const usadas = [...new Set(base.fotos.map((f) => f.fonte))];
  base = {
    fontes: usadas.map((n) => ({ nome: n, licenca: porNomeDeFonte(n).licenca })),
    fotos: base.fotos,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(base, null, 2) + '\n');

  const linhas = [
    '# Créditos das fotos',
    '',
    'Fotos de banco — uso livre, inclusive comercial:',
    '',
    ...base.fontes.map((f) => `- [${f.nome}](${f.licenca}) — licença`),
    '',
    '| Arquivo | Fonte | Fotógrafo | Original |',
    '| --- | --- | --- | --- |',
    ...base.fotos.map(
      (f) =>
        `| \`${f.arquivo}\` | ${f.fonte} | [${f.fotografo}](${f.fotografo_url}) | [${f.fonte} #${f.id}](${f.url}) |`
    ),
    '',
  ];

  // O Unsplash exige a atribuição nominal ao fotógrafo, com link de volta.
  const doUnsplash = base.fotos.filter((f) => f.fonte === 'Unsplash');
  if (doUnsplash.length) {
    linhas.push(
      '## Atribuição exigida pelo Unsplash',
      '',
      'Onde couber crédito escrito (post no blog, página do site), usar o formato oficial:',
      '',
      ...doUnsplash.map(
        (f) =>
          `- Photo by [${f.fotografo}](${f.fotografo_url}) on [Unsplash](${comUtm('https://unsplash.com/')}) — \`${f.arquivo}\``
      ),
      ''
    );
  }

  linhas.push('**Na legenda do post, creditar assim:** `' + linhaLegenda(base.fotos) + '`', '');
  fs.writeFileSync(path.join(dir, 'creditos.md'), linhas.join('\n'));

  return { jsonPath, legenda: linhaLegenda(base.fotos) };
}

// Linha curta pra legenda do Instagram. O Unsplash pede o nome do fotógrafo;
// o Pexels se satisfaz com a marca (e assim a linha não vira um parágrafo).
function linhaLegenda(fotos) {
  const un = fotos.filter((f) => f.fonte === 'Unsplash');
  const px = fotos.filter((f) => f.fonte !== 'Unsplash');
  const partes = [];

  if (un.length) {
    const nomes = [...new Set(un.map((f) => f.fotografo).filter(Boolean))];
    partes.push(`${nomes.join(', ')} / Unsplash`);
  }
  if (px.length) {
    partes.push(px.length === 1 && !un.length ? `Pexels (foto de ${px[0].fotografo})` : 'Pexels');
  }
  return `Fotos: ${partes.join(' · ')}`;
}

// ---------------------------------------------------------------- buscar

async function cmdBuscar(pos, opts) {
  const query = pos.join(' ').trim();
  if (!query) erro('Falta o termo de busca.\n  Ex: node scripts/buscar-fotos.js buscar "coral ensaio"');

  const n = Math.min(Math.max(parseInt(opts.n || opts.quantidade || 8, 10) || 8, 1), 60);
  const orientacao = opts.orientacao || opts.orientation;
  if (orientacao && !['landscape', 'portrait', 'square'].includes(orientacao)) {
    erro('--orientacao aceita: portrait, landscape ou square');
  }

  const fontes = resolverFontes(opts.fonte);
  const params = {
    query,
    pagina: opts.pagina || opts.page || 1,
    orientacao,
    cor: opts.cor || opts.color,
    locale: opts.locale,
  };

  // Divide a cota de resultados entre os bancos e busca em paralelo. Um banco
  // fora do ar (ou sem cota) não pode derrubar a busca no outro.
  const porFonte = Math.max(1, Math.ceil(n / fontes.length));
  const respostas = await Promise.all(
    fontes.map((prov) =>
      prov
        .buscar({ ...params, n: porFonte })
        .then((r) => ({ prov, ...r }))
        .catch((e) => ({ prov, falha: e }))
    )
  );

  for (const r of respostas) {
    if (r.falha) console.log(`\n⚠ ${r.prov.nome}: ${r.falha.message.split('\n')[0]}`);
  }
  const oks = respostas.filter((r) => !r.falha);
  if (!oks.length) erro(respostas[0].falha.message);

  // Intercala os bancos pra lista sair comparável (px, un, px, un…).
  const fotos = [];
  for (let i = 0; ; i++) {
    const rodada = oks.map((r) => r.fotos[i]).filter(Boolean);
    if (!rodada.length) break;
    fotos.push(...rodada);
  }

  if (!fotos.length) {
    console.log(
      `\nNenhuma foto pra "${query}".\n` +
        'Dicas: tenta em inglês (os dois acervos são indexados majoritariamente em inglês),\n' +
        'usa termos mais genéricos, ou tira o filtro de --orientacao/--cor.\n'
    );
    return;
  }

  // Previews pequenos em disco pro Claude conseguir olhar antes de escolher.
  const previewDir = path.resolve(opts.previews || path.join(raizProjeto(), '.fotos', slug(query)));
  fs.mkdirSync(previewDir, { recursive: true });

  const rotulo = oks.map((r) => r.prov.nome).join(' + ');
  console.log(`\n${fotos.length} resultado(s) pra "${query}"${orientacao ? ` (${orientacao})` : ''} — ${rotulo}:\n`);
  console.log('  #  FONTE     ID            DIMENSÕES     COR       DESCRIÇÃO');
  console.log('  ────────────────────────────────────────────────────────────────────────────────');

  const previews = [];
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    const prov = porNomeDeFonte(f.fonte);
    const arq = path.join(previewDir, `${String(i + 1).padStart(2, '0')}-${prov.prefixo}-${f.id}.jpg`);
    await baixarArquivo(f.preview, arq);
    previews.push(arq);

    const idx = String(i + 1).padStart(3);
    console.log(
      `${idx}  ${f.fonte.padEnd(9)} ${String(f.id).padEnd(13)} ${`${f.largura}x${f.altura}`.padEnd(13)} ` +
        `${(f.cor || '—').padEnd(9)} ${corta(f.alt, 38)}`
    );
    console.log(`     ${corta('foto de ' + f.fotografo, 60)} · ${f.url}`);
  }

  console.log(`\nPreviews salvos em: ${previewDir}`);
  console.log('Olha os previews, escolhe o(s) ID(s) e baixa em alta:');
  console.log(`  node scripts/buscar-fotos.js baixar ${fotos[0].id} --out <pasta-do-conteudo> --nome capa`);

  const cotas = oks.filter((r) => r.restante).map((r) => `${r.prov.nome}: ${r.restante}`);
  if (cotas.length) console.log(`\n(requisições restantes — ${cotas.join(' · ')})`);
  console.log();

  if (opts.json) {
    fs.writeFileSync(
      path.join(previewDir, 'resultados.json'),
      JSON.stringify({ query, fotos: fotos.map(({ bruto, ...f }) => f), previews }, null, 2) + '\n'
    );
  }
}

// ---------------------------------------------------------------- baixar

// Pexels é numérico, Unsplash é alfanumérico. Prefixo explícito (px:/un:) ou
// --fonte vencem a heurística.
function interpretarId(bruto, forcada) {
  const m = String(bruto).match(/^(px|pexels|un|unsplash):(.+)$/i);
  if (m) return { prov: /^p/i.test(m[1]) ? PEXELS : UNSPLASH, id: m[2] };
  if (forcada) return { prov: forcada, id: String(bruto) };
  if (/^\d+$/.test(bruto)) return { prov: PEXELS, id: String(bruto) };
  if (/^[A-Za-z0-9_-]{6,}$/.test(bruto)) return { prov: UNSPLASH, id: String(bruto) };
  return null;
}

// --fonte no baixar é opcional: só serve pra desempatar ID sem prefixo.
function fonteForcada(opt) {
  if (!opt || opt === true) return null;
  const nome = String(opt).toLowerCase();
  if (['ambos', 'ambas', 'todos', 'todas', 'all'].includes(nome)) return null;
  const prov = { px: PEXELS, pexels: PEXELS, un: UNSPLASH, unsplash: UNSPLASH }[nome];
  if (!prov) erro('--fonte aceita: pexels, unsplash ou ambos');
  return prov;
}

async function cmdBaixar(pos, opts) {
  const forcada = fonteForcada(opts.fonte);
  const alvos = pos.map((p) => interpretarId(p, forcada)).filter(Boolean);
  if (!alvos.length) {
    erro(
      'Falta o ID da foto.\n' +
        '  Pexels:   node scripts/buscar-fotos.js baixar 2014422 --out marketing/conteudo/post-x\n' +
        '  Unsplash: node scripts/buscar-fotos.js baixar Dwu85P9SOIk --out marketing/conteudo/post-x'
    );
  }

  const tamanho = opts.tamanho || opts.size || 'original';
  if (!TAMANHOS.includes(tamanho)) erro(`--tamanho aceita: ${TAMANHOS.join(', ')}`);

  const out = path.resolve(opts.out || opts.saida || '.');
  fs.mkdirSync(out, { recursive: true });

  const entradas = [];
  for (let i = 0; i < alvos.length; i++) {
    const { prov, id } = alvos[i];
    const f = await prov.porId(id);
    const url = prov.urlDoTamanho(f, tamanho);

    const base = opts.nome
      ? alvos.length > 1
        ? `${slug(opts.nome)}-${String(i + 1).padStart(2, '0')}`
        : slug(opts.nome)
      : `${prov.prefixo}-${f.id}`;
    const arquivo = `foto-${base}${extensao(url)}`;

    await baixarArquivo(url, path.join(out, arquivo));
    await prov.registrarUso(f);

    // 1080x1350 renderizado em deviceScaleFactor 2 = 2160px de largura real.
    const entregue = prov.larguraEntregue(f, tamanho, url);
    const aviso = entregue && entregue < 2160 ? `  ⚠ ${entregue}px — menor que 2160px, pode pixelar em full-bleed` : '';
    console.log(`✓ ${arquivo}  (${f.largura}x${f.altura}, ${f.fonte}, ${tamanho})${aviso}`);

    entradas.push({
      arquivo,
      fonte: f.fonte,
      id: f.id,
      fotografo: f.fotografo,
      fotografo_url: f.fotografo_url,
      url: f.url,
      alt: f.alt,
      tamanho,
      largura: f.largura,
      altura: f.altura,
      cor: f.cor,
      baixado_em: new Date().toISOString().slice(0, 10),
    });
  }

  const { legenda } = registrarCreditos(out, entradas);
  console.log(`\nCréditos gravados em ${path.join(out, 'creditos.md')}`);
  console.log(`Lembra de pôr "${legenda}" na legenda do post.\n`);
}

// ---------------------------------------------------------------- help

function ajuda() {
  console.log(`
buscar-fotos.js — fotos de banco via API do Pexels e do Unsplash

  buscar <termo> [opções]
    --fonte pexels|unsplash|ambos            onde procurar (padrão: ambos)
    --orientacao portrait|landscape|square   filtro de formato (padrão: todos)
    --n <1-60>                               quantos resultados no total (padrão: 8)
    --cor <hex|nome>                         ex: --cor "#0E1116" ou --cor teal
                                             (hex só vale no Pexels; o Unsplash
                                             aceita: ${CORES_UNSPLASH.slice(0, 5).join(', ')}…)
    --pagina <n>                             próxima página de resultados
    --locale <pt-BR|en-US|...>               idioma da busca (só Pexels)
    --previews <dir>                         onde salvar os previews
    --json                                   grava resultados.json junto

  baixar <id> [<id>...] [opções]
    --out <dir>                              pasta destino (padrão: atual)
    --nome <prefixo>                         vira foto-<prefixo>.jpg
    --fonte pexels|unsplash                  força a fonte dos IDs sem prefixo
    --tamanho ${TAMANHOS.join('|')}
                                             (padrão: original)

  O ID diz a fonte: numérico = Pexels, alfanumérico = Unsplash.
  Pra forçar, usa prefixo: px:2014422 ou un:Dwu85P9SOIk

Exemplos:
  node scripts/buscar-fotos.js buscar "escritório advocacia" --orientacao portrait --n 10
  node scripts/buscar-fotos.js buscar "belém do pará" --fonte unsplash
  node scripts/buscar-fotos.js baixar 3184291 --out marketing/conteudo/post-x --nome capa
  node scripts/buscar-fotos.js baixar Dwu85P9SOIk --out marketing/conteudo/post-x --nome capa

Chaves grátis (basta uma):
  Pexels    https://www.pexels.com/api/                 →  PEXELS_API_KEY
  Unsplash  https://unsplash.com/oauth/applications     →  UNSPLASH_ACCESS_KEY
`);
}

// ---------------------------------------------------------------- main

(async () => {
  carregarEnv();
  const { opts, pos } = parseArgs(process.argv.slice(2));
  const comando = (pos.shift() || '').toLowerCase();

  if (!comando || opts.help || opts.h || ['ajuda', 'help'].includes(comando)) return ajuda();
  if (['buscar', 'search'].includes(comando)) return cmdBuscar(pos, opts);
  if (['baixar', 'download'].includes(comando)) return cmdBaixar(pos, opts);

  erro(`Comando desconhecido: "${comando}". Use "buscar" ou "baixar" (--help pra ver as opções).`);
})().catch((e) => {
  console.error('\n✗ ' + (e instanceof ErroAmigavel ? e.message : e.stack) + '\n');
  // exitCode em vez de process.exit(): matar o processo enquanto o pool
  // keep-alive do fetch ainda tem socket aberto estoura assert do libuv
  // no Windows (UV_HANDLE_CLOSING). Deixa o Node encerrar sozinho.
  process.exitCode = 1;
});
