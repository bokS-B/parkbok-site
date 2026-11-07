'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const toolCopy = require('../image/src/tools/image-compress.json');
const commonCopy = require('../image/src/strings.json');
const toolPath = path.resolve(process.env.PARKBOK_IMAGE_TOOL_TEST_SOURCE || path.resolve(__dirname, '../image/tools/image-compress.js'));
const compression = require(toolPath);
const enginePath = path.resolve(process.env.PARKBOK_IMAGE_ENGINE_TEST_SOURCE || path.resolve(__dirname, '../image/img-tools.js'));
const engineSource = fs.readFileSync(enginePath, 'utf8');
const toolSource = fs.readFileSync(toolPath, 'utf8');
const templateSource = fs.readFileSync(path.resolve(__dirname, '../image/src/template.html'), 'utf8');

// Engine input listeners, real tool option renderers, result rendering and download
// handlers run in a DOM double. Image decoding, canvas and processing results are
// doubles; image-compress-target.test.js separately exercises the actual encoder
// pipeline. No browser layout, image codec or OS-save behavior is asserted here.
class Node {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.doc = doc; this.children = [];
    this.parentNode = null; this.attrs = {}; this.listeners = {}; this.dataset = {};
    this.className = ''; this._text = ''; this._value = undefined; this.checked = false;
    this.hidden = false; this.disabled = false; this.open = false; this.validity = { badInput: false };
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.classList = {
      contains: c => this.className.split(/\s+/).includes(c),
      add: (...cs) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...cs])].join(' '); },
      remove: (...cs) => { this.className = this.className.split(/\s+/).filter(c => !cs.includes(c)).join(' '); },
      toggle: (c, force) => { const add = force === undefined ? !this.classList.contains(c) : !!force; this.classList[add ? 'add' : 'remove'](c); return add; }
    };
  }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, reference) { assert.ok(reference.parentNode === this); if (child === reference) return child; if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.splice(this.children.indexOf(reference), 0, child); return child; }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  set innerHTML(value) { assert.equal(value, '', 'The fixture only supports clearing innerHTML'); this.children.forEach(n => { n.parentNode = null; }); this.children = []; this._text = ''; }
  get innerHTML() { return this.textContent; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set value(value) { this._value = String(value); }
  get value() { if (this._value !== undefined) return this._value; if (this.tagName === 'SELECT') return (this.children.find(c => c.selected) || this.children[0])?.value || ''; return ''; }
  setAttribute(k, value) { this.attrs[k] = String(value); if (k === 'id') this.id = String(value); if (k === 'class') this.className = String(value); if (k === 'open') this.open = true; if (k === 'hidden') this.hidden = true; }
  getAttribute(k) { return this.attrs[k] ?? (k === 'id' ? this.id : k === 'type' ? this.type : null) ?? null; }
  hasAttribute(k) { return this.getAttribute(k) !== null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'open') this.open = false; if (k === 'hidden') this.hidden = false; }
  toggleAttribute(k, force) { if (force ?? !(k in this.attrs)) this.setAttribute(k, ''); else this.removeAttribute(k); }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  removeEventListener(k, fn) { this.listeners[k] = (this.listeners[k] || []).filter(f => f !== fn); }
  dispatch(k, props = {}) {
    const e = { type: k, target: this, bubbles: true, preventDefault() {}, stopPropagation() { this.stopped = true; }, ...props };
    for (let n = this; n; n = n.parentNode) {
      e.currentTarget = n; for (const fn of n.listeners[k] || []) fn(e);
      if (!e.bubbles || e.stopped) break;
    }
  }
  click() { if (this.disabled) return; if (this.tagName === 'A' && this.download) this.doc.downloads.push(this.download); this.dispatch('click'); if (this.tagName === 'SUMMARY' && this.parentNode?.tagName === 'DETAILS') this.parentNode.open = !this.parentNode.open; }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(s => this.matches(s.trim()));
    const segments = selector.trim().split(/\s+(?![^[]*\])/);
    if (segments.length > 1) {
      if (!this.matches(segments.pop())) return false;
      for (let n = this.parentNode; n; n = n.parentNode) if (n.matches(segments.join(' '))) return true;
      return false;
    }
    const tag = /^[\w-]+/.exec(selector);
    if (tag && this.tagName.toLowerCase() !== tag[0].toLowerCase()) return false;
    if (selector.includes(':checked') && !this.checked) return false;
    if (selector.includes(':not([disabled])') && this.disabled) return false;
    if (selector.includes(':disabled') && !this.disabled) return false;
    for (const [, id] of selector.matchAll(/#([\w-]+)/g)) if (this.id !== id) return false;
    for (const [, cls] of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(cls)) return false;
    const withoutNot = selector.replace(/:not\([^)]*\)/g, '');
    for (const [, key, double, single, raw] of withoutNot.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)) {
      const expected = double ?? single ?? raw;
      if (expected === undefined ? !this.hasAttribute(key) : this.getAttribute(key) !== expected) return false;
    }
    return true;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = n => { for (const child of n.children) { if (child.matches(selector)) found.push(child); visit(child); } };
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let n = this; n; n = n.parentNode) if (n.matches(selector)) return n; return null; }
  get parentElement() { return this.parentNode; }
  get isConnected() { for (let n = this; n; n = n.parentNode) if (n === this.doc.body || n === this.doc.head) return true; return false; }
  contains(child) { for (let n = child; n; n = n.parentNode) if (n === this) return true; return false; }
  remove() { this.parentNode?.removeChild(this); }
  before(other) { if (!this.parentNode) return; const parent = this.parentNode; if (other.parentNode) other.parentNode.removeChild(other); parent.children.splice(parent.children.indexOf(this), 0, other); other.parentNode = parent; }
  focus() { if (!this.disabled) this.doc.activeElement = this; }
  scrollIntoView() {}
  getContext() { return { drawImage() {}, imageSmoothingEnabled: false }; }
  toDataURL() { return 'data:image/jpeg;base64,test-double'; }
}

