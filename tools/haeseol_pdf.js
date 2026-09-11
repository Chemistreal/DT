#!/usr/bin/env node
/* ============================================================
   해설지 HTML → PDF   haeseol_<과목>_round<NN>.html → 같은 이름 .pdf (저장소 루트)
   ------------------------------------------------------------
   학생이 내려받는 해설은 index.html 이 거는 **루트의 PDF** 다(PDF_BASE='./',
   materials.json 도 같은 파일을 건다). HTML 을 고쳐도 PDF 를 다시 찍지 않으면
   학생은 옛 해설을 받는다 — tools/haeseol_sync.py 가 HTML 을 JSON 에 맞춘 뒤
   이 도구로 PDF 를 다시 찍는다.

   만든 도구가 저장소에 없었다. 있던 PDF 를 재어 보니(2026-09-11) 35장 전부
   Chromium 141(Skia/PDF m141) 이 A4 로 찍은 것이고 글꼴(LiberationSans ·
   WenQuanYiZenHei)도 이 검사 환경의 것이라, 같은 방법으로 되살린다.
   `format:'A4'` 로 찍어야 전과 같은 쪽 크기(595.92×842.88pt)가 나온다 —
   preferCSSPageSize 는 594.96×841.92 로 조금 다르다.

   ⚠ appdata/haeseol_*.pdf 는 다른 판(두 쪽 「빠른 정답 + 문항 해설」)이고
     만든 도구가 저장소에 없다. 여기서 만들지 않는다.
   ⚠ 화학Ⅱ 1·2회 PDF 는 pypdf 로 다시 묶인 것이라(제목이 HTML 과 엇갈려 있다)
     tools/haeseol_sync.py 의 KNOWN_SWAP 이 풀리기 전에는 찍지 않는다.

   실행:
     NODE_PATH=tests/node_modules node tools/haeseol_pdf.js haeseol_ch1_round06.html [...]
     NODE_PATH=tests/node_modules node tools/haeseol_pdf.js --all
     … --out <폴더>    루트 대신 다른 곳에 찍는다(견본 비교용)
   CHROMIUM_PATH 를 주면 그 크로뮴을 쓴다(검사 환경: /opt/pw-browsers/…/chrome).
   찍은 뒤 전 파일이 있으면 크기를 나란히 찍고, 10% 넘게 달라지면 알린다 —
   쪽수·글자는 python3 로 따로 재어 본다(pymupdf).
   ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE || 'playwright';
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['haeseol_ch2_round01.html', 'haeseol_ch2_round02.html']);   // KNOWN_SWAP

const argv = process.argv.slice(2);
let out = ROOT;
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') { out = path.resolve(argv[++i]); continue; }
  if (argv[i] === '--all') {
    fs.readdirSync(ROOT).filter(f => /^haeseol_[a-z0-9]+_round\d+\.html$/.test(f)).sort()
      .forEach(f => files.push(f));
    continue;
  }
  files.push(path.basename(argv[i]));
}
if (!files.length) {
  console.log('쓰는 법: node tools/haeseol_pdf.js haeseol_ch1_round06.html … | --all  [--out 폴더]');
  process.exit(2);
}

let chromium;
try { ({ chromium } = require(PLAYWRIGHT)); }
catch (e) {
  console.log('실패: playwright 를 찾지 못했다 — NODE_PATH=tests/node_modules 를 준다');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage();
  let fail = 0;
  for (const f of files) {
    if (SKIP.has(f)) { console.log(`  SKIP  ${f}  (KNOWN_SWAP — 선생님 확인 뒤)`); continue; }
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) { console.log(`  FAIL  ${f}  없다`); fail++; continue; }
    const dst = path.join(out, f.replace(/\.html$/, '.pdf'));
    const before = fs.existsSync(dst) ? fs.statSync(dst).size : 0;
    try {
      await page.goto('file://' + src, { waitUntil: 'load' });
      await page.pdf({ path: dst, format: 'A4', printBackground: true });
    } catch (e) {
      console.log(`  FAIL  ${f}  ${String(e.message || e).slice(0, 80)}`); fail++; continue;
    }
    const after = fs.statSync(dst).size;
    const jump = before && Math.abs(after - before) / before > 0.10;
    console.log(`  ${jump ? 'WARN' : 'ok  '}  ${path.basename(dst)}  ${before ? before + ' → ' : ''}${after} bytes${jump ? '  (10% 넘게 달라졌다 — 쪽수를 봐라)' : ''}`);
  }
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
