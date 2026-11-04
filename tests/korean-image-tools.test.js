const test = require('node:test');
const assert = require('node:assert/strict');
const stamp = require('../image/tools/stamp-background.js');
const product = require('../image/tools/product-image-size.js');

// 크림색 종이(오른쪽으로 갈수록 살짝 어두워짐) 위 빨간 원 도장 + 검은 글씨 한 줄
function stampSheet(w, h){
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, shade = Math.round(20 * x / w);
    let c = [246 - shade, 240 - shade, 226 - shade];
    const r = Math.hypot(x - 60, y - 50);
    if (r < 25) c = [200, 30, 40];
    else if (r < 26) c = [223, 135, 133]; // 가장자리 반쯤 섞인 픽셀
    if (y >= 85 && y < 89 && x >= 10 && x < 110) c = [20, 20, 20];
    d.set([c[0], c[1], c[2], 255], i);
  }
  return d;
}

test('red stamp mode keeps red ink opaque and makes paper and black text transparent', () => {
  const w = 120, h = 100, d = stampSheet(w, h);
  const box = stamp.removeBackground(d, w, h, { mode: 'red', tolerance: 50 });
  const at = (x, y) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  assert.equal(at(60, 50)[3], 255);
  assert.deepEqual(at(60, 50).slice(0, 3), [200, 30, 40]);
  assert.equal(at(5, 5)[3], 0);
  assert.equal(at(115, 95)[3], 0);
  assert.equal(at(50, 86)[3], 0, 'black text dropped in red mode');
  const edge = at(85, 50);
  assert.ok(edge[3] > 0 && edge[3] < 255, 'edge pixel is semi-transparent');
  assert.ok(edge[1] < 110, 'edge colour is unmixed toward the ink, not left pale');
  assert.ok(box && box.x >= 33 && box.x <= 36 && box.w >= 49 && box.w <= 54, JSON.stringify(box));
});

test('dark ink mode keeps black text and custom colour picks a chosen ink', () => {
  const w = 120, h = 100;
  let d = stampSheet(w, h);
  stamp.removeBackground(d, w, h, { mode: 'dark', tolerance: 50 });
  assert.equal(d[((86 * w) + 50) * 4 + 3], 255);
  assert.equal(d[((5 * w) + 5) * 4 + 3], 0);
  d = stampSheet(w, h);
  stamp.removeBackground(d, w, h, { mode: 'custom', color: '#141414', tolerance: 50 });
  assert.equal(d[((86 * w) + 50) * 4 + 3], 255);
  assert.equal(d[((50 * w) + 60) * 4 + 3], 0, 'red is off the paper→black axis');
});

test('a textured, uneven red core stays mostly opaque', () => {
  const w = 120, h = 100, d = stampSheet(w, h);
  let seed = 7, opaque = 0, core = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 60, y - 50) < 24) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const i = (y * w + x) * 4, n = (seed >>> 24) % 60 - 30;
    d[i] = 200 + n; d[i + 1] = 30 + (n >> 1); d[i + 2] = 40 + (n >> 1);
  }
  stamp.removeBackground(d, w, h, { mode: 'red', tolerance: 50 });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 60, y - 50) < 24) { core++; if (d[(y * w + x) * 4 + 3] >= 230) opaque++; }
  assert.ok(opaque / core > 0.8, (opaque / core).toFixed(2));
});

test('blank paper yields no content box', () => {
  const w = 40, h = 40, d = new Uint8ClampedArray(w * h * 4).fill(250);
  assert.equal(stamp.removeBackground(d, w, h, { mode: 'red' }), null);
});

test('stamp layout pads the crop and centres it on a square canvas', () => {
  const o = stamp.parseOpts({ crop: true, size: '500' });
  const L = stamp.layout(1000, 800, { x: 400, y: 300, w: 200, h: 100 }, o);
  assert.equal(L.ow, 500); assert.equal(L.oh, 500);
  assert.equal(L.sx, 388); assert.equal(L.sw, 224);
  assert.equal(L.dw, 500); assert.ok(L.dy > 0 && L.dy + L.dh <= 500);
  const full = stamp.layout(300, 200, null, stamp.parseOpts({ crop: true, size: 'original' }));
  assert.deepEqual([full.ow, full.oh], [300, 200]);
  assert.equal(stamp.parseOpts({ mode: 'x', size: '42' }).mode, 'red');
  assert.equal(stamp.parseOpts({ size: '42' }).size, 'original');
});

test('product presets give exact canvas sizes for contain, cover and width-only', () => {
  const sq = product.plan(1600, 900, product.parseOpts({ preset: 'naver_main' }));
  assert.deepEqual([sq.ow, sq.oh, sq.dw, sq.dh, sq.dx, sq.dy], [1000, 1000, 1000, 563, 0, 219]);
  const cov = product.plan(1600, 900, product.parseOpts({ preset: 'coupang_main', fit: 'cover' }));
  assert.deepEqual([cov.ow, cov.oh, cov.sw, cov.sh], [1000, 1000, 900, 900]);
  assert.equal(cov.sx, 350);
  const det = product.plan(1200, 3000, product.parseOpts({ preset: 'coupang_detail' }));
  assert.deepEqual([det.ow, det.oh], [780, 1950]);
  assert.equal(product.plan(1720, 1000, product.parseOpts({ preset: 'detail_860' })).oh, 500);
  const m = product.plan(500, 500, product.parseOpts({ preset: 'st11_main', margin: 10 }));
  assert.deepEqual([m.dw, m.dx], [800, 100]);
});

test('product options: custom size, forced white for Coupang main, KB limits', () => {
  const c = product.parseOpts({ preset: 'custom', width: 640, height: 0 });
  assert.deepEqual([c.w, c.h, c.validSize], [640, 0, true]);
  assert.equal(product.parseOpts({ preset: 'custom', width: 0 }).validSize, false);
  assert.equal(product.parseOpts({ preset: 'coupang_main', bg: 'transparent' }).bg, 'white');
  assert.equal(product.parseOpts({ preset: 'naver_main', bg: 'transparent' }).bg, 'transparent');
  assert.equal(product.parseOpts({ preset: 'nope' }).preset, 'naver_main');
  assert.equal(product.parseOpts({ maxKb: 200 }).maxBytes, 204800);
  assert.equal(product.parseOpts({ maxKb: -1 }).validKb, false);
  for (const id of Object.keys(product.PRESETS)) if (id !== 'custom') assert.ok(product.PRESETS[id].w > 0, id);
});
