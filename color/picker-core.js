(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./color.js'),require('./palette-import.js'));else root.PB_PICKER=factory(root.COLOR,root.PB_PALETTE_IMPORT);})(typeof window!=='undefined'?window:this,function(C,I){
  'use strict';
  function point(clientX,clientY,rect,width,height){
    return {x:Math.max(0,Math.min(width-1,Math.floor((clientX-rect.left)*width/rect.width))),y:Math.max(0,Math.min(height-1,Math.floor((clientY-rect.top)*height/rect.height)))};
  }
  // Match the white display backdrop. Fully transparent pixels carry no visible color.
  function visible(rgba){
    if(!rgba[3])return null;
    const a=rgba[3]/255;
    return C.rgbToHex({r:Math.round(rgba[0]*a+255*(1-a)),g:Math.round(rgba[1]*a+255*(1-a)),b:Math.round(rgba[2]*a+255*(1-a))});
  }
  function colors(values){
    if(!Array.isArray(values)||!values.length||values.length>12||values.some(v=>typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v)))throw Error('Invalid palette');
    return [...new Set(values.map(v=>v.toLowerCase()))];
  }
  function code(values,format){
    const c=colors(values),roles=c.length===5?I.roles(c):null;
    if(format==='json')return JSON.stringify({version:1,colors:c,...(roles?{roles}:{})},null,2);
    if(format==='css')return ':root {\n'+c.map((v,i)=>'  --color-'+(i+1)+': '+v+';').concat(roles?Object.entries(roles).map(([k,v])=>'  --pb-'+k+': '+v+';'):[]).join('\n')+'\n}';
    return c.join('\n');
  }
  return {point,visible,code};
});
