# PARKBOK 핵심 색인·검색 작업·첫 외부 사용자 체크리스트

조사 시작: 2026-11-03, 실행 기록 마감: 2026-11-04 KST. 기준 커밋 `94551328c0435626e548f0b56fc63468b62cb2b0`, 작업 브랜치 `codex/search-first-users`.
요청: 영어·한국어 핵심 페이지의 개별 색인 상태/미등록 사유 확인, 100KB 등 실제 작업 중심 검색 유입 보완, 외부 10명의 실제 사용 확인. 서버 운영·유료 광고·보상은 추가하지 않는다.

**2026-11-04 목표 변경:** 사용자가 3번 모집을 취소했다. 모집 글 게시·지인 초대·10명 확보·디스콰이엇 로그인 대기는 종료한다. 현재 목표는 해외 사용자의 자연검색 방문과 실제 도구 사용이다. 1번은 기술 점검·11개 요청 접수 완료/실제 색인 대기, 2번은 100KB·200KB 작업 보완·배포 완료이며 해외 검색 유입 달성까지 뜻하지 않는다.

## I. 색인

- [x] IX-01 공개 대표 URL 12개의 HTTP 200, 자기 URL canonical, H1 1개, noindex 없음 확인. 다국어 도구 10개는 8언어 및 x-default 링크를 제공한다. robots.txt는 공개 수집을 허용한다.
- [x] IX-02 Search Console에서 도구 5종×영어/한국어 및 홈·HWP 12개를 개별 검사했다. 등록 1개·발견 후 미색인 7개·알려지지 않음 4개. `output/first-users/gsc-inspections.json`에 조회 당시 결과를 보관한다.
- [x] IX-03 ‘발견됨/아직 크롤링 안 됨’과 ‘Google에 알려지지 않음’을 접속 장애나 noindex로 오진하지 않는다. 페이지 등록 여부는 개별 검사로 판단하며 10월 23일 집계의 ‘색인 2개’를 현재 전체 수로 간주하지 않는다.
- [x] IX-04 HWP 실제 URL 테스트 ‘Google에 등록할 수 있음’ 통과. 홈을 제외한 11개 전부 요청 전 Google 검사와 ‘색인 생성 요청됨’ 접수를 확인했다. 각 URL은 이번 실행에서 1회씩만 요청했다. 자동 보안 확인이 정상 통과했으며 사람이 풀어야 하는 CAPTCHA를 대신 해결하지 않았다. `output/first-users/gsc-submissions.json`에 11개 고유 URL의 접수 화면 원문을 기록했다.
- [ ] IX-05 Google이 실제 색인 처리한 것을 후속 개별 검사로 확인. 요청 접수만으로 완료 처리하지 않는다.

## II. 검색 작업과 실제 기능

### 개별 검사 기록

| URL | 2026-11-03 검사 결과 |
|---|---|
| `/` | 등록됨 |
| `/hwp/` | Google에 알려지지 않음 |
| `/pdf/merge/ko/` | 발견됨·현재 미색인 |
| `/pdf/merge/` | Google에 알려지지 않음 |
| `/image/image-compress/ko/` | 발견됨·현재 미색인 |
| `/image/image-compress/` | 발견됨·현재 미색인 |
| `/image/passport-photo/ko/` | 발견됨·현재 미색인 |
| `/image/passport-photo/` | 발견됨·현재 미색인 |
| `/image/heic-to-jpg/ko/` | 발견됨·현재 미색인 |
| `/image/heic-to-jpg/` | 발견됨·현재 미색인 |
| `/color/palette/ko/` | Google에 알려지지 않음 |
| `/color/palette/` | Google에 알려지지 않음 |

- [x] KW-01 영어·한국어 기존 이미지 압축 페이지를 100KB·200KB 작업에 맞춰 title, description, lead, FAQ 및 그 생성 원본에 반영했다. 목표를 반드시 맞춘다는 표현을 쓰지 않는다.
- [x] KW-02 0·50·100·200·500 KB 바로 선택, `?maxKb=100` 기본값 링크를 구현했다. 악성/음수/소수/범위 초과 URL 값은 적용하지 않는다. 기존 canonical을 유지한다.
- [x] KW-03 목표 변경 시 이전 결과 무효화, 초과 경고, 기본 압축 경로를 유지한다. 한국어·영어×1280/375×라이트/다크 8화면 가로 넘침 0·선택 버튼 44px·JS 예외 0 확인.
- [x] KW-04 로컬/프리뷰와 내부 표식 브라우저에서는 사용 이벤트를 보내지 않는다. 운영 호스트 모사에서 실행→결과→다운로드 순서, 성공/목표 초과 상태, 파일 정보 제외를 확인했다. 모든 검사에서 실제 Google 분석 요청을 차단했다.
- [x] KW-05 전체 빌드 365페이지·33헤더 그룹 실패 0, Node 테스트 187개, Python 테스트 9개 통과. 패키지 5,023파일, 4,925 URL, 내부 참조 184,956건 검증. HEX 4,560개의 자동 재생성 공백 변경은 구현 커밋에서 제외한다.
- [x] KW-06 `04ca4c995f4cc38629889be4e1454f6602389f79` main 반영·push. GitHub Pages https://github.com/bokS-B/parkbok-site/actions/runs/41656309653 성공. 운영 `/build-info.json` 일치, 한국어·영어 모바일에서 100KB 기본값·실제 27,735B 파일 다운로드·선택 변경 무효화·내부 이벤트 0 확인.

