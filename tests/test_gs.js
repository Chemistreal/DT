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
        setBackgrounds() { return this; },
        clearContent() { for (let i = 0; i < nr; i++) { const rr = s._rows[row - 1 + i]; if (rr) for (let j = 0; j < nc; j++) rr[col - 1 + j] = ''; } return this; }
      };
    },
    setConditionalFormatRules() {},
    clearContents() { this._rows.length = 0; return this; },
    deleteRows() { return this; }
  };
}

const TRIGGERS = [], MAILS = [], DATEKEY = { v: 'x' };
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
    newConditionalFormatRule() { const b = { whenTextEqualTo(){return b;}, whenTextContains(){return b;}, whenFormulaSatisfied(){return b;}, setBackground(){return b;}, setFontColor(){return b;}, setRanges(){return b;}, build(){return {};} }; return b; },
    flush() {}
  },
  /* 실제 ContentService 에 가깝게. 예전 흉내는 MIME 을 통째로 버려서, 응답을
     JSONP 로 감쌌는지 JSON 그대로 줬는지 검사할 방법이 아예 없었다. */
  ContentService: {
    createTextOutput: s => ({
      _text: s,
      setMimeType(m) { this._mime = m; return this; },
      getContent() { return this._text; },
      getMimeType() { return this._mime; },
      get _json() { return this._text; },
    }),
    MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
  },
  /* 쓰기도 받는다. 토큰·트리거 확인 표시를 스스로 적어 두기 때문이다. */
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in PROPS ? PROPS[k] : null),
    setProperty: (k, v) => { PROPS[k] = v; },
  }) },
  /* 날짜 꼴을 그대로 흉내 낸다. 예전 흉내는 무슨 꼴을 물어도 같은 글자를
     돌려줘서, '언제까지 미뤘나' 를 검사할 방법이 아예 없었다(모든 날짜가
     같은 값이 되니 크기 비교가 늘 참이었다). */
  Utilities: {
    formatDate: (d, tz, fmt) => {
      if (fmt !== 'yyyy-MM-dd') return DATEKEY.v;
      const x = new Date(d);
      return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2);
    },
    getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  },
  /* 무엇이 걸렸는지 세어야 '스스로 건다'를 확인할 수 있다. 어떤 순서로 불러도
     받도록 아무 메서드나 자기 자신을 돌려주고, create() 에서만 기록한다. */
  ScriptApp: { getProjectTriggers: () => TRIGGERS.map(f => ({ getHandlerFunction: () => f })),
    deleteTrigger() {}, WeekDay: { WEDNESDAY: 3, MONDAY: 1 },
    newTrigger: fn => { const o = new Proxy({}, { get: (_, k) =>
      k === 'create' ? (() => { TRIGGERS.push(fn); return {}; }) : (() => o) }); return o; }
  },
  MailApp: { sendEmail: (to, subj, body) => { MAILS.push({ to, subj, body }); } },
  Logger: { log() {} }
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

/* 콜백으로 감싼 응답도 읽을 수 있게. 감싼 것을 그대로 JSON.parse 하면 터진다. */
const J = out => JSON.parse(String(out._json).replace(/^[A-Za-z_$][\w$]*\(/, '').replace(/\);?$/, ''));
let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('[1] 키 없는 조회 차단');
let r = J(ctx.doGet({ parameter: {} }));
T('무파라미터 -> student key required', r.ok === false && r.error === 'student key required');
r = J(ctx.doGet({ parameter: { all: '1' } }));
T('[공개모드] all=1 무토큰 -> 전체 rows 허용', r.ok === true && r.rows.length === 3);
r = J(ctx.doGet({ parameter: { all: '1', token: 'adm-secret-123' } }));
T('all=1 + 관리자 -> 전체 rows', r.ok === true && r.rows.length === 3);

console.log('[2] 관리자 액션 (공개모드: 무토큰 허용)');
for (const act of ['roster', 'pending', 'absentees']) {
  r = J(ctx.doGet({ parameter: { action: act } }));
  T(act + ' 무토큰 -> ok', r.ok === true);
  r = J(ctx.doGet({ parameter: { action: act, token: 'anything' } }));
  T(act + ' 아무 토큰 -> ok', r.ok === true);
}

console.log('[3] names (반 코드 / 관리자 겸용, 학교·학년 조인)');
r = J(ctx.doGet({ parameter: { action: 'names', code: 'wrong' } }));
T('[공개모드] 아무 코드 -> classes', r.ok === true && r.classes.length === 1);
r = J(ctx.doGet({ parameter: { action: 'names' } }));
T('[공개모드] 코드 없이 -> classes', r.ok === true && r.classes.length === 1);
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

console.log('[4-2] JSONP — 통합 셸이 <script> 로 부른다');
/* 셸(exam/hub.html)은 CORS 가 없는 앱스크립트를 <script src=...&callback=fn> 으로
   부른다. 콜백을 무시하고 순수 JSON 을 주면 받는 쪽 브라우저가 그걸 자바스크립트로
   실행하려다 `Unexpected token ':'` 로 죽고, 콜백은 영영 안 불린다 —
   실제로 그래서 셸의 DT 칸이 처음부터 '…' 였고 DT 학생이 명단에 안 합쳐졌다. */
{
  const out = ctx.doGet({ parameter: { action: 'cohortmis', callback: '__hubcb' } });
  const txt = out.getContent();
  T('콜백을 주면 감싸 준다', /^__hubcb\(\{/.test(txt) && /\);$/.test(txt));
  T('감쌌으면 자바스크립트로 내려보낸다', out.getMimeType() === 'JAVASCRIPT');
  T('감싼 안쪽은 원래 JSON', (() => {
    const inner = txt.replace(/^__hubcb\(/, '').replace(/\);$/, '');
    const o = JSON.parse(inner); return o.ok === true && Array.isArray(o.rows);
  })());
  // DT 자신의 화면들은 fetch 로 부른다 — 콜백이 없으면 예전 그대로여야 한다
  const plain = ctx.doGet({ parameter: { action: 'cohortmis' } });
  T('콜백이 없으면 순수 JSON', plain.getContent().charAt(0) === '{' && plain.getMimeType() === 'JSON');
  // 아무 문자열이나 그대로 붙이면 응답에 남의 코드를 실어 보내는 셈이 된다
  const bad = ctx.doGet({ parameter: { action: 'cohortmis', callback: 'alert(1)//' } });
  T('식별자가 아닌 콜백은 무시', bad.getContent().charAt(0) === '{');
  // 읽기 창구 전부가 같은 통로를 쓴다(하나만 빠지면 그 칸만 조용히 빈다)
  ['pending', 'names', 'passed'].forEach(function (a) {
    const o = ctx.doGet({ parameter: { action: a, callback: '__hubcb' } });
    T(a + ' 도 감싸 준다', /^__hubcb\(/.test(o.getContent()));
  });
}

console.log('[5] 토큰 리포트 조회');
const key = '휘문중-홍길동', tok = ctx.tokenFor_(key);
r = J(ctx.doGet({ parameter: { student: key } }));
/* 예전에는 '학교-이름' 만으로도 열렸다(옛 링크 호환). 지금은 유효한 코드나
   토큰이 있어야만 열린다 — 이름만 알면 남의 리포트를 볼 수 있었기 때문이다.
   이 검사는 그 조임이 풀리지 않았는지를 지킨다. */
T('무토큰(이름만) -> 차단', r.ok === true && r.rows.length === 0 && r.cumulative === null);
r = J(ctx.doGet({ parameter: { student: key + '-' + tok } }));
T('정토큰 -> 해당 학생 rows + 집계', r.rows.length === 2 && r.rows.every(x => x.studentKey === key) && r.cumulative !== null);
T('cumulative는 jm1(TEST) 제외 trend', r.cumulative.trend.length === 1 && r.cumulative.trend[0].course === 'ch1');
r = J(ctx.doGet({ parameter: { student: key + '-aaaaaaaa' } }));
T('오토큰 -> 차단', r.rows.length === 0 && r.cumulative === null);

console.log('[6] doPost 게이트 + 멱등 저장');
r = J(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'roster', classes: [{label:'t',course:'ch1',students:['A'],round:null}] }) } }));
T('[공개모드] roster POST 무토큰 -> 저장 ok', r.ok === true);
r = J(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'exclude', studentKey: 'x-y', course: 'ch1', round: 1 }) } }));
T('[공개모드] exclude POST 무토큰 -> ok', r.ok === true);
const before = SHEETS['결과']._rows.length;
const hwPayload = { name: '김민준', school: '단대부중학교', year: '중2', course: 'jm1', round: 3, attempt: '정시', isTest: true,
  score: 90, pass: true, correctCount: 18, wrongCount: 2, wrongMis: ['4', '9'], wrongAxes: {}, units: [], axes: [], answers: '13122117332133141431' };
r = J(ctx.doPost({ postData: { contents: JSON.stringify(hwPayload) } }));
/* 링크에 학교·이름을 그대로 적으면 카톡 미리보기·주소창·방문 기록에 남는다.
   지금은 불투명 코드(14자, 한글 없음)만 싣는다. */
T('숙제 저장 ok + 불투명 코드 reportLink 반환',
  r.ok === true && /report\.html\?student=[0-9a-z]{14}$/.test(r.reportLink));
T('리포트 링크에 이름·학교가 안 들어간다',
  r.reportLink.indexOf('김민준') < 0 && r.reportLink.indexOf('단대부중') < 0);
T('행 추가 (신 순서: D점수 I과목 J회차 S답안)', (() => {
  const rows = SHEETS['결과']._rows, last = rows[rows.length - 1];
  return rows.length === before + 1 && last[3] === 90 && last[5] === '단대부중-김민준' && last[6] === '단대부중' && last[7] === '2' && last[8] === 'jm1' && last[9] === 3 && last[15] === 'TEST' && last[18] === '13122117332133141431';
})());
const hw2 = Object.assign({}, hwPayload, { score: 95, correctCount: 19, wrongCount: 1, wrongMis: ['4'], answers: '43122117332133141431' });
r = J(ctx.doPost({ postData: { contents: JSON.stringify(hw2) } }));
T('같은 (학생·과목·회차·시도) 재저장 -> 덮어쓰기(updated)', r.ok === true && r.updated === true && SHEETS['결과']._rows.length === before + 1);
T('덮어쓴 값 반영', SHEETS['결과']._rows[SHEETS['결과']._rows.length - 1][3] === 95);

console.log('[7] 공개모드는 속성 유무와 무관하게 열림');
delete PROPS.ADMIN_TOKEN;
r = J(ctx.doGet({ parameter: { action: 'roster' } }));
T('ADMIN_TOKEN 미설정이어도 roster 허용', r.ok === true);
delete PROPS.STUDENT_CODE;
r = J(ctx.doGet({ parameter: { action: 'names' } }));
T('STUDENT_CODE 미설정이어도 names 허용', r.ok === true && r.classes.length === 1);

console.log('[8] 열 배열 자동 마이그레이션 (실측 V2 + V1 + NEW 혼재)');
const XO60 = 'XO'.repeat(30);
SHEETS['결과']._rows = [
  HEADERS.slice(),
  // V2 (사용자가 붙여넣은 실제 시트 배열): 이름,링크,시각,회차,시도,점수,통과,학생키,학교,학년,과목,...
  ['장보고','https://chemistreal.github.io/DT/report.html?student=새얼중-장보고', new Date('2026-07-04T08:27:09Z'),
   15,'첫 응시',61.7,'미달','새얼중-장보고','새얼중','2','ch2',37,23,'적정·가수분해·다양성자','{"A2":1}','',
   '[{"u":"적정","t":30,"w":16}]','[{"k":"A2","t":5,"w":1}]', XO60],
  ['놀부','L', new Date('2026-07-04T08:29:27Z'),
   15,'첫 응시',70,'미달','휘문중-놀부','휘문중','1','ch2',42,18,'적정','{"A2":0}','','[]','[]', XO60],
  // V1 (핸드오버 문서의 구 배열): 이름,링크,시각,학생키,학교,학년,과목,회차,시도,점수,통과,...
  ['옛학생','L', new Date('2026-05-01T01:00:00Z'),
   '중앙중-옛학생','중앙중','3','ch1',2,'정시',88.3,'통과',53,7,'몰 개념','{}','','[]','[]','O'.repeat(60)],
  // 이미 NEW 인 행 (오늘 새 백엔드가 쓴 행 가정)
  ['신학생','L', new Date('2026-07-07T01:00:00Z'),
   90,'통과','대치중-신학생','대치중','2','gc',4,'정시',54,6,'평형','{}','','[]','[]','O'.repeat(60)]
];
ctx.reorderColumnsToNew();
function isNewRow(r){ return typeof r[3]==='number' && String(r[5]).indexOf('-')>0 && ['ch1','ch2','gc','jm1'].indexOf(String(r[8]))>=0 && String(r[18]).length===60; }
T('4행 전부 신 순서로 정규화', SHEETS['결과']._rows.slice(1).every(isNewRow));
T('V2 값 보존: 장보고 점수61.7/과목ch2/회차15/답안60자', (function(){
  var r=SHEETS['결과']._rows[1];
  return r[3]===61.7 && r[4]==='미달' && r[5]==='새얼중-장보고' && r[6]==='새얼중' && r[7]==='2' && r[8]==='ch2' && r[9]===15 && r[10]==='첫 응시' && r[11]===37 && r[12]===23 && r[18]===XO60;
})());
T('V1 값 보존: 옛학생 ch1 2회 88.3', (function(){
  var r=SHEETS['결과']._rows[3];
  return r[3]===88.3 && r[5]==='중앙중-옛학생' && r[8]==='ch1' && r[9]===2 && r[10]==='정시';
})());
T('NEW 행 무변경', (function(){
  var r=SHEETS['결과']._rows[4];
  return r[3]===90 && r[5]==='대치중-신학생' && r[8]==='gc' && r[9]===4;
})());
var snap = JSON.stringify(SHEETS['결과']._rows);
ctx.reorderColumnsToNew();
T('멱등성: 재실행해도 동일', JSON.stringify(SHEETS['결과']._rows) === snap);
r = J(ctx.doGet({ parameter: { student: '새얼중-장보고' } }));
// 마이그레이션과 무관하게, 이름만으로는 못 연다(위 [5] 와 같은 규칙)
T('마이그레이션 뒤에도 이름만으로는 차단', r.ok===true && r.rows.length===0 && r.cumulative===null);
r = J(ctx.doGet({ parameter: { student: ctx.pubId_('새얼중-장보고') } }));
T('마이그레이션 후 불투명 코드로 실데이터 조회', r.ok===true && r.rows.length===1 && r.rows[0].name==='장보고'
  && r.rows[0].score===61.7 && r.rows[0].course==='ch2' && Number(r.rows[0].round)===15
  && r.cumulative!==null && r.cumulative.trend.length===1 && r.cumulative.trend[0].course==='ch2');
r = J(ctx.doGet({ parameter: { student: '새얼중-장보고-' + ctx.tokenFor_('새얼중-장보고') } }));
T('토큰 링크도 동일 데이터', r.rows.length===1 && r.rows[0].name==='장보고');


console.log('[9] 성적표를 열어 봤는가');
{
  /* 따로 창구를 만들지 않는다. 학부모 링크는 report.html?student=<코드> 이고
     그 화면이 이미 이 창구를 부른다. **코드 모양으로 들어온 것만** 센다. */
  /* 앞선 [8] 이 시트를 마이그레이션 자료로 갈아 끼운다. 그 뒤에도 남아 있는
     학생으로 본다 — 없는 학생으로 부르면 키가 안 풀려 아무것도 안 세인다. */
  const key = '새얼중-장보고';
  const pub = ctx.pubId_(key);
  const before = (ctx.views_()[key] || {}).n || 0;
  ctx.doGet({ parameter: { student: pub } });
  const after1 = (ctx.views_()[key] || {}).n || 0;
  T('학부모 코드로 열면 센다', after1 === before + 1, `${before} -> ${after1}`);
  ctx.doGet({ parameter: { student: pub } });
  T('두 번 열면 두 번 센다', ((ctx.views_()[key] || {}).n || 0) === before + 2);

  /* 선생님 화면은 '학교-이름-토큰' 으로 부른다. 그것까지 세면 열람 수가
     선생님 조회로 부풀어 아무 뜻이 없어진다. */
  const n0 = (ctx.views_()[key] || {}).n || 0;
  ctx.doGet({ parameter: { student: key + '-' + ctx.tokenFor_(key) } });
  T('선생님 조회는 안 센다', ((ctx.views_()[key] || {}).n || 0) === n0);

  const v = J(ctx.doGet({ parameter: { action: 'views' } }));
  /* 셸은 학생키를 만들 줄 모른다(그건 이쪽 규칙이다). 이름·학교를 함께
     실어 보내야 셸이 자기 명단과 맞출 수 있다. */
  T('views 가 이름·학교와 함께 온다',
    v.ok === true && v.views.some(x => x.studentKey === key && !!x.name && !!x.school),
    JSON.stringify(v.views));
}

