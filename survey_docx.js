/* ============================================================
   「화학1 돌아보기」 진단 보고서 — Word(.docx) 생성기 (survey_docx.js · window.SurveyDocx)
   ------------------------------------------------------------
   학부모·학생에게 파일로 주고 선생님이 인쇄하는 최종본이다. 화면 인쇄판(survey_render.js)과
   **같은 계산 결과 A**(survey_analysis.js analyzeAll)와 **같은 문장 함수**(SurveyRender.words)를 쓴다 —
   여기서 다시 세지 않는다. 화면과 Word 가 다른 숫자를 말하면 안 된다(tests/survey_docx.js 가 맞춰 본다).

   ■ 쓰는 법
       SurveyDocx.build([{ A, name, school, year, surveyDate, bank, today }], { batch }) → Promise<{ blob, fn, plan }>
       SurveyDocx.save(blob, fn)                                     내려받기
       SurveyDocx.fileName(name)                                     「화학1 돌아보기 진단 보고서 - <이름>.docx」
     학생이 여럿이면 학생마다 Word 구역(section)을 나눈 한 파일이 된다 — 쪽 번호는 학생마다 1부터,
     «쪽 n / N» 의 N 도 그 학생 구역의 쪽수(SECTIONPAGES)다.

   ■ 그림
     SurveyRender.charts 의 SVG 문자열을 canvas 로 3배 PNG 로 구워 넣는다(여정·산점도·치우침·방사형·
     자기조절 고리·시험 시간표·과목 추이·그때와 지금). 꾸밈 그림(표지 배경·쪽 틀·장식 줄·로고)은
     assets/survey_report/ 에서 누를 때 불러온다(tools/survey_report_art.js 가 그린 것).

   ■ 쪽 나눔 — LibreOffice 와 Word 가 글꼴 높이를 다르게 재므로
     · 모든 글 문단은 줄 높이를 «고정»(EXACT)으로 둔다 — 줄 수만 맞으면 높이가 같다.
     · 문단은 쪽에서 쪼개지지 않고(keepLines), 제목은 다음 덩어리와 붙고(keepNext), 표 행은 쪼개지지 않는다(cantSplit).
     · 덩어리마다 높이를 어림해(est) 미리 쪽을 나눠 본다(plan). 절은 새 쪽에서 시작하되, 앞 절의 마지막 쪽이
       절반도 안 찼으면 그 쪽에 이어 붙인다 — 빈 공간이 반 넘는 쪽이 생기지 않게. 그렇게 정한 쪽 나눔을
       문서에 «쪽 나눔 앞에»(pageBreakBefore)로 박는다. 목차의 쪽 번호도 이 계획에서 나온다(PAGEREF 필드).
     · 어림은 일부러 넉넉하게(줄 폭 7% 여유, 쪽마다 420twip 여유) 잡는다.

   ■ 말투(근거 연구 §6) — 과제·과정·자기조절을 말하고 사람을 평가하지 않는다. 다른 학생과 비교하지 않는다.
     수상·등급·석차를 말하는 낱말은 쓰지 않는다. 숫자마다 «그래서 무슨 뜻인지» 한 줄을 붙인다.
   ============================================================ */
