// 사이트 빌드: 돌림판(wheel/)·PDF(pdf/, 자체 생성기)를 제외한 모든 HTML 페이지에 공통 셸(head-common · header · footer)을 끼우고
// 사이트맵의 site 블록을 갱신한다. 여러 번 실행해도 결과는 같다(멱등).
//   node tools/build-site.js
// 페이지를 새로 만들 때는 <head> 에 title/description/canonical 만 쓰고, 본문에 <header class="top"> 과 <footer> 를
// 비워 두거나 넣지 않아도 된다 — 빌드가 마커 자리(또는 </head>·</body> 앞)에 채워 넣는다.
// 홈(index.html)·텍스트 허브(text/index.html)의 <!-- grid:start --> … <!-- grid:end --> 사이는 src/tools.json 으로 카드 그리드를 생성한다.
const fs = require('fs'), path = require('path');
const shell = require('./shell');
const root = path.resolve(__dirname, '..');
const SKIP = ['.git', '.hallmark', '_build', 'node_modules', 'docs', 'tools', 'wheel', 'pdf', 'image', 'color', 'src'];   // wheel/pdf/image 는 자체 생성기가 셸을 넣는다
const FOOT_EXTRA = {
  'hwp/index.html': ' · HWP 해석에 <a href="https://github.com/hahnlee/hwp.js" rel="noopener">hwp.js</a>(Apache-2.0)를 사용합니다. 한글(HWP)은 한글과컴퓨터의 상표이며 이 사이트와 관련이 없습니다.'
};
// 페이지 전용 CSS: <style id="page-css"> 로 site-css 다음에 인라인
const PAGE_CSS = {
  'index.html': ['assets/home-tokens.css', 'assets/home.css'],
  'hwp/index.html': ['assets/hwp.css', 'assets/hwp-page.css'],
  'games/index.html': ['assets/home-tokens.css', 'assets/home.css'],
  'games/rock-paper-scissors/index.html': 'assets/games.css',
  'games/number-guess/index.html': 'assets/games.css',
  'games/reaction-time/index.html': 'assets/games.css',
  'about.html': 'assets/about.css',
  'text/remove-line-breaks.html': 'assets/tool.css', 'text/char-count.html': 'assets/tool.css', 'text/sql-in.html': 'assets/tool.css',
  'text/dedupe-lines.html': 'assets/tool.css', 'text/list-to-line.html': 'assets/tool.css'
};

