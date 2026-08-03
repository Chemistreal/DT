#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""종이에서 사라지는 자리를 찾아 되돌린다 — 흰 종이에 흰 글씨.

왜 필요한가
-----------
DT 는 처음부터 인쇄용으로 지어져 있다. `@page` 가 134장에 있고 OMR 은
아예 종이 말고는 쓸 데가 없다. 그런데 인쇄 규칙이 **배경까지 챙기지는
않았다.**

    .omrbanner{background:#9a7b27;color:#fff}   OMR 답안지 제목띠
    .omrhead  {background:#26262a;color:#fff}   OMR 표 머리
    .inst     {background:#26262a;color:#fff}   문제지 지시문
    .kind     {background:#26262a;color:#fff}   갈래 배지
    .secband  {background:…      ;color:#fff}   해설지 절 띠

브라우저는 인쇄할 때 **배경을 기본으로 안 찍는다.** 잉크를 아끼려고 그렇게
되어 있고, '배경 그래픽' 을 사람이 인쇄 설정에서 따로 켜야 나온다. 그러면
어두운 배경은 안 찍히고 그 위의 흰 글씨만 남는다 — 흰 종이에 흰 글씨다.

  · OMR 답안지 제목띠·표 머리가 안 보인다 — 46장
  · 문제지 지시문이 안 보인다 — 46장 ('다음 물음에 답하시오' 가 통째로)
  · 해설지 절 띠가 안 보인다 — 35장

화면으로 보면 멀쩡하다. 종이에서만 사라지니 아무도 몰랐다.

무엇을 넣나
-----------
화면에는 **아무 영향이 없다.** `@media print` 는 종이에서만 산다.

    @media print{
      .omrbanner,.omrhead,.inst,.inst .sec,.kind,.secband{
        background:#fff;color:#000;border:1px solid #000}
    }

배경 대신 테두리로 자리를 잡는다. 배경 그래픽을 켜고 인쇄해도 흰 띠에
검은 글씨로 나가니 잉크도 덜 먹는다.

⚠ `</style>` 바로 앞에 넣는다. 선택자 무게가 같아서 **뒤에 놓여야 이긴다.**

    실행:  python3 tools/print_ink.py            # 세기만
           python3 tools/print_ink.py --write    # 없는 곳에 넣는다
           python3 tools/print_ink.py --check    # 빠진 곳이 있으면 빨간불
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 종이가 본업인 갈래. 화면용 도구(admin·report 따위)는 여기 안 든다 —
# 거기 흰 글씨는 눌러서 켜지는 단추라 종이에 나갈 일이 없다.
PRINTABLE = ('omr_', 'munje_', 'haeseol_')

MARK = '인쇄 잉크'
STYLE_END = re.compile(r'</style>', re.I)

BLOCK = (
    "\n/* " + MARK + " — 배경이 안 찍혀도 읽히게. 화면은 하나도 안 바뀐다.\n"
    "   브라우저는 인쇄할 때 배경을 기본으로 안 찍는다. 어두운 배경 위의 흰\n"
    "   글씨는 그래서 흰 종이에 흰 글씨가 된다 — 지시문·제목띠가 사라졌다. */\n"
    "@media print{\n"
    "  .omrbanner,.omrhead,.inst,.inst .sec,.kind,.secband{\n"
    "    background:#fff;color:#000;border:1px solid #000}\n"
    "}\n"
)


def targets():
    for f in sorted(os.listdir(ROOT)):
        if f.endswith('.html') and f.startswith(PRINTABLE):
            yield os.path.join(ROOT, f)


def main():
    write = '--write' in sys.argv[1:]
    check = '--check' in sys.argv[1:]
    have = miss = done = 0
    names = []
    for p in targets():
        try:
            src = open(p, encoding='utf-8').read()
        except (OSError, UnicodeDecodeError):
            continue
        if MARK in src:
            have += 1
            continue
        m = None
        for m in STYLE_END.finditer(src):
            pass                     # 마지막 </style> 앞에 넣는다
        if m is None:
            miss += 1
            names.append(os.path.basename(p) + ' (style 없음)')
            continue
        miss += 1
        names.append(os.path.basename(p))
        if write:
            open(p, 'w', encoding='utf-8').write(
                src[:m.start()] + BLOCK + src[m.start():])
            done += 1

    if write:
        print(f'인쇄 잉크를 되돌렸다: {done}장 (이미 있던 것 {have}장)')
        return 0
    print(f'되돌림 있음 {have}장 · 없음 {miss}장')
    for n in names[:8]:
        print('   ' + n)
    if len(names) > 8:
        print(f'   … 외 {len(names)-8}장')
    if check and miss:
        print('\nFAIL 종이에서 사라지는 자리가 남아 있다 — '
              'python3 tools/print_ink.py --write')
        return 1
    if check:
        print('\nPASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
