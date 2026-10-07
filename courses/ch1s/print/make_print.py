# -*- coding: utf-8 -*-
"""화학1 심화 인쇄물 10회분 — 문제지(표지·주기율표·문제·OMR) · 해설지(빠른 정답·오개념 TOP5·해설·옳은문장집) · OMR.

  python3 courses/ch1s/print/make_print.py          # 10회 전부
  python3 courses/ch1s/print/make_print.py 3 4      # 몇 회만
  python3 courses/ch1s/print/check_print.py         # 그다음 인쇄 전 검사(0 이어야 통과)

틀은 화학1 12회(munje/haeseol_ch1_round12.html)의 머리(글꼴·색)를 쓰고, 그 위에 심화반 덧칠(CSS)을 얹는다.
몸은 회차 파일 appdata/round_ch1s_NN.json 에서 새로 짠다 — 시험 문장·정답·해설이 앱과 글자까지 같다.
문제지 표지와 주기율표 쪽은 원본 HTML 이 저장소에 없어 munje_ch1_round12.pdf 의 1·2쪽을 가져와
표지의 「제 N 회」·주제 줄·반 이름과 상호(화학 · 다원교육 · 조준모)만 바꿔 쓴다.
OMR 은 화학1 문제지 끝장 OMR 과 같은 모양(로고·머리 띠·검은 표기란 띠)으로 여기서 짠다.

결과: 저장소 루트의 munje_ch1s_roundNN.pdf · haeseol_ch1s_roundNN.pdf · omr_ch1s_roundNN.pdf
(앱·자료 화면이 다른 과목처럼 루트 PDF 를 읽는다. HTML 은 tools/_stage/ch1s/print/ 에 남긴다 —
루트의 munje_/haeseol_ HTML 은 화학1·2·일반화학 원본이라 해설 대조 도구가 그것만 본다.)
"""
import base64
import collections
import difflib
import html
import json
import os
import re
import subprocess
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
CH = os.path.dirname(HERE)
DT = os.path.dirname(os.path.dirname(CH))
STAGE = os.path.join(DT, 'tools', '_stage', 'ch1s', 'print')
TPL = 12
BRAND = '화학 · 다원교육 · 조준모'          # 상호 — 심화반 인쇄물은 모두 이것 하나
INST = ' 다음 문장에 대해 옳은 설명이면 O, 틀린 설명이면 X로 표시하시오.'
LOGO = os.path.join(CH, 'truthbook', 'logo.png')

# 틀(화학1 12회) 머리 위에 얹는 덧칠. 마지막 <style> 이라 앞의 것을 이긴다.
#  · Sym: 위·아래 첨자(ₗ ₛ ⁺ ⁻ ⁰ …)·⇌·−(U+2212)를 DejaVu Sans 로 — 없으면 Unifont 로 찍혀 ₗ 가 ₁ 처럼 보인다
#  · 한국어는 낱말 중간에서 줄을 바꾸지 않는다(keep-all), 너무 긴 덩이(화학식 등)만 아무 데서나 끊는다
#  · 흑백 인쇄 대비: 띠의 단원 표기 #555, 해설지 「옳은 문장」 줄은 검은 왼쪽 선 + 굵게
SYM = ('@font-face{font-family:Sym;src:local("DejaVu Sans"),local("DejaVuSans");unicode-range:U+2070-209F,U+21CC,U+2212}\n'
       '@font-face{font-family:Sym;font-weight:bold;src:local("DejaVu Sans Bold"),local("DejaVuSans-Bold");'
       'unicode-range:U+2070-209F,U+21CC,U+2212}\n')