console.log('[10] 반별 인원 · 수입');
{
  const d = ctx.incomeNow_();
  /* 자리(반 등록 수)와 사람(실인원)을 따로 센다. 한 학생이 두 반을 들으면
     자리는 2, 사람은 1이다. */
  T('자리와 사람을 따로 센다', typeof d.seats === 'number' && typeof d.heads === 'number',
    JSON.stringify(d));
  T('총액은 자리 × 단가', d.monthly === d.seats * d.per);
  T('단가 기본값은 16만원', d.per === 160000);

  /* 수입 창구만은 진짜 토큰을 받는다 — adminOk_ 는 지금 전체 공개라 아무나
     통과한다(명단·점수 창구가 그렇다). 수입은 종류가 다르다. */
  let r2 = J(ctx.doGet({ parameter: { action: 'income' } }));
  T('토큰 없이는 거절', r2.ok === false && r2.error === 'auth', JSON.stringify(r2));
  r2 = J(ctx.doGet({ parameter: { action: 'income', t: 'wrong' } }));
  T('틀린 토큰도 거절', r2.ok === false && r2.error === 'auth');
  r2 = J(ctx.doGet({ parameter: { action: 'income', t: ctx.incomeToken_() } }));
  T('맞는 토큰이면 준다', r2.ok === true && !!r2.income && Array.isArray(r2.history));

  /* 손으로 정하게 하면 안 정한 채로 지나간다(이 저장소의 자동배포 시크릿이
     정확히 그랬다). 없으면 스스로 만든다. */
  T('토큰이 없으면 스스로 만든다', (ctx.incomeToken_() || '').length >= 8, ctx.incomeToken_());

  const ym0 = ctx.monthlyIncomeSnapshot();
  const h1 = ctx.incomeHistory_().length;
  ctx.monthlyIncomeSnapshot();
  /* 같은 달을 두 번 적으면 한 달이 두 번 세어져 추이가 거짓말을 한다. */
  T('같은 달은 덮어쓴다(줄이 안 늘어난다)', ctx.incomeHistory_().length === h1,
    `${h1} -> ${ctx.incomeHistory_().length}`);
}

console.log('[11] 트리거를 스스로 건다');
{
  /* "편집기에서 이 함수를 한 번 실행하세요" 는 안 하게 된다 — 이 저장소의
     자동배포 시크릿이 정확히 그렇게 비어 있었다. */
  TRIGGERS.length = 0; delete PROPS.TRIG_CHECKED;
  ctx.doGet({ parameter: { action: 'cohortmis' } });
  T('선생님 창구를 부르면 걸린다',
    TRIGGERS.includes('dailyBrief') && TRIGGERS.includes('monthlyIncomeSnapshot'),
    JSON.stringify(TRIGGERS));
  const n = TRIGGERS.length;
  ctx.doGet({ parameter: { action: 'cohortmis' } });
  T('같은 날 두 번 보지 않는다', TRIGGERS.length === n);

  /* 트리거를 거는 데는 권한이 하나 더 필요하다. 그것 때문에 학부모 화면이
     막히면 본말이 뒤집힌다 — 학부모 경로에서는 아예 살피지 않는다. */
  TRIGGERS.length = 0; delete PROPS.TRIG_CHECKED;
  ctx.doGet({ parameter: { student: ctx.pubId_('새얼중-장보고') } });
  T('학부모 경로에서는 안 건드린다', TRIGGERS.length === 0, JSON.stringify(TRIGGERS));
}

console.log('[11.5] 「자기는 통과했다는데 왜 재시죠?」');
{
  /* 2026-08-15, 선생님이 물으셨다 — 이몽룡 학생에게 화학Ⅱ 9회 재시 안내가
     나갔는데 학생은 통과했다고 한다.

     computePending_ 은 (학생키 + 과목 + 회차) 로 묶어 통과가 하나도 없으면
     재시로 센다. 학생키는 «학교-이름» 이라 **학교 표기가 갈리면 두 사람이
     된다** — 정시는 «두레중-이몽룡», 재시는 «서울두레중-이몽룡» 으로 들어가면
     정시 묶음에는 통과가 없어 영영 재시 목록에 남는다.

     ⚠ 처음엔 갈라지는 예로 «두레중» ↔ «두레중학교» 를 적었다. **틀렸다.**
       normSchool_ 이 «중학교» 꼬리를 잘라 내므로 그 둘은 애초에 같은 열쇠다
       (아래 [11.6] 이 그것도 잰다). 실제로 갈라지는 것은 지역명 접두처럼
       꼬리가 아닌 차이다.

     여기서 그 상황을 그대로 만들어 놓고, 창구가 **왜인지 말해 주는지** 본다.
     ⚠ 자동으로 빼지 않는다. 정말 동명이인일 수 있어서 사람이 봐야 한다 —
       틀리게 빼면 재시가 조용히 사라진다. 자는 짚어 주는 데까지다. */
  const D3 = new Date('2026-08-10T01:00:00Z'), D4 = new Date('2026-08-12T01:00:00Z');
  const sh = SHEETS['결과'];
  const before = sh._rows.length;
  sh._rows.push(
    ['이몽룡','L',D3,73.3,'미달','두레중-이몽룡','두레중','2','ch2',9,'정시',44,16,'총괄성 크기','{}','','[]','[]','O'.repeat(60)],
    ['이몽룡','L',D4,85,'통과','서울두레중-이몽룡','서울두레중','2','ch2',9,'재시',51,9,'','{}','','[]','[]','O'.repeat(60)]);

  const P = ctx.computePending_(60);
  const all = (P.active || []).concat(P.stale || []);
  const row = all.filter(x => x.name === '이몽룡' && x.course === 'ch2' && Number(x.round) === 9)[0];

  T('아직 재시 목록에 남는다(자동으로 안 뺀다)', !!row,
    all.map(x => x.name + ' ' + x.course + x.round).join(' / ') || '없음');
  if (row) {
    /* ① 이 묶음에 무엇이 있었나 — «정시 73.30» 뿐이면 재시 기록이 아예 없다. */
    T('무엇을 보고 재시라 했는지 적는다',
      Array.isArray(row.seen) && row.seen.length === 1 && /정시/.test(row.seen[0]) && /73\.30/.test(row.seen[0]),
      JSON.stringify(row.seen));
    /* ② 같은 이름이 다른 열쇠로 통과해 있으면 짚어 준다 — 이것이 이 물음의 답이다. */
    T('같은 이름이 다른 열쇠로 통과한 것을 짚는다',
      Array.isArray(row.alsoPassed) && row.alsoPassed.length === 1 &&
      row.alsoPassed[0].studentKey === '서울두레중-이몽룡' &&
      Number(row.alsoPassed[0].score) === 85,
      JSON.stringify(row.alsoPassed));
    T('통과한 시도가 무엇이었는지도 적는다',
      row.alsoPassed && row.alsoPassed[0] && row.alsoPassed[0].attempt === '재시',
      JSON.stringify(row.alsoPassed && row.alsoPassed[0]));
  }

  /* 같은 열쇠로 제대로 통과한 사람은 **애초에 목록에 없다** — 이 자가 옛 규칙을
     깨지 않았는지 같이 본다(아래 한 줄이 빠지면 통과자에게 독촉이 나간다). */
  sh._rows.push(
    ['정상수','L',D3,70,'미달','휘문중-정상수','휘문중','2','ch2',9,'정시',42,18,'','{}','','[]','[]','O'.repeat(60)],
    ['정상수','L',D4,88,'통과','휘문중-정상수','휘문중','2','ch2',9,'재시',53,7,'','{}','','[]','[]','O'.repeat(60)]);
  const P2 = ctx.computePending_(60);
  const all2 = (P2.active || []).concat(P2.stale || []);
  T('같은 열쇠로 통과한 사람은 목록에 없다',
    !all2.some(x => x.name === '정상수'), JSON.stringify(all2.map(x => x.name)));
  /* 짚을 것이 없으면 빈 표시를 안 남긴다 — 없는데 있는 척하면 그게 더 나쁘다. */
  const other = all2.filter(x => x.name === '김민준')[0];
  if (other) T('짚을 것이 없으면 빈 채로 둔다',
    Array.isArray(other.alsoPassed) && other.alsoPassed.length === 0,
    JSON.stringify(other.alsoPassed));

  sh._rows.length = before;                       // 심은 줄을 걷어낸다
}

console.log('[11.6] 「같은 사람으로 처리해 줘」');
{
  /* 선생님: "같은 사람으로 처리해줘. OO중이나 OO중학교나 같은걸로 표기 자동 수정"
     (2026-08-15)

     먼저 사실부터 잰다 — «두레중» 과 «두레중학교» 는 **이미** 같은 열쇠다.
     이것을 안 재고 «갈라진다» 고 적었던 것이 위 [11.5] 의 첫 주석이었다. */
  T('«두레중» 과 «두레중학교» 는 원래 같은 열쇠다',
    ctx.keyOf_('이몽룡', '두레중') === ctx.keyOf_('이몽룡', '두레중학교'),
    ctx.keyOf_('이몽룡', '두레중') + ' vs ' + ctx.keyOf_('이몽룡', '두레중학교'));
  T('고·초도 같다',
    ctx.keyOf_('A', '휘문고') === ctx.keyOf_('A', '휘문고등학교') &&
    ctx.keyOf_('A', '개포초') === ctx.keyOf_('A', '개포초등학교'));

  /* 표기를 정규형으로 고쳐도 학생키는 한 글자도 안 바뀐다 — 이 화면이
     «학생키는 안 바뀝니다» 라고 적기 때문에, 그 말이 참인지 여기서 잰다.
     (화면에 적은 말은 참이어야 한다) */
  ['두레중학교', '대청 중학교', '휘문고등학교', '개포초등학교', '두레중', '서울두레중', '대청'].forEach(s => {
    T('표기를 고쳐도 열쇠가 안 변한다 · ' + s,
      ctx.keyOf_('이몽룡', s) === ctx.keyOf_('이몽룡', ctx.normSchool_(s)),
      s + ' -> ' + ctx.normSchool_(s));
  });

  const D3 = new Date('2026-08-10T01:00:00Z'), D4 = new Date('2026-08-12T01:00:00Z');
  const sh = SHEETS['결과'];
  const before = sh._rows.length;
  /* 실제로 갈라지는 갈래(지역명 접두) + 표기만 어긋난 칸을 같이 심는다. */
  sh._rows.push(
    ['이몽룡','L',D3,73.3,'미달','두레중-이몽룡','두레중','2','ch2',9,'정시',44,16,'','{}','','[]','[]','O'.repeat(60)],
    ['이몽룡','L',D4,85,'통과','서울두레중-이몽룡','서울두레중','2','ch2',9,'재시',51,9,'','{}','','[]','[]','O'.repeat(60)],
    ['김하늘','L',D3,90,'통과','언주중-김하늘','언주중학교','1','ch1',2,'정시',54,6,'','{}','','[]','[]','O'.repeat(60)],
    /* 서로 무관한 학교의 동명이인 — 여기 올라오면 안 된다. */
    ['박서준','L',D3,70,'미달','휘문중-박서준','휘문중','2','ch1',3,'정시',42,18,'','{}','','[]','[]','O'.repeat(60)],
    ['박서준','L',D4,70,'미달','개포중-박서준','개포중','2','ch1',3,'정시',42,18,'','{}','','[]','[]','O'.repeat(60)]);

  const plan = ctx.mergeScan_();
  const g = plan.groups.filter(x => x.name === '이몽룡')[0];
  T('갈라진 같은 학생을 찾아낸다', !!g && g.canon === '두레중-이몽룡' &&
    g.from.length === 1 && g.from[0].key === '서울두레중-이몽룡',
    JSON.stringify(plan.groups));
  T('동명이인은 안 건드린다', !plan.groups.some(x => x.name === '박서준'),
    JSON.stringify(plan.groups.map(x => x.name)));
  const f = plan.schoolFix.filter(x => x.from === '언주중학교')[0];
  T('어긋난 학교 표기를 짚는다', !!f && f.to === '언주중' && f.rows === 1,
    JSON.stringify(plan.schoolFix));
  /* 세기만 하는 자는 아무것도 안 쓴다 — 읽는 것은 조용해도 되고 쓰는 것은 안 된다. */
  T('세는 동안에는 시트를 안 건드린다',
    sh._rows.some(r => r[5] === '서울두레중-이몽룡') &&
    sh._rows.some(r => r[6] === '언주중학교'));

  /* 창구도 세기만 한다(GET mergeplan). */
  const got = JSON.parse(ctx.doGet({ parameter: { action: 'mergeplan', token: 'adm-secret-123' } }).getContent());
  T('창구가 합칠 목록을 내준다', got.ok === true && got.plan &&
    got.plan.groups.some(x => x.name === '이몽룡'), JSON.stringify(got).slice(0, 160));
  /* ⚠ 여기서 «토큰이 틀리면 막힌다» 를 기대했다가 빨간 줄을 봤다. adminOk_ 는
     지금 **전체 공개**라 아무나 통과한다(pending·roster·exclude 도 전부 같다).
     그러니 막힌다고 적지 않는다 — 없는 자물쇠를 있다고 하는 셈이다.
     대신 **재시 목록과 노출 폭이 같다**는 것을 박아 둔다. 나중에 자물쇠를
     채운다면 두 창구가 같이 잠겨야 하고, 한쪽만 열리면 여기서 걸린다. */
  const bad = 'nope';
  const mp = JSON.parse(ctx.doGet({ parameter: { action: 'mergeplan', token: bad } }).getContent());
  const pd = JSON.parse(ctx.doGet({ parameter: { action: 'pending', token: bad } }).getContent());
  T('노출 폭이 재시 목록과 같다', (mp.ok === true) === (pd.ok === true),
    'mergeplan ' + mp.ok + ' / pending ' + pd.ok);

  const res = ctx.applyMergeScan_();
  T('누르면 하나로 모인다',
    !sh._rows.some(r => r[5] === '서울두레중-이몽룡') &&
    sh._rows.filter(r => r[5] === '두레중-이몽룡').length === 2,
    JSON.stringify(sh._rows.filter(r => r[0] === '이몽룡').map(r => r[5])));
  T('표기도 정규형으로 고친다',
    !sh._rows.some(r => r[6] === '언주중학교') &&
    sh._rows.some(r => r[6] === '언주중'));
  T('표기를 고쳐도 그 행의 학생키는 그대로다',
    sh._rows.filter(r => r[0] === '김하늘')[0][5] === '언주중-김하늘',
    JSON.stringify(sh._rows.filter(r => r[0] === '김하늘')[0]));
  T('무엇을 했는지 세어서 돌려준다',
    res.merged === 1 && res.keys === 1 && res.schoolFixed === 1, JSON.stringify(res));

  /* 합친 뒤에는 재시 목록에서 빠진다 — 이것이 선생님이 물으신 것의 끝이다. */
  const after = ctx.computePending_(60);
  T('합치고 나면 재시 안내가 안 나간다',
    !(after.active || []).concat(after.stale || []).some(x => x.name === '이몽룡'),
    JSON.stringify((after.active || []).concat(after.stale || []).map(x => x.name)));

  /* 두 번 눌러도 같다(멱등). 이미 하나면 더 할 것이 없다. */
  const again = ctx.applyMergeScan_();
  T('두 번 눌러도 더 바뀌지 않는다', again.keys === 0 && again.schoolFixed === 0,
    JSON.stringify(again));

  sh._rows.length = before;
}

console.log('[12] 아침 요약');
{
  MAILS.length = 0;
  ctx.dailyBrief();
  /* 챙길 것이 없는 날에도 메일이 오면, 며칠 만에 안 읽고 넘기게 된다.
     조용한 날은 아예 안 보낸다 — 그래야 오는 날에 눈이 간다. */
  const P = ctx.computePending_(14);
  let A = { classes: [] }; try { A = ctx.computeAbsentees_(8, {}) || A; } catch (e) {}
  const work = ((P && P.active) || []).length
             + (A.classes || []).reduce((t, c) => t + ((c.absent || []).length), 0);
  T('챙길 것이 없으면 안 보낸다', work ? MAILS.length === 1 : MAILS.length === 0,
    `할일 ${work} · 메일 ${MAILS.length}`);
  if (MAILS[0]) {
    T('수입 토큰을 알려 준다', MAILS[0].body.indexOf(ctx.incomeToken_()) >= 0);
    T('허브 주소를 넣는다', MAILS[0].body.indexOf('hub.html') >= 0);
  }
  /* 토큰은 아침 메일이 유일한 전달 경로다 — 만들어지긴 하는지 따로 본다. */
  T('토큰이 늘 같은 값이다', ctx.incomeToken_() === ctx.incomeToken_() && !!ctx.incomeToken_());
}

