/* ============================================================
   「화학1 돌아보기」 Word(.docx) 보고서 — 실제로 만들고, LibreOffice 로 PDF 를 찍어 잰다
   ------------------------------------------------------------
   가상 학생 넷(tests/fixtures/survey_fake.js — 세 곳 자료가 다 있는 학생 · 숨은 실력형 · 기록 없음 · 설문 없음)을
   survey_print.html 에서 열어 «Word 보고서 저장»을 눌러 받고, 반 일괄 화면에서 «반 전체 Word 저장»도 받는다.
   서버 응답은 모두 가짜다(실제 Apps Script·exam·KMChC 주소로는 아무 요청도 나가지 않는다).

   재는 것
   - 파일이 열리는가(zip · word/document.xml) · 그래프 그림이 실제로 들어갔는가(word/media 개수)
   - 화면 «한눈에 보기» 타일 넷의 숫자 = Word 타일 넷의 숫자(같은 계산 — 다른 말을 하면 안 된다)
   - 금지 낱말(상·금상·은상·동상·수상·등수·석차·더닝·백분위)이 없다 · 「화학 · 다원교육 · 조준모」가 표지·머리글·바닥글에 있다
   - LibreOffice PDF 로: 학생별 쪽수 16~28 · 거의 빈 장 0 · 제목만 남은 쪽 0 · 표지 바닥 여유 ≥ 80pt
     (빈 공간이 반 넘는 쪽은 마지막 쪽 말고는 0 을 목표로 하고, 몇 쪽인지 적는다)
   - 반 전체 Word: 학생마다 Word 구역 하나 · 쪽 번호는 학생마다 1부터
   soffice 가 없으면 REQUIRE_SOFFICE 일 때 실패, 아니면 PDF 검사만 건너뛴다.

   실행:
       NODE_PATH=/opt/node22/lib/node_modules node tests/survey_docx.js
       SP_DOCX_OUT=/경로  를 주면 docx·pdf 를 거기에 남긴다(견본).   SP_ONLY=A 이면 A 한 명만(다듬을 때).
   ============================================================ */
'use strict';
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const F = require('./fixtures/survey_fake.js');
const { ROOT, CODES, PA, PB, PC, PD, routeAll } = F;

const PORT = Number(process.env.PORT || 8958);
const OUT = process.env.SP_DOCX_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'spdocx-'));
fs.mkdirSync(OUT, { recursive: true });
const BRAND = '화학 · 다원교육 · 조준모';
const FORBID = /금상|은상|동상|수상|등수|석차|더닝|백분위|(?:^|[^가-힣])상(?:[을이은도]|권)?(?=[^가-힣]|$)/;

