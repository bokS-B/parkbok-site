const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/tool-ads.js'), 'utf8');
const page = 'https://parkbok.com/pdf/compress/ko/';
const client = 'ca-pub-1415309581345613';
const slot = '5292267734';

function consent(storage, userData, personalization) {
  return {
    adStoragePurposeConsentStatus: storage,
    adUserDataPurposeConsentStatus: userData,
    adPersonalizationPurposeConsentStatus: personalization
  };
}

function element() {
  const listeners = new Map();
  return {
    children: [],
    style: {},
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, callback) { listeners.set(name, callback); },
    appendChild(child) { this.children.push(child); },
    fire(name) { listeners.get(name)(); }
  };
}

function setup({ url = page, internal = null, storageBlocked = false, adSlot = slot, pagePath = '/pdf/compress/ko/', embedded = false, sectionCount = 1, unitCount = 1 } = {}) {
  const head = element();
  const body = element();
  const footer = element();
  const unit = { dataset: { adClient: client, adSlot } };
  const section = {
    id: 'pb-tool-ad',
    hidden: true,
    dataset: { pagePath },
    style: { cssText: 'margin-block: 2.5rem;' },
    querySelectorAll(selector) { return selector === 'ins.adsbygoogle' ? Array(unitCount).fill(unit) : []; }
  };
  const document = {
    head,
    body,
    createElement: element,
    getElementById(id) { return [section, ...head.children, ...footer.children].find(node => node.id === id); },
    querySelector(selector) { return selector === '.foot-links' ? footer : null; },
    querySelectorAll(selector) { return selector === '#pb-tool-ad' ? Array(sectionCount).fill(section) : []; }
  };
  const localStorage = {
    getItem(key) {
      if (storageBlocked) throw new Error('storage blocked');
      if (key === 'pb_internal') return internal;
      return 'granted';
    }
  };
  let values;
  let reportTcf;
  let revocations = 0;
  const queuedPauses = [];
  const ads = [];
  ads.push = function (entry) {
    queuedPauses.push(this.pauseAdRequests);
    return Array.prototype.push.call(this, entry);
  };
  const window = {
    adsbygoogle: ads,
    frames: {},
    __tcfapi(command, version, callback) {
      assert.equal(command, 'addEventListener');
      assert.equal(version, 2);
      reportTcf = callback;
    },
    googlefc: {
      callbackQueue: [],
      getGoogleConsentModeValues() { return values; },
      showRevocationMessage() {
        assert.equal(window.adsbygoogle.pauseAdRequests, 1);
        revocations++;
      }
    }
  };
  window.top = embedded ? {} : window;
  const timers = [];
  const context = { window, document, location: new URL(url), URLSearchParams, localStorage,
    setTimeout(callback) { timers.push(callback); } };
  vm.runInNewContext(source, context);
  function signal(key) {
    for (const entry of [...window.googlefc.callbackQueue]) entry[key]?.();
  }
  return {
    context, window, section, scripts: head.children, loader: head.children[0], footer, queuedPauses, body,
    runTimers() { for (const callback of timers.splice(0)) callback(); },
    signal, setConsent(next) { values = next; },
    reportTcf(...args) { reportTcf(...args); },
    get revocations() { return revocations; }
  };
}

function assertPaused(app) {
  assert.ok(app.section.hidden || app.section.style.visibility === 'hidden');
  assert.equal(app.window.adsbygoogle.pauseAdRequests, 1);
  assert.deepEqual(app.queuedPauses, [1]);
}

test('uses the official loader only for the exact production page and ad unit', () => {
  for (const url of [page.replace('https:', 'http:'), page.replace('parkbok.com', 'www.parkbok.com'),
    page.replace('/ko/', '/en/'), page.replace('/ko/', '/ko/index.html'), 'http://localhost:8818/pdf/compress/ko/']) {
    assert.equal(setup({ url }).scripts.length, 0);
  }
  assert.equal(setup({ adSlot: 'other-slot' }).scripts.length, 0);
  const app = setup();
  assert.equal(app.loader.src, 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + client);
  assert.equal(app.loader.async, true);
  assert.equal(app.loader.crossOrigin, 'anonymous');
  vm.runInNewContext(source, app.context);
  assert.equal(app.scripts.length, 1);
  assertPaused(app);
});

