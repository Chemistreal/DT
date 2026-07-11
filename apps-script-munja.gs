/* ============================================================
   Chemistreal — 문자발송 탭 자동 기록 (독립 add-on)

   ■ 무엇을 하나
     '결과' 탭에 저장된 응시 기록을 읽어, 학부모께 보낼 결과 안내
     문자 전문을 '문자발송' 탭에 한 행씩 자동으로 만들어 준다.
     이미 만들어진 (학생키·과목·회차·시도) 행은 건너뛰므로 몇 번을
     돌려도 중복이 생기지 않는다. 테스트 모드 기록은 제외한다.

   ■ 설치 (기존 코드는 한 줄도 고칠 필요 없음)
     1) 시트 > 확장 프로그램 > Apps Script > 파일 [+] > 스크립트
        → 이 파일 전체를 붙여넣고 저장
     2) 편집기 상단에서 munjaSyncAll 선택 > [실행] 1회
        → 지금까지의 결과가 문자발송 탭에 백필된다
     3) setupMunjaTrigger 선택 > [실행] 1회
        → 이후 매시간 자동으로 새 결과가 문자발송 탭에 추가된다

   ■ (선택) 실시간으로 만들고 싶으면
     기존 doPost 안, 결과 저장 뒤 return 직전에 아래 한 줄 추가:
        try { munjaSyncAll(); } catch (err) {}
     이러면 앱에서 채점 저장이 될 때마다 즉시 문자발송 행이 생긴다.
   ============================================================ */

var MUNJA_SHEET_ID = '1WVK-m8PUVm9Hg7bvxuIrk3_VzxPqO4vym1qpatoSM7s'; // 성적 시트 ID (URL의 /d/와 /edit 사이)
var MUNJA_TAB = '문자발송';
var MUNJA_SRC_TAB = '결과';
var MUNJA_HEADERS = ['시각','이름','학생키','학교','학년','과목','회차','시도','점수','통과','리포트링크','문자내용','발송'];
var MUNJA_PASS_LINE = 80; // 통과선(점)

function munjaCourseKo_(c) { return c === 'ch1' ? '화학Ⅰ' : c === 'ch2' ? '화학Ⅱ' : c === 'gc' ? '일반화학' : String(c || ''); }

function munjaSheet_() {
  var ss = SpreadsheetApp.openById(MUNJA_SHEET_ID);
  var sh = ss.getSheetByName(MUNJA_TAB) || ss.insertSheet(MUNJA_TAB);
  if (sh.getLastRow() === 0) { sh.appendRow(MUNJA_HEADERS); }
  else if (sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), MUNJA_HEADERS.length)).getValues()[0].slice(0, MUNJA_HEADERS.length).join('|') !== MUNJA_HEADERS.join('|')) {
    sh.getRange(1, 1, 1, MUNJA_HEADERS.length).setValues([MUNJA_HEADERS]);
  }
  return sh;
}

/* 결과 탭의 열 위치를 헤더 이름으로 찾는다 (열 순서가 바뀌어도 동작) */
function munjaSrcCols_(headerRow) {
  var want = { name: '이름', link: '리포트링크', date: '시각', score: '점수', pass: '통과',
    key: '학생키', school: '학교', year: '학년', course: '과목', round: '회차',
    attempt: '시도', mis: '오개념', test: '테스트' };
  var idx = {}, h = headerRow.map(function (v) { return String(v || '').trim(); });
  Object.keys(want).forEach(function (k) { idx[k] = h.indexOf(want[k]); });
  return idx;
}

