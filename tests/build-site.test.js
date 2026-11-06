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
  fs.copyFileSync(path.join(__dirname, '../tools/build-site.js'), path.join(root, 'tools/build-site.js'));
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
