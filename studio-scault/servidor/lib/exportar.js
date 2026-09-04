// Exportar — o caminho de saída que NÃO passa pela Graph API.
//
// Publicar direto resolve o post que vai pro ar agora, na conta configurada.
// Só que boa parte do trabalho não termina assim: carrossel que o cliente vai
// aprovar antes, peça que vai por WhatsApp, slide que entra num deck, post
// agendado na mão pelo Meta Business Suite. Pra qualquer um desses, a única
// forma de pegar os PNGs era achar a pasta no Explorer — e o caminho real
// (studio-scault/acervo/<marca>/<slug>/instagram) não aparece em lugar nenhum
// do painel.
//
// Duas operações, então: abrir a pasta onde os PNGs já estão, e copiar a peça
// pronta pra qualquer pasta de fora do projeto.
//
// DECISÃO: crédito e origem de foto viajam SEMPRE junto (creditos.md,
// fontes.md). É a mesma regra que o guardrail de publicação aplica e que o
// CLAUDE.md da raiz trata como não-opcional — exportar os slides sem a linha
// de crédito só empurra o problema pro momento em que alguém sobe a peça na
// mão e já não tem como saber de quem era a foto.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { RAIZ } = require('./marcas');

// Arquivos que podem acompanhar os slides. `fixo` = não é escolha do usuário:
// se existe na pasta do post, vai junto.
const EXTRAS = [
  { chave: 'legenda',  arquivo: 'legenda.md',     rotulo: 'Legenda do post',              padrao: true },
  { chave: 'creditos', arquivo: 'creditos.md',    rotulo: 'Créditos das fotos',           padrao: true, fixo: true },
  { chave: 'fontes',   arquivo: 'fontes.md',      rotulo: 'Origem das imagens do Google', padrao: true, fixo: true },
  { chave: 'html',     arquivo: 'carrossel.html', rotulo: 'HTML da peça',                 padrao: false },
  { chave: 'post',     arquivo: 'post.json',      rotulo: 'post.json (fonte editável)',   padrao: false },
];

function rel(abs) {
  return path.relative(RAIZ, abs).split(path.sep).join('/');
}

// ---------------------------------------------------------------- inspecionar

// O que existe na pasta do post, pra montar o diálogo de exportação sem o
// painel precisar adivinhar nome de arquivo — foi assim que a lista de PNGs
// errava antes em outros pontos do estúdio: o painel numerava por conta
// própria e desalinhava quando a contagem de slides mudava.
function inspecionar(pastaAbs) {
  const pastaImagens = path.join(pastaAbs, 'instagram');
  const temImagens = fs.existsSync(pastaImagens);

  const slides = (temImagens ? fs.readdirSync(pastaImagens) : [])
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()
    .map((nome) => {
      let bytes = 0;
      try { bytes = fs.statSync(path.join(pastaImagens, nome)).size; } catch { /* sumiu no meio da varredura */ }
      return { nome, bytes };
    });

  const extras = EXTRAS.map((e) => {
    const abs = path.join(pastaAbs, e.arquivo);
    const existe = fs.existsSync(abs);
    let bytes = 0;
    if (existe) { try { bytes = fs.statSync(abs).size; } catch { /* idem */ } }
    return { ...e, existe, bytes };
  });

  return {
    pasta: rel(pastaAbs),
    pastaAbs,
    // a pasta que interessa abrir é a dos PNGs; sem render ainda, a do post
    pastaImagensAbs: temImagens ? pastaImagens : pastaAbs,
    slides,
    nSlides: slides.length,
    bytesSlides: slides.reduce((s, x) => s + x.bytes, 0),
    extras,
  };
}

// ---------------------------------------------------------------- abrir no explorador

