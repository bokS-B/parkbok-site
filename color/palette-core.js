(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./color.js'),require('./palette-data.js'));else root.PB_PALETTE=factory(root.COLOR,root.PB_PALETTES);})(typeof window!=='undefined'?window:this,function(C,presets){
  'use strict';
  const ROLES=['background','surface','text','primary','accent'],TEMPLATES=['website','shop','planner'];
  function clean(colors){const out={};for(const k of ROLES){const v=C.parse(colors&&colors[k]);if(!v)throw Error('Invalid palette role: '+k);out[k]=v;}return out;}
  function on(hex){return C.contrast(hex,'#ffffff')>=C.contrast(hex,'#000000')?'#ffffff':'#000000';}
  function variants(p){
    const original=clean(p.colors),h=C.hexToHsl(original.primary).h;
    const dark={background:C.hslToHex({h,s:17,l:9}),surface:C.hslToHex({h,s:16,l:15}),text:C.hslToHex({h,s:24,l:94}),primary:C.mix(original.primary,'#ffffff',.32),accent:C.mix(original.accent,'#ffffff',.12)};
    const light={background:C.hslToHex({h,s:30,l:96}),surface:'#fffdfa',text:C.hslToHex({h,s:22,l:17}),primary:C.mix(original.primary,original.background,.45),accent:original.accent};
    return p.mode==='dark'?{light,dark:original}:{light:original,dark};
  }
  function fromBase(hex,scheme){
    hex=C.parse(hex);if(!hex)throw Error('Invalid base color');
    const f={comp:C.complementary,split:C.splitComplementary,ana:C.analogous,tri:C.triadic,tet:C.tetradic};
    const set=(f[scheme]||C.complementary)(hex),h=C.hexToHsl(hex).h;
    return {background:C.hslToHex({h,s:32,l:96}),surface:'#fffdfa',text:C.hslToHex({h,s:24,l:18}),primary:hex,accent:C.mix(set[set.length-1], '#ffffff',.36)};
  }
  function derived(colors){const c=clean(colors);return {...c,onPrimary:on(c.primary),onAccent:on(c.accent),muted:C.mix(c.text,c.background,.22),border:C.mix(c.text,c.background,.30),artSoft:C.mix(c.primary,c.surface,.85),artInk:c.text};}
  function ratios(colors){const c=derived(colors);return {body:C.contrast(c.text,c.background),card:C.contrast(c.text,c.surface),button:C.contrast(c.onPrimary,c.primary),accent:C.contrast(c.onAccent,c.accent)};}
  function fromPreset(id,mode){const p=presets.find(p=>p.id===id)||presets[0];return {preset:p.id,template:'website',theme:mode==='dark'?'dark':'light',motion:true,variants:variants(p),scheme:'comp'};}
  function current(s){return clean(s.variants[s.theme]);}
  function hash(s){return '#pb1:'+s.preset+':'+s.template+':'+s.theme+':'+(s.motion?'1':'0')+':'+ROLES.map(k=>current(s)[k].slice(1)).join('-');}
  function readHash(value){
    const fallback=fromPreset('strawberry-milk','light');
    if(!value||value==='#')return {state:fallback};
    let text;try{text=decodeURIComponent(String(value).replace(/^#/,''));}catch(_){return {state:fallback,error:true};}
    if(text.length>512)return {state:fallback,error:true};
    if(text.startsWith('pb1:')){
      const a=text.split(':'),colors=(a[5]||'').split('-');
      if(a.length!==6||!presets.some(p=>p.id===a[1])||!TEMPLATES.includes(a[2])||!['light','dark'].includes(a[3])||!['0','1'].includes(a[4])||colors.length!==5||colors.some(x=>!/^[a-f0-9]{6}$/i.test(x)))return {state:fallback,error:true};
      const s=fromPreset(a[1],a[3]);s.template=a[2];s.motion=a[4]==='1';s.variants[s.theme]=Object.fromEntries(ROLES.map((k,i)=>[k,'#'+colors[i].toLowerCase()]));return {state:s};
    }
    const [base,scheme]=text.split('/'),hex=C.parse(base);
    if(!hex||!['comp','split','ana','tri','tet','light','sat',undefined].includes(scheme))return {state:fallback,error:true};
    const colors=fromBase(hex,scheme),s=fromPreset('strawberry-milk','light');s.variants=variants({colors,mode:'light'});s.scheme=scheme||'comp';return {state:s,legacy:true};
  }
  function cssVariables(colors){const c=derived(colors);return '.pb-demo {\n'+Object.entries(c).map(([k,v])=>'  --pb-'+k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())+': '+v+';').join('\n')+'\n}';}
  return {ROLES,TEMPLATES,presets,clean,on,variants,fromBase,derived,ratios,fromPreset,current,hash,readHash,cssVariables};
});
