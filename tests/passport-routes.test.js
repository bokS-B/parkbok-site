'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('../image/tools/passport-photo.js');

// These fixtures isolate byte/route policy. Real decoding is checked in Chromium separately.
function original(size, mime = 'image/jpeg') {
  const b = new Uint8Array(size);
  b.set(mime === 'image/png' ? [137,80,78,71,13,10,26,10] : [255,216,255,224]);
  return { name: 'original.jpg', type: 'image/jpeg', size, file: new Blob([b], { type: 'image/jpeg' }) };
}
function context(w = 1200, h = 1800, broken = false) {
  return { loadImage: async () => { if (broken) throw Error('decode'); return { width: w, height: h }; },
    release() {}, canvas() { throw Error('Original must not use canvas encoding'); },
    toBlob() { throw Error('Original must not be encoded'); },
    t: k => k, progress() {} };
}
test('the registry distinguishes print, inspection and in-person guidance', () => {
  assert.equal(tool.spec('us_passport').w, 600);
  assert.deepEqual(tool.spec('us_passport').inch, [2,2]);
  for (const id of ['uk_passport','us_passport_online','ca_passport']) assert.equal(tool.spec(id).mode, 'inspect');
  for (const id of ['mx_passport','ca_passport_print']) assert.equal(tool.spec(id).mode, 'info');
  for (const p of tool.PRESETS.filter(p => p.review === 'route-reviewed')) {
    assert.match(p.source, /^https:\/\//); assert.equal(p.reviewedOn, '2026-11-03'); assert.ok(p.channel);
  }
  assert.equal(tool.spec('kr_passport').unitBytes, 1024);
  assert.equal(tool.spec('jp_mynaportal').unitBytes, 1000);
});
test('original inspection checks inclusive minimum and maximum byte targets without producing files', async t => {
  for (const id of ['us_passport_online','uk_passport','ca_passport']) {
    const s = tool.spec(id), [min,max] = s.byteRange;
    for (const bytes of [min-1,min,min+1,max-1,max,max+1]) await t.test(id+' '+bytes, async () => {
      const f=original(bytes), before=await f.file.arrayBuffer();
      const result=await tool.run([f],{preset:id},context());
      assert.equal(result.inspection.checks.find(c=>c.key==='checkBytes').ok,bytes>=min&&bytes<=max);
      assert.deepEqual(result.outputs,[]);
      assert.deepEqual(await f.file.arrayBuffer(),before);
    });
  }
});
test('pixel ranges and the Canada portrait ratio are checked independently', async t => {
  for (const [id,w,h,ok] of [
    ['uk_passport',599,750,false],['uk_passport',600,749,false],['uk_passport',600,750,true],
    ['ca_passport',1200,1800,true],['ca_passport',3000,4500,true],['ca_passport',3002,4503,false],
    ['ca_passport',1200,1801,false],['ca_passport',1198,1797,false]
  ]) await t.test(`${id} ${w}x${h}`,async()=>{
    const result=await tool.run([original(250000)],{preset:id},context(w,h));
    assert.equal(result.inspection.checks.find(c=>c.key==='checkPixels').ok,ok);
  });
});
test('Canada inspection trusts the PNG signature over its JPG filename and MIME label',async()=>{
  const result=await tool.run([original(250000,'image/png')],{preset:'ca_passport'},context());
  assert.equal(result.inspection.checks[0].detail,'image/png');
  assert.equal(result.inspection.checks[0].ok,false);
});
test('unreadable dimensions cannot become a matching inspection',async()=>{
  const result=await tool.run([original(250000)],{preset:'us_passport_online'},context(0,0,true));
  assert.equal(result.inspection.checks.find(c=>c.key==='checkPixels').ok,false);
});
test('AVIF with an HEIF-compatible brand does not pass as an allowed HEIF',async()=>{
  const b=new Uint8Array(32); b.set(Buffer.from('ftypavif\0\0\0\0mif1'),4);
  assert.equal(await tool.imageMime(new Blob([b])),'image/avif');
});
test('info routes and restricted PNG/background requests reject before decoding',async()=>{
  for (const opts of [
    {preset:'mx_passport'}, {preset:'ca_passport_print'},
    {preset:'kr_passport',format:'png'}, {preset:'jp_mynaportal',format:'png'},
    {preset:'us_visa_dv',format:'png'}, {preset:'kr_passport',bg:'white'}
  ]) {
    await assert.rejects(tool.run([original(100)],opts,context()),/informationOnly|format|retouch/);
  }
});
test('application-specific guides are not inferred from a different measurement',()=>{
  for(const id of ['in_passport','jp_mynaportal','us_passport_online']) assert.deepEqual(tool.guides(tool.spec(id),null,k=>k),[]);
  assert.deepEqual(tool.spec('au_passport').head,[32/45,36/45]);
});
test('foreign byte target uses decimal while the existing custom/Korean unit stays binary',()=>{
  const b=new Blob([new Uint8Array(240001)]);
  assert.equal(tool.validateSize(b,240,1000).status,'failed');
  assert.equal(tool.validateSize(b,240,1024).status,'passed');
});
