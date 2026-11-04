// Resize an existing signature image locally. Keep strokes proportional and
// validate the actual JPEG bytes; never stretch or silently shrink fixed pixels.
(function(){
  var target = typeof module !== 'undefined' && module.exports ? require('../target-size.js') : window.PBImageTarget;
  function fail(key){ var e = new Error(key); e.key = key; return e; }
  function parseOpts(opts){
    opts = opts || {}; var s = opts.size || {};
    var w = Number(s.w), h = Number(s.h), max = Number(opts.maxKb), min = Number(opts.minKb == null ? 0 : opts.minKb);
    return { w: w, h: h, maxBytes: Math.floor(max * 1000), minBytes: Math.ceil(min * 1000), rect: opts.crop,
      valid: Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= 3000 && h <= 3000 &&
        Number.isFinite(max) && max > 0 && max <= 51200 && Number.isFinite(min) && min >= 0 && min <= max };
  }
  function plan(iw, ih, opts){
    var r = opts.rect, x = 0, y = 0, w = iw, h = ih;
    if (r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h) && r.w > 0 && r.h > 0) {
      x = Math.max(0, Math.min(iw - 1, r.x)); y = Math.max(0, Math.min(ih - 1, r.y));
      w = Math.min(r.w, iw - x); h = Math.min(r.h, ih - y);
    }
    var scale = Math.min(opts.w / w, opts.h / h);
    return { x: x, y: y, w: w, h: h, dw: w * scale, dh: h * scale, dx: (opts.w - w * scale) / 2, dy: (opts.h - h * scale) / 2 };
  }
  function sizeCheck(bytes, o){
    return { status: bytes > o.maxBytes ? 'over' : bytes < o.minBytes ? 'under' : 'passed', actualBytes: bytes, minBytes: o.minBytes, limitBytes: o.maxBytes, unitBytes: 1000 };
  }
  function input(api, id, value, min, max){
    var n = api.el('input'); n.type = 'number'; n.id = id; n.value = value; n.min = min; n.max = max; n.step = 1; n.inputMode = 'numeric';
    return n;
  }
  function read(n){ return !n.value || !n.validity.valid ? NaN : Number(n.value); }
  function presets(api, values, value, set, label){
    var box = api.el('div', 'target-presets'); box.setAttribute('role', 'group');
    box.setAttribute('aria-label', api.optStr(label || 'size', 'label'));
    values.forEach(function(v){ var b = api.el('button', 'chip target-preset', v.label); b.type = 'button';
      b.addEventListener('click', function(){ if (api.busy()) return; set(v); api.changed(); });
      b._value = v; box.appendChild(b);
    });
    function sync(){ Array.prototype.forEach.call(box.children, function(b){ b.setAttribute('aria-pressed', String(value(b._value))); }); }
    api.onChange(sync); sync(); return box;
  }
  var tool = {
    id: 'signature-resize', accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp', multiple: false,
    minFiles: 1, needsPages: false, invalidateOnEdit: true, layout: 'split',
    options: [
      { id: 'size', type: 'signature-size' },
      { id: 'maxKb', type: 'signature-kb' },
      { id: 'crop', type: 'crop' },
      { id: 'minKb', type: 'signature-min', group: 'advanced' }
    ],
    renderers: {
      'signature-size': function(o, row, api){
        var wrap = api.el('div', 'signature-dimensions');
        var w = input(api, 'opt-width', 300, 1, 3000), h = input(api, 'opt-height', 100, 1, 3000);
        [w, h].forEach(function(n, i){ var l = api.el('label', null, api.optStr(o.id, null, i ? 'height' : 'width') + ' (px)'); l.htmlFor = n.id; l.appendChild(n); wrap.appendChild(l); });
        row.appendChild(wrap);
        row.appendChild(presets(api, [{w:140,h:60,label:'140 × 60'},{w:300,h:100,label:'300 × 100'},{w:600,h:200,label:'600 × 200'}], function(v){return Number(w.value)===v.w&&Number(h.value)===v.h;}, function(v){w.value=v.w;h.value=v.h;}));
        api.set(o.id, function(){ return { w: read(w), h: read(h) }; });
      },
      'signature-kb': function(o, row, api){
        var n = input(api, 'opt-maxKb', 20, 1, 51200), l = api.el('label', 'opt-label', api.optStr(o.id, 'label')); l.htmlFor = n.id;
        row.appendChild(l); row.appendChild(n); row.appendChild(api.el('span', 'num-unit', 'KB'));
        row.appendChild(presets(api, [20,50,100].map(function(k){return {kb:k,label:k+' KB'};}), function(v){return Number(n.value)===v.kb;}, function(v){n.value=v.kb;}, 'maxKb'));
        api.set(o.id, function(){return read(n);});
      },
      'signature-min': function(o, row, api){
        var n = input(api, 'opt-minKb', 0, 0, 51200), l = api.el('label', 'opt-label', api.optStr(o.id, 'label')); l.htmlFor = n.id;
        row.appendChild(l); row.appendChild(n); row.appendChild(api.el('span', 'num-unit', 'KB')); api.set(o.id, function(){return read(n);});
      }
    },
    run: async function(files, opts, ctx){
      var o = parseOpts(opts); if (!o.valid) throw fail('errorSettings');
      var f = files[0], img = await ctx.loadImage(f), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!(iw > 0 && ih > 0) || iw > 16384 || ih > 16384 || iw * ih > 64000000) { ctx.release(img); throw fail('errorTooBig'); }
      var p = plan(iw, ih, o), c = ctx.canvas(o.w, o.h), g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, o.w, o.h); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, p.x, p.y, p.w, p.h, p.dx, p.dy, p.dw, p.dh); ctx.release(img);
      var blob;
      try { blob = await ctx.toBlob(c, 'image/jpeg', 0.95); blob = await target.fitQuality(ctx, c, 'image/jpeg', blob, 0.95, o.maxBytes); }
      finally { c.width = c.height = 1; }
      if (blob.type !== 'image/jpeg') throw fail('errorFormat');
      var check = sizeCheck(blob.size, o), warning = check.status !== 'passed';
      ctx.progress(1);
      return { outputs: [{ name: String(f.name || 'signature').replace(/\.[^.]+$/, '') + '-signature-' + o.w + 'x' + o.h + '.jpg', blob: blob, srcSize: f.size, dimensions: {width:o.w,height:o.h}, validation: { size: check } }],
        note: ctx.t('noteSize', {w:o.w,h:o.h,bytes:blob.size,max:o.maxBytes}) + (o.minBytes ? ' ' + ctx.t('noteMinimum',{min:o.minBytes}) : ''),
        validation: { size: check },
        warning: warning ? {message:ctx.t(check.status === 'over' ? 'targetOver' : 'targetUnder'),downloadText:ctx.t('downloadAnyway')} : null };
    }
  };
  tool.parseOpts = parseOpts; tool.plan = plan; tool.sizeCheck = sizeCheck;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
