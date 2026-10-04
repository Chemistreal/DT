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
.sec { break-after: avoid; page-break-after: avoid; font-size: 12pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 2px solid #3d5a45; -webkit-text-stroke: .3px currentColor; }
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


ROUND_MAP = [  # 화학1 18회 한눈에 보기 — 회차 · 주제 · 핵심 한 줄
    (1, '인류 문명과 화학', '원소는 성분, 원자는 가장 작은 입자, 분자는 성질을 지닌 가장 작은 단위다.'),
    (2, '몰과 기체(PV = nRT)', '1몰 = 6.02×10²³개, 1몰의 질량(g) = 화학식량. 기체는 PV = nRT로 압력·부피·온도·몰수가 이어진다.'),
    (3, '화학 반응식과 양적 관계', '계수비 = 몰비(= 같은 조건 기체의 부피비). 질량비가 아니다.'),
    (4, '원자의 구성 입자', '원자 번호 = 양성자 수, 질량수 = 양성자 + 중성자. 동위원소는 질량만 다르다.'),
    (5, '보어 모형', '전자의 에너지는 계단처럼 불연속이고, 준위 사이를 옮길 때 빛을 흡수·방출한다.'),
    (6, '오비탈', '전자는 정해진 궤도가 아니라 확률 분포(오비탈)로 나타낸다.'),
    (7, '전기음성도와 주기성', '같은 주기 오른쪽으로 갈수록 유효 핵전하가 커져 반지름은 작아지고, 이온화 에너지·전기음성도는 대체로 커진다.'),
    (8, '화학 결합', '이온 결합·공유 결합·금속 결합은 전자를 주고받는지, 나누는지, 바다처럼 공유하는지로 갈린다.'),
    (9, '분자의 모양', '중심 원자 둘레 전자쌍이 서로 가장 멀어지도록 배열해 모양이 정해진다. 모양이 대칭이면 극성 결합이 있어도 무극성 분자다.'),
    (10, '혼성 오비탈', '중심 원자의 전자쌍 수에 따라 sp(직선)·sp²(평면 삼각형)·sp³(사면체) 혼성 오비탈을 만든다.'),
    (11, '엔탈피', '발열은 ΔH < 0(주변이 따뜻해짐), 흡열은 ΔH > 0(주변이 차가워짐).'),
    (12, '평형 상수', '평형은 멈춘 것이 아니라 정·역반응이 같은 속도로 계속되는 상태다. K는 온도에서만 바뀐다.'),
    (13, '르샤틀리에 원리', '평형은 가해진 변화를 줄이는 쪽으로 이동한다. 촉매는 평형의 위치를 바꾸지 않는다.'),
    (14, '용해 평형', '증발 = 응축이면 동적 평형. 외부 압력이 낮으면 더 낮은 온도에서 끓는다.'),
    (15, '용액의 농도', '몰농도 = 용질의 몰수 ÷ 용액의 부피(L). 묽혀도 용질의 몰수는 그대로다.'),
    (16, '산·염기와 pH', '[H⁺][OH⁻] = Kw. pH가 1 작아지면 [H⁺]는 10배다.'),
    (17, '중화 반응', '실제 반응은 H⁺ + OH⁻ → H₂O. 나머지 이온은 구경꾼이고, 중화는 발열이다.'),
    (18, '전 범위 정리', '질량 백분율 → 몰수 비 → 실험식 → 분자량으로 분자식. 모든 계산은 몰에서 만난다.'),
]

REMEDY = [  # 어려웠던 점 10문항과 같은 순서 — 「이렇게 해 보세요」
    '계산은 「주어진 것 → 몰 → 구할 것」 세 칸을 먼저 적고 단위를 끝까지 붙여 쓴다. 단위가 맞으면 식도 맞는다.',
    '그래프는 축 이름과 단위부터 읽고, 기울기·꺾이는 점·평평한 구간이 각각 무엇을 뜻하는지 한 줄씩 적는다.',
    '헷갈리는 두 개념은 표 한 장에 나란히 놓고 «같은 점 / 다른 점 / 구별 질문 하나»를 적어 둔다.',
    '용어는 정의 한 문장과 예 하나를 짝으로 외운다. 매주 선수노트의 굵은 글씨만 소리 내 읽어도 효과가 크다.',
    '문장의 주어·조건(같은 온도에서, 1기압에서)에 밑줄을 긋고 판정한다. 마지막 서술어까지 읽기 전에는 답하지 않는다.',
    '「항상·모든·반드시」가 보이면 반례 하나를 떠올려 본다. 떠오르면 틀린 문장, 끝까지 없으면 맞는 문장이다.',
    '앞 단원은 짧게 자주 꺼내 보는 것이 가장 오래 남는다(간격 반복). 일주일에 한 번, 지난 회차 옳은문장집 1쪽씩.',
    '시간이 부족하면 확실한 것부터 빠르게 표시하고 계산 문항은 뒤로 돌린다. 연습 때 문항당 시간을 재 본다.',
    '보이지 않는 것은 그림으로 그린다. 오비탈·전자 배치는 직접 그려 보는 사람이 가장 빨리 익숙해진다.',
    '여러 조건을 따질 때는 «무엇이 바뀌었나 → 평형은 그 변화를 줄이는 쪽 → 그래서 무엇이 늘고 주나» 순서로 적는다.',
]

TIPS = {
    'habit': ['시험 전 선수노트 한 번, 시험 뒤 해설지 한 번 — 두 번만 읽어도 기억이 크게 달라진다.',
              '틀린 문장은 옳은 문장으로 고쳐 다시 적을 때 가장 잘 고쳐진다. 원래 틀린 문장을 외우지 않는다.',
              '공식보다 「왜」를 한 줄로 설명해 보는 것이 가장 강한 공부다. 친구에게 설명할 수 있으면 아는 것이다.'],
    'attitude': ['틀리는 것은 배우는 과정의 일부다. 특히 확신했는데 틀린 문항은 고친 뒤에 가장 오래 기억에 남는다.',
                 '부담이 클 때는 점수보다 «이번 주에 새로 알게 된 것 하나»를 적어 본다.'],
    'next': ['다음 과정은 화학1 위에 쌓인다. 몰·반응식·주기성·결합·평형·pH 여섯 줄기가 단단하면 충분하다.',
             '약한 개념을 아는 것 자체가 큰 힘이다. 그 개념의 옳은 문장 세 개를 적어 두고 일주일 뒤 다시 꺼내 본다.'],
}


def notes(d):
    fb = json.load(open(os.path.join(DT, 'appdata', 'forms_bank.json'), encoding='utf-8'))
    rd = lambda c: fb.get(c, {}).get('reading') or {}
    items = list(enumerate(d['items'], 1))
    bel = [(n, x) for n, x in items if x['type'] == 'belief']
    con = [(n, x) for n, x in items if x['type'] == 'concept']
    dif = [(n, x) for n, x in items if x['type'] == 'exp' and x['group'] == 'difficulty']
    b = ''.join(
        '<div class="card"><div class="ch"><span class="n">%d</span><span class="q">%s</span>%s</div>'
        '<div class="ans"><b>%s</b> · %s</div><div class="why"><span class="lb">왜 헷갈릴까</span>%s</div>'
        '<div class="core"><span class="lb">핵심</span>%s</div></div>'
        % (n, html.escape(x['s']), '' if x['mis'] else '<span class="tag">맞는 생각</span>',
           '실제로는' if x['mis'] else '그렇다',
           md(x['truth'] if x['mis'] else re.sub(r'^맞는 생각이다\.\s*', '', x['truth'])),
           md(rd(x['codes'][0]).get('kill', '')), md(rd(x['codes'][0]).get('core', '')))
        for n, x in bel)
    c = ''.join(
        '<div class="card"><div class="ch"><span class="n">%d</span><b class="lab">%s</b><span class="r">%d회</span></div>'
        '<div class="core"><span class="lb">개념 정리</span>%s</div><div class="why"><span class="lb">흔한 오해</span>%s</div>'
        '<div class="one">%s</div></div>'
        % (n, html.escape(x['label']), x['r'], md(rd(x['codes'][0]).get('core', '')),
           md(rd(x['codes'][0]).get('kill', '')), md(x['note']))
        for n, x in con)
    r = ''.join('<tr><td class="rn">%d회</td><td class="rt">%s</td><td>%s</td></tr>' % (k, html.escape(tt), md(s))
                for k, tt, s in ROUND_MAP)
    dd = ''.join('<div class="it"><span class="n">%d</span><span class="q">%s</span><span class="t"><b>이렇게 해 보세요</b> · %s</span></div>'
                 % (n, html.escape(x['s']), html.escape(REMEDY[i])) for i, (n, x) in enumerate(dif))
    tips = ''.join('<div class="tipbox"><div class="tt">%s</div><ul>%s</ul></div>'
                   % (name, ''.join('<li>%s</li>' % html.escape(s) for s in TIPS[g]))
                   for g, name in (('habit', '공부 습관'), ('attitude', '마음과 태도'), ('next', '다음 과정 준비')))
    css = CSS + NOTE_CSS
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>%s 정리 노트</title><style>%s</style></head><body>'
            '<div class="kick">정 리 노 트 · 해 설</div><h1>%s · 정리 노트</h1>'
            '<div class="lead">설문에 나온 생각과 개념을 한 권에 모았어요. 「이런 느낌이 들었다」면 「실제로는」을, 자신 없던 개념은 「개념 정리」를 읽어 보세요. 마지막 장은 어려웠던 점마다 바로 써먹을 공부 방법이에요.</div>'
            '<div class="sec">화학1 18회 한눈에 보기</div><table class="map">%s</table>'
            '<div class="sec pg">생각과 느낌 — 실제로는 이래요</div>%s'
            '<div class="sec pg">개념 정리 노트</div>%s'
            '<div class="sec pg">어려웠던 점 — 이렇게 해 보세요</div>%s'
            '<div class="keep"><div class="sec">공부 습관 · 마음 · 다음 과정</div><div class="tips">%s</div></div>'
            '<div class="foot">화학 · 다원교육 · 조준모</div></body></html>'
            % (d['title'], css, html.escape(d['title']), r, b, c, dd, tips))


