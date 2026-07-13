/* ============================================================
   Chemistreal  -  채점 결과 저장 + 살아있는 리포트 (Google Apps Script)
   배포: 시트 > 확장 프로그램 > Apps Script 에 이 파일 전체를 붙여넣고
        [배포] > [새 배포] > 유형 '웹 앱' > 액세스 '모든 사용자' > 배포.
        나온 /exec URL 을 앱(chemistreal_app.html)의 SAVE_URL 에 넣는다.
   ============================================================ */
var SHEET_ID = '1WVK-m8PUVm9Hg7bvxuIrk3_VzxPqO4vym1qpatoSM7s';
var TAB = '결과';
var HEADERS = ['이름','리포트링크','시각','점수','통과','학생키','학교','학년','과목','회차','시도','맞음','틀림','오개념','축','테스트','단원상세','축상세','답안'];

/* ---- 접근 제어 (프로젝트 설정 > 스크립트 속성) ----
   ADMIN_TOKEN  : 관리자 코드. roster/pending/absentees 조회, 명단 저장, 전체 조회(all=1), exclude, 메일 발송.
   STUDENT_CODE : 반 코드. exam/hw_grader 의 이름 드롭다운(action=names)에만 사용, 성적 조회 권한과 무관.
   속성이 비어 있으면 해당 기능은 잠김(fail-closed). 학생 저장 POST 와 토큰 리포트 조회는 영향 없음. */
function adminToken_() { try { return (PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '').trim(); } catch (e) { return ''; } }
function adminOk_(t) { return true; }   /* 전체 공개 모드: 관리자 토큰 없이 실행. 원복하려면 아래 한 줄로 되돌리기 ->  var need = adminToken_(); return need !== '' && String(t || '').trim() === need; */
function studentCode_() { try { return (PropertiesService.getScriptProperties().getProperty('STUDENT_CODE') || '').trim(); } catch (e) { return ''; } }

function sheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); }
  else if (sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].join('|') !== HEADERS.join('|')) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]); // 헤더(순서/컬럼) 바뀌면 자동 갱신
  }
  return sh;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function metaSheet_() { var ss = SpreadsheetApp.openById(SHEET_ID); return ss.getSheetByName('_meta') || ss.insertSheet('_meta'); }
function getExcluded_() { try { var v = metaSheet_().getRange(1, 1).getValue(); return v ? JSON.parse(v) : []; } catch (e) { return []; } }
function setExcluded_(arr) { metaSheet_().getRange(1, 1).setValue(JSON.stringify(arr)); }
function exKey_(k, c, r) { return k + '#' + c + '#' + r; }
function parse_(s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }
function parseA_(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
/* 시도 순서 = '재' 글자 수 (정시/첫응시=0, 재시=1, 재재시=2, 재재재시=3 ... 무한). 라벨: 0=정시, n>=1 -> '재'*n+'시' */
function attOrd_(a) { a = String(a || ''); var n = 0; for (var i = 0; i < a.length; i++) { if (a.charAt(i) === '재') n++; } return n; }
function attLabelOf_(n) { if (n <= 0) return '정시'; var s = ''; for (var i = 0; i < n; i++) { s += '재'; } return s + '시'; }

/* 앱에서 채점 결과 1건 저장 (POST JSON) -------------------------------- */
// #5 멱등성: 같은 (학생키·과목·회차·시도) 행을 찾는다(0-indexed col: 학생키3 과목6 회차7 시도8). 없으면 -1.
function findRow_(sh, studentKey, course, round, attempt) {
  if (!studentKey) return -1;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[5]) === String(studentKey) && String(r[8]) === String(course) &&
        String(r[9]) === String(round) && String(r[10]) === String(attempt)) return i + 1;
  }
  return -1;
}

/* 이 학생이 해당 (과목·회차)를 이미 통과했는지 (통과=E열) */
function hasPassed_(sh, key, course, round) {
  if (!key) return false;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[5]) === String(key) && String(r[8]) === String(course) &&
        String(r[9]) === String(round) && r[4] === '통과') return true;
  }
  return false;
}

/* 학생키(F열)가 있는 마지막 실데이터 행을 찾는다. T열 등 전체열 수식으로 getLastRow가
   부풀려져도, 새 응시가 유령 빈 행 아래가 아니라 실데이터 바로 다음에 붙게 한다. */
function lastDataRow_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;                                   // 헤더만 있으면 헤더 다음(2행)에 기록
  var vals = sh.getRange(1, 6, last, 1).getValues();        // F열(학생키) 전체
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || '').trim()) return i + 1;      // 1-indexed 실데이터 마지막 행
  }
  return 1;
}

/* ★ 편집기에서 1회 실행: 결과 탭의 빈 유령 행을 제거하고 실데이터만 남긴다.
   - 학생키(F)가 있는 행만 유지(헤더 포함), A~S 19열만 보존(T+ 잔여 수식 제거)
   - 남은 여분 물리 행 삭제로 시트를 실제 크기로 축소
   - 데이터는 보존됨(정렬만 위로 당겨짐). 실행 후 색을 쓰면 applySheetColors 재실행 권장. */
function compactResultSheet() {
  var sh = sheet_();                                        // 결과 탭
  var last = sh.getLastRow(), lastCol = Math.max(19, sh.getLastColumn());
  if (last < 2) { Logger.log('데이터 없음'); return; }
  var data = sh.getRange(1, 1, last, lastCol).getValues();
  var keep = [data[0].slice(0, 19)];                        // 헤더(A~S)
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][5] || '').trim()) keep.push(data[i].slice(0, 19));   // F 학생키 있는 행만
  }
  sh.clearContents();                                       // 값·수식 제거(T+ 전체열 수식 포함), 서식은 유지
  sh.getRange(1, 1, keep.length, 19).setValues(keep);
  var maxRows = sh.getMaxRows();
  if (maxRows > keep.length + 2) sh.deleteRows(keep.length + 1, maxRows - keep.length - 2);  // 여분 행 삭제
  SpreadsheetApp.flush();
  try { buildSendSheet(); } catch (e) {}                   // 결과 정리 후 문자발송 탭도 자동 갱신
  Logger.log('compactResultSheet: 실데이터 ' + (keep.length - 1) + '행 유지, 빈 행 제거, 시트 축소 + 문자발송 갱신');
}

/* ★ 편집기에서 1회 실행: 어떤 회차를 이미 통과했는데 그 통과 시도보다 뒤(더 높은 시도)의
   재시 기록이 남은 '불필요한 재시 행'을 찾아 삭제한다. (통과 후엔 재시 불필요)
   - 규칙: (학생키·과목·회차) 그룹에서 통과한 시도 중 가장 이른 시도차수(minPassOrd)를 구하고,
     그 회차에서 시도차수가 minPassOrd보다 큰 행을 삭제한다.
   - 예: 정시 통과 -> 모든 재시 삭제 / 재시 통과 -> 재재시 이상 삭제 (김영우 케이스)
   - 정시·통과 시도·그 이전 시도는 보존. 미통과 회차의 재시는 정상이라 건드리지 않음.
   - 삭제된 행은 로그에 남김. 실행 후 색을 쓰면 applySheetColors 재실행 권장. */
