// 사이트 빌드: PDF·이미지·색상(자체 생성기)를 제외한 모든 HTML 페이지에 공통 셸(head-common · header · footer)을 끼운다. 여러 번 실행해도 결과는 같다(멱등).
//   node tools/build-site.js
// 페이지를 새로 만들 때는 <head> 에 title/description/canonical 만 쓰고, 본문에 <header class="top"> 과 <footer> 를
// 비워 두거나 넣지 않아도 된다 — 빌드가 마커 자리(또는 </head>·</body> 앞)에 채워 넣는다.
// 홈(index.html)·텍스트 허브(text/index.html)의 <!-- grid:start --> … <!-- grid:end --> 사이는 src/tools.json 으로 카드 그리드를 생성한다.
const fs = require('fs'), path = require('path');
const shell = require('./shell');
const root = path.resolve(__dirname, '..');
const HOME = JSON.parse(fs.readFileSync(path.join(root, 'src/home-strings.json'), 'utf8'));
const homeLang = rel => rel === 'index.html' ? 'ko' : /^(en|ja|zh|es|pt|de|fr)\/index\.html$/.test(rel) ? rel.split('/')[0] : null;
const homeSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const homeJsVersion = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'assets/home.js'))).digest('hex').slice(0, 8);
// Localized homes are generated from the same layout; the existing root remains Korean.
for (const lang of Object.keys(HOME).filter(l => l !== 'ko')) {
  const dir = path.join(root, lang); fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, 'index.html'))) fs.writeFileSync(path.join(dir, 'index.html'), homeSource);
}
const SKIP = ['.git', '.hallmark', '_build', 'node_modules', 'docs', 'tools', 'tests', 'output', 'pdf', 'image', 'color', 'src'];   // 테스트 산출물 제외. pdf/image/color 는 자체 생성기가 셸을 넣는다
const FOOT_EXTRA = {
  'hwp/index.html': ' · HWP 해석에 <a href="https://github.com/hahnlee/hwp.js" rel="noopener">hwp.js</a>(Apache-2.0)를 사용합니다. 한글(HWP)은 한글과컴퓨터의 상표이며 이 사이트와 관련이 없습니다.'
};
// 페이지 전용 CSS: <style id="page-css"> 로 site-css 다음에 인라인
const PAGE_CSS = {
  'guide/photo-signature-size-india.html': 'assets/photo-signature-guide.css',
  'index.html': ['assets/home-tokens.css', 'assets/home.css'],
  'hwp/index.html': ['assets/hwp.css', 'assets/hwp-page.css'],
  'about.html': 'assets/about.css',
  'text/remove-line-breaks.html': 'assets/tool.css', 'text/char-count.html': 'assets/tool.css', 'text/sql-in.html': 'assets/tool.css',
  'text/dedupe-lines.html': 'assets/tool.css', 'text/list-to-line.html': 'assets/tool.css'
};

