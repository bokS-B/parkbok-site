// 색상 변환기: 입력 한 칸(아무 표기) + 네이티브 색 선택 → 미리보기, 값 행(HEX·RGB·HSL·HSV·CMYK·이름), 밝기 단계, 배색, 글자 대비.
// 현재 색은 URL 해시(#ff5733)로 공유한다. 계산은 /color/color.js, 조각은 /color/color-ui.js.
(function(){
  'use strict';
  var C = window.COLOR, U = window.COLOR_UI;
  var app = document.getElementById('app');
  if (!C || !U || !app) return;
  var t = U.t, el = U.el;
  var DEFAULT = '#ff5733', STEPS = 10;
  var cur = DEFAULT;

  // ---------- 해시 ----------
  function fromHash(){ var h = decodeURIComponent(location.hash.replace(/^#/, '')); return h ? C.parse(h) : null; }
  function toHash(hex){ var h = '#' + hex.slice(1); if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } } }

  // ---------- 미리보기 + 입력 ----------
  var top = el('div', 'c-top');
  var prev = el('button', 'c-preview'); prev.type = 'button'; prev.setAttribute('aria-label', t('copy') + ' HEX');
  var prevHex = el('div', 'c-hex'), prevName = el('div', 'c-nm'), prevCopy = el('span', 'c-copy', t('copy'));
  prev.appendChild(prevHex); prev.appendChild(prevName); prev.appendChild(prevCopy);
  prev.addEventListener('click', function(){ U.copy(cur); });

  var panel = el('div', 'c-panel');
  var field = el('div', 'c-field');
  var inp = el('input'); inp.type = 'text'; inp.id = 'cin'; inp.placeholder = t('placeholder'); inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', t('hex') + ' / ' + t('rgb') + ' / ' + t('hsl'));
  var pick = el('input', 'c-pick'); pick.type = 'color'; pick.id = 'cpick'; pick.setAttribute('aria-label', t('pick')); pick.title = t('pick');
  field.appendChild(inp); field.appendChild(pick);
  var row = el('div', 'row');
  var btnRand = el('button', 'btn ghost sm', t('randomize')); btnRand.type = 'button';
  var btnCopy = el('button', 'btn sm', t('copy') + ' HEX'); btnCopy.type = 'button';
  row.appendChild(btnRand); row.appendChild(btnCopy);
  var status = el('p', 'status'); status.id = 'cstatus';
  var rows = el('div', 'vrows');
  var R = {
    hex: U.valueRow(t('hex'), ''), rgb: U.valueRow(t('rgb'), ''), hsl: U.valueRow(t('hsl'), ''), hsv: U.valueRow(t('hsv'), ''), cmyk: U.valueRow(t('cmyk'), ''), name: U.valueRow(t('cssName'), '')
  };
  ['hex', 'rgb', 'hsl', 'hsv', 'cmyk', 'name'].forEach(function(k){ rows.appendChild(R[k].el); });
  panel.appendChild(field); panel.appendChild(row); panel.appendChild(status); panel.appendChild(rows);
  top.appendChild(prev); top.appendChild(panel);
  app.appendChild(top);

  // ---------- 밝기 단계 ----------
  var tintsPal = U.palette(C.tints(cur, STEPS), { cls: 'n10', cols: STEPS });
  var shadesPal = U.palette(C.shades(cur, STEPS), { cls: 'n10', cols: STEPS });
  app.appendChild(U.section(t('tints'), tintsPal));
  app.appendChild(U.section(t('shades'), shadesPal));

  // ---------- 배색 ----------
  var harm = el('div', 'c-harm');
  var compPal = U.palette(C.complementary(cur), { large: true, cols: 2 });
  var anaPal = U.palette(C.analogous(cur), { large: true, cols: 3 });
  var triPal = U.palette(C.triadic(cur), { large: true, cols: 3 });
  harm.appendChild(U.section(t('complementary'), compPal));
  harm.appendChild(U.section(t('analogous'), anaPal));
  harm.appendChild(U.section(t('triadic'), triPal));
  app.appendChild(U.section(t('harmony'), harm));

  // ---------- 글자 대비 ----------
  function contrastCard(fg){
    var card = el('div', 'c-ct');
    var sample = el('div', 'ct-sample', t('sample')), ratio = el('div', 'ct-ratio'), level = el('span', 'ct-level');
    card.appendChild(sample); card.appendChild(ratio); card.appendChild(level);
    card.style.color = fg;
    return { el: card, set: function(bg){
      var r = C.contrast(bg, fg), lv = C.contrastLevel(r);
      card.style.background = bg;
      ratio.textContent = r.toFixed(2) + ' : 1';
      level.textContent = lv === 'fail' ? t('fail') : lv === 'AA-large' ? t('large') : lv + ' · ' + t('pass');
      card.setAttribute('data-level', lv);
    } };
  }
  var ctWhite = contrastCard('#ffffff'), ctBlack = contrastCard('#000000');
  var ctGrid = el('div', 'c-contrast');
  var ctW = U.section(t('whiteText'), ctWhite.el), ctB = U.section(t('blackText'), ctBlack.el);
  ctGrid.appendChild(ctW); ctGrid.appendChild(ctB);
  app.appendChild(U.section(t('contrast'), ctGrid));

  // ---------- 갱신 ----------
  function render(hex, src){
    cur = hex;
    var rgb = C.hexToRgb(hex), hsl = C.rgbToHsl(rgb), hsv = C.rgbToHsv(rgb), cmyk = C.rgbToCmyk(rgb);
    var near = C.nearestName(hex), ink = C.textOn(hex);
    prev.style.background = hex; prev.style.color = ink;
    prevHex.textContent = hex;
    prevName.textContent = near.exact ? near.name : '≈ ' + near.name;
    R.hex.set(hex); R.rgb.set(C.rgbString(rgb)); R.hsl.set(C.hslString(hsl)); R.hsv.set(C.hsvString(hsv)); R.cmyk.set(C.cmykString(cmyk));
    R.name.set(near.exact ? near.name : '≈ ' + near.name + ' (' + near.hex + ')');
    U.setPalette(tintsPal, C.tints(hex, STEPS));
    U.setPalette(shadesPal, C.shades(hex, STEPS));
    U.setPalette(compPal, C.complementary(hex), { large: true });
    U.setPalette(anaPal, C.analogous(hex), { large: true });
    U.setPalette(triPal, C.triadic(hex), { large: true });
    ctWhite.set(hex); ctBlack.set(hex);
    pick.value = hex;
    if (src !== 'text') inp.value = hex;
    inp.classList.remove('err'); status.textContent = ''; status.className = 'status';
    toHash(hex);
  }

  // ---------- 이벤트 ----------
  inp.addEventListener('input', function(){
    var v = inp.value.trim();
    if (!v) { inp.classList.remove('err'); status.textContent = ''; return; }
    var hex = C.parse(v);
    if (hex) render(hex, 'text');
    else inp.classList.add('err');
  });
  function commit(){
    var v = inp.value.trim();
    if (!v) { inp.value = cur; inp.classList.remove('err'); status.textContent = ''; return; }
    if (C.parse(v)) { inp.classList.remove('err'); status.textContent = ''; return; }
    inp.classList.add('err'); status.textContent = t('invalid'); status.className = 'status err';
  }
  inp.addEventListener('change', commit);
  inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); commit(); if (C.parse(inp.value)) inp.select(); } });
  inp.addEventListener('focus', function(){ inp.select(); });
  pick.addEventListener('input', function(){ var hex = C.parse(pick.value); if (hex) render(hex, 'pick'); });
  btnRand.addEventListener('click', function(){ render(C.random(), 'random'); });
  btnCopy.addEventListener('click', function(){ U.copy(cur); });
  window.addEventListener('hashchange', function(){ var h = fromHash(); if (h && h !== cur) render(h, 'hash'); });

  render(fromHash() || DEFAULT, 'init');
})();
