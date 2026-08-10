#!/usr/bin/env python3
"""저장소에 있는데 **아무 화면도 안 거는 자료**를 찾는다.

왜 이 자가 있나
---------------
`tools/page_doors.py` 는 **화면**에 문이 있는지 본다. 그 자를 만들고 나서
문 없는 화면 셋을 지웠다(#69). 그런데 같은 물음을 **자료**에는 아무도 안 던지고
있었다 — 저장소에 있는 PDF 를 어느 화면이 거는가.

2026-08-10 에 처음 재어 보니 이랬다.

    volumes/        4개  56MB   거는 곳 없음
    supplements/    2개  2.7MB  거는 곳 없음
    truthbooks/    36개  54MB   materials.json 이 36개 다 건다 ✓

`volumes/` 는 회차별 준비교재 합본 4권(각 100쪽), `supplements/` 는 화올 단독
참고서 2종이다. README.txt 에 **폴더 이름은** 적혀 있지만 파일을 거는 화면도,
`materials.json` 의 자리도 없다.

⚠ **지우지 않는다.** 두 가지 다 있을 수 있는 일이기 때문이다.

    ㄱ. 선생님이 주소를 직접 건네 쓰신다 — Pages 는 링크가 없어도 파일을 낸다
    ㄴ. 화면에 걸 자리를 만들다 말았다 — 그러면 학생은 그런 게 있는 줄 모른다

어느 쪽인지는 사람만 안다(`docs/선생님이-정할-칸.md`). 이 자는 **지금 상태를
박아 둔다** — 알고 있는 것 말고 문 없는 자료가 **새로 생기면** 빨간불이다.
59MB 는 배포 한도(1GB)의 6%다. 모르고 쌓이면 어느 날 문턱에서 급해진다.

    python3 tools/asset_doors.py           # 무엇이 걸리고 무엇이 안 걸리나
    python3 tools/asset_doors.py --check   # 알고 있는 것 말고 더 생기면 빨간불
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 자료가 사는 자리. 여기 없는 폴더는 안 본다(tests/·tools/·docs/ 는 자료가 아니다).
DIRS = ['volumes', 'truthbooks', 'supplements', 'versions']

# 이미 알고 있는 **문 없는 자료.** 여기 없는 것이 나오면 빨간불이다.
# 고쳐서 지운 것이 아니라 **선생님이 정할 때까지 세어 둔 값**이다(A7).
KNOWN = {
    'volumes/chem1_volume1_rounds1to9.pdf',
    'volumes/chem1_volume2_rounds10to18.pdf',
    'volumes/chem2_volume1_rounds1to9.pdf',
    'volumes/chem2_volume2_rounds10to18.pdf',
    'supplements/chem_hwaol_simhwa_prestudy.pdf',
    'supplements/chem_hwaol_truthlist.pdf',
}


def doors():
    """**사람이 그 파일에 닿을 수 있는 길**이 적힌 글만 읽는다.

    ⚠ **자를 두 번 좁혔다.**
      ㄱ. 처음에는 `tools/*.py` 도 읽었다. 그랬더니 **이 파일의 KNOWN 목록이
          제 자신을 문으로 세어서** "다 걸린다 ✓" 가 나왔다. 자가 저를 보고
          초록불을 준 것이다.
      ㄴ. `README.txt`·`docs/*.md`·`tests/*.js` 도 뺐다. 글에 이름이 적힌 것과
          화면에서 눌러서 가는 것은 다르다 — 검사가 파일 이름을 쓴다고 학생이
          그 파일에 닿지는 않는다.

    남긴 것은 둘뿐이다. 화면(`*.html`)과 화면이 읽는 명단(`materials.json` 같은
    뿌리의 `*.json`). 이 둘이 사람이 실제로 지나는 길이다.
    """
    text = []
    for pat in ('*.html', '*.json'):
        for p in glob.glob(os.path.join(ROOT, pat)):
            rel = os.path.relpath(p, ROOT)
            if rel.split('/')[0] in DIRS:
                continue
            try:
                text.append(open(p, encoding='utf-8', errors='ignore').read())
            except OSError:
                pass
    return '\n'.join(text)


def main():
    check = '--check' in sys.argv
    text = doors()

    rows, orphan = [], []
    for d in DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        files = sorted(f for f in os.listdir(base)
                       if os.path.isfile(os.path.join(base, f)))
        if not files:
            continue
        out = [f for f in files if f not in text]
        size = sum(os.path.getsize(os.path.join(base, f)) for f in files)
        rows.append((d, len(files), size, len(out)))
        orphan += [d + '/' + f for f in out]

    print('자료 폴더 %d곳' % len(rows))
    for d, n, size, out in rows:
        mark = '문 없는 것 %d개' % out if out else '다 걸린다 ✓'
        print('  %-14s %3d개 %7.1fMB  %s' % (d, n, size / 1048576.0, mark))

    new = sorted(set(orphan) - KNOWN)
    gone = sorted(KNOWN - set(orphan))

    if gone:
        print('\n알고 있던 것이 걸렸거나 없어졌다 — KNOWN 에서도 지운다:')
        for f in gone:
            print('  ' + f)

    if new:
        print('\n⚠ 알고 있는 것 말고 **아무 화면도 안 거는 자료**가 %d개 생겼다'
              % len(new))
        for f in new:
            print('  ' + f)
        print('\n걸 자리를 만들다 말았으면 걸고, 주소를 직접 건네 쓰시는 것이면')
        print('KNOWN 에 적어 둔다. 모르고 쌓이면 배포 한도에서 급해진다.')
        if check:
            print('\nFAIL')
            return 1
        return 0

    if orphan:
        print('\n문 없는 자료 %d개는 **알고 있는 것**이다(어떻게 할지는 A7).'
              % len(orphan))
    else:
        print('\n모든 자료를 어딘가에서 건다.')
    if check:
        print('PASS')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
