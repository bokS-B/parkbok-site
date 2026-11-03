// Run with Playwright browser_run_code_unsafe. Local responses, production hostname,
// public/synthetic input, all measurement endpoints intercepted before transmission.
async page => {
  const base = 'http://127.0.0.1:8803';
  const out = 'C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-cmp-integration/output/cmp';
  const report = { choices: [], layouts: [], collect: [], errors: [], cmpRequests: 0 }, requests = [];
  const assert = (v, m) => { if (!v) throw Error(m); };
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.context().route('https://parkbok.com/**', async r => {
    const u = new URL(r.request().url());
    const response = await r.fetch({ url: base + u.pathname + u.search });
    await r.fulfill({ response });
  });
  await page.context().route(/googletagmanager\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|https:\/\/(?:[^/]*\.)?google\.com\//, async r => {
    const req = r.request();
    if (new URL(req.url()).hostname === 'fundingchoicesmessages.google.com') { report.cmpRequests++; return r.continue(); }
    if (new URL(req.url()).hostname === 'pagead2.googlesyndication.com' && new URL(req.url()).pathname.endsWith('.js')) { report.cmpRequests++; return r.continue(); }
    requests.push({ url: req.url(), body: req.postData() || '' });
    if (req.url().startsWith('https://www.googletagmanager.com/gtag/js?')) return r.continue();
    return r.abort();
  });
  await page.context().addInitScript(() => { localStorage.setItem('pb_lang', 'en'); });
  await page.context().clearCookies();
  await page.goto('https://parkbok.com/');
  await page.evaluate(() => localStorage.removeItem('pb_statistics_v1'));
  await page.reload(); requests.length = 0;
  await page.locator('#pb-statistics').waitFor({ state: 'visible' });
  assert(await page.locator('#pb-statistics').isVisible(), 'Missing initial choice');
  assert(requests.length === 0, 'Google request before consent');
  await page.locator('[data-choice=deny]').click();
  await page.reload(); await page.waitForTimeout(200);
  assert(requests.length === 0, 'Google request after saved refusal');
  report.choices.push('outside Europe: real Google CMP bootstrap + initial/saved refusal: zero GA/ad requests');

  await page.goto('https://parkbok.com/image/image-compress/?maxKb=100&private_test=PB_QUERY_SENTINEL#PB_FRAGMENT_SENTINEL');
  await page.locator('.pb-statistics-settings').click(); await page.locator('[data-choice=allow]').click();
  await page.waitForFunction(() => document.querySelector('#pb-statistics-tag'));
  await page.waitForTimeout(3500);
  await page.locator('#file-input').setInputFiles('C:/Users/boksb/Desktop/parkbok/docs/s0/fixtures/portrait-1000x1400.jpg');
  await page.waitForFunction(() => document.body.classList.contains('has-input'));
  await page.locator('#btn-primary').click(); await page.waitForFunction(() => !document.querySelector('#result').hidden);
  const download = page.waitForEvent('download'); await page.locator('#btn-primary').click(); await download;
  await page.evaluate(() => { history.replaceState(null, '', '?private_test=PB_HISTORY_SENTINEL#PB_PRIVATE_INPUT'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(2000);
  const collects = requests.filter(r => /\/collect\?/.test(r.url));
  assert(collects.length > 0, 'No GA request observed after opt-in');
  assert(!collects.some(r => /PB_(QUERY|FRAGMENT|HISTORY|PRIVATE)/.test(decodeURIComponent(r.url) + r.body)), 'Raw URL leaked to GA');
  report.collect = collects.map(r => { const u = new URL(r.url); return { event: u.searchParams.get('en'), page: u.searchParams.get('dl'), referrer: u.searchParams.get('dr'), body: r.body }; });
  assert(!requests.some(r => /googlesyndication|doubleclick/.test(r.url)), 'Unexpected ad request: ' + requests.filter(r => /googlesyndication|doubleclick/.test(r.url)).map(r => new URL(r.url).origin + new URL(r.url).pathname).join(', '));
  report.choices.push('opt-in: real GA tag + sanitized collect + compression/download work');

  await page.locator('.pb-statistics-settings').click(); await page.locator('[data-choice=deny]').click();
  const afterRefusal = requests.length;
  await page.evaluate(() => window.gtag('event', 'tool_download', { tool_id: 'image-compress' }));
  await page.waitForTimeout(700);
  assert(requests.length === afterRefusal, 'Request after withdrawal');
  assert(!(await page.context().cookies()).some(c => /^_ga(?:_|$)/.test(c.name)), 'GA cookies remain after withdrawal');
  report.choices.push('withdrawal: no new request, GA cookies removed');

  const langs = ['en', 'ko', 'ja', 'zh', 'es', 'pt', 'de', 'fr'];
  for (const lang of langs) for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto('https://parkbok.com/color/palette/' + (lang === 'en' ? '' : lang + '/'));
    await page.locator('.pb-statistics-settings').click();
    const box = await page.locator('#pb-statistics').boundingBox();
    const buttons = await page.locator('#pb-statistics button').evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
    assert(box.x >= 0 && box.x + box.width <= width && buttons.every(h => h >= 44), 'Choice layout ' + lang + width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflow ' + lang + width);
    report.layouts.push({ lang, width, buttons });
    if (lang === 'ko' && width === 375) {
      await page.screenshot({ path: out + '/choice-mobile-light.png', animations: 'disabled' });
      await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
      await page.screenshot({ path: out + '/choice-mobile-dark.png', animations: 'disabled' });
    }
    await page.locator('[data-choice=deny]').click();
  }
  await page.goto('https://parkbok.com/color/hex/ff5733/');
  await page.locator('.pb-statistics-settings').click(); assert(await page.locator('#pb-statistics').isVisible(), 'HEX choice');
  await page.locator('[data-choice=deny]').click();
  await page.goto(base + '/');
  await page.evaluate(() => localStorage.setItem('pb_statistics_v1', JSON.stringify({ choice: 'allow', at: Date.now() })));
  requests.length = 0; await page.reload(); await page.waitForTimeout(300);
  assert(requests.length === 0, 'Local preview collected after stored opt-in');
  assert(report.errors.length === 0, report.errors.join('\n'));
  report.choices.push('HEX same settings + preview opt-in still zero Google requests');
  return report;
}
