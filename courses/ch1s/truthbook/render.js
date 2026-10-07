/* 화학1 심화 선수노트(옳은문장집) — 회차마다 한 권.
 *
 *   NODE_PATH=… node courses/ch1s/truthbook/render.js 5          # truthbooks/chem1s_round05_truthbook_bw.pdf
 *   NODE_PATH=… node courses/ch1s/truthbook/render.js 5 --png DIR # 쪽마다 PNG 도 (글·그림 확인용)
 *   NODE_PATH=… node courses/ch1s/truthbook/render.js all         # 10권 + 합본 조각(tools/_stage/ch1s/volume/) → volume.py
 *
 * 짜임은 화학1 선수노트와 같다: 표지 · 머리말 · 걸음(낚시 · 옳은 문장 · 그림 · 한 수 위 · 이어진다)
 * · 옳은 문장집 · 낚시 문장집 · 심화 확장.
 * 글(머리말·걸음)은 courses/ch1s/truthbook/round_NN.json 에서, 심화 확장(그 회차 정시 60문항의 옳은 문장
 * 전부와 함정 바로잡기)은 회차 파일 appdata/round_ch1s_NN.json 에서 그대로 가져온다 — 시험 정답과
 * 글자가 어긋날 일이 없다.
 * 걸음 한 쪽에 글이 넘치면 멈춘다(쪽이 잘려 나가는 일을 막는다).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const HERE = __dirname;
const DT = path.resolve(HERE, '..', '..', '..');
const CH = path.resolve(HERE, '..');
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(HERE, 'logo.png')).toString('base64');
const KNUM = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];

function css() {
  /* 회색 단계: 글자 #000 · #444 · #767676 / 선 #999 · #bfbfbf / 바탕 #e6e6e6 (흑백 인쇄에서 단계가 뭉개지지 않게)
     Sym: 위·아래 첨자·⇌·− 를 DejaVu Sans 로(없으면 Unifont 로 찍힌다) · 한글은 Noto CJK KR(화학1 선수노트와 같게) */
  return `
@font-face { font-family: Sym; src: local("DejaVu Sans"), local("DejaVuSans"); unicode-range: U+2070-209F, U+21CC, U+2212; }
@font-face { font-family: Sym; font-weight: bold; src: local("DejaVu Sans Bold"), local("DejaVuSans-Bold"); unicode-range: U+2070-209F, U+21CC, U+2212; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: Sym, 'Noto Sans CJK KR', 'DejaVu Sans', 'WenQuanYi Zen Hei', sans-serif; font-size: 10.6pt; line-height: 1.62; -webkit-print-color-adjust: exact; print-color-adjust: exact; word-break: keep-all; overflow-wrap: anywhere; }
.page { width: 210mm; height: 297mm; padding: 16mm 15mm 18mm; position: relative; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; gap: 5mm; }
.hd { position: absolute; top: 6mm; left: 15mm; right: 15mm; display: flex; justify-content: space-between; align-items: center; font-size: 7.5pt; letter-spacing: .12em; color: #444; }
.hd img { height: 4.5mm; }
.ft { position: absolute; bottom: 7mm; left: 0; right: 0; text-align: center; font-size: 8.5pt; font-weight: bold; }
b, strong { font-weight: bold; }
b { border-bottom: 1px solid #bdbdbd; }
.serif { font-family: Sym, 'Noto Serif CJK KR', 'DejaVu Serif', 'WenQuanYi Zen Hei', serif; }
/* 표지 */
.cover { padding: 0; }
.cover .frame { position: absolute; inset: 9mm; border: 1px solid #444; }
.cover .inner { position: absolute; inset: 12mm; border: 1px solid #bfbfbf; background: radial-gradient(circle at 50% 40%, #fff 0, #f2f2f2 70%); }
.cover .brand { position: absolute; top: 20mm; left: 20mm; right: 20mm; border: 1px solid #bfbfbf; background: #fff; padding: 2mm 3mm; font-size: 8pt; letter-spacing: .12em; color: #444; display: flex; gap: 3mm; align-items: center; }
.cover .brand img { height: 6mm; }
.cover svg.hex { position: absolute; left: 40mm; top: 66mm; width: 130mm; height: 130mm; }
.cover .kicker { position: absolute; top: 98mm; left: 20mm; font-size: 10pt; letter-spacing: .3em; font-weight: bold; }
.cover h1 { position: absolute; top: 106mm; left: 18mm; margin: 0; font-size: 58pt; letter-spacing: .08em; font-weight: bold; }
.cover h1 small { font-size: 30pt; letter-spacing: .05em; margin-left: 3mm; }
.cover .sub { position: absolute; top: 140mm; left: 20mm; font-size: 17pt; letter-spacing: .45em; color: #444; }
.cover .rule { position: absolute; top: 160mm; left: 20mm; width: 140mm; height: 1.5px; background: linear-gradient(90deg, #000, #000 60%, transparent); }
.cover .rule::before { content: ''; position: absolute; left: -1mm; top: -1.3mm; width: 2.6mm; height: 2.6mm; background: #000; transform: rotate(45deg); }
.cover .tag { position: absolute; top: 168mm; left: 20mm; font-size: 11pt; line-height: 2; }
.cover .who { position: absolute; bottom: 30mm; right: 20mm; text-align: right; font-size: 9pt; line-height: 1.9; }
.cover .who strong { font-size: 10pt; }
.cover .lec { position: absolute; bottom: 30mm; left: 20mm; font-size: 8.5pt; color: #444; }
.cover .vol { position: absolute; top: 88mm; left: 20mm; border: 1.2px solid #000; padding: .8mm 4mm; font-size: 10pt; font-weight: bold; letter-spacing: .3em; background: #fff; }
.cover .units { position: absolute; top: 176mm; left: 20mm; right: 20mm; font-size: 9.5pt; line-height: 2; }
.cover .units span { display: inline-block; width: 16mm; font-weight: bold; }
/* 머리말 */
.intro { background: #e6e6e6; padding: 7mm 6mm 6mm; }
.intro h2 { margin: 0 0 5mm; font-size: 23pt; line-height: 1.3; }
.intro h2 span { background: #000; color: #fff; padding: 0 2mm; }
.intro p { margin: 0 0 3mm; }
.intro .sig { text-align: right; color: #444; margin-top: 4mm; }
.intro .sig strong { color: #000; }
.toc { border: 1px solid #bfbfbf; border-top: 3px solid #000; padding: 6mm 6mm 3mm; }
.toc h3 { margin: 0; font-size: 13pt; }
.toc .lead { font-size: 8pt; color: #767676; margin: 1mm 0 4mm; }
.toc .row { display: flex; align-items: center; gap: 6mm; border-bottom: 1px solid #bfbfbf; padding: 2.5mm 0; }
.toc .row .n { font-size: 14pt; width: 6mm; }
.toc .row .t { flex: 1; }
.toc .row .u { font-size: 7.5pt; border: 1px solid #999; padding: .5mm 2mm; color: #444; }
.toc .row .pg { font-size: 9pt; width: 10mm; text-align: right; }
.toc .row .dots { flex: 0 0 30mm; border-bottom: 1px dotted #999; height: 0; }
.toc .row .t small { display: block; font-size: 7.5pt; color: #767676; }
.recap { border: 1px solid #999; border-left: 3px solid #000; padding: 3mm 5mm 2mm; }
.recap .lab2 { margin-bottom: 1mm; }
.recap .rl { display: flex; gap: 3mm; font-size: 8.6pt; line-height: 1.45; padding: .9mm 0; border-bottom: 1px solid #e6e6e6; }
.recap .rl:last-child { border-bottom: 0; }
.recap .rl .m { flex: 0 0 37mm; font-weight: bold; }
.recap .rl .m small { display: block; font-weight: normal; color: #767676; font-size: 7pt; }
/* 걸음 */
.stephd { display: flex; border: 1px solid #000; }
.stephd .num { width: 22mm; background: #000; color: #fff; font-size: 26pt; display: flex; align-items: center; justify-content: center; }
.stephd .tt { padding: 3mm 5mm; flex: 1; background: #f0f0f0; }
.stephd .kick, .lab2, .extbar .kick { font-size: 7.5pt; letter-spacing: .3em; font-weight: bold; color: #222; }
.lab2 { margin-bottom: 2mm; }
.stephd h2 { margin: 1mm 0 0; font-size: 16pt; }
.trap { border: 1px solid #444; padding: 3mm 5mm 3.5mm; }
.trap .lab { display: inline-block; background: #000; color: #fff; font-size: 7.5pt; letter-spacing: .2em; padding: .6mm 3mm; font-weight: bold; }
.trap .q { font-size: 12pt; color: #444; margin: 2.5mm 0 2mm; padding-bottom: 2mm; border-bottom: 1px solid #bfbfbf; }
.trap .a strong { border-bottom: 1.5px solid #000; margin-right: 2mm; }
.truth { border-top: 3px solid #000; border-left: 1px solid #bfbfbf; border-right: 1px solid #bfbfbf; border-bottom: 1px solid #bfbfbf; padding: 3mm 5mm 1mm; }
.truth ol { list-style: none; margin: 0; padding: 0; }
.truth li { display: flex; gap: 4mm; padding: 2mm 0; border-bottom: 1px solid #e6e6e6; }
.truth li:last-child { border-bottom: 0; }
.truth li .k { flex: 0 0 5mm; height: 5mm; background: #000; color: #fff; font-size: 8pt; display: flex; align-items: center; justify-content: center; margin-top: .8mm; }
.fig .box { border: 1px solid #bfbfbf; border-radius: 2mm; background: #fff; padding: 4mm 5mm 3mm; text-align: center; }
.fig svg { max-width: 100%; height: auto; max-height: 64mm; font-family: Sym, 'Noto Sans CJK KR', 'DejaVu Sans', 'WenQuanYi Zen Hei', sans-serif; }
.fig .cap { font-size: 8pt; color: #767676; margin-top: 2mm; }
.fig .cap2 { font-size: 8.5pt; color: #444; margin-top: 1mm; }
.deep { background: #000; color: #f2f2f2; padding: 3.5mm 5mm; }
.deep .lab2 { color: #fff; }
.deep b { border-bottom-color: #767676; }
.next { border-left: 3px solid #000; padding-left: 3mm; font-size: 9.5pt; color: #444; }
.next strong { color: #000; margin-right: 2mm; }
.fill { flex: 1; background: transparent; }
/* 모음 쪽 */
.coll h2 { margin: 0; font-size: 17pt; }
.coll .lead { color: #444; font-size: 9pt; margin: 1mm 0 2mm; }
.grp { font-weight: bold; font-size: 10pt; border-bottom: 1.5px solid #000; padding-bottom: 1mm; margin-top: 2mm; }
.it { display: flex; gap: 3mm; padding: 1.3mm 0; border-bottom: 1px solid #e6e6e6; font-size: 9.6pt; line-height: 1.5; }
.it .k { flex: 0 0 7mm; color: #444; font-weight: bold; }
.it .body { flex: 1; }
.it .fx { color: #444; font-size: 9pt; }
.pair { border: 1px solid #bfbfbf; padding: 2mm 3mm; display: grid; grid-template-columns: 11mm 1fr; row-gap: 1mm; column-gap: 2.5mm; font-size: 9.4pt; line-height: 1.5; }
.pair .x { color: #767676; text-decoration: line-through; text-decoration-color: #999; }
.pair .lx, .pair .lo { font-size: 7.5pt; font-weight: bold; text-align: center; height: 4.4mm; line-height: 4.4mm; }
.pair .lx { border: 1px solid #999; color: #767676; }
.pair .lo { background: #000; color: #fff; }
.extbar { display: flex; align-items: center; gap: 4mm; border: 1px solid #000; padding: 3mm 5mm; }
.extbar .plus { font-size: 22pt; font-weight: bold; }
.extbar h2 { margin: 0; font-size: 15pt; }
.memo .lines { flex: 1; background: repeating-linear-gradient(#fff 0, #fff 8.6mm, #bfbfbf 8.6mm, #bfbfbf calc(8.6mm + 1px)); }
.memo h2 { margin: 0; font-size: 15pt; }
.vtoc h2 { margin: 6mm 0 0; font-size: 30pt; letter-spacing: .4em; }
.vtoc .sub { color: #767676; font-size: 9pt; letter-spacing: .25em; margin-bottom: 8mm; }
.vtoc .row { display: flex; align-items: center; gap: 5mm; padding: 3.2mm 0; border-bottom: 1px solid #bfbfbf; }
.vtoc .row .n { font-size: 17pt; width: 9mm; }
.vtoc .row .t { flex: 0 0 auto; font-weight: bold; }
.vtoc .row .t small { display: block; font-weight: normal; color: #767676; font-size: 7.5pt; }
.vtoc .row .dots { flex: 1; border-bottom: 1px dotted #999; }
.vtoc .row .pg { width: 10mm; text-align: right; font-weight: bold; }
.vtoc .foot { margin-top: auto; text-align: center; font-size: 8pt; color: #767676; }
`;
}