/* 결과 안내 문자 전문 */
function munjaMsg_(d) {
  var course = munjaCourseKo_(d.course);
  var misList = String(d.mis || '').split(' / ').filter(function (s) { return s && s.trim(); });
  var misLine = '';
  if (misList.length) {
    var head3 = misList.slice(0, 3).join(', ');
    misLine = head3 + (misList.length > 3 ? ' 외 ' + (misList.length - 3) + '개' : '');
  }
  var link = d.link ? '▶ ' + d.link + '\n\n' : '';
  var isPass = String(d.pass) === '통과' || d.pass === true;
  if (isPass) {
    return '[다원교육 영재관 · 화학] ' + d.name + ' 학생 ' + course + ' ' + d.round + '회 결과 안내\n\n'
      + '안녕하세요, 화학 조준모입니다.\n\n'
      + d.name + ' 학생이 ' + course + ' ' + d.round + '회 ' + d.attempt + '에서 ' + d.score + '점으로 통과했습니다.\n'
      + (misLine
        ? '다만 아래 개념은 한 번 더 다져두면 좋아, 리포트의 취약 개념 강의로 짧게 보강하도록 안내해 두었습니다.\n· ' + misLine + '\n\n'
        : '취약 개념 없이 안정적으로 마무리했습니다.\n\n')
      + '문항별 분석과 취약 개념 강의는 아래 리포트에서 확인하실 수 있습니다.\n'
      + link
      + '감사합니다.\n\n조준모 드림';
  }
  return '[다원교육 영재관 · 화학] ' + d.name + ' 학생 ' + course + ' ' + d.round + '회 결과 안내\n\n'
    + '안녕하세요, 화학 조준모입니다.\n\n'
    + d.name + ' 학생이 ' + course + ' ' + d.round + '회 ' + d.attempt + '에서 ' + d.score + '점으로 통과선(' + MUNJA_PASS_LINE + '점)에 조금 못 미쳤습니다. '
    + '저희 반은 틀린 개념만 골라 개별 출제되는 재시로 통과까지 마무리하는 과정을 두고 있어, 이번 주 안에 재시로 정리하면 됩니다.\n'
    + (misLine ? '보완할 개념: ' + misLine + '\n' : '')
    + '\n아래 리포트에서 취약 개념 강의를 보강한 뒤 재시를 진행하면 됩니다.\n'
    + link
    + '감사합니다.\n\n조준모 드림';
}

/* 결과 탭 → 문자발송 탭 동기화 (멱등 · 몇 번 실행해도 중복 없음) */
function munjaSyncAll() {
  var ss = SpreadsheetApp.openById(MUNJA_SHEET_ID);
  var src = ss.getSheetByName(MUNJA_SRC_TAB);
  if (!src || src.getLastRow() < 2) return '결과 탭에 데이터가 없습니다.';
  var data = src.getDataRange().getValues();
  var col = munjaSrcCols_(data[0]);
  if (col.key < 0 || col.course < 0 || col.round < 0 || col.attempt < 0) {
    throw new Error('결과 탭 헤더에서 학생키/과목/회차/시도 열을 찾지 못했습니다.');
  }
  var sh = munjaSheet_();
  var seen = {};
  if (sh.getLastRow() > 1) {
    // 문자발송 탭 기존 행의 (학생키#과목#회차#시도) 수집
    sh.getRange(2, 1, sh.getLastRow() - 1, MUNJA_HEADERS.length).getValues().forEach(function (r) {
      seen[[r[2], r[5], r[6], r[7]].join('#')] = 1; // 학생키·과목·회차·시도
    });
  }
  var added = 0, rowsOut = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (col.test >= 0 && String(r[col.test]) === 'TEST') continue; // 테스트 모드 제외
    var d = {
      name: r[col.name], link: col.link >= 0 ? r[col.link] : '', date: col.date >= 0 ? r[col.date] : new Date(),
      score: r[col.score], pass: r[col.pass], key: r[col.key], school: col.school >= 0 ? r[col.school] : '',
      year: col.year >= 0 ? r[col.year] : '', course: r[col.course], round: r[col.round],
      attempt: r[col.attempt], mis: col.mis >= 0 ? r[col.mis] : ''
    };
    if (!d.key) continue;
    // 문자발송 탭에는 과목이 한글로 저장되므로 중복 검사 키도 한글 과목으로 만든다
    var k = [d.key, munjaCourseKo_(d.course), d.round, d.attempt].join('#');
    if (seen[k]) continue;
    seen[k] = 1;
    rowsOut.push([d.date, d.name, d.key, d.school, d.year, munjaCourseKo_(d.course), d.round, d.attempt,
      d.score, d.pass, d.link, munjaMsg_(d), '']);
    added++;
  }
  if (rowsOut.length) sh.getRange(sh.getLastRow() + 1, 1, rowsOut.length, MUNJA_HEADERS.length).setValues(rowsOut);
  return '문자발송 탭에 ' + added + '건 추가 (기존 ' + (Object.keys(seen).length - added) + '건 유지)';
}

/* ★ 편집기에서 한 번만 실행 → 매시간 자동 동기화 트리거 등록 (중복 자동 제거) ★ */
function setupMunjaTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'munjaSyncAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('munjaSyncAll').timeBased().everyHours(1).create();
  return '등록 완료: 매시간 munjaSyncAll (결과 → 문자발송 동기화)';
}
