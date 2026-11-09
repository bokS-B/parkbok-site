# assets/vendor — 브라우저 PDF·이미지 도구가 쓰는 외부 라이브러리

모든 파일은 공식 CDN 에서 내려받은 원본 배포 파일이다(수정 없음). 외부 CDN 런타임 로드 대신 이 폴더에서 지연 로드한다.

| 파일 | 라이브러리 | 버전 | 라이선스 | 출처 |
|---|---|---|---|---|
| pdf-lib.min.js (525,099 B) | pdf-lib | 1.17.1 | MIT (내장 tslib 는 Apache-2.0 / 0BSD) | https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js |
| pdf.min.js (320,004 B) | pdf.js (pdfjs-dist) | 3.11.174 | Apache-2.0 | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js |
| pdf.worker.min.js (1,087,212 B) | pdf.js worker | 3.11.174 | Apache-2.0 | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js |
| jszip.min.js (97,630 B) | JSZip | 3.10.1 | MIT 또는 GPLv3 (이중, MIT 로 사용) | https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js |
| libheif-bundle.js (1,165,024 B) | libheif-js (libheif 1.17 Emscripten/wasm 번들, .wasm 내장) | 1.17.1 | LGPL-3.0 (libheif) · 래퍼는 MIT | https://unpkg.com/libheif-js@1.17.1/libheif-wasm/libheif-bundle.js |
| piexif.js (76,516 B) | piexifjs | 1.0.6 (파일 내부 version 문자열은 1.0.4) | MIT | https://raw.githubusercontent.com/hMatoba/piexifjs/1.0.6/piexif.js |
| cfb.min.js (34,209 B) | cfb | 1.2.2 | Apache-2.0 | https://unpkg.com/cfb@1.2.2/dist/cfb.min.js |
| pako.min.js (45,988 B) | pako | 1.0.11 | MIT AND Zlib | https://unpkg.com/pako@1.0.11/dist/pako.min.js |

- pdf-lib: https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md (MIT)
- pdf.js: https://github.com/mozilla/pdf.js/blob/master/LICENSE (Apache-2.0)
- JSZip: https://github.com/Stuk/jszip/blob/main/LICENSE.markdown (MIT/GPLv3), 내장 pako 는 MIT
- libheif-js: https://github.com/catdad-experiments/libheif-js (MIT 래퍼) / libheif: https://github.com/strukturag/libheif/blob/master/COPYING (LGPL-3.0). 수정 없이 원본 번들 그대로 사용하며 HEIC 디코드에만 지연 로드한다. LGPL 에 따라 이 파일은 교체 가능한 별도 파일로 둔다.
- piexifjs: https://github.com/hMatoba/piexifjs/blob/master/LICENSE.txt (MIT). JPEG EXIF 읽기·쓰기·삭제(/image/exif/)에만 지연 로드한다. GitHub 1.0.6 태그의 원본 파일(LF)을 그대로 둔다.
- cfb·pako: HWP 편집을 열 때만 로드한다. 아래 HWP 뷰어 번들과 같은 패키지 버전의 npm 배포본이다.

## assets/hwp-bundle.js (HWP 뷰어 번들)

`assets/hwp-bundle.js` 는 `_build/`(gitignore, esbuild) 에서 아래 패키지를 묶은 파일이다. 버전은 `_build/node_modules/<pkg>/package.json`, 라이선스 원문은 각 패키지의 LICENSE 파일을 `licenses/` 에 그대로 복사했다(2026-11-03). NOTICE 파일은 여섯 패키지 모두 배포본에 없다.

| 패키지 | 버전 | 라이선스 | 원문 | 출처 |
|---|---|---|---|---|
| hwp.js | 0.0.3 | Apache-2.0 | licenses/hwp.js-LICENSE.txt | https://github.com/hahnlee/hwp.js |
| fflate | 0.8.3 | MIT | licenses/fflate-LICENSE.txt | https://github.com/101arrowz/fflate |
| cfb | 1.2.2 | Apache-2.0 | licenses/cfb-LICENSE.txt | https://github.com/SheetJS/js-cfb |
| crc-32 | 1.2.2 | Apache-2.0 | licenses/crc-32-LICENSE.txt | https://github.com/SheetJS/js-crc32 |
| adler-32 | 1.3.1 | Apache-2.0 | licenses/adler-32-LICENSE.txt | https://github.com/SheetJS/js-adler32 |
| pako | 1.0.11 | MIT AND Zlib | licenses/pako-LICENSE.txt | https://github.com/nodeca/pako |

- 공개 고지: /terms.html §5 와 홈 푸터(hwp.js). Apache-2.0 제4조에 따라 라이선스 원문을 함께 배포한다.

## 색 조합 템플릿 글꼴

- `color/palette-pocket.woff`: Google Fonts의 Jua Regular에서 템플릿 문구에 쓰는 글리프를 추린 파생본. 내부 이름은 ParkbokPocket, CSS 이름은 PB Pocket이다. Copyright 2018 The Jua Project Authors, SIL Open Font License1.1.
- 원본: https://github.com/google/fonts/tree/main/ofl/jua . 원문: `licenses/Jua-OFL.txt`.
- 원본 TTF SHA-256 및 서브셋 과정은 `PALETTE_STUDIO_CHECKLIST.md`에 기록한다. 런타임 외부 폰트 요청 없이 생성된 CSS의 data URL로 포함한다. HTML 내보내기에도 저작권·OFL 원문과 폰트가 함께 들어간다.
