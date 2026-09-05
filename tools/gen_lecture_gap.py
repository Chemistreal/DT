#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""문제로는 나오는데 **가르치는 강의가 없는** 주제를 모은다.

왜 이것을 따로 내는가
---------------------
`tools/lec_link.py` 가 오개념 792종을 125강에 이었다. 718종은 이었고
74종은 못 이었는데, 그 74종은 «아무도 안 봤다» 가 아니다 — 하나하나
125강을 훑고 «이 주제를 가르치는 대목이 본문에 없다» 를 확인한 것이고,
까닭이 `concept-lecture-dt.json` 의 unmapped 에 적혀 있다.

그러면 그 74종은 **실패 목록이 아니라 커리큘럼 구멍 목록**이다.
학생이 여기서 틀리면 성적표는 「이 개념이 약하다」까지는 말하지만
**보낼 강의가 없다.** 약점을 고치라고 만든 물건이 고칠 길을 못 주는 자리다.

그래서 「못 이은 것」이 아니라 「문항 몇 개가 갈 곳이 없나」로 세어서 낸다.

    python3 tools/gen_lecture_gap.py            # 세기만
    python3 tools/gen_lecture_gap.py --write    # lecture-gap.html 을 쓴다
    python3 tools/gen_lecture_gap.py --check    # 화면이 자료와 맞는지
