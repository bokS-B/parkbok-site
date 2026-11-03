// Playwright MCP browser_run_code_unsafe; local responses and synthetic colors only.
async page => {
 const base='http://127.0.0.1:8802',out='C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-palette-merged/output/palette-merge';
 const report={layouts:[],redirects:[],checks:[],errors:[],writes:[]};
 const ok=(v,m)=>{if(!v)throw Error(m);};
 await page.context().route(/google-analytics\.com|googletagmanager\.com|googlesyndication\.com|doubleclick\.net|https:\/\/(?:[^/]*\.)?google\.com\//,r=>r.abort());
 await page.context().addInitScript(()=>{localStorage.setItem('pb_lang','en');window.__copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copies.push(text);}}});});
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('request',r=>{if(['POST','PUT','PATCH'].includes(r.method()))report.writes.push(r.url());});
 const colors=()=>page.evaluate(()=>Object.fromEntries(window.PB_PALETTE.ROLES.map(k=>[k,document.querySelector('#ps-hex-'+k).value])));
 const open=async(path='/color/palette/ko/')=>{await page.goto(base+path);await page.locator('.pb-demo').waitFor();};
 await open();await page.locator('#ps-motion').uncheck();
 await page.locator('[data-lock-role=primary]').click();await page.locator('[data-lock-role=surface]').click();
 const first=await colors();
 for(let i=0;i<5;i++){await page.locator('#ps-random').click();const next=await colors();ok(next.primary===first.primary&&next.surface===first.surface,'Locked colors changed');}
 ok(JSON.stringify(first)!==JSON.stringify(await colors()),'Random unchanged');
 const shared=await page.url();ok(shared.includes('#pb2:'),'Locks missing from share');await page.reload();await page.locator('.pb-demo').waitFor();
 ok(await page.locator('[data-lock-role=primary]').getAttribute('aria-pressed')==='true','Lock missing after reload');
 ok((await colors()).primary===first.primary,'Color missing after reload');
 report.checks.push('five shuffles preserve locked values; colors + locks survive sharing/reload');
 const current=await colors();
 await page.locator('#ps-copy-colors').click();ok(await page.evaluate(()=>window.__copies.at(-1))===Object.values(current).join(', '),'Copy all');
 await page.locator('.ps-color-copy').first().click();ok(await page.evaluate(()=>window.__copies.at(-1))===current.background,'Copy one');
 await page.evaluate(()=>{const p=window.PB_PALETTE,fn=p.randomColors;window.__randomCalls=0;p.randomColors=function(...args){window.__randomCalls++;return fn(...args);};});
 await page.locator('h1').click();await page.keyboard.press('Space');ok(await page.evaluate(()=>window.__randomCalls)===1,'Body Space');
 await page.locator('#ps-random').focus();await page.keyboard.press('Space');ok(await page.evaluate(()=>window.__randomCalls)===2,'Button Space triggered twice');
 const beforeEdit=await colors();await page.locator('#cin').focus();await page.keyboard.press('Space');ok(JSON.stringify(await colors())===JSON.stringify(beforeEdit),'Typing Space shuffled');
 report.checks.push('copy one/all; body Space; no duplicate button action or typing shortcut');

 await page.locator('[data-template=planner]').click();
 await page.locator('#ps-export').click();await page.locator('[data-format=variables]').click();const css=await page.locator('#ps-code').inputValue();
 for(const[k,v]of Object.entries(await colors()))ok(css.includes('--pb-'+k+': '+v),'CSS role '+k);
 await page.locator('[data-format=json]').click();const json=JSON.parse(await page.locator('#ps-code').inputValue());ok(json.locks.primary&&json.locks.surface,'JSON locks');ok(json.template==='planner','JSON template');
 const calls=await page.evaluate(()=>window.__randomCalls);await page.locator('#ps-code').focus();await page.keyboard.press('Space');ok(await page.evaluate(()=>window.__randomCalls)===calls,'Dialog Space shuffled');
 const download=page.waitForEvent('download');await page.locator('#ps-download').click();const d=await download;await d.saveAs(out+'/export.html');
 await page.locator('.ps-close').click();report.checks.push('current colors in CSS/JSON and standalone HTML export');
 for(const role of ['background','text','accent'])await page.locator('[data-lock-role='+role+']').click();
 ok(await page.locator('#ps-random').isDisabled(),'All locked button not disabled');const all=await colors();await page.locator('h1').click();await page.keyboard.press('Space');ok(JSON.stringify(await colors())===JSON.stringify(all),'All locked Space changed colors');
 await page.locator('[data-preset=peach-soda]').click();ok(await page.locator('.ps-color-lock[aria-pressed=true]').count()===0,'Preset did not reset locks');
 ok(await page.locator('[data-preset]').count()===24,'Lost preset library');report.checks.push('all-locked no-op; explicit preset clears locks; all 24 sets retained');

 for(const width of [1280,375])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===1280?900:812});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(const template of ['website','shop','planner']){
   await page.locator('[data-template='+template+']').click();await page.locator('.ps-colors-strip').scrollIntoViewIfNeeded();
   const m=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),locks:[...document.querySelectorAll('.ps-color-lock')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {width:r.width,height:r.height,hit:!!hit&&e.contains(hit)};}),preview:[...document.querySelectorAll('.ps-color-hex')].map(e=>e.scrollWidth<=e.clientWidth)}));
   ok(m.overflow===0,'Overflow '+width+theme+template);ok(m.locks.every(x=>x.width>=44&&x.height>=44&&x.hit),'Lock size');ok(m.preview.every(Boolean),'HEX clipped');report.layouts.push({width,theme,template,...m});
  }
  await page.locator('h1').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/palette-'+width+'-'+theme+'.png',animations:'disabled'});
 }
 // Real resize changes visible help via CSS, without synthetic resize handlers.
 await page.setViewportSize({width:1280,height:900});ok(await page.locator('.ps-keyboard-hint').isVisible(),'Desktop help');
 await page.setViewportSize({width:375,height:812});ok(await page.locator('.ps-touch-hint').isVisible(),'Mobile help');
 const langs=['en','ko','zh','ja','es','pt','de','fr'],legacy='#ff5733-33ff57-3357ff-ff33a1-a1ff33';
 for(const lang of langs){
  const tail=lang==='en'?'':lang+'/';
  await open('/color/random/'+tail+'?maxKb=100'+legacy);ok((await page.url()).includes('/color/palette/'+tail+'?maxKb=100'+legacy),'Legacy URL '+lang);
  ok(JSON.stringify(Object.values(await colors()))===JSON.stringify(['#ff5733','#33ff57','#3357ff','#ff33a1','#a1ff33']),'Legacy values '+lang);
  ok(await page.locator('.ps-color-lock').count()===5,'Locale locks '+lang);
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Locale overflow '+lang);report.redirects.push(lang);
  await page.goto(base+'/color/'+tail);ok(await page.locator('a.card').count()===5,'Hub card count '+lang);ok(await page.locator('a.card[href*="/random/"]').count()===0,'Random hub card '+lang);
 }
 await page.goto(base+'/');ok(await page.locator('a.card[href*="/color/random/"]').count()===0,'Random homepage card');
 ok(report.errors.length===0,report.errors.join('\n'));ok(report.writes.length===0,'Unexpected upload');
 return report;
}