function cleanupPassedRetakes() {
  var sh = sheet_();
  var last = sh.getLastRow(), lastCol = Math.max(19, sh.getLastColumn());
  if (last < 2) { Logger.log('데이터 없음'); return; }
  var data = sh.getRange(1, 1, last, lastCol).getValues();
  var minPassOrd = {};                                     // 그룹키 -> 통과한 가장 이른 시도차수
  for (var i = 1; i < data.length; i++) {
    var r = data[i]; var key = String(r[5] || '').trim(); if (!key) continue;
    if (r[4] === '통과') {
      var gk = key + '#' + r[8] + '#' + r[9], o = attOrd_(r[10]);
      if (minPassOrd[gk] == null || o < minPassOrd[gk]) minPassOrd[gk] = o;
    }
  }
  var keep = [data[0].slice(0, 19)];                       // 헤더
  var removed = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i]; var key = String(r[5] || '').trim();
    if (!key) continue;                                    // 빈 행 제외(정리 겸)
    var gk = key + '#' + r[8] + '#' + r[9], mp = minPassOrd[gk];
    if (mp != null && attOrd_(r[10]) > mp) {
      removed.push((r[0] || '') + ' / ' + r[8] + ' ' + r[9] + '회 / ' + r[10] + ' / ' + r[3] + '점 (통과 후 불필요)');
      continue;                                            // 삭제 대상: 통과 시도보다 뒤의 재시
    }
    keep.push(r.slice(0, 19));
  }
  if (!removed.length) { Logger.log('정리 대상 없음 (통과 후 남은 불필요한 재시가 없습니다)'); return; }
  sh.clearContents();
  sh.getRange(1, 1, keep.length, 19).setValues(keep);
  var maxRows = sh.getMaxRows();
  if (maxRows > keep.length + 2) sh.deleteRows(keep.length + 1, maxRows - keep.length - 2);
  SpreadsheetApp.flush();
  try { buildSendSheet(); } catch (e) {}                   // 결과 정리 후 문자발송 탭도 자동 갱신
  Logger.log('cleanupPassedRetakes: ' + removed.length + '행 삭제 + 문자발송 갱신\n' + removed.join('\n'));
}

/* ★ 편집기에서 1회 실행: 정시(첫 응시)가 테스트(TEST)로 잘못 저장됐는데 같은 회차에
   실제(비테스트) 재시 기록이 있으면 → 그 정시의 TEST 표시를 지워 실제 기록으로 되돌린다.
   (관리자가 테스트 모드가 켜진 채로 정시를 수기 채점한 경우 복구용 · 김영우 케이스)
   - 실제 재시가 있는 정시만 되돌리며, 순수 테스트(재시가 없거나 재시도 TEST)는 그대로 둔다.
   - 실행 후 문자발송 자동 갱신. */
