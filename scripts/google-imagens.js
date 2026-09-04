#!/usr/bin/env node
/**
 * google-imagens.js — busca no Google Imagens dirigindo um Chrome de verdade.
 *
 * Mesma ideia do buscar-fotos.js: dois passos, pra encaixar no checkpoint de
 * aprovação das skills visuais.
 *
 *   1) buscar  → abre o Chrome, pesquisa e lista os candidatos
 *   2) baixar  → baixa os índices escolhidos em alta e grava as fontes
 *
 * Por que dirigir o Chrome em vez de raspar HTML: o Google monta a grade de
 * imagens inteiramente no cliente — o HTML cru não tem URL de imagem nenhuma.
 * E por que um Chrome lançado como navegador comum, em vez de pelo webdriver:
 * o Google detecta e bloqueia (/sorry/index) navegador iniciado por automação.
 * Aqui o Chrome sobe normal, com perfil próprio persistente, e o script
 * conversa com ele por CDP.
 *
 * Exemplos:
 *   node scripts/google-imagens.js buscar "escritório de advocacia" --n 12
 *   node scripts/google-imagens.js buscar "fachada predio belem" --n 8 --fundo
 *   node scripts/google-imagens.js baixar 1 4 7 --out marketing/conteudo/post-x
 *
 * ATENÇÃO — licença: o Google é índice, não acervo. O que vem daqui pertence a
 * terceiros e NÃO vem licenciado. Cada item baixado leva a página de origem
 * junto, em fontes.md, pra conferir antes de publicar. Pra imagem com licença
 * já resolvida na fonte, use buscar-fotos.js (Pexels/Unsplash).
 *
 * Sem dependências — Node 22+ (WebSocket e fetch nativos).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORTA = 9222;
const PERFIL = path.join(os.tmpdir(), 'scaultos-chrome-imagens');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Erro esperado vira mensagem limpa, sem stack. Mesmo padrão do buscar-fotos.js.
class ErroAmigavel extends Error {}
const erro = (m) => { throw new ErroAmigavel(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function slug(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// Parser de flags: `--nome valor` e `--flag`. O resto vira posicional.
function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const prox = argv[i + 1];
      if (prox && !prox.startsWith('--')) { opts[a.slice(2)] = prox; i++; } else opts[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { opts, pos };
}

// ------------------------------------------------------------------ chrome

function acharChrome() {
  const candidatos = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ];
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  erro('Chrome não encontrado. Passe o caminho com --chrome "C:/.../chrome.exe".');
}

async function portaViva() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORTA}/json/version`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

// Fechar a última aba pode deixar o Chrome vivo sem janela e sem servir a
// porta de depuração — zumbi que ainda segura o lock do perfil, impedindo a
// próxima execução de subir. Encerra só processos cuja linha de comando aponta
// pro NOSSO perfil dedicado; o Chrome pessoal do usuário nunca casa com isso.
function matarZumbis() {
  if (process.platform !== 'win32') {
    try {
      require('child_process').execSync(
        `pkill -f ${JSON.stringify(PERFIL)}`, { stdio: 'ignore' });
    } catch { /* nenhum processo casou */ }
    return;
  }
  const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | `
    + `Where-Object { $_.CommandLine -like '*${path.basename(PERFIL)}*' } | `
    + `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    require('child_process').execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'ignore' });
  } catch { /* nada pra matar */ }
}

