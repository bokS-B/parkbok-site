const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const shell = require('../tools/shell');
const strings = require('../src/site-strings.json');
const css = fs.readFileSync(path.join(__dirname, '../assets/site.css'), 'utf8');
const hexCss = fs.readFileSync(path.join(__dirname, '../color/src/hex-lite.css'), 'utf8');

function headerBrowser({ lang = 'en', osDark = false, saved, blocked = false, legacy = false, media = true, observe = true } = {}) {
  const html = shell.header({ lang });
  const buttonHtml = html.match(/<button[^>]*id="theme-btn"[^>]*>/)[0];
  const attrs = Object.fromEntries([...buttonHtml.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const rootAttrs = {}, listeners = {}, storage = new Map(), mutations = [], changes = [];
  if (saved !== undefined) storage.set('pb_theme', saved);
  let resizeCount = 0;
  const button = {
    getAttribute: key => attrs[key],
    setAttribute(key, value) { attrs[key] = String(value); },
    addEventListener(key, fn) { listeners[key] = fn; }
  };
  const root = {
    getAttribute: key => rootAttrs[key] ?? null,
    setAttribute(key, value) { rootAttrs[key] = value; mutations.forEach(fn => fn()); },
    removeAttribute(key) { delete rootAttrs[key]; mutations.forEach(fn => fn()); }
  };
  const mql = { matches: osDark };
  if (legacy) mql.addListener = fn => changes.push(fn);
  else mql.addEventListener = (key, fn) => { assert.equal(key, 'change'); changes.push(fn); };
  const window = {
    dispatchEvent(event) { assert.equal(event.type, 'resize'); resizeCount++; },
    matchMedia: media ? query => { assert.equal(query, '(prefers-color-scheme: dark)'); return mql; } : undefined,
    MutationObserver: observe ? class { constructor(fn) { this.fn = fn; } observe(target, opts) { assert.equal(target, root); assert.deepEqual(Array.from(opts.attributeFilter), ['data-theme']); mutations.push(this.fn); } } : undefined
  };
  const localStorage = {
    getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); }
  };
  const context = vm.createContext({ window, document: { documentElement: root, getElementById: () => button, querySelector: () => null }, localStorage, Event: class { constructor(type) { this.type = type; } } });
  vm.runInContext(shell.head().match(/<script>([\s\S]*?)<\/script>/)[1], context);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return {
    attrs, root, storage, html,
    click() { listeners.click(); },
    os(value) { mql.matches = value; changes.forEach(fn => fn()); },
    resizes: () => resizeCount
  };
}

function state(b, dark, lang = 'en') {
  assert.equal(b.attrs['aria-pressed'], String(dark));
  assert.equal(b.attrs['aria-label'], strings[lang][dark ? 'themeToLight' : 'themeToDark']);
  assert.equal(b.attrs.title, b.attrs['aria-label']);
}

for (const lang of shell.langs) test(`${lang}: initial automatic mode and both toggle actions announce the actual state`, () => {
  for (const osDark of [false, true]) {
    const b = headerBrowser({ lang, osDark });
    assert.doesNotMatch(b.html, /\{\{[\w.:]+\}\}/);
    assert.notEqual(strings[lang].themeToLight, strings[lang].themeToDark);
    state(b, osDark, lang);
    b.click(); state(b, !osDark, lang);
    assert.equal(b.root.getAttribute('data-theme'), osDark ? 'light' : 'dark');
    assert.equal(b.storage.get('pb_theme'), osDark ? 'light' : 'dark');
    b.os(!osDark); state(b, !osDark, lang);
    b.click(); state(b, osDark, lang);
    assert.equal(b.resizes(), 2);
  }
});

test('OS changes update automatic mode; saved light/dark override OS without changing their labels', () => {
  const auto = headerBrowser(); state(auto, false); auto.os(true); state(auto, true); auto.os(false); state(auto, false);
  for (const saved of ['light', 'dark']) {
    const b = headerBrowser({ saved, osDark: saved !== 'dark' });
    state(b, saved === 'dark'); b.os(saved === 'dark'); state(b, saved === 'dark');
  }
});

test('blocked or malformed saved theme follows OS and still allows manual switching', () => {
  for (const options of [{ blocked: true }, { saved: 'sepia' }]) {
    const b = headerBrowser({ ...options, osDark: true }); state(b, true);
    assert.equal(b.root.getAttribute('data-theme'), null);
    b.click(); state(b, false); assert.equal(b.root.getAttribute('data-theme'), 'light');
  }
});

test('legacy media API, missing media/observer, and external root changes keep the theme control usable', () => {
  const legacy = headerBrowser({ legacy: true }); legacy.os(true); state(legacy, true);
  const basic = headerBrowser({ media: false, observe: false }); state(basic, false); basic.click(); state(basic, true);
  const external = headerBrowser(); external.root.setAttribute('data-theme', 'dark'); state(external, true);
  external.root.setAttribute('data-theme', 'light'); state(external, false);
  external.os(true); state(external, false); external.root.removeAttribute('data-theme'); state(external, true);
});

const declarations = block => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)].map(m => [m[1], m[2].trim()]));
function darkTokens(source, automatic) {
  const match = source.match(automatic ? /:root:not\(\[data-theme="light"\]\)\{([^}]+)\}/ : /:root\[data-theme="dark"\]\{([^}]+)\}/);
  assert.ok(match, 'missing dark mode token block'); return declarations(match[1]);
}

test('OS/manual dark share charcoal tokens across common and HEX UI, with stable light defaults', () => {
  const manual = darkTokens(css, false), automatic = darkTokens(css, true);
  assert.deepEqual(manual, automatic);
  const hexManual = darkTokens(hexCss, false), hexAuto = darkTokens(hexCss, true);
  assert.deepEqual(hexManual, hexAuto);
  for (const key of ['--bg', '--card', '--ink', '--muted', '--line', '--accent', '--accent-hover', '--accent-active', '--accent-text', '--accent-tint', '--brand', '--control-line', '--focus', '--selection-line', '--drop-line', '--preview-check-a', '--preview-check-b', '--statistics-bg', '--statistics-ink', '--statistics-line', '--statistics-control', '--statistics-hover', '--statistics-muted']) assert.equal(hexManual[key], manual[key], key);
  assert.equal(hexManual['--foot'], manual['--footer-bg']);
  assert.equal(manual['--bg'], '#161719'); assert.equal(manual['--card'], '#202225');
  const light = declarations(css.match(/:root\{([^}]+)\}/)[1]);
  assert.equal(light['--bg'], '#f6f7f9'); assert.equal(light['--card'], '#fff'); assert.equal(light['--accent'], '#2563eb');
  assert.match(css, /:focus-visible\{outline:3px solid var\(--focus\)/);
  assert.match(hexCss, /\.theme-btn:focus-visible\{outline:3px solid var\(--focus\)/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\)\{color-scheme:dark;/);
});

function contrast(a, b) {
  function luminance(hex) {
    hex = hex.slice(1); if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    return [.2126, .7152, .0722].reduce((sum, k, i) => { const n = parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255; return sum + k * (n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); }, 0);
  }
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

test('dark keyboard focus, control boundary and button text remain distinguishable on their common surfaces', () => {
  const t = darkTokens(css, false);
  for (const surface of ['--bg', '--card']) assert.ok(contrast(t['--focus'], t[surface]) >= 3, surface + ' focus');
  assert.ok(contrast(t['--control-line'], t['--card']) >= 3);
  assert.ok(contrast(t['--accent-ink'], t['--accent']) >= 4.5);
});
