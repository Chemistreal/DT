#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""해설지 HTML 이 회차 JSON 과 같은 말을 하는지 잰다 — 다르면 f·w 를 JSON 대로 고친다.

왜 필요한가
-----------
학생이 손에 쥐는 해설지는 haeseol_<과목>_round<NN>.html(과 그것을 찍은 PDF)이고,
앱(exam · report · pdfgen)이 화면에 보여 주는 해설은 appdata/round_<과목>_<NN>.json
이다. 같은 문항을 두 곳에 적어 두면 한쪽만 고치는 날이 온다. 재어 보니
(2026-09-11) 35장 2,100문항 가운데 92문항의 해설(w)이 JSON 과 달랐다 — JSON 의
해설을 「아보가드로 법칙.」한 마디에서 문장으로 늘려 놓고 HTML 은 다시 만들지
않은 것이다. HTML 을 만든 도구는 저장소에 없다. 그래서 통째로 다시 만들지 않고,
어긋난 글자 마디만 제자리에서 바꾼다 — 그 밖의 바이트는 그대로다.

무엇을 비교하나
---------------
문항 번호로 짝을 짓고 넷을 본다.
  a  정답(O/X)          — 다르면 **절대 안 고친다.** 정답 키는 선생님 것이다.
                          빠른 정답표와 문항 칸의 정답이 서로 다른 것도 여기 센다.
  s  문장               — 다르면 그 문항은 **안 고치고 보고만** 한다. 문항 자체가
                          다른데 해설만 바꾸면 해설이 거짓이 된다.
  f  옳은 문장(X 문항)  — 고친다. 숙제 「옳은문장집」에 같은 글이 한 번 더 있어
                          거기도 같이 고친다(안 그러면 한 장 안에서 두 말을 한다).
  w  해설               — 고친다.

HTML 을 만든 도구는 글자를 조금 꾸며 넣었다(SN5→SN₅ · 10^-3→10<sup>-3</sup> ·
δ+→δ⁺). 그 꾸밈을 JSON 글자에 똑같이 입힌 뒤 비교한다 — 안 그러면 200문항 넘게
「다르다」고 나오고, 진짜 어긋난 것이 그 속에 묻힌다. 공백은 하나로 접고
엔티티는 푼다. 쓸 때도 같은 꾸밈을 입혀 쓴다.

검사 밖
-------
haeseol_ch2_round08~18.pdf 11장은 HTML 원본이 저장소에 없다(materials.json 도 pdf 만
건다). 이 검사는 HTML 만 재므로 그 11장은 JSON 과 달라도 여기서 걸리지 않는다 — PDF
글자를 뽑아 거칠게 재어 보니(pymupdf · 공백 빼고 부분 일치, 2026-09-11) JSON 문장(s)이
그대로 들어 있는 문항이 회차마다 60개 중 10~59개뿐이고, ch2_15 #34 에는 깨진 엔티티
「n&#x₂₇;M…」 가 그대로 찍혀 있다. JSON 에서 해설지를 만드는 생성기가 저장소에 들어오기
전에는 손으로 볼 수밖에 없다.

KNOWN_SWAP
----------
화학Ⅱ 1회 HTML 은 JSON 2회 문항을, 2회 HTML 은 JSON 1회 문항을 담고 있다.
어느 쪽이 실제 시행분인지는 파일이 말해 주지 않는다 — 선생님이 확인한 뒤
맞바꾼다. 그때까지 이 둘은 세기만 하고, 빨간불에도 --write 에도 넣지 않는다.

고친 뒤에는 학생이 받는 루트 PDF 를 tools/haeseol_pdf.js 로 다시 찍는다 — 안 찍으면
HTML 과 PDF 가 다른 말을 한다.

실행:  python3 tools/haeseol_sync.py            # 세기만
       python3 tools/haeseol_sync.py --check    # KNOWN_SWAP 밖에서 하나라도 어긋나면 빨간불
       python3 tools/haeseol_sync.py --write    # f·w 를 JSON 대로 고친다 (s·a 가 다른 문항은 보고만)
       python3 tools/haeseol_sync.py --verbose  # 어긋난 문항마다 두 글을 나란히 찍는다
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (과목, 회차). 「1·2회가 통째로 뒤바뀌어 있다 — 선생님이 실제 시행분을 확인한 뒤 맞바꾼다」
KNOWN_SWAP = {('ch2', 1), ('ch2', 2)}
SWAP_NOTE = ('화학Ⅱ 1·2회가 통째로 뒤바뀌어 있다(1회 HTML=JSON 2회 {a}/60 · 2회 HTML=JSON 1회 {b}/60) '
             '— 선생님이 실제 시행분을 확인한 뒤 맞바꾼다. 그때까지 세기만 하고 빨간불에 넣지 않는다.')

