/* ============================================================
   「화학1 돌아보기」 인쇄 보고서 — 바깥 기록 잇기 (survey_sources.js)
   선생님 결정(2026-10-04): 인쇄 보고서는 **선생님 화면에서만** 세 곳을 합친다.
     DT    이 저장소 시트(관리자 읽기)
     exam  파이널·모의시험(KMChC·JMChC·USNCO …) — 앱스크립트 ?action=all (JSONP · ADMIN_TOKEN 이 켜져 있으면 token)
           문항 정답·영역·유형은 공개 파일 ../exam/exams.json · answers/<id>.json · cohort/baseline.json
     KMChC 화학 정밀 학습진단 — 앱스크립트 ?action=names · ?action=get&id= (JSONP) · 문항 ../KMChC/items.json
   공개 개인 링크(survey_report.html)는 DT 만 쓴다 — 이 파일을 부르지 않는다.
   서버(앱스크립트 세 개)는 바꾸지 않는다. 불러오기가 실패하면 그 자료만 «불러오지 못함».

   ■ 누가 같은 학생인가 — exam/hub.html 의 normName · justName · normSchool · schoolAkin · normGrade 를
     글자 그대로 옮겼다(그쪽을 고치면 여기도 같이 고친다).
       exam   이름 + 학교(꼬리 떼고, 종류가 다르면 다른 학교) + 학년(한쪽이 비면 따지지 않음)
       KMChC  학교 열이 없다 — 같은 이름이 **하나뿐일 때만** 확실로 본다(hub mergeRosters 와 같은 원칙).
     확실(sure) · 애매(maybe) · 없음(none). 애매는 **붙이지 않은 채로** 선생님이 고르게 둔다 —
     기계가 골라 붙이면 남의 성적이 남의 이름 밑에 들어간다.

   ■ 순수 함수(짝짓기·어댑터)는 Node 에서도 돈다. 불러오기(load*)는 브라우저에서만.
   ============================================================ */
