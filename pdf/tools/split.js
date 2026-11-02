// PDF 나누기: 범위('1-3,5' → 범위마다 1개) · N쪽마다 1개 · 쪽마다 1개 · 썸네일 선택(선택한 쪽만 모아 1개).
// 큰 문서에서도 메모리가 튀지 않게 copyPages 를 한 쪽씩 호출한다. 결과가 2개 이상이면 엔진이 목록 + ZIP 을 그린다.
(function(){
  function baseName(n){ return String(n || 'document').replace(/\.[^.]+$/, '') || 'document'; }
  function fail(ctx, key){ var e = new Error(key); e.key = key; e.userMessage = ctx && ctx.t ? ctx.t(key) : key; return e; }
  function resultName(ctx, fallback){ var r = ctx && ctx.t ? ctx.t('resultName') : null; return (r && r !== 'resultName') ? r : fallback; }

  // '1-3,5,8-' 같은 입력을 [[시작,끝],…] (0기준, 끝 포함) 으로 바꾼다. 전각 쉼표·물결표·긴 대시도 받아준다.
  function parseRanges(text, total){
    var s = String(text || '').replace(/[，、;；\s]+/g, ',').replace(/[~〜～–—]/g, '-');
    var out = [];
    s.split(',').forEach(function(part){
      if (!part) return;
      var m = /^(\d*)-(\d*)$/.exec(part), a, b;
      if (m) {
        if (m[1] === '' && m[2] === '') return;
        a = m[1] === '' ? 1 : parseInt(m[1], 10);
        b = m[2] === '' ? total : parseInt(m[2], 10);
      } else if (/^\d+$/.test(part)) { a = b = parseInt(part, 10); }
      else return;
      if (a > b) { var x = a; a = b; b = x; }
      a = Math.max(1, a); b = Math.min(total, b);
      if (a > b) return;
      out.push([a - 1, b - 1]);
    });
    return out;
  }

  // 썸네일 선택값(ctx.pages 의 전역 인덱스) → 이 파일의 쪽 번호(0기준) 오름차순
  function selectedPages(sel, ctx, total){
    var seen = {}, out = [];
    (sel || []).forEach(function(i){
      var p = ctx && ctx.pages && ctx.pages[i];
      var idx = p ? p.index : i;
      if (typeof idx !== 'number' || idx < 0 || idx >= total || seen[idx]) return;
      seen[idx] = true; out.push(idx);
    });
    return out.sort(function(a, b){ return a - b; });
  }

  // 그룹(쪽 번호 배열)마다 새 PDF 를 만든다. 한 쪽씩 복사하고 진행률을 알린다.
  async function buildGroups(PDFLib, src, groups, ctx){
    var totalPages = 0; groups.forEach(function(g){ totalPages += g.length; });
    var done = 0, blobs = [];
    for (var g = 0; g < groups.length; g++) {
      var out = await PDFLib.PDFDocument.create();
      for (var k = 0; k < groups[g].length; k++) {
        var copied = await out.copyPages(src, [groups[g][k]]);
        out.addPage(copied[0]);
        done++;
        if (ctx.progress) ctx.progress(0.05 + 0.9 * done / Math.max(1, totalPages));
      }
      var bytes = await out.save({ useObjectStreams: true });
      blobs.push(new Blob([bytes], { type: 'application/pdf' }));
    }
    return blobs;
  }

  var tool = {
    id: 'split',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: true,
    options: [
      { id: 'mode', type: 'radio', default: 'all', choices: ['all', 'ranges', 'every', 'pages'] },
      { id: 'ranges', type: 'text', default: '', maxlength: 500, showIf: { mode: 'ranges' } },
      { id: 'every', type: 'number', default: 2, min: 1, max: 999, step: 1, showIf: { mode: 'every' } },
      { id: 'pages', type: 'pages', mode: 'select', showIf: { mode: 'pages' } }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var file = files[0];
      if (!file) throw fail(ctx, 'errorEmpty');
      if (ctx.progress) ctx.progress(0.02);
      var src = await PDFLib.PDFDocument.load(file.bytes, { ignoreEncryption: false, updateMetadata: false });
      var total = src.getPageCount();
      if (!total) throw fail(ctx, 'errorBroken');
      var mode = opts.mode || 'all', groups = [], i;

      if (mode === 'ranges') {
        var rs = parseRanges(opts.ranges, total);
        if (!rs.length) throw fail(ctx, 'errorRanges');
        rs.forEach(function(r){ var g = []; for (i = r[0]; i <= r[1]; i++) g.push(i); groups.push(g); });
      } else if (mode === 'every') {
        var n = Math.floor(Number(opts.every));
        if (!(n >= 1)) n = 1;
        if (n >= total) throw fail(ctx, 'errorEveryTooBig');
        for (i = 0; i < total; i += n) { var g2 = []; for (var j = i; j < Math.min(total, i + n); j++) g2.push(j); groups.push(g2); }
      } else if (mode === 'pages') {
        var sel = selectedPages(opts.pages, ctx, total);
        if (!sel.length) throw fail(ctx, 'errorNoPages');
        groups.push(sel);
      } else {
        for (i = 0; i < total; i++) groups.push([i]);
      }

      var blobs = await buildGroups(PDFLib, src, groups, ctx);
      var base = baseName(file.name), outputs = [];
      if (blobs.length === 1) outputs.push({ name: base + '-' + resultName(ctx, 'split') + '.pdf', blob: blobs[0] });
      else for (i = 0; i < blobs.length; i++) outputs.push({ name: base + '-part' + (i + 1) + '.pdf', blob: blobs[i] });
      if (ctx.progress) ctx.progress(1);
      return { outputs: outputs, note: '' };
    },
    // Node 테스트용
    _parseRanges: parseRanges
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