async function subirChrome(caminhoChrome) {
  if (await portaViva()) return;                     // já tem um de pé, reaproveita
  matarZumbis();                                     // limpa instância travada, se houver
  await espera(1200);
  const exe = typeof caminhoChrome === 'string' ? caminhoChrome : acharChrome();
  const p = spawn(exe, [
    `--remote-debugging-port=${PORTA}`,
    `--user-data-dir=${PERFIL}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=pt-BR',
    '--window-size=1400,1000',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  p.unref();
  for (let i = 0; i < 30; i++) { if (await portaViva()) return; await espera(500); }
  erro('O Chrome não abriu a porta de depuração a tempo.');
}

// ------------------------------------------------------------------ CDP

// Conexão CDP mínima: abre uma aba, manda comandos, devolve resultado.
class Aba {
  constructor(ws, alvoId) { this.ws = ws; this.alvoId = alvoId; this.id = 0; this.pend = new Map(); }

  // Abre a aba já na URL final. Navegar depois destrói o contexto de execução
  // e o Runtime.evaluate seguinte morre com "target navigated or closed".
  static async nova(url = 'about:blank') {
    const alvo = await (await fetch(
      `http://127.0.0.1:${PORTA}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    await new Promise((ok, ko) => {
      ws.onopen = ok;
      ws.onerror = () => ko(new ErroAmigavel('Falha ao conectar no Chrome.'));
    });
    const aba = new Aba(ws, alvo.id);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      const p = aba.pend.get(m.id);
      if (!p) return;
      aba.pend.delete(m.id);
      m.error ? p.ko(new ErroAmigavel(m.error.message)) : p.ok(m.result);
    };
    return aba;
  }

  cmd(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, ko) => {
      this.pend.set(id, { ok, ko });
      setTimeout(() => { if (this.pend.delete(id)) ko(new ErroAmigavel(`Timeout em ${method}`)); }, 180000);
    });
  }

  // Uma navegação em voo destrói o contexto de execução e o evaluate falha com
  // "target navigated or closed". Nesse caso espera assentar e tenta de novo.
  async js(expr) {
    for (let tent = 0; tent < 2; tent++) {
      try {
        const r = await this.cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) erro(`Erro no navegador: ${r.exceptionDetails.text}`);
        return r.result.value;
      } catch (e) {
        if (tent === 1 || !/navigated or closed|Cannot find context/i.test(e.message)) throw e;
        await espera(2500);
      }
    }
  }

  // URL atual pelo endpoint HTTP: não depende de contexto de execução, então
  // funciona mesmo no meio de um redirecionamento (o do CAPTCHA, por exemplo).
  async urlAtual() {
    const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
    return (lista.find((t) => t.id === this.alvoId) || {}).url || '';
  }

  // Tira a janela da área visível, ou traz de volta. Headless o Google barra
  // (testado: cai direto no /sorry), então "segundo plano" aqui é uma janela
  // real, com fingerprint de navegador normal, posicionada fora da tela.
  async moverJanela(ondeEstá) {
    try {
      const { windowId } = await this.cmd('Browser.getWindowForTarget', { targetId: this.alvoId });
      const bounds = ondeEstá === 'fora'
        ? { left: -32000, top: -32000, width: 1400, height: 1000, windowState: 'normal' }
        : { left: 40, top: 40, width: 1400, height: 1000, windowState: 'normal' };
      await this.cmd('Browser.setWindowBounds', { windowId, bounds });
    } catch { /* build de Chrome sem esse comando — segue visível */ }
  }

  async fechar() {
    try {
      // Se esta for a última aba, esvazia em vez de fechar: Chrome sem nenhuma
      // janela vira zumbi e para de servir a porta de depuração.
      const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
      const abas = lista.filter((t) => t.type === 'page');
      if (abas.length <= 1) await this.cmd('Page.navigate', { url: 'about:blank' });
      else await fetch(`http://127.0.0.1:${PORTA}/json/close/${this.alvoId}`);
    } catch { /* aba ou navegador já foram */ }
    try { this.ws.close(); } catch { /* socket já foi */ }
  }
}

// ------------------------------------------------------------------ buscar

const TBS = { grande: '&tbs=isz:l', media: '&tbs=isz:m', qualquer: '' };

