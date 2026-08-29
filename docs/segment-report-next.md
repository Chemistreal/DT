# 구간 종합 보고서 — 다음 판을 위한 조사 결과 (되살린 것)

> 2026-08-29 에 돌린 조사(에이전트 215개)의 **마지막 합침 단계만** 컨테이너 재시작으로
> 날아갔다. 조사 결과 자체는 남아 있어 여기 옮겨 적는다. 판정 202건 중 125건이
> 적대적 반박을 견뎠고 77건이 반박됐다 — 반박 사유까지 원본에 남아 있다.
> 이 문서는 **계획서**다. 여기 적힌 것이 곧 만들어졌다는 뜻이 아니다.

## 1. 자산 조사 — 무엇을 쓸 수 있나

### /home/user/dt/report.html — 인라인 개념 데이터베이스 및 렌더 함수 (2,450줄 / 578,972 byte). 교차 검증에 /home/user/dt/appdata/round_*.json 46개, /home/user/dt/appdata/seeds.json, /home/user/dt/materials.json, /home/user/dt/chemengine.js 를 함께 읽음.
- **CORE — 개념 → 핵심 설명 사전** — `/home/user/dt/report.html:874 (한 줄, UTF-8 173,548 byte)`
- **ONELINE — 개념 → 한 줄 정리** — `/home/user/dt/report.html:873 (한 줄, UTF-8 102,207 byte)`
- **PREREQ — 단원 선수 개념 그래프 (과목별 DAG)** — `/home/user/dt/report.html:881 (한 줄, 1,528 byte). 소비: unitDepth(1333) · prereqCard(1338~1345)`
- **ENGINE — 문항 개념 1,154개의 근본원인 그래프** — `/home/user/dt/report.html:1365 (한 줄, 61,070 byte). 파생 _deps(1368), 소비 _reachUp/_reachDown(1369·1370) → deepDiagnose(1371) → dxDeepHTML(1394)`
- **ARCS + FAMLBL — 13개 «사고 습관» 서술** — `ARCS /home/user/dt/report.html:1367 (3,319 byte) · FAMLBL /home/user/dt/report.html:1366 (316 byte). 소비: dxDeepHTML(1402·1405·1407)`
- **RXBANK — 처방 코멘트 문단 뱅크 55개** — `/home/user/dt/report.html:1011~1081. 소비: _rxPick(1001) · _rxPattern(1082) · rxNarrCard(1095)`
- **DEMO_ITEMS · SYN · SYN_HARD · CUM_UNITS(_HARD) · CUM_AXES(_HARD) · DEMO_RANK — 데모 전용 자료** — `report.html:880(DEMO_ITEMS) · 872(SYN) · 877(SYN_HARD) · 875·878(CUM_UNITS류) · 876·879(CUM_AXES류) · 896(DEMO_RANK)`
- **죽은 5축(A1~A5) 레이어 — 서버가 보내는데 아무 데도 안 그린다** — `ENGINE_AXES report.html:871 · axisMap 890(선언만, 읽는 곳 없음) · AXES(키워드판) 525~536 · RX_AXIS_NAME 1010(선언만, 읽는 곳 없음) · aggFromRows 의 axes 집계 1208 · A.axisWeak 780~785 · RXBANK.axis 1073~1079`
- **인라인 ChemEngine (chemengine.js 사본) — 순수 함수 12개** — `/home/user/dt/report.html:508~869 (IIFE, 20,314 byte). 별도 파일 /home/user/dt/chemengine.js 는 31,035 byte`
- **MATS / materials.json — 회차별 해설·문제지·오답노트 링크** — `로더 loadMats report.html:1143 · 조회 matsFor 1151 · 카드 matsCardHTML 1158~1174. 데이터 /home/user/dt/materials.json (18,718 byte)`
- **segJoin 이 만들어 놓고 버리는 것 — est · untested · skipped · items[].c** — `segJoin /home/user/dt/report.html:1913~1935 · segLedger 1875~1896 · 소비처 renderSegment 2141~2142`
- **평소 리포트(render)는 쓰는데 구간(renderSegment)이 안 쓰는 것 — 최종 목록** — `render() /home/user/dt/report.html:1574~1813 vs 구간 분기 1847~2297 (renderSegment 2112 + segLvlSec 1947 · segClinicSec 1989 · segRecoverSec 2025 · segRxSec 2047 · segTableSec 2075 · segMethodSec 2098)`

> **놀란 점**
> 
> 1. **CORE·ONELINE 이 회차 데이터와 100% 물린다.** 이건 추정이 아니라 실측이다 — appdata/round_*.json 46개 파일 2,760문항의 items[].mis 값 792종이 CORE 키 867개 안에 하나도 빠짐없이 있다. items[].c 994종도 ENGINE 1,154 노드 안에 100% 있다. PREREQ 의 단원 이름도 3개 과목 전부 회차 파일 items[].u 와 완전 일치. 즉 «틀린 문항 → 개념 설명 / 뿌리 / 선수 단원» 세 갈래 조회가 전부 무손실이다. 붙이는 코드만 없을 뿐 자료는 이미 다 붙어 있다.
> 
> 2. **가장 두꺼운 사전(CORE, 867개 × 평균 82자)이 구간 보고서에서 완전히 미사용이다.** 참조가 874(선언)·1698·1729 셋뿐이고 뒤 둘은 render() 안이다. 선생님이 «쓸 수 있는 자료가 엄청 많은데 다 안 썼다»고 하신 것의 가장 큰 덩어리가 이것으로 보인다.
> 
> 3. **5축(A1~A5) 레이어가 통째로 죽어 있다.** 서버가 rows 마다 axes[{k,t,w}] 를 보내고, aggFromRows(1208)가 그걸 축별로 합산까지 해 놓는데, **agg.axes 를 읽는 코드가 파일 전체에 없다**. axisMap(890)·RX_AXIS_NAME(1010)은 선언만 있고 참조 0. RXBANK.axis 에 축별 처방 문단 5개가 다 써져 있는데 그 문단의 조건인 A.axisWeak 는 `r.wrongAxes` 로만 만들어지고(cumulative 780) 실제 서버 행에는 wrong

