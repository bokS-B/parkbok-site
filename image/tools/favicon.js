// 파비콘 만들기: 이미지 1장 → favicon.ico(16·32·48 PNG 묶음) + PNG 아이콘 4장. ICO 컨테이너는 직접 조립한다.
// 512 마스터를 한 번 그리고 작은 크기는 거기서 단계 축소해 화질을 지킨다. SVG 는 벡터 그대로 확대해 흐려지지 않게 한다.
(function(){
  var MASTER = 512;
  var ICO_SIZES = [16, 32, 48];
  var PNGS = [{ name: 'favicon-32.png', size: 32 }, { name: 'apple-touch-icon-180.png', size: 180 }, { name: 'icon-192.png', size: 192 }, { name: 'icon-512.png', size: 512 }];
  var LINKS = '<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png">\n<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">\n<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">';

  // 옵션 → { padding(0~0.2), background('' 이면 투명), round(bool) }
  function parseOpts(opts){
    opts = opts || {};
    var p = parseFloat(opts.padding); if (!(p >= 0 && p <= 20)) p = 0;
    var transparent = opts.transparent !== false;
    var bg = /^#[0-9a-f]{6}$/i.test(opts.background || '') ? opts.background : '#ffffff';
    return { padding: p / 100, background: transparent ? '' : bg, round: !!opts.roundCorners };
  }
  function isSvg(f){ return /\.svg$/i.test(f.name || '') || (f.type || '').toLowerCase() === 'image/svg+xml'; }
  // SVG 는 <img> 로 읽어 drawImage 때 벡터로 확대되게 한다. 실패하면 엔진 loadImage 로 되돌아간다.
  function loadSvg(file, ctx){
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function(){ URL.revokeObjectURL(u); res(img); };
      img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('svg')); };
      img.src = u;
    }).catch(function(){ return ctx.loadImage(file); });
  }
  function roundRect(g, s, r){
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(s - r, 0); g.arcTo(s, 0, s, r, r); g.lineTo(s, s - r); g.arcTo(s, s, s - r, s, r);
    g.lineTo(r, s); g.arcTo(0, s, 0, s - r, r); g.lineTo(0, r); g.arcTo(0, 0, r, 0, r); g.closePath();
  }
  // 512 정사각 마스터: 배경 → 여백 안에 이미지를 비율 유지로 가운데 맞춤 → 둥근 모서리 마스크
  function master(img, vector, o, ctx){
    var s = MASTER, c = ctx.canvas(s, s), g = c.getContext('2d');
    if (o.round) { roundRect(g, s, Math.round(s * 0.22)); g.clip(); }
    if (o.background) { g.fillStyle = o.background; g.fillRect(0, 0, s, s); }
    var inner = Math.max(1, Math.round(s * (1 - 2 * o.padding)));
    var src = vector ? img : ctx.scaleTo(img, inner, inner);
    var w = src.naturalWidth || src.width || 1, h = src.naturalHeight || src.height || 1;
    var k = Math.min(inner / w, inner / h), dw = w * k, dh = h * k;
    g.drawImage(src, 0, 0, w, h, (s - dw) / 2, (s - dh) / 2, dw, dh);
    if (src !== img) src.width = src.height = 1;
    return c;
  }
  function sized(m, size, ctx){
    if (size === MASTER) return m;
    var c = ctx.scaleTo(m, size, size);
    if (c === m) { c = ctx.canvas(size, size); c.getContext('2d').drawImage(m, 0, 0, size, size); }
    return c;
  }
  // ICONDIR(6) + ICONDIRENTRY(16×n) + PNG 바이트들 (리틀 엔디언)
  function buildIco(pngs){
    var n = pngs.length, head = 6 + 16 * n, total = head;
    pngs.forEach(function(p){ total += p.bytes.length; });
    var buf = new Uint8Array(total), dv = new DataView(buf.buffer), off = head;
    dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, n, true);
    pngs.forEach(function(p, i){
      var e = 6 + 16 * i;
      buf[e] = p.size >= 256 ? 0 : p.size; buf[e + 1] = p.size >= 256 ? 0 : p.size; buf[e + 2] = 0; buf[e + 3] = 0;
      dv.setUint16(e + 4, 1, true); dv.setUint16(e + 6, 32, true);
      dv.setUint32(e + 8, p.bytes.length, true); dv.setUint32(e + 12, off, true);
      buf.set(p.bytes, off); off += p.bytes.length;
    });
    return new Blob([buf], { type: 'image/x-icon' });
  }
  var tool = {
    id: 'favicon',
    accept: '.png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'padding', type: 'range', min: 0, max: 20, step: 1, default: 0, unit: '%' },
      { id: 'transparent', type: 'checkbox', default: true },
      { id: 'background', type: 'color', default: '#ffffff', showIf: { transparent: false } },
      { id: 'roundCorners', type: 'checkbox', default: false }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), f = files[0], vector = isSvg(f);
      var img = vector ? await loadSvg(f.file || f, ctx) : await ctx.loadImage(f);
      var m = master(img, vector, o, ctx);
      ctx.release(img);
      var total = ICO_SIZES.length + PNGS.length, done = 0, outputs = [], icoParts = [];
      for (var i = 0; i < ICO_SIZES.length; i++) {
        var c = sized(m, ICO_SIZES[i], ctx), b = await ctx.toBlob(c, 'image/png');
        icoParts.push({ size: ICO_SIZES[i], bytes: new Uint8Array(await b.arrayBuffer()) });
        if (c !== m) c.width = c.height = 1;
        ctx.progress(++done / total);
      }
      outputs.push({ name: 'favicon.ico', blob: buildIco(icoParts) });
      for (var j = 0; j < PNGS.length; j++) {
        var c2 = sized(m, PNGS[j].size, ctx);
        outputs.push({ name: PNGS[j].name, blob: await ctx.toBlob(c2, 'image/png') });
        if (c2 !== m) c2.width = c2.height = 1;
        ctx.progress(++done / total);
      }
      m.width = m.height = 1;
      return { outputs: outputs, note: ctx.t('linkNote') + ' ' + LINKS };
    }
  };
  tool.parseOpts = parseOpts;
  tool.buildIco = buildIco;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
