/* ============================================================
   서술형 연습 은행 점검 — appdata/essay_<과목>.json (선생님 결정 2026-10-13)
   ------------------------------------------------------------
   성적표가 이 은행에서 학생마다 다섯 문항을 고르고, 학생이 쓴 답을 핵심 낱말(key)로
   대조해 준다(essay.js keyCheck). 은행 문구를 손으로 고치다 보면 대조가 조용히 망가진다:
     · key 가 모범 답안에 없다      → 모범 답안을 그대로 써도 «빠진 것» 이 뜬다
     · key 가 질문에 이미 있다      → 질문을 베껴 쓰기만 해도 ✓ 가 뜬다
     · 한 key 가 다른 key 를 품는다  → 한 낱말로 둘이 걸린다
   그래서 화면과 **같은 함수**(essay.js keyCheck)로 잰다. 형식(질문·모범 답안·채점 기준 3/2/1 ·
   lvl · len)과 first_round(그 과목 회차 파일에 처음 나온 회차)도 본다.

   실행: node tests/essay_bank.js   (브라우저 필요 없음)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(__dirname);
const E = require(path.join(ROOT, 'essay.js'));

/* 손으로 본 예외 — 긴 key 가 짧은 key 를 맞게 품는다(둘 다 맞는 말) · 뜻 있는 한 글자 기호 */
const SUB_OK = new Set(['CH1-029#0', 'CH2-030#1', 'CH2-081#1', 'CH2-395#0', 'CH2-397#0']);
const ONE_OK = new Set(['⇌']);

let bad = 0, total = 0;
const fail = (f, w, m) => { bad++; if (bad <= 60) console.log('  FAIL  ' + f + ' ' + w + ' — ' + m); };

for (const course of ['ch1s', 'ch1', 'ch2', 'gc']) {
  const f = 'essay_' + course + '.json', p = path.join(ROOT, 'appdata', f);
  if (!fs.existsSync(p)) { console.log('  —     ' + f + ' 없음(성적표가 구역을 뺀다)'); continue; }
  const B = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (B.course !== course) fail(f, '', 'course 가 ' + B.course);
  const first = {};
  fs.readdirSync(path.join(ROOT, 'appdata')).filter(x => new RegExp('^round_' + course + '_\\d\\d\\.json$').test(x)).sort().forEach(x => {
    const r = Number(x.slice(-7, -5));
    JSON.parse(fs.readFileSync(path.join(ROOT, 'appdata', x), 'utf8')).jeongsi.items.forEach(it => { if (!(it.c in first)) first[it.c] = r; });
  });
  let n = 0;
  for (const [c, v] of Object.entries(B.concepts || {})) {
    if (!(c in first)) fail(f, c, '그 과목 정시에 안 나오는 개념');
    else if (v.first_round !== first[c]) fail(f, c, 'first_round ' + v.first_round + ' ≠ 처음 나온 회차 ' + first[c]);
    if (!v.m) fail(f, c, '개념 이름 없음');
    const items = v.items || [];
    if (items.length < 1 || items.length > 2) fail(f, c, '문항 ' + items.length + '개');
    items.forEach((it, i) => {
      n++;
      const w = c + '#' + i;
      if (!E.validItem(it)) return fail(f, w, '질문·모범 답안 빔');
      if (!Array.isArray(it.key) || it.key.length < 3 || it.key.length > 4) fail(f, w, 'key ' + (it.key || []).length + '개');
      if (!it.rubric || ['1', '2', '3'].some(k => !String(it.rubric[k] || '').trim())) fail(f, w, '채점 기준 3/2/1');
      if ([1, 2, 3].indexOf(it.lvl) < 0) fail(f, w, 'lvl ' + it.lvl);
      if (!Array.isArray(it.len) || it.len.length !== 2 || !(it.len[0] < it.len[1])) fail(f, w, 'len ' + JSON.stringify(it.len));
      const txt = it.q + it.a + JSON.stringify(it.rubric);
      if (/\*\*/.test(txt)) fail(f, w, '«**»');
      const ka = E.keyCheck(it.a, it.key), kq = E.keyCheck(it.q, it.key);
      ka.rows.forEach(r => { if (!r.hit) fail(f, w, 'key 가 모범 답안에 없다: ' + r.alts.join('|')); });
      kq.rows.forEach(r => { if (r.hit) fail(f, w, 'key 가 질문에 이미 있다: ' + r.alts.join('|')); });
      (it.key || []).forEach(k => String(k).split('|').forEach(x => { if (E.norm(x).length < 2 && !ONE_OK.has(x.trim())) fail(f, w, '한 글자 key: ' + x); }));
      if (!SUB_OK.has(w)) it.key.forEach((k1, x) => it.key.forEach((k2, y) => {
        if (x === y || /^[\d.]/.test(String(k1).trim())) return;
        const B2 = String(k2).split('|').filter(z => z.trim());
        if (B2.length && B2.every(z => E.keyCheck(z, [k1]).got === 1)) fail(f, w, '«' + k1 + '» 가 «' + k2 + '» 안에 든다');
      }));
    });
  }
  total += n;
  console.log('  ·     ' + f + ' · 개념 ' + Object.keys(B.concepts || {}).length + ' · 문항 ' + n);
}
console.log(bad ? '\n실패 ' + bad + '건' : '\n서술형 은행 ' + total + '문항 — 형식 · 핵심 낱말 대조가 맞다.');
process.exit(bad ? 1 : 0);
