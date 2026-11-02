(function(){
  'use strict';
  var C = window.WHEEL_CONFIG || {}; var U = C.ui || {};
  function $(id){ return document.getElementById(id); }
  var TWO_PI = Math.PI * 2;
  function norm(a){ return ((a % TWO_PI) + TWO_PI) % TWO_PI; }
  function rnd(){ if (window.crypto && crypto.getRandomValues) { var u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } return Math.random(); }
  function b64e(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function store(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }

  // 영어 페이지 첫 방문: 브라우저 언어가 지원 언어면 그 언어 페이지로 (사람만, 한 번만)
  var redirected = (function(){
    if (C.lang !== 'en' || read('pb_lang')) return false;
    var ua = navigator.userAgent || '';
    if (navigator.webdriver || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|lighthouse|headless/i.test(ua)) return false;
    var prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < prefs.length; i++) {
      var code = String(prefs[i] || '').toLowerCase().split('-')[0];
      if (!code) continue;
      if (code === 'en') return false;
      if (C.langUrls && C.langUrls[code]) { store('pb_lang', code); location.replace(C.langUrls[code] + location.search + location.hash); return true; }
    }
    return false;
  })();
  if (redirected) return;

  var langSel = $('lang');
  if (langSel) langSel.addEventListener('change', function(){
    var o = langSel.options[langSel.selectedIndex];
    store('pb_lang', o.getAttribute('data-code'));
    location.href = o.value + location.hash;
  });

  var KEY = 'pb_wheel_' + (C.preset || 'index') + '_' + (C.lang || 'en');
  var canvas = $('wheel'), ctx = canvas.getContext('2d');
  var wrap = $('wheelwrap'), ta = $('entries'), spinBtn = $('spin'), hintEl = $('hint'), titleEl = $('title');
  var entries = [], results = [], angle = rnd() * TWO_PI, spinning = false, pendingRemove = -1;
  var dur = 8, sound = true, removeAfter = false, lastTick = 0, actx = null;
  var PALETTE = ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  function parse(t){ return String(t).split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean).slice(0, 1000); }
  function range(a, b){ var r = []; for (var i = a; i <= b; i++) r.push(String(i)); return r; }
  function hint(msg, err){ hintEl.textContent = msg || U.tapToSpin || ''; hintEl.className = 'hint' + (err ? ' err' : ''); }

  function load(){
    var m = location.hash.match(/[#&]e=([^&]+)/), tm = location.hash.match(/[#&]t=([^&]+)/);
    var saved = read(KEY), savedTitle = read(KEY + '_t'), opts = {};
    try { opts = JSON.parse(read(KEY + '_o') || '{}'); } catch (e) {}
    if (m) { try { entries = parse(b64d(m[1])); } catch (e) { entries = []; } if (tm) { try { titleEl.value = decodeURIComponent(tm[1]); } catch (e) {} } }
    else if (saved !== null) { entries = parse(saved); if (savedTitle) titleEl.value = savedTitle; }
    else entries = (C.entries || []).slice();
    if (C.preset === 'number' && !entries.length) entries = range(1, 10);
    try { results = JSON.parse(read(KEY + '_r') || '[]'); } catch (e) { results = []; }
    dur = +opts.dur || 8; sound = opts.sound !== false; removeAfter = !!opts.remove;
    $('opt-dur').value = dur; $('dur-val').textContent = dur; $('opt-sound').checked = sound; $('opt-remove').checked = removeAfter;
    ta.value = entries.join('\n');
  }
  function save(){
    store(KEY, entries.join('\n')); store(KEY + '_t', titleEl.value);
    store(KEY + '_r', JSON.stringify(results.slice(0, 200)));
    store(KEY + '_o', JSON.stringify({ dur: dur, sound: sound, remove: removeAfter }));
  }

  // ---------- 그리기 ----------
  function cssSize(){ return canvas.width / (window.devicePixelRatio || 1); }
  function resize(){
    var size = Math.min(wrap.clientWidth || 0, 600);
    if (!size) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function segColor(i, n){ var c = PALETTE[i % PALETTE.length]; if (n > 1 && i === n - 1 && c === PALETTE[0]) c = PALETTE[1]; return c; }
  function fit(txt, maxW){
    if (ctx.measureText(txt).width <= maxW) return txt;
    while (txt.length > 1 && ctx.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1);
    return txt + '…';
  }
  function draw(){
    var size = cssSize(); if (!size) return;
    var cx = size / 2, cy = size / 2, r = size / 2 - 4, n = entries.length;
    ctx.clearRect(0, 0, size, size);
    if (!n) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TWO_PI); ctx.fillStyle = '#cbd5e1'; ctx.fill(); return; }
    var step = TWO_PI / n;
    for (var i = 0; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle + i * step, angle + (i + 1) * step); ctx.closePath();
      ctx.fillStyle = segColor(i, n); ctx.fill();
    }
    var fontSize = Math.min(26, 0.78 * r * step * 0.62);
    if (fontSize >= 8) {
      fontSize = Math.max(10, fontSize);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = '600 ' + fontSize + 'px system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Malgun Gothic","Apple SD Gothic Neo","Hiragino Sans","PingFang SC","Microsoft YaHei",sans-serif';
      var maxW = r * 0.74;
      for (i = 0; i < n; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle + i * step + step / 2);
        ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3;
        ctx.fillText(fit(entries[i], maxW), r - 16, 0);
        ctx.restore();
      }
    }
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(12, r * 0.115), 0, TWO_PI);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--hub').trim() || '#fff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.stroke();
  }
  function idxAt(a){ var n = entries.length; if (!n) return -1; var step = TWO_PI / n; return Math.floor(norm(-Math.PI / 2 - a) / step) % n; }

  // ---------- 소리 ----------
  function ensureAudio(){
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!actx) actx = new AC();
    if (actx.state === 'suspended') actx.resume();
  }
  function tick(){
    if (!sound || !actx) return;
    var now = performance.now(); if (now - lastTick < 35) return; lastTick = now;
    var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(1000, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.03);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.05);
  }
  function fanfare(){
    if (!sound || !actx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach(function(f, i){
      var t = actx.currentTime + i * 0.11, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.6);
    });
  }

  // ---------- 색종이 ----------
  var cc = $('confetti'), cctx = cc.getContext('2d'), parts = [], craf = null;
  function confetti(){
    cc.width = innerWidth; cc.height = innerHeight; parts = [];
    for (var i = 0; i < 170; i++) parts.push({ x: innerWidth / 2 + (rnd() - 0.5) * 240, y: innerHeight / 2, vx: (rnd() - 0.5) * 16, vy: -rnd() * 15 - 5, s: 6 + rnd() * 7, c: PALETTE[i % PALETTE.length], r: rnd() * TWO_PI, vr: (rnd() - 0.5) * 0.3, life: 90 + rnd() * 50 });
    if (!craf) craf = requestAnimationFrame(cframe);
  }
  function cframe(){
    cctx.clearRect(0, 0, cc.width, cc.height); var alive = false;
    for (var i = 0; i < parts.length; i++) { var p = parts[i]; if (p.life <= 0) continue; alive = true;
      p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr; p.life--;
      cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.r); cctx.globalAlpha = Math.min(1, p.life / 30); cctx.fillStyle = p.c; cctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); cctx.restore(); }
    if (alive) craf = requestAnimationFrame(cframe); else { craf = null; cctx.clearRect(0, 0, cc.width, cc.height); }
  }

  // ---------- 회전 ----------
  function spin(){
    if (spinning) return;
    var n = entries.length;
    if (n < 2) { hint(U.noEntries, true); return; }
    ensureAudio();
    spinning = true; spinBtn.disabled = true; ta.readOnly = true; hint(U.spinning);
    var w = Math.floor(rnd() * n), step = TWO_PI / n, off = 0.12 + rnd() * 0.76;
    var base = -Math.PI / 2 - (w + off) * step;
    var d = norm(base - angle), turns = Math.max(4, Math.round(dur * 0.75));
    var start = angle, total = turns * TWO_PI + d, ms = dur * 1000, t0 = performance.now(), lastIdx = idxAt(angle);
    function frame(now){
      var t = Math.min(1, (now - t0) / ms), p = 1 - Math.pow(1 - t, 3);
      angle = start + total * p; draw();
      var idx = idxAt(angle); if (idx !== lastIdx) { tick(); lastIdx = idx; }
      if (t < 1) requestAnimationFrame(frame); else finish(w);
    }
    requestAnimationFrame(frame);
  }
  function finish(w){
    spinning = false; angle = norm(angle); spinBtn.disabled = false; ta.readOnly = false; hint('');
    if (w >= entries.length) w = idxAt(angle);
    var name = entries[w];
    results.unshift({ n: name, t: Date.now() }); renderResults(); save();
    pendingRemove = w;
    $('winner').textContent = name; $('modal-title').textContent = titleEl.value;
    $('modal').hidden = false; $('m-close').focus();
    confetti(); fanfare();
  }
  function closeModal(){
    $('modal').hidden = true;
    if (removeAfter && pendingRemove >= 0) removeEntry(pendingRemove);
    pendingRemove = -1;
  }
  function removeEntry(i){ if (i < 0 || i >= entries.length) return; entries.splice(i, 1); ta.value = entries.join('\n'); update(); }

  // ---------- 상태 갱신 ----------
  function update(){
    var n = entries.length;
    $('count').textContent = n ? '(' + n + ')' : '';
    draw(); save();
    if (n < 2) hint(U.noEntries, true); else if (!spinning) hint('');
  }
  function renderResults(){
    var ol = $('results'); ol.textContent = '';
    results.forEach(function(r){
      var li = document.createElement('li'), s = document.createElement('span'), tm = document.createElement('time');
      s.textContent = r.n; var dt = new Date(r.t); tm.textContent = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); tm.dateTime = dt.toISOString();
      li.appendChild(s); li.appendChild(tm); ol.appendChild(li);
    });
    $('noresults').hidden = results.length > 0; $('rcount').textContent = results.length ? '(' + results.length + ')' : '';
  }

  // ---------- 공유 ----------
  function shareUrl(){
    var u = location.origin + location.pathname + '#e=' + b64e(entries.join('\n'));
    var t = titleEl.value.trim(); if (t) u += '&t=' + encodeURIComponent(t);
    return u;
  }
  function showLink(s){
    // 클립보드가 막힌 환경: 링크를 입력칸으로 보여 주고 선택해 둔다
    hintEl.textContent = ''; hintEl.className = 'hint';
    var inp = document.createElement('input'); inp.value = s; inp.readOnly = true; inp.className = 'linkbox';
    hintEl.appendChild(inp); inp.focus(); inp.select();
  }
  function copyText(s){
    var ok = function(){ hint(U.copied); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(ok, function(){ showLink(s); });
    else showLink(s);
  }

  // ---------- 이벤트 ----------
  ta.addEventListener('input', function(){ if (spinning) return; entries = parse(ta.value); update(); });
  titleEl.addEventListener('input', save);
  canvas.addEventListener('click', spin);
  spinBtn.addEventListener('click', spin);
  $('shuffle').addEventListener('click', function(){ if (spinning) return; for (var i = entries.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = entries[i]; entries[i] = entries[j]; entries[j] = t; } ta.value = entries.join('\n'); update(); });
  $('sort').addEventListener('click', function(){ if (spinning) return; entries.sort(function(a, b){ return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }); ta.value = entries.join('\n'); update(); });
  $('clear').addEventListener('click', function(){ if (spinning) return; entries = []; ta.value = ''; update(); ta.focus(); });
  $('share').addEventListener('click', function(){
    var u = shareUrl();
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) { navigator.share({ title: titleEl.value || document.title, url: u }).catch(function(){}); return; }
    copyText(u);
  });
  $('fs').addEventListener('click', function(){
    var st = document.querySelector('.stage');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (st.requestFullscreen) st.requestFullscreen();
    else if (st.webkitRequestFullscreen) st.webkitRequestFullscreen();
  });
  document.addEventListener('fullscreenchange', function(){ setTimeout(resize, 50); });
  $('opt-dur').addEventListener('input', function(){ dur = +this.value; $('dur-val').textContent = dur; save(); });
  $('opt-sound').addEventListener('change', function(){ sound = this.checked; if (sound) ensureAudio(); save(); });
  $('opt-remove').addEventListener('change', function(){ removeAfter = this.checked; save(); });
  $('m-close').addEventListener('click', closeModal);
  $('m-remove').addEventListener('click', function(){ var i = pendingRemove; pendingRemove = -1; $('modal').hidden = true; removeEntry(i); });
  $('modal').addEventListener('click', function(e){ if (e.target === this) closeModal(); });
  $('clear-results').addEventListener('click', function(){ results = []; renderResults(); save(); });
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(b){
    b.addEventListener('click', function(){
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(x){ x.classList.toggle('on', x === b); });
      Array.prototype.forEach.call(document.querySelectorAll('.tabpane'), function(p){ p.classList.toggle('on', p.id === 'tab-' + b.getAttribute('data-tab')); });
    });
  });
  document.addEventListener('keydown', function(e){
    var t = e.target && e.target.tagName;
    if (e.key === 'Escape' && !$('modal').hidden) { closeModal(); return; }
    if (t === 'TEXTAREA' || t === 'INPUT' || t === 'SELECT' || t === 'BUTTON') return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!$('modal').hidden) closeModal(); else spin(); }
  });
  window.addEventListener('resize', resize);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

  // ---------- 프리셋 ----------
  if (C.preset === 'number') {
    $('num-apply').addEventListener('click', function(){
      var a = parseInt($('num-from').value, 10), b = parseInt($('num-to').value, 10);
      if (isNaN(a) || isNaN(b)) return;
      if (b < a) { var t = a; a = b; b = t; }
      if (b - a + 1 > 1000) b = a + 999;
      entries = range(a, b); ta.value = entries.join('\n'); update();
    });
  }
  if (C.preset === 'yes-or-no') {
    var base2 = (C.entries || ['Yes', 'No']).slice(0, 2);
    $('yn-maybe').addEventListener('change', function(){
      var set = this.checked ? base2.concat([C.maybeWord || 'Maybe']) : base2;
      entries = []; for (var k = 0; k < 3; k++) entries = entries.concat(set);
      ta.value = entries.join('\n'); update();
    });
  }

  load(); renderResults(); resize(); update();
})();