const BRAND = '화학 · 다원교육 · 조준모';

function hexSvg() {
  return [130, 100, 70].map((r, i) => {
    const pts = [0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 3 * k - Math.PI / 2; return (75 + r / 2 * Math.cos(a)).toFixed(1) + ',' + (75 + r / 2 * Math.sin(a)).toFixed(1); }).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#dcdcdc" stroke-width="${i === 0 ? 1.4 : 1}"/>`;
  }).join('') + '<circle cx="75" cy="75" r="16" fill="none" stroke="#d0d0d0"/>';
}

function cover(R, D) {
  return `<section class="page cover"><div class="frame"></div><div class="inner"></div>
  <div class="brand"><img src="${LOGO}" alt="">${BRAND} · 옳은문장집</div>
  <svg class="hex" viewBox="0 0 150 150">${hexSvg()}</svg>
  <div class="kicker">${R} 회차 · 누적 O X</div>
  <h1 class="serif">화학 Ⅰ<small>심화</small></h1>
  <div class="sub">${esc(D.title)}</div>
  <div class="rule"></div>
  <div class="tag">한 번 제대로 읽으면, 그것으로 끝나도록.<br><strong>읽기만 해도 아는 것.</strong> 그게 이 책의 전부다.</div>
  <div class="who"><strong>${BRAND}</strong><br>화학 Ⅰ 심화반</div>
  <div class="lec">제 ${R} 강 · 선수노트</div></section>`;
}