function world({ search = '', lang = 'ko', otherTool = false, outputFactory, stringOverrides = {}, commonOverrides = {}, tracking = false, width = 800 } = {}) {
  const doc = { readyState: 'complete', downloads: [], listeners: {}, createElement(tag) { return new Node(tag, doc); }, createTextNode(text) { const n = new Node('#text', doc); n.textContent = text; return n; }, addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); } };
  doc.body = new Node('body', doc); doc.head = new Node('head', doc);
  doc.activeElement = doc.body;
  const ids = {}, workbench = doc.createElement('div'); workbench.className = 'image-workbench'; doc.body.appendChild(workbench);
  for (const id of ['in', 'opts', 'out', 'drop', 'file-input', 'btn-select', 'btn-sample', 'btn-add', 'btn-reset-top', 'drop-compact', 'file-count', 'files', 'in-status', 'result', 'progress', 'btn-primary', 'btn-download-warning', 'btn-reset', 'status']) {
    const tag = templateSource.match(new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
    const n = doc.createElement(tag?.[1] || (['in', 'opts', 'out'].includes(id) ? 'section' : id === 'file-input' ? 'input' : id.startsWith('btn-') ? 'button' : 'div'));
    if (tag) for (const [, key, value] of tag[0].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) if (key !== tag[1]) n.setAttribute(key, value || '');
    n.id = id; ids[id] = n;
    const parent = ['in', 'opts', 'out'].includes(id) ? workbench : ['result', 'progress', 'btn-primary', 'btn-download-warning', 'btn-reset', 'status'].includes(id) ? ids.out : ids.in;
    parent.appendChild(n);
  }
  ids.drop.appendChild(ids['btn-select']); ids.drop.appendChild(ids['file-input']);
  for (const cls of ['bar', 'ptxt']) { const n = doc.createElement('span'); n.className = cls; if (cls === 'ptxt') n.id = 'progress-text'; ids.progress.appendChild(n); }
  doc.getElementById = id => ids[id] || doc.body.querySelector('#' + id);
  doc.querySelector = selector => doc.body.querySelector(selector);
  const config = { id: otherTool ? 'file-dependent-test' : toolCopy.id, lang, strings: structuredClone(toolCopy.strings[lang]) };
  Object.assign(config.strings, stringOverrides);
  let urlIndex = 0;
  const localStorage = { getItem: () => null, setItem() {} };
  const events = [], zipFiles = [], sampleRequests = [];
  class JSZip { file(name) { zipFiles.push(name); } async generateAsync() { return new Blob(['zip'], { type: 'application/zip' }); } }
  const win = { JSZip, IMGT_STRINGS: { ...commonCopy[lang], ...commonOverrides }, IMGT_TOOL: config, PBStatistics: { canTrack: () => tracking }, gtag: (...args) => events.push(args), addEventListener() {}, removeEventListener() {}, innerWidth: width, matchMedia: () => ({ matches: width >= 1024, addEventListener() {}, removeEventListener() {} }), createImageBitmap: async f => ({ width: f.width || 400, height: f.height || 200, close() {} }) };
  const context = vm.createContext({ window: win, document: doc, navigator: { webdriver: true, userAgent: 'node-dom-unit-test' }, localStorage, location: { search, hash: '', hostname: tracking ? 'parkbok.com' : 'unit-test.invalid' }, URL: { createObjectURL: () => 'blob:test-' + ++urlIndex, revokeObjectURL() {} }, URLSearchParams, createImageBitmap: win.createImageBitmap, setTimeout: fn => setTimeout(fn, 0), clearTimeout, Blob, File, fetch: async url => { sampleRequests.push(url); return { ok: true, blob: async () => new Blob(['sample fixture'], {type:'image/jpeg'}) }; }, console });
  vm.runInContext(engineSource, context, { filename: enginePath });
  const originalRegister = win.IMGT.register;
  let lastOptions;
  win.IMGT.register = tool => {
    tool.run = async (inputs, opts) => { lastOptions = { ...opts }; return outputFactory ? outputFactory(inputs, opts) : makeOutputs(inputs.map(() => 900), opts.maxKb); };
    originalRegister(tool);
  };
  if (otherTool) {
    win.IMGT.register({ id: 'file-dependent-test', multiple: true, options: [{ id: 'fileWidth', type: 'file-width' }], renderers: {
      'file-width': (o, row, api) => { const input = api.el('input'); input.value = api.files()[0]?.width || 0; row.appendChild(input); api.set(o.id, () => Number(input.value)); }
    } });
  } else vm.runInContext(toolSource, context, { filename: 'image/tools/image-compress.js' });
  const getOption = id => ids.opts.querySelector(`[data-opt="${id}"]`);
  const getValues = () => ({ maxKb: getOption('maxKb').querySelector('input').value, format: getOption('format').querySelector('select').value, level: getOption('level').querySelector('input:checked').value, reduce: getOption('reduce').querySelector('input').checked });
  const setValues = ({ maxKb = '100', format = 'webp', level = 'high', reduce = false } = {}) => {
    getOption('maxKb').querySelector('input').value = maxKb;
    getOption('format').querySelector('select').value = format;
    getOption('reduce').querySelector('input').checked = reduce;
    for (const radio of getOption('level').querySelectorAll('input')) radio.checked = radio.value === level;
    ids.opts.dispatch('input');
  };
  return { doc, ids, workbench, events, zipFiles, sampleRequests, getOption, getValues, setValues, lastOptions: () => lastOptions,
    async add(...files) { ids['file-input'].files = files; ids['file-input'].dispatch('change'); await settle(); },
    async run() { ids['btn-primary'].click(); await settle(); }
  };
}

