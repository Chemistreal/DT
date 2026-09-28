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
다시 만든다. --check 는 은행·엮기 문장·약점 이름 표를 본다(회차 표는 challenge_scope.py --check 가 본다).

두 개념 엮기 · 약한 개념 찾기 (선생님 결정 2026-09-28)
---------------------------------------------------
심화의 뜻은 «반반» 이다 — 절반은 학생이 약한 개념의 lvl3 문장(«약한 개념 다시»),
절반은 두 개념을 엮는 새 문장(«두 개념 엮기»). 그래서 이 자가 상수 둘을 더 만든다.

    CHALLENGE_LINK   appdata/challenge_link.json 의 연결 문장. 파일이 없으면 [].
                     들어오는 꼴: [{c, c2, a, s, f, w, first_round}]
                       c·c2  개념 id (c 가 문장의 «주인» — 그 과목 학생에게 낸다)
                       a·s   정답(O/X)·문장     f·w  옳은 문장·까닭(회차 파일과 같은 뜻)
                       first_round  c 의 과목에서 둘 다 배운 회차
                     나가는 꼴: 위에 m·m2(두 개념 이름)를 붙인 것.
                     first_round 는 **회차 파일로 다시 잰 값보다 이르면 늦춘다** —
                     적어 온 수가 틀려도 안 배운 것을 내지 않게(자가 더 늦게만 고친다).
                     c2 가 c 의 과목이나 그 선수 과목이 아니면 뺀다(화학Ⅰ 문장에
                     화학Ⅱ 개념이 엮이면 화학Ⅰ 학생은 그것을 안 배웠다).
    CHALLENGE_MIS    오개념 이름 → 은행 개념 id 목록. 성적표가 &mis= 로 넘기는 이름을
                     은행 개념에 맞대는 표다. 이름은 엔진(chemengine.js)의 misCanon 과
                     **같은 규칙**(앞뒤 공백을 떼고 MIS_CANON 표로 대표 이름)으로 바꾼 뒤
                     맞댄다. 표를 화면에 베끼지 않고, 대표 이름 쪽 표(CHALLENGE_MIS)와
                     «옛 이름 → 대표 이름» 가운데 은행에 닿는 것(CHALLENGE_CANON)만 싣는다.
                     chemengine.js 의 표가 바뀌면 --check 가 빨간불이 된다.

    python3 tools/challenge_bank.py --page-with-link 파일
        # appdata/challenge_link.json 대신 그 파일로 만든 challenge.html 전체(회차 표까지)를
        # 표준 출력으로만 낸다 — 파일은 안 건드린다. 테스트(tests/run.js)가 작은 연결 파일로
        # «파일 → 이 자 → 화면» 을 한 번에 재려고 쓴다.

⚠ 화학 내용의 옳고 그름은 사람이 본다. 이 자는 «lvl 이 3 인가» 와 연결 문장의
  꼴·회차만 본다. 결과 저장은 화면(challenge.html)과 apps-script.gs 의 일이다.
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
LINK = os.path.join(ROOT, 'appdata', 'challenge_link.json')
ENGINE = os.path.join(ROOT, 'chemengine.js')
BEGIN = '/* CHALLENGE_BANK: 자동 생성 — tools/challenge_bank.py */'
END = '/* /CHALLENGE_BANK */'
LBEGIN = '/* CHALLENGE_LINK: 자동 생성 — tools/challenge_bank.py */'
LEND = '/* /CHALLENGE_LINK */'
MBEGIN = '/* CHALLENGE_MIS: 자동 생성 — tools/challenge_bank.py */'
MEND = '/* /CHALLENGE_MIS */'
# 과목 → 낼 수 있는 개념 접두(첫 자리가 그 과목, 나머지는 선수). challenge.html 의 PRECOURSE 와 같다.
PRECOURSE = {'ch1': ['CH1'], 'ch2': ['CH2', 'CH1'], 'gc': ['GC', 'CH2', 'CH1']}
PREFIX_COURSE = {'CH1': 'ch1', 'CH2': 'ch2', 'GC': 'gc'}
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


