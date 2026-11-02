// 랜덤 색상: 잠금 가능한 5칸 팔레트. 스페이스바·버튼으로 잠그지 않은 칸만 새 색, 칸 클릭은 복사, URL 해시에 5색(#a1b2c3-d4e5f6-…).
// 계산은 /color/color.js, 조각은 /color/color-ui.js. 이 도구만 쓰는 스타일은 아래 CSS 문자열로 끼운다.
(function(){
  'use strict';
  var C = window.COLOR, U = window.COLOR_UI;
  var app = document.getElementById('app');
  if (!C || !U || !app) return;
  var t = U.t, el = U.el;
  var N = 5;
  var cols = [], locks = [];

  var CSS = [
    '.rs-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-height:380px;border:1px solid var(--line);border-radius:var(--r-card);overflow:hidden}',
    '.rs-slot{position:relative;display:flex;min-width:0;transition:background .2s}',
    '.rs-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;padding:56px 8px 20px;border:0;background:none;color:inherit;font:inherit;cursor:pointer;text-align:center}',
    '.rs-main:focus-visible{outline:3px solid currentColor;outline-offset:-6px;border-radius:var(--r-big)}',
    '.rs-hex{font-size:22px;line-height:1.1;font-weight:var(--fw-semibold);letter-spacing:.03em;font-variant-numeric:tabular-nums}',
    '.rs-nm{font-size:var(--fs-caption);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.rs-cp{font-size:var(--fs-caption);opacity:0;margin-top:6px;transition:opacity .15s}',
    '.rs-slot:hover .rs-cp,.rs-main:focus-visible .rs-cp{opacity:.75}',
    // 잠금 버튼: 아이콘은 항상 불투명(칸 글자색 = 흰/검). 잠금/미잠금 차이는 배경 농도와 테두리로. 배경은 아이콘과 반대 방향(흰 아이콘이면 어둡게, 검은 아이콘이면 밝게)으로 깔아 대비를 올린다
    '.rs-lock{position:absolute;top:10px;right:10px;display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.2);color:inherit;cursor:pointer;transition:background .15s,box-shadow .15s}',
    '.rs-slot.ink-dark .rs-lock{background:rgba(255,255,255,.3)}',
    '.rs-lock svg{width:20px;height:20px}',
    '.rs-lock:hover,.rs-lock:focus-visible{background:rgba(0,0,0,.32)}',
    '.rs-slot.ink-dark .rs-lock:hover,.rs-slot.ink-dark .rs-lock:focus-visible{background:rgba(255,255,255,.45)}',
    '.rs-lock:focus-visible{outline:2px solid currentColor;outline-offset:2px}',
    '.rs-slot.locked .rs-lock{background:rgba(0,0,0,.45);box-shadow:0 0 0 2px currentColor}',
    '.rs-slot.ink-dark.locked .rs-lock{background:rgba(255,255,255,.6)}',
    '.rs-slot.locked .rs-main::after{content:"";position:absolute;inset:0;border:3px solid currentColor;opacity:.35;pointer-events:none}',
    '.rs-actions{justify-content:center;margin:0}',
    '.rs-actions kbd{font:inherit;font-size:var(--fs-caption);padding:1px 7px;border-radius:5px;background:rgba(255,255,255,.22)}',
    '@media (hover:none){.rs-actions kbd{display:none}.rs-cp{display:none}}',
    '@media (max-width:767.98px){',
    '.rs-strip{grid-template-columns:1fr;min-height:0}',
    '.rs-main{flex-direction:row;justify-content:flex-start;gap:10px;min-height:72px;padding:0 64px 0 16px;text-align:left}',
    '.rs-hex{font-size:19px}',
    '.rs-lock{top:50%;transform:translateY(-50%);right:14px}',
    '.rs-cp{display:none}',
    '.rs-actions{flex-wrap:nowrap;gap:8px}',
    '.rs-actions .btn{flex:1;min-width:0;padding:10px 8px;font-size:15px}',
    '.rs-actions kbd{display:none}',
    '}'
  ].join('\n');
  var st = el('style'); st.textContent = CSS; document.head.appendChild(st);

  var LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
  var UNLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/></svg>';

  // 보기 좋은 무작위 색 (너무 탁하거나 어두운 색 피함)
  function nice(){ return C.hslToHex({ h: Math.random() * 360, s: 45 + Math.random() * 45, l: 35 + Math.random() * 30 }); }

  // ---------- 해시: #a1b2c3-d4e5f6-… ----------
  function fromHash(){
    var parts = location.hash.replace(/^#/, '').split('-');
    if (parts.length !== N) return null;
    var out = [];
    for (var i = 0; i < N; i++) { if (!/^[0-9a-f]{6}$/i.test(parts[i])) return null; out.push('#' + parts[i].toLowerCase()); }
    return out;
  }
  function toHash(){
    var h = '#' + cols.map(function(x){ return x.slice(1); }).join('-');
    if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } }
  }

  // ---------- 5칸 ----------
  var strip = el('div', 'rs-strip');
  var slots = [];
  for (var i = 0; i < N; i++) (function(i){
    var s = el('div', 'rs-slot');
    var main = el('button', 'rs-main'); main.type = 'button';
    var hex = el('div', 'rs-hex'), nm = el('div', 'rs-nm'), cp = el('div', 'rs-cp', t('copy'));
    main.appendChild(hex); main.appendChild(nm); main.appendChild(cp);
    main.addEventListener('click', function(){ U.copy(cols[i]); });
    var lock = el('button', 'rs-lock'); lock.type = 'button'; lock.setAttribute('aria-pressed', 'false');
    lock.addEventListener('click', function(){ setLock(i, !locks[i]); });
    s.appendChild(main); s.appendChild(lock);
    slots.push({ el: s, main: main, hex: hex, nm: nm, lock: lock });
    strip.appendChild(s);
  })(i);
  app.appendChild(strip);

  var actions = el('div', 'row rs-actions');
  var btnNew = el('button', 'btn', t('newColor')); btnNew.type = 'button';
  var kbd = el('kbd', null, 'Space'); btnNew.appendChild(kbd);
  var btnAll = el('button', 'btn ghost', t('copyAll')); btnAll.type = 'button';
  var btnCss = el('button', 'btn ghost', t('copyCss')); btnCss.type = 'button';
  actions.appendChild(btnNew); actions.appendChild(btnAll); actions.appendChild(btnCss);
  app.appendChild(actions);

  // ---------- 갱신 ----------
  function setLock(i, on){
    locks[i] = on;
    var s = slots[i];
    s.el.classList.toggle('locked', on);
    s.lock.setAttribute('aria-pressed', on ? 'true' : 'false');
    s.lock.innerHTML = on ? LOCK : UNLOCK;
    s.lock.setAttribute('aria-label', (on ? t('unlock') : t('lock')) + ' ' + cols[i]);
    s.lock.title = on ? t('unlock') : t('lock');
  }
  function paint(){
    for (var i = 0; i < N; i++) {
      var s = slots[i], hex = cols[i], near = C.nearestName(hex);
      var ink = C.textOn(hex);
      s.el.style.background = hex; s.el.style.color = ink; s.el.classList.toggle('ink-dark', ink === '#000000');
      s.hex.textContent = hex;
      s.nm.textContent = near.exact ? near.name : '≈ ' + near.name;
      s.main.setAttribute('aria-label', t('copy') + ' ' + hex);
      s.lock.setAttribute('aria-label', (locks[i] ? t('unlock') : t('lock')) + ' ' + hex);
    }
    toHash();
  }
  function shuffle(){
    for (var i = 0; i < N; i++) if (!locks[i]) cols[i] = nice();
    paint();
  }
  function cssText(){ return ':root{' + cols.map(function(x, i){ return '--c' + (i + 1) + ':' + x + ';'; }).join('') + '}'; }

  // ---------- 이벤트 ----------
  btnNew.addEventListener('click', shuffle);
  btnAll.addEventListener('click', function(){ U.copy(cols.join(', ')); });
  btnCss.addEventListener('click', function(){ U.copy(cssText()); });
  document.addEventListener('keydown', function(e){
    if (e.key !== ' ' && e.code !== 'Space') return;
    var tg = e.target, tag = tg && tg.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault();
    shuffle();
  });
  window.addEventListener('hashchange', function(){ var h = fromHash(); if (h && h.join() !== cols.join()) { cols = h; paint(); } });

  cols = fromHash() || [];
  if (cols.length !== N) { cols = []; for (var k = 0; k < N; k++) cols.push(nice()); }
  for (var j = 0; j < N; j++) locks.push(false);
  paint();
  for (var m = 0; m < N; m++) setLock(m, false);

  // 터치·모바일에서는 스페이스바 안내 대신 버튼·잠금 안내 문구. 창 크기·입력 방식이 바뀌면 다시 고른다
  var lead = document.querySelector('.tool-head .lead');
  if (lead && t('lineTouch') !== 'lineTouch' && t('line') !== 'line') {
    var mqW = matchMedia('(max-width:767.98px)'), mqH = matchMedia('(hover:none)');
    var setLead = function(){ var v = (mqW.matches || mqH.matches) ? t('lineTouch') : t('line'); if (lead.textContent !== v) lead.textContent = v; };
    setLead();
    if (mqW.addEventListener) { mqW.addEventListener('change', setLead); mqH.addEventListener('change', setLead); }
    window.addEventListener('resize', setLead);
  }
})();