"""

from __future__ import annotations

import glob
import html
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'concept-lecture-dt.json')
OUT = os.path.join(ROOT, 'lecture-gap.html')


def esc(s):
    return html.escape(str(s), quote=True)


def collect():
    un = json.load(io.open(SRC, encoding='utf-8'))['unmapped']
    cnt = {}
    where = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'appdata', 'round_*.json'))):
        r = json.load(io.open(f, encoding='utf-8'))
        rid = '%s %s회' % (r.get('course', ''), r.get('round', ''))
        for it in (r.get('jeongsi') or {}).get('items') or []:
            m = it.get('mis')
            if not m:
                continue
            cnt[m] = cnt.get(m, 0) + 1
            where.setdefault(m, set()).add(rid)
    rows = [{'topic': k, 'n': cnt.get(k, 0), 'why': v,
             'rounds': sorted(where.get(k, []))}
            for k, v in un.items()]
    rows.sort(key=lambda r: (-r['n'], r['topic']))
    return rows


CSS = """
:root{--bg:#F7F6F2;--ink:#1f1d1a;--ink-2:#57534c;--muted:#767066;
      --navy:#1F4E5F;--rust:#B5563F;--line:#E4E0D6;--mono:ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font-family:-apple-system,"Noto Sans KR",sans-serif;line-height:1.65}
header{background:linear-gradient(180deg,#1F4E5F,#163844);color:#fff;
       padding:26px 16px;text-align:center}
header .logo{font-size:12px;letter-spacing:.2em;opacity:.82;font-weight:600}
header h1{margin:7px 0 4px;font-size:23px}
header .sub{font-size:12.5px;opacity:.88}
.wrap{max-width:940px;margin:0 auto;padding:16px}
.back{display:inline-block;margin:12px 0 2px;font-size:12.5px;color:var(--navy);
      text-decoration:none;border-bottom:1px dotted var(--rust)}
.lead{background:#fff;border:1px solid var(--line);border-left:3px solid var(--rust);
      border-radius:9px;padding:13px 16px;font-size:13px;color:var(--ink-2);margin:12px 0 16px}
.lead b{color:var(--ink)}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.sum .c{background:#fff;border:1px solid var(--line);border-radius:10px;
        padding:9px 14px;font-size:12.5px;color:var(--ink-2)}
.sum .c b{display:block;font-size:19px;color:var(--navy);
          font-family:var(--mono);line-height:1.3}
table{width:100%;border-collapse:collapse;background:#fff;
      border:1px solid var(--line);border-radius:10px;overflow:hidden}
th{background:#EFEDE6;font-size:11.5px;color:var(--muted);text-align:left;
   padding:8px 12px;font-weight:700;letter-spacing:.03em}
td{border-top:1px solid #F0EDE4;padding:10px 12px;font-size:12.5px;
   color:var(--ink-2);vertical-align:top}
td.n{font-family:var(--mono);text-align:right;width:58px;color:var(--rust);
     font-weight:700;font-variant-numeric:tabular-nums}
td.t{width:190px;color:var(--ink);font-weight:700}
td.r{width:150px;font-size:11.5px;color:var(--muted)}
.scroll{overflow-x:auto}
footer{max-width:940px;margin:0 auto;padding:10px 16px 34px;
       font-size:11.5px;color:var(--muted)}
@media(max-width:700px){td.t{width:auto}td.r{display:none}}
"""


def build(rows):
    tot = sum(r['n'] for r in rows)
    hit = [r for r in rows if r['n']]
    p = ['<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1, '
         'maximum-scale=5">',
         '<meta name="robots" content="noindex,nofollow">',
         '<title>강의가 없는 주제 · 다원 화학</title>',
         '<style>%s</style></head><body>' % CSS,
         '<header><div class="logo">DAWON</div><h1>강의가 없는 주제</h1>'
         '<div class="sub">문제로는 나오는데, 보낼 강의가 125강에 없는 것</div>'
         '</header>',
         '<div class="wrap">',
         '<a class="back" href="index.html">← 처음으로</a>']

    p.append('<div class="sum">')
    p.append('<div class="c">주제<b>%d개</b></div>' % len(rows))
    p.append('<div class="c">걸린 문항<b>%d개</b></div>' % tot)
    if hit:
        p.append('<div class="c">가장 큰 구멍<b>%s</b>%d문항</div>'
                 % (esc(hit[0]['topic']), hit[0]['n']))
    p.append('</div>')

    p.append('<div class="lead">'
             '<b>이건 「못 이었다」가 아니라 「가르치는 데가 없다」다.</b> '
             '주제마다 125강 본문을 실제로 훑고 확인한 것이고, 아래 「까닭」이 '
             '무엇을 찾아봤는지 적고 있다.<br><br>'
             '학생이 여기서 틀리면 성적표는 <b>「이 개념이 약하다」까지는 말하지만 '
             '보낼 강의가 없다.</b> 약점을 고치라고 만든 물건이 고칠 길을 못 주는 '
             '자리라, 강의를 새로 만들 곳을 고르실 때 <b>문항 수가 많은 위쪽부터</b> '
             '보시면 된다.</div>')

    p.append('<div class="scroll"><table>')
    p.append('<tr><th>문항</th><th>주제</th><th>나오는 회차</th>'
             '<th>왜 이을 강의가 없나</th></tr>')
    for r in rows:
        p.append('<tr><td class="n">%s</td><td class="t">%s</td>'
                 '<td class="r">%s</td><td>%s</td></tr>'
                 % (r['n'] or '·', esc(r['topic']),
                    esc(', '.join(r['rounds'])) or '·', esc(r['why'])))
    p.append('</table></div></div>')
    p.append('<footer>이 화면은 <code>tools/gen_lecture_gap.py</code> 가 '
             '<code>concept-lecture-dt.json</code> 의 unmapped 와 '
             '<code>appdata/round_*.json</code> 에서 만든다. 손으로 고치지 마라.'
             '</footer></body></html>')
    return '\n'.join(p) + '\n'


def main():
    check = '--check' in sys.argv
    write = '--write' in sys.argv
    rows = collect()
    tot = sum(r['n'] for r in rows)
    print('강의가 없는 주제 %d개 · 걸린 문항 %d개' % (len(rows), tot))
    for r in rows[:12]:
        print('  %4s  %s' % (r['n'] or '·', r['topic']))

    want = build(rows)
    have = io.open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else None
    if write:
        io.open(OUT, 'w', encoding='utf-8').write(want)
        print('\n%s 에 적었다 (%.1fKB)'
              % (os.path.basename(OUT), len(want.encode('utf-8')) / 1024))
        return 0
    if have is None:
        print('\nlecture-gap.html 이 없다 — --write 로 만든다.')
        return 1 if check else 0
    if have != want:
        print('\nFAIL lecture-gap.html 이 자료와 어긋난다 — --write 로 다시 만든다.')
        return 1 if check else 0
    print('\nPASS 화면이 자료와 맞는다.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
