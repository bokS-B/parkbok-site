// 사이트 이름을 전 페이지에 반영한다. 브랜드는 영어 "parkbok", 한국어 법인명은 소개 페이지에만 "박복한 스튜디오".
//   node tools/rename-site.js
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const NAME = 'parkbok';
const REPL = [
  // 예전 이름들 → parkbok
  [/\| (?:parkbok\.com|박복판 스튜디오|박복한 스튜디오)<\/title>/g, '| ' + NAME + '</title>'],
  [/content="([^"]*) \| (?:parkbok\.com|박복판 스튜디오|박복한 스튜디오)"/g, 'content="$1 | ' + NAME + '"'],
  [/<a class="brand" href="\/">(?:parkbok<span style="color:#2563eb">\.com<\/span>|박복판 <span style="color:#2563eb">스튜디오<\/span>|박복한 <span style="color:#2563eb">스튜디오<\/span>)<\/a>/g, '<a class="brand" href="/">' + NAME + '</a>'],
  [/© (?:박복판 스튜디오|박복한 스튜디오) · parkbok\.com/g, '© ' + NAME],
  [/© parkbok\.com(?! ·)/g, '© ' + NAME],
  [/"name":"(?:parkbok|박복판 스튜디오|박복한 스튜디오) HWP 뷰어"/g, '"name":"' + NAME + ' HWP 뷰어"'],
  // 소개 페이지
  [/<h1>(?:parkbok\.com|박복판 스튜디오\(parkbok\.com\)|박복한 스튜디오\(parkbok\.com\)) 소개<\/h1>/g, '<h1>parkbok (박복한 스튜디오) 소개</h1>'],
  [/<p>(?:parkbok\.com은|박복판 스튜디오는|박복한 스튜디오는) "한글/g, '<p>parkbok(박복한 스튜디오)은 "한글'],
  [/content="(?:parkbok\.com은|박복판 스튜디오\(parkbok\.com\)는|박복한 스튜디오\(parkbok\.com\)는) 설치 없이/g, 'content="parkbok(박복한 스튜디오)은 설치 없이'],
];
let changed = 0;
function walk(dir){
  for (const name of fs.readdirSync(dir)) {
    if (['.git', '_build', 'node_modules', 'docs', 'tools', 'wheel'].includes(name)) continue;
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
