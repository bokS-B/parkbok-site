# 색 조합 페이지: 구현·검증·배포 체크리스트

- 날짜: 2026-11-03 KST
- 요청: 실제 색 조합 페이지에 5색 24세트, 귀여운 템플릿 3개, 애니메이션, HTML·CSS 내보내기 적용. 로컬에서 먼저 확인.
- 브랜치: `codex/palette-studio`, 기준 `58bbd111d0290a52bdd387fde1ffa9a83d85fdb9`.
- 로컬: http://127.0.0.1:8796/color/palette/ko/ . 기존 `node tools/preview-hallmark.js 8796` 서버 사용.
- 상태: 2026-11-03 사용자 승인 후 공개 배포·운영 검증 완료. 제품 배포 커밋 `830fa88be25e4b41aa4f17356e79e263ef33ca99`. 다른 HWP·Office 작업 트리는 수정하지 않음.

## 구현

- [x] PS-01 24세트를 미니멀·자연·따뜻한·시원한·파스텔·선명한·클래식·깊은 밤 8분류에 각 3세트씩 제공한다.
- [x] PS-02 각 세트에 배경·카드·본문·주색·보조색 5역할을 지정한다. 역할별 색 선택·HEX 편집·중립 복사 아이콘을 제공한다. 기본은 딸기 우유 배색이다.
- [x] PS-03 토끼 우체국: 원본 SVG 토끼와 봉투, 체크 무늬, 스티커, 펼쳐 읽는 쪽지. 몽글 상점: 고양이 파우치, 선물 리본 체크, 상품 정보 펼치기. 조각조각 하루: 고양이 스티커, 할 일 체크, 기분 선택. 가격은 예시 상품으로 표시한다.
- [x] PS-04 세 템플릿은 같은 색상 상태·렌더러를 공유한다. 템플릿 전환 시 쪽지·선물·할 일·기분 상태를 보존한다.
- [x] PS-05 색 전환 180ms, 버튼 hover 120ms/2px, 템플릿 전환 180ms, 캐릭터 인사 700ms/1회. 계속 반복하는 자동 애니메이션은 없다. 움직임 끄기와 OS `prefers-reduced-motion`을 지원한다.
- [x] PS-06 24세트의 라이트·다크 변형을 제공한다. 기본 세트 48상태의 본문/카드/버튼/강조 글자 대비는 모두 4.5:1 이상, 최저 4.59:1이다. 직접 편집으로 낮은 대비가 되면 경고한다. 이는 페이지 전체 접근성 인증을 뜻하지 않는다.
- [x] PS-07 HTML+CSS, 범위가 `.pb-demo`인 CSS 변수, JSON, 단독 HTML 다운로드를 제공한다. HTML에는 현재 열림·체크 상태도 반영한다. 공유 링크는 현재 5색·템플릿·모드·움직임을 보존한다.
- [x] PS-08 내려받는 HTML에는 스타일·폰트·라이선스·원본 SVG가 들어간다. 스크립트·CDN·외부 이미지·서버 없이 네이티브 details/checkbox/radio가 작동한다. 상점은 실제 결제 기능이 없는 디자인 예시다.
- [x] PS-09 기존 기준색/배색 해시 링크와 7개 배색 규칙을 유지한다. 규칙은 접은 영역에 둔다. 손상된 공유 링크는 안전한 기본 상태와 안내로 처리한다.
- [x] PS-10 도구 조작부는 기존 8언어를 지원한다. 사용자 최종 선택에 따라 예시 3개·예시 선택 이름·HTML 내보내기는 영어를 기본으로 한다. 팔레트 고유 이름은 한국어/영어로 제공한다. 하단 설명·FAQ 및 FAQ 구조화 데이터는 8언어 모두 제거했다.

## 소스와 생성

- `color/palette-data.js`: 24세트와 분류. 5색은 웹 화면에서의 역할을 기준으로 배치했다. 장식용 선·그림자·버튼 위 글자색은 별도로 파생한다.
- `color/palette-core.js`: 역할 색, 대비 수치, 모드 변형, 공유 주소 검증.
- `color/palette-strings.js`: 8언어 UI·템플릿 원고.
- `color/palette-templates.js`: 원본 SVG, HTML 렌더러, 내보내기 기반.
- `color/src/palette-templates.css`: 템플릿 CSS 원본. `color/palette-studio.css`: 도구 조작부 CSS.
- `tools/build-palette-assets.js`: CSS와 포함 폰트·OFL 고지를 `color/palette-template-style.js`로 생성한다. 생성 파일 직접 편집 대신 원본 CSS를 수정하고 `node tools/build-color.js`를 실행한다.
- `color/src/tools/palette.json`: 제목·설명의 생성 원본. 색 조합 페이지 8개와 색상 허브 카드 설명 8개를 재생성한다. 사용자 요청으로 `showAbout: false`를 지정해 하단 설명을 생성하지 않으며 FAQ 문구·FAQ 구조화 데이터도 제거했다.

