// PDF 회전: 각도(90/180/270)를 모든 쪽·선택한 쪽·홀수 쪽·짝수 쪽에 더한다. 기존 /Rotate 값에 누적하며 쪽을 복사하지 않고 제자리에서 바꾼다.
(function(){
  function toolError(ctx, key){
    // 도구 json strings.<lang>.errors.<key> → 없으면 공통 errorGeneric
    var errs = ctx.t ? ctx.t('errors') : null;
    var msg = (errs && typeof errs === 'object' && errs[key]) || (ctx.t ? ctx.t('errorGeneric') : key);
    var e = new Error(msg); e.userMessage = msg; e.code = key;
    return e;
  }
  function baseName(n){ return String(n || 'file').replace(/\.[^.]+$/, ''); }
  function tick(){ return new Promise(function(r){ setTimeout(r, 0); }); }

  var tool = {
    id: 'rotate',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: true,
    options: [
      { id: 'angle', type: 'select', default: '90', choices: ['90', '180', '270'] },
      { id: 'target', type: 'radio', default: 'all', choices: ['all', 'odd', 'even', 'pages'] },
      { id: 'pages', type: 'pages', mode: 'select', showIf: { target: 'pages' } }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var angle = parseInt(opts.angle, 10);
      if (angle !== 90 && angle !== 180 && angle !== 270) angle = 90;
      var target = opts.target || 'all';
      var doc = await PDFLib.PDFDocument.load(files[0].bytes, { ignoreEncryption: false });
      var pages = doc.getPages(), n = pages.length;
      if (!n) throw toolError(ctx, 'noPages');

      // 대상 쪽 집합 (0 기준)
      var pick = {};
      if (target === 'pages') {
        var sel = Array.isArray(opts.pages) ? opts.pages : [];
        for (var s = 0; s < sel.length; s++) { var k = parseInt(sel[s], 10); if (k >= 0 && k < n) pick[k] = true; }
        if (!Object.keys(pick).length) throw toolError(ctx, 'noPages');
      } else {
        for (var i = 0; i < n; i++) {
          if (target === 'all' || (target === 'odd' && i % 2 === 0) || (target === 'even' && i % 2 === 1)) pick[i] = true;
        }
      }

      var rotated = 0;
      for (var p = 0; p < n; p++) {
        if (pick[p]) {
          var cur = pages[p].getRotation().angle || 0;
          var next = ((cur + angle) % 360 + 360) % 360;
          pages[p].setRotation(PDFLib.degrees(next));
          rotated++;
        }
        if (ctx.progress) ctx.progress((p + 1) / (n + 1));
        if (p % 25 === 24) await tick();   // 긴 문서에서 화면이 멈추지 않게
      }
      if (!rotated) throw toolError(ctx, 'noPages');

      var bytes = await doc.save();
      if (ctx.progress) ctx.progress(1);
      var rn = ctx.t ? ctx.t('resultName') : '';
      if (!rn || rn === 'resultName') rn = 'rotated';
      return { outputs: [ { name: baseName(files[0].name) + '-' + rn + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
