# -*- coding: utf-8 -*-
"""「화학1 돌아보기」 인쇄물 — 설문지(survey_ch1_form.pdf)와 정리 노트(survey_ch1_notes.pdf)를 루트에 만든다.
  python3 courses/survey/print_survey.py      (appdata/survey_ch1.json 에서 · 브라우저 필요)
설문지는 시험지처럼 보이지 않게: 번호·문장·다섯 칸 동그라미. 정리 노트는 설문 뒤에 나눠 주는 것 —
생각·느낌 문항의 「실제로는」과 개념 한 줄 정리."""
import html
import json
import os
import re
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DT = os.path.dirname(os.path.dirname(HERE))
STAGE = os.path.join(tempfile.gettempdir(), 'dt_survey_print')   # 저장소 밖 — 화면 검사 도구가 작업용 HTML 을 화면으로 세지 않게
PDFJS = os.path.join(DT, 'courses', 'ch1s', 'print', 'pdf.js')

CSS = """
@page { size: A4; margin: 14mm 13mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'DejaVu Sans', 'WenQuanYi Zen Hei', sans-serif; color: #1f2328; font-size: 10pt; line-height: 1.5; background: #fff; }
b, strong { font-weight: bold; -webkit-text-stroke: .3px currentColor; }
h1 { font-size: 20pt; margin: 0 0 2mm; -webkit-text-stroke: .5px currentColor; letter-spacing: .02em; }
.kick { font-size: 8pt; letter-spacing: .3em; color: #5b6b5e; }
.lead { color: #444; margin: 2mm 0 4mm; }
.who { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; margin: 3mm 0 4mm; }
.who div { border-bottom: 1px solid #555; padding: 1mm 0; font-size: 9pt; color: #555; }
.legend { display: flex; gap: 4mm; flex-wrap: wrap; background: #f1f4ef; border-radius: 2mm; padding: 2.5mm 4mm; font-size: 9pt; margin-bottom: 3mm; }
.legend span b { margin-right: 1mm; }
table { width: 100%; border-collapse: collapse; }
tr { break-inside: avoid; }
td { border-bottom: 1px solid #e3e6e1; padding: 2mm 1mm; vertical-align: middle; }
td.no { width: 9mm; color: #5b6b5e; font-weight: bold; font-size: 9pt; }
td.ox { width: 54mm; white-space: nowrap; text-align: right; }
.c { display: inline-block; width: 8.4mm; height: 8.4mm; border: 1.2px solid #7a857c; border-radius: 50%; margin-left: 1.6mm; text-align: center; line-height: 8mm; font-size: 8pt; color: #7a857c; }
.foot { margin-top: 5mm; text-align: center; color: #5b6b5e; font-size: 9pt; }
.sec { font-size: 12pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 2px solid #3d5a45; -webkit-text-stroke: .3px currentColor; }
.it { display: grid; grid-template-columns: 11mm 1fr; gap: 1mm 3mm; padding: 2mm 0; border-bottom: 1px solid #e3e6e1; break-inside: avoid; }
.it .n { color: #5b6b5e; font-weight: bold; font-size: 9pt; }
.it .q { color: #555; }
.it .t { grid-column: 2; }
.tag { display: inline-block; font-size: 7.5pt; border: 1px solid #3d5a45; color: #3d5a45; border-radius: 1mm; padding: 0 1.5mm; margin-right: 1.5mm; }
"""


def md(s):
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', html.escape(s or '', quote=False))


def form(d):
    sc = d['scale']
    legend = ''.join('<span><b>%d</b>%s</span>' % (i + 1, html.escape(s)) for i, s in enumerate(sc))
    rows = ''.join('<tr><td class="no">%d</td><td>%s</td><td class="ox">%s</td></tr>'
                   % (j + 1, html.escape(x['s']), ''.join('<span class="c">%d</span>' % (i + 1) for i in range(5)))
                   for j, x in enumerate(d['items']))
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>%s 설문지</title><style>%s</style></head><body>'
            '<div class="kick">설 문 지 · 100 문 항</div><h1>%s</h1><div class="lead">%s</div>'
            '<div class="who"><div>학교</div><div>이름</div><div>학년</div></div>'
            '<div class="legend">각 문장을 읽고 지금 나와 가장 가까운 번호를 <b>&nbsp;맨 뒤 응답지(OMR)</b>에 칠하세요. &nbsp;%s</div>'
            '<table>%s</table><div class="foot">수고했어요. 고른 답은 나의 공부를 돕는 데만 쓰여요.</div></body></html>'
            % (d['title'], CSS, html.escape(d['title']), html.escape(d['intro']), legend, rows))


def notes(d):
    bel = [(j + 1, x) for j, x in enumerate(d['items']) if x['type'] == 'belief']
    con = [(j + 1, x) for j, x in enumerate(d['items']) if x['type'] == 'concept']
    b = ''.join('<div class="it"><span class="n">%d</span><span class="q">%s</span><span class="t">%s%s</span></div>'
                % (n, html.escape(x['s']), '' if x['mis'] else '<span class="tag">맞는 생각</span>',
                   ('<b>실제로는</b> · ' + md(x['truth'])) if x['mis'] else md(re.sub(r'^맞는 생각이다\.\s*', '', x['truth'])))
                for n, x in bel)
    c = ''.join('<div class="it"><span class="n">%d</span><span><b>%s</b></span><span class="t">%s</span></div>'
                % (n, html.escape(x['label']), md(x['note'])) for n, x in con)
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>%s 정리 노트</title><style>%s</style></head><body>'
            '<div class="kick">정 리 노 트</div><h1>%s · 정리 노트</h1>'
            '<div class="lead">설문에 나온 생각과 개념을 한 장에 모았어요. 「이런 느낌이 들었다」면 아래 「실제로는」을 한 번 읽어 보세요.</div>'
            '<div class="sec">생각과 느낌 — 실제로는 이래요</div>%s'
            '<div class="sec">개념 한 줄 정리</div>%s</body></html>'
            % (d['title'], CSS, html.escape(d['title']), b, c))