function untagMistaggedJeongsi() {
  var sh = sheet_();
  var last = sh.getLastRow(); if (last < 2) { Logger.log('데이터 없음'); return; }
  var data = sh.getRange(1, 1, last, 19).getValues();
  var hasRealRetake = {};                                   // 그룹키 -> 비테스트 재시 존재
  for (var i = 1; i < data.length; i++) {
    var r = data[i]; var key = String(r[5] || '').trim(); if (!key) continue;
    if (attOrd_(r[10]) >= 1 && r[15] !== 'TEST') hasRealRetake[key + '#' + r[8] + '#' + r[9]] = true;
  }
  var fixed = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i]; var key = String(r[5] || '').trim(); if (!key) continue;
    if (attOrd_(r[10]) === 0 && r[15] === 'TEST' && hasRealRetake[key + '#' + r[8] + '#' + r[9]]) {
      sh.getRange(i + 1, 16).setValue('');                  // P열(테스트) 비우기 -> 실제 기록으로
      fixed.push((r[0] || '') + ' / ' + r[8] + ' ' + r[9] + '회 정시 ' + r[3] + '점 (TEST 해제)');
    }
  }
  SpreadsheetApp.flush();
  if (!fixed.length) { Logger.log('되돌릴 정시 없음 (실제 재시가 딸린 TEST 정시가 없습니다)'); return; }
  try { buildSendSheet(); } catch (e) {}
  Logger.log('untagMistaggedJeongsi: ' + fixed.length + '건 TEST 해제 + 문자발송 갱신\n' + fixed.join('\n'));
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'exclude') {
      if (!adminOk_(d.token)) return json_({ ok: false, error: 'auth' });
      var key = exKey_(d.studentKey || '', d.course || '', d.round || '');
      var ex = getExcluded_(); var i = ex.indexOf(key);
      if (d.off) { if (i >= 0) ex.splice(i, 1); } else { if (i < 0) ex.push(key); }
      setExcluded_(ex);
      return json_({ ok: true, excluded: ex });
    }
    if (d.action === 'roster') {
      if (!adminOk_(d.token)) return json_({ ok: false, error: 'auth' });
      setRoster_(d.classes || d.roster || []);
      return json_({ ok: true, classes: getRoster_() });
    }
    if (d.action === 'absentee_email') { if (!adminOk_(d.token)) return json_({ ok: false, error: 'auth' }); weeklyAbsenteeEmail(); return json_({ ok: true, sent: true }); }
    var sh = sheet_();
    var _key = keyOf_(d.name || '', d.school || '');
    // 이미 통과한 회차엔 재시(재 포함) 저장 거부 - 통과 학생은 재시 볼 필요 없음
    if (attOrd_(d.attempt || '') >= 1 && !d.isTest && hasPassed_(sh, _key, d.course || '', d.round || '')) {
      return json_({ ok: false, error: 'already_passed', msg: '이미 통과한 회차라 재시가 저장되지 않았습니다.' });
    }
    var rowVals = [
      d.name || '', linkOf_(_key), new Date(), d.score || 0, d.pass ? '통과' : '미달', _key, normSchool_(d.school || ''), normGrade_(d.year || ''),
      d.course || '', d.round || '', d.attempt || '',
      d.correctCount || 0, d.wrongCount || 0, (d.wrongMis || []).join(' / '),
      JSON.stringify(d.wrongAxes || {}), d.isTest ? 'TEST' : '',
      JSON.stringify(d.units || []), JSON.stringify(d.axes || []), d.answers || ''
    ];
    var existing = findRow_(sh, _key, d.course || '', d.round || '', d.attempt || '');
    if (existing > 0) { sh.getRange(existing, 1, 1, rowVals.length).setValues([rowVals]); } // 멱등: 덮어쓰기
    else { var lr = lastDataRow_(sh); sh.getRange(lr + 1, 1, 1, rowVals.length).setValues([rowVals]); } // 유령 행 아래가 아니라 실데이터 바로 다음에 기록
    try { buildSendSheet(); } catch (errS) {}               // 실시간: 채점 저장 즉시 문자발송 탭 자동 갱신
    return json_({ ok: true, updated: existing > 0, reportLink: linkOf_(_key) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* 살아있는 리포트 데이터 (GET ?student=학교-이름 → 누적 JSON) ---------- */
function mapRow_(r) {
  return {
    name: r[0], reportLink: r[1], date: r[2],
    score: Number(r[3]), pass: r[4] === '통과',
    studentKey: r[5], school: r[6], year: r[7],
    course: r[8], round: Number(r[9]), attempt: r[10],
    wrongMis: String(r[13] || '').split(' / ').filter(String),
    wrongAxes: parse_(r[14]), isTest: r[15] === 'TEST',
    units: parseA_(r[16]), axes: parseA_(r[17]), answers: r[18] || ''
  };
}
function doGet(e) {
  var action = (e.parameter.action || '').trim();
  var token = (e.parameter.token || '').trim();
  if (action === 'pending') { if (!adminOk_(token)) return json_({ ok: false, error: 'auth' }); return json_({ ok: true, pending: computePending_(14) }); }
  if (action === 'roster') { if (!adminOk_(token)) return json_({ ok: false, error: 'auth' }); return json_({ ok: true, classes: getRoster_() }); }
  if (action === 'absentees') { if (!adminOk_(token)) return json_({ ok: false, error: 'auth' }); return json_({ ok: true, absentees: computeAbsentees_(8) }); }
  if (action === 'names') { return namesForStudents_(e.parameter.code); }
  if (action === 'cohortmis') { return json_({ ok: true, rows: cohortMis_() }); }
  var raw = (e.parameter.student || '').trim();
  var key = null;
  if (raw) {
    if (/^[0-9a-z]+$/i.test(raw)) {
      key = findKeyByPubId_(raw);                 // 신규: 불투명 코드(한글·하이픈 없음) → 학생키 역조회
    } else {
      var li = raw.lastIndexOf('-');              // 기존: 학교-이름-토큰 (이미 보낸 링크 호환)
      if (li > 0) { var mt = raw.slice(li + 1); if (/^[0-9a-z]{8}$/.test(mt) && mt === tokenFor_(raw.slice(0, li))) key = raw.slice(0, li); }
    }
  }
  var valid = !!key;   // ★보안: 유효한 코드/토큰이 있어야만 조회
  if (!raw) {
    // 개인정보 보호: 키 없는 전체 조회는 관리자 토큰이 있을 때만(관리 콘솔 전용)
    if (e.parameter.all === '1' && adminOk_(token)) {
      var dataA = sheet_().getDataRange().getValues(); dataA.shift();
      return json_({ ok: true, rows: dataA.map(mapRow_), excluded: getExcluded_() });
    }
    return json_({ ok: false, error: 'student key required' });
  }
  var data = sheet_().getDataRange().getValues();
  data.shift(); // 헤더 제거
  var all = data.map(mapRow_);
  var rows = valid ? all.filter(function (r) { return r.studentKey === key; }) : [];
  return json_({ ok: true, student: key, rows: rows, excluded: getExcluded_(),
    cumulative: valid ? cumulative_(rows) : null,
    rank: valid ? rank_(all, key, getExcluded_()) : null,
    cohort: valid ? cohortItems_(all, key, getExcluded_()) : null });
}

/* 명단 조회(반 코드 또는 관리자 코드). exam 드롭다운, hw_grader 명단에 사용.
   이름만 저장된 roster 를 시트 최신 제출의 학교/학년으로 채워 반환(점수 미포함). */
function namesForStudents_(code) {
  var c = String(code || '').trim();
  var need = studentCode_();
  var okStudent = (need !== '' && c === need);
  if (!okStudent && !adminOk_(c)) {
    return json_({ ok: false, error: (need === '' ? 'STUDENT_CODE not set' : 'auth') });
  }
  var classes = getRoster_();
  var data = sheet_().getDataRange().getValues(); data.shift();
  var latest = {};
  data.forEach(function (r) {
    var nm = cleanName_(String(r[0] || '')); if (!nm) return;
    var t = (r[2] && r[2].getTime) ? r[2].getTime() : new Date(r[2] || 0).getTime();
    if (!latest[nm] || t >= latest[nm].t) latest[nm] = { school: String(r[6] || ''), year: String(r[7] || ''), t: t };
  });
  var out = (classes || []).map(function (k) {
    return { label: k.label, course: k.course,
      students: (k.students || []).map(function (nm) {
        var cn = cleanName_(String(nm || '')), hit = latest[cn] || {};
        return { name: String(nm || ''), school: hit.school || '', year: hit.year || '' };
      }) };
  });
  return json_({ ok: true, classes: out });
}

/* index.html 반 패널용 익명 투영(이름/학교/키/링크 미포함, 학생키는 s1,s2..로 치환).
   클라이언트 집계 로직은 그대로 두고 데이터 원천만 익명화한다. */
function cohortMis_() {
  var data = sheet_().getDataRange().getValues(); data.shift();
  var all = data.map(mapRow_);
  var idx = {}, n = 0, out = [];
  all.forEach(function (r) {
    if (r.isTest || !r.studentKey) return;
    var a = idx[r.studentKey]; if (!a) { n++; a = 's' + n; idx[r.studentKey] = a; }
    out.push({ studentKey: a, course: r.course, round: r.round, attempt: r.attempt,
      date: r.date, isTest: false, wrongMis: r.wrongMis, units: r.units });
  });
  return out;
}

// 최근 회차 반 전체 첫 응시 점수 → 평균·석차(100명 환산)
function rank_(all, key, excluded) {
  excluded = excluded || [];
  var ord = { '정시': 0, '첫번째시험': 0, '이번주 테스트': 0, '첫 응시': 0, '재시': 1, '재재시': 2 };
  var mine = all.filter(function (r) { return r.studentKey === key && !r.isTest; });
  if (!mine.length) return null;
  mine.sort(function (a, b) { return a.course < b.course ? -1 : a.course > b.course ? 1 : a.round - b.round; });
  var last = mine[mine.length - 1], course = last.course, round = last.round;
  function firstScore(rows) { var best = null, bo = 99;
    rows.forEach(function (r) { var o = attOrd_(r.attempt); if (o < bo) { bo = o; best = r; } });
    return best ? best.score : null; }
  var byStu = {};
  all.forEach(function (r) { if (r.isTest || r.course !== course || r.round !== round) return;
    if (excluded.indexOf(exKey_(r.studentKey, r.course, r.round)) >= 0) return;
    (byStu[r.studentKey] || (byStu[r.studentKey] = [])).push(r); });
  var scores = [];
  Object.keys(byStu).forEach(function (k) { var sc = firstScore(byStu[k]); if (sc != null) scores.push({ k: k, s: sc }); });
  if (scores.length < 2) return null;
  var myS = null; scores.forEach(function (x) { if (x.k === key) myS = x.s; });
  if (myS == null) return null;
  var avg = Math.round(scores.reduce(function (a, x) { return a + x.s; }, 0) / scores.length);
  var rank = 1 + scores.filter(function (x) { return x.s > myS; }).length;
  var per100 = Math.max(1, Math.min(100, Math.round(rank / scores.length * 100)));
  var sList = scores.map(function (x) { return x.s; });
  var variance = sList.reduce(function (a, s) { return a + (s - avg) * (s - avg); }, 0) / sList.length;
  var sd = Math.round(Math.sqrt(variance));
  var dist = [0,0,0,0,0,0,0,0,0,0];
  sList.forEach(function (s) { dist[Math.min(9, Math.max(0, Math.floor(s / 10)))]++; });
  return { round: round, avg: avg, score: myS, per100: per100, n: scores.length, sd: sd, dist: dist };
}

/* 학생 최근 회차의 문항별 코호트 응답 집계 (O/X 개수만, 개별 행 노출 없음) ----
   admin cleanCohort과 동일하게 단일응답(전부 O/X 85%+) + 수동 제외를 거른다.
   문항 정답률은 키가 있는 리포트 측(report.html)에서 계산한다. */
function cohortItems_(all, key, excluded) {
  excluded = excluded || [];
  var ord = { '정시': 0, '첫번째시험': 0, '이번주 테스트': 0, '첫 응시': 0, '재시': 1, '재재시': 2 };
  var mine = all.filter(function (r) { return r.studentKey === key && !r.isTest; });
  if (!mine.length) return null;
  mine.sort(function (a, b) { return a.course < b.course ? -1 : a.course > b.course ? 1 : a.round - b.round; });
  var last = mine[mine.length - 1], course = last.course, round = last.round;
  function single_(a) { var o = 0, x = 0, t = 0; for (var i = 0; i < a.length; i++) { var c = a.charAt(i); if (c === 'O') { o++; t++; } else if (c === 'X') { x++; t++; } } return t > 0 && Math.max(o, x) / t >= 0.85; }
  var byStu = {};
  all.forEach(function (r) {
    if (r.isTest || r.course !== course || r.round !== round) return;
    if (excluded.indexOf(exKey_(r.studentKey, r.course, r.round)) >= 0) return;
    (byStu[r.studentKey] || (byStu[r.studentKey] = [])).push(r);
  });
  var rows = [];
  Object.keys(byStu).forEach(function (k) {
    var best = null, bo = 99;
    byStu[k].forEach(function (r) { var o = attOrd_(r.attempt); if (o < bo) { bo = o; best = r; } });
    if (best && best.answers && !single_(best.answers)) rows.push(best);
  });
  if (!rows.length) return null;
  var maxLen = 0; rows.forEach(function (r) { if (r.answers.length > maxLen) maxLen = r.answers.length; });
  var items = []; for (var i = 0; i < maxLen; i++) items.push({ o: 0, x: 0 });
  rows.forEach(function (r) { for (var i = 0; i < r.answers.length; i++) { var c = r.answers.charAt(i); if (c === 'O') items[i].o++; else if (c === 'X') items[i].x++; } });
  return { course: course, round: round, n: rows.length, items: items };
}
function cumulative_(rows) {
  var ord = { '정시': 0, '첫번째시험': 0, '첫 응시': 0, '재시': 1, '재재시': 2 };
  var hasReal = rows.some(function (r) { return !r.isTest; });
  var use = rows.filter(function (r) { return !(hasReal && r.isTest); }); // 실전 기록 있으면 테스트 제외, 전부 테스트면 미리보기로 포함
  var rounds = {};
  use.forEach(function (r) {
    var k = r.course + '#' + r.round;
    (rounds[k] || (rounds[k] = { course: r.course, round: r.round, att: [] })).att.push(r);
  });
  var trend = Object.keys(rounds).map(function (k) {
    var R = rounds[k];
    R.att.sort(function (a, b) { return attOrd_(a.attempt) - attOrd_(b.attempt); });
    var j = R.att[0], last = R.att[R.att.length - 1];
    var passAtt = null; for (var pi = 0; pi < R.att.length; pi++) { if (R.att[pi].pass) { passAtt = R.att[pi]; break; } }
    var repr = passAtt || last;   // 대표 시도: 통과한 시도(있으면), 없으면 마지막 시도
    return {
      course: R.course, round: R.round,
      jeongsiScore: j ? j.score : null, finalScore: repr ? repr.score : null, finalAttempt: repr ? repr.attempt : null,
      attemptsCount: R.att.length, passed: R.att.some(function (a) { return a.pass; })
    };
  }).sort(function (a, b) { return a.course < b.course ? -1 : a.course > b.course ? 1 : a.round - b.round; });

  var mr = {};
  use.forEach(function (r) {
    (r.wrongMis || []).forEach(function (m) { (mr[m] || (mr[m] = {}))[r.course + '#' + r.round] = 1; });
  });
  var chronic = Object.keys(mr).map(function (m) { return { mis: m, rounds: Object.keys(mr[m]).length }; })
    .filter(function (x) { return x.rounds >= 2; }).sort(function (a, b) { return b.rounds - a.rounds; });

  var ax = {};
  use.forEach(function (r) {
    var w = r.wrongAxes || {};
    Object.keys(w).forEach(function (k) { ax[k] = (ax[k] || 0) + w[k]; });
  });
  var axisWeak = Object.keys(ax).map(function (k) { return { key: k, wrong: ax[k] }; })
    .sort(function (a, b) { return b.wrong - a.wrong; });

  return {
    trend: trend, chronicMis: chronic, axisWeak: axisWeak,
    passedRounds: trend.filter(function (t) { return t.passed; }).length,
    coverageRound: trend.length ? trend[trend.length - 1].round : 0
  };
}

/* ============================================================
   재시 미응시 현황 + 주간 알림
   - 미통과인데 다음 재시(또는 재재시)를 보지 않은 (학생·과목·회차) 단위로 집계
   - 마지막 시도일 기준 경과일. activeDays(=14) 미만이면 활성, 이상이면 이탈 추정(stale)
   - stale은 학원을 끊은 학생이 계속 잡히는 것을 막기 위해 알림에서 제외(시험 단위로)
   ============================================================ */
function courseKo_(c) { return c === 'ch1' ? '화학Ⅰ' : c === 'ch2' ? '화학Ⅱ' : c === 'gc' ? '일반화학' : c; }

function computePending_(activeDays) {
  activeDays = activeDays || 14;
  var data = sheet_().getDataRange().getValues(); data.shift();
  var all = data.map(mapRow_).filter(function (r) { return !r.isTest && r.studentKey; });
  var excluded = getExcluded_();
  var ord = { '정시': 0, '첫번째시험': 0, '이번주 테스트': 0, '첫 응시': 0, '재시': 1, '재재시': 2 };
  var groups = {};
  all.forEach(function (r) {
    if (excluded.indexOf(exKey_(r.studentKey, r.course, r.round)) >= 0) return;
    var k = r.studentKey + '#' + r.course + '#' + r.round;
    (groups[k] || (groups[k] = [])).push(r);
  });
  var now = new Date(), pend = [];
  Object.keys(groups).forEach(function (k) {
    var rows = groups[k];
    if (rows.some(function (r) { return r.pass; })) return;           // 통과했으면 제외
    var maxo = -1, lastRow = rows[0];
    rows.forEach(function (r) { var o = attOrd_(r.attempt);
      var d = r.date ? new Date(r.date).getTime() : 0;
      var ld = lastRow.date ? new Date(lastRow.date).getTime() : 0;
      if (o > maxo || (o === maxo && d > ld)) { maxo = o; lastRow = r; } });
    var next = attLabelOf_(maxo + 1);                                 // 미통과인 한 다음 재시 무한 생성 (재시->재재시->재재재시...)
    var d = lastRow.date ? new Date(lastRow.date) : now;
    var days = Math.floor((now - d) / 86400000);
    pend.push({
      studentKey: lastRow.studentKey, name: lastRow.name, school: lastRow.school, year: lastRow.year,
      course: lastRow.course, round: lastRow.round, lastAttempt: lastRow.attempt, nextNeeded: next,
      score: lastRow.score, reportLink: lastRow.reportLink || '',
      lastDate: Utilities.formatDate(d, 'Asia/Seoul', 'M/d'), days: days, active: days < activeDays
    });
  });
  pend.sort(function (a, b) { if (a.active !== b.active) return a.active ? -1 : 1; return b.days - a.days; });
  return {
    active: pend.filter(function (p) { return p.active; }),
    stale: pend.filter(function (p) { return !p.active; }),
    activeDays: activeDays, generatedAt: Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm')
  };
}

/* 매주 수요일 18시(KST) 자동 발송 · setupWeeklyTrigger() 를 한 번 실행해 트리거 등록 */
var PENDING_EMAIL_TO = 'whwnsah11@naver.com';
function weeklyPendingEmail() {
  var P = computePending_(14), active = P.active, staleN = P.stale.length;
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d');
  var subj = '[Chemistreal] 재시 미응시 ' + active.length + '명 · ' + today;
  var exNote = staleN ? ' (2주 이상 미응시 ' + staleN + '명은 이탈 추정으로 제외)' : '';
  var body;
  if (!active.length) {
    body = '이번 주 재시 미응시(2주 이내) 학생이 없습니다.' + exNote
      + '\n\n- Chemistreal 자동 알림 (매주 수요일 18시)';
  } else {
    var lines = active.map(function (p) {
      var urgent = p.days >= 7 ? '[독촉] ' : '';
      return '· ' + urgent + p.name + ' (' + p.school + (p.year ? ' ' + p.year + '학년' : '') + ') · '
        + courseKo_(p.course) + ' ' + p.round + '회 · ' + p.lastAttempt + ' ' + p.score + '점 미통과 → '
        + p.nextNeeded + ' 미응시 (' + p.days + '일 경과)';
    });
    body = '재시 미응시 학생 ' + active.length + '명입니다.' + exNote
      + '\n[독촉] = 1주 이상 경과 (오래된 순)\n\n'
      + lines.join('\n')
      + '\n\n자세히: 앱 첫 화면 > 재시 미응시 현황 보기'
      + '\n\n- Chemistreal 자동 알림 (매주 수요일 18시 · ' + P.generatedAt + ')';
  }
  MailApp.sendEmail(PENDING_EMAIL_TO, subj, body);
}

/* ★ Apps Script 편집기에서 이 함수를 한 번만 실행 → 매주 수 18시 트리거 등록(중복 자동 제거) ★ */
function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyPendingEmail') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyPendingEmail').timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(18).inTimezone('Asia/Seoul').create();
  return '등록 완료: 매주 수요일 18시(KST) weeklyPendingEmail';
}

