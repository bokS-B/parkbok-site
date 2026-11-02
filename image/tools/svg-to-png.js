// SVG → PNG: SVG 를 Image 로 불러와 캔버스에 그린 뒤 PNG 로 저장한다. 외부 파일을 참조하는 SVG 는 그려지지 않을 수 있다.
// 크기가 없는 SVG 는 viewBox 로 비율을 구하고, 가로(width)×배율(scale)에 맞춰 세로를 비율대로 정한다.
(function(){
  var MAX_SIDE = 16384, MAX_PIXELS = 64 * 1024 * 1024;
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  function toolStr(key){ var T = (typeof window !== 'undefined' && window.IMGT_TOOL && window.IMGT_TOOL.strings) || {}; return T.errors && T.errors[key]; }
  // 옵션 → { width(px), scale(1~3), transparent, background(#rrggbb) }
  function parseOpts(opts){
    opts = opts || {};
    var w = Math.round(parseFloat(opts.width)); if (!(w >= 1)) w = 1024; if (w > 8192) w = 8192;
    var s = parseInt(opts.scale, 10); if (!(s >= 1 && s <= 3)) s = 1;
    var bg = /^#[0-9a-f]{6}$/i.test(opts.background || '') ? opts.background : '#ffffff';
    return { width: w, scale: s, transparent: opts.transparent !== false, background: bg };
  }
  function num(v){ var n = parseFloat(v); return n > 0 && isFinite(n) ? n : 0; }
  // SVG 문자열에서 원본 크기(width/height, 없으면 viewBox)를 읽고, 브라우저가 늘 같은 크기로 그리도록 width/height 를 박아 넣는다.
  function measure(text){
    var doc, root;
    try { doc = new DOMParser().parseFromString(text, 'image/svg+xml'); root = doc.documentElement; } catch (e) { return null; }
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
    var aw = root.getAttribute('width') || '', ah = root.getAttribute('height') || '';
    var w = /%$/.test(aw) ? 0 : num(aw), h = /%$/.test(ah) ? 0 : num(ah);
    var vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
    var vw = vb.length === 4 && vb[2] > 0 ? vb[2] : 0, vh = vb.length === 4 && vb[3] > 0 ? vb[3] : 0;
    if (!w && !h) { w = vw || 300; h = vh || 150; }
    else if (!w) w = vh ? h * vw / vh : h;
    else if (!h) h = vw ? w * vh / vw : w;
    if (!vw && !vh) root.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    root.setAttribute('width', String(w)); root.setAttribute('height', String(h));
    var xml;
    try { xml = new XMLSerializer().serializeToString(root); } catch (e) { return null; }
    return { w: w, h: h, xml: xml };
  }
  function loadSvg(xml){
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
      img.onload = function(){ URL.revokeObjectURL(u); res(img); };
      img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('svg')); };
      img.src = u;
    });
  }
  // 도구 문구 errors.svg 가 있으면 그대로, 없으면 공통 errorBroken
  function svgError(){ var e = new Error('svg'); e.userMessage = toolStr('svg'); if (!e.userMessage) e.key = 'errorBroken'; return e; }
  var tool = {
    id: 'svg-to-png',
    accept: '.svg,image/svg+xml',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'width', type: 'number', min: 1, max: 8192, step: 1, default: 1024, unit: 'px' },
      { id: 'scale', type: 'select', choices: ['1', '2', '3'], default: '1' },
      { id: 'transparent', type: 'checkbox', default: true },
      { id: 'background', type: 'color', default: '#ffffff', showIf: { transparent: false } }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [];
      for (var i = 0; i < files.length; i++) {
        ctx.progress(i / files.length);
        var text;
        try { text = await files[i].file.text(); } catch (e) { throw svgError(); }
        var m = measure(text); if (!m) throw svgError();
        var ow = Math.max(1, Math.round(o.width * o.scale)), oh = Math.max(1, Math.round(ow * m.h / m.w));
        if (ow > MAX_SIDE || oh > MAX_SIDE || ow * oh > MAX_PIXELS) { var s = Math.min(MAX_SIDE / ow, MAX_SIDE / oh, Math.sqrt(MAX_PIXELS / (ow * oh))); ow = Math.max(1, Math.floor(ow * s)); oh = Math.max(1, Math.floor(oh * s)); }
        var img;
        try { img = await loadSvg(m.xml); } catch (e) { throw svgError(); }
        var c = ctx.canvas(ow, oh), g = c.getContext('2d');
        if (!o.transparent) { g.fillStyle = o.background; g.fillRect(0, 0, ow, oh); }
        try { g.drawImage(img, 0, 0, ow, oh); } catch (e) { c.width = c.height = 1; throw svgError(); }
        var blob;
        try { blob = await ctx.toBlob(c, 'image/png'); } catch (e) { c.width = c.height = 1; throw svgError(); }   // 외부 참조로 오염된 캔버스
        c.width = c.height = 1;
        outputs.push({ name: baseName(files[i].name) + '.png', blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  tool.parseOpts = parseOpts;
  tool.measure = measure;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
