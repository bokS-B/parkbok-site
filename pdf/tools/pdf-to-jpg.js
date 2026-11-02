// PDF → JPG/PNG: 선택한 쪽을 pdf.js 로 캔버스에 그려 이미지로 저장한다. 쪽 단위로 그리고 바로 버려서 300쪽에서도 메모리가 쌓이지 않는다.
// 순수 로직(옵션 해석·파일명)은 Node 에서 테스트하고, 캔버스·pdf.js 부분은 브라우저에서만 돈다.
(function(){
  var MAX_PIXELS = 16000000;   // 캔버스 한 장 상한(iOS Safari 한계 근처). 넘으면 배율을 줄인다
  var FORMATS = { jpg: { mime: 'image/jpeg', ext: 'jpg', q: 0.92 }, png: { mime: 'image/png', ext: 'png', q: undefined } };

  function baseName(n){ return String(n || 'page').replace(/\.[^.]+$/, ''); }
  function pad(n, width){ var s = String(n); while (s.length < width) s = '0' + s; return s; }

  // 도구 json 의 errors.<key> 문구를 찾는다. 없으면 공통 errorGeneric
  function errMsg(ctx, key){
    var e = ctx && ctx.t ? ctx.t('errors') : null;
    var m = e && typeof e === 'object' && e[key] ? e[key] : (ctx && ctx.t ? ctx.t('errorGeneric') : key);
    var err = new Error(key); err.userMessage = m; return err;
  }

  // 옵션 → { format, mime, ext, quality, scale, indices }
  function parseOpts(opts, pageCount){
    opts = opts || {};
    var fmt = FORMATS[opts.format] ? opts.format : 'jpg';
    var scale = parseInt(opts.quality, 10); if (!(scale >= 1 && scale <= 3)) scale = 2;
    var indices;
    if (opts.pageMode === 'select') {
      indices = (Array.isArray(opts.pages) ? opts.pages : []).map(function(i){ return parseInt(i, 10); })
        .filter(function(i, k, a){ return i >= 0 && i < pageCount && a.indexOf(i) === k; }).sort(function(a, b){ return a - b; });
    } else {
      indices = []; for (var i = 0; i < pageCount; i++) indices.push(i);
    }
    return { format: fmt, mime: FORMATS[fmt].mime, ext: FORMATS[fmt].ext, quality: FORMATS[fmt].q, scale: scale, indices: indices };
  }

  // 결과 파일명: <원본이름>-<resultName>-<쪽번호>.<ext> (쪽번호는 전체 쪽수 자릿수로 0 채움)
  function outName(srcName, resultName, pageNo, ext, pageCount){
    return baseName(srcName) + '-' + (resultName || 'page') + '-' + pad(pageNo, String(pageCount || 1).length) + '.' + ext;
  }

  // 페이지 크기(pt) 기준으로 캔버스 픽셀 상한을 넘지 않는 배율
  function safeScale(scale, w, h){
    if (!(w > 0 && h > 0)) return scale;
    var px = w * h * scale * scale;
    return px > MAX_PIXELS ? Math.max(0.5, Math.sqrt(MAX_PIXELS / (w * h))) : scale;
  }

  function canvasToBlob(c, mime, q){
    return new Promise(function(res, rej){
      if (typeof c.toBlob === 'function') {
        c.toBlob(function(b){ b ? res(b) : rej(new Error('toBlob')); }, mime, q);
      } else {
        try {
          var d = c.toDataURL(mime, q).split(','), bin = atob(d[1]), u = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          res(new Blob([u], { type: mime }));
        } catch (e) { rej(e); }
      }
    });
  }

  // 투명 배경을 흰색으로 채운다(JPG 는 투명이 검게 변하므로 필수)
  function whiten(c){
    var g = c.getContext('2d'); if (!g) return;
    var prev = g.globalCompositeOperation;
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = prev;
  }

  var tool = {
    id: 'pdf-to-jpg',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: true,
    options: [
      { id: 'format', type: 'radio', default: 'jpg', choices: ['jpg', 'png'] },
      { id: 'quality', type: 'select', default: '2', choices: ['1', '2', '3'] },
      { id: 'pageMode', type: 'radio', default: 'all', choices: ['all', 'select'] },
      { id: 'pages', type: 'pages', mode: 'select', showIf: { pageMode: 'select' } }
    ],
    parseOpts: parseOpts,
    outName: outName,
    safeScale: safeScale,
    run: async function(files, opts, ctx){
      var file = files[0];
      if (!file) throw new Error(ctx.t('errorEmpty', { n: 1 }));
      // 쪽 수: 엔진 썸네일 목록이 기준. 없으면 pdf-lib 로 센다
      var pageCount = ctx.pages && ctx.pages.length ? ctx.pages.length : 0;
      if (!pageCount && ctx.pdfLib) {
        var doc = await ctx.pdfLib.PDFDocument.load(file.bytes, { updateMetadata: false });
        pageCount = doc.getPageCount();
      }
      if (!pageCount) throw new Error(ctx.t('errorBroken'));
      var o = parseOpts(opts, pageCount);
      if (!o.indices.length) throw errMsg(ctx, 'noPages');
      if (typeof ctx.renderPage !== 'function') throw errMsg(ctx, 'noRender');

      var resultName = ctx.t('resultName'); if (resultName === 'resultName') resultName = 'page';
      var outputs = [];
      for (var k = 0; k < o.indices.length; k++) {
        var idx = o.indices[k];
        var p = ctx.pages && ctx.pages[idx];
        var sc = safeScale(o.scale, p && p.width, p && p.height);
        if (ctx.progress) ctx.progress(k / o.indices.length, ctx.t('pageN', { n: idx + 1 }));
        var c = await ctx.renderPage(p ? p.file : 0, p ? p.index : idx, sc);
        whiten(c);
        var blob = await canvasToBlob(c, o.mime, o.quality);
        c.width = 1; c.height = 1;   // 캔버스 메모리 즉시 반환
        outputs.push({ name: outName(file.name, resultName, idx + 1, o.ext, pageCount), blob: blob });
      }
      if (ctx.progress) ctx.progress(1);
      return { outputs: outputs, note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
