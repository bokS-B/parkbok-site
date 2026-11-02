// 사이트 빌드: 돌림판(wheel/)을 제외한 모든 HTML 페이지에 공통 셸(head-common · header · footer)을 끼우고
// 사이트맵의 site 블록을 갱신한다. 여러 번 실행해도 결과는 같다(멱등).
//   node tools/build-site.js
// 페이지를 새로 만들 때는 <head> 에 title/description/canonical 만 쓰고, 본문에 <header class="top"> 과 <footer> 를
// 비워 두거나 넣지 않아도 된다 — 빌드가 마커 자리(또는 </head>·</body> 앞)에 채워 넣는다.
const fs = require('fs'), path = require('path');
const shell = require('./shell');
const root = path.resolve(__dirname, '..');
const SKIP = ['.git', '_build', 'node_modules', 'docs', 'tools', 'wheel', 'src'];
const FOOT_EXTRA = {
  'index.html': ' · HWP 해석에 <a href="https://github.com/hahnlee/hwp.js" rel="noopener">hwp.js</a>(Apache-2.0)를 사용합니다. 한글(HWP)은 한글과컴퓨터의 상표이며 이 사이트와 관련이 없습니다.'
};
function sectionOf(rel){
  if (rel === 'index.html') return 'hwp';
  if (rel.startsWith('text/')) return 'text';
  if (rel.startsWith('guide/')) return 'guide';
  return '';
}
// 예전 방식(sync-head.js)의 블록과 손으로 넣은 로더를 지운다 → 셸이 1회만 들어가게
function clean(src){
  return src
    .replace(/<!-- head:common -->[\s\S]*?<!-- \/head:common -->\n?/g, '')
    .replace(/<!-- head:ga -->[\s\S]*?<!-- \/head:ga -->\n?/g, '')
    .replace(/<!-- shell:head-common -->[\s\S]*?<!-- \/shell:head-common -->\n?/g, '')
    .replace(/<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"]*"[^>]*><\/script>\n?/g, '')
    .replace(/<link rel="stylesheet" href="\/assets\/site\.css">\n?/g, '')
    .replace(/<style id="site-css">[\s\S]*?<\/style>\n?/g, '');
}
const pages = [];
function walk(dir){
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.includes(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (name.endsWith('.html')) pages.push(p);
  }
}
walk(root);

let changed = 0;
for (const p of pages) {
  const rel = path.relative(root, p).split(path.sep).join('/');
  const before = fs.readFileSync(p, 'utf8');
  let s = clean(before);
  s = s.replace(/<\/head>/, () => shell.head({ og: 'og.png' }) + '\n</head>');
  const header = shell.header({ lang: 'ko', section: sectionOf(rel), wheelHome: '/wheel/ko/' });
  s = shell.replaceBlock(s, 'header', header, /<header class="top">[\s\S]*?<\/header>/);
  if (!s.includes('<!-- shell:header -->')) s = s.replace(/<body([^>]*)>/, (m) => m + '\n' + header);
  const footer = shell.footer({ lang: 'ko', extra: FOOT_EXTRA[rel] || '' });
  s = shell.replaceBlock(s, 'footer', footer, /<footer[^>]*>[\s\S]*?<\/footer>/);
  if (!s.includes('<!-- shell:footer -->')) s = s.replace(/<\/body>/, () => footer + '\n</body>');
  if (s !== before) { fs.writeFileSync(p, s, 'utf8'); changed++; }
}

// 사이트맵: site 블록(비-룰렛 페이지) 재생성, wheel 블록은 build-wheel.js 가 관리
const toUrl = p => { let rel = path.relative(root, p).split(path.sep).join('/'); rel = rel.replace(/(^|\/)index\.html$/, '$1'); return 'https://parkbok.com/' + rel; };
const order = u => { const r = u.replace('https://parkbok.com/', ''); const depth = (r.match(/\//g) || []).length; const idx = r === '' || r.endsWith('/') ? 0 : 1; return [depth, idx, r]; };
const siteUrls = pages.map(toUrl).sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
const smPath = path.join(root, 'sitemap.xml');
let sm = fs.existsSync(smPath) ? fs.readFileSync(smPath, 'utf8') : '';
const wheelBlock = (sm.match(/<!-- wheel:start -->[\s\S]*?<!-- wheel:end -->/) || [''])[0];
const siteBlock = '<!-- site:start -->\n' + siteUrls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + '\n  <!-- site:end -->';
const out = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ' + siteBlock + (wheelBlock ? '\n  ' + wheelBlock : '') + '\n</urlset>\n';
if (out !== sm) { fs.writeFileSync(smPath, out, 'utf8'); console.log('sitemap updated'); }
console.log('pages:', pages.length, '| changed:', changed, '| site urls:', siteUrls.length, '| wheel block:', wheelBlock ? 'kept' : 'none');
