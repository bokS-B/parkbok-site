// 워터마크 넣기: 모든 쪽에 글자(Helvetica) 또는 PNG 이미지를 가운데 1개 또는 바둑판으로 그린다.
// 투명도는 ExtGState 하나를 만들어 모든 쪽이 공유한다(drawText 의 opacity 옵션은 호출마다 객체를 새로 만들어 큰 문서에서 파일이 불어난다).
(function(){
  function fail(ctx, key){ var e = new Error(ctx && ctx.t ? ctx.t(key) : key); e.key = key; return e; }

  // 쪽의 보이는 영역(CropBox)과 회전을 반영한 "화면 기준" 좌표계. page-numbers.js 와 같은 규칙.
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

  function hexColor(PDFLib, hex){
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    var n = m ? parseInt(m[1], 16) : 0x888888;
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  // data:image/png;base64,... → { bytes, png:true|false }. 브라우저(atob)·Node(Buffer) 둘 다.
  function decodeDataUrl(url){
    var m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(String(url || ''));
    if (!m) return null;
    var b64 = m[2], bytes;
    if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    else { var bin = atob(b64); bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    return { bytes: bytes, png: /png/i.test(m[1]) };
  }

  // 화면 기준 중심 (cx, cy) 에 w×h 상자를 각도 a(도) 로 돌려 놓을 때의 왼쪽 아래 원점
  function originFor(cx, cy, w, h, a){
    var rad = a * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    return { x: cx - (w / 2 * c - h / 2 * s), y: cy - (w / 2 * s + h / 2 * c) };
  }

  var tool = {
    id: 'watermark',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'type', type: 'radio', default: 'text', choices: ['text', 'image'] },
      { id: 'text', type: 'text', default: 'CONFIDENTIAL', maxlength: 80, showIf: { type: 'text' } },
      { id: 'image', type: 'signature', showIf: { type: 'image' } },
      { id: 'layout', type: 'radio', default: 'center', choices: ['center', 'tile'] },
      { id: 'rotation', type: 'select', default: '45', choices: ['0', '45', '-45'] },
      { id: 'size', type: 'range', default: 48, min: 12, max: 120, step: 1 },
      { id: 'opacity', type: 'range', default: 0.3, min: 0.05, max: 1, step: 0.05 },
      { id: 'color', type: 'color', default: '#888888', showIf: { type: 'text' } }
    ],
    run: async function(files, opts, ctx){
      var PDFLib = ctx.pdfLib;
      var f = files[0];
      if (!f) throw fail(ctx, 'errorEmpty');
      var isImage = opts.type === 'image';
      var text = String(opts.text == null ? '' : opts.text).trim();
      var img = isImage ? decodeDataUrl(opts.image) : null;
      if (isImage && !img) throw fail(ctx, 'errorImage');
      if (!isImage && !text) throw fail(ctx, 'errorText');
      var size = Math.min(120, Math.max(12, Number(opts.size) || 48));
      var opacity = Math.min(1, Math.max(0.05, Number(opts.opacity) || 0.3));
      var angle = Number(opts.rotation) || 0;
      var tile = opts.layout === 'tile';

      var doc = await PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: false, updateMetadata: false });
      var pages = doc.getPages(), count = pages.length;
      if (!count) throw fail(ctx, 'errorBroken');

      var font = null, color = null, embedded = null, ratio = 1;
      if (isImage) {
        try { embedded = img.png ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes); }
        catch (e) { throw fail(ctx, 'errorImage'); }
        ratio = embedded.height / embedded.width;
      } else {
        font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
        try { font.widthOfTextAtSize(text, size); } catch (e) { throw fail(ctx, 'errorText'); }   // 라틴 문자 밖(한글·한자 등)
        color = hexColor(PDFLib, opts.color);
      }

      // 투명도 상태 1개를 모든 쪽이 공유
      var gsKey = 'GSpbwm', gsRef = doc.context.register(doc.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }));
      var ops = { push: PDFLib.pushGraphicsState, pop: PDFLib.popGraphicsState, set: PDFLib.setGraphicsState };

      function drawAt(page, fr, cx, cy, w, h){
        var o = originFor(cx, cy, w, h, angle), p = fr.toPage(o.x, o.y), rot = PDFLib.degrees(angle + fr.rot);
        if (isImage) page.drawImage(embedded, { x: p.x, y: p.y, width: w, height: h, rotate: rot });
        else page.drawText(text, { x: p.x, y: p.y, size: size, font: font, color: color, rotate: rot });
      }

      for (var i = 0; i < count; i++) {
        var page = pages[i], fr = frame(page);
        var w, h;
        if (isImage) { w = fr.width * size / 100; h = w * ratio; if (h > fr.height * 0.9) { h = fr.height * 0.9; w = h / ratio; } }
        else { w = font.widthOfTextAtSize(text, size); h = size * 0.72; }

        page.node.setExtGState(PDFLib.PDFName.of(gsKey), gsRef);
        page.pushOperators(ops.push(), ops.set(gsKey));
        if (!tile) drawAt(page, fr, fr.width / 2, fr.height / 2, w, h);
        else {
          // 돌린 격자: u 는 글자 방향, v 는 그 수직 방향. 쪽 대각선을 덮을 만큼만 만들고 밖에 있는 칸은 건너뛴다.
          var cellW = isImage ? w * 1.4 : w + size * 2, cellH = isImage ? h + w * 0.4 : h + size * 2.5;
          var half = Math.sqrt(fr.width * fr.width + fr.height * fr.height) / 2;
          var ni = Math.ceil(half / cellW), nj = Math.ceil(half / cellH);
          var rad = angle * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad), pad = (w + h) / 2;
          for (var j = -nj; j <= nj; j++) for (var k = -ni; k <= ni; k++) {
            var u = k * cellW + (j % 2 ? cellW / 2 : 0), v = j * cellH;
            var cx = fr.width / 2 + u * c - v * s, cy = fr.height / 2 + u * s + v * c;
            if (cx < -pad || cx > fr.width + pad || cy < -pad || cy > fr.height + pad) continue;
            drawAt(page, fr, cx, cy, w, h);
          }
        }
        page.pushOperators(ops.pop());
        if (ctx.progress && (i % 10 === 0 || i === count - 1)) ctx.progress((i + 1) / (count + 1));
        if (i % 25 === 24) await new Promise(function(res){ setTimeout(res, 0); });
      }

      var bytes = await doc.save({ useObjectStreams: true });
      if (ctx.progress) ctx.progress(1);
      var suffix = (ctx.t && ctx.t('resultName') !== 'resultName') ? ctx.t('resultName') : 'watermark';
      var name = String(f.name || 'document').replace(/\.[^.]+$/, '') + '-' + suffix + '.pdf';
      return { outputs: [ { name: name, blob: new Blob([bytes], { type: 'application/pdf' }) } ], note: '' };
    }
  };
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
