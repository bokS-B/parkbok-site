// 여권·증명사진 규격 맞추기: 사진 한 장 위에서 규격 비율로 자르고(머리·눈·턱 가이드), 규격 픽셀로 2단계 축소한 뒤
// JPG 품질을 이진 탐색해 용량 제한에 맞추고 JFIF 밀도(dpi)를 써 넣는다. PNG 는 pHYs 로 dpi 를 넣는다. EXIF 는 없다(캔버스 출력).
(function(){
  var LANG = (typeof window !== 'undefined' && window.IMGT_TOOL && window.IMGT_TOOL.lang) || 'en';
  var MAX_SIDE = 6000, Q_HI = 0.95, Q_LO = 0.3, Q_DEFAULT = 0.92;
  var HEAD_DEFAULT = [0.70, 0.80], EYE_DEFAULT = [0.40, 0.45];   // ICAO 일반값: 머리 70~80%, 눈 위에서 40~45% (아래에서 55~60%)
  // 프리셋: mm(인쇄 치수) 또는 px(업로드 치수), kb(용량 상한, 0=없음), head(머리 높이 비율), eye(눈 위치, 위에서 비율)
  var PRESETS = [
    { id: 'kr_passport', mm: [35, 45], kb: 500, head: [0.71, 0.80] },
    { id: 'kr_id_3x4', mm: [30, 40], kb: 0 },
    { id: 'kr_id_half', mm: [25, 30], kb: 0 },
    { id: 'kr_id_35x45', mm: [35, 45], kb: 0, head: [0.71, 0.80] },
    { id: 'kr_driver', mm: [35, 45], kb: 250, head: [0.71, 0.80] },
    { id: 'us_passport', px: [600, 600], kb: 0, head: [0.50, 0.69], eye: [0.31, 0.44] },
    { id: 'us_visa_dv', px: [600, 600], kb: 240, head: [0.50, 0.69], eye: [0.31, 0.44] },
    { id: 'cn_visa', px: [385, 560], kb: 120, head: [0.58, 0.69], eye: [0.38, 0.46] },
    { id: 'cn_1inch', mm: [25, 35], kb: 0 },
    { id: 'cn_2inch', mm: [35, 49], kb: 0 },
    { id: 'jp_passport', mm: [35, 45], kb: 0, head: [0.71, 0.80] },
    { id: 'jp_mynaportal', px: [600, 730], kb: 600, head: [0.71, 0.80] },
    { id: 'jp_mynumber', px: [700, 900], kb: 7000, head: [0.71, 0.80] },
    { id: 'jp_resume', mm: [30, 40], kb: 0 },
    { id: 'eu_schengen', mm: [35, 45], kb: 0, head: [0.70, 0.80] },
    { id: 'uk_passport', px: [630, 810], kb: 0, head: [0.64, 0.76] },
    { id: 'ca_passport', px: [1200, 1800], kb: 5120, head: [0.45, 0.50] },
    { id: 'in_passport', px: [630, 810], kb: 250, head: [0.80, 0.85] },
    { id: 'in_oci', px: [600, 600], kb: 200, head: [0.75, 0.85] },
    { id: 'au_passport', mm: [35, 45], kb: 0, head: [0.64, 0.80] },
    { id: 'br_passport', mm: [50, 70], kb: 0, head: [0.70, 0.80] },
    { id: 'mx_passport', mm: [35, 45], kb: 0, head: [0.70, 0.80] },
    { id: 'es_dni', mm: [26, 32], kb: 0 },
    { id: 'custom' }
  ];
  var DEFAULT_BY_LANG = { ko: 'kr_passport', en: 'us_passport', zh: 'cn_visa', ja: 'jp_passport', es: 'es_dni', pt: 'br_passport', de: 'eu_schengen', fr: 'eu_schengen' };
  var BY_ID = {}; PRESETS.forEach(function(p){ BY_ID[p.id] = p; });

  function baseName(n){ return String(n || 'photo').replace(/\.[^.]+$/, ''); }
  function mmToPx(mm, dpi){ return Math.max(1, Math.round(mm / 25.4 * dpi)); }
  function num(v, d){ v = parseFloat(v); return isNaN(v) || !isFinite(v) ? d : v; }
  // 오류: 도구 json strings.<lang>.errors.<key> → 없으면 공통 errorGeneric
  function fail(ctx, key){
    var errs = ctx && ctx.t ? ctx.t('errors') : null;
    var msg = errs && typeof errs === 'object' ? errs[key] : null;
    var e = new Error(key);
    if (msg) e.userMessage = msg; else e.key = 'errorGeneric';
    return e;
  }
  // 프리셋 + 사용자 지정 값 → 규격 { id, w, h(px), dpi, mm:[w,h]|null, kb, head, eye, ok }
  function spec(presetId, custom){
    var p = BY_ID[presetId] || BY_ID[DEFAULT_BY_LANG[LANG]] || PRESETS[0];
    if (p.id === 'custom') {
      var c = custom || {}, unit = c.unit === 'px' ? 'px' : 'mm', dpi = Math.round(Math.min(1200, Math.max(72, num(c.dpi, 300))));
      var w = num(c.w, 0), h = num(c.h, 0), pw = unit === 'mm' ? mmToPx(w, dpi) : Math.round(w), ph = unit === 'mm' ? mmToPx(h, dpi) : Math.round(h);
      var ok = w > 0 && h > 0 && pw >= 16 && ph >= 16 && pw <= MAX_SIDE && ph <= MAX_SIDE;
      return { id: 'custom', w: pw, h: ph, dpi: dpi, mm: unit === 'mm' ? [w, h] : null, kb: 0, head: HEAD_DEFAULT, eye: EYE_DEFAULT, ok: ok };
    }
    var W = p.px ? p.px[0] : mmToPx(p.mm[0], 300), H = p.px ? p.px[1] : mmToPx(p.mm[1], 300);
    return { id: p.id, w: W, h: H, dpi: 300, mm: p.mm || null, kb: p.kb || 0, head: p.head || HEAD_DEFAULT, eye: p.eye || EYE_DEFAULT, ok: true };
  }
  // 규격 한 줄 요약: "35×45 mm · 413×531 px · 300 dpi · ≤500 KB"
  function specLine(s){
    var parts = [];
    if (s.mm) parts.push(s.mm[0] + '×' + s.mm[1] + ' mm');
    parts.push(s.w + '×' + s.h + ' px'); parts.push(s.dpi + ' dpi');
    if (s.kb) parts.push('≤' + s.kb + ' KB');
    return parts.join(' · ');
  }
  // 선택 사각형 안의 가이드(비율 좌표): 얼굴 타원 + 정수리·눈·턱 선. 라벨은 도구 문구 guideCrown/guideEyes/guideChin.
  function guides(s, rect, t){
    var head = s.head, hm = (head[0] + head[1]) / 2;
    var top = Math.max(0.04, (1 - hm) * 0.35), chin = top + hm;
    var eyeY = s.eye ? (s.eye[0] + s.eye[1]) / 2 : top + hm * 0.45;
    var ratio = rect && rect.h > 0 ? rect.w / rect.h : s.w / s.h;
    var ow = Math.min(0.9, 0.72 * hm / ratio);
    return [
      { x: (1 - ow) / 2, y: top, w: ow, h: hm, cls: 'oval' },
      { x: 0.03, y: top, w: 0.94, h: 0, cls: 'line', text: t('guideCrown') },
      { x: 0.03, y: eyeY, w: 0.94, h: 0, cls: 'line', text: t('guideEyes') },
      { x: 0.03, y: chin, w: 0.94, h: 0, cls: 'line', text: t('guideChin') }
    ];
  }
  // 옵션 → 정리된 값
  function parseOpts(opts){
    opts = opts || {};
    var s = spec(opts.preset, opts.custom), r = opts.crop, rect = null;
    if (r && r.w > 0 && r.h > 0) rect = { x: Math.max(0, r.x || 0), y: Math.max(0, r.y || 0), w: r.w, h: r.h };
    var kb = opts.maxKb == null ? s.kb : Math.max(0, Math.round(num(opts.maxKb, s.kb)));
    return { spec: s, rect: rect, format: opts.format === 'png' ? 'png' : 'jpg', bg: opts.bg === 'white' ? 'white' : 'keep', maxKb: kb };
  }

  // ---------- 바이트 수정: JFIF 밀도 / PNG pHYs ----------
  function setJpegDpi(u8, dpi){
    if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return u8;
    var hi = (dpi >> 8) & 255, lo = dpi & 255;
    if (u8[2] === 0xFF && u8[3] === 0xE0 && u8[6] === 0x4A && u8[7] === 0x46 && u8[8] === 0x49 && u8[9] === 0x46 && u8[10] === 0) {
      u8[13] = 1; u8[14] = hi; u8[15] = lo; u8[16] = hi; u8[17] = lo;   // units=1(dpi), X, Y
      return u8;
    }
    var app0 = [0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 1, hi, lo, hi, lo, 0, 0];
    var out = new Uint8Array(u8.length + app0.length);
    out.set(u8.subarray(0, 2), 0); out.set(app0, 2); out.set(u8.subarray(2), 2 + app0.length);
    return out;
  }
  var CRC_T = null;
  function crc32(b, from, to){
    if (!CRC_T) { CRC_T = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = from; i < to; i++) crc = CRC_T[(crc ^ b[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function setPngDpi(u8, dpi){
    if (u8.length < 33 || u8[0] !== 0x89 || u8[1] !== 0x50) return u8;
    var ppm = Math.round(dpi / 0.0254), ch = new Uint8Array(21), dv = new DataView(ch.buffer);
    dv.setUint32(0, 9); ch[4] = 0x70; ch[5] = 0x48; ch[6] = 0x59; ch[7] = 0x73;   // 'pHYs'
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); ch[16] = 1; dv.setUint32(17, crc32(ch, 4, 17));
    var out = new Uint8Array(u8.length + 21);
    out.set(u8.subarray(0, 33), 0); out.set(ch, 33); out.set(u8.subarray(33), 54);   // IHDR 바로 뒤
    return out;
  }
  function bytesOf(blob){ return blob.arrayBuffer().then(function(b){ return new Uint8Array(b); }); }

  // ---------- 화질: 2단계 축소 / 배경 밝게 ----------
  // 원본의 rect 영역을 (w,h) 로 그린다. 2배 이상 줄일 때는 절반씩 단계 축소해 선명도를 지킨다.
  function cropScale(ctx, img, rect, w, h){
    var cur = img, sx = rect.x, sy = rect.y, cw = rect.w, ch = rect.h;
    while (cw >= w * 2 && ch >= h * 2) {
      var nw = Math.max(w, Math.floor(cw / 2)), nh = Math.max(h, Math.floor(ch / 2));
      var c = ctx.canvas(nw, nh); c.getContext('2d').drawImage(cur, sx, sy, cw, ch, 0, 0, nw, nh);
      if (cur !== img) cur.width = cur.height = 1;
      cur = c; sx = 0; sy = 0; cw = nw; ch = nh;
    }
    var out = ctx.canvas(w, h), g = out.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.drawImage(cur, sx, sy, cw, ch, 0, 0, w, h);
    if (cur !== img) cur.width = cur.height = 1;
    return out;
  }
  // 가장자리(위·좌·우 띠)의 중간값을 흰 점으로 올리는 단순 레벨 보정. 배경이 어두우면(중간값<120) 건드리지 않는다.
  function brightenBg(c){
    var g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), px = d.data;
    var band = Math.max(2, Math.round(Math.min(w, h) * 0.06)), rs = [], gs = [], bs = [];
    function take(x, y){ var i = (y * w + x) * 4; rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); }
    var step = Math.max(1, Math.floor(w * h / 60000));
    for (var y = 0; y < h; y += step) for (var x = 0; x < w; x++) { if (y < band || x < band || x >= w - band) { if (y < h * 0.6) take(x, y); } }
    if (rs.length < 16) return false;
    function med(a){ a.sort(function(p, q){ return p - q; }); return a[Math.floor(a.length / 2)]; }
    var mr = med(rs), mg = med(gs), mb = med(bs);
    if ((mr + mg + mb) / 3 < 120 || Math.min(mr, mg, mb) >= 250) return false;
    var fr = 255 / Math.max(170, mr), fg = 255 / Math.max(170, mg), fb = 255 / Math.max(170, mb);
    for (var i = 0; i < px.length; i += 4) {
      px[i] = Math.min(255, px[i] * fr); px[i + 1] = Math.min(255, px[i + 1] * fg); px[i + 2] = Math.min(255, px[i + 2] * fb);
    }
    g.putImageData(d, 0, 0);
    return true;
  }
  // JPG 품질 이진 탐색: budget(바이트) 이하가 되는 가장 높은 품질. 못 맞추면 가장 낮은 품질 결과와 over=true.
  async function encodeJpeg(ctx, c, dpi, budget){
    async function enc(q){ var u8 = await bytesOf(await ctx.toBlob(c, 'image/jpeg', q)); return setJpegDpi(u8, dpi); }
    var best = await enc(Q_DEFAULT);
    if (!budget || best.length <= budget) return { bytes: best, over: false };
    var lo = Q_LO, hi = Q_DEFAULT, fit = null;
    for (var i = 0; i < 7; i++) {
      var q = (lo + hi) / 2, u8 = await enc(q);
      if (u8.length <= budget) { fit = u8; lo = q; } else hi = q;
      if (hi - lo < 0.02) break;
    }
    if (fit) return { bytes: fit, over: false };
    var low = await enc(Q_LO);
    return { bytes: low, over: low.length > budget };
  }

  // ---------- 옵션 위젯 (tool.renderers) ----------
  var ui = {};
  function mkLabel(api, o, forId){ var lb = api.el('label', 'opt-label', api.optStr(o.id, 'label')); if (forId) lb.htmlFor = forId; return lb; }
  function numInput(api, id, val, min, max, step, width){
    var inp = api.el('input'); inp.type = 'number'; inp.id = id; inp.value = val; inp.min = min; inp.max = max; inp.step = step; inp.inputMode = 'decimal';
    inp.style.width = width || '76px';
    return inp;
  }
  var renderers = {
    // 규격 선택 + 규격 요약 한 줄(+ 불확실 프리셋 메모)
    preset: function(o, row, api){
      var id = 'opt-' + o.id; row.appendChild(mkLabel(api, o, id));
      var sel = api.el('select'); sel.id = id; sel.style.maxWidth = '100%';
      (o.choices || []).forEach(function(c){ var op = api.el('option', null, api.optStr(o.id, null, c)); op.value = c; if (c === o.default) op.selected = true; sel.appendChild(op); });
      row.appendChild(sel);
      var line = api.el('small', 'opt-help'); row.appendChild(line);
      var notes = (window.IMGT_TOOL && window.IMGT_TOOL.strings && window.IMGT_TOOL.strings.options && window.IMGT_TOOL.strings.options.preset && window.IMGT_TOOL.strings.options.preset.notes) || {};
      var last = sel.value, lastRatio = -1;   // -1: 아직 첫 계산 전
      function refresh(){
        var s = spec(sel.value, api.getValue('custom')), q = s.ok ? s.w / s.h : 0;
        line.textContent = (s.ok ? specLine(s) : '') + (notes[sel.value] ? (s.ok ? ' — ' : '') + notes[sel.value] : '');
        if (sel.value !== last) { last = sel.value; if (ui.setKb) ui.setKb(s.kb); }
        // 비율이 바뀌면(잘못된 값 0 에서 되돌아온 경우 포함) 자르기 상자를 새 비율의 최대 크기로 다시 놓는다 (엔진의 맞춤은 줄이기만 하므로)
        if (q && lastRatio >= 0 && Math.abs(q - lastRatio) > 1e-6) setTimeout(function(){ var b = document.querySelector('[data-opt="crop"] .rect-bar .btn'); if (b) b.click(); }, 0);
        lastRatio = q;
      }
      ui.refreshPreset = refresh;
      api.set(o.id, function(){ return sel.value; });
      api.onChange(refresh);
      setTimeout(refresh, 0);
    },
    // 사용자 지정: 가로 × 세로 [mm|px] · dpi
    'custom-size': function(o, row, api){
      row.classList.add('opt-number');
      row.appendChild(mkLabel(api, o, 'opt-custom-w'));
      var wrap = api.el('span', 'num-wrap');
      var w = numInput(api, 'opt-custom-w', 35, 1, MAX_SIDE, 'any'), h = numInput(api, 'opt-custom-h', 45, 1, MAX_SIDE, 'any');
      w.setAttribute('aria-label', api.optStr(o.id, null, 'w')); h.setAttribute('aria-label', api.optStr(o.id, null, 'h'));
      var unit = api.el('select'); unit.setAttribute('aria-label', 'mm / px');
      ['mm', 'px'].forEach(function(u){ var op = api.el('option', null, api.optStr(o.id, null, u)); op.value = u; unit.appendChild(op); });
      wrap.appendChild(w); wrap.appendChild(api.el('span', 'num-unit', '×')); wrap.appendChild(h); wrap.appendChild(unit);
      row.appendChild(wrap);
      var wrap2 = api.el('span', 'num-wrap');
      var dpi = numInput(api, 'opt-custom-dpi', 300, 72, 1200, 1, '70px'); dpi.setAttribute('aria-label', 'dpi');
      wrap2.appendChild(dpi); wrap2.appendChild(api.el('span', 'num-unit', api.optStr(o.id, null, 'dpi')));
      row.appendChild(wrap2);
      // 타이핑 중간값(예: 5, 50, 500)으로 비율이 요동치지 않도록 input 은 막고 change(확정) 만 엔진에 올린다
      [w, h, dpi].forEach(function(i){ i.addEventListener('input', function(e){ e.stopPropagation(); }); });
      api.set(o.id, function(){ return { unit: unit.value, w: num(w.value, 0), h: num(h.value, 0), dpi: num(dpi.value, 300) }; });
    },
    // 숨은 옵션: 현재 규격의 가로/세로 비율 (자르기 상자가 ratioFrom 으로 읽는다)
    ratio: function(o, row, api){
      row.hidden = true;
      api.set(o.id, function(){ var s = spec(api.getValue('preset'), api.getValue('custom')); return s.ok ? s.w / s.h : 0; });
    },
    // 용량 상한(KB). 프리셋을 바꾸면 기본값으로 따라간다. 0 = 제한 없음.
    kb: function(o, row, api){
      row.classList.add('opt-number');
      var id = 'opt-' + o.id; row.appendChild(mkLabel(api, o, id));
      var s0 = spec(api.getValue('preset') || o.presetDefault, null);
      var inp = numInput(api, id, s0.kb, 0, 20480, 10, '84px'), wrap = api.el('span', 'num-wrap');
      wrap.appendChild(inp); wrap.appendChild(api.el('span', 'num-unit', 'KB')); row.appendChild(wrap);   // help 는 엔진이 붙인다
      ui.setKb = function(v){ inp.value = v; };
      api.set(o.id, function(){ return Math.max(0, Math.round(num(inp.value, 0))); }, function(v){ inp.value = v; });
    }
  };

  var tool = {
    id: 'passport-photo',
    accept: 'image/*',
    multiple: false,
    minFiles: 1,
    needsPages: false,
    layout: 'split',   // 자르기 편집기 왼쪽 + 나머지 옵션 오른쪽 (데스크톱)
    options: [
      { id: 'preset', type: 'preset', choices: PRESETS.map(function(p){ return p.id; }), default: DEFAULT_BY_LANG[LANG] || 'us_passport' },
      { id: 'custom', type: 'custom-size', showIf: { preset: 'custom' } },
      { id: 'ratio', type: 'ratio' },
      { id: 'crop', type: 'crop', ratioFrom: 'ratio', guide: function(rect, getValue){ return guides(spec(getValue('preset'), getValue('custom')), rect, window.IMGT.t); } },
      // 저장 옵션(group:'save'): 모바일에서는 자르기 뒤에 접힌 채로 놓인다
      { id: 'format', type: 'select', choices: ['jpg', 'png'], default: 'jpg', group: 'save' },
      { id: 'maxKb', type: 'kb', showIf: { format: 'jpg' }, presetDefault: DEFAULT_BY_LANG[LANG] || 'us_passport', group: 'save' },
      { id: 'bg', type: 'select', choices: ['keep', 'white'], default: 'keep', group: 'save' }
    ],
    renderers: renderers,
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), s = o.spec, f = files[0];
      if (!s.ok) throw fail(ctx, 'custom');
      var img = await ctx.loadImage(f);
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var r = o.rect || { x: 0, y: 0, w: iw, h: ih };
      r.w = Math.min(r.w, iw - r.x); r.h = Math.min(r.h, ih - r.y);
      if (r.w < 8 || r.h < 8) { ctx.release(img); throw fail(ctx, 'rect'); }
      ctx.progress(0.2);
      var c = cropScale(ctx, img, r, s.w, s.h);
      ctx.release(img);
      if (o.bg === 'white') brightenBg(c);
      ctx.progress(0.5);
      var bytes, over = false, mime, ext;
      if (o.format === 'png') { bytes = setPngDpi(await bytesOf(await ctx.toBlob(c, 'image/png')), s.dpi); mime = 'image/png'; ext = 'png'; }
      else { var e = await encodeJpeg(ctx, c, s.dpi, o.maxKb * 1024); bytes = e.bytes; over = e.over; mime = 'image/jpeg'; ext = 'jpg'; }
      c.width = c.height = 1;
      ctx.progress(1);
      var blob = new Blob([bytes], { type: mime });
      var note = s.w + '×' + s.h + 'px · ' + ctx.human(blob.size) + ' · ' + s.dpi + 'dpi' + (s.mm ? ' (' + s.mm[0] + '×' + s.mm[1] + 'mm)' : '');
      if (over) note += ' — ' + ctx.t('noteOver', { kb: o.maxKb });
      if (r.w < s.w * 0.67 || r.h < s.h * 0.67) note += ' — ' + ctx.t('noteUpscale');
      return { outputs: [{ name: baseName(f.name) + '-passport-' + s.w + 'x' + s.h + '.' + ext, blob: blob, srcSize: f.size }], note: note };
    }
  };
  tool.parseOpts = parseOpts;
  tool.spec = spec;
  tool.guides = guides;
  tool.setJpegDpi = setJpegDpi;
  tool.setPngDpi = setPngDpi;
  tool.PRESETS = PRESETS;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
