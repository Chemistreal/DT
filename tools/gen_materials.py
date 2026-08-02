#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""회차별 자료 목록(materials.json)을 파일 이름에서 만든다.

왜 파일이 따로 필요한가
-----------------------
자료는 이 저장소에 파일로만 있다. 통합 셸(exam/hub.html)은 다른 저장소에 있고,
브라우저는 남의 폴더 목록을 읽을 수 없다. 셸이 "화학Ⅱ 12회 해설이 있나"를
물으려면 **목록이 파일로 있어야 한다.**

셸이 회차 번호를 보고 주소를 지어내게 하면 안 된다. 실제로 화학Ⅱ 는
문제·OMR 은 18회까지 있는데 **해설 HTML 은 7회까지밖에 없다**(8~18회는 PDF 뿐).
지어낸 주소는 404 로 끝나고, 선생님은 눌러 보고 나서야 안다.

손으로 적으면 회차가 늘 때마다 어긋난다. 그래서 파일 이름에서 만든다.

    실행:  python3 tools/gen_materials.py           # 다시 만든다
           python3 tools/gen_materials.py --check   # 어긋나면 빨간불
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'materials.json')

# 셸이 보여 줄 이름. 키는 앱스크립트·DT 가 쓰는 과목 코드 그대로다.
COURSES = [
    ('ch1', '화학Ⅰ'),
    ('ch2', '화학Ⅱ'),
    ('gc',  '일반화학'),
]
# 자료 갈래. (키, 보여 줄 이름, 파일 앞머리)
KINDS = [
    ('munje',   '문제지', 'munje'),
    ('haeseol', '해설',   'haeseol'),
    ('omr',     'OMR',    'omr'),
]
# 회차에 딸리지 않는 자료. 있는 것만 싣는다.
EXTRA = [
    ('pdfs.html',        'PDF 모음'),
    ('letters.html',     '안내문'),
    ('concept_map.html', '개념 지도'),
    ('challenge.html',   '챌린지'),
    ('OMR_answer_keys.html', 'OMR 정답표'),
]
# 회차별 오답노트(진실책). 파일 이름 규칙이 달라 따로 본다.
TRUTH_DIR = 'truthbooks'
TRUTH_COURSE = {'ch1': 'chem1', 'ch2': 'chem2', 'gc': None}


def have(rel):
    """저장소에 실제로 있는 파일만 싣는다(없는 주소를 싣지 않는다)."""
    return rel if os.path.exists(os.path.join(ROOT, rel)) else None


def build():
    courses = []
    for ckey, cname in COURSES:
        rounds = {}
        for kkey, _kname, pfx in KINDS:
            pat = re.compile(r'^%s_%s_round(\d+)\.(html|pdf)$' % (re.escape(pfx), re.escape(ckey)))
            for fn in os.listdir(ROOT):
                m = pat.match(fn)
                if not m:
                    continue
                r = int(m.group(1))
                rounds.setdefault(r, {})
                rounds[r].setdefault(kkey, {})[m.group(2)] = fn
        # 오답노트
        tc = TRUTH_COURSE.get(ckey)
        if tc and os.path.isdir(os.path.join(ROOT, TRUTH_DIR)):
            pat = re.compile(r'^%s_round(\d+)_truthbook_bw\.pdf$' % re.escape(tc))
            for fn in os.listdir(os.path.join(ROOT, TRUTH_DIR)):
                m = pat.match(fn)
                if not m:
                    continue
                r = int(m.group(1))
                rounds.setdefault(r, {})
                rounds[r]['truthbook'] = {'pdf': TRUTH_DIR + '/' + fn}
        out = []
        for r in sorted(rounds):
            out.append({'round': r, 'files': rounds[r]})
        courses.append({'key': ckey, 'name': cname, 'rounds': out})

    extra = []
    for rel, name in EXTRA:
        if have(rel):
            extra.append({'path': rel, 'name': name})

    return {
        'note': '파일 이름에서 만든다. 손으로 고치지 말 것 — tools/gen_materials.py',
        'kinds': [{'key': k, 'name': n} for k, n, _ in KINDS] +
                 [{'key': 'truthbook', 'name': '오답노트'}],
        'courses': courses,
        'extra': extra,
    }


def main():
    data = build()
    text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
    if '--check' in sys.argv:
        old = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if old != text:
            print('materials.json 이 파일 목록과 어긋납니다. '
                  'python3 tools/gen_materials.py 를 돌리고 커밋하세요.')
            sys.exit(1)
        n = sum(len(c['rounds']) for c in data['courses'])
        print('자료 목록 일치 · 과목 %d · 회차 %d' % (len(data['courses']), n))
        return
    open(OUT, 'w', encoding='utf-8').write(text)
    for c in data['courses']:
        miss = [str(r['round']) for r in c['rounds'] if 'haeseol' not in r['files']]
        print('%s · %d회%s' % (c['name'], len(c['rounds']),
                               (' · 해설 없는 회차 ' + ','.join(miss)) if miss else ''))


if __name__ == '__main__':
    main()
