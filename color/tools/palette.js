// 색 조합: 기준 색 1개 → 배색 5종(보색·분할 보색·유사·삼각·사각) + 명도 9칸 + 채도 9칸.
// 칩 클릭은 복사, 줄 이름 클릭은 내보낼 팔레트 선택. CSS 변수(:root{--c1:…})·JSON 복사, URL 해시 #ff5733/tri 로 공유.
// 계산은 /color/color.js, 조각은 /color/color-ui.js. 이 도구만 쓰는 스타일은 아래 CSS 문자열로 끼운다.
(function(){
  'use strict';
  var C = window.COLOR, U = window.COLOR_UI;
  var app = document.getElementById('app');
  if (!C || !U || !app) return;
  var t = U.t, el = U.el;
  var DEFAULT = '#ff5733', STEPS = 9;
  var cur = DEFAULT, scheme = 'comp';

  var CSS = [
    '.ph-rows{display:flex;flex-direction:column;gap:10px}',
    '.ph-row{display:grid;grid-template-columns:136px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:var(--r-card);background:var(--card);transition:border-color .15s,box-shadow .15s}',
    '.ph-row.on{border-color:var(--accent-text);box-shadow:inset 0 0 0 1px var(--accent-text)}',
    '.ph-name{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;height:100%;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r-btn);background:var(--bg);color:var(--ink);font:inherit;font-size:var(--fs-small);font-weight:var(--fw-semibold);text-align:left;cursor:pointer;transition:var(--t-btn)}',
    '.ph-name::after{content:"";flex:none;width:10px;height:10px;border-radius:50%;border:2px solid var(--muted);box-sizing:border-box}',
    '.ph-name:hover{border-color:var(--accent-text)}',
    '.ph-name:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
    '.ph-row.on .ph-name{background:var(--accent-tint);color:var(--accent-text);border-color:var(--accent-text)}',
    '.ph-row.on .ph-name::after{border-color:var(--accent-text);background:var(--accent-text)}',
    '.ph-row .cswatch.lg{min-height:64px}',
    '.ph-row.sm .cswatch{aspect-ratio:auto;height:52px}',
    '.ph-row.sm .cswatch.base::before{content:"";position:absolute;inset:4px;border:2px solid currentColor;border-radius:5px;opacity:.7;pointer-events:none}',
    '.ph-row .btn.sm{padding:6px 12px}',
    '@media (max-width:767.98px){',
    '.ph-row{grid-template-columns:minmax(0,1fr) auto;gap:8px}',
    '.ph-row .cpal{grid-column:1/-1}',
    '.ph-name{min-height:38px;padding:6px 10px}',
    '.ph-row .cswatch.lg{min-height:56px}',
    '.ph-row.sm .cswatch{height:40px}',
    '.ph-row.sm .cswatch .cl{display:none}',
    '}'
  ].join('\n');
  var st = el('style'); st.textContent = CSS; document.head.appendChild(st);

  // 기준 색을 가운데 두고 밝게 4칸·어둡게 4칸
  function lightSteps(hex){
    var out = [], i;
    for (i = 4; i >= 1; i--) out.push(C.mix(hex, '#ffffff', i * 0.2));
    out.push(hex);
    for (i = 1; i <= 4; i++) out.push(C.mix(hex, '#000000', i * 0.2));
    return out;
  }
  // 같은 색상·명도에서 채도 0 → 100
  function satSteps(hex){
    var c = C.hexToHsl(hex), out = [];
    for (var i = 0; i < STEPS; i++) out.push(C.hslToHex({ h: c.h, s: 100 * i / (STEPS - 1), l: c.l }));
    return out;
  }
  // 보기 좋은 무작위 색 (너무 탁하거나 어두운 색 피함)
  function nice(){ return C.hslToHex({ h: Math.random() * 360, s: 45 + Math.random() * 45, l: 35 + Math.random() * 30 }); }

  var SCHEMES = [
    { id: 'comp', name: 'complementary', key: 'complementary', fn: C.complementary },
    { id: 'split', name: 'split-complementary', key: 'splitComp', fn: C.splitComplementary },
    { id: 'ana', name: 'analogous', key: 'analogous', fn: C.analogous },
    { id: 'tri', name: 'triadic', key: 'triadic', fn: C.triadic },
    { id: 'tet', name: 'tetradic', key: 'tetradic', fn: C.tetradic },
    { id: 'light', name: 'lightness', key: 'lightness', fn: lightSteps, small: true },
    { id: 'sat', name: 'saturation', key: 'saturation', fn: satSteps, small: true }
  ];
  var byId = {};
  SCHEMES.forEach(function(s){ byId[s.id] = s; s.hexes = s.fn(cur); });

  // ---------- 해시: #ff5733 또는 #ff5733/tri ----------
  function fromHash(){
    var h = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
    var hex = h[0] ? C.parse(h[0]) : null;
    return { hex: hex, scheme: byId[h[1]] ? h[1] : null };
  }
  function toHash(){
    var h = '#' + cur.slice(1) + (scheme === 'comp' ? '' : '/' + scheme);
    if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } }
  }

  // ---------- 미리보기 + 입력 ----------
  var top = el('div', 'c-top');
  var prev = el('button', 'c-preview'); prev.type = 'button'; prev.setAttribute('aria-label', t('copy') + ' HEX');
  var prevHex = el('div', 'c-hex'), prevName = el('div', 'c-nm'), prevCopy = el('span', 'c-copy', t('copy'));
  prev.appendChild(prevHex); prev.appendChild(prevName); prev.appendChild(prevCopy);
  prev.addEventListener('click', function(){ U.copy(cur); });

  var panel = el('div', 'c-panel');
  var field = el('div', 'c-field');
  var inp = el('input'); inp.type = 'text'; inp.id = 'cin'; inp.placeholder = t('placeholder'); inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', t('base'));
  var pick = el('input', 'c-pick'); pick.type = 'color'; pick.id = 'cpick'; pick.setAttribute('aria-label', t('pick')); pick.title = t('pick');
  field.appendChild(inp); field.appendChild(pick);
  var row = el('div', 'row');
  var btnRand = el('button', 'btn ghost sm', t('randomize')); btnRand.type = 'button';
  var btnCss = el('button', 'btn sm', t('copyCss')); btnCss.type = 'button';
  var btnJson = el('button', 'btn ghost sm', t('copyJson')); btnJson.type = 'button';
  row.appendChild(btnRand); row.appendChild(btnCss); row.appendChild(btnJson);
  var status = el('p', 'status'); status.id = 'cstatus';
  var rows = el('div', 'vrows');
  var R = { hex: U.valueRow(t('hex'), ''), rgb: U.valueRow(t('rgb'), ''), hsl: U.valueRow(t('hsl'), ''), name: U.valueRow(t('cssName'), '') };
  ['hex', 'rgb', 'hsl', 'name'].forEach(function(k){ rows.appendChild(R[k].el); });
  panel.appendChild(field); panel.appendChild(row); panel.appendChild(status); panel.appendChild(rows);
  top.appendChild(prev); top.appendChild(panel);
  app.appendChild(top);

  // ---------- 배색·단계 줄 ----------
  var list = el('div', 'ph-rows');
  SCHEMES.forEach(function(s){
    var r = el('div', 'ph-row' + (s.small ? ' sm' : ''));
    var name = el('button', 'ph-name', t(s.key)); name.type = 'button'; name.setAttribute('aria-pressed', 'false');
    name.addEventListener('click', function(){ select(s.id); });
    var pal = U.palette(s.hexes, s.small ? { cols: STEPS } : { large: true, cols: s.hexes.length });
    if (s.id === 'light') pal.children[4].classList.add('base');
    var cp = el('button', 'btn ghost sm', t('copy')); cp.type = 'button'; cp.setAttribute('aria-label', t('copy') + ' ' + t(s.key));
    cp.addEventListener('click', function(){ U.copy(s.hexes.join(', ')); });
    r.appendChild(name); r.appendChild(pal); r.appendChild(cp);
    s.el = r; s.nameEl = name; s.pal = pal;
    list.appendChild(r);
  });
  app.appendChild(U.section(t('harmony'), list));

  // ---------- 내보내기 ----------
  function cssText(){ return ':root{' + byId[scheme].hexes.map(function(x, i){ return '--c' + (i + 1) + ':' + x + ';'; }).join('') + '}'; }
  function jsonText(){ var s = byId[scheme]; return JSON.stringify({ base: cur, scheme: s.name, colors: s.hexes }, null, 2); }

  function select(id){
    scheme = id;
    SCHEMES.forEach(function(s){ var on = s.id === id; s.el.classList.toggle('on', on); s.nameEl.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    toHash();
  }

  // ---------- 갱신 ----------
  function render(hex, src){
    cur = hex;
    var rgb = C.hexToRgb(hex), hsl = C.rgbToHsl(rgb), near = C.nearestName(hex), ink = C.textOn(hex);
    prev.style.background = hex; prev.style.color = ink;
    prevHex.textContent = hex;
    prevName.textContent = near.exact ? near.name : '≈ ' + near.name;
    R.hex.set(hex); R.rgb.set(C.rgbString(rgb)); R.hsl.set(C.hslString(hsl));
    R.name.set(near.exact ? near.name : '≈ ' + near.name + ' (' + near.hex + ')');
    SCHEMES.forEach(function(s){ s.hexes = s.fn(hex); U.setPalette(s.pal, s.hexes, s.small ? {} : { large: true }); });
    pick.value = hex;
    if (src !== 'text') inp.value = hex;
    inp.classList.remove('err'); status.textContent = ''; status.className = 'status';
    toHash();
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
  btnRand.addEventListener('click', function(){ render(nice(), 'random'); });
  btnCss.addEventListener('click', function(){ U.copy(cssText()); });
  btnJson.addEventListener('click', function(){ U.copy(jsonText()); });
  window.addEventListener('hashchange', function(){
    var h = fromHash();
    if (h.scheme && h.scheme !== scheme) select(h.scheme);
    if (h.hex && h.hex !== cur) render(h.hex, 'hash');
  });

  var init = fromHash();
  select(init.scheme || 'comp');
  render(init.hex || DEFAULT, 'init');
})();
