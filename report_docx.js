/* ============================================================
   DT 성적표 · Word(.docx) 저장 — exam 스타일
   ------------------------------------------------------------
   2026-08-11, 선생님 — *"인쇄규칙하지말고 워드파일로 다운받을수있게
   exam스타일로"*.

   본디 물음은 "인쇄 규칙(@media print)이 없는 화면이 exam 39장 · DT 15장인데
   학부모가 종이로 뽑으면 잘린다" 였다. 재어 보니 그 39장은 거의 다 **선생님·
   R&D 화면**(admin · calibration · dashboard · data-import …)이었고, 학부모가
   실제로 여는 화면에는 인쇄 규칙이 이미 있었다.

   선생님 답은 인쇄 규칙을 더 붙이는 쪽이 아니라 **워드로 받게 하는** 쪽이었다.
   맞는 판단이다 — 인쇄는 브라우저·프린터마다 결과가 다르고, 학부모가 남겨
   두는 것은 종이가 아니라 파일이다. exam 은 이미 그렇게 하고 있었고
   (`성적표 Word 저장`), **DT 에만 없었다.**

   exam 과 다른 점
   ----------------
   exam 의 Word 는 60쪽짜리 진단서다(개념 강의 교재까지 붙는다). DT 의 화면은
   한 장짜리 리포트이므로 **그 한 장을 그대로 옮긴다.** 없는 것을 지어내
   두껍게 만들지 않는다.

       표지        이름 · 회차 · 결론 한 줄 · 발행일
       한 장 요약  등급/통과 · 점수 · 회복 · 석차
       단원별      누적 정답률 (약한 순)
       다시 볼 개념
       이번 주 처방
       지금까지의 여정
       연락할 곳

   ⚠ **화면이 계산한 값을 그대로 쓴다.** 여기서 다시 계산하면 언젠가 화면과
     Word 가 서로 다른 숫자를 말한다(파이널에서 그 일이 있었고, 그래서
     `tests/docx-report.js` 가 두 쪽 숫자를 맞춰 본다). 여기서도 `A` ·
     `latest` · `RANK` · `aggFromRows()` 를 그대로 빌린다.

   ⚠ docx 는 **누를 때만** 받는다(1.1MB). 첫 그림을 막지 않는다.
     그리고 저장소 안(`vendor/`)에서 받는다 — pdfgen.js 는 cdnjs 에서 받는데,
     그쪽은 학원 망이 막으면 단추가 그냥 죽는다.
   ============================================================ */
