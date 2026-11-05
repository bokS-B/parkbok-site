const test=require('node:test'),assert=require('node:assert/strict');
const I=require('../color/palette-import.js'),P=require('../color/palette-core.js');
const colors=['#fff1df','#ffd16b','#f8b8c4','#b96f92','#77c4b6','#397d7a'];
test('image palette crosses the existing studio URL boundary without changing its five colors',()=>{
 const url=I.href(colors.slice(0,5),'en'),parsed=P.readHash(url.slice(url.indexOf('#')));
 assert.equal(parsed.error,undefined);assert.deepEqual(P.current(parsed.state),I.roles(colors.slice(0,5)));
 assert.deepEqual(new Set(Object.values(P.current(parsed.state))),new Set(colors.slice(0,5)));
});
test('more than five colors cannot silently discard the last color',()=>{
 assert.throws(()=>I.href(colors,'en'),/exactly five/);
 assert.throws(()=>I.roles([...colors,'#123456']),/exactly five/);
});
test('fewer than five distinct colors cannot fabricate a full template palette',()=>{
 for(let n=0;n<5;n++)assert.throws(()=>I.roles(colors.slice(0,n)),/exactly five/);
 assert.throws(()=>I.roles(Array(5).fill('#ffffff')),/exactly five/);
 assert.throws(()=>I.roles(['#FFFFFF','#ffffff']),/exactly five/);
});
test('palette links preserve all eight page locales and reject hostile colors',()=>{
 for(const lang of ['en','ko','zh','ja','es','pt','de','fr'])assert.ok(I.href(colors.slice(0,5),lang).startsWith('/color/palette/'+(lang==='en'?'':lang+'/')+'#'));
 for(const values of [null,[],['red'],['#fff'],['#fff;background:url(x)'],Array(13).fill('#ffffff')])assert.throws(()=>I.roles(values));
 assert.ok(I.href(colors.slice(0,5),'../evil').startsWith('/color/palette/#'));
});
test('each explicit five-color selection survives the actual studio URL parser',()=>{
 for(let skip=0;skip<colors.length;skip++){
  const chosen=colors.filter((_,i)=>i!==skip),url=I.href(chosen,'en'),parsed=P.readHash(url.slice(url.indexOf('#')));
  assert.equal(parsed.error,undefined);
  assert.deepEqual(new Set(Object.values(P.current(parsed.state))),new Set(chosen));
 }
});
test('casing is normalized without introducing duplicate roles',()=>{
 const chosen=colors.slice(0,5),roles=I.roles([...chosen,chosen[0].toUpperCase()]);
 assert.deepEqual(new Set(Object.values(roles)),new Set(chosen));
});