// Roda dentro da página: clica cada miniatura e lê o painel que abre.
function scriptDeColeta(n) {
  return `(async () => {
    const dorme = (ms) => new Promise(r => setTimeout(r, ms));

    // Rede de segurança: se algum clique escapar pra um link, não deixa sair
    // da página — perder o contexto no meio da coleta derruba tudo.
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest && ev.target.closest('a[href]');
      if (a && !a.href.includes('google.com/search')) ev.preventDefault();
    }, true);

    const out = [];
    const usados = new Set();

    // A grade carrega por scroll, e miniatura ainda não carregada não passa no
    // filtro de tamanho. Então re-consulta a cada rodada e vai descendo até
    // juntar o que foi pedido (ou acabar o que a página tem pra dar).
    for (let rodada = 0; rodada < 12 && out.length < ${n}; rodada++) {
      const atuais = Array.from(document.querySelectorAll('img'))
        .filter(i => (i.src || '').startsWith('https://encrypted-tbn')
                  && i.naturalWidth > 90 && i.clientWidth > 60
                  && !usados.has(i.src));
      if (!atuais.length) {
        window.scrollBy(0, 1400);
        await dorme(1500);
        continue;
      }
      for (const t of atuais) {
        if (out.length >= ${n}) break;
        usados.add(t.src);
        try {
          t.scrollIntoView({ block: 'center' });
          await dorme(220);
          t.click();
          await dorme(1100);
          const grandes = Array.from(document.querySelectorAll('img'))
            .filter(i => i.naturalWidth > 300 && (i.src || '').startsWith('http'))
            .sort((a, b) => b.naturalWidth - a.naturalWidth);
          const origem = Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h.startsWith('http') && !h.includes('google.com') && !h.includes('gstatic.com'));
          if (grandes.length) out.push({
            preview: grandes[0].src,
            w: grandes[0].naturalWidth,
            h: grandes[0].naturalHeight,
            alt: (t.alt || '').slice(0, 110),
            origem: origem[0] || null,
          });
        } catch (e) { /* miniatura sumiu no re-render — segue */ }
      }
      window.scrollBy(0, 1200);
      await dorme(1400);
    }
    return out;
  })()`;
}

async function buscar(termo, opts) {
  const n = Math.min(parseInt(opts.n || 12, 10) || 12, 40);
  const tamanho = TBS[opts.tamanho] ?? TBS.grande;

  await subirChrome(opts.chrome);
  const url = `https://www.google.com/search?q=${encodeURIComponent(termo)}&udm=2${tamanho}`;
  const aba = await Aba.nova(url);
  let manterAba = false;
  try {
    if (opts.fundo) await aba.moverJanela('fora');
    await espera(4500);

    if ((await aba.urlAtual()).includes('/sorry/')) {
      // Em segundo plano a janela está fora da tela — sem trazer de volta não
      // tem como resolver o desafio.
      if (opts.fundo) await aba.moverJanela('visivel');
      manterAba = true;                    // fechar aqui apagaria o desafio
      erro('O Google pediu verificação (CAPTCHA).\n' +
           'A janela do Chrome está na tela: resolva o desafio nela e rode de novo.\n' +
           'A sessão fica salva no perfil, então costuma ser uma vez só.');
    }

    // Rola pra carregar mais miniaturas antes de começar a clicar.
    for (let i = 1; i <= 3; i++) { await aba.js(`window.scrollTo(0, ${i * 1200})`); await espera(900); }
    await aba.js('window.scrollTo(0, 0)');
    await espera(600);

    const itens = await aba.js(scriptDeColeta(n));
    if (!itens || !itens.length) erro('Nenhuma imagem lida — a busca não retornou nada ou a página mudou.');

    const vistos = new Set();
    const lista = itens.filter((x) => !vistos.has(x.preview) && vistos.add(x.preview));

    const sessao = path.join(os.tmpdir(), 'scaultos-gimg-sessao.json');
    fs.writeFileSync(sessao, JSON.stringify({ termo, itens: lista }, null, 2));

    console.log(`\n${lista.length} imagens para "${termo}":\n`);
    lista.forEach((x, i) => {
      const dom = x.origem ? new URL(x.origem).hostname.replace(/^www\./, '') : '(origem não lida)';
      console.log(`  [${String(i + 1).padStart(2)}] ${String(x.w).padStart(4)}x${String(x.h).padEnd(5)} ${dom}`);
      if (x.alt) console.log(`       ${x.alt}`);
    });
    console.log('\nBaixar:  node scripts/google-imagens.js baixar 1 3 --out <pasta>');
    console.log('\nLembrete: nada disso vem licenciado. Confira a origem antes de publicar.\n');
  } finally {
    if (!manterAba) await aba.fechar();
  }
}

// ------------------------------------------------------------------ baixar

