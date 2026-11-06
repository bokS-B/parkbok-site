const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const imagePath = require.resolve('../image/img-tools.js');
const privacyPath = require.resolve('../assets/usage-privacy.js');
const imageSource = fs.readFileSync(imagePath, 'utf8');
const privacySource = fs.readFileSync(privacyPath, 'utf8');

// Execute the current production functions with controlled consent UI, DOM, encoder,
// ZIP and analytics queues. This does not verify browser saving or GA delivery.
// Signature and sample-input flows are included in this release worktree.
function harness({ consent = 'allow', host = 'parkbok.com', id = 'image-compress', internal = false, multiple = true, sample = false } = {}) {
  const storage = new Map();
  if (consent) storage.set('pb_statistics_v1', JSON.stringify({ choice: consent, at: Date.now() }));
  if (internal) storage.set('pb_internal', '1');
  const nodes = new Map(), windowListeners = new Map(), scripts = [], clicks = [], consoleErrors = [];
  const flags = { clickThrows: false, scriptsFail: false };
  class FakeNode {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.textContent = ''; this.className = '';
      this.hidden = false; this.disabled = false; this.listeners = new Map(); this.value = '';
      this.classList = {
        add: (...xs) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...xs])].join(' '); },
        remove: (...xs) => { this.className = this.className.split(/\s+/).filter(x => !xs.includes(x)).join(' '); },
        toggle: (x, force) => { const on = force == null ? !this.classList.contains(x) : !!force; this.classList[on ? 'add' : 'remove'](x); return on; },
        contains: x => this.className.split(/\s+/).includes(x)
      };
      this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
    }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html || ''; }
    appendChild(child) {
      child.parentNode = this; this.children.push(child);
      if (child.tagName === 'SCRIPT') { scripts.push(child.src); if (flags.scriptsFail && child.onerror) queueMicrotask(() => child.onerror()); }
      return child;
    }
    removeChild(child) { this.children = this.children.filter(x => x !== child); child.parentNode = null; return child; }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    toggleAttribute(key, value) { value ? this.setAttribute(key, '') : this.removeAttribute(key); }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector === 'input:checked') return this.tagName === 'INPUT' && this.checked;
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return attr[2] == null ? attr[1] in this.attrs : this.attrs[attr[1]] === attr[2];
      return this.tagName.toLowerCase() === selector.toLowerCase();
    }
    querySelectorAll(selector) {
      const found = [], selectors = selector.split(',').map(value => value.trim());
      const visit = node => { for (const child of node.children) { if (selectors.some(value => child.matches(value))) found.push(child); visit(child); } };
      visit(this); return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
    before() {}
    focus() {}
    scrollIntoView() {}
    click() {
      if (this.disabled) return;
      if (this.tagName === 'A') { if (flags.clickThrows) throw Error('simulated blocked click'); clicks.push(this.download); }
      const event = { target: this, preventDefault() {}, stopPropagation() {} };
      if (this.onclick) this.onclick(event);
      const listener = this.listeners.get('click'); if (listener) listener(event);
    }
  }
  const body = new FakeNode('body'), head = new FakeNode('head');
  const foot = new FakeNode('nav'); foot.className = 'foot-links'; body.appendChild(foot);
  const document = {
    body, head, readyState: 'loading', documentElement: { lang: 'ko' }, referrer: '', cookie: '',
    currentScript: { getAttribute(name) { return name === 'data-ga' ? 'G-UNIT-TEST' : null; } },
    createElement(tag) { return new FakeNode(tag); },
    createTextNode(text) { const n = new FakeNode('#text'); n.textContent = text; return n; },
    getElementById(key) { if (key === 'lang') return null; if (!nodes.has(key)) nodes.set(key, new FakeNode()); return nodes.get(key); },
    querySelector(selector) { return selector === '.foot-links' ? foot : body.querySelector(selector); }, addEventListener() {}
  };
  let objectCounter = 0;
  class TestURL extends URL {
    static createObjectURL() { return 'blob:unit-' + (++objectCounter); }
    static revokeObjectURL() {}
  }
  class FakeZip {
    file() { return this; }
    generateAsync() { return Promise.resolve(new Blob(['zip'], { type: 'application/zip' })); }
  }
  const context = {
    document, navigator: { userAgent: 'unit-test', languages: ['ko'], language: 'ko' },
    location: { hostname: host, origin: `https://${host}`, pathname: '/image/test/ko/', search: '', hash: '', href: `https://${host}/image/test/ko/` },
    history: { replaceState() {} }, URL: TestURL, Blob, Promise, Date,
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); } },
    setTimeout(fn) { fn(); return 0; }, clearTimeout() {},
    console: { error(e) { consoleErrors.push(e); }, log() {} },
    JSZip: FakeZip, IMGT_TOOL: { id, lang: 'ko' }, IMGT_STRINGS: {},
    addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener() {},
    fetch() { throw Error('network must not run in unit tests'); }
  };
  context.window = context;
  vm.createContext(context);
  // Run privacy code unchanged; choices below click the real settings and
  // allow/decline buttons rather than calling its private apply/choose functions.
  vm.runInContext(privacySource, context, { filename: privacyPath });
  let imageInstrumented = imageSource;
  // Return existing async chains in the unmodified baseline so tests can await them.
  // Candidate functions already return these chains; no outcomes are changed here.
  imageInstrumented = imageInstrumented.replace('    Promise.resolve().then(function(){ return tool.run', '    return Promise.resolve().then(function(){ return tool.run');
  imageInstrumented = imageInstrumented.replace('    chain.then(function(){', '    return chain.then(function(){');
  imageInstrumented = imageInstrumented.replace('    ensureJSZip().then(function(JSZip){', '    return ensureJSZip().then(function(JSZip){');
  const injection = `
  window.__metricsTest = {
    run: run, download: download, downloadZip: downloadZip, addFiles: addFiles,
    reset: reset, afterInput: afterInput, invalidateResult: invalidateResult, trackUsage: trackUsage,
    renderOptions: renderOptions, onPrimary: onPrimary,
    undoReset: typeof undoReset === 'function' ? undoReset : null,
    onWarningDownload: typeof onWarningDownload === 'function' ? onWarningDownload : null,
    setup: function(tl, fs, options, elements) { tool = tl; files = fs; optUI = options; dom = elements; },
    setFiles: function(fs) { files = fs; },
    setOpts: function(options) { optUI = options; },
    stubReadOne: function(fn) { readOne = fn; },
    state: function() { return { busy: busy, outputs: outputs, files: files, options: getOpts(), result: usageResult, usage: typeof usageRun === 'undefined' ? null : usageRun, done: document.body.classList.contains('done'), status: dom.status.textContent }; }
  };
  `;
  assert.ok(imageInstrumented.includes('  window.IMGT ='), 'test instrumentation anchor missing');
  imageInstrumented = imageInstrumented.replace('  window.IMGT =', injection + '  window.IMGT =');
  vm.runInContext(imageInstrumented, context, { filename: imagePath });
  const dom = {};
  for (const key of ['primary', 'reset', 'opts', 'status', 'inStatus', 'result', 'progress', 'bar', 'ptxt', 'out', 'files', 'compact', 'count', 'btnAdd', 'input', 'drop', 'select', 'warningDownload']) dom[key] = new FakeNode();
  const file = { name: 'private-filename.png', size: 50000, type: 'image/png', width: 10, height: 10, sample, file: new Blob(['image'], { type: 'image/png' }) };
  const tool = { id, multiple, minFiles: 1, accept: 'image/*', invalidateOnEdit: true, options: [], run: async () => result() };
  const opts = { maxKb: { get: () => 20 }, minKb: { get: () => 10 } };
  context.__metricsTest.setup(tool, [file], opts, dom);
  const events = () => (context.dataLayer || []).filter(args => args[0] === 'event' && /^tool_/.test(args[1])).map(args => ({ name: args[1], data: JSON.parse(JSON.stringify(args[2])) }));
  const count = name => events().filter(e => e.name === name).length;
  const choose = choice => {
    let panel = body.querySelector('#pb-statistics');
    if (!panel || panel.hidden) {
      const settings = foot.querySelector('.pb-statistics-settings');
      assert.ok(settings, 'The actual privacy settings button must be available'); settings.click();
      panel = body.querySelector('#pb-statistics');
    }
    assert.ok(panel && !panel.hidden, 'The actual analytics choice panel must be open');
    const button = panel.querySelectorAll('button').find(node => node.dataset.choice === choice);
    assert.ok(button, 'The actual analytics choice button must be available: ' + choice); button.click();
    assert.equal(panel.hidden, true, 'Choosing analytics must close the actual choice panel');
  };
  return {
    ctx: context, m: context.__metricsTest, tool, file, opts, dom,
    storage, scripts, clicks, flags, events, count, consoleErrors,
    choose,
    storageEvent: event => windowListeners.get('storage')?.(event)
  };
}

