const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('shell check ignores private browser exports while checking public HTML', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parkbok-shell-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.copyFileSync(path.join(__dirname, '../tools/check-shell.js'), path.join(root, 'tools/check-shell.js'));
  fs.writeFileSync(path.join(root, 'tools/shell.js'), `module.exports = {
    homeUrl: lang => lang === 'ko' ? '/' : '/' + lang + '/',
    sectionHome: (section, lang) => '/' + section + '/' + (lang === 'en' ? '' : lang + '/')
  };`);
  fs.copyFileSync(path.join(__dirname, '../index.html'), path.join(root, 'index.html'));
  const check = () => spawnSync(process.execPath, [path.join(root, 'tools/check-shell.js')], { encoding: 'utf8', timeout: 5000 });
  const baseline = check();
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  assert.match(baseline.stdout, /files: 1 \| header groups: 1 \| fails: 0/);

  fs.mkdirSync(path.join(root, '.playwright-cli'));
  fs.writeFileSync(path.join(root, '.playwright-cli/export.html'), '<html lang="en"><h1>Standalone palette export</h1></html>');
  const withPrivateExport = check();
  assert.equal(withPrivateExport.status, 0, withPrivateExport.stdout + withPrivateExport.stderr);
  assert.match(withPrivateExport.stdout, /files: 1 \| header groups: 1 \| fails: 0/);

  fs.mkdirSync(path.join(root, 'games'));
  fs.writeFileSync(path.join(root, 'games/broken.html'), '<html lang="ko"><h1>Broken public page</h1></html>');
  const withBrokenPublicPage = check();
  assert.equal(withBrokenPublicPage.status, 1, withBrokenPublicPage.stdout + withBrokenPublicPage.stderr);
  assert.match(withBrokenPublicPage.stdout, /games\/broken\.html: 셸 마커 누락\/중복/);
  assert.doesNotMatch(withBrokenPublicPage.stdout, /\.playwright-cli/);
});
