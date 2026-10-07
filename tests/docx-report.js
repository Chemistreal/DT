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
const BRAND = '화학 · 다원교육 · 조준모';
const BAN = /아래쪽|최상위권|위험|집중 관리|무너지기|빚/;
const CE = require(path.join(ROOT, 'chemengine.js'));
/* 머리글 · 바닥글 · 본문 XML */
function docxParts(file, tmp) {
  const d = path.join(tmp, 'parts'); fs.rmSync(d, { recursive: true, force: true });
  execFileSync('unzip', ['-o', '-q', file, 'word/*', '-d', d]);
  const W = path.join(d, 'word'), rd = f => fs.readFileSync(path.join(W, f), 'utf8');
  const fl = fs.readdirSync(W), strip = x => x.replace(/<[^>]+>/g, ' ');
  const hdrX = fl.filter(f => /^header\d*\.xml$/.test(f)).map(rd).join(' '), ftrX = fl.filter(f => /^footer\d*\.xml$/.test(f)).map(rd).join(' ');
  return { xml: rd('document.xml'), hdr: strip(hdrX), ftr: strip(ftrX), ftrXml: ftrX };
}
/* 화학1 8회 + 심화 4회 가짜 학생 — 화학1 에서 동위원소·루이스 구조·몰 질량을 거듭 놓쳤다(실제 학생 아님). */
function fakeBoth(K, nm) {
  const LINK = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', 'ch1s', 'link_ch1.json'), 'utf8'));
  const RF = (c, n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_' + c + '_' + String(n).padStart(2, '0') + '.json'), 'utf8')).jeongsi.items;
  const flip = a => (a === 'O' ? 'X' : 'O');
  const mk = (course, round, attempt, wrong, date, extra) => {
    const items = RF(course, round), units = {};
    items.forEach((it, i) => { const u = units[it.u] || (units[it.u] = { u: it.u, t: 0, w: 0 }); u.t++; if (wrong.indexOf(i) >= 0) u.w++; });
    const score = Math.round(10000 * (items.length - wrong.length) / items.length) / 100;
    return Object.assign({ studentKey: K, name: nm, school: '가상고', year: '2', course, round, attempt, score, pass: score >= 80, date,
      answers: items.map((it, i) => wrong.indexOf(i) >= 0 ? flip(it.a) : it.a).join(''), wrongMis: wrong.map(i => items[i].mis), wrongAxes: {},
      units: Object.keys(units).map(k => units[k]), axes: [], isTest: false }, extra || {});
  };
  const rt = (course, round, att, w, miss, date) => { const items = RF(course, round), keys = w.map(i => items[i].a);
    const score = Math.round(10000 * (60 - miss.length * 2) / 60) / 100;
    return mk(course, round, att, [], date, { answers: keys.map((a, k) => miss.indexOf(k) >= 0 ? flip(a) : a).join(''), retakeCids: w.map(i => items[i].c).join(','),
      retakeKeys: keys.join(''), retakeUnasked: '', score, pass: score >= 80, wrongMis: miss.map(k => items[w[k]].mis), units: [] }); };
  const T = ['CH1S-012', 'CH1S-108', 'CH1S-027'], rows = [];
  const wt = (c, r, set, also) => RF(c, r).map((x, i) => i).filter(i => { const x = RF(c, r)[i]; return set.indexOf(c === 'ch1' ? LINK.map[x.c] : x.c) >= 0 || also(i); });
  for (let r = 1; r <= 8; r++) { const w = wt('ch1', r, T, i => (i * 7 + r) % 11 === 4), d = '2026-04-' + String(r * 3).padStart(2, '0') + 'T01:00:00Z';
    const f = mk('ch1', r, '첫 응시', w, d); rows.push(f); if (!f.pass) rows.push(rt('ch1', r, '재시', w, r % 3 === 0 ? [0, 1] : [], d.replace('T01', 'T05'))); }
  for (let r = 1; r <= 4; r++) { const w = wt('ch1s', r, r <= 2 ? ['CH1S-012'] : [], i => (i * 5 + r) % (r % 2 === 0 ? 4 : 8) === 3), d = '2026-09-' + String(r * 7).padStart(2, '0') + 'T01:00:00Z';
    const f = mk('ch1s', r, '첫 응시', w, d); rows.push(f); if (!f.pass) rows.push(rt('ch1s', r, '재시', w, r === 4 ? [0, 2, 3, 5, 6] : [1], d.replace('T01', 'T06'))); }
  return rows;
}
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
     것도 buildSolutions 가 한다. 앞 다섯 문항만 틀린 답안이다.

     ⚠ 그 다섯 안에 **정답이 X 이고 고친 문장(f)이 있는 문항**이 하나는
       있어야 한다 — 아래에서 «바르게 고치면: f» 줄을 재기 때문이다. 회차
       파일이 바뀌어 앞 다섯이 전부 O 문항이 되면, 첫 X 문항 하나를 더 틀린
       것으로 심는다(없으면 검사가 «잴 것이 없다» 로 넘어가지 않고 실패한다). */
  const seeded = await p.evaluate(async () => {
    const items = await loadRoundItems(latest.course, latest.round);
    if (!items || !items.length) return { no: '회차 문항을 못 읽었다' };
    const isFixX = it => String(it.a).toUpperCase() === 'X' && !!it.f && it.f !== it.s;
    const extra = items.slice(0, 5).some(isFixX) ? -1 : items.findIndex(isFixX);
    const flip = it => (String(it.a).toUpperCase() === 'O' ? 'X' : 'O');
    const ans = items.map((it, i) =>
      (i < 5 || i === extra) ? flip(it) : String(it.a).toUpperCase()).join('');
    (allRows || []).forEach(r => {
      if (r.course === latest.course && Number(r.round) === Number(latest.round)) r.answers = ans;
    });
    (latestRows || []).forEach(r => { r.answers = ans; });
    await fillMainSolutions();
    return { n: items.length, wrong: 5 + (extra >= 0 ? 1 : 0), extra: extra >= 0 };
  });
  chk('답안을 심어 오답노트를 만들 수 있다', !seeded.no,
      seeded.no || (seeded.n + '문항 · 틀린 ' + seeded.wrong + (seeded.extra ? ' (X 문항 하나 더 심음)' : '')));

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

    /* ── X 문항의 «바르게 고치면: f» ────────────────────────────────────
       O/X 시험이라 정답이 X 인 문항의 s 는 **틀린 문장**이다. 종이에 s 와
       해설(w)만 있으면 — 그리고 w 가 f 를 되풀이한 것이면 — «왜 거짓인가» 가
       안 보인다. 화면이 __wrongbook 에 f(정답 X 문항만) · lvl · core 를 더
       실어 보내고, 종이는 **있는 것만** 쓴다. 여기서도 화면이 넘긴 값을
       그대로 견준다 — 회차 파일을 다시 읽어 맞추지 않는다. */
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fixed = wb.items.filter(it => it.a === 'X' && it.f && it.f !== it.s);
    chk('심은 답안에 정답 X 문항이 있어 f 를 잴 수 있다', fixed.length > 0, fixed.length + '문항');
    if (fixed.length) {
      /* 문장(s) 바로 뒤에 «바르게 고치면: f» 가 와야 한다 — 해설 뒤에 숨으면 늦다.
         «s 뒤 어딘가에 있다» 로 재면 f 문단을 정답 줄·해설(w) 뒤로 옮겨도 초록이라,
         **자리를 잰다**: s → f → «정답 a» 줄 차례. f 가 정답 줄을 넘어가면 실패다. */
      const FIX = '바르게 고치면: ';
      const fixOk = fixed.filter(it => {
        const iS = txt.indexOf(it.n + '번 ' + it.s.slice(0, 16));
        if (iS < 0) return false;
        const iF = txt.indexOf(FIX + it.f.slice(0, 16), iS);
        const iA = txt.indexOf('정답 ' + it.a, iS);
        return iF > iS && iA > iF;
      });
      chk('X 문항마다 문장 아래에 «바르게 고치면: f» 가 실린다 (s → f → 정답 줄 차례)',
          fixOk.length === fixed.length, fixOk.length + ' / ' + fixed.length);
      /* O 문항에는 안 붙는다 — O 문항의 f 는 s 와 같은 문장이라 «고치면» 이 말이 안 된다.
         세는 자리는 «오답노트» 제목 뒤, 세는 말은 콜론까지 붙은 라벨 — 다른 칸의 글이나
         해설(w)·개념 설명(core)에 «바르게 고치면» 이라는 말이 들어와도 거짓 실패하지 않게. */
      const countFix = t => (t.slice(Math.max(0, t.indexOf('오답노트'))).match(/바르게 고치면: /g) || []).length;
      const nFix = countFix(txt);
      chk('«바르게 고치면» 은 정답 X 문항 수만큼만 있다', nFix === fixed.length, nFix + ' / ' + fixed.length);
      /* 위 개수 검사는 종이 쪽 가드(report_docx.js fixOf 의 it.a === 'X')를 못 잰다 —
         화면(solFix)이 O 문항에 f:'' 를 보내므로 그 가드를 지워도 개수가 같다. 그래서
         O 문항 하나에 f 를 심어 다시 만들고 «바르게 고치면» 이 안 느는지 본다. 심은 값은
         되돌리고, 그 파일은 아래 검사에 안 쓴다. */
      const oItem = wb.items.find(it => it.a === 'O');
      if (oItem) {
        const b64 = await p.evaluate(async n => {
          const it = window.__wrongbook.items.find(x => x.n === n), keep = it.f;
          it.f = (it.s || '') + ' (심은 값)';
          try { const made = await DTDOCX.build(); return await made.Packer.toBase64String(made.doc); }
          finally { it.f = keep; }
        }, oItem.n);
        const planted = path.join(tmp, 'planted.docx');
        fs.writeFileSync(planted, Buffer.from(b64, 'base64'));
        const nPlanted = countFix(docxText(planted, tmp));
        chk('O 문항에 f 를 심어도 «바르게 고치면» 이 안 는다 (정답 X 에만 붙는다)',
            nPlanted === fixed.length, nPlanted + ' / ' + fixed.length + ' (' + oItem.n + '번에 심음)');
      } else console.log('  (정답 O 문항이 없다 — O 문항 가드는 안 잰다)');
    }
    /* 난도 한 낱말 — 화면(SEGLVL)과 같은 말: 1 기본 · 2 표준 · 3 심화. 있는 문항만. */
    const LVL = { 1: '기본', 2: '표준', 3: '심화' };
    const lv = wb.items.filter(it => LVL[it.lvl]);
    if (lv.length) {
      const lvOk = lv.filter(it =>
        new RegExp(esc(it.n + '번 ' + it.s.slice(0, 16)) + '[\\s\\S]{0,400}?정답 ' + it.a + ' · 내 답 ' + esc(it.mine || '–') + ' · ' + LVL[it.lvl]).test(txt));
      chk('난도 낱말(기본/표준/심화)이 정답 줄에 실린다', lvOk.length === lv.length, lvOk.length + ' / ' + lv.length);
    } else console.log('  (lvl 이 있는 문항이 없다 — 난도 낱말은 안 잰다)');
    /* 개념 설명(core) — 개념 묶음 제목 바로 뒤에 한 번. 화면이 넘긴 맨글 그대로. */
    const cores = mis.map(m => ({ m, c: (wb.items.filter(it => it.mis === m && it.core)[0] || {}).core || (wb.cores && wb.cores[m]) || '' }))
                     .filter(x => x.c);
    if (cores.length) {
      const coreOk = cores.filter(x => new RegExp(esc('· ' + x.m) + '\\s+' + esc(x.c.slice(0, 20))).test(txt));
      chk('개념 설명이 개념 제목 바로 뒤에 실린다', coreOk.length === cores.length,
          coreOk.length + ' / ' + cores.length + (coreOk.length < cores.length ? '  빠짐: ' + cores.filter(x => coreOk.indexOf(x) < 0).map(x => x.m).join(' ') : ''));
      chk('«**» 굵게 표시가 종이에 새지 않는다', !/\*\*/.test(txt), true);
    } else console.log('  (개념 설명(core)이 있는 개념이 없다 — 안 잰다)');
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
      new RegExp('DT 성적표[\\s\\S]{0,400}' + (screen.passed ? '통과' : '재시')).test(txt), true);
  if (screen.chronic.length) {
    chk('다시 볼 개념이 화면과 같다',
        screen.chronic.slice(0, 3).every(m => txt.includes(m)),
        screen.chronic.slice(0, 3).join(' · '));
  }
  chk('연락할 곳이 적혀 있다', /조준모T 카카오톡/.test(txt), true);

  /* ── 상호 · 머리글/바닥글 · 표 행 · 표시 기호 (2026-10-07) ── */
  const parts = docxParts(file, tmp);
  chk('상호가 «화학 · 다원교육 · 조준모» 한 줄이다(본문 · 머리글 · 바닥글)',
      txt.includes(BRAND) && parts.hdr.includes(BRAND) && parts.ftr.includes(BRAND) && !/Chemistreal|CHEMISTREAL|영재관/i.test(txt + parts.hdr + parts.ftr), true);
  chk('바닥글에 쪽 번호가 있다', /PAGE/.test(parts.ftrXml) && /NUMPAGES/.test(parts.ftrXml), true);
  chk('표 행은 쪽에서 안 쪼개진다(cantSplit) · 제목은 다음 덩어리와 붙는다(keepNext)', /<w:cantSplit/.test(parts.xml) && /<w:keepNext/.test(parts.xml), true);
  chk('«**» 가 종이에 글자로 안 나간다', !/\*\*/.test(txt), true);
  chk('겁주는 낱말이 없다', !BAN.test(txt), (txt.match(BAN) || []).join(' '));
  await p.close();

  /* ══ 화학Ⅰ 심화(새 절) — 화학1 8회 + 심화 4회 학생. 화면 RPT 와 종이가 같은 숫자인가 ══ */
  console.log('\n── 화학Ⅰ 심화 · 화학1에서 이어 온 학생 ──');
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  const ROWS = fakeBoth('가상고-이음', '이음');
  await p2.route('**/macros/s/**', route => {
    const u = new URL(route.request().url()), c = u.searchParams.get('c') || '';
    const A2 = CE.cumulative(ROWS, c)['가상고-이음'];
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, student: 'x', rows: ROWS, excluded: [], cumulative: A2, rank: { n: 14, per100: 86, avg: 78.4, score: 61.67, round: 4, dist: [] }, ranks: [], cohort: null, challenges: [] }) });
  });
  await p2.goto(`http://localhost:${PORT}/report.html?student=x`, { waitUntil: 'load', timeout: 40000 });
  await p2.waitForFunction(() => !!(window.__dtRpt && window.__dtRpt.rpt && window.__dtRpt.rpt.v2x), null, { timeout: 30000 });
  await p2.waitForTimeout(800);
  const S2 = await p2.evaluate(() => {
    const M = window.__dtRpt.rpt, q = s => [].slice.call(document.querySelectorAll(s));
    return { M: JSON.parse(JSON.stringify(M)),
      tiles: q('.v2tile').map(e => e.querySelector('.v').textContent + '|' + e.querySelector('.k').textContent),
      carryRows: q('#v2-carry tbody tr').map(e => e.querySelector('td.c').textContent),
      carryLab: (document.querySelector('#v2-carry .v2barlab') || {}).textContent || '',
      chronicFreq: q('.rx .freq[data-mis]').map(e => e.textContent),
      c1rx: q('.rx.c1 .freq').map(e => e.textContent),
      rank: !!document.querySelector('.rankcard'), text: document.getElementById('app').innerText };
  });
  chk('화학Ⅰ 심화에는 석차 카드가 없다', !S2.rank && S2.M.rank === null, true);
  chk('화면 타일이 RPT 와 같다', JSON.stringify(S2.tiles) === JSON.stringify(S2.M.v2x.tiles.map(t => t.v + t.u + '|' + t.k)), S2.tiles.join(' · '));
  const C = S2.M.carry;
  chk('이어 온 기록이 있다', !!C && C.total > 0, C ? C.total + '개' : '없음');
  chk('화면 ②절 줄이 RPT 와 같다', JSON.stringify(S2.carryRows) === JSON.stringify(C.show.map(r => r.m)), S2.carryRows.length + '줄');
  chk('화면 막대 숫자가 RPT 와 같다', S2.carryLab.includes('맞힘 ' + C.ok) && S2.carryLab.includes('틀림 ' + C.again) && S2.carryLab.includes('물음 ' + C.un), S2.carryLab);
  chk('화면 «화학1 기록 합산» 분모가 RPT 와 같다', JSON.stringify(S2.c1rx) === JSON.stringify(C.chronic.map(x => x.freq)), S2.c1rx.join(' · '));
  const [dl2] = await Promise.all([p2.waitForEvent('download', { timeout: 90000 }), p2.click('#docxBtn')]);
  const f2 = path.join(tmp, 'v2.docx'); await dl2.saveAs(f2);
  const t2 = docxText(f2, tmp), parts2 = docxParts(f2, tmp);
  chk('종이에 「화학1에서 이어 온 기록」 이 있다', t2.includes('화학1에서 이어 온 기록'), true);
  const rowsInDoc = C.show.filter(r => t2.includes(r.m));
  chk('종이의 이어 온 기록 줄이 화면과 같다(같은 개념 · 같은 개수)', rowsInDoc.length === C.show.length && (C.more ? t2.includes('그 밖에 ' + C.more + '개') : true), rowsInDoc.length + ' / ' + C.show.length);
  chk('종이의 합계가 화면과 같다', t2.includes('심화에서 맞힘 ' + C.ok) && t2.includes('다시 틀림 ' + C.again) && t2.includes('아직 안 물음 ' + C.un) && t2.includes('(모두 ' + C.total + '개)'), true);
  chk('종이의 «화학1 기록 합산» 분모가 화면과 같다', C.chronic.every(x => new RegExp(x.m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + x.freq).test(t2)), C.chronic.length + '개');
  chk('종이의 고질 분모가 화면과 같다', S2.M.chronic.every(m => t2.includes(m.freq)), S2.M.chronic.map(m => m.freq).join(' · '));
  chk('종이에 타일 숫자가 같다', S2.M.v2x.tiles.every(t => t2.includes(t.k)), true);
  chk('종이에 진행 곡선 그림이 들어간다', /<pic:pic|<w:drawing/.test(parts2.xml), true);
  chk('종이에 석차 행이 없다(화학Ⅰ 심화)', !/반에서 위치|상위 약/.test(t2), true);
  if (S2.M.v2x.preview && S2.M.v2x.preview.items.some(x => x.lec)) chk('종이에 강의 링크가 걸린다', /<w:hyperlink/.test(parts2.xml), true);
  chk('종이에도 «**» · 겁주는 낱말이 없다', !/\*\*/.test(t2) && !BAN.test(t2), (t2.match(BAN) || []).join(' '));
  chk('화면에도 «**» · 겁주는 낱말이 없다', !/\*\*/.test(S2.text) && !BAN.test(S2.text), (S2.text.match(BAN) || []).join(' '));

  console.log('\n' + (errs.length ? 'JS 오류: ' + errs.slice(0, 3).join(' | ') : 'JS 오류 없음'));
  if (errs.length) fail++;

  await browser.close();
  server.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(fail ? `\n실패 ${fail}건` : '\n종이가 화면과 같은 말을 한다.');
  process.exit(fail ? 1 : 0);
})();
