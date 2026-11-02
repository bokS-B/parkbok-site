// 이미지 자르기: 첫 이미지 위에서 정한 사각형(원본 픽셀 {x,y,w,h})을 잘라 저장한다. 여러 장이면 같은 비율 위치를 각 이미지에 적용한다.
// 한 장씩 처리하고 바로 버려서 여러 장을 넣어도 메모리가 쌓이지 않는다.
(function(){
  var RATIOS = ['free', '1:1', '4:3', '16:9', '3:4', '9:16'];
  var FORMATS = ['keep', 'jpg', 'png'];
  var OUT = { jpg: { mime: 'image/jpeg', ext: 'jpg', q: 0.92 }, png: { mime: 'image/png', ext: 'png' }, webp: { mime: 'image/webp', ext: 'webp', q: 0.92 } };
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  function extOf(n){ var m = /\.([a-z0-9]+)$/i.exec(n || ''); return m ? m[1].toLowerCase() : ''; }
  // 원본 형식 유지: png/webp 는 그대로, jpg/heic 는 jpg, 캔버스가 못 쓰는 gif/bmp 등은 png
  function keepFormat(f){
    var e = extOf(f.name), ty = (f.type || '').toLowerCase();
    if (e === 'png' || ty === 'image/png') return 'png';
    if (e === 'webp' || ty === 'image/webp') return 'webp';
    if (e === 'jpg' || e === 'jpeg' || e === 'heic' || e === 'heif' || ty === 'image/jpeg' || ty === 'image/heic' || ty === 'image/heif') return 'jpg';
    return 'png';
  }
  // 옵션 → { rect({x,y,w,h} 또는 null=전체), format }
  function parseOpts(opts){
    opts = opts || {};
    var r = opts.crop, rect = null;
    if (r && r.w > 0 && r.h > 0) rect = { x: Math.max(0, r.x || 0), y: Math.max(0, r.y || 0), w: r.w, h: r.h };
    return { rect: rect, format: FORMATS.indexOf(opts.format) >= 0 ? opts.format : 'keep' };
  }
  // 첫 이미지 기준 사각형을 다른 크기의 이미지에 같은 비율 위치로 옮기고 안쪽으로 맞춘다
  function mapRect(rect, baseW, baseH, w, h){
    var sx = baseW > 0 ? w / baseW : 1, sy = baseH > 0 ? h / baseH : 1;
    var cw = Math.max(1, Math.min(Math.round(rect.w * sx), w)), ch = Math.max(1, Math.min(Math.round(rect.h * sy), h));
    var x = Math.max(0, Math.min(Math.round(rect.x * sx), w - cw)), y = Math.max(0, Math.min(Math.round(rect.y * sy), h - ch));
    return { x: x, y: y, w: cw, h: ch };
  }
  var tool = {
    id: 'image-crop',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'ratio', type: 'select', choices: RATIOS, default: 'free' },
      { id: 'crop', type: 'crop', ratioFrom: 'ratio' },
      { id: 'format', type: 'select', choices: FORMATS, default: 'keep' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], baseW = files[0].width, baseH = files[0].height;
      for (var i = 0; i < files.length; i++) {
        var img = await ctx.loadImage(files[i]);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var r = o.rect ? mapRect(o.rect, baseW, baseH, w, h) : { x: 0, y: 0, w: w, h: h };
        var fm = o.format === 'keep' ? keepFormat(files[i]) : o.format, spec = OUT[fm] || OUT.png;
        var c = ctx.canvas(r.w, r.h), g = c.getContext('2d');
        if (fm === 'jpg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, r.w, r.h); }   // JPG 는 투명이 없어 흰색으로
        g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        ctx.release(img);
        var blob = await ctx.toBlob(c, spec.mime, spec.q);
        c.width = c.height = 1;
        var ext = blob.type === spec.mime ? spec.ext : 'png';   // 브라우저가 webp 저장을 못 하면 png 로 떨어진다
        outputs.push({ name: baseName(files[i].name) + '-crop.' + ext, blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  tool.parseOpts = parseOpts;
  tool.mapRect = mapRect;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
