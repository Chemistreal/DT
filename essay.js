/* ============================================================
   서술형 연습 — 나에게 맞춘 문항 고르기 (선생님 결정 2026-10-13)
   ------------------------------------------------------------
   각 회차 최종 성적표(화면 · Word)에 서술형 연습 5문항을 넣는다. 문항은
   appdata/essay_<과목>.json 은행에서 **그 학생이 이번 회차에 틀린 개념**으로 고른다.

   ⚠ 순수 함수만 둔다(DOM · 네트워크 · 저장소 없음). 성적표(report.html)가 회차 파일과
     시트 기록을 모아 넘기고, 여기서는 고르기만 한다 — chemengine.js 처럼 Node 에서
     require 해 같은 입력에 같은 답이 나오는지 잰다(tests/run.js «서술형 연습»).
   ⚠ Word(report_docx.js)는 **다시 고르지 않는다.** 화면이 고른 것(RPT.essay)을 그대로
     쓴다 — 두 곳이 따로 고르면 종이와 화면이 다른 문항을 내민다.

   고르는 차례
     1. 이번 회차 첫 응시에서 틀린 문항의 개념(문항 c · 중복 제거).
          (가) 되풀이되는 오개념(A.chronicMis 와 대표 이름이 같은 것) 먼저
          (나) 앞 회차 첫 응시에서도 틀렸던 개념
          (다) 문항 번호 순
     2. 다섯이 안 되면 — 앞 회차 첫 응시에서 틀렸고 그 뒤 맞힌 적이 없는 개념
        (재시에서 다시 물어 맞혔으면 고친 것이다) → 그래도 모자라면 이번 회차에서
        맞힌 심화(lvl 3) 문항의 개념(«한 단계 더»).
     3. 개념마다 문항 하나. 앞 회차들에서 그 개념을 틀린 횟수 % 문항 수 — 같은 학생이
        다음 회차에 또 틀리면 다른 각도의 문항이 나온다. 앞 회차 기록을 다 못 받아 셀 수
        없으면 학생키 + 회차 + 코드 해시로 고정한다(새로고침마다 바뀌면 쓰던 답이 엉뚱한
        문항에 붙는다).
     4. 은행에 없는 개념(문항 0개 · 뒤 회차 개념 포함)은 건너뛰고 다음 후보로. 최대 다섯.
   ============================================================ */
