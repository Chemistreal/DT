#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""「다음 단계 · 한 겹 더」 에 싣는 글(DEEP)을 appdata/deep_notes.json 에서 성적표에 넣는다.

무슨 일이 있었나
----------------
「한 겹 더」 는 CORE(개념 설명)의 **첫 문장을 잘라 내고 남은 것**을 보여 주고 있었다.
그건 한 겹 더 들어간 내용이 아니라 같은 설명의 뒷부분이다 — 학부모는 「더 깊은 것」
이라는 제목 아래 이미 본 설명의 나머지를 받았다.

선생님 결정(2026-09-28): 자주 나오는 오개념 100개에 **따로 쓴 글**을 둔다
(appdata/deep_notes.json = {오개념 이름: 글}). 글이 없는 개념은 「한 겹 더」 글을
아예 안 싣는다(이름과 강의 링크만) — CORE 나머지로 채우지 않는다.

성적표는 한 파일로 열려야 해서 글을 베껴 넣는다. 표는 마커 두 줄 사이에 있다:

    /* DEEP-BEGIN … */
    const DEEP={…};
    /* DEEP-END */

⚠ 손으로 고치지 않는다. 글을 고치려면 deep_notes.json 을 고치고 --write 로 다시 넣는다.

    python3 tools/deep_notes.py            # 글 수만 보여 준다
    python3 tools/deep_notes.py --write    # report.html 의 DEEP 을 다시 만든다
    python3 tools/deep_notes.py --check    # json 과 어긋났으면 빨간불 (CI)
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'appdata', 'deep_notes.json')
REPORT = os.path.join(ROOT, 'report.html')
ENGINE = os.path.join(ROOT, 'chemengine.js')

BEGIN = ('/* DEEP-BEGIN — 「한 겹 더」 글(오개념 이름 → 글). tools/deep_notes.py --write 가 '
         'appdata/deep_notes.json 에서 만든다. 손으로 고치지 않는다. */')
END = '/* DEEP-END */'

CORE_LINE = re.compile(r'^const CORE=(\{.*\});$', re.M)
CANON_LINE = re.compile(r'^ {0,2}var MIS_CANON = (\{.*\});$', re.M)


def read(p):
    return open(p, encoding='utf-8').read()


def load():
    d = json.load(open(SRC, encoding='utf-8'))
    if not isinstance(d, dict):
        raise SystemExit('deep_notes.json 이 {오개념: 글} 꼴이 아니다')
    return d


def block(notes):
    body = json.dumps(dict(sorted(notes.items())), ensure_ascii=False, separators=(',', ':'))
    return BEGIN + '\nconst DEEP=' + body + ';\n' + END


def span(src):
    nb, ne = src.count(BEGIN), src.count(END)
    if nb == 0 and ne == 0:
        return None
    if nb != 1 or ne != 1:
        raise SystemExit('DEEP 마커가 하나씩이 아니다 (BEGIN %d · END %d)' % (nb, ne))
    a = src.find(BEGIN)
    b = src.find(END, a)
    if b < a:
        raise SystemExit('DEEP-END 가 DEEP-BEGIN 앞에 있다')
    return a, b + len(END)


def lint(notes, src):
    """글이 붙을 이름이 성적표가 아는 이름인지 — 모르는 이름이면 그 글은 영영 안 뜬다."""
    bad = []
    m = CORE_LINE.search(src)
    core = json.loads(m.group(1)) if m else {}
    cm = CANON_LINE.search(read(ENGINE))
    canon = json.loads(cm.group(1)) if cm else {}
    known = set(core) | set(canon) | set(canon.values())
    for k, v in notes.items():
        if not isinstance(v, str) or len(v.strip()) < 10:
            bad.append('「%s」: 글이 비었거나 너무 짧다' % k)
        elif '℃' in v:
            bad.append('「%s」: ℃ 대신 °C 로 적는다' % k)
        if known and k not in known:
            bad.append('「%s」: 성적표가 모르는 오개념 이름이다(CORE·대표 이름 표에 없음)' % k)
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    notes = load()
    want = block(notes)
    src = read(REPORT)
    bad = lint(notes, src)
    if a.write:
        if bad:
            print('\n'.join(bad))
            return 1
        sp = span(src)
        if sp is None:
            m = CORE_LINE.search(src)
            if not m:
                raise SystemExit('report.html 에서 CORE 를 못 찾았다 — 처음 넣는 자리는 CORE 다음')
            at = m.end() + 1
            new = src[:at] + want + '\n' + src[at:]
        else:
            new = src[:sp[0]] + want + src[sp[1]:]
        if new != src:
            open(REPORT, 'w', encoding='utf-8').write(new)
            print('report.html 에 DEEP %d 개를 썼다.' % len(notes))
        else:
            print('report.html 의 DEEP 이 이미 같다 (%d 개).' % len(notes))
        return 0
    if a.check:
        try:
            sp = span(src)
        except SystemExit as e:
            bad.append(str(e))
            sp = False
        if sp is None:
            bad.append('report.html 에 DEEP 마커가 없다 (--write 로 넣는다)')
        elif sp and src[sp[0]:sp[1]] != want:
            bad.append('report.html 의 DEEP 이 appdata/deep_notes.json 과 다르다 (--write 로 맞춘다)')
        if bad:
            print('\n'.join(bad))
            return 1
        print('DEEP %d 개 · report.html 과 같다.' % len(notes))
        return 0
    print('deep_notes.json 글 %d 개%s' % (len(notes), (' · 문제 %d' % len(bad)) if bad else ''))
    for b in bad:
        print('  ' + b)
    return 0


if __name__ == '__main__':
    sys.exit(main())
