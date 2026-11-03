'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const imageTool = require('../pdf/tools/jpg-to-pdf.js');
const splitTool = require('../pdf/tools/split.js');
const engine = fs.readFileSync(path.join(__dirname, '../pdf/pdf-tools.js'), 'utf8');

// Exercise the real engine's user-intent handlers and script loader. Vendor scripts
// stay pending instead of being fetched: these tests check network demand, not PDF rendering.
function app(tool) {
  const requested = [], nodes = new Map(), documentEvents = new Map();
  function node() {
    const events = new Map();
    return {
      style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {}, querySelector() { return node(); },
      addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
      fire(type) { for (const fn of events.get(type) || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); }
    };
  }
  const document = {
    readyState: 'complete', body: node(),
    head: { appendChild(script) { requested.push(script.src); } },
    createElement() { return node(); },
    getElementById(id) { if (id === 'lang') return null; if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    addEventListener(type, fn) { if (!documentEvents.has(type)) documentEvents.set(type, []); documentEvents.get(type).push(fn); }
  };
  const world = {
    document, navigator: { webdriver: true, userAgent: 'node:test', language: 'en' },
    localStorage: { getItem() { return null; } },
    PDFT_TOOL: { lang: 'en', strings: {} }, addEventListener() {}
  };
  world.window = world;
  vm.runInNewContext(engine, world, { filename: 'pdf-tools.js' });
  world.PDFT.register({ ...tool });
  return {
    requested,
    intent(type) { nodes.get('btn-select').fire(type); },
    dragFile() {
      const event = { dataTransfer: { types: ['Files'] }, preventDefault() {} };
      for (const fn of documentEvents.get('dragenter') || []) fn(event);
    },
    ensurePdfjs() { return world.PDFT.ensurePdfjs(); }
  };
}

for (const intent of ['mouseenter', 'focus', 'touchstart']) {
  test(`JPG→PDF ${intent} warms the writer without requesting the PDF renderer`, () => {
    const a = app(imageTool); a.intent(intent);
    assert.deepEqual(a.requested, ['/assets/vendor/pdf-lib.min.js']);
  });
}
test('image-only file drag warms only the writer', () => {
  const a = app(imageTool); a.dragFile();
  assert.deepEqual(a.requested, ['/assets/vendor/pdf-lib.min.js']);
});
test('PDF split still warms both its writer and page renderer', () => {
  const a = app(splitTool); a.intent('focus');
  assert.deepEqual(a.requested, ['/assets/vendor/pdf-lib.min.js', '/assets/vendor/pdf.min.js']);
});
for (const accept of ['application/pdf', '.pdf,image/*']) {
  test(`PDF-capable input ${accept} retains renderer prewarming`, () => {
    const a = app({ accept, needsPages: true }); a.intent('focus');
    assert.deepEqual(a.requested, ['/assets/vendor/pdf-lib.min.js', '/assets/vendor/pdf.min.js']);
  });
}
test('repeated user intents do not duplicate in-flight library requests', () => {
  const a = app(splitTool);
  for (const type of ['mouseenter', 'focus', 'touchstart']) a.intent(type);
  a.dragFile();
  assert.deepEqual(a.requested, ['/assets/vendor/pdf-lib.min.js', '/assets/vendor/pdf.min.js']);
});
test('explicit renderer demand remains available after image-only prewarming', () => {
  const a = app(imageTool); a.intent('focus'); a.ensurePdfjs();
  assert.deepEqual(a.requested, ['/assets/vendor/pdf-lib.min.js', '/assets/vendor/pdf.min.js']);
});
