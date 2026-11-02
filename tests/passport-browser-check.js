// Run with Playwright browser_run_code_unsafe(filename). Use a dedicated local tab.
async (page) => {
  // The MCP runner exposes Playwright and Buffer, but no filesystem/module imports.
  const assert = { ok(v, m) { if (!v) throw Error(m || 'Expected truthy'); },
    equal(a, b, m) { if (a !== b) throw Error((m || 'Mismatch') + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); },
    deepEqual(a, b) { this.equal(JSON.stringify(a), JSON.stringify(b)); } };
  const path = { join: (...parts) => parts.join('/') };
  const root = 'C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-passport-status';
  const dir = path.join(root, 'docs/s1a');
  const base = 'http://127.0.0.1:8792';
  assert.ok(page.url().startsWith(base), 'Use the S1a preview tab');
  const report = { cases: [], edits: [], languages: [], regression: [], requests: [], errors: [] };
  const errors = e => report.errors.push(String(e));
  const requests = r => { if (['POST', 'PUT', 'PATCH'].includes(r.method()) || /googletagmanager|google-analytics/.test(r.url())) report.requests.push({ method: r.method(), url: r.url() }); };
  page.on('pageerror', errors); page.on('request', requests);
  await page.unrouteAll({ behavior: 'wait' });
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.fulfill({ status: 204, body: '' }));
  await page.goto(base + '/image/passport-photo/ko/');
  const input = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800;
    const g = c.getContext('2d'), d = g.createImageData(600, 800); let seed = 724;
    for (let i = 0; i < d.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      d.data[i] = seed >>> 24; d.data[i + 1] = seed >>> 16; d.data[i + 2] = seed >>> 8; d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  async function upload() {
    await page.locator('#file-input').setInputFiles({ name: 'synthetic-noise.png', mimeType: 'image/png', buffer: input });
    await page.locator('.rsel').waitFor();
    await page.locator('[data-group=save]').evaluate(el => el.open = true);
  }
  async function execute() {
    await page.locator('#btn-primary').click();
    await page.waitForFunction(() => !document.body.classList.contains('busy') && !document.querySelector('#result').hidden);
  }
  async function result() {
    await page.locator('#btn-primary').evaluate(async el => { await document.fonts.ready; await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
    return page.evaluate(async () => {
      const $ = s => document.querySelector(s), b = await (await fetch($('#result img').src)).blob(), img = await createImageBitmap(b);
      const bytes = new Uint8Array(await b.arrayBuffer());
      const btn = $('#btn-primary'), rect = btn.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(btn);
      const text = range.getBoundingClientRect(), doc = document.documentElement;
      const value = { status: $('#status').textContent, kind: $('#status').className, button: btn.textContent,
        note: $('.result-note')?.textContent || '', bytes: b.size, mime: b.type, width: img.width, height: img.height,
        signature: Array.from(bytes.slice(0, 8)), progress: $('.ptxt').textContent,
        summary: $('[data-opt=preset] .opt-help')?.textContent || '',
        overflow: Math.max(0, doc.scrollWidth - doc.clientWidth), buttonHeight: rect.height,
        textFits: text.left >= rect.left && text.right <= rect.right && text.top >= rect.top && text.bottom <= rect.bottom,
        statusColor: getComputedStyle($('#status')).color, background: getComputedStyle(document.body).backgroundColor,
        byteData: Array.from(bytes.slice(0, 56)) };
      img.close(); return value;
    });
  }
  async function download(name, expected) {
    const event = page.waitForEvent('download'); await page.locator('#btn-primary').click();
    const dl = await event, target = path.join(dir, name); await dl.saveAs(target);
    return { filename: dl.suggestedFilename(), path: target, expectedBytes: expected };
  }
  for (const width of [1280, 375]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 812 });
    await page.goto(base + '/image/passport-photo/ko/');
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme); await upload();
    for (const [format, cap, failed] of [['jpg', 1, true], ['jpg', 500, false], ['png', 1, true], ['png', 0, false]]) {
      await page.locator('#opt-format').selectOption(format); await page.locator('#opt-maxKb').fill(String(cap));
      await execute(); const value = await result();
      assert.equal(value.width, 413); assert.equal(value.height, 531);
      assert.equal(value.status, failed ? '용량 초과' : '완료'); assert.equal(value.kind, failed ? 'status err' : 'status ok');
      assert.equal(value.button, failed ? '용량 초과 파일 받기' : '내려받기');
      assert.equal(value.mime, format === 'jpg' ? 'image/jpeg' : 'image/png');
      if (failed) { assert.ok(value.bytes > cap * 1024); assert.equal(value.progress.includes('완료'), false); }
      else if (cap) assert.ok(value.bytes <= cap * 1024);
      else { assert.ok(value.note.includes('용량 제한 없음')); assert.equal(value.summary.includes('≤'), false); }
      assert.equal(value.overflow, 0); assert.equal(value.textFits, true);
      value.download = await download(`output-${width}-${theme}-${format}-${cap}.${format}`, value.bytes);
      if (cap === 1) await page.locator('#out').screenshot({ path: path.join(dir, `result-${width}-${theme}-${format}.png`) });
      report.cases.push({ viewportWidth: width, viewportHeight: width === 1280 ? 900 : 812, theme, format, cap, ...value });
    }
  }
  // Each real edit removes the old downloadable result before another run.
  await page.goto(base + '/image/passport-photo/ko/'); await upload(); await execute();
  const edits = [
    ['maxKb', () => page.locator('#opt-maxKb').fill('1')],
    ['format', () => page.locator('#opt-format').selectOption('png')],
    ['preset', () => page.locator('#opt-preset').selectOption('us_passport')],
    ['crop reset', () => page.locator('[data-opt=crop] .rect-bar .btn').click()],
    ['crop drag', async () => { await page.locator('.rh-se').scrollIntoViewIfNeeded(); const r = await page.locator('.rh-se').boundingBox(); await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down(); await page.mouse.move(r.x - 35, r.y - 35, { steps: 5 }); await page.mouse.up(); }]
  ];
  for (const [name, edit] of edits) {
    await edit(); assert.equal(await page.locator('#result').isVisible(), false, name);
    assert.equal(await page.locator('#btn-primary').textContent(), '규격 맞추기');
    assert.equal(await page.locator('#status').textContent(), '설정이 바뀌었습니다. 다시 실행하세요.');
    report.edits.push({ name, staleDownloadRemoved: true }); await execute();
  }
  await page.locator('#opt-preset').selectOption('custom'); await execute();
  await page.locator('#opt-custom-w').fill('36');
  assert.equal(await page.locator('#result').isVisible(), false, 'uncommitted custom input invalidates');
  report.edits.push({ name: 'custom input before blur', staleDownloadRemoved: true });
  await page.locator('#opt-custom-w').blur(); await execute();
  // A programmatic late change is discarded as well as blocking ordinary input with inert.
  await page.evaluate(() => {
    const orig = HTMLCanvasElement.prototype.toBlob; window.__qaOriginalToBlob = orig;
    HTMLCanvasElement.prototype.toBlob = function(cb, ...args) { const c = this; window.__qaEncoding = true; setTimeout(() => orig.call(c, cb, ...args), 150); };
  });
  await page.locator('#opt-maxKb').fill('500');
  await page.locator('#btn-primary').click(); await page.waitForFunction(() => window.__qaEncoding);
  assert.equal(await page.locator('#opts').evaluate(el => el.inert), true);
  await page.evaluate(() => { const el = document.querySelector('#opt-maxKb'); el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => !document.body.classList.contains('busy'));
  assert.equal(await page.locator('#result').isVisible(), false);
  assert.equal(await page.locator('#status').textContent(), '설정이 바뀌었습니다. 다시 실행하세요.');
  report.edits.push({ name: 'edit during async encoding', staleDownloadRemoved: true, inert: true });
  await page.evaluate(() => HTMLCanvasElement.prototype.toBlob = window.__qaOriginalToBlob);
  await execute(); await page.locator('#btn-reset').click();
  assert.equal(await page.locator('#result').isVisible(), false); assert.equal(await page.locator('#status').textContent(), '');
  report.edits.push({ name: 'reset', staleDownloadRemoved: true });
  // Localized warning text must fit, without key names leaking into the UI.
  for (const lang of ['en', 'ko', 'zh', 'ja', 'es', 'pt', 'de', 'fr']) {
    await page.evaluate(l => localStorage.setItem('pb_lang', l), lang);
    await page.goto(base + '/image/passport-photo/' + (lang === 'en' ? '' : lang + '/'));
    assert.equal(await page.evaluate(() => window.IMGT_TOOL.lang), lang);
    await upload(); await page.locator('#opt-maxKb').fill('1'); await execute(); const value = await result();
    assert.equal(value.kind, 'status err'); assert.equal(value.overflow, 0); assert.equal(value.textFits, true);
    assert.ok(value.buttonHeight >= 56 && value.buttonHeight <= 64, lang + ' warning button must stay 56–64px');
    assert.equal(/sizeExceeded|sizeLimit|sizeUnit|downloadOver/.test(value.status + value.button + value.note), false);
    report.languages.push({ lang, button: value.button, buttonHeight: value.buttonHeight, overflow: value.overflow, textFits: value.textFits });
  }
  // Optional validation contract must leave existing conversion and ZIP flows intact.
  for (const multiple of [false, true]) {
    await page.goto(base + '/image/image-compress/ko/');
    const f = { name: 'synthetic-noise.png', mimeType: 'image/png', buffer: input };
    await page.locator('#file-input').setInputFiles(multiple ? [f, { ...f, name: 'synthetic-noise-2.png' }] : f);
    await page.waitForFunction(() => !document.body.classList.contains('busy') && document.body.classList.contains('has-input'));
    await page.locator('#btn-primary').click();
    await page.waitForFunction(() => !document.body.classList.contains('busy') && !document.querySelector('#result').hidden);
    assert.equal(await page.locator('#status').textContent(), '완료');
    const event = page.waitForEvent('download'); await page.locator('#btn-primary').click(); const dl = await event;
    await dl.saveAs(path.join(dir, multiple ? 'regression-images.zip' : 'regression-compressed.jpg'));
    assert.equal(await page.locator('#status').textContent(), '완료');
    report.regression.push({ tool: 'image-compress', multiple, filename: dl.suggestedFilename() });
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []);
  page.off('pageerror', errors); page.off('request', requests);
  return report;
}