function file(name, width = 400) { return { name, size: 50000, type: 'image/jpeg', width, height: 200, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) }; }
function makeOutputs(sizes, kb = 1) {
  const limit = kb > 0 ? kb * 1000 : null;
  const oversized = limit === null ? 0 : sizes.filter(size => size > limit).length;
  return { outputs: sizes.map((size, i) => ({ name: `image-${i + 1}.jpg`, blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }), srcSize: 50000, dimensions: { width: 300, height: 200 },
    validation: { size: { status: limit === null ? 'not_requested' : size <= limit ? 'passed' : 'failed', actualBytes: size, limitBytes: limit, unitBytes: 1000 } } })),
    warning: oversized ? { message: `용량 초과 ${oversized}/${sizes.length}개`, downloadText: '초과 포함 받기' } : null };
}
async function settle() { await new Promise(setImmediate); await new Promise(setImmediate); }
function cards(w) { return w.ids.result.querySelector('.result-grid').children; }
function controls(w) { return ['maxKb', 'format', 'level', 'reduce'].map(id => w.getOption(id)); }
function copyLabel(key, fallback) { return toolCopy.strings.ko[key] || commonCopy.ko[key] || fallback; }
function assertPreserved(w, before) { assert.deepEqual(w.getValues(), { maxKb: '100', format: 'webp', level: 'high', reduce: false }); controls(w).forEach((control, i) => assert.ok(control === before[i], 'Existing compression control must be retained')); }

test('compression retains the remote reduction option and uses the approved 1000-byte KB policy', () => {
  assert.deepEqual(compression.options.map(o => o.id).sort(), ['format', 'level', 'maxKb', 'reduce']);
  assert.equal(compression.parseOpts({ maxKb: 1 }).maxBytes, 1000);
  assert.match(toolCopy.strings.ko.options.maxKb.help, /1000/);
});

