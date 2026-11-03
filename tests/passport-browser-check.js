async page => {
 const base='http://127.0.0.1:8796', root='C:/Users/boksb/Documents/ChatGPT/산업화/parkbok-hallmark-home', dir=root+'/output/playwright/gp01';
 const fixture='C:/Users/boksb/Desktop/parkbok/docs/s0/fixtures/portrait-1000x1400.jpg';
 const report={screens:[],outputs:[],inspections:[],languages:[],edits:[],regression:[],requests:[],errors:[]};
 const ok=(v,m)=>{if(!v)throw Error(m);};
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('request',r=>{if(['POST','PUT','PATCH'].includes(r.method()))report.requests.push({method:r.method(),url:r.url()});});
 async function open(lang='ko') { await page.goto(base+'/image/passport-photo/'+(lang==='en'?'':lang+'/')); }
 async function upload(f=fixture){await page.locator('#file-input').setInputFiles(f);await page.waitForFunction(()=>!document.body.classList.contains('busy')&&document.body.classList.contains('has-input'));if(page.url().includes('/passport-photo/'))await page.locator('.rsel').waitFor({state:'attached'});}
 async function select(id){await page.locator('#opt-preset').selectOption(id);}
 async function run(){await page.locator('#btn-primary').click();await page.waitForFunction(()=>!document.body.classList.contains('busy')&&!document.querySelector('#result').hidden);}
 async function metrics(){return page.evaluate(()=>{const d=document.documentElement,b=document.querySelector('#btn-primary').getBoundingClientRect(),c=document.querySelector('.rect-box')?.getBoundingClientRect();return {overflow:Math.max(0,d.scrollWidth-d.clientWidth),buttonHeight:b.height,cropTop:c&&c.height?c.top+scrollY:null,status:document.querySelector('#status').textContent};});}
 async function output(name,w,h,mime,failed){
  const value=await page.evaluate(async()=>{const b=await(await fetch(document.querySelector('#result img').src)).blob(),im=await createImageBitmap(b);const r={bytes:b.size,mime:b.type,w:im.width,h:im.height,status:document.querySelector('#status').textContent,note:document.querySelector('.result-note').textContent};im.close();return r;});
  ok(value.w===w&&value.h===h&&value.mime===mime,'Output dimensions/MIME '+name);
  ok((value.status==='용량 초과')===failed,'Size status '+name);
  const ev=page.waitForEvent('download');await page.locator('#btn-primary').click();const dl=await ev;await dl.saveAs(dir+'/'+name+(mime==='image/png'?'.png':'.jpg'));
  report.outputs.push({name,...value});
 }
 for(const width of [1280,375])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:width===1280?900:812});await open();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.screenshot({path:dir+`/initial-${width}-${theme}.png`,fullPage:true});
  await select('mx_passport');ok(await page.locator('#in').isHidden(),'Mexico should not ask for a photo');
  await select('jp_mynaportal');await upload();ok(await page.locator('#opt-preset').inputValue()==='jp_mynaportal','Preserve selection before upload');
  ok(await page.locator('#opt-format option[value=png]').isDisabled(),'Japan JPG restriction');
  ok(await page.locator('#opt-bg').isDisabled(),'Retouch restriction');
  await run();await output(`jp-${width}-${theme}`,600,730,'image/jpeg',false);
  await select('kr_passport');ok(await page.locator('#result').isHidden(),'Stale output on route change');
  await page.locator('[data-group=save]').evaluate(e=>e.open=true);await page.locator('#opt-maxKb').fill('1');await run();
  await output(`kr-over-${width}-${theme}`,413,531,'image/jpeg',true);
  await page.locator('#opt-maxKb').fill('500');await run();await output(`kr-${width}-${theme}`,413,531,'image/jpeg',false);
  ok(await page.locator('#result a').count()===2,'Official and Korea verification links');
  await select('custom');await page.locator('#opt-format').selectOption('png');await page.locator('#opt-maxKb').fill('1');await run();
  await output(`png-over-${width}-${theme}`,413,531,'image/png',true);
  await select('us_passport');await page.locator('#opt-format').selectOption('jpg');await run();await output(`us-print-${width}-${theme}`,600,600,'image/jpeg',false);
  await select('uk_passport');ok(await page.locator('[data-opt=crop]').isHidden(),'Hide crop for original');ok(await page.locator('[data-group=save]').isHidden(),'Hide save for original');
  await page.evaluate(()=>{window.__encodes=0;window.__origEncode=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...a){window.__encodes++;return window.__origEncode.apply(this,a);};});
  await run();ok(await page.locator('#result img').count()===0,'No converted original output');ok(await page.evaluate(()=>window.__encodes)===0,'Original not encoded');
  const info=await page.locator('#result').innerText();ok(info.includes('52,021 B'),'Actual original bytes');ok(await page.locator('#status').textContent()==='파일 조건 확인','No acceptance/done claim');
  await page.evaluate(()=>HTMLCanvasElement.prototype.toBlob=window.__origEncode);
  report.inspections.push({width,theme,result:info,encodes:0});
  const m=await metrics();ok(m.overflow===0,'Overflow');ok(m.buttonHeight>=56&&m.buttonHeight<=64,'Primary touch height');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+`/original-${width}-${theme}.png`,fullPage:true});report.screens.push({width,theme,...m});
 }
 // A genuine high-detail JPEG exercises Canada's minimum size and exact portrait aspect ratio.
 const valid=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=1800;const g=c.getContext('2d'),im=g.createImageData(1200,1800);let seed=731;for(let i=0;i<im.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;im.data[i]=seed>>>24;im.data[i+1]=seed>>>16;im.data[i+2]=seed>>>8;im.data[i+3]=255;}g.putImageData(im,0,0);return c.toDataURL('image/jpeg',.85).split(',')[1];}),'base64');
 await open();await select('ca_passport');await upload({name:'synthetic-canada.jpg',mimeType:'image/jpeg',buffer:valid});
 const hash=()=>page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await document.querySelector('#file-input').files[0].arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join(''));
 const before=await hash();await run();ok(await hash()===before,'Original SHA-256 unchanged');ok(await page.locator('#status').innerText()==='파일 조건 확인','Canada real JPEG should match');report.inspections.push({country:'Canada',bytes:valid.length,sha256:before,unchanged:true});
 await page.setViewportSize({width:1280,height:900});await page.setViewportSize({width:375,height:812});ok(await page.locator('[data-opt=crop]').isHidden(),'Inspection survives real resize');
 await select('jp_passport');ok(await page.locator('#result').isHidden(),'Inspection invalidated');ok(await page.locator('[data-opt=crop]').isVisible(),'Crop restored after inspection');report.edits.push('inspection → crop; real1280→375');
 for(const lang of ['en','ko','zh','ja','es','pt','de','fr']){
  await open(lang);await select('mx_passport');ok(await page.locator('#in').isHidden(),lang+' info');
  await select('uk_passport');await upload();await run();const text=await page.locator('#result').innerText(),m=await metrics();
  ok(!/checkMatch|fileCheckDone|originalUnchanged|unknownPixels/.test(text),'No untranslated key '+lang);ok(m.overflow===0,'Language overflow '+lang);ok(m.buttonHeight>=56&&m.buttonHeight<=64,'Language primary height '+lang);
  report.languages.push({lang,...m});
 }
 for(const tool of ['image-crop','blur','image-compress']){
  await page.goto(base+'/image/'+tool+'/ko/');await upload();
  if(tool!=='image-compress'){
   await page.waitForFunction(()=>document.querySelector('.rect-bg').width>1);
   await page.locator('.rect-box').evaluate(e=>e.scrollIntoView({block:'center'}));
   if(tool==='blur'){const b=await page.locator('.rect-layer').boundingBox();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.2);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height*.8,{steps:4});await page.mouse.up();}
   const hits=[];
   for(const cls of ['rh-nw','rh-ne','rh-sw','rh-se']){
    const handle=page.locator('.'+cls);await handle.evaluate(e=>e.scrollIntoView({block:'center'}));
    hits.push(await handle.evaluate(el=>{const r=el.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2;return {handle:el.className,hits:[[-21,-21],[21,-21],[-21,21],[21,21]].map(([x,y])=>{const t=document.elementFromPoint(cx+x,cy+y);return !!t&&t.closest('.rh')===el;})};}));
   }
   ok(hits.length===4&&hits.every(h=>h.hits.every(Boolean)),tool+' edge hit areas');
   report.regression.push({tool,hits});
  }else{await run();ok(await page.locator('#status').textContent()==='완료','Compression regression');report.regression.push({tool,status:'완료'});}
 }
 ok(report.errors.length===0,'Browser errors: '+report.errors.join(';'));ok(report.requests.length===0,'Unexpected mutation requests');
 return report;
}
