# DT · 채점과 진단

대치동 다원교육 영재관 조준모 화학. **주말시험을 채점하고, 못 넘은 개념만
골라 재시를 보게 하고, 그 결과를 성적표와 학부모 문자로 내보내는** 정적
웹앱이다. 서버가 없고 브라우저에서 바로 돈다. 뒤쪽은 Apps Script 하나다.

> 이 파일은 **저장소의 지금 모습**을 적는다. 2026-08-10 이전에는 `# DT` 한 줄
> 뿐이었다 — 화면 148장 · 자 열둘 · CI 스무 걸음짜리 저장소의 설명서가 그것
> 하나였다.

## 지금 들어 있는 것

| | |
|---|---|
| 화면 | **145장** |
| 자료 회차 | 화학Ⅰ **18회** · 화학Ⅱ **18회** · 일반화학 **10회** |
| 자료 화면 | 문제지 46 · OMR 46 · 해설 35 · 그 밖 5 (**132장**) |
| 앱 화면 | **13장** |
| 자(tools) | **12개** |
| CI 걸음 | **20** |

학생·학부모가 받는 링크는 통합 셸(`exam/hub.html`) 하나다. 자료 화면 132장은
`materials.json` 을 통해 거기서 열린다 — 파일이 늘었는데 목록이 그대로면
셸에서는 그 회차가 없는 것처럼 보이므로 `tools/gen_materials.py` 가 지킨다.

### 앱 화면 열셋

| 화면 | 하는 일 |
|---|---|
| `index.html` | 반 통계·재시 현황이 모이는 관리자 첫 화면 (문이 되는 장) |
| `admin.html` | 문항·변별 전체 콘솔 |
| `roster.html` · `pending.html` | 반 명단 · 시험 미응시 현황 |
| `hw_grader.html` | 숙제 채점 (조준모의고사 화학Ⅰ) |
| `retake_entry.html` | 재시 수기 입력 |
| `pdfs.html` | 시험지·해설 PDF 차례 |
| `letters.html` | 학부모 문자 템플릿 |
| `report.html` | 성적 진단 리포트 |
| `exam.html` · `home.html` | 온라인 응시 · 안내 |
| `chemistreal_app.html` | 채점과 진단(구판 단일 화면) |
| `OX_grader.html` · `OX_grader_prescription.html` | 누적 OX 채점기 · 처방·채점 앱 |
| `dualcoding_8types.html` | 듀얼코딩 도식 8종 |

## 돌리는 법

화면은 그냥 열면 된다. 검사는 저장소 뿌리에서.

```bash
python3 tools/page_doors.py --check      # 자만 돌릴 때는 이런 식으로 하나씩
npm install --prefix tests               # 브라우저 검사는 playwright 가 필요하다
NODE_PATH=tests/node_modules node tests/run.js
```

## 자물쇠

한 번 걸린 결함은 규칙으로 바꿔 둔다. 지키는 자가 무엇을 막는지만 적는다.

| 자 | 막는 것 |
|---|---|
| `tools/gen_materials.py` | 자료가 늘었는데 목록이 그대로여서 셸에서 안 보이는 것 |
| `tools/ci_deps.py` | **자가 CI 에서 못 도는 것** (걸어 뒀는데 안 돌아가는 것) |
| `tools/page_doors.py` | **주소를 아는 사람만 열 수 있는 화면이 생기는 것** |
| `tools/audit_pages.py` | 글자 대비 4.5:1 미달 · 작은 글씨 · 빠진 뼈대 |
| `tools/theme.py` | 화면마다 옷이 갈라지는 것 |
| `tools/lie_check.py` | **자가 거짓말하는 것** (참·거짓 예시를 맞히는지) |
| `tools/report_msg.py` | 석차 문구가 다음 걸음을 안 말하는 것 |
| `tools/msg_ledger.py` | 사람에게 하던 말이 조용히 사라지는 것 |
| `tests/narrow.js` | 휴대폰 폭(360px)에서 화면이 옆으로 밀리는 것 |
| `tools/pages_budget.py` | 배포 한도(1GB)에 벽으로 닿는 것 |
| `tools/name_key.py` | 같은 학생이 앱마다 다른 이름으로 갈리는 것 (정한 뒤부터) |
| `tools/store_ledger.py` | 브라우저에 무엇을 남기는지 적어 두지 않는 것 |
| `tools/input_labels.py` | 입력칸에 이름이 없는 것 |
| `tools/js_syntax.py` | 화면 안 자바스크립트가 깨진 채 나가는 것 |
| `tools/print_ink.py` | 종이로 뽑을 때 글자가 사라지는 것 |
| `tools/font_block.py` | 바깥 글꼴이 첫 그림을 인질로 잡는 것 |
| `tools/noindex.py` | 개인 성적 화면이 검색에 잡히는 것 |
| `tests/theme.js` · `tests/print-ink.js` | 실제 브라우저에서 그림 위 글씨·종이 |
| `tests/first-paint.js` | 글꼴 창구가 죽어도 학부모 성적표가 뜨는 것 |
| `tests/test_gs.js` | 앱스크립트 행동(인증 · JSONP · 저장) |

**바깥 CSS·JS 파일로 빼지 않는다.** 바깥 stylesheet 를 만나면 브라우저는
그리기를 멈추고 기다린다. 같은 조각을 화면마다 안에 박아 넣고, 갈라지지
않게 자로 잰다.

> ⚠ `tools/audit_pages.py` 는 여섯 달 동안 **아무것도 막지 않았다.** CI 가
> `--check` 없이 불렀고 자에도 종료 코드가 없어, 152장이 걸린 채 초록불이었다.
> **재는 것과 막는 것은 다르다.** 새 자를 넣을 때는 종료 코드부터 본다.

## 지운 것

**`admin_console.html` · `parent_report.html` · `diagnosis_app.html`**
(2026-08-10, 선생님 결정). 셋 다 1MB 가 넘는데 저장소 어디에서도 이름이
불리지 않았다 — 주소를 아는 사람만 열 수 있는 장이었다. 지운 자리에
`tools/page_doors.py` 를 세워, 같은 장이 다시 생기면 빨간불이 되게 했다.

같이 떠 있던 `OX_grader.html` · `OX_grader_prescription.html` ·
`dualcoding_8types.html` 셋은 살리기로 하고 `index.html` 에 문을 냈다.

## 채점 규칙이 사는 곳

주말시험 채점 자체는 **exam 저장소**(`final.html`)가 한다. 여기서는 그 결과를
받아 반 통계·재시·문자로 옮긴다. 배점은 그쪽에 있다 —
정답 +3 / 무응답 0 / 오답 −1(JMChC·산과염기는 무감점).

## 같이 보면 좋은 것

- `AUTODEPLOY.md` — Apps Script 자동 배포. **/exec 주소가 바뀌면 모든 화면이
  깨진다**(새 배포가 아니라 새 *버전*으로 올린다)
- `tests/README.md` — 검사를 어떻게 돌리는가
- exam 저장소 `docs/앱별-전수조사.md` — 네 앱을 가로질러 무엇이 비어 있는지
