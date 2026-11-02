// 이미지 → PDF: JPG/PNG 는 바이트를 그대로 넣고, 그 밖의 형식(WebP·HEIC·GIF·BMP 등)은 브라우저 캔버스로 PNG 로 바꿔 넣는다.
// 순서·회전·삭제는 pages(order) 옵션 값으로 받는다. 한 장씩 처리해 큰 사진이 많아도 메모리를 한꺼번에 쓰지 않는다.
(function(){
  var SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
  var MARGINS = { none: 0, small: 20, big: 48 };
  var AUTO_LONG = 842; // '이미지 비율대로' 일 때 긴 변 길이(pt)

  // ---------- 형식 판별 / EXIF ----------
  function kind(b){
    if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    return '';
  }
  // JPEG EXIF 방향값 → 바로 보이게 돌려야 하는 각도(시계 방향). 거울 반전(2,4,5,7)은 회전만 적용한다.
  function exifRotation(b){
    try {
      var i = 2, n = b.length;
      while (i + 4 < n && b[i] === 0xFF) {
        var m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
        if (m === 0xDA || m === 0xD9) break;
        if (m === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
          var t = i + 10; if (t + 8 > n) return 0;
          var le = b[t] === 0x49 && b[t + 1] === 0x49;
          var r16 = function(p){ return le ? (b[p] | (b[p + 1] << 8)) : ((b[p] << 8) | b[p + 1]); };
          var r32 = function(p){ return le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; };
          var ifd = t + r32(t + 4); if (ifd + 2 > n) return 0;
          var cnt = r16(ifd);
          for (var k = 0; k < cnt; k++) {
            var e = ifd + 2 + k * 12; if (e + 12 > n) return 0;
            if (r16(e) === 0x0112) { var v = r16(e + 8); return v === 3 ? 180 : (v === 6 || v === 5) ? 90 : (v === 8 || v === 7) ? 270 : 0; }
          }
          return 0;
        }
        i += 2 + len;
      }
    } catch (e) {}
    return 0;
  }

  // ---------- 브라우저 전용: 캔버스로 PNG 변환 (EXIF 방향은 브라우저가 적용) ----------
  function hasCanvas(){ return typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof URL !== 'undefined' && !!URL.createObjectURL; }
  function toPngBytes(bytes, type){
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(new Blob([bytes], { type: type || '' })), img = new Image();
      img.onload = function(){
        URL.revokeObjectURL(u);
        try {
          var c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
          if (!c.width || !c.height) throw new Error('image');
          c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob(function(bl){ if (!bl) { rej(new Error('image')); return; } bl.arrayBuffer().then(function(ab){ res(new Uint8Array(ab)); }, rej); }, 'image/png');
        } catch (e) { rej(e); }
      };
      img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('image')); };
      img.src = u;
    });
  }

  // ---------- 오류: 도구 문구(errors.<key>) → 공통 문구 순 ----------
  function fail(ctx, key, vars){
    var E = ctx.t ? ctx.t('errors') : null;
    var msg = (E && typeof E === 'object' && E[key]) ? E[key] : (ctx.t ? ctx.t(key, vars) : key);
    var e = new Error(msg); e.userMessage = msg; return e;
  }

  // ---------- 이미지 1장 embed → { img, rotate } ----------
  async function embedImage(doc, file, ctx){
    var k = kind(file.bytes);
    try {
      if (k === 'jpg') return { img: await doc.embedJpg(file.bytes), rotate: exifRotation(file.bytes) };
      if (k === 'png') return { img: await doc.embedPng(file.bytes), rotate: 0 };
    } catch (e) { /* 캔버스 변환으로 다시 시도 */ }
    if (!hasCanvas()) throw fail(ctx, 'image');
    var png;
    try { png = await toPngBytes(file.bytes, file.type); } catch (e) { throw fail(ctx, 'image'); }
    try { return { img: await doc.embedPng(png), rotate: 0 }; } catch (e) { throw fail(ctx, 'image'); }
  }

  // ---------- 배치 계산 ----------
  // 회전 뒤 비율 기준으로 페이지 크기를 정한다 → [pw, ph]
  function pageSize(opts, iw, ih, rotate){
    var swap = rotate % 180 !== 0, rw = swap ? ih : iw, rh = swap ? iw : ih;
    var m = MARGINS[opts.margin] != null ? MARGINS[opts.margin] : MARGINS.small;
    var landscape = opts.orientation === 'landscape' ? true : (opts.orientation === 'portrait' ? false : rw > rh);
    var pw, ph;
    if (opts.pageSize === 'auto' || !SIZES[opts.pageSize]) {
      var s = AUTO_LONG / Math.max(rw, rh, 1);
      pw = rw * s + 2 * m; ph = rh * s + 2 * m;
    } else { pw = SIZES[opts.pageSize][0]; ph = SIZES[opts.pageSize][1]; }
    if (landscape !== (pw > ph)) { var x = pw; pw = ph; ph = x; }
    return [pw, ph, m];
  }
  // box 안에 이미지를 시계 방향 rotate 만큼 돌려 가운데 배치. pdf-lib 회전은 그림의 왼쪽 아래 모서리를 축으로 반시계 방향이라 원점을 옮겨 준다.
  function place(PDFLib, page, img, rotate, box, fill){
    var iw = img.width, ih = img.height;
    var swap = rotate % 180 !== 0, rw = swap ? ih : iw, rh = swap ? iw : ih;
    var s = fill ? Math.max(box.w / rw, box.h / rh) : Math.min(box.w / rw, box.h / rh);
    var w = iw * s, h = ih * s, bw = rw * s, bh = rh * s;
    var bx = box.x + (box.w - bw) / 2, by = box.y + (box.h - bh) / 2;
    var x = bx, y = by;
    if (rotate === 90) { x = bx; y = by + w; }
    else if (rotate === 180) { x = bx + w; y = by + h; }
    else if (rotate === 270) { x = bx + h; y = by; }
    var clip = fill && PDFLib.pushGraphicsState && PDFLib.rectangle && PDFLib.clip && PDFLib.endPath && PDFLib.popGraphicsState;
    if (clip) page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.rectangle(box.x, box.y, box.w, box.h), PDFLib.clip(), PDFLib.endPath());
    page.drawImage(img, { x: x, y: y, width: w, height: h, rotate: PDFLib.degrees((360 - rotate) % 360) });
    if (clip) page.pushOperators(PDFLib.popGraphicsState());
  }
  // pages(order) 값 → [{ file, rotate }] (값이 없으면 파일 순서 그대로)
  function orderOf(files, opts, ctx){
    var list = [], ord = opts && Array.isArray(opts.pages) ? opts.pages : null;
    if (ord && ord.length && ctx.pages && ctx.pages.length) {
      ord.forEach(function(it){
        if (!it || it.deleted) return;
        var p = ctx.pages[it.index]; if (!p || !files[p.file]) return;
        list.push({ file: p.file, rotate: ((it.rotate || 0) % 360 + 360) % 360 });
      });
    } else files.forEach(function(f, i){ list.push({ file: i, rotate: 0 }); });
    return list;
  }
  function baseName(n){ return String(n || 'image').replace(/\.[^.]+$/, ''); }

  var tool = {
    id: 'jpg-to-pdf',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: true,
    options: [
      { id: 'pages', type: 'pages', mode: 'order' },
      { id: 'pageSize', type: 'select', default: 'auto', choices: ['auto', 'a4', 'letter'] },
      { id: 'orientation', type: 'select', default: 'auto', choices: ['auto', 'portrait', 'landscape'] },
      { id: 'margin', type: 'select', default: 'small', choices: ['none', 'small', 'big'] },
      { id: 'fit', type: 'select', default: 'fit', choices: ['fit', 'fill'] }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib; opts = opts || {};
      var list = orderOf(files, opts, ctx);
      if (!list.length) throw fail(ctx, 'errorEmpty', { n: 1 });
      var doc = await PDFLib.PDFDocument.create();
      var fill = opts.fit === 'fill';
      for (var i = 0; i < list.length; i++) {
        var f = files[list[i].file];
        var em = await embedImage(doc, f, ctx);
        var rot = (em.rotate + list[i].rotate) % 360;
        var ps = pageSize(opts, em.img.width, em.img.height, rot), m = ps[2];
        var page = doc.addPage([ps[0], ps[1]]);
        place(PDFLib, page, em.img, rot, { x: m, y: m, w: ps[0] - 2 * m, h: ps[1] - 2 * m }, fill);
        if (ctx.progress) ctx.progress((i + 1) / (list.length + 1));
      }
      var bytes = await doc.save();
      if (ctx.progress) ctx.progress(1);
      var suffix = (ctx.t && ctx.t('resultName')) || 'converted';
      var name = baseName(files[list[0].file].name) + '-' + suffix + '.pdf';
      return { outputs: [ { name: name, blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
