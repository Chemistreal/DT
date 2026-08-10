#!/usr/bin/env python3
"""**문이 없는 화면**을 찾는다 — 아무 데서도 이름이 불리지 않는 장.

이 저장소의 화면은 두 갈래로 열린다.

    자료 화면 132장   `materials.json` 에 실려 통합 셸이 목록으로 펼친다
    앱 화면    13장   `index.html` 이 걸거나, 다른 화면이 걸거나, 앱스크립트가 건다

둘 다 아닌 장은 **주소를 아는 사람만 열 수 있다.** 파일은 남아 있고 검사도
지나가니 아무도 모른다. 2026-08-10 에 처음 세어 보니 여섯 장이 그랬다.

    diagnosis_app.html   1,098KB      admin_console.html   1,082KB
    parent_report.html   1,090KB      OX_grader.html · OX_grader_prescription.html
                                      dualcoding_8types.html

앞의 셋은 **선생님이 지우기로 정했고**(2026-08-10) 지웠다. 뒤의 셋은 살리기로
하고 `index.html` 에 문을 냈다. 다시 이런 장이 생기면 여기서 걸린다.

⚠ 이 자는 **지우라고 하지 않는다.** 문이 없다는 것만 말한다. 살릴지 버릴지는
  사람이 정한다 — 크기가 1MB 인 화면을 기계가 지우게 두면 안 된다.

    python3 tools/page_doors.py           # 화면마다 문이 어디 있나
    python3 tools/page_doors.py --check   # 문 없는 장이 있으면 빨간불
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 문이 없어도 되는 장과 그 까닭. 비워 두면 이 자는 아무것도 못 막는다.
NO_DOOR_OK = {
    'index.html': '이 장이 곧 문이다 — GitHub Pages 가 여기로 연다',
    'home.html': '통합 셸이 주소를 지어 부른다(exam/hub.html)',
}


def mentions():
    """파일마다 그 안에서 불리는 화면 이름. **한 번만 읽는다.**

    [한 번 느렸던 곳] 처음에는 화면마다 저장소를 통째로 다시 읽었다(자기
    자신을 빼고 세려고). 화면이 258장인 저장소에서 258 × 260 번 파일을 읽어
    2분이 넘게 걸렸고, 검사가 느리면 사람이 안 돌린다. 한 번 읽어 두고
    '나 말고 누가 부르나' 는 그 표에서 뺀다."""
    out = {}
    pats = (os.path.join(ROOT, '*.html'), os.path.join(ROOT, '*.gs'),
            os.path.join(ROOT, '*.json'), os.path.join(ROOT, '*.md'))
    for pat in pats:
        for p in glob.glob(pat):
            s = open(p, encoding='utf-8', errors='ignore').read()
            out[os.path.basename(p)] = set(re.findall(r'[A-Za-z0-9_가-힣-]+\.html', s))
    return out


def callers(seen):
    """화면 이름 → 그 이름을 부르는 파일들(자기 자신은 뺀다)."""
    who = {}
    for src, names in seen.items():
        for n in names:
            if n != src:
                who.setdefault(n, set()).add(src)
    return who


def doors():
    """(화면, 문이 있나, 어디에 있나)."""
    pages = sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, '*.html')))
    mat = os.path.join(ROOT, 'materials.json')
    listed = set()
    if os.path.exists(mat):
        listed = set(re.findall(r'[A-Za-z0-9_가-힣-]+\.html',
                                open(mat, encoding='utf-8').read()))
    who = callers(mentions())
    out = []
    for n in pages:
        if n in listed:
            out.append((n, True, '자료 목록'))
        elif n in NO_DOOR_OK:
            out.append((n, True, '적어 둠 · ' + NO_DOOR_OK[n]))
        elif who.get(n):
            out.append((n, True, '다른 화면이 건다'))
        else:
            out.append((n, False, ''))
    return out


def main():
    check = '--check' in sys.argv
    rows = doors()
    bad = [n for n, ok, _ in rows if not ok]
    kinds = {}
    for n, ok, why in rows:
        kinds[why if ok else '문이 없다'] = kinds.get(why if ok else '문이 없다', 0) + 1
    for k, v in sorted(kinds.items(), key=lambda x: -x[1]):
        print('  %-40s %3d장' % (k, v))
    print('\n화면 %d장 · 문이 없는 장 %d장' % (len(rows), len(bad)))

    if bad:
        print('\n주소를 아는 사람만 열 수 있는 장:')
        for n in bad:
            kb = os.path.getsize(os.path.join(ROOT, n)) / 1024
            print('  %-34s %6.0fKB' % (n, kb))
        print('\n살릴 것이면 어디선가 걸고, 버릴 것이면 지운다. 문이 없어도 되는')
        print('장이면 tools/page_doors.py 의 NO_DOOR_OK 에 **까닭과 함께** 적는다.')
        return 1 if check else 0

    print('모든 화면에 문이 있다.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
