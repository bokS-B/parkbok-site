// 이미지 도구 공통 엔진 (window.IMGT). 파일 입력 → 옵션 → 실행 → 결과 내려받기까지 담당하고, 각 도구는 image/tools/<id>.js 가 register 한다.
// 파일은 어디로도 보내지 않는다(네트워크 코드 없음). JSZip·libheif 는 /assets/vendor/ 에서 필요할 때만 지연 로드한다.
(function(){
  'use strict';
  var S = window.IMGT_STRINGS || {};
  var T = window.IMGT_TOOL || {};
  var TS = T.strings || {};
  var VENDOR = '/assets/vendor/';
  var THUMB_W = 160, THUMB_MAX = 60, EDIT_W = 720, MIN_RECT = 4;
  var EXT_RE = /\.(png|jpe?g|webp|gif|bmp|heic|heif|tiff?|svg|avif|ico)$/i;
  var MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/tiff': 'tiff', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };

  function $(id){ return document.getElementById(id); }
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function fmt(s, vars){ return String(s).replace(/\{(\w+)\}/g, function(m, k){ return vars && k in vars ? vars[k] : m; }); }
  // 문구: 도구 문구 → 공통 문구 순으로 찾는다. 없으면 키 그대로.
  function t(key, vars){
    var v = TS[key] != null ? TS[key] : S[key];
    if (v == null) return key;
    return vars ? fmt(v, vars) : v;
  }
  function optStr(optId, field, choice){
    var o = TS.options && TS.options[optId];
    if (!o) return choice != null ? choice : optId;
    if (choice != null) return (o.choices && o.choices[choice] != null) ? o.choices[choice] : choice;
    return o[field] != null ? o[field] : (field === 'label' ? optId : '');
  }
  function human(n){ if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'; }
  function extOf(name){ var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function err(key){ var e = new Error(key); e.key = key; return e; }

  // ---------- 첫 방문 언어 리다이렉트 (룰렛·PDF 와 동일, localStorage 'pb_lang' 공유) ----------
  var redirected = (function(){
    if (T.lang !== 'en' || read('pb_lang')) return false;
    var ua = navigator.userAgent || '';
    if (navigator.webdriver || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|lighthouse|headless/i.test(ua)) return false;
    var prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < prefs.length; i++) {
      var code = String(prefs[i] || '').toLowerCase().split('-')[0];
      if (!code) continue;
      if (code === 'en') return false;
      if (T.langUrls && T.langUrls[code]) { store('pb_lang', code); location.replace(T.langUrls[code] + location.search + location.hash); return true; }
    }
    return false;
  })();

  var langSel = $('lang');
  if (langSel) langSel.addEventListener('change', function(){
    var o = langSel.options[langSel.selectedIndex];
    store('pb_lang', o.getAttribute('data-code'));
    location.href = o.value + location.hash;
  });

  // ---------- 라이브러리 지연 로드 ----------
  var scriptP = {};
  function loadScript(src){
    if (scriptP[src]) return scriptP[src];
    scriptP[src] = new Promise(function(res, rej){
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = function(){ res(); }; s.onerror = function(){ delete scriptP[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
    return scriptP[src];
  }
  function ensureJSZip(){ return window.JSZip ? Promise.resolve(window.JSZip) : loadScript(VENDOR + 'jszip.min.js').then(function(){ return window.JSZip; }); }
  // libheif 번들은 전역 libheif 가 모듈 팩토리(함수)다. 한 번만 만들고 ready 를 기다린 모듈 객체를 돌려준다.
  var heifP = null;
  function ensureLibheif(){
    if (heifP) return heifP;
    heifP = (window.libheif ? Promise.resolve() : loadScript(VENDOR + 'libheif-bundle.js')).then(function(){
      var lib = window.libheif; if (!lib) throw err('errorHeic');
      var m = typeof lib === 'function' ? lib() : lib;
      return Promise.resolve(m && m.ready ? m.ready : m).then(function(r){ var mod = (r && r.HeifDecoder) ? r : m; if (!mod || typeof mod.HeifDecoder !== 'function') throw err('errorHeic'); return mod; });
    });
    heifP.catch(function(){ heifP = null; });
    return heifP;
  }

  // ---------- 캔버스 / 이미지 유틸 ----------
  function mkCanvas(w, h){
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    var g = c.getContext('2d'); if (g) { g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) {} }
    return c;
  }
  function dims(img){ return { w: img.naturalWidth || img.videoWidth || img.width || 0, h: img.naturalHeight || img.videoHeight || img.height || 0 }; }
  function release(img){ if (img && typeof img.close === 'function') { try { img.close(); } catch (e) {} } }
  function toBlob(c, mime, q){
    return new Promise(function(res, rej){
      if (typeof c.toBlob === 'function') {
        c.toBlob(function(b){ b ? res(b) : rej(new Error('toBlob')); }, mime || 'image/png', q);
      } else {
        try {
          var d = c.toDataURL(mime || 'image/png', q).split(','), bin = atob(d[1]), u = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          res(new Blob([u], { type: (d[0].split(':')[1] || '').split(';')[0] || mime }));
        } catch (e) { rej(e); }
      }
    });
  }
  // 긴 변이 maxW/maxH 안에 들어오도록 줄인 캔버스. 큰 이미지는 절반씩 단계 축소해 메모리·화질을 지킨다.
  function scaleTo(img, maxW, maxH){
    var d = dims(img), w = d.w, h = d.h;
    maxH = maxH || maxW;
    var s = Math.min(maxW / w, maxH / h, 1), ow = Math.max(1, Math.round(w * s)), oh = Math.max(1, Math.round(h * s));
    var cur = img, cw = w, ch = h;
    while (cw >= ow * 2 && ch >= oh * 2 && cw > 1 && ch > 1) {
      var nw = Math.max(ow, Math.floor(cw / 2)), nh = Math.max(oh, Math.floor(ch / 2));
      var c = mkCanvas(nw, nh); c.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
      if (cur !== img) { cur.width = cur.height = 1; }
      cur = c; cw = nw; ch = nh;
    }
    if (cur === img || cw !== ow || ch !== oh) { var out = mkCanvas(ow, oh); out.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, ow, oh); if (cur !== img) { cur.width = cur.height = 1; } cur = out; }
    return cur;
  }

  // JPEG EXIF 방향값(1~8). 없거나 읽지 못하면 1. 앞 128KB 만 읽는다.
  function exifOrientation(f){
    var file = f && f.file ? f.file : f;
    if (!file || !(file.slice)) return Promise.resolve(1);
    return file.slice(0, 131072).arrayBuffer().then(function(buf){
      var b = new Uint8Array(buf), n = b.length;
      if (n < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return 1;
      var i = 2;
      while (i + 4 < n && b[i] === 0xFF) {
        var m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
        if (m === 0xDA || m === 0xD9) break;
        if (m === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
          var tf = i + 10; if (tf + 8 > n) return 1;
          var le = b[tf] === 0x49 && b[tf + 1] === 0x49;
          var r16 = function(p){ return le ? (b[p] | (b[p + 1] << 8)) : ((b[p] << 8) | b[p + 1]); };
          var r32 = function(p){ return le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; };
          var ifd = tf + r32(tf + 4); if (ifd + 2 > n) return 1;
          var cnt = r16(ifd);
          for (var k = 0; k < cnt; k++) {
            var e = ifd + 2 + k * 12; if (e + 12 > n) return 1;
            if (r16(e) === 0x0112) { var v = r16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
          }
          return 1;
        }
        i += 2 + len;
      }
      return 1;
    }, function(){ return 1; });
  }
  // EXIF 방향을 적용해 바로 보이는 캔버스로 만든다 (브라우저가 자동 적용하지 못할 때만 사용)
  function orient(img, o){
    var d = dims(img), w = d.w, h = d.h, swap = o >= 5;
    var c = mkCanvas(swap ? h : w, swap ? w : h), g = c.getContext('2d');
    switch (o) {
      case 2: g.transform(-1, 0, 0, 1, w, 0); break;
      case 3: g.transform(-1, 0, 0, -1, w, h); break;
      case 4: g.transform(1, 0, 0, -1, 0, h); break;
      case 5: g.transform(0, 1, 1, 0, 0, 0); break;
      case 6: g.transform(0, 1, -1, 0, h, 0); break;
      case 7: g.transform(0, -1, -1, 0, h, w); break;
      case 8: g.transform(0, -1, 1, 0, 0, w); break;
    }
    g.drawImage(img, 0, 0);
    return c;
  }
  var autoOrient = !!(window.CSS && CSS.supports && CSS.supports('image-orientation', 'from-image'));

  function isHeicName(f){ var e = extOf(f.name), ty = (f.type || '').toLowerCase(); return e === 'heic' || e === 'heif' || ty === 'image/heic' || ty === 'image/heif'; }
  // ftyp 박스의 브랜드로 HEIC 판별 (확장자가 틀린 파일 대비)
  function isHeicFile(file){
    if (isHeicName(file)) return Promise.resolve(true);
    return file.slice(0, 32).arrayBuffer().then(function(buf){
      var b = new Uint8Array(buf); if (b.length < 12) return false;
      if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) return false;
      var brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
      return /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand);
    }, function(){ return false; });
  }
  function viaImg(file){
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function(){ URL.revokeObjectURL(u); res(img); };
      img.onerror = function(){ URL.revokeObjectURL(u); rej(err('errorBroken')); };
      img.src = u;
    }).then(function(img){
      if (autoOrient || !/jpe?g/i.test(extOf(file.name) + (file.type || ''))) return img;
      return exifOrientation(file).then(function(o){ return o > 1 ? orient(img, o) : img; });
    });
  }
  function decodeHeic(file){
    var heif = null;
    return ensureLibheif().then(function(mod){ heif = mod; return file.arrayBuffer(); }).then(function(buf){
      var data;
      try { data = new heif.HeifDecoder().decode(new Uint8Array(buf)); } catch (e) { throw err('errorHeic'); }
      if (!data || !data.length) throw err('errorHeic');
      var im = data[0], w = im.get_width(), h = im.get_height();
      if (!(w > 0 && h > 0)) throw err('errorHeic');
      var c = mkCanvas(w, h), g = c.getContext('2d'), id = g.createImageData(w, h);
      return new Promise(function(res, rej){
        try { im.display(id, function(d){ d ? res() : rej(err('errorHeic')); }); } catch (e) { rej(err('errorHeic')); }
      }).then(function(){
        g.putImageData(id, 0, 0);
        try { data.forEach(function(x){ if (x.free) x.free(); }); } catch (e) {}
        return c;
      });
    });
  }
  // 파일(File 또는 엔진 파일 레코드) → ImageBitmap / HTMLImageElement / canvas. EXIF 방향은 여기서 반영된다.
  function loadImage(f){
    var file = f && f.file ? f.file : f;
    if (!file) return Promise.reject(err('errorBroken'));
    return isHeicFile(file).then(function(heic){
      if (heic) return decodeHeic(file).then(function(c){ return window.createImageBitmap ? createImageBitmap(c).catch(function(){ return c; }) : c; });
      if (!window.createImageBitmap) return viaImg(file);
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function(){ return createImageBitmap(file); }).catch(function(){ return viaImg(file); });
    });
  }

  // ---------- 상태 ----------
  var tool = null, files = [], pages = [], outputs = [], urls = [], busy = false, optUI = {}, inputBytes = 0;
  var dom = {};
  function setStatus(msg, kind, target){
    var s = target || dom.status; if (!s) return;
    s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : '');
    if (dom.inStatus && !target) { dom.inStatus.textContent = ''; dom.inStatus.className = 'status'; }
  }
  function revokeAll(){ urls.forEach(function(u){ try { URL.revokeObjectURL(u); } catch (e) {} }); urls = []; }
  function objUrl(blob){ var u = URL.createObjectURL(blob); urls.push(u); return u; }

  function acceptList(){ return (tool.accept || 'image/*').split(',').map(function(a){ return a.trim().toLowerCase(); }).filter(Boolean); }
  function acceptsFile(f){
    var acc = acceptList(), name = (f.name || '').toLowerCase(), type = (f.type || '').toLowerCase(), e = extOf(name);
    for (var i = 0; i < acc.length; i++) {
      var a = acc[i];
      if (a === 'image/*') { if (/^image\//.test(type) || EXT_RE.test(name)) return true; }
      else if (a.charAt(0) === '.') { if (name.slice(-a.length) === a) return true; if (MIME_EXT[type] && '.' + MIME_EXT[type] === a) return true; if (a === '.jpg' && (e === 'jpeg' || type === 'image/jpeg')) return true; }
      else if (a.slice(-2) === '/*') { if (type.indexOf(a.slice(0, -1)) === 0) return true; }
      else if (type === a) return true;
      else if (MIME_EXT[a] && (e === MIME_EXT[a] || (MIME_EXT[a] === 'jpg' && e === 'jpeg'))) return true;
    }
    return false;
  }
  function acceptLabel(){
    var out = [];
    acceptList().forEach(function(a){
      var x = a === 'image/*' ? 'JPG/PNG/WebP/HEIC' : a.charAt(0) === '.' ? a.slice(1).toUpperCase() : (MIME_EXT[a] || '').toUpperCase();
      if (x === 'JPEG') x = 'JPG'; if (x === 'WEBP') x = 'WebP';
      if (x && out.indexOf(x) < 0) out.push(x);
    });
    return out.join('/') || 'JPG/PNG';
  }

  // ---------- 파일 추가 ----------
  function addFiles(list){
    if (busy || !list || !list.length) return;
    var arr = Array.prototype.slice.call(list).filter(function(f){ return f && f.size > 0; });
    if (!tool.multiple) { arr = arr.slice(0, 1); files = []; pages = []; }
    var bad = arr.filter(function(f){ return !acceptsFile(f); });
    arr = arr.filter(acceptsFile);
    if (bad.length) setStatus(t('errorType', { type: acceptLabel() }), 'err', files.length ? null : dom.inStatus);
    if (!arr.length) return;
    setBusy(true);
    setStatus(t('loadingLib'), 'busy', files.length ? null : dom.inStatus);
    var chain = Promise.resolve(), firstErr = null, n = 0;
    arr.forEach(function(f){
      chain = chain.then(function(){
        n++; if (arr.length > 1) setStatus(t('processing') + ' ' + n + '/' + arr.length, 'busy', files.length ? null : dom.inStatus);
        return readOne(f);
      }).then(function(rec){ if (rec) files.push(rec); }, function(e){ if (!firstErr) firstErr = e; });
    });
    chain.then(function(){
      setBusy(false);
      rebuildPages();
      if (!files.length) { reset(); setStatus(t(firstErr && firstErr.key ? firstErr.key : 'errorBroken'), 'err', dom.inStatus); return; }
      afterInput();
      if (firstErr) setStatus(t(firstErr.key || 'errorBroken'), 'err');
    });
  }
  function readOne(f){
    return loadImage(f).then(function(img){
      var d = dims(img);
      if (!(d.w > 0 && d.h > 0)) { release(img); throw err('errorBroken'); }
      var rec = { name: f.name || ('image.' + (MIME_EXT[f.type] || 'png')), type: f.type || '', size: f.size, file: f, width: d.w, height: d.h, thumb: null };
      if (files.length < THUMB_MAX) { try { rec.thumb = scaleTo(img, THUMB_W, THUMB_W).toDataURL('image/jpeg', 0.8); } catch (e) {} }
      release(img);
      return rec;
    }, function(e){ throw (e && e.key) ? e : err('errorBroken'); });
  }
  function rebuildPages(){ pages = files.map(function(f, i){ return { file: i, index: 0, width: f.width, height: f.height, thumb: f.thumb, name: f.name }; }); }
  function removeFile(i){
    if (busy) return;
    files.splice(i, 1);
    if (!files.length) { reset(); return; }
    rebuildPages(); afterInput();
  }
  function moveFile(i, d){
    var j = i + d; if (busy || j < 0 || j >= files.length) return;
    var x = files[i]; files[i] = files[j]; files[j] = x;
    rebuildPages(); afterInput();
  }

  // ---------- 화면 ----------
  function setBusy(b){
    busy = b; document.body.classList.toggle('busy', b);
    if (dom.primary) dom.primary.disabled = b || !files.length;
    if (dom.reset) dom.reset.disabled = b;
  }
  function afterInput(){
    document.body.classList.add('has-input'); document.body.classList.remove('done');
    outputs = []; revokeAll();
    dom.result.hidden = true; dom.result.innerHTML = '';
    dom.progress.hidden = true;
    dom.count.textContent = files.length === 1 ? t('fileCount') : t('filesCount', { n: files.length });
    dom.compact.hidden = false;
    dom.btnAdd.hidden = !tool.multiple;
    dom.out.hidden = false;
    dom.primary.textContent = t('runText'); dom.primary.disabled = false;
    renderFiles();
    renderOptions();
    setStatus('', '');
    if (tool.minFiles > files.length) { setStatus(t('errorEmpty', { n: tool.minFiles }), 'empty'); dom.primary.disabled = true; }
  }
  function renderFiles(){
    var ul = dom.files; ul.innerHTML = '';
    files.forEach(function(f, i){
      var li = el('li', 'file');
      if (f.thumb) { var im = el('img', 'file-thumb'); im.src = f.thumb; im.alt = ''; im.draggable = false; li.appendChild(im); }
      else li.appendChild(el('span', 'file-ic', (extOf(f.name) || 'img').toUpperCase().slice(0, 4)));
      var nm = el('span', 'file-name', f.name); nm.title = f.name;
      var meta = el('span', 'file-meta', f.width + '×' + f.height + ' · ' + human(f.size));
      li.appendChild(nm); li.appendChild(meta);
      var ctl = el('span', 'file-ctl');
      if (tool.multiple && files.length > 1) {
        var up = el('button', 'ibtn', '↑'); up.type = 'button'; up.setAttribute('aria-label', t('moveUp')); up.title = t('moveUp'); up.disabled = i === 0; up.addEventListener('click', function(){ moveFile(i, -1); });
        var dn = el('button', 'ibtn', '↓'); dn.type = 'button'; dn.setAttribute('aria-label', t('moveDown')); dn.title = t('moveDown'); dn.disabled = i === files.length - 1; dn.addEventListener('click', function(){ moveFile(i, 1); });
        ctl.appendChild(up); ctl.appendChild(dn);
      }
      var rm = el('button', 'ibtn rm', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', t('remove')); rm.title = t('remove'); rm.addEventListener('click', function(){ removeFile(i); });
      ctl.appendChild(rm); li.appendChild(ctl);
      ul.appendChild(li);
    });
  }

  // ---------- 옵션 패널 ----------
  var optListeners = [], mqUnbind = [];
  var DESKTOP_MQ = window.matchMedia ? window.matchMedia('(min-width:1024px)') : null;
  function renderOptions(){
    var opts = tool.options || [], box = dom.opts;
    box.innerHTML = ''; optUI = {}; optListeners = [];
    mqUnbind.forEach(function(fn){ fn(); }); mqUnbind = [];
    if (!opts.length) { box.hidden = true; return; }
    box.setAttribute('data-tool', tool.id); box.setAttribute('data-layout', tool.layout || '');
    // layout:'split' 이면 편집기(crop/blur) 행만 바로 넣고 나머지 옵션은 .opt-side 에 모은다 (데스크톱 2열, 모바일은 CSS order 로 편집기를 앞에)
    var side = tool.layout === 'split' ? el('div', 'opt-side') : null;
    if (side) box.appendChild(side);
    // o.group: 같은 이름끼리 <details class="opt-group"> 로 묶는다. 1024px 미만은 접힌 채 시작, 데스크톱은 항상 펼친다 (문구: 도구 strings.groups)
    var groups = {};
    function groupBox(name){
      if (groups[name]) return groups[name];
      var d = el('details', 'opt-group'), sm = el('summary', null, (TS.groups && TS.groups[name]) || name);
      d.setAttribute('data-group', name); d.appendChild(sm);
      var manual = false;
      sm.addEventListener('click', function(){ manual = true; });
      function sync(){ if (DESKTOP_MQ ? DESKTOP_MQ.matches : window.innerWidth >= 1024) d.open = true; else if (!manual) d.open = false; }
      sync();
      // 창 크기 변경에 따라 열림 상태를 맞춘다 (matchMedia change 와 resize 둘 다 듣는다)
      window.addEventListener('resize', sync);
      mqUnbind.push(function(){ window.removeEventListener('resize', sync); });
      if (DESKTOP_MQ) { if (DESKTOP_MQ.addEventListener) DESKTOP_MQ.addEventListener('change', sync); else DESKTOP_MQ.addListener(sync); mqUnbind.push(function(){ if (DESKTOP_MQ.removeEventListener) DESKTOP_MQ.removeEventListener('change', sync); else DESKTOP_MQ.removeListener(sync); }); }
      (side || box).appendChild(d);
      groups[name] = d; return d;
    }
    opts.forEach(function(o){
      var row = el('div', 'opt opt-' + o.type); row.setAttribute('data-opt', o.id);
      var r = renderers[o.type] || (tool.renderers && tool.renderers[o.type]); if (!r) return;
      r(o, row, widgetApi());
      var help = optStr(o.id, 'help');
      if (help && o.type !== 'text' && o.type !== 'number') row.appendChild(el('small', 'opt-help', help));
      (o.group ? groupBox(o.group) : (side && o.type !== 'crop' && o.type !== 'blur-regions' ? side : box)).appendChild(row);
    });
    box.hidden = false;
    if (!box.__bound) { box.__bound = true; box.addEventListener('change', onOptChange); box.addEventListener('input', onOptChange); }
    applyShowIf();
  }
  function onOptChange(){ applyShowIf(); optListeners.forEach(function(fn){ try { fn(); } catch (e) {} }); }
  function applyShowIf(){
    (tool.options || []).forEach(function(o){
      if (!o.showIf) return;
      var row = dom.opts.querySelector('[data-opt="' + o.id + '"]'); if (!row) return;
      var show = true;
      Object.keys(o.showIf).forEach(function(k){
        var want = o.showIf[k], cur = getValue(k);
        if (Array.isArray(want) ? want.indexOf(cur) < 0 : cur !== want) show = false;
      });
      row.hidden = !show;
    });
  }
  function getValue(id){ var u = optUI[id]; return u ? u.get() : undefined; }
  // 도구 자체 위젯(tool.renderers)에 주는 도우미: 값 등록, 다른 옵션 읽기, 첫 파일, 문구, 변경 구독
  function widgetApi(){
    return { el: el, t: t, optStr: optStr, getValue: getValue, files: function(){ return files.slice(); }, loadImage: loadImage, scaleTo: scaleTo, release: release, dims: dims,
      set: function(id, get, set){ optUI[id] = { get: get, set: set }; }, onChange: function(fn){ optListeners.push(fn); }, changed: onOptChange, busy: function(){ return busy; } };
  }
  function getOpts(){ var v = {}; Object.keys(optUI).forEach(function(k){ v[k] = optUI[k].get(); }); return v; }
  function labelFor(o, row, forId){ var lb = el('label', 'opt-label', optStr(o.id, 'label')); if (forId) lb.htmlFor = forId; row.appendChild(lb); return lb; }

  var renderers = {
    text: function(o, row){
      var id = 'opt-' + o.id; labelFor(o, row, id);
      var inp = el('input'); inp.type = 'text'; inp.id = id; inp.value = o.default != null ? o.default : ''; inp.placeholder = optStr(o.id, 'help') || ''; inp.autocomplete = 'off';
      if (o.maxlength) inp.maxLength = o.maxlength;
      row.appendChild(inp); optUI[o.id] = { get: function(){ return inp.value; } };
    },
    number: function(o, row){
      var id = 'opt-' + o.id; labelFor(o, row, id);
      var inp = el('input'); inp.type = 'number'; inp.id = id; inp.value = o.default != null ? o.default : '';
      if (o.min != null) inp.min = o.min; if (o.max != null) inp.max = o.max; if (o.step != null) inp.step = o.step;
      var help = optStr(o.id, 'help'); if (help) inp.placeholder = help;
      if (o.unit) { var w = el('span', 'num-wrap'); w.appendChild(inp); w.appendChild(el('span', 'num-unit', o.unit)); row.appendChild(w); } else row.appendChild(inp);
      optUI[o.id] = { get: function(){ var n = parseFloat(inp.value); return isNaN(n) ? (o.default != null ? o.default : 0) : n; }, set: function(v){ inp.value = v; } };
    },
    select: function(o, row){
      var id = 'opt-' + o.id; labelFor(o, row, id);
      var sel = el('select'); sel.id = id;
      (o.choices || []).forEach(function(c){ var op = el('option', null, optStr(o.id, null, c)); op.value = c; if (c === o.default) op.selected = true; sel.appendChild(op); });
      row.appendChild(sel); optUI[o.id] = { get: function(){ return sel.value; } };
    },
    radio: function(o, row){
      labelFor(o, row);
      var g = el('div', 'radio-group'); g.setAttribute('role', 'radiogroup');
      (o.choices || []).forEach(function(c){
        var lb = el('label', 'radio'); var inp = el('input'); inp.type = 'radio'; inp.name = 'opt-' + o.id; inp.value = c; inp.checked = c === o.default;
        lb.appendChild(inp); lb.appendChild(document.createTextNode(optStr(o.id, null, c))); g.appendChild(lb);
      });
      row.appendChild(g); optUI[o.id] = { get: function(){ var c = g.querySelector('input:checked'); return c ? c.value : o.default; } };
    },
    checkbox: function(o, row){
      var lb = el('label', 'check'); var inp = el('input'); inp.type = 'checkbox'; inp.checked = !!o.default;
      lb.appendChild(inp); lb.appendChild(document.createTextNode(optStr(o.id, 'label')));
      row.appendChild(lb); optUI[o.id] = { get: function(){ return inp.checked; } };
    },
    range: function(o, row){
      var id = 'opt-' + o.id; labelFor(o, row, id);
      var inp = el('input'); inp.type = 'range'; inp.id = id; inp.min = o.min != null ? o.min : 0; inp.max = o.max != null ? o.max : 100; inp.step = o.step != null ? o.step : 1; inp.value = o.default != null ? o.default : inp.min;
      var val = el('span', 'range-val', inp.value + (o.unit || ''));
      inp.addEventListener('input', function(){ val.textContent = inp.value + (o.unit || ''); });
      var w = el('div', 'range-wrap'); w.appendChild(inp); w.appendChild(val); row.appendChild(w);
      optUI[o.id] = { get: function(){ return parseFloat(inp.value); } };
    },
    color: function(o, row){
      var id = 'opt-' + o.id; labelFor(o, row, id);
      var inp = el('input'); inp.type = 'color'; inp.id = id; inp.value = o.default || '#000000';
      row.appendChild(inp); optUI[o.id] = { get: function(){ return inp.value; } };
    },
    position: function(o, row){
      labelFor(o, row);
      var g = el('div', 'pos-grid'), cur = o.default || 'br', cells = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
      var btns = cells.map(function(c){
        var b = el('button', 'pos' + (c === cur ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-label', c); b.setAttribute('aria-pressed', c === cur ? 'true' : 'false');
        b.addEventListener('click', function(){ cur = c; btns.forEach(function(x, i){ x.classList.toggle('on', cells[i] === c); x.setAttribute('aria-pressed', cells[i] === c ? 'true' : 'false'); }); });
        g.appendChild(b); return b;
      });
      row.appendChild(g); optUI[o.id] = { get: function(){ return cur; } };
    },
    signature: function(o, row){
      labelFor(o, row);
      var pad = el('div', 'sig-pad'), c = el('canvas'), hint = el('span', 'sig-hint', t('drawHere'));
      pad.appendChild(c); pad.appendChild(hint); row.appendChild(pad);
      var ctx = c.getContext('2d'), drawing = false, dirty = false, uploaded = '', last = null, dpr = window.devicePixelRatio || 1;
      function size(){
        var w = pad.clientWidth || 320, h = Math.round(w * 0.4);
        var keep = dirty ? c.toDataURL() : '';
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = o.color || '#111';
        if (keep) { var im = new Image(); im.onload = function(){ ctx.drawImage(im, 0, 0, w, h); }; im.src = keep; }
      }
      function pt(e){ var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      c.addEventListener('pointerdown', function(e){ e.preventDefault(); c.setPointerCapture(e.pointerId); drawing = true; last = pt(e); uploaded = ''; });
      c.addEventListener('pointermove', function(e){ if (!drawing) return; e.preventDefault(); var p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; dirty = true; hint.hidden = true; });
      function up(){ drawing = false; }
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up); c.addEventListener('pointerleave', up);
      var ctl = el('div', 'row');
      var clr = el('button', 'btn ghost sm', t('clear')); clr.type = 'button';
      clr.addEventListener('click', function(){ ctx.clearRect(0, 0, c.width, c.height); dirty = false; uploaded = ''; hint.hidden = false; });
      var upl = el('button', 'btn ghost sm', t('upload')); upl.type = 'button';
      var fi = el('input'); fi.type = 'file'; fi.accept = 'image/png,image/jpeg,image/webp'; fi.hidden = true;
      upl.addEventListener('click', function(){ fi.click(); });
      fi.addEventListener('change', function(){
        var f = fi.files && fi.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function(){
          var im = new Image();
          im.onload = function(){
            ctx.clearRect(0, 0, c.width, c.height);
            var w = c.width / dpr, h = c.height / dpr, s = Math.min(w / im.width, h / im.height, 1), dw = im.width * s, dh = im.height * s;
            ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh); dirty = true; hint.hidden = true;
            uploaded = /^data:image\/png/.test(rd.result) ? rd.result : '';
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(f); fi.value = '';
      });
      ctl.appendChild(clr); ctl.appendChild(upl); ctl.appendChild(fi); row.appendChild(ctl);
      setTimeout(size, 0); window.addEventListener('resize', size);
      optUI[o.id] = { get: function(){ if (uploaded) return uploaded; return dirty ? c.toDataURL('image/png') : ''; } };
    },
    // 이미지 썸네일 격자: select(여러 장 선택) / order(순서·회전·삭제) / single(한 장)
    pages: function(o, row){
      var mode = o.mode || 'select';
      var head = el('div', 'pages-head');
      head.appendChild(el('span', 'opt-label', optStr(o.id, 'label') || t('images', { n: pages.length })));
      var grid = el('div', 'pages-grid');
      var state = { sel: {}, order: [], single: 0 };
      if (mode === 'select' && o.default === 'all') pages.forEach(function(p, i){ state.sel[i] = true; });
      if (mode === 'order') state.order = pages.map(function(p, i){ return { index: i, rotate: 0, deleted: false }; });
      if (mode === 'single') state.single = o.default != null ? o.default : 0;
      var info = el('span', 'muted pages-info');
      function count(){
        if (mode === 'select') info.textContent = t('selected', { n: Object.keys(state.sel).filter(function(k){ return state.sel[k]; }).length });
        else if (mode === 'order') info.textContent = t('images', { n: state.order.filter(function(x){ return !x.deleted; }).length });
        else info.textContent = t('imageN', { n: state.single + 1 });
      }
      if (mode === 'select') {
        var all = el('button', 'btn ghost sm', t('selectAll')); all.type = 'button'; all.addEventListener('click', function(){ pages.forEach(function(p, i){ state.sel[i] = true; }); draw(); });
        var none = el('button', 'btn ghost sm', t('clearAll')); none.type = 'button'; none.addEventListener('click', function(){ state.sel = {}; draw(); });
        head.appendChild(all); head.appendChild(none);
      }
      head.appendChild(info); row.appendChild(head); row.appendChild(grid);
      function thumbEl(p, i){
        var d = el('div', 'pg');
        if (p.thumb) { var im = el('img'); im.src = p.thumb; im.alt = t('imageN', { n: i + 1 }); im.draggable = false; d.appendChild(im); }
        else { var ph = el('div', 'pg-ph', String(i + 1)); if (p.width && p.height) ph.style.aspectRatio = p.width + '/' + p.height; d.appendChild(ph); }
        var lb = el('span', 'pg-n', String(i + 1)); lb.title = p.name || ''; d.appendChild(lb);
        return d;
      }
      function draw(){
        grid.innerHTML = '';
        if (mode === 'order') {
          state.order.forEach(function(it, pos){
            var p = pages[it.index], d = thumbEl(p, it.index);
            d.classList.toggle('deleted', it.deleted); d.classList.add('ord');
            var im = d.firstChild; if (im) im.style.transform = 'rotate(' + it.rotate + 'deg)';
            var ctl = el('div', 'pg-ctl');
            var l = el('button', 'ibtn', '←'); l.type = 'button'; l.setAttribute('aria-label', t('moveLeft')); l.disabled = pos === 0; l.addEventListener('click', function(){ var x = state.order[pos]; state.order[pos] = state.order[pos - 1]; state.order[pos - 1] = x; draw(); });
            var r = el('button', 'ibtn', '→'); r.type = 'button'; r.setAttribute('aria-label', t('moveRight')); r.disabled = pos === state.order.length - 1; r.addEventListener('click', function(){ var x = state.order[pos]; state.order[pos] = state.order[pos + 1]; state.order[pos + 1] = x; draw(); });
            var ro = el('button', 'ibtn', '⟳'); ro.type = 'button'; ro.setAttribute('aria-label', t('rotate')); ro.addEventListener('click', function(){ it.rotate = (it.rotate + 90) % 360; draw(); });
            var dl = el('button', 'ibtn rm', it.deleted ? '↺' : '✕'); dl.type = 'button'; dl.setAttribute('aria-label', it.deleted ? t('restore') : t('delete')); dl.addEventListener('click', function(){ it.deleted = !it.deleted; draw(); });
            ctl.appendChild(l); ctl.appendChild(r); ctl.appendChild(ro); ctl.appendChild(dl); d.appendChild(ctl);
            grid.appendChild(d);
          });
        } else {
          pages.forEach(function(p, i){
            var d = thumbEl(p, i); d.tabIndex = 0; d.setAttribute('role', mode === 'single' ? 'radio' : 'checkbox');
            var on = mode === 'single' ? state.single === i : !!state.sel[i];
            d.classList.toggle('on', on); d.setAttribute('aria-checked', on ? 'true' : 'false');
            function toggle(){ if (mode === 'single') state.single = i; else state.sel[i] = !state.sel[i]; draw(); }
            d.addEventListener('click', toggle);
            d.addEventListener('keydown', function(e){ if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
            grid.appendChild(d);
          });
        }
        var hidden = pages.length - Math.min(pages.length, THUMB_MAX);
        if (hidden > 0) grid.appendChild(el('div', 'muted pages-more', t('moreImages', { n: hidden })));
        count();
      }
      draw();
      optUI[o.id] = { get: function(){
        if (mode === 'single') return state.single;
        if (mode === 'order') return state.order.map(function(x){ return { index: x.index, rotate: x.rotate, deleted: x.deleted }; });
        return pages.map(function(p, i){ return i; }).filter(function(i){ return !!state.sel[i]; });
      } };
    },
    crop: function(o, row){ rectEditor(o, row, false); },
    'blur-regions': function(o, row){ rectEditor(o, row, true); }
  };

  // 첫 이미지 위에 사각형을 드래그로 그리는 편집기. 값은 원본 픽셀 단위 {x,y,w,h} (multi 면 배열).
  // 사각형은 원본 좌표로 저장하고 퍼센트로 그려서 창 크기가 바뀌어도 그대로 맞는다.
  function rectEditor(o, row, multi){
    labelFor(o, row);
    var box = el('div', 'rect-box'), cv = el('canvas', 'rect-bg'), layer = el('div', 'rect-layer');
    layer.setAttribute('aria-hidden', 'true');
    box.appendChild(cv); box.appendChild(layer); row.appendChild(box);
    var bar = el('div', 'rect-bar'), info = el('span', 'muted rect-info'), hint = el('span', 'muted rect-hint', t('dragHint'));
    var btn = el('button', 'btn ghost sm', multi ? t('clearAll') : t('reset')); btn.type = 'button';
    bar.appendChild(info); bar.appendChild(hint); bar.appendChild(btn); row.appendChild(bar);
    var natW = 0, natH = 0, rects = [], sel = -1, ready = false, drag = null;
    var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    function ratio(){
      var r = o.ratioFrom ? getValue(o.ratioFrom) : o.ratio;
      if (typeof r === 'string') { var m = /^(\d+(?:\.\d+)?)[:x\/](\d+(?:\.\d+)?)$/.exec(r); r = m ? parseFloat(m[1]) / parseFloat(m[2]) : parseFloat(r); }
      return r > 0 && isFinite(r) ? r : 0;
    }
    function clampRect(r){
      r.w = Math.max(1, Math.min(r.w, natW)); r.h = Math.max(1, Math.min(r.h, natH));
      r.x = Math.max(0, Math.min(r.x, natW - r.w)); r.y = Math.max(0, Math.min(r.y, natH - r.h));
      return r;
    }
    function fitRatio(r, keepCenter){
      var q = ratio(); if (!q) return r;
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (r.w / r.h > q) r.w = r.h * q; else r.h = r.w / q;
      if (r.w > natW) { r.w = natW; r.h = r.w / q; } if (r.h > natH) { r.h = natH; r.w = r.h * q; }
      if (keepCenter) { r.x = cx - r.w / 2; r.y = cy - r.h / 2; }
      return clampRect(r);
    }
    function fullRect(){ return fitRatio({ x: 0, y: 0, w: natW, h: natH }, true); }
    function round(r){ return { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) }; }
    function pct(v, n){ return (v / n * 100) + '%'; }
    function draw(){
      layer.innerHTML = '';
      if (!ready) return;
      rects.forEach(function(r, i){
        var d = el('div', 'rsel' + (i === sel ? ' on' : '')); d.setAttribute('data-i', i);
        d.style.left = pct(r.x, natW); d.style.top = pct(r.y, natH); d.style.width = pct(r.w, natW); d.style.height = pct(r.h, natH);
        HANDLES.forEach(function(h){ var s = el('span', 'rh rh-' + h); s.setAttribute('data-h', h); d.appendChild(s); });
        if (!multi && typeof o.guide === 'function') (o.guide(round(r), getValue) || []).forEach(function(g){ var gd = el('div', 'rguide' + (g.cls ? ' ' + g.cls : ''), g.text || null); gd.style.left = (g.x * 100) + '%'; gd.style.top = (g.y * 100) + '%'; gd.style.width = (g.w * 100) + '%'; gd.style.height = (g.h * 100) + '%'; d.appendChild(gd); });
        if (multi) { var x = el('button', 'rdel', '✕'); x.type = 'button'; x.setAttribute('aria-label', t('delete')); x.setAttribute('data-del', i); d.appendChild(x); }
        layer.appendChild(d);
      });
      var cur = rects[sel] || rects[0];
      info.textContent = multi ? t('regions', { n: rects.length }) : (cur ? round(cur).w + '×' + round(cur).h + ' @ ' + round(cur).x + ',' + round(cur).y : '');
      hint.hidden = multi ? rects.length > 0 : false;
    }
    function pos(e){
      var r = layer.getBoundingClientRect();
      return { x: Math.max(0, Math.min(natW, (e.clientX - r.left) / r.width * natW)), y: Math.max(0, Math.min(natH, (e.clientY - r.top) / r.height * natH)) };
    }
    layer.addEventListener('pointerdown', function(e){
      if (!ready || busy) return;
      var tg = e.target;
      if (tg.hasAttribute && tg.hasAttribute('data-del')) { e.preventDefault(); return; }   // 삭제는 click 에서
      e.preventDefault(); try { layer.setPointerCapture(e.pointerId); } catch (x) {}
      var p = pos(e), rs = tg.closest ? tg.closest('.rsel') : null;
      if (rs) {
        sel = parseInt(rs.getAttribute('data-i'), 10);
        var h = tg.getAttribute && tg.getAttribute('data-h');
        var r = rects[sel];
        drag = { kind: h ? 'resize' : 'move', h: h, start: p, orig: { x: r.x, y: r.y, w: r.w, h: r.h } };
      } else {
        var prev = (!multi && rects[0]) ? { x: rects[0].x, y: rects[0].y, w: rects[0].w, h: rects[0].h } : null;
        if (multi) { rects.push({ x: p.x, y: p.y, w: 1, h: 1 }); sel = rects.length - 1; }
        else { rects[0] = { x: p.x, y: p.y, w: 1, h: 1 }; sel = 0; }
        drag = { kind: 'new', start: p, orig: prev };
      }
      draw();
    });
    layer.addEventListener('pointermove', function(e){
      if (!drag || sel < 0) return;
      e.preventDefault();
      var p = pos(e), o0 = drag.orig, r = rects[sel], dx = p.x - drag.start.x, dy = p.y - drag.start.y, q = ratio();
      if (drag.kind === 'move') { r.x = o0.x + dx; r.y = o0.y + dy; clampRect(r); }
      else if (drag.kind === 'new') {
        var x1 = Math.min(drag.start.x, p.x), y1 = Math.min(drag.start.y, p.y), w = Math.abs(dx), h = Math.abs(dy);
        if (q) { if (w / Math.max(h, 1) > q) h = w / q; else w = h * q; if (p.x < drag.start.x) x1 = drag.start.x - w; if (p.y < drag.start.y) y1 = drag.start.y - h; }
        r.x = x1; r.y = y1; r.w = Math.max(1, w); r.h = Math.max(1, h); clampRect(r);
      } else {
        var h0 = drag.h, nx = o0.x, ny = o0.y, nw = o0.w, nh = o0.h;
        if (h0.indexOf('e') >= 0) nw = o0.w + dx; if (h0.indexOf('s') >= 0) nh = o0.h + dy;
        if (h0.indexOf('w') >= 0) { nx = o0.x + dx; nw = o0.w - dx; } if (h0.indexOf('n') >= 0) { ny = o0.y + dy; nh = o0.h - dy; }
        if (nw < 1) { nw = 1; if (h0.indexOf('w') >= 0) nx = o0.x + o0.w - 1; } if (nh < 1) { nh = 1; if (h0.indexOf('n') >= 0) ny = o0.y + o0.h - 1; }
        if (q) { if (h0 === 'n' || h0 === 's') nw = nh * q; else if (h0 === 'e' || h0 === 'w') nh = nw / q; else { if (nw / nh > q) nw = nh * q; else nh = nw / q; } if (h0.indexOf('w') >= 0) nx = o0.x + o0.w - nw; if (h0.indexOf('n') >= 0) ny = o0.y + o0.h - nh; }
        r.x = nx; r.y = ny; r.w = nw; r.h = nh;
        if (r.x < 0) { r.w += r.x; r.x = 0; } if (r.y < 0) { r.h += r.y; r.y = 0; }
        if (r.x + r.w > natW) r.w = natW - r.x; if (r.y + r.h > natH) r.h = natH - r.y;
        r.w = Math.max(1, r.w); r.h = Math.max(1, r.h);
      }
      draw();
    });
    function endDrag(e){
      if (!drag) return;
      var r = rects[sel];
      if (drag.kind === 'new' && r && (r.w < MIN_RECT || r.h < MIN_RECT)) {
        if (multi) { rects.splice(sel, 1); sel = -1; } else rects[0] = drag.orig || fullRect();
      }
      drag = null; draw();
    }
    layer.addEventListener('pointerup', endDrag); layer.addEventListener('pointercancel', endDrag);
    layer.addEventListener('click', function(e){ var tg = e.target; if (!ready || !tg.hasAttribute || !tg.hasAttribute('data-del')) return; e.preventDefault(); rects.splice(parseInt(tg.getAttribute('data-del'), 10), 1); sel = -1; draw(); });
    btn.addEventListener('click', function(){ if (multi) { rects = []; sel = -1; } else { rects = [fullRect()]; sel = 0; } draw(); });
    optListeners.push(function(){ if (!multi && ready && rects[0] && ratio()) { rects[0] = fitRatio(rects[0], true); draw(); } });
    if (files[0]) loadImage(files[0]).then(function(img){
      var d = dims(img); natW = d.w; natH = d.h;
      var pv = scaleTo(img, EDIT_W, EDIT_W); release(img);
      cv.width = pv.width; cv.height = pv.height; cv.getContext('2d').drawImage(pv, 0, 0);
      box.style.setProperty('--ar', (pv.width / pv.height).toFixed(4));   // CSS 가 높이 상한에 맞춰 너비를 줄일 때 쓰는 비율
      ready = true; if (!multi) { rects = [fullRect()]; sel = 0; } draw();
    }, function(){ info.textContent = t('errorBroken'); });
    optUI[o.id] = { get: function(){
      if (multi) return rects.map(round);
      return rects[0] ? round(rects[0]) : { x: 0, y: 0, w: natW || 0, h: natH || 0 };
    } };
  }

  // ---------- 실행 ----------
  function progress(p, text){
    dom.progress.hidden = false;
    var pct = Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
    dom.bar.style.width = pct + '%'; dom.progress.setAttribute('aria-valuenow', pct);
    dom.ptxt.textContent = (text || t('processing')) + ' ' + pct + '%';
  }
  function makeCtx(){
    return { loadImage: loadImage, canvas: mkCanvas, toBlob: toBlob, exifOrientation: exifOrientation, scaleTo: scaleTo, release: release, progress: progress, t: t, lang: T.lang || 'en', pages: pages, ensureJSZip: ensureJSZip, ensureLibheif: ensureLibheif, human: human };
  }
  function run(){
    if (busy || !files.length || !tool) return;
    if (tool.minFiles > files.length) { setStatus(t('errorEmpty', { n: tool.minFiles }), 'err'); return; }
    var opts = getOpts();
    setBusy(true); setStatus(t('processing'), 'busy'); progress(0);
    dom.result.hidden = true; dom.result.innerHTML = ''; outputs = []; revokeAll();
    inputBytes = 0; files.forEach(function(f){ inputBytes += f.size; });
    var inputs = files.map(function(f){ return { name: f.name, type: f.type, size: f.size, file: f.file, width: f.width, height: f.height }; });
    Promise.resolve().then(function(){ return tool.run(inputs, opts, makeCtx()); }).then(function(res){
      setBusy(false);
      outputs = ((res && res.outputs) || []).filter(function(o){ return o && o.blob; });
      if (!outputs.length) throw new Error('empty');
      var seen = {};
      outputs.forEach(function(o){ var n = o.name || 'image'; if (seen[n]) { var e = extOf(n), b = e ? n.slice(0, -e.length - 1) : n; var k = 2; while (seen[b + '-' + k + (e ? '.' + e : '')]) k++; n = b + '-' + k + (e ? '.' + e : ''); } seen[n] = true; o.name = n; });
      progress(1, t('done'));
      showResult((res && res.note) || '');
    }, function(e){
      setBusy(false); dom.progress.hidden = true;
      var msg = e && e.key ? t(e.key) : (e && e.userMessage ? e.userMessage : t('errorGeneric'));
      if (window.console && console.error) console.error(e);
      setStatus(msg, 'err');
    });
  }
  function download(o){
    var a = document.createElement('a'); a.href = o.url || (o.url = objUrl(o.blob)); a.download = o.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); setTimeout(function(){ document.body.removeChild(a); }, 0);
  }
  function downloadZip(){
    if (busy) return;
    setBusy(true); setStatus(t('processing'), 'busy');
    ensureJSZip().then(function(JSZip){
      var zip = new JSZip();
      outputs.forEach(function(o){ zip.file(o.name, o.blob); });
      return zip.generateAsync({ type: 'blob', compression: 'STORE' });
    }).then(function(blob){
      setBusy(false); setStatus(t('done'), 'ok');
      download({ name: (t('resultName') !== 'resultName' ? t('resultName') : tool.id) + '.zip', blob: blob });
    }, function(){ setBusy(false); setStatus(t('errorGeneric'), 'err'); });
  }
  function isImageOut(o){ return /^image\//.test(o.blob.type || '') || /\.(png|jpe?g|webp|gif|bmp|svg|avif|ico)$/i.test(o.name); }
  // 원본 → 결과 용량과 절감률 한 줄: "60 KB → 19 KB · 69% 절감"
  function stats(before, after){
    var s = el('div', 'result-stats');
    s.appendChild(el('span', null, human(before)));
    s.appendChild(el('span', 'arrow', '→'));
    s.appendChild(el('span', 'after', human(after)));
    if (before > 0 && after < before) { s.appendChild(el('span', 'dot', '·')); s.appendChild(el('span', 'saved', t('saved', { p: Math.round((1 - after / before) * 100) }))); }
    return s;
  }
  function showResult(note){
    note = String(note || '').trim();   // 도구가 빈 문구(용량 줄은 위 stats 가 담당) 뒤에 덧붙인 메모만 남긴다
    document.body.classList.add('done');
    var r = dom.result; r.innerHTML = ''; r.hidden = false;
    setTimeout(function(){ dom.progress.hidden = true; }, 600);
    var total = 0; outputs.forEach(function(o){ total += o.blob.size; });
    if (outputs.length === 1) {
      var o = outputs[0];
      var box = el('div', 'result-one');
      if (isImageOut(o)) { var im = el('img', 'result-img'); im.src = objUrl(o.blob); im.alt = o.name; box.appendChild(im); }
      box.appendChild(el('div', 'result-name', o.name));
      box.appendChild(stats(o.srcSize != null ? o.srcSize : inputBytes, o.blob.size));
      r.appendChild(box);
      dom.primary.textContent = t('download'); dom.primary.disabled = false;
    } else {
      var list = el('ul', 'result-grid');
      outputs.forEach(function(o){
        var li = el('li');
        if (isImageOut(o)) { var im2 = el('img'); im2.src = objUrl(o.blob); im2.alt = o.name; im2.loading = 'lazy'; li.appendChild(im2); }
        else li.appendChild(el('div', 'result-ph', (extOf(o.name) || 'file').toUpperCase()));
        var nm = el('span', 'result-name', o.name); nm.title = o.name; li.appendChild(nm);
        li.appendChild(el('span', 'muted', human(o.blob.size)));
        var b = el('button', 'btn ghost sm', t('download')); b.type = 'button'; b.addEventListener('click', function(){ download(o); }); li.appendChild(b);
        list.appendChild(li);
      });
      r.appendChild(list);
      r.appendChild(stats(inputBytes, total));
      dom.primary.textContent = t('downloadAll'); dom.primary.disabled = false;
    }
    if (note) r.appendChild(el('p', 'muted result-note', note));
    setStatus(t('done'), 'ok');
    try { dom.out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }
  function onPrimary(){
    if (busy) return;
    if (!outputs.length) { run(); return; }
    if (outputs.length === 1) download(outputs[0]); else downloadZip();
  }
  function reset(){
    if (busy) return;
    files = []; pages = []; outputs = []; revokeAll(); optUI = {}; optListeners = [];
    document.body.classList.remove('has-input', 'done', 'busy');
    dom.files.innerHTML = ''; dom.opts.innerHTML = ''; dom.opts.hidden = true;
    dom.result.innerHTML = ''; dom.result.hidden = true; dom.progress.hidden = true; dom.out.hidden = true;
    dom.compact.hidden = true; dom.count.textContent = '';
    dom.primary.textContent = t('runText'); dom.primary.disabled = true;
    dom.input.value = '';
    setStatus('', ''); setStatus('', '', dom.inStatus);
    try { dom.drop.focus(); } catch (e) {}
  }

  // ---------- 입력 이벤트 ----------
  function openPicker(){ if (busy) return; dom.input.value = ''; dom.input.click(); }
  function bind(){
    dom = { drop: $('drop'), input: $('file-input'), select: $('btn-select'), add: $('btn-add'), btnAdd: $('btn-add'), resetTop: $('btn-reset-top'), compact: $('drop-compact'), count: $('file-count'),
      files: $('files'), inStatus: $('in-status'), opts: $('opts'), out: $('out'), result: $('result'), progress: $('progress'), primary: $('btn-primary'), reset: $('btn-reset'), status: $('status') };
    dom.bar = dom.progress.querySelector('.bar'); dom.ptxt = dom.progress.querySelector('.ptxt');
    dom.input.accept = tool.accept || 'image/*';
    dom.input.multiple = !!tool.multiple;
    if (tool.capture) dom.input.setAttribute('capture', tool.capture);
    dom.select.addEventListener('click', function(e){ e.stopPropagation(); openPicker(); });
    dom.add.addEventListener('click', function(e){ e.stopPropagation(); openPicker(); });
    dom.resetTop.addEventListener('click', function(e){ e.stopPropagation(); reset(); });
    dom.drop.addEventListener('click', function(e){ if (e.target.closest('button') || document.body.classList.contains('has-input')) return; openPicker(); });
    dom.drop.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && e.target === dom.drop) { e.preventDefault(); openPicker(); } });
    dom.input.addEventListener('change', function(){ addFiles(dom.input.files); });
    var dragDepth = 0;
    document.addEventListener('dragenter', function(e){ if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dom.drop.classList.add('on'); });
    document.addEventListener('dragover', function(e){ if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    document.addEventListener('dragleave', function(e){ if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dom.drop.classList.remove('on'); });
    document.addEventListener('drop', function(e){ if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; dom.drop.classList.remove('on'); addFiles(e.dataTransfer.files); });
    document.addEventListener('paste', function(e){
      var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      var cd = e.clipboardData; if (!cd) return;
      var list = cd.files && cd.files.length ? Array.prototype.slice.call(cd.files) : [];
      if (!list.length && cd.items) for (var i = 0; i < cd.items.length; i++) { var it = cd.items[i]; if (it.kind === 'file') { var f = it.getAsFile(); if (f) list.push(f); } }
      if (!list.length) return;
      e.preventDefault(); addFiles(list);
    });
    dom.primary.addEventListener('click', onPrimary);
    dom.reset.addEventListener('click', reset);
    document.addEventListener('keydown', function(e){
      var tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || tg === 'BUTTON' || e.target.isContentEditable) return;
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); onPrimary(); }
    });
    window.addEventListener('beforeunload', function(){ revokeAll(); });
  }
  function hasFiles(e){ var dt = e.dataTransfer; if (!dt || !dt.types) return false; return Array.prototype.indexOf.call(dt.types, 'Files') >= 0; }

  // ---------- 등록 ----------
  function register(tl){
    if (redirected || !tl) return;
    tool = tl;
    tool.minFiles = tool.minFiles || 1;
    if (tool.multiple == null) tool.multiple = true;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ bind(); });
    else bind();
  }
  window.IMGT = { register: register, t: t, strings: S, loadImage: loadImage, scaleTo: scaleTo, toBlob: toBlob, canvas: mkCanvas, exifOrientation: exifOrientation, ensureJSZip: ensureJSZip, ensureLibheif: ensureLibheif, version: 1 };
})();
