/* ============================================================
   「화학1 돌아보기」 인쇄 보고서 — 계산·짝짓기·그리기·A4 쪽수
   ------------------------------------------------------------
   지키는 것
   - survey_analysis.js 판정: 가상 학생 둘(기록 좋은 과신형 · 숨은 실력형)이 연구 §7 표대로 갈린다
     (과신·숨은 실력 개수, 치우침 방향, 확신 오류 비율, 남은 오개념·잠복 직관), 응답 품질 플래그가 걸린다.
   - survey_sources.js 짝짓기(exam/hub.html 규칙): 이름·학교·학년이 맞으면 확실, 학교를 모르거나
     동명이 여럿이면 애매(붙이지 않음), KMChC 는 같은 이름이 하나뿐일 때만 확실.
   - survey_print.html 이 서버 응답을 가짜로 받아(page.route) 오류 없이 그려지고, 금지 낱말
     (상·금상·은상·동상·수상·등수·더닝)이 없고, 표지에 「화학 · 다원교육 · 조준모」가 있고,
     A4 PDF 가 10~20쪽이다. 기록 없는 학생·설문 없는 학생도 깨지지 않는다.
   - survey_print_batch.html: 세 곳(DT·exam·KMChC) 가짜 응답으로 짝 확인 표(확실/애매)가 뜨고,
     애매한 짝은 고르기 전에는 붙지 않으며, 고르면 붙는다.
   학생 이름·학교는 모두 가상이다(tools/name_guard.py).

   실행:
       NODE_PATH=/opt/node22/lib/node_modules node tests/survey_print.js
       SP_SAMPLE_PDF=/경로/견본.pdf 를 주면 세 곳 자료를 넣은 가상 학생의 견본 PDF 를 찍는다.
   ============================================================ */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8957);
const SA = require(path.join(ROOT, 'survey_analysis.js'));
const SS = require(path.join(ROOT, 'survey_sources.js'));

let fail = 0;
const chk = (name, ok, info) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok ? '' : '  → ' + JSON.stringify(info))); if (!ok) fail++; };

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