console.log('[13] 누구에게 무슨 안내를 보냈나');
{
  /* 셸이 문자를 복사하면 그 줄을 가라앉히는데, 그 표시가 화면에서만 살았다.
     여덟 명 중 다섯에게 보낸 뒤 잠깐 다른 일을 하면 다시 세야 했다. */
  const d = { action: 'marksent', kind: 'pend', name: '홍 길동', course: 'ch1', round: 3 };
  let r3 = J(ctx.doPost({ postData: { contents: JSON.stringify(d) } }));
  T('보낸 것을 적는다', r3.ok === true, JSON.stringify(r3));
  let log = ctx.sentLog_(21);
  T('읽으면 나온다', log.some(x => x.kind === 'pend' && x.course === 'ch1' && String(x.round) === '3'),
    JSON.stringify(log));

  /* 같은 사람에게 두 번 눌러도 줄이 두 개가 되면 안 된다 — 취소할 때 어느
     줄을 지워야 할지 알 수 없어진다. */
  const n1 = ctx.sentLog_(21).length;
  ctx.doPost({ postData: { contents: JSON.stringify(d) } });
  T('두 번 눌러도 한 줄', ctx.sentLog_(21).length === n1, `${n1} -> ${ctx.sentLog_(21).length}`);

  /* 열쇠는 사람이다(갈래·이름·과목·회차). 이름의 빈칸은 지우고 견준다 —
     셸이 만드는 열쇠와 같은 규칙이어야 두 쪽이 같은 줄을 가리킨다. */
  ctx.doPost({ postData: { contents: JSON.stringify(
    { action: 'marksent', kind: 'pend', name: '홍길동', course: 'ch1', round: 3 }) } });
  T('이름의 빈칸은 무시한다', ctx.sentLog_(21).length === n1);

  /* 잘못 눌렀으면 무를 수 있다. 줄을 지우지 않고 취소로 적는다 — 언제 눌렀다
     언제 물렀는지가 남아야 "보냈다는데요" 를 되짚을 수 있다. */
  ctx.doPost({ postData: { contents: JSON.stringify(
    { action: 'marksent', kind: 'pend', name: '홍길동', course: 'ch1', round: 3, off: true }) } });
  log = ctx.sentLog_(21);
  T('무르면 안 보낸 것으로 센다',
    !log.some(x => x.kind === 'pend' && x.course === 'ch1' && String(x.round) === '3'),
    JSON.stringify(log));
  const sh = SHEETS['_안내기록'];
  T('줄은 남긴다(기록이 사라지지 않는다)', sh && sh._rows.length >= 2, sh ? sh._rows.length : 'none');

  /* 다른 갈래는 다른 줄이다 — 재시 안내를 보냈다고 통과 문자까지 보낸 것이
     되면 안 된다. */
  ctx.doPost({ postData: { contents: JSON.stringify(
    { action: 'marksent', kind: 'pass', name: '홍길동', course: 'ch1', round: 3 }) } });
  T('갈래가 다르면 따로 센다',
    ctx.sentLog_(21).some(x => x.kind === 'pass'), JSON.stringify(ctx.sentLog_(21)));

  const g = J(ctx.doGet({ parameter: { action: 'sentlog' } }));
  T('창구로도 읽힌다', g.ok === true && Array.isArray(g.sent));
  /* 지난 학기 것까지 주면 셸이 옛 줄을 흐려 놓는다. 오래된 줄을 하나 심어
     본다(0 은 '기간 없음' 이 아니라 기본값으로 떨어지므로 그것으로는 못 본다). */
  SHEETS['_안내기록']._rows.push(
    [new Date(Date.now() - 90 * 864e5), 'pend', '옛학생', 'ch2', 9, '']);
  T('오래된 줄은 빼고 준다',
    !ctx.sentLog_(21).some(x => x.name === '옛학생'), JSON.stringify(ctx.sentLog_(21)));
  T('기간을 넓히면 나온다',
    ctx.sentLog_(120).some(x => x.name === '옛학생'));
}

console.log('[14] 오늘 못 하는 학생은 미룬다');
{
  /* 지우면 안 된다 — 지운 것은 돌아오지 않는다. 날짜가 지나면 저절로
     돌아오는 것이 이 창구의 전부다. */
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  const base = { action: 'snooze', kind: 'pend', name: '홍 길동', course: 'ch1', round: 3 };

  let r4 = J(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({}, base, { until: day(7) })) } }));
  T('미룬 것을 적는다', r4.ok === true, JSON.stringify(r4));
  let list = ctx.snoozeList_();
  T('아직 살아 있으면 나온다',
    list.some(x => x.kind === 'pend' && x.course === 'ch1' && String(x.round) === '3'), JSON.stringify(list));
  T('언제까지인지 같이 준다', (list.find(x => x.kind === 'pend') || {}).until === day(7), JSON.stringify(list));

  /* 셸이 만드는 열쇠와 같은 규칙(갈래·이름·과목·회차, 이름의 빈칸은 무시)이라야
     두 쪽이 같은 줄을 가리킨다. 다르면 미룬 학생이 화면에 그대로 남는다. */
  const n0 = SHEETS['_미룸']._rows.length;
  ctx.doPost({ postData: { contents: JSON.stringify(
    { action: 'snooze', kind: 'pend', name: '홍길동', course: 'ch1', round: 3, until: day(14) }) } });
  T('같은 사람을 두 줄로 적지 않는다', SHEETS['_미룸']._rows.length === n0, `${n0} -> ${SHEETS['_미룸']._rows.length}`);
  T('다시 미루면 날짜만 밀린다',
    (ctx.snoozeList_().find(x => x.kind === 'pend') || {}).until === day(14));

  /* 날짜가 지난 것은 **저절로** 목록에 돌아와야 한다. 치우는 트리거도 없다 —
     안 돌아오면 미루기가 아니라 삭제고, 그 학생은 영영 안 보인다. */
  SHEETS['_미룸']._rows.push([new Date(), 'abs', '지난학생', 'ch2', 9, day(-1), '']);
  T('어제까지였던 것은 오늘 돌아온다',
    !ctx.snoozeList_().some(x => x.name === '지난학생'), JSON.stringify(ctx.snoozeList_()));
  SHEETS['_미룸']._rows.push([new Date(), 'abs', '오늘학생', 'ch2', 9, day(0), '']);
  T('오늘까지면 오늘은 아직 미룬 것',
    ctx.snoozeList_().some(x => x.name === '오늘학생'));

  /* 시트가 'YYYY-MM-DD' 를 날짜 값으로 바꿔 놓는 일이 있다. 그때도 읽혀야 한다. */
  const dt = new Date(); dt.setDate(dt.getDate() + 5);
  SHEETS['_미룸']._rows.push([new Date(), 'abs', '날짜값학생', 'ch2', 9, dt, '']);
  T('시트가 날짜로 바꿔 놔도 읽는다',
    ctx.snoozeList_().some(x => x.name === '날짜값학생'), JSON.stringify(ctx.snoozeList_()));

  /* 잘못 눌렀으면 그 자리에서 무른다. 줄은 남긴다 — 몇 번 미뤘는지가 신호다. */
  const n1 = SHEETS['_미룸']._rows.length;
  ctx.doPost({ postData: { contents: JSON.stringify(
    { action: 'snooze', kind: 'pend', name: '홍길동', course: 'ch1', round: 3, off: true }) } });
  T('무르면 목록에서 빠진다',
    !ctx.snoozeList_().some(x => x.kind === 'pend' && String(x.round) === '3'), JSON.stringify(ctx.snoozeList_()));
  T('줄은 남긴다', SHEETS['_미룸']._rows.length === n1);

  /* 언제까지인지 없으면 미룰 수 없다. 빈 날짜를 받아 주면 '영영 안 보이는 줄'이 생긴다. */
  const n2 = SHEETS['_미룸']._rows.length;
  ctx.doPost({ postData: { contents: JSON.stringify(
    { action: 'snooze', kind: 'pass', name: '무기한', course: 'ch1', round: 1 }) } });
  T('언제까지인지 없으면 안 적는다', SHEETS['_미룸']._rows.length === n2,
    `${n2} -> ${SHEETS['_미룸']._rows.length}`);

  const g2 = J(ctx.doGet({ parameter: { action: 'snoozelog' } }));
  T('창구로도 읽힌다', g2.ok === true && Array.isArray(g2.snoozed), JSON.stringify(g2));
  /* 보낸 기록과 미룬 기록은 다른 장부다. 섞이면 미룬 학생이 '보냄' 으로 흐려진다. */
  T('보낸 기록과 섞이지 않는다',
    !ctx.sentLog_(21).some(x => x.name === '오늘학생'), JSON.stringify(ctx.sentLog_(21)));
}

console.log('[15] 개념 하나로 학생을 부른다');
{
  /* 익명본(cohortmis)은 학생키를 s1,s2 로 다시 매겨서 다른 창구와 이을 수 없다.
     그래서 셸의 '어려워하는 개념' 은 여태 숫자만 있었다 — 몇 명인지는 아는데
     누구인지를 모른다. 보충을 하려면 이름이 있어야 한다. */
  const now = Date.now();
  const row = (name, key, course, round, att, pass, mis, ago) => {
    const r = HEADERS.map(() => '');
    r[0] = name; r[1] = 'L'; r[2] = new Date(now - ago * 864e5); r[3] = pass ? 90 : 60;
    r[4] = pass ? '통과' : '미달'; r[5] = key; r[6] = '휘문중'; r[7] = '2';
    r[8] = course; r[9] = round; r[10] = att; r[13] = mis; r[15] = ''; r[16] = '[]'; r[17] = '[]';
    return r;
  };
  const S = SHEETS['결과'];
  const keep = S._rows.length;
  /* 정시에서 몰농도를 틀리고 재시에서 잡았다. 다시 부르면 이미 잡은 아이를
     또 앉히게 된다 — 마지막 시도만 본다. */
  S._rows.push(row('이재현', '휘문중-이재현', 'ch1', 5, '정시', false, '몰농도 / 완충', 2));
  S._rows.push(row('이재현', '휘문중-이재현', 'ch1', 5, '재시', true, '완충', 1));
  S._rows.push(row('박서준', '휘문중-박서준', 'ch1', 5, '정시', false, '몰농도', 3));
  /* 오래된 것까지 쌓으면 지금 무엇을 보충해야 하는지가 안 보인다. */
  S._rows.push(row('옛학생', '휘문중-옛학생', 'ch1', 5, '정시', false, '몰농도', 90));

  const m = ctx.misNamed_(21);
  const of = nm => m.rows.filter(r => r.name === nm)[0];
  T('이름이 붙는다', !!of('박서준') && of('박서준').school === '휘문중', JSON.stringify(m.rows));
  T('마지막 시도만 본다', of('이재현') && of('이재현').tags.join(',') === '완충',
    JSON.stringify(of('이재현')));
  T('잡은 개념은 다시 안 부른다',
    !m.rows.some(r => r.name === '이재현' && r.tags.indexOf('몰농도') >= 0));
  T('마지막이 통과여도 틀린 개념은 싣는다', of('이재현') && of('이재현').pass === true);
  T('오래된 줄은 빼고 준다', !of('옛학생'), JSON.stringify(m.rows.map(r => r.name)));
  T('기간을 넓히면 나온다', ctx.misNamed_(120).rows.some(r => r.name === '옛학생'));
  T('틀린 개념이 없는 줄은 안 싣는다', m.rows.every(r => r.tags.length > 0));
  T('급한 것이 위에 선다', m.rows.map(r => r.days).every((d, i, a) => i === 0 || a[i - 1] <= d),
    JSON.stringify(m.rows.map(r => [r.name, r.days])));

  const g3 = J(ctx.doGet({ parameter: { action: 'mistags' } }));
  T('창구로도 읽힌다', g3.ok === true && Array.isArray(g3.mis.rows), JSON.stringify(g3).slice(0, 160));
  /* 익명본은 그대로 익명이어야 한다 — 이 창구를 만들었다고 저쪽이 열리면 안 된다. */
  T('익명본은 그대로 익명이다',
    ctx.cohortMis_().every(r => /^s\d+$/.test(String(r.studentKey)) && !('name' in r)),
    JSON.stringify(ctx.cohortMis_()[0]));
  S._rows.length = keep;
}

