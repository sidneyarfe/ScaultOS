// Apagar arquivo e pasta — com uma implementação própria, de propósito.
//
// MOTIVO (medido nesta máquina, não é precaução teórica): `fs.rmSync(caminho,
// { force: true })` NÃO APAGA NADA dentro da pasta do ScaultOS, que fica no
// OneDrive. Não lança erro, não avisa: retorna normalmente e o arquivo
// continua lá. Testado em Node v24.11 nesta pasta, com e sem sandbox:
//
//   fs.writeFileSync('_t.png','x')
//   fs.rmSync('_t.png',{force:true})   ->  sem erro
//   fs.existsSync('_t.png')            ->  true   (!)
//   fs.unlinkSync('_t.png')            ->  apaga de verdade
//
// O mesmo vale pra pasta com { recursive: true }. `force: true` engole o erro
// que explicaria o motivo, então o efeito é silencioso — e o estúdio dependia
// disso em quatro lugares que estavam quebrados sem ninguém perceber:
//
//   · limpeza dos PNGs antigos antes de re-renderizar — um post que caiu de
//     11 pra 9 slides ficava com 11 PNGs no disco, e os 2 fantasmas iam
//     junto pro Instagram (o script de publicação lê a pasta inteira);
//   · arquivos temporários da reescrita assistida (_reescrita.txt,
//     _slide.json) — apagados ANTES de chamar o agente justamente pra
//     detectar "o agente não escreveu nada". Como não sumiam, uma chamada que
//     falhava devolvia calada a reescrita ANTERIOR;
//   · apagar post do acervo — o DELETE respondia ok e a pasta continuava lá;
//   · uploads temporários — acumulavam no temp pra sempre.
//
// Aqui só se usa unlinkSync/rmdirSync, que funcionam.
'use strict';

const fs = require('fs');
const path = require('path');

// Apaga um arquivo. Devolve true se saiu do disco. Nunca lança — quem chama
// está sempre em caminho de limpeza, não de validação.
function apagarArquivo(caminho) {
  try {
    fs.unlinkSync(caminho);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    // arquivo travado por outro processo (Chrome do render ainda com ele
    // aberto, antivírus): tenta de novo uma vez antes de desistir
    try {
      fs.unlinkSync(caminho);
      return true;
    } catch {
      return false;
    }
  }
}

// Apaga uma pasta inteira, de baixo pra cima.
function apagarPasta(caminho) {
  let stat;
  try {
    stat = fs.lstatSync(caminho);
  } catch {
    return true; // já não existe
  }
  if (!stat.isDirectory()) return apagarArquivo(caminho);

  let ok = true;
  for (const nome of fs.readdirSync(caminho)) {
    ok = apagarPasta(path.join(caminho, nome)) && ok;
  }
  try {
    fs.rmdirSync(caminho);
  } catch {
    ok = false;
  }
  return ok;
}

module.exports = { apagarArquivo, apagarPasta };
