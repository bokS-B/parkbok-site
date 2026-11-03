'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const pilot=require('../preview-arabic'),strings=require('./strings');
const root=path.resolve(__dirname,'../..');
for(const section of ['image','pdf']){
  const common=JSON.parse(fs.readFileSync(path.join(root,section,'src/strings.json'))).en;
  for(const key of Object.keys(common))assert.ok(Object.hasOwn(strings[section],key),'Missing '+section+' '+key);
}
for(const r of pilot.routes){
  const html=pilot.renderPage(r);
  assert.match(html,/<html lang="ar" dir="rtl">/);
  assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
  assert.ok(!/hreflang=|rel="canonical"|adsbygoogle|googletagmanager|application\/ld\+json/.test(html));
  assert.match(html,new RegExp('src="/'+r.section+'/tools/'+r.id+'\\.js"'));
  for(const other of pilot.routes)assert.ok(html.includes('href="'+other.route+'"'));
  const prefix=r.section==='image'?'IMGT':'PDFT';
  const config=JSON.parse(html.match(new RegExp('window\\.'+prefix+'_TOOL=([\\s\\S]*?);</script>'))[1]);
  assert.equal(config.lang,'ar');assert.equal(config.id,r.id);assert.deepEqual(config.strings,strings.tools[r.id]);
  assert.ok(!html.includes('/wheel/ar/')&&!html.includes('/color/ar/'));
}
assert.equal(pilot.normalizeArabicNumber('١٢٠٠'),'1200');
assert.equal(pilot.normalizeArabicNumber('۱۲۰۰'),'1200');
assert.equal(pilot.normalizeArabicNumber('١٬٢٠٠٫٥'),'1200.5');
for(const file of ['image/img-tools.js','pdf/pdf-tools.js']){
  const transformed=pilot.transformRuntime(fs.readFileSync(path.join(root,file),'utf8'));
  new Function(transformed);assert.ok(!transformed.includes("inp.type = 'number'"));
  assert.ok(transformed.includes('parseFloat(window.__pbArabicNumber(inp.value))'));
}
assert.ok(pilot.renderHub().includes('أدوات الصور والملفات'));
const compression=require('../../image/tools/image-compress');
const compressionRuntime=pilot.transformRuntime(fs.readFileSync(path.join(root,'image/tools/image-compress.js'),'utf8'));
new Function(compressionRuntime);
assert.ok(!compressionRuntime.includes("input.type = 'number'"));
assert.ok(compressionRuntime.includes('Number(window.__pbArabicNumber(input.value))'));
for(const option of compression.options){
  assert.ok(strings.tools['image-compress'].options[option.id]?.label,'Missing Arabic compression option '+option.id);
}
for(const key of ['targetLimit','targetExceeded','downloadTargetOver','errorTarget'])assert.ok(strings.tools['image-compress'][key],'Missing Arabic '+key);
assert.match(strings.tools['image-compress'].targetLimit,/\{kb\}.*\{limit\}/);
assert.match(strings.tools['image-compress'].targetExceeded,/\{n\}.*\{total\}/);
assert.ok(strings.image.needsRerun);
// Test the pilot's own RTL fade state at both ends and without overflow. Real resize is checked in-browser.
const menuScript=fs.readFileSync(path.join(__dirname,'pilot.js'),'utf8');
for(const [width,scrollWidth,scrollLeft,start,end] of [[278,441,0,false,false],[278,441,-19,true,false],[278,441,-163,true,true],[500,441,0,false,true],[278,441,20,false,false],[278,441,-190,true,true]]){
  const classes=new Map(),menu={clientWidth:width,scrollWidth,scrollLeft,classList:{toggle:(k,v)=>classes.set(k,v)},querySelector:()=>null,addEventListener:()=>{}};
  vm.runInNewContext(menuScript,{document:{querySelector:()=>menu,addEventListener:()=>{}},window:{addEventListener:()=>{}}});
  assert.equal(classes.get('start'),start,'RTL start fade at '+scrollLeft);assert.equal(classes.get('end'),end,'RTL end fade at '+scrollLeft);
}
console.log('Arabic pilot: common keys,3configs,noindex,no external measurement,numeric normalization,compression target labels,RTL fade edges,script syntax PASS');
