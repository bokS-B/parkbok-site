// PDF 페이지 추출: 썸네일에서 고르거나 '1-3,5' 범위를 적어 그 쪽들만 담은 PDF 1개를 만든다.
// keepOrder 를 끄면 범위에 적은 순서대로(중복 허용) 담는다. copyPages 는 한 쪽씩 호출한다.
(function(){
  function baseName(n){ return String(n || 'document').replace(/\.[^.]+$/, '') || 'document'; }
  function fail(ctx, key){ var e = new Error(key); e.key = key; e.userMessage = ctx && ctx.t ? ctx.t(key) : key; return e; }
  function resultName(ctx, fallback){ var r = ctx && ctx.t ? ctx.t('resultName') : null; return (r && r !== 'resultName') ? r : fallback; }

  // '1-3,5,8-' → 쪽 번호(0기준) 배열, 적은 순서 그대로. 전각 쉼표·물결표·긴 대시도 받아준다.
  function parsePages(text, total){
    var s = String(text || '').replace(/[，、;；\s]+/g, ',').replace(/[~〜～–—]/g, '-');
    var out = [];
    s.split(',').forEach(function(part){
      if (!part) return;
      var m = /^(\d*)-(\d*)$/.exec(part), a, b, i;
      if (m) {
        if (m[1] === '' && m[2] === '') return;
        a = m[1] === '' ? 1 : parseInt(m[1], 10);
        b = m[2] === '' ? total : parseInt(m[2], 10);
      } else if (/^\d+$/.test(part)) { a = b = parseInt(part, 10); }
      else return;
      var step = a <= b ? 1 : -1;
      for (i = a; step > 0 ? i <= b : i >= b; i += step) if (i >= 1 && i <= total) out.push(i - 1);
    });
    return out;
  }
  function uniqueSorted(arr){
    var seen = {}, out = [];
    arr.forEach(function(i){ if (!seen[i]) { seen[i] = true; out.push(i); } });
    return out.sort(function(a, b){ return a - b; });
  }
  // 썸네일 선택값(ctx.pages 의 전역 인덱스) → 이 파일의 쪽 번호(0기준)
  function selectedPages(sel, ctx, total){
    var out = [];
    (sel || []).forEach(function(i){
      var p = ctx && ctx.pages && ctx.pages[i];
      var idx = p ? p.index : i;
      if (typeof idx === 'number' && idx >= 0 && idx < total) out.push(idx);
    });
    return uniqueSorted(out);
  }

  var tool = {
    id: 'extract-pages',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: true,
    options: [
      { id: 'mode', type: 'radio', default: 'pages', choices: ['pages', 'ranges'] },
      { id: 'pages', type: 'pages', mode: 'select', showIf: { mode: 'pages' } },
      { id: 'ranges', type: 'text', default: '', maxlength: 500, showIf: { mode: 'ranges' } },
      { id: 'keepOrder', type: 'checkbox', default: true, showIf: { mode: 'ranges' } }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var file = files[0];
      if (!file) throw fail(ctx, 'errorEmpty');
      if (ctx.progress) ctx.progress(0.02);
      var src = await PDFLib.PDFDocument.load(file.bytes, { ignoreEncryption: false, updateMetadata: false });
      var total = src.getPageCount();
      if (!total) throw fail(ctx, 'errorBroken');

      var list;
      if (opts.mode === 'ranges') {
        list = parsePages(opts.ranges, total);
        if (!list.length) throw fail(ctx, 'errorRanges');
        if (opts.keepOrder !== false) list = uniqueSorted(list);
      } else {
        list = selectedPages(opts.pages, ctx, total);
        if (!list.length) throw fail(ctx, 'errorNoPages');
      }

      var out = await PDFLib.PDFDocument.create();
      for (var k = 0; k < list.length; k++) {
        var copied = await out.copyPages(src, [list[k]]);
        out.addPage(copied[0]);
        if (ctx.progress) ctx.progress(0.05 + 0.85 * (k + 1) / list.length);
      }
      var bytes = await out.save({ useObjectStreams: true });
      if (ctx.progress) ctx.progress(1);
      var name = baseName(file.name) + '-' + resultName(ctx, 'pages') + '.pdf';
      return { outputs: [ { name: name, blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    },
    // Node 테스트용
    _parsePages: parsePages
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
