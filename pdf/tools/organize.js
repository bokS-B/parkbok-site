// PDF 페이지 정리: 파일 순서대로 이어 붙인 쪽을 썸네일에서 옮기고·회전하고·지운 그대로 PDF 1개로 만든다.
// 썸네일 그리기는 엔진(pdf.js) 몫이고, 이 모듈은 pdf-lib 만 쓴다(Node 에서도 돈다).
(function(){
  function fail(ctx, key, fallback){
    var errs = ctx && ctx.t ? ctx.t('errors') : null;
    var msg = errs && typeof errs === 'object' ? errs[key] : null;
    var e = new Error(key);
    if (msg) e.userMessage = msg; else e.key = fallback || 'errorGeneric';
    return e;
  }
  var tool = {
    id: 'organize',
    accept: '.pdf',
    multiple: true,
    minFiles: 1,
    needsPages: true,
    options: [
      { id: 'pages', type: 'pages', mode: 'order' }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib, degrees = PDFLib.degrees;
      // 파일별 원본 문서는 한 번만 연다
      var docs = [], flat = [];
      for (var f = 0; f < files.length; f++) {
        var d = await PDFLib.PDFDocument.load(files[f].bytes, { ignoreEncryption: false, updateMetadata: false });
        docs.push(d);
        var n = d.getPageCount();
        for (var i = 0; i < n; i++) flat.push({ file: f, index: i });
      }
      if (!flat.length) throw fail(ctx, 'allDeleted', 'errorBroken');
      // 썸네일 번호 → (파일, 쪽). 엔진의 ctx.pages 가 있으면 그 순서를, 없으면 파일 순서 평면 목록을 쓴다
      var map = (ctx.pages && ctx.pages.length === flat.length) ? ctx.pages : flat;
      var order = Array.isArray(opts.pages) && opts.pages.length ? opts.pages : flat.map(function(x, i){ return { index: i, rotate: 0, deleted: false }; });
      var plan = [];
      for (var o = 0; o < order.length; o++) {
        var it = order[o]; if (!it || it.deleted) continue;
        var src = map[it.index]; if (!src) continue;
        if (src.file >= docs.length || src.index >= docs[src.file].getPageCount()) continue;
        plan.push({ file: src.file, index: src.index, rotate: ((it.rotate || 0) % 360 + 360) % 360 });
      }
      if (!plan.length) throw fail(ctx, 'allDeleted');
      var out = await PDFLib.PDFDocument.create();
      // 큰 문서에서도 메모리가 튀지 않게 한 쪽씩 복사한다
      for (var k = 0; k < plan.length; k++) {
        var p = plan[k];
        var copied = await out.copyPages(docs[p.file], [p.index]);
        var page = copied[0];
        if (p.rotate) page.setRotation(degrees(((page.getRotation().angle || 0) + p.rotate) % 360));
        out.addPage(page);
        if (ctx.progress) ctx.progress((k + 1) / (plan.length + 1));
      }
      var bytes = await out.save();
      if (ctx.progress) ctx.progress(1);
      var suffix = (ctx.t && ctx.t('resultName') !== 'resultName') ? ctx.t('resultName') : 'organized';
      var base = String(files[0].name || 'document').replace(/\.[^.]+$/, '');
      return { outputs: [ { name: base + '-' + suffix + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
