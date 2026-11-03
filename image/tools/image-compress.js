// 이미지 압축: 긴 변을 단계별 최대 크기로 줄이고 JPG/WebP 품질을 낮춰 용량을 줄인다.
// PNG 는 투명이 없으면 JPG 로, 있으면 PNG 유지(축소만). 결과가 원본보다 크면 원본을 그대로 돌려준다.
(function(){
  var LEVELS = { low: { q: 0.85, max: 4000 }, medium: { q: 0.7, max: 2500 }, high: { q: 0.5, max: 1600 } };
  var SIDE_LIMIT = 16384, MIN_QUALITY = 0.3;
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  function extOf(n){ var m = /\.([a-z0-9]+)$/i.exec(n || ''); return m ? m[1].toLowerCase() : ''; }
  // 파일 종류: 'png' | 'jpg' | 'webp' | ''
  function kindOf(f){
    var t = (f.type || '').toLowerCase(), e = extOf(f.name);
    if (t === 'image/png' || e === 'png') return 'png';
    if (t === 'image/jpeg' || e === 'jpg' || e === 'jpeg') return 'jpg';
    if (t === 'image/webp' || e === 'webp') return 'webp';
    return '';
  }
  // Optional per-file target uses 1 KB = 1024 B; zero leaves the original encoder path unchanged.
  function parseOpts(opts){
    opts = opts || {};
    var lv = LEVELS[opts.level] ? opts.level : 'medium';
    var fm = /^(keep|jpg|webp)$/.test(opts.format || '') ? opts.format : 'keep';
    var rawKb = opts.maxKb, kb = rawKb == null || String(rawKb).trim() === '' ? 0 : Number(rawKb);
    var validTarget = isFinite(kb) && kb >= 0 && kb <= Number.MAX_SAFE_INTEGER / 1024;
    return { level: lv, quality: LEVELS[lv].q, max: LEVELS[lv].max, format: fm, maxKb: kb, maxBytes: validTarget && kb > 0 ? Math.floor(kb * 1024) : null, validTarget: validTarget };
  }
  // 투명 픽셀이 하나라도 있는지. 줄 단위로 읽어 첫 투명 픽셀에서 바로 멈춘다.
  function hasAlpha(c){
    var g = c.getContext('2d'), w = c.width, h = c.height, rows = Math.max(1, Math.floor(262144 / w));
    for (var y = 0; y < h; y += rows) {
      var d = g.getImageData(0, y, w, Math.min(rows, h - y)).data;
      for (var i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    }
    return false;
  }
  // 출력 형식 결정 → { mime, ext }
  function pickFormat(kind, alpha, format){
    if (format === 'jpg') return { mime: 'image/jpeg', ext: 'jpg' };
    if (format === 'webp') return { mime: 'image/webp', ext: 'webp' };
    if (kind === 'png' && alpha) return { mime: 'image/png', ext: 'png' };
    if (kind === 'webp') return { mime: 'image/webp', ext: 'webp' };
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  function pct(before, after){ return before > 0 ? Math.round((1 - after / before) * 100) : 0; }
  // Search quality only. The level's canvas dimensions and transparent PNG output stay unchanged.
  async function fitTarget(ctx, c, mime, initial, quality, budget){
    if (budget === null || initial.size <= budget || (mime !== 'image/jpeg' && mime !== 'image/webp')) return initial;
    var lo = Math.min(MIN_QUALITY, quality), hi = quality;
    var low = await ctx.toBlob(c, mime, lo);
    if (low.size > budget) return low.size < initial.size ? low : initial;
    var fit = low;
    for (var i = 0; i < 7 && hi - lo > 0.01; i++) {
      var q = (lo + hi) / 2, blob = await ctx.toBlob(c, mime, q);
      if (blob.size <= budget) { fit = blob; lo = q; } else hi = q;
    }
    return fit;
  }
  function sizeCheck(blob, budget){
    return { status: budget === null ? 'not_requested' : blob.size <= budget ? 'passed' : 'failed', actualBytes: blob.size, limitBytes: budget, unitBytes: 1024 };
  }
  var tool = {
    id: 'image-compress',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    invalidateOnEdit: true,
    renderers: {
      'target-kb': function(o, row, api){
        row.classList.add('opt-number');
        var id = 'opt-' + o.id, label = api.el('label', 'opt-label', api.optStr(o.id, 'label'));
        label.htmlFor = id; row.appendChild(label);
        var input = api.el('input'); input.type = 'number'; input.id = id; input.min = 0; input.step = 1; input.value = 0; input.inputMode = 'decimal'; input.style.width = '100px';
        var wrap = api.el('span', 'num-wrap'); wrap.appendChild(input); wrap.appendChild(api.el('span', 'num-unit', 'KB')); row.appendChild(wrap);
        // Unlike the generic number renderer, this type gets a persistent help row from the engine.
        api.set(o.id, function(){ return input.validity && input.validity.badInput ? NaN : Number(input.value); }, function(v){ input.value = v; });
      }
    },
    options: [
      { id: 'level', type: 'radio', choices: ['low', 'medium', 'high'], default: 'medium' },
      { id: 'format', type: 'select', choices: ['keep', 'jpg', 'webp'], default: 'keep' },
      { id: 'maxKb', type: 'target-kb', min: 0, step: 1, default: 0, unit: 'KB' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], kept = 0, before = 0, after = 0, oversized = 0;
      if (!o.validTarget) { var targetError = new Error('errorTarget'); targetError.key = 'errorTarget'; throw targetError; }
      for (var i = 0; i < files.length; i++) {
        var f = files[i], kind = kindOf(f);
        ctx.progress(i / files.length);
        var img = await ctx.loadImage(f);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0) || w > SIDE_LIMIT || h > SIDE_LIMIT) { ctx.release(img); var e = new Error('errorBroken'); e.key = w > SIDE_LIMIT || h > SIDE_LIMIT ? 'errorTooBig' : 'errorBroken'; throw e; }
        // 긴 변이 단계 최대값을 넘으면 절반씩 단계 축소(엔진 scaleTo), 아니면 원본 크기로 그린다
        var c = ctx.scaleTo(img, o.max, o.max);
        if (c === img) { c = ctx.canvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h); }
        ctx.release(img);
        var alpha = kind === 'png' && o.format === 'keep' ? hasAlpha(c) : false;
        var fm = pickFormat(kind, alpha, o.format);
        if (fm.mime === 'image/jpeg') {
          // JPG 는 투명이 없으므로 흰색 위에 다시 그린다(투명 PNG 를 강제로 JPG 로 바꾸는 경우)
          var j = ctx.canvas(c.width, c.height), g = j.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, j.width, j.height); g.drawImage(c, 0, 0);
          c.width = c.height = 1; c = j;
        }
        var blob = await ctx.toBlob(c, fm.mime, fm.mime === 'image/png' ? undefined : o.quality);
        // WebP 를 못 만드는 브라우저는 PNG 를 돌려주므로 JPG 로 대체한다
        if (fm.mime === 'image/webp' && blob.type !== 'image/webp') { fm = { mime: 'image/jpeg', ext: 'jpg' }; blob = await ctx.toBlob(c, fm.mime, o.quality); }
        blob = await fitTarget(ctx, c, fm.mime, blob, o.quality, o.maxBytes);
        c.width = c.height = 1;
        var name = baseName(f.name) + '.' + fm.ext;
        // 결과가 원본보다 크면(형식 유지이거나 같은 형식일 때) 원본 그대로
        if (blob.size >= f.size && (o.format === 'keep' || fm.ext === kind)) { blob = f.file; name = f.name; kept++; }
        var check = sizeCheck(blob, o.maxBytes); if (check.status === 'failed') oversized++;
        before += f.size; after += blob.size;
        outputs.push({ name: name, blob: blob, srcSize: f.size, validation: { size: check } });
        ctx.progress((i + 1) / files.length);
      }
      var note = ctx.t('noteSize', { before: ctx.human(before), after: ctx.human(after), p: Math.max(0, pct(before, after)) });
      if (kept) note += ' ' + ctx.t(kept === files.length ? 'noteKeptAll' : 'noteKept', { n: kept });
      if (o.maxBytes !== null) note += (note ? ' ' : '') + ctx.t('targetLimit', { kb: o.maxKb, limit: o.maxBytes });
      return { outputs: outputs, note: note,
        validation: { size: { status: o.maxBytes === null ? 'not_requested' : oversized ? 'failed' : 'passed', scope: 'per-file', limitBytes: o.maxBytes, unitBytes: 1024, oversizedCount: oversized, totalFiles: files.length } },
        warning: oversized ? { message: ctx.t('targetExceeded', { n: oversized, total: files.length }), downloadText: ctx.t('downloadTargetOver') } : null };
    }
  };
  tool.parseOpts = parseOpts;
  tool.pickFormat = pickFormat;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
