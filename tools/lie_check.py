#!/usr/bin/env python3
"""**자가 거짓말을 하는지** 잰다 — 참·거짓 예시를 주고 맞히는지 본다.

이 자가 생긴 사연은 하나다. `tools/audit_pages.py` 가 **화면 152장 가운데
152장**이 대비 미달이라고 말하고 있었다. 열어 보니 전부 거짓이었다.

    --o-bg(맞은 문항의 연둣빛 띠) 같은 **상태 색**을 종이로 쳤다
    어두운 화면(roster.html · --bg #0f1216)의 밝은 글씨를 흰 종이에 얹어 쟀다
      → --ink 1.07:1 이라고 했다. 실제로는 15.17:1 로 가장 잘 읽히는 자리다

`--check` 는 0 을 내고 있었으므로 CI 는 초록불이었고, 그래서 **아무도 이
경고를 안 봤다.** 잘못 재는 자는 안 재느니만 못하다 — 사람이 경고를 무시하게
되고, 그러면 진짜가 와도 안 본다.

그리고 이 고침은 exam 저장소에는 **이미 되어 있었다.** 같은 자가 두
저장소에서 갈라져 한쪽만 고쳐진 채로 있었다. 자를 고칠 때는 양쪽을 같이 본다.

여기서는 자마다 맞혀야 할 문제를 붙여 둔다. 자를 고치다가 넓히거나 좁히면
여기서 걸린다.

    python3 tools/lie_check.py           # 자마다 맞혔는지
    python3 tools/lie_check.py --check   # 하나라도 틀리면 빨간불 (CI용)
"""
import importlib.util
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load(rel):
    spec = importlib.util.spec_from_file_location('t', os.path.join(ROOT, rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ⚠ 규칙을 **베끼지 않는다.** 베껴 두면 자를 고쳤을 때 여기가 옛 규칙을
#   맞히고 앉아, 자가 틀려도 초록불이 된다. 진짜 자를 그대로 부른다.
audit_pages = _load('tools/audit_pages.py')

PAGE = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>ㄱ</title><style>%s</style></head>'
        '<body><h1>ㄱ</h1><p>가나다라</p></body></html>')


def contrast_hits(css):
    """팔레트만 바꾼 한 장을 만들어, 대비 경고가 나오는지만 본다."""
    d = tempfile.mkdtemp()
    p = os.path.join(d, 't.html')
    open(p, 'w', encoding='utf-8').write(PAGE % css)
    return bool([h for h in audit_pages.audit(p) if '대비' in h[0]])


store_ledger = _load('tools/store_ledger.py')


def store_keys(src):
    """이 글이 브라우저에 남긴다고 자가 세는 칸 이름들."""
    return sorted(store_ledger.keys_in(src))


report_msg = _load('tools/report_msg.py')


def has_step(sentence):
    """위치를 말한 문장에 '다음에 무엇을 하면 되는지' 가 있는가."""
    return bool(report_msg.STEP.search(sentence))


CASES = [
    ('report_msg 다음 걸음', has_step, [
        ('위치만 말하면 없다고 해야 한다',
         '최상위권입니다. 반에서 상위 약 3%에 듭니다. 반 평균보다 12점 높습니다.', False),
        ('할 일을 말하면 있다고 해야 한다',
         '상위권입니다. 아래 취약 개념 하나만 이번 주에 끝내면 됩니다.', True),
        ('어미가 달라도 알아본다',
         '취약 개념 하나를 잡고 재시를 보면 최종 점수가 올라갑니다.', True),
        ('시스템이 해 준다는 말은 할 일이 아니다',
         '첫 응시 이후 시스템이 최종 점수를 보정합니다.', False),
    ]),
    ('audit_pages 대비', contrast_hits, [
        ('어느 바탕에서도 안 읽히는 색은 잡는다',
         ':root{--paper:#ffffff;--card:#f7f7f7;--muted:#eeeeee}', True),
        ('어두운 화면의 밝은 글씨는 안 잡는다',
         ':root{--bg:#0f1216;--card:#171b21;--ink:#e9e7e0}', False),
        ('밝은 팔레트와 어두운 팔레트가 한 파일에 섞여도 안 잡는다',
         ':root{--bg:#0f1216;--panel:#fff;--muted:#9aa0a8}', False),
        ('상태 띠(--o-bg)는 종이가 아니다',
         ':root{--paper:#FAFAF7;--o-bg:#E7F5EC;--brass-ink:#866A20}', False),
        ('짝이 있는 글자색은 그 짝 위에서 잰다',
         ':root{--paper:#FAFAF7;--warn-bg:#3A2A10;--warn-ink:#F3E6C8}', False),
    ]),
('store_ledger 저장 칸', store_keys, [
        ('따옴표로 바로 적은 칸은 잡는다',
         "localStorage.setItem('dt_stucode', v)", ['dt_stucode']),
        ('상수에 담아 둔 칸도 값을 찾아 푼다',
         "const KEY='dt_hw_round';localStorage.setItem(KEY,v)", ['dt_hw_round']),
        ('래퍼를 거쳐도 대문자 상수면 잡는다',
         "const PAL_KEY='dt_pal_v1';function set(k,v){localStorage.setItem(k,v)}"
         "S.set(PAL_KEY,1)", ['dt_pal_v1']),
        # 자가 여기서 거짓말을 했다. 배지 이름을 담은 **소문자 지역 변수**를
        # 저장 칸으로 세어 'starb' 라는 칸이 있다고 말했다(exam/index.html).
        ('배지 이름을 담은 소문자 지역 변수는 저장 칸이 아니다',
         "const map=[['전 문항','check'],['상위','starb']];const key='starb';"
         "function set(k,v){localStorage.setItem(k,v)}x.set(key)", []),
    ]),
]


def main():
    check = '--check' in sys.argv
    bad = []
    total = 0
    print('자가 참·거짓 예시를 맞히는가\n')
    for name, fn, cases in CASES:
        ok = 0
        for label, given, want in cases:
            total += 1
            got = fn(given)
            if got == want:
                ok += 1
            else:
                bad.append('%s · %s → %r (맞아야 할 답 %r)' % (name, label, got, want))
        print('  %-24s %d/%d' % (name, ok, len(cases)))

    # 깨끗한 저장소에서 조용한지도 본다. 시끄러우면 사람이 안 본다.
    import subprocess
    for rel in ('tools/audit_pages.py',):
        total += 1
        r = subprocess.run([sys.executable, os.path.join(ROOT, rel), '--check'],
                           cwd=ROOT, capture_output=True, text=True)
        noisy = '결함 있는 화면 0개' not in (r.stdout or '')
        if r.returncode == 0 and not noisy:
            print('  %-24s 깨끗한 저장소에서 조용하다' % os.path.basename(rel))
        else:
            bad.append('%s: 깨끗한 저장소인데 시끄럽다 — %s'
                       % (rel, (r.stdout or '').strip().splitlines()[-1:] or ['(말이 없다)']))

    print('\n예시 %d개' % total)
    if bad:
        print('\n틀린 곳 %d:' % len(bad))
        for b in bad:
            print('  ' + b)
        print('\n**자를 먼저 본다.**')
        return 1 if check else 0
    print('자들이 참·거짓을 그대로 답한다.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