function abrir(alvoAbs) {
  const abs = path.resolve(alvoAbs);
  if (!fs.existsSync(abs)) throw new Error('essa pasta não existe mais no disco.');
  if (!fs.statSync(abs).isDirectory()) throw new Error('o caminho não é uma pasta.');

  // O explorer.exe SAI COM CÓDIGO 1 mesmo quando abre a janela certinho —
  // tratar exit != 0 como falha faria o painel dizer "não deu" toda vez, com
  // a pasta aberta na frente da pessoa. O resultado do processo é ignorado de
  // propósito; o que valida a operação é o teste de existência acima.
  const cmd = process.platform === 'win32' ? 'explorer.exe'
    : process.platform === 'darwin' ? 'open'
      : 'xdg-open';
  execFile(cmd, [abs], { windowsHide: true }, () => {});
  return { abriu: abs };
}

// ---------------------------------------------------------------- escolher pasta

// Seletor NATIVO de pasta. O navegador não tem um que sirva: showDirectoryPicker()
// é só do Chrome e devolve um handle, não um caminho, e <input webkitdirectory>
// entrega os arquivos de dentro sem dizer onde a pasta fica. Como o servidor
// roda na máquina do Sidney, o diálogo do próprio Windows resolve — e é o que
// ele já conhece do resto do sistema.
//
// O Form topmost existe porque, sem um dono, a janela do FolderBrowserDialog
// abre ATRÁS do Chrome: o clique em "Escolher…" parecia não fazer nada.
function escolherPasta({ inicial } = {}) {
  if (process.platform !== 'win32') {
    throw new Error('o seletor de pasta nativo só existe no Windows — cola o caminho no campo ao lado.');
  }
  const partida = inicial && fs.existsSync(inicial) ? path.resolve(inicial) : '';
  const linhaPartida = partida ? '$d.SelectedPath = ' + aspasPs(partida) : '';
  const ps = [
    // OBRIGATÓRIO: sem isto o caminho volta corrompido. [Console]::Out.Write
    // emite na codepage do console (CP850/CP1252 num console oculto) e o Node
    // lê como UTF-8 — "Área de Trabalho" (a pasta onde o Sidney mais exporta,
    // por ser a área de trabalho dele) voltava "Ã¡rea", falhava na validação e
    // o painel dizia que a pasta escolhida não existe.
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
    '$dono = New-Object System.Windows.Forms.Form',
    '$dono.TopMost = $true',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$d.Description = 'Escolha a pasta pra onde exportar o carrossel'",
    '$d.ShowNewFolderButton = $true',
    linhaPartida,
    'if ($d.ShowDialog($dono) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }',
    '$dono.Dispose()',
  ].filter(Boolean).join('\n');

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-Command', ps],
      // sem pressa: o processo fica vivo enquanto a pessoa navega pelas pastas.
      // O teto de 5 min é só pra não deixar um powershell órfão se a janela for
      // esquecida aberta.
      { encoding: 'utf-8', timeout: 5 * 60 * 1000, windowsHide: true },
      (err, stdout) => {
        if (err && err.killed) return reject(new Error('o seletor de pasta ficou aberto tempo demais e foi fechado.'));
        if (err && !stdout) return reject(new Error('não deu pra abrir o seletor de pasta: ' + err.message));
        const caminho = String(stdout || '').trim();
        resolve(caminho ? { caminho } : { cancelado: true });
      }
    );
  });
}