## 폰트 출처

- Jua Regular: https://github.com/google/fonts/tree/main/ofl/jua . 공식 원본 TTF: https://raw.githubusercontent.com/google/fonts/main/ofl/jua/Jua-Regular.ttf . 라이선스: https://raw.githubusercontent.com/google/fonts/main/ofl/jua/OFL.txt . Copyright 2018 The Jua Project Authors, SIL OFL 1.1.
- 원본 TTF 2,119,352B, SHA-256 `769677aef240bfc3b9965f2b50748075bff885e6c6992fc591a3fb268279f898`.
- fontTools 4.67로 예시/문구의 글리프를 추려 WOFF로 저장했다. 내부 name ID 1/4/6을 ParkbokPocket으로 바꾸고 CSS 이름은 PB Pocket으로 쓴다. 서브셋에 없는 문자는 시스템 폰트로 표시한다.
- `color/palette-pocket.woff`: 95,860B, SHA-256 `ffb7ff1fc8203cd81008c9576eb15fd4c6d76735cefca594778a157526ffded9`. 원본·작업 파일은 무시되는 `_build/palette-font/`에 있다. 향후 예시의 한국어 문구를 바꿀 때 새 글리프를 다시 추린다.
- 라이선스 원문은 `assets/vendor/licenses/Jua-OFL.txt`, 고지는 `assets/vendor/LICENSES.md`. HTML+CSS와 단독 HTML에도 원문을 넣는다. CI에는 외부 다운로드나 Python 폰트 패키지가 필요하지 않다.

## 검증

- [x] PS-11 `node --test tests/*.test.js tests/*.test.cjs`: 186개 통과. 새 색 조합 테스트 56개 포함. 24세트×2모드 대비·공유 복원, 구형 링크, 손상/악성 해시, 저대비 측정, 내보내기 범위·이스케이프·라이선스, 8언어 문구 검증.
- [x] PS-12 브라우저: 24세트×2모드 48상태, 8분류 각 3세트, 3템플릿×1280/375×라이트/다크 12화면. 가로 넘침 0, 대표 내보내기 버튼 높이 56px.
- [x] PS-13 직접 편집한 다크 주색 정확히 유지, 낮은 대비 경고, 잘못된 입력 거부·초기화, 5색 공유 링크 복원, 구형 링크·손상된 주소 안내, 실제 1280→375 축소, OS 움직임 줄이기 확인.
- [x] PS-14 단독 HTML 6개(3템플릿×2모드)를 실제 다운로드해 file://에서 열었다. 데스크톱에서 루트 폭·높이·5색·열림/체크 상태가 미리보기와 같고, 쪽지/선물/체크 조작도 작동했다. 375×812에서도 6개 모두 가로 넘침 0. 외부 네트워크 요청 0.
- [x] PS-15 8언어×3템플릿 모바일 24화면과 내보내기 창 가로 넘침 0. 검사 중 미처리 JS 예외 0, POST/PUT/PATCH 0, 분석·광고를 제외한 외부 요청 0. 검수 브라우저에서만 GA·광고 요청을 차단했다.
- [x] PS-16 전체 생성기와 공통 셸 검사 365페이지/33그룹 실패 0. Python 배포 검사 9개 통과. 실제 배포 패키지 5,023파일·일반 sitemap 365/색상 4,560·내부 참조 184,956건 검사 통과. 패키지 생성은 업로드·배포가 아니다.
- [x] PS-16a 새 런타임 자산 7개의 패키지 포함·원본 바이트 일치를 확인했다. 나머지 색상 도구 5개(변환·추출·그라데이션·대비·랜덤)도 모바일에서 조작부 로드·가로 넘침 0·JS 예외 0을 확인했다.
- [x] PS-17 검증 중 발견한 기존 생성기 문제 수정: `tools/build-site.js`와 `tools/check-shell.js`에서 `output`/`tests`를 제외한다. 검사로 받은 HTML에 셸이 삽입되거나 비공개 산출물 URL이 사이트맵에 들어가는 것을 막는다. 수정 뒤 전체 빌드를 다시 실행해 HTML 6개의 SHA-256 불변·사이트맵에 output URL 0을 검증했다. 공개 파일 허용 목록은 확장하지 않는다.
- [x] PS-18 사용자가 로컬 예시를 확인하고 “좋아 이대로 커밋하고 배포해줘”로 배포를 지시했다.
- [x] PS-19 최종 변경 후 전체 빌드 365페이지·33헤더 그룹 실패 0, Node 테스트 186개·Python 테스트 9개 통과. 영어 예시 3개×1280/375에서 가로 넘침 0, HTML 복사·실제 내려받은 문서의 영어 문구와 `lang="en"`을 확인했다.
- [x] PS-20 main 반영·push, GitHub Pages 성공 및 운영 도메인의 해당 커밋·예시·내보내기·설명 제거 확인.

