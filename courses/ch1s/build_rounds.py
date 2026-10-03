# -*- coding: utf-8 -*-
"""화학1 심화 회차 파일 10개와 문장 은행을 조립·검사한다.

  python3 courses/ch1s/build_rounds.py --write   # 원문을 고친 뒤: 재출제 칸·은행의 정시 문장·재시 3판을 다시 맞춘다
  python3 courses/ch1s/build_rounds.py --check   # 설계표·재출제 원문·은행·재시를 대조

원본(손으로 고치는 곳)
  · round_ch1s_NN.json 의 신규·복습-새 칸 문장
  · forms_bank_ch1s.json 의 확인 문장(n 이 없는 것)
파생(--write 가 다시 만든다 — 손으로 고치지 않는다)
  · 복습-재출제 칸: design.json blueprint 의 from_round 회 from_n 번 문장을 글자 그대로
  · 은행의 정시 문장(n 이 붙은 form): 회차 파일 문장 그대로
  · 재시 3판(retakeC): 칸마다 그 개념의 은행 문장 가운데 정시보다 쉽거나 같은 것

은행 form 의 꼬리표: n = 이 문장이 나온 정시 칸("3-16") · from = 화학1 은행에서 글자 그대로 가져온 원래 코드.
화학1 문장을 글자 그대로 두는 까닭: 화학1을 들은 학생의 «이미 본 문장» 기록이 그대로 맞물린다.

처음 한 번만 쓰는 것(집필 결과 tools/_stage/ch1s/ → 원본):
  --stage-rounds   w_*.json  → 회차 파일 신규·복습-새 칸
  --stage-forms    f_plan.json + f_*.json → 은행
  --stage-reading  r_*.json → 은행 reading(핵심·흔한 오해·한 줄 정리) + deep_ch1s.json(한 겹 더)
"""
import collections
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DT = os.path.dirname(os.path.dirname(HERE))
STAGE = os.path.join(DT, 'tools', '_stage', 'ch1s')
BANK = os.path.join(HERE, 'forms_bank_ch1s.json')
LINK = os.path.join(HERE, 'link_ch1.json')
DEEP = os.path.join(HERE, 'deep_ch1s.json')
READ_LIM = {'core': (40, 180), 'kill': (60, 220), 'oneline': (20, 110)}
KEYS = ('n', 'u', 'mis', 'a', 's', 'f', 'w', 'lvl', 'c')
RKEYS = ('c', 'u', 'a', 's', 'f', 'w', 'lvl')
SCORING = {'per': 1.6667, 'max': 100, 'wrong': 0, 'blank': 0, 'pass': 80}
VERSIONS = 3


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def dump(p, obj):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')


def norm(s):
    return re.sub(r'\s+', '', s)


def round_path(r):
    return os.path.join(HERE, 'round_ch1s_%02d.json' % r)


def design():
    return load(os.path.join(HERE, 'design.json'))


def ch1_bank():
    return load(os.path.join(DT, 'appdata', 'forms_bank.json'))


def ch1_corpus():
    """기존 화학1 문장(정시·재시·문장 은행) — 심화반이 새로 쓴 문장과 글자까지 같으면 안 된다."""
    out = set()
    for p in sorted(glob.glob(os.path.join(DT, 'appdata', 'round_ch1_*.json'))):
        d = load(p)
        out |= {norm(it['s']) for it in d['jeongsi']['items']}
        for v in d.get('retakeC', []):
            out |= {norm(it['s']) for it in v['items']}
    for code, e in ch1_bank().items():
        if code.startswith('CH1-'):
            out |= {norm(fm['s']) for fm in e['forms']}
    return out


def load_rounds():
    return {r: load(round_path(r)) for r in range(1, 11)}


# ───────── 처음 한 번: 집필 결과 들이기 ─────────
def stage_rounds(dz):
    cm = {c['c']: c for c in dz['concepts']}
    written = {}
    for p in sorted(glob.glob(os.path.join(STAGE, 'w_*.json'))):
        for k, v in load(p).items():
            if k in written:
                sys.exit('집필 결과에 %s 가 두 번 있다' % k)
            written[k] = v
    rounds = {}
    for r in range(1, 11):
        items = []
        for x in dz['blueprint'][str(r)]:
            n = '%d-%02d' % (r, x['n'])
            if x['구획'] == '복습-재출제':
                it = {'s': '', 'f': '', 'w': '', 'a': x['a'], 'lvl': x['lvl'], 'c': x['c']}   # sync_review 가 채운다
            else:
                if n not in written:
                    sys.exit('집필 결과에 %s 가 없다' % n)
                it = dict(written[n])
            it['n'] = n
            it['u'] = cm[x['c']]['u']
            it['mis'] = cm[x['c']]['m']
            items.append({k: it[k] for k in KEYS})
        rounds[r] = {'course': 'ch1s', 'round': r, 'title': '화학1 심화 누적 OX %d회' % r,
                     'scoring': SCORING, 'jeongsi': {'n': 60, 'items': items}, 'retakeC': []}
    return rounds


