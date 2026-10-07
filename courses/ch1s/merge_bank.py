# -*- coding: utf-8 -*-
"""새로 쓴 확인 문장 묶음(chunk_*.json)을 문장 은행 forms_bank_ch1s.json 에 합친다.

  python3 courses/ch1s/merge_bank.py DIR_또는_파일...            # 미리 보기(아무것도 안 쓴다)
  python3 courses/ch1s/merge_bank.py DIR_또는_파일... --write    # 은행에 덧붙이고
  python3 courses/ch1s/build_rounds.py --write                   # 그다음 재시 3판·앱 은행을 다시 만든다

받는 꼴(셋 다 된다)
  {"CH1S-001": [{a,s,f,w,lvl,…}, …], …}
  {"CH1S-001": {"forms": [{a,s,f,w,lvl,…}, …]}, …}
  [{"c": "CH1S-001", a,s,f,w,lvl,…}, …]
a·s·f·w·lvl 밖의 키(출처 표시 src·by·출처 등)는 은행에 넣지 않고 보고에만 센다.

버리는 것(까닭과 함께 보고)
  · 개념 코드가 설계(design.json)에 없음 · a 가 O/X 가 아님 · lvl 이 1~3 이 아님 · 글이 문자열이 아님
  · build_rounds.form_errs 에 걸림(℃ · O 인데 f≠s · X 인데 f=s · 「다.」로 안 끝남 · 해설 없음)
  · 은행·정시(10회 600문항)·심화 도전 엮기 문장·기존 화학1 문장과 띄어쓰기를 빼고 같은 글자
  · 묶음 안에서 앞서 나온 문장과 같은 글자
경고만 하는 것: 같은 개념 은행 문장과 아주 닮음(글자 두 개 묶음 겹침 0.85 이상 — 숫자만 바꾼 꼴일 수 있다).
"""
import collections
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_rounds as br  # noqa: E402

FKEYS = ('a', 's', 'f', 'w', 'lvl')


def files(args):
    out = []
    for a in args:
        if os.path.isdir(a):
            out += sorted(glob.glob(os.path.join(a, 'chunk_*.json')))
        else:
            out += sorted(glob.glob(a))
    return out


def entries(path):
    """(개념 코드, 문장 dict) 를 낸다."""
    d = br.load(path)
    if isinstance(d, list):
        for x in d:
            yield (x.get('c') if isinstance(x, dict) else None), x
    elif isinstance(d, dict):
        for code, v in d.items():
            if isinstance(v, dict):
                v = v.get('forms', [])
            for x in v if isinstance(v, list) else []:
                yield code, x
    else:
        raise SystemExit('%s: 꼴을 모르겠다' % path)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    write = '--write' in sys.argv
    paths = files(args)
    if not paths:
        sys.exit('합칠 파일이 없다 — 디렉터리(chunk_*.json)나 파일을 준다')
    dz = br.design()
    cm = {c['c']: c for c in dz['concepts']}
    bank = br.load(br.BANK)
    rounds = br.load_rounds()
    taken = {}
    for code, e in bank.items():
        for fm in e['forms']:
            taken[br.norm(fm['s'])] = '은행 ' + code
    for r in rounds:
        for it in rounds[r]['jeongsi']['items']:
            taken.setdefault(br.norm(it['s']), '정시 ' + it['n'])
    if os.path.exists(br.CHALLENGE):
        for x in br.load(br.CHALLENGE):
            taken.setdefault(br.norm(x['s']), '엮기 ' + x['c'])
    old = br.ch1_corpus()
    add = collections.defaultdict(list)
    bad = collections.Counter()
    bad_ex = collections.defaultdict(list)
    extra = collections.Counter()
    warn = []
    seen = {}
    n_in = 0
    for p in paths:
        for code, x in entries(p):
            n_in += 1
            tag = '%s:%s' % (os.path.basename(p), code)

            def no(why):
                bad[why] += 1
                if len(bad_ex[why]) < 5:
                    bad_ex[why].append('%s «%s»' % (tag, str(x.get('s', '') if isinstance(x, dict) else x)[:60]))

            if not isinstance(x, dict):
                no('문장이 dict 가 아님')
                continue
            for k in x:
                if k not in FKEYS and k != 'c':
                    extra['%s=%s' % (k, str(x[k])[:20])] += 1
            if code not in cm:
                no('개념 코드 없음')
                continue
            if x.get('a') not in ('O', 'X'):
                no('a 가 O/X 가 아님')
                continue
            if x.get('lvl') not in (1, 2, 3):
                no('lvl 이 1~3 이 아님')
                continue
            if not all(isinstance(x.get(k), str) for k in ('s', 'f', 'w')):
                no('s·f·w 가 글이 아님')
                continue
            fm = {k: (x[k].strip() if isinstance(x[k], str) else x[k]) for k in FKEYS}
            errs = br.form_errs(tag, fm)
            if errs:
                no(errs[0].split(' ', 1)[1])
                continue
            k = br.norm(fm['s'])
            if k in taken:
                no('이미 있는 문장(%s)' % taken[k].split(' ')[0])
                continue
            if k in old:
                no('기존 화학1 문장과 같음')
                continue
            if k in seen:
                no('묶음 안 중복')
                continue
            seen[k] = tag
            near = max([(br._sim(k, br.norm(f2['s'])), f2['s']) for f2 in bank[code]['forms']] or [(0, '')])
            if near[0] >= 0.85:
                warn.append('%s 닮음 %.2f «%s» ~ «%s»' % (tag, near[0], fm['s'][:40], near[1][:40]))
            add[code].append(fm)
    n_add = sum(len(v) for v in add.values())
    print('읽음 %d파일 · 문장 %d · 넣을 것 %d · 버림 %d' % (len(paths), n_in, n_add, sum(bad.values())))
    for why, n in bad.most_common():
        print('  ✗ %-28s %d  예: %s' % (why, n, ' / '.join(bad_ex[why][:2])))
    if extra:
        print('  은행에 안 넣는 꼬리표:', ', '.join('%s(%d)' % kv for kv in extra.most_common(8)))
    for w in warn[:20]:
        print('  ! ' + w)
    if len(warn) > 20:
        print('  ! … 닮음 경고 %d건 더' % (len(warn) - 20))
    lv = collections.Counter(fm['lvl'] for v in add.values() for fm in v)
    ox = collections.Counter(fm['a'] for v in add.values() for fm in v)
    print('  넣을 것 lvl %s · O/X %s · 개념 %d개' % (dict(sorted(lv.items())), dict(ox), len(add)))
    if not write:
        print('미리 보기만 했다 — 합치려면 --write')
        return
    for code, forms in add.items():
        bank[code]['forms'] += forms
    br.dump(br.BANK, bank)
    print('썼다: %s (+%d) — 이어서 python3 courses/ch1s/build_rounds.py --write' % (os.path.relpath(br.BANK, br.DT), n_add))


if __name__ == '__main__':
    main()