### /home/user/dt/appdata/ (JSON·PDF 데이터 자산 전수) — 교차확인으로 /home/user/dt/report.html, materials.json 도 열어 봄
- **회차 문항 원본 — jeongsi.items[]** — `/home/user/dt/appdata/round_ch1_01.json … round_ch1_18.json, round_ch2_01..18.json, round_gc_01..10.json (46개 파일). 키 경로: $.jeongsi.items[]. 파일 최상위 키는 course·round·title·scoring·jeongsi·retakeC. 소비처: /home/user/dt/report.html:1281-1284 loadRoundItems()`
- **회차별 재시 문항 3벌 — retakeC[]** — `/home/user/dt/appdata/round_*.json 의 $.retakeC[] (46개 파일 전부). 엔진 설명: /home/user/dt/report.html:668 및 /home/user/dt/chemengine.js:200 «cbandVersions: round.retakeC = [{v,items:[{c,u,a,s,f,w}]}...] (C=기본, 더 쉬움)»`
- **또래 정답률 시드 — seeds.json** — `/home/user/dt/appdata/seeds.json (파일 전체가 3바이트 «{}»). 읽는 쪽: /home/user/dt/report.html:1258 loadSeeds(), report.html:1259 seedSliceFor(course,round), report.html:1925 est=rptEstRates(stats, seedSliceFor(...)). 굽는 쪽: /home/user/dt/admin.html:417-433 bakeSeeds()`
- **회차 등기부 — app_manifest.json** — `/home/user/dt/appdata/app_manifest.json (한 줄 JSON, 8228바이트). 소비처: /home/user/dt/pdfs.html:107, /home/user/dt/exam.html:550, retakegen.js:26, chemistreal_app.html:532(EMBED로 통째 인라인), index.html:281`
- **오개념 저격문 — forms_bank[c].reading.kill (아무도 안 쓰는 최대 미사용 자산)** — `/home/user/dt/appdata/forms_bank.json 의 각 개념코드 아래 $.<code>.reading.kill. 같은 파일의 형제 필드 reading.core / reading.oneline 은 이미 /home/user/dt/report.html:873(const ONELINE) · 874(const CORE) 에 이름(mis) 키로 인라인돼 있는데, kill 만 빠져 있다(report.html 안에 «kill» 문자열 0회).`
- **개념 강의록 — forms_bank[c].reading.core / .oneline** — `/home/user/dt/appdata/forms_bank.json 의 $.<code>.reading.{core,oneline}. 이미 구워진 사본: /home/user/dt/report.html:873 const ONELINE={…} (102,207자) · report.html:874 const CORE={…} (173,547자) — 둘 다 개념코드가 아니라 개념 이름(mis)이 키다.`
- **동형 문항 은행 — forms_bank[c].forms[]** — `/home/user/dt/appdata/forms_bank.json 의 $.<code>.forms[]. 소비처: /home/user/dt/report.html:623 buildGate(wrongConcepts, formsBank, …) 와 report.html:704 buildRetake(...) 가 인자로 받도록 이미 짜여 있으나, report.html 은 forms_bank.json 을 **한 번도 fetch 하지 않는다**(report.html 의 fetch 는 1145 materials.json · 1258 seeds.json · 1282 round_*.json · 1818 서버 · 2387 hw_jm1.json 다섯 곳뿐).`
- **개념명 사전 + 개념 tier — forms_bank[c].m / .t** — `/home/user/dt/appdata/forms_bank.json 의 $.<code>.m (개념 이름) 과 $.<code>.t ("A"|"B"|"C"). tier 라벨이 무슨 뜻인지 설명하는 주석은 저장소 어디에도 없다. 가장 가까운 단서는 /home/user/dt/appdata/app_manifest.json 의 bands:{"정시":"B","재시":"C","재재시":"C"} 와 /home/user/dt/chemengine.js:200 주석 «C=기본, 더 쉬움».`
- **학습 처방 은행 — study_bank.json (통째로 미사용)** — `/home/user/dt/appdata/study_bank.json (918,792바이트, gzip 171KB). 개념코드가 최상위 키. 저장소에서 이 파일을 읽는 곳은 /home/user/dt/index.html:314 ensureStudy() 단 한 군데 — 학생 앱이다. report.html 은 이 파일 이름조차 등장하지 않는다.`
- **숙제 데이터 — hw_jm1.json** — `/home/user/dt/appdata/hw_jm1.json (58,908바이트). 소비처: /home/user/dt/report.html:2387 loadHwMeta() 와 /home/user/dt/hw_grader.html:174. report.html 은 이 파일에서 **rounds_total 하나만** 쓴다(report.html:2380).`
- **회차 문제지·해설지 PDF 사본 (appdata 안의 것)** — `/home/user/dt/appdata/munje_ch1_round01.pdf … munje_gc_round10.pdf (46개) 와 /home/user/dt/appdata/haeseol_ch1_round01.pdf … haeseol_gc_round10.pdf (46개). app_manifest.json 이 munje_pdf/haeseol_pdf 로 파일명만 등재.`

> 놀란 점 · 함정 · 다른 조사자에게 넘길 단서
> 
> 1. 「채움률에 구멍이 있을 것」이라는 전제가 틀렸다. round_*.json 46개 × 60문항 = 2760문항의 n·u·mis·a·s·f·w·lvl·c **아홉 필드 전부 100%**다. 빈 문자열도 null 도 0건이다. 회차 데이터는 손댈 곳이 없다 — 여백은 데이터가 아니라 **report.html 이 그 데이터를 안 쓰는 데** 있다.
> 
> 2. 진짜 병목은 한 줄이다. /home/user/dt/report.html:1930-1932
>    Q.push({round:st.round, n:x.n||(k+1), u:x.u, mis:x.mis, s:x.s, f:x.f, w:x.w, lvl:x.lvl, key:x.a, got:g, ok:(g===x.a), fixed:…});
>    여기에 `c:x.c` 가 없다. 개념코드가 구간 원장에서 떨어져 나가는 바람에, 개념코드를 키로 하는 forms_bank(1154) 와 study_bank(1154) 가 통째로 닫혀 있다. 이 한 필드를 추가하면 오개념 강의록·진단·처방·비유·자가점검 질문이 전부 열린다. 서버도 Apps Script 도 건드리지 않는다.
> 
> 3. report.html 은 forms_bank.json 도 study_bank.json 도 **fetch 하지 않는다**. 파일 안 fetch 는 딱 다섯 군데다: 1145 materials.json · 1258 appdata/seeds.json · 1282 appdata/round_*.json · 1818 서버 · 2387 appda

### DT 서버(Google Apps Script) — /home/user/dt/apps-script.gs 전문 정독 + 실제 백업 데이터(/home/user/dt/backup/*.json)로 교차 검증
- **?student=<코드> 응답 봉투 (doGet 마지막 return)** — `/home/user/dt/apps-script.gs:512-515`
- **rows[] 한 줄 (mapRow_)** — `/home/user/dt/apps-script.gs:376-385 (정의) · 511 (필터: studentKey 일치분 전부, 과목 무관)`
- **cumulative.trend[] 한 칸** — `/home/user/dt/apps-script.gs:629-655 (cumulative_) · 638-644 (trend 생성)`
- **cumulative 의 나머지 4칸** — `/home/user/dt/apps-script.gs:657-678`
- **rank (rank_)** — `/home/user/dt/apps-script.gs:570-598`
- **cohort (cohortItems_)** — `/home/user/dt/apps-script.gs:603-628`
- **excluded[] — 응답에 실려 오지만 아무도 안 읽는 칸** — `/home/user/dt/apps-script.gs:512 (응답) · 54-56 (getExcluded_/exKey_) · 311-318 (doPost 로 채움)`
- **★ 시트에 있는데 응답에 안 실리는 칸 — 맞음(L열)·틀림(M열)** — `저장: /home/user/dt/apps-script.gs:361 (rowVals[11]=correctCount, rowVals[12]=wrongCount) · 헤더: :9 · 누락: :376-385 (mapRow_ 가 r[11], r[12] 를 건너뛴다)`
- **readOne_ 의 action 전체 목록** — `/home/user/dt/apps-script.gs:391-448`
- **★ action=cohortmis — 토큰 없이 열려 있는 익명 전 회차 또래 자료** — `/home/user/dt/apps-script.gs:405 (adminOk_ 검사가 **아예 없다**) · 556-567 (cohortMis_)`
- **★ adminOk_ 가 무조건 true — 관리자 창구가 전부 열려 있다** — `/home/user/dt/apps-script.gs:19  `function adminOk_(t) { return true; }``
- **?all=1 — 무토큰 전수 조회** — `/home/user/dt/apps-script.gs:500-506 (조건: student 파라미터가 **없어야** 하고 all==='1' 이고 adminOk_(token)→항상 true)`
- **action=bundle — 읽기 창구 묶음** — `/home/user/dt/apps-script.gs:450-469 (bundleRead_) · 481 (doGet 분기)`
- **hw(숙제) — 전용 창구 없음, 그리고 실제 기록이 0건** — `apps-script.gs 전문에 hw/숙제 action 없음(grep 확인: 참조는 :13, :518, :1410, :1454, :1470-1471 주석뿐) · 저장 경로: /home/user/dt/hw_grader.html:336-344`
- **★★ backup/YYYY-MM-DD.json — 서버가 매일 공개 저장소에 스스로 쓰는 익명 전수 스냅숏** — `생성: /home/user/dt/apps-script.gs:1658-1690 (dailyBackup, 매일 03시 KST 트리거 :1724-1726) · 실물: /home/user/dt/backup/2026-08-29.json 외 27개`
- **backup/roster-YYYY-MM-DD.json — 반 명단 스냅숏 (결과 백업과 결합 불가)** — `생성: /home/user/dt/apps-script.gs:1693-1717 (rosterSnapshot, 일요일 21시 KST) · 실물: /home/user/dt/backup/roster-2026-08-23.json 외 3개`
- **_열람 탭 / logView_ — 학부모가 성적표를 열면 자동으로 세는 자리** — `/home/user/dt/apps-script.gs:1810-1832 (viewSheet_/logView_) · 499 (doGet 이 코드 모양 조회에만 기록) · 1849-1862 (viewsList_, action=views 로 노출)`

