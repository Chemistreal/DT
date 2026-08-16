#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""한 개념에는 단원 표기 하나만 (선생님 결정 2026-08-15)

재어 보니 11개 개념이 회차마다 다른 단원으로 실려 있었다. 예를 들어
CH1-011 「원자 번호는 양성자 수와 같다」 는 1·2회에는 Ⅰ-1, 4~18회에는 Ⅱ-1 이다.

무엇이 어긋나나
---------------
단원 표기는 성적표의 «취약 단원» 집계와 PREREQ(선행 단원) 그래프의 열쇠다.
한 개념이 두 이름으로 갈리면 **같은 학생의 오답이 두 단원으로 나뉘어 세어진다.**
많이 틀린 단원이 둘로 쪼개져 둘 다 순위에서 밀려 안 보일 수 있다.

무엇을 기준으로 하나
--------------------
**많이 쓰인 표기를 남긴다.** 동률이면 아래 OVERRIDE 에 사람이 적어 둔다.

    실행:  python3 tools/unit_label.py           # 회차 파일을 고친다
           python3 tools/unit_label.py --check   # 두 이름이 남아 있으면 빨간불
           python3 tools/unit_label.py --list    # 무엇이 어떻게 정해지는지만 본다

⚠ 화학 내용의 옳고 그름은 사람이 본다. 이 자는 «몇 번 쓰였나» 만 센다.
  아래 OVERRIDE 는 자가 아니라 **사람이 정한 것**이다. 한 줄 고치면 바뀐다.
"""
import json
import glob
import os
import re
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT = os.path.join(ROOT, 'report.html')

# 다수결을 따르지 않기로 **사람이** 정한 것. 지금은 비어 있다.
#
# 처음엔 네 개를 여기 적었다. 회차 수로 세었더니 동률이었기 때문이다. 그런데
# 세어야 할 것은 회차가 아니라 **문항 칸**이었다 — 한 회차에 같은 개념이 여러
# 번 실린다. 칸으로 세니 열한 개 모두 한쪽이 뚜렷해서, 내가 정할 것이 없었다.
# (CH1-009 에 「007·011 과 같이 둔다」 고 적었던 근거도 틀렸다. 007 은 Ⅰ-1 이다.)
OVERRIDE = {}

# 다수결이 내용과 어긋나 보이는 것. 고치지 않고 **적어만 둔다** —
# 화학 판단이라 사람이 정할 일이고, 정해 주시면 위 OVERRIDE 에 한 줄 넣으면 된다.
NOTED = {
    'CH1-037': '「동위원소는 양성자수가 서로 다르다」 — 다수결은 Ⅰ-3(16회분)인데 '
               '내용은 Ⅱ-1(원자 구조, 11회분)로 보입니다.',
}


def round_files():
    return sorted(glob.glob(os.path.join(ROOT, 'appdata', 'round_*.json')))


def scan():
    """(과목, 개념) -> {표기: 횟수}"""
    lab = collections.defaultdict(collections.Counter)
    for f in round_files():
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        c = d.get('course')
        rows = list(d.get('jeongsi', {}).get('items') or [])
        for v in d.get('retakeC') or []:
            rows += list(v.get('items') or [])
        for i in rows:
            if i.get('c'):
                lab[(c, i['c'])][i.get('u', '')] += 1
    return lab


def decide(lab):
    """(과목, 개념) -> 남길 표기.  갈린 것만 담는다."""
    keep = {}
    for k, cnt in lab.items():
        if len(cnt) < 2:
            continue
        cid = k[1]
        if cid in OVERRIDE:
            keep[k] = OVERRIDE[cid]
            continue
        # 많이 쓰인 것. 동률이면 이름 순으로 갈라 늘 같은 답이 나오게 한다.
        keep[k] = sorted(cnt.items(), key=lambda x: (-x[1], x[0]))[0][0]
    return keep


def style_of(text):
    """이 파일이 원래 어떤 꼴로 적혀 있었나.

    회차 파일은 꼴이 제각각이다 — 한 줄짜리도 있고 한 칸 들여쓴 것도 있다.
    한 꼴로 통일해 다시 쓰면 34칸 고치는 변경이 3만 줄짜리 diff 가 되어
    아무도 검토할 수 없다(실제로 그렇게 만들었다가 되돌렸다). 원래 꼴을 지킨다."""
    if '\n' not in text.strip():
        return None                       # 한 줄
    for line in text.split('\n')[1:]:
        if line.strip():
            return len(line) - len(line.lstrip())
    return None


def apply(keep):
    changed = collections.Counter()
    for f in round_files():
        with open(f, encoding='utf-8') as fh:
            text = fh.read()
        d = json.loads(text)
        indent = style_of(text)
        tail = '\n' if text.endswith('\n') else ''
        c = d.get('course')
        rows = list(d.get('jeongsi', {}).get('items') or [])
        for v in d.get('retakeC') or []:
            rows += list(v.get('items') or [])
        hit = 0
        for i in rows:
            k = (c, i.get('c'))
            if k in keep and i.get('u') != keep[k]:
                i['u'] = keep[k]
                hit += 1
        if not hit:
            continue
        out = json.dumps(d, ensure_ascii=False,
                         indent=indent,
                         separators=(',', ': ') if indent else (', ', ': ')) + tail
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(out)
        changed[os.path.basename(f)] = hit
    return changed


def orphan_units(lab):
    """고친 뒤 아무 문항도 안 쓰는 단원이 생기면 PREREQ 에 유령이 남는다."""
    used = collections.defaultdict(set)
    for (c, _), cnt in lab.items():
        for u in cnt:
            used[c].add(u)
    src = open(REPORT, encoding='utf-8').read()
    m = re.search(r'const PREREQ=(\{.*?\});\n', src, re.S)
    if not m:
        return {}
    pre = json.loads(m.group(1))
    out = {}
    for c, g in pre.items():
        gone = [u for u in g if u not in used.get(c, set())]
        if gone:
            out[c] = gone
    return out


def main():
    args = sys.argv[1:]
    lab = scan()
    keep = decide(lab)
    if '--list' in args or '--check' in args:
        for k in sorted(keep, key=lambda x: x[1]):
            cnt = lab[k]
            src = ' · '.join('%s(%d)' % (u, n) for u, n in sorted(cnt.items(), key=lambda x: -x[1]))
            mark = '사람' if k[1] in OVERRIDE else '다수'
            print('  %-4s %-9s %s  ->  %s   [%s]' % (k[0], k[1], src, keep[k], mark))
        for cid, why in NOTED.items():
            print('  ⚠ %s  %s' % (cid, why))
    if '--check' in args:
        split = [k for k, cnt in lab.items() if len(cnt) > 1]
        if split:
            print('✗ 한 개념에 단원 표기가 둘인 것이 %d개 남아 있습니다.' % len(split))
            print('  python3 tools/unit_label.py 로 통일하세요.')
            return 1
        print('한 개념에는 단원 표기 하나뿐입니다. (개념 %d개)' % len(lab))
        return 0
    if '--list' in args:
        return 0
    if not keep:
        print('갈린 표기 없음.')
        return 0
    changed = apply(keep)
    print('단원 표기 통일: 개념 %d개 · 파일 %d개 · 칸 %d개'
          % (len(keep), len(changed), sum(changed.values())))
    ghosts = orphan_units(scan())
    if ghosts:
        print('⚠ 이제 아무 문항도 안 쓰는 단원이 PREREQ 에 남습니다:', ghosts)
    return 0


if __name__ == '__main__':
    sys.exit(main())