(function (root) {
  'use strict';

  var EP = {
    exam: 'https://script.google.com/macros/s/AKfycbxGmSCkip0cQCyOH_JA2SiAMSxri00XObLmHyXlyXwxhG7u7w-x0FH02VN4DQySiUsv9Q/exec',
    km: 'https://script.google.com/macros/s/AKfycbxdD_pKlNZaHyce2mUsDcmTspMW4uh--wOr3MggvDABEDs7n64re6DLYEVOlh8ANE9-/exec'
  };
  var BASE = { exam: '../exam/', km: '../KMChC/' };

  /* ── exam/hub.html 에서 옮긴 이름표 규칙 ── */
  function normName(s) { return String(s == null ? '' : s).replace(/\s+/g, '').trim(); }
  var SCHOOL_TAIL = /^(.+?)[\s·,\/(\[]+([가-힣A-Za-z]{2,10}(?:초|중|고)(?:등학교|학교)?)[\)\]]?\s*$/;
  function justName(v) {
    var s = String(v == null ? '' : v).trim(), m = SCHOOL_TAIL.exec(s);
    if (!m) return s;
    var nm = m[1].trim();
    return nm.length < 2 ? s : nm;
  }
  function normSchool(s) {
    return String(s == null ? '' : s).replace(/\s+/g, '').replace(/(중학교|고등학교|초등학교)$/, function (m) { return m[0]; }).trim();
  }
  function normGrade(s) { var m = String(s == null ? '' : s).match(/\d+/); return m ? m[0] : ''; }
  function schoolCore(s) { return normSchool(s).replace(/(중|고|초)$/, ''); }
  function schoolType(s) { var m = normSchool(s).match(/(중|고|초)$/); return m ? m[1] : ''; }
  function schoolAkin(a, b) {
    var x = schoolCore(a), y = schoolCore(b);
    if (!x || !y) return true;
    if (x !== y) return false;
    var ta = schoolType(a), tb = schoolType(b);
    return !ta || !tb || ta === tb;
  }
  function gradeOk(a, b) { var x = normGrade(a), y = normGrade(b); return !x || !y || x === y; }

  /* ── 짝짓기 ──
     students: [{key, name, school, year}] (DT 설문 학생) · examRows: ?action=all 의 rows · kmList: ?action=names 의 students
     돌려주는 것: { [key]: { exam:{status, pick, options:[{pid,name,school,grade,n,why}]}, km:{status, pick, options:[{id,name,grade,ts}]} } } */
  function examPeople(rows) {
    var by = {};
    (rows || []).forEach(function (r) {
      var nm = normName(justName(r.name)); if (!nm) return;
      var pid = nm + '|' + normSchool(r.school) + '|' + normGrade(r.grade);
      var o = by[pid] || (by[pid] = { pid: pid, name: justName(r.name), school: String(r.school || '').trim(), grade: normGrade(r.grade), n: 0, exams: {} });
      o.n++; o.exams[r.examId] = 1;
    });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  function matchAll(students, examRows, kmList) {
    var people = examPeople(examRows), out = {};
    var dtByName = {};
    (students || []).forEach(function (s) { var n = normName(justName(s.name)); dtByName[n] = (dtByName[n] || 0) + 1; });
    var kmByName = {};
    (kmList || []).forEach(function (k) { var n = normName(justName(k.name)); if (n) (kmByName[n] || (kmByName[n] = [])).push(k); });
    (students || []).forEach(function (s) {
      var nm = normName(justName(s.name)), res = { exam: { status: 'none', pick: null, options: [] }, km: { status: 'none', pick: null, options: [] } };
      /* exam */
      var cand = people.filter(function (p) { return normName(p.name) === nm; });
      var akin = cand.filter(function (p) { return schoolAkin(p.school, s.school) && gradeOk(p.grade, s.year); });
      cand.forEach(function (p) {
        var why = !schoolAkin(p.school, s.school) ? '학교가 다름' : !gradeOk(p.grade, s.year) ? '학년이 다름' : (!schoolCore(p.school) || !schoolCore(s.school)) ? '학교를 모름' : '이름·학교·학년 일치';
        res.exam.options.push({ pid: p.pid, name: p.name, school: p.school, grade: p.grade, n: p.n, why: why, akin: akin.indexOf(p) >= 0 });
      });
      if (akin.length === 1 && schoolCore(akin[0].school) && schoolCore(s.school)) { res.exam.status = 'sure'; res.exam.pick = akin[0].pid; }
      else if (akin.length >= 1) res.exam.status = 'maybe';
      else if (cand.length) res.exam.status = 'none';
      /* KMChC — 학교 열 없음: 이름이 KMChC 에도 DT 에도 하나뿐이고 학년이 맞을 때만 확실 */
      var kc = (kmByName[nm] || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      kc.forEach(function (k) { res.km.options.push({ id: k.id, name: justName(k.name), grade: normGrade(k.grade), kind: k.kind || '', ts: k.ts || 0, akin: gradeOk(k.grade, s.year) }); });
      var kAk = kc.filter(function (k) { return gradeOk(k.grade, s.year); });
      if (kc.length === 1 && kAk.length === 1 && dtByName[nm] === 1) { res.km.status = 'sure'; res.km.pick = kAk[0].id; }
      else if (kAk.length) res.km.status = 'maybe';
      out[s.key] = res;
    });
    return out;
  }

  /* ── exam 기록 → 보고서 어댑터 ──
     rows: 그 학생(짝지은 pid)의 ?action=all 행 · meta: {exams: exams.json 배열, answers: {id: answers json}, baseline: cohort/baseline.json}
     같은 시험을 여러 번 냈으면 마지막 것. 백분위·석차는 **싣지 않는다**(비교하지 않는다). */
  function okOf(q, ex, ans, digit) {
    var a = ans && ans.questions && ans.questions[String(q)];
    if (a && Array.isArray(a.acceptableAnswers) && a.acceptableAnswers.length) return a.acceptableAnswers.indexOf(digit) >= 0;
    var k = ex && ex.key ? Number(ex.key[q - 1]) : null;
    return k != null && digit === k;
  }
  function firstSentence(s, n) {
    s = String(s || '').replace(/^(함정|실수 포인트|기억법|주의)\s*:\s*/, '').trim();
    var m = s.match(/^(.+?[.。!?])(\s|$)/); s = m ? m[1] : s;
    return s.length > (n || 90) ? s.slice(0, (n || 90) - 1) + '…' : s;
  }
  function examAdapter(rows, meta) {
    meta = meta || {};
    var byId = {}; (meta.exams || []).forEach(function (e) { byId[e.id] = e; });
    var latest = {};
    (rows || []).forEach(function (r) { if (!r || !r.examId) return; var p = latest[r.examId]; if (!p || (r.ts || 0) >= (p.ts || 0)) latest[r.examId] = r; });
    var out = [];
    Object.keys(latest).forEach(function (id) {
      var r = latest[id], ex = byId[id] || null, ans = (meta.answers || {})[id] || null;
      var nQ = (ex && ex.nQ) || (ans && ans.questions ? Object.keys(ans.questions).length : String(r.answers || '').length);
      var miss = {}; ((ex && ex.miss) || []).forEach(function (q) { miss[q] = 1; });
      var bl = meta.baseline && meta.baseline.exams && meta.baseline.exams[id];
      var peerOk = bl && bl.n >= 8 && Array.isArray(bl.qc);
      var n = 0, ok = 0, areas = {}, depth = { easyN: 0, easyOk: 0, hardN: 0, hardOk: 0, easyWrong: 0, hardRight: 0 }, misses = [], types = [];
      var s = String(r.answers || '');
      for (var q = 1; q <= nQ; q++) {
        var aq = ans && ans.questions && ans.questions[String(q)];
        if (miss[q] || (aq && aq.excluded)) continue;
        var d = Number(s.charAt(q - 1)) || 0, good = d ? okOf(q, ex, ans, d) : false;
        n++; if (good) ok++;
        var area = (aq && aq.area) || (ex && ex.area && ex.area[q - 1]) || '기타';
        var a = areas[area] || (areas[area] = { name: area, n: 0, ok: 0 }); a.n++; if (good) a.ok++;
        var ty = (ex && ex.type && ex.type[q - 1]) || (aq && aq.concept) || area;
        types.push({ q: q, type: ty, area: area, ok: good });
        if (peerOk) {
          var pp = bl.qc[q - 1] / bl.n * 100;
          if (pp >= 60) { depth.easyN++; if (good) depth.easyOk++; else depth.easyWrong++; } else { depth.hardN++; if (good) { depth.hardOk++; if (pp < 40) depth.hardRight++; } }
        }
        if (!good) misses.push({ q: q, type: ty, area: area, concept: (aq && aq.concept) || '', mis: aq && aq.misconception ? firstSentence(aq.misconception) : '' });
      }
      out.push({ source: 'exam', kind: (ex && ex.group) || '모의시험', id: id, title: (ex && ex.title) || r.exam || id, date: r.ts ? new Date(r.ts).toISOString() : null,
        n: n, ok: ok, max: n, score: ok, rate: n ? ok / n : null,
        areas: Object.keys(areas).map(function (k) { return areas[k]; }),
        depth: peerOk ? depth : null, peerN: peerOk ? bl.n : 0, misses: misses, types: types });
    });
    out.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    return out;
  }
  /* ── KMChC 응답 → 보고서 어댑터 ── kmchc/report.html computeV2 의 정서·태도·메타인지·불안·오개념(C)·타당도 부분을 옮겼다 */
  function decodeKm(b64) {
    b64 = String(b64 || '').replace(/\s+/g, ''); if (!b64) return null;
    var atobF = typeof atob === 'function' ? atob : function (x) { return Buffer.from(x, 'base64').toString('binary'); };
    try { return JSON.parse(decodeURIComponent(escape(atobF(b64)))); } catch (e) { try { return JSON.parse(atobF(b64)); } catch (e2) { return null; } }
  }
  function num(x) { return (typeof x === 'number' && isFinite(x)) ? x : null; }
  function to100n(v) { return v == null ? null : Math.round((v - 1) / 4 * 100); }
  function mean(a) { var b = a.filter(function (x) { return x != null; }); return b.length ? b.reduce(function (s, x) { return s + x; }, 0) / b.length : null; }
  var CTX4 = ['phenom', 'symbol', 'quant', 'lab'];
  function kmAdapter(ans, items, meta) {
    ans = ans || {}; items = items || []; meta = meta || {};
    function lik(it) { var v = num(ans[it.id]); if (v == null) return null; return it.rev ? (6 - v) : v; }
    function ladder(con) { var best = 0; items.forEach(function (it) { if (it.con === con && it.kind === 'ladder') { var v = num(ans[it.id]); if (v != null && v >= 4 && it.tier > best) best = it.tier; } }); return best; }
    function ctx(con) { var o = {}; CTX4.forEach(function (c) { var it = items.filter(function (x) { return x.con === con && x.kind === 'context' && x.ctx === c; })[0]; o[c] = it ? to100n(lik(it)) : null; }); return o; }
    var r = { source: 'kmchc', id: meta.id || '', date: meta.ts ? new Date(meta.ts).toISOString() : null, kind: meta.kind || '' };
    r.interest = ladder('interest'); r.efficacy = ladder('efficacy'); r.metacog = ladder('metacog');
    var ag = items.filter(function (x) { return x.con === 'anxiety' && x.kind === 'general'; })[0];
    r.anxiety = ag ? to100n(lik(ag)) : null; r.anxietyCtx = ctx('anxiety'); r.interestCtx = ctx('interest');
    var vi = items.filter(function (x) { return x.con === 'value' && x.kind === 'internalize'; });
    r.value = (function () { var m = mean(vi.map(function (it) { return to100n(lik(it)); })); return m == null ? null : Math.round(m); })();
    var sound = 0, total = 0, mis = [], clusters = {};
    items.filter(function (x) { return x.block === 'C'; }).forEach(function (it) {
      var a = ans[it.id]; if (a == null) return;
      var t1i = typeof a === 'object' ? num(a.t1) : num(a);
      if (t1i == null || !it.t1 || !it.t1[t1i]) return;
      var opt = it.t1[t1i], st = opt.u ? 'unsure' : (opt.key ? 'sound' : 'misc');
      var t2m = (it.t2 && typeof a === 'object' && num(a.t2) != null && it.t2[a.t2] && it.t2[a.t2].m) ? it.t2[a.t2].m : null;
      if (st === 'sound' && t2m) st = 'misc';
      total++; if (st === 'sound') sound++;
      var c = clusters[it.cluster || '기타'] || (clusters[it.cluster || '기타'] = { misc: 0, total: 0 }); c.total++; if (st === 'misc') c.misc++;
      if (st === 'misc') {
        var conf = typeof a === 'object' ? num(a.conf) : null;
        mis.push({ cluster: it.cluster || '기타', label: t2m || opt.m || '오개념', q: it.q || '', pick: opt.t || '', conf: conf, entrenched: conf != null && conf >= 3 });
      }
    });
    r.concept = total ? Math.round(sound / total * 100) : null; r.conceptN = total; r.misc = mis; r.clusters = clusters;
    /* 타당도(간추림) — 직선 응답·주의 문항·과장 응답 */
    var LIK = { ladder: 1, context: 1, general: 1, relative: 1, internalize: 1, sd: 1, consistency: 1 }, vals = [];
    items.forEach(function (it) { if (LIK[it.kind]) { var v = num(ans[it.id]); if (v != null) vals.push(v); } });
    var cc = {}, mx = 0; vals.forEach(function (v) { cc[v] = (cc[v] || 0) + 1; }); Object.keys(cc).forEach(function (k) { if (cc[k] > mx) mx = cc[k]; });
    var straight = vals.length >= 15 && mx / vals.length >= 0.85;
    var at = items.filter(function (x) { return x.kind === 'attention'; })[0], atFail = at ? num(ans[at.id]) !== at.answer : false;
    var sd = (num(ans['V-SD1']) || 0) + (num(ans['V-SD2']) || 0);
    var weak = (sd >= 8 ? 1 : 0) + (straight ? 1 : 0);
    r.validity = atFail || weak >= 2 ? '신중 해석' : weak === 1 ? '주의' : '고신뢰';
    return r;
  }

  /* ── 브라우저 불러오기 ── */
  function jsonp(url, ms) {
    return new Promise(function (ok, no) {
      var cb = 'spcb_' + Math.random().toString(36).slice(2, 10), s = document.createElement('script'), done = false;
      var t = setTimeout(function () { fin(); no(new Error('timeout')); }, ms || 20000);
      function fin() { done = true; clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
      window[cb] = function (d) { if (done) return; fin(); ok(d); };
      s.onerror = function () { if (done) return; fin(); no(new Error('load')); };
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
    });
  }
  function getJSON(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
  /* exam: 행 전체 + 시험 목록 + 또래 기준 */
  function loadExam(token) {
    var q = EP.exam + '?action=all' + (token ? '&token=' + encodeURIComponent(token) : '') + '&t=' + Date.now();
    return Promise.all([jsonp(q), getJSON(BASE.exam + 'exams.json').catch(function () { return []; }), getJSON(BASE.exam + 'cohort/baseline.json').catch(function () { return null; })])
      .then(function (x) {
        var d = x[0] || {};
        if (d.ok === false) return { status: d.needToken ? 'locked' : 'fail', rows: [], exams: x[1], baseline: x[2], msg: d.error || '' };
        return { status: 'ok', rows: d.rows || [], exams: x[1] || [], baseline: x[2] };
      }).catch(function (e) { return { status: 'fail', rows: [], exams: [], baseline: null, msg: String(e && e.message || e) }; });
  }
  var ANS_CACHE = {};
  function loadExamAnswers(ids) {
    return Promise.all((ids || []).map(function (id) {
      if (ANS_CACHE[id] !== undefined) return Promise.resolve();
      return getJSON(BASE.exam + 'answers/' + encodeURIComponent(id) + '.json').then(function (j) { ANS_CACHE[id] = j; }).catch(function () { ANS_CACHE[id] = null; });
    })).then(function () { var o = {}; ids.forEach(function (id) { if (ANS_CACHE[id]) o[id] = ANS_CACHE[id]; }); return o; });
  }
  function loadKm() {
    return Promise.all([jsonp(EP.km + '?action=names&t=' + Date.now()), getJSON(BASE.km + 'items.json').catch(function () { return null; })])
      .then(function (x) { var d = x[0] || {}; if (d.ok === false) return { status: 'fail', students: [], items: x[1] }; return { status: x[1] ? 'ok' : 'fail', students: d.students || [], items: x[1] || [] }; })
      .catch(function (e) { return { status: 'fail', students: [], items: [], msg: String(e && e.message || e) }; });
  }
  function loadKmOne(id) {
    return jsonp(EP.km + '?action=get&id=' + encodeURIComponent(id)).then(function (d) { return d && d.ok ? decodeKm(d.answers) : null; }).catch(function () { return null; });
  }
  /* 짝지은 결과로 한 학생의 바깥 자료를 만든다 (analysis.normalizeExternal 이 받는 모양) */
  function externalFor(pick, ex, km) {
    var out = { exams: [], kmchc: [], status: { exam: ex ? ex.status : 'off', kmchc: km ? km.status : 'off' } };
    var jobs = [];
    if (ex && ex.status === 'ok' && pick.exam) {
      var rows = ex.rows.filter(function (r) { return normName(justName(r.name)) + '|' + normSchool(r.school) + '|' + normGrade(r.grade) === pick.exam; });
      var ids = Object.keys(rows.reduce(function (o, r) { o[r.examId] = 1; return o; }, {}));
      jobs.push(loadExamAnswers(ids).then(function (answers) { out.exams = examAdapter(rows, { exams: ex.exams, answers: answers, baseline: ex.baseline }); }));
    }
    if (km && km.status === 'ok' && pick.km) {
      var meta = (km.students || []).filter(function (k) { return k.id === pick.km; })[0] || { id: pick.km };
      jobs.push(loadKmOne(pick.km).then(function (ans) { if (ans) out.kmchc = [kmAdapter(ans, km.items, meta)]; else out.status.kmchc = 'fail'; }));
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  var api = { EP: EP, BASE: BASE, normName: normName, justName: justName, normSchool: normSchool, normGrade: normGrade, schoolAkin: schoolAkin,
    matchAll: matchAll, examPeople: examPeople, examAdapter: examAdapter, kmAdapter: kmAdapter, decodeKm: decodeKm,
    jsonp: jsonp, loadExam: loadExam, loadExamAnswers: loadExamAnswers, loadKm: loadKm, loadKmOne: loadKmOne, externalFor: externalFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SurveySources = api;
})(typeof self !== 'undefined' ? self : this);