## III. 외부 사용자 10명 — 사용자 취소, 아래는 작업 이력

- [x] FU-01 실제 사용자 기준 확정: 서로 다른 외부인이 자기 사진을 처리해 목표 용량·저장을 확인한 응답. 단순 방문·국가·반복 검사·GA4 활성 사용자 수를 10명으로 세지 않는다.
- [x] FU-02 `tool_start`, `tool_result`, `tool_download`, `tool_error` 이벤트와 개인정보처리방침 안내를 추가했다. 파일 이름·본문·이미지·정확한 바이트 크기는 보내지 않는다. `tool_download`는 다운로드 실행이며 OS 저장 완료 증명은 아니다.
- [x] FU-02a GA4 이벤트 범위 맞춤 정의 `도구 종류:tool_id`, `도구 결과 상태:result_status` 2개를 생성하고 저장된 목록에서 확인했다. 기존 필터·권한·광고 링크는 변경하지 않았다.
- [x] FU-02b `PARKBOK 첫10명 사용검증` 탐색 보고서를 생성했다. https://analytics.google.com/analytics/web/#/analysis/a265631684p371790506/edit/alO-niyHSDezKqtwWLqWmg — 행 이벤트 이름/도구 결과 상태, 값 활성 사용자/이벤트 수, 필터 hostname=parkbok.com·session campaign=first10·event name=`^tool_(start|result|download|error)$`. 기존 탐색 보고서는 수정하지 않았다. 새 보고서는 아직 데이터 없음이며 실제 외부인 10명으로 해석하지 않는다.
- [x] FU-03 한국어/영어 모집 글, 채널별 first10 UTM 링크, 참가 과제·응답 질문·10명 확인표를 `FIRST_USERS_RECRUITMENT_KO.md`에 준비했다.
- [x] FU-04 한국어 디스콰이엇 공개 피드의 제품 피드백 모집 맥락을 확인했다. 조사 당시 Chrome은 로그아웃 상태였다. 모집 취소에 따라 로그인·채널 답변 대기도 종료한다.
- **취소 FU-05** 공개 모집 글 게시·초대 전달. 실제 게시 0건인 상태에서 사용자가 취소했다.
- **취소 FU-06** 외부 성공 사용자 10명 확보·응답 대조. 확보 완료가 아니라 목표 취소다.

### 현재 추적할 지표

- 2026-11-04 AdSense 사전 점검 후 측정 방식 변경: [ADSENSE_READINESS_CHECKLIST.md](ADSENSE_READINESS_CHECKLIST.md). 배포 후 GA4는 통계 허용 방문자만 포함하므로 전체 방문자 수로 읽지 않는다. 인증 광고 CMP와 광고 개시는 별도 단계다.

- Search Console: 영어 핵심 URL의 색인 여부 → 국가/검색어별 실제 노출 → 클릭.
- GA4: 운영 도메인·자연검색 유입의 해외 접속 국가와 이미지 압축 결과/다운로드. 국가 정보는 실제 국적이나 사람 수를 증명하지 않는다.
- `first10` 캠페인 필터가 있는 기존 모집 전용 탐색 보고서는 일반 해외 자연검색을 보여주지 않는다. 해외 자연검색 판정에 쓰지 않는다.
- 더 많은 국가 페이지·언어·기능을 구현했다고 기록하지 않는다. 이번 검색 작업 보완은 영어·한국어 이미지 압축의 100KB·200KB에 한정된다.

## IV. 운영자가 읽을 자료

- [x] DOC-01 `SEO_FIRST_USERS_GUIDE_KO.md`: 용어, 확인할 보고서, 측정·모집 기준, 7/14/28일 확인 순서와 한국어 공식 자료 링크.
- [x] DOC-02 기존 로고·색 조합/마스코트 승인 상태·다른 HWP/Office 작업 트리와 분리했다.

## 남은 외부 조건