def stage_forms(dz, rounds):
    plan = load(os.path.join(STAGE, 'f_plan.json'))
    written = {}
    for p in sorted(glob.glob(os.path.join(STAGE, 'f_[A-Z].json'))):
        written.update(load(p))
    bank = {}
    for c in dz['concepts']:
        code = c['c']
        if code not in written:
            sys.exit('확인 문장 집필 결과에 %s 가 없다' % code)
        drop = set(written[code].get('reuse_drop', []))
        forms = [{'a': x['a'], 's': x['s'], 'f': x['f'], 'w': x['w'], 'lvl': x['lvl']}
                 for x in written[code]['new']]
        have = {norm(fm['s']) for fm in forms} | {norm(x['s']) for x in plan[code]['jeongsi']}
        for i, x in enumerate(plan[code]['reuse_ch1']):
            if i in drop or norm(x['s']) in have:      # 화학1 은행 안에도 띄어쓰기만 다른 같은 문장이 있다
                continue
            have.add(norm(x['s']))
            forms.append({'a': x['a'], 's': x['s'], 'f': x['f'], 'w': x['w'], 'lvl': x['lvl'], 'from': x['src']})
        bank[code] = {'m': c['m'], 't': 'C', 'forms': forms}
    return bank


def stage_reading(bank):
    """r_*.json(핵심·흔한 오해·한 줄 정리·한 겹 더) → 은행 reading 과 deep_ch1s.json."""
    got = {}
    for p in sorted(glob.glob(os.path.join(STAGE, 'r_[A-Z].json'))):
        got.update(load(p))
    deep = {}
    for code, e in bank.items():
        if code not in got:
            sys.exit('읽을거리 집필 결과에 %s 가 없다' % code)
        x = got[code]
        e['reading'] = {k: x[k] for k in ('core', 'kill', 'oneline')}
        deep[code] = x['deep']
    dump(DEEP, deep)


# ───────── 화학1 → 심화 대응표 (엔진 carryOver 가 읽는다) ─────────
def mis_canon_table():
    src = open(os.path.join(DT, 'chemengine.js'), encoding='utf-8').read()
    m = re.search(r'var MIS_CANON = (\{.*?\});', src, re.S)
    return json.loads(m.group(1))


def build_link(dz):
    """map: CH1 코드 → CH1S 코드 · names: CH1S → 이름 · mis: 화학1 오개념 이름(대표) → CH1S.
    이름 표는 답안이 없는 옛 행용이다 — 한 이름이 두 심화 개념으로 갈리면 넣지 않는다."""
    canon = mis_canon_table()
    cm = {c['c']: c for c in dz['concepts']}
    mp = {}
    for c in dz['concepts']:
        for e in c['ch1_equiv']:
            mp[e] = c['c']
    by_name = collections.defaultdict(set)
    for p in sorted(glob.glob(os.path.join(DT, 'appdata', 'round_ch1_*.json'))):
        for it in load(p)['jeongsi']['items']:
            if it.get('c') in mp and it.get('mis'):
                k = it['mis'].strip()
                by_name[canon.get(k, k)].add(mp[it['c']])
    for code, e in ch1_bank().items():
        if code in mp and e.get('m'):
            k = e['m'].strip()
            by_name[canon.get(k, k)].add(mp[code])
    mis = {k: sorted(v)[0] for k, v in sorted(by_name.items()) if len(v) == 1}
    return {'from': 'ch1', 'map': dict(sorted(mp.items())),
            'names': {k: cm[k]['m'] for k in sorted(set(mp.values()))}, 'mis': mis}


