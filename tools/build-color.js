// 색 도구 페이지 생성기: color/src/{template.html, color.css, strings.json, tools/*.json} + color/tools/*.js + 공통 셸(tools/shell.js)
//   → /color/[언어/]index.html (허브), /color/<도구>/[언어/]index.html   (node tools/build-color.js)
// 도구 json 만 있고 color/tools/<id>.js 가 없으면 건너뛰고 경고한다. 사이트맵의 color 블록만 갱신한다(멱등).
const fs = require('fs'), path = require('path');
require('./build-palette-assets');
const shell = require('./shell');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'color', 'src');
const S = JSON.parse(fs.readFileSync(path.join(src, 'strings.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'color.css'), 'utf8').trim();
const iconsFile = path.join(root, 'src', 'icons.json');
const ICONS = fs.existsSync(iconsFile) ? JSON.parse(fs.readFileSync(iconsFile, 'utf8')) : {};
const HREFLANG = { en: 'en', ko: 'ko', zh: 'zh-Hans', ja: 'ja', es: 'es', pt: 'pt', de: 'de', fr: 'fr' };
const HTMLLANG = { zh: 'zh-Hans' };
const langs = Object.keys(S);
const SITE = 'https://parkbok.com';
const DEFAULT_GLYPH = '<g fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="12"/></g>';

const esc = shell.esc;
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c');
const assetVersions = new Map();
function assetUrl(file){
  if (!assetVersions.has(file)) assetVersions.set(file, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, file.slice(1)))).digest('hex').slice(0, 8));
  return file + '?v=' + assetVersions.get(file);
}
const url = (lang, id) => '/color/' + (id ? id + '/' : '') + (lang === 'en' ? '' : lang + '/');
const home = (section, lang) => '/' + section + '/' + (lang === 'en' ? '' : lang + '/');

// 도구 목록: json 이 있고 모듈 js 도 있는 것만
const toolsDir = path.join(src, 'tools');
const tools = [];
for (const f of fs.readdirSync(toolsDir).filter(n => n.endsWith('.json')).sort()) {
  let def;
  try { def = JSON.parse(fs.readFileSync(path.join(toolsDir, f), 'utf8')); } catch (e) { console.warn('경고: ' + f + ' 파싱 실패 — 건너뜀 (' + e.message + ')'); continue; }
  const id = def.id || f.replace(/\.json$/, '');
  if (!fs.existsSync(path.join(root, 'color', 'tools', id + '.js'))) { console.warn('경고: color/tools/' + id + '.js 없음 — ' + f + ' 건너뜀'); continue; }
  const missing = langs.filter(l => !def.strings || !def.strings[l]);
  if (missing.length) console.warn('경고: ' + f + ' 문구 누락 언어: ' + missing.join(',') + ' (영어로 대체)');
  tools.push(Object.assign({ id, order: 999, next: [] }, def, { id }));
}
tools.sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
const activeTools = tools.filter(tl => !tl.redirectTo);
const byId = {}; activeTools.forEach(tl => { byId[tl.id] = tl; });
const tstr = (tl, lang) => (tl.strings && (tl.strings[lang] || tl.strings.en)) || {};