function shell(R, inner, n, extra) {
  return `<section class="page ${extra || ''}"><div class="hd"><img src="${LOGO}" alt=""><span>화학 Ⅰ 심화 · ${R}회차 옳은문장집</span></div>${inner}<div class="ft">${n}</div></section>`;
}

/* 10회: 8·9회에 새로 배우고 정시 복습 칸에 다시 안 나오는 개념을 한 줄씩 되짚는다(한 줄 정리는 은행 reading.oneline).
   낚시 문장집 뒤(흐름 쪽)에 짧은 상자로. */
function recap(D) {
  if (!D.recap) return [];
  const bank = JSON.parse(fs.readFileSync(path.join(CH, 'forms_bank_ch1s.json'), 'utf8'));
  const design = JSON.parse(fs.readFileSync(path.join(CH, 'design.json'), 'utf8'));
  const cm = {}; design.concepts.forEach(c => { cm[c.c] = c; });
  const out = [{ html: `<div class="recap" style="margin-top:3mm;border-bottom:0;padding-bottom:0"><div class="lab2">${esc(D.recap.title)}</div></div>`, keep: true }];
  D.recap.codes.forEach((c, i) => out.push({ html: `<div class="recap" style="border-top:0;padding-top:0;${i < D.recap.codes.length - 1 ? 'border-bottom:0;padding-bottom:0' : ''}"><div class="rl"><span class="m">${esc(cm[c].m)}<small>${esc(cm[c].u)} · ${cm[c].first_round}회</small></span><span>${md(bank[c].reading.oneline)}</span></div></div>` }));
  return out;
}

