#!/usr/bin/env python3
"""성적표가 **아이를 어디에 세우는 말**을 할 때, 다음 걸음을 같이 말하는지 본다.

왜 이 자가 있나
---------------
석차 문구는 다섯 칸으로 갈린다(최상위·상위·평균 이상·가운데 아래·아래쪽).
아래 두 칸에는 "여기서부터 채워 갑니다 · 강의록과 재시가 최종을 끌어올립니다"
가 붙어 있었는데, **위 세 칸은 비교로 시작해 비교로 끝났다.**

    최상위권입니다. 반에서 상위 약 3%에 듭니다. 반 평균보다 12점 높습니다.

이 함수를 고친 까닭이 원래 "좋은 소식만 보여 주면 보여 준 것도 못 믿게 된다"
였다. 그 거울상이 남아 있던 셈이다 — 위쪽 아이에게도 다음 한 걸음은 있다.

무엇을 재고 무엇을 안 재나
--------------------------
⚠ 문장의 **말맛**은 안 잰다. 손실로 말했나 이득으로 말했나를 낱말로 재 봤더니
  부정문에서 그대로 뒤집혔다 — "지나간 회차에 빚이 **없다**" 를 손실 문장으로
  셌다. 낱말로는 못 잰다. 못 재는 것은 못 잰다고 적는다.

  여기서 재는 것은 **구조** 하나다: 어느 칸이든 위치를 말했으면 그 문장 안에
  **다음에 무엇을 하면 되는지**가 같이 있는가. 이건 사람 판단이 필요 없다.

    python3 tools/report_msg.py           # 칸마다 어떤 말을 하나
    python3 tools/report_msg.py --check   # 다음 걸음이 없는 칸이 있으면 빨간불
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'report.html')

# 다음 걸음을 말하는 표현.
# ⚠ 처음엔 어미까지 통째로 적었다가('잡으면'·'올려') **멀쩡하게 고친 문장을
#   못 알아봤다** — "…하나를 잡고 재시를 보면 점수가 올라갑니다" 를 걸었다.
#   어미가 아니라 **하는 일의 뿌리**를 본다.
STEP = re.compile(r'잡|끝내|설명|해 보|보세요|권합니다|채워|올라|줄어|'
                  r'정확도|하면 됩니다|다음 단계|넘습니다')


def bands():
    """rankMsg 안의 칸마다 (조건, 문구)."""
    s = open(PAGE, encoding='utf-8').read()
    m = re.search(r'function rankMsg\(rk\)\{([\s\S]*?)\n\}', s)
    if not m:
        return []
    body = m.group(1)
    out = []
    for cond, text in re.findall(r"if\((rk\.per100<=\d+)\)\s*return\s*([\s\S]*?);\n", body):
        out.append((cond, re.sub(r"'\s*\+\s*[\w.]+\s*\+\s*'", '…', text)))
    tail = re.search(r"\n\s*return\s*([\s\S]*?);\s*\}?\s*$", body)
    if tail:
        out.append(('그 밖(아래쪽)', re.sub(r"'\s*\+\s*[\w.]+\s*\+\s*'", '…', tail.group(1))))
    return out


def main():
    check = '--check' in sys.argv
    rows = bands()
    print('석차 문구 %d칸\n' % len(rows))
    bad = []
    for cond, text in rows:
        plain = re.sub(r"['\"+]|\s+", ' ', text).strip()
        ok = bool(STEP.search(plain))
        print('  %-16s %s' % (cond, '다음 걸음 있음' if ok else '⚠ 위치만 말하고 끝난다'))
        print('      %s' % plain[:130])
        if not ok:
            bad.append(cond)
    if bad:
        print('\n다음 걸음이 없는 칸 %d개: %s' % (len(bad), ', '.join(bad)))
    else:
        print('\n다섯 칸 모두 위치와 다음 걸음을 같이 말한다.')
    if check:
        print('\n' + ('FAIL' if bad else 'PASS'))
        return 1 if bad else 0
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