/* ============================================================
   반 명단(roster) + 주말 시험 미응시(absentee)  -  매주 월요일 18시 알림
   - 명단은 '_roster' 탭 A1 에 JSON 으로 저장. 편집은 roster.html(추가/삭제/수정).
   - 반 이름에서 과목 자동 인식: '화학1'->ch1, '화학2'->ch2, '일반화학'->gc.
   - '이번 주' 회차 = 과목별 최근 N일(기본 8) 내 제출이 있는 최대 회차.
     반별로 회차를 수동 지정(round)하면 그 값을 우선 사용.
   - 그 회차에 (이름 일치) 제출 기록이 없는 명단 학생 = 미응시.
   ============================================================ */
var ROSTER_TAB = '_roster';
function rosterMeta_() { var ss = SpreadsheetApp.openById(SHEET_ID); return ss.getSheetByName(ROSTER_TAB) || ss.insertSheet(ROSTER_TAB); }
function courseOf_(label) {
  var s = String(label || '');
  if (s.indexOf('일반화학') >= 0) return 'gc';
  if (s.indexOf('화학2') >= 0 || s.indexOf('화학Ⅱ') >= 0 || s.indexOf('화학II') >= 0) return 'ch2';
  if (s.indexOf('화학1') >= 0 || s.indexOf('화학Ⅰ') >= 0 || s.indexOf('화학I') >= 0) return 'ch1';
  if (/\bgc\b/i.test(s)) return 'gc';
  return '';
}
function getRoster_() {
  try { var v = rosterMeta_().getRange(1, 1).getValue(); var o = v ? JSON.parse(v) : null; return (o && o.classes) ? o.classes : []; }
  catch (e) { return []; }
}
function setRoster_(classes) {
  var clean = (classes || []).map(function (k) {
    return {
      label: String((k && k.label) || '').trim(),
      course: (k && k.course) || courseOf_(k && k.label),
      students: ((k && k.students) || []).map(function (s) { return String(s || '').trim(); }).filter(String),
      round: (k && (k.round === 0 || k.round)) ? Number(k.round) : null
    };
  }).filter(function (k) { return k.label; });
  rosterMeta_().getRange(1, 1).setValue(JSON.stringify({ classes: clean }));
  return clean;
}
function norm_(s) { return String(s || '').replace(/\s+/g, ''); }
function studentName_(key) { var s = String(key || ''); var i = s.lastIndexOf('-'); return i >= 0 ? s.slice(i + 1) : s; }
function currentRoundForClass_(all, course, students, withinDays) {
  var now = Date.now(), lim = withinDays * 86400000, best = null;
  var set = {};
  (students || []).forEach(function (nm) { set[norm_(nm)] = 1; });
  all.forEach(function (r) {
    if (r.course !== course || r.isTest) return;
    var t = r.date ? new Date(r.date).getTime() : 0;
    if (now - t > lim) return;
    if (!(set[norm_(r.name)] || set[norm_(studentName_(r.studentKey))])) return;  // 이 반 학생 응시만
    if (best == null || r.round > best) best = r.round;
  });
  return best;
}
function currentRoundFor_(all, course, withinDays) {
  var now = Date.now(), lim = withinDays * 86400000, best = null;
  all.forEach(function (r) {
    if (r.course !== course || r.isTest) return;
    var t = r.date ? new Date(r.date).getTime() : 0;
    if (now - t > lim) return;
    if (best == null || r.round > best) best = r.round;
  });
  return best;
}
function computeAbsentees_(withinDays) {
  withinDays = withinDays || 8;
  var data = sheet_().getDataRange().getValues(); data.shift();
  var all = data.map(mapRow_).filter(function (r) { return r.studentKey; });
  var classes = getRoster_(), roundCache = {}, out = [];
  classes.forEach(function (k) {
    var course = k.course || courseOf_(k.label), total = (k.students || []).length;
    if (!course) { out.push({ label: k.label, course: '', round: null, absent: [], present: 0, total: total, note: '과목 미인식' }); return; }
    var round;
    if (k.round === 0 || k.round) round = Number(k.round);
    else round = currentRoundForClass_(all, course, k.students, withinDays);
    if (round == null) { out.push({ label: k.label, course: course, round: null, absent: [], present: 0, total: total, noExam: true }); return; }
    var took = {};
    all.forEach(function (r) {
      if (r.course === course && r.round === round) { took[norm_(r.name)] = 1; took[norm_(studentName_(r.studentKey))] = 1; }
    });
    var absent = (k.students || []).filter(function (nm) { return !took[norm_(nm)]; });
    out.push({ label: k.label, course: course, round: round, absent: absent, present: total - absent.length, total: total });
  });
  return { classes: out, generatedAt: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') };
}
function weeklyAbsenteeEmail() {
  var A = computeAbsentees_(8);
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d');
  var withExam = A.classes.filter(function (c) { return c.round != null; });
  var totalAbsent = withExam.reduce(function (a, c) { return a + c.absent.length; }, 0);
  var subj = '[Chemistreal] 주말시험 미응시 ' + totalAbsent + '명 · ' + today;
  var body;
  if (!withExam.length) {
    body = '최근 8일 내 채점된 주말 시험이 없습니다.\n\n- Chemistreal 자동 알림 (매주 월요일 18시)';
  } else {
    var blocks = withExam.map(function (c) {
      var head = '[' + c.label + '] ' + courseKo_(c.course) + ' ' + c.round + '회 · 미응시 ' + c.absent.length + '/' + c.total + '명';
      var list = c.absent.length ? c.absent.map(function (n) { return '  · ' + n; }).join('\n') : '  (전원 응시 완료)';
      return head + '\n' + list;
    });
    body = '주말 시험 미응시 현황 (반별)\n\n' + blocks.join('\n\n')
      + '\n\n- Chemistreal 자동 알림 (매주 월요일 18시 · ' + A.generatedAt + ')';
  }
  MailApp.sendEmail(PENDING_EMAIL_TO, subj, body);
}
/* 편집기에서 한 번 실행 → 매주 월 18시(KST) 트리거 등록(중복 자동 제거) */
function setupAbsenteeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyAbsenteeEmail') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyAbsenteeEmail').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(18).inTimezone('Asia/Seoul').create();
  return '등록 완료: 매주 월요일 18시(KST) weeklyAbsenteeEmail';
}
/* 편집기에서 한 번 실행 → 제공한 현재 명단으로 초기화(기존 명단 덮어씀) · 이후 편집은 roster.html */
function seedRosterDefault() {
  return setRoster_([
    { label: '화학2 토1:30-5:30', students: ['고승원','곽도윤','권효주','김두은','김시헌','김연준','김채원','김태연','석지후','송지호','안승재','안지원','오가연','오승민','이건우','이도현','이세현','이원준','이정민','이지한','이지호','이지환','이채연','장재민','최시아','현정욱','최민준'] },
    { label: '일반화학 일1:30-5:30', students: ['강태영','권지유','김민결','김영우','이도형','전준','전하연','황승하','황예린'] },
    { label: '화학1 일6-10', students: ['강신우','고영훈','구자홍','권승현','김도현','김명준','김서준','김승현','김예성','김지완','김현승','박정현','옥윤아','온주호','유민상','윤정원','이다인','이동선','이민성','이아은','이지율','이지호','이진혁','이하윤','이한주','이현욱','임병준','임준휘','임하율','장윤아','전주환','최준혁','최지호','한이주','한준태','홍아라','황윤성'] },
    { label: '화학2 토6-10', students: ['박건태','박소영','이지안','정예찬','조예준','최승규','홍수환','고유진','홍선우'] }
  ]).length + '개 반 명단 초기화 완료';
}