function output(name = 'out.bin') { return { name, blob: new Blob(['result'], { type: 'application/octet-stream' }), dimensions: { width: 10, height: 10 }, validation: { size: { status: 'passed' } } }; }
function result({ status = 'passed', outputs = [output()], warning = null } = {}) { return { outputs, validation: { size: { status } }, warning }; }

test('consent_bridge_exposes_current_state_without_enabling_ads', async () => {
  const h = harness({ consent: 'deny' });
  assert.equal(typeof h.ctx.PBStatistics?.canTrack, 'function');
  assert.equal(h.ctx.PBStatistics.canTrack(), false);
  assert.equal(h.scripts.filter(x => /googletagmanager/.test(x)).length, 0);
  assert.equal(h.ctx.adsbygoogle.pauseAdRequests, 1);
  h.choose('allow'); assert.equal(h.ctx.PBStatistics.canTrack(), true);
  h.choose('deny'); assert.equal(h.ctx.PBStatistics.canTrack(), false);
  assert.equal(h.ctx.adsbygoogle.pauseAdRequests, 1);
  assert.equal(h.scripts.some(x => /adsbygoogle/.test(x)), false);
});

test('repeated_individual_and_zip_downloads_count_one_first_download', async () => {
  const h = harness(); h.tool.run = async () => result({ outputs: [output('a.bin'), output('b.bin'), output('c.bin')] });
  await h.m.run();
  h.m.download(h.m.state().outputs[0]); h.m.download(h.m.state().outputs[0]); h.m.download(h.m.state().outputs[1]);
  await h.m.downloadZip(); await h.m.downloadZip();
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_result'), 1);
  assert.equal(h.count('tool_download'), 5); assert.equal(h.count('tool_first_download'), 1);
  assert.equal(h.clicks.length, 5);
});