// A preview do painel já é grande, mas o original da página de origem costuma
// ser maior. Tenta og:image primeiro, cai pra preview se não achar.
async function melhorUrl(item) {
  if (!item.origem) return item.preview;
  try {
    const r = await fetch(item.origem, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': UA } });
    if (!r.ok) return item.preview;
    const html = await r.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (m) return new URL(m[1], item.origem).href;
  } catch { /* origem fora do ar, bloqueada ou sem og:image — usa a preview */ }
  return item.preview;
}

async function baixar(indices, opts) {
  const sessao = path.join(os.tmpdir(), 'scaultos-gimg-sessao.json');
  if (!fs.existsSync(sessao)) erro('Nenhuma busca anterior. Rode o comando "buscar" primeiro.');
  const { termo, itens } = JSON.parse(fs.readFileSync(sessao, 'utf8'));

  const out = path.resolve(typeof opts.out === 'string' ? opts.out : '.');
  fs.mkdirSync(out, { recursive: true });
  const nome = typeof opts.nome === 'string' ? opts.nome : slug(termo);
  const linhas = [];

  for (const idx of indices) {
    const i = parseInt(idx, 10) - 1;
    if (!(i >= 0 && i < itens.length)) { console.log(`  [${idx}] fora da lista, pulando`); continue; }
    const item = itens[i];
    try {
      // og:image primeiro; se a página apontar pra URL morta, cai na preview
      // do painel, que o Google serve e sempre responde.
      const tentativas = [...new Set([await melhorUrl(item), item.preview])];
      let r = null;
      for (const u of tentativas) {
        const resp = await fetch(u, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': UA } });
        if (resp.ok) { r = resp; break; }
        console.log(`  [${idx}] HTTP ${resp.status} em ${new URL(u).hostname}, tentando a preview`);
      }
      if (!r) { console.log(`  [${idx}] nenhuma URL respondeu, pulando`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || '';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const arq = path.join(out, `${nome}-${idx}.${ext}`);
      fs.writeFileSync(arq, buf);
      console.log(`  [${idx}] ${path.basename(arq)}  ${Math.round(buf.length / 1024)} KB`);
      linhas.push(`- \`${path.basename(arq)}\` — origem: ${item.origem || '(não lida)'}`);
    } catch (e) {
      console.log(`  [${idx}] falhou (${e.name}), pulando`);
    }
  }

  if (linhas.length) {
    const md = path.join(out, 'fontes.md');
    const cab = `# Fontes das imagens — "${termo}"\n\n` +
      '> Coletado do Google Imagens. **Nada aqui vem licenciado.** Confira a licença\n' +
      '> em cada página de origem antes de usar em peça de cliente.\n\n';
    fs.writeFileSync(md, cab + linhas.join('\n') + '\n');
    console.log(`\nFontes em ${path.relative(process.cwd(), md)} — confira a licença de cada uma.\n`);
  }
}

// ------------------------------------------------------------------ main

const AJUDA = `
google-imagens.js — Google Imagens dirigindo um Chrome real

  buscar "<termo>" [--n 12] [--tamanho grande|media|qualquer] [--fundo]
  baixar <i> [<i>...] --out <pasta> [--nome <prefixo>]

O Chrome abre numa janela própria, com perfil separado do teu. Se o Google
pedir CAPTCHA, resolva na janela e rode de novo — a sessão fica salva.

--fundo tira a janela da área visível (fora da tela). Não é headless: headless
o Google barra na hora. Se cair um CAPTCHA em modo fundo, a janela volta pra
tela sozinha pra você resolver.

Imagem já licenciada: use scripts/buscar-fotos.js (Pexels/Unsplash).
`;

async function main() {
  const { opts, pos } = parseArgs(process.argv.slice(2));
  const [comando, ...resto] = pos;
  if (comando === 'buscar') {
    if (!resto.length) erro('Falta o termo. Ex: node scripts/google-imagens.js buscar "escritório"');
    await buscar(resto.join(' '), opts);
  } else if (comando === 'baixar') {
    if (!resto.length) erro('Falta o índice. Ex: node scripts/google-imagens.js baixar 1 3 --out pasta');
    await baixar(resto, opts);
  } else {
    console.log(AJUDA);
  }
}

// O socket do CDP segura o event loop e comandos em voo podem rejeitar depois
// do fim do trabalho. Encerra explícito pra saída ficar previsível.
main()
  .then(() => process.exit(0))
  .catch((e) => {
    if (e instanceof ErroAmigavel) { console.error(`\n${e.message}\n`); process.exit(1); }
    console.error(e && e.stack);
    process.exit(1);
  });
