/* ============================================================
   바깥 글꼴이 학부모 성적표를 인질로 잡지 않는다
   ------------------------------------------------------------
   브라우저는 `<link rel=stylesheet>` 를 만나면 **그리기를 멈추고 기다린다.**
   그 stylesheet 가 바깥(구글 글꼴·jsdelivr 의 Pretendard)에서 오면, 저쪽이
   늦거나 안 닿는 동안 화면은 '글꼴만 못생긴 상태' 가 아니라 **아무것도 없는
   흰 종이**다.

   재어 보니 이랬다(3G · CPU 4배 느리게 · 글꼴 창구가 대답하지 않는 망).
   첫 그림이 **아예 없었다** — 60초를 기다려도.

       report.html          첫 그림 없음   →  624 ms
       parent_report.html   첫 그림 없음   →  328 ms
       index.html           첫 그림 없음   →  2,276 ms

   report.html 은 **학부모가 문자로 받은 링크로 여는 성적표**다. 학원 와이파이·
   회사 망·통신 장애 어느 하나만 걸려도 학부모는 빈 화면을 본다. 글꼴 때문에.

   여기서 지키는 것:
   - 글꼴 창구가 **아예 대답하지 않아도** 화면이 뜬다
   - 글꼴이 오면 **그대로 적용된다** (미룬 것이지 버린 것이 아니다)

   ⚠ 빠르기만 재면 '글꼴을 통째로 빼는 것' 이 만점을 받는다. 그래서 **오는지**
     를 같이 잰다. 둘 중 하나만 보면 검사가 거짓말을 한다.
   ⚠ 첫 그림은 domcontentloaded 뒤에도 한참 있다 생긴다. 곧바로 읽으면 멀쩡한
     화면도 '안 그려짐' 으로 나온다 — 실제로 그렇게 헛다리를 짚었다. 기다렸다
     읽는다.

   실행:  NODE_PATH=tests/node_modules node tests/first-paint.js
   ============================================================ */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE || 'playwright';
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;
const PORT = Number(process.env.PORT || 8942);
const ROOT = path.join(__dirname, '..');
const PAINT_MAX = 4000;      // 대답 없는 망에서도 이 안에 떠야 한다
const SETTLE = 4000;         // 첫 그림이 생길 시간을 준다

let fail = 0;
const chk = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + n +
    (ok ? '' : `  → ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`));
  if (!ok) fail++;
};

let chromium;
try { ({ chromium } = require(PLAYWRIGHT)); }
catch (e) {
  if (process.env.REQUIRE_BROWSER) {
    console.log('실패: playwright 를 찾지 못했다 (REQUIRE_BROWSER 가 켜져 있다)');
    process.exit(1);
  }
  console.log('건너뜀: playwright 를 찾지 못했다'); process.exit(0);
}

/* ⚠ `parent_report.html` 이 여기 있었다. 그 화면은 #69 에서 지웠다(문이 없었다).
     없는 주소는 404 라 첫 그림이 영영 안 뜬다 — 검사가 **제 목록 때문에**
     빨간불이 난다. 위의 표에 남은 이름은 그때 잰 값이라 그대로 둔다. */
const PAGES = ['report.html', 'index.html'];
const FAKE_CSS = ':root{--font-arrived:1}';

const gone = PAGES.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (gone.length) {
  console.log('실패: 이 검사가 **없는 화면**을 재려고 한다 — ' + gone.join(' · '));
  process.exit(1);
}