CSS = SYM + """
body{font-family:Sym,"Noto Sans CJK KR","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;
  word-break:keep-all;overflow-wrap:anywhere}
.brand .lab{letter-spacing:.08em}
td.no,td.an,td.ox,.kc .n,.kc .a,.inst .sec,.secband .sec{white-space:nowrap;overflow-wrap:normal;word-break:normal}
.inst{break-after:avoid}
.inst .s{color:#555;font-size:8.6pt}
@media print{.inst .s{color:#555}}
td.bd .fix{color:#000;font-weight:600;border-left:2px solid #000;padding-left:2mm;margin-top:3px}
td.bd .fix b{color:#000}
td.bd .why{color:#444}
td.bd .why b{color:#000}
.stmt .chip{display:inline-block;border:1px solid #777;border-radius:2px;font-size:7.4pt;line-height:1.25;
  padding:0 4px;margin-right:5px;color:#333;vertical-align:1px;font-weight:600}
.stmt .lv{font-size:7.6pt;letter-spacing:.5px;margin-right:5px;color:#333;vertical-align:1px}
.stmt .wrong,.fix .right{font-weight:700;text-decoration:underline;text-decoration-thickness:1.2px;text-underline-offset:2px}
.stmt .wrong{text-decoration-style:wavy}
.secband{break-after:avoid}
.mistop{margin-top:12px;border:1.5px solid #222;border-radius:3px;padding:8px 11px 6px}
.mistop h3{margin:0 0 6px;font-size:10.5pt;font-weight:800;border-bottom:1px solid #999;padding-bottom:4px}
.mistop h3 small{font-size:8pt;font-weight:500;color:#555;margin-left:6px}
.mistop ol{list-style:none;margin:0;padding:0}
.mistop li{display:flex;gap:8px;padding:4px 0;border-bottom:1px dotted #bbb;font-size:9pt;line-height:1.38}
.mistop li:last-child{border-bottom:0}
.mistop .rk{flex:0 0 18px;height:18px;line-height:18px;text-align:center;border:1.2px solid #222;border-radius:50%;
  font-weight:800;font-size:8.6pt}
.mistop .nm{flex:0 0 31%;font-weight:700}
.mistop .nm small{display:block;font-weight:500;color:#555;font-size:7.6pt}
.mistop .ol{flex:1;color:#222}
.mistop .ol strong{font-weight:800}
"""


def esc(s):
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html.escape(s or '', quote=False))


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def head(tpl, title):
    h = tpl[:tpl.find('<body')]
    h = re.sub(r'<title>.*?</title>', '<title>%s</title>' % html.escape(title), h)
    return h.replace('</head>', '<style id="ch1s-print">%s</style></head>' % CSS)


def bands(r, dz):
    info = dz['rounds'][r - 1]
    new = ' · '.join(info['new_sections'])
    if r == 1:
        return [('신규 1–60', new, 0, 60)]
    rr = info['review_range'].split(' · 직전')[0]
    codes = re.findall(r'[ⅠⅡⅢⅣ]-\d', rr)
    rng = codes[0] if len(codes) == 1 else codes[0] + ' ~ ' + codes[-1]
    m = re.match(r'(\S+회)', rr)
    return [('누적 1–30', '이전 단원 복습 · %s (%s)' % (m.group(1), rng), 0, 30), ('신규 31–60', new, 30, 60)]


def brand(r, kind):
    return ('<div class="brand"><div><div class="lab">%s</div>\n'
            '<h1 class="tt">누적 OX 화학1 심화 %d회</h1></div>\n'
            '<div class="rt"><span class="kind">%s</span><br>화학1 심화반</div></div>' % (BRAND, r, kind))


def foot(r, kind):
    return '<div class="foot">%s · 누적 OX 화학1 심화 %d회 %s</div>' % (BRAND, r, kind)


def munje_html(r, items, dz):
    tpl = read(os.path.join(DT, 'munje_ch1_round%02d.html' % TPL))
    meta = tpl[tpl.find('<table class="meta">'):tpl.find('<div class="inst">')]
    body = [brand(r, '문제지'), meta]
    for i, (lab, sub, a, b) in enumerate(bands(r, dz)):
        rows = ''.join('<tr><td class="no">%d</td><td class="st">%s</td><td class="ox"><span class="m">O</span>'
                       '<span class="m">X</span></td></tr>' % (k + 1, esc(items[k]['s'])) for k in range(a, b))
        # 둘째 띠(신규 31–60)는 새 쪽에서 — 앞 쪽 맨 아래에 띠만 남지 않게
        brk = ' style="break-before:page"' if i else ''
        body.append('<div class="inst"%s><span class="sec">%s</span>%s<span class="s">%s</span></div>'
                    '<table class="q">%s</table>' % (brk, lab, INST, html.escape(sub), rows))
    body.append('\n' + foot(r, '문제지'))
    return head(tpl, '누적 OX 화학1 심화 %d회 문제지' % r) + '<body>\n' + ''.join(body) + '\n</body></html>\n'


# ───────── 해설지 ─────────
TOK = re.compile(r'\s+|[0-9]+(?:\.[0-9]+)?|[^\s0-9]+')


