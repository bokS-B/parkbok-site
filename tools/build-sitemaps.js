// 사이트맵 생성기: 다른 생성기가 만든 HTML 을 모두 훑어 색인 가능한 페이지만 사이트맵에 넣는다.
//   node tools/build-sitemaps.js   (build-all.js 가 build-site 다음에 실행)
// 넣는 조건: robots 에 noindex 가 없고 canonical 이 자기 자신인 페이지.
//   sitemap.xml          = 아래 세 파일을 가리키는 사이트맵 인덱스
//   sitemap-core.xml     = 홈, 허브 3개(/image/ /pdf/ /color/), 영어 기본 도구 페이지, HWP 뷰어
//   sitemap-tools.xml    = 그 밖의 색인 페이지(다른 언어 도구·허브, 텍스트 도구, 가이드, 룰렛, 게임, 소개 등)
//   sitemap-colors.xml   = 큐레이션된 /color/hex/ 페이지(color/src/curated-colors.json)
// lastmod 는 본문이 바뀐 날만 갱신한다: src/sitemap-lastmod.json 에 URL 별 본문 해시와 날짜를 두고, 해시가 같으면 날짜를 유지한다.
//   본문 = 제목 + 설명 + <main>(없으면 <body>) 에서 script·style·nav 를 뺀 텍스트. 공통 셸·내비게이션 링크만 바뀐 경우는 lastmod 를 건드리지 않는다.
//   기록이 없는 URL 은 그 파일의 마지막 커밋 날짜(본문이 커밋본과 다르면 오늘)로 시작한다.
// robots.txt 도 다시 쓴다. 사이트맵 URL 중 다른 페이지에서 링크되지 않는 고아 페이지가 있으면 실패(종료코드 1)한다.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const SITE = 'https://parkbok.com';
const PUBLIC_DIRS = ['color', 'games', 'guide', 'hwp', 'image', 'pdf', 'text', 'wheel', 'en', 'ja', 'zh', 'es', 'pt', 'de', 'fr'];
const LASTMOD = path.join(root, 'src', 'sitemap-lastmod.json');
const day = d => d.toISOString().slice(0, 10);   // 날짜는 모두 UTC 기준(로컬·CI 결과가 같도록)
const today = day(new Date());

// ---------- 페이지 수집 ----------
// package-site.py 가 공개하는 것과 같은 범위: 루트 HTML + 공개 폴더(src·숨김 폴더 제외)
const files = fs.readdirSync(root).filter(n => n.endsWith('.html') && n !== '404.html').map(n => path.join(root, n));
function walk(dir){
  for (const n of fs.readdirSync(dir)) {
    if (n === 'src' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith('.html')) files.push(p);
  }
}
PUBLIC_DIRS.forEach(d => { if (fs.existsSync(path.join(root, d))) walk(path.join(root, d)); });

const relOf = p => path.relative(root, p).split(path.sep).join('/');
const urlOf = rel => '/' + rel.replace(/(^|\/)index\.html$/, '$1');
const attr = (s, re) => { const m = s.match(re); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : ''; };
function content(s){
  const body = (s.match(/<main[\s>][\s\S]*<\/main>/) || s.match(/<body[\s\S]*<\/body>/) || [s])[0];
  return body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<nav[\s\S]*?<\/nav>/g, '').replace(/\s+/g, ' ').trim();
}
const hashOf = s => crypto.createHash('sha256').update(attr(s, /<title>([^<]*)<\/title>/) + '\n' + attr(s, /<meta name="description" content="([^"]*)"/) + '\n' + content(s)).digest('hex').slice(0, 16);

const pages = files.map(p => {
  const rel = relOf(p), s = fs.readFileSync(p, 'utf8'), url = urlOf(rel);
  const canonical = attr(s, /<link rel="canonical" href="([^"]*)"/);
  const robots = attr(s, /<meta name="(?:robots|googlebot)" content="([^"]*)"/i).toLowerCase();
  const links = new Set();
  for (const m of s.matchAll(/<a\s[^>]*?href="([^"#]*)(?:#[^"]*)?"/g)) {
    const h = m[1]; if (!h || /^(?:mailto:|tel:|javascript:|data:)/.test(h)) continue;
    let u; try { u = new URL(h, SITE + url); } catch (e) { continue; }
    if (u.origin === SITE) links.add(u.pathname.replace(/\/index\.html$/, '/'));
  }
  return { rel, url, s, canonical, noindex: robots.includes('noindex'), title: attr(s, /<title>([^<]*)<\/title>/), description: attr(s, /<meta name="description" content="([^"]*)"/), links };
});
const indexable = pages.filter(p => !p.noindex && p.canonical === SITE + p.url).sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0);

