const notFoundPage = `<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>페이지를 찾을 수 없습니다 | 박복</title>
<main>
  <h1>페이지를 찾을 수 없습니다</h1>
  <p>주소를 확인하거나 박복 홈에서 도구를 찾아보세요.</p>
  <a href="/">박복 홈</a>
</main>`;

function atPath(url, pathname) {
  const next = new URL(url);
  next.pathname = pathname;
  return next;
}

async function hwpFeedback(request, url, db) {
  const headers = { 'Cache-Control': 'no-store' };
  const empty = (status) => new Response(null, { status, headers });
  if (request.method !== 'POST') {
    headers.Allow = 'POST';
    return empty(405);
  }
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (origin !== url.origin || (site && site !== 'same-origin')) return empty(403);
  const answer = request.headers.get('X-HWP-Feedback');
  if (url.search || !['ok', 'problem', 'not_opened'].includes(answer)) return empty(400);
  try {
    // Workers can expose an empty stream even when the request has no body.
    if (request.body && !(await request.body.getReader().read()).done) return empty(400);
    const result = await db.prepare(
      'UPDATE hwp_feedback_totals SET total = total + 1 WHERE answer = ?'
    ).bind(answer).run();
    return empty(result.meta.changes === 1 ? 204 : 503);
  } catch {
    return empty(503);
  }
}

async function siteResponse(request, env, url) {
  if (url.hostname === 'www.parkbok.com' || (url.hostname === 'parkbok.com' && url.protocol === 'http:')) {
    url.protocol = 'https:';
    url.hostname = 'parkbok.com';
    url.port = '';
    return Response.redirect(url, 301);
  }

  if (url.pathname === '/hwp/feedback') return hwpFeedback(request, url, env.HWP_FEEDBACK);
  const assets = env.ASSETS;
  if (request.method !== 'GET' && request.method !== 'HEAD') return assets.fetch(request);
  const path = url.pathname;
  if (path.endsWith('/')) {
    return assets.fetch(new Request(atPath(url, path + 'index.html'), request));
  }

  const exact = await assets.fetch(request);
  if (exact.status !== 404 || path.slice(path.lastIndexOf('/') + 1).includes('.')) return exact;

  // GitHub Pages serves a flat HTML file with or without its extension.
  const html = await assets.fetch(new Request(atPath(url, path + '.html'), request));
  if (html.status !== 404) return html;

  const index = await assets.fetch(new Request(atPath(url, path + '/index.html'), { method: 'HEAD' }));
  return index.ok ? Response.redirect(atPath(url, path + '/'), 301) : exact;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const staging = url.hostname.endsWith('.workers.dev');
    let response = await siteResponse(request, env, url);
    if (response.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
      response = new Response(request.method === 'HEAD' ? null : notFoundPage, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    if (!staging) return response;

    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
