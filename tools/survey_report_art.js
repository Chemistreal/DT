/* ============================================================
   「화학1 돌아보기 진단 보고서」 Word 판의 꾸밈 그림을 그린다 → assets/survey_report/
   ------------------------------------------------------------
   survey_docx.js 가 누를 때 이 그림들을 불러 Word 안에 넣는다. 그림은 모두 여기서 SVG 로 직접 그려
   Chromium 으로 굽는다(exam 성적표의 자산을 베끼지 않는다 — 짙은 초록 + 절제된 금색, 벤젠 고리 문양).

     cover.jpg       표지 전면 배경(A4 · 192dpi). 위 148mm 초록 띠 · 금빛 띠 · 인장 · 아래 크림 바탕
     frame.png       본문 쪽 틀(A4 · 투명). 초록 겉선 + 금빛 속선, 네 귀 육각 장식, 오른쪽 아래 옅은 분자 문양
     divider.png     장식 줄(요약·목차·부모님께 머리 밑). 금빛 선 — 마름모 — 육각 — 마름모 — 선
     logo-green.png  다원교육 로고를 이 보고서 색으로(글자 짙은 초록 · 고리 금색) — 원본은 --logo 로 준다
     logo-white.png  같은 로고의 흰색판(초록 바탕 위)

   실행:
       NODE_PATH=/opt/node22/lib/node_modules node tools/survey_report_art.js [--logo 원본로고.png]
       (--logo 를 안 주면 저장소의 courses/ch1s/truthbook/logo.png 회색 로고를 물들인다)
   좌표는 A4 를 96dpi 로 본 794×1123 이다(1px = 15 twip) — survey_docx.js 표지 표의 높이와 맞춰 두었다:
       초록 띠 0~560px(= 8400 twip) · 금빛 띠 560~565px · 인장 중심 (668, 562).
   ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'survey_report');
const W = 794, H = 1123;
const G9 = '#0B3B30', G8 = '#0E5A4C', G7 = '#1F6F5C', GOLD = '#A9853C', GOLD2 = '#C9A962', GOLD3 = '#E2CF9C', CREAM = '#FBFAF6';

function hex(cx, cy, r, rot) {
  rot = rot == null ? Math.PI / 6 : rot;
  let d = '';
  for (let k = 0; k < 6; k++) { const a = rot + k * Math.PI / 3; d += (k ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1); }
  return d + 'Z';
}
/* 벤젠 고리 격자 — (x0,y0)~(x1,y1) 안 */
function lattice(x0, y0, x1, y1, r, gap) {
  let d = '';
  const dx = r * Math.sqrt(3) + gap, dy = r * 1.5 + gap * 0.87;
  for (let row = 0, y = y0; y < y1 + r; row++, y += dy)
    for (let x = x0 + (row % 2 ? dx / 2 : 0); x < x1 + r; x += dx) d += hex(x, y, r);
  return d;
}
/* 다환 방향족(나프탈렌·안트라센 같은 이어 붙인 고리) — 표지 띠 오른쪽 장식 */
function fused(cx, cy, r, cells) {
  const w = r * Math.sqrt(3);
  return cells.map(([i, j]) => hex(cx + i * w + (j % 2 ? w / 2 : 0), cy + j * r * 1.5, r)).join('');
}