NOTE_CSS = """
.pg { break-before: page; }
.card { border: 1px solid #dfe5dc; border-radius: 2mm; padding: 2.5mm 3.5mm; margin: 2.2mm 0; break-inside: avoid; }
.card .ch { display: flex; gap: 2.5mm; align-items: baseline; margin-bottom: 1mm; }
.card .n { color: #fff; background: #3d5a45; border-radius: 1mm; font-size: 8pt; font-weight: bold; padding: 0 1.5mm; }
.card .q { color: #333; }
.card .lab { font-size: 10.5pt; }
.card .r { margin-left: auto; font-size: 8pt; color: #7a857c; }
.card .ans { background: #eef3ec; border-radius: 1.2mm; padding: 1.5mm 2.5mm; margin: 1mm 0; }
.card .why, .card .core { font-size: 9.2pt; color: #333; margin-top: 1mm; }
.card .one { font-size: 9.2pt; margin-top: 1.2mm; padding-top: 1mm; border-top: 1px dashed #cfd8cc; }
.lb { display: inline-block; font-size: 7.5pt; font-weight: bold; color: #3d5a45; border: 1px solid #3d5a45; border-radius: 1mm; padding: 0 1.4mm; margin-right: 1.6mm; }
table.map td { padding: 1.6mm 1mm; font-size: 9.2pt; }
table.map td.rn { width: 12mm; color: #3d5a45; font-weight: bold; }
table.map td.rt { width: 42mm; font-weight: bold; }
.keep { break-inside: avoid; page-break-inside: avoid; }
.tips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; break-inside: avoid; }
.tipbox { border: 1px solid #dfe5dc; border-top: 3px solid #3d5a45; border-radius: 1.5mm; padding: 2mm 3mm; font-size: 9pt; }
.tipbox .tt { font-weight: bold; margin-bottom: 1mm; }
.tipbox ul { margin: 0; padding-left: 4mm; }
"""


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
