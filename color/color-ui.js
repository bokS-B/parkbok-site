// 색 도구 공통 UI 조각 (window.COLOR_UI): 문구 조회, 색 칩, 값 행+복사 버튼, 팔레트 격자, 토스트, 언어 전환.
// 색 계산은 /color/color.js(window.COLOR) 가 한다. 네트워크 코드 없음.
(function(){
  'use strict';
  var C = window.COLOR;
  var S = window.COLOR_STRINGS || {};
  var T = window.COLOR_TOOL || {};
  var TS = T.strings || {};

  function $(id){ return document.getElementById(id); }
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function fmt(s, vars){ return String(s).replace(/\{(\w+)\}/g, function(m, k){ return vars && k in vars ? vars[k] : m; }); }
  // 문구: 도구 문구 → 공통 문구 순. 없으면 키 그대로.
  function t(key, vars){
    var v = TS[key] != null ? TS[key] : S[key];
    if (v == null) return key;
    return vars ? fmt(v, vars) : v;
  }

  // ---------- 언어: 영어 페이지 첫 방문이면 브라우저 언어로 보내고, 선택 상자는 저장 후 이동 ----------
  (function(){
    if (T.lang !== 'en' || read('pb_lang')) return;
    var ua = navigator.userAgent || '';
    if (navigator.webdriver || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|lighthouse|headless/i.test(ua)) return;
    var prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < prefs.length; i++) {
      var code = String(prefs[i] || '').toLowerCase().split('-')[0];
      if (!code) continue;
      if (code === 'en') return;
      if (T.langUrls && T.langUrls[code]) { store('pb_lang', code); location.replace(T.langUrls[code] + location.search + location.hash); return; }
    }
  })();
  var langSel = $('lang');
  if (langSel) langSel.addEventListener('change', function(){
    var o = langSel.options[langSel.selectedIndex];
    store('pb_lang', o.getAttribute('data-code'));
    location.href = o.value + location.hash;
  });

  // ---------- 토스트 (1초) ----------
  var toastEl = null, toastTimer = 0;
  function toast(msg){
    if (!toastEl) { toastEl = el('div', 'c-toast'); toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 1000);
  }

  // ---------- 복사: 클립보드 API → 안 되면 숨은 textarea ----------
  function copy(text, silent){
    text = String(text);
    function done(){ if (!silent) toast(t('copied')); return true; }
    function fallback(){
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      return ok ? done() : false;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, fallback);
    return Promise.resolve(fallback());
  }

  // ---------- 색 칩: 배경색 + HEX 라벨, 클릭하면 복사 (opts.onPick 이 있으면 대신 호출) ----------
  function swatch(hex, opts){
    opts = opts || {};
    var b = el('button', 'cswatch' + (opts.large ? ' lg' : '') + (opts.cls ? ' ' + opts.cls : ''));
    b.type = 'button';
    setSwatch(b, hex, opts);
    b.addEventListener('click', function(){ if (opts.onPick) opts.onPick(b.getAttribute('data-hex'), b); else copy(b.getAttribute('data-hex')); });
    return b;
  }
  function setSwatch(b, hex, opts){
    opts = opts || {};
    var label = opts.label != null ? opts.label : hex;
    b.setAttribute('data-hex', hex);
    b.style.background = hex;
    b.style.color = C.textOn(hex);
    b.title = hex;
    b.setAttribute('aria-label', (opts.aria || t('copy')) + ' ' + hex);
    b.textContent = '';
    if (label !== false) b.appendChild(el('span', 'cl', label));
  }

  // ---------- 팔레트 격자 ----------
  function palette(hexes, opts){
    opts = opts || {};
    var g = el('div', 'cpal' + (opts.cls ? ' ' + opts.cls : ''));
    g.style.setProperty('--cols', String(opts.cols || hexes.length || 1));
    for (var i = 0; i < hexes.length; i++) g.appendChild(swatch(hexes[i], opts));
    return g;
  }
  // 이미 있는 격자의 색만 갈아 끼운다 (칸 수가 같을 때)
  function setPalette(g, hexes, opts){
    var kids = g.children;
    if (kids.length !== hexes.length) { g.textContent = ''; for (var j = 0; j < hexes.length; j++) g.appendChild(swatch(hexes[j], opts)); return; }
    for (var i = 0; i < hexes.length; i++) setSwatch(kids[i], hexes[i], opts);
  }

  // ---------- 행별 복사: 중립 아이콘 버튼 44×44 (아이콘은 color.css 의 --i-copy). 대표 복사만 파란 .btn 을 쓴다 ----------
  function copyBtn(label, getText){
    var b = el('button', 'icp');
    b.type = 'button';
    b.title = t('copy');
    b.setAttribute('aria-label', t('copy') + ' ' + label);
    if (getText) b.addEventListener('click', function(){ copy(getText()); });
    return b;
  }

  // ---------- 값 행: 라벨 · 값 · 복사 아이콘 (opts.noCopy 면 아이콘 없음) ----------
  function valueRow(label, value, opts){
    opts = opts || {};
    var row = el('div', 'vrow');
    var l = el('span', 'vl', label), v = el('code', 'vv', value);
    if (opts.swatch) { var sw = el('span', 'vs'); sw.setAttribute('aria-hidden', 'true'); row.appendChild(sw); }
    row.appendChild(l); row.appendChild(v);
    if (!opts.noCopy) row.appendChild(copyBtn(label, function(){ return v.textContent; }));
    return { el: row, set: function(val, hex){ v.textContent = val; if (opts.swatch && hex) row.firstChild.style.background = hex; } };
  }

  // ---------- 제목 줄 + 내용 ----------
  function section(title, node, sub){
    var s = el('div', 'c-sec'), h = el('div', 'c-sec-title');
    h.appendChild(el('span', null, title));
    if (sub) h.appendChild(el('span', 'muted', sub));
    s.appendChild(h);
    if (node) s.appendChild(node);
    return s;
  }

  window.COLOR_UI = { t: t, el: el, $: $, store: store, read: read, toast: toast, copy: copy, swatch: swatch, setSwatch: setSwatch, palette: palette, setPalette: setPalette, valueRow: valueRow, copyBtn: copyBtn, section: section };
})();
