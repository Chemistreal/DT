#!/usr/bin/env python3
"""화면에 박힌 엔진 사본을 chemengine.js 와 **글자까지** 같게 지킨다.

왜 이 자가 있나
---------------
report.html(학부모 성적표) · exam.html(응시) · chemistreal_app.html 은 chemengine.js 를
<script src> 로 부르지 않고 **베껴 넣어** 둔다 — 성적표는 한 파일로 열려야 하고(문자로
받은 링크 · 인쇄 · handoff), 응시 화면도 자료 하나 못 받아도 채점은 돼야 한다. 그래서
chemengine.js 를 고치면 사본은 그대로 남는다.

2026-09-11 에 재어 보니 사본은 옛 판이었고 **결과가 달라지는** 차이가 둘 있었다:

    cumulative.finalScore / finalAttempt (회차의 대표 시도)
      chemengine.js · 서버 apps-script.gs cumulative_   처음 통과한 시도, 없으면 마지막   (repr)
      사본                                              마지막 시도                        (last)
    order() (시도 순서)
      chemengine.js · 서버 attOrd_                      라벨의 '재' 글자 수
      사본                                              아는 라벨 넷의 표

운영 성적표의 누적(A)은 서버가 계산해 보내므로 화면은 이미 repr 이었고, 사본의 last 는
데모·「N회 시점 상세」·구간 재계산에서만 쓰였다 — **같은 학생이 같은 화면에서 두 숫자를
받을 수 있었다.** 그래서 chemengine.js 쪽으로 합쳤다(선생님 결정 2026-09-11): 브라우저에서
다시 세는 값이 서버와 달라서는 안 된다.

어떻게 지키나
-------------
사본은 마커 두 줄 사이에 있다:

    /* ENGINE-BEGIN … */        ← 이 줄 다음부터
    (chemengine.js 전문)
    /* ENGINE-END */            ← 이 줄 앞까지

  · 마커 안은 **손으로 고치지 않는다.** chemengine.js 를 고친 뒤 `--write` 로 넣는다.
  · `--check` 는 (1) 세 사본이 chemengine.js 와 바이트까지 같은지, (2) chemengine.js 의
    내보내기가 브라우저(window)에서도 `ChemEngine` 전역을 만드는지(node vm 으로 실제로
    돌려 본다), (3) 사본 바깥의 호출부(`ChemEngine.이름`)가 전부 api 에 있는 이름인지,
    (4) 서버 apps-script.gs 의 오개념 대표 이름 표(MIS_CANON · misCanon)가 chemengine.js 와
    같은지, (5) 그 표를 chemengine.js cumulative·spacedReview 와 서버 cumulative_ 가 실제로
    쓰는지 본다 — 세 곳이 같은 규칙이어야 한다.

    python3 tools/engine_sync.py            # 사본마다 함수 단위 차이
    python3 tools/engine_sync.py --check    # 하나라도 갈렸으면 빨간불 (CI)
    python3 tools/engine_sync.py --write    # chemengine.js 를 사본에 넣고, 서버의 표를 맞춘다
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, 'chemengine.js')
GS = os.path.join(ROOT, 'apps-script.gs')
COPIES = ['report.html', 'exam.html', 'chemistreal_app.html']

BEGIN = ('/* ENGINE-BEGIN — chemengine.js 의 사본. 여기부터 ENGINE-END 까지는 손으로 고치지 않는다: '
         'chemengine.js 를 고친 뒤 python3 tools/engine_sync.py --write */')
END = '/* ENGINE-END */'

HEAD = 'Chemistreal 채점·진단·재시 로직 엔진'
HEAD_OPEN = '/* ============================================================\n   ' + HEAD
TAIL = "})(typeof window !== 'undefined' ? window : this);"

# 사본 바깥의 호출부가 쓰는 이름은 파일에서 모으고, 이것은 어느 화면이든 있어야 하는 최소.
CORE_API = ['cumulative', 'spacedReview', 'gradeAttempt', 'diagnose', 'buildGate', 'buildRetake',
            'studentKey', 'norm', 'misCanon', 'MIS_CANON']

# 오개념 대표 이름 표 — chemengine.js(IIFE 안 · 2칸 들여씀)와 apps-script.gs(최상위 · 안 들여씀).
CANON_LINE = re.compile(r'^( {0,2})var MIS_CANON = \{.*\};$', re.M)
CANON_FN = re.compile(r'^( {0,2})function misCanon\(m\) \{\n(?:.*\n)*?\1\}$', re.M)


def read(p):
    return open(p, encoding='utf-8').read()


def write(p, s):
    open(p, 'w', encoding='utf-8').write(s)


# ---------- chemengine.js ----------
def engine_src():
    src = read(ENGINE)
    if not src.startswith(HEAD_OPEN):
        raise SystemExit('chemengine.js 가 엔진 머리글로 시작하지 않는다')
    if not src.rstrip('\n').endswith(TAIL):
        raise SystemExit('chemengine.js 가 IIFE 꼬리로 끝나지 않는다')
    return src if src.endswith('\n') else src + '\n'


def api_names(src):
    """`var api = { … };` 의 키."""
    a = src.rfind('var api = {')
    b = src.find('};', a)
    if a < 0 or b < 0:
        raise SystemExit('chemengine.js 에서 api 를 못 찾았다')
    return set(re.findall(r'(\w+)\s*:', src[a:b]))


def browser_global(code, need):
    """브라우저처럼(module 없음 · window 있음) 돌려 window.ChemEngine 이 생기는지 node 로 본다."""
    js = r"""