/* 이어 붙인 육각의 꼭짓점 몇 개(원자 자리) — [i, j, 꼭짓점 번호 0~5] */
function fusedNodes(cx, cy, r, picks) {
  const w = r * Math.sqrt(3);
  return picks.map(([i, j, k]) => { const x = cx + i * w + (j % 2 ? w / 2 : 0), y = cy + j * r * 1.5, a = Math.PI / 6 + k * Math.PI / 3; return [x + r * Math.cos(a), y + r * Math.sin(a)]; });
}
function coverSVG() {
  const band = 560;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.55" y2="1"><stop offset="0" stop-color="#106653"/><stop offset=".55" stop-color="${G8}"/><stop offset="1" stop-color="#08291F"/></linearGradient>
    <radialGradient id="glow" cx=".86" cy=".2" r=".6"><stop offset="0" stop-color="#2B8A70" stop-opacity=".55"/><stop offset="1" stop-color="#2B8A70" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#8F6E2C"/><stop offset=".22" stop-color="${GOLD2}"/><stop offset=".5" stop-color="${GOLD3}"/><stop offset=".78" stop-color="${GOLD2}"/><stop offset="1" stop-color="#8F6E2C"/></linearGradient>
    <linearGradient id="fadeL" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".7" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="mL"><rect width="${W}" height="${band}" fill="url(#fadeL)"/></mask>
    <radialGradient id="fadeB" cx="1" cy="1" r="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".55" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="mB"><rect x="0" y="${band}" width="${W}" height="${H - band}" fill="url(#fadeB)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect width="${W}" height="${band}" fill="url(#bg)"/>
  <rect width="${W}" height="${band}" fill="url(#glow)"/>
  <g mask="url(#mL)"><path d="${lattice(-20, 18, W + 20, band - 10, 21, 13)}" fill="none" stroke="#fff" stroke-opacity=".075" stroke-width="1.3"/></g>
  <!-- 오른쪽 위: 금빛 고리 두 겹 + 이어 붙인 육각 -->
  <g fill="none" stroke="${GOLD3}" stroke-linecap="round">
    <circle cx="676" cy="150" r="176" stroke-opacity=".22" stroke-width="1.6"/>
    <circle cx="676" cy="150" r="138" stroke-opacity=".30" stroke-width="2.2"/>
    <circle cx="676" cy="150" r="98" stroke-opacity=".14" stroke-width="1"/>
    <path d="${fused(600, 104, 30, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [1, 2]])}" stroke-opacity=".34" stroke-width="1.8" stroke-linejoin="round"/>
  </g>
  <g fill="${GOLD3}" fill-opacity=".6">${fusedNodes(600, 104, 30, [[0, 0, 4], [1, 0, 5], [2, 0, 0], [0, 1, 2], [1, 2, 1], [2, 0, 4]]).map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"/>`).join('')}</g>
  <!-- 띠 아래 가장자리: 가는 금선 + 금빛 띠 -->
  <rect x="0" y="${band - 1}" width="${W}" height="1" fill="${GOLD3}" fill-opacity=".35"/>
  <rect x="0" y="${band}" width="${W}" height="5" fill="url(#gold)"/>
  <rect x="0" y="${band + 5}" width="${W}" height="1.2" fill="${G9}" fill-opacity=".55"/>
  <!-- 아래 바탕: 오른쪽 아래로 옅은 육각 -->
  <g mask="url(#mB)"><path d="${lattice(330, band + 40, W + 20, H + 20, 19, 11)}" fill="none" stroke="${G8}" stroke-opacity=".07" stroke-width="1.1"/></g>
  <!-- 아래 틀: 금빛 가는 겹선 -->
  <g fill="none">
    <path d="M28 ${band + 28} V${H - 28} H${W - 28} V${band + 28}" stroke="${GOLD2}" stroke-opacity=".75" stroke-width=".9"/>
    <path d="M33 ${band + 33} V${H - 33} H${W - 33} V${band + 33}" stroke="${GOLD2}" stroke-opacity=".45" stroke-width=".5"/>
  </g>
  ${[[28, H - 28], [W - 28, H - 28]].map(p => `<path d="${hex(p[0], p[1], 6, 0)}" fill="${CREAM}" stroke="${GOLD}" stroke-width="1.1"/><circle cx="${p[0]}" cy="${p[1]}" r="1.6" fill="${GOLD}"/>`).join('')}
  <!-- 맨 아래 초록 띠 -->
  <rect x="0" y="${H - 12}" width="${W}" height="12" fill="${G9}"/>
  <rect x="0" y="${H - 14}" width="${W}" height="2" fill="url(#gold)"/>
  <!-- 인장 -->
  <g transform="translate(668 ${band + 2})">
    <circle r="62" fill="#08291F" fill-opacity=".18" transform="translate(0 3)"/>
    <circle r="60" fill="#fff"/>
    <circle r="56" fill="none" stroke="${GOLD}" stroke-width="2.2"/>
    <circle r="49" fill="none" stroke="${GOLD}" stroke-width=".8"/>
    <path d="${hex(0, 0, 21)}" fill="none" stroke="${G8}" stroke-width="3"/>
    <circle r="10.5" fill="none" stroke="${G8}" stroke-width="2"/>
    ${[0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 6 + k * Math.PI / 3; return `<circle cx="${(31 * Math.cos(a)).toFixed(1)}" cy="${(31 * Math.sin(a)).toFixed(1)}" r="1.6" fill="${GOLD}"/>`; }).join('')}
    <path id="arcT" d="M-40 0 A40 40 0 0 1 40 0" fill="none"/>
    <path id="arcB" d="M-40 0 A40 40 0 0 0 40 0" fill="none"/>
    <text font-family="DejaVu Sans, sans-serif" font-size="8.6" font-weight="700" letter-spacing="2.4" fill="#8A6A38"><textPath href="#arcT" startOffset="50%" text-anchor="middle">REVIEW · 2026</textPath></text>
    <text font-family="DejaVu Sans, sans-serif" font-size="8.6" font-weight="700" letter-spacing="2.4" fill="#8A6A38" dy="8"><textPath href="#arcB" startOffset="50%" text-anchor="middle">18 WEEKS</textPath></text>
  </g>
</svg>`;
  return s;
}

function frameSVG() {
  const o = 24, i = 29;
  const corner = (x, y) => `<path d="${hex(x, y, 7.5, 0)}" fill="#fff" stroke="${GOLD}" stroke-width="1.1"/><path d="${hex(x, y, 3.6, 0)}" fill="${G8}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="f" cx="1" cy="1" r="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".6" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="m"><rect x="${i}" y="${i}" width="${W - 2 * i}" height="${H - 2 * i}" fill="url(#f)"/></mask>
  </defs>
  <g mask="url(#m)"><path d="${lattice(470, 760, W, H, 17, 10)}" fill="none" stroke="${G8}" stroke-opacity=".055" stroke-width="1"/></g>
  <rect x="${o}" y="${o}" width="${W - 2 * o}" height="${H - 2 * o}" fill="none" stroke="${G8}" stroke-opacity=".55" stroke-width="1"/>
  <rect x="${i}" y="${i}" width="${W - 2 * i}" height="${H - 2 * i}" fill="none" stroke="${GOLD2}" stroke-opacity=".7" stroke-width=".6"/>
  ${[[o, o], [W - o, o], [o, H - o], [W - o, H - o]].map(p => corner(p[0], p[1])).join('')}
  <path d="M${W / 2 - 34} ${o} H${W / 2 + 34}" stroke="#fff" stroke-width="3"/>
  <g transform="translate(${W / 2} ${o})"><path d="M-30 0 H-9 M9 0 H30" stroke="${GOLD}" stroke-width="1"/><path d="M0 -4.5 L4.5 0 L0 4.5 L-4.5 0 Z" fill="${GOLD}"/></g>
</svg>`;
}

function dividerSVG() {
  const w = 600, h = 54, c = w / 2, y = 27;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="l" gradientUnits="userSpaceOnUse" x1="40" x2="${c - 46}" y1="0" y2="0"><stop offset="0" stop-color="${GOLD2}" stop-opacity="0"/><stop offset="1" stop-color="${GOLD}"/></linearGradient>
  <linearGradient id="r" gradientUnits="userSpaceOnUse" x1="${w - 40}" x2="${c + 46}" y1="0" y2="0"><stop offset="0" stop-color="${GOLD2}" stop-opacity="0"/><stop offset="1" stop-color="${GOLD}"/></linearGradient></defs>
  <path d="M40 ${y} H${c - 46}" stroke="url(#l)" stroke-width="1.4"/><path d="M${c + 46} ${y} H${w - 40}" stroke="url(#r)" stroke-width="1.4"/>
  <path d="M60 ${y + 5} H${c - 52}" stroke="url(#l)" stroke-width=".6" opacity=".7"/><path d="M${c + 52} ${y + 5} H${w - 60}" stroke="url(#r)" stroke-width=".6" opacity=".7"/>
  ${[-34, 34].map(d => `<path d="M${c + d} ${y - 5} L${c + d + 5} ${y} L${c + d} ${y + 5} L${c + d - 5} ${y} Z" fill="${GOLD}"/>`).join('')}
  <path d="${hex(c, y, 14)}" fill="#fff" stroke="${GOLD}" stroke-width="1.6"/>
  <path d="${hex(c, y, 8.5)}" fill="none" stroke="${G8}" stroke-width="1.6"/>
  <circle cx="${c}" cy="${y}" r="3.4" fill="${G8}"/>
</svg>`;
}

async function main() {
  const argLogo = process.argv.indexOf('--logo') >= 0 ? process.argv[process.argv.indexOf('--logo') + 1] : null;
  const logoSrc = argLogo || path.join(ROOT, 'courses/ch1s/truthbook/logo.png');
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  fs.mkdirSync(OUT, { recursive: true });
  async function shot(svg, file, opt) {
    const w = Number(/width="(\d+)"/.exec(svg)[1]), h = Number(/height="(\d+)"/.exec(svg)[1]);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.screenshot(Object.assign({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } }, opt));
    console.log('  ' + file + '  ' + (fs.statSync(path.join(OUT, file)).size / 1024).toFixed(0) + 'KB');
  }
  await shot(coverSVG(), 'cover.jpg', { type: 'jpeg', quality: 90 });
  await shot(frameSVG(), 'frame.png', { omitBackground: true });
  await shot(dividerSVG(), 'divider.png', { omitBackground: true });
  /* 로고 물들이기 — 남색 글자 → 짙은 초록, 주황 고리 → 금색, 회색 네모는 초록빛 회색. 회색 로고면 밝기로 가른다. */
  const b64 = fs.readFileSync(logoSrc).toString('base64');
  for (const [file, mode] of [['logo-green.png', 'green'], ['logo-white.png', 'white']]) {
    const data = await page.evaluate(async ([src, mode]) => {
      const im = new Image(); im.src = src; await im.decode();
      const sc = Math.min(1, 1200 / im.naturalWidth), w = Math.round(im.naturalWidth * sc), h = Math.round(im.naturalHeight * sc);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h), p = d.data;
      const T = mode === 'green' ? { text: [14, 90, 76], ring: [169, 133, 60], sq: [150, 166, 158], sq2: [205, 214, 209] } : { text: [255, 255, 255], ring: [217, 199, 154], sq: [190, 214, 204], sq2: [150, 190, 175] };
      for (let k = 0; k < p.length; k += 4) {
        const r = p[k], gg = p[k + 1], b = p[k + 2], a = p[k + 3]; if (!a) continue;
        let c;
        const sat = Math.max(r, gg, b) - Math.min(r, gg, b), lum = (r + gg + b) / 3;
        if (b > r + 40 && b > gg) c = T.text;                       // 남색 글자
        else if (r > 180 && r > b + 60) c = T.ring;                  // 주황 고리
        else if (sat < 30 && lum < 90) c = T.text;                   // 회색 로고의 진한 글자
        else if (sat < 30 && lum < 175) c = T.sq;                    // 회색 네모
        else c = T.sq2;                                              // 밝은 회색
        p[k] = c[0]; p[k + 1] = c[1]; p[k + 2] = c[2];
      }
      g.putImageData(d, 0, 0);
      return cv.toDataURL('image/png').split(',')[1];
    }, ['data:image/png;base64,' + b64, mode]);
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
    console.log('  ' + file + '  ' + (fs.statSync(path.join(OUT, file)).size / 1024).toFixed(0) + 'KB');
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
