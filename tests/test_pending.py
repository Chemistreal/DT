# -*- coding: utf-8 -*-
"""pending.html 시험 미응시 섹션: 데모 렌더 / 메시지 3종 / 링크 / 복사 / 재시 회귀"""
import time, threading, http.server, functools, sys

ROOT = '/home/claude/test_root'
PORT = 8788
BASE = f'http://localhost:{PORT}'
PASS = 0; FAIL = 0
def T(name, cond, extra=''):
    global PASS, FAIL
    if cond: PASS += 1; print('  ok  ' + name)
    else: FAIL += 1; print('  FAIL ' + name + ((' :: ' + str(extra)[:220]) if extra else ''))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def run():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        ctx = br.new_context(viewport={'width': 1280, 'height': 900},
                             permissions=['clipboard-read', 'clipboard-write'])
        ctx.add_init_script("try{localStorage.setItem('dt_admtok','x');}catch(e){}")
        pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))

        # 데모 모드 (exec 호출 없이 demo()/demoAbs())
        pg.goto(f'{BASE}/pending.html?demo=1', wait_until='networkidle')
        pg.wait_for_selector('.abx-cls', timeout=8000)

        # --- 섹션/렌더 ---
        heads = pg.locator('.sec-h').all_inner_texts()
        T('시험 미응시 섹션 헤더 존재', any('시험 미응시' in h for h in heads), heads)
        T('재시 필요 섹션도 유지(회귀)', any('재시 필요' in h for h in heads), heads)
        T('통계바에 시험 미응시 카운트(4)', pg.locator('.stat.exabs .n').inner_text() == '4',
          pg.locator('.stat.exabs .n').inner_text())
        # 미응시 있는 반만: 화학1(2명)+일반화학(2명) = 2블록, 화학2(0명) 제외
        T('미응시 반 블록 2개 (0명 반 제외)', pg.locator('.abx-cls').count() == 2, pg.locator('.abx-cls').count())
        names = pg.locator('.abx-sname').all_inner_texts()
        T('미응시 학생 4명 렌더', names == ['김도윤', '최예린', '한지우', '박서준'], names)
        T('화학2(전원 응시)는 이 섹션에 없음', '화학2' not in pg.locator('.abx-cls').first.inner_text() and pg.locator('.abx-cls').count() == 2)
        # 반별 배지: 회차/과목
        badges = pg.locator('.abx-badge').all_inner_texts()
        T('반 배지 과목·회차', badges == ['화학Ⅰ 12회', '일반화학 3회'], badges)
        # 버튼 수: 학생당 2 + 반당 1(broadcast)
        T('학생 안내 버튼 8개(4명×2)', pg.locator('.copybtn.a1').count() == 4 and pg.locator('.copybtn.a2').count() == 4)
        T('반 전체 공지 버튼 2개', pg.locator('.copybtn.abc').count() == 2)

        # --- 링크(응시 페이지) ---
        el = pg.evaluate("examLink('ch1',12)")
        T('examLink는 exam.html?c=&r=', el.endswith('exam.html?c=ch1&r=12'), el)

        # --- 메시지 내용 (3종) ---
        m1 = pg.evaluate("absentMsg({name:'김도윤',course:'ch1',round:12,link:'LINK'}, '1')")
        T('1차: 이름·과목·회차·응시·링크', all(k in m1 for k in ['김도윤', '화학Ⅰ', '12회', '응시', 'LINK', '조준모 드림']))
        T('1차: 재시가 아니라 시험 응시 안내', ('아직 응시하지 않아' in m1) and ('재시' not in m1), m1[:120])
        m2 = pg.evaluate("absentMsg({name:'김도윤',course:'ch1',round:12,link:'LINK'}, '2')")
        T('2차: 리마인드 문구', '리마인드' in m2 and '다시 한번' in m2)
        mb = pg.evaluate("absentMsg({course:'ch1',round:12,link:'LINK'}, 'bc')")
        T('반 공지: 회차 안내 + 이름 없음', ('온라인 시험 안내' in mb) and ('12회' in mb) and ('김도윤' not in mb))

        # --- 실제 복사 동작 ---
        pg.click('.abx-stu >> nth=0 >> .copybtn.a1')
        pg.wait_for_selector('.abx-stu >> nth=0 >> .copybtn.copied', timeout=4000)
        T('복사 시 버튼 상태 전환(복사됨)', '복사됨' in pg.locator('.abx-stu').nth(0).locator('.copybtn.a1').inner_text())
        try:
            clip = pg.evaluate("navigator.clipboard.readText()")
            T('클립보드에 김도윤 시험 안내 복사됨', ('김도윤' in clip) and ('12회' in clip) and ('exam.html?c=ch1&r=12' in clip), clip[:80])
        except Exception as e:
            T('클립보드 읽기(스킵 허용)', True, 'headless clipboard: ' + str(e)[:60])

        # --- 회귀: 재시 필요 학생 렌더 + 3단계 버튼 ---
        T('재시 필요 학생 행 존재', pg.locator('.row').count() >= 4)
        T('재시 3단계 버튼 유지', pg.locator('.copybtn.s1').count() >= 4 and pg.locator('.copybtn.s3').count() >= 4)

        # --- 모바일 ---
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
        T('모바일 390px 가로 오버플로 없음', pg.evaluate('document.documentElement.scrollWidth') <= 392,
          pg.evaluate('document.documentElement.scrollWidth'))
        T('페이지 오류 없음', len(errs) == 0, errs[:2])

        ctx.close(); br.close()

if __name__ == '__main__':
    httpd = serve(); time.sleep(0.3)
    try: run()
    finally: httpd.shutdown()
    print(f'\n결과: pass={PASS} fail={FAIL}')
    sys.exit(1 if FAIL else 0)
