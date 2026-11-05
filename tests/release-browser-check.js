// Run with Playwright browser_run_code_unsafe. Only synthetic/public fixtures.
async page => {
  const base = 'http://127.0.0.1:8798', phase = 'local';
  const root = 'C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-hallmark-home';
  const out = root + '/output/release/' + phase;
  const fixtures = 'C:/Users/boksb/Desktop/parkbok/docs/s0/fixtures/';
  const report = { base, layouts: [], documents: [], images: [], pdf: [], errors: [], writes: [] };
  const assert = (v, m) => { if (!v) throw Error(m); };
  await page.context().route(/google-analytics\.com|googletagmanager\.com|googlesyndication\.com|doubleclick\.net/, r => r.abort());
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH'].includes(r.method())) report.writes.push(r.url()); });
  const open = async path => { const r = await page.goto(base + path); assert(r.status() === 200, 'HTTP ' + path); };
  const paths = ['/', '/hwp/', '/pdf/merge/ko/', '/image/image-compress/ko/', '/image/passport-photo/ko/', '/color/converter/ko/#ff5733'];
  for (const width of [1280, 375]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 812 });
    for (const path of paths) {
      await open(path);
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
      assert(overflow === 0, 'Overflow ' + path + ' ' + width + ' ' + theme);
      report.layouts.push({ path, width, theme, overflow });
      if (path === '/' || path.includes('passport-photo')) await page.screenshot({ path: out + '/' + (path === '/' ? 'home' : 'passport') + '-' + width + '-' + theme + '.png', fullPage: false });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [file, ext] of [[root + '/output/release/fixtures/basicsReport.hwp', 'hwp'], ['C:/Users/boksb/Documents/ChatGPT/산업화/hallmark-home-audit/migration-smoke.hwpx', 'hwpx']]) {
    await open('/hwp/'); await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#status').textContent !== '변환 중…' && !document.querySelector('#tools').hidden);
    const text = await page.locator('#textout').inputValue();
    assert(text.trim().length > 10, ext + ' text missing');
    if (ext === 'hwpx') assert(text.includes('PARKBOK HWPX 이동 확인'), 'HWPX content');
    const event = page.waitForEvent('download'); await page.locator('#btn-txt').click(); const d = await event;
    await d.saveAs(out + '/document-' + ext + '.txt');
    report.documents.push({ ext, status: await page.locator('#status').textContent(), characters: text.length, sample: text.slice(0, 100) });
    await page.screenshot({ path: out + '/document-' + ext + '.png', fullPage: false });
  }
  async function upload(files) {
    await page.locator('#file-input').setInputFiles(files);
    await page.waitForFunction(() => document.body.classList.contains('has-input') && !document.body.classList.contains('busy'));
  }
  async function run() {
    await page.locator('#btn-primary').click();
    await page.waitForFunction(() => !document.body.classList.contains('busy') && !document.querySelector('#result').hidden);
  }
  async function download(name) {
    const event = page.waitForEvent('download'); await page.locator('#btn-primary').click(); const d = await event;
    await d.saveAs(out + '/' + name);
  }
  async function image() {
    return page.evaluate(async () => {
      const b = await (await fetch(document.querySelector('#result img').src)).blob(), im = await createImageBitmap(b);
      const result = { bytes: b.size, width: im.width, height: im.height, mime: b.type, status: document.querySelector('#status').textContent };
      im.close(); return result;
    });
  }
  await open('/image/image-compress/ko/'); await upload(fixtures + 'portrait-1000x1400.jpg');
  await page.locator('#opt-maxKb').fill('20'); await run();
  let r = await image(); assert(r.bytes <= 20480, '20KB target failed'); await download('compressed-20kb.jpg'); report.images.push({ tool: 'compress', ...r });
  await page.locator('#opt-maxKb').fill('1'); assert(await page.locator('#result').isHidden(), 'Old compression result retained'); await run();
  r = await image(); assert(r.bytes > 1024 && r.status.includes('초과'), 'Over target falsely complete'); await download('compressed-over.jpg'); report.images.push({ tool: 'compress-over', ...r });
  await open('/image/passport-photo/ko/'); await upload(fixtures + 'portrait-1000x1400.jpg');
  await page.locator('.rsel').waitFor({ state: 'attached' }); await run(); r = await image();
  assert(r.width === 413 && r.height === 531 && r.mime === 'image/jpeg', 'KR passport output'); await download('passport.jpg'); report.images.push({ tool: 'passport', ...r });
  await page.locator('[data-group=save]').evaluate(e => { e.open = true; }); await page.locator('#opt-maxKb').fill('1'); await run(); r = await image();
  assert(r.bytes > 1024 && r.status === '용량 초과', 'Passport false completion'); await download('passport-over.jpg'); report.images.push({ tool: 'passport-over', ...r });
  const pdf = fixtures + 'sample-3page.pdf';
  await open('/pdf/merge/ko/');
  // Distinct names allow two copies of the public three-page fixture.
  const source = await page.request.get('http://127.0.0.1:8799/sample-3page.pdf');
  const buffer = await source.body();
  await upload([{ name: 'first.pdf', mimeType: 'application/pdf', buffer }, { name: 'second.pdf', mimeType: 'application/pdf', buffer }]);
  await run(); await download('merged.pdf'); report.pdf.push({ tool: 'merge', expectedPages: 6 });
  await open('/pdf/split/ko/'); await upload(pdf); await run(); await download('split.zip'); report.pdf.push({ tool: 'split', expectedFiles: 3 });
  await open('/pdf/jpg-to-pdf/ko/'); await upload(fixtures + 'portrait-1000x1400.jpg'); await run(); await download('from-jpg.pdf'); report.pdf.push({ tool: 'jpg-to-pdf', expectedPages: 1 });
  await open('/color/converter/ko/#ff5733'); assert((await page.locator('main').innerText()).includes('255, 87, 51'), 'RGB conversion');
  assert(report.errors.length === 0, 'Page errors: ' + report.errors.join(';'));
  assert(report.writes.length === 0, 'Unexpected upload requests: ' + report.writes.join(';'));
  return report;
}
