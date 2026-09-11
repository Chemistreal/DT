#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""심화 도전(challenge.html)의 문제은행 CHALLENGE_BANK 를 회차 파일에서 만든다.

왜 이 자가 있나 (2026-09-11)
----------------------------
challenge.html 의 CHALLENGE_BANK 는 **손으로 박힌 상수**였다. 140개념·480문장을
정시·재시·forms_bank 와 대 보니 480/480 이 이미 있는 문장이었고, 그중 정시에
있는 280 문장 가운데 lvl3(심화)은 72(15%)뿐, lvl1 이 61 이었다. «심화» 라면서
가장 쉬운 단계 문장이 더 많았다. 문장이 하나도 없는 개념도 20개 실려 있었다.

회차 파일에는 lvl==3 문항이 859개 있다. 그것을 모으면 된다 — 손으로 고르면
반드시 어긋나고, 회차가 늘어도 아무도 다시 안 고른다.

무엇을 하나
-----------
appdata/round_*.json 의 jeongsi.items 중 **lvl==3 만** 모아 개념별로 묶는다.

    과목    개념코드 접두(CH1/CH2/GC). 회차 파일의 과목이 아니다 — 일반화학
            회차 파일에 CH1·CH2 개념이 섞여 실린다(선수 내용을 다시 쓴다).
    c       개념 id
    m       그 개념의 오개념 이름(mis). 여럿이면 최빈, 같으면 먼저 나온 것
    ol      appdata/forms_bank.json 의 reading.oneline. 없으면 ''
    forms   [{a, s}] — 같은 문장은 한 번만

문장이 없는 개념은 넣지 않는다(빈 개념이 화면에 남을 이유가 없다).

    python3 tools/challenge_bank.py --write   # 은행을 다시 만들고 회차 표도 갱신
    python3 tools/challenge_bank.py --check   # 다시 만들어 파일과 다르면 빨간불
    python3 tools/challenge_bank.py --report [기준 challenge.html]
                                              # «파일에 실린 것 vs 회차 파일로 만든 것» 의
                                              # 개념 수·문장 수·lvl3 비율. --write 한 뒤에는
                                              # 둘이 같으므로, 옛 은행과 견주려면 그 파일을
                                              # 준다(예: git show 2962774:challenge.html > /tmp/old.html)

은행이 바뀌면 CHALLENGE_ROUND(tools/challenge_scope.py)도 같이 바뀌어야 한다 —
그 표는 은행에 실린 개념만 담기 때문이다. 그래서 --write 는 회차 표까지 같이
다시 만든다. --check 는 은행만 본다(표는 challenge_scope.py --check 가 본다).

⚠ 화학 내용의 옳고 그름은 사람이 본다. 이 자는 «lvl 이 3 인가» 만 본다.
  심화의 뜻(약한 개념 다시 vs 한 층 더)·학생 약점 우선 뽑기·결과 저장은
  선생님이 정할 일이라 여기에 없다.
