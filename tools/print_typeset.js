/* ============================================================
   찍기 직전에 화면에 입히는 활자 다듬기 — 화학Ⅰ·Ⅱ·일반화학 문제지·해설지 HTML 공통
   ------------------------------------------------------------
   원문(HTML·회차 JSON)은 그대로 두고 PDF 로 찍을 때만 입힌다. 화학Ⅰ 심화 인쇄
   (courses/ch1s/print/make_print.py 의 SYM·nbsp·typeset)와 같은 규칙이다.

   왜 (2026-10-11 전수 교정):
     · HTML 이 «Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR» 를 달라는데 찍는 기계에
       셋 다 없어 한글은 WenQuanYi, ⁺ ⁻ ⁰ ⇌ 는 Unifont(비트맵)로 찍혔다 — «10⁻¹⁰» 의 ⁰ 만 작고
       ⇌ 는 알아보기 어려웠다. 한글은 Noto Sans CJK KR, 첨자·⇌·− 는 DejaVu Sans(Sym)로 묶는다.
     · 줄바꿈이 «0.1 M / 에서», «ΔH < / 0», «N₂ + / 3H₂» 처럼 수와 단위·식을 갈랐다.
     · 누적 띠의 긴 부제(float:right)가 띠 밖으로 밀려 1번 문항 위에 겹쳤다.
     · Ka·Kb·Kw·Ksp·pKa 의 a·b·w·sp 가 아래첨자가 아니었다(유니코드에 아래첨자 b·w 가 없다).
   ============================================================ */
'use strict';

const SYM_RANGE = 'U+00B2-00B3,U+00B9,U+2070-209F,U+21CC,U+2212';

const css = `
@font-face{font-family:Sym;src:local("DejaVu Sans"),local("DejaVuSans");unicode-range:${SYM_RANGE}}
@font-face{font-family:Sym;font-weight:bold;src:local("DejaVu Sans Bold"),local("DejaVuSans-Bold");unicode-range:${SYM_RANGE}}
body,body *{font-family:Sym,"Noto Sans CJK KR","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif !important}
body{word-break:keep-all;overflow-wrap:anywhere}
td.no,td.an,td.ox,.kc .n,.kc .a,.inst .sec{white-space:nowrap;overflow-wrap:normal;word-break:normal}
.inst{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px}
.inst .s{float:none;margin-left:auto}
`;

/* 글 마디마다(브라우저 안에서 돈다 — page.evaluate(run)) */
function run() {
  const UNIT = '(?:°C|kJ|J|mmol|mol|mL|L|kg|mg|g|atm|kPa|Pa|M|pm|nm|K|u|cm³|m³|mmHg)(?![A-Za-z])';
  const rules = [
    [new RegExp('(\\d) (?=' + UNIT + ')', 'g'), '$1 '],          // 0.1 M · 25 °C
    [/ ([<>≤≥≈=]) (?=[\d(−\-])/g, ' $1 '],                 // ΔH < 0 · π = 0.1
    [/ − (?=[\d(])/g, ' − '],                               // (t − 20)
    [/(\d) : (?=\d)/g, '$1 : '],                            // 1 : 3
    [/ ([+→⇌]) (?=\d?[A-Z(])/g, ' $1 '],                        // N₂ + 3H₂ → 2NH₃ — 기호 앞에서 안 끊기
    [/([)\]⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹₀-₉ₙₗₛ])(?=[가-힣])/g, '$1⁠'],           // H₃O⁺이다 · (aq)에서
  ];
  const SUBN = { '₁': '1', '₂': '2', '₃': '3' };
  const KSPLIT = /(p?K(?:sp|a|b|w)[₁₂₃]?(?![A-Za-z])|[가-힣]+-[가-힣]+)/;   // 앞 글자가 라틴이면 아래에서 되돌린다(Kr·OKa 등)
  // 옳은문장집 묶음 머리는 앱 키(u)를 그대로 찍는다 — 키는 두고 보이는 이름만 띄운다
  const UNAME = [['분자간힘', '분자 간 힘'], ['이상기체', '이상 기체'], ['실제기체', '실제 기체'], ['물질의상태', '물질의 상태'],
    ['산염기평형', '산염기 평형'], ['산화환원평형', '산화 환원 평형'], ['전자배치', '전자 배치'], ['기초지식', '기초 지식'],
    ['화학평형', '화학 평형'], ['용해평형', '용해 평형'], ['상평형', '상평형'], ['반응속도', '반응 속도'], ['화학결합', '화학 결합'],
    ['분자구조', '분자 구조'], ['탄소화합물', '탄소 화합물'], ['원자모형', '원자 모형'], ['양적관계', '양적 관계']];
  document.querySelectorAll('.uhead').forEach(h => { let t = h.textContent; UNAME.forEach(([a, b]) => { t = t.split(a).join(b); }); if (t !== h.textContent) h.textContent = t; });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let changed = 0;
  for (const t of nodes) {
    const pe = t.parentElement;
    if (!pe || /^(SCRIPT|STYLE|SUB|SUP)$/.test(pe.tagName)) continue;
    let s = t.nodeValue;
    const o = s;
    for (const [re, rep] of rules) s = s.replace(re, rep);
    const parts = s.split(KSPLIT);
    if (parts.length > 1) {
      const frag = document.createDocumentFragment();
      parts.forEach((p, i) => {
        if (!p) return;
        if (i % 2 === 0) { frag.append(p); return; }
        const m = p.match(/^(p?)K(sp|a|b|w)([₁₂₃]?)$/);
        const prev = parts[i - 1] || '';
        if (m && /[A-Za-z]$/.test(prev)) { frag.append(p); return; }
        if (m) {
          frag.append(m[1] + 'K');
          const sub = document.createElement('sub');
          sub.textContent = m[2] + (SUBN[m[3]] || '');
          frag.append(sub);
        } else {
          const sp = document.createElement('span');            // 브뢴스테드-로리 · 짝산-짝염기 는 하이픈에서 안 끊는다
          sp.style.whiteSpace = 'nowrap';
          sp.textContent = p;
          frag.append(sp);
        }
      });
      t.replaceWith(frag);
      changed++;
    } else if (s !== o) {
      t.nodeValue = s;
      changed++;
    }
  }
  return changed;
}

/* playwright page 에 입힌다. 고친 글 마디 수를 돌려준다. */
async function apply(page) {
  await page.addStyleTag({ content: css });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(run);
}

module.exports = { css, run, apply, SYM_RANGE };
