const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../color/palette-core.js'),C=require('../color/color.js'),V=require('../color/palette-templates.js'),S=require('../color/palette-strings.js');
test('24 distinct palettes contain exactly five editable roles, three per category',()=>{
 assert.equal(P.presets.length,24);assert.equal(new Set(P.presets.map(p=>p.id)).size,24);
 const groups={};for(const p of P.presets){assert.deepEqual(Object.keys(p.colors),P.ROLES);for(const c of Object.values(p.colors))assert.match(c,/^#[0-9a-f]{6}$/);groups[p.category]=(groups[p.category]||0)+1;}
 assert.equal(Object.keys(groups).length,8);assert.deepEqual(Object.values(groups),Array(8).fill(3));
});
for(const p of P.presets)for(const theme of ['light','dark'])test(p.id+' / '+theme+' keeps text readable and the original mode exact',()=>{
 const colors=P.variants(p)[theme],r=P.ratios(colors);for(const[k,v]of Object.entries(r))assert.ok(v>=4.5,k+' '+v);
 if(theme===p.mode)assert.deepEqual(colors,p.colors);
 const s=P.fromPreset(p.id,theme);s.template='planner';s.motion=false;const round=P.readHash(P.hash(s));assert.equal(round.error,undefined);assert.deepEqual(P.current(round.state),colors);assert.equal(round.state.template,'planner');assert.equal(round.state.motion,false);
});
test('old base/scheme links still resolve without losing their base',()=>{
 for(const scheme of ['comp','split','ana','tri','tet','light','sat']){const r=P.readHash('#2563eb/'+scheme);assert.equal(r.legacy,true);assert.equal(r.state.scheme,scheme);assert.equal(P.current(r.state).primary,'#2563eb');}
});
test('damaged and hostile shared state cannot become CSS or markup',()=>{
 for(const value of ['#%E0%A4%A','#pb1:x:website:light:1:ffffff-ffffff-ffffff-ffffff-ffffff','#pb1:strawberry-milk:<script>:light:1:ffffff-ffffff-ffffff-ffffff-ffffff','#pb1:strawberry-milk:website:light:1:fff-fff-fff-fff-fff','#'+ 'x'.repeat(600)])assert.equal(P.readHash(value).error,true,value);
 assert.throws(()=>P.clean({background:'url(javascript:alert(1))'}));
});
test('custom foreground collisions remain measurable instead of being falsely repaired',()=>{
 const c={...P.presets[0].colors,text:P.presets[0].colors.background};assert.equal(P.ratios(c).body,1);assert.equal(P.clean(c).text,c.text);
});
test('three self-contained templates retain native controls and font license',()=>{
 for(const id of P.TEMPLATES){const state=P.fromPreset('strawberry-milk','light');state.template=id;const html=V.documentHtml(state,S.ko,'ko');assert.ok(html.startsWith('<!doctype html>'));assert.ok(html.includes('SIL OPEN FONT LICENSE'));assert.ok(html.includes('data:font/woff;base64,'));assert.ok(html.includes('--pb-primary:#bb4163'));assert.ok(!/\b(?:src|href)=["']https?:/.test(html));assert.ok(!/<script\b/.test(html));assert.ok(!/body\s*\{[^}]*font-family/.test(V.css));}
 const state=P.fromPreset('strawberry-milk','light');state.template='planner';assert.match(V.markup(state,S.ko),/type="checkbox"/);assert.match(V.markup(state,S.ko),/type="radio"/);assert.match(V.css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('all eight languages have complete UI/template strings',()=>{
 assert.equal(Object.keys(S).length,8);for(const[lang,values]of Object.entries(S))for(const key of Object.keys(S.en))assert.equal(typeof values[key],'string',lang+' missing '+key);
});
test('template copy is escaped in component output',()=>{
 const state=P.fromPreset('strawberry-milk','light');const html=V.markup(state,{...S.en,siteTitle:'<img src=x onerror=alert(1)>'});assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
});
test('CSS variable output is scoped and includes readable button foregrounds',()=>{
 const css=P.cssVariables(P.presets[0].colors);assert.ok(css.startsWith('.pb-demo {'));assert.ok(css.includes('--pb-on-primary: #ffffff;'));assert.ok(!css.includes(':root'));
});
