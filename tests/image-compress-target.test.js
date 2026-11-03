'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('../image/tools/image-compress.js');
const copy = require('../image/src/tools/image-compress.json');

// Encoder stubs isolate the real run pipeline: format selection, quality search,
// original-file fallback and final Blob validation. Root also checks real browser exports.
function file(name = 'photo.jpg', size = 10000, type = 'image/jpeg', alpha = false) {
  const bytes = new Uint8Array(size).fill(3);
  return { name, type, size, file: new Blob([bytes], { type }), alpha };
}
function fixture(encode = () => 1800, width = 1200, height = 800) {
  const calls = { loads: [], encodes: [], scales: [], releases: [], fills: [] };
  let current;
  function canvas(w, h, alpha = false) {
    return { width: w, height: h, alpha,
      getContext() { return {
        drawImage() {},
        fillRect() { calls.fills.push([w,h]); },
        getImageData() { return { data: new Uint8ClampedArray([0,0,0,alpha ? 0 : 255]) }; }
      }; }
    };
  }
  const ctx = {
    async loadImage(f) { current = f; calls.loads.push(f.name); return { naturalWidth: width, naturalHeight: height, alpha: f.alpha }; },
    scaleTo(img, maxW, maxH) { const s = Math.min(1, maxW / width, maxH / height); calls.scales.push([maxW,maxH]); return canvas(Math.round(width*s),Math.round(height*s),img.alpha); },
    canvas, release(img) { calls.releases.push(img); }, progress() {}, human(n) { return n+' B'; },
    t(k, v) { return k==='noteSize' ? '' : k + (v ? ' '+JSON.stringify(v) : ''); },
    async toBlob(c, mime, quality) {
      const call = { file: current.name, mime, quality, width: c.width, height: c.height };
      calls.encodes.push(call);
      let out = encode(call); if (typeof out === 'number') out = { size: out };
      return new Blob([new Uint8Array(out.size).fill(out.byte === undefined ? 37 : out.byte)], { type: out.type || mime });
    }
  };
  return { ctx, calls };
}
function check(result, index, actual, limit, status) {
  assert.equal(result.outputs[index].blob.size,actual);
  assert.deepEqual(result.outputs[index].validation.size,{status,actualBytes:actual,limitBytes:limit,unitBytes:1024});
}

