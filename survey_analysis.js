/* ============================================================
   「화학1 돌아보기」 진단 보고서 — 계산 모듈 (survey_analysis.js)
   - 순수 함수만. DOM·네트워크 없음. Node 와 브라우저에서 같은 결과.
   - 인쇄 보고서(survey_print.html · survey_print_batch.html)가 쓴다.
   - 판정 근거: 근거 연구 정리 §1(보정) · §4(기록 지표) · §6(응답 품질) · §7(통합 판정 표).
     구간 수치는 문헌 표준이 아니라 이 설계에 맞춘 제안값이다(TH 에 한데 모았다 —
     첫 학기 분포를 보고 여기서만 고친다).

   ■ 설문 척도 방향
     설문 답은 1 매우 그렇다 ~ 5 전혀 아니다. 연구 문서의 자신감 C 는 «높을수록 자신 있음»
     이므로 C = (5 − v) / 4 로 뒤집는다(1 → 1.00, 3 → 0.50, 5 → 0).
     오개념 문장(mis)은 1·2(동의)가 직관 신호, 맞는 직관(mis=false)은 4·5(부정)가 신호다.

   ■ 기록 읽기 — chemengine.js carryOver 와 같은 방식(그 파일은 고치지 않고 논리만 옮겼다)
     회차마다 첫 응시 행 하나(attempt 의 '재' 글자 수 0)의 answers 를 그 회차 파일
     jeongsi.items[k].c · a 와 자리대로 맞댄다. 빈칸도 «맞히지 못함». 답안 길이가 문항 수와
     다르면(옛 행) 그 회차의 문항 단위 기록은 세지 않는다.
     재시 행은 retakeCids(개념 코드 차례) · retakeKeys(정답 차례)로 코드마다 맞았는지 본다.
     TEST 행은 뺀다 — 다만 행이 전부 TEST 면 미리보기로 쓴다(성적표 challengesOf_ 와 같다).
   ============================================================
   ■ 바깥에 내놓는 것 — analyzeAll(opt) 결과 객체 하나(보고서·Word 생성기가 이것만 읽는다)
     opt = { doc: appdata/survey_ch1.json, ans: '1'~'5' 100자리(없으면 ''), ms: 응답 시간(ms),
             rows: 그 학생의 DT 시트 행 전부(모든 과목 · mapRow_ 모양),
             roundsByCourse: {ch1:{1:회차 파일,…}, ch1s:{…}, …}, link: courses/ch1s/link_ch1.json,
             external: survey_sources.js externalFor 결과(모의시험·KMChC · 없으면 생략) }
     A = {
       hasSurvey, hasRecord          설문이 있나 · 화학1 첫 응시 기록(문항 단위)이 있나
       record                        화학1 기록 — rate(첫 시도 정답률) · total{n,ok} · retakeRate(다음 재시 교정률) ·
                                     retake{wrong,withData,fixedNext,fixedEver,attempts} · reviewRate(지난 단원 문항) · freshRate ·
                                     rounds[{round,n,ok,rate,review{n,ok},retakes,date,newUnit,axis,state}] ·
                                     chronic[{c,m,asked,wrong,lastWrong,resolvedAt}] · codes{코드:{n,ok,by,asked,wrong,retake}} ·
                                     axis{축:{n,ok}} · absWord/numeric/long{n,ok} · unitOfCode · misOfCode · preview(TEST 행만)
       quality                       응답 품질 — sd · maxRun · midRate · agreeRate · aTrue · aMis · missing · ms ·
                                     flags['straight'|'acquiescence'|'reversed'|'midpoint'|'fast'|'incomplete'] ·
                                     weightLow(자신감 판정 «참고») · intuitionHold(직관 해석 유보) · useZ · cleanIntuition
       rows[]                        진단 단위 60개(개념 40 + 직관 20) — {i(설문 0부터), k, type:'concept'|'belief', r, label, s, m[],
                                     codes, note, truth, mis, v(1~5), C(0~1 자신감), z, conf:'high'|'mid'|'low', signal:'sig'|'shaky'|'none'|'hold',
                                     rec{n,ok,p,pStar,ci,late{n,ok,rate},asked,wrong,retake{wrong,fixed,ever,rate,tries},chronic,resolved,resolvedAt,
                                         level:'strong'|'mid'|'weak'|'few',provisional,recovered,unit,axis},
                                     verdict:'remain'|'over'|'reinforce'|'hidden'|'strong'|'watch',
                                     tags['provisional'|'ref'|'chronic'|'resolved'|'latent'|'recovered'|'signalOnly']}
       sorted[]                      rows 를 고칠 차례(남은 오개념 → 과신 → 보강 → 숨은 실력 → 강점 → 관찰, 같은 칸은 정답률 낮은 차례)
       counts                        {remain, over, reinforce, hidden, strong, watch}
       metrics                       보정 — K · bias · mad · accuracy(1−mad) · gamma · rho · hce · hceN · hceWeak ·
                                     biasBand('over'|'fit'|'under') · madBand · gammaBand · hceBand('good'|'ok'|'low')
       axes[]                        단원 묶음 8개 — {id,name,units,n,ok,p,pStar,conf,confN,counts}
       habits                        {subs[{id,name,phase,negative,avg(1~5 동의),n,items[{k,s,agree}]}], strategy{retrieve,reread,index},
                                     groups{habit|attitude|difficulty|next:{name,avg,items}}, difficulties[{k,s,agree,cross}]}
       priorities[] · priorityAll[]  다질 개념(남은 오개념 → 과신 → 보강), 앞 3개 · 전부
       hidden[] · latent[] · remain[]  숨은 실력 · 잠복 직관 · 남은 오개념 행
       conf                          {mean, sd, n} 자신감 C 의 학생 안 분포
       courses[]                     DT 전 과목 — {course,name,rec(위 record 모양),rounds,n,ok,rate,retakeRate,retakes,first,last,units[{name,n,ok,p}],chronic,preview}
       link                          화학Ⅰ → 심화 연결 — {from,to,toName,pairs[{to,name,from{n,ok,p},own{n,ok,p}}],n,fromRate,ownRate,improved[],stillWeak[]} | null
       external                      {exams[{kind,id,title,date,n,ok,rate,areas[{name,n,ok,p}],depth,peerN,misses,types}], kmchc[…],
                                      status{exam,kmchc:'ok'|'fail'|'locked'|'off'}} — 순위·백분위는 담지 않는다
       timeline[]                    모든 시험 시간순 — {source:'DT'|'exam',group,course,label,round,date,n,ok,rate,retakes,depth}
       areaMap                       {cols[출처], rows[{id,name,cells[{n,ok,p}|null],n,ok,p}], examAreas[{name,n,ok,p,exams,axis}]}
       examRepeated[]                서로 다른 모의시험 2개 이상에서 같은 유형을 절반 이상 틀린 것 {topic,area,met,bad,nEx,rate,mis}
       recurring                     {groups[{id,name,items[{src,topic,axis,ev,note,open,w}],sources,weight}], n}
       kmCompare                     {date,id,validity,rows[{key,name,before,beforeTxt,now,nowTxt,diff,negative}],miscN} | null
       th, version                   판정 구간(TH) · 판 */