console.log('[묶음 창구] 여러 창구를 한 실행에서');
{
  /* 앱스크립트는 실행을 한 줄로 세운다. 통합 셸이 첫 화면에서 이 창구를
     여덟 번 불렀는데, 다섯이 한꺼번에 나가도 저쪽에서는 차례로 하나씩 돌았다.
     묶어 받으면 한 실행으로 끝난다. */
  const b = J(ctx.doGet({ parameter: { action: 'bundle', want: 'names,pending,cohortmis' } }));
  T('ok + parts', b.ok === true && b.bundle === true && !!b.parts, JSON.stringify(b).slice(0, 120));
  T('부른 만큼 담긴다', b.n === 3 && Object.keys(b.parts).length === 3,
    JSON.stringify(Object.keys(b.parts || {})));
  /* 묶었다고 다른 답이 나오면 안 된다 — 낱개로 부른 것과 **글자까지 같아야** 한다. */
  ['names', 'pending', 'cohortmis'].forEach(function (a) {
    const solo = J(ctx.doGet({ parameter: { action: a } }));
    T(a + ' 은 낱개로 부른 것과 같다', JSON.stringify(b.parts[a]) === JSON.stringify(solo),
      JSON.stringify(b.parts[a]).slice(0, 100));
  });
  /* 모르는 이름은 조용히 뺀다. 옛 셸이 엉뚱한 이름을 적어 보내도 나머지는 온다. */
  const b2 = J(ctx.doGet({ parameter: { action: 'bundle', want: 'names,없는창구,,names' } }));
  T('모르는 이름은 뺀다', b2.n === 1 && !!b2.parts.names && !b2.parts['없는창구'],
    JSON.stringify(Object.keys(b2.parts)));
  T('같은 이름을 두 번 적어도 한 번만', Object.keys(b2.parts).length === 1);
  /* 한 요청에 담는 수를 막아 둔다 — 백 개를 적어 보내면 한 실행이 시간 제한에
     걸려 통째로 실패한다. 그러면 낱개보다 나쁘다. */
  const many = new Array(40).fill('cohortmis').map((x, i) => (i % 2 ? 'names' : 'cohortmis')).join(',');
  const b3 = J(ctx.doGet({ parameter: { action: 'bundle', want: many } }));
  T('아무리 많이 적어도 열둘까지', Object.keys(b3.parts).length <= 12);
  /* 권한은 낱개와 똑같이 본다. 묶었다고 열리는 것은 하나도 없어야 한다.
     수입 창구는 진짜 토큰을 받으므로, 토큰 없이 묶어 부르면 그 자리만 막힌다. */
  const b4 = J(ctx.doGet({ parameter: { action: 'bundle', want: 'income,names' } }));
  T('묶었다고 권한이 열리지 않는다', b4.parts.income && b4.parts.income.ok === false,
    JSON.stringify(b4.parts.income));
  T('막힌 자리가 있어도 나머지는 온다', b4.parts.names && b4.parts.names.ok === true);
  /* JSONP 로도 와야 한다 — 통합 셸은 이 길로만 부른다. */
  const jp = ctx.doGet({ parameter: { action: 'bundle', want: 'names', callback: '__hubcb' } });
  T('JSONP 로 감싼다', /^__hubcb\(/.test(String(jp.getContent())),
    String(jp.getContent()).slice(0, 40));
}

console.log('[반 갈래] 파이널 반은 DT 계산에서 빠진다');
{
  /* 선생님 반이 전부 DT 를 보는 것은 아니다. 파이널만 하는 반을 명단에 넣으면
     DT 가 회차를 못 찾아 '과목 미인식' 으로 뜨고, 미응시 계산에도 끼어든다 —
     시험을 안 보는 반이 통째로 미응시로 잡히고 그만큼 문자가 만들어진다. */
  const before = JSON.parse(SHEETS['_roster']._rows[0][0]).classes;
  const saved = ctx.setRoster_([
    { label: '화학1 일6-10', students: ['홍길동', '김민준'], round: null },
    { label: '파이널 목7-10', kind: 'exam', students: ['홍길동', '박서준'], round: 3 },
  ]);
  T('갈래를 적어 둔다', saved[0].kind === 'dt' && saved[1].kind === 'exam',
    JSON.stringify(saved.map(k => [k.label, k.kind])));
  /* 파이널 반에 이름으로 과목을 붙이면 DT 가 자기 반으로 착각한다. */
  T('파이널 반에는 DT 과목을 안 붙인다', saved[1].course === '', JSON.stringify(saved[1]));
  T('DT 반은 예전처럼 과목을 붙인다', saved[0].course === 'ch1');
  /* 회차도 지운다 — 남겨 두면 그 회차로 미응시를 세려다 만다. */
  T('파이널 반은 회차를 안 갖는다', saved[1].round === null, String(saved[1].round));

  const ab = ctx.computeAbsentees_(8, {});
  const labels = (ab.classes || ab || []).map(c => c.label);
  T('미응시에 파이널 반이 안 뜬다', labels.indexOf('파이널 목7-10') < 0, JSON.stringify(labels));
  T('DT 반은 그대로 뜬다', labels.indexOf('화학1 일6-10') >= 0, JSON.stringify(labels));

  /* 셸이 갈래를 알아야 DT 알림 대상을 가를 수 있다. */
  const nm = J(ctx.doGet({ parameter: { action: 'names' } }));
  const byLabel = {};
  (nm.classes || []).forEach(c => { byLabel[c.label] = c; });
  T('명단 창구가 갈래를 같이 준다',
    byLabel['파이널 목7-10'] && byLabel['파이널 목7-10'].kind === 'exam',
    JSON.stringify((nm.classes || []).map(c => [c.label, c.kind])));
  T('안 적은 반은 DT 로 본다(옛 명단 호환)',
    ctx.kindOf_({ label: '화학2 토6-10' }) === 'dt');

  ctx.setRoster_(before);                      // 원래 명단으로 되돌린다
}

console.log('[동명이인] 같은 반에 이름이 같은 학생 둘');
{
  /* 화학1 일6-10 반에 홍길동(한별중)·홍길동(두레중) 두 학생이 있다.
     여태 명단은 이름 글자열 배열이라 둘을 구분할 수 없었고, 한 명만
     등록돼 반 인원이 한 명 모자랐다. 한 명이 시험을 보면 이름만으로
     맞춰 보니 **둘 다 응시한 것**이 되어 미응시 문자가 안 나갔다. */
  const before = JSON.parse(SHEETS['_roster']._rows[0][0]).classes;
  const saved = ctx.setRoster_([
    { label: '화학1 일6-10', round: null, students: [
      { n: '홍길동', s: '한별중' },
      { n: '홍길동', s: '두레중' },
      '김철수',                                   // 학교 없는 옛 칸도 그대로
    ] },
  ]);
  T('두 홍길동이 다 남는다', (saved[0].students || []).length === 3,
    JSON.stringify(saved[0].students));
  T('학교를 적은 칸만 객체로 남는다',
    typeof saved[0].students[0] === 'object' && saved[0].students[2] === '김철수',
    JSON.stringify(saved[0].students));

  /* 명단 창구가 **명단에 적은 학교**를 그대로 내줘야 한다. 시트에서 이름만으로
     찾으면 동명이인이 최근 기록 하나로 뭉개져 둘이 같은 학교로 보인다. */
  const nm = J(ctx.doGet({ parameter: { action: 'names' } }));
  const cls = (nm.classes || []).filter(c => c.label === '화학1 일6-10')[0] || {};
  const kims = (cls.students || []).filter(x => x.name === '홍길동');
  T('창구가 두 명을 다 준다', kims.length === 2,
    JSON.stringify(cls.students));
  T('학교가 서로 다르다', kims.length === 2 && kims[0].school !== kims[1].school,
    JSON.stringify(kims));
  /* ⚠ 이름은 **그대로 '홍길동'** 이어야 한다. 여기에 학교를 붙이면 학부모에게
     '홍길동 한별중 학생' 이라고 문자가 나간다. */
  T('이름에 학교를 안 붙인다', kims.every(x => x.name === '홍길동'),
    JSON.stringify(kims.map(x => x.name)));

  /* 미응시: 한 명만 시험을 봤을 때 나머지 한 명이 잡혀야 한다. */
  /* 시트 이름은 '결과' 다. 한 명(한별중)만 9회를 봤다고 적어 둔다. */
  SHEETS['결과']._rows.push(
    ['홍길동', 'L', new Date(), 55, '통과', '한별중-홍길동', '한별중', '2',
     'ch1', 9, '정시', 30, 30, '', '{}', '', '[]', '[]', 'O'.repeat(60)]);
  const ab = ctx.computeAbsentees_(8, { '화학1 일6-10': 9 });
  const c = (ab.classes || []).filter(x => x.label === '화학1 일6-10')[0] || {};
  T('본 사람은 미응시에서 빠진다',
    (c.absentWho || []).filter(w => w.name === '홍길동' && w.school === '한별중').length === 0,
    JSON.stringify(c.absentWho));
  T('안 본 동명이인은 그대로 잡힌다',
    (c.absentWho || []).filter(w => w.name === '홍길동' && w.school === '두레중').length === 1,
    JSON.stringify(c.absentWho));
  /* ⚠ 옛 화면·문자·메일이 읽는 absent 는 **글자열 배열**이어야 한다.
     객체를 넣으면 문자가 '[object Object] 학생' 이 된다. */
  T('absent 는 이름 글자열 그대로', (c.absent || []).every(x => typeof x === 'string'),
    JSON.stringify(c.absent));
  T('absent 와 absentWho 의 길이가 같다',
    (c.absent || []).length === (c.absentWho || []).length,
    (c.absent || []).length + ' vs ' + (c.absentWho || []).length);

  SHEETS['결과']._rows.pop();

  /* ── 이름 칸에 학교를 붙여 적어 둔 옛 명단 ──────────────────────────
     명단에 두 명을 넣을 방법이 없던 때 이름 칸에 '홍길동 두레중' 이라고
     적어 구분해 두었다. 그 값이 그대로 문자에 실려 학부모에게
     "홍길동 두레중 학생" 이라고 나갔다 — 실제로 그렇게 나갔다. */
  const saved2 = ctx.setRoster_([
    { label: '화학1 일6-10', round: null,
      students: ['홍길동 한별중', '홍길동 두레중', '김철수'] },
  ]);
  T('이름 칸의 학교를 갈라 낸다',
    ctx.stuName_(saved2[0].students[0]) === '홍길동' &&
    ctx.stuSchool_(saved2[0].students[0]) === '한별중',
    JSON.stringify(saved2[0].students));
  const nm2 = J(ctx.doGet({ parameter: { action: 'names' } }));
  const cls2 = (nm2.classes || []).filter(c => c.label === '화학1 일6-10')[0] || {};
  T('창구가 내주는 이름에는 학교가 없다',
    (cls2.students || []).every(x => !/[초중고]$/.test(x.name)),
    JSON.stringify((cls2.students || []).map(x => x.name)));
  T('학교는 따로 온다',
    (cls2.students || []).filter(x => x.name === '홍길동').map(x => x.school).sort()
      .join(',') === '두레중,한별중',
    JSON.stringify((cls2.students || []).map(x => [x.name, x.school])));
  /* 붙여 쓴 이름은 안 가른다 — 멀쩡한 이름이 잘리면 더 나쁘다. */
  T('구분자가 없으면 안 가른다', ctx.splitSchool_('홍길동두레중').school === '');
  T('짧은 이름은 안 가른다', ctx.splitSchool_('김 두레중').name === '김 두레중');

  ctx.setRoster_(before);
}

console.log('[재시 되감기 금지] 더 나중 시도가 있으면 낮은 시도는 안 받는다');
{
  /* 재시에 떨어진 학생이 성적표 링크로 다시 들어오면 앱이 «재시» 부터 다시 시작해
     이전 재시 행을 덮어썼다(멱등 덮어쓰기가 되감기까지 받아 준 셈). 서버가 막는다:
     같은 (학생·과목·회차)에 더 높은 시도가 있으면 낮은 시도는 attempt_regress.
     같은 라벨의 재저장(네트워크 재시도)은 그대로 멱등. TEST 행과 실제 행은 서로 안 본다. */
  const sh = SHEETS['결과'];
  const before = sh._rows.length;
  const base = { name: '검사', school: '가상중', year: '2', course: 'ch1', round: 7, isTest: false,
    score: 60, pass: false, correctCount: 36, wrongCount: 24, wrongMis: ['몰 개념'], wrongAxes: {}, units: [], axes: [], answers: 'X'.repeat(60) };
  const post = d => J(ctx.doPost({ postData: { contents: JSON.stringify(d) } }));
  let r1 = post(Object.assign({}, base, { attempt: '첫 응시' }));
  T('첫 응시 저장 ok', r1.ok === true);
  let r2 = post(Object.assign({}, base, { attempt: '재시', score: 70, retakeCids: 'CH1-001,CH1-002', retakeKeys: 'OX', retakeUnasked: '몰 개념|원자 구조' }));
  T('재시 저장 ok', r2.ok === true);
  /* 재시 행에 세 칸이 실린다 — 앞 19열은 그대로, 뒤에 붙는다. */
  const rowRe = sh._rows.filter(r => r[5] === '가상중-검사' && r[10] === '재시')[0];
  T('재시 행 뒤 세 칸: 재시개념·재시정답·재시미출제', !!rowRe && rowRe[19] === 'CH1-001,CH1-002' && rowRe[20] === 'OX' && rowRe[21] === '몰 개념|원자 구조', JSON.stringify(rowRe && rowRe.slice(18)));
  T('헤더도 세 칸이 늘었다(자동 갱신)', sh._rows[0].length === 22 && sh._rows[0][19] === '재시개념' && sh._rows[0][21] === '재시미출제', JSON.stringify(sh._rows[0].slice(18)));
  const rowFirst = sh._rows.filter(r => r[5] === '가상중-검사' && r[10] === '첫 응시')[0];
  T('첫 응시 행의 세 칸은 빈칸', rowFirst[19] === '' && rowFirst[20] === '' && rowFirst[21] === '');
  /* 되감기: 재시가 있는데 첫 응시를 다시 보내면 거부 */
  let r3 = post(Object.assign({}, base, { attempt: '첫 응시', score: 95, pass: true }));
  T('재시 뒤 첫 응시 재저장 -> attempt_regress', r3.ok === false && r3.error === 'attempt_regress' && /더 나중 시도/.test(r3.msg), JSON.stringify(r3));
  T('거부된 저장은 시트를 안 건드린다', sh._rows.filter(r => r[5] === '가상중-검사' && r[10] === '첫 응시')[0][3] === 60);
  /* 같은 라벨은 멱등 */
  let r4 = post(Object.assign({}, base, { attempt: '재시', score: 72, retakeCids: 'CH1-001,CH1-002', retakeKeys: 'OX' }));
  T('같은 라벨(재시) 재저장은 그대로 덮어쓴다', r4.ok === true && r4.updated === true && sh._rows.filter(r => r[5] === '가상중-검사' && r[10] === '재시').length === 1);
  let r5 = post(Object.assign({}, base, { attempt: '재재시', score: 74 }));
  T('재재시 저장 ok', r5.ok === true);
  let r6 = post(Object.assign({}, base, { attempt: '재시', score: 71 }));
  T('재재시 뒤 재시 -> attempt_regress', r6.ok === false && r6.error === 'attempt_regress');
  /* TEST 행은 실제 행을 안 본다 */
  let r7 = post(Object.assign({}, base, { attempt: '첫 응시', isTest: true, score: 50 }));
  T('TEST 첫 응시는 실제 재재시가 있어도 저장된다', r7.ok === true);
  /* doGet rows 에도 세 칸이 나온다 */
  const g = J(ctx.doGet({ parameter: { student: ctx.pubId_('가상중-검사') } }));
  const gr = (g.rows || []).filter(x => x.attempt === '재시')[0];
  T('doGet rows 에 retakeCids·retakeKeys·retakeUnasked', !!gr && gr.retakeCids === 'CH1-001,CH1-002' && gr.retakeKeys === 'OX' && gr.retakeUnasked === '', JSON.stringify(gr && [gr.retakeCids, gr.retakeKeys, gr.retakeUnasked]));
  /* 재시는 통과할 때까지 끝이 없다(선생님 결정 2026-09-28). 재재시까지 떨어진 학생도 «선생님과 1:1» 로
     따로 빠지지 않고 그냥 다음 재시(재재재시 = 재시 3차)가 필요한 학생이다. */
  const P1 = ctx.computePending_(3650);
  const pr = (P1.active || []).concat(P1.stale || []).filter(x => x.studentKey === '가상중-검사' && x.course === 'ch1')[0];
  T('재재시까지 실패 -> 다음은 재재재시 (1:1 묶음 없음)', !!pr && pr.lastAttempt === '재재시' && pr.nextNeeded === '재재재시' && !('needs1on1' in pr), JSON.stringify(pr && [pr.lastAttempt, pr.nextNeeded, pr.needs1on1]));
  T('pending 응답 어디에도 needs1on1 이 없다', !JSON.stringify(P1).includes('needs1on1'));
  /* 넷째 시도(재재재시) 저장 · 그 뒤 낮은 시도는 거부 · 다섯째도 받는다 */
  let r8 = post(Object.assign({}, base, { attempt: '재재재시', score: 76, retakeCids: 'CH1-001', retakeKeys: 'O', retakeUnasked: '' }));
  T('재재재시(재시 3차) 저장 ok', r8.ok === true && sh._rows.some(r => r[5] === '가상중-검사' && r[10] === '재재재시' && r[3] === 76), JSON.stringify(r8));
  let r9 = post(Object.assign({}, base, { attempt: '재재시', score: 90, pass: true }));
  T('재재재시 뒤 재재시 -> attempt_regress (시트 불변)', r9.ok === false && r9.error === 'attempt_regress' && sh._rows.filter(r => r[5] === '가상중-검사' && r[10] === '재재시')[0][3] === 74, JSON.stringify(r9));
  const P2 = ctx.computePending_(3650);
  const pr2 = (P2.active || []).concat(P2.stale || []).filter(x => x.studentKey === '가상중-검사' && x.course === 'ch1')[0];
  T('재재재시 실패 -> 다음은 재재재재시', !!pr2 && pr2.lastAttempt === '재재재시' && pr2.nextNeeded === '재재재재시', JSON.stringify(pr2 && [pr2.lastAttempt, pr2.nextNeeded]));
  let r10 = post(Object.assign({}, base, { attempt: '재재재재시', score: 88, pass: true }));
  T('재재재재시(재시 4차) 통과 저장 ok', r10.ok === true);
  const P3 = ctx.computePending_(3650);
  T('통과하면 pending 에서 빠진다', !(P3.active || []).concat(P3.stale || []).some(x => x.studentKey === '가상중-검사' && x.course === 'ch1'));
  let r11 = post(Object.assign({}, base, { attempt: '재재재재재시', score: 50 }));
  T('통과 뒤 재시 -> already_passed', r11.ok === false && r11.error === 'already_passed', JSON.stringify(r11));
  /* cleanupPassedRetakes — 넷째 재시에서 통과했으면 그 뒤 행만 지운다(앞 시도는 그대로) */
  const snap = sh._rows.map(r => r.slice());
  sh._rows.push(['검사','L',D2,40,'미달','가상중-검사','가상중','2','ch1',7,'재재재재재시',24,36,'','{}','','[]','[]','X'.repeat(60)]);
  ctx.cleanupPassedRetakes();
  const left = sh._rows.filter(r => r[5] === '가상중-검사' && r[8] === 'ch1' && String(r[9]) === '7').map(r => r[10]);   // 첫 응시 행은 위에서 TEST 로 덮였다(멱등 저장) — 그대로 센다
  T('cleanupPassedRetakes: 재재재재시 통과 뒤의 재재재재재시만 지운다', left.join(',') === '첫 응시,재시,재재시,재재재시,재재재재시', left.join(','));
  sh._rows.length = 0; snap.forEach(r => sh._rows.push(r));
  /* 사람에게 보이는 이름 — 서버 메일(weeklyPendingEmail)도 셋째 재시부터 「재시 k차」 */
  T('attDisp_: 정시·재시·재재시·재시 3차·재시 4차', [ctx.attDisp_('첫 응시'), ctx.attDisp_('재시'), ctx.attDisp_('재재시'), ctx.attDisp_('재재재시'), ctx.attDisp_('재재재재시')].join('|') === '정시|재시|재재시|재시 3차|재시 4차');
  sh._rows.length = before;                       // 심은 줄을 걷어낸다
}

console.log('[이미 통과 판정] TEST 통과 행은 실제 재시를 막지 않는다 (hasPassed_ 도 isTest 쪽만 본다)');
{
  /* index.html enterRetake 는 «같은 쪽(TEST 여부)의 통과 행» 만 본다. 서버 hasPassed_ 가 TEST 를 안 가리면
     실제 학생의 유일한 통과 행이 TEST 행일 때 화면은 게이트·재시를 내주고 서버만 already_passed 로 거부해
     «시트에 저장되지 않았습니다» 가 떴다. 서버도 같은 쪽만 본다. */
  const sh = SHEETS['결과'];
  const before = sh._rows.length;
  const base = { name: '검사둘', school: '가상중', year: '2', course: 'ch1', round: 9,
    score: 60, pass: false, correctCount: 36, wrongCount: 24, wrongMis: [], wrongAxes: {}, units: [], axes: [], answers: 'X'.repeat(60) };
  const post = d => J(ctx.doPost({ postData: { contents: JSON.stringify(d) } }));
  /* 같은 (학생·과목·회차·시도) 는 TEST 여부와 무관하게 한 행이다(findRow_ 멱등 덮어쓰기). 그래서 TEST 통과 행은
     다른 라벨(재시)로 둔다 — 선생님이 ?test=1 로 재시를 시험해 본 뒤 실제 학생이 첫 응시를 본 꼴. */
  T('TEST 재시 통과 저장', post(Object.assign({}, base, { attempt: '재시', isTest: true, score: 95, pass: true })).ok === true);
  T('실제 첫 응시 미달 저장', post(Object.assign({}, base, { attempt: '첫 응시', isTest: false })).ok === true);
  T('hasPassed_ 실제 쪽: TEST 통과 행은 안 센다', ctx.hasPassed_(sh, '가상중-검사둘', 'ch1', 9, false) === false);
  T('hasPassed_ TEST 쪽: TEST 통과 행을 센다', ctx.hasPassed_(sh, '가상중-검사둘', 'ch1', 9, true) === true);
  const r1 = post(Object.assign({}, base, { attempt: '재시', isTest: false, score: 70, retakeCids: 'CH1-001', retakeKeys: 'O' }));
  T('TEST 통과 행만 있으면 실제 재시는 저장된다(already_passed 아님)', r1.ok === true, JSON.stringify(r1));
  const r2 = post(Object.assign({}, base, { attempt: '재시', isTest: false, score: 90, pass: true, retakeCids: 'CH1-001', retakeKeys: 'O' }));
  T('실제 재시 통과 재저장(같은 라벨·멱등)', r2.ok === true && r2.updated === true);
  const r3 = post(Object.assign({}, base, { attempt: '재재시', isTest: false, score: 50 }));
  T('실제 통과 행이 있으면 실제 재재시는 already_passed', r3.ok === false && r3.error === 'already_passed' && /이미 통과/.test(r3.msg), JSON.stringify(r3));
  sh._rows.length = before;
}

console.log('[재시 세 칸 읽기] T·U·V 잔여 값은 재시 칸으로 읽지 않는다 (retakeCols_)');
{
  /* 이 열들에는 전체열 수식이 남아 있던 적이 있다. 잔여 값이 재시개념·재시정답으로 나가면 index.html 의
     문항 대조가 «불일치» 로 빠지고 성적표가 엉뚱한 값을 개념 목록으로 읽는다. 앱이 적은 꼴만 받는다. */
  const D = new Date('2026-07-01T01:00:00Z');
  const row = (att, t, u, v) => ['검사셋', 'L', D, 60, '미달', '가상중-검사셋', '가상중', '2', 'ch1', 9, att, 36, 24, '', '{}', '', '[]', '[]', 'X'.repeat(60), t, u, v];
  let m = ctx.mapRow_(row('첫 응시', '#N/A', 'OX', '뭔가'));
  T('첫 응시 행의 세 칸은 무엇이 있어도 빈칸', m.retakeCids === '' && m.retakeKeys === '' && m.retakeUnasked === '', JSON.stringify([m.retakeCids, m.retakeKeys, m.retakeUnasked]));
  m = ctx.mapRow_(row('재시', 'CH1-001,CH1-002,', 'OXO', '몰 개념|원자 구조'));
  T('재시 행의 앱 꼴(cid 목록 · O/X · 빈 토큰 허용)은 그대로', m.retakeCids === 'CH1-001,CH1-002,' && m.retakeKeys === 'OXO' && m.retakeUnasked === '몰 개념|원자 구조', JSON.stringify(m));
  m = ctx.mapRow_(row('재시', 'CH1-001,CH1-002', '#REF!', ''));
  T('재시정답이 O/X 꼴이 아니면 세 칸 모두 빈칸(옛 행 취급)', m.retakeCids === '' && m.retakeKeys === '' && m.retakeUnasked === '');
  m = ctx.mapRow_(row('재시', 'CH1-001,CH1-002', 'OXO', ''));
  T('개념 수와 정답 수가 다르면 세 칸 모두 빈칸', m.retakeCids === '' && m.retakeKeys === '');
  m = ctx.mapRow_(row('재시', 12345, 'OX', ''));
  T('개념 칸이 숫자 잔여값이면 빈칸', m.retakeCids === '' && m.retakeKeys === '', JSON.stringify(m.retakeCids));
  m = ctx.mapRow_(row('재재시', '', '', ''));
  T('빈칸은 빈칸', m.retakeCids === '' && m.retakeKeys === '' && m.retakeUnasked === '');
  m = ctx.mapRow_(row('재시', undefined, undefined, undefined));
  T('옛 행(칸 자체가 없음)도 빈칸', m.retakeCids === '' && m.retakeKeys === '' && m.retakeUnasked === '');
}

console.log('[게이트 form 예약] 재시·재재시 몫 두 문장은 게이트가 안 쓴다');
{
  const CE = require('../chemengine.js');
  const FB = {
    'T-2': { m: '둘짜리', forms: [{ a: 'O', s: 'A 옳다', f: 'A 옳다', w: '' }, { a: 'X', s: 'A 틀리다', f: 'A 옳다', w: '' }] },
    'T-5': { m: '다섯짜리', forms: [1, 2, 3, 4, 5].map(i => ({ a: 'O', s: '문장' + i, f: '문장' + i, w: '' })) },
    'T-3': { m: '셋짜리', forms: [1, 2, 3].map(i => ({ a: 'O', s: '셋' + i, f: '셋' + i, w: '' })) },
  };
  T('GATE_RESERVE = 2', CE.GATE_RESERVE === 2);
  /* form 2개 · 틀린 문장도 옳은 문장도 form 이 아닌 경우 → 새로 쓰는 form 0, 폴백 2 */
  let seen = {};
  let gt = CE.buildGate([{ c: 'T-2', unit: 'u', mis: '둘짜리', fix: '따로 적은 옳은 문장', why: '', s: '학생이 틀린 문장', a: 'X' }], FB, seen).gates[0];
  T('form 2개: 새로 쓰는 form 0', gt.checks.every(c => !FB['T-2'].forms.some(f => CE.norm(f.s) === CE.norm(c.s))), JSON.stringify(gt.checks.map(c => c.s)));
  T('form 2개: 폴백 2 (① 옳은 문장 O, ② 틀린 문장을 원래 정답으로)', gt.checks.length === 2 && gt.checks[0].s === '따로 적은 옳은 문장' && gt.checks[0].a === 'O' && gt.checks[1].s === '학생이 틀린 문장' && gt.checks[1].a === 'X', JSON.stringify(gt.checks));
  T('form 2개: 둘 다 seen 에 안 들어간다(재시 몫)', !seen[CE.norm('A 옳다')] && !seen[CE.norm('A 틀리다')]);
  T('check(첫 확인) 도 폴백이다', gt.check === gt.checks[0] && gt.fallback === true);
  /* 실제 자료의 꼴: fix 가 곧 O form 이다(form≤2 개념 339문항 전부). 그 옳은 문장은 form 이라 안 쓴다 → ② 만 */
  seen = { [CE.norm('A 틀리다')]: 1 };
  gt = CE.buildGate([{ c: 'T-2', unit: 'u', mis: '둘짜리', fix: 'A 옳다', why: '', s: 'A 틀리다', a: 'X' }], FB, seen).gates[0];
  T('fix 가 form 이면 안 쓴다: 확인 문제 1개(틀린 문장), O form 은 재시 몫으로 남는다', gt.checks.length === 1 && gt.checks[0].s === 'A 틀리다' && gt.checks[0].a === 'X' && !seen[CE.norm('A 옳다')], JSON.stringify(gt.checks));
  /* form 5개 → 새 form 2개, seen 에 들어간다 */
  seen = {};
  gt = CE.buildGate([{ c: 'T-5', unit: 'u', mis: '다섯짜리', fix: 'x', why: '', s: '문장1', a: 'O' }], FB, seen).gates[0];
  T('form 5개: 새로 쓰는 form 2', gt.checks.length === 2 && gt.checks.every(c => FB['T-5'].forms.some(f => f.s === c.s)) && Object.keys(seen).length === 2, JSON.stringify(gt.checks.map(c => c.s)));
  T('form 5개: 폴백 아님', gt.fallback === false && gt.checks.every(c => !c.fallback));
  /* form 3개 → 새 form 1개 + 폴백 1개 */
  seen = {};
  gt = CE.buildGate([{ c: 'T-3', unit: 'u', mis: '셋짜리', fix: '옳은 문장 따로', why: '', s: '학생 오답', a: 'X' }], FB, seen).gates[0];
  T('form 3개: 새 form 1 + 폴백 1', gt.checks.length === 2 && FB['T-3'].forms.some(f => f.s === gt.checks[0].s) && gt.checks[1].fallback === true, JSON.stringify(gt.checks.map(c => c.s)));
  /* 게이트가 남긴 form 을 재시가 실제로 쓴다 — 방금 답을 본 문장이 재시에 그대로 나오지 않는다 */
  seen = { [CE.norm('A 틀리다')]: 1 }; const ws = { [CE.norm('A 틀리다')]: 1 };
  const g2 = CE.buildGate([{ c: 'T-2', unit: 'u', mis: '둘짜리', fix: 'A 옳다', why: '', s: 'A 틀리다', a: 'X' }], FB, seen).gates[0];
  const rt = CE.buildRetake(2, [{ v: 'C', items: [{ c: 'T-2', u: 'u', a: 'X', s: 'A 틀리다', f: 'A 옳다', w: '' }] }], ['T-2'], FB, seen, ws);
  T('재시 문장은 게이트 확인 문장과 겹치지 않는다', rt.items.length === 1 && rt.items[0].s === 'A 옳다' && !g2.checks.some(c => c.s === rt.items[0].s), JSON.stringify([g2.checks.map(c => c.s), rt.items.map(x => x.s)]));
}

/* ── 오개념 대표 이름 · 서버 집계 ──────────────────────────────────
   같은 개념이 시트에 두 이름으로 적혀 있다 — `불활성 기체` 는 2026-08 에 `비활성 기체` 로
   표기를 통일했지만 그 전에 쌓인 행은 옛 표기 그대로다. 서버 cumulative_ 가 이름을 글자로
   세면 두 회차를 틀린 학생의 고질이 한 회차짜리 둘로 갈려 «반복해서 막히는 개념» 에 안 뜬다.
   chemengine.js 의 MIS_CANON·misCanon 과 같은 표로 세는지, 표가 같은지, 세 곳(엔진
   cumulative · spacedReview · 서버 cumulative_)이 같은 답을 내는지 실제로 돌려 본다
   (글자 비교는 tools/engine_sync.py --check 가 한다). */
console.log('[오개념 대표 이름] 서버 cumulative_ 가 chemengine.js 와 같은 표로 센다');
{
  const CE = require('../chemengine.js');
  T('apps-script.gs 에 misCanon 이 있다', typeof ctx.misCanon === 'function');
  T('MIS_CANON 표가 chemengine.js 와 같다', JSON.stringify(ctx.MIS_CANON) === JSON.stringify(CE.MIS_CANON));
  T("misCanon('불활성 기체') → '비활성 기체' (대표 이름은 그대로)",
    ctx.misCanon('불활성 기체') === '비활성 기체' && ctx.misCanon('비활성 기체') === '비활성 기체');
  /* 비활성 기체는 화학Ⅰ 7·13회 정시에서 묻는다(ROUND_MIS). 7회(옛 표기)·13회에서 틀리고, 묻지 않는 14회에서도
     틀렸으면(표에 없어도 틀렸으면 물은 것) 출제 3 · 틀림 3 — 고질이다. 이름이 갈리면 2·1 로 쪼개져 안 뜬다.
     ⚠ 예전에는 일반화학 5회(같은 이름을 묻는다)를 붙여 «출제 3» 을 채웠다 — 과목을 넘어 합친 것이라 7단계 2차에서
       고쳤다. 아래에서 그 행으로 과목이 갈리는지도 본다. */
  const rows = [
    { course: 'ch1', round: 7, attempt: '첫 응시', score: 70, pass: false, isTest: false, wrongMis: ['불활성 기체'], wrongAxes: {} },
    { course: 'ch1', round: 13, attempt: '첫 응시', score: 75, pass: false, isTest: false, wrongMis: ['비활성 기체'], wrongAxes: {} },
    { course: 'ch1', round: 14, attempt: '첫 응시', score: 80, pass: true, isTest: false, wrongMis: ['불활성 기체'], wrongAxes: {} },
  ];
  const c = ctx.cumulative_(rows);
  T('불활성 기체(7·14회) + 비활성 기체(13회) · 출제 3회 → 고질 하나 · 비활성 기체 · 3회 틀림 · 출제 3',
    c.chronicMis.length === 1 && c.chronicMis[0].mis === '비활성 기체' && c.chronicMis[0].rounds === 3 && c.chronicMis[0].asked === 3, JSON.stringify(c.chronicMis));
  const e = CE.cumulative(rows.map(r => Object.assign({ studentKey: 'k' }, r)))['k'];
  T('chemengine.js cumulative 와 같은 고질', JSON.stringify(e.chronicMis) === JSON.stringify(c.chronicMis), JSON.stringify([e.chronicMis, c.chronicMis]));
  /* 과목을 넘어 합치지 않는다: 화학Ⅰ 7·13회 + 일반화학 5회(같은 이름) — 어느 과목으로 봐도 출제 2회 이하라 고질이 아니다. */
  const mixed = [rows[0], rows[1], { course: 'gc', round: 5, attempt: '첫 응시', score: 60, pass: false, isTest: false, wrongMis: ['비활성 기체'], wrongAxes: {} }];
  const mc = ctx.cumulative_(mixed), mc1 = ctx.cumulative_(mixed, 'ch1');
  const me = CE.cumulative(mixed.map(r => Object.assign({ studentKey: 'k' }, r)))['k'], me1 = CE.cumulative(mixed.map(r => Object.assign({ studentKey: 'k' }, r)), 'ch1')['k'];
  T('화학Ⅰ+일반화학 학생: 고질 분자가 과목을 넘어 합쳐지지 않는다(서버·엔진, 두 과목 어느 쪽으로 봐도)',
    mc.chronicMis.length === 0 && mc1.chronicMis.length === 0 && me.chronicMis.length === 0 && me1.chronicMis.length === 0
    && mc.course === 'gc' && mc1.course === 'ch1' && me.course === 'gc' && me1.course === 'ch1',
    JSON.stringify([mc.chronicMis, mc1.chronicMis, mc.course, mc1.course]));
  const sr = CE.spacedReview(rows.slice(0, 2).map(r => Object.assign({}, r, { round: r.round === 7 ? 1 : 2 })), 3);
  T('chemengine.js spacedReview 도 대표 이름 하나로 센다(2회 틀림)', sr.length === 1 && sr[0].mis === '비활성 기체' && sr[0].times === 2, JSON.stringify(sr));
  /* 대표 시도(finalScore)도 서버·엔진이 같은 규칙 — 처음 통과한 시도, 없으면 마지막 */
  const rows2 = [
    { course: 'ch1', round: 1, attempt: '첫 응시', score: 70, pass: false, isTest: false, wrongMis: [], wrongAxes: {} },
    { course: 'ch1', round: 1, attempt: '재시', score: 85, pass: true, isTest: false, wrongMis: [], wrongAxes: {} },
    { course: 'ch1', round: 1, attempt: '재재시', score: 60, pass: false, isTest: false, wrongMis: [], wrongAxes: {} },
  ];
  const c2 = ctx.cumulative_(rows2).trend[0], e2 = CE.cumulative(rows2.map(r => Object.assign({ studentKey: 'k' }, r)))['k'].trend[0];
  T('대표 시도 = 처음 통과한 재시(85) · 서버와 엔진이 같다(마지막 60 아님)',
    c2.finalScore === 85 && c2.finalAttempt === '재시' && e2.finalScore === 85 && e2.finalAttempt === '재시', JSON.stringify([c2, e2]));
}

/* ── 고질 문턱: 출제 3회 이상 · 절반 이상 틀림 (선생님 결정 2026-09-28) ─────────────
   예전에는 «서로 다른 두 회차에서 틀림» 이면 고질이었다 — 몇 번 물었는지는 안 봤다.
   «물었다» 는 회차 정시 문항에 그 오개념이 있다는 뜻이고(ROUND_MIS), 회차마다 첫 응시만 센다.
   루이스 전자점식은 화학Ⅰ 1~18회 정시에 다 있다. 서버와 엔진이 같은 답을 내는지도 본다. */
console.log('[고질 문턱] 출제 3회 이상 · 절반 이상 틀림 · 서버와 엔진이 같다');
{
  const CE = require('../chemengine.js');
  T('ROUND_MIS 표가 chemengine.js 와 같다', JSON.stringify(ctx.ROUND_MIS) === JSON.stringify(CE.ROUND_MIS));
  T('문턱 두 수가 chemengine.js 와 같다(3 · 0.5)', ctx.CHRONIC_MIN_ASKED === 3 && CE.CHRONIC_MIN_ASKED === 3 && ctx.CHRONIC_MIN_RATE === 0.5 && CE.CHRONIC_MIN_RATE === 0.5);
  const M = '루이스 전자점식';
  T('루이스 전자점식은 화학Ⅰ 1~4회에서 묻는다', [1, 2, 3, 4].every(r => CE.roundMisOf('ch1', r).indexOf(M) >= 0));
  const mk = (wrongIn, n, extra) => {
    const out = [];
    for (let r = 1; r <= n; r++) out.push({ course: 'ch1', round: r, attempt: '첫 응시', score: 70, pass: false, isTest: false, wrongMis: wrongIn.indexOf(r) >= 0 ? [M] : [], wrongAxes: {} });
    return out.concat(extra || []);
  };
  const both = rows => {
    const c = ctx.cumulative_(rows), e = CE.cumulative(rows.map(r => Object.assign({ studentKey: 'k' }, r)))['k'];
    const pick = x => x.chronicMis.filter(m => m.mis === M)[0] || null;
    return { s: pick(c), e: pick(e), same: JSON.stringify(c.chronicMis) === JSON.stringify(e.chronicMis) };
  };
  let b = both(mk([1, 2], 2));
  T('출제 2회 · 2회 틀림 → 고질 아님 (출제 3회 미만)', !b.s && !b.e && b.same, JSON.stringify(b));
  b = both(mk([1, 3], 4));
  T('출제 4회 · 2회 틀림 → 고질 {rounds 2 · asked 4}', !!b.s && b.s.rounds === 2 && b.s.asked === 4 && b.same, JSON.stringify(b));
  b = both(mk([2], 4));
  T('출제 4회 · 1회 틀림 → 고질 아님', !b.s && !b.e && b.same, JSON.stringify(b));
  b = both(mk([1, 2, 3], 3));
  T('출제 3회 · 3회 틀림 → 고질 {rounds 3 · asked 3}', !!b.s && b.s.rounds === 3 && b.s.asked === 3 && b.same, JSON.stringify(b));
  /* 재시에서 틀린 것은 세지 않는다 — 회차마다 첫 응시만 */
  b = both(mk([1], 4, [{ course: 'ch1', round: 2, attempt: '재시', score: 70, pass: false, isTest: false, wrongMis: [M], wrongAxes: {} },
                       { course: 'ch1', round: 2, attempt: '재재시', score: 90, pass: true, isTest: false, wrongMis: [M], wrongAxes: {} }]));
  T('재시·재재시에서만 틀린 회차는 세지 않는다 → 출제 4 · 틀림 1 → 고질 아님', !b.s && !b.e && b.same, JSON.stringify(b));
  /* 표에 없는 회차(과목)는 틀린 것만 물은 것으로 센다 */
  const odd = [1, 2, 3].map(r => ({ course: 'zz', round: r, attempt: '첫 응시', score: 70, pass: false, isTest: false, wrongMis: r < 3 ? ['표밖 개념'] : [], wrongAxes: {} }));
  const co = ctx.cumulative_(odd).chronicMis;
  T('표에 없는 회차: 틀린 두 회차만 물은 것으로 → 출제 2 → 고질 아님', co.length === 0, JSON.stringify(co));
}

/* ── 재시는 더 쉽게: 문장에 lvl 이 있으면 낮은 것부터 (선생님 결정 2026-09-28) ─────────
   retakeC 문항과 forms_bank 문장에 lvl(1 기본 · 2 표준 · 3 심화)이 붙기 시작한다. 후보를 고를 때
   lvl 이 낮은 것부터 보고, lvl 이 없는 문장은 정시 원래 문항의 lvl 로 본다. 이미 본 문장·틀린 문장
   규칙과 GATE_RESERVE 는 그대로이고, lvl 이 하나도 없으면 결과가 예전과 같다. */
console.log('[재시 난이도] lvl 이 낮은 문장을 먼저 고른다 · 없으면 예전과 같다');
{
  const CE = require('../chemengine.js');
  const N = CE.norm;
  const F = (s, a, lvl) => Object.assign({ a, s, f: s + ' (옳음)', w: '' }, lvl != null ? { lvl } : {});
  const FB = {
    'L-1': { m: '틀린 개념', forms: [F('어려운 문장', 'O', 3), F('표시 없는 문장', 'X'), F('쉬운 문장', 'O', 1), F('보통 문장', 'X', 2)] },
    'L-2': { m: '맞힌 개념', forms: [F('맞힌 개념 쉬운 문장', 'O', 1), F('맞힌 개념 표준 문장', 'X', 2)] },
  };
  const VER = [{ v: 'C', items: [{ c: 'L-1', u: 'u', a: 'O', s: '재시판 틀린 개념 원문', f: '', w: '' },
                                 { c: 'L-2', u: 'u', a: 'X', s: '재시판 맞힌 개념 원문', f: '', w: '', lvl: 3 }] }];
  const REF = [{ c: 'L-1', lvl: 2 }, { c: 'L-2', lvl: 2 }];
  const run = (fb, ver, seen, ws) => CE.buildRetake(2, ver, ['L-1'], fb, seen || {}, ws || {}, REF);
  let rt = run(FB, VER);
  T('틀린 개념: lvl 1 문장이 먼저 (어려운 문장이 앞에 있어도)', rt.items[0].s === '쉬운 문장' && rt.items[0].lvl === 1, JSON.stringify(rt.items[0]));
  T('맞힌 개념: 원문(lvl 3)보다 쉬운 안 본 문장(lvl 1)이 있으면 그것', rt.items[1].s === '맞힌 개념 쉬운 문장' && rt.items[1].lvl === 1, JSON.stringify(rt.items[1]));
  T('같은 입력이면 같은 결과', JSON.stringify(run(FB, VER).items) === JSON.stringify(rt.items));
  /* 보장은 그대로 — 틀린 문장은 lvl 이 낮아도 절대 안 낸다, 이미 본 문장은 안 본 것이 있으면 피한다 */
  rt = run(FB, VER, { [N('보통 문장')]: 1 }, { [N('쉬운 문장')]: 1 });
  T('틀린 문장(lvl 1)은 안 내고, 본 문장(lvl 2)은 피해 → 표시 없는 문장(=정시 lvl 2)', rt.items[0].s === '표시 없는 문장' && !('lvl' in rt.items[0]), JSON.stringify(rt.items[0]));
  /* lvl 이 없는 문장은 정시 원래 문항의 lvl 로 본다 */
  const FB2 = { 'L-1': { m: 'x', forms: [F('표준 표시', 'O', 2), F('표시 없음', 'X')] } };
  const V2 = [{ v: 'C', items: [{ c: 'L-1', u: 'u', a: 'O', s: '원문', f: '', w: '' }] }];
  T('정시 lvl 1 이면 표시 없는 문장(=1)이 lvl 2 보다 먼저', CE.buildRetake(2, V2, ['L-1'], FB2, {}, {}, [{ c: 'L-1', lvl: 1 }]).items[0].s === '표시 없음');
  T('정시 lvl 3 이면 lvl 2 가 표시 없는 문장(=3)보다 먼저', CE.buildRetake(2, V2, ['L-1'], FB2, {}, {}, { 'L-1': 3 }).items[0].s === '표준 표시');
  /* lvl 이 하나도 없으면 예전과 글자까지 같다(원래 순서 · lvl 칸도 안 생긴다) */
  const strip = fb => JSON.parse(JSON.stringify(fb, (k, v) => (k === 'lvl' ? undefined : v)));
  const a1 = CE.buildRetake(2, strip(VER), ['L-1'], strip(FB), {}, {}, REF), a0 = CE.buildRetake(2, strip(VER), ['L-1'], strip(FB), {}, {});
  T('lvl 이 없으면 첫 form · 원문 그대로 (refLvl 을 줘도 안 줘도 같다)', a1.items[0].s === '어려운 문장' && a1.items[1].s === '재시판 맞힌 개념 원문' && JSON.stringify(a1) === JSON.stringify(a0) && !JSON.stringify(a1.items).includes('"lvl"'), JSON.stringify(a1.items));
  /* 게이트는 난이도 순서를 안 쓴다 — 쉬운 문장은 재시 몫으로 남긴다. 예약 두 개(GATE_RESERVE)도 그대로 */
  const FB3 = { 'G-1': { m: 'g', forms: [F('g3', 'O', 3), F('g3b', 'X', 3), F('g2', 'O', 2), F('g1', 'X', 1), F('gx', 'O')] } };
  const gt = CE.buildGate([{ c: 'G-1', unit: 'u', mis: 'g', lvl: 2, fix: 'x', why: '', s: '원문', a: 'O' }], FB3, {}).gates[0];
  T('게이트: form 5개 중 2개를, 원래 순서대로(g3 · g3b — 쉬운 g1·g2 는 재시 몫)', gt.checks.map(c => c.s).join(',') === 'g3,g3b', JSON.stringify(gt.checks.map(c => c.s)));
  /* 옛 회차는 난이도 순서를 끈다(refLvl=false) — 인쇄된 재시지·링크 재진입이 같은 문항을 받게 */
  T('이미 치른 회차는 난이도 순서 꺼짐(ch1 11 · ch2 16 · gc 7 까지)', !CE.lvlOn('ch1', 11) && CE.lvlOn('ch1', 12) && !CE.lvlOn('ch2', 16) && CE.lvlOn('ch2', 17) && !CE.lvlOn('gc', 7) && CE.lvlOn('gc', 8));
  const off = CE.buildRetake(2, VER, ['L-1'], FB, {}, {}, false);
  T('refLvl=false 면 첫 form · 원문 그대로(lvl 이 있어도)', off.items[0].s === '어려운 문장' && off.items[1].s === '재시판 맞힌 개념 원문', JSON.stringify(off.items.map(x => x.s)));
  /* 판이 모자라면 돌아간다 — 재시 3차는 셋째 판, 재시 4차는 첫 판 */
  const VV = [0, 1, 2].map(i => ({ v: 'C' + i, items: [{ c: 'V-' + i, u: 'u', a: 'O', s: '판' + i + ' 원문', f: '', w: '' }] }));
  const vOf = n => CE.buildRetake(n, VV, [], {}, {}, {}).items[0].s;
  T('판 고르기: 재시 0 · 재재시 1 · 재시 3차 2 · 재시 4차 0 · 재시 5차 1', [2, 3, 4, 5, 6].map(vOf).join(',') === '판0 원문,판1 원문,판2 원문,판0 원문,판1 원문', [2, 3, 4, 5, 6].map(vOf).join(','));
  /* 실제 자료(회차 파일·forms_bank 의 lvl) — 화학Ⅰ 5회에서 세 문항 중 하나를 틀린 학생.
     틀린 개념 자리의 문장이 lvl 을 안 볼 때보다 쉬워지고(평균이 낮거나 같고, 더 쉬운 자리가 하나 이상),
     틀린 문장은 표시(reusedWrong) 없이 다시 안 나오며, 같은 입력이면 같은 결과다. */
  {
    const FORMS = JSON.parse(fs.readFileSync('appdata/forms_bank.json', 'utf8'));
    const RD = JSON.parse(fs.readFileSync('appdata/round_ch1_05.json', 'utf8'));
    const items = RD.jeongsi.items;
    const hasLvl = Object.keys(FORMS).some(c => (FORMS[c].forms || []).some(f => f.lvl != null));
    if (!hasLvl) T('forms_bank 에 lvl 이 아직 없다 — 실제 자료 검사는 건너뛴다', true);
    else {
      const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'lvl' ? undefined : v)));
      const FS = strip(FORMS), VS = strip(RD.retakeC);
      const lvlOf = {}; Object.keys(FORMS).forEach(c => (FORMS[c].forms || []).forEach(f => { lvlOf[N(f.s)] = f.lvl; }));
      RD.retakeC.forEach(v => v.items.forEach(it => { if (lvlOf[N(it.s)] == null) lvlOf[N(it.s)] = it.lvl; }));
      const g = CE.gradeAttempt(items.map((it, i) => (i % 3 === 0 ? (it.a === 'O' ? 'X' : 'O') : it.a)), items, RD.scoring);
      const wrongC = CE.diagnose(g, FORMS).wrongConcepts.map(w => w.c).filter(Boolean);
      const base = () => { const seen = {}, ws = {}; items.forEach(it => { seen[N(it.s)] = 1; }); g.perItem.forEach((p, i) => { if (!p.ok) ws[N(items[i].s)] = 1; }); return { seen, ws }; };
      const b1 = base(), b2 = base(), b3 = base();
      const now = CE.buildRetake(2, RD.retakeC, wrongC, FORMS, b1.seen, b1.ws, items);
      const again = CE.buildRetake(2, RD.retakeC, wrongC, FORMS, b3.seen, b3.ws, items);
      const blind = CE.buildRetake(2, VS, wrongC, FS, b2.seen, b2.ws, items);          // lvl 을 못 보는 엔진 = 예전 순서
      const avg = its => { const t = its.filter(x => x.targeted); return t.reduce((a, x) => a + (lvlOf[N(x.s)] || 0), 0) / t.length; };
      const easier = now.items.filter((x, i) => x.targeted && blind.items[i].targeted && x.c === blind.items[i].c && lvlOf[N(x.s)] < lvlOf[N(blind.items[i].s)]).length;
      T('실제 자료: 틀린 개념 자리가 lvl 을 안 볼 때보다 쉽다 (평균 ' + avg(now.items).toFixed(2) + ' ≤ ' + avg(blind.items).toFixed(2) + ' · 더 쉬워진 자리 ' + easier + ')',
        avg(now.items) <= avg(blind.items) && easier > 0);
      T('실제 자료: 틀린 문장은 표시 없이 다시 안 나온다', now.items.every(x => !b1.ws[N(x.s)] || x.reusedWrong));
      T('실제 자료: 같은 입력이면 같은 결과', JSON.stringify(now.items) === JSON.stringify(again.items));
    }
  }
  T('attemptLabel·attemptName', [0, 1, 2, 3, 4].map(CE.attemptLabel).join(',') === '정시,재시,재재시,재재재시,재재재재시'
    && ['첫 응시', '재시', '재재시', '재재재시', '재재재재시'].map(a => CE.attemptName(a)).join(',') === '정시,재시,재재시,재시 3차,재시 4차'
    && CE.attemptName('첫 응시', '첫 응시') === '첫 응시');
}