test('new_processing_run_allows_exactly_one_new_first_download', async () => {
  const h = harness(); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  h.m.invalidateResult(); await h.m.run(); h.m.download(h.m.state().outputs[0]); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_start'), 2); assert.equal(h.count('tool_first_download'), 2); assert.equal(h.count('tool_download'), 3);
});

test('signature_funnel_preserves_its_actual_tool_id_and_under_limit_status', async () => {
  const h = harness({ id: 'signature-resize', multiple: false });
  h.tool.run = async () => result({ status: 'under', warning: { message: 'below minimum', downloadText: 'download anyway' } });
  await h.m.run(); h.m.download(h.m.state().outputs[0]); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_result'), 1);
  assert.equal(h.count('tool_download'), 2); assert.equal(h.count('tool_first_download'), 1);
  for (const event of h.events()) assert.equal(event.data.tool_id, 'signature-resize');
  assert.equal(h.events().find(event => event.name === 'tool_result').data.result_status, 'under_limit');
});

test('compressor_over_limit_retains_its_distinct_status', async () => {
  const h = harness(); h.tool.run = async () => result({ status: 'failed', warning: { message: 'too large', downloadText: 'download anyway' } });
  await h.m.run(); assert.equal(h.events().find(e => e.name === 'tool_result').data.result_status, 'over_limit');
});

test('unknown_warning_is_not_mislabeled_as_over_limit', async () => {
  const h = harness(); h.tool.run = async () => result({ status: 'passed', warning: { message: 'other warning', downloadText: 'download anyway' } });
  await h.m.run(); assert.equal(h.events().find(e => e.name === 'tool_result').data.result_status, 'warning');
});

