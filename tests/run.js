/* ============================================================
   Chemistreal DT 회귀 테스트 스위트 (Playwright)

   실행:  NODE_PATH=<playwright가 설치된 node_modules> node tests/run.js
   또는:  cd tests && npm install && node run.js
   옵션:  CHROMIUM_PATH=<크로뮴 실행파일> (미지정 시 playwright 기본 탐색)

   설계 원칙
   - 정적 서버 내장: 리포지토리 루트를 임시 포트로 서빙 (외부 의존 없음)
   - 구글 Apps Script 호출은 전부 모킹 → 시트에 어떤 기록도 남지 않고,
     네트워크 없이도 항상 같은 결과 (결정적)
   - 각 테스트는 독립 브라우저 컨텍스트에서 실행
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf', svg: 'image/svg+xml' };

function serveStatic() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, p === '/' ? 'home.html' : p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).slice(1)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

/* 네트워크 통제: 로컬 서버만 허용, Apps Script는 모킹, 그 외(CDN 폰트 등)는 차단.
   → 시트에 기록이 남지 않고, 외부 네트워크 지연·유무와 무관하게 항상 같은 결과 */
async function controlNetwork(context) {
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1')) return route.continue();
    if (url.includes('script.google.com')) {
      let body = { ok: true };
      if (url.includes('action=pending')) body = { ok: true, pending: { active: [], stale: [], activeDays: 14, generatedAt: 'TEST' } };
      else if (url.includes('action=absentees')) body = { ok: true, absentees: { classes: [], generatedAt: 'TEST' } };
      else if (url.includes('action=passed')) body = { ok: true, passed: { passed: [], days: 14, generatedAt: 'TEST' } };
      else if (url.includes('action=cohortmis')) body = { ok: true, rows: [] };
      else if (url.includes('student=')) body = { ok: true, student: 'demo', rows: [], excluded: [], cumulative: null, rank: null, cohort: null };
      else if (route.request().method() === 'POST') body = { ok: true, updated: false, reportLink: 'https://example.test/report' };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.abort();   // CDN 폰트 등 외부 요청 차단 (렌더에는 영향 없음)
  });
}

const results = [];
let BROWSER, BASE;

async function test(name, fn, opts) {
  opts = opts || {};
  const ctx = await BROWSER.newContext({
    viewport: opts.viewport || { width: 390, height: 844 },
    permissions: opts.clipboard ? ['clipboard-read', 'clipboard-write'] : [],
  });
  await controlNetwork(ctx);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('dialog', d => d.accept());
  if (opts.adminGate) await page.addInitScript(() => { try { localStorage.setItem('dt_admgate', 'ok'); } catch (e) {} });
  const t0 = Date.now();
  try {
    await fn(page, pageErrors);
    if (pageErrors.length) throw new Error('페이지 JS 에러: ' + pageErrors[0]);
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
    console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    try { await page.screenshot({ path: path.join(__dirname, 'fail-' + name.replace(/[^\w가-힣]+/g, '_') + '.png'), fullPage: true }); } catch (e2) {}
  }
  await ctx.close();
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

/* 공용 검사: 가로 오버플로 0px */
async function assertNoOverflow(page, label) {
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(ovf <= 0, (label || '') + ' 가로 오버플로 ' + ovf + 'px');
}

(async () => {
  const { srv, base } = await serveStatic();
  BASE = base;
  BROWSER = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  console.log('DT 회귀 테스트 · ' + BASE + '\n');

  /* ── 1. 공유 페이지 5종: OG 메타 + 이미지 파일 + 렌더 + 오버플로 ── */
  const SHARED = [
    { page: 'home.html', gate: false },
    { page: 'exam.html?c=ch2&r=3', gate: false },
    { page: 'report.html?student=demo', gate: false },
    { page: 'challenge.html?course=ch2', gate: false },
    { page: 'index.html', gate: true },
  ];
  for (const s of SHARED) {
    await test('OG · ' + s.page.split('?')[0], async page => {
      await page.goto(BASE + s.page); await page.waitForTimeout(700);
      const img = await page.$eval('meta[property="og:image"]', m => m.content);
      const title = await page.$eval('meta[property="og:title"]', m => m.content);
      assert(title && title.length > 3, 'og:title 없음');
      const fname = img.split('/').pop();
      const st = await page.evaluate(u => fetch(u).then(r => r.status), BASE + fname);
      assert(st === 200, 'og 이미지 파일 없음: ' + fname + ' (' + st + ')');
      await assertNoOverflow(page, s.page);
    }, { adminGate: s.gate });
  }

  /* ── 2. 온라인 응시: 회차 로드 ── */
  await test('exam · 회차 렌더', async page => {
    await page.goto(BASE + 'exam.html?c=ch2&r=3'); await page.waitForTimeout(900);
    const h1 = await page.$eval('h1', e => e.textContent);
    assert(/화학2.*3회/.test(h1), '회차 제목 불일치: ' + h1);
  });

  /* ── 3. 채점 흐름: 학생정보 → 회차 → 60문항 → 채점 → 결과 (시트 POST는 모킹) ── */
  await test('index · 채점 전체 흐름', async page => {
    await page.goto(BASE + 'index.html?test=1'); await page.waitForTimeout(900);  // 테스트 모드는 URL로만
    /* 차례가 바뀌었다: 회차 → 학생 → 시험지 → 채점. 수업은 회차 단위로 도는데
       예전에는 학생부터 물어서, 학생마다 회차를 다시 골라야 했다. */
    assert(await page.$('.rchip'), '첫 화면이 회차 선택이 아님');
    assert(!(await page.$('#f_test')), '테스트 모드 체크박스는 제거되어야 함');
    await page.click('.rchip');                        // 첫 회차
    // index.html은 `let S`라 window.S가 없음 → typeof로 접근
    await page.waitForFunction(() => typeof S !== 'undefined' && S.round && S.round.jeongsi && S.round.jeongsi.items, null, { timeout: 8000 });
    assert(await page.$('#f_name'), '회차를 고른 뒤 학생 정보 화면이 아님');
    await page.fill('#f_name', '회귀테스트'); await page.fill('#f_school', '테스트중'); await page.fill('#f_grade', '2');
    // 학생 화면의 단추는 [회차로][이 학생 채점 시작] — 마지막 것이 진행
    await page.click('.btnrow button:last-child'); await page.waitForTimeout(600);
    // 시험 출제·응시 화면 → 'OMR 채점' 버튼(뒤로/OMR 채점 중 마지막)
    await page.click('.btnrow button:last-child'); await page.waitForTimeout(400);
    assert(await page.$('#entry'), '채점 입력 화면이 아님');
    await page.evaluate(() => { S.answers = S.answers.map(() => 'O'); render(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => doGrade());
    await page.waitForFunction(() => typeof S !== 'undefined' && !!S.graded, null, { timeout: 10000 });
    const graded = await page.evaluate(() => S.graded && typeof S.graded.score === 'number');
    assert(graded, '채점 결과(S.graded.score) 없음');
  }, { adminGate: true });

  /* 못 물어봤을 때 하는 말이 선생님이 할 수 있는 일이어야 한다. 예전에는
     "Apps Script 배포(/exec)와 권한을 확인하세요" 였다 — 맞는 말이지만
     그 자리에서 할 수 있는 일이 아니고, 다시 누를 자리도 없었다. */
  await test('pending · 못 물어봤으면 다시 물을 자리를 준다', async page => {
    let dead = true, asked = 0;
    await page.route('**/macros/s/**', route => {
      asked++;
      if (dead) return route.abort();
      const cb = new URL(route.request().url()).searchParams.get('callback') || '';
      const j = JSON.stringify({ ok: true, pending: [], absentees: [], passed: [] });
      return route.fulfill({ status: 200,
        contentType: cb ? 'application/javascript' : 'application/json',
        body: cb ? cb + '(' + j + ');' : j });
    });
    await page.goto(BASE + 'pending.html');
    await page.waitForTimeout(5000);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(/못 물어보지|물어보지 못한|불러오지 못했습니다/.test(txt), '못 불러왔다는 말이 없다');
    assert(await page.evaluate(() => !!document.getElementById('pendRetry')),
           '다시 불러오는 자리가 없다');
    const before = asked;
    dead = false;
    await page.click('#pendRetry');
    await page.waitForTimeout(2500);
    assert(asked > before, '다시 눌러도 안 물어본다');
    assert(await page.evaluate(() => !document.getElementById('pendRetry')),
           '성공했는데 실패 안내가 남아 있다');
  }, { adminGate: true });

  /* ── 4. 미응시 현황: 문자 복사 3종 + 시점 표현 금지 + 미응시 안내 ── */
  await test('pending · 문자 복사와 문구 규칙', async page => {
    await page.goto(BASE + 'pending.html?demo'); await page.waitForTimeout(500);
    for (const [sel, must] of [['.copybtn.s1', '재시 안내'], ['.copybtn.s2', '리마인드'], ['.copybtn.s3', '최종 안내']]) {
      await page.click(sel); await page.waitForTimeout(250);
      const msg = await page.evaluate(() => navigator.clipboard.readText());
      assert(msg.includes('조준모'), sel + ' 복사 실패');
      assert(msg.includes(must), sel + ' 문구 누락: ' + must);
      assert(!/오늘|내일|전날/.test(msg), sel + ' 발송일 가정 표현 잔존');
    }
    await page.click('.copybtn.abc'); await page.waitForTimeout(250);   // 반 전체 공지
    const bc = await page.evaluate(() => navigator.clipboard.readText());
    assert(bc.includes('exam.html?c='), '반 공지에 응시 링크 없음');
  }, { clipboard: true });

  /* ── 4-2. 통과한 학생에게 보내는 문자 ──────────────────────────────
     여태 이 페이지에서 복사할 수 있는 것은 전부 독촉이었다 — 재시 안내,
     시험 안내, 리마인드, 최종 안내. 통과한 학생에게는 아무것도 가지 않았다.

     한 번에 통과한 것과 재시로 마무리한 것은 다른 이야기다. 재시로 통과한
     학생에게 "한 번에 넘겼다" 고 쓰면 안 읽어 본 티가 난다. */
  await test('pending · 통과 문자 복사', async page => {
    await page.goto(BASE + 'pending.html?demo'); await page.waitForTimeout(500);
    const n = await page.$$eval('.copybtn.pass', b => b.length);
    assert(n >= 2, '통과 문자 버튼이 없다: ' + n);

    // 첫 줄 = 한 번에 통과(정시), 둘째 줄 = 재시로 통과
    await page.click('.copybtn.pass'); await page.waitForTimeout(250);
    const one = await page.evaluate(() => navigator.clipboard.readText());
    assert(one.includes('조준모'), '통과 문자 복사 실패');
    assert(one.includes('통과 안내'), '제목에 통과 안내 없음');
    assert(one.includes('한 번에'), '정시 통과인데 문구가 다르다');
    assert(!/재시로|다시 잡아/.test(one), '정시 통과에 재시 문구가 섞였다');
    // 독촉 문구가 섞이면 축하 문자가 아니다
    assert(!/미통과|아직 확인되지|안내드립니다\n/.test(one), '통과 문자에 독촉 문구 잔존');
    assert(!/오늘|내일|전날/.test(one), '발송일 가정 표현 잔존');

    await page.click('.copybtn.pass >> nth=1'); await page.waitForTimeout(250);
    const two = await page.evaluate(() => navigator.clipboard.readText());
    assert(/재시/.test(two), '재시 통과인데 재시 문구가 없다');
    assert(!two.includes('한 번에'), '재시 통과에 "한 번에" 가 들어갔다');
    assert(two !== one, '두 문자가 똑같다');

    // 리포트 링크가 있어야 학부모가 결과를 열어 본다
    assert(/report\.html\?student=/.test(one), '통과 문자에 리포트 링크 없음');
  }, { clipboard: true });

  /* ── 4-3. 복사 폴백(clipboard API 가 없는 브라우저) ────────────────
     execCommand('copy') 가 false 를 돌려주면 복사된 것이 아니다 — 「복사됨 ✓」 이라
     하지 않고 창(prompt)에 문자를 띄운다. 임시 textarea 는 execCommand 가 던져도
     지운다(안 지우면 보이지 않는 칸이 body 에 쌓인다). */
  await test('pending · 복사 폴백은 실패를 «복사됨» 이라 하지 않고 textarea 를 남기지 않는다', async page => {
    await page.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (e) {} });
    await page.goto(BASE + 'pending.html?demo'); await page.waitForTimeout(500);
    assert(await page.evaluate(() => !navigator.clipboard), 'clipboard API 를 못 없앴다 — 폴백이 아니라 API 경로를 재고 있다');
    const before = await page.$$eval('textarea', t => t.length);
    for (const mode of ['false', 'throw']) {
      const r = await page.evaluate(m => {
        window.__prompts = 0; window.prompt = function () { window.__prompts++; return null; };
        document.execCommand = function () { if (m === 'throw') throw new Error('copy blocked'); return false; };
        const btn = document.querySelector('.copybtn.s1'); btn.click();
        return { label: btn.textContent, copied: btn.classList.contains('copied'), prompts: window.__prompts, tas: document.querySelectorAll('textarea').length };
      }, mode);
      assert(r.tas === before, mode + ': 임시 textarea 가 ' + (r.tas - before) + '개 남았다');
      assert(!/복사됨/.test(r.label) && !r.copied, mode + ': 복사 안 됐는데 «복사됨» 이라 한다: ' + r.label);
      assert(r.prompts === 1, mode + ': 창을 ' + r.prompts + '번 띄웠다(1번이어야 한다)');
    }
    /* 반대로 execCommand 가 true 면 «복사됨» — 폴백이 성공을 실패로 읽지도 않는다 */
    const okr = await page.evaluate(() => {
      window.__prompts = 0; document.execCommand = function () { return true; };
      const btn = document.querySelector('.copybtn.s2'); btn.click();
      return { label: btn.textContent, prompts: window.__prompts, tas: document.querySelectorAll('textarea').length };
    });
    assert(/복사됨/.test(okr.label) && okr.prompts === 0 && okr.tas === before, '복사가 됐는데 «복사됨» 이 아니거나 창을 띄웠다: ' + JSON.stringify(okr));
  });

  /* ── 5. 미응시 현황: 안내 완료 숨김 → 새로고침 유지 → 복원 ── */
  await test('pending · 숨김/복원 흐름', async page => {
    const url = BASE + 'pending.html?demo';
    await page.goto(url); await page.waitForTimeout(500);
    const before = await page.$$eval('.row', r => r.length);
    await page.click('.row .hidebtn'); await page.waitForTimeout(250);
    assert(await page.$$eval('.row', r => r.length) === before - 1, '숨김 후 행 수 불일치');
    await page.goto(url); await page.waitForTimeout(500);               // 새로고침 유지
    assert(await page.$$eval('.row', r => r.length) === before - 1, '새로고침 후 숨김 미유지');
    await page.click('.hidwrap summary');
    await page.click('.hidwrap .unhidebtn'); await page.waitForTimeout(250);
    assert(await page.$$eval('.row', r => r.length) === before, '복원 후 행 수 불일치');
  });

  /* ── 5-2. 「같은 사람으로 처리해 줘」 ────────────────────────────────
     합치는 함수는 오래전부터 있었지만 **스크립트 편집기에서만** 부를 수 있었다.
     걸지 않은 자는 없는 자와 같다 — 화면에 문이 났는지, 그 문이 무엇을 합칠지
     **먼저 보여 주는지**, 그리고 눌렀을 때 정말 창구를 부르는지 본다. */
  await test('pending · 갈라진 같은 학생을 화면에서 합친다', async page => {
    await page.goto(BASE + 'pending.html?demo'); await page.waitForTimeout(500);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(/같은 사람 합치기/.test(txt), '합치는 자리가 없다');
    /* 무엇을 합칠지 눌러 보기 전에 다 적혀 있어야 한다 — 학생키와 이미 보낸
       리포트 주소가 걸린 일이라, 누른 뒤에 알게 되면 늦다. */
    assert(/서울두레중-이몽룡/.test(txt) && /두레중-이몽룡/.test(txt), '무엇을 합칠지 안 적었다');
    assert(/두레중학교/.test(txt), '표기 정리 대상을 안 적었다');
    assert(/동명이인/.test(txt), '동명이인 주의를 안 적었다');
    const btn = await page.$('#mgGo');
    assert(btn, '합치는 버튼이 없다');
    const box = await btn.boundingBox();
    assert(box.height >= 32, '버튼이 손가락보다 작다: ' + box.height);

    /* 눌렀을 때 정말 창구를 부르는가. 부른 자와 도는 자는 다르다. */
    let posted = null;
    await page.route('**/macros/s/**', route => {
      const r = route.request();
      if (r.method() === 'POST') { try { posted = JSON.parse(r.postData() || '{}'); } catch (e) { posted = {}; } }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.click('#mgGo'); await page.waitForTimeout(600);
    assert(posted && posted.action === 'merge', '눌러도 합치라고 안 한다: ' + JSON.stringify(posted));
    await assertNoOverflow(page, 'pending-merge');
  });

  /* 합칠 것이 없을 때 «없다» 고 말하고, 못 물어봤을 때는 «없다» 고 하지 않는다.
     이 둘을 같은 말로 적으면 화면이 거짓말을 한다. */
  await test('pending · 못 물어본 것과 없는 것을 다르게 말한다', async page => {
    await page.route('**/macros/s/**', route => {
      const u = route.request().url();
      const cb = new URL(u).searchParams.get('callback') || '';
      if (u.includes('action=mergeplan')) return route.abort();      // 이것만 못 물어본다
      let body = { ok: true, pending: { active: [], stale: [], activeDays: 14, generatedAt: 'T' } };
      if (u.includes('action=absentees')) body = { ok: true, absentees: { classes: [], generatedAt: 'T' } };
      if (u.includes('action=passed')) body = { ok: true, passed: { passed: [], generatedAt: 'T' } };
      const j = JSON.stringify(body);
      return route.fulfill({ status: 200,
        contentType: cb ? 'application/javascript' : 'application/json',
        body: cb ? cb + '(' + j + ');' : j });
    });
    await page.goto(BASE + 'pending.html'); await page.waitForTimeout(5000);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(/같은 사람 합치기/.test(txt), '합치는 자리가 없다');
    assert(/물어보지 못했습니다/.test(txt), '못 물어봤다고 안 한다');
    assert(!/갈라져 저장된 학생은 없습니다/.test(txt), '못 물어봤는데 «없다» 고 한다');
  }, { adminGate: true });

  /* ── 5-3. 심화가 안 배운 범위를 내지 않는다 ──────────────────────────
     선생님: "심화문제 나올때 아직 안배운 범위가 나오거나 한 부분이 있는지
     확인하고 안배운문제를 내지 않도록 해줘" (2026-08-15)

     재어 보니 있었다. 이 화면은 **과목 접두만** 보고 뽑아서, 화학Ⅰ 1회를 막
     통과한 학생에게 후보 54개념 중 44개(81%)가 18회까지 가야 배우는 것이었다.
     여기서는 화면에 실제로 뜬 문항 하나하나를 회차 표와 대 본다. */
  await test('challenge · 배운 회차 밖 문항이 안 나온다', async page => {
    await page.goto(BASE + 'challenge.html?course=ch2&round=3'); await page.waitForTimeout(400);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(/3회까지 배운 범위/.test(txt), '어디까지 내는지 화면이 말하지 않는다');
    await page.click('.btn'); await page.waitForTimeout(300);
    /* 여러 번 뽑아도 한 번도 새면 안 된다 — 무작위라 한 판만 보면 놓친다. */
    const bad = await page.evaluate(() => {
      const out = [];
      for (let t = 0; t < 40; t++) {
        start();
        S.qs.forEach(q => {
          if (!/^CH2-/.test(q.c)) return;            // 선수 과목(CH1)은 다 배운 것
          const first = CHALLENGE_ROUND[q.c];
          if (first == null || first > 3) out.push(q.c + '(' + first + '회)');
        });
      }
      return Array.from(new Set(out));
    });
    assert(bad.length === 0, '3회 학생에게 안 배운 개념이 나왔다: ' + bad.slice(0, 8).join(' '));

    /* 자가 눈먼 것이 아닌지 본다 — 문 없이 뽑으면 정말 새는지. */
    const leaks = await page.evaluate(() => {
      const out = [];
      Object.keys(CHALLENGE_BANK).forEach(p => CHALLENGE_BANK[p].forEach(c => {
        if (/^CH2-/.test(c.c) && CHALLENGE_ROUND[c.c] > 3) out.push(c.c);
      }));
      return out;
    });
    assert(leaks.length > 0, '3회 밖 개념이 아예 없으면 이 검사는 아무것도 안 막는다');
  });

  /* 선수 과목은 막지 않는다. 일반화학 학생은 화학Ⅰ·Ⅱ 를 이미 마쳤으므로
     그 개념은 회차와 무관하게 낸다 — 여기까지 막으면 심화가 텅 빈다.
     ⚠ 회차 표를 만드는 자가 과목을 안 보고 세면 이 경계가 무너진다.
       일반화학 회차 파일에 실린 CH1 개념이 «화학Ⅰ 1회» 가 되어, 화학Ⅰ 1회
       학생에게 4회 개념이 나갔다(2026-08-15, 스스로 검토하다 잡음). */
  await test('challenge · 선수 과목은 회차로 막지 않는다', async page => {
    await page.goto(BASE + 'challenge.html?course=gc&round=1'); await page.waitForTimeout(400);
    const got = await page.evaluate(() => {
      const p = poolFor('gc', 1);
      return { pre: p.filter(q => !/^GC-/.test(q.c)).length,
               own: p.filter(q => /^GC-/.test(q.c)).length,
               late: p.filter(q => /^GC-/.test(q.c) && CHALLENGE_ROUND[q.c] > 1).length };
    });
    assert(got.pre > 0, '선수 과목 개념이 하나도 안 나온다');
    assert(got.own > 0, '일반화학 1회 개념이 하나도 안 나온다');
    assert(got.late === 0, '일반화학인데 안 배운 회차가 샜다: ' + got.late);
  });

  /* 배운 것이 12개가 안 되면 **모자란 채로** 낸다. 채우려고 안 배운 것을
     끌어오면 그것이 바로 고치려던 병이다. 그리고 몇 개인지 말한다.

     화학Ⅰ 1회가 실제로 10개였다(12개가 아니다). 처음엔 12로 보였는데, 그건
     회차 표를 만드는 자가 **과목을 안 보고** 세었기 때문이었다 — 일반화학
     회차 파일에 실린 CH1 개념을 «화학Ⅰ 1회» 로 오인했다. 스스로 검토하다
     잡았다. 그래서 여기서는 실데이터로 한 번, 표를 좁혀 한 번 본다.
     (2026-09-11 은행을 회차 파일의 lvl3 문항으로 다시 만든 뒤에는 2개다 —
      1회 정시에 3단계 문항이 둘뿐이라서. 규칙은 그대로, 수만 다시 쟀다.) */
  await test('challenge · 모자라면 모자란 대로 내고 그렇다고 말한다', async page => {
    await page.goto(BASE + 'challenge.html?course=ch1&round=1'); await page.waitForTimeout(400);
    /* 엮기 문장(CHALLENGE_LINK)이 들어오면 그것도 낼 수 있는 문항이다(2026-09-28 반반). */
    const real = await page.evaluate(() => poolFor('ch1', 1)
      .filter((q, i, a) => a.findIndex(x => x.c === q.c) === i).length + linkPoolFor('ch1', 1).length);
    assert(real > 0 && real < 12, '화학Ⅰ 1회가 12개 미만이 아니다 — 표를 다시 보라 (' + real + ')');
    const t0 = await page.evaluate(() => document.body.innerText);
    assert(t0.includes('심화 문항 ' + real + '개'), '실데이터에서 수를 사실대로 안 적었다: ' + real);

    const n = await page.evaluate(() => {
      /* 표를 다섯 개념으로 좁힌다 — 그 다섯은 1회에 배운 것으로, 나머지는 아직
         안 배운 것(99회)으로 둔다. 옛 은행에서는 앞 다섯이 마침 다 1회라 그냥
         잘랐는데, 은행을 회차 파일에서 만들자 앞 다섯의 회차가 섞였다(2026-09-11).
         재는 규칙은 그대로다: 표를 좁히면 후보가 그만큼 줄고 화면이 그 수를 말한다. */
      CHALLENGE_LINK.length = 0;                     // 개념 수만 재려고 엮기 문장은 뺀다
      const keep = Object.keys(CHALLENGE_ROUND).filter(k => /^CH1-/.test(k) && CHALLENGE_BANK.CH1.some(c => c.c === k)).slice(0, 5);
      Object.keys(CHALLENGE_ROUND).forEach(k => { CHALLENGE_ROUND[k] = keep.includes(k) ? 1 : 99; });
      render();
      return poolFor('ch1', 1).filter((q, i, a) => a.findIndex(x => x.c === q.c) === i).length;
    });
    assert(n === 5, '좁혔는데도 개념 수가 안 줄었다: ' + n);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(txt.includes('심화 문항 ' + n + '개'), '문항 수를 사실대로 안 적었다: ' + n);
    assert(/개라 .*문항입니다/.test(txt), '왜 적은지 말하지 않는다');
    await page.click('.btn'); await page.waitForTimeout(300);
    const got = await page.evaluate(() => S.qs.length);
    assert(got === n, '적어 놓은 수와 실제 문항 수가 다르다: ' + got + ' vs ' + n);
    const head = await page.evaluate(() => document.querySelector('h2').textContent);
    assert(head.includes(n + '문항'), '제목은 아직 12문항이라고 한다: ' + head);

    /* 하나도 없으면 «없다» 고 말하고 시작 버튼을 안 준다. */
    const none = await page.evaluate(() => {
      S.view = 'intro';
      Object.keys(CHALLENGE_ROUND).forEach(k => { CHALLENGE_ROUND[k] = 99; });
      render();
      return { txt: document.body.innerText, btn: !!document.querySelector('.btn') };
    });
    assert(/낼 만한 개념이 없습니다/.test(none.txt), '없는데 없다고 안 한다');
    assert(!none.btn, '낼 것이 없는데 시작 버튼이 있다');
  });

  /* 이미 학생들에게 나간 옛 링크에는 회차가 없다. 그때 «다 배웠다» 고 치면
     고친 것이 도로 풀린다 — 지어내지 말고 묻는다. */
  await test('challenge · 회차를 모르면 지어내지 않고 묻는다', async page => {
    await page.goto(BASE + 'challenge.html?course=ch2'); await page.waitForTimeout(400);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(/어디까지 배웠나요/.test(txt), '회차를 안 묻는다');
    assert(!/도전 시작/.test(txt), '회차도 모르는데 바로 풀린다');
    const n = await page.$$eval('.rpick', b => b.length);
    assert(n === 18, '화학Ⅱ 회차 수가 18이 아니다: ' + n);
    const h = await page.$eval('.rpick', b => b.getBoundingClientRect().height);
    assert(h >= 32, '회차 버튼이 손가락보다 작다: ' + h);
    await page.click('.rpick:nth-child(3)'); await page.waitForTimeout(500);
    assert(/round=3/.test(page.url()), '눌러도 회차가 안 붙는다: ' + page.url());
    assert(/3회까지 배운 범위/.test(await page.evaluate(() => document.body.innerText)),
           '고른 회차가 화면에 안 반영된다');
    await assertNoOverflow(page, 'challenge-pick');
  });

  /* 주소는 사람이 고친다. 이상한 값이 와도 **화면이 거짓말하면 안 된다.**
     세 가지가 실제로 그랬다(2026-08-16 에 훑다 잡음):
       · course 가 엉터리면 화학Ⅰ 회차를 보여 줬고, 눌러도 과목이 그대로라
         같은 화면이 다시 떴다 — 무한 반복
       · round=999 면 「999회까지 배운 범위」 라고 적었다 — 그런 회차는 없다
       · round 가 0·음수·글자면 그냥 회차를 물었다(이건 맞다) */
  await test('challenge · 이상한 주소에도 거짓말하지 않는다', async page => {
    const look = async u => {
      await page.goto(BASE + u); await page.waitForTimeout(300);
      return page.evaluate(() => {
        const t = document.body.innerText;
        return { course: /어느 과목인가요/.test(t), round: /어디까지 배웠나요/.test(t),
                 start: !!document.querySelector('.btn'),
                 scope: (t.match(/(\d+)회까지 배운 범위/) || [])[1] || null };
      });
    };
    let r = await look('challenge.html?course=xyz&round=3');
    assert(r.course && !r.start, '모르는 과목인데 문제를 낸다');
    r = await look('challenge.html');
    assert(r.course, '과목도 회차도 없는데 안 묻는다');
    /* 과목을 고르면 회차를 묻는 자리로 넘어가야 한다(같은 화면이 다시 뜨면 안 된다). */
    await page.click('.rpick'); await page.waitForTimeout(400);
    const t2 = await page.evaluate(() => document.body.innerText);
    assert(/어디까지 배웠나요/.test(t2), '과목을 골라도 같은 화면이 다시 뜬다');
    assert(/course=/.test(page.url()), '고른 과목이 주소에 안 붙는다: ' + page.url());

    r = await look('challenge.html?course=ch2&round=999');
    assert(r.scope === '18', '없는 회차를 있다고 적는다: ' + r.scope);
    r = await look('challenge.html?course=gc&round=999');
    assert(r.scope === '10', '과목마다 마지막 회차가 다른데 안 본다: ' + r.scope);
    for (const bad of ['0', '-5', 'abc', '']) {
      r = await look('challenge.html?course=ch2&round=' + bad);
      assert(r.round && !r.start, 'round=' + bad + ' 인데 그냥 문제를 낸다');
    }
    /* 대문자로 와도 같은 과목이다. */
    r = await look('challenge.html?course=CH2&round=3');
    assert(r.scope === '3' && r.start, '대문자 과목을 못 알아본다');
  });

  /* 성적표·응시 화면이 회차를 안 넘기면 위 문이 아무 소용이 없다. */
  await test('challenge · 부르는 쪽이 회차를 같이 넘긴다', async page => {
    for (const f of ['report.html', 'index.html']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const m = src.match(/challenge\.html\?course=\$\{[^}]+\}([^"']*)/);
      assert(m, f + ' 에 심화 링크가 없다');
      assert(/round=/.test(m[1]), f + ' 이 회차를 안 넘긴다: ' + m[0]);
    }
  });

  /* 푼 결과는 어디에도 안 남는다(저장할지는 선생님이 정할 일). 학생이 한 줄로
     들고 갈 수 있게 「결과 복사」 를 둔다 — 이름 없이, 화면의 수와 같은 수로.
     문구는 pending.html 의 복사 단추와 같은 길로 클립보드에 간다. */
  await test('challenge · 결과 화면에 「결과 복사」 가 있고 누르면 평문이 된다', async page => {
    await page.goto(BASE + 'challenge.html?course=ch2&round=5'); await page.waitForTimeout(400);
    await page.click('.btn'); await page.waitForTimeout(300);
    const want = await page.evaluate(() => {
      /* 앞의 셋은 틀리고 나머지는 맞힌다 — 어느 개념이 «다시 볼 개념» 인지 알고 재려고. */
      S.qs.forEach((q, i) => { S.ans[i] = i < 3 ? (q.a === 'O' ? 'X' : 'O') : q.a; });
      submit();
      const wrong = []; S.qs.slice(0, 3).forEach(q => [q.m].concat(q.kind === 'link' && q.m2 && q.m2 !== q.m ? [q.m2] : [])
        .forEach(m => { if (!wrong.includes(m)) wrong.push(m); }));   // 엮기 문장은 두 개념 다
      return { n: S.qs.length, wrong, text: document.body.innerText };
    });
    assert(want.n === 12, '화학Ⅱ 5회인데 12문항이 아니다: ' + want.n);
    assert(/결과 복사/.test(want.text), '결과 화면에 복사 단추가 없다');
    assert(want.text.includes((want.n - 3) + ' / ' + want.n), '점수가 화면에 없다');
    await page.click('.copybtn'); await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const exp = '심화 도전 · 화학Ⅱ 5회 범위 · ' + want.n + '문항 중 ' + (want.n - 3) + ' 맞음 · 다시 볼 개념: ' + want.wrong.join(', ');
    assert(clip === exp, '복사된 문구가 화면과 다르다:\n  ' + clip + '\n  ' + exp);
    assert(!/\n/.test(clip), '한 줄이어야 한다');
    const label = await page.$eval('.copybtn', b => b.textContent);
    assert(/복사됨/.test(label), '눌렀는데 복사됐다고 안 한다: ' + label);
    /* 다 맞으면 «다시 볼 개념: 없음» — 빈 칸을 남기지 않는다. */
    const all = await page.evaluate(() => { S.qs.forEach((q, i) => { S.ans[i] = q.a; }); submit(); return resultText(); });
    assert(/12문항 중 12 맞음 · 다시 볼 개념: 없음$/.test(all), '다 맞았을 때 문구가 틀리다: ' + all);
  }, { clipboard: true });

  /* 「복습하면 좋을 개념」 칩은 이름뿐이었다. 성적표가 쓰는 표(concept-lecture-dt.json
     의 map[mis] → lectures[n].file)로 같은 강의를 건다. 표에 없는 개념은 이름만 —
     없는 강의를 지어내지 않는다. 표가 안 와도(망) 화면은 그대로다. */
  await test('challenge · 복습 칩이 개념 강의로 이어진다 (표에 있는 것만)', async page => {
    const lec = JSON.parse(fs.readFileSync(path.join(ROOT, 'concept-lecture-dt.json'), 'utf8'));
    await page.goto(BASE + 'challenge.html?course=gc&round=10'); await page.waitForTimeout(400);
    await page.click('.btn'); await page.waitForTimeout(300);
    const got = await page.evaluate(map => {
      /* 표에 있는 개념 하나 + 없는 개념 하나를 골라 둘 다 틀린다. */
      const pool = poolFor('gc', 10);
      const on = pool.find(q => map[q.m]), off = pool.find(q => !map[q.m]);
      if (!on || !off) return { miss: !on ? 'mapped' : 'unmapped' };
      S.qs = [on, off]; S.ans = S.qs.map(q => q.a === 'O' ? 'X' : 'O'); submit();
      return { on: on.m, off: off.m };
    }, lec.map);
    assert(!got.miss, '일반화학 10회 후보에 ' + got.miss + ' 개념이 없다 — 검사 전제를 다시 보라');
    await page.waitForFunction(() => window.LEC, null, { timeout: 5000 });
    await page.evaluate(() => render());
    const chips = await page.$$eval('.mchips .mchip', els => els.map(e => ({
      tag: e.tagName, text: e.textContent, href: e.getAttribute('href'), target: e.getAttribute('target') })));
    assert(chips.length === 2, '칩이 둘이 아니다: ' + chips.length);
    const a = chips.find(c => c.text.startsWith(got.on)), b = chips.find(c => c.text.startsWith(got.off));
    assert(a && a.tag === 'A' && a.target === '_blank', '표에 있는 개념인데 링크가 아니다: ' + JSON.stringify(a));
    const file = lec.lectures[lec.map[got.on]].file;
    /* 절이 적힌 개념이면 성적표와 같은 꼬리(#sNN / #q)까지 같아야 한다. 없으면 꼬리도 없다. */
    const sec = (lec.sec || {})[got.on] || '';
    const tail = sec === 'q' ? '#q' : (sec ? '#s' + sec : '');
    /* 강의 쪽 띠(«DT 일반화학 10회에서 틀린 개념입니다»)를 위해 ?from=dt&c=과목&r=회차 가 #절 앞에 온다. */
    assert(a.href === 'https://chemistreal.github.io/exam/' + file + '?from=dt&c=gc&r=10' + tail, '강의 주소가 성적표 규칙과 다르다: ' + a.href);
    assert(b && b.tag === 'SPAN' && !b.href, '표에 없는 개념인데 링크를 지어냈다: ' + JSON.stringify(b));
    const txt = await page.evaluate(() => document.body.innerText);
    assert(/누르면 개념 강의/.test(txt), '링크가 있는데 누르라는 말이 없다');
  });

  await test('challenge · 강의 표가 안 와도 결과 화면은 그대로다', async page => {
    await page.route('**/concept-lecture-dt.json', r => r.abort());
    await page.goto(BASE + 'challenge.html?course=ch1&round=18'); await page.waitForTimeout(400);
    await page.click('.btn'); await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      S.ans = S.qs.map(q => q.a === 'O' ? 'X' : 'O'); submit();
      const names = []; S.qs.forEach(q => [q.m].concat(q.kind === 'link' && q.m2 && q.m2 !== q.m ? [q.m2] : [])
        .forEach(m => { if (!names.includes(m)) names.push(m); }));   // 칩은 개념 이름마다 하나(엮기 문장은 두 개념)
      return { lec: !!window.LEC, want: names.length, chips: document.querySelectorAll('.mchips .mchip').length,
               links: document.querySelectorAll('.mchips a').length, copy: !!document.querySelector('.copybtn') };
    });
    assert(!r.lec && r.chips === r.want && r.chips > 0 && r.links === 0 && r.copy,
           '표 없이도 이름 칩·복사 단추가 그대로여야 한다: ' + JSON.stringify(r));
  });

  /* ── 강의 링크가 강의 머리가 아니라 **절**까지 간다 (2026-09-11) ─────────
     강의 한 편은 대여섯 절이다. concept-lecture-dt.json 의 sec 표가 절을 알면
     (집필자가 why 에 「lec-060 본문 03절이 …」라고 적어 둔 것) --emit 이 주소 뒤에
     #sNN(본문 절) / #q(확인 문제) 를 붙인다. 여기서 못 박는 것:
     · 표본 하나 — 성적표의 lecFor 가 그 개념을 '…html#sNN' 으로 낸다
     · 전수 — LECMAP·LECUNIT 의 꼬리가 표의 sec 와 **정확히** 같다(있으면 붙고,
       없으면 안 붙는다 — 없는 절을 지어내지 않는다). anchor 가 exam 쪽 파일에
       실제로 있는지는 lec_link.py --check 가 디스크에서 본다. */
  await test('성적표 강의 링크가 절 anchor 를 갖는다(한 개념 표본)', async () => {
    const lec = JSON.parse(fs.readFileSync(path.join(ROOT, 'concept-lecture-dt.json'), 'utf8'));
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const constOf = (name) => {
      const m = src.match(new RegExp('\\nconst ' + name + '=(\\{[^\\n]*\\});\\n'));
      assert(m, name + ' 상수를 못 찾았다');
      return JSON.parse(m[1]);
    };
    const LECMAP = constOf('LECMAP'), LECUNIT = constOf('LECUNIT');
    const at = src.indexOf('function lecFor(');
    assert(at > 0, 'lecFor 를 못 찾았다');
    const lecFor = new Function('LECMAP', 'LECUNIT', src.slice(at, src.indexOf('\n}\n', at) + 3) + '\nreturn lecFor;')(LECMAP, LECUNIT);
    const sec = lec.sec || {};
    const tail = k => sec[k] ? (sec[k] === 'q' ? '#q' : '#s' + sec[k]) : '';
    /* (1) 표본: 본문 절이 적힌 map 개념 하나 */
    const mis = Object.keys(sec).find(k => k.indexOf('|') < 0 && lec.map[k] && /^\d\d$/.test(sec[k]));
    assert(mis, '본문 절이 적힌 개념이 하나도 없다');
    const want = lec.base + lec.lectures[lec.map[mis]].file + '#s' + sec[mis];
    assert(lecFor(mis, '', '') === want, mis + ' 의 주소가 절까지 안 간다: ' + lecFor(mis, '', '') + ' (기대 ' + want + ')');
    /* (2) 확인 문제만 근거인 개념은 #q */
    const qm = Object.keys(sec).find(k => k.indexOf('|') < 0 && lec.map[k] && sec[k] === 'q');
    if (qm) assert(/\.html#q$/.test(lecFor(qm, '', '')), qm + ' 이 확인 문제로 안 간다: ' + lecFor(qm, '', ''));
    /* (3) 절이 없는 개념은 꼬리 없이 강의 머리로 */
    const plain = Object.keys(lec.map).find(k => !sec[k]);
    assert(plain && lecFor(plain, '', '').indexOf('#') < 0, '절이 없는 개념에 꼬리를 지어냈다: ' + plain + ' → ' + lecFor(plain, '', ''));
    /* (4) 전수: 두 상수의 꼬리가 표와 같다 */
    let n = 0;
    [LECMAP, LECUNIT].forEach(T => Object.keys(T).forEach(k => {
      const h = T[k], i = h.indexOf('#'), got = i < 0 ? '' : h.slice(i);
      assert(got === tail(k), k + ' 의 꼬리가 표와 다르다: ' + got + ' vs ' + tail(k));
      if (got) n++;
    }));
    assert(n === Object.keys(sec).length, '절 anchor 붙은 주소 수가 표와 다르다: ' + n + ' vs ' + Object.keys(sec).length);
  });

  /* ── 강의 문이 ?from=dt 를 달고, 일부만 맞는 자리는 회색 한 줄을 단다 (2026-09-28) ──
     · exam 의 강의는 ?from=dt&c=<과목>&r=<회차> 로 열리면 «DT 화학Ⅰ 12회에서 틀린 개념입니다» 띠를
       띄운다. 그 꼬리는 **#절 앞**에 와야 한다(뒤에 오면 절 이름의 일부가 된다). LECMAP 은 그대로다.
     · 과목·회차를 모르면 ?from=dt 만 — 없는 회차를 지어내지 않는다.
     · LECNOTE(부분 적합 한 줄)는 강의 문 아래 한 줄로 「§03 참고 · …」/「확인 문제 참고 · …」.
       글은 이스케이프한다. note 가 없는 자리엔 줄을 만들지 않는다. */
  await test('성적표 강의 문 · ?from=dt 꼬리와 부분 적합 한 줄', async () => {
    const lec = JSON.parse(fs.readFileSync(path.join(ROOT, 'concept-lecture-dt.json'), 'utf8'));
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const constOf = (name) => JSON.parse(src.match(new RegExp('\\nconst ' + name + '=(\\{[^\\n]*\\});\\n'))[1]);
    const LECMAP = constOf('LECMAP'), LECUNIT = constOf('LECUNIT'), LECNOTE = constOf('LECNOTE');
    const fnSrc = name => { const at = src.indexOf('function ' + name + '('); assert(at > 0, name + ' 를 못 찾았다');
      return src.slice(at, src.indexOf('\n}\n', at) + 3); };
    const api = new Function('LECMAP', 'LECUNIT', 'LECNOTE', 'rEsc',
      ['lecFor', 'lecScopedKey', 'lecNoteFor', 'lecDtHref', 'lecLinkHTML'].map(fnSrc).join('\n')
      + '\nreturn { lecFor: lecFor, lecLinkHTML: lecLinkHTML, lecDtHref: lecDtHref };')(LECMAP, LECUNIT, LECNOTE,
      t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    /* 표와 같다 — 키는 map·byUnit 안, 글은 40자 이하 */
    assert(JSON.stringify(LECNOTE) === JSON.stringify(lec.note), 'LECNOTE 가 표의 note 와 다르다 — lec_link.py --emit');
    Object.keys(LECNOTE).forEach(k => {
      assert(LECMAP[k] || LECUNIT[k], 'note 가 강의 없는 자리에 붙었다: ' + k);
      assert(LECNOTE[k].length <= 40, 'note 가 40자를 넘는다: ' + k);
    });
    /* (1) ?from=dt 는 #절 앞에 — 과목·회차를 알 때만 c·r */
    assert(api.lecDtHref('https://x/lec-1.html#s03', 'ch1', 12) === 'https://x/lec-1.html?from=dt&c=ch1&r=12#s03', '꼬리가 #절 앞에 안 온다');
    assert(api.lecDtHref('https://x/lec-1.html#q', 'gc', '4') === 'https://x/lec-1.html?from=dt&c=gc&r=4#q', '확인 문제 주소에 꼬리가 틀리다');
    assert(api.lecDtHref('https://x/lec-1.html', 'ch2', 7) === 'https://x/lec-1.html?from=dt&c=ch2&r=7', '절 없는 주소에 꼬리가 틀리다');
    assert(api.lecDtHref('https://x/lec-1.html#s01', '', 5) === 'https://x/lec-1.html?from=dt#s01', '과목을 모르는데 c 를 지어냈다');
    assert(api.lecDtHref('https://x/lec-1.html#s01', 'ch1', null) === 'https://x/lec-1.html?from=dt#s01', '회차를 모르는데 r 을 지어냈다');
    assert(api.lecDtHref('https://x/lec-1.html', 'xx', 3) === 'https://x/lec-1.html?from=dt', '모르는 과목 이름을 그대로 실었다');
    /* (2) note 있는 map 자리 — 본문 절이면 「§NN 참고 · 」 */
    const bodyK = Object.keys(LECNOTE).find(k => k.indexOf('|') < 0 && /#s\d\d$/.test(LECMAP[k] || ''));
    assert(bodyK, '본문 절 + note 인 자리가 없다');
    const h1 = api.lecLinkHTML(bodyK, 'ch1', '', 9), s1 = LECMAP[bodyK].slice(-2);
    assert(h1.indexOf('href="' + LECMAP[bodyK].replace('#', '?from=dt&amp;c=ch1&amp;r=9#') + '"') > 0, '강의 문 주소가 틀리다: ' + h1);
    assert(h1.indexOf('<div class="muted lecnote">§' + s1 + ' 참고 · ') > 0, '부분 적합 한 줄이 없다: ' + h1);
    /* (3) note 있는 확인 문제 자리 — 「확인 문제 참고 · 」 */
    const qK = Object.keys(LECNOTE).find(k => k.indexOf('|') < 0 && /#q$/.test(LECMAP[k] || ''));
    if (qK) assert(api.lecLinkHTML(qK, 'gc', '', 4).indexOf('>확인 문제 참고 · ') > 0, qK + ' 의 한 줄이 확인 문제를 안 가리킨다');
    /* (4) byUnit 자리의 note 는 그 단원으로 찾는다 */
    const uK = Object.keys(LECNOTE).find(k => k.indexOf('|') > 0);
    if (uK) {
      const cu = uK.split('|')[0], mis = uK.split('|')[1], c = cu.split('/')[0], u = cu.slice(c.length + 1);
      assert(api.lecLinkHTML(mis, c, u, 3).indexOf('lecnote') > 0, uK + ' 의 한 줄이 안 뜬다');
    }
    /* (5) note 없는 자리엔 줄이 없다 */
    const plain = Object.keys(LECMAP).find(k => !LECNOTE[k]);
    assert(api.lecLinkHTML(plain, 'ch1', '', 2).indexOf('lecnote') < 0, '표시할 것이 없는데 한 줄을 만들었다: ' + plain);
  });

  /* 은행의 문장·개념 이름·해설은 JSON 글자 그대로다. innerHTML 에 날로 넣으면
     「Q<K 정반응·Q>K 역반응」 의 <K …> 가 태그로 먹혀 『QK 역반응』 이 된다 —
     2026-09-11 은행을 회차 파일에서 다시 만들며 GC-123 에서 실제로 그랬다.
     여기서는 은행에서 그런 해설을 찾아(없으면 지어낸 문장만) 화면 글자가 원문과
     같은지, 태그가 하나도 안 생기는지 본다. */
  await test('challenge · 은행 글자(<·&·")가 HTML 로 먹히지 않는다', async page => {
    await page.goto(BASE + 'challenge.html?course=gc&round=10'); await page.waitForTimeout(400);
    await page.click('.btn'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const strip = t => (t || '').replace(/\*\*(.+?)\*\*/g, '$1');
      let real = null;
      Object.keys(CHALLENGE_BANK).some(p => CHALLENGE_BANK[p].some(c => {
        if (/<[A-Za-z]/.test(c.ol || '') && c.forms.length) { real = { c: c.c, m: c.m, ol: c.ol, a: c.forms[0].a, s: c.forms[0].s }; return true; }
        return false; }));
      const fake = { c: 'ZZ-1', m: '<b>x</b>"&', ol: 'a<b>c & d', a: 'O', s: 'pH<7 & <i>i</i> "q"' };
      S.qs = real ? [real, fake] : [fake]; S.ans = S.qs.map(() => null); S.view = 'quiz'; render();
      const quiz = Array.from(document.querySelectorAll('.qs')).map(e => e.textContent);
      S.ans = S.qs.map(q => q.a === 'O' ? 'X' : 'O'); submit();
      return { real: real && real.c, quiz,
               want: S.qs.map(q => ({ s: q.s, m: q.m, ol: strip(q.ol) })),
               res: Array.from(document.querySelectorAll('.card .qs')).map(e => e.textContent),
               mis: Array.from(document.querySelectorAll('.qmis')).map(e => e.textContent),
               fb: Array.from(document.querySelectorAll('.fb')).map(e => e.textContent),
               tags: document.querySelectorAll('.qs b,.qs i,.fb b,.fb i,.fb k,.qmis b').length };
    });
    r.want.forEach((w, i) => {
      assert(r.quiz[i] === w.s, '퀴즈 문장이 원문과 다르다: ' + r.quiz[i] + ' vs ' + w.s);
      assert(r.res[i] === w.s, '결과 문장이 원문과 다르다: ' + r.res[i] + ' vs ' + w.s);
      assert(r.mis[i] === w.m, '개념 이름이 원문과 다르다: ' + r.mis[i] + ' vs ' + w.m);
      assert(r.fb[i].endsWith(' · ' + w.ol), '해설이 원문과 다르다: ' + r.fb[i] + ' vs ' + w.ol);
    });
    assert(r.tags === 0, '은행 글자가 태그가 됐다: ' + r.tags);
  });

  /* ── 5-4. 심화의 뜻 = 반반 · 선수 과목 3까지 · 기록한다 (선생님 결정 2026-09-28) ──
     절반은 약한 개념의 lvl3 문장(성적표가 &mis= 로 넘기는 이름), 절반은 두 개념을 엮는
     문장(CHALLENGE_LINK). 화학Ⅱ·일반화학의 선수 과목 문항은 12 중 3까지. 다 푼 한 판은
     &stu= 가 있을 때만 시트로 보낸다(kind:'challenge'). */
  await test('challenge · 약한 개념(&mis=)을 먼저 낸다 · 이름은 엔진과 같은 대표 이름으로', async page => {
    await page.goto(BASE + 'challenge.html?course=ch2&round=10'); await page.waitForTimeout(300);
    /* 화학Ⅱ 10회 범위의 화학Ⅱ 개념에만 닿는 이름 다섯 + 없는 이름 하나. 옛 이름(대표 이름이
       아닌 것)도 하나 섞는다 — 대표 이름으로 바꿔 맞대야 닿는다. */
    const pick = await page.evaluate(() => {
      const inScope = c => /^CH2-/.test(c) && CHALLENGE_ROUND[c] != null && CHALLENGE_ROUND[c] <= 10
        && CHALLENGE_BANK.CH2.some(x => x.c === c);
      const good = Object.keys(CHALLENGE_MIS).filter(m => CHALLENGE_MIS[m].every(inScope));
      const alias = Object.keys(CHALLENGE_CANON).find(k => good.includes(CHALLENGE_CANON[k]));
      const names = good.filter(m => m !== (alias && CHALLENGE_CANON[alias])).slice(0, 4);
      const set = {}; names.concat(alias ? [CHALLENGE_CANON[alias]] : []).forEach(m => CHALLENGE_MIS[m].forEach(c => { set[c] = 1; }));
      return { names, alias, canon: alias && CHALLENGE_CANON[alias], set: Object.keys(set) };
    });
    assert(pick.names.length === 4 && pick.alias, '검사 전제: 범위 안 이름 넷과 옛 이름 하나가 있어야 한다 ' + JSON.stringify(pick));
    const mis = pick.names.concat(['  ' + pick.alias + ' ', '없는 개념 이름']).join('|');
    await page.goto(BASE + 'challenge.html?course=ch2&round=10&mis=' + encodeURIComponent(mis)); await page.waitForTimeout(300);
    const want = Math.min(6, pick.set.length);
    const intro = await page.evaluate(() => document.body.innerText);
    assert(intro.includes('약했던 개념 가운데 ' + want + '개'), '몇 개를 먼저 내는지 사실대로 안 적는다: ' + intro.slice(0, 400));
    const got = await page.evaluate(set => {
      const out = [];
      for (let t = 0; t < 30; t++) {
        start();
        out.push({ n: S.qs.length, hit: S.qs.filter(q => set.includes(q.c)).length,
                   weak: S.qs.filter(q => q.kind === 'weak').length,
                   weakOut: S.qs.filter(q => q.kind === 'weak' && !set.includes(q.c)).length,
                   late: S.qs.filter(q => /^CH2-/.test(q.c) && !(CHALLENGE_ROUND[q.c] <= 10)).length });
      }
      return out;
    }, pick.set);
    got.forEach(g => {
      assert(g.n === 12, '12문항이 아니다: ' + g.n);
      assert(g.hit >= want && g.weak === want, '약한 개념이 ' + want + '개 먼저 나와야 한다: ' + JSON.stringify(g));
      assert(g.weakOut === 0, '약한 개념이 아닌 것을 약한 개념이라 셌다');
      assert(g.late === 0, '약한 개념이라도 안 배운 회차는 안 된다');
    });
    /* 옛 이름 하나만 넘겨도 대표 이름의 개념에 닿는다 */
    await page.goto(BASE + 'challenge.html?course=ch2&round=10&mis=' + encodeURIComponent(pick.alias)); await page.waitForTimeout(300);
    const one = await page.evaluate(canon => { start(); return S.qs.filter(q => q.kind === 'weak').map(q => q.c)
      .every(c => CHALLENGE_MIS[canon].includes(c)) && S.qs.some(q => q.kind === 'weak'); }, pick.canon);
    assert(one, '옛 이름(' + pick.alias + ')이 대표 이름(' + pick.canon + ')의 개념에 안 닿는다');
    /* &mis= 가 없으면 그렇다고 말하고, 약한 개념 갈래는 0 */
    await page.goto(BASE + 'challenge.html?course=ch2&round=10'); await page.waitForTimeout(300);
    const none = await page.evaluate(() => { start(); return { w: S.qs.filter(q => q.kind === 'weak').length, n: S.qs.length }; });
    assert(none.w === 0 && none.n === 12, '넘겨받은 것이 없는데 약한 개념이라 셌다: ' + JSON.stringify(none));
  });

  await test('challenge · 선수 과목은 12문항 중 3까지 (약한 개념이 선수 과목이어도)', async page => {
    await page.goto(BASE + 'challenge.html?course=ch2&round=17'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const out = { n: [], pre: [] };
      for (let t = 0; t < 40; t++) { start(); out.n.push(S.qs.length); out.pre.push(S.qs.filter(q => /^CH1-/.test(q.c)).length); }
      /* 자가 눈먼 것이 아닌지: 상한 없이 뽑으면 화학Ⅰ 이 3을 넘는가 */
      const pool = poolFor('ch2', 17), uniq = pool.filter((q, i, a) => a.findIndex(x => x.c === q.c) === i);
      out.poolPre = uniq.filter(q => /^CH1-/.test(q.c)).length; out.poolAll = uniq.length;
      return out;
    });
    assert(r.poolPre > 3, '검사 전제: 화학Ⅰ 후보가 3보다 많아야 한다');
    assert(r.n.every(n => n === 12), '화학Ⅱ 17회인데 12문항이 아니다: ' + r.n.join(','));
    assert(Math.max.apply(null, r.pre) <= 3, '화학Ⅰ 이 3문항을 넘었다: ' + r.pre.join(','));
    /* 약한 개념이 전부 화학Ⅰ 이어도 3까지 */
    const ch1Names = await page.evaluate(() => Object.keys(CHALLENGE_MIS)
      .filter(m => CHALLENGE_MIS[m].every(c => /^CH1-/.test(c))).slice(0, 6));
    await page.goto(BASE + 'challenge.html?course=ch2&round=17&mis=' + encodeURIComponent(ch1Names.join('|'))); await page.waitForTimeout(300);
    const w = await page.evaluate(() => { const o = []; for (let t = 0; t < 30; t++) { start();
      o.push({ pre: S.qs.filter(q => /^CH1-/.test(q.c)).length, weak: S.qs.filter(q => q.kind === 'weak').length, n: S.qs.length }); } return o; });
    w.forEach(x => assert(x.pre <= 3 && x.weak <= 3 && x.n === 12, '약한 개념이 선수 과목이면 3에 든다: ' + JSON.stringify(x)));
    assert(w.some(x => x.weak === 3), '화학Ⅰ 약한 개념이 하나도 안 나온다');
    /* 일반화학 1회: 선수 과목이 3에서 멈추므로 12가 안 된다 — 수를 사실대로 말한다 */
    await page.goto(BASE + 'challenge.html?course=gc&round=1'); await page.waitForTimeout(300);
    const gc = await page.evaluate(() => {
      const own = poolFor('gc', 1).filter((q, i, a) => /^GC-/.test(q.c) && a.findIndex(x => x.c === q.c) === i).length;
      start(); return { own, links: linkPoolFor('gc', 1).length, n: S.qs.length, pre: S.qs.filter(q => !/^GC-/.test(q.c)).length };
    });
    assert(gc.pre <= 3 && gc.n === Math.min(12, gc.own + 3 + gc.links), '일반화학 1회 문항 수가 규칙과 다르다: ' + JSON.stringify(gc));
    await page.evaluate(() => { S.view = 'intro'; render(); });
    const gt = await page.evaluate(() => document.body.innerText);
    assert(gt.includes('심화 문항 ' + gc.n + '개') && /선수 과목 문항은 12문항 중 3개까지/.test(gt), '상한과 문항 수를 화면이 말하지 않는다');
  });

  /* 엮기 문장은 연결 파일 → tools/challenge_bank.py → 화면 으로 온다. 작은 연결 파일
     (tests/fixtures/challenge_link.json)로 그 길을 통째로 잰다 — 저장소의 파일은 안 건드리고,
     자가 만든 화면을 요청 가로채기로 내준다. 연결 파일에는 일부러 틀린 것도 넣었다:
     적어 온 first_round 가 이른 것(8번 · 17회로 늦춰야 한다), 화학Ⅰ 문장에 화학Ⅱ 개념(10번 · 빼야 한다),
     정답이 O/X 가 아닌 것(12번), 같은 문장 두 번(13번). */
  await test('challenge · 두 개념 엮기 절반 (연결 파일 → 생성기 → 화면)', async page => {
    const { execFileSync } = require('child_process');
    const html = execFileSync('python3', [path.join(ROOT, 'tools', 'challenge_bank.py'), '--page-with-link',
      path.join(ROOT, 'tests', 'fixtures', 'challenge_link.json')], { encoding: 'utf8', maxBuffer: 64 << 20 });
    assert(/const CHALLENGE_LINK=\[\{/.test(html), '생성기가 엮기 문장을 안 실었다');
    await page.route('**/challenge.html*', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto(BASE + 'challenge.html?course=ch2&round=3'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const L = CHALLENGE_LINK.map(e => e.s.match(/문장 (\d+)/)[1] + ':' + e.first_round);
      const runs = [];
      for (let t = 0; t < 30; t++) { start();
        runs.push({ n: S.qs.length, link: S.qs.filter(q => q.kind === 'link').map(q => +q.s.match(/문장 (\d+)/)[1]) }); }
      return { L, runs, intro: (S.view = 'intro', render(), document.body.innerText) };
    });
    assert(r.L.join(',') === '1:2,2:2,3:2,4:2,5:2,6:2,7:2,8:17,9:17,11:1', '생성기가 연결 파일을 잘못 걸렀다: ' + r.L.join(','));
    r.runs.forEach(x => {
      assert(x.n === 12, '12문항이 아니다: ' + x.n);
      assert(x.link.length === 6, '엮기 문장이 6개가 아니다: ' + x.link.join(','));
      assert(x.link.every(k => k >= 1 && k <= 7), '범위 밖·다른 과목 엮기 문장이 나왔다: ' + x.link.join(','));
      assert(new Set(x.link).size === 6, '같은 엮기 문장이 두 번 나왔다');
    });
    assert(/두 개념을 엮는 문장 6개/.test(r.intro), '엮기 문장 수를 안 말한다: ' + r.intro.slice(0, 500));
    /* 결과 화면: 두 갈래를 따로 센다. 엮기 문장만 다 틀리고 나머지는 다 맞힌다. */
    const res = await page.evaluate(() => {
      start(); S.ans = S.qs.map(q => q.kind === 'link' ? (q.a === 'O' ? 'X' : 'O') : q.a); submit();
      const rows = Array.from(document.querySelectorAll('.halves .half')).map(e => e.innerText.replace(/\s+/g, ' ').trim());
      const chips = Array.from(document.querySelectorAll('.mchips .mchip')).map(e => e.textContent.replace('▶ 강의', ''));
      const want = []; S.qs.filter(q => q.kind === 'link').forEach(q => [q.m, q.m2].forEach(m => { if (m && !want.includes(m)) want.push(m); }));
      return { rows, chips, want, copy: resultText() };
    });
    assert(res.rows.some(t => t === '두 개념 엮기 6문항 중 0'), '엮기 갈래를 따로 안 센다: ' + res.rows.join(' / '));
    assert(res.rows.some(t => /^(약한 개념 다시|배운 개념에서 채움) 6문항 중 6$/.test(t)), '나머지 갈래 수가 틀리다: ' + res.rows.join(' / '));
    assert(res.want.every(m => res.chips.includes(m)), '엮기 문장을 틀렸는데 두 개념이 다 복습 칩에 안 뜬다');
    assert(/6문항 중 0|12문항 중 6/.test(res.copy), '복사 문구의 수가 이상하다: ' + res.copy);
    /* 엮기 문장이 모자라면 나머지를 배운 개념에서 채워 12를 지킨다 */
    const short = await page.evaluate(() => { CHALLENGE_LINK.splice(2); start();
      return { n: S.qs.length, link: S.qs.filter(q => q.kind === 'link').length }; });
    assert(short.n === 12 && short.link === 2, '엮기 문장이 둘뿐일 때 12를 못 채운다: ' + JSON.stringify(short));
    /* 1회에는 엮기 문장이 아직 없다(모두 2회부터) — 그렇다고 말한다 */
    await page.goto(BASE + 'challenge.html?course=ch2&round=1'); await page.waitForTimeout(300);
    const r1 = await page.evaluate(() => ({ t: document.body.innerText, n: linkPoolFor('ch2', 1).length }));
    assert(r1.n === 0 && /이 회차 범위에는 아직 없어/.test(r1.t), '범위에 엮기 문장이 없다고 안 한다');
    /* 다른 과목 학생에게는 안 나간다: 일반화학 1회에는 11번 하나만 */
    await page.goto(BASE + 'challenge.html?course=gc&round=1'); await page.waitForTimeout(300);
    const g = await page.evaluate(() => linkPoolFor('gc', 1).map(q => q.c));
    assert(g.join(',') === 'GC-001', '일반화학 엮기 문장이 이상하다: ' + g.join(','));
  });

  await test('challenge · 기록: &stu= 가 있을 때만 kind:challenge 로 보낸다 · 결과는 기다리지 않는다', async page => {
    const posts = []; let mode = 'slow';
    await page.route('**/macros/s/**', async route => {
      const req = route.request();
      if (req.method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      posts.push(JSON.parse(req.postData() || '{}'));
      if (mode === 'dead') return route.abort();
      if (mode === 'slow') await new Promise(r => setTimeout(r, 1500));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    const finish = () => page.evaluate(() => { start(); S.ans = S.qs.map((q, i) => i % 4 === 0 ? (q.a === 'O' ? 'X' : 'O') : q.a); submit();
      return { t: S.qs.length, ok: S.qs.filter((q, i) => S.ans[i] === q.a).length,
               kinds: S.qs.map(q => q.kind), cs: S.qs.map(q => q.kind === 'link' ? q.c + '+' + q.c2 : q.c),
               shown: !!document.querySelector('.result .score'), line: (document.getElementById('savest') || {}).textContent || '' }; });
    /* stu 없음 → 아무것도 안 보낸다. 「결과 복사」 는 그대로. */
    await page.goto(BASE + 'challenge.html?course=ch2&round=5'); await page.waitForTimeout(300);
    let a = await finish(); await page.waitForTimeout(400);
    assert(posts.length === 0, 'stu 가 없는데 보냈다');
    assert(a.shown && !a.line && await page.$('.copybtn'), 'stu 가 없을 때 결과·복사 단추가 그대로여야 한다');
    /* stu 있음 → 결과는 바로, 저장 줄은 «저장 중» → «저장됨» */
    const mis = await page.evaluate(() => Object.keys(CHALLENGE_MIS).filter(m => CHALLENGE_MIS[m].every(c => /^CH2-/.test(c) && CHALLENGE_ROUND[c] <= 5)).slice(0, 3));
    await page.goto(BASE + 'challenge.html?course=ch2&round=5&stu=abc123def&mis=' + encodeURIComponent(mis.join('|'))); await page.waitForTimeout(300);
    a = await finish();
    assert(a.shown && /저장 중/.test(a.line), '결과가 저장을 기다리거나 저장 중이라고 안 한다: ' + a.line);
    await page.waitForFunction(() => /저장됨/.test((document.getElementById('savest') || {}).textContent || ''), null, { timeout: 5000 });
    assert(posts.length === 1, '한 번 보내야 한다: ' + posts.length);
    const p = posts[0], cnt = k => a.kinds.filter(x => x === k).length;
    assert(p.kind === 'challenge' && p.stu === 'abc123def' && p.course === 'ch2' && p.round === 5, '보낸 꼴이 틀리다: ' + JSON.stringify(p));
    assert(p.n === a.t && p.ok === a.ok && p.weakN === cnt('weak') && p.linkN === cnt('link') && p.weakN > 0, '수가 화면과 다르다: ' + JSON.stringify(p));
    assert(p.weakOk <= p.weakN && p.linkOk <= p.linkN && JSON.stringify(p.concepts) === JSON.stringify(a.cs), '개념 목록이 화면과 다르다');
    assert(p.isTest === false && !('name' in p) && !('school' in p), '이름·학교는 안 보낸다');
    /* 틀린 문항만 다시 풀기는 기록하지 않는다 */
    await page.evaluate(() => { retryWrong(); S.ans = S.qs.map(q => q.a); submit(); });
    await page.waitForTimeout(400);
    assert(posts.length === 1, '다시 풀기까지 보냈다');
    assert(/따로 기록하지 않습니다/.test(await page.evaluate(() => document.getElementById('savest').textContent)), '다시 풀기는 기록 안 한다고 안 한다');
    /* 망이 끊기면 «저장 안 됨 · 다시 시도» — 결과는 그대로, 누르면 같은 판을 다시 보낸다 */
    mode = 'dead';
    await page.evaluate(() => { S.view = 'intro'; });
    a = await finish();
    await page.waitForFunction(() => /저장 안 됨/.test((document.getElementById('savest') || {}).textContent || ''), null, { timeout: 5000 });
    assert(a.shown && await page.$('.savest .savebtn'), '실패했는데 다시 시도 단추가 없다');
    mode = 'fast';
    await page.click('.savest .savebtn');
    await page.waitForFunction(() => /저장됨/.test((document.getElementById('savest') || {}).textContent || ''), null, { timeout: 5000 });
    assert(posts.length === 3 && JSON.stringify(posts[2]) === JSON.stringify(posts[1]), '다시 시도가 같은 판을 안 보낸다');
    await assertNoOverflow(page, 'challenge-result');
  });

  /* ── 6. 문자 템플릿: 탭 구성 + 복사 = 미리보기 일치 + 미입력 경고 ── */
  await test('letters · 탭/복사/자리표시', async page => {
    await page.goto(BASE + 'letters.html'); await page.waitForTimeout(400);
    const tabs = await page.$$eval('#tabs button', bs => bs.map(b => b.textContent));
    assert(/16회.*16회.*6회/.test(tabs.join(' ')), '탭 구성(16/16/6) 불일치: ' + tabs.join(','));
    /* 탭 순서는 화학Ⅰ → 화학Ⅰ 심화 → 화학Ⅱ → 일반화학. 자리 번호가 아니라 이름으로 누른다. */
    await page.click('#tabs button:has-text("화학Ⅱ")');                  // 화학Ⅱ
    await page.click('#rgrid .rchip:nth-child(9)'); await page.waitForTimeout(250);
    const preview = await page.$eval('#pvText', t => t.value);
    assert(preview.includes('화학올림피아드 담당하는 조준모입니다'), '문자 골격 누락');
    await page.click('#copyBtn'); await page.waitForTimeout(250);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip === preview, '복사 내용이 미리보기와 다름');
    await page.click('#rgrid .rchip:nth-child(1)'); await page.waitForTimeout(250); // 미입력 회차
    assert(!(await page.$eval('#pvWarn', w => w.hidden)), '미입력 경고 미표시');
    const ph = await page.$eval('#pvText', t => t.value);
    assert(ph.includes('〔'), '자리표시 없음');
    await assertNoOverflow(page, 'letters');
  }, { clipboard: true });

  /* ── 7. 리포트: 기록 없음(빈 데이터) 경로가 에러 없이 렌더 ── */
  await test('report · 미해석 링크는 데모 대신 오류 표시', async page => {
    // student 파라미터가 있는데 서버가 못 여는(cumulative:null) 경우: 남의 데모 학생을 보여주면 안 된다.
    await page.goto(BASE + 'report.html?student=demo'); await page.waitForTimeout(1200);
    const text = await page.$eval('#app', e => e.textContent).catch(() => '');
    assert(text.length > 0, '리포트 본문 비어 있음');
    assert(text.indexOf('조준모T테스트예시자료') < 0, '미해석 링크에 데모 학생 데이터가 노출됨');
    assert(/열 수 없습니다|확인/.test(text), '링크 오류 안내가 표시되지 않음');
    await assertNoOverflow(page, 'report');
  });
  /* 못 물어본 것과 기록이 없는 것은 다르다. 앱스크립트가 줄을 세우는 동안
     학부모가 링크를 누르면 이 한 번뿐인 요청이 줄에 걸려 실패하는데, 여태
     화면에는 "링크가 오래되어…" 가 떴다 — 링크는 멀쩡한데 학부모는 링크를
     의심하고 선생님께 문의한다. */
  await test('report · 못 물어본 것을 링크 탓으로 돌리지 않는다', async page => {
    let asked = 0;
    await page.route('**/macros/s/**', route => {
      if (/student=/.test(route.request().url())) { asked++; return route.abort(); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto(BASE + 'report.html?student=abc');
    await page.waitForTimeout(6000);
    /* 한 번 실패했다고 포기하면 줄이 빠진 뒤에도 못 연다. */
    assert(asked >= 2, '한 번만 묻고 포기했다 (' + asked + '회)');
    const text = await page.$eval('#app', e => e.textContent).catch(() => '');
    assert(/링크에는 문제가 없습니다/.test(text), '링크 탓으로 읽히는 안내: ' + text.slice(0, 80));
    assert(/오래되어/.test(text) === false, '멀쩡한 링크를 오래됐다고 한다');
    assert(await page.$('#retryRep'), '다시 시도할 길이 없다');
    /* 남의 성적을 보여 주는 일은 여전히 없어야 한다. */
    assert(text.indexOf('조준모T테스트예시자료') < 0, '데모 학생이 노출됨');
    await assertNoOverflow(page, 'report-fail');
  });

  await test('report · 서버가 기록 없다고 답하면 그렇게 적는다', async page => {
    await page.route('**/macros/s/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, cumulative: null, rows: [] }) }));
    await page.goto(BASE + 'report.html?student=abc');
    await page.waitForTimeout(1500);
    const text = await page.$eval('#app', e => e.textContent).catch(() => '');
    /* 이때는 링크·기록을 확인하라는 원래 안내가 맞다. */
    assert(/열 수 없습니다/.test(text), '원래 안내가 안 뜬다: ' + text.slice(0, 80));
    assert(/링크에는 문제가 없습니다/.test(text) === false, '못 물어본 것으로 잘못 읽는다');
    assert(text.indexOf('조준모T테스트예시자료') < 0, '데모 학생이 노출됨');
  });

  await test('report · 빈 student 파라미터도 데모 대신 오류', async page => {
    // ?student= (값 없음)로 열려도 학생 링크이므로 데모(가짜 학생)를 보여주면 안 된다
    await page.goto(BASE + 'report.html?student='); await page.waitForTimeout(1000);
    const text = await page.$eval('#app', e => e.textContent).catch(() => '');
    assert(text.indexOf('조준모T테스트예시자료') < 0, '빈 파라미터에 데모 학생이 노출됨');
    assert(/열 수 없습니다|확인/.test(text), '링크 오류 안내가 표시되지 않음');
  });
  await test('report · 파라미터 없으면 미리보기(데모) 표시', async page => {
    // 링크 없이 report.html 직접 열기 = 미리보기. 이때만 데모 학생을 보여준다(OG 프리뷰 용).
    await page.goto(BASE + 'report.html'); await page.waitForTimeout(1200);
    const text = await page.$eval('#app', e => e.textContent).catch(() => '');
    assert(text.indexOf('조준모T테스트예시자료') >= 0, '파라미터 없는 미리보기에서 데모가 사라짐');
    await assertNoOverflow(page, 'report');
  });

  /* ── 7.5 점수 표기: 소수 둘째 자리까지 ──────────────────────────
     학부모가 받은 성적표에 이렇게 찍혔다.
       "반 평균보다 0.29999999999999716점 높습니다"
     점수를 그냥 빼서 문자열에 붙이면 부동소수점 찌꺼기가 그대로 나간다.
     pt() 가 셋째 자리에서 반올림해 늘 00.00 꼴로 적는다. */
  /* 파이널 성적표는 틀린 문항마다 해설·동형문제를 걸어 준다. DT 성적표는
     "총괄성 크기를 틀렸습니다" 까지만 말하고 **갈 곳을 안 줬다** — 자료는 이
     저장소에 다 있는데도. 학부모는 문자로 받은 링크 하나뿐이라 더 볼 수 없다. */
  /* 눈으로 보면 "좀 흐린가?" 로 끝나고, 흐린 채로 남는다. 재서 정한다.
     학부모가 휴대폰으로 읽는 문서라 여기서 아끼면 안 읽힌다. */
  /* ══════════════════════════════════════════════════════════════
     이름만 주고 도움을 안 주면 안 된다.

     성적표는 오개념 이름을 짚어 준다 — "총괄성 크기 · 3개 회차 반복". 그런데
     설명(ONELINE)이 없는 태그는 코드가 그 줄을 **조용히 빼 버린다**:

         ${ONELINE[m.mis] ? '<b>핵심:</b> …' : ''}

     그러면 세 회차나 막힌 것을 짚어 놓고 **아무것도 알려 주지 않는 화면**이
     된다. 재어 보니 태그 열 개가 그랬고, 걸리는 문항이 2,760개 중 339개
     (12.3%)였다 — 고체 결정구조 · 오비탈 마디 · 전자전이 계열 같은 화학Ⅱ 뒷단원.

     회차를 새로 만들면 새 태그가 생긴다. 그때 설명을 안 쓰면 여기서 빨간불이
     난다 — 그게 이 검사의 목적이다.
     ══════════════════════════════════════════════════════════════ */
  /* 이 문단은 **매주** 학부모에게 간다. 상황별 변형이 둘뿐이면 같은 상황이
     이어질 때 격주로 같은 글이 가고, 두 주 연달아 같으면 그때부터 안 읽힌다.
     (게다가 chronic 은 늘 [0] 만 쓰고 있어서 뱅크를 늘려도 안 나왔다.) */
  /* ══════════════════════════════════════════════════════════════
     학생 화면과 성적표가 **약속**한다: "틀린 개념만 골라 강의록으로 다시 잡은 뒤,
     새 문항으로 확인합니다(**같은 문제는 다시 나오지 않습니다**)."

     그런데 buildRetake 는 맞힌 개념에서 `seenStatements` 를 안 봤다("form 절약").
     retakeC 문장의 13%가 정시 문장과 글자까지 같아서, 정시를 30% 틀린 학생이
     60문항 중 5~6문항을 **그대로 다시** 봤다. 기억으로 답하면 확인이 안 되고,
     무엇보다 한 약속이 깨진다. 아낄 것은 form 이 아니라 약속이다.
     ══════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════
     재시는 **그 학생이 틀린 개념**을 다시 묻는 시험이다. 그런데 재시 묶음
     (retakeC)은 회차마다 고정이고, 세어 보니 그 묶음이 정시 개념의 **55.9%만**
     담고 있었다 — 학생이 틀린 개념이 나머지 44% 쪽이면 "틀린 개념만 골라 새
     문항으로 확인" 한다면서 **그 개념을 한 번도 안 묻는다.**

     새 문항을 만들 필요는 없었다. 빠진 개념 1,008개가 **전부 forms_bank 에
     문항을 갖고 있다** — 배치 문제였다.
     ══════════════════════════════════════════════════════════════ */
  await test('재시 · 틀린 개념이 빠지지 않는다', async () => {
    const E = require(path.join(ROOT, 'chemengine.js'));
    const AD = path.join(ROOT, 'appdata');
    const norm = x => (x || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').trim();
    const FBraw = JSON.parse(fs.readFileSync(path.join(AD, 'forms_bank.json'), 'utf8'));
    const FB = FBraw.forms || FBraw;

    let wrongTot = 0, covered = 0, sims = 0, notSixty = 0, dupInTest = 0;
    fs.readdirSync(AD).filter(f => /^round_.*\.json$/.test(f)).sort().forEach(f => {
      const d = JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
      const j = (d.jeongsi && d.jeongsi.items) || [], rc = d.retakeC || [];
      if (!j.length || !rc.length) return;
      /* 조금 틀린 학생부터 많이 틀린 학생까지 — 어느 쪽에서도 빠지면 안 된다. */
      [0.1, 0.3, 0.5, 0.8].forEach(frac => {
        const seen = {}; j.forEach(it => { seen[norm(it.s)] = 1; });
        const wrong = [], ws = {};
        j.forEach((it, i) => { if ((i % 10) / 10 < frac) { wrong.push(it.c); ws[norm(it.s)] = 1; } });
        const W = {}; wrong.forEach(c => { W[c] = 1; });
        const r = E.buildRetake(2, rc, wrong, FB, Object.assign({}, seen), ws);
        sims++;
        const got = {}; r.items.forEach(x => { got[x.c] = 1; });
        Object.keys(W).forEach(c => { wrongTot++; if (got[c]) covered++; });
        /* 채점이 성립하려면 문항 수가 그대로여야 한다(1.6667 × 60 = 100). */
        if (r.items.length !== 60) notSixty++;
        /* 한 시험 안에서 같은 문장이 두 번 나오면 안 된다. */
        const uniq = {}; r.items.forEach(x => { uniq[norm(x.s)] = 1; });
        if (Object.keys(uniq).length !== r.items.length) dupInTest++;
      });
    });
    const pct = 100 * covered / wrongTot;
    console.log('  시뮬 ' + sims + '회 · 틀린 개념 ' + wrongTot + '개 중 재시에 나온 것 ' +
                covered + ' (' + pct.toFixed(1) + '%)');
    assert(sims >= 150, '시뮬레이션이 제대로 안 돌았다');
    assert(notSixty === 0, '문항 수가 60이 아닌 재시 ' + notSixty + '건');
    assert(dupInTest === 0, '한 시험 안에 같은 문장이 두 번 나온 재시 ' + dupInTest + '건');
    /* form 이 동난 개념은 낼 문항이 없어 빠질 수 있다(지금 748개 중 2개).
       0 으로 못 박으면 검사가 거짓말이 되므로, 눈에 띄는 선으로 둔다. */
    assert(pct >= 99.5, '틀린 개념이 재시에 나오는 비율이 ' + pct.toFixed(1) + '% (이전 55.9%)');

    const src = fs.readFileSync(path.join(ROOT, 'chemengine.js'), 'utf8');
    assert(/filledGap: true/.test(src), '빈 자리를 채우는 표시가 사라졌다');
    /* 이미 틀린 개념이 잡은 **첫** 자리를 빼앗으면 안 된다 — 그 개념이 도로
       빠진다. 다만 같은 개념이 두 번 차지한 자리는 내줘도 된다(그래야 많이 틀린
       학생도 빠지는 개념이 없다 — 오답률 80%에서 40개가 그랬다). */
    assert(/if \(wrong\[items\[s2\]\.c\] && !dupSlot\) continue;/.test(src),
      '틀린 개념의 첫 자리를 지킨다는 조건이 사라졌다');
    assert(/var dupSlot = firstAt\[items\[s2\]\.c\] !== s2;/.test(src),
      '두 번째 이후 자리를 가리는 규칙이 사라졌다');
  });

  await test('재시 · 같은 문제는 다시 나오지 않는다', async () => {
    const E = require(path.join(ROOT, 'chemengine.js'));
    const norm = x => (x || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').trim();
    const AD = path.join(ROOT, 'appdata');
    const FBraw = JSON.parse(fs.readFileSync(path.join(AD, 'forms_bank.json'), 'utf8'));
    const FB = FBraw.forms || FBraw;

    let items = 0, repeat = 0, rounds = 0, worst = ['', 0];
    fs.readdirSync(AD).filter(f => /^round_.*\.json$/.test(f)).sort().forEach(f => {
      const d = JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
      const j = (d.jeongsi && d.jeongsi.items) || [], rc = d.retakeC || [];
      if (!j.length || !rc.length) return;
      rounds++;
      const seen = {}; j.forEach(it => { seen[norm(it.s)] = 1; });
      /* 합격선 바로 밑에서 떨어진 전형적인 재시 응시자(30% 오답)를 흉내 낸다. */
      const wrong = [], wrongStmts = {};
      j.forEach((it, i) => { if (i % 10 < 3) { wrong.push(it.c); wrongStmts[norm(it.s)] = 1; } });
      const r = E.buildRetake(2, rc, wrong, FB, Object.assign({}, seen), wrongStmts);
      let rep = 0;
      r.items.forEach(it => { items++; if (seen[norm(it.s)]) { rep++; repeat++; } });
      if (rep > worst[1]) worst = [f, rep];
    });
    console.log('  회차 ' + rounds + ' · 재시 ' + items + '문항 중 이미 본 문장 ' + repeat +
                '개 (최악 ' + worst[0].replace(/round_|\.json/g, '') + ' ' + worst[1] + ')');
    assert(rounds >= 40 && items >= 2000, '회차 자료를 제대로 못 읽었다');
    /* form 이 동난 개념은 원본으로 돌아갈 수밖에 없다(그때는 다른 개념으로도 못
       바꾼다). 그런 자리를 0 으로 못 박으면 검사가 거짓말이 되므로, 눈에 띄면
       바로 알 수 있는 선(회차당 1문항 미만)으로 둔다. 지금은 46회차 통틀어 2개다. */
    assert(repeat <= rounds, '이미 본 문장이 재시에 ' + repeat + '개 (회차당 1개를 넘음) · 최악 ' + worst[0]);
    assert(worst[1] <= 3, worst[0] + ' 한 회차에만 ' + worst[1] + '개');

    /* 규칙 자체도 본다 — 맞힌 개념이라고 seen 을 건너뛰면 안 된다. */
    const src = fs.readFileSync(path.join(ROOT, 'chemengine.js'), 'utf8');
    assert(/!usedThis\[norm\(orig\.s\)\] && !seenStatements\[norm\(orig\.s\)\]/.test(src),
      '맞힌 개념에서 이미 본 문장을 다시 거른다는 조건이 사라졌다');
  });

  /* 오답 뒤에 읽는 해설이 개념 이름만 던지면 도움이 안 된다. 고쳐 놓은 것이
     되돌아가지 않게 못 박는다(재어 보고 고른 것들이다). */
  await test('내용 · 해설이 정의를 되풀이하지 않는다', async () => {
    /* 정의형 O문항의 해설이 그 정의의 **이름**만 되뇌는 자리가 38종 78문항
       있었다 — "끓는점은 증기 압력이 외부 압력과 같아지는 온도이다" → `끓는점의
       정의.` 학생은 이미 그 문장을 읽었고, 알고 싶은 것은 그래서 무엇이 달라지는가다.
       (짧다고 다 나쁜 것은 아니다 — `H⁺가 많다.` 처럼 이유를 말하는 해설은 그대로 뒀다.) */
    const AD = path.join(ROOT, 'appdata');
    const NAME = /^[가-힣A-Za-z0-9·\s]{2,16}(정의|법칙|원리|규칙)\.?$/;
    const hit = [];
    fs.readdirSync(AD).filter(f => /^round_.*\.json$/.test(f)).forEach(f => {
      const d = JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
      [d.jeongsi].concat(d.retakeC || []).forEach(b => {
        if (!b || !Array.isArray(b.items)) return;
        b.items.forEach(it => {
          const w = String((it && it.w) || '').trim();
          if (NAME.test(w)) hit.push(f.replace(/round_|\.json/g, '') + ' ' + it.n + ' → ' + w);
        });
      });
    });
    assert(hit.length === 0, '개념 이름만 던지는 해설 ' + hit.length + '건: ' + hit.slice(0, 4).join(' / '));
  });

  await test('내용 · 해설이 이름만 던지지 않는다', async () => {
    const AD = path.join(ROOT, 'appdata');
    const bad = { '확장옥텟 분자의 입체 구조.': 0, '오비탈 양자수.': 0 };
    let n = 0;
    fs.readdirSync(AD).filter(f => /^round_.*\.json$/.test(f)).forEach(f => {
      const t = fs.readFileSync(path.join(AD, f), 'utf8');
      Object.keys(bad).forEach(k => { const m = t.split('"w": "' + k + '"').length - 1; bad[k] += m; });
      n++;
    });
    assert(n >= 40, '회차 자료를 못 읽었다');
    /* '확장옥텟 분자의 입체 구조.' 는 SF₄·PF₅·ClF₃… 열 분자에 같은 문구가 붙어
       있었다 — 정답이 O 든 X 든 똑같아서 무엇이 틀렸는지 알 길이 없었다.
       '오비탈 양자수.' 는 스핀양자수 문항에 붙은 **다른 개념 이름**이었다. */
    Object.keys(bad).forEach(k => assert(bad[k] === 0, '되돌아온 해설: "' + k + '" ' + bad[k] + '건'));
  });

  await test('내용 · 매주 가는 문구가 되풀이되지 않는다', async page => {
    await page.goto(BASE + 'report.html');
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const sizes = {};
      Object.keys(RXBANK.openers).forEach(k => { sizes['openers.' + k] = RXBANK.openers[k].length; });
      Object.keys(RXBANK.chronic).forEach(k => { sizes['chronic.' + k] = RXBANK.chronic[k].length; });
      sizes['closers'] = RXBANK.closers.length;
      /* 뽑는 규칙 자체를 확인한다: 지난 회차와 같은 자리를 고르면 비켜서야 한다. */
      const arr = ['a', 'b', 'c', 'd', 'e'];
      const same = _rxPick(arr, 7, 7);          // 같은 씨앗 → 비켜서야 한다
      const alone = _rxPick(['only'], 7, 7);    // 하나뿐이면 비킬 곳이 없다
      const noPrev = _rxPick(arr, 7, null);     // 첫 회차엔 피할 것이 없다
      return { sizes, same, alone, noPrev, plain: arr[7 % arr.length] };
    });
    Object.keys(r.sizes).forEach(k => {
      const need = k.indexOf('chronic') === 0 ? 2 : 5;
      assert(r.sizes[k] >= need, k + ' 변형이 ' + r.sizes[k] + '개뿐 (최소 ' + need + ')');
    });
    assert(r.same !== r.plain, '지난 회차와 같은 문단을 다시 고른다');
    assert(r.alone === 'only', '변형이 하나뿐일 때 비어 버린다');
    assert(r.noPrev === r.plain, '첫 회차에서 괜히 비켜선다');

    /* 뱅크에 넣어 놓고 안 쓰면 없는 것과 같다. */
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    assert(/RXBANK\.chronic\.many\[0\]/.test(src) === false, 'chronic 이 첫 문단만 쓴다');
    assert(/_rxPick\(RXBANK\.chronic\.many/.test(src), 'chronic 을 골라 쓰지 않는다');
  });

  /* ══════════════════════════════════════════════════════════════
     "반복해서 막히는 개념" 은 서로 다른 회차에서 **같은 이름**의 오개념을
     틀렸을 때만 뜬다. 이름이 갈려 있으면 같은 곳에서 세 번 막혀도 신호가 없다.

     세어 보니 793종 가운데 474종(59.8%)이 단 한 회차에만 있어서, 문항
     602개(21.8%)는 아무리 틀려도 구조적으로 신호를 못 냈다 — 갈린 이유는
     대부분 조사와 어순(`몰농도 온도`/`몰농도와 온도`)이었다.
     ══════════════════════════════════════════════════════════════ */
  await test('내용 · 같은 개념이 이름 때문에 갈리지 않는다', async () => {
    const E = require(path.join(ROOT, 'chemengine.js'));
    const AD = path.join(ROOT, 'appdata');
    const used = {}, rounds = {};
    fs.readdirSync(AD).filter(f => /^round_.*\.json$/.test(f)).forEach(f => {
      const d = JSON.parse(fs.readFileSync(path.join(AD, f), 'utf8'));
      const key = d.course + '#' + d.round;
      [d.jeongsi].concat(d.retakeC || []).forEach(b => {
        if (!b || !Array.isArray(b.items)) return;
        b.items.forEach(it => {
          const m = String((it && it.mis) || '').trim(); if (!m) return;
          used[m] = (used[m] || 0) + 1;
          (rounds[m] || (rounds[m] = {}))[key] = 1;
        });
      });
    });
    const nRound = m => Object.keys(rounds[m] || {}).length;
    const merged = {};
    Object.keys(rounds).forEach(m => {
      const c = E.misCanon(m);
      Object.keys(rounds[m]).forEach(k => { (merged[c] || (merged[c] = {}))[k] = 1; });
    });
    const blockedBefore = Object.keys(used).filter(m => nRound(m) < 2)
      .reduce((t, m) => t + used[m], 0);
    const blockedAfter = Object.keys(used)
      .filter(m => Object.keys(merged[E.misCanon(m)] || {}).length < 2)
      .reduce((t, m) => t + used[m], 0);
    console.log('  신호를 못 내던 문항 ' + blockedBefore + ' → ' + blockedAfter +
                ' · 매핑 ' + Object.keys(E.MIS_CANON).length + '개');
    assert(blockedAfter < blockedBefore, '이름 정리가 아무것도 살리지 못했다');
    assert(blockedAfter <= 520, '아직 ' + blockedAfter + '문항이 신호를 못 낸다');

    /* ⚠ 이름만 닮고 개념이 다른 것을 합치면 남의 약점이 섞인다. 사람이 빼 둔
       것들이 실수로 다시 들어오면 여기서 걸린다. */
    [['원자 구성', '원자핵 구성'], ['몰농도 정의', '몰랄 농도 정의'],
     ['전자 전이', '전자 이동'], ['끓는점 오름', '어는점 내림'],
     ['반응 차수', '반응 지수'], ['원자 수 세기', '원소 수 세기']]
      .forEach(([a, b]) => assert(E.misCanon(a) !== E.misCanon(b),
        '다른 개념을 합쳤다: ' + a + ' / ' + b));

    /* 대표 이름으로 바뀐 뒤에도 설명을 찾을 수 있어야 한다 — 못 찾으면
       "3개 회차 반복" 을 짚어 놓고 도움을 못 준다. */
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const one = JSON.parse(src.match(/const ONELINE=(\{[\s\S]*?\});\n/)[1]);
    const core = JSON.parse(src.match(/const CORE=(\{[\s\S]*?\});\n/)[1]);
    const noHelp = Object.keys(E.MIS_CANON).map(k => E.MIS_CANON[k])
      .filter(t => !one[t] || !core[t]);
    assert(noHelp.length === 0, '대표 이름에 설명이 없다: ' + noHelp.slice(0, 4).join(' / '));

    /* 자료(mis)와 해설 사전은 손대지 않는다 — 시트에 쌓인 지난 기록이 옛 이름이라,
       집계에서만 바꿔야 지난 학기까지 같이 살아난다. */
    const eng = fs.readFileSync(path.join(ROOT, 'chemengine.js'), 'utf8');
    assert(/var mk = misCanon\(m\);/.test(eng), '집계에서 대표 이름을 안 쓴다');
    assert(Object.keys(used).some(m => E.MIS_CANON[m]), '자료의 태그가 매핑에 안 걸린다');
  });

  /* 온도 표기가 두 글자로 갈려 있었다: °C 384곳 · ℃ 38곳.
     ℃(U+2103)는 CJK 호환용이라 유니코드가 쓰지 말라고 권하고, 글꼴에 따라
     작은 크기에서 뭉개지며, "°C" 로 찾으면 안 걸린다. exam 저장소도 같은
     방향(°C)으로 모았으니 두 앱이 다시 갈리지 않게 지킨다. */
  /* 주기율표는 휴대폰에서 610px 이 화면 밖에 있는데 **잘렸다는 표시가 없었다.**
     시험 중에 여는 학생은 1~6족만 보고 나머지가 있는 줄 모른다. 안내는
     실제로 잘릴 때만 떠야 한다 — 넓은 화면에서 "옆으로 미세요" 도 거짓말이다. */
  await test('exam · 주기율표가 잘리면 잘렸다고 말한다', async page => {
    for (const [w, cut] of [[390, true], [1200, false]]) {
      await page.setViewportSize({ width: w, height: 844 });
      await page.goto(BASE + 'exam.html');
      await page.waitForTimeout(700);
      await page.evaluate(() => document.getElementById('cxpBtn').click());
      await page.waitForTimeout(400);
      const st = await page.evaluate(() => {
        const c = document.querySelector('.cxpCard'), h = document.querySelector('.cxpHint');
        const sc = document.querySelector('.cxpScroll');
        return { cut: c.classList.contains('cut'),
                 hint: h ? getComputedStyle(h).display !== 'none' : false,
                 over: sc.scrollWidth > sc.clientWidth + 4 };
      });
      assert(st.over === cut, w + 'px 에서 잘림 여부가 예상과 다르다: ' + st.over);
      assert(st.cut === cut, w + 'px 에서 잘림 표시가 ' + st.cut);
      assert(st.hint === cut, w + 'px 에서 안내가 ' + st.hint + ' — 안 잘리는데 띄우면 거짓말이다');
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  /* "복습 시점" 이라고 적어 놓고 시점 설계가 없었다 — 과거에 한 번이라도 틀린
     개념을 회차마다 그대로 다시 늘어놓았다. 선생님이 정한 간격: 1 → 3 → 7회차. */
  await test('간격 반복 · 1 → 3 → 7 회차에만 떠오른다', async () => {
    const E = require(path.join(ROOT, 'chemengine.js'));
    const rows = [{ round: 10, attempt: '정시', wrongMis: ['총괄성'] }];
    const seen = [];
    for (let n = 10; n <= 22; n++) if (E.spacedReview(rows, n).length) seen.push(n);
    assert(JSON.stringify(seen) === JSON.stringify([11, 14, 21]),
           '떠오르는 회차가 11·14·21 이 아니다: ' + JSON.stringify(seen));

    /* 사이 회차에 뜨면 목록이 길어지고, 길어지면 안 읽힌다. */
    assert(E.spacedReview(rows, 12).length === 0, '12회에 떴다 — 사이는 비어야 한다');
    assert(E.spacedReview(rows, 22).length === 0, '졸업한 개념이 또 떴다');

    /* 다시 틀리면 기준이 그 회차로 옮겨져 처음부터 다시 센다. */
    const again = [{ round: 10, attempt: '정시', wrongMis: ['총괄성'] },
                   { round: 12, attempt: '정시', wrongMis: ['총괄성'] }];
    const seen2 = [];
    for (let n = 12; n <= 24; n++) if (E.spacedReview(again, n).length) seen2.push(n);
    assert(JSON.stringify(seen2) === JSON.stringify([13, 16, 23]),
           '다시 틀린 뒤 기준이 안 옮겨졌다: ' + JSON.stringify(seen2));
    assert(E.spacedReview(again, 13)[0].times === 2, '틀린 횟수를 안 센다');

    /* 엔진은 네 곳에 같은 코드로 들어 있다. 하나만 고치면 화면마다 다르게
       동작하는데, 그것을 잡는 검사가 없었다. */
    const eng = fs.readFileSync(path.join(ROOT, 'chemengine.js'), 'utf8');
    const i = eng.indexOf('  /* ---------- 간격 반복'), j = eng.indexOf('  // ---------- export');
    assert(i > 0 && j > i, 'chemengine.js 에서 간격 반복 자리를 못 찾았다');
    const ref = eng.slice(i, j);
    ['exam.html', 'report.html', 'chemistreal_app.html'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(src.includes(ref), f + ' 의 엔진이 chemengine.js 와 갈렸다');
    });
  });

  /* 매주 가는 글이라 같은 문장이 두 주 연달아 오면 그때부터 안 읽는다 —
     여는·만성·맺음 문단은 그래서 여러 벌 중에서 지난 회차와 안 겹치게 고른다.
     그런데 **가장 내용에 가까운 축 문단만 한 벌뿐**이라 매주 똑같이 나갔다.
     문단을 새로 쓰는 것은 선생님 몫이라 자리부터 열어 뒀다 — 배열이면 고른다. */
  await test('처방 코멘트 · 축 문단도 여러 벌을 받을 수 있다', async page => {
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    assert(/Array\.isArray\(av\)/.test(src), '축 문단이 배열을 못 받는다');
    assert(/_rxPick\(av,\s*seed>>>11/.test(src), '축 문단이 다른 자리와 같은 규칙으로 안 고른다');

    /* 배열을 넣어 보고 실제로 갈리는지 — 지금 값(글 하나)도 그대로 돌아야 한다. */
    await page.goto(BASE + 'report.html?demo');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const out = { 글하나: null, 배열: [] };
      const key = Object.keys(RXBANK.axis)[0];
      const orig = RXBANK.axis[key];
      out.글하나 = typeof orig === 'string';
      RXBANK.axis[key] = ['가 문단', '나 문단', '다 문단'];
      for (let i = 0; i < 3; i++) {
        const av = RXBANK.axis[key];
        out.배열.push(Array.isArray(av) ? av.length : 0);
      }
      RXBANK.axis[key] = orig;
      return out;
    });
    assert(r.글하나 === true, '지금 값이 글 하나가 아니다 — 하위호환을 봐야 한다');
    assert(r.배열[0] === 3, '배열을 못 넣는다');
  });

  await test('내용 · 온도 표기가 한 가지다', async () => {
    const AD = path.join(ROOT, 'appdata');
    const bad = [];
    fs.readdirSync(AD).filter(f => f.endsWith('.json')).forEach(f => {
      const t = fs.readFileSync(path.join(AD, f), 'utf8');
      const n = (t.match(/\u2103/g) || []).length;
      if (n) bad.push(f + '(' + n + '곳)');
    });
    assert(bad.length === 0, '℃ 로 남아 있다 — °C 로 모은다: ' + bad.slice(0, 5).join(', '));
  });

  await test('내용 · 짚은 개념에는 설명이 있다', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const dictOf = name => {
      const m = src.match(new RegExp('const ' + name + '=(\\{[\\s\\S]*?\\});\\n'));
      assert(m, name + ' 사전을 못 찾았다');
      return JSON.parse(m[1]);
    };
    const ONELINE = dictOf('ONELINE'), CORE = dictOf('CORE');
    /* 화학Ⅰ 심화 개념 글은 코드 키 표(CH1S_NOTE · tools/deep_notes.py)로 들어가고, 화면이 처음 열릴 때
       ONELINE·CORE 에 없는 심화반 이름만 채운다(CH1S_BYNAME 앞의 즉시 함수). 그 규칙대로 합쳐 본다. */
    const CH1S = (src.match(/^const CH1S_NOTE=(\{.*\});$/m) || [])[1];
    assert(CH1S, 'CH1S_NOTE 표를 못 찾았다');
    Object.values(JSON.parse(CH1S)).forEach(v => {
      if (v.o && ONELINE[v.m] == null) ONELINE[v.m] = v.o;
      if (v.c && CORE[v.m] == null) CORE[v.m] = v.c;
    });
    assert(/if\(v\.o&&ONELINE\[v\.m\]==null\) ONELINE\[v\.m\]=v\.o; if\(v\.c&&CORE\[v\.m\]==null\) CORE\[v\.m\]=v\.c;/.test(src),
      '성적표가 심화반 글을 ONELINE·CORE 에 채우지 않는다');

    const used = {};
    let items = 0, rounds = 0;
    fs.readdirSync(path.join(ROOT, 'appdata'))
      .filter(f => /^round_.*\.json$/.test(f))
      .forEach(f => {
        rounds++;
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', f), 'utf8'));
        ['jeongsi', 'jaesi', 'jaejaesi'].forEach(sec => {
          const b = d[sec];
          if (!b || !Array.isArray(b.items)) return;
          b.items.forEach(it => {
            items++;
            const m = String((it && it.mis) || '').trim();
            if (m) used[m] = (used[m] || 0) + 1;
          });
        });
      });
    console.log('  회차 ' + rounds + ' · 문항 ' + items + ' · 오개념 ' + Object.keys(used).length + '종');
    assert(rounds >= 40 && items >= 2000, '회차 자료를 제대로 못 읽었다');

    const count = (dict) => Object.keys(used).filter(t => !dict[t]);
    const noOne = count(ONELINE), noCore = count(CORE);
    const hit = ks => ks.reduce((t, k) => t + used[k], 0);
    assert(noOne.length === 0,
      '한 줄 설명(ONELINE)이 없는 개념 ' + noOne.length + '종 · 문항 ' + hit(noOne) +
      '개 — ' + noOne.slice(0, 5).join(' / '));
    assert(noCore.length === 0,
      '핵심 설명(CORE)이 없는 개념 ' + noCore.length + '종 · 문항 ' + hit(noCore) +
      '개 — ' + noCore.slice(0, 5).join(' / '));

    /* 빈 문자열로 채워 검사만 통과시키는 길을 막는다 — 그건 없는 것과 같다. */
    const thin = Object.keys(used).filter(t => String(ONELINE[t] || '').replace(/\*/g, '').trim().length < 15);
    assert(thin.length === 0, '설명이 너무 짧은 개념: ' + thin.slice(0, 5).join(' / '));

    /* 모든 문항에 오개념 이름이 붙어 있어야 '어디서 막혔나' 를 말할 수 있다. */
    const tagged = Object.values(used).reduce((a, b) => a + b, 0);
    assert(tagged === items, '오개념 이름이 없는 문항 ' + (items - tagged) + '개');
  });

  await test('report · 글씨는 눈이 아니라 자로 정한다', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const lum = h => { h = h.replace('#',''); const a = [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255)
      .map(v => v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
      return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2]; };
    const ratio = (a,b) => { const x = lum(a), y = lum(b);
      return (Math.max(x,y)+0.05) / (Math.min(x,y)+0.05); };
    const v = n => (src.match(new RegExp('--' + n + ':(#[0-9A-Fa-f]{6})')) || [])[1];

    /* 재어 보니 9~11px 이 서른여섯 군데였다. 바닥을 정하고 지킨다. */
    const small = (src.match(/font-size:(\d+(?:\.\d+)?)px/g) || [])
      .map(x => Number(x.replace(/[^\d.]/g, ''))).filter(n => n < 11.5);
    assert(small.length === 0, '11.5px 미만 글씨 ' + small.length + '개: ' + small.slice(0,6).join(','));

    const paper = v('paper'), sub = v('sub'), faint = v('faint');
    /* ⚠ 대비는 **글씨가 실제로 얹히는 바탕** 위에서 재야 한다. 종이색 위에서만
       재면 옅은 옥색·크림 카드 위에서 4.5 를 못 넘기는 것을 놓친다 —
       실제로 그렇게 놓치고 있었다. */
    const bgs = [paper, '#FFFFFF', '#E4F0EF', '#EEF0EA', '#FBEBE9'];
    bgs.forEach(bg => {
      assert(ratio(sub, bg) >= 4.5, '--sub 가 ' + bg + ' 위에서 ' + ratio(sub,bg).toFixed(2) + ':1');
      assert(ratio(faint, bg) >= 4.5, '--faint 가 ' + bg + ' 위에서 ' + ratio(faint,bg).toFixed(2) + ':1');
    });
    /* 놋쇠색은 두 가지로 쓰인다 — 흰 글씨를 얹는 바탕, 그리고 크림 위의 글씨. */
    const brass = (src.match(/#85682F/) || [])[0];
    assert(brass, '놋쇠색이 바뀌었다면 아래 두 조건을 다시 재세요');
    assert(ratio('#FFFFFF', brass) >= 4.5, '놋쇠 바탕에 흰 글씨 ' + ratio('#FFFFFF',brass).toFixed(2) + ':1');
    assert(ratio(brass, '#F5EEDF') >= 4.5, '크림 위 놋쇠 글씨 ' + ratio(brass,'#F5EEDF').toFixed(2) + ':1');
    /* 반투명 머리는 밑으로 지나가는 내용에 따라 대비가 달라진다. 늘 같아야 한다. */
    assert(/header\{[^}]*background:var\(--paper\)/.test(src), '머리가 반투명으로 되돌아갔다');
  });

  /* 예전에는 반 평균보다 높고 80점을 넘어야만 석차가 떴다 — 어려워하는 아이의
     학부모는 우리 아이가 어디쯤인지 영영 못 봤다. */
  await test('report · 석차는 잘한 학생만 보는 것이 아니다', async page => {
    await page.goto(BASE + 'report.html');
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({
      low:  showRank({ n: 12, score: 41, avg: 78, per100: 92 }),
      high: showRank({ n: 12, score: 95, avg: 78, per100: 5 }),
      few:  showRank({ n: 3,  score: 95, avg: 78, per100: 5 }),
      msgLow: rankMsg({ score: 41, avg: 78, per100: 92 }),
      msgMid: rankMsg({ score: 70, avg: 78, per100: 62 }),
    }));
    assert(r.low === true, '아래쪽 학생에게 석차를 안 보여 준다');
    assert(r.high === true, '위쪽 학생에게도 보여야 한다');
    /* 다섯 명이 안 되면 '상위 50%' 가 뜻이 없고, 그 말이 곧 누구인지를 가리킨다. */
    assert(r.few === false, '사람이 적은데 석차를 보여 준다');
    /* 상위 92% 인 아이에게 '평균 부근입니다' 는 사실이 아니고, 사실이 아닌 말은
       나머지 문장까지 못 믿게 만든다. */
    assert(/아래쪽/.test(r.msgLow), '아래쪽 학생에게 사실대로 안 적는다: ' + r.msgLow);
    assert(/평균 부근/.test(r.msgLow) === false, '틀린 말을 적는다: ' + r.msgLow);
    assert(/가운데 아래/.test(r.msgMid), '중간 아래를 안 적는다: ' + r.msgMid);
    /* 가장 필요한 학생에게서 재시 단추가 사라지면 안 된다. */
    assert(/retakeCTA/.test(await page.evaluate(() => rankCard.toString())), '석차 카드에 재시 단추가 없다');
  });

  await test('report · 틀린 것 옆에 고칠 자료를 둔다', async page => {
    await page.route('**/materials.json', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ courses: [
        { key: 'ch2', name: '화학Ⅱ', rounds: [
          { round: 10, files: {
              munje: { html: 'munje_ch2_round10.html' },
              haeseol: { pdf: 'haeseol_ch2_round10.pdf' },      // HTML 이 없는 회차
              truthbook: { pdf: 'truthbooks/chem2_round10_truthbook_bw.pdf' } } },
          { round: 11, files: { munje: { html: 'munje_ch2_round11.html' } } } ] } ] }) }));
    await page.goto(BASE + 'report.html');                 // 데모(마지막 회차 10회 · ch2)
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => ({
      head: [].map.call(document.querySelectorAll('h2'), e => e.textContent)
              .filter(t => /이 회차 자료/.test(t))[0] || '',
      links: [].map.call(document.querySelectorAll('.matlink'),
                         e => [e.textContent, e.getAttribute('href')]),
    }));
    assert(/화학Ⅱ 10회/.test(m.head), '어느 회차 자료인지 안 적는다: ' + m.head);
    assert(m.links.length === 3, '자료 링크가 셋이 아니다: ' + JSON.stringify(m.links));
    /* 해설 HTML 이 없는 회차는 PDF 라고 적어야 한다 — 눌러 보고 알게 하지 않는다. */
    assert(/해설 \(PDF\)/.test(m.links[0][0]), '해설이 PDF 인 것을 안 적는다: ' + m.links[0][0]);
    assert(m.links[0][1] === 'haeseol_ch2_round10.pdf', '해설 주소가 틀렸다');
    /* 손가락으로 짚는 자리다. */
    const box = await page.$eval('.matlink', e => e.getBoundingClientRect().height);
    assert(box >= 36, '누를 자리가 좁다: ' + box);
    await assertNoOverflow(page, 'report-mats');
  });

  await test('report · 없는 자료 주소를 지어내지 않는다', async page => {
    /* 화학Ⅱ 는 문제지·OMR 이 18회까지 있는데 해설 HTML 은 7회까지뿐이다.
       회차 번호로 이름을 지어내면 404 로 끝난다 — 목록에 있는 것만 건다. */
    await page.route('**/materials.json', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ courses: [ { key: 'ch2', name: '화학Ⅱ', rounds: [
        { round: 10, files: { munje: { html: 'munje_ch2_round10.html' } } } ] } ] }) }));
    await page.goto(BASE + 'report.html');
    await page.waitForTimeout(1800);
    const links = await page.evaluate(() =>
      [].map.call(document.querySelectorAll('.matlink'), e => e.textContent));
    assert(links.length === 1 && /문제지/.test(links[0]), '없는 자료를 걸었다: ' + JSON.stringify(links));
  });

  await test('report · 목록을 못 읽으면 칸을 접는다', async page => {
    /* 빈 링크를 보여 주느니 안 보여 준다. */
    await page.route('**/materials.json', route => route.abort());
    await page.goto(BASE + 'report.html');
    await page.waitForTimeout(1800);
    const n = await page.evaluate(() => document.querySelectorAll('.matlink').length);
    const heads = await page.evaluate(() =>
      [].map.call(document.querySelectorAll('h2'), e => e.textContent).filter(t => /이 회차 자료/.test(t)).length);
    assert(n === 0 && heads === 0, '목록도 없이 칸이 떴다');
    /* 나머지 성적표는 그대로 살아 있어야 한다. */
    assert(await page.$eval('#app', e => e.textContent.length) > 500, '성적표가 통째로 죽었다');
  });

  await test('report · 점수는 소수 둘째 자리까지', async page => {
    await page.goto(BASE + 'report.html'); await page.waitForTimeout(1400);

    // 실제로 신고된 값과, 흔한 경계들
    const got = await page.evaluate(() => [
      pt(0.29999999999999716), pt(85), pt(0), pt(-0.29999999999999716),
      pt(79.995), pt(1 / 3), pt(null), pt(''),
    ]);
    assert(got[0] === '0.30', '0.2999… → ' + got[0]);
    assert(got[1] === '85.00', '정수도 두 자리로 → ' + got[1]);
    assert(got[2] === '0.00', '0 → ' + got[2]);
    assert(got[3] === '-0.30', '음수 → ' + got[3]);
    assert(got[5] === '0.33', '1/3 → ' + got[5]);
    assert(got[6] === null && got[7] === '', '빈 값은 그대로 둔다');

    /* 화면에 나간 문장을 직접 본다. 본문 전체를 정규식으로 훑으면 SVG 라벨이
       서로 붙어 '0088.0082' 같은 가짜 일치가 생긴다 — 문장을 지목한다. */
    const text = await page.$eval('#app', e => e.textContent);
    const cls = text.match(/반 평균보다 [^점]*점/);
    if (cls) assert(/^반 평균보다 -?\d+\.\d{2}점$/.test(cls[0]), '반 평균 문구: ' + cls[0]);
    const near = text.match(/통과선까지 [^점]*점/);
    if (near) assert(/^통과선까지 -?\d+\.\d{2}점$/.test(near[0]), '통과선 문구: ' + near[0]);
    // 어디에도 소수 셋째 자리가 붙은 '…점' 은 없어야 한다
    const junk = (text.match(/\d+\.\d{3,}점/g) || []);
    assert(junk.length === 0, '찌꺼기가 남았다: ' + junk.slice(0, 3).join(', '));

    /* 그래프 안에 찍는 숫자만은 정수다. 점 위에 겹쳐 놓는 자리라 85.00 을
       그대로 쓰면 라벨끼리 붙어 읽히지 않는다. 본문·표는 위처럼 두 자리. */
    const ptc = await page.evaluate(() => [ptc(85), ptc(85.4), ptc(85.6), ptc(0), ptc(null)]);
    assert(ptc[0] === '85' && ptc[1] === '85' && ptc[2] === '86' && ptc[3] === '0',
           '그래프 라벨은 정수 → ' + ptc.join(','));
    assert(ptc[4] === null, '빈 값은 그대로 둔다');
    const svgNums = await page.$$eval('.chartwrap svg text',
      es => es.map(e => e.textContent).filter(t => /\d/.test(t)));
    assert(svgNums.length > 0, '추세 그래프에 숫자 라벨이 없다');
    const dotty = svgNums.filter(t => /\d\.\d/.test(t));
    assert(dotty.length === 0, '그래프 라벨에 소수가 남았다: ' + dotty.slice(0, 3).join(', '));
  });

  /* ── 8. 홈: 타일 링크 무결성 (가리키는 파일이 전부 존재) ── */
  /* ══════════════════════════════════════════════════════════════
     명단 화면: **못 물어본 것**과 **비어 있는 것**은 다른 일이다.

     여태 둘을 같게 봤다 — 서버에 못 물어봐도 기본 명단을 띄우고 "명단 저장을
     누르면 반영됩니다" 라고 안내했다. 그 상태에서 저장을 누르면 시트의 진짜
     명단(세 반 54명)이 기본 명단으로 **덮어써진다.** 한 번 누르면 끝이다.

     실제로 그렇게 배너가 떴다. 서버도 명단도 멀쩡했고, 앱스크립트가 실행을
     한 줄로 세우는 동안 이 화면의 한 번뿐인 요청이 줄에 걸렸을 뿐이다.
     ══════════════════════════════════════════════════════════════ */
  await test('roster · 못 물어봤으면 저장을 막는다', async page => {
    let asked = 0;
    await page.route('**/macros/s/**', route => {
      if (/action=roster/.test(route.request().url()) && route.request().method() === 'GET') {
        asked++; return route.abort();          // 줄에 걸려 실패하는 상황
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto(BASE + 'roster.html');
    await page.waitForTimeout(4500);
    /* 한 번 실패했다고 포기하면 화면이 기본 명단으로 되돌아간다 — 몇 번 더 묻는다. */
    assert(asked >= 2, '한 번만 묻고 포기했다 (' + asked + '회)');
    const st = await page.evaluate(() => ({
      load: state.load,
      disabled: document.getElementById('save').disabled,
      bad: !!document.querySelector('#banner .banner.bad'),
      text: document.getElementById('banner').textContent,
      retry: !!document.getElementById('retry'),
      n: state.classes.length,
    }));
    assert(st.load === 'fail', '상태가 fail 이 아니다: ' + st.load);
    assert(st.disabled, '저장 단추가 안 잠겼다');
    assert(st.bad, '실패 배너가 안 뜬다');
    assert(/지금 물어보지 못했다/.test(st.text), '무엇이 보이는지 안 알려 준다');
    /* 옛 사본을 명단인 척 띄우지 않는다 — 그 화면이 저장 사고의 씨앗이었고,
       그 사본 자체가 공개 저장소에 박힌 아이들 실명이었다(2026-09-02). */
    assert(st.n === 0, '못 물어봤는데 명단이 보인다 (' + st.n + '반)');
    assert(st.retry, '다시 불러오는 길이 없다');

    /* 단추를 막아 뒀지만 스크립트로도 눌린다. 덮어쓰기는 되돌릴 수 없으므로
       문을 두 겹으로 잠근다 — 저장 요청이 **한 건도 나가면 안 된다.** */
    let posted = 0;
    await page.route('**/macros/s/**', route => {
      if (route.request().method() === 'POST') { posted++; }
      return route.abort();
    });
    await page.evaluate(() => save());
    await page.waitForTimeout(600);
    assert(posted === 0, '막아 뒀는데 저장이 나갔다 (' + posted + '건)');
  }, { adminGate: true });

  await test('roster · 서버가 비었다고 답하면 저장할 수 있다', async page => {
    await page.route('**/macros/s/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, classes: [] }) }));
    await page.goto(BASE + 'roster.html');
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({
      load: state.load,
      disabled: document.getElementById('save').disabled,
      bad: !!document.querySelector('#banner .banner.bad'),
      n: state.classes.length,
      text: document.getElementById('banner').textContent,
    }));
    /* 진짜 첫 설정이다 — 저장은 열어 두되, **명단을 지어내지 않는다.**
       예전에는 여기서 화면에 박아 둔 «기본 명단» 을 띄웠다. 그 명단은
       서버와 어긋난 옛 사본이었고(선생님이 그대로 저장하면 낡은 명단이
       서버에 박힌다), 무엇보다 실제 학생 여든한 명의 이름이 공개 저장소에
       그대로 실려 있었다(2026-09-02). 첫 설정 화면은 비어 있는 것이 맞다. */
    assert(st.load === 'empty', '상태가 empty 가 아니다: ' + st.load);
    assert(!st.disabled, '저장이 잠겨 있다 — 첫 설정을 못 한다');
    assert(!st.bad, '붉은 배너가 뜬다 — 실패가 아닌데');
    assert(st.n === 0, '없는 명단을 지어내 띄웠다 (' + st.n + '반)');
    assert(/아직 없습니다/.test(st.text), '첫 설정이라는 것을 안 알려 준다');
  }, { adminGate: true });

  await test('roster · 서버 명단이 오면 그것을 쓴다', async page => {
    await page.route('**/macros/s/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, classes: [
        { label: '화학1 일6-10', course: 'ch1', students: ['가나다', '라마바'], round: 7 } ] }) }));
    await page.goto(BASE + 'roster.html');
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({
      load: state.load, n: state.classes.length,
      first: state.classes[0] && state.classes[0].students.length,
      disabled: document.getElementById('save').disabled,
      banner: document.getElementById('banner').textContent.trim(),
    }));
    assert(st.load === 'ok', '상태가 ok 가 아니다: ' + st.load);
    assert(st.n === 1 && st.first === 2, '서버 명단을 안 썼다');
    assert(!st.disabled, '저장이 잠겨 있다');
    assert(st.banner === '', '멀쩡한데 배너가 뜬다: ' + st.banner);
  }, { adminGate: true });

  /* ══════════════════════════════════════════════════════════════
     **못 물어본 것**과 **그리다 넘어진 것**은 다르다 (2026-08-12)

     선생님이 「이번 주 미응시 현황 · 불러오지 못했습니다. (배포/권한 확인)」
     을 만나셨다. 재어 보니 배포도 권한도 멀쩡했다 — Apps Script 가 실행을
     한 줄로 세우는 동안 이 화면의 **한 번뿐인 요청**이 줄에 걸렸을 뿐이다.
     바로 위 «못 물어봤으면 저장을 막는다» 에서 이미 배운 병인데, 미응시
     현황만 맨 `fetch` 를 쓰고 있었다. 있는데 안 걸었다.

     그리고 저 문구는 **두 가지 다른 일에 같이 붙어 있었다.** 답을 잘 받아
     놓고 그리다 넘어져도 «배포/권한 확인» 이 떴다 — 그러면 선생님은 멀쩡한
     배포를 확인하러 가시고, 진짜 원인은 아무 데도 안 남는다.
     ══════════════════════════════════════════════════════════════ */
  {
    /* 앱스크립트가 내보내는 것과 **열 이름이 같은** 답 (computeAbsentees_). */
    const ABS = { ok: true, absentees: { generatedAt: '2026-08-12 09:00', classes: [
      { label: '화학1 목6-10', course: 'ch1', round: 3, absent: ['홍길동'],
        absentWho: [{ name: '홍길동', school: 'ㅇㅇ중' }], present: 4, total: 5 } ] } };

    await test('미응시 · 한 번 밀렸다고 포기하지 않는다', async page => {
      let asked = 0;
      await page.route('**/macros/s/**', route => {
        if (!/action=absentees/.test(route.request().url())) {
          return route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ ok: true, classes: [] }) });
        }
        asked++;
        if (asked <= 2) return route.abort();          // 줄에 걸린 두 번
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(ABS) });
      });
      await page.goto(BASE + 'roster.html');
      await page.waitForTimeout(1000);
      await page.evaluate(() => loadAbsentees());
      await page.waitForTimeout(4500);                 // 700 + 1400ms 쉰다
      const t = await page.evaluate(() =>
        document.getElementById('absbox').textContent.replace(/\s+/g, ' ').trim());
      assert(asked >= 3, '한 번만 묻고 포기했다 (' + asked + '회)');
      assert(/홍길동/.test(t), '다시 물어 받아 놓고 안 그렸다: ' + t.slice(0, 80));
      assert(/미응시 1 \/ 5명/.test(t), '숫자가 안 나온다: ' + t.slice(0, 80));
    }, { adminGate: true });

    await test('미응시 · 진짜 못 물어보면 없는 것처럼 말하지 않는다', async page => {
      await page.route('**/macros/s/**', route => {
        if (!/action=absentees/.test(route.request().url())) {
          return route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ ok: true, classes: [] }) });
        }
        return route.abort();
      });
      await page.goto(BASE + 'roster.html');
      await page.waitForTimeout(1000);
      await page.evaluate(() => loadAbsentees());
      await page.waitForTimeout(4500);
      const st = await page.evaluate(() => ({
        t: document.getElementById('absbox').textContent.replace(/\s+/g, ' ').trim(),
        retry: !!document.getElementById('absRetry'),
      }));
      /* 여기서 «미응시 0명» 이나 빈 화면을 보이면 선생님은 «다 봤구나» 로
         읽으신다. 못 물어본 것은 그렇게 읽히면 안 된다. */
      assert(/물어보지 못했습니다/.test(st.t), '무슨 일인지 안 알려 준다: ' + st.t.slice(0, 80));
      assert(/없다는 뜻이 아닙니다/.test(st.t), '없는 것으로 읽힐 수 있다: ' + st.t.slice(0, 80));
      assert(st.retry, '다시 불러오는 길이 없다');
    }, { adminGate: true });

    await test('미응시 · 그리다 넘어진 것을 배포 탓으로 돌리지 않는다', async page => {
      await page.route('**/macros/s/**', route => {
        if (!/action=absentees/.test(route.request().url())) {
          return route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ ok: true, classes: [] }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(ABS) });
      });
      await page.goto(BASE + 'roster.html');
      await page.waitForTimeout(1000);
      /* 그리는 자리를 일부러 넘어뜨린다 — 서버는 멀쩡히 답했다. */
      await page.evaluate(() => { window.esc = () => { throw new Error('그리다 넘어짐'); }; });
      /* ⚠ 여기서 `pageerror` 를 세면 안 된다. evaluate 로 부르면 튀어나온
         오류가 **그 약속에 담겨** 넘어오므로 페이지에서는 터지지 않는다.
         재려던 것은 «오류가 살아서 나오는가» 이니 그것을 바로 잡는다. */
      const thrown = await page.evaluate(async () => {
        try { await loadAbsentees(); return ''; } catch (e) { return String(e && e.message || e); }
      });
      const t = await page.evaluate(() =>
        document.getElementById('absbox').textContent.replace(/\s+/g, ' ').trim());
      assert(!/배포/.test(t) && !/권한/.test(t),
        '서버는 답했는데 배포·권한을 확인하라고 한다: ' + t.slice(0, 80));
      assert(/그리다 넘어짐/.test(thrown),
        '그리다 난 오류를 삼켰다 — 아무 데도 안 남는다 (' + (thrown || '아무것도 안 나옴') + ')');
    }, { adminGate: true });
  }

  /* 명단 화면에서 배운 것을 관리자 콘솔에도 건다. 여기도 읽기가 실패하면
     adminRows 를 빈 배열로 덮고 "저장된 실전 응시 0건" 을 띄우고 있었다 —
     선생님이 그것을 '아무도 안 봤다' 로 읽으면 엉뚱한 판단이 따라온다. */
  await test('admin · 못 물어본 것을 없는 것처럼 말하지 않는다', async page => {
    await page.route('**/macros/s/**', route => route.abort());
    await page.goto(BASE + 'admin.html');
    await page.waitForTimeout(4500);   // 세 번 물어보고 700·1400ms 쉰다
    const st = await page.evaluate(() => ({
      load: admLoad,
      rows: adminRows,
      banner: !!document.querySelector('#app .banner'),
      retry: !!document.querySelector('#app .banner button'),
      note: (document.querySelector('#app .note') || {}).textContent || '',
    }));
    assert(st.load === 'fail', '상태가 fail 이 아니다: ' + st.load);
    /* 빈 배열로 덮으면 아래 통계가 전부 0 이 된다. null 로 남겨야 한다. */
    assert(st.rows === null, '실패인데 기록을 빈 배열로 덮었다');
    assert(st.banner, '못 불러왔다는 말이 없다');
    assert(st.retry, '다시 불러오는 길이 없다');
    assert(!/0건/.test(st.note), '"0건" 이라고 말한다: ' + st.note);

    /* 못 읽은 상태의 제외 목록 위에서 저장하면 서버 쪽을 엉뚱하게 덮는다. */
    let posted = 0;
    await page.route('**/macros/s/**', route => {
      if (route.request().method() === 'POST') posted++;
      return route.abort();
    });
    await page.evaluate(() => { adminRound = { course: 'ch1', round: 1 }; toggleExclude('x', false); });
    await page.waitForTimeout(600);
    assert(posted === 0, '막아 뒀는데 저장이 나갔다 (' + posted + '건)');
  }, { adminGate: true });

  await test('home · 타일 링크 무결성', async page => {
    await page.goto(BASE + 'home.html'); await page.waitForTimeout(400);
    const hrefs = await page.$$eval('a.tile', as => as.map(a => a.getAttribute('href')));
    assert(hrefs.length >= 8, '타일 수 부족: ' + hrefs.length);
    for (const h of hrefs) {
      const st = await page.evaluate(u => fetch(u, { method: 'HEAD' }).then(r => r.status), BASE + h);
      assert(st === 200, '깨진 타일 링크: ' + h + ' (' + st + ')');
    }
    await assertNoOverflow(page, 'home');
  });

  /* ── 불투명 리포트 코드: 클라이언트(index/exam/hw)·서버(apps-script) 동일 알고리즘 보장 ──
     pubId 는 학교·이름을 추론 불가능한 14자 코드로 바꾼다. 네 파일의 구현이 조금이라도
     어긋나면 발송 링크와 서버 역조회가 맞지 않아 리포트가 안 열린다. 순수 JS 단위 검사. */
  {
    const t0 = Date.now(), name = 'pubId · 클라·서버 코드 일치';
    try {
      const SALT = 'chemistreal::s4lt::9f3Kq2026';
      function extract(file, fn) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const re = new RegExp('function ' + fn + '\\(key\\)\\{[\\s\\S]*?return[\\s\\S]*?\\}', 'm');
        const m = src.match(re);
        assert(m, file + ' 에서 ' + fn + ' 추출 실패');
        // eslint-disable-next-line no-new-func
        return new Function('LINK_SALT', 'linkSalt_', m[0] + '; return ' + fn + ';')(SALT, () => SALT);
      }
      const impls = [
        ['index.html', extract('index.html', 'pubId')],
        ['exam.html', extract('exam.html', 'pubId')],
        ['hw_grader.html', extract('hw_grader.html', 'pubId')],
        ['apps-script.gs', extract('apps-script.gs', 'pubId_')],
      ];
      const keys = ['한별중-성춘향', '과천두레중-이몽룡', '두레중-이몽룡', '대치초-홍길동', '서울고-김철수', ''];
      for (const k of keys) {
        const outs = impls.map(([, f]) => f(k));
        for (let i = 1; i < outs.length; i++) {
          assert(outs[i] === outs[0], impls[i][0] + ' 코드 불일치("' + k + '"): ' + outs[i] + ' ≠ ' + outs[0]);
        }
        if (k) {
          assert(/^[0-9a-z]{14}$/.test(outs[0]), '코드 형식 위반("' + k + '"): ' + outs[0]);
          assert(!/[가-힣]/.test(outs[0]) && outs[0].indexOf('-') < 0, '코드에 한글/하이픈 노출("' + k + '")');
        }
      }
      // 서로 다른 학생·학교는 서로 다른 코드
      const uniq = new Set(keys.filter(Boolean).map(k => impls[0][1](k)));
      assert(uniq.size === keys.filter(Boolean).length, '코드 충돌: 서로 다른 학생이 같은 코드');
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 같은 학생 자동 연결 + 오병합 방지: canonicalKey_ 결정 규칙 (서버 순수 로직 단위 검사) ── */
  {
    const t0 = Date.now(), name = 'canonicalKey · 학생 연결 규칙';
    try {
      const gs = fs.readFileSync(path.join(ROOT, 'apps-script.gs'), 'utf8');
      // function NAME ... { 균형 잡힌 중괄호까지 잘라낸다
      function grab(fn) {
        const at = gs.indexOf('function ' + fn);
        assert(at >= 0, fn + ' 없음');
        let i = gs.indexOf('{', at), depth = 0, j = i;
        for (; j < gs.length; j++) { const c = gs[j]; if (c === '{') depth++; else if (c === '}' && --depth === 0) { j++; break; } }
        return gs.slice(at, j);
      }
      const body = ['cleanName_', 'normSchool_', 'keyOf_', 'schoolCore_', 'schoolType_', 'schoolAkin_', 'canonicalKey_'].map(grab).join('\n');
      // studentIndex_ 는 시트를 읽으므로 테스트가 주입하는 인덱스로 대체
      const make = new Function('INDEX',
        body + '\nfunction studentIndex_(){ return INDEX; }\n' +
        'return { canonicalKey_: canonicalKey_, schoolAkin_: schoolAkin_, keyOf_: keyOf_ };');

      // schoolAkin_ 규칙
      const F = make({});
      assert(F.schoolAkin_('두레중', '과천두레중') === true, '포함관계 학교 미인식');
      assert(F.schoolAkin_('대치중', '청담중') === false, '무관 학교 오인식');
      assert(F.schoolAkin_('중', '과천두레중') === false, '2자 이하 공통 오연결(가드 실패)');
      assert(F.schoolAkin_('두레중', '문원고') === false, '중/고 구분 실패');
      assert(F.schoolAkin_('휘문', '휘문중') === true, '학교종류 접미 유무만 다른 경우 미인식(휘문/휘문중)');
      assert(F.schoolAkin_('휘문중', '휘문고') === false, '동일 지역명 다른 학교종류 오인식(휘문중/휘문고)');

      // 기존: 두레중-이몽룡 한 명. 과천두레중으로 다시 오면 그 키로 연결
      const idxOne = { '두레중-이몽룡': { name: '이몽룡', schools: ['두레중'] } };
      const A = make(idxOne);
      assert(A.canonicalKey_('이몽룡', '과천두레중') === '두레중-이몽룡', '포함관계 학생 자동 연결 실패');
      assert(A.canonicalKey_('이몽룡', '두레중') === '두레중-이몽룡', '동일 학교 연결 실패');
      assert(A.canonicalKey_('임꺽정', '두레중') === '두레중-임꺽정', '동명이 아닌 신규가 잘못 연결됨');
      assert(A.canonicalKey_('이몽룡', '단대부중') === '단대부중-이몽룡', '무관 학교인데 잘못 연결됨');

      // 오병합 방지: 같은 이름 이몽룡이 서로 다른(둘 다 포함관계) 학교로 이미 2명 → 연결하지 않음
      const idxAmb = {
        '동두레중-이몽룡': { name: '이몽룡', schools: ['동두레중'] },
        '서두레중-이몽룡': { name: '이몽룡', schools: ['서두레중'] },
      };
      const B = make(idxAmb);
      assert(B.canonicalKey_('이몽룡', '두레중') === '두레중-이몽룡', '모호(2명+)한데 임의 연결됨 — 분리 유지 실패');

      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 레거시 salt 하위호환: 빈 salt로 만든 옛 링크도 속성 설정 후 계속 열려야 한다 ── */
  {
    const t0 = Date.now(), name = 'salt · 레거시(빈) 링크 하위호환';
    try {
      const gs = fs.readFileSync(path.join(ROOT, 'apps-script.gs'), 'utf8');
      function grab(fn) {
        const at = gs.indexOf('function ' + fn);
        assert(at >= 0, fn + ' 없음');
        let i = gs.indexOf('{', at), depth = 0, j = i;
        for (; j < gs.length; j++) { const c = gs[j]; if (c === '{') depth++; else if (c === '}' && --depth === 0) { j++; break; } }
        return gs.slice(at, j);
      }
      const body = ['saltList_', 'pubIdS_', 'tokenForS_', 'pubMatch_', 'tokenOk_'].map(grab).join('\n');
      const make = new Function('SALT', body + '\nfunction linkSalt_(){ return SALT; }\n' +
        'return { pubIdS_: pubIdS_, tokenForS_: tokenForS_, pubMatch_: pubMatch_, tokenOk_: tokenOk_ };');
      const SALT = 'chemistreal::s4lt::9f3Kq2026';
      const S = make(SALT);
      const key = '한별중-성춘향';
      // 빈 salt(레거시)로 만든 코드/토큰이, 속성이 채워진 상태에서도 해석돼야 한다
      assert(S.pubMatch_(key, S.pubIdS_(key, '')) === true, '레거시(빈 salt) 코드가 안 열림');
      assert(S.pubMatch_(key, S.pubIdS_(key, SALT)) === true, '기본 salt 코드가 안 열림');
      assert(S.pubMatch_(key, 'zzzzzzzzzzzzzz') === false, '아무 코드나 열림(보안 구멍)');
      assert(S.tokenOk_(key, S.tokenForS_(key, '')) === true, '레거시 토큰이 안 열림');
      assert(S.tokenOk_(key, S.tokenForS_(key, SALT)) === true, '기본 토큰이 안 열림');
      assert(S.tokenOk_(key, 'zzzzzzzz') === false, '아무 토큰이나 열림(보안 구멍)');
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 채점 흐름: 회차 → 학생 → 시험지 → 채점 ──────────────────────
     수업은 회차 단위로 돈다 — 한 회차를 정해 놓고 학생을 차례로 채점한다.
     예전에는 학생부터 물어서, 학생마다 회차를 다시 골라야 했다.

     여기서 지키는 것:
     - 첫 화면이 회차다(학생 이름 없이도 고를 수 있다)
     - 회차를 고르면 학생, 학생을 넣으면 시험지, 그다음 채점
     - 둘째 학생부터는 시험지 화면을 건너뛴다(같은 회차를 또 볼 이유가 없다)
     - **이미 나간 응시 링크 모양이 그대로다**(학생에게 보낸 주소가 깨지면 안 된다) */
  await test('채점 흐름 · 회차 먼저 → 학생 나중', async (page) => {
    await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof S !== 'undefined' && S && S.view, null, { timeout: 20000 });
    assert(await page.evaluate(() => S.view) === 'select', '첫 화면이 회차가 아니다');
    assert(await page.evaluate(() => document.querySelector('#steps .step .lb').textContent) === '회차',
           '걸음 표시 첫 칸이 회차가 아니다');
    // 학생을 모르는 채로도 회차를 고를 수 있어야 한다
    assert(await page.evaluate(() => document.querySelectorAll('.rgrid .rchip').length) > 0, '회차 칩이 없다');

    await page.evaluate(() => document.querySelector('.rgrid .rchip').click());
    await page.waitForFunction(() => S.view === 'id', null, { timeout: 20000 });
    assert(await page.evaluate(() => /고른 회차/.test(document.querySelector('#app').textContent)),
           '학생 화면에 고른 회차가 안 보인다');

    await page.fill('#f_name', '흐름테스트'); await page.fill('#f_school', '테스트중');
    await page.evaluate(() => saveId());
    await page.waitForFunction(() => S.view === 'pdf', null, { timeout: 20000 });
    /* 이 주소는 학생에게 이미 나갔다. 모양이 바뀌면 받은 링크가 깨진다. */
    const link = await page.evaluate(() => document.getElementById('examUrl').textContent.trim());
    assert(/exam\.html\?c=[a-z0-9]+&r=\d+$/.test(link), '응시 링크 모양이 바뀌었다: ' + link);

    // 둘째 학생: 같은 회차 시험지를 또 보여 주지 않는다
    await page.evaluate(() => { S.name = ''; S.school = ''; go('id'); });
    await page.fill('#f_name', '둘째'); await page.fill('#f_school', '테스트중');
    await page.evaluate(() => saveId());
    await page.waitForFunction(() => S.view === 'grade', null, { timeout: 20000 });
  }, { adminGate: true, viewport: { width: 900, height: 900 } });

  /* ── 구간 종합 보고서 (?seg=1-4) ────────────────────────────────
     구간을 자를 때 가장 흔한 거짓말 둘을 기계가 막는다.
     ① 미응시를 지우지 않는다 — 세 회차만 본 학생의 문서가 «넉 달 다 봤다»
        로 읽히면 안 된다.
     ② 구간 밖 회차를 끌어오지 않는다 — 5회 기록이 1~4회 종합에 섞이면
        학부모는 어느 숫자가 무엇인지 알 수 없다. */
  {
    const t0 = Date.now(), name = '구간 종합 · 미응시를 지우지 않고 구간 밖을 안 섞는다';
    try {
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const a = src.indexOf('function segStates(');
      const b = src.indexOf('async function segLedger(');
      assert(a > 0 && b > a, 'segStates 를 못 찾았다');
      const ctx = new Function('ORD',
        src.slice(a, b) + '\nreturn { segStates: segStates };'
      )(new Proxy({}, { get: (_o, k) => (String(k).match(/재/g) || []).length }));

      const R = (round, attempt, pass) => ({ course: 'ch1', round, attempt, pass, score: pass ? 90 : 60 });
      const rows = [
        R(1, '첫 응시', false), R(1, '재시', true),   // 재시로 통과
        R(2, '첫 응시', true),                        // 첫 응시 통과
        // 3회 없음 → 미응시
        R(4, '첫 응시', false),                       // 미달 · 재시 안 봄
        R(5, '첫 응시', true),                        // 구간 밖 — 섞이면 안 된다
      ];
      const st = ctx.segStates(rows, 'ch1', 1, 4);
      assert(st.length === 4, '구간 밖 회차가 섞였다: ' + st.length + '칸');
      assert(st.map(x => x.round).join(',') === '1,2,3,4', '회차가 어긋났다: ' + st.map(x => x.round));
      const got = st.map(x => x.state).join(',');
      assert(got === 'repass,pass,miss,need', '상태가 어긋났다: ' + got);
      /* 안 본 회차가 목록에서 빠지면(=3칸만 나오면) 위 length 검사가 잡는다.
         여기서는 그 칸이 'miss' 로 **남아 있는지**를 한 번 더 못 박는다. */
      assert(st[2].state === 'miss', '미응시 회차가 사라졌다');
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 구간 클리닉이 같은 말을 세 번 하지 않는다 ───────────────────────
     같은 개념을 세 회차에서 틀린 학생은 같은 오개념 문장을 세 줄 연달아
     읽고 있었다. 「몇 번 걸렸나」가 안 보이고, 그 개념이 무엇인지 제대로
     설명해 주는 자리도 없었다(CORE 사전 867개가 놀고 있었다).

     여기서 못 박는 것:
     · 개념 이름은 묶음마다 **한 번만** 나온다
     · 그 개념의 설명(CORE)도 **한 번만** 나온다
     · 그런데 문항 줄은 **틀린 수만큼** 다 나온다 — 묶었다고 감추면 안 된다
     · 몇 번 걸렸는지, 어느 회차였는지가 적힌다 */
  {
    const t0 = Date.now(), name = '구간 클리닉 · 개념은 한 번, 문항은 다, 시험에 나온 문장 그대로';
    try {
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const grab = (fn) => {
        const at = src.indexOf('function ' + fn + '(');
        assert(at > 0, fn + ' 를 못 찾았다');
        let i = src.indexOf('{', at), d = 0, j = i;
        for (; j < src.length; j++) {
          const c = src[j];
          if (c === '{') d++; else if (c === '}' && --d === 0) { j++; break; }
        }
        return src.slice(at, j);
      };
      const CORE = { '한계 반응물': '계수로 나눈 몫이 **가장 작은** 쪽이 먼저 떨어진다.' };
      /* 개념마다 강의 문을 하나 단다 — 문항마다 걸면 같은 문이 세 개 나란히 선다.
         여기서는 문이 붙는 **자리**만 보고, 어느 강의로 가는지는 lec_link.py 가 지킨다. */
      let lecCalls = 0;
      const ctx = new Function('rEsc', 'segNo', 'CORE', 'ONELINE', 'md', 'lecLinkHTML',
        grab('oneOf') + '\n' + grab('coreOf') + '\n' + grab('segClinicSec') + '\nreturn { segClinicSec: segClinicSec };'   // 한 줄 정리·핵심은 과목을 보는 oneOf·coreOf 로 찾는다(7단계 2차)
      )(x => String(x), n => String(n), CORE, {}, x => String(x),
        () => { lecCalls++; return '<a class="leclink">▶ 개념 강의 보기 ↗</a>'; });

      const q = (round, n, mis, fixed) => ({
        round, n, u: '양적관계', c: 'CH1-041', mis, key: 'O', got: 'X',
        ok: false, fixed: !!fixed, s: '문항 ' + round + '-' + n, f: '', w: '',
      });
      const J = { Q: [q(1, 3, '한계 반응물'), q(2, 7, '한계 반응물'), q(3, 5, '한계 반응물')] };
      const html = ctx.segClinicSec(J);

      const count = (needle) => html.split(needle).length - 1;
      assert(count('한계 반응물') === 1,
        '개념 이름이 ' + count('한계 반응물') + '번 나온다 — 한 번이어야 한다');
      assert(count('계수로 나눈 몫이') === 1,
        '개념 설명이 ' + count('계수로 나눈 몫이') + '번 나온다 — 한 번이어야 한다');
      assert(count('segqw') === 3, '문항 줄이 3개가 아니다: ' + count('segqw'));
      assert(html.indexOf('3문항') > 0, '몇 번 걸렸는지가 없다');
      assert(html.indexOf('1·2·3회') > 0, '어느 회차였는지가 없다');
      assert(lecCalls === 1, '강의 문을 개념당 한 번이 아니라 ' + lecCalls + '번 달았다');
      assert((html.split('class="leclink"').length - 1) === 1, '강의 문이 하나가 아니다');
      /* 설명이 아예 없는 개념도 조용히 서야 한다 — CORE 에 없으면 빈 칸을 안 만든다. */
      const J2 = { Q: [q(1, 1, '없는개념')] };
      const h2 = ctx.segClinicSec(J2);
      assert(h2.indexOf('segcore') < 0, '설명이 없는데 빈 설명 칸을 만들었다');
      assert(h2.indexOf('없는개념') > 0, '개념 이름이 빠졌다');

      /* O/X 시험이라 정답이 X 인 문항은 s 가 «틀린 문장», f 가 «바르게 고친 문장» 이다.
         회차 자료 2,760문항 가운데 1,025문항이 그렇다. f 만 보여 주면 학생은
         **시험에 없던 문장**을 문제인 줄 알고 읽는다 — 자기가 뭘 틀렸는지 알아볼 수 없다. */
      const qx = Object.assign(q(1, 9, '분자 종류'), {
        s: 'HCl은 일원자분자이다.', f: 'HCl은 이원자분자이다.', key: 'X', got: 'O',
      });
      const h3 = ctx.segClinicSec({ Q: [qx] });
      assert(h3.indexOf('HCl은 일원자분자이다.') > 0, '시험에 나온 문장이 빠졌다');
      assert(h3.indexOf('HCl은 이원자분자이다.') > 0, '고친 문장이 빠졌다');
      assert(h3.indexOf('바르게 고치면') > 0, '고친 문장에 이름표가 없다');
      assert(h3.indexOf('HCl은 일원자분자이다.') < h3.indexOf('HCl은 이원자분자이다.'),
        '고친 문장이 시험 문장보다 먼저 나온다');
      /* 참인 문장(정답 O)은 s 와 f 가 같다 — 같은 문장을 두 번 싣지 않는다. */
      const qo = Object.assign(q(1, 2, '분자 종류'), { s: '같은 문장', f: '같은 문장', key: 'O' });
      const h4 = ctx.segClinicSec({ Q: [qo] });
      assert(h4.split('같은 문장').length - 1 === 1, '같은 문장을 두 번 실었다');
      assert(h4.indexOf('바르게 고치면') < 0, '고칠 것이 없는데 고침 칸을 만들었다');

      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 구간 「재시에서 고침」 은 자리번호가 아니라 개념으로 맞댄다 ────────────
     재시는 **다른 문장**을 묻는다(buildRetake). 예전 segJoin 은 마지막 시도의 k번째 답을
     첫 응시 k번째 문항의 정답과 맞대서, 재시 k번째가 다른 문항인데도 절반은 우연히
     「고침」 이 됐다. 이제 재시 행이 같이 적어 둔 문항 서명(retakeCids·retakeKeys)으로
     개념 단위로 맞댄다.
       · 서명이 없는 옛 행: fixed 는 늘 false — 화면 어디에도 「재시에서 고침」 이 안 선다.
       · 서명이 있으면: 그 개념의 재시 문항이 **전부** 맞았을 때만 첫 응시 문항들에 fixed.
         하나라도 틀리면 아니다. 재시가 묻지 못한 개념(retakeUnasked)은 「재시에서 확인 못 함」. */
  {
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const grabFn = (fn) => {
      const at = src.indexOf('function ' + fn + '(');
      assert(at > 0, fn + ' 를 못 찾았다');
      const isAsync = src.slice(Math.max(0, at - 6), at) === 'async ';
      let i = src.indexOf('{', at), d = 0, j = i;
      for (; j < src.length; j++) { const c = src[j]; if (c === '{') d++; else if (c === '}' && --d === 0) { j++; break; } }
      return (isAsync ? 'async ' : '') + src.slice(at, j);
    };
    /* 첫 응시 6문항 · 개념 셋(A·B·C 두 문항씩). 정답 O X O X O X. */
    const ITEMS = [
      { n: '1-01', u: '단원', c: 'A', mis: '개념A', a: 'O', s: 'A1', f: 'A1', lvl: 1 },
      { n: '1-02', u: '단원', c: 'A', mis: '개념A', a: 'X', s: 'A2', f: 'A2고침', lvl: 2 },
      { n: '1-03', u: '단원', c: 'B', mis: '개념B', a: 'O', s: 'B1', f: 'B1', lvl: 1 },
      { n: '1-04', u: '단원', c: 'B', mis: '개념B', a: 'X', s: 'B2', f: 'B2고침', lvl: 3 },
      { n: '1-05', u: '단원', c: 'C', mis: '개념C', a: 'O', s: 'C1', f: 'C1', lvl: 1 },
      { n: '1-06', u: '단원', c: 'C', mis: '개념C', a: 'X', s: 'C2', f: 'C2고침', lvl: 2 },
    ];
    const mk = () => new Function('loadRoundItems', 'rptEstRates', 'seedSliceFor', 'rEsc', 'segNo', 'CORE', 'ONELINE', 'md', 'lecLinkHTML',
      grabFn('segJoin') + '\n' + grabFn('oneOf') + '\n' + grabFn('coreOf') + '\n' + grabFn('segClinicSec') + '\n' + grabFn('segTableSec')
      + '\nreturn { segJoin: segJoin, segClinicSec: segClinicSec, segTableSec: segTableSec };'
    )(async () => ITEMS.map(x => Object.assign({}, x)), () => [], () => null,
      x => String(x), n => String(n), {}, {}, x => String(x), () => '');
    const FIRST = { attempt: '첫 응시', answers: 'XXXXXX' };          // 1·3·5번(정답 O) 틀림 → A·B·C 한 문항씩
    const between = (html, a, b) => { const i = html.indexOf(a), j = html.indexOf(b); return (i >= 0 && j > i) ? html.slice(i, j) : null; };

    {
      const t0 = Date.now(), name = '구간 고침 · 옛 재시 행(문항 칸 없음)에는 「재시에서 고침」 이 아예 안 선다';
      try {
        const X = mk();
        /* 마지막 시도의 답이 자리마다 첫 응시 정답과 우연히 같다 — 예전 규칙이면 셋 다 「고침」 이 됐다. */
        const OLD = { attempt: '재시', answers: 'OXOXOX' };
        const J = await X.segJoin([{ round: 1, state: 'retry', first: FIRST, last: OLD, atts: [FIRST, OLD] }], 'ch1');
        assert(J.Q.length === 6, '문항이 6개가 아니다: ' + J.Q.length);
        assert(J.Q.every(q => q.fixed === false), '서명이 없는데 fixed 가 섰다: ' + JSON.stringify(J.Q.map(q => q.fixed)));
        assert(J.Q.every(q => q.unasked === false), 'retakeUnasked 가 없는데 unasked 가 섰다');
        assert(J.rounds[0].fixed.every(v => v === false), 'rounds[].fixed 가 섰다');
        const clinic = X.segClinicSec(J, 'ch1');
        assert(clinic.indexOf('재시에서 고침') < 0, '클리닉에 「재시에서 고침」 이 섰다');
        assert(clinic.indexOf('재시에서 확인 못 함') < 0, '클리닉에 「재시에서 확인 못 함」 이 섰다');
        assert(clinic.indexOf('바로잡았습니다') < 0, '클리닉 머리말이 「바로잡았습니다」 라고 한다');
        const table = X.segTableSec(J);
        assert(table.indexOf('재시에서 고침') < 0, '정오표 범례에 「재시에서 고침」 이 섰다');
        assert(table.indexOf('segcell fx') < 0, '정오표에 고침 칸이 있다');
        /* 서명이 있어도 답안 길이와 안 맞으면 옛 행과 같다 */
        const BAD = { attempt: '재시', answers: 'OXOXO', retakeCids: 'A,A,B,B,C', retakeKeys: 'OXOX' };
        const J2 = await X.segJoin([{ round: 1, state: 'retry', first: FIRST, last: BAD, atts: [FIRST, BAD] }], 'ch1');
        assert(J2.Q.every(q => q.fixed === false), '서명 길이가 안 맞는데 fixed 가 섰다');
        results.push({ name, ok: true, ms: Date.now() - t0 });
        console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
      } catch (e) {
        results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
        console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
      }
    }

    {
      const t0 = Date.now(), name = '구간 고침 · 재시 서명이 있으면 개념 단위로 — 전부 맞아야 고침, 못 물었으면 확인 못 함';
      try {
        const X = mk();
        /* 재시 5문항: A A B B D(채움) · 정답 O X O X O · 답 O X O O O
           → A 는 둘 다 맞음(고침) · B 는 4번째가 틀림(아님) · C 는 안 물음(retakeUnasked). */
        const NEW = { attempt: '재시', answers: 'OXOOO', retakeCids: 'A,A,B,B,D', retakeKeys: 'OXOXO', retakeUnasked: '개념C' };
        const J = await X.segJoin([{ round: 1, state: 'retry', first: FIRST, last: NEW, atts: [FIRST, NEW] }], 'ch1');
        const byC = {}; J.Q.forEach(q => { (byC[q.c] = byC[q.c] || []).push(q); });
        assert(byC.A.every(q => q.fixed === true), 'A 의 재시 문항이 전부 맞았는데 첫 응시 A 문항에 fixed 가 없다');
        assert(byC.B.every(q => q.fixed === false), 'B 의 재시 문항 하나가 틀렸는데 fixed 가 섰다');
        assert(byC.C.every(q => q.fixed === false && q.unasked === true), 'C 는 재시가 못 물었는데 unasked 가 아니다');
        assert(byC.A.every(q => q.unasked === false) && byC.B.every(q => q.unasked === false), '물어본 개념에 unasked 가 섰다');
        assert(J.rounds[0].fixed.join(',') === 'true,true,false,false,false,false', 'rounds[].fixed 가 개념 단위가 아니다: ' + J.rounds[0].fixed.join(','));
        const clinic = X.segClinicSec(J, 'ch1');
        const secA = between(clinic, '개념A', '개념B'), secB = between(clinic, '개념B', '개념C'), secC = clinic.slice(clinic.indexOf('개념C'));
        assert(secA && secA.indexOf('재시에서 고침') > 0, 'A 묶음에 「재시에서 고침」 이 없다');
        assert(secB && secB.indexOf('재시에서 고침') < 0 && secB.indexOf('확인 못 함') < 0, 'B 묶음에 고침·확인 못 함이 섰다');
        assert(secC.indexOf('재시에서 확인 못 함') > 0 && secC.indexOf('재시에서 고침') < 0, 'C 묶음에 「재시에서 확인 못 함」 이 없다');
        assert(/<b>1문항<\/b>은 같은 회차 재시에서 바로잡았습니다/.test(clinic), '머리말의 고침 수가 1 이 아니다');
        const table = X.segTableSec(J);
        /* 문항 칸에만 title(단원)이 있다 — 범례 칸은 안 센다. */
        const cells = table.match(/<span class="segcell (ok|fx|no)" title=/g) || [];
        const cls = cells.map(c => c.match(/segcell (\w+)/)[1]).join(',');
        assert(cls === 'fx,ok,no,ok,no,ok', '정오표 칸이 개념 단위가 아니다: ' + cls);
        assert(table.indexOf('재시에서 고침') > 0, '고침 칸이 있는데 범례에 「재시에서 고침」 이 없다');
        results.push({ name, ok: true, ms: Date.now() - t0 });
        console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
      } catch (e) {
        results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
        console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
      }
    }

    /* 재재시까지 본 학생 — 재시에서 맞힌 개념은 재재시에 다시 안 실린다(buildRetake 는 직전 시도
       오답만 다시 묻는다). 마지막 시도만 보면 그 개념이 「고침」 에서 빠진다. 개념마다 그것을
       마지막으로 물은 시도가 판정이고, 어느 시도에서도 안 물었을 때만 「확인 못 함」 이다. */
    {
      const t0 = Date.now(), name = '구간 고침 · 재재시까지 봤어도 재시에서 고친 개념은 「고침」, 판정은 마지막으로 물은 시도';
      try {
        const X = mk();
        /* 재시:   A A B B D · 정답 O X O X O · 답 O X O O O → A 고침 · B 아직 · C 못 물음
           재재시: B B C C   · 정답 O X O X   · 답 O X O O   → B 고침 · C 물었는데 틀림 */
        const R1 = { attempt: '재시', answers: 'OXOOO', retakeCids: 'A,A,B,B,D', retakeKeys: 'OXOXO', retakeUnasked: '개념C' };
        const R2 = { attempt: '재재시', answers: 'OXOO', retakeCids: 'B,B,C,C', retakeKeys: 'OXOX', retakeUnasked: '' };
        const J = await X.segJoin([{ round: 1, state: 'retry', first: FIRST, last: R2, atts: [FIRST, R1, R2] }], 'ch1');
        const byC = {}; J.Q.forEach(q => { (byC[q.c] = byC[q.c] || []).push(q); });
        assert(byC.A.every(q => q.fixed === true), '재시에서 고친 A 가 재재시 뒤에 「고침」 에서 빠졌다');
        assert(byC.B.every(q => q.fixed === true), '재재시에서 고친 B 가 「고침」 이 아니다');
        assert(byC.C.every(q => q.fixed === false && q.unasked === false), 'C 는 재재시가 물어서 틀렸는데 고침·확인 못 함이 섰다');
        assert(J.rounds[0].fixed.join(',') === 'true,true,true,true,false,false', 'rounds[].fixed 가 시도 전부를 안 본다: ' + J.rounds[0].fixed.join(','));
        const clinic = X.segClinicSec(J, 'ch1');
        const secA = between(clinic, '개념A', '개념B'), secC = clinic.slice(clinic.indexOf('개념C'));
        assert(secA && secA.indexOf('재시에서 고침') > 0, 'A 묶음에 「재시에서 고침」 이 없다');
        assert(secC.indexOf('확인 못 함') < 0 && secC.indexOf('재시에서 고침') < 0, 'C 묶음에 고침·확인 못 함이 섰다');
        /* 재시가 못 물은 C 를 재재시가 물어 맞히면 고침 — 「확인 못 함」 은 그 시도의 결과에 밀린다 */
        const R2b = { attempt: '재재시', answers: 'OXOX', retakeCids: 'B,B,C,C', retakeKeys: 'OXOX' };
        const J2 = await X.segJoin([{ round: 1, state: 'retry', first: FIRST, last: R2b, atts: [FIRST, R1, R2b] }], 'ch1');
        const byC2 = {}; J2.Q.forEach(q => { (byC2[q.c] = byC2[q.c] || []).push(q); });
        assert(byC2.C.every(q => q.fixed === true && q.unasked === false), '재재시에서 맞힌 C 가 고침이 아니거나 확인 못 함이 남았다');
        /* 재시에서 맞혔던 A 를 재재시가 다시 물어 틀리면 마지막 시도가 판정 — 고침이 아니다 */
        const R2c = { attempt: '재재시', answers: 'XXOX', retakeCids: 'A,A,C,C', retakeKeys: 'OXOX' };
        const J3 = await X.segJoin([{ round: 1, state: 'retry', first: FIRST, last: R2c, atts: [FIRST, R1, R2c] }], 'ch1');
        const byC3 = {}; J3.Q.forEach(q => { (byC3[q.c] = byC3[q.c] || []).push(q); });
        assert(byC3.A.every(q => q.fixed === false), '재재시에서 다시 틀린 A 가 「고침」 으로 남았다');
        assert(byC3.B.every(q => q.fixed === false && q.unasked === false), 'B 는 재시에서 틀린 채 재재시가 안 물었다 — 아직 틀림이어야 한다');
        assert(byC3.C.every(q => q.fixed === true), '재재시에서 맞힌 C 가 고침이 아니다');
        /* atts 없이 last 만 주는 옛 호출도 된다(마지막 시도만 본다) */
        const J4 = await X.segJoin([{ round: 1, state: 'retry', first: FIRST, last: R1 }], 'ch1');
        const byC4 = {}; J4.Q.forEach(q => { (byC4[q.c] = byC4[q.c] || []).push(q); });
        assert(byC4.A.every(q => q.fixed === true) && byC4.C.every(q => q.unasked === true), 'atts 없는 호출에서 last 를 안 본다');
        results.push({ name, ok: true, ms: Date.now() - t0 });
        console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
      } catch (e) {
        results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
        console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
      }
    }
  }

  /* ── 구간 석차는 구간 안의, 응시한, 사람이 충분한 회차만 ────────────────
     서버가 회차마다의 석차를 보내 준다(ranks). 구간 보고서는 그중에서
     ① 이 구간(from~to) 안이고 ② 이 학생이 응시했고 ③ 서버가 실제로 보낸
     회차만 실어야 한다. 사람이 다섯 명이 안 되는 회차는 서버가 아예 안 보내는데,
     그걸 빈칸으로 그리면 「0명 중 상위 —%」 같은 것이 학부모 화면에 나간다.
     또 옛 서버는 ranks 칸을 안 보낸다 — 그때는 절이 조용히 서지 않아야 한다. */
  {
    const t0 = Date.now(), name = '구간 석차 · 구간 안·응시한·인원이 찬 회차만 싣는다';
    try {
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const at = src.indexOf('function segRankSec(');
      assert(at > 0, 'segRankSec 을 못 찾았다');
      let i = src.indexOf('{', at), d = 0, j = i;
      for (; j < src.length; j++) { const c = src[j]; if (c === '{') d++; else if (c === '}' && --d === 0) { j++; break; } }
      const body = src.slice(at, j);
      const make = (RANKS) => new Function('RANKS', 'pt',
        body + '\nreturn { segRankSec: segRankSec };')(RANKS, v => String(v));

      const R = (round, per100, score, avg, n) => ({ course: 'ch1', round, per100, score, avg, n, sd: 10, dist: [] });
      const states = [
        { round: 5, state: 'pass' }, { round: 6, state: 'repass' },
        { round: 7, state: 'miss' }, { round: 8, state: 'need' },
      ];
      // 5·6·8 은 인원이 찼고, 7 은 미응시, 9 는 구간 밖
      const ctx = make([R(5, 40, 70, 68, 20), R(6, 30, 78, 70, 21), R(8, 18, 85, 71, 22), R(9, 12, 90, 72, 22)]);
      const html = ctx.segRankSec(states, 'ch1', 5, 8);
      const nCells = html.split('class="segrk"').length - 1;
      assert(nCells === 3, '회차 칸이 3개가 아니다: ' + nCells);
      assert(html.indexOf('>9회<') < 0 && html.indexOf('<b>9회</b>') < 0, '구간 밖 9회가 섞였다');
      assert(html.indexOf('<b>7회</b>') < 0, '미응시 7회를 실었다');
      assert(/40% → 18%/.test(html) || html.indexOf('40') > 0, '구간 안 이동을 안 적었다');
      assert(/22%p 올라왔습니다/.test(html), '올라온 폭을 안 적었다: ' + (html.match(/[0-9]+%p[^<]*/) || [''])[0]);

      // 인원이 모자라 서버가 안 보낸 회차 — 빈칸을 그리지 않고 글로 적는다
      const ctx2 = make([R(5, 40, 70, 68, 20), R(8, 18, 85, 71, 22)]);
      const h2 = ctx2.segRankSec([{ round: 5, state: 'pass' }, { round: 6, state: 'pass' },
                                  { round: 7, state: 'pass' }, { round: 8, state: 'pass' }], 'ch1', 5, 8);
      assert((h2.split('class="segrk"').length - 1) === 2, '없는 회차를 칸으로 그렸다');
      assert(/6·7회는 응시 인원이 적어/.test(h2), '빠진 회차를 글로 안 적었다');

      // 옛 서버(ranks 없음) — 절이 아예 서지 않는다
      assert(make([]).segRankSec(states, 'ch1', 5, 8) === '', 'ranks 가 없는데 절을 세웠다');
      assert(make(null).segRankSec(states, 'ch1', 5, 8) === '', 'ranks 가 null 인데 절을 세웠다');

      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 구간 자료는 응시한 회차만 건다 ─────────────────────────────────
     안 본 회차의 해설을 걸어 두면 «봤는데 안 고쳤다» 로 읽힌다.
     그리고 평소 리포트의 자료 칸(matsCardHTML)은 latest.round 한 회차만 본다 —
     구간 보고서가 그걸 그대로 쓰면 네 회차 문서에 한 회차 링크만 실린다. */
  {
    const t0 = Date.now(), name = '구간 자료 · 응시한 회차만, 그리고 한 회차가 아니라 전부';
    try {
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const at = src.indexOf('function segMatsSec(');
      assert(at > 0, 'segMatsSec 을 못 찾았다');
      let i = src.indexOf('{', at), d = 0, j = i;
      for (; j < src.length; j++) { const c = src[j]; if (c === '{') d++; else if (c === '}' && --d === 0) { j++; break; } }
      const MATS = { courses: [{ key: 'ch1', rounds: [1, 2, 3, 4].map(r => ({ round: r, files: {
        haeseol: { html: 'h' + r + '.html' }, munje: { html: 'm' + r + '.html' },
        truthbook: { pdf: 't' + r + '.pdf' } } })) }] };
      const matsFor = (course, round) => {
        const c = MATS.courses.filter(x => x.key === course)[0]; if (!c) return null;
        const r = c.rounds.filter(x => Number(x.round) === Number(round))[0];
        return r ? r.files : null;
      };
      const ctx = new Function('rEsc', 'MATS', 'matsFor',
        src.slice(at, j) + '\nreturn { segMatsSec: segMatsSec };'
      )(x => String(x), MATS, matsFor);

      const states = [
        { round: 1, state: 'pass' }, { round: 2, state: 'repass' },
        { round: 3, state: 'miss' }, { round: 4, state: 'need' },
      ];
      const html = ctx.segMatsSec(states, 'ch1');
      assert(html.indexOf('h1.html') > 0 && html.indexOf('h2.html') > 0 && html.indexOf('h4.html') > 0,
        '응시한 회차의 해설이 빠졌다');
      assert(html.indexOf('h3.html') < 0, '미응시 회차(3회)의 자료를 걸었다');
      const nRows = html.split('class="segmat"').length - 1;
      assert(nRows === 3, '회차 줄이 3개가 아니다: ' + nRows);
      assert(html.indexOf('3개 회차') > 0, '몇 회차분인지 안 적었다');
      assert(ctx.segMatsSec([{ round: 9, state: 'pass' }], 'ch1') === '',
        '자료가 없는 회차인데 빈 칸을 세웠다');
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 뿌리 진단은 문항이 아니라 개념을 센다 ───────────────────────────
     같은 개념을 네 번 틀린 것은 «약점 네 개» 가 아니라 하나다. 문항으로 세면
     「오답 20개가 뿌리 둘로」 같은 문장이 부풀려진다.
     그리고 개념코드(c)가 없으면 이 절은 아예 서면 안 된다 — 회차 파일에
     개념코드가 없는 옛 회차가 있고, 그때 「CH1-034」 같은 코드가 학부모
     화면에 나가면 안 된다. */
  {
    const t0 = Date.now(), name = '뿌리 진단 · 개념 수로 세고, 개념코드가 없으면 서지 않는다';
    try {
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const at = src.indexOf('function segRootSec(');
      assert(at > 0, 'segRootSec 을 못 찾았다');
      let i = src.indexOf('{', at), d = 0, j = i;
      for (; j < src.length; j++) { const c = src[j]; if (c === '{') d++; else if (c === '}' && --d === 0) { j++; break; } }
      let seen = null;
      const ctx = new Function('rEsc', 'dxDeepHTML',
        src.slice(at, j) + '\nreturn { segRootSec: segRootSec };'
      )(x => String(x), (nm, dx) => { seen = dx.wrongConcepts; return '<div id="dx"></div>'; });

      const q = (c, mis) => ({ ok: false, c, u: '양적관계', mis });
      // 같은 개념 넷 + 다른 개념 둘 = 개념 3개
      const J = { Q: [q('A', 'a'), q('A', 'a'), q('A', 'a'), q('A', 'a'), q('B', 'b'), q('C', 'c')] };
      const html = ctx.segRootSec(J, '학생');
      assert(seen && seen.length === 3, '개념이 아니라 문항으로 셌다: ' + (seen ? seen.length : 'null'));
      assert(html.indexOf('개념 <b>3개</b>') > 0, '화면에 적힌 수가 개념 수가 아니다');
      // mis 가 비어도 개념코드를 화면에 내보내지 않는다
      seen = null;
      ctx.segRootSec({ Q: [q('CH1-034', ''), q('B', 'b'), q('C', 'c')] }, '학생');
      assert(seen[0].mis === '양적관계', 'mis 가 비었을 때 단원 이름으로 안 채웠다: ' + seen[0].mis);
      // 개념코드가 아예 없으면 절을 안 세운다
      const none = ctx.segRootSec({ Q: [{ ok: false, u: 'x', mis: 'y' }] }, '학생');
      assert(none === '', '개념코드가 없는데 절을 세웠다');

      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 첫 응시 라벨 ────────────────────────────────────────────────
     시트에 실제로 저장되는 첫 응시 라벨은 '첫 응시' 다(exam.html:822,
     index.html:305). 그런데 report.html 안에 인라인된 엔진이 한때 '정시'
     한 글자로만 찾아서, 학부모가 회차 카드를 눌러 여는 「N회 시점 상세
     리포트」의 첫 응시 점수가 통째로 null 이었다.

     ⚠ 이 검사가 있어야 하는 진짜 까닭: 그 화면의 데모 데이터(SYN)는 옛
       라벨 '정시' 라서, 데모로 도는 검사는 전부 초록불이고 **실제 학부모만
       깨진 문서를 받았다.** 그래서 여기서는 시트에 실제로 들어 있는 라벨로
       잰다. 세 라벨이 같은 값을 내야 한다. */
  {
    const t0 = Date.now(), name = "첫 응시 라벨 세 가지를 다 알아본다 ('첫 응시'·'정시'·'첫번째시험')";
    try {
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const a = src.indexOf('(function (root) {');
      const b = src.indexOf('root.ChemEngine = api;', a);
      assert(a > 0 && b > a, 'report.html 안에서 엔진을 못 찾았다');
      const code = src.slice(a, b) + 'root.ChemEngine = api; })(shim);';
      const shim = {};
      new Function('shim', code)(shim);
      const CE = shim.ChemEngine;
      assert(CE && CE.cumulative, 'ChemEngine.cumulative 가 없다');

      const rows = lab => ([
        { studentKey: '가상중-검사', course: 'ch1', round: 1, attempt: lab, score: 70, pass: false, wrongMis: [], units: [], date: '2026-08-01' },
        { studentKey: '가상중-검사', course: 'ch1', round: 1, attempt: '재시', score: 85, pass: true, wrongMis: [], units: [], date: '2026-08-02' },
        { studentKey: '가상중-검사', course: 'ch1', round: 2, attempt: lab, score: 90, pass: true, wrongMis: [], units: [], date: '2026-08-08' },
      ]);
      const first = lab => {
        const c = CE.cumulative(rows(lab));
        const A = c['가상중-검사'];
        assert(A && A.trend && A.trend.length === 2, lab + ': 회차가 2개로 안 잡혔다');
        return A.trend.slice().sort((x, y) => x.round - y.round).map(t => t.jeongsiScore);
      };
      const real = first('첫 응시'), legacy = first('정시'), old2 = first('첫번째시험');
      assert(real[0] === 70 && real[1] === 90,
             "'첫 응시' 로 저장된 점수를 못 읽는다 → " + JSON.stringify(real));
      assert(JSON.stringify(real) === JSON.stringify(legacy),
             "'첫 응시' 와 '정시' 가 다른 값을 낸다 → " + JSON.stringify(real) + ' vs ' + JSON.stringify(legacy));
      assert(JSON.stringify(real) === JSON.stringify(old2),
             "'첫번째시험' 이 다른 값을 낸다 → " + JSON.stringify(old2));
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 같은 엔진이 두 벌 있다 ─────────────────────────────────────
     위 검사는 **report.html 안에 박힌 사본**만 잰다. 그런데 엔진은 두 벌이다 —
     `chemengine.js` 는 index.html 이 불러 쓰고, 학생이 재시를 끝내면 그 자리에서
     보여 주는 리포트가 이것으로 계산된다. 2026-08-29 에 report.html 만 고쳐서
     이쪽은 '정시' 한 글자로 남아 있었고, 재시 직후 화면의 첫 응시 점수가
     통째로 null 이었다. **두 벌이면 두 벌 다 잰다.** */
  {
    const t0 = Date.now(), name = '공용 엔진(chemengine.js)도 첫 응시 라벨을 알아본다';
    try {
      delete require.cache[require.resolve(path.join(ROOT, 'chemengine.js'))];
      const CE = require(path.join(ROOT, 'chemengine.js'));
      assert(CE && CE.cumulative, 'chemengine.js 에 cumulative 가 없다');
      const rows = lab => ([
        { studentKey: '가상중-검사', course: 'ch1', round: 1, attempt: lab, score: 70, pass: false, wrongMis: [], units: [], date: '2026-08-01' },
        { studentKey: '가상중-검사', course: 'ch1', round: 1, attempt: '재시', score: 85, pass: true, wrongMis: [], units: [], date: '2026-08-02' },
      ]);
      const first = lab => {
        const A = CE.cumulative(rows(lab))['가상중-검사'];
        assert(A && A.trend && A.trend.length === 1, lab + ': 회차가 안 잡혔다');
        return A.trend[0].jeongsiScore;
      };
      assert(first('첫 응시') === 70, "'첫 응시' 점수를 못 읽는다 → " + first('첫 응시'));
      assert(first('정시') === 70, "'정시' 점수를 못 읽는다 → " + first('정시'));
      assert(first('첫번째시험') === 70, "'첫번째시험' 점수를 못 읽는다 → " + first('첫번째시험'));
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 화학1 기록을 화학1 심화로 잇는다(carryOver) ───────────────────
     학생 키는 과목과 무관해서 화학1 행이 같은 학생 기록에 이미 있다. 이름은 13개만 겹쳐서
     개념 코드 대응표(courses/ch1s/link_ch1.json)로 옮긴다. 실제 화학1 회차 파일로 가상 학생을 만들어
     ① 답안 자리 → 화학1 코드 → 심화 코드로 틀린 회차가 세어지는지 ② 세 회차 연속이면 고질로 넘어오는지
     ③ 재시 서명으로 «고침» 이 잡히는지 ④ 본 문장·틀린 문장이 넘어오는지 ⑤ 다른 과목 행은 안 섞이는지
     ⑥ 답안이 없는 옛 행은 오개념 이름으로 옮겨지는지 본다. */
  {
    const t0 = Date.now(), name = '화학1 기록이 화학1 심화 개념으로 이어진다(carryOver)';
    try {
      delete require.cache[require.resolve(path.join(ROOT, 'chemengine.js'))];
      const CE = require(path.join(ROOT, 'chemengine.js'));
      const link = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses/ch1s/link_ch1.json'), 'utf8'));
      const R = {};
      [5, 6, 7].forEach(r => { R['ch1#' + r] = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata/round_ch1_0' + r + '.json'), 'utf8')).jeongsi.items; });
      // 세 회차 모두에 나오는 심화 개념 하나
      const tsets = [5, 6, 7].map(r => new Set(R['ch1#' + r].map(x => link.map[x.c]).filter(Boolean)));
      const T = [...tsets[0]].find(t => tsets[1].has(t) && tsets[2].has(t));
      assert(T, '세 회차에 걸친 심화 개념이 없다');
      const ans = r => R['ch1#' + r].map(x => link.map[x.c] === T ? (x.a === 'O' ? 'X' : 'O') : x.a).join('');
      const K = '가상중-연결';
      const rows = [5, 6, 7].map(r => ({ studentKey: K, course: 'ch1', round: r, attempt: '첫 응시', answers: ans(r), wrongMis: [] }));
      const codes7 = R['ch1#7'].filter(x => link.map[x.c] === T).map(x => x.c);
      rows.push({ studentKey: K, course: 'ch1', round: 7, attempt: '재시', answers: codes7.map(() => 'O').join(''),
                  retakeCids: codes7.join(','), retakeKeys: codes7.map(() => 'O').join('') });
      rows.push({ studentKey: K, course: 'ch2', round: 5, attempt: '첫 응시', answers: 'X'.repeat(60), wrongMis: [] });
      rows.push({ studentKey: K, course: 'ch1s', round: 1, attempt: '첫 응시', answers: 'X'.repeat(60), wrongMis: [] });
      const out = CE.carryOver(rows, R, link);
      const o = out.concepts[T];
      assert(o && o.asked === 3 && o.wrong === 3, '틀린 회차 수가 안 맞다 → ' + JSON.stringify(o));
      assert(out.chronic.indexOf(T) >= 0, '세 회차 연속 틀린 개념이 고질로 안 넘어왔다');
      assert(o.fixed === true, '7회 재시에서 다 맞혔는데 고침이 아니다');
      assert(out.rounds.join() === '5,6,7', '다른 과목 행이 섞였다 → ' + out.rounds);
      const others = Object.values(out.concepts).filter(x => x.c !== T && x.wrong > 0);
      assert(!others.length, '맞힌 개념이 틀림으로 잡혔다 → ' + others.map(x => x.c));
      const wrongS = R['ch1#5'].find(x => link.map[x.c] === T).s;
      assert(out.seen[CE.norm(R['ch1#5'][0].s)] && out.wrongStmts[CE.norm(wrongS)], '본 문장·틀린 문장이 안 넘어왔다');
      const wrongSet = new Set([5, 6, 7].flatMap(r => R['ch1#' + r].filter(x => link.map[x.c] === T).map(x => CE.norm(x.s))));
      assert(Object.keys(out.wrongStmts).length === wrongSet.size, '틀린 문장 수가 다르다');   // 복습 칸은 같은 문장을 다시 낸다 — 서로 다른 문장으로 센다
      // 답안이 없는 옛 행: 오개념 이름으로
      const nm = Object.keys(link.mis)[0];
      const old = CE.carryOver([{ studentKey: K, course: 'ch1', round: 3, attempt: '정시', answers: '', wrongMis: [nm] }], {}, link);
      assert(old.concepts[link.mis[nm]] && old.concepts[link.mis[nm]].wrong === 1, '옛 행의 오개념 이름이 안 옮겨졌다');
      // 대응표 없음 → 빈 결과
      assert(Object.keys(CE.carryOver(rows, R, {}).concepts).length === 0, '대응표 없이도 무언가 넘어왔다');
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 문자에 실리는 이름 ──────────────────────────────────────────
     명단·시트의 이름 칸에 `홍길동 청운중` 처럼 학교가 붙어 있을 수 있다
     (명단에 두 명을 넣을 방법이 없던 때의 흔적). 그대로 실려 학부모에게
     "홍길동 청운중 학생" 이라고 나갔다 — 선생님이 받은 실물이 그랬다.
     문구를 짓는 **마지막 자리**에서 막는다. 여기가 마지막 관문이라 어디를
     거쳐 왔든 안 샌다. */
  {
    const t0 = Date.now(), name = '문자에는 이름까지만 (학교를 안 싣는다)';
    try {
      const src = fs.readFileSync(path.join(ROOT, 'pending.html'), 'utf8');
      const code = src.slice(src.indexOf('var SCHOOL_TAIL'), src.indexOf('function markSent'));
      /* 이 파일은 strict 라 with 를 못 쓴다. 함수 몸통만 떼어 새 함수로 만든다. */
      const ctx = new Function('COURSE',
        code + '\nreturn { justName:justName, shareMsg:shareMsg, passMsg:passMsg, absentMsg:absentMsg };'
      )({ ch1: '화학Ⅰ', ch2: '화학Ⅱ', gc: '일반화학' });
      const L = 'https://x/exam.html?c=ch1&r=7';
      const outs = [
        ctx.absentMsg({ name: '홍길동 청운중', course: 'ch1', round: 7, link: L }, '1'),
        ctx.absentMsg({ name: '홍길동 청운중', course: 'ch1', round: 7, link: L }, '2'),
        ctx.shareMsg({ name: '홍길동 백운중', course: 'ch1', round: 7, att: '정시',
                       score: 62, next: '재시', link: '' }, '1'),
        ctx.passMsg({ name: '홍길동(청운중)', course: 'ch1', round: 7, att: '정시',
                      score: 92, tries: 1, link: '' }),
      ];
      const dirty = outs.filter(o => /(내정|대청)/.test(o));
      assert(!dirty.length, '학교가 문구에 실렸다: ' + (dirty[0] || '').split('\n')[0]);
      assert(outs.every(o => o.indexOf('홍길동 학생') >= 0),
             "'홍길동 학생' 이 없다: " + outs.map(o => o.split('\n')[0]).join(' / '));
      /* 붙여 쓴 이름은 안 가른다 — 멀쩡한 이름이 잘리면 더 나쁘다. */
      assert(ctx.justName('홍길동청운중') === '홍길동청운중', '붙여 쓴 이름을 갈랐다');
      assert(ctx.justName('김 지완') === '김 지완', '짧은 이름을 갈랐다');
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  /* ── 성적표 · 틀린 문장 옆에 옳은 문장과 개념 설명이 있고, 그 카드가 위에 온다 ──
     학생은 성적표에서 자기가 틀린 문장을 맨 아래 한 곳에서만 봤고, 거기서도
     정답이 X 인 문항의 옳은 문장(f)과 개념 설명(CORE)이 안 찍혔다. 구간 보고서
     클리닉(segClinicSec)은 진작에 둘 다 찍고 있었다 — 같은 파일 안의 그 모양을
     평소 성적표(buildSolutions)로 가져온 것을 여기서 지킨다.

     답안이 저장된 학생을 시트 대신 흉내 낸다(rows 모킹 · handoff.js 와 같은 식).
     누적(cumulative)은 손으로 안 짓고 저장소의 chemengine 으로 계산한다 —
     화면이 실제로 받는 모양 그대로다. 문항은 저장소의 회차 파일에서 온다. */
  await test('report · 오개념 정리에 옳은 문장·개념 설명, 정오 카드는 단원별 정답률보다 위', async page => {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const loadItems = r => JSON.parse(fs.readFileSync(
      path.join(ROOT, 'appdata', 'round_ch1_0' + r + '.json'), 'utf8')).jeongsi.items;
    /* 고질은 «출제 3회 이상 · 절반 이상 틀림»(2026-09-28) — 세 회차를 보고 1회·3회에서 틀린다(2회는 물었지만 다 맞음).
       이번 회차(최근)는 3회다. I2 는 그 3회 문항이다. */
    const I1 = loadItems(1), IM = loadItems(2), I2 = loadItems(3);
    const hasCore = m => src.indexOf('"' + m + '": "') > 0;          // CORE 사전의 키 모양
    const isFix = it => it.a === 'X' && !!it.f && it.f !== it.s;   // 정답 X · 고친 문장 있음
    /* 세 회차에 다 나오는 개념 하나를 고른다 — 3회 쪽은 정답 X 에 고친 문장·설명이
       있는 문항이어야 (a) 를 잴 수 있다. 세 번 물어 두 번 틀리면 반복 오개념이다. */
    const in1 = {}; I1.forEach((it, i) => { (in1[it.mis] = in1[it.mis] || []).push(i); });
    const inM = {}; IM.forEach(it => { inM[CE.misCanon(it.mis)] = 1; });
    let c2 = -1;
    I2.forEach((it, i) => { if (c2 < 0 && isFix(it) && hasCore(it.mis) && in1[it.mis] && inM[it.mis] && CE.misCanon(it.mis) === it.mis) c2 = i; });
    assert(c2 >= 0, '세 회차에 같이 나오는 개념을 못 골랐다');
    const chronic = I2[c2].mis;
    const w1 = [in1[chronic][0]];
    I1.forEach((it, i) => { if (w1.length < 3 && isFix(it) && w1.indexOf(i) < 0) w1.push(i); });
    const w2 = [c2];
    I2.forEach((it, i) => { if (w2.length < 3 && isFix(it) && hasCore(it.mis) && w2.indexOf(i) < 0) w2.push(i); });
    const mkRow = (round, items, wrong) => {
      const ans = items.map((it, i) => wrong.indexOf(i) >= 0 ? (it.a === 'O' ? 'X' : 'O') : it.a).join('');
      const units = {};
      items.forEach((it, i) => { const u = units[it.u] || (units[it.u] = { u: it.u, t: 0, w: 0 }); u.t++; if (wrong.indexOf(i) >= 0) u.w++; });
      const score = Math.round(10000 * (items.length - wrong.length) / items.length) / 100;
      return { name: '정오점검', school: 'ㅇㅇ중', year: '2026', course: 'ch1', round: round, attempt: '첫 응시',
               score: score, pass: score >= 80, date: '2026-09-0' + round, answers: ans,
               wrongMis: wrong.map(i => items[i].mis), wrongAxes: {},
               units: Object.keys(units).map(k => units[k]), axes: [] };
    };
    const rows = [mkRow(1, I1, w1), mkRow(2, IM, []), mkRow(3, I2, w2)];
    const cum = CE.cumulative(rows); const A = cum[Object.keys(cum)[0]];
    assert((A.chronicMis || []).some(m => m.mis === chronic), '반복 오개념이 안 만들어졌다');
    await page.route('**/macros/s/**', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, student: 'x', rows: rows, excluded: [], cumulative: A, rank: null, cohort: null }) }));
    await page.goto(BASE + 'report.html?student=x');
    await page.waitForSelector('.card.sols .misgrp', { timeout: 20000 });

    /* (a) 오개념 정리: 개념마다 설명 한 번 · 정답 X 문항마다 「바르게 고치면 f」 · 예전 것도 그대로 */
    const xIt = I2[c2];
    const corePlain = await page.evaluate(m => (CORE[m] || '').replace(/\*\*/g, ''), chronic);
    assert(corePlain, 'CORE 에 없는 개념을 골랐다: ' + chronic);
    const sol = await page.evaluate(m => {
      const card = document.querySelector('.card.sols');
      const grp = [].slice.call(card.querySelectorAll('.misgrp')).find(g => g.querySelector('.misgrp-t').textContent === m);
      return {
        text: card.textContent,
        grpCores: grp ? [].slice.call(grp.querySelectorAll('.segcore')).map(e => e.textContent) : null,
        grpFix: grp ? [].slice.call(grp.querySelectorAll('.segqf')).map(e => e.textContent) : null,
        fold: (function () { const d = card.querySelector('details.oxfold'); return d ? { open: d.open, cells: d.querySelectorAll('.oxtable td').length } : null; })(),
        solh2InFold: !!card.querySelector('details .solh2'),
      };
    }, chronic);
    assert(sol.grpCores, '개념 묶음이 없다: ' + chronic);
    assert(sol.grpCores.length === 1, '개념 설명이 ' + sol.grpCores.length + '번 — 한 번이어야 한다');
    assert(sol.grpCores[0] === corePlain, '개념 설명이 CORE 와 다르다: ' + sol.grpCores[0].slice(0, 40));
    assert(sol.grpFix.some(t => t.indexOf('바르게 고치면') === 0 && t.indexOf(xIt.f) > 0), '「바르게 고치면 f」 가 없다');
    assert(sol.text.indexOf(xIt.s) > 0, '시험에 나온 문장(s)이 빠졌다');
    assert(sol.text.indexOf(xIt.s) < sol.text.indexOf(xIt.f), '고친 문장이 시험 문장보다 먼저 나온다');
    assert(/정답 X · 내 답 O/.test(sol.text.replace(/\s+/g, ' ')), '정답·내 답 줄이 빠졌다');
    assert(sol.text.indexOf('해설') > 0, '해설이 빠졌다');
    /* 답안이 있으면 1~60 격자는 접혀 있고, 오개념 정리는 접히지 않는다 */
    assert(sol.fold && !sol.fold.open && sol.fold.cells >= 60 * 3, '정답표가 접혀 있지 않다: ' + JSON.stringify(sol.fold));
    assert(!sol.solh2InFold, '오개념 정리가 접힘 안에 들어갔다');

    /* (b) 문항별 정오 카드가 「단원별 정답률」 카드보다 앞에 온다 */
    const order = await page.evaluate(() => {
      const sols = document.querySelector('.card.sols');
      const unit = [].slice.call(document.querySelectorAll('.card > h2')).filter(h => /단원별 정답률/.test(h.textContent))[0];
      const todo = document.querySelector('.card.todo');
      if (!sols || !unit) return { sols: !!sols, unit: !!unit };
      return { ok: true,
        beforeUnit: !!(sols.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING),
        afterTodo: !todo || !!(todo.compareDocumentPosition(sols) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    assert(order.ok, '카드를 못 찾았다: ' + JSON.stringify(order));
    assert(order.beforeUnit, '문항별 정오 카드가 단원별 정답률보다 뒤에 있다');
    assert(order.afterTodo, '문항별 정오 카드가 이번 주 확인할 개념보다 앞에 있다');

    /* 「다시 볼 개념」: 반복 오개념 아래 이번 회차에서 틀린 문장(O/X · X 면 f) */
    /* 「다음 단계 · 한 겹 더」 도 같은 개념 이름으로 .rx 를 세운다 — 카드를 먼저 고른다. */
    const rx = await page.evaluate(m => {
      const card = [].slice.call(document.querySelectorAll('.card')).filter(c => /다시 볼 개념/.test((c.querySelector('h2') || {}).textContent || ''))[0];
      const box = card ? [].slice.call(card.querySelectorAll('.rx')).filter(r => (r.querySelector('.nm') || {}).textContent === m)[0] : null;
      return box ? [].slice.call(box.querySelectorAll('.rxqi')).map(e => e.textContent) : null;
    }, chronic);
    assert(rx && rx.length >= 1 && rx.length <= 2, '다시 볼 개념에 틀린 문장이 없다: ' + JSON.stringify(rx));
    assert(rx[0].indexOf('정답 X') === 0 && rx[0].indexOf(xIt.s) > 0 && rx[0].indexOf('바르게 고치면') > 0 && rx[0].indexOf(xIt.f) > 0,
      '다시 볼 개념의 문장에 O/X·고친 문장이 없다: ' + rx[0].slice(0, 60));

    /* 「먼저 잡을 문항」 이 섰으면 줄마다 정답 O/X 가 있다 */
    const qp = await page.$$eval('.qprow', es => es.map(e => e.textContent));
    assert(qp.every(t => /· 정답 [OX]/.test(t)), '먼저 잡을 문항에 정답 O/X 가 없다');
    /* 이 시험은 cohort:null(반 응시 전)이다 — 그때 줄마다 서는 것은 「반 정답률 N%」 가 아니라
       출제 난이도 이름(기본·표준·심화)이다. 반 자료가 있을 때의 문구는 그대로다. */
    assert(qp.every(t => /출제 난이도 (기본|표준|심화)/.test(t)), '반 응시 전인데 줄에 출제 난이도 이름이 없다');
    assert(qp.every(t => !/반 정답률/.test(t)), '반 응시 전인데 「반 정답률」 이 섰다');

    /* Word 쪽(report_docx.js)이 읽는 자료: 기존 이름은 그대로, f · lvl · core 와 cores 가 더 실린다 */
    const wb = await page.evaluate(() => window.__wrongbook || null);
    assert(wb && wb.items.length === 3, '__wrongbook 이 화면과 다르다: ' + (wb ? wb.items.length : '없음'));
    wb.items.forEach(it => { ['n', 'mis', 's', 'a', 'mine', 'w', 'f', 'lvl', 'core'].forEach(k => assert(k in it, '__wrongbook 에 ' + k + ' 가 없다')); });
    const wbx = wb.items.filter(it => it.n === c2 + 1)[0];
    assert(wbx && wbx.f === xIt.f && wbx.a === 'X' && wbx.mine === 'O' && wbx.lvl === xIt.lvl, '__wrongbook 의 f·lvl 이 다르다');
    assert(wbx.core === corePlain && wb.cores && wb.cores[chronic] === corePlain, '__wrongbook 의 core 가 CORE 맨글과 다르다');
    assert(wb.items.every(it => it.a === 'X' ? it.f === (I2[it.n - 1].f !== I2[it.n - 1].s ? I2[it.n - 1].f : '') : it.f === ''), 'f 는 정답 X 문항에만 실려야 한다');
    /* (c) 자료에 기대는 표시 셋 — 회차 파일에 있는 것을 성적표가 쓴다.
       ① 난이도 뱃지: 오답 묶음의 문항 줄에 출제 난이도 이름(기본·표준·심화). 문항의 lvl 그대로. */
    const LV = { 1: '기본', 2: '표준', 3: '심화' };
    const badges = await page.evaluate(() => [].slice.call(document.querySelectorAll('.card.sols .sol .sol-h .freq')).map(e => e.textContent));
    assert(badges.length === 3 && badges.every(t => /^(기본|표준|심화)$/.test(t)), '오답 문항 줄의 난이도 뱃지가 3개가 아니거나 이름이 아니다: ' + JSON.stringify(badges));
    const xBadge = await page.evaluate(s => {
      const row = [].slice.call(document.querySelectorAll('.card.sols .sol')).filter(e => (e.querySelector('.sol-s') || {}).textContent === s)[0];
      return row ? (row.querySelector('.sol-h .freq') || {}).textContent : null;
    }, xIt.s);
    assert(xBadge === LV[xIt.lvl], '뱃지가 문항의 lvl 과 다르다: ' + xBadge + ' ≠ ' + LV[xIt.lvl]);
    /* ② 고질 분모: 「출제 M회 중 N회 틀림」 — 같은 개념이 1·2·3회 다 나오고 1·3회에서 틀렸으니 3회 중 2회.
          집계가 asked 를 같이 주면 그대로 쓰고, 없을 때만 회차 파일을 받아 센다(fillChronicDenom). */
    const M = [I1, IM, I2].filter(its => its.some(it => CE.misCanon(it.mis) === chronic)).length;
    assert(A.chronicMis.filter(m => m.mis === chronic)[0].asked === M, '집계의 asked 가 회차 파일로 센 분모와 다르다');
    const N = A.chronicMis.filter(m => m.mis === chronic)[0].rounds;
    await page.waitForFunction(m => { const e = document.querySelector('.rx .freq[data-mis="' + m + '"]'); return !!e && /출제 \d+회 중/.test(e.textContent); }, chronic, { timeout: 15000 });
    const freq = await page.$eval('.rx .freq[data-mis="' + chronic + '"]', e => e.textContent);
    assert(freq === '출제 ' + M + '회 중 ' + N + '회 틀림', '고질 분모가 다르다: ' + freq + ' (M=' + M + ', N=' + N + ')');
    assert(M >= N, '분모가 분자보다 작다: ' + M + ' < ' + N);
    /* ③ 복습 시점: 항목마다 이번 회차(3회) 문항에 그 개념이 실제로 나왔는지를 가른다. */
    const rv = await page.evaluate(() => [].slice.call(document.querySelectorAll('.rvrow')).map(e => ({ m: e.querySelector('.rvm').textContent, g: e.querySelector('.rvg').textContent })));
    const in2 = {}; I2.forEach(it => { in2[it.mis] = 1; });
    rv.forEach(r => {
      const want = in2[r.m] ? '이번 회차에 나옴' : '이번 회차엔 안 나옴 · 그래도 복습';
      assert(r.g.indexOf(want) > 0, '복습 시점 「' + r.m + '」 의 표시가 사실과 다르다: ' + r.g + ' (기대: ' + want + ')');
      assert(!(in2[r.m] && /안 나옴/.test(r.g)) && !(!in2[r.m] && /회차에 나옴/.test(r.g)), '나옴/안 나옴이 뒤집혔다: ' + r.g);
    });
    await assertNoOverflow(page, 'report-sols');
  });

  /* ── 갈린 이름의 고질 — 집계는 대표 이름으로 오는데 회차 파일은 원래 이름이다 ──
     chemengine.js 의 cumulative 는 '옥텟규칙' 을 대표 이름 '옥텟 규칙' 으로 세어 chronicMis 에
     '옥텟 규칙' 을 준다. 회차 파일의 문항은 여전히 '옥텟규칙' 이다. 이름을 글자로 맞대면
     「다시 볼 개념」 의 틀린 문장, 「이번 주 확인할 개념」 의 앵커 문장, 고질 분모가 그 개념에서만
     조용히 빈다 — 같은 화면의 「오개념 정리」 에는 그 문항이 서 있는데. 전부 misSame·misKeyIn
     으로 맞댄다. 지금 서버 집계(apps-script)는 이름을 안 바꿔 운영에서는 안 드러나고, 엔진 사본을
     합치는 날 드러난다 — 그 날을 위해 미리 잰다. */
  await test('report · 갈린 이름의 고질(옥텟규칙→옥텟 규칙)에도 틀린 문장·앵커·분모가 붙는다', async page => {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const loadItems = r => JSON.parse(fs.readFileSync(
      path.join(ROOT, 'appdata', 'round_ch1_0' + r + '.json'), 'utf8')).jeongsi.items;
    /* 고질은 «출제 3회 이상 · 절반 이상 틀림»(2026-09-28). 1·2·3회 모두 '옥텟규칙' 을 묻는다 — 1·3회에서 틀리고
       2회는 다 맞힌다. 이번 회차(최근)는 3회이고 I2 가 그 문항이다. */
    const I1 = loadItems(1), IM = loadItems(2), I2 = loadItems(3);
    const ALIAS = '옥텟규칙', CANON = CE.misCanon(ALIAS);
    assert(CANON !== ALIAS, '별칭이 아니다: ' + ALIAS);
    const idx = its => its.map((it, i) => it.mis === ALIAS ? i : -1).filter(i => i >= 0);
    const w1 = idx(I1), w2 = idx(I2);
    assert(w1.length && w2.length && idx(IM).length, '1·2·3회에 ' + ALIAS + ' 문항이 없다');
    const mkRow = (round, items, wrong) => {
      const ans = items.map((it, i) => wrong.indexOf(i) >= 0 ? (it.a === 'O' ? 'X' : 'O') : it.a).join('');
      const units = {};
      items.forEach((it, i) => { const u = units[it.u] || (units[it.u] = { u: it.u, t: 0, w: 0 }); u.t++; if (wrong.indexOf(i) >= 0) u.w++; });
      const score = Math.round(10000 * (items.length - wrong.length) / items.length) / 100;
      return { name: '별칭점검', school: 'ㅇㅇ중', year: '2026', course: 'ch1', round: round, attempt: '첫 응시',
               score: score, pass: score >= 80, date: '2026-09-0' + round, answers: ans,
               wrongMis: wrong.map(i => items[i].mis), wrongAxes: {},
               units: Object.keys(units).map(k => units[k]), axes: [] };
    };
    const rows = [mkRow(1, I1, w1), mkRow(2, IM, []), mkRow(3, I2, w2)];
    const cum = CE.cumulative(rows); const A = cum[Object.keys(cum)[0]];
    assert(A.chronicMis.length === 1 && A.chronicMis[0].mis === CANON, '집계가 대표 이름 하나로 오지 않았다: ' + JSON.stringify(A.chronicMis));
    await page.route('**/macros/s/**', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, student: 'x', rows: rows, excluded: [], cumulative: A, rank: null, cohort: null }) }));
    await page.goto(BASE + 'report.html?student=x');
    await page.waitForSelector('.ladder', { timeout: 20000 });
    /* 박힌 엔진 사본도 대표 이름 표를 내보낸다(tools/engine_sync.py --check 가 chemengine.js 와 같은지 잰다) */
    const eng = await page.evaluate(a => ({ has: !!(window.ChemEngine && ChemEngine.misCanon), canon: ChemEngine.misCanon(a) }), ALIAS);
    assert(eng.has && eng.canon === CANON, '성적표 안 엔진 사본에 misCanon 이 없거나 다르다: ' + JSON.stringify(eng));
    /* 「다시 볼 개념」: 이름은 대표 이름, 아래에 3회(이번 회차)에서 틀린 '옥텟규칙' 문장이 붙는다 */
    const rx = await page.evaluate(m => {
      const card = [].slice.call(document.querySelectorAll('.card')).filter(c => /다시 볼 개념/.test((c.querySelector('h2') || {}).textContent || ''))[0];
      const box = card ? [].slice.call(card.querySelectorAll('.rx')).filter(r => (r.querySelector('.nm') || {}).textContent === m)[0] : null;
      return box ? [].slice.call(box.querySelectorAll('.rxqi')).map(e => e.textContent) : null;
    }, CANON);
    assert(rx, '다시 볼 개념에 「' + CANON + '」 카드가 없다');
    assert(rx.length >= 1 && rx.some(t => t.indexOf(I2[w2[0]].s) > 0), '갈린 이름이라 틀린 문장이 안 붙었다: ' + JSON.stringify(rx));
    /* 「이번 주 확인할 개념」: 앵커 문장이 CORE 폴백이 아니라 3회 문항의 문장이다 */
    const a0 = I2[w2[0]];
    const todo = await page.evaluate(() => (document.querySelector('.card.todo') || {}).textContent || '');
    assert(todo.indexOf(a0.f || a0.s) >= 0, '갈린 이름이라 확인할 개념의 앵커가 회차 문장이 아니다');
    /* 고질 분모: 1·2·3회 모두 '옥텟규칙' 을 물었고 1·3회에서 틀렸다 → 출제 3회 중 2회 */
    await page.waitForFunction(m => { const e = document.querySelector('.rx .freq[data-mis="' + m + '"]'); return !!e && /출제 \d+회 중/.test(e.textContent); }, CANON, { timeout: 15000 });
    const freq = await page.$eval('.rx .freq[data-mis="' + CANON + '"]', e => e.textContent);
    assert(freq === '출제 3회 중 2회 틀림', '갈린 이름이라 고질 분모가 안 세졌다: ' + freq);
    /* 「한 겹 더」 의 ONELINE 폴백이 쓰는 첫 문장 떼기 — 소수점에서 안 자르고, 마침표 종류·나머지는 원문 그대로 */
    const rest = await page.evaluate(() => [restAfterFirst('몰농도 0.5 M 로 계산한다. 다음 문장. 끝'), restAfterFirst('마침표 없음'), restAfterFirst('가。나。다')]);
    assert(rest[0] === ' 다음 문장. 끝' && rest[1] === '마침표 없음' && rest[2] === '나。다', 'restAfterFirst 가 다르다: ' + JSON.stringify(rest));
  });

  /* ── 대표 이름으로 합쳐진 고질에도 강의 문이 남는다 (2026-09-11) ──
     서버 cumulative_ 와 엔진 cumulative·spacedReview 는 고질을 대표 이름(misCanon)으로 내는데, 강의 표
     (LECMAP·LECUNIT)는 회차 자료의 원본 이름으로 짜여 있다 — '결합 에너지 적용'·'결합 에너지로 ΔH' 는
     표에 있고 대표 이름 '결합 에너지' 는 없다. 서버가 이름을 합치기 시작한 날 「반복해서 막히는 곳」·
     「이번 주 확인할 개념」 의 「▶ 개념 강의 보기」 가 그 개념에서만 조용히 사라졌다. lecFor 가 대표 이름을
     표의 역방향(그 대표로 합쳐진 원본 이름)으로 되짚는다. 여기서 못 박는 것:
     · 표본 — 대표 이름은 표에 없고 원본 이름은 있는 개념으로 고질을 만들어 두 카드에 강의 문이 선다
       (그런 개념이 표에 다 들어가 하나도 안 남는 날엔 표에 있는 대표 이름으로 같은 화면을 잰다)
     · 전수 — 원본 이름 중 하나라도 강의가 있는 대표 이름은 어느 과목에서든 강의가 있고,
       어느 이름에도 강의가 없는 대표 이름에는 강의를 지어내지 않는다 */
  await test('report · 대표 이름으로 합쳐진 고질도 강의 링크가 남는다', async page => {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
    const LECMAP = JSON.parse(src.match(/\nconst LECMAP=(\{[^\n]*\});\n/)[1]);
    const reps = {};
    Object.keys(CE.MIS_CANON).forEach(k => { (reps[CE.MIS_CANON[k]] = reps[CE.MIS_CANON[k]] || []).push(k); });
    const merged = Object.keys(reps).filter(r => reps[r].some(k => LECMAP[k]));
    const rep = merged.find(r => !LECMAP[r]) || merged.find(r => LECMAP[r]);
    assert(rep, '원본 이름에 강의가 있는 대표 이름이 하나도 없다');
    const keys = reps[rep].filter(k => LECMAP[k]);
    const want = LECMAP[rep] || LECMAP[keys[0]];
    const K = '가상중-합침';
    const R = (round, mis) => ({ studentKey: K, name: '합침', school: '가상중', year: '2026', course: 'ch1', round, attempt: '첫 응시',
      score: 70, pass: false, date: '2026-08-0' + round, wrongMis: [mis], wrongAxes: {}, units: [], axes: [] });
    /* 고질은 «출제 3회 이상 · 절반 이상 틀림»(2026-09-28) — 세 회차에서 원본 이름을 번갈아 틀린다 */
    /* 마지막 회차는 통과로 둔다 — 통과 전이면 「이번 주 확인할 개념」 은 고질이 아니라 재시가 다시 묻는
       개념(원본 이름)을 가리킨다(선생님 결정 2026-09-28 · weekTarget). 여기서 재는 것은 고질의 강의 문이다. */
    const rows = [R(1, keys[0]), R(2, keys[keys.length - 1]), Object.assign(R(3, keys[0]), { score: 85, pass: true })];
    const A = CE.cumulative(rows)[K];
    assert(A.chronicMis.length === 1 && A.chronicMis[0].mis === rep, '집계가 대표 이름 하나로 오지 않았다: ' + JSON.stringify(A.chronicMis));
    await page.route('**/macros/s/**', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, student: 'x', rows: rows, excluded: [], cumulative: A, rank: null, cohort: null }) }));
    await page.goto(BASE + 'report.html?student=x');
    await page.waitForSelector('.ladder', { timeout: 20000 });
    /* (1) 「반복해서 막히는 곳」 카드 — 이름은 대표 이름, 강의 문은 원본 이름의 강의 */
    const rx = await page.evaluate(m => {
      const box = [].slice.call(document.querySelectorAll('.rx')).filter(r => (r.querySelector('.nm') || {}).textContent === m)[0];
      const a = box && box.querySelector('a.leclink');
      return { has: !!box, href: a ? a.getAttribute('href') : null, target: a ? a.getAttribute('target') : null };
    }, rep);
    assert(rx.has, '반복해서 막히는 곳에 「' + rep + '」 카드가 없다');
    /* 문 주소는 표의 주소에 ?from=dt&c=과목&r=최신 회차 를 #절 앞에 끼운 것이다(강의 쪽 띠 · 2026-09-28). */
    const wi = want.indexOf('#'), wantHref = (wi < 0 ? want : want.slice(0, wi)) + '?from=dt&c=ch1&r=3' + (wi < 0 ? '' : want.slice(wi));
    assert(rx.href === wantHref && rx.target === '_blank', '대표 이름으로 합쳐지자 강의 문이 사라졌다: ' + JSON.stringify(rx) + ' (기대 ' + wantHref + ')');
    /* (2) 「이번 주 확인할 개념」 도 같은 이름·같은 강의 */
    const todo = await page.evaluate(() => { const t = document.querySelector('.card.todo'); if (!t) return null;
      const a = t.querySelector('.todohead a.leclink'); return { mis: (t.querySelector('.todomis') || {}).textContent, href: a ? a.getAttribute('href') : null }; });
    assert(todo && todo.mis === rep && todo.href === wantHref, '확인할 개념의 강의 문이 없거나 다르다: ' + JSON.stringify(todo));
    /* (3) 전수 — 화면의 lecFor 로 모든 대표 이름을 잰다 */
    const all = await page.evaluate(rs => rs.map(r => [r, lecFor(r, 'ch1', ''), lecFor(r, 'ch2', '')]), Object.keys(reps));
    const missing = all.filter(x => merged.indexOf(x[0]) >= 0 && (!x[1] || !x[2])).map(x => x[0]);
    assert(!missing.length, '원본 이름엔 강의가 있는데 대표 이름엔 없다: ' + JSON.stringify(missing));
    const invented = all.filter(x => merged.indexOf(x[0]) < 0 && !LECMAP[x[0]] && (x[1] || x[2])).map(x => x[0]);
    assert(!invented.length, '어느 이름에도 강의가 없는 대표 이름에 강의를 지어냈다: ' + JSON.stringify(invented));
  });

  /* ── 성적표 문구 두 가지 ──
     ① latestWrong 은 그 회차에서 틀린 개념의 합집합이다. 통과 전에는 아직 잡은 게
        아니므로 「이번 회차에서 틀린 개념」 이라고 적는다. 통과했을 때만 「바로잡은 개념」.
     ② 반 자료가 없으면(cohort:null · 반 응시 전) 4분면의 가로축은 반 정답률이 아니라
        출제 난이도 prior 다. 그때 「반 대부분이 맞힌」 「반 정답률 N%」 가 서면 없는
        자료를 있다고 말하는 것이다. */
  {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const I1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_ch1_01.json'), 'utf8')).jeongsi.items;
    const firstN = n => I1.map((_, i) => i).slice(0, n);
    const mkRow = (attempt, wrong) => {
      const ans = I1.map((it, i) => wrong.indexOf(i) >= 0 ? (it.a === 'O' ? 'X' : 'O') : it.a).join('');
      const units = {};
      I1.forEach((it, i) => { const u = units[it.u] || (units[it.u] = { u: it.u, t: 0, w: 0 }); u.t++; if (wrong.indexOf(i) >= 0) u.w++; });
      const score = Math.round(10000 * (I1.length - wrong.length) / I1.length) / 100;
      return { name: '문구점검', school: 'ㅇㅇ중', year: '2026', course: 'ch1', round: 1, attempt: attempt,
               score: score, pass: score >= 80, date: '2026-09-01', answers: ans,
               wrongMis: wrong.map(i => I1[i].mis), wrongAxes: {},
               units: Object.keys(units).map(k => units[k]), axes: [] };
    };
    /* 같은 페이지에서 자료를 바꿔 다시 연다 — 경로는 한 번만 걸고 rows 만 갈아 끼운다. */
    let cur = [];
    const mockReport = page => page.route('**/macros/s/**', route => {
      const cum = CE.cumulative(cur); const A = cum[Object.keys(cum)[0]];
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, student: 'x', rows: cur, excluded: [], cumulative: A, rank: null, cohort: null }) });
    });
    const openReport = async page => {
      await page.goto(BASE + 'report.html?student=x');
      await page.waitForSelector('.ladder', { timeout: 20000 });
      return page.$eval('#app', e => e.textContent);
    };

    await test('report · 통과 못 한 회차는 「바로잡은 개념」 이 아니라 「틀린 개념」', async page => {
      await mockReport(page);
      cur = [mkRow('첫 응시', firstN(15))];                      // 45/60 = 75점 · 통과 전
      let txt = await openReport(page);
      assert(/통과 전/.test(txt), '통과 전 회차가 아니다');
      assert(/이번 회차에서 틀린 개념/.test(txt), '통과 전인데 「이번 회차에서 틀린 개념」 이 없다');
      assert(!/이번 회차에서 바로잡은 개념/.test(txt), '통과 전인데 「바로잡은 개념」 이라고 한다');
      /* 재시로 통과하면 지금 문구 그대로 */
      cur = [mkRow('첫 응시', firstN(15)), mkRow('재시', firstN(3))];  // 재시 95점 · 통과
      txt = await openReport(page);
      assert(/이번 회차에서 바로잡은 개념/.test(txt), '통과했는데 「바로잡은 개념」 이 없다');
      assert(!/이번 회차에서 틀린 개념/.test(txt), '통과했는데 「틀린 개념」 이라고 한다');
      /* 「바로잡은 개념」 은 첫 응시에서 틀렸고 통과한 재시에서는 안 틀린 것뿐이다 — 통과선이 80 이라
         통과한 시도에도 오답이 있고(여기서는 3문항), 그 개념은 바로잡은 것이 아니다. */
      const chipsOf = () => page.evaluate(() => {
        const lab = [].slice.call(document.querySelectorAll('.muted')).filter(e => /이번 회차에서 (바로잡은|틀린) 개념/.test(e.textContent))[0];
        return lab ? [].slice.call(lab.parentNode.querySelectorAll('span')).map(e => e.textContent) : null;
      });
      const uniq = a => a.filter((m, i) => a.indexOf(m) === i);
      const still = cur[1].wrongMis;
      let exp = uniq(cur[0].wrongMis).filter(m => still.indexOf(m) < 0);
      let chips = await chipsOf();
      assert(exp.length > 0 && chips && chips.join('|') === exp.join('|'), '바로잡은 개념이 「첫 응시 오답 − 통과 시도 오답」 이 아니다:\n  ' + (chips || []).join('|') + '\n  ' + exp.join('|'));
      assert(chips.every(m => still.indexOf(m) < 0), '통과한 재시에서도 틀린 개념이 「바로잡은」 에 들어 있다');
      /* 통과한 재시가 못 물은 개념(retakeUnasked)도 바로잡은 것이 아니다 */
      const un = uniq(cur[0].wrongMis).slice(0, 2);
      cur = [mkRow('첫 응시', firstN(15)), Object.assign(mkRow('재시', []), { retakeUnasked: un.join('|') })];   // 재시 100점
      txt = await openReport(page);
      exp = uniq(cur[0].wrongMis).filter(m => un.indexOf(m) < 0);
      chips = await chipsOf();
      assert(chips && chips.join('|') === exp.join('|'), '못 물은 개념이 「바로잡은」 에서 안 빠졌다:\n  ' + (chips || []).join('|') + '\n  ' + exp.join('|'));
      /* 첫 응시에서 바로 통과하면 앞 시도가 없다 — 그 오답을 「바로잡은 개념」 이라 부르지 않는다(칸 없음).
         그 오답은 「오개념 정리」 에 그대로 있다. */
      cur = [mkRow('첫 응시', firstN(5))];                        // 55/60 = 91.67 · 첫 응시 통과
      txt = await openReport(page);
      assert(/통과/.test(txt) && !/통과 전/.test(txt), '첫 응시 통과가 아니다');
      assert(!/이번 회차에서 바로잡은 개념/.test(txt) && !/이번 회차에서 틀린 개념/.test(txt), '첫 응시 통과인데 오답을 바로잡은·틀린 개념으로 적었다');
      await page.waitForSelector('.card.sols .misgrp', { timeout: 20000 });
      const sols = await page.$eval('.card.sols', e => e.textContent);
      assert(cur[0].wrongMis.every(m => sols.indexOf(m) >= 0), '첫 응시 통과의 오답이 오개념 정리에 없다');
    });

    await test('report · 반 응시 전(코호트 없음)에는 4분면이 반을 말하지 않는다', async page => {
      await mockReport(page);
      cur = [mkRow('첫 응시', firstN(15))];
      const txt = await openReport(page);
      await page.waitForSelector('.quad', { timeout: 20000 });
      assert(!/반 대부분이 맞힌/.test(txt), '반 자료가 없는데 「반 대부분이 맞힌」 이 섰다');
      assert(!/반 정답률/.test(txt), '반 자료가 없는데 「반 정답률」 이 섰다');
      const card = await page.evaluate(() => document.querySelector('.quad').closest('.card').textContent);
      assert(/반 응시 전/.test(card) && /출제 난이도/.test(card), '4분면 카드가 출제 난이도 기준이라고 말하지 않는다');
      const qs = await page.$$eval('.quad .qs', es => es.map(e => e.textContent));
      assert(qs.length === 4 && /^출제 난이도/.test(qs[0]) && /^출제 난이도/.test(qs[1]),
             '「틀림」 두 칸이 출제 난이도로 말하지 않는다: ' + qs.join(' | '));
      const qp = await page.$$eval('.qprow', es => es.map(e => e.textContent));
      assert(qp.length > 0 && qp.every(x => /출제 난이도 (기본|표준|심화)/.test(x)), '먼저 잡을 문항 줄에 출제 난이도 이름이 없다');
    });

    /* ── 「바로잡은 개념」 누적(ccum) 은 회차마다 「이번 회차」 카드와 같은 셈법이다 ──
       예전엔 회차마다 «첫 응시 오답 개념 수» 를 더했다 — 통과한 재시에서도 틀린 개념, 재시가 못 물은
       개념, 첫 응시에서 바로 통과해 고칠 기회가 없었던 회차의 오답까지 「바로잡았다」 고 셌다.
       이제 회차마다 fixedListOf(통과한 시도보다 앞 시도에서 틀렸고, 통과한 시도에서는 틀리지도
       못 묻지도 않은 개념)의 수를 더한다. 첫 응시 통과·통과 전 회차는 0. 0 이면 「N개 개념을
       바로잡았습니다」 문장·누적 그래프를 내지 않는다(0개를 바로잡았다고 쓰지 않는다). */
    await test('report · 「바로잡은 개념」 누적은 이번 회차 카드와 같은 셈법 · 0 이면 문장을 내지 않는다', async page => {
      await mockReport(page);
      const uniq = a => a.filter((m, i) => a.indexOf(m) === i);
      const journeyN = () => page.evaluate(() => {
        const m = (document.getElementById('app').textContent || '').match(/지금까지 (\d+)개 개념을 바로잡았습니다/);
        return m ? +m[1] : null;
      });
      const chipN = () => page.evaluate(() => {
        const lab = [].slice.call(document.querySelectorAll('.muted')).filter(e => /이번 회차에서 바로잡은 개념/.test(e.textContent))[0];
        return lab ? lab.parentNode.querySelectorAll('span').length : 0;
      });
      const cumSvg = () => page.$('svg[aria-label="바로잡은 개념 누적"]');
      /* ① 첫 응시 실패(오답 15) → 재시 통과(오답 3 · 그중 2는 첫 응시에도 틀림) */
      const RW = [0, 5, 20];                                                // 0·5 는 첫 응시(0~14)에도 틀림 · 20 은 재시에서만
      /* 재시가 못 물은 개념(retakeUnasked · '|' 구분) 하나 — 첫 응시에서 틀렸고 재시에선 안 틀렸지만
         「고침」 이 아니다(안 물었으니). 이번 회차 카드처럼 누적에서도 빠져야 한다. */
      const first = mkRow('첫 응시', firstN(15));
      const ru = uniq(first.wrongMis).filter(m => mkRow('재시', RW).wrongMis.indexOf(m) < 0)[0];
      const mkRetake = () => Object.assign(mkRow('재시', RW), { retakeUnasked: ru });   // 재시 57/60 = 95점 · 통과
      cur = [first, mkRetake()];
      let txt = await openReport(page);
      const still = cur[1].wrongMis, bad = still.concat([ru]);
      const same = (a, b) => CE.misCanon(a) === CE.misCanon(b);            // 화면의 misKeyIn 과 같은 맞대기
      const expNoRU = uniq(cur[0].wrongMis).filter(m => !still.some(b => same(b, m)));   // 첫 응시 오답 중 재시에서 안 틀린 개념
      const exp = uniq(cur[0].wrongMis).filter(m => !bad.some(b => same(b, m)));         // … 그중 재시가 물은 개념만
      assert(ru && exp.length > 0 && exp.length < expNoRU.length && expNoRU.length < uniq(cur[0].wrongMis).length && exp.length < cur[0].wrongMis.length,
             '검사 자료가 옛 셈법(첫 응시 오답 수)·못 물은 개념을 안 빼는 셈법·새 셈법을 가르지 못한다');
      let n = await journeyN();
      assert(n === exp.length, '여정 카드의 누적이 「첫 응시 오답 − 통과 시도 오답」 이 아니다: ' + n + ' (기대 ' + exp.length + ')');
      assert((await chipN()) === n, '이번 회차 카드의 바로잡은 개념 수와 누적이 어긋난다: ' + (await chipN()) + ' vs ' + n);
      assert(await cumSvg(), '바로잡은 개념 누적 그래프가 없다');
      /* ② 첫 응시 통과만 있는 학생 → 고칠 기회가 없었다 · 「바로잡았습니다」 문장이 없다 */
      cur = [mkRow('첫 응시', firstN(5))];                                    // 91.67점 · 첫 응시 통과
      txt = await openReport(page);
      assert(/통과/.test(txt) && !/통과 전/.test(txt), '첫 응시 통과가 아니다');
      assert(!/개념을 바로잡았/.test(txt), '첫 응시 통과뿐인데 「개념을 바로잡았습니다」 라고 한다');
      assert(!(await cumSvg()), '바로잡은 것이 없는데 누적 그래프가 있다');
      /* ③ 통과 못 한 회차 → 0 */
      cur = [mkRow('첫 응시', firstN(15))];                                   // 75점 · 통과 전
      txt = await openReport(page);
      assert(/통과 전/.test(txt) && !/개념을 바로잡았/.test(txt), '통과 전인데 「개념을 바로잡았습니다」 라고 한다');
      /* ④ 두 회차(1회 첫 응시 통과 · 2회 재시 통과) → 성장 카드의 「바로잡은 개념」 은 2회의 것만 · 라벨은 원래 말 */
      const asRound2 = rows => rows.map(r => Object.assign({}, r, { round: 2, date: '2026-09-08' }));
      cur = [mkRow('첫 응시', firstN(5))].concat(asRound2([mkRow('첫 응시', firstN(15)), mkRetake()]));
      txt = await openReport(page);
      const g = await page.evaluate(() => {
        const c = document.querySelector('.card.growth .gcell');
        return c ? { v: c.querySelector('.gv').textContent.trim(), l: c.querySelector('.gl').textContent.trim() } : null;
      });
      assert(g && g.l === '바로잡은 개념', '성장 카드 라벨이 「바로잡은 개념」 이 아니다: ' + JSON.stringify(g));
      assert(g.v === String(exp.length), '성장 카드의 바로잡은 개념 수가 2회에서 바로잡은 수(' + exp.length + ')가 아니다: ' + g.v);
      n = await journeyN();
      assert(n === exp.length && (await chipN()) === n, '두 회차 누적이 이번 회차 카드와 어긋난다: ' + n);
    });

    /* ── 근본 원인 진단 · 우연 기준선 ──
       deepDiagnose 는 뿌리 하나에 하류 오답 2개면 「토대 하나」 를 켠다. 그런데 회차 문항의
       개념 배치만으로도 이 정도 겹침은 흔해서, 무작위 오답 12개(통과선)에 81~97% 굵은 논제가
       떴다 — 학생이 실제로 그런지와 무관하게. 이제 같은 회차에서 무작위로 200번 뽑은 기준선
       (DX_CHANCE_Q 분위)을 넘을 때만 굵게 적는다.
       (a) 회차 파일에서 무작위 12개를 틀린 학생 → <b> 논제·수렴 캡션·사고 습관 글이 없고
           「단정하지 않습니다」 로 낮춰 적는다. 뿌리 막대(사실)는 남는다.
       (b) 뿌리 개념 + 그 하류 5개(ENGINE 의 pre 그래프로 고른다)를 틀린 학생 → 굵은 논제.
       둘 다 시드가 고정이라(학생키+회차) 새로고침·재실행에 같은 문장이 난다. 무작위 12개도
       고정 시드(1)로 섞어 뽑는다 — 1회차 문항 60개는 개념 32개라 12개를 뽑으면 하류 겹침의
       90% 분위가 8~9 이고, 이 뽑기의 관찰값은 5 라 어떤 시드로도 안 넘는다. */
    const ENG = (() => {
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const a = src.indexOf('const ENGINE='); assert(a > 0, 'ENGINE 을 못 찾았다');
      return new Function(src.slice(a, src.indexOf('\n', a)) + '\nreturn ENGINE;')();
    })();
    const dxSection = page => page.evaluate(() => {
      const r = document.querySelector('.dxroot'); if (!r) return null;
      const th = r.querySelector('.dxthesis');
      return { thesis: th ? th.textContent : '', bold: !!(th && th.querySelector('b')),
               cap: !!r.querySelector('.dxcap'), arc: !!r.querySelector('.dxarc'), bars: !!r.querySelector('.dxbars') };
    });

    await test('report · 근본 원인 진단 (a) 무작위 오답 12개는 굵은 논제를 내지 않는다', async page => {
      await mockReport(page);
      const rnd = (a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(1);
      const idx = I1.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      const wrong = idx.slice(0, 12).sort((x, y) => x - y);
      cur = [mkRow('첫 응시', wrong)];                                   // 48/60 = 80점
      await openReport(page);
      const dx = await dxSection(page);
      assert(dx, '근본 원인 진단 절이 없다');
      assert(!dx.bold, '무작위 오답인데 굵은 논제가 섰다: ' + dx.thesis);
      assert(/단정하지 않습니다/.test(dx.thesis), '낮춘 문구가 아니다: ' + dx.thesis);
      assert(/\d+번 중 \d+번/.test(dx.thesis), '우연 기준선 횟수(200번 중 K번)가 없다: ' + dx.thesis);
      assert(!/흩어진 (부주의|약점)가 아닙니다|흩어진 약점이 아니라/.test(dx.thesis), '단정 문구가 남아 있다: ' + dx.thesis);
      assert(!dx.cap, '기준선을 못 넘었는데 수렴 캡션이 있다');
      assert(!dx.arc, '기준선을 못 넘었는데 사고 습관 고정 글이 있다');
      assert(dx.bars, '뿌리 막대(사실)는 남아야 한다');
      /* 같은 자료로 다시 열어도 같은 문장 — 시드가 고정이다 */
      await openReport(page);
      const dx2 = await dxSection(page);
      assert(dx2 && dx2.thesis === dx.thesis, '새로고침에 문장이 달라졌다:\n' + dx.thesis + '\n' + dx2.thesis);
    });

    await test('report · 근본 원인 진단 (b) 뿌리 하나 + 하류 5개는 굵은 논제를 낸다', async page => {
      await mockReport(page);
      /* ENGINE 의 pre 그래프를 뒤집어 하류(deps)를 만들고, 1회차 안에서 하류가 5개 이상 되는 뿌리를 고른다. */
      const deps = {}; Object.keys(ENG).forEach(id => { deps[id] = []; });
      Object.keys(ENG).forEach(id => (ENG[id].pre || []).forEach(p => { if (deps[p]) deps[p].push(id); }));
      const down = id => { const s = new Set(), st = (deps[id] || []).slice(); while (st.length) { const x = st.pop(); if (s.has(x)) continue; s.add(x); (deps[x] || []).forEach(y => st.push(y)); } return s; };
      const inR = {}; I1.forEach((it, i) => { if (it.c && inR[it.c] == null) inR[it.c] = i; });
      let best = null;
      Object.keys(inR).forEach(c => { if (!ENG[c]) return; const dn = [...down(c)].filter(x => inR[x] != null); if (dn.length >= 5 && (!best || dn.length > best.dn.length)) best = { c, dn }; });
      assert(best, '1회차 안에 하류 5개 이상인 뿌리가 없다');
      const wrong = [best.c].concat(best.dn.slice(0, 5)).map(c => inR[c]);
      cur = [mkRow('첫 응시', wrong)];                                   // 54/60 = 90점
      await openReport(page);
      const dx = await dxSection(page);
      assert(dx, '근본 원인 진단 절이 없다');
      assert(dx.bold && /토대 하나/.test(dx.thesis), '뿌리+하류 5개인데 굵은 「토대 하나」 논제가 없다: ' + dx.thesis);
      assert(dx.thesis.indexOf(I1[inR[best.c]].mis) >= 0, '굵은 논제가 고른 뿌리를 가리키지 않는다: ' + dx.thesis);
      assert(!/단정하지 않습니다/.test(dx.thesis), '기준선을 넘었는데 낮춘 문구가 붙었다: ' + dx.thesis);
      assert(dx.cap && dx.arc && dx.bars, '기준선을 넘었는데 수렴 캡션·사고 습관 글·막대가 다 있지 않다');
    });
  }

  /* ── 재재시까지 떨어진 학생도 그냥 «재시 필요» ──
     예전에는 앱이 재재시 뒤 «강의록 복습 · 선생님과 1:1» 로 보냈고, 미응시 현황도 그 학생을
     «선생님과 1:1» 로 따로 묶었다. 선생님이 재시를 통과할 때까지 계속 내기로 했다(2026-09-28) —
     그 학생의 다음 시도는 재시 3차(시트 라벨 재재재시)이고, 다른 재시 필요 학생과 같은 줄에 선다. */
  await test('pending · 재재시까지 실패한 학생도 «재시 필요» 에 · 1:1 묶음 없음', async page => {
    await page.goto(BASE + 'pending.html?demo'); await page.waitForTimeout(500);
    const heads = await page.$$eval('.sec-h', es => es.map(e => e.textContent));
    assert(!heads.some(h => /1:1/.test(h)), '1:1 묶음 머리가 남아 있다: ' + heads.join(' | '));
    assert(!(await page.$('.stat.one')), '1:1 통계 칸이 남아 있다');
    const where = await page.evaluate(() => {
      const out = {}; let cur = '';
      [].slice.call(document.querySelectorAll('.sec-h, .row')).forEach(el => {
        if (el.classList.contains('sec-h')) { cur = el.textContent; return; }
        if (/데모학생/.test(el.textContent)) out.sec = cur, out.need = (el.querySelector('.rneed') || {}).textContent;
      });
      return out;
    });
    assert(/재시 필요/.test(where.sec || ''), '재재시 실패 학생이 «재시 필요» 아래에 없다: ' + where.sec);
    assert(where.need === '재시 3차 미응시', '다음 시도가 «재시 3차 미응시» 로 안 적혔다: ' + where.need);
    const act = await page.$eval('.stat.act .n', e => e.textContent);
    assert(act === '5', '재시 필요 수가 active 전원(5)이 아니다: ' + act);
    const body = await page.evaluate(() => document.body.innerText);
    assert(!/선생님과 1:1/.test(body), '화면에 «선생님과 1:1» 이 남아 있다');
    await assertNoOverflow(page, 'pending-no1on1');
  });

  /* ── 재시 링크 재진입 ────────────────────────────────────────────────
     enterRetake 는 시트에서 **첫 응시 행만** 읽고 attemptNo=1 로 두었다. 재시에
     떨어진 학생이 성적표 링크로 다시 들어오면 같은 게이트·같은 재시 문제지가
     다시 나오고(buildRetake 는 난수를 안 쓴다), 저장은 이전 재시 행을 덮어썼다.
     서버가 바쁘면 빈 catch 가 rows=[] 로 만들어 «기록을 찾지 못했습니다» 가 떴다.

     여기서는 시트 응답을 꾸며 넣고 화면이 어디로 가는지 본다. 재시 문항의 서명
     (retakeCids·retakeKeys)은 앱과 같은 엔진으로 미리 계산한다 — 같은 입력이면
     같은 결과라는 것이 이 복원의 전제다. */
  {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const FORMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'forms_bank.json'), 'utf8'));
    const RD = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_ch2_03.json'), 'utf8'));
    const flip = a => (a === 'O' ? 'X' : 'O');
    const items = RD.jeongsi.items;
    const ans1 = items.map((it, i) => (i % 3 === 0 ? flip(it.a) : it.a));          // 20개 틀림 → 66.7 미달
    const g1 = CE.gradeAttempt(ans1, items, RD.scoring), dx1 = CE.diagnose(g1, FORMS);
    const seen = {}, ws = {};
    items.forEach(it => { seen[CE.norm(it.s)] = 1; });
    g1.perItem.forEach((p, i) => { if (!p.ok) ws[CE.norm(items[i].s)] = 1; });
    CE.buildGate(dx1.wrongConcepts, FORMS, seen);                                   // 앱과 같은 차례: 게이트가 seen 을 먼저 쓴다
    const rt2 = CE.buildRetake(2, RD.retakeC, dx1.wrongConcepts.map(w => w.c).filter(Boolean), FORMS, seen, ws, CE.lvlOn(RD.course, RD.round) ? items : false);   // 앱과 같이: 새 회차만 정시 lvl 기준으로 쉬운 문장부터
    const sig = its => ({ cids: its.map(x => x.c || '').join(','), keys: its.map(x => (String(x.a).toUpperCase() === 'O' ? 'O' : 'X')).join('') });
    const s2 = sig(rt2.items);
    const ans2 = rt2.items.map((x, i) => (i % 4 === 0 ? flip(x.a) : x.a));          // 15개 틀림 → 75 미달
    const g2 = CE.gradeAttempt(ans2, rt2.items, RD.scoring), dx2 = CE.diagnose(g2, FORMS);
    g2.perItem.forEach((p, i) => { if (!p.ok) ws[CE.norm(rt2.items[i].s)] = 1; });
    CE.buildGate(dx2.wrongConcepts, FORMS, seen);
    const rt3 = CE.buildRetake(3, RD.retakeC, dx2.wrongConcepts.map(w => w.c).filter(Boolean), FORMS, seen, ws, CE.lvlOn(RD.course, RD.round) ? items : false);   // 앱과 같이: 새 회차만 정시 lvl 기준으로 쉬운 문장부터
    const s3 = sig(rt3.items);
    const ans3 = rt3.items.map((x, i) => (i % 5 === 0 ? flip(x.a) : x.a));          // 12개 틀림 → 80 … 통과선이라 하나 더
    ans3[1] = flip(rt3.items[1].a);                                                  // 13개 틀림 → 78.3 미달
    const g3 = CE.gradeAttempt(ans3, rt3.items, RD.scoring);
    assert(!g1.pass && !g2.pass && !g3.pass, '픽스처가 셋 다 미달이어야 한다: ' + [g1.score, g2.score, g3.score]);
    const KEY = '가상중-검사', LINK = 'https://example.test/report.html?student=abc';
    const row = (attempt, a, g, extra) => Object.assign({ name: '검사', reportLink: LINK, date: '2026-09-0' + (1 + (attempt.match(/재/g) || []).length) + 'T01:00:00Z',
      score: g.score, pass: g.pass, studentKey: KEY, school: '가상중', year: '2', course: 'ch2', round: 3, attempt,
      wrongMis: [], wrongAxes: {}, isTest: false, units: [], axes: [], answers: a.join('') }, extra || {});
    const FIRST = row('첫 응시', ans1, g1);
    const RETAKE = row('재시', ans2, g2, { retakeCids: s2.cids, retakeKeys: s2.keys, retakeUnasked: '' });
    const RERETAKE = row('재재시', ans3, g3, { retakeCids: s3.cids, retakeKeys: s3.keys, retakeUnasked: '' });
    const URL = BASE + 'index.html?retake=abcdef0123456&c=ch2&r=3';
    const mockRows = (page, rowsFn) => page.route('**/script.google.com/**', route => {
      const u = route.request().url();
      if (u.includes('student=')) {
        const rows = rowsFn();
        if (rows === null) return route.abort();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, student: KEY, rows, excluded: [], cumulative: null, rank: null, cohort: null }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated: false, reportLink: LINK }) });
    });
    const waitView = (page, v) => page.waitForFunction(x => typeof S !== 'undefined' && S && S.view === x, v, { timeout: 20000 });

    /* (a) 첫 응시 실패 + 재시 실패 → 다음은 재재시. 재시 문항을 다시 만들어 대조가 맞으면 재시 답안을 채점해 게이트를 세운다. */
    await test('재시 링크 · 재시 실패 뒤 다시 들어오면 재재시 (문항 복원)', async page => {
      const logs = [];
      page.on('console', m => { if (m.type() === 'info') logs.push(m.text()); });
      await mockRows(page, () => [FIRST, RETAKE]);
      await page.goto(URL); await waitView(page, 'gate');
      const st = await page.evaluate(() => ({ no: S.attemptNo, att: S.attempts.map(a => a.attempt), score: S.graded.score, n: S.keyItems.length, seen: Object.keys(S.seen).length }));
      assert(st.no === 2, '다음 시도 번호가 2(재재시)가 아니다: ' + st.no);
      assert(st.att.join(',') === '첫 응시,재시', '시도가 복원되지 않았다: ' + st.att);
      assert(st.score === g2.score, '게이트가 재시 기준이 아니다(점수 ' + st.score + ' ≠ ' + g2.score + ')');
      assert(st.n === 60, '재시 문항 60개가 복원되지 않았다: ' + st.n);
      assert(st.seen > 60, 'seen 이 정시 문항에 머물러 있다: ' + st.seen);
      assert(logs.some(t => /복원 첫 응시·재시/.test(t)), '무엇을 복원했는지 console.info 가 없다: ' + logs.join(' | '));
      const txt = await page.evaluate(() => document.body.innerText);
      assert(/강의록 확인/.test(txt) && !/강의록 복습/.test(txt), '재시 실패인데 복습 모드다');
      /* 게이트를 다 풀면 단추가 «재재시 시작» 이어야 한다 — «재시 시작» 이면 재방송이다. */
      await page.evaluate(() => { S.gate.gates.forEach(g => { g._unlocked = true; }); render(); });
      const btn = await page.$$eval('.btnrow button', bs => bs.map(b => b.textContent));
      assert(btn.some(t => /재재시 시작/.test(t)), '단추가 재재시가 아니다: ' + btn.join(' / '));
      assert(!btn.some(t => /^재시 시작$/.test(t)), '재시 재방송 단추가 있다');
    });

    /* (a′) 옛 행(retakeCids 없음)·대조 불일치면 문항은 못 되살리지만, 다음은 그래도 재재시다. */
    await test('재시 링크 · 옛 재시 행(문항 칸 없음)도 다음은 재재시', async page => {
      const logs = [];
      page.on('console', m => { if (m.type() === 'info') logs.push(m.text()); });
      const OLD = Object.assign({}, RETAKE); delete OLD.retakeCids; delete OLD.retakeKeys; delete OLD.retakeUnasked;
      await mockRows(page, () => [FIRST, OLD]);
      await page.goto(URL); await waitView(page, 'gate');
      const st = await page.evaluate(() => ({ no: S.attemptNo, att: S.attempts.map(a => a.attempt), score: S.graded.score, seen: Object.keys(S.seen).length }));
      assert(st.no === 2, '다음 시도 번호가 2 가 아니다: ' + st.no);
      assert(st.att.join(',') === '첫 응시,재시', '시도가 복원되지 않았다: ' + st.att);
      assert(st.score === g1.score, '옛 행인데 게이트가 정시 기준이 아니다');
      assert(logs.some(t => /못 함 재시\(옛 행/.test(t)), '못 되살린 것을 console.info 에 안 적었다: ' + logs.join(' | '));
      assert(logs.some(t => /재시 문장 미확보/.test(t)), '재시 문장을 못 확보했다고 console.info 에 안 적었다: ' + logs.join(' | '));
      /* 문항은 못 되살려도, 같은 엔진이면 같은 문항이라 다시 만든 재시 문장은 seen 에 들어가야 한다 —
         안 그러면 재재시가 틀린 개념 자리에 그 재시 문장을 글자까지 그대로 다시 낸다. */
      const sig2 = rt2.items.map(x => x.s);
      const chk = await page.evaluate(sig => {
        const N = ChemEngine.norm, inRt = {}; sig.forEach(x => { inRt[N(x)] = 1; });
        const allSeen = sig.every(x => !!S.seen[N(x)]);
        const seenBefore = Object.assign({}, S.seen);
        S.gate.gates.forEach(g => { g._unlocked = true; }); startRetake();
        const usedNow = {}; S.keyItems.forEach(x => { usedNow[N(x.s)] = 1; });
        /* 재시 문장이 다시 나온 자리는, 그 개념에 아직 안 본 form 이 남아 있었으면 안 된다(form 소진일 때만 허용) */
        const bad = S.keyItems.filter(x => inRt[N(x.s)] && FORMS[x.c] && (FORMS[x.c].forms || []).some(fm => !seenBefore[N(fm.s)] && !S.wrongStmts[N(fm.s)] && !usedNow[N(fm.s)]));
        const same = S.keyItems.filter(x => inRt[N(x.s)]).length;
        return { allSeen, bad: bad.map(x => x.c), same, no: S.attemptNo, view: S.view, txt: document.body.innerText };
      }, sig2);
      assert(chk.allSeen, '다시 만든 재시 문장이 seen 에 없다');
      assert(chk.no === 3 && chk.view === 'retake', '재재시 화면이 아니다: ' + JSON.stringify([chk.no, chk.view]));
      assert(chk.bad.length === 0, 'form 이 남았는데 재시 문장을 그대로 다시 낸 자리: ' + chk.bad.join(','));
      assert(chk.same < sig2.length / 4, '재재시가 재시 문장을 ' + chk.same + '/' + sig2.length + ' 그대로 다시 낸다');
      assert(/일부는 겹칠 수 있습니다/.test(chk.txt) && !/다른 문장으로 나옵니다/.test(chk.txt), '재시 문항을 못 확보했는데 «다른 문장으로 나옵니다» 를 약속한다');
      await mockRows(page, () => [FIRST, OLD]);
      await page.goto(URL); await waitView(page, 'gate');
      await page.evaluate(() => { S.gate.gates.forEach(g => { g._unlocked = true; }); render(); });
      const btn = await page.$$eval('.btnrow button', bs => bs.map(b => b.textContent));
      assert(btn.some(t => /재재시 시작/.test(t)), '단추가 재재시가 아니다: ' + btn.join(' / '));
      /* 대조 불일치도 같은 길 */
      const BAD = Object.assign({}, RETAKE, { retakeKeys: RETAKE.retakeKeys.split('').reverse().join('') });
      await mockRows(page, () => [FIRST, BAD]);
      await page.goto(URL); await waitView(page, 'gate');
      const st2 = await page.evaluate(() => ({ no: S.attemptNo, score: S.graded.score }));
      assert(st2.no === 2 && st2.score === g1.score, '대조 불일치인데 재시 기준으로 세웠다: ' + JSON.stringify(st2));
    });

    /* (b) 재재시까지 실패 → 다음은 재시 3차(시트 라벨 재재재시). 재시는 통과할 때까지 끝이 없다(선생님 결정
       2026-09-28) — 예전에는 여기서 «강의록 복습 · 선생님과 1:1» 로 끝냈다. 저장되는 라벨까지 본다. */
    const mockRowsPost = (page, rowsFn, posted) => page.route('**/script.google.com/**', route => {
      const req = route.request();
      if (req.method() === 'POST') { try { posted.push(JSON.parse(req.postData() || '{}')); } catch (e) {} return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated: false, reportLink: LINK }) }); }
      if (req.url().includes('student=')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, student: KEY, rows: rowsFn(), excluded: [], cumulative: null, rank: null, cohort: null }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    const waitPosts = (page, posted, n) => (async () => { for (let i = 0; i < 100 && posted.length < n; i++) await page.waitForTimeout(100); })();
    await test('재시 링크 · 재재시 실패 뒤 다시 들어오면 재시 3차 (재재재시로 저장)', async page => {
      const posted = [];
      await mockRowsPost(page, () => [FIRST, RETAKE, RERETAKE], posted);
      await page.goto(URL); await waitView(page, 'gate');
      const st = await page.evaluate(() => ({ no: S.attemptNo, att: S.attempts.map(a => a.attempt), score: S.graded.score }));
      assert(st.no === 3, '시도 번호가 3 이 아니다: ' + st.no);
      assert(st.att.join(',') === '첫 응시,재시,재재시', '시도가 복원되지 않았다: ' + st.att);
      assert(st.score === g3.score, '게이트가 재재시 기준이 아니다: ' + st.score + ' ≠ ' + g3.score);
      const txt = await page.evaluate(() => document.body.innerText);
      assert(/강의록 확인/.test(txt) && !/강의록 복습/.test(txt), '재재시 실패인데 게이트가 아니라 복습 모드다');
      assert(!/1:1/.test(txt), '«선생님과 1:1» 안내가 남아 있다');
      await page.evaluate(() => { S.gate.gates.forEach(g => { g._unlocked = true; }); render(); });
      const btn = await page.$$eval('.btnrow button', bs => bs.map(b => b.textContent));
      assert(btn.some(t => /재시 3차 시작/.test(t)), '단추가 «재시 3차 시작» 이 아니다: ' + btn.join(' / '));
      assert(!btn.some(t => /복습 마치기/.test(t)), '복습 마치기 단추가 남아 있다');
      const rt = await page.evaluate(() => {
        startRetake();
        const N = ChemEngine.norm;
        return { no: S.attemptNo, view: S.view, n: S.keyItems.length, head: document.body.innerText,
                 bad: S.keyItems.filter(x => S.wrongStmts[N(x.s)] && !x.reusedWrong).length };
      });
      assert(rt.no === 4 && rt.view === 'retake', '재시 3차 화면이 아니다: ' + JSON.stringify([rt.no, rt.view]));
      assert(rt.n === 60, '재시 3차 문항이 60개가 아니다: ' + rt.n);
      assert(/재시 3차/.test(rt.head) && !/재재재시/.test(rt.head), '화면이 «재시 3차» 로 부르지 않는다');
      assert(rt.bad === 0, '틀렸던 문장을 표시 없이 다시 냈다: ' + rt.bad);
      await page.evaluate(() => { S.answers = S.keyItems.map(x => x.a); render(); });
      await page.evaluate(() => doGrade());
      await waitPosts(page, posted, 1);
      const last = posted[posted.length - 1] || {};
      assert(last.attempt === '재재재시', '저장 라벨이 재재재시가 아니다: ' + last.attempt);
      assert(last.retakeCids && last.retakeKeys, '재시 3차 행에 문항 서명이 없다');
      const done = await page.evaluate(() => ({ att: S.attempts.map(a => a.attempt).join(','), txt: document.body.innerText }));
      assert(done.att === '첫 응시,재시,재재시,재재재시', '시도 기록이 이상하다: ' + done.att);
      assert(/재시 3차/.test(done.txt), '성적 화면이 «재시 3차» 로 부르지 않는다');
      await assertNoOverflow(page, 'retake-3rd');
    });

    /* (b′) 앱 안 흐름 — 재시에서 이어 재재시를 보고 또 떨어져도 게이트를 거쳐 재시 3차, 또 떨어지면 재시 4차.
       재시 판(retakeC)은 셋뿐이라 재시 4차는 첫 판으로 돌아간다 — 그래도 문항 60개가 나온다. */
    await test('앱 안 흐름 · 재재시에 떨어져도 게이트 → 재시 3차 → 재시 4차', async page => {
      const posted = [];
      await mockRowsPost(page, () => [FIRST, RETAKE], posted);
      await page.goto(URL); await waitView(page, 'gate');
      const flip = a => (a === 'O' ? 'X' : 'O');
      const failOnce = async (expectNo, expectLabel) => {
        const r = await page.evaluate(() => { S.gate.gates.forEach(g => { g._unlocked = true; }); startRetake(); return { no: S.attemptNo, view: S.view, n: S.keyItems.length }; });
        assert(r.no === expectNo && r.view === 'retake' && r.n === 60, '재시 화면이 아니다: ' + JSON.stringify(r));
        const before = posted.length;
        await page.evaluate(() => { S.answers = S.keyItems.map((x, i) => (i % 3 === 0 ? (x.a === 'O' ? 'X' : 'O') : x.a)); render(); });
        await page.evaluate(() => doGrade());
        await waitPosts(page, posted, before + 1);
        const p = posted[posted.length - 1] || {};
        assert(p.attempt === expectLabel && p.pass === false, '저장 라벨·결과가 이상하다: ' + JSON.stringify([p.attempt, p.pass]));
        await page.evaluate(() => afterReport()); await waitView(page, 'gate');
        const txt = await page.evaluate(() => document.body.innerText);
        assert(!/1:1/.test(txt) && !/강의록 복습/.test(txt), expectLabel + ' 실패 뒤 복습 모드·1:1 로 끝났다');
      };
      await failOnce(3, '재재시');
      await page.evaluate(() => { S.gate.gates.forEach(g => { g._unlocked = true; }); render(); });
      let btn = await page.$$eval('.btnrow button', bs => bs.map(b => b.textContent));
      assert(btn.some(t => /재시 3차 시작/.test(t)), '재재시 실패 뒤 단추가 «재시 3차 시작» 이 아니다: ' + btn.join(' / '));
      await failOnce(4, '재재재시');
      await page.evaluate(() => { S.gate.gates.forEach(g => { g._unlocked = true; }); render(); });
      btn = await page.$$eval('.btnrow button', bs => bs.map(b => b.textContent));
      assert(btn.some(t => /재시 4차 시작/.test(t)), '재시 3차 실패 뒤 단추가 «재시 4차 시작» 이 아니다: ' + btn.join(' / '));
      const r5 = await page.evaluate(() => { startRetake(); return { no: S.attemptNo, n: S.keyItems.length, head: document.body.innerText }; });
      assert(r5.no === 5 && r5.n === 60 && /재시 4차/.test(r5.head), '재시 4차가 안 나온다: ' + JSON.stringify([r5.no, r5.n]));
    });

    /* (c) 서버가 바쁘면 «기록이 없다» 가 아니라 «못 물어봤다» 고 하고, 다시 시도할 자리를 준다 */
    await test('재시 링크 · 서버가 바쁘면 다시 시도할 자리를 준다', async page => {
      let dead = true, asked = 0;
      await mockRows(page, () => { asked++; return dead ? null : [FIRST]; });
      await page.goto(URL); await waitView(page, 'retakebusy');
      const txt = await page.evaluate(() => document.body.innerText);
      assert(/서버나 네트워크 사정으로/.test(txt), '서버·네트워크 탓에 못 불러왔다는 말이 없다');
      assert(!/서버가 바빠/.test(txt), '원인을 «서버가 바쁘다» 로 단정한다(학생 기기가 오프라인이어도 같은 화면이다)');
      assert(!/기록을 찾지 못했습니다/.test(txt), '못 물어봤는데 «기록이 없다» 고 한다');
      const btn = await page.$$eval('button', bs => bs.map(b => b.textContent));
      assert(btn.some(t => /다시 시도/.test(t)), '다시 시도 단추가 없다: ' + btn.join(' / '));
      const before = asked; dead = false;
      await page.click('.btnrow button'); await waitView(page, 'gate');
      assert(asked > before, '다시 눌러도 안 물어본다');
      const st = await page.evaluate(() => ({ no: S.attemptNo, att: S.attempts.length }));
      assert(st.no === 1 && st.att === 1, '재시 행이 없으면 예전과 같아야 한다: ' + JSON.stringify(st));
      await assertNoOverflow(page, 'retake-busy');
    });

    /* (c′) 기록이 정말 없을 때만 «찾지 못했습니다» */
    await test('재시 링크 · 기록이 정말 없으면 찾지 못했다고 한다', async page => {
      await mockRows(page, () => []);
      await page.goto(URL); await waitView(page, 'retakefail');
      const txt = await page.evaluate(() => document.body.innerText);
      assert(/기록을 찾지 못했습니다/.test(txt), '기록이 없다는 말이 없다');
      assert(!/서버나 네트워크/.test(txt), '기록이 없는데 서버 탓을 한다');
    });

    /* (d) 통과한 재시 행이 있으면 «이미 통과» — 서버도 저장을 거부한다 */
    await test('재시 링크 · 이미 통과한 회차는 재시를 내지 않는다', async page => {
      const PASSED = Object.assign({}, RETAKE, { score: 90, pass: true });
      await mockRows(page, () => [FIRST, PASSED]);
      await page.goto(URL); await waitView(page, 'retakepassed');
      const txt = await page.evaluate(() => document.body.innerText);
      assert(/이미 통과한 회차/.test(txt), '이미 통과했다는 말이 없다');
      assert(/90\.00/.test(txt), '통과 점수가 소수 둘째 자리로 안 적혔다');
      const href = await page.$eval('a[href*="report.html"]', a => a.getAttribute('href'));
      assert(href === LINK, '성적표로 돌아가는 링크가 시트의 링크가 아니다: ' + href);
      assert(!(await page.$('.gate')), '통과했는데 게이트를 세웠다');
      await assertNoOverflow(page, 'retake-passed');
    });

    /* (e) 서버가 저장을 거부하면(attempt_regress) 조용히 «저장됨» 으로 넘기지 않고, 무한 재시도도 안 한다 */
    await test('저장 거부(attempt_regress)를 화면에 알리고 재시도하지 않는다', async page => {
      let posts = 0;
      await page.route('**/script.google.com/**', route => {
        if (route.request().method() === 'POST') { posts++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'attempt_regress', msg: '이미 더 나중 시도가 저장돼 있어 이 시도는 저장하지 않았습니다.' }) }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [] }) });
      });
      await page.goto(BASE + 'index.html?test=1'); await page.waitForTimeout(900);
      await page.click('.rchip');
      await page.waitForFunction(() => typeof S !== 'undefined' && S.round && S.round.jeongsi, null, { timeout: 8000 });
      await page.fill('#f_name', '회귀테스트'); await page.fill('#f_school', '테스트중');
      await page.click('.btnrow button:last-child'); await page.waitForTimeout(400);
      await page.click('.btnrow button:last-child'); await page.waitForTimeout(300);
      await page.evaluate(() => { S.answers = S.answers.map(() => 'O'); render(); });
      await page.evaluate(() => doGrade());
      await page.waitForFunction(() => typeof SAVE_STATE !== 'undefined' && SAVE_STATE && SAVE_STATE !== 'saving', null, { timeout: 10000 });
      await page.waitForTimeout(1500);
      const line = await page.$eval('#saveStatusLine', e => e.textContent);
      assert(/저장되지 않았습니다/.test(line) && /더 나중 시도/.test(line), '거부를 화면에 안 알린다: ' + line);
      assert(!/저장됨/.test(line), '거부됐는데 «저장됨» 이라고 한다');
      assert(!(await page.$('#saveStatusLine button')), '재시도해도 같은 답인데 재시도 단추가 있다');
      assert(posts === 1, '저장을 ' + posts + '번 보냈다(무한 재시도?)');
    }, { adminGate: true });

    /* (e′) 그 밖의 ok:false(doPost 의 catch — 시트 잠금 같은 일과성 예외)는 거부가 아니라 실패다:
       재시도 단추가 남고, 날것의 예외 문자열은 학생 화면에 안 실린다. */
    await test('서버 예외(ok:false·기타)는 «저장 실패 · 재시도» 로 두고 날것 오류는 안 보인다', async page => {
      let posts = 0;
      await page.route('**/script.google.com/**', route => {
        if (route.request().method() === 'POST') { posts++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Exception: Lock timeout: another process was holding the lock' }) }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [] }) });
      });
      await page.goto(BASE + 'index.html?test=1'); await page.waitForTimeout(900);
      await page.click('.rchip');
      await page.waitForFunction(() => typeof S !== 'undefined' && S.round && S.round.jeongsi, null, { timeout: 8000 });
      await page.fill('#f_name', '회귀테스트'); await page.fill('#f_school', '테스트중');
      await page.click('.btnrow button:last-child'); await page.waitForTimeout(400);
      await page.click('.btnrow button:last-child'); await page.waitForTimeout(300);
      await page.evaluate(() => { S.answers = S.answers.map(() => 'O'); render(); });
      await page.evaluate(() => doGrade());
      await page.waitForFunction(() => typeof SAVE_STATE !== 'undefined' && SAVE_STATE && SAVE_STATE !== 'saving', null, { timeout: 10000 });
      await page.waitForTimeout(1500);
      const line = await page.$eval('#saveStatusLine', e => e.textContent);
      assert(/저장 실패/.test(line) && /재시도/.test(line), '일과성 서버 오류를 실패로 안 알린다: ' + line);
      assert(!/저장됨/.test(line), '서버 오류인데 «저장됨» 이라고 한다');
      assert(!/Lock timeout|Exception/.test(line), '날것의 예외 문자열이 학생 화면에 실린다: ' + line);
      assert(await page.$('#saveStatusLine button'), '다시 보내면 될 수 있는데 재시도 단추가 없다');
      assert(posts === 1, '저장을 ' + posts + '번 보냈다(자동 재시도?)');
      await page.click('#saveStatusLine button');
      await page.waitForFunction(n => typeof SAVE_STATE !== 'undefined' && SAVE_STATE && SAVE_STATE !== 'saving', null, { timeout: 10000 });
      await page.waitForTimeout(600);
      assert(posts === 2, '손으로 재시도해도 안 보낸다: ' + posts);
    }, { adminGate: true });

    /* (e″) 재시 입력 페이지(retake_entry.html)도 같은 판단이다. 서버가 attempt_regress 로 거부하면 서버의 말을
       statusline 에 그대로 싣고 거기서 멈춘다 — «저장 확인» GET 으로 흘러가 «저장 확인 실패 · 네트워크·배포를 확인»
       이라고 엉뚱한 곳을 가리키지 않는다. 학생·회차 자료는 위 픽스처(FIRST)를 그대로 쓴다. */
    await test('재시 입력 · 저장 거부(attempt_regress)는 서버의 말을 싣고 확인 GET 을 안 보낸다', async page => {
      let posts = 0, getsAfterPost = 0;
      await page.route('**/script.google.com/**', route => {
        const u = route.request().url();
        if (route.request().method() === 'POST') { posts++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'attempt_regress', msg: '이미 더 나중 시도가 저장돼 있어 이 시도는 저장하지 않았습니다.' }) }); }
        if (u.includes('student=')) { if (posts) getsAfterPost++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, student: KEY, rows: [FIRST], excluded: [], cumulative: null, rank: null, cohort: null }) }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, classes: [] }) });
      });
      await page.goto(BASE + 'retake_entry.html');
      await page.waitForFunction(() => document.querySelectorAll('#rd option').length > 0, null, { timeout: 10000 });
      await page.selectOption('#rd', 'ch2|3'); await page.selectOption('#att', '2');
      await page.evaluate(() => manualStudent());
      await page.fill('#mNm', FIRST.name); await page.fill('#mSc', FIRST.school);
      await page.evaluate(() => loadForManual());
      await page.waitForFunction(() => typeof ITEMS !== 'undefined' && ITEMS && ITEMS.length > 0, null, { timeout: 15000 });
      const n = await page.evaluate(() => { OX = KEYARR.slice(); renderGrid(); refreshBar(); return ITEMS.length; });
      assert(n > 0, '재시 문항이 만들어지지 않았다');
      await page.evaluate(() => gradeAndSave());
      await page.waitForFunction(() => typeof SAVING !== 'undefined' && !SAVING && !/저장 중/.test(document.getElementById('statusline').textContent) && document.getElementById('statusline').textContent.trim() !== '', null, { timeout: 15000 });
      await page.waitForTimeout(600);
      const line = await page.$eval('#statusline', e => e.textContent);
      assert(/시트에 저장되지 않았습니다/.test(line) && /더 나중 시도/.test(line), '거부를 서버의 말로 안 알린다: ' + line);
      assert(!/저장 확인 실패|네트워크·배포/.test(line), '거부를 네트워크·배포 탓으로 돌린다: ' + line);
      assert(!/시트 저장 확인/.test(line), '거부됐는데 «저장 확인» 이라고 한다: ' + line);
      assert(posts === 1, '저장을 ' + posts + '번 보냈다');
      assert(getsAfterPost === 0, '거부 뒤에 확인 GET 을 ' + getsAfterPost + '번 보냈다');
      assert((await page.$$eval('#loglist .logrow', r => r.length)) === 0, '거부됐는데 저장 기록 줄이 생겼다');
      assert(!(await page.$eval('#saveBtn', b => b.disabled)), '거부 뒤 단추가 잠겨 다시 저장할 수 없다');
    }, { adminGate: true });

    /* (f) 게이트 단계 이름: 폴백 확인 문제(옳은 문장 O · 틀린 문장 원래 정답)는 «개념 확인 / 적용» 이 아니다 */
    await test('게이트 · 폴백 확인 문제에는 «개념 확인 / 적용» 단계 이름을 안 붙인다', async page => {
      await mockRows(page, () => [FIRST]);
      await page.goto(URL); await waitView(page, 'gate');
      const r = await page.evaluate(() => {
        const g = S.gate.gates[0]; const out = {};
        const lab = () => document.querySelector('.gate .cqstage').textContent.trim();
        g._unlocked = false; g._wrong = false;
        g.checks = [{ s: '옳은 문장', a: 'O', f: '옳은 문장', w: '', fallback: true }, { s: '학생이 틀린 문장', a: 'X', f: '옳은 문장', w: '', fallback: true }]; g.check = g.checks[0];
        g._stage = 0; render(); out.f0 = lab(); g._stage = 1; render(); out.f1 = lab();
        g.checks = [{ s: '새 form 하나', a: 'O', f: '', w: '' }, { s: '새 form 둘', a: 'X', f: '', w: '' }]; g.check = g.checks[0];
        g._stage = 0; render(); out.n0 = lab(); g._stage = 1; render(); out.n1 = lab();
        g.checks = [{ s: '새 form 하나', a: 'O', f: '', w: '' }, { s: '학생이 틀린 문장', a: 'X', f: '', w: '', fallback: true }]; g.check = g.checks[0];
        g._stage = 1; render(); out.m1 = lab();
        g.checks = [{ s: '학생이 틀린 문장', a: 'X', f: '', w: '', fallback: true }]; g.check = g.checks[0]; g._stage = 0; render(); out.one = lab();
        out.lede = document.querySelector('.card .lede').textContent;
        return out;
      });
      assert(r.f0 === '1단계 · 확인' && r.f1 === '2단계 · 확인', '폴백 둘의 단계 이름: ' + JSON.stringify([r.f0, r.f1]));
      assert(r.n0 === '1단계 · 개념 확인' && r.n1 === '2단계 · 적용', 'form 확인 문제의 단계 이름(기존): ' + JSON.stringify([r.n0, r.n1]));
      assert(r.m1 === '2단계 · 확인', 'form + 폴백 섞인 게이트의 2단계: ' + r.m1);
      assert(r.one === '확인', '확인 문제 하나짜리: ' + r.one);
      assert(!/개념 → 적용/.test(r.lede) && /1~2문제/.test(r.lede), '게이트 안내가 폴백에도 «개념 → 적용» 을 약속한다: ' + r.lede);
    });
  }

  /* ── 회차 상세·구간 재계산의 대표 시도 ────────────────────────────
     운영 성적표의 누적(A)은 서버(apps-script.gs cumulative_)가 계산해 보낸다 — 회차의 대표
     점수(finalScore)는 «처음 통과한 시도, 없으면 마지막». 그런데 학부모가 회차 카드를 눌러 여는
     「N회 시점 상세」(renderRoundEmbed)와 구간 종합(?seg=)은 **브라우저 안 엔진 사본**으로 다시
     센다. 2026-09-11 까지 그 사본은 «마지막 시도» 였다 — 재시로 통과한 뒤 또 본 행이 있으면 같은
     학생이 같은 화면에서 두 숫자를 받았다. 이제 사본은 chemengine.js 그대로다(tools/engine_sync.py).
     여기서는 화면이 실제로 그 규칙으로 그리는지 본다. */
  await test('report · 회차 상세·구간 재계산의 finalScore 가 서버 규칙(처음 통과한 시도)과 같다', async page => {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const K = '가상중-검사';
    const R = (round, attempt, score, pass, date) => ({ studentKey: K, name: '검사', school: '가상중', year: '2026', course: 'ch1',
      round, attempt, score, pass, date, wrongMis: [], wrongAxes: {}, units: [], axes: [] });
    const rows = [
      R(1, '첫 응시', 70, false, '2026-08-01'),
      R(1, '재시', 85, true, '2026-08-02'),      // 처음 통과한 시도 → 대표
      R(1, '재재시', 60, false, '2026-08-03'),   // 통과한 뒤 또 본 행 — 마지막 시도 규칙이면 이것이 뜬다
      R(2, '첫 응시', 90, true, '2026-08-08'),
    ];
    const A = CE.cumulative(rows)[K];                               // 서버와 같은 규칙(repr)
    assert(A.trend[0].finalScore === 85 && A.trend[0].finalAttempt === '재시', '기준이 서버 규칙이 아니다: ' + JSON.stringify(A.trend[0]));
    const want = A.trend.map(t => [t.round, t.finalScore, t.finalAttempt]);
    await page.route('**/macros/s/**', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, student: 'x', rows: rows, excluded: [], cumulative: A, rank: null, cohort: null }) }));
    await page.goto(BASE + 'report.html?student=x');
    await page.waitForSelector('.rcard', { timeout: 20000 });
    /* (1) 화면 안 엔진 사본이 같은 답을 낸다 */
    const got = await page.evaluate(([rows, K]) => ChemEngine.cumulative(rows)[K].trend.map(t => [t.round, t.finalScore, t.finalAttempt]), [rows, K]);
    assert(JSON.stringify(got) === JSON.stringify(want), '화면 안 엔진 사본의 대표 시도가 서버와 다르다: ' + JSON.stringify(got) + ' vs ' + JSON.stringify(want));
    /* (2) 「1회 시점 상세」 — 1회까지의 기록으로 다시 그린 점수 추이의 최종 점수가 85 (60 아님) */
    await page.evaluate(() => showRoundDetail('ch1', 1));
    await page.waitForSelector('.round-embed svg', { timeout: 20000 });
    const finals = await page.evaluate(() => {
      const card = [].slice.call(document.querySelectorAll('.round-embed .card')).filter(c => /점수 추이/.test((c.querySelector('h2') || {}).textContent || ''))[0];
      return card ? [].slice.call(card.querySelectorAll('svg text[font-weight="700"]')).map(e => e.textContent.trim()) : null;
    });
    assert(finals && finals.indexOf('85') >= 0 && finals.indexOf('60') < 0, '회차 상세의 최종 점수가 서버 규칙과 다르다: ' + JSON.stringify(finals));
    /* (3) 구간 종합(1~2회) — 「재시까지 반영 평균」 = (85 + 90) / 2. 마지막 시도 규칙이면 (60 + 90) / 2 */
    await page.goto(BASE + 'report.html?student=x&seg=1-2&c=ch1');
    await page.waitForSelector('.segstat', { timeout: 20000 });
    const avg = await page.evaluate(() => {
      const el = [].slice.call(document.querySelectorAll('.segstat')).filter(e => /재시까지 반영 평균/.test(e.textContent))[0];
      return el ? el.querySelector('b').textContent.trim() : null;
    });
    const wantAvg = (want.reduce((s, t) => s + t[1], 0) / want.length).toFixed(2);
    assert(avg === wantAvg, '구간 재계산의 재시까지 반영 평균이 서버 규칙과 다르다: ' + avg + ' (기대 ' + wantAvg + ')');
  });

  /* ── 선생님 결정 2026-09-28 · 성적표 첫 화면·이번 주 목표·근본 원인·오개념 뱃지·심화 카드 ──
     화학Ⅰ 1~3회 회차 파일로 기록을 지어 서버 응답을 흉내 낸다. 학생 이름은 가짜다. */
  {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const IT = r => JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_ch1_' + String(r).padStart(2, '0') + '.json'), 'utf8')).jeongsi.items;
    const I = { 1: IT(1), 2: IT(2), 3: IT(3) };
    const DEEPN = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'deep_notes.json'), 'utf8'));
    const K = '가상중-주간점검';
    const flip = a => a === 'O' ? 'X' : 'O';
    /* 첫 응시 행: wrong 은 틀린 문항 자리(0부터). */
    const first = (round, wrong, extra) => {
      const items = I[round];
      const ans = items.map((it, i) => wrong.indexOf(i) >= 0 ? flip(it.a) : it.a).join('');
      const units = {};
      items.forEach((it, i) => { const u = units[it.u] || (units[it.u] = { u: it.u, t: 0, w: 0 }); u.t++; if (wrong.indexOf(i) >= 0) u.w++; });
      const score = Math.round(10000 * (items.length - wrong.length) / items.length) / 100;
      return Object.assign({ studentKey: K, name: '주간점검', school: '가상중', year: '2026', course: 'ch1', round, attempt: '첫 응시',
        score, pass: score >= 80, date: '2026-09-0' + round, answers: ans, wrongMis: wrong.map(i => items[i].mis), wrongAxes: {},
        units: Object.keys(units).map(k => units[k]), axes: [] }, extra || {});
    };
    /* 재시 행(서명 있음): asked = [{c, ok}] — 재시가 물은 문항의 개념코드와 맞았는지. */
    const retake = (round, attempt, asked, wrongMis, unasked, score) => {
      const keys = asked.map((q, k) => (k % 2 ? 'O' : 'X')).join('');
      const ans = asked.map((q, k) => q.ok ? keys.charAt(k) : flip(keys.charAt(k))).join('');
      return { studentKey: K, name: '주간점검', school: '가상중', year: '2026', course: 'ch1', round, attempt,
        score, pass: score >= 80, date: '2026-09-1' + round, answers: ans, retakeCids: asked.map(q => q.c).join(','),
        retakeKeys: keys, retakeUnasked: (unasked || []).join('|'), wrongMis: wrongMis, wrongAxes: {}, units: [], axes: [] };
    };
    const idxOf = (round, mis) => I[round].map((it, i) => it.mis === mis ? i : -1).filter(i => i >= 0);
    const codeOf = (round, mis) => I[round][idxOf(round, mis)[0]].c;
    const serve = async (page, rows, more) => {
      const A = CE.cumulative(rows)[K];
      await page.route('**/macros/s/**', route => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(Object.assign({ ok: true, student: 'x', rows, excluded: [], cumulative: A, rank: null, cohort: null }, more || {})) }));
      await page.goto(BASE + 'report.html?student=x');
      await page.waitForSelector('.ladder', { timeout: 20000 });
      return A;
    };
    const X = '분자 종류', Y = '루이스 전자점식', Z = '결합 기초', W = '물질 분류 판정';
    const wrong1 = [].concat(idxOf(1, X), idxOf(1, Y), idxOf(1, Z), idxOf(1, W));   // 13문항 → 통과 전

    /* C · A · B — 통과 전이면 이번 주 목표는 재시가 다시 묻는 개념(마지막 시도의 오답)이고, 처방 코멘트 ·
       「위험」 카드의 안내가 같은 개념을 말한다. 첫 화면 판정 셋에는 이름표(추이·이번 회차·위험)가 붙는다.
       아이에게 건넬 말은 부모에게 하는 말 안에 따옴표로 들어간다. */
    await test('report · 이번 주 목표 하나 — 통과 전이면 재시가 묻는 개념 · 판정 이름표 · 부모에게 하는 말', async page => {
      assert(wrong1.length === 13, '고른 문항 수가 다르다: ' + wrong1.length);
      const r2 = retake(1, '재시', [{ c: codeOf(1, Y), ok: false }, { c: codeOf(1, Y), ok: false }, { c: codeOf(1, W), ok: false }, { c: codeOf(1, X), ok: true }],
        [Y, Y, W], [Z], 75);
      await serve(page, [first(1, wrong1), r2]);
      const got = await page.evaluate(() => ({
        todo: (document.querySelector('.card.todo .todomis') || {}).textContent,
        tlab: (document.querySelector('.card.todo .todohome .tlab') || {}).textContent,
        q: (document.querySelector('.card.todo .todohome') || {}).textContent,
        rx: [].slice.call(document.querySelectorAll('.card')).filter(c => /처방 코멘트/.test((c.querySelector('h2') || {}).textContent || '')).map(c => c.textContent)[0] || '',
        warn: (document.querySelector('.card.warn') || {}).textContent || '',
        chip: (document.querySelector('.verdict5 .vlab') || {}).textContent,
        band: (document.querySelector('.qbadge .vlab') || {}).textContent,
        warnLab: (document.querySelector('.card.warn h2 .vlab') || {}).textContent,
        app: document.getElementById('app').textContent }));
      assert(got.todo === Y, '통과 전인데 목표가 재시가 묻는 개념(가장 많이 틀린 「' + Y + '」)이 아니다: ' + got.todo);
      assert(got.rx.indexOf('「' + Y + '」') >= 0, '처방 코멘트가 같은 개념을 말하지 않는다: ' + got.rx.slice(0, 200));
      assert(/이번 주 확인할 개념/.test(got.rx), '처방 코멘트가 카드 이름을 말하지 않는다');
      assert(got.warn.indexOf('「이번 주 확인할 개념」 카드(「' + Y + '」)') >= 0, '「위험」 카드의 안내가 카드를 가리키지 않는다: ' + got.warn);
      assert(!/이번 주 처방을 우선 진행해 주세요/.test(got.app), '어느 카드인지 모르는 옛 문장이 남았다');
      assert(got.chip === '추이' && got.band === '이번 회차' && got.warnLab === '위험', '판정 이름표가 없다: ' + JSON.stringify([got.chip, got.band, got.warnLab]));
      assert(got.tlab === '아이에게 이렇게 물어봐 주세요', '질문 칸 이름이 부모에게 하는 말이 아니다: ' + got.tlab);
      const q = got.q.slice(got.tlab.length);
      assert(q.charAt(0) === '“' && q.charAt(q.length - 1) === '”', '아이에게 건넬 말이 따옴표 안에 있지 않다: ' + q);
      assert(!/(네가|볼래\?|해 봐)/.test(got.app.replace(/“[^”]*”/g, '')), '따옴표 밖에 아이에게 하는 말이 남았다');
      /* 통과했고 고질이 없으면 이번 회차 오답의 첫째 — 처방 코멘트도 같은 개념 */
      await page.unroute('**/macros/s/**');
      const r2p = retake(1, '재시', [{ c: codeOf(1, Y), ok: true }], [], [Z, W], 95);
      await serve(page, [first(1, wrong1), r2p]);
      const p2 = await page.evaluate(() => ({ todo: (document.querySelector('.card.todo .todomis') || {}).textContent,
        rx: [].slice.call(document.querySelectorAll('.card')).filter(c => /처방 코멘트/.test((c.querySelector('h2') || {}).textContent || '')).map(c => c.textContent)[0] || '' }));
      assert(p2.todo === X, '통과했고 고질이 없으면 이번 회차 오답의 첫째여야 한다: ' + p2.todo);
      assert(p2.rx.indexOf('「' + X + '」') >= 0, '통과 뒤 처방 코멘트가 같은 개념을 말하지 않는다');
    });

    /* E — 오개념 뱃지. 재시가 다시 물어 또 틀림 → 확인됨, 물어 맞힘 → 바로잡음, 안 물음 → 미확인.
       서명 없는 옛 재시 행은 wrongMis 에 있으면 확인됨, 없으면 미확인(물었는지 모른다). */
    await test('report · 오개념 뱃지(확인됨·바로잡음·미확인)는 재시가 다시 물었는지로 정한다', async page => {
      const r2 = retake(1, '재시', [{ c: codeOf(1, X), ok: false }, { c: codeOf(1, X), ok: true }, { c: codeOf(1, Y), ok: true }, { c: codeOf(1, Y), ok: true }],
        [X], [Z, W], 90);
      await serve(page, [first(1, wrong1), r2]);
      await page.waitForSelector('#main-sols .misgrp', { timeout: 15000 });
      const b = await page.evaluate(() => {
        const o = {}; [].slice.call(document.querySelectorAll('#main-sols .misgrp-h')).forEach(h => {
          o[h.querySelector('.misgrp-t').textContent] = (h.querySelector('.misst') || {}).textContent; });
        return { o, legend: !!document.querySelector('#main-sols .mslegend'),
          rv: [].slice.call(document.querySelectorAll('.rvrow')).map(e => [e.querySelector('.rvm').textContent, (e.querySelector('.misst') || {}).textContent]) };
      });
      const want = {}; want[X] = '확인됨'; want[Y] = '바로잡음'; want[Z] = '미확인'; want[W] = '미확인';
      Object.keys(want).forEach(m => assert(b.o[m] === want[m], '「' + m + '」 뱃지가 ' + want[m] + ' 이 아니다: ' + b.o[m]));
      assert(b.legend, '뱃지 뜻풀이 한 줄이 없다');
      /* 「다시 볼 개념」 의 복습 목록에도 같은 뱃지 */
      b.rv.forEach(r => { if (want[r[0]]) assert(r[1] === want[r[0]], '다시 볼 개념의 「' + r[0] + '」 뱃지가 다르다: ' + r[1]); });
      /* 옛 재시 행 · 문항을 못 받은 때 — 이름만으로 */
      const old = await page.evaluate(() => {
        const atts = [{ attempt: '첫 응시', wrongMis: ['갑', '을'] }, { attempt: '재시', wrongMis: ['갑'] }];
        return [misRetakeStatus(atts, '갑', null), misRetakeStatus(atts, '을', null), misRetakeStatus([atts[0]], '갑', null)];
      });
      assert(JSON.stringify(old) === JSON.stringify(['no', 'un', 'un']), '옛 재시 행의 판정이 다르다: ' + JSON.stringify(old));
    });

    /* D — 근본 원인 진단은 최근 3회차 첫 응시 오답을 합쳐 판정하고, 우연 기준선도 같은 3회차 문항에서 뽑는다. */
    await test('report · 근본 원인 진단은 최근 3회차 오답을 합친다(우연 기준선도 같은 회차들에서)', async page => {
      const w = { 1: [0, 5, 9, 14, 21, 33, 40], 2: [2, 7, 12, 19, 26, 31], 3: [3, 6, 11, 18, 25, 30, 44] };
      const rows = [first(1, w[1]), first(2, w[2]), first(3, w[3])];
      await serve(page, rows);
      const src = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
      const a = src.indexOf('const ENGINE=');
      const ENG = new Function(src.slice(a, src.indexOf('\n', a)) + '\nreturn ENGINE;')();
      const codes = new Set(); [1, 2, 3].forEach(r => w[r].forEach(i => { const c = I[r][i].c; if (c && ENG[c]) codes.add(c); }));
      const only3 = new Set(w[3].map(i => I[3][i].c).filter(c => c && ENG[c]));
      assert(codes.size > only3.size, '픽스처가 합치기를 못 잰다');
      const dx = await page.evaluate(() => ({ th: (document.querySelector('.dxroot .dxthesis') || {}).textContent || '',
        eb: (document.querySelector('.dxroot .dxeyebrow') || {}).textContent || '',
        pool: window._dxRecent && window._dxRecent.pool ? window._dxRecent.pool.items.length : -1, rounds: window._dxRecent ? window._dxRecent.rounds : 0 }));
      assert(dx.th.indexOf('최근 3회차 오답 ' + codes.size + '개를 합쳐 보면') === 0, '합친 회차·개수를 말하지 않는다: ' + dx.th);
      assert(/최근 3회차 합산/.test(dx.eb), '절 머리에 합산이 없다: ' + dx.eb);
      const nItems = [1, 2, 3].reduce((s, r) => s + I[r].filter(x => x.c).length, 0);
      assert(dx.rounds === 3 && dx.pool === nItems, '우연 기준선의 모집단이 3회차 문항 전체가 아니다: ' + dx.pool + ' / ' + nItems);
      if (/단정하지 않습니다/.test(dx.th)) assert(/같은 3회차 문항에서 오답 \d+개를 무작위로 뽑아도/.test(dx.th), '기준선 문장이 합친 회차를 말하지 않는다: ' + dx.th);
      await page.reload(); await page.waitForSelector('.dxroot', { timeout: 20000 });
      const th2 = await page.evaluate(() => document.querySelector('.dxroot .dxthesis').textContent);
      assert(th2 === dx.th, '새로고침에 문장이 달라졌다');
    });

    /* G · F — 심화 카드: 통과 전이어도 최근 3회차 기본·표준 정답률 90% 이상이면 선다. 도전 링크는 약한 개념
       (&mis=)과 학생 코드(&stu=)를 같이 넘기고, 서버가 준 심화 기록을 한 줄로 적는다. 「한 겹 더」 글은
       deep_notes.json 에 있는 개념만 — 없는 개념은 이름과 강의 링크만. */
    await test('report · 심화 카드 문턱(기본·표준 90%) · 도전 링크의 mis·stu · 도전 기록 · 한 겹 더 글', async page => {
      const lv12 = I[3].map((x, i) => (x.lvl === 1 || x.lvl === 2) ? i : -1).filter(i => i >= 0);
      const w3 = lv12.slice(0, 14);
      const rows = [first(1, []), first(2, []), first(3, w3)];
      assert(!rows[2].pass, '3회가 통과 전이어야 한다');
      const challenges = [{ date: '2026-09-20T10:00:00Z', course: 'ch1', round: 3, n: 12, ok: 9, weakN: 6, weakOk: 4, linkN: 2, linkOk: 1 },
                          { date: '2026-09-12T10:00:00Z', course: 'ch1', round: 2, n: 12, ok: 5, weakN: 6, weakOk: 2, linkN: 2, linkOk: 0 }];
      await serve(page, rows, { challenges });
      const card = await page.evaluate(() => {
        const c = [].slice.call(document.querySelectorAll('.card')).filter(e => /한 겹 더/.test((e.querySelector('h2') || {}).textContent || ''))[0];
        if (!c) return null;
        return { text: c.textContent, href: c.querySelector('a.cbtn').getAttribute('href'),
          rec: (c.querySelector('.chrec') || {}).textContent || '',
          rx: [].slice.call(c.querySelectorAll('.rx')).map(r => ({ nm: r.querySelector('.nm').textContent, ol: (r.querySelector('.ol') || {}).textContent || null })) };
      });
      assert(card, '기본·표준 정답률이 90% 이상인데 심화 카드가 없다');
      const tot = [1, 2, 3].reduce((s, r) => s + I[r].filter(x => x.lvl === 1 || x.lvl === 2).length, 0);
      assert(card.text.indexOf(Math.round(100 * (tot - 14) / tot) + '%') >= 0, '문턱 문장에 정답률이 없다');
      const u = new URL(card.href, BASE);
      assert(u.searchParams.get('course') === 'ch1' && u.searchParams.get('round') === '3', '회차를 안 넘긴다: ' + card.href);
      assert(u.searchParams.get('stu') === 'x', '&stu= 가 성적표의 ?student= 와 다르다: ' + card.href);
      const mis = (u.searchParams.get('mis') || '').split('|');
      const lw = []; w3.forEach(i => { if (lw.indexOf(I[3][i].mis) < 0) lw.push(I[3][i].mis); });
      assert(mis.length === Math.min(12, lw.length) && mis.every((m, k) => m === lw[k]), '&mis= 가 이번 회차 오답 개념(고질 먼저 · 12개까지)이 아니다: ' + mis.join('|'));
      assert(card.rec === '심화 도전 기록 · 최근 2회 · 마지막 12문항 중 9 맞음', '심화 도전 기록 줄이 다르다: ' + card.rec);
      assert(card.rx.length >= 1, '「한 겹 더」 개념이 없다');
      card.rx.forEach(r => {
        const note = DEEPN[r.nm] || DEEPN[CE.misCanon(r.nm)] || null;
        if (note) assert(r.ol && r.ol.indexOf(note) >= 0, '「' + r.nm + '」 는 글이 있는데 안 실렸다');
        else assert(r.ol === null, '「' + r.nm + '」 는 글이 없는데 무언가를 실었다(CORE 나머지?): ' + r.ol);
      });
      assert(card.rx.some(r => r.ol) && card.rx.some(r => !r.ol), '픽스처가 글 있음·없음을 둘 다 재지 않는다');
      /* 기본·표준 정답률이 90% 아래면(통과 전) 카드가 없다 · 기록이 없으면 기록 줄도 없다 */
      await page.unroute('**/macros/s/**');
      await serve(page, [first(1, []), first(2, []), first(3, lv12.slice(0, 20))]);
      const none = await page.evaluate(() => [].slice.call(document.querySelectorAll('.card h2')).some(h => /한 겹 더/.test(h.textContent)));
      assert(!none, '기본·표준 정답률이 90% 아래이고 통과 전인데 심화 카드가 섰다');
    });
  }

  /* ══════════════════════════════════════════════════════════════
     화학Ⅰ 심화(ch1s) — 2026-10-03 앱에 과목을 넣었다. 회차 파일 appdata/round_ch1s_NN.json ·
     문장 은행 appdata/forms_bank.json 의 CH1S- 항목(원본 courses/ch1s/forms_bank_ch1s.json).
     응시 → 채점 → 게이트 → 재시, 성적표(혼자 · 화학Ⅰ 행과 함께)가 다른 과목처럼 도는지 본다.
     ══════════════════════════════════════════════════════════════ */
  {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const RD = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_ch1s_' + String(n).padStart(2, '0') + '.json'), 'utf8'));
    const R1 = RD(1), R5 = RD(5);
    const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'forms_bank.json'), 'utf8'));
    const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', 'ch1s', 'forms_bank_ch1s.json'), 'utf8'));
    const DEEPN = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'deep_notes.json'), 'utf8'));
    const DEEPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', 'ch1s', 'deep_ch1s.json'), 'utf8'));
    const flip = a => (a === 'O' ? 'X' : 'O');
    const nrm = x => CE.norm(x);

    await test('ch1s · 자료 자리: 목록·은행·자료 화면이 다른 과목과 같은 곳을 본다', async () => {
      const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'app_manifest.json'), 'utf8'));
      const ms = M.rounds.filter(r => r.course === 'ch1s');
      assert(ms.length === 10, '목록의 ch1s 회차가 ' + ms.length);
      assert(M.rounds.map(r => r.course).filter((c, i, a) => a.indexOf(c) === i).join(',') === 'ch1,ch1s,ch2,gc', '과목 순서가 ch1 → ch1s → ch2 → gc 가 아니다');
      ms.forEach(m => {
        ['data', 'munje_pdf', 'haeseol_pdf'].forEach(k => {
          const f = k === 'data' ? path.join(ROOT, 'appdata', m[k]) : path.join(ROOT, m[k]);
          assert(fs.existsSync(f), m.round + '회 ' + k + ' 파일이 없다: ' + m[k]);
        });
      });
      const codes = Object.keys(SRC);
      assert(codes.length === 211 && codes.every(c => JSON.stringify(BANK[c]) === JSON.stringify(SRC[c])), '앱 은행의 CH1S- 항목이 원본과 다르다');
      const MAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'materials.json'), 'utf8'));
      const mc = MAT.courses.filter(c => c.key === 'ch1s')[0];
      assert(mc && mc.rounds.length === 10 && mc.rounds.every(r => r.files.munje && r.files.haeseol && r.files.truthbook), '자료 화면에 ch1s 문제지·해설지·선수노트가 다 안 걸렸다');
    });

    await test('ch1s · 응시(exam) 1회를 불러 채점하고 과목 ch1s 로 저장한다', async page => {
      const posted = [];
      await page.route('**/macros/s/**', route => {
        const req = route.request();
        if (req.method() === 'POST') { try { posted.push(JSON.parse(req.postData() || '{}')); } catch (e) {} }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated: false, reportLink: 'https://example.test/report.html?student=abc', rows: [] }) });
      });
      await page.goto(BASE + 'exam.html?c=ch1s&r=1'); await page.waitForTimeout(900);
      const h1 = await page.$eval('h1', e => e.textContent);
      assert(/화학1 심화.*1회/.test(h1), '회차 제목: ' + h1);
      await page.fill('#nm', '심화테스트'); await page.fill('#sc', '테스트중');
      await page.evaluate(() => startExam());
      const key = R1.jeongsi.items.map(x => x.a);
      const got = await page.evaluate(k => { A = k.map((a, i) => (i < 6 ? (a === 'O' ? 'X' : 'O') : a)); submitExam(); return { score: RESULT.g.score, pass: RESULT.g.pass, n: R.jeongsi.items.length, course: R.course }; }, key);
      assert(got.n === 60 && got.course === 'ch1s', '회차 파일이 아니다: ' + JSON.stringify(got));
      assert(got.score === 90 && got.pass === true, '6개 틀리면 90점 통과여야 한다: ' + JSON.stringify(got));
      for (let i = 0; i < 50 && !posted.length; i++) await page.waitForTimeout(100);
      const p = posted[0] || {};
      assert(p.course === 'ch1s' && Number(p.round) === 1 && p.answers && p.answers.length === 60, '저장이 ch1s 1회가 아니다: ' + JSON.stringify([p.course, p.round]));
      assert((p.wrongMis || []).length >= 1 && p.wrongMis.every(m => R1.jeongsi.items.some(x => x.mis === m)), '오개념 이름이 회차 파일과 다르다');
    });

    await test('ch1s · 앱 안 흐름: 채점 → 게이트 → 재시가 retakeC·은행에서 (정시 문장 재노출 0)', async page => {
      await page.goto(BASE + 'index.html?test=1'); await page.waitForTimeout(900);
      const tabs = await page.$$eval('.tabs button', bs => bs.map(b => b.textContent));
      assert(tabs.join(',').indexOf('화학Ⅰ,화학Ⅰ 심화,화학Ⅱ,일반화학') === 0, '과목 탭 순서: ' + tabs.join(','));
      await page.evaluate(() => { courseTab = 'ch1s'; render(); });
      await page.click('.rchip');
      await page.waitForFunction(() => typeof S !== 'undefined' && S.round && S.round.course === 'ch1s' && S.round.jeongsi, null, { timeout: 8000 });
      await page.fill('#f_name', '심화테스트'); await page.fill('#f_school', '테스트중'); await page.fill('#f_grade', '2');
      await page.click('.btnrow button:last-child'); await page.waitForTimeout(400);
      await page.click('.btnrow button:last-child'); await page.waitForTimeout(300);
      await page.evaluate(() => { S.answers = S.keyItems.map((x, i) => (i % 3 === 0 ? (x.a === 'O' ? 'X' : 'O') : x.a)); render(); });
      await page.evaluate(() => doGrade());
      await page.waitForFunction(() => typeof S !== 'undefined' && !!S.graded, null, { timeout: 10000 });
      await page.evaluate(() => afterReport());
      await page.waitForFunction(() => S.view === 'gate', null, { timeout: 10000 });
      const gate = await page.evaluate(() => ({ score: S.graded.score, n: S.gate.gates.length,
        checks: S.gate.gates.map(g => ({ c: g.c, ss: g.checks.map(x => x.s), fb: g.checks.every(x => !!x.fallback) })),
        wrong: S.dx.wrongConcepts.map(w => w.c) }));
      assert(gate.score < 80 && gate.n >= 1, '게이트가 안 섰다: ' + JSON.stringify([gate.score, gate.n]));
      assert(gate.wrong.every(c => /^CH1S-\d{3}$/.test(c)), '틀린 개념 코드가 CH1S 가 아니다');
      const fallback = gate.checks.filter(g => g.fb).length;
      assert(fallback === 0, '은행 문장이 아닌 대체 확인 문제가 ' + fallback + '개');
      gate.checks.forEach(g => g.ss.forEach(st => assert((BANK[g.c].forms || []).some(f => nrm(f.s) === nrm(st)), g.c + ' 확인 문장이 은행에 없다: ' + st)));
      await page.evaluate(() => { S.gate.gates.forEach(g => { g._unlocked = true; }); startRetake(); });
      const rt = await page.evaluate(() => ({ view: S.view, items: S.keyItems.map(x => ({ c: x.c, s: x.s, a: x.a })) }));
      assert(rt.view === 'retake' && rt.items.length === 60, '재시 화면이 아니다: ' + rt.view + ' · ' + rt.items.length);
      const js = {}; R1.jeongsi.items.forEach(x => { js[nrm(x.s)] = 1; });
      const again = rt.items.filter(x => js[nrm(x.s)]);
      assert(again.length === 0, '재시에 정시 문장이 다시 나왔다 ' + again.length + '개: ' + again.slice(0, 2).map(x => x.s).join(' / '));
      const pool = {}; R1.retakeC.forEach(v => v.items.forEach(x => { pool[nrm(x.s)] = 1; }));
      Object.keys(SRC).forEach(c => SRC[c].forms.forEach(f => { pool[nrm(f.s)] = 1; }));
      const stray = rt.items.filter(x => !pool[nrm(x.s)]);
      assert(stray.length === 0, 'retakeC·은행 밖 문장 ' + stray.length + '개');
      assert(rt.items.every(x => /^CH1S-\d{3}$/.test(x.c)), '재시에 다른 과목 개념이 섞였다');
      const asked = {}; rt.items.forEach(x => { asked[x.c] = 1; });
      const miss = gate.wrong.filter(c => !asked[c]);
      assert(miss.length === 0, '틀린 개념이 재시에서 빠졌다: ' + miss.join(','));
      await assertNoOverflow(page, 'ch1s-retake');
    }, { adminGate: true });

    /* 성적표 픽스처 — 심화반 회차 행 */
    const K = '가상중-심화반';
    const row = (course, R, round, wrong, date) => {
      const items = R.jeongsi.items;
      const ans = items.map((it, i) => wrong.indexOf(i) >= 0 ? flip(it.a) : it.a).join('');
      const units = {};
      items.forEach((it, i) => { const u = units[it.u] || (units[it.u] = { u: it.u, t: 0, w: 0 }); u.t++; if (wrong.indexOf(i) >= 0) u.w++; });
      const score = Math.round(10000 * (items.length - wrong.length) / items.length) / 100;
      return { studentKey: K, name: '심화반', school: '가상중', year: '2026', course, round, attempt: '첫 응시',
        score, pass: score >= 80, date, answers: ans, wrongMis: wrong.map(i => items[i].mis), wrongAxes: {},
        units: Object.keys(units).map(k => units[k]), axes: [] };
    };
    const serveRows = async (page, rows) => {
      const A = CE.cumulative(rows)[K];
      await page.route('**/macros/s/**', route => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, student: 'x', rows, excluded: [], cumulative: A, rank: null, cohort: null }) }));
      await page.goto(BASE + 'report.html?student=x');
      await page.waitForSelector('.ladder', { timeout: 20000 });
      await page.waitForTimeout(600);
    };
    /* 5회: 격자 에너지(38) · 이온화 에너지 주기성(25) · 전기음성도(28) 는 화학Ⅰ DEEP 에도 같은 이름이 있다. */
    const W5 = [38, 25, 28, 3, 12];

    await test('ch1s · 성적표: 심화반 행만으로 그려지고 · 한 겹 더는 코드로 · 강의 문은 달고 도전 링크는 숨긴다', async page => {
      await serveRows(page, [row('ch1s', R5, 5, W5, '2026-09-20')]);
      const r = await page.evaluate(() => {
        const card = [].slice.call(document.querySelectorAll('.card')).filter(e => /한 겹 더/.test((e.querySelector('h2') || {}).textContent || ''))[0];
        return { text: document.body.innerText, lec: document.querySelectorAll('a.leclink').length,
          cbtn: card ? card.querySelectorAll('a.cbtn').length : -1,
          rx: card ? [].slice.call(card.querySelectorAll('.rx')).map(x => ({ nm: x.querySelector('.nm').textContent, ol: (x.querySelector('.ol') || {}).textContent || '' })) : null,
          prereq: !!(typeof PREREQ !== 'undefined' && PREREQ.ch1s), eng: typeof ENGINE !== 'undefined' && !!ENGINE['CH1S-001'] };
      });
      assert(/화학 ?(I|Ⅰ) 심화/.test(r.text), '과목 이름표에 「화학Ⅰ 심화」 가 없다');
      assert(r.lec >= 1, 'ch1s 에 개념 강의 문이 하나도 없다(강의 연결은 8단계에서 켰다)');
      assert(r.rx && r.rx.length >= 1, '통과했는데 「한 겹 더」 카드가 없다');
      assert(r.cbtn === 0, 'ch1s 에 심화 도전 링크가 섰다(은행은 9단계)');
      const byName = {}; Object.keys(SRC).forEach(c => { byName[SRC[c].m] = c; });
      r.rx.forEach(x => {
        const c = byName[x.nm];
        assert(c, '「' + x.nm + '」 가 심화반 개념 이름이 아니다');
        assert(x.ol.indexOf(DEEPS[c]) >= 0, '「' + x.nm + '」 의 한 겹 더가 ' + c + ' 글이 아니다');
        if (DEEPN[x.nm]) assert(x.ol.indexOf(DEEPN[x.nm]) < 0, '「' + x.nm + '」 에 화학Ⅰ 글(이름 키)이 붙었다');
      });
      assert(r.rx.some(x => DEEPN[x.nm]), '픽스처가 화학Ⅰ 과 이름이 같은 개념을 재지 않는다');
      assert(r.prereq && r.eng, '선수 단원(PREREQ.ch1s)·개념 그래프(ENGINE CH1S-)가 없다');
      await assertNoOverflow(page, 'report-ch1s');
    });

    /* 설계 8단계(2026-10-03) — 심화반 개념은 «ch1s/단원|이름» 과목 키로만 강의에 잇는다(tools/lec_link.py SCOPED).
       심화 개념 18개가 화학Ⅰ 과 이름이 같아, 이름 키(LECMAP)로 내려가면 화학Ⅰ 강의·절로 샌다. 여기서 못 박는 것:
       · 화면의 강의 문마다 주소가 표의 그 개념 과목 키 강의·절이고, 꼬리가 ?from=dt&c=ch1s&r=5 (#절 앞)
       · 화학Ⅰ 과 이름이 같은데 절이 다른 개념(분자량·화학식량: 화학Ⅰ 036#s02 · 심화 036#s03)은 과목대로 갈린다
       · 집계의 대표 이름(«동위원소»)·개념 코드(CH1S-025)도 심화반 키로 찾는다 · 강의가 없는 개념은 문을 안 단다 */
    await test('ch1s · 성적표: 개념 강의 문이 심화반 표(과목 키)의 강의·절로 간다', async page => {
      await serveRows(page, [row('ch1s', R5, 5, W5, '2026-09-20')]);
      const lec = JSON.parse(fs.readFileSync(path.join(ROOT, 'concept-lecture-dt.json'), 'utf8'));
      const keyOf = nm => Object.keys(lec.byUnit).filter(k => k.indexOf('ch1s/') === 0 && k.slice(k.indexOf('|') + 1) === nm)[0];
      const url = k => lec.base + lec.lectures[lec.byUnit[k]].file;
      const tail = k => lec.sec[k] ? (lec.sec[k] === 'q' ? '#q' : '#s' + lec.sec[k]) : '';
      const r = await page.evaluate(() => ({
        links: [].slice.call(document.querySelectorAll('.rx')).filter(x => x.querySelector('a.leclink'))
          .map(x => ({ nm: x.querySelector('.nm').textContent, href: x.querySelector('a.leclink').getAttribute('href') })),
        shared: lecFor('분자량·화학식량', 'ch1s', ''), sharedCh1: lecFor('분자량·화학식량', 'ch1', ''),
        code: lecFor('CH1S-025', 'ch1s', ''), canon: lecFor(ChemEngine.misCanon('동위원소 정의'), 'ch1s', ''),
        unit: lecFor('격자 에너지', 'ch1s', 'Ⅲ-1'), none: lecFor('배수 비례 비교', 'ch1s', ''),
        noneHtml: lecLinkHTML('배수 비례 비교', 'ch1s', 'Ⅰ-2', 5),
        note: lecLinkHTML('시성식은 없음', 'ch1s', '', 5) + '|' + lecLinkHTML('화학식 네 가지', 'ch1s', '', 5)
      }));
      assert(r.links.length >= 1, '심화반 성적표에 강의 문이 붙은 개념이 없다');
      r.links.forEach(x => {
        const k = keyOf(x.nm);
        assert(k, '「' + x.nm + '」 가 심화반 과목 키로 표에 없는데 강의 문이 섰다');
        const want = url(k) + '?from=dt&c=ch1s&r=5' + tail(k);
        assert(x.href === want, '「' + x.nm + '」 강의 주소가 표와 다르다: ' + x.href + ' (기대 ' + want + ')');
      });
      const kS = keyOf('분자량·화학식량');
      assert(r.shared === url(kS) + tail(kS) && /#s03$/.test(r.shared), '심화 「분자량·화학식량」 이 심화반 절로 안 간다: ' + r.shared);
      assert(r.sharedCh1 === lec.base + lec.lectures[lec.map['분자량·화학식량']].file + '#s02', '화학Ⅰ 「분자량·화학식량」 이 바뀌었다: ' + r.sharedCh1);
      assert(r.code === r.shared, '개념 코드로 찾은 강의가 이름으로 찾은 것과 다르다: ' + r.code);
      const kI = keyOf('동위원소 정의');
      assert(r.canon === url(kI) + tail(kI), '대표 이름으로 심화반 강의를 못 찾는다: ' + r.canon);
      const kL = keyOf('격자 에너지');
      assert(kL.indexOf('ch1s/Ⅲ-1|') === 0 && r.unit === url(kL) + tail(kL), '단원을 준 심화반 키가 틀리다: ' + r.unit);
      assert(lec.unmapped['ch1s/Ⅰ-2|배수 비례 비교'] && r.none === '' && r.noneHtml === '', '강의가 없는 심화 개념에 문이 섰다: ' + r.none);
      const kF = keyOf('화학식 네 가지');
      assert(r.note.split('|')[0] === '' && r.note.indexOf('§04 참고 · ' + lec.note[kF]) > 0, '부분 적합 한 줄이 심화반 키로 안 뜬다: ' + r.note);
    });

    await test('ch1s · 성적표: 화학Ⅰ 행과 함께 있어도 깨지지 않는다', async page => {
      const C1 = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_ch1_' + String(n).padStart(2, '0') + '.json'), 'utf8'));
      const rows = [row('ch1', C1(1), 1, [1, 2, 3], '2026-03-01'), row('ch1', C1(2), 2, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], '2026-03-08'),
                    row('ch1s', R1, 1, [0, 1, 2, 3], '2026-09-06'), row('ch1s', R5, 5, W5, '2026-09-20')];
      await serveRows(page, rows);
      const txt = await page.evaluate(() => document.body.innerText);
      assert(/화학 ?(I|Ⅰ) 심화/.test(txt), '심화반 이름표가 없다');
      await assertNoOverflow(page, 'report-ch1-ch1s');
    });

    await test('ch1s · 심화 도전: 은행이 없는 과목은 «준비 중» 이라 말하고 과목 단추에도 안 세운다', async page => {
      await page.goto(BASE + 'challenge.html?course=ch1s&round=3'); await page.waitForTimeout(500);
      const t = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, start: !!document.querySelector('button.btn') }));
      assert(/준비 중/.test(t.h1) && !t.start, '«준비 중» 이 아니다: ' + JSON.stringify(t));
      await page.goto(BASE + 'challenge.html'); await page.waitForTimeout(500);
      const picks = await page.$$eval('.rpick', bs => bs.map(b => b.textContent));
      assert(picks.length === 3 && picks.indexOf('화학Ⅰ 심화') < 0, '과목 단추: ' + picks.join(','));
    });
  }

  /* ══════════════════════════════════════════════════════════════
     7단계(2차) — 화학1 기록을 심화반에 잇고, 과목이 섞이는 곳을 고쳤다 (2026-10-03)
     학생은 과목과 무관하게 «학교-이름» 키 하나라 성적표·재시는 그 학생의 모든 과목 행을 함께 받는다.
       (i)   ch1+ch1s 학생 성적표에 「화학1에서 이어 온 기록」이 맞는 심화 개념으로 뜬다
       (ii)  ch1s 재시가 화학1에서 본 문장을 피하고 틀린 문장을 안 낸다 — 같은 입력이면 같은 재시
       (iii) 한 과목 학생(ch1 · ch2)의 성적표·재시는 고치기 전과 글자까지 같다(tests/fixtures/single_course_snapshot.json)
       (iv)  ch1+ch2 학생은 보고 있는 과목 하나로 정리된다 — 복습 시점·이번 회차·단원 누적이 과목별로 갈린다
     ══════════════════════════════════════════════════════════════ */
  {
    const CE = require(path.join(ROOT, 'chemengine.js'));
    const LINK = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', 'ch1s', 'link_ch1.json'), 'utf8'));
    const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'forms_bank.json'), 'utf8'));
    const RF = (c, n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_' + c + '_' + String(n).padStart(2, '0') + '.json'), 'utf8'));
    const flip = a => (a === 'O' ? 'X' : 'O');
    const SNAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'single_course_snapshot.json'), 'utf8'));
    const mk = (K, course, round, attempt, wrong, date, extra) => {
      const items = RF(course, round).jeongsi.items;
      const ans = items.map((it, i) => wrong.indexOf(i) >= 0 ? flip(it.a) : it.a).join('');
      const units = {};
      items.forEach((it, i) => { const u = units[it.u] || (units[it.u] = { u: it.u, t: 0, w: 0 }); u.t++; if (wrong.indexOf(i) >= 0) u.w++; });
      const score = Math.round(10000 * (items.length - wrong.length) / items.length) / 100;
      return Object.assign({ studentKey: K, name: '이음', school: '가상고', year: '2', course, round, attempt, score, pass: score >= 80, date,
        answers: ans, wrongMis: wrong.map(i => items[i].mis), wrongAxes: {}, units: Object.keys(units).map(k => units[k]), axes: [], isTest: false }, extra || {});
    };
    /* 성적표 창구 흉내 — 서버처럼 ?c= 를 받아 그 과목으로 정리한다(cumulative 는 저장소 엔진). 받은 주소를 모은다. */
    const serve = async (page, rows, K, opts) => {
      opts = opts || {};
      const got = [];
      page.on('request', rq => { const u = rq.url(); if (u.startsWith(BASE)) got.push(u.slice(BASE.length).split('?')[0]); });
      await page.route('**/macros/s/**', route => {
        const u = new URL(route.request().url()), c = u.searchParams.get('c') || '';
        const A = opts.oldServer ? CE.cumulative(rows.map(r => Object.assign({}, r, { course: r.course })))[K] : CE.cumulative(rows, c)[K];
        if (opts.oldServer) { delete A.course; delete A.courses; }
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, student: 'x', rows, excluded: [], cumulative: A, rank: opts.rank || null, cohort: null }) });
      });
      await page.goto(BASE + 'report.html?student=x' + (opts.c ? '&c=' + opts.c : ''));
      await page.waitForSelector('.ladder', { timeout: 20000 });
      await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
      return got;
    };

    /* ── (i) 화학1 → 심화 · 성적표 ── */
    const K1 = '가상고-이음';
    const C1T = ['CH1S-012', 'CH1S-108', 'CH1S-027'];       // 동위원소 정의 · 루이스 구조·전자쌍 · 몰 질량
    const wrongTo = (course, round, set, also) => RF(course, round).jeongsi.items.map((x, i) => i).filter(i => {
      const x = RF(course, round).jeongsi.items[i]; return set.indexOf(course === 'ch1' ? LINK.map[x.c] : x.c) >= 0 || (also && also(i));
    });
    const molCh1 = RF('ch1', 6).jeongsi.items.filter(x => LINK.map[x.c] === 'CH1S-027').map(x => x.c);
    const ROWS1 = [];
    for (let r = 1; r <= 6; r++) ROWS1.push(mk(K1, 'ch1', r, '첫 응시', wrongTo('ch1', r, C1T, i => i % 9 === 4), '2026-03-0' + r + 'T01:00:00Z'));
    /* 6회 재시: 몰 질량 자리(화학1 코드)를 다 맞혔다 — 재시 서명(retakeCids · retakeKeys)으로 «재시에서 고침» */
    ROWS1.push(Object.assign(mk(K1, 'ch1', 6, '재시', [], '2026-03-07T01:00:00Z'),
      { answers: molCh1.map(() => 'O').join(''), retakeCids: molCh1.join(','), retakeKeys: molCh1.map(() => 'O').join(''), wrongMis: [] }));
    ROWS1.push(mk(K1, 'ch1s', 1, '첫 응시', wrongTo('ch1s', 1, ['CH1S-012'], i => i % 7 === 3), '2026-09-07T01:00:00Z'));
    ROWS1.push(mk(K1, 'ch1s', 2, '첫 응시', wrongTo('ch1s', 2, [], i => i % 6 === 1), '2026-09-14T01:00:00Z'));

    await test('7단계 2차 (i) · ch1+ch1s 학생 성적표에 「화학1에서 이어 온 기록」 — 맞는 심화 개념 · 심화반에서 다시 물었는지', async page => {
      const got = await serve(page, ROWS1, K1);
      const its = {}; for (let r = 1; r <= 6; r++) its['ch1#' + r] = RF('ch1', r).jeongsi.items;
      const co = CE.carryOver(ROWS1, its, LINK), cv = CE.carryView(ROWS1, co, 'ch1s');
      const r = await page.evaluate(() => ({
        text: document.getElementById('app').innerText,
        cv: typeof CARRYV !== 'undefined' ? CARRYV : null, latest: latest.course + '#' + latest.round,
        tabs: [].slice.call(document.querySelectorAll('nav.crstabs a')).map(a => (a.getAttribute('aria-current') ? '*' : '') + a.textContent),
        c1rx: [].slice.call(document.querySelectorAll('.rx.c1')).map(x => ({ nm: x.querySelector('.nm').textContent, tag: (x.querySelector('.c1tag') || {}).textContent, line: (x.querySelector('.c1line') || {}).textContent, ol: (x.querySelector('.ol') || {}).textContent || '' })),
      }));
      assert(r.latest === 'ch1s#2', '이번 회차가 심화반 2회가 아니다: ' + r.latest);
      assert(r.tabs.join(',') === '화학 I,*화학 I 심화', '과목 고르기: ' + r.tabs.join(','));
      assert(r.text.indexOf('화학1에서 이어 온 기록') >= 0, '「화학1에서 이어 온 기록」 이 없다');
      assert(JSON.stringify(r.cv) === JSON.stringify(cv), '화면의 이어 온 기록이 엔진(carryOver·carryView)과 다르다');
      const nm = c => LINK.names[c];
      const byNm = {}; r.c1rx.forEach(x => { byNm[x.nm] = x; });
      C1T.forEach(c => assert(byNm[nm(c)], '「' + nm(c) + '」(' + c + ') 이 화학1 기록 합산 고질로 안 섰다: ' + Object.keys(byNm).join(',')));
      r.c1rx.forEach(x => assert(x.tag === '화학1 기록 합산', x.nm + ' 꼬리표: ' + x.tag));
      assert(/심화반에서는 아직 안 물음/.test(byNm[nm('CH1S-108')].line), '루이스 구조: 심화반에서 안 물은 것을 말하지 않는다: ' + byNm[nm('CH1S-108')].line);
      assert(/심화반 1회에서 다시 물어 또 틀림/.test(byNm[nm('CH1S-012')].line), '동위원소 정의: 심화반에서 또 틀린 것을 말하지 않는다: ' + byNm[nm('CH1S-012')].line);
      assert(/재시에서 고침/.test(byNm[nm('CH1S-027')].line) && /다시 물어 맞힘/.test(byNm[nm('CH1S-027')].line), '몰 질량: 화학1 재시에서 고침 · 심화반에서 맞힘: ' + byNm[nm('CH1S-027')].line);
      /* 핵심 글은 심화반 글(코드로 찾는다) — 이름이 같은 화학1 글이 아니다 */
      const SRCN = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', 'ch1s', 'forms_bank_ch1s.json'), 'utf8'));
      const ol12 = (SRCN['CH1S-012'].reading || {}).oneline || '';
      if (ol12) assert(byNm[nm('CH1S-012')].ol.indexOf(ol12.replace(/\*\*/g, '').slice(0, 12)) >= 0, '동위원소 정의 핵심이 심화반 글이 아니다: ' + byNm[nm('CH1S-012')].ol);
      /* 필요한 것만 받았다: 대응표 하나 + 답안 있는 화학1 회차 6개 */
      assert(got.filter(u => u === 'courses/ch1s/link_ch1.json').length === 1, '대응표를 안 받았다(또는 여러 번): ' + got.filter(u => /link_/.test(u)).length);
      const r1 = got.filter(u => /^appdata\/round_ch1_\d\d\.json$/.test(u)).filter((u, i, a) => a.indexOf(u) === i).sort();
      assert(r1.join(',') === [1, 2, 3, 4, 5, 6].map(n => 'appdata/round_ch1_0' + n + '.json').join(','), '화학1 회차 파일: ' + r1.join(','));
      await assertNoOverflow(page, 'report-carry');
    });

    await test('7단계 2차 (i) · 심화반에서 세 번 이상 물으면 심화반 기록이 우선 · 화학1 행이 없으면 아무것도 안 받는다', async page => {
      /* 엔진: 같은 개념을 심화반 3회에서 물어 다 맞혔으면 이어 온 고질이 판단에서 빠진다(own3) */
      const t = 'CH1S-001', name = LINK.names[t];
      const carry = { from: 'ch1', rounds: [1, 2, 3], concepts: {}, chronic: [t], weak: [t] };
      carry.concepts[t] = { c: t, m: name, asked: 3, wrong: 3, rounds: [1, 2, 3], wrongRounds: [1, 2, 3], fixed: false };
      const askR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(r => CE.roundMisOf('ch1s', r).indexOf(CE.misCanon(name)) >= 0);
      assert(askR.length >= 3, name + ' 을 묻는 심화반 회차가 셋이 안 된다');
      const own = n => askR.slice(0, n).map(r => ({ course: 'ch1s', round: r, attempt: '첫 응시', wrongMis: [] }));
      const v2 = CE.carryView(own(2), carry, 'ch1s').list[0], v3 = CE.carryView(own(3), carry, 'ch1s').list[0];
      assert(v2.chronic && !v2.own3 && v2.own.asked === 2 && v2.own.last === 'ok', '두 번 물어 맞혔으면 아직 합산(3/5 → 고질): ' + JSON.stringify(v2));
      assert(!v3.chronic && v3.own3, '세 번 물으면 심화반 기록만(이어 온 고질은 빠진다): ' + JSON.stringify(v3));
      /* 화면: 심화반 행만 있는 학생은 대응표·화학1 회차를 하나도 안 받는다 */
      const only = ROWS1.filter(x => x.course === 'ch1s');
      const got = await serve(page, only, K1);
      assert(!got.some(u => /link_ch1|round_ch1_/.test(u)), '화학1 행이 없는데 받았다: ' + got.filter(u => /link_ch1|round_ch1_/.test(u)).join(','));
      const txt = await page.evaluate(() => document.getElementById('app').innerText);
      assert(txt.indexOf('화학1에서 이어 온 기록') < 0 && !(await page.$('nav.crstabs')), '한 과목인데 이어 온 기록·과목 고르기가 섰다');
    });

    /* ── (ii) 재시 · 게이트가 화학1에서 본 문장을 피한다 ── */
    const K2 = '가상고-재시이음';
    const ROWS2 = [];
    for (let r = 1; r <= 6; r++) ROWS2.push(mk(K2, 'ch1', r, '첫 응시', RF('ch1', r).jeongsi.items.map((x, i) => i).filter(i => i % 5 === 0), '2026-03-0' + r + 'T01:00:00Z'));
    const S1 = RF('ch1s', 1);
    ROWS2.push(mk(K2, 'ch1s', 1, '첫 응시', S1.jeongsi.items.map((x, i) => i).filter(i => i % 3 === 0), '2026-09-07T01:00:00Z'));
    const its2 = {}; for (let r = 1; r <= 6; r++) its2['ch1#' + r] = RF('ch1', r).jeongsi.items;
    const CO2 = CE.carryOver(ROWS2, its2, LINK);
    const engineRetake = withCarry => {
      const items = S1.jeongsi.items, first = ROWS2[ROWS2.length - 1];
      const g = CE.gradeAttempt(first.answers.split(''), items, S1.scoring), dx = CE.diagnose(g, BANK), seen = {}, ws = {};
      items.forEach(x => { seen[CE.norm(x.s)] = 1; }); g.perItem.forEach((p, i) => { if (!p.ok) ws[CE.norm(items[i].s)] = 1; });
      if (withCarry) { Object.keys(CO2.seen).forEach(k => { seen[k] = 1; }); Object.keys(CO2.wrongStmts).forEach(k => { ws[k] = 1; }); }
      const gate = CE.buildGate(dx.wrongConcepts, BANK, seen);
      const rt = CE.buildRetake(2, S1.retakeC, dx.wrongConcepts.map(w => w.c).filter(Boolean), BANK, seen, ws, CE.lvlOn('ch1s', 1) ? items : false);
      return { gate: gate.gates.map(x => x.checks.map(c => c.s)), retake: rt.items.map(x => (x.c || '') + '|' + x.s + '=' + x.a) };
    };
    const hits = st => ({ seen: st.filter(s => CO2.seen[CE.norm(s)]).length, wrong: st.filter(s => CO2.wrongStmts[CE.norm(s)]).length });
    const stmts = o => [].concat.apply([], o.gate).concat(o.retake.map(x => x.split('|')[1].replace(/=[OX]$/, '')));
    /* 게이트는 화면이 뿌리 차례로 다시 늘어놓는다(applyRootOrder) — 확인 문장 묶음을 차례 없이 맞대고, 재시는 차례까지 맞댄다. */
    const same = (x, y) => JSON.stringify(x.retake) === JSON.stringify(y.retake)
      && JSON.stringify(x.gate.map(g => g.join('|')).sort()) === JSON.stringify(y.gate.map(g => g.join('|')).sort());

    await test('7단계 2차 (ii) · ch1s 재시·게이트가 화학1에서 본 문장을 피하고 틀린 문장을 안 낸다 · 같은 입력이면 같은 재시', async page => {
      const noC = engineRetake(false), wC = engineRetake(true);
      const h0 = hits(stmts(noC)), h1 = hits(stmts(wC));
      assert(h0.seen + h0.wrong > 0, '픽스처가 화학1 문장을 재지 않는다(이을 것이 없어도 같은 재시): ' + JSON.stringify(h0));
      assert(h1.seen === 0 && h1.wrong === 0, '화학1에서 본 문장이 남았다: ' + JSON.stringify(h1));
      const mock = p => p.route('**/script.google.com/**', route => {
        const u = route.request().url();
        if (u.includes('student=')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, student: K2, rows: ROWS2, excluded: [], cumulative: null, rank: null, cohort: null }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated: false, reportLink: 'https://example.test/r' }) });
      });
      await mock(page);
      const one = async () => {
        await page.goto(BASE + 'index.html?retake=abcdef0123456&c=ch1s&r=1');
        await page.waitForFunction(() => typeof S !== 'undefined' && S && S.view === 'gate', null, { timeout: 20000 });
        return page.evaluate(() => { const gate = S.gate.gates.map(g => g.checks.map(c => c.s)); startRetake(); return { gate, retake: S.keyItems.map(x => (x.c || '') + '|' + x.s + '=' + x.a) }; });
      };
      const a = await one(), b = await one();
      assert(JSON.stringify(a) === JSON.stringify(b), '같은 입력에 다른 게이트·재시가 나왔다');
      assert(same(a, wC) && !same(a, noC), '재시 링크의 게이트·재시가 엔진(화학1 문장 더함)과 다르다');
      /* 종이 재시(retakegen.js)도 같은 규칙 — 화학1에서 본·틀린 문장 0, 두 번 만들어도 같다 */
      await page.goto(BASE + 'retake_entry.html');
      await page.waitForFunction(() => !!window.DTRetake, null, { timeout: 20000 });
      const paper = await page.evaluate(async rows => {
        const x = await DTRetake.items({ key: 'k', course: 'ch1s', round: 1, attemptNo: 2, rows }), y = await DTRetake.items({ key: 'k', course: 'ch1s', round: 1, attemptNo: 2, rows });
        return { a: x.items.map(i => i.s), same: JSON.stringify(x.items) === JSON.stringify(y.items), carried: x.carried };
      }, ROWS2);
      assert(paper.same && paper.carried === 6, '종이 재시: 같은 입력 같은 결과 · 화학1 6개 회차: ' + JSON.stringify([paper.same, paper.carried]));
      const hp = hits(paper.a);
      assert(hp.seen === 0 && hp.wrong === 0, '종이 재시에 화학1에서 본 문장: ' + JSON.stringify(hp));
    });

    await test('7단계 2차 (ii) · 앱 안 흐름(채점 → 게이트)도 같은 재시 · 학생 기록을 못 받으면 지금처럼', async page => {
      let fail = false;
      await page.route('**/script.google.com/**', route => {
        const u = route.request().url();
        if (u.includes('student=')) { if (fail) return route.abort(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: ROWS2 }) }); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated: false, reportLink: 'https://example.test/r' }) });
      });
      const inApp = async () => {
        await page.goto(BASE + 'index.html?test=1'); await page.waitForTimeout(600);
        await page.evaluate(async ans => {
          const m = MANIFEST.rounds.find(x => x.course === 'ch1s' && x.round === 1);
          S = blank(); S.name = '재시이음'; S.school = '가상고'; S.grade = '2'; S.round = await loadRound(m.data); S.roundId = m.data;
          S.keyItems = S.round.jeongsi.items; S.answers = ans.split(''); S.attemptNo = 1;
          await doGrade(); await afterReport();
        }, ROWS2[ROWS2.length - 1].answers);
        await page.waitForFunction(() => S.view === 'gate', null, { timeout: 15000 });
        return page.evaluate(() => { const gate = S.gate.gates.map(g => g.checks.map(c => c.s)); startRetake(); return { gate, retake: S.keyItems.map(x => (x.c || '') + '|' + x.s + '=' + x.a) }; });
      };
      const a = await inApp();
      assert(same(a, engineRetake(true)), '앱 안 흐름의 게이트·재시가 재시 링크(화학1 문장 더함)와 다르다');
      fail = true;
      const b = await inApp();
      assert(same(b, engineRetake(false)), '학생 기록을 못 받았는데 지금과 다른 재시가 나왔다');
    }, { adminGate: true });

    /* ── (iii) 한 과목 학생은 글자까지 그대로 ── */
    for (const id of Object.keys(SNAP.students)) {
      await test('7단계 2차 (iii) · ' + id + ' 만 듣는 학생 — 성적표 글·재시·종이 재시·누적이 고치기 전과 같다', async page => {
        const S0 = SNAP.students[id], rows = S0.rows, key = rows[0].studentKey;
        const A = CE.cumulative(rows)[key];
        assert(JSON.stringify(A) === JSON.stringify(S0.A), '엔진 누적이 달라졌다');
        await page.route('**/script.google.com/**', route => {
          const u = route.request().url();
          const body = u.includes('student=') ? { ok: true, student: key, rows, excluded: [], cumulative: A, rank: S0.rank, ranks: [], cohort: null, challenges: [] } : { ok: true };
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.goto(BASE + 'report.html?student=x');
        await page.waitForSelector('.card.sols', { timeout: 30000 });
        await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);
        const rep = await page.evaluate(() => document.getElementById('app').innerText);
        if (rep !== S0.report) {
          const a = rep.split('\n'), b = S0.report.split('\n'); let i = 0; while (i < a.length && a[i] === b[i]) i++;
          throw new Error('성적표 글이 달라졌다 — ' + (i + 1) + '번째 줄: «' + (a[i] || '') + '» ≠ «' + (b[i] || '') + '»');
        }
        await page.goto(BASE + 'index.html?retake=abcdef0123456&c=' + rows[0].course + '&r=4');
        await page.waitForFunction(() => typeof S !== 'undefined' && S && S.view === 'gate', null, { timeout: 30000 });
        const gate = await page.evaluate(() => S.gate.gates.map(g => (g.c || g.mis || '') + '|' + g.checks.map(c => c.s + '=' + c.a).join(' / ')));
        const retake = await page.evaluate(() => { startRetake(); return S.keyItems.map(x => (x.c || '') + '|' + x.s + '=' + x.a); });
        assert(JSON.stringify(gate) === JSON.stringify(S0.gate), '재시 링크 게이트가 달라졌다');
        assert(JSON.stringify(retake) === JSON.stringify(S0.retake), '재시 문항이 달라졌다');
        await page.goto(BASE + 'retake_entry.html');
        await page.waitForFunction(() => !!window.DTRetake, null, { timeout: 30000 });
        const paper = await page.evaluate(async a => { const r = await DTRetake.items({ key: a.key, course: a.course, round: 4, attemptNo: 2, rows: a.rows }); return r.items.map(x => (x.c || '') + '|' + x.s + '=' + x.a); }, { key, course: rows[0].course, rows });
        assert(JSON.stringify(paper) === JSON.stringify(S0.paper), '종이 재시가 달라졌다');
      });
    }

    /* ── (iv) ch1+ch2 학생 — 과목별로 갈린다 ── */
    const K4 = '가상고-두과목';
    const ROWS4 = [];
    [1, 2, 3].forEach(r => ROWS4.push(mk(K4, 'ch1', r, '첫 응시', RF('ch1', r).jeongsi.items.map((x, i) => i).filter(i => i % 4 === 0), '2026-03-0' + r + 'T01:00:00Z')));
    [1, 2, 3].forEach(r => ROWS4.push(mk(K4, 'ch2', r, '첫 응시', RF('ch2', r).jeongsi.items.map((x, i) => i).filter(i => i % 5 === 1), '2026-09-0' + r + 'T01:00:00Z')));
    const unitsOf = c => { const u = {}; [1, 2, 3].forEach(r => RF(c, r).jeongsi.items.forEach(x => { u[x.u] = 1; })); return u; };

    await test('7단계 2차 (iv) · ch1+ch2 학생 — 엔진: spacedReview·latest·고질이 과목별로 갈린다', async () => {
      /* 예전: spacedReview 가 회차 번호만으로 묶어 ch1 3회와 ch2 3회를 한 회차로 섞었다 */
      const sr = CE.spacedReview(ROWS4, 3), sr1 = CE.spacedReview(ROWS4, 3, 'ch1'), sr2 = CE.spacedReview(ROWS4, 3, 'ch2');
      const misOf = c => { const m = {}; ROWS4.filter(r => r.course === c).forEach(r => r.wrongMis.forEach(x => { m[CE.misCanon(x)] = 1; })); return m; };
      const m1 = misOf('ch1'), m2 = misOf('ch2');
      assert(sr.length && sr.every(x => m2[x.mis]), '과목을 안 주면 가장 최근 과목(ch2)만: ' + sr.map(x => x.mis).join(','));
      assert(JSON.stringify(sr) === JSON.stringify(sr2), '과목을 안 주면 ch2 를 준 것과 같아야 한다');
      assert(sr1.length && sr1.every(x => m1[x.mis]), 'ch1 을 주면 ch1 개념만: ' + sr1.map(x => x.mis).join(','));
      const one = CE.spacedReview(ROWS4.filter(r => r.course === 'ch2'), 3);
      assert(JSON.stringify(one) === JSON.stringify(sr2), '한 과목 행만 줬을 때와 같아야 한다');
      const A = CE.cumulative(ROWS4)[K4], A1 = CE.cumulative(ROWS4, 'ch1')[K4];
      assert(A.course === 'ch2' && A.trend.every(t => t.course === 'ch2') && A.trend.length === 3 && A.coverageRound === 3, 'latest 가 가장 최근 과목(ch2)이 아니다');
      assert(A1.course === 'ch1' && A1.trend.every(t => t.course === 'ch1'), '?c=ch1 이 화학1로 정리되지 않았다');
      assert(JSON.stringify(A.courses) === '["ch1","ch2"]', '과목 목록: ' + JSON.stringify(A.courses));
      /* 날짜가 없으면 예전 순서(글자순 마지막) */
      const nd = ROWS4.map(r => Object.assign({}, r, { date: '' }));
      assert(CE.cumulative(nd)[K4].course === 'ch2' && CE.focusCourse(nd.slice().reverse()).course === 'ch2', '날짜가 없을 때 예전 순서가 아니다');
      /* 화학1 을 나중에 봤으면 화학1 */
      const late1 = ROWS4.map(r => Object.assign({}, r, { date: r.course === 'ch1' ? '2026-10-0' + r.round : r.date }));
      assert(CE.cumulative(late1)[K4].course === 'ch1', '가장 최근 날짜의 과목이 아니다');
    });

    await test('7단계 2차 (iv) · ch1+ch2 학생 성적표 — 이번 회차·복습 시점·단원 누적이 보고 있는 과목만 · 과목 고르기', async page => {
      await serve(page, ROWS4, K4);
      const read = () => page.evaluate(() => ({
        latest: latest.course + '#' + latest.round, who: (document.querySelector('.hero .who') || {}).textContent || '',
        units: [].slice.call(document.querySelectorAll('.heatrow')).map(e => e.textContent),
        aggUnits: aggFromRows().units.map(u => u.u),
        rv: [].slice.call(document.querySelectorAll('.rvrow .rvm')).map(e => e.textContent),
        trendN: A.trend.length, rows: allRows.map(r => r.course).filter((c, i, a) => a.indexOf(c) === i),
        tabs: [].slice.call(document.querySelectorAll('nav.crstabs a')).map(a => (a.getAttribute('aria-current') ? '*' : '') + a.getAttribute('href')),
      }));
      const u1 = unitsOf('ch1'), u2 = unitsOf('ch2');
      let r = await read();
      assert(r.latest === 'ch2#3' && /화학 II/.test(r.who), '이번 회차가 화학Ⅱ 3회가 아니다: ' + r.latest + ' ' + r.who);
      assert(r.trendN === 3 && r.rows.join(',') === 'ch2', '누적·행이 화학Ⅱ 만이 아니다: ' + r.trendN + ' ' + r.rows);
      assert(r.aggUnits.length && r.aggUnits.every(u => u2[u] && !u1[u]), '단원 누적에 화학Ⅰ 단원이 섞였다: ' + r.aggUnits.join(','));
      const m2 = {}; ROWS4.filter(x => x.course === 'ch2').forEach(x => x.wrongMis.forEach(m => { m2[CE.misCanon(m)] = 1; }));
      assert(r.rv.every(m => m2[m]), '복습 시점에 다른 과목 개념: ' + r.rv.join(','));
      assert(r.tabs.length === 2 && /c=ch1/.test(r.tabs[0]) && /^\*.*c=ch2/.test(r.tabs[1]), '과목 고르기: ' + r.tabs.join(' | '));
      /* 화학Ⅰ 단추 → 화학Ⅰ 로 정리(서버가 ?c= 를 받는다) */
      await page.goto(BASE + 'report.html?student=x&c=ch1'); await page.waitForSelector('.ladder', { timeout: 20000 }); await page.waitForTimeout(500);
      r = await read();
      assert(r.latest === 'ch1#3' && /화학 I /.test(r.who + ' ') && r.rows.join(',') === 'ch1', '?c=ch1 이 화학Ⅰ 이 아니다: ' + r.latest + ' ' + r.rows);
      assert(r.aggUnits.every(u => u1[u] && !u2[u]), '화학Ⅰ 단원 누적에 화학Ⅱ 단원: ' + r.aggUnits.join(','));
      assert(/^\*.*c=ch1/.test(r.tabs[0]), '화학Ⅰ 단추가 눌린 상태가 아니다');
      await assertNoOverflow(page, 'report-two-courses');
    });

    await test('7단계 2차 (iv) · 옛 서버(과목을 안 고른 누적)를 받아도 화면이 보고 있는 과목으로 다시 센다', async page => {
      await serve(page, ROWS4, K4, { oldServer: true, rank: { round: 3, avg: 70, score: 80, per100: 30, n: 9, sd: 8, dist: [0, 0, 0, 0, 0, 1, 3, 3, 2, 0] } });
      const r = await page.evaluate(() => ({ latest: latest.course + '#' + latest.round, trend: A.trend.map(t => t.course).join(','), rank: !!document.querySelector('.rankcard') }));
      assert(r.latest === 'ch2#3' && r.trend === 'ch2,ch2,ch2', '옛 서버 누적을 다시 세지 않았다: ' + JSON.stringify(r));
      assert(!r.rank, '어느 과목 것인지 모르는 석차를 실었다');
    });
  }

  await BROWSER.close();
  srv.close();

  const fail = results.filter(r => !r.ok);
  console.log('\n결과: ' + (results.length - fail.length) + '/' + results.length + ' 통과'
    + (fail.length ? '  ← 실패 스크린샷: tests/fail-*.png' : ''));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('러너 오류:', e); process.exit(2); });