const vm = require('vm'), fs = require('fs');
const code = fs.readFileSync(process.argv[2], 'utf8');
const need = process.argv.slice(3);
const w = {};
try { vm.runInNewContext(code, { window: w }); }
catch (e) { console.log('실행 오류: ' + (e && e.message)); process.exit(1); }
const api = w.ChemEngine;
if (!api || typeof api !== 'object') { console.log('window.ChemEngine 이 안 생겼다'); process.exit(1); }
const miss = need.filter(n => !(n in api));
if (miss.length) { console.log('ChemEngine 에 없다: ' + miss.join(', ')); process.exit(1); }
"""
    fd, cpath = tempfile.mkstemp(suffix='.js')
    fd2, spath = tempfile.mkstemp(suffix='.js')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(code)
        with os.fdopen(fd2, 'w', encoding='utf-8') as f:
            f.write(js)
        try:
            r = subprocess.run(['node', spath, cpath] + sorted(need), capture_output=True, text=True)
        except FileNotFoundError:
            return 'node 가 없어 브라우저 전역(window.ChemEngine)을 확인하지 못했다'
        if r.returncode != 0:
            return (r.stdout + r.stderr).strip().splitlines()[0]
        return None
    finally:
        os.unlink(cpath)
        os.unlink(spath)


# ---------- 사본 ----------
def marker_span(src):
    """(BEGIN 시작, END 끝) — 마커가 정확히 하나씩일 때. 없으면 None, 어긋나면 SystemExit."""
    nb, ne = src.count(BEGIN), src.count(END)
    if nb == 0 and ne == 0:
        return None
    if nb != 1 or ne != 1:
        raise SystemExit('ENGINE 마커가 하나씩이 아니다 (BEGIN %d · END %d)' % (nb, ne))
    a = src.find(BEGIN)
    b = src.find(END, a)
    if b < a:
        raise SystemExit('ENGINE-END 가 ENGINE-BEGIN 앞에 있다')
    return a, b + len(END)


def legacy_span(src):
    """마커 없이 박힌 옛 사본(머리글부터 IIFE 꼬리까지)."""
    a = src.find(HEAD_OPEN)
    if a < 0:
        return None
    b = src.find(TAIL, a)
    if b < 0:
        raise SystemExit('옛 사본의 IIFE 꼬리를 못 찾았다')
    return a, b + len(TAIL)


def body_of(src, span):
    a, b = span
    inner = src[a + len(BEGIN):b - len(END)]
    if not inner.startswith('\n'):
        raise SystemExit('ENGINE-BEGIN 다음 줄부터가 사본이어야 한다')
    return inner[1:]


def calls_outside(src, span):
    """사본 바깥에서 부르는 `ChemEngine.이름`."""
    outside = src if span is None else src[:span[0]] + src[span[1]:]
    return set(re.findall(r'\bChemEngine\.(\w+)', outside))


# ---------- 오개념 대표 이름 표 ----------
def strip_indent(t, ind):
    """줄마다 앞의 들여쓰기(ind)를 걷어 낸다 — IIFE 안(2칸)과 최상위(0칸)를 같은 꼴로."""
    if not ind:
        return t
    return '\n'.join(l[len(ind):] if l.startswith(ind) else l for l in t.split('\n'))


def canon_parts(src):
    """(MIS_CANON 줄, misCanon 함수) — 둘 다 들여쓰기를 걷어 낸 꼴. 없으면 None."""
    a = CANON_LINE.search(src)
    b = CANON_FN.search(src)
    return (strip_indent(a.group(0), a.group(1)) if a else None), (strip_indent(b.group(0), b.group(1)) if b else None)


def canon_raw(src):
    """--write 가 바꿔 끼울 때 쓰는, 파일에 적힌 그대로의 두 토막."""
    a = CANON_LINE.search(src)
    b = CANON_FN.search(src)
    return (a.group(0) if a else None), (b.group(0) if b else None)


def fn_body(src, name):
    """최상위 `function NAME(` 부터 짝 맞는 `}` 까지."""
    m = re.search(r'^ {0,2}function ' + re.escape(name) + r'\s*\(', src, re.M)
    if not m:
        return None
    i = src.find('{', m.end())
    d = 0
    for j in range(i, len(src)):
        c = src[j]
        if c == '{':
            d += 1
        elif c == '}':
            d -= 1
            if d == 0:
                return src[m.start():j + 1]
    return None


# ---------- 함수 단위 비교 (사람이 볼 것) ----------
def iife(src):
    a = src.find('(function (root) {')
    b = src.find(TAIL, a)
    return src[a:b] if a >= 0 and b > a else ''


def members(block):
    out, order = {}, []
    pat = re.compile(r'^ {0,2}(?:function (\w+)\s*\(|var (\w+)\s*=)', re.M)
    for m in pat.finditer(block):
        name = m.group(1) or m.group(2)
        j = _scan_end(block, m.start(), bool(m.group(1)))
        out[name] = block[m.start():j]
        order.append(name)
    return out, order


def _scan_end(s, i, is_fn):
    depth, n, q, k = 0, len(s), None, i
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


def compare(eng, copy_src):
    E, eo = members(iife(eng))
    R, ro = members(iife(copy_src))
    same, diff = [], []
    for n in eo:
        if n in R:
            (same if normalize(E[n]) == normalize(R[n]) else diff).append(n)
    return {'same': same, 'diff': diff,
            'only_e': [n for n in eo if n not in R], 'only_r': [n for n in ro if n not in E]}


# ---------- --check ----------
def check():
    bad = []
    eng = engine_src()
    names = api_names(eng)

    # (1) chemengine.js 자체 — HTML 안에 그대로 들어가도 되는가, 내보내기는 두 길 다 있는가
    if re.search(r'</script', eng, re.I):
        bad.append('chemengine.js 안에 </script 가 있다 — HTML 에 박으면 거기서 스크립트가 끝난다')
    if 'root.ChemEngine = api' not in eng or "typeof module !== 'undefined'" not in eng:
        bad.append('chemengine.js 의 내보내기(module.exports / root.ChemEngine)가 없다')
    if '(?<' in eng:
        bad.append('chemengine.js 에 정규식 lookbehind 가 있다 — 옛 사파리에서 페이지가 죽는다')
    for n in CORE_API:
        if n not in names:
            bad.append('chemengine.js api 에 %s 이 없다' % n)

    # (2) 사본 — 바이트까지 같은가 · 호출부 이름이 api 에 있는가
    need = set(CORE_API)
    for f in COPIES:
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            bad.append(f + ' 이 없다')
            continue
        src = read(p)
        try:
            span = marker_span(src)
        except SystemExit as e:
            bad.append(f + ': ' + str(e))
            continue
        if span is None:
            bad.append(f + ': ENGINE 마커가 없다 (--write 로 감싼다)')
            continue
        if src.count(HEAD) != 1:
            bad.append(f + ': 엔진 머리글이 %d번 나온다 — 마커 밖에 옛 사본이 남았다' % src.count(HEAD))
        if body_of(src, span) != eng:
            bad.append(f + ': 사본이 chemengine.js 와 다르다 (--write 로 맞춘다)')
        used = calls_outside(src, span)
        need |= used
        miss = sorted(n for n in used if n not in names)
        if miss:
            bad.append(f + ': 호출부가 chemengine.js api 에 없는 이름을 쓴다 — ' + ', '.join(miss))

    # (3) 브라우저 전역 — 실제로 돌려 본다
    err = browser_global(eng, need)
    if err:
        bad.append('chemengine.js 를 브라우저처럼 돌리면: ' + err)

    # (4) 서버의 표 — 글자까지 같은가
    e_line, e_fn = canon_parts(eng)
    if not e_line or not e_fn:
        bad.append('chemengine.js 에서 MIS_CANON·misCanon 을 못 찾았다')
    gs = read(GS) if os.path.exists(GS) else ''
    g_line, g_fn = canon_parts(gs)
    if not g_line or not g_fn:
        bad.append('apps-script.gs 에 MIS_CANON·misCanon 이 없다 (--write 로 넣는다)')
    else:
        if e_line and e_line != g_line:
            bad.append('apps-script.gs 의 MIS_CANON 표가 chemengine.js 와 다르다 (--write 로 맞춘다)')
        if e_fn and e_fn != g_fn:
            bad.append('apps-script.gs 의 misCanon 이 chemengine.js 와 다르다 (--write 로 맞춘다)')

    # (5) 같은 규칙 — 세 곳 다 집계에서 대표 이름을 쓴다
    for where, src, fn in (('chemengine.js', eng, 'cumulative'), ('chemengine.js', eng, 'spacedReview'),
                           ('apps-script.gs', gs, 'cumulative_')):
        body = fn_body(src, fn)
        if body is None:
            bad.append('%s 에 %s 가 없다' % (where, fn))
        elif 'misCanon(' not in body:
            bad.append('%s 의 %s 가 오개념을 대표 이름(misCanon)으로 세지 않는다' % (where, fn))
    return bad


# ---------- --write ----------
def write_all():
    eng = engine_src()
    changed = []
    for f in COPIES:
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            print('  건너뜀 %s (없음)' % f)
            continue
        src = read(p)
        span = marker_span(src)
        if span is None:
            span = legacy_span(src)
            if span is None:
                raise SystemExit(f + ': 마커도 옛 사본도 없다 — 어디에 넣을지 사람이 정한다')
            note = '마커로 감싸고 넣었다'
        else:
            note = '사본을 맞췄다'
        new = src[:span[0]] + BEGIN + '\n' + eng + END + src[span[1]:]
        if new != src:
            write(p, new)
            changed.append(f)
            print('  %s: %s' % (f, note))
        else:
            print('  %s: 이미 같다' % f)

    e_line, e_fn = canon_parts(eng)          # 들여쓰기를 걷어 낸 꼴 = 최상위(gs)에 그대로 들어간다
    if not e_line or not e_fn:
        raise SystemExit('chemengine.js 에서 MIS_CANON·misCanon 을 못 찾았다')
    gs = read(GS)
    g_line, g_fn = canon_raw(gs)
    if not g_line or not g_fn:
        raise SystemExit('apps-script.gs 에 MIS_CANON·misCanon 자리가 없다 — 처음 넣는 것은 손으로 한다(attLabelOf_ 다음).')
    new = gs.replace(g_line, e_line, 1).replace(g_fn, e_fn, 1)
    if new != gs:
        write(GS, new)
        changed.append('apps-script.gs')
        print('  apps-script.gs: MIS_CANON·misCanon 을 맞췄다')
    else:
        print('  apps-script.gs: 표가 이미 같다')
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()

    if a.write:
        write_all()

    if not a.quiet:
        eng = engine_src()
        for f in COPIES:
            p = os.path.join(ROOT, f)
            if not os.path.exists(p):
                continue
            src = read(p)
            span = marker_span(src)
            if span is not None and body_of(src, span) == eng:
                print('%s: chemengine.js 와 같다' % f)
                continue
            c = compare(eng, src)
            print('%s: 같음 %d · 다름 %d · chemengine.js 에만 %d · 사본에만 %d'
                  % (f, len(c['same']), len(c['diff']), len(c['only_e']), len(c['only_r'])))
            for k, lab in (('diff', '다름'), ('only_e', 'chemengine.js 에만'), ('only_r', '사본에만')):
                if c[k]:
                    print('  %s: %s' % (lab, ', '.join(c[k])))

    bad = check()
    if bad:
        print('\nFAIL')
        for b in bad:
            print('  ' + b)
        return 1 if a.check else 0
    if a.check or not a.quiet:
        print('\nPASS · 사본 %d개가 chemengine.js 와 같고, 서버의 오개념 대표 이름 표도 같다' % len(COPIES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