test('generated ads appear once below help on selected Korean tools and stay off protected pages', () => {
  const placements = [
    ['/pdf/compress/ko/', '5292267734'],
    ['/pdf/merge/ko/', '4454662935'],
    ['/image/image-compress/ko/', '4454662935'],
    ['/image/png-to-jpg/ko/', '4454662935']
  ];
  function html(route) {
    return fs.readFileSync(path.join(__dirname, '..', route.slice(1), 'index.html'), 'utf8');
  }
  for (const [route, adSlot] of placements) {
    const markup = html(route);
    assert.match(markup, /<\/details>\s*<section class="pb-tool-ad"/);
    assert.equal(markup.match(/data-ad-slot=/g)?.length, 1);
    assert.ok(markup.includes('data-ad-slot="' + adSlot + '"'));
    assert.ok(markup.includes('data-page-path="' + route + '"'));
    assert.match(markup, /<main[^>]+ google-side-rail-overlap="false">/);
    assert.match(markup, /<script src="\/assets\/tool-ads\.js\?v=[\da-f]{10}" defer>/);
    assertPaused(setup({ url: 'https://parkbok.com' + route, pagePath: route, adSlot }));
  }
  for (const route of ['/', '/color/palette/ko/', '/pdf/merge/', '/pdf/split/ko/', '/image/image-resize/ko/']) {
    assert.doesNotMatch(html(route), /data-ad-slot=|\/assets\/tool-ads\.js/);
  }
});

test('queues one slot while paused and resumes only after the loader and CMP are ready', () => {
  for (const values of [consent(1, 1, 1), consent(3, 3, 3)]) {
    const app = setup();
    assertPaused(app);
    assert.equal(app.section.hidden, false);
    assert.equal(app.section.style.maxHeight, '0');
    app.setConsent(values);
    app.signal('CONSENT_API_READY');
    app.reportTcf({ gdprApplies: values.adStoragePurposeConsentStatus === 1, eventStatus: 'tcloaded' }, true);
    const ready = () => app.signal('CONSENT_MODE_DATA_READY');
    const load = () => app.loader.fire('load');
    const events = values.adStoragePurposeConsentStatus === 1 ? [ready, load] : [load, ready];
    events[0]();
    assertPaused(app);
    events[1]();
    ready();
    assert.equal(app.section.hidden, false);
    assert.equal(app.window.adsbygoogle.pauseAdRequests, 0);
    assert.equal(app.window.adsbygoogle.length, 1);
    assert.deepEqual(app.queuedPauses, [1]);
  }
});

test('blocks advertising for unknown, incomplete, denied or unconfigured purposes', () => {
  for (const values of [undefined, {}, consent(0, 1, 1), consent(1, 2, 1), consent(1, 1, 2),
    consent(1, 1, 4), consent(1, 1, '1'), consent(3, 3, 3)]) {
    const app = setup();
    app.setConsent(values);
    app.signal('CONSENT_API_READY');
    app.reportTcf({ gdprApplies: true, eventStatus: 'tcloaded' }, true);
    app.loader.fire('load');
    app.signal('CONSENT_MODE_DATA_READY');
    assertPaused(app);
  }
});

test('blocks internal visits and external forced CMP URLs, with a paused internal CMP test exception', () => {
  for (const options of [{ url: page + '?pb_internal=1' }, { internal: '1' }, { storageBlocked: true },
    { url: page + '?fc=alwaysshow&fctype=gdpr' }]) {
    assert.equal(setup(options).scripts.length, 0);
  }
  for (const options of [{ url: page + '?fc=alwaysshow&fctype=gdpr&pb_internal=1' },
    { url: page + '?pb_ad_probe=1', internal: '1' },
    { url: page + '?fc=alwaysshow&fctype=gdpr', internal: '1' }]) {
    const app = setup(options);
    app.setConsent(consent(1, 1, 1));
    app.loader.fire('load');
    app.signal('CONSENT_MODE_DATA_READY');
    assert.equal(app.section.dataset.pbAdCheck, 'blocked');
    app.signal('CONSENT_API_READY');
    app.reportTcf({ gdprApplies: true, eventStatus: 'tcloaded' }, true);
    assert.equal(app.section.dataset.pbAdCheck, 'eligible');
    assertPaused(app);
  }
});

test('keeps ads paused when the loader fails', () => {
  const app = setup();
  app.setConsent(consent(1, 1, 1));
  app.loader.fire('error');
  app.signal('CONSENT_MODE_DATA_READY');
  assertPaused(app);
});