test('adding a file preserves all compression values and control objects', async () => {
  const w = world(); await w.add(file('one.jpg')); w.setValues(); const before = controls(w); await w.add(file('two.jpg'));
  assertPreserved(w, before);
});
test('removing one file preserves compression values while files remain', async () => {
  const w = world(); await w.add(file('one.jpg'), file('two.jpg')); w.setValues(); const before = controls(w); w.ids.files.children[0].querySelector('.rm').click();
  assert.equal(w.ids.files.children.length, 1); assertPreserved(w, before);
});
test('reordering files preserves compression values and reorders the actual rows', async () => {
  const w = world(); await w.add(file('one.jpg'), file('two.jpg')); w.setValues(); const before = controls(w); w.ids.files.children[1].querySelectorAll('button')[0].click();
  assert.equal(w.ids.files.children[0].querySelector('.file-name').textContent, 'two.jpg'); assertPreserved(w, before);
});
test('URL target seeds the first input but does not replace a later user choice', async () => {
  const w = world({ search: '?maxKb=100' }); await w.add(file('one.jpg')); assert.equal(w.getValues().maxKb, '100');
  w.setValues({ maxKb: '200' }); await w.add(file('two.jpg')); assert.equal(w.getValues().maxKb, '200');
  assert.equal(w.getOption('maxKb').querySelectorAll('button').find(b => b.dataset.targetKb === 200).getAttribute('aria-pressed'), 'true');
});
test('an invalid edited target is retained instead of silently disabling the limit', async () => {
  const w = world(); await w.add(file('one.jpg')); w.setValues({ maxKb: '-1' }); await w.add(file('two.jpg'));
  assert.equal(w.getValues().maxKb, '-1');
});
test('an unfinished native number input retains its DOM object and badInput state', async () => {
  const w = world(); await w.add(file('one.jpg')); w.setValues({ maxKb: '' });
  const input = w.getOption('maxKb').querySelector('input'); input.validity.badInput = true;
  await w.add(file('two.jpg'));
  assert.ok(w.getOption('maxKb').querySelector('input') === input, 'Unfinished input must retain its DOM object');
  assert.equal(input.value, ''); assert.equal(input.validity.badInput, true);
  await w.run(); assert.ok(Number.isNaN(w.lastOptions().maxKb));
});
test('explicit reset creates a new batch with the URL seed and default values', async () => {
  const w = world({ search: '?maxKb=50' }); await w.add(file('one.jpg')); w.setValues(); const before = w.getOption('maxKb'); w.ids['btn-reset'].click();
  assert.equal(w.ids.opts.hidden, false); await w.add(file('new.jpg'));
  assert.deepEqual(w.getValues(), { maxKb: '50', format: 'keep', level: 'medium', reduce: true }); assert.ok(w.getOption('maxKb') !== before);
});
test('deleting the last file clears options and starts the next batch from defaults', async () => {
  const w = world(); await w.add(file('one.jpg')); w.setValues(); w.ids.files.children[0].querySelector('.rm').click(); await w.add(file('new.jpg'));
  assert.deepEqual(w.getValues(), { maxKb: '0', format: 'keep', level: 'medium', reduce: true });
});
test('other tools still rebuild file-dependent options after reordering', async () => {
  const w = world({ otherTool: true }); await w.add(file('one.jpg', 100), file('two.jpg', 300));
  const before = w.getOption('fileWidth'); assert.equal(before.querySelector('input').value, '100');
  w.ids.files.children[1].querySelectorAll('button')[0].click();
  assert.equal(w.getOption('fileWidth').querySelector('input').value, '300'); assert.ok(w.getOption('fileWidth') !== before);
});
for (const [kb, limit] of [[1, 1000], [20, 20000]]) test(`${limit} B and ${limit + 1} B show distinct exact bytes and inclusive per-file limit status`, async () => {
  const w = world({ outputFactory: () => makeOutputs([limit, limit + 1], kb) }); await w.add(file('one.jpg'), file('two.jpg')); w.setValues({ maxKb: String(kb) }); await w.run();
  const [first, second] = cards(w);
  const exact = w.ids.result.querySelectorAll('.result-size-exact');
  assert.match(exact[0]?.textContent || '', new RegExp(`${limit} B`));
  assert.match(exact[1]?.textContent || '', new RegExp(`${limit + 1} B`));
  assert.equal(first.querySelector('.result-size-status')?.getAttribute('data-size-status'), 'passed');
  assert.equal(second.querySelector('.result-size-status')?.getAttribute('data-size-status'), 'failed');
  assert.ok(first.textContent.includes(copyLabel('targetFilePassed', '용량 상한 충족')));
  assert.ok(second.textContent.includes(copyLabel('targetFileExceeded', '용량 상한 초과')));
  assert.match(w.ids.result.textContent, new RegExp(`≤ ${limit} B`)); assert.match(w.ids.result.textContent, new RegExp(`> ${limit} B`));
});
test('no target displays not-requested without a false pass', async () => {
  const w = world({ outputFactory: () => makeOutputs([1000, 1001], 0) }); await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  for (const card of cards(w)) { assert.equal(card.querySelector('.result-size-status')?.getAttribute('data-size-status'), 'not_requested'); assert.ok(card.textContent.includes(copyLabel('targetFileNotRequested', '용량 상한 미설정'))); }
});
test('an over-limit result remains individually downloadable', async () => {
  const w = world({ outputFactory: () => makeOutputs([1000, 1001], 1) }); await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  const button = cards(w)[1].querySelector('button'); assert.equal(button.disabled, false); button.click(); assert.deepEqual(w.doc.downloads, ['image-2.jpg']);
});
test('an over-limit primary action focuses the target and the separate warning action downloads', async () => {
  const w = world({ outputFactory: () => makeOutputs([20001], 20) }); await w.add(file('one.jpg')); w.setValues({ maxKb: '20' }); await w.run();
  assert.match(w.ids.result.querySelector('.result-size-exact')?.textContent || '', /20001 B/);
  assert.equal(w.ids.result.querySelector('.result-size-status')?.getAttribute('data-size-status'), 'failed');
  assert.ok(w.ids.result.textContent.includes(copyLabel('targetFileExceeded', '용량 상한 초과'))); assert.match(w.ids.result.textContent, /> 20000 B/);
  assert.equal(w.ids['btn-primary'].getAttribute('data-warning'), ''); w.ids['btn-primary'].click();
  assert.deepEqual(w.doc.downloads, []);
  assert.ok(w.doc.activeElement === w.getOption('maxKb').querySelector('input'));
  w.getOption('maxKb').querySelector('input').offsetParent = null;
  w.ids['btn-primary'].click();
  assert.ok(w.doc.activeElement === w.getOption('maxKb').querySelector('select'));
  assert.equal(w.ids['btn-download-warning'].hidden, false); w.ids['btn-download-warning'].click();
  assert.deepEqual(w.doc.downloads, ['image-1.jpg']);
});
test('translated result labels override fallbacks and French has its own fallback', async () => {
  const w = world({ lang: 'fr', outputFactory: () => makeOutputs([1000, 1001], 1), stringOverrides: { targetFilePassed: 'Custom translation', targetFileExceeded: undefined }, commonOverrides: { targetFileExceeded: undefined } });
  await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  assert.match(cards(w)[0].textContent, /Custom translation/); assert.match(cards(w)[1].textContent, /Limite dépassée/);
});
test('generated French common labels are used when no tool-specific override exists', async () => {
  const w = world({ lang: 'fr', outputFactory: () => makeOutputs([1000, 1001], 1) });
  await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  assert.ok(cards(w)[0].textContent.includes(commonCopy.fr.targetFilePassed));
  assert.ok(cards(w)[1].textContent.includes(commonCopy.fr.targetFileExceeded));
});
test('adding files invalidates old output and retains settings for the next run', async () => {
  const w = world(); await w.add(file('one.jpg')); w.setValues(); await w.run(); assert.equal(w.ids.result.hidden, false);
  await w.add(file('two.jpg')); assert.equal(w.ids.result.hidden, true); await w.run(); assert.equal(w.lastOptions().maxKb, 100); assert.equal(w.lastOptions().format, 'webp');
});
test('editing options invalidates the old result without replacing controls', async () => {
  const w = world(); await w.add(file('one.jpg')); await w.run(); const before = w.getOption('maxKb'); w.setValues({ maxKb: '200' });
  assert.equal(w.ids.result.hidden, true); assert.equal(w.doc.body.classList.contains('done'), false); assert.ok(w.getOption('maxKb') === before);
});
test('other tools retain their existing batch result rendering', async () => {
  const w = world({ otherTool: true }); await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  assert.equal(w.ids.result.querySelector('.result-size-status'), null); assert.equal(w.ids.result.querySelector('.result-size-exact'), null);
});