test('zero target retains one default-quality encode, bytes and ordinary output semantics', async () => {
  const {ctx,calls}=fixture();
  const r=await tool.run([file()],{level:'medium',format:'keep',maxKb:0},ctx);
  assert.equal(calls.encodes.length,1); assert.equal(calls.encodes[0].quality,.7);
  assert.equal(r.outputs[0].blob.type,'image/jpeg'); assert.equal(r.outputs[0].name,'photo.jpg');
  assert.deepEqual(new Uint8Array(await r.outputs[0].blob.arrayBuffer()),new Uint8Array(1800).fill(37));
  check(r,0,1800,null,'not_requested'); assert.equal(r.warning,null); assert.equal(r.note,'');
});
test('missing, empty and zero are the only ordinary disabled-target values', async t => {
  for(const maxKb of [undefined,null,'',0,'0'])await t.test(String(maxKb),async()=>{
    const {ctx,calls}=fixture();const r=await tool.run([file()],{maxKb},ctx);
    assert.equal(r.warning,null);assert.equal(r.validation.size.status,'not_requested');assert.equal(calls.encodes.length,1);
  });
});
test('actual final Blob sizes obey the inclusive1024-byte KB boundary', async t => {
  for(const bytes of [1023,1024,1025])await t.test(bytes+' B',async()=>{
    const {ctx}=fixture(()=>bytes);const r=await tool.run([file()],{maxKb:1},ctx);
    check(r,0,bytes,1024,bytes<=1024?'passed':'failed');
    assert.equal(!!r.warning,bytes>1024);
  });
});
for(const format of ['jpg','webp'])test(format+' target searches quality but never changes the level dimensions',async()=>{
  const {ctx,calls}=fixture(({quality})=>quality>.4?2200:900,6000,4000);
  const r=await tool.run([file()],{level:'high',format,maxKb:1},ctx);
  check(r,0,900,1024,'passed');assert.equal(r.warning,null);
  assert.ok(calls.encodes.length>2);
  assert.ok(calls.encodes.every(c=>c.width===1600&&c.height===1067&&c.quality>=.3&&c.quality<=.5));
  assert.equal(r.outputs[0].blob.type,format==='jpg'?'image/jpeg':'image/webp');
});
test('unattainable JPG target returns the smallest attempted encoding with an explicit warning',async()=>{
  const {ctx,calls}=fixture(({quality})=>quality===.3?1500:2500);
  const r=await tool.run([file()],{maxKb:1},ctx);
  check(r,0,1500,1024,'failed');assert.equal(calls.encodes.length,2);
  assert.ok(r.warning.message.includes('"n":1'));assert.ok(r.warning.downloadText);
});
test('transparent PNG Keep does not fake success by converting to JPEG or WebP',async()=>{
  const {ctx,calls}=fixture(()=>4200);
  const r=await tool.run([file('transparent.png',10000,'image/png',true)],{format:'keep',maxKb:1},ctx);
  check(r,0,4200,1024,'failed');assert.equal(r.outputs[0].blob.type,'image/png');
  assert.equal(calls.encodes.length,1);assert.equal(calls.encodes[0].quality,undefined);assert.ok(r.warning);
});
test('explicit JPG conversion keeps its format request even when the PNG original already fits',async()=>{
  const f=file('transparent.png',500,'image/png',true),{ctx,calls}=fixture(()=>1500);
  const r=await tool.run([f],{format:'jpg',maxKb:1},ctx);
  assert.notEqual(r.outputs[0].blob,f.file);assert.equal(r.outputs[0].blob.type,'image/jpeg');
  assert.equal(r.outputs[0].name,'transparent.jpg');assert.ok(calls.fills.length);
  check(r,0,1500,1024,'failed');assert.ok(r.warning);
});
test('same-format original fallback is validated after the actual Blob is chosen',async t=>{
  for(const originalSize of [900,1100])await t.test(originalSize+' B original',async()=>{
    const f=file('small.jpg',originalSize),{ctx}=fixture(()=>1500);
    const r=await tool.run([f],{format:'jpg',maxKb:1},ctx);
    assert.equal(r.outputs[0].blob,f.file);
    check(r,0,originalSize,1024,originalSize<=1024?'passed':'failed');
    assert.equal(!!r.warning,originalSize>1024);
  });
});
test('default0 still keeps a smaller same-format original and does not search quality',async()=>{
  const f=file('small.webp',500,'image/webp'),{ctx,calls}=fixture(()=>900);
  const r=await tool.run([f],{maxKb:0},ctx);
  assert.equal(r.outputs[0].blob,f.file);assert.equal(calls.encodes.length,1);assert.equal(r.warning,null);
});
test('unsupported WebP retains the existing JPEG fallback and checks its real bytes',async()=>{
  const {ctx,calls}=fixture(({mime,quality})=>mime==='image/webp'?{type:'image/png',size:3000}:quality>.4?1600:900);
  const r=await tool.run([file()],{format:'webp',maxKb:1},ctx);
  assert.equal(calls.encodes[0].mime,'image/webp');assert.equal(calls.encodes[1].mime,'image/jpeg');
  assert.equal(r.outputs[0].blob.type,'image/jpeg');assert.equal(r.outputs[0].name,'photo.jpg');
  check(r,0,900,1024,'passed');assert.equal(r.warning,null);
});
test('partial batch failure reports exact count and per-file outcomes',async()=>{
  const {ctx}=fixture(({file})=>file==='fits.jpg'?900:1500);
  const r=await tool.run([file('fits.jpg'),file('over.jpg')],{maxKb:1},ctx);
  check(r,0,900,1024,'passed');check(r,1,1500,1024,'failed');
  assert.equal(r.validation.size.oversizedCount,1);assert.equal(r.validation.size.totalFiles,2);
  assert.equal(r.validation.size.status,'failed');assert.ok(r.warning.message.includes('"n":1,"total":2'));
});
test('the target is per image, not an aggregate batch limit',async()=>{
  const {ctx}=fixture(()=>900);const r=await tool.run([file('a.jpg'),file('b.jpg')],{maxKb:1},ctx);
  assert.equal(r.outputs.reduce((n,o)=>n+o.blob.size,0),1800);
  assert.equal(r.warning,null);assert.equal(r.validation.size.status,'passed');
});
test('invalid explicit targets reject before run decoding or encoding',async t=>{
  for(const maxKb of [-1,NaN,Infinity,'abc','1e309',Number.MAX_SAFE_INTEGER])await t.test(String(maxKb),async()=>{
    const {ctx,calls}=fixture();await assert.rejects(tool.run([file()],{maxKb},ctx),e=>e.key==='errorTarget');
    assert.equal(calls.loads.length,0);assert.equal(calls.encodes.length,0);
  });
});
test('custom target input preserves badInput as invalid rather than disabling the goal',()=>{
  const nodes=[],row={classList:{add(){}},appendChild(){}},api={el(tag){const n={tag,style:{},appendChild(){}};nodes.push(n);return n;},optStr(){return '';},set(_id,get){this.get=get;}};
  tool.renderers['target-kb']({id:'maxKb'},row,api);
  const input=nodes.find(n=>n.tag==='input');input.value='';input.validity={badInput:true};
  assert.ok(Number.isNaN(api.get()));assert.equal(tool.parseOpts({maxKb:api.get()}).validTarget,false);
});
test('all8 languages expose persistent byte units, failure labels and edit invalidation copy',()=>{
  assert.equal(tool.invalidateOnEdit,true);
  assert.equal(tool.options.find(o=>o.id==='maxKb').default,0);
  for(const [lang,t]of Object.entries(copy.strings)){
    assert.ok(t.options.maxKb.label,lang);assert.match(t.options.maxKb.help,/1024/);
    for(const k of ['targetLimit','targetExceeded','downloadTargetOver','needsRerun','errorTarget'])assert.ok(typeof t[k]==='string'&&t[k].trim(),lang+' '+k);
  }
  assert.equal(copy.strings.ko.h1,'이미지 압축');
  assert.equal(copy.strings.ko.line,'사진을 넣고 압축 정도를 고른 뒤 원본과 결과 용량을 비교해 내려받으세요.');
});
