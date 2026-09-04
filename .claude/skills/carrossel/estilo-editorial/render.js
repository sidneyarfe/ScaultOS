// Renderiza cada .slide de carrossel.html em PNG — 1080x1350 (feed 4:5) ou
// 1080x1920 (stories 9:16), o que o post.json tiver pedido. O screenshot é
// por elemento (`.locator().screenshot()`), que recorta pelo bounding box do
// próprio .slide — o viewport só precisa ser grande o bastante pro MAIOR
// formato suportado, não precisa detectar o tamanho de cada post.
// Uso: NODE_PATH="C:/Users/sidne/node_modules" node render.js
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:\\Users\\sidne\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe';
const OUT = 'instagram';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 }, // maior formato suportado — o resto recorta menor
    deviceScaleFactor: 1,
  });

  await page.goto('file:///' + path.resolve('carrossel.html').replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  const total = await page.locator('.slide').count();

  // Isola um slide por vez: com 15 slides a página passa de 20.000px e o
  // screenshot por elemento corta os de baixo. Escondendo os demais, a
  // página fica do tamanho de um slide e a captura sai íntegra.
  for (let i = 0; i < total; i++) {
    await page.evaluate((idx) => {
      document.querySelectorAll('.slide').forEach((el, j) => {
        el.style.display = j === idx ? 'block' : 'none';
      });
      window.scrollTo(0, 0);
    }, i);
    await page.waitForTimeout(120);

    const n = String(i + 1).padStart(2, '0');
    const file = `${OUT}/slide-${n}.png`;
    await page.locator('.slide').nth(i).screenshot({ path: file });
    console.log('gerado:', file);
  }

  console.log(`\n${total} slides renderizados em ${OUT}/`);
  await browser.close();
})();
