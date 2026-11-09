const test = require('node:test');
const assert = require('node:assert/strict');

const files = new Map([
  ['/index.html', 'Home'],
  ['/hwp/index.html', 'Editor'],
  ['/guide/hwp-vs-hwpx.html', 'Guide']
]);

async function visit(url, method = 'GET') {
  const { default: worker } = await import('../tools/cloudflare-worker.mjs');
  const assets = {
    fetch(request) {
      const path = new URL(request.url).pathname;
      return new Response(request.method === 'HEAD' ? null : files.get(path), {
        status: files.has(path) ? 200 : 404
      });
    }
  };
  return worker.fetch(new Request(url, { method }), { ASSETS: assets });
}

test('keeps the existing directory, HTML and alias routes', async () => {
  for (const [path, content] of [['/', 'Home'], ['/hwp/', 'Editor'], ['/guide/hwp-vs-hwpx.html', 'Guide'], ['/guide/hwp-vs-hwpx', 'Guide']]) {
    const response = await visit('https://parkbok.com' + path);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), content);
    assert.equal(response.headers.has('X-Robots-Tag'), false);
  }
  const redirect = await visit('https://parkbok.com/hwp?a=1');
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('Location'), 'https://parkbok.com/hwp/?a=1');
});

test('redirects HTTP and www to HTTPS apex with the path and query intact', async () => {
  for (const origin of ['http://parkbok.com', 'http://www.parkbok.com', 'https://www.parkbok.com']) {
    const response = await visit(origin + '/guide/hwp-vs-hwpx.html?a=1');
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('Location'), 'https://parkbok.com/guide/hwp-vs-hwpx.html?a=1');
  }
});

test('uses the custom 404 without soft errors and limits noindex to previews', async () => {
  const response = await visit('https://parkbok.com/missing/');
  assert.equal(response.status, 404);
  assert.match(await response.text(), /페이지를 찾을 수 없습니다/);
  const head = await visit('https://parkbok.com/missing/', 'HEAD');
  assert.equal(head.status, 404);
  assert.equal(await head.text(), '');
  const preview = await visit('https://parkbok.test.workers.dev/guide/hwp-vs-hwpx.html');
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('X-Robots-Tag'), 'noindex');
});