/** 1회성: 화학2 1회/2회 기록 스위칭 (결과 탭 G=course, H=round). 편집기에서 1번만 실행. 재배포 불필요. */
function swapCh2Round12() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  var rng = sh.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < rng.length; i++) {
    if (String(rng[i][8]) === 'ch2') {                  // I 과목
      var rd = String(rng[i][9]);                       // J 회차
      if (rd === '1') { sh.getRange(i+1, 10).setValue(2); n++; }
      else if (rd === '2') { sh.getRange(i+1, 10).setValue(1); n++; }
    }
  }
  Logger.log('swapCh2Round12: ' + n + ' rows flipped');
}


/** ========== 학생키(D)·리포트링크(B) 자동 동기화 ==========
 *  이름(A) 또는 학교(E)를 시트에서 수정하면 학생키와 리포트링크가 자동으로 다시 계산됩니다.
 *  같은 학생(같은 이전 학생키)을 가진 다른 행들도 함께 동기화합니다.
 *  reportLink 규칙은 index.html의 reportLink()와 동일: base + 'report.html?student=' + 학생키
 */
var REPORT_BASE_URL = 'https://chemistreal.github.io/DT/';   // 배포 주소가 바뀌면 이 값만 수정
function cleanName_(s) { return String(s == null ? '' : s).replace(/\s+/g, '').trim(); }
function normSchool_(s) { s = cleanName_(s); return s.replace(/중학교$/, '중').replace(/고등학교$/, '고').replace(/초등학교$/, '초'); }
function normGrade_(s) { s = String(s == null ? '' : s).trim(); var m = s.match(/\d+/); return m ? m[0] : s; }
function keyOf_(name, school) { return normSchool_(school) + '-' + cleanName_(name); }
/* ★보안: 실제 salt 값은 저장소에 두지 않는다.
   프로젝트 설정 > 스크립트 속성 > LINK_SALT 에 저장한다. (설정법은 checkLinkSalt 참고)
   속성이 비어 있으면 리포트 링크 토큰이 전부 무효가 되어 어떤 리포트도 열리지 않는다. */
