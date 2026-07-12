# DT 회귀 테스트 스위트

앱을 수정한 뒤 한 명령으로 핵심 흐름이 전부 살아 있는지 확인합니다.
구글 시트 호출은 전부 모킹되어 **시트에 어떤 기록도 남지 않고**, 네트워크 없이 동작합니다.

## 실행

```bash
cd tests
npm install          # 최초 1회 (playwright 설치)
npx playwright install chromium   # 최초 1회 (브라우저 설치)
node run.js
```

이미 playwright가 설치된 환경(예: Claude Code 원격 컨테이너)에서는:

```bash
NODE_PATH=/opt/node22/lib/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/run.js
```

## 검사 항목

| # | 테스트 | 확인 내용 |
|---|---|---|
| 1 | OG × 5 페이지 | home·exam·report·challenge·index의 og:title/og:image + 이미지 파일 존재 + JS 에러 0 + 가로 오버플로 0 |
| 2 | exam 회차 렌더 | `?c=ch2&r=3` 회차 제목 표시 |
| 3 | 채점 전체 흐름 | 학생 정보 → 회차 선택 → 60문항 → 채점 → 결과 산출 (테스트 모드, POST 모킹) |
| 4 | pending 문자 복사 | 1·2·3단계 + 반 공지 복사, 3단계에 오늘/내일/전날 표현 금지 |
| 5 | pending 숨김/복원 | 안내 완료 숨김 → 새로고침 유지 → 복원 |
| 6 | letters 템플릿 | 탭 16/16/6, 복사=미리보기 일치, 미입력 회차 자리표시·경고 |
| 7 | report 빈 데이터 | 기록 없음 상태가 에러 없이 렌더 |
| 8 | home 링크 무결성 | 모든 타일이 실제 존재하는 파일을 가리킴 |

실패하면 종료 코드 1과 함께 `tests/fail-<테스트명>.png` 스크린샷이 남습니다.

GitHub Actions(`.github/workflows/tests.yml`)가 push·PR마다 자동 실행합니다.