"""
import collections
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'challenge.html')
FORMS = os.path.join(ROOT, 'appdata', 'forms_bank.json')
BEGIN = '/* CHALLENGE_BANK: 자동 생성 — tools/challenge_bank.py */'
END = '/* /CHALLENGE_BANK */'
PREFIXES = ('CH1', 'CH2', 'GC')
LVL = 3


def rounds():
    for f in sorted(glob.glob(os.path.join(ROOT, 'appdata', 'round_*.json'))):
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        yield d


def onelines():
    if not os.path.exists(FORMS):
        return {}
    with open(FORMS, encoding='utf-8') as fh:
        fb = json.load(fh)
    out = {}
    for c, v in fb.items():
        r = v.get('reading') if isinstance(v, dict) else None
        ol = (r or {}).get('oneline') if isinstance(r, dict) else None
        if isinstance(ol, str) and ol:
            out[c] = ol
    return out


def collect():
    """개념 id -> {'mis': Counter, 'forms': [(a, s)]} — 정시 lvl3 만, 파일 순서대로."""
    got = {}
    for d in rounds():
        for it in d.get('jeongsi', {}).get('items') or []:
            if it.get('lvl') != LVL:
                continue
            c, a, s = it.get('c'), it.get('a'), it.get('s')
            if not (isinstance(c, str) and c.rsplit('-', 1)[0] in PREFIXES):
                continue
            if a not in ('O', 'X') or not isinstance(s, str) or not s.strip():
                continue
            cur = got.setdefault(c, {'mis': collections.Counter(), 'forms': [], 'seen': set()})
            if isinstance(it.get('mis'), str) and it['mis']:
                cur['mis'][it['mis']] += 1
            if s not in cur['seen']:               # 같은 문장은 한 번만
                cur['seen'].add(s)
                cur['forms'].append({'a': a, 's': s})
    return got


def build():
    got, ol = collect(), onelines()
    bank = {p: [] for p in PREFIXES}
    for c in sorted(got):
        v = got[c]
        if not v['forms']:
            continue
        m = v['mis'].most_common(1)[0][0] if v['mis'] else ''
        bank[c.rsplit('-', 1)[0]].append(
            {'c': c, 'm': m, 'ol': ol.get(c, ''), 'forms': v['forms']})
    return bank


def body(bank):
    return (BEGIN + '\n'
            + 'const CHALLENGE_BANK=' + json.dumps(bank, ensure_ascii=False) + ';\n'
            + END)


def current(src):
    m = re.search(r'const CHALLENGE_BANK=(\{.*?\});\n', src, re.S)
    if not m:
        raise SystemExit('challenge.html 안에서 CHALLENGE_BANK 를 못 찾았습니다.')
    return json.loads(m.group(1))


def replace(src, text):
    pat = re.compile(re.escape(BEGIN) + r'.*?' + re.escape(END), re.S)
    if pat.search(src):
        return pat.sub(lambda _: text, src)
    # 처음 심을 때는 손으로 박혀 있던 상수 한 줄을 그대로 갈아 끼운다.
    line = re.compile(r'const CHALLENGE_BANK=\{.*?\};\n', re.S)
    if not line.search(src):
        raise SystemExit('challenge.html 안에서 CHALLENGE_BANK 를 못 찾았습니다.')
    return line.sub(lambda _: text + '\n', src, count=1)


def stats(bank):
    n = sum(len(v) for v in bank.values())
    s = sum(len(c.get('forms') or []) for v in bank.values() for c in v)
    empty = sum(1 for v in bank.values() for c in v if not c.get('forms'))
    return n, s, empty


def lvl_of_bank(bank):
    """은행 문장이 정시 회차 파일에서 몇 단계인가 (lvl3 비율을 재려고)."""
    lv = {}
    for d in rounds():
        for it in d.get('jeongsi', {}).get('items') or []:
            if isinstance(it.get('c'), str) and isinstance(it.get('s'), str):
                lv.setdefault((it['c'], it['s']), set()).add(it.get('lvl'))
    cnt = collections.Counter()
    for v in bank.values():
        for c in v:
            for f in c.get('forms') or []:
                k = lv.get((c['c'], f['s']))
                cnt['없음' if not k else ('lvl' + '/'.join(str(x) for x in sorted(k, key=str)))] += 1
    return cnt


def report(base=None):
    """base 가 있으면 그 파일(옛 challenge.html)의 은행을, 없으면 지금 파일의 은행을
    «파일에 실린 것» 으로 놓고 회차 파일로 만든 것과 견준다. --write 한 뒤에는
    지금 파일과 생성이 같아지므로 «전» 을 다시 보려면 base 를 줘야 한다."""
    src = open(base or PAGE, encoding='utf-8').read()
    old, new = current(src), build()
    print('심화 문제은행 · 파일에 실린 것(%s) vs 회차 파일로 만든 것\n'
          % (base or 'challenge.html'))
    for name, b in (('파일에 실린 것', old), ('회차 파일 lvl3 로 만든 것', new)):
        n, s, empty = stats(b)
        cnt = lvl_of_bank(b)
        # «lvl3 포함» — 같은 문장이 어느 회차엔 2단계, 다른 회차엔 3단계로 실린 것도 센다.
        l3 = sum(v for k, v in cnt.items() if '3' in k)
        print('  %-16s 개념 %3d (빈 것 %2d) · 문장 %3d · 정시 lvl3 포함 %3d (%d%%)'
              % (name, n, empty, s, l3, round(100.0 * l3 / s) if s else 0))
        for p in PREFIXES:
            print('      %-3s 개념 %3d · 문장 %3d' % (p, len(b.get(p, [])),
                                                   sum(len(c.get('forms') or []) for c in b.get(p, []))))
        print('      문장 단계: ' + ', '.join('%s %d' % (k, v) for k, v in sorted(cnt.items())))
    old_c = {c['c'] for v in old.values() for c in v}
    new_c = {c['c'] for v in new.values() for c in v}
    print('\n  개념 겹침 %d · 파일에만 %d · 회차 lvl3 에만 %d'
          % (len(old_c & new_c), len(old_c - new_c), len(new_c - old_c)))


def refresh_round(src):
    """은행이 바뀌면 회차 표도 같이 — 표는 은행에 실린 개념만 담는다."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import challenge_scope
    tbl, missing = challenge_scope.build(src)
    if missing:
        print('⚠ 어느 회차에도 안 나오는 심화 개념 %d개: %s'
              % (len(missing), ', '.join(missing[:10])))
    return challenge_scope.replace(src, tbl)


def main():
    args = sys.argv[1:]
    if '--report' in args:
        rest = [a for a in args if a != '--report']
        if len(rest) > 1 or (rest and not os.path.isfile(rest[0])):
            print('--report 뒤에는 기준 challenge.html 경로 하나만 올 수 있습니다: %s' % ' '.join(rest))
            return 2
        report(rest[0] if rest else None)
        return 0
    src = open(PAGE, encoding='utf-8').read()
    bank = build()
    n, s, _ = stats(bank)
    out = replace(src, body(bank))
    if '--check' in args:
        if out != src:
            print('✗ challenge.html 의 CHALLENGE_BANK 가 회차 파일(lvl3)과 어긋납니다.')
            print('  python3 tools/challenge_bank.py --write 로 다시 만드세요.')
            return 1
        print('심화 문제은행이 회차 파일과 일치합니다. (개념 %d개 · 문장 %d개 · 빈 개념 0)' % (n, s))
        return 0
    if '--write' not in args:
        print(__doc__.split('\n\n')[0])
        print('  --write / --check / --report 가운데 하나를 주세요.')
        return 2
    out = refresh_round(out)
    if out == src:
        print('challenge.html 은 이미 최신입니다. (개념 %d개 · 문장 %d개)' % (n, s))
        return 0
    open(PAGE, 'w', encoding='utf-8').write(out)
    print('challenge.html 문제은행 갱신 완료. (개념 %d개 · 문장 %d개) — 회차 표도 같이 갱신' % (n, s))
    return 0


if __name__ == '__main__':
    sys.exit(main())
