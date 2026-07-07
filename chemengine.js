/* ============================================================
   Chemistreal 채점·진단·재시 로직 엔진 (Phase 2)
   - 순수 함수만. DOM·네트워크 없음. Node와 브라우저에서 동일 동작.
   - 여기서 테스트 통과한 코드가 그대로 앱(Phase 4)에 들어간다.
   ============================================================ */
(function (root) {
  'use strict';

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
        // 맞힌 개념: 원본 유지(form 절약), 충돌 시에만 비오답 form으로
        if (!usedThis[norm(orig.s)] && !wrongStmts[norm(orig.s)]) pick = orig;
        else { p = nwUnused(fb); if (p) pick = { c: it.c, a: p.a, s: p.s, f: p.f, w: p.w }; }
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
        return {
          course: R.course, round: R.round,
          jeongsiScore: jeong ? jeong.score : null,
          finalScore: last ? last.score : null,
          finalAttempt: last ? last.attempt : null,
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
          (misRounds[m] || (misRounds[m] = {}))[r.course + '#' + r.round] = 1;
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
  function order(att) { return (att === '정시' || att === '첫번째시험' || att === '이번주 테스트' || att === '첫 응시') ? 0 : att === '재시' ? 1 : 2; }
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
    diagnose: diagnose, buildGate: buildGate, buildRetake: buildRetake, cumulative: cumulative,
    spacedReview: spacedReview
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChemEngine = api;
})(typeof window !== 'undefined' ? window : this);
