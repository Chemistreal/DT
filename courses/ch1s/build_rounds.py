# -*- coding: utf-8 -*-
"""화학1 심화 정시 회차 파일 10개를 조립·검사한다.

  python3 courses/ch1s/build_rounds.py --write   # tools/_stage/ch1s/w_*.json → round_ch1s_NN.json
  python3 courses/ch1s/build_rounds.py --check   # 회차 파일을 design.json 설계표와 대조

설계표(design.json blueprint)의 칸마다
  · 신규 · 복습-새  → 새로 쓴 문장 (집필 결과 w_*.json 의 "R-NN")
  · 복습-재출제     → from_round 회 from_n 번 문장을 글자 그대로 다시 낸다
재시(retakeC)는 3단계(재시·확인 문장)에서 채운다.
"""
import collections
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DT = os.path.dirname(os.path.dirname(HERE))
KEYS = ('n', 'u', 'mis', 'a', 's', 'f', 'w', 'lvl', 'c')
SCORING = {'per': 1.6667, 'max': 100, 'wrong': 0, 'blank': 0, 'pass': 80}


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def norm(s):
    return re.sub(r'\s+', '', s)


def round_path(r):
    return os.path.join(HERE, 'round_ch1s_%02d.json' % r)


def ch1_corpus():
    """기존 화학1 문장(정시·재시·문장 은행) — 심화반 새 문장과 글자까지 같으면 안 된다."""
    out = set()
    for p in sorted(glob.glob(os.path.join(DT, 'appdata', 'round_ch1_*.json'))):
        d = load(p)
        for it in d['jeongsi']['items']:
            out.add(norm(it['s']))
        for v in d.get('retakeC', []):
            for it in v['items']:
                out.add(norm(it['s']))
    for code, e in load(os.path.join(DT, 'appdata', 'forms_bank.json')).items():
        if code.startswith('CH1-'):
            for fm in e['forms']:
                out.add(norm(fm['s']))
    return out


def build():
    design = load(os.path.join(HERE, 'design.json'))
    cm = {c['c']: c for c in design['concepts']}
    written = {}
    for p in sorted(glob.glob(os.path.join(DT, 'tools', '_stage', 'ch1s', 'w_*.json'))):
        for k, v in load(p).items():
            if k in written:
                sys.exit('집필 결과에 %s 가 두 번 있다' % k)
            written[k] = v
    rounds = {}
    for r in range(1, 11):
        items = []
        for x in design['blueprint'][str(r)]:
            n = '%d-%02d' % (r, x['n'])
            if x['구획'] == '복습-재출제':
                src = rounds[x['from_round']][x['from_n'] - 1]
                it = dict(src)
            else:
                if n not in written:
                    sys.exit('집필 결과에 %s 가 없다' % n)
                it = dict(written[n])
                it['u'] = cm[x['c']]['u']
                it['mis'] = cm[x['c']]['m']
            it['n'] = n
            items.append({k: it[k] for k in KEYS})
        rounds[r] = items
    extra = sorted(set(written) - {'%d-%02d' % (r, x['n']) for r in range(1, 11)
                                   for x in design['blueprint'][str(r)] if x['구획'] != '복습-재출제'})
    if extra:
        sys.exit('설계표에 없는 칸을 썼다: %s' % extra[:10])
    for r, items in rounds.items():
        doc = {
            'course': 'ch1s', 'round': r,
            'title': '화학1 심화 누적 OX %d회' % r,
            'scoring': SCORING,
            'jeongsi': {'n': 60, 'items': items},
            'retakeC': [],
        }
        with open(round_path(r), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
            f.write('\n')
    print('회차 파일 10개를 썼다.')


def check():
    design = load(os.path.join(HERE, 'design.json'))
    cm = {c['c']: c for c in design['concepts']}
    errs = []
    old = ch1_corpus()
    rounds = {}
    for r in range(1, 11):
        p = round_path(r)
        if not os.path.exists(p):
            errs.append('%d회 파일 없음' % r)
            continue
        d = load(p)
        if (d.get('course'), d.get('round')) != ('ch1s', r):
            errs.append('%d회 course/round 머리' % r)
        if d.get('scoring') != SCORING:
            errs.append('%d회 채점 설정' % r)
        rounds[r] = d['jeongsi']['items']
        if d['jeongsi']['n'] != 60 or len(rounds[r]) != 60:
            errs.append('%d회 문항 수' % r)
    if errs:
        return errs
    seen = {}
    lv_all = collections.Counter()
    for r in range(1, 11):
        items = rounds[r]
        bp = design['blueprint'][str(r)]
        ox = collections.Counter(it['a'] for it in items)
        info = design['rounds'][r - 1]
        if (ox['O'], ox['X']) != (info['ox_target']['O'], info['ox_target']['X']):
            errs.append('%d회 O/X %s' % (r, dict(ox)))
        for it, x in zip(items, bp):
            tag = it['n']
            lv_all[it['lvl']] += 1
            if tuple(it) != KEYS:
                errs.append('%s 키 순서·구성' % tag)
            if tag != '%d-%02d' % (r, x['n']):
                errs.append('%s 번호' % tag)
            for k in ('c', 'lvl', 'a'):
                if it[k] != x[k]:
                    errs.append('%s %s=%s ≠ 설계 %s' % (tag, k, it[k], x[k]))
            c = cm.get(it['c'])
            if c and (it['u'], it['mis']) != (c['u'], c['m']):
                errs.append('%s u·mis 가 개념표와 다름' % tag)
            s, f, w = it['s'], it['f'], it['w']
            if '℃' in s + f + w:
                errs.append('%s ℃ 대신 °C' % tag)
            if it['a'] == 'O' and f != s:
                errs.append('%s O 인데 f≠s' % tag)
            if it['a'] == 'X' and norm(f) == norm(s):
                errs.append('%s X 인데 f==s' % tag)
            if not s.rstrip().endswith('다.') or not f.rstrip().endswith('다.'):
                errs.append('%s 문장이 「다.」로 끝나지 않음' % tag)
            if not w.strip():
                errs.append('%s 해설 없음' % tag)
            if x['구획'] == '복습-재출제':
                src = rounds[x['from_round']][x['from_n'] - 1]
                if any(it[k] != src[k] for k in ('u', 'mis', 'a', 's', 'f', 'w', 'lvl', 'c')):
                    errs.append('%s 재출제가 %s 원문과 다름' % (tag, src['n']))
                continue
            k = norm(s)
            if k in seen:
                errs.append('%s 문장이 %s 와 같음' % (tag, seen[k]))
            seen[k] = tag
            if k in old:
                errs.append('%s 기존 화학1 문장과 같음' % tag)
    return errs


if __name__ == '__main__':
    if '--write' in sys.argv:
        build()
    errs = check()
    for e in errs[:80]:
        print('✗', e)
    if errs:
        sys.exit('%d건 어긋남' % len(errs))
    print('화학1 심화 회차 파일 10개 OK')