test('the target is the first option and is available before selecting files inside the workbench', () => {
  const w = world();
  assert.equal(compression.options[0].id, 'maxKb'); assert.equal(compression.optionsBeforeInput, true);
  assert.equal(w.ids.opts.hidden, false); assert.ok(w.getOption('maxKb'));
  assert.ok(w.ids.opts.parentNode === w.workbench, 'Options must stay inside the workbench');
  assert.deepEqual(w.ids.opts.querySelectorAll('[data-opt]').map(row => row.getAttribute('data-opt')), ['maxKb', 'level', 'format', 'reduce']);
});

test('compression DOM order follows target, upload and results through input, reset and undo', async () => {
  const w = world({ width: 375 });
  const order = () => w.workbench.children.map(node => node.id);
  assert.deepEqual(order(), ['opts', 'in', 'out']);
  const target = w.getOption('maxKb').querySelector('input');
  await w.add(file('one.jpg'));
  assert.deepEqual(order(), ['opts', 'in', 'out']);
  assert.ok(w.getOption('maxKb').querySelector('input') === target);
  w.ids['btn-reset'].click();
  assert.deepEqual(order(), ['opts', 'in', 'out']);
  w.doc.getElementById('btn-undo-reset').click();
  assert.deepEqual(order(), ['opts', 'in', 'out']);
  assert.ok(w.getOption('maxKb').querySelector('input') === target);
  assert.ok(w.ids.opts.parentNode === w.workbench && w.ids.in.parentNode === w.workbench && w.ids.out.parentNode === w.workbench);
});

test('20 KB is a working preset and zero uses the readable unlimited label', async () => {
  const w = world(); await w.add(file('one.jpg'));
  const presets = w.getOption('maxKb').querySelectorAll('button');
  assert.deepEqual(presets.map(button => Number(button.dataset.targetKb)).sort((a, b) => a - b), [0, 20, 50, 100, 200, 500]);
  const unlimited = presets.find(button => Number(button.dataset.targetKb) === 0);
  assert.match(unlimited.textContent, /제한 없음/); assert.doesNotMatch(unlimited.textContent, /^0 KB$/);
  const twenty = presets.find(button => Number(button.dataset.targetKb) === 20); twenty.click();
  assert.equal(w.getValues().maxKb, '20'); assert.equal(twenty.getAttribute('aria-pressed'), 'true');
  assert.equal(unlimited.getAttribute('aria-pressed'), 'false');
});
test('a target chosen before input is retained when the first file is added', async () => {
  const w = world(), row = w.getOption('maxKb'); assert.ok(row);
  const twenty = row.querySelectorAll('button').find(button => Number(button.dataset.targetKb) === 20); assert.ok(twenty); twenty.click();
  await w.add(file('one.jpg')); assert.equal(w.getValues().maxKb, '20'); assert.ok(w.getOption('maxKb') === row);
});

test('advanced settings contain level, format and optional reduction and start collapsed on mobile', () => {
  const w = world({ width: 375 }), advanced = w.doc.getElementById('compression-advanced');
  assert.ok(advanced, 'An advanced settings disclosure must exist before input');
  assert.equal(advanced.tagName, 'DETAILS'); assert.equal(advanced.open, false);
  assert.match(advanced.querySelector('summary').textContent, /고급 설정/);
  assert.deepEqual(advanced.querySelectorAll('[data-opt]').map(row => row.getAttribute('data-opt')), ['level', 'format', 'reduce']);
  assert.equal(w.getOption('maxKb').closest('details'), null);
  advanced.querySelector('summary').click(); assert.equal(advanced.open, true);
});

