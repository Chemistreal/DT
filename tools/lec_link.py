#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""틀린 문항이 **정확히 어느 개념강의 한 편**으로 가는지 지킨다.

무슨 일이 있었나
----------------
성적표는 틀린 문항마다 오개념 이름을 적어 준다. 그런데 그 개념을 **어디서
배우는지**는 어디에도 없었다 — 학부모는 「분자간 힘」이라는 말만 받고,
그걸 어디서 다시 봐야 하는지는 못 받았다.

강의는 이미 있다. exam 저장소에 125편이 있고, DT 의 오개념 이름과 회차 자료는
이미 100% 물린다(회차 파일 46개 2,760문항의 mis 792종이 CORE 사전 안에 다 있다).
없던 것은 **오개념 이름 → 강의 한 편** 을 잇는 표 하나뿐이다.

    2026-09-02 실측: 이름이 exam 쪽 표와 그대로 겹치는 것 157종.
    문항으로 세면 2,760 가운데 665(24%). 나머지는 손으로 이어야 한다.

■ 강의가 다른 저장소에 있다

`https://chemistreal.github.io/exam/lec-013-…html`. 그래서 이 자는 파일이
실제로 있는지 디스크에서 확인할 수 없다. `concept-lecture-dt.json` 의
`lectures` 칸에 그 목록을 **베껴 두고** 그것과 대조한다. exam 쪽 강의가 늘거나
이름이 바뀌면 `--sync` 로 다시 베낀다(두 저장소가 같은 기계에 있을 때만).

■ 이 자가 지키는 것

    · 표가 가리키는 강의 번호가 lectures 칸에 실제로 있는가
    · 회차 자료의 오개념이 map·byUnit·unmapped 중 **한 곳에는** 있는가
      (조용히 빠지는 길을 안 남긴다 — 빠지면 그 문항은 강의 없이 흘러간다)
    · 한 이름이 map 과 byUnit 에 **둘 다** 있지는 않은가
      (화면은 byUnit 을 먼저 본다. 둘 다 있으면 byUnit 에 안 적힌 단원이
       조용히 map 의 한 강의로 뭉개진다)
    · 덮는 문항 수가 **줄지 않았는가** (바닥은 늘기만 한다)

⚠ 이 자는 «배정이 옳은지» 를 안 본다. 「전기음성도」를 015강에 보낸 것이 맞는지는
  화학을 아는 사람이 본다. 여기서 재는 것은 «이어져 있는가» 뿐이다.

    python3 tools/lec_link.py           # 지금 얼마나 이어져 있나
    python3 tools/lec_link.py --check   # 끊기거나 줄면 빨간불 (CI)
    python3 tools/lec_link.py --seal    # 지금 덮는 수를 새 바닥으로
    python3 tools/lec_link.py --absorb  # 집필 조각을 표로 옮긴다
    python3 tools/lec_link.py --emit    # 표를 report.html 의 LECMAP 으로
    python3 tools/lec_link.py --sync    # exam 저장소에서 강의 목록을 다시 베낀다
