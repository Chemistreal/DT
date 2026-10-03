# -*- coding: utf-8 -*-
"""화학1 심화 선수노트 10권을 한 권으로: volumes/chem1s_volume_rounds1to10.pdf
   python3 courses/ch1s/truthbook/volume.py   (render.js all 다음에)"""
import os
import sys
import pymupdf

DT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
out = pymupdf.open()
for r in range(1, 11):
    p = os.path.join(DT, 'truthbooks', 'chem1s_round%02d_truthbook_bw.pdf' % r)
    if not os.path.exists(p):
        sys.exit('%d회 선수노트가 없다: %s' % (r, p))
    d = pymupdf.open(p)
    out.insert_pdf(d)
dst = os.path.join(DT, 'volumes', 'chem1s_volume_rounds1to10.pdf')
out.save(dst, garbage=4, deflate=True)
print('합본', out.page_count, '쪽 →', os.path.relpath(dst, DT))
