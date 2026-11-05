// 이미지 도구 페이지 생성기: image/src/{template.html, img.css, strings.json, tools/*.json} + image/tools/*.js + 공통 셸(tools/shell.js)
//   → /image/[언어/]index.html (허브), /image/<도구>/[언어/]index.html   (node tools/build-image.js)
// 도구 json 만 있고 image/tools/<id>.js 가 없으면 건너뛰고 경고한다. 사이트맵의 image 블록만 갱신한다(멱등).
const fs = require('fs'), path = require('path');
const crypto = require('crypto');
const version = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
const shell = require('./shell');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'image', 'src');
const S = JSON.parse(fs.readFileSync(path.join(src, 'strings.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'img.css'), 'utf8').trim();
const iconsFile = path.join(root, 'src', 'icons.json');
const ICONS = fs.existsSync(iconsFile) ? JSON.parse(fs.readFileSync(iconsFile, 'utf8')) : {};
const HREFLANG = { en: 'en', ko: 'ko', zh: 'zh-Hans', ja: 'ja', es: 'es', pt: 'pt', de: 'de', fr: 'fr' };
const HTMLLANG = { zh: 'zh-Hans' };
const langs = Object.keys(S);
const SITE = 'https://parkbok.com';
const DEFAULT_GLYPH = '<g fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="11" width="30" height="26" rx="3"/><path d="M12 32l8-9 6 6 4-4 6 7"/></g><circle cx="31" cy="18" r="2.5" fill="#fff"/>';

const esc = shell.esc;
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c');
const formGuide = lang => lang === 'en' ? '<a class="chip" href="/guide/photo-signature-size-india.html">Photo &amp; signature size guide (India)</a>' : '';
const url = (lang, id) => '/image/' + (id ? id + '/' : '') + (lang === 'en' ? '' : lang + '/');

// 도구 목록: json 이 있고 모듈 js 도 있는 것만
const toolsDir = path.join(src, 'tools');
const tools = [];
for (const f of fs.readdirSync(toolsDir).filter(n => n.endsWith('.json')).sort()) {
  let def;
  try { def = JSON.parse(fs.readFileSync(path.join(toolsDir, f), 'utf8')); } catch (e) { console.warn('경고: ' + f + ' 파싱 실패 — 건너뜀 (' + e.message + ')'); continue; }
  const id = def.id || f.replace(/\.json$/, '');
  if (!fs.existsSync(path.join(root, 'image', 'tools', id + '.js'))) { console.warn('경고: image/tools/' + id + '.js 없음 — ' + f + ' 건너뜀'); continue; }
  const missing = langs.filter(l => !def.strings || !def.strings[l]);
  if (missing.length) console.warn('경고: ' + f + ' 문구 누락 언어: ' + missing.join(',') + ' (영어로 대체)');
  tools.push(Object.assign({ id, order: 999, next: [] }, def, { id }));
}
tools.sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
const byId = {}; tools.forEach(tl => { byId[tl.id] = tl; });
const tstr = (tl, lang) => (tl.strings && (tl.strings[lang] || tl.strings.en)) || {};

function icon(tl){
  const inner = (tl.icon && ICONS[tl.icon]) || ICONS[tl.id] || DEFAULT_GLYPH;
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="var(--cat-' + esc(tl.cat || 'image') + ')"/>' + inner + '</svg>';
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
  vars.engineVersion = version(path.join(root, 'image/img-tools.js'));
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  // 셸은 마지막에 끼운다 (site.css 안의 중괄호가 위 치환에 걸리지 않도록)
  html = html.split('{{shell_head}}').join(shell.head({ og: 'og.png' }));
  html = html.split('{{shell_header}}').join(shell.header({ lang, section: 'image', pdfHome: lang === 'en' ? '/pdf/' : '/pdf/' + lang + '/', imageHome: lang === 'en' ? '/image/' : '/image/' + lang + '/', colorHome: lang === 'en' ? '/color/' : '/color/' + lang + '/', langSelect: langSelect(lang, id), subnav: '' }));
  html = html.split('{{shell_footer}}').join(shell.footer({ lang }));
  const out = path.join(root, url(lang, id).replace(/\//g, path.sep), 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return SITE + url(lang, id);
}
const toolTpl = tpl.replace(/<!-- hub:start -->[\s\S]*?<!-- hub:end -->\n?/, '').replace(/<!-- tool:start -->\n?|<!-- tool:end -->\n?/g, '');
const hubTpl = tpl.replace(/<!-- tool:start -->[\s\S]*?<!-- tool:end -->\n?/, '').replace(/<!-- hub:start -->\n?|<!-- hub:end -->\n?/g, '');

const urls = [];
let count = 0;
// 허브
for (const lang of langs) {
  const H = S[lang].hub, canonical = SITE + url(lang, '');
  const cards = tools.map(tl => { const T = tstr(tl, lang); return `<a class="card" href="${url(lang, tl.id)}"><span class="card-icon">${icon(tl)}</span><h3>${esc(T.h1)}</h3><p>${esc(T.line)}</p></a>`; }).join('');
  const crumbs = shell.breadcrumb(lang, [{ name: shell.strings(lang).home, url: '/' }, { name: H.h1, url: url(lang, '') }]);
  const jsonld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: H.h1, url: canonical, inLanguage: HREFLANG[lang] || lang, description: H.description,
    hasPart: tools.map(tl => ({ '@type': 'WebApplication', name: tstr(tl, lang).h1, url: SITE + url(lang, tl.id), applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any' })) }, crumbs.jsonld];
  const vars = { crumbs: crumbs.html, lang: HTMLLANG[lang] || lang, dir: S[lang].dir || 'ltr', title: esc(H.title), description: esc(H.description), canonical, hreflangs: hreflangs(''),
    h1: esc(H.h1), line: esc(H.line), cards, guideLink: lang === 'en' ? '\n  <nav class="chips next" aria-label="Image guides">' + formGuide(lang) + '</nav>' : '', aboutTitle: esc(S[lang].aboutTitle), aboutLine: esc(S[lang].aboutLine), css, jsonld: safeJson(jsonld),
    strings: safeJson(common(lang)), tool: safeJson({ id: 'hub', lang, langUrls: langUrls(''), strings: {}, next: [] }) };
  urls.push(finish(hubTpl, lang, '', vars)); count++;
}
// 도구 페이지
for (const tl of tools) for (const lang of langs) {
  const T = tstr(tl, lang), C = S[lang], canonical = SITE + url(lang, tl.id);
  let nextIds = (tl.next || []).filter(n => byId[n] && n !== tl.id);
  if (nextIds.length < 5) for (const o of tools) { if (nextIds.length >= 5) break; if (o.id !== tl.id && nextIds.indexOf(o.id) < 0) nextIds.push(o.id); }
  nextIds = nextIds.slice(0, 6);
  const next = nextIds.map(n => ({ id: n, url: url(lang, n), h1: tstr(byId[n], lang).h1 }));
  const nextChips = next.map(n => `<a class="chip" href="${n.url}">${esc(n.h1)}</a>`).join('')
    + (['image-compress', 'signature-resize'].includes(tl.id) ? formGuide(lang) : '');
  const faqArr = T.faq || [];
  const faq = faqArr.map(q => `<dt>${esc(q[0])}</dt><dd>${esc(q[1])}</dd>`).join('');
  const crumbs = shell.breadcrumb(lang, [{ name: shell.strings(lang).home, url: '/' }, { name: S[lang].hub.h1, url: url(lang, '') }, { name: T.h1, url: url(lang, tl.id) }]);
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: T.h1, url: canonical, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript', inLanguage: HREFLANG[lang] || lang, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: T.description }
  ];
  jsonld.push(crumbs.jsonld);
  if (faqArr.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqArr.map(q => ({ '@type': 'Question', name: q[0], acceptedAnswer: { '@type': 'Answer', text: q[1] } })) });
  const vars = { crumbs: crumbs.html, lang: HTMLLANG[lang] || lang, dir: C.dir || 'ltr', title: esc(T.title), description: esc(T.description), canonical, hreflangs: hreflangs(tl.id),
    sample: tl.id === 'image-compress' ? '  <div id="compress-sample" class="compress-sample"><img src="/image/assets/compress-sample-20kb.jpg" width="120" height="80" alt="'+esc(T.sampleAlt)+'" loading="lazy"><div><strong>'+esc(T.sampleTitle)+'</strong><p>'+esc(T.sampleLine)+'</p></div><button type="button" class="btn ghost sm" id="btn-sample">'+esc(T.sampleButton)+'</button></div>\n' : '',
    h1: esc(T.h1), line: esc(T.line), buttonText: esc(T.buttonText || C.selectImages), dropText: esc(C.dropText), addMore: esc(C.addMore), startOver: esc(C.startOver), runText: esc(T.runText || C.done),
    nextTools: esc(C.nextTools), nextChips, aboutTitle: esc(C.aboutTitle), aboutLine: esc(C.aboutLine), faq, css, jsonld: safeJson(jsonld), toolId: tl.id,
    strings: safeJson(common(lang)), toolVersion: version(path.join(root, 'image/tools', tl.id + '.js')),
    helperScripts: ['image-compress', 'signature-resize'].includes(tl.id) ? `<script src="/image/target-size.js?v=${version(path.join(root, 'image/target-size.js'))}" defer></script>` : '',
    tool: safeJson({ id: tl.id, lang, langUrls: langUrls(tl.id), next, strings: T }) };
  urls.push(finish(toolTpl, lang, tl.id, vars)); count++;
}

// 사이트맵은 tools/build-sitemaps.js 가 생성된 HTML 을 훑어 만든다(색인 가능·자기 canonical 페이지만)
console.log('image pages:', count, '| tools:', tools.map(t => t.id).join(',') || '(없음)', '| languages:', langs.join(','), '| indexable urls:', urls.length);
