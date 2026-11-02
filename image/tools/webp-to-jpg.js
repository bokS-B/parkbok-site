// WebP → JPG: 각 이미지를 캔버스에 그려 JPG 로 저장한다. 투명 영역은 선택한 배경색으로 채운다(JPG 는 투명이 없음).
// 한 장씩 처리하고 바로 버려서 여러 장을 넣어도 메모리가 쌓이지 않는다.
(function(){
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  // 옵션 → { quality(0~1), background(#rrggbb) }
  function parseOpts(opts){
    opts = opts || {};
    var q = parseFloat(opts.quality); if (!(q >= 50 && q <= 100)) q = 90;
    var bg = /^#[0-9a-f]{6}$/i.test(opts.background || '') ? opts.background : '#ffffff';
    return { quality: q / 100, background: bg };
  }
  var tool = {
    id: 'webp-to-jpg',
    accept: '.webp,image/webp',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'quality', type: 'range', min: 50, max: 100, step: 1, default: 90, unit: '%' },
      { id: 'background', type: 'color', default: '#ffffff' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [];
      for (var i = 0; i < files.length; i++) {
        var img = await ctx.loadImage(files[i]);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0)) { ctx.release(img); var e = new Error('errorBroken'); e.key = 'errorBroken'; throw e; }
        var c = ctx.canvas(w, h), g = c.getContext('2d');
        g.fillStyle = o.background; g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        ctx.release(img);
        var blob = await ctx.toBlob(c, 'image/jpeg', o.quality);
        c.width = c.height = 1;
        outputs.push({ name: baseName(files[i].name) + '.jpg', blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  tool.parseOpts = parseOpts;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
