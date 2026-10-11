#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""문제지 PDF 다시 찍기 — munje_<과목>_round<NN>.html → 저장소 루트의 munje_<과목>_round<NN>.pdf
   (화학Ⅰ·Ⅱ·일반화학. 화학Ⅰ 심화는 courses/ch1s/print/make_print.py 가 만든다.)

문제지 PDF 다섯 쪽 = 표지 · 주기율표 · 문제 두 쪽 · OMR. 표지·주기율표·OMR 은 원본이 저장소에 없어
지금 PDF 의 그 쪽을 그대로 쓰고, 가운데 문제 쪽만 HTML 에서 다시 찍어 끼운다.
문제 쪽은 tools/haeseol_pdf.js 로 찍는다 — 해설지와 같은 활자 다듬기(tools/print_typeset.js)가 입혀진다.

왜 (2026-10-11): 문제지 PDF 가 HTML 보다 옛것이었다(삼투압 문항 «(M은 몰농도, 반트호프 인자 = 1로 가정)» 이
빠진 판이 회차마다 찍혀 있었다). HTML 만 고치고 다시 찍는 도구가 없었기 때문이다.

  python3 tools/munje_pdf.py                       # 전부
  python3 tools/munje_pdf.py munje_ch1_round05.html …
합칠 때 garbage=2 (3 이상은 Type3 글꼴을 엉키게 한다 — courses/ch1s/truthbook/volume.py 참고)."""
import os
import re
import subprocess
import sys
import tempfile

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = re.compile(r'^munje_(ch1|ch2|gc)_round(\d+)\.html$')


def main():
    names = [os.path.basename(a) for a in sys.argv[1:]] or sorted(n for n in os.listdir(ROOT) if FILE.match(n))
    stage = tempfile.mkdtemp(prefix='munje_pdf_')
    env = dict(os.environ, NODE_PATH=os.environ.get('NODE_PATH', '/opt/node22/lib/node_modules'))
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'haeseol_pdf.js'), '--out', stage] + names,
                       env=env, capture_output=True, text=True)
    if r.returncode:
        print(r.stdout, r.stderr)
        return 1
    bad = 0
    for n in names:
        dst = os.path.join(ROOT, n.replace('.html', '.pdf'))
        old = pymupdf.open(dst)
        body = pymupdf.open(os.path.join(stage, n.replace('.html', '.pdf')))
        t = [p.get_text() for p in old]
        if old.page_count != 5 or 'OMR' not in t[-1].replace(' ', '') and 'O M R' not in t[-1]:
            print('  건너뜀 %s: 지금 PDF 가 «표지·주기율표·문제 2쪽·OMR» 다섯 쪽 꼴이 아니다(%d쪽)' % (n, old.page_count))
            bad += 1
            continue
        out = pymupdf.open()
        out.insert_pdf(old, from_page=0, to_page=1)
        out.insert_pdf(body)
        out.insert_pdf(old, from_page=old.page_count - 1, to_page=old.page_count - 1)
        out.set_metadata(old.metadata)
        tmp = dst + '.tmp'
        out.save(tmp, garbage=2, deflate=True)
        out.close()
        old.close()
        os.replace(tmp, dst)
        warn = '' if body.page_count == 2 else '  ⚠ 문제 쪽 %d쪽(전에는 2쪽)' % body.page_count
        print('  ok  %s  문제 %d쪽%s' % (os.path.basename(dst), body.page_count, warn))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
