# 2026-11-03 · CS-02 / CS-05 배포

사용자 지시: 생성용 템플릿 제외 → 미배포 9커밋 정리·배포 → 공개 HWP·핵심 도구 확인.
되돌릴 제품 기준: `1c6d862f9a712b094de2a78498c973113c5ff99b`.

## 범위

- [x] `b53a104a7`~`09b8d975e`의 9개 커밋을 순서대로 유지한다. 홈 B안·분류 구분선·HWP 전용 페이지·게임·여권 경로·목표 KB 압축·PDF 로딩 개선 포함.
- [x] 별도 `codex/hwp-reading` BR1 파서 변경은 포함하지 않는다. 아랍어는 개발 미리보기만 유지하고 공개 URL/언어/사이트맵에는 추가하지 않는다.
- [x] 생성 원본은 저장소에 유지하되 배포는 `_build/pages`만 사용한다. root `tools`, `src`, `tests`, `docs`, 프로토타입과 다섯 HTML 템플릿 제외.
- [x] `image/tools`, `pdf/tools`, `color/tools`, HWP 번들, PDF worker, HEIF/WASM 내장 번들, 라이선스 원문 등 실행 의존성을 유지한다.
- [x] 약관의 기존 라이선스 폴더 링크를 실제 원문 6개 링크로 수정한다. 별도 법적 조건 변경 없음.

## 로컬 검증

- [x] 전체 생성기 6개 + 공통 셸 검사: 365문서, 실패0. 재생성에 따른 제품 변경0.
- [x] Node 기능 테스트130개 통과. Python 배포 검사9개 통과.
- [x] 일반 sitemap365 + 색상4560 = 4925 URL. canonical/title/H1/noindex/placeholder·내부 참조184908건 검사, 실패0.
- [x] localhost8798에서 실제 배포 산출물 제공. 핵심8페이지 × 1280×900/375×812 × 라이트/다크 = 32화면, 가로 넘침0.
- [x] HWP 공개 테스트 fixture `hahnlee/hwp.js`의 `basicsReport.hwp`(344576B) 읽기·텍스트2322자 저장. 합성 HWPX 문구18자 정확히 저장.
- [x] 목표20KB 압축20259B/1000×1400, 목표1KB18683B는 `용량 초과 1/1개`. 옵션 변경 시 이전 결과 무효화.
- [x] 한국 여권413×531 JPG10469B. 목표1KB4765B는 `용량 초과`. 실제 내려받은 JPG를 Pillow로 픽셀·바이트 재검증.
- [x] 실제 PDF 합치기6쪽, 분할ZIP3개 각1쪽, JPG→PDF1쪽. pypdf로 다운로드 결과를 독립 검증.
- [x] 색상 FF5733→RGB255,87,51, 가위바위보·숫자맞히기·반응속도·돌림판 실제 실행. 1280→375 돌림판 축소 후 넘침0.
- [x] 시험 세션에서 GA/광고 요청만 차단해 검수 방문의 수집 방지. 미처리 pageerror0, POST/PUT/PATCH0. 일반 방문자의 분석 설정 변경 없음.

## 공개 배포·후속 확인

- [x] Pages Source를 GitHub Actions로 전환하고 main에 fast-forward push. 기존 custom domain/HTTPS 유지.
- [x] Actions 전체 빌드·테스트·필터링 artifact 배포 성공. 최초 공개 커밋 `9c5ea8adc61042c92b609d5167fa22e0fe270ed7`, 실행 `41612103643`(35초, 성공).
- [x] 공개 build-info SHA 일치, 템플릿5개·개발 경로 등10개 HTTP404. 실행 자산13개의 SHA-256이 로컬과 동일.
- [x] 공개 HWP/HWPX·PDF·압축·여권·게임 실제 처리 및 다운로드 재확인. HWP/HWPX TXT 및 JPG4개는 로컬 결과와 바이트 단위 동일. PDF 합치기6쪽·분할3×1쪽·JPG변환1쪽을 pypdf로 독립 재검증.
- [x] 공개 사이트맵365+4560, 8언어 포함45페이지 자기 canonical/placeholder/noindex 정상. 핵심8페이지32화면 가로 넘침0, 미처리 pageerror0, POST/PUT/PATCH0. 외부 계획에 완료 기록.

Git OAuth에 workflow 수정 scope가 없어 첫 push는 원격에서 거절됐다. 권한을 추가하지 않고 제품 코드를 먼저 push한 후, 로그인된 GitHub 웹 편집기에서 workflow를 main에 등록했다. 공개 직전 Source를 Actions로 전환해 저장소 root가 중간 배포되지 않도록 했다. 현재부터 main push는 검증된 artifact만 배포한다.

GitHub 제공 Pages 액션의 Node20→24 강제 실행 경고1건과 ubuntu-latest 마이그레이션 안내1건이 있으나 빌드·배포는 성공했다. 제품 콘솔 예외와 구분한다.

## 제한·되돌리기

- 기존 공개본과 새 산출물 모두 위 HWP fixture의 첫 페이지 제목 두 줄이 겹친다. 텍스트 추출은 동일2322자. 이번 이동으로 새로 생긴 회귀가 아니며 원본 서식 완전 재현/모든 HWP 성공으로 보고하지 않는다. BR1과 별도 추적한다.
- 실제 휴대폰·Safari/Firefox·대용량 메모리·Google 색인/검색 순위는 이 검증으로 보증하지 않는다.
- Actions 전환 후 되돌릴 때 저장소 root를 다시 공개하지 않는다. 이 배포 workflow/packager는 유지하고 제품 파일만 위 기준으로 되돌려 새 artifact를 배포한다. git force push는 사용하지 않는다.
- 증거: `output/release/local/`, `output/release/live/`, `output/release/baseline-hwp.png`, `_build/pages-manifest.json`. 이 폴더들은 배포 제외.
- 로컬 미리보기8796, 아랍어8797은 기존 상태 유지. 산출물 검증용8798은 별도다.
