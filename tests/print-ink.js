/* ============================================================
   OMR·문제지·해설지는 종이가 본업이다 — 흰 종이에 흰 글씨가 아니라
   ------------------------------------------------------------
   DT 는 처음부터 인쇄용으로 지어져 있다(`@page` 가 134장에 있다). 그런데
   인쇄 규칙이 **배경까지 챙기지는 않았다.**

       .omrbanner{background:#9a7b27;color:#fff}   OMR 답안지 제목띠
       .omrhead  {background:#26262a;color:#fff}   OMR 표 머리
       .inst     {background:#26262a;color:#fff}   문제지 지시문
       .kind     {background:#26262a;color:#fff}   갈래 배지
       .secband  {background:…;color:#fff}         해설지 절 띠

   브라우저는 인쇄할 때 **배경을 기본으로 안 찍는다** — 잉크를 아끼려고
   그렇게 되어 있고, '배경 그래픽' 을 사람이 따로 켜야 나온다. 그러면
   어두운 배경은 안 찍히고 그 위의 흰 글씨만 남는다. 흰 종이에 흰 글씨다.

     · OMR 답안지 제목띠·표 머리가 안 보인다 — 46장
     · 문제지 지시문이 안 보인다 — 46장 ("다음 물음에 답하시오" 가 통째로)
     · 해설지 절 띠가 안 보인다 — 35장

   화면으로 보면 멀쩡하다. 종이에서만 사라지니 아무도 몰랐다.

   여기서 지키는 것:
   - 인쇄 매체에서 이 자리들이 흰 글씨가 아니다 (종이에서 읽힌다)
   - 화면 매체에서는 **하나도 안 바뀐다** (원래 어두운 띠 그대로)

   실행:
       NODE_PATH=tests/node_modules node tests/print-ink.js
   ============================================================ */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE || 'playwright';
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;
const PORT = Number(process.env.PORT || 8941);
const ROOT = path.join(__dirname, '..');

let fail = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name +
    (ok ? '' : `  → ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`));
  if (!ok) fail++;
};

const isWhite = c => /rgba?\(\s*25[0-5],\s*25[0-5],\s*25[0-5]/.test(String(c || ''));

/* 갈래마다 한 장씩. 한 장만 고쳐 놓고 지나가는 일을 막으려고 이름순 첫 장을 쓴다. */
function pick() {
  const all = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
  const one = pre => all.filter(f => f.startsWith(pre))[0];
  return [
    { file: one('omr_'), sels: ['.omrbanner', '.omrhead'] },
    { file: one('munje_'), sels: ['.inst', '.kind'] },
    { file: one('haeseol_'), sels: ['.secband', '.kind'] },
  ].filter(x => x.file);
}

let chromium;
try { ({ chromium } = require(PLAYWRIGHT)); }
catch (e) {
  if (process.env.REQUIRE_BROWSER) {
    console.log('실패: playwright 를 찾지 못했다 (REQUIRE_BROWSER 가 켜져 있다)');
    process.exit(1);
  }
  console.log('건너뜀: playwright 를 찾지 못했다'); process.exit(0);
}

(async () => {
  const srv = spawn(process.execPath, ['-e', `
    const http=require('http'),fs=require('fs'),p=require('path');
    const T={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css'};
    http.createServer((q,s)=>{
      const f=p.join(${JSON.stringify(ROOT)}, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f,(e,d)=>e?(s.writeHead(404),s.end()):(s.writeHead(200,{'Content-Type':T[p.extname(f)]||'text/plain'}),s.end(d)));
    }).listen(${PORT});
  `], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));

  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const page = await browser.newPage();

  try {
    for (const { file, sels } of pick()) {
      console.log(`\n── ${file} ──`);
      await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'domcontentloaded' });

      const read = s => page.evaluate(sel => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).color : null;
      }, s);

      await page.emulateMedia({ media: 'print' });
      for (const s of sels) {
        const c = await read(s);
        if (c === null) { console.log(`  (없음) ${s}`); continue; }
        chk(`종이: ${s} 가 흰 글씨가 아니다`, isWhite(c), false);
      }

      await page.emulateMedia({ media: 'screen' });
      const c0 = await read(sels[0]);
      if (c0 !== null) chk(`화면: ${sels[0]} 는 그대로 흰 글씨`, isWhite(c0), true);
    }
  } finally {
    await browser.close();
    srv.kill();
  }

  console.log(fail ? `\nFAIL ${fail}건` : '\nPASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
