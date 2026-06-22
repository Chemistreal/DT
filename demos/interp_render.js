/* ============================================================
   interp_render.js  ·  해설 렌더 (표시 전용)
   역할: 선택된 개념 + 콘텐츠 → 성적표 해설 HTML 블록
   로직(엔진)·콘텐츠와 분리. 표시 방식만 바꾸려면 이 파일만 수정.
   ============================================================ */
(function (g) {
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function nz(s) { return s != null && String(s).trim() !== ''; }

  // 개념 1개 블록.
  // 우선순위: 저작된 dx(진단 서술) > 자동 시드 mis(교정 포인트 목록)
  function block(e, content) {
    var meta = (content || {})[e.c] || {};
    var h = '<div class="ib">'
      + '<div class="ibh">'
      + (nz(e.unit) ? '<span class="ibu">' + esc(e.unit) + '</span>' : '')
      + '<b class="ibn">' + esc(e.name) + '</b>'
      + '<span class="ibm">' + e.missed + '/' + e.total + ' 틀림</span>'
      + '</div>';
    if (nz(meta.dx)) {
      h += '<p class="ibdx">' + esc(meta.dx) + '</p>';
    } else {
      var mis = (meta.mis || []).slice(0, 4);
      if (mis.length) {
        h += '<div class="ibmis"><div class="ibcap">교정 포인트</div>'
          + mis.map(function (m) { return '<div class="ibrow">' + esc(m) + '</div>'; }).join('')
          + '</div>';
      }
    }
    if (nz(meta.fix))  h += '<div class="ibfix"><span>보강</span> ' + esc(meta.fix) + '</div>';
    if (nz(meta.cite)) h += '<div class="ibcite">' + esc(meta.cite) + '</div>';
    return h + '</div>';
  }

  // 선택 목록 전체 → 해설 섹션
  function render(selected, content, title) {
    if (!selected || !selected.length) return '';
    return '<section class="interp"><h2 class="ith">' + esc(title || '다시 볼 개념 · 해설') + '</h2>'
      + selected.map(function (e) { return block(e, content); }).join('')
      + '</section>';
  }

  g.InterpRender = { render: render, block: block };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).InterpRender;
