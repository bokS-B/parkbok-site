const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/pdf-compress-ads.js'), 'utf8');
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
    addEventListener(name, callback) { listeners.set(name, callback); },
    appendChild(child) { this.children.push(child); },
    fire(name) { listeners.get(name)(); }
  };
}

function setup({ url = page, internal = null, storageBlocked = false, adSlot = slot } = {}) {
  const head = element();
  const footer = element();
  const unit = { dataset: { adClient: client, adSlot } };
  const section = {
    id: 'pb-pdf-compress-ad',
    hidden: true,
    querySelector(selector) { return selector === 'ins.adsbygoogle' ? unit : null; }
  };
  const document = {
    head,
    createElement: element,
    getElementById(id) { return [section, ...head.children, ...footer.children].find(node => node.id === id); },
    querySelector(selector) { return selector === '.foot-links' ? footer : null; }
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
  const window = {
    adsbygoogle: [],
    __tcfapi(command, version, callback) {
      assert.equal(command, 'addEventListener');
      assert.equal(version, 0);
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
  const context = { window, document, location: new URL(url), URLSearchParams, localStorage };
  vm.runInNewContext(source, context);
  function signal(key) {
    for (const entry of [...window.googlefc.callbackQueue]) entry[key]?.();
  }
  return {
    context, window, section, scripts: head.children, loader: head.children[0], footer,
    signal, setConsent(next) { values = next; },
    reportTcf(...args) { reportTcf(...args); },
    get revocations() { return revocations; }
  };
}

function assertPaused(app) {
  assert.equal(app.section.hidden, true);
  assert.equal(app.window.adsbygoogle.length, 0);
  if (app.loader) assert.equal(app.window.adsbygoogle.pauseAdRequests, 1);
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

test('waits for the loader and CMP and enqueues one request for allowed advertising', () => {
  for (const values of [consent(1, 1, 1), consent(3, 3, 3)]) {
    const app = setup();
    app.setConsent(values);
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
  }
});

test('blocks advertising for unknown, incomplete, denied or unconfigured purposes', () => {
  for (const values of [undefined, {}, consent(0, 1, 1), consent(1, 2, 1), consent(1, 1, 2),
    consent(1, 1, 4), consent(1, 1, '1')]) {
    const app = setup();
    app.setConsent(values);
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
    { url: page + '?fc=alwaysshow&fctype=gdpr', internal: '1' }]) {
    const app = setup(options);
    app.setConsent(consent(1, 1, 1));
    app.loader.fire('load');
    app.signal('CONSENT_MODE_DATA_READY');
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

test('offers a GDPR privacy control and pauses ads before reopening the CMP', () => {
  const app = setup();
  app.signal('CONSENT_API_READY');
  app.signal('CONSENT_API_READY');
  assert.equal(app.footer.children.length, 1);
  const [button] = app.footer.children;
  assert.equal(button.hidden, true);
  app.reportTcf({ gdprApplies: false }, true);
  assert.equal(button.hidden, true);
  app.reportTcf({ gdprApplies: true, eventStatus: 'tcloaded' }, true);
  assert.equal(button.hidden, false);

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
