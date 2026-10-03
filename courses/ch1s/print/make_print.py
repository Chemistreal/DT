# -*- coding: utf-8 -*-
"""화학1 심화 인쇄물 10회분 — 문제지(표지·주기율표·문제·OMR) · 해설지(빠른 정답·해설·옳은문장집).

  python3 courses/ch1s/print/make_print.py          # 10회 전부
  python3 courses/ch1s/print/make_print.py 3 4      # 몇 회만

틀은 화학1 12회(munje/haeseol/omr_ch1_round12.html)의 머리(글꼴·색)를 그대로 쓰고, 몸은 회차 파일
courses/ch1s/round_ch1s_NN.json 에서 새로 짠다 — 시험 문장·정답·해설이 앱과 글자까지 같다.
문제지 표지와 주기율표 쪽은 원본 HTML 이 저장소에 없어 munje_ch1_round12.pdf 의 1·2쪽을 가져와
표지의 「제 N 회」와 주제 줄만 바꿔 쓴다.

결과: courses/ch1s/print/munje_ch1s_roundNN.pdf · haeseol_ch1s_roundNN.pdf · omr_ch1s_roundNN.pdf
(HTML 은 tools/_stage/ch1s/print/ 에 남긴다 — 저장소 루트에 두면 화학1·2 전용 검사 도구들이 이 과목의
회차 파일을 appdata 에서 찾다가 멈춘다. 앱에 거는 일은 7단계.)
"""
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
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
TPL = 12
INST = ' 다음 문장에 대해 옳은 설명이면 O, 틀린 설명이면 X로 표시하시오.'


def esc(s):
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html.escape(s or '', quote=False))


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def head(tpl, title):
    h = tpl[:tpl.find('<body')]
    return re.sub(r'<title>.*?</title>', '<title>%s</title>' % html.escape(title), h)


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
    return ('<div class="brand"><div><div class="lab">CHEMISTREAL · JMChC</div>\n'
            '<h1 class="tt">누적 OX 화학1 심화 %d회</h1></div>\n'
            '<div class="rt"><span class="kind">%s</span><br>화학1 심화반</div></div>' % (r, kind))


def foot(r, kind):
    return '<div class="foot">CHEMISTREAL · 조준모 화학 올림피아드 · 누적 OX 화학1 심화 %d회 %s</div>' % (r, kind)


def munje_html(r, items, dz):
    tpl = read(os.path.join(DT, 'munje_ch1_round%02d.html' % TPL))
    meta = tpl[tpl.find('<table class="meta">'):tpl.find('<div class="inst">')]
    body = [brand(r, '문제지'), meta]
    for lab, sub, a, b in bands(r, dz):
        rows = ''.join('<tr><td class="no">%d</td><td class="st">%s</td><td class="ox"><span class="m">O</span>'
                       '<span class="m">X</span></td></tr>' % (k + 1, esc(items[k]['s'])) for k in range(a, b))
        body.append('<div class="inst"><span class="sec">%s</span>%s<span class="s">%s</span></div>'
                    '<table class="q">%s</table>' % (lab, INST, html.escape(sub), rows))
    body.append('\n' + foot(r, '문제지'))
    return head(tpl, '누적 OX 화학1 심화 %d회 문제지' % r) + '<body>\n' + ''.join(body) + '\n</body></html>\n'


def haeseol_html(r, items, dz):
    tpl = read(os.path.join(DT, 'haeseol_ch1_round%02d.html' % TPL))
    meta = tpl[tpl.find('<table class="meta">'):tpl.find('<div class="qkwrap">')]
    order = [k for i in range(20) for k in (i, i + 20, i + 40)]
    keys = ''.join('<div class="kc %s"><span class="n">%d</span><span class="a">%s</span></div>'
                   % (items[k]['a'].lower(), k + 1, items[k]['a']) for k in order)
    nO = sum(1 for it in items if it['a'] == 'O')
    out = [brand(r, '해설지'), meta,
           '<div class="qkwrap"><div class="qktitle">빠른 정답 · 60문항 (세로 채점)</div><div class="qklegend">정답 분포 '
           'O %d개 · X %d개 · 통과 기준 48문항(80점) · OMR과 같은 세로 배열</div><div class="key">%s</div></div>'
           % (nO, 60 - nO, keys), '<div class="hdetail">']
    for i, (lab, sub, a, b) in enumerate(bands(r, dz)):
        rows = []
        for k in range(a, b):
            it = items[k]
            fix = '<div class="fix"><b>옳은 문장</b> · %s</div>' % esc(it['f']) if it['a'] == 'X' else ''
            rows.append('<tr><td class="no">%d</td><td class="an %s">%s</td><td class="bd"><div class="stmt">%s</div>'
                        '%s<div class="why"><b>해설</b> · %s</div></td></tr>'
                        % (k + 1, it['a'].lower(), it['a'], esc(it['s']), fix, esc(it['w'])))
        brk = ' style="break-before:page;"' if i else ''
        out.append('<div class="secband"%s><span class="sec">%s</span>%s</div><table class="h">%s</table>'
                   % (brk, lab, html.escape(sub), ''.join(rows)))
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