function intro(R, D) {
  const k = D.steps.length;
  const rows = D.steps.map((s, i) => `<div class="row"><span class="n serif">${i + 1}</span><span class="t">${esc(s.title)}</span><span class="u">${esc(s.unit)}</span></div>`).join('');
  return `<div class="intro"><h2 class="serif">${esc(D.headline[0])} <span>${esc(D.headline[1])}</span></h2>
    ${D.intro.map(p => `<p>${md(p)}</p>`).join('')}<div class="sig">화학 <strong>조준모</strong></div></div>
    <div class="toc"><h3 class="serif">이번 회차, ${KNUM[k] || k} 걸음</h3><div class="lead">한 걸음마다 옳은 문장 · 그림 · 함정으로 정리했다. 처음부터 끝까지, 그냥 읽어라.</div>${rows}</div><div class="fill"></div>`;
}

function step(s, i) {
  return `<div class="stephd"><div class="num serif">${i + 1}</div><div class="tt"><div class="kick">UNIT ${esc(s.unit)} · ${esc(s.tag)}</div><h2>${esc(s.title)}</h2></div></div>
  <div class="trap"><span class="lab">낚시 · 이거 맞을까?</span><div class="q">"${esc(s.trap.q)}"</div><div class="a"><strong>낚였다.</strong>${md(s.trap.a)}</div></div>
  <div class="truth"><div class="lab2">옳 은 문 장</div><ol>${s.truths.map((t, k) => `<li><span class="k">${k + 1}</span><span>${md(t)}</span></li>`).join('')}</ol></div>
  <div class="fig"><div class="lab2">그 림 · ${esc(s.fig.title)}</div><div class="box">${s.fig.svg}<div class="cap">${md(s.fig.cap || '')}</div></div>${s.fig.cap2 ? `<div class="cap2" style="text-align:center">${md(s.fig.cap2)}</div>` : ''}</div>
  <div class="deep"><div class="lab2">↑ &nbsp;한 수 위</div>${md(s.deep)}</div>
  <div class="next"><strong>→ 이어진다</strong>${md(s.next)}</div><div class="fill"></div>`;
}