FILE = re.compile(r'^haeseol_([a-z0-9]+)_round(\d+)\.html$')

# 문항 한 줄. 표(table.h) 안에서 문항마다 이 모양으로 한 번씩 나온다.
#   <tr><td class="no">N</td><td class="an o|x">O|X</td><td class="bd">
#     <div class="stmt">문장</div>
#     [<div class="fix"><b>옳은 문장</b> · 옳은 문장</div>]   ← X 문항에만
#     <div class="why"><b>해설</b> · 해설</div></td></tr>
ROW = re.compile(
    r'<tr><td class="no">(\d+)</td>'
    r'<td class="an [ox]">([OX])</td>'
    r'<td class="bd"><div class="stmt">(.*?)</div>'
    r'(?:<div class="fix"><b>옳은 문장</b> · (.*?)</div>)?'
    r'<div class="why"><b>해설</b> · (.*?)</div></td></tr>', re.S)
# 맨 앞 빠른 정답표. <div class="kc o"><span class="n">N</span><span class="a">O</span></div>
KEY = re.compile(r'<div class="kc [ox]"><span class="n">(\d+)</span><span class="a">([OX])</span></div>')
# 숙제 「옳은문장집」. O 문항은 s, X 문항은 f 가 [교정] 표시와 함께 한 번 더 실린다.
SUKJE = '<div class="sukjepage">'


def li_re(n):
    return re.compile(r'(<li><span class="n">%d</span>)(.*?)((?:<span class="src">\[교정\]</span>)?</li>)'
                      % n, re.S)


SUB = str.maketrans('0123456789', '₀₁₂₃₄₅₆₇₈₉')


def _orbital(m):
    """1s2 → 1s<sup>2</sup> · sp3d2 → sp<sup>3</sup>d<sup>2</sup>"""
    t = m.group(1) + m.group(2) + '<sup>' + m.group(3) + '</sup>'
    if m.group(4):
        t += 'd<sup>' + m.group(5) + '</sup>'
    return t


def render(text):
    """JSON 글자에 HTML 을 만든 도구가 입힌 꾸밈을 똑같이 입힌다.
    35장 2,100문항으로 재어 이 셋이면 문장(s)이 남김없이 맞는다(2026-09-11).
    (lookbehind 는 안 쓴다 — 저장소 규칙.)

    그 위에 둘을 더 입힌다 — 둘 다 원래 생성기 출력에는 없던 글꼴이라 재어 본 것이 아니다.
      **x**  앱(index · report · chemistreal_app 의 md())은 굵게로 그리는데 해설지에는 그
             층이 없어 별표가 글자 그대로 찍혔다(ch1 15·16·17·18 · ch2 06, 2026-09-11).
             <b> 가 아니라 <strong> 인 까닭: 해설지 CSS 의 `td.bd .why b` 는 「해설」 표지의
             금색이라 <b> 로 두면 강조한 낱말까지 표지 색이 된다.
      1s2·sp3  「라틴 글자 뒤 숫자 → 아래첨자」 규칙이 전자 배치·혼성 오비탈에도 걸려
             1s₂·sp₃ 로 틀리게 적힌다. 껍질 숫자가 앞에 붙은 [1-7][spdf]N 과 spN(dN) 만
             먼저 위첨자로 돌린다. 지금 문항 목록에는 이런 글자가 없다(전수 확인)."""
    t = html.escape(text or '', quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)              # **용액** → 굵게
    t = re.sub(r'\^\(([^)]*)\)', r'<sup>\1</sup>', t)                  # e^(-Ea/RT)
    t = re.sub(r'\^([-+]?[0-9A-Za-zΔα-ω]+)', r'<sup>\1</sup>', t)       # 10^-3 · (RT)^Δn
    t = re.sub(r'(^|[^A-Za-z0-9])([1-7][spdf]|sp)([0-9]+)(?:(d)([0-9]+))?',   # 1s2 · sp3d2
               _orbital, t)
    t = re.sub(r'([A-Za-z])([0-9]+)',                                   # SN5 → SN₅
               lambda m: m.group(1) + m.group(2).translate(SUB), t)
    return t.replace('δ+', 'δ⁺').replace('δ-', 'δ⁻')