> 놀란 점 · 함정 · 다른 조사자에게 넘길 단서
> 
> ■ 5번 질문의 답을 먼저 정리한다.
> 시트 19열 중 mapRow_(apps-script.gs:376-385)가 빠뜨리는 것은 **L열 '맞음'(correctCount)과 M열 '틀림'(wrongCount) 딱 두 칸**이다. 저장은 :361 에서 분명히 한다. 그런데 이 두 숫자는 클라이언트에서 완전히 복원된다 — 맞음 = Σunits[].t − Σunits[].w, 미기입 = answers 의 '.' 개수, 틀림 = Σunits[].w − 미기입. 실제 백업 한 행으로 검산했다: Σt=60, Σw=23 → 맞음 37 → 37×1.6667 = 61.667 → 61.7, 저장된 score 61.7 과 일치. 따라서 «서버가 안 줘서 못 쓰는 학생 개인 숫자»는 **하나도 없다**. 5번의 진짜 수확은 누락 칸이 아니라 아래 두 가지다.
> 
> ■ 진짜 수확 ① — backup/YYYY-MM-DD.json
> 서버가 매일 03시(KST)에 **결과 시트 전체를 이름만 지우고 이 공개 저장소에 스스로 커밋한다**(apps-script.gs:1658-1690). score 와 answers 가 다 들어 있다. report.html 과 같은 출처의 정적 파일이라 앱스크립트를 부르지도 않는다. 그러므로 report.html:1839 의 «구간 석차 — 서버가 석차를 '가장 최근 회차 하나'로만 계산해 준다. 구간 석차는 서버를 고쳐야 나오고, 없는 것을 지어내지 않는다» 는 **더 이상 사실이 아니다.** 구간 1~4회 각 회차의 또래 평균·분포·석차, 그

