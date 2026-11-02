// 이미지 크기 조절: 퍼센트 또는 픽셀로 가로·세로를 정해 다시 그린다.
// 축소는 절반씩 단계 축소로 화질을 지키고, 한 장씩 처리해 메모리를 바로 돌려준다.
(function(){
  var SIDE_LIMIT = 16384, QUALITY = 0.92;
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  function extOf(n){ var m = /\.([a-z0-9]+)$/i.exec(n || ''); return m ? m[1].toLowerCase() : ''; }
  function num(v){ var n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; }
  // 옵션 → { mode, percent, width, height, keepRatio, format }
  function parseOpts(opts){
    opts = opts || {};
    var mode = opts.mode === 'pixel' ? 'pixel' : 'percent';
    var p = num(opts.percent); if (!(p >= 10 && p <= 200)) p = 50;
    var fm = /^(keep|jpg|png|webp)$/.test(opts.format || '') ? opts.format : 'keep';
    return { mode: mode, percent: p, width: Math.round(num(opts.width)), height: Math.round(num(opts.height)), keepRatio: opts.keepRatio !== false, format: fm };
  }
  // 원본 w×h → 결과 크기. 없으면 null(픽셀 모드에서 둘 다 비었을 때).
  function targetSize(w, h, o){
    var tw, th;
    if (o.mode === 'percent') { tw = w * o.percent / 100; th = h * o.percent / 100; }
    else if (!o.width && !o.height) return null;
    else if (o.width && o.height) {
      if (o.keepRatio) { var s = Math.min(o.width / w, o.height / h); tw = w * s; th = h * s; }   // 상자 안에 맞춤
      else { tw = o.width; th = o.height; }
    }
    else if (o.width) { tw = o.width; th = h * o.width / w; }
    else { th = o.height; tw = w * o.height / h; }
    return { w: Math.max(1, Math.round(tw)), h: Math.max(1, Math.round(th)) };
  }
  // 출력 형식: keep 이면 원본 종류를 따르되 캔버스로 못 만드는 형식(HEIC·BMP·TIFF)은 JPG, GIF·SVG 는 PNG
  function pickFormat(f, format){
    if (format === 'jpg') return { mime: 'image/jpeg', ext: 'jpg' };
    if (format === 'png') return { mime: 'image/png', ext: 'png' };
    if (format === 'webp') return { mime: 'image/webp', ext: 'webp' };
    var t = (f.type || '').toLowerCase(), e = extOf(f.name);
    if (t === 'image/jpeg' || e === 'jpg' || e === 'jpeg') return { mime: 'image/jpeg', ext: 'jpg' };
    if (t === 'image/webp' || e === 'webp') return { mime: 'image/webp', ext: 'webp' };
    if (t === 'image/png' || t === 'image/gif' || t === 'image/svg+xml' || t === 'image/avif' || /^(png|gif|svg|avif|ico)$/.test(e)) return { mime: 'image/png', ext: 'png' };
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // 고품질 리샘플: 목표의 2배 이상이면 절반씩 줄인 뒤 마지막에 정확한 크기로 그린다(확대는 한 번에).
  function resample(img, w, h, tw, th, ctx){
    var cur = img, cw = w, ch = h;
    while (cw >= tw * 2 && ch >= th * 2) {
      var nw = Math.max(tw, Math.floor(cw / 2)), nh = Math.max(th, Math.floor(ch / 2));
      var c = ctx.canvas(nw, nh); c.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
      if (cur !== img) cur.width = cur.height = 1;
      cur = c; cw = nw; ch = nh;
    }
    var out = ctx.canvas(tw, th); out.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, tw, th);
    if (cur !== img) cur.width = cur.height = 1;
    return out;
  }
  var tool = {
    id: 'image-resize',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'mode', type: 'radio', choices: ['percent', 'pixel'], default: 'percent' },
      { id: 'percent', type: 'range', min: 10, max: 200, step: 1, default: 50, unit: '%', showIf: { mode: 'percent' } },
      { id: 'width', type: 'number', min: 1, max: SIDE_LIMIT, step: 1, unit: 'px', showIf: { mode: 'pixel' } },
      { id: 'height', type: 'number', min: 1, max: SIDE_LIMIT, step: 1, unit: 'px', showIf: { mode: 'pixel' } },
      { id: 'keepRatio', type: 'checkbox', default: true, showIf: { mode: 'pixel' } },
      { id: 'format', type: 'select', choices: ['keep', 'jpg', 'png', 'webp'], default: 'keep' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], first = null;
      if (o.mode === 'pixel' && !o.width && !o.height) { var e0 = new Error('errorNoSize'); e0.key = 'errorNoSize'; throw e0; }
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        ctx.progress(i / files.length);
        var img = await ctx.loadImage(f);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var tg = targetSize(w, h, o);
        if (!tg || tg.w > SIDE_LIMIT || tg.h > SIDE_LIMIT) { ctx.release(img); var e = new Error('errorTooBig'); e.key = 'errorTooBig'; throw e; }
        var c = resample(img, w, h, tg.w, tg.h, ctx);
        ctx.release(img);
        var fm = pickFormat(f, o.format);
        if (fm.mime === 'image/jpeg') {
          // JPG 는 투명이 없으므로 흰색 바탕 위에 그린다
          var j = ctx.canvas(c.width, c.height), g = j.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, j.width, j.height); g.drawImage(c, 0, 0);
          c.width = c.height = 1; c = j;
        }
        var blob = await ctx.toBlob(c, fm.mime, fm.mime === 'image/png' ? undefined : QUALITY);
        if (fm.mime === 'image/webp' && blob.type !== 'image/webp') { fm = { mime: 'image/png', ext: 'png' }; blob = await ctx.toBlob(c, fm.mime); }
        c.width = c.height = 1;
        if (!first) first = { w: w, h: h, tw: tg.w, th: tg.h };
        outputs.push({ name: baseName(f.name) + '.' + fm.ext, blob: blob, srcSize: f.size });
        ctx.progress((i + 1) / files.length);
      }
      var note = files.length === 1 ? ctx.t('noteSize', { w: first.w, h: first.h, tw: first.tw, th: first.th }) : ctx.t('noteCount', { n: files.length });
      return { outputs: outputs, note: note };
    }
  };
  tool.parseOpts = parseOpts;
  tool.targetSize = targetSize;
  tool.pickFormat = pickFormat;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
