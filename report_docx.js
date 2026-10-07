/* ============================================================
   DT 성적표 · Word(.docx) 저장 — exam 스타일
   ------------------------------------------------------------
   2026-08-11, 선생님 — *"인쇄규칙하지말고 워드파일로 다운받을수있게
   exam스타일로"*. 학부모가 남겨 두는 것은 종이가 아니라 파일이다.

   짜임 (2026-10-07 업그레이드)
   ----------------------------
       표지        상호 · DT 성적표 · 과목 회차 · 학생 · 결론 한 줄 · 발행일
       한 장 요약  통과 · 점수 · 재시로 올린 점수 · 응시 회차 (· 석차 — 화학Ⅰ 심화는 안 넣는다)
       [화학Ⅰ 심화] 첫 문단 · 숫자 타일 · ① 회차 진행 곡선(그림) · ② 화학1에서 이어 온 기록 ·
                   ③ 재시로 잡은 개념 · ④ 되풀이되는 오개념 · ⑤ 다음 주 예습 · 부모님께
       단원별      누적 정답률 (약한 순 · 단원 이름이 있으면 같이)
       다시 볼 개념 (화학1 기록 합산 포함 · 화면과 같은 분모) · 강의 링크
       [다른 과목] 화학1에서 이어 온 기록(있을 때) · 이번 주 처방
       지금까지의 여정 · 오답노트 · 연락할 곳
   머리글(상호) · 바닥글(상호 · 쪽 번호), 표 행은 쪽에서 안 쪼개지고(cantSplit) 제목은 다음 덩어리와
   붙는다(keepNext).

   ⚠ **화면이 계산한 값을 그대로 쓴다.** 숫자·문장은 report.html 의 buildReportModel() 이 만든
     RPT(window.__dtRpt.rpt)에서만 읽는다 — 여기서 다시 세면 언젠가 화면과 Word 가 서로 다른 숫자를
     말한다(tests/docx-report.js 가 두 쪽 숫자를 맞춰 본다). 처방 코멘트와 오답노트는 아직 화면이 만든
     것을 그대로 넘기는 예전 길(rxNarrCard · __wrongbook)이다.
   ⚠ «**» 같은 표시 기호는 Word 에 글자로 나가면 안 된다 — RPT 조각에는 맨글만 있고, 예전 길에서 오는
     글은 여기서 한 번 더 지운다(nostar).
   ⚠ docx 는 **누를 때만** 받는다(1.1MB). 첫 그림을 막지 않는다 — 저장소 안(vendor/)에서 받는다.
   ============================================================ */
