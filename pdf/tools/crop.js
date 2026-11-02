// PDF 여백 자르기: 각 쪽의 보이는 영역(CropBox)을 위·오른쪽·아래·왼쪽 mm 만큼 안쪽으로 줄인다. '영구 자르기' 를 켜면 MediaBox 도 같이 줄인다.
// 쪽을 복사하지 않고 제자리에서 상자만 바꾸므로 300쪽 문서도 메모리가 늘지 않는다. 쪽 회전(/Rotate)을 고려해 화면에서 보이는 위·아래 기준으로 자른다.
(function(){
  var PT_PER_MM = 72 / 25.4;
  function toolError(ctx, key){
    // 도구 json strings.<lang>.errors.<key> → 없으면 공통 errorGeneric
    var errs = ctx.t ? ctx.t('errors') : null;
    var msg = (errs && typeof errs === 'object' && errs[key]) || (ctx.t ? ctx.t('errorGeneric') : key);
    var e = new Error(msg); e.userMessage = msg; e.code = key;
    return e;
  }
  function baseName(n){ return String(n || 'file').replace(/\.[^.]+$/, ''); }
  function tick(){ return new Promise(function(r){ setTimeout(r, 0); }); }
  function mm(v){ var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }

  // 화면 기준 여백(top/right/bottom/left) → 회전 전 좌표계의 여백(상/우/하/좌)
  // /Rotate 90 = 시계 방향 표시: 회전 전 왼쪽 변이 화면의 위가 된다
  function unrotate(m, rot){
    if (rot === 90) return { top: m.right, right: m.bottom, bottom: m.left, left: m.top };
    if (rot === 180) return { top: m.bottom, right: m.left, bottom: m.top, left: m.right };
    if (rot === 270) return { top: m.left, right: m.top, bottom: m.right, left: m.bottom };
    return m;
  }

  var tool = {
    id: 'crop',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'preset', type: 'select', default: '10', choices: ['none', '10', '15', '20'] },
      { id: 'top', type: 'number', default: 0, min: 0, max: 500, step: 0.5, showIf: { preset: 'none' } },
      { id: 'right', type: 'number', default: 0, min: 0, max: 500, step: 0.5, showIf: { preset: 'none' } },
      { id: 'bottom', type: 'number', default: 0, min: 0, max: 500, step: 0.5, showIf: { preset: 'none' } },
      { id: 'left', type: 'number', default: 0, min: 0, max: 500, step: 0.5, showIf: { preset: 'none' } },
      { id: 'permanent', type: 'checkbox', default: false }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var preset = String(opts.preset == null ? '10' : opts.preset);
      var m;
      if (preset !== 'none') { var a = mm(preset); m = { top: a, right: a, bottom: a, left: a }; }
      else m = { top: mm(opts.top), right: mm(opts.right), bottom: mm(opts.bottom), left: mm(opts.left) };
      if (m.top + m.right + m.bottom + m.left <= 0) throw toolError(ctx, 'noMargin');
      var permanent = !!opts.permanent;

      var doc = await PDFLib.PDFDocument.load(files[0].bytes, { ignoreEncryption: false });
      var pages = doc.getPages(), n = pages.length;
      if (!n) throw toolError(ctx, 'tooLarge');

      for (var p = 0; p < n; p++) {
        var page = pages[p];
        var rot = ((page.getRotation().angle || 0) % 360 + 360) % 360;
        var u = unrotate(m, rot);
        var box = page.getCropBox();   // CropBox 가 없으면 MediaBox 를 돌려준다
        var x = box.x + u.left * PT_PER_MM, y = box.y + u.bottom * PT_PER_MM;
        var w = box.width - (u.left + u.right) * PT_PER_MM, h = box.height - (u.top + u.bottom) * PT_PER_MM;
        if (w < 1 || h < 1) throw toolError(ctx, 'tooLarge');
        page.setCropBox(x, y, w, h);
        if (permanent) {
          page.setMediaBox(x, y, w, h);
          page.setBleedBox(x, y, w, h); page.setTrimBox(x, y, w, h); page.setArtBox(x, y, w, h);
        }
        if (ctx.progress) ctx.progress((p + 1) / (n + 1));
        if (p % 25 === 24) await tick();   // 긴 문서에서 화면이 멈추지 않게
      }

      var bytes = await doc.save();
      if (ctx.progress) ctx.progress(1);
      var rn = ctx.t ? ctx.t('resultName') : '';
      if (!rn || rn === 'resultName') rn = 'cropped';
      return { outputs: [ { name: baseName(files[0].name) + '-' + rn + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
