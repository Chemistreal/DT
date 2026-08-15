/* ============================================================
   **성적표 Word 저장** — 종이가 화면과 같은 말을 하는가 (브라우저 필요)
   ------------------------------------------------------------
   2026-08-11, 선생님 — *"인쇄규칙하지말고 워드파일로 다운받을수있게
   exam스타일로"*.

   왜 이 검사가 이렇게 깐깐한가
   ----------------------------
   이 자를 만들면서 **정답률을 거꾸로 적었다.**

       화면(unitHeat)   맞은 수 = u.t - u.w      ← `u.w` 는 **틀린 수**다
       처음 쓴 Word     맞은 수 = u.w

   그래서 88점으로 통과한 학생의 고체 단원이 화면에서는 `8/8 · 100%`,
   종이에서는 `0/8 · 0%` 로 찍혔다. **둘 다 그럴듯해 보인다.** 0%가 88점과
   안 맞는 것이 눈에 띄어서 겨우 잡았지, 숫자가 어중간했으면 그대로 나갔다.
   학부모가 그 종이를 들고 아이한테 무슨 말을 할지 생각하면, 이 저장소에서
   가장 나쁜 갈래의 잘못이다 — **틀린 것처럼 보이지 않으면서 틀린다.**

   그래서 여기서는 «있다/없다» 를 세지 않는다. **화면에 뜬 숫자와 종이에
   찍힌 숫자를 한 줄씩 맞춰 본다.** (파이널의 tests/docx-report.js 와 같은
   규칙이다 — 거기서도 석차를 두 쪽에서 맞춰 본다.)

   실행:
       PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node tests/docx-report.js
   ============================================================ */