var LINK_SALT_FALLBACK = '';
function linkSalt_() {
  try { var v = (PropertiesService.getScriptProperties().getProperty('LINK_SALT') || '').trim(); if (v) return v; } catch (e) {}
  return LINK_SALT_FALLBACK;
}
/* 편집기에서 실행해 속성 설정 상태를 확인 */
function checkLinkSalt() {
  var v = linkSalt_();
  var msg = v ? 'LINK_SALT 속성 설정됨 (길이 ' + v.length + ')' : '⚠ LINK_SALT 속성이 비어 있습니다 - 리포트 링크가 전부 열리지 않는 상태';
  Logger.log(msg); return msg;
}
function tokenFor_(base){ var s=String(base||'')+'|'+linkSalt_(),a=2166136261,b=5381,i,c; for(i=0;i<s.length;i++){c=s.charCodeAt(i);a^=c;a=(a*16777619)>>>0;b=((b*33)^c)>>>0;} return ((a.toString(36)+'00000').slice(0,5))+((b.toString(36)+'000').slice(0,3)); }
/* 불투명 공개 코드: 학교·이름을 드러내지 않는 14자 코드(한글 없음). 클라이언트 pubId와 동일 알고리즘·salt. */
function pubId_(key){ var s=String(key||'')+'|#pub|'+linkSalt_(),a=2166136261,b=5381,d=52711,i,c; for(i=0;i<s.length;i++){c=s.charCodeAt(i);a^=c;a=(a*16777619)>>>0;b=((b*33)^c)>>>0;d=(((d<<5)+d)^c)>>>0;} return ('00000'+a.toString(36)).slice(-6)+('000'+b.toString(36)).slice(-4)+('000'+d.toString(36)).slice(-4); }
function linkOf_(key) { return REPORT_BASE_URL + 'report.html?student=' + pubId_(key); }  // 신규 링크는 불투명 코드만
/* 불투명 코드로 학생키를 역조회 (결과 탭의 고유 학생키 순회 매칭) */
function findKeyByPubId_(code){ var data=sheet_().getDataRange().getValues(), seen={}; for(var i=1;i<data.length;i++){ var k=String(data[i][5]||'').trim(); if(!k||seen[k])continue; seen[k]=1; if(pubId_(k)===code) return k; } return null; }
function setKeyLink_(sh, row, key, link) {
  sh.getRange(row, 6).setValue(key);   // F 학생키
  sh.getRange(row, 2).setValue(link);  // B 리포트링크
}

/** 편집 트리거 핸들러: 이름/학교 수정 시 학생키·링크 자동 갱신 */
function onEditSync(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== TAB) return;                 // 결과 탭만
    var row = e.range.getRow(), col = e.range.getColumn();
    if (row < 2) return;                              // 헤더 제외
    if (col === 8) {                                  // 학년(H): 숫자만 남기고 종료
      var rawG = sh.getRange(row, 8).getValue();
      var g = normGrade_(rawG);
      if (String(rawG) !== g) sh.getRange(row, 8).setValue(g);
      return;
    }
    if (col !== 1 && col !== 7) return;               // 이름(A) 또는 학교(G)만
    var name = String(sh.getRange(row, 1).getValue() || '');
    var rawSchool = String(sh.getRange(row, 7).getValue() || '');
    var school = normSchool_(rawSchool);              // 학교 정규화
    if (col === 7 && school !== rawSchool) sh.getRange(row, 7).setValue(school);  // '휘문중학교'->'휘문중' 저장
    var oldName = name, oldSchool = school;
    if (col === 1 && e.oldValue != null) oldName = String(e.oldValue);
    if (col === 7 && e.oldValue != null) oldSchool = normSchool_(String(e.oldValue));
    var oldKey = keyOf_(oldName, oldSchool);
    var newKey = keyOf_(name, school);
    var newLink = linkOf_(newKey);
    setKeyLink_(sh, row, newKey, newLink);            // 편집한 행
    if (oldKey && oldKey !== newKey) {                // 같은 학생의 다른 행도 통일
      var last = sh.getLastRow();
      if (last >= 2) {
        var vals = sh.getRange(2, 1, last - 1, 7).getValues();   // A..G
        for (var i = 0; i < vals.length; i++) {
          var rr = i + 2;
          if (rr === row) continue;
          if (String(vals[i][5]) === oldKey) {        // F == 이전 학생키
            sh.getRange(rr, 1).setValue(name);        // 이름 통일
            sh.getRange(rr, 7).setValue(school);      // 학교 통일
            setKeyLink_(sh, rr, newKey, newLink);
          }
        }
      }
    }
  } catch (err) { Logger.log('onEditSync: ' + err); }
}

/** 1회 실행: 편집 자동 동기화 트리거 설치(중복 설치 방지). 표준/컨테이너 스크립트 모두 동작. */
function setupEditTrigger() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onEditSync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditSync').forSpreadsheet(ss).onEdit().create();
  Logger.log('onEditSync 편집 트리거 설치 완료');
}

/** 1회 실행(또는 언제든): 모든 행의 학생키(D)·리포트링크(B)를 이름(A)+학교(E)로 재계산.
 *  기존에 어긋난 링크(예: 서일중학교-고승원)를 학생키에 맞게 일괄 교정합니다. */
function resyncAllKeysLinks() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  var last = sh.getLastRow();
  if (last < 2) { Logger.log('데이터 없음'); return; }
  var rng = sh.getRange(2, 1, last - 1, 8);             // A..H (이름,링크,시각,점수,통과,키,학교,학년)
  var v = rng.getValues();
  for (var i = 0; i < v.length; i++) {
    var school = normSchool_(v[i][6]);                  // G 학교
    var grade = normGrade_(v[i][7]);                    // H 학년
    var key = keyOf_(v[i][0], school);                  // A 이름 + 정규화 학교
    v[i][1] = linkOf_(key);                             // B 링크
    v[i][5] = key;                                      // F 학생키
    v[i][6] = school;                                   // G 학교(정규화)
    v[i][7] = grade;                                    // H 학년(숫자)
  }
  rng.setValues(v);
  Logger.log('resyncAllKeysLinks: ' + v.length + '행 갱신(학교/학년/키/링크)');
}


/** ========== 결과 시트 색상 자동화 ==========
 *  색 체계:
 *   - 이름(A): 반별 파스텔 (반이 다르면 색이 다름; 명단에 없는 학생은 무색)
 *   - 통과(K): 통과=초록, 미달=빨강
 *   - 점수(J): 미달일 때 연빨강
 *   - 시도(I): 재시=연노랑, 재재시=연주황 (몇 번 만에 통과했는지 한눈에)
 *   - TEST 행: 회색 (더미/테스트 구분)
 *  통과/미달/시도/TEST는 native 조건부서식이라 새 응시분에도 자동 적용됨.
 *  반별 이름색만 스냅샷이라 명단/행이 늘면 applySheetColors 재실행(또는 매일 트리거).
 */
var CLASS_PALETTE = ['#D9E7FF', '#CFF0E0', '#FFE9CC', '#EAD9FF', '#FDE0DC', '#E0F0D0', '#D0ECF0', '#F5E0F0'];