function icon(tl){
  const inner = (tl.icon && ICONS[tl.icon]) || ICONS['color-' + tl.id] || DEFAULT_GLYPH;
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="var(--cat-' + esc(tl.cat || 'color') + ',#ec4899)"/>' + inner + '</svg>';
}
function hreflangs(id){
  return langs.map(l => `<link rel="alternate" hreflang="${HREFLANG[l] || l}" href="${SITE}${url(l, id)}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${url('en', id)}">`;
}
function langSelect(lang, id){
  const opts = langs.map(l => `<option value="${url(l, id)}" data-code="${l}"${l === lang ? ' selected' : ''}>${esc(S[l].name)}</option>`).join('');
  return `<select id="lang" class="lang-select" aria-label="${esc(shell.strings(lang).language || S[lang].language)}">${opts}</select>`;
}
function langUrls(id){ const o = {}; langs.forEach(l => { o[l] = url(l, id); }); return o; }
function common(lang){ const c = Object.assign({}, S[lang]); delete c.hub; return c; }
function finish(html, lang, id, vars){
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  // 셸은 마지막에 끼운다 (site.css 안의 중괄호가 위 치환에 걸리지 않도록)
  html = html.split('{{shell_head}}').join(shell.head({ og: 'og.png' }));
  html = html.split('{{shell_header}}').join(shell.header({ lang, section: 'color', wheelHome: home('wheel', lang), pdfHome: home('pdf', lang), imageHome: home('image', lang), colorHome: home('color', lang), langSelect: langSelect(lang, id), subnav: '' }));
  html = html.split('{{shell_footer}}').join(shell.footer({ lang }));
  if (id === 'palette') html = html.replace(/(?:src|href)="(\/color\/(?:palette[\w-]*\.(?:js|css)|tools\/palette\.js))"/g, (match, file) => match.replace(file, assetUrl(file)));
  const out = path.join(root, url(lang, id).replace(/\//g, path.sep), 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return SITE + url(lang, id);
}
const toolTpl = tpl.replace(/<!-- hub:start -->[\s\S]*?<!-- hub:end -->\n?/, '').replace(/<!-- tool:start -->\n?|<!-- tool:end -->\n?/g, '');
const hubTpl = tpl.replace(/<!-- tool:start -->[\s\S]*?<!-- tool:end -->\n?/, '').replace(/<!-- hub:start -->\n?|<!-- hub:end -->\n?/g, '');

// 허브의 인기 색상: 색인 대상(큐레이션) HEX 페이지만 링크한다 — noindex 인 나머지 4천여 색은 허브에서 링크하지 않는다
const CURATED = JSON.parse(fs.readFileSync(path.join(src, 'curated-colors.json'), 'utf8')).colors;
function colorsBlock(H){
  const sw = c => `<a href="/color/hex/${c.hex.slice(1)}/"><i style="background:${c.hex}"></i>${esc(c.name)}</a>`;
  return `  <section class="popular-colors"><h2>${esc(H.colorsTitle)}</h2><p class="muted">${esc(H.colorsLine)}</p><nav class="swatches" aria-label="${esc(H.colorsTitle)}">${CURATED.map(sw).join('')}</nav></section>`;
}
const urls = [];
let count = 0;
// 허브
for (const lang of langs) {
  const H = S[lang].hub, canonical = SITE + url(lang, '');
  const cards = activeTools.map(tl => { const T = tstr(tl, lang); return `<a class="card" href="${url(lang, tl.id)}"><span class="card-icon">${icon(tl)}</span><h3>${esc(T.h1)}</h3><p>${esc(T.line)}</p></a>`; }).join('');
  const crumbs = shell.breadcrumb(lang, [{ name: shell.strings(lang).home, url: '/' }, { name: H.h1, url: url(lang, '') }]);
  const jsonld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: H.h1, url: canonical, inLanguage: HREFLANG[lang] || lang, description: H.description,
    hasPart: activeTools.map(tl => ({ '@type': 'WebApplication', name: tstr(tl, lang).h1, url: SITE + url(lang, tl.id), applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any' })) }, crumbs.jsonld];
  const vars = { crumbs: crumbs.html, lang: HTMLLANG[lang] || lang, dir: S[lang].dir || 'ltr', title: esc(H.title), description: esc(H.description), canonical, hreflangs: hreflangs(''),
    h1: esc(H.h1), line: esc(H.line), cards, colors: colorsBlock(H), aboutTitle: esc(S[lang].aboutTitle), aboutLine: esc(S[lang].aboutLine), css, jsonld: safeJson(jsonld),
    strings: safeJson(common(lang)), tool: safeJson({ id: 'hub', lang, langUrls: langUrls(''), strings: {}, next: [] }) };
  urls.push(finish(hubTpl, lang, '', vars)); count++;
}
// 도구 페이지
for (const tl of tools) for (const lang of langs) {
  if (tl.redirectTo) {
    const target = byId[tl.redirectTo];
    if (!target) throw Error('Unknown color redirect target: ' + tl.redirectTo);
    const T = tstr(target, lang), destination = url(lang, target.id), canonical = SITE + destination;
    const redirect = '<meta name="robots" content="noindex,follow">\n<script>location.replace(' + safeJson(destination) + '+location.search+location.hash)</script>';
    const alias = toolTpl.replace('</head>', redirect + '\n</head>').replace('<section class="tool" id="app"></section>', '<section class="tool" id="app"><a class="btn" href="' + destination + '">' + esc(T.h1) + '</a></section>');
    finish(alias, lang, tl.id, { crumbs: '', colors: '', lang: HTMLLANG[lang] || lang, dir: S[lang].dir || 'ltr', title: esc(T.title), description: esc(T.description), canonical, hreflangs: hreflangs(target.id), h1: esc(T.h1), line: esc(T.line), nextTools: esc(S[lang].nextTools), nextChips: '', about: '', css, jsonld: '[]', toolId: tl.id, toolAssets: '', strings: safeJson(common(lang)), tool: safeJson({id: tl.id, lang, langUrls: langUrls(tl.id), strings: {}, next: []}) });
    count++; continue; // Preserve old URLs; only the destination belongs in the sitemap.
  }
  const T = tstr(tl, lang), C = S[lang], canonical = SITE + url(lang, tl.id);
  let nextIds = (tl.next || []).filter(n => byId[n] && n !== tl.id);
  if (nextIds.length < 5) for (const o of activeTools) { if (nextIds.length >= 5) break; if (o.id !== tl.id && nextIds.indexOf(o.id) < 0) nextIds.push(o.id); }
  nextIds = nextIds.slice(0, 6);
  const next = nextIds.map(n => ({ id: n, url: url(lang, n), h1: tstr(byId[n], lang).h1 }));
  const nextChips = next.map(n => `<a class="chip" href="${n.url}">${esc(n.h1)}</a>`).join('');
  const faqArr = tl.showAbout === false ? [] : (T.faq || []);
  const faq = faqArr.map(q => `<dt>${esc(q[0])}</dt><dd>${esc(q[1])}</dd>`).join('');
  const about = tl.showAbout === false ? '' : `  <details class="about">\n    <summary>${esc(C.aboutTitle)}</summary>\n    <p>${esc(C.aboutLine)}</p>\n    <dl class="faq">${faq}</dl>\n  </details>`;
  const crumbs = shell.breadcrumb(lang, [{ name: shell.strings(lang).home, url: '/' }, { name: S[lang].hub.h1, url: url(lang, '') }, { name: T.h1, url: url(lang, tl.id) }]);
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: T.h1, url: canonical, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript', inLanguage: HREFLANG[lang] || lang, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: T.description }
  ];
  jsonld.push(crumbs.jsonld);
  if (faqArr.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqArr.map(q => ({ '@type': 'Question', name: q[0], acceptedAnswer: { '@type': 'Answer', text: q[1] } })) });
  const vars = { crumbs: crumbs.html, lang: HTMLLANG[lang] || lang, dir: C.dir || 'ltr', title: esc(T.title), description: esc(T.description), canonical, hreflangs: hreflangs(tl.id),
    h1: esc(T.h1), line: esc(T.line), nextTools: esc(C.nextTools), nextChips, about, css, jsonld: safeJson(jsonld), toolId: tl.id,
    strings: safeJson(common(lang)), toolAssets: tl.id === 'palette' ? '<link rel="stylesheet" href="/color/palette-studio.css">\n' + ['palette-data','palette-core','palette-strings','palette-template-style','palette-templates'].map(n => '<script src="/color/'+n+'.js" defer></script>').join('\n')+'\n' : '', tool: safeJson({ id: tl.id, lang, langUrls: langUrls(tl.id), next, strings: T }) };
  urls.push(finish(toolTpl, lang, tl.id, vars)); count++;
}

// 사이트맵은 tools/build-sitemaps.js 가 생성된 HTML 을 훑어 만든다(색인 가능·자기 canonical 페이지만)
console.log('color pages:', count, '| tools:', activeTools.map(t => t.id).join(',') || '(없음)', '| languages:', langs.join(','), '| indexable urls:', urls.length);