test('no_limit_result_is_ready_with_zero_target', async () => {
  const h = harness(); h.m.setOpts({ maxKb: { get: () => 0 } }); h.tool.run = async () => result({ status: 'not_requested' });
  await h.m.run(); const e = h.events().find(e => e.name === 'tool_result');
  assert.equal(e.data.result_status, 'ready'); assert.equal(e.data.target_kb, 0);
});

test('denied_start_then_allowed_download_does_not_create_orphan_funnel_events', async () => {
  const h = harness({ consent: 'deny' }); await h.m.run();
  h.choose('allow'); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0);
  h.m.invalidateResult(); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_first_download'), 1);
});

test('denied_start_then_allowed_result_does_not_create_orphan_result', async () => {
  const h = harness({ consent: 'deny' }); let finish;
  h.tool.run = () => new Promise(resolve => { finish = resolve; }); const work = h.m.run();
  await Promise.resolve(); h.choose('allow'); finish(result()); await work;
  assert.equal(h.events().length, 0);
});

test('unanswered_consent_start_is_not_later_added_to_an_allowed_funnel', async () => {
  const h = harness({ consent: null });
  assert.equal(h.ctx.PBStatistics.canTrack(), false);
  await h.m.run(); h.choose('allow');
  assert.equal(h.ctx.PBStatistics.canTrack(), true);
  h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0); assert.equal(h.clicks.length, 1);
});

test('withdrawn_click_does_not_consume_first_download_flag', async () => {
  const h = harness(); await h.m.run();
  h.choose('deny'); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
  h.choose('allow'); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_download'), 1); assert.equal(h.count('tool_first_download'), 1);
});

test('withdrawal_and_reallow_do_not_reset_already_counted_download', async () => {
  const h = harness(); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  h.choose('deny'); h.m.download(h.m.state().outputs[0]); h.choose('allow'); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_download'), 2); assert.equal(h.count('tool_first_download'), 1);
});

test('legacy_withdrawal_notification_is_authoritative_over_stored_allow', async () => {
  const h = harness(); await h.m.run();
  h.storageEvent({ key: 'pb_cmp_change_v1' });
  assert.equal(JSON.parse(h.storage.get('pb_statistics_v1')).choice, 'allow');
  assert.equal(h.ctx.PBStatistics?.canTrack(), false);
  h.m.download(h.m.state().outputs[0]); assert.equal(h.count('tool_download'), 0);
});

test('internal_runs_remain_unmeasured', async () => {
  const h = harness({ internal: true }); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0); assert.equal(h.clicks.length, 1);
});

for (const id of ['image-compress', 'signature-resize']) test(`sample_only_${id}_runs_remain_unmeasured`, async () => {
  const h = harness({ id, sample: true }); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0); assert.equal(h.clicks.length, 1);
});

test('mixed_sample_and_user_inputs_remain_eligible_for_a_user_funnel', async () => {
  const h = harness({ sample: true });
  h.m.setFiles([h.file, { ...h.file, name: 'user-input.png', sample: false }]);
  await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_result'), 1); assert.equal(h.count('tool_first_download'), 1);
});

test('fake_host_never_loads_ga_or_sends_tool_events', async () => {
  const h = harness({ host: 'parkbok.com.attacker.example' }); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0); assert.equal(h.scripts.some(x => /googletagmanager/.test(x)), false);
});

test('unrelated_tools_remain_outside_tracking_allowlist', async () => {
  const h = harness({ id: 'image-crop' }); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0);
});

test('missing_consent_bridge_fails_closed_without_breaking_conversion', async () => {
  const h = harness(); h.ctx.PBStatistics = undefined; await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0); assert.equal(h.clicks.length, 1);
});

test('blocked_analytics_does_not_break_conversion_or_download', async () => {
  const h = harness(); h.ctx.gtag = () => { throw Error('blocked analytics'); };
  await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.m.state().busy, false); assert.equal(h.m.state().outputs.length, 1); assert.equal(h.clicks.length, 1); assert.equal(h.events().length, 0);
});

test('throwing_consent_bridge_does_not_break_conversion_or_download', async () => {
  const h = harness(); h.ctx.PBStatistics.canTrack = () => { throw Error('unavailable bridge'); };
  await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.events().length, 0); assert.equal(h.clicks.length, 1); assert.equal(h.m.state().busy, false);
});