def norm(fragment):
    """비교용. 엔티티를 풀고 공백을 하나로 접는다."""
    return re.sub(r'\s+', ' ', html.unescape(fragment or '')).strip()


def same(html_fragment, json_text):
    return norm(html_fragment) == norm(render(json_text))


def load_items(course, rnd):
    p = os.path.join(ROOT, 'appdata', 'round_%s_%02d.json' % (course, rnd))
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as fh:
        d = json.load(fh)
    return ((d.get('jeongsi') or {}).get('items')) or []


def targets():
    for f in sorted(os.listdir(ROOT)):
        m = FILE.match(f)
        if m:
            yield f, m.group(1), int(m.group(2))


def compare(src, items):
    """한 장을 잰다. 돌려주는 것: 문항별 기록 목록.
    기록 = dict(n, a, ok_a, ok_s, ok_f, ok_w, row=match, key_a)"""
    key = {int(n): a for n, a in KEY.findall(src)}
    out = []
    for m in ROW.finditer(src):
        n = int(m.group(1))
        a, s, f, w = m.group(2), m.group(3), m.group(4), m.group(5)
        it = items[n - 1] if 0 < n <= len(items) else None
        rec = {'n': n, 'a': a, 'key_a': key.get(n), 'row': m, 'it': it,
               'ok_a': it is not None and a == it.get('a') and key.get(n) == a,
               'ok_s': it is not None and same(s, it.get('s')),
               # O 문항에는 fix 칸이 없다. X 인데 fix 칸이 없으면 어긋난 것으로 센다.
               'ok_f': it is not None and (a == 'O' or (f is not None and same(f, it.get('f')))),
               'ok_w': it is not None and same(w, it.get('w'))}
        out.append(rec)
    return out


def count(recs):
    c = {'s': 0, 'f': 0, 'w': 0, 'a': 0}
    for r in recs:
        for k in c:
            if not r['ok_' + k]:
                c[k] += 1
    return c


def fmt(c):
    return 's %d · f %d · w %d · 정답 %d' % (c['s'], c['f'], c['w'], c['a'])


def show(name, recs):
    """--verbose: 어긋난 문항마다 두 글을 나란히."""
    for r in recs:
        it = r['it']
        if it is None:
            print('   #%d  JSON 에 없는 문항' % r['n'])
            continue
        for k, label in (('a', '정답'), ('s', '문장'), ('f', '옳은 문장'), ('w', '해설')):
            if r['ok_' + k]:
                continue
            if k == 'a':
                print('   #%d 정답  HTML %s(빠른 정답표 %s) · JSON %s' % (r['n'], r['a'], r['key_a'], it.get('a')))
                continue
            g = {'s': 3, 'f': 4, 'w': 5}[k]
            print('   #%d %s' % (r['n'], label))
            print('      HTML: %s' % norm(r['row'].group(g)))
            print('      JSON: %s' % norm(render(it.get(k))))


def patch(src, recs):
    """f·w 를 JSON 대로 바꾼 새 글과, 고친 수·건너뛴 수를 돌려준다.
    s 나 정답이 다른 문항은 손대지 않는다. 그 밖의 바이트는 그대로다."""
    edits = []                      # (start, end, new)
    done = {'f': 0, 'w': 0}
    skipped = []                    # (n, 까닭)
    sk = src.find(SUKJE)
    for r in recs:
        it = r['it']
        if it is None or not r['ok_a']:
            skipped.append((r['n'], '정답이 다르다' if it else 'JSON 에 없다'))
            continue
        if not r['ok_s']:
            skipped.append((r['n'], '문장이 다르다'))
            continue
        m = r['row']
        if not r['ok_f']:
            if m.group(4) is None:      # X 인데 fix 칸 자체가 없다 — 판을 새로 짜야 하니 손 안 댄다
                skipped.append((r['n'], 'X 문항에 옳은 문장 칸이 없다'))
                continue
            new = render(it.get('f'))
            edits.append((m.start(4), m.end(4), new))
            # 숙제 옳은문장집의 같은 문항
            if sk >= 0:
                lm = li_re(r['n']).search(src, sk)
                if lm:
                    edits.append((lm.start(2), lm.end(2), new))
            done['f'] += 1
        if not r['ok_w']:
            edits.append((m.start(5), m.end(5), render(it.get('w'))))
            done['w'] += 1
    out = src
    for start, end, new in sorted(edits, reverse=True):
        out = out[:start] + new + out[end:]
    return out, done, skipped


