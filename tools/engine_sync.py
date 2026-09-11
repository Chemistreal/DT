#!/usr/bin/env python3
"""성적표(report.html) 안에 박힌 엔진 사본과 chemengine.js 를 **함수 단위로** 맞대 본다.

왜 이 자가 있나
---------------
report.html 은 chemengine.js 를 <script src> 로 부르지 않고 **베껴 넣어** 둔다(한 파일로
열리는 성적표). 그래서 chemengine.js 를 고치면 사본은 그대로다. 2026-09-11 에 재어 보니
사본은 옛 판이었고, 결과가 달라지는 차이가 오개념 대표 이름 표(misCanon) 말고도 있었다:

    cumulative.finalScore / finalAttempt
      chemengine.js · apps-script.gs   통과한 시도(있으면) 아니면 마지막 시도   (repr)
      report.html 사본                 마지막 시도                             (last)

어느 쪽이 맞는지는 선생님이 정할 일이라(재시로 통과한 뒤 또 본 행이 있으면 점수가
달라진다) 사본을 통째로 합치는 일은 그 뒤로 미뤘다. 그 사이에 **오개념 대표 이름 표
(MIS_CANON · misCanon)만** 사본에 먼저 들였다 — 성적표의 이름 맞대기(misKeyIn)가 그것을
쓴다. 표는 chemengine.js 에서만 고치고, 사본은 이 자로 맞춘다.

무엇을 재나
-----------
  · 두 파일의 IIFE 안 최상위 함수·상수를 이름으로 짝지어 같은지 본다(주석·공백은 무시).
  · --check 는 **대표 이름 표 두 줄(MIS_CANON · misCanon)** 이 글자까지 같은지와, 사본의
    api 가 그 둘을 내보내는지만 빨간불에 넣는다. 나머지 차이는 **세어서 보여 주기만** 한다 —
    통째로 합치는 날까지는 다른 것이 정상이다.

    python3 tools/engine_sync.py            # 함수 단위 차이 목록
    python3 tools/engine_sync.py --check    # 대표 이름 표가 갈렸으면 빨간불 (CI용)
    python3 tools/engine_sync.py --write    # chemengine.js 의 표를 사본에 베껴 넣는다
"""
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, 'chemengine.js')
REPORT = os.path.join(ROOT, 'report.html')

HEAD = 'Chemistreal 채점·진단·재시 로직 엔진'
TAIL = "})(typeof window !== 'undefined' ? window : this);"

# 사본에 반드시 같아야 하는 것 — 오개념 대표 이름 표.
CANON_LINE = re.compile(r'^  var MIS_CANON = \{.*\};$', re.M)
CANON_FN = re.compile(r'^  function misCanon\(m\) \{\n(?:.*\n)*?  \}$', re.M)


def read(p):
    return open(p, encoding='utf-8').read()


def engine_block(src, where):
    """IIFE 본문(첫 `(function (root) {` 부터 TAIL 앞까지)."""
    a = src.find(HEAD)
    if a < 0:
        raise SystemExit(where + ': 엔진 머리글을 못 찾았다')
    a = src.find('(function (root) {', a)
    b = src.find(TAIL, a)
    if a < 0 or b < 0:
        raise SystemExit(where + ': IIFE 경계를 못 찾았다')
    return src[a:b]


def members(block):
    """최상위(들여쓰기 0~2칸) `function NAME(` · `var NAME =` 를 이름 → 본문으로.
    괄호 짝을 세어 끝을 찾는다. 따옴표·주석 안은 안 센다. 정규식 리터럴은 안 다루지만
    이 두 파일의 최상위 선언에는 괄호를 품은 정규식이 없다(어긋나면 이름 목록이
    깨져서 바로 보인다)."""
    out = {}
    order = []
    # chemengine.js 의 normSchool 은 들여쓰기 없이 서 있다 — 0~2칸을 다 받는다.
    pat = re.compile(r'^ {0,2}(?:function (\w+)\s*\(|var (\w+)\s*=)', re.M)
    for m in pat.finditer(block):
        name = m.group(1) or m.group(2)
        is_fn = bool(m.group(1))
        i = m.start()
        j = _scan_end(block, i, is_fn)
        out[name] = block[i:j]
        order.append(name)
    return out, order


def _scan_end(s, i, is_fn):
    depth = 0
    n = len(s)
    q = None            # 열린 따옴표
    k = i
    while k < n:
        c = s[k]
        if q:
            if c == '\\':
                k += 2
                continue
            if c == q:
                q = None
            k += 1
            continue
        if c in ('"', "'", '`'):
            q = c
        elif s.startswith('//', k):
            k = s.find('\n', k)
            if k < 0:
                return n
            continue
        elif s.startswith('/*', k):
            k = s.find('*/', k) + 2
            continue
        elif c in '{[(':
            depth += 1
        elif c in '}])':
            depth -= 1
            if is_fn and depth == 0 and c == '}':
                return k + 1
        elif c == ';' and depth == 0 and not is_fn:
            return k + 1
        k += 1
    return n


