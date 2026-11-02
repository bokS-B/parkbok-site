// HEIC → JPG: 아이폰 HEIC/HEIF 사진을 JPG 로 저장한다. 디코드는 엔진 ctx.loadImage 가 libheif 로 처리한다.
// 한 장씩 그리고 바로 버려서 여러 장을 넣어도 메모리가 쌓이지 않는다. 긴 변 제한을 두면 엔진 scaleTo 로 단계 축소한다.
(function(){
  var EDGES = ['0', '4096', '2048', '1280'];
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  // 옵션 → { quality(0~1), maxEdge(0=원본), background(#rrggbb) }
  function parseOpts(opts){
    opts = opts || {};
    var q = parseFloat(opts.quality); if (!(q >= 50 && q <= 100)) q = 90;
    var edge = parseInt(opts.maxEdge, 10); if (!(edge > 0) || EDGES.indexOf(String(edge)) < 0) edge = 0;
    var bg = /^#[0-9a-f]{6}$/i.test(opts.background || '') ? opts.background : '#ffffff';
    return { quality: q / 100, maxEdge: edge, background: bg };
  }
  var tool = {
    id: 'heic-to-jpg',
    accept: '.heic,.heif,image/heic,image/heif',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'quality', type: 'range', min: 50, max: 100, step: 1, default: 90, unit: '%' },
      { id: 'maxEdge', type: 'select', choices: EDGES, default: '0' },
      { id: 'background', type: 'color', default: '#ffffff' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [];
      for (var i = 0; i < files.length; i++) {
        ctx.progress(i / files.length);
        var img;
        try { img = await ctx.loadImage(files[i]); }
        catch (e) { if (!(e && e.key)) { e = new Error('heic'); e.key = 'errorHeic'; } throw e; }
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0)) { ctx.release(img); var be = new Error('broken'); be.key = 'errorBroken'; throw be; }
        var src = img, sw = w, sh = h;
        if (o.maxEdge && Math.max(w, h) > o.maxEdge) { src = ctx.scaleTo(img, o.maxEdge, o.maxEdge); sw = src.width; sh = src.height; }
        var c = ctx.canvas(sw, sh), g = c.getContext('2d');
        g.fillStyle = o.background; g.fillRect(0, 0, sw, sh);   // HEIC 에 알파가 있어도 JPG 는 투명이 없으므로 채운다
        g.drawImage(src, 0, 0, sw, sh);
        ctx.release(img); if (src !== img) src.width = src.height = 1;
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