(function () {
  'use strict';

  var LIB = 'vendor/docx.iife.js';
  var _loading = null;

  /* 색은 화면과 같은 한 벌(report.html RPT_PAL). 못 읽으면 같은 값의 사본. */
  function pal() {
    return window.RPT_PAL || { g9: '0B3B30', g8: '0E5A4C', g6: '2E7D66', g2: 'CFE3DB', g1: 'E8F1EE', g0: 'F3F8F6', gold: 'A9853C',
      goldInk: '8A6A38', goldSoft: 'F7F1E3', goldBd: 'E6D6B0', ink: '1F2A26', ink2: '4A5651', mut: '5E6A65', line: 'E3E0D6', line2: 'EFECE4',
      ok: '17663F', okSoft: 'E5F3EB', rust: 'A6441F', rustSoft: 'FBF1EC', amber: '7F6118', amberSoft: 'FAF2DF', paper: 'FBFAF6' };
  }
  /* 글자 여섯 단(pt → docx half-point): 캡션 8 · 작은 글 9 · 본문 10 · 소제목 12 · 제목 15 · 타일 20 · 표지 28 */
  var SZ = { cap: 16, sm: 18, body: 20, h3: 24, h2: 30, num: 40, cover: 56 };
  var BRAND_FALLBACK = '화학 · 다원교육 · 조준모';

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
  async function ensureLib() { if (!window.docx) await loadOnce(LIB); return window.docx; }

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
  function nostar(t) { return String(t == null ? '' : t).replace(/\*\*/g, ''); }

  /* SVG 문자열 → PNG (survey_docx.js 와 같은 길). 실패하면 null — 그림 대신 표를 넣는다. */
  function svgPng(svg, scale) {
    if (!svg) return Promise.resolve(null);
    var m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg); if (!m) return Promise.resolve(null);
    var w = Number(m[1]), h = Number(m[2]);
    if (svg.indexOf('xmlns=') < 0) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
          var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) {
            if (!b) return res(null);
            b.arrayBuffer().then(function (ab) { res({ data: new Uint8Array(ab), w: w, h: h }); }, function () { res(null); });
          }, 'image/png');
        } catch (e) { res(null); }
      };
      img.onerror = function () { res(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  /* 화면 HTML 의 <b> 만 살려 조각으로 (예전 길 · 처방 코멘트) */
  function htmlFr(html) {
    var out = [], re = /<b>(.*?)<\/b>/gi, last = 0, m;
    var plain = function (t) { return nostar(String(t).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')); };
    html = String(html == null ? '' : html);
    while ((m = re.exec(html))) { out.push({ t: plain(html.slice(last, m.index)) }); out.push({ t: plain(m[1]), b: true }); last = re.lastIndex; }
    out.push({ t: plain(html.slice(last)) });
    return out.filter(function (x) { return x.t; });
  }

  async function build() {
    var D = await ensureLib();
    var K = pal();
    var Paragraph = D.Paragraph, TextRun = D.TextRun, AlignmentType = D.AlignmentType,
        Table = D.Table, TableRow = D.TableRow, TableCell = D.TableCell,
        WidthType = D.WidthType, BorderStyle = D.BorderStyle, PageBreak = D.PageBreak,
        Footer = D.Footer, Header = D.Header, PageNumber = D.PageNumber;

    var R = window.__dtRpt;
    if (!R) throw new Error('아직 리포트가 그려지지 않았습니다.');
    var A = R.A, latest = R.latest, M = R.rpt;
    if (!A || !A.trend || !A.trend.length || !latest || !M)
      throw new Error('아직 리포트가 그려지지 않았습니다.');

    var NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    var bdr = function (c, sz, st) { return { style: st || BorderStyle.SINGLE, size: sz || 4, color: c }; };
    var CW = 9000;
    var BRAND = M.brand || BRAND_FALLBACK;
    var pt = window.pt || function (v) { return v; };
    var nm = M.student.name, course = M.courseName;

    function run(t, o) {
      o = o || {};
      return new TextRun({ text: nostar(t), bold: !!o.bold, italics: !!o.i, color: o.color || K.ink, size: o.size || SZ.body,
        shading: o.sh ? { fill: o.sh } : undefined });
    }
    function P(children, o) {
      o = o || {};
      return new Paragraph({ children: children, alignment: o.align, keepNext: !!o.kn, keepLines: true,
        spacing: { before: o.before || 0, after: o.after == null ? 90 : o.after }, border: o.border, indent: o.indent });
    }
    function txt(t, o) { o = o || {}; return P([run(t, o)], o); }
    /* 조각 [{t,b}] → TextRun */
    function frRuns(fr, o) {
      o = o || {};
      return (fr || []).map(function (x) { return run(x.t, { bold: !!x.b, color: x.b ? (o.em || K.g8) : (o.color || K.ink), size: o.size || SZ.body }); });
    }
    function link(t, href, o) {
      o = o || {};
      if (!href || !D.ExternalHyperlink) return run(t, o);
      return new D.ExternalHyperlink({ link: href, children: [new TextRun({ text: nostar(t), color: o.color || K.g8, size: o.size || SZ.sm, underline: {}, bold: !!o.bold })] });
    }
    function H(t, no) {      /* 절 제목 — 다음 덩어리와 붙는다 */
      var kids = [];
      if (no) kids.push(run(no + '  ', { bold: true, color: K.goldInk, size: SZ.sm }));
      kids.push(run(t, { bold: true, color: K.g9, size: SZ.h3 }));
      return P(kids, { kn: true, before: 260, after: 60, border: { bottom: bdr(K.gold, 4) } });
    }
    function sub(t) { return txt(t, { color: K.mut, size: SZ.sm, after: 110, kn: true }); }
    function so(fr) {        /* 해석 상자 — 숫자 옆의 «그래서» 한 줄 */
      if (!fr || !fr.length) return null;
      return new Table({ columnWidths: [CW], width: { size: CW, type: WidthType.DXA },
        borders: { top: NB, bottom: NB, right: NB, left: bdr(K.g6, 18), insideHorizontal: NB, insideVertical: NB },
        rows: [new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: CW, type: WidthType.DXA }, shading: { fill: K.g0 },
          margins: { top: 80, bottom: 80, left: 160, right: 140 }, children: [P(frRuns(fr, { size: SZ.sm, color: K.ink2 }), { after: 0 })] })] })] });
    }
    function cell(children, w, o) {
      o = o || {};
      return new TableCell({ children: children, width: { size: w, type: WidthType.DXA },
        margins: { top: 70, bottom: 70, left: 110, right: 110 }, shading: o.bg ? { fill: o.bg } : undefined });
    }
    function tbl(widths, rows, o) {
      o = o || {};
      var trs = rows.map(function (r, i) {
        return new TableRow({ cantSplit: true, tableHeader: !!(o.head && i === 0), children: r.map(function (c, j) {
          var kids = Array.isArray(c) ? c : [txt(String(c), { size: SZ.sm, after: 0, bold: !!(o.head && i === 0), color: (o.head && i === 0) ? K.mut : K.ink })];
          return cell(kids, widths[j], { bg: (o.head && i === 0) ? K.g0 : undefined });
        }) });
      });
      return new Table({ columnWidths: widths, rows: trs, width: { size: CW, type: WidthType.DXA },
        borders: { top: bdr(o.head ? K.g8 : K.line, o.head ? 8 : 4), bottom: bdr(K.line, 4), left: NB, right: NB,
                   insideHorizontal: bdr(K.line2, 2), insideVertical: NB } });
    }
    function badge(k, t) {  /* 색 + 기호 — 흑백 인쇄에서도 갈린다 */
      var S = { no: ['✕', K.rust, K.rustSoft], ok: ['◐', K.ok, K.okSoft], good: ['✓', K.ok, K.okSoft], un: ['◇', K.amber, K.amberSoft] }[k] || ['◇', K.amber, K.amberSoft];
      return run(' ' + S[0] + ' ' + t + ' ', { bold: true, color: S[1], sh: S[2], size: SZ.cap });
    }
    var ST_NAME = { no: '아직 남음', ok: '재시에서 고침', good: '최근 맞힘', un: '재시 확인 전' };

    var L = M.latest;
    var band = L.passed ? '통과' : '재시 진행 중';
    var body = [];

    /* ── 화학1에서 이어 온 기록 — 화면 ②절과 같은 목록 · 같은 개수(RPT.carry) ── */
    function carrySection(no) {
      var C = M.carry, out = [];
      out.push(H('화학1에서 이어 온 기록', no),
        sub(C.fromName + ' ' + C.rounds[0] + '~' + C.rounds[C.rounds.length - 1] + '회 첫 응시에서 놓친 ' + C.total + '개 개념이 심화반에서 어떻게 됐는지입니다. 점 하나가 ' + C.fromName + ' 한 회차입니다(● 틀림 · ○ 맞힘 · · 안 물음).'));
      var w4 = [Math.floor(CW * 0.27), Math.floor(CW * 0.2), Math.floor(CW * 0.33), CW - Math.floor(CW * 0.8)];
      out.push(tbl(w4, [['개념', C.fromName, '심화반', '지금']].concat(C.show.map(function (r) {
        return [[txt(r.m, { size: SZ.sm, bold: true, after: 0 })],
                [P(r.dots.map(function (d) { return run(d.s === 'x' ? '●' : (d.s === 'o' ? '○' : '·'), { size: SZ.sm, color: d.s === 'x' ? K.rust : (d.s === 'o' ? K.ok : K.mut) }); }), { after: 0 })],
                [txt(r.own, { size: SZ.cap, color: K.ink2, after: 0 })],
                [P([badge(r.st.k, r.st.t)], { after: 0 })]]; })), { head: true }));
      if (C.more) out.push(txt('그 밖에 ' + C.more + '개는 아래 합계에 함께 셌습니다.', { size: SZ.cap, color: K.mut, before: 60, after: 0 }));
      out.push(P([run('심화에서 맞힘 ' + C.ok, { bold: true, color: K.ok, size: SZ.sm }), run('     다시 틀림 ' + C.again, { bold: true, color: K.rust, size: SZ.sm }),
                  run('     아직 안 물음 ' + C.un, { bold: true, color: K.amber, size: SZ.sm }), run('     (모두 ' + C.total + '개)', { color: K.mut, size: SZ.sm })], { before: 100, after: 60 }));
      var s = so(C.so); if (s) out.push(s);
      out.push(P([], { after: 120 }));
      return out;
    }

    /* ── 표지 ── 결론 한 줄을 이미 말한다(exam #9) */
    body.push(P([], { before: 1300 }),
      txt(BRAND, { align: AlignmentType.CENTER, color: K.goldInk, size: SZ.body, bold: true, after: 160 }),
      txt('DT 성적표', { align: AlignmentType.CENTER, bold: true, size: SZ.cover + 10, color: K.g9, after: 110 }),
      txt(course + '  ·  ' + L.round + '회' + (M.total ? '  (' + M.total + '회 중)' : ''), { align: AlignmentType.CENTER, color: K.g8, size: SZ.h2, after: 80 }),
      P([], { before: 2400 }),
      txt(nm + ' 학생', { align: AlignmentType.CENTER, bold: true, size: SZ.num, after: 50 }),
      txt(M.student.school, { align: AlignmentType.CENTER, color: K.mut, size: SZ.body, after: 40 }),
      txt([L.fs != null ? pt(L.fs) + '점' : null, band].filter(Boolean).join('      ·      '),
          { align: AlignmentType.CENTER, bold: true, color: L.passed ? K.ok : K.amber, size: SZ.h3, before: 40, after: 80 }),
      txt('발행일  ' + M.pub, { align: AlignmentType.CENTER, color: K.mut, size: SZ.cap }),
      new Paragraph({ children: [new PageBreak()] }));

    /* ── 한 장 요약 ── */
    var rows = [['이번 회차', course + ' ' + L.round + '회'], ['상태', L.passed ? '통과' : '재시로 채우는 중']];
    if (L.js != null) rows.push(['첫 응시', pt(L.js) + '점']);
    if (L.fs != null) rows.push(['최종', pt(L.fs) + '점']);
    if (L.gain > 0) rows.push(['이번 회차 재시로 올린 점수', '+' + pt(L.gain) + '점']);
    if (M.avgGain > 0 && M.taken > 1) rows.push(['재시로 올린 점수 · 회차 평균', '+' + pt(M.avgGain) + '점']);
    rows.push(['응시한 회차', M.taken + '회  ·  통과 ' + M.passedN + '회']);
    if (M.rank) rows.push(['반에서 위치', '상위 약 ' + M.rank.per100 + '%   ·   ' + M.rank.n + '명 기준' + (M.rank.avg != null ? '   (반 평균 ' + pt(M.rank.avg) + '점)' : '')]);
    body.push(txt('한 장 요약', { align: AlignmentType.CENTER, bold: true, color: K.g9, size: SZ.h2, after: 40, kn: true }),
      txt('뒤에 이어지는 내용의 결론만 모았습니다. 시간이 없으시면 이 장만 보셔도 됩니다.', { align: AlignmentType.CENTER, color: K.mut, size: SZ.sm, after: 180, kn: true }),
      tbl([Math.floor(CW * 0.36), CW - Math.floor(CW * 0.36)], rows.map(function (r) {
        return [[txt(r[0], { size: SZ.sm, color: K.mut, after: 0 })], [txt(r[1], { size: SZ.body, bold: true, color: K.g8, after: 0 })]]; })),
      P([], { after: 200 }));

    /* ── 화학Ⅰ 심화 새 절 (RPT.v2x) ── */
    var X = M.v2x;
    if (X) {
      body.push(P(frRuns(X.lede, { size: SZ.body + 2 }), { before: 120, after: 160 }));
      if (X.tiles.length) {
        var tw = Math.floor(CW / X.tiles.length);
        body.push(new Table({ columnWidths: X.tiles.map(function () { return tw; }), width: { size: tw * X.tiles.length, type: WidthType.DXA },
          borders: { top: bdr(K.g8, 18), bottom: bdr(K.line, 4), left: NB, right: NB, insideHorizontal: NB, insideVertical: bdr(K.line, 4) },
          rows: [new TableRow({ cantSplit: true, children: X.tiles.map(function (t) {
            return new TableCell({ width: { size: tw, type: WidthType.DXA }, margins: { top: 90, bottom: 90, left: 120, right: 120 }, children: [
              P([run(t.v, { bold: true, size: SZ.num, color: K.g9 }), run(t.u || '', { size: SZ.body, color: K.mut })], { after: 20 }),
              txt(t.k, { bold: true, size: SZ.sm, after: 10 }), txt(t.m, { size: SZ.cap, color: K.mut, after: 0 })] }); }) })] }),
          P([], { after: 120 }));
      }
      var no = 0, NO = function () { no++; return '0' + no; };
      /* ① 회차 진행 곡선 — 화면과 같은 SVG 를 그림으로 */
      body.push(H('회차 진행 곡선', NO()), sub(M.total + '회 과정 중 지금 위치입니다. 속 빈 점은 첫 응시, 꽉 찬 점은 재시까지 마친 최종 점수, 점선은 통과선 80입니다.'));
      var png = null;
      try { png = typeof window.curveSVG === 'function' ? await svgPng(window.curveSVG(X.curve, { W: 700, H: 236, fs: 12, ml: 40, mr: 12, mb: 42, titles: true, gainLab: true }), 3) : null; } catch (e) { png = null; }
      if (png && D.ImageRun) {
        var wpx = 600, hpx = Math.round(wpx * png.h / png.w);
        body.push(new Paragraph({ keepNext: true, keepLines: true, alignment: AlignmentType.CENTER, spacing: { after: 60 },
          children: [new D.ImageRun({ type: 'png', data: png.data, transformation: { width: wpx, height: hpx } })] }));
      } else {
        body.push(tbl([1800, 2400, 2400, CW - 6600], [['회차', '첫 응시', '최종', '결과']].concat(M.rounds.map(function (r) {
          return [r.round + '회', r.js != null ? pt(r.js) + '점' : '-', r.fs != null ? pt(r.fs) + '점' : '-', r.passed ? '통과' : '재시']; })), { head: true }));
      }
      body.push(txt('— 최종(재시 포함)   - - 첫 응시   ····· 통과선   ▲ 재시로 올린 몫   ▒ 남은 회차', { size: SZ.cap, color: K.mut, align: AlignmentType.CENTER, after: 80 }));
      var s1 = so(X.so1); if (s1) body.push(s1);
      /* ② 화학1에서 이어 온 기록 */
      if (M.carry) body = body.concat(carrySection(NO()));
      /* ③ 재시로 잡은 개념 */
      if (X.fix) {
        var fx = X.fix;
        body.push(H('재시로 잡은 개념 · ' + fx.round + '회', NO()), sub('첫 응시에서 틀린 ' + fx.total + '개 개념 가운데 재시에서 다시 물어 맞힌 것입니다.'),
          P([run('재시에서 고침 ' + fx.fixed.length + ' (' + fx.pct + '%)', { bold: true, color: K.ok, size: SZ.sm }), run('     다시 확인할 것 ' + fx.open.length, { bold: true, color: K.rust, size: SZ.sm })], { after: 60, kn: true }));
        if (fx.fixed.length) body.push(P(fx.fixed.map(function (x) { return run('✓ ' + x.m + '    ', { color: K.ok, size: SZ.sm }); }), { after: 40 }));
        if (fx.open.length) body.push(P(fx.open.map(function (x) { return run((x.st === 'no' ? '✕ ' : '◇ ') + x.m + '    ', { color: K.rust, size: SZ.sm }); }), { after: 60 }));
        var s3 = so(X.so3); if (s3) body.push(s3);
      }
      /* ④ 되풀이되는 오개념 */
      if (X.chronic.length || M.taken >= 3) {
        body.push(H('되풀이되는 오개념', NO()), sub('세 번 이상 나왔고 절반 이상 틀린 개념입니다. ● 틀림 · ○ 맞음.'));
        if (!X.chronic.length) body.push(txt('아직 없습니다. 같은 개념을 세 번 이상 물어 절반 넘게 틀리면 여기에 섭니다.', { size: SZ.sm, color: K.mut }));
        X.chronic.forEach(function (c) {
          body.push(P([run(c.m + '   ', { bold: true, size: SZ.body }), badge(c.st, ST_NAME[c.st] + ' · ' + c.freq)], { kn: true, after: 30, before: 80 }),
            P(c.tl.map(function (t) { return run(t.t + ' ' + (t.ok ? '○맞음' : '●틀림') + '   ', { size: SZ.cap, color: t.ok ? K.ok : K.rust }); }), { kn: !!c.one.length, after: 30 }));
          if (c.one.length) body.push(P([run('핵심: ', { bold: true, size: SZ.sm, color: K.ink2 })].concat(frRuns(c.one, { size: SZ.sm, color: K.ink2, em: K.ink })), { after: 60 }));
        });
      }
      /* ⑤ 다음 주 예습 */
      if (X.preview) {
        var pv = X.preview;
        body.push(H('다음 주 ' + pv.round + '회 「' + pv.title + '」 예습', NO()),
          sub(pv.round + '회에 처음 나오는 ' + pv.newN + '개 개념' + (pv.units.length ? '(' + pv.units.join(' · ') + ')' : '') + ' 가운데, ' + nm + ' 학생의 기록과 이어지는 것' + (pv.items.length ? '만 골랐습니다.' : '은 아직 없습니다.')));
        pv.items.forEach(function (x, i) {
          body.push(P([run((i + 1) + '.  ', { bold: true, color: K.goldInk }), run(x.m, { bold: true })], { kn: true, after: 20 }),
            P(frRuns(x.why, { size: SZ.sm, color: K.ink2 }), { indent: { left: 360 }, after: x.lec ? 20 : 80, kn: !!x.lec }));
          if (x.lec) body.push(P([link('▶ 개념 강의 보기', x.lec)], { indent: { left: 360 }, after: 80 }));
        });
      }
      /* 부모님께 */
      if (X.parent) {
        var pa = X.parent;
        var kids = [txt('부모님께', { bold: true, color: K.g9, size: SZ.h3, after: 60 }),
          txt('이번 주에 한 번, 아래처럼 물어봐 주세요. 맞았는지보다 아이가 자기 말로 설명하는지를 들어 주시면 됩니다.', { size: SZ.sm, color: K.ink2, after: 80 }),
          txt('“' + pa.q + '”', { bold: true, size: SZ.body, after: 80 })];
        var tail = [];
        if (pa.res) tail.push(run('막히면 ', { size: SZ.sm, color: K.ink2 }), link(pa.res.t, pa.res.abs, { size: SZ.sm, bold: true }), run('를 같이 펼쳐 주세요. ', { size: SZ.sm, color: K.ink2 }));
        tail.push(run('성적표에 이상한 점은 조준모T 카카오톡 메시지로 알려 주세요.', { size: SZ.sm, color: K.ink2 }));
        kids.push(P(tail, { after: 0 }));
        body.push(P([], { after: 120 }), new Table({ columnWidths: [CW], width: { size: CW, type: WidthType.DXA },
          borders: { top: bdr(K.goldBd, 4), bottom: bdr(K.goldBd, 4), left: bdr(K.goldBd, 4), right: bdr(K.goldBd, 4), insideHorizontal: NB, insideVertical: NB },
          rows: [new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: CW, type: WidthType.DXA }, shading: { fill: K.goldSoft },
            margins: { top: 160, bottom: 160, left: 200, right: 200 }, children: kids })] })] }), P([], { after: 160 }));
      }
    }

    /* ── 단원별 정답률 — 약한 순 · 화면(unitHeat)과 같은 이름표 ──
       ⚠⚠ `u.w` 는 틀린 수다. 맞은 수 = t - w (RPT.units 의 got). 처음에 이것을 뒤집어 88점 학생의
       8/8 단원을 0/8 · 0% 로 적은 적이 있다 — tests/docx-report.js 가 한 줄씩 맞대 본다.
       ⚠ 문항 두 개 미만은 판정하지 않는다(화면 UNIT_MIN_Q). */
    if (M.units.length) {
      body.push(H('단원별 정답률'), sub('누적 기준입니다. 위에 있을수록 먼저 손댈 곳입니다.'));
      var w3 = [Math.floor(CW * 0.52), Math.floor(CW * 0.24), CW - Math.floor(CW * 0.76)];
      body.push(tbl(w3, [['단원', '맞은/전체', '정답률']].concat(M.units.map(function (u) {
        return [[txt(u.label, { size: SZ.body, color: u.thin ? K.mut : K.ink, after: 0 })],
                [txt(u.got + ' / ' + u.t, { size: SZ.body, color: K.mut, after: 0 })],
                [txt(u.thin ? '판정 안 함' : (u.pct + '%'), { size: u.thin ? SZ.sm : SZ.body, bold: !u.thin, after: 0,
                  color: u.thin ? K.mut : (u.pct >= 80 ? K.ok : (u.pct >= 60 ? K.amber : K.rust)) })]]; })), { head: true }),
        P([], { after: 180 }));
    }

    /* ── 다시 볼 개념 — 화면 「반복해서 막히는 곳」 과 같은 이름 · 같은 분모(chronicFreqText) ── */
    var CH = M.chronic, CC = (M.carry && M.carry.chronic) || [];
    if (CH.length || CC.length) {
      body.push(H('다시 볼 개념'), sub('여러 회차에 걸쳐 반복해서 막힌 곳입니다. 여기부터 같이 보시면 가장 빨리 오릅니다.'));
      CH.slice(0, 8).forEach(function (m, i) {
        var kids = [run((i + 1) + '.  ', { bold: true, color: K.goldInk }), run(m.label, { bold: true }), run('    ' + m.freq, { color: K.mut, size: SZ.sm })];
        if (m.lec) kids.push(run('    '), link('개념 강의', m.lec));
        body.push(P(kids, { after: 60 }));
      });
      CC.forEach(function (x, i) {
        body.push(P([run((Math.min(CH.length, 8) + i + 1) + '.  ', { bold: true, color: K.goldInk }), run(x.m, { bold: true }), run('    ' + x.freq, { color: K.mut, size: SZ.sm }),
                     run('   화학1 기록 합산', { color: K.g8, size: SZ.cap, bold: true })], { after: 20, kn: true }),
          txt(x.line, { size: SZ.cap, color: K.mut, after: 60, indent: { left: 360 } }));
      });
      body.push(P([], { after: 120 }));
    }

    /* ── 화학1에서 이어 온 기록 (새 절이 아닌 과목에서 이어 온 기록이 있을 때) ── */
    if (!X && M.carry) body = body.concat(carrySection(''));

    /* ── 이번 주 처방 (예전 길 — 화면이 그린 문장을 그대로) ── */
    if (!X) {
      try {
        var rxHtml = window.rxNarrCard ? window.rxNarrCard() : '';
        if (rxHtml) {
          var box = document.createElement('div'); box.innerHTML = rxHtml;
          var ps = [].slice.call(box.querySelectorAll('p')).map(function (e) { return e.innerHTML; })
            .filter(function (t) { return t && t.replace(/<[^>]+>/g, '').trim().length > 10; });
          if (ps.length) {
            body.push(H('이번 주 처방 코멘트'));
            ps.forEach(function (t) { body.push(P(frRuns(htmlFr(t)), { after: 90 })); });
            body.push(P([], { after: 160 }));
          }
        }
      } catch (e) { /* 처방이 없으면 그 장을 안 넣는다 */ }
    }

    /* ── 지금까지의 여정 ── */
    if (M.rounds.length > 1) {
      body.push(H('지금까지의 여정'));
      body.push(tbl([Math.floor(CW * 0.22), Math.floor(CW * 0.2), Math.floor(CW * 0.2), Math.floor(CW * 0.18), CW - Math.floor(CW * 0.8)],
        [['회차', '첫 응시', '최종', '결과', '첫 응시 날']].concat(M.rounds.map(function (t) {
          return [[txt(course + ' ' + t.round + '회', { size: SZ.sm, after: 0 })],
                  [txt(t.js != null ? pt(t.js) + '점' : '-', { size: SZ.sm, color: K.mut, after: 0 })],
                  [txt(t.fs != null ? pt(t.fs) + '점' : '-', { size: SZ.sm, bold: true, after: 0 })],
                  [txt(t.passed ? '통과' : '재시', { size: SZ.sm, bold: true, after: 0, color: t.passed ? K.ok : K.amber })],
                  [txt(t.date || '', { size: SZ.sm, color: K.mut, after: 0 })]]; })), { head: true }),
        P([], { after: 200 }));
    }

    /* ══ 오답노트 (선생님 요청 2026-08-15) — 화면 buildSolutions 가 만든 목록(__wrongbook)을 그대로.
       ⚠ 여기서 답안을 다시 맞춰 보지 않는다. 틀린 것이 없으면 빈 제목을 안 남긴다. */
    var WB = window.__wrongbook || null;
    if (WB && WB.items && WB.items.length) {
      var LVL_WORD = { 1: '기본', 2: '표준', 3: '심화' };
      var coreOf = function (mis, it) { return nostar((it && it.core) || (WB.cores && mis != null && WB.cores[mis]) || '').trim(); };
      var fixOf = function (it) { return (it.a === 'X' && it.f && String(it.f) !== String(it.s || '')) ? String(it.f) : ''; };
      body.push(H('오답노트'),
        txt('이번 회차에서 틀린 ' + WB.items.length + '문항입니다. 개념이 같은 것끼리 묶었고, 문장 아래에 왜 틀렸는지를 적었습니다.', { color: K.mut, size: SZ.sm, after: 120 }));
      var seen = null;
      WB.items.forEach(function (it) {
        if (it.mis !== seen) {
          seen = it.mis;
          body.push(txt('· ' + (it.mis || '기타'), { bold: true, color: K.g8, size: SZ.body, before: 140, after: 40, kn: true }));
          var core = coreOf(it.mis, it);
          if (core) body.push(txt(core, { color: K.ink, size: SZ.sm, after: 70, kn: true }));
        }
        body.push(P([run(String(it.n) + '번  ', { bold: true, color: K.goldInk, size: SZ.sm }), run(it.s || '', { size: SZ.sm })], { after: 20, kn: true }));
        var fix = fixOf(it);
        if (fix) body.push(P([run('바르게 고치면: ', { bold: true, color: K.ok, size: SZ.sm }), run(fix, { color: K.ok, size: SZ.sm })], { after: 20, kn: true }));
        var lvlW = LVL_WORD[it.lvl] || '';
        body.push(P([run('정답 ' + it.a + '  ·  내 답 ', { color: K.mut, size: SZ.cap }), run(it.mine || '–', { bold: true, color: K.rust, size: SZ.cap }),
                     run(lvlW ? ('  ·  ' + lvlW) : '', { color: K.mut, size: SZ.cap })], { after: it.w ? 20 : 90, kn: !!it.w }));
        if (it.w) body.push(txt('→ ' + it.w, { color: K.mut, size: SZ.cap, i: true, after: 90 }));
      });
    }

    /* ── 연락할 곳 — 하나만 적는다 ── */
    body.push(P([run('성적표에 이상한 점이 있거나 더 여쭐 것이 있으시면  ', { color: K.mut, size: SZ.sm }),
                 run('조준모T 카카오톡 메시지', { bold: true, color: K.g8, size: SZ.sm }), run('  로 연락 주세요.', { color: K.mut, size: SZ.sm })],
                { align: AlignmentType.CENTER, before: 240, after: 60, kn: true }),
      txt('이 성적표는 ' + nm + ' 학생을 위한 개인 맞춤 분석 자료입니다.  ·  ' + BRAND, { align: AlignmentType.CENTER, color: K.mut, size: SZ.cap, i: true }));

    var mkHdr = function () {
      return new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: bdr(K.line, 4) }, spacing: { after: 120 },
        children: [run(BRAND, { color: K.goldInk, size: SZ.cap, bold: true }), run('    DT 성적표 · ' + course + ' ' + L.round + '회 · ' + nm, { color: K.mut, size: SZ.cap })] })] });
    };
    var ftr = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [run(BRAND + '       ', { color: K.mut, size: SZ.cap }),
                 new TextRun({ children: [PageNumber.CURRENT], color: K.goldInk, size: SZ.cap, bold: true }),
                 run('  /  ', { color: K.mut, size: SZ.cap }),
                 new TextRun({ children: [PageNumber.TOTAL_PAGES], color: K.mut, size: SZ.cap })] })] });

    var doc = new D.Document({
      creator: BRAND,
      title: nm + ' ' + course + ' ' + L.round + '회 DT 성적표',
      styles: { default: { document: { run: { font: 'Malgun Gothic', color: K.ink } } } },
      sections: [{
        properties: { titlePage: true, page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1200, right: 1080, bottom: 1200, left: 1080, header: 560, footer: 560 } } },
        headers: { default: mkHdr(), first: new Header({ children: [new Paragraph({ children: [] })] }) },
        footers: { default: ftr, first: new Footer({ children: [new Paragraph({ children: [] })] }) },
        children: body }]
    });

    return { doc: doc, Packer: D.Packer,
             fn: (nm + '_' + course + '_' + L.round + '회_성적표').replace(/[\\/:*?"<>|]+/g, '') + '.docx' };
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