# ───────── 파생: 재출제 · 은행의 정시 문장 · 재시 ─────────
def sync_review(dz, rounds):
    for r in range(1, 11):
        items = rounds[r]['jeongsi']['items']
        for i, x in enumerate(dz['blueprint'][str(r)]):
            if x['구획'] != '복습-재출제':
                continue
            src = rounds[x['from_round']]['jeongsi']['items'][x['from_n'] - 1]
            it = dict(src)
            it['n'] = items[i]['n']
            items[i] = {k: it[k] for k in KEYS}


def sync_bank_own(dz, rounds, bank):
    """은행 맨 앞에 그 개념의 정시 문장(신규·복습-새)을 회차 파일 그대로 둔다."""
    own = collections.defaultdict(list)
    for r in range(1, 11):
        for it, x in zip(rounds[r]['jeongsi']['items'], dz['blueprint'][str(r)]):
            if x['구획'] != '복습-재출제':
                own[it['c']].append({'a': it['a'], 's': it['s'], 'f': it['f'], 'w': it['w'],
                                     'lvl': it['lvl'], 'n': it['n']})
    for code, e in bank.items():
        e['forms'] = own.get(code, []) + [fm for fm in e['forms'] if 'n' not in fm]


def build_retakes(dz, rounds, bank):
    """회차마다 재시 3판. 칸마다 그 칸 개념의 은행 문장을 고른다.
    고르는 순서: 이 회차 앞 판에서 안 쓴 것 → 어느 회차 정시에도 안 나온 것 → 칸과 정답(O/X)이 같은 것
    → 칸보다 어렵지 않은 것 → 칸보다 한 단계 쉬운 것에 가까운 것 → 은행 순서.
    이 회차 정시 문장과 한 판 안의 같은 문장은 절대 안 낸다. 개념 문장이 동나면 같은 회차 다른 개념에서 빌린다."""
    cm = {c['c']: c for c in dz['concepts']}
    every_js = {norm(it['s']) for r in rounds for it in rounds[r]['jeongsi']['items']}
    for r in range(1, 11):
        items = rounds[r]['jeongsi']['items']
        this_js = {norm(it['s']) for it in items}
        order = []
        for it in items:
            if it['c'] not in order:
                order.append(it['c'])
        used_before = collections.Counter()
        versions = []
        for v in range(VERSIONS):
            used = set()

            def key(fm, slot, idx):
                k = norm(fm['s'])
                t = max(1, slot['lvl'] - 1)
                return (used_before[k], k in every_js, fm['a'] != slot['a'], fm['lvl'] > slot['lvl'],
                        abs(fm['lvl'] - t), idx)

            out = []
            for slot in items:
                def cands(code):
                    return [(key(fm, slot, i), code, fm) for i, fm in enumerate(bank[code]['forms'])
                            if norm(fm['s']) not in this_js and norm(fm['s']) not in used]
                pool = cands(slot['c'])
                if not pool:
                    pool = [x for code in order if code != slot['c'] for x in cands(code)]
                if not pool:
                    sys.exit('%d회 %s 재시에 낼 문장이 없다' % (r, slot['n']))
                _, code, fm = min(pool, key=lambda x: x[0])
                k = norm(fm['s'])
                used.add(k)
                out.append({'c': code, 'u': cm[code]['u'], 'a': fm['a'], 's': fm['s'], 'f': fm['f'],
                            'w': fm['w'], 'lvl': fm['lvl']})
            used_before.update(used)
            versions.append({'v': v + 1, 'items': out})
        rounds[r]['retakeC'] = versions


def write_all(rounds, bank):
    for r, doc in rounds.items():
        dump(round_path(r), doc)
    dump(BANK, bank)
    dump(LINK, build_link(design()))