test('unsupported_input_is_one_coarse_error_without_a_start', async () => {
  const h = harness(); h.m.setFiles([]);
  await h.m.addFiles([{ name: 'private-id.txt', type: 'text/plain', size: 20 }, { name: 'private-id2.txt', type: 'text/plain', size: 20 }]);
  assert.equal(h.count('tool_start'), 0); assert.equal(h.count('tool_error'), 1);
  assert.deepEqual(h.events()[0].data, { tool_id: 'image-compress', tool_language: 'ko', result_status: 'error', error_code: 'unsupported_type', error_stage: 'input' });
});

test('decode_failure_is_one_coarse_error_without_a_start', async () => {
  const h = harness(); h.m.setFiles([]); h.m.stubReadOne(async () => { throw Object.assign(Error('private-image-name'), { key: 'errorBroken' }); });
  await h.m.addFiles([{ name: 'private-id.png', type: 'image/png', size: 20 }, { name: 'private-id2.png', type: 'image/png', size: 20 }]);
  assert.equal(h.count('tool_start'), 0); assert.equal(h.count('tool_error'), 1);
  assert.equal(h.events()[0].data.error_code, 'decode_failed'); assert.equal(h.events()[0].data.error_stage, 'decode');
  assert.equal(h.m.state().busy, false);
});

test('sample_input_type_and_decode_failures_remain_unmeasured', async () => {
  const h = harness(); h.m.setFiles([]);
  await h.m.addFiles([{ name: 'sample.txt', type: 'text/plain', size: 20 }], true);
  h.m.stubReadOne(async () => { throw Error('sample decode failure'); });
  await h.m.addFiles([{ name: 'sample.png', type: 'image/png', size: 20 }], true);
  assert.equal(h.events().length, 0); assert.equal(h.m.state().busy, false);
});

test('a_user_input_error_is_not_excluded_because_existing_inputs_are_samples', async () => {
  const h = harness({ sample: true });
  await h.m.addFiles([{ name: 'user-input.txt', type: 'text/plain', size: 20 }], false);
  assert.equal(h.count('tool_start'), 0); assert.equal(h.count('tool_error'), 1);
  assert.equal(h.events()[0].data.error_code, 'unsupported_type'); assert.equal(h.events()[0].data.error_stage, 'input');
});

test('processing_failure_and_retry_have_separate_start_outcomes', async () => {
  const h = harness(); h.tool.run = async () => { throw Error('private path must not be transmitted'); };
  await h.m.run(); assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_error'), 1);
  assert.equal(h.events().find(e => e.name === 'tool_error').data.error_stage, 'processing');
  assert.equal(h.m.state().busy, false); assert.equal(h.m.state().outputs.length, 0);
  h.tool.run = async () => result(); await h.m.run(); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_start'), 2); assert.equal(h.count('tool_result'), 1); assert.equal(h.count('tool_first_download'), 1);
});

test('empty_success_result_reaches_processing_error_handler', async () => {
  const h = harness(); h.tool.run = async () => result({ outputs: [] });
  let rejected = false; try { await h.m.run(); } catch { rejected = true; }
  assert.equal(rejected, false, 'empty result rejection escaped the handler');
  assert.equal(h.count('tool_error'), 1); assert.equal(h.events().find(e => e.name === 'tool_error').data.error_code, 'processing_failed');
  assert.equal(h.m.state().busy, false); assert.equal(h.m.state().outputs.length, 0); assert.equal(h.dom.result.hidden, true);
});

test('result_rendering_exception_reaches_processing_error_handler', async () => {
  const h = harness(); h.dom.result.appendChild = () => { throw Error('private rendering failure'); };
  await h.m.run();
  assert.equal(h.count('tool_result'), 0); assert.equal(h.count('tool_error'), 1);
  assert.equal(h.events().find(e => e.name === 'tool_error').data.error_code, 'processing_failed');
  assert.equal(h.m.state().busy, false); assert.equal(h.m.state().outputs.length, 0); assert.equal(h.dom.result.hidden, true);
});