/* ── 1. 계산 ─────────────────────────────────────────── */
console.log('\n── survey_analysis.js 판정 ──');
const A = SA.analyzeAll({ doc: DOC, ans: ANS_A, rows: ROWS_A, roundsByCourse: { ch1: R1, ch1s: RS }, link: LINK });
const B = SA.analyzeAll({ doc: DOC, ans: ANS_B, rows: ROWS_B, roundsByCourse: { ch1: R1 } });
const by = (X, k) => X.rows.filter(r => r.k === k)[0];
chk('A: 기록이 있다(18회)', A.hasRecord && A.record.rounds.length === 18, A.record.rounds.length);
chk('A: 첫 시도 정답률이 높다(≥ 85%)', A.record.rate >= 0.85, A.record.rate);
chk('A: 과신 2개 이상', A.counts.over >= 2, A.counts);
chk('A: 자신 있다던 약한 개념(설문 6번 루이스)이 과신', by(A, 'q006').verdict === 'over', by(A, 'q006').verdict);
chk('A: 치우침이 «높여 봄»', A.metrics.biasBand === 'over', A.metrics.bias);
chk('A: 확신 오류 비율 ≥ 10% (주의 이상)', A.metrics.hce >= 0.10 && A.metrics.hceBand !== 'good', A.metrics.hce);
chk('A: 공감한 오개념 + 약한 기록 = 남은 오개념(평형 멈춤 · 촉매)', A.remain.map(r => r.k).filter(k => k === 'q068' || k === 'q074').length >= 1, A.remain.map(r => r.k));
chk('A: 공감했지만 기록이 좋은 «원자 번호와 크기»는 잠복 직관', by(A, 'q034').tags.indexOf('latent') >= 0, by(A, 'q034'));
chk('A 의 과신 > B 의 과신', A.counts.over > B.counts.over, [A.counts, B.counts]);
chk('A: 화학Ⅰ 심화 과목도 읽었다', A.courses.map(c => c.course).join() === 'ch1,ch1s', A.courses.map(c => c.course));
chk('A: 화학Ⅰ → 심화 연결 개념이 있다', A.link && A.link.n > 0, A.link && A.link.n);
chk('B: 숨은 실력 5개 이상', B.counts.hidden >= 5, B.counts);
chk('B: 과신 0 · 남은 오개념 0', B.counts.over === 0 && B.counts.remain === 0, B.counts);
chk('B: 치우침이 «낮춰 봄»', B.metrics.biasBand === 'under', B.metrics.bias);
chk('B: 직관 판별이 깨끗함', B.quality.cleanIntuition === true, B.quality);
chk('A·B: 응답 품질 플래그 없음', !A.quality.flags.length && !B.quality.flags.length, [A.quality.flags, B.quality.flags]);
const S = SA.analyze({ doc: DOC, ans: '2'.repeat(100), rows: ROWS_B, rounds: R1 });
chk('직선 응답(전부 2)은 품질 플래그 · 무게 낮춤', S.quality.flags.indexOf('straight') >= 0 && S.quality.weightLow, S.quality.flags);
const Q = SA.analyze({ doc: DOC, ans: answers(it => it.type === 'belief' ? 1 : 3), rows: [], rounds: R1 });
chk('직관 문장에 전부 동의는 묵종 · 직관 해석 유보', Q.quality.flags.indexOf('acquiescence') >= 0 && Q.quality.intuitionHold, Q.quality.flags);
chk('보통 쏠림은 학생 안 기준 우선', Q.quality.useZ === true, Q.quality.midRate);
const N0 = SA.analyze({ doc: DOC, ans: ANS_C, rows: [], rounds: R1 });
chk('기록 없음: hasRecord=false · 모두 관찰', !N0.hasRecord && N0.counts.watch === N0.rows.length, N0.counts);
const N1 = SA.analyze({ doc: DOC, ans: '', rows: ROWS_D, rounds: R1 });
chk('설문 없음: 기록만으로 판정', !N1.hasSurvey && N1.hasRecord, [N1.hasSurvey, N1.hasRecord]);

console.log('\n── survey_sources.js 짝짓기 · 어댑터 ──');
chk('학교 표기: 가상중 = 가상중학교 · 가상중 ≠ 가상고 · 모르면 가르지 않음', SS.schoolAkin('가상중', '가상중학교') && !SS.schoolAkin('가상중', '가상고') && SS.schoolAkin('', '가상고'), '');
chk('이름 칸에 붙은 학교는 뗀다(가상하나 가상중 → 가상하나)', SS.justName('가상하나 가상중') === '가상하나', SS.justName('가상하나 가상중'));
const M = SS.matchAll([{ key: 'A', name: PA.name, school: PA.school, year: '2' }, { key: 'B', name: PB.name, school: PB.school, year: '2' }, { key: 'C', name: PC.name, school: PC.school, year: '1' }], EXAM_ROWS, KM_NAMES);
chk('exam: A 는 이름·학교·학년(2 ↔ 2학년)이 맞아 확실', M.A.exam.status === 'sure' && !!M.A.exam.pick, M.A.exam);
chk('exam: B 는 학교 칸이 비어 애매 · 붙이지 않음', M.B.exam.status === 'maybe' && M.B.exam.pick === null, M.B.exam);
chk('exam: C 는 없음', M.C.exam.status === 'none' && !M.C.exam.options.length, M.C.exam);
chk('KMChC: A 는 같은 이름이 하나뿐이라 확실', M.A.km.status === 'sure' && M.A.km.pick === 'KMFAKE01', M.A.km);
chk('KMChC: B 는 같은 이름이 둘이라 애매 · 붙이지 않음', M.B.km.status === 'maybe' && M.B.km.pick === null && M.B.km.options.length === 2, M.B.km);
const exA = SS.examAdapter(EXAM_ROWS.filter(r => r.name === PA.name), { exams: EXAMS, answers: EX_ANS, baseline: BASELINE });
chk('exam 어댑터: 시험 셋 · 영역 넷 · 또래 깊이', exA.length === 3 && exA[0].areas.length === 4 && !!exA[0].depth, exA.map(e => [e.id, e.ok, e.n]));
chk('exam 어댑터: 순위 칸이 없다', exA.every(e => !('rank' in e) && !('percentile' in e)), Object.keys(exA[0]));
chk('되풀이 오답: 두 시험에서 «한계반응물»', SA.repeatedExam(SA.normalizeExternal({ exams: exA }).exams).some(x => x.topic === '한계반응물' && x.nEx >= 2), SA.repeatedExam(exA));
const kmA = SS.kmAdapter(SS.decodeKm(b64(KM_ANS_A)), KM_ITEMS, KM_NAMES[0]);
chk('KMChC 어댑터: 흥미 3단 · 효능감 2단 · 메타인지 1단 · 불안 75', kmA.interest === 3 && kmA.efficacy === 2 && kmA.metacog === 1 && kmA.anxiety === 75, kmA);
chk('KMChC 어댑터: 2단 오개념 하나(연소 — 소멸)', kmA.misc.length === 1 && kmA.misc[0].cluster === 'combustion', kmA.misc);
const AX = SA.analyzeAll({ doc: DOC, ans: ANS_A, rows: ROWS_A, roundsByCourse: { ch1: R1, ch1s: RS }, link: LINK, external: { exams: exA, kmchc: [kmA], status: { exam: 'ok', kmchc: 'ok' } } });
chk('합친 분석: 타임라인에 DT 23회 + 모의시험 3', AX.timeline.length === 26, AX.timeline.length);
chk('합친 분석: 누적 지도에 모의시험 열', AX.areaMap.cols.indexOf('모의시험') >= 0, AX.areaMap.cols);
chk('합친 분석: 되풀이 오개념에 출처 셋 이상', new Set([].concat(...AX.recurring.groups.map(g => g.sources))).size >= 3, AX.recurring.groups.map(g => g.sources));
chk('합친 분석: KMChC 비교 축 5개 이상', AX.kmCompare && AX.kmCompare.rows.length >= 5, AX.kmCompare);

