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

- pdf-lib: https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md (MIT)
- pdf.js: https://github.com/mozilla/pdf.js/blob/master/LICENSE (Apache-2.0)
- JSZip: https://github.com/Stuk/jszip/blob/main/LICENSE.markdown (MIT/GPLv3), 내장 pako 는 MIT
- libheif-js: https://github.com/catdad-experiments/libheif-js (MIT 래퍼) / libheif: https://github.com/strukturag/libheif/blob/master/COPYING (LGPL-3.0). 수정 없이 원본 번들 그대로 사용하며 HEIC 디코드에만 지연 로드한다. LGPL 에 따라 이 파일은 교체 가능한 별도 파일로 둔다.
- piexifjs: https://github.com/hMatoba/piexifjs/blob/master/LICENSE.txt (MIT). JPEG EXIF 읽기·쓰기·삭제(/image/exif/)에만 지연 로드한다. GitHub 1.0.6 태그의 원본 파일(LF)을 그대로 둔다.
