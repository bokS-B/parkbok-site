// 도장·서명 배경 제거: 종이 바탕을 칸 단위로 추정하고, 잉크 세기(빨간 정도·어두운 정도·지정 색과의 거리)로 투명도를 정해 PNG 로 만든다.
// AI 없이 색 거리만 쓴다. 가장자리는 투명도 경사로 부드럽게 하고, 종이색을 걷어낸 잉크색으로 되돌려(언믹스) 흰 테두리를 남기지 않는다.
(function(){
  var SIDE_LIMIT = 16384, WORK_MAX = 4000, PREVIEW_MAX = 480, GRID = 16;
  function baseName(n){ return String(n || 'stamp').replace(/\.[^.]+$/, ''); }
  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
  function lum(r, g, b){ return 0.299 * r + 0.587 * g + 0.114 * b; }
  function hexRgb(hex){
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return [208, 2, 27];
    var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // 옵션 → { mode, color, tol(0~1), crop, size }
  function parseOpts(opts){
    opts = opts || {};
    var mode = /^(red|dark|custom)$/.test(opts.mode || '') ? opts.mode : 'red';
    var tol = parseFloat(opts.tolerance); if (!isFinite(tol)) tol = 50;
    var size = /^(original|300|500)$/.test(String(opts.size)) ? String(opts.size) : 'original';
    return { mode: mode, color: hexRgb(opts.color), tol: clamp(tol, 0, 100) / 100, crop: opts.crop !== false, size: size };
  }
  // 잉크 세기: 바탕색 p 대비 이 픽셀이 얼마나 잉크 쪽인지(0 이하 = 바탕). 단위는 대략 0~255.
  function inkScore(r, g, b, p, o){
    if (o.mode === 'red') return (r - Math.max(g, b)) - (p[0] - Math.max(p[1], p[2]));
    if (o.mode === 'dark') return lum(p[0], p[1], p[2]) - lum(r, g, b);
    // 지정 색: 바탕→잉크 축에 투영한 비율(0~1)을 255 단위로, 축에서 벗어난 색은 깎는다
    var k = o.color, ax = k[0] - p[0], ay = k[1] - p[1], az = k[2] - p[2], len2 = ax * ax + ay * ay + az * az || 1;
    var dx = r - p[0], dy = g - p[1], dz = b - p[2], a = (dx * ax + dy * ay + dz * az) / len2;
    var ex = dx - a * ax, ey = dy - a * ay, ez = dz - a * az, off = Math.sqrt(ex * ex + ey * ey + ez * ez);
    var limit = 40 + o.tol * 100;
    return a * 255 - Math.max(0, off - limit) * 3;
  }
  // 투명도 경사의 시작·끝(허용 범위가 클수록 옅은 잉크까지 잡는다)
  function ramp(o){
    var t0 = o.mode === 'red' ? 70 - o.tol * 60 : o.mode === 'dark' ? 95 - o.tol * 80 : 130 - o.tol * 110;
    return { t0: t0, t1: t0 + (o.mode === 'dark' ? 55 : 45) };
  }
  // 종이 바탕 추정: GRID×GRID 칸마다 밝은 쪽(상위 15%) 색을 바탕으로 보고, 잉크로 덮인 칸은 테두리 기준색과 이웃 칸으로 메운다.
  function paperGrid(d, w, h, o){
    var gw = Math.min(GRID, w), gh = Math.min(GRID, h), cells = new Array(gw * gh), step = Math.max(1, Math.floor(Math.sqrt(w * h / (gw * gh) / 400)));
    function sampleCell(x0, y0, x1, y1){
      var px = [];
      for (var y = y0; y < y1; y += step) for (var x = x0; x < x1; x += step) { var i = (y * w + x) * 4; if (d[i + 3] > 0) px.push(i); }
      if (!px.length) return null;
      px.sort(function(a, b){ return lum(d[b], d[b + 1], d[b + 2]) - lum(d[a], d[a + 1], d[a + 2]); });
      var n = Math.max(1, Math.round(px.length * 0.15)), s = [0, 0, 0];
      for (var k = 0; k < n; k++) { s[0] += d[px[k]]; s[1] += d[px[k] + 1]; s[2] += d[px[k] + 2]; }
      return [s[0] / n, s[1] / n, s[2] / n];
    }
    for (var gy = 0; gy < gh; gy++) for (var gx = 0; gx < gw; gx++)
      cells[gy * gw + gx] = sampleCell(Math.floor(gx * w / gw), Math.floor(gy * h / gh), Math.floor((gx + 1) * w / gw), Math.floor((gy + 1) * h / gh));
    // 기준색: 바깥 테두리 칸들의 밝기 중앙값 칸 (대개 종이)
    var edge = [];
    for (var j = 0; j < cells.length; j++) { var cx = j % gw, cy = (j / gw) | 0; if (cells[j] && (cx === 0 || cy === 0 || cx === gw - 1 || cy === gh - 1)) edge.push(cells[j]); }
    edge.sort(function(a, b){ return lum(a[0], a[1], a[2]) - lum(b[0], b[1], b[2]); });
    var ref = edge.length ? edge[edge.length >> 1] : [255, 255, 255], cut = ramp(o).t0 * 0.5;
    var ok = cells.map(function(c){ return !!c && inkScore(c[0], c[1], c[2], ref, o) < cut; });
    // 잉크 칸은 이웃 바탕 칸의 평균으로 번져 메운다(남으면 기준색)
    for (var pass = 0; pass < gw + gh; pass++) {
      var changed = false, next = ok.slice();
      for (var q = 0; q < cells.length; q++) {
        if (ok[q]) continue;
        var qx = q % gw, qy = (q / gw) | 0, acc = [0, 0, 0], n2 = 0;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
          var nx = qx + ox, ny = qy + oy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          var ni = ny * gw + nx; if (!ok[ni]) continue; acc[0] += cells[ni][0]; acc[1] += cells[ni][1]; acc[2] += cells[ni][2]; n2++;
        }
        if (n2) { cells[q] = [acc[0] / n2, acc[1] / n2, acc[2] / n2]; next[q] = true; changed = true; }
      }
      ok = next; if (!changed) break;
    }
    for (var z = 0; z < cells.length; z++) if (!ok[z]) cells[z] = ref;
    return { gw: gw, gh: gh, cells: cells, ref: ref };
  }
  // 칸 중심 사이를 쌍선형 보간한 바탕색 (그림자·조명 차이를 따라간다)
  function paperAt(pg, x, y, w, h, out){
    var fx = clamp((x + 0.5) * pg.gw / w - 0.5, 0, pg.gw - 1), fy = clamp((y + 0.5) * pg.gh / h - 0.5, 0, pg.gh - 1);
    var x0 = fx | 0, y0 = fy | 0, x1 = Math.min(pg.gw - 1, x0 + 1), y1 = Math.min(pg.gh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    var a = pg.cells[y0 * pg.gw + x0], b = pg.cells[y0 * pg.gw + x1], c = pg.cells[y1 * pg.gw + x0], e = pg.cells[y1 * pg.gw + x1];
    for (var k = 0; k < 3; k++) out[k] = (a[k] * (1 - tx) + b[k] * tx) * (1 - ty) + (c[k] * (1 - tx) + e[k] * tx) * ty;
    return out;
  }
  // RGBA 배열을 제자리에서 투명 도장으로 바꾼다. 내용 영역 {x,y,w,h} (없으면 null)을 돌려준다.
  // 투명도 = 덮인 정도(잉크 세기 ÷ 도장 속 진한 잉크 세기) × 문턱 경사. 덮인 정도로 언믹스해야 가장자리 색이 잉크색으로 돌아온다.
  function removeBackground(d, w, h, opts){
    var o = opts && opts.tol != null ? opts : parseOpts(opts), r = ramp(o), pg = paperGrid(d, w, h, o), p = [0, 0, 0];
    var span = r.t1 - r.t0, cols = new Uint32Array(w), rows = new Uint32Array(h), score = new Float32Array(w * h), hist = new Uint32Array(512), inkN = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var j = y * w + x, i = j * 4;
      if (!d[i + 3]) continue;
      var sc = inkScore(d[i], d[i + 1], d[i + 2], paperAt(pg, x, y, w, h, p), o); score[j] = sc;
      if (sc > r.t0) { hist[clamp(Math.round(sc), 0, 511)]++; inkN++; }
    }
    // 진한 잉크 세기: 문턱을 넘은 픽셀 중 상위 40% 지점(옅은 도장도 스스로를 기준으로 삼고, 인주 얼룩이 있는 속은 불투명하게 남긴다)
    var full = r.t1;
    if (inkN) { for (var acc = 0, b = 511; b >= 0; b--) { acc += hist[b]; if (acc >= inkN * 0.4) { full = Math.max(r.t1 * 0.8, b); break; } } }
    for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) {
      var j2 = y2 * w + x2, i2 = j2 * 4, a0 = d[i2 + 3] / 255;
      if (!a0) continue;
      var s2 = score[j2], cover = clamp(s2 / full, 0, 1), a = cover * clamp((s2 - r.t0) / span, 0, 1);
      if (a < 0.03) { d[i2 + 3] = 0; continue; }
      // 언믹스: 관측색 = c·잉크 + (1-c)·종이 → 잉크 = 종이 + (관측 - 종이)/c. 부분 투명 가장자리의 흰 테두리를 없앤다.
      if (cover < 1) { paperAt(pg, x2, y2, w, h, p); for (var k = 0; k < 3; k++) d[i2 + k] = clamp(Math.round(p[k] + (d[i2 + k] - p[k]) / Math.max(cover, 0.35)), 0, 255); }
      d[i2 + 3] = Math.round(a * a0 * 255);
      if (a >= 0.25) { cols[x2]++; rows[y2]++; }
    }
    // 내용 영역: 잉크 픽셀이 2개 이상인 열·행만 센다(점 하나짜리 티끌 무시)
    var minC = Math.max(2, Math.round(Math.min(w, h) / 500)), x0 = -1, x1 = -1, y0 = -1, y1 = -1;
    for (var cx = 0; cx < w; cx++) if (cols[cx] >= minC) { if (x0 < 0) x0 = cx; x1 = cx; }
    for (var cy = 0; cy < h; cy++) if (rows[cy] >= minC) { if (y0 < 0) y0 = cy; y1 = cy; }
    return x0 < 0 || y0 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // 자르기 영역(여백 6%)과 출력 크기 → { sx, sy, sw, sh, ow, oh, dx, dy, dw, dh }
  function layout(w, h, box, o){
    var sx = 0, sy = 0, sw = w, sh = h;
    if (o.crop && box) {
      var pad = Math.max(4, Math.round(Math.max(box.w, box.h) * 0.06));
      sx = Math.max(0, box.x - pad); sy = Math.max(0, box.y - pad);
      sw = Math.min(w, box.x + box.w + pad) - sx; sh = Math.min(h, box.y + box.h + pad) - sy;
    }
    if (o.size === 'original') return { sx: sx, sy: sy, sw: sw, sh: sh, ow: sw, oh: sh, dx: 0, dy: 0, dw: sw, dh: sh };
    // 정사각형: 내용을 가운데에 두고 긴 변을 맞춘다
    var n = Number(o.size), s = n / Math.max(sw, sh), dw = Math.max(1, Math.round(sw * s)), dh = Math.max(1, Math.round(sh * s));
    return { sx: sx, sy: sy, sw: sw, sh: sh, ow: n, oh: n, dx: Math.round((n - dw) / 2), dy: Math.round((n - dh) / 2), dw: dw, dh: dh };
  }
  // 이미지(또는 캔버스) → 작업 캔버스와 RGBA 데이터
  function grab(src, max, mk){
    var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, s = Math.min(1, max / Math.max(w, h));
    var c = mk(Math.round(w * s), Math.round(h * s)), g = c.getContext('2d');
    g.drawImage(src, 0, 0, c.width, c.height);
    return { canvas: c, g: g, img: g.getImageData(0, 0, c.width, c.height) };
  }
  function render(work, o, mk){
    var box = removeBackground(work.img.data, work.canvas.width, work.canvas.height, o);
    work.g.putImageData(work.img, 0, 0);
    var L = layout(work.canvas.width, work.canvas.height, box, o), out = mk(L.ow, L.oh);
    out.getContext('2d').drawImage(work.canvas, L.sx, L.sy, L.sw, L.sh, L.dx, L.dy, L.dw, L.dh);
    return { canvas: out, box: box };
  }
  function mkCanvas(w, h){ var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

  // ---------- 옵션 위젯 ----------
  var ui = {};
  var renderers = {
    // 잉크 색 지정(사용자 지정 모드). 미리보기를 누르면 그 색으로 바뀐다.
    'ink-color': function(o, row, api){
      var id = 'opt-' + o.id, lb = api.el('label', 'opt-label', api.optStr(o.id, 'label')); lb.htmlFor = id; row.appendChild(lb);
      var inp = api.el('input'); inp.type = 'color'; inp.id = id; inp.value = o.default; row.appendChild(inp);
      ui.setColor = function(hex){ inp.value = hex; };
      api.set(o.id, function(){ return inp.value; }, function(v){ inp.value = v; });
    },
    // 바둑판 위 실시간 미리보기 (첫 이미지, 긴 변 480px). 자르기는 점선 상자로만 보여 주어 누른 자리 = 원본 자리가 되게 한다.
    'stamp-preview': function(o, row, api){
      row.appendChild(api.el('span', 'opt-label', api.optStr(o.id, 'label')));
      var view = api.el('canvas', 'stamp-preview'); view.width = view.height = 1; row.appendChild(view);
      var src = null, pending = 0;
      function current(){ return parseOpts({ mode: api.getValue('mode'), color: api.getValue('color'), tolerance: api.getValue('tolerance'), crop: api.getValue('crop'), size: 'original' }); }
      function draw(){
        if (!src) return;
        // 슬라이더를 끄는 동안 연속 입력은 한 번으로 모은다
        clearTimeout(pending);
        pending = setTimeout(function(){
          var o2 = current(), work = grab(src, PREVIEW_MAX, mkCanvas), box = removeBackground(work.img.data, work.canvas.width, work.canvas.height, o2);
          view.width = work.canvas.width; view.height = work.canvas.height;
          var g = view.getContext('2d'); g.putImageData(work.img, 0, 0);
          if (o2.crop && box) {
            var L = layout(view.width, view.height, box, o2);
            g.save(); g.setLineDash([6, 4]); g.lineWidth = 1.5; g.strokeStyle = '#1a73e8'; g.strokeRect(L.sx + 0.75, L.sy + 0.75, L.sw - 1.5, L.sh - 1.5); g.restore();
          }
          work.canvas.width = work.canvas.height = 1;
        }, 30);
      }
      // 미리보기를 눌러 그 자리의 원본 색을 잉크 색으로 고른다(사용자 지정 모드로 바뀜)
      view.addEventListener('click', function(e){
        if (!src || api.busy()) return;
        var r = view.getBoundingClientRect(), g = src.getContext('2d');
        var x = clamp(Math.floor((e.clientX - r.left) / r.width * src.width), 0, src.width - 1), y = clamp(Math.floor((e.clientY - r.top) / r.height * src.height), 0, src.height - 1);
        var px = g.getImageData(x, y, 1, 1).data;
        var hex = '#' + [px[0], px[1], px[2]].map(function(v){ return ('0' + v.toString(16)).slice(-2); }).join('');
        if (ui.setColor) ui.setColor(hex);
        var custom = document.querySelector('input[name="opt-mode"][value="custom"]');
        if (custom) custom.checked = true;
        api.changed();
      });
      var f = api.files()[0];
      if (f) api.loadImage(f).then(function(img){ var c = api.scaleTo(img, PREVIEW_MAX, PREVIEW_MAX); if (c === img) { var d = api.dims(img); c = mkCanvas(d.w, d.h); c.getContext('2d').drawImage(img, 0, 0); } api.release(img); src = c; draw(); });
      api.onChange(draw);
      api.set(o.id, function(){ return null; });
    }
  };

  var tool = {
    id: 'stamp-background',
    accept: 'image/*',
    multiple: true,
    minFiles: 1,
    needsPages: false,
    invalidateOnEdit: true,
    renderers: renderers,
    options: [
      { id: 'preview', type: 'stamp-preview' },
      { id: 'mode', type: 'radio', choices: ['red', 'dark', 'custom'], default: 'red' },
      { id: 'color', type: 'ink-color', default: '#d0021b', showIf: { mode: 'custom' } },
      { id: 'tolerance', type: 'range', min: 0, max: 100, step: 1, default: 50 },
      { id: 'crop', type: 'checkbox', default: true },
      { id: 'size', type: 'select', choices: ['original', '300', '500'], default: 'original' }
    ],
    run: async function(files, opts, ctx){
      var o = parseOpts(opts), outputs = [], empty = 0, first = null;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        ctx.progress(i / files.length);
        var img = await ctx.loadImage(f), w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0) || w > SIDE_LIMIT || h > SIDE_LIMIT) { ctx.release(img); var e = new Error('errorTooBig'); e.key = w > 0 && h > 0 ? 'errorTooBig' : 'errorBroken'; throw e; }
        // 아주 큰 사진은 긴 변 4000px 로 줄여 처리한다(도장 크기로는 충분하고 메모리를 아낀다)
        var src = Math.max(w, h) > WORK_MAX ? ctx.scaleTo(img, WORK_MAX, WORK_MAX) : img;
        var work = grab(src, WORK_MAX, ctx.canvas);
        if (src !== img) src.width = src.height = 1;
        ctx.release(img);
        var res = render(work, o, ctx.canvas);
        work.canvas.width = work.canvas.height = 1;
        if (!res.box) empty++;
        var blob = await ctx.toBlob(res.canvas, 'image/png');
        if (!first) first = { w: res.canvas.width, h: res.canvas.height };
        res.canvas.width = res.canvas.height = 1;
        outputs.push({ name: baseName(f.name) + '-' + ctx.t('fileSuffix') + '.png', blob: blob, srcSize: f.size });
        ctx.progress((i + 1) / files.length);
      }
      var note = files.length === 1 ? ctx.t('noteSize', { w: first.w, h: first.h }) : ctx.t('noteCount', { n: files.length });
      if (empty) note += ' ' + ctx.t('noteEmpty', { n: empty });
      return { outputs: outputs, note: note };
    }
  };
  tool.parseOpts = parseOpts;
  tool.removeBackground = removeBackground;
  tool.layout = layout;
  if (typeof window !== 'undefined' && window.IMGT) window.IMGT.register(tool);
  if (typeof module !== 'undefined') module.exports = tool;
})();
