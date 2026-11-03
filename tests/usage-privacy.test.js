const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require.resolve('../assets/usage-privacy.js'), 'utf8');

function browser({ host = 'parkbok.com', choice, blocked = false, query = '' } = {}) {
  const elements = [], storage = new Map(), cookieWrites = [];
  if (choice) storage.set('pb_statistics_v1', JSON.stringify(choice));
  const element = tag => {
    const e = { tag, children: [], hidden: false, style: { setProperty() {}, removeProperty() {} },
      dataset: {}, offsetHeight: 200, setAttribute(k, v) { this[k] = v; }, focus() {},
      appendChild(child) { this.children.push(child); elements.push(child); },
      querySelector(selector) { return this.children.flatMap(c => [c, ...c.children]).find(c => c.tag === selector); }
    }; return e;
  };
  const foot = element('nav'), doc = { documentElement: { lang: 'en' }, referrer: 'https://www.google.com/search?q=private-referrer',
    currentScript: { getAttribute: () => 'G-377MXFWS51' }, head: element('head'), body: element('body'),
    querySelector: () => foot, createElement: element
  };
  Object.defineProperty(doc, 'cookie', { get: () => '_ga=old; _ga_377MXFWS51=old; essential=keep', set: v => cookieWrites.push(v) });
  const window = { addEventListener() {} };
  const localStorage = { getItem(k) { if (blocked) throw Error('blocked'); return storage.get(k) || null; },
    setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, v); } };
  const location = new URL('https://' + host + '/image/image-compress/' + query);
  vm.runInNewContext(code, { window, document: doc, localStorage, location, history: { replaceState() {} }, URL, Date, encodeURIComponent });
  return { window, elements, storage, cookieWrites, doc,
    select(choice) { const b = elements.find(e => e.dataset.choice === choice); assert.ok(b); b.onclick(); },
    open() { elements.find(e => e.className === 'pb-statistics-settings').onclick(); },
    tags() { return elements.filter(e => e.tag === 'script'); }
  };
}
test('first visit and refusal create no Google tag or analytics queue', () => {
  const b = browser(); assert.equal(b.tags().length, 0); assert.equal(b.window.gtag, undefined);
  b.select('deny'); assert.equal(b.tags().length, 0); assert.equal(JSON.parse(b.storage.get('pb_statistics_v1')).choice, 'deny');
});
test('opt-in excludes query, fragment and referrer search from all event defaults', () => {
  const b = browser({ query: '?email=private@example.invalid#sensitive-input' }); b.select('allow');
  assert.equal(b.tags().length, 1);
  const config = b.window.dataLayer.find(e => e[0] === 'config')[2];
  assert.equal(config.page_location, 'https://parkbok.com/image/image-compress/');
  assert.equal(config.page_referrer, 'https://www.google.com/');
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
});
test('withdrawal disables GA immediately, removes only GA cookies, drops later queued tool events', () => {
  const b = browser(); b.select('allow'); b.open(); b.select('deny');
  assert.equal(b.window['ga-disable-G-377MXFWS51'], true);
  assert.ok(b.cookieWrites.length >= 3);
  assert.ok(b.cookieWrites.every(v => v.startsWith('_ga') && v.includes('Max-Age=0')));
  const n = b.window.dataLayer.length; b.window.gtag('event', 'tool_download'); assert.equal(b.window.dataLayer.length, n);
});
test('stored refusal, expired/future choices and unavailable storage fail closed', () => {
  for (const opts of [{ choice: { choice: 'deny', at: Date.now() } }, { choice: { choice: 'allow', at: 0 } },
    { choice: { choice: 'allow', at: Date.now() + 60000 } }, { blocked: true }]) assert.equal(browser(opts).tags().length, 0);
});
test('stored opt-in loads once on production, never on local or preview hosts', () => {
  const choice = { choice: 'allow', at: Date.now() };
  assert.equal(browser({ choice }).tags().length, 1);
  for (const host of ['localhost', '127.0.0.1', 'preview.github.io', 'parkbok.com.example.invalid']) assert.equal(browser({ host, choice }).tags().length, 0);
});
test('no ad loader remains in the common shell or HEX generator', () => {
  const shell = require('../tools/shell');
  assert.match(shell.ADSENSE, /google-adsense-account/);
  assert.doesNotMatch(shell.head(), /adsbygoogle\.js|googletagmanager\.com/);
  assert.match(shell.head(), /usage-privacy\.js/);
});