console.log('[심화 기록] kind:challenge 는 「심화기록」 탭에 · ?student= 조회가 challenges 로 돌려준다');
{
  /* 선생님 결정(2026-09-28) 「기록한다」. challenge.html 이 다 푼 한 판을 kind:'challenge' 로 보낸다.
     결과 탭(정시·재시)은 한 줄도 안 건드리고, 성적표 조회(?student=)의 기존 칸도 그대로다. */
  const res = SHEETS['결과'], before = res._rows.length;
  const KEY = '가상중-심화', KEY2 = '가상중-심화둘';
  res._rows.push(['심화', 'L', D1, 90, '통과', KEY, '가상중', '2', 'ch2', 5, '첫 응시', 54, 6, '', '{}', '', '[]', '[]', 'O'.repeat(60)]);
  res._rows.push(['심화둘', 'L', D1, 90, '통과', KEY2, '가상중', '2', 'ch2', 5, '첫 응시', 54, 6, '', '{}', '', '[]', '[]', 'O'.repeat(60)]);
  const withRes = res._rows.length;
  const post = d => J(ctx.doPost({ postData: { contents: JSON.stringify(d) } }));
  const base = { kind: 'challenge', stu: ctx.pubId_(KEY), course: 'ch2', round: 5, n: 12, ok: 9,
    weakN: 6, weakOk: 4, linkN: 6, linkOk: 5, concepts: ['CH2-010', 'CH2-020+CH1-005', 'CH1-001'], isTest: false };
  T('심화기록 탭은 처음에 없다(만들어 두지 않는다)', !SHEETS['심화기록']);
  const g0 = J(ctx.doGet({ parameter: { student: ctx.pubId_(KEY) } }));
  T('탭이 없어도 조회는 된다 · challenges = []', g0.ok === true && Array.isArray(g0.challenges) && g0.challenges.length === 0, JSON.stringify(g0.challenges));
  let r1 = post(base);
  const CH = SHEETS['심화기록'];
  T('저장 ok · 탭을 그때 만든다', r1.ok === true && !!CH, JSON.stringify(r1));
  T('머리줄: 시각·학생키·과목·회차·문항수·맞음·약점문항수·약점맞음·연결문항수·연결맞음·개념·테스트',
    CH && CH._rows[0].join('|') === '시각|학생키|과목|회차|문항수|맞음|약점문항수|약점맞음|연결문항수|연결맞음|개념|테스트', CH && CH._rows[0].join('|'));
  const row = CH._rows[CH._rows.length - 1];
  T('한 줄: 학생키는 코드로 찾은 키 · 수 · 개념(쉼표)', Object.prototype.toString.call(row[0]) === '[object Date]' && row[1] === KEY && row[2] === 'ch2' && row[3] === 5 && row[4] === 12 && row[5] === 9
    && row[6] === 6 && row[7] === 4 && row[8] === 6 && row[9] === 5 && row[10] === 'CH2-010,CH2-020+CH1-005,CH1-001' && row[11] === '', JSON.stringify(row));
  T('결과 탭은 안 건드린다', res._rows.length === withRes);
  let r2 = post(base);
  T('같은 판을 다시 보내면 한 줄 (dup)', r2.ok === true && r2.dup === true && CH._rows.length === 2, JSON.stringify(r2) + ' rows=' + CH._rows.length);
  let r3 = post(Object.assign({}, base, { stu: 'zzzzzzzzzzzz' }));
  T('모르는 코드 -> error student · 안 적는다', r3.ok === false && r3.error === 'student' && CH._rows.length === 2, JSON.stringify(r3));
  let r4 = post(Object.assign({}, base, { stu: '' }));
  T('코드 없음 -> error student', r4.ok === false && r4.error === 'student');
  let r5 = post(Object.assign({}, base, { ok: 13 }));
  T('맞음 > 문항수 -> error bad', r5.ok === false && r5.error === 'bad' && CH._rows.length === 2, JSON.stringify(r5));
  let r6 = post(Object.assign({}, base, { weakN: 7, linkN: 6 }));
  T('약점+연결 > 문항수 -> error bad', r6.ok === false && r6.error === 'bad');
  let r7 = post(Object.assign({}, base, { course: 'xyz' }));
  T('모르는 과목 -> error bad', r7.ok === false && r7.error === 'bad');
  let r8 = post(Object.assign({}, base, { concepts: ['CH2-010', '<b>x</b>', 'CH2-011'] }));
  T('개념 칸에는 개념 id 꼴만', r8.ok === true && CH._rows[CH._rows.length - 1][10] === 'CH2-010,CH2-011');
  /* 옛 링크(학교-이름-토큰) 꼴의 코드도 성적표와 같이 받는다 */
  let r9 = post(Object.assign({}, base, { stu: KEY + '-' + ctx.tokenFor_(KEY), round: 6 }));
  T('옛 토큰 꼴 코드도 같은 학생', r9.ok === true && CH._rows[CH._rows.length - 1][1] === KEY);
  let r10 = post(Object.assign({}, base, { isTest: true, round: 7 }));
  T('TEST 판은 테스트 칸에 TEST', r10.ok === true && CH._rows[CH._rows.length - 1][11] === 'TEST');
  post(Object.assign({}, base, { stu: ctx.pubId_(KEY2), round: 3, ok: 2 }));
  /* 조회 */
  const g = J(ctx.doGet({ parameter: { student: ctx.pubId_(KEY) } }));
  const c = g.challenges || [];
  T('기존 칸은 그대로(rows·cumulative·rank·ranks·cohort·excluded)', g.ok === true && g.student === KEY && Array.isArray(g.rows) && g.rows.length === 1
    && 'cumulative' in g && 'rank' in g && Array.isArray(g.ranks) && 'cohort' in g && Array.isArray(g.excluded));
  T('challenges: 이 학생 것만 · 실제 기록이 있으면 TEST 판은 뺀다', c.length === 3 && c.every(x => !x.isTest), JSON.stringify(c.map(x => x.round)));
  T('challenges: 최근 것 먼저', c.map(x => x.round).join(',') === '6,5,5', c.map(x => x.round).join(','));
  const k0 = c[0] || {};
  T('challenges 한 판의 꼴 {date, course, round, n, ok, weakN, weakOk, linkN, linkOk}',
    typeof k0.date === 'string' && !isNaN(Date.parse(k0.date)) && k0.course === 'ch2' && k0.round === 6 && k0.n === 12 && k0.ok === 9
    && k0.weakN === 6 && k0.weakOk === 4 && k0.linkN === 6 && k0.linkOk === 5, JSON.stringify(k0));
  const g2 = J(ctx.doGet({ parameter: { student: ctx.pubId_(KEY2) } }));
  T('다른 학생 조회에는 그 학생 것만', (g2.challenges || []).length === 1 && g2.challenges[0].round === 3 && g2.challenges[0].ok === 2);
  const gBad = J(ctx.doGet({ parameter: { student: 'zzzzzzzzzzzz' } }));
  T('코드가 안 맞으면 challenges = []', Array.isArray(gBad.challenges) && gBad.challenges.length === 0);
  /* 최근 20판만 */
  for (let i = 0; i < 25; i++) post(Object.assign({}, base, { round: 1 + (i % 18), ok: i % 12, concepts: ['CH2-0' + (10 + i)] }));
  const g3 = J(ctx.doGet({ parameter: { student: ctx.pubId_(KEY) } }));
  T('challenges 는 최근 20판', (g3.challenges || []).length === 20 && g3.challenges[0].ok === 24 % 12, String((g3.challenges || []).length));
  /* 전부 TEST 인 학생은 미리보기로 싣는다(결과 탭 cumulative_ 와 같은 규칙) */
  CH._rows = CH._rows.filter(r => r[1] !== KEY2);
  post(Object.assign({}, base, { stu: ctx.pubId_(KEY2), isTest: true, round: 2 }));
  const g4 = J(ctx.doGet({ parameter: { student: ctx.pubId_(KEY2) } }));
  T('전부 TEST 면 TEST 판도 싣는다(isTest:true)', (g4.challenges || []).length === 1 && g4.challenges[0].isTest === true);
  /* 정시 저장은 전과 같다 — kind 가 없으면 결과 탭으로 */
  const rn = post({ name: '심화', school: '가상중', year: '2', course: 'ch2', round: 6, attempt: '첫 응시', score: 80, pass: true,
    correctCount: 48, wrongCount: 12, wrongMis: [], wrongAxes: {}, units: [], axes: [], answers: 'O'.repeat(60) });
  T('kind 없는 저장은 결과 탭으로(심화기록은 그대로)', rn.ok === true && res._rows.length === withRes + 1 && !CH._rows.some(r => r[3] === 6 && r[1] === KEY && r[5] === 80));
  res._rows.length = before;
  delete SHEETS['심화기록'];
}

