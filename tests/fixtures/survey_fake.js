/* ============================================================
   「화학1 돌아보기」 보고서 시험의 가짜 자료 — tests/survey_print.js · tests/survey_docx.js 가 같이 쓴다
   ------------------------------------------------------------
   가상 학생 넷(학교 「가상고-연습」 — 이름·학교 모두 가상, tools/name_guard.py)
     A 가상하나  세 곳 자료가 다 있는 과신형(DT 화학Ⅰ 18회 + 심화 5회 · 모의시험 셋 · KMChC 한 번)
     B 가상두리  숨은 실력형(기록 좋음 · 자신감 낮음) — exam·KMChC 짝은 «애매»
     C 가상세찬  설문만(기록 없음)
     D 가상네모  기록만(설문 없음)
   routeAll(page, opt) 는 Apps Script · exam · KMChC 주소를 page.route 로 가로채 가짜 응답만 돌려준다
   (실제 주소로는 아무 요청도 나가지 않는다). opt.examFail 이면 exam 연결을 끊는다.
   ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
/* ── 가상 자료 ─────────────────────────────────────────── */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata/survey_ch1.json'), 'utf8'));
const LINK = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses/ch1s/link_ch1.json'), 'utf8'));
function roundFile(c, rd) { return JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', 'round_' + c + '_' + String(rd).padStart(2, '0') + '.json'), 'utf8')); }
const R1 = {}; for (let i = 1; i <= 18; i++) R1[i] = roundFile('ch1', i);
const RS = {}; for (let i = 1; i <= 5; i++) RS[i] = roundFile('ch1s', i);

/* 한 과목 회차 행: 첫 응시 + (틀린 게 셋 이상이면) 재시, 재시에서 또 틀리면 재재시 */
function courseRows(course, rounds, prof, seed, start) {
  const rnd = rng(seed), rows = [];
  Object.keys(rounds).map(Number).sort((a, b) => a - b).forEach(rd => {
    const its = rounds[rd].jeongsi.items;
    const date = new Date(start.getTime() + (rd - 1) * 7 * 864e5).toISOString();
    let ans = '', wrong = [];
    its.forEach(x => { const pw = prof.weak[x.c] != null ? prof.weak[x.c] : prof.base; const bad = rnd() < pw; ans += bad ? (x.a === 'O' ? 'X' : 'O') : x.a; if (bad) wrong.push(x.c); });
    const base = { name: prof.name, school: prof.school, year: prof.year, studentKey: prof.key, course, round: rd, isTest: false };
    rows.push(Object.assign({}, base, { attempt: '첫 응시', date, answers: ans, retakeCids: '', retakeKeys: '' }));
    let left = wrong.slice(), label = '재시';
    for (let t = 0; t < 2 && left.length >= (t ? 1 : 3); t++) {
      const keys = left.map(() => (rnd() < 0.5 ? 'O' : 'X')).join('');
      let a = '', still = [];
      left.forEach((c, k) => { const fix = prof.fix[c] != null ? prof.fix[c] : prof.fixBase; const ok = rnd() < fix; a += ok ? keys[k] : (keys[k] === 'O' ? 'X' : 'O'); if (!ok) still.push(c); });
      rows.push(Object.assign({}, base, { attempt: label, date, answers: a, retakeCids: left.join(','), retakeKeys: keys }));
      left = still; label = '재' + label;
    }
  });
  return rows;
}
function answers(fn) { return DOC.items.map((it, i) => String(fn(it, i))).join(''); }

const SCHOOL = '가상고-연습';
/* A — 기록 좋은 과신형: 대부분 잘 맞히지만 몇 개념은 계속 흔들리는데, 그 개념에도 «매우 그렇다» */
const A_WEAK = { 'CH1-013': 0.55, 'CH1-040': 0.55, 'CH1-056': 0.6, 'CH1-043': 0.6, 'CH1-070': 0.6, 'CH1-186': 0.6, 'CH1-255': 0.6, 'CH1-268': 0.6, 'CH1-249': 0.6, 'CH1-270': 0.6 };
const PA = { name: '가상하나', school: SCHOOL, year: '2', key: SCHOOL + '-가상하나', base: 0.09, weak: A_WEAK, fixBase: 0.9, fix: { 'CH1-013': 0.3, 'CH1-040': 0.3, 'CH1-056': 0.3, 'CH1-043': 0.3, 'CH1-249': 0.3, 'CH1-270': 0.3 } };
const ROWS_A = courseRows('ch1', R1, PA, 11, new Date('2026-05-04T09:00:00Z'))
  .concat(courseRows('ch1s', RS, Object.assign({}, PA, { base: 0.1, weak: {} }), 12, new Date('2026-09-07T09:00:00Z')));
const WEAK_K = { q006: 1, q016: 1, q019: 1, q031: 1 };
const ANS_A = answers((it, i) => {
  if (it.type === 'concept') return WEAK_K[it.k] ? 1 : (i % 5 === 4 ? 2 : i % 7 === 6 ? 3 : 1);
  if (it.type === 'belief') { if (!it.mis) return 1; return (it.k === 'q068' || it.k === 'q074' || it.k === 'q034') ? 1 : 5; }
  return it.group === 'difficulty' ? (i % 4 === 0 ? 2 : 4) : it.group === 'habit' ? 3 : 2;
});
/* B — 숨은 실력형: 기록은 꾸준히 좋은데 자신감은 «보통·아니다» */
const PB = { name: '가상두리', school: SCHOOL, year: '2', key: SCHOOL + '-가상두리', base: 0.03, weak: {}, fixBase: 0.95, fix: {} };
const ROWS_B = courseRows('ch1', R1, PB, 21, new Date('2026-05-04T09:00:00Z'));
const ANS_B = answers((it, i) => {
  if (it.type === 'concept') return i % 5 === 0 ? 3 : i % 7 === 0 ? 2 : 4;
  if (it.type === 'belief') return it.mis ? 5 : 1;
  return it.k === 'q035' || it.k === 'q065' ? 1 : it.group === 'difficulty' ? 2 + (i % 3) : 2 + (i % 2) * 2;
});
/* C — 설문만(기록 없음) · D — 기록만(설문 없음) */
const PC = { name: '가상세찬', school: SCHOOL, year: '1', key: SCHOOL + '-가상세찬' };
const ANS_C = answers((it, i) => (i % 5) + 1);
const PD = { name: '가상네모', school: SCHOOL, year: '1', key: SCHOOL + '-가상네모', base: 0.12, weak: {}, fixBase: 0.8, fix: {} };
const ROWS_D = courseRows('ch1', R1, PD, 41, new Date('2026-05-04T09:00:00Z'));

const CODES = { A: 'fakecodea00001', B: 'fakecodeb00002', C: 'fakecodec00003', D: 'fakecoded00004' };
const SV = (p, ans, code) => ({ date: '2026-09-28T05:00:00.000Z', studentKey: p.key, name: p.name, school: p.school, year: p.year, survey: DOC.id, ans, ms: 1500000, isTest: false, src: 'web', code });
const SURVEY_ROWS = [SV(PA, ANS_A, CODES.A), SV(PB, ANS_B, CODES.B), SV(PC, ANS_C, CODES.C)];
const ALL_ROWS = ROWS_A.concat(ROWS_B, ROWS_D);

/* exam — 시험 셋(가상 id), 20문항, 영역 넷 */
const AREAS = ['원자의구조', '몰과질량', '열화학', '양적관계'], TYPES = ['동위원소', '몰=질량/분자량', '반응열', '한계반응물'];
const EXAMS = ['fake-mock-1', 'fake-mock-2', 'fake-mock-3'].map((id, j) => {
  const r = rng(100 + j); const key = Array.from({ length: 20 }, () => 1 + Math.floor(r() * 4));
  return { id, title: '가상 모의고사 ' + (j + 1) + '회', group: j === 2 ? 'KMChC' : 'JMChC', nQ: 20, key, miss: [], area: key.map((_, q) => AREAS[Math.floor(q / 5)]), type: key.map((_, q) => TYPES[Math.floor(q / 5)]) };
});
const EX_ANS = {}; EXAMS.forEach(e => { const qs = {}; e.key.forEach((k, q) => { qs[String(q + 1)] = { answer: k, acceptableAnswers: [k], concept: e.type[q], area: e.area[q], misconception: '함정: ' + e.type[q] + '에서 질량과 몰을 섞어 쓰기 쉽다. 기준을 먼저 정한다.' }; }); EX_ANS[e.id] = { examId: e.id, questions: qs }; });
const BASELINE = { exams: {} }; EXAMS.forEach(e => { BASELINE.exams[e.id] = { n: 40, qc: e.key.map((_, q) => q % 4 === 3 ? 12 : 32) }; });
function examAns(e, wrongTypes, seed) { const r = rng(seed); return e.key.map((k, q) => (wrongTypes[e.type[q]] && r() < 0.85) || r() < 0.08 ? ((k % 4) + 1) : k).join(''); }
const EXAM_ROWS = [
  ...EXAMS.map((e, j) => ({ examId: e.id, exam: e.title, name: PA.name, school: ' 가상고-연습', grade: '2학년', answers: examAns(e, j < 2 ? { '한계반응물': 1 } : {}, 300 + j), ts: Date.parse('2026-0' + (3 + j) + '-15T09:00:00Z') })),
  { examId: EXAMS[0].id, exam: EXAMS[0].title, name: PB.name, school: '', grade: '2', answers: examAns(EXAMS[0], {}, 400), ts: Date.parse('2026-04-01T09:00:00Z') },
  { examId: EXAMS[1].id, exam: EXAMS[1].title, name: '가상남남', school: '다른중', grade: '3', answers: examAns(EXAMS[1], {}, 401), ts: Date.parse('2026-04-01T09:00:00Z') }
];
/* KMChC — 문항은 구조만 본뜬 가상 문항 */
const KM_ITEMS = [].concat(
  ['IN', 'EF'].flatMap((c, ci) => [1, 2, 3, 4].map(t => ({ id: 'A-' + c + t, block: 'A', con: ci ? 'efficacy' : 'interest', kind: 'ladder', tier: t, rev: false, text: c + t }))),
  [1, 2, 3, 4].map(t => ({ id: 'D-MC' + t, block: 'D', con: 'metacog', kind: 'ladder', tier: t, rev: false, text: 'MC' + t })),
  ['phenom', 'symbol', 'quant', 'lab'].flatMap(c => [{ id: 'A-ICX-' + c, block: 'A', con: 'interest', kind: 'context', ctx: c, rev: false, text: '흥미 ' + c }, { id: 'A-XCX-' + c, block: 'A', con: 'anxiety', kind: 'context', ctx: c, rev: false, text: '불안 ' + c }]),
  [{ id: 'A-AXG', block: 'A', con: 'anxiety', kind: 'general', rev: false, text: '불안' }, { id: 'A-VI1', block: 'A', con: 'value', kind: 'internalize', rev: false, text: '가치' },
   { id: 'C1', block: 'C', cluster: 'combustion', intu: 'conservation', q: '장작이 다 타면?', t1: [{ t: '정말로 물질이 사라진다', m: '소멸' }, { t: '기체로 빠져나간다', key: 1 }, { t: '잘 모르겠다', u: 1 }] },
   { id: 'C2', block: 'C', cluster: 'boiling', intu: 'particle', q: '끓는 물의 거품은?', t1: [{ t: '공기', m: '거품=공기' }, { t: '수증기', key: 1 }, { t: '잘 모르겠다', u: 1 }] },
   { id: 'V-AT', block: 'V', con: 'validity', kind: 'attention', answer: 3, text: '주의' }]);
const KM_ANS_A = { 'A-ICX-phenom': 5, 'A-ICX-symbol': 4, 'A-ICX-quant': 2, 'A-ICX-lab': 5, 'A-XCX-phenom': 2, 'A-XCX-symbol': 3, 'A-XCX-quant': 5, 'A-XCX-lab': 2, 'A-IN1': 5, 'A-IN2': 4, 'A-IN3': 4, 'A-IN4': 2, 'A-EF1': 5, 'A-EF2': 4, 'A-EF3': 2, 'A-EF4': 1, 'D-MC1': 4, 'D-MC2': 3, 'D-MC3': 2, 'D-MC4': 1, 'A-AXG': 4, 'A-VI1': 4, C1: { t1: 0, conf: 4 }, C2: 1, 'V-AT': 3 };
const KM_NAMES = [{ id: 'KMFAKE01', name: PA.name, grade: '2', kind: '일반', ts: Date.parse('2025-11-02T09:00:00Z') },
  { id: 'KMFAKE02', name: PB.name, grade: '2', kind: '일반', ts: Date.parse('2025-11-02T09:00:00Z') }, { id: 'KMFAKE03', name: PB.name, grade: '2', kind: '심화', ts: Date.parse('2025-12-02T09:00:00Z') }];
const b64 = o => Buffer.from(unescape(encodeURIComponent(JSON.stringify(o))), 'binary').toString('base64');

function routeAll(page, opt) {
  opt = opt || {};
  return page.route(/script\.google\.com|\/exam\/|\/KMChC\//, route => {
    const u = new URL(route.request().url()), p = u.searchParams, cb = p.get('callback');
    const json = o => route.fulfill({ status: 200, contentType: cb ? 'text/javascript' : 'application/json', body: cb ? cb + '(' + JSON.stringify(o) + ')' : JSON.stringify(o) });
    if (/\/exam\/exams\.json$/.test(u.pathname)) return json(EXAMS);
    if (/\/exam\/cohort\/baseline\.json$/.test(u.pathname)) return json(BASELINE);
    const am = u.pathname.match(/\/exam\/answers\/(.+)\.json$/); if (am) return EX_ANS[decodeURIComponent(am[1])] ? json(EX_ANS[decodeURIComponent(am[1])]) : route.fulfill({ status: 404, body: '' });
    if (/\/KMChC\/items\.json$/.test(u.pathname)) return json(KM_ITEMS);
    if (/AKfycbxGm/.test(u.pathname)) return opt.examFail ? route.abort() : json(p.get('action') === 'all' ? { ok: true, rows: EXAM_ROWS, n: EXAM_ROWS.length } : { ok: false });
    if (/AKfycbxdD/.test(u.pathname)) {
      if (p.get('action') === 'names') return json({ ok: true, students: KM_NAMES });
      if (p.get('action') === 'get') return json(p.get('id') === 'KMFAKE01' ? { ok: true, id: 'KMFAKE01', answers: b64(KM_ANS_A) } : { ok: true, id: p.get('id'), answers: b64({ 'A-IN1': 4, 'A-EF1': 4, 'D-MC1': 4, 'A-AXG': 2, C2: 1 }) });
      return json({ ok: false });
    }
    /* DT */
    const who = Object.keys(CODES).filter(k => CODES[k] === p.get('student'))[0];
    const P = { A: PA, B: PB, C: PC, D: PD }[who];
    const ROWS = { A: ROWS_A, B: ROWS_B, C: [], D: ROWS_D }[who] || [];
    if (p.get('action') === 'surveyOne') {
      if (!P) return json({ ok: false, error: 'student' });
      const sv = SURVEY_ROWS.filter(r => r.code === CODES[who]);
      return json({ ok: true, rows: sv.map(r => ({ date: r.date, name: r.name, survey: r.survey, ans: r.ans, isTest: false })), ch1: ROWS.filter(r => r.course === 'ch1').map(r => ({ course: 'ch1', round: r.round, attempt: r.attempt, answers: r.answers, retakeCids: r.retakeCids, retakeKeys: r.retakeKeys, isTest: false })) });
    }
    if (p.get('action') === 'survey') return json({ ok: true, rows: SURVEY_ROWS });
    if (p.get('all') === '1') return json({ ok: true, rows: ALL_ROWS });
    if (p.get('student')) return P ? json({ ok: true, student: P.key, rows: ROWS }) : json({ ok: false, error: 'student key required' });
    return json({ ok: false });
  });
}

module.exports = { ROOT, rng, DOC, LINK, roundFile, R1, RS, courseRows, answers, SCHOOL,
  PA, PB, PC, PD, ROWS_A, ROWS_B, ROWS_D, ANS_A, ANS_B, ANS_C, CODES, SV, SURVEY_ROWS, ALL_ROWS,
  AREAS, TYPES, EXAMS, EX_ANS, BASELINE, examAns, EXAM_ROWS, KM_ITEMS, KM_ANS_A, KM_NAMES, b64, routeAll };