test('target and radio groups have labels, descriptive help and live progress feedback', async () => {
  const w = world(); await w.add(file('one.jpg'));
  const target = w.getOption('maxKb'); assert.equal(target.getAttribute('role'), 'group');
  for (const attribute of ['aria-labelledby', 'aria-describedby']) {
    const references = (target.getAttribute(attribute) || '').split(/\s+/).filter(Boolean);
    assert.ok(references.length, `Target group needs ${attribute}`);
    for (const id of references) assert.ok(w.doc.getElementById(id)?.textContent.trim(), `${attribute} must refer to readable content`);
  }
  const radios = w.getOption('level').querySelector('[role="radiogroup"]');
  assert.ok(radios); assert.ok(w.doc.getElementById(radios.getAttribute('aria-labelledby'))?.textContent.trim());
  const live = [w.ids.status, w.ids.progress, w.doc.getElementById('progress-text')];
  assert.ok(live.some(node => node && ['polite', 'assertive'].includes(node.getAttribute('aria-live'))), 'Processing feedback needs a live region');
});

test('a failed batch has a focused level-two summary and visible per-file state badges', async () => {
  const w = world({ outputFactory: () => makeOutputs([1000, 1001], 1) }); await w.add(file('one.jpg'), file('two.jpg')); w.setValues({ maxKb: '1' }); await w.run();
  const summary = w.ids.result.querySelector('.result-summary'); assert.ok(summary);
  assert.ok(summary.tagName === 'H2' || (summary.getAttribute('role') === 'heading' && summary.getAttribute('aria-level') === '2'));
  assert.equal(summary.getAttribute('tabindex'), '-1'); assert.ok(w.doc.activeElement === summary);
  assert.match(summary.textContent, /2.*1.*초과/);
  for (const [index, card] of [...cards(w)].entries()) {
    const badge = card.querySelector('.result-size-status'); assert.ok(badge);
    assert.equal(badge.getAttribute('data-size-status'), index ? 'failed' : 'passed');
    assert.equal(badge.closest('.result-details'), null, 'The state badge must remain visible outside collapsed details');
  }
});

test('exact bytes, true dimensions and aggregate notes live in closed result disclosures', async () => {
  const w = world({ outputFactory: () => ({ ...makeOutputs([1000, 1001], 1), note: 'Aggregate fixture note' }) });
  await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  const exact = w.ids.result.querySelectorAll('.result-size-exact'); assert.equal(exact.length, 2);
  for (const [index, row] of exact.entries()) {
    assert.match(row.textContent, new RegExp(`300 × 200 px.*${1000 + index} B`));
    const details = row.closest('.result-details'); assert.ok(details); assert.equal(details.tagName, 'DETAILS'); assert.equal(details.open, false);
  }
  const note = w.ids.result.querySelector('.result-note'); assert.match(note?.textContent || '', /Aggregate fixture note/); assert.ok(note.closest('.result-details'));
});

test('a successful single result retains its primary download and hides warning download', async () => {
  const w = world({ outputFactory: () => makeOutputs([1000], 1) }); await w.add(file('one.jpg')); w.setValues({ maxKb: '1' }); await w.run();
  assert.equal(w.ids['btn-download-warning'].hidden, true); w.ids['btn-primary'].click(); assert.deepEqual(w.doc.downloads, ['image-1.jpg']);
});

test('a successful batch retains the primary ZIP download', async () => {
  const w = world({ outputFactory: () => makeOutputs([900, 1000], 1) }); await w.add(file('one.jpg'), file('two.jpg')); w.setValues({ maxKb: '1' }); await w.run();
  assert.equal(w.ids['btn-download-warning'].hidden, true); w.ids['btn-primary'].click(); await settle();
  assert.deepEqual(w.zipFiles, ['image-1.jpg', 'image-2.jpg']); assert.deepEqual(w.doc.downloads, [toolCopy.strings.ko.resultName + '.zip']);
});

test('a failed batch ZIP is downloaded only through the explicit warning action', async () => {
  const w = world({ outputFactory: () => makeOutputs([1000, 1001], 1) }); await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  w.ids['btn-primary'].click(); await settle(); assert.deepEqual(w.doc.downloads, []);
  assert.equal(w.ids['btn-download-warning'].hidden, false); w.ids['btn-download-warning'].click(); await settle();
  assert.deepEqual(w.zipFiles, ['image-1.jpg', 'image-2.jpg']); assert.deepEqual(w.doc.downloads, [toolCopy.strings.ko.resultName + '.zip']);
});

test('reset undo restores inputs and settings once without restoring output or run measurement', async () => {
  const w = world({ tracking: true }); await w.add(file('one.jpg'), file('two.jpg')); w.setValues(); await w.run();
  const staleDownload = cards(w)[0].querySelector('button'), eventsBefore = w.events.length;
  w.ids['btn-reset'].click();
  const notice = w.doc.getElementById('reset-notice'), undo = w.doc.getElementById('btn-undo-reset');
  assert.ok(notice && undo); assert.equal(notice.hidden, false); assert.match(notice.textContent, /초기화/);
  undo.click(); await settle();
  assert.deepEqual(w.ids.files.querySelectorAll('.file-name').map(node => node.textContent), ['one.jpg', 'two.jpg']);
  assert.deepEqual(w.getValues(), { maxKb: '100', format: 'webp', level: 'high', reduce: false });
  assert.equal(w.ids.result.hidden, true); assert.equal(w.doc.body.classList.contains('done'), false);
  staleDownload.click(); assert.equal(w.events.length, eventsBefore, 'Old output must not restore the previous run measurement');
  assert.ok(!undo.isConnected || undo.disabled || undo.hidden || undo.parentNode.hidden, 'Undo must be consumed once');
  const previousStarts = w.events.filter(event => event[1] === 'tool_start').length;
  await w.run(); assert.equal(w.events.filter(event => event[1] === 'tool_start').length, previousStarts + 1);
});

