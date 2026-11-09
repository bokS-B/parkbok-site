function atPath(url, pathname) {
  const next = new URL(url);
  next.pathname = pathname;
  return next;
}

async function siteResponse(request, assets, url) {
  if (url.hostname === 'www.parkbok.com') {
    url.protocol = 'https:';
    url.hostname = 'parkbok.com';
    url.port = '';
    return Response.redirect(url, 301);
  }

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
    const response = await siteResponse(request, env.ASSETS, url);
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