/* 흐르는 쪽(모음·확장)은 블록 목록으로 넘겨 브라우저에서 쪽을 나눈다.
   옳은 문장집 → 낚시 문장집은 이어 흘린다(강제 쪽넘김이 거의 빈 쪽을 만들었다). 심화 확장·함정 바로잡기는 새 쪽에서. */
function flowBlocks(R, D, items, bp) {
  const B = [];
  B.push({ head: true, html: `<div class="coll"><h2 class="serif">옳은 문장집</h2><div class="lead">시험 전날, 그림은 덮고 이 문장만 처음부터 끝까지 한 번 훑어라. 여기 적힌 게 ${R}회차의 정답이다.</div></div>`, keep: true });
  D.steps.forEach(s => {
    B.push({ html: `<div class="grp">${esc(s.title)}</div>`, keep: true });
    s.truths.forEach((t, k) => B.push({ html: `<div class="it"><span class="k">${k + 1}</span><span class="body">${md(t)}</span></div>` }));
  });
  B.push({ head: true, html: `<div class="coll" style="margin-top:3mm"><h2 class="serif">낚시 문장집</h2><div class="lead">전부 그럴듯하지만 전부 틀린 문장이다. 어디가 틀렸는지 먼저 잡아낸 다음 답을 봐라 · 안 낚이면 고수.</div></div>`, keep: true });
  D.steps.forEach((s, i) => B.push({ html: `<div class="it"><span class="k">${pad(i + 1)}</span><span class="body">${esc(s.trap.q)}<div class="fx">진짜는 · ${md(s.trap.fix)}</div></span></div>` }));
  recap(D).forEach(b => B.push(b));
  B.push({ brk: true });
  const lead = R === 1
    ? '1회차 정시 60문항을 모두 옳은 문장으로 바꿔 적었다. 1회는 복습 칸 없이 60문항 모두 이번 회차 개념(신규)이다. 이 쪽을 다 읽으면 시험지의 정답을 다 본 것이다.'
    : `${R}회차 정시 60문항을 모두 옳은 문장으로 바꿔 적었다. 복습 칸은 앞 회차 개념, 신규 칸은 이번 회차 개념이다. 이 쪽을 다 읽으면 시험지의 정답을 다 본 것이다.`;
  B.push({ head: true, html: `<div class="extbar"><span class="plus">+</span><div><div class="kick">심 화 확 장 · ${R} 회 차 정 시 6 0 문 항</div><h2>이번 시험의 옳은 문장 전부</h2></div></div><div class="coll"><div class="lead">${lead}</div></div>`, keep: true });
  let last = '';
  items.forEach((it, k) => {
    const g = bp[k]['구획'] === '신규' ? '신규 · 이번 회차' : '복습 · 앞 회차';
    if (g !== last) { B.push({ html: `<div class="grp">${g}</div>`, keep: true }); last = g; }
    B.push({ html: `<div class="it"><span class="k">${it.n.split('-')[1]}</span><span class="body">${esc(it.f)}</span></div>` });
  });
  const xs = items.filter(it => it.a === 'X');
  B.push({ head: true, html: `<div class="coll" style="margin-top:3mm"><h2 class="serif">흔한 함정 바로잡기</h2><div class="lead">이번 시험의 틀린 문장 ${xs.length}개와 바로잡은 문장이다. 어디를 고쳤는지 짚어 가며 읽어라.</div></div>`, keep: true });
  xs.forEach(it => B.push({ html: `<div class="pair"><span class="lx">틀림</span><span class="x">${esc(it.s)}</span><span class="lo">맞음</span><span>${esc(it.f)}</span></div>` }));
  return B;
}

