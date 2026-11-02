// EXIF 보기·수정·삭제: JPEG 의 메타데이터(APP1 Exif)를 표로 보여 주고 날짜·작성자·설명을 고치거나 GPS·전체를 지운다.
// 이미지는 다시 인코딩하지 않는다. SOS(FFDA) 앞 헤더 구간만 piexif(/assets/vendor/piexif.js, 지연 로드)로 고치고 그 뒤 바이트는 그대로 잇는다.
(function(){
  var VENDOR = '/assets/vendor/piexif.js';
  var W = typeof window !== 'undefined' ? window : {};
  var T = (W.IMGT_TOOL && W.IMGT_TOOL.strings) || {};
  // 0th IFD / Exif IFD / GPS IFD 태그 번호 (piexif.ImageIFD / ExifIFD / GPSIFD 와 같다)
  var TAG = { ImageDescription: 270, Make: 271, Model: 272, Orientation: 274, Software: 305, DateTime: 306, Artist: 315, ExifTag: 34665, GPSTag: 34853,
    ExposureTime: 33434, FNumber: 33437, ISO: 34855, DateTimeOriginal: 36867, DateTimeDigitized: 36868, FocalLength: 37386, PixelX: 40962, PixelY: 40963, Focal35: 41989, LensModel: 42036,
    GPSLatRef: 1, GPSLat: 2, GPSLonRef: 3, GPSLon: 4 };
  var FIELDS = ['dateOriginal', 'dateModified', 'dateDigitized', 'make', 'model', 'lens', 'exposure', 'aperture', 'iso', 'focal', 'size', 'orientation', 'software', 'artist', 'description', 'gps'];

  // 오류: json strings.errors.<key> → userMessage. 없으면 공통 errorGeneric
  function fail(ctx, key){
    var e = new Error(key); e.key = null;
    e.userMessage = (T.errors && T.errors[key]) || (ctx && ctx.t ? ctx.t('errorGeneric') : key);
    return e;
  }
  var libP = null;
  function ensurePiexif(){
    if (window.piexif) return Promise.resolve(window.piexif);
    if (libP) return libP;
    libP = new Promise(function(res, rej){
      var s = document.createElement('script'); s.src = VENDOR; s.async = true;
      s.onload = function(){ window.piexif ? res(window.piexif) : rej(new Error('piexif')); };
      s.onerror = function(){ libP = null; rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return libP;
  }

  // ---------- JPEG 바이트 ----------
  // SOS(FFDA) 마커 위치. JPEG 가 아니거나 구조가 깨졌으면 -1
  function findSOS(b){
    if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return -1;
    var i = 2, n = b.length;
    while (i + 3 < n) {
      if (b[i] !== 0xFF) return -1;
      var m = b[i + 1];
      if (m === 0xFF) { i++; continue; }                      // 채움 바이트
      if (m === 0xDA) return i;
      if (m === 0xD9) return -1;
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { i += 2; continue; }   // 길이 없는 마커
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return -1;
  }
  // 헤더 구간의 세그먼트 목록 [{marker, start, end, id}] (id: APP 세그먼트 식별 문자열 앞부분)
  function segments(b, sos){
    var out = [], i = 2;
    while (i < sos) {
      if (b[i] !== 0xFF) break;
      var m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { out.push({ marker: m, start: i, end: i + 2, id: '' }); i += 2; continue; }
      var end = i + 2 + ((b[i + 2] << 8) | b[i + 3]), id = '';
      for (var k = i + 4; k < Math.min(end, i + 34); k++) { if (b[k] === 0) break; id += String.fromCharCode(b[k]); }
      out.push({ marker: m, start: i, end: Math.min(end, sos), id: id });
      i = end;
    }
    return out;
  }
  function isExifSeg(s){ return s.marker === 0xE1 && s.id === 'Exif'; }
  function bin(b, from, to){ var s = '', CH = 8192; to = Math.min(to, b.length); for (var i = from; i < to; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + CH, to))); return s; }
  function bytes(str){ var u = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255; return u; }
  // 헤더 구간 → piexif 가 읽을 수 있는 "SOI…SOS 마커" 문자열
  function headStr(b, sos){ return bin(b, 0, sos) + '\xff\xda'; }
  // 파일 → { bytes, sos, head, exif(피엑시프 dict 또는 null) }
  function readJpeg(file, ctx){
    return file.arrayBuffer().then(function(buf){
      var b = new Uint8Array(buf), sos = findSOS(b);
      if (sos < 0) throw fail(ctx, 'notJpeg');
      var head = headStr(b, sos), exif = null;
      try { exif = window.piexif.load(head); } catch (e) { exif = null; }
      return { bytes: b, sos: sos, head: head, exif: exif };
    });
  }
  // 새 헤더 바이트 + 원본 SOS 이후 바이트. 이미지 데이터는 손대지 않는다.
  function joinBlob(headBytes, src){ return new Blob([headBytes, src.bytes.subarray(src.sos)], { type: 'image/jpeg' }); }
  // Orientation 하나만 담은 최소 Exif APP1 (전체 삭제 후 사진이 돌아가지 않게)
  function orientationApp1(o){
    var p = 'Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08\x00\x01\x01\x12\x00\x03\x00\x00\x00\x01\x00' + String.fromCharCode(o & 255) + '\x00\x00\x00\x00\x00\x00';
    return '\xff\xe1' + String.fromCharCode((p.length + 2) >> 8, (p.length + 2) & 255) + p;
  }
  // 전체 삭제: APP1(Exif·XMP)·APP13(IPTC/Photoshop)·COM 제거. APP0 JFIF·APP2 ICC·APP14 Adobe 등 표시에 필요한 것은 둔다.
  function stripAll(src){
    var segs = segments(src.bytes, src.sos), keep = [], orient = 1;
    if (src.exif && src.exif['0th'] && src.exif['0th'][TAG.Orientation] >= 2 && src.exif['0th'][TAG.Orientation] <= 8) orient = src.exif['0th'][TAG.Orientation];
    segs.forEach(function(s){ if (!(s.marker === 0xE1 || s.marker === 0xED || s.marker === 0xFE)) keep.push(src.bytes.subarray(s.start, s.end)); });
    var parts = [src.bytes.subarray(0, 2)];
    if (orient > 1) parts.push(bytes(orientationApp1(orient)));
    var i = 0;
    if (keep.length && keep[0][1] === 0xE0) { parts.splice(1, 0, keep[0]); i = 1; }   // JFIF APP0 는 맨 앞에
    for (; i < keep.length; i++) parts.push(keep[i]);
    return new Blob(parts.concat([src.bytes.subarray(src.sos)]), { type: 'image/jpeg' });
  }
  // 수정한 dict → 헤더 교체. dump 가 실패하면 piexif 가 모르는 태그·큰 썸네일을 빼고 한 번 더 시도한다.
  function writeDict(src, dict, ctx){
    var px = window.piexif, s;
    try { s = px.dump(dict); }
    catch (e) {
      ['0th', 'Exif', 'GPS', 'Interop', '1st'].forEach(function(k){
        var ifd = dict[k]; if (!ifd) return;
        var known = px.TAGS[k === '0th' || k === '1st' ? 'Image' : k] || {};
        Object.keys(ifd).forEach(function(tg){ if (!known[tg]) delete ifd[tg]; });
      });
      if (dict.thumbnail && dict.thumbnail.length > 64000) dict.thumbnail = null;
      try { s = px.dump(dict); } catch (e2) { throw fail(ctx, 'write'); }
    }
    var out;
    try { out = px.insert(s, src.head); } catch (e3) { throw fail(ctx, 'write'); }
    return joinBlob(bytes(out.slice(0, -2)), src);
  }

  // ---------- 값 표시 ----------
  // EXIF Ascii 필드는 바이트열이다. piexif 는 글자 하나를 바이트 하나로 다루므로 UTF-8 로 넣고 읽을 때 되돌린다.
  function utf8enc(s){ try { return bin(new TextEncoder().encode(s), 0, Infinity); } catch (e) { return unescape(encodeURIComponent(s)); } }
  function utf8dec(b){ try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes(b)); } catch (e) { return b; } }
  function str(v){ if (v == null) return ''; return utf8dec(String(v)).replace(/\u0000+$/g, '').trim(); }
  function rat(v){ if (Array.isArray(v) && v.length === 2) return v[1] ? v[0] / v[1] : 0; return typeof v === 'number' ? v : NaN; }
  function fmtExposure(v){ var r = rat(v); if (!(r > 0)) return ''; return r >= 1 ? (Math.round(r * 10) / 10) + ' s' : '1/' + Math.round(1 / r) + ' s'; }
  function fmtF(v){ var r = rat(v); return r > 0 ? 'f/' + (Math.round(r * 10) / 10) : ''; }
  function fmtMm(v){ var r = rat(v); return r > 0 ? (Math.round(r * 10) / 10) + ' mm' : ''; }
  function fmtIso(v){ if (Array.isArray(v)) v = v[0]; return v > 0 ? String(v) : ''; }
  function dms(arr, ref){
    if (!Array.isArray(arr) || arr.length < 3) return NaN;
    var d = rat(arr[0]) + rat(arr[1]) / 60 + rat(arr[2]) / 3600;
    if (!isFinite(d)) return NaN;
    return (ref === 'S' || ref === 'W') ? -d : d;
  }
  // "YYYY:MM:DD HH:MM:SS" ↔ datetime-local "YYYY-MM-DDTHH:MM:SS"
  function exifToLocal(s){ var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(str(s)); return m ? m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00') : ''; }
  function localToExif(s){ var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || ''); return m ? m[1] + ':' + m[2] + ':' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + (m[6] || '00') : ''; }
  function showDate(s){ var m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(str(s)); if (!m) return str(s); return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + (m[6] !== '00' ? ':' + m[6] : ''); }
  // dict → 표에 보일 {field: text}. 없는 항목은 넣지 않는다.
  function summarize(dict, rec){
    var z = (dict && dict['0th']) || {}, x = (dict && dict.Exif) || {}, g = (dict && dict.GPS) || {}, out = {};
    var ori = { '1': '', '2': 'mirror', '3': '180', '4': 'mirror', '5': 'mirror', '6': '90', '7': 'mirror', '8': '270' };
    out.dateOriginal = showDate(x[TAG.DateTimeOriginal]);
    out.dateModified = showDate(z[TAG.DateTime]);
    out.dateDigitized = showDate(x[TAG.DateTimeDigitized]);
    out.make = str(z[TAG.Make]); out.model = str(z[TAG.Model]); out.lens = str(x[TAG.LensModel]);
    out.exposure = fmtExposure(x[TAG.ExposureTime]); out.aperture = fmtF(x[TAG.FNumber]); out.iso = fmtIso(x[TAG.ISO]);
    out.focal = fmtMm(x[TAG.FocalLength]);
    if (out.focal && x[TAG.Focal35] > 0) out.focal += ' (35mm ' + x[TAG.Focal35] + ' mm)';
    var w = x[TAG.PixelX] || (rec && rec.width), h = x[TAG.PixelY] || (rec && rec.height);
    out.size = w > 0 && h > 0 ? w + ' × ' + h : '';
    var o = z[TAG.Orientation]; out.orientation = o >= 1 && o <= 8 ? (ori[o] ? o + ' · ' + (T.orient && T.orient[ori[o]] || ori[o]) : String(o)) : '';
    out.software = str(z[TAG.Software]); out.artist = str(z[TAG.Artist]); out.description = str(z[TAG.ImageDescription]);
    var lat = dms(g[TAG.GPSLat], str(g[TAG.GPSLatRef])), lon = dms(g[TAG.GPSLon], str(g[TAG.GPSLonRef]));
    out.gps = isFinite(lat) && isFinite(lon) ? lat.toFixed(6) + ', ' + lon.toFixed(6) : '';
    return out;
  }
  function hasGps(dict){ return !!(dict && dict.GPS && Object.keys(dict.GPS).length); }

  // ---------- 옵션 → 적용할 변경 ----------
  function parseOpts(opts){
    opts = opts || {};
    var d = opts.date || {};
    function dt(v){ return /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(v || '') ? v : localToExif(v); }   // 위젯은 EXIF 형식, 직접 호출은 datetime-local 형식도 받는다
    return {
      mode: /^(keep|gps|all)$/.test(opts.mode || '') ? opts.mode : 'keep',
      dateOriginal: dt(d.original), dateModified: dt(d.modified), dateDigitized: dt(d.digitized),
      artist: String(opts.artist == null ? '' : opts.artist).trim(), description: String(opts.description == null ? '' : opts.description).trim()
    };
  }
  // 스타일은 이 도구만 쓰므로 여기서 한 번 넣는다 (토큰만 써서 다크 모드 자동)
  var CSS = '.opt-exif-table,.opt-exif-date{flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:8px}' +
    '.exif-table{width:100%;border-collapse:collapse;font-size:var(--fs-small);line-height:var(--lh-small)}' +
    '.exif-table th,.exif-table td{padding:7px 8px;border-top:1px solid var(--line);text-align:left;vertical-align:top}' +
    '.exif-table tr:first-child th,.exif-table tr:first-child td{border-top:0}' +
    '.exif-table th{color:var(--muted);font-weight:var(--fw-medium);width:34%;white-space:nowrap}' +
    '.exif-table td{color:var(--ink);word-break:break-word;font-variant-numeric:tabular-nums}' +
    '.exif-cap{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:var(--fs-caption)}.exif-cap b{color:var(--ink);font-weight:var(--fw-medium);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
    '.exif-date-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}.exif-date-row[hidden]{display:none}.exif-date-row .lb{color:var(--muted);min-width:110px}' +
    '.exif-date-row input[type=datetime-local]{font:inherit;font-size:var(--fs-small);padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);max-width:100%}' +
    ':root[data-theme=dark] .exif-date-row input{color-scheme:dark}@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .exif-date-row input{color-scheme:dark}}' +
    '@media (max-width:767.98px){.exif-table th{width:40%}.exif-date-row .lb{min-width:0;flex-basis:100%}}';
  function injectCss(){ if (document.getElementById('exif-css')) return; var s = document.createElement('style'); s.id = 'exif-css'; s.textContent = CSS; document.head.appendChild(s); }

  // 첫 파일의 메타데이터. 한 번 읽어 표와 날짜 입력이 같이 쓴다.
  var firstP = null, firstFile = null;
  function loadFirst(api){
    var f = api.files()[0]; if (!f) return Promise.resolve(null);
    if (firstP && firstFile === f.file) return firstP;
    firstFile = f.file;
    firstP = ensurePiexif().then(function(){ return readJpeg(f.file, null); }).then(function(src){ return { rec: f, exif: src.exif }; }, function(e){ return { rec: f, exif: null, error: e && e.userMessage ? e.userMessage : '' }; });
    return firstP;
  }

  var tool = {
    id: 'exif',
    accept: '.jpg,.jpeg,image/jpeg',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    options: [
      { id: 'exif', type: 'exif-table' },
      { id: 'mode', type: 'radio', choices: ['keep', 'gps', 'all'], default: 'keep' },
      { id: 'date', type: 'exif-date', showIf: { mode: ['keep', 'gps'] } },
      { id: 'artist', type: 'text', maxlength: 120, showIf: { mode: ['keep', 'gps'] } },
      { id: 'description', type: 'text', maxlength: 300, showIf: { mode: ['keep', 'gps'] } }
    ],
    renderers: {
      // 메타데이터 표 (읽기 전용)
      'exif-table': function(o, row, api){
        injectCss();
        var cap = api.el('div', 'exif-cap'), tb = api.el('table', 'exif-table'), body = api.el('tbody');
        var name = api.el('b'), st = api.el('span', null, api.t('loadingLib'));
        cap.appendChild(name); cap.appendChild(st); tb.appendChild(body); row.appendChild(cap); row.appendChild(tb);
        api.set(o.id, function(){ return null; });
        loadFirst(api).then(function(r){
          if (!r) return;
          name.textContent = r.rec.name; name.title = r.rec.name;
          if (r.error) { st.textContent = r.error; tb.hidden = true; return; }   // JPEG 이 아니면 표 대신 안내만
          var v = summarize(r.exif, r.rec), n = 0;
          FIELDS.forEach(function(k){
            if (!v[k]) return;
            var tr = api.el('tr'); tr.appendChild(api.el('th', null, api.optStr(o.id, null, k))); tr.appendChild(api.el('td', null, v[k])); body.appendChild(tr); n++;
          });
          st.textContent = n ? '' : api.optStr(o.id, null, 'none');
          if (!n) tb.hidden = true;
        });
      },
      // 날짜·시간 하나로 세 날짜를 같이 바꾸기 / 따로 바꾸기 토글
      'exif-date': function(o, row, api){
        injectCss();
        var head = api.el('div', 'exif-date-row');
        head.appendChild(api.el('label', 'opt-label', api.optStr(o.id, 'label')));
        var one = api.el('input'); one.type = 'datetime-local'; one.step = '1'; one.id = 'opt-date';
        head.querySelector('label').htmlFor = one.id;
        head.appendChild(one);
        var tg = api.el('label', 'check'), cb = api.el('input'); cb.type = 'checkbox';
        tg.appendChild(cb); tg.appendChild(document.createTextNode(api.optStr(o.id, null, 'each')));
        head.appendChild(tg); row.appendChild(head);
        var keys = ['original', 'modified', 'digitized'], inputs = {}, rows = {}, init = { original: '', modified: '', digitized: '' };
        keys.forEach(function(k){
          var r = api.el('div', 'exif-date-row'); r.hidden = true;
          var lb = api.el('label', 'lb', api.optStr(o.id, null, k)), inp = api.el('input'); inp.type = 'datetime-local'; inp.step = '1'; inp.id = 'opt-date-' + k; lb.htmlFor = inp.id;
          r.appendChild(lb); r.appendChild(inp); row.appendChild(r); inputs[k] = inp; rows[k] = r;
        });
        function toggle(){ var each = cb.checked; one.disabled = each; keys.forEach(function(k){ rows[k].hidden = !each; }); }
        cb.addEventListener('change', toggle);
        loadFirst(api).then(function(r){
          if (!r || !r.exif) return;
          var z = r.exif['0th'] || {}, x = r.exif.Exif || {};
          init.original = exifToLocal(x[TAG.DateTimeOriginal]); init.modified = exifToLocal(z[TAG.DateTime]); init.digitized = exifToLocal(x[TAG.DateTimeDigitized]);
          keys.forEach(function(k){ inputs[k].value = init[k]; });
          one.value = init.original || init.modified || init.digitized;
        });
        // 값: 바뀐 것만 (바꾸지 않은 필드는 빈 문자열)
        // 브라우저는 초가 00 이면 value 에서 초를 빼므로 EXIF 형식으로 바꿔 비교한다
        function diff(a, b){ a = localToExif(a); return a && a !== localToExif(b) ? a : ''; }
        api.set(o.id, function(){
          var v = { original: '', modified: '', digitized: '' };
          if (cb.checked) keys.forEach(function(k){ v[k] = diff(inputs[k].value, init[k]); });
          else { var d = diff(one.value, init.original || init.modified || init.digitized); if (d) keys.forEach(function(k){ v[k] = d; }); }
          return v;
        });
      }
    },
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], notes = [], changed = 0, gpsGone = 0;
      await ensurePiexif().catch(function(){ throw fail(ctx, 'lib'); });
      var edits = o.mode !== 'all' && !!(o.dateOriginal || o.dateModified || o.dateDigitized || o.artist || o.description);
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        ctx.progress(i / files.length);
        var src = await readJpeg(f.file, ctx), blob = null;
        if (o.mode === 'all') { blob = stripAll(src); changed++; }
        else {
          var dict = src.exif, dropGps = o.mode === 'gps' && hasGps(dict);
          if (dropGps || edits) {
            if (!dict) throw fail(ctx, 'read');
            dict['0th'] = dict['0th'] || {}; dict.Exif = dict.Exif || {};
            if (dropGps) { dict.GPS = {}; delete dict['0th'][TAG.GPSTag]; gpsGone++; }
            if (o.dateOriginal) dict.Exif[TAG.DateTimeOriginal] = o.dateOriginal;
            if (o.dateDigitized) dict.Exif[TAG.DateTimeDigitized] = o.dateDigitized;
            if (o.dateModified) dict['0th'][TAG.DateTime] = o.dateModified;
            if (o.artist) dict['0th'][TAG.Artist] = utf8enc(o.artist);
            if (o.description) dict['0th'][TAG.ImageDescription] = utf8enc(o.description);
            blob = writeDict(src, dict, ctx); changed++;
          } else blob = f.file;   // 바꿀 것이 없으면 원본 그대로
        }
        outputs.push({ name: f.name, blob: blob, srcSize: f.size });
        ctx.progress((i + 1) / files.length);
      }
      if (o.mode === 'all') notes.push(ctx.t('noteAll'));
      else {
        if (o.dateOriginal && o.dateOriginal === o.dateModified && o.dateOriginal === o.dateDigitized) notes.push(ctx.t('noteDate', { label: ctx.t('noteDates'), value: showDate(o.dateOriginal) }));
        else {
          if (o.dateOriginal) notes.push(ctx.t('noteDate', { label: optLabel('original'), value: showDate(o.dateOriginal) }));
          if (o.dateModified) notes.push(ctx.t('noteDate', { label: optLabel('modified'), value: showDate(o.dateModified) }));
          if (o.dateDigitized) notes.push(ctx.t('noteDate', { label: optLabel('digitized'), value: showDate(o.dateDigitized) }));
        }
        if (o.artist) notes.push(ctx.t('noteArtist', { value: o.artist }));
        if (o.description) notes.push(ctx.t('noteDesc'));
        if (o.mode === 'gps') notes.push(gpsGone ? ctx.t('noteGps') : ctx.t('noteNoGps'));
        if (!changed) notes = [ctx.t('noteNone')];
      }
      return { outputs: outputs, note: notes.filter(Boolean).join(' · ') };
    }
  };
  function optLabel(k){ var d = T.options && T.options.date; return d && d.choices && d.choices[k] || k; }
  tool.parseOpts = parseOpts;
  tool.findSOS = findSOS;
  tool.summarize = summarize;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
