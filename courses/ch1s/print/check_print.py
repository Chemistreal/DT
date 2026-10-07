# -*- coding: utf-8 -*-
"""화학1 심화 인쇄물 인쇄 전 검사 — 걸린 것이 0 이어야 통과(끝 코드 0).

  python3 courses/ch1s/print/check_print.py          # make_print.py · truthbook/render.js all · volume.py 다음에

보는 것
  ① 띠만 남은 쪽   문제지·해설지에서 「누적 1–30」「신규 31–60」 띠 아래에 문항이 하나도 없는 쪽
  ② 한 문항 쪽     문제지·해설지 문항 쪽(빠른 정답 쪽·옳은문장집 제외)에 문항이 하나뿐인 쪽
  ③ 홀수 쪽 선수노트  truthbooks/chem1s_roundNN_truthbook_bw.pdf 쪽수가 홀수(양면 인쇄에서 다음 권이 뒷면에 붙는다)
  ④ Unifont        심화반 PDF(문제지·해설지·OMR·선수노트·합본)에 Unifont 글꼴이 들어 있음(ₗ 가 ₁ 처럼 찍힌다)
  ⑤ 정답 대조      해설지 1쪽 빠른 정답 · 해설 쪽 정답 칸 ↔ 회차 파일 appdata/round_ch1s_NN.json 정답
  ⑥ OMR           1~60 번호가 다 있고 한 쪽인지
"""
import json
import os
import re
import subprocess
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
CH = os.path.dirname(HERE)
DT = os.path.dirname(os.path.dirname(CH))
BAND = re.compile(r'^(누적|신규) \d+–\d+')


def lines(page):
    """(y0, x0, 글) — 한 줄씩."""
    out = []
    for b in page.get_text('dict')['blocks']:
        for ln in b.get('lines', []):
            t = ''.join(s['text'] for s in ln['spans']).strip()
            if t:
                out.append((ln['bbox'][1], ln['bbox'][0], t))
    return sorted(out)


def row_numbers(page, xmax):
    """왼쪽 번호 칸(x < xmax)에 홀로 선 1~60 숫자."""
    ns = []
    for w in page.get_text('words'):
        if w[0] < xmax and re.fullmatch(r'\d{1,2}', w[4]) and 1 <= int(w[4]) <= 60:
            ns.append(int(w[4]))
    return ns


