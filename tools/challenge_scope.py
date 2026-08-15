#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""심화 도전(challenge.html)이 아직 안 배운 범위를 내지 않게 한다.

선생님이 물으셨다 (2026-08-15)
------------------------------
"DT 성적에서 심화문제 나올때 아직 안배운 범위가 나오거나 한 부분이 있는지
 확인하고 안배운문제를 내지 않도록 해줘"

재어 보니 있었다. challenge.html 은 **과목 접두만** 보고 문제를 골랐다:

    var PRECOURSE={ch1:['CH1'],ch2:['CH2','CH1'],gc:['GC','CH2','CH1']};
    prefixes.forEach(...)          # 회차를 아예 안 본다

그래서 화학Ⅰ 1회를 막 통과한 학생이 「심화 도전」을 누르면, 후보 54개념 중
44개(81%)가 **18회까지 가야 배우는 것**이었다. 12문항을 무작위로 뽑으니
평균 열 문항 가까이가 안 배운 것이었다. 화학Ⅱ 1회는 41%, 일반화학 1회는 17%.

이 자가 하는 일
---------------
appdata/round_*.json 에서 «어느 개념이 몇 회차에 처음 나오는가» 를 세어
challenge.html 안의 표를 다시 만든다. 회차 파일이 늘거나 문항이 바뀌면
손으로 고칠 것이 없다 — 손으로 적으면 반드시 어긋난다.

    실행:  python3 tools/challenge_scope.py           # 표를 다시 만든다
           python3 tools/challenge_scope.py --check   # 어긋나면 빨간불
           python3 tools/challenge_scope.py --report  # 회차별로 몇 개가 밖인지

왜 «처음 나온 회차» 인가
------------------------
시험이 누적이라 r회 시험 범위는 1..r회에 나온 모든 개념이다. 어떤 개념이
처음 등장한 회차가 r 이하면 배운 것이고, r보다 크면 아직 안 배운 것이다.

선수 과목은 다 배운 것으로 본다
-------------------------------
PRECOURSE 의 첫 자리가 지금 듣는 과목이고 나머지는 선수 과목이다.
화학Ⅱ 를 듣는 학생은 화학Ⅰ 을 이미 마쳤으므로 CH1 개념은 회차와 무관하게
낸다. 막는 것은 **지금 듣는 과목의 앞선 회차**뿐이다.

⚠ 화학 내용의 옳고 그름은 사람이 본다. 이 자는 «몇 회차에 나왔나» 만 세고,
  그 문제가 심화로 적절한지는 판단하지 않는다.
"""
import json
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'challenge.html')
BEGIN = '/* CHALLENGE_ROUND: 자동 생성 — tools/challenge_scope.py */'
END = '/* /CHALLENGE_ROUND */'


def concept_ids(obj, out):
    """회차 파일 어디에 박혀 있든 개념 id(c)를 전부 긁는다."""
    if isinstance(obj, dict):
        c = obj.get('c')
        if isinstance(c, str) and c:
            out.add(c)
        for v in obj.values():
            concept_ids(v, out)
    elif isinstance(obj, list):
        for v in obj:
            concept_ids(v, out)


def first_round():
    """개념 id -> (과목, 처음 나온 회차)"""
    first = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'appdata', 'round_*.json'))):
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        course, rnd = d.get('course'), int(d.get('round') or 0)
        if not course or not rnd:
            continue
        got = set()
        concept_ids(d, got)
        for c in got:
            if c not in first or rnd < first[c][1]:
                first[c] = (course, rnd)
    return first


def last_round():
    """과목 -> 마지막 회차. «몇 회까지 있는지» 를 화면이 알아야 회차를 고를 수 있다."""
    last = {}
    for f in glob.glob(os.path.join(ROOT, 'appdata', 'round_*.json')):
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        c, r = d.get('course'), int(d.get('round') or 0)
        if c and r:
            last[c] = max(last.get(c, 0), r)
    return last


def bank(src):
    m = re.search(r'const CHALLENGE_BANK=(\{.*?\});\n', src, re.S)
    if not m:
        raise SystemExit('challenge.html 안에서 CHALLENGE_BANK 를 못 찾았습니다.')
    return json.loads(m.group(1))


def build(src):
    """심화 문제은행에 실린 개념만 골라 표를 만든다(파일이 쓸데없이 커지지 않게)."""
    first, last = first_round(), last_round()
    used = sorted({c['c'] for lst in bank(src).values() for c in lst})
    missing = [c for c in used if c not in first]
    table = {c: first[c][1] for c in used if c in first}
    body = (BEGIN + '\n'
            + 'var CHALLENGE_ROUND=' + json.dumps(table, ensure_ascii=False, sort_keys=True) + ';\n'
            + 'var COURSE_LAST=' + json.dumps(last, ensure_ascii=False, sort_keys=True) + ';\n'
            + END)
    return body, missing


def replace(src, body):
    pat = re.compile(re.escape(BEGIN) + r'.*?' + re.escape(END), re.S)
    if pat.search(src):
        return pat.sub(lambda _: body, src)
    # 처음 심을 때는 PRECOURSE 바로 위에 둔다.
    anchor = 'var PRECOURSE='
    i = src.index(anchor)
    return src[:i] + body + '\n' + src[i:]


def report():
    first, last = first_round(), last_round()
    src = open(PAGE, encoding='utf-8').read()
    b = bank(src)
    pre = {'ch1': ['CH1'], 'ch2': ['CH2', 'CH1'], 'gc': ['GC', 'CH2', 'CH1']}
    print('심화 후보가 회차별로 얼마나 진도 밖인가 (막기 전 기준)\n')
    for course, prefixes in pre.items():
        pool = [c['c'] for p in prefixes for c in b.get(p, [])]
        own = prefixes[0]
        for r in range(1, last.get(course, 0) + 1):
            bad = [c for c in pool
                   if c.startswith(own + '-') and first.get(c, ('', 0))[1] > r]
            print('  %-3s %2d회 : 진도 밖 %3d / %3d' % (course, r, len(bad), len(pool)))
        print()


def main():
    args = sys.argv[1:]
    if '--report' in args:
        report()
        return 0
    src = open(PAGE, encoding='utf-8').read()
    body, missing = build(src)
    if missing:
        print('⚠ 어느 회차에도 안 나오는 심화 개념 %d개: %s'
              % (len(missing), ', '.join(missing[:10])))
        print('  회차에 없으면 «언제 배웠는지» 를 말할 수 없어 화면이 안 냅니다.')
    out = replace(src, body)
    if '--check' in args:
        if out != src:
            print('✗ challenge.html 의 회차 표가 회차 파일과 어긋납니다.')
            print('  python3 tools/challenge_scope.py 로 다시 만드세요.')
            return 1
        print('심화 회차 표가 회차 파일과 일치합니다. (개념 %d개)'
              % len(json.loads(re.search(r'var CHALLENGE_ROUND=(\{.*?\});', src, re.S).group(1))))
        return 0
    open(PAGE, 'w', encoding='utf-8').write(out)
    print('challenge.html 회차 표 갱신 완료.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
