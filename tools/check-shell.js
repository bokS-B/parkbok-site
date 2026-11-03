// 셸 통일 검사: 모든 HTML 이 같은 헤더·푸터·광고/측정 코드를 정확히 1회 갖는지 확인한다. 실패하면 종료코드 1.
//   node tools/check-shell.js
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const SKIP = ['.git', '.hallmark', '_build', 'node_modules', 'docs', 'tools', 'tests', 'output', 'src'];
const files = [];
(function walk(dir){ for (const n of fs.readdirSync(dir)) { if (SKIP.includes(n) || (n === 'hex' && path.basename(dir) === 'color')) continue; /* color/hex/ 롱테일은 전용 축약 CSS 라 제외 */ const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith('.html')) files.push(p); } })(root);
const fails = [];
const byLang = {};
for (const p of files) {
  const rel = path.relative(root, p).split(path.sep).join('/');
  const s = fs.readFileSync(p, 'utf8');
  const count = re => (s.match(re) || []).length;
  if (count(/name="google-adsense-account" content="ca-pub-1415309581345613"/g) !== 1) fails.push(rel + ': 애드센스 소유권 메타 누락/중복');
  if (count(/src="\/assets\/usage-privacy\.js" data-ga="G-377MXFWS51"/g) !== 1) fails.push(rel + ': 동의형 GA 로더 누락/중복');
  if (/adsbygoogle\.js|googletagmanager\.com/.test(s)) fails.push(rel + ': 동의 전 직접 Google 로더');
  if (count(/<style id="site-css">/g) !== 1) fails.push(rel + ': site-css ' + count(/<style id="site-css">/g) + '회');
  if (count(/<!-- shell:header -->/g) !== 1 || count(/<!-- shell:footer -->/g) !== 1 || count(/<!-- shell:head-common -->/g) !== 1) fails.push(rel + ': 셸 마커 누락/중복');
  if (count(/<header /g) !== 1 || count(/<footer/g) !== 1) fails.push(rel + ': header/footer 요소 ' + count(/<header /g) + '/' + count(/<footer/g));
  const foot = (s.match(/<!-- shell:footer -->[\s\S]*?<!-- \/shell:footer -->/) || [''])[0];
  // 바닥글 = 허브 3개 + 소개·개인정보·문의, 그 외 링크 없음
  const footLinks = [...foot.matchAll(/<nav class="foot-links"[\s\S]*?<\/nav>/g)].join('').match(/href="[^"]*"/g) || [];
  if (footLinks.length !== 6 || !['/about.html', '/privacy.html', '/about.html#contact'].every(l => footLinks.includes(`href="${l}"`)) || !['image', 'pdf', 'color'].every(h => footLinks.some(f => f.startsWith(`href="/${h}/`)))) fails.push(rel + ': 푸터 링크가 허브 3개+소개·개인정보·문의가 아님');
  if (!/<a class="brand" href="\/">/.test(s)) fails.push(rel + ': 브랜드 링크가 / 가 아님');
  const lang = (s.match(/<html lang="([^"]+)"/) || [])[1] || '?';
  const multi = rel.startsWith('wheel/') ? 'wheel' : rel.startsWith('pdf/') ? 'pdf' : rel.startsWith('image/') ? 'image' : rel.startsWith('color/') ? 'color' : '';   // 8개 언어로 생성되는 구역
  if (multi) {
    const m = rel.match(/(?:^|\/)(ko|zh|ja|es|pt|de|fr)\//); const code = m ? m[1] : 'en';   // wheel/<lang>/<preset>/, pdf/<tool>/<lang>/ 둘 다
    const home = multi === 'wheel' ? '/games/' : '/' + multi + '/' + (code === 'en' ? '' : code + '/');
    if (!s.includes(`<a href="${home}" class="on">`)) fails.push(rel + ': 상단 ' + multi + ' 링크가 언어 루트(' + home + ')가 아니거나 on 아님');
    for (const need of ['og:description', 'og:url', '<html lang="', ' dir="']) if (!s.includes(need)) fails.push(rel + ': ' + need + ' 없음');
    if (multi === 'wheel' && count(/class="chip on"/g) !== 1) fails.push(rel + ': 서브내비 on 칩 ' + count(/class="chip on"/g) + '개');
  } else {
    if (lang !== 'ko') fails.push(rel + ': lang=' + lang);
  }
  // 헤더 동일성: 언어별로 class="on" / 언어선택 / 서브내비를 지운 뒤 비교
  let h = (s.match(/<!-- shell:header -->[\s\S]*?<!-- \/shell:header -->/) || [''])[0]
    .replace(/ class="on"/g, '').replace(/<select id="lang"[\s\S]*?<\/select>/, '').replace(/<nav class="subnav"[\s\S]*?<\/nav>/, '');
  const key = multi ? multi + ':' + lang : 'site:ko';
  (byLang[key] = byLang[key] || new Map()).set(h, (byLang[key].get(h) || []).concat(rel));
}
for (const [k, m] of Object.entries(byLang)) if (m.size !== 1) fails.push('헤더 불일치 ' + k + ': 변형 ' + m.size + '개 — ' + [...m.values()].map(v => v[0]).join(', '));
console.log('files:', files.length, '| header groups:', Object.keys(byLang).length, '| fails:', fails.length);
fails.forEach(f => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
