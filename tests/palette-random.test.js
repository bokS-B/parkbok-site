const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../color/palette-core.js'),C=require('../color/color.js');
const fs=require('node:fs'),path=require('node:path');
function seeded(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
test('new random palettes are readable in both modes and are not limited to 24 presets',()=>{
 const unique=new Set();
 for(const theme of ['light','dark'])for(let seed=0;seed<100;seed++){
  const s=P.fromPreset('strawberry-milk',theme),before=JSON.stringify(s),colors=P.randomColors(s,seeded(seed));
  for(const[k,r]of Object.entries(P.ratios(colors)))assert.ok(r>=4.5,theme+' '+seed+' '+k+' '+r);
  unique.add(JSON.stringify(colors));assert.equal(JSON.stringify(s),before);
 }
 assert.ok(unique.size>150);
});
test('every combination of five locks preserves exactly the locked colors',()=>{
 for(const theme of ['light','dark'])for(let mask=0;mask<32;mask++){
  const s=P.fromPreset('honey-toast',theme);s.locks=Object.fromEntries(P.ROLES.map((k,i)=>[k,!!(mask&(1<<i))]));
  const before=P.current(s),colors=P.randomColors(s,seeded(mask+50));
  for(const k of P.ROLES){assert.match(colors[k],/^#[a-f0-9]{6}$/);if(s.locks[k])assert.equal(colors[k],before[k]);}
  if(mask===31)assert.deepEqual(colors,before);
 }
});
test('all locked is a no-op even when a random source is unavailable',()=>{
 const s=P.fromPreset('honey-toast','light');s.locks=Object.fromEntries(P.ROLES.map(k=>[k,true]));
 assert.deepEqual(P.randomColors(s,()=>{throw Error('must not sample');}),P.current(s));
});
test('shared locks, colors, template, mode and motion round-trip; pb1 links remain valid',()=>{
 const s=P.fromPreset('peach-soda','dark');s.template='shop';s.motion=false;s.locks={primary:true,surface:true};s.variants.dark=P.randomColors(s,seeded(19));
 const hash=P.hash(s),round=P.readHash(hash);assert.ok(hash.startsWith('#pb2:'));assert.equal(round.error,undefined);
 assert.deepEqual(P.current(round.state),P.current(s));assert.equal(round.state.template,'shop');assert.equal(round.state.theme,'dark');assert.equal(round.state.motion,false);
 assert.equal(round.state.locks.primary,true);assert.equal(round.state.locks.surface,true);assert.equal(round.state.locks.text,false);
 s.locks={};assert.ok(P.hash(s).startsWith('#pb1:'));assert.equal(P.readHash(P.hash(s)).error,undefined);
});
test('legacy random five-color links preserve the order and all five values',()=>{
 const r=P.readHash('#FF5733-33FF57-3357FF-FF33A1-A1FF33');assert.equal(r.legacy,true);
 assert.deepEqual(Object.values(P.current(r.state)),['#ff5733','#33ff57','#3357ff','#ff33a1','#a1ff33']);
});
test('malformed masks, colors and random sources cannot enter shared state',()=>{
 const good=P.hash({...P.fromPreset('honey-toast','light'),locks:{primary:true}});
 for(const mask of ['1','111111','<img>','0000x'])assert.equal(P.readHash(good.replace(/:[01]{5}$/,':'+mask)).error,true);
 for(const rng of [()=>-1,()=>1,()=>NaN,()=>Infinity])assert.throws(()=>P.randomColors(P.fromPreset('honey-toast'),rng));
 assert.equal(P.readHash('#ff5733-33ff57-3357ff-ff33a1-javascript').error,true);
});
test('retired URLs remain usable aliases while discovery and indexing use only the palette',()=>{
 const root=path.resolve(__dirname,'..'),sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
 assert.doesNotMatch(sitemap,/<loc>[^<]*\/color\/random\//);
 for(const lang of ['en','ko','zh','ja','es','pt','de','fr']){
  const tail=lang==='en'?'':lang+'/',alias=fs.readFileSync(path.join(root,'color/random',tail,'index.html'),'utf8');
  assert.ok(alias.includes('content="noindex,follow"'));assert.ok(alias.includes('rel="canonical" href="https://parkbok.com/color/palette/'+tail+'"'));
  assert.ok(alias.includes('href="/color/palette/'+tail+'"'));assert.ok(alias.includes('+location.search+location.hash'));
  const hub=fs.readFileSync(path.join(root,'color',tail,'index.html'),'utf8');assert.doesNotMatch(hub,/<a class="card" href="\/color\/random\//);
  const page=fs.readFileSync(path.join(root,'color/palette',tail,'index.html'),'utf8');
  for(const asset of ['palette-core.js','palette-strings.js','palette-studio.css','tools/palette.js'])assert.ok(page.includes('/color/'+asset+'?v='),'Cache key missing: '+asset);
 }
});