# ───────── 검사 ─────────
def check():
    dz = design()
    cm = {c['c']: c for c in dz['concepts']}
    errs = []
    old = ch1_corpus()
    rounds = {}
    for r in range(1, 11):
        p = round_path(r)
        if not os.path.exists(p):
            errs.append('%d회 파일 없음' % r)
            continue
        d = load(p)
        if (d.get('course'), d.get('round')) != ('ch1s', r):
            errs.append('%d회 course/round 머리' % r)
        if d.get('scoring') != SCORING:
            errs.append('%d회 채점 설정' % r)
        rounds[r] = d
        if d['jeongsi']['n'] != 60 or len(d['jeongsi']['items']) != 60:
            errs.append('%d회 문항 수' % r)
    if errs:
        return errs
    # 정시
    seen = {}
    for r in range(1, 11):
        items = rounds[r]['jeongsi']['items']
        bp = dz['blueprint'][str(r)]
        ox = collections.Counter(it['a'] for it in items)
        info = dz['rounds'][r - 1]
        if (ox['O'], ox['X']) != (info['ox_target']['O'], info['ox_target']['X']):
            errs.append('%d회 O/X %s' % (r, dict(ox)))
        for it, x in zip(items, bp):
            tag = it['n']
            if tuple(it) != KEYS:
                errs.append('%s 키 순서·구성' % tag)
            if tag != '%d-%02d' % (r, x['n']):
                errs.append('%s 번호' % tag)
            for k in ('c', 'lvl', 'a'):
                if it[k] != x[k]:
                    errs.append('%s %s=%s ≠ 설계 %s' % (tag, k, it[k], x[k]))
            c = cm.get(it['c'])
            if c and (it['u'], it['mis']) != (c['u'], c['m']):
                errs.append('%s u·mis 가 개념표와 다름' % tag)
            errs += form_errs(tag, it)
            if x['구획'] == '복습-재출제':
                src = rounds[x['from_round']]['jeongsi']['items'][x['from_n'] - 1]
                if any(it[k] != src[k] for k in ('u', 'mis', 'a', 's', 'f', 'w', 'lvl', 'c')):
                    errs.append('%s 재출제가 %s 원문과 다름' % (tag, src['n']))
                continue
            k = norm(it['s'])
            if k in seen:
                errs.append('%s 문장이 %s 와 같음' % (tag, seen[k]))
            seen[k] = tag
            if k in old:
                errs.append('%s 기존 화학1 문장과 같음' % tag)
    if not os.path.exists(LINK) or load(LINK) != build_link(dz):
        errs.append('link_ch1.json 이 design.json 대응과 다름 (--write)')
    if not os.path.exists(BANK):
        return errs + ['문장 은행 forms_bank_ch1s.json 없음']
    # 은행
    bank = load(BANK)
    ch1 = ch1_bank()
    if sorted(bank) != sorted(cm):
        errs.append('은행 개념 목록이 설계와 다름')
    by_n = {it['n']: it for r in rounds for it in rounds[r]['jeongsi']['items']}
    bseen = {}
    for code, e in bank.items():
        if e.get('m') != cm.get(code, {}).get('m'):
            errs.append('%s 은행 m 이 개념 이름과 다름' % code)
        rd = e.get('reading')
        if rd is not None:
            for k, (lo, hi) in READ_LIM.items():
                v = rd.get(k, '')
                if not (lo <= len(v) <= hi) or '℃' in v or v.count('**') % 2:
                    errs.append('%s 읽을거리 %s (길이 %d · ℃ · 굵게 짝)' % (code, k, len(v)))
        forms = e['forms']
        own_n = [fm['n'] for fm in forms if 'n' in fm]
        want_n = [n for r in range(1, 11) for it, x in zip(rounds[r]['jeongsi']['items'], dz['blueprint'][str(r)])
                  if x['구획'] != '복습-재출제' and it['c'] == code for n in [it['n']]]
        if own_n != want_n:
            errs.append('%s 은행의 정시 문장 %s ≠ 회차 %s (--write)' % (code, own_n, want_n))
        fresh = [fm for fm in forms if 'n' not in fm]
        if len(fresh) < 3:
            errs.append('%s 확인 문장이 %d개뿐' % (code, len(fresh)))
        ax = collections.Counter(fm['a'] for fm in forms)
        if ax['O'] < 1 or ax['X'] < 1:
            errs.append('%s 은행에 O·X 가 다 있지 않음 %s' % (code, dict(ax)))
        for i, fm in enumerate(forms):
            tag = '%s#%d' % (code, i + 1)
            if fm.get('lvl') not in (1, 2, 3) or fm.get('a') not in ('O', 'X'):
                errs.append(tag + ' a·lvl')
            k = norm(fm['s'])
            if k in bseen:
                errs.append('%s 은행 문장 중복 %s' % (tag, bseen[k]))
            bseen[k] = tag
            if 'n' in fm:
                src = by_n.get(fm['n'])
                if not src or any(src[q] != fm[q] for q in ('a', 's', 'f', 'w', 'lvl')):
                    errs.append('%s 정시 %s 와 다름 (--write)' % (tag, fm['n']))
            elif 'from' in fm:
                orig = [x for x in ch1.get(fm['from'], {}).get('forms', []) if x['s'] == fm['s']]
                if not orig or any(orig[0][q] != fm[q] for q in ('a', 'f', 'w')):
                    errs.append('%s 화학1 %s 원문과 글자가 다름' % (tag, fm['from']))
                if fm['from'] not in cm.get(code, {}).get('ch1_equiv', []):
                    errs.append('%s from %s 가 ch1_equiv 밖' % (tag, fm['from']))
            else:
                errs += form_errs(tag, fm)
                if k in old:
                    errs.append(tag + ' 기존 화학1 문장과 같음(가져온 문장이면 from 을 단다)')
    # 읽을거리 — 한 개념이라도 있으면 전부 있어야 한다
    has_rd = [c for c, e in bank.items() if e.get('reading')]
    if has_rd and len(has_rd) != len(bank):
        errs.append('읽을거리가 %d/%d 개념에만 있다' % (len(has_rd), len(bank)))
    if has_rd:
        dp = load(DEEP) if os.path.exists(DEEP) else {}
        if sorted(dp) != sorted(bank):
            errs.append('deep_ch1s.json 개념 목록이 은행과 다름')
        for c, v in dp.items():
            if not (90 <= len(v) <= 200) or '℃' in v:
                errs.append('%s 한 겹 더 길이 %d · ℃' % (c, len(v)))
    # 재시
    for r in range(1, 11):
        rc = rounds[r].get('retakeC', [])
        if len(rc) != VERSIONS:
            errs.append('%d회 재시 판 수 %d' % (r, len(rc)))
            continue
        this_js = {norm(it['s']) for it in rounds[r]['jeongsi']['items']}
        for v in rc:
            its = v['items']
            if len(its) != 60:
                errs.append('%d회 재시 %d판 문항 수' % (r, v['v']))
            ks = [norm(x['s']) for x in its]
            if len(set(ks)) != len(ks):
                errs.append('%d회 재시 %d판 안에 같은 문장' % (r, v['v']))
            for x in its:
                if tuple(x) != RKEYS:
                    errs.append('%d회 재시 %d판 키' % (r, v['v']))
                    break
                if norm(x['s']) in this_js:
                    errs.append('%d회 재시 %d판에 정시 문장' % (r, v['v']))
                if not any(fm['s'] == x['s'] and fm['a'] == x['a'] for fm in bank.get(x['c'], {}).get('forms', [])):
                    errs.append('%d회 재시 %d판 문장이 은행 %s 에 없음 (--write)' % (r, v['v'], x['c']))
    return errs