// ---------- 도구 그리드 (src/tools.json + src/icons.json) ----------
const TOOLS = JSON.parse(fs.readFileSync(path.join(root, 'src', 'tools.json'), 'utf8'));
const ICONS = JSON.parse(fs.readFileSync(path.join(root, 'src', 'icons.json'), 'utf8'));
const esc = shell.esc;
const CHIP_ORDER = ['all', 'hwp', 'pdf', 'image', 'color', 'text', 'guide'];
const HOME_GROUPS = ['documents', 'image', 'color', 'text', 'guide'];
// 그리드를 넣는 페이지: 홈은 필터 칩 + 전체 카드, /text/ 는 텍스트 카드만(칩 없음)
const GRIDS = { 'index.html': { chips: true }, 'text/index.html': { cat: 'text' } };
const pagePath = rel => '/' + rel.replace(/(^|\/)index\.html$/, '$1');
// PDF 도구 문구는 pdf/src/tools/<id>.json 의 strings.ko.h1/line 을 우선 쓴다(없으면 tools.json). planned 인 PDF 도구는 그 파일이 있을 때만 카드로 올린다.
function pdfStrings(t, lang = 'ko'){
  const f = path.join(root, 'pdf', 'src', 'tools', t.id + '.json');
  if (!fs.existsSync(f)) return null;
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return (j.strings && j.strings[lang]) || {}; }
  catch (e) { console.warn('pdf 도구 json 해석 실패: ' + f); return {}; }
}
function cardHtml(t, name, line, href, hidden, heading = 'h3'){
  const inner = ICONS[t.icon];
  if (inner == null) throw new Error('icons.json 에 아이콘이 없습니다: ' + t.icon + ' (' + t.id + ')');
  return `<a class="card${hidden ? ' hidden' : ''}" href="${esc(href)}" data-cat="${esc(t.cat)}">`
    + `<span class="card-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="var(--cat-${esc(t.cat)})"/>${inner}</svg></span>`
    + `<${heading}>${esc(name)}</${heading}><p>${esc(line)}</p></a>`;
}
function gridHtml(rel, cfg, lang = 'ko'){
  const page = pagePath(rel);
  const cards = [], cats = {}, groups = {};
  const labels = HOME[lang], catLabels = Object.fromEntries(CHIP_ORDER.map((key, i) => [key, labels.chips[i]]));
  const groupLabels = Object.fromEntries(HOME_GROUPS.map((key, i) => [key, labels.groups[i]]));
  for (const t of TOOLS.slice().sort((a, b) => a.order - b.order)) {
    if (cfg.cat && t.cat !== cfg.cat) continue;
    if (t.url === page || (t.hideOn || []).includes(cfg.chips ? '/' : page)) continue;   // 언어 홈도 같은 카드 노출 규칙을 쓴다
    if (lang !== 'ko' && !(t.langs || ['ko']).includes(lang)) continue;
    let name = t.name[lang] || t.name.en, line = t.line[lang] || t.line.en;
    if (t.cat === 'pdf') {
      const s = pdfStrings(t, lang);
      if (!s && t.status !== 'live') continue;
      if (s && s.h1) name = s.h1;
      if (s && s.line) line = s.line.replace(/[.。]\s*$/, '');
    } else if (t.status !== 'live') continue;
    if (lang !== 'ko' && ['image', 'color'].includes(t.cat)) {
      const id = t.cat === 'color' ? t.id.replace(/^color-/, '') : t.id;
      const source = JSON.parse(fs.readFileSync(path.join(root, t.cat, 'src/tools', id + '.json'), 'utf8')).strings[lang];
      name = source.cardName || source.h1; line = source.cardLine || source.line;
    }
    const multi = (t.langs || ['ko']).length > 1;
    const href = multi && t.url.endsWith('/') ? t.url + (lang === 'en' ? '' : lang + '/') : t.url;
    const card = cardHtml(t, name, line, href, !!cfg.chips && t.cat === 'guide', cfg.heading || 'h3');
    cards.push(card);   // 전체 필터 초기 상태 = 가이드 숨김
    const group = t.cat === 'hwp' || t.cat === 'pdf' ? 'documents' : t.cat;
    (groups[group] || (groups[group] = [])).push(card);
    cats[t.cat] = true;
  }
  let out = '';
  if (cfg.chips) {
    const chips = CHIP_ORDER.filter(c => c === 'all' || cats[c])
      .map(c => `<a class="chip${c === 'all' ? ' on' : ''}" href="#${c}" data-cat="${c}">${esc(catLabels[c])}</a>`).join('');
    out += `  <nav class="chips filters" aria-label="${esc(labels.categories)}">${chips}</nav>\n`;
  }
  if (cfg.chips) {
    out += '  <div class="tool-groups" id="tools-grid">\n';
    const order = HOME_GROUPS.concat(Object.keys(groups).filter(g => !HOME_GROUPS.includes(g)));
    for (const group of order) {
      if (!groups[group]) continue;
      out += `    <section class="tool-group" data-group="${esc(group)}" aria-labelledby="group-${esc(group)}"${group === 'guide' ? ' hidden' : ''}>\n`
        + `      <h2 id="group-${esc(group)}">${esc(groupLabels[group] || catLabels[group] || group)}</h2>\n`
        + '      <div class="grid tools-grid">\n' + groups[group].map(c => '        ' + c).join('\n') + '\n      </div>\n    </section>\n';
    }
    out += '  </div>';
  } else {
    out += '  <div class="grid tools-grid" id="tools-grid">\n' + cards.map(c => '    ' + c).join('\n') + '\n  </div>';
  }
  return '<!-- grid:start -->\n' + out + '\n  <!-- grid:end -->';
}
function sectionOf(rel){
  if (rel === 'guide/photo-signature-size-india.html') return 'image';
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
    if (name.startsWith('.') || SKIP.includes(name)) continue;
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
  const isHome = homeLang(rel), lang = isHome || (rel === 'guide/photo-signature-size-india.html' ? 'en' : 'ko');
  let s = clean(isHome ? homeSource : before);
  if (isHome) {
    const t = HOME[lang], url = 'https://parkbok.com' + shell.homeUrl(lang), title = 'parkbok – ' + t.title;
    s = s.replace(/<html lang="[^"]+"/, '<html lang="' + lang + '"')
      .replace(/<body(?: class="page-home")?>/, '<body class="page-home">')
      .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>')
      .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + esc(t.description) + '">')
      .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + url + '">')
      .replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + esc(title) + '">')
      .replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + esc(t.description) + '">')
      .replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + url + '">')
      .replace(/<h1>[\s\S]*?<\/h1>/, '<h1>' + esc(t.h1) + '</h1>')
      .replace(/<p class="lead">[\s\S]*?<\/p>/, '<p class="lead">' + esc(t.line) + '<span class="home-assurance">' + esc(t.assurance) + '</span></p>')
      .replace(/<link rel="alternate"[^>]*>\n?/g, '')
      .replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, data) => {
        const json = JSON.parse(data);
        if (json['@type'] === 'WebApplication') Object.assign(json, { name: 'parkbok – ' + t.title, url, description: t.description, inLanguage: lang });
        return '<script type="application/ld+json">\n' + JSON.stringify(json) + '\n</script>';
      });
    const alternate = Object.keys(HOME).map(l => '<link rel="alternate" hreflang="' + l + '" href="https://parkbok.com' + shell.homeUrl(l) + '">').join('\n');
    s = s.replace('</head>', alternate + '\n<link rel="alternate" hreflang="x-default" href="https://parkbok.com/">\n</head>');
    s = s.replace(/src="\/assets\/home\.js(?:\?v=[^"]*)?"/, 'src="/assets/home.js?v=' + homeJsVersion + '"');
  }
  s = s.replace(/<\/head>/, () => shell.head({ og: 'og.png', home: !!isHome }) + '\n</head>');
  const pageCss = isHome ? PAGE_CSS['index.html'] : PAGE_CSS[rel];
  if (pageCss) {
    const css = [].concat(pageCss).map(f => fs.readFileSync(path.join(root, f), 'utf8').trim()).join('\n');
    s = s.replace(/<\/head>/, () => '<style id="page-css">\n' + css + '\n</style>\n</head>');
  }
  const gridCfg = isHome ? GRIDS['index.html'] : GRIDS[rel];
  if (gridCfg) {
    if (!/<!-- grid:start -->[\s\S]*?<!-- grid:end -->/.test(s)) console.warn(rel + ': grid 마커가 없어 그리드를 넣지 못했습니다');
    else s = s.replace(/<!-- grid:start -->[\s\S]*?<!-- grid:end -->/, () => gridHtml(rel, gridCfg, lang));
  }
  const header = shell.header({ lang, home: !!isHome, section: sectionOf(rel), pdfHome: shell.sectionHome('pdf', lang), imageHome: shell.sectionHome('image', lang), colorHome: shell.sectionHome('color', lang) });
  s = shell.replaceBlock(s, 'header', header, /<header class="top">[\s\S]*?<\/header>/);
  if (!s.includes('<!-- shell:header -->')) s = s.replace(/<body([^>]*)>/, (m) => m + '\n' + header);
  const footer = shell.footer({ lang, extra: FOOT_EXTRA[rel] || '' });
  // 폴백은 사이트 푸터 형태(<footer><div class="wrap"> / <footer class="foot">)만 잡는다 — 본문 안의 다른 <footer> 는 건드리지 않음
  s = shell.replaceBlock(s, 'footer', footer, /<footer(?: class="foot")?><div class="wrap">[\s\S]*?<\/footer>/);
  if (!s.includes('<!-- shell:footer -->')) s = s.replace(/<\/body>/, () => footer + '\n</body>');
  if (s !== before) { fs.writeFileSync(p, s, 'utf8'); changed++; }
}

// 사이트맵은 tools/build-sitemaps.js 가 만든다
console.log('pages:', pages.length, '| changed:', changed);