function classColorMap_() {
  var classes = getRoster_(), map = [];
  classes.forEach(function (k, idx) {
    var set = {};
    (k.students || []).forEach(function (nm) { set[norm_(nm)] = 1; });
    map.push({ course: k.course || courseOf_(k.label), set: set, color: CLASS_PALETTE[idx % CLASS_PALETTE.length] });
  });
  return map;
}
function classColorOf_(map, normName, course) {
  for (var i = 0; i < map.length; i++) {
    if (map[i].course === course && map[i].set[normName]) return map[i].color;
  }
  return null;   // 어느 반에도 없으면 무색(= 반 배정 누락 신호)
}

/** 조건부서식 규칙 설정 (native, 이후 자동 적용). 시트의 기존 규칙은 이 세트로 대체됨. */
function setResultCondFormat_(sh) {
  var maxRow = sh.getMaxRows();
  if (maxRow < 2) return;
  var n = maxRow - 1;
  var rngScore = sh.getRange(2, 4, n, 1);   // D 점수
  var rngPass = sh.getRange(2, 5, n, 1);    // E 통과
  var rngAtt = sh.getRange(2, 11, n, 1);    // K 시도
  var rngAll = sh.getRange(2, 1, n, 19);    // A..S
  var rules = [];
  // 통과 / 미달
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('통과').setBackground('#C6EFCE').setFontColor('#0B6E39').setRanges([rngPass]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('미달').setBackground('#FFC7CE').setFontColor('#B23C2E').setRanges([rngPass]).build());
  // 미달일 때 점수 셀 연빨강
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$E2="미달"').setBackground('#FCE8E6').setRanges([rngScore]).build());
  // 시도 단계
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('재시').setBackground('#FFF2CC').setRanges([rngAtt]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('재재시').setBackground('#FCE5CD').setRanges([rngAtt]).build());
  // TEST 행 전체 회색
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$P2="TEST"').setBackground('#F3F3F3').setFontColor('#999999').setRanges([rngAll]).build());
  sh.setConditionalFormatRules(rules);
}

/** 실행: 결과 시트 전체에 색 적용(조건부서식 + 반별 이름색). 언제든 재실행 가능. */
function applySheetColors() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  if (!sh) { Logger.log('결과 탭 없음'); return; }
  setResultCondFormat_(sh);
  var last = sh.getLastRow();
  if (last >= 2) {
    var data = sh.getRange(2, 1, last - 1, 9).getValues();   // A..I (이름..과목)
    var cmap = classColorMap_();
    var bg = [];
    for (var i = 0; i < data.length; i++) {
      var color = classColorOf_(cmap, norm_(data[i][0]), String(data[i][8] || ''));
      bg.push([color]);   // null 이면 기본색(무색)
    }
    sh.getRange(2, 1, bg.length, 1).setBackgrounds(bg);   // 이름 열
  }
  SpreadsheetApp.flush();
  Logger.log('applySheetColors: 조건부서식 + 반별 이름색 적용 완료 (' + Math.max(0, last - 1) + '행)');
}

/** 1회 실행: 매일 새벽 색 재적용 트리거(반별 이름색을 새 응시분에도 반영). 중복 방지. */
function setupColorTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'applySheetColors') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('applySheetColors').timeBased().everyDays(1).atHour(6).create();
  Logger.log('applySheetColors 매일 트리거 설치 완료');
}


/** ===== 1회성: 기존 데이터 컬럼을 새 순서로 물리 재배치 =====
 *  새 순서: 이름 리포트링크 시각 점수 통과 학생키 학교 학년 과목 회차 시도 (맞음..답안)
 *  ★실행 순서: (1) 이 코드 저장 → (2) reorderColumnsToNew 1회 실행 → (3) 웹앱 새 버전 재배포
 *  → (4) applySheetColors 재실행. 재배포 전까지는 구 버전 웹앱이 구 순서로 저장하므로,
 *  응시가 없는 시간에 (2)~(3)을 연달아 진행할 것.
 */
function reorderColumnsToNew() {
  /* 행별 자동 감지 마이그레이션: 시트에 여러 세대의 열 배열이 섞여 있어도 안전.
     감지 기준 = 과목 코드(ch1/ch2/gc/jm1) 위치 + 학생키 형태.
       NEW : 과목=I(8),  학생키=F(5)  ... 이름,링크,시각,점수,통과,학생키,학교,학년,과목,회차,시도,...
       V2  : 과목=K(10), 학생키=H(7)  ... 이름,링크,시각,회차,시도,점수,통과,학생키,학교,학년,과목,...
       V1  : 과목=G(6),  학생키=D(3)  ... 이름,링크,시각,학생키,학교,학년,과목,회차,시도,점수,통과,...
     이미 NEW 인 행은 건드리지 않는다. 몇 번을 실행해도 결과가 같다(멱등). */
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 19) { Logger.log('열 수 부족: ' + lastCol); return; }
  var C = { ch1: 1, ch2: 1, gc: 1, jm1: 1 };
  function isCourse(v) { return C[String(v || '').trim()] === 1; }
  function isKey(v) {
    v = String(v == null ? '' : v).trim();
    return v.indexOf('-') > 0 && !/^https?:/.test(v) && !/^[\d.\s:-]+$/.test(v);
  }
  var PERM_V2 = [0,1,2,5,6,7,8,9,10,3,4,11,12,13,14,15,16,17,18];
  var PERM_V1 = [0,1,2,9,10,3,4,5,6,7,8,11,12,13,14,15,16,17,18];
  var data = sh.getRange(1, 1, lastRow, 19).getValues();
  var stat = { NEW: 0, V2: 0, V1: 0, SKIP: 0 };
  var out = data.map(function (row, i) {
    if (i === 0) return row;                                   // 헤더는 아래에서 강제 정합
    if (!String(row[0] || '').trim()) { stat.SKIP++; return row; }
    if (isCourse(row[8]) && isKey(row[5])) { stat.NEW++; return row; }
    if (isCourse(row[10]) && isKey(row[7])) { stat.V2++; return PERM_V2.map(function (oi) { return row[oi]; }); }
    if (isCourse(row[6]) && isKey(row[3])) { stat.V1++; return PERM_V1.map(function (oi) { return row[oi]; }); }
    stat.SKIP++; Logger.log('감지 실패, 원본 유지: ' + (i + 1) + '행 (' + row[0] + ')');
    return row;
  });
  sh.getRange(1, 1, lastRow, 19).setValues(out);
  sh.getRange(1, 1, 1, 19).setValues([HEADERS]);               // 헤더 강제 정합
  SpreadsheetApp.flush();
  Logger.log('reorderColumnsToNew: 이미신순서 ' + stat.NEW + ' / V2변환 ' + stat.V2 + ' / V1변환 ' + stat.V1 + ' / 건너뜀 ' + stat.SKIP);
}


/* ============================================================
   문자발송 탭 자동 생성 (통과 학생 = 첫 시험 + 통과 시험 / 미통과 = 재시 안내)
   - 편집기에 붙여넣고 buildSendSheet 를 [실행]만 하면 됨 (웹앱 재배포 불필요)
   - '문자발송' 탭이 자동 생성됨(있으면 갱신). SHEET_ID, TAB 은 기존 상수 사용
   규칙:
     · 정시에 바로 통과       -> "정시 90점 통과" 한 줄
     · 재시(들) 끝에 통과      -> "정시 60점 (미통과)" + "재시 82점 통과" (중간 재시 생략,
                                 재재시여도 '재시'로만 표기해 시도 횟수는 드러내지 않음)
     · 아직 미통과            -> 재시 안내 문자 (정시 점수 기준, 재시 보라고 안내)
     · 숙제(jm1, P=TEST) 행    -> 제외
   ============================================================ */

var SEND_COURSE_KO = { ch1: '화학Ⅰ', ch2: '화학Ⅱ', gc: '일반화학' };
var SEND_ATT_ORDER = { '정시': 0, '첫 응시': 0, '첫번째시험': 0, '이번주 테스트': 0, '재시': 1, '재재시': 2 };
function sendIsFirst_(a) { return attOrd_(a) === 0; }