(function () {
  'use strict';

  var LIB = 'vendor/docx.iife.js';
  var _loading = null;

  /* 색은 화면과 같은 팔레트에서 가져온다(tools/theme.py 가 관리하는 값). */
  var INK = '1C2530', EM = '0B6E6E', MUT = '61707F',
      GOLD = 'A07E2B', RED = '9A2828', OK = '2E7D5B', LINE = 'E6DDC8';

  function loadOnce(src) {
    if (_loading) return _loading;
    _loading = new Promise(function (res, rej) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = res;
      el.onerror = function () { rej(new Error('load fail: ' + src)); };
      document.head.appendChild(el);
    });
    return _loading;
  }

  async function ensureLib() {
    if (!window.docx) await loadOnce(LIB);
    return window.docx;
  }

  function saveBlob(blob, fn) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fn; document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 1500);
  }

  function say(msg) {
    var b = document.getElementById('docxBtn');
    if (!b) return;
    if (!b.dataset.label) b.dataset.label = b.textContent;
    b.textContent = msg || b.dataset.label;
  }

  /* 화면이 <b> 같은 태그를 섞어 쓰는 문장이 많다. Word 에는 태그를 넣을 수
     없으므로 굵은 자리만 살려 조각으로 나눈다 — 통째로 지우면 선생님이 굵게
     둔 자리가 사라진다(그 자리가 문장의 요지다). */
  function richRuns(html, D, opt) {
    opt = opt || {};
    var out = [], re = /<b>(.*?)<\/b>/gi, last = 0, m;
    var plain = function (t) {
      return String(t).replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    };
    var push = function (t, bold) {
      t = plain(t);
      if (!t) return;
      out.push(new D.TextRun({ text: t, bold: !!bold,
        color: bold ? (opt.emColor || EM) : (opt.color || INK),
        size: opt.size || 20 }));
    };
    html = String(html == null ? '' : html);
    while ((m = re.exec(html))) { push(html.slice(last, m.index), false); push(m[1], true); last = re.lastIndex; }
    push(html.slice(last), false);
    return out.length ? out : [new D.TextRun({ text: '', size: opt.size || 20 })];
  }

  async function build() {
    var D = await ensureLib();
    var Document = D.Document, Packer = D.Packer, Paragraph = D.Paragraph,
        TextRun = D.TextRun, AlignmentType = D.AlignmentType,
        Table = D.Table, TableRow = D.TableRow, TableCell = D.TableCell,
        WidthType = D.WidthType, BorderStyle = D.BorderStyle,
        PageBreak = D.PageBreak, Footer = D.Footer, PageNumber = D.PageNumber;

    var NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    var bdr = function (c, sz) { return { style: BorderStyle.SINGLE, size: sz || 4, color: c }; };
    var CW = 9000;

    function run(t, o) {
      o = o || {};
      return new TextRun({ text: String(t == null ? '' : t), bold: !!o.bold,
        italics: !!o.i, color: o.color || INK, size: o.size || 20,
        font: o.serif ? 'Batang' : undefined });
    }
    function P(children, o) {
      o = o || {};
      return new Paragraph({ children: children, alignment: o.align,
        spacing: { before: o.before || 0, after: o.after == null ? 90 : o.after },
        border: o.border });
    }
    function txt(t, o) { o = o || {}; return P([run(t, o)], o); }
    function cell(children, w, o) {
      o = o || {};
      return new TableCell({ children: children, width: { size: w, type: WidthType.DXA },
        margins: { top: 70, bottom: 70, left: 110, right: 110 },
        shading: o.bg ? { fill: o.bg } : undefined });
    }
    function kv(k, v, o) {
      o = o || {};
      return new TableRow({ children: [
        cell([txt(k, { size: 19, color: MUT, after: 0 })], Math.floor(CW * 0.32)),
        cell([txt(v, { size: o.big ? 26 : 20, bold: true, color: o.color || EM, after: 0 })],
             CW - Math.floor(CW * 0.32))] });
    }

    /* ── 화면이 이미 계산해 둔 것을 빌린다 ──────────────────────────────
       ⚠ `window.A` 를 그대로 읽으면 안 된다 — 화면의 `A` · `latest` 는
         `let` 이라 window 에 안 붙는다(읽어 보면 undefined 다). 파이널에서
         `window.sel` 을 그렇게 읽다가 60문항을 "비운 60문항" 으로 적은 적이
         있다. 그래서 화면이 다 그린 뒤 스스로 내놓는 자리를 쓴다. */
    var R = window.__dtRpt;
    if (!R) throw new Error('아직 리포트가 그려지지 않았습니다.');
    var A = R.A, latest = R.latest, RANK = R.RANK;
    if (!A || !A.trend || !A.trend.length || !latest)
      throw new Error('아직 리포트가 그려지지 않았습니다.');

    var nm = (A.info && A.info.name) || '학생';
    var sch = (A.info && A.info.school) || '';
    var CRSLBL = R.CRSLBL || {};
    var course = CRSLBL[latest.course] || '화학';
    var pt = window.pt || function (v) { return v; };
    /* 단원 누적도 화면이 이미 셌다. 여기서 다시 세면 두 쪽이 달라진다 —
       그리고 되짚어 세려 해도 `CU` · `CUM_UNITS` 역시 `let` 이라 못 읽는다. */
    var agg = R.agg || { units: [], axes: {} };

    var rec = (latest.finalScore != null && latest.jeongsiScore != null)
      ? latest.finalScore - latest.jeongsiScore : null;
    var band = latest.passed ? '성장 구간' : '다지기 단계';
    var today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    var body = [];

    /* ── 표지 ──
       ⚠ 표지가 **결론 한 줄을 이미 말한다.** exam 에서 같은 것을 고쳤다(#9) —
         학부모가 열어 처음 보는 장이 이름과 제목뿐이면, "그래서 어떻게 됐다는
         건가" 를 들고 한 번 더 넘겨야 한다. */
    body.push(P([], { before: 1400 }),
      txt('Chemistreal · 다원교육 영재관', { align: AlignmentType.CENTER, color: MUT, size: 20, after: 120 }),
      txt('성적 진단 리포트', { align: AlignmentType.CENTER, bold: true, size: 66, serif: true, after: 110 }),
      txt(course + '  ·  ' + latest.round + '회', { align: AlignmentType.CENTER, color: EM, size: 28, serif: true, after: 80 }),
      P([], { before: 2600 }),
      txt(nm + ' 학생', { align: AlignmentType.CENTER, bold: true, size: 36, serif: true, after: 50 }),
      txt(sch, { align: AlignmentType.CENTER, color: MUT, size: 20, after: 40 }),
      txt([band,
           (latest.finalScore != null ? latest.finalScore + '점' : null),
           (latest.passed ? '통과' : '재시 진행 중')].filter(Boolean).join('      ·      '),
          { align: AlignmentType.CENTER, bold: true, color: EM, size: 24, before: 40, after: 80 }),
      txt('발행일  ' + today, { align: AlignmentType.CENTER, color: MUT, size: 16 }),
      new Paragraph({ children: [new PageBreak()] }));

    /* ── 한 장 요약 ── */
    var rows = [kv('이번 회차', course + ' ' + latest.round + '회', { big: true }),
                kv('상태', band + (latest.passed ? '  ·  통과' : '  ·  재시로 채우는 중'),
                   { color: latest.passed ? OK : GOLD })];
    if (latest.jeongsiScore != null) rows.push(kv('첫 응시', pt(latest.jeongsiScore) + '점'));
    if (latest.finalScore != null) rows.push(kv('최종', pt(latest.finalScore) + '점'));
    if (rec != null && rec > 0) rows.push(kv('재시로 회복', '+' + pt(rec) + '점', { color: OK }));
    rows.push(kv('응시한 회차', A.trend.length + '회  ·  통과 ' + (A.passedRounds || 0) + '회'));
    if (RANK && RANK.n) {
      rows.push(kv('또래 중 위치',
        '상위 ' + RANK.per100 + '%   ·   ' + RANK.n + '명 중' +
        (RANK.avg != null ? '   (반 평균 ' + RANK.avg + '점)' : '')));
    }

    body.push(txt('❖  SUMMARY  ❖', { align: AlignmentType.CENTER, color: GOLD, size: 16, after: 60 }),
      txt('한 장 요약', { align: AlignmentType.CENTER, bold: true, color: EM, size: 46, serif: true, after: 40 }),
      txt('뒤에 이어지는 내용의 결론만 모았습니다. 시간이 없으시면 이 장만 보셔도 됩니다.',
          { align: AlignmentType.CENTER, color: MUT, size: 18, after: 180 }),
      new Table({ columnWidths: [Math.floor(CW * 0.32), CW - Math.floor(CW * 0.32)], rows: rows,
        width: { size: CW, type: WidthType.DXA },
        borders: { top: bdr(EM, 8), bottom: bdr(EM, 8), left: NB, right: NB,
                   insideHorizontal: bdr(LINE, 2), insideVertical: NB } }),
      P([], { after: 200 }));

    /* ── 단원별 정답률 — 약한 순 ────────────────────────────────────────
       ⚠⚠ **`u.w` 는 맞은 수가 아니라 틀린 수다.** 화면(unitHeat)이 이렇게 쓴다.

              맞은 수 = u.t - u.w
              정답률  = (u.t - u.w) / u.t

       처음에 이 자를 `u.w / u.t` 로 적었다. 그러면 88점으로 통과한 학생의
       고체 단원이 **8/8 인데 0/8 · 0%** 로 찍힌다. 화면은 100% 라고 말하고
       종이는 0% 라고 말하는데, **둘 다 그럴듯해 보인다** — 숫자를 안 맞춰
       보면 아무도 모른다. 학부모가 그 종이를 들고 아이한테 무슨 말을 할지
       생각하면, 이 저장소에서 가장 나쁜 갈래의 잘못이다.
       (0%가 88점과 안 맞는 것이 눈에 띄어서 잡았다. 그래서 아래 검사가
        화면과 종이의 숫자를 한 줄씩 맞춰 본다 — tests/docx-report.js 와 같다.)

       차례는 **약한 단원이 위**다. 종이는 위에서부터 읽고 아래로 갈수록 안
       읽으므로 손댈 곳이 위에 있어야 한다. 화면도 같은 차례다. */
    var okRate = function (u) { return u.t ? (u.t - u.w) / u.t : 0; };
    var units = (agg.units || []).slice()
      .filter(function (u) { return u && u.t; })
      .sort(function (a, b) { return okRate(a) - okRate(b) || b.t - a.t; });
    if (units.length) {
      body.push(txt('단원별 정답률', { bold: true, color: EM, size: 26, serif: true, before: 100, after: 60,
                                   border: { bottom: bdr(GOLD, 4) } }),
        txt('누적 기준입니다. 위에 있을수록 먼저 손댈 곳입니다.', { color: MUT, size: 18, after: 110 }));
      var urows = [new TableRow({ children: [
        cell([txt('단원', { bold: true, size: 19, color: MUT, after: 0 })], Math.floor(CW * 0.52), { bg: 'F6F2E8' }),
        cell([txt('맞은/전체', { bold: true, size: 19, color: MUT, after: 0 })], Math.floor(CW * 0.24), { bg: 'F6F2E8' }),
        cell([txt('정답률', { bold: true, size: 19, color: MUT, after: 0 })], CW - Math.floor(CW * 0.76), { bg: 'F6F2E8' })] })];
      units.forEach(function (u) {
        var got = u.t - u.w;                       // 맞은 수 (위 주석)
        var r = Math.round(okRate(u) * 100);
        /* ⚠ 문항 두 개 미만은 **판정하지 않는다**(선생님 규칙 · 화면의
           UNIT_MIN_Q 와 같다). 한 문항으로 «100%» 라고 적으면 학부모는 그
           단원이 탄탄한 줄 안다 — 실제로는 한 번 맞힌 것뿐이다.
           숫자(1/1)는 그대로 적고, 백분율만 안 적는다. */
        var thin = u.t < 2;
        urows.push(new TableRow({ children: [
          cell([txt(u.u, { size: 20, color: thin ? MUT : INK, after: 0 })], Math.floor(CW * 0.52)),
          cell([txt(got + ' / ' + u.t, { size: 20, color: MUT, after: 0 })], Math.floor(CW * 0.24)),
          cell([txt(thin ? '판정 안 함' : (r + '%'),
                    { size: thin ? 17 : 20, bold: !thin, after: 0,
                      color: thin ? MUT : (r >= 80 ? OK : (r >= 60 ? GOLD : RED)) })],
               CW - Math.floor(CW * 0.76))] }));
      });
      body.push(new Table({ columnWidths: [Math.floor(CW * 0.52), Math.floor(CW * 0.24), CW - Math.floor(CW * 0.76)],
        rows: urows, width: { size: CW, type: WidthType.DXA },
        borders: { top: bdr(LINE, 4), bottom: bdr(LINE, 4), left: NB, right: NB,
                   insideHorizontal: bdr(LINE, 2), insideVertical: NB } }),
        P([], { after: 180 }));
    }

    /* ── 다시 볼 개념 ── */
    var ch = (A.chronicMis || []);
    if (ch.length) {
      body.push(txt('다시 볼 개념', { bold: true, color: EM, size: 26, serif: true, before: 120, after: 60,
                                 border: { bottom: bdr(GOLD, 4) } }),
        txt('여러 회차에 걸쳐 반복해서 막힌 곳입니다. 여기부터 같이 보시면 가장 빨리 오릅니다.',
            { color: MUT, size: 18, after: 110 }));
      ch.slice(0, 8).forEach(function (m, i) {
        body.push(P([run((i + 1) + '.  ', { bold: true, color: GOLD, size: 21 }),
                     run(m.mis, { bold: true, color: INK, size: 21 }),
                     run(m.rounds ? ('    ' + m.rounds + '개 회차') : '', { color: MUT, size: 18 })],
                    { after: 60 }));
      });
      body.push(P([], { after: 160 }));
    }

    /* ── 이번 주 처방 ──
       화면이 문장을 고르는 규칙(회차마다 다른 문단)을 **베끼지 않는다.**
       베끼면 언젠가 종이와 화면이 서로 다른 말을 한다. 화면이 그린 것을
       그대로 읽어 온다. */
    try {
      var rxHtml = window.rxNarrCard ? window.rxNarrCard() : '';
      if (rxHtml) {
        var box = document.createElement('div'); box.innerHTML = rxHtml;
        var ps = [].slice.call(box.querySelectorAll('p'))
          .map(function (e) { return e.innerHTML; })
          .filter(function (t) { return t && t.replace(/<[^>]+>/g, '').trim().length > 10; });
        if (ps.length) {
          body.push(txt('이번 주 처방 코멘트', { bold: true, color: EM, size: 26, serif: true,
                                          before: 120, after: 60, border: { bottom: bdr(GOLD, 4) } }));
          ps.forEach(function (t) { body.push(P(richRuns(t, D, { size: 20 }), { after: 90 })); });
          body.push(P([], { after: 160 }));
        }
      }
    } catch (e) { /* 처방이 없으면 그 장을 안 넣는다 — 빈 제목만 남기지 않는다 */ }

    /* ── 지금까지의 여정 ── */
    if (A.trend.length > 1) {
      body.push(txt('지금까지의 여정', { bold: true, color: EM, size: 26, serif: true, before: 120, after: 60,
                                   border: { bottom: bdr(GOLD, 4) } }));
      var trows = [new TableRow({ children: [
        cell([txt('회차', { bold: true, size: 19, color: MUT, after: 0 })], Math.floor(CW * 0.28), { bg: 'F6F2E8' }),
        cell([txt('첫 응시', { bold: true, size: 19, color: MUT, after: 0 })], Math.floor(CW * 0.22), { bg: 'F6F2E8' }),
        cell([txt('최종', { bold: true, size: 19, color: MUT, after: 0 })], Math.floor(CW * 0.22), { bg: 'F6F2E8' }),
        cell([txt('결과', { bold: true, size: 19, color: MUT, after: 0 })], CW - Math.floor(CW * 0.72), { bg: 'F6F2E8' })] })];
      A.trend.forEach(function (t) {
        trows.push(new TableRow({ children: [
          cell([txt((CRSLBL[t.course] || '') + ' ' + t.round + '회', { size: 20, after: 0 })], Math.floor(CW * 0.28)),
          cell([txt(t.jeongsiScore != null ? pt(t.jeongsiScore) + '점' : '-', { size: 20, color: MUT, after: 0 })], Math.floor(CW * 0.22)),
          cell([txt(t.finalScore != null ? pt(t.finalScore) + '점' : '-', { size: 20, bold: true, after: 0 })], Math.floor(CW * 0.22)),
          cell([txt(t.passed ? '통과' : '재시', { size: 20, bold: true, after: 0,
                                              color: t.passed ? OK : GOLD })], CW - Math.floor(CW * 0.72))] }));
      });
      body.push(new Table({ columnWidths: [Math.floor(CW * 0.28), Math.floor(CW * 0.22), Math.floor(CW * 0.22), CW - Math.floor(CW * 0.72)],
        rows: trows, width: { size: CW, type: WidthType.DXA },
        borders: { top: bdr(LINE, 4), bottom: bdr(LINE, 4), left: NB, right: NB,
                   insideHorizontal: bdr(LINE, 2), insideVertical: NB } }),
        P([], { after: 200 }));
    }

    /* ══════════════════════════════════════════════════════════════
       오답노트 (선생님 요청 2026-08-15)
       --------------------------------------------------------------
       *"exam에 오답노트 하듯이, DT 성적표에도 오답노트같이 보내주면 더
       좋을거같아"*

       재어 보니 **화면에는 이미 있었다** — 「문항별 정오」 와 「오개념 정리」
       (틀린 문항마다 문장 · 정답 · 내 답 · 왜 틀렸나). 없던 것은 그것이
       **받는 파일에 안 들어간 것**이다. 이 파일 373줄 어디에도 그 말이 한
       번도 안 나왔다. 선생님이 «보내주면» 이라 하신 자리가 여기다.

       학부모가 손에 쥐는 것은 화면이 아니라 이 파일이다. 화면에만 있으면
       링크를 다시 열어야 보이고, 대개 다시 안 연다.

       ⚠ **화면과 같은 자료에서 뽑는다.** 여기서 답안을 다시 맞춰 보지
         않는다 — 두 곳이 따로 세면 언젠가 어긋나고, 어긋나면 종이와 화면이
         다른 말을 한다(tests/docx-report.js 가 그것을 잰다).
       ⚠ 못 읽으면 **이 칸을 통째로 접는다.** 틀린 문항이 없는데 «오답노트»
         라는 빈 제목만 남으면, 읽는 쪽은 빠뜨린 줄 안다.
       ══════════════════════════════════════════════════════════════ */
    var WB = (typeof window !== 'undefined' && window.__wrongbook) || null;
    if (WB && WB.items && WB.items.length) {
      body.push(txt('오답노트', { bold: true, color: EM, size: 26, serif: true,
                                  before: 260, after: 40 }),
        txt('이번 회차에서 틀린 ' + WB.items.length + '문항입니다. 개념이 같은 것끼리 묶었고, ' +
            '문장 아래에 왜 틀렸는지를 적었습니다.',
            { color: MUT, size: 18, after: 120 }));
      var seen = null;
      WB.items.forEach(function (it, i) {
        if (it.mis !== seen) {
          seen = it.mis;
          body.push(txt('· ' + (it.mis || '기타'), { bold: true, color: EM, size: 19,
                                                     before: 140, after: 40 }));
        }
        body.push(P([run(String(it.n) + '번  ', { bold: true, color: GOLD, size: 18 }),
                     run(it.s || '', { size: 18 })], { after: 20 }));
        body.push(P([run('정답 ' + it.a + '  ·  내 답 ', { color: MUT, size: 16 }),
                     run(it.mine || '–', { bold: true, color: 'B23B3B', size: 16 })],
                    { after: it.w ? 20 : 90 }));
        if (it.w) body.push(txt('→ ' + it.w, { color: MUT, size: 16, i: true, after: 90 }));
      });
    }

    /* ── 연락할 곳 ──
       다 읽고 나서 "이상한데 어디로 묻지" 가 남으면 학부모는 아무 데도 안
       묻는다 — 그러면 틀린 채로 굳는다. 파이널 성적표와 같은 창구를 적는다.
       하나만 적는다(둘을 적으면 고른다). */
    body.push(P([run('성적표에 이상한 점이 있거나 더 여쭐 것이 있으시면  ', { color: MUT, size: 18 }),
                 run('조준모T 카카오톡 메시지', { bold: true, color: EM, size: 18 }),
                 run('  로 연락 주세요.', { color: MUT, size: 18 })],
                { align: AlignmentType.CENTER, before: 200, after: 60 }),
      txt('이 리포트는 ' + nm + ' 학생을 위한 개인 맞춤 분석 자료입니다.  ·  Chemistreal · 조준모 화학',
          { align: AlignmentType.CENTER, color: MUT, size: 16, i: true }));

    var ftr = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [run('CHEMISTREAL · 조준모 화학       ', { color: '8C8266', size: 15 }),
                 new TextRun({ children: [PageNumber.CURRENT], color: GOLD, size: 15, bold: true }),
                 run('  /  ', { color: '8C8266', size: 15 }),
                 new TextRun({ children: [PageNumber.TOTAL_PAGES], color: '8C8266', size: 15 })] })] });

    var doc = new Document({
      creator: 'Chemistreal',
      title: nm + ' ' + course + ' ' + latest.round + '회 성적 진단 리포트',
      styles: { default: { document: { run: { font: 'Malgun Gothic', color: INK } } } },
      sections: [{
        properties: { titlePage: true, page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1200, right: 1080, bottom: 1200, left: 1080, footer: 560 } } },
        footers: { default: ftr, first: new Footer({ children: [new Paragraph({ children: [] })] }) },
        children: body }]
    });

    return { doc: doc, Packer: Packer,
             fn: (nm + '_' + course + '_' + latest.round + '회_성적표')
                   .replace(/[\\/:*?"<>|]+/g, '') + '.docx' };
  }

  async function save() {
    try {
      say('Word 만드는 중…');
      var made = await build();
      var blob = await made.Packer.toBlob(made.doc);
      saveBlob(blob, made.fn);
      say('저장 완료');
      setTimeout(function () { say(null); }, 2500);
    } catch (err) {
      console.error(err);
      say('저장 실패 — 잠시 후 다시');
      setTimeout(function () { say(null); }, 3000);
    }
  }

  window.DTDOCX = { save: save, build: build };
})();