console.log('[화학Ⅰ 심화] ch1s — 과목 인식 · 저장 · 읽기 · 화학Ⅰ 행과 함께');
{
  /* 「화학1 심화」 반 이름에는 '화학1' 이 들어 있다. 예전에는 courseOf_ 가 그것을 보고 ch1 로 잡았다. */
  T('courseOf_: 「화학1 심화」 반은 ch1s', ctx.courseOf_('화학1 심화 토3-6') === 'ch1s' && ctx.courseOf_('화학Ⅰ 심화반') === 'ch1s');
  T('courseOf_: 다른 반은 그대로', ctx.courseOf_('화학1 일6-10') === 'ch1' && ctx.courseOf_('화학2 토1:30') === 'ch2'
    && ctx.courseOf_('일반화학 토10-2') === 'gc' && ctx.courseOf_('파이널') === '');
  T('courseKo_ · 문자 과목 이름', ctx.courseKo_('ch1s') === '화학Ⅰ 심화' && ctx.SEND_COURSE_KO.ch1s === '화학Ⅰ 심화');
  T('ROUND_MIS 에 ch1s 10회', !!ctx.ROUND_MIS.ch1s && Object.keys(ctx.ROUND_MIS.ch1s).length === 10 && ctx.ROUND_MIS.ch1s['1'].length > 0);

  /* 옛 규칙으로 course:'ch1' 이 박힌 채 저장된 「화학1 심화」 반 — 읽을 때 바로잡는다. */
  const rosterBefore = SHEETS['_roster']._rows[0][0];
  SHEETS['_roster']._rows[0][0] = JSON.stringify({ classes: [
    { label: '화학1 심화 토3-6', course: 'ch1', students: ['심화일'], round: null },
    { label: '화학1 일6-10', course: 'ch1', students: ['홍길동'], round: null } ] });
  let rr = J(ctx.doGet({ parameter: { action: 'roster' } }));
  T('옛 명단의 「화학1 심화」 반도 ch1s 로 읽는다 · 화학1 반은 ch1', rr.ok === true && rr.classes[0].course === 'ch1s' && rr.classes[1].course === 'ch1');
  rr = J(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'roster', classes: [{ label: '화학Ⅰ 심화 일2-5', students: ['심화이'] }] }) } }));
  T('명단 저장: 이름으로 ch1s 를 붙인다', rr.ok === true && rr.classes[0].course === 'ch1s');
  SHEETS['_roster']._rows[0][0] = rosterBefore;

  /* 저장 → 읽기. 같은 학생이 화학Ⅰ 도 들었다(학생키는 과목과 무관하게 하나). */
  const res = SHEETS['결과'], before = res._rows.length;
  const post = d => J(ctx.doPost({ postData: { contents: JSON.stringify(d) } }));
  const KEY = '가상중-심화학생';
  const base = { name: '심화학생', school: '가상중', year: '2', attempt: '첫 응시', wrongAxes: {}, units: [], axes: [] };
  let p1 = post(Object.assign({}, base, { course: 'ch1', round: 3, score: 85, pass: true, correctCount: 51, wrongCount: 9,
    wrongMis: ['몰질량'], answers: 'O'.repeat(60) }));
  let p2 = post(Object.assign({}, base, { course: 'ch1s', round: 1, score: 70, pass: false, correctCount: 42, wrongCount: 18,
    wrongMis: ['구성 입자 질량·전하', '동위원소 정의'], answers: 'OX'.repeat(30) }));
  T('ch1s 첫 응시 저장 ok', p1.ok === true && p2.ok === true && res._rows.length === before + 2, JSON.stringify(p2));
  const last = res._rows[res._rows.length - 1];
  T('ch1s 행: I열 과목 ch1s · J열 회차 1', last[8] === 'ch1s' && last[9] === 1 && last[5] === KEY && last[18] === 'OX'.repeat(30));
  let p3 = post(Object.assign({}, base, { course: 'ch1s', round: 1, attempt: '재시', score: 90, pass: true, correctCount: 54, wrongCount: 6,
    wrongMis: [], answers: 'O'.repeat(60) }));
  T('ch1s 재시 저장 ok (같은 회차 · 다른 시도는 새 줄)', p3.ok === true && res._rows.length === before + 3);
  const g = J(ctx.doGet({ parameter: { student: ctx.pubId_(KEY) } }));
  const crs = (g.rows || []).map(x => x.course + '#' + x.round).sort().join(',');
  T('읽기: 화학Ⅰ·심화 행이 함께 온다', g.ok === true && crs === 'ch1#3,ch1s#1,ch1s#1', crs);
  /* 두 과목을 들으면 성적표는 하나를 골라 본다(7단계 2차) — 같은 시각에 저장됐으면 예전 순서(글자순 뒤 = ch1s),
     ?c=ch1 이면 화학Ⅰ. 누적 추이에는 고른 과목만, 과목 목록(courses)에는 둘 다. */
  const tr = ((g.cumulative || {}).trend || []).map(t => t.course + '#' + t.round).sort().join(',');
  T('누적 추이는 보고 있는 과목(ch1s)만 · 과목 목록에 둘 다', tr === 'ch1s#1' && g.cumulative.course === 'ch1s'
    && JSON.stringify(g.cumulative.courses) === '["ch1","ch1s"]', tr + ' ' + JSON.stringify(g.cumulative.courses));
  const g1 = J(ctx.doGet({ parameter: { student: ctx.pubId_(KEY), c: 'ch1' } }));
  const tr1 = ((g1.cumulative || {}).trend || []).map(t => t.course + '#' + t.round).join(',');
  T('?c=ch1 이면 화학Ⅰ 쪽으로 정리한다', tr1 === 'ch1#3' && g1.cumulative.course === 'ch1' && g1.rows.length === g.rows.length, tr1);
  const t1s = ((g.cumulative || {}).trend || []).filter(t => t.course === 'ch1s')[0] || {};
  T('ch1s 회차는 재시 통과로 통과', t1s.passed === true, JSON.stringify(t1s));

  /* 열 배열 마이그레이션도 ch1s 를 과목으로 안다(옛 V1 배열의 ch1s 행) */
  const v1 = ['옛심화', 'L', new Date('2026-05-01T01:00:00Z'), '중앙중-옛심화', '중앙중', '3', 'ch1s', 2, '정시', 88.3, '통과', 53, 7, '', '{}', '', '[]', '[]', 'O'.repeat(60)];
  res._rows.push(v1.slice());
  ctx.reorderColumnsToNew();
  const mv = res._rows[res._rows.length - 1];
  T('reorderColumnsToNew: ch1s V1 행도 새 순서로', mv[3] === 88.3 && mv[5] === '중앙중-옛심화' && mv[8] === 'ch1s' && mv[9] === 2, JSON.stringify(mv.slice(0, 11)));

  /* 심화 도전 기록 — 은행은 아직 없지만 서버는 과목 코드를 받는다(은행이 생기는 날 서버를 다시 배포하지 않게). */
  const ch = post({ kind: 'challenge', stu: ctx.pubId_(KEY), course: 'ch1s', round: 1, n: 3, ok: 2, weakN: 0, weakOk: 0, linkN: 0, linkOk: 0,
    concepts: ['CH1S-001', 'CH1S-002', 'CH1S-003'], isTest: false });
  T('심화기록: ch1s 과목 · CH1S- 개념 코드를 받는다', ch.ok === true && SHEETS['심화기록'] &&
    SHEETS['심화기록']._rows[SHEETS['심화기록']._rows.length - 1][2] === 'ch1s'
    && SHEETS['심화기록']._rows[SHEETS['심화기록']._rows.length - 1][10] === 'CH1S-001,CH1S-002,CH1S-003', JSON.stringify(ch));
  res._rows.length = before;
  delete SHEETS['심화기록'];
}

