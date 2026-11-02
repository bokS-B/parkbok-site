// 이미지 워터마크: 각 이미지 위에 글자(fillText) 또는 PNG 이미지를 한 곳(3×3 위치)에 찍거나 비스듬히 반복(타일)한다.
// 글자는 캔버스 fillText 라 어느 언어든 그대로 들어간다. 한 장씩 그리고 바로 버려 여러 장을 넣어도 메모리가 쌓이지 않는다.
(function(){
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  // 오류: 도구 json strings.<lang>.errors.<key> → 없으면 공통 errorGeneric
  function fail(ctx, key){
    var errs = ctx && ctx.t ? ctx.t('errors') : null;
    var msg = errs && typeof errs === 'object' ? errs[key] : null;
    var e = new Error(key);
    if (msg) e.userMessage = msg; else e.key = 'errorGeneric';
    return e;
  }
  function clamp(v, lo, hi, d){ v = parseFloat(v); return isNaN(v) ? d : Math.min(hi, Math.max(lo, v)); }
  // 옵션 → 정리된 값
  function parseOpts(opts){
    opts = opts || {};
    return {
      type: opts.type === 'image' ? 'image' : 'text',
      text: String(opts.text == null ? '' : opts.text).trim(),
      size: clamp(opts.size, 12, 200, 48),
      color: /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color : '#ffffff',
      opacity: clamp(opts.opacity, 5, 100, 50) / 100,
      tile: opts.tile === true || opts.tile === 'true',
      position: /^[tmb][lcr]$/.test(opts.position || '') ? opts.position : 'br',
      image: /^data:image\/png/.test(opts.image || '') ? opts.image : '',
      scale: clamp(opts.scale, 5, 60, 25) / 100
    };
  }
  // data URL → Image
  function loadDataUrl(src){
    return new Promise(function(res, rej){
      var im = new Image();
      im.onload = function(){ res(im); }; im.onerror = function(){ rej(new Error('image')); };
      im.src = src;
    });
  }
  // 3×3 위치 → 좌상단 좌표 (여백은 짧은 변의 3%)
  function place(pos, W, H, w, h){
    var m = Math.round(Math.min(W, H) * 0.03), x, y;
    var c = pos.charAt(1), r = pos.charAt(0);
    x = c === 'l' ? m : c === 'c' ? (W - w) / 2 : W - w - m;
    y = r === 't' ? m : r === 'm' ? (H - h) / 2 : H - h - m;
    return { x: x, y: y };
  }
  // 한 장 처리: 원본을 그리고 그 위에 워터마크를 얹는다
  function stamp(g, W, H, o, wm){
    g.save();
    g.globalAlpha = o.opacity;
    var w = wm.w, h = wm.h;
    if (o.tile) {
      // 비스듬히 반복: 캔버스 중심 기준 -30° 회전 후 격자로 채운다 (회전해도 모서리가 비지 않게 넉넉히)
      var gx = w + Math.max(w * 0.6, 24), gy = h + Math.max(h * 1.2, 24), R = Math.ceil(Math.sqrt(W * W + H * H));
      g.translate(W / 2, H / 2); g.rotate(-Math.PI / 6);
      for (var y = -R; y < R; y += gy) {
        var row = Math.round((y + R) / gy), off = (row % 2) * gx / 2;
        for (var x = -R - off; x < R; x += gx) wm.draw(g, x, y);
      }
    } else {
      var p = place(o.position, W, H, w, h);
      wm.draw(g, p.x, p.y);
    }
    g.restore();
  }
  // 글자 워터마크 그리기 준비 (너비·높이 측정 + draw)
  function textMark(g, o, W, H){
    var size = o.size;
    g.font = 'bold ' + size + 'px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif';
    g.textBaseline = 'top';
    var w = Math.ceil(g.measureText(o.text).width), h = Math.ceil(size * 1.2);
    return { w: w, h: h, draw: function(ctx, x, y){
      ctx.font = g.font; ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = Math.max(2, size / 12);
      ctx.fillStyle = o.color; ctx.fillText(o.text, x, y);
    } };
  }
  // 이미지 워터마크: 너비를 원본 너비의 scale% 로 맞춘다
  function imageMark(img, o, W, H){
    var s = (W * o.scale) / Math.max(1, img.naturalWidth || img.width);
    var w = Math.max(1, Math.round((img.naturalWidth || img.width) * s)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
    if (h > H) { s = H / (img.naturalHeight || img.height); w = Math.max(1, Math.round((img.naturalWidth || img.width) * s)); h = H; }
    return { w: w, h: h, draw: function(ctx, x, y){ ctx.drawImage(img, x, y, w, h); } };
  }
  var tool = {
    id: 'image-watermark',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'type', type: 'radio', choices: ['text', 'image'], default: 'text' },
      { id: 'text', type: 'text', default: '', maxlength: 80, showIf: { type: 'text' } },
      { id: 'size', type: 'range', min: 12, max: 200, step: 1, default: 48, unit: 'px', showIf: { type: 'text' } },
      { id: 'color', type: 'color', default: '#ffffff', showIf: { type: 'text' } },
      { id: 'image', type: 'signature', showIf: { type: 'image' } },
      { id: 'scale', type: 'range', min: 5, max: 60, step: 1, default: 25, unit: '%', showIf: { type: 'image' } },
      { id: 'opacity', type: 'range', min: 5, max: 100, step: 1, default: 50, unit: '%' },
      { id: 'tile', type: 'checkbox', default: false },
      { id: 'position', type: 'position', default: 'br', showIf: { tile: false } }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], wmImg = null;
      if (o.type === 'text' && !o.text) throw fail(ctx, 'text');
      if (o.type === 'image') {
        if (!o.image) throw fail(ctx, 'image');
        try { wmImg = await loadDataUrl(o.image); } catch (e) { throw fail(ctx, 'image'); }
      }
      for (var i = 0; i < files.length; i++) {
        ctx.progress(i / files.length);
        var img = await ctx.loadImage(files[i]);
        var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
        var c = ctx.canvas(W, H), g = c.getContext('2d');
        g.drawImage(img, 0, 0, W, H);
        ctx.release(img);
        stamp(g, W, H, o, o.type === 'text' ? textMark(g, o, W, H) : imageMark(wmImg, o, W, H));
        // JPG 원본은 JPG 로, 나머지(PNG·WebP 등 투명 가능)는 PNG 로 저장
        var jpg = /jpe?g/i.test((files[i].type || '') + ' ' + (files[i].name || '').replace(/.*\./, ''));
        var blob = await ctx.toBlob(c, jpg ? 'image/jpeg' : 'image/png', 0.92);
        c.width = c.height = 1;
        outputs.push({ name: baseName(files[i].name) + '-watermark.' + (jpg ? 'jpg' : 'png'), blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  tool.parseOpts = parseOpts;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