function sendPassMsg_(name, courseKo, round, jeongsi, passScore, passAttempt, link) {
  // jeongsi: 실제 정시(첫 응시) 기록 객체(없으면 null). passAttempt: 통과한 시도 라벨.
  var lines;
  if (attOrd_(passAttempt) === 0) {
    lines = '\u00b7 정시 ' + passScore + '점 통과';                                  // 정시에 바로 통과
  } else if (jeongsi && !jeongsi.pass) {
    lines = '\u00b7 정시 ' + jeongsi.score + '점 (미통과)\n\u00b7 재시 ' + passScore + '점 통과'; // 정시 미통과 -> 재시 통과
  } else {
    lines = '\u00b7 재시 ' + passScore + '점 통과';                                  // 정시 기록 없이 재시부터 통과
  }
  return '[다원교육 영재관 · 화학 조준모]\n'
    + name + ' 학생 ' + courseKo + ' ' + round + '회 성적표입니다.\n'
    + lines + '\n'
    + '아래 링크에서 자세한 결과와 취약 개념을 확인하세요.\n'
    + link;
}
function sendRetakeMsg_(name, courseKo, round, firstScore, link) {
  return '[다원교육 영재관 · 화학] ' + name + ' 학생 재시 안내\n\n'
    + '안녕하세요, 화학 조준모입니다.\n\n'
    + name + ' 학생이 ' + courseKo + ' ' + round + '회 정시에서 ' + firstScore + '점으로 통과선(80점)에 조금 못 미쳤습니다. 저희 반은 틀린 개념을 다시 잡아 통과까지 마무리하는 재시 과정을 둡니다.\n\n'
    + '아래 링크에서 취약 개념만 강의록으로 보강한 뒤 재시를 보면 됩니다. 재시는 틀린 개념만 골라 개별 출제되며, 처음 본 문항과 겹치지 않습니다.\n\n'
    + '▶ ' + link + '\n\n'
    + '이번 주 안에 마무리하면 다음 회차를 편하게 이어갈 수 있습니다. 감사합니다.\n\n조준모 드림';
}

/* (학생키+회차) 한 그룹의 종합 문자 계산 -> {status, msg} */
function sendSummary_(rowsOfSC) {
  var att = rowsOfSC.slice().sort(function (a, b) { var oa = attOrd_(a.attempt), ob = attOrd_(b.attempt); return oa - ob || a.t - b.t; });
  var jeongsi = att.filter(function (r) { return sendIsFirst_(r.attempt); }).sort(function (a, b) { return a.t - b.t; })[0] || null; // 실제 정시 기록(없으면 null)
  var passAtt = att.filter(function (r) { return r.pass; }).sort(function (a, b) { var oa = attOrd_(a.attempt), ob = attOrd_(b.attempt); return oa - ob || a.t - b.t; })[0]; // 가장 이른 시도의 통과
  var latest = rowsOfSC.slice().sort(function (a, b) { return b.t - a.t; })[0];
  var name = latest.name, ck = SEND_COURSE_KO[latest.course] || latest.course, round = latest.round, link = latest.link;
  if (passAtt) return { status: '통과', msg: sendPassMsg_(name, ck, round, jeongsi, passAtt.score, passAtt.attempt, link) };
  var baseScore = jeongsi ? jeongsi.score : att[0].score;   // 정시 없으면 가장 이른 기록 점수
  return { status: '재시 안내', msg: sendRetakeMsg_(name, ck, round, baseScore, link) };
}

/* 결과 시트의 각 행에 대응하는 종합 문자 배열(행 순서 1:1 유지, 숙제/빈행은 빈칸) */
function buildRowMessages_(data) {
  var parsed = data.map(function (r) {
    var name = String(r[0] || ''), key = String(r[5] || '').trim();
    var isTest = String(r[15] || '') === 'TEST';
    var t = (r[2] && r[2].getTime) ? r[2].getTime() : new Date(r[2] || 0).getTime();
    return { name: name, school: String(r[6] || ''), link: String(r[1] || ''), t: t, tRaw: r[2],
      score: r[3], pass: (r[4] === '통과'), key: key, course: String(r[8] || ''),
      round: Number(r[9]), attempt: String(r[10] || ''), isTest: isTest, empty: (!name && !key) };
  });
  var groups = {};
  parsed.forEach(function (p) { if (p.isTest || p.empty || !p.key) return; var g = p.key + '#' + p.course + '#' + p.round; (groups[g] || (groups[g] = [])).push(p); });
  var cache = {};
  Object.keys(groups).forEach(function (g) { cache[g] = sendSummary_(groups[g]); });
  return parsed.map(function (p) {
    if (p.empty) return null;
    var label = p.isTest ? '숙제' : ((SEND_COURSE_KO[p.course] || p.course) + ' ' + p.round + '회');
    var att = p.isTest ? '숙제' : p.attempt;
    if (p.isTest || !p.key) return { name: p.name, school: p.school, label: label, att: att, tRaw: p.tRaw, course: p.course, status: '', msg: '' };
    var s = cache[p.key + '#' + p.course + '#' + p.round];
    return { name: p.name, school: p.school, label: label, att: att, tRaw: p.tRaw, course: p.course, status: s.status, msg: s.msg };
  });
}

/* 실행용: '결과'를 읽어 '문자발송' 탭을 만든다(결과 시트와 같은 행 순서, 맨 아래가 최신) */
function buildSendSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var src = ss.getSheetByName(TAB);                              // '결과'
  var last = src.getLastRow();
  if (last < 2) { Logger.log('데이터 없음'); return; }
  var cols = Math.max(16, src.getLastColumn());
  var data = src.getRange(2, 1, last - 1, cols).getValues();
  var rowsOut = buildRowMessages_(data).filter(function (o) { return o; });
  var sh = ss.getSheetByName('문자발송') || ss.insertSheet('문자발송');
  sh.clear();                                                    // 값 + 서식 초기화(재생성마다 깨끗이)
  var body = [['이름', '학교', '회차', '시도', '제출시각', '상태', '성적표 문자']];
  rowsOut.forEach(function (o) { body.push([o.name, o.school, o.label, o.att, o.tRaw || '', o.status, o.msg]); });
  sh.getRange(1, 1, body.length, 7).setValues(body);
  // 색 자동 적용: 이름(A)=반별 파스텔(결과 시트와 동일 팔레트), 상태(F)=통과/재시
  if (rowsOut.length) {
    var cmap = classColorMap_();
    var nBg = [], sBg = [], sFc = [];
    rowsOut.forEach(function (o) {
      nBg.push([classColorOf_(cmap, norm_(o.name), String(o.course || '')) || null]);
      if (o.status === '통과') { sBg.push(['#C6EFCE']); sFc.push(['#0B6E39']); }
      else if (o.status === '재시 안내') { sBg.push(['#FFF2CC']); sFc.push(['#8A6A2F']); }
      else { sBg.push([null]); sFc.push(['#000000']); }
    });
    sh.getRange(2, 1, nBg.length, 1).setBackgrounds(nBg);
    sh.getRange(2, 6, sBg.length, 1).setBackgrounds(sBg).setFontColors(sFc);
  }
  try {
    sh.getRange(1, 1, 1, 7).setFontWeight('bold'); sh.setFrozenRows(1);
    sh.setColumnWidth(1, 80); sh.setColumnWidth(2, 92); sh.setColumnWidth(3, 92); sh.setColumnWidth(4, 66);
    sh.setColumnWidth(5, 124); sh.setColumnWidth(6, 82); sh.setColumnWidth(7, 540);
  } catch (e) {}
  SpreadsheetApp.flush();
  Logger.log('문자발송(행 정렬): ' + rowsOut.length + '행');
}

/* 백업 자동 갱신 트리거: 10분 간격 (시트를 손으로 고친 경우까지 커버).
   실시간 갱신은 doPost가 채점 저장 직후 buildSendSheet를 직접 호출해 처리한다. */
function setupSendTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'buildSendSheet') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('buildSendSheet').timeBased().everyMinutes(10).create();
  Logger.log('buildSendSheet 10분 간격 백업 트리거 설치 (실시간 갱신은 저장 시 doPost가 수행)');
}
