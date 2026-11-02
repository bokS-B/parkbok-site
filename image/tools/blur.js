// 얼굴·개인정보 가리기: 드래그로 고른 사각형 영역을 흐림·모자이크·검정으로 덮는다. 한 장만 처리한다.
// 영역을 하나도 안 그리면 이미지 전체를 가린다. 흐림은 캔버스 filter 를 쓰고, 지원하지 않는 브라우저는 축소→확대로 대신한다.
(function(){
  var STYLES = ['blur', 'pixelate', 'black'];
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  function fail(key){ var e = new Error(key); e.key = key; return e; }
  // 옵션 → { regions[], style, strength(5~60) }
  function parseOpts(opts){
    opts = opts || {};
    var s = parseFloat(opts.strength); if (!(s >= 5 && s <= 60)) s = 20;
    var style = STYLES.indexOf(opts.style) >= 0 ? opts.style : 'blur';
    var regions = Array.isArray(opts.regions) ? opts.regions : [];
    return { regions: regions, style: style, strength: s };
  }
  // 사각형을 정수로 바꾸고 이미지 안으로 자른다. 비어 있거나 밖으로 나간 것은 버린다.
  function clampRects(list, w, h){
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      var x = Math.max(0, Math.round(r.x || 0)), y = Math.max(0, Math.round(r.y || 0));
      var x2 = Math.min(w, Math.round((r.x || 0) + (r.w || 0))), y2 = Math.min(h, Math.round((r.y || 0) + (r.h || 0)));
      if (x2 - x >= 1 && y2 - y >= 1) out.push({ x: x, y: y, w: x2 - x, h: y2 - y });
    }
    return out;
  }
  function filterOK(g){
    try { g.filter = 'blur(2px)'; var ok = g.filter === 'blur(2px)'; g.filter = 'none'; return ok; } catch (e) { return false; }
  }
  // 영역 주변까지 포함한 임시 캔버스. 이미지 밖은 영역을 늘린 픽셀로 채워 가장자리가 어두워지지 않게 한다.
  function padded(ctx, c, r, pad){
    var tw = r.w + pad * 2, th = r.h + pad * 2, tmp = ctx.canvas(tw, th), g = tmp.getContext('2d');
    g.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, tw, th);
    var sx = Math.max(0, r.x - pad), sy = Math.max(0, r.y - pad);
    var sw = Math.min(c.width, r.x + r.w + pad) - sx, sh = Math.min(c.height, r.y + r.h + pad) - sy;
    if (sw > 0 && sh > 0) g.drawImage(c, sx, sy, sw, sh, sx - (r.x - pad), sy - (r.y - pad), sw, sh);
    return tmp;
  }
  function blurRegion(ctx, c, g, r, radius){
    // 가우시안 꼬리(약 3σ)가 임시 캔버스 밖의 투명을 끌어오지 않도록 여유를 넉넉히 두고, 흐린 결과를 원본 위에 겹쳐 가장자리 투명을 없앤다
    var pad = Math.ceil(radius * 3), src = padded(ctx, c, r, pad), out = ctx.canvas(src.width, src.height), og = out.getContext('2d');
    og.drawImage(src, 0, 0);
    if (filterOK(og)) {
      og.filter = 'blur(' + radius + 'px)'; og.drawImage(src, 0, 0); og.filter = 'none';
    } else {
      // filter 미지원: 반지름의 절반 크기로 줄였다가 부드럽게 키운다
      var small = ctx.scaleTo(src, Math.max(1, Math.ceil(src.width / Math.max(2, radius / 2))), Math.max(1, Math.ceil(src.height / Math.max(2, radius / 2))));
      og.imageSmoothingEnabled = true; og.drawImage(small, 0, 0, small.width, small.height, 0, 0, out.width, out.height);
      small.width = small.height = 1;
    }
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(out, pad, pad, r.w, r.h, r.x, r.y, r.w, r.h);
    src.width = src.height = 1; out.width = out.height = 1;
  }
  function pixelateRegion(ctx, c, g, r, block){
    var sw = Math.max(1, Math.ceil(r.w / block)), sh = Math.max(1, Math.ceil(r.h / block));
    var small = ctx.canvas(sw, sh), sg = small.getContext('2d');
    sg.imageSmoothingEnabled = true; sg.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
    g.save(); g.imageSmoothingEnabled = false;
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(small, 0, 0, sw, sh, r.x, r.y, r.w, r.h);
    g.restore(); small.width = small.height = 1;
  }
  var tool = {
    id: 'blur',
    accept: 'image/*',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'regions', type: 'blur-regions', default: [] },
      { id: 'style', type: 'radio', choices: STYLES, default: 'blur' },
      { id: 'strength', type: 'range', min: 5, max: 60, step: 1, default: 20 }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), f = files[0];
      if (!f) throw fail('errorEmpty');
      ctx.progress(0.05);
      var img = await ctx.loadImage(f);
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!(w > 0 && h > 0)) { ctx.release(img); throw fail('errorBroken'); }
      var c = ctx.canvas(w, h), g = c.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      ctx.release(img);
      ctx.progress(0.2);
      var rects = clampRects(o.regions, w, h), note = '';
      if (!rects.length) { rects = [{ x: 0, y: 0, w: w, h: h }]; note = ctx.t('noteWhole'); }
      // 큰 사진에서도 미리보기와 비슷하게 보이도록 강도를 이미지 크기에 맞춰 키운다
      var amount = o.strength * Math.max(1, Math.max(w, h) / 1500);
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (o.style === 'black') { g.fillStyle = '#000'; g.fillRect(r.x, r.y, r.w, r.h); }
        else if (o.style === 'pixelate') pixelateRegion(ctx, c, g, r, Math.max(2, Math.round(amount)));
        else blurRegion(ctx, c, g, r, Math.max(1, Math.round(amount)));
        ctx.progress(0.2 + 0.7 * (i + 1) / rects.length);
      }
      var jpeg = /jpe?g/i.test((f.type || '') + ' ' + (f.name || '').replace(/^.*\./, ''));
      var blob = await ctx.toBlob(c, jpeg ? 'image/jpeg' : 'image/png', jpeg ? 0.92 : undefined);
      c.width = c.height = 1;
      ctx.progress(1);
      return { outputs: [{ name: baseName(f.name) + '-blur.' + (jpeg ? 'jpg' : 'png'), blob: blob, srcSize: f.size }], note: note };
    }
  };
  tool.parseOpts = parseOpts;
  tool.clampRects = clampRects;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
