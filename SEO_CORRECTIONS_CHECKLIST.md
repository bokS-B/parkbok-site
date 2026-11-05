# CS-01 · 기능 안내 정확성 수정

- 일자: 2026-11-03 KST. 사용자 ‘ㄱㄱ’로 CS-01 진행 지시.
- 브랜치: `codex/hallmark-home`. 기준 커밋: `cbc769cf4`.
- 상태: CS-01 공개 반영 완료(`9c5ea8adc`, 2026-11-03). CS-02 템플릿 제외와 CS-05 공개 기능 검증도 완료. CS-03 HEX 진입로 및 CS-04 홈 WebSite 추가는 남아 있다. `PAGES_DEPLOY_CHECKLIST.md` 참조.
- 수정 파일: `hwp/index.html`, `text/sql-in.html`, 이 체크리스트.
- 후속 계획: `C:/Users/boksb/Documents/ChatGPT/산업화/parkbok.com-audit/ACTION-PLAN.md`.

## 완료 항목

- [x] CS-01-01 HWP 안내의 ‘페이지 모양 그대로’를 본문 확인과 글꼴·표·수식의 서식 한계로 정정했다. 모바일의 동일 동작 보장도 문서·기기별 제한 안내로 고쳤다.
- [x] CS-01-02 SQL IN FAQ에 Oracle 19c(1,000개)·26(65,535개)의 공식 출처를 연결했다. 현재 DB 버전의 제한을 확인하고 자동 분할을 지원하지 않는다고 설명한다.
- [x] CS-01-03 SQL/Python/JSON의 이스케이프 규칙 차이를 안내한다. 괄호 교체만으로 Python·JSON 배열이 된다는 약속을 제거했다.
- [x] CS-01-04 1,000개 초과 시 메시지는 DB 버전 확인을 요청하는 중립 상태로 표시한다. 생성에 실패한 것처럼 오류색으로 표시하지 않는다. 변환 함수 본문은 기준 커밋과 바이트 단위로 같다.
- [x] CS-01-05 빌드·셸 검사, 실제 브라우저 대표 동작, 8화면·줄바꿈을 확인했다.
- [ ] CS-01-06 사용자 확인 뒤 CS-02 배포 산출물 분리 단계로 진입한다. push는 별도 배포 지시 후 수행한다.

## 검증 결과

| 대상 | 입력·조건 | 실제 결과 |
|---|---|---|
| SQL 일반 | A, B, O'Reilly, 001, 역슬래시를 포함한 5줄 | 5개 결과, 작은따옴표 이중 처리·역슬래시/앞자리0 유지 |
| SQL 큰따옴표 | `A"B`, `C:\tmp`, `001` | `("A""B", "C:\tmp", "001")` — 기존 SQL 출력 유지 |
| SQL 경계 | 1~1000 | 1,000개 항목, 추가 제한 안내 없음 |
| SQL 경계 | 1~1001 | 1,001개 결과·버전 확인/자동 분할 없음 안내, class=`status`, 복사 가능, OR 분할 없음 |
| SQL 초기화 | 다시 시작 | 입력 비움 확인 |
| HWPX 읽기 | 기존 합성 파일 `migration-smoke.hwpx` | 본문 `PARKBOK HWPX 이동 확인` 표시 |
| HWPX TXT | 실제 텍스트 저장 | 다운로드 내용을 다시 읽어 표시 본문과 일치 |
| HWP 초기화 | 다시 시작 | 파일 값 비움, 도구/텍스트 영역 숨김, 상태 비움 |
| 화면 | 2페이지 × 1280×900/375×812 × 라이트·다크 | 안내 펼침 8화면 가로 넘침0, 브라우저 오류0 |
| 사이트 빌드 | `node tools/build-site.js` | pages21 / changed0 / site URLs21 — 수동 수정 보존·불필요한 생성 변경 없음 |
| 공통 셸 | `node tools/check-shell.js` | files365 / fails0 |
| diff | `git diff --check` | 통과 |

