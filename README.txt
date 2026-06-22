CHEMISTREAL OX - GitHub 배포 패키지
(이 zip 내용을 GitHub 저장소 루트에 그대로 올리면 GitHub Pages에서 바로 작동)

[루트]          배포용 웹앱 - Pages가 루트에서 index.html 서빙
                - index.html      : 시험 선택 -> 시험지/해설 PDF 다운로드
                - report.html     : 성적 입력 -> 회차별 성적진단표 (개념 1154개 엔진)
                - munje_*/haeseol_* PDF 46+46 (OMR 병합), 뷰어 HTML, sw.js(오프라인)
[appdata/]      라운드 JSON 46 + forms_bank/study_bank/app_manifest + seeds.json(빈 플레이스홀더)
[versions/]     OMR 5종 버전 데이터 46
[volumes/]      회차별 준비교재 합본 4권 (화1 2권 + 화2 2권, 각 정확히 100쪽)
[truthbooks/]   회차별 옳은문장집 36개 (화올 회차는 화올 확장 2쪽 포함)
[supplements/]  화올 단독 참고서 2종
[demos/]        프로토타입 데모 4개 (참고용, 의존 JS 동봉)

* seeds.json은 비어 있음: 관리자(admin.html)가 422명 시드를 구우면 교체. 없어도 리포트 정상 동작.
* 검증: 전 페이지 콘솔 에러/예외/404 없음, 정적 참조 523건 전부 해소, 시험지 PDF 다운로드 정상.