test('starts the account CMP while keeping the single slot paused if AdSense did not start it', () => {
  const native = setup();
  native.signal('CONSENT_API_READY');
  native.loader.fire('load');
  native.runTimers();
  assert.equal(native.scripts.length, 1);

  for (const [url, suffix] of [[page, ''], [page + '?fc=alwaysshow&fctype=gdpr', '&fc=alwaysshow&fctype=gdpr']]) {
    const app = setup({ url, internal: suffix ? '1' : null });
    const tcfApi = app.window.__tcfapi;
    if (suffix) delete app.window.__tcfapi;
    else app.window.__tcfapi = () => {}; // AdSense installed a stub, but the CMP did not load.
    app.loader.fire('load');
    assert.equal(app.scripts.length, 1);
    app.runTimers();
    assert.equal(app.scripts.length, 2);
    assert.equal(app.scripts[1].src, 'https://fundingchoicesmessages.google.com/i/pub-1415309581345613?ers=1' + suffix);
    assert.equal(app.body.children.length, 1);
    assert.equal(app.body.children[0].name, 'googlefcPresent');
    assert.equal(app.body.children[0].hidden, true);
    assertPaused(app);

    app.window.__tcfapi = tcfApi;
    app.signal('CONSENT_API_READY');
    app.reportTcf({ gdprApplies: false, eventStatus: 'tcloaded' }, true);
    app.setConsent(consent(3, 3, 3));
    app.signal('CONSENT_MODE_DATA_READY');
    assert.equal(app.window.adsbygoogle.pauseAdRequests, suffix ? 1 : 0);
    assert.deepEqual(app.queuedPauses, [1]);
  }
});

test('offers a GDPR privacy control and pauses ads before reopening the CMP', () => {
  const app = setup();
  app.signal('CONSENT_API_READY');
  app.signal('CONSENT_API_READY');
  assert.equal(app.footer.children.length, 1);
  const [button] = app.footer.children;
  assert.equal(button.hidden, true);
  assert.equal(button.style.display, 'none');
  app.reportTcf({ gdprApplies: false }, true);
  assert.equal(button.hidden, true);
  assert.equal(button.style.display, 'none');
  app.reportTcf({ gdprApplies: true, eventStatus: 'tcloaded' }, true);
  assert.equal(button.hidden, false);
  assert.equal(button.style.display, '');

  app.setConsent(consent(1, 1, 1));
  app.loader.fire('load');
  app.signal('CONSENT_MODE_DATA_READY');
  button.fire('click');
  assert.equal(app.window.adsbygoogle.pauseAdRequests, 1);
  assert.equal(app.section.hidden, true);
  app.signal('CONSENT_API_READY');
  assert.equal(app.revocations, 1);
  app.signal('CONSENT_MODE_DATA_READY');
  assert.equal(app.window.adsbygoogle.length, 1);
  assert.equal(app.window.adsbygoogle.pauseAdRequests, 1);
});

test('stops an existing request state on consent denial or CMP reopening', () => {
  for (const change of [
    app => {
      app.setConsent(consent(1, 2, 1));
      app.signal('CONSENT_MODE_DATA_READY');
    },
    app => {
      app.setConsent(consent(1, 2, 1));
      app.reportTcf({ gdprApplies: true, eventStatus: 'useractioncomplete' }, true);
    },
    app => app.reportTcf({ gdprApplies: true, eventStatus: 'cmpuishown' }, true)
  ]) {
    const app = setup();
    app.signal('CONSENT_API_READY');
    app.reportTcf({ gdprApplies: true, eventStatus: 'tcloaded' }, true);
    app.setConsent(consent(1, 1, 1));
    app.loader.fire('load');
    app.signal('CONSENT_MODE_DATA_READY');
    assert.equal(app.window.adsbygoogle.pauseAdRequests, 0);
    change(app);
    app.setConsent(consent(1, 1, 1));
    app.signal('CONSENT_MODE_DATA_READY');
    assert.equal(app.window.adsbygoogle.length, 1);
    assert.equal(app.window.adsbygoogle.pauseAdRequests, 1);
    assert.equal(app.section.hidden, true);
  }
});


test('only matching approved paths, a top-level window and exactly one valid unit can load', () => {
  const imageUrl = 'https://parkbok.com/image/image-compress/ko/';
  assert.equal(setup({ url:imageUrl, pagePath:'/image/image-compress/ko/', adSlot:'1234567890' }).scripts.length, 1);
  for (const cfg of [
    {url:imageUrl}, {url:'https://parkbok.com/other/', pagePath:'/other/'},
    {pagePath:'/image/image-compress/ko/'}, {embedded:true}, {sectionCount:0}, {sectionCount:2},
    {unitCount:0}, {unitCount:2}, {adSlot:'123456789'}, {adSlot:'12345678901'}, {adSlot:'123456789x'}
  ]) assert.equal(setup(cfg).scripts.length, 0, JSON.stringify(cfg));
});