test('deleting a file keeps keyboard focus on a connected remaining file control', async () => {
  const w = world(); await w.add(file('one.jpg'), file('two.jpg'), file('three.jpg'));
  const remove = w.ids.files.children[0].querySelector('.rm'); remove.focus(); remove.click();
  const active = w.doc.activeElement; assert.ok(active.isConnected); assert.equal(active.tagName, 'BUTTON'); assert.equal(active.disabled, false);
  assert.ok(w.ids.files.contains(active)); assert.match(active.closest('.file').textContent, /two.jpg/);
});

test('reordering keeps keyboard focus with the moved file and names file actions', async () => {
  const w = world(); await w.add(file('one.jpg'), file('two.jpg'), file('three.jpg'));
  const row = w.ids.files.children[1], up = row.querySelectorAll('button')[0];
  for (const button of row.querySelectorAll('button')) assert.match(button.getAttribute('aria-label') || '', /two.jpg/);
  up.focus(); up.click();
  const active = w.doc.activeElement; assert.ok(active.isConnected); assert.equal(active.tagName, 'BUTTON'); assert.equal(active.disabled, false);
  assert.match(active.closest('.file').textContent, /two.jpg/);
});


test('remote comparison previews remain available inside compression result details', async () => {
  const w = world(); await w.add(file('original.jpg')); await w.run();
  const compare = w.ids.result.querySelector('.compress-compare');
  assert.ok(compare); assert.ok(compare.closest('.result-details'));
  const figures = compare.querySelectorAll('figure'); assert.equal(figures.length,2);
  assert.match(figures[0].textContent,/400.*200.*50000/);
  assert.match(figures[1].textContent,/300.*200.*900/);
  assert.ok(figures.every(figure => figure.querySelector('img').src.startsWith('blob:')));
});

test('remote sample input selects a 20 KB target and stays outside user-run metrics', async () => {
  const w = world({tracking:true});
  assert.ok(w.ids['btn-sample']); w.ids['btn-sample'].click();
  for(let attempt=0; attempt<10 && !w.doc.body.classList.contains('has-input'); attempt++) await settle();
  assert.deepEqual(w.sampleRequests,['/image/assets/compress-sample.jpg']);
  assert.equal(w.getValues().maxKb,'20');
  assert.match(w.ids.files.textContent,/parkbok-sunset-sample.jpg/);
  await w.run(); w.ids['btn-primary'].click();
  assert.equal(w.doc.downloads.length,1);
  assert.deepEqual(w.events,[]);
});

test('Korean users can choose the first 100KB 이하 preset before adding an image', async () => {
  const w = world({ lang: 'ko' }), row = w.getOption('maxKb'); assert.ok(row);
  const presets = row.querySelectorAll('button'), hundred = presets[0];
  assert.equal(Number(hundred.dataset.targetKb), 100);
  assert.equal(hundred.textContent, '100KB 이하');
  assert.equal(w.getValues().maxKb, '0', 'Reordering presets must not change the default target');
  hundred.click(); assert.equal(hundred.getAttribute('aria-pressed'), 'true');
  assert.equal(w.getValues().maxKb, '100');
  await w.add(file('selected-photo.jpg'));
  assert.ok(w.getOption('maxKb') === row); assert.equal(w.getValues().maxKb, '100');
  assert.equal(hundred.getAttribute('aria-pressed'), 'true');
});

test('non-Korean presets retain their original order and 100 KB label', () => {
  for (const lang of ['en', 'zh', 'ja', 'es', 'pt', 'de', 'fr']) {
    const w = world({ lang }), presets = w.getOption('maxKb').querySelectorAll('button');
    assert.deepEqual(presets.map(button => Number(button.dataset.targetKb)), [0, 20, 50, 100, 200, 500], lang);
    assert.equal(presets.find(button => Number(button.dataset.targetKb) === 100).textContent, '100 KB', lang);
  }
});

test('Korean 100KB results distinguish 100000 and 100001 bytes and keep explicit over-limit downloads', async () => {
  const w = world({ lang: 'ko', outputFactory: (_inputs, opts) => makeOutputs([100000, 100001], opts.maxKb) });
  w.getOption('maxKb').querySelectorAll('button').find(button => Number(button.dataset.targetKb) === 100).click();
  await w.add(file('fits.jpg'), file('over.jpg')); await w.run();
  assert.equal(w.lastOptions().maxKb, 100);
  const [passed, failed] = cards(w), exact = w.ids.result.querySelectorAll('.result-size-exact');
  assert.match(exact[0].textContent, /100000 B.*≤ 100000 B/);
  assert.match(exact[1].textContent, /100001 B.*> 100000 B/);
  assert.equal(passed.querySelector('.result-size-status').getAttribute('data-size-status'), 'passed');
  assert.equal(failed.querySelector('.result-size-status').getAttribute('data-size-status'), 'failed');
  w.ids['btn-primary'].click(); assert.deepEqual(w.doc.downloads, []);
  assert.ok(w.doc.activeElement === w.getOption('maxKb').querySelector('input'));
  failed.querySelector('.result-download').click(); assert.deepEqual(w.doc.downloads, ['image-2.jpg']);
  assert.equal(w.ids['btn-download-warning'].hidden, false); w.ids['btn-download-warning'].click(); await settle();
  assert.deepEqual(w.zipFiles, ['image-1.jpg', 'image-2.jpg']);
  assert.deepEqual(w.doc.downloads, ['image-2.jpg', toolCopy.strings.ko.resultName + '.zip']);
});