# ── 오개념 이름 → 은행 개념 ─────────────────────────────────────────
def mis_canon_table():
    """chemengine.js 의 MIS_CANON 을 그대로 읽는다(베끼지 않는다)."""
    src = open(ENGINE, encoding='utf-8').read()
    m = re.search(r'^ {0,2}var MIS_CANON = (\{.*\});$', src, re.M)
    if not m:
        raise SystemExit('chemengine.js 에서 MIS_CANON 을 못 찾았습니다.')
    return json.loads(m.group(1))


def canon(table, m):
    """chemengine.js misCanon 과 같은 규칙: 앞뒤 공백을 떼고, 표에 있으면 대표 이름."""
    k = ('' if m is None else str(m)).strip()
    return table.get(k) or k


def concept_names():
    """개념 id -> forms_bank 의 개념 이름(m). 연결 문장의 두 개념 이름에 쓴다."""
    if not os.path.exists(FORMS):
        return {}
    with open(FORMS, encoding='utf-8') as fh:
        fb = json.load(fh)
    return {c: v['m'] for c, v in fb.items()
            if isinstance(v, dict) and isinstance(v.get('m'), str) and v['m']}


def build_mis(bank):
    """(대표 이름 -> [개념 id], 옛 이름 -> 대표 이름) — 은행에 닿는 것만.

    한 개념에 이름이 여럿일 수 있다(lvl3 문항마다 mis 가 다르게 적힌 것 · forms_bank 의
    개념 이름). 전부 대표 이름으로 바꿔 그 개념에 건다. 성적표가 어느 이름을 넘겨도
    같은 개념에 닿게."""
    table, got, names = mis_canon_table(), collect(), concept_names()
    idx = {}
    for lst in bank.values():
        for c in lst:
            cid = c['c']
            ms = set(got.get(cid, {}).get('mis', {}).keys())
            if c.get('m'):
                ms.add(c['m'])
            if names.get(cid):
                ms.add(names[cid])
            for m in ms:
                k = canon(table, m)
                if k:
                    idx.setdefault(k, set()).add(cid)
    mis = {k: sorted(v) for k, v in sorted(idx.items())}
    alias = {k: v for k, v in sorted(table.items()) if v in mis and k != v}
    return mis, alias


def mis_body(mis, alias):
    return (MBEGIN + '\n'
            + 'var CHALLENGE_MIS=' + json.dumps(mis, ensure_ascii=False, sort_keys=True) + ';\n'
            + 'var CHALLENGE_CANON=' + json.dumps(alias, ensure_ascii=False, sort_keys=True) + ';\n'
            + MEND)


# ── 두 개념 엮기 ────────────────────────────────────────────────────
def build_link(path=LINK):
    """연결 파일 -> (화면에 실을 목록, 경고). 파일이 없으면 빈 목록."""
    if not os.path.exists(path):
        return [], []
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise SystemExit('%s 는 목록([...])이어야 합니다.' % os.path.relpath(path, ROOT))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import challenge_scope
    first = challenge_scope.first_round()          # 개념 id -> (그 과목, 처음 나온 회차)
    names = concept_names()
    out, warn, seen = [], [], set()
    for i, e in enumerate(data):
        tag = '#%d' % i
        if not isinstance(e, dict):
            warn.append('%s: 항목이 객체가 아니다' % tag)
            continue
        c, c2, a, st = e.get('c'), e.get('c2'), e.get('a'), e.get('s')
        ok = all(isinstance(x, str) and x.rsplit('-', 1)[0] in PREFIXES for x in (c, c2))
        if not ok or c == c2:
            warn.append('%s: 개념 id(c·c2)가 이상하다 — %r %r' % (tag, c, c2))
            continue
        if a not in ('O', 'X') or not isinstance(st, str) or not st.strip():
            warn.append('%s (%s): 정답(O/X)이나 문장이 없다' % (tag, c))
            continue
        p, p2 = c.rsplit('-', 1)[0], c2.rsplit('-', 1)[0]
        course = PREFIX_COURSE[p]
        if p2 not in PRECOURSE[course]:
            warn.append('%s (%s+%s): %s 학생이 안 배운 과목의 개념이 엮였다 — 뺀다' % (tag, c, c2, course))
            continue
        need = []
        for x, px in ((c, p), (c2, p2)):
            if px != p:
                continue                            # 선수 과목은 이미 다 배웠다
            if x not in first:
                need = None
                warn.append('%s (%s): %s 가 %s 회차 파일에 없다 — 언제 배우는지 몰라 뺀다' % (tag, c, x, course))
                break
            need.append(first[x][1])
        if need is None:
            continue
        given = e.get('first_round')
        given = given if isinstance(given, int) and not isinstance(given, bool) and given > 0 else 0
        r = max([given] + need)
        if given and r > given:
            warn.append('%s (%s+%s): first_round %d 은 이르다 — 회차 파일로는 %d회라 늦춘다'
                        % (tag, c, c2, given, r))
        if st in seen:
            continue                                # 같은 문장은 한 번만
        seen.add(st)
        f, w = e.get('f'), e.get('w')
        out.append({'c': c, 'c2': c2, 'm': names.get(c, ''), 'm2': names.get(c2, ''),
                    'a': a, 's': st, 'f': f if isinstance(f, str) else '',
                    'w': w if isinstance(w, str) else '', 'first_round': r})
    return out, warn