"""
import collections
import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP = os.path.join(ROOT, 'concept-lecture-dt.json')
SEAL = os.path.join(ROOT, 'tools', 'lec_link.json')
# 집필 조각이 놓이는 자리. **저장소 안**이다 — 임시 폴더에 두었다가 컨테이너가
# 사라지면서 여덟 시간치 배선 작업을 통째로 잃었다(2026-09-02). 저장소 안에
# 두면 자동 저장이 4분마다 밀어 넣으므로 같은 일이 안 난다.
#
# ⚠ 이 폴더는 **작업 중인 원고**다. 검증을 다 거치지 않은 조각이 섞여 있을 수
#   있으므로, 여기 있는 것을 바로 화면에 쓰지 않는다 — `--absorb` 로 표에
#   옮긴 것만 쓴다.
WIP = os.path.join(ROOT, 'tools', '_lecwip')
EXAM = '/home/user/exam'
SEP = '|'


def load(p):
    return json.load(io.open(p, encoding='utf-8'))


def save(doc):
    io.open(MAP, 'w', encoding='utf-8').write(
        json.dumps(doc, ensure_ascii=False, indent=1) + '\n')


def rounds():
    """회차 자료의 오개념 → 문항 수, 그리고 어느 「과목/단원」에 나오는지."""
    n = collections.Counter()
    unit = collections.defaultdict(collections.Counter)
    for f in sorted(glob.glob(os.path.join(ROOT, 'appdata', 'round_*.json'))):
        course = os.path.basename(f).split('_')[1]
        d = load(f)
        for it in ((d.get('jeongsi') or {}).get('items') or []):
            m = str(it.get('mis') or '').strip()
            if not m:
                continue
            n[m] += 1
            unit[m][course + '/' + str(it.get('u') or '')] += 1
    return n, unit


def sync():
    src = os.path.join(EXAM, 'concept-lecture.json')
    if not os.path.exists(src):
        print('exam 저장소를 못 찾았다: %s' % src)
        return 1
    lec = load(src)['lectures']
    doc = load(MAP)
    doc['lectures'] = {k: {'file': v['file'], 'title': v['title']}
                       for k, v in sorted(lec.items())}
    save(doc)
    print('강의 목록 %d편을 다시 베꼈다.' % len(doc['lectures']))
    return 0


def absorb():
    """집필 조각(dtlecwip/*.json)을 표로 옮긴다."""
    doc = load(MAP)
    lec = doc['lectures']
    f2n = {d['file']: n for n, d in lec.items()}
    mp = doc.setdefault('map', {})
    bu = doc.setdefault('byUnit', {})
    un = doc.setdefault('unmapped', {})
    parts = sorted(glob.glob(os.path.join(WIP, '*.json')))
    if not parts:
        print('옮길 조각이 없다 (%s 가 비어 있다)' % WIP)
        return 1
    added = paired = noted = 0
    ghosts = []
    for p in parts:
        for mis, v in load(p).items():
            v = v or {}
            pick, why = v.get('pick') or '', v.get('why') or ''
            per = v.get('byUnit') or {}
            if pick:
                n = f2n.get(pick)
                if not n:
                    ghosts.append('%s → %s' % (mis, pick))
                    continue
                mp[mis] = n
                added += 1
            for u, f in per.items():
                n = f2n.get(f)
                if not n:
                    ghosts.append('%s(%s) → %s' % (mis, u, f))
                    continue
                bu[u + SEP + mis] = n
                paired += 1
            if not pick and not per:
                un[mis] = why or '맞는 강의가 목록에 없다'
                noted += 1
    # byUnit 이 맡은 이름은 map 에서 뺀다 — 화면이 byUnit 을 먼저 보기 때문이다.
    moved = sorted({k.split(SEP, 1)[1] for k in bu if SEP in k} & set(mp))
    for t in moved:
        mp.pop(t, None)
    doc['map'] = dict(sorted(mp.items()))
    doc['byUnit'] = dict(sorted(bu.items()))
    doc['unmapped'] = dict(sorted(un.items()))
    save(doc)
    print('조각 %d개 → 이은 오개념 %d · 단원별로 갈린 짝 %d · 강의 없음 %d'
          % (len(parts), added, paired, noted))
    if moved:
        print('byUnit 이 맡은 이름 %d개를 map 에서 뺐다: %s'
              % (len(moved), ', '.join(moved[:8])))
    if ghosts:
        print('없는 강의를 가리킨 곳 %d: %s' % (len(ghosts), ', '.join(ghosts[:8])))
        return 1
    return 0


def emit():
    """표를 report.html 의 LECMAP·LECUNIT 상수로 내보낸다.

    두 상수는 **여기서만** 만든다. 손으로 고치면 표와 화면이 갈리고, 갈린 것을
    아무도 못 본다 — 화면은 잘못된 강의를 자신 있게 걸고 표는 옳은 것을 담고 있다.
    """
    doc = load(MAP)
    lec = doc['lectures']
    base = doc.get('base') or ''
    fn = lambda n: (lec.get(n) or {}).get('file') or ''
    m = {k: base + fn(v) for k, v in sorted(doc.get('map', {}).items()) if fn(v)}
    u = {k: base + fn(v) for k, v in sorted(doc.get('byUnit', {}).items()) if fn(v)}
    src = os.path.join(ROOT, 'report.html')
    s = io.open(src, encoding='utf-8').read()
    out = 0
    for name, table, note in (
            ('LECUNIT', u, '과목·단원이 함께 정해 주는 강의. 같은 오개념 이름이 화학Ⅰ과\n'
                           '   화학Ⅱ에서 다른 것을 물을 때 쓴다. LECMAP 보다 먼저 본다.'),
            ('LECMAP', m, '오개념 이름 → 개념강의 한 편(exam 저장소). 오답 개념 클리닉의\n'
                          '   「강의 보기」가 쓴다.')):
        body = json.dumps(table, ensure_ascii=False, separators=(',', ':'))
        line = ('/* %s — tools/lec_link.py --emit 가 concept-lecture-dt.json 에서 만든다.\n'
                '   %s\n'
                '   ⚠ 손으로 고치지 않는다. 고치려면 표를 고치고 다시 내보낸다. */\n'
                'const %s=%s;\n') % (name, note, name, body)
        pat = re.compile(r'(/\* %s —.*?\*/\n)?const %s=\{.*?\};\n' % (name, name), re.S)
        if pat.search(s):
            s = pat.sub(lambda mm: line, s, count=1)
        else:
            at = s.index('function segRankSec(')
            s = s[:at] + line + s[at:]
        out += len(table)
    io.open(src, 'w', encoding='utf-8').write(s)
    print('report.html 에 LECUNIT %d · LECMAP %d 를 썼다.' % (len(u), len(m)))
    return 0


