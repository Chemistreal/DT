/* ============================================================
   DT PDF 엔진 · 시험지/해설 원클릭 .pdf 생성 (정시 + 재시 3버전)
   - jsPDF + html2canvas 를 클릭 시에만 지연 로드
   - 브라우저 렌더를 이미지로 캡처 -> 한글/화학식(H₂O, Δ, ⇌, √ 등) 정확
   - 문항 단위로 페이지를 나눠 문항이 페이지 경계에서 잘리지 않음
   전역: window.DTPDF.make(opts)
     opts = { course, round, kind:'exam'|'sol', variant:'jeongsi'|1|2|3,
              base?(경로 프리픽스), onstep?(msg=>{}) }
   ============================================================ */
(function () {
  var JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var H2C_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var COURSE_KO = { ch1: '화학Ⅰ', ch2: '화학Ⅱ', gc: '일반화학' };
  var _loading = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var el = document.createElement('script');
      el.src = src; el.onload = res; el.onerror = function () { rej(new Error('load fail: ' + src)); };
      document.head.appendChild(el);
    });
  }
  function ensureLibs() {
    if (window.jspdf && window.html2canvas) return Promise.resolve();
    if (_loading) return _loading;
    _loading = (async function () {
      if (!window.jspdf) await loadScript(JS_URL);
      if (!window.html2canvas) await loadScript(H2C_URL);
    })();
    return _loading;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pad2(n) { n = Number(n); return (n < 10 ? '0' : '') + n; }

  async function fetchRound(course, round, base) {
    var url = (base || '') + 'appdata/round_' + course + '_' + pad2(round) + '.json';
    var r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('회차 데이터를 불러오지 못했습니다 (' + url + ')');
    return r.json();
  }

  // variant -> 문항 배열 + 라벨
  function pickItems(rd, variant) {
    if (variant === 'jeongsi' || variant == null) {
      return { items: (rd.jeongsi && rd.jeongsi.items) || [], label: '정시' };
    }
    var v = Number(variant);
    var bank = (rd.retakeC || []).find(function (b) { return Number(b.v) === v; });
    return { items: (bank && bank.items) || [], label: '재시 ' + v };
  }

  // 한 문항의 화면 요소 만들기 (kind별)
  function itemNode(idx, it, kind) {
    var row = document.createElement('div');
    row.className = 'dtp-q';
    var num = '<span class="dtp-n">' + (idx + 1) + '</span>';
    if (kind === 'sol') {
      var ans = it.a === 'O' ? 'O' : 'X';
      var body = '<div class="dtp-body">'
        + '<div class="dtp-s">' + esc(it.s) + '</div>'
        + '<div class="dtp-meta"><span class="dtp-ans dtp-' + (ans === 'O' ? 'o' : 'x') + '">정답 ' + ans + '</span>'
        + (it.u ? '<span class="dtp-u">' + esc(it.u) + '</span>' : '')
        + (it.mis ? '<span class="dtp-mis">' + esc(it.mis) + '</span>' : '') + '</div>'
        + (it.f && it.f !== it.s ? '<div class="dtp-fix"><b>바로잡기</b> ' + esc(it.f) + '</div>' : '')
        + (it.w ? '<div class="dtp-why"><b>해설</b> ' + esc(it.w) + '</div>' : '')
        + '</div>';
      row.innerHTML = num + body;
    } else {
      row.innerHTML = num + '<div class="dtp-body"><div class="dtp-s">' + esc(it.s) + '</div></div>'
        + '<span class="dtp-ox">O &nbsp; X</span>';
    }
    return row;
  }

  function headerNode(rd, vlabel, kind, pageNo, first) {
    var h = document.createElement('div');
    h.className = 'dtp-head';
    var title = (COURSE_KO[rd.course] || rd.course) + ' · 누적 OX ' + rd.round + '회 · ' + vlabel
      + ' · ' + (kind === 'sol' ? '해설 · 공부자료' : '시험지');
    var right = '<span class="dtp-hr">조준모의고사 · 다원교육 영재관</span>';
    var line1 = '<div class="dtp-h1"><span>' + esc(title) + '</span>' + right + '</div>';
    var line2 = '';
    if (first && kind === 'exam') {
      line2 = '<div class="dtp-h2">이름 <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>'
        + ' &nbsp; 학교 <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>'
        + ' &nbsp; 각 문장이 옳으면 O, 틀리면 X. 60문항 · 합격 ' + (((rd.scoring || {}).pass) || 80) + '점.</div>';
    } else if (first && kind === 'sol') {
      line2 = '<div class="dtp-h2">각 문항의 정답과 해설입니다. 틀린 문항은 바로잡기 문장으로 다시 익히세요.</div>';
    }
    h.innerHTML = line1 + line2;
    return h;
  }

  // 오프스크린 측정용 컨테이너
  function makeStage() {
    var st = document.createElement('div');
    st.className = 'dtp-stage';
    st.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    document.body.appendChild(st);
    return st;
  }

  // 문항을 페이지로 분배 (측정 기반) -> 페이지별 DOM 배열
  function paginate(stage, rd, vlabel, kind, items) {
    var PAGE_H = 1000; // 760px 폭 기준 A4 1장에 담는 콘텐츠 높이(px, 여백 포함 보수적)
    var pages = [], pageNo = 1;
    function newPage(first) {
      var p = document.createElement('div');
      p.className = 'dtp-page';
      p.appendChild(headerNode(rd, vlabel, kind, pageNo, first));
      var list = document.createElement('div');
      list.className = 'dtp-list';
      p.appendChild(list);
      stage.appendChild(p);
      pages.push({ el: p, list: list });
      return list;
    }
    var list = newPage(true);
    for (var i = 0; i < items.length; i++) {
      var node = itemNode(i, items[i], kind);
      list.appendChild(node);
      if (list.parentNode.offsetHeight > PAGE_H && list.children.length > 1) {
        list.removeChild(node);       // 넘치면 이 문항은 다음 페이지로
        pageNo++;
        list = newPage(false);
        list.appendChild(node);
      }
    }
    // 페이지 푸터(번호)
    for (var k = 0; k < pages.length; k++) {
      var f = document.createElement('div');
      f.className = 'dtp-foot';
      f.textContent = (k + 1) + ' / ' + pages.length;
      pages[k].el.appendChild(f);
    }
    return pages;
  }

  function ensureStyle() {
    if (document.getElementById('dtp-style')) return;
    var s = document.createElement('style');
    s.id = 'dtp-style';
    s.textContent = [
      '.dtp-stage *{box-sizing:border-box;font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
      '.dtp-page{width:760px;padding:40px 46px 30px;background:#fff;color:#141414;position:relative}',
      '.dtp-head{border-bottom:2px solid #141414;padding-bottom:9px;margin-bottom:12px}',
      '.dtp-h1{display:flex;align-items:baseline;justify-content:space-between;gap:12px}',
      '.dtp-h1>span:first-child{font-size:18px;font-weight:800}',
      '.dtp-hr{font-size:11px;color:#777;white-space:nowrap}',
      '.dtp-h2{margin-top:7px;font-size:12.5px;color:#555;line-height:1.5}',
      '.dtp-h2 u{color:#141414}',
      '.dtp-list{}',
      '.dtp-q{display:flex;gap:11px;padding:8px 2px;border-bottom:1px solid #eee;font-size:14px;line-height:1.62;page-break-inside:avoid}',
      '.dtp-n{min-width:26px;font-weight:800;color:#0B6E6E;text-align:right}',
      '.dtp-body{flex:1}',
      '.dtp-s{}',
      '.dtp-ox{white-space:nowrap;color:#999;font-weight:700;letter-spacing:1px;align-self:flex-start;margin-top:1px}',
      '.dtp-meta{margin-top:5px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11.5px}',
      '.dtp-ans{font-weight:800;border-radius:4px;padding:1px 7px}',
      '.dtp-o{background:#E7F5EC;color:#1B8A4C}.dtp-x{background:#FBEBE9;color:#C0392B}',
      '.dtp-u{color:#888;border:1px solid #e2e2e2;border-radius:4px;padding:1px 6px}',
      '.dtp-mis{color:#A9853C}',
      '.dtp-fix{margin-top:5px;font-size:12.5px;color:#333;background:#FAFAF7;border-left:3px solid #C0392B;border-radius:5px;padding:5px 9px}',
      '.dtp-why{margin-top:5px;font-size:12.5px;color:#444;line-height:1.55}',
      '.dtp-fix b,.dtp-why b{color:#0B6E6E;font-weight:800;margin-right:4px}',
      '.dtp-foot{position:absolute;right:46px;bottom:12px;font-size:10.5px;color:#aaa}'
    ].join('\n');
    document.head.appendChild(s);
  }

  async function make(opts) {
    opts = opts || {};
    var step = opts.onstep || function () {};
    step('준비 중\u2026');
    ensureStyle();
    await ensureLibs();
    var rd, picked;
    if (opts.items) {
      // 직접 문항 배열(예: 재생성한 개인화 재시)을 받는 경로
      rd = { course: opts.course, round: opts.round, scoring: opts.scoring || { pass: 80 } };
      picked = { items: opts.items, label: opts.vlabel || '재시' };
    } else {
      step('데이터 불러오는 중\u2026');
      rd = await fetchRound(opts.course, opts.round, opts.base);
      picked = pickItems(rd, opts.variant);
    }
    if (!picked.items.length) throw new Error('이 버전의 문항이 없습니다.');

    var stage = makeStage();
    try {
      step('문서 구성 중\u2026');
      var pages = paginate(stage, rd, picked.label, opts.kind, picked.items);

      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF('p', 'mm', 'a4');
      var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      for (var i = 0; i < pages.length; i++) {
        step('페이지 렌더 중\u2026 (' + (i + 1) + '/' + pages.length + ')');
        var canvas = await window.html2canvas(pages[i].el, { scale: 2, backgroundColor: '#ffffff', logging: false });
        var imgW = pw, imgH = canvas.height * pw / canvas.width;
        var img = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) pdf.addPage();
        // 세로가 A4보다 길면(드문 경우) 그 페이지만 축소해 한 장에 맞춤
        var y = 0, w = imgW, hh = imgH;
        if (imgH > ph) { var sc = ph / imgH; w = imgW * sc; hh = ph; }
        pdf.addImage(img, 'JPEG', (pw - w) / 2, y, w, hh);
      }
      var fname = opts.fname || ((COURSE_KO[rd.course] || rd.course) + '_' + rd.round + '회_'
        + (picked.label.replace(/\s+/g, '')) + '_' + (opts.kind === 'sol' ? '해설' : '시험지') + '.pdf');
      if (opts.output === 'blob') { step(''); return { blob: pdf.output('blob'), fname: fname }; }
      step('저장 중\u2026');
      pdf.save(fname);
      step('');
      return fname;
    } finally {
      if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    }
  }

  // 버튼에서 바로 호출: 진행 상태를 버튼 라벨로 표시하고 완료/실패 처리
  async function run(btn, opts) {
    if (btn && btn.dataset && btn.dataset.busy === '1') return;
    var orig = btn ? btn.textContent : '';
    if (btn) { btn.dataset.busy = '1'; btn.classList.add('is-busy'); }
    try {
      await make(Object.assign({}, opts, { onstep: function (m) { if (btn) btn.textContent = m || orig; } }));
      if (btn) { btn.textContent = '\u2713 저장됨'; setTimeout(function () { btn.textContent = orig; btn.classList.remove('is-busy'); btn.dataset.busy = '0'; }, 1400); }
    } catch (e) {
      if (btn) { btn.textContent = orig; btn.classList.remove('is-busy'); btn.dataset.busy = '0'; }
      alert('PDF 생성 실패: ' + (e && e.message ? e.message : e));
    }
  }

  function ensureBtnStyle() {
    if (document.getElementById('dtpdf-btn-style')) return;
    var s = document.createElement('style'); s.id = 'dtpdf-btn-style';
    s.textContent = [
      '.dtpdf-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--teal,#0B6E6E);color:var(--teal-d,#0A5A5A);background:#fff;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}',
      '.dtpdf-btn:hover{background:rgba(11,110,110,.07)}',
      '.dtpdf-btn.sol{border-color:#A9853C;color:#8a6a2f}',
      '.dtpdf-btn.sol:hover{background:rgba(169,133,60,.08)}',
      '.dtpdf-btn.is-busy{opacity:.7;cursor:progress}',
      '.dtpdf-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}'
    ].join('\n');
    document.head.appendChild(s);
  }
  ensureBtnStyle();

  window.DTPDF = { make: make, run: run };
})();