(function (root) {
  'use strict';

  var MAX = 5;

  /* FNV-1a — 성적표의 _strHash 와 같은 셈. 학생키를 저장 칸 이름에 넣을 때도 이것만 쓴다
     (이름을 그대로 남기지 않는다). */
  function hash(str) {
    var h = 2166136261; str = String(str == null ? '' : str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hashHex(str) { return ('0000000' + hash(str).toString(16)).slice(-8); }

  /* 은행 문항 하나가 화면에 설 수 있는가 — 질문·모범 답안이 비면 «답 확인» 뒤가 빈 상자다. */
  function validItem(it) {
    return !!(it && typeof it.q === 'string' && it.q.trim() && typeof it.a === 'string' && it.a.trim());
  }
  function bankItems(bank, c) {
    var C = bank && bank.concepts && bank.concepts[c];
    if (!C || !Array.isArray(C.items)) return [];
    return C.items.map(function (it, i) { return { it: it, i: i }; }).filter(function (x) { return validItem(x.it); });
  }

  /* 한 회차 첫 응시를 개념 단위로 편다.
       R = {round, items(회차 파일 jeongsi.items), answers(첫 응시 OX 문자열), wrongMis, retakes:[{cids, keys, answers}]}
     돌려주는 것: {ok(문항 단위로 셌나), known(물은 개념을 아나), wrong{c:{nos,mis,lvl}}, right{c:1}, order[c…], fixed{c:true|false}}
     ⚠ 답안과 문항은 **자리 번호**로 맞댄다(segJoin 과 같은 길) — 길이가 다르면 문항 단위로 세지 않는다.
       그때는 시트의 wrongMis(이름)로 개념만 가린다: 번호를 모르니 nos 는 비고, ok 는 false 다.
     정오 판정은 오개념 정리(buildSolutions)와 같다 — 답한 글자가 정답과 다르면 틀린 것(빈칸 포함). */
  function scanRound(R, canon) {
    var out = { ok: false, known: false, wrong: {}, right: {}, order: [], fixed: {}, nWrong: 0 };
    if (!R) return out;
    var items = Array.isArray(R.items) ? R.items : null, ans = typeof R.answers === 'string' ? R.answers : '';
    function put(c, no, it) {
      var w = out.wrong[c];
      if (!w) { w = out.wrong[c] = { nos: [], mis: it.mis || '', lvl: it.lvl }; out.order.push(c); }
      if (no != null) w.nos.push(no);
    }
    if (items && items.length) {
      out.known = true;
      if (ans.length === items.length) {
        out.ok = true;
        items.forEach(function (it, i) {
          if (!it || !it.c) return;
          if (ans.charAt(i) !== String(it.a)) { put(it.c, i + 1, it); out.nWrong++; }
        });
        items.forEach(function (it) { if (it && it.c && !out.wrong[it.c]) out.right[it.c] = 1; });
      } else {
        var wm = {}; (R.wrongMis || []).forEach(function (m) { wm[canon(m)] = 1; });
        items.forEach(function (it) { if (it && it.c && wm[canon(it.mis)]) { put(it.c, null, it); out.nWrong++; } });
      }
    }
    /* 재시가 그 개념을 다시 물었나 — 재시 행의 서명(retakeCids · retakeKeys · answers)으로 개념 단위로
       맞대고, 그 개념을 **마지막으로 물은 재시**의 결과가 판정이다(misRetakeStatus 와 같은 길). */
    (R.retakes || []).forEach(function (t) {
      var cids = String((t && t.cids) || ''), keys = String((t && t.keys) || ''), a = String((t && t.answers) || '');
      var arr = cids ? cids.split(',') : [];
      if (!arr.length || arr.length !== a.length || keys.length !== a.length) return;
      var okc = {};
      arr.forEach(function (c, k) { if (!c) return; var ok = a.charAt(k) === keys.charAt(k); if (okc[c] == null) okc[c] = true; if (!ok) okc[c] = false; });
      Object.keys(okc).forEach(function (c) { out.fixed[c] = okc[c]; });
    });
    return out;
  }

  /* 고르기.
       o = {bank, course, round, rounds:[R…](이 과목 · 이번 회차 포함), chronic:[오개념 이름…], canon(fn), seed(학생키), max}
     돌려주는 것: {course, round, sk(학생키 해시), items:[{no, c, m, kind:'wrong'|'carry'|'deep', why, nos, idx, item}]}
     · 이번 회차 문항을 못 받았으면 null(고를 근거가 없다 — 구역을 조용히 뺀다). */
  function pick(o) {
    o = o || {};
    var bank = o.bank, round = Number(o.round), max = o.max || MAX;
    var canon = typeof o.canon === 'function' ? o.canon : function (m) { return String(m == null ? '' : m).trim(); };
    if (!bank || !bank.concepts || !round) return null;
    var rounds = (o.rounds || []).filter(function (R) { return R && Number(R.round) <= round; })
      .slice().sort(function (a, b) { return Number(a.round) - Number(b.round); });
    var curR = rounds.filter(function (R) { return Number(R.round) === round; })[0];
    var cur = scanRound(curR, canon);
    if (!cur.known) return null;
    var prev = rounds.filter(function (R) { return Number(R.round) < round; }).map(function (R) { return { round: Number(R.round), s: scanRound(R, canon) }; });
    /* 앞 회차 기록을 다 받았을 때만 «틀린 횟수» 로 문항을 고른다 — 한 회차라도 빠지면 그 수는 거짓이다. */
    var countable = prev.every(function (p) { return p.s.ok; });
    var wrongAt = {};
    prev.forEach(function (p) { p.s.order.forEach(function (c) { (wrongAt[c] || (wrongAt[c] = [])).push(p.round); }); });
    var chronic = {}; (o.chronic || []).forEach(function (m) { var k = canon(m); if (k) chronic[k] = 1; });

    var used = {}, out = [], cand = [];
    var seed = String(o.seed == null ? '' : o.seed), course = String(o.course || bank.course || '');
    /* 후보는 차례대로 모으기만 하고(take) 마지막에 고른다(choose) — 아래 «이름 겹침» 참고. */
    function take(c, kind, why, nos, onlyDeep) { cand.push([c, kind, why, nos, onlyDeep]); }
    function put(c, kind, why, nos, onlyDeep) {
      if (out.length >= max || used[c]) return false;
      var C = bank.concepts[c];
      if (!C) return false;
      if (C.first_round != null && Number(C.first_round) > round) return false; /* 뒤 회차 개념은 안 낸다 */
      var pool = bankItems(bank, c);
      if (onlyDeep) { var d3 = pool.filter(function (x) { return Number(x.it.lvl) === 3; }); if (d3.length) pool = d3; }
      if (!pool.length) return false;                                         /* 은행에 문항이 없다 → 다음 후보 */
      var k = countable ? (wrongAt[c] || []).length % pool.length
                        : hash(seed + '|' + course + '|' + round + '|' + c) % pool.length;
      used[c] = 1;
      out.push({ c: c, m: C.m || '', kind: kind, why: why, nos: nos || [], idx: pool[k].i, item: pool[k].it });
      return true;
    }
    /* 이름 겹침 — 화학Ⅰ 은행은 개념 코드 여럿이 한 이름을 쓴다(«오비탈 마디·양자수» 24개 등). 그 무리에서
       네 개를 틀리면 다섯 칸 중 넷이 같은 제목이 된다. 그래서 먼저 한 이름에 두 칸까지만 채우고
       (차례는 그대로), 모자랄 때만 같은 이름을 더 넣는다. 화면 차례는 후보 차례(틀림 → 미해결 → 심화)다. */
    function choose() {
      var seenM = {}, at = {};
      cand.forEach(function (x, i) {
        var C = bank.concepts[x[0]], m = canon(C && C.m);
        if (!m || (seenM[m] || 0) < 2) { if (put.apply(null, x)) { at[x[0]] = i; if (m) seenM[m] = (seenM[m] || 0) + 1; } }
      });
      cand.forEach(function (x, i) { if (put.apply(null, x)) at[x[0]] = i; });
      out.sort(function (a, b) { return at[a.c] - at[b.c]; });
      out.forEach(function (x, i) { x.no = i + 1; });
    }
    function nosText(nos) { return nos.length ? ' ' + nos.slice(0, 3).join('·') + '번' + (nos.length > 3 ? ' 등' : '') + '에서' : '에서'; }

    /* 1 — 이번 회차에 틀린 개념 */
    var c1 = cur.order.map(function (c, i) {
      var w = cur.wrong[c], tier = chronic[canon(w.mis)] ? 0 : ((wrongAt[c] || []).length ? 1 : 2);
      return { c: c, w: w, tier: tier, first: w.nos.length ? w.nos[0] : 1e6 + i };
    }).sort(function (a, b) { return a.tier - b.tier || a.first - b.first; });
    c1.forEach(function (x) {
      var why = '이번 회차' + nosText(x.w.nos) + ' 틀림';
      if (x.tier === 0) why += ' · 되풀이되는 오개념';
      else if (x.tier === 1) why += ' · ' + wrongAt[x.c].join('·') + '회에도 틀림';
      take(x.c, 'wrong', why, x.w.nos);
    });

    /* 2 — 앞 회차에 틀리고 그 뒤 맞힌 적이 없는 개념.
       마지막으로 틀린 회차 L 의 재시에서 다시 물어 맞혔거나, L 뒤 회차(이번 회차 포함) 첫 응시에서 맞혔으면 고친 것이다.
       재시가 안 물었거나 뒤 회차 기록이 없으면 «고쳤다» 고 짐작하지 않는다. */
    {
      var c2 = Object.keys(wrongAt).filter(function (c) {
        if (cur.wrong[c]) return false;
        var L = wrongAt[c][wrongAt[c].length - 1];
        var pL = prev.filter(function (p) { return p.round === L; })[0];
        if (pL && pL.s.fixed[c] === true) return false;
        if (prev.some(function (p) { return p.round > L && (p.s.right[c] || p.s.fixed[c] === true); })) return false;
        if (cur.right[c] || cur.fixed[c] === true) return false;
        return true;
      }).sort(function (a, b) {
        var A = wrongAt[a], B = wrongAt[b];
        return B.length - A.length || B[B.length - 1] - A[A.length - 1] || (a < b ? -1 : a > b ? 1 : 0);
      });
      c2.forEach(function (c) { take(c, 'carry', wrongAt[c].join('·') + '회에 틀리고 아직 안 고쳐짐', []); });
    }

    /* 3 — 이번 회차에서 맞힌 심화 문항의 개념. 답안을 문항 단위로 셌을 때만(맞혔는지 알아야 한다). */
    if (cur.ok) {
      var items = curR.items, allRight = cur.nWrong === 0;
      items.forEach(function (it, i) {
        if (!it || !it.c || Number(it.lvl) !== 3 || cur.wrong[it.c]) return;
        take(it.c, 'deep', allRight ? '이번 회차를 다 맞혀서 한 단계 더' : '이번 회차 ' + (i + 1) + '번 심화 문항을 맞혀서 한 단계 더', [i + 1], true);
      });
    }
    choose();
    return { course: course, round: round, sk: hashHex(seed), items: out };
  }

  /* ── 핵심 낱말 대조 ───────────────────────────────────────────────
     학생 답에 은행의 핵심 낱말이 **글자로** 들어 있는지만 본다. 맞았다 · 틀렸다를 정하지 않는다 —
     서술형은 선생님이 함께 보는 몫이다(선생님 결정). 공백은 무시하고, «|» 로 묶인 동의어는 어느
     하나만 있어도 쓴 것으로 센다. 휴대폰 자판으로는 H₂O · Na⁺ 를 못 치므로 아래·위첨자는 보통
     숫자·부호로(NFKC — ¹²³→123 · ₁₂₃→123 · ⁺⁻→+- · ℃→°C), 빼기 부호(−)·en dash 는 붙임표(-)로, 곱하기(×)와
     별표(*)는 x 로 펴서 맞댄다(1.0×10⁻¹⁴ ↔ 1.0x10-14). 영문은 대소문자를 안 가린다. */
  function norm(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) { try { s = s.normalize('NFKC'); } catch (e) {} }
    return s.replace(/[−‒–—]/g, '-').replace(/[×*]/g, 'x').replace(/\s+/g, '').toLowerCase();
  }
  /* 낱말 경계 — 공백을 지우고 맞대면 «불안정» 안의 «안정», «비공유» 안의 «공유», «반비례» 안의 «비례»,
     «12 mol» 안의 «12 M»(대소문자를 안 가리므로) 같이 뜻이 거꾸로이거나 다른 말에 걸린다. 그래서
       · 한글로 시작하는 낱말은 바로 앞(띄어 쓰지 않고 붙은) 글자가 불·비·무·반 이면 걸린 것으로 안 친다.
       · 라틴 글자로 끝나는 낱말은 바로 뒤가 라틴 글자면 안 친다(M ↔ mol, NaCl ↔ NaClO). 숫자는 괜찮다(pH7).
       · 수로 시작하면 바로 앞이 숫자·소수점이 아니어야, 수로 끝나면 바로 뒤가 숫자가 아니어야 한다.
     원문의 띄어쓰기를 기억해 두었다가 «질량비 일정» 처럼 띄어 쓴 앞 낱말의 끝 글자는 앞 글자로 보지 않는다. */
  var NEG = /[불비무반]/, HANGUL = /^[가-힣]/, LATIN_END = /[a-z]$/, LATIN = /[a-z]/;
  function prep(text) {
    var parts = String(text == null ? '' : text).split(/\s+/), T = '', gap = [], sup = [];
    parts.forEach(function (w) {
      var first = true;
      Array.from(w).forEach(function (ch) {          /* 글자마다 펴서 위·아래첨자에서 온 숫자를 기억한다(2p⁶3s² 의 6 · 3) */
        var n = norm(ch), s = ch !== n && /^\d$/.test(n);
        for (var i = 0; i < n.length; i++) { gap.push(first); sup.push(s); first = false; }
        T += n;
      });
    });
    return { T: T, gap: gap, sup: sup };
  }
  /* 끝 글자 받침 — 한국어는 어미가 앞 글자에 붙는다(«되» → «된다» · «커지» → «커진다» · «나누» → «나눈»).
     낱말 끝 글자가 받침 없는 한글이면 글 쪽의 그 자리에 받침이 붙은 글자(같은 초성·중성)도 같은 글자로 본다. */
  function lastOpen(n) {
    var c = n.charCodeAt(n.length - 1);
    return n.length > 1 && c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 === 0 ? c : 0;
  }
  function found(P, n) {
    var lc = lastOpen(n);
    if (lc) {
      var head = n.slice(0, -1);
      for (var h = P.T.indexOf(head); h >= 0; h = P.T.indexOf(head, h + 1)) {
        var nc = P.T.charCodeAt(h + head.length);
        if (nc >= lc && nc < lc + 28 && ok(P, n, h)) return true;
      }
      return false;
    }
    for (var at = P.T.indexOf(n); at >= 0; at = P.T.indexOf(n, at + 1)) if (ok(P, n, at)) return true;
    return false;
  }
  function ok(P, n, at) {
    {
      if (HANGUL.test(n) && at > 0 && !P.gap[at] && NEG.test(P.T.charAt(at - 1))) return false;
      var e = at + n.length;
      if (LATIN_END.test(n) && e < P.T.length && !P.gap[e] && LATIN.test(P.T.charAt(e))) return false;
      /* 수 — «49» 가 «0.49» 에, «2배» 가 «12배» 에, «10-1» 이 «10-14» 에 걸리지 않게 앞뒤 숫자를 본다 */
      /* 전자 배치(1s²2s²2p⁶ · 자판 1s22s2)는 숫자가 이어 붙는 것이 본래 꼴이라 빼고, 첨자 숫자와 보통 숫자가 맞닿은 곳(2p⁶|3s)은 경계로 본다 */
      if (!/\d[spdf]/.test(n)) {
        if (/^\d/.test(n) && at > 0 && !P.gap[at] && /[\d.]/.test(P.T.charAt(at - 1)) && P.sup[at - 1] === P.sup[at]) return false;
        if (/\d$/.test(n) && e < P.T.length && !P.gap[e] && /\d/.test(P.T.charAt(e)) && P.sup[e - 1] === P.sup[e]) return false;
      }
      return true;
    }
  }
  function keyCheck(text, keys) {
    var P = prep(text), T = P.T, list = (Array.isArray(keys) ? keys : []).filter(function (k) { return k != null && String(k).trim(); });
    var rows = list.map(function (k) {
      var alts = String(k).split('|').map(function (x) { return x.trim(); }).filter(Boolean);
      var hit = !!T && alts.some(function (a) { var n = norm(a); return !!n && found(P, n); });
      return { label: alts[0] || String(k), alts: alts, hit: hit };
    });
    var got = rows.filter(function (r) { return r.hit; }).length;
    return { rows: rows, n: rows.length, got: got, missing: rows.filter(function (r) { return !r.hit; }).map(function (r) { return r.label; }) };
  }
  /* 한 줄 자기 점검 — «핵심 낱말 4개 중 3개를 썼어요. 빠진 것: …». 점수·«틀렸다» 는 말하지 않는다. */
  function selfLine(chk) {
    if (!chk || !chk.n) return '';
    if (chk.got === chk.n) return '핵심 낱말 ' + chk.n + '개를 모두 썼어요. 까닭까지 이어지는지 모범 답안과 견주어 보세요.';
    return '핵심 낱말 ' + chk.n + '개 중 ' + chk.got + '개를 썼어요. 빠진 것: ' + chk.missing.join(', ');
  }

  var api = { MAX: MAX, pick: pick, scanRound: scanRound, keyCheck: keyCheck, selfLine: selfLine, norm: norm, hash: hash, hashHex: hashHex, validItem: validItem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DTEssay = api;
})(typeof window !== 'undefined' ? window : this);
