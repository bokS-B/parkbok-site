// 쇼핑몰 상품 이미지 규격: 오픈마켓별 권장 크기 프리셋으로 여러 장을 한 번에 맞춘다.
// 정사각형 프리셋은 상품 전체를 흰색(또는 투명) 여백 안에 넣거나(contain) 가운데를 잘라 채운다(cover). 가로 고정 프리셋은 비율대로 세로를 정한다.
// 크기는 각 판매자센터가 안내하는 권장값 기준이며 바뀔 수 있다(문구의 FAQ 참고). JPG 용량 상한은 image-compress 와 같은 품질 이분 탐색을 쓴다.
(function(){
  var SIDE_LIMIT = 16384, MIN_QUALITY = 0.3;
  // w×h 고정 또는 w 만(세로는 비율대로)
  var PRESETS = {
    naver_main: { w: 1000, h: 1000 },
    naver_extra: { w: 1000, h: 1000 },
    coupang_main: { w: 1000, h: 1000, white: true },
    coupang_detail: { w: 780, h: 0 },
    st11_main: { w: 1000, h: 1000 },
    gmarket_main: { w: 1000, h: 1000 },
    detail_860: { w: 860, h: 0 },
    custom: null
  };
  var ORDER = ['naver_main', 'naver_extra', 'coupang_main', 'coupang_detail', 'st11_main', 'gmarket_main', 'detail_860', 'custom'];
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  function num(v){ var n = parseFloat(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; }
  // 옵션 → { preset, w, h, fit, bg, margin, format, quality, maxKb, maxBytes, valid }
  function parseOpts(opts){
    opts = opts || {};
    var id = PRESETS.hasOwnProperty(opts.preset) ? opts.preset : 'naver_main', p = PRESETS[id];
    var w = p ? p.w : num(opts.width), h = p ? p.h : num(opts.height);
    var fit = opts.fit === 'cover' ? 'cover' : 'contain';
    var bg = opts.bg === 'transparent' && !(p && p.white) ? 'transparent' : 'white';
    var format = opts.format === 'png' ? 'png' : 'jpg';
    var margin = parseFloat(opts.margin); margin = isFinite(margin) ? Math.max(0, Math.min(30, margin)) : 0;
    var q = parseFloat(opts.quality); q = isFinite(q) ? Math.max(50, Math.min(100, q)) / 100 : 0.9;
    var rawKb = opts.maxKb, kb = rawKb == null || String(rawKb).trim() === '' ? 0 : Number(rawKb);
    var validKb = isFinite(kb) && kb >= 0 && kb <= 51200;
    return { preset: id, w: w, h: h, fit: fit, bg: bg, margin: margin, format: format, quality: q, maxKb: kb,
      maxBytes: validKb && kb > 0 ? Math.floor(kb * 1024) : null, validKb: validKb, validSize: w > 0 && w <= SIDE_LIMIT && h >= 0 && h <= SIDE_LIMIT };
  }
  // 원본 w×h → 캔버스 크기와 그릴 위치 { ow, oh, sx, sy, sw, sh, dx, dy, dw, dh }
  function plan(w, h, o){
    if (!o.h) {
      // 가로 고정: 여백 없이 가로를 맞추고 세로는 비율대로
      var oh = Math.max(1, Math.round(h * o.w / w));
      return { ow: o.w, oh: oh, sx: 0, sy: 0, sw: w, sh: h, dx: 0, dy: 0, dw: o.w, dh: oh };
    }
    var ow = o.w, oh2 = o.h;
    if (o.fit === 'cover') {
      // 가운데를 잘라 칸을 꽉 채운다
      var s = Math.max(ow / w, oh2 / h), sw = ow / s, sh = oh2 / s;
      return { ow: ow, oh: oh2, sx: (w - sw) / 2, sy: (h - sh) / 2, sw: sw, sh: sh, dx: 0, dy: 0, dw: ow, dh: oh2 };
    }
    // 상품 전체가 보이게 여백(%) 안쪽 상자에 맞춘다
    var bw = ow * (1 - o.margin * 2 / 100), bh = oh2 * (1 - o.margin * 2 / 100), k = Math.min(bw / w, bh / h);
    var dw = Math.max(1, Math.round(w * k)), dh = Math.max(1, Math.round(h * k));
    return { ow: ow, oh: oh2, sx: 0, sy: 0, sw: w, sh: h, dx: Math.round((ow - dw) / 2), dy: Math.round((oh2 - dh) / 2), dw: dw, dh: dh };
  }
  // 고품질 리샘플: 원본 부분(sx..sw)을 목표의 2배 아래가 될 때까지 절반씩 줄인 뒤 마지막에 정확히 그린다
  function draw(img, P, ctx, fill){
    var cur = img, cx = P.sx, cy = P.sy, cw = P.sw, ch = P.sh;
    while (cw >= P.dw * 2 && ch >= P.dh * 2) {
      var nw = Math.max(P.dw, Math.floor(cw / 2)), nh = Math.max(P.dh, Math.floor(ch / 2));
      var c = ctx.canvas(nw, nh); c.getContext('2d').drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh);
      if (cur !== img) cur.width = cur.height = 1;
      cur = c; cx = 0; cy = 0; cw = nw; ch = nh;
    }
    var out = ctx.canvas(P.ow, P.oh), g = out.getContext('2d');
    if (fill) { g.fillStyle = fill; g.fillRect(0, 0, out.width, out.height); }
    g.drawImage(cur, cx, cy, cw, ch, P.dx, P.dy, P.dw, P.dh);
    if (cur !== img) cur.width = cur.height = 1;
    return out;
  }
  async function fitTarget(ctx, c, initial, quality, budget){
    if (budget === null || initial.size <= budget) return initial;
    var lo = MIN_QUALITY, hi = quality, low = await ctx.toBlob(c, 'image/jpeg', lo);
    if (low.size > budget) return low.size < initial.size ? low : initial;
    var fit = low;
    for (var i = 0; i < 7 && hi - lo > 0.01; i++) {
      var q = (lo + hi) / 2, blob = await ctx.toBlob(c, 'image/jpeg', q);
      if (blob.size <= budget) { fit = blob; lo = q; } else hi = q;
    }
    return fit;
  }
  function fail(key){ var e = new Error(key); e.key = key; return e; }

  var tool = {
    id: 'product-image-size',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    invalidateOnEdit: true,
    options: [
      { id: 'preset', type: 'select', choices: ORDER, default: 'naver_main' },
      { id: 'width', type: 'number', min: 1, max: SIDE_LIMIT, step: 1, default: 1000, unit: 'px', showIf: { preset: 'custom' } },
      { id: 'height', type: 'number', min: 0, max: SIDE_LIMIT, step: 1, default: 1000, unit: 'px', showIf: { preset: 'custom' } },
      { id: 'fit', type: 'radio', choices: ['contain', 'cover'], default: 'contain', showIf: { preset: ['naver_main', 'naver_extra', 'coupang_main', 'st11_main', 'gmarket_main', 'custom'] } },
      { id: 'bg', type: 'radio', choices: ['white', 'transparent'], default: 'white', showIf: { fit: 'contain', preset: ['naver_main', 'naver_extra', 'st11_main', 'gmarket_main', 'custom'] } },
      { id: 'margin', type: 'range', min: 0, max: 20, step: 1, default: 0, unit: '%', showIf: { fit: 'contain', preset: ['naver_main', 'naver_extra', 'coupang_main', 'st11_main', 'gmarket_main', 'custom'] } },
      { id: 'format', type: 'select', choices: ['jpg', 'png'], default: 'jpg' },
      { id: 'quality', type: 'range', min: 50, max: 100, step: 1, default: 90, unit: '%', showIf: { format: 'jpg' } },
      { id: 'maxKb', type: 'number', min: 0, step: 10, default: 0, unit: 'KB', showIf: { format: 'jpg' } }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], oversized = 0, first = null;
      if (!o.validSize) throw fail('errorNoSize');
      if (!o.validKb) throw fail('errorTarget');
      // 투명 여백은 PNG 에서만 남는다. JPG 로 저장하면 흰색으로 채운다.
      var fill = o.format === 'jpg' || o.bg === 'white' || o.fit === 'cover' || !o.h ? '#ffffff' : null;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        ctx.progress(i / files.length);
        var img = await ctx.loadImage(f), w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0)) { ctx.release(img); throw fail('errorBroken'); }
        var P = plan(w, h, o);
        if (P.oh > SIDE_LIMIT) { ctx.release(img); throw fail('errorTooBig'); }
        var c = draw(img, P, ctx, fill);
        ctx.release(img);
        var blob;
        if (o.format === 'png') blob = await ctx.toBlob(c, 'image/png');
        else { blob = await ctx.toBlob(c, 'image/jpeg', o.quality); blob = await fitTarget(ctx, c, blob, o.quality, o.maxBytes); }
        if (o.maxBytes !== null && o.format === 'jpg' && blob.size > o.maxBytes) oversized++;
        if (!first) first = { w: P.ow, h: P.oh };
        c.width = c.height = 1;
        outputs.push({ name: baseName(f.name) + '-' + P.ow + 'x' + P.oh + '.' + o.format, blob: blob, srcSize: f.size });
        ctx.progress((i + 1) / files.length);
      }
      var note = files.length === 1 ? ctx.t('noteSize', { w: first.w, h: first.h }) : ctx.t('noteCount', { n: files.length });
      if (o.maxBytes !== null && o.format === 'jpg') note += ' ' + ctx.t('targetLimit', { kb: o.maxKb });
      return { outputs: outputs, note: note,
        warning: oversized ? { message: ctx.t('targetExceeded', { n: oversized, total: files.length }), downloadText: ctx.t('downloadTargetOver') } : null };
    }
  };
  tool.PRESETS = PRESETS;
  tool.parseOpts = parseOpts;
  tool.plan = plan;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
