// PDF 페이지 삭제: 썸네일에서 고른 쪽(또는 입력한 범위)을 뺀 나머지로 PDF 1개를 만든다.
// 브라우저 전용 요소(캔버스·pdf.js)는 쓰지 않는다. 엔진이 넘기는 ctx.pages 는 선택 번호 → 실제 페이지 번호 변환에만 쓴다.
(function(){
  // 도구 전용 오류: 도구 json 의 errors.<key> 문구가 있으면 그걸, 없으면 공통 키로 보여준다
  function fail(ctx, key, fallback){
    var errs = ctx && ctx.t ? ctx.t('errors') : null;
    var msg = errs && typeof errs === 'object' ? errs[key] : null;
    var e = new Error(key);
    if (msg) e.userMessage = msg; else e.key = fallback || 'errorGeneric';
    return e;
  }
  // "1-3,5,8-" 같은 범위 문자열 → 0 기준 페이지 번호 배열. 잘못된 입력이면 null
  function parseRanges(text, total){
    var set = {}, any = false;
    var parts = String(text || '').split(/[,\s;]+/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim(); if (!p) continue;
      var m = /^(\d*)\s*[-–~]\s*(\d*)$/.exec(p), a, b;
      if (m) {
        if (!m[1] && !m[2]) return null;
        a = m[1] ? parseInt(m[1], 10) : 1;
        b = m[2] ? parseInt(m[2], 10) : total;
      } else if (/^\d+$/.test(p)) { a = b = parseInt(p, 10); }
      else return null;
      if (a < 1 || b < a) return null;
      if (a > total) continue;                 // 문서 밖 범위는 무시
      if (b > total) b = total;
      for (var n = a; n <= b; n++) { set[n - 1] = true; any = true; }
    }
    return any ? Object.keys(set).map(Number).sort(function(x, y){ return x - y; }) : [];
  }
  var tool = {
    id: 'remove-pages',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: true,
    options: [
      { id: 'mode', type: 'radio', default: 'pages', choices: ['pages', 'ranges'] },
      { id: 'pages', type: 'pages', mode: 'select', showIf: { mode: 'pages' } },
      { id: 'ranges', type: 'text', default: '', maxlength: 200, showIf: { mode: 'ranges' } }
    ],
    parseRanges: parseRanges,
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var file = files[0];
      var src = await PDFLib.PDFDocument.load(file.bytes, { ignoreEncryption: false, updateMetadata: false });
      var total = src.getPageCount();
      var remove = {};
      if ((opts.mode || 'pages') === 'ranges') {
        var list = parseRanges(opts.ranges, total);
        if (list === null) throw fail(ctx, 'badRanges');
        if (!list.length) throw fail(ctx, 'noneSelected');
        for (var r = 0; r < list.length; r++) remove[list[r]] = true;
      } else {
        var sel = Array.isArray(opts.pages) ? opts.pages : [];
        if (!sel.length) throw fail(ctx, 'noneSelected');
        for (var s = 0; s < sel.length; s++) {
          // 썸네일 번호 → 실제 페이지 번호 (파일이 하나라 보통 같다)
          var p = ctx.pages && ctx.pages[sel[s]] ? ctx.pages[sel[s]].index : sel[s];
          if (p >= 0 && p < total) remove[p] = true;
        }
      }
      var keep = [];
      for (var i = 0; i < total; i++) if (!remove[i]) keep.push(i);
      if (!keep.length) throw fail(ctx, 'allRemoved');
      var out = await PDFLib.PDFDocument.create();
      // 300쪽 문서도 버티도록 한 쪽씩 복사한다
      for (var k = 0; k < keep.length; k++) {
        var copied = await out.copyPages(src, [keep[k]]);
        out.addPage(copied[0]);
        if (ctx.progress) ctx.progress((k + 1) / (keep.length + 1));
      }
      var bytes = await out.save();
      if (ctx.progress) ctx.progress(1);
      var suffix = (ctx.t && ctx.t('resultName') !== 'resultName') ? ctx.t('resultName') : 'removed';
      var base = String(file.name || 'document').replace(/\.[^.]+$/, '');
      return { outputs: [ { name: base + '-' + suffix + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
