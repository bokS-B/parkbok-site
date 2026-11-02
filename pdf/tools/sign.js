// PDF 서명 넣기: 그리거나 올린 서명 PNG 를 원하는 쪽의 원하는 자리에 그린다. 문서는 복사하지 않고 그 자리에서 수정해 저장한다.
(function(){
  var MM = 72 / 25.4;   // 1mm = 2.8346pt

  // 도구 json 의 errors.<key> 문구로 오류를 만든다. 문구가 없으면 엔진이 공통 오류 문구를 보여 준다.
  function err(ctx, key, vars){
    var e = new Error(key);
    var errs = ctx && ctx.t ? ctx.t('errors') : null;
    var msg = errs && typeof errs === 'object' ? errs[key] : null;
    if (msg) e.userMessage = String(msg).replace(/\{(\w+)\}/g, function(m, k){ return vars && k in vars ? vars[k] : m; });
    return e;
  }
  function baseName(n){ return String(n || 'document').replace(/\.[^.]+$/, ''); }

  // 서명을 넣을 쪽 번호(0기준) 목록
  function targetPages(opts, count, ctx){
    var mode = opts.page || 'last';
    if (mode === 'all') { var all = []; for (var i = 0; i < count; i++) all.push(i); return all; }
    if (mode === 'first') return [0];
    if (mode === 'number') {
      var n = Math.round(Number(opts.pageNumber));
      if (!isFinite(n) || n < 1 || n > count) throw err(ctx, 'badPage', { n: count });
      return [n - 1];
    }
    return [count - 1];
  }

  // 보이는 화면 기준(회전 반영) 위치 → 실제 페이지 좌표. 서명이 뷰어에서 똑바로 보이도록 이미지도 같은 각도로 돌린다.
  function placement(page, imgW, imgH, opts){
    var size = page.getSize(), W = size.width, H = size.height;
    var rot = ((page.getRotation().angle || 0) % 360 + 360) % 360;
    var vw = rot % 180 ? H : W, vh = rot % 180 ? W : H;   // 화면에 보이는 폭·높이
    var pct = Math.min(60, Math.max(10, Number(opts.size) || 30));
    var margin = Math.max(0, Number(opts.margin) || 0) * MM;
    var w = vw * pct / 100, h = w * imgH / imgW;
    var maxH = Math.max(1, vh - margin * 2);
    if (h > maxH) { h = maxH; w = h * imgW / imgH; }
    var pos = String(opts.position || 'br');
    var col = pos.charAt(1), row = pos.charAt(0);
    var xv = col === 'l' ? margin : col === 'c' ? (vw - w) / 2 : vw - margin - w;
    var yv = row === 'b' ? margin : row === 'm' ? (vh - h) / 2 : vh - margin - h;
    var x = xv, y = yv;
    if (rot === 90) { x = W - yv; y = xv; }
    else if (rot === 180) { x = W - xv; y = H - yv; }
    else if (rot === 270) { x = yv; y = H - xv; }
    return { x: x, y: y, width: w, height: h, rotate: rot };
  }

  var tool = {
    id: 'sign',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'signature', type: 'signature' },
      { id: 'page', type: 'select', default: 'last', choices: ['last', 'first', 'number', 'all'] },
      { id: 'pageNumber', type: 'number', default: 1, min: 1, max: 9999, step: 1, showIf: { page: 'number' } },
      { id: 'position', type: 'position', default: 'br' },
      { id: 'size', type: 'range', default: 30, min: 10, max: 60, step: 1, unit: '%' },
      { id: 'margin', type: 'number', default: 15, min: 0, max: 200, step: 1 }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var sig = opts.signature;
      if (!sig || !/^data:image\/png/.test(sig)) throw err(ctx, 'noSignature');
      if (ctx.progress) ctx.progress(0.05);
      var doc = await PDFLib.PDFDocument.load(files[0].bytes, { ignoreEncryption: false });
      var count = doc.getPageCount();
      if (!count) throw new Error(ctx.t ? ctx.t('errorBroken') : 'errorBroken');
      var targets = targetPages(opts, count, ctx);
      if (ctx.progress) ctx.progress(0.2);
      var img = await doc.embedPng(sig);
      if (ctx.progress) ctx.progress(0.3);
      var pages = doc.getPages();
      for (var i = 0; i < targets.length; i++) {
        var page = pages[targets[i]];
        var p = placement(page, img.width, img.height, opts);
        page.drawImage(img, { x: p.x, y: p.y, width: p.width, height: p.height, rotate: PDFLib.degrees(p.rotate) });
        if (ctx.progress) ctx.progress(0.3 + 0.5 * (i + 1) / targets.length);
      }
      var bytes = await doc.save();
      if (ctx.progress) ctx.progress(1);
      var suffix = (ctx.t && ctx.t('resultName') !== 'resultName') ? ctx.t('resultName') : 'signed';
      return { outputs: [ { name: baseName(files[0].name) + '-' + suffix + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
