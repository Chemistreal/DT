#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""문제지 HTML(munje_<과목>_round<NN>.html)이 회차 JSON 과 같은 문장을 싣는지 잰다 — 다르면 JSON 대로 고친다.

왜 필요한가
-----------
해설지는 tools/haeseol_sync.py 가 JSON 과 맞춰 두는데 문제지는 아무도 안 쟀다. 재어 보니(2026-10-11)
  · 화학Ⅱ 1·2회 문제지 HTML 은 두 회차 문항이 통째로 뒤바뀌어 있었다(인쇄본 PDF 는 JSON 과 같다).
  · 작은따옴표가 &#x27; 로 바뀐 뒤 «라틴 글자 뒤 숫자 → 아래첨자» 꾸밈에 걸려 «M&#x₂₇;V&#x₂₇;» 가 찍혔다.
  · 일반화학 5회 53번은 문제지만 옛 문장(«불활성 기체»)이었다.
문제지 생성기는 저장소에 없다. 그래서 문항 칸(td.st)의 글만 JSON 에서 haeseol_sync.render() 로 다시 쓴다
(해설지와 같은 꾸밈) — 그 밖의 바이트는 그대로다. 고친 뒤에는 tools/munje_pdf.py 로 PDF 를 다시 찍는다.

틀 글자도 지킨다: 참고 데이터의 아보가드로 수는 «Nᴀ»(작은 대문자 U+1D00 — 아래첨자가 아니다)가 아니라 N 에 아래첨자 A.

실행:  python3 tools/munje_sync.py            # 세기만
       python3 tools/munje_sync.py --check    # 하나라도 어긋나면 빨간불
       python3 tools/munje_sync.py --write    # 문항 칸·틀 글자를 고친다
"""
import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import haeseol_sync as H  # noqa: E402

FILE = re.compile(r'^munje_(ch1|ch2|gc)_round(\d+)\.html$')     # 화학Ⅰ 심화(ch1s)는 courses/ch1s/print 가 만든다
ROW = re.compile(r'(<tr><td class="no">(\d+)</td><td class="st">)(.*?)(</td>)', re.S)
TPL = [('Nᴀ', '<i>N</i><sub>A</sub>'), ('시험시간은', '시험 시간은'), ('수정테이프를', '수정 테이프를')]


def main():
    write, check = '--write' in sys.argv, '--check' in sys.argv
    bad = pages = rows = 0
    for name in sorted(os.listdir(ROOT)):
        m = FILE.match(name)
        if not m:
            continue
        course, rnd = m.group(1), int(m.group(2))
        jp = os.path.join(ROOT, 'appdata', 'round_%s_%02d.json' % (course, rnd))
        if not os.path.exists(jp):
            continue
        items = json.load(open(jp, encoding='utf-8'))['jeongsi']['items']
        path = os.path.join(ROOT, name)
        src = io.open(path, encoding='utf-8').read()
        diff = []

        def fix(mm):
            n = int(mm.group(2))
            want = H.render(items[n - 1].get('s'))
            if H.norm(mm.group(3)) != H.norm(want):
                diff.append(n)
                return mm.group(1) + want + mm.group(4)
            return mm.group(0)
        out = ROW.sub(fix, src)
        n_rows = len(ROW.findall(src))
        tpl = [a for a, b in TPL if a in out]
        for a, b in TPL:
            out = out.replace(a, b)
        pages += 1
        rows += n_rows
        if n_rows != 60:
            print('  %s: 문항 칸 %d개(60 이어야)' % (name, n_rows))
            bad += 1
        if diff or tpl:
            bad += 1
            print('  %s: 문항 %d칸이 JSON 과 다름%s%s' % (name, len(diff), (' ' + str(diff[:12])) if diff else '',
                                                    (' · 틀 글자 ' + ', '.join(tpl)) if tpl else ''))
            if write:
                io.open(path, 'w', encoding='utf-8').write(out)
    print('문제지 %d장 %d문항 · 어긋난 장 %d%s' % (pages, rows, bad, ' — 고쳤다' if write and bad else ''))
    if check and bad:
        print('FAIL — python3 tools/munje_sync.py --write 뒤 tools/munje_pdf.py 로 다시 찍는다')
        return 1
    print('PASS' if not bad or write else '')
    return 0


if __name__ == '__main__':
    sys.exit(main())