(function (root) {
  'use strict';
  var SR = root.SurveyRender || (typeof require === 'function' ? require('./survey_render.js') : null);
  var SA = root.SurveyAnalysis || (typeof require === 'function' ? require('./survey_analysis.js') : null);
  var WD = SR.words, CAT = SR.CAT, CAT_ORDER = SR.CAT_ORDER;
  var LIB = 'vendor/docx.iife.js', ART = 'assets/survey_report/';
  var BRAND = '화학 · 다원교육 · 조준모', TITLE = '화학1 18회 돌아보기 진단 보고서';
  var FONT = 'Malgun Gothic';
  var D = null;   // docx 이름공간(build 때 채운다)

  /* ── 쪽 틀(twip) ── A4 11906 × 16838 */
  var PG = { w: 11906, h: 16838, top: 1420, bottom: 1300, side: 1080, header: 600, footer: 560 };
  var CW = PG.w - 2 * PG.side;            // 본문 폭 9746
  var BODY = PG.h - PG.top - PG.bottom;   // 본문 높이 14118
  var CAP = BODY - 420;                   // 어림에 쓰는 높이(여유를 둔다)

  /* ── 색 ── 짙은 초록(화학·다원교육) + 절제된 금색. 화면 인쇄판과 같은 계열 */
  var K = { g9: '0B3B30', g8: '0E5A4C', g7: '1F6F5C', g6: '2E7D66', g3: 'A9CBBE', g2: 'CFE3DB', g1: 'E8F1EE', g0: 'F3F8F6',
    gold: 'A9853C', goldInk: '8A6A38', gold2: 'C9A962', goldSoft: 'F7F1E3', goldLine: 'E6D6B0', goldLight: 'D9C79A',
    ink: '1F2A26', ink2: '4A5651', mut: '5E6A65', line: 'E3E0D6', line2: 'EFECE4', cream: 'FBFAF6', white: 'FFFFFF',
    red: 'A6441F', redSoft: 'FBF1EC', ok: '17663F', okSoft: 'E5F3EB', amber: '7F6118', amberSoft: 'FAF2DF', blue: '235A87', blueSoft: 'E7F0F8' };
  function hx(c) { return String(c || '').replace('#', '').toUpperCase(); }
  function catC(k) { var c = CAT[k]; return { color: hx(c.color), tint: hx(c.tint), ink: hx(c.ink), solid: hx(c.solid), name: c.name, desc: c.desc, act: c.act }; }

  /* ── 작은 도구 ── */
  var pct = WD.pct, fx = WD.fx, sgn = WD.sgn, ymd = WD.ymd, short = WD.short, josa = WD.josa, labelOf = WD.labelOf;
  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  function dec(t) { return String(t).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
  function n100(v) { return v == null || isNaN(v) ? '—' : String(Math.round(v * 100)); }
  function plainMd(t) { return String(t || '').replace(/\*\*(.+?)\*\*/g, '$1'); }

  /* 줄 높이(고정) — 글 크기(반 포인트) → twip */
  var LH = { 14: 220, 15: 230, 16: 250, 17: 260, 18: 275, 19: 290, 20: 310, 21: 325, 22: 340, 24: 370, 26: 400, 28: 430, 30: 460, 32: 480, 34: 500, 36: 520, 40: 580, 44: 620, 48: 660, 52: 700, 56: 740, 60: 780, 64: 820 };
  function lh(size) { return LH[size] || Math.round(size * 15.5); }

  /* 글자 폭 어림(em) — LibreOffice 가 맑은 고딕 대신 쓰는 DejaVu(라틴)·WenQuanYi(한글) 기준이라 윈도 맑은 고딕보다 넓게 잡힌다 */
  function cw(ch) {
    var c = ch.charCodeAt(0);
    if ((c >= 0xAC00 && c <= 0xD7A3) || (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F) || (c >= 0x4E00 && c <= 0x9FFF) ||
      (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFFEF) || (c >= 0x2460 && c <= 0x27BF)) return 1.0;
    if (ch === ' ') return 0.33;
    if (c >= 48 && c <= 57) return 0.64;
    if (c >= 65 && c <= 90) return 0.72;
    if (c >= 97 && c <= 122) return 0.6;
    if ('.,:;\'"!|()[]·'.indexOf(ch) >= 0) return 0.4;
    if ('«»<>=+-/%~×→←↑↓▲▼≥≤±−'.indexOf(ch) >= 0) return 0.8;
    return 0.95;
  }
  function textW(t, size, bold) { var s = 0; t = String(t); for (var i = 0; i < t.length; i++) s += cw(t.charAt(i)); return s * size * 10 * (bold ? 1.04 : 1); }
  /* segs 를 폭 w 에 넣었을 때 줄 수 — 어절 단위로 넘기는 것을 감안해 7% 여유 */
  function linesOf(segs, w, size) {
    var n = 0, cur = 0;
    segs.forEach(function (s) {
      if (s.br) { n += Math.max(1, Math.ceil(cur * 1.07 / w)); cur = 0; return; }
      if (s.t != null) cur += textW(s.t, s.s || size, s.b); else if (s.field) cur += 2 * size * 10;
    });
    n += Math.max(1, Math.ceil(cur * 1.07 / w));
    return n;
  }

  /* HTML 조각(SurveyRender.words 가 돌려준 것) → segs — <b> 굵게 · sp-dim 흐리게 · sp-band 색 · <br> 줄바꿈 */
  function hsegs(html, base) {
    base = base || {};
    var out = [], st = [{ b: !!base.b, c: base.c || null }], re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g, m;
    function top() { return st[st.length - 1]; }
    var src = String(html == null ? '' : html);
    while ((m = re.exec(src))) {
      if (m[4] != null) { var t = dec(m[4]); if (t) out.push({ t: t, b: top().b, c: top().c }); continue; }
      var close = m[1] === '/', tag = m[2].toLowerCase(), at = m[3] || '';
      if (tag === 'br') { out.push({ br: true }); continue; }
      if (close) { if (st.length > 1) st.pop(); continue; }
      var s = { b: top().b, c: top().c };
      if (tag === 'b' || tag === 'strong') s.b = true;
      if (/sp-dim/.test(at)) s.c = K.mut;
      var bm = /sp-band (good|ok|low|na)/.exec(at);
      if (bm) { s.b = true; s.c = { good: K.ok, ok: K.amber, low: K.red, na: K.mut }[bm[1]]; out.push({ t: ' ' }); }
      st.push(s);
    }
    return out;
  }
  function norm(segs) {
    if (segs == null) return [];
    if (!Array.isArray(segs)) segs = [segs];
    var out = [];
    segs.forEach(function (s) { if (s == null) return; if (typeof s === 'string' || typeof s === 'number') out.push({ t: String(s) }); else if (s.html != null) out.push.apply(out, hsegs(s.html, s)); else out.push(s); });
    return out;
  }

  /* ══════════ docx 조각 ══════════ */
  function RUN(s, size, o) {
    if (s.br) return new D.TextRun({ text: '', break: 1 });
    if (s.field) return s.field;
    var opt = { text: s.t, size: s.s || size, bold: s.b == null ? !!o.b : !!s.b, color: s.c || o.c || K.ink, font: FONT };
    if (s.sp || o.sp) opt.characterSpacing = s.sp || o.sp;
    if (s.strike) opt.strike = true;
    if (s.sh) opt.shading = { type: D.ShadingType.CLEAR, fill: s.sh, color: 'auto' };
    if (s.u) opt.underline = { type: 'single', color: s.u };
    return new D.TextRun(opt);
  }
  function SH(fill) { return fill ? { type: D.ShadingType.CLEAR, fill: fill, color: 'auto' } : undefined; }
  function BD(color, size, style, space) { return { style: style || D.BorderStyle.SINGLE, size: size || 4, color: color || K.line, space: space == null ? 1 : space }; }
  var NONE = null;
  function noBorders() { var n = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }; return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n }; }

  /* 문단 — {el, h(어림 높이), kn(다음과 붙임)} */
  function P(segs, o) {
    o = o || {};
    segs = norm(segs);
    if (!segs.length) segs = [{ t: '' }];
    var size = o.size || 20, line = o.line || lh(size);
    var w = (o.w || CW) - (o.indL || 0) - (o.indR || 0) - (o.padW || 0);
    var kids = [];
    if (o.bookmark) kids.push(new D.Bookmark({ id: o.bookmark, children: segs.slice(0, 1).map(function (s) { return RUN(s, size, o); }) }));
    segs.slice(o.bookmark ? 1 : 0).forEach(function (s) { kids.push(RUN(s, size, o)); });
    var p = new D.Paragraph({
      alignment: o.align ? D.AlignmentType[o.align] : undefined,
      spacing: { before: o.before || 0, after: o.after || 0, line: line, lineRule: D.LineRuleType.EXACT },
      keepNext: !!o.kn, keepLines: true, pageBreakBefore: !!o.brk, widowControl: true,
      border: o.border, shading: SH(o.fill),
      indent: (o.indL || o.indR || o.hang) ? { left: o.indL || 0, right: o.indR || 0, hanging: o.hang || undefined } : undefined,
      tabStops: o.tabs, children: kids
    });
    var n = o.lines || linesOf(segs, Math.max(400, w), size);
    return { el: p, h: n * line + (o.before || 0) + (o.after || 0) + (o.extraH || 0), kn: !!o.kn, kind: 'p' };
  }
  function SP(h) { return P([{ t: '', s: 2 }], { size: 2, line: Math.max(20, h) }); }
  /* 그림 문단 — png:{data,w,h} · wpx: 96dpi 화소 폭 */
  function IMG(png, wpx, o) {
    o = o || {};
    if (!png) return P([{ t: '그림을 그리지 못했습니다.', c: K.mut }], { size: 17, w: o.w });
    var hpx = Math.round(wpx * png.h / png.w);
    var p = new D.Paragraph({ alignment: D.AlignmentType[o.align || 'CENTER'], keepNext: !!o.kn, keepLines: true,
      spacing: { before: o.before || 0, after: o.after || 0, line: 240, lineRule: D.LineRuleType.AUTO },
      children: [new D.ImageRun({ type: 'png', data: png.data, transformation: { width: wpx, height: hpx }, altText: o.alt ? { name: o.alt, description: o.alt, title: o.alt } : undefined })] });
    return { el: p, h: hpx * 15 + (o.before || 0) + (o.after || 0) + 80, kn: !!o.kn, kind: 'p' };
  }

  /* 표 — rows: [{cells:[{span, c:[항목], fill, bd:{top,bottom,left,right}, m:[위,오른,아래,왼], va}], h(고정), min, hdr}]
     항목: t(segs, 문단옵션) · im(png, wpx, 옵션) — 칸 폭을 알아야 줄 수를 어림하므로 표가 만든다.
     o.atomic 이면 마지막 행 말고 모든 행의 문단에 keepNext — 표 전체가 한 쪽에 붙는다(카드). */
  function t(segs, o) { return { k: 't', segs: segs, o: o || {} }; }
  function im(png, wpx, o) { return { k: 'im', png: png, wpx: wpx, o: o || {} }; }
  function TB(colW, rows, o) {
    o = o || {};
    var rowEls = [], rowH = [], hdrH = 0, hdrN = 0;
    rows.forEach(function (r, ri) {
      var last = ri === rows.length - 1, kn = !!(o.atomic && !last) || !!r.kn;
      var ci = 0, cells = [], hmax = 0;
      r.cells.forEach(function (c) {
        var span = c.span || 1, w = sum(colW.slice(ci, ci + span)); ci += span;
        var m = c.m || r.m || o.m || [80, 120, 80, 120];
        var inner = w - m[1] - m[3] - (c.bd && c.bd.left ? Math.round((c.bd.left.size || 4) * 2.5) : 0);
        var hh = 0, kids = [];
        (c.c || []).forEach(function (it) {
          var b;
          if (it.k === 'im') b = IMG(it.png, Math.min(it.wpx, Math.floor(inner / 15)), Object.assign({}, it.o, { kn: kn || it.o.kn, w: inner }));
          else b = P(it.segs, Object.assign({}, it.o, { w: inner, kn: kn || it.o.kn }));
          kids.push(b.el); hh += b.h;
        });
        if (!kids.length) { var e = P([{ t: '', s: 2 }], { size: 2, line: 40, w: inner, kn: kn }); kids.push(e.el); hh += e.h; }
        hmax = Math.max(hmax, hh + m[0] + m[2]);
        var bd = c.bd || {};
        var nb = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        cells.push(new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, columnSpan: span > 1 ? span : undefined,
          shading: SH(c.fill), verticalAlign: c.va ? D.VerticalAlignTable[c.va] : D.VerticalAlignTable.TOP,
          margins: { top: m[0], right: m[1], bottom: m[2], left: m[3] },
          borders: { top: bd.top || nb, bottom: bd.bottom || nb, left: bd.left || nb, right: bd.right || nb },
          children: kids }));
      });
      var h = r.h ? r.h : Math.max(hmax, r.min || 0);
      rowH.push(h); if (r.hdr) { hdrH += h; hdrN++; }
      rowEls.push(new D.TableRow({ children: cells, cantSplit: true, tableHeader: !!r.hdr,
        height: r.h ? { value: r.h, rule: D.HeightRule.EXACT } : (r.min ? { value: r.min, rule: D.HeightRule.ATLEAST } : undefined) }));
    });
    var tbl = new D.Table({ columnWidths: colW, width: { size: sum(colW), type: D.WidthType.DXA }, layout: D.TableLayoutType.FIXED,
      borders: noBorders(), alignment: o.center ? D.AlignmentType.CENTER : undefined, rows: rowEls });
    return { el: tbl, kind: 'tbl', rows: rowH, hdr: hdrH, hdrN: hdrN, atomic: !!o.atomic, h: sum(rowH), kn: !!o.kn };
  }
  function eq(n, w) { var a = [], x = Math.floor((w || CW) / n); for (var i = 0; i < n; i++) a.push(i === n - 1 ? (w || CW) - x * (n - 1) : x); return a; }

  /* ══════════ 꾸밈 덩어리 ══════════ */
  /* 절 머리 — 영문 눈썹 · 번호 + 제목(겹줄) · 이끄는 문단. brk = 새 쪽에서 시작 */
  function secHead(no, title, en, lede, bk) {
    return function (brk) {
      var out = [];
      out.push(P([{ t: (/^\d+$/.test(no) ? 'SECTION ' + no + '   ·   ' : '') + en, c: K.goldInk, b: true }], { size: 16, sp: 36, kn: true, brk: brk, before: brk ? 0 : 520, after: 40,
        border: brk ? undefined : { top: BD(K.goldLine, 6, D.BorderStyle.SINGLE, 14) } }));
      out.push(P([{ t: no, c: K.gold, b: true, s: 46 }, { t: '   ', s: 30 }, { t: title, c: K.g9, b: true, s: 40 }], { size: 40, line: 660, kn: true, after: 170, bookmark: bk,
        border: { bottom: BD(K.g8, 18, D.BorderStyle.THICK_THIN_SMALL_GAP, 6) }, extraH: 60 }));
      if (lede) out.push(P({ html: lede, c: K.ink2 }, { size: 20, line: 330, kn: true, after: 200 }));
      return out;
    };
  }
  /* 가운데 머리(한 장 요약 · 목차) */
  function centerHead(kicker, title, lede, art, bk) {
    return function (brk) {
      var out = [];
      out.push(P([{ t: '◆   ' + kicker + '   ◆', c: K.gold, b: true }], { size: 17, sp: 50, align: 'CENTER', kn: true, brk: brk, after: 60 }));
      out.push(P([{ t: title, c: K.g9, b: true }], { size: 48, line: 700, align: 'CENTER', kn: true, bookmark: bk }));
      if (art.divider) out.push(IMG(art.divider, 300, { kn: true, after: 60 }));
      if (lede) out.push(P({ html: lede, c: K.ink2 }, { size: 20, line: 330, align: 'CENTER', kn: true, after: 240, indL: 600, indR: 600 }));
      return out;
    };
  }
  function H3(text, o) {
    o = o || {};
    return P([{ t: text, c: K.g9, b: true }].concat(o.sub ? [{ t: '   ' + o.sub, c: K.mut, b: false, s: 17 }] : []),
      { size: 22, line: 360, before: o.before == null ? 260 : o.before, after: 110, kn: true, indL: 150, border: { left: BD(o.color || K.gold, 24, D.BorderStyle.SINGLE, 8) } });
  }
  function CAPT(segs, o) { o = o || {}; return P(typeof segs === 'string' ? { html: segs, c: K.mut } : segs, { size: 17, line: 270, before: o.before == null ? 80 : o.before, after: o.after == null ? 160 : o.after, c: K.mut, kn: !!o.kn }); }
  /* 해석 상자 — 왼쪽 금색 띠 */
  function NOTE(html, o) {
    o = o || {};
    var color = o.color || K.gold, fill = o.fill || K.cream;
    var items = [];
    if (o.label) items.push(t([{ t: o.label, c: o.labelC || K.g8, b: true }], { size: 18, line: 290, after: 40 }));
    items.push(t({ html: html, c: o.c || K.ink }, { size: o.size || 19, line: o.line || 300 }));
    return TB([CW], [{ cells: [{ c: items, fill: fill, bd: { left: BD(color, 30, D.BorderStyle.SINGLE, 0) }, m: [140, 200, 140, 220] }] }], { atomic: true });
  }
  function EMPTY(head, sub) {
    var items = [t([{ t: head, c: K.g8, b: true }], { size: 21, align: 'CENTER', after: sub ? 60 : 0 })];
    if (sub) items.push(t({ html: sub, c: K.ink2 }, { size: 18, align: 'CENTER' }));
    return TB([CW], [{ cells: [{ c: items, fill: K.g0, bd: { top: BD(K.g2, 6, D.BorderStyle.DASHED), bottom: BD(K.g2, 6, D.BorderStyle.DASHED), left: BD(K.g2, 6, D.BorderStyle.DASHED), right: BD(K.g2, 6, D.BorderStyle.DASHED) }, m: [240, 240, 240, 240] }] }], { atomic: true });
  }
  function CARD(items, o) {
    o = o || {};
    var b = BD(o.border || K.line, 6);
    return { c: items, fill: o.fill || K.white, bd: { top: o.top ? BD(o.top, 24, D.BorderStyle.SINGLE, 0) : b, bottom: b, left: o.left ? BD(o.left, 24, D.BorderStyle.SINGLE, 0) : b, right: b }, m: o.m || [120, 150, 120, 150], va: o.va };
  }
  /* 가로 막대(표 칸 둘) — 문자 막대 대신 칸을 칠한다: 어느 뷰어에서도 같은 길이 */
  function BAR(p, w, color, h) {
    p = p == null || isNaN(p) ? 0 : Math.max(0, Math.min(1, p));
    var a = Math.max(0, Math.round(w * p)), b = w - a, cells = [];
    if (a >= 40) cells.push({ c: [], fill: color, m: [0, 0, 0, 0] });
    if (b >= 40) cells.push({ c: [], fill: 'ECEAE3', m: [0, 0, 0, 0] });
    if (!cells.length) cells.push({ c: [], fill: 'ECEAE3', m: [0, 0, 0, 0] });
    var cols = []; if (a >= 40) cols.push(b >= 40 ? a : w); if (b >= 40) cols.push(a >= 40 ? b : w);
    if (!cols.length) cols = [w];
    return TB(cols, [{ cells: cells, h: h || 150 }]);
  }
  /* 띠 막대가 들어간 한 줄(이름 | 막대 | 값) — 표 하나의 행으로 돌려준다 */
  function barRow(name, p, value, color, o) {
    o = o || {};
    var lw = o.lw || 2600, vw = o.vw || 1000, bw = (o.w || CW) - lw - vw;
    return { cells: [
      { c: [t(name, { size: o.size || 18, line: lh(o.size || 18), c: K.ink2, b: !!o.bold })], m: [50, 120, 50, 0], va: 'CENTER' },
      { c: [], m: [0, 0, 0, 0], va: 'CENTER', bar: { p: p, w: bw - 160, color: color } },
      { c: [t([{ t: value, b: true, c: o.vc || K.ink2 }], { size: o.size || 18, line: lh(o.size || 18), align: 'RIGHT' })], m: [50, 0, 50, 80], va: 'CENTER' }], kn: o.kn };
  }
  /* barRow 들을 표로 — 막대 칸에는 작은 표(BAR)를 넣는다 */
  function BARS(rows, o) {
    o = o || {};
    var lw = o.lw || 2600, vw = o.vw || 1000, W = o.w || CW, bw = W - lw - vw;
    var built = rows.map(function (r) {
      var cells = r.cells.map(function (c) {
        if (!c.bar) return c;
        return { m: [0, 80, 0, 80], va: 'CENTER', raw: BAR(c.bar.p, c.bar.w, c.bar.color, o.barH || 150) };
      });
      return { cells: cells, kn: r.kn };
    });
    return TBraw([lw, bw, vw], built, o);
  }
  /* TB 와 같지만 칸 안에 미리 만든 표(raw)를 넣을 수 있다 */
  function TBraw(colW, rows, o) {
    o = o || {};
    var rowEls = [], rowH = [];
    rows.forEach(function (r, ri) {
      var last = ri === rows.length - 1, kn = !!(o.atomic && !last) || !!r.kn;
      var ci = 0, cells = [], hmax = 0;
      r.cells.forEach(function (c) {
        var span = c.span || 1, w = sum(colW.slice(ci, ci + span)); ci += span;
        var m = c.m || [60, 100, 60, 100], inner = w - m[1] - m[3], kids = [], hh = 0;
        (c.c || []).forEach(function (it) {
          var b = it.k === 'im' ? IMG(it.png, Math.min(it.wpx, Math.floor(inner / 15)), Object.assign({}, it.o, { kn: kn || it.o.kn })) : P(it.segs, Object.assign({}, it.o, { w: inner, kn: kn || it.o.kn }));
          kids.push(b.el); hh += b.h;
        });
        if (c.raw) { kids.push(c.raw.el); hh += c.raw.h; var tail = P([{ t: '', s: 2 }], { size: 2, line: 20, kn: kn }); kids.push(tail.el); hh += 20; }
        if (!kids.length) { var e = P([{ t: '', s: 2 }], { size: 2, line: 40, kn: kn }); kids.push(e.el); hh += 40; }
        hmax = Math.max(hmax, hh + m[0] + m[2]);
        var bd = c.bd || {}, nb = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        cells.push(new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, columnSpan: span > 1 ? span : undefined, shading: SH(c.fill),
          verticalAlign: c.va ? D.VerticalAlignTable[c.va] : D.VerticalAlignTable.TOP, margins: { top: m[0], right: m[1], bottom: m[2], left: m[3] },
          borders: { top: bd.top || nb, bottom: bd.bottom || nb, left: bd.left || nb, right: bd.right || nb }, children: kids }));
      });
      rowH.push(Math.max(hmax, r.min || 0));
      rowEls.push(new D.TableRow({ children: cells, cantSplit: true, tableHeader: !!r.hdr, height: r.min ? { value: r.min, rule: D.HeightRule.ATLEAST } : undefined }));
    });
    return { el: new D.Table({ columnWidths: colW, width: { size: sum(colW), type: D.WidthType.DXA }, layout: D.TableLayoutType.FIXED, borders: noBorders(), rows: rowEls }),
      kind: 'tbl', rows: rowH, hdr: 0, hdrN: 0, atomic: !!o.atomic, h: sum(rowH), kn: !!o.kn };
  }
  function chipSeg(k, extra) { var c = catC(k); return { t: ' ' + c.name + (extra || '') + ' ', b: true, c: c.ink, sh: c.tint, s: 16 }; }
  function tagSegs(r) {
    var out = [], T = [['provisional', '잠정'], ['ref', '참고'], ['chronic', '반복 막힘'], ['resolved', '막힘 해소'], ['latent', '잠복 직관'], ['recovered', '재시 회복']];
    T.forEach(function (x) { if (r.tags.indexOf(x[0]) >= 0) { out.push({ t: ' ', s: 14 }); out.push({ t: ' ' + x[1] + ' ', s: 15, b: true, c: K.ink2, sh: K.line2 }); } });
    return out;
  }
  function dotsSegs(C) {
    if (C == null) return [{ t: '—', c: K.mut }];
    var n = Math.round(C * 4) + 1;
    return [{ t: '●●●●●'.slice(0, n), c: K.g8, s: 17 }, { t: '●●●●●'.slice(n), c: 'D5DCD8', s: 17 }];
  }
  function sigSegs(r) {
    var s = r.signal;
    if (s === 'sig') return [{ t: ' 신호 ', b: true, c: hx(CAT.remain.ink), sh: hx(CAT.remain.tint), s: 16 }];
    if (s === 'shaky') return [{ t: ' 애매 ', b: true, c: K.amber, sh: K.amberSoft, s: 16 }];
    if (s === 'hold') return [{ t: '유보', c: K.mut }];
    if (s === 'none') return [{ t: '없음', c: K.mut }];
    return [{ t: '—', c: K.mut }];
  }
  function bandSeg(b, inv) {
    var L = inv ? { good: '신뢰할 만함', ok: '주의', low: '자신감 점검', na: '계산 보류' } : { good: '좋음', ok: '보통', low: '점검 필요', na: '계산 보류' };
    var F = { good: [K.ok, K.okSoft], ok: [K.amber, K.amberSoft], low: [K.red, 'FBECE5'], na: [K.mut, 'EEF1EF'] }[b || 'na'];
    return { t: ' ' + L[b || 'na'] + ' ', b: true, c: F[0], sh: F[1], s: 16 };
  }

  /* ══════════ 그림 굽기 ══════════ */
  function svgPng(svg, scale) {
    if (!svg) return Promise.resolve(null);
    var m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg); if (!m) return Promise.resolve(null);
    var w = Number(m[1]), h = Number(m[2]);
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
          var g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
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
  function pngDims(u8) { if (u8 && u8[0] === 0x89 && u8[1] === 0x50) return { w: ((u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19]) >>> 0, h: ((u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23]) >>> 0 }; return null; }
  function asPng(u8, w96) { if (!u8) return null; var d = pngDims(u8) || { w: 1200, h: 600 }; return { data: u8, w: w96 || d.w / 2, h: (w96 || d.w / 2) * d.h / d.w }; }

  async function makeCharts(A) {
    var C = SR.charts, M = A.metrics, out = {};
    var jobs = {
      journey: A.record.has ? C.journey(A) : null,
      scatter: A.hasSurvey && A.record.has ? C.scatter(A).svg : null,
      bias: M.bias != null ? C.bias(M.bias) : null,
      radar: C.radar(A),
      cycle: A.hasSurvey ? C.cycle(A.habits.subs) : null,
      timeline: (A.timeline || []).length ? C.timeline(A) : null,
      km: A.kmCompare && A.kmCompare.rows.length ? C.kmCompare(A.kmCompare) : null
    };
    for (var k in jobs) out[k] = await svgPng(jobs[k], 3);
    out.spark = {};
    for (var i = 0; i < (A.courses || []).length; i++) { var c = A.courses[i]; if (c.rounds.length) out.spark[c.course] = await svgPng(C.spark(c.rounds), 4); }
    return out;
  }

  /* ══════════ 불러오기 ══════════ */
  var _lib = null, _art = null;
  function loadScript(src) {
    return new Promise(function (res, rej) { var el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = function () { rej(new Error('load fail: ' + src)); }; document.head.appendChild(el); });
  }
  function ensureLib() { if (root.docx) return Promise.resolve(root.docx); if (!_lib) _lib = loadScript(LIB).then(function () { return root.docx; }); return _lib; }
  function fetchBin(u) { return fetch(u).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (b) { return b ? new Uint8Array(b) : null; }).catch(function () { return null; }); }
  function loadArt() {
    if (!_art) _art = Promise.all(['cover.jpg', 'frame.png', 'divider.png', 'logo-green.png', 'logo-white.png'].map(function (f) { return fetchBin(ART + f); }))
      .then(function (x) { return { cover: x[0], frame: x[1], divider: asPng(x[2], 300), logo: asPng(x[3], 120), logoW: asPng(x[4], 120) }; });
    return _art;
  }

  /* ══════════ 문장(학부모용 풀이) ══════════ */
  function meanRate(p) {
    if (p == null) return '화학1 시험 기록이 이어지면 채워집니다.';
    var ten = Math.round(p * 10);
    return '처음 보는 문장 10개 가운데 약 ' + ten + '개를 바로 맞혔다는 뜻입니다. ' + (p >= 0.85 ? '기본이 단단합니다.' : p >= 0.7 ? '대부분 알고 있고, 흔들리는 개념 몇 개만 다지면 됩니다.' : '다질 곳이 아직 여럿입니다 — 9절 처방부터 보세요.');
  }
  function meanRetake(R) {
    if (R.retakeRate == null) return '재시를 본 기록이 없어 계산하지 않았습니다.';
    var p = R.retakeRate;
    return '처음 틀린 개념 ' + R.retake.withData + '개 가운데 ' + R.retake.fixedNext + '개를 다음 재시에서 바로 고쳤습니다. ' + (p >= 0.8 ? '틀린 뒤 고치는 힘이 좋습니다.' : p >= 0.5 ? '절반 넘게 고쳤고, 나머지는 같은 자리에서 다시 걸린 것입니다.' : '다른 문장으로 다시 물으면 아직 흔들립니다 — 오개념 자체를 다룰 차례입니다.');
  }
  function meanAcc(M) {
    if (M.accuracy == null) return '자신감과 기록을 함께 볼 개념이 부족해 계산하지 않았습니다.';
    var a = M.accuracy;
    return '«자신 있다»는 느낌이 실제 기록과 얼마나 맞는지입니다. ' + (a >= 0.85 ? '자기 판단이 정확해 혼자 공부할 때 큰 힘이 됩니다.' : a >= 0.75 ? '대체로 맞고, 몇 개념에서 느낌과 기록이 어긋납니다.' : '느낌과 기록이 자주 어긋납니다 — «맞힐까?» 예측 후 확인하는 습관이 도움이 됩니다.');
  }
  function meanHce(M) {
    if (M.hce == null) return '«그렇다» 이상으로 자신 있다고 한 개념이 없어 계산하지 않았습니다.';
    return '자신 있다고 한 ' + M.hceN + '개 가운데 ' + M.hceWeak + '개가 실제로는 흔들렸다는 뜻입니다. ' + (M.hceBand === 'good' ? '자신감을 믿어도 됩니다.' : M.hceBand === 'ok' ? '대체로 믿을 만하지만 그 개념들은 한 번 확인해 두세요.' : '자신 있다는 느낌을 한 번 더 확인하는 습관이 필요합니다.');
  }
  function kpiList(A) {
    var R = A.record, M = A.metrics;
    var hceTxt = M.hce == null ? '자신 있다고 표시한 개념이 없거나 기록이 부족해 계산하지 않았습니다.' : '«그렇다» 이상으로 자신 있다고 한 ' + M.hceN + '개 가운데 기록이 흔들린 개념 ' + M.hceWeak + '개.';
    return [
      { t: '18주 첫 시도 정답률', easy: '처음 본 문장을 바로 맞힌 비율', v: R.rate, d: '처음 본 문장에서 바로 맞힌 비율 (' + (R.total.n ? R.total.ok + ' / ' + R.total.n : '기록 없음') + ')',
        b: R.rate == null ? 'na' : R.rate >= 0.85 ? 'good' : R.rate >= 0.7 ? 'ok' : 'low', mean: meanRate(R.rate) },
      { t: '재시 교정률', easy: '틀린 개념을 다음 재시에서 고친 비율', v: R.retakeRate, d: R.retake.withData ? '처음 틀린 개념을 다음 재시에서 다른 문장으로 바로잡은 비율 (' + R.retake.fixedNext + ' / ' + R.retake.withData + ')' : '재시 기록이 없어 계산하지 않았습니다.',
        b: R.retakeRate == null ? 'na' : R.retakeRate >= 0.8 ? 'good' : R.retakeRate >= 0.5 ? 'ok' : 'low', mean: meanRetake(R) },
      { t: '자기 판단 정확도', easy: '느낌과 실제 기록이 맞는 정도', v: M.accuracy, d: M.accuracy == null ? '자신감과 기록을 맞댈 개념이 부족합니다.' : '자신감과 기록의 평균 차이 ' + fx(M.mad) + ' → 1에서 뺀 값 (개념 ' + M.K + '개)',
        b: M.madBand || 'na', mean: meanAcc(M) },
      { t: '확신 오류 비율', easy: '자신 있다던 것 가운데 흔들린 몫', v: M.hce, d: hceTxt, b: M.hceBand || 'na', inv: true, mean: meanHce(M) }
    ];
  }
  function valSegs(v, size, color) {
    if (v == null) return [{ t: '—', s: size, b: true, c: K.mut }];
    return [{ t: String(Math.round(v * 100)), s: size, b: true, c: color || K.g8 }, { t: '%', s: Math.round(size * 0.5), b: true, c: color || K.g8 }];
  }

  /* ══════════ 한 학생의 Word 구역 ══════════ */
  function student(st, art, charts, idx, batch) {
    var A = st.A, R = A.record, M = A.metrics, nm = st.name || '학생', who = st.name ? st.name + ' 학생' : '이 학생';
    var counts = A.counts, totalRows = A.rows.length, bank = st.bank || {};
    var pre = 'sp' + idx + '_';
    var S = [];   // 절 목록 {id, fresh, head(brk), blocks | make(toc)}

    /* ── 표지 ── */
    S.push({ id: 'cover', cover: true, blocks: coverBlocks(st, A, art) });

    /* ── 한 장 요약(학부모용) ── */
    S.push({ id: 'sum', fresh: true, title: '한 장 요약 — 부모님이 먼저 보실 곳', toc: '숫자 넷 · 세 줄 요약 · 먼저 다질 곳',
      head: centerHead('FOR PARENTS · ONE-PAGE SUMMARY', '한 장 요약', '바쁘시면 이 한 장만 보셔도 됩니다. 숫자마다 <b>«그래서 무슨 뜻인지»</b>를 바로 옆에 적었습니다.', art, pre + 'sum'),
      blocks: summaryBlocks(A, who) });

    /* ── 목차 ── */
    var tocList = [['sum', '', '한 장 요약', '부모님이 먼저 보실 곳 — 숫자 넷과 세 줄 요약'], ['s0', '0', '이 보고서를 읽는 법', '여섯 갈래 · 자주 나오는 말 풀이'], ['s1', '1', '한눈에 보기', '숫자 넷 · 여섯 갈래 개수 · 세 줄 요약'],
      ['s2', '2', '18주 학습 여정', '회차별 첫 시도 · 재시 · 막힘과 해소'], ['s3', '3', '자기 판단과 실제 기록', '자신감 × 기록 · 치우침 · 구별력'], ['s4', '4', '단원별 진단', '여덟 단원 묶음의 기록과 자신감'],
      ['s5', '5', '개념별 진단표', '개념 40 · 직관 문장 20 전수 진단'], ['s6', '6', '남은 오개념 카드', '이런 생각 → 왜 → 실제로는 → 확인 문장'], ['s7', '7', '공부 습관과 마음', '계획 · 점검 · 성찰 · 효능감 · 부담'],
      ['s8', '8', '어려웠던 점과 처방', '느낀 어려움과 기록 · 맞춤 처방'], ['s9', '9', '다음 과정을 위한 처방', '우선순위 3 · 한 주 순서 · 숨은 실력'], ['s10', '10', '지금까지의 모든 시험', 'DT 전 과목 · 모의시험'],
      ['s11', '11', '영역·개념 누적 지도', '모든 시험을 단원 묶음으로'], ['s12', '12', '되풀이되는 오개념', '여러 시험에서 같은 자리'], ['s13', '13', '이전 KMChC 학습진단과 비교', '그때 → 지금'],
      ['sp', 'P', '부모님께', '과정을 짚는 말 · 함께 나눌 질문'], ['sa', 'A', '부록', '지표 정의 · 판정 구간 · 응답 품질 · 한계 · 참고문헌']];
    S.push({ id: 'toc', fresh: true, head: centerHead('CONTENTS', '목차', who + '의 18주 기록 · 설문 · 지금까지의 모든 시험을 열네 개의 절로 나눠 정리했습니다.', art, null),
      make: function (pages) { return tocBlocks(tocList, pages, pre); } });

    /* ── 0. 읽는 법 ── */
    S.push({ id: 's0', fresh: true, head: secHead('0', '이 보고서를 읽는 법', 'HOW TO READ', '설문 부분은 점수가 아니라 <b>스스로 느낀 것</b>입니다. 느낌과 실제 기록이 다를 때 그 차이가 가장 쓸모 있는 정보이며, 어느 쪽이 «틀렸다»는 뜻은 아닙니다.', pre + 's0'),
      blocks: readBlocks() });
    /* ── 1. 한눈에 ── */
    S.push({ id: 's1', fresh: true, head: secHead('1', '한눈에 보기', 'AT A GLANCE', who + '의 18주 기록과 설문을 네 개의 숫자와 여섯 갈래로 줄였습니다.', pre + 's1'), blocks: glanceBlocks(A, who) });
    S.push({ id: 's2', head: secHead('2', '18주 학습 여정', 'THE 18-WEEK JOURNEY', '매주 앞 내용까지 다시 묻는 누적 시험이었습니다. 진한 선은 회차마다 첫 시도 정답률, 점선은 그 가운데 <b>지난 단원 문항</b>의 정답률, 금색 막대는 재시 횟수입니다.', pre + 's2'), blocks: journeyBlocks(A, charts) });
    S.push({ id: 's3', head: secHead('3', '자기 판단과 실제 기록', 'CALIBRATION', '동그라미 하나가 개념 하나입니다(숫자는 설문 문항 번호). 가로는 설문에서 고른 자신감, 세로는 18주 첫 시도 정답률입니다. 점선 위에 있으면 느낌과 기록이 일치합니다.', pre + 's3'), blocks: calBlocks(A, charts) });
    S.push({ id: 's4', head: secHead('4', '단원별 진단', 'BY UNIT', '여덟 단원 묶음마다 기록(초록 면)과 자신감(금색 점선)을 같은 눈금에 겹쳤습니다. 두 선이 벌어진 곳이 느낌과 기록이 어긋난 단원입니다.', pre + 's4'), blocks: unitBlocks(A, charts) });
    S.push({ id: 's5', head: secHead('5', '개념별 진단표', 'CONCEPT BY CONCEPT', '설문의 개념 40개와 직관 문장 20개를 모두 진단했습니다. 고칠 차례(남은 오개념 → 과신 → 보강 → 숨은 실력 → 강점 → 관찰)로 늘어놓았습니다.', pre + 's5'), blocks: conceptBlocks(A) });
    S.push({ id: 's6', head: secHead('6', '남은 오개념 카드', 'MISCONCEPTION CARDS', '설문에서 공감한 직관 문장과 18주 기록이 같은 곳을 가리키는 개념입니다. «이런 생각이 들었죠 → 왜 그럴듯한가 → 실제로는 → 확인 문장» 차례로 읽고, 확인 문장의 O/X를 직접 판단해 보세요.', pre + 's6'), blocks: misBlocks(A, bank) });
    S.push({ id: 's7', head: secHead('7', '공부 습관과 마음', 'HABITS & MINDSET', '습관 문항을 자기조절 학습의 세 단계(계획 → 점검 → 성찰)로 묶고, 효능감·시험 부담·흥미를 실제 기록과 나란히 놓았습니다. 숫자는 «그 문장에 얼마나 동의했나»(1~5)입니다.', pre + 's7'), blocks: habitBlocks(A, charts) });
    S.push({ id: 's8', head: secHead('8', '어려웠던 점과 처방', 'DIFFICULTIES', '어려웠던 점 10문항을 동의한 정도 차례로 늘어놓고, 시험 기록으로 확인할 수 있는 것은 옆에 함께 적었습니다.', pre + 's8'), blocks: diffBlocks(A) });
    S.push({ id: 's9', head: secHead('9', '다음 과정을 위한 처방', 'NEXT STEPS', '화학1 심화·화학2를 시작하기 전에 다질 곳 세 개, 한 주의 공부 순서, 그리고 이미 내 것인 개념의 확정 목록입니다.', pre + 's9'), blocks: nextBlocks(A, bank) });
    S.push({ id: 's10', head: secHead('10', '지금까지의 모든 시험', 'EVERY TEST SO FAR', josa(who, '이', '가') + ' 지금까지 치른 시험을 한 줄로 모았습니다. DT의 모든 과목 회차와, 선생님 화면에서 이어 붙인 모의시험 기록입니다.', pre + 's10'), blocks: testBlocks(A, charts) });
    S.push({ id: 's11', head: secHead('11', '영역·개념 누적 지도', 'CUMULATIVE MAP', '모든 시험의 문항을 화학Ⅰ 단원 묶음 기준으로 다시 모았습니다. 칸의 색이 진할수록 단단하고, 붉을수록 다질 곳입니다.', pre + 's11'), blocks: mapBlocks(A) });
    S.push({ id: 's12', head: secHead('12', '되풀이되는 오개념', 'RECURRING MISCONCEPTIONS', '여러 시험·여러 해에 걸쳐 같은 자리에서 걸린 생각을 주제별로 묶었습니다. 출처가 여럿인 주제일수록 위에 놓았습니다.', pre + 's12'), blocks: recurBlocks(A) });
    S.push({ id: 's13', head: secHead('13', '이전 KMChC 학습진단과 비교', 'THEN AND NOW', '예전에 받은 「화학 정밀 학습진단」과 이번 설문에 같은 축이 있는 것끼리 «그때 → 지금»을 놓았습니다.', pre + 's13'), blocks: kmBlocks(A, charts) });
    S.push({ id: 'sp', head: secHead('P', '부모님께', 'FOR PARENTS', '이 보고서는 아이를 평가하는 문서가 아니라 다음 공부의 방향을 찾는 지도입니다. 아래 말들이 대화의 출발점이 되기를 바랍니다.', pre + 'sp'), blocks: parentBlocks(A, art) });
    S.push({ id: 'sa', head: secHead('A', '부록', 'APPENDIX', '판정 틀은 정오 × 확신의 결정표(Hasan 외, 1999)를 개념 단위로 옮긴 것이고, «지식 설문»의 자신감을 시험과 맞댄 일반화학 연구(Bell & Volckmann, 2011)에 가장 가깝습니다.', pre + 'sa'), blocks: appendixBlocks(A, art) });

    var plan = paginate(S);
    var els = emit(S, plan);
    return { els: els, plan: plan };
  }

  /* ══════════ 쪽 계획 ══════════ */
  function blocksOf(s, pages) { return s.blocks || s.make(pages || {}); }
  function firstChunk(b) { if (!b) return 0; if (b.kind === 'tbl' && !b.atomic) return b.hdr + (b.rows[b.hdrN] || 0); return b.h; }
  function chainH(all, i) { var tot = 0, j = i; while (all[j] && all[j].kn) { tot += all[j].h; j++; } return tot + firstChunk(all[j]); }
  function paginate(S) {
    var page = 0, used = 0, pages = {}, brk = {}, fill = [];
    function newPage() { if (page) fill[page] = used; page++; used = 0; }
    function place(all) {
      for (var i = 0; i < all.length; i++) {
        var b = all[i];
        if (b.kind === 'tbl' && !b.atomic && !b.kn) {
          for (var r = 0; r < b.rows.length; r++) {
            var h = b.rows[r];
            if (used + h > CAP && used > 0) { newPage(); if (r >= b.hdrN) used += b.hdr; }
            used += h;
          }
        } else {
          var need = b.kn ? chainH(all, i) : b.h;
          if (used + need > CAP && used > 0) newPage();
          used += b.h;
          if (used > CAP) { var over = used - CAP; newPage(); used = over; }
        }
      }
    }
    S.forEach(function (s) {
      if (s.cover) { newPage(); pages[s.id] = page; used = CAP; return; }
      var probe = s.head(false).concat(blocksOf(s, pages));
      var need = chainH(probe, 0);
      var fresh = s.fresh || used >= CAP * 0.5 || used + need > CAP;
      brk[s.id] = fresh;
      if (fresh) newPage();
      pages[s.id] = page;
      place(s.head(fresh).concat(blocksOf(s, pages)));
    });
    fill[page] = used;
    return { pages: pages, brk: brk, total: page, fill: fill.slice(1).map(function (u) { return Math.round(u / CAP * 100); }) };
  }
  function emit(S, plan) {
    var els = [];
    S.forEach(function (s) {
      var bl = s.cover ? s.blocks : s.head(plan.brk[s.id]).concat(blocksOf(s, plan.pages));
      bl.forEach(function (b) { els.push(b.el); });
    });
    return els;
  }

  /* ══════════ 표지 ══════════ */
  function coverBlocks(st, A, art) {
    var R = A.record, M = A.metrics, out = [];
    var white = 'FFFFFF';
    /* 띠 안(고정 높이 행) — 그림의 초록 띠 0~8400twip 에 맞춘다 */
    var band = [
      t([{ t: 'CHEMISTRY I   ·   18-WEEK REVIEW   ·   DIAGNOSTIC REPORT', c: K.goldLight, b: true }], { size: 16, sp: 40, before: 760 }),
      t([{ t: '화학1 18회 돌아보기', c: white, b: true }], { size: 64, line: 860, before: 420 }),
      t([{ t: '진단 보고서', c: white, b: true }], { size: 64, line: 860 }),
      t([{ t: '18주의 실제 기록  ×  하루의 설문  ×  지금까지의 모든 시험', c: 'E8D9B0', b: true }], { size: 25, line: 400, before: 260 }),
      t([{ t: '━━━━━━', c: K.gold2 }], { size: 20, line: 300, before: 160 }),
      t([{ t: '매주 치른 누적 O/X 시험의 행동 기록과 마지막 시간의 점수 없는 설문 100문항, 그리고 지금까지 본 시험을 개념마다 맞대어 무엇을 이미 알고 무엇을 다음에 다져야 하는지 정리했습니다. 이 보고서는 점수를 매기는 문서가 아니라 다음 공부의 지도입니다.', c: 'E4EEEA' }], { size: 20, line: 340, before: 200, indR: 2200 })
    ];
    out.push(TB([CW], [{ cells: [{ c: band, m: [0, 0, 0, 0] }], h: 6960 }]));
    out.push(SP(20));
    /* 이름 · 학교 */
    var yr = st.year ? String(st.year).replace(/학년$/, '') + '학년' : '—';
    out.push(TB([CW], [{ cells: [{ c: [t([{ t: st.name || '학생', c: K.g9, b: true, s: 60 }, { t: '   학생', c: K.ink2, b: true, s: 26 }], { size: 60, line: 820 })], m: [0, 0, 0, 0], va: 'BOTTOM' }], h: 1980 }]));
    out.push(SP(20));
    var meta = [['학교', st.school || '—'], ['학년', yr], ['설문 응답일', st.surveyDate ? ymd(st.surveyDate) || '—' : '—'], ['보고서 작성일', ymd(st.today || new Date())]];
    var top = BD(K.g8, 18, D.BorderStyle.SINGLE, 0), bot = BD(K.line, 6, D.BorderStyle.SINGLE, 0);
    out.push(TB(eq(4), [{ cells: meta.map(function (m, i) {
      return { c: [t([{ t: m[0], c: K.mut, b: true }], { size: 16, sp: 10, line: 260 }), t([{ t: m[1], c: K.ink, b: true }], { size: 22, line: 360 })],
        bd: { top: top, bottom: bot, left: i ? BD(K.line2, 4, D.BorderStyle.SINGLE, 0) : undefined }, m: [110, 120, 80, i ? 160 : 0] };
    }), h: 860 }]));
    out.push(SP(320));
    /* 핵심 숫자 셋 */
    var nums = [];
    if (R.rate != null) nums.push({ v: valSegs(R.rate, 50), t: '18주 첫 시도 정답률', d: R.total.ok + ' / ' + R.total.n + '문항을 처음 보자마자 맞혔습니다' });
    if (R.retakeRate != null) nums.push({ v: valSegs(R.retakeRate, 50), t: '재시 교정률', d: '틀린 개념을 다음 재시에서 바로잡은 비율' });
    if (M.accuracy != null) nums.push({ v: valSegs(M.accuracy, 50), t: '자기 판단 정확도', d: '«자신 있다»는 느낌과 기록이 맞는 정도' });
    var nR = R.rounds.filter(function (r) { return r.rate != null; }).length, other = (A.timeline || []).filter(function (x) { return x.course !== 'ch1'; }).length;
    if (nums.length < 3 && nR) nums.push({ v: [{ t: String(nR), s: 50, b: true, c: K.g8 }, { t: '회', s: 25, b: true, c: K.g8 }], t: '화학1 첫 시도 기록', d: '회차마다 처음 본 시험을 개념별로 셌습니다' });
    if (nums.length < 3 && A.hasSurvey) nums.push({ v: [{ t: '100', s: 50, b: true, c: K.g8 }, { t: '문항', s: 25, b: true, c: K.g8 }], t: '마무리 설문 응답', d: '개념 자신감 40 · 직관 20 · 습관과 마음 40' });
    if (nums.length < 3) nums.push({ v: [{ t: String(totalRowsOf(A)), s: 50, b: true, c: K.g8 }, { t: '개', s: 25, b: true, c: K.g8 }], t: '개념을 여섯 갈래로 진단', d: '느낌(자신감·직관) × 기록' });
    if (nums.length < 3) nums.push({ v: [{ t: String(other), s: 50, b: true, c: K.g8 }, { t: '번', s: 25, b: true, c: K.g8 }], t: '그 밖의 시험', d: '다른 과목 · 모의시험' });
    nums = nums.slice(0, 3);
    out.push(TB(eq(3), [{ cells: nums.map(function (n, i) {
      return { c: [t(n.v, { size: 50, line: 700 }), t([{ t: n.t, c: K.g9, b: true }], { size: 19, line: 300, before: 20 }), t([{ t: n.d, c: K.ink2 }], { size: 16, line: 250, before: 30 })],
        fill: K.g0, bd: { top: BD(K.gold, 18, D.BorderStyle.SINGLE, 0), left: i ? BD(K.white, 36, D.BorderStyle.SINGLE, 0) : undefined, right: i < 2 ? BD(K.white, 36, D.BorderStyle.SINGLE, 0) : undefined }, m: [150, 200, 120, 220] };
    }), h: 1980 }]));
    out.push(SP(260));
    /* 바닥 — 로고 · 상호 */
    var logo = art.logo;
    out.push(TB([2400, CW - 2400], [{ cells: [
      { c: logo ? [im(logo, 116, { align: 'LEFT' })] : [], m: [200, 0, 0, 0], va: 'CENTER', bd: { top: BD(K.line, 6, D.BorderStyle.SINGLE, 0) } },
      { c: [t([{ t: BRAND, c: K.g8, b: true }], { size: 28, line: 420, align: 'RIGHT', sp: 10 }),
        t([{ t: '학생·부모 상담용  ·  이 문서는 점수나 순위를 매기지 않습니다', c: K.mut }], { size: 16, line: 260, align: 'RIGHT', before: 40 })], m: [220, 0, 0, 0], va: 'CENTER', bd: { top: BD(K.line, 6, D.BorderStyle.SINGLE, 0) } }], h: 1240 }]));
    return out;
  }
  function totalRowsOf(A) { return A.rows.length; }

  /* ══════════ 한 장 요약 ══════════ */
  function summaryBlocks(A, who) {
    var out = [], R = A.record, M = A.metrics, ks = kpiList(A);
    var lab = [2700, 1700, CW - 4400];
    var rows = [{ hdr: true, cells: [
      { c: [t([{ t: '무엇을 쟀나', c: K.white, b: true }], { size: 17 })], fill: K.g8 },
      { c: [t([{ t: '숫자', c: K.white, b: true }], { size: 17, align: 'CENTER' })], fill: K.g8 },
      { c: [t([{ t: '그래서 무슨 뜻인가', c: K.white, b: true }], { size: 17 })], fill: K.g8 }] }];
    ks.forEach(function (k, i) {
      rows.push({ cells: [
        { c: [t([{ t: k.t, c: K.g9, b: true }], { size: 19 }), t([{ t: k.easy, c: K.mut }], { size: 16 })], fill: i % 2 ? K.white : K.g0, va: 'CENTER', bd: { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) } },
        { c: [t(valSegs(k.v, 36), { size: 36, line: 500, align: 'CENTER' }), t([bandSeg(k.b, k.inv)], { size: 15, line: 240, align: 'CENTER' })], fill: i % 2 ? K.white : K.g0, va: 'CENTER', bd: { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) } },
        { c: [t([{ t: k.mean, c: K.ink }], { size: 18, line: 290 })], fill: i % 2 ? K.white : K.g0, va: 'CENTER', bd: { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) } }] });
    });
    /* 여섯 갈래 한 줄 */
    var catSegs = []; CAT_ORDER.forEach(function (k, i) { var c = catC(k); if (i) catSegs.push({ t: '  ' }); catSegs.push({ t: c.name + ' ', c: c.ink, b: true }); catSegs.push({ t: String(A.counts[k]), c: c.ink, b: true, s: 22 }); });
    var fixN = A.counts.remain + A.counts.over + A.counts.reinforce;
    rows.push({ cells: [
      { c: [t([{ t: '개념 ' + A.rows.length + '개 진단', c: K.g9, b: true }], { size: 19 }), t([{ t: '느낌 × 기록 여섯 갈래', c: K.mut }], { size: 16 })], fill: K.g0, va: 'CENTER' },
      { span: 2, c: [t(catSegs, { size: 18, line: 330 }), t([{ t: A.hasRecord ? '그래서 → 먼저 다질 곳 ' + fixN + '개, 이미 단단한 곳(강점) ' + A.counts.strong + '개, 생각보다 잘 아는 곳(숨은 실력) ' + A.counts.hidden + '개입니다.' : '기록이 이어지지 않아 갈래는 대부분 «관찰»로 두었습니다.', c: K.ink }], { size: 18, line: 290, before: 40 })], fill: K.g0, va: 'CENTER' }] });
    out.push(TB(lab, rows, { m: [90, 130, 90, 130] }));
    out.push(SP(200));
    /* 세 줄 요약 */
    out.push(threeBox(A, who));
    out.push(SP(160));
    /* 먼저 다질 곳 · 이미 아는 것 */
    var pri = A.priorities.slice(0, 3), hid = A.hidden.slice(0, 5);
    var left = [t([{ t: '먼저 다질 개념', c: K.red, b: true }], { size: 19, after: 60 })];
    if (pri.length) pri.forEach(function (r, i) { left.push(t([{ t: (i + 1) + '  ', c: K.gold, b: true }, { t: short(labelOf(r), 22), b: true }, { t: '  ' }, chipSeg(r.verdict), { t: '  ' + pct(r.rec.p), c: K.mut, s: 16 }], { size: 18, line: 330 })); });
    else left.push(t([{ t: '지금 급히 다질 개념이 없습니다. 다음 과정에서는 가끔 꺼내 보는 «유지»면 충분합니다.', c: K.ink2 }], { size: 18 }));
    var right = [t([{ t: '이미 내 것 — 확정해 둘 개념', c: K.blue, b: true }], { size: 19, after: 60 })];
    if (hid.length) hid.forEach(function (r) { right.push(t([{ t: '✓  ', c: K.blue, b: true }, { t: short(labelOf(r), 24), b: true }, { t: '  ' + pct(r.rec.p), c: K.mut, s: 16 }], { size: 18, line: 330 })); });
    else { var st2 = A.sorted.filter(function (r) { return r.verdict === 'strong'; }).slice(0, 4); if (st2.length) { right[0] = t([{ t: '이미 단단한 개념(강점)', c: K.ok, b: true }], { size: 19, after: 60 }); st2.forEach(function (r) { right.push(t([{ t: '✓  ', c: K.ok, b: true }, { t: short(labelOf(r), 24), b: true }, { t: '  ' + pct(r.rec.p), c: K.mut, s: 16 }], { size: 18, line: 330 })); }); } else right.push(t([{ t: '기록이 이어지면 채워집니다.', c: K.ink2 }], { size: 18 })); }
    out.push(TB([CW / 2 - 60, 120, CW / 2 - 60], [{ cells: [CARD(left, { top: K.red, fill: K.redSoft, border: 'F1DDD3' }), { c: [] }, CARD(right, { top: K.blue, fill: K.blueSoft, border: 'D3E1EE' })] }], { atomic: true }));
    out.push(SP(160));
    var q = WD.questions(A)[0];
    out.push(NOTE('<b>부모님이 해 주실 한 가지</b> — ' + (A.remain.length || A.counts.over ? '높은 자신감으로 틀린 개념은 혼낼 일이 아니라 정확한 설명이 가장 잘 듣는 지점입니다. ' : '') + '«' + q + '» 하고 물어봐 주세요. 자세한 말은 «부모님께» 절에 있습니다.', { color: K.g8, fill: K.g0 }));
    return out;
  }
  function threeBox(A, who) {
    var S3 = WD.summaryLines(A, who);
    var rows = [{ cells: [{ span: 2, c: [t([{ t: '세 줄 요약', c: K.white, b: true }], { size: 20, sp: 20 })], fill: K.g8, m: [80, 160, 80, 180] }] }];
    [['잘한 점', S3.good, K.ok], ['다음 우선순위', S3.next, K.red], ['습관 제안', S3.habit, K.goldInk]].forEach(function (x, i) {
      rows.push({ cells: [
        { c: [t([{ t: x[0], c: x[2], b: true }], { size: 19 })], m: [110, 100, 110, 180], bd: { bottom: i < 2 ? BD(K.line2, 4, D.BorderStyle.SINGLE, 0) : undefined } },
        { c: [t(x[1], { size: 19, line: 300 })], m: [110, 160, 110, 100], bd: { bottom: i < 2 ? BD(K.line2, 4, D.BorderStyle.SINGLE, 0) : undefined } }] });
    });
    var b = BD(K.g8, 12, D.BorderStyle.SINGLE, 0);
    rows.forEach(function (r) { r.cells.forEach(function (c, ci) { c.bd = c.bd || {}; c.bd.left = ci === 0 ? b : c.bd.left; if (ci === r.cells.length - 1) c.bd.right = b; }); });
    rows[rows.length - 1].cells.forEach(function (c) { c.bd.bottom = b; });
    return TB([1900, CW - 1900], rows, { atomic: true });
  }

  /* ══════════ 목차 ══════════ */
  function tocBlocks(list, pages, pre) {
    var rows = list.map(function (x) {
      var pg = pages[x[0]] || '';
      var field = null;
      if (pg) { field = new D.SimpleField(' PAGEREF ' + pre + x[0] + ' \\h ', undefined); field.root.push(new D.TextRun({ text: String(pg), bold: true, color: K.g8, size: 24, font: FONT })); }
      var dot = BD('CFCABD', 4, D.BorderStyle.DOTTED, 0);
      return { cells: [
        { c: [t([{ t: x[1] || '◆', c: K.gold, b: true }], { size: x[1] ? 30 : 20, line: 440 })], va: 'CENTER', bd: { bottom: dot }, m: [100, 60, 100, 60] },
        { c: [t([{ t: x[2], c: K.g9, b: true }], { size: 22, line: 340 }), t([{ t: x[3], c: K.mut }], { size: 16, line: 250 })], va: 'CENTER', bd: { bottom: dot }, m: [100, 100, 100, 100] },
        { c: [t(field ? [{ field: field }] : [{ t: '' }], { size: 24, align: 'RIGHT' })], va: 'CENTER', bd: { bottom: dot }, m: [100, 60, 100, 60] }] };
    });
    var out = [TB([900, CW - 1900, 1000], rows, { m: [100, 80, 100, 80] })];
    out.push(SP(200));
    out.push(CAPT('쪽 번호는 Word 에서 열면 자동으로 맞춰집니다(인쇄 전 F9). 이 보고서의 모든 숫자는 화면 보고서(인쇄판)와 같은 계산에서 나왔습니다.', { before: 0 }));
    return out;
  }

  /* ══════════ 0. 읽는 법 ══════════ */
  function readBlocks() {
    var out = [];
    var three = [['기록은 18주의 행동', '매주 60문항, 첫 시도에서 맞힌 것과 재시에서 다른 문장으로 고친 것을 개념마다 셌습니다. 둘이 충돌하면 기록에 더 큰 무게를 둡니다.'],
      ['설문은 하루의 느낌', '개념 자신감 40 · 직관 문장 20 · 습관과 마음 40문항. 정답이 없는 문항이라 솔직하게 답했을 때 가장 정확한 지도가 됩니다.'],
      ['판정은 «아직»의 말', '여섯 갈래는 고정된 꼬리표가 아니라 지금의 위치입니다. 다음 시험 한 번으로도 바뀔 수 있고, 바뀌라고 만든 표시입니다.']];
    var w3 = [Math.floor((CW - 240) / 3), 120, Math.floor((CW - 240) / 3), 120, CW - 240 - 2 * Math.floor((CW - 240) / 3)];
    var cells = [];
    three.forEach(function (x, i) { if (i) cells.push({ c: [] }); cells.push(CARD([t([{ t: x[0], c: K.g9, b: true }], { size: 21, after: 60 }), t(x[1], { size: 18, line: 290, c: K.ink2 })], { fill: K.g0, top: K.g8, border: K.g2 })); });
    out.push(TB(w3, [{ cells: cells }], { atomic: true }));
    out.push(H3('여섯 갈래 — 느낌(자신감·직관) × 기록'));
    var cat = [], wc = [Math.floor((CW - 240) / 3), 120, Math.floor((CW - 240) / 3), 120, CW - 240 - 2 * Math.floor((CW - 240) / 3)];
    [CAT_ORDER.slice(0, 3), CAT_ORDER.slice(3)].forEach(function (grp, gi) {
      var cs = [];
      grp.forEach(function (k, i) {
        var c = catC(k);
        if (i) cs.push({ c: [] });
        cs.push({ c: [t([{ t: c.name, c: c.ink, b: true }], { size: 21, after: 30 }), t(c.desc, { size: 18, line: 280 }), t([{ t: '→ ' + c.act, c: K.ink2 }], { size: 17, line: 270, before: 40 })],
          fill: c.tint, bd: { left: BD(c.color, 30, D.BorderStyle.SINGLE, 0) }, m: [120, 150, 120, 170] });
      });
      cat.push({ cells: cs });
      if (gi === 0) cat.push({ cells: [{ span: 5, c: [] }], h: 120 });
    });
    out.push(TB(wc, cat, { atomic: true }));
    out.push(CAPT('순서는 고칠 차례입니다: 남은 오개념 → 과신 → 보강 필요 → 숨은 실력 → 강점. 「잠정」은 그 개념을 물은 문항이 8개보다 적어 판단이 흔들릴 수 있다는 표시입니다.'));
    /* 결정표 */
    out.push(H3('판정의 뼈대 — 확신 × 정오 결정표', { sub: 'Hasan 외(1999)의 결정표를 개념 단위로' }));
    var hdr = function (x) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 18, align: 'CENTER' })], fill: K.g8, va: 'CENTER' }; };
    var cellC = function (k, extra) { var c = catC(k); return { c: [t([{ t: c.name, c: c.ink, b: true }], { size: 20, align: 'CENTER' }), t([{ t: extra, c: K.ink2 }], { size: 16, align: 'CENTER', line: 250 })], fill: c.tint, va: 'CENTER', bd: { bottom: BD(K.white, 24, D.BorderStyle.SINGLE, 0), right: BD(K.white, 24, D.BorderStyle.SINGLE, 0) } }; };
    out.push(TB([2300, (CW - 2300) / 2, (CW - 2300) / 2], [
      { cells: [{ c: [], fill: K.g9 }, hdr('느낌: 자신 있음'), hdr('느낌: 자신 없음 · 보통')] },
      { cells: [{ c: [t([{ t: '기록 강함', c: K.g9, b: true }], { size: 19 }), t([{ t: '첫 시도 85% 이상', c: K.mut }], { size: 16 })], fill: K.g0, va: 'CENTER' }, cellC('strong', '유지용 간격 복습만'), cellC('hidden', '«이건 아는 것» 확정')] },
      { cells: [{ c: [t([{ t: '기록 약함', c: K.g9, b: true }], { size: 19 }), t([{ t: '첫 시도 70% 미만 · 반복 막힘', c: K.mut }], { size: 16 })], fill: K.g0, va: 'CENTER' }, cellC('over', '읽기 말고 맞혀 보기'), cellC('reinforce', '기초 다시 · 간격 두고 꺼내기')] }
    ], { atomic: true, m: [110, 120, 110, 120] }));
    out.push(CAPT('직관 문장(오개념 문장)에 공감했고 기록도 약하면 «남은 오개념», 공감했지만 기록이 좋으면 «잠복 직관»(관찰)입니다. 기록이 중간(70~85%)이거나 물은 문항이 3개 미만이면 «관찰»로 두고 다음 시험에서 확인합니다.'));
    /* 말 풀이 */
    out.push(H3('이 보고서에 자주 나오는 말'));
    var gl = [['첫 시도 정답률', '그 회차에서 처음 본 문장을 바로 맞힌 비율. 재시에서 맞힌 것은 넣지 않습니다.'],
      ['재시 교정률', '처음 틀린 개념을 다음 재시에서 «다른 문장으로» 다시 물었을 때 바로잡은 비율. 문장을 외운 것이 아니라 개념을 고쳤다는 증거입니다.'],
      ['앎 지수', 'O/X는 찍어도 반은 맞으므로, 정답률에서 찍은 몫을 뺀 값(2 × 정답률 − 1). 50% → 0, 100% → 1.'],
      ['자신감', '설문에서 고른 «매우 그렇다 ~ 전혀 아니다»를 0~1로 옮긴 값. 높을수록 자신 있다고 느낀 것입니다.'],
      ['직관 신호', '틀린 생각을 담은 문장에 «그렇다»고 공감한 것. 단일 문항이라 «진단»이 아니라 «신호»라고 부릅니다.'],
      ['반복 막힘 · 해소', '3회차 이상 묻고 절반 이상 틀린 개념. 그 뒤로 계속 맞히면 «막힘 해소»입니다.']];
    out.push(TB([2300, CW - 2300], gl.map(function (g, i) { return { cells: [
      { c: [t([{ t: g[0], c: K.g8, b: true }], { size: 19 })], fill: i % 2 ? K.white : K.g0, bd: { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) } },
      { c: [t(g[1], { size: 18, line: 290 })], fill: i % 2 ? K.white : K.g0, bd: { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) } }] }; }), { m: [90, 140, 90, 140] }));
    return out;
  }

  /* ══════════ 1. 한눈에 ══════════ */
  function glanceBlocks(A, who) {
    var out = [], R = A.record, M = A.metrics, counts = A.counts;
    if (A.quality.flags.length) out.push(NOTE('<b>응답 품질 점검</b> — ' + WD.qualityText(A.quality) + ' 자세한 결과는 부록에 있습니다.', { color: K.red, fill: K.redSoft }), SP(120));
    if (!A.hasRecord) out.push(NOTE('<b>화학1 시험 기록이 이 링크와 아직 이어지지 않았습니다.</b> 기록 숫자는 비워 두고, 설문에서 드러난 느낌과 습관을 중심으로 정리했습니다. 기록이 이어지면 같은 링크에서 다시 만들 수 있습니다.'), SP(120));
    if (!A.hasSurvey) out.push(NOTE('<b>설문 응답이 아직 없습니다.</b> 18주 기록만으로 정리했고, 자신감과 직관을 맞대는 부분은 비워 두었습니다.'), SP(120));
    var ks = kpiList(A), gw = 110, tw = Math.floor((CW - 3 * gw) / 4), cols = [tw, gw, tw, gw, tw, gw, CW - 3 * tw - 3 * gw];
    var cells = [];
    ks.forEach(function (k, i) {
      if (i) cells.push({ c: [] });
      cells.push({ c: [
        t([{ t: k.t, c: K.g9, b: true }], { size: 18, line: 280 }),
        t([{ t: k.easy, c: K.mut }], { size: 15, line: 240 }),
        t(valSegs(k.v, 52), { size: 52, line: 740, before: 40 }),
        t([bandSeg(k.b, k.inv)], { size: 15, line: 260, after: 60 }),
        t([{ t: k.d, c: K.ink2 }], { size: 15, line: 235, after: 80 }),
        t([{ t: '그래서 ', c: K.goldInk, b: true }, { t: k.mean, c: K.ink }], { size: 16, line: 250 })],
        fill: K.g0, bd: { top: BD(K.g8, 30, D.BorderStyle.SINGLE, 0), bottom: BD(K.g2, 6, D.BorderStyle.SINGLE, 0) }, m: [130, 130, 140, 150] });
    });
    out.push(TB(cols, [{ cells: cells }], { atomic: true }));
    out.push(H3('여섯 갈래 개수 — 개념 ' + A.rows.length + '개'));
    out.push(stackBar(counts, CW, 300));
    out.push(SP(90));
    var cw6 = eq(6, CW);
    out.push(TB(cw6, [{ cells: CAT_ORDER.map(function (k) {
      var c = catC(k);
      return { c: [t([{ t: String(counts[k]), c: c.ink, b: true }], { size: 40, line: 560 }), t([{ t: c.name, c: c.ink, b: true }], { size: 18, line: 280 }), t([{ t: c.desc, c: K.ink2 }], { size: 15, line: 235, before: 30 })],
        fill: c.tint, bd: { top: BD(c.color, 24, D.BorderStyle.SINGLE, 0), right: BD(K.white, 30, D.BorderStyle.SINGLE, 0) }, m: [100, 110, 110, 130] };
    }) }], { atomic: true }));
    out.push(SP(200));
    out.push(threeBox(A, who));
    if (A.hasRecord) {
      out.push(H3('갈래마다 먼저 볼 개념'));
      var cs = [];
      ['remain', 'over', 'reinforce', 'hidden'].forEach(function (k, i) {
        var c = catC(k), rs = A.sorted.filter(function (r) { return r.verdict === k; }).slice(0, 3);
        if (i) cs.push({ c: [] });
        var items = [t([{ t: c.name + ' ' + counts[k], c: c.ink, b: true }], { size: 19, after: 40 })];
        if (rs.length) rs.forEach(function (r) { items.push(t([{ t: '· ' + short(labelOf(r), 15) + ' ' }, { t: pct(r.rec.p), c: K.mut }], { size: 17, line: 270 })); });
        else items.push(t([{ t: '해당 개념이 없습니다', c: K.mut }], { size: 17 }));
        cs.push(CARD(items, { top: c.color }));
      });
      out.push(TB(cols, [{ cells: cs }], { atomic: true }));
    }
    out.push(CAPT('자기 판단 정확도와 확신 오류 비율은 O/X의 «찍어도 50%»를 보정한 앎 지수(2×정답률 − 1)로 계산했습니다. 구간(좋음·보통·점검 필요)은 문헌이 정한 표준이 아니라 이 보고서가 쓰는 제안값입니다 — 부록 B.', { before: 120 }));
    return out;
  }
  function stackBar(counts, w, h) {
    var tot = sum(CAT_ORDER.map(function (k) { return counts[k] || 0; })) || 1, ks = CAT_ORDER.filter(function (k) { return counts[k]; });
    if (!ks.length) return SP(h);
    var ws = ks.map(function (k) { return Math.max(120, Math.round(counts[k] / tot * w)); }), diff = w - sum(ws);
    var big = ws.indexOf(Math.max.apply(null, ws)); ws[big] += diff;
    return TB(ws, [{ cells: ks.map(function (k) { return { c: [], fill: catC(k).color, m: [0, 0, 0, 0] }; }), h: h }]);
  }

  /* ══════════ 2. 여정 ══════════ */
  function journeyBlocks(A, charts) {
    var out = [], R = A.record;
    if (!R.has) { out.push(EMPTY('화학1 시험 기록이 없습니다.', '이 절은 18주 기록이 이어지면 채워집니다.')); return out; }
    out.push(IMG(charts.journey, 640, { alt: '18주 첫 시도 정답률과 재시 횟수', after: 40 }));
    out.push(CAPT('아래 띠는 그 회차에 새로 배운 단원입니다. 맨 위 ◆는 여러 번 막혔던 개념이 그 회차부터 계속 맞기 시작한 자리(막힘 해소)입니다. 금색 점선은 회차 통과 기준 80%입니다.', { before: 0 }));
    var rr = R.rounds.filter(function (r) { return r.rate != null; });
    var best = rr.slice().sort(function (a, b) { return b.rate - a.rate || a.round - b.round; })[0];
    var h1 = rr.filter(function (r) { return r.round <= 9; }), h2 = rr.filter(function (r) { return r.round >= 10; });
    var av = function (a) { return a.length ? a.reduce(function (s, r) { return s + r.rate; }, 0) / a.length : null; };
    var minis = [['가장 높았던 회차', best ? best.round + '회 · ' + pct(best.rate) : '—'], ['전반(1~9회) 평균', pct(av(h1))], ['후반(10~18회) 평균', pct(av(h2))], ['지난 단원 문항', pct(R.reviewRate) + (R.review.n ? ' (' + R.review.n + '문항)' : '')]];
    var gw = 110, tw = Math.floor((CW - 3 * gw) / 4), cols = [tw, gw, tw, gw, tw, gw, CW - 3 * tw - 3 * gw], cs = [];
    minis.forEach(function (m, i) { if (i) cs.push({ c: [] }); cs.push(CARD([t([{ t: m[0], c: K.mut, b: true }], { size: 16, align: 'CENTER' }), t([{ t: m[1], c: K.g8, b: true }], { size: 26, line: 400, align: 'CENTER' })], { fill: K.g0, border: K.g2 })); });
    out.push(TB(cols, [{ cells: cs }], { atomic: true }));
    var res = R.chronic.filter(function (c) { return c.resolvedAt; }), open = R.chronic.filter(function (c) { return !c.resolvedAt; });
    out.push(H3('여러 번 막혔던 개념과 해소'));
    if (!R.chronic.length) out.push(NOTE('세 회차 이상 묻고 절반 이상 틀린 «반복 막힘» 개념이 없습니다. 막힌 곳이 생겨도 오래 끌지 않았다는 뜻입니다.', { color: K.g8, fill: K.g0 }));
    else {
      var L = [t([{ t: '해소한 개념 ' + res.length + '개', c: K.ok, b: true }], { size: 19, after: 50 })].concat(res.length ? res.slice(0, 10).map(function (c) { return t([{ t: '◆ ', c: K.gold }, { t: c.m, b: true }, { t: ' — ' + c.resolvedAt + '회부터 계속 맞힘', c: K.mut }], { size: 17, line: 270 }); }) : [t([{ t: '아직 없습니다.', c: K.mut }], { size: 17 })]);
      var Rr = [t([{ t: '아직 진행 중 ' + open.length + '개', c: K.amber, b: true }], { size: 19, after: 50 })].concat(open.length ? open.slice(0, 10).map(function (c) { return t([{ t: '· ', c: K.gold }, { t: c.m, b: true }, { t: ' — ' + c.asked + '회 중 ' + c.wrong + '회 막힘', c: K.mut }], { size: 17, line: 270 }); }) : [t([{ t: '모두 해소했습니다.', c: K.mut }], { size: 17 })]);
      out.push(TB([CW / 2 - 60, 120, CW / 2 - 60], [{ cells: [CARD(L, { fill: K.okSoft, top: K.ok, border: 'CFE5D8' }), { c: [] }, CARD(Rr, { fill: K.goldSoft, top: K.gold, border: K.goldLine })] }], { atomic: true }));
    }
    out.push(SP(160));
    var trend = av(h2) != null && av(h1) != null ? av(h2) - av(h1) : null;
    out.push(NOTE('<b>해석</b> — 18주 동안 매주 앞 내용까지 다시 확인하는 방식으로 공부했습니다. 이것은 기억 연구에서 효과가 가장 큰 것으로 알려진 <b>«시험으로 공부하기»와 «간격 두고 다시 꺼내기»</b>를 꾸준히 실천한 것입니다(Roediger & Karpicke, 2006; Rawson & Dunlosky, 2011). ' +
      (trend == null ? '' : trend >= 0.03 ? '뒤로 갈수록 단원이 어려워졌는데도 후반 평균이 ' + Math.round(trend * 100) + '%p 높습니다. ' : trend <= -0.03 ? '후반에는 평형·산염기처럼 여러 조건을 함께 따지는 단원이 이어지면서 평균이 ' + Math.round(-trend * 100) + '%p 내려갔습니다. 어려워진 단원에서 흔한 모습이며, 4절의 단원별 진단에서 어디서 내려갔는지 볼 수 있습니다. ' : '앞뒤 평균이 고르게 유지되어, 단원이 어려워져도 흔들리지 않았습니다. ') +
      (open.length ? '반복해서 막힌 개념은 «여러 번 다시 풀기»만으로는 잘 풀리지 않는 유형입니다. 문장을 바꿔도 같은 곳에서 틀린다면 그 밑의 생각 자체를 다뤄야 합니다 — 6절과 9절에 정리했습니다.' : '')));
    return out;
  }

  /* ══════════ 3. 자기 판단 ══════════ */
  function calBlocks(A, charts) {
    var out = [], M = A.metrics;
    if (!(A.hasSurvey && A.record.has)) { out.push(EMPTY((A.hasSurvey ? '시험 기록' : '설문 응답') + '이 없어 맞댈 수 없습니다.', '자신감과 기록이 둘 다 있어야 그릴 수 있는 그림입니다.')); return out; }
    var lw = 5000, rw = CW - lw - 160;
    var nPts = A.rows.filter(function (r) { return r.type === 'concept' && r.C != null && r.rec.n >= SA.TH.minN; }).length;
    var left = [im(charts.scatter, 326, { alt: '개념별 자신감과 기록' }), t([{ t: '색은 5절 진단표의 갈래와 같습니다. 바탕 색 구역은 대략적인 위치이며, 실제 갈래는 학생 자신의 응답 습관(평소 자신감 수준)과 재시·유지 기록까지 함께 보고 정했습니다. 기록이 3문항 미만인 개념(' + (40 - nPts) + '개)은 빠졌습니다.', c: K.mut }], { size: 16, line: 250, before: 60 })];
    var card = function (title, easy, body) { return [t([{ t: title, c: K.g9, b: true }], { size: 19, line: 290 }), t([{ t: easy, c: K.goldInk }], { size: 15, line: 240, after: 50 })].concat(body); };
    var right = [];
    right.push(CARD(card('치우침', '평균적으로 높여 봤나, 낮춰 봤나', [im(charts.bias, 236, { alt: '자신감 치우침' }), t({ html: WD.biasText(M) }, { size: 17, line: 270, before: 40 })]), { fill: K.white }));
    right.push({ c: [], h: 120 });
    right.push(CARD(card('구별력', '아는 것과 모르는 것을 가려내는 힘', [t({ html: WD.gammaText(M) }, { size: 17, line: 270 })]), {}));
    right.push({ c: [], h: 120 });
    right.push(CARD(card('확신 오류', '자신 있다던 것 가운데 흔들린 몫', [t({ html: WD.hceText(M) }, { size: 17, line: 270 })]), {}));
    /* 오른쪽 칸을 세 카드로 — 칸 안 표 대신 행 셋 */
    var rows = [
      { cells: [{ c: left, m: [0, 80, 0, 0] }, { c: [] }, right[0]] }
    ];
    out.push(TB([lw, 160, rw], rows, { atomic: true }));
    out.push(SP(120));
    out.push(TB([CW / 2 - 60, 120, CW / 2 - 60], [{ cells: [right[2], { c: [] }, right[4]] }], { atomic: true }));
    out.push(SP(160));
    out.push(NOTE('<b>왜 이것이 중요한가</b> — «다시 보니 술술 읽힌다»는 익숙한 느낌은 «안다»는 착각을 가장 쉽게 만듭니다. 반복해서 읽으면 자신감은 오르지만 오래 남는 것은 시험으로 꺼내 본 쪽이었습니다(Bjork 외, 2013). ' +
      '확신하며 틀린 내용은 정확한 설명을 한 번 제대로 들으면 오히려 가장 잘 고쳐지고(Butterfield & Metcalfe, 2001), 자신 없이 맞힌 내용은 «맞았다»는 확인을 받을 때 오래 남습니다(Butler 외, 2008). 그래서 과신은 다음 공부의 첫 번째 우선순위, 숨은 실력은 확정해 둘 목록이 됩니다.'));
    out.push(CAPT('설문은 18주 결과를 받은 뒤에 했으므로, 자신감에는 «기억하는 내 기록»이 섞여 있습니다. 높은 일치는 순수한 예측력이라기보다 «내 기록을 얼마나 정확히 받아들였는가»로 읽는 것이 정확합니다.', { before: 120 }));
    return out;
  }

  /* ══════════ 4. 단원별 ══════════ */
  function unitBlocks(A, charts) {
    var out = [];
    out.push(IMG(charts.radar, 520, { alt: '단원별 기록과 자신감', after: 0 }));
    out.push(P([{ t: '━ 기록(앎 지수 × 100)', c: K.g8, b: true }, { t: '      ' }, { t: '┅ 자신감 × 100', c: K.goldInk, b: true }, { t: '   · 두 값 모두 0~100 같은 눈금입니다.', c: K.mut }], { size: 17, align: 'CENTER', after: 160 }));
    var cols = [2300, 800, 1000, 1000, 1000, 1000, CW - 7100];
    var hd = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 17, align: al })], fill: K.g8 }; };
    var rows = [{ hdr: true, cells: [hd('단원'), hd('문항', 'RIGHT'), hd('첫 시도', 'RIGHT'), hd('앎 지수', 'RIGHT'), hd('자신감', 'RIGHT'), hd('차이', 'RIGHT'), hd('갈래 분포')] }];
    A.axes.forEach(function (a, i) {
      var gap = a.conf != null && a.pStar != null ? a.conf - a.pStar : null, fill = i % 2 ? 'FCFCFA' : K.white, bb = { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) };
      var dist = []; CAT_ORDER.forEach(function (k) { if (a.counts[k]) { var c = catC(k); dist.push({ t: '■', c: c.color, s: 18 }); dist.push({ t: c.name.replace(' 필요', '').replace('남은 ', '') + ' ' + a.counts[k] + '  ', c: K.ink2, s: 15 }); } });
      rows.push({ cells: [
        { c: [t([{ t: a.name, b: true }], { size: 18 })], fill: fill, bd: bb },
        { c: [t(a.n ? String(a.n) : '—', { size: 18, align: 'RIGHT' })], fill: fill, bd: bb },
        { c: [t(pct(a.p), { size: 18, align: 'RIGHT' })], fill: fill, bd: bb },
        { c: [t(fx(a.pStar), { size: 18, align: 'RIGHT' })], fill: fill, bd: bb },
        { c: [t(fx(a.conf), { size: 18, align: 'RIGHT' })], fill: fill, bd: bb },
        { c: [t([{ t: sgn(gap), b: true, c: gap == null ? K.mut : gap > 0.15 ? K.red : gap < -0.15 ? K.blue : K.ok }], { size: 18, align: 'RIGHT' })], fill: fill, bd: bb },
        { c: [t(dist.length ? dist : [{ t: '—', c: K.mut }], { size: 15, line: 250 })], fill: fill, bd: bb }] });
    });
    out.push(TB(cols, rows, { m: [70, 90, 70, 90] }));
    out.push(CAPT('앎 지수 = 2 × 첫 시도 정답률 − 1(찍은 몫을 뺀 실제 앎) · 자신감 = 그 단원 개념들의 설문 자신감 평균(0~1) · 차이 = 자신감 − 앎 지수. 붉은 글씨(+0.15 넘음)는 느낌이 기록보다 앞선 단원, 파란 글씨(−0.15 아래)는 생각보다 잘 아는 단원입니다.'));
    out.push(NOTE(WD.unitText(A)));
    return out;
  }

  /* ══════════ 5. 개념별 진단표 ══════════ */
  function conceptBlocks(A) {
    var out = [], counts = A.counts;
    var cols = [520, 3300, 1180, 1060, 760, 760, CW - 7580];
    var hd = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 16, align: al })], fill: K.g8, m: [70, 70, 70, 70] }; };
    var rows = [{ hdr: true, cells: [hd('번', 'CENTER'), hd('개념'), hd('자신감·직관', 'CENTER'), hd('첫 시도', 'RIGHT'), hd('재시', 'RIGHT'), hd('유지', 'RIGHT'), hd('한 줄 권고')] }];
    var curV = null, k = 0;
    A.sorted.forEach(function (r) {
      if (r.verdict === 'strong' || r.verdict === 'watch') return;
      var c = catC(r.verdict);
      if (r.verdict !== curV) {
        curV = r.verdict; k = 0;
        rows.push({ kn: true, cells: [{ span: 7, c: [t([{ t: '■ ' + c.name, c: c.ink, b: true }, { t: '  ·  ' + counts[curV] + '개  ·  ' + c.act, c: K.ink2 }], { size: 17, line: 270 })], fill: c.tint, bd: { left: BD(c.color, 36, D.BorderStyle.SINGLE, 0), bottom: BD(c.color, 6, D.BorderStyle.SINGLE, 0) }, m: [90, 100, 80, 120] }] });
      }
      var fill = k++ % 2 ? 'FCFCFA' : K.white, bb = BD(K.line2, 4, D.BorderStyle.SINGLE, 0);
      var name = [{ t: labelOf(r), b: true }].concat(tagSegs(r));
      if (r.type === 'belief') name = name.concat([{ br: true }, { t: '직관 「' + short(r.s, 40) + '」', c: K.mut, s: 15 }]);
      rows.push({ cells: [
        { c: [t([{ t: String(r.i + 1), c: K.mut }], { size: 17, align: 'CENTER' })], fill: fill, bd: { left: BD(c.color, 24, D.BorderStyle.SINGLE, 0), bottom: bb }, m: [70, 50, 70, 50] },
        { c: [t(name, { size: 17, line: 265 })], fill: fill, bd: { bottom: bb } },
        { c: [t(r.type === 'concept' ? dotsSegs(r.C) : sigSegs(r), { size: 17, align: 'CENTER' })], fill: fill, bd: { bottom: bb } },
        { c: [t(r.rec.n ? [{ t: pct(r.rec.p), b: true }, { br: true }, { t: r.rec.ok + '/' + r.rec.n, c: K.mut, s: 15 }] : [{ t: '—', c: K.mut }], { size: 17, line: 250, align: 'RIGHT' })], fill: fill, bd: { bottom: bb } },
        { c: [t(r.rec.retake.wrong ? r.rec.retake.fixed + '/' + r.rec.retake.wrong : '—', { size: 17, align: 'RIGHT' })], fill: fill, bd: { bottom: bb } },
        { c: [t(r.rec.late.n >= 2 ? pct(r.rec.late.rate) : '—', { size: 17, align: 'RIGHT' })], fill: fill, bd: { bottom: bb } },
        { c: [t(WD.adviceOf(r), { size: 16, line: 250, c: K.ink2 })], fill: fill, bd: { bottom: bb } }] });
    });
    if (rows.length > 1) out.push(TB(cols, rows, { m: [70, 80, 70, 80] }));
    ['strong', 'watch'].forEach(function (key) {
      var rs = A.sorted.filter(function (r) { return r.verdict === key; });
      if (!rs.length) return;
      var c = catC(key);
      out.push(H3(c.name + ' ' + rs.length + '개', { color: c.color, sub: c.act }));
      var w3 = eq(3), grid = [];
      for (var i = 0; i < rs.length; i += 3) {
        grid.push({ cells: [0, 1, 2].map(function (j) {
          var r = rs[i + j];
          if (!r) return { c: [] };
          var why = key === 'watch' ? (r.tags.indexOf('latent') >= 0 ? '잠복 직관' : r.tags.indexOf('recovered') >= 0 ? '재시 회복' : r.rec.level === 'few' ? '기록 적음' : '정답률 중간') : (r.type === 'belief' ? '직관·기록 일치' : (r.C != null ? '자신감 ' + Math.round(r.C * 4 + 1) + '/5' : ''));
          return { c: [t([{ t: (r.i + 1) + '  ', c: K.mut, s: 15 }, { t: short(labelOf(r), 15), b: true }].concat(tagSegs(r)), { size: 17, line: 265 }),
            t([{ t: r.rec.n ? pct(r.rec.p) : '—', c: K.g8, b: true }, { t: '  ' + why, c: K.mut }], { size: 15, line: 240 })],
            fill: c.tint, bd: { left: BD(c.color, 18, D.BorderStyle.SINGLE, 0), bottom: BD(K.white, 24, D.BorderStyle.SINGLE, 0), right: BD(K.white, 24, D.BorderStyle.SINGLE, 0) }, m: [60, 100, 60, 120] };
        }) });
      }
      out.push(TB(w3, grid));
    });
    out.push(CAPT('자신감 ●는 설문 1~5 응답(●5개 = 매우 그렇다). 직관 «신호»는 오개념 문장에 동의했거나 맞는 직관 문장을 부정한 것, «애매»는 보통이다. 재시 = 다음 재시에서 바로잡은 회차 / 처음 틀린 회차. 유지 = 처음 나온 회차 뒤 누적 시험에서의 정답률. 「잠정」= 물은 문항 8개 미만.', { before: 120 }));
    return out;
  }

  /* ══════════ 6. 오개념 카드 ══════════ */
  function misBlocks(A, bank) {
    var out = [];
    var cards = A.remain.slice();
    if (!cards.length) out.push(EMPTY('남은 오개념 카드가 없습니다.', A.quality.intuitionHold ? '직관 문장 응답은 응답 품질 점검에 따라 해석을 미뤘습니다(부록 C).' : A.hasRecord ? '공감한 직관 문장이 있더라도 기록은 이미 그 생각을 넘어서 있습니다. 직관과 지식이 같은 방향을 가리키고 있다는 좋은 신호입니다.' : '기록이 이어지면 직관 문장과 맞대어 볼 수 있습니다.'));
    var col = catC('remain');
    cards.forEach(function (r, ci) {
      var rd = WD.readingOf(bank, r.codes), forms = WD.checkForms(bank, r.codes);
      var why = WD.WHY[r.k] || '일상에서 자주 겪는 경험과 말의 느낌이 이 생각을 그럴듯하게 만듭니다.';
      var hw = CW / 2;
      var head = { span: 2, c: [t([{ t: labelOf(r), c: K.white, b: true, s: 22 }, { t: '   설문 ' + (r.i + 1) + '번 · 첫 시도 ' + pct(r.rec.p) + ' (' + r.rec.ok + '/' + r.rec.n + ')' + (r.tags.indexOf('provisional') >= 0 ? ' · 잠정' : ''), c: 'F3E3EA', s: 16 }], { size: 22, line: 360 })], fill: col.solid, m: [90, 160, 90, 180] };
      var stepH = function (txt, color) { return t([{ t: txt, c: color, b: true }], { size: 16, sp: 10, line: 250, after: 40 }); };
      var b = BD('E7CFD9', 6, D.BorderStyle.SINGLE, 0);
      var c1 = { c: [stepH('①  이런 생각이 들었죠', col.ink), t([{ t: '「' + r.s + '」', b: true }], { size: 20, line: 310 }), t([{ t: '설문에서 «' + (r.mis ? (r.v === 1 ? '매우 그렇다' : '그렇다') : (r.v === 5 ? '전혀 아니다' : '아니다')) + '»를 골랐습니다.', c: K.mut }], { size: 15, line: 240, before: 40 })], bd: { left: b, bottom: b, right: b }, m: [110, 150, 110, 170] };
      var c2 = { c: [stepH('②  왜 그럴듯한가', K.amber), t(why, { size: 18, line: 285 })], bd: { bottom: b, right: b }, m: [110, 150, 110, 170] };
      var c3items = [stepH('③  실제로는', K.ok), t([{ t: r.truth, b: true }], { size: 18, line: 285 })];
      if (rd && rd.r.core) c3items.push(t({ html: WD.md(rd.r.core) }, { size: 17, line: 270, before: 50 }));
      var c3 = { c: c3items, bd: { left: b, bottom: b, right: b }, fill: 'F7FBF8', m: [110, 150, 110, 170] };
      var c4items = [stepH('④  확인 문장 — O/X를 고르고, X는 맞게 고쳐 쓰기', K.blue)];
      if (forms.length) {
        forms.forEach(function (f, i) {
          c4items.push(t([{ t: ' O · X ', b: true, c: K.ink2, sh: K.line2, s: 15 }, { t: '  ' + (i + 1) + ') ' + f.s }], { size: 17, line: 270, before: 30, indL: 0 }));
          if (f.a === 'X') c4items.push(t([{ t: '고쳐 쓰기: ', c: K.mut, s: 15 }], { size: 15, line: 300, border: { bottom: BD('C9C4B6', 4, D.BorderStyle.DASHED, 1) } }));
        });
        c4items.push(t([{ t: '답: ' + forms.map(function (f, i) { return (i + 1) + ') ' + f.a; }).join(' · '), c: K.mut }], { size: 15, align: 'RIGHT', before: 60 }));
      } else c4items.push(t([{ t: '확인 문장은 다음 시험에서 함께 봅니다.', c: K.mut }], { size: 17 }));
      var c4 = { c: c4items, bd: { bottom: b, right: b }, fill: 'F7FAFD', m: [110, 150, 110, 170] };
      out.push(TB([hw, CW - hw], [{ cells: [head] }, { cells: [c1, c2] }, { cells: [c3, c4] }], { atomic: true }));
      if (ci < cards.length - 1) out.push(SP(200));
    });
    var lat = A.latent.filter(function (r) { return r.verdict !== 'remain'; });
    out.push(H3('잠복 직관 점검 — 시험은 맞혔지만 마음속 직관이 남아 있는 곳'));
    if (lat.length) {
      out.push(P({ html: '과학 지식은 예전 직관을 지우지 못하고 눌러 둘 뿐이라(Shtulman & Valcarcel, 2012), 시간에 쫓기거나 새로운 유형에서 다시 튀어나올 수 있습니다. 한 번씩 소리 내어 정답 문장을 말해 보세요.', c: K.ink2 }, { size: 19, line: 300, after: 120, kn: true }));
      var hd = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 16, align: al })], fill: K.g7 }; };
      var rows = [{ hdr: true, cells: [hd('공감한 직관'), hd('정답 문장'), hd('첫 시도', 'RIGHT')] }];
      lat.forEach(function (r, i) { var bb = { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) }, fill = i % 2 ? 'FCFCFA' : K.white; rows.push({ cells: [{ c: [t('「' + r.s + '」', { size: 17, line: 270 })], fill: fill, bd: bb }, { c: [t(r.truth, { size: 17, line: 270 })], fill: fill, bd: bb }, { c: [t(pct(r.rec.p), { size: 17, align: 'RIGHT' })], fill: fill, bd: bb }] }); });
      out.push(TB([4300, CW - 5300, 1000], rows, { m: [70, 100, 70, 100] }));
    } else out.push(NOTE(A.quality.intuitionHold ? '응답 품질 점검에 따라 직관 문장의 해석을 미뤘습니다.' : '시험은 맞혔는데 직관이 남아 있는 개념이 없습니다. 맞는 직관 문장에도 ' + (A.quality.cleanIntuition ? '정확히 공감해, 직관과 지식이 같은 방향을 가리키고 있습니다.' : '대체로 같은 방향으로 답했습니다.'), { color: K.g8, fill: K.g0 }));
    return out;
  }

  /* ══════════ 7. 습관과 마음 ══════════ */
  function habitBlocks(A, charts) {
    var out = [], subs = {}; A.habits.subs.forEach(function (s) { subs[s.id] = s; });
    if (!A.hasSurvey) { out.push(EMPTY('설문 응답이 없어 이 절은 비워 두었습니다.')); return out; }
    var lw = 4400, rw = CW - lw - 200;
    var bars = ['efficacy', 'burden', 'interest'].map(function (k) { var s = subs[k]; return barRow(s.name, s.avg == null ? null : (s.avg - 1) / 4, fx(s.avg, 1) + ' / 5', k === 'burden' ? 'C2562F' : K.g8, { lw: 1700, vw: 900, w: rw, size: 18, bold: true }); });
    var st = A.habits.strategy;
    var right = [BARS(bars, { lw: 1700, vw: 900, w: rw })];
    var sub2 = [];
    if (st.index != null) {
      sub2.push(BARS([barRow('꺼내기·간격·고쳐 쓰기', (st.retrieve - 1) / 4, fx(st.retrieve, 1), K.g8, { lw: 1700, vw: 900, w: rw, size: 16 }), barRow('다시 읽기·필기', (st.reread - 1) / 4, fx(st.reread, 1), K.gold2, { lw: 1700, vw: 900, w: rw, size: 16 })], { lw: 1700, vw: 900, w: rw }));
    }
    var stTxt = st.index == null ? [{ t: '응답이 부족해 계산하지 않았습니다.', c: K.mut }] : [{ t: '지수 ' }, { t: sgn(st.index, 1), b: true, c: st.index >= 0 ? K.ok : K.red }, { t: ' — ' + (st.index >= 0.5 ? '효과가 큰 «꺼내 보는» 공부가 우세합니다.' : st.index >= 0 ? '두 방식이 비슷합니다. 꺼내 보는 쪽을 조금 더 늘려 보세요.' : '다시 읽기 쪽이 더 큽니다. 읽으면 익숙해지지만 오래 남는 것은 꺼내 본 쪽입니다.') }];
    /* 왼쪽 그림 | 오른쪽 막대 — 칸 안에 표를 넣을 수 있게 TBraw 로 */
    var rightCell = { m: [0, 0, 0, 0], c: [t([{ t: '효능감 · 시험 부담 · 흥미', c: K.g9, b: true }], { size: 19, after: 60 })], raw: right[0] };
    out.push(TBraw([lw, 200, rw], [{ cells: [{ c: [im(charts.cycle, 290, { alt: '자기조절 세 단계' })], m: [0, 0, 0, 0], va: 'CENTER' }, { c: [] }, rightCell] }], { atomic: true }));
    out.push(H3('효과적 전략 지수', { sub: '꺼내기·간격·고쳐 쓰기 − 다시 읽기·필기 (Dunlosky 외, 2013)' }));
    if (sub2.length) out.push(BARS([barRow('꺼내기·간격·고쳐 쓰기', (st.retrieve - 1) / 4, fx(st.retrieve, 1) + ' / 5', K.g8, { lw: 2800, vw: 1000, size: 18 }), barRow('다시 읽기·필기', (st.reread - 1) / 4, fx(st.reread, 1) + ' / 5', K.gold2, { lw: 2800, vw: 1000, size: 18 })], { lw: 2800, vw: 1000 }));
    out.push(P(stTxt, { size: 19, line: 300, before: 60, after: 60 }));
    out.push(H3('기록과 나란히'));
    var pairs = WD.habitPairs(A, subs), cs = [], w3 = [Math.floor((CW - 240) / 3), 120, Math.floor((CW - 240) / 3), 120, CW - 240 - 2 * Math.floor((CW - 240) / 3)];
    pairs.forEach(function (p, i) { if (i) cs.push({ c: [] }); cs.push(CARD([t([{ t: p[0], c: K.goldInk, b: true }], { size: 16, sp: 10 }), t({ html: p[1], b: true }, { size: 19, line: 300, before: 30, after: 50 }), t({ html: p[2], c: K.ink2 }, { size: 17, line: 270 })], { top: K.gold })); });
    out.push(TB(w3, [{ cells: cs }], { atomic: true }));
    var pos = [];
    ['plan', 'monitor', 'reflect', 'efficacy', 'interest'].forEach(function (k) { subs[k].items.forEach(function (it) { if (it.agree != null) pos.push({ s: it.s, a: it.agree, g: subs[k].name }); }); });
    var hiI = pos.slice().sort(function (a, b) { return b.a - a.a; }).slice(0, 4), loI = pos.slice().sort(function (a, b) { return a.a - b.a; }).slice(0, 4);
    var li = function (x) { return t([{ t: x.a + ' / 5   ', c: K.g8, b: true }, { t: x.s }, { t: ' · ' + x.g, c: K.mut }], { size: 17, line: 270, before: 50 }); };
    out.push(H3('스스로 가장 «그렇다»고 한 습관과 가장 «아니다»라고 한 습관'));
    out.push(TB([CW / 2 - 60, 120, CW / 2 - 60], [{ cells: [CARD([t([{ t: '이미 자리 잡은 것', c: K.ok, b: true }], { size: 19 })].concat(hiI.map(li)), { fill: K.g0, top: K.ok, border: K.g2 }), { c: [] },
      CARD([t([{ t: '다음에 붙일 것', c: K.amber, b: true }], { size: 19 })].concat(loI.map(li)), { fill: K.goldSoft, top: K.gold, border: K.goldLine })] }], { atomic: true }));
    out.push(SP(160));
    out.push(NOTE(WD.habitText(A, subs)));
    return out;
  }

  /* ══════════ 8. 어려웠던 점 ══════════ */
  function diffBlocks(A) {
    var out = [];
    if (!A.hasSurvey) { out.push(EMPTY('설문 응답이 없어 이 절은 비워 두었습니다.')); return out; }
    var diffs = A.habits.difficulties;
    out.push(BARS(diffs.map(function (d) {
      var r = barRow([{ t: d.s }].concat(d.cross ? [{ br: true }, { t: '기록: ' + WD.crossText(d.cross), c: K.mut, s: 15 }] : []), d.agree == null ? null : (d.agree - 1) / 4, d.agree == null ? '—' : d.agree + ' / 5', (d.agree || 0) >= 4 ? 'C2562F' : (d.agree || 0) >= 3 ? K.gold2 : '9FC3B5', { lw: 5200, vw: 900, size: 18 });
      return r;
    }), { lw: 5200, vw: 900, barH: 170 }));
    var top = diffs.filter(function (d) { return d.agree != null && d.agree >= 3; }).slice(0, 3);
    if (!top.length) top = diffs.slice(0, 2);
    out.push(H3('처방 — 가장 크게 느낀 ' + top.length + '가지'));
    var n = top.length, gap = 120, cw0 = Math.floor((CW - gap * (n - 1)) / n), cols = [], cs = [];
    top.forEach(function (d, i) {
      if (i) { cols.push(gap); cs.push({ c: [] }); }
      cols.push(i === n - 1 ? CW - sum(cols) : cw0);
      var c = WD.CURE[d.k] || ['', '이 어려움을 선생님과 함께 구체적인 문장 하나로 짚어 보세요.'];
      var items = [t([{ t: '처방 ' + (i + 1) + (c[0] ? ' · ' + c[0] : ''), c: K.goldInk, b: true }], { size: 16 }), t([{ t: '「' + short(d.s, 30) + '」', b: true }], { size: 19, line: 300, before: 30, after: 50 }), t(c[1], { size: 18, line: 285 })];
      if (d.cross) items.push(t([{ t: '기록 확인: ' + WD.crossText(d.cross), c: K.mut }], { size: 15, line: 240, before: 60 }));
      cs.push(CARD(items, { fill: K.g0, top: K.g8, border: K.g2 }));
    });
    out.push(TB(cols, [{ cells: cs }], { atomic: true }));
    out.push(CAPT('«기록»은 첫 시도 문장 가운데 해당하는 문장만 골라 센 정답률입니다(예: 「항상」「모든」이 든 문장, 숫자가 든 문장, 35자 이상의 긴 문장, 지난 단원 문항). 느낌과 기록이 다르면 기록이 보여 주는 쪽을 먼저 믿어도 됩니다.', { before: 120 }));
    return out;
  }

  /* ══════════ 9. 처방 ══════════ */
  function nextBlocks(A, bank) {
    var out = [];
    out.push(H3('우선순위 3', { before: 0 }));
    if (A.priorities.length) {
      A.priorities.forEach(function (r, i) {
        var rd = WD.readingOf(bank, r.codes);
        var meta = '첫 시도 ' + pct(r.rec.p) + ' (' + r.rec.ok + '/' + r.rec.n + ')' + (r.rec.retake.wrong ? ' · 재시 교정 ' + r.rec.retake.fixed + '/' + r.rec.retake.wrong : '') + (r.type === 'concept' && r.C != null ? ' · 설문 자신감 ' + Math.round(r.C * 4 + 1) + '/5' : '');
        var items = [t([{ t: labelOf(r) + '  ', c: K.g9, b: true, s: 22 }, chipSeg(r.verdict)].concat(tagSegs(r)), { size: 22, line: 360 }), t([{ t: meta, c: K.mut }], { size: 16, line: 250, after: 60 })];
        var one = rd && rd.r.oneline ? rd.r.oneline : r.note;
        if (one) items.push(t({ html: WD.md(one) }, { size: 18, line: 290, fill: K.g0, after: 60 }));
        items.push(t([{ t: '할 일 — ', c: K.g8, b: true }, { t: WD.priorityAct(r) }], { size: 18, line: 290 }));
        out.push(TB([900, CW - 900], [{ cells: [{ c: [t([{ t: String(i + 1), c: K.white, b: true }], { size: 40, line: 560, align: 'CENTER' })], fill: K.g8, va: 'CENTER', m: [80, 0, 80, 0] },
          { c: items, bd: { top: BD(K.line, 6), bottom: BD(K.line, 6), right: BD(K.line, 6) }, m: [110, 160, 110, 200] }] }], { atomic: true }));
        out.push(SP(120));
      });
    } else out.push(EMPTY('지금 급히 다질 개념이 없습니다.', '다음 과정의 첫 몇 주는 화학1 개념을 가끔 꺼내 보는 «유지»에 집중하면 충분합니다.'));
    var more = A.priorityAll.slice(A.priorities.length).filter(function (r) { return WD.readingOf(bank, r.codes); }).slice(0, 4);
    if (more.length) {
      out.push(H3('보강 개념 카드 — 우선순위 다음으로 볼 개념'));
      var grid = [];
      for (var i = 0; i < more.length; i += 2) {
        grid.push({ cells: [0, 1].map(function (j) {
          var r = more[i + j]; if (!r) return { c: [] };
          var rd = WD.readingOf(bank, r.codes), items = [t([{ t: labelOf(r) + '  ', c: K.g9, b: true }, chipSeg(r.verdict)], { size: 19, line: 300 }), t([{ t: '첫 시도 ' + pct(r.rec.p) + ' (' + r.rec.ok + '/' + r.rec.n + ')' + (r.rec.retake.wrong ? ' · 재시 교정 ' + r.rec.retake.fixed + '/' + r.rec.retake.wrong : ''), c: K.mut }], { size: 15, line: 240, after: 40 })];
          if (rd.r.core) items.push(t({ html: WD.md(rd.r.core) }, { size: 17, line: 270 }));
          if (rd.r.kill) items.push(t([{ t: '흔한 착각 ', c: K.red, b: true }, { html: WD.md(rd.r.kill), c: '7A3418' }], { size: 16, line: 255, before: 50, fill: K.redSoft }));
          return CARD(items, {});
        }).reduce(function (a, c, j) { if (j) a.push({ c: [] }); a.push(c); return a; }, []) });
        if (i + 2 < more.length) grid.push({ cells: [{ span: 3, c: [] }], h: 120 });
      }
      out.push(TB([CW / 2 - 60, 120, CW / 2 - 60], grid));
    }
    out.push(H3('한 주의 공부 순서'));
    var p1 = A.priorities[0] ? labelOf(A.priorities[0]) : '약한 개념', p2 = A.priorities[1] ? labelOf(A.priorities[1]) : p1;
    var days = [['월', '덮고 떠올리기 10분 — 지난주 배운 것을 빈 종이에 핵심 문장으로'], ['화', '「' + short(p1, 14) + '」 — 오개념과 정답 나란히 비교 + O/X 3문장'], ['수', '새 내용 공부 끝에 «나오면 맞힐까?» 1~5로 예측 적기'], ['목', '틀린 O/X 문장을 맞는 문장으로 고쳐 쓰기'], ['금', '1주 전·1달 전 내용 다시 꺼내기(간격 복습) · 「' + short(p2, 12) + '」'], ['토', '수요일 예측 맞춰 보기 — 예측과 결과 비교 한 줄'], ['일', '쉬기 · 숨은 실력 목록 훑으며 «아는 것» 확인 5분']];
    var dc = eq(7);
    out.push(TB(dc, [{ cells: days.map(function (d) { return { c: [t([{ t: d[0], c: K.white, b: true }], { size: 20, align: 'CENTER' })], fill: d[0] === '일' ? K.gold : K.g8, bd: { right: BD(K.white, 24, D.BorderStyle.SINGLE, 0) } }; }) },
      { cells: days.map(function (d) { return { c: [t(d[1], { size: 16, line: 255 })], fill: d[0] === '일' ? K.goldSoft : K.g0, bd: { right: BD(K.white, 24, D.BorderStyle.SINGLE, 0) }, m: [90, 90, 90, 100] }; }), min: 1500 }], { atomic: true, m: [60, 60, 60, 60] }));
    out.push(CAPT('덮고 떠올리기·간격 두고 다시 꺼내기·틀린 O/X 고쳐 쓰기·예측 후 확인은 학습법 연구에서 효과가 크다고 정리된 방법입니다(Dunlosky 외, 2013; Uner 외, 2022; Nederhand 외, 2020).'));
    out.push(H3('숨은 실력 확정 목록 — «이건 내가 아는 것»'));
    var hid = A.hidden.concat(A.rows.filter(function (r) { return r.tags.indexOf('recovered') >= 0 && r.verdict !== 'hidden'; }));
    var nHid = A.hidden.length, nRec = hid.length - nHid;
    if (hid.length) {
      var segs = [];
      hid.forEach(function (r, i) { if (i) segs.push({ t: '   ' }); segs.push({ t: ' ✓ ' + labelOf(r) + ' · ' + pct(r.rec.p) + (r.verdict !== 'hidden' ? ' · 재시 회복' : '') + ' ', c: K.blue, b: true, sh: K.white }); });
      out.push(TB([CW], [{ cells: [{ c: [t(segs, { size: 17, line: 330 }), t((nHid ? '자신은 없었지만 기록은 꾸준히 맞은 개념' + (nRec ? '과, 처음엔 틀렸지만 재시로 고쳐 뒤로 계속 맞힌 개념' : '') + '입니다. ' : '처음엔 틀렸지만 재시로 고쳐 뒤로 계속 맞힌 개념입니다. ') + '«맞았다»는 확인을 받지 못하면 이런 지식은 쉽게 흐려지므로(Butler 외, 2008), ✓ 표시를 하고 다음 과정에서 자신 있게 쓰세요.', { size: 18, line: 290, before: 80, c: '1D4B70' })],
        fill: K.blueSoft, bd: { left: BD(hx(CAT.hidden.color), 30, D.BorderStyle.SINGLE, 0) }, m: [130, 180, 130, 200] }] }], { atomic: true }));
    } else out.push(NOTE('숨은 실력으로 분류된 개념이 없습니다. 자신감과 기록이 잘 맞는다는 뜻입니다.', { color: hx(CAT.hidden.color), fill: K.blueSoft }));
    if (A.hasSurvey) {
      var nx = (A.habits.groups.next && A.habits.groups.next.items) || [];
      var NXS = { q010: '시작할 준비가 됨', q020: '한 번 더 정리가 필요', q030: '혼자서도 공부할 수 있음', q040: '처음 보는 문제도 풀어 봄', q050: '약한 개념을 앎', q060: '보강 방법을 앎', q070: '점수보다 이해', q080: '들인 시간이 충분', q090: '누적 시험을 계속', q100: '더 도움받고 싶음' };
      out.push(H3('다음 과정 준비 — 스스로 답한 것'));
      var g5 = eq(5), rows = [];
      for (var k = 0; k < nx.length; k += 5) {
        rows.push({ cells: [0, 1, 2, 3, 4].map(function (j) {
          var it = nx[k + j]; if (!it) return { c: [] };
          var a = it.agree, col = a == null ? K.mut : a >= 4 ? K.ok : a <= 2 ? K.red : K.amber;
          return { c: [t([{ t: a == null ? '—' : String(a), c: col, b: true, s: 30 }, { t: a == null ? '' : ' / 5', c: col, s: 16 }], { size: 30, line: 440 }), t([{ t: NXS[it.k] || short(it.s, 14), c: K.ink2, b: true }], { size: 16, line: 250 })],
            fill: K.white, bd: { top: BD(col, 18, D.BorderStyle.SINGLE, 0), bottom: BD(K.line, 4), left: BD(K.line, 4), right: BD(K.line, 4) }, m: [80, 100, 90, 120] };
        }) });
        rows.push({ cells: [{ span: 5, c: [] }], h: 100 });
      }
      rows.pop();
      out.push(TB(g5, rows, { atomic: true }));
      out.push(CAPT('설문 «다음 과정 준비» 10문항에 동의한 정도(5 = 매우 그렇다). «한 번 더 정리가 필요»와 «더 도움받고 싶음»은 높을수록 선생님과 함께 챙길 곳이 있다는 뜻입니다.'));
    }
    return out;
  }

  /* ══════════ 10. 모든 시험 ══════════ */
  function testBlocks(A, charts) {
    var out = [], X = A.external || { exams: [], kmchc: [], status: {} };
    if ((A.timeline || []).length) {
      out.push(IMG(charts.timeline, 640, { alt: '지금까지의 모든 시험' }));
      out.push(CAPT('점 하나가 시험 한 번(첫 시도)입니다. 색은 과목·시험 갈래이고, 마름모는 모의시험입니다. 날짜가 없는 시험은 차례대로 놓았습니다.', { before: 0 }));
    } else out.push(EMPTY('시험 기록이 없습니다.'));
    var cs10 = (A.courses || []).filter(function (c) { return c.rounds.length; });
    if (cs10.length) {
      out.push(H3('DT 과목별 누적 O/X'));
      var hd = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 16, align: al })], fill: K.g8 }; };
      var rows = [{ hdr: true, cells: [hd('과목'), hd('회차', 'RIGHT'), hd('첫 시도', 'RIGHT'), hd('재시 교정', 'RIGHT'), hd('회차별 추이'), hd('먼저 다질 곳')] }];
      cs10.forEach(function (c, i) {
        var weak = null;
        if (c.course === 'ch1') { var ax = SA.AXES.map(function (a) { var x = c.rec.axis[a.id]; return { name: a.name, n: x.n, p: x.n ? x.ok / x.n : null }; }).filter(function (a) { return a.n >= 5; }).sort(function (a, b) { return a.p - b.p; }); weak = ax[0] || null; }
        else { var cc = Object.keys(c.rec.codes).map(function (k) { var o = c.rec.codes[k]; return { name: c.rec.misOfCode[k] || k, n: o.n, p: o.n ? o.ok / o.n : null }; }).filter(function (o) { return o.n >= 3; }).sort(function (a, b) { return a.p - b.p || b.n - a.n; }); weak = cc[0] || null; }
        var bb = { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) }, fill = i % 2 ? 'FCFCFA' : K.white;
        rows.push({ cells: [
          { c: [t([{ t: c.name, b: true }].concat(c.preview ? [{ t: ' 미리보기 ', s: 15, sh: K.line2, c: K.ink2 }] : []), { size: 18 })], fill: fill, bd: bb, va: 'CENTER' },
          { c: [t(String(c.rounds.length), { size: 18, align: 'RIGHT' })], fill: fill, bd: bb, va: 'CENTER' },
          { c: [t([{ t: pct(c.rate), b: true }], { size: 18, align: 'RIGHT' })], fill: fill, bd: bb, va: 'CENTER' },
          { c: [t(pct(c.retakeRate), { size: 18, align: 'RIGHT' })], fill: fill, bd: bb, va: 'CENTER' },
          { c: charts.spark[c.course] ? [im(charts.spark[c.course], 120, { align: 'LEFT' })] : [t('—', { size: 18 })], fill: fill, bd: bb, va: 'CENTER' },
          { c: [t(weak ? [{ t: weak.name + ' ' }, { t: pct(weak.p), c: K.mut }] : [{ t: '—', c: K.mut }], { size: 17, line: 265 })], fill: fill, bd: bb, va: 'CENTER' }] });
      });
      out.push(TB([1700, 760, 1000, 1100, 2100, CW - 6660], rows, { m: [70, 90, 70, 90] }));
    }
    if (A.link && A.link.n) {
      var L = A.link;
      out.push(SP(140));
      out.push(NOTE('<b>화학Ⅰ → ' + L.toName + ' — 이어진 개념 ' + L.n + '개</b><br>같은 개념을 화학Ⅰ에서 ' + pct(L.fromRate) + ', ' + L.toName + '에서 ' + pct(L.ownRate) + ' 맞혔습니다. ' +
        (L.improved.length ? '화학Ⅰ에서 흔들렸던 개념 가운데 <b>' + L.improved.length + '개</b>는 심화에서 85% 이상으로 올라섰습니다(' + L.improved.slice(0, 4).map(function (o) { return o.name; }).join(' · ') + '). ' : '') +
        (L.stillWeak.length ? '<b>' + L.stillWeak.length + '개</b>는 심화에서도 아직 흔들립니다(' + L.stillWeak.slice(0, 4).map(function (o) { return o.name; }).join(' · ') + ') — 9절 우선순위와 함께 보세요.' : ''), { color: K.g8, fill: K.g0 }));
    }
    out.push(H3('모의시험'));
    if (X.exams.length) {
      var hd2 = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 16, align: al })], fill: K.g8 }; };
      var rows2 = [{ hdr: true, cells: [hd2('시험'), hd2('날짜'), hd2('맞은 개수', 'RIGHT'), hd2('백점 환산', 'RIGHT'), hd2('영역 — 강 · 약'), hd2('개념 깊이(또래 기준)')] }];
      X.exams.forEach(function (e, i) {
        var ar = e.areas.filter(function (a) { return a.n >= 2; }).sort(function (a, b) { return b.p - a.p; });
        var d = e.depth, dep = d && (d.easyN || d.hardN) ? [{ t: '쉬운 ' + pct(d.easyN ? d.easyOk / d.easyN : null) + ' · 어려운 ' + pct(d.hardN ? d.hardOk / d.hardN : null) }, { br: true }, { t: WD.depthWord(d), c: K.mut, s: 15 }] : [{ t: '또래 자료 부족', c: K.mut }];
        var bb = { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) }, fill = i % 2 ? 'FCFCFA' : K.white;
        rows2.push({ cells: [
          { c: [t([{ t: e.title, b: true }, { br: true }, { t: e.kind, c: K.mut, s: 15 }], { size: 17, line: 260 })], fill: fill, bd: bb },
          { c: [t(ymd(e.date) || '—', { size: 16 })], fill: fill, bd: bb },
          { c: [t(e.ok + ' / ' + e.n, { size: 17, align: 'RIGHT' })], fill: fill, bd: bb },
          { c: [t([{ t: e.rate == null ? '—' : String(Math.round(e.rate * 100)), b: true }], { size: 17, align: 'RIGHT' })], fill: fill, bd: bb },
          { c: [t(ar.length ? [{ t: ar[0].name + ' ' + pct(ar[0].p), c: K.ok, b: true }].concat(ar.length > 1 ? [{ br: true }, { t: ar[ar.length - 1].name + ' ' + pct(ar[ar.length - 1].p), c: K.red, b: true }] : []) : [{ t: '—' }], { size: 16, line: 255 })], fill: fill, bd: bb },
          { c: [t(dep, { size: 16, line: 255 })], fill: fill, bd: bb }] });
      });
      out.push(TB([2200, 1300, 1050, 900, 2200, CW - 7650], rows2, { m: [70, 90, 70, 90] }));
      out.push(CAPT('개념 깊이는 또래 정답률 60% 이상을 «쉬운 문항», 미만을 «어려운 문항»으로 나눈 정답률입니다(또래 8명 이상일 때). 이 보고서는 다른 학생과 견주는 자리를 싣지 않습니다.'));
    } else out.push(NOTE(WD.extMsg(X.status.exam, '모의시험'), { color: K.line, fill: K.cream }));
    return out;
  }

  /* ══════════ 11. 누적 지도 ══════════ */
  function heatCell(c, total) {
    if (!c) return { c: [t([{ t: '—', c: K.mut }], { size: 17, align: 'CENTER' })], va: 'CENTER', bd: { bottom: BD(K.white, 18, D.BorderStyle.SINGLE, 0), right: BD(K.white, 18, D.BorderStyle.SINGLE, 0) } };
    var p = c.p, few = c.n < 5;
    var bg = p == null ? 'F3F4F2' : p >= 0.9 ? 'CFE7DA' : p >= 0.8 ? 'E2F0E8' : p >= 0.7 ? 'F3F1E4' : p >= 0.6 ? 'F8E6D8' : 'F3D5C8';
    var fg = few ? K.mut : p == null ? K.mut : p >= 0.8 ? '124F31' : p >= 0.7 ? '5A4A12' : '7A3418';
    return { c: [t([{ t: pct(p), b: true, c: fg }, { t: ' · ' + c.n, c: fg, s: 15 }], { size: total ? 19 : 18, align: 'CENTER' })], fill: few ? 'F6F6F3' : bg, va: 'CENTER', bd: { bottom: BD(K.white, 18, D.BorderStyle.SINGLE, 0), right: BD(K.white, 18, D.BorderStyle.SINGLE, 0) } };
  }
  function mapBlocks(A) {
    var out = [], AM = A.areaMap || { cols: [], rows: [], examAreas: [] };
    if (!AM.rows.length) { out.push(EMPTY('모을 시험 기록이 없습니다.')); return out; }
    var n = AM.cols.length + 1, rest = CW - 2600, cw0 = Math.floor(rest / n), cols = [2600];
    for (var i = 0; i < n; i++) cols.push(i === n - 1 ? rest - cw0 * (n - 1) : cw0);
    var hd = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 16, align: al })], fill: K.g8, bd: { right: BD(K.white, 18, D.BorderStyle.SINGLE, 0) } }; };
    var rows = [{ hdr: true, cells: [hd('단원 묶음')].concat(AM.cols.map(function (c) { return hd(c, 'CENTER'); })).concat([hd('합계', 'CENTER')]) }];
    AM.rows.forEach(function (r) { rows.push({ cells: [{ c: [t([{ t: r.name, b: true }], { size: 18 })], va: 'CENTER', fill: K.g0, bd: { bottom: BD(K.white, 18, D.BorderStyle.SINGLE, 0) } }].concat(r.cells.map(function (c) { return heatCell(c); })).concat([heatCell({ n: r.n, ok: r.ok, p: r.p }, true)]) }); });
    out.push(TB(cols, rows, { m: [90, 80, 90, 100] }));
    out.push(CAPT('칸 안 숫자는 «정답률 · 문항 수»입니다. 다른 과목·모의시험의 단원·영역 이름은 내용에 따라 가장 가까운 화학Ⅰ 묶음에 얹었습니다(화학Ⅰ 심화는 개념 대응표로 옮김). 5문항 미만의 칸은 회색으로 흐리게 표시합니다.'));
    if (AM.examAreas.length) {
      var weakA = AM.examAreas.filter(function (x) { return x.p < 0.8; }).slice(0, 5), strongA = AM.examAreas.filter(function (x) { return x.p >= 0.85; }).reverse().slice(0, 5);
      var hw = CW / 2 - 60;
      var mk = function (list, color, none) { return list.length ? BARS(list.map(function (a) { return barRow(a.name + ' · ' + a.n + '문항', a.p, pct(a.p), color, { lw: 2300, vw: 700, w: hw - 300, size: 17 }); }), { lw: 2300, vw: 700, w: hw - 300 }) : null; };
      var wb = mk(weakA, 'C2562F'), sb = mk(strongA, K.g8);
      out.push(SP(120));
      out.push(TBraw([hw, 120, hw], [{ cells: [
        { c: [t([{ t: '모의시험에서 다질 영역 (80% 미만)', c: K.amber, b: true }], { size: 19, after: 60 })].concat(wb ? [] : [t([{ t: '80% 아래로 내려간 영역이 없습니다.', c: K.mut }], { size: 17 })]), raw: wb || undefined, fill: K.goldSoft, m: [120, 150, 120, 150], bd: { top: BD(K.gold, 18, D.BorderStyle.SINGLE, 0) } },
        { c: [] },
        { c: [t([{ t: '모의시험에서 단단한 영역 (85% 이상)', c: K.ok, b: true }], { size: 19, after: 60 })].concat(sb ? [] : [t([{ t: '85% 이상인 영역이 아직 없습니다.', c: K.mut }], { size: 17 })]), raw: sb || undefined, fill: K.g0, m: [120, 150, 120, 150], bd: { top: BD(K.g8, 18, D.BorderStyle.SINGLE, 0) } }] }], { atomic: true }));
    }
    return out;
  }

  /* ══════════ 12. 되풀이 ══════════ */
  function recurBlocks(A) {
    var out = [], RC = A.recurring || { groups: [] };
    if (!RC.groups.length) { out.push(EMPTY('여러 번 되풀이된 오개념이 없습니다.', '막힌 곳이 생겨도 같은 자리에서 반복되지 않았습니다.')); return out; }
    RC.groups.forEach(function (g, gi) {
      var head = { span: 2, c: [t([{ t: g.name + '   ', c: K.g9, b: true, s: 21 }].concat(g.sources.reduce(function (a, x) { a.push({ t: ' ' + x + ' ', b: true, c: K.ink2, sh: K.line2, s: 15 }); a.push({ t: ' ', s: 15 }); return a; }, [])), { size: 21, line: 340 })], fill: K.g0, bd: { top: BD(K.g8, 18, D.BorderStyle.SINGLE, 0) }, m: [90, 140, 90, 160] };
      var rows = [{ cells: [head] }];
      g.items.slice(0, 6).forEach(function (x) {
        var bb = { bottom: BD(K.line2, 4, D.BorderStyle.DOTTED, 0) };
        rows.push({ cells: [
          { c: [t([{ t: x.src, c: x.open ? K.red : K.ok, b: true }], { size: 17, line: 265 })], bd: bb, m: [70, 80, 70, 160] },
          { c: [t([{ t: short(x.topic, 40), b: true }, { t: ' — ' + x.ev, c: K.mut }].concat(x.note ? [{ br: true }, { t: short(x.note, 90), c: K.mut, s: 15 }] : []), { size: 17, line: 265 })], bd: bb, m: [70, 140, 70, 80] }] });
      });
      out.push(TB([2100, CW - 2100], rows, { atomic: true }));
      if (gi < RC.groups.length - 1) out.push(SP(160));
    });
    out.push(CAPT('초록 글씨는 이미 해소한 것, 붉은 글씨는 아직 열려 있는 것입니다. 같은 주제가 여러 출처에서 보이면 «그날의 실수»가 아니라 자리 잡지 않은 생각일 가능성이 큽니다 — 6절 카드처럼 오개념과 정답을 나란히 놓고 고치세요.', { before: 140 }));
    return out;
  }

  /* ══════════ 13. KMChC ══════════ */
  function kmBlocks(A, charts) {
    var out = [], KC = A.kmCompare, X = A.external || { kmchc: [], status: {} };
    if (!(KC && KC.rows.length)) { out.push(NOTE(WD.extMsg((X.status || {}).kmchc, 'KMChC 학습진단'), { color: K.line, fill: K.cream })); return out; }
    var hd = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 16, align: al })], fill: K.g8 }; };
    var rows = [{ hdr: true, cells: [hd('축'), hd('그때 (' + (ymd(KC.date) || '학습진단') + ')'), hd('지금 (이번 설문)'), hd('0~100 눈금'), hd('변화', 'RIGHT')] }];
    KC.rows.forEach(function (r, i) {
      var good = r.diff == null ? null : (r.negative ? r.diff < 0 : r.diff > 0);
      var bb = { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) }, fill = i % 2 ? 'FCFCFA' : K.white;
      rows.push({ cells: [
        { c: [t([{ t: r.name, b: true }], { size: 17, line: 265 })], fill: fill, bd: bb, va: 'CENTER' },
        { c: [t(r.beforeTxt, { size: 17 })], fill: fill, bd: bb, va: 'CENTER' },
        { c: [t(r.nowTxt ? [{ t: r.nowTxt }] : [{ t: '이번 설문에 없는 축', c: K.mut }], { size: 17, line: 265 })], fill: fill, bd: bb, va: 'CENTER' },
        { c: [t([{ t: '그때 ' + (r.before == null ? '—' : Math.round(r.before)), c: K.goldInk, b: true }, { t: '  →  ', c: K.mut }, { t: '지금 ' + (r.now == null ? '—' : Math.round(r.now)), c: K.g8, b: true }], { size: 17 })], fill: fill, bd: bb, va: 'CENTER' },
        { c: [t([{ t: r.diff == null ? '—' : (r.diff > 0 ? '▲ ' : r.diff < 0 ? '▼ ' : '') + Math.abs(Math.round(r.diff)), b: true, c: good == null ? K.mut : Math.abs(r.diff) < 8 ? K.mut : good ? K.ok : K.red }], { size: 18, align: 'RIGHT' })], fill: fill, bd: bb, va: 'CENTER' }] });
    });
    out.push(TB([2500, 1600, 2200, 2200, CW - 8500], rows, { m: [70, 90, 70, 90] }));
    if (charts.km) { out.push(SP(80)); out.push(IMG(charts.km, 600, { alt: '그때와 지금', after: 0 })); }
    out.push(CAPT('그때는 «도달 단계»(사다리 0~4단)와 0~100 점수, 지금은 «동의 정도»(1~5)라 눈금이 다릅니다. 둘 다 0~100으로 옮겨 <b>방향만</b> 봅니다(8 미만의 차이는 같은 것으로 봅니다). 금색 막대가 그때, 초록 막대가 지금입니다. 그때 응답의 타당도 표시: ' + (KC.validity || '—') + '.'));
    out.push(NOTE(WD.kmText(KC)));
    var K0 = (X.kmchc || []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); })[0];
    if (K0 && (K0.misc || []).length) {
      out.push(H3('그때 고른 생각 → 지금 그 단원의 기록'));
      var rows2 = [{ hdr: true, cells: [hd('그때 학습진단에서 고른 답'), hd('이어지는 단원 묶음'), hd('지금 첫 시도', 'RIGHT')] }];
      K0.misc.slice(0, 6).forEach(function (m, i) {
        var axId = (SA.KM_CLUSTER_AXIS || {})[m.cluster] || SA.axisOfTopic(m.label), ax = A.axes.filter(function (x) { return x.id === axId; })[0];
        var bb = { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) }, fill = i % 2 ? 'FCFCFA' : K.white;
        rows2.push({ cells: [
          { c: [t([{ t: ((SA.KM_CLUSTER || {})[m.cluster] || m.cluster) + ' — ' + m.label, b: true }].concat(m.entrenched ? [{ t: '  ' }, { t: ' 확신하며 고름 ', s: 15, b: true, sh: K.line2, c: K.ink2 }] : []).concat(m.pick ? [{ br: true }, { t: '「' + m.pick + '」', c: K.mut, s: 15 }] : []), { size: 17, line: 265 })], fill: fill, bd: bb },
          { c: [t(ax ? ax.name : '그 밖의 주제', { size: 17 })], fill: fill, bd: bb },
          { c: [t(ax && ax.p != null ? [{ t: pct(ax.p), b: true }, { br: true }, { t: ax.n + '문항', c: K.mut, s: 15 }] : [{ t: '—' }], { size: 17, line: 255, align: 'RIGHT' })], fill: fill, bd: bb }] });
      });
      out.push(TB([CW - 4100, 2600, 1500], rows2, { m: [70, 90, 70, 90] }));
    }
    if (K0 && K0.interestCtx && K0.anxietyCtx) {
      var CTXN = { phenom: '현상', symbol: '입자·기호', quant: '정량(계산)', lab: '실험' };
      var cells = ['phenom', 'symbol', 'quant', 'lab'].filter(function (c) { return K0.interestCtx[c] != null || K0.anxietyCtx[c] != null; });
      if (cells.length) {
        out.push(H3('그때의 맥락별 흥미와 불안 (0~100)'));
        var rows3 = [{ hdr: true, cells: [hd('맥락'), hd('흥미'), hd(''), hd('불안'), hd('')] }];
        cells.forEach(function (c) {
          var i0 = K0.interestCtx[c], x0 = K0.anxietyCtx[c];
          rows3.push({ cells: [{ c: [t([{ t: CTXN[c], b: true }], { size: 17 })], va: 'CENTER', bd: { bottom: BD(K.line2, 4) } },
            { raw: BAR(i0 == null ? 0 : i0 / 100, 2400, K.g8, 140), m: [0, 60, 0, 60], va: 'CENTER', bd: { bottom: BD(K.line2, 4) } }, { c: [t([{ t: i0 == null ? '—' : String(i0), b: true, c: K.g8 }], { size: 17, align: 'RIGHT' })], va: 'CENTER', bd: { bottom: BD(K.line2, 4) } },
            { raw: BAR(x0 == null ? 0 : x0 / 100, 2400, 'C2562F', 140), m: [0, 60, 0, 60], va: 'CENTER', bd: { bottom: BD(K.line2, 4) } }, { c: [t([{ t: x0 == null ? '—' : String(x0), b: true, c: K.red }], { size: 17, align: 'RIGHT' })], va: 'CENTER', bd: { bottom: BD(K.line2, 4) } }] });
        });
        out.push(TBraw([1800, 2560, CW - 1800 - 2 * 2560 - 700, 2560, 700], rows3, { atomic: true }));
      }
    }
    return out;
  }

  /* ══════════ 부모님께 ══════════ */
  function parentBlocks(A, art) {
    var out = [];
    out.push(H3('과정을 짚는 칭찬 — 이 아이의 기록에서', { before: 0 }));
    WD.praise(A).forEach(function (s) {
      out.push(TB([CW], [{ cells: [{ c: [t([{ t: '“  ', c: K.gold, b: true, s: 28 }, { t: s, c: K.ink }, { t: '  ”', c: K.gold, b: true, s: 28 }], { size: 20, line: 330 })], fill: K.white,
        bd: { top: BD(K.g7, 6, D.BorderStyle.DASHED, 0), bottom: BD(K.g7, 6, D.BorderStyle.DASHED, 0), left: BD(K.g7, 6, D.BorderStyle.DASHED, 0), right: BD(K.g7, 6, D.BorderStyle.DASHED, 0) }, m: [110, 180, 110, 180] }] }], { atomic: true }));
      out.push(SP(100));
    });
    out.push(CAPT('«머리가 좋다»보다 «이 개념을 다른 문장으로 다시 풀어서 고쳤구나»처럼 과정을 짚는 말이 다음 노력으로 이어집니다(Hattie & Timperley, 2007). 사람 자체에 대한 칭찬·평가는 학습에 거의 도움이 되지 않았고, 피드백의 3분의 1 이상은 오히려 수행을 떨어뜨렸습니다(Kluger & DeNisi, 1996).', { before: 40 }));
    out.push(H3('피하면 좋은 말 → 바꿔 쓰는 말'));
    var say = [['머리가 좋네 / 머리가 나쁘네', '이 방법이 너한테 잘 통했구나'], ['다른 애들은 몇 점이래?', '지난번보다 무엇이 달라졌어?'], ['왜 이것도 몰라?', '어떻게 생각해서 그렇게 골랐어?'], ['오개념이 있다고 나왔네', '아직 점검해 볼 곳이 있대'], ['자신감만 넘치는구나', '자신 있는 걸 직접 맞혀 보면서 확인해 보자']];
    var rows = [];
    say.forEach(function (p, i) {
      rows.push({ cells: [
        { c: [t([{ t: p[0], c: '7A3418', strike: true }], { size: 19 })], fill: 'FBECE5', va: 'CENTER', m: [90, 140, 90, 160] },
        { c: [t([{ t: '→', c: K.goldInk, b: true }], { size: 22, align: 'CENTER' })], va: 'CENTER' },
        { c: [t([{ t: p[1], c: '124F31', b: true }], { size: 19 })], fill: K.okSoft, va: 'CENTER', m: [90, 140, 90, 160] }] });
      if (i < say.length - 1) rows.push({ cells: [{ span: 3, c: [] }], h: 80 });
    });
    out.push(TB([(CW - 600) / 2, 600, (CW - 600) / 2], rows, { atomic: true }));
    out.push(H3('함께 나눌 질문'));
    var qs = WD.questions(A), qrows = [];
    qs.forEach(function (q, i) {
      qrows.push({ cells: [{ c: [t([{ t: 'Q' + (i + 1), c: K.white, b: true }], { size: 20, align: 'CENTER' })], fill: K.g8, va: 'CENTER', m: [60, 0, 60, 0] },
        { c: [t(q, { size: 19, line: 300 })], va: 'CENTER', bd: { top: BD(K.line, 6), bottom: BD(K.line, 6), right: BD(K.line, 6) }, m: [90, 160, 90, 180] }] });
      if (i < qs.length - 1) qrows.push({ cells: [{ span: 2, c: [] }], h: 80 });
    });
    out.push(TB([800, CW - 800], qrows, { atomic: true }));
    out.push(SP(180));
    out.push(NOTE('<b>높은 자신감으로 틀린 개념은 혼낼 일이 아니라, 정확한 설명이 가장 효과를 내는 지점입니다.</b> «왜 그렇게 생각했어?»라고 추론을 먼저 들어 주시면, 아이가 스스로 어디서 어긋났는지 찾는 데 큰 도움이 됩니다.', { color: K.g8, fill: K.g0 }));
    return out;
  }

  /* ══════════ 부록 ══════════ */
  var REFS_MORE = [
    ['Shtulman, A., & Valcarcel, J. (2012). Scientific knowledge suppresses but does not supplant earlier intuitions. Cognition, 124(2), 209–215. https://doi.org/10.1016/j.cognition.2012.04.005', '서지 확인 · 요지는 2차 자료'],
    ['Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research, 77(1), 81–112. https://doi.org/10.3102/003465430298487', '서지·초록 확인'],
    ['Rawson, K. A., & Dunlosky, J. (2011). Optimizing schedules of retrieval practice for durable and efficient learning: How much is enough? Journal of Experimental Psychology: General, 140(3), 283–302. https://doi.org/10.1037/a0023956', '서지·초록 확인'],
    ['Schraw, G. (2009). A conceptual analysis of five measures of metacognitive monitoring. Metacognition and Learning, 4(1), 33–45. https://doi.org/10.1007/s11409-008-9031-3', '서지 확인 · 요지는 2차 자료'],
    ['Zimmerman, B. J. (2002). Becoming a self-regulated learner: An overview. Theory Into Practice, 41(2), 64–70. https://doi.org/10.1207/s15430421tip4102_2', '서지 확인'],
    ['Chen, C., Lee, S., & Stevenson, H. W. (1995). Response style and cross-cultural comparisons of rating scales among East Asian and North American students. Psychological Science, 6(3), 170–175. https://doi.org/10.1111/j.1467-9280.1995.tb00327.x', '서지·초록 확인']
  ];
  function appendixBlocks(A, art) {
    var out = [], R = A.record, M = A.metrics, Q = A.quality;
    var hd = function (x, al) { return { c: [t([{ t: x, c: K.white, b: true }], { size: 16, align: al })], fill: K.g8 }; };
    var bbF = function (i) { return { bd: { bottom: BD(K.line2, 4, D.BorderStyle.SINGLE, 0) }, fill: i % 2 ? 'FCFCFA' : K.white }; };
    out.push(H3('A. 지표 정의', { before: 0 }));
    var defs = [
      ['자신감 C', '느낀 자신감을 0~1로', '자신감 문항 응답 v(1 매우 그렇다 ~ 5 전혀 아니다) → C = (5 − v) / 4', A.conf.mean == null ? '—' : '평균 ' + fx(A.conf.mean)],
      ['첫 시도 정답률 p', '처음 본 문장을 바로 맞힌 비율', '회차마다 첫 응시 답안을 문항의 개념 코드·정답과 자리대로 맞댄 정답률(빈칸 = 못 맞힘)', pct(R.rate)],
      ['앎 지수 P*', '찍은 몫을 뺀 실제 앎', 'O/X는 찍어도 50%이므로 P* = max(0, 2p − 1) — 50% → 0, 100% → 1', R.rate == null ? '—' : fx(Math.max(0, 2 * R.rate - 1))],
      ['치우침 · 평균 차이', '느낌이 기록보다 높은지·얼마나 어긋나는지', '치우침 = 개념 평균 (C − P*)(양수 = 높여 봄) · 평균 차이 = 평균 |C − P*| · 자기 판단 정확도 = 1 − 평균 차이', sgn(M.bias) + ' · ' + fx(M.mad)],
      ['구별력 γ · ρ', '아는 것과 모르는 것을 가려내는 힘', '개념 사이 C와 p의 Goodman–Kruskal γ · Spearman ρ (개념 10개 이상일 때만)', M.gamma == null ? '보류' : 'γ ' + fx(M.gamma) + ' · ρ ' + fx(M.rho)],
      ['확신 오류 비율', '자신 있다던 것 가운데 흔들린 몫', '(C ≥ 0.75 이면서 기록 약함인 개념 수) / (C ≥ 0.75 인 개념 수)', pct(M.hce)],
      ['재시 교정률', '틀린 개념을 다음 재시에서 고친 비율', '첫 시도에 틀린 개념 중 다음 재시(다른 문장)에서 모두 맞힌 비율(재시 서명으로 셈)', pct(R.retakeRate)],
      ['후기 유지율', '배운 뒤 나중 시험에서도 맞힌 비율', '그 개념이 처음 나온 회차 뒤 누적 시험에서의 첫 시도 정답률', pct(R.reviewRate) + ' (지난 단원 전체)'],
      ['반복 막힘', '여러 번 같은 곳에서 막힘', '3회차 이상 묻고 절반 이상 틀린 개념(성적표 고질 규칙). 뒤로 계속 맞히면 «해소»', (R.chronic || []).length + '개']];
    var rows = [{ hdr: true, cells: [hd('지표 · 쉬운 풀이'), hd('정의'), hd('이 학생', 'RIGHT')] }];
    defs.forEach(function (d, i) { var s = bbF(i); rows.push({ cells: [
      { c: [t([{ t: d[0], b: true, c: K.g9 }], { size: 17, line: 265 }), t([{ t: d[1], c: K.goldInk }], { size: 15, line: 240 })], fill: s.fill, bd: s.bd },
      { c: [t(d[2], { size: 16, line: 255 })], fill: s.fill, bd: s.bd },
      { c: [t([{ t: d[3], b: true, c: K.g8 }], { size: 16, line: 255, align: 'RIGHT' })], fill: s.fill, bd: s.bd }] }); });
    out.push(TB([2500, CW - 4100, 1600], rows, { m: [70, 90, 70, 90] }));
    out.push(H3('B. 판정 구간 (제안값 — 문헌 표준 아님)'));
    var cuts = [
      ['기록 강함', '첫 시도 ≥ 85% 이고, 후기 문항이 2개 이상이면 후기 유지율도 ≥ 85%, 반복 막힘(미해소) 아님'],
      ['기록 약함', '첫 시도 < 70%, 또는 반복 막힘(미해소), 또는 틀린 회차 2번 이상에서 재시 교정률 < 50%'],
      ['기록 적음 · 잠정 · 직관 신호', '물은 문항 3개 미만은 판정 보류, 8개 미만은 «잠정» · 신호 = 오개념 문장 1·2(동의) 또는 맞는 직관 4·5(부정), 3은 «애매»'],
      ['자신감 높음 · 낮음', '높음: «매우 그렇다», 또는 «그렇다»이면서 학생 안 표준점수 z ≥ +0.5(응답 습관 보정) · 낮음: «보통» 이하, 또는 z ≤ −1.0 인 «그렇다» · «보통»이 절반을 넘으면 z ±0.5 우선(Chen 외, 1995)'],
      ['갈래 차례', '남은 오개념(신호 + 약함) → 과신(높음 + 약함) → 보강(중간·낮음 + 약함) → 숨은 실력(낮음 + 강함) → 강점(높음·중간 + 강함) → 관찰(기록 중간·적음, 신호 + 강함은 «잠복 직관»)'],
      ['보정 지표', 'Bias > +0.15 높여 봄, < −0.15 낮춰 봄 · 평균 차이 < 0.15 좋음, ≤ 0.25 보통 · γ ≥ 0.5 좋음, ≥ 0.2 보통 · 확신 오류 < 10% 신뢰할 만함, ≤ 25% 주의(Schraw, 2009의 지표 갈래)']];
    var rows2 = [{ hdr: true, cells: [hd('무엇'), hd('구간')] }];
    cuts.forEach(function (c, i) { var s = bbF(i); rows2.push({ cells: [{ c: [t([{ t: c[0], b: true, c: K.g9 }], { size: 17, line: 265 })], fill: s.fill, bd: s.bd }, { c: [t(c[1], { size: 16, line: 255 })], fill: s.fill, bd: s.bd }] }); });
    out.push(TB([2500, CW - 2500], rows2, { m: [70, 90, 70, 90] }));
    out.push(H3('C. 응답 품질 점검 결과'));
    if (A.hasSurvey) {
      var qs = [['직선 응답', '표준편차 ' + fx(Q.sd) + ' · 연속 ' + Q.maxRun, Q.flags.indexOf('straight') >= 0], ['묵종', '동의율 ' + pct(Q.agreeRate), Q.flags.indexOf('acquiescence') >= 0], ['맞는 직관 부정', '평균 ' + fx(Q.aTrue, 1), Q.flags.indexOf('reversed') >= 0],
        ['중간점 쏠림', '«보통» ' + pct(Q.midRate), Q.flags.indexOf('midpoint') >= 0], ['빠른 응답', Q.ms ? Math.round(Q.ms / 60000) + '분' : '시간 기록 없음', Q.flags.indexOf('fast') >= 0], ['빈 응답', Q.missing + '문항', Q.flags.indexOf('incomplete') >= 0]];
      var g3 = [Math.floor((CW - 240) / 3), 120, Math.floor((CW - 240) / 3), 120, CW - 240 - 2 * Math.floor((CW - 240) / 3)], qrows = [];
      [qs.slice(0, 3), qs.slice(3)].forEach(function (grp, gi) {
        var cs = [];
        grp.forEach(function (x, i) { if (i) cs.push({ c: [] }); cs.push({ c: [t([{ t: x[0] + '  ', b: true }, { t: x[2] ? '걸림' : '통과', b: true, c: x[2] ? K.red : K.ok }], { size: 17 }), t([{ t: x[1], c: K.ink2 }], { size: 16 })], fill: x[2] ? K.redSoft : K.g0, bd: { left: BD(x[2] ? 'C2562F' : '1F7A4D', 24, D.BorderStyle.SINGLE, 0) }, m: [70, 100, 70, 130] }); });
        qrows.push({ cells: cs });
        if (!gi) qrows.push({ cells: [{ span: 5, c: [] }], h: 90 });
      });
      out.push(TB(g3, qrows, { atomic: true }));
      out.push(CAPT('기준 — 직선: 표준편차 < 0.5 또는 같은 값 15연속 · 묵종: 직관 동의율 > 80%이면서 오개념·맞는 직관 모두 동의 · 맞는 직관 부정: 평균 ≥ 4 · 중간점: «보통» > 50% · 빠른 응답: 5분 안 · 빈 응답: 10문항 초과. ' + (Q.flags.length ? '걸린 항목에 따라 ' + WD.qualityText(Q) : '모두 통과해 설문 응답을 그대로 판정에 썼습니다.')));
    } else out.push(NOTE('설문 응답이 없어 점검하지 않았습니다.', { color: K.line }));
    out.push(H3('D. 방법상 한계'));
    ['설문은 18주 결과를 받은 <b>뒤에</b> 했습니다 — 자신감에는 기억하는 기록이 섞여 있습니다. 자신감·직관은 개념마다 <b>한 문항</b>이라 «진단»이 아니라 «신호»라고 씁니다.',
      '개념마다 물은 문항 수가 다릅니다(적게는 1~2개). 8개 미만은 «잠정», 3개 미만은 판정을 미뤘습니다.',
      '같은 개념의 재시 문장이 비슷하면 표면 단서로 맞혔을 가능성이 남습니다. 구간 수치는 제안값이며 첫 학기 자료의 분포를 보고 다시 맞춥니다.',
      '«성취가 낮을수록 과신한다»는 집단 그래프는 무작위 자료에서도 비슷하게 나와 개인 해석의 근거로 쓰지 않았습니다. 모의시험·학습진단은 선생님이 확인한 짝만 붙였고, 다른 학생과 견주는 숫자는 어느 곳에서 오든 싣지 않았습니다.'
    ].forEach(function (s) { out.push(P([{ t: '◆  ', c: K.gold, s: 15 }, { html: s }], { size: 18, line: 290, after: 70, indL: 300, hang: 300 })); });
    out.push(H3('E. 참고문헌'));
    var refs = WD.REFS.concat(REFS_MORE);
    refs.forEach(function (r, i) {
      out.push(P([{ t: '[' + (i + 1) + ']  ', c: K.g8, b: true }, { t: r[0].replace('https://doi.org/', 'doi:') }, { t: '  · ' + r[1], c: K.goldInk, b: true }], { size: 15, line: 235, after: 60, indL: 520, hang: 520, c: K.ink2 }));
    });
    out.push(CAPT('확인 표기 — «서지·초록 확인»: 저자·연도·제목·학술지·권호·쪽·DOI와 초록을 직접 확인 · «서지 확인»: 서지만 확인 · «요지는 2차 자료»: 원문 대신 인용 논문·기관 요약으로 요지를 확인.', { before: 60 }));
    /* 마무리 — 로고 · 연락 */
    out.push(SP(200));
    var closing = [];
    if (art.logo) closing.push(im(art.logo, 90, { align: 'CENTER' }));
    closing.push(t([{ t: BRAND, c: K.g8, b: true }], { size: 22, align: 'CENTER', before: 60, sp: 10 }));
    closing.push(t([{ t: '보고서에 궁금한 점이 있으시면 조준모 선생님께 편하게 물어 주세요. 이 보고서는 학생 한 명을 위한 개인 자료입니다.', c: K.mut }], { size: 16, align: 'CENTER', before: 40 }));
    out.push(TB([CW], [{ cells: [{ c: closing, bd: { top: BD(K.goldLine, 8, D.BorderStyle.SINGLE, 0) }, m: [200, 0, 0, 0] }] }], { atomic: true }));
    return out;
  }

  /* ══════════ 머리글 · 바닥글 · 문서 ══════════ */
  function floatImg(data, type, wpx, hpx, xTw, yTw, behind) {
    return new D.ImageRun({ type: type, data: data, transformation: { width: wpx, height: hpx },
      floating: { horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: Math.round(xTw * 635) }, verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: Math.round(yTw * 635) },
        behindDocument: !!behind, allowOverlap: true, wrap: { type: D.TextWrappingType.NONE } } });
  }
  function headers(art, name) {
    var tiny = { before: 0, after: 0, line: 20, lineRule: D.LineRuleType.EXACT };
    var coverKids = art.cover ? [floatImg(art.cover, 'jpg', 794, 1123, 0, 0, true)] : [];
    var first = new D.Header({ children: [new D.Paragraph({ spacing: tiny, children: coverKids })] });
    var kids = [];
    if (art.frame) kids.push(floatImg(art.frame, 'png', 794, 1123, 0, 0, true));
    var logo = art.logo;
    if (logo) { var lhpx = 15, lwpx = Math.round(lhpx * logo.w / logo.h); kids.push(floatImg(logo.data, 'png', lwpx, lhpx, PG.side, PG.header + 40, false)); }
    var lwTw = logo ? Math.round(15 * logo.w / logo.h * 15) + 140 : 0;
    var def = new D.Header({ children: [
      new D.Paragraph({ spacing: tiny, children: kids }),
      new D.Paragraph({ spacing: { before: 0, after: 0, line: 300, lineRule: D.LineRuleType.EXACT }, indent: { left: lwTw }, tabStops: [{ type: D.TabStopType.RIGHT, position: CW - lwTw }],
        border: { bottom: BD(K.line, 6, D.BorderStyle.SINGLE, 5) },
        children: [new D.TextRun({ text: BRAND, bold: true, color: K.g8, size: 16, font: FONT, characterSpacing: 10 }), new D.TextRun({ text: '\t' + TITLE + (name ? ' · ' + name : ''), color: K.mut, size: 16, font: FONT })] })] });
    return { first: first, default: def };
  }
  function footers(batch) {
    var first = new D.Footer({ children: [new D.Paragraph({ children: [] })] });
    var def = new D.Footer({ children: [new D.Paragraph({ spacing: { before: 0, after: 0, line: 300, lineRule: D.LineRuleType.EXACT },
      tabStops: [{ type: D.TabStopType.CENTER, position: Math.round(CW / 2) }, { type: D.TabStopType.RIGHT, position: CW }], border: { top: BD(K.line, 6, D.BorderStyle.SINGLE, 5) },
      children: [new D.TextRun({ text: BRAND, bold: true, color: K.g8, size: 16, font: FONT, characterSpacing: 10 }),
        new D.TextRun({ text: '\t설문은 하루의 느낌, 기록은 18주의 행동입니다\t', color: K.mut, size: 15, font: FONT }),
        new D.TextRun({ children: ['쪽 ', D.PageNumber.CURRENT, ' / ', batch ? D.PageNumber.TOTAL_PAGES_IN_SECTION : D.PageNumber.TOTAL_PAGES], bold: true, color: K.g8, size: 16, font: FONT })] })] });
    return { first: first, default: def };
  }

  function fileName(name, n) {
    var base = '화학1 돌아보기 진단 보고서 - ' + (n > 1 ? (name || '반 전체') + '(' + n + '명)' : (name || '학생'));
    return base.replace(/[\\/:*?"<>|]+/g, '') + '.docx';
  }

  /* list: [{A, name, school, year, surveyDate, bank, today}] · opt: {name(반 이름)} */
  async function build(list, opt) {
    opt = opt || {};
    D = await ensureLib();
    var art = await loadArt();
    var batch = list.length > 1 || !!opt.batch;
    var sections = [], plans = [];
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      var charts = await makeCharts(st.A);
      var one = student(st, art, charts, i, batch);
      var hd = headers(art, st.name), ft = footers(batch);
      plans.push({ name: st.name, pages: one.plan.total, toc: one.plan.pages, fill: one.plan.fill, brk: one.plan.brk });
      sections.push({ properties: { titlePage: true, type: i ? D.SectionType.NEXT_PAGE : undefined,
        page: { size: { width: PG.w, height: PG.h }, margin: { top: PG.top, bottom: PG.bottom, left: PG.side, right: PG.side, header: PG.header, footer: PG.footer, gutter: 0 }, pageNumbers: { start: 1 } } },
        headers: hd, footers: ft, children: one.els });
    }
    var doc = new D.Document({
      creator: BRAND, title: TITLE + (list.length === 1 && list[0].name ? ' — ' + list[0].name : ''), description: '화학1 18회 기록 × 마무리 설문 × 지금까지의 모든 시험 진단 보고서',
      styles: { default: { document: { run: { font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT }, size: 20, color: K.ink }, paragraph: { spacing: { line: 310, lineRule: D.LineRuleType.EXACT } } } } },
      sections: sections });
    var blob = await D.Packer.toBlob(doc);
    return { blob: blob, fn: fileName(list.length === 1 ? list[0].name : opt.name, list.length), plan: plans };
  }
  function save(blob, fn) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fn; document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 1500);
  }
  /* 화면 단추 하나 — 누르면 만들고 내려받는다. 단추 글자로 진행을 알린다. */
  async function download(btn, list, opt) {
    var label = btn ? btn.textContent : '';
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Word 만드는 중…'; }
      var out = await build(list, opt);
      save(out.blob, out.fn);
      if (btn) btn.textContent = '저장했습니다 ✓';
      root.__SP_DOCX = { fn: out.fn, size: out.blob.size, plan: out.plan };
      setTimeout(function () { if (btn) { btn.textContent = label; btn.disabled = false; } }, 1800);
      return out;
    } catch (e) {
      if (btn) { btn.textContent = 'Word 만들기 실패 — 다시 눌러 주세요'; btn.disabled = false; }
      root.__SP_DOCX_ERR = String(e && e.stack || e);
      throw e;
    }
  }

  root.SurveyDocx = { build: build, save: save, download: download, fileName: fileName, kpiList: kpiList, PG: PG };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SurveyDocx;
})(typeof self !== 'undefined' ? self : this);
