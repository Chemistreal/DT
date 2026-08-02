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
    newConditionalFormatRule() { const b = { whenTextEqualTo(){return b;}, whenFormulaSatisfied(){return b;}, setBackground(){return b;}, setFontColor(){return b;}, setRanges(){return b;}, build(){return {};} }; return b; },
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
  ['고승원','https://chemistreal.github.io/DT/report.html?student=서일중-고승원', new Date('2026-07-04T08:27:09Z'),
   15,'첫 응시',61.7,'미달','서일중-고승원','서일중','2','ch2',37,23,'적정·가수분해·다양성자','{"A2":1}','',
   '[{"u":"적정","t":30,"w":16}]','[{"k":"A2","t":5,"w":1}]', XO60],
  ['이세현','L', new Date('2026-07-04T08:29:27Z'),
   15,'첫 응시',70,'미달','휘문중-이세현','휘문중','1','ch2',42,18,'적정','{"A2":0}','','[]','[]', XO60],
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
T('V2 값 보존: 고승원 점수61.7/과목ch2/회차15/답안60자', (function(){
  var r=SHEETS['결과']._rows[1];
  return r[3]===61.7 && r[4]==='미달' && r[5]==='서일중-고승원' && r[6]==='서일중' && r[7]==='2' && r[8]==='ch2' && r[9]===15 && r[10]==='첫 응시' && r[11]===37 && r[12]===23 && r[18]===XO60;
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
r = J(ctx.doGet({ parameter: { student: '서일중-고승원' } }));
// 마이그레이션과 무관하게, 이름만으로는 못 연다(위 [5] 와 같은 규칙)
T('마이그레이션 뒤에도 이름만으로는 차단', r.ok===true && r.rows.length===0 && r.cumulative===null);
r = J(ctx.doGet({ parameter: { student: ctx.pubId_('서일중-고승원') } }));
T('마이그레이션 후 불투명 코드로 실데이터 조회', r.ok===true && r.rows.length===1 && r.rows[0].name==='고승원'
  && r.rows[0].score===61.7 && r.rows[0].course==='ch2' && Number(r.rows[0].round)===15
  && r.cumulative!==null && r.cumulative.trend.length===1 && r.cumulative.trend[0].course==='ch2');
r = J(ctx.doGet({ parameter: { student: '서일중-고승원-' + ctx.tokenFor_('서일중-고승원') } }));
T('토큰 링크도 동일 데이터', r.rows.length===1 && r.rows[0].name==='고승원');


console.log('[9] 성적표를 열어 봤는가');
{
  /* 따로 창구를 만들지 않는다. 학부모 링크는 report.html?student=<코드> 이고
     그 화면이 이미 이 창구를 부른다. **코드 모양으로 들어온 것만** 센다. */
  /* 앞선 [8] 이 시트를 마이그레이션 자료로 갈아 끼운다. 그 뒤에도 남아 있는
     학생으로 본다 — 없는 학생으로 부르면 키가 안 풀려 아무것도 안 세인다. */
  const key = '서일중-고승원';
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
  ctx.doGet({ parameter: { student: ctx.pubId_('서일중-고승원') } });
  T('학부모 경로에서는 안 건드린다', TRIGGERS.length === 0, JSON.stringify(TRIGGERS));
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

console.log(`\n결과: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
