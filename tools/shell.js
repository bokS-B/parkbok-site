// 셸 조각 생성기. src/shell.html + src/site-strings.json + assets/site.css 를 읽어
// head-common / header / footer 세 조각을 언어·섹션에 맞게 채워 돌려준다.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const STR = JSON.parse(fs.readFileSync(path.join(root, 'src', 'site-strings.json'), 'utf8'));
const SHELL = fs.readFileSync(path.join(root, 'src', 'shell.html'), 'utf8');
const siteCss = fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8').trim();
const gaFile = path.join(__dirname, 'ga-id.txt');
const gaId = fs.existsSync(gaFile) ? fs.readFileSync(gaFile, 'utf8').trim() : '';
// Ownership verification is separate from ad serving. No ad units or Auto ads are enabled.
// Keep ads.txt + this supported verification method independently of CMP/ad serving.
// Do not restore the ad loader on every route: review eligible placements + CMP first.
const ADSENSE = '<meta name="google-adsense-account" content="ca-pub-1415309581345613">';
// Shared basic-consent loader: production hosts only; pb_internal is preserved.
// Google consent bootstrap runs before consent; GA waits for opt-in. GA excludes query/hash.
const GA_HOSTS = ['parkbok.com', 'www.parkbok.com'];
const GA = gaId ? '<script defer src="/assets/usage-privacy.js" data-ga="' + gaId + '"></script>' : '';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function fragment(name){
  const m = SHELL.match(new RegExp('(<!-- shell:' + name + ' -->[\\s\\S]*?<!-- /shell:' + name + ' -->)'));
  if (!m) throw new Error('shell.html에 ' + name + ' 조각이 없습니다');
  return m[1];
}
function fill(tpl, vars){ return tpl.replace(/\{\{([\w.:]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)); }
const strings = lang => STR[lang] || STR.en;

function head({ og = 'og.png' } = {}){
  return fill(fragment('head-common'), { og, adsense: ADSENSE, ga: GA, site_css: siteCss });
}
// 언어별 구역 루트: 영어는 /<section>/, 그 외는 /<section>/<lang>/
const sectionHome = (section, lang) => '/' + section + '/' + (lang === 'en' ? '' : lang + '/');
function header({ lang = 'ko', section = '', wheelHome = '/wheel/ko/', pdfHome = '/pdf/ko/', imageHome = '/image/ko/', colorHome = '/color/ko/', langSelect = '', subnav = '' } = {}){
  const t = strings(lang);
  const on = s => (section === s ? ' class="on"' : '');
  return fill(fragment('header'), {
    brand: esc(t.brand), menu: esc(t.menu),
    'nav.hwp': esc(t.nav.hwp), 'nav.text': esc(t.nav.text), 'nav.pdf': esc(t.nav.pdf || 'PDF'), 'nav.image': esc(t.nav.image || 'Image'), 'nav.color': esc(t.nav.color || 'Color'), 'nav.wheel': esc(t.nav.wheel), 'nav.guide': esc(t.nav.guide),
    'nav.game': esc(t.nav.game), 'on:game': section === 'game' || section === 'wheel' ? ' class="on"' : '',
    'on:hwp': on('hwp'), 'on:text': on('text'), 'on:pdf': on('pdf'), 'on:image': on('image'), 'on:color': on('color'), 'on:wheel': on('wheel'), 'on:guide': on('guide'),
    wheel_home: wheelHome, pdf_home: pdfHome, image_home: imageHome, color_home: colorHome, lang_select: langSelect, subnav, theme: esc(t.theme || 'Theme')
  });
}
// 바닥글은 3개 허브(이미지·PDF·색상) + 소개·개인정보·문의만 — 허브는 페이지 언어의 허브로 보낸다
function footer({ lang = 'ko', extra = '' } = {}){
  const t = strings(lang), hub = s => sectionHome(s, STR[lang] ? lang : 'en');
  return fill(fragment('footer'), {
    'foot.about': esc(t.foot.about), 'foot.privacy': esc(t.foot.privacy), 'foot.contact': esc(t.foot.contact || 'Contact'),
    'nav.image': esc(t.nav.image || 'Image'), 'nav.pdf': esc(t.nav.pdf || 'PDF'), 'nav.color': esc(t.nav.color || 'Color'),
    image_home: hub('image'), pdf_home: hub('pdf'), color_home: hub('color'),
    footMenu: esc(t.footMenu || t.menu), foot_extra: extra
  });
}
// 브레드크럼: items = [{name, url}] (마지막 항목은 현재 페이지라 링크 없이). 화면용 <nav> 와 BreadcrumbList JSON-LD 객체를 함께 돌려준다
function breadcrumb(lang, items){
  const t = strings(lang), SITE = 'https://parkbok.com';
  const html = '<nav class="crumbs" aria-label="' + esc(t.breadcrumb || 'Breadcrumb') + '"><ol>' + items.map((it, i) => i === items.length - 1
    ? '<li aria-current="page">' + esc(it.name) + '</li>'
    : '<li><a href="' + esc(it.url) + '">' + esc(it.name) + '</a></li>').join('') + '</ol></nav>';
  const jsonld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE + it.url })) };
  return { html, jsonld };
}
// 페이지 안의 마커 블록을 새 조각으로 바꾼다 (없으면 fallback 정규식으로 기존 요소를 찾아 바꾸고, 그것도 없으면 그대로)
function replaceBlock(html, name, replacement, fallbackRe){
  const re = new RegExp('<!-- shell:' + name + ' -->[\\s\\S]*?<!-- /shell:' + name + ' -->');
  if (re.test(html)) return html.replace(re, () => replacement);
  if (fallbackRe && fallbackRe.test(html)) return html.replace(fallbackRe, () => replacement);
  return html;
}
module.exports = { head, header, footer, breadcrumb, replaceBlock, strings, esc, sectionHome, langs: Object.keys(STR), ADSENSE, GA, GA_HOSTS, gaId };
