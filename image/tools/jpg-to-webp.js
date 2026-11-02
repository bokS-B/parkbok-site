// JPG·PNG → WebP: 각 이미지를 캔버스에 그려 WebP 로 저장한다. 투명(PNG)은 그대로 유지된다.
// 브라우저가 WebP 인코딩을 못 하면(구형 Safari 등) 결과가 PNG 로 나오므로 그때는 errors.noWebp 로 알린다.
(function(){
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  // 옵션 → { quality(0~1) }
  function parseOpts(opts){
    opts = opts || {};
    var q = parseFloat(opts.quality); if (!(q >= 50 && q <= 100)) q = 85;
    return { quality: q / 100 };
  }
  // 도구 전용 오류 문구(json strings.errors) → userMessage. 없으면 공통 errorGeneric.
  function toolError(key, ctx){
    var TS = (typeof window !== 'undefined' && window.IMGT_TOOL && window.IMGT_TOOL.strings) || {};
    var e = new Error(key); e.key = null;
    e.userMessage = (TS.errors && TS.errors[key]) || ctx.t('errorGeneric');
    return e;
  }
  var tool = {
    id: 'jpg-to-webp',
    accept: '.jpg,.jpeg,.png,image/jpeg,image/png',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'quality', type: 'range', min: 50, max: 100, step: 1, default: 85, unit: '%' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [];
      for (var i = 0; i < files.length; i++) {
        var img = await ctx.loadImage(files[i]);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0)) { ctx.release(img); var e = new Error('errorBroken'); e.key = 'errorBroken'; throw e; }
        var c = ctx.canvas(w, h), g = c.getContext('2d');
        g.drawImage(img, 0, 0, w, h);
        ctx.release(img);
        var blob = await ctx.toBlob(c, 'image/webp', o.quality);
        c.width = c.height = 1;
        // 인코더가 없으면 캔버스가 PNG 를 돌려준다 → 지원 안 함
        if (!blob || blob.type !== 'image/webp') throw toolError('noWebp', ctx);
        outputs.push({ name: baseName(files[i].name) + '.webp', blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  tool.parseOpts = parseOpts;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
