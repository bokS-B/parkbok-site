// 돌림판 페이지 생성기: wheel/src/{template.html, wheel.css, strings.json} + 공통 셸(tools/shell.js)
//   → /wheel/[언어/][프리셋/]index.html  (node tools/build-wheel.js)
// 언어를 추가하려면 strings.json 과 src/site-strings.json 에 블록을 추가하면 된다. 사이트맵의 wheel 블록도 같이 갱신한다.
const fs = require('fs'), path = require('path');
const shell = require('./shell');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'wheel', 'src');
const S = JSON.parse(fs.readFileSync(path.join(src, 'strings.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'wheel.css'), 'utf8').trim();
const PRESETS = ['index', 'yes-or-no', 'number', 'what-to-eat'];
const HREFLANG = { en: 'en', ko: 'ko', zh: 'zh-Hans', ja: 'ja', es: 'es', pt: 'pt', de: 'de', fr: 'fr' };
const HTMLLANG = { zh: 'zh-Hans' };
const langs = Object.keys(S);
const SITE = 'https://parkbok.com';

const url = (lang, preset) => '/wheel/' + (lang === 'en' ? '' : lang + '/') + (preset === 'index' ? '' : preset + '/');
const esc = shell.esc;
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c');

let urls = [], count = 0;
for (const lang of langs) for (const preset of PRESETS) {
  const L = S[lang], P = L.presets[preset], U = L.ui;
  const canonical = SITE + url(lang, preset);
  const hreflangs = langs.map(l => `<link rel="alternate" hreflang="${HREFLANG[l] || l}" href="${SITE}${url(l, preset)}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${url('en', preset)}">`;
  const presetChips = PRESETS.filter(p => p !== preset).map(p => `<a class="chip" href="${url(lang, p)}">${esc(L.presets[p].h1)}</a>`).join('');
  const subnavChips = PRESETS.map(p => `<a class="chip${p === preset ? ' on' : ''}" href="${url(lang, p)}">${esc(L.presets[p].nav)}</a>`).join('');
  const langOptions = langs.map(l => `<option value="${url(l, preset)}" data-code="${l}"${l === lang ? ' selected' : ''}>${esc(S[l].name)}</option>`).join('');
  const steps = L.steps.map(s => `<li>${esc(s)}</li>`).join('');
  const faq = P.faq.map(q => `<dt>${esc(q[0])}</dt><dd>${esc(q[1])}</dd>`).join('');
  let presetControls = '';
  if (preset === 'number') presetControls = `<div class="ctl"><label>${esc(U.from)} <input type="number" id="num-from" value="1"></label><label>${esc(U.to)} <input type="number" id="num-to" value="10"></label><button class="btn ghost sm" type="button" id="num-apply">${esc(U.ok)}</button></div>`;
  if (preset === 'yes-or-no') presetControls = `<div class="ctl"><label><input type="checkbox" id="yn-maybe"> ${esc(U.maybe)}</label></div>`;
  const langUrls = {}; langs.forEach(l => { langUrls[l] = url(l, preset); });
  const config = { lang, preset, ui: U, entries: P.entries || [], langUrls, maybeWord: U.maybeWord };
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: P.h1, url: canonical, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', inLanguage: HREFLANG[lang] || lang, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: P.description },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: P.faq.map(q => ({ '@type': 'Question', name: q[0], acceptedAnswer: { '@type': 'Answer', text: q[1] } })) }
  ];
  const vars = {
    lang: HTMLLANG[lang] || lang, dir: L.dir || 'ltr', title: esc(P.title), description: esc(P.description), canonical, hreflangs,
    presetChips, h1: esc(P.h1), intro: esc(P.intro), steps, faq, presetControls, css, jsonld: safeJson(jsonld), config: safeJson(config)
  };
  let html = tpl.replace(/\{\{ui\.(\w+)\}\}/g, (m, k) => esc(U[k] != null ? U[k] : m));
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  // 셸은 마지막에 끼운다 (site.css 안의 중괄호가 위 치환에 걸리지 않도록)
  const langSelect = `<select id="lang" class="lang-select" aria-label="${esc(shell.strings(lang).language || U.language)}">${langOptions}</select>`;
  const subnav = `<nav class="subnav" aria-label="${esc(U.other)}"><div class="wrap">${subnavChips}</div></nav>`;
  html = html.split('{{shell_head}}').join(shell.head({ og: 'og-wheel.png' }));
  html = html.split('{{shell_header}}').join(shell.header({ lang, section: 'wheel', wheelHome: url(lang, 'index'), pdfHome: lang === 'en' ? '/pdf/' : '/pdf/' + lang + '/', imageHome: lang === 'en' ? '/image/' : '/image/' + lang + '/', colorHome: lang === 'en' ? '/color/' : '/color/' + lang + '/', langSelect, subnav }));
  html = html.split('{{shell_footer}}').join(shell.footer({ lang }));
  const out = path.join(root, url(lang, preset).replace(/\//g, path.sep), 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  urls.push(canonical); count++;
}

// 사이트맵은 tools/build-sitemaps.js 가 생성된 HTML 을 훑어 만든다(색인 가능·자기 canonical 페이지만)
console.log('wheel pages:', count, '| languages:', langs.join(','), '| indexable urls:', urls.length);
