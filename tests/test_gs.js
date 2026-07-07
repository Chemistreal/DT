/* 병합 apps-script.gs 행동 테스트: 인증 게이트 / 토큰 조회 / names / cohortmis / 멱등 저장 */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('apps-script.gs', 'utf8');

// ---------- in-memory 시트 ----------
function makeSheet(name, rows) {
  return {
    _name: name, _rows: rows,
    getName() { return this._name; },
    getLastRow() { return this._rows.length; },
    getLastColumn() { return this._rows[0] ? this._rows[0].length : 0; },
    getMaxRows() { return Math.max(50, this._rows.length); },
    appendRow(r) { this._rows.push(r.slice()); },
    getDataRange() { const s = this; return { getValues() { return s._rows.map(r => r.slice()); } }; },
    getRange(row, col, nr, nc) {
      const s = this; nr = nr || 1; nc = nc || 1;
      return {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const rr = s._rows[row - 1 + i] || []; const L = []; for (let j = 0; j < nc; j++) L.push(rr[col - 1 + j]); out.push(L); } return out; },
        getValue() { return (s._rows[row - 1] || [])[col - 1]; },
        setValues(v) { for (let i = 0; i < v.length; i++) { while (s._rows.length < row + i) s._rows.push([]); const rr = s._rows[row - 1 + i]; for (let j = 0; j < v[i].length; j++) rr[col - 1 + j] = v[i][j]; } return this; },
        setValue(x) { while (s._rows.length < row) s._rows.push([]); s._rows[row - 1][col - 1] = x; return this; },
        setBackgrounds() { return this; }
      };
    },
    setConditionalFormatRules() {}
  };
}

const HEADERS = ['이름','리포트링크','시각','점수','통과','학생키','학교','학년','과목','회차','시도','맞음','틀림','오개념','축','테스트','단원상세','축상세','답안'];
const D1 = new Date('2026-07-01T01:00:00Z'), D2 = new Date('2026-07-04T01:00:00Z');
const SHEETS = {
  '결과': makeSheet('결과', [
    HEADERS.slice(),
    ['홍길동','L',D1,85,'통과','휘문중-홍길동','휘문중','2','ch1',1,'정시',51,9,'몰 개념 / 원자 구조','{}','', JSON.stringify([{u:'물질',t:30,w:3}]),'[]','O'.repeat(60)],
    ['김민준','L',D1,72,'미달','단대부중-김민준','단대부중','2','ch1',1,'정시',43,17,'몰 개념','{}','', JSON.stringify([{u:'물질',t:30,w:7}]),'[]','X'.repeat(60)],
    ['홍길동','L',D2,85,'통과','휘문중-홍길동','휘문중','2','jm1',3,'정시',17,3,'5 / 12 / 20','{}','TEST','[]','[]','3312211733213314143.']
  ]),
  '_meta': makeSheet('_meta', [['']]),
  '_roster': makeSheet('_roster', [[JSON.stringify({classes:[{label:'화학1 일6-10',course:'ch1',students:['홍길동','김민준'],round:null}]})]])
};
const PROPS = { ADMIN_TOKEN: 'adm-secret-123', STUDENT_CODE: 'dw2026' };

const ctx = {
  console,
  SpreadsheetApp: {
    openById: () => ({ getSheetByName: n => SHEETS[n] || null, insertSheet: n => (SHEETS[n] = makeSheet(n, [[]]), SHEETS[n]) }),
    newConditionalFormatRule() { const b = { whenTextEqualTo(){return b;}, whenFormulaSatisfied(){return b;}, setBackground(){return b;}, setFontColor(){return b;}, setRanges(){return b;}, build(){return {};} }; return b; },
    flush() {}
  },
  ContentService: { createTextOutput: s => ({ setMimeType() { return { _json: s }; } }), MimeType: { JSON: 'json' } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null) }) },
  Utilities: { formatDate: () => 'x' },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, WeekDay: { WEDNESDAY: 3, MONDAY: 1 },
    newTrigger: () => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ inTimezone: () => ({ create() {} }) }) }), everyDays: () => ({ atHour: () => ({ create() {} }) }) }), forSpreadsheet: () => ({ onEdit: () => ({ create() {} }) }) })
  },
  MailApp: { sendEmail() {} },
  Logger: { log() {} }
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

const J = out => JSON.parse(out._json);
let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('[1] 키 없는 조회 차단');
let r = J(ctx.doGet({ parameter: {} }));
T('무파라미터 -> student key required', r.ok === false && r.error === 'student key required');
r = J(ctx.doGet({ parameter: { all: '1' } }));
T('all=1 무토큰 -> 차단', r.ok === false);
r = J(ctx.doGet({ parameter: { all: '1', token: 'adm-secret-123' } }));
T('all=1 + 관리자 -> 전체 rows', r.ok === true && r.rows.length === 3);

console.log('[2] 관리자 액션 게이트');
for (const act of ['roster', 'pending', 'absentees']) {
  r = J(ctx.doGet({ parameter: { action: act } }));
  T(act + ' 무토큰 -> auth', r.ok === false && r.error === 'auth');
  r = J(ctx.doGet({ parameter: { action: act, token: 'adm-secret-123' } }));
  T(act + ' + 토큰 -> ok', r.ok === true);
}