/* ── 7단계 2차 · 과목이 섞이는 곳 (2026-10-03) ─────────────────────────────
   학생은 과목과 무관하게 키 하나라, 여러 과목을 들은 학생의 누적·석차·반 응답이 «과목 글자순 마지막» 을
   최근으로 보고 과목을 넘어 합쳐졌다. 서버도 chemengine.js focusCourse 와 같은 규칙(?c= → 가장 최근 날짜의
   과목 → 예전 순서)으로 과목 하나를 골라 정리한다. 한 과목 학생은 고치기 전(7a121d7)과 같은 값이다. */
console.log('[7단계 2차] 한 과목 학생은 그대로 · 여러 과목 학생은 보고 있는 과목으로');
{
  const CE = require('../chemengine.js');
  const SNAP = JSON.parse(fs.readFileSync('tests/fixtures/single_course_snapshot.json', 'utf8'));
  Object.keys(SNAP.students).forEach(id => {
    const S0 = SNAP.students[id], rows = S0.rows, key = rows[0].studentKey, all = rows.concat(S0.others);
    const got = { cumulative: ctx.cumulative_(rows), rank: ctx.rank_(all, key, []), cohort: ctx.cohortItems_(all, key, []), ranks: ctx.ranksAll_(all, key, []) };
    ['cumulative', 'rank', 'cohort', 'ranks'].forEach(k =>
      T(id + ' 만 듣는 학생: 서버 ' + k + ' 가 고치기 전과 같다', JSON.stringify(got[k]) === JSON.stringify(S0.server[k]), JSON.stringify(got[k]).slice(0, 160)));
    T(id + ' 만 듣는 학생: ?c= 를 줘도(다른 과목이어도) 같다', JSON.stringify(ctx.cumulative_(rows, 'gc')) === JSON.stringify(S0.server.cumulative)
      && JSON.stringify(ctx.rank_(all, key, [], 'gc')) === JSON.stringify(S0.server.rank));
  });
  /* 화학Ⅰ(3월)+화학Ⅱ(9월) 학생 — 같은 회차 번호(1~3)를 둘 다 봤다. 다른 학생 다섯이 두 과목 3회를 봤다. */
  const K = '가상고-두과목', mkr = (k, course, round, score, day, wrong) => ({ studentKey: k, name: 'n', school: '가상고', course, round, attempt: '첫 응시',
    score, pass: score >= 80, date: new Date('2026-' + day + 'T01:00:00Z'), answers: 'OX'.repeat(30), wrongMis: wrong || [], wrongAxes: {}, isTest: false });
  const mine = [1, 2, 3].map(r => mkr(K, 'ch1', r, 60 + r, '03-0' + r, ['루이스 전자점식'])).concat([1, 2, 3].map(r => mkr(K, 'ch2', r, 90 - r, '09-0' + r)));
  const others = [];
  for (let i = 0; i < 5; i++) ['ch1', 'ch2'].forEach(c => others.push(mkr('가상고-다른' + i, c, 3, 50 + i * 10, '09-10')));
  const all = mine.concat(others);
  const c0 = ctx.cumulative_(mine), c1 = ctx.cumulative_(mine, 'ch1'), e0 = CE.cumulative(mine)[K];
  T('누적: 가장 최근 날짜의 과목(ch2)만 · 범위 1~3 · 서버와 엔진이 같다', c0.course === 'ch2' && c0.trend.every(t => t.course === 'ch2') && c0.coverageRound === 3
    && JSON.stringify(c0.trend) === JSON.stringify(e0.trend.map(t => { const o = Object.assign({}, t); delete o.date; return o; })) && e0.course === 'ch2', JSON.stringify(c0.trend));
  T('누적 ?c=ch1: 화학Ⅰ 만 · 고질(루이스 전자점식 3/3)도 화학Ⅰ 쪽에만', c1.course === 'ch1' && c1.trend.every(t => t.course === 'ch1')
    && c1.chronicMis.length === 1 && c1.chronicMis[0].mis === '루이스 전자점식' && c0.chronicMis.length === 0, JSON.stringify([c1.chronicMis, c0.chronicMis]));
  const r0 = ctx.rank_(all, K, []), r1 = ctx.rank_(all, K, [], 'ch1');
  T('석차: 보고 있는 과목의 마지막 회차(ch2 3회 87점 · ch1 3회 63점)', r0 && r0.score === 87 && r0.round === 3 && r1 && r1.score === 63, JSON.stringify([r0 && r0.score, r1 && r1.score]));
  const h0 = ctx.cohortItems_(all, K, []), h1 = ctx.cohortItems_(all, K, [], 'ch1');
  T('반 응답: 보고 있는 과목(ch2 · ?c=ch1 이면 ch1)', h0 && h0.course === 'ch2' && h1 && h1.course === 'ch1', JSON.stringify([h0 && h0.course, h1 && h1.course]));
  /* 날짜가 없으면 예전 순서(글자순 마지막) — 예전 값과 같다 */
  const nd = mine.map(r => Object.assign({}, r, { date: '' }));
  T('날짜가 없으면 예전 순서(ch2) · 엔진도 같다', ctx.focusCourse_(nd).course === 'ch2' && CE.focusCourse(nd).course === 'ch2');
  /* 같은 규칙인지 — 여러 모양의 행에서 서버 focusCourse_ 와 엔진 focusCourse 가 같은 답 */
  const shapes = [mine, nd, mine.slice(0, 3), mine.concat([mkr(K, 'jm1', 1, 90, '12-01')]), mine.map(r => Object.assign({}, r, { date: '2026-05-05' }))];
  T('서버 focusCourse_ = 엔진 focusCourse (모양 다섯 · ?c= 셋)', shapes.every(rs => ['', 'ch1', 'zz'].every(w => JSON.stringify(ctx.focusCourse_(rs, w)) === JSON.stringify(CE.focusCourse(rs, w)))));
  /* 성적표 창구 — ?c= 를 받아 누적·석차·반 응답을 같은 과목으로 */
  const sh = SHEETS['결과'], n0 = sh._rows.length;
  mine.forEach(r => sh._rows.push(['n', 'L', r.date, r.score, r.pass ? '통과' : '미달', K, '가상고', '2', r.course, r.round, '첫 응시', 0, 0, (r.wrongMis || []).join(' / '), '{}', '', '[]', '[]', r.answers]));
  const pid = ctx.pubId_(K);
  const g0 = J(ctx.doGet({ parameter: { student: pid } })), g1 = J(ctx.doGet({ parameter: { student: pid, c: 'ch1' } }));
  T('창구: ?c= 없으면 ch2 · ?c=ch1 이면 ch1 · 행은 둘 다 모든 과목', g0.cumulative.course === 'ch2' && g1.cumulative.course === 'ch1' && g0.rows.length === 6 && g1.rows.length === 6,
    JSON.stringify([g0.cumulative.course, g1.cumulative.course, g0.rows.length]));
  sh._rows.length = n0;
}

