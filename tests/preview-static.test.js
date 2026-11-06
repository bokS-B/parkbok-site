const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');

test('static preview serves public files and keeps review/source files private', async t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'parkbok-preview-test-'));
  const root = path.join(fixture, 'site');
  const write = (name, value) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  write('index.html', '<h1>Preview fixture</h1>');
  write('image/tools/runtime.js', 'public browser runtime');
  write('docs/fixture.txt', 'private documentation');
  write('output/report.json', '{"private":"review"}');
  write('test-results/fixture.txt', 'private browser results');
  write('assets/src/private.json', '{"private":"source"}');
  write('.private/fixture.txt', 'hidden file');
  write('tools/preview-static.js', fs.readFileSync(path.join(__dirname, '../tools/preview-static.js')));
  const outside = path.join(fixture, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'fixture.txt'), 'outside preview root');

  const links = [];
  t.after(() => {
    for (const link of links) {
      if (process.platform === 'win32') fs.rmdirSync(link);
      else fs.unlinkSync(link);
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const availablePort = net.createServer();
  availablePort.listen(0, '127.0.0.1');
  await once(availablePort, 'listening');
  const port = availablePort.address().port;
  await new Promise(resolve => availablePort.close(resolve));
  const server = spawn(process.execPath, [path.join(root, 'tools/preview-static.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const closed = once(server, 'close');
      server.kill();
      await closed;
    }
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Preview startup timed out: ' + output)), 5000);
    const done = error => { clearTimeout(timer); server.off('exit', exited); error ? reject(error) : resolve(); };
    const exited = code => done(Error('Preview exited: ' + code + ' ' + output));
    server.once('exit', exited);
    server.once('error', done);
    server.stderr.on('data', data => { output += data; });
    server.stdout.on('data', data => { output += data; if (output.includes('Static preview:')) done(); });
  });
  const request = (url, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', data => { body += data; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(Error('Preview request timed out')));
    req.end();
  });
  await t.test('public directory index and browser runtime remain available', async () => {
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.equal(home.body, '<h1>Preview fixture</h1>');
    assert.equal(home.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(home.headers['cache-control'], 'no-store');
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    const runtime = await request('/image/tools/runtime.js');
    assert.equal(runtime.status, 200);
    assert.equal(runtime.body, 'public browser runtime');
    const head = await request('/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  });
  await t.test('review output and case variants of private paths return 404', async () => {
    for (const url of ['/output/report.json', '/OUTPUT/report.json', '/docs/fixture.txt', '/DOCS/fixture.txt', '/tools/preview-static.js', '/TOOLS/preview-static.js', '/assets/src/private.json', '/assets/SRC/private.json', '/.private/fixture.txt', '/%6futput/report.json', '/output%5creport.json']) {
      assert.equal((await request(url)).status, 404, url);
    }
  });
  await t.test('malformed URLs and unsupported methods are rejected', async () => {
    assert.equal((await request('/%E0%A4%A')).status, 400);
    assert.equal((await request('/', 'POST')).status, 405);
    assert.equal((await request('/%2e%2e%2foutside/fixture.txt')).status, 404);
  });
  await t.test('Windows short directory names cannot bypass private path checks', async t => {
    if (process.platform !== 'win32') { t.skip('Windows 8.3 aliases only'); return; }
    const shortName = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'for %I in ("%PARKBOK_PREVIEW_ALIAS_DIR%") do @echo %~snxI'], {
      env: { ...process.env, PARKBOK_PREVIEW_ALIAS_DIR: path.join(root, 'test-results') },
      encoding: 'utf8', timeout: 5000, windowsHide: true, windowsVerbatimArguments: true
    });
    assert.ifError(shortName.error);
    assert.equal(shortName.status, 0, shortName.stdout + shortName.stderr);
    const alias = shortName.stdout.trim();
    assert.match(alias, /^[^\\/"<>|?*\x00-\x1f]+$/);
    const aliasFile = path.join(root, alias, 'fixture.txt');
    assert.equal(fs.statSync(aliasFile).isFile(), true, '8.3 alias must refer to the fixture file');
    assert.equal(fs.readFileSync(aliasFile, 'utf8'), 'private browser results');
    assert.equal(fs.realpathSync.native(aliasFile), fs.realpathSync.native(path.join(root, 'test-results/fixture.txt')));
    if (alias.toLowerCase() === 'test-results') { t.skip('8.3 short names are disabled for the fixture directory'); return; }
    assert.equal((await request('/test-results/fixture.txt')).status, 404);
    assert.equal((await request('/' + encodeURIComponent(alias) + '/fixture.txt')).status, 404, alias);
  });
  await t.test('directory links cannot expose external or private files', async t => {
    for (const [name, target, file] of [['external', outside, 'fixture.txt'], ['review', path.join(root, 'output'), 'report.json'], ['source', path.join(root, 'tools'), 'preview-static.js']]) {
      const link = path.join(root, 'image', name);
      try { fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
      catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Directory links unavailable: ' + error.code); return; }
        throw error;
      }
      links.push(link);
      assert.equal((await request('/image/' + name + '/' + file)).status, 404, name);
    }
  });
});
