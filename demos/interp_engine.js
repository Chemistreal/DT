/* ============================================================
   interp_engine.js  ·  해설 선택 엔진 (순수 로직)
   역할: 채점 결과 → 개념별 집계 → 심각도 산정 → 표시할 개념 선택
   콘텐츠(interp_content)·렌더(interp_render)와 완전히 분리.
   배포된 report.html/admin.html을 건드리지 않는다. 별도 골격.
   node에서도 동작(테스트 가능).
   ============================================================ */
(function (g) {
  // 난이도(lvl) 가중: 어려운 문항을 틀릴수록 진단 가중을 약간 더 준다(조정 가능)
  var LVLW = { 1: 1.0, 2: 1.3, 3: 1.6 };

  // 결과를 개념 단위로 집계.
  // result: [{ c:conceptId, ok:Boolean, lvl:1|2|3 }]
  // content: interp_content (개념 메타). prereq: 선후관계 DAG(선택, 중심성 가중에 사용).
  function aggregate(result, content, prereq) {
    content = content || {};
    var by = {};
    (result || []).forEach(function (r) {
      if (r == null || r.c == null) return;
      var e = by[r.c] || (by[r.c] = { c: r.c, missed: 0, total: 0, lvlSum: 0 });
      e.total++;
      if (!r.ok) { e.missed++; e.lvlSum += (LVLW[r.lvl] || 1.3); }
    });
    // 단원 중심성: 이 단원에 의존하는 단원 수(많을수록 기초적·파급 큼)
    var depCount = {};
    if (prereq) {
      Object.keys(prereq).forEach(function (course) {
        var dag = prereq[course] || {};
        Object.keys(dag).forEach(function (u) {
          (dag[u] || []).forEach(function (p) { depCount[p] = (depCount[p] || 0) + 1; });
        });
      });
    }
    return Object.keys(by).map(function (c) {
      var e = by[c], meta = content[c] || {};
      var central = 1 + 0.15 * (depCount[meta.unit] || 0);
      e.severity = e.lvlSum * central;            // 핵심: 틀린 수×난이도×중심성
      e.name = meta.name || c;
      e.unit = meta.unit || '';
      e.course = meta.course || '';
      return e;
    });
  }

  // 표시할 개념 선택: 틀린 개념을 심각도 내림차순으로 상위 N개.
  // opts: { minMissed:1, top:8 }
  function select(agg, opts) {
    opts = opts || {};
    var min = opts.minMissed || 1, top = opts.top || 8;
    return (agg || [])
      .filter(function (e) { return e.missed >= min; })
      .sort(function (a, b) { return b.severity - a.severity || b.missed - a.missed; })
      .slice(0, top);
  }

  // 편의: 결과 → 선택까지 한 번에
  function interpret(result, content, prereq, opts) {
    return select(aggregate(result, content, prereq), opts);
  }

  g.InterpEngine = { aggregate: aggregate, select: select, interpret: interpret, LVLW: LVLW };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).InterpEngine;
