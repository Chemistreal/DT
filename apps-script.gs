/* ============================================================
   Chemistreal — 채점 결과 저장 + 살아있는 리포트 (Google Apps Script)
   배포: 시트 > 확장 프로그램 > Apps Script 에 이 파일 전체를 붙여넣고
        [배포] > [새 배포] > 유형 '웹 앱' > 액세스 '모든 사용자' > 배포.
        나온 /exec URL 을 앱(chemistreal_app.html)의 SAVE_URL 에 넣는다.
   ============================================================ */
var SHEET_ID = '1WVK-m8PUVm9Hg7bvxuIrk3_VzxPqO4vym1qpatoSM7s';
var TAB = '결과';
var HEADERS = ['이름','리포트링크','시각','학생키','학교','학년','과목','회차','시도','점수','통과','맞음','틀림','오개념','축','테스트','단원상세','축상세','답안'];

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

/* 앱에서 채점 결과 1건 저장 (POST JSON) -------------------------------- */
// #5 멱등성: 같은 (학생키·과목·회차·시도) 행을 찾는다(0-indexed col: 학생키3 과목6 회차7 시도8). 없으면 -1.
function findRow_(sh, studentKey, course, round, attempt) {
  if (!studentKey) return -1;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[3]) === String(studentKey) && String(r[6]) === String(course) &&
        String(r[7]) === String(round) && String(r[8]) === String(attempt)) return i + 1;
  }
  return -1;
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'exclude') {
      var key = exKey_(d.studentKey || '', d.course || '', d.round || '');
      var ex = getExcluded_(); var i = ex.indexOf(key);
      if (d.off) { if (i >= 0) ex.splice(i, 1); } else { if (i < 0) ex.push(key); }
      setExcluded_(ex);
      return json_({ ok: true, excluded: ex });
    }
    var sh = sheet_();
    var rowVals = [
      d.name || '', d.reportLink || '', new Date(), d.studentKey || '', d.school || '', d.year || '',
      d.course || '', d.round || '', d.attempt || '', d.score || 0, d.pass ? '통과' : '미달',
      d.correctCount || 0, d.wrongCount || 0, (d.wrongMis || []).join(' / '),
      JSON.stringify(d.wrongAxes || {}), d.isTest ? 'TEST' : '',
      JSON.stringify(d.units || []), JSON.stringify(d.axes || []), d.answers || ''
    ];
    var existing = findRow_(sh, d.studentKey || '', d.course || '', d.round || '', d.attempt || '');
    if (existing > 0) { sh.getRange(existing, 1, 1, rowVals.length).setValues([rowVals]); } // 멱등: 덮어쓰기
    else { sh.appendRow(rowVals); }
    return json_({ ok: true, updated: existing > 0 });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* 살아있는 리포트 데이터 (GET ?student=학교-이름 → 누적 JSON) ---------- */
function mapRow_(r) {
  return {
    name: r[0], reportLink: r[1], date: r[2], studentKey: r[3], school: r[4], year: r[5],
    course: r[6], round: Number(r[7]), attempt: r[8], score: Number(r[9]),
    pass: r[10] === '통과',
    wrongMis: String(r[13] || '').split(' / ').filter(String),
    wrongAxes: parse_(r[14]), isTest: r[15] === 'TEST',
    units: parseA_(r[16]), axes: parseA_(r[17]), answers: r[18] || ''
  };
}
function doGet(e) {
  var action = (e.parameter.action || '').trim();
  if (action === 'pending') { return json_({ ok: true, pending: computePending_(14) }); }
  var key = (e.parameter.student || '').trim();
  var data = sheet_().getDataRange().getValues();
  data.shift(); // 헤더 제거
  var all = data.map(mapRow_);
  var rows = all.filter(function (r) { return !key || r.studentKey === key; });
  return json_({ ok: true, student: key, rows: rows, excluded: getExcluded_(),
    cumulative: key ? cumulative_(rows) : null,
    rank: key ? rank_(all, key, getExcluded_()) : null,
    cohort: key ? cohortItems_(all, key, getExcluded_()) : null });
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
    rows.forEach(function (r) { var o = (ord[r.attempt] != null ? ord[r.attempt] : 9); if (o < bo) { bo = o; best = r; } });
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
    byStu[k].forEach(function (r) { var o = (ord[r.attempt] != null ? ord[r.attempt] : 9); if (o < bo) { bo = o; best = r; } });
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
    R.att.sort(function (a, b) { return (ord[a.attempt] || 0) - (ord[b.attempt] || 0); });
    var j = R.att[0], last = R.att[R.att.length - 1];
    return {
      course: R.course, round: R.round,
      jeongsiScore: j ? j.score : null, finalScore: last ? last.score : null,
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
  var NEXT = ['재시', '재재시', null]; // 정시 다음=재시, 재시 다음=재재시, 재재시 다음=없음
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
    rows.forEach(function (r) { var o = (ord[r.attempt] != null ? ord[r.attempt] : 0);
      var d = r.date ? new Date(r.date).getTime() : 0;
      var ld = lastRow.date ? new Date(lastRow.date).getTime() : 0;
      if (o > maxo || (o === maxo && d > ld)) { maxo = o; lastRow = r; } });
    var next = NEXT[Math.min(maxo, 2)];
    if (!next) return;                                                // 재재시까지 보고 미통과 → 더 볼 재시 없음
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