test('zip_generation_error_preserves_individual_download_and_first_download', async () => {
  const h = harness(); h.tool.run = async () => result({ outputs: [output('a.bin'), output('b.bin')] });
  await h.m.run(); h.ctx.JSZip = class { file() {} generateAsync() { return Promise.reject(Error('private zip error')); } };
  await h.m.downloadZip();
  assert.equal(h.count('tool_first_download'), 0); assert.equal(h.count('tool_error'), 1);
  assert.equal(h.events().find(e => e.name === 'tool_error').data.error_code, 'zip_failed');
  assert.equal(h.m.state().busy, false); assert.equal(h.m.state().outputs.length, 2);
  h.m.download(h.m.state().outputs[0]); assert.equal(h.count('tool_first_download'), 1);
});

test('zip_library_load_failure_is_distinct_and_does_not_consume_download', async () => {
  const h = harness(); await h.m.run(); delete h.ctx.JSZip; h.flags.scriptsFail = true;
  await h.m.downloadZip(); assert.equal(h.count('tool_error'), 1); assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
  assert.equal(h.events().find(e => e.name === 'tool_error').data.error_stage, 'zip'); assert.equal(h.m.state().busy, false);
});

test('failed_anchor_click_does_not_mark_first_download', async () => {
  const h = harness(); await h.m.run(); h.flags.clickThrows = true;
  assert.throws(() => h.m.download(h.m.state().outputs[0]), /blocked click/);
  assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
  h.flags.clickThrows = false; h.m.download(h.m.state().outputs[0]); assert.equal(h.count('tool_first_download'), 1);
});

test('failed_zip_download_request_does_not_mark_first_download', async () => {
  const h = harness(); await h.m.run(); h.flags.clickThrows = true;
  await h.m.downloadZip();
  assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
  assert.equal(h.count('tool_error'), 1); assert.equal(h.events().find(e => e.name === 'tool_error').data.error_stage, 'zip');
  assert.equal(h.m.state().busy, false);
  h.flags.clickThrows = false; h.m.download(h.m.state().outputs[0]); assert.equal(h.count('tool_first_download'), 1);
});

test('input_change_clears_stale_run_measurement', async () => {
  const h = harness(); await h.m.run(); const old = h.m.state().outputs[0];
  h.m.afterInput(); h.m.download(old);
  assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
});

test('reset_clears_stale_run_measurement', async () => {
  const h = harness(); await h.m.run(); const old = h.m.state().outputs[0];
  h.m.reset(); h.m.download(old);
  assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
});

test('async_option_invalidation_does_not_publish_result_or_download_metric', async () => {
  const h = harness(); let finish;
  h.tool.run = () => new Promise(resolve => { finish = resolve; }); const work = h.m.run();
  await Promise.resolve(); h.m.invalidateResult(); finish(result()); await work;
  h.m.download(output());
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_result'), 0); assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
  assert.equal(h.m.state().busy, false); assert.equal(h.m.state().outputs.length, 0);
});

test('late_zip_completion_cannot_use_an_invalidated_run_for_measurement', async () => {
  const h = harness(); await h.m.run(); let finish;
  h.ctx.JSZip = class { file() {} generateAsync() { return new Promise(resolve => { finish = resolve; }); } };
  const work = h.m.downloadZip(); await Promise.resolve();
  assert.equal(typeof finish, 'function'); h.m.invalidateResult();
  finish(new Blob(['zip'], { type: 'application/zip' })); await work;
  assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
  assert.equal(h.m.state().busy, false); assert.equal(h.m.state().outputs.length, 0);
});

test('only_allowlisted_payload_fields_and_error_codes_are_queued', async () => {
  const h = harness();
  h.m.trackUsage('tool_error', { status: 'error', targetKb: 20, errorCode: 'decode_failed', filename: 'private', pixels: '100x100', message: 'secret' });
  assert.deepEqual(Object.keys(h.events()[0].data).sort(), ['error_code', 'error_stage', 'result_status', 'target_kb', 'tool_id', 'tool_language']);
  h.m.trackUsage('tool_error', { status: 'private status', targetKb: 1.5, errorCode: 'private raw error', filename: 'private' });
  assert.deepEqual(h.events()[1].data, { tool_id: 'image-compress', tool_language: 'ko' });
  const before = h.events().length; h.m.trackUsage('tool_private-file-name', { status: 'ready' });
  assert.equal(h.events().length, before);
});

