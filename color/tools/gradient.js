// 그라데이션 생성기: 색 정지점 2~6개 + 각도/8방향 + 선형·원형 → 큰 미리보기, CSS 한 줄 복사, 프리셋 12개, 1920×1080 PNG 저장.
// 상태는 URL 해시(#linear/135/ff8a5c-0,ff3d81-100)로 공유한다. 계산은 /color/color.js, 조각은 /color/color-ui.js.
(function(){
  'use strict';
  var C = window.COLOR, U = window.COLOR_UI;
  var app = document.getElementById('app');
  if (!C || !U || !app) return;
  var t = U.t, el = U.el;
  var MIN = 2, MAX = 6, W = 1920, H = 1080;
  var DIRS = [['↑', 0], ['↗', 45], ['→', 90], ['↘', 135], ['↓', 180], ['↙', 225], ['←', 270], ['↖', 315]];
  // 프리셋: 직접 고른 조합 (이름 없음)
  var PRESETS = [
    ['linear', 135, ['#ff8a5c', '#ff3d81']], ['linear', 135, ['#1f3b73', '#5a3e8e']], ['linear', 120, ['#ffd76a', '#ff9a7b']], ['linear', 120, ['#9ad0ff', '#d6f3ff']],
    ['linear', 160, ['#0d1b2a', '#1b3a4b', '#2d5c6e']], ['linear', 60, ['#86b8ff', '#e6c0ff']], ['linear', 135, ['#e86bff', '#ff5a6e']], ['linear', 135, ['#3ddc84', '#2ee6d6']],
    ['linear', 180, ['#ff6f91', '#ffd166']], ['linear', 135, ['#26c6da', '#2e1a6b']], ['linear', 90, ['#fff1dc', '#ffb996']], ['radial', 0, ['#5b5fe8', '#101436']]
  ];
  var state = { type: 'linear', angle: 135, stops: [] };

  // ---------- 이 도구만 쓰는 스타일 (토큰은 site.css 변수) ----------
  var style = el('style');
  style.textContent = [
    '.g-top{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:stretch}',
    '.g-preview{min-height:320px;border:1px solid var(--line);border-radius:var(--r-card)}',
    '.g-type{display:flex;gap:8px}.g-type .btn{flex:1}',
    '.g-angle{display:flex;align-items:center;gap:10px}.g-angle input[type=range]{flex:1;min-width:0;accent-color:var(--accent);margin:0}',
    '.g-angle output{flex:none;width:52px;text-align:right;font-variant-numeric:tabular-nums;font-weight:var(--fw-semibold)}',
    '.g-dirs{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}.g-dirs .btn{padding:6px 0;font-size:17px;line-height:22px;min-width:0}',
    '.g-stops{display:flex;flex-direction:column;gap:6px}',
    '.g-stop .c-pick{width:44px;height:44px}.g-stop input[type=text]{font-size:15px;padding:9px 10px}',
    '.g-stop .g-pos{flex:none;width:64px;font:inherit;font-size:15px;padding:9px 6px;text-align:center;border:1px solid var(--line);border-radius:var(--r-btn);background:var(--bg);color:var(--ink)}',
    '.g-stop .g-pos:focus{outline:2px solid var(--accent);outline-offset:-1px}',
    '.g-stop .g-del{flex:none;width:36px;height:36px;padding:0;border:1px solid var(--line);border-radius:var(--r-btn);background:var(--card);color:var(--muted);font-size:18px;line-height:1;cursor:pointer}',
    '.g-stop .g-del:hover{color:var(--ink);border-color:var(--ink)}.g-stop .g-del:disabled{opacity:.35;cursor:default}',
    '.g-pres{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}',
    '.g-pre{aspect-ratio:4/3;min-width:0;padding:0;border:1px solid rgba(0,0,0,.1);border-radius:var(--r-btn);cursor:pointer;transition:transform .12s}',
    '.g-pre:hover,.g-pre:focus-visible{transform:scale(1.05);z-index:1;outline:2px solid var(--ink);outline-offset:1px}',
    '.g-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0}',
    '@media (max-width:767.98px){.g-top{grid-template-columns:minmax(0,1fr)}.g-preview{min-height:200px}.g-pres{grid-template-columns:repeat(4,minmax(0,1fr))}.g-dirs .btn{font-size:15px}.g-stop .g-del{width:44px;height:44px}}'
  ].join('\n');
  document.head.appendChild(style);

  // ---------- 상태 ↔ 해시 ----------
  function fromHash(){
    var m = /^#(linear|radial)\/(\d{1,3})\/([0-9a-f]{6}-\d{1,3}(?:,[0-9a-f]{6}-\d{1,3})*)$/i.exec(location.hash || '');
    if (!m) return null;
    var stops = m[3].split(',').map(function(p){ var q = p.split('-'); return { hex: '#' + q[0].toLowerCase(), pos: clampPos(q[1]) }; });
    if (stops.length < MIN || stops.length > MAX) return null;
    return { type: m[1].toLowerCase(), angle: Math.min(360, +m[2]), stops: stops };
  }
  function toHash(){
    var h = '#' + state.type + '/' + state.angle + '/' + state.stops.map(function(s){ return s.hex.slice(1) + '-' + s.pos; }).join(',');
    if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } }
  }
  function clampPos(v){ v = Math.round(+v); return v !== v ? 0 : v < 0 ? 0 : v > 100 ? 100 : v; }
  function setStops(hexes, type, angle){
    state.type = type || 'linear'; state.angle = angle || 0;
    state.stops = hexes.map(function(h, i){ return { hex: h, pos: Math.round(i * 100 / (hexes.length - 1)) }; });
  }

  // ---------- CSS 문자열 ----------
  function sorted(){ return state.stops.slice().sort(function(a, b){ return a.pos - b.pos; }); }
  function stopsCss(){ return sorted().map(function(s){ return s.hex + ' ' + s.pos + '%'; }).join(', '); }
  function gradCss(){ return state.type === 'radial' ? 'radial-gradient(circle, ' + stopsCss() + ')' : 'linear-gradient(' + state.angle + 'deg, ' + stopsCss() + ')'; }
  function fullCss(){ return 'background: ' + gradCss() + ';'; }
  function presetCss(p){ var st = p[2].map(function(h, i){ return h + ' ' + Math.round(i * 100 / (p[2].length - 1)) + '%'; }).join(', '); return p[0] === 'radial' ? 'radial-gradient(circle, ' + st + ')' : 'linear-gradient(' + p[1] + 'deg, ' + st + ')'; }

  // ---------- 화면 ----------
  var top = el('div', 'g-top');
  var prev = el('div', 'g-preview'); prev.setAttribute('role', 'img');
  var panel = el('div', 'c-panel');

  var typeRow = el('div', 'g-type');
  var btnLin = el('button', 'btn', t('linear')), btnRad = el('button', 'btn', t('radial'));
  btnLin.type = btnRad.type = 'button';
  typeRow.appendChild(btnLin); typeRow.appendChild(btnRad);

  var angleRow = el('div', 'g-angle');
  var angleLab = el('span', 'vl', t('angle')); angleLab.style.cssText = 'font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--muted);letter-spacing:.04em;flex:none';
  var range = el('input'); range.type = 'range'; range.min = '0'; range.max = '360'; range.step = '1'; range.id = 'gangle'; range.setAttribute('aria-label', t('angle'));
  var out = el('output'); out.setAttribute('for', 'gangle');
  angleRow.appendChild(angleLab); angleRow.appendChild(range); angleRow.appendChild(out);
  var dirs = el('div', 'g-dirs');
  DIRS.forEach(function(d){
    var b = el('button', 'btn ghost sm', d[0]); b.type = 'button'; b.setAttribute('aria-label', t('direction', { deg: d[1] })); b.title = d[1] + '°';
    b.addEventListener('click', function(){ state.angle = d[1]; render(); });
    dirs.appendChild(b);
  });

  var stopsTitle = el('div', 'c-sec-title'); stopsTitle.appendChild(el('span', null, t('stops'))); stopsTitle.appendChild(el('span', 'muted', t('maxStops')));
  var stopsBox = el('div', 'g-stops');
  var btnAdd = el('button', 'btn ghost sm', '+ ' + t('addStop')); btnAdd.type = 'button';

  // 코드 행은 보기만, 복사는 아래 'CSS 복사' 버튼 하나로
  var cssRow = U.valueRow(t('cssLabel'), '', { noCopy: true });
  var actions = el('div', 'g-actions');
  var btnCopy = el('button', 'btn', t('copyCss')), btnPng = el('button', 'btn ghost', t('downloadPng')), btnRand = el('button', 'btn ghost', t('randomize'));
  btnCopy.type = btnPng.type = btnRand.type = 'button';
  actions.appendChild(btnCopy); actions.appendChild(btnPng); actions.appendChild(btnRand);

  panel.appendChild(typeRow); panel.appendChild(angleRow); panel.appendChild(dirs);
  panel.appendChild(stopsTitle); panel.appendChild(stopsBox); panel.appendChild(btnAdd);
  panel.appendChild(cssRow.el); panel.appendChild(actions);
  top.appendChild(prev); top.appendChild(panel);
  app.appendChild(top);

  // 프리셋 격자
  var pres = el('div', 'g-pres');
  PRESETS.forEach(function(p, i){
    var b = el('button', 'g-pre'); b.type = 'button'; b.style.background = presetCss(p); b.setAttribute('aria-label', t('preset', { n: i + 1 }));
    b.addEventListener('click', function(){ setStops(p[2], p[0], p[1]); rebuild(); render(); });
    pres.appendChild(b);
  });
  app.appendChild(U.section(t('presets'), pres));

  // ---------- 정지점 행 ----------
  function stopRow(s, i){
    var row = el('div', 'c-field g-stop');
    var pick = el('input', 'c-pick'); pick.type = 'color'; pick.value = s.hex; pick.setAttribute('aria-label', t('pick') + ' ' + t('stop', { n: i + 1 }));
    var txt = el('input'); txt.type = 'text'; txt.value = s.hex; txt.autocomplete = 'off'; txt.spellcheck = false; txt.setAttribute('aria-label', t('stop', { n: i + 1 }));
    var pos = el('input', 'g-pos'); pos.type = 'number'; pos.min = '0'; pos.max = '100'; pos.step = '1'; pos.value = s.pos; pos.setAttribute('aria-label', t('position') + ' ' + t('stop', { n: i + 1 }));
    var del = el('button', 'g-del', '×'); del.type = 'button'; del.setAttribute('aria-label', t('remove') + ' ' + t('stop', { n: i + 1 })); del.disabled = state.stops.length <= MIN;
    pick.addEventListener('input', function(){ s.hex = pick.value; txt.value = s.hex; txt.classList.remove('err'); render(); });
    txt.addEventListener('input', function(){ var h = C.parse(txt.value); if (h) { s.hex = h; pick.value = h; txt.classList.remove('err'); render(); } else txt.classList.add('err'); });
    txt.addEventListener('change', function(){ if (!C.parse(txt.value)) { txt.value = s.hex; txt.classList.remove('err'); } });
    txt.addEventListener('focus', function(){ txt.select(); });
    pos.addEventListener('input', function(){ if (pos.value === '') return; s.pos = clampPos(pos.value); render(); });
    pos.addEventListener('change', function(){ pos.value = s.pos; });
    del.addEventListener('click', function(){ if (state.stops.length <= MIN) return; state.stops.splice(i, 1); rebuild(); render(); });
    row.appendChild(pick); row.appendChild(txt); row.appendChild(pos); row.appendChild(del);
    return row;
  }
  function rebuild(){
    stopsBox.textContent = '';
    state.stops.forEach(function(s, i){ stopsBox.appendChild(stopRow(s, i)); });
    btnAdd.disabled = state.stops.length >= MAX;
  }
  function addStop(){
    if (state.stops.length >= MAX) return;
    var ss = sorted(), a = ss[ss.length - 2], b = ss[ss.length - 1];
    // 마지막 두 정지점 사이 중간색을 그 사이 위치에 넣는다
    state.stops.push({ hex: C.mix(a.hex, b.hex, 0.5), pos: Math.round((a.pos + b.pos) / 2) });
    rebuild(); render();
  }

  // ---------- 갱신 ----------
  function render(){
    var css = gradCss();
    prev.style.background = css;
    prev.setAttribute('aria-label', css);
    cssRow.set(fullCss());
    var lin = state.type !== 'radial';
    btnLin.className = lin ? 'btn' : 'btn ghost'; btnRad.className = lin ? 'btn ghost' : 'btn';
    btnLin.setAttribute('aria-pressed', lin ? 'true' : 'false'); btnRad.setAttribute('aria-pressed', lin ? 'false' : 'true');
    angleRow.style.display = lin ? '' : 'none'; dirs.style.display = lin ? '' : 'none';
    range.value = state.angle; out.value = state.angle + '°';
    toHash();
  }

  // ---------- PNG ----------
  function drawPng(cb){
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'), cx = W / 2, cy = H / 2, g;
    if (state.type === 'radial') g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.sqrt(cx * cx + cy * cy));
    else {
      // CSS 각도: 0deg 는 위, 90deg 는 오른쪽. 선 길이는 모서리까지 닿도록
      var a = state.angle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), len = Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a));
      g = x.createLinearGradient(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2);
    }
    sorted().forEach(function(s){ g.addColorStop(s.pos / 100, s.hex); });
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    c.toBlob(function(b){ if (b) cb(b); }, 'image/png');
  }
  function savePng(){
    btnPng.disabled = true;
    drawPng(function(blob){
      var url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = 'gradient-' + W + 'x' + H + '.png'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
      btnPng.disabled = false;
    });
  }

  // ---------- 무작위: 같은 계열 색 2~3개 ----------
  function randomize(){
    var n = 2 + (Math.random() < 0.35 ? 1 : 0), h = Math.random() * 360, step = 35 + Math.random() * 60, hexes = [];
    for (var i = 0; i < n; i++) hexes.push(C.hslToHex({ h: h + step * i, s: 65 + Math.random() * 25, l: 50 + Math.random() * 18 }));
    setStops(hexes, 'linear', Math.round(Math.random() * 24) * 15);
    rebuild(); render();
  }

  // ---------- 이벤트 ----------
  btnLin.addEventListener('click', function(){ state.type = 'linear'; render(); });
  btnRad.addEventListener('click', function(){ state.type = 'radial'; render(); });
  range.addEventListener('input', function(){ state.angle = +range.value; render(); });
  btnAdd.addEventListener('click', addStop);
  btnCopy.addEventListener('click', function(){ U.copy(fullCss()); });
  btnPng.addEventListener('click', savePng);
  btnRand.addEventListener('click', randomize);
  window.addEventListener('hashchange', function(){ var s = fromHash(); if (s && JSON.stringify(s) !== JSON.stringify(state)) { state = s; rebuild(); render(); } });

  var init = fromHash();
  if (init) state = init; else setStops(PRESETS[0][2], PRESETS[0][0], PRESETS[0][1]);
  rebuild(); render();
})();