// ---------- 분류 ----------
const HUBS = ['/', '/image/', '/pdf/', '/color/'];
const coreRe = /^\/(?:image|pdf|color)\/(?!hex\/)[\w-]+\/$|^\/hwp\/$/;   // 언어 접두 없는 기본(영어) 도구 페이지 + HWP 뷰어
const LANGS = /\/(?:ko|zh|ja|es|pt|de|fr)\/$/;
const group = p => p.url.startsWith('/color/hex/') ? 'colors' : HUBS.includes(p.url) || (coreRe.test(p.url) && !LANGS.test(p.url)) ? 'core' : 'tools';

// ---------- lastmod ----------
const prev = fs.existsSync(LASTMOD) ? JSON.parse(fs.readFileSync(LASTMOD, 'utf8')) : {};
let gitDates = null;
function seedDate(p, h){
  try {
    if (!gitDates) {
      gitDates = new Map();
      const paths = indexable.filter(q => !prev[q.url]).map(q => q.rel);
      for (let i = 0; i < paths.length; i += 200) {
        const out = execFileSync('git', ['log', '--format=%x00%ct', '--name-only', 'HEAD', '--', ...paths.slice(i, i + 200)], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
        let d = '';
        for (const line of out.split('\n')) { if (line.startsWith('\0')) d = day(new Date(1000 * line.slice(1))); else if (line && !gitDates.has(line)) gitDates.set(line, d); }
      }
    }
    const d = gitDates.get(p.rel);
    if (!d) return today;
    const committed = execFileSync('git', ['show', 'HEAD:' + p.rel], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
    return hashOf(committed) === h ? d : today;
  } catch (e) { return today; }
}
const next = {};
for (const p of indexable) {
  const h = hashOf(p.s), old = prev[p.url];
  p.lastmod = old && old.hash === h ? old.lastmod : old ? today : seedDate(p, h);
  next[p.url] = { hash: h, lastmod: p.lastmod };
}
const stable = JSON.stringify(Object.fromEntries(Object.keys(next).sort().map(k => [k, next[k]])), null, 1) + '\n';
if (!fs.existsSync(LASTMOD) || fs.readFileSync(LASTMOD, 'utf8') !== stable) fs.writeFileSync(LASTMOD, stable, 'utf8');

// ---------- 쓰기 ----------
const write = (name, text) => { const f = path.join(root, name); if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== text) fs.writeFileSync(f, text, 'utf8'); };
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const groups = { core: [], tools: [], colors: [] };
indexable.forEach(p => groups[group(p)].push(p));
const order = { '/': 0, '/image/': 1, '/pdf/': 2, '/color/': 3 };
groups.core.sort((a, b) => ((order[a.url] ?? 9) - (order[b.url] ?? 9)) || (a.url < b.url ? -1 : 1));
const index = [];
for (const [key, list] of Object.entries(groups)) {
  const name = 'sitemap-' + key + '.xml';
  write(name, '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + list.map(p => `  <url><loc>${xmlEsc(SITE + p.url)}</loc><lastmod>${p.lastmod}</lastmod></url>`).join('\n') + '\n</urlset>\n');
  // The newest page date can stay the same when the sitemap's membership changes.
  // The optional index lastmod describes the XML file itself, so omit that date.
  index.push(`  <sitemap><loc>${SITE}/${name}</loc></sitemap>`);
}
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + index.join('\n') + '\n</sitemapindex>\n');
write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');

// ---------- 검사 ----------
const inbound = new Map();
for (const p of pages) for (const l of p.links) if (l !== p.url) inbound.set(l, (inbound.get(l) || 0) + 1);
const orphans = indexable.filter(p => p.url !== '/' && !inbound.get(p.url)).map(p => p.url);
const dup = key => { const m = new Map(); indexable.forEach(p => m.set(p[key], (m.get(p[key]) || []).concat(p.url))); return [...m].filter(([k, v]) => !k || v.length > 1); };
const dupTitles = dup('title'), dupDesc = dup('description');
console.log('sitemaps: core', groups.core.length, '| tools', groups.tools.length, '| colors', groups.colors.length, '| total', indexable.length,
  '| pages scanned', pages.length, '| noindex', pages.filter(p => p.noindex).length, '| orphans', orphans.length, '| duplicate titles', dupTitles.length, '| duplicate descriptions', dupDesc.length);
dupTitles.forEach(([k, v]) => console.warn('  ! title ' + (k ? 'shared' : 'missing') + ': ' + v.join(', ')));
dupDesc.forEach(([k, v]) => console.warn('  ! description ' + (k ? 'shared' : 'missing') + ': ' + v.join(', ')));
orphans.forEach(u => console.log('  ✗ orphan (no internal link): ' + u));
process.exit(orphans.length ? 1 : 0);