def main():
    argv = sys.argv[1:]
    write = '--write' in argv
    check = '--check' in argv
    verbose = '--verbose' in argv

    pages = 0
    items_n = 0
    total = {'s': 0, 'f': 0, 'w': 0, 'a': 0}   # KNOWN_SWAP 밖
    red = 0
    swap_hits = {}
    fixed = {'f': 0, 'w': 0}
    fixed_pages = []
    skipped_all = []                            # (파일, 문항, 까닭)

    for name, course, rnd in targets():
        pages += 1
        with open(os.path.join(ROOT, name), encoding='utf-8') as fh:
            src = fh.read()
        items = load_items(course, rnd)
        in_swap = (course, rnd) in KNOWN_SWAP
        if items is None:
            print('%-26s JSON 이 없다' % name)
            if not in_swap:
                red += 1
            continue
        recs = compare(src, items)
        items_n += len(recs)
        c = count(recs)
        if len(recs) != len(items):
            print('%-26s 문항 수가 다르다 HTML %d · JSON %d' % (name, len(recs), len(items)))
            if not in_swap:
                red += 1
        if in_swap:
            # 뒤바뀐 짝과 맞춰 본 수를 적어 둔다(문장 s 기준).
            partner = [r for c, r in KNOWN_SWAP if c == course and r != rnd]
            other = (load_items(course, partner[0]) if partner else None) or []
            hit = sum(1 for r in recs if 0 < r['n'] <= len(other) and same(r['row'].group(3), other[r['n'] - 1].get('s')))
            swap_hits[rnd] = hit
            print('%-26s %s   (KNOWN_SWAP · 세기만)' % (name, fmt(c)))
            if verbose:
                show(name, recs)
            continue
        if any(c.values()):
            print('%-26s %s' % (name, fmt(c)))
            if verbose:
                show(name, recs)
        for k in total:
            total[k] += c[k]

        if write and (c['f'] or c['w']):
            new, done, skipped = patch(src, recs)
            for n, why in skipped:
                skipped_all.append((name, n, why))
            if new != src:
                with open(os.path.join(ROOT, name), 'w', encoding='utf-8') as fh:
                    fh.write(new)
                fixed['f'] += done['f']
                fixed['w'] += done['w']
                fixed_pages.append((name, done))
                # 쓴 뒤 다시 재어 남는 것만 빨간불에 센다.
                c2 = count(compare(new, items))
                print('%-26s 고침 f %d · w %d → 남음 %s' % ('', done['f'], done['w'], fmt(c2)))
        elif write:
            for r in recs:
                if not r['ok_a']:
                    skipped_all.append((name, r['n'], '정답이 다르다'))
                elif not r['ok_s']:
                    skipped_all.append((name, r['n'], '문장이 다르다'))

    if swap_hits:
        print('\nKNOWN_SWAP  ' + SWAP_NOTE.format(a=swap_hits.get(1, 0), b=swap_hits.get(2, 0)))

    if write:
        print('\n고쳤다: %d장 · 옳은 문장 %d · 해설 %d' % (len(fixed_pages), fixed['f'], fixed['w']))
        for name, n, why in skipped_all:
            print('   안 고침 %s #%d — %s' % (name, n, why))
        return 0

    print('\n해설지 %d장 %d문항 · KNOWN_SWAP %d장 밖에서 어긋남 %s'
          % (pages, items_n, len(swap_hits), fmt(total)))
    bad = sum(total.values()) + red
    if check and bad:
        print('\nFAIL 해설지 HTML 이 JSON 과 다른 말을 한다 — '
              'python3 tools/haeseol_sync.py --write (문장·정답이 다른 문항은 손으로, --verbose 로 본다)')
        return 1
    if check:
        print('\nPASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
