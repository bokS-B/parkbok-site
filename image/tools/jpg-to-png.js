// JPG → PNG: 각 이미지를 캔버스에 그려 PNG 로 저장한다. 옵션 없이 바로 변환하며 WebP·BMP·GIF 도 같은 방식으로 받는다.
// 한 장씩 처리하고 바로 버려서 여러 장을 넣어도 메모리가 쌓이지 않는다.
(function(){
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  var tool = {
    id: 'jpg-to-png',
    accept: '.jpg,.jpeg,.webp,.bmp,.gif,image/jpeg,image/webp,image/bmp,image/gif',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [],
    run: async function(files, opts, ctx){
      var outputs = [];
      for (var i = 0; i < files.length; i++) {
        var img = await ctx.loadImage(files[i]);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0)) { ctx.release(img); var e = new Error('errorBroken'); e.key = 'errorBroken'; throw e; }
        var c = ctx.canvas(w, h), g = c.getContext('2d');
        g.drawImage(img, 0, 0, w, h);
        ctx.release(img);
        var blob = await ctx.toBlob(c, 'image/png');
        c.width = c.height = 1;
        outputs.push({ name: baseName(files[i].name) + '.png', blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
