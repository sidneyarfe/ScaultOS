// Renderiza cada .slide de um HTML no padrão tweet-thread em PNG, um arquivo por slide.
// Detecta a largura/altura do próprio slide no HTML (1080x1350, 1080x1440 ou 1080x1920).
// Uso: NODE_PATH="C:/Users/sidne/node_modules" node render.js <arquivo.html> [pasta-saida]
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:\\Users\\sidne\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe';

const htmlFile = process.argv[2];
const OUT = process.argv[3] || 'meta';

if (!htmlFile) {
  console.error('Uso: node render.js <arquivo.html> [pasta-saida]');
  process.exit(1);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 }, // grande o bastante pro maior formato suportado
    deviceScaleFactor: 1,
  });

  await page.goto('file:///' + path.resolve(htmlFile).replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const total = await page.locator('.slide').count();

  for (let i = 0; i < total; i++) {
    const name = await page.locator('.slide').nth(i).getAttribute('data-name');
    await page.evaluate((idx) => {
      document.querySelectorAll('.slide').forEach((el, j) => {
        el.style.display = j === idx ? 'flex' : 'none';
      });
      window.scrollTo(0, 0);
    }, i);
    await page.waitForTimeout(120);

    const file = `${OUT}/${name || 'card-' + (i + 1)}.png`;
    await page.locator('.slide').nth(i).screenshot({ path: file });
    console.log('gerado:', file);
  }

  console.log(`\n${total} cards renderizados em ${OUT}/`);
  await browser.close();
})();
