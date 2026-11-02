// 이미지 색상 추출: 이미지 드롭/선택/붙여넣기 → 캔버스에 표시, 누른 지점 색(8배 확대 루페), 담은 색 목록(최대 12), 주요 색 6개(k-means).
// 파일은 브라우저 안에서만 읽는다. 계산은 /color/color.js, 조각은 /color/color-ui.js. 도구 전용 스타일은 여기서 넣는다.
(function(){
  'use strict';
  var C = window.COLOR, U = window.COLOR_UI;
  var app = document.getElementById('app');
  if (!C || !U || !app) return;
  var t = U.t, el = U.el;
  var MAX_PICKS = 12, MAX_SIDE = 1600, LOUPE_PX = 15, ZOOM = 8, LOUPE = LOUPE_PX * ZOOM, K = 6;
  var picks = [], cur = null, img = null, dominant = [];

  // ---------- 스타일 ----------
  var css = [
    '#app [hidden]{display:none!important}',
    '.pk-drop{display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 24px;border:2px dashed var(--muted);border-radius:var(--r-card);background:var(--card);text-align:center;cursor:pointer;transition:var(--t-btn)}',
    '.pk-drop:focus-visible{outline:3px solid var(--accent);outline-offset:2px}',
    '.pk-drop.on{border-color:var(--accent);background:var(--accent-tint)}',
    '.pk-drop strong{font-size:17px}.pk-drop .muted{font-size:var(--fs-small)}',
    '.pk-stage{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;align-items:start}',
    '.pk-left{display:flex;flex-direction:column;gap:10px;min-width:0}',
    '.pk-wrap{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:var(--r-card);background:var(--card);line-height:0}',
    '.pk-wrap canvas.pk-cv{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;cursor:crosshair;touch-action:none;-webkit-user-select:none;user-select:none}',
    '.pk-loupe{position:absolute;left:0;top:0;width:' + LOUPE + 'px;pointer-events:none;display:none;z-index:2}',
    '.pk-loupe.show{display:block}',
    '.pk-loupe canvas{display:block;width:' + LOUPE + 'px;height:' + LOUPE + 'px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.45);background:#fff}',
    '.pk-loupe .pk-lh{position:absolute;left:50%;bottom:-26px;transform:translateX(-50%);padding:3px 10px;border-radius:var(--r-pill);background:rgba(0,0,0,.78);color:#fff;font:600 12px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.03em;white-space:nowrap}',
    '.pk-side{display:flex;flex-direction:column;gap:10px;min-width:0}',
    '.pk-side .c-preview{min-height:150px;padding:18px}',
    '.pk-side .c-preview .c-hex{font-size:30px}',
    '.pk-items{display:flex;flex-direction:column;gap:6px}',
    '.pk-item{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:6px;border:1px solid var(--line);border-radius:var(--r-btn);background:var(--bg)}',
    '.pk-sw{width:44px;height:44px;padding:0;border:1px solid rgba(0,0,0,.12);border-radius:8px;cursor:pointer;transition:transform .12s}',
    '.pk-sw:hover,.pk-sw:focus-visible{transform:scale(1.08);outline:2px solid var(--ink);outline-offset:1px}',
    '.pk-codes{display:flex;flex-direction:column;gap:2px;min-width:0}',
    '.pk-code{display:block;width:100%;padding:0;border:0;background:none;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pk-code.hex{font-size:15px;font-weight:var(--fw-semibold)}.pk-code.rgb{font-size:12px;color:var(--muted)}',
    '.pk-code:hover,.pk-code:focus-visible{color:var(--accent);outline:none}',
    '.pk-x{width:32px;height:32px;padding:0;border:0;border-radius:50%;background:none;color:var(--muted);font-size:20px;line-height:1;cursor:pointer}',
    '.pk-x:hover,.pk-x:focus-visible{background:var(--line);color:var(--ink);outline:none}',
    '.pk-empty{margin:0;padding:14px;border:1px dashed var(--line);border-radius:var(--r-btn);color:var(--muted);font-size:var(--fs-small);text-align:center}',
    '.pk-pal.cpal{gap:8px}.pk-pal .cswatch.lg{min-height:96px}',
    '@media (max-width:767.98px){.pk-stage{grid-template-columns:1fr}.pk-side .c-preview{min-height:120px}.pk-side .c-preview .c-hex{font-size:26px}.pk-pal.cpal{grid-template-columns:repeat(3,minmax(0,1fr))}.pk-pal .cswatch.lg{min-height:72px}}'
  ].join('\n');
  var st = el('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- 드롭 ----------
  var drop = el('div', 'pk-drop'); drop.tabIndex = 0; drop.setAttribute('role', 'button');
  drop.appendChild(el('strong', null, t('dropTitle')));
  var btnSel = el('button', 'btn btn-big', t('select')); btnSel.type = 'button';
  drop.appendChild(btnSel);
  drop.appendChild(el('span', 'muted', t('dropHint')));
  var input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true; input.setAttribute('aria-label', t('select'));
  drop.appendChild(input);
  app.appendChild(drop);

  // ---------- 무대: 캔버스 + 루페 | 현재 색 ----------
  var stage = el('div', 'pk-stage'); stage.hidden = true;
  var left = el('div', 'pk-left');
  var wrap = el('div', 'pk-wrap');
  var cv = el('canvas', 'pk-cv'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', t('canvas'));
  var ctx = cv.getContext('2d', { willReadFrequently: true });
  var loupe = el('div', 'pk-loupe'); loupe.setAttribute('aria-hidden', 'true');
  var lcv = el('canvas'); lcv.width = LOUPE; lcv.height = LOUPE;
  var lctx = lcv.getContext('2d');
  var lhex = el('span', 'pk-lh');
  loupe.appendChild(lcv); loupe.appendChild(lhex);
  wrap.appendChild(cv); wrap.appendChild(loupe);
  var bar = el('div', 'row');
  var btnChange = el('button', 'btn ghost sm', t('change')); btnChange.type = 'button';
  var btnExtract = el('button', 'btn sm', t('extract')); btnExtract.type = 'button';
  bar.appendChild(btnChange); bar.appendChild(btnExtract);
  left.appendChild(wrap); left.appendChild(bar);

  var side = el('div', 'pk-side');
  var prev = el('button', 'c-preview'); prev.type = 'button'; prev.setAttribute('aria-label', t('copy') + ' HEX');
  var prevHex = el('div', 'c-hex'), prevName = el('div', 'c-nm'), prevCopy = el('span', 'c-copy', t('copy'));
  prev.appendChild(prevHex); prev.appendChild(prevName); prev.appendChild(prevCopy);
  prev.addEventListener('click', function(){ if (cur) U.copy(cur); });
  var rows = el('div', 'vrows');
  var R = { hex: U.valueRow(t('hex'), ''), rgb: U.valueRow(t('rgb'), ''), hsl: U.valueRow(t('hsl'), '') };
  rows.appendChild(R.hex.el); rows.appendChild(R.rgb.el); rows.appendChild(R.hsl.el);
  side.appendChild(prev); side.appendChild(rows);
  stage.appendChild(left); stage.appendChild(side);
  app.appendChild(stage);

  var status = el('p', 'status'); status.setAttribute('aria-live', 'polite');
  app.appendChild(status);

  // ---------- 주요 색 ----------
  var domPal = el('div', 'cpal pk-pal'); domPal.style.setProperty('--cols', String(K));
  var domBar = el('div', 'row');
  var btnCopyAll = el('button', 'btn ghost sm', t('copyAll')); btnCopyAll.type = 'button';
  var btnSave = el('button', 'btn ghost sm', t('save')); btnSave.type = 'button';
  domBar.appendChild(btnCopyAll); domBar.appendChild(btnSave);
  var domBox = el('div'); domBox.appendChild(domPal); domBox.appendChild(domBar);
  var domSec = U.section(t('dominant'), domBox); domSec.hidden = true;
  app.appendChild(domSec);

  // ---------- 담은 색 ----------
  var list = el('div', 'pk-items');
  var empty = el('p', 'pk-empty', t('empty'));
  var listBar = el('div', 'row');
  var btnCopyPicks = el('button', 'btn ghost sm', t('copyAll')); btnCopyPicks.type = 'button';
  var btnClear = el('button', 'btn ghost sm', t('clear')); btnClear.type = 'button';
  listBar.appendChild(btnCopyPicks); listBar.appendChild(btnClear);
  var listBox = el('div'); listBox.appendChild(empty); listBox.appendChild(list); listBox.appendChild(listBar);
  var picksSec = U.section(t('picks'), listBox, t('picksMax')); picksSec.hidden = true;
  app.appendChild(picksSec);

  // ---------- 상태 ----------
  function say(msg, err){ status.textContent = msg || ''; status.className = 'status' + (err ? ' err' : ''); }

  // ---------- 이미지 읽기 (EXIF 회전 반영) ----------
  function viaImg(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function(){ URL.revokeObjectURL(url); res(im); };
      im.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('decode')); };
      im.src = url;
    });
  }
  function decode(file){
    if (!window.createImageBitmap) return viaImg(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function(){ return createImageBitmap(file); })
      .catch(function(){ return viaImg(file); });
  }
  function isImage(file){ return /^image\//.test(file.type || '') || /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(file.name || ''); }
  function load(file){
    if (!file) return;
    if (!isImage(file)) { say(t('notImage'), true); return; }
    say('');
    decode(file).then(function(bmp){
      var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
      if (!w || !h) throw new Error('empty');
      var s = Math.min(1, MAX_SIDE / Math.max(w, h));
      cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);   // 투명은 흰색 위에
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      img = ctx.getImageData(0, 0, cv.width, cv.height);
      dominant = []; domSec.hidden = true;
      drop.hidden = true; stage.hidden = false; picksSec.hidden = false;
      hideLoupe();
    }).catch(function(){ say(t('loadFail'), true); });
  }

  // ---------- 좌표 → 픽셀 ----------
  function pixel(x, y){ var i = (y * img.width + x) * 4, d = img.data; return C.rgbToHex({ r: d[i], g: d[i + 1], b: d[i + 2] }); }
  function pos(e){
    var r = cv.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) * cv.width / r.width), y = Math.floor((e.clientY - r.top) * cv.height / r.height);
    return { x: Math.min(cv.width - 1, Math.max(0, x)), y: Math.min(cv.height - 1, Math.max(0, y)), px: e.clientX - r.left, py: e.clientY - r.top, w: r.width, h: r.height };
  }
  function showLoupe(p, touch){
    var hex = pixel(p.x, p.y), half = (LOUPE_PX - 1) / 2;
    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = '#ffffff'; lctx.fillRect(0, 0, LOUPE, LOUPE);
    lctx.drawImage(cv, p.x - half, p.y - half, LOUPE_PX, LOUPE_PX, 0, 0, LOUPE, LOUPE);
    var c = half * ZOOM;
    lctx.lineWidth = 2; lctx.strokeStyle = '#000'; lctx.strokeRect(c - 1, c - 1, ZOOM + 2, ZOOM + 2);
    lctx.strokeStyle = '#fff'; lctx.strokeRect(c + 1, c + 1, ZOOM - 2, ZOOM - 2);
    lhex.textContent = hex;
    var lift = touch ? LOUPE + 50 : LOUPE / 2 + 24;
    var lx = Math.min(Math.max(0, p.px - LOUPE / 2), p.w - LOUPE), ly = p.py - lift;
    if (ly < 0) ly = Math.min(p.py + 24, p.h - LOUPE - 30);
    loupe.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(Math.max(0, ly)) + 'px)';
    loupe.classList.add('show');
    return hex;
  }
  function hideLoupe(){ loupe.classList.remove('show'); }

  // ---------- 현재 색 · 목록 ----------
  function setCurrent(hex){
    cur = hex;
    var rgb = C.hexToRgb(hex), near = C.nearestName(hex);
    prev.style.background = hex; prev.style.color = C.textOn(hex);
    prevHex.textContent = hex; prevName.textContent = near.exact ? near.name : '≈ ' + near.name;
    R.hex.set(hex); R.rgb.set(C.rgbString(rgb)); R.hsl.set(C.hslString(C.rgbToHsl(rgb)));
  }
  function item(hex){
    var row = el('div', 'pk-item'); row.setAttribute('data-hex', hex);
    var sw = el('button', 'pk-sw'); sw.type = 'button'; sw.style.background = hex; sw.title = t('use'); sw.setAttribute('aria-label', t('use') + ' ' + hex);
    sw.addEventListener('click', function(){ setCurrent(hex); });
    var codes = el('div', 'pk-codes');
    var bh = el('button', 'pk-code hex', hex); bh.type = 'button'; bh.setAttribute('aria-label', t('copy') + ' ' + hex);
    var rgbs = C.rgbString(C.hexToRgb(hex));
    var br = el('button', 'pk-code rgb', rgbs); br.type = 'button'; br.setAttribute('aria-label', t('copy') + ' ' + rgbs);
    bh.addEventListener('click', function(){ U.copy(hex); }); br.addEventListener('click', function(){ U.copy(rgbs); });
    codes.appendChild(bh); codes.appendChild(br);
    var bc = el('button', 'btn ghost sm', t('copy')); bc.type = 'button'; bc.setAttribute('aria-label', t('copy') + ' ' + hex);
    bc.addEventListener('click', function(){ U.copy(hex); });
    var bx = el('button', 'pk-x', '×'); bx.type = 'button'; bx.setAttribute('aria-label', t('remove') + ' ' + hex);
    bx.addEventListener('click', function(){ picks.splice(picks.indexOf(hex), 1); renderPicks(); });
    row.appendChild(sw); row.appendChild(codes); row.appendChild(bc); row.appendChild(bx);
    return row;
  }
  function renderPicks(){
    list.textContent = '';
    for (var i = 0; i < picks.length; i++) list.appendChild(item(picks[i]));
    empty.hidden = picks.length > 0; listBar.hidden = picks.length === 0;
  }
  function pick(hex){
    setCurrent(hex);
    var i = picks.indexOf(hex);
    if (i >= 0) picks.splice(i, 1);          // 같은 색은 맨 앞으로
    picks.unshift(hex);
    if (picks.length > MAX_PICKS) picks.length = MAX_PICKS;
    renderPicks();
  }

  // ---------- 포인터 ----------
  var pressing = false, touch = false;
  cv.addEventListener('pointerdown', function(e){
    if (!img) return;
    e.preventDefault(); pressing = true; touch = e.pointerType !== 'mouse';
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    showLoupe(pos(e), touch);
  });
  cv.addEventListener('pointermove', function(e){
    if (!img) return;
    if (e.pointerType !== 'mouse' && !pressing) return;
    showLoupe(pos(e), e.pointerType !== 'mouse');
  });
  cv.addEventListener('pointerup', function(e){
    if (!img || !pressing) return;
    pressing = false;
    var p = pos(e); pick(pixel(p.x, p.y));
    if (touch) hideLoupe(); else showLoupe(p, false);
  });
  cv.addEventListener('pointercancel', function(){ pressing = false; hideLoupe(); });
  cv.addEventListener('pointerleave', function(){ if (!pressing) hideLoupe(); });

  // ---------- 주요 색: 표본 → k-means (최원점 초기화, 12회) ----------
  function sample(){
    var s = Math.min(1, 100 / Math.max(cv.width, cv.height));
    var w = Math.max(1, Math.round(cv.width * s)), h = Math.max(1, Math.round(cv.height * s));
    var sc = el('canvas'); sc.width = w; sc.height = h;
    var sx = sc.getContext('2d'); sx.drawImage(cv, 0, 0, w, h);
    var d = sx.getImageData(0, 0, w, h).data, pts = [];
    for (var i = 0; i < d.length; i += 4) pts.push([d[i], d[i + 1], d[i + 2]]);
    return pts;
  }
  function d2(a, b){ var r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2]; return r * r + g * g + bl * bl; }
  function kmeans(pts, k){
    if (!pts.length) return [];
    var cents = [pts[0].slice()], i, j, n, best, bd;
    var minD = pts.map(function(p){ return d2(p, cents[0]); });
    while (cents.length < k) {                                // 가장 먼 점을 다음 중심으로
      var far = 0; for (i = 1; i < pts.length; i++) if (minD[i] > minD[far]) far = i;
      if (minD[far] === 0) break;
      var c = pts[far].slice(); cents.push(c);
      for (i = 0; i < pts.length; i++) { var dd = d2(pts[i], c); if (dd < minD[i]) minD[i] = dd; }
    }
    var assign = new Array(pts.length), counts;
    for (var it = 0; it < 12; it++) {
      var sums = cents.map(function(){ return [0, 0, 0]; }); counts = cents.map(function(){ return 0; });
      var moved = false;
      for (i = 0; i < pts.length; i++) {
        best = 0; bd = Infinity;
        for (j = 0; j < cents.length; j++) { n = d2(pts[i], cents[j]); if (n < bd) { bd = n; best = j; } }
        if (assign[i] !== best) { assign[i] = best; moved = true; }
        sums[best][0] += pts[i][0]; sums[best][1] += pts[i][1]; sums[best][2] += pts[i][2]; counts[best]++;
      }
      for (j = 0; j < cents.length; j++) if (counts[j]) cents[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]];
      if (!moved) break;
    }
    var out = [];
    for (j = 0; j < cents.length; j++) if (counts[j]) out.push({ n: counts[j], c: cents[j] });
    out.sort(function(a, b){ return b.n - a.n; });
    return out;
  }
  // 묶음을 넉넉히(2K) 만든 뒤 비슷한 중심은 합치고, 큰 순서로 K 개
  function dominantColors(pts, k){
    var cl = kmeans(pts, k * 2), i, j;
    for (i = 0; i < cl.length; i++) for (j = cl.length - 1; j > i; j--) {
      if (d2(cl[i].c, cl[j].c) > 24 * 24) continue;
      var n = cl[i].n + cl[j].n, a = cl[i].c, b = cl[j].c;
      cl[i].c = [(a[0] * cl[i].n + b[0] * cl[j].n) / n, (a[1] * cl[i].n + b[1] * cl[j].n) / n, (a[2] * cl[i].n + b[2] * cl[j].n) / n]; cl[i].n = n;
      cl.splice(j, 1);
    }
    cl.sort(function(a, b){ return b.n - a.n; });
    return cl.slice(0, k).map(function(o){ return C.rgbToHex({ r: o.c[0], g: o.c[1], b: o.c[2] }); });
  }
  function extract(){
    if (!img) return;
    btnExtract.disabled = true; btnExtract.textContent = t('extracting');
    setTimeout(function(){
      dominant = dominantColors(sample(), K);
      U.setPalette(domPal, dominant, { large: true });
      domPal.style.setProperty('--cols', String(dominant.length || 1));
      domSec.hidden = false;
      btnExtract.disabled = false; btnExtract.textContent = t('extract');
      try { domSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
    }, 20);
  }
  // 팔레트 PNG: 칸마다 색 + HEX 글자
  function savePalette(){
    if (!dominant.length) return;
    var W = 160, H = 200, pc = el('canvas'); pc.width = W * dominant.length; pc.height = H;
    var x = pc.getContext('2d');
    x.font = '600 20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'; x.textAlign = 'center';
    for (var i = 0; i < dominant.length; i++) {
      x.fillStyle = dominant[i]; x.fillRect(i * W, 0, W, H);
      x.fillStyle = C.textOn(dominant[i]); x.fillText(dominant[i], i * W + W / 2, H - 18);
    }
    pc.toBlob(function(blob){
      if (!blob) return;
      var url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = 'palette.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  // ---------- 이벤트 ----------
  function openPicker(){ input.value = ''; input.click(); }
  drop.addEventListener('click', function(e){ if (e.target !== btnSel) openPicker(); });
  btnSel.addEventListener('click', openPicker);
  drop.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && e.target === drop) { e.preventDefault(); openPicker(); } });
  input.addEventListener('change', function(){ load(input.files && input.files[0]); });
  btnChange.addEventListener('click', openPicker);
  btnExtract.addEventListener('click', extract);
  btnCopyAll.addEventListener('click', function(){ if (dominant.length) U.copy(dominant.join('\n')); });
  btnSave.addEventListener('click', savePalette);
  btnCopyPicks.addEventListener('click', function(){ if (picks.length) U.copy(picks.join('\n')); });
  btnClear.addEventListener('click', function(){ picks = []; renderPicks(); });
  // 드래그: 문서 어디에 놓아도 받는다
  var depth = 0;
  function hasFiles(e){ var ts = e.dataTransfer && e.dataTransfer.types; return !!ts && Array.prototype.indexOf.call(ts, 'Files') >= 0; }
  document.addEventListener('dragenter', function(e){ if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add('on'); });
  document.addEventListener('dragover', function(e){ if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('dragleave', function(e){ if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('on'); });
  document.addEventListener('drop', function(e){ if (!hasFiles(e)) return; e.preventDefault(); depth = 0; drop.classList.remove('on'); load(e.dataTransfer.files[0]); });
  // 붙여넣기 (Ctrl+V 로 이미지)
  document.addEventListener('paste', function(e){
    var fs = e.clipboardData && e.clipboardData.files;
    if (fs && fs.length && isImage(fs[0])) { e.preventDefault(); load(fs[0]); }
  });

  renderPicks();
})();
