// HEX 롱테일 페이지 생성기: color/src/hex-template.html + color/src/hex-lite.css + color/color.js + 공통 셸(tools/shell.js)
//   → /color/hex/<6자리>/index.html (영어만, hreflang 없음) + /color/hex/hex.css (축약 CSS 한 장) + /color/hex/hex.js (헤더 스크립트 한 장, 전 페이지 공유)
// 색인 대상은 color/src/curated-colors.json 의 큐레이션 색(이름 유래·팔레트·웹/인쇄 문단 포함)뿐이고, 나머지는 noindex, follow. 사이트맵은 tools/build-sitemaps.js 가 만든다.
//   node tools/build-color-pages.js
// 대상 색 = CSS 이름 색 + 3자리 단축 HEX 전개 4096 + 자체 정의 팔레트 ~300 + 사이트 기본색·회색 단계 (중복 제거). 모든 값은 빌드 때 계산한 정적 HTML.
// 페이지 안의 모든 색 링크는 이 집합 안의 가장 가까운 색으로 맞춰(snap) 깨진 링크가 없다. 랜덤 5색은 hex 를 씨앗으로 써서 멱등.
//   --only ff5733,ff6347   일부만 생성(검사용, 사이트맵·robots 는 건드리지 않음)
const fs = require('fs'), path = require('path');
const shell = require('./shell');
const C = require('../color/color.js');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'color', 'src');
const outDir = path.join(root, 'color', 'hex');
const SITE = 'https://parkbok.com';
const CURATED = new Map(JSON.parse(fs.readFileSync(path.join(src, 'curated-colors.json'), 'utf8')).colors.map(c => [c.hex, c]));
const tpl = fs.readFileSync(path.join(src, 'hex-template.html'), 'utf8');
const minify = t => t.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('');
// 브랜드 마크 규칙(토큰 --brand·.brand-mark 크기)은 site.css 의 brand:start~end 블록을 그대로 가져와 hex-lite.css 뒤에 붙인다 — 헤더 마크가 바뀌어도 한 곳만 고친다
const brandCss = (fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8').match(/\/\* brand:start \*\/([\s\S]*?)\/\* brand:end \*\//) || [, ''])[1];
if (!brandCss) throw new Error('site.css 에 brand:start~end 블록이 없습니다');
const footerCss = (fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8').match(/\/\* footer:start[\s\S]*?\*\/([\s\S]*?)\/\* footer:end \*\//) || [, ''])[1];
if (!footerCss) throw new Error('Missing shared footer styles');
const css = minify(fs.readFileSync(path.join(src, 'hex-lite.css'), 'utf8')) + minify(brandCss) + minify(footerCss);
const cssVersion = require('node:crypto').createHash('sha256').update(css).digest('hex').slice(0, 8);
const esc = shell.esc;
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',').map(h => C.parse(h)).filter(Boolean) : null; })();

// ---------- 대상 색 집합 ----------
const set = new Set();
for (const n of C.names) set.add(C.NAMES[n]);                                   // CSS 이름 색
const D = '0123456789abcdef';
for (const r of D) for (const g of D) for (const b of D) set.add('#' + r + r + g + g + b + b);   // #rgb 전개 4096
// 자체 팔레트: 15° 간격 24색상 × 11단계 + 회색 3계열(중립·따뜻·차가움) × 11단계
const L = [96, 91, 84, 74, 64, 54, 46, 38, 30, 22, 14], S = [90, 88, 86, 84, 82, 80, 78, 76, 72, 68, 64];
for (let h = 0; h < 360; h += 15) L.forEach((l, i) => set.add(C.hslToHex({ h, s: S[i], l })));
[[0, 0], [30, 8], [220, 14]].forEach(([h, s]) => L.forEach(l => set.add(C.hslToHex({ h, s, l }))));
for (const h of CURATED.keys()) set.add(h);                                       // 큐레이션 색(CSS 이름 밖의 파스텔·브랜드 색 포함)
// 사이트 기본색(변환기 기본 #ff5733, site.css 토큰)과 흔한 회색 단계
['#ff5733', '#2563eb', '#1d4ed8', '#1e3a8a', '#eef3ff', '#1d2129', '#5d6675', '#e3e6ea', '#f6f7f9', '#0f172a', '#1e293b', '#e5e7eb', '#94a3b8', '#334155', '#93c5fd', '#b91c1c', '#16a34a', '#10b981', '#8b5cf6', '#64748b', '#ef4444', '#f59e0b', '#ec4899',
  '#101010', '#202020', '#303030', '#404040', '#505050', '#606060', '#707070', '#909090', '#a0a0a0', '#b0b0b0', '#d0d0d0', '#e0e0e0', '#f0f0f0', '#fafafa', '#f5f5f5', '#1a1a1a', '#2d2d2d', '#4a4a4a'].forEach(h => set.add(h));