/* startNo: 머리말 쪽에 찍을 쪽 번호(한 권이면 1, 합본이면 그 쪽의 합본 쪽 번호) */
function html(R, startNo) {
  startNo = startNo || 1;
  const D = JSON.parse(fs.readFileSync(path.join(HERE, 'round_' + pad(R) + '.json'), 'utf8'));
  const RF = JSON.parse(fs.readFileSync(path.join(CH, '..', '..', 'appdata', 'round_ch1s_' + pad(R) + '.json'), 'utf8'));
  const design = JSON.parse(fs.readFileSync(path.join(CH, 'design.json'), 'utf8'));
  const bp = design.blueprint[String(R)];
  const blocks = flowBlocks(R, D, RF.jeongsi.items, bp);
  let n = startNo;
  const pages = [cover(R, D), shell(R, intro(R, D), n++)];
  D.steps.forEach((s, i) => pages.push(shell(R, step(s, i), n++, 'stepPage')));
  const title = `화학 Ⅰ 심화 ${R}회차 선수노트 · ${D.title}`;
  const PAGES = 16;   // 한 권 목표 쪽수
  return { D, n, doc: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css()}</style></head><body>${pages.join('')}
<div id="flowpages"></div>
<script>
const BLOCKS = ${JSON.stringify(blocks)};
let pn = ${n};
const host = document.getElementById('flowpages');
const HD = '<div class="hd"><img src="${LOGO}" alt=""><span>화학 Ⅰ 심화 · ${R}회차 옳은문장집</span></div>';
function newPage() {
  const s = document.createElement('section'); s.className = 'page flow';
  s.innerHTML = HD + '<div class="ft">' + (pn++) + '</div>';
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:1.6mm;flex:1;min-height:0;overflow:hidden';
  s.insertBefore(body, s.lastChild); host.appendChild(s); return body;
}
function layout(useBrk) {
  host.innerHTML = ''; pn = ${n};
  let body = newPage();
  for (const b of BLOCKS) {
    if (b.brk) { if (useBrk && body.children.length) body = newPage(); continue; }
    const d = document.createElement('div'); d.innerHTML = b.html;
    body.appendChild(d);
    if (body.scrollHeight > body.clientHeight + 1) {
      body.removeChild(d);
      const carry = [];          // 쪽 끝에 남은 제목들(keep)은 다음 쪽으로 데려간다
      while (body.lastElementChild && body.lastElementChild.dataset.keep) carry.unshift(body.removeChild(body.lastElementChild));
      body = newPage();
      carry.forEach(c => body.appendChild(c));
      body.appendChild(d);
    }
    if (b.keep) d.dataset.keep = '1';
  }
  /* 권마다 짝수 쪽 — 양면으로 찍어 묶을 때 다음 권 표지가 뒷면에 붙지 않게. 홀수면 끝에 메모 쪽 */
  if (document.querySelectorAll('section.page').length % 2) {
    const s = document.createElement('section'); s.className = 'page memo';
    s.innerHTML = HD + '<h2 class="serif">메모</h2><div class="lines"></div><div class="ft">' + (pn++) + '</div>';
    host.appendChild(s);
  }
  return document.querySelectorAll('section.page').length;
}
/* 16쪽을 넘으면 심화 확장 앞 쪽넘김을 풀고 이어 흘린다 */
if (layout(true) > ${PAGES}) layout(false);
window.__overflow = [...document.querySelectorAll('.stepPage, .page:not(.flow):not(.cover):not(.memo)')].map((p, i) => p.scrollHeight > p.clientHeight + 1 ? p.querySelector('h2') && p.querySelector('h2').textContent : null).filter(Boolean);
window.__fillMin = [...document.querySelectorAll('.stepPage .fill')].map(f => f.getBoundingClientRect().height);
window.__pages = document.querySelectorAll('section.page').length;
window.__lastFill = (() => { const f = [...document.querySelectorAll('section.flow')]; return f.map(p => { const b = p.children[1]; return b ? Math.round(100 * [...b.children].reduce((h, c) => h + c.getBoundingClientRect().height, 0) / b.clientHeight) : 0; }); })();
</script></body></html>` };
}

async function render(browser, R, opt) {
  opt = opt || {};
  const { doc } = html(R, opt.startNo);
  const page = await browser.newPage();
  await page.setContent(doc, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const over = await page.evaluate(() => window.__overflow);
  const fill = await page.evaluate(() => window.__fillMin);
  const pages = await page.evaluate(() => window.__pages);
  const flowFill = await page.evaluate(() => window.__lastFill);
  const out = opt.out || path.join(DT, 'truthbooks', 'chem1s_round' + pad(R) + '_truthbook_bw.pdf');
  if (over.length) { await page.close(); throw new Error(R + '회 걸음 쪽이 넘친다: ' + over.join(' / ') + ' — 글을 줄여라'); }
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  if (opt.pngDir) {
    fs.mkdirSync(opt.pngDir, { recursive: true });
    const secs = await page.$$('section.page');
    for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: path.join(opt.pngDir, 'r' + pad(R) + '_p' + pad(i + 1) + '.png') });
  }
  await page.close();
  return { out, fill, pages, flowFill };
}

/* 합본 앞쪽: 권 표지 · 차례(회차별 시작 쪽). 화학1 합본(volumes/chem1_volume1_rounds1to9.pdf)과 같은 짜임. */
function volumeFront(rows) {
  const design = JSON.parse(fs.readFileSync(path.join(CH, 'design.json'), 'utf8'));
  const units = [['Ⅰ', '화학식량 · 몰 · 양적 관계'], ['Ⅱ', '원자의 구조 · 전자 배치 · 주기성'], ['Ⅲ', '화학 결합 · 분자 구조 · 극성'], ['Ⅳ', '열화학 · 산과 염기 · 평형과 중화 적정']];
  const toc = rows.map(x => `<div class="row"><span class="n serif">${x.R}</span><span class="t">${esc(x.title)}<small>단원 ${esc(design.rounds[x.R - 1].new_sections.map(s => s.split(' ')[0]).join(' · '))}</small></span><span class="dots"></span><span class="pg">${x.start}</span></div>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>화학 Ⅰ 심화 선수노트 합본 · 1~10회차</title><style>${css()}</style></head><body>
<section class="page cover"><div class="frame"></div><div class="inner"></div>
  <div class="brand"><img src="${LOGO}" alt="">${BRAND} · 옳은문장집</div>
  <svg class="hex" viewBox="0 0 150 150">${hexSvg()}</svg>
  <div class="vol">합 본</div>
  <div class="kicker">1 ~ 10 회차 · 누적 OX 선수노트</div>
  <h1 class="serif">화학 Ⅰ<small>심화</small></h1>
  <div class="sub">원자에서 평형까지</div>
  <div class="rule"></div>
  <div class="units">${units.map(u => `<div><span class="serif">${u[0]}</span>${esc(u[1])}</div>`).join('')}</div>
  <div class="who"><strong>${BRAND}</strong><br>화학 Ⅰ 심화반</div>
  <div class="lec">선수노트 · 한 번 제대로 읽는 책</div></section>
<section class="page vtoc"><div class="hd"><img src="${LOGO}" alt=""><span>화학 Ⅰ 심화 · 1 ~ 10 회차 합본</span></div>
  <h2 class="serif">차 례</h2><div class="sub">화학 Ⅰ 심화 · 1 ~ 10 회차</div>${toc}
  <div class="foot">각 회차는 누적 OX 선수노트다 · 쪽 번호는 합본 쪽 번호 · 시험 전 옳은 문장집과 낚시 문장집을 함께 보라</div><div class="ft">2</div></section>
</body></html>`;
}

(async () => {
  const arg = process.argv[2];
  const pi = process.argv.indexOf('--png');
  const pngDir = pi > 0 ? process.argv[pi + 1] : null;
  const rounds = arg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [Number(arg)];
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  try {
    const counts = {};
    for (const R of rounds) {
      const r = await render(browser, R, { pngDir });
      counts[R] = r.pages;
      console.log('OK', path.relative(DT, r.out), r.pages + '쪽', '걸음 여백(px)', r.fill.map(x => Math.round(x)).join(','), '흐름 쪽 채움(%)', r.flowFill.join(','));
    }
    if (arg === 'all') {
      /* 합본 조각: 권 표지(1)·차례(2) 다음에 회차를 잇고, 쪽 번호를 합본 쪽 번호로 다시 찍는다 */
      const VOL = path.join(DT, 'tools', '_stage', 'ch1s', 'volume');
      fs.mkdirSync(VOL, { recursive: true });
      let at = 3; const rows = [];
      for (const R of rounds) {
        const D = JSON.parse(fs.readFileSync(path.join(HERE, 'round_' + pad(R) + '.json'), 'utf8'));
        rows.push({ R, title: D.title, start: at });
        const r = await render(browser, R, { startNo: at + 1, out: path.join(VOL, 'vol_r' + pad(R) + '.pdf') });
        if (r.pages !== counts[R]) throw new Error(R + '회 합본 조각 쪽수가 한 권과 다르다');
        at += r.pages;
      }
      const page = await browser.newPage();
      await page.setContent(volumeFront(rows), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.pdf({ path: path.join(VOL, 'vol_front.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
      await page.close();
      fs.writeFileSync(path.join(VOL, 'vol.json'), JSON.stringify({ rows, pages: at - 1 }, null, 1));
      console.log('합본 조각', path.relative(DT, VOL), '· 이어서 python3 courses/ch1s/truthbook/volume.py');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error('✗', e.message); process.exit(1); });
