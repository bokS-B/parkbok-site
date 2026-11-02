// PDF 합치기: 파일 목록 순서대로 모든 페이지를 한 문서로 복사한다. 순서는 엔진 파일 목록의 ↑↓ 로 바꾼다.
(function(){
  var tool = {
    id: 'merge',
    accept: '.pdf',
    multiple: true,
    minFiles: 2,
    needsPages: false,
    options: [],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var out = await PDFLib.PDFDocument.create();
      for (var i = 0; i < files.length; i++) {
        var src = await PDFLib.PDFDocument.load(files[i].bytes, { ignoreEncryption: false });
        var idx = src.getPageIndices();
        var pages = await out.copyPages(src, idx);
        for (var j = 0; j < pages.length; j++) out.addPage(pages[j]);
        if (ctx.progress) ctx.progress((i + 1) / (files.length + 1));
      }
      var bytes = await out.save();
      if (ctx.progress) ctx.progress(1);
      var name = (ctx.t && ctx.t('resultName')) || 'merged';
      return { outputs: [ { name: name + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
