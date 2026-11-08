// PDF 압축: 문서 안의 이미지 XObject 를 찾아 JPEG 로 다시 인코딩·축소해 스트림을 바꿔 넣는다.
// JPEG(DCTDecode) 는 디코드→축소→재인코딩, Flate RGB/Gray 8bit 는 픽셀 복원→JPEG. 그 외(JPX·CCITT·인덱스·마스크)는 건드리지 않는다.
// 이미지 디코드·인코딩은 브라우저 canvas 가 필요하다. Node 에서는 encodeJpeg 가 없으므로 열거·비교 로직만 돈다(ctx.encodeJpeg 로 주입 가능).
(function(){
  var LEVELS = { low: { q: 0.8, max: 2500 }, medium: { q: 0.6, max: 1800 }, high: { q: 0.4, max: 1200 } };
  var TARGET_5MB = 5000000;
  var RAW_FILTERS = { FlateDecode: 1, Fl: 1, LZWDecode: 1, LZW: 1, ASCII85Decode: 1, A85: 1, ASCIIHexDecode: 1, AHx: 1, RunLengthDecode: 1, RL: 1 };

  function human(n){ if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'; }
  function baseName(n){ return String(n || 'file').replace(/\.[^.]+$/, ''); }
  function nameOf(P, obj){ return obj instanceof P.PDFName ? obj.decodeText() : null; }
  function numOf(P, obj){ return obj instanceof P.PDFNumber ? obj.asNumber() : null; }

  // 필터 목록을 이름 배열로. 없으면 [].
  function filtersOf(P, ctx, dict){
    var f = ctx.lookup(dict.get(P.PDFName.of('Filter')));
    if (!f) return [];
    if (f instanceof P.PDFName) return [f.decodeText()];
    if (f instanceof P.PDFArray) { var out = []; for (var i = 0; i < f.size(); i++) { var n = nameOf(P, ctx.lookup(f.get(i))); if (n) out.push(n); } return out; }
    return [];
  }
  // pdf-lib decompresses the stream but does not reverse image predictors.
  // Browsers also do not apply PDF-only decode parameters to embedded JPEGs.
  function hasDecodeParams(P, ctx, dict){
    var params = ctx.lookup(dict.get(P.PDFName.of('DecodeParms')));
    function isSet(value){
      var param = ctx.lookup(value);
      return !!param && param !== P.PDFNull && (!(param instanceof P.PDFDict) || param.keys().length > 0);
    }
    return params instanceof P.PDFArray ? params.asArray().some(isSet) : isSet(params);
  }
  // 색공간 → 채널 수(1 또는 3). 지원하지 않으면 0.
  function channelsOf(P, ctx, cs){
    cs = ctx.lookup(cs);
    if (cs instanceof P.PDFName) {
      var n = cs.decodeText();
      if (n === 'DeviceRGB' || n === 'RGB' || n === 'CalRGB') return 3;
      if (n === 'DeviceGray' || n === 'G' || n === 'CalGray') return 1;
      return 0;
    }
    if (cs instanceof P.PDFArray && cs.size() >= 2) {
      var fam = nameOf(P, ctx.lookup(cs.get(0)));
      if (fam === 'ICCBased') { var s = ctx.lookup(cs.get(1)); var N = s && s.dict ? numOf(P, ctx.lookup(s.dict.get(P.PDFName.of('N')))) : null; return N === 3 || N === 1 ? N : 0; }
      if (fam === 'CalRGB') return 3;
      if (fam === 'CalGray') return 1;
    }
    return 0;
  }

  // 문서의 이미지 XObject 를 훑어 처리 후보 목록을 만든다(Node 에서도 동작).
  function scan(P, doc){
    var ctx = doc.context, list = [], masks = {};
    var all = ctx.enumerateIndirectObjects();
    var i, ref, obj, dict;
    // 1차: 다른 이미지의 SMask 로 쓰이는 객체는 제외(SMask 는 DeviceGray 여야 하므로)
    for (i = 0; i < all.length; i++) {
      obj = all[i][1]; dict = obj && obj.dict;
      if (!dict || nameOf(P, dict.get(P.PDFName.of('Subtype'))) !== 'Image') continue;
      var sm = dict.get(P.PDFName.of('SMask'));
      if (sm instanceof P.PDFRef) masks[sm.toString()] = true;
    }
    for (i = 0; i < all.length; i++) {
      ref = all[i][0]; obj = all[i][1];
      if (!(obj instanceof P.PDFRawStream)) continue;
      dict = obj.dict;
      if (nameOf(P, dict.get(P.PDFName.of('Subtype'))) !== 'Image') continue;
      var rec = { ref: ref, stream: obj, size: obj.contents.length, width: numOf(P, ctx.lookup(dict.get(P.PDFName.of('Width')))), height: numOf(P, ctx.lookup(dict.get(P.PDFName.of('Height')))), kind: 'skip', why: '' };
      list.push(rec);
      if (masks[ref.toString()]) { rec.why = 'smask'; continue; }
      if (!rec.width || !rec.height) { rec.why = 'nosize'; continue; }
      var im = ctx.lookup(dict.get(P.PDFName.of('ImageMask')));
      if (im instanceof P.PDFBool && im.asBoolean()) { rec.why = 'imagemask'; continue; }
      var mask = ctx.lookup(dict.get(P.PDFName.of('Mask')));
      if (mask instanceof P.PDFArray) { rec.why = 'colorkey'; continue; }   // 색상 키 마스크는 정확한 픽셀값이 필요
      rec.hasSMask = dict.get(P.PDFName.of('SMask')) instanceof P.PDFRef;
      if (dict.get(P.PDFName.of('Decode'))) { rec.why = 'decode'; continue; }   // Decode 배열(반전 등)은 canvas 가 적용하지 못하므로 건너뜀
      if (dict.has(P.PDFName.of('F'))) { rec.why = 'external'; continue; }
      if (hasDecodeParams(P, ctx, dict)) { rec.why = 'decodeparms'; continue; }
      var filters = filtersOf(P, ctx, dict);
      if (filters.length === 1 && (filters[0] === 'DCTDecode' || filters[0] === 'DCT')) { rec.kind = 'jpeg'; continue; }
      var raw = filters.length > 0;
      for (var k = 0; k < filters.length; k++) if (!RAW_FILTERS[filters[k]]) raw = false;
      if (!raw) { rec.why = 'filter:' + (filters.join('+') || 'none'); continue; }
      if (numOf(P, ctx.lookup(dict.get(P.PDFName.of('BitsPerComponent')))) !== 8) { rec.why = 'bpc'; continue; }
      var ch = channelsOf(P, ctx, dict.get(P.PDFName.of('ColorSpace')));
      if (!ch) { rec.why = 'colorspace'; continue; }
      rec.kind = 'flate'; rec.channels = ch;
    }
    return list;
  }

  // 목표 크기: 긴 변이 max 를 넘으면 비율대로 줄인다. SMask 가 있으면 크기를 바꾸지 않는다.
  function target(rec, max){
    var w = rec.width, h = rec.height, s = Math.max(w, h) > max && !rec.hasSMask ? max / Math.max(w, h) : 1;
    return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
  }

  // 새 JPEG 바이트로 스트림을 교체하고 사전을 갱신한다.
  function replace(P, doc, rec, bytes, tw, th){
    var d = rec.stream.dict.clone(doc.context);
    d.set(P.PDFName.of('Filter'), P.PDFName.of('DCTDecode'));
    d.delete(P.PDFName.of('DecodeParms')); d.delete(P.PDFName.of('Decode'));
    d.set(P.PDFName.of('Width'), P.PDFNumber.of(tw)); d.set(P.PDFName.of('Height'), P.PDFNumber.of(th));
    d.set(P.PDFName.of('BitsPerComponent'), P.PDFNumber.of(8));
    d.set(P.PDFName.of('ColorSpace'), P.PDFName.of('DeviceRGB'));
    doc.context.assign(rec.ref, P.PDFRawStream.of(d, bytes));
  }

  // ---- 브라우저 전용: canvas 로 JPEG 디코드/인코딩 ----
  function browserEncoder(){
    if (typeof document === 'undefined' || typeof Blob === 'undefined') return null;
    function toJpeg(c, q){
      return new Promise(function(res, rej){
        c.toBlob(function(b){ if (!b) return rej(new Error('encode')); b.arrayBuffer().then(function(ab){ res(new Uint8Array(ab)); }, rej); }, 'image/jpeg', q);
      });
    }
    function decode(bytes){
      var blob = new Blob([bytes], { type: 'image/jpeg' });
      if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
      return new Promise(function(res, rej){
        var u = URL.createObjectURL(blob), img = new Image();
        img.onload = function(){ URL.revokeObjectURL(u); res(img); }; img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('decode')); };
        img.src = u;
      });
    }
    // src: { kind:'jpeg', bytes } | { kind:'rgba', data, width, height }  → Promise<Uint8Array>
    return function(src, tw, th, q){
      var out = document.createElement('canvas'); out.width = tw; out.height = th;
      var g = out.getContext('2d');
      if (src.kind === 'jpeg') {
        return decode(src.bytes).then(function(img){
          g.drawImage(img, 0, 0, tw, th);
          if (img.close) img.close();
          return toJpeg(out, q);
        });
      }
      var full = document.createElement('canvas'); full.width = src.width; full.height = src.height;
      full.getContext('2d').putImageData(new ImageData(src.data, src.width, src.height), 0, 0);
      if (tw === src.width && th === src.height) return toJpeg(full, q);
      g.drawImage(full, 0, 0, tw, th);
      return toJpeg(out, q);
    };
  }

  // Flate 샘플 → RGBA
  function toRgba(samples, w, h, ch){
    var n = w * h, out = new Uint8ClampedArray(n * 4), i, j = 0;
    if (ch === 3) { for (i = 0; i < n; i++) { out[j++] = samples[i * 3]; out[j++] = samples[i * 3 + 1]; out[j++] = samples[i * 3 + 2]; out[j++] = 255; } }
    else { for (i = 0; i < n; i++) { var v = samples[i]; out[j++] = v; out[j++] = v; out[j++] = v; out[j++] = 255; } }
    return out;
  }

  var koreanUI = typeof window !== 'undefined' && window.PDFT_TOOL && window.PDFT_TOOL.lang === 'ko';
  var tool = {
    id: 'compress',
    accept: '.pdf',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    options: koreanUI ? [
      { id: 'targetMb', type: 'select', default: 'none', choices: ['none', '5'] },
      { id: 'level', type: 'radio', default: 'medium', choices: ['low', 'medium', 'high'], showIf: { targetMb: 'none' } }
    ] : [
      { id: 'level', type: 'radio', default: 'medium', choices: ['low', 'medium', 'high'] }
    ],
    run: async function(files, opts, ctx){
      var P = ctx.pdfLib, f = files[0];
      var targeted = opts && String(opts.targetMb) === '5', before = f.bytes.length;
      var name = baseName(f.name) + '-' + ((ctx.t && ctx.t('resultName')) || 'compressed') + '.pdf';
      function result(bytes, key, replaced, extra){
        var vars = { bytes: bytes.length.toLocaleString('ko-KR'), size: human(before), before: human(before), after: human(bytes.length), pct: Math.round((1 - bytes.length / before) * 100) };
        var r = { outputs: [{ name: name, blob: new Blob([bytes], { type: 'application/pdf' }) }], note: ctx.t ? ctx.t(key, vars) : key, replaced: replaced, before: before, after: bytes.length };
        if (extra) { r.targetBytes = TARGET_5MB; r.targetStatus = extra; }
        return r;
      }
      if (targeted && before <= TARGET_5MB) {
        if (ctx.progress) ctx.progress(1);
        return result(f.bytes, 'noteTargetAlready', 0, 'already');
      }
      var encode = ctx.encodeJpeg || browserEncoder();
      var levels = targeted ? [LEVELS.low, LEVELS.medium, LEVELS.high, { q: 0.25, max: 800 }] : [LEVELS[opts && opts.level] || LEVELS.medium];
      var best = f.bytes, bestReplaced = 0, firstCand = 0, lastReplaced = 0;
      for (var pass = 0; pass < levels.length; pass++) {
        // Each pass starts with original bytes, never a previously compressed image.
        var doc = await P.PDFDocument.load(f.bytes, { ignoreEncryption: false, updateMetadata: false });
        var cand = scan(P, doc).filter(function(r){ return r.kind !== 'skip'; });
        if (!pass) firstCand = cand.length;
        var lv = levels[pass], replaced = 0;
        for (var i = 0; i < cand.length; i++) {
          var rec = cand[i];
          if (ctx.progress) ctx.progress((pass + (i / (cand.length + 1)) * 0.9) / levels.length);
          if (!encode) continue;
          var tg = target(rec, lv.max), bytes = null;
          try {
            if (rec.kind === 'jpeg') bytes = await encode({ kind: 'jpeg', bytes: rec.stream.contents }, tg.width, tg.height, lv.q);
            else {
              var samples = P.decodePDFRawStream(rec.stream).decode();
              if (samples.length < rec.width * rec.height * rec.channels) continue;
              bytes = await encode({ kind: 'rgba', data: toRgba(samples, rec.width, rec.height, rec.channels), width: rec.width, height: rec.height }, tg.width, tg.height, lv.q);
              samples = null;
            }
          } catch (e) { bytes = null; }
          if (!bytes || !bytes.length || bytes.length >= rec.size) continue;
          replace(P, doc, rec, bytes, tg.width, tg.height); replaced++;
        }
        if (ctx.progress) ctx.progress((pass + 0.92) / levels.length);
        lastReplaced = replaced;
        var out = replaced ? await doc.save({ useObjectStreams: true, updateFieldAppearances: false }) : null;
        if (out && out.length < best.length) { best = out; bestReplaced = replaced; }
        if (!targeted || best.length <= TARGET_5MB || !cand.length || !encode) break;
      }
      if (ctx.progress) ctx.progress(1);
      if (targeted) {
        var meetsTarget = best.length <= TARGET_5MB;
        return result(best, meetsTarget ? 'noteTargetMet' : 'noteTargetMissed', bestReplaced, meetsTarget ? 'met' : 'missed');
      }
      if (best.length >= before) return result(f.bytes, !firstCand ? 'noteNoImages' : 'noteSame', lastReplaced);
      return result(best, 'noteSaved', bestReplaced);
    }
  };
  tool.scan = scan;       // Node 테스트용
  tool.target = target;
  if (typeof window !== 'undefined' && window.PDFT) window.PDFT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