console.log('\n── survey_render.js charts(Word 생성기용 SVG 문자열) ──');
const RD = require(path.join(ROOT, 'survey_render.js'));
const CH = RD.charts, svgs = { journey: CH.journey(AX), scatter: CH.scatter(AX).svg, bias: CH.bias(AX.metrics.bias), radar: CH.radar(AX), cycle: CH.cycle(AX.habits.subs),
  timeline: CH.timeline(AX), spark: CH.spark(AX.courses[0].rounds), categories: CH.categories(AX.counts),
  hbars: CH.hbars(AX.habits.subs.map(x => ({ label: x.name, value: x.avg, min: 1, max: 5 }))), kmCompare: CH.kmCompare(AX.kmCompare) };
Object.keys(svgs).forEach(k => chk('charts.' + k + ' → 따로 그릴 수 있는 SVG(xmlns·width·height)', /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[\d.]+" height="[\d.]+"/.test(svgs[k]) && /<\/svg>$/.test(svgs[k]), svgs[k].slice(0, 80)));
chk('charts 는 DOM 없이 Node 에서 돈다', typeof document === 'undefined', '');

/* ── 2. 화면 ─────────────────────────────────────────── */
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (e) { if (process.env.REQUIRE_BROWSER) { console.log('실패: playwright 를 찾지 못했다'); process.exit(1); } console.log('\n건너뜀: playwright 를 찾지 못했다'); finish(); }

const FORBID = /금상|은상|동상|수상|등수|더닝|(?:^|[^가-힣])상(?:[을이은도]|권)?(?=[^가-힣]|$)/;
const BRAND = '화학 · 다원교육 · 조준모';

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
function pdfPages(buf) { const s = buf.toString('latin1'); return (s.match(/\/Type\s*\/Page(?!s)/g) || []).length; }

async function openSingle(browser, code, opt) {
  opt = opt || {};
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
  if (opt.admin) await ctx.addInitScript(() => { try { localStorage.setItem('sp_admin', '1'); } catch (e) {} });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  await routeAll(page, opt);
  await page.goto(`http://localhost:${PORT}/survey_print.html?student=${code}${opt.admin ? '&admin=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SP_READY || window.__SP_ERR, null, { timeout: 90000 });
  return { ctx, page, errs };
}
async function textOf(page, sel) { return page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, sel); }

async function main() {
  const srv = spawn(process.execPath, ['-e', `
    const http=require('http'),fs=require('fs'),p=require('path');
    const T={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png'};
    http.createServer((q,s)=>{ const f=p.join(${JSON.stringify(ROOT)}, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f,(e,d)=>e?(s.writeHead(404),s.end()):(s.writeHead(200,{'Content-Type':T[p.extname(f)]||'text/plain'}),s.end(d))); }).listen(${PORT});`], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    if (process.env.SP_ONLY === 'sample') {   /* 견본만 빨리 — 디자인 다듬을 때 */
      const o = await openSingle(browser, CODES[process.env.SP_WHO || 'A'], { admin: process.env.SP_ADMIN !== '0' });
      console.log('  errs', o.errs, await o.page.evaluate(() => window.__SP_ERR), 'pages', await o.page.evaluate(() => window.__SP_PAGES));
      console.log(await o.page.evaluate(() => [...document.querySelectorAll('.sp-body')].map((b, i) => { const l = b.lastElementChild; return (i + 1) + ':' + Math.round((l ? l.offsetTop + l.offsetHeight : 0) / b.clientHeight * 100) + '%' + (b.scrollHeight > b.clientHeight + 1 ? '!OVER' : '') + ' ' + ((b.querySelector('h2') || {}).innerText || ''); }).join('\n')));
      await o.page.emulateMedia({ media: 'print' });
      fs.writeFileSync(process.env.SP_SAMPLE_PDF, await o.page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
      await o.ctx.close(); return;
    }
    console.log('\n── survey_print.html · 과신형(학생·부모 링크 = DT 만) ──');
    let { ctx, page, errs } = await openSingle(browser, CODES.A);
    chk('오류 없이 그렸다', !(await page.evaluate(() => window.__SP_ERR)) && !errs.length, errs.concat([await page.evaluate(() => window.__SP_ERR)]));
    const nA = await page.evaluate(() => window.__SP_PAGES);
    chk('쪽수 10~20 (화면 쪽 나눔)', nA >= 10 && nA <= 20, nA);
    const all = await textOf(page, '#pvApp');
    const bad = all.split(/\n/).filter(l => FORBID.test(l));
    chk('금지 낱말(상·금상·은상·동상·수상·등수·더닝)이 없다', !bad.length, bad.slice(0, 3));
    chk('표지에 「화학 · 다원교육 · 조준모」', (await textOf(page, '.sp-cover')).indexOf(BRAND) >= 0, (await textOf(page, '.sp-cover')).slice(0, 200));
    chk('표지에 학생 이름 · 학교', (await textOf(page, '.sp-cover')).indexOf(PA.name) >= 0 && (await textOf(page, '.sp-cover')).indexOf(SCHOOL) >= 0, '');
    chk('모든 쪽 머리·바닥에 상호', await page.evaluate(b => [...document.querySelectorAll('.sp-page:not(.sp-cover)')].every(p => p.querySelector('.sp-run-top').innerText.indexOf(b) >= 0 && p.querySelector('.sp-run-bot').innerText.indexOf(b) >= 0), BRAND), '');
    chk('넘친 쪽이 없다(겹침·잘림)', await page.evaluate(() => [...document.querySelectorAll('.sp-body')].every(b => b.scrollHeight <= b.clientHeight + 1)), '');
    chk('빈 쪽이 없다', await page.evaluate(() => [...document.querySelectorAll('.sp-body')].every(b => b.children.length > 0)), '');
    const small = await page.evaluate(() => { const out = []; document.querySelectorAll('.sp-root *').forEach(e => { if (e.closest('svg')) return; if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const f = parseFloat(getComputedStyle(e).fontSize); if (f < 11.5) out.push(e.className + ':' + f); }); return out; });
    chk('글씨가 11.5px 이상', !small.length, small.slice(0, 5));
    chk('절 열셋 + 부모님께 + 부록', (all.match(/한눈에 보기|18주 학습 여정|자기 판단과 실제 기록|단원별 진단|개념별 진단표|남은 오개념 카드|공부 습관과 마음|어려웠던 점과 처방|다음 과정을 위한 처방|지금까지의 모든 시험|영역·개념 누적 지도|되풀이되는 오개념|이전 KMChC 학습진단과 비교|부모님께|부록/g) || []).length >= 15, '');
    chk('학생·부모 링크에는 바깥 기록을 붙이지 않는다', all.indexOf('선생님 화면(관리자 모드)에서만') >= 0 && all.indexOf('가상 모의고사') < 0, '');
    chk('화학Ⅰ 심화 기록도 실렸다', all.indexOf('화학Ⅰ 심화') >= 0, '');
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pp = pdfPages(pdf);
    chk('A4 PDF 10~20쪽 · 화면 쪽수와 같다', pp >= 10 && pp <= 20 && pp === nA, [pp, nA]);
    await ctx.close();

    console.log('\n── survey_print.html · 숨은 실력형 · 기록 없음 · 설문 없음 ──');
    for (const [k, want] of [['B', '숨은 실력'], ['C', '화학1 시험 기록이 이 링크와 아직 이어지지 않았습니다'], ['D', '설문 응답이 아직 없습니다']]) {
      ({ ctx, page, errs } = await openSingle(browser, CODES[k]));
      const t = await textOf(page, '#pvApp'), n = await page.evaluate(() => window.__SP_PAGES);
      chk(k + ': 오류 없이 그렸다 · ' + n + '쪽', !(await page.evaluate(() => window.__SP_ERR)) && !errs.length && n >= 10 && n <= 20, errs.concat([n]));
      chk(k + ': «' + want + '»', t.indexOf(want) >= 0, t.slice(0, 120));
      chk(k + ': 금지 낱말 없음', !t.split(/\n/).some(l => FORBID.test(l)), t.split(/\n/).filter(l => FORBID.test(l)).slice(0, 2));
      await ctx.close();
    }

    console.log('\n── survey_print.html · 선생님 화면(세 곳 합침) ──');
    ({ ctx, page, errs } = await openSingle(browser, CODES.A, { admin: true }));
    let t = await textOf(page, '#pvApp');
    chk('오류 없이 그렸다', !(await page.evaluate(() => window.__SP_ERR)) && !errs.length, errs);
    chk('짝 확인 칸이 뜬다(확실)', (await textOf(page, '#pvPanel')).indexOf('확실') >= 0, await textOf(page, '#pvPanel'));
    chk('모의시험 표에 가상 모의고사 셋', (t.match(/가상 모의고사 \d회/g) || []).length >= 3, '');
    chk('되풀이 오개념에 KMChC · 모의시험 · DT', t.indexOf('KMChC 진단') >= 0 && /모의시험\s/.test(t) && t.indexOf('DT 화학Ⅰ') >= 0, '');
    chk('KMChC 비교 표(흥미 3단)', t.indexOf('3단 / 4') >= 0, '');
    const nX = await page.evaluate(() => window.__SP_PAGES);
    chk('세 곳 합쳐도 10~20쪽 · 넘친 쪽 없음', nX >= 10 && nX <= 20 && await page.evaluate(() => [...document.querySelectorAll('.sp-body')].every(b => b.scrollHeight <= b.clientHeight + 1)), nX);
    chk('금지 낱말 없음', !t.split(/\n/).some(l => FORBID.test(l)), t.split(/\n/).filter(l => FORBID.test(l)).slice(0, 2));
    const dec = await page.evaluate(async () => { const A = window.__SP_A, C = SurveyRender.charts, out = {};
      for (const [k, svg] of Object.entries({ journey: C.journey(A), scatter: C.scatter(A).svg, radar: C.radar(A), timeline: C.timeline(A), categories: C.categories(A.counts) })) {
        const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        try { await im.decode(); out[k] = im.naturalWidth; } catch (e) { out[k] = 0; } }
      return out; });
    chk('charts 의 SVG 가 그림(이미지)으로 풀린다 — PNG 로 옮길 수 있다', Object.values(dec).every(w => w > 0), dec);
    if (process.env.SP_SAMPLE_PDF) {
      await page.emulateMedia({ media: 'print' });
      fs.writeFileSync(process.env.SP_SAMPLE_PDF, await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
      console.log('  견본 PDF → ' + process.env.SP_SAMPLE_PDF);
    }
    await ctx.close();
    ({ ctx, page, errs } = await openSingle(browser, CODES.A, { admin: true, examFail: true }));
    t = await textOf(page, '#pvApp');
    chk('exam 이 안 닿으면 «자료를 불러오지 못했습니다» · 나머지는 그린다', t.indexOf('모의시험 자료를 불러오지 못했습니다') >= 0 && t.indexOf('3단 / 4') >= 0 && !errs.filter(e => !/ERR_FAILED|net::/.test(e)).length, errs);
    await ctx.close();

    console.log('\n── survey_print_batch.html · 반 전체 ──');
    ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 } });
    page = await ctx.newPage(); errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await routeAll(page);
    await page.goto(`http://localhost:${PORT}/survey_print_batch.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#pvPairs table', { timeout: 60000 });
    const pairs = await page.evaluate(() => [...document.querySelectorAll('#pvPairs tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')));
    chk('짝 확인 표에 학생 셋', pairs.length === 3, pairs);
    chk('A: 모의시험·학습진단 모두 확실', /확실.*확실/.test(pairs[0]), pairs[0]);
    chk('B: 애매 표시 · 확인 필요 줄', /애매.*애매/.test(pairs[1]) && await page.evaluate(() => document.querySelectorAll('#pvPairs tr.need').length === 1), pairs[1]);
    chk('개인 보고서 문(survey_print.html)이 걸려 있다', await page.evaluate(() => !!document.querySelector('#pvPairs a[href^="survey_print.html?student="]')), '');
    await page.click('#pvMake');
    await page.waitForFunction(() => window.__SP_READY, null, { timeout: 120000 });
    const nb = await page.evaluate(() => [window.__SP_N, window.__SP_PAGES]);
    chk('세 명 보고서를 만들었다', nb[0] === 3 && nb[1] >= 30 && nb[1] <= 60, nb);
    const rep = await page.evaluate(() => [...document.querySelectorAll('.pv-one')].map(x => x.innerText));
    chk('A 보고서에는 모의시험이 붙었다', rep[0].indexOf('가상 모의고사 1회') >= 0, '');
    chk('B 보고서에는 애매한 짝이 붙지 않았다', rep[1].indexOf('가상 모의고사') < 0 && rep[1].indexOf('짝지은 기록이 없습니다') >= 0, '');
    chk('오류 없음 · 금지 낱말 없음', !errs.length && !rep.join('\n').split(/\n/).some(l => FORBID.test(l)), errs);
    /* B 의 애매한 짝을 선생님이 고르면 붙는다 */
    await page.selectOption('#pvPairs tr:nth-child(2) select[aria-label="모의시험 짝"]', { index: 1 });
    await page.evaluate(() => { window.__SP_READY = false; });
    await page.click('#pvMake');
    await page.waitForFunction(() => window.__SP_READY, null, { timeout: 120000 });
    const rep2 = await page.evaluate(() => document.querySelectorAll('.pv-one')[1].innerText);
    chk('고른 뒤에는 B 에도 모의시험이 붙는다', rep2.indexOf('가상 모의고사 1회') >= 0, '');
    await page.emulateMedia({ media: 'print' });
    const bp = pdfPages(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
    chk('일괄 PDF 쪽수 = 화면 쪽수', bp === await page.evaluate(() => window.__SP_PAGES), [bp, await page.evaluate(() => window.__SP_PAGES)]);
    await ctx.close();
  } finally { await browser.close(); srv.kill(); }
  finish();
}
function finish() { console.log(fail ? `\nFAIL ${fail}건` : '\nPASS'); process.exit(fail ? 1 : 0); }
if (chromium) main().catch(e => { console.error(e); process.exit(1); });