console.log('[3] names (반 코드 / 관리자 겸용, 학교·학년 조인)');
r = J(ctx.doGet({ parameter: { action: 'names', code: 'wrong' } }));
T('틀린 코드 -> auth', r.ok === false && r.error === 'auth');
r = J(ctx.doGet({ parameter: { action: 'names', code: 'dw2026' } }));
T('반 코드 -> classes', r.ok === true && r.classes.length === 1);
const st = r.classes[0].students.find(s => s.name === '홍길동');
T('학교/학년 조인 (최신행 기준)', st && st.school === '휘문중' && st.year === '2');
T('점수 미포함', JSON.stringify(r).indexOf('85') < 0);
r = J(ctx.doGet({ parameter: { action: 'names', code: 'adm-secret-123' } }));
T('관리자 코드로도 names 허용 (hw_grader)', r.ok === true);

console.log('[4] cohortmis 익명 투영');
r = J(ctx.doGet({ parameter: { action: 'cohortmis' } }));
T('ok + rows', r.ok === true && Array.isArray(r.rows));
T('TEST(jm1) 행 제외', r.rows.every(x => x.course !== 'jm1') && r.rows.length === 2);
const s = JSON.stringify(r);
T('실명/학교/실키 미노출', s.indexOf('홍길동') < 0 && s.indexOf('휘문중') < 0 && s.indexOf('단대부중') < 0);
T('익명키 s1/s2 + wrongMis/units 유지', r.rows[0].studentKey === 's1' && !!r.rows[0].wrongMis && !!r.rows[0].units);

console.log('[5] 토큰 리포트 조회');
const key = '휘문중-홍길동', tok = ctx.tokenFor_(key);
r = J(ctx.doGet({ parameter: { student: key } }));
T('무토큰 키 -> rows 0 / 집계 null', r.ok === true && r.rows.length === 0 && r.cumulative === null && r.rank === null);
r = J(ctx.doGet({ parameter: { student: key + '-' + tok } }));
T('정토큰 -> 해당 학생 rows + 집계', r.rows.length === 2 && r.rows.every(x => x.studentKey === key) && r.cumulative !== null);
T('cumulative는 jm1(TEST) 제외 trend', r.cumulative.trend.length === 1 && r.cumulative.trend[0].course === 'ch1');
r = J(ctx.doGet({ parameter: { student: key + '-aaaaaaaa' } }));
T('오토큰 -> 차단', r.rows.length === 0 && r.cumulative === null);

console.log('[6] doPost 게이트 + 멱등 저장');
r = J(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'roster', classes: [] }) } }));
T('roster POST 무토큰 -> auth', r.ok === false && r.error === 'auth');
r = J(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'exclude', studentKey: 'x', course: 'ch1', round: 1 }) } }));
T('exclude POST 무토큰 -> auth', r.ok === false && r.error === 'auth');
const before = SHEETS['결과']._rows.length;
const hwPayload = { name: '김민준', school: '단대부중학교', year: '중2', course: 'jm1', round: 3, attempt: '정시', isTest: true,
  score: 90, pass: true, correctCount: 18, wrongCount: 2, wrongMis: ['4', '9'], wrongAxes: {}, units: [], axes: [], answers: '13122117332133141431' };
r = J(ctx.doPost({ postData: { contents: JSON.stringify(hwPayload) } }));
T('숙제 저장 ok + 토큰 reportLink 반환', r.ok === true && /report\.html\?student=단대부중-김민준-[0-9a-z]{8}$/.test(r.reportLink));
T('행 추가 (신 순서: D점수 I과목 J회차 S답안)', (() => {
  const rows = SHEETS['결과']._rows, last = rows[rows.length - 1];
  return rows.length === before + 1 && last[3] === 90 && last[5] === '단대부중-김민준' && last[6] === '단대부중' && last[7] === '2' && last[8] === 'jm1' && last[9] === 3 && last[15] === 'TEST' && last[18] === '13122117332133141431';
})());
const hw2 = Object.assign({}, hwPayload, { score: 95, correctCount: 19, wrongCount: 1, wrongMis: ['4'], answers: '43122117332133141431' });
r = J(ctx.doPost({ postData: { contents: JSON.stringify(hw2) } }));
T('같은 (학생·과목·회차·시도) 재저장 -> 덮어쓰기(updated)', r.ok === true && r.updated === true && SHEETS['결과']._rows.length === before + 1);
T('덮어쓴 값 반영', SHEETS['결과']._rows[SHEETS['결과']._rows.length - 1][3] === 95);

console.log('[7] fail-closed (속성 미설정)');
delete PROPS.ADMIN_TOKEN;
r = J(ctx.doGet({ parameter: { action: 'roster', token: '' } }));
T('ADMIN_TOKEN 비면 빈 토큰도 거부', r.ok === false && r.error === 'auth');
delete PROPS.STUDENT_CODE;
r = J(ctx.doGet({ parameter: { action: 'names', code: '' } }));
T('STUDENT_CODE 비면 not set 안내', r.ok === false && r.error === 'STUDENT_CODE not set');

console.log('\n결과: pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