def mark_diff(s, f):
    """틀린 문장 s 와 옳은 문장 f 의 다른 낱말을 찾아 (s 쪽 HTML, f 쪽 HTML). 같은 부분은 그대로."""
    a, b = TOK.findall(s), TOK.findall(f)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    oa, ob = [], []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        ta, tb = html.escape(''.join(a[i1:i2]), quote=False), html.escape(''.join(b[j1:j2]), quote=False)
        if op == 'equal':
            oa.append(ta)
            ob.append(tb)
            continue
        oa.append('<span class="wrong">%s</span>' % ta if ta.strip() else ta)
        ob.append('<span class="right">%s</span>' % tb if tb.strip() else tb)
    return ''.join(oa), ''.join(ob)


def stars(lvl):
    return '★' * lvl + '☆' * (3 - lvl)


def mis_top(items, bank, n=5):
    """이번 회차 오개념 TOP5 — 회차 파일 mis(오개념 이름)를 문항 수 → 함정(X) 수 → 난이도 합 → 앞 번호 순으로.
    한 줄 정리는 그 개념의 은행 reading.oneline."""
    st = collections.OrderedDict()
    for k, it in enumerate(items):
        e = st.setdefault(it['mis'], {'c': it['c'], 'u': it['u'], 'n': 0, 'x': 0, 'lv': 0, 'nos': [], 'first': k})
        e['n'] += 1
        e['x'] += it['a'] == 'X'
        e['lv'] += it['lvl']
        e['nos'].append(k + 1)
    top = sorted(st.items(), key=lambda kv: (-kv[1]['n'], -kv[1]['x'], -kv[1]['lv'], kv[1]['first']))[:n]
    return [(name, e, bank.get(e['c'], {}).get('reading', {}).get('oneline', '')) for name, e in top]


def haeseol_html(r, items, dz, bank):
    tpl = read(os.path.join(DT, 'haeseol_ch1_round%02d.html' % TPL))
    meta = tpl[tpl.find('<table class="meta">'):tpl.find('<div class="qkwrap">')]
    order = [k for i in range(20) for k in (i, i + 20, i + 40)]
    keys = ''.join('<div class="kc %s"><span class="n">%d</span><span class="a">%s</span></div>'
                   % (items[k]['a'].lower(), k + 1, items[k]['a']) for k in order)
    nO = sum(1 for it in items if it['a'] == 'O')
    top = ''.join('<li><span class="rk">%d</span><span class="nm">%s<small>%s · %s번</small></span><span class="ol">%s</span></li>'
                  % (i + 1, html.escape(name), html.escape(e['u']), '·'.join(map(str, e['nos'])), esc(ol))
                  for i, (name, e, ol) in enumerate(mis_top(items, bank)))
    out = [brand(r, '해설지'), meta,
           '<div class="qkwrap"><div class="qktitle">빠른 정답 · 60문항 (세로 채점)</div><div class="qklegend">정답 분포 '
           'O %d개 · X %d개 · 통과 기준 48문항(80점) · OMR과 같은 세로 배열</div><div class="key">%s</div></div>'
           % (nO, 60 - nO, keys),
           '<div class="mistop"><h3>이번 회차 오개념 TOP5 · 한 줄 정리<small>문항이 많이 걸린 오개념부터 · 번호는 문항</small></h3>'
           '<ol>%s</ol></div>' % top,
           '<div class="hdetail">']
    for lab, sub, a, b in bands(r, dz):
        rows = []
        for k in range(a, b):
            it = items[k]
            pre = '<span class="chip">%s</span><span class="lv" title="난이도">%s</span>' % (html.escape(it['u']), stars(it['lvl']))
            if it['a'] == 'X':
                s_html, f_html = mark_diff(it['s'], it['f'])
                fix = '<div class="fix"><b>옳은 문장</b> · %s</div>' % f_html
            else:
                s_html, fix = esc(it['s']), ''
            rows.append('<tr><td class="no">%d</td><td class="an %s">%s</td><td class="bd"><div class="stmt">%s%s</div>'
                        '%s<div class="why"><b>해설</b> · %s</div></td></tr>'
                        % (k + 1, it['a'].lower(), it['a'], pre, s_html, fix, esc(it['w'])))
        # 두 띠를 이어 흘린다 — 띠 앞에서 쪽을 강제로 넘기면 앞 띠의 마지막 한 문항만 한 쪽에 남는 일이 생긴다
        out.append('<div class="secband"><span class="sec">%s</span>%s</div><table class="h">%s</table>'
                   % (lab, html.escape(sub), ''.join(rows)))
    out.append('</div>')
    groups, order_u = {}, []
    for k, it in enumerate(items):
        u = it['u']
        if u not in groups:
            groups[u] = []
            order_u.append(u)
        body = esc(it['s'] if it['a'] == 'O' else it['f'])
        mark = '' if it['a'] == 'O' else '<span class="src">[교정]</span>'
        groups[u].append('<li><span class="n">%d</span>%s%s</li>' % (k + 1, body, mark))
    out.append('<div class="sukjepage"><div class="sukjehead">숙제 · 옳은문장집</div><div class="lead">아래 문장은 이번 '
               '회차의 <b>옳은 문장</b> 60개입니다. 시험에서 틀렸던 문장은 <b>옳게 고친 형태</b>로 실려 있습니다([교정] '
               '표시). 문장을 모두 옳은 진술로 익힌 뒤 재시험에 응시하세요.</div>%s</div>'
               % ''.join('<div class="ugroup"><div class="uhead">%s</div><ul class="s">%s</ul></div>'
                         % (html.escape(u), ''.join(groups[u])) for u in order_u))
    out.append('\n' + foot(r, '해설지'))
    return head(tpl, '누적 OX 화학1 심화 %d회 해설지' % r) + '<body>\n' + ''.join(out) + '\n</body></html>\n'


