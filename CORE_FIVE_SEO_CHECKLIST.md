# 핵심 5개 SEO · CP1/S1a 통합 체크리스트

- 일자: 2026-11-03 KST. 담당: Codex(사용자 인계 후).
- 상태: **SEO0 조사·SEO1 문구 수정·통합 자체 검증 완료 / 배포 확인 대기**.
- 공개 배포: `56c3cda8`. CP1: `f9009851`, S1a: `bd65c8eb` + 승인 기록 `44919e32`.
- 통합: `243178a8`(`f9009851` + `44919e32`). 소스 JSON 양쪽 값을 보존하고 생성 HTML 충돌 1개는 이미지 빌드로 재생성해 해결했다.
- 작업 브랜치: `codex/core-five-seo`, 폴더 `C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-seo-core5`.
- 미리보기: http://127.0.0.1:8794/ . 운영 서버 도입 없음.
- 사용자 승인: “S1a 확인, 핵심 5개 SEO 검사 진행”, 이어서 CP1 로컬 커밋 후 이후 작업을 Codex에 인계. 원격 push·사이트맵 재제출·색인 요청은 아직 수행하지 않았다.

## 1. 실제 검색 상태

로그인된 Search Console의 `sc-domain:parkbok.com` 속성에서 5개 URL을 직접 검사했다.

| 대상 | 공개 응답 | Google 저장된 색인 결과 | Google 선택 대표 URL |
|---|---:|---|---|
| 홈/HWP `/` | 200 | 색인됨 | 검사된 URL(홈) |
| PDF 나누기 `/pdf/split/ko/` | 200 | Google에 아직 알려지지 않은 URL | 해당사항 없음 |
| 이미지 압축 `/image/image-compress/ko/` | 200 | Google에 아직 알려지지 않은 URL | 해당사항 없음 |
| 여권사진 `/image/passport-photo/ko/` | 200 | Google에 아직 알려지지 않은 URL | 해당사항 없음 |
| HEIC→JPG `/image/heic-to-jpg/ko/` | 200 | Google에 아직 알려지지 않은 URL | 해당사항 없음 |

- 홈 최근 크롤링 표시: 2026.11.2 오후 11:08:16, Googlebot 스마트폰, 가져오기 성공·크롤링/색인 허용.
- HEIC만 추가 실시간 검사: 2026.11.3 오전 4:43:50, Google 검사 도구 스마트폰, 가져오기 성공·색인 생성 가능. 저장된 미색인 결과와 별개이며 다른 4개의 실시간 검사까지 완료한 것은 아니다.
- 제출 사이트맵은 `sitemap.xml` **1개**, 마지막 읽은 날짜 2026.11.2, 성공, 발견 **16 URL**. 현재 공개 XML은 **360 URL**로 보고 수와 차이가 있다. 지연/이전 파일 처리 등 원인은 이 수치만으로 확정하지 않는다.
- `sitemap-colors.xml`은 공개 파일·robots 알림은 있으나 제출 목록에는 없다. 핵심 360 URL 반영과 4개 도구의 발견을 우선하며 HEX 4,560장 전체 제출을 이 작업에 끼워 넣지 않는다.
- 5개 모두 title/H1/meta/canonical 각 1개, robots 차단·noindex 없음. HTTP/www/슬래시 변형 정상 수렴. `index.html` 200 별칭은 정상 canonical을 가지므로 낮은 우선순위의 정리 후보다.
- 다국어 4개 도구 × 8언어=**32개 공개 URL**의 직접 200·self canonical·9개 hreflang·상호 참조 일치. 홈은 한국어 단독 페이지다.

실측 증거: [계정 조회 기록](../seo-audit-core5/gsc-inspections-20261103.md), [공개 기술 점검](../seo-audit-core5/technical-findings-20261103T044020-KST.md), [언어 연결](../seo-audit-core5/technical-hreflang-summary-20261103T044435-KST.md).

## 2. 수정한 범위

| 원본 | 수정 전 문제 | 수정 결과 |
|---|---|---|
| `index.html` meta description | 홈을 HWP 뷰어 중심으로 설명 | 무료 도구 허브·HWP/PDF/이미지/색상/텍스트 작업 범위로 통일 |
| `image/src/tools/passport-photo.json` ko.description | 용량을 반드시 맞춘 JPG처럼 단정 | JPG·PNG 저장과 최종 용량 확인을 구분. S1a의 초과 경고와 일치 |
| `pdf/src/tools/split.json` ko.description | 선택한 쪽도 여러 파일/ZIP으로 나오는 듯한 설명 | 선택 쪽은 한 PDF, 분할 결과가 여러 개일 때 ZIP 가능으로 명시 |
| `image/src/tools/image-compress.json` ko.faq[0][1] | 투명 PNG가 항상 PNG로 유지된다고 안내 | ‘형식 유지’ 조건, JPG 선택 시 흰색 채움을 명시 |