## 공개 배포 확인

- 배포 커밋: `830fa88be25e4b41aa4f17356e79e263ef33ca99`. 이전 배포 기준: `58bbd111d0290a52bdd387fde1ffa9a83d85fdb9`.
- GitHub Pages: https://github.com/bokS-B/parkbok-site/actions/runs/41646495779 — 빌드·테스트·패키지·배포 전 단계 성공.
- 운영: https://parkbok.com/color/palette/ko/ . `/build-info.json`의 commit이 배포 커밋과 일치한다.
- 24팔레트 확인. 예시 3개×1280/375×라이트/다크 총 12화면에서 영어 표시·`lang="en"`·가로 넘침 0 확인. 하단 설명 블록 0개, 미처리 JS 오류 0개.
- 예시 3개에서 HTML 복사 완료, CSS 변수·JSON을 확인하고 실제 HTML 파일 3개를 내려받았다. 모바일 오프라인에서 언어·쪽지 열림·체크 상태 유지, 가로 넘침 0, 외부 요청 0.
- 배포 패키지: 5,023파일, 사이트맵 365+4,560 URL, 내부 참조 184,956건 검증. 새 팔레트 자산 9개 바이트 일치. 취소한 마스코트 및 비공개 작업 디렉터리 제외.
- 운영 검증 자료: `output/playwright/palette-studio/production-830fa88be.json`, `production-830fa88be.png`, `live-website.html`, `live-shop.html`, `live-planner.html` (배포 제외).
- 이 확인 기록의 후속 커밋은 문서만 변경하며 `[skip ci]`로 제품 재배포를 생략한다. 운영 제품 버전은 위 배포 커밋이다.

## 재검증 자료·한계

- `tests/palette-studio-browser-check.js`를 Playwright MCP의 `browser_run_code_unsafe`에서 실행한다. 로컬 8796 서버가 필요하다. 실제 다운로드/복사/네이티브 조작까지 확인한다.
- 무시되는 `output/playwright/palette-studio/browser-report.json`, 화면 PNG, `exports/*.html`에 검사 자료를 저장한다. 자료 폴더는 배포하지 않는다.
- Windows Chromium 검증이다. 실제 휴대폰·Safari·Firefox는 미확인이다. 다른 사이트의 기존 CSS 안에 여러 복사본을 넣는 모든 경우까지 보증하지 않는다.
- 수동 편집으로 지정한 색의 대비는 항상 자동으로 맞추지 않는다. 경고를 보고 사용자가 조정할 수 있다. 공유 링크는 현재 모드의 5색을 저장하며 쪽지·체크 상태는 HTML/JSON에 보존된다.


## 마스코트 작업 취소

- 사용자 요청으로 치와와·리트리버 적용과 관련 편집을 전부 취소했다. 마스코트 작업 전 로컬 배포 패키지의 템플릿·문구·스타일을 복원했다. 토끼 우체국·고양이 파우치·고양이 플래너와 기존 24팔레트·내보내기를 유지한다.
- 전달받은 원본과 편집 작업 파일은 `_build/mascot-cancelled/`에 보관하며 제품·내보내기에는 포함하지 않는다. 공개 배포 없음.

## 예시 기본 언어

- 사용자 요청으로 3개 예시를 영어로 표시한다. 예시 이름은 Bunny Post · Mongle Shop · Little Day이며, 예시 안의 문구·HTML 복사·단독 HTML 다운로드 모두 같은 영어 문구를 사용한다. 예시 영역과 내려받은 문서는 `lang="en"`을 지정한다. 도구 조작부는 페이지 언어를 따른다.
