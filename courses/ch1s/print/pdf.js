/* HTML → PDF (A4, 배경 인쇄). make_print.py 가 부른다: node pdf.js a.html b.html … → 같은 자리에 a.pdf …
   화학1 해설지와 같은 방법(tools/haeseol_pdf.js: format A4 · printBackground). */
'use strict';
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const page = await browser.newPage();
  for (const f of process.argv.slice(2)) {
    await page.goto('file://' + f, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: f.replace(/\.html$/, '.pdf'), format: 'A4', printBackground: true });
  }
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
