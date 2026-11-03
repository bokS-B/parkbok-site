// Run with Playwright browser_run_code_unsafe(filename). No external service is used.
async page => {
  const dir = 'C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-hallmark-home/output/playwright/international';
  const fixtures = 'C:/Users/boksb/Desktop/parkbok/docs/s0/fixtures/';
  const report = { defaults: [], targets: [], warnings: [], invalidation: null, invalid: [], requests: [], errors: [] };
  const assert = (value, message) => { if (!value) throw Error(message); };
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('request', r => report.requests.push({ method: r.method(), url: r.url().split('?')[0] }));
  async function open(lang = 'en', width = 375, theme = 'light') {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    const base = lang === 'ar' ? 'http://127.0.0.1:8797' : 'http://127.0.0.1:8796';
    await page.goto(base + '/image/image-compress/' + (lang === 'en' ? '' : lang + '/'));
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
  }
  async function upload(names) {
    await page.locator('#file-input').setInputFiles(names.map(n => fixtures + n));
    await page.waitForFunction(() => document.body.classList.contains('has-input') && !document.body.classList.contains('busy'));
  }
  async function run() {
    await page.locator('#btn-primary').click();
    await page.waitForFunction(() => !document.body.classList.contains('busy') && !document.querySelector('#result').hidden);
  }
  async function imageResult() {
    return page.evaluate(async () => {
      const b = await (await fetch(document.querySelector('#result img').src)).blob();
      const im = await createImageBitmap(b), digest = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const a = g.getImageData(0, 0, c.width, c.height).data; let transparent = false;
      for (let i = 3; i < a.length; i += 4) if (a[i] < 255) { transparent = true; break; }
      const r = { bytes: b.size, mime: b.type, width: im.width, height: im.height, transparent,
        sha256: Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('') };
      im.close(); return r;
    });
  }
  async function ui() {
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.locator('#btn-primary').evaluate(e => Promise.all(e.getAnimations().map(a => a.finished.catch(() => {}))));
    return page.evaluate(() => {
      const e = document.querySelector('#btn-primary'), b = e.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(e);
      const t = range.getBoundingClientRect(), n = document.querySelector('#opt-maxKb');
      return { warning: e.hasAttribute('data-warning'), label: e.textContent, height: b.height,
        textFits: t.left >= b.left && t.right <= b.right && t.top >= b.top && t.bottom <= b.bottom,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        status: document.querySelector('#status').textContent, statusClass: document.querySelector('#status').className,
        target: n.value, inputHeight: n.getBoundingClientRect().height, body: document.body.innerText };
    });
  }
  async function download(name) {
    const event = page.waitForEvent('download'); await page.locator('#btn-primary').click();
    const d = await event; await d.saveAs(dir + '/' + name); return d.suggestedFilename();
  }
  const defaults = [
    ['portrait-1000x1400.jpg', '7817741b96c61e5ee45aa02f5144907687e5b833842980a87569c0ab12ff8449'],
    ['transparent-512.png', '075a5f7de0d96ba4f0503693ef309e11b587c0a94183f536fb94fecd69ba7a44'],
    ['webp-1200.webp', 'd0828142d50cb6f6b2724ed8c5817c622729885366c27014ce2cc2241f8897d5']
  ];
  for (const [name, hash] of defaults) {
    await open(); await upload([name]); await run(); const r = await imageResult();
    assert(r.sha256 === hash, 'Default output changed: ' + name);
    assert(!(await ui()).warning, 'Unlimited result must not warn'); report.defaults.push({ input: name, ...r });
  }
  for (const [name, format, cap, fits] of [
    ['portrait-1000x1400.jpg', 'keep', 20, true], ['webp-1200.webp', 'webp', 8, true],
    ['webp-1200.webp', 'webp', 6, false],
    ['portrait-1000x1400.jpg', 'jpg', 1, false], ['transparent-512.png', 'keep', 1, false]
  ]) {
    await open('en', 1280, 'dark'); await upload([name]);
    await page.locator('#opt-format').selectOption(format); await page.locator('#opt-maxKb').fill(String(cap));
    await run(); const r = await imageResult(), m = await ui(); delete m.body;
    assert(m.warning === (r.bytes > cap * 1024), 'Actual bytes / warning mismatch');
    assert(m.statusClass.includes(r.bytes > cap * 1024 ? 'err' : 'ok'), 'Actual bytes / status mismatch');
    assert((r.bytes <= cap * 1024) === fits, 'Expected attainable/unattainable target fixture');
    if (name === 'transparent-512.png') assert(r.mime === 'image/png' && r.transparent, 'Transparent PNG was flattened');
    assert(r.width === (name.includes('webp') ? 1200 : name.includes('transparent') ? 512 : 1000), 'Target must not add resizing');
    const ext = r.mime.split('/')[1].replace('jpeg', 'jpg');
    const filename = await download('target-' + cap + '-' + name.split('.')[0] + '.' + ext);
    report.targets.push({ input: name, cap, format, filename, ...r, ui: m });
  }
  // Partial batch: tiny transparent PNG fits1KB; the512px transparent PNG cannot.
  await open('ko'); await upload(['transparent-512.png', 'tiny-16x16.png']);
  await page.locator('#opt-maxKb').fill('1'); await run();
  let m = await ui(); delete m.body; assert(m.warning && m.statusClass.includes('err'), 'Partial batch must warn');
  report.batch = { ui: m, filename: await download('target-partial-batch.zip') };
  await page.locator('#opt-maxKb').fill('10');
  report.invalidation = await page.evaluate(() => ({ hidden: document.querySelector('#result').hidden,
    done: document.body.classList.contains('done'), warning: document.querySelector('#btn-primary').hasAttribute('data-warning') }));
  assert(report.invalidation.hidden && !report.invalidation.done && !report.invalidation.warning, 'Edited settings left a stale result');
  for (const lang of ['en', 'ko', 'zh', 'ja', 'es', 'pt', 'de', 'fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      await open(lang, 375, theme); await upload(['transparent-512.png']);
      await page.locator('#opt-maxKb').fill(lang === 'ar' ? '١' : '1'); await run();
      const s = await ui(); assert(s.warning && s.statusClass.includes('err'), 'Localized target failure');
      assert(s.overflow === 0 && s.textFits && s.height >= 56 && s.height <= 64 && s.inputHeight >= 44, 'Localized target layout: ' + lang + ' ' + JSON.stringify(s));
      assert(!/targetOver|targetDownload|targetHelp|maxKb/.test(s.body), 'Untranslated target key');
      delete s.body; report.warnings.push({ lang, theme, ...s });
      if (['en', 'ko', 'ar'].includes(lang)) {
        await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
        await page.screenshot({ path: dir + '/compress-target-' + lang + '-' + theme + '.png', fullPage: true });
      }
    }
  }
  for (const [lang, value] of [['en', '-1'], ['ar', '-١'], ['ar', 'abc']]) {
    await open(lang); await upload(['portrait-1000x1400.jpg']);
    await page.locator('#opt-maxKb').fill(value); await page.locator('#btn-primary').click();
    await page.waitForFunction(() => !document.body.classList.contains('busy') && document.querySelector('#status').classList.contains('err'));
    const state = await page.evaluate(() => ({ hidden: document.querySelector('#result').hidden,
      status: document.querySelector('#status').textContent, done: document.body.classList.contains('done') }));
    assert(state.hidden && !state.done && !state.status.includes('errorTarget'), 'Invalid target must not become unlimited');
    report.invalid.push({ lang, input: value, ...state });
  }
  assert(report.errors.length === 0, 'Uncaught errors');
  assert(!report.requests.some(r => ['POST', 'PUT', 'PATCH'].includes(r.method)), 'File upload request');
  return report;
}