def main():
    d = json.load(open(os.path.join(DT, 'appdata', 'survey_ch1.json'), encoding='utf-8'))
    os.makedirs(STAGE, exist_ok=True)
    files = []
    for name, txt in (('survey_ch1_form', form(d)), ('survey_ch1_notes', notes(d)), ('survey_ch1_omr', omr(d))):
        p = os.path.join(STAGE, name + '.html')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(txt)
        files.append(p)
    env = dict(os.environ, NODE_PATH=os.environ.get('NODE_PATH', '/opt/node22/lib/node_modules'))
    subprocess.run(['node', PDFJS] + files, check=True, env=env)
    for p in files:
        shutil.copy(p[:-5] + '.pdf', os.path.join(DT, os.path.basename(p)[:-5] + '.pdf'))
        print('→', os.path.basename(p)[:-5] + '.pdf')
    # 학생 인쇄용: DT 시험지처럼 설문지 끝에 OMR 응답지 한 장을 붙인다(선생님 결정 2026-10-04)
    import pymupdf
    form_pdf = os.path.join(DT, 'survey_ch1_form.pdf')
    doc = pymupdf.open(form_pdf)
    doc.insert_pdf(pymupdf.open(os.path.join(DT, 'survey_ch1_omr.pdf')))
    doc.save(form_pdf + '.tmp', garbage=4, deflate=True)
    os.replace(form_pdf + '.tmp', form_pdf)
    print('→ survey_ch1_form.pdf 끝에 OMR 응답지를 붙였다(%d쪽)' % doc.page_count)



OMR_CSS = """
@page { size: A4; margin: 10mm 10mm 9mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'DejaVu Sans', 'WenQuanYi Zen Hei', sans-serif; color: #1f2328; background: #fff; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #2f4a38; padding-bottom: 2mm; }
.top h1 { margin: 0; font-size: 17pt; -webkit-text-stroke: .4px currentColor; }
.top .k { font-size: 8pt; letter-spacing: .3em; color: #5b6b5e; }
.who { display: grid; grid-template-columns: 2fr 2fr 1fr; gap: 5mm; margin: 3mm 0 2.5mm; }
.who div { border: 1.2px solid #2f4a38; border-radius: 1.5mm; height: 10mm; padding: 1mm 2mm; font-size: 8pt; color: #2f4a38; font-weight: bold; }
.scale { display: flex; justify-content: center; gap: 5mm; background: #eef3ec; border-radius: 1.5mm; padding: 1.8mm; font-size: 9pt; margin-bottom: 2.5mm; }
.scale b { display: inline-block; width: 5mm; height: 5mm; border-radius: 50%; background: #2f4a38; color: #fff; text-align: center; line-height: 5mm; font-size: 7.5pt; margin-right: 1mm; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 4mm; }
.col { border: 1.4px solid #2f4a38; border-radius: 1.5mm; overflow: hidden; }
.hd { display: grid; grid-template-columns: 9mm repeat(5, 1fr); background: #2f4a38; color: #fff; font-size: 7.5pt; font-weight: bold; text-align: center; padding: 1mm 0; }
.r { display: grid; grid-template-columns: 9mm repeat(5, 1fr); align-items: center; height: 8.55mm; border-top: 1px solid #d4dbd2; }
.r.alt { background: #f1f5ef; }
.r.ten { border-top: 1.6px solid #2f4a38; }
.r .n { text-align: center; font-weight: bold; font-size: 9pt; color: #2f4a38; }
.r .b { justify-self: center; width: 6.2mm; height: 6.2mm; border: 1.3px solid #6c786e; border-radius: 50%; font-size: 7pt; color: #8a958c; text-align: center; line-height: 5.8mm; }
.foot { margin-top: 2mm; font-size: 8pt; color: #5b6b5e; display: flex; justify-content: space-between; }
"""


def omr(d):
    cols = []
    for c in range(4):
        rows = []
        for i in range(25):
            n = c * 25 + i + 1
            cls = 'r' + (' alt' if (i // 5) % 2 else '') + (' ten' if i and i % 10 == 0 else '')
            rows.append('<div class="%s"><span class="n">%d</span>%s</div>'
                        % (cls, n, ''.join('<span class="b">%d</span>' % (v + 1) for v in range(5))))
        cols.append('<div class="col"><div class="hd"><span>번호</span>%s</div>%s</div>'
                    % (''.join('<span>%d</span>' % (v + 1) for v in range(5)), ''.join(rows)))
    sc = ''.join('<span><b>%d</b>%s</span>' % (i + 1, html.escape(s)) for i, s in enumerate(d['scale']))
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>%s 응답지</title><style>%s</style></head><body>'
            '<div class="top"><div><div class="k">응 답 지 · O M R</div><h1>%s · 응답지</h1></div>'
            '<div style="font-size:8.5pt;color:#5b6b5e">설문지의 번호와 같은 줄에, 나와 가장 가까운 번호 하나를 진하게 칠하세요</div></div>'
            '<div class="who"><div>학교</div><div>이름</div><div>학년</div></div>'
            '<div class="scale">%s</div><div class="grid">%s</div>'
            '<div class="foot"><span>정답도 점수도 없어요 · 솔직하게</span><span>화학1 · 추가 회차 · 돌아보기</span></div></body></html>'
            % (d['title'], OMR_CSS, html.escape(d['title']), sc, ''.join(cols)))


if __name__ == '__main__':
    main()
