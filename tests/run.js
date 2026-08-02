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

  await BROWSER.close();
  srv.close();

  const fail = results.filter(r => !r.ok);
  console.log('\n결과: ' + (results.length - fail.length) + '/' + results.length + ' 통과'
    + (fail.length ? '  ← 실패 스크린샷: tests/fail-*.png' : ''));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('러너 오류:', e); process.exit(2); });
