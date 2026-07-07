# -*- coding: utf-8 -*-
"""통합 번들 E2E: index/exam/report/hw_grader/roster/pending/admin (exec API 목킹)"""
import json, math, re, subprocess, sys, time, threading, http.server, functools, os

ROOT = '/home/claude/test_root'
PORT = 8777
BASE = f'http://localhost:{PORT}'
EXEC = 'https://script.google.com/macros/s/AKfycbzvFaPXgEgCBQ8HowtP8tPTtdiIVFtmZSUf0KFXUOVOh3ektrFMkz4KSR4I52LDBzB8rw/exec'
ADMIN = 'adm-secret-123'
SCODE = 'dw2026'
SALT = 'chemistreal::s4lt::9f3Kq2026'

def b36(n):
    d = '0123456789abcdefghijklmnopqrstuvwxyz'; s = ''
    if n == 0: return '0'
    while n: s = d[n % 36] + s; n //= 36
    return s
def to_int32(x):
    u = int(x) % (2**32); return u - 2**32 if u >= 2**31 else u
def tokenFor(base):
    s = str(base) + '|' + SALT; a = 2166136261; b = 5381
    for ch in s:
        c = ord(ch)
        a = to_int32(a) ^ c
        a = math.trunc(float(a) * 16777619.0) % (2**32)
        b = ((b * 33) ^ c) % (2**32)
    return (b36(a) + '00000')[:5] + (b36(b) + '000')[:3]

KEY = json.load(open('/home/claude/build/appdata/hw_jm1.json', encoding='utf-8'))['key']
R1 = ''.join(str(x) for x in KEY['1'])
R3 = ''.join(str(x) for x in KEY['3'])
JM1_R1 = list(R1); JM1_R1[4] = '1'; JM1_R1[11] = '2'; JM1_R1[19] = '5'; JM1_R1 = ''.join(JM1_R1)  # 오답 5,12,20

CH1 = json.load(open(ROOT + '/appdata/round_ch1_01.json', encoding='utf-8'))
AKEY = ''.join(i['a'] for i in CH1['jeongsi']['items'])
OXANS = ('O' if AKEY[0] == 'X' else 'X') + ('O' if AKEY[1] == 'X' else 'X') + ('O' if AKEY[2] == 'X' else 'X') + AKEY[3:]  # 1~3번 오답

SKEY = '휘문중-홍길동'; STOK = tokenFor(SKEY)

ROW_OX = {"name": "홍길동", "reportLink": "L", "date": "2026-07-05T01:00:00.000Z", "score": 95, "pass": True,
          "studentKey": SKEY, "school": "휘문중", "year": "2", "course": "ch1", "round": 1, "attempt": "정시",
          "wrongMis": ["원소·화합물 구분", "원자 구성 입자", "루이스 전자점식"], "wrongAxes": {}, "isTest": False,
          "units": [{"u": "물질의 규칙성", "t": 30, "w": 2}, {"u": "지각 구성 원소", "t": 30, "w": 1}], "axes": [], "answers": OXANS}
ROW_J1 = {"name": "홍길동", "reportLink": "L", "date": "2026-07-03T01:00:00.000Z", "score": 85, "pass": True,
          "studentKey": SKEY, "school": "휘문중", "year": "2", "course": "jm1", "round": 1, "attempt": "정시",
          "wrongMis": ["5", "12", "20"], "wrongAxes": {}, "isTest": True, "units": [], "axes": [], "answers": JM1_R1}
ROW_J3 = dict(ROW_J1, date="2026-07-04T01:00:00.000Z", score=100, round=3, wrongMis=[], answers=R3)

CUM_FULL = {"trend": [{"course": "ch1", "round": 1, "jeongsiScore": 95, "finalScore": 95, "attemptsCount": 1, "passed": True}],
            "chronicMis": [], "axisWeak": [], "passedRounds": 1, "coverageRound": 1}
CUM_HWONLY = {"trend": [{"course": "jm1", "round": 1, "jeongsiScore": 85, "finalScore": 85, "attemptsCount": 1, "passed": True},
                        {"course": "jm1", "round": 3, "jeongsiScore": 100, "finalScore": 100, "attemptsCount": 1, "passed": True}],
              "chronicMis": [], "axisWeak": [], "passedRounds": 2, "coverageRound": 3}
RANK = {"round": 1, "avg": 80, "score": 95, "per100": 12, "n": 8, "sd": 9, "dist": [0, 0, 0, 0, 0, 1, 2, 2, 2, 1]}

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