(function (root) {
  'use strict';

  var TH = {
    strongP: 0.85,     // 기록 강함: 첫 시도 정답률
    weakP: 0.70,       // 기록 약함: 첫 시도 정답률 미만(추측 보정 앎 지수 0.4 미만)
    lateStrong: 0.85,  // 강함이려면 후기 유지율도 이만큼(후기 문항이 2개 이상일 때)
    retakeWeak: 0.5,   // 재시 교정률이 이 미만이면(틀린 회차 2번 이상) 약함
    minN: 3,           // 이보다 적게 물었으면 «기록 적음»(판정 보류)
    provN: 8,          // 이보다 적으면 «잠정»
    highC: 0.75,       // 자신감 높음(그렇다 이상)
    lowC: 0.5,         // 자신감 낮음(보통 이하)
    zHigh: 0.5,        // 학생 안 표준화 — 상대적으로 자신 있음
    zLow: -0.5,        // 중간점 쏠림 학생의 «상대적으로 자신 없음»
    zLowStrict: -1.0,  // 그렇다(0.75)를 «낮음»으로 칠 때의 기준
    chronicAsked: 3, chronicRate: 0.5,   // 고질: 물은 회차 3번 이상 · 틀린 회차 절반 이상(엔진과 같다)
    biasBand: 0.15, madGood: 0.15, madOk: 0.25, gammaGood: 0.5, gammaOk: 0.2,
    hceOk: 0.10, hceWarn: 0.25,
    straightSd: 0.5, straightRun: 15, acqRate: 0.8, midRate: 0.5, fastMs: 5 * 60 * 1000,
    calMinK: 10,       // 변별(γ·ρ)은 개념 10개 이상일 때만
    recoverR: 0.8      // 재시 회복형: 재시 교정률
  };

  /* 단원 묶음(방사형 그래프의 축). 회차 파일 items[k].u 의 값을 묶는다. */
  var AXES = [
    { id: 'matter', name: '물질과 화학식', units: ['Ⅰ-1', 'Ⅰ-2'] },
    { id: 'mole', name: '몰과 반응의 양', units: ['Ⅰ-3', 'Ⅰ-4'] },
    { id: 'atom', name: '원자 구조와 주기성', units: ['Ⅱ-1', 'Ⅱ-2', 'Ⅱ-3', 'Ⅱ-4'] },
    { id: 'bond', name: '화학 결합과 분자', units: ['Ⅱ-5', 'Ⅱ-6a', 'Ⅱ-6b'] },
    { id: 'enth', name: '반응 엔탈피', units: ['엔탈피'] },
    { id: 'eq', name: '화학 평형', units: ['Ⅲ-1', 'Ⅲ-2', 'Ⅲ-3'] },
    { id: 'acid', name: '용액과 산·염기', units: ['Ⅳ-1', 'Ⅳ-2', 'Ⅳ-3'] },
    { id: 'comp', name: '조성과 실험식', units: ['부록'] }
  ];
  var AXIS_OF_UNIT = {};
  AXES.forEach(function (a) { a.units.forEach(function (u) { AXIS_OF_UNIT[u] = a.id; }); });

  /* 습관·태도 하위 척도(연구 §5 제안 — 자기조절 3단계 + 효능감 + 시험 부담 + 흥미·가치).
     문항 k 로 묶는다. 점수는 «그 문장에 얼마나 동의했나»(1~5, 5 = 매우 그렇다). */
  var SUBSCALES = [
    { id: 'plan', name: '계획·준비', phase: 1, ks: ['q002', 'q060', 'q062', 'q080'] },
    { id: 'monitor', name: '점검·전략', phase: 2, ks: ['q032', 'q045', 'q050', 'q072'] },
    { id: 'reflect', name: '성찰·다시 도전', phase: 3, ks: ['q012', 'q022', 'q042', 'q052', 'q055'] },
    { id: 'efficacy', name: '자기 효능감', ks: ['q075', 'q030', 'q040', 'q010'] },
    { id: 'burden', name: '시험 부담·막막함', ks: ['q035', 'q065', 'q077'], negative: true },
    { id: 'interest', name: '흥미·가치', ks: ['q005', 'q015', 'q025', 'q070', 'q090', 'q095'] }
  ];
  /* 효과적 전략 지수 = 꺼내기·간격·고쳐 쓰기·설명 − 다시 읽기·필기 (Dunlosky 외 2013 분류) */
  var STRATEGY = { retrieve: ['q072', 'q082', 'q022', 'q085'], reread: ['q002', 'q092'] };

  /* 어려웠던 점 — 문항 k → 기록으로 맞대 볼 자리 */
  var DIFF_CROSS = {
    q057: 'absWord', q007: 'numeric', q067: 'review', q047: 'long',
    q097: 'axis:eq+acid', q087: 'axis:atom'
  };

  function order(att) { att = String(att || ''); var n = 0; for (var i = 0; i < att.length; i++) { if (att.charAt(i) === '재') n++; } return n; }
  function mean(a) { if (!a.length) return null; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sd(a) { var m = mean(a); if (m == null || a.length < 2) return 0; var s = 0; a.forEach(function (x) { s += (x - m) * (x - m); }); return Math.sqrt(s / a.length); }
  function ratio(ok, n) { return n ? ok / n : null; }
  function wilson(ok, n) {
    if (!n) return null;
    var z = 1.96, p = ok / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  function pstar(p) { return p == null ? null : Math.max(0, 2 * p - 1); }

  function itemsOf(rounds, rd, course) {
    var x = typeof rounds === 'function' ? rounds(course || 'ch1', rd) : (rounds || {})[rd];
    return Array.isArray(x) ? x : (x && x.jeongsi && x.jeongsi.items) || null;
  }

  var ABS_WORD = /항상|모든|반드시|언제나|절대|오직/;
  var LONG_LEN = 35;

  /* ── 1. 기록 ───────────────────────────────────────────── */
  function buildRecord(rows, rounds, course) {
    course = course || 'ch1';
    var mine = (rows || []).filter(function (r) { return r && String(r.course) === course && r.round != null && r.round !== ''; });
    var real = mine.filter(function (r) { return !r.isTest; }), preview = false;
    if (real.length) mine = real; else if (mine.length) preview = true;
    var byRound = {};
    mine.forEach(function (r) { var k = Number(r.round); if (!k) return; (byRound[k] || (byRound[k] = [])).push(r); });

    var rec = { has: false, preview: preview, rounds: [], codes: {}, unitOfCode: {}, misOfCode: {},
      total: { n: 0, ok: 0 }, review: { n: 0, ok: 0 }, fresh: { n: 0, ok: 0 },
      absWord: { n: 0, ok: 0 }, numeric: { n: 0, ok: 0 }, long: { n: 0, ok: 0 },
      axis: {}, units: {}, course: course, retake: { wrong: 0, withData: 0, fixedNext: 0, fixedEver: 0, attempts: 0 }, skipped: [] };
    AXES.forEach(function (a) { rec.axis[a.id] = { n: 0, ok: 0 }; });

    /* 회차 파일에서 코드 → 단원·오개념 이름(기록이 없어도 단원 지도는 만든다) */
    for (var rd0 = 1; rd0 <= 40; rd0++) {
      var it0 = itemsOf(rounds, rd0, course);
      if (!it0) continue;
      it0.forEach(function (x) {
        if (x && x.c && rec.unitOfCode[x.c] == null) { rec.unitOfCode[x.c] = x.u || ''; rec.misOfCode[x.c] = x.mis || ''; }
      });
    }
    function code(c) {
      return rec.codes[c] || (rec.codes[c] = { c: c, n: 0, ok: 0, by: {}, asked: [], wrong: [], retake: {} });
    }
    function add(box, ok) { box.n++; if (ok) box.ok++; }

    Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; }).forEach(function (rd) {
      var atts = byRound[rd].slice().sort(function (a, b) { return order(a.attempt) - order(b.attempt); });
      var first = atts.filter(function (a) { return order(a.attempt) === 0; })[0];
      var its = itemsOf(rounds, rd, course);
      var retakes = atts.filter(function (a) { return order(a.attempt) >= 1; }).length;
      var info = { round: rd, n: 0, ok: 0, rate: null, review: { n: 0, ok: 0 }, fresh: { n: 0, ok: 0 },
        retakes: retakes, date: first ? first.date : (atts[0] && atts[0].date), newUnit: null, axis: null, state: 'ok' };
      rec.retake.attempts += retakes;
      if (its && its.length) {
        var cnt = {};
        its.forEach(function (x) { cnt[x.u] = (cnt[x.u] || 0) + 1; });
        info.newUnit = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || null;
        info.axis = AXIS_OF_UNIT[info.newUnit] || null;
      }
      var wrongCodes = {};
      if (!first) info.state = 'nofirst';
      else if (!its || !its.length) info.state = 'noitems';
      else {
        var ans = String(first.answers || '');
        if (ans.length !== its.length) info.state = 'mismatch';
        else {
          its.forEach(function (x, k) {
            if (!x) return;
            var ok = ans.charAt(k) === x.a;
            add(info, ok); add(rec.total, ok);
            var isNew = x.u === info.newUnit;
            add(isNew ? info.fresh : info.review, ok); add(isNew ? rec.fresh : rec.review, ok);
            if (ABS_WORD.test(x.s || '')) add(rec.absWord, ok);
            if (/\d/.test(x.s || '')) add(rec.numeric, ok);
            if (String(x.s || '').length >= LONG_LEN) add(rec.long, ok);
            var ax = AXIS_OF_UNIT[x.u]; if (ax && course === 'ch1') add(rec.axis[ax], ok);
            if (x.u) add(rec.units[x.u] || (rec.units[x.u] = { n: 0, ok: 0 }), ok);
            if (!x.c) return;
            var o = code(x.c);
            add(o, ok);
            var b = o.by[rd] || (o.by[rd] = { n: 0, ok: 0 }); add(b, ok);
            if (o.asked.indexOf(rd) < 0) o.asked.push(rd);
            if (!ok) { wrongCodes[x.c] = 1; if (o.wrong.indexOf(rd) < 0) o.wrong.push(rd); }
          });
          info.rate = ratio(info.ok, info.n);
          rec.has = true;
        }
      }
      if (info.state !== 'ok') rec.skipped.push({ round: rd, state: info.state });
      /* 재시 — 시도 차례대로 코드마다 맞았는지(뒤 시도가 앞 시도를 덮는다) */
      var seq = {};
      atts.forEach(function (r) {
        if (order(r.attempt) === 0) return;
        var a = String(r.answers || ''), rc = String(r.retakeCids || ''), rk = String(r.retakeKeys || '');
        var arr = rc ? rc.split(',') : [];
        if (!(rc && rk && a && arr.length === a.length && rk.length === a.length)) return;
        var now = {};
        arr.forEach(function (c, k) { if (!c) return; var ok = a.charAt(k) === rk.charAt(k); if (now[c] == null) now[c] = true; if (!ok) now[c] = false; });
        Object.keys(now).forEach(function (c) { (seq[c] || (seq[c] = [])).push(now[c]); });
      });
      Object.keys(wrongCodes).forEach(function (c) {
        var o = code(c), s = seq[c];
        rec.retake.wrong++;
        var t = { next: null, ever: null, tries: null };
        if (s && s.length) {
          t.next = s[0] === true; t.ever = s[s.length - 1] === true;
          var fi = s.indexOf(true); t.tries = fi >= 0 ? fi + 1 : null;
          rec.retake.withData++; if (t.next) rec.retake.fixedNext++; if (t.ever) rec.retake.fixedEver++;
        }
        o.retake[rd] = t;
      });
      rec.rounds.push(info);
    });
    rec.rate = ratio(rec.total.ok, rec.total.n);
    /* 그 학생이 실제로 본 회차 수 — 보고서의 «N회» 는 이것(18 로 박지 않는다) */
    rec.taken = rec.rounds.length;                        // 서버 svTaken_ 와 같은 셈(서로 다른 회차 · TEST 아님)
    rec.retakeRate = ratio(rec.retake.fixedNext, rec.retake.withData);
    rec.retakeEver = ratio(rec.retake.fixedEver, rec.retake.withData);
    rec.reviewRate = ratio(rec.review.ok, rec.review.n);
    rec.freshRate = ratio(rec.fresh.ok, rec.fresh.n);

    /* 고질과 해소 — 코드 단위(회차 기준) */
    rec.chronic = [];
    Object.keys(rec.codes).forEach(function (c) {
      var o = rec.codes[c];
      o.asked.sort(function (a, b) { return a - b; }); o.wrong.sort(function (a, b) { return a - b; });
      if (o.asked.length >= TH.chronicAsked && o.wrong.length / o.asked.length >= TH.chronicRate) {
        var lw = o.wrong[o.wrong.length - 1];
        var after = o.asked.filter(function (r) { return r > lw; });
        rec.chronic.push({ c: c, m: rec.misOfCode[c] || c, asked: o.asked.length, wrong: o.wrong.length,
          lastWrong: lw, resolvedAt: after.length ? after[0] : null });
      }
    });
    rec.chronic.sort(function (a, b) { return (a.resolvedAt == null) - (b.resolvedAt == null) || a.lastWrong - b.lastWrong; });
    return rec;
  }

  /* 여러 코드를 한 개념으로 모은 기록 */
  function codesLevel(codes, rec) {
    var n = 0, ok = 0, asked = {}, wrong = {}, firstRd = null, W = 0, F = 0, E = 0, tries = [];
    (codes || []).forEach(function (c) {
      var o = rec.codes[c]; if (!o) return;
      n += o.n; ok += o.ok;
      o.asked.forEach(function (r) { asked[r] = 1; if (firstRd == null || r < firstRd) firstRd = r; });
      o.wrong.forEach(function (r) { wrong[r] = 1; });
      Object.keys(o.retake).forEach(function (r) {
        var t = o.retake[r]; if (t.next == null) return;
        W++; if (t.next) F++; if (t.ever) E++; if (t.tries) tries.push(t.tries);
      });
    });
    var lateN = 0, lateOk = 0;
    (codes || []).forEach(function (c) {
      var o = rec.codes[c]; if (!o) return;
      Object.keys(o.by).forEach(function (r) { if (Number(r) > firstRd) { lateN += o.by[r].n; lateOk += o.by[r].ok; } });
    });
    var askedL = Object.keys(asked).map(Number).sort(function (a, b) { return a - b; });
    var wrongL = Object.keys(wrong).map(Number).sort(function (a, b) { return a - b; });
    var p = ratio(ok, n);
    var chronic = askedL.length >= TH.chronicAsked && wrongL.length / askedL.length >= TH.chronicRate;
    var lw = wrongL.length ? wrongL[wrongL.length - 1] : null;
    var after = lw == null ? [] : askedL.filter(function (r) { return r > lw; });
    var resolved = chronic && after.length > 0;
    var R = W ? F / W : null;
    var late = { n: lateN, ok: lateOk, rate: ratio(lateOk, lateN) };
    var level;
    if (n < TH.minN) level = 'few';
    else if (p < TH.weakP || (chronic && !resolved) || (R != null && W >= 2 && R < TH.retakeWeak)) level = 'weak';
    else if (p >= TH.strongP && (late.n < 2 || late.rate >= TH.lateStrong) && !(chronic && !resolved)) level = 'strong';
    else level = 'mid';
    var recovered = p != null && p < TH.strongP && R != null && R >= TH.recoverR && late.n >= 2 && late.rate >= TH.lateStrong;
    var unit = null;
    (codes || []).some(function (c) { if (rec.unitOfCode[c]) { unit = rec.unitOfCode[c]; return true; } return false; });
    return { n: n, ok: ok, p: p, pStar: pstar(p), ci: wilson(ok, n), late: late, asked: askedL, wrong: wrongL,
      retake: { wrong: W, fixed: F, ever: E, rate: R, tries: tries.length ? tries.sort()[Math.floor(tries.length / 2)] : null },
      chronic: chronic, resolved: resolved, resolvedAt: resolved ? after[0] : null,
      level: level, provisional: n >= TH.minN && n < TH.provN, recovered: recovered,
      unit: unit, axis: unit ? (AXIS_OF_UNIT[unit] || null) : null };
  }

  /* ── 2. 응답 품질 ─────────────────────────────────────── */
  function quality(doc, ans, ms) {
    var items = (doc && doc.items) || [], vals = [], run = 1, maxRun = 0, prev = null, missing = 0;
    var mid = 0, bAgree = 0, bN = 0, tr = [], mi = [];
    items.forEach(function (it, i) {
      var v = Number(String(ans || '').charAt(i)) || 0;
      if (!v) { missing++; prev = null; run = 0; return; }
      vals.push(v);
      if (v === prev) run++; else run = 1;
      prev = v; if (run > maxRun) maxRun = run;
      if (v === 3) mid++;
      if (it.type === 'belief') { bN++; if (v <= 2) bAgree++; (it.mis === false ? tr : mi).push(v); }
    });
    var q = { n: vals.length, missing: missing, sd: sd(vals), maxRun: maxRun, midRate: ratio(mid, vals.length),
      agreeRate: ratio(bAgree, bN), aTrue: mean(tr), aMis: mean(mi), ms: Number(ms) || 0, flags: [] };
    if (vals.length && (q.sd < TH.straightSd || maxRun >= TH.straightRun)) q.flags.push('straight');
    if (q.agreeRate != null && q.agreeRate > TH.acqRate && q.aTrue != null && q.aTrue <= 2 && q.aMis != null && q.aMis <= 2) q.flags.push('acquiescence');
    if (q.aTrue != null && q.aTrue >= 4) q.flags.push('reversed');
    if (q.midRate != null && q.midRate > TH.midRate) q.flags.push('midpoint');
    if (q.ms > 0 && q.ms < TH.fastMs) q.flags.push('fast');
    if (missing > 10) q.flags.push('incomplete');
    q.weightLow = q.flags.indexOf('straight') >= 0;
    q.intuitionHold = q.weightLow || q.flags.indexOf('acquiescence') >= 0 || q.flags.indexOf('reversed') >= 0;
    q.useZ = q.flags.indexOf('midpoint') >= 0;
    q.cleanIntuition = q.aTrue != null && q.aTrue <= 2 && q.aMis != null && q.aMis >= 4;
    return q;
  }

  /* ── 3. 보정 지표 ─────────────────────────────────────── */
  function gamma(xs, ys) {
    var c = 0, d = 0;
    for (var i = 0; i < xs.length; i++) for (var j = i + 1; j < xs.length; j++) {
      var s = Math.sign(xs[i] - xs[j]) * Math.sign(ys[i] - ys[j]);
      if (s > 0) c++; else if (s < 0) d++;
    }
    return c + d ? (c - d) / (c + d) : null;
  }
  function ranks(a) {
    var idx = a.map(function (v, i) { return [v, i]; }).sort(function (x, y) { return x[0] - y[0]; }), r = new Array(a.length);
    for (var i = 0; i < idx.length;) {
      var j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (var k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  }
  function pearson(x, y) {
    var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }

  /* ── 4. 통합 진단 ─────────────────────────────────────── */
  var ORDER = { remain: 0, over: 1, reinforce: 2, hidden: 3, strong: 4, watch: 5 };

  function analyze(opt) {
    opt = opt || {};
    var doc = opt.doc || { items: [] }, ans = String(opt.ans || ''), items = doc.items || [];
    var hasSurvey = /[1-5]/.test(ans);
    var rec = buildRecord(opt.rows || [], opt.rounds || {}, opt.course || 'ch1');
    var q = hasSurvey ? quality(doc, ans, opt.ms) : { flags: [], weightLow: false, intuitionHold: false, useZ: false };

    /* 자신감 C 와 학생 안 표준화 z */
    var cs = [];
    items.forEach(function (it, i) { if (it.type === 'concept') { var v = Number(ans.charAt(i)) || 0; if (v) cs.push((5 - v) / 4); } });
    var cMean = mean(cs), cSd = sd(cs);

    var rows = [];
    items.forEach(function (it, i) {
      if (it.type !== 'concept' && it.type !== 'belief') return;
      var v = Number(ans.charAt(i)) || 0;
      var lv = codesLevel(it.codes || [], rec);
      var row = { i: i, k: it.k, type: it.type, r: it.r, label: it.label || it.s, s: it.s, codes: it.codes || [],
        note: it.note || '', truth: it.truth || '', mis: it.mis !== false, m: it.m || [], v: v, rec: lv, tags: [] };
      if (lv.provisional) row.tags.push('provisional');
      if (lv.recovered) row.tags.push('recovered');
      if (lv.chronic && lv.resolved) row.tags.push('resolved');
      if (lv.chronic && !lv.resolved) row.tags.push('chronic');
      if (it.type === 'concept') {
        var C = v ? (5 - v) / 4 : null, z = C != null && cSd > 0 ? (C - cMean) / cSd : null;
        row.C = C; row.z = z;
        var conf = null;
        if (C != null) {
          if (q.useZ) conf = z != null && z >= TH.zHigh && C >= TH.lowC ? 'high' : (z != null && z <= TH.zLow) || C < TH.lowC ? 'low' : 'mid';
          else {
            var flat = !(cSd > 0.12);   // 자신감을 거의 한 칸으로만 고른 학생 — 절대 기준만
            /* «매우 그렇다»(척도 꼭대기)는 늘 높음 — 거의 다 «매우 그렇다»인 학생은 z 가 +0.5 를 넘을 수 없어,
               두 기준을 그대로 겹치면 과신이 영영 안 잡힌다(가상 과신형 학생으로 확인). «그렇다»는 그 학생 안에서
               상대적으로 높을 때(z ≥ +0.5)만 높음. */
            if (C >= 1 || (C >= TH.highC && (flat || (z != null && z >= TH.zHigh)))) conf = 'high';
            else if (C <= TH.lowC || (!flat && z != null && z <= TH.zLowStrict && C <= TH.highC)) conf = 'low';
            else conf = 'mid';
          }
        }
        row.conf = conf;
        var vd;
        if (!hasSurvey || conf == null) vd = lv.level === 'weak' ? 'reinforce' : lv.level === 'strong' ? 'strong' : 'watch';
        else if (lv.level === 'few' || lv.level === 'mid') vd = 'watch';
        else if (lv.level === 'weak') vd = conf === 'high' ? 'over' : 'reinforce';
        else vd = conf === 'low' ? 'hidden' : 'strong';
        if (!rec.has) vd = 'watch';
        row.verdict = vd;
        if (q.weightLow && (vd === 'over' || vd === 'hidden')) row.tags.push('ref');
      } else {
        var sig = null;
        if (v) sig = row.mis ? (v <= 2 ? 'sig' : v === 3 ? 'shaky' : 'none') : (v >= 4 ? 'sig' : v === 3 ? 'shaky' : 'none');
        if (q.intuitionHold && sig) { row.sigRaw = sig; sig = 'hold'; }
        row.signal = sig;
        var bv;
        if (!rec.has || lv.level === 'few') bv = 'watch';
        else if (lv.level === 'weak') bv = sig === 'sig' ? 'remain' : 'reinforce';
        else if (lv.level === 'strong') bv = sig === 'sig' ? 'watch' : 'strong';
        else bv = 'watch';
        if (sig === 'sig' && (lv.level === 'strong' || lv.level === 'mid')) row.tags.push('latent');
        if (sig === 'sig' && (!rec.has || lv.level === 'few')) row.tags.push('signalOnly');
        row.verdict = bv;
      }
      rows.push(row);
    });

    var counts = { remain: 0, over: 0, reinforce: 0, hidden: 0, strong: 0, watch: 0 };
    rows.forEach(function (r) { counts[r.verdict]++; });

    /* 보정 지표 — 자신감 문항(40) 가운데 기록이 3문항 이상인 개념 */
    var cal = rows.filter(function (r) { return r.type === 'concept' && r.C != null && r.rec.n >= TH.minN; });
    var diffs = cal.map(function (r) { return r.C - r.rec.pStar; });
    var metrics = { K: cal.length, bias: mean(diffs), mad: mean(diffs.map(Math.abs)) };
    metrics.accuracy = metrics.mad == null ? null : 1 - metrics.mad;
    var xs = cal.map(function (r) { return r.C; }), ys = cal.map(function (r) { return r.rec.p; });
    var varOk = cal.length >= TH.calMinK && sd(xs) > 0 && sd(ys) > 0;
    metrics.gamma = varOk ? gamma(xs, ys) : null;
    metrics.rho = varOk ? pearson(ranks(xs), ranks(ys)) : null;
    var hi = cal.filter(function (r) { return r.C >= TH.highC; });
    metrics.hceN = hi.length;
    metrics.hceWeak = hi.filter(function (r) { return r.rec.level === 'weak'; }).length;
    metrics.hce = hi.length ? metrics.hceWeak / hi.length : null;
    metrics.biasBand = metrics.bias == null ? null : metrics.bias > TH.biasBand ? 'over' : metrics.bias < -TH.biasBand ? 'under' : 'fit';
    metrics.madBand = metrics.mad == null ? null : metrics.mad < TH.madGood ? 'good' : metrics.mad <= TH.madOk ? 'ok' : 'low';
    var g = metrics.gamma;
    metrics.gammaBand = g == null ? null : g >= TH.gammaGood ? 'good' : g >= TH.gammaOk ? 'ok' : 'low';
    metrics.hceBand = metrics.hce == null ? null : metrics.hce < TH.hceOk ? 'good' : metrics.hce <= TH.hceWarn ? 'ok' : 'low';

    /* 단원 축 */
    var axes = AXES.map(function (a) {
      var rr = rec.axis[a.id], cc = rows.filter(function (r) { return r.type === 'concept' && r.C != null && r.rec.axis === a.id; });
      var all = rows.filter(function (r) { return r.rec.axis === a.id; });
      var cnt = { remain: 0, over: 0, reinforce: 0, hidden: 0, strong: 0, watch: 0 };
      all.forEach(function (r) { cnt[r.verdict]++; });
      var p = ratio(rr.ok, rr.n);
      return { id: a.id, name: a.name, units: a.units, n: rr.n, ok: rr.ok, p: p, pStar: pstar(p),
        conf: mean(cc.map(function (r) { return r.C; })), confN: cc.length, counts: cnt };
    });

    /* 습관·태도 */
    var byK = {};
    items.forEach(function (it, i) { byK[it.k] = { it: it, v: Number(ans.charAt(i)) || 0 }; });
    function agree(k) { var x = byK[k]; return x && x.v ? 6 - x.v : null; }
    var subs = SUBSCALES.map(function (s) {
      var vs = s.ks.map(agree).filter(function (x) { return x != null; });
      return { id: s.id, name: s.name, phase: s.phase || null, negative: !!s.negative, avg: mean(vs), n: vs.length,
        items: s.ks.map(function (k) { return { k: k, s: byK[k] ? byK[k].it.s : '', agree: agree(k) }; }) };
    });
    var rA = STRATEGY.retrieve.map(agree).filter(function (x) { return x != null; }), rB = STRATEGY.reread.map(agree).filter(function (x) { return x != null; });
    var strategy = { retrieve: mean(rA), reread: mean(rB) };
    strategy.index = strategy.retrieve != null && strategy.reread != null ? strategy.retrieve - strategy.reread : null;
    var groups = {};
    items.forEach(function (it, i) {
      if (it.type !== 'exp') return;
      var v = Number(ans.charAt(i)) || 0, g2 = groups[it.group] || (groups[it.group] = { group: it.group, name: it.gname || it.group, items: [], avg: null });
      g2.items.push({ k: it.k, s: it.s, rev: !!it.rev, v: v, agree: v ? 6 - v : null, score: v ? (it.rev ? v : 6 - v) : null });
    });
    Object.keys(groups).forEach(function (k) { groups[k].avg = mean(groups[k].items.map(function (x) { return x.score; }).filter(function (x) { return x != null; })); });
    var difficulties = ((groups.difficulty && groups.difficulty.items) || []).map(function (d) {
      var cross = DIFF_CROSS[d.k] || null, cx = null;
      if (cross === 'absWord') cx = { kind: 'absWord', n: rec.absWord.n, rate: ratio(rec.absWord.ok, rec.absWord.n), base: rec.rate };
      else if (cross === 'numeric') cx = { kind: 'numeric', n: rec.numeric.n, rate: ratio(rec.numeric.ok, rec.numeric.n), base: rec.rate };
      else if (cross === 'long') cx = { kind: 'long', n: rec.long.n, rate: ratio(rec.long.ok, rec.long.n), base: rec.rate };
      else if (cross === 'review') cx = { kind: 'review', n: rec.review.n, rate: rec.reviewRate, base: rec.freshRate };
      else if (cross && cross.indexOf('axis:') === 0) {
        var ids = cross.slice(5).split('+'), n = 0, ok = 0;
        ids.forEach(function (id) { n += rec.axis[id].n; ok += rec.axis[id].ok; });
        cx = { kind: 'axis', axes: ids, n: n, rate: ratio(ok, n), base: rec.rate };
      }
      if (cx && (!rec.has || cx.n < 5 || cx.rate == null)) cx = null;
      return { k: d.k, s: d.s, agree: d.agree, cross: cx };
    }).sort(function (a, b) { return (b.agree || 0) - (a.agree || 0); });

    /* 우선순위 — 남은 오개념 → 과신 → 보강(정답률 낮은 차례) */
    var pri = rows.filter(function (r) { return r.verdict === 'remain' || r.verdict === 'over' || r.verdict === 'reinforce'; })
      .sort(function (a, b) { return ORDER[a.verdict] - ORDER[b.verdict] || (a.rec.p == null ? 1 : a.rec.p) - (b.rec.p == null ? 1 : b.rec.p) || a.i - b.i; });
    var sorted = rows.slice().sort(function (a, b) { return ORDER[a.verdict] - ORDER[b.verdict] || (a.rec.p == null ? 2 : a.rec.p) - (b.rec.p == null ? 2 : b.rec.p) || a.i - b.i; });

    return {
      version: '2026-10-04', th: TH, hasSurvey: hasSurvey, hasRecord: rec.has, record: rec, quality: q,
      rows: rows, sorted: sorted, counts: counts, metrics: metrics, axes: axes,
      habits: { subs: subs, strategy: strategy, groups: groups, difficulties: difficulties },
      priorities: pri.slice(0, 3), priorityAll: pri,
      hidden: rows.filter(function (r) { return r.verdict === 'hidden'; }),
      latent: rows.filter(function (r) { return r.tags.indexOf('latent') >= 0; }),
      remain: rows.filter(function (r) { return r.verdict === 'remain'; }),
      conf: { mean: cMean, sd: cSd, n: cs.length }
    };
  }

  /* ── 5. DT 전 과목 · 과목 사이 연결 · 바깥 시험(어댑터) ─────────────────
     선생님 결정(2026-10-04 추가): 개인 보고서에 그 학생이 지금까지 본 모든 시험을 담는다.
       DT     ch1 · ch1s · ch2 · gc — 같은 시트 행(doGet ?student= 의 rows)에 과목만 다르게 있다.
       바깥   exam 저장소(KMChC 등 모의시험)·이전 KMChC 설문 — 읽는 길이 정해지면 아래 어댑터
              모양으로 바꿔 넘긴다(normalizeExternal). 자료가 없으면 보고서는 «자료 없음» 안내. */
  var COURSE_NAME = { ch1: '화학Ⅰ', ch1s: '화학Ⅰ 심화', ch2: '화학Ⅱ', gc: '일반화학' };
  var COURSE_ORDER = ['ch1', 'ch1s', 'ch2', 'gc'];

  /* rows: 그 학생의 모든 행 · roundsByCourse: {ch1:{1:회차 파일,…}, ch1s:{…}} (또는 (course, rd) → 파일 함수) */
  function buildCourses(rows, roundsByCourse) {
    var present = {};
    (rows || []).forEach(function (r) { if (r && r.course && r.round != null && r.round !== '') present[String(r.course)] = 1; });
    var list = COURSE_ORDER.filter(function (c) { return present[c]; })
      .concat(Object.keys(present).filter(function (c) { return COURSE_ORDER.indexOf(c) < 0; }).sort());
    return list.map(function (c) {
      var rs = typeof roundsByCourse === 'function' ? function (_c, rd) { return roundsByCourse(c, rd); } : (roundsByCourse || {})[c] || {};
      var rec = buildRecord(rows, rs, c);
      var dates = rec.rounds.map(function (r) { return r.date; }).filter(Boolean).map(function (d) { return new Date(d); }).filter(function (d) { return !isNaN(d.getTime()); }).sort(function (a, b) { return a - b; });
      var units = Object.keys(rec.units).map(function (u) { var x = rec.units[u]; return { name: u, n: x.n, ok: x.ok, p: ratio(x.ok, x.n) }; });
      return { course: c, name: COURSE_NAME[c] || c, rec: rec, rounds: rec.rounds.filter(function (r) { return r.rate != null; }),
        roundsTaken: rec.rounds.length, n: rec.total.n, ok: rec.total.ok, rate: rec.rate, retakeRate: rec.retakeRate,
        retakes: rec.retake.attempts, first: dates[0] || null, last: dates[dates.length - 1] || null,
        units: units.sort(function (a, b) { return (a.p == null ? 2 : a.p) - (b.p == null ? 2 : b.p); }),
        chronic: rec.chronic, preview: rec.preview };
    });
  }

  /* 화학1 → 화학1 심화 — chemengine.js carryOver 와 같은 대응표(courses/ch1s/link_ch1.json: {from, map, names})로
     화학1 개념 코드를 심화 개념으로 옮겨, 화학1에서 흔들린 개념이 심화에서 어떻게 되었는지 본다. */
  function linkCourses(courses, link) {
    if (!link || !link.map || !link.from) return null;
    var by = {}; (courses || []).forEach(function (c) { by[c.course] = c; });
    var from = by[link.from], to = null;
    Object.keys(by).forEach(function (c) { if (c !== link.from && by[c].rec && Object.keys(by[c].rec.codes).some(function (k) { return /^CH1S-/.test(k); })) to = by[c]; });
    if (!from || !to) return null;
    var acc = {};
    Object.keys(link.map).forEach(function (c1) {
      var t = link.map[c1], a = from.rec.codes[c1]; if (!t || !a) return;
      var o = acc[t] || (acc[t] = { to: t, name: (link.names || {})[t] || t, from: { n: 0, ok: 0 }, own: { n: 0, ok: 0 } });
      o.from.n += a.n; o.from.ok += a.ok;
    });
    Object.keys(acc).forEach(function (t) { var b = to.rec.codes[t]; if (b) { acc[t].own.n += b.n; acc[t].own.ok += b.ok; } });
    var pairs = Object.keys(acc).map(function (t) { var o = acc[t]; o.from.p = ratio(o.from.ok, o.from.n); o.own.p = ratio(o.own.ok, o.own.n); return o; })
      .filter(function (o) { return o.from.n >= TH.minN && o.own.n >= 1; });
    var weakFrom = pairs.filter(function (o) { return o.from.p < TH.weakP; });
    return { from: link.from, to: to.course, toName: to.name, pairs: pairs, n: pairs.length,
      fromRate: ratio(pairs.reduce(function (s, o) { return s + o.from.ok; }, 0), pairs.reduce(function (s, o) { return s + o.from.n; }, 0)),
      ownRate: ratio(pairs.reduce(function (s, o) { return s + o.own.ok; }, 0), pairs.reduce(function (s, o) { return s + o.own.n; }, 0)),
      improved: weakFrom.filter(function (o) { return o.own.p != null && o.own.p >= TH.strongP; }),
      stillWeak: weakFrom.filter(function (o) { return o.own.p != null && o.own.p < TH.weakP; }) };
  }

  /* 바깥 자료 어댑터 — survey_sources.js externalFor 가 만드는 모양만 받는다(없으면 빈 배열).
       exams:  [{ source:'exam', kind, id, title, date, n, ok, rate, areas:[{name,n,ok}],
                  depth:{easyN,easyOk,hardN,hardOk,easyWrong,hardRight}|null, peerN, misses:[{q,type,area,concept,mis}], types:[{q,type,area,ok}] }]
                  백분위·석차 칸이 와도 쓰지 않는다(보고서는 다른 학생과 비교하지 않는다).
       kmchc:  [{ source:'kmchc', id, date, interest, efficacy, metacog (사다리 0~4단), anxiety, value, concept (0~100),
                  misc:[{cluster,label,q,pick,conf,entrenched}], validity }]
       status: { exam:'ok'|'fail'|'locked'|'off', kmchc:'ok'|'fail'|'off' }  off = 불러오지 않음(관리자 화면이 아님) */
  function normalizeExternal(x) {
    x = x || {};
    var st = x.status || {};
    var exams = (Array.isArray(x.exams) ? x.exams : []).map(function (e) {
      var n = Number(e.n) || 0, ok = Number(e.ok) || 0;
      return { source: String(e.source || 'exam'), kind: String(e.kind || '모의시험'), id: String(e.id || ''), title: String(e.title || e.id || ''),
        date: e.date || null, n: n, ok: ok, rate: n ? ok / n : (e.rate != null ? Number(e.rate) : null),
        areas: (Array.isArray(e.areas) ? e.areas : []).map(function (a) { var an = Number(a.n) || 0, ao = Number(a.ok) || 0; return { name: String(a.name || ''), n: an, ok: ao, p: ratio(ao, an) }; }).filter(function (a) { return a.name && a.n; }),
        depth: e.depth || null, peerN: Number(e.peerN) || 0, misses: Array.isArray(e.misses) ? e.misses : [], types: Array.isArray(e.types) ? e.types : [] };
    }).filter(function (e) { return e.title && e.n; });
    var km = (Array.isArray(x.kmchc) ? x.kmchc : []).filter(function (k) { return k && (k.interest != null || k.concept != null); });
    return { exams: exams, kmchc: km,
      status: { exam: st.exam || (exams.length ? 'ok' : 'off'), kmchc: st.kmchc || (km.length ? 'ok' : 'off') } };
  }

  /* 주제 이름 → 화학1 단원 묶음(축). exam 의 영역·유형, 다른 과목 단원, KMChC 오개념 묶음을 한 지도에 얹으려고. */
  var TOPIC_AXIS = [
    ['atom', /원자의?구조|원자의크기|전자|오비탈|양자|주기|이온화|유효핵|원자번호|질량수|동위|스펙트럼|보어|원자모형|원자,이온|원자핵|Ⅱ-[1-4]/],
    ['bond', /결합|분자의?모양|분자의?구조|극성|전자점|루이스|옥텟|VSEPR|쌍극자|분자간|격자|금속|이온결정|공유|Ⅱ-[56]/],
    ['enth', /열화학|엔탈피|반응열|헤스|발열|흡열|열역학|엔트로피|자발/],
    ['eq', /평형|르샤|용해도|증기압|끓는|증발|응축|포화|반응속도|촉매|Ⅲ-/],
    ['acid', /산과|산·|산성|염기|pH|중화|적정|농도|몰농도|희석|용액|완충|구경꾼|이온곱|산화|환원|전기화학|총괄성|삼투|Ⅳ-/],
    ['comp', /실험식|조성|원소분석|성분원소|질량백분율|분자식/],
    ['mole', /몰|화학식량|분자량|원자량|양적|계수|아보가드로|기체.*부피|이상기체|분압|질량보존|일정성분|한계반응|Ⅰ-[34]/],
    ['matter', /원소의기원|방사성|원소|물질|혼합물|순물질|화학식|물리.*변화|화학변화|구성|기초지식|단위|Ⅰ-[12]|보존|입자|연소|용해|녹|상태|기화|증발/]
  ];
  function axisOfTopic(t) {
    t = String(t || '').replace(/\s+/g, '');
    for (var i = 0; i < TOPIC_AXIS.length; i++) if (TOPIC_AXIS[i][1].test(t)) return TOPIC_AXIS[i][0];
    return 'etc';
  }
  var KM_CLUSTER = { 'atom-reaction': '원자와 화학 반응', boiling: '끓음', combustion: '연소', dissolve: '용해', evaporation: '증발',
    'gas-mass': '기체의 질량', 'melt-dissolve': '녹음과 용해', 'particle-between': '입자 사이 빈 공간', 'particle-property': '입자의 성질',
    'particle-space': '입자의 배열', 'particle-thermal': '입자와 열', 'phys-chem': '물리·화학 변화', 'state-mass': '상태 변화와 질량' };
  var KM_CLUSTER_AXIS = { 'atom-reaction': 'mole', boiling: 'eq', combustion: 'mole', dissolve: 'acid', evaporation: 'eq', 'gas-mass': 'mole',
    'melt-dissolve': 'acid', 'particle-between': 'matter', 'particle-property': 'matter', 'particle-space': 'matter', 'particle-thermal': 'matter',
    'phys-chem': 'matter', 'state-mass': 'mole' };

  /* 화학1 심화 코드 → 화학1 축 (대응표를 거꾸로: CH1S → CH1 코드 → 화학1 단원 → 축) */
  function ch1sAxis(link, ch1Units) {
    var o = {};
    if (!link || !link.map) return o;
    Object.keys(link.map).forEach(function (c1) { var t = link.map[c1], u = (ch1Units || {})[c1]; if (t && u && AXIS_OF_UNIT[u] && !o[t]) o[t] = AXIS_OF_UNIT[u]; });
    return o;
  }

  /* 지금까지의 모든 시험 — DT 회차(과목별)와 바깥 시험을 한 줄 시간표로 */
  function timeline(courses, ext) {
    var out = [];
    (courses || []).forEach(function (c) {
      c.rounds.forEach(function (r) { out.push({ source: 'DT', group: c.name, course: c.course, label: c.name + ' ' + r.round + '회', round: r.round, date: r.date || null, n: r.n, ok: r.ok, rate: r.rate, retakes: r.retakes }); });
    });
    ((ext && ext.exams) || []).forEach(function (e) { out.push({ source: 'exam', group: e.kind || '모의시험', label: e.title, date: e.date, n: e.n, ok: e.ok, rate: e.rate, retakes: null, depth: e.depth }); });
    function t(d) { var x = d ? new Date(d).getTime() : NaN; return isNaN(x) ? null : x; }
    out.sort(function (a, b) { var ta = t(a.date), tb = t(b.date); if (ta != null && tb != null && ta !== tb) return ta - tb; if (ta == null && tb != null) return 1; if (tb == null && ta != null) return -1; return (a.round || 0) - (b.round || 0); });
    return out;
  }

  /* 영역·개념 누적 지도 — 축(화학1 단원 묶음) × 출처(화학Ⅰ · 다른 DT 과목 · 모의시험) */
  function areaMap(courses, ext, link) {
    var cols = [], cell = {};
    function put(col, ax, n, ok) { if (!n) return; if (cols.indexOf(col) < 0) cols.push(col); var k = ax + '|' + col, o = cell[k] || (cell[k] = { n: 0, ok: 0 }); o.n += n; o.ok += ok; }
    var ch1 = (courses || []).filter(function (c) { return c.course === 'ch1'; })[0];
    var sAx = ch1sAxis(link, ch1 ? ch1.rec.unitOfCode : {});
    (courses || []).forEach(function (c) {
      if (c.course === 'ch1') { AXES.forEach(function (a) { var x = c.rec.axis[a.id]; if (x) put(c.name, a.id, x.n, x.ok); }); return; }
      Object.keys(c.rec.codes).forEach(function (code) {
        var o = c.rec.codes[code], ax = sAx[code] || axisOfTopic(c.rec.unitOfCode[code] + ' ' + (c.rec.misOfCode[code] || ''));
        put(c.name, ax, o.n, o.ok);
      });
    });
    ((ext && ext.exams) || []).forEach(function (e) { e.areas.forEach(function (a) { put('모의시험', axisOfTopic(a.name), a.n, a.ok); }); });
    var axes = AXES.map(function (a) { return { id: a.id, name: a.name }; }).concat([{ id: 'etc', name: '그 밖의 영역' }]);
    var rows = axes.map(function (a) {
      var tn = 0, tok = 0, cs = cols.map(function (col) { var x = cell[a.id + '|' + col]; if (x) { tn += x.n; tok += x.ok; } return x ? { n: x.n, ok: x.ok, p: ratio(x.ok, x.n) } : null; });
      return { id: a.id, name: a.name, cells: cs, n: tn, ok: tok, p: ratio(tok, tn) };
    }).filter(function (r) { return r.n; });
    /* 시험 영역별 상세(모의시험만) — 같은 영역 이름끼리 더한다 */
    var exAreas = {};
    ((ext && ext.exams) || []).forEach(function (e) { e.areas.forEach(function (a) { var o = exAreas[a.name] || (exAreas[a.name] = { name: a.name, n: 0, ok: 0, exams: 0, axis: axisOfTopic(a.name) }); o.n += a.n; o.ok += a.ok; o.exams++; }); });
    var detail = Object.keys(exAreas).map(function (k) { var o = exAreas[k]; o.p = ratio(o.ok, o.n); return o; }).filter(function (o) { return o.n >= 3; }).sort(function (a, b) { return a.p - b.p; });
    return { cols: cols, rows: rows, examAreas: detail };
  }

  /* 되풀이되는 오개념 — DT 반복 막힘 · 모의시험 반복 오답 · KMChC 2단 오개념 · 이번 설문 직관을 주제(축)별로 */
  function recurring(A, courses, ext, examRepeated) {
    var items = [];
    (courses || []).forEach(function (c) {
      (c.chronic || []).forEach(function (x) {
        items.push({ src: 'DT ' + c.name, topic: x.m, axis: c.course === 'ch1' ? (AXIS_OF_UNIT[c.rec.unitOfCode[x.c]] || axisOfTopic(x.m)) : axisOfTopic(x.m),
          ev: x.asked + '회 중 ' + x.wrong + '회 막힘' + (x.resolvedAt ? ' · ' + x.resolvedAt + '회부터 해소' : ''), open: !x.resolvedAt, w: x.resolvedAt ? 1 : 3 });
      });
    });
    (examRepeated || []).forEach(function (x) { items.push({ src: '모의시험', topic: x.topic, axis: axisOfTopic(x.topic + ' ' + (x.area || '')), ev: '시험 ' + x.nEx + '개 · ' + x.met + '문항 중 ' + x.bad + '문항 오답', note: x.mis, open: true, w: 3 }); });
    ((ext && ext.kmchc) || []).forEach(function (k) {
      (k.misc || []).forEach(function (m) { items.push({ src: 'KMChC 진단', topic: (KM_CLUSTER[m.cluster] || m.cluster) + ' — ' + m.label, axis: KM_CLUSTER_AXIS[m.cluster] || axisOfTopic(m.label), ev: m.entrenched ? '확신하며 고름' : '고른 답', note: m.pick ? '「' + m.pick + '」' : '', open: true, w: m.entrenched ? 3 : 2 }); });
    });
    (A.rows || []).forEach(function (r) {
      if (r.type !== 'belief') return;
      if (r.verdict === 'remain' || r.tags.indexOf('latent') >= 0) items.push({ src: '이번 설문', topic: (r.m && r.m[0]) || r.s, axis: r.rec.axis || axisOfTopic((r.m || []).join(' ')), ev: r.verdict === 'remain' ? '직관 신호 + 기록 약함' : '직관 신호(기록은 좋음)', note: '「' + r.s + '」', open: r.verdict === 'remain', w: r.verdict === 'remain' ? 3 : 1 });
    });
    var groups = AXES.map(function (a) { return { id: a.id, name: a.name } }).concat([{ id: 'etc', name: '그 밖의 주제' }]).map(function (g) {
      var its = items.filter(function (x) { return x.axis === g.id; }).sort(function (a, b) { return b.w - a.w; });
      var srcs = {}; its.forEach(function (x) { srcs[x.src] = 1; });
      return { id: g.id, name: g.name, items: its, sources: Object.keys(srcs), weight: its.reduce(function (s, x) { return s + x.w; }, 0) };
    }).filter(function (g) { return g.items.length; }).sort(function (a, b) { return b.sources.length - a.sources.length || b.weight - a.weight; });
    return { groups: groups, n: items.length };
  }

  /* 이전 KMChC 학습진단과 비교 — 같은 축만 «그때 → 지금». 눈금이 달라 0~100 으로 옮겨 방향만 본다.
       흥미   KMChC 흥미 사다리(0~4단 → ÷4) ↔ 이번 흥미·가치 동의(1~5 → 0~100)
       효능감 KMChC 효능감 사다리       ↔ 이번 자기 효능감
       메타인지 KMChC 메타인지 사다리   ↔ 이번 점검·전략
       불안   KMChC 일반 불안(0~100)    ↔ 이번 시험 부담·막막함
       개념 직관 KMChC C 2단 바른 답 비율 ↔ 이번 직관 문장 20개 가운데 신호 없음 비율
     그때만 있는 축: 가치 내면화 · 타당도 표시 */
  function compareKm(A, ext) {
    var k = ((ext && ext.kmchc) || []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); })[0];
    if (!k) return null;
    var subs = {}; ((A.habits && A.habits.subs) || []).forEach(function (s) { subs[s.id] = s.avg; });
    function lk(v) { return v == null ? null : Math.round((v - 1) / 4 * 100); }
    var bel = (A.rows || []).filter(function (r) { return r.type === 'belief' && r.v; });
    var clean = bel.length ? Math.round(bel.filter(function (r) { return r.signal === 'none'; }).length / bel.length * 100) : null;
    var rows = [
      { key: 'interest', name: '흥미', before: k.interest == null ? null : k.interest / 4 * 100, beforeTxt: k.interest + '단 / 4', now: lk(subs.interest), nowTxt: subs.interest == null ? '' : '흥미·가치 ' + subs.interest.toFixed(1) + ' / 5' },
      { key: 'efficacy', name: '자기 효능감', before: k.efficacy == null ? null : k.efficacy / 4 * 100, beforeTxt: k.efficacy + '단 / 4', now: lk(subs.efficacy), nowTxt: subs.efficacy == null ? '' : subs.efficacy.toFixed(1) + ' / 5' },
      { key: 'metacog', name: '메타인지(스스로 점검)', before: k.metacog == null ? null : k.metacog / 4 * 100, beforeTxt: k.metacog + '단 / 4', now: lk(subs.monitor), nowTxt: subs.monitor == null ? '' : '점검·전략 ' + subs.monitor.toFixed(1) + ' / 5' },
      { key: 'anxiety', name: '불안·부담', before: k.anxiety, beforeTxt: k.anxiety == null ? '' : k.anxiety + ' / 100', now: lk(subs.burden), nowTxt: subs.burden == null ? '' : '시험 부담 ' + subs.burden.toFixed(1) + ' / 5', negative: true },
      { key: 'concept', name: '개념 직관(바른 생각 비율)', before: k.concept, beforeTxt: k.concept == null ? '' : k.concept + '%', now: clean, nowTxt: clean == null ? '' : '직관 문장 ' + clean + '%' },
      { key: 'value', name: '가치 내면화', before: k.value, beforeTxt: k.value == null ? '' : k.value + ' / 100', now: null, nowTxt: '' }
    ].filter(function (r) { return r.before != null; });
    rows.forEach(function (r) { r.diff = r.now != null ? r.now - r.before : null; });
    return { date: k.date, id: k.id, validity: k.validity, rows: rows, miscN: (k.misc || []).length };
  }

  /* 서로 다른 모의시험 두 개 이상에서 같은 유형을 절반 이상 틀린 것 (exam final.html repeatedMisses 와 같은 생각) */
  function repeatedExam(exams) {
    var acc = {};
    (exams || []).forEach(function (e) {
      (e.types || []).forEach(function (t) {
        var k = String(t.type || '').trim(); if (!k) return;
        var o = acc[k] || (acc[k] = { topic: k, area: t.area, met: 0, bad: 0, badExams: {}, mis: '' });
        o.met++;
        if (!t.ok) { o.bad++; o.badExams[e.id] = 1; var m = (e.misses || []).filter(function (x) { return x.q === t.q; })[0]; if (m && m.mis && !o.mis) o.mis = m.mis; }
      });
    });
    return Object.keys(acc).map(function (k) { var o = acc[k]; o.nEx = Object.keys(o.badExams).length; o.rate = o.met ? o.bad / o.met : 0; delete o.badExams; return o; })
      .filter(function (o) { return o.nEx >= 2 && o.rate >= 0.5; })
      .sort(function (a, b) { return b.nEx - a.nEx || b.rate - a.rate; });
  }

  function analyzeAll(opt) {
    opt = opt || {};
    var rbc = opt.roundsByCourse || { ch1: opt.rounds || {} };
    var A = analyze({ doc: opt.doc, ans: opt.ans, rows: opt.rows, rounds: rbc.ch1 || {}, ms: opt.ms });
    var courses = buildCourses(opt.rows, rbc);
    var ext = normalizeExternal(opt.external);
    A.courses = courses;
    A.link = linkCourses(courses, opt.link);
    A.external = ext;
    A.timeline = timeline(courses, ext);
    A.areaMap = areaMap(courses, ext, opt.link);
    A.examRepeated = repeatedExam(ext.exams);
    A.recurring = recurring(A, courses, ext, A.examRepeated);
    A.kmCompare = compareKm(A, ext);
    return A;
  }

  var api = { analyze: analyze, analyzeAll: analyzeAll, buildCourses: buildCourses, linkCourses: linkCourses,
    normalizeExternal: normalizeExternal, timeline: timeline, areaMap: areaMap, recurring: recurring, compareKm: compareKm, axisOfTopic: axisOfTopic, repeatedExam: repeatedExam,
    COURSE_NAME: COURSE_NAME, KM_CLUSTER: KM_CLUSTER, KM_CLUSTER_AXIS: KM_CLUSTER_AXIS, buildRecord: buildRecord, codesLevel: codesLevel, quality: quality,
    gamma: gamma, spearman: function (x, y) { return pearson(ranks(x), ranks(y)); }, wilson: wilson,
    TH: TH, AXES: AXES, AXIS_OF_UNIT: AXIS_OF_UNIT, SUBSCALES: SUBSCALES, STRATEGY: STRATEGY, order: order };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SurveyAnalysis = api;
})(typeof self !== 'undefined' ? self : this);
