#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""회차마다 «정시에서 어떤 오개념을 물었나» 표(ROUND_MIS)를 회차 파일에서 만든다.

왜 이 표가 있나
---------------
「반복해서 막히는 곳」(고질)은 예전에 **틀린 회차 수만** 셌다 — 서로 다른 두 회차에서
틀리면 고질이었다. 그 개념을 몇 번 물었는지는 안 봤다. 그래서 85점 학생(회차마다 9문항
틀림)을 흉내 내 보니 화학Ⅰ 4회 만에 고질이 평균 4.3개, 8회 만에 10.3개가 떴다 —
여덟 번 물어 두 번 틀린 개념도 «반복해서 막힌다» 가 됐다.

선생님이 정한 규칙(2026-09-28): 그 학생이 본 회차(회차마다 첫 응시)에서
    그 개념을 **물은** 회차가 3회 이상이고, 그중 **절반 이상**에서 틀렸을 때만 고질.

«물었다» 를 세려면 회차의 정시 문항에 그 오개념이 있는지 알아야 한다. 화면(report.html)은
회차 파일을 받아 셀 수 있지만 **서버(apps-script.gs)에는 회차 파일이 없다.** 그래서 이 자가
appdata/round_*.json 에서 작은 표를 만들어 chemengine.js 와 apps-script.gs 두 곳에 넣는다.
이름은 두 파일이 이미 가진 대표 이름 표(MIS_CANON · misCanon)로 맞춘 대표 이름이다 —
`옥텟규칙` 과 `옥텟 규칙` 이 다른 개념으로 세어지면 분모가 갈린다.

표는 마커 두 줄 사이에 있다(손으로 고치지 않는다):

    /* ROUND_MIS-BEGIN … */
    var ROUND_MIS = { "ch1": { "1": ["…", …], … }, … };
    /* ROUND_MIS-END */

chemengine.js 를 고쳤으면 화면 안 사본도 맞춘다: python3 tools/engine_sync.py --write

    python3 tools/gen_round_mis.py            # 회차·개념 수만 보여 준다
    python3 tools/gen_round_mis.py --write    # 두 파일의 표를 다시 만든다
    python3 tools/gen_round_mis.py --check    # 회차 파일과 어긋났으면 빨간불 (CI)
"""
import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, 'chemengine.js')
GS = os.path.join(ROOT, 'apps-script.gs')
TARGETS = [ENGINE, GS]

BEGIN = ('/* ROUND_MIS-BEGIN — 회차별 정시 문항의 오개념(대표 이름). tools/gen_round_mis.py --write 가 '
         'appdata/round_*.json 에서 만든다. 손으로 고치지 않는다. */')
END = '/* ROUND_MIS-END */'

CANON_LINE = re.compile(r'^ {0,2}var MIS_CANON = (\{.*\});$', re.M)
# 고질 문턱 두 수 — 두 파일이 같은 값이어야 같은 학생에게 같은 말을 한다.
CONST = re.compile(r'^ {0,2}var (CHRONIC_MIN_ASKED|CHRONIC_MIN_RATE) = ([0-9.]+);', re.M)


def read(p):
    return open(p, encoding='utf-8').read()


def mis_canon_table():
    m = CANON_LINE.search(read(ENGINE))
    if not m:
        raise SystemExit('chemengine.js 에서 MIS_CANON 표를 못 찾았다')
    return json.loads(m.group(1))


def build():
    canon = mis_canon_table()

    def mc(s):
        k = ('' if s is None else str(s)).strip()
        return canon.get(k, k)

    table = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'appdata', 'round_*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        course, rnd = d.get('course'), d.get('round')
        items = ((d.get('jeongsi') or {}).get('items')) or []
        if not course or rnd is None or not items:
            continue
        names = sorted({mc(it.get('mis')) for it in items if mc(it.get('mis'))})
        table.setdefault(course, {})[str(int(rnd))] = names
    return table


def block(table):
    lines = [BEGIN, 'var ROUND_MIS = {']
    courses = sorted(table)
    for ci, c in enumerate(courses):
        lines.append('%s: {' % json.dumps(c))
        rounds = sorted(table[c], key=int)
        for ri, r in enumerate(rounds):
            lines.append('%s: %s%s' % (json.dumps(r), json.dumps(table[c][r], ensure_ascii=False, separators=(',', ':')),
                                      ',' if ri < len(rounds) - 1 else ''))
        lines.append('}' + (',' if ci < len(courses) - 1 else ''))
    lines.append('};')
    lines.append(END)
    return '\n'.join(lines)


def span(src):
    nb, ne = src.count(BEGIN), src.count(END)
    if nb == 0 and ne == 0:
        return None
    if nb != 1 or ne != 1:
        raise SystemExit('ROUND_MIS 마커가 하나씩이 아니다 (BEGIN %d · END %d)' % (nb, ne))
    a = src.find(BEGIN)
    b = src.find(END, a)
    if b < a:
        raise SystemExit('ROUND_MIS-END 가 ROUND_MIS-BEGIN 앞에 있다')
    return a, b + len(END)


def check(want):
    bad = []
    consts = {}
    for p in TARGETS:
        name = os.path.basename(p)
        src = read(p)
        try:
            sp = span(src)
        except SystemExit as e:
            bad.append('%s: %s' % (name, e))
            continue
        if sp is None:
            bad.append('%s: ROUND_MIS 마커가 없다 (처음 넣는 자리는 손으로 정한다 — MIS_CANON·misCanon 다음)' % name)
            continue
        if src[sp[0]:sp[1]] != want:
            bad.append('%s: ROUND_MIS 표가 회차 파일과 다르다 (--write 로 맞춘다)' % name)
        consts[name] = dict(CONST.findall(src))
        for k in ('CHRONIC_MIN_ASKED', 'CHRONIC_MIN_RATE'):
            if k not in consts[name]:
                bad.append('%s: 고질 문턱 %s 이 없다' % (name, k))
    vals = list(consts.values())
    if len(vals) == 2 and vals[0] != vals[1]:
        bad.append('고질 문턱이 두 파일에서 다르다: %s' % json.dumps(consts, ensure_ascii=False))
    return bad


def write(want):
    changed = []
    for p in TARGETS:
        src = read(p)
        sp = span(src)
        if sp is None:
            raise SystemExit('%s: ROUND_MIS 마커가 없다 — 처음 넣는 자리는 손으로 정한다' % os.path.basename(p))
        new = src[:sp[0]] + want + src[sp[1]:]
        if new != src:
            open(p, 'w', encoding='utf-8').write(new)
            changed.append(os.path.basename(p))
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    table = build()
    want = block(table)
    if a.write:
        ch = write(want)
        print('고쳤다: ' + (', '.join(ch) if ch else '없음 (이미 같다)'))
        if 'chemengine.js' in ch:
            print('  → 화면 안 사본도 맞춘다: python3 tools/engine_sync.py --write')
    if not a.check:
        for c in sorted(table):
            n = [len(v) for v in table[c].values()]
            print('%s: %d회차 · 회차당 오개념 %d~%d' % (c, len(n), min(n), max(n)))
    bad = check(want)
    if bad:
        print('FAIL')
        for b in bad:
            print('  ' + b)
        return 1 if a.check else 0
    print('PASS · ROUND_MIS 표가 두 파일에서 회차 파일과 같다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
