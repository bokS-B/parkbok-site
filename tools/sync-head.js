// 모든 HTML 페이지의 <head>를 한 번에 맞춘다. 여러 번 실행해도 결과는 같다.
//   node tools/sync-head.js
// 1) /assets/site.css 링크를 <style id="site-css">로 인라인 (렌더링 차단 제거)
// 2) 파비콘·manifest·OG 이미지 공통 태그 삽입 (<!-- head:common --> 표식 사이)
// 3) GA4 코드 삽입 (tools/ga-id.txt 에 측정 ID가 있을 때만)
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8').trim();
const gaIdFile = path.join(__dirname, 'ga-id.txt');
const gaId = fs.existsSync(gaIdFile) ? fs.readFileSync(gaIdFile, 'utf8').trim() : '';

const COMMON = [
  '<!-- head:common -->',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<link rel="icon" href="/favicon.ico" sizes="32x32">',
  '<link rel="apple-touch-icon" href="/icon-180.png">',
  '<link rel="manifest" href="/manifest.json">',
  '<meta name="theme-color" content="#2563eb">',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="박복판 스튜디오">',
  '<meta property="og:image" content="https://parkbok.com/og.png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<!-- /head:common -->'
].join('\n');

const GA = gaId ? [
  '<!-- head:ga -->',
  '<script async src="https://www.googletagmanager.com/gtag/js?id=' + gaId + '"></script>',
  '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","' + gaId + '");</script>',
  '<!-- /head:ga -->'
].join('\n') : '';

let changed = 0;
function walk(dir){
  for (const name of fs.readdirSync(dir)) {
    if (['.git', '_build', 'node_modules', 'docs', 'tools'].includes(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    let src = fs.readFileSync(p, 'utf8');
    const before = src;

    // 1) CSS 인라인
    const styleTag = '<style id="site-css">\n' + css + '\n</style>';
    if (/<style id="site-css">[\s\S]*?<\/style>/.test(src)) src = src.replace(/<style id="site-css">[\s\S]*?<\/style>/, styleTag);
    else src = src.replace(/<link rel="stylesheet" href="\/assets\/site\.css">/, styleTag);

    // 2) 공통 태그
    if (/<!-- head:common -->[\s\S]*?<!-- \/head:common -->/.test(src)) src = src.replace(/<!-- head:common -->[\s\S]*?<!-- \/head:common -->/, COMMON);
    else src = src.replace(/<\/head>/, COMMON + '\n</head>');

    // 3) GA4
    if (/<!-- head:ga -->[\s\S]*?<!-- \/head:ga -->\n?/.test(src)) src = src.replace(/<!-- head:ga -->[\s\S]*?<!-- \/head:ga -->\n?/, GA ? GA + '\n' : '');
    else if (GA) src = src.replace(/<\/head>/, GA + '\n</head>');

    if (src !== before) { fs.writeFileSync(p, src, 'utf8'); changed++; console.log('updated', path.relative(root, p)); }
  }
}
walk(root);
console.log('done. changed files:', changed, gaId ? '(GA ' + gaId + ')' : '(GA 없음: tools/ga-id.txt 없음)');
