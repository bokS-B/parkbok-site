const test = require('node:test');
const assert = require('node:assert/strict');

const files = new Map([
  ['/index.html', 'Home'],
  ['/hwp/index.html', 'Editor'],
  ['/guide/hwp-vs-hwpx.html', 'Guide']
]);

async function visit(url, method = 'GET', options = {}, feedback) {
  const { default: worker } = await import('../tools/cloudflare-worker.mjs');
  const assets = {
    fetch(request) {
      const path = new URL(request.url).pathname;
      return new Response(request.method === 'HEAD' ? null : files.get(path), {
        status: files.has(path) ? 200 : 404
      });
    }
  };
  return worker.fetch(new Request(url, { method, ...options }), { ASSETS: assets, HWP_FEEDBACK: feedback });
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

test('increments only an explicit same-origin HWP copy response', async () => {
  const url = 'https://parkbok.com/hwp/feedback';
  const totals = { ok: 0, problem: 0, not_opened: 0 };
  const db = {
    prepare(sql) {
      assert.equal(sql, 'UPDATE hwp_feedback_totals SET total = total + 1 WHERE answer = ?');
      return { bind(answer) {
        assert.equal(Object.hasOwn(totals, answer), true);
        return { async run() {
          totals[answer]++;
          return { meta: { changes: 1 } };
        } };
      } };
    }
  };
  const headers = { Origin: 'https://parkbok.com', 'Sec-Fetch-Site': 'same-origin', 'X-HWP-Feedback': 'ok' };
  const post = (extra = {}) => visit(url, 'POST', { headers, ...extra }, db);
  const get = await visit(url);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('Allow'), 'POST');
  assert.equal((await post({ headers: { ...headers, Origin: 'https://other.example' } })).status, 403);
  assert.equal((await post({ headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await post({ headers: { ...headers, 'X-HWP-Feedback': 'document.hwp' } })).status, 400);
  assert.equal((await post({ body: 'document.hwp' })).status, 400);
  assert.equal((await visit(url + '?file=document.hwp', 'POST', { headers }, db)).status, 400);
  assert.deepEqual(totals, { ok: 0, problem: 0, not_opened: 0 });

  for (const answer of ['ok', 'problem', 'not_opened', 'ok']) {
    const body = new ReadableStream({ start(controller) { controller.close(); } });
    const response = await post({ headers: { ...headers, 'X-HWP-Feedback': answer }, body, duplex: 'half' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), '');
  }
  assert.deepEqual(totals, { ok: 2, problem: 1, not_opened: 1 });
  assert.equal((await visit(url, 'POST', { headers })).status, 503);
});