test('a Korean image at the 100KB boundary keeps the normal single-result download', async () => {
  const w = world({ lang: 'ko', outputFactory: (_inputs, opts) => makeOutputs([100000], opts.maxKb) });
  w.getOption('maxKb').querySelectorAll('button').find(button => Number(button.dataset.targetKb) === 100).click();
  await w.add(file('fits.jpg')); await w.run();
  assert.equal(w.lastOptions().maxKb, 100);
  assert.equal(w.ids.result.querySelector('.result-size-status').getAttribute('data-size-status'), 'passed');
  assert.match(w.ids.result.querySelector('.result-size-exact').textContent, /100000 B/);
  assert.equal(w.ids['btn-download-warning'].hidden, true); w.ids['btn-primary'].click();
  assert.deepEqual(w.doc.downloads, ['image-1.jpg']);
});

test('Korean images within 100KB retain the normal primary ZIP download', async () => {
  const w = world({ lang: 'ko', outputFactory: (_inputs, opts) => makeOutputs([99999, 100000], opts.maxKb) });
  w.getOption('maxKb').querySelectorAll('button').find(button => Number(button.dataset.targetKb) === 100).click();
  await w.add(file('one.jpg'), file('two.jpg')); await w.run();
  assert.equal(w.lastOptions().maxKb, 100);
  for (const card of cards(w)) assert.equal(card.querySelector('.result-size-status').getAttribute('data-size-status'), 'passed');
  assert.equal(w.ids['btn-download-warning'].hidden, true); w.ids['btn-primary'].click(); await settle();
  assert.deepEqual(w.zipFiles, ['image-1.jpg', 'image-2.jpg']);
  assert.deepEqual(w.doc.downloads, [toolCopy.strings.ko.resultName + '.zip']);
});

for (const target of [20, 50, 0, 137]) test(`Korean URL maxKb=${target} takes precedence before and after file input`, async () => {
  const w = world({ lang: 'ko', search: '?maxKb=' + target });
  assert.equal(w.getValues().maxKb, String(target));
  const selected = () => w.getOption('maxKb').querySelectorAll('button').filter(button => button.getAttribute('aria-pressed') === 'true').map(button => Number(button.dataset.targetKb));
  assert.deepEqual(selected(), target === 137 ? [] : [target]);
  await w.add(file('url-target.jpg')); assert.equal(w.getValues().maxKb, String(target));
  assert.deepEqual(selected(), target === 137 ? [] : [target]);
  await w.run(); assert.equal(w.lastOptions().maxKb, target);
});

test('a Korean custom target overrides its URL seed and survives the first file input', async () => {
  const w = world({ lang: 'ko', search: '?maxKb=20' }), row = w.getOption('maxKb'), input = row.querySelector('input');
  input.value = '137'; input.dispatch('input');
  assert.ok(row.querySelectorAll('button').every(button => button.getAttribute('aria-pressed') === 'false'));
  await w.add(file('custom-target.jpg')); assert.ok(w.getOption('maxKb').querySelector('input') === input);
  assert.equal(w.getValues().maxKb, '137'); await w.run(); assert.equal(w.lastOptions().maxKb, 137);
});

test('mobile target select synchronizes presets, custom values and result invalidation', async () => {
  const w = world({ lang: 'ko', search: '?maxKb=190' }), row = w.getOption('maxKb');
  const select = row.querySelector('select'), input = row.querySelector('input');
  assert.equal(select.value, 'custom'); assert.ok(row.classList.contains('target-custom'));
  select.value = '200'; select.dispatch('input'); select.dispatch('change'); assert.equal(input.value, '200');
  assert.equal(select.value, '200'); assert.equal(row.classList.contains('target-custom'), false);
  await w.add(file('photo.jpg')); await w.run();
  select.value = '20'; select.dispatch('input'); select.dispatch('change'); assert.equal(w.getValues().maxKb, '20');
  assert.equal(w.ids.result.hidden, true);
  select.value = 'custom'; select.dispatch('input'); select.dispatch('change'); assert.ok(row.classList.contains('target-custom'));
  input.value = '0'; input.dispatch('input'); assert.equal(select.value, 'custom');
  assert.ok(row.classList.contains('target-custom'));
  input.value = '190'; input.dispatch('input'); assert.equal(w.getValues().maxKb, '190');
  row.querySelectorAll('button').find(b => Number(b.dataset.targetKb) === 0).click();
  assert.equal(select.value, '0'); assert.equal(row.classList.contains('target-custom'), false);
});
