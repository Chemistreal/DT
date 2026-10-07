#!/usr/bin/env python3
"""화학Ⅰ 심화 성적표가 읽는 회차 계획표(appdata/plan_ch1s.json)를 설계서에서 뽑는다.

왜 따로 뽑나
------------
성적표의 「다음 주 N회 예습」 · 단원 이름 · 회차 제목은 설계서(courses/ch1s/design.json)에
다 있다. 그런데 설계서는 211개 개념의 출처·문항 배치까지 담은 230KB 짜리라, 학부모가
문자로 받은 링크 하나 여는 데 그것을 통째로 받게 할 수는 없다. 성적표가 쓰는 칸만
작게 뽑아 둔다:

    rounds[N]   회차 제목 · 새로 나오는 단원(코드 + 이름) · 그 회차에 처음 나오는 개념 코드
    units[u]    단원 코드 → 단원 이름 («Ⅰ-1» → «화학식량»)
    concepts[c] 개념 이름 m · 단원 u · 처음 나오는 회차 r · 선수 개념 pre

설계서가 바뀌면 다시 뽑는다. --check 는 지금 파일이 설계서와 같은지 본다(CI).

    python3 tools/plan_ch1s.py            # 무엇이 다른지
    python3 tools/plan_ch1s.py --write    # 뽑아 쓴다
    python3 tools/plan_ch1s.py --check    # 다르면 빨간불
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'courses', 'ch1s', 'design.json')
OUT = os.path.join(ROOT, 'appdata', 'plan_ch1s.json')


def build():
    d = json.load(open(SRC, encoding='utf-8'))
    units = {}
    rounds = {}
    for r in d['rounds']:
        secs = []
        for s in r.get('new_sections') or []:
            code, _, name = s.partition(' ')
            units[code] = name.strip()
            secs.append(code)
        rounds[str(r['round'])] = {'title': r['title'], 'units': secs, 'new': []}
    concepts = {}
    for c in d['concepts']:
        concepts[c['c']] = {'m': c['m'], 'u': c['u'], 'r': c['first_round'], 'pre': list(c.get('pre') or [])}
        rk = str(c['first_round'])
        if rk in rounds:
            rounds[rk]['new'].append(c['c'])
    return {
        'note': 'tools/plan_ch1s.py 가 courses/ch1s/design.json 에서 뽑는다. 손으로 고치지 않는다.',
        'course': d['course'],
        'name': d.get('name', ''),
        'total': len(d['rounds']),
        'rounds': rounds,
        'units': units,
        'concepts': concepts,
    }


def dumps(p):
    j = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    out = ['{']
    keys = list(p)
    for ki, k in enumerate(keys):
        tail = ',' if ki < len(keys) - 1 else ''
        v = p[k]
        if isinstance(v, dict) and k in ('rounds', 'concepts'):
            out.append(' %s:{' % j(k))
            ks = list(v)
            out += [' %s:%s%s' % (j(x), j(v[x]), ',' if i < len(ks) - 1 else '') for i, x in enumerate(ks)]
            out.append(' }' + tail)
        else:
            out.append(' %s:%s%s' % (j(k), j(v), tail))
    out.append('}')
    return '\n'.join(out) + '\n'


def main():
    want = dumps(build())
    have = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
    if '--write' in sys.argv[1:]:
        if have != want:
            open(OUT, 'w', encoding='utf-8').write(want)
            print('appdata/plan_ch1s.json 을 새로 썼다')
        else:
            print('appdata/plan_ch1s.json 이 이미 설계서와 같다')
        return 0
    if have == want:
        print('PASS · appdata/plan_ch1s.json 이 설계서와 같다')
        return 0
    print('FAIL · appdata/plan_ch1s.json 이 설계서와 다르다 (python3 tools/plan_ch1s.py --write)')
    return 1 if '--check' in sys.argv[1:] else 0


if __name__ == '__main__':
    sys.exit(main())
