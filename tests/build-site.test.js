const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('site build preserves private browser exports while generating public pages', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parkbok-build-site-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('parkbok-build-site-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const folder of ['tools', 'src', 'assets', '.playwright-cli']) fs.mkdirSync(path.join(root, folder));
  for (const file of ['tools/build-site.js', 'tools/tool-ads.js', 'assets/tool-ads.js']) {
    fs.copyFileSync(path.join(__dirname, '..', file), path.join(root, file));
  }
  fs.writeFileSync(path.join(root, 'tools/shell.js'), `module.exports = {
    esc: value => value,
    head: () => '<meta name="test-shell" content="generated">',
    header: () => '<header>Generated navigation</header>',
    footer: () => '<footer>Generated footer</footer>',
    homeUrl: () => '/',
    sectionHome: section => '/' + section + '/',
    replaceBlock: source => source
  };`);
  fs.writeFileSync(path.join(root, 'src/tools.json'), '[]');
  fs.writeFileSync(path.join(root, 'src/icons.json'), '{}');
  fs.writeFileSync(path.join(root, 'src/home-strings.json'), JSON.stringify({ko:{title:'Example',description:'Fixture',h1:'Example',line:'Fixture',assurance:''}}));
  fs.writeFileSync(path.join(root, 'assets/home.js'), '');
  fs.writeFileSync(path.join(root, 'assets/home-tokens.css'), '');
  fs.writeFileSync(path.join(root, 'assets/home.css'), '');
  const document = '<!doctype html><html><head><title>Example</title></head><body><main>Offline export</main></body></html>';
  fs.writeFileSync(path.join(root, 'index.html'), document);
  fs.writeFileSync(path.join(root, 'public.html'), document);
  fs.writeFileSync(path.join(root, '.playwright-cli/export.html'), document);
  const result = spawnSync(process.execPath, [path.join(root, 'tools/build-site.js')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(fs.readFileSync(path.join(root, 'public.html'), 'utf8'), /Generated navigation/);
  assert.equal(fs.readFileSync(path.join(root, '.playwright-cli/export.html'), 'utf8'), document);
  assert.match(result.stdout, /pages: 2 \| changed: 2/);
});

test('the HWP viewer and each HWP guide have one Hancom source notice in the footer', () => {
  const notice = '<p class="foot-note">본 제품은 한컴의 <a href="https://download.hancom.com/support/downloadCenter/hwpOwpml" rel="noopener">HWP 문서 파일(.hwp) 공개 문서</a>를 참고하여 개발하였습니다.';
  const files = [
    'hwp/index.html',
    'guide/hwp-to-pdf.html',
    'guide/hwp-vs-hwpx.html',
    'guide/hwp-wont-open.html',
    'guide/open-hwp-on-mac.html',
    'guide/open-hwp-on-phone.html'
  ];
  for (const file of files) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const footer = html.match(/<!-- shell:footer -->[\s\S]*?<!-- \/shell:footer -->/)?.[0];
    assert.ok(footer?.includes(notice), file);
    assert.equal(html.match(/본 제품은 한컴의/g)?.length, 1, file);
  }
});
