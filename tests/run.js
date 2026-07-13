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
    assert(await page.$('#f_name'), '학생 정보 화면이 아님');
    assert(!(await page.$('#f_test')), '테스트 모드 체크박스는 제거되어야 함');
    await page.fill('#f_name', '회귀테스트'); await page.fill('#f_school', '테스트중'); await page.fill('#f_grade', '2');
    await page.click('.btnrow button'); await page.waitForTimeout(500);
    assert(await page.$('.rchip'), '회차 선택 화면이 아님');
    await page.click('.rchip');                        // 첫 회차
    // index.html은 `let S`라 window.S가 없음 → typeof로 접근
    await page.waitForFunction(() => typeof S !== 'undefined' && S.round && S.round.jeongsi && S.round.jeongsi.items, null, { timeout: 8000 });
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
    assert(text.indexOf('조민수') < 0 && text.indexOf('이지호') < 0, '미해석 링크에 데모 학생 데이터가 노출됨');
    assert(/열 수 없습니다|확인/.test(text), '링크 오류 안내가 표시되지 않음');
    await assertNoOverflow(page, 'report');
  });
  await test('report · 파라미터 없으면 미리보기(데모) 표시', async page => {
    // 링크 없이 report.html 직접 열기 = 미리보기. 이때만 데모 학생을 보여준다(OG 프리뷰 용).
    await page.goto(BASE + 'report.html'); await page.waitForTimeout(1200);
    const text = await page.$eval('#app', e => e.textContent).catch(() => '');
    assert(text.indexOf('조민수') >= 0, '파라미터 없는 미리보기에서 데모가 사라짐');
    await assertNoOverflow(page, 'report');
  });

  /* ── 8. 홈: 타일 링크 무결성 (가리키는 파일이 전부 존재) ── */
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
      const body = ['cleanName_', 'normSchool_', 'keyOf_', 'schoolAkin_', 'canonicalKey_'].map(grab).join('\n');
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

  await BROWSER.close();
  srv.close();

  const fail = results.filter(r => !r.ok);
  console.log('\n결과: ' + (results.length - fail.length) + '/' + results.length + ' 통과'
    + (fail.length ? '  ← 실패 스크린샷: tests/fail-*.png' : ''));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('러너 오류:', e); process.exit(2); });