const all = [...set].sort();
const grid = h => /^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/.test(h);
const extras = all.filter(h => !grid(h)).map(h => ({ hex: h, rgb: C.hexToRgb(h) }));   // 격자 밖 색만 거리 비교

// 집합 안에서 가장 가까운 색: 17 배수 격자로 즉시 맞춘 뒤, 격자 밖 색 중 더 가까운 것이 있으면 그것
function snap(hex){
  if (set.has(hex)) return hex;
  const c = C.hexToRgb(hex), q = v => Math.round(v / 17) * 17;
  let best = C.rgbToHex({ r: q(c.r), g: q(c.g), b: q(c.b) }), bd = C.distance(c, C.hexToRgb(best));
  for (const e of extras) { const d = C.distance(c, e.rgb); if (d < bd) { bd = d; best = e.hex; } }
  return best;
}
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const namesOf = hex => C.names.filter(n => C.NAMES[n] === hex).map(cap);
const href = hex => '/color/hex/' + hex.slice(1) + '/';           // 정식 주소(canonical·사이트맵)
const rel = hex => '../' + hex.slice(1) + '/';                        // 페이지 안 링크는 상대 경로로 줄여 6KB 를 지킨다
const UP = hex => hex.toUpperCase();
const level = r => { const l = C.contrastLevel(r); return l === 'fail' ? 'Fail' : l === 'AA-large' ? 'AA large' : l; };
const cell = (hex, cur) => { const cls = (C.textOn(hex) === '#ffffff' ? 'd' : '') + (hex === cur ? ' on' : ''); return `<a href="${rel(hex)}" style="background:${hex}"${cls.trim() ? ' class="' + cls.trim() + '"' : ''}>${hex.slice(1)}</a>`; };
const chip = (hex, label) => `<a href="${rel(hex)}"><i style="background:${hex}"></i>${label || UP(hex)}</a>`;
// 행별 복사 버튼은 아이콘만(hex.css 의 --i-copy), 접근성 이름은 aria-label
const row = (label, val) => `<div class="v"><b>${label}</b><code>${val}</code><button aria-label="Copy ${label}"></button></div>`;

