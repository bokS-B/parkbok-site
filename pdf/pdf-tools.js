// PDF 도구 공통 엔진 (window.PDFT). 파일 입력 → 옵션 → 실행 → 결과 내려받기까지 담당하고, 각 도구는 pdf/tools/<id>.js 가 register 한다.
// 파일은 어디로도 보내지 않는다(네트워크 코드 없음). 라이브러리는 /assets/vendor/ 에서 필요할 때만 지연 로드한다.
(function(){
  'use strict';
  var S = window.PDFT_STRINGS || {};
  var T = window.PDFT_TOOL || {};
  var TS = T.strings || {};
  var VENDOR = '/assets/vendor/';
  var THUMB_W = 160, THUMB_MAX = 50;

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
  function baseName(n){ return String(n).replace(/\.[^.]+$/, ''); }

  // ---------- 첫 방문 언어 리다이렉트 (룰렛과 동일, localStorage 'pb_lang' 공유) ----------
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
  function ensurePdfLib(){ return window.PDFLib ? Promise.resolve(window.PDFLib) : loadScript(VENDOR + 'pdf-lib.min.js').then(function(){ return window.PDFLib; }); }
  function ensurePdfjs(){
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return loadScript(VENDOR + 'pdf.min.js').then(function(){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js';
      return window.pdfjsLib;
    });
  }
  function ensureJSZip(){ return window.JSZip ? Promise.resolve(window.JSZip) : loadScript(VENDOR + 'jszip.min.js').then(function(){ return window.JSZip; }); }

  // ---------- 상태 ----------
  var tool = null, files = [], pages = [], outputs = [], urls = [], busy = false, optUI = {}, pagesUI = null;
  var hasCompressionTarget = false;
  var dom = {};
  function setStatus(msg, kind, target){
    var s = target || dom.status; if (!s) return;
    s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : '');
    if (dom.inStatus && !target) { dom.inStatus.textContent = ''; dom.inStatus.className = 'status'; }
  }
  function revokeAll(){ urls.forEach(function(u){ try { URL.revokeObjectURL(u); } catch (e) {} }); urls = []; }
  function objUrl(blob){ var u = URL.createObjectURL(blob); urls.push(u); return u; }

  function acceptsFile(f){
    var acc = (tool.accept || '.pdf').split(',').map(function(a){ return a.trim().toLowerCase(); });
    var name = (f.name || '').toLowerCase(), type = (f.type || '').toLowerCase();
    for (var i = 0; i < acc.length; i++) {
      var a = acc[i];
      if (a === 'image/*') { if (/^image\//.test(type) || /\.(png|jpe?g|webp|gif|bmp|heic|heif|tiff?)$/.test(name)) return true; }
      else if (a.charAt(0) === '.') { if (name.slice(-a.length) === a) return true; if (a === '.pdf' && type === 'application/pdf') return true; }
      else if (a.slice(-2) === '/*') { if (type.indexOf(a.slice(0, -1)) === 0) return true; }
      else if (type === a) return true;
    }
    return false;
  }
  function acceptLabel(){ return (tool.accept || '.pdf').indexOf('image') >= 0 ? 'PNG/JPG' : 'PDF'; }
  function isPdf(f){ return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; }
  function isEncryptedErr(e){ var m = String(e && (e.message || e)); return (e && e.constructor && e.constructor.name === 'EncryptedPDFError') || /encrypt/i.test(m); }

  // ---------- 파일 추가 ----------
  function addFiles(list){
    if (busy || !list || !list.length) return;
    var arr = Array.prototype.slice.call(list);
    if (!tool.multiple) { arr = arr.slice(0, 1); files.forEach(function(f){ if (f.pdfjsDoc) { try { f.pdfjsDoc.destroy(); } catch (e) {} } }); files = []; pages = []; }
    var bad = arr.filter(function(f){ return !acceptsFile(f); });
    arr = arr.filter(acceptsFile);
    if (bad.length) setStatus(t('errorType', { type: acceptLabel() }), 'err', files.length ? null : dom.inStatus);
    if (!arr.length) return;
    setBusy(true);
    setStatus(t('loadingLib'), 'busy', files.length ? null : dom.inStatus);
    var needLib = arr.some(isPdf) && !tool.allowEncrypted ? ensurePdfLib() : Promise.resolve();
    needLib.then(function(){
      var chain = Promise.resolve(), added = 0, firstErr = null;
      arr.forEach(function(f){
        chain = chain.then(function(){ return readOne(f); }).then(function(rec){
          if (rec) { files.push(rec); added++; }
        }, function(e){ if (!firstErr) firstErr = e; });
      });
      return chain.then(function(){
        if (firstErr) throw firstErr;
        return added;
      });
    }).then(function(){
      if (!files.length) throw new Error('noinput');
      return tool.needsPages ? buildPages() : null;
    }).then(function(){
      setBusy(false);
      afterInput();
      if (hasCompressionTarget && getValue('targetMb') === '5') run();
    }, function(e){
      setBusy(false);
      var key = e && e.message === 'noinput' ? '' : (isEncryptedErr(e) ? 'errorEncrypted' : (e && e.message === 'load ' + VENDOR + 'pdf-lib.min.js' ? 'errorGeneric' : 'errorBroken'));
      if (files.length) { afterInput(); if (key) setStatus(t(key), 'err'); }
      else { reset(); setStatus(key ? t(key) : '', 'err', dom.inStatus); }
    });
  }
  function readOne(f){
    return f.arrayBuffer().then(function(buf){
      var rec = { name: f.name, type: f.type || (isPdf(f) ? 'application/pdf' : ''), size: f.size, bytes: new Uint8Array(buf), pageCount: 1, sizes: null, file: f };
      if (!isPdf(f)) return rec;
      if (tool.allowEncrypted) return rec;
      return window.PDFLib.PDFDocument.load(rec.bytes, { updateMetadata: false }).then(function(doc){
        rec.pageCount = doc.getPageCount();
        if (!rec.pageCount) throw new Error('broken: no pages');
        rec.sizes = doc.getPages().map(function(p){ var s = p.getSize(); var r = (p.getRotation().angle || 0) % 180; return r ? { width: s.height, height: s.width } : { width: s.width, height: s.height }; });
        return rec;
      });
    });
  }
  function removeFile(i){
    if (busy) return;
    var f = files.splice(i, 1)[0];
    if (f && f.pdfjsDoc) { try { f.pdfjsDoc.destroy(); } catch (e) {} }
    if (!files.length) { reset(); return; }
    if (tool.needsPages) { setBusy(true); buildPages().then(function(){ setBusy(false); afterInput(); }, function(){ setBusy(false); afterInput(); }); }
    else afterInput();
  }
  function moveFile(i, d){
    var j = i + d; if (busy || j < 0 || j >= files.length) return;
    var x = files[i]; files[i] = files[j]; files[j] = x;
    if (tool.needsPages) { pages = []; setBusy(true); buildPages().then(function(){ setBusy(false); afterInput(); }, function(){ setBusy(false); afterInput(); }); }
    else afterInput();
  }

  // ---------- 썸네일 (ctx.pages) ----------
  function buildPages(){
    pages = [];
    var total = 0; files.forEach(function(f){ total += f.pageCount; });
    var done = 0, budget = THUMB_MAX;
    var chain = Promise.resolve();
    files.forEach(function(f, fi){
      if (isPdf(f)) {
        chain = chain.then(function(){ return ensurePdfjs(); }).then(function(pdfjs){
          return getPdfjsDoc(f).then(function(doc){
            var p = Promise.resolve();
            for (var i = 0; i < f.pageCount; i++) (function(i){
              p = p.then(function(){
                var sz = f.sizes && f.sizes[i] ? f.sizes[i] : { width: 595, height: 842 };
                var rec = { file: fi, index: i, width: sz.width, height: sz.height, thumb: null };
                pages.push(rec);
                done++; setStatus(t('processing') + ' ' + done + '/' + total, 'busy', files.length === 0 ? dom.inStatus : null);
                if (budget <= 0) return;
                budget--;
                return renderPdfPage(doc, i, THUMB_W / sz.width).then(function(c){ rec.thumb = c.toDataURL('image/jpeg', 0.8); }, function(){});
              });
            })(i);
            return p;
          });
        });
      } else {
        chain = chain.then(function(){
          return loadImage(f).then(function(img){
            var rec = { file: fi, index: 0, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, thumb: null };
            f.sizes = [{ width: rec.width, height: rec.height }];
            pages.push(rec); done++;
            if (budget > 0) { budget--; var c = drawImage(img, THUMB_W / rec.width); rec.thumb = c.toDataURL('image/jpeg', 0.8); }
          }, function(){ pages.push({ file: fi, index: 0, width: 0, height: 0, thumb: null }); done++; });
        });
      }
    });
    return chain;
  }
  function getPdfjsDoc(f){
    if (f.pdfjsDoc) return Promise.resolve(f.pdfjsDoc);
    return ensurePdfjs().then(function(pdfjs){
      return pdfjs.getDocument({ data: f.bytes.slice(0), isEvalSupported: false }).promise.then(function(doc){ f.pdfjsDoc = doc; return doc; });
    });
  }
  function renderPdfPage(doc, idx, scale){
    return doc.getPage(idx + 1).then(function(page){
      var vp = page.getViewport({ scale: scale });
      var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
      // intent:'print' → pdf.js 가 requestAnimationFrame 대신 타이머로 그려서 탭·창이 숨겨져도 멈추지 않는다
      return page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print' }).promise.then(function(){ return c; });
    });
  }
  function loadImage(f){
    if (f.img) return Promise.resolve(f.img);
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(f.file || new Blob([f.bytes], { type: f.type }));
      var img = new Image();
      img.onload = function(){ URL.revokeObjectURL(u); f.img = img; res(img); };
      img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('image')); };
      img.src = u;
    });
  }
  function drawImage(img, scale){
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale)); c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  // 도구용: 특정 파일의 특정 페이지를 원하는 배율로 캔버스에 그린다
  function renderPage(fileIdx, pageIdx, scale){
    var f = files[fileIdx]; if (!f) return Promise.reject(new Error('no file'));
    if (isPdf(f)) return getPdfjsDoc(f).then(function(doc){ return renderPdfPage(doc, pageIdx, scale || 1); });
    return loadImage(f).then(function(img){ return drawImage(img, scale || 1); });
  }

  // ---------- 화면 ----------
  function setBusy(b){
    busy = b; document.body.classList.toggle('busy', b);
    if (dom.primary) dom.primary.disabled = b || !files.length;
    if (dom.reset) dom.reset.disabled = b;
    if (optUI.targetMb) dom.opts.querySelectorAll('select, input').forEach(function(input){ input.disabled = b; });
  }
  function clearResult(){
    document.body.classList.remove('done');
    outputs = []; revokeAll();
    dom.result.hidden = true; dom.result.innerHTML = '';
    dom.progress.hidden = true;
    dom.primary.textContent = t('runText');
  }
  function afterInput(){
    document.body.classList.add('has-input');
    clearResult();
    dom.count.textContent = files.length === 1 ? t('fileCount') : t('filesCount', { n: files.length });
    dom.compact.hidden = false;
    dom.btnAdd.hidden = !tool.multiple;
    dom.out.hidden = false;
    dom.primary.disabled = false;
    renderFiles();
    if (hasCompressionTarget) applyShowIf();
    else renderOptions();
    setStatus('', '');
    if (tool.minFiles > files.length) { setStatus(t('errorEmpty', { n: tool.minFiles }), 'empty'); dom.primary.disabled = true; }
  }
  function renderFiles(){
    var ul = dom.files; ul.innerHTML = '';
    files.forEach(function(f, i){
      var li = el('li', 'file');
      var ic = el('span', 'file-ic', isPdf(f) ? 'PDF' : 'IMG');
      var nm = el('span', 'file-name', f.name); nm.title = f.name;
      var meta = el('span', 'file-meta', human(f.size) + (isPdf(f) ? ' · ' + t('pages', { n: f.pageCount }) : ''));
      li.appendChild(ic); li.appendChild(nm); li.appendChild(meta);
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
  function renderOptions(){
    var opts = tool.options || [], box = dom.opts;
    box.innerHTML = ''; optUI = {}; pagesUI = null;
    if (!opts.length) { box.hidden = true; return; }
    opts.forEach(function(o){
      var row = el('div', 'opt opt-' + o.type); row.setAttribute('data-opt', o.id);
      var r = renderers[o.type]; if (!r) return;
      r(o, row);
      var help = optStr(o.id, 'help');
      if (help && o.type !== 'text' && o.type !== 'number') row.appendChild(el('small', 'opt-help', help));
      box.appendChild(row);
    });
    box.hidden = false;
    box.addEventListener('change', applyShowIf);
    box.addEventListener('input', applyShowIf);
    applyShowIf();
  }
  function applyShowIf(){
    (tool.options || []).forEach(function(o){
      if (!o.showIf) return;
      var row = dom.opts.querySelector('[data-opt="' + o.id + '"]'); if (!row) return;
      var show = true;
      Object.keys(o.showIf).forEach(function(k){
        var want = o.showIf[k], cur = getValue(k);
        if (Array.isArray(want) ? want.indexOf(cur) < 0 : cur !== want) show = false;
      });
      row.hidden = !show || (hasCompressionTarget && o.id === 'level' && !files.length);
    });
  }
  function getValue(id){ var u = optUI[id]; return u ? u.get() : undefined; }
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
      row.appendChild(inp); optUI[o.id] = { get: function(){ var n = parseFloat(inp.value); return isNaN(n) ? (o.default != null ? o.default : 0) : n; } };
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
            // 업로드 원본을 그대로 값으로 쓴다 (PNG 가 아니면 캔버스 PNG 로)
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
    pages: function(o, row){
      var mode = o.mode || 'select';
      var head = el('div', 'pages-head');
      head.appendChild(el('span', 'opt-label', optStr(o.id, 'label') || t('pages', { n: pages.length })));
      var grid = el('div', 'pages-grid');
      var state = { sel: {}, order: [], single: 0 };
      if (mode === 'select' && o.default === 'all') pages.forEach(function(p, i){ state.sel[i] = true; });
      if (mode === 'order') state.order = pages.map(function(p, i){ return { index: i, rotate: 0, deleted: false }; });
      if (mode === 'single') state.single = o.default != null ? o.default : 0;
      var info = el('span', 'muted pages-info');
      function count(){
        if (mode === 'select') info.textContent = t('selected', { n: Object.keys(state.sel).filter(function(k){ return state.sel[k]; }).length });
        else if (mode === 'order') info.textContent = t('pages', { n: state.order.filter(function(x){ return !x.deleted; }).length });
        else info.textContent = t('pageN', { n: state.single + 1 });
      }
      if (mode === 'select') {
        var all = el('button', 'btn ghost sm', t('selectAll')); all.type = 'button'; all.addEventListener('click', function(){ pages.forEach(function(p, i){ state.sel[i] = true; }); draw(); });
        var none = el('button', 'btn ghost sm', t('clearAll')); none.type = 'button'; none.addEventListener('click', function(){ state.sel = {}; draw(); });
        head.appendChild(all); head.appendChild(none);
      }
      head.appendChild(info); row.appendChild(head); row.appendChild(grid);
      function thumbEl(p, i){
        var d = el('div', 'pg');
        if (p.thumb) { var im = el('img'); im.src = p.thumb; im.alt = t('pageN', { n: p.index + 1 }); im.draggable = false; d.appendChild(im); }
        else { var ph = el('div', 'pg-ph', String(p.index + 1)); if (p.width && p.height) ph.style.aspectRatio = p.width + '/' + p.height; d.appendChild(ph); }
        var lb = el('span', 'pg-n', (files.length > 1 ? (p.file + 1) + '-' : '') + (p.index + 1)); d.appendChild(lb);
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
        if (hidden > 0 && !pages[pages.length - 1].thumb) grid.appendChild(el('div', 'muted pages-more', t('morePages', { n: hidden })));
        count();
      }
      draw();
      pagesUI = state;
      optUI[o.id] = { get: function(){
        if (mode === 'single') return state.single;
        if (mode === 'order') return state.order.map(function(x){ return { index: x.index, rotate: x.rotate, deleted: x.deleted }; });
        return pages.map(function(p, i){ return i; }).filter(function(i){ return !!state.sel[i]; });
      } };
    }
  };

  // ---------- 실행 ----------
  function progress(p, text){
    dom.progress.hidden = false;
    var pct = Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
    dom.bar.style.width = pct + '%'; dom.progress.setAttribute('aria-valuenow', pct);
    dom.ptxt.textContent = (text || t('processing')) + ' ' + pct + '%';
  }
  function run(){
    if (busy || !files.length || !tool) return;
    if (tool.minFiles > files.length) { setStatus(t('errorEmpty', { n: tool.minFiles }), 'err'); return; }
    var opts = getOpts();
    setBusy(true); setStatus(t('processing'), 'busy'); progress(0);
    dom.result.hidden = true; dom.result.innerHTML = ''; outputs = []; revokeAll();
    var needPdfLib = files.some(isPdf) || tool.needsPdfLib !== false;
    (needPdfLib ? ensurePdfLib() : Promise.resolve()).then(function(){
      var ctx = { pdfLib: window.PDFLib || null, pdfjs: window.pdfjsLib || null, pages: pages, renderPage: renderPage, progress: progress, t: t, lang: T.lang || 'en', ensurePdfjs: ensurePdfjs, ensureJSZip: ensureJSZip };
      var inputs = files.map(function(f){ return { name: f.name, type: f.type, bytes: f.bytes, size: f.size }; });
      return tool.run(inputs, opts, ctx);
    }).then(function(res){
      setBusy(false);
      outputs = (res && res.outputs) || [];
      if (!outputs.length) throw new Error('empty');
      progress(1, t('done'));
      showResult(res.note || '', res.targetStatus);
    }, function(e){
      setBusy(false); dom.progress.hidden = true;
      var msg = e && e.key ? t(e.key) : (isEncryptedErr(e) ? t('errorEncrypted') : (e && e.userMessage ? e.userMessage : t('errorGeneric')));
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
  function isImageName(n){ return /\.(png|jpe?g|webp|gif)$/i.test(n); }
  function addResultPreview(box, output){
    var preview = el('details', 'about');
    var content = el('div');
    preview.appendChild(el('summary', null, t('previewTarget')));
    preview.appendChild(content);
    preview.addEventListener('toggle', function(){
      if (!preview.open || content.childNodes.length) return;
      content.appendChild(el('p', 'muted', t('processing')));
      ensurePdfjs().then(function(pdfjs){
        return output.blob.arrayBuffer().then(function(bytes){
          return pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
        });
      }).then(function(doc){
        return doc.getPage(1).then(function(page){
          var viewport = page.getViewport({ scale: 1 });
          var scale = Math.min(2, 1200 / Math.max(viewport.width, viewport.height));
          return renderPdfPage(doc, 0, scale);
        }).finally(function(){ return doc.destroy(); });
      }).then(function(canvas){
        canvas.style.maxWidth = '100%'; canvas.style.height = 'auto';
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', t('previewTarget'));
        content.replaceChildren(canvas);
      }).catch(function(){
        content.textContent = t('previewTargetError');
      });
    });
    box.appendChild(preview);
  }
  function showResult(note, targetStatus){
    document.body.classList.add('done');
    var r = dom.result; r.innerHTML = ''; r.hidden = false;
    var shownOutputs = outputs;
    setTimeout(function(){ if (outputs === shownOutputs) dom.progress.hidden = true; }, 600);
    if (note && targetStatus) r.appendChild(el('p', targetStatus === 'missed' ? 'status err' : 'status ok', note));
    if (outputs.length === 1) {
      var o = outputs[0];
      var box = el('div', 'result-one');
      if (isImageName(o.name)) { var im = el('img', 'result-img'); im.src = objUrl(o.blob); im.alt = o.name; box.appendChild(im); }
      box.appendChild(el('div', 'result-name', o.name));
      if (!targetStatus) box.appendChild(el('div', 'muted', human(o.blob.size)));
      if (targetStatus) addResultPreview(box, o);
      r.appendChild(box);
      if (targetStatus === 'missed') {
        var next = el('p', 'muted', t('targetMissedHelp') + ' ');
        var split = el('a', null, t('targetSplitLink'));
        split.href = '/pdf/split/ko/';
        next.appendChild(split); r.appendChild(next);
      }
      dom.primary.textContent = t('download'); dom.primary.disabled = false;
    } else {
      var imgs = outputs.every(function(o){ return isImageName(o.name); });
      var list = el('ul', imgs ? 'result-grid' : 'result-list');
      outputs.forEach(function(o){
        var li = el('li');
        if (imgs) { var im = el('img'); im.src = objUrl(o.blob); im.alt = o.name; im.loading = 'lazy'; li.appendChild(im); }
        var nm = el('span', 'result-name', o.name); li.appendChild(nm);
        li.appendChild(el('span', 'muted', human(o.blob.size)));
        var b = el('button', 'btn ghost sm', t('download')); b.type = 'button'; b.addEventListener('click', function(){ download(o); }); li.appendChild(b);
        list.appendChild(li);
      });
      r.appendChild(list);
      dom.primary.textContent = t('downloadAll'); dom.primary.disabled = false;
    }
    if (note && !targetStatus) r.appendChild(el('p', 'muted', note));
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
    files.forEach(function(f){ if (f.pdfjsDoc) { try { f.pdfjsDoc.destroy(); } catch (e) {} } });
    files = []; pages = []; outputs = []; revokeAll(); optUI = {}; pagesUI = null;
    document.body.classList.remove('has-input', 'done', 'busy');
    dom.files.innerHTML = ''; dom.opts.innerHTML = ''; dom.opts.hidden = true;
    dom.result.innerHTML = ''; dom.result.hidden = true; dom.progress.hidden = true; dom.out.hidden = true;
    dom.compact.hidden = true; dom.count.textContent = '';
    dom.primary.textContent = t('runText'); dom.primary.disabled = true;
    dom.input.value = '';
    if (hasCompressionTarget) renderOptions();
    setStatus('', ''); setStatus('', '', dom.inStatus);
    try { dom.drop.focus(); } catch (e) {}
  }

  // ---------- 입력 이벤트 ----------
  function openPicker(){ if (busy) return; dom.input.value = ''; dom.input.click(); }
  function preload(){
    ensurePdfLib().catch(function(){});
    // needsPages also covers native image thumbnails. Warm PDF.js only for tools
    // that actually accept PDF input; image-only JPG→PDF does not use its renderer.
    if (tool && tool.needsPages && acceptsFile({ name: 'preview.pdf', type: 'application/pdf' })) ensurePdfjs().catch(function(){});
  }
  function bind(){
    dom = { drop: $('drop'), input: $('file-input'), select: $('btn-select'), add: $('btn-add'), btnAdd: $('btn-add'), resetTop: $('btn-reset-top'), compact: $('drop-compact'), count: $('file-count'),
      files: $('files'), inStatus: $('in-status'), opts: $('opts'), out: $('out'), result: $('result'), progress: $('progress'), primary: $('btn-primary'), reset: $('btn-reset'), status: $('status') };
    dom.bar = dom.progress.querySelector('.bar'); dom.ptxt = dom.progress.querySelector('.ptxt');
    dom.input.accept = tool.accept || '.pdf';
    dom.input.multiple = !!tool.multiple;
    hasCompressionTarget = tool.id === 'compress' && (tool.options || []).some(function(o){ return o.id === 'targetMb'; });
    if (hasCompressionTarget) {
      dom.drop.parentElement.before(dom.opts);
      renderOptions();
    }
    if (tool.capture) dom.input.setAttribute('capture', tool.capture);
    dom.select.addEventListener('click', function(e){ e.stopPropagation(); openPicker(); });
    dom.add.addEventListener('click', function(e){ e.stopPropagation(); openPicker(); });
    dom.resetTop.addEventListener('click', function(e){ e.stopPropagation(); reset(); });
    dom.drop.addEventListener('click', function(e){ if (e.target.closest('button') || document.body.classList.contains('has-input')) return; openPicker(); });
    dom.drop.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && e.target === dom.drop) { e.preventDefault(); openPicker(); } });
    ['mouseenter', 'focus', 'touchstart'].forEach(function(ev){ dom.select.addEventListener(ev, preload, { passive: true, once: true }); });
    dom.input.addEventListener('change', function(){ addFiles(dom.input.files); });
    var dragDepth = 0;
    document.addEventListener('dragenter', function(e){ if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dom.drop.classList.add('on'); preload(); });
    document.addEventListener('dragover', function(e){ if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    document.addEventListener('dragleave', function(e){ if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dom.drop.classList.remove('on'); });
    document.addEventListener('drop', function(e){ if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; dom.drop.classList.remove('on'); addFiles(e.dataTransfer.files); });
    document.addEventListener('paste', function(e){
      var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      var cd = e.clipboardData; if (!cd || !cd.files || !cd.files.length) return;
      e.preventDefault(); addFiles(cd.files);
    });
    dom.primary.addEventListener('click', onPrimary);
    dom.reset.addEventListener('click', reset);
    dom.opts.addEventListener('change', function(event){
      if (!hasCompressionTarget || busy || !files.length) return;
      if (outputs.length) {
        clearResult();
        setStatus('', '');
      }
      if (event.target.id === 'opt-targetMb' && getValue('targetMb') === '5') run();
    });
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
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ bind(); });
    else bind();
  }
  window.PDFT = { register: register, t: t, strings: S, ensurePdfLib: ensurePdfLib, ensurePdfjs: ensurePdfjs, ensureJSZip: ensureJSZip, version: 1 };
})();
