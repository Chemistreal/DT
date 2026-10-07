# -*- coding: utf-8 -*-
"""화학1 심화 선수노트 10권을 한 권으로: volumes/chem1s_volume_rounds1to10.pdf
   NODE_PATH=… node courses/ch1s/truthbook/render.js all   # 10권 + 합본 조각(tools/_stage/ch1s/volume/)
   python3 courses/ch1s/truthbook/volume.py

짜임(화학1 합본과 같다): 권 표지 · 차례(회차별 시작 쪽) · 1~10회 선수노트.
쪽 번호는 합본 쪽 번호로 이어진다(render.js 가 합본 조각을 그 번호로 따로 찍는다) · 책갈피: 회차 → 걸음·모음 쪽."""
import json
import os
import sys

import pymupdf

DT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
VOL = os.path.join(DT, 'tools', '_stage', 'ch1s', 'volume')
HERE = os.path.dirname(os.path.abspath(__file__))
info = json.load(open(os.path.join(VOL, 'vol.json'), encoding='utf-8'))
out = pymupdf.open(os.path.join(VOL, 'vol_front.pdf'))
toc = [[1, '표지', 1], [1, '차례', 2]]
for row in info['rows']:
    r = row['R']
    p = os.path.join(VOL, 'vol_r%02d.pdf' % r)
    if not os.path.exists(p):
        sys.exit('%d회 합본 조각이 없다: %s — render.js all 부터' % (r, p))
    d = pymupdf.open(p)
    start = out.page_count + 1
    if start != row['start']:
        sys.exit('%d회 시작 쪽 %d ≠ 차례 %d' % (r, start, row['start']))
    out.insert_pdf(d)
    tb = json.load(open(os.path.join(HERE, 'round_%02d.json' % r), encoding='utf-8'))
    toc.append([1, '%d회 · %s' % (r, tb['title']), start])
    toc.append([2, '머리말', start + 1])
    for i, s in enumerate(tb['steps']):
        toc.append([2, '%d. %s' % (i + 1, s['title']), start + 2 + i])
    toc.append([2, '옳은 문장집 · 낚시 문장집 · 심화 확장', start + 2 + len(tb['steps'])])
if out.page_count != info['pages']:
    sys.exit('합본 쪽수 %d ≠ 조각 기록 %d' % (out.page_count, info['pages']))
out.set_toc(toc)
out.set_metadata({'title': '화학 Ⅰ 심화 선수노트 합본 · 1~10회차', 'author': '화학 · 다원교육 · 조준모',
                  'subject': '누적 OX 화학1 심화 선수노트', 'creator': 'courses/ch1s/truthbook/volume.py'})
dst = os.path.join(DT, 'volumes', 'chem1s_volume_rounds1to10.pdf')
out.save(dst, garbage=4, deflate=True)
print('합본', out.page_count, '쪽 · 책갈피', len(toc), '→', os.path.relpath(dst, DT))