Google의 실제 크롤링/색인·검색 노출·유입은 코드 배포와 구분한다. 실제 검색 결과나 해외 사용 기록이 생기기 전에 달성으로 표시하지 않는다. 사용자 모집·로그인 요청은 취소됐다.

## 배포·인계 기록

- 제품 배포: `04ca4c995f4cc38629889be4e1454f6602389f79`, 되돌릴 기준 `94551328c0435626e548f0b56fc63468b62cb2b0`. 운영 빌드와 GitHub Actions 성공을 확인했다.
- 실제 운영 테스트: 한국어·영어의 100KB 링크에서 테스트 사진 52,021B → 27,735B, 다운로드 성공. 내부 브라우저의 도구 이벤트 0, 목표 변경 시 이전 결과 무효화, JS 오류 0.
- 계정 변경: GA4 새 맞춤 측정기준 2개 및 새 탐색 보고서 1개만 추가했다. 기존 Internal Traffic 활성화·광고 연결·접근 권한은 변경하지 않았다.
- 남은 목표: Google 실제 색인 처리와 해외 자연검색 방문·실제 도구 사용. 접수 11개를 색인 완료 11개로 표시하지 않는다.
- 디스콰이엇 로그인 화면을 열었던 인계는 2026-11-04 사용자 취소로 종료했다. `FIRST_USERS_RECRUITMENT_KO.md`는 보관용이며 로그인 완료 메시지가 늦게 도착해도 취소한 모집을 임의로 재개하지 않는다.
- 이 마감 문서 커밋은 `[skip ci]`로 제품 재배포를 생략한다. 운영 제품 버전은 위 제품 배포 커밋이다.

## V. 사이트맵 인덱스 재제출 — 2026-11-04 KST

사용자 요청에 따라 `https://parkbok.com/sitemap.xml`을 Google Search Console·네이버 서치어드바이저·Bing Webmaster Tools에 다시 제출했다. 사이트맵 구조는 기존 SEO 배포의 내용을 사용하며 이번 작업에서 웹사이트 코드를 수정하지 않았다.

- [x] SM-01 공개 최상위 XML 200·application/xml·sitemapindex 확인. 하위 `sitemap-core.xml` 40개, `sitemap-tools.xml` 317개, `sitemap-colors.xml` 176개가 각각 200·urlset이며 합계 533 URL. robots.txt의 Sitemap 선언도 최상위 주소와 일치.
- [x] SM-02 Google의 `sc-domain:parkbok.com` 속성에 최상위 전체 주소 재제출. ‘사이트맵이 제출됨’ 확인. 제출·마지막 읽은 날짜 2026-11-04, 유형 Sitemap 색인, 상태 성공. 직후 발견된 페이지 0은 새 인덱스의 처리 시점 값이며 533개 색인 완료로 읽지 않음. 기존 11월 3일 단일 Sitemap·360개 표시는 갱신됨.
- [x] SM-03 네이버 기존 `sitemap.xml` 제출 기록 갱신. ‘삭제하면 복구 하실수 없습니다’ 확인창에서 사용자에게 삭제 직전 승인을 받았고, 기존 기록이 제거된 것을 확인한 뒤 동일 전체 주소 재등록. 새 등록일 `26.11.04 09:24:31`. `sitemap-colors.xml`의 별도 기존 등록은 `26.11.03 16:51:50` 그대로 유지.
- [x] SM-04 Bing의 parkbok.com 속성에서 기존 최상위 행의 More → Re-submit 실행. Last submit 11/4/2026, 상태 Processing 확인. Last crawl 11/3/2026·360개는 아직 이전 처리 값이며 최신 533개 발견 완료라고 표시하지 않음.
- [x] SM-05 접수 상태와 증빙을 `output/sitemap-resubmit/report.json` 및 `google-accepted.png`, `google-submitted.png`, `naver-submitted.png`, `bing-resubmitted.png`에 저장. 캡처와 계정 정보는 공개 배포하지 않음.

**재제출 작업은 완료, 검색엔진의 실제 수집·색인·노출은 후속 처리다.** 최상위 인덱스가 하위 세 XML을 가리키므로 별도 색상 등록을 반복하거나 대량 URL 색인 요청을 추가하지 않았다. 기존 접근 권한·소유확인·광고/통계 설정은 바꾸지 않았다. 이 기록만 `[skip ci]`로 저장하며 현재 공개 제품 빌드는 `e3a0776bc`다.

참고: [Google 사이트맵 제작·제출](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=ko), [네이버 사이트맵 인덱스 안내](https://searchadvisor.naver.com/guide/request-feed), [Bing 사이트맵 제출·처리 상태 안내](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed).
