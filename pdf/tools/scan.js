// 문서 스캔: 휴대폰으로 찍은(또는 고른) 사진을 A4 세로 PDF 한 개로 만든다.
// enhance 가 켜지면 브라우저 캔버스로 배경(그림자) 평탄화 + 대비 보정을 하고 JPEG 로 다시 넣는다. 자동 회전·기울기 보정은 없다.
// 캔버스가 없는 환경(Node)에서는 보정을 건너뛰고 원본을 그대로 넣는다. embed 로직은 jpg-to-pdf 와 같다(파일 간 공유 불가라 복제).
(function(){
  var A4 = [595.28, 841.89];
  var MARGIN = 0;          // 스캔은 종이를 꽉 채운다
  var MAX_SIDE = 2200;     // 보정 캔버스 긴 변 상한(px) — 메모리 보호
  var JPEG_Q = 0.85;

  // ---------- 형식 판별 / EXIF ----------
  function kind(b){
    if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    return '';
  }
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

  // ---------- 브라우저 전용: 디코드 / 캔버스 변환 / 보정 ----------
  function hasCanvas(){ return typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof URL !== 'undefined' && !!URL.createObjectURL; }
  function decode(bytes, type){
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(new Blob([bytes], { type: type || '' })), img = new Image();
      img.onload = function(){ URL.revokeObjectURL(u); if (!(img.naturalWidth || img.width)) rej(new Error('image')); else res(img); };
      img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('image')); };
      img.src = u;
    });
  }
  function canvasBytes(c, mime, q){
    return new Promise(function(res, rej){
      c.toBlob(function(bl){ if (!bl) { rej(new Error('image')); return; } bl.arrayBuffer().then(function(ab){ res(new Uint8Array(ab)); }, rej); }, mime, q);
    });
  }
  function toPngBytes(bytes, type){
    return decode(bytes, type).then(function(img){
      var c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return canvasBytes(c, 'image/png');
    });
  }
  // 배경 평탄화 + 대비 보정 → JPEG 바이트. mode 'gray' 면 흑백, 'color' 면 색 유지.
  function enhance(bytes, type, mode){
    return decode(bytes, type).then(function(img){
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var s = Math.min(1, MAX_SIDE / Math.max(iw, ih));
      var w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
      // 배경 추정: 아주 작게 줄였다가 부드럽게 키우면 조명·그림자만 남는다
      var tw = Math.max(1, Math.round(w / 40)), th = Math.max(1, Math.round(h / 40));
      var tiny = document.createElement('canvas'); tiny.width = tw; tiny.height = th;
      var tg = tiny.getContext('2d'); tg.imageSmoothingEnabled = true; tg.drawImage(c, 0, 0, tw, th);
      var bgc = document.createElement('canvas'); bgc.width = w; bgc.height = h;
      var bg = bgc.getContext('2d'); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high'; bg.drawImage(tiny, 0, 0, w, h);
      var src = g.getImageData(0, 0, w, h), bgd = bg.getImageData(0, 0, w, h).data, d = src.data;
      var hist = new Uint32Array(256), n = w * h, i, p, v;
      var gray = mode !== 'color';
      // 1) 배경으로 나눠 조명 평탄화 (이득 상한 3배)
      for (i = 0; i < n; i++) {
        p = i * 4;
        if (gray) {
          var l = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
          var bl = 0.299 * bgd[p] + 0.587 * bgd[p + 1] + 0.114 * bgd[p + 2];
          v = l * 255 / Math.max(bl, 85); v = v > 255 ? 255 : v;
          d[p] = d[p + 1] = d[p + 2] = v; hist[v | 0]++;
        } else {
          for (var ch = 0; ch < 3; ch++) { v = d[p + ch] * 255 / Math.max(bgd[p + ch], 85); d[p + ch] = v > 255 ? 255 : v; }
          hist[(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) | 0]++;
        }
      }
      // 2) 백분위로 대비 늘리기: 어두운 2% 를 검정, 밝은 쪽은 흰색으로
      var acc = 0, lo = 0, hi = 255;
      for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
      acc = 0;
      for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.10) { hi = i; break; } }
      lo = Math.min(lo, 120); hi = Math.max(hi, lo + 60);
      var lut = new Uint8ClampedArray(256);
      for (i = 0; i < 256; i++) { var t = (i - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t; lut[i] = Math.round(t * 255); }
      for (i = 0; i < n; i++) { p = i * 4; d[p] = lut[d[p]]; d[p + 1] = lut[d[p + 1]]; d[p + 2] = lut[d[p + 2]]; d[p + 3] = 255; }
      g.putImageData(src, 0, 0);
      return canvasBytes(c, 'image/jpeg', JPEG_Q);
    });
  }

  // ---------- 오류: 도구 문구(errors.<key>) → 공통 문구 순 ----------
  function fail(ctx, key, vars){
    var E = ctx.t ? ctx.t('errors') : null;
    var msg = (E && typeof E === 'object' && E[key]) ? E[key] : (ctx.t ? ctx.t(key, vars) : key);
    var e = new Error(msg); e.userMessage = msg; return e;
  }

  // ---------- 이미지 1장 embed → { img, rotate } ----------
  async function embedImage(doc, file, ctx, opts){
    var bytes = file.bytes, rotate = 0;
    if (opts.enhance && hasCanvas()) {
      // 보정은 캔버스를 거치므로 EXIF 방향이 이미 적용된 JPEG 가 나온다
      try { bytes = await enhance(file.bytes, file.type, opts.mode); return { img: await doc.embedJpg(bytes), rotate: 0 }; }
      catch (e) { bytes = file.bytes; /* 보정 실패 시 원본으로 */ }
    }
    var k = kind(bytes);
    try {
      if (k === 'jpg') return { img: await doc.embedJpg(bytes), rotate: exifRotation(bytes) };
      if (k === 'png') return { img: await doc.embedPng(bytes), rotate: 0 };
    } catch (e) { /* 캔버스 변환으로 다시 시도 */ }
    if (!hasCanvas()) throw fail(ctx, 'image');
    var png;
    try { png = await toPngBytes(bytes, file.type); } catch (e) { throw fail(ctx, 'image'); }
    try { return { img: await doc.embedPng(png), rotate: 0 }; } catch (e) { throw fail(ctx, 'image'); }
  }

  // ---------- 배치: A4 세로 안에 가운데 맞춤, 시계 방향 rotate ----------
  function place(PDFLib, page, img, rotate, box){
    var iw = img.width, ih = img.height;
    var swap = rotate % 180 !== 0, rw = swap ? ih : iw, rh = swap ? iw : ih;
    var s = Math.min(box.w / rw, box.h / rh);
    var w = iw * s, h = ih * s, bw = rw * s, bh = rh * s;
    var bx = box.x + (box.w - bw) / 2, by = box.y + (box.h - bh) / 2;
    var x = bx, y = by;
    if (rotate === 90) { x = bx; y = by + w; }
    else if (rotate === 180) { x = bx + w; y = by + h; }
    else if (rotate === 270) { x = bx + h; y = by; }
    page.drawImage(img, { x: x, y: y, width: w, height: h, rotate: PDFLib.degrees((360 - rotate) % 360) });
  }
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
  function baseName(n){ return String(n || 'scan').replace(/\.[^.]+$/, ''); }

  var tool = {
    id: 'scan',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    capture: 'environment',
    needsPages: true,
    options: [
      { id: 'pages', type: 'pages', mode: 'order' },
      { id: 'enhance', type: 'checkbox', default: true },
      { id: 'mode', type: 'select', default: 'gray', choices: ['gray', 'color'], showIf: { enhance: true } }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib; opts = opts || {};
      if (opts.enhance == null) opts.enhance = true;
      var list = orderOf(files, opts, ctx);
      if (!list.length) throw fail(ctx, 'errorEmpty', { n: 1 });
      var doc = await PDFLib.PDFDocument.create();
      for (var i = 0; i < list.length; i++) {
        var f = files[list[i].file];
        if (ctx.progress) ctx.progress(i / (list.length + 1));
        var em = await embedImage(doc, f, ctx, opts);
        var rot = (em.rotate + list[i].rotate) % 360;
        var page = doc.addPage([A4[0], A4[1]]);
        place(PDFLib, page, em.img, rot, { x: MARGIN, y: MARGIN, w: A4[0] - 2 * MARGIN, h: A4[1] - 2 * MARGIN });
        if (ctx.progress) ctx.progress((i + 1) / (list.length + 1));
      }
      var bytes = await doc.save();
      if (ctx.progress) ctx.progress(1);
      var suffix = (ctx.t && ctx.t('resultName')) || 'scan';
      var name = baseName(files[list[0].file].name) + '-' + suffix + '.pdf';
      return { outputs: [ { name: name, blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