# ───────── OMR ─────────
OMR_CSS = SYM + """
@page{size:A4;margin:12mm 13mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Sym,"Noto Sans CJK KR",sans-serif;color:#111;word-break:keep-all;overflow-wrap:anywhere}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.2px solid #222;padding-bottom:3mm}
.top img{height:9mm}
.top .rt{text-align:right}
.top .rt b{display:block;font-size:10.5pt;letter-spacing:.12em;font-weight:800}
.top .rt span{font-size:7.4pt;color:#555;letter-spacing:.06em}
.ttl{display:flex;align-items:baseline;gap:4mm;margin:6mm 0 5mm}
.ttl .k{font-size:7.6pt;letter-spacing:.32em;color:#555;font-weight:700}
.ttl h1{margin:0;font-size:17pt;font-family:"Noto Serif CJK KR",serif;font-weight:800}
.id{display:grid;grid-template-columns:1.25fr 1.25fr .8fr .95fr;border:0.8pt solid #333;margin-bottom:6mm}
.id div{padding:2.6mm 3.5mm 4mm;border-left:0.8pt solid #333;font-size:8pt;font-weight:700}
.id div:first-child{border-left:0}
.id div i{display:block;border-bottom:0.6pt solid #777;height:6.5mm;font-style:normal}
.sheet{border:0.8pt solid #333}
.hd{display:flex;justify-content:space-between;align-items:center;background:#111;color:#fff;padding:2.6mm 4mm;
  font-size:9pt;font-weight:700}
.hd span{font-size:7.6pt;font-weight:500}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr}
.col{border-left:0.8pt solid #333;padding:1.5mm 0}
.col:first-child{border-left:0}
.r{height:8.5mm;display:flex;align-items:center;justify-content:center;gap:3mm}
.r.band{background:#efefef}
.r.cut{border-bottom:0.8pt solid #333}
.r .n{width:9mm;text-align:right;font-size:9.4pt;font-weight:800;padding-right:1mm;font-variant-numeric:tabular-nums}
.r .b{width:6mm;height:4.5mm;border:0.8pt solid #333;border-radius:2.25mm;display:inline-flex;align-items:center;
  justify-content:center;font-size:6.6pt;color:#333;background:#fff}
.note{font-size:7.6pt;color:#333;margin-top:3mm}
.foot{text-align:center;font-size:7.6pt;color:#555;letter-spacing:.05em;margin-top:3mm}
"""


