const test=require('node:test'),assert=require('node:assert/strict');
const K=require('../color/picker-core.js'),P=require('../color/palette-core.js'),I=require('../color/palette-import.js');
test('preview coordinates address full-resolution pixels and clamp all edges',()=>{
 const rect={left:20,top:30,width:400,height:100};
 assert.deepEqual(K.point(220,80,rect,8192,2048),{x:4096,y:1024});
 assert.deepEqual(K.point(0,0,rect,8192,2048),{x:0,y:0});
 assert.deepEqual(K.point(420,130,rect,8192,2048),{x:8191,y:2047});
});
test('transparent pixels are excluded and partial alpha uses the visible white backdrop',()=>{
 assert.equal(K.visible([255,0,0,0]),null);
 assert.equal(K.visible([255,0,0,128]),'#ff7f7f');
 assert.equal(K.visible([12,34,56,255]),'#0c2238');
 assert.equal(K.visible([0,0,0,1]),'#fefefe');
});
const colors=['#fff1df','#f8b8c4','#b96f92','#397d7a','#77c4b6'];
test('picker CSS and JSON match studio roles for every actual template URL',()=>{
 const json=JSON.parse(K.code(colors,'json')),css=K.code(colors,'css');
 for(const template of P.TEMPLATES){const href=I.href(colors,'ko',template),parsed=P.readHash(href.split('#')[1]);
  assert.equal(parsed.error,undefined);assert.equal(parsed.state.template,template);assert.equal(parsed.state.motion,true);
  assert.deepEqual(P.current(parsed.state),json.roles);
  for(const[k,v]of Object.entries(json.roles))assert.ok(css.includes('--pb-'+k+': '+v+';'));
 }
 assert.deepEqual(json.colors,colors);assert.throws(()=>I.href(colors,'ko','<script>'));
});
test('small palettes export their real count without invented template roles',()=>{
 for(const n of [1,2,3,4]){const json=JSON.parse(K.code(colors.slice(0,n),'json'));
  assert.equal(json.colors.length,n);assert.equal(json.roles,undefined);
  assert.equal((K.code(colors.slice(0,n),'css').match(/--color-/g)||[]).length,n);
 }
});
test('export rejects arbitrary values instead of interpolating CSS or HTML',()=>{
 for(const value of [[],null,['#fff'],['red'],['#123456;}body{display:none']])assert.throws(()=>K.code(value,'css'));
 assert.deepEqual(JSON.parse(K.code(['#FFFFFF','#ffffff'],'json')).colors,['#ffffff']);
});
