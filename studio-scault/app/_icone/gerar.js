// Rasteriza app/studio.svg em PNGs de várias resoluções, com fundo
// transparente (só os cantos arredondados ficam vazados). O empacotamento
// em .ico é feito pelo gerar.py ao lado — Node não escreve .ico, PIL não
// rasteriza SVG, então cada um faz metade.
//
// Uso: NODE_PATH="C:/Users/sidne/node_modules" node gerar.js
'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const DIR_ICONE = __dirname;
const DIR_APP = path.dirname(DIR_ICONE);
const DIR_PAINEL = path.join(path.dirname(DIR_APP), 'painel');
const CHROME = 'C:\\Users\\sidne\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe';

const svg = fs.readFileSync(path.join(DIR_APP, 'studio.svg'), 'utf-8');

// tamanhos que entram no .ico (Windows escolhe o melhor por contexto) e os
// PNGs que o painel usa como favicon/barra de tarefas e manifest PWA.
const PARA_ICO = [16, 24, 32, 48, 64, 128, 256];
const PARA_PAINEL = { 'icone-192.png': 192, 'icone-512.png': 512, 'icone-256.png': 256 };

async function png(page, lado) {
  await page.setViewportSize({ width: lado, height: lado });
  await page.setContent(
    `<!doctype html><meta charset="utf-8">` +
    `<style>*{margin:0;padding:0}html,body{width:${lado}px;height:${lado}px;overflow:hidden}` +
    `svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`
  );
  return page.screenshot({ omitBackground: true });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  fs.mkdirSync(path.join(DIR_ICONE, 'png'), { recursive: true });
  for (const lado of PARA_ICO) {
    fs.writeFileSync(path.join(DIR_ICONE, 'png', `${lado}.png`), await png(page, lado));
  }
  for (const [nome, lado] of Object.entries(PARA_PAINEL)) {
    fs.writeFileSync(path.join(DIR_PAINEL, nome), await png(page, lado));
  }

  await browser.close();
  console.log('PNGs prontos em _icone/png/ e painel/icone-*.png');
})();
