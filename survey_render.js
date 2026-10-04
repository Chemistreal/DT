/* ============================================================
   「화학1 돌아보기」 진단 보고서 — 그리기·쪽 나눔 (survey_render.js)
   survey_print.html(학생 한 명) · survey_print_batch.html(반 전체 일괄)이 같이 쓴다.
   계산은 survey_analysis.js 가 하고, 여기서는 그 결과를 A4 쪽으로 그린다.

   ■ 말투 원칙(근거 연구 §6) — 사람이 아니라 과제·과정·자기조절을 말한다.
     「아직」「다음 단계」「신호」「점검해 볼 곳」. 다른 학생과 비교하지 않는다.
     수상·등급을 말하는 낱말은 쓰지 않는다(tests/survey_print.js 가 잰다).
   ■ 그래프는 모두 인라인 SVG — 바깥 라이브러리 없이, 인쇄에서 선명하게.
   ■ 쪽 나눔: 덩어리(block)를 A4 한 장(.sp-page)의 몸통에 차례로 넣고, 넘치면 다음 장.
     표는 줄 단위(.sp-split-rows), 카드 묶음은 자식 단위(.sp-split-kids)로 쪼갠다.
   ============================================================ */
(function (root) {
  'use strict';
  var SA = root.SurveyAnalysis || (typeof require === 'function' ? require('./survey_analysis.js') : null);
  var BRAND = '화학 · 다원교육 · 조준모';
  /* 회차는 18 로 박지 않는다(선생님 2026-10-04 — «학생이 18회를 다 본 게 아니라 실제로 응시한 회차만 센다»).
     학생마다 그리기·만들기 전에 CUR_N = 그 학생이 실제로 본 화학1 회차 수(A.record.taken)로 맞춘다. */
  var CUR_N = 0;
  function RW() { return CUR_N > 0 ? CUR_N + '회' : '수업'; }
  function RWE() { return CUR_N > 0 ? CUR_N + '-ROUND' : 'COURSE'; }
  function RWS() { return CUR_N > 0 ? CUR_N + ' ROUNDS' : 'REVIEW'; }
  function TITLE_() { return '화학1 ' + (CUR_N > 0 ? CUR_N + '회 ' : '') + '돌아보기 진단 보고서'; }
  function halves(rr) { var k = Math.ceil(rr.length / 2); return [rr.slice(0, k), rr.slice(k)]; }
  function halfLabel(h, front) { return h.length ? (front ? '앞쪽 ' : '뒤쪽 ') + h.length + '회(' + h[0].round + '~' + h[h.length - 1].round + '회) 평균' : (front ? '앞쪽' : '뒤쪽') + ' 평균'; }

  /* ── 색 ── 짙은 초록(exam 성적표 계열) 바탕, 갈래 색은 대비 4.5 이상인 글자색을 따로 둔다 */
  var CAT = {
    remain: { name: '남은 오개념', color: '#8E3B5A', tint: '#F6E9EF', ink: '#7A2E4B', solid: '#8E3B5A',
      desc: '직관 신호가 있고 기록도 아직 흔들리는 곳', act: '오개념과 정답을 나란히 비교하고, 다른 문장으로 세 번 맞힐 때까지 확인합니다.' },
    over: { name: '과신', color: '#C2562F', tint: '#FBECE5', ink: '#A6441F', solid: '#B24E28',
      desc: '자신 있다고 느꼈지만 기록은 아직 흔들리는 곳', act: '읽기 대신 직접 맞혀 봅니다. 연구상 가장 고치기 쉬운 곳입니다.' },
    reinforce: { name: '보강 필요', color: '#B8892B', tint: '#FAF2DF', ink: '#7F6118', solid: '#8F6B1E',
      desc: '스스로도 어렵다고 느끼고 기록도 약한 곳', act: '기초를 다시 보고, 1주·1달 간격으로 다시 꺼내 봅니다.' },
    hidden: { name: '숨은 실력', color: '#2F6FA3', tint: '#E7F0F8', ink: '#235A87', solid: '#2F6FA3',
      desc: '자신은 없었지만 기록은 꾸준히 좋은 곳', act: '「이건 내가 아는 것」이라고 확정해 둡니다.' },
    strong: { name: '강점', color: '#1F7A4D', tint: '#E5F3EB', ink: '#17663F', solid: '#1F7A4D',
      desc: '자신감과 기록이 함께 좋은 곳', act: '가끔 간격을 두고 꺼내 보는 것으로 충분합니다.' },
    watch: { name: '관찰', color: '#8C9692', tint: '#EEF1EF', ink: '#56605C', solid: '#66706C',
      desc: '기록이 중간이거나 적어 판정을 미룬 곳', act: '다음 시험에서 한 번 더 확인합니다.' }
  };
  var CAT_ORDER = ['remain', 'over', 'reinforce', 'hidden', 'strong', 'watch'];

  /* 오개념 문장이 «왜 그럴듯한가» — 일상 경험·말의 느낌에서 오는 이유(설문 belief 문항 k) */
  var WHY = {
    q004: '물질마다 무게와 크기가 다르니 「1몰」에 든 알갱이 수도 다를 것처럼 느껴집니다. 1다스(12개)처럼 몰도 «개수를 세는 묶음»이라는 점을 놓치기 쉽습니다.',
    q008: '질량이 다르면 다른 물질처럼 행동할 것 같다는 느낌 때문입니다. 화학적 성질을 정하는 것은 질량이 아니라 양성자 수와 전자 배치입니다.',
    q014: '반응식의 숫자를 늘 g으로 재던 습관대로 읽기 쉽습니다. 계수는 알갱이(몰)의 개수 비이고, 알갱이마다 무게가 달라 질량비와는 다릅니다.',
    q018: '양이 적으면 먼저 떨어질 것 같다는 일상 감각 때문입니다. 반응은 g이 아니라 알갱이 수(몰)와 계수비대로 짝을 지어 일어납니다.',
    q024: '원자를 이루는 입자를 모두 더해야 할 것 같은 느낌 때문입니다. 전자는 양성자의 약 1/1840로 매우 가벼워 질량수에는 넣지 않습니다.',
    q028: '기체마다 분자 크기가 다르니 부피도 다를 것 같다는 느낌이 들 수 있습니다. 기체는 분자 사이 거리가 분자 크기보다 훨씬 커서, 같은 온도·압력이면 1몰의 부피가 같습니다.',
    q034: '전자와 양성자가 많아지면 더 클 것 같다는 느낌 때문입니다. 같은 주기에서는 껍질 수는 같고 핵이 전자를 더 세게 끌어당겨 오히려 작아집니다.',
    q038: '«이온이 된다»를 무언가가 붙는 일로 느끼기 쉽습니다. 양이온은 전자를 잃어 바깥 껍질이 줄거나 전자 사이 반발이 줄어 작아집니다.',
    q044: '오른쪽으로 갈수록 전자가 많아 떼기 쉬울 것 같다는 느낌이 들 수 있습니다. 같은 주기에서는 핵전하가 커져 전자를 더 세게 붙잡습니다.',
    q048: '소금물이 전기가 통하니 소금 알갱이도 통할 것 같은 느낌 때문입니다. 고체 속 이온은 제자리에 묶여 있어 움직이지 못합니다.',
    q054: '물(H₂O)처럼 모든 물질이 분자로 되어 있다고 생각하기 쉽습니다. NaCl은 이온이 규칙적으로 끝없이 쌓인 결정이라 «한 분자»의 경계가 없습니다.',
    q058: '「열」이라는 말이 들어가 따뜻해질 것 같은 느낌 때문입니다. 흡열 반응은 주변의 열을 빼앗아 가므로 손으로 만지면 차갑습니다.',
    q064: '섞기만 했는데 온도가 오를 것 같지 않다는 느낌이 들 수 있습니다. 중화 반응은 열을 내놓는 발열 반응입니다.',
    q068: '겉으로 아무 변화가 없으니 멈춘 것처럼 보이기 때문입니다. 실험에서 «끝까지 가는 반응»을 먼저 많이 본 영향도 큽니다.',
    q074: '반응을 빠르게 해 주니 더 많이 만들어 줄 것 같다는 느낌 때문입니다. 촉매는 정반응과 역반응을 똑같이 빠르게 해서 평형의 위치는 그대로 둡니다.',
    q078: '높은 산은 춥고 힘드니 물도 더 «힘들게» 끓을 것 같은 느낌 때문입니다. 끓는점은 주변 압력과 같은 방향으로 움직여, 기압이 낮으면 더 낮은 온도에서 끓습니다.',
    q084: '실험에서 «물 1 L에 녹인다»는 말을 자주 들어 생기는 생각입니다. 몰농도는 녹인 뒤 용액 전체의 부피 1 L가 기준입니다.',
    q088: '색이 옅어지니 녹아 있는 것도 줄어든 것처럼 보이기 때문입니다. 물만 늘었을 뿐 용질의 몰수는 그대로입니다.',
    q094: '1, 2, 3처럼 숫자가 한 칸씩 움직이니 차이도 작을 것 같은 느낌 때문입니다. pH는 로그 눈금이라 1 작아질 때마다 [H⁺]가 10배씩 커집니다.',
    q098: '반응식에 이온이 모두 적혀 있어 다 반응하는 것처럼 보이기 때문입니다. Na⁺와 Cl⁻는 반응 전후 그대로 남는 구경꾼 이온입니다.'
  };

  /* 어려웠던 점 → 처방(설문 exp difficulty 문항 k) */
  var CURE = {
    q007: ['계산', '식을 외우기보다 «단위가 맞는지»부터 확인하는 습관을 들입니다. 계산 문장은 손으로 한 줄씩 풀어 보고, 틀린 문장은 맞는 수로 고쳐 씁니다.'],
    q017: ['그래프·그림', '그래프를 보면 먼저 축 이름과 단위를 소리 내어 읽고, «무엇이 늘면 무엇이 어떻게 되는가»를 한 문장으로 적어 봅니다.'],
    q027: ['비슷한 개념', '헷갈리는 두 개념을 한 표에 나란히 놓고 «같은 점 하나·다른 점 하나»를 적습니다. 비교표는 오래 남습니다.'],
    q037: ['용어', '용어마다 «한 줄 정의 + 예 하나»를 카드로 만들어, 앞면만 보고 뒷면을 떠올리는 연습을 합니다.'],
    q047: ['끝까지 읽기', 'O/X 문장은 주어·조건·결론에 빗금을 그어 세 토막으로 읽습니다. 틀린 곳은 대개 마지막 토막에 숨어 있습니다.'],
    q057: ['「항상」「모든」', '«항상·모든·반드시»가 보이면 반례를 하나 떠올려 봅니다. 반례가 떠오르면 X, 끝까지 안 떠오르면 O입니다.'],
    q067: ['앞 내용 잊음', '새 단원을 배운 주에도 앞 단원 문장 5개를 덮고 떠올립니다. 1주·1달 간격으로 다시 꺼내면 잊는 속도가 크게 줄어듭니다.'],
    q077: ['시간', '문장마다 «확실/애매»를 표시하며 한 바퀴를 먼저 돌고, 애매한 문장만 다시 봅니다. 확실한 문장에 시간을 쓰지 않는 연습입니다.'],
    q087: ['보이지 않는 내용', '원자·오비탈은 그림으로 그려 설명해 봅니다. 눈에 보이지 않는 내용일수록 «그림 + 말» 두 가지로 저장할 때 오래 남습니다.'],
    q097: ['여러 조건', '조건이 여럿이면 «무엇이 바뀌었나 → 그래서 어느 쪽으로 → 결과»의 세 칸 표를 채웁니다. 한 번에 한 조건만 움직입니다.']
  };

  var REFS = [
    ['Bell, P., & Volckmann, D. (2011). Knowledge surveys in general chemistry: Confidence, overconfidence, and performance. Journal of Chemical Education, 88(11), 1469–1476. https://doi.org/10.1021/ed100328c', '서지·초록 확인'],
    ['Hasan, S., Bagayoko, D., & Kelley, E. L. (1999). Misconceptions and the Certainty of Response Index (CRI). Physics Education, 34(5), 294–299. https://doi.org/10.1088/0031-9120/34/5/304', '서지·초록 확인(결정표는 2차 자료)'],
    ['Bjork, R. A., Dunlosky, J., & Kornell, N. (2013). Self-regulated learning: Beliefs, techniques, and illusions. Annual Review of Psychology, 64, 417–444. https://doi.org/10.1146/annurev-psych-113011-143823', '서지·초록 확인'],
    ['Butterfield, B., & Metcalfe, J. (2001). Errors committed with high confidence are hypercorrected. Journal of Experimental Psychology: Learning, Memory, and Cognition, 27(6), 1491–1494. https://doi.org/10.1037/0278-7393.27.6.1491', '서지·초록 확인'],
    ['Butler, A. C., Karpicke, J. D., & Roediger, H. L. (2008). Correcting a metacognitive error: Feedback increases retention of low-confidence correct responses. JEP: LMC, 34(4), 918–928. https://doi.org/10.1037/0278-7393.34.4.918', '서지·초록 확인'],
    ['Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249–255. https://doi.org/10.1111/j.1467-9280.2006.01693.x', '서지·초록 확인'],
    ['Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students’ learning with effective learning techniques. Psychological Science in the Public Interest, 14(1), 4–58. https://doi.org/10.1177/1529100612453266', '서지·초록 확인'],
    ['Uner, O., Tekin, E., & Roediger, H. L. (2022). True–false tests enhance retention relative to rereading. Journal of Experimental Psychology: Applied, 28(1), 114–129. https://doi.org/10.1037/xap0000363', '서지·초록 확인'],
    ['Nederhand, M. L., Tabbers, H. K., Jongerling, J., & Rikers, R. M. J. P. (2020). Reflection on exam grades to improve calibration of secondary school students: A longitudinal study. Metacognition and Learning, 15(3), 291–317. https://doi.org/10.1007/s11409-020-09233-9', '서지·초록 확인'],
    ['Talsma, K., Schüz, B., Schwarzer, R., & Norris, K. (2018). I believe, therefore I achieve (and vice versa): A meta-analytic cross-lagged panel analysis of self-efficacy and academic performance. Learning and Individual Differences, 61, 136–150. https://doi.org/10.1016/j.lindif.2017.11.015', '서지·초록 확인'],
    ['Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance: A historical review, a meta-analysis, and a preliminary feedback intervention theory. Psychological Bulletin, 119(2), 254–284. https://doi.org/10.1037/0033-2909.119.2.254', '서지·초록 확인'],
  ];

  /* ── 작은 도구 ── */
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function md(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n- /g, '<br>· ').replace(/^- /, '· ').replace(/\n/g, '<br>'); }
  function pct(x, d) { return x == null || isNaN(x) ? '—' : (Math.round(x * 100 * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + '%'; }
  function fx(x, d) { return x == null || isNaN(x) ? '—' : Number(x).toFixed(d == null ? 2 : d); }
  function sgn(x, d) { return x == null || isNaN(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(d == null ? 2 : d); }
  function ymd(d) {
    var t = d instanceof Date ? d : new Date(d);
    if (isNaN(t.getTime())) return '';
    return t.getFullYear() + '. ' + String(t.getMonth() + 1).padStart(2, '0') + '. ' + String(t.getDate()).padStart(2, '0') + '.';
  }
  function josa(w, a, b) {
    var s = String(w || ''), c = s.charCodeAt(s.length - 1);
    if (!(c >= 0xAC00 && c <= 0xD7A3)) return s + a;
    return s + ((c - 0xAC00) % 28 ? a : b);
  }
  function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function chip(v, extra) { var c = CAT[v]; return '<span class="sp-chip" style="background:' + c.tint + ';color:' + c.ink + ';border-color:' + c.color + '55">' + esc(c.name) + (extra || '') + '</span>'; }
  function dots(C) {
    if (C == null) return '<span class="sp-dim">—</span>';
    var n = Math.round(C * 4) + 1, h = '<span class="sp-dots" aria-label="자신감 ' + n + '/5">';
    for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return h + '</span>';
  }
  function labelOf(r) { return r.type === 'belief' ? ((r.m && r.m[0]) || short(r.s, 18)) : r.label; }

  /* ── 은행 글 ── */
  function readingOf(bank, codes) {
    for (var i = 0; i < (codes || []).length; i++) { var b = bank && bank[codes[i]]; if (b && b.reading) return { code: codes[i], m: b.m, r: b.reading, forms: b.forms || [] }; }
    return null;
  }
  function checkForms(bank, codes) {
    var all = [];
    (codes || []).forEach(function (c) { var b = bank && bank[c]; if (b && b.forms) b.forms.forEach(function (f) { all.push(f); }); });
    var xs = all.filter(function (f) { return f.a === 'X' && f.f; }).sort(function (a, b) { return (a.lvl || 1) - (b.lvl || 1); });
    var os = all.filter(function (f) { return f.a === 'O'; }).sort(function (a, b) { return (a.lvl || 1) - (b.lvl || 1); });
    var out = [];
    if (os[0]) out.push(os[0]);
    if (xs[0]) out.push(xs[0]);
    if (os[1]) out.push(os[1]); else if (xs[1]) out.push(xs[1]);
    return out.slice(0, 3);
  }

  /* ══════════════════ 스타일 ══════════════════ */
  var CSS = [
    '.sp-root{--sp-g9:#0B3B30;--sp-g8:#0E5A4C;--sp-g7:#1F6F5C;--sp-g2:#CFE3DB;--sp-g1:#E8F1EE;--sp-g0:#F3F8F6;',
    '--sp-cream:#FBFAF6;--sp-ink:#1F2A26;--sp-ink2:#4A5651;--sp-muted:#5E6A65;--sp-line:#E3E0D6;--sp-line2:#EFECE4;',
    '--sp-brass:#A9853C;--sp-brass-ink:#8A6A38;--sp-brass-soft:#F5EEDF;',
    'font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","DejaVu Sans","WenQuanYi Zen Hei",sans-serif;',
    'color:var(--sp-ink);font-size:9.6pt;line-height:1.62;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.sp-root *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.sp-sheets{display:flex;flex-direction:column;align-items:center;gap:9mm;padding:8mm 0 14mm}',
    '.sp-page{position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden;box-shadow:0 2px 10px rgba(11,59,48,.16),0 0 0 1px rgba(11,59,48,.06)}',
    '.sp-run-top{position:absolute;left:16mm;right:16mm;top:9mm;height:8mm;display:flex;align-items:center;justify-content:space-between;border-bottom:.6pt solid var(--sp-line);font-size:8.8pt;color:var(--sp-muted)}',
    '.sp-run-top .l{display:flex;align-items:center;gap:6px;font-weight:700;color:var(--sp-g8);letter-spacing:.02em}',
    '.sp-run-top img{height:5.2mm;width:auto}',
    '.sp-run-top .r{letter-spacing:.01em}',
    '.sp-run-bot{position:absolute;left:16mm;right:16mm;bottom:8mm;height:7mm;display:flex;align-items:center;justify-content:space-between;border-top:.6pt solid var(--sp-line);font-size:8.8pt;color:var(--sp-muted)}',
    '.sp-run-bot b{color:var(--sp-g8);font-weight:700}',
    '.sp-run-bot .pn{font-variant-numeric:tabular-nums;font-weight:700;color:var(--sp-g8)}',
    '.sp-body{position:absolute;left:16mm;right:16mm;top:21mm;bottom:18mm;overflow:hidden}',
    '.sp-body>*:first-child{margin-top:0}',
    /* 절 머리 */
    '.sp-sec{display:flex;align-items:flex-start;gap:11px;margin:0 0 9px;padding-bottom:8px;border-bottom:1.6pt solid var(--sp-g8)}',
    '.sp-no{flex:none;width:30px;height:30px;border-radius:7px;background:var(--sp-g8);color:#fff;font-weight:800;font-size:11.5pt;display:flex;align-items:center;justify-content:center;font-family:"DejaVu Sans",sans-serif}',
    '.sp-sec h2{margin:0;font-size:15.5pt;line-height:1.25;letter-spacing:-.02em;color:var(--sp-g9)}',
    '.sp-sec .en{display:block;font-size:8.8pt;letter-spacing:.16em;color:var(--sp-brass-ink);font-weight:700;margin-bottom:1px}',
    '.sp-lede{margin:0 0 10px;color:var(--sp-ink2);font-size:9.6pt}',
    '.sp-h3{display:flex;align-items:center;gap:7px;margin:12px 0 6px;font-size:10.8pt;font-weight:800;color:var(--sp-g9)}',
    '.sp-h3:before{content:"";width:4px;height:13px;border-radius:2px;background:var(--sp-brass)}',
    '.sp-card{border:1px solid var(--sp-line);border-radius:9px;padding:10px 12px;margin:0 0 8px;background:#fff}',
    '.sp-card.tint{background:var(--sp-g0);border-color:var(--sp-g2)}',
    '.sp-card.brass{background:var(--sp-brass-soft);border-color:#E6D6B0}',
    '.sp-note{border-left:3px solid var(--sp-brass);background:var(--sp-cream);border-radius:0 8px 8px 0;padding:8px 11px;margin:0 0 8px;color:var(--sp-ink2);font-size:9.3pt}',
    '.sp-note b{color:var(--sp-ink)}',
    '.sp-warn{border-left:3px solid #B24E28;background:#FBF1EC;border-radius:0 8px 8px 0;padding:8px 11px;margin:0 0 8px;color:#5A2A18;font-size:9.3pt}',
    '.sp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.sp-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}',
    '.sp-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}',
    '.sp-chip{display:inline-block;font-size:8.8pt;font-weight:700;padding:1px 8px;border-radius:999px;border:1px solid;white-space:nowrap;line-height:1.5}',
    '.sp-tag{display:inline-block;font-size:8.8pt;font-weight:700;padding:0 6px;border-radius:4px;background:var(--sp-line2);color:var(--sp-ink2);margin-left:3px;white-space:nowrap}',
    '.sp-dim{color:var(--sp-muted)}',
    '.sp-dots{display:inline-flex;gap:2px;vertical-align:middle}',
    '.sp-dots i{width:7px;height:7px;border-radius:50%;background:#DDE3E0;display:block}',
    '.sp-dots i.on{background:var(--sp-g8)}',
    /* 숫자 타일 */
    '.sp-kpi{border:1px solid var(--sp-line);border-radius:11px;padding:11px 10px 9px;background:linear-gradient(180deg,#fff,var(--sp-g0));position:relative;overflow:hidden}',
    '.sp-kpi:after{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--sp-g8)}',
    '.sp-kpi .t{font-size:8.8pt;font-weight:700;color:var(--sp-muted);letter-spacing:.02em}',
    '.sp-kpi .v{font-family:"DejaVu Sans",sans-serif;font-size:25pt;font-weight:800;color:var(--sp-g8);line-height:1.1;margin:4px 0 2px;letter-spacing:-.02em}',
    '.sp-kpi .v small{font-size:12pt;font-weight:700;margin-left:1px}',
    '.sp-kpi .d{font-size:8.8pt;color:var(--sp-ink2);line-height:1.45}',
    '.sp-band{display:inline-block;margin-top:5px;font-size:8.8pt;font-weight:700;padding:0 7px;border-radius:999px}',
    '.sp-band.good{background:#E5F3EB;color:#17663F}.sp-band.ok{background:#FAF2DF;color:#7F6118}.sp-band.low{background:#FBECE5;color:#A6441F}.sp-band.na{background:#EEF1EF;color:#56605C}',
    /* 분류 막대 */
    '.sp-stack{display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid var(--sp-line);margin:4px 0 6px}',
    '.sp-stack div{height:100%}',
    '.sp-cats{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}',
    '.sp-cat{border-radius:8px;padding:7px 8px 6px;border:1px solid}',
    '.sp-cat .n{font-family:"DejaVu Sans",sans-serif;font-size:17pt;font-weight:800;line-height:1}',
    '.sp-cat .nm{font-size:9pt;font-weight:800;margin-top:2px}',
    '.sp-cat .ds{font-size:8.8pt;line-height:1.35;margin-top:2px;color:var(--sp-ink2)}',
    /* 요약 세 줄 */
    '.sp-three{border:1.2pt solid var(--sp-g8);border-radius:11px;overflow:hidden}',
    '.sp-three .hd{background:var(--sp-g8);color:#fff;font-weight:800;padding:6px 12px;font-size:10pt;letter-spacing:.02em}',
    '.sp-three .ln{display:flex;gap:10px;padding:8px 12px;border-top:1px solid var(--sp-line2);align-items:flex-start}',
    '.sp-three .ln:first-of-type{border-top:0}',
    '.sp-three .k{flex:none;width:76px;font-weight:800;color:var(--sp-g8);font-size:9.3pt}',
    /* 표 */
    '.sp-tbl{width:100%;border-collapse:collapse;font-size:8.9pt;line-height:1.4}',
    '.sp-tbl th{background:var(--sp-g8);color:#fff;font-weight:700;text-align:left;padding:5px 6px;font-size:8.8pt;white-space:nowrap}',
    '.sp-tbl td{padding:5px 6px;border-bottom:1px solid var(--sp-line2);vertical-align:top}',
    '.sp-tbl tr:nth-child(even) td{background:#FCFCFA}',
    '.sp-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.sp-tbl td.c{text-align:center}',
    '.sp-tbl tr.grp td{background:var(--sp-cream);font-weight:800;color:var(--sp-g9);border-bottom:1.2pt solid var(--sp-line);padding-top:7px}',
    '.sp-tbl .lb{font-weight:700}',
    '.sp-tbl .st{display:block;color:var(--sp-muted);font-size:8.8pt;line-height:1.35}',
    '.sp-tbl.cont thead th{background:var(--sp-g7)}',
    /* 카드: 남은 오개념 */
    '.sp-mis{border:1px solid #E7CFD9;border-radius:11px;overflow:hidden;margin:0 0 9px;background:#fff}',
    '.sp-mis .top{background:linear-gradient(90deg,#8E3B5A,#6E2C46);color:#fff;padding:7px 12px;display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:10pt}',
    '.sp-mis .top span{font-size:8.8pt;font-weight:700;opacity:.92}',
    '.sp-mis .steps{display:grid;grid-template-columns:1fr 1fr;gap:0}',
    '.sp-mis .st{padding:8px 12px;border-top:1px solid var(--sp-line2)}',
    '.sp-mis .st:nth-child(odd){border-right:1px solid var(--sp-line2)}',
    '.sp-mis .st .h{font-size:8.8pt;font-weight:800;letter-spacing:.04em;margin-bottom:2px}',
    '.sp-mis .st.s1 .h{color:#7A2E4B}.sp-mis .st.s2 .h{color:#7F6118}.sp-mis .st.s3 .h{color:#17663F}.sp-mis .st.s4 .h{color:#235A87}',
    '.sp-mis .st.s1 .q{font-weight:800;font-size:10pt}',
    '.sp-ox{display:flex;gap:6px;align-items:flex-start;margin:3px 0;font-size:9pt}',
    '.sp-ox .bx{flex:none;border:1px solid var(--sp-ink2);border-radius:4px;padding:0 4px;font-size:8.8pt;font-weight:700;color:var(--sp-ink2);white-space:nowrap}',
    '.sp-ox .fx{display:block;color:var(--sp-muted);font-size:8.8pt;border-bottom:1px dashed #C9C4B6;min-height:15px;margin-top:2px}',
    '.sp-key{font-size:8.8pt;color:var(--sp-muted);margin-top:4px;text-align:right}',
    /* 우선순위 카드 */
    '.sp-pri{display:flex;gap:10px;border:1px solid var(--sp-line);border-radius:11px;padding:7px 11px;margin:0 0 6px;background:#fff;position:relative}',
    '.sp-pri .rk{flex:none;width:34px;height:34px;border-radius:50%;background:var(--sp-g8);color:#fff;font-weight:800;font-size:13pt;display:flex;align-items:center;justify-content:center;font-family:"DejaVu Sans",sans-serif}',
    '.sp-pri .bd{flex:1}',
    '.sp-pri .tt{font-weight:800;font-size:10.5pt;color:var(--sp-g9)}',
    '.sp-pri .one{margin:3px 0 0;padding:4px 9px;background:var(--sp-g0);border-radius:6px;font-size:9pt;line-height:1.5}',
    /* 주간 루틴 */
    '.sp-week{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}',
    '.sp-day{border:1px solid var(--sp-line);border-radius:8px;overflow:hidden;background:#fff}',
    '.sp-day .d{background:var(--sp-g8);color:#fff;text-align:center;font-weight:800;font-size:9.3pt;padding:3px 0}',
    '.sp-day .t{padding:5px 6px;font-size:8.8pt;line-height:1.4;min-height:72px}',
    '.sp-grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}',
    '.sp-nx{border:1px solid var(--sp-line);border-radius:8px;padding:5px 7px;background:#fff;line-height:1.3}',
    '.sp-nx b{display:block;font-size:13pt;font-family:"DejaVu Sans",sans-serif}.sp-nx b small{font-size:8.8pt;margin-left:1px}',
    '.sp-nx span{font-size:8.8pt;color:var(--sp-ink2);font-weight:600}',
    '.sp-day.rest .d{background:var(--sp-brass)}',
    /* 막대 */
    '.sp-bar{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:9pt}',
    '.sp-bar .nm{width:150px;flex:none;color:var(--sp-ink2);font-weight:600;line-height:1.3}',
    '.sp-bar .tr{flex:1;height:10px;background:#EFEDE6;border-radius:5px;position:relative;overflow:hidden}',
    '.sp-bar .tr i{position:absolute;left:0;top:0;bottom:0;border-radius:5px}',
    '.sp-bar .vv{width:50px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--sp-ink2)}',
    '.sp-fig{display:block;width:100%;height:auto}',
    '.sp-cap{font-size:8.8pt;color:var(--sp-muted);margin:3px 0 8px;line-height:1.45}',
    '.sp-toc{width:100%;border-collapse:collapse}',
    '.sp-toc td{padding:4px 0;border-bottom:1px dotted #CFCABD;font-size:9.6pt}',
    '.sp-toc td.no{width:34px;font-weight:800;color:var(--sp-g8);font-family:"DejaVu Sans",sans-serif}',
    '.sp-toc td.pg{width:40px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--sp-g8)}',
    '.sp-ul{margin:4px 0 6px;padding-left:16px}.sp-ul li{margin:2px 0}',
    '.sp-mini3{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 6px;margin:0 0 6px}',
    '.sp-mini{display:flex;align-items:center;gap:6px;border:1px solid var(--sp-line2);border-radius:7px;padding:3px 7px;font-size:9pt;line-height:1.35;background:#fff}',
    '.sp-mini .n{flex:none;width:20px;color:var(--sp-muted);font-variant-numeric:tabular-nums}',
    '.sp-mini .t{flex:1;font-weight:700;min-width:0}',
    '.sp-mini .p{flex:none;text-align:right;font-weight:800;color:var(--sp-g8);font-variant-numeric:tabular-nums}',
    '.sp-mini .p i{display:block;font-style:normal;font-weight:600;color:var(--sp-muted);font-size:8.8pt}',
    '.sp-tag.sm{padding:0 4px}',
    '.sp-refgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}',
    '.sp-say{display:grid;grid-template-columns:1fr 18px 1fr;gap:6px;align-items:center;margin:4px 0}',
    '.sp-say .no{background:#FBECE5;color:#7A3418;border-radius:7px;padding:5px 9px;font-size:9.2pt;text-decoration:line-through;text-decoration-color:#C2562F99}',
    '.sp-say .yes{background:#E5F3EB;color:#124F31;border-radius:7px;padding:5px 9px;font-size:9.2pt;font-weight:600}',
    '.sp-say .ar{text-align:center;color:var(--sp-brass-ink);font-weight:800}',
    '.sp-q{border:1px dashed var(--sp-g7);border-radius:9px;padding:7px 11px;margin:0 0 6px;background:#fff}',
    '.sp-q b{color:var(--sp-g8)}',
    '.sp-ref{font-size:8.8pt;line-height:1.38;margin:0 0 3px;padding-left:22px;text-indent:-22px;color:var(--sp-ink2)}',
    '.sp-ref .lv{color:var(--sp-brass-ink);font-weight:700;white-space:nowrap}',
    '.sp-empty{border:1px dashed var(--sp-g2);border-radius:11px;padding:16px;text-align:center;color:var(--sp-ink2);background:var(--sp-g0)}',
    '.sp-empty b{color:var(--sp-g8)}',
    /* 표지 */
    '.sp-cover .sp-body{top:0;bottom:0;left:0;right:0}',
    '.sp-cv-band{position:absolute;left:0;right:0;top:0;height:132mm;background:linear-gradient(160deg,#0E5A4C 0%,#0B3B30 70%,#082B23 100%);color:#fff;overflow:hidden}',
    '.sp-cv-band svg.pat{position:absolute;inset:0;width:100%;height:100%}',
    '.sp-cv-band .in{position:absolute;left:20mm;right:20mm;top:26mm}',
    '.sp-cv-eyebrow{font-family:"DejaVu Sans",sans-serif;font-size:8.8pt;letter-spacing:.32em;color:#D9C79A;font-weight:700}',
    '.sp-cv-title{font-size:30pt;font-weight:800;line-height:1.18;margin:9mm 0 3mm;letter-spacing:-.03em}',
    '.sp-cv-sub{font-size:13pt;font-weight:600;color:#E8D9B0;letter-spacing:.02em}',
    '.sp-cv-rule{width:42mm;height:2px;background:linear-gradient(90deg,#D9C79A,rgba(217,199,154,0));margin:7mm 0 5mm}',
    '.sp-cv-lede{font-size:10.2pt;line-height:1.7;color:#E4EEEA;max-width:140mm}',
    '.sp-cv-gold{position:absolute;left:0;right:0;top:132mm;height:2.2mm;background:linear-gradient(90deg,#A9853C,#D9C79A 50%,#A9853C)}',
    '.sp-cv-who{position:absolute;left:20mm;right:20mm;top:146mm}',
    '.sp-cv-name{font-size:24pt;font-weight:800;color:var(--sp-g9);letter-spacing:-.02em}',
    '.sp-cv-name small{font-size:13pt;font-weight:700;color:var(--sp-ink2);margin-left:6px}',
    '.sp-cv-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:6mm;border-top:1.2pt solid var(--sp-g8);border-bottom:1px solid var(--sp-line)}',
    '.sp-cv-meta div{padding:8px 10px;border-left:1px solid var(--sp-line2)}',
    '.sp-cv-meta div:first-child{border-left:0;padding-left:0}',
    '.sp-cv-meta .k{display:block;font-size:8.8pt;color:var(--sp-muted);font-weight:700;letter-spacing:.04em}',
    '.sp-cv-meta .v{display:block;font-size:11pt;font-weight:800;color:var(--sp-ink);margin-top:1px}',
    '.sp-cv-inside{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9mm}',
    '.sp-cv-inside div{border:1px solid var(--sp-line);border-radius:10px;padding:9px 10px;background:var(--sp-g0)}',
    '.sp-cv-inside b{display:block;font-family:"DejaVu Sans",sans-serif;font-size:17pt;color:var(--sp-g8);line-height:1.1}',
    '.sp-cv-inside span{font-size:8.8pt;color:var(--sp-ink2);font-weight:600}',
    '.sp-cv-toc{margin-top:8mm;border-top:1px solid var(--sp-line2);padding-top:4mm}',
    '.sp-cv-toc .h{font-size:8.8pt;font-weight:800;letter-spacing:.12em;color:var(--sp-brass-ink);margin-bottom:2mm}',
    '.sp-cv-toc ol{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(4,1fr);gap:1.6mm 4mm;counter-reset:cv}',
    '.sp-cv-toc li{font-size:9pt;color:var(--sp-ink2);counter-increment:cv;white-space:nowrap}',
    '.sp-cv-toc li:before{content:counter(cv,decimal-leading-zero);font-family:"DejaVu Sans",sans-serif;font-weight:800;color:var(--sp-g8);margin-right:5px;font-size:8.8pt}',
    '.sp-cv-foot{position:absolute;left:20mm;right:20mm;bottom:14mm;display:flex;align-items:flex-end;justify-content:space-between;border-top:1px solid var(--sp-line);padding-top:6mm}',
    '.sp-cv-foot img{height:15mm;width:auto}',
    '.sp-cv-brand{font-size:13pt;font-weight:800;color:var(--sp-g8);letter-spacing:.04em;text-align:right}',
    '.sp-cv-brand small{display:block;font-size:8.8pt;font-weight:600;color:var(--sp-muted);letter-spacing:.02em;margin-top:2px}',
    '.sp-cv-seal{position:absolute;right:20mm;top:117mm;width:32mm;height:32mm;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(11,59,48,.18)}',
    '@media print{.sp-sheets{display:block;padding:0;gap:0;zoom:1!important}.sp-page{box-shadow:none;margin:0;height:296.5mm;break-before:page;page-break-before:always;break-inside:avoid}.sp-page.sp-first{break-before:auto;page-break-before:auto}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('sp-style')) return;
    var s = document.createElement('style'); s.id = 'sp-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ══════════════════ SVG 그래프 ══════════════════ */
  /* 그래프 글꼴 — 학부모 PC(윈도 맑은 고딕 · 맥 Apple SD Gothic Neo)에서 Word 용 PNG 를 구울 때도 한글이 나오게
     그 둘을 앞세운다. 이 컨테이너·리눅스에서는 WenQuanYi Zen Hei 로 떨어진다(화면 그림도 같은 글꼴). */
  var FONT = 'font-family="\'Malgun Gothic\', \'Apple SD Gothic Neo\', \'Noto Sans KR\', \'WenQuanYi Zen Hei\', \'DejaVu Sans\', sans-serif"';

  /* 2. 18주 여정: 첫 시도 정답률(선) · 지난 단원 문항(점선) · 재시 횟수(막대) · 단원 띠 · 고질 해소(◆) */
  function journeySVG(A) {
    var R = A.record, W = 680, H = 330, x0 = 52, x1 = 664, yT = 26, yB = 196, bT = 214, bB = 262, uT = 276, uB = 300;
    var N = 18, xs = function (r) { return x0 + (r - 0.5) * (x1 - x0) / N; };
    var lo = 0.4, ys = function (p) { return yB - (Math.max(lo, Math.min(1, p)) - lo) / (1 - lo) * (yB - yT); };
    var g = '<svg class="sp-fig" viewBox="0 0 ' + W + ' ' + H + ('" role="img" aria-label="' + RW() + ' 첫 시도 정답률과 재시 횟수" ') + FONT + '>';
    [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach(function (p) {
      g += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + ys(p) + '" y2="' + ys(p) + '" stroke="' + (p === 0.8 ? '#C9A962' : '#ECE9E1') + '" stroke-width="' + (p === 0.8 ? 1.2 : 1) + '"' + (p === 0.8 ? ' stroke-dasharray="5 4"' : '') + '/>';
      g += '<text x="' + (x0 - 7) + '" y="' + (ys(p) + 4) + '" font-size="11" text-anchor="end" fill="#5E6A65">' + Math.round(p * 100) + '%</text>';
    });
    g += '<text x="' + (x0 + 4) + '" y="' + (ys(0.8) + 13) + '" font-size="10.5" fill="#8A6A38" font-weight="700">기준선 80%</text>';
    /* 재시 막대 */
    var maxR = Math.max(3, Math.max.apply(null, R.rounds.map(function (r) { return r.retakes; }).concat([0])));
    g += '<text x="' + (x0 - 7) + '" y="' + (bT + 9) + '" font-size="10.5" text-anchor="end" fill="#5E6A65">재시</text>';
    g += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + bB + '" y2="' + bB + '" stroke="#D8D4C8"/>';
    var bw = (x1 - x0) / N * 0.46;
    R.rounds.forEach(function (r) {
      if (!r.retakes) return;
      var h = r.retakes / maxR * (bB - bT);
      g += '<rect x="' + (xs(r.round) - bw / 2) + '" y="' + (bB - h) + '" width="' + bw + '" height="' + h + '" rx="2" fill="#C9A962"/>';
      g += '<text x="' + xs(r.round) + '" y="' + (bB - h - 3) + '" font-size="10.5" text-anchor="middle" fill="#8A6A38" font-weight="700">' + r.retakes + '</text>';
    });
    /* 단원 띠 */
    var segs = [], cur = null;
    for (var rd = 1; rd <= N; rd++) {
      var info = R.rounds.filter(function (x) { return x.round === rd; })[0];
      var ax = info && info.axis ? info.axis : (A.roundAxis && A.roundAxis[rd]) || null;
      if (!cur || cur.ax !== ax) { cur = { ax: ax, a: rd, b: rd }; segs.push(cur); } else cur.b = rd;
    }
    var tones = ['#E8F1EE', '#DCEBE4'];
    segs.forEach(function (s, i) {
      var xa = x0 + (s.a - 1) * (x1 - x0) / N, xb = x0 + s.b * (x1 - x0) / N;
      g += '<rect x="' + (xa + 1) + '" y="' + uT + '" width="' + (xb - xa - 2) + '" height="' + (uB - uT) + '" rx="4" fill="' + tones[i % 2] + '"/>';
      var nm = (SA.AXES.filter(function (a) { return a.id === s.ax; })[0] || { name: '' }).name;
      var span = s.b - s.a + 1;
      var SH = { matter: '물질', mole: '몰·양', atom: '원자', bond: '결합', enth: '엔탈피', eq: '평형', acid: '용액', comp: '실험식' };
      var lab = span >= 4 ? nm : (SH[s.ax] || '');
      if (lab) g += '<text x="' + ((xa + xb) / 2) + '" y="' + (uT + 16) + '" font-size="10.5" text-anchor="middle" fill="#0B3B30" font-weight="700">' + esc(lab) + '</text>';
    });
    for (var r2 = 1; r2 <= N; r2++) g += '<text x="' + xs(r2) + '" y="' + (bB + 12) + '" font-size="10.5" text-anchor="middle" fill="#4A5651">' + r2 + '</text>';
    /* 선 */
    function path(get, dash, color, wdt) {
      var d = '', pts = [];
      R.rounds.forEach(function (r) { var v = get(r); if (v == null) { d += ''; return; } pts.push([xs(r.round), ys(v), v, r.round]); });
      pts.forEach(function (p, i) { d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
      if (!pts.length) return { s: '', pts: pts };
      return { s: '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + wdt + '" stroke-linejoin="round" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>', pts: pts };
    }
    var rv = path(function (r) { return r.review.n >= 5 ? r.review.ok / r.review.n : null; }, '4 4', '#6FA48F', 1.8);
    var fr = path(function (r) { return r.rate; }, null, '#0E5A4C', 2.6);
    /* 면 */
    if (fr.pts.length > 1) {
      var area = 'M' + fr.pts[0][0] + ' ' + yB + fr.pts.map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('') + 'L' + fr.pts[fr.pts.length - 1][0] + ' ' + yB + 'Z';
      g += '<path d="' + area + '" fill="#0E5A4C" opacity="0.07"/>';
    }
    g += rv.s + fr.s;
    var best = fr.pts.slice().sort(function (a, b) { return b[2] - a[2]; })[0], worst = fr.pts.slice().sort(function (a, b) { return a[2] - b[2]; })[0];
    fr.pts.forEach(function (p) {
      g += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.6" fill="#fff" stroke="#0E5A4C" stroke-width="2"/>';
    });
    [best, worst, fr.pts[fr.pts.length - 1]].forEach(function (p, i) {
      if (!p || (i === 2 && (p === best || p === worst))) return;
      if (i === 1 && p === best) return;
      g += '<text x="' + p[0] + '" y="' + (p[1] + (i === 1 ? 17 : -9)) + '" font-size="11" text-anchor="middle" fill="#0B3B30" font-weight="700">' + Math.round(p[2] * 100) + '%</text>';
    });
    /* 고질 해소 ◆ */
    var res = {};
    (R.chronic || []).forEach(function (c) { if (c.resolvedAt) res[c.resolvedAt] = (res[c.resolvedAt] || 0) + 1; });
    Object.keys(res).forEach(function (k) {
      var x = xs(Number(k)), y = yT - 10;
      g += '<path d="M' + x + ' ' + (y - 6) + 'L' + (x + 6) + ' ' + y + 'L' + x + ' ' + (y + 6) + 'L' + (x - 6) + ' ' + y + 'Z" fill="#A9853C"/>';
      if (res[k] > 1) g += '<text x="' + (x + 9) + '" y="' + (y + 4) + '" font-size="10.5" fill="#8A6A38" font-weight="700">' + res[k] + '</text>';
    });
    g += '</svg>';
    return g;
  }

  /* 3. 산점도: x 자신감 C, y 앎 지수 P* */
  function scatterSVG(A) {
    var S = 400, m0 = 54, m1 = 384, yT = 16, yB = 346;
    var sx = function (c) { return m0 + c * (m1 - m0); }, sy = function (p) { return yB - p * (yB - yT); };
    var g = '<svg class="sp-fig" viewBox="0 0 ' + S + ' 392" role="img" aria-label="개념별 자신감과 기록" ' + FONT + '>';
    function zone(xa, xb, ya, yb, fill) { g += '<rect x="' + sx(xa) + '" y="' + sy(yb) + '" width="' + (sx(xb) - sx(xa)) + '" height="' + (sy(ya) - sy(yb)) + '" fill="' + fill + '"/>'; }
    g += '<rect x="' + m0 + '" y="' + yT + '" width="' + (m1 - m0) + '" height="' + (yB - yT) + '" fill="#FAFAF8" stroke="#E3E0D6"/>';
    zone(0.75, 1.0, 0.7, 1.0, '#E5F3EB'); zone(0.75, 1.0, 0, 0.4, '#FBECE5'); zone(0, 0.5, 0.7, 1.0, '#E7F0F8'); zone(0, 0.75, 0, 0.4, '#FAF2DF');
    [0, 0.25, 0.5, 0.75, 1].forEach(function (c, i) {
      g += '<line x1="' + sx(c) + '" x2="' + sx(c) + '" y1="' + yT + '" y2="' + yB + '" stroke="#ECE9E1"/>';
      g += '<text x="' + sx(c) + '" y="' + (yB + 15) + '" font-size="10.5" text-anchor="middle" fill="#4A5651">' + ['전혀', '아니다', '보통', '그렇다', '매우'][i] + '</text>';
    });
    [[0, '50%'], [0.4, '70%'], [0.7, '85%'], [1, '100%']].forEach(function (t) {
      g += '<line x1="' + m0 + '" x2="' + m1 + '" y1="' + sy(t[0]) + '" y2="' + sy(t[0]) + '" stroke="#ECE9E1"/>';
      g += '<text x="' + (m0 - 6) + '" y="' + (sy(t[0]) + 4) + '" font-size="10.5" text-anchor="end" fill="#4A5651">' + t[1] + '</text>';
    });
    g += '<line x1="' + sx(0) + '" y1="' + sy(0) + '" x2="' + sx(1) + '" y2="' + sy(1) + '" stroke="#0E5A4C" stroke-width="1.3" stroke-dasharray="6 5" opacity=".7"/>';
    g += '<text x="' + (sx(0.62) + 6) + '" y="' + (sy(0.62) + 15) + '" font-size="10.5" fill="#0E5A4C" transform="rotate(-45 ' + (sx(0.62) + 6) + ' ' + (sy(0.62) + 15) + ')">느낌 = 기록</text>';
    g += '<text x="' + (sx(0.875)) + '" y="' + (sy(1) + 14) + '" font-size="11" text-anchor="middle" fill="#17663F" font-weight="800">강점</text>';
    g += '<text x="' + (sx(0.875)) + '" y="' + (sy(0.4) + 14) + '" font-size="11" text-anchor="middle" fill="#A6441F" font-weight="800">과신</text>';
    g += '<text x="' + (sx(0.25)) + '" y="' + (sy(1) + 14) + '" font-size="11" text-anchor="middle" fill="#235A87" font-weight="800">숨은 실력</text>';
    g += '<text x="' + (sx(0.375)) + '" y="' + (sy(0.4) + 14) + '" font-size="11" text-anchor="middle" fill="#7F6118" font-weight="800">보강 필요</text>';
    g += '<text x="' + ((m0 + m1) / 2) + '" y="388" font-size="11" text-anchor="middle" fill="#1F2A26" font-weight="700">설문 자신감 →</text>';
    g += '<text x="14" y="' + ((yT + yB) / 2) + '" font-size="11" text-anchor="middle" fill="#1F2A26" font-weight="700" transform="rotate(-90 14 ' + ((yT + yB) / 2) + (')">' + RW() + ' 기록(첫 시도 정답률) →</text>');
    var pts = A.rows.filter(function (r) { return r.type === 'concept' && r.C != null && r.rec.n >= SA.TH.minN; });
    /* 같은 자리(자신감 칸 × 앎 지수 0.1 칸)에 몰린 점은 가로로 나란히, 넘치면 아래 줄로 — 숫자가 겹치지 않게 */
    var groups = {}, pos = {};
    pts.forEach(function (r) { var key = r.C + '|' + Math.round(r.rec.pStar * 10); (groups[key] || (groups[key] = [])).push(r); });
    Object.keys(groups).forEach(function (key) {
      var g2 = groups[key], per = 4, D = 19;
      g2.forEach(function (r, j) {
        var row = Math.floor(j / per), inRow = Math.min(per, g2.length - row * per), col = j % per;
        var bx = sx(r.C), by = sy(Math.round(r.rec.pStar * 10) / 10);
        var left = bx - (inRow - 1) / 2 * D, right = bx + (inRow - 1) / 2 * D;
        if (right > m1 - 10) bx -= right - (m1 - 10); if (left < m0 + 10) bx += (m0 + 10) - left;   /* 끝에 몰린 줄은 안쪽으로 통째로 민다 */
        var x = bx + (col - (inRow - 1) / 2) * D, y = by + (row ? row * D : 0) * (by < (yT + yB) / 2 ? 1 : -1);
        pos[r.k] = [x, Math.max(yT + 10, Math.min(yB - 10, y))];
      });
    });
    pts.forEach(function (r, i) {
      var cx = pos[r.k][0], cy = pos[r.k][1];
      var c = CAT[r.verdict];
      g += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="9" fill="' + c.solid + '" stroke="#fff" stroke-width="1.4"/>';
      g += '<text x="' + cx.toFixed(1) + '" y="' + (cy + 3.8).toFixed(1) + '" font-size="10" text-anchor="middle" fill="#fff" font-weight="700">' + (r.i + 1) + '</text>';
    });
    g += '</svg>';
    return { svg: g, n: pts.length };
  }

  /* 치우침 눈금: −0.5 ~ +0.5 */
  function biasSVG(b) {
    var W = 300, x0 = 14, x1 = 286, sx = function (v) { return x0 + (Math.max(-0.5, Math.min(0.5, v)) + 0.5) * (x1 - x0); };
    var g = '<svg class="sp-fig" viewBox="0 0 ' + W + ' 64" role="img" aria-label="자신감 치우침" ' + FONT + '>';
    g += '<rect x="' + x0 + '" y="18" width="' + (sx(-0.15) - x0) + '" height="14" rx="3" fill="#E7F0F8"/>';
    g += '<rect x="' + sx(-0.15) + '" y="18" width="' + (sx(0.15) - sx(-0.15)) + '" height="14" fill="#E5F3EB"/>';
    g += '<rect x="' + sx(0.15) + '" y="18" width="' + (x1 - sx(0.15)) + '" height="14" rx="3" fill="#FBECE5"/>';
    g += '<text x="' + ((x0 + sx(-0.15)) / 2) + '" y="48" font-size="10.5" text-anchor="middle" fill="#235A87" font-weight="700">낮춰 봄</text>';
    g += '<text x="' + sx(0) + '" y="48" font-size="10.5" text-anchor="middle" fill="#17663F" font-weight="700">잘 맞음</text>';
    g += '<text x="' + ((x1 + sx(0.15)) / 2) + '" y="48" font-size="10.5" text-anchor="middle" fill="#A6441F" font-weight="700">높여 봄</text>';
    if (b != null) {
      var x = sx(b);
      g += '<path d="M' + x + ' 34 L' + (x - 6) + ' 44 L' + (x + 6) + ' 44 Z" fill="#0B3B30" transform="translate(0,-28)"/>';
      g += '<line x1="' + x + '" x2="' + x + '" y1="16" y2="34" stroke="#0B3B30" stroke-width="2.4"/>';
      g += '<text x="' + x + '" y="62" font-size="10.5" text-anchor="middle" fill="#0B3B30" font-weight="800">' + sgn(b) + '</text>';
    }
    g += '</svg>';
    return g;
  }

  /* 4. 방사형: 앎 지수(기록) vs 자신감 */
  function radarSVG(A) {
    var W = 560, H = 360, cx = 280, cy = 182, R = 132, n = A.axes.length;
    var ang = function (i) { return -Math.PI / 2 + i * 2 * Math.PI / n; };
    var pt = function (i, v) { return [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v]; };
    var g = '<svg class="sp-fig" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="단원별 기록과 자신감" ' + FONT + '>';
    [0.25, 0.5, 0.75, 1].forEach(function (v) {
      var d = ''; for (var i = 0; i < n; i++) { var p = pt(i, v); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
      g += '<path d="' + d + 'Z" fill="' + (v === 1 ? '#FAFAF8' : 'none') + '" stroke="#E3E0D6"/>';
      g += '<text x="' + (cx + 3) + '" y="' + (cy - R * v + 11) + '" font-size="10" fill="#5E6A65">' + Math.round(v * 100) + '</text>';
    });
    for (var i = 0; i < n; i++) {
      var e = pt(i, 1), l = pt(i, 1.13), a = A.axes[i];
      g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="#E3E0D6"/>';
      var anc = Math.abs(l[0] - cx) < 8 ? 'middle' : l[0] > cx ? 'start' : 'end';
      g += '<text x="' + l[0].toFixed(1) + '" y="' + (l[1] + 4).toFixed(1) + '" font-size="11" text-anchor="' + anc + '" fill="#0B3B30" font-weight="700">' + esc(a.name) + '</text>';
    }
    function poly(get, fill, stroke, dash, op) {
      var d = '', ok = true;
      for (var j = 0; j < n; j++) { var v = get(A.axes[j]); if (v == null) { ok = false; break; } var p = pt(j, Math.max(0.02, v)); d += (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
      if (!ok) return '';
      var s = '<path d="' + d + 'Z" fill="' + fill + '" fill-opacity="' + op + '" stroke="' + stroke + '" stroke-width="2.2" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
      for (var k = 0; k < n; k++) { var q = pt(k, Math.max(0.02, get(A.axes[k]))); s += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3.2" fill="' + stroke + '"/>'; }
      return s;
    }
    g += poly(function (a) { return a.pStar; }, '#0E5A4C', '#0E5A4C', null, 0.16);
    g += poly(function (a) { return a.conf; }, '#A9853C', '#A9853C', '6 4', 0.06);
    g += '</svg>';
    return g;
  }

  /* 7. 자기조절 순환 */
  function cycleSVG(subs) {
    var by = {}; subs.forEach(function (s) { by[s.id] = s; });
    var nodes = [['plan', 120, 70, '① 계획'], ['monitor', 330, 70, '② 점검'], ['reflect', 225, 205, '③ 성찰']];
    var g = '<svg class="sp-fig" viewBox="0 0 450 262" role="img" aria-label="자기조절 세 단계" ' + FONT + '>';
    g += '<defs><marker id="spar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#A9853C"/></marker></defs>';
    g += '<path d="M190 52 Q225 28 262 52" fill="none" stroke="#A9853C" stroke-width="2" marker-end="url(#spar)"/>';
    g += '<path d="M352 128 Q342 182 296 200" fill="none" stroke="#A9853C" stroke-width="2" marker-end="url(#spar)"/>';
    g += '<path d="M156 200 Q104 182 98 128" fill="none" stroke="#A9853C" stroke-width="2" marker-end="url(#spar)"/>';
    nodes.forEach(function (nd) {
      var s = by[nd[0]] || {}, v = s.avg, f = v == null ? 0 : (v - 1) / 4;
      g += '<circle cx="' + nd[1] + '" cy="' + nd[2] + '" r="56" fill="#fff" stroke="#E3E0D6" stroke-width="1.5"/>';
      var a0 = -Math.PI / 2, a1 = a0 + f * 2 * Math.PI * 0.999, r = 50;
      var p0 = [nd[1] + r * Math.cos(a0), nd[2] + r * Math.sin(a0)], p1 = [nd[1] + r * Math.cos(a1), nd[2] + r * Math.sin(a1)];
      g += '<circle cx="' + nd[1] + '" cy="' + nd[2] + '" r="50" fill="none" stroke="#E8F1EE" stroke-width="8"/>';
      if (f > 0) g += '<path d="M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + (f > 0.5 ? 1 : 0) + ' 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + '" fill="none" stroke="#0E5A4C" stroke-width="8" stroke-linecap="round"/>';
      g += '<text x="' + nd[1] + '" y="' + (nd[2] - 8) + '" font-size="12" text-anchor="middle" fill="#0B3B30" font-weight="800">' + nd[3] + '</text>';
      g += '<text x="' + nd[1] + '" y="' + (nd[2] + 16) + '" font-size="17" text-anchor="middle" fill="#0E5A4C" font-weight="800">' + (v == null ? '—' : v.toFixed(1)) + '</text>';
      g += '<text x="' + nd[1] + '" y="' + (nd[2] + 31) + '" font-size="10" text-anchor="middle" fill="#5E6A65">/ 5</text>';
    });
    g += '</svg>';
    return g;
  }

  /* 표지 무늬 — 벤젠 고리를 성기게 */
  function coverPattern() {
    var g = '<svg class="pat" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#FFFFFF" stroke-opacity=".07" stroke-width="1.6">';
    for (var row = 0; row < 7; row++) for (var col = 0; col < 12; col++) {
      var x = col * 76 + (row % 2 ? 38 : 0) - 20, y = row * 66 + 10, r = 22, d = '';
      for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; d += (k ? 'L' : 'M') + (x + r * Math.cos(a)).toFixed(1) + ' ' + (y + r * Math.sin(a)).toFixed(1); }
      g += '<path d="' + d + 'Z"/>';
    }
    g += '</g><g fill="none" stroke="#D9C79A" stroke-opacity=".28" stroke-width="2.2"><circle cx="700" cy="120" r="150"/><circle cx="700" cy="120" r="112"/></g></svg>';
    return g;
  }
  function sealSVG() {
    var g = '<svg class="sp-cv-seal" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="none" stroke="#A9853C" stroke-width="2"/><circle cx="60" cy="60" r="48" fill="none" stroke="#A9853C" stroke-width=".8"/>';
    var d = ''; for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; d += (k ? 'L' : 'M') + (60 + 22 * Math.cos(a)).toFixed(1) + ' ' + (60 + 22 * Math.sin(a)).toFixed(1); }
    g += '<path d="' + d + 'Z" fill="none" stroke="#0E5A4C" stroke-width="3"/><circle cx="60" cy="60" r="11" fill="none" stroke="#0E5A4C" stroke-width="2"/>';
    g += '<text x="60" y="100" font-size="9" text-anchor="middle" fill="#8A6A38" ' + FONT + (' font-weight="700" letter-spacing="2">' + RWS() + '</text>');
    g += '<text x="60" y="27" font-size="9" text-anchor="middle" fill="#8A6A38" ' + FONT + ' font-weight="700" letter-spacing="2">REVIEW</text></svg>';
    return g;
  }

  /* 여섯 갈래 개수 — 쌓은 막대 + 아래 이름·개수 (Word 생성기용 · 화면은 HTML 막대를 쓴다) */
  function categoriesSVG(counts) {
    var W = 680, H = 92, x0 = 2, x1 = 678, tot = CAT_ORDER.reduce(function (s, k) { return s + (counts[k] || 0); }, 0) || 1, x = x0;
    var g = '<svg class="sp-fig" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="여섯 갈래 개수" ' + FONT + '>';
    CAT_ORDER.forEach(function (k) { var w = (counts[k] || 0) / tot * (x1 - x0); if (w > 0) g += '<rect x="' + x.toFixed(1) + '" y="4" width="' + w.toFixed(1) + '" height="24" fill="' + CAT[k].color + '"/>'; x += w; });
    var cw = (x1 - x0) / 6;
    CAT_ORDER.forEach(function (k, i) {
      var cx = x0 + i * cw;
      g += '<rect x="' + (cx + 2) + '" y="38" width="' + (cw - 4) + '" height="50" rx="7" fill="' + CAT[k].tint + '" stroke="' + CAT[k].color + '" stroke-opacity=".4"/>';
      g += '<text x="' + (cx + 12) + '" y="64" font-size="22" font-weight="800" fill="' + CAT[k].ink + '">' + (counts[k] || 0) + '</text>';
      g += '<text x="' + (cx + 12) + '" y="81" font-size="11.5" font-weight="800" fill="' + CAT[k].ink + '">' + esc(CAT[k].name) + '</text>';
    });
    return g + '</svg>';
  }
  /* 가로 막대 묶음 — items: [{label, value, max, color, text}] (습관 하위 척도·어려웠던 점·시험 영역 등) */
  function hbarsSVG(items, opt) {
    opt = opt || {};
    var W = opt.width || 680, lw = opt.labelWidth || 260, rh = 24, H = items.length * rh + 6, bx = lw + 8, bw = W - bx - 64;
    var g = '<svg class="sp-fig" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.title || '막대') + '" ' + FONT + '>';
    items.forEach(function (it, i) {
      var y = 4 + i * rh, mx = it.max || 1, mn = it.min || 0, f = it.value == null ? 0 : Math.max(0, Math.min(1, (it.value - mn) / (mx - mn)));
      g += '<text x="' + lw + '" y="' + (y + 15) + '" font-size="11.5" text-anchor="end" fill="#1F2A26">' + esc(short(it.label, Math.floor(lw / 11))) + '</text>';
      g += '<rect x="' + bx + '" y="' + (y + 6) + '" width="' + bw + '" height="11" rx="5.5" fill="#EFEDE6"/>';
      if (f > 0) g += '<rect x="' + bx + '" y="' + (y + 6) + '" width="' + (bw * f).toFixed(1) + '" height="11" rx="5.5" fill="' + (it.color || '#0E5A4C') + '"/>';
      g += '<text x="' + (W - 4) + '" y="' + (y + 15) + '" font-size="11.5" text-anchor="end" font-weight="700" fill="#4A5651">' + esc(it.text != null ? it.text : it.value == null ? '—' : String(it.value)) + '</text>';
    });
    return g + '</svg>';
  }
  /* 13절 그때 → 지금 (0~100) */
  function kmCompareSVG(KC) {
    var rows = (KC && KC.rows) || [];
    return hbarsSVG([].concat.apply([], rows.map(function (r) { return [
      { label: r.name + ' · 그때', value: r.before, max: 100, color: '#C9A962', text: r.before == null ? '—' : String(Math.round(r.before)) },
      { label: '지금', value: r.now, max: 100, color: '#0E5A4C', text: r.now == null ? '—' : String(Math.round(r.now)) }]; })), { title: '그때와 지금', labelWidth: 230 });
  }

  /* ══════════════════ 글 만들기 ══════════════════ */
  function band(b) { return b === 'good' ? '<span class="sp-band good">좋음</span>' : b === 'ok' ? '<span class="sp-band ok">보통</span>' : b === 'low' ? '<span class="sp-band low">점검 필요</span>' : '<span class="sp-band na">계산 보류</span>'; }

  function summaryLines(A, who) {
    var R = A.record, M = A.metrics, out = {};
    var first = R.rounds.filter(function (r) { return r.round <= 9 && r.rate != null; }), second = R.rounds.filter(function (r) { return r.round >= 10 && r.rate != null; });
    var m1 = first.length ? first.reduce(function (s, r) { return s + r.rate; }, 0) / first.length : null, m2 = second.length ? second.reduce(function (s, r) { return s + r.rate; }, 0) / second.length : null;
    var resolved = (R.chronic || []).filter(function (c) { return c.resolvedAt; });
    if (!A.hasRecord) out.good = '설문 100문항에 끝까지 솔직하게 답해, 스스로를 돌아볼 재료를 만들었습니다.';
    else if (A.record.retakeRate != null && A.record.retakeRate >= 0.7 && A.record.retake.withData >= 3) out.good = '처음 틀린 개념의 ' + pct(A.record.retakeRate) + '를 다른 문장으로 다시 물었을 때 바로잡았습니다. 문장을 외운 것이 아니라 개념을 고친 기록입니다.';
    else if (resolved.length >= 2) out.good = '여러 번 막혔던 개념 ' + resolved.length + '개를 끝까지 붙잡아, 뒤 회차에서는 계속 맞혔습니다.';
    else if (m1 != null && m2 != null && m2 - m1 >= 0.03) out.good = '후반 9회의 첫 시도 정답률이 전반보다 ' + Math.round((m2 - m1) * 100) + '%p 올랐습니다. 쌓일수록 단단해진 기록입니다.';
    else if (A.counts.strong >= 8) out.good = A.counts.strong + '개 개념에서 자신감과 기록이 함께 좋습니다. 내가 아는 것을 정확히 알고 있다는 뜻입니다.';
    else out.good = R.rounds.length + '회의 누적 시험을 치러 냈습니다. 기억 연구에서 효과가 가장 큰 «시험으로 공부하기»를 꾸준히 실천한 기록입니다.';
    var p = A.priorities[0];
    if (!A.hasRecord) out.next = '기록이 이어지면 개념별 우선순위를 정할 수 있습니다. 우선 설문에서 «자신 없다»고 답한 개념부터 다시 봅니다.';
    else if (p) out.next = '「' + labelOf(p) + '」 — ' + (p.verdict === 'remain' ? '마음속 직관과 기록이 같은 곳을 가리킵니다. 오개념과 정답을 나란히 놓고 비교하는 것이 가장 빠릅니다.' : p.verdict === 'over' ? '자신 있다고 느꼈지만 기록은 아직 흔들립니다. 확신하며 틀린 내용은 제대로 된 설명 한 번에 가장 잘 고쳐집니다.' : '기록이 아직 약합니다. 기초 정리를 다시 보고 간격을 두고 다시 꺼내 봅니다.');
    else out.next = '큰 구멍 없이 고르게 다져져 있습니다. 다음 단계는 유지 — 1주·1달 간격으로 가끔 꺼내 보는 것입니다.';
    var subs = {}; A.habits.subs.forEach(function (s) { subs[s.id] = s; });
    var ph = ['plan', 'monitor', 'reflect'].map(function (k) { return subs[k]; }).filter(function (s) { return s && s.avg != null; }).sort(function (a, b) { return a.avg - b.avg; })[0];
    var si = A.habits.strategy.index;
    if (!A.hasSurvey) out.habit = '공부를 마칠 때 «이 개념이 나오면 맞힐까?»를 1~5로 적고, 일주일 뒤 확인해 보세요.';
    else if (si != null && si < 0) out.habit = '다시 읽기보다 «덮고 떠올리기»를 늘려 보세요. 읽기는 익숙한 느낌을 주지만 시험으로 꺼낸 것이 더 오래 남습니다.';
    else if (ph && ph.id === 'monitor') out.habit = '공부를 마칠 때 «방금 공부한 것 중 무엇을 맞힐 수 있을까»를 스스로 확인하는 점검 습관이 다음 단계입니다.';
    else if (ph && ph.id === 'plan') out.habit = '한 주를 시작할 때 «이번 주에 다시 꺼낼 개념 3개»를 먼저 적어 두면 공부의 방향이 분명해집니다.';
    else if (ph && ph.id === 'reflect') out.habit = '시험이 끝나면 헷갈린 문장 하나를 골라 «왜 헷갈렸는지» 한 줄로 적어 두세요. 성찰이 다음 계획을 만듭니다.';
    else out.habit = '지금의 습관을 유지하면서, 틀린 O/X 문장을 맞는 문장으로 고쳐 쓰는 연습을 더해 보세요.';
    return out;
  }

  function adviceOf(r) {
    if (r.verdict === 'remain') return '오개념·정답 나란히 비교 → 다른 문장 3번 맞히기';
    if (r.verdict === 'over') return '읽기 대신 맞혀 보기 · «맞힐까?» 예측 후 확인';
    if (r.verdict === 'reinforce') return r.type === 'belief' ? '정답 문장 읽고 1주 뒤 덮고 떠올리기' : '기초 다시 보기 → 1주·1달 뒤 다시 꺼내기';
    if (r.verdict === 'hidden') return '«이건 아는 것» — 확정 표시하기';
    if (r.verdict === 'strong') return r.type === 'belief' ? '직관과 기록이 같은 방향 — 유지' : '가끔 간격 두고 꺼내 보기';
    if (r.tags.indexOf('latent') >= 0) return '시험은 맞혔지만 직관이 남아 있음 — 새 유형으로 점검';
    if (r.tags.indexOf('recovered') >= 0) return '재시로 고쳐 내 것으로 만든 개념 — 유지';
    if (r.rec.level === 'few') return '기록이 적어 다음 시험에서 확인';
    return '정답률 중간 — 다음 시험에서 한 번 더 확인';
  }
  function tagText(r) {
    var t = '';
    if (r.tags.indexOf('provisional') >= 0) t += '<span class="sp-tag">잠정</span>';
    if (r.tags.indexOf('ref') >= 0) t += '<span class="sp-tag">참고</span>';
    if (r.tags.indexOf('chronic') >= 0) t += '<span class="sp-tag">반복 막힘</span>';
    if (r.tags.indexOf('resolved') >= 0) t += '<span class="sp-tag">막힘 해소</span>';
    if (r.tags.indexOf('latent') >= 0) t += '<span class="sp-tag">잠복 직관</span>';
    if (r.tags.indexOf('recovered') >= 0) t += '<span class="sp-tag">재시 회복</span>';
    return t;
  }

  /* ══════════════════ 덩어리(block) 만들기 ══════════════════ */
  function el(html, cls) {
    var d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html;
    /* 덩어리 하나짜리면 그 덩어리를 그대로 — 표의 sp-split-rows 같은 표시가 바깥에서 보여야 쪼갤 수 있다 */
    if (!cls && d.childNodes.length === 1 && d.firstElementChild) return d.firstElementChild;
    return d;
  }
  function secHead(no, title, en, lede) {
    return el('<div class="sp-sec"><div class="sp-no">' + no + '</div><div><span class="en">' + esc(en) + '</span><h2>' + esc(title) + '</h2></div></div>' + (lede ? '<p class="sp-lede">' + lede + '</p>' : ''), 'sp-keep sp-sechead');
  }
  function h3(t) { return el('<div class="sp-h3">' + esc(t) + '</div>', 'sp-keep'); }

  function buildFlows(ctx) {
    var A = ctx.A, who = ctx.name ? esc(ctx.name) + ' 학생' : '이 학생', R = A.record, M = A.metrics, flows = [];
    CUR_N = (R && R.taken) || 0;
    var nm = ctx.name || '학생';
    var counts = A.counts, totalRows = A.rows.length;

    /* ── 표지 ── */
    var meta = [
      ['학교', ctx.school || '—'], ['학년', ctx.year ? String(ctx.year).replace(/학년$/, '') + '학년' : '—'],
      ['설문 응답일', ctx.surveyDate ? ymd(ctx.surveyDate) || '—' : '—'], ['보고서 작성일', ymd(ctx.today || new Date())]
    ];
    var nItems = R.total.n, nRounds = R.rounds.filter(function (r) { return r.rate != null; }).length;
    var otherN = (A.timeline || []).filter(function (t) { return t.course !== 'ch1'; }).length;
    var cover = '<div class="sp-cv-band">' + coverPattern() + ('<div class="in"><div class="sp-cv-eyebrow">CHEMISTRY I · ' + RWE() + ' REVIEW · DIAGNOSTIC REPORT</div>') +
      ('<div class="sp-cv-title">화학1 ' + (CUR_N > 0 ? CUR_N + '회 ' : '') + '돌아보기<br>진단 보고서</div><div class="sp-cv-sub">' + RW() + '의 실제 기록 × 하루의 설문</div><div class="sp-cv-rule"></div>') +
      '<div class="sp-cv-lede">매주 치른 누적 O/X 시험의 행동 기록과 마지막 시간의 점수 없는 설문 100문항을 개념마다 맞대어, ' +
      '무엇을 이미 알고 무엇을 다음에 다져야 하는지 정리했습니다. 이 보고서는 점수를 매기는 문서가 아니라 다음 공부의 지도입니다.</div></div></div>' +
      '<div class="sp-cv-gold"></div>' + sealSVG() +
      '<div class="sp-cv-who"><div class="sp-cv-name"><span data-sp-name>' + esc(nm) + '</span><small>학생</small></div>' +
      '<div class="sp-cv-meta">' + meta.map(function (m) { return '<div><span class="k">' + m[0] + '</span><span class="v">' + esc(m[1]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="sp-cv-inside">' +
      '<div><b>' + (nRounds || '—') + '</b><span>회 첫 시도 기록</span></div>' +
      '<div><b>' + (nItems ? nItems.toLocaleString('ko-KR') : '—') + '</b><span>문항을 개념별로 맞댐</span></div>' +
      '<div><b>' + otherN + '</b><span>그 밖의 시험(다른 과목·모의시험)</span></div>' +
      '<div><b>' + totalRows + '</b><span>개 개념을 6갈래로 진단</span></div></div>' +
      '<div class="sp-cv-toc"><div class="h">이 보고서에 담긴 것</div><ol>' + ['한눈에 보기', (RW() + ' 학습 여정'), '자기 판단과 실제 기록', '단원별 진단', '개념별 진단표', '남은 오개념 카드', '공부 습관과 마음', '어려웠던 점과 처방', '다음 과정을 위한 처방', '지금까지의 모든 시험', '영역·개념 누적 지도', '되풀이되는 오개념', '이전 학습진단과 비교', '부모님께 · 부록'].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div></div>' +
      '<div class="sp-cv-foot"><div><img alt="다원교육" src="' + ctx.logo + '"></div><div class="sp-cv-brand" data-sp-brand>' + BRAND + '<small>학생·부모 상담용 · 이 문서는 점수나 순위를 매기지 않습니다</small></div></div>';
    flows.push({ cover: true, blocks: [el(cover)] });

    /* ── 읽는 법 + 목차 ── */
    var f0 = [];
    f0.push(secHead('0', '이 보고서를 읽는 법', 'HOW TO READ', '설문 부분은 점수가 아니라 <b>스스로 느낀 것</b>입니다. 느낌과 실제 기록이 다를 때 그 차이가 가장 쓸모 있는 정보이며, 어느 쪽이 «틀렸다»는 뜻은 아닙니다.'));
    f0.push(el('<div class="sp-grid3">' +
      ('<div class="sp-card tint"><div class="sp-h3" style="margin-top:0">기록은 ' + RW() + '의 행동</div>매주 60문항, 첫 시도에서 맞힌 것과 재시에서 다른 문장으로 고친 것을 개념마다 셌습니다. 둘이 충돌하면 기록에 더 큰 무게를 둡니다.</div>') +
      '<div class="sp-card tint"><div class="sp-h3" style="margin-top:0">설문은 하루의 느낌</div>개념 자신감 40 · 직관 문장 20 · 습관과 마음 40문항. 정답이 없는 문항이라 솔직하게 답했을 때 가장 정확한 지도가 됩니다.</div>' +
      '<div class="sp-card tint"><div class="sp-h3" style="margin-top:0">판정은 «아직»의 말</div>여섯 갈래는 고정된 꼬리표가 아니라 지금의 위치입니다. 다음 시험 한 번으로도 바뀔 수 있고, 바뀌라고 만든 표시입니다.</div></div>'));
    f0.push(h3('여섯 갈래 — 느낌(자신감·직관) × 기록'));
    f0.push(el('<div class="sp-grid3">' + CAT_ORDER.map(function (k) { return '<div class="sp-card" style="margin:0;padding:7px 10px;border-color:' + CAT[k].color + '55;background:' + CAT[k].tint + '"><div style="font-weight:800;color:' + CAT[k].ink + '">' + esc(CAT[k].name) + '</div><div style="font-size:9pt;line-height:1.45">' + esc(CAT[k].desc) + '</div><div style="font-size:8.8pt;line-height:1.45;color:#4A5651;margin-top:2px">→ ' + esc(CAT[k].act) + '</div></div>'; }).join('') + '</div>'));
    f0.push(el('<p class="sp-cap">순서는 고칠 차례입니다: 남은 오개념 → 과신 → 보강 필요 → 숨은 실력 → 강점. 「잠정」은 그 개념을 물은 문항이 8개보다 적어 판단이 흔들릴 수 있다는 표시입니다.</p>'));
    f0.push(h3('차례'));
    var toc = [['1', '한눈에 보기', 's1'], ['2', (RW() + ' 학습 여정'), 's2'], ['3', '자기 판단과 실제 기록', 's3'], ['4', '단원별 진단', 's4'], ['5', '개념별 진단표', 's5'], ['6', '남은 오개념 카드와 잠복 직관 점검', 's6'], ['7', '공부 습관과 마음', 's7'], ['8', '어려웠던 점과 처방', 's8'], ['9', '다음 과정을 위한 처방', 's9'], ['10', '지금까지의 모든 시험', 's10'], ['11', '영역·개념 누적 지도', 's11'], ['12', '되풀이되는 오개념', 's12'], ['13', '이전 KMChC 학습진단과 비교', 's13'], ['P', '부모님께', 'sp'], ['A', '부록 — 지표 정의 · 판정 구간 · 응답 품질 · 한계 · 참고문헌', 'sa']];
    var half = Math.ceil(toc.length / 2), tocT = function (a) { return '<table class="sp-toc"><tbody>' + a.map(function (t) { return '<tr><td class="no">' + t[0] + '</td><td>' + esc(t[1]) + '</td><td class="pg" data-toc="' + t[2] + '">·</td></tr>'; }).join('') + '</tbody></table>'; };
    toc[toc.length - 1][1] = '부록 — 지표·판정 구간·응답 품질·문헌';
    f0.push(el('<div class="sp-grid2" style="gap:0 22px">' + tocT(toc.slice(0, half)) + tocT(toc.slice(half)) + '</div>'));
    flows.push({ id: 's0', blocks: f0 });

    /* ── 1. 한눈에 보기 ── */
    var f1 = [];
    f1.push(secHead('1', '한눈에 보기', 'AT A GLANCE', who + ('의 ' + RW() + ' 기록과 설문을 네 개의 숫자와 여섯 갈래로 줄였습니다.')));
    if (A.quality.flags.length) f1.push(el('<div class="sp-warn"><b>응답 품질 점검</b> — ' + qualityText(A.quality) + ' 자세한 결과는 부록에 있습니다.</div>'));
    if (!A.hasRecord) f1.push(el('<div class="sp-note"><b>화학1 시험 기록이 이 링크와 아직 이어지지 않았습니다.</b> 기록 숫자는 비워 두고, 설문에서 드러난 느낌과 습관을 중심으로 정리했습니다. 기록이 이어지면 같은 링크에서 다시 만들 수 있습니다.</div>'));
    if (!A.hasSurvey) f1.push(el(('<div class="sp-note"><b>설문 응답이 아직 없습니다.</b> ' + RW() + ' 기록만으로 정리했고, 자신감과 직관을 맞대는 부분은 비워 두었습니다.</div>')));
    var hceTxt = M.hce == null ? '자신 있다고 표시한 개념이 없거나 기록이 부족해 계산하지 않았습니다.' : '«그렇다» 이상으로 자신 있다고 한 ' + M.hceN + '개 가운데 기록이 흔들린 개념 ' + M.hceWeak + '개.';
    f1.push(el('<div class="sp-grid4">' +
      kpi((RW() + ' 첫 시도 정답률'), R.rate, '처음 본 문장에서 바로 맞힌 비율 (' + (R.total.n ? R.total.ok + ' / ' + R.total.n : '기록 없음') + ')', R.rate == null ? 'na' : R.rate >= 0.85 ? 'good' : R.rate >= 0.7 ? 'ok' : 'low') +
      kpi('재시 교정률', R.retakeRate, R.retake.withData ? '처음 틀린 개념을 다음 재시에서 다른 문장으로 바로잡은 비율 (' + R.retake.fixedNext + ' / ' + R.retake.withData + ')' : '재시 기록이 없어 계산하지 않았습니다.', R.retakeRate == null ? 'na' : R.retakeRate >= 0.8 ? 'good' : R.retakeRate >= 0.5 ? 'ok' : 'low') +
      kpi('자기 판단 정확도', M.accuracy, M.accuracy == null ? '자신감과 기록을 맞댈 개념이 부족합니다.' : '자신감과 기록의 평균 차이 ' + fx(M.mad) + ' → 1에서 뺀 값 (개념 ' + M.K + '개)', M.madBand || 'na') +
      kpi('확신 오류 비율', M.hce, hceTxt, M.hceBand || 'na', true) + '</div>'));
    var tot = CAT_ORDER.reduce(function (s, k) { return s + counts[k]; }, 0) || 1;
    f1.push(h3('여섯 갈래 개수 — 개념 ' + totalRows + '개'));
    f1.push(el('<div class="sp-stack">' + CAT_ORDER.map(function (k) { return counts[k] ? '<div style="width:' + (counts[k] / tot * 100).toFixed(2) + '%;background:' + CAT[k].color + '"></div>' : ''; }).join('') + '</div>' +
      '<div class="sp-cats">' + CAT_ORDER.map(function (k) { return '<div class="sp-cat" style="background:' + CAT[k].tint + ';border-color:' + CAT[k].color + '55"><div class="n" style="color:' + CAT[k].ink + '">' + counts[k] + '</div><div class="nm" style="color:' + CAT[k].ink + '">' + CAT[k].name + '</div><div class="ds">' + esc(CAT[k].desc) + '</div></div>'; }).join('') + '</div>'));
    var S3 = summaryLines(A, who);
    f1.push(el('<div class="sp-three" style="margin-top:10px"><div class="hd">세 줄 요약</div>' +
      '<div class="ln"><div class="k">잘한 점</div><div>' + esc(S3.good) + '</div></div>' +
      '<div class="ln"><div class="k">다음 우선순위</div><div>' + esc(S3.next) + '</div></div>' +
      '<div class="ln"><div class="k">습관 제안</div><div>' + esc(S3.habit) + '</div></div></div>'));
    if (A.hasRecord) {
      f1.push(h3('갈래마다 먼저 볼 개념'));
      f1.push(el('<div class="sp-grid4">' + ['remain', 'over', 'reinforce', 'hidden'].map(function (k) {
        var rs = A.sorted.filter(function (r) { return r.verdict === k; }).slice(0, 3);
        return '<div class="sp-card" style="margin:0;padding:7px 10px;border-top:3px solid ' + CAT[k].color + '"><div style="font-weight:800;color:' + CAT[k].ink + ';font-size:9.2pt">' + esc(CAT[k].name) + ' ' + counts[k] + '</div>' +
          (rs.length ? rs.map(function (r) { return '<div style="font-size:9pt;line-height:1.45">· ' + esc(short(labelOf(r), 15)) + ' <span class="sp-dim">' + pct(r.rec.p) + '</span></div>'; }).join('') : '<div class="sp-dim" style="font-size:9pt">해당 개념이 없습니다</div>') + '</div>';
      }).join('') + '</div>'));
    }
    f1.push(el('<p class="sp-cap">자기 판단 정확도와 확신 오류 비율은 O/X의 «찍어도 50%»를 보정한 앎 지수(2×정답률 − 1)로 계산했습니다. 구간(좋음·보통·점검 필요)은 문헌이 정한 표준이 아니라 이 보고서가 쓰는 제안값입니다 — 부록 B.</p>'));
    flows.push({ id: 's1', blocks: f1 });

    /* ── 2. 18주 여정 ── */
    var f2 = [];
    f2.push(secHead('2', (RW() + ' 학습 여정'), ('THE ' + RWE() + ' JOURNEY'), '매주 앞 내용까지 다시 묻는 누적 시험이었습니다. 진한 선은 회차마다 첫 시도 정답률, 점선은 그 가운데 <b>지난 단원 문항</b>의 정답률, 금색 막대는 재시 횟수입니다.'));
    if (R.has) {
      f2.push(el(journeySVG(A) + '<p class="sp-cap">아래 띠는 그 회차에 새로 배운 단원입니다. 맨 위 ◆는 여러 번 막혔던 개념이 그 회차부터 계속 맞기 시작한 자리(막힘 해소)입니다. 금색 점선은 회차 통과 기준 80%입니다.</p>'));
      var rr = R.rounds.filter(function (r) { return r.rate != null; });
      var best = rr.slice().sort(function (a, b) { return b.rate - a.rate || a.round - b.round; })[0];
      var hh = halves(rr.slice().sort(function (a, b) { return a.round - b.round; })), h1 = hh[0], h2 = hh[1];
      var av = function (a) { return a.length ? a.reduce(function (s, r) { return s + r.rate; }, 0) / a.length : null; };
      f2.push(el('<div class="sp-grid4">' +
        mini('가장 높았던 회차', best ? best.round + '회 · ' + pct(best.rate) : '—') +
        mini(halfLabel(h1, true), pct(av(h1))) + mini(halfLabel(h2, false), pct(av(h2))) +
        mini('지난 단원 문항', pct(R.reviewRate) + (R.review.n ? ' <span class="sp-dim">(' + R.review.n + '문항)</span>' : '')) + '</div>'));
      var res = R.chronic.filter(function (c) { return c.resolvedAt; }), open = R.chronic.filter(function (c) { return !c.resolvedAt; });
      f2.push(h3('여러 번 막혔던 개념과 해소'));
      if (!R.chronic.length) f2.push(el('<div class="sp-card">세 회차 이상 묻고 절반 이상 틀린 «반복 막힘» 개념이 없습니다. 막힌 곳이 생겨도 오래 끌지 않았다는 뜻입니다.</div>'));
      else f2.push(el('<div class="sp-grid2"><div class="sp-card"><div class="sp-h3" style="margin-top:0">해소한 개념 ' + res.length + '개</div>' +
        (res.length ? res.slice(0, 10).map(function (c) { return '<div>◆ ' + esc(c.m) + ' <span class="sp-dim">— ' + c.resolvedAt + '회부터 계속 맞힘</span></div>'; }).join('') : '<span class="sp-dim">아직 없습니다.</span>') + '</div>' +
        '<div class="sp-card brass"><div class="sp-h3" style="margin-top:0">아직 진행 중 ' + open.length + '개</div>' +
        (open.length ? open.slice(0, 10).map(function (c) { return '<div>· ' + esc(c.m) + ' <span class="sp-dim">— ' + c.asked + '회 중 ' + c.wrong + '회 막힘</span></div>'; }).join('') : '<span class="sp-dim">모두 해소했습니다.</span>') + '</div></div>'));
      var trend = av(h2) != null && av(h1) != null ? av(h2) - av(h1) : null;
      f2.push(el(('<div class="sp-note"><b>해석</b> — ' + RW() + ' 동안 매주 앞 내용까지 다시 확인하는 방식으로 공부했습니다. 이것은 기억 연구에서 효과가 가장 큰 것으로 알려진 <b>«시험으로 공부하기»와 «간격 두고 다시 꺼내기»</b>를 꾸준히 실천한 것입니다(Roediger & Karpicke, 2006). ') +
        (trend == null ? '' : trend >= 0.03 ? '뒤로 갈수록 단원이 어려워졌는데도 후반 평균이 ' + Math.round(trend * 100) + '%p 높습니다. ' : trend <= -0.03 ? '후반에는 평형·산염기처럼 여러 조건을 함께 따지는 단원이 이어지면서 평균이 ' + Math.round(-trend * 100) + '%p 내려갔습니다. 어려워진 단원에서 흔한 모습이며, 4절의 단원별 진단에서 어디서 내려갔는지 볼 수 있습니다. ' : '앞뒤 평균이 고르게 유지되어, 단원이 어려워져도 흔들리지 않았습니다. ') +
        (open.length ? '반복해서 막힌 개념은 «여러 번 다시 풀기»만으로는 잘 풀리지 않는 유형입니다. 문장을 바꿔도 같은 곳에서 틀린다면 그 밑의 생각 자체를 다뤄야 합니다 — 6절과 9절에 정리했습니다.' : '') + '</div>'));
    } else f2.push(el(('<div class="sp-empty"><b>화학1 시험 기록이 없습니다.</b><br>이 절은 ' + RW() + ' 기록이 이어지면 채워집니다.</div>')));
    flows.push({ id: 's2', blocks: f2 });

    /* ── 3. 자기 판단과 실제 기록 ── */
    var f3 = [];
    f3.push(secHead('3', '자기 판단과 실제 기록', 'CALIBRATION', ('동그라미 하나가 개념 하나입니다(숫자는 설문 문항 번호). 가로는 설문에서 고른 자신감, 세로는 ' + RW() + ' 첫 시도 정답률입니다. 점선 위에 있으면 느낌과 기록이 일치합니다.')));
    if (A.hasSurvey && R.has) {
      var sc = scatterSVG(A);
      f3.push(el('<div style="display:grid;grid-template-columns:1.12fr 1fr;gap:12px;align-items:start"><div>' + sc.svg + '<p class="sp-cap">색은 5절 진단표의 갈래와 같습니다. 바탕 색 구역은 대략적인 위치이며, 실제 갈래는 학생 자신의 응답 습관(평소 자신감 수준)과 재시·유지 기록까지 함께 보고 정했습니다. 기록이 3문항 미만인 개념(' + (40 - sc.n) + '개)은 빠졌습니다.</p></div><div>' +
        '<div class="sp-card"><div class="sp-h3" style="margin-top:0">치우침 — 평균적으로 높여 봤나, 낮춰 봤나</div>' + biasSVG(M.bias) + '<div style="margin-top:4px">' + biasText(M) + '</div></div>' +
        '<div class="sp-card"><div class="sp-h3" style="margin-top:0">구별력 — 아는 것과 모르는 것을 가렸나</div>' + gammaText(M) + '</div>' +
        '<div class="sp-card"><div class="sp-h3" style="margin-top:0">확신 오류</div>' + hceText(M) + '</div></div></div>'));
      f3.push(el('<div class="sp-note"><b>왜 이것이 중요한가</b> — «다시 보니 술술 읽힌다»는 익숙한 느낌은 «안다»는 착각을 가장 쉽게 만듭니다. 반복해서 읽으면 자신감은 오르지만 오래 남는 것은 시험으로 꺼내 본 쪽이었습니다(Bjork 외, 2013). ' +
        '확신하며 틀린 내용은 정확한 설명을 한 번 제대로 들으면 오히려 가장 잘 고쳐지고(Butterfield & Metcalfe, 2001), 자신 없이 맞힌 내용은 «맞았다»는 확인을 받을 때 오래 남습니다(Butler 외, 2008). 그래서 과신은 다음 공부의 첫 번째 우선순위, 숨은 실력은 확정해 둘 목록이 됩니다.</div>'));
      f3.push(el(('<p class="sp-cap">설문은 ' + RW() + ' 결과를 받은 뒤에 했으므로, 자신감에는 «기억하는 내 기록»이 섞여 있습니다. 높은 일치는 순수한 예측력이라기보다 «내 기록을 얼마나 정확히 받아들였는가»로 읽는 것이 정확합니다.</p>')));
    } else f3.push(el('<div class="sp-empty"><b>' + (A.hasSurvey ? '시험 기록' : '설문 응답') + '이 없어 맞댈 수 없습니다.</b><br>자신감과 기록이 둘 다 있어야 그릴 수 있는 그림입니다.</div>'));
    flows.push({ id: 's3', blocks: f3 });

    /* ── 4. 단원별 ── */
    var f4 = [];
    f4.push(secHead('4', '단원별 진단', 'BY UNIT', '여덟 단원 묶음마다 기록(초록 면)과 자신감(금색 점선)을 같은 눈금에 겹쳤습니다. 두 선이 벌어진 곳이 느낌과 기록이 어긋난 단원입니다.'));
    var axTable = '<table class="sp-tbl"><thead><tr><th scope="col">단원</th><th scope="col" style="text-align:right">문항</th><th scope="col" style="text-align:right">첫 시도</th><th scope="col" style="text-align:right">앎 지수</th><th scope="col" style="text-align:right">자신감</th><th scope="col" style="text-align:right">차이</th><th scope="col">갈래 분포</th></tr></thead><tbody>' +
      A.axes.map(function (a) {
        var gap = a.conf != null && a.pStar != null ? a.conf - a.pStar : null;
        var tt = CAT_ORDER.reduce(function (s, k) { return s + a.counts[k]; }, 0) || 1;
        return '<tr><td class="lb">' + esc(a.name) + '</td><td class="num">' + (a.n || '—') + '</td><td class="num">' + pct(a.p) + '</td><td class="num">' + fx(a.pStar) + '</td><td class="num">' + fx(a.conf) + '</td><td class="num" style="color:' + (gap == null ? '#5E6A65' : gap > 0.15 ? '#A6441F' : gap < -0.15 ? '#235A87' : '#17663F') + ';font-weight:700">' + sgn(gap) + '</td>' +
          '<td><div class="sp-stack" style="height:12px;margin:2px 0;width:120px">' + CAT_ORDER.map(function (k) { return a.counts[k] ? '<div style="width:' + (a.counts[k] / tt * 100).toFixed(1) + '%;background:' + CAT[k].color + '"></div>' : ''; }).join('') + '</div></td></tr>';
      }).join('') + '</tbody></table>';
    f4.push(el('<div style="display:grid;grid-template-columns:1fr;gap:4px"><div style="width:92%;margin:0 auto">' + radarSVG(A) + '</div>' +
      '<p class="sp-cap" style="text-align:center"><b style="color:#0E5A4C">━ 기록(앎 지수 × 100)</b> &nbsp; <b style="color:#8A6A38">┅ 자신감 × 100</b> · 두 값 모두 0~100 같은 눈금입니다.</p></div>'));
    f4.push(el(axTable));
    f4.push(el('<div class="sp-note" style="margin-top:8px">' + unitText(A) + '</div>'));
    flows.push({ id: 's4', blocks: f4 });

    /* ── 5. 개념별 진단표 ── */
    var f5 = [];
    f5.push(secHead('5', '개념별 진단표', 'CONCEPT BY CONCEPT', '설문의 개념 40개와 직관 문장 20개를 모두 진단했습니다. 고칠 차례(남은 오개념 → 과신 → 보강 → 숨은 실력 → 강점 → 관찰)로 늘어놓았습니다.'));
    var rowsHtml = '', curV = null;
    A.sorted.forEach(function (r) {
      if (r.verdict === 'strong' || r.verdict === 'watch') return;
      if (r.verdict !== curV) { curV = r.verdict; rowsHtml += '<tr class="grp"><td colspan="7"><span style="color:' + CAT[curV].ink + '">■ ' + CAT[curV].name + '</span> <span class="sp-dim" style="font-weight:600">· ' + counts[curV] + '개 · ' + esc(CAT[curV].act) + '</span></td></tr>'; }
      var feel = r.type === 'concept' ? dots(r.C) : sigText(r);
      var rt = r.rec.retake.wrong ? r.rec.retake.fixed + '/' + r.rec.retake.wrong : '—';
      rowsHtml += '<tr><td class="c sp-dim">' + (r.i + 1) + '</td><td><span class="lb">' + esc(labelOf(r)) + '</span>' + tagText(r) + (r.type === 'belief' ? '<span class="st">직관 「' + esc(short(r.s, 34)) + '」</span>' : '') + '</td>' +
        '<td class="c">' + feel + '</td><td class="num">' + (r.rec.n ? pct(r.rec.p) + '<span class="st">' + r.rec.ok + '/' + r.rec.n + '</span>' : '—') + '</td><td class="num">' + rt + '</td><td class="num">' + (r.rec.late.n >= 2 ? pct(r.rec.late.rate) : '—') + '</td>' +
        '<td>' + esc(adviceOf(r)) + '</td></tr>';
    });
    f5.push(el('<table class="sp-tbl sp-split-rows"><thead><tr><th scope="col" style="width:26px">번</th><th scope="col">개념</th><th scope="col" style="width:62px;text-align:center">자신감·직관</th><th scope="col" style="width:58px;text-align:right">첫 시도</th><th scope="col" style="width:44px;text-align:right">재시</th><th scope="col" style="width:44px;text-align:right">유지</th><th scope="col" style="width:178px">한 줄 권고</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>'));
    ['strong', 'watch'].forEach(function (k) {
      var rs = A.sorted.filter(function (r) { return r.verdict === k; });
      if (!rs.length) return;
      f5.push(el('<div class="sp-h3" style="margin-top:10px"><span style="color:' + CAT[k].ink + '">' + CAT[k].name + ' ' + rs.length + '개</span><span class="sp-dim" style="font-weight:600;font-size:9pt">· ' + esc(CAT[k].act) + '</span></div>', 'sp-keep'));
      var gridEl = document.createElement('div'); gridEl.className = 'sp-split-kids sp-mini3';
      rs.forEach(function (r) {
        var why = k === 'watch' ? (r.tags.indexOf('latent') >= 0 ? '잠복 직관' : r.tags.indexOf('recovered') >= 0 ? '재시 회복' : r.rec.level === 'few' ? '기록 적음' : '정답률 중간') : (r.type === 'belief' ? '직관·기록 일치' : (r.C != null ? '자신감 ' + Math.round(r.C * 4 + 1) + '/5' : ''));
        gridEl.appendChild(el('<span class="n">' + (r.i + 1) + '</span><span class="t">' + esc(short(labelOf(r), 17)) + tagText(r).replace(/sp-tag/g, 'sp-tag sm') + '</span><span class="p">' + (r.rec.n ? pct(r.rec.p) : '—') + '<i>' + esc(why) + '</i></span>', 'sp-mini'));
      });
      f5.push(gridEl);
    });
    f5.push(el('<p class="sp-cap">자신감 ●는 설문 1~5 응답(●5개 = 매우 그렇다). 직관 «신호»는 오개념 문장에 동의했거나 맞는 직관 문장을 부정한 것, «애매»는 보통이다. 재시 = 다음 재시에서 바로잡은 회차 / 처음 틀린 회차. 유지 = 처음 나온 회차 뒤 누적 시험에서의 정답률. 「잠정」= 물은 문항 8개 미만.</p>'));
    flows.push({ id: 's5', blocks: f5 });

    /* ── 6. 남은 오개념 카드 ── */
    var f6 = [];
    f6.push(secHead('6', '남은 오개념 카드', 'MISCONCEPTION CARDS', ('설문에서 공감한 직관 문장과 ' + RW() + ' 기록이 같은 곳을 가리키는 개념입니다. «이런 생각이 들었죠 → 왜 그럴듯한가 → 실제로는 → 확인 문장» 차례로 읽고, 확인 문장의 O/X를 직접 판단해 보세요.')));
    var cards = A.remain.slice();
    if (!cards.length) {
      f6.push(el('<div class="sp-empty"><b>남은 오개념 카드가 없습니다.</b><br>' + (A.quality.intuitionHold ? '직관 문장 응답은 응답 품질 점검에 따라 해석을 미뤘습니다(부록 C).' : A.hasRecord ? '공감한 직관 문장이 있더라도 기록은 이미 그 생각을 넘어서 있습니다. 직관과 지식이 같은 방향을 가리키고 있다는 좋은 신호입니다.' : '기록이 이어지면 직관 문장과 맞대어 볼 수 있습니다.') + '</div>'));
    }
    var cardWrap = document.createElement('div'); cardWrap.className = 'sp-split-kids';
    cards.forEach(function (r) {
      var rd = readingOf(ctx.bank, r.codes), forms = checkForms(ctx.bank, r.codes);
      var why = WHY[r.k] || '일상에서 자주 겪는 경험과 말의 느낌이 이 생각을 그럴듯하게 만듭니다.';
      var check = forms.length ? forms.map(function (f, i) { return '<div class="sp-ox"><span class="bx">O · X</span><span>' + (i + 1) + ') ' + esc(f.s) + (f.a === 'X' ? '<span class="fx">고쳐 쓰기: </span>' : '') + '</span></div>'; }).join('') +
        '<div class="sp-key">답: ' + forms.map(function (f, i) { return (i + 1) + ') ' + f.a; }).join(' · ') + '</div>' : '<span class="sp-dim">확인 문장은 다음 시험에서 함께 봅니다.</span>';
      cardWrap.appendChild(el('<div class="sp-mis"><div class="top">' + esc(labelOf(r)) + '<span>설문 ' + (r.i + 1) + '번 · 첫 시도 ' + pct(r.rec.p) + ' (' + r.rec.ok + '/' + r.rec.n + ')' + (r.tags.indexOf('provisional') >= 0 ? ' · 잠정' : '') + '</span></div><div class="steps">' +
        '<div class="st s1"><div class="h">① 이런 생각이 들었죠</div><div class="q">「' + esc(r.s) + '」</div><div class="sp-dim" style="font-size:8.8pt">설문에서 «' + (r.mis ? (r.v === 1 ? '매우 그렇다' : '그렇다') : (r.v === 5 ? '전혀 아니다' : '아니다')) + '»를 골랐습니다.</div></div>' +
        '<div class="st s2"><div class="h">② 왜 그럴듯한가</div>' + esc(why) + '</div>' +
        '<div class="st s3"><div class="h">③ 실제로는</div><b>' + esc(r.truth) + '</b>' + (rd && rd.r.core ? '<div style="margin-top:3px">' + md(rd.r.core) + '</div>' : '') + '</div>' +
        '<div class="st s4"><div class="h">④ 확인 문장 — O/X를 고르고, X는 맞게 고쳐 쓰기</div>' + check + '</div></div></div>'));
    });
    if (cards.length) f6.push(cardWrap);
    var lat = A.latent.filter(function (r) { return r.verdict !== 'remain'; });
    f6.push(h3('잠복 직관 점검 — 시험은 맞혔지만 마음속 직관이 남아 있는 곳'));
    if (lat.length) {
      f6.push(el('<p class="sp-lede" style="margin-bottom:6px">과학 지식은 예전 직관을 지우지 못하고 눌러 둘 뿐이라, 시간에 쫓기거나 새로운 유형에서 다시 튀어나올 수 있습니다. 한 번씩 소리 내어 정답 문장을 말해 보세요.</p>'));
      f6.push(el('<table class="sp-tbl sp-split-rows"><thead><tr><th scope="col">공감한 직관</th><th scope="col">정답 문장</th><th scope="col" style="width:60px;text-align:right">첫 시도</th></tr></thead><tbody>' +
        lat.map(function (r) { return '<tr><td>「' + esc(r.s) + '」</td><td>' + esc(r.truth) + '</td><td class="num">' + pct(r.rec.p) + '</td></tr>'; }).join('') + '</tbody></table>'));
    } else f6.push(el('<div class="sp-card">' + (A.quality.intuitionHold ? '응답 품질 점검에 따라 직관 문장의 해석을 미뤘습니다.' : '시험은 맞혔는데 직관이 남아 있는 개념이 없습니다. 맞는 직관 문장에도 ' + (A.quality.cleanIntuition ? '정확히 공감해, 직관과 지식이 같은 방향을 가리키고 있습니다.' : '대체로 같은 방향으로 답했습니다.')) + '</div>'));
    flows.push({ id: 's6', blocks: f6, cont: true });

    /* ── 7. 습관과 마음 ── */
    var f7 = [], subs = {}; A.habits.subs.forEach(function (s) { subs[s.id] = s; });
    f7.push(secHead('7', '공부 습관과 마음', 'HABITS & MINDSET', '습관 문항을 자기조절 학습의 세 단계(계획 → 점검 → 성찰)로 묶고, 효능감·시험 부담·흥미를 실제 기록과 나란히 놓았습니다. 숫자는 «그 문장에 얼마나 동의했나»(1~5)입니다.'));
    if (A.hasSurvey) {
      f7.push(el('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center"><div>' + cycleSVG(A.habits.subs) + '</div><div>' +
        ['efficacy', 'burden', 'interest'].map(function (k) { var s = subs[k]; return barRow(s.name, s.avg, 5, k === 'burden' ? '#C2562F' : '#0E5A4C', fx(s.avg, 1)); }).join('') +
        '<div class="sp-h3">효과적 전략 지수</div>' + strategyHTML(A.habits.strategy) + '</div></div>'));
      f7.push(h3('기록과 나란히'));
      f7.push(el('<div class="sp-grid3">' + habitPairs(A, subs).map(function (p) { return '<div class="sp-card"><div style="font-size:8.8pt;font-weight:800;color:#8A6A38;letter-spacing:.04em">' + esc(p[0]) + '</div><div style="font-weight:800;margin:2px 0 3px">' + p[1] + '</div><div style="font-size:9pt;color:#4A5651">' + p[2] + '</div></div>'; }).join('') + '</div>'));
      var pos = [];
      ['plan', 'monitor', 'reflect', 'efficacy', 'interest'].forEach(function (k) { subs[k].items.forEach(function (it) { if (it.agree != null) pos.push({ s: it.s, a: it.agree, g: subs[k].name }); }); });
      var hiI = pos.slice().sort(function (a, b) { return b.a - a.a; }).slice(0, 4), loI = pos.slice().sort(function (a, b) { return a.a - b.a; }).slice(0, 4);
      var li = function (x) { return '<div style="display:flex;gap:8px;align-items:flex-start;padding:3px 0;border-top:1px dotted #E3E0D6;font-size:9pt"><b style="flex:none;width:34px;color:#0E5A4C">' + x.a + ' / 5</b><span style="flex:1">' + esc(x.s) + ' <span class="sp-dim">· ' + esc(x.g) + '</span></span></div>'; };
      f7.push(h3('스스로 가장 «그렇다»고 한 습관과 가장 «아니다»라고 한 습관'));
      f7.push(el('<div class="sp-grid2"><div class="sp-card tint" style="margin:0"><div style="font-weight:800;color:#17663F;margin-bottom:2px">이미 자리 잡은 것</div>' + hiI.map(li).join('') + '</div><div class="sp-card brass" style="margin:0"><div style="font-weight:800;color:#7F6118;margin-bottom:2px">다음에 붙일 것</div>' + loI.map(li).join('') + '</div></div>'));
      f7.push(el('<div class="sp-note" style="margin-top:8px">' + habitText(A, subs) + '</div>'));
    } else f7.push(el('<div class="sp-empty"><b>설문 응답이 없어 이 절은 비워 두었습니다.</b></div>'));
    flows.push({ id: 's7', blocks: f7, cont: true });

    /* ── 8. 어려웠던 점 ── */
    var f8 = [];
    f8.push(secHead('8', '어려웠던 점과 처방', 'DIFFICULTIES', '어려웠던 점 10문항을 동의한 정도 차례로 늘어놓고, 시험 기록으로 확인할 수 있는 것은 옆에 함께 적었습니다.'));
    if (A.hasSurvey) {
      var diffs = A.habits.difficulties;
      f8.push(el(diffs.map(function (d) {
        var cx = d.cross ? crossText(d.cross) : '';
        return '<div class="sp-bar" style="align-items:flex-start"><div class="nm" style="width:240px">' + esc(d.s) + (cx ? '<span class="st sp-dim" style="display:block;font-weight:500;font-size:8.8pt">기록: ' + cx + '</span>' : '') + '</div><div class="tr" style="margin-top:5px"><i style="width:' + ((d.agree || 0) / 5 * 100) + '%;background:' + ((d.agree || 0) >= 4 ? '#C2562F' : (d.agree || 0) >= 3 ? '#C9A962' : '#9FC3B5') + '"></i></div><div class="vv">' + (d.agree == null ? '—' : d.agree + ' / 5') + '</div></div>';
      }).join('')));
      var top = diffs.filter(function (d) { return d.agree != null && d.agree >= 3; }).slice(0, 3);
      if (!top.length) top = diffs.slice(0, 2);
      f8.push(h3('처방 — 가장 크게 느낀 ' + top.length + '가지'));
      f8.push(el('<div class="sp-grid' + (top.length >= 3 ? '3' : '2') + '">' + top.map(function (d, i) {
        var c = CURE[d.k] || ['', '이 어려움을 선생님과 함께 구체적인 문장 하나로 짚어 보세요.'];
        return '<div class="sp-card tint"><div style="font-size:8.8pt;font-weight:800;color:#8A6A38">처방 ' + (i + 1) + ' · ' + esc(c[0]) + '</div><div style="font-weight:800;margin:2px 0 4px">「' + esc(short(d.s, 30)) + '」</div><div style="font-size:9.2pt">' + esc(c[1]) + '</div>' + (d.cross ? '<div class="sp-dim" style="font-size:8.8pt;margin-top:4px">기록 확인: ' + crossText(d.cross) + '</div>' : '') + '</div>';
      }).join('') + '</div>'));
      f8.push(el('<p class="sp-cap">«기록»은 첫 시도 문장 가운데 해당하는 문장만 골라 센 정답률입니다(예: 「항상」「모든」이 든 문장, 숫자가 든 문장, 35자 이상의 긴 문장, 지난 단원 문항). 느낌과 기록이 다르면 기록이 보여 주는 쪽을 먼저 믿어도 됩니다.</p>'));
    } else f8.push(el('<div class="sp-empty"><b>설문 응답이 없어 이 절은 비워 두었습니다.</b></div>'));
    flows.push({ id: 's8', blocks: f8, cont: true });

    /* ── 9. 다음 과정 처방 ── */
    var f9 = [];
    f9.push(secHead('9', '다음 과정을 위한 처방', 'NEXT STEPS', '화학1 심화·화학2를 시작하기 전에 다질 곳 세 개, 한 주의 공부 순서, 그리고 이미 내 것인 개념의 확정 목록입니다.'));
    f9.push(h3('우선순위 3'));
    if (A.priorities.length) {
      A.priorities.forEach(function (r, i) {
        var rd = readingOf(ctx.bank, r.codes);
        f9.push(el('<div class="sp-pri"><div class="rk">' + (i + 1) + '</div><div class="bd"><div class="tt">' + esc(labelOf(r)) + ' ' + chip(r.verdict) + tagText(r) + '</div>' +
          '<div class="sp-dim" style="font-size:9pt">첫 시도 ' + pct(r.rec.p) + ' (' + r.rec.ok + '/' + r.rec.n + ')' + (r.rec.retake.wrong ? ' · 재시 교정 ' + r.rec.retake.fixed + '/' + r.rec.retake.wrong : '') + (r.type === 'concept' && r.C != null ? ' · 설문 자신감 ' + Math.round(r.C * 4 + 1) + '/5' : '') + '</div>' +
          (rd && rd.r.oneline ? '<div class="one">' + md(rd.r.oneline) + '</div>' : (r.note ? '<div class="one">' + md(r.note) + '</div>' : '')) +
          '<div style="margin-top:3px;font-size:9pt"><b>할 일</b> — ' + esc(priorityAct(r)) + '</div></div></div>'));
      });
    } else f9.push(el('<div class="sp-empty"><b>지금 급히 다질 개념이 없습니다.</b><br>다음 과정의 첫 몇 주는 화학1 개념을 가끔 꺼내 보는 «유지»에 집중하면 충분합니다.</div>'));
    /* 보강 개념 카드 — 우선순위 뒤에 남은 과신·보강 개념의 은행 글(핵심 · 흔한 착각) */
    var more = A.priorityAll.slice(A.priorities.length).filter(function (r) { return readingOf(ctx.bank, r.codes); }).slice(0, 4);
    if (more.length) {
      f9.push(h3('보강 개념 카드 — 우선순위 다음으로 볼 개념'));
      var mc = document.createElement('div'); mc.className = 'sp-split-kids sp-grid2'; mc.style.marginBottom = '6px';
      more.forEach(function (r) {
        var rd = readingOf(ctx.bank, r.codes);
        mc.appendChild(el('<div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><b style="color:#0B3B30">' + esc(labelOf(r)) + '</b>' + chip(r.verdict) + '</div>' +
          '<div class="sp-dim" style="font-size:8.8pt">첫 시도 ' + pct(r.rec.p) + ' (' + r.rec.ok + '/' + r.rec.n + ')' + (r.rec.retake.wrong ? ' · 재시 교정 ' + r.rec.retake.fixed + '/' + r.rec.retake.wrong : '') + '</div>' +
          (rd.r.core ? '<div style="font-size:9pt;margin-top:3px">' + md(rd.r.core) + '</div>' : '') +
          (rd.r.kill ? '<div style="font-size:8.8pt;margin-top:3px;color:#7A3418;background:#FBF1EC;border-radius:5px;padding:3px 7px"><b>흔한 착각</b> ' + md(rd.r.kill) + '</div>' : ''), 'sp-card'));
      });
      f9.push(mc);
    }
    f9.push(h3('한 주의 공부 순서'));
    var p1 = A.priorities[0] ? labelOf(A.priorities[0]) : '약한 개념', p2 = A.priorities[1] ? labelOf(A.priorities[1]) : p1;
    var days = [['월', '덮고 떠올리기 10분 — 지난주 배운 것을 빈 종이에 핵심 문장으로'], ['화', '「' + short(p1, 14) + '」 — 오개념과 정답 나란히 비교 + O/X 3문장'], ['수', '새 내용 공부 끝에 «나오면 맞힐까?» 1~5로 예측 적기'], ['목', '틀린 O/X 문장을 맞는 문장으로 고쳐 쓰기'], ['금', '1주 전·1달 전 내용 다시 꺼내기(간격 복습) · 「' + short(p2, 12) + '」'], ['토', '수요일 예측 맞춰 보기 — 예측과 결과 비교 한 줄'], ['일', '쉬기 · 숨은 실력 목록 훑으며 «아는 것» 확인 5분']];
    f9.push(el('<div class="sp-week">' + days.map(function (d) { return '<div class="sp-day' + (d[0] === '일' ? ' rest' : '') + '"><div class="d">' + d[0] + '</div><div class="t">' + esc(d[1]) + '</div></div>'; }).join('') + '</div>' +
      '<p class="sp-cap">덮고 떠올리기·간격 두고 다시 꺼내기·틀린 O/X 고쳐 쓰기·예측 후 확인은 학습법 연구에서 효과가 크다고 정리된 방법입니다(Dunlosky 외, 2013; Uner 외, 2022; Nederhand 외, 2020).</p>'));
    f9.push(h3('숨은 실력 확정 목록 — «이건 내가 아는 것»'));
    var hid = A.hidden.concat(A.rows.filter(function (r) { return r.tags.indexOf('recovered') >= 0 && r.verdict !== 'hidden'; }));
    var nHid = A.hidden.length, nRec = hid.length - nHid;
    f9.push(el(hid.length ? '<div class="sp-card" style="background:#E7F0F8;border-color:#BCD3E8"><div style="display:flex;flex-wrap:wrap;gap:6px">' + hid.map(function (r) { return '<span class="sp-chip" style="background:#fff;color:#235A87;border-color:#2F6FA355">✓ ' + esc(labelOf(r)) + ' · ' + pct(r.rec.p) + (r.verdict !== 'hidden' ? ' · 재시 회복' : '') + '</span>'; }).join('') + '</div><div style="margin-top:6px;font-size:9.2pt;color:#1D4B70">' +
      (nHid ? '자신은 없었지만 기록은 꾸준히 맞은 개념' + (nRec ? '과, 처음엔 틀렸지만 재시로 고쳐 뒤로 계속 맞힌 개념' : '') + '입니다. ' : '처음엔 틀렸지만 재시로 고쳐 뒤로 계속 맞힌 개념입니다. ') + '«맞았다»는 확인을 받지 못하면 이런 지식은 쉽게 흐려지므로, ✓ 표시를 하고 다음 과정에서 자신 있게 쓰세요.</div></div>' :
      '<div class="sp-card">숨은 실력으로 분류된 개념이 없습니다. 자신감과 기록이 잘 맞는다는 뜻입니다.</div>'));
    if (A.hasSurvey) {
      var nx = (A.habits.groups.next && A.habits.groups.next.items) || [];
      f9.push(h3('다음 과정 준비 — 스스로 답한 것'));
      var NXS = { q010: '시작할 준비가 됨', q020: '한 번 더 정리가 필요', q030: '혼자서도 공부할 수 있음', q040: '처음 보는 문제도 풀어 봄', q050: '약한 개념을 앎', q060: '보강 방법을 앎', q070: '점수보다 이해', q080: '들인 시간이 충분', q090: '누적 시험을 계속', q100: '더 도움받고 싶음' };
      f9.push(el('<div class="sp-grid5">' + nx.map(function (it) { var a = it.agree; return '<div class="sp-nx"><b style="color:' + (a == null ? '#5E6A65' : a >= 4 ? '#17663F' : a <= 2 ? '#A6441F' : '#7F6118') + '">' + (a == null ? '—' : a + '<small>/5</small>') + '</b><span>' + esc(NXS[it.k] || short(it.s, 14)) + '</span></div>'; }).join('') + '</div>' +
        '<p class="sp-cap">설문 «다음 과정 준비» 10문항에 동의한 정도(5 = 매우 그렇다). «한 번 더 정리가 필요»와 «더 도움받고 싶음»은 높을수록 선생님과 함께 챙길 곳이 있다는 뜻입니다.</p>'));
    }
    flows.push({ id: 's9', blocks: f9 });

    /* ── 10. 지금까지의 모든 시험 ── */
    var f10 = [], X = A.external || { exams: [], kmchc: [], status: {} };
    f10.push(secHead('10', '지금까지의 모든 시험', 'EVERY TEST SO FAR', who + '이 지금까지 치른 시험을 한 줄로 모았습니다. DT의 모든 과목 회차와, 선생님 화면에서 이어 붙인 모의시험 기록입니다.'));
    var tl = A.timeline || [];
    if (tl.length) f10.push(el(timelineSVG(A) + '<p class="sp-cap">점 하나가 시험 한 번(첫 시도)입니다. 색은 과목·시험 갈래입니다. 날짜가 없는 시험은 차례대로 놓았습니다.</p>'));
    else f10.push(el('<div class="sp-empty"><b>시험 기록이 없습니다.</b></div>'));
    var cs10 = (A.courses || []).filter(function (c) { return c.rounds.length; });
    if (cs10.length) {
      f10.push(h3('DT 과목별 누적 O/X'));
      f10.push(el('<table class="sp-tbl"><thead><tr><th scope="col">과목</th><th scope="col" style="text-align:right">회차</th><th scope="col" style="text-align:right">첫 시도</th><th scope="col" style="text-align:right">재시 교정</th><th scope="col">회차별 추이</th><th scope="col">먼저 다질 곳</th></tr></thead><tbody>' +
        cs10.map(function (c) {
          var weak = null;
          if (c.course === 'ch1') { var ax = SA.AXES.map(function (a) { var x = c.rec.axis[a.id]; return { name: a.name, n: x.n, p: x.n ? x.ok / x.n : null }; }).filter(function (a) { return a.n >= 5; }).sort(function (a, b) { return a.p - b.p; }); weak = ax[0] || null; }
          else { var cc = Object.keys(c.rec.codes).map(function (k) { var o = c.rec.codes[k]; return { name: c.rec.misOfCode[k] || k, n: o.n, p: o.n ? o.ok / o.n : null }; }).filter(function (o) { return o.n >= 3; }).sort(function (a, b) { return a.p - b.p || b.n - a.n; }); weak = cc[0] || null; }
          return '<tr><td class="lb">' + esc(c.name) + (c.preview ? '<span class="sp-tag">미리보기</span>' : '') + '</td><td class="num">' + c.rounds.length + '</td><td class="num">' + pct(c.rate) + '</td><td class="num">' + pct(c.retakeRate) + '</td><td>' + spark(c.rounds) + '</td><td>' + (weak ? esc(weak.name) + ' <span class="sp-dim">' + pct(weak.p) + '</span>' : '—') + '</td></tr>';
        }).join('') + '</tbody></table>'));
    }
    if (A.link && A.link.n) {
      var L = A.link;
      f10.push(el('<div class="sp-card tint" style="margin-top:8px"><div class="sp-h3" style="margin-top:0">화학Ⅰ → ' + esc(L.toName) + ' — 이어진 개념 ' + L.n + '개</div>' +
        '같은 개념을 화학Ⅰ에서 ' + pct(L.fromRate) + ', ' + esc(L.toName) + '에서 ' + pct(L.ownRate) + ' 맞혔습니다. ' +
        (L.improved.length ? '화학Ⅰ에서 흔들렸던 개념 가운데 <b>' + L.improved.length + '개</b>는 심화에서 85% 이상으로 올라섰습니다(' + L.improved.slice(0, 4).map(function (o) { return esc(o.name); }).join(' · ') + '). ' : '') +
        (L.stillWeak.length ? '<b>' + L.stillWeak.length + '개</b>는 심화에서도 아직 흔들립니다(' + L.stillWeak.slice(0, 4).map(function (o) { return esc(o.name); }).join(' · ') + ') — 9절 우선순위와 함께 보세요.' : '') + '</div>'));
    }
    f10.push(h3('모의시험'));
    if (X.exams.length) {
      f10.push(el('<table class="sp-tbl sp-split-rows"><thead><tr><th scope="col">시험</th><th scope="col" style="width:66px">날짜</th><th scope="col" style="width:62px;text-align:right">맞은 개수</th><th scope="col" style="width:50px;text-align:right">백점환산</th><th scope="col">영역 — 강 · 약</th><th scope="col" style="width:118px">개념 깊이(또래 기준)</th></tr></thead><tbody>' +
        X.exams.map(function (e) {
          var ar = e.areas.filter(function (a) { return a.n >= 2; }).sort(function (a, b) { return b.p - a.p; });
          var d = e.depth, dep = d && (d.easyN || d.hardN) ? '쉬운 ' + pct(d.easyN ? d.easyOk / d.easyN : null) + ' · 어려운 ' + pct(d.hardN ? d.hardOk / d.hardN : null) + '<span class="st">' + depthWord(d) + '</span>' : '<span class="sp-dim">또래 자료 부족</span>';
          return '<tr><td class="lb">' + esc(e.title) + '<span class="st">' + esc(e.kind) + '</span></td><td>' + (ymd(e.date) || '—') + '</td><td class="num">' + e.ok + ' / ' + e.n + '</td><td class="num">' + (e.rate == null ? '—' : Math.round(e.rate * 100)) + '</td>' +
            '<td>' + (ar.length ? '<span style="color:#17663F;font-weight:700">' + esc(ar[0].name) + ' ' + pct(ar[0].p) + '</span>' + (ar.length > 1 ? ' · <span style="color:#A6441F;font-weight:700">' + esc(ar[ar.length - 1].name) + ' ' + pct(ar[ar.length - 1].p) + '</span>' : '') : '—') + '</td><td>' + dep + '</td></tr>';
        }).join('') + '</tbody></table>'));
      f10.push(el('<p class="sp-cap">개념 깊이는 또래 정답률 60% 이상을 «쉬운 문항», 미만을 «어려운 문항»으로 나눈 정답률입니다(또래 8명 이상일 때). 이 보고서는 다른 학생과의 순위를 싣지 않습니다.</p>'));
    } else f10.push(el('<div class="sp-card">' + extMsg(X.status.exam, '모의시험') + '</div>'));
    flows.push({ id: 's10', blocks: f10 });

    /* ── 11. 영역·개념 누적 지도 ── */
    var f11 = [], AM = A.areaMap || { cols: [], rows: [], examAreas: [] };
    f11.push(secHead('11', '영역·개념 누적 지도', 'CUMULATIVE MAP', '모든 시험의 문항을 화학Ⅰ 단원 묶음 기준으로 다시 모았습니다. 칸의 색이 진할수록 단단하고, 붉을수록 다질 곳입니다.'));
    if (AM.rows.length) {
      f11.push(el('<table class="sp-tbl"><thead><tr><th scope="col">단원 묶음</th>' + AM.cols.map(function (c) { return '<th scope="col" style="text-align:center">' + esc(c) + '</th>'; }).join('') + '<th scope="col" style="text-align:center">합계</th></tr></thead><tbody>' +
        AM.rows.map(function (r) { return '<tr><td class="lb">' + esc(r.name) + '</td>' + r.cells.map(heat).join('') + heat({ n: r.n, ok: r.ok, p: r.p }, true) + '</tr>'; }).join('') + '</tbody></table>'));
      f11.push(el('<p class="sp-cap">칸 안 숫자는 «정답률 · 문항 수»입니다. 다른 과목·모의시험의 단원·영역 이름은 내용에 따라 가장 가까운 화학Ⅰ 묶음에 얹었습니다(화학Ⅰ 심화는 개념 대응표로 옮김). 5문항 미만의 칸은 흐리게 표시합니다.</p>'));
      if (AM.examAreas.length) {
        var weakA = AM.examAreas.filter(function (x) { return x.p < 0.8; }).slice(0, 5), strongA = AM.examAreas.filter(function (x) { return x.p >= 0.85; }).reverse().slice(0, 5);
        var none = function (t) { return '<div class="sp-dim" style="font-size:9pt">' + t + '</div>'; };
        f11.push(el('<div class="sp-grid2"><div class="sp-card brass"><div class="sp-h3" style="margin-top:0">모의시험에서 다질 영역 (80% 미만)</div>' + (weakA.length ? weakA.map(function (a) { return barRow(a.name + ' · ' + a.n + '문항', a.p * 4 + 1, 5, '#C2562F', pct(a.p), 130); }).join('') : none('80% 아래로 내려간 영역이 없습니다.')) + '</div>' +
          '<div class="sp-card tint"><div class="sp-h3" style="margin-top:0">모의시험에서 단단한 영역 (85% 이상)</div>' + (strongA.length ? strongA.map(function (a) { return barRow(a.name + ' · ' + a.n + '문항', a.p * 4 + 1, 5, '#0E5A4C', pct(a.p), 130); }).join('') : none('85% 이상인 영역이 아직 없습니다.')) + '</div></div>'));
      }
    } else f11.push(el('<div class="sp-empty"><b>모을 시험 기록이 없습니다.</b></div>'));
    flows.push({ id: 's11', blocks: f11, cont: true });

    /* ── 12. 되풀이되는 오개념 ── */
    var f12 = [], RC = A.recurring || { groups: [] };
    f12.push(secHead('12', '되풀이되는 오개념', 'RECURRING MISCONCEPTIONS', '여러 시험·여러 해에 걸쳐 같은 자리에서 걸린 생각을 주제별로 묶었습니다. 출처가 여럿인 주제일수록 위에 놓았습니다.'));
    if (RC.groups.length) {
      var gw = document.createElement('div'); gw.className = 'sp-split-kids';
      RC.groups.forEach(function (g) {
        gw.appendChild(el('<div class="sp-card" style="padding:8px 11px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="color:#0B3B30;font-size:10.2pt">' + esc(g.name) + '</b><span>' + g.sources.map(function (x) { return '<span class="sp-tag">' + esc(x) + '</span>'; }).join('') + '</span></div>' +
          g.items.slice(0, 6).map(function (x) { return '<div style="display:flex;gap:8px;font-size:9.1pt;padding:2px 0;border-top:1px dotted #E3E0D6"><span style="flex:none;width:104px;color:' + (x.open ? '#A6441F' : '#17663F') + ';font-weight:700">' + esc(x.src) + '</span><span style="flex:1"><b>' + esc(short(x.topic, 40)) + '</b> <span class="sp-dim">— ' + esc(x.ev) + '</span>' + (x.note ? '<span class="st sp-dim" style="display:block;font-size:8.8pt">' + esc(short(x.note, 90)) + '</span>' : '') + '</span></div>'; }).join('') + '</div>'));
      });
      f12.push(gw);
      f12.push(el('<p class="sp-cap">초록 글씨는 이미 해소한 것, 붉은 글씨는 아직 열려 있는 것입니다. 같은 주제가 여러 출처에서 보이면 «그날의 실수»가 아니라 자리 잡지 않은 생각일 가능성이 큽니다 — 6절 카드처럼 오개념과 정답을 나란히 놓고 고치세요.</p>'));
    } else f12.push(el('<div class="sp-empty"><b>여러 번 되풀이된 오개념이 없습니다.</b><br>막힌 곳이 생겨도 같은 자리에서 반복되지 않았습니다.</div>'));
    flows.push({ id: 's12', blocks: f12, cont: true });

    /* ── 13. 이전 KMChC 학습진단과 비교 ── */
    var f13 = [], KC = A.kmCompare;
    f13.push(secHead('13', '이전 KMChC 학습진단과 비교', 'THEN AND NOW', '예전에 받은 「화학 정밀 학습진단」과 이번 설문에 같은 축이 있는 것끼리 «그때 → 지금»을 놓았습니다.'));
    if (KC && KC.rows.length) {
      f13.push(el('<table class="sp-tbl"><thead><tr><th scope="col">축</th><th scope="col">그때 (' + (ymd(KC.date) || '학습진단') + ')</th><th scope="col">지금 (이번 설문)</th><th scope="col" style="width:150px">0~100 눈금</th><th scope="col" style="width:62px;text-align:right">변화</th></tr></thead><tbody>' +
        KC.rows.map(function (r) {
          var good = r.diff == null ? null : (r.negative ? r.diff < 0 : r.diff > 0);
          return '<tr><td class="lb">' + esc(r.name) + '</td><td>' + esc(r.beforeTxt) + '</td><td>' + (r.nowTxt ? esc(r.nowTxt) : '<span class="sp-dim">이번 설문에 없는 축</span>') + '</td><td>' + twoBar(r.before, r.now) + '</td><td class="num" style="font-weight:800;color:' + (good == null ? '#5E6A65' : Math.abs(r.diff) < 8 ? '#5E6A65' : good ? '#17663F' : '#A6441F') + '">' + (r.diff == null ? '—' : (r.diff > 0 ? '▲ ' : r.diff < 0 ? '▼ ' : '') + Math.abs(Math.round(r.diff))) + '</td></tr>';
        }).join('') + '</tbody></table>'));
      f13.push(el('<p class="sp-cap">그때는 «도달 단계»(사다리 0~4단)와 0~100 점수, 지금은 «동의 정도»(1~5)라 눈금이 다릅니다. 둘 다 0~100으로 옮겨 <b>방향만</b> 봅니다(8 미만의 차이는 같은 것으로 봅니다). 그때 응답의 타당도 표시: ' + esc(KC.validity || '—') + '.</p>'));
      f13.push(el('<div class="sp-note">' + kmText(KC) + '</div>'));
      var K0 = (X.kmchc || []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); })[0];
      if (K0 && (K0.misc || []).length) {
        f13.push(h3('그때 고른 생각 → 지금 그 단원의 기록'));
        f13.push(el('<table class="sp-tbl"><thead><tr><th scope="col">그때 학습진단에서 고른 답</th><th scope="col" style="width:150px">이어지는 단원 묶음</th><th scope="col" style="width:92px;text-align:right">지금 첫 시도</th></tr></thead><tbody>' +
          K0.misc.slice(0, 6).map(function (m) {
            var axId = (SA.KM_CLUSTER_AXIS || {})[m.cluster] || SA.axisOfTopic(m.label), ax = A.axes.filter(function (x) { return x.id === axId; })[0];
            return '<tr><td><b>' + esc(((SA.KM_CLUSTER || {})[m.cluster] || m.cluster) + ' — ' + m.label) + '</b>' + (m.entrenched ? '<span class="sp-tag">확신하며 고름</span>' : '') + (m.pick ? '<span class="st">「' + esc(m.pick) + '」</span>' : '') + '</td><td>' + esc(ax ? ax.name : '그 밖의 주제') + '</td><td class="num">' + (ax && ax.p != null ? pct(ax.p) + '<span class="st">' + ax.n + '문항</span>' : '—') + '</td></tr>';
          }).join('') + '</tbody></table>'));
      }
      if (K0 && K0.interestCtx && K0.anxietyCtx) {
        var CTXN = { phenom: '현상', symbol: '입자·기호', quant: '정량(계산)', lab: '실험' };
        var cells = ['phenom', 'symbol', 'quant', 'lab'].filter(function (c) { return K0.interestCtx[c] != null || K0.anxietyCtx[c] != null; });
        if (cells.length) {
          f13.push(h3('그때의 맥락별 흥미와 불안(0~100)'));
          f13.push(el('<div class="sp-grid4">' + cells.map(function (c) { var i = K0.interestCtx[c], x = K0.anxietyCtx[c]; return '<div class="sp-card" style="margin:0;padding:6px 9px"><b style="font-size:9.2pt">' + CTXN[c] + '</b>' + barRow('흥미', i == null ? null : i / 25 + 1, 5, '#0E5A4C', i == null ? '—' : String(i), 34) + barRow('불안', x == null ? null : x / 25 + 1, 5, '#C2562F', x == null ? '—' : String(x), 34) + '</div>'; }).join('') + '</div>'));
        }
      }
    } else f13.push(el('<div class="sp-card">' + extMsg((X.status || {}).kmchc, 'KMChC 학습진단') + '</div>'));
    flows.push({ id: 's13', blocks: f13, cont: true });

    /* ── 부모님께 ── */
    var fp = [];
    fp.push(secHead('P', '부모님께', 'FOR PARENTS', '이 보고서는 아이를 평가하는 문서가 아니라 다음 공부의 방향을 찾는 지도입니다. 아래 말들이 대화의 출발점이 되기를 바랍니다.'));
    fp.push(h3('과정을 짚는 칭찬 — 이 아이의 기록에서'));
    fp.push(el(praise(A).map(function (s) { return '<div class="sp-q">“' + esc(s) + '”</div>'; }).join('')));
    fp.push(el('<p class="sp-cap">«머리가 좋다»보다 «이 개념을 다른 문장으로 다시 풀어서 고쳤구나»처럼 과정을 짚는 말이 다음 노력으로 이어집니다. 사람 자체에 대한 칭찬·평가는 학습에 거의 도움이 되지 않았고, 피드백의 3분의 1 이상은 오히려 수행을 떨어뜨렸습니다(Kluger & DeNisi, 1996).</p>'));
    fp.push(h3('피하면 좋은 말 → 바꿔 쓰는 말'));
    fp.push(el([['머리가 좋네 / 머리가 나쁘네', '이 방법이 너한테 잘 통했구나'], ['다른 애들은 몇 점이래?', '지난번보다 무엇이 달라졌어?'], ['왜 이것도 몰라?', '어떻게 생각해서 그렇게 골랐어?'], ['오개념이 있다고 나왔네', '아직 점검해 볼 곳이 있대'], ['자신감만 넘치는구나', '자신 있는 걸 직접 맞혀 보면서 확인해 보자']].map(function (p) {
      return '<div class="sp-say"><div class="no">' + esc(p[0]) + '</div><div class="ar">→</div><div class="yes">' + esc(p[1]) + '</div></div>'; }).join('')));
    fp.push(h3('함께 나눌 질문'));
    fp.push(el(questions(A).map(function (q, i) { return '<div class="sp-q"><b>Q' + (i + 1) + '.</b> ' + esc(q) + '</div>'; }).join('')));
    fp.push(el('<div class="sp-note"><b>높은 자신감으로 틀린 개념은 혼낼 일이 아니라, 정확한 설명이 가장 효과를 내는 지점입니다.</b> «왜 그렇게 생각했어?»라고 추론을 먼저 들어 주시면, 아이가 스스로 어디서 어긋났는지 찾는 데 큰 도움이 됩니다.</div>'));
    flows.push({ id: 'sp', blocks: fp });

    /* ── 부록 ── */
    var fa = [];
    fa.push(secHead('A', '부록', 'APPENDIX', '판정 틀은 정오 × 확신의 결정표(Hasan 외, 1999)를 개념 단위로 옮긴 것이고, «지식 설문»의 자신감을 시험과 맞댄 일반화학 연구(Bell & Volckmann, 2011)에 가장 가깝습니다.'));
    fa.push(h3('A. 지표 정의'));
    fa.push(el('<table class="sp-tbl sp-split-rows"><thead><tr><th scope="col" style="width:130px">지표</th><th scope="col">정의</th><th scope="col" style="width:92px;text-align:right">이 학생</th></tr></thead><tbody>' + [
      ['자신감 C', '자신감 문항 응답 v(1 매우 그렇다 ~ 5 전혀 아니다) → C = (5 − v) / 4', A.conf.mean == null ? '—' : '평균 ' + fx(A.conf.mean)],
      ['첫 시도 정답률 p', '회차마다 첫 응시 답안을 문항의 개념 코드·정답과 자리대로 맞댄 정답률(빈칸 = 못 맞힘)', pct(R.rate)],
      ['앎 지수 P*', 'O/X는 찍어도 50%이므로 P* = max(0, 2p − 1) — 50% → 0, 100% → 1', R.rate == null ? '—' : fx(Math.max(0, 2 * R.rate - 1))],
      ['치우침 · 평균 차이', '치우침 = 개념 평균 (C − P*)(양수 = 높여 봄) · 평균 차이 = 평균 |C − P*| · 자기 판단 정확도 = 1 − 평균 차이', sgn(M.bias) + ' · ' + fx(M.mad)],
      ['구별력 γ · ρ', '개념 사이 C와 p의 Goodman–Kruskal γ · Spearman ρ (개념 10개 이상일 때만)', M.gamma == null ? '보류' : 'γ ' + fx(M.gamma) + ' · ρ ' + fx(M.rho)],
      ['확신 오류 비율', '(C ≥ 0.75 이면서 기록 약함인 개념 수) / (C ≥ 0.75 인 개념 수)', pct(M.hce)],
      ['재시 교정률', '첫 시도에 틀린 개념 중 다음 재시(다른 문장)에서 모두 맞힌 비율(재시 서명으로 셈)', pct(R.retakeRate)],
      ['후기 유지율', '그 개념이 처음 나온 회차 뒤 누적 시험에서의 첫 시도 정답률', pct(R.reviewRate) + '<span class="st">지난 단원 전체</span>'],
      ['반복 막힘', '3회차 이상 묻고 절반 이상 틀린 개념(성적표 고질 규칙). 뒤로 계속 맞히면 «해소»', (R.chronic || []).length + '개']
    ].map(function (x) { return '<tr><td class="lb">' + x[0] + '</td><td>' + x[1] + '</td><td class="num">' + x[2] + '</td></tr>'; }).join('') + '</tbody></table>'));
    fa.push(h3('B. 판정 구간(제안값 — 문헌 표준 아님)'));
    fa.push(el('<table class="sp-tbl sp-split-rows"><thead><tr><th scope="col" style="width:130px">무엇</th><th scope="col">구간</th></tr></thead><tbody>' + [
      ['기록 강함', '첫 시도 ≥ 85% 이고, 후기 문항이 2개 이상이면 후기 유지율도 ≥ 85%, 반복 막힘(미해소) 아님'],
      ['기록 약함', '첫 시도 < 70%, 또는 반복 막힘(미해소), 또는 틀린 회차 2번 이상에서 재시 교정률 < 50%'],
      ['기록 적음 · 잠정 · 직관 신호', '물은 문항 3개 미만은 판정 보류, 8개 미만은 «잠정» · 신호 = 오개념 문장 1·2(동의) 또는 맞는 직관 4·5(부정), 3은 «애매»'],
      ['자신감 높음 · 낮음', '높음: «매우 그렇다», 또는 «그렇다»이면서 학생 안 표준점수 z ≥ +0.5(응답 습관 보정) · 낮음: «보통» 이하, 또는 z ≤ −1.0 인 «그렇다» · «보통»이 절반을 넘으면 z ±0.5 우선'],
      ['갈래 차례', '남은 오개념(신호 + 약함) → 과신(높음 + 약함) → 보강(중간·낮음 + 약함) → 숨은 실력(낮음 + 강함) → 강점(높음·중간 + 강함) → 관찰(기록 중간·적음, 신호 + 강함은 «잠복 직관»)'],
      ['보정 지표', 'Bias > +0.15 높여 봄, < −0.15 낮춰 봄 · 평균 차이 < 0.15 좋음, ≤ 0.25 보통 · γ ≥ 0.5 좋음, ≥ 0.2 보통 · 확신 오류 < 10% 신뢰할 만함, ≤ 25% 주의']
    ].map(function (x) { return '<tr><td class="lb">' + x[0] + '</td><td>' + x[1] + '</td></tr>'; }).join('') + '</tbody></table>'));
    fa.push(h3('C. 응답 품질 점검 결과'));
    var Q = A.quality;
    fa.push(el(A.hasSurvey ? '<div class="sp-grid3" style="gap:4px 6px">' + [
      ['직선 응답', '', '표준편차 ' + fx(Q.sd) + ' · 연속 ' + Q.maxRun, Q.flags.indexOf('straight') >= 0],
      ['묵종', '', '동의율 ' + pct(Q.agreeRate), Q.flags.indexOf('acquiescence') >= 0],
      ['맞는 직관 부정', '', '평균 ' + fx(Q.aTrue, 1), Q.flags.indexOf('reversed') >= 0],
      ['중간점 쏠림', '', '«보통» ' + pct(Q.midRate), Q.flags.indexOf('midpoint') >= 0],
      ['빠른 응답', '', Q.ms ? Math.round(Q.ms / 60000) + '분' : '시간 기록 없음', Q.flags.indexOf('fast') >= 0],
      ['빈 응답', '', Q.missing + '문항', Q.flags.indexOf('incomplete') >= 0]
    ].map(function (x) { return '<div class="sp-card" style="margin:0;padding:3px 8px;line-height:1.4;border-left:3px solid ' + (x[3] ? '#C2562F' : '#1F7A4D') + ';font-size:9pt"><b>' + x[0] + '</b> <span style="font-weight:800;color:' + (x[3] ? '#A6441F' : '#17663F') + '">' + (x[3] ? '걸림' : '통과') + '</span> <span style="color:#4A5651;font-size:8.8pt">· ' + x[2] + '</span></div>'; }).join('') + '</div>' +
      '<p class="sp-cap">기준 — 직선: 표준편차 < 0.5 또는 같은 값 15연속 · 묵종: 직관 동의율 > 80%이면서 오개념·맞는 직관 모두 동의 · 맞는 직관 부정: 평균 ≥ 4 · 중간점: «보통» > 50% · 빠른 응답: 5분 안 · 빈 응답: 10문항 초과. ' + (Q.flags.length ? '걸린 항목에 따라 ' + qualityText(Q) : '모두 통과해 설문 응답을 그대로 판정에 썼습니다.') + '</p>' : '<div class="sp-card">설문 응답이 없어 점검하지 않았습니다.</div>'));
    fa.push(h3('D. 방법상 한계'));
    fa.push(el('<ul class="sp-ul">' + [
      ('설문은 ' + RW() + ' 결과를 받은 <b>뒤에</b> 했습니다 — 자신감에는 기억하는 기록이 섞여 있습니다. 자신감·직관은 개념마다 <b>한 문항</b>이라 «진단»이 아니라 «신호»라고 씁니다.'),
      '개념마다 물은 문항 수가 다릅니다(적게는 1~2개). 8개 미만은 «잠정», 3개 미만은 판정을 미뤘습니다.',
      '같은 개념의 재시 문장이 비슷하면 표면 단서로 맞혔을 가능성이 남습니다. 구간 수치는 제안값이며 첫 학기 자료의 분포를 보고 다시 맞춥니다.',
      '«성취가 낮을수록 과신한다»는 집단 그래프는 무작위 자료에서도 비슷하게 나와 개인 해석의 근거로 쓰지 않았습니다. 모의시험·학습진단은 선생님이 확인한 짝만 붙였습니다.'
    ].map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>'));
    fa.push(h3('E. 참고문헌'));
    var refBox = document.createElement('div'); refBox.className = 'sp-split-kids sp-refgrid';
    REFS.forEach(function (r, i) { refBox.appendChild(el('<span>[' + (i + 1) + '] ' + esc(r[0].replace('https://doi.org/', 'doi:')) + ' <span class="lv">· ' + esc(r[1]) + '</span></span>', 'sp-ref')); });
    fa.push(refBox);
    flows.push({ id: 'sa', blocks: fa });
    return flows;
  }

  function extMsg(st, what) {
    if (st === 'off') return '<span class="sp-dim">' + esc(what) + ' 기록은 선생님 화면(관리자 모드)에서만 이어 붙입니다. 이 보고서에는 DT 기록만 실었습니다.</span>';
    if (st === 'fail' || st === 'locked') return '<b>' + esc(what) + ' 자료를 불러오지 못했습니다.</b> <span class="sp-dim">' + (st === 'locked' ? '관리 열쇠가 필요합니다.' : '연결이 잠시 끊겼을 수 있습니다.') + ' 나머지 절은 그대로 그렸습니다.</span>';
    return '<span class="sp-dim">' + esc(what) + ' 자료 없음 — 이 학생과 짝지은 기록이 없습니다.</span>';
  }
  function depthWord(d) {
    var e = d.easyN ? d.easyOk / d.easyN : null, h = d.hardN ? d.hardOk / d.hardN : null;
    if (h != null && h >= 0.6) return '또래가 어려워한 문항까지 풂';
    if (e != null && e >= 0.7) return '기본 탄탄 · 응용이 다음 과제';
    if (e != null && e < 0.55) return '쉬운 문항 정확도부터';
    return '기본 갖춤 · 어려운 문항 적응 중';
  }
  function spark(rounds) {
    var W = 150, H = 26, n = rounds.length; if (!n) return '';
    var lo = 0.4, ys = function (p) { return H - 3 - (Math.max(lo, p) - lo) / (1 - lo) * (H - 6); };
    var d = rounds.map(function (r, i) { return (i ? 'L' : 'M') + (n === 1 ? W / 2 : 3 + i * (W - 6) / (n - 1)).toFixed(1) + ' ' + ys(r.rate).toFixed(1); }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:110px;height:20px;display:block" aria-hidden="true"><line x1="0" x2="' + W + '" y1="' + ys(0.8) + '" y2="' + ys(0.8) + '" stroke="#C9A962" stroke-dasharray="3 3"/><path d="' + d + '" fill="none" stroke="#0E5A4C" stroke-width="2"/></svg>';
  }
  function heat(c, total) {
    if (!c) return '<td class="c sp-dim">—</td>';
    var p = c.p, few = c.n < 5;
    var bg = p == null ? '#F3F4F2' : p >= 0.9 ? '#CFE7DA' : p >= 0.8 ? '#E2F0E8' : p >= 0.7 ? '#F3F1E4' : p >= 0.6 ? '#F8E6D8' : '#F3D5C8';
    var fg = p == null ? '#5E6A65' : p >= 0.8 ? '#124F31' : p >= 0.7 ? '#5A4A12' : '#7A3418';
    return '<td class="c" style="background:' + bg + ';color:' + fg + ';font-weight:' + (total ? 800 : 700) + (few ? ';opacity:.6' : '') + ';white-space:nowrap">' + pct(p) + ' <span style="font-weight:500;font-size:8.8pt;opacity:.85">· ' + c.n + '</span></td>';
  }
  function twoBar(a, b) {
    function one(v, col) { return '<div style="height:6px;background:#EFEDE6;border-radius:3px;margin:2px 0;position:relative"><i style="position:absolute;left:0;top:0;bottom:0;border-radius:3px;width:' + (v == null ? 0 : Math.max(2, Math.min(100, v))) + '%;background:' + col + '"></i></div>'; }
    return one(a, '#C9A962') + one(b, '#0E5A4C');
  }
  function kmText(KC) {
    var up = KC.rows.filter(function (r) { return r.diff != null && (r.negative ? r.diff <= -8 : r.diff >= 8); }), down = KC.rows.filter(function (r) { return r.diff != null && (r.negative ? r.diff >= 8 : r.diff <= -8); });
    var t = '<b>해석</b> — ';
    if (up.length) t += up.map(function (r) { return '«' + esc(r.name) + '»'; }).join(', ') + '이(가) 그때보다 좋아진 방향입니다. ';
    if (down.length) t += down.map(function (r) { return '«' + esc(r.name) + '»'; }).join(', ') + ('은(는) 그때보다 낮게 답했습니다 — ' + RW() + ' 동안 어려워진 단원과 함께 겪는 자연스러운 흔들림일 수 있어, 숫자보다 그 이유를 함께 이야기해 보면 좋겠습니다. ');
    if (!up.length && !down.length) t += '그때와 지금이 크게 다르지 않습니다. 마음가짐이 안정적으로 이어지고 있습니다. ';
    if (KC.miscN) t += '그때 학습진단에서 고른 오개념 ' + KC.miscN + '개는 12절에 이번 기록과 함께 묶어 두었습니다.';
    return t;
  }
  function timelineSVG(A) {
    var tl = A.timeline || [], W = 680, H = 230, x0 = 46, x1 = 664, yT = 18, yB = 176;
    var groups = []; tl.forEach(function (t) { if (groups.indexOf(t.group) < 0) groups.push(t.group); });
    var COLS = ['#0E5A4C', '#2F6FA3', '#8E3B5A', '#B8892B', '#C2562F', '#5E6A65', '#1F7A4D'];
    var ts = tl.map(function (t) { var x = t.date ? new Date(t.date).getTime() : NaN; return isNaN(x) ? null : x; });
    var known = ts.filter(function (x) { return x != null; }), useT = known.length >= Math.max(2, tl.length * 0.6);
    var tmin = Math.min.apply(null, known), tmax = Math.max.apply(null, known);
    var xs = function (i) { if (useT && ts[i] != null && tmax > tmin) return x0 + (ts[i] - tmin) / (tmax - tmin) * (x1 - x0); return x0 + (tl.length === 1 ? 0.5 : i / (tl.length - 1)) * (x1 - x0); };
    var lo = 0.3, ys = function (p) { return yB - (Math.max(lo, Math.min(1, p)) - lo) / (1 - lo) * (yB - yT); };
    var g = '<svg class="sp-fig" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="지금까지의 모든 시험" ' + FONT + '>';
    [0.4, 0.6, 0.8, 1].forEach(function (p) { g += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + ys(p) + '" y2="' + ys(p) + '" stroke="#ECE9E1"/><text x="' + (x0 - 6) + '" y="' + (ys(p) + 4) + '" font-size="11" text-anchor="end" fill="#5E6A65">' + Math.round(p * 100) + '%</text>'; });
    if (useT && tmax > tmin) {
      var d0 = new Date(tmin), d1 = new Date(tmax);
      var firstLab = true;
      for (var m = new Date(d0.getFullYear(), d0.getMonth(), 1); m <= d1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
        var x = x0 + (m.getTime() - tmin) / (tmax - tmin) * (x1 - x0); if (x < x0) continue;
        g += '<line x1="' + x + '" x2="' + x + '" y1="' + yT + '" y2="' + (yB + 4) + '" stroke="#F1EFE8"/><text x="' + x + '" y="' + (yB + 16) + '" font-size="10.5" text-anchor="middle" fill="#4A5651">' + (m.getMonth() === 0 || firstLab ? m.getFullYear() + '. ' : '') + (m.getMonth() + 1) + '월</text>';
        firstLab = false;
      }
    }
    groups.forEach(function (gr, gi) {
      var pts = []; tl.forEach(function (t, i) { if (t.group === gr && t.rate != null) pts.push([xs(i), ys(t.rate), t]); });
      var col = COLS[gi % COLS.length];
      if (pts.length > 1) g += '<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('') + '" fill="none" stroke="' + col + '" stroke-width="1.6" opacity=".55"/>';
      pts.forEach(function (p) { g += p[2].source === 'exam' ? '<rect x="' + (p[0] - 5) + '" y="' + (p[1] - 5) + '" width="10" height="10" transform="rotate(45 ' + p[0] + ' ' + p[1] + ')" fill="' + col + '" stroke="#fff"/>' : '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.8" fill="' + col + '" stroke="#fff"/>'; });
    });
    var lx = x0;
    groups.forEach(function (gr, gi) { var col = COLS[gi % COLS.length], ex = tl.some(function (t) { return t.group === gr && t.source === 'exam'; }); g += (ex ? '<rect x="' + lx + '" y="' + (H - 18) + '" width="9" height="9" transform="rotate(45 ' + (lx + 4.5) + ' ' + (H - 13.5) + ')" fill="' + col + '"/>' : '<circle cx="' + (lx + 4.5) + '" cy="' + (H - 13.5) + '" r="4.5" fill="' + col + '"/>') + '<text x="' + (lx + 13) + '" y="' + (H - 9) + '" font-size="11" fill="#1F2A26" font-weight="700">' + esc(gr) + '</text>'; lx += 26 + gr.length * 11; });
    return g + '</svg>';
  }
  function kpi(t, v, d, b, inv) {
    return '<div class="sp-kpi"><div class="t">' + esc(t) + '</div><div class="v">' + (v == null ? '—' : Math.round(v * 100) + '<small>%</small>') + '</div><div class="d">' + esc(d) + '</div>' +
      (inv ? (b === 'good' ? '<span class="sp-band good">신뢰할 만함</span>' : b === 'ok' ? '<span class="sp-band ok">주의</span>' : b === 'low' ? '<span class="sp-band low">자신감 점검</span>' : '<span class="sp-band na">계산 보류</span>') : band(b)) + '</div>';
  }
  function mini(t, v) { return '<div class="sp-card" style="text-align:center;padding:8px"><div style="font-size:8.8pt;color:#5E6A65;font-weight:700">' + esc(t) + '</div><div style="font-size:13pt;font-weight:800;color:#0E5A4C;font-family:DejaVu Sans,sans-serif">' + v + '</div></div>'; }
  function barRow(nm, v, max, color, label, w) {
    return '<div class="sp-bar"><div class="nm"' + (w ? ' style="width:' + w + 'px"' : '') + '>' + esc(nm) + '</div><div class="tr"><i style="width:' + (v == null ? 0 : (v - (max === 5 ? 1 : 0)) / (max === 5 ? 4 : max) * 100) + '%;background:' + color + '"></i></div><div class="vv">' + esc(label) + '</div></div>';
  }
  function miniBar(a, neg) { return '<div class="sp-bar" style="margin:0"><div class="tr"><i style="width:' + ((a - 1) / 4 * 100) + '%;background:' + (neg ? '#C2562F' : '#0E5A4C') + '"></i></div><div class="vv" style="width:30px">' + a + '</div></div>'; }
  function sigText(r) {
    var s = r.signal;
    if (s === 'sig') return '<span class="sp-chip" style="background:#F6E9EF;color:#7A2E4B;border-color:#8E3B5A55">신호</span>';
    if (s === 'shaky') return '<span class="sp-chip" style="background:#FAF2DF;color:#7F6118;border-color:#B8892B55">애매</span>';
    if (s === 'hold') return '<span class="sp-dim">유보</span>';
    if (s === 'none') return '<span class="sp-dim">없음</span>';
    return '<span class="sp-dim">—</span>';
  }
  function qualityText(Q) {
    var a = [];
    if (Q.flags.indexOf('straight') >= 0) a.push('같은 번호가 길게 이어지거나 응답이 거의 한 값이라, 자신감에 기댄 판정(과신·숨은 실력)은 «참고»로 낮췄습니다.');
    if (Q.flags.indexOf('acquiescence') >= 0) a.push('직관 문장에 거의 모두 «그렇다»를 골라, 직관 신호의 해석을 미뤘습니다.');
    if (Q.flags.indexOf('reversed') >= 0) a.push('맞는 직관 문장도 부정해, 문장을 거꾸로 읽었을 가능성이 있어 직관 신호의 해석을 미뤘습니다.');
    if (Q.flags.indexOf('midpoint') >= 0) a.push('«보통이다»가 절반을 넘어, 절대 기준 대신 이 학생 안에서의 상대적 높낮이로 자신감을 판정했습니다.');
    if (Q.flags.indexOf('fast') >= 0) a.push('응답 시간이 매우 짧았습니다.');
    if (Q.flags.indexOf('incomplete') >= 0) a.push('빈 응답이 많아 일부 개념은 기록만으로 판정했습니다.');
    return a.join(' ');
  }
  function biasText(M) {
    if (M.bias == null) return '<span class="sp-dim">맞댈 개념이 부족해 계산하지 않았습니다.</span>';
    if (M.biasBand === 'over') return '평균 치우침 ' + sgn(M.bias) + ' — 몇몇 개념은 «자신 있다»고 느끼지만 기록상 아직 흔들립니다. 대개 «여러 번 봐서 익숙한 느낌»을 «안다»로 받아들일 때 생기는 차이이며 아주 흔합니다. 이 개념들은 읽기보다 <b>직접 맞혀 보는 방식</b>으로 확인하세요.';
    if (M.biasBand === 'under') return '평균 치우침 ' + sgn(M.bias) + ' — 실제 기록은 좋은데 스스로는 자신 없다고 답한 개념이 여럿입니다. 실력이 부족한 것이 아니라 <b>자기 실력에 대한 믿음이 기록을 아직 따라오지 못한 상태</b>입니다.';
    return '평균 치우침 ' + sgn(M.bias) + ' — 스스로 «자신 있다»고 한 개념과 실제로 잘한 개념이 대체로 맞습니다. 혼자 공부할 때 가장 큰 힘이 되는 능력입니다.';
  }
  function gammaText(M) {
    if (M.gamma == null) return '<span class="sp-dim">개념 수가 적거나 응답이 한쪽에 몰려 계산을 미뤘습니다(개념 10개 이상 · 자신감과 기록이 모두 흩어져 있어야 계산).</span>';
    var t = 'γ = ' + fx(M.gamma) + ' · ρ = ' + fx(M.rho) + ' ' + band(M.gammaBand) + '<br>';
    if (M.gammaBand === 'good') t += '자신 있는 개념일수록 실제로도 잘 맞혔습니다. 무엇을 알고 무엇을 모르는지 잘 가려내고 있습니다.';
    else if (M.gammaBand === 'ok') t += '자신감의 높낮이가 기록과 어느 정도 같은 방향입니다. 공부를 마칠 때 «나오면 맞힐까?»를 예측하고 확인하면 더 선명해집니다.';
    else t += '자신감이 높은 개념과 낮은 개념이 실제 기록과 별로 상관이 없습니다. 공부를 마칠 때마다 «이건 시험에 나오면 맞힐까?»를 적고 맞춰 보는 습관을 권합니다.';
    return t;
  }
  function hceText(M) {
    if (M.hce == null) return '<span class="sp-dim">«그렇다» 이상으로 자신 있다고 한 개념이 없어 계산하지 않았습니다.</span>';
    var t = '자신 있다고 한 ' + M.hceN + '개 가운데 <b>' + M.hceWeak + '개(' + pct(M.hce) + ')</b>가 기록상 흔들렸습니다. ';
    if (M.hceBand === 'good') t += '자신감을 믿어도 되는 수준입니다.';
    else if (M.hceBand === 'ok') t += '대체로 믿을 만하지만, 흔들린 개념은 한 번 확인해 두세요.';
    else t += '«자신 있다»는 느낌을 한 번 더 확인하는 습관이 필요합니다. 연구에 따르면 확신하며 틀린 곳이 오히려 가장 빨리 고쳐집니다.';
    return t;
  }
  function unitText(A) {
    var ax = A.axes.filter(function (a) { return a.p != null; });
    if (!ax.length) return '시험 기록이 없어 단원별 기록을 그리지 못했습니다. 자신감(금색 점선)만 표시했습니다.';
    var best = ax.slice().sort(function (a, b) { return b.p - a.p; })[0], low = ax.slice().sort(function (a, b) { return a.p - b.p; })[0];
    var gaps = ax.filter(function (a) { return a.conf != null; }).map(function (a) { return [a, a.conf - a.pStar]; });
    var over = gaps.filter(function (x) { return x[1] > 0.15; }).sort(function (a, b) { return b[1] - a[1]; })[0], under = gaps.filter(function (x) { return x[1] < -0.15; }).sort(function (a, b) { return a[1] - b[1]; })[0];
    var t = '<b>해석</b> — 기록이 가장 단단한 단원은 «' + esc(best.name) + '»(' + pct(best.p) + '), 다음에 다질 단원은 «' + esc(low.name) + '»(' + pct(low.p) + ')입니다. ';
    if (over) t += '«' + esc(over[0].name) + '»은 자신감이 기록보다 높게 그려졌습니다 — 이 단원은 읽기보다 직접 맞혀 보며 확인하세요. ';
    if (under) t += '«' + esc(under[0].name) + '»은 기록이 자신감보다 높습니다 — 생각보다 잘 알고 있는 단원입니다. ';
    if (!over && !under) t += '모든 단원에서 자신감과 기록이 크게 벌어지지 않았습니다.';
    return t;
  }
  function strategyHTML(st) {
    if (st.index == null) return '<span class="sp-dim">응답이 부족해 계산하지 않았습니다.</span>';
    return barRow('꺼내기·간격·고쳐 쓰기', st.retrieve, 5, '#0E5A4C', fx(st.retrieve, 1)) + barRow('다시 읽기·필기', st.reread, 5, '#C9A962', fx(st.reread, 1)) +
      '<div style="font-size:9.2pt;margin-top:3px">지수 <b style="color:' + (st.index >= 0 ? '#17663F' : '#A6441F') + '">' + sgn(st.index, 1) + '</b> — ' + (st.index >= 0.5 ? '효과가 큰 «꺼내 보는» 공부가 우세합니다.' : st.index >= 0 ? '두 방식이 비슷합니다. 꺼내 보는 쪽을 조금 더 늘려 보세요.' : '다시 읽기 쪽이 더 큽니다. 읽으면 익숙해지지만 오래 남는 것은 꺼내 본 쪽입니다.') + '</div>';
  }
  function habitPairs(A, subs) {
    var R = A.record, M = A.metrics, out = [];
    var e = subs.efficacy.avg, b = subs.burden.avg, mo = subs.monitor.avg;
    out.push(['효능감 × 기록', '효능감 ' + fx(e, 1) + ' · 첫 시도 ' + pct(R.rate),
      e == null || R.rate == null ? '둘 중 하나가 비어 있습니다.' : e >= 3.5 && R.rate >= 0.8 ? '«화학은 해 볼 만하다»는 느낌이 쌓은 기록과 잘 맞습니다. 자신감은 확인된 성공 경험에서 자랍니다.' : e < 3 && R.rate >= 0.8 ? '기록은 좋은데 효능감이 아직 낮습니다. 이 보고서의 숫자 자체가 «준비하면 해낸다»는 증거입니다.' : e >= 3.5 ? '자신감은 장점입니다. 점검 습관을 더하면 기록이 따라옵니다.' : '작은 성공을 자주 확인하는 것이 먼저입니다 — 숨은 실력 목록부터 보세요.']);
    out.push(['시험 부담 × 기록 안정', '부담 ' + fx(b, 1) + ' · 재시 ' + R.retake.attempts + '회',
      b == null ? '응답이 없습니다.' : b >= 3.5 && (R.rate || 0) >= 0.8 ? '시험이 부담스러웠다고 답했지만 기록은 안정적입니다. 긴장은 실력이 없어서가 아니라 «결과를 통제할 수 없다»는 느낌에서 오는 경우가 많습니다.' : b >= 3.5 ? '부담이 컸고 기록도 흔들린 곳이 있습니다. 학습 지원과 마음의 지원을 함께 하면 좋겠습니다.' : '시험을 크게 부담스러워하지 않았습니다. 매주 시험이 «공부하는 방법»으로 자리 잡았다는 신호입니다.']);
    out.push(['점검 습관 × 자기 판단', '점검 ' + fx(mo, 1) + ' · 정확도 ' + pct(M.accuracy),
      mo == null || M.accuracy == null ? '둘 중 하나가 비어 있습니다.' : mo >= 3.5 && M.accuracy >= 0.75 ? '스스로 점검한다고 답했고, 실제로 자기 판단도 정확합니다.' : mo >= 3.5 ? '점검한다고 느끼지만 판단과 기록 사이에 차이가 있습니다. «맞힐까?» 예측을 적고 확인하는 방식으로 점검을 구체화해 보세요.' : '점검 습관은 다음 단계입니다. 공부를 마칠 때 무엇을 맞힐 수 있을지 확인하는 3분이면 충분합니다.']);
    return out;
  }
  function habitText(A, subs) {
    var M = A.metrics, e = subs.efficacy.avg, ph = ['plan', 'monitor', 'reflect'].map(function (k) { return subs[k]; });
    var lo = ph.filter(function (s) { return s.avg != null; }).sort(function (a, b) { return a.avg - b.avg; })[0], hi = ph.filter(function (s) { return s.avg != null; }).sort(function (a, b) { return b.avg - a.avg; })[0];
    var t = '<b>해석</b> — ';
    if (hi && lo && hi !== lo) t += '세 단계 가운데 «' + esc(hi.name) + '»이 가장 단단하고 «' + esc(lo.name) + '»이 다음 단계입니다. ';
    if (e != null && M.biasBand === 'over' && e >= 3.5) t += '효능감이 높고 자신감이 기록보다 앞서 있습니다 — 자신감은 장점이니, 점검 습관만 보태면 됩니다. ';
    else if (e != null && M.biasBand === 'under' && e < 3.5) t += '효능감이 낮고 기록보다 스스로를 낮춰 보는 편입니다 — 기록으로 확인된 성공을 하나씩 짚어 효능감을 되찾는 것이 먼저입니다(Talsma 외, 2018). ';
    t += '습관 점수는 다른 학생과 비교하지 않고, 이 학생 안에서의 상대적인 강약으로만 읽습니다.';
    return t;
  }
  function crossText(cx) {
    var base = cx.base == null ? '' : ' (전체 ' + pct(cx.base) + ')';
    if (cx.kind === 'absWord') return '「항상·모든」 문장 ' + pct(cx.rate) + ' · ' + cx.n + '문항' + base;
    if (cx.kind === 'numeric') return '숫자가 든 문장 ' + pct(cx.rate) + ' · ' + cx.n + '문항' + base;
    if (cx.kind === 'long') return '긴 문장 ' + pct(cx.rate) + ' · ' + cx.n + '문항' + base;
    if (cx.kind === 'review') return '지난 단원 문항 ' + pct(cx.rate) + ' · ' + cx.n + '문항' + (cx.base == null ? '' : ' (새 단원 ' + pct(cx.base) + ')');
    if (cx.kind === 'axis') return cx.axes.map(function (id) { return (SA.AXES.filter(function (a) { return a.id === id; })[0] || {}).name; }).join('·') + ' 문항 ' + pct(cx.rate) + base;
    return '';
  }
  function priorityAct(r) {
    if (r.verdict === 'remain') return '6절 카드로 «이런 생각 → 실제로는»을 비교하고, 확인 문장 세 개를 맞힌 뒤 일주일 뒤 다시 맞혀 봅니다.';
    if (r.verdict === 'over') return '정리 노트를 읽기 전에 먼저 O/X 문장 5개를 풀어 봅니다. 틀린 문장은 맞는 문장으로 고쳐 쓰고, 1주 뒤 다시 꺼냅니다.';
    return '한 줄 정리를 소리 내어 읽고, 덮은 뒤 빈 종이에 다시 써 봅니다. 3일·1주·1달 간격으로 세 번 꺼냅니다.';
  }
  function praise(A) {
    var R = A.record, out = [];
    var fixed = A.rows.filter(function (r) { return r.rec.retake.fixed > 0; }).sort(function (a, b) { return b.rec.retake.fixed - a.rec.retake.fixed; })[0];
    if (fixed) out.push('「' + labelOf(fixed) + '」' + josa(labelOf(fixed), '을', '를').slice(-1) + ' 처음엔 틀렸는데, 다른 문장으로 다시 물었을 때 바로잡았구나. 어떻게 고쳤는지 알려 줄래?');
    var res = (R.chronic || []).filter(function (c) { return c.resolvedAt; })[0];
    if (res) out.push('「' + res.m + '」' + josa(res.m, '은', '는').slice(-1) + ' 여러 번 막혔는데 ' + res.resolvedAt + '회부터는 계속 맞혔네. 끝까지 붙잡은 게 보여.');
    var n = R.rounds.filter(function (r) { return r.rate != null; }).length;
    if (n >= 12) out.push(n + '번의 누적 시험을 끝까지 치러 냈구나. 매주 앞 내용까지 다시 꺼낸 그 꾸준함이 이 기록을 만들었어.');
    if (A.hidden.length) out.push('스스로는 자신 없다고 했지만 「' + labelOf(A.hidden[0]) + '」' + josa(labelOf(A.hidden[0]), '은', '는').slice(-1) + ' 꾸준히 맞혔어. 이건 이미 네 것이야.');
    if (!out.length) out.push('설문 100문항에 끝까지 솔직하게 답해 줘서, 다음에 무엇을 하면 좋을지 알게 됐어. 고마워.');
    return out.slice(0, 4);
  }
  function questions(A) {
    var out = [];
    var r = A.remain[0];
    if (r) out.push('「' + short(r.s, 40) + '」 — 이 문장, 처음에 왜 그렇게 느꼈어?');
    var o = A.rows.filter(function (x) { return x.verdict === 'over'; })[0];
    if (o) out.push('「' + labelOf(o) + '」' + josa(labelOf(o), '은', '는').slice(-1) + ' 자신 있다고 했는데, 문제로 한번 같이 확인해 볼까?');
    out.push('이번 학기에 가장 많이 고친 개념은 뭐야? 어떻게 고쳤어?');
    out.push('공부를 마칠 때 «이건 시험에 나오면 맞힐까?»를 어떻게 확인해?');
    out.push('다음 과정에서 선생님께 더 도움받고 싶은 곳은 어디야?');
    return out.slice(0, 4);
  }

  /* ══════════════════ 쪽 나눔 ══════════════════ */
  function newPage(ctx, cover) {
    var pg = document.createElement('section'); pg.className = 'sp-page' + (cover ? ' sp-cover' : '');
    if (!cover) {
      pg.innerHTML = '<div class="sp-run-top"><div class="l"><img alt="" src="' + ctx.logo + '"><span data-sp-brand>' + BRAND + '</span></div><div class="r">' + esc(TITLE_()) + (ctx.name ? ' · ' + esc(ctx.name) : '') + '</div></div>' +
        '<div class="sp-body"></div><div class="sp-run-bot"><b data-sp-brand>' + BRAND + ('</b><span>설문은 하루의 느낌, 기록은 ' + RW() + '의 행동입니다</span><span class="pn"></span></div>');
    } else pg.innerHTML = '<div class="sp-body"></div>';
    ctx.host.appendChild(pg);
    return pg.querySelector('.sp-body');
  }
  function over(body) { return body.scrollHeight > body.clientHeight + 1; }
  function used(body) { var l = body.lastElementChild; return l ? l.offsetTop + l.offsetHeight : 0; }

  function paginate(ctx, flows) {
    var pages = [], tocMap = {};
    var body = null;
    flows.forEach(function (fl) {
      /* 표지·읽는 법·1절·부모님께·부록은 늘 새 쪽. 나머지 절은 앞 쪽이 70% 미만으로 찼으면 이어 붙인다 —
         «자료 없음» 한 줄짜리 절이 한 쪽을 통째로 차지하지 않게. 머리만 쪽 끝에 남으면 place() 가 함께 넘긴다. */
      var isFresh = fl.cover || /^(s0|s1|sp|sa)$/.test(fl.id || '');
      if (isFresh || !(body && used(body) < body.clientHeight * 0.7)) { body = newPage(ctx, fl.cover); pages.push(body); }
      else { var gap = document.createElement('div'); gap.style.height = '10px'; body.appendChild(gap); }
      if (fl.id) tocMap[fl.id] = pages.length;
      fl.blocks.forEach(function (b) { place(b); });
      function fresh() { body = newPage(ctx, false); pages.push(body); return body; }
      function place(b) {
        body.appendChild(b);
        if (!over(body)) return;
        body.removeChild(b);
        /* 쪼갤 수 있는 덩어리는 이 쪽에 들어가는 만큼 넣는다 */
        if (b.classList.contains('sp-split-rows') || b.classList.contains('sp-split-kids')) { splitInto(b); return; }
        /* 머리(keep)가 쪽 끝에 홀로 남지 않게 함께 넘긴다 */
        var carry = [];
        while (body.lastElementChild && body.lastElementChild.classList.contains('sp-keep') && body.children.length > 1) carry.unshift(body.removeChild(body.lastElementChild));
        if (body.children.length) fresh();
        carry.forEach(function (c) { body.appendChild(c); });
        body.appendChild(b);
      }
      function splitInto(b) {
        var isRows = b.classList.contains('sp-split-rows');
        var src = isRows ? b.querySelector('tbody') : b;
        var kids = Array.prototype.slice.call(src.children);
        var shell = function (cont) {
          var c = b.cloneNode(true), box = isRows ? c.querySelector('tbody') : c;
          while (box.firstChild) box.removeChild(box.firstChild);
          if (cont) c.classList.add('cont');
          return { el: c, box: box };
        };
        var cur = shell(false); body.appendChild(cur.el);
        var placedHere = 0;
        kids.forEach(function (k) {
          cur.box.appendChild(k);
          if (over(body)) {
            cur.box.removeChild(k);
            /* 묶음 머리 줄(grp)이 쪽 끝에 홀로 남으면 같이 넘긴다 */
            var moved = [];
            while (isRows && cur.box.lastElementChild && cur.box.lastElementChild.classList.contains('grp') && cur.box.children.length > 1) moved.unshift(cur.box.removeChild(cur.box.lastElementChild));
            if (!cur.box.children.length) body.removeChild(cur.el);
            if (!cur.box.children.length && !placedHere) {
              /* 이 쪽에 한 줄도 못 넣었다 — 머리가 홀로 남으면 함께 넘긴다 */
              var carry = [];
              while (body.lastElementChild && body.lastElementChild.classList.contains('sp-keep') && body.children.length > 1) carry.unshift(body.removeChild(body.lastElementChild));
              if (body.children.length) fresh();
              carry.forEach(function (c) { body.appendChild(c); });
            } else fresh();
            cur = shell(placedHere > 0); body.appendChild(cur.el);
            moved.forEach(function (m) { cur.box.appendChild(m); });
            cur.box.appendChild(k);
            placedHere = 0;
          }
          placedHere++;
        });
      }
    });
    /* 쪽 번호와 차례 */
    var all = ctx.host.querySelectorAll('.sp-page'), N = all.length;
    Array.prototype.forEach.call(all, function (p, i) { var pn = p.querySelector('.pn'); if (pn) pn.textContent = (i + 1) + ' / ' + N; });
    Array.prototype.forEach.call(ctx.host.querySelectorAll('[data-toc]'), function (td) { var k = td.getAttribute('data-toc'); if (tocMap[k]) td.textContent = tocMap[k]; });
    return N;
  }

  /* ══════════════════ 바깥 문 ══════════════════ */
  /* opt: {host, doc, ans, rows, rounds, bank, name, school, year, surveyDate, ms, logo, today}
     host 안에 .sp-sheets 를 만들고 A4 쪽을 그린다. 돌려주는 것 {pages, A} */
  function render(opt) {
    injectCSS();
    var A = SA.analyzeAll({ doc: opt.doc, ans: opt.ans, rows: opt.rows, roundsByCourse: opt.roundsByCourse || { ch1: opt.rounds || {} }, ms: opt.ms, link: opt.link, external: opt.external });
    var wrap = document.createElement('div'); wrap.className = 'sp-root';
    var sheets = document.createElement('div'); sheets.className = 'sp-sheets';
    wrap.appendChild(sheets); opt.host.appendChild(wrap);
    var ctx = { A: A, host: sheets, bank: opt.bank || {}, name: opt.name || '', school: opt.school || '', year: opt.year || '',
      surveyDate: opt.surveyDate || '', logo: opt.logo || '', today: opt.today || new Date() };
    var flows = buildFlows(ctx);
    var n = paginate(ctx, flows);
    Array.prototype.forEach.call(document.querySelectorAll('.sp-page.sp-first'), function (p) { p.classList.remove('sp-first'); });
    var p1 = document.querySelector('.sp-page'); if (p1) p1.classList.add('sp-first');
    return { pages: n, A: A, el: wrap };
  }
  /* 휴대폰 화면에서는 종이를 줄여 보여 준다(인쇄에서는 원래 크기 — @media print 가 zoom 을 1로 되돌린다) */
  function fitScreen(root0) {
    var w = (root0 || document).querySelectorAll('.sp-sheets');
    var z = Math.min(1, (window.innerWidth - 16) / 812);
    Array.prototype.forEach.call(w, function (s) { s.style.zoom = z < 1 ? String(z) : ''; });
  }

  /* ── 공용 불러오기(정적 파일) ── */
  function getJSON(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
  var RCACHE = {};
  var MAXR = { ch1: 18, ch1s: 10, ch2: 18, gc: 10 };
  /* 그 학생 행에 있는 과목의 회차 파일 — 화학1은 단원 지도 때문에 18회 전부 */
  function loadRounds(rows) {
    var need = { ch1: {} };
    for (var i = 1; i <= 18; i++) need.ch1[i] = 1;
    (rows || []).forEach(function (r) { var c = String(r.course || ''); if (!MAXR[c] || !r.round) return; (need[c] || (need[c] = {}))[Number(r.round)] = 1; });
    var out = {}, jobs = [];
    Object.keys(need).forEach(function (c) {
      out[c] = {};
      Object.keys(need[c]).forEach(function (rd) {
        var key = c + '#' + rd;
        if (RCACHE[key] === undefined) RCACHE[key] = getJSON('appdata/round_' + c + '_' + String(rd).padStart(2, '0') + '.json').catch(function () { return null; });
        jobs.push(RCACHE[key].then(function (j) { if (j) out[c][rd] = j; }));
      });
    });
    return Promise.all(jobs).then(function () { return out; });
  }
  var COMMON = null;
  function loadCommon() {
    if (COMMON) return COMMON;
    COMMON = Promise.all([getJSON('appdata/survey_ch1.json'), getJSON('appdata/forms_bank.json').catch(function () { return {}; }), getJSON('courses/ch1s/link_ch1.json').catch(function () { return null; })])
      .then(function (x) { return { doc: x[0], bank: x[1], link: x[2] }; });
    return COMMON;
  }

  /* ── 그래프: SVG 문자열을 돌려주는 순수 함수(DOM 없음). Word 생성기가 이것으로 PNG 를 만든다. ──
       A 는 SurveyAnalysis.analyzeAll(…) 의 결과(그 파일 머리 주석의 모양).
       journey(A)      2절 18주 첫 시도 정답률 선 · 지난 단원 점선 · 재시 막대 · 단원 띠 · 막힘 해소 ◆   viewBox 680×330
       scatter(A)      3절 개념별 자신감(가로) × 앎 지수(세로) 산점도 — {svg, n}                        viewBox 400×392
       bias(b)         3절 치우침 눈금(A.metrics.bias)                                                    viewBox 300×64
       radar(A)        4절 단원 묶음 8축 — 기록(앎 지수) · 자신감                                         viewBox 560×360
       cycle(subs)     7절 자기조절 세 단계 고리(A.habits.subs)                                           viewBox 450×262
       timeline(A)     10절 모든 시험 시간표(A.timeline)                                                  viewBox 680×230
       spark(rounds)   10절 과목별 회차 추이 작은 선(A.courses[i].rounds)                                 viewBox 150×26
       categories(counts)  1절 여섯 갈래 개수(A.counts)                                                   viewBox 680×92
       hbars(items, opt)   가로 막대 묶음 [{label, value, min?, max, color?, text?}]                       viewBox (opt.width||680)×(24n+6)
       kmCompare(KC)   13절 그때 → 지금(A.kmCompare)
       글꼴은 font-family 속성(맑은 고딕 · Apple SD Gothic Neo · Noto Sans KR · WenQuanYi Zen Hei)으로 박혀 있다 —
       PNG 로 그릴 때 그 가운데 하나가 있어야 한글이 나온다. */
  /* 따로 떼어 PNG 로 그릴 수 있게 xmlns · width · height(viewBox 크기)를 붙인다. 화면 안 그림은 원래 함수를 그대로 쓴다. */
  function standalone(svg) {
    return String(svg).replace(/^<svg ([^>]*?)viewBox="0 0 ([\d.]+) ([\d.]+)"/, function (m, pre, w, h) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" ' + pre + 'viewBox="0 0 ' + w + ' ' + h + '"';
    });
  }
  function wrap(f) { return function () { var r = f.apply(null, arguments); if (r && typeof r === 'object' && r.svg) { r.svg = standalone(r.svg); return r; } return standalone(r); }; }
  var charts = { journey: wrap(journeySVG), scatter: wrap(scatterSVG), bias: wrap(biasSVG), radar: wrap(radarSVG), cycle: wrap(cycleSVG), timeline: wrap(timelineSVG), spark: wrap(spark),
    categories: wrap(categoriesSVG), hbars: wrap(hbarsSVG), kmCompare: wrap(kmCompareSVG) };
  /* 글 — 화면과 Word(survey_docx.js)가 같은 문장을 쓰도록 문장 만드는 함수를 그대로 내놓는다.
     돌려주는 것은 HTML 조각(<b>·<span class="sp-dim">·<br>)이다 — Word 쪽이 굵게·흐리게·줄바꿈으로 옮긴다. */
  var words = { summaryLines: summaryLines, adviceOf: adviceOf, labelOf: labelOf, readingOf: readingOf, checkForms: checkForms,
    biasText: biasText, gammaText: gammaText, hceText: hceText, unitText: unitText, habitPairs: habitPairs, habitText: habitText,
    crossText: crossText, priorityAct: priorityAct, praise: praise, questions: questions, kmText: kmText, depthWord: depthWord,
    qualityText: qualityText, extMsg: extMsg, md: md, pct: pct, fx: fx, sgn: sgn, ymd: ymd, josa: josa, short: short,
    WHY: WHY, CURE: CURE, REFS: REFS };
  root.SurveyRender = { render: render, fitScreen: fitScreen, loadRounds: loadRounds, loadCommon: loadCommon, getJSON: getJSON, charts: charts, words: words, BRAND: BRAND, TITLE: '화학1 돌아보기 진단 보고서', CAT: CAT, CAT_ORDER: CAT_ORDER, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SurveyRender;
})(typeof self !== 'undefined' ? self : this);