'use strict';

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE || 'playwright';
const PORT = Number(process.env.PORT || 8967);
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);
let fail = 0;
const chk = (n, ok, extra) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (extra ? '  ' + extra : ''));
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  const p = path.join(ROOT, u === '/' ? 'index.html' : u.replace(/^\//, ''));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

/* docx 안의 글자만 뽑는다. 표 칸은 붙어 나오므로 칸 경계를 공백으로 벌린다 —
   안 벌리면 `9/15분자간힘` 처럼 붙어서 숫자 맞추기가 못 쓰게 된다. */
function docxText(file, tmp) {
  execFileSync('unzip', ['-o', '-q', file, 'word/document.xml', '-d', tmp]);
  const xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
  return xml.replace(/<\/w:(tc|p|tr)>/g, ' ').replace(/<[^>]+>/g, '')
            .replace(/ /g, ' ').replace(/\s+/g, ' ');
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const tmp = fs.mkdtempSync('/tmp/dtdocx-');
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));
  const ctx = await browser.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));

  await p.goto(`http://localhost:${PORT}/report.html`, { waitUntil: 'load', timeout: 40000 });
  await p.waitForFunction(() => !!window.__dtRpt, null, { timeout: 30000 });

  /* ── 오답노트를 재려면 **답안 문자열**이 있어야 한다 ────────────────
     화면에 심어 둔 시범 자료(SYN_HARD)에는 답안이 없다 — 그래서 오답노트가
     아예 안 만들어진다. 그 상태로 «없다» 고 재면 앱이 아니라 시범 자료를
     재는 것이 된다.

     시트를 통째로 흉내 내는 대신, **진짜 코드 길은 그대로 두고** 답안만
     넣어 다시 그리게 한다: 문항은 저장소의 round 파일에서 오고, 묶고 세는
     것도 buildSolutions 가 한다. 앞 다섯 문항만 틀린 답안이다. */
  const seeded = await p.evaluate(async () => {
    const items = await loadRoundItems(latest.course, latest.round);
    if (!items || !items.length) return { no: '회차 문항을 못 읽었다' };
    const ans = items.map((it, i) =>
      i < 5 ? (String(it.a).toUpperCase() === 'O' ? 'X' : 'O') : String(it.a).toUpperCase()).join('');
    (allRows || []).forEach(r => {
      if (r.course === latest.course && Number(r.round) === Number(latest.round)) r.answers = ans;
    });
    (latestRows || []).forEach(r => { r.answers = ans; });
    await fillMainSolutions();
    return { n: items.length, wrong: 5 };
  });
  chk('답안을 심어 오답노트를 만들 수 있다', !seeded.no, seeded.no || (seeded.n + '문항'));

  /* ── 화면이 말하는 숫자를 먼저 걷는다 ── */
  const screen = await p.evaluate(() => {
    const R = window.__dtRpt;
    return {
      name: (R.A.info && R.A.info.name) || '',
      round: R.latest.round,
      final: R.latest.finalScore,
      passed: !!R.latest.passed,
      taken: R.A.trend.length,
      passedRounds: R.A.passedRounds,
      chronic: (R.A.chronicMis || []).map(m => m.mis),
      units: [].slice.call(document.querySelectorAll('.heatrow')).map(r => ({
        u: r.querySelector('.hu').textContent.trim(),
        v: r.querySelector('.hv').textContent.trim()   // "맞은/전체"
      }))
    };
  });
  console.log(`\n화면: ${screen.round}회 · ${screen.final}점 · 단원 ${screen.units.length}개`);

  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 90000 }),
    p.click('#docxBtn')
  ]);
  const file = path.join(tmp, 'r.docx');
  await dl.saveAs(file);
  chk('Word 파일이 만들어진다', fs.statSync(file).size > 5000,
      fs.statSync(file).size + '바이트');

  const fn = await p.evaluate(async () => (await DTDOCX.build()).fn);
  chk('파일 이름에 학생과 회차가 들어간다',
      fn.includes(screen.name) && fn.includes(String(screen.round) + '회') && fn.endsWith('.docx'),
      fn);

  const txt = docxText(file, tmp);

  console.log('\n── 종이가 화면과 같은 말을 하는가 ──');
  chk('이름', txt.includes(screen.name), true);

  /* ── 오답노트 (선생님 요청 2026-08-15) ──────────────────────────────
     화면에는 「문항별 정오」 와 「오개념 정리」 가 진작에 있었는데, **받는
     파일에는 없었다.** 학부모가 손에 쥐는 것은 화면이 아니라 이 파일이다.

     ⚠ 여기서 답안을 다시 맞춰 보지 않는다 — 화면이 만든 목록(__wrongbook)을
       그대로 견준다. 두 곳이 따로 세면 언젠가 종이와 화면이 다른 말을 한다. */
  const wb = await p.evaluate(() => window.__wrongbook || null);
  console.log('  화면이 센 오답 ' + (wb ? wb.items.length : '—') + '문항');
  chk('화면이 오답 목록을 넘긴다', !!wb, wb ? '' : '__wrongbook 이 없다');
  if (wb && wb.items.length) {
    chk('종이에 «오답노트» 칸이 있다', txt.includes('오답노트'), true);
    const miss = wb.items.filter(it => !txt.includes(String(it.n) + '번'));
    chk('틀린 문항 번호가 하나도 안 빠진다', miss.length === 0,
        miss.map(m => m.n + '번').join(' ') || wb.items.length + '문항 다 있음');
    /* 문장이 잘려 들어가면 «몇 번을 틀렸다» 만 남고 무엇을 틀렸는지는 사라진다. */
    const cut = wb.items.filter(it => it.s && !txt.includes(it.s.slice(0, 16)));
    chk('문장도 같이 실린다', cut.length === 0,
        cut.length ? cut[0].s.slice(0, 24) + '…' : '전부');
    /* 왜 틀렸는지가 오답노트의 본체다. 번호와 문장만 있으면 그냥 채점표다. */
    const why = wb.items.filter(it => it.w);
    if (why.length) chk('왜 틀렸는지도 실린다',
        why.every(it => txt.includes(it.w.slice(0, 14))),
        why.length + '개 중 ' + why.filter(it => txt.includes(it.w.slice(0, 14))).length);
    /* 개념 묶음도 화면과 같은 이름이어야 한다. */
    const mis = [...new Set(wb.items.map(it => it.mis).filter(Boolean))];
    chk('개념 이름도 같다', mis.every(m => txt.includes(m)),
        mis.filter(m => !txt.includes(m)).join(' ') || mis.length + '개 다 있음');
  } else if (wb) {
    /* 틀린 것이 없는데 «오답노트» 라는 빈 제목만 남으면 빠뜨린 줄 안다. */
    chk('틀린 것이 없으면 빈 칸을 안 남긴다', !txt.includes('오답노트'), true);
  }
  chk('회차', txt.includes(screen.round + '회'), true);
  chk('통과 여부', txt.includes(screen.passed ? '통과' : '재시'), true);
  chk('응시한 회차 수', txt.includes(screen.taken + '회  ·  통과 ' + screen.passedRounds + '회')
      || txt.includes(screen.taken + '회 · 통과 ' + screen.passedRounds + '회'), true);

  /* ── 단원별 — 여기가 이 검사의 핵심이다 ──
     화면의 `맞은/전체` 가 종이에 **그대로** 있어야 한다. 뒤집힌 값(틀린/전체)이
     있으면 그것도 잡는다 — 처음에 저지른 잘못이 바로 그것이다. */
  let same = 0, flipped = 0;
  screen.units.forEach(u => {
    const [got, tot] = u.v.split('/').map(Number);
    const rowRe = new RegExp(u.u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                             '\\s+' + got + ' / ' + tot + '\\s+' + Math.round(got / tot * 100) + '%');
    if (rowRe.test(txt)) same++;
    if (new RegExp(u.u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                   '\\s+' + (tot - got) + ' / ' + tot).test(txt)) flipped++;
  });
  chk(`단원 ${screen.units.length}개가 화면과 같은 숫자다`, same === screen.units.length,
      `맞은 줄 ${same}/${screen.units.length}`);
  chk('맞은 수와 틀린 수가 뒤집히지 않았다', flipped === 0,
      flipped ? `뒤집힌 줄 ${flipped}개` : true);

  /* ⚠ **문항 두 개 미만은 판정하지 않는다**(선생님 결정 #41 · 파이널의
     `DOM_MIN_Q = 2` 와 같은 규칙). 한 문항으로 «100%» 라고 적으면 학부모는
     그 단원이 탄탄한 줄 안다 — 실제로는 한 번 맞힌 것뿐이다.
     지금 자료에 그런 단원이 없을 수도 있다. 그때는 **없다는 것만** 확인하고
     넘어간다 — 규칙은 아직 안 온 경우를 지키려고 있는 것이다. */
  const thin = screen.units.filter(u => Number(u.v.split('/')[1]) < 2);
  if (thin.length) {
    chk(`문항 2개 미만인 단원 ${thin.length}개를 판정하지 않는다`,
        thin.every(u => new RegExp(u.u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                                   '\\s+\\d+ / \\d+\\s+판정 안 함').test(txt)),
        thin.map(u => u.u + ' ' + u.v).join(' · '));
  } else {
    console.log('  (문항 2개 미만인 단원이 지금은 없다 — 규칙만 걸어 둔다)');
    chk('«판정 안 함» 을 아무 데나 쓰지 않는다', !/판정 안 함/.test(txt), true);
  }

  /* 약한 단원이 위에 있어야 한다 — 종이는 아래로 갈수록 안 읽는다. */
  const order = screen.units.map(u => txt.indexOf(u.u)).filter(i => i >= 0);
  chk('약한 단원이 위에 온다 (화면과 같은 차례)',
      order.length === screen.units.length &&
      order.every((v, i) => i === 0 || order[i - 1] < v), true);

  console.log('\n── 학부모가 보는 것 ──');
  chk('한 장 요약이 있다', /한 장 요약/.test(txt), true);
  chk('표지가 결론을 이미 말한다',
      new RegExp('성적 진단 리포트[\\s\\S]{0,400}' + (screen.passed ? '통과' : '재시')).test(txt), true);
  if (screen.chronic.length) {
    chk('다시 볼 개념이 화면과 같다',
        screen.chronic.slice(0, 3).every(m => txt.includes(m)),
        screen.chronic.slice(0, 3).join(' · '));
  }
  chk('연락할 곳이 적혀 있다', /조준모T 카카오톡/.test(txt), true);

  console.log('\n' + (errs.length ? 'JS 오류: ' + errs.slice(0, 3).join(' | ') : 'JS 오류 없음'));
  if (errs.length) fail++;

  await browser.close();
  server.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(fail ? `\n실패 ${fail}건` : '\n종이가 화면과 같은 말을 한다.');
  process.exit(fail ? 1 : 0);
})();