### /home/user/dt — 다른 HTML 화면들 (구간 보고서가 링크하거나 빌려 쓸 수 있는 것). 실제로 연 파일: home.html, letters.html, concept_map.html, dualcoding_8types.html, OX_grader_prescription.html, challenge.html, pdfs.html, exam.html, index.html, chemistreal_app.html, admin.html, OMR_answer_keys.html, OX_grader.html, hw_grader.html, roster.html, pending.html, retake_entry.html, haeseol_/munje_/omr_ 표본, materials.json, versions/*.json, appdata/*.json, tools/asset_doors.py 실행.
- **[질문1 답] 개념 하나를 지목해 여는 강의 화면 — 지금은 없다** — `concept_map.html:141 `let sel='CH1-120'` / concept_map.html 전체 `grep -c location` = 0 · dualcoding_8types.html (id 속성 0개, .fig 에 id 없음) · OX_grader_prescription.html (URLSearchParams 0개)`
- **concept_map.html 의 개념 그래프 데이터 D** — `concept_map.html:134 `const D={...}` (fam 13개 + nodes 1154개), :140 필드 해독기 F()`
- **dualcoding_8types.html 의 인라인 SVG 도식 8개** — `dualcoding_8types.html:16~ (.fig 8개, 각각 <svg viewBox> 통째로 인라인)`
- **[질문3 답] challenge.html — 유일하게 딥링크 되는 학생용 화면** — `challenge.html:112 curCourse(), :118 curRound(), :89 CHALLENGE_BANK, :92 CHALLENGE_ROUND, :93 COURSE_LAST`
- **[질문2 답] haeseol_<course>_round<NN>.html — 문항 앵커 없음** — `haeseol_ch1_round01.html · haeseol_ch1_round05.html · haeseol_ch2_round03.html · haeseol_gc_round07.html 전수 확인: `grep -o 'id="[^"]*"'` 결과가 **id="ct-theme" 하나뿐**`
- **munje_*.html · omr_*.html — 정답이 새지 않는 회차 자료** — `munje_ch1_round01.html (title '누적 OX 화학1 1회 문제지'), omr_ch1_round01.html (title '… OMR'). 두 파일 모두 '정답' 문자열 0회, id 는 ct-theme 하나뿐`
- **[질문5 답] materials.json 구조** — `materials.json — :855 "extra", :877 "kinds", note: '파일 이름에서 만든다. 손으로 고치지 말 것 — tools/gen_materials.py'`
- **[질문5 답] truthbooks/ 폴더 — 실제 파일 36개** — `/home/user/dt/truthbooks/ (chem1_round01~18 + chem2_round01~18 _truthbook_bw.pdf), 합계 53.3MB. 검증: tools/asset_doors.py → 'truthbooks 36개 53.3MB 다 걸린다 ✓'`
- **volumes/ 통권 PDF 4개 — 어느 화면도 안 건다** — `/home/user/dt/volumes/ : chem1_volume1_rounds1to9.pdf(14.6MB, 100쪽) · chem1_volume2_rounds10to18.pdf · chem2_volume1_rounds1to9.pdf · chem2_volume2_rounds10to18.pdf. tools/asset_doors.py → 'volumes 4개 55.1MB 문 없는 것 4개'`
- **supplements/ 2개 — 어느 화면도 안 건다** — `/home/user/dt/supplements/ : chem_hwaol_truthlist.pdf(19쪽) · chem_hwaol_simhwa_prestudy.pdf(33쪽). asset_doors → '문 없는 것 2개'`
- **versions/*.json 의 excerpts — 킬링 포인트 1036개 (report.html 에 아직 없다)** — `/home/user/dt/versions/ 46개 파일, 각 파일 최상위 키 `excerpts`. 렌더 예시는 OX_grader_prescription.html:623-633 (핵심부터/킬링 포인트/한 줄 정리 세 칸)`
- **appdata/study_bank.json — 1154개념 × 6칸 진단·처방 문장 (전혀 안 쓰인다)** — `/home/user/dt/appdata/study_bank.json, 901KB`
- **appdata/round_*.json — 구간 보고서가 이미 읽고 있는 문항 원장** — `appdata/round_<course>_<NN>.json 46개. report.html:1280 loadRoundItems() 가 이미 fetch 한다`
- **[질문4 답] letters.html — 학부모 문자 템플릿 (관리자 화면, 거의 비어 있다)** — `letters.html:107 `const MSGS={...}`, :234 renderTabs(); renderGrid() — location 파싱 0개`
- **OX_grader_prescription.html — 처방·채점 앱 (학부모에게 걸면 안 된다)** — `OX_grader_prescription.html:269 EMBEDDED_DATA(160KB, ch2 7회 통째로 정답 포함) · :271 ROUNDS_INDEX(46회차) · :218 «6 오답 개념 처방 · 읽을 강의록» · :595-644 처방 렌더`
- **home.html — 선생님이 직접 그은 «학생·학부모 / 선생님» 경계선** — `home.html:78-90(학생·학부모 두 칸) vs :93-124(선생님 여덟 칸, «관리자 코드 필요» 표)`
- **index.html?retake=… · exam.html?c=&r= — 이미 쓰이는 두 딥링크** — `index.html:877-884 (`_q.get('retake')` 면 관리자 게이트를 건너뛴다) · exam.html:597 (`q.get('c')||q.get('course')`, `q.get('r')||q.get('round')`) · report.html 이 이미 `index.html?retake=${stu}&c=&r=` 를 건다`
- **OMR_answer_keys.html · admin.html — 정답이 있고 문이 없는 두 화면** — `OMR_answer_keys.html(292KB, '"a": "O"' 포함, URLSearchParams 0, 비번 0) · admin.html(135KB, 정답 포함, 비번 0, 제목 '반 통계 (관리자)')`
- **chemistreal_app.html — index.html 의 오래된 사본** — `chemistreal_app.html vs index.html: `diff` 894줄. index.html 에만 있는 것: 관리자 게이트(dt_admgate), og 태그, .challengebtn. README.md 도 '채점과 진단(구판 단일 화면)' 이라 적는다`
- **demos/interp_content.js — 992개념 해설 콘텐츠 (프로토타입 폴더)** — `/home/user/dt/demos/interp_content.js:1 `window.INTERP_CONTENT={...}` 327KB. 헤더 주석: '해설 콘텐츠 라이브러리 (자동 시드: forms_bank 992개념). dx/fix/cite는 저작용 빈칸.'`
- **appdata/seeds.json — 비어 있다 (구간 또래 통계의 대체재가 못 된다)** — `/home/user/dt/appdata/seeds.json 내용이 `{}` · report.html:1257-1259 loadSeeds()/seedSliceFor() · :1256 LVL_PRIOR={1:0.85,2:0.70,3:0.55}`
- **저장소 뿌리의 중복 PDF 10개** — `/home/user/dt/chem2_round01~09_truthbook_bw.pdf (9개) + /home/user/dt/chem2_volume1_rounds1to9.pdf. md5 비교: 뿌리 chem2_volume1(17.8MB) ≠ volumes/chem2_volume1(14.4MB)`
- **pdfs.html · retake_entry.html · roster.html · pending.html · hw_grader.html · OX_grader.html** — `pdfs.html(gateOK 비번 '0000', appdata/app_manifest.json + pdfgen.js 로 회차별 정시·재시1~3 시험지/해설 PDF 즉석 생성) · retake_entry.html(관리자 전용 문구 있음) · roster.html(반 명단·미응시) · pending.html:194 `new URLSearchParams` (재시 미응시 현황) · hw_grader.html(조준모의고사 OMR 20답 일괄 입력) · OX_grader.html(누적 OX 채점기)`

> 놀란 점 · 함정 · 다른 조사자에게 넘길 단서.
> 
> 【가장 값싼 한 수】 report.html:1930 의 `Q.push({...})` 에 `c:x.c` 한 칸이 빠져 있다. 바로 위 :1925 의 stats 는 c 를 담는데 Q 는 안 담는다. 구간 보고서의 오답 문항이 개념코드를 갖는 순간 — ENGINE(:1365, 파급·선수·오개념족 1154개) · excerpts.kill(1036개) · study_bank(1154개) · concept_map 딥링크가 전부 한 번에 열린다. 지금은 오개념 «이름» 문자열만 들고 다녀서 CORE/ONELINE(867개, 이름 키) 말고는 아무 데도 못 닿는다.
> 
> 【키 체계가 두 벌이다 — 함정】 report.html 의 CORE/ONELINE 은 **오개념 이름** 키(867개), ENGINE/excerpts/study_bank/concept_map 은 **개념코드** 키(1036~1154개). 다리는 appdata/round_*.json items[] 안에 c 와 mis 가 나란히 있는 것뿐이다. 코드→이름 표를 따로 만들려 하지 말고 회차 파일에서 뽑아라. 867 vs 1036 vs 1154 는 서로 다른 모집단이니 «개념 N개» 라고 쓸 때 어느 숫자인지 반드시 밝혀야 한다.
> 
> 【단원 어휘는 일치한다】 round_*.json 의 items[].u 와 concept_map D.nodes[c][2] 가 정확히 같은 문자열을 쓴다(화학Ⅰ은 'Ⅰ-1' 로마숫자식, 화학Ⅱ·일반화학은 '분자간힘'·'총괄성'·'기초지식' 같은 이름식으로 서로 다르지만,

### /home/user/exam/final.html — scoreAuto() (6622행, 절 조립부 6670~6717행). 절마다 실제 렌더 함수를 열어 확인했다. 참조 데이터(RX/RXMAP/LEC/LECLIST/AREALEC/OMLIB/PREREQ)는 모두 같은 파일 안 인라인 const 이고, 외부 자산(answers/*.json 83개, donghyung/*.json 49개, crops/ 82폴더, lec-*.html 125개, cohort/baseline.json, exams.json 51회차)은 exam 저장소 루트에 있다.
- **01 핵심 진단(히어로) — finalHero()** — `/home/user/exam/final.html:5945 (호출 6676)`
- **02 다음 학습 가이드 CTA — nextGuideCta()** — `/home/user/exam/final.html:5786 (호출 6677)`
- **03 한눈에 보는 진단 — narrativeSec()** — `/home/user/exam/final.html:4775 (호출 6678)`
- **04 학부모님께 — parentNoteFinal()** — `/home/user/exam/final.html:6052 (호출 6679)`
- **05 학습 유형 — learnerTypeSec()** — `/home/user/exam/final.html:4752 (호출 6680)`
- **06 수상 기준 — legendHTML()** — `/home/user/exam/final.html:2888 (호출 6681)`
- **07 학생을 위한 다음 목표 — motivationSec()** — `/home/user/exam/final.html:4708 (호출 6682)`
- **08 수상권 목표 정렬 (접힘: «수상권까지의 경로») — tierPathSec() + tierLadderSVG()** — `/home/user/exam/final.html:4680, 사다리 SVG 4482 (호출 6683, fold 라벨 «수상권까지의 경로 — 어느 영역에서 몇 문항을 되찾으면 다음 등급인지»)`
- **09 점수 분포 속 나의 위치 — percSec() (+ bellCurveSVG · propCI)** — `/home/user/exam/final.html:3324, bellCurveSVG 3305, propCI 3318 (호출 6687, 일부러 접지 않는다 — 6684행 주석)`
- **10 신뢰 문구(제목 없음) — confidenceLine()** — `/home/user/exam/final.html:2894 (호출 6688)`
- **11 신호등 사분면 (접힘) — quadSec() + scatterSVG()** — `/home/user/exam/final.html:3281, scatterSVG 3268 (호출 6689, fold 라벨 «신호등 사분면 — 난이도×정오로 본 문항 지도»)`
- **12 개념 깊이 · 사고력 (접힘) — depthSec()** — `/home/user/exam/final.html:3244 (호출 6690, fold 라벨 «개념 깊이 · 사고력 — 쉬운·어려운 문항 정답률»)`
- **13 영역별 성취 · 약한 단원부터 — areaSec() (+ radarSVG · domScores · cohortDomFine)** — `/home/user/exam/final.html:2962, domScores 4090 (호출 6691)`
- **14 개념(유형) 숙련도 · 보완 우선 — typeSec()** — `/home/user/exam/final.html:2976 (호출 6692)`
- **15 오답 개념 클리닉 — conceptClinicSec()  ★ 강의 링크의 본산** — `/home/user/exam/final.html:3079 (호출 6693). 데이터: LEC 3082 근방(16묶음 강의 요약 s + 링크 u), LECLIST(125개 lec-*.html 파일명↔한글 이름), lecForType()(최장공통부분열 매칭, 3글자 이상만), AREALEC(영역→강의 파일 권위 매핑 101줄), lecFor()(AREALEC → lecForType → 대분류 대표 강의 순), RXMAP(89줄 세부→대분류), RX(16묶음 핵심 k/함정 t/처방 rx), omFor()/OMLIB(660줄 유형→오개念 문장)`
- **16 누적 정답률 · 선택지 분석 (접힘) — distSec()** — `/home/user/exam/final.html:4065 (호출 6694, fold 라벨 «누적 정답률 · 선택지 분석 — 또래가 많이 걸린 보기»)`
- **17 약점별 학습 처방 — rxSec()** — `/home/user/exam/final.html:3214 (호출 6695)`
- **18 적응형 학습 처방 · 수상확률 기준 (접힘) — adaptiveSec()** — `/home/user/exam/final.html:4202 (호출 6696, fold 라벨 «적응형 처방 — 수상확률로 본 보완 순서»)`
- **19 수상 확률 · 베이지안 추정 (접힘) — winProbSec() (+ winProb · effN · growthGain · betaBinomPMF)** — `/home/user/exam/final.html:4598, winProb 4573, effN 4536, growthGain 4585, betaBinomPMF 4498 (호출 6697)`
- **20 가장 빨리 오르는 한 걸음 / 먼저 볼 한 문항 — oneStepSec()** — `/home/user/exam/final.html:5817 (호출 6698)`
- **21 선수 개념 지도 · 학습 순서 — prereqSec() (+ PREREQ DAG)** — `/home/user/exam/final.html:4145, PREREQ 상수 4128 (호출 6699)`
- **22 성장 대시보드 · 응시 여정 — dashboardSec()** — `/home/user/exam/final.html:4232, histAt 4262, lineChartSVG 4108, cmpExam/examOrder 4290 근방 (호출 6700)`
- **23 성장 추적 · 지난 진단 대비 (첫 회면 «기준선») — growthSec()** — `/home/user/exam/final.html:4439 (호출 6701)`
- **24 동형문제 회복률 — recoverySec() (+ dhRecovery · dhLog)** — `/home/user/exam/final.html:4948, dhRecovery 4932 (호출 6702, <div id="recovery"> 안)`
- **25 되풀이되는 오개념 — misconceptionSec() (+ repeatedMisses · missWhy)  ★ 구간 보고서 1순위** — `/home/user/exam/final.html:4892, repeatedMisses 4860, missWhy 4849 (호출 6703)`
- **26 숙달 추적 · 간격 재출제 — masterySec()** — `/home/user/exam/final.html:4979 (호출 6704)`
- **27 성장 루프 · 장기 성과 — loopSec()** — `/home/user/exam/final.html:4812 (호출 6705)`
- **28 문항별 정오표 — tableSec()** — `/home/user/exam/final.html:5025 (호출 6706)`
- **29 총평 · 종합 소견 — closingSecFinal()** — `/home/user/exam/final.html:6088 (호출 6707)`
- **30 진단 방법론 · 신뢰 근거 — methodSec()** — `/home/user/exam/final.html:2898 (호출 6708)`
- **31 부록 · 오답정리 — wrongbookShell() + hydrateWrongbook() + wbCardHTML()  ★ 자산이 가장 많이 붙는 절** — `/home/user/exam/final.html:6154(껍데기, 호출 6709) · 6525(채우기) · 6320(카드 한 장) · loadAnalogues 6181 · answersOf 2379 · cropURL 1124 · poolPick/loadMore 6470 근방 · dayBands 6148 · redoneToggle 6117`
- **32 시험지 · 해설 내려받기 — examMaterialsHTML() (절 제목은 scoreAuto 안에 직접 박혀 있다)** — `/home/user/exam/final.html:1901 (호출 6715, <div class="sec"><h3>시험지 · 해설 내려받기</h3> 안)`
- **33 즉시 재도전 10제 — retrySec()** — `/home/user/exam/final.html:2216 (호출 6716)`
- **34 다음 학생 채점 — nextStudentSec()  ⚠ 학부모 문서에 절대 넣지 마라** — `/home/user/exam/final.html:2450 (호출 6717)`
- **[화면 밖] 책형식 Word/PDF 리포트 — buildBook() 6절 + 부록 2** — `/home/user/exam/final.html:6752 (buildBook), buildConceptTextbook 3148 근방, lecturesForWrong·fetchLectureContent 3160 근방`

> ■ 세 무더기 최종 정리 (scoreAuto 순서 그대로)
> 
> A. 문항별 정오(answers)만 있으면 서는 절 — DT 로 바로 옮길 수 있는 것들
>   nextGuideCta / narrativeSec / areaSec / typeSec / conceptClinicSec(또래 배지만 빼면) / rxSec / oneStepSec(«먼저 볼 한 문항» 갈래) / prereqSec / dashboardSec(등급 열 제외) / growthSec / misconceptionSec / masterySec / loopSec(도달 추세 제외) / tableSec / methodSec / wrongbookShell+hydrateWrongbook(또래 분포 제외) / examMaterialsHTML / retrySec / recoverySec(단 동형풀이 로그가 먼저 있어야 함) / motivationSec 의 정복현황·다음 한 걸음 / parentNoteFinal 의 blankNote·문단 순서 / closingSecFinal 의 p2·p3
> 
> B. 또래 통계(정답률 분포·석차)가 있어야 하는 절
>   learnerTypeSec / percSec / confidenceLine / quadSec / depthSec / distSec(분포 쪽) / adaptiveSec(careless 판정) / oneStepSec 의 «가장 빨리» 승급 / conceptClinicSec 의 «또래 NN% 동일» 배지 / wbCardHTML 의 또래 선택 분포·함정 판정 / finalHero 의 석차 타일 / methodSe

### /home/user/exam (Chemistreal exam 저장소) — DT 학부모 구간 보고서가 아직 하나도 안 쓰는 자산. 확인: /home/user/dt/report.html 에 `lec-`, `OMLIB`, `misconception` 문자열이 0회 등장(grep -c → 0). 두 저장소 remote 는 github.com/chemistreal/{dt,exam} 이라 같은 origin(chemistreal.github.io) 의 /dt/ 와 /exam/ 로 배포된다 → 교차 링크가 열린다.
- **개념강의 125장 (lec-001 … lec-125)** — `/home/user/exam/lec-001-atomic-structure-isotopes.html … lec-125-coordination-synthesis.html (125개 파일, 평균 18.1KB, 총 2.2MB). 예: /home/user/exam/lec-015-electronegativity.html`
- **125개념 표 N (코드 → 이름·영역·강의파일)** — `/home/user/exam/misconception-catalog.html:74, /home/user/exam/prereq-dag-full.html:133, 그 밖 22장(batch-report, cat, cdm, conceptual-change, content-rigor, diagnosis-v1, integrated-report, item-analysis, item-drilldown, item-response-theory, knowledge-tracing, learning-path, longitudinal, mastery-learning, mirt, olympiad-depth, ontology-browser, profile-clustering, qmatrix-editor, response-manager, spaced-repetition, teaching-brief, test-blueprint). 지키는 자: /home/user/exam/tools/concept_table.py`
- **오개념 라이브러리 OMLIB — 개념 이름별 오개념 한 줄 675행** — `/home/user/exam/final.html:3352 (원본, 36.4KB 인라인) · /home/user/exam/index.html:1186 (사본). 찾는 규칙 omFor 는 /home/user/exam/tools/gen_omlib.py:44-47 에 적혀 있다.`
- **오개념 카탈로그 M — 125행 (틀린 믿음 · 바른 문장 · 8유형 · 선수개념 코드)** — `/home/user/exam/misconception-catalog.html:74 (같은 줄에 N·M·TYPES·TC·AC·ORD, 통째로 15.9KB). 축약본은 /home/user/exam/integrated-report.html 의 MIS={'001':{b:…,cr:…}}, /home/user/exam/conceptual-change.html:65 의 M={'001':{belief:…,correct:…}}`
- **개념변화 스크립트 CC — Posner 4단계 (집에서 이 오개념을 고치는 대화 대본)** — `/home/user/exam/conceptual-change.html:65 (N+M+CC+POSNER 한 줄, 51.8KB)`
- **RIGOR 표 — 125개념 × (교과서 수준 / 엄밀 설명 / 성립 조건 / 흔한 오류 / 올림피아드 확장)** — `/home/user/exam/content-rigor.html:68 (N+RIGOR 한 줄, 45.4KB). 태그 TAG={'015':'정의범위',…} 로 개념마다 정의범위/표준개념/모형한계/종합 표시.`
- **DEPTH — 16영역 올림피아드 심화 지도** — `/home/user/exam/olympiad-depth.html:68`
- **기출 4,020문항의 해설·오개념 데이터 (answers/*.json)** — `/home/user/exam/answers/*.json — 82개 파일. 예: /home/user/exam/answers/jmchc-3.json, /home/user/exam/answers/hwol-2019.json`
- **해설지 116장 + #qN 문항 앵커** — `/home/user/exam/sol-*.html (116장). 예: /home/user/exam/sol-final-jmchc-3.html:328 → <div class="q" id="q34">…<span class="area">전기음성도</span><span class="ans">정답 ③</span>… 색인은 /home/user/exam/index_haeseol.html (sol- 링크 30개), 지키는 자 /home/user/exam/tools/haeseol_index.py`
- **동형문제 개념 색인 donghyung/index.json (2,700문항)** — `/home/user/exam/donghyung/index.json (125.4KB). 만드는 자 /home/user/exam/tools/gen_pool_index.py`
- **재도전 풀 retry-pool.json (2,968문항 + 기출 공식 정답률)** — `/home/user/exam/retry-pool.json (224.0KB). 만드는 자 /home/user/exam/tools/gen_retry_pool.py`
- **LECTURE_MAP — 개념·영역·지문정규식 → 강의번호 (역색인)** — `/home/user/exam/tools/lecture_map.py:51-292 (LECTURE_MAP, 125항목)`
- **선수 개념 DAG (125노드 · 200간선 · SOFT 16)** — `/home/user/exam/prereq-dag-full.html:133 (const N, p 칸이 부모 목록), :262 (const SOFT), :364 (const PRE 사전 묶음 5개). 같은 것이 integrated-report.html 의 HP={"015":["013","014"],…} 로도 있다.`
- **teaching-brief.html — 위 다섯 표의 합본** — `/home/user/exam/teaching-brief.html:82 (한 줄에 N·LEC·RIGOR·CC·MIS·DEPTH·AC·ORD)`
- **기출 응시자 통계 (cohort/baseline.json · cohort_data_authoritative.json)** — `/home/user/exam/cohort/baseline.json (회차별 n·점수 히스토그램·문항별 정답률 qc), /home/user/exam/cohort_data_authoritative.json (115KB, 회차별 areaNames·area·type 배열)`
- **문항 크롭 이미지 crops/** — `/home/user/exam/crops/ — 82개 회차 폴더, 회차당 60장(예: crops/hwol-2012/1.png … 60.png), 전체 134MB`
- **index_haeseol.html 해설 색인** — `/home/user/exam/index_haeseol.html (sol- 링크 30개), tools/haeseol_index.py 가 회차와 맞는지 지킨다`

> ■ 핵심 질문의 답 — 된다. 숫자로.
> 
> 「DT 학생이 전기음성도를 틀렸다」 → exam 저장소에서 붙일 수 있는 것 (전부 실측):
>   · 강의 1장 — /home/user/exam/lec-015-electronegativity.html (읽는 데 8분, 4개 절, 「함정·18족」 박스, 확인문제 3, 직접 해보기 1). N 표 '015' 가 이름·영역(주기율)·파일을 준다.
>   · 오개념 한 줄 — OMLIB[전기음성도] = 「주기·족에 따른 전기음성도 경향(F이 최대)을 정확히 적용하지 못함.」 (final.html:3352)
>   · 오개념 카탈로그 1행 — M['015'] = ['족 아래로 전기음성도 증가', '아래로 감소(반지름 증가)', 'causal(인과 역전)', 선수개념 '013'] (misconception-catalog.html:74)
>   · 집에서 고치는 4단계 대본 — CC['015'] (conceptual-change.html:65)
>   · 엄밀 설명·성립조건·흔한오류·심화 — RIGOR['015'] (content-rigor.html:68)
>   · 선수 개념 — p:['013' 이온화에너지, '014' 전자친화도] (prereq-dag-full.html:133)
>   · 기출 문항 — concept=='전기음성도' 13문항, area=='전기음성도' 15문항. 각각 explanation·explanationHtml·misconception 보유.
>   · 문항 딥링크 — sol-final-jmchc-3.html#q34, #q37 / sol-final-

### /home/user/dt/report.html — 구간 보고서(renderSegment, 1847~2297줄) 전문 + 평소 리포트 render(1574~1806줄) 나란히 대조. 부속으로 /home/user/dt/appdata/round_*.json(2760문항), /home/user/dt/materials.json, /home/user/dt/chemengine.js 확인.
- **segParse — 구간 주소 해석기** — `/home/user/dt/report.html:1847-1854 (호출 2346)`
- **segStates — 응시 이력 상태표** — `/home/user/dt/report.html:1855-1874, 라벨 SEGLBL 1897-1899`
- **segLedger — 개념 원장(그때 틀린 개념, 다시 물었을 때)** — `/home/user/dt/report.html:1875-1896, 렌더 2246-2266, 호출 2141`
- **segJoin — 구간 문항 결합(OX 문자열 × 회차 문항 파일)** — `/home/user/dt/report.html:1913-1943, segNo 1912`
- **① 머리말·판정 배지(응시 이력 앞)** — `/home/user/dt/report.html:2158-2170 (band 판정), 2286-2288 (서명)`
- **② 응시 이력 절** — `/home/user/dt/report.html:2171-2191`
- **③ 한눈에 보는 진단 절** — `/home/user/dt/report.html:2192-2216`
- **④ 점수 추이 절 + 앞뒤 반 비교** — `/home/user/dt/report.html:2217-2234, svgTrend 1224-1257`
- **⑤ 난이도별 성취 절 (segLvlSec)** — `/home/user/dt/report.html:1947-1988, 호출 2236`
- **⑥ 단원별 성취 절 (unitHeat 재사용)** — `/home/user/dt/report.html:2238-2241, unitHeat 1217-1223, aggFromRows 1205-1215`
- **⑦ 선수 개념 지도 절 (prereqCard 재사용)** — `/home/user/dt/report.html:2243-2244, prereqCard 1338-1365, PREREQ 881`
- **⑧ 개념 원장 절 (그때 틀린 개념, 다시 물었을 때)** — `/home/user/dt/report.html:2246-2266`
- **⑨ 오답 개념 클리닉 절 (segClinicSec)** — `/home/user/dt/report.html:1989-2024, 호출 2268`
- **⑩ 재시 회복력 절 (segRecoverSec)** — `/home/user/dt/report.html:2025-2046, 호출 2269`
- **⑪ 다음 구간, 여기부터 절 (segRxSec)** — `/home/user/dt/report.html:2047-2074, 호출 2270`
- **⑫ 문항별 정오표 절 (segTableSec)** — `/home/user/dt/report.html:2075-2097, 호출 2271`
- **⑬ 맺음말 + 서명** — `/home/user/dt/report.html:2273-2288`
- **⑭ 이 보고서를 읽는 법 (segMethodSec)** — `/home/user/dt/report.html:2098-2111, 호출 2284`
- **[render 전용] 석차 카드 · 반 점수 분포 (rankCard/distHist/rankMsg)** — `/home/user/dt/report.html:1586 호출, 949-990 정의, 조건 showRank 990(n>=5)`
- **[render 전용] 이번 회차 자격 카드 + 재시 CTA (qualCard/retakeCTA)** — `/home/user/dt/report.html:1175-1181, retakeCTA 991`
- **[render 전용] 이번 주 처방 코멘트 (rxNarrCard + RXBANK)** — `/home/user/dt/report.html:1587 호출, 1095-1141 정의, RXBANK 1011-1081, _rxPattern 1082-1094`
- **[render 전용] 히어로 카드 (verdict5 · 4경우 서술 · 스파크라인)** — `/home/user/dt/report.html:1618-1632, spark 1192-1195, riskAssess 1182-1191`
- **[render 전용] 숙제 카드 (hwQuickHTML · 제출 스트립 · 패널)** — `/home/user/dt/report.html:1633 호출, 2370-2384 정의, 데이터 appdata/hw_jm1.json (2386)`
- **[render 전용] 한 학기 성장 카드 (growth · 바로잡은 개념 누적 ccum)** — `/home/user/dt/report.html:1655-1663, ccum 계산 1578-1584`
- **[render 전용] 지금 살펴볼 신호 카드 (riskAssess)** — `/home/user/dt/report.html:1664-1667 렌더, 1182-1191 정의`
- **[render 전용] 근본 원인 진단 (dxDeepHTML · ENGINE · ARCS · 수렴 SVG)** — `/home/user/dt/report.html:1669 호출, 1394-1421 정의, deepDiagnose 1371-1384, ENGINE 1364줄대 인라인, FAMLBL 1366, ARCS 1367`
- **[render 전용] 이번 회차 사다리 카드 (정시→재시 점수 + 바로잡은 개념 칩)** — `/home/user/dt/report.html:1670-1672`
- **[render 전용] 강점 카드 (잘하고 있는 부분 / 끌어올리는 힘)** — `/home/user/dt/report.html:1676-1700`
- **[render 전용] 오늘의 개념 질문 카드 (todo · 집에서 이렇게 물어봐 주세요)** — `/home/user/dt/report.html:1703-1721, CORE 874, ONELINE 873, indirectHint 898-905`
- **[render 전용] 다음 단계 · 한 겹 더 + 심화 도전 링크 (challenge.html)** — `/home/user/dt/report.html:1730-1741, 링크 1739`
- **[render 전용] 난이도 × 정오 사분면 카드 (quadCard · COHORT)** — `/home/user/dt/report.html:1748 호출, 1311-1332 정의, computeQuad 1286-1310, rptEstRates 1261-1269, seeds appdata/seeds.json`
- **[render 전용] 다시 볼 개념 카드 (만성 + 간격 복습 spacedReview)** — `/home/user/dt/report.html:1752-1762, spacedReview chemengine.js:418`
- **[render 전용] 지금까지의 여정 카드 (svgCum 누적 교정 그래프 + 회차별 마무리)** — `/home/user/dt/report.html:1764-1783, svgCum 1196-1204`
- **[render 전용] 자료 카드 (matsCardHTML · materials.json)** — `/home/user/dt/report.html:1784 호출, 1158-1174 정의, matsFor 1151-1157, loadMats 1143-1150, 데이터 /home/user/dt/materials.json`
- **[render 전용] 회차 카드 + PDF 버튼 + 회차 시점 리포트 임베드 (roundCardsHTML)** — `/home/user/dt/report.html:1786 호출, 1549-1573 정의, showRoundDetail 1524-1541, renderRoundEmbed 1423-1445`
- **[render 전용] 문항별 정오표 + 오개념 정리 (buildSolutions · #main-sols · window.__wrongbook)** — `/home/user/dt/report.html:1787 자리, 1516-1523 채움, 1446-1515 정의`
- **[render 전용] window.__dtRpt 내보내기 · Word 저장** — `/home/user/dt/report.html:1801-1802 (render 끝), 구간에서 단추 숨김 2292-2294, /home/user/dt/report_docx.js`
- **[양쪽 다 안 씀] 회차 파일의 retakeC(재시 변형 문항 세트)** — `/home/user/dt/appdata/round_ch1_03.json 최상위 키 'retakeC'; report.html 전체에 참조 0건`
- **[양쪽 다 안 씀] forms_bank.json — 개념별 동형 문항 뱅크** — `/home/user/dt/appdata/forms_bank.json; report.html 에서는 1398줄의 EMBED.forms 로만 언급되고 EMBED 는 정의돼 있지 않음`

> ■ 놀란 점 · 이미 계산해 놓고 안 쓰는 것 세 가지 (코드를 새로 짓지 않아도 되는 자리)
>  1) segJoin:1925-1926 — 회차마다 rptEstRates(시드+lvl prior)로 문항별 추정 정답률 est 를 만들어 J.rounds[].est 에 넣는데 **아무도 안 읽는다.** 사분면(quadCard) 급의 그림을 구간에서 그릴 재료가 이미 손에 있다.
>  2) segLedger:1893 — untested(«틀렸는데 그 뒤로 다시 안 물어본 개념»)를 만들어 반환하는데 renderSegment(2246-2266)가 fixed/stuck 만 그린다. 다음 구간 처방에 바로 쓸 말이 버려진다.
>  3) segJoin:1943 의 skipped(회차 파일이 없어 통째로 빠진 회차)도 반환만 되고 ⑭ 읽는 법에조차 안 적힌다. 답안 길이 불일치로 버린 회차(1921-1922)는 반환조차 안 한다.
> 
> ■ 가장 큰 구조적 병목 하나
>  segJoin:1937-1939 의 Q.push 가 문항 개념코드 **c 를 안 싣는다.** 회차 파일 items[].c 는 2760문항 전부에 있다(appdata/round_*.json 실측). 이 한 칸 때문에 ENGINE(선수관계 DAG)·ARCS(사고 습관)·CORE(개념 본문)·forms_bank(동형 문항)가 전부 구간에서 닫혀 있다. 반대로 이 칸을 실으면 «근본 원인 진단» 이 한 회차 60문항이 아니라 구간 240문항 표본으로 돌아 오히려 평소 리포트보다 잘 맞는다.
> 
> ■ 표시량 요약 (구간에서 실제로 잘려 나가는 곳)
>  · 

### /home/user/dt — 숙제(hw) · 강의록 관문(gate) · 재시 흐름에 남는 기록
- **강의록 관문 buildGate — 입력·출력 (기록은 안 남음)** — `/home/user/dt/chemengine.js:171-196 (정의) · /home/user/dt/index.html:302-311(enterRetake) · 598-606(afterReport) · 607-613(answerCheck·allRequiredUnlocked) · 793-824(gate 화면) · 624-630(startRetake)`
- **강의록 본문 forms_bank.json · reading{core, kill, oneline}** — `/home/user/dt/appdata/forms_bank.json (2.66MB) · 소비처는 /home/user/dt/index.html:803-811 (관문 화면) 뿐`
- **심화 교정 study_bank.json — dx/fx/tr/an/rd/tf** — `/home/user/dt/appdata/study_bank.json (897KB) · 소비처는 /home/user/dt/index.html:710-723 dsHTML() 하나뿐(관문 화면의 «왜 틀렸나 · 어떻게 고치나» 아코디언)`
- **숙제 채점 기록 (course='jm1') — 스키마는 있는데 실데이터가 0건** — `/home/user/dt/hw_grader.html:336-345 (저장 페이로드) · 296-305 (채점) · /home/user/dt/apps-script.gs:355-366 (같은 시트 같은 19칸에 append) · /home/user/dt/report.html:2333(HWROWS) · 2370-2384(hwQuickHTML) · 2407-2437(hwDetailHTML)`
- **숙제 문항 자료 hw_jm1.json** — `/home/user/dt/appdata/hw_jm1.json (58KB)`
- **spacedReview — 복습 시점 계산기** — `/home/user/dt/chemengine.js:418-444 (정의) · /home/user/dt/report.html:832 (인라인 사본) · /home/user/dt/report.html:1753 (유일한 호출부)`
- **재시 개념 원장 — 정시 오답 개념을 재시가 다시 물었나·확인됐나 (신규, 서버 변경 0)** — `입력: /home/user/dt/appdata/round_<course>_<NN>.json (report.html:1280 loadRoundItems 가 이미 구간마다 읽는다) + /home/user/dt/appdata/forms_bank.json + 시트가 주는 answers/wrongMis. 계산: chemengine.js:204-294 buildRetake · 385 order · 재조립 예시는 /home/user/dt/retakegen.js:46-88`
- **재시까지 걸린 시간 — 시트 '시각' 칸(아직 아무도 안 씀)** — `/home/user/dt/apps-script.gs:355(rowVals 의 new Date()) · 376-386 mapRow_ 의 date · /home/user/dt/report.html:1875-1895 segStates 가 s.atts 로 원본 행을 그대로 들고 있다`
- **관문을 거쳤는지 앱/종이 구분 — 못 한다 (그러나 간격이 단서를 준다)** — `/home/user/dt/index.html:624-630 startRetake (관문 통과가 유일한 진입로) · /home/user/dt/index.html:824 (버튼이 allRequiredUnlocked() 아니면 disabled) · /home/user/dt/retake_entry.html:289-311 (관문 없는 종이 경로, 페이로드가 index.html 과 글자까지 동일)`
- **report.html hwQuickHTML / hwDetailHTML — 숙제 칸(이미 존재, 구간 보고서엔 안 걸림)** — `/home/user/dt/report.html:2370-2384 (hwQuickHTML) · 2385-2405 (loadHwMeta·toggleHwPanel) · 2407-2437 (hwDetailHTML) · 2438-2445 (renderHwOnly) · 호출부는 1633(평소 리포트)과 2442(숙제만 있는 학생) 두 곳`
- **segJoin 의 fixed 플래그 — «재시에서 고침» 이 사실상 동전 던지기 (버그)** — `/home/user/dt/report.html:1932 `fixed:!!(ansL && ansL.charAt(k)===x.a)` · 표시부 1969 · 1996 · 2008 · 2010`
- **materials.json — 회차별 해설·문제지·오답노트 링크** — `/home/user/dt/materials.json (18.7KB) · 소비처 /home/user/dt/report.html:1142-1174 matsCardHTML()`
- **재시 문항 재생성기 DTRetake.items — 그리고 인쇄본/앱본 불일치** — `/home/user/dt/retakegen.js:46-88 · 소비처 /home/user/dt/retake_entry.html:227-236`
- **report.html 이 isTest 를 한 번도 안 거른다** — `/home/user/dt/report.html — 'isTest' 는 717행 주석 한 곳뿐, 실행 코드 0곳. 대비: /home/user/dt/apps-script.gs:629-632 cumulative_ 는 «실전 기록이 있으면 TEST 제외» 를 한다.`
- **성적표 열람 로그 (logView_)** — `/home/user/dt/apps-script.gs:1818-1832 (기록) · 493 (doGet 이 불투명 코드 접속마다 호출) · 418 (action='views' 로 읽기)`
- **같은 (학생·과목·회차·시도) 중복 행 2건** — `/home/user/dt/backup/2026-08-29.json · 멱등 로직은 /home/user/dt/apps-script.gs:364-366 findRow_ 덮어쓰기 · 소비처 /home/user/dt/report.html:1855-1870 segStates`
- **구간 보고서 대상 규모 (실데이터)** — `/home/user/dt/backup/2026-08-29.json (400행, 27일치 스냅숏 중 최신)`

> ## 네 질문에 대한 직답
> 
> **1. 학생이 재시를 보기 전에 강의록을 봤다는 기록이 남는가?**
> **안 남는다. 한 곳에도.** S.gate 는 메모리뿐이고, saveSession(/home/user/dt/index.html:317)은 view 가 'grade'/'retake' 가 아니면 곧장 return 하므로 localStorage 에도 안 들어간다. saveResult 페이로드(index.html:566-580)에 gate·reading 칸이 없고, 시트 19칸(apps-script.gs:9)에도 없다.
> *다만 두 가지가 있다.* ① **논리적 함의**는 참이다 — index.html 에서 재시 화면으로 가는 유일한 문이 startRetake(624-630)이고 그 버튼은 allRequiredUnlocked() 아니면 disabled(824)다. 그러나 retake_entry.html(종이 경로)이 **관문 없이 글자까지 같은 페이로드**를 저장하므로 행만 보고는 구분이 불가능하다. 실데이터가 이걸 증명한다: 재시→재재시 8쌍이 전부 **1.8~16.3분** 간격이다 — 관문(평균 16.4개 강의록 + 32.6확인문항) + 60문항 OX 를 6분에 못 한다. ② **관문의 내용물은 100% 재구성된다** — buildGate 가 순수 함수라 시트의 정시 answers(60자) + round_*.json + forms_bank.json 이면 «그 회차에 무엇을 읽어야 했는지» 가 그대로 나온다. 실측: 미달 첫 응시 84행 → 관문 1374개, 100% 강의록 부착, 폴백 0.
> ⇒ 학부

## 2. 렌즈별 제안

### 렌즈 1 — 커버리지
- **학부모님께 — 먼저 읽을 곳과 부탁**
- **[보강] 오답 개념 클리닉 — 「왜 그렇게 생각했나」와 「집에서 무엇을」**
- **개념 강의 링크 — 이 개념은 8분짜리 강의 한 장**
- **되풀이되는 사고 습관 — 오답 수십 개가 뿌리 몇 개로**
- **[보강] 재시 회복력 — 점수 두 개에서 개념 원장으로**
- **이 구간 자료 — 네 회차분 해설·문제지·오답노트**
- **단원 숙달 추적 — 잡힌 것과 아직인 것**
- **지난 구간에 짚어 드린 곳, 이번 구간에 어떻게 됐나**
- **오늘 저녁, 이 한 문장만 물어봐 주세요**
- **또래가 대부분 맞힌 문항인데 놓친 것 (신호등)**
- **[보강] 이 보고서를 읽는 법 — 못 센 것을 이름으로 적는다**
- **다음에 할 일 — 안 닫은 회차의 재시 / 다 통과했으면 심화**
- **수상 등급 사다리 · 수상 확률 · 등급까지 몇 문항**
- **학습 유형 판정 (기초 정착형 / 실수 교정형 / 응용 강점형 …)**

### 렌즈 2 — 개념 깊이
- **[보강] 오답 개념 클리닉 — 개념코드로 다시 묶고 「왜 그렇게 생각했나」를 붙인다**
- **집에서 이렇게 도와주세요 — 비유 한 줄과 저녁에 물어볼 질문 한 개**
- **왜 여기서 막히나 — 개념마다 진단(dx)과 함정 지점(tr), 그리고 다음 한 걸음(fx)**
- **근본 원인 진단 — 「오답 25개가 뿌리 두 개로 수렴합니다」**
- **오개념마다 「이번 주 8분 강의」 링크 — exam 저장소 125강으로 내보낸다**
- **이 개념, 집에서 이렇게 대화해 보세요 — 네 걸음 대본(흔들기 → 다리 놓기 → 설명 → 확인)**
- **[보강] 「그때 틀린 개념, 다시 물었을 때」에 세 번째 칸을 세우고, 개념마다 한 줄 설명을 붙인다**
- **[보강] 「다음 구간, 여기부터」의 되풀이 개념에 CORE 를 붙인다 — 구간 보고서는 CORE 를 한 글자도 안 쓴다**
- **이 개념 앞에 무엇이 먼저인가 — 개념 한 칸 아래의 선수 관계**
- **[보강] 회차 자료 링크를 구간 네 회차 전부로 — 지금은 마지막 한 회차만 걸린다**
- **[보강] 오답 문항 카드의 문장 라벨을 정확히 붙인다 — 지금은 참인 문장을 「고친 문장」처럼 보여 준다**
- **[보강] 「이 보고서를 읽는 법」에 실제로 못 실은 것을 적는다**
- **맞혔지만 조건이 있습니다 — 오답이 거의 없는 학생을 위한 한 겹 더**

### 렌즈 3 — 링크와 자료
- **이 구간 자료실 — 네 회차 문제지·해설·OMR·오답노트**
- **[보강] 오답 개념 클리닉 — 문항마다 그 회차 해설로 가는 링크**
- **[보강] 오답 개념 클리닉 — 오개념마다 «개념강의 8분» 링크**
- **이번 주 읽기 계획 — 아직 남은 개념만, 몇 분**
- **아직 못 넘은 회차 — 회차마다 «지금 재시 보기»**
- **모두 통과했다면 — 이 구간까지의 심화 도전**
- **이 구간을 통째로 다시 읽기 — 오답노트 네 권(과 통권)**
- **[보강] 다음 구간, 여기부터 — 처방 줄마다 갈 곳을 붙인다**
- **[보강] 단원별 성취 — 빨간 단원에서 갈 곳을 준다**
- **[보강] 맺음말 — 다음에 누를 곳 하나만**
- **더 갈 학생에게 — 올림피아드 준비 자료 두 권**
- **함께 볼 그림 — 도식 여덟 장**
- **[보강] 이 보고서를 읽는 법 — 없는 링크, 그리고 일부러 안 거는 링크**
- **오개념 하나를 여는 개념 지도 딥링크**

### 렌즈 4 — 세로(회차 흐름)
- **[보강] 응시 이력 — 회차 칩에 «언제 봤나」와 회차 사이 간격을 넣는다**
- **[보강] 재시 회복력 — «몇 점 올렸나» 옆에 «며칠 만에 닫았나»를 적는다**
- **누적 30문항 · 신규 30문항 — 지난 단원을 붙들고 있는가, 이번 주 새 단원을 잡는가**
- **[보강] 그때 틀린 개념, 다시 물었을 때 — 숨어 있는 세 번째 칸과 «되찾는 데 걸린 시간»**
- **개념 노출 원장 — 같은 개념을 이 구간에서 몇 번 만났고, 몇 번 맞혔나**
- **단원 유지 곡선 — 잡았다가 놓친 단원, 내내 지킨 단원**
- **되풀이되는 사고 습관 — 네 회차 오답이 어느 한 가지 실수로 수렴하는가**
- **다음 네 회차 예고 — 아직 못 잡은 개념이 언제 다시 나오는가**
- **[보강] 점수 추이 — 통과선까지의 거리와 흔들림 폭을 글로 적는다**
- **[보강] 난이도별 성취 — 구간 앞 절반과 뒤 절반을 나란히 놓는다**
- **[보강] 오답 개념 클리닉 — 문항마다 «이 구간에서 처음 / 두 번째 / 세 번째»를 찍는다**
- **[보강] 머리말과 «읽는 법» — 이 문서가 다루는 기간을 적고, 못 센 것을 적는다**
- **응시 요일·시각 리듬 — «주말에 보는 아이 / 밤에 보는 아이»**
- **무응답(미기입) 추이 — «뒤로 갈수록 비운다» 신호**

### 렌즈 5 — 실행 가능성
- **다음 4주 주간 계획표 — 1주차부터 4주차까지 무엇을 할지**
- **[보강] 오답 개념 클리닉 — 「왜 그렇게 생각했는지」와 「그래서 무엇을 하면 되는지」 두 줄 추가**
- **저녁에 물어볼 질문 4개 — 한 주에 하나**
- **아직 닫지 못한 회차 — 이번 주 안에 재시로 끝낼 것**
- **이 구간 자료 체크리스트 — 네 회차 해설·문제지·오답노트를 한 표로**
- **아직 확인하지 못한 개념 — 다음 구간에서 지켜볼 목록**
- **[보강] 선수 개념 지도 — 「먼저·다음·그 다음」 순서 번호를 붙인다**
- **다음 회차 목표선 — 「60문항 중 12개까지 틀려도 통과입니다」**
- **재시를 며칠 만에 닫았나 — 다음 구간의 리듬 약속**
- **이번 4주에 읽을 개념 강의 — 「3편 · 약 25분」 (exam 저장소 강의 125편 연결)**
- **집에서 나눌 대화 대본 — 흔들기·다리놓기·설명·확인 네 마디**
- **재시가 열리기 전에 읽어야 할 강의록 — 개념 목록과 개수**
- **다시 볼 시점표 — 다음 네 회차 중 언제 무엇을**
- **이 구간 기간의 숙제 제출 현황**

