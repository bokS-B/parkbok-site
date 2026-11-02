// 페이지 번호 넣기: 모든(또는 지정 범위) 쪽의 지정 위치에 Helvetica 로 번호를 그린다. 문서를 그대로 열어 쪽마다 drawText 만 하므로 복사본을 만들지 않는다.
(function(){
  var MM = 72 / 25.4;

  // 오류: 엔진이 e.key 로 도구 json 또는 공통 문구를 찾는다. Node 테스트에선 message 가 키 그대로다.
  function fail(ctx, key){ var e = new Error(ctx && ctx.t ? ctx.t(key) : key); e.key = key; return e; }

  // "1-3,5,8-" → 0기준 쪽 번호 집합. 빈 문자열이면 null(전체). 형식이 틀리면 false.
  function parseRange(str, count){
    var s = String(str || '').replace(/\s+/g, '');
    if (!s) return null;
    var set = {}, any = false, parts = s.split(/[,;]/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p) continue;
      var m = /^(\d*)-(\d*)$/.exec(p), a, b;
      if (m) { a = m[1] ? parseInt(m[1], 10) : 1; b = m[2] ? parseInt(m[2], 10) : count; if (!m[1] && !m[2]) return false; }
      else if (/^\d+$/.test(p)) { a = b = parseInt(p, 10); }
      else return false;
      if (a < 1) a = 1; if (b > count) b = count;
      for (var n = a; n <= b; n++) { set[n - 1] = true; any = true; }
    }
    return any ? set : false;
  }

  // 쪽의 보이는 영역(CropBox)과 회전을 읽어 "화면 기준" 좌표계를 만든다.
  //   toPage(vx, vy): 화면 기준(회전 반영, 왼쪽 아래 원점) 좌표 → 실제 쪽 좌표. rot: drawText 에 더할 각도.
  function frame(page){
    var box; try { box = page.getCropBox(); } catch (e) { box = null; }
    if (!box || !(box.width > 0) || !(box.height > 0)) { var sz = page.getSize(); box = { x: 0, y: 0, width: sz.width, height: sz.height }; }
    var r = ((page.getRotation().angle || 0) % 360 + 360) % 360;
    var W = box.width, H = box.height, swap = r === 90 || r === 270;
    return {
      width: swap ? H : W, height: swap ? W : H, rot: r,
      toPage: function(vx, vy){
        var x, y;
        if (r === 90) { x = W - vy; y = vx; }
        else if (r === 180) { x = W - vx; y = H - vy; }
        else if (r === 270) { x = vy; y = H - vx; }
        else { x = vx; y = vy; }
        return { x: x + box.x, y: y + box.y };
      }
    };
  }

  function formatNumber(fmt, n, total){
    if (fmt === 'total') return n + ' / ' + total;
    if (fmt === 'page') return 'Page ' + n;
    return String(n);
  }

  var tool = {
    id: 'page-numbers',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'position', type: 'position', default: 'bc' },
      { id: 'format', type: 'select', default: 'n', choices: ['n', 'total', 'page'] },
      { id: 'start', type: 'number', default: 1, min: 0, max: 99999, step: 1 },
      { id: 'size', type: 'range', default: 11, min: 8, max: 24, step: 1, unit: 'pt' },
      { id: 'margin', type: 'number', default: 10, min: 0, max: 100, step: 1 },
      { id: 'range', type: 'text', default: '', maxlength: 200 }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var f = files[0];
      if (!f) throw fail(ctx, 'errorEmpty');
      var doc = await PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: false, updateMetadata: false });
      var pages = doc.getPages(), count = pages.length;
      if (!count) throw fail(ctx, 'errorBroken');

      var sel = parseRange(opts.range, count);
      if (sel === false) throw fail(ctx, 'errorRange');
      var start = Math.round(Number(opts.start)); if (!isFinite(start)) start = 1;
      var size = Math.min(72, Math.max(4, Number(opts.size) || 11));
      var margin = Math.max(0, Number(opts.margin) || 0) * MM;
      var pos = String(opts.position || 'bc'); if (!/^[tmb][lcr]$/.test(pos)) pos = 'bc';
      var fmt = String(opts.format || 'n');
      var total = start + count - 1;

      var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      var color = PDFLib.rgb(0, 0, 0);
      var stamped = 0;
      for (var i = 0; i < count; i++) {
        if (sel && !sel[i]) continue;
        var page = pages[i], fr = frame(page);
        var text = formatNumber(fmt, start + i, total);
        var tw = font.widthOfTextAtSize(text, size), th = size * 0.72;   // 대문자 높이 근사
        var vx = pos.charAt(1) === 'l' ? margin : pos.charAt(1) === 'r' ? fr.width - margin - tw : (fr.width - tw) / 2;
        var vy = pos.charAt(0) === 'b' ? margin : pos.charAt(0) === 't' ? fr.height - margin - th : (fr.height - th) / 2;
        var pt = fr.toPage(vx, vy);
        page.drawText(text, { x: pt.x, y: pt.y, size: size, font: font, color: color, rotate: PDFLib.degrees(fr.rot) });
        stamped++;
        if (ctx.progress && (i % 10 === 0 || i === count - 1)) ctx.progress((i + 1) / (count + 1));
        if (i % 25 === 24) await new Promise(function(res){ setTimeout(res, 0); });   // 긴 문서에서 화면 갱신 틈
      }
      if (!stamped) throw fail(ctx, 'errorRange');

      var bytes = await doc.save({ useObjectStreams: true });
      if (ctx.progress) ctx.progress(1);
      var suffix = (ctx.t && ctx.t('resultName') !== 'resultName') ? ctx.t('resultName') : 'numbered';
      var name = String(f.name || 'document').replace(/\.[^.]+$/, '') + '-' + suffix + '.pdf';
      return { outputs: [ { name: name, blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  tool._parseRange = parseRange;   // 테스트용
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