def omr_html(r):
    """화학1 문제지 끝장 OMR 과 같은 모양. 배치는 세로 3단(1–20 · 21–40 · 41–60), 채점기 입력 순서는 1→60.
    줄 간격 8.5mm · 칸 6×4.5mm · 테두리 #333 0.8pt · 5문항마다 구분선 · 10문항 단위 바탕 띠."""
    logo = 'data:image/png;base64,' + base64.b64encode(open(LOGO, 'rb').read()).decode()
    cols = []
    for c in range(3):
        rows = []
        for i in range(20):
            cls = ['r'] + (['band'] if (i // 10) % 2 else []) + (['cut'] if i % 5 == 4 and i != 19 else [])
            rows.append('<div class="%s"><span class="n">%d</span><span class="b">O</span><span class="b">X</span></div>'
                        % (' '.join(cls), c * 20 + i + 1))
        cols.append('<div class="col">%s</div>' % ''.join(rows))
    title = '누적 OX 화학Ⅰ 심화 %d회' % r
    return ('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>%s OMR 답안지</title><style>%s</style></head><body>'
            '<div class="top"><img src="%s" alt="다원교육"><div class="rt"><b>%s</b><span>화학1 심화 %d회 · OMR 답안지</span></div></div>'
            '<div class="ttl"><span class="k">OMR 답안지</span><h1>화학Ⅰ 심화 %d회</h1></div>'
            '<div class="id"><div>소속 학교<i></i></div><div>성명<i></i></div><div>학년<i></i></div><div>날짜<i></i></div></div>'
            '<div class="sheet"><div class="hd">답안 표기란<span>해당 칸을 진하게 칠하시오 · O 또는 X</span></div>'
            '<div class="grid">%s</div></div>'
            '<div class="note">정정 시 수정테이프 사용 · 한 문항에 하나만 표기 · 미표기 및 중복표기는 0점 처리</div>'
            '<div class="foot">%s · %s OMR 답안지</div></body></html>\n'
            % (html.escape(title), OMR_CSS, logo, html.escape(BRAND), r, r, ''.join(cols), html.escape(BRAND), html.escape(title)))


# ───────── 표지 · 주기율표 ─────────
# 바꿔 넣는 글: (쪽, 글, 크기 pt, 글자 바닥선 y pt, 굵게, 색, 놓는 법('c' 가운데 · ('x', 왼쪽 x) · ('r', 오른쪽 x)), 자간 pt)
def cover_texts(r, dz):
    info = dz['rounds'][r - 1]
    ink, grey = '#131313', '#6b6b70'
    return [(0, '제 %d 회' % r, 15, 436, True, ink, 'c', 4), (0, info['title'], 11.5, 465, True, ink, 'c', 0),
            (0, '화학1 심화반', 7.6, 788, False, ink, ('x', 73), 0), (0, '심화', 20, 374, True, ink, ('x', 388), 0),
            (0, BRAND, 10, 73, True, ink, ('r', 529), 1.2), (0, '화학 Ⅰ  심화반', 8.6, 262, False, grey, 'c', 3),
            (0, BRAND, 7.6, 788, False, ink, ('r', 530), 0),
            (1, BRAND, 9, 60, True, ink, ('r', 564), 1), (1, '참고용 주기율표', 7.6, 128, False, grey, ('r', 564), 0),
            (1, BRAND, 6.9, 802, False, grey, ('r', 564), 0)]


def overlay_html(texts, page):
    """표지 위에 얹을 글만 있는 투명한 A4 쪽(크롬이 글꼴을 쓴 글자만 넣는다 — 큰 CJK 글꼴을 통째로 넣지 않는다)."""
    divs = []
    for pg, t, size, y, bold, color, pos, sp in texts:
        if pg != page:
            continue
        top = y - size * 0.88
        if pos == 'c':
            where = 'left:0;right:0;text-align:center'
        elif pos[0] == 'x':
            where = 'left:%.1fpt' % pos[1]
        else:
            where = 'right:%.1fpt' % (595.92 - pos[1])
        divs.append('<div style="position:absolute;top:%.1fpt;%s;font-size:%.1fpt;line-height:1;font-weight:%s;color:%s;'
                    'letter-spacing:%.1fpt;white-space:nowrap">%s</div>' % (top, where, size, 800 if bold else 400, color, sp,
                                                                            html.escape(t)))
    return ('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>표지 덧글</title><style>@page{size:595.92pt 842.88pt;margin:0}'
            'html,body{margin:0;background:transparent}body{position:relative;width:595.92pt;height:842.88pt;'
            'font-family:"Noto Sans CJK KR",sans-serif}</style></head><body><h1 hidden>문제지 표지 덧글</h1>%s</body></html>\n' % ''.join(divs))


def cover(r, dz):
    """munje_ch1_round12.pdf 1·2쪽(표지 · 주기율표)을 가져와 표지의 회차·주제·반 이름·상호를 지우고,
    overlay_html 로 찍은 글을 그 위에 얹는다."""
    src = pymupdf.open(os.path.join(DT, 'munje_ch1_round%02d.pdf' % TPL))
    doc = pymupdf.open()
    doc.insert_pdf(src, from_page=0, to_page=1)
    p, q = doc[0], doc[1]
    # 표지: 회차 · 주제 · 반 이름 · 오른쪽 위 상호(CHEMISTREAL/올림피아드 화학) · 가운데 CHEMISTRY OLYMPIAD · 오른쪽 아래 상호
    for z in ((240, 418, 356, 442), (110, 451, 486, 470), (70, 777, 200, 791),
              (398, 58, 532, 88), (205, 250, 386, 266), (380, 777, 534, 792)):
        p.add_redact_annot(pymupdf.Rect(*z), fill=False)
    p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    # 주기율표 쪽: 오른쪽 위 상호 · KMChC · 바닥글 상호
    for z in ((456, 44, 566, 72), (470, 118, 566, 130), (430, 792, 566, 804)):
        q.add_redact_annot(pymupdf.Rect(*z), fill=False)
    q.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    for i, pg in enumerate((p, q)):
        ov = pymupdf.open(os.path.join(STAGE, 'cover%d_ch1s_round%02d.pdf' % (i, r)))
        pg.show_pdf_page(pg.rect, ov, 0)
    return doc


def pdf(files):
    js = os.path.join(HERE, 'pdf.js')
    env = dict(os.environ, NODE_PATH=os.environ.get('NODE_PATH', '/opt/node22/lib/node_modules'))
    subprocess.run(['node', js] + files, check=True, env=env)


def meta(doc, title):
    doc.set_metadata({'title': title, 'author': BRAND, 'subject': '누적 OX 화학1 심화',
                      'creator': 'courses/ch1s/print/make_print.py'})


def main():
    rounds = [int(x) for x in sys.argv[1:]] or list(range(1, 11))
    dz = json.load(open(os.path.join(CH, 'design.json'), encoding='utf-8'))
    bank = json.load(open(os.path.join(CH, 'forms_bank_ch1s.json'), encoding='utf-8'))
    os.makedirs(STAGE, exist_ok=True)
    made = []
    for r in rounds:
        items = json.load(open(os.path.join(DT, 'appdata', 'round_ch1s_%02d.json' % r), encoding='utf-8'))['jeongsi']['items']
        texts = cover_texts(r, dz)
        for name, txt in (('munje', munje_html(r, items, dz)), ('haeseol', haeseol_html(r, items, dz, bank)), ('omr', omr_html(r)),
                          ('cover0', overlay_html(texts, 0)), ('cover1', overlay_html(texts, 1))):
            p = os.path.join(STAGE, '%s_ch1s_round%02d.html' % (name, r))
            with open(p, 'w', encoding='utf-8') as f:
                f.write(txt)
            made.append(p)
    pdf(made)
    for r in rounds:
        g = lambda n: pymupdf.open(os.path.join(STAGE, '%s_ch1s_round%02d.pdf' % (n, r)))
        doc = cover(r, dz)
        doc.insert_pdf(g('munje'))
        doc.insert_pdf(g('omr'))
        meta(doc, '누적 OX 화학1 심화 %d회 문제지' % r)
        doc.save(os.path.join(DT, 'munje_ch1s_round%02d.pdf' % r), garbage=4, deflate=True)
        h = g('haeseol')
        meta(h, '누적 OX 화학1 심화 %d회 해설지' % r)
        h.save(os.path.join(DT, 'haeseol_ch1s_round%02d.pdf' % r), garbage=4, deflate=True)
        o = g('omr')
        meta(o, '누적 OX 화학1 심화 %d회 OMR 답안지' % r)
        o.save(os.path.join(DT, 'omr_ch1s_round%02d.pdf' % r), garbage=4, deflate=True)
        print('%d회 문제지 %d쪽 · 해설지 %d쪽 · OMR %d쪽' % (r, doc.page_count, h.page_count, o.page_count))


if __name__ == '__main__':
    main()
