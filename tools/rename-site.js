// 사이트 이름을 전 페이지에 반영한다 (제목 꼬리, 상단 로고, 바닥글, 구조화 데이터).
//   node tools/rename-site.js
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const NAME = '박복판 스튜디오';
const REPL = [
  [/\| parkbok\.com<\/title>/g, '| ' + NAME + '</title>'],
  [/content="([^"]*) \| parkbok\.com"/g, 'content="$1 | ' + NAME + '"'],
  [/<a class="brand" href="\/">parkbok<span style="color:#2563eb">\.com<\/span><\/a>/g, '<a class="brand" href="/">박복판 <span style="color:#2563eb">스튜디오</span></a>'],
  [/© parkbok\.com(?! ·)/g, '© ' + NAME + ' · parkbok.com'],
  [/"name":"parkbok HWP 뷰어"/g, '"name":"' + NAME + ' HWP 뷰어"'],
];
let changed = 0;
function walk(dir){
  for (const name of fs.readdirSync(dir)) {
    if (['.git', '_build', 'node_modules', 'docs', 'tools'].includes(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    let src = fs.readFileSync(p, 'utf8'); const before = src;
    for (const [re, to] of REPL) src = src.replace(re, to);
    if (src !== before) { fs.writeFileSync(p, src, 'utf8'); changed++; console.log('renamed', path.relative(root, p)); }
  }
}
walk(root);
console.log('done:', changed);