def link_body(link):
    return (LBEGIN + '\n'
            + 'const CHALLENGE_LINK=' + json.dumps(link, ensure_ascii=False) + ';\n'
            + LEND)


def plant(src, begin, end, text):
    """마커 사이를 갈아 끼운다. 처음이면 CHALLENGE_BANK 블록 바로 뒤에 심는다."""
    pat = re.compile(re.escape(begin) + r'.*?' + re.escape(end), re.S)
    if pat.search(src):
        return pat.sub(lambda _: text, src)
    i = src.index(END) + len(END)
    return src[:i] + '\n\n' + text + src[i:]


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


def refresh_round(src, quiet=False):
    """은행이 바뀌면 회차 표도 같이 — 표는 은행(과 엮기 문장)에 실린 개념만 담는다."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import challenge_scope
    tbl, missing = challenge_scope.build(src)
    if missing and not quiet:
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
    link_path = LINK
    if '--page-with-link' in args:
        rest = [a for a in args if a != '--page-with-link']
        if len(rest) != 1 or not os.path.isfile(rest[0]):
            print('--page-with-link 뒤에는 연결 파일 경로 하나가 와야 합니다.')
            return 2
        link_path = rest[0]
    src = open(PAGE, encoding='utf-8').read()
    bank = build()
    n, s, _ = stats(bank)
    link, warn = build_link(link_path)
    if link_path != LINK:
        out = replace(src, body(bank))
        out = plant(out, LBEGIN, LEND, link_body(link))
        out = plant(out, MBEGIN, MEND, mis_body(*build_mis(bank)))
        sys.stdout.write(refresh_round(out, quiet=True))
        return 0
    mis, alias = build_mis(bank)
    out = replace(src, body(bank))
    out = plant(out, LBEGIN, LEND, link_body(link))
    out = plant(out, MBEGIN, MEND, mis_body(mis, alias))
    for w_ in warn[:12]:
        print('⚠ 연결 문장 ' + w_)
    if len(warn) > 12:
        print('⚠ 연결 문장 경고 %d개 더' % (len(warn) - 12))
    if '--check' in args:
        if out != src:
            print('✗ challenge.html 의 CHALLENGE_BANK·CHALLENGE_LINK·CHALLENGE_MIS 가 회차 파일(lvl3)·')
            print('  appdata/challenge_link.json·chemengine.js 의 MIS_CANON 과 어긋납니다.')
            print('  python3 tools/challenge_bank.py --write 로 다시 만드세요.')
            return 1
        print('심화 문제은행이 회차 파일과 일치합니다. (개념 %d개 · 문장 %d개 · 빈 개념 0 · '
              '연결 문장 %d개 · 약점 이름 %d개)' % (n, s, len(link), len(mis)))
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
