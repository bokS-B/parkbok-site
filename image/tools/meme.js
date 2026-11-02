// 밈 만들기: 이미지 위·아래 가운데에 굵은 글자(검은 외곽선)를 얹는다. 글자 크기는 이미지 너비에 비례해 자동으로 맞추고, 긴 글은 자동 줄바꿈한다.
// 캔버스 fillText/strokeText 만 쓰므로 어느 언어든 그대로 들어간다. 한 장씩 그리고 바로 버린다.
(function(){
  var FONTS = {
    impact: 'Impact, "Arial Black", "Anton", "Noto Sans", sans-serif',
    sans: 'system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif',
    serif: 'Georgia, "Times New Roman", "Noto Serif", serif'
  };
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }
  // 오류: 도구 json strings.<lang>.errors.<key> → 없으면 공통 errorGeneric
  function fail(ctx, key){
    var errs = ctx && ctx.t ? ctx.t('errors') : null;
    var msg = errs && typeof errs === 'object' ? errs[key] : null;
    var e = new Error(key);
    if (msg) e.userMessage = msg; else e.key = 'errorGeneric';
    return e;
  }
  function clamp(v, lo, hi, d){ v = parseFloat(v); return isNaN(v) ? d : Math.min(hi, Math.max(lo, v)); }
  // 옵션 → 정리된 값
  function parseOpts(opts){
    opts = opts || {};
    return {
      top: String(opts.top == null ? '' : opts.top).trim(),
      bottom: String(opts.bottom == null ? '' : opts.bottom).trim(),
      size: clamp(opts.size, 20, 120, 56),
      color: /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color : '#ffffff',
      stroke: opts.stroke === undefined ? true : (opts.stroke === true || opts.stroke === 'true'),
      font: FONTS[opts.font] ? opts.font : 'impact',
      format: opts.format === 'png' ? 'png' : 'jpg'
    };
  }
  // 글자를 maxW 안에 들어가도록 줄로 나눈다. 띄어쓰기 단위로, 한 단어가 넘치면 글자 단위로 자른다.
  function wrap(g, text, maxW){
    var lines = [], words = text.split(/\s+/).filter(Boolean), cur = '';
    function pushWord(w){
      var tryLine = cur ? cur + ' ' + w : w;
      if (g.measureText(tryLine).width <= maxW) { cur = tryLine; return; }
      if (cur) { lines.push(cur); cur = ''; }
      if (g.measureText(w).width <= maxW) { cur = w; return; }
      var chars = Array.from(w), piece = '';
      for (var i = 0; i < chars.length; i++) {
        if (piece && g.measureText(piece + chars[i]).width > maxW) { lines.push(piece); piece = ''; }
        piece += chars[i];
      }
      cur = piece;
    }
    for (var k = 0; k < words.length; k++) pushWord(words[k]);
    if (cur) lines.push(cur);
    return lines;
  }
  // 한 블록(위 또는 아래) 그리기
  function drawBlock(g, text, W, H, o, px, atTop){
    if (!text) return;
    var lh = Math.round(px * 1.15), maxW = W * 0.9, lines = wrap(g, text, maxW), m = Math.round(px * 0.35);
    var y = atTop ? m : H - m - lines.length * lh;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineJoin = 'round'; g.lineWidth = Math.max(2, Math.round(px / 9)); g.strokeStyle = '#000000'; g.fillStyle = o.color;
    for (var i = 0; i < lines.length; i++) {
      var ly = y + i * lh;
      if (o.stroke) g.strokeText(lines[i], W / 2, ly, maxW);
      g.fillText(lines[i], W / 2, ly, maxW);
    }
  }
  var tool = {
    id: 'meme',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'top', type: 'text', default: '', maxlength: 120 },
      { id: 'bottom', type: 'text', default: '', maxlength: 120 },
      { id: 'size', type: 'range', min: 20, max: 120, step: 1, default: 56 },
      { id: 'color', type: 'color', default: '#ffffff' },
      { id: 'stroke', type: 'checkbox', default: true },
      { id: 'font', type: 'select', choices: ['impact', 'sans', 'serif'], default: 'impact' },
      { id: 'format', type: 'select', choices: ['jpg', 'png'], default: 'jpg' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [];
      if (!o.top && !o.bottom) throw fail(ctx, 'text');
      for (var i = 0; i < files.length; i++) {
        ctx.progress(i / files.length);
        var img = await ctx.loadImage(files[i]);
        var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
        var c = ctx.canvas(W, H), g = c.getContext('2d');
        if (o.format === 'jpg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }   // JPG 는 투명이 없음
        g.drawImage(img, 0, 0, W, H);
        ctx.release(img);
        // 글자 크기: 너비 800px 기준 size px, 이미지가 크면 비례해 키운다
        var px = Math.max(10, Math.round(o.size * Math.max(W, 320) / 800));
        g.font = 'bold ' + px + 'px ' + FONTS[o.font];
        drawBlock(g, o.top, W, H, o, px, true);
        drawBlock(g, o.bottom, W, H, o, px, false);
        var blob = await ctx.toBlob(c, o.format === 'png' ? 'image/png' : 'image/jpeg', 0.92);
        c.width = c.height = 1;
        outputs.push({ name: baseName(files[i].name) + '-meme.' + o.format, blob: blob, srcSize: files[i].size });
        ctx.progress((i + 1) / files.length);
      }
      return { outputs: outputs, note: '' };
    }
  };
  tool.parseOpts = parseOpts;
  tool.wrap = wrap;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
