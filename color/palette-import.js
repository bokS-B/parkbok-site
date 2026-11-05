(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./color.js'));else root.PB_PALETTE_IMPORT=factory(root.COLOR);})(typeof window!=='undefined'?window:this,function(C){
  'use strict';
  // Preserve source HEX values. Assign roles only; low contrast is reviewed in the studio.
  function roles(values){
    if(!Array.isArray(values)||values.length>12)throw Error('Invalid image palette');
    const unique=[];
    for(const v of values){if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))throw Error('Invalid image color');const c=v.toLowerCase();if(!unique.includes(c))unique.push(c);}
    // The picker must make the choice visible. Never silently drop or repeat colors.
    if(unique.length!==5)throw Error('Select exactly five distinct image colors');
    const selected=unique;
    const sorted=selected.slice().sort((a,b)=>C.luminance(a)-C.luminance(b));
    const text=sorted[0],background=sorted[sorted.length-1],surface=sorted.length>2?sorted[sorted.length-2]:background;
    const middle=sorted.slice(1,-2),primary=middle.slice().sort((a,b)=>C.hexToHsl(b).s-C.hexToHsl(a).s)[0]||surface;
    const accent=middle.find(c=>c!==primary)||text;
    return {background,surface,text,primary,accent};
  }
  function href(values,lang,template){const colors=roles(values),locale=['ko','zh','ja','es','pt','de','fr'].includes(lang)?lang+'/':'',hex=Object.values(colors).map(c=>c.slice(1)).join('-');if(template&&!['website','shop','planner'].includes(template))throw Error('Invalid template');return '/color/palette/'+locale+'#'+(template?'pb1:strawberry-milk:'+template+':light:1:':'')+hex;}
  return {roles,href};
});
