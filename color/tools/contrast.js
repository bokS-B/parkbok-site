// 색 대비 검사: 글자색·배경색 두 칸 → 실제 색으로 그린 미리보기 문장 + 대비비 큰 숫자, WCAG AA/AAA(일반·큰 글자) 통과 표시, 서로 바꾸기, 밝기 자동 보정.
// 두 색은 URL 해시(#1a1a1a-ffffff)로 공유한다. 계산은 /color/color.js, 조각은 /color/color-ui.js.
(function(){
  'use strict';
  var C = window.COLOR, U = window.COLOR_UI;
  var app = document.getElementById('app');
  if (!C || !U || !app) return;
  var t = U.t, el = U.el;
  var fg = '#1a1a2e', bg = '#f4f1ea';
  // [등급, 글자 크기 키, 기준 비율]
  var CHECKS = [['AA', 'normalText', 4.5], ['AA', 'largeText', 3], ['AAA', 'normalText', 7], ['AAA', 'largeText', 4.5]];

  // ---------- 이 도구만 쓰는 스타일 (토큰은 site.css 변수) ----------
  var style = el('style');
  style.textContent = [
    '.k-top{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:stretch}',
    '.k-preview{display:flex;flex-direction:column;justify-content:center;gap:10px;min-height:320px;padding:28px 30px;border:1px solid var(--line);border-radius:var(--r-card);transition:background .15s,color .15s}',
    '.k-preview .k-h{font-size:30px;line-height:1.2;font-weight:var(--fw-bold);margin:0}',
    '.k-preview .k-p{font-size:16px;line-height:1.6;margin:0}',
    '.k-preview .k-ratio{display:flex;align-items:baseline;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid currentColor}',
    '.k-preview .k-num{font-size:52px;line-height:1;font-weight:var(--fw-bold);font-variant-numeric:tabular-nums;letter-spacing:-.01em}',
    '.k-preview .k-of{font-size:var(--fs-small);opacity:.8}',
    '.k-lab{font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--muted);letter-spacing:.04em;margin:4px 0 -4px}',
    '.k-badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '.k-badge{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:var(--r-btn);background:var(--bg)}',
    '.k-badge .k-lv{display:flex;flex-direction:column;min-width:0}.k-badge .k-lv b{font-size:15px}.k-badge .k-lv span{font-size:var(--fs-caption);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.k-badge .k-st{flex:none;font-size:var(--fs-caption);font-weight:var(--fw-semibold);padding:4px 10px;border-radius:var(--r-pill);color:#fff;background:var(--err)}',
    '.k-badge.pass .k-st{background:var(--ok)}',
    '.k-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0}',
    '@media (max-width:767.98px){.k-top{grid-template-columns:minmax(0,1fr)}.k-preview{min-height:220px;padding:22px 20px}.k-preview .k-h{font-size:24px}.k-preview .k-num{font-size:44px}}'
  ].join('\n');
  document.head.appendChild(style);

  // ---------- 해시 ----------
  function fromHash(){ var m = /^#([0-9a-f]{6})-([0-9a-f]{6})$/i.exec(location.hash || ''); return m ? ['#' + m[1].toLowerCase(), '#' + m[2].toLowerCase()] : null; }
  function toHash(){ var h = '#' + fg.slice(1) + '-' + bg.slice(1); if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } } }

  // ---------- 미리보기 ----------
  var top = el('div', 'k-top');
  var prev = el('div', 'k-preview');
  var ph = el('p', 'k-h', t('sampleTitle')), pp = el('p', 'k-p', t('sampleText'));
  var ratioBox = el('div', 'k-ratio'), num = el('span', 'k-num'), of = el('span', 'k-of', ': 1');
  ratioBox.appendChild(num); ratioBox.appendChild(of);
  ratioBox.setAttribute('aria-label', t('ratio'));
  prev.appendChild(ph); prev.appendChild(pp); prev.appendChild(ratioBox);

  // ---------- 입력 ----------
  var panel = el('div', 'c-panel');
  function colorField(labelKey, id){
    var lab = el('label', 'k-lab', t(labelKey)); lab.htmlFor = id;
    var f = el('div', 'c-field');
    var pick = el('input', 'c-pick'); pick.type = 'color'; pick.setAttribute('aria-label', t('pick') + ' ' + t(labelKey));
    var txt = el('input'); txt.type = 'text'; txt.id = id; txt.autocomplete = 'off'; txt.spellcheck = false; txt.placeholder = t('placeholder');
    f.appendChild(pick); f.appendChild(txt);
    return { lab: lab, el: f, pick: pick, txt: txt };
  }
  var F = colorField('textColor', 'kfg'), B = colorField('bgColor', 'kbg');
  var actions = el('div', 'k-actions');
  var btnSwap = el('button', 'btn ghost', '⇅ ' + t('swap')), btnFix = el('button', 'btn', t('fix'));
  btnSwap.type = btnFix.type = 'button';
  actions.appendChild(btnFix); actions.appendChild(btnSwap);
  var rows = el('div', 'vrows');
  var R = { fg: U.valueRow(t('textColor'), '', { swatch: true }), bg: U.valueRow(t('bgColor'), '', { swatch: true }) };
  rows.appendChild(R.fg.el); rows.appendChild(R.bg.el);
  var badges = el('div', 'k-badges'), BD = [];
  CHECKS.forEach(function(ck){
    var b = el('div', 'k-badge'), lv = el('div', 'k-lv'), st = el('span', 'k-st');
    lv.appendChild(el('b', null, ck[0] + ' · ' + ck[2] + ':1')); lv.appendChild(el('span', null, t(ck[1])));
    b.appendChild(lv); b.appendChild(st);
    badges.appendChild(b); BD.push({ el: b, st: st, min: ck[2] });
  });
  panel.appendChild(F.lab); panel.appendChild(F.el); panel.appendChild(B.lab); panel.appendChild(B.el);
  panel.appendChild(actions); panel.appendChild(badges); panel.appendChild(rows);
  top.appendChild(prev); top.appendChild(panel);
  app.appendChild(top);

  // ---------- 갱신 ----------
  function render(src){
    var r = C.contrast(fg, bg);
    prev.style.background = bg; prev.style.color = fg;
    num.textContent = r.toFixed(2);
    BD.forEach(function(b){ var ok = r >= b.min; b.el.className = 'k-badge ' + (ok ? 'pass' : 'fail'); b.st.textContent = ok ? t('pass') : t('fail'); });
    F.pick.value = fg; B.pick.value = bg;
    if (src !== 'fg') { F.txt.value = fg; F.txt.classList.remove('err'); }
    if (src !== 'bg') { B.txt.value = bg; B.txt.classList.remove('err'); }
    R.fg.set(fg, fg); R.bg.set(bg, bg);
    toHash();
  }
  function bind(f, key){
    f.pick.addEventListener('input', function(){ var h = C.parse(f.pick.value); if (!h) return; if (key === 'fg') fg = h; else bg = h; render(); });
    f.txt.addEventListener('input', function(){ var h = C.parse(f.txt.value); if (h) { if (key === 'fg') fg = h; else bg = h; render(key); } else f.txt.classList.add('err'); });
    f.txt.addEventListener('change', function(){ if (!C.parse(f.txt.value)) { f.txt.value = key === 'fg' ? fg : bg; f.txt.classList.remove('err'); } });
    f.txt.addEventListener('focus', function(){ f.txt.select(); });
  }
  bind(F, 'fg'); bind(B, 'bg');

  // ---------- 밝기 자동 보정: 글자색 밝기만 옮겨 다음 등급(4.5 → 7)을 넘긴다 ----------
  function reach(target){
    var h = C.hexToHsl(fg), dir = C.textOn(bg) === '#ffffff' ? 1 : -1;
    function walk(d){ for (var l = h.l; l >= 0 && l <= 100; l += d) { var x = C.hslToHex({ h: h.h, s: h.s, l: l }); if (C.contrast(x, bg) >= target) return x; } return null; }
    return walk(dir) || walk(-dir);
  }
  function fix(){
    var r = C.contrast(fg, bg), target = r < 4.5 ? 4.5 : r < 7 ? 7 : 0;
    if (!target) { U.toast(t('alreadyPass')); return; }
    var x = reach(target);
    if (!x) { U.toast(t('fixNone')); return; }
    fg = x; render();
    U.toast(t('fixed', { level: target === 7 ? 'AAA' : 'AA' }));
  }

  // ---------- 이벤트 ----------
  btnSwap.addEventListener('click', function(){ var x = fg; fg = bg; bg = x; render(); });
  btnFix.addEventListener('click', fix);
  window.addEventListener('hashchange', function(){ var p = fromHash(); if (p && (p[0] !== fg || p[1] !== bg)) { fg = p[0]; bg = p[1]; render(); } });

  var init = fromHash();
  if (init) { fg = init[0]; bg = init[1]; }
  render();
})();