def main():
    check = '--check' in sys.argv
    if '--sync' in sys.argv:
        return sync()
    if '--absorb' in sys.argv:
        return absorb()
    if '--emit' in sys.argv:
        return emit()
    doc = load(MAP)
    lec, mp, un = doc['lectures'], doc.get('map', {}), doc.get('unmapped', {})
    bu = doc.get('byUnit', {})
    bu_names = {k.split(SEP, 1)[1] for k in bu if SEP in k}
    n, unit = rounds()
    nQ = sum(n.values())

    ghost = sorted({v for v in mp.values() if v not in lec}
                   | {v for v in bu.values() if v and v not in lec})
    missing = sorted(t for t in n if t not in mp and t not in un and t not in bu_names)
    stale = sorted(t for t in list(mp) + list(un) if t not in n)
    straddle = sorted(bu_names & set(mp))
    thin = []
    for t in sorted(bu_names):
        want = set(unit[t])
        have = {k.split(SEP, 1)[0] for k in bu if k.split(SEP, 1)[1] == t}
        gap = sorted(want - have)
        if gap:
            thin.append((t, gap))

    covQ = sum(n[t] for t in n if t in mp or t in bu_names)
    covT = sum(1 for t in n if t in mp or t in bu_names)
    print('오개념 %d종 · 문항 %d개 · 개념강의 %d편' % (len(n), nQ, len(lec)))
    print('이어진 오개념 %d종(%d%%) · 이어진 문항 %d개(%d%%)'
          % (covT, round(100 * covT / max(1, len(n))),
             covQ, round(100 * covQ / max(1, nQ))))
    if un:
        print('못 이은 오개념 %d종(문항 %d개) — 까닭이 적혀 있다'
              % (len(un), sum(n.get(t, 0) for t in un)))

    bad = False
    if ghost:
        bad = True
        print('\n없는 강의로 보내는 자리 %d: %s' % (len(ghost), ', '.join(ghost[:10])))
    if missing:
        bad = True
        print('\nmap·byUnit·unmapped 어디에도 없는 오개념 %d종 (문항 %d개):'
              % (len(missing), sum(n[t] for t in missing)))
        for t in missing[:20]:
            print('  %-30s %d문항' % (t, n[t]))
    if straddle:
        bad = True
        print('\n한 이름이 map 과 byUnit 에 둘 다 있다 %d종: %s'
              % (len(straddle), ', '.join(straddle[:10])))
    if thin:
        bad = True
        print('\nbyUnit 이 단원을 다 안 적은 이름 %d종:' % len(thin))
        for t, g in thin[:10]:
            print('  %-20s 빠진 단원: %s' % (t, ', '.join(g[:6])))
    if stale:
        print('\n회차 자료에 없는 오개념이 표에 남아 있다 %d종: %s'
              % (len(stale), ', '.join(stale[:8])))

    if '--seal' in sys.argv:
        io.open(SEAL, 'w', encoding='utf-8').write(json.dumps(
            {'설명': '이어진 문항 수. 이 수는 **늘기만 한다** — 줄면 빨간불이다.',
             '바닥': {'문항': covQ, '오개념': covT}},
            ensure_ascii=False, indent=1, sort_keys=True) + '\n')
        print('\n지금 값을 tools/lec_link.json 에 바닥으로 적었다.')
        return 0
    if os.path.exists(SEAL):
        was = load(SEAL).get('바닥', {})
        if covQ < was.get('문항', 0):
            bad = True
            print('\n**줄었다** — 이어진 문항 %d → %d' % (was['문항'], covQ))
        elif covQ > was.get('문항', 0):
            print('\n늘었다 — 이어진 문항 %d → %d. --seal 로 새 바닥을 적는다.'
                  % (was['문항'], covQ))
    if bad:
        return 1 if check else 0
    print('\n끊긴 데 없다.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