for (const count of [1, 2]) test(`over_limit_adjustment_and_secondary_download_preserve_one_funnel_${count}_files`, async () => {
  const h = harness();
  h.tool.run = async () => result({ status: 'failed', outputs: Array.from({ length: count }, (_, i) => ({
    name: `over-${i}.bin`, blob: new Blob([new Uint8Array(21000)]),
    validation: { size: { status: 'failed', actualBytes: 21000, limitBytes: 20000, unitBytes: 1000 } }
  })), warning: { message: 'over target', downloadText: 'download over-limit results' } });
  await h.m.run();
  const usage = h.m.state().usage, before = h.events();
  h.m.onPrimary();
  assert.equal(h.clicks.length, 0, 'Adjusting settings must not request a download');
  assert.deepEqual(h.events(), before, 'Adjusting settings must not start or complete another run');
  assert.equal(h.m.state().usage, usage, 'The secondary download still belongs to the displayed run');
  assert.equal(typeof h.m.onWarningDownload, 'function');
  h.choose('deny'); await h.m.onWarningDownload(); await new Promise(setImmediate);
  assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
  h.choose('allow');
  await h.m.onWarningDownload(); await new Promise(setImmediate);
  await h.m.onWarningDownload(); await new Promise(setImmediate);
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_result'), 1);
  assert.equal(h.count('tool_download'), 2); assert.equal(h.count('tool_first_download'), 1);
  assert.equal(h.clicks.length, 3);
});

function editableOptions(h) {
  h.tool.options = [
    { id: 'maxKb', type: 'number', default: 0 },
    { id: 'format', type: 'text', default: 'keep' },
    { id: 'level', type: 'text', default: 'medium' }
  ];
  h.m.renderOptions();
  h.dom.opts.querySelector('#opt-maxKb').value = '125';
  h.dom.opts.querySelector('#opt-format').value = 'webp';
  h.dom.opts.querySelector('#opt-level').value = 'high';
}

for (const alreadyDownloaded of [false, true]) test(`undo_reset_restores_inputs_without_reviving_a_measured_result_${alreadyDownloaded}`, async () => {
  const h = harness(); editableOptions(h); await h.m.run();
  const oldOutput = h.m.state().outputs[0];
  if (alreadyDownloaded) h.m.download(oldOutput);
  const firstBefore = h.count('tool_first_download'), downloadsBefore = h.count('tool_download');
  h.m.reset();
  assert.equal(typeof h.m.undoReset, 'function'); h.m.undoReset();
  const state = h.m.state();
  assert.equal(state.files.length, 1); assert.equal(state.files[0].file, h.file.file);
  assert.deepEqual(JSON.parse(JSON.stringify(state.options)), { maxKb: 125, format: 'webp', level: 'high' });
  assert.equal(state.outputs.length, 0); assert.equal(state.usage, null); assert.equal(state.result, null); assert.equal(state.done, false);
  h.m.download(oldOutput);
  assert.equal(h.count('tool_download'), downloadsBefore); assert.equal(h.count('tool_first_download'), firstBefore);
  await h.m.run(); h.m.download(h.m.state().outputs[0]); h.m.download(h.m.state().outputs[0]);
  assert.equal(h.count('tool_start'), 2); assert.equal(h.count('tool_first_download'), firstBefore + 1);
  assert.equal(h.count('tool_download'), downloadsBefore + 2);
});

test('a_new_input_cancels_the_old_reset_undo_without_restoring_its_run', async () => {
  const h = harness(); editableOptions(h); await h.m.run(); h.m.reset();
  assert.equal(typeof h.m.undoReset, 'function');
  const newFile = { ...h.file, name: 'new-input.png', file: new Blob(['new image'], { type: 'image/png' }) };
  h.m.stubReadOne(async () => newFile);
  await h.m.addFiles([newFile]); h.m.undoReset();
  assert.equal(h.m.state().files.length, 1); assert.equal(h.m.state().files[0].file, newFile.file);
  assert.equal(h.m.state().outputs.length, 0); assert.equal(h.m.state().usage, null); assert.equal(h.m.state().result, null);
  assert.equal(h.count('tool_start'), 1); assert.equal(h.count('tool_download'), 0); assert.equal(h.count('tool_first_download'), 0);
});