// string literal de PowerShell: aspas simples, com a aspa interna dobrada
function aspasPs(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// ---------------------------------------------------------------- exportar

// O destino é FORA do projeto — é o ponto da funcionalidade — então ele não
// passa pelo resolverPasta() do servidor, que recusa qualquer coisa fora da
// raiz. A trava aqui é outra: tem que ser caminho absoluto de pasta que JÁ
// EXISTE (a exportação cria no máximo a subpasta do post, nunca uma árvore
// inteira a partir de um caminho digitado errado) e não pode ser de sistema.
function validarDestino(bruto) {
  const cru = String(bruto || '').trim().replace(/^"(.*)"$/, '$1');
  if (!cru) throw new Error('escolhe a pasta de destino.');

  const alvo = path.resolve(cru);
  if (!path.isAbsolute(alvo)) throw new Error('o destino precisa ser um caminho completo (ex: C:\\Users\\voce\\Desktop).');
  if (!fs.existsSync(alvo)) {
    throw new Error(`a pasta "${alvo}" não existe. Escolhe uma que já exista — a exportação só cria a subpasta do post.`);
  }
  if (!fs.statSync(alvo).isDirectory()) throw new Error('o destino é um arquivo, não uma pasta.');

  const proibidos = [process.env.SystemRoot, process.env.ProgramFiles, path.join(RAIZ, '.git')]
    .filter(Boolean)
    .map((p) => path.resolve(p));
  for (const p of proibidos) {
    if (alvo === p || alvo.startsWith(p + path.sep)) throw new Error('essa pasta é do sistema — escolhe outro destino.');
  }
  return alvo;
}

function sanitizarNome(s) {
  const limpo = String(s || 'post')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 80);
  return limpo || 'post';
}

// Copiar e CONFERIR. Nesta pasta (OneDrive) já se pagou o preço de operação de
// arquivo que falha calada — ver lib/arquivos.js sobre o fs.rmSync. A
// conferência é barata: comparar o tamanho gravado com o da origem pega tanto
// cópia truncada quanto arquivo que nem chegou a existir.
function copiarConferindo(de, para) {
  fs.copyFileSync(de, para);
  const origem = fs.statSync(de).size;
  let destino = -1;
  try { destino = fs.statSync(para).size; } catch { /* nem criou */ }
  if (destino !== origem) {
    throw new Error(
      `a cópia de ${path.basename(de)} saiu incompleta (${destino} de ${origem} bytes) — o destino pode estar sem espaço ou sem permissão de escrita.`
    );
  }
}

function exportar({ pastaAbs, slug, destino, subpasta = true, renomear = false, incluir = [], sobrescrever = false }) {
  const info = inspecionar(pastaAbs);
  if (!info.nSlides) {
    throw new Error('este post ainda não tem PNG renderizado. Renderiza antes de exportar.');
  }

  const destinoRaiz = validarDestino(destino);
  const nomeBase = sanitizarNome(slug || path.basename(pastaAbs));
  const destinoFinal = subpasta ? path.join(destinoRaiz, nomeBase) : destinoRaiz;

  if (destinoFinal === info.pastaImagensAbs || destinoFinal === pastaAbs) {
    throw new Error('a origem e o destino são a mesma pasta.');
  }

  const copias = info.slides.map((s, i) => {
    const nome = renomear ? `${nomeBase}-${String(i + 1).padStart(2, '0')}.png` : s.nome;
    return { de: path.join(info.pastaImagensAbs, s.nome), para: path.join(destinoFinal, nome), nome };
  });

  for (const extra of info.extras) {
    if (!extra.existe) continue;
    if (!extra.fixo && !incluir.includes(extra.chave)) continue;
    copias.push({
      de: path.join(pastaAbs, extra.arquivo),
      para: path.join(destinoFinal, extra.arquivo),
      nome: extra.arquivo,
    });
  }

  // Conflito não é erro: é pergunta. Devolve a lista pro painel confirmar a
  // substituição, em vez de sobrescrever calado — o nome do slide é sempre
  // slide-01.png, então exportar dois posts pra mesma pasta sem subpasta
  // colide toda vez.
  const conflitos = copias.filter((c) => fs.existsSync(c.para)).map((c) => c.nome);
  if (conflitos.length && !sobrescrever) {
    return { ok: false, conflitos, destinoFinal, total: copias.length };
  }

  fs.mkdirSync(destinoFinal, { recursive: true });
  const arquivos = [];
  for (const c of copias) {
    copiarConferindo(c.de, c.para);
    arquivos.push(c.nome);
  }

  return {
    ok: true,
    destinoFinal,
    arquivos,
    nSlides: info.nSlides,
    nExtras: arquivos.length - info.nSlides,
  };
}

module.exports = { inspecionar, abrir, escolherPasta, exportar, validarDestino, EXTRAS };