console.log('[설문] kind:survey 는 「결과」 탭의 한 줄(과목 ch1sv) · 덮어쓰기 · DT 집계에서 빠짐 · 문자발송 · 옛 설문 탭 옮기기');
{
  const post = d => J(ctx.doPost({ postData: { contents: JSON.stringify(d) } }));
  const get = p => J(ctx.doGet({ parameter: p }));
  delete SHEETS['설문'];
  const A1 = '1'.repeat(50) + '5'.repeat(50), A2 = '3'.repeat(100);
  const R = SHEETS['결과'], resN0 = R._rows.length;
  R._rows.push(['홍길동','L',D1,85,'통과','휘문중-홍길동','휘문중','2','ch1',1,'정시',51,9,'','{}','','[]','[]','O'.repeat(60)],
    ['홍길동','L',D2,70,'미달','휘문중-홍길동','휘문중','2','ch2',1,'정시',42,18,'','{}','','[]','[]','X'.repeat(60)]);
  const dtBefore = JSON.stringify(R._rows);
  const svRows = () => R._rows.slice(1).filter(r => r[8] === 'ch1sv');
  const g0 = get({ action: 'survey', survey: 'ch1-final-2026' });
  T('설문이 없어도 읽기는 된다 · rows = [] · 설문 탭을 만들지 않는다', g0.ok === true && Array.isArray(g0.rows) && g0.rows.length === 0 && !SHEETS['설문'], JSON.stringify(g0));
  const base = { kind: 'survey', studentKey: '아무거나', name: '홍길동', school: '휘문중학교', year: '중2', survey: 'ch1-final-2026', ans: A1, ms: 600000 };
  const r1 = post(base);
  const s1 = svRows();
  T('저장: 결과 탭에 한 줄 · 설문 탭은 안 만든다', r1.ok === true && r1.updated === false && s1.length === 1 && !SHEETS['설문'] && /survey_print\.html\?student=/.test(r1.reportLink), JSON.stringify(r1));
  T('저장: DT 회차처럼 — 과목 ch1sv · 회차 19 · 시도/통과 «설문» · 점수 빈칸 · 학생키는 서버가(canonicalKey_) · 학교·학년 정리',
    s1[0][5] === '휘문중-홍길동' && s1[0][6] === '휘문중' && s1[0][7] === '2' && s1[0][9] === 19 && s1[0][10] === '설문' && s1[0][4] === '설문' && s1[0][3] === '' && s1[0][13] === 'ch1-final-2026', JSON.stringify(s1[0]));
  T('저장: 답은 글자로 · 걸린시간·출처는 축 칸 JSON · 테스트 빈칸', String(s1[0][18]).replace(/^'/, '') === A1 && JSON.parse(s1[0][14]).ms === 600000 && JSON.parse(s1[0][14]).src === 'web' && s1[0][15] === '');
  T('저장해도 DT 시험 줄은 한 칸도 안 바뀐다', JSON.stringify(R._rows.filter(r => r[8] !== 'ch1sv')) === JSON.stringify(JSON.parse(dtBefore)));
  const r2 = post(Object.assign({}, base, { ans: A2, ms: 700000 }));
  T('덮어쓰기: 같은 학생·같은 설문은 한 줄 · 마지막 제출', r2.ok === true && r2.updated === true && svRows().length === 1 && String(svRows()[0][18]).replace(/^'/, '') === A2, JSON.stringify(svRows().length));
  const r3 = post(Object.assign({}, base, { isTest: true }));
  T('테스트 제출은 따로 한 줄(TEST) · 실제 줄을 덮지 않는다', r3.ok === true && svRows().length === 2 && svRows()[1][15] === 'TEST' && String(svRows()[0][18]).replace(/^'/, '') === A2);
  const r4 = post(Object.assign({}, base, { name: '김민준', school: '단대부중', ans: A1, src: 'paper', ms: 0 }));
  T('다른 학생은 새 줄 · 종이 응답은 출처 paper', r4.ok === true && svRows().length === 3 && svRows()[2][5] === '단대부중-김민준' && JSON.parse(svRows()[2][14]).src === 'paper');
  const r5 = post(Object.assign({}, base, { survey: 'other-1' }));
  T('다른 설문은 새 줄', r5.ok === true && svRows().length === 4);
  T('받지 않는 꼴: 답이 비거나 1~5 밖 · 이름 없음 · 설문 이름 이상', post(Object.assign({}, base, { ans: '12' + '0'.repeat(98) })).ok === false
    && post(Object.assign({}, base, { ans: '' })).ok === false && post(Object.assign({}, base, { name: '' })).ok === false
    && post(Object.assign({}, base, { survey: '<x>' })).ok === false && svRows().length === 4);
  const g1 = get({ action: 'survey', survey: 'ch1-final-2026' });
  T('관리자 읽기: 이 설문 줄만(테스트 포함 · isTest 표시) · 답 · 코드 · 출처', g1.ok === true && g1.rows.length === 3 && g1.rows.filter(x => x.isTest).length === 1
    && g1.rows.every(x => x.survey === 'ch1-final-2026' && /^[1-5]{100}$/.test(x.ans) && x.code === ctx.pubId_(x.studentKey)) && g1.rows.some(x => x.src === 'paper'), JSON.stringify(g1.rows.map(x => [x.studentKey, x.isTest, x.src])));
  const keep = ctx.adminOk_;
  ctx.adminOk_ = t => String(t || '') === 'sv-adm-1';
  const gd = get({ action: 'survey', survey: 'ch1-final-2026' }), gk = get({ action: 'survey', survey: 'ch1-final-2026', token: 'sv-adm-1' });
  ctx.adminOk_ = keep;
  T('관리자 읽기는 adminOk_ 를 탄다(닫히면 auth · 토큰이면 열림)', gd.ok === false && gd.error === 'auth' && gk.ok === true && gk.rows.length === 3, JSON.stringify(gd));
  const o1 = get({ action: 'surveyOne', student: ctx.pubId_('휘문중-홍길동'), survey: 'ch1-final-2026' });
  T('개인 코드: 그 학생 것만 · 실제 기록이 있으면 TEST 는 뺀다', o1.ok === true && o1.rows.length === 1 && o1.rows[0].ans === A2 && !o1.rows[0].isTest && !('studentKey' in o1.rows[0]), JSON.stringify(o1));
  post(Object.assign({}, base, { name: '설문만', school: '가상고' }));
  const o3 = get({ action: 'surveyOne', student: ctx.pubId_('가상고-설문만') });
  T('개인 코드: DT 기록 없이 설문만 한 학생도 찾는다', o3.ok === true && o3.rows.length === 1 && o3.rows[0].name === '설문만', JSON.stringify(o3));
  T('개인 코드: 진단용 화학1 기록은 ch1 시험 줄만(설문 줄 아님) · 점수·통과는 안 싣는다', Array.isArray(o1.ch1) && o1.ch1.length === 1
    && o1.ch1.every(r => r.course === 'ch1' && !('score' in r) && !('pass' in r)) && (o3.ch1 || []).length === 0, JSON.stringify(o1.ch1));
  /* DT 성적표·관리 읽기에는 설문 줄이 안 나간다 — 과목이 하나 더 생겨 성적표가 «돌아보기» 과목으로 넘어가면 안 된다 */
  const gs = get({ student: ctx.pubId_('휘문중-홍길동') });
  T('DT 성적표(?student=) 에는 설문 줄이 없다 · 과목은 그대로', gs.ok === true && gs.rows.length === 2 && gs.rows.every(r => r.course !== 'ch1sv') && gs.cumulative && gs.cumulative.course !== 'ch1sv', JSON.stringify(gs.rows.map(r => r.course)));
  const ga = get({ all: '1' });
  T('관리 전체 읽기(?all=1) 에도 설문 줄이 없다', ga.ok === true && ga.rows.every(r => r.course !== 'ch1sv') && ga.rows.length === R._rows.length - 1 - svRows().length);
  T('설문만 한 학생 코드로 DT 성적표를 열어도 빈 기록(깨지지 않음)', (() => { const x = get({ student: ctx.pubId_('가상고-설문만') }); return x.ok === true && x.rows.length === 0; })());
  /* 문자발송: 설문 줄은 «진단 보고서» 문자 · 링크는 진단 보고서 화면 · TEST 줄은 문자 없음 */
  const data = R._rows.slice(1);
  const msgs = ctx.buildRowMessages_(data);
  const iHong = data.findIndex(r => r[8] === 'ch1sv' && r[5] === '휘문중-홍길동' && r[13] === 'ch1-final-2026' && r[15] === '');
  const iTest = data.findIndex(r => r[8] === 'ch1sv' && r[15] === 'TEST');
  const mH = msgs[iHong], mT = msgs[iTest];
  T('문자발송: 설문 줄 = «화학Ⅰ 돌아보기 · 설문 · 진단 보고서» + 진단 보고서 링크', mH && mH.label === '화학Ⅰ 돌아보기' && mH.att === '설문' && mH.status === '진단 보고서'
    && mH.msg.indexOf('survey_print.html?student=' + ctx.pubId_('휘문중-홍길동')) >= 0 && /홍길동 학생/.test(mH.msg) && !/점|통과|재시/.test(mH.msg.replace('점수가', '')), JSON.stringify(mH));
  T('문자발송: 테스트 설문 줄은 문자 없음', mT && mT.msg === '' && mT.status === '', JSON.stringify(mT));
  const iDt = data.findIndex(r => r[8] === 'ch1' && r[5] === '휘문중-홍길동');
  T('문자발송: DT 시험 줄 문자는 그대로(통과)', msgs[iDt] && msgs[iDt].status === '통과' && /화학Ⅰ 1회/.test(msgs[iDt].msg), JSON.stringify(msgs[iDt]));
  /* 옛 「설문」 탭에 먼저 들어간 줄은 다음 저장 때 결과 탭으로 옮겨지고 설문 탭은 비워진다 */
  SHEETS['설문'] = makeSheet('설문', [[]]);
  R._rows.length = resN0;
  R._rows.push(...JSON.parse(dtBefore).slice(resN0));
  const legacy = [['시각','학생키','이름','학교','학년','설문','답','걸린시간','테스트','출처'],
    [D1, '가상중-옛줄', '옛줄', '가상중', '3', 'ch1-final-2026', "'" + A1, 300000, '', 'paper']];
  if (SHEETS['설문']) SHEETS['설문']._rows = legacy.map(r => r.slice());
  const gl = get({ action: 'survey', survey: 'ch1-final-2026' });
  T('옮기기 전에도 옛 설문 탭 줄이 읽힌다', SHEETS['설문'] && gl.ok === true && gl.rows.some(x => x.name === '옛줄' && x.src === 'paper'), JSON.stringify(gl.rows && gl.rows.map(x => x.name)));
  post(Object.assign({}, base, { name: '새줄', school: '가상중' }));
  const moved = svRows();
  T('다음 저장 때 옛 줄이 결과 탭으로 옮겨지고(답·출처·걸린시간 그대로) 설문 탭 자료 줄은 비워진다',
    moved.some(r => r[0] === '옛줄' && String(r[18]).replace(/^'/, '') === A1 && JSON.parse(r[14]).src === 'paper' && JSON.parse(r[14]).ms === 300000)
    && moved.some(r => r[0] === '새줄') && SHEETS['설문']._rows.slice(1).every(r => r.every(v => v === '' || v == null)), JSON.stringify(moved.map(r => r[0])));
  const gl2 = get({ action: 'survey', survey: 'ch1-final-2026' });
  T('옮긴 뒤 같은 학생이 두 번 세어지지 않는다', gl2.rows.filter(x => x.name === '옛줄').length === 1);
  delete SHEETS['설문'];
  R._rows.length = resN0;
}

console.log('[설문 진단] chemengine surveyRecord · surveyDiagnose (문항은 파일에서)');
{
  const CE = require('../chemengine.js');
  const DOC = JSON.parse(fs.readFileSync('appdata/survey_ch1.json', 'utf8'));
  const con = DOC.items.filter(x => x.type === 'concept'), bel = DOC.items.filter(x => x.type === 'belief');
  const cA = con[0], cB = con.find(x => x.codes.every(c => cA.codes.indexOf(c) < 0));
  const cC = con.find(x => x !== cB && x.codes.every(c => cA.codes.indexOf(c) < 0 && cB.codes.indexOf(c) < 0));
  const bM = bel.find(x => x.mis !== false && x.codes.every(c => cA.codes.indexOf(c) < 0 && cB.codes.indexOf(c) < 0));
  const bT = bel.find(x => x.mis === false);
  /* 1회: cA 코드 5문항 다 맞힘 · cB 코드 5문항 다 못 맞힘 · bM 코드 4문항 다 못 맞힘(빈칸 포함) · cC 코드 2문항(기록 적음) */
  const its = [], ans = [];
  const add = (code, a, got, k) => { for (let i = 0; i < k; i++) { its.push({ c: code, a: a }); ans.push(got); } };
  add(cA.codes[0], 'O', 'O', 5); add(cB.codes[0], 'X', 'O', 5); add(bM.codes[0], 'O', 'X', 3); add(bM.codes[0], 'O', '.', 1); add(cC.codes[0], 'O', 'O', 2);
  /* 2회: cB 코드는 첫 응시 못 맞히고 재시에서 고침 */
  const its2 = [{ c: cB.codes[0], a: 'O' }], rows = [
    { course: 'ch1', round: 1, attempt: '정시', answers: ans.join('') },
    { course: 'ch1', round: 2, attempt: '정시', answers: 'X' },
    { course: 'ch1', round: 2, attempt: '재시', answers: 'O', retakeCids: cB.codes[0], retakeKeys: 'O' },
    { course: 'ch1', round: 3, attempt: '정시', answers: 'OO' },                     // 회차 파일과 길이가 다르면 안 센다
    { course: 'ch2', round: 1, attempt: '정시', answers: ans.join('') },             // 다른 과목은 안 센다
    { course: 'ch1', round: 1, attempt: '정시', answers: 'O'.repeat(its.length), isTest: true },
  ];
  const itemsOf = (c, rd) => (rd === 1 ? its : rd === 2 ? its2 : rd === 3 ? [{ c: cA.codes[0], a: 'O' }] : null);
  const rec = CE.surveyRecord(rows, itemsOf, 'ch1');
  T('기록: 코드별 물은·맞힌 횟수(첫 응시만 · 빈칸은 못 맞힘 · 다른 과목·테스트·길이 다른 회차 제외)',
    rec[cA.codes[0]].n === 5 && rec[cA.codes[0]].ok === 5 && rec[cB.codes[0]].n === 6 && rec[cB.codes[0]].ok === 0 && rec[bM.codes[0]].n === 4 && rec[bM.codes[0]].ok === 0,
    JSON.stringify(rec));
  T('기록: 재시에서 고침', rec[cB.codes[0]].fixed === true && rec[cA.codes[0]].fixed === null);
  const idx = it => DOC.items.indexOf(it);
  const mk = set => { const a = DOC.items.map(() => '3'); Object.keys(set).forEach(i => { a[i] = set[i]; }); return a.join(''); };
  let d = CE.surveyDiagnose(DOC, mk({ [idx(cA)]: '1', [idx(cB)]: '2', [idx(cC)]: '1', [idx(bM)]: '1', [idx(bT)]: '5' }), rec);
  const V = it => (d.concepts.concat(d.beliefs).find(o => o.k === it.k) || {}).verdict;
  T('판정: 자신감 높음+기록 좋음 = 강점 · 높음+약함 = 과신 · 기록 3회 미만 = 보통', V(cA) === 'strong' && V(cB) === 'over' && V(cC) === 'normal', [V(cA), V(cB), V(cC)].join(','));
  T('판정: 오개념 직관에 «그렇다» + 기록 약함 = 남은 오개념', V(bM) === 'remain', V(bM));
  T('판정: 맞는 직관(mis:false)에 «전혀 아니다» = 신호 → 기록이 없으면 직관 흔들림', V(bT) === 'intuition', V(bT));
  d = CE.surveyDiagnose(DOC, mk({ [idx(cA)]: '5', [idx(cB)]: '4', [idx(bM)]: '5' }), rec);
  T('판정: 자신감 낮음+기록 좋음 = 숨은 실력 · 낮음+약함 = 보강 필요 · 바른 생각+기록 약함 = 기록상 약함', V(cA) === 'hidden' && V(cB) === 'reinforce' && V(bM) === 'recordWeak', [V(cA), V(cB), V(bM)].join(','));
  const exps = DOC.items.filter(x => x.type === 'exp'), g0 = exps[0].group;
  const ex = {}; exps.forEach(x => { ex[idx(x)] = x.rev ? '5' : '1'; });
  d = CE.surveyDiagnose(DOC, mk(ex), {});
  T('경험: 묶음별 평균(rev 는 뒤집어 높을수록 좋은 쪽) · 묶음 이름', d.expOrder.length >= 2 && d.expOrder.every(g => d.exp[g].avg === 5) && d.exp[g0].name === exps[0].gname, JSON.stringify(d.expOrder.map(g => [g, d.exp[g].avg])));
  T('판정 수: counts 가 목록과 같다', Object.keys(d.counts).reduce((a, k) => a + d.counts[k], 0) === con.length + bel.length);
}

console.log(`\n결과: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