let fail = 0;
const chk = (name, ok, info) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok ? (info != null && info !== '' ? '  · ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '') : '  → ' + JSON.stringify(info))); if (!ok) fail++; };
const note = (s) => console.log('  ·     ' + s);

function has(cmd) { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch (e) { return false; } }
function unzipList(file) { return execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n').filter(Boolean); }
function unzipText(file, part) { return execFileSync('unzip', ['-p', file, part], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
function xmlText(xml) { return xml.replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, ' ').replace(/<\/w:(tc|p|tr)>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' '); }

/* ── PDF 재기 ── 쪽 크기·여백은 survey_docx.js PG 와 같다(twip/20 = pt) */
const PG = { top: 1420 / 20, bottom: 1300 / 20, side: 1080 / 20 };
function pdfWords(pdf) {
  const html = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const pages = [];
  html.split(/<page /).slice(1).forEach(chunk => {
    const w = Number(/width="([\d.]+)"/.exec(chunk)[1]), h = Number(/height="([\d.]+)"/.exec(chunk)[1]);
    const words = [];
    const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g; let m;
    while ((m = re.exec(chunk))) words.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') });
    pages.push({ w, h, words });
  });
  return pages;
}
/* 쪽 그림(회색 PGM)에서 본문 칸의 마지막 «잉크» 줄 → 채움 비율 */
function pdfFill(pdf, tmp) {
  const pre = path.join(tmp, path.basename(pdf, '.pdf') + '-g');
  execFileSync('pdftoppm', ['-r', '30', '-gray', pdf, pre]);
  const files = fs.readdirSync(tmp).filter(f => f.startsWith(path.basename(pre) + '-') && f.endsWith('.pgm')).sort();
  return files.map(f => {
    const buf = fs.readFileSync(path.join(tmp, f));
    let i = 0; const tok = () => { while (/\s/.test(String.fromCharCode(buf[i]))) i++; let s = ''; while (!/\s/.test(String.fromCharCode(buf[i]))) s += String.fromCharCode(buf[i++]); return s; };
    tok(); const W = +tok(), H = +tok(); tok(); i++;
    const px = (x, y) => buf[i + y * W + x];
    const sc = H / 841.89, top = Math.round(PG.top * sc), bot = Math.round((841.89 - PG.bottom) * sc), x0 = Math.round(PG.side * sc) + 2, x1 = Math.round((595.28 - PG.side) * sc) - 2;
    let last = -1;
    for (let y = top; y < bot; y++) { for (let x = x0; x < x1; x++) if (px(x, y) < 215) { last = y; break; } }
    fs.unlinkSync(path.join(tmp, f));
    return last < 0 ? 0 : (last - top) / (bot - top);
  });
}

async function main() {
  const srv = spawn(process.execPath, ['-e', `
    const http=require('http'),fs=require('fs'),p=require('path');
    const T={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'};
    http.createServer((q,s)=>{ const f=p.join(${JSON.stringify(ROOT)}, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f,(e,d)=>e?(s.writeHead(404),s.end()):(s.writeHead(200,{'Content-Type':T[p.extname(f)]||'application/octet-stream'}),s.end(d))); }).listen(${PORT});`], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  let chromium;
  try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
  catch (e) { srv.kill(); if (process.env.REQUIRE_BROWSER) { console.log('실패: playwright 를 찾지 못했다'); process.exit(1); } console.log('건너뜀: playwright 를 찾지 못했다'); process.exit(0); }
  /* LANG 이 비어 있으면(컨테이너) 크로뮴이 한글 내려받기 이름을 «download» 로 바꾼다 — UTF-8 로 띄운다 */
  const browser = await chromium.launch(Object.assign({ env: Object.assign({}, process.env, { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }) }, process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));
  const made = [];   // {who, name, file, tiles, plan}
  try {
    const WHO = [['A', PA, true, '세 곳 자료(대표 견본)'], ['B', PB, false, '숨은 실력형'], ['C', PC, false, '기록 없음'], ['D', PD, false, '설문 없음']].filter(x => !process.env.SP_ONLY || process.env.SP_ONLY.indexOf(x[0]) >= 0);
    console.log('\n── survey_print.html · «Word 보고서 저장» ──');
    for (const [k, P, admin, label] of WHO) {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 }, acceptDownloads: true });
      if (admin) await ctx.addInitScript(() => { try { localStorage.setItem('sp_admin', '1'); } catch (e) {} });
      const page = await ctx.newPage(), errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
      await routeAll(page);
      await page.goto(`http://localhost:${PORT}/survey_print.html?student=${CODES[k]}${admin ? '&admin=1' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__SP_READY || window.__SP_ERR, null, { timeout: 90000 });
      const order = await page.evaluate(() => [...document.querySelectorAll('.pv-bar button')].map(b => b.id));
      if (k === 'A') chk('«Word 보고서 저장»이 인쇄 단추보다 앞에 있고 주 단추다', order.indexOf('pvDocx') >= 0 && order.indexOf('pvDocx') < order.indexOf('pvPrint') && await page.evaluate(() => !document.querySelector('#pvDocx').classList.contains('ghost')), order);
      const taken = await page.evaluate(() => (window.__SP_A && window.__SP_A.record && window.__SP_A.record.taken) || 0);
      const tiles = await page.evaluate(() => [...document.querySelectorAll('.sp-kpi')].map(x => ({ t: x.querySelector('.t').innerText.trim(), v: x.querySelector('.v').innerText.replace(/\s+/g, '') })));
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('#pvDocx')]);
      const file = path.join(OUT, dl.suggestedFilename());
      await dl.saveAs(file);
      const info = await page.evaluate(() => window.__SP_DOCX || null);
      chk(k + ' (' + label + '): Word 를 오류 없이 만들었다 · ' + path.basename(file), !errs.length && fs.statSync(file).size > 20000 && !!info, errs.slice(0, 3));
      chk(k + ': 파일 이름 «화학1 돌아보기 진단 보고서 - ' + P.name + '.docx»', path.basename(file) === '화학1 돌아보기 진단 보고서 - ' + P.name + '.docx', path.basename(file));
      made.push({ who: k, label, name: P.name, file, tiles, taken, plan: info && info.plan[0] });
      await ctx.close();
    }

    if (!process.env.SP_ONLY) {
      console.log('\n── survey_print_batch.html · «반 전체 Word 저장» ──');
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 }, acceptDownloads: true });
      const page = await ctx.newPage(), errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
      await routeAll(page);
      await page.goto(`http://localhost:${PORT}/survey_print_batch.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#pvPairs table', { timeout: 60000 });
      chk('학생마다 «Word 저장» 단추', await page.evaluate(() => document.querySelectorAll('#pvPairs .pv-one-docx').length) === 3, '');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('#pvDocxAll')]);
      const file = path.join(OUT, dl.suggestedFilename());
      await dl.saveAs(file);
      chk('반 전체 Word 를 오류 없이 만들었다 · ' + path.basename(file), !errs.length && fs.statSync(file).size > 50000, errs.slice(0, 3));
      const xml = unzipText(file, 'word/document.xml');
      const nSect = (xml.match(/<w:sectPr/g) || []).length, nStart = (xml.match(/<w:pgNumType w:start="1"/g) || []).length;
      chk('반 전체: 학생 셋 = Word 구역 셋 · 쪽 번호는 구역마다 1부터', nSect === 3 && nStart === 3, [nSect, nStart]);
      const fxml = unzipList(file).filter(f => /^word\/footer\d+\.xml$/.test(f)).map(f => unzipText(file, f)).join('');
      chk('반 전체: 바닥글 «쪽 n / N» 의 N 은 그 학생 구역의 쪽수(SECTIONPAGES)', /SECTIONPAGES/.test(fxml), '');
      const txt = xmlText(xml);
      chk('반 전체: 세 학생 이름이 다 들어 있다', [PA.name, PB.name, PC.name].every(n => txt.indexOf(n) >= 0), '');
      /* 줄마다 «Word 저장» — B 한 명 */
      const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('#pvPairs tr:nth-child(2) .pv-one-docx')]);
      chk('줄마다 «Word 저장»은 그 학생 한 명 파일', dl2.suggestedFilename() === '화학1 돌아보기 진단 보고서 - ' + PB.name + '.docx', dl2.suggestedFilename());
      made.push({ who: 'batch', label: '반 전체', name: '반 전체', file, batch: true });
      await ctx.close();
    }
  } finally { await browser.close(); srv.kill(); }

  console.log('\n── docx 안 ──');
  for (const m of made) {
    if (m.batch) continue;
    const parts = unzipList(m.file);
    chk(m.who + ': 열리는 docx(document.xml · styles.xml)', parts.indexOf('word/document.xml') >= 0 && parts.indexOf('word/styles.xml') >= 0, parts.length);
    const media = parts.filter(f => /^word\/media\//.test(f));
    const want = m.who === 'A' ? 11 : m.who === 'C' ? 6 : 8;
    chk(m.who + ': 그림 ' + media.length + '개(꾸밈 4 + 그래프) — 그래프가 실제로 들어갔다', media.length >= want, media);
    const xml = unzipText(m.file, 'word/document.xml'), txt = xmlText(xml);
    const bk = (xml.match(/<w:bookmarkStart [^>]*w:id="(\d+)"/g) || []).map(x => /w:id="(\d+)"/.exec(x)[1]);
    chk(m.who + ': 목차 책갈피 ' + bk.length + '개 · 번호가 겹치지 않는다(Word 가 고치기 창을 띄우지 않게)', bk.length >= 17 && new Set(bk).size === bk.length, bk.slice(0, 5));
    const hf = parts.filter(f => /^word\/(header|footer)\d+\.xml$/.test(f)).map(f => xmlText(unzipText(m.file, f))).join(' ');
    const bad = (txt + ' ' + hf).split(/[.。!?]\s|\s{2,}/).filter(l => FORBID.test(l));
    chk(m.who + ': 금지 낱말 없음', !bad.length, bad.slice(0, 3));
    chk(m.who + ': 표지·머리글·바닥글에 「' + BRAND + '」', txt.indexOf(BRAND) >= 0 && hf.split(BRAND).length >= 3, '');
    chk(m.who + ': 학생 이름이 표지에 · 머리글에', txt.indexOf(m.name) >= 0 && hf.indexOf(m.name) >= 0, '');
    /* 화면 타일 넷 = Word 타일 넷 */
    const at = txt.indexOf('AT A GLANCE'), seg = at >= 0 ? txt.slice(at, at + 6000) : '';
    /* 1절 타일은 «큰 숫자 | 이름·풀이» 차례 — 이름 바로 앞의 숫자를 읽는다 */
    const got = m.tiles.map(x => { const i = seg.indexOf(x.t); if (i < 0) return null; const mm = seg.slice(Math.max(0, i - 40), i).match(/\d+%|—/g); return mm ? mm[mm.length - 1] : null; });
    chk(m.who + ': 화면 타일 넷의 숫자 = Word 타일 넷 (' + m.tiles.map(x => x.v).join(' · ') + ')', m.tiles.length === 4 && got.every((g, i) => g === m.tiles[i].v), { html: m.tiles.map(x => x.v), word: got });
    const sum = txt.indexOf('ONE-PAGE SUMMARY'), seg2 = sum >= 0 ? txt.slice(sum, sum + 4000) : '';
    const got2 = m.tiles.map(x => { const i = seg2.indexOf(x.t); if (i < 0) return null; const mm = /(\d+%|—)/.exec(seg2.slice(i + x.t.length, i + x.t.length + 80)); return mm ? mm[1] : null; });
    chk(m.who + ': 한 장 요약의 숫자도 같다', got2.every((g, i) => g === m.tiles[i].v), got2);
    chk(m.who + ': 절 열넷 + 부모님께 + 부록 + 목차', ['이 보고서를 읽는 법', '한눈에 보기', '학습 여정', '자기 판단과 실제 기록', '단원별 진단', '개념별 진단표', '남은 오개념 카드', '공부 습관과 마음', '어려웠던 점과 처방', '다음 과정을 위한 처방', '지금까지의 모든 시험', '영역·개념 누적 지도', '되풀이되는 오개념', '이전 KMChC 학습진단과 비교', '부모님께', '부록', '목차', '한 장 요약'].every(s => txt.indexOf(s) >= 0), '');
    /* 회차는 18 로 박지 않는다 — 그 학생이 실제로 본 회차 수(선생님 2026-10-04) */
    { const flat = txt.replace(/\s+/g, ''), nums = [...new Set((flat.match(/화학1\d+회돌아보기/g) || []).map(x => +x.slice(3).match(/\d+/)[0]))];
      chk(m.who + ': 제목의 회차 = 그 학생이 실제로 본 회차 수(' + m.taken + ') · 다른 수가 섞이지 않는다', m.taken > 0 ? (nums.length === 1 && nums[0] === m.taken) : (nums.length === 0 && /화학1돌아보기/.test(flat)), nums); }
  }

  console.log('\n── LibreOffice PDF ──');
  if (!has('soffice')) {
    if (process.env.REQUIRE_SOFFICE) { chk('soffice 가 있다', false, 'REQUIRE_SOFFICE'); return finish(); }
    console.log('  건너뜀: soffice 가 없다');
    return finish();
  }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'spdocx-lo-'));
  execFileSync('soffice', ['-env:UserInstallation=file://' + prof, '--headless', '--convert-to', 'pdf', '--outdir', OUT].concat(made.map(m => m.file)), { stdio: 'ignore', timeout: 600000 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spdocx-pg-'));
  const summary = [];
  for (const m of made) {
    const pdf = m.file.replace(/\.docx$/, '.pdf');
    if (!fs.existsSync(pdf)) { chk(m.who + ': PDF 로 찍혔다', false, pdf); continue; }
    const pages = pdfWords(pdf), fill = pdfFill(pdf, tmp), N = pages.length;
    if (m.batch) {
      chk('반 전체 PDF ' + N + '쪽 = 학생 쪽수의 합 근처', N >= 40 && N <= 90, N);
      continue;
    }
    summary.push(m.who + ' ' + m.name + ' ' + N + '쪽');
    chk(m.who + ': 쪽수 16~28 (' + N + '쪽 · 계획 ' + (m.plan && m.plan.pages) + '쪽)', N >= 16 && N <= 28, N);
    const cov = pages[0], low = Math.max.apply(null, cov.words.map(w => w.y1));
    chk(m.who + ': 표지 바닥 여유 ≥ 80pt (' + Math.round(cov.h - low) + 'pt)', cov.h - low >= 80, Math.round(cov.h - low));
    chk(m.who + ': 표지에 이름 · 「' + BRAND + '」', cov.words.map(w => w.t).join(' ').indexOf(m.name) >= 0 && cov.words.map(w => w.t).join('').indexOf(BRAND.replace(/\s/g, '')) >= 0, '');
    const nearEmpty = [], titleOnly = [], half = [];
    pages.forEach((p, i) => {
      if (i === 0) return;
      const body = p.words.filter(w => w.y0 > PG.top - 2 && w.y1 < p.h - PG.bottom + 2);
      const lines = new Set(body.map(w => Math.round(w.y0 / 4))).size;
      if (fill[i] < 0.15) nearEmpty.push(i + 1);
      if (lines <= 3 && fill[i] < 0.3) titleOnly.push(i + 1);
      if (fill[i] < 0.5 && i < N - 1) half.push(i + 1 + ':' + Math.round(fill[i] * 100) + '%');
    });
    chk(m.who + ': 거의 빈 장 0', !nearEmpty.length, nearEmpty);
    chk(m.who + ': 제목만 남은 쪽 0', !titleOnly.length, titleOnly);
    chk(m.who + ': 머리글·바닥글 상호가 둘째 쪽부터 쪽마다', pages.slice(1).every(p => p.words.map(w => w.t).join('').split(BRAND.replace(/\s/g, '')).length >= 3), '');
    chk(m.who + ': 쪽 번호 «쪽 n / ' + N + '»', pages.slice(1).every((p, i) => p.words.map(w => w.t).join(' ').indexOf((i + 2) + ' / ' + N) >= 0), '');
    note(m.who + ': 쪽마다 채움 ' + fill.map(f => Math.round(f * 100)).join(' ') + (half.length ? ' · 절반 못 찬 쪽(마지막 제외) ' + half.join(', ') : ''));
    if (process.env.SP_PLAN && m.plan) note(m.who + ': 계획 채움 ' + m.plan.fill.join(' ') + ' · 절 시작 ' + JSON.stringify(m.plan.toc));
    const allText = pages.map(p => p.words.map(w => w.t).join(' ')).join('\n');
    chk(m.who + ': PDF 글에도 금지 낱말 없음', !FORBID.test(allText.replace(/\n/g, ' ')), (allText.match(FORBID) || [])[0]);
  }
  console.log('\n  학생별 쪽수: ' + summary.join(' · '));
  console.log('  파일: ' + OUT);
  finish();
}
function finish() { console.log(fail ? `\nFAIL ${fail}건` : '\nPASS'); process.exit(fail ? 1 : 0); }
main().catch(e => { console.error(e); process.exit(1); });