// 셸 조각은 마커 주석과 스크립트의 // 줄 주석을 지워 6KB 를 지킨다 (한글 주석은 글자당 3B)
const slim = h => h.replace(/<!-- \/?shell:\w+ -->\n?/g, '').replace(/^\/\/[^\n]*\n/gm, '');
// 테마 버튼·모바일 메뉴는 전 페이지 공유 /color/hex/hex.js 로 빼서 같은 자리에 동기 로드한다. 브랜드 SVG도 외부 자산을 공유한다.
const headerFull = slim(shell.header({ lang: 'en', section: 'color', pdfHome: '/pdf/', imageHome: '/image/', colorHome: '/color/', langSelect: '', subnav: '' }));
const headerJs = (headerFull.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1].trim() + '\n';
// Analytics now uses the same external, consent-gated loader as every tool page.
const hexJs = headerJs;
// Do not let a cached pre-consent hex.js restart the old, unconditional GA loader.
const headerVersion = require('node:crypto').createHash('sha256').update(hexJs).digest('hex').slice(0, 8);
const header = headerFull.replace(/<script>[\s\S]*?<\/script>/, '<script src="/color/hex/hex.js?v=' + headerVersion + '"></script>');
const footer = slim(shell.footer({ lang: 'en' }));
const curatedRgb = [...CURATED.keys()].map(h => ({ hex: h, rgb: C.hexToRgb(h) }));
// 가장 가까운 큐레이션 색(자기 자신 제외) — 큐레이션 페이지끼리 서로 링크해 색인 페이지가 고립되지 않게 한다
const nearCurated = (hex, not) => { const c = C.hexToRgb(hex); let best = null, bd = Infinity; for (const e of curatedRgb) { if (e.hex === not) continue; const d = C.distance(c, e.rgb); if (d < bd) { bd = d; best = e.hex; } } return best; };
const cname = hex => CURATED.get(hex).name;
// 큐레이션 색의 본문: 이름 유래(손으로 쓴 문장) + 어울리는 팔레트 + 웹 사용 + 인쇄 사용 (+ 브랜드 고지)
function about(hex){
  const cur = CURATED.get(hex), rgb = C.hexToRgb(hex), hsl = C.rgbToHsl(rgb);
  const comp = nearCurated(C.rotate(hex, 180), hex), ana = [...new Set(C.analogous(hex).filter(h => h !== hex).map(h => nearCurated(h, hex)))].filter(h => h !== comp);
  const link = h => `<a href="${rel(h)}">${esc(cname(h))}</a>`;
  const ink = C.textOn(hex) === '#ffffff' ? 'white' : 'black', r = C.contrast(hex, ink === 'white' ? '#ffffff' : '#000000');
  const keyword = cur.kind === 'css' ? C.names.filter(n => C.NAMES[n] === hex).map(n => '<code>' + n + '</code>').join(' or ') : '<code>' + hex + '</code>';
  const vivid = hsl.s >= 80 && hsl.l >= 35 && hsl.l <= 75 && !(hsl.h >= 15 && hsl.h <= 60);   // 채도 높은 녹·청·보라·분홍 계열은 CMYK 범위 밖
  const print = hex === '#ffffff' ? 'leave the area unprinted, or specify a white ink on colored stock.' : hex === '#000000' ? 'use 100% K for text; large areas look deeper as a rich black such as 60/40/40/100.'
    : vivid ? 'a screen color this saturated sits outside the standard CMYK gamut and will print duller, so check a proof or choose a Pantone match.' : 'it falls within the usual CMYK range, but check a printed proof because paper and ink shift the tone.';
  const lines = [
    `<p>${esc(cur.note)}</p>`,
    `<li><b>Palette:</b> pair it with ${comp ? link(comp) + ' as a contrasting accent' : 'its complement'}${ana.length ? ', or with ' + ana.map(link).join(' and ') + ' for a softer, analogous scheme' : ''}. Lighter and darker steps are in the shade row above.</li>`,
    `<li><b>Web:</b> ${ink} text reads best on it (${r.toFixed(2)}:1, ${level(r)}). Write it in CSS as ${keyword}${cur.kind === 'css' ? ' or <code>' + hex + '</code>' : ''}.</li>`,
    `<li><b>Print:</b> about ${C.cmykString(C.rgbToCmyk(rgb))}; ${print}</li>`
  ];
  if (cur.kind === 'brand') lines.push('<li>Brand names only identify the color; parkbok is not affiliated with the brand owner, and official brand guidelines take precedence.</li>');
  return `<h2>About ${esc(cur.name)}</h2>${lines[0]}<ul class="facts">${lines.slice(1).join('')}</ul>`;
}