def omr_html(r):
    t = read(os.path.join(DT, 'omr_ch1_round%02d.html' % TPL))
    return t.replace('누적 OX 화학1 %d회' % TPL, '누적 OX 화학1 심화 %d회' % r)


def cover(r, dz):
    """munje_ch1_round12.pdf 1·2쪽(표지 · 주기율표)을 가져와 표지의 회차·주제·반 이름만 바꾼다."""
    src = pymupdf.open(os.path.join(DT, 'munje_ch1_round%02d.pdf' % TPL))
    doc = pymupdf.open()
    doc.insert_pdf(src, from_page=0, to_page=1)
    p = doc[0]
    zones = {'round': pymupdf.Rect(240, 418, 356, 442), 'topic': pymupdf.Rect(110, 451, 486, 470),
             'cls': pymupdf.Rect(70, 777, 200, 791)}
    for z in zones.values():
        p.add_redact_annot(z, fill=False)
    p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    font = pymupdf.Font(fontfile=FONT)
    W = p.rect.width

    def put(text, size, y, color=(0.075, 0.075, 0.075), x=None, spacing=0):
        tw = pymupdf.TextWriter(p.rect, color=color)
        w = font.text_length(text, fontsize=size) + spacing * max(0, len(text) - 1)
        x0 = (W - w) / 2 if x is None else x
        if spacing:
            for ch in text:
                tw.append((x0, y), ch, font=font, fontsize=size)
                x0 += font.text_length(ch, fontsize=size) + spacing
        else:
            tw.append((x0, y), text, font=font, fontsize=size)
        tw.write_text(p)

    info = dz['rounds'][r - 1]
    put('제 %d 회' % r, 15, 436, spacing=4)
    put(info['title'], 11.5, 465)
    put('화학1 심화반', 7.6, 788, x=73)
    put('심화', 20, 374, x=388)
    return doc


def pdf(files):
    js = os.path.join(HERE, 'pdf.js')
    env = dict(os.environ, NODE_PATH=os.environ.get('NODE_PATH', '/opt/node22/lib/node_modules'))
    subprocess.run(['node', js] + files, check=True, env=env)


def main():
    rounds = [int(x) for x in sys.argv[1:]] or list(range(1, 11))
    dz = json.load(open(os.path.join(CH, 'design.json'), encoding='utf-8'))
    os.makedirs(STAGE, exist_ok=True)
    made = []
    for r in rounds:
        items = json.load(open(os.path.join(CH, 'round_ch1s_%02d.json' % r), encoding='utf-8'))['jeongsi']['items']
        for name, txt in (('munje', munje_html(r, items, dz)), ('haeseol', haeseol_html(r, items, dz)), ('omr', omr_html(r))):
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
        doc.subset_fonts()        # 표지에 넣은 한글 글꼴을 쓴 글자만 남긴다(통째로 넣으면 권마다 6.5MB 가 붙는다)
        doc.save(os.path.join(HERE, 'munje_ch1s_round%02d.pdf' % r), garbage=4, deflate=True)
        g('haeseol').save(os.path.join(HERE, 'haeseol_ch1s_round%02d.pdf' % r), garbage=4, deflate=True)
        g('omr').save(os.path.join(HERE, 'omr_ch1s_round%02d.pdf' % r), garbage=4, deflate=True)
        print('%d회 문제지 %d쪽 · 해설지 %d쪽' % (r, doc.page_count, g('haeseol').page_count))


if __name__ == '__main__':
    main()