// ---------- 도구 그리드 (src/tools.json + src/icons.json) ----------
const TOOLS = JSON.parse(fs.readFileSync(path.join(root, 'src', 'tools.json'), 'utf8'));
const ICONS = JSON.parse(fs.readFileSync(path.join(root, 'src', 'icons.json'), 'utf8'));
const esc = shell.esc;
const CAT_LABEL = { all: '전체', hwp: 'HWP', text: '텍스트', pdf: 'PDF', image: '이미지', color: '색상', game: '게임', guide: '가이드' };
const CHIP_ORDER = ['all', 'hwp', 'pdf', 'image', 'color', 'text', 'game', 'guide'];
const HOME_GROUPS = ['documents', 'image', 'color', 'text', 'game', 'guide'];
const GROUP_LABEL = { documents: '문서와 PDF', image: '이미지', color: '색상', text: '텍스트', game: '게임', guide: '가이드' };
// 그리드를 넣는 페이지: 홈은 필터 칩 + 전체 카드, /text/ 는 텍스트 카드만(칩 없음)
const GRIDS = { 'index.html': { chips: true }, 'text/index.html': { cat: 'text' }, 'games/index.html': { cat: 'game', heading: 'h2' } };
const pagePath = rel => '/' + rel.replace(/(^|\/)index\.html$/, '$1');
// PDF 도구 문구는 pdf/src/tools/<id>.json 의 strings.ko.h1/line 을 우선 쓴다(없으면 tools.json). planned 인 PDF 도구는 그 파일이 있을 때만 카드로 올린다.
function pdfStrings(t){
  const f = path.join(root, 'pdf', 'src', 'tools', t.id + '.json');
  if (!fs.existsSync(f)) return null;
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return (j.strings && j.strings.ko) || {}; }
  catch (e) { console.warn('pdf 도구 json 해석 실패: ' + f); return {}; }
}
function cardHtml(t, name, line, href, hidden, heading = 'h3'){
  const inner = ICONS[t.icon];
  if (inner == null) throw new Error('icons.json 에 아이콘이 없습니다: ' + t.icon + ' (' + t.id + ')');
  return `<a class="card${hidden ? ' hidden' : ''}" href="${esc(href)}" data-cat="${esc(t.cat)}">`
    + `<span class="card-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="var(--cat-${esc(t.cat)})"/>${inner}</svg></span>`
    + `<${heading}>${esc(name)}</${heading}><p>${esc(line)}</p></a>`;
}
function gridHtml(rel, cfg){
  const page = pagePath(rel);
  const cards = [], cats = {}, groups = {};
  for (const t of TOOLS.slice().sort((a, b) => a.order - b.order)) {
    if (cfg.cat && t.cat !== cfg.cat) continue;
    if (t.url === page || (t.hideOn || []).includes(page)) continue;   // 자기 링크 제외
    let name = t.name.ko, line = t.line.ko;
    if (t.cat === 'pdf') {
      const s = pdfStrings(t);
      if (!s && t.status !== 'live') continue;
      if (s && s.h1) name = s.h1;
      if (s && s.line) line = s.line.replace(/[.。]\s*$/, '');
    } else if (t.status !== 'live') continue;
    const multi = (t.langs || ['ko']).length > 1;
    const href = multi && t.url.endsWith('/') ? t.url + 'ko/' : t.url;   // 다국어 도구는 한국어 페이지로
    const card = cardHtml(t, name, line, href, !!cfg.chips && t.cat === 'guide', cfg.heading || 'h3');
    cards.push(card);   // 전체 필터 초기 상태 = 가이드 숨김
    const group = t.cat === 'hwp' || t.cat === 'pdf' ? 'documents' : t.cat;
    (groups[group] || (groups[group] = [])).push(card);
    cats[t.cat] = true;
  }
  let out = '';
  if (cfg.chips) {
    const chips = CHIP_ORDER.filter(c => c === 'all' || cats[c])
      .map(c => `<a class="chip${c === 'all' ? ' on' : ''}" href="#${c}" data-cat="${c}">${esc(CAT_LABEL[c])}</a>`).join('');
    out += `  <nav class="chips filters" aria-label="도구 분류">${chips}</nav>\n`;
  }
  if (cfg.chips) {
    out += '  <div class="tool-groups" id="tools-grid">\n';
    const order = HOME_GROUPS.concat(Object.keys(groups).filter(g => !HOME_GROUPS.includes(g)));
    for (const group of order) {
      if (!groups[group]) continue;
      out += `    <section class="tool-group" data-group="${esc(group)}" aria-labelledby="group-${esc(group)}"${group === 'guide' ? ' hidden' : ''}>\n`
        + `      <h2 id="group-${esc(group)}">${esc(GROUP_LABEL[group] || CAT_LABEL[group] || group)}</h2>\n`
        + '      <div class="grid tools-grid">\n' + groups[group].map(c => '        ' + c).join('\n') + '\n      </div>\n    </section>\n';
    }
    out += '  </div>';
  } else {
    out += '  <div class="grid tools-grid" id="tools-grid">\n' + cards.map(c => '    ' + c).join('\n') + '\n  </div>';
  }
  return '<!-- grid:start -->\n' + out + '\n  <!-- grid:end -->';
}
function sectionOf(rel){
  if (rel.startsWith('games/')) return 'game';
  if (rel.startsWith('hwp/')) return 'hwp';
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
    .replace(/<style id="site-css">[\s\S]*?<\/style>\n?/g, '')
    .replace(/<style id="page-css">[\s\S]*?<\/style>\n?/g, '');
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
  if (PAGE_CSS[rel]) {
    const css = [].concat(PAGE_CSS[rel]).map(f => fs.readFileSync(path.join(root, f), 'utf8').trim()).join('\n');
    s = s.replace(/<\/head>/, () => '<style id="page-css">\n' + css + '\n</style>\n</head>');
  }
  if (GRIDS[rel]) {
    if (!/<!-- grid:start -->[\s\S]*?<!-- grid:end -->/.test(s)) console.warn(rel + ': grid 마커가 없어 그리드를 넣지 못했습니다');
    else s = s.replace(/<!-- grid:start -->[\s\S]*?<!-- grid:end -->/, () => gridHtml(rel, GRIDS[rel]));
  }
  const header = shell.header({ lang: 'ko', section: sectionOf(rel), wheelHome: '/wheel/ko/', pdfHome: '/pdf/ko/', imageHome: '/image/ko/', colorHome: '/color/ko/' });
  s = shell.replaceBlock(s, 'header', header, /<header class="top">[\s\S]*?<\/header>/);
  if (!s.includes('<!-- shell:header -->')) s = s.replace(/<body([^>]*)>/, (m) => m + '\n' + header);
  const footer = shell.footer({ lang: 'ko', extra: FOOT_EXTRA[rel] || '' });
  // 폴백은 사이트 푸터 형태(<footer><div class="wrap"> / <footer class="foot">)만 잡는다 — 본문 안의 다른 <footer> 는 건드리지 않음
  s = shell.replaceBlock(s, 'footer', footer, /<footer(?: class="foot")?><div class="wrap">[\s\S]*?<\/footer>/);
  if (!s.includes('<!-- shell:footer -->')) s = s.replace(/<\/body>/, () => footer + '\n</body>');
  if (s !== before) { fs.writeFileSync(p, s, 'utf8'); changed++; }
}

// 사이트맵: site 블록(비-룰렛 페이지) 재생성, wheel 블록은 build-wheel.js, pdf 블록은 PDF 생성기가 관리(있으면 보존)
const toUrl = p => { let rel = path.relative(root, p).split(path.sep).join('/'); rel = rel.replace(/(^|\/)index\.html$/, '$1'); return 'https://parkbok.com/' + rel; };
const order = u => { const r = u.replace('https://parkbok.com/', ''); const depth = (r.match(/\//g) || []).length; const idx = r === '' || r.endsWith('/') ? 0 : 1; return [depth, idx, r]; };
const siteUrls = pages.map(toUrl).sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
const smPath = path.join(root, 'sitemap.xml');
let sm = fs.existsSync(smPath) ? fs.readFileSync(smPath, 'utf8') : '';
// 다른 생성기의 블록(wheel/pdf/image …)은 그대로 보존
const otherBlocks = ['wheel', 'pdf', 'image', 'color'].map(k => (sm.match(new RegExp('<!-- ' + k + ':start -->[\\s\\S]*?<!-- ' + k + ':end -->')) || [''])[0]).filter(Boolean);
const siteBlock = '<!-- site:start -->\n' + siteUrls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + '\n  <!-- site:end -->';
const out = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ' + siteBlock + otherBlocks.map(b => '\n  ' + b).join('') + '\n</urlset>\n';
if (out !== sm) { fs.writeFileSync(smPath, out, 'utf8'); console.log('sitemap updated'); }
console.log('pages:', pages.length, '| changed:', changed, '| site urls:', siteUrls.length, '| other blocks kept:', otherBlocks.length);
