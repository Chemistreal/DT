/* 화학1 심화 선수노트(옳은문장집) — 회차마다 한 권.
 *
 *   NODE_PATH=… node courses/ch1s/truthbook/render.js 5          # truthbooks/chem1s_round05_truthbook_bw.pdf
 *   NODE_PATH=… node courses/ch1s/truthbook/render.js 5 --png DIR # 쪽마다 PNG 도 (글·그림 확인용)
 *   NODE_PATH=… node courses/ch1s/truthbook/render.js all         # 10권 + volumes/chem1s_volume_rounds1to10.pdf
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
  return `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1d1d1f; }
body { font-family: 'DejaVu Sans', 'WenQuanYi Zen Hei', sans-serif; font-size: 10.6pt; line-height: 1.62; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 16mm 15mm 18mm; position: relative; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; gap: 5mm; }
.hd { position: absolute; top: 6mm; left: 15mm; right: 15mm; display: flex; justify-content: space-between; align-items: center; font-size: 7.5pt; letter-spacing: .12em; color: #555; }
.hd img { height: 6mm; }
.ft { position: absolute; bottom: 7mm; left: 0; right: 0; text-align: center; font-size: 8.5pt; font-weight: bold; }
b, strong { font-weight: bold; -webkit-text-stroke: .35px currentColor; }
b { border-bottom: 1.2px solid #1d1d1f; }
h1, h2, h3, .num, .stephd .num { -webkit-text-stroke: .5px currentColor; }
.serif { font-family: 'DejaVu Serif', 'WenQuanYi Zen Hei', serif; }
/* 표지 */
.cover { padding: 0; }
.cover .frame { position: absolute; inset: 9mm; border: 1px solid #333; }
.cover .inner { position: absolute; inset: 12mm; border: 1px solid #ccc; background: radial-gradient(circle at 50% 40%, #fff 0, #f4f4f4 70%); }
.cover .brand { position: absolute; top: 20mm; left: 20mm; right: 20mm; border: 1px solid #ddd; background: #fff; padding: 2mm 3mm; font-size: 8pt; letter-spacing: .15em; color: #555; display: flex; gap: 3mm; align-items: center; }
.cover .brand img { height: 6mm; }
.cover svg.hex { position: absolute; left: 40mm; top: 66mm; width: 130mm; height: 130mm; }
.cover .kicker { position: absolute; top: 98mm; left: 20mm; font-size: 10pt; letter-spacing: .3em; font-weight: bold; }
.cover h1 { position: absolute; top: 106mm; left: 18mm; margin: 0; font-size: 58pt; letter-spacing: .08em; font-weight: bold; }
.cover h1 small { font-size: 30pt; letter-spacing: .05em; margin-left: 3mm; }
.cover .sub { position: absolute; top: 140mm; left: 20mm; font-size: 17pt; letter-spacing: .45em; color: #555; }
.cover .rule { position: absolute; top: 160mm; left: 20mm; width: 140mm; height: 1.5px; background: linear-gradient(90deg, #111, #111 60%, transparent); }
.cover .rule::before { content: ''; position: absolute; left: -1mm; top: -1.3mm; width: 2.6mm; height: 2.6mm; background: #111; transform: rotate(45deg); }
.cover .tag { position: absolute; top: 168mm; left: 20mm; font-size: 11pt; line-height: 2; }
.cover .who { position: absolute; bottom: 30mm; right: 20mm; text-align: right; font-size: 9pt; line-height: 1.9; }
.cover .who strong { font-size: 10pt; }
.cover .lec { position: absolute; bottom: 30mm; left: 20mm; font-size: 8.5pt; color: #555; }
/* 머리말 */
.intro { background: #f7f7f7; padding: 7mm 6mm 6mm; }
.intro h2 { margin: 0 0 5mm; font-size: 23pt; line-height: 1.3; }
.intro h2 span { background: #111; color: #fff; padding: 0 2mm; }
.intro p { margin: 0 0 3mm; }
.intro .sig { text-align: right; color: #555; margin-top: 4mm; }
.intro .sig strong { color: #111; }
.toc { border: 1px solid #ddd; border-top: 3px solid #111; padding: 6mm 6mm 3mm; }
.toc h3 { margin: 0; font-size: 13pt; }
.toc .lead { font-size: 8pt; color: #777; margin: 1mm 0 4mm; }
.toc .row { display: flex; align-items: center; gap: 6mm; border-bottom: 1px solid #eee; padding: 2.5mm 0; }
.toc .row .n { font-size: 14pt; width: 6mm; }
.toc .row .t { flex: 1; }
.toc .row .u { font-size: 7.5pt; border: 1px solid #bbb; padding: .5mm 2mm; color: #555; }
/* 걸음 */
.stephd { display: flex; border: 1px solid #333; }
.stephd .num { width: 22mm; background: #1d1d1f; color: #fff; font-size: 26pt; display: flex; align-items: center; justify-content: center; }
.stephd .tt { padding: 3mm 5mm; flex: 1; }
.stephd .kick { font-size: 7.5pt; letter-spacing: .3em; color: #555; }
.stephd h2 { margin: 1mm 0 0; font-size: 16pt; }
.trap { border: 1px solid #333; padding: 3mm 5mm 3.5mm; }
.trap .lab { display: inline-block; background: #1d1d1f; color: #fff; font-size: 7.5pt; letter-spacing: .2em; padding: .6mm 3mm; font-weight: bold; }
.trap .q { font-size: 12pt; color: #555; margin: 2.5mm 0 2mm; padding-bottom: 2mm; border-bottom: 1px solid #ddd; }
.trap .a strong { border-bottom: 1.5px solid #111; margin-right: 2mm; }
.truth { border-top: 3px solid #111; border-left: 1px solid #ddd; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 3mm 5mm 1mm; }
.lab2 { font-size: 7.5pt; letter-spacing: .3em; font-weight: bold; color: #333; margin-bottom: 2mm; }
.truth ol { list-style: none; margin: 0; padding: 0; }
.truth li { display: flex; gap: 4mm; padding: 2mm 0; border-bottom: 1px solid #eee; }
.truth li:last-child { border-bottom: 0; }
.truth li .k { flex: 0 0 5mm; height: 5mm; background: #1d1d1f; color: #fff; font-size: 8pt; display: flex; align-items: center; justify-content: center; margin-top: .8mm; }
.fig .box { border: 1px solid #ddd; border-radius: 2mm; background: #fafafa; padding: 4mm 5mm 3mm; text-align: center; }
.fig svg { max-width: 100%; height: auto; max-height: 64mm; font-family: 'DejaVu Sans', 'WenQuanYi Zen Hei', sans-serif; }
.fig .cap { font-size: 8pt; color: #777; margin-top: 2mm; }
.fig .cap2 { font-size: 8.5pt; color: #555; margin-top: 1mm; }
.deep { background: #1d1d1f; color: #f2f2f2; padding: 3.5mm 5mm; }
.deep .lab2 { color: #fff; }
.deep b { border-bottom-color: #f2f2f2; }
.next { border-left: 3px solid #111; padding-left: 3mm; font-size: 9.5pt; color: #444; }
.next strong { color: #111; margin-right: 2mm; }
.fill { flex: 1; background: #f7f7f7; }
/* 모음 쪽 */
.coll h2 { margin: 0; font-size: 17pt; }
.coll .lead { color: #666; font-size: 9pt; margin: 1mm 0 2mm; }
.grp { font-weight: bold; font-size: 10pt; border-bottom: 1.5px solid #111; padding-bottom: 1mm; margin-top: 2mm; }
.it { display: flex; gap: 3mm; padding: 1.3mm 0; border-bottom: 1px solid #eee; font-size: 9.6pt; line-height: 1.5; }
.it .k { flex: 0 0 7mm; color: #555; font-weight: bold; }
.it .tagx { flex: 0 0 10mm; font-size: 7.5pt; border: 1px solid #999; text-align: center; height: 4.4mm; line-height: 4.2mm; margin-top: .4mm; }
.it .body { flex: 1; }
.it .fx { color: #555; font-size: 9pt; }
.pair { border: 1px solid #ddd; padding: 2mm 3mm; display: grid; grid-template-columns: 11mm 1fr; row-gap: 1mm; font-size: 9.4pt; line-height: 1.5; }
.pair .x { color: #777; text-decoration: line-through; text-decoration-color: #aaa; }
.pair .lx, .pair .lo { font-size: 7.5pt; font-weight: bold; text-align: center; height: 4.4mm; line-height: 4.4mm; }
.pair .lx { border: 1px solid #999; color: #777; }
.pair .lo { background: #1d1d1f; color: #fff; }
.extbar { display: flex; align-items: center; gap: 4mm; border: 1px solid #333; padding: 3mm 5mm; }
.extbar .plus { font-size: 22pt; font-weight: bold; }
.extbar .kick { font-size: 7.5pt; letter-spacing: .3em; color: #555; }
.extbar h2 { margin: 0; font-size: 15pt; }
`;
}

function cover(R, D) {
  const hex = [130, 100, 70].map((r, i) => {
    const pts = [0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 3 * k - Math.PI / 2; return (75 + r / 2 * Math.cos(a)).toFixed(1) + ',' + (75 + r / 2 * Math.sin(a)).toFixed(1); }).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#dcdcdc" stroke-width="${i === 0 ? 1.4 : 1}"/>`;
  }).join('') + '<circle cx="75" cy="75" r="16" fill="none" stroke="#d0d0d0"/>';
  return `<section class="page cover"><div class="frame"></div><div class="inner"></div>
  <div class="brand"><img src="${LOGO}" alt="">영재관 · 옳은문장집</div>
  <svg class="hex" viewBox="0 0 150 150">${hex}</svg>
  <div class="kicker">${R} 회차 · 누적 O X</div>
  <h1 class="serif">화학 Ⅰ<small>심화</small></h1>
  <div class="sub">${esc(D.title)}</div>
  <div class="rule"></div>
  <div class="tag">한 번 제대로 읽으면, 그것으로 끝나도록.<br><strong>읽기만 해도 아는 것.</strong> 그게 이 책의 전부다.</div>
  <div class="who"><strong>다원교육 영재관</strong><br>조준모</div>
  <div class="lec">제 ${R} 강 · 선수노트</div></section>`;
}

function shell(R, inner, n, extra) {
  return `<section class="page ${extra || ''}"><div class="hd"><img src="${LOGO}" alt=""><span>화학 Ⅰ 심화 · ${R}회차 옳은문장집</span></div>${inner}<div class="ft">${n}</div></section>`;
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

/* 흐르는 쪽(모음·확장)은 블록 목록으로 넘겨 브라우저에서 쪽을 나눈다 */
function flowBlocks(R, D, items, bp) {
  const B = [];
  B.push({ head: true, html: `<div class="coll"><h2 class="serif">옳은 문장집</h2><div class="lead">시험 전날, 그림은 덮고 이 문장만 처음부터 끝까지 한 번 훑어라. 여기 적힌 게 ${R}회차의 정답이다.</div></div>` });
  D.steps.forEach(s => {
    B.push({ html: `<div class="grp">${esc(s.title)}</div>`, keep: true });
    s.truths.forEach((t, k) => B.push({ html: `<div class="it"><span class="k">${k + 1}</span><span class="body">${md(t)}</span></div>` }));
  });
  B.push({ brk: true });
  B.push({ head: true, html: `<div class="coll"><h2 class="serif">낚시 문장집</h2><div class="lead">전부 그럴듯하지만 전부 틀린 문장이다. 어디가 틀렸는지 먼저 잡아낸 다음 답을 봐라 · 안 낚이면 고수.</div></div>` });
  D.steps.forEach((s, i) => B.push({ html: `<div class="it"><span class="k">${pad(i + 1)}</span><span class="body">${esc(s.trap.q)}<div class="fx">진짜는 · ${md(s.trap.fix)}</div></span></div>` }));
  B.push({ brk: true });
  B.push({ head: true, html: `<div class="extbar"><span class="plus">+</span><div><div class="kick">심 화 확 장 · ${R} 회 차 정 시 6 0 문 항</div><h2>이번 시험의 옳은 문장 전부</h2></div></div><div class="coll"><div class="lead">${R}회차 정시 60문항을 모두 옳은 문장으로 바꿔 적었다. 복습 칸은 앞 회차 개념, 신규 칸은 이번 회차 개념이다. 이 쪽을 다 읽으면 시험지의 정답을 다 본 것이다.</div></div>` });
  let last = '';
  items.forEach((it, k) => {
    const g = bp[k]['구획'] === '신규' ? '신규 · 이번 회차' : '복습 · 앞 회차';
    if (g !== last) { B.push({ html: `<div class="grp">${g}</div>`, keep: true }); last = g; }
    B.push({ html: `<div class="it"><span class="k">${it.n.split('-')[1]}</span><span class="body">${esc(it.f)}</span></div>` });
  });
  const xs = items.filter(it => it.a === 'X');
  B.push({ brk: true });
  B.push({ head: true, html: `<div class="coll"><h2 class="serif">흔한 함정 바로잡기</h2><div class="lead">이번 시험의 틀린 문장 ${xs.length}개와 바로잡은 문장이다. 어디를 고쳤는지 짚어 가며 읽어라.</div></div>` });
  xs.forEach(it => B.push({ html: `<div class="pair"><span class="lx">틀림</span><span class="x">${esc(it.s)}</span><span class="lo">맞음</span><span>${esc(it.f)}</span></div>` }));
  return B;
}

function html(R) {
  const D = JSON.parse(fs.readFileSync(path.join(HERE, 'round_' + pad(R) + '.json'), 'utf8'));
  const RF = JSON.parse(fs.readFileSync(path.join(CH, '..', '..', 'appdata', 'round_ch1s_' + pad(R) + '.json'), 'utf8'));
  const design = JSON.parse(fs.readFileSync(path.join(CH, 'design.json'), 'utf8'));
  const bp = design.blueprint[String(R)];
  const blocks = flowBlocks(R, D, RF.jeongsi.items, bp);
  let n = 1, pages = [cover(R, D), shell(R, intro(R, D), n++)];
  D.steps.forEach((s, i) => pages.push(shell(R, step(s, i), n++, 'stepPage')));
  return { D, n, doc: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css()}</style></head><body>${pages.join('')}
<div id="flowpages"></div>
<script>
const BLOCKS = ${JSON.stringify(blocks)};
let pn = ${n};
const host = document.getElementById('flowpages');
function newPage() {
  const s = document.createElement('section'); s.className = 'page flow';
  s.innerHTML = '<div class="hd"><img src="${LOGO}" alt=""><span>화학 Ⅰ 심화 · ${R}회차 옳은문장집</span></div><div class="ft">' + (pn++) + '</div>';
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:1.6mm;flex:1;min-height:0;overflow:hidden';
  s.insertBefore(body, s.lastChild); host.appendChild(s); return body;
}
let body = newPage(), pendingKeep = null;
for (const b of BLOCKS) {
  if (b.brk) { if (body.children.length) body = newPage(); continue; }
  const d = document.createElement('div'); d.innerHTML = b.html; const el = d.firstElementChild ? d : d;
  body.appendChild(d);
  if (body.scrollHeight > body.clientHeight + 1) {
    body.removeChild(d);
    const carry = (body.lastElementChild && body.lastElementChild.dataset.keep) ? body.lastElementChild : null;
    if (carry) body.removeChild(carry);
    body = newPage();
    if (carry) body.appendChild(carry);
    body.appendChild(d);
  }
  if (b.keep) d.dataset.keep = '1';
}
window.__overflow = [...document.querySelectorAll('.stepPage, .page:not(.flow):not(.cover)')].map((p, i) => p.scrollHeight > p.clientHeight + 1 ? p.querySelector('h2') && p.querySelector('h2').textContent : null).filter(Boolean);
window.__fillMin = [...document.querySelectorAll('.stepPage .fill')].map(f => f.getBoundingClientRect().height);
</script></body></html>` };
}

async function render(browser, R, pngDir) {
  const { doc } = html(R);
  const page = await browser.newPage();
  await page.setContent(doc, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const over = await page.evaluate(() => window.__overflow);
  const fill = await page.evaluate(() => window.__fillMin);
  const out = path.join(DT, 'truthbooks', 'chem1s_round' + pad(R) + '_truthbook_bw.pdf');
  if (over.length) { await page.close(); throw new Error(R + '회 걸음 쪽이 넘친다: ' + over.join(' / ') + ' — 글을 줄여라'); }
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  if (pngDir) {
    fs.mkdirSync(pngDir, { recursive: true });
    const secs = await page.$$('section.page');
    for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: path.join(pngDir, 'r' + pad(R) + '_p' + pad(i + 1) + '.png') });
  }
  await page.close();
  return { out, fill };
}

(async () => {
  const arg = process.argv[2];
  const pi = process.argv.indexOf('--png');
  const pngDir = pi > 0 ? process.argv[pi + 1] : null;
  const rounds = arg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [Number(arg)];
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const outs = [];
  try {
    for (const R of rounds) {
      const r = await render(browser, R, pngDir);
      outs.push(r.out);
      console.log('OK', path.relative(DT, r.out), '걸음 여백(mm 아님 px)', r.fill.map(x => Math.round(x)).join(','));
    }
  } finally { await browser.close(); }
  if (arg === 'all') console.log('합본은 python3 courses/ch1s/truthbook/volume.py 로 만든다.');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
