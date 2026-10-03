# -*- coding: utf-8 -*-
"""design.json 을 읽고 쓴다. 줄 형식(회차·개념·칸 하나에 한 줄)을 지켜 diff 가 그 줄만 보이게 한다."""
import json
import os

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'design.json')


def load():
    with open(PATH, encoding='utf-8') as f:
        return json.load(f)


def dumps(d):
    j = lambda x: json.dumps(x, ensure_ascii=False)
    out = ['{']
    keys = list(d)
    for ki, k in enumerate(keys):
        v = d[k]
        tail = ',' if ki < len(keys) - 1 else ''
        if k in ('rounds', 'concepts'):
            out.append(' %s: [' % j(k))
            out += ['  %s%s' % (j(x), ',' if i < len(v) - 1 else '') for i, x in enumerate(v)]
            out.append(' ]' + tail)
        elif k == 'blueprint':
            out.append(' %s: {' % j(k))
            rs = list(v)
            for ri, r in enumerate(rs):
                out.append('  %s: [' % j(r))
                out += ['   %s%s' % (j(x), ',' if i < len(v[r]) - 1 else '') for i, x in enumerate(v[r])]
                out.append('  ]' + (',' if ri < len(rs) - 1 else ''))
            out.append(' }' + tail)
        else:
            out.append(' %s: %s%s' % (j(k), j(v), tail))
    out.append('}')
    return '\n'.join(out) + '\n'


def save(d):
    with open(PATH, 'w', encoding='utf-8') as f:
        f.write(dumps(d))
