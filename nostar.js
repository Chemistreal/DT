/* ============================================================
   화면에 «**» 가 글자 그대로 나가지 않게 한다 (선생님 2026-10-04 — «** 사용 금지»).

   개념 문장(appdata · 회차 파일 · 은행)은 강조할 곳을 **…** 로 표시해 둔다.
   md() 를 거치는 자리는 굵은 글씨가 되지만, 거치지 않고 글자 그대로 붙는
   자리가 하나라도 있으면 학부모 화면에 별표가 찍힌다(실제로 찍혔다:
   «첫 응시 점수보다 **재시로 무엇을 잡았는지**가»).
   자리마다 고치는 것으로는 다음에 생길 자리를 못 막으므로, 화면에 붙은
   글자 마디(text node)에서 «**» 를 지운다. 그린 뒤에 붙는 것도 지켜본다.
   굵은 글씨(<b>)로 바뀐 것은 이미 별표가 없으므로 건드리지 않는다.
   ============================================================ */
(function () {
  'use strict';
  var RE = /\*\*/g, SKIP = { SCRIPT: 1, STYLE: 1 };
  function fix(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      if (node.nodeValue.indexOf('**') >= 0 && !(node.parentNode && SKIP[node.parentNode.nodeName])) node.nodeValue = node.nodeValue.replace(RE, '');
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1 && SKIP[node.nodeName]) return;
    var w = document.createTreeWalker(node, 4, null), t, list = [];
    while ((t = w.nextNode())) if (t.nodeValue.indexOf('**') >= 0) list.push(t);
    list.forEach(function (x) { if (!(x.parentNode && SKIP[x.parentNode.nodeName])) x.nodeValue = x.nodeValue.replace(RE, ''); });
  }
  function start() {
    fix(document.body);
    if (document.title.indexOf('**') >= 0) document.title = document.title.replace(RE, '');
    if (!window.MutationObserver) return;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'characterData') fix(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) fix(m.addedNodes[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  window.unstar = function (s) { return String(s == null ? '' : s).replace(RE, ''); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