PASS = 0; FAIL = 0
def T(name, cond, extra=''):
    global PASS, FAIL
    if cond: PASS += 1; print('  ok  ' + name)
    else: FAIL += 1; print('  FAIL ' + name + ((' :: ' + str(extra)[:200]) if extra else ''))

def run():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        br = pw.chromium.launch()

        def newpage(admtok=None, stucode=None):
            ctx = br.new_context(viewport={'width': 1280, 'height': 900})
            init = "try{localStorage.clear();localStorage.setItem('dt_admgate','ok');"
            if admtok: init += f"localStorage.setItem('dt_admtok','{admtok}');"
            if stucode: init += f"localStorage.setItem('dt_stucode','{stucode}');"
            init += "}catch(e){}"
            ctx.add_init_script(init)
            pg = ctx.new_page()
            pg.route(re.compile(r'.*(jsdelivr|googleapis|gstatic)\..*'), lambda r: r.fulfill(status=200, body='', content_type='text/css'))
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            return ctx, pg, errs

        # ---------- [A] report 전체 (OX + jm1) ----------
        print('[A] report: OX + 숙제 패널 + 회귀')
        ctx, pg, errs = newpage()
        reqs = []
        def rep_route(route):
            u = route.request.url; reqs.append(u)
            route.fulfill(status=200, content_type='application/json',
                          body=json.dumps({"ok": True, "student": SKEY, "rows": [ROW_OX, ROW_J1, ROW_J3],
                                           "excluded": [], "cumulative": CUM_FULL, "rank": RANK, "cohort": None}))
        pg.route(EXEC + '*', rep_route)
        pg.goto(f'{BASE}/report.html?student={SKEY}-{STOK}', wait_until='networkidle')
        pg.wait_for_selector('.hwq', timeout=8000)
        T('요청에 토큰 포함', any(('student=' in u and STOK in u) for u in reqs))
        T('숙제 카드 렌더', pg.locator('.hwq').count() == 1)
        T('이번 주 제출 배지', pg.locator('.hwbadge.on').count() == 1)
        T('스트립 제출 2칸', pg.locator('.hwslot.done').count() == 2)
        pg.click('.hwqbtn')
        pg.wait_for_selector('.hwrndbtn', timeout=6000)
        tabs = pg.locator('.hwrndbtn').all_inner_texts()
        T('회차 탭 1회/3회', tabs == ['1회', '3회'], tabs)
        T('기본 탭=최신(3회) 전문항 정답', '전 문항 정답' in pg.locator('#hwdetail').inner_text())
        pg.click('.hwrndbtn >> nth=0')
        pg.wait_for_selector('.hwitem', timeout=6000)
        T('1회 오답 3건', pg.locator('.hwitem').count() == 3)
        det = pg.locator('#hwdetail').inner_text()
        T('정답/내답/전역/해설p 표기', ('정답 3' in det) and ('내 답' in det) and ('전역 5번' in det) and ('p.171' in det))
        HWM = json.load(open('/home/claude/build/appdata/hw_jm1.json', encoding='utf-8'))
        stems = [HWM['meta'][g]['stem'][:14] for g in ['5', '12', '20']]
        T('meta 렌더: 발문 3건(워크북 재파싱)', all(st and st in det for st in stems), (stems, det[:200]))
        try:
            pg.wait_for_function("document.querySelector('#main-sols') && document.querySelector('#main-sols').innerText.length>500", timeout=12000)
            T('메인 정오표(60문항) 부착', '60' in pg.locator('#main-sols').inner_text()[:4000])
        except Exception as e:
            T('메인 정오표(60문항) 부착', False, e)
        T('회귀: latestRows는 ch1만(같은 회차 jm1 오염 차단)',
          pg.evaluate("latestRows.length===1 && latestRows[0].course==='ch1' && latestRows[0].answers.length===60"))
        T('페이지 오류 없음', len(errs) == 0, errs[:2])
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(400)
        T('모바일 390px 가로 오버플로 없음', pg.evaluate('document.documentElement.scrollWidth') <= 392,
          pg.evaluate('document.documentElement.scrollWidth'))
        ctx.close()

        # ---------- [B] report hw-only ----------
        print('[B] report: 숙제만 있는 학생 (renderHwOnly)')
        ctx, pg, errs = newpage()
        pg.route(EXEC + '*', lambda route: route.fulfill(status=200, content_type='application/json',
            body=json.dumps({"ok": True, "student": SKEY, "rows": [ROW_J1, ROW_J3], "excluded": [],
                             "cumulative": CUM_HWONLY, "rank": None, "cohort": None})))
        pg.goto(f'{BASE}/report.html?student={SKEY}-{STOK}', wait_until='networkidle')
        pg.wait_for_selector('.hwq', timeout=8000)
        T('hw-only 안내 문구', '숙제 채점 기록을 먼저' in pg.inner_text('body'))
        pg.wait_for_selector('.hwrndbtn', timeout=6000)
        T('패널 자동 오픈 + 탭 2개', pg.locator('#hwPanel').is_visible() and pg.locator('.hwrndbtn').count() == 2)
        T('페이지 오류 없음', len(errs) == 0, errs[:2])
        ctx.close()

        # ---------- [C] index 반 약점 = 익명 집계만 ----------
        print('[C] index: cohortmis 소비 + 무키 전체조회 금지')
        ctx, pg, errs = newpage()
        exec_urls = []
        def idx_route(route):
            u = route.request.url; exec_urls.append(u)
            if 'action=cohortmis' in u:
                rows = []
                for i, (sk, wm) in enumerate([('s1', ['몰 농도 환산', '이상기체 가정']), ('s2', ['몰 농도 환산'])], 1):
                    rows.append({"studentKey": sk, "course": "ch1", "round": 1, "attempt": "정시",
                                 "date": "2026-07-05T01:00:00.000Z", "isTest": False, "wrongMis": wm,
                                 "units": [{"u": "물질의 규칙성", "t": 30, "w": i}]})
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "rows": rows}))
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": False, "error": "student key required"}))
        pg.route(EXEC + '*', idx_route)
        pg.goto(f'{BASE}/index.html', wait_until='domcontentloaded')
        try:
            pg.wait_for_selector('.cohort', timeout=12000)
            T('반 약점 패널 렌더', True)
        except Exception as e:
            T('반 약점 패널 렌더', False, e)
        body = pg.inner_text('body')
        T('다빈도 오개념 표시', '몰 농도 환산' in body)
        T('exec 호출 전부 cohortmis (무키 전체조회 없음)',
          len(exec_urls) > 0 and all('action=cohortmis' in u for u in exec_urls), exec_urls[:3])
        ctx.close()

        # ---------- [D] exam 직접 입력 (반 명단 드롭다운 제거됨) ----------
        print('[D] exam: 직접 입력 화면 (관리자용 드롭다운 제거 확인)')
        ctx, pg, errs = newpage()
        pg.route(EXEC + '*', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "rows": []})))
        pg.goto(f'{BASE}/exam.html?c=ch1&r=1', wait_until='domcontentloaded')
        pg.wait_for_selector('#nm', timeout=9000)
        body_d = pg.inner_text('body')
        T('반 명단 드롭다운 버튼 제거됨', pg.locator('.rpbtn').count() == 0)
        T('내부 식별 안내 문구 제거됨', '이름과 학교로 식별' not in body_d)
        T('교사앱 링크 제거됨', '채점·진단 앱으로' not in body_d)
        T('학생 직접 입력(이름/학교/학년) 유지', pg.locator('#nm').count() == 1 and pg.locator('#sc').count() == 1 and pg.locator('#gr').count() == 1)
        T('페이지 오류 없음', len(errs) == 0, errs[:2])
        ctx.close()

        # ---------- [E] hw_grader 전체 플로우 ----------
        print('[E] hw_grader: 명단 -> 키보드 입력 -> 채점 -> 저장확인')
        ctx, pg, errs = newpage(admtok=ADMIN)
        state = {'post': None}
        def gr_route(route):
            u = route.request.url; req = route.request
            if req.method == 'POST':
                state['post'] = json.loads(req.post_data)
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "updated": False, "reportLink": "x"}))
                return
            if 'action=names' in u:
                T('grader names에 관리자 코드 전송', ('code=' + ADMIN) in u, u)
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "classes": [
                    {"label": "화학1 일6-10", "course": "ch1", "students": [
                        {"name": "홍길동", "school": "휘문중", "year": "2"},
                        {"name": "김민준", "school": "단대부중", "year": "2"}]}]}))
                return
            if 'student=' in u:
                rows = []
                if state['post']:
                    p = state['post']
                    rows = [{"course": "jm1", "round": p['round'], "answers": p['answers'], "studentKey": p['studentKey']}]
                route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True, "rows": rows}))
                return
            route.fulfill(status=200, content_type='application/json', body=json.dumps({"ok": True}))
        pg.route(EXEC + '*', gr_route)
        pg.goto(f'{BASE}/hw_grader.html', wait_until='domcontentloaded')
        pg.wait_for_selector('#cls option[value="0"]', state='attached', timeout=9000)
        pg.select_option('#rd', '3')
        pg.select_option('#cls', '0')
        pg.wait_for_selector('.chip', timeout=6000)
        pg.click('.chip >> nth=0')
        pg.wait_for_selector('#entryCard', state='visible', timeout=6000)
        pg.wait_for_selector('#stuSub:has-text("제출 기록 없음")', timeout=6000)
        for ch in R3: pg.keyboard.press(ch)
        T('20/20 입력 카운트', pg.inner_text('#cntDone') == '20')
        T('실시간 채점 100점', '100점' in pg.inner_text('#gradePrev'))
        console_msgs=[]; pg.on('console', lambda m: console_msgs.append(m.text))
        req_log=[]; pg.on('requestfailed', lambda r: req_log.append(('FAILED', r.method, r.url[:120], r.failure)))
        pg.on('request', lambda r: req_log.append(('REQ', r.method, r.url[:120])))
        pg.click('#saveBtn')
        try:
            pg.wait_for_selector('.statusline:has-text("시트 저장 확인 완료")', timeout=9000)
        except Exception:
            print('  [debug] statusline =', pg.inner_text('#statusline')[:200])
            print('  [debug] post captured =', state['post'] is not None)
            for x in req_log[-8:]: print('  [debug]', x)
            for m in console_msgs[-5:]: print('  [console]', m[:160])
            raise
        p = state['post']
        T('POST 스키마(jm1/정시/TEST/20답)', p and p['course'] == 'jm1' and p['round'] == 3 and p['attempt'] == '정시'
          and p['isTest'] is True and p['answers'] == R3 and p['score'] == 100 and p['wrongMis'] == [])
        T('학교 정규화 + 토큰 리포트링크', p and p['school'] == '휘문중'
          and re.search(r'report\.html\?student=휘문중-홍길동-[0-9a-z]{8}$', p['reportLink']) is not None
          and p['reportLink'].endswith('-' + tokenFor('휘문중-홍길동')))
        T('칩 완료 표시 + 다음 학생 자동 선택', pg.locator('.chip.done').count() == 1 and pg.inner_text('#stuNm') == '김민준')
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(350)
        T('grader 모바일 390px 오버플로 없음', pg.evaluate('document.documentElement.scrollWidth') <= 392,
          pg.evaluate('document.documentElement.scrollWidth'))
        T('페이지 오류 없음', len(errs) == 0, errs[:2])
        ctx.close()

        # ---------- [F] 관리자 3콘솔 토큰 와이어 ----------
        print('[F] roster/pending/admin: 토큰 온 와이어')
        for page_name, action_frag, body_ok in [
            ('roster.html', 'action=roster', {"ok": True, "classes": [{"label": "화학1 일6-10", "course": "ch1", "students": ["홍길동"], "round": None}]}),
            ('pending.html', 'action=pending', {"ok": True, "pending": {"active": [], "stale": [], "activeDays": 14, "generatedAt": "x"}}),
            ('admin.html', 'all=1', {"ok": True, "rows": [], "excluded": []}),
        ]:
            ctx, pg, errs = newpage(admtok=ADMIN)
            seen = []
            def mk(action_frag=action_frag, body_ok=body_ok, seen=seen):
                def h(route):
                    u = route.request.url; seen.append(u)
                    route.fulfill(status=200, content_type='application/json', body=json.dumps(body_ok))
                return h
            pg.route(EXEC + '*', mk())
            pg.goto(f'{BASE}/{page_name}', wait_until='domcontentloaded')
            pg.wait_for_timeout(1800)
            hit = [u for u in seen if action_frag in u]
            T(f'{page_name}: {action_frag} 요청에 token', len(hit) >= 1 and all(('token=' + ADMIN) in u for u in hit), hit[:2])
            T(f'{page_name}: 페이지 오류 없음', len(errs) == 0, errs[:2])
            ctx.close()

        br.close()

if __name__ == '__main__':
    httpd = serve(); time.sleep(0.4)
    try:
        run()
    finally:
        httpd.shutdown()
    print(f'\n결과: pass={PASS} fail={FAIL}')
    sys.exit(1 if FAIL else 0)