function page(hex){
  const rgb = C.hexToRgb(hex), hsl = C.rgbToHsl(rgb), hsv = C.rgbToHsv(rgb), cmyk = C.rgbToCmyk(rgb);
  const names = namesOf(hex), near = C.nearestName(hex), cur = CURATED.get(hex);
  const cw = C.contrast(hex, '#ffffff'), cb = C.contrast(hex, '#000000');
  const nameTag = names.length ? ' (' + names[0] + ')' : cur ? ' (' + cur.name + ')' : '';
  const title = 'Color ' + UP(hex) + nameTag + ' – RGB, HSL, Shades & CSS | parkbok';
  const description = UP(hex) + nameTag + ' – ' + C.rgbString(rgb) + ', ' + C.hslString(hsl) + '. Shades, harmonies, white/black contrast and CSS code.';
  const line = !names.length && cur ? 'Also known as <b>' + esc(cur.name) + '</b> · closest CSS color: ' + chip(near.hex, cap(near.name)) : names.length ? 'Named CSS color: <b>' + names.map(n => n.toLowerCase()).join('</b> / <b>') + '</b>' : 'Closest named color: ' + chip(near.hex, cap(near.name));
  const rows = row('HEX', UP(hex)) + row('RGB', C.rgbString(rgb)) + row('HSL', C.hslString(hsl)) + row('HSV', C.hsvString(hsv)) + row('CMYK', C.cmykString(cmyk));
  const ct = (fg, name, r) => `<div style="background:${hex};color:${fg}">${name}<b>${r.toFixed(2)} : 1</b><span>${level(r)}</span></div>`;
  const contrast = ct('#fff', 'White text', cw) + ct('#000', 'Black text', cb);
  const scale = C.scale(hex, 10).map(h => cell(snap(h), hex)).join('');
  const comp = snap(C.rotate(hex, 180)), ana = C.analogous(hex).filter(h => h !== hex).map(snap), tri = C.triadic(hex).slice(1).map(snap);
  const harmony = chip(comp) + ana.map(h => chip(h)).join('') + tri.map(h => chip(h)).join('');
  const csscode = `color: ${hex};\nbackground: ${hex};\nborder: 1px solid ${hex};`;
  const r = rng(parseInt(hex.slice(1), 16)), picks = [];
  while (picks.length < 5) { const h = all[Math.floor(r() * all.length)]; if (h !== hex && picks.indexOf(h) < 0) picks.push(h); }
  const crumbs = shell.breadcrumb('en', [{ name: shell.strings('en').home, url: '/' }, { name: 'Color tools', url: '/color/' }, { name: UP(hex), url: href(hex) }]);
  const vars = { robots: cur ? '' : '<meta name="robots" content="noindex, follow">\n', crumbs: crumbs.html, jsonld: JSON.stringify(crumbs.jsonld).replace(/</g, '\\u003c'), about: cur ? about(hex) : '', title: esc(title), description: esc(description), canonical: SITE + href(hex), hex, hex6: hex.slice(1), HEX: UP(hex), ink: C.textOn(hex) === '#ffffff' ? '#fff' : '#000',
    h1: UP(hex) + (names.length ? ` <small>(${names.join(' / ')})</small>` : ''), line,
    rows, contrast, scale, harmony, csscode, random: picks.map(h => cell(h)).join(''), adsense: shell.ADSENSE, ga: shell.GA };
  let html = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  html = html.split('{{shell_header}}').join(header).split('{{shell_footer}}').join(footer).split('{{favicon}}').join(shell.favicons()).replace('/color/hex/hex.css"', '/color/hex/hex.css?v=' + cssVersion + '"');
  return html;
}

// ---------- 생성 (바뀐 파일만 쓰기) ----------
const targets = only || all;
fs.mkdirSync(outDir, { recursive: true });
const cssPath = path.join(outDir, 'hex.css');
if (!fs.existsSync(cssPath) || fs.readFileSync(cssPath, 'utf8') !== css) fs.writeFileSync(cssPath, css, 'utf8');
const jsPath = path.join(outDir, 'hex.js');
if (!fs.existsSync(jsPath) || fs.readFileSync(jsPath, 'utf8') !== hexJs) fs.writeFileSync(jsPath, hexJs, 'utf8');
let written = 0, bytes = 0, max = 0, maxHex = '';
for (const hex of targets) {
  const html = page(hex), dir = path.join(outDir, hex.slice(1)), file = path.join(dir, 'index.html');
  const n = Buffer.byteLength(html); bytes += n; if (n > max) { max = n; maxHex = hex; }
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === html) continue;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, html, 'utf8');
  written++;
}
let removed = 0;
if (!only && fs.existsSync(outDir)) for (const n of fs.readdirSync(outDir)) if (n !== 'hex.css' && n !== 'hex.js' && !set.has('#' + n)) { fs.rmSync(path.join(outDir, n), { recursive: true, force: true }); removed++; }

console.log('hex pages:', targets.length, '| curated (indexable):', CURATED.size, '| written:', written, '| removed:', removed, '| total:', (bytes / 1024).toFixed(0) + 'KB', '| max:', max + 'B (' + maxHex + ')', '| avg:', Math.round(bytes / targets.length) + 'B');