확정한 홈 제목·lead(`PDF·이미지·색상·텍스트 — 파일은 서버로 가지 않습니다`)는 그대로 보존했다. 새로운 HWP URL·대량 검색 페이지·색인 설정·분석 코드는 추가하지 않았다. 새 SEO 수정은 **7파일, 15줄 교체**이고 다른 7개 언어의 문구와 JSON의 다른 키는 바꾸지 않았다. CP1과 S1a 전체 통합 변경량과 이 SEO 추가 수정량을 구분한다.

## 3. 자체 검증

- [x] K5-01 CP1 `f9009851` clean 및 공개 `56c3cda8`을 구분하고, S1a 승인 기록을 보존했다.
- [x] K5-02 공개 5개 대표 URL·변형 46개 사례(리디렉션 포함 응답 83개)와 robots·사이트맵을 검사했다.
- [x] K5-03 Search Console 저장된 색인 상태 5개, 기본 사이트맵 계정 상태, HEIC 실시간 테스트를 기록했다.
- [x] K5-04 32개 언어 URL 상호 참조와 실제 응답을 검증했다.
- [x] K5-05 CP1+S1a를 별도 브랜치에서 통합하고, 양쪽 원본 문구와 S1a 경고가 공존함을 확인했다.
- [x] K5-06 확인된 원본 4곳만 수정하고 meta·OG·WebApplication/FAQPage에 일치하게 재생성했다.
- [x] K5-07 전체 생성기 6개 + check-shell 실행. 360페이지 셸 실패 0, HEX 4,560장 written 0. 관련 원본 재빌드 멱등, diff 검사 통과.
- [x] K5-08 1280×900·375×812 × 라이트·다크 × 5개=**20화면**. 가로 넘침 0, JS 예외 0, 모바일 홈 첫 카드 **y=291px**. 캡처 `docs/seo-core5/`, 측정 `layout-report.json`.
- [x] K5-09 PDF 합성 3쪽에서 1·3쪽 선택→한 PDF/2쪽, 쪽마다→ZIP/한 쪽 PDF 3개. 다운로드를 pypdf로 다시 읽어 확인.
- [x] K5-10 투명 PNG 저장 형식 유지→PNG/투명 픽셀 alpha=0, JPG 선택→JPEG/흰색 배경. 다운로드를 Pillow로 다시 읽어 확인.
- [x] K5-11 여권사진 단위 테스트 24개 통과. 통합본 1KB 상한에서 실제 4,765B 출력→‘용량 초과’·‘용량 초과 파일 받기’, 새로운 description/source 일치. S1a의 이전 16개 실제 출력 검증도 재사용했다.
- [x] K5-12 한국어 변경 필드 외 모든 원본 JSON 값·7개 언어 문구, 사용자 확정 홈 제목/lead 보존 검증.
- [ ] K5-13 사용자에게 통합 결과를 확인받고 main 반영·push 여부를 결정한다.
- [ ] K5-14 배포 승인 후 Pages 완료·라이브 5개 문구/대표 URL·여권사진 경고를 검증한다.
- [ ] K5-15 별도 실행 확인 후 기본 `sitemap.xml` 재제출 1회, 미등록 4개 실시간 검사→색인 생성 요청. 요청 성공과 색인 완료를 구분한다.
- [ ] K5-16 배포 후 7·14·28일 관찰. 실제 발견 URL 수·크롤링·색인·비브랜드 검색 노출/클릭을 기록한다. 자동 알림은 만들지 않았다.

## 4. 별도 대기 사항

- BR1 HWP 읽기 개선: `codex/hwp-reading` / `96ae6e96`, 사용자 확인 대기·미배포. 이번 통합에 포함하지 않았다. 후속 통합 시 이 브랜치의 홈 문구를 보존해 HWP 코드 변경만 합친다.
- GA4 A1: 로더 배포 완료, 내부 필터 Testing, 보고서 분류 반영 확인 후 결정. 이번 SEO 단계에서 Active로 바꾸지 않았다.
- 실제 휴대폰·Safari/Firefox, HEIC의 실제 새 파일 변환과 HWP 인쇄의 전체 기능 재검증은 이번 SEO 단계에서 수행하지 않았다. HEIC 문구는 런타임 대조, HWP는 기존 기능 범위 확인이다.
- 여권사진 각국 제출 규정의 최신성·기관 승인 여부, 전체 S1의 공용 조건 검증기/입력 상한/분석 이벤트는 후속 범위다.

Google 안내: [URL 검사](https://support.google.com/webmasters/answer/9012289), [사이트맵](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). 실시간 테스트 통과나 사이트맵 제출은 색인·상위 노출을 보장하지 않는다.