async function open(browser, answerFonts) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, downloadThroughput: 1.6 * 1024 * 1024 / 8,
    uploadThroughput: 750 * 1024 / 8, latency: 150 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  /* 대답하지 않는 망은 **아무 답도 주지 않는 것**으로 흉내 낸다. 끊어 버리면
     브라우저가 곧바로 포기해서 기다림이 재현되지 않는다. */
  for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net']) {
    await p.route(`**://${host}/**`, route => {
      if (!answerFonts) return;
      return route.fulfill({ status: 200, contentType: 'text/css', body: FAKE_CSS });
    });
  }
  /* 검사가 진짜 시트를 건드리면 안 된다. */
  await p.route('**://script.google.com/**', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: (new URL(route.request().url()).searchParams.get('callback') || 'cb') + '({"ok":true});' }));
  return { ctx, p };
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

  const browser = await chromium.launch(
    Object.assign({ args: ['--no-sandbox'] }, CHROMIUM ? { executablePath: CHROMIUM } : {}));

  try {
    console.log('── 글꼴 창구가 대답하지 않는 망 ──');
    for (const page of PAGES) {
      const { ctx, p } = await open(browser, false);
      await p.goto(`http://localhost:${PORT}/${page}`,
                   { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(SETTLE);
      /* ⚠ **자가 거짓말한 자리.** 여기는 `first-contentful-paint` 하나만 읽고,
         그 값이 없으면 '첫 그림 없음' 이라고 말했다. 그런데 Chrome 은 화면에
         글이 멀쩡히 떠 있어도 그 지표를 **안 적는 때가 있다** — KMChC 의
         index.html 이 그랬다(2026-08-10). 재어 보니

             first-paint = 924ms · masthead 높이 202px · opacity 1

         였다. 그리는데 안 그렸다고 한 것이다. 지표가 없는 것과 화면이 빈 것은
         다른 일이라, **눈에 보이는 글이 있는지**를 같이 본다. 둘 다 없을 때만
         빨간불이다 — 그래야 원래 잡던 것(빈 흰 종이)을 그대로 잡는다. */
      const r = await p.evaluate(() => {
        const paint = performance.getEntriesByType('paint');
        const pick = n => { const e = paint.find(x => x.name === n);
                            return e ? Math.round(e.startTime) : -1; };
        let visible = 0;
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let t;
        while ((t = walk.nextNode())) {
          const s = (t.nodeValue || '').trim();
          if (s.length < 2) continue;
          const el = t.parentElement;
          if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          if (parseFloat(cs.opacity) < 0.1) continue;
          const b = el.getBoundingClientRect();
          if (b.width < 8 || b.height < 8 || b.top > innerHeight || b.bottom < 0) continue;
          if (++visible >= 3) break;
        }
        return { fcp: pick('first-contentful-paint'), fp: pick('first-paint'), visible };
      }).catch(() => ({ fcp: -1, fp: -1, visible: 0 }));
      const byFcp = r.fcp > 0 && r.fcp < PAINT_MAX;
      const byEye = r.visible >= 3 && r.fp > 0 && r.fp < PAINT_MAX;
      console.log(`  ${page} 첫 그림 ${r.fcp < 0 ? '(FCP 없음)' : r.fcp + 'ms'}`
        + ` · 첫 칠 ${r.fp < 0 ? '없음' : r.fp + 'ms'} · 보이는 글 ${r.visible}곳`);
      chk(`${page} 이 글꼴을 기다리지 않는다`, byFcp || byEye, true);
      await ctx.close();
    }

    console.log('\n── 글꼴이 오면 그대로 적용된다 ──');
    {
      const { ctx, p } = await open(browser, true);
      await p.goto(`http://localhost:${PORT}/report.html`,
                   { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      const ok = await p.waitForFunction(() => {
        const L = [...document.querySelectorAll('link[rel=stylesheet]')]
          .filter(l => /fonts\.googleapis\.com|cdn\.jsdelivr\.net/.test(l.href));
        return L.length > 0 && L.every(l => l.media === 'all');
      }, null, { timeout: 20000 }).then(() => true).catch(() => false);
      chk('미룬 글꼴이 도착하면 media 가 돌아온다', ok, true);
      const arrived = await p.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--font-arrived').trim());
      chk('글꼴 CSS 가 실제로 읽혔다', arrived, '1');
      /* 짝이 없으면 자바스크립트가 꺼진 브라우저에서 글꼴이 영영 안 온다. */
      const pair = await p.evaluate(() => {
        const d = [...document.querySelectorAll('link[rel=stylesheet]')]
          .filter(l => /fonts\.googleapis\.com|cdn\.jsdelivr\.net/.test(l.href))
          .map(l => l.getAttribute('href'));
        const ns = [...document.querySelectorAll('noscript')].map(n => n.textContent || '').join(' ');
        return { n: d.length, covered: d.filter(h => ns.includes(h)).length };
      });
      console.log(`  미룬 글꼴 ${pair.n}곳 · noscript 짝 ${pair.covered}곳`);
      chk('미룬 글꼴에는 반드시 noscript 짝이 있다', pair.n > 0 && pair.covered === pair.n, true);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.kill();
  }

  console.log(fail ? `\nFAIL ${fail}건` : '\nPASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
