// Run with Playwright browser_run_code_unsafe in a NEW isolated context.
// Synthetic EU API fixtures test our bridge, not Google certification or real EEA routing.
// Google measurement requests are intercepted, never transmitted.
async page => {
  const context = page.context(), report = [], requests = [], errors = [];
  const assert = (v, message) => { if (!v) throw Error(message); };
  const data = p => p.evaluate(() => ({
    ga: !!document.querySelector('#pb-statistics-tag'),
    disabled: window['ga-disable-G-377MXFWS51'],
    own: !!document.querySelector('#pb-statistics:not([hidden])'),
    opens: window.__testCmp.opens
  }));
  await context.route('https://parkbok.com/**', async r => {
    const u = new URL(r.request().url());
    await r.fulfill({ response: await r.fetch({ url: 'http://127.0.0.1:8803' + u.pathname + u.search }) });
  });
  await context.addInitScript(() => {
    localStorage.setItem('pb_lang', 'en');
    localStorage.setItem('pb_statistics_v1', JSON.stringify({ choice: 'allow', at: Date.now() }));
  });
  const mock = `(() => {
    const fc = window.googlefc, queue = fc.callbackQueue.slice(), ready = new Set();
    let listener, value = 0;
    let tc = { gdprApplies: true, cmpStatus: 'loaded', eventStatus: 'cmpuishown', purpose: { consents: { 1: false } } };
    fc.getGoogleConsentModeValues = () => ({ analyticsStoragePurposeConsentStatus: value });
    fc.callbackQueue = { push(item) { for (const [key, fn] of Object.entries(item)) { if (ready.has(key)) fn(); else queue.push({ [key]: fn }); } } };
    window.__tcfapi = (command, version, fn) => { listener = fn; fn(tc, true); };
    function mark(key) { ready.add(key); for (const item of queue.splice(0)) { if (item[key]) item[key](); else queue.push(item); } }
    window.__testCmp = { opens: 0, choose(granted) { value = granted ? 1 : 2; tc = { ...tc, eventStatus: 'useractioncomplete', purpose: { consents: { 1: granted } } }; listener(tc, true); }, fail() { listener(null, false); } };
    fc.showRevocationMessage = () => { window.__testCmp.opens++; tc = { ...tc, eventStatus: 'cmpuishown' }; listener(tc, true); };
    mark('CONSENT_API_READY'); mark('CONSENT_MODE_DATA_READY');
  })();`;
  await context.route(/googletagmanager\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|https:\/\/(?:[^/]*\.)?google\.com\//, r => {
    const req = r.request(); requests.push(req.url());
    if (req.url().startsWith('https://www.googletagmanager.com/gtag/js?')) return r.continue();
    return r.abort();
  });
  // Route priority: the synthetic CMP must take precedence over Google's domain wildcard.
  await context.route(/fundingchoicesmessages\.google\.com/, r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('https://parkbok.com/color/palette/ko/');
  await page.waitForFunction(() => !!window.__testCmp);
  let state = await data(page);
  assert(!state.ga && !state.own, 'Old local allow bypassed EU CMP or duplicate banner');
  assert(requests.length === 0, 'GA request before EU choice');
  await page.evaluate(() => window.__testCmp.choose(false));
  assert((await data(page)).disabled && requests.length === 0, 'EU decline did not stay off');
  const previousHash = new URL(page.url()).hash;
  await page.locator('#ps-random').click();
  assert(new URL(page.url()).hash !== previousHash, 'Palette failed after EU refusal');
  report.push('EU pending/decline: old local allow ignored, no GA request, no duplicate banner');
  await page.evaluate(() => window.__testCmp.choose(true));
  await page.waitForFunction(() => !!document.querySelector('#pb-statistics-tag'));
  await page.waitForTimeout(1500);
  assert(!(await data(page)).disabled, 'EU grant did not enable GA');
  const other = await context.newPage();
  await other.goto('https://parkbok.com/color/palette/ko/');
  await other.waitForFunction(() => !!window.__testCmp);
  await other.evaluate(() => window.__testCmp.choose(true));
  await page.locator('.pb-statistics-settings').click();
  await other.waitForFunction(() => window['ga-disable-G-377MXFWS51'] === true);
  state = await data(page);
  assert(state.disabled && state.opens === 1 && !state.own, 'Reopen did not use official CMP API');
  await page.evaluate(() => window.__testCmp.choose(false));
  const before = requests.length;
  await page.evaluate(() => window.gtag('event', 'tool_download', { tool_id: 'test' }));
  await page.waitForTimeout(400);
  assert(requests.length === before, 'Measurement after EU withdrawal');
  assert(!(await context.cookies()).some(c => /^_ga(?:_|$)/.test(c.name)), 'GA cookies remain');
  report.push('EU grant/reopen/withdraw: real GA tag gated; official reopen API; cookies cleared; other tab disabled');
  await page.evaluate(() => window.__testCmp.fail());
  state = await data(page);
  assert(state.disabled && !state.own, 'CMP failure fell back to an allow banner');
  await other.close();
  assert(errors.length === 0, errors.join('\n'));
  return { report, errors, measurementAttempts: requests.filter(u => u.includes('/collect')).length, scope: 'Synthetic EU API fixtures; NOT real EEA display verification' };
}
