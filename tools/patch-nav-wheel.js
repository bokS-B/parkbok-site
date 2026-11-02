// 한국어 페이지 상단 메뉴에 "룰렛" 링크를 넣고, 첫 화면에 룰렛 카드 묶음을 추가한다 (여러 번 실행해도 안전).
//   node tools/patch-nav-wheel.js
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const FROM = '<a href="/text/">텍스트 도구</a><a href="/guide/">';
const TO = '<a href="/text/">텍스트 도구</a><a href="/wheel/ko/">룰렛</a><a href="/guide/">';
let changed = 0;
function walk(dir){
  for (const name of fs.readdirSync(dir)) {
    if (['.git', '_build', 'node_modules', 'docs', 'tools', 'wheel'].includes(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    let s = fs.readFileSync(p, 'utf8'); const b = s;
    if (!s.includes('href="/wheel/ko/">룰렛')) s = s.split(FROM).join(TO);
    if (s !== b) { fs.writeFileSync(p, s, 'utf8'); changed++; console.log('nav:', path.relative(root, p)); }
  }
}
walk(root);

const idx = path.join(root, 'index.html');
let s = fs.readFileSync(idx, 'utf8');
if (!s.includes('id="wheel-cards"')) {
  const cards = `  <h2>룰렛</h2>
  <div class="grid" id="wheel-cards">
    <a class="card" href="/wheel/ko/"><h3>돌림판 룰렛</h3><p>이름 넣고 돌려서 랜덤 뽑기</p></a>
    <a class="card" href="/wheel/ko/what-to-eat/"><h3>오늘 뭐 먹지</h3><p>메뉴 룰렛</p></a>
    <a class="card" href="/wheel/ko/yes-or-no/"><h3>예 아니오 룰렛</h3><p>돌려서 결정</p></a>
    <a class="card" href="/wheel/ko/number/"><h3>숫자 룰렛</h3><p>범위 안에서 랜덤 숫자</p></a>
  </div>

  <h2>가이드</h2>`;
  s = s.replace('  <h2>가이드</h2>', cards);
  fs.writeFileSync(idx, s, 'utf8'); console.log('index: wheel cards added');
}
console.log('done, nav changed:', changed);
