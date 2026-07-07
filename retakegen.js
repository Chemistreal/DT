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

  // 학생의 이 회차 재시 문항 재생성
  async function items(opts) {
    var CE = window.ChemEngine;
    if (!CE) throw new Error('ChemEngine 미로드 (chemengine.js 확인)');
    var course = opts.course, round = Number(opts.round), attemptNo = opts.attemptNo || 2, base = opts.base || '';
    await loadForms(base);
    var rd = await loadRound(course, round, base);
    if (!rd || !rd.jeongsi || !rd.retakeC) return null;
    var rows = opts.rows || await fetchRows(opts.key, base);
    // 첫 응시(정시) 찾기
    var fr = rows.filter(function (r) {
      return r.course === course && Number(r.round) === round &&
        (r.attempt === '첫 응시' || r.attempt === '정시' || r.attempt === '첫번째시험');
    });
    var first = fr[0];
    if (!first || !first.answers) return null;
    var keyItems = rd.jeongsi.items;
    var ans = String(first.answers || '').split('').map(function (ch) { return ch === 'O' ? 'O' : ch === 'X' ? 'X' : ''; });
    while (ans.length < keyItems.length) ans.push('');
    var g = CE.gradeAttempt(ans, keyItems, rd.scoring);
    var wrongCids = {}, wrongStmts = {}, seen = {};
    g.perItem.forEach(function (p, i) { if (!p.ok && keyItems[i]) { wrongCids[keyItems[i].c] = 1; wrongStmts[CE.norm(keyItems[i].s)] = 1; } });
    keyItems.forEach(function (it) { seen[CE.norm(it.s)] = 1; });
    var rt = CE.buildRetake(attemptNo, rd.retakeC, Object.keys(wrongCids), FORMS, seen, wrongStmts);
    return { items: (rt && rt.items) || [], first: first, wrongCids: Object.keys(wrongCids), scoring: rd.scoring };
  }

  function keyString(its) { return (its || []).map(function (it) { return it.a === 'O' ? 'O' : 'X'; }).join(''); }

  window.DTRetake = { items: items, keyString: keyString, tokWith: tokWith, tokenFor: tokenFor,
    loadManifest: loadManifest, loadRound: loadRound, fetchRows: fetchRows, forms: loadForms, SAVE_URL: SAVE_URL };
})();
