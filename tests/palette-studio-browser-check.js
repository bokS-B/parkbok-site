// Run through browser_run_code_unsafe. Uses only the local preview and generated files.
async page=>{
 const base='http://127.0.0.1:8796',dir='C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-hallmark-home/output/playwright/palette-studio';
 const report={palettes:[],layouts:[],languages:[],exports:[],interactions:[],errors:[],writes:[],external:[]};
 const ok=(v,m)=>{if(!v)throw Error(m);};
 await page.context().route(/google-analytics\.com|googletagmanager\.com|googlesyndication\.com|doubleclick\.net/,r=>r.abort());
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('request',r=>{if(['POST','PUT','PATCH'].includes(r.method()))report.writes.push(r.url());if(/^https?:/.test(r.url())&&!r.url().startsWith(base)&&!/(google-analytics|googletagmanager|googlesyndication|doubleclick)/.test(r.url()))report.external.push(r.url());});
 async function settle(){await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.getAnimations().every(a=>a.effect.getTiming().iterations===Infinity||a.playState!=='running'),null,{timeout:5000});}
 async function open(lang='ko',width=1280){await page.setViewportSize({width,height:width===1280?900:812});await page.goto(base+'/color/palette/'+(lang==='en'?'':lang+'/'));await page.locator('.pb-demo').waitFor();await settle();}
 async function mode(theme){await page.locator('button[data-theme-choice='+theme+']').click();await settle();}
 async function metrics(){return page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),height:document.querySelector('#ps-export').getBoundingClientRect().height,rootWidth:document.querySelector('.pb-demo').getBoundingClientRect().width}));}
 await open();ok(await page.locator('[data-preset]').count()===24,'24 palettes');
 await page.locator('#ps-motion').uncheck();
 const ids=await page.locator('[data-preset]').evaluateAll(es=>es.map(e=>e.dataset.preset));
 for(const id of ids){await page.locator('button[data-preset='+id+']').click();for(const theme of ['light','dark']){
  await mode(theme);const m=await metrics();ok(m.overflow===0,'Palette overflow '+id+' '+theme);
  const colors=await page.locator('.pb-demo').evaluate(e=>Object.fromEntries(['background','surface','text','primary','accent'].map(k=>[k,e.style.getPropertyValue('--pb-'+k)])));
  report.palettes.push({id,theme,...m,colors});
 }}
 for(const category of ['minimal','nature','warm','cool','pastel','vivid','classic','dark']){await page.locator('button.ps-filter[data-category='+category+']').click();ok(await page.locator('[data-preset]:visible').count()===3,'Category '+category);}
 await page.locator('button.ps-filter[data-category=all]').click();await page.locator('button[data-preset=strawberry-milk]').click();await page.locator('#ps-motion').check();
 for(const width of [1280,375])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===1280?900:812});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await mode(theme);
  for(const id of ['website','shop','planner']){
   await page.locator('button[data-template='+id+']').click();await settle();const m=await metrics();ok(m.overflow===0,'Template overflow '+id);ok(m.height>=56&&m.height<=64,'Primary height');
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/'+id+'-'+width+'-'+theme+'.png',fullPage:width===375});report.layouts.push({width,theme,id,...m});
  }
 }
 // Direct edits preserve the exact requested primary even in dark mode.
 await open();await mode('dark');await page.locator('#cin').fill('#dedede');
 ok(await page.locator('.pb-demo').evaluate(e=>e.style.getPropertyValue('--pb-primary'))==='#dedede','Dark base color changed silently');
 await page.locator('#ps-editor').evaluate(e=>e.open=true);await page.locator('#ps-hex-text').fill(await page.locator('#ps-hex-background').inputValue());await page.locator('#ps-hex-text').blur();ok(await page.locator('.ps-contrast-note').innerText()!=='','Missing low contrast warning');
 await page.locator('#ps-hex-text').fill('<script>');await page.locator('#ps-hex-text').blur();ok(await page.locator('#ps-hex-text').getAttribute('aria-invalid')==='true','Invalid role accepted');
 await page.locator('button[data-preset=strawberry-milk]').click();ok(await page.locator('[aria-invalid=true]').count()===0,'Stale invalid state');report.interactions.push('exact dark primary; low contrast warning; invalid color; preset reset');
 // Share links restore all five roles, template, mode and motion.
 await page.locator('button[data-template=shop]').click();await mode('dark');await page.locator('#ps-motion').uncheck();
 await page.locator('#ps-editor').evaluate(e=>e.open=true);await page.locator('#ps-hex-accent').fill('#aabbcc');const hash=await page.evaluate(()=>location.hash);
 await page.goto(base+'/color/palette/ko/'+hash);await page.locator('.pb-demo').waitFor();ok(await page.locator('.pb-demo').getAttribute('data-template')==='shop','Share template');ok(await page.locator('.pb-demo').getAttribute('data-theme')==='dark','Share mode');ok(await page.locator('#ps-motion').isChecked()===false,'Share motion');ok(await page.locator('.pb-demo').evaluate(e=>e.style.getPropertyValue('--pb-accent'))==='#aabbcc','Share role');report.interactions.push('five-role share state restored');
 for(const old of ['#2563eb/tri','#ff5733/ana','#ff5733/light','#%E0%A4%A']){await page.goto(base+'/color/palette/ko/'+old);await page.locator('.pb-demo').waitFor();if(old.includes('%'))ok((await page.locator('#cstatus').innerText()).length>0,'Invalid hash feedback');else ok(await page.locator('#cin').inputValue()===('#'+old.slice(1).split('/')[0]),'Legacy base');}
 report.interactions.push('legacy harmony links and malformed URL');
 // Native interactions are captured in copied/downloaded HTML, not only color values.
 await open();await page.locator('#ps-motion').uncheck();
 for(const template of ['website','shop','planner'])for(const theme of ['light','dark']){
  await page.locator('button[data-template='+template+']').click();await mode(theme);
  if(template==='website'){await page.locator('.pb-note').evaluate(e=>e.open=true);}
  if(template==='shop'){await page.locator('.pb-gift-check').check();await page.locator('.pb-note').evaluate(e=>e.open=true);}
  if(template==='planner'){await page.locator('.pb-task input').nth(1).check();await page.locator('.pb-mood-choice input').nth(2).check();}
  await settle();const before=await page.locator('.pb-demo').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,colors:['background','surface','text','primary','accent'].map(k=>e.style.getPropertyValue('--pb-'+k)),checks:[...e.querySelectorAll('input')].map(i=>i.checked),note:!!e.querySelector('.pb-note[open]')}));
  await page.locator('#ps-export').click();await page.locator('button[data-format=component]').click();const html=await page.locator('#ps-code').inputValue();ok(html.includes('SIL OPEN FONT LICENSE'),'Font license missing');ok(!/\b(?:src|href)=["']https?:/.test(html),'External export asset');
  await page.locator('#ps-copy').click();await page.waitForFunction(()=>document.querySelector('#ps-dialog-status').textContent.length>0);ok((await page.locator('#ps-dialog-status').innerText()).length>0,'Copy feedback hidden by modal');
  await page.locator('button[data-format=variables]').click();const css=await page.locator('#ps-code').inputValue();ok(css.startsWith('.pb-demo {')&&css.includes('--pb-primary:'),'Scoped CSS export');
  await page.locator('button[data-format=json]').click();const json=JSON.parse(await page.locator('#ps-code').inputValue());ok(Object.keys(json.roles).length===5,'JSON role count');ok(json.template===template&&json.theme===theme,'JSON metadata');
  const ev=page.waitForEvent('download');await page.locator('#ps-download').click();const dl=await ev;const file=dir+'/exports/'+template+'-'+theme+'.html';await dl.saveAs(file);await page.keyboard.press('Escape');ok(await page.locator('#ps-export-dialog').isVisible()===false,'Escape close');
  const offline=await page.context().newPage(),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await offline.setViewportSize({width:1280,height:900});await offline.goto('file:///'+file);await offline.evaluate(()=>document.fonts.ready);
  const after=await offline.locator('.pb-demo').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,colors:['background','surface','text','primary','accent'].map(k=>e.style.getPropertyValue('--pb-'+k)),checks:[...e.querySelectorAll('input')].map(i=>i.checked),note:!!e.querySelector('.pb-note[open]')}));
  ok(JSON.stringify(before)===JSON.stringify(after),'Offline differs '+template+' '+theme+' '+JSON.stringify({before,after}));ok(requests.length===0,'Offline needs network');
  if(template==='website'){await offline.locator('.pb-note summary').click();ok(await offline.locator('.pb-note').getAttribute('open')===null,'Offline note interaction');}
  if(template==='shop'){await offline.locator('.pb-gift-check').uncheck();ok(await offline.locator('.pb-gift-check').isChecked()===false,'Offline gift interaction');}
  if(template==='planner'){await offline.locator('.pb-task input').nth(2).check();ok(await offline.locator('.pb-task input').nth(2).isChecked(),'Offline checkbox interaction');}
  await offline.screenshot({path:dir+'/exports/'+template+'-'+theme+'.png',fullPage:true});await offline.setViewportSize({width:375,height:812});const mobileOverflow=await offline.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));ok(mobileOverflow===0,'Offline mobile overflow '+template+' '+theme);await offline.screenshot({path:dir+'/exports/'+template+'-'+theme+'-375.png',fullPage:true});await offline.close();report.exports.push({template,theme,file,networkRequests:requests.length,sameLayout:true,mobileOverflow});
 }
 // Real resize, eight languages and reduced-motion support.
 for(const lang of ['en','ko','zh','ja','es','pt','de','fr']){
  await open(lang,375);for(const id of ['website','shop','planner']){await page.locator('button[data-template='+id+']').click();const m=await metrics();ok(m.overflow===0,'Language overflow '+lang+' '+id);report.languages.push({lang,id,...m});}
  await page.locator('#ps-export').click();ok(await page.locator('#ps-code').inputValue()!=='','Language export');ok(await page.locator('#ps-export-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),'Dialog overflow '+lang);await page.keyboard.press('Escape');
 }
 await open('ko',1280);await page.setViewportSize({width:375,height:812});ok(await page.locator('#ps-editor').evaluate(e=>e.open)===false,'Editor must collapse after real resize');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('button[data-preset=berry-pop]').click();await page.locator('button[data-template=shop]').click();const animations=await page.locator('.pb-demo').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length);ok(animations===0,'Reduced motion running');await page.emulateMedia({reducedMotion:'no-preference'});
 report.interactions.push('real1280→375 resize; reduced motion');ok(report.errors.length===0,'Page errors '+report.errors.join(';'));ok(report.writes.length===0,'Unexpected uploads');ok(report.external.length===0,'Unexpected external requests');
 return report;
}
