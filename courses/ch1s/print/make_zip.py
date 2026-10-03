# -*- coding: utf-8 -*-
"""「화학1심화 DT.zip」 — 선수노트 합본 + 회차마다 N차시_주제_답.pdf(해설지) · N차시_주제_문제.pdf(표지·주기율표·문제·OMR).
   python3 courses/ch1s/print/make_zip.py [나갈 곳]      (make_print.py · truthbook/volume.py 다음에)
   화학1 DT.zip 과 같은 이름 규칙. 넣은 PDF 가 모두 열리고 파일 이름의 차시와 PDF 안의 회차가 같은지 확인한다."""
import json
import os
import re
import sys
import zipfile

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
CH = os.path.dirname(HERE)
DT = os.path.dirname(os.path.dirname(CH))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DT, 'tools', '_stage', 'ch1s', '화학1심화 DT.zip')
dz = json.load(open(os.path.join(CH, 'design.json'), encoding='utf-8'))
root = '화학1심화(DT)/'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(DT, 'volumes', 'chem1s_volume_rounds1to10.pdf'), root + '[화학1심화]선수노트_1-10회.pdf')
    for r in range(1, 11):
        t = re.sub(r'\s+', '', dz['rounds'][r - 1]['title'])
        z.write(os.path.join(DT, 'haeseol_ch1s_round%02d.pdf' % r), root + '%d차시_%s_답.pdf' % (r, t))
        z.write(os.path.join(DT, 'munje_ch1s_round%02d.pdf' % r), root + '%d차시_%s_문제.pdf' % (r, t))
z = zipfile.ZipFile(out)
for name in z.namelist():
    d = pymupdf.open(stream=z.read(name), filetype='pdf')
    m = re.match(r'.*/(\d+)차시', name)
    if m and ('심화 %s회' % m.group(1)) not in ''.join(p.get_text() for p in d).replace('\n', ' '):
        sys.exit('차시와 회차가 다르다: ' + name)
print('%s · %d개 · %.1fMB · 모두 열림 · 차시=회차' % (out, len(z.namelist()), os.path.getsize(out) / 1e6))
