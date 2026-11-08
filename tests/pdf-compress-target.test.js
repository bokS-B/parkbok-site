'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('../assets/vendor/pdf-lib.min.js');
const compress = require('../pdf/tools/compress.js');
const original = new Uint8Array(5000100).fill(7);
function fixture(sizes) {
  let loads = 0; const qualities = [], progress = [], notes = [];
  const pdfLib = { ...PDFLib, PDFDocument: { load: async bytes => {
    assert.equal(bytes, original); const index = loads++;
    const doc = await PDFLib.PDFDocument.create();
    doc.context.register(doc.context.stream(new Uint8Array(128), {
      Type:'XObject', Subtype:'Image', Filter:'DCTDecode', Width:1600, Height:1200, BitsPerComponent:8, ColorSpace:'DeviceRGB'
    }));
    doc.save = async () => new Uint8Array(sizes[index]); return doc;
  } } };
  const ctx = { pdfLib, encodeJpeg: async (src, w, h, q) => { qualities.push(q); assert.equal(src.bytes.length,128); return new Uint8Array(16); }, progress: p => progress.push(p), t: (key, vars) => { if (vars) notes.push({key, vars}); return key; } };
  return { ctx, qualities, progress, notes, get loads() { return loads; } };
}
async function run(f) { return compress.run([{ name:'large.pdf', bytes:original }], {targetMb:'5'}, f.ctx); }
test('target keeps the original unchanged at the inclusive 5 MB boundary', async () => {
  const bytes = new Uint8Array(5000000).fill(4), f = fixture([]);
  const r = await compress.run([{name:'fits.pdf', bytes}], {targetMb:'5'}, f.ctx);
  assert.equal(f.loads, 0); assert.equal(r.targetStatus,'already'); assert.equal(r.note,'noteTargetAlready');
  assert.equal(f.notes[0].vars.bytes,'5,000,000'); assert.deepEqual(new Uint8Array(await r.outputs[0].blob.arrayBuffer()), bytes);
});
test('target tries profiles from the original and stops at the first passing result', async () => {
  const f = fixture([5000001, 5000000, 10]), r = await run(f);
  assert.equal(r.targetStatus,'met'); assert.equal(r.after,5000000); assert.equal(r.note,'noteTargetMet');
  assert.equal(f.notes[0].vars.bytes,'5,000,000'); assert.deepEqual(f.qualities,[0.8,0.6]); assert.equal(f.loads,2);
  assert.ok(f.progress.every((p,i,a) => i === 0 || p >= a[i-1]));
});
test('unmet target returns smallest output, and never returns more than the original', async () => {
  for (const [sizes, expected] of [[[5000090,5000050,5000070,5000080],5000050],[[5000200,5000300,5000400,5000500],5000100]]) {
    const f = fixture(sizes), r = await run(f);
    assert.equal(r.targetStatus,'missed'); assert.equal(r.note,'noteTargetMissed'); assert.equal(r.after,expected);
    assert.equal(f.notes[0].vars.bytes,expected.toLocaleString('ko-KR')); assert.equal(f.loads,4);
    if (expected === original.length) assert.deepEqual(new Uint8Array(await r.outputs[0].blob.arrayBuffer()),original);
  }
});
