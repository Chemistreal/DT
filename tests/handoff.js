/* ============================================================
   **제출하면 리포트로 데려간다 — 다만 저장이 확인된 뒤에** (브라우저 필요)
   ------------------------------------------------------------
   2026-08-14, 선생님 요청 — *"제출했을 때 이 페이지를 거치지 않고 바로 5초
   정도 넘어가는 동적모션 느낌의 퍼센트 페이지 잠깐 보여주다가 상세페이지
   리포트로 넘어가게. 그리고 그 중 재시인 학생들은 재시 알람을 팝업으로
   띄워주고 재시를 응시하는 절차까지 상세히 안내를."*

   여태는 제출하면 결과 카드가 서고, 학생이 「상세 리포트 보기 →」 를 **스스로
   눌러야** 했다. 안 누르면 그걸로 끝이다 — 오답 개념도 강의록도 재시도 다
   그 너머에 있는데.

   여기서 지키는 것
   ----------------
     · 제출하면 **점수가 도는 화면**이 뜨고, 5초쯤 뒤 리포트로 넘어간다
     · **저장이 확인되기 전에는 안 넘어간다** — 이것이 이 검사의 핵심이다.
       앱스크립트는 실행을 한 줄로 세우므로 POST+확인 왕복이 5초를 넘길 때가
       있다. 그때 5초를 지키자고 넘어가면 학생은 리포트에서 «이번 회차가
       없네?» 를 보고 시험을 다시 본다
     · 저장이 **실패하면 아예 안 넘어간다** — 다시 보낼 자리를 준다
     · **재시인 학생은 넘어가는 대신 알림이 뜬다.** 5초 만에 지나가면 아무도
       안 읽는다. 나가는 문은 리포트 쪽으로만 나 있다
     · 알림에 적힌 절차가 **실제로 도는 길**이다 — 리포트의 「지금 재시 보기」

   실행:
       PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node tests/handoff.js
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE || 'playwright';
const CHROMIUM = process.env.CHROMIUM_PATH;
const ROOT = path.join(__dirname, '..');

let fail = 0;
const chk = (n, ok, extra) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (extra ? '  ' + extra : ''));
  if (!ok) fail++;
};

let chromium;
try { ({ chromium } = require(PLAYWRIGHT)); }
catch (e) {
  if (process.env.REQUIRE_BROWSER) {
    console.log('실패: playwright 를 찾지 못했다'); process.exit(1);
  }
  console.log('건너뜀: playwright 를 찾지 못했다'); process.exit(0);
}

const MIME = { html: 'text/html; charset=utf-8', json: 'application/json',
  js: 'text/javascript', css: 'text/css', pdf: 'application/pdf' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((rq, rs) => {
      const f = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rs.writeHead(404); rs.end('nf'); return;
      }
      rs.writeHead(200, { 'content-type': MIME[path.extname(f).slice(1)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rs);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

/* 시트를 흉내 낸다. `saved` 가 false 면 «저장 안 됨» 이 되고, `delay` 로
   앱스크립트가 줄에 걸린 상황을 만든다. 진짜 시트에는 한 글자도 안 나간다. */
function route(ctx, { saved = true, delay = 0, postFails = false }) {
  let posted = null;
  return ctx.route('**://script.google*.com/**', async r => {
    const req = r.request();
    if (delay) await new Promise(z => setTimeout(z, delay));
    if (req.method() === 'POST') {
      if (postFails) return r.abort();
      try { posted = JSON.parse(req.postData() || '{}'); } catch (e) { posted = {}; }
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true }) });
    }
    /* 확인용 읽기 — 방금 보낸 답안을 그대로 돌려주면 «저장됐다» 가 된다. */
    const rows = (saved && posted) ? [{ course: posted.course, round: posted.round,
      answers: posted.answers, score: posted.score }] : [];
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, rows: rows }) });
  }).then(() => () => posted);
}

/* 시험을 열고 제출한다. `how` 가 'pass' 면 **정답표 그대로** 채운다.
   ⚠ 처음에는 «전부 O = 합격» 이라 여겼는데, 재어 보니 60문항 중 38개만
     맞아 63.3점이었다(전부 O 인 문장이 38개). 합격은 80점이다. 자가 그것을
     잡아 줬다 — 점수를 지어내지 않고 **채점기가 낸 값**을 쓴다. */
