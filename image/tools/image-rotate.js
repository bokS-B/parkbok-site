// 이미지 회전·반전: 90/180/270 또는 임의 각도(시계 방향, 빈 모서리는 배경색)로 돌린 뒤 좌우·상하 반전을 적용한다. 여러 장 일괄.
// 한 장씩 처리하고 바로 버려서 여러 장을 넣어도 메모리가 쌓이지 않는다.
(function(){
  var ANGLES = ['90', '180', '270', 'custom'], FLIPS = ['none', 'h', 'v'];
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
  // 옵션 → { angle(도, 양수=시계 방향), flip, background }
  function parseOpts(opts){
    opts = opts || {};
    var a;
    if (opts.angle === 'custom') { a = parseFloat(opts.custom); if (!isFinite(a)) a = 0; a = Math.max(-180, Math.min(180, a)); }
    else { a = parseInt(opts.angle, 10); if (a !== 90 && a !== 180 && a !== 270) a = 90; }
    var bg = /^#[0-9a-f]{6}$/i.test(opts.background || '') ? opts.background : '#ffffff';
    return { angle: a, flip: FLIPS.indexOf(opts.flip) >= 0 ? opts.flip : 'none', background: bg };
  }
  // 회전한 이미지 전체가 들어가는 캔버스 크기
  function bounds(w, h, deg){
    var r = deg * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    return { w: Math.max(1, Math.round(w * c + h * s)), h: Math.max(1, Math.round(w * s + h * c)) };
  }
  var tool = {
    id: 'image-rotate',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'angle', type: 'select', choices: ANGLES, default: '90' },
      { id: 'custom', type: 'number', min: -180, max: 180, step: 1, default: 0, unit: '°', showIf: { angle: 'custom' } },
      { id: 'background', type: 'color', default: '#ffffff', showIf: { angle: 'custom' } },
      { id: 'flip', type: 'select', choices: FLIPS, default: 'none' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], rad = o.angle * Math.PI / 180;
      for (var i = 0; i < files.length; i++) {
        var img = await ctx.loadImage(files[i]);
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var b = bounds(w, h, o.angle), fm = keepFormat(files[i]), spec = OUT[fm] || OUT.png;
        var c = ctx.canvas(b.w, b.h), g = c.getContext('2d');
        if (o.angle % 90 !== 0) { g.fillStyle = o.background; g.fillRect(0, 0, b.w, b.h); }   // 임의 각도에서만 빈 모서리가 생긴다
        g.translate(b.w / 2, b.h / 2);
        g.scale(o.flip === 'h' ? -1 : 1, o.flip === 'v' ? -1 : 1);   // 회전 뒤에 반전
        g.rotate(rad);
        g.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.release(img);
        var blob = await ctx.toBlob(c, spec.mime, spec.q);
        c.width = c.height = 1;
        var ext = blob.type === spec.mime ? spec.ext : 'png';   // 브라우저가 webp 저장을 못 하면 png 로 떨어진다
        outputs.push({ name: baseName(files[i].name) + '-rotate.' + ext, blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  tool.parseOpts = parseOpts;
  tool.bounds = bounds;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
