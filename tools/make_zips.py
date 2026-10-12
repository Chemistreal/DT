#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""반별 배포 묶음 — 「화학1 DT.zip」 「화학2 DT.zip」 「일반화학 DT.zip」 (화학1심화는 courses/ch1s/print/make_zip.py)
   python3 tools/make_zips.py [나갈 폴더]

이름 규칙은 화학1심화 DT.zip 과 같다:
   <반>(DT)/[<반>]선수노트_1-9회.pdf · [<반>]선수노트_10-18회.pdf   (선수노트 합본이 있는 반만)
   <반>(DT)/N차시_주제_문제.pdf (표지·주기율표·문제·OMR) · N차시_주제_답.pdf (해설지)
주제는 화학Ⅰ·Ⅱ 는 그 회차 선수노트 표지에서, 일반화학은 문제지 「신규」 띠(1회는 2회 띠의 «1회 (…)»)에서 읽는다.
넣은 PDF 가 모두 열리고, 문제지·해설지 안에 «<반> N회» 가 찍혀 있는지(파일 이름의 차시 = PDF 의 회차) 확인한다."""
import os
import re
import sys
import zipfile

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES = [
    ('ch1', '화학1', 'chem1', 18, [('chem1_volume1_rounds1to9.pdf', '1-9회'), ('chem1_volume2_rounds10to18.pdf', '10-18회')]),
    ('ch2', '화학2', 'chem2', 18, [('chem2_volume1_rounds1to9.pdf', '1-9회'), ('chem2_volume2_rounds10to18.pdf', '10-18회')]),
    ('gc', '일반화학', None, 10, []),
]


def clean(t):
    t = re.sub(r'\s+', '', t)
    return re.sub(r'[\\/:*?"<>|]', '·', t)


def topic(c, tb, r):
    if tb:
        lines = [x.strip() for x in pymupdf.open(os.path.join(ROOT, 'truthbooks', '%s_round%02d_truthbook_bw.pdf' % (tb, r)))[0]
                 .get_text().split('\n') if x.strip()]
        i = next(k for k, x in enumerate(lines) if re.match(r'^화학\s*[ⅠⅡ]$', x))
        return clean(lines[i + 1])
    src = open(os.path.join(ROOT, 'munje_%s_round%02d.html' % (c, r)), encoding='utf-8').read()
    m = re.search(r'<span class="sec">신규 [^<]*</span>[^<]*<span class="s">([^<]*)</span>', src)
    if m:
        return clean(m.group(1))
    nxt = open(os.path.join(ROOT, 'munje_%s_round%02d.html' % (c, r + 1)), encoding='utf-8').read()
    m = re.search(r'1회 \(([^)]*)\)', nxt)
    return clean(m.group(1)) if m else ''


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', '_stage')
    os.makedirs(out_dir, exist_ok=True)
    for c, label, tb, n, vols in COURSES:
        out = os.path.join(out_dir, '%s DT.zip' % label)
        root = '%s(DT)/' % label
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
            for v, rng in vols:
                z.write(os.path.join(ROOT, 'volumes', v), root + '[%s]선수노트_%s.pdf' % (label, rng))
            for r in range(1, n + 1):
                t = topic(c, tb, r)
                stem = '%d차시_%s' % (r, t) if t else '%d차시' % r
                z.write(os.path.join(ROOT, 'haeseol_%s_round%02d.pdf' % (c, r)), root + stem + '_답.pdf')
                z.write(os.path.join(ROOT, 'munje_%s_round%02d.pdf' % (c, r)), root + stem + '_문제.pdf')
        z = zipfile.ZipFile(out)
        for name in z.namelist():
            d = pymupdf.open(stream=z.read(name), filetype='pdf')
            m = re.match(r'.*/(\d+)차시', name)
            if m and ('%s %s회' % (label, m.group(1))) not in ''.join(p.get_text() for p in d).replace('\n', ' '):
                sys.exit('차시와 회차가 다르다: ' + name)
        print('%s · %d개 · %.1fMB · 모두 열림 · 차시=회차' % (out, len(z.namelist()), os.path.getsize(out) / 1e6))


if __name__ == '__main__':
    main()
