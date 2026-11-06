const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools/build-sitemaps.js'), 'utf8');

// Run the complete generator against one virtual page; never write public files or use Git.
function includesHome(meta) {
  const files = new Map([
    [path.join(root, 'index.html'), '<!doctype html><html><head><title>Fixture</title><meta name="description" content="Fixture"><link rel="canonical" href="https://parkbok.com/">' + meta + '</head><body><main><h1>Fixture</h1></main></body></html>'],
    [path.join(root, 'src', 'sitemap-lastmod.json'), '{}'],
  ]);
  const writes = new Map();
  const fakeFs = {
    readdirSync: dir => { assert.equal(dir, root); return ['index.html']; },
    existsSync: file => files.has(file),
    readFileSync: file => { assert.ok(files.has(file), 'Unexpected read: ' + file); return files.get(file); },
    writeFileSync: (file, value) => writes.set(path.relative(root, file), String(value)),
  };
  let exitCode;
  vm.runInNewContext(source, {
    URL,
    __dirname: path.join(root, 'tools'),
    require: name => name === 'fs' ? fakeFs : name === 'child_process' ? {
      execFileSync: () => { throw new Error('Git is unavailable in this fixture'); },
    } : require(name),
    console: { log() {}, warn() {} },
    process: { exit: code => { exitCode = code; } },
  });
  assert.equal(exitCode, 0);
  return writes.get('sitemap-core.xml').includes('<loc>https://parkbok.com/</loc>');
}

for (const [name, meta, included] of [
  ['no robots restriction', '', true],
  ['ordinary noindex', '<meta name="robots" content="noindex,follow">', false],
  ['later googlebot noindex', '<meta name="robots" content="index,follow"><meta name="googlebot" content="noindex">', false],
  ['later robots noindex', '<meta name="robots" content="nofollow"><meta name="robots" content="noindex">', false],
  ['none directive', '<meta name="robots" content="none">', false],
  ['reordered attributes', '<meta content="noindex" name="robots">', false],
  ['single quoted attributes', "<meta name='robots' content='noindex'>", false],
  ['unquoted attributes', '<meta name=robots content=noindex>', false],
  ['case insensitive tags attributes and rules', '<META NAME="ROBOTS" CONTENT="NOINDEX,FOLLOW">', false],
  ['Googlebot News only', '<meta name="googlebot-news" content="noindex">', true],
  ['all directive', '<meta name="robots" content="all">', true],
  ['image preview none is not noindex', '<meta name="robots" content="max-image-preview:none">', true],
  ['unknown rule containing noindex', '<meta name="robots" content="noindexish">', true],
  ['inert comment', '<!-- <meta name="robots" content="noindex"> -->', true],
  ['inert script string', '<script>const example = \'<meta name="robots" content="noindex">\';</script>', true],
  ['inert style string', '<style>.example::after { content: \'<meta name="robots" content="noindex">\'; }</style>', true],
  ['quoted greater-than attribute', '<meta data-note="a > b" content="noindex" name="robots">', false],
]) {
  test('sitemap inclusion respects ' + name, () => assert.equal(includesHome(meta), included));
}
