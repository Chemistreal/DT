/* ============================================================
   Chemistreal 채점·진단·재시 로직 엔진 (Phase 2)
   - 순수 함수만. DOM·네트워크 없음. Node와 브라우저에서 동일 동작.
   - 여기서 테스트 통과한 코드가 그대로 앱(Phase 4)에 들어간다.
   ============================================================ */
(function (root) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     같은 개념이 다른 이름으로 흩어져 있다

     "반복해서 막히는 개념"은 **서로 다른 회차에서 같은 이름의 오개념을 틀렸을
     때**만 뜬다(아래 chronic). 그런데 이름이 갈려 있으면 같은 곳에서 세 번을
     막혀도 신호가 안 난다 — 세어 보니 오개념 793종 가운데 **474종(59.8%)이 단
     한 회차에만 있어서**, 문항 602개(21.8%)는 아무리 틀려도 구조적으로 신호를
     못 냈다.

     갈린 이유는 표기와 어순이다: `몰농도 온도`/`몰농도와 온도`,
     `압력과 끓는점`/`끓는점과 압력`, `옥텟규칙`/`옥텟 규칙`, `몰질량`/`질량 계산`
     (문항 문장이 글자까지 같다).

     [자료는 고치지 않는다]
     `mis` 원본은 그대로 둔다. 해설·오답노트는 지금 이름 그대로 나가야 하고,
     무엇보다 **시트에 이미 쌓인 지난 학기 기록**이 옛 이름으로 적혀 있다.
     집계할 때만 대표 이름으로 바꿔 보면 지난 기록까지 같이 살아난다.

     [넣은 것만 넣었다]
     묶음마다 증거를 요구했다 — 조사·어순만 다르거나(토큰 집합 동일), 문항의
     정답 문장이 실제로 겹치거나, 한쪽 이름이 다른 쪽을 통째로 품는 경우.
     ⚠ `원자 구성`(양성자+중성자+전자)과 `원자핵 구성`(핵=양성자+중성자)처럼
     이름만 닮고 개념이 다른 것은 **뺐다.** 애매한 27묶음은 사람이 볼 몫으로
     남겼다 — 자동으로 합치면 남의 개념이 섞인다. */
  var MIS_CANON = {"Kp": "Kc-Kp 관계","Kw 일정성": "Kw","Kw 적용": "Kw","Kw와 온도": "Kw","VSEPR 구조": "VSEPR","VSEPR 원리": "VSEPR","강한 장": "강한 장과 스핀","결합 에너지 적용": "결합 에너지","결합 에너지로 ΔH": "결합 에너지","공유결합": "공유 결합","공유결합 판정": "공유 결합","그레이엄": "그레이엄 법칙","농도와 총괄성": "총괄성 정의","돌턴 분압": "돌턴 법칙","동위원소 vs 동중원소": "동위원소","동위원소 전자": "동위원소","동위원소 정의": "동위원소","동위원소 판정": "동위원소","동적 평형": "동적 평형 개념","동적 평형 예": "동적 평형 개념","동적 평형 정의": "동적 평형 개념","르샤틀리에": "르샤틀리에 정의","르샤틀리에 활용": "르샤틀리에 정의","몰농도와 온도": "몰농도 온도","몰랄 농도": "몰랄 농도 정의","몰랄 농도 의미": "몰랄 농도 정의","몰분율 정의": "몰분율","물 이온곱": "물의 이온곱","물질 분류": "물질 분류 판정","반감기 계산": "반감기","반데르발스": "반데르발스 상수","반데르발스 식": "반데르발스 상수","반응 속도 정의": "반응 속도","반응 속도 표현": "반응 속도","반응 지수": "반응 지수 방향","반응 지수 활용": "반응 지수 방향","반응엔탈피": "반응엔탈피 계산","반응엔탈피 정의": "반응엔탈피 계산","반응지수": "반응 지수 방향","배위수": "배위수와 구조","분자 결정 녹는점": "분자 결정","분자 루이스 구조": "루이스 구조","분자결정": "분자 결정","분자결정 비교": "분자 결정","브뢴스테드 정의": "브뢴스테드-라우리","비금속 전기음성도": "전기음성도","실험식 구하기": "실험식 도출","실험식-분자식": "실험식·분자식 관계","실험식→분자식": "실험식·분자식 관계","아레니우스 식": "아레니우스","알짜 이온 반응": "알짜 이온 반응식","압력과 기체 용해도": "기체 용해도와 압력","압축 인자 해석": "압축 인자","에스터 성질": "에스터","에스터화": "에스터","열역학 제2법칙": "제2법칙","오비탈 기호": "오비탈","오비탈 모양": "오비탈","옥텟규칙": "옥텟 규칙","온도와 기체 용해도": "기체 용해도와 온도","용해도 정의": "용해도","용해성": "용해성 규칙","운동론": "운동 에너지와 온도","원자 반지름 비교": "원자 반지름","원자 번호": "원자번호","원자량": "원자량 정의","원자량 단위": "원자량 정의","유효숫자 연산": "유효숫자","유효핵전하 주기성": "유효핵전하","이상 기체": "상태 방정식","이온결정": "이온 결정","이온결정 배열": "이온 결정","이온결정 성질": "이온 결정","이온결합": "이온 결합","이온결합 판정": "이온 결합","이온화 에너지 비교": "이온화 에너지","이온화 에너지 주기성": "이온화 에너지","일정 성분비": "일정 성분비 적용","일정 성분비 범위": "일정 성분비 적용","일정 성분비 법칙": "일정 성분비 적용","입자 전하비": "입자 전하","자발성": "자발성 판단","자발성 결정": "자발성 판단","자발성 방향": "자발성 판단","자유 에너지": "깁스 자유 에너지","전기분해": "전기분해 전극","전기음성도 비교": "전기음성도","전기음성도 주기성": "전기음성도","전자 보존": "전자 균형","정·역반응 ΔH": "정·역반응","정·역반응 열": "정·역반응","제곱평균제곱근 속력": "vrms","족과 원자가 전자": "원자가 전자","질량 계산": "몰질량","질량 보존 법칙": "질량 보존","질량수 계산": "질량수","질소": "질소 안정성","총괄성": "총괄성 정의","총괄성 관계": "총괄성 정의","총괄성 크기": "총괄성 정의","카복실산": "카복실산 성질","카복실산 반응": "카복실산 성질","카복실산 예": "카복실산 성질","파울리 배타원리": "파울리 원리","퍼센트 농도 정의": "퍼센트 농도","퍼센트 농도와 온도": "퍼센트 농도 온도","평형 상수": "평형 상수 의미","평형 상수 해석": "평형 상수 의미","헤스 법칙 적용": "헤스 법칙","헨리 법칙 계산": "헨리 법칙","헨리 법칙 한계": "헨리 법칙","화학반응식 계수": "계수 규칙","희석 계산": "희석"};
  function misCanon(m) {
    var k = (m == null ? '' : String(m)).trim();
    return MIS_CANON[k] || k;
  }

  // ---------- 공통 유틸 ----------
  function norm(s) {            // 문장 정규화(공백·괄호 미세차 흡수) → 중복 판별용
    return (s || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').trim();
  }
  function cleanName(s) { return (s || '').replace(/\s+/g, '').trim(); }
function normSchool(s) { s = (s || '').replace(/\s+/g, '').trim(); return s.replace(/중학교$/, '중').replace(/고등학교$/, '고').replace(/초등학교$/, '초'); }

  // ---------- 1) 학생키: 이름+학교 (학년은 키에서 제외, 속성으로만) ----------
  function studentKey(name, school) {
    return normSchool(school) + '-' + cleanName(name);   // 예: 휘문중-홍길동 ('휘문중학교'도 동일 키)
  }

  // ---------- 2) 5대 통합축 매핑 (보너스 진단층; 단원·오개념 그룹이 본체) ----------
  // unit + mis 텍스트를 함께 스캔. 매칭 없으면 null (리포트는 단원/오개념으로 폴백).
  var AXES = [
    { key: 'A1', name: '에너지·자발성·평형 (ΔG=ΔH−TΔS=−nFE°=−RT ln K)',
      kw: ['열역학','자발','엔트로피','전기화학','화학평형','평형','엔탈피','깁스','헤스','전지','전기분해','반응열'] },
    { key: 'A3', name: '결합·극성·산화수 (전기음성도 장부)',
      kw: ['전기음성도','산화수','산화','환원','결합','극성','루이스','이온화에너지'] },
    { key: 'A5', name: '원자구조→주기율표 (파울리→부껍질 용량)',
      kw: ['양자','오비탈','전자배치','전자 배치','주기율','부껍질','바닥상태','들뜬','원자 모형','원자모형'] },
    { key: 'A2', name: '분자 운동·반응 속도 (볼츠만 분포)',
      kw: ['반응속도','반응 속도','속도','활성화','촉매','충돌','기체','이상기체','실제기체','분압','분자 운동','확산'] },
    { key: 'A4', name: '동적 평형·상·용액 (증발↔응축↔용해)',
      kw: ['증기압','증발','액체','고체','총괄성','용해','농도','분자간','분자 간','상평형','포화'] }
  ];
  function axisOf(unit, mis) {
    var hay = (unit || '') + ' ' + (mis || '');
    for (var i = 0; i < AXES.length; i++) {
      for (var j = 0; j < AXES[i].kw.length; j++) {
        if (hay.indexOf(AXES[i].kw[j]) !== -1) return AXES[i];
      }
    }
    return null;
  }
  function axisName(key) { for (var i=0;i<AXES.length;i++) if (AXES[i].key===key) return AXES[i].name; return key; }

  // ---------- 3) 채점 ----------
  // studentAnswers: ['O'|'X'|''] 길이 = keyItems.length (보통 60)
  // keyItems: 정시 items [{n,u,mis,a,s,f,w,lvl,c}]
  // scoring: {per, max, pass}
  function gradeAttempt(studentAnswers, keyItems, scoring) {
    var per = (scoring && scoring.per) || (100 / keyItems.length);
    var passScore = (scoring && scoring.pass) != null ? scoring.pass : 80;
    var perItem = [], correct = 0, blank = 0;
    for (var i = 0; i < keyItems.length; i++) {
      var it = keyItems[i];
      var sa = (studentAnswers[i] || '').toUpperCase();
      var isBlank = (sa !== 'O' && sa !== 'X');
      var ok = (!isBlank && sa === String(it.a).toUpperCase());
      if (ok) correct++;
      if (isBlank) blank++;
      perItem.push({
        idx: i, id: it.n, c: it.c || null, unit: it.u, mis: it.mis,
        lvl: it.lvl || 1, studentAns: isBlank ? '' : sa, correctAns: it.a,
        ok: ok, blank: isBlank, f: it.f, w: it.w
      });
    }
    var scoreRaw = correct * per;
    var score = Math.round(scoreRaw * 10) / 10;       // 표시용 소수1
    var pass = scoreRaw >= passScore - 1e-6;
    return {
      n: keyItems.length, correctCount: correct, blankCount: blank,
      wrongCount: keyItems.length - correct - blank,
      score: score, scoreInt: Math.round(scoreRaw), max: (scoring && scoring.max) || 100,
      passScore: passScore, pass: pass, perItem: perItem
    };
  }

  // 채점결과 → 교정 필요 개념(틀림 또는 미기입). cid 없으면 문항 자체 정보로 폴백.
  function notCorrectConcepts(graded) {
    var seenCid = {}, out = [];
    graded.perItem.forEach(function (p) {
      if (p.ok) return;                         // 맞은 건 제외
      var keyC = p.c || ('NOID:' + p.idx);      // cid 없으면 문항별 폴백키
      if (seenCid[keyC]) { seenCid[keyC].count++; return; }
      var rec = { c: p.c || null, unit: p.unit, mis: p.mis, lvl: p.lvl,
                  f: p.f, w: p.w, count: 1, blank: p.blank };
      seenCid[keyC] = rec; out.push(rec);
    });
    return out;
  }

  // ---------- 4) 진단 (단발 1회차) ----------
  function diagnose(graded, formsBank) {
    formsBank = formsBank || {};
    var byUnit = {}, byMis = {}, byAxis = {};
    graded.perItem.forEach(function (p) {
      // 단원별
      var u = byUnit[p.unit] || (byUnit[p.unit] = { unit: p.unit, total: 0, wrong: 0 });
      u.total++; if (!p.ok) u.wrong++;
      // 축별
      var ax = axisOf(p.unit, p.mis);
      if (ax) {
        var a = byAxis[ax.key] || (byAxis[ax.key] = { key: ax.key, name: ax.name, total: 0, wrong: 0 });
        a.total++; if (!p.ok) a.wrong++;
      }
      // 오개념별 (틀린 것만 집계)
      if (!p.ok) {
        var m = byMis[p.mis] || (byMis[p.mis] = { mis: p.mis, unit: p.unit, count: 0, cids: [] });
        m.count++; if (p.c && m.cids.indexOf(p.c) === -1) m.cids.push(p.c);
      }
    });
    // 교정 개념 + 강의록 부착
    var wrongConcepts = notCorrectConcepts(graded).map(function (w) {
      var reading = (w.c && formsBank[w.c] && formsBank[w.c].reading) ? formsBank[w.c].reading : null;
      return { c: w.c, unit: w.unit, mis: w.mis, lvl: w.lvl, blank: w.blank,
               reading: reading, fix: w.f, why: w.w,
               hasReading: !!(reading && (reading.oneline || reading.core)) };
    });
    function toSortedArr(obj, rateBase) {
      return Object.keys(obj).map(function (k) {
        var o = obj[k]; if (rateBase) o.rate = o.total ? Math.round(100 * o.wrong / o.total) : 0; return o;
      }).sort(function (a, b) { return (b.wrong||b.count) - (a.wrong||a.count); });
    }
    return {
      score: graded.score, pass: graded.pass, passScore: graded.passScore,
      correctCount: graded.correctCount, wrongCount: graded.wrongCount, blankCount: graded.blankCount,
      byUnit: toSortedArr(byUnit, true),
      byMisconception: toSortedArr(byMis, false),
      byAxis: toSortedArr(byAxis, true),
      wrongConcepts: wrongConcepts
    };
  }

  // ---------- 5) 읽음 확인 게이트 ----------
  // wrongConcepts: diagnose의 wrongConcepts
  // 각 개념: 강의록(있으면) + 확인질문(아직 안 본 다른 form O/X) 1개. 없으면 폴백(옳은문장 재확인).
  function buildGate(wrongConcepts, formsBank, seenStatements) {
    formsBank = formsBank || {}; seenStatements = seenStatements || {};
    var gates = [];
    wrongConcepts.forEach(function (w) {
      var checks = [], fallback = false;
      if (w.c && formsBank[w.c] && formsBank[w.c].forms) {
        var fresh = formsBank[w.c].forms.filter(function (fm) { return !seenStatements[norm(fm.s)]; });
        for (var i = 0; i < 2 && i < fresh.length; i++) { var p = fresh[i]; checks.push({ s: p.s, a: p.a, f: p.f, w: p.w }); seenStatements[norm(p.s)] = 1; }
        if (checks.length < 2) {          // 새 문장 부족 → 본 적 있는 form으로 2단 채움
          var more = formsBank[w.c].forms.filter(function (fm) { return !checks.some(function (c) { return norm(c.s) === norm(fm.s); }); });
          for (var j = 0; checks.length < 2 && j < more.length; j++) { checks.push({ s: more[j].s, a: more[j].a, f: more[j].f, w: more[j].w }); }
        }
      }
      if (!checks.length) {               // 폴백: cid 없거나 form 없음 → 옳은 문장 재확인(정답 O)
        fallback = true;
        var cf = { s: w.fix || w.mis, a: 'O', f: w.fix, w: w.why };
        checks.push(cf); seenStatements[norm(cf.s)] = 1;
      }
      gates.push({
        c: w.c, unit: w.unit, mis: w.mis,
        reading: w.reading || null, hasReading: w.hasReading,
        checks: checks, check: checks[0], fallback: fallback
      });
    });
    return { gates: gates, seenStatements: seenStatements };
  }

  // ---------- 6) 재시 생성 (점점 쉽게 + 개별화) ----------
  // attemptNo: 2=재시, 3=재재시  (정시=1)
  // cbandVersions: round.retakeC = [{v,items:[{c,u,a,s,f,w}]}...] (C=기본, 더 쉬움)
  // wrongCids: 직전 시도에서 틀린 개념 cid 집합(객체/배열)
  // formsBank: 개별화용 대체 form 소스
  // seenStatements: 이미 학생이 본 문장(중복 방지) · 갱신해서 반환
  function buildRetake(attemptNo, cbandVersions, wrongCids, formsBank, seenStatements, wrongStmts) {
    formsBank = formsBank || {}; seenStatements = seenStatements || {}; wrongStmts = wrongStmts || {};
    var wrong = {};
    (Array.isArray(wrongCids) ? wrongCids : Object.keys(wrongCids || {})).forEach(function (c) { if (c) wrong[c] = 1; });
    if (!cbandVersions || !cbandVersions.length) return { items: [], seenStatements: seenStatements, n: 0 };
    var base = cbandVersions[Math.min(attemptNo - 2, cbandVersions.length - 1)].items;

    var usedThis = {};                 // 이 시도에서 쓴 문장 → 한 시험 안 중복 절대 방지
    var subCids = base.map(function (it) { return it.c; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }); // 대체용 범위 내 개념
    function avail(fb, fn) { return (fb && fb.forms && fb.forms.length ? fb.forms : []).find(fn); }
    function nwFresh(fb) { return avail(fb, function (fm) { return !usedThis[norm(fm.s)] && !seenStatements[norm(fm.s)] && !wrongStmts[norm(fm.s)]; }); }
    function nwUnused(fb) { return avail(fb, function (fm) { return !usedThis[norm(fm.s)] && !wrongStmts[norm(fm.s)]; }); }
    function subForm() {                // D9: 다른 범위 내 개념에서 안 본·안 틀린 form (재노출 0 보장)
      for (var i = 0; i < subCids.length; i++) { var sfb = formsBank[subCids[i]]; var ff = nwFresh(sfb) || nwUnused(sfb);
        if (ff) return { c: subCids[i], a: ff.a, s: ff.s, f: ff.f, w: ff.w }; }
      return null;
    }
    var items = base.map(function (it) {
      var fb = formsBank[it.c];
      var orig = { c: it.c, a: it.a, s: it.s, f: it.f, w: it.w };
      var pick, subbed = false, p;
      if (wrong[it.c]) {
        // 틀린 개념: 새 문장 우선, 학생이 틀린 문장은 절대 재노출 안 함
        p = nwFresh(fb) || nwUnused(fb);
        if (p) pick = { c: it.c, a: p.a, s: p.s, f: p.f, w: p.w };
      } else {
        /* 맞힌 개념: 예전에는 원본을 그대로 뒀다(form 절약). 그런데 학생 화면과
           성적표는 **"같은 문제는 다시 나오지 않습니다"** 라고 약속한다.
           재어 보니 retakeC 문장의 13%가 정시 문장과 글자까지 같아서, 30%를
           틀린 학생이 60문항 중 5~6문항을 **그대로 다시** 보고 있었다.
           맞힌 개념이라도 이미 본 문장이면 기억으로 답하게 되어 확인이 안 된다.

           그래서 순서를 뒤집는다: 안 본 문장을 먼저 찾고, form 이 동났을 때만
           원본으로 돌아간다. 아낄 것은 form 이 아니라 약속이다.
           (그다음 자리는 subForm 이 재노출 0 을 보장하고, 원본은 최후다.) */
        if (!usedThis[norm(orig.s)] && !seenStatements[norm(orig.s)] && !wrongStmts[norm(orig.s)]) pick = orig;
        else {
          p = nwFresh(fb) || nwUnused(fb);
          if (p) pick = { c: it.c, a: p.a, s: p.s, f: p.f, w: p.w };
        }
      }
      if (!pick) { var sub = subForm(); if (sub) { pick = sub; subbed = true; } }  // 소진 → 범위 내 다른 개념으로 대체
      if (!pick) pick = orig;                                                       // 최후(이론상 도달 안 함)
      usedThis[norm(pick.s)] = 1; seenStatements[norm(pick.s)] = 1;
      var pfb = formsBank[pick.c];
      var mis = (pfb && pfb.m) || (fb && fb.m) || '';
      return { c: pick.c, u: it.u, mis: mis, a: pick.a, s: pick.s, f: pick.f, w: pick.w,
               targeted: !!wrong[it.c] && !subbed, substituted: subbed,
               swapped: norm(pick.s) !== norm(it.s), reusedWrong: !!wrongStmts[norm(pick.s)] };
    });
    return { items: items, seenStatements: seenStatements, n: items.length };
  }

  // ---------- 7) 누적 (학생 단위, 미응시는 생략, null-safe) ----------
  // rows: 제출 기록 배열. 각 row:
  //   {studentKey, name, school, year, course, round, attempt('정시'|'재시'|'재재시'),
  //    score, pass(bool), date, wrongMis:[..], wrongAxes:{key:count}, isTest(bool)}
  // 반환: {studentKey: {info, trend[], chronicMis[], axisWeak[], roundsTaken[], coverageRound, attemptsTotal}}
  function cumulative(rows) {
    rows = rows || [];
    var byStu = {};
    rows.forEach(function (r) {
      var k = r.studentKey || studentKey(r.name, r.school);
      (byStu[k] || (byStu[k] = [])).push(r);
    });

    var out = {};
    Object.keys(byStu).forEach(function (k) {
      var rs = byStu[k];
      // 회차별 묶기 (course+round)
      var rounds = {};
      rs.forEach(function (r) {
        var rk = r.course + '#' + r.round;
        (rounds[rk] || (rounds[rk] = { course: r.course, round: r.round, attempts: [] })).attempts.push(r);
      });
      // trend: 실제로 본 회차만, round 순. (미응시 회차는 애초에 키가 없어 자동 생략)
      var trend = Object.keys(rounds).map(function (rk) {
        var R = rounds[rk];
        R.attempts.sort(function (a, b) { return order(a.attempt) - order(b.attempt); });
        var jeong = R.attempts.find(function (a) { return a.attempt === '정시'; });
        var last = R.attempts[R.attempts.length - 1];
        var passedAny = R.attempts.some(function (a) { return a.pass; });
        var passAtt = null; for (var pi = 0; pi < R.attempts.length; pi++) { if (R.attempts[pi].pass) { passAtt = R.attempts[pi]; break; } }
        var repr = passAtt || last;   // 대표 시도: 통과한 시도(있으면), 없으면 마지막
        return {
          course: R.course, round: R.round,
          jeongsiScore: jeong ? jeong.score : null,
          finalScore: repr ? repr.score : null,
          finalAttempt: repr ? repr.attempt : null,
          attemptsCount: R.attempts.length,
          passed: passedAny,
          date: last ? last.date : null
        };
      }).sort(function (a, b) {
        if (a.course !== b.course) return a.course < b.course ? -1 : 1;
        return a.round - b.round;
      });

      // 고질 오개념: 서로 다른 회차에서 반복해서 틀린 것 (≥2회차)
      var misRounds = {};
      rs.forEach(function (r) {
        (r.wrongMis || []).forEach(function (m) {
          /* 집계에서만 대표 이름으로 본다 — 화면에 적히는 이름은 여기서 정하고,
             자료(mis)와 해설 사전은 손대지 않는다. */
          var mk = misCanon(m);
          (misRounds[mk] || (misRounds[mk] = {}))[r.course + '#' + r.round] = 1;
        });
      });
      var chronic = Object.keys(misRounds).map(function (m) {
        return { mis: m, rounds: Object.keys(misRounds[m]).length };
      }).filter(function (x) { return x.rounds >= 2; })
        .sort(function (a, b) { return b.rounds - a.rounds; });

      // 축별 누적 약점
      var axis = {};
      rs.forEach(function (r) {
        var wa = r.wrongAxes || {};
        Object.keys(wa).forEach(function (ak) { axis[ak] = (axis[ak] || 0) + wa[ak]; });
      });
      var axisWeak = Object.keys(axis).map(function (ak) {
        return { key: ak, name: axisName(ak), wrong: axis[ak] };
      }).sort(function (a, b) { return b.wrong - a.wrong; });

      var roundsTaken = trend.map(function (t) { return t.course + t.round; });
      var coverageRound = trend.length ? trend[trend.length - 1].round : 0;  // 최근 응시 회차 = 누적 범위
      var attemptsTotal = rs.length;
      var info = { name: rs[0].name, school: rs[0].school, yearLatest: latestYear(rs) };

      out[k] = {
        info: info, trend: trend, chronicMis: chronic, axisWeak: axisWeak,
        roundsTaken: roundsTaken, roundsTakenCount: trend.length,
        coverageRound: coverageRound, attemptsTotal: attemptsTotal,
        passedRounds: trend.filter(function (t) { return t.passed; }).length
      };
    });
    return out;
  }
  function order(att) { att = String(att || ''); var n = 0; for (var i = 0; i < att.length; i++) { if (att.charAt(i) === '재') n++; } return n; }
  function latestYear(rs) {
    var y = null, d = '';
    rs.forEach(function (r) { if (r.date && r.date > d) { d = r.date; y = r.year; } });
    return y != null ? y : (rs[0] ? rs[0].year : null);
  }

  // 간격 반복(D8): 과거 회차에 틀린 개념 중 지금 다시 점검할 것. chronic할수록(자주 틀림) 우선(D10 인출강도).
  function spacedReview(rows, currentRound) {
    var ord = { '정시': 0, '첫번째시험': 0, '이번주 테스트': 0, '첫 응시': 0, '재시': 1, '재재시': 2 };
    var byRound = {};
    (rows || []).forEach(function (r) { (byRound[r.round] || (byRound[r.round] = [])).push(r); });
    var byConcept = {};
    Object.keys(byRound).forEach(function (rd) {
      var rs = byRound[rd].slice().sort(function (a, b) { return (ord[a.attempt] || 0) - (ord[b.attempt] || 0); });
      var first = rs[0]; if (!first) return;
      (first.wrongMis || []).forEach(function (m) {
        var o = byConcept[m] || (byConcept[m] = { rounds: {}, last: 0 });
        o.rounds[rd] = 1; o.last = Math.max(o.last, Number(rd));
      });
    });
    return Object.keys(byConcept).map(function (m) {
      var o = byConcept[m];
      return { mis: m, times: Object.keys(o.rounds).length, last: o.last, gap: (currentRound || 0) - o.last };
    }).filter(function (x) { return x.last < (currentRound || 0); })
      .sort(function (a, b) { return b.times - a.times || b.last - a.last; });
  }

  // ---------- export (Node + 브라우저) ----------
  var api = {
    norm: norm, studentKey: studentKey, axisOf: axisOf, axisName: axisName, AXES: AXES,
    gradeAttempt: gradeAttempt, notCorrectConcepts: notCorrectConcepts,
    misCanon: misCanon, MIS_CANON: MIS_CANON,
    diagnose: diagnose, buildGate: buildGate, buildRetake: buildRetake, cumulative: cumulative,
    spacedReview: spacedReview
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChemEngine = api;
})(typeof window !== 'undefined' ? window : this);