def check_round(r, errs):
    items = json.load(open(os.path.join(DT, 'appdata', 'round_ch1s_%02d.json' % r), encoding='utf-8'))['jeongsi']['items']
    key = [it['a'] for it in items]
    # 문제지: 1 표지 · 2 주기율표 · 문항 쪽들 · 마지막 OMR
    m = pymupdf.open(os.path.join(DT, 'munje_ch1s_round%02d.pdf' % r))
    for i in range(2, m.page_count - 1):
        pg = m[i]
        ls = lines(pg)
        for y, x, t in ls:
            if BAND.match(t):
                ys = [w[1] for w in pg.get_text('words') if w[0] < 60 and re.fullmatch(r'\d{1,2}', w[4]) and w[1] > y + 5]
                if not ys:
                    errs.append('%d회 문제지 %d쪽: 띠「%s」만 남았다' % (r, i + 1, t))
        ns = row_numbers(pg, 60)
        if len(ns) == 1:
            errs.append('%d회 문제지 %d쪽: 문항이 하나뿐(%d번)' % (r, i + 1, ns[0]))
    # OMR (문제지 끝장 · 따로 낸 파일)
    for name, doc in (('문제지 끝장', m), ('OMR', pymupdf.open(os.path.join(DT, 'omr_ch1s_round%02d.pdf' % r)))):
        pg = doc[-1]
        got = sorted({int(w[4]) for w in pg.get_text('words') if re.fullmatch(r'\d{1,2}', w[4]) and 1 <= int(w[4]) <= 60})
        if got != list(range(1, 61)):
            errs.append('%d회 %s OMR 번호가 1~60 이 아니다(%d개)' % (r, name, len(got)))
    o = pymupdf.open(os.path.join(DT, 'omr_ch1s_round%02d.pdf' % r))
    if o.page_count != 1:
        errs.append('%d회 OMR %d쪽' % (r, o.page_count))
    # 해설지
    h = pymupdf.open(os.path.join(DT, 'haeseol_ch1s_round%02d.pdf' % r))
    # ⑤ 빠른 정답: 1쪽에서 «번호 O/X» 짝
    ws = h[0].get_text('words')
    cy = lambda w: (w[1] + w[3]) / 2
    marks = [w for w in ws if w[4] in ('O', 'X')]
    quick = {}
    for a in ws:
        if re.fullmatch(r'\d{1,2}', a[4]):
            near = sorted((b for b in marks if abs(cy(a) - cy(b)) < 4 and 0 < b[0] - a[2] < 40), key=lambda b: b[0])
            if near:
                quick.setdefault(int(a[4]), near[0][4])
    if sorted(quick) != list(range(1, 61)):
        errs.append('%d회 해설지 빠른 정답을 60개 못 읽었다(%d개)' % (r, len(quick)))
    bad = [n for n in quick if 1 <= n <= 60 and quick[n] != key[n - 1]]
    if bad:
        errs.append('%d회 해설지 빠른 정답이 회차 파일과 다름: %s' % (r, bad[:10]))
    # 해설 쪽: 번호 칸·정답 칸(왼쪽) 짝, 띠만 남은 쪽, 한 문항 쪽
    detail = {}
    for i in range(1, h.page_count):
        pg = h[i]
        text = pg.get_text()
        if '숙제 · 옳은문장집' in text and not row_numbers(pg, 75):
            continue
        ws = [w for w in pg.get_text('words') if w[0] < 75]
        nums = [w for w in ws if re.fullmatch(r'\d{1,2}', w[4])]
        ans = [w for w in ws if w[4] in ('O', 'X')]
        on_page = []
        for nw in nums:
            near = [aw for aw in ans if abs(aw[1] - nw[1]) < 6 and aw[0] > nw[2]]
            if near:
                n = int(nw[4])
                detail[n] = near[0][4]
                on_page.append(n)
        if '숙제 · 옳은문장집' in text:
            continue
        for y, x, t in lines(pg):
            if BAND.match(t):
                after = [nw for nw in nums if nw[1] > y + 5]
                if not after:
                    errs.append('%d회 해설지 %d쪽: 띠「%s」만 남았다' % (r, i + 1, t[:12]))
        if len(on_page) == 1:
            errs.append('%d회 해설지 %d쪽: 문항이 하나뿐(%d번)' % (r, i + 1, on_page[0]))
    if sorted(detail) != list(range(1, 61)):
        errs.append('%d회 해설지 해설 칸 번호를 60개 못 읽었다(%d개)' % (r, len(detail)))
    bad = [n for n in detail if detail[n] != key[n - 1]]
    if bad:
        errs.append('%d회 해설지 해설 칸 정답이 회차 파일과 다름: %s' % (r, bad[:10]))
    return m, h


def fonts_of(path):
    """pdffonts(poppler)로 — 크롬 PDF 는 글꼴을 쪽 안 XObject 에 넣어 pymupdf 쪽 목록에는 안 잡힌다."""
    out = subprocess.run(['pdffonts', path], capture_output=True, text=True).stdout.splitlines()[2:]
    return {ln.split()[0] for ln in out if ln.strip()}


def main():
    errs = []
    pdfs = []
    for r in range(1, 11):
        check_round(r, errs)
        pdfs += ['munje_ch1s_round%02d.pdf' % r, 'haeseol_ch1s_round%02d.pdf' % r, 'omr_ch1s_round%02d.pdf' % r]
        tb = os.path.join('truthbooks', 'chem1s_round%02d_truthbook_bw.pdf' % r)
        pdfs.append(tb)
        if os.path.exists(os.path.join(DT, tb)):
            n = pymupdf.open(os.path.join(DT, tb)).page_count
            if n % 2:
                errs.append('%d회 선수노트 %d쪽 — 홀수' % (r, n))
        else:
            errs.append('%d회 선수노트 없음' % r)
    pdfs.append(os.path.join('volumes', 'chem1s_volume_rounds1to10.pdf'))
    for p in pdfs:
        fp = os.path.join(DT, p)
        if not os.path.exists(fp):
            errs.append(p + ' 없음')
            continue
        uni = [n for n in fonts_of(fp) if 'unifont' in n.lower()]
        if uni:
            errs.append('%s: Unifont 글꼴 %s' % (p, ', '.join(sorted(uni))))
    for e in errs:
        print('✗', e)
    print('인쇄 전 검사: 걸린 것 %d건 (PDF %d개)' % (len(errs), len(pdfs)))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
