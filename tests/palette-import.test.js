const test=require('node:test'),assert=require('node:assert/strict');
const I=require('../color/palette-import.js'),P=require('../color/palette-core.js');
const colors=['#fff1df','#ffd16b','#f8b8c4','#b96f92','#77c4b6','#397d7a'];
test('image palette crosses the existing studio URL boundary without changing its five colors',()=>{
 const url=I.href(colors,'en'),parsed=P.readHash(url.slice(url.indexOf('#')));
 assert.equal(parsed.error,undefined);assert.deepEqual(P.current(parsed.state),I.roles(colors));
 assert.deepEqual(new Set(Object.values(P.current(parsed.state))),new Set(colors.slice(0,5)));
});
test('picked colors keep order of selection for the five-color limit',()=>{
 const input=colors.slice().reverse(),roles=I.roles(input);
 assert.deepEqual(new Set(Object.values(roles)),new Set(input.slice(0,5)));
 assert.ok(!Object.values(roles).includes(input[5]));
});
test('one through four distinct source colors reuse exact source colors without fabricating tints',()=>{
 for(let n=1;n<5;n++){const input=colors.slice(0,n),roles=I.roles(input);assert.equal(Object.keys(roles).length,5);assert.deepEqual(new Set(Object.values(roles)),new Set(input));}
 assert.deepEqual(I.roles(['#FFFFFF','#ffffff']),{background:'#ffffff',surface:'#ffffff',text:'#ffffff',primary:'#ffffff',accent:'#ffffff'});
});
test('palette links preserve all eight page locales and reject hostile colors',()=>{
 for(const lang of ['en','ko','zh','ja','es','pt','de','fr'])assert.ok(I.href(colors,lang).startsWith('/color/palette/'+(lang==='en'?'':lang+'/')+'#'));
 for(const values of [null,[],['red'],['#fff'],['#fff;background:url(x)'],Array(13).fill('#ffffff')])assert.throws(()=>I.roles(values));
 assert.ok(I.href(colors,'../evil').startsWith('/color/palette/#'));
});
