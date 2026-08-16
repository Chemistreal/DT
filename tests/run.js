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
    assert(/서울대청중-이시현/.test(txt) && /대청중-이시현/.test(txt), '무엇을 합칠지 안 적었다');
    assert(/대청중학교/.test(txt), '표기 정리 대상을 안 적었다');
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

     화학Ⅰ 1회가 실제로 10개다(12개가 아니다). 처음엔 12로 보였는데, 그건
     회차 표를 만드는 자가 **과목을 안 보고** 세었기 때문이었다 — 일반화학
     회차 파일에 실린 CH1 개념을 «화학Ⅰ 1회» 로 오인했다. 스스로 검토하다
     잡았다. 그래서 여기서는 실데이터로 한 번, 표를 좁혀 한 번 본다. */
  await test('challenge · 모자라면 모자란 대로 내고 그렇다고 말한다', async page => {
    await page.goto(BASE + 'challenge.html?course=ch1&round=1'); await page.waitForTimeout(400);
    const real = await page.evaluate(() => poolFor('ch1', 1)
      .filter((q, i, a) => a.findIndex(x => x.c === q.c) === i).length);
    assert(real > 0 && real < 12, '화학Ⅰ 1회가 12개 미만이 아니다 — 표를 다시 보라 (' + real + ')');
    const t0 = await page.evaluate(() => document.body.innerText);
    assert(t0.includes('심화 문항 ' + real + '개'), '실데이터에서 수를 사실대로 안 적었다: ' + real);

    const n = await page.evaluate(() => {
      const keep = Object.keys(CHALLENGE_ROUND).filter(k => /^CH1-/.test(k)).slice(0, 5);
      Object.keys(CHALLENGE_ROUND).forEach(k => { if (!keep.includes(k)) CHALLENGE_ROUND[k] = 99; });
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

  /* ── 6. 문자 템플릿: 탭 구성 + 복사 = 미리보기 일치 + 미입력 경고 ── */
  await test('letters · 탭/복사/자리표시', async page => {
    await page.goto(BASE + 'letters.html'); await page.waitForTimeout(400);
    const tabs = await page.$$eval('#tabs button', bs => bs.map(b => b.textContent));
    assert(/16회.*16회.*6회/.test(tabs.join(' ')), '탭 구성(16/16/6) 불일치: ' + tabs.join(','));
    await page.click('#tabs button:nth-child(2)');                       // 화학Ⅱ
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
    }));
    assert(st.load === 'fail', '상태가 fail 이 아니다: ' + st.load);
    assert(st.disabled, '저장 단추가 안 잠겼다');
    assert(st.bad, '실패 배너가 안 뜬다');
    assert(/서버에 저장된 명단이 아닙니다/.test(st.text), '무엇이 보이는지 안 알려 준다');
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
    }));
    /* 진짜 첫 설정이다 — 이때는 기본 명단을 띄우고 저장을 열어 둬야 한다. */
    assert(st.load === 'empty', '상태가 empty 가 아니다: ' + st.load);
    assert(!st.disabled, '저장이 잠겨 있다 — 첫 설정을 못 한다');
    assert(!st.bad, '붉은 배너가 뜬다 — 실패가 아닌데');
    assert(st.n > 0, '기본 명단이 안 떴다');
  }, { adminGate: true });

  await test('roster · 서버 명단이 오면 그것을 쓴다', async page => {
    await page.route('**/macros/s/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, classes: [
        { label: '화학1 일6-10', course: 'ch1', students: ['강신우', '고영훈'], round: 7 } ] }) }));
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
      const keys = ['잠실중-김예성', '과천문원중-최민준', '문원중-최민준', '대치초-홍길동', '서울고-김철수', ''];
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
      assert(F.schoolAkin_('문원중', '과천문원중') === true, '포함관계 학교 미인식');
      assert(F.schoolAkin_('대치중', '청담중') === false, '무관 학교 오인식');
      assert(F.schoolAkin_('중', '과천문원중') === false, '2자 이하 공통 오연결(가드 실패)');
      assert(F.schoolAkin_('문원중', '문원고') === false, '중/고 구분 실패');
      assert(F.schoolAkin_('휘문', '휘문중') === true, '학교종류 접미 유무만 다른 경우 미인식(휘문/휘문중)');
      assert(F.schoolAkin_('휘문중', '휘문고') === false, '동일 지역명 다른 학교종류 오인식(휘문중/휘문고)');

      // 기존: 문원중-최민준 한 명. 과천문원중으로 다시 오면 그 키로 연결
      const idxOne = { '문원중-최민준': { name: '최민준', schools: ['문원중'] } };
      const A = make(idxOne);
      assert(A.canonicalKey_('최민준', '과천문원중') === '문원중-최민준', '포함관계 학생 자동 연결 실패');
      assert(A.canonicalKey_('최민준', '문원중') === '문원중-최민준', '동일 학교 연결 실패');
      assert(A.canonicalKey_('김서준', '문원중') === '문원중-김서준', '동명이 아닌 신규가 잘못 연결됨');
      assert(A.canonicalKey_('최민준', '단대부중') === '단대부중-최민준', '무관 학교인데 잘못 연결됨');

      // 오병합 방지: 같은 이름 최민준이 서로 다른(둘 다 포함관계) 학교로 이미 2명 → 연결하지 않음
      const idxAmb = {
        '동문원중-최민준': { name: '최민준', schools: ['동문원중'] },
        '서문원중-최민준': { name: '최민준', schools: ['서문원중'] },
      };
      const B = make(idxAmb);
      assert(B.canonicalKey_('최민준', '문원중') === '문원중-최민준', '모호(2명+)한데 임의 연결됨 — 분리 유지 실패');

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
      const key = '잠실중-김예성';
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

  /* ── 문자에 실리는 이름 ──────────────────────────────────────────
     명단·시트의 이름 칸에 `김지완 대청중` 처럼 학교가 붙어 있을 수 있다
     (명단에 두 명을 넣을 방법이 없던 때의 흔적). 그대로 실려 학부모에게
     "김지완 대청중 학생" 이라고 나갔다 — 선생님이 받은 실물이 그랬다.
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
        ctx.absentMsg({ name: '김지완 대청중', course: 'ch1', round: 7, link: L }, '1'),
        ctx.absentMsg({ name: '김지완 대청중', course: 'ch1', round: 7, link: L }, '2'),
        ctx.shareMsg({ name: '김지완 내정중', course: 'ch1', round: 7, att: '정시',
                       score: 62, next: '재시', link: '' }, '1'),
        ctx.passMsg({ name: '김지완(대청중)', course: 'ch1', round: 7, att: '정시',
                      score: 92, tries: 1, link: '' }),
      ];
      const dirty = outs.filter(o => /(내정|대청)/.test(o));
      assert(!dirty.length, '학교가 문구에 실렸다: ' + (dirty[0] || '').split('\n')[0]);
      assert(outs.every(o => o.indexOf('김지완 학생') >= 0),
             "'김지완 학생' 이 없다: " + outs.map(o => o.split('\n')[0]).join(' / '));
      /* 붙여 쓴 이름은 안 가른다 — 멀쩡한 이름이 잘리면 더 나쁘다. */
      assert(ctx.justName('김지완대청중') === '김지완대청중', '붙여 쓴 이름을 갈랐다');
      assert(ctx.justName('김 지완') === '김 지완', '짧은 이름을 갈랐다');
      results.push({ name, ok: true, ms: Date.now() - t0 });
      console.log('  PASS  ' + name + ' (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: String(e && e.message || e) });
      console.log('  FAIL  ' + name + ' — ' + String(e && e.message || e).split('\n')[0]);
    }
  }

  await BROWSER.close();
  srv.close();

  const fail = results.filter(r => !r.ok);
  console.log('\n결과: ' + (results.length - fail.length) + '/' + results.length + ' 통과'
    + (fail.length ? '  ← 실패 스크린샷: tests/fail-*.png' : ''));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('러너 오류:', e); process.exit(2); });