기준 커밋과 비교해 두 페이지의 DOM ID 목록·CP1 첫 문장이 같고, HWP 파서·앱과 SQL 변환 함수는 그대로다. 사이트 코드 변경은 두 HTML의 안내 5곳뿐이다.

## 근거와 범위

- 자료: `C:/Users/boksb/Documents/ChatGPT/산업화/parkbok.com-audit/evidence/cs01/`.
- `source-review.json`: 함수 SHA256·DOM ID·첫 문장 보존 및 이전 문구 제거.
- `browser-verification.json`: 화면 치수·테마·넘침·실제 입력/출력·파일 저장·초기화.
- `sql-1280/375-light/dark.jpg`, `hwp-1280/375-light/dark.jpg`: 안내 펼침 전체 페이지 캡처8개.
- [Oracle 19c 공식 IN 목록 제한](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/IN-Condition.html), [Oracle 26 공식 IN 목록 제한](https://docs.oracle.com/en/database/oracle/oracle-database/26/sqlrf/IN-Condition.html), 확인일2026-11-03.
- 실제 휴대폰·Safari·Firefox, 실제 Oracle 연결, 다양한 HWP 문서·인쇄/PDF 재검증은 수행하지 않았다. 이번 문구 수정으로 파싱 정확도가 향상됐다고 주장하지 않는다.
- BR1 파서 변경, CP1 첫 문장, S1a 여권사진, 홈/게임의 미배포 변경은 별도 작업으로 유지한다.

미리보기: http://127.0.0.1:8796/hwp/ · http://127.0.0.1:8796/text/sql-in.html

## 2026-11-05 색상 추출 검색 표시·색인 요청

- [x] 실제 Chrome Google 검색에서 EN `site:parkbok.com/color/picker/` 확인. 영어 결과 제목은 `Image Color Picker`, 설명은 예전 `collect up to 12 colors` 문구. 새 `HEX, RGB & 5-Color Palettes` 제목/설명의 반영은 확인하지 못함. 검색 제목은 원본 title과 반드시 같지 않으며 이번 결과는 한국에서 로그인된 개인화 검색이다.
- [x] KO `site:parkbok.com/color/picker/ko/` 결과 없음. Search Console도 `Google에는 아직 알려지지 않은 URL`·크롤링 없음으로 확인. site 검색 결과만으로 미색인을 단정하지 않음.
- [x] KO 실시간 검사 `URL을 Google에 등록할 수 있음`. 사용자의 직접 진행 후 `색인 생성 요청됨`과 우선순위 크롤링 대기열 접수 화면 확인. 접수 완료와 색인 완료를 구분한다.
- [ ] EN 재색인 요청: 기존 URL은 Google에 등록됨. 요청 2회 모두 `reCAPTCHA 서비스에 연결할 수 없습니다` 오류로 접수 실패. 사용자에게 수동 요청을 부탁했고 영어 URL 검사 탭을 남김. 완료로 기록하지 않음.
- [x] 공개 EN/KO의 새 title과 정상 HTTP200, sitemap-core.xml / sitemap-tools.xml에 각각 포함 확인.
- [x] 게임 36 URL 제거 배포 `27aac26a9` 후 `https://parkbok.com/sitemap.xml` 재제출. 11월5일 제출·접수 성공. 최신 파일은 core43+tools310+colors176=529 URL. GSC 발견된 페이지 수는 아직 11월4일 기준533으로 새 파일 처리 완료와 다름.

증빙: `output/seo-color-games/google-en-before.png`, `google-ko-before.png`, `gsc-ko-requested.png`, `gsc-ko-index-status.png`, `gsc-en-request-error.png`, `sitemap-submitted.png`, `live-check.json`. 삭제·배포 상세는 `GAMES_CHECKLIST.md` 참조. 노출·색인·순위 상승을 보장하거나 완료 처리하지 않음.
