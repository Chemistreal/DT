/* ============================================================
   DT 재시 재생성 모듈 · 학생의 첫 응시를 서버에서 불러와
   그 학생 개인화 재시 문항을 결정적으로 재생성한다.
   (buildRetake 결정성 검증됨 -> 인쇄본과 채점본이 동일)
   의존: chemengine.js(window.ChemEngine), forms_bank.json(지연 로드)
   전역: window.DTRetake
     .items({key, course, round, base, attemptNo}) -> {items, first, wrongCids} | null
     .keyString(items) -> 'OXOX...' (정답키)
   ============================================================ */
(function () {
  var SAVE_URL = 'https://script.google.com/macros/s/AKfycbzvFaPXgEgCBQ8HowtP8tPTtdiIVFtmZSUf0KFXUOVOh3ektrFMkz4KSR4I52LDBzB8rw/exec';
  var LINK_SALT = 'chemistreal::s4lt::9f3Kq2026';
  var FORMS = null, MANIFEST = null, ROUNDS = {};

  function tokenFor(base) { var s = String(base || '') + '|' + LINK_SALT, a = 2166136261, b = 5381, i, c; for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); a ^= c; a = (a * 16777619) >>> 0; b = ((b * 33) ^ c) >>> 0; } return ((a.toString(36) + '00000').slice(0, 5)) + ((b.toString(36) + '000').slice(0, 3)); }
  function tokWith(k) { k = String(k || ''); var li = k.lastIndexOf('-'); if (li > 0 && /^[0-9a-z]{8}$/.test(k.slice(li + 1))) return k; return k + '-' + tokenFor(k); }
  function pad2(n) { n = Number(n); return (n < 10 ? '0' : '') + n; }

  async function loadForms(base) {
    if (FORMS) return FORMS;
    var r = await fetch((base || '') + 'appdata/forms_bank.json', { cache: 'force-cache' });
    FORMS = await r.json(); return FORMS;
  }
  async function loadManifest(base) {
    if (MANIFEST) return MANIFEST;
    var r = await fetch((base || '') + 'appdata/app_manifest.json', { cache: 'no-store' });
    MANIFEST = await r.json(); return MANIFEST;
  }
  async function loadRound(course, round, base) {
    var key = course + '_' + pad2(round);
    if (ROUNDS[key]) return ROUNDS[key];
    var r = await fetch((base || '') + 'appdata/round_' + key + '.json', { cache: 'force-cache' });
    ROUNDS[key] = await r.json(); return ROUNDS[key];
  }
  async function fetchRows(key, base) {
    var r = await fetch(SAVE_URL + '?student=' + encodeURIComponent(tokWith(key)) + '&t=' + Date.now(), { cache: 'no-store' });
    var j = await r.json(); return (j && j.rows) || [];
  }

  // 학생의 이 회차 재시/재재시 문항 재생성 (재재시는 재시에서 틀린 것 기준, 정시·재시 문장 재노출 방지)
  function clone_(o) { var c = {}; for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }
  function parseOX_(s, n) { var a = String(s || '').split('').map(function (ch) { return ch === 'O' ? 'O' : ch === 'X' ? 'X' : ''; }); while (a.length < n) a.push(''); return a; }

  function attLabelN_(n){ if(n<=1) return '재시'; var s=''; for(var i=0;i<n;i++) s+='재'; return s+'시'; }

  async function items(opts) {
    var CE = window.ChemEngine;
    if (!CE) throw new Error('ChemEngine 미로드 (chemengine.js 확인)');
    var course = opts.course, round = Number(opts.round), attemptNo = opts.attemptNo || 2, base = opts.base || '';
    if (attemptNo < 2) attemptNo = 2;
    await loadForms(base);
    var rd = await loadRound(course, round, base);
    if (!rd || !rd.jeongsi || !rd.retakeC) return null;
    var rows = opts.rows || await fetchRows(opts.key, base);
    // 첫 응시(정시)
    var fr = rows.filter(function (r) {
      return r.course === course && Number(r.round) === round &&
        (r.attempt === '첫 응시' || r.attempt === '정시' || r.attempt === '첫번째시험');
    });
    var first = fr[0];
    if (!first || !first.answers) return null;
    var keyItems = rd.jeongsi.items;
    var gFirst = CE.gradeAttempt(parseOX_(first.answers, keyItems.length), keyItems, rd.scoring);
    var curWrongCids = {}, curWrongStmts = {}, seen = {};
    gFirst.perItem.forEach(function (p, i) { if (!p.ok && keyItems[i]) { curWrongCids[keyItems[i].c] = 1; curWrongStmts[CE.norm(keyItems[i].s)] = 1; } });
    keyItems.forEach(function (it) { seen[CE.norm(it.s)] = 1; });

    // 재시 레벨 2..attemptNo 를 순서대로 연쇄 재생성 (각 단계는 결정적)
    var curItems = null;
    for (var lvl = 2; lvl <= attemptNo; lvl++) {
      var gen = CE.buildRetake(lvl, rd.retakeC, Object.keys(curWrongCids), FORMS, seen, curWrongStmts);  // seen 을 변형(누적)
      curItems = (gen && gen.items) || [];
      if (!curItems.length) return null;
      if (lvl === attemptNo) break;                              // 목표 레벨 문항 = 이번에 볼 시험
      // 중간 레벨: 학생의 그 레벨 답안을 채점해 다음 단계 오답 산출
      var lvlLabel = attLabelN_(lvl - 1);                        // lvl2='재시', lvl3='재재시', lvl4='재재재시'...
      var row = rows.filter(function (r) { return r.course === course && Number(r.round) === round && r.attempt === lvlLabel; })
        .sort(function (a, b) { return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(); })[0];
      if (!row || !row.answers) return null;                     // 그 레벨 기록 없으면 다음 재시 생성 불가
      var gAtt = CE.gradeAttempt(parseOX_(row.answers, curItems.length), curItems, rd.scoring);
      var nextWrongCids = {}, nextWrongStmts = {};
      for (var kk in curWrongStmts) { if (curWrongStmts.hasOwnProperty(kk)) nextWrongStmts[kk] = 1; }   // 이전 오답 문장 계속 회피
      gAtt.perItem.forEach(function (p, i) { if (!p.ok && curItems[i]) { nextWrongCids[curItems[i].c] = 1; nextWrongStmts[CE.norm(curItems[i].s)] = 1; } });
      curWrongCids = nextWrongCids; curWrongStmts = nextWrongStmts;
      // seen 은 buildRetake 가 이미 이 레벨 문장까지 누적함
    }
    return { items: curItems, first: first, wrongCids: Object.keys(curWrongCids), scoring: rd.scoring, attemptNo: attemptNo };
  }

  function keyString(its) { return (its || []).map(function (it) { return it.a === 'O' ? 'O' : 'X'; }).join(''); }

  window.DTRetake = { items: items, keyString: keyString, tokWith: tokWith, tokenFor: tokenFor,
    loadManifest: loadManifest, loadRound: loadRound, fetchRows: fetchRows, forms: loadForms, SAVE_URL: SAVE_URL };
})();