async function takeExam(p, port, how) {
  await p.goto(`http://127.0.0.1:${port}/exam.html?course=ch1&round=1`,
    { waitUntil: 'load', timeout: 40000 });
  await p.waitForFunction(() => typeof R !== 'undefined' && R && R.jeongsi, null, { timeout: 30000 })
    .catch(() => {});
  await p.evaluate(() => { if (view === 'select') pickRound('ch1', 1); });
  await p.waitForFunction(() => !!document.getElementById('nm'), null, { timeout: 30000 });
  await p.evaluate(() => {
    document.getElementById('nm').value = '넘김점검';
    document.getElementById('sc').value = 'ㅇㅇ중';
    document.getElementById('gr').value = '2';
    startExam();
  });
  await p.evaluate(h => {
    A = R.jeongsi.items.map(it => h === 'pass' ? String(it.a).toUpperCase() : 'X');
    toReview();
  }, how);
  await p.evaluate(() => submitExam());
}

/* ── pt() 는 두 파일에 있다 ────────────────────────────────────────────
   학생은 이 화면 다음 칸에서 바로 report.html 을 본다. 두 화면이 같은 점수를
   다르게 적으면 어느 쪽이 맞는지 알 수가 없다. 한쪽만 고쳐도 잡히게 **글자
   그대로** 맞대어 본다(final.html·final-submit.html 이 겪은 것과 같은 병). */
function grabPt(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = src.match(/function pt\(n\)\{[^\n]*\}/);
  return m ? m[0] : null;
}

