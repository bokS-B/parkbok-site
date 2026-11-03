const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require.resolve('../assets/usage-privacy.js'), 'utf8');

function browser({ host = 'parkbok.com', choice, blocked = false, query = '', region = false } = {}) {
  const elements = [], storage = new Map(), cookieWrites = [], events = {};
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
  const window = { addEventListener(k, f) { events[k] = f; } };
  const localStorage = { getItem(k) { if (blocked) throw Error('blocked'); return storage.get(k) || null; },
    setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, v); } };
  const location = new URL('https://' + host + '/image/image-compress/' + query);
  vm.runInNewContext(code, { window, document: doc, localStorage, location, history: { replaceState() {} }, URL, Date, Math, encodeURIComponent, setTimeout: () => 1, clearTimeout() {} });
  let listener, mode = 0;
  const ready = new Set();
  if (window.googlefc) {
    const queue = window.googlefc.callbackQueue;
    window.googlefc.getGoogleConsentModeValues = () => ({ analyticsStoragePurposeConsentStatus: mode });
    window.googlefc.callbackQueue = { push(item) { queue.push(item); for (const k of Object.keys(item)) if (ready.has(k)) item[k](); } };
    window.__tcfapi = (command, version, fn) => { assert.equal(command, 'addEventListener'); assert.equal(version, 2); listener = fn; };
    ready.add('CONSENT_API_READY'); queue.find(i => i.CONSENT_API_READY).CONSENT_API_READY();
    if (region === false) listener({ gdprApplies: false, eventStatus: 'tcloaded', cmpStatus: 'loaded' }, true);
    window.googlefc.readyMode = value => { mode = value; ready.add('CONSENT_MODE_DATA_READY'); for (const i of queue.slice()) if (i.CONSENT_MODE_DATA_READY) i.CONSENT_MODE_DATA_READY(); };
  }
  return { window, elements, storage, cookieWrites, doc,
    tcf(data, success = true) { listener(data, success); },
    mode(value) { window.googlefc.readyMode(value); },
    storageEvent(key) { events.storage({ key }); },
    select(choice) { const b = elements.find(e => e.dataset.choice === choice); assert.ok(b); b.onclick(); },
    open() { elements.find(e => e.className === 'pb-statistics-settings').onclick(); },
    tags() { return elements.filter(e => e.id === 'pb-statistics-tag'); },
    bootstrap() { return elements.filter(e => e.id === 'pb-consent-bootstrap'); }
  };
}
test('outside Europe first visit and refusal create no GA tag or analytics events', () => {
  const b = browser(); assert.equal(b.tags().length, 0); assert.equal(b.bootstrap().length, 1);
  assert.equal(b.window.dataLayer.filter(e => e[0] !== 'consent').length, 0);
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
test('no ad loader or ad placement is introduced by the CMP bootstrap', () => {
  const shell = require('../tools/shell');
  assert.match(shell.ADSENSE, /google-adsense-account/);
  assert.doesNotMatch(shell.head(), /adsbygoogle\.js|googletagmanager\.com/);
  assert.match(shell.head(), /usage-privacy\.js/);
  assert.doesNotMatch(code, /adsbygoogle\.js|doubleclick\.net|pagead2/);
  assert.match(code, /pauseAdRequests = 1/);
  assert.match(code, /fundingchoicesmessages\.google\.com/);
});

test('old analytics opt-in cannot bypass a pending, failed, or European CMP', () => {
  const b = browser({ choice: { choice: 'allow', at: Date.now() }, region: 'pending' });
  assert.equal(b.tags().length, 0);
  b.tcf({ gdprApplies: true, cmpStatus: 'loaded', eventStatus: 'cmpuishown' });
  b.mode(0); assert.equal(b.tags().length, 0);
  assert.ok(!b.elements.some(e => e.id === 'pb-statistics' && !e.hidden));
  b.tcf(null, false); assert.equal(b.tags().length, 0);
});

test('European analytics requires both the Google mode grant and TCF purpose 1', () => {
  const b = browser({ region: true });
  b.tcf({ gdprApplies: true, cmpStatus: 'loaded', eventStatus: 'tcloaded', purpose: { consents: { 1: true } } });
  for (const status of [0, 2, 3, 4, undefined]) { b.mode(status); assert.equal(b.tags().length, 0); }
  b.mode(1); assert.equal(b.tags().length, 1);
  b.tcf({ gdprApplies: true, cmpStatus: 'loaded', eventStatus: 'useractioncomplete', purpose: { consents: { 1: false } } });
  assert.equal(b.window['ga-disable-G-377MXFWS51'], true);
  assert.ok(b.cookieWrites.length > 0);
});

test('CMP reopen stops analytics before displaying the official revocation message', () => {
  const b = browser({ region: true });
  b.tcf({ gdprApplies: true, cmpStatus: 'loaded', eventStatus: 'tcloaded', purpose: { consents: { 1: true } } }); b.mode(1);
  let reopened = false;
  b.window.googlefc.showRevocationMessage = () => { reopened = true; assert.equal(b.window['ga-disable-G-377MXFWS51'], true); };
  b.open(); assert.equal(reopened, true);
  assert.ok(b.storage.has('pb_cmp_change_v1'));
  assert.ok(!b.elements.some(e => e.id === 'pb-statistics' && !e.hidden));
});

test('another tab cannot restart EU analytics from a stale CMP or a local opt-in', () => {
  const b = browser({ region: true });
  b.tcf({ gdprApplies: true, cmpStatus: 'loaded', eventStatus: 'tcloaded', purpose: { consents: { 1: true } } }); b.mode(1);
  b.storageEvent('pb_cmp_change_v1'); b.mode(1);
  assert.equal(b.window['ga-disable-G-377MXFWS51'], true);
  b.storage.set('pb_statistics_v1', JSON.stringify({ choice: 'allow', at: Date.now() })); b.storageEvent('pb_statistics_v1');
  assert.equal(b.window['ga-disable-G-377MXFWS51'], true);
});

test('a throwing Google mode API disables already-running EU analytics', () => {
  const b = browser({ region: true });
  const tc = { gdprApplies: true, cmpStatus: 'loaded', eventStatus: 'tcloaded', purpose: { consents: { 1: true } } };
  b.tcf(tc); b.mode(1);
  b.window.googlefc.getGoogleConsentModeValues = () => { throw Error('CMP unavailable'); };
  b.tcf(tc);
  assert.equal(b.window['ga-disable-G-377MXFWS51'], true);
});