def normalize(code):
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.S)
    code = re.sub(r'//[^\n]*', '', code)
    return re.sub(r'\s+', ' ', code).strip()


def compare():
    eng = engine_block(read(ENGINE), 'chemengine.js')
    rep = engine_block(read(REPORT), 'report.html')
    E, eo = members(eng)
    R, ro = members(rep)
    only_e = [n for n in eo if n not in R]
    only_r = [n for n in ro if n not in E]
    same, diff = [], []
    for n in eo:
        if n in R:
            (same if normalize(E[n]) == normalize(R[n]) else diff).append(n)
    return {'E': E, 'R': R, 'only_e': only_e, 'only_r': only_r, 'same': same, 'diff': diff}


def canon_parts(src, where):
    a = CANON_LINE.search(src)
    b = CANON_FN.search(src)
    if not a or not b:
        return None, None
    return a.group(0), b.group(0)


def check_canon(verbose=True):
    """대표 이름 표 두 줄이 같고, 사본 api 가 그것을 내보내는가."""
    e_line, e_fn = canon_parts(read(ENGINE), 'chemengine.js')
    r_src = read(REPORT)
    r_line, r_fn = canon_parts(r_src, 'report.html')
    bad = []
    if not e_line or not e_fn:
        bad.append('chemengine.js 에서 MIS_CANON·misCanon 을 못 찾았다')
    if not r_line or not r_fn:
        bad.append('report.html 사본에 MIS_CANON·misCanon 이 없다 (--write 로 넣는다)')
    if e_line and r_line and e_line != r_line:
        bad.append('MIS_CANON 표가 다르다 (--write 로 맞춘다)')
    if e_fn and r_fn and normalize(e_fn) != normalize(r_fn):
        bad.append('misCanon 함수가 다르다 (--write 로 맞춘다)')
    rep_block = engine_block(r_src, 'report.html')
    api = rep_block[rep_block.rfind('var api = {'):]
    if 'misCanon: misCanon' not in api or 'MIS_CANON: MIS_CANON' not in api:
        bad.append('report.html 사본의 api 가 misCanon·MIS_CANON 을 내보내지 않는다')
    return bad


def write_canon():
    e_line, e_fn = canon_parts(read(ENGINE), 'chemengine.js')
    if not e_line or not e_fn:
        raise SystemExit('chemengine.js 에서 MIS_CANON·misCanon 을 못 찾았다')
    src = read(REPORT)
    r_line, r_fn = canon_parts(src, 'report.html')
    if not r_line or not r_fn:
        raise SystemExit('report.html 사본에 MIS_CANON·misCanon 자리가 없다 — 처음 넣는 것은 손으로 한다'
                         '(사본 IIFE 머리, 공통 유틸 앞).')
    new = src.replace(r_line, e_line, 1).replace(r_fn, e_fn, 1)
    if new == src:
        print('이미 같다 · 바꾼 것 없음')
        return
    open(REPORT, 'w', encoding='utf-8').write(new)
    print('report.html 사본의 MIS_CANON·misCanon 을 chemengine.js 와 맞췄다')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()

    if a.write:
        write_canon()

    c = compare()
    if not a.quiet:
        print('chemengine.js %d개 · report.html 사본 %d개 (최상위 함수·상수)' % (len(c['E']), len(c['R'])))
        print('  같음 %d · 다름 %d · chemengine.js 에만 %d · 사본에만 %d'
              % (len(c['same']), len(c['diff']), len(c['only_e']), len(c['only_r'])))
        if c['diff']:
            print('  다름: ' + ', '.join(c['diff']))
        if c['only_e']:
            print('  chemengine.js 에만: ' + ', '.join(c['only_e']))
        if c['only_r']:
            print('  사본에만: ' + ', '.join(c['only_r']))
        if c['diff'] or c['only_e'] or c['only_r']:
            print('  (통째로 합치는 일은 finalScore 대표 시도 규칙을 선생님이 정한 뒤 — 위 차이는 빨간불이 아니다)')

    bad = check_canon()
    if bad:
        print('\nFAIL')
        for b in bad:
            print('  ' + b)
        return 1 if a.check else 0
    if a.check or not a.quiet:
        print('\nPASS · 오개념 대표 이름 표(MIS_CANON·misCanon)가 사본과 같다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