(async () => {
  console.log('── 점수를 적는 자가 두 파일에서 같다 ──');
  const A0 = grabPt('exam.html'), B0 = grabPt('report.html');
  chk('exam.html 에 pt() 가 있다', !!A0);
  chk('report.html 에 pt() 가 있다', !!B0);
  chk('둘이 글자 그대로 같다', !!A0 && A0 === B0, A0 === B0 ? '' : (A0 || '') + ' ≠ ' + (B0 || ''));

  const { srv, port } = await serve();
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
    CHROMIUM ? { executablePath: CHROMIUM } : {}));

  /* ── ① 합격한 학생: 점수가 돌고 리포트로 넘어간다 ── */
  console.log('── 합격한 학생 ──');
  {
    const ctx = await browser.newContext();
    await route(ctx, { saved: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 90)));
    await takeExam(p, port, 'pass');

    /* 결과 카드가 아니라 **넘겨주는 화면**이 떠야 한다. */
    const early = await p.evaluate(() => ({
      v: view, ring: !!document.querySelector('.hoff .arc'),
      num: (document.getElementById('hoffNum') || {}).textContent || '',
      oldCard: !!document.querySelector('.rsban'),
    }));
    chk('제출하면 넘겨주는 화면이 뜬다', early.v === 'handoff' && early.ring, early.v);
    chk('예전 결과 카드를 안 거친다', early.oldCard === false);

    /* 숫자가 **움직인다.** 그냥 최종값을 박아 두면 «동적» 이 아니다. */
    await p.waitForTimeout(300);
    const a = await p.evaluate(() => (document.getElementById('hoffNum') || {}).textContent);
    await p.waitForTimeout(700);
    const b = await p.evaluate(() => (document.getElementById('hoffNum') || {}).textContent);
    chk('숫자가 0에서 점수까지 오른다', a !== b, a + ' → ' + b);

    const got = await p.evaluate(() => RESULT.g.score);
    await p.waitForTimeout(1400);
    const end = await p.evaluate(() =>
      ((document.getElementById('hoffNum') || {}).textContent || '').replace('점', ''));
    /* ⚠ **리포트와 같은 숫자여야 한다.** 점수는 문항당 1.6667점이라 대개
       소수가 나온다. 리포트는 pt() 로 늘 소수 둘째 자리까지 적는다(85 →
       85.00). 여기만 «85» 라 하면 학생은 둘 중 뭐가 맞는지 모른다. */
    chk('소수 둘째 자리까지 적는다', /^\d+\.\d{2}$/.test(end.trim()), end.trim());
    /* ⚠ 자릿수를 늘리면 **원 밖으로 넘친다.** 「100.00점」 은 일곱 글자다 —
       처음 그린 52px 로는 링을 뚫고 나가 「점」 이 아래로 밀렸다. 눈으로
       «괜찮아 보인다» 로 끝내지 않고, 글자 상자가 원 안에 드는지 잰다. */
    const fits = await p.evaluate(() => {
      const el = document.getElementById('hoffNum');
      const n = el.getBoundingClientRect();
      const r = document.querySelector('.hoff .ring').getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const rad = r.width / 2 - 12;                    // 테두리 굵기만큼 뺀다
      /* 네 귀퉁이가 다 원 안에 들어야 한다. */
      const ok = [[n.left, n.top], [n.right, n.top], [n.left, n.bottom], [n.right, n.bottom]]
        .every(([x, y]) => Math.hypot(x - cx, y - cy) <= rad);
      return { ok: ok, w: Math.round(n.width), h: Math.round(n.height),
               d: Math.round(rad * 2),
               lines: Math.round(n.height / parseFloat(getComputedStyle(el).fontSize)) };
    });
    chk('숫자가 링 안에 들어간다', fits.ok === true,
      fits.w + '×' + fits.h + ' (안지름 ' + fits.d + ')');
    chk('«점» 이 아래로 안 밀린다 (한 줄이다)', fits.lines <= 1, fits.lines + '줄');
    chk('채점기가 낸 점수에서 선다', Number(end) === Number(got),
      end.trim() + ' (채점 ' + got + ')');
    chk('이 답안은 합격이다 (재시 길은 아래에서 잰다)',
      await p.evaluate(() => RESULT.g.pass) === true, got + '점');

    /* 리포트로 넘어가는가 — 주소가 실제로 바뀌는지 본다. */
    await p.waitForFunction(() => /report\.html/.test(location.href), null, { timeout: 20000 })
      .catch(() => {});
    const url = p.url();
    chk('리포트로 넘어간다', /report\.html\?student=/.test(url), url.slice(-52));
    chk('JS 오류 없음', errs.length === 0, errs[0] || '');
    if (errs.length) fail++;
    await ctx.close();
  }

  /* ── ② 재시인 학생: 넘어가는 대신 알림이 뜬다 ── */
  console.log('\n── 재시인 학생 ──');
  {
    const ctx = await browser.newContext();
    await route(ctx, { saved: true });
    const p = await ctx.newPage();
    await takeExam(p, port, 'fail');
    const isFail = await p.evaluate(() => RESULT.g.pass === false);
    chk('이 답안은 재시 대상이다', isFail, await p.evaluate(() => RESULT.g.score) + '점');

    await p.waitForSelector('#rtdim', { timeout: 20000 });
    const m = await p.evaluate(() => {
      const d = document.getElementById('rtdim');
      const t = d.textContent.replace(/\s+/g, ' ');
      return { t: t, steps: d.querySelectorAll('.rtsteps li').length,
               buttons: [].map.call(d.querySelectorAll('button'), b => b.textContent.trim()),
               modal: d.getAttribute('aria-modal'), still: location.href };
    });
    chk('재시 알림이 뜬다', m.steps >= 3, m.steps + '단계');
    chk('넘어가지 않고 멈춘다', /exam\.html/.test(m.still));
    chk('«복습 먼저» 를 말한다', /복습을 먼저/.test(m.t));
    chk('재시를 따로 신청하는 것이 아니라고 알려 준다', /따로 신청하지 않습니다/.test(m.t), '');
    chk('어디를 눌러야 하는지 적는다', /지금 재시 보기/.test(m.t));
    chk('새 문항이 나온다고 알려 준다', /새 문항/.test(m.t));
    const left = (m.t.match(/점까지 ([\d.]+)점 남았습니다/) || [])[1];
    chk('몇 점 남았는지 적는다', !!left, left ? left + '점' : m.t.slice(0, 40));
    /* 80 - 48.3 은 자바스크립트에서 31.700000000000003 이다. 이 시험의 예순
       가지 점수 가운데 열셋이 그렇다. 그대로 보이면 «이게 뭐지» 가 된다.
       선생님 결정(2026-08-14) — **소수 둘째 자리까지만.** */
    chk('남은 점수도 소수 둘째 자리까지', /^\d+\.\d{2}$/.test(left || ''), left || '');
    /* 이 화면에 뜨는 점수는 **전부** 그 규칙을 따라야 한다. 하나라도 새면
       학생이 보는 숫자가 두 가지가 된다. */
    const raw = (m.t.match(/\d+\.\d{3,}/g) || []);
    chk('세 자리 넘는 소수가 하나도 없다', raw.length === 0, raw.join(' ') || '없음');
    /* 통과 기준은 회차 데이터에 «80» 이라 적힌 **규칙**이다. 계산에서 나온
       값이 아니라 찌꺼기가 낄 자리가 없고, «80.00점» 이라 쓰면 제목이 한 줄에
       안 들어간다. 점수는 두 자리, 기준은 적힌 그대로. */
    chk('통과 기준은 적힌 그대로 쓴다', /80점까지/.test(m.t) && /80점 이상이면/.test(m.t),
      (m.t.match(/\S*80\S*점까지/) || [''])[0]);
    /* 나가는 문이 리포트 쪽으로만 나 있어야 한다 — «닫기» 로 끝나면
       복습도 재시도 안 하고 사라진다. */
    chk('나가는 문이 리포트뿐이다', m.buttons.length === 1 && /리포트/.test(m.buttons[0]),
      m.buttons.join(' / '));

    await p.click('#rtdim .go');
    await p.waitForFunction(() => /report\.html/.test(location.href), null, { timeout: 15000 })
      .catch(() => {});
    chk('누르면 리포트로 간다', /report\.html\?student=/.test(p.url()), p.url().slice(-48));
    await ctx.close();
  }

  /* ── ③ 저장이 늦으면 기다린다 (앱스크립트가 줄에 걸린 판) ── */
  console.log('\n── 저장이 5초보다 늦다 ──');
  {
    const ctx = await browser.newContext();
    await route(ctx, { saved: true, delay: 4200 });   // 왕복 두 번 = 8초 넘음
    const p = await ctx.newPage();
    await takeExam(p, port, 'pass');
    await p.waitForTimeout(6000);                     // 셈(5초)은 끝났다
    const mid = await p.evaluate(() => ({
      here: /exam\.html/.test(location.href),
      said: (document.getElementById('hoffStep') || {}).textContent || '',
      state: SAVE_STATE,
    }));
    chk('아직 안 넘어갔다', mid.here === true, mid.state);
    chk('왜 기다리는지 말한다', /저장이 확인되면 넘어갑니다/.test(mid.said), mid.said.trim());
    await p.waitForFunction(() => /report\.html/.test(location.href), null, { timeout: 25000 })
      .catch(() => {});
    chk('저장이 확인되면 그때 넘어간다', /report\.html/.test(p.url()), p.url().slice(-40));
    await ctx.close();
  }

  /* ── ④ 저장이 확인 안 되면 아예 안 넘어간다 ── */
  console.log('\n── 저장이 확인 안 됐다 ──');
  {
    const ctx = await browser.newContext();
    await route(ctx, { saved: false });               // 보냈는데 시트에 없다
    const p = await ctx.newPage();
    await takeExam(p, port, 'pass');
    await p.waitForFunction(() => SAVE_STATE === 'fail', null, { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(6500);
    const st = await p.evaluate(() => ({
      here: /exam\.html/.test(location.href),
      said: (document.getElementById('hoffStep') || {}).textContent || '',
      retry: !!document.querySelector('#hoffStep button'),
    }));
    /* 여기서 넘어가면 학생은 리포트에서 «이번 회차가 없네?» 를 보고 시험을
       다시 본다. 재는 것과 막는 것은 다르다 — 이 자리는 막는 자리다. */
    chk('안 넘어간다', st.here === true, st.said.replace(/\s+/g, ' ').slice(0, 46));
    chk('저장이 확인 안 됐다고 말한다', /확인되지 않았습니다/.test(st.said));
    chk('없는 것처럼 조용히 넘기지 않는다', /리포트에 없을 수 있습니다/.test(st.said));
    chk('다시 보낼 자리를 준다', st.retry === true);
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(fail ? `\n실패 ${fail}건`
    : '\n제출하면 리포트로 데려가고, 저장이 확인되기 전에는 안 넘어간다.');
  process.exit(fail ? 1 : 0);
})();
