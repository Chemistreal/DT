#!/usr/bin/env python3
"""이 브라우저에 **무엇을 남기는지** 적어 두고, 늘어나면 한 번 묻게 한다.

왜 이 자가 있나
---------------
통합 셸(exam/hub.html)에는 저장 자리를 다섯 칸으로 적어 두고 그 목록을
검사가 지킨다. 새 칸이 생기면 빨간불이 켜지고, 사람이 **"이건 앱 자료가
아니라 이 브라우저의 취향인가"** 를 한 번 묻게 된다. 실제로 그 물음 덕에
넛지 기록에서 학생 이름을 빼고 해시만 남기기로 정했다.

이 저장소에는 그 목록이 없었다. 지금 재어 보니 일곱 칸이고, 일곱 다
**지워도 남의 기록이 안 깨지는 것들**이다. 그 사실을 적어 둔다 — 적어 두지
않으면 여섯 달 뒤에 여덟 번째 칸이 조용히 생긴다.

    dt_admtok        선생님 로그인 표. 지우면 다시 로그인하면 된다
    dt_admgate       관리 화면 첫 문고리. 위와 같다
    dt_stucode       학생이 마지막에 넣은 코드. 다시 치면 된다
    dt_hw_round      숙제 채점판에서 보던 회차. 화면의 기억일 뿐이다
    dt_absov         미응시 표시를 손으로 덮어 둔 것. **선생님 판단이 담긴다**
    dt_pending_hide_v1  할 일 목록에서 접어 둔 줄. 취향이다
    chemistreal_session_v1  마지막에 보던 학생·회차. 취향이다
    chemistreal_grader_v1 · chemistreal_itemstats_v1  채점판 작업 중 상태

⚠ 성적·명단 같은 **남의 기록은 시트에 있고 여기 안 남는다.** 그 성질이
  이 앱이 "브라우저를 비워도 아무것도 안 잃는" 까닭이다. 그것만은 지킨다.

    python3 tools/store_ledger.py           # 지금 쓰는 칸
    python3 tools/store_ledger.py --check   # 적어 둔 것 말고 새 칸이 생기면 빨간불
"""
import collections
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 적어 둔 칸. **늘어날 수는 있지만 늘 때마다 여기를 고치게 한다.**
KNOWN = {
    # ⚠ 이 칸은 **읽고 지우기만 하고 아무도 안 쓴다.** 전체 공개 모드로
    #   바꾸면서 넣는 자리가 없어졌는데 읽는 자리(admTok)와 지우는 자리
    #   (admReset)는 다섯 화면에 그대로 남았다. 옛 브라우저에 값이 남아
    #   있을 수 있으니 **지우는 코드는 그대로 둔다** — 읽어서 창구에
    #   보내는 것도 지금은 무해하다(창구가 공개 모드다).
    'dt_admtok': '옛 관리자 토큰 · 이제 넣는 자리가 없다(읽고 지우기만)',
    'dt_admgate': '관리 화면 첫 문고리',
    'dt_stucode': '학생이 마지막에 넣은 코드',
    'dt_hw_round': '숙제 채점판에서 보던 회차',
    'dt_absov': '미응시 표시를 손으로 덮은 것 · ⚠ 선생님 판단이 담긴다',
    'dt_pending_hide_v1': '할 일 목록에서 접어 둔 줄',
    'chemistreal_session_v1': '마지막에 보던 학생·회차',
    'chemistreal_grader_v1': '채점판 작업 중 상태',
    'chemistreal_itemstats_v1': '문항 통계 작업 중 상태',
}

# 여기 있으면 안 되는 것 — 남의 기록. 시트에 있어야 한다.
FORBIDDEN = re.compile(r'roster|명단|score|성적|answers?_|응답', re.I)

SET = re.compile(r'localStorage\.setItem\(\s*([A-Za-z_$][\w$]*|[\'"][^\'"]+[\'"])')
CONST = re.compile(r'\b(?:const|var|let)\s+(\w+)\s*=\s*([\'"][^\'"]+[\'"])')


def keys():
    """화면마다 쓰는 저장 칸. 변수로 쓴 것은 그 파일 안에서 값을 찾아 푼다."""
    got = collections.defaultdict(set)
    for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        s = open(p, encoding='utf-8', errors='ignore').read()
        names = {k: v.strip('\'"') for k, v in CONST.findall(s)}
        for raw in SET.findall(s):
            if raw[0] in '\'"':
                got[raw.strip('\'"')].add(os.path.basename(p))
            elif raw in names:
                got[names[raw]].add(os.path.basename(p))
            else:
                # 래퍼를 거치는 것 — 부르는 자리에서 이름을 찾는다
                for call in re.findall(r'\w+\.(?:set|get|del)\(\s*(\w+)\s*[,)]', s):
                    if call in names:
                        got[names[call]].add(os.path.basename(p))
    return got


def main():
    check = '--check' in sys.argv
    got = keys()
    print('이 브라우저에 남기는 칸 %d개\n' % len(got))
    for k in sorted(got):
        mark = '  ' if k in KNOWN else '⚠ '
        print('%s%-26s %-34s %s' % (mark, k, KNOWN.get(k, '**적어 두지 않은 칸**'),
                                    ' '.join(sorted(got[k]))[:40]))
    fresh = sorted(k for k in got if k not in KNOWN)
    gone = sorted(k for k in KNOWN if k not in got)
    bad = sorted(k for k in got if FORBIDDEN.search(k))

    if fresh:
        print('\n적어 두지 않은 칸 %d개' % len(fresh))
        print('  늘어나는 것 자체는 괜찮다. 다만 **여기에 한 줄 적고** 지나가라 —')
        print('  "이건 앱 자료가 아니라 이 브라우저의 취향인가" 를 한 번 묻는 것이 이 자의 일이다.')
    if gone:
        print('\n적어 뒀는데 이제 안 쓰는 칸 %d개: %s' % (len(gone), ' '.join(gone)))
        print('  지워도 되지만, 옛 브라우저에 남아 있을 수 있으니 지우는 코드가 있는지 보고 빼라.')
    if bad:
        print('\n⚠ 남의 기록으로 보이는 이름 %d개: %s' % (len(bad), ' '.join(bad)))
        print('  성적·명단은 시트에 있어야 한다. 브라우저를 비워도 아무것도 안 잃는 성질을 지킨다.')

    if check:
        # 없어진 칸은 빨간불이 아니다(줄이는 것은 좋은 일이다).
        print('\n' + ('FAIL' if (fresh or bad) else 'PASS'))
        return 1 if (fresh or bad) else 0
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
