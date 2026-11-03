// 셸 조각 생성기. src/shell.html + src/site-strings.json + assets/site.css 를 읽어
// head-common / header / footer 세 조각을 언어·섹션에 맞게 채워 돌려준다.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const STR = JSON.parse(fs.readFileSync(path.join(root, 'src', 'site-strings.json'), 'utf8'));
const SHELL = fs.readFileSync(path.join(root, 'src', 'shell.html'), 'utf8');
const siteCss = fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8').trim();
const gaFile = path.join(__dirname, 'ga-id.txt');
const gaId = fs.existsSync(gaFile) ? fs.readFileSync(gaFile, 'utf8').trim() : '';
const ADSENSE = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1415309581345613" crossorigin="anonymous"></script>';
// GA4 로더(A1-02). 정적 <script src=googletagmanager> 를 두지 않고, 인라인 스크립트가 location.hostname 이 운영 allowlist
// (parkbok.com / www.parkbok.com) 일 때만 gtag.js 를 동적으로 넣고 config 를 보낸다. localhost·127.0.0.1·*.github.io·file: 등은 아무것도 로드·전송하지 않는다.
// 내부 트래픽 표식(A1-05 대안): 주소에 ?pb_internal=1|0 이 있으면 localStorage 'pb_internal' 에 저장하고 history.replaceState 로 쿼리를 지운다(어느 호스트에서나).
// localStorage 'pb_internal'==='1' 이면 config 에 { traffic_type:'internal' } 을 넣는다(GA4 기본 'Internal Traffic' 데이터 필터가 보는 매개변수).
// 콘솔 로그·UI 표시 없음. 전부 try/catch 라 분석이 막혀도 도구 기능과 무관하다. 바이트 수는 HEX 페이지 6144B 한도에 들어가야 한다(build-color-pages 참고).
const GA_HOSTS = ['parkbok.com', 'www.parkbok.com'];
const GA = gaId ? '<script>(function(){try{var u=new URL(location.href),v=u.searchParams.get("pb_internal");if(v==="1"||v==="0"){localStorage.setItem("pb_internal",v);u.searchParams.delete("pb_internal");history.replaceState(null,"",u.href)}}catch(e){}'
  + 'try{if(' + JSON.stringify(GA_HOSTS) + '.indexOf(location.hostname)<0)return;var c={};try{if(localStorage.getItem("pb_internal")==="1")c.traffic_type="internal"}catch(e){}'
  + 'var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=' + gaId + '";document.head.appendChild(s);'
  + 'window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag("js",new Date());gtag("config","' + gaId + '",c)}catch(e){}})()</script>' : '';

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
function footer({ lang = 'ko', extra = '' } = {}){
  const t = strings(lang);
  return fill(fragment('footer'), {
    'foot.about': esc(t.foot.about), 'foot.privacy': esc(t.foot.privacy), 'foot.terms': esc(t.foot.terms), 'foot.guide': esc(t.foot.guide),
    footMenu: esc(t.footMenu || t.menu), foot_extra: extra
  });
}
// 페이지 안의 마커 블록을 새 조각으로 바꾼다 (없으면 fallback 정규식으로 기존 요소를 찾아 바꾸고, 그것도 없으면 그대로)
function replaceBlock(html, name, replacement, fallbackRe){
  const re = new RegExp('<!-- shell:' + name + ' -->[\\s\\S]*?<!-- /shell:' + name + ' -->');
  if (re.test(html)) return html.replace(re, () => replacement);
  if (fallbackRe && fallbackRe.test(html)) return html.replace(fallbackRe, () => replacement);
  return html;
}
module.exports = { head, header, footer, replaceBlock, strings, esc, sectionHome, langs: Object.keys(STR), ADSENSE, GA, GA_HOSTS, gaId };
