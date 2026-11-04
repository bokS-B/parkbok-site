const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('../image/tools/signature-resize');

const opts = { size: {w:140,h:60}, maxKb:20, minKb:10 };
function fixture(bytes, mime = 'image/jpeg'){
  const draws = [], encodes = [], releases = [];
  return { draws, encodes, releases, ctx: {
    loadImage: async () => ({width:900,height:200}), release: i => releases.push(i), progress(){},
    canvas: (width,height) => ({width,height,getContext:()=>({fillRect(){},drawImage(...a){draws.push(a);}})}),
    toBlob: async(c,m,q) => { encodes.push({width:c.width,height:c.height,q}); return new Blob([new Uint8Array(typeof bytes === 'function' ? bytes(q) : bytes)], {type:mime}); },
    t:(k,v)=>k+' '+JSON.stringify(v||{})
  }};
}
const file = {name:'my.signature.png',size:500000};
test('fixed output keeps the entire crop proportional, including white padding',()=>{
  const o = tool.parseOpts(opts), p = tool.plan(900,200,o);
  assert.equal(p.w / p.h, p.dw / p.dh); assert.equal(p.dw,140); assert.ok(p.dy>0); assert.equal(p.x,0);
  const crop = tool.plan(900,200,{...o,rect:{x:700,y:100,w:500,h:500}});
  assert.equal(crop.w,200); assert.equal(crop.h,100); assert.equal(crop.dw/crop.dh,2);
});
test('minimum and maximum boundaries validate real bytes, including one-byte differences',async t=>{
  for(const [bytes,status] of [[9999,'under'],[10000,'passed'],[20000,'passed'],[20001,'over']]) await t.test(String(bytes),async()=>{
    const {ctx}=fixture(bytes), r=await tool.run([file],opts,ctx);
    assert.equal(r.validation.size.status,status); assert.equal(r.validation.size.actualBytes,bytes);
    assert.equal(!!r.warning,status!=='passed'); assert.equal(r.outputs[0].blob.size,bytes);
    assert.equal(r.outputs[0].name,'my.signature-signature-140x60.jpg');
  });
});
test('quality search keeps exact fixed pixels, never resizes or returns the source file',async()=>{
  const {ctx,encodes}=fixture(q=>q>.5?23000:17000), r=await tool.run([file],opts,ctx);
  assert.equal(r.warning,null); assert.ok(encodes.length>2);
  assert.ok(encodes.every(c=>c.width===140&&c.height===60)); assert.equal(r.outputs[0].blob.type,'image/jpeg');
});
test('no minimum accepts a small real file without padding',async()=>{
  const {ctx}=fixture(835),r=await tool.run([file],{...opts,minKb:0},ctx);
  assert.equal(r.outputs[0].blob.size,835); assert.equal(r.warning,null);
});
test('invalid dimensions and ranges fail before decoding',async()=>{
  for(const bad of [{size:{w:0,h:60}},{size:{w:NaN,h:60}},{size:{w:140.5,h:60}},{size:{w:3001,h:60}},{maxKb:0},{maxKb:Infinity},{maxKb:NaN},{minKb:21},{minKb:-1}]){
    const {ctx,encodes}=fixture(12345);
    ctx.loadImage=async()=>{throw Error('should not decode');};
    await assert.rejects(tool.run([file],{...opts,...bad},ctx),e=>e.key==='errorSettings'); assert.equal(encodes.length,0);
  }
});
test('a browser JPEG fallback cannot pass as a JPEG result',async()=>{
  const {ctx}=fixture(12000,'image/png'); await assert.rejects(tool.run([file],opts,ctx),e=>e.key==='errorFormat');
});
test('oversize source dimensions are rejected and released',async()=>{
  const {ctx,releases}=fixture(12000); ctx.loadImage=async()=>({width:9000,height:9000});
  await assert.rejects(tool.run([file],opts,ctx),e=>e.key==='errorTooBig'); assert.equal(releases.length,1);
});