def form_errs(tag, x):
    e = []
    s, f, w = x['s'], x['f'], x['w']
    if '℃' in s + f + w:
        e.append('%s ℃ 대신 °C' % tag)
    if x['a'] == 'O' and f != s:
        e.append('%s O 인데 f≠s' % tag)
    if x['a'] == 'X' and norm(f) == norm(s):
        e.append('%s X 인데 f==s' % tag)
    if not s.rstrip().endswith('다.') or not f.rstrip().endswith('다.'):
        e.append('%s 문장이 「다.」로 끝나지 않음' % tag)
    if not w.strip():
        e.append('%s 해설 없음' % tag)
    return e


def main():
    a = sys.argv[1:]
    if any(x in a for x in ('--write', '--stage-rounds', '--stage-forms', '--stage-reading')):
        dz = design()
        rounds = stage_rounds(dz) if '--stage-rounds' in a else load_rounds()
        if '--stage-forms' in a:
            bank = stage_forms(dz, rounds)
            old = load(BANK) if os.path.exists(BANK) else {}
            for c, e in bank.items():                      # 은행을 다시 들여도 읽을거리는 지킨다
                if old.get(c, {}).get('reading'):
                    e['reading'] = old[c]['reading']
        else:
            bank = load(BANK) if os.path.exists(BANK) else None
        if '--stage-reading' in a:
            stage_reading(bank)
        sync_review(dz, rounds)
        if bank is not None:
            sync_bank_own(dz, rounds, bank)
            build_retakes(dz, rounds, bank)
            write_all(rounds, bank)
        else:
            for r, doc in rounds.items():
                dump(round_path(r), doc)
            dump(LINK, build_link(dz))
        print('회차 파일 10개%s를 썼다.' % (' · 은행 · 재시 3판' if bank is not None else ''))
    errs = check()
    for e in errs[:80]:
        print('✗', e)
    if errs:
        sys.exit('%d건 어긋남' % len(errs))
    print('화학1 심화 회차 파일 10개 · 은행 · 재시 OK')


if __name__ == '__main__':
    main()
