'use strict';
// Three real tools, translated at response time. This does not generate or publish an Arabic site.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ar=require('./arabic-pilot/strings');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const safeJson=o=>JSON.stringify(o).replace(/</g,'\\u003c');
const routes=[
  {id:'image-compress',section:'image',route:'/image/image-compress/ar/'},
  {id:'image-resize',section:'image',route:'/image/image-resize/ar/'},
  {id:'jpg-to-pdf',section:'pdf',route:'/pdf/jpg-to-pdf/ar/'}
];
const css=fs.readFileSync(path.join(__dirname,'arabic-pilot/pilot.css'),'utf8');
const helpers=fs.readFileSync(path.join(__dirname,'arabic-pilot/pilot.js'),'utf8');
function normalizeArabicNumber(v){return String(v).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0)).replace(/٫/g,'.').replace(/٬/g,'');}
function stripPublic(html){return html.replace(/<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>\s*/g,'').replace(/<meta\b[^>]*(?:property="og:|name="twitter:)[^>]*>\s*/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/googlesyndication|googletagmanager|gtag\(|application\/ld\+json/.test(s)?'':s);}
function shell(html,active,english){
  html=stripPublic(html).replace(/<html\b[^>]*>/,'<html lang="ar" dir="rtl">');
  const nav=routes.map(r=>'<a href="'+r.route+'"'+(r.id===active?' class="on"':'')+'>'+esc(ar.tools[r.id].h1)+'</a>').join('')+'<a href="http://127.0.0.1:8796'+english+'" lang="en" dir="ltr">English</a>';
  html=html.replace(/<nav class="menu"[\s\S]*?<\/nav>/,'<nav class="menu" aria-label="القائمة الرئيسية">'+nav+'</nav>');
  html=html.replace(/aria-label="Light \/ dark"/g,'aria-label="الوضع الفاتح أو الداكن"').replace(/title="Light \/ dark"/g,'title="الوضع الفاتح أو الداكن"');
  const at=html.indexOf('// 모바일 메뉴:');if(at>=0){const end=html.indexOf('</script></header>',at);if(end<0)throw Error('Header marker changed');html=html.slice(0,at)+html.slice(end);}
  html=html.replace(/<footer\b[\s\S]*?<\/footer>/,'<footer class="foot"><div class="wrap"><nav class="foot-links" aria-label="روابط الموقع"><a href="http://127.0.0.1:8796/about.html">عن الموقع (بالكورية)</a><a href="http://127.0.0.1:8796/privacy.html">الخصوصية (بالكورية)</a><a href="http://127.0.0.1:8796/terms.html">الشروط (بالكورية)</a></nav><p class="foot-copy" dir="ltr">© parkbok</p></div></footer>');
  html=html.replace('</head>','<meta name="robots" content="noindex,nofollow,noarchive"><style id="arabic-pilot-css">'+css+'</style></head>');
  return html.replace('</body>','<script>'+helpers+'</script></body>');
}
function renderPage(r){
  const strings=ar.tools[r.id],prefix=r.section==='image'?'IMGT':'PDFT';
  let html=fs.readFileSync(path.join(root,r.section,r.id,'index.html'),'utf8');
  const re=new RegExp('window\\.'+prefix+'_STRINGS=([\\s\\S]*?);window\\.'+prefix+'_TOOL=([\\s\\S]*?);</script>');
  const m=html.match(re);if(!m)throw Error('Config marker changed: '+r.id);
  const config=JSON.parse(m[2]);config.lang='ar';config.langUrls={ar:r.route,en:'http://127.0.0.1:8796/'+r.section+'/'+r.id+'/'};config.strings=strings;
  config.next=routes.filter(x=>x.id!==r.id).map(x=>({id:x.id,url:x.route,h1:ar.tools[x.id].h1}));
  html=html.replace(re,'window.'+prefix+'_STRINGS='+safeJson(ar[r.section])+';window.'+prefix+'_TOOL='+safeJson(config)+';</script>');
  html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>'+esc(strings.title)+'</title>').replace(/<meta name="description"[^>]*>/,'<meta name="description" content="'+esc(strings.description)+'">');
  html=html.replace(/<div class="tool-head">[\s\S]*?<\/div>/,'<div class="tool-head"><h1>'+esc(strings.h1)+'</h1><p class="lead">'+esc(strings.line)+'</p></div>');
  const replacements={Select_images:strings.buttonText};
  html=html.replace(/(<div class="drop"[^>]*aria-label=")[^"]*(")/,'$1'+esc(strings.buttonText)+'$2');
  const buttons={'btn-select':strings.buttonText,'btn-add':ar[r.section].addMore,'btn-reset-top':ar[r.section].startOver,'btn-primary':strings.runText,'btn-reset':ar[r.section].startOver};
  for(const [id,label]of Object.entries(buttons))html=html.replace(new RegExp('(<button\\b[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(</button>)'),'$1'+esc(label)+'$2');
  html=html.replace(/<div class="droptxt">[\s\S]*?<\/div>/,'<div class="droptxt">'+esc(ar[r.section].dropText)+'</div>');
  html=html.replace(/<nav class="chips next"[\s\S]*?<\/nav>/,'<nav class="chips next" aria-label="'+esc(ar[r.section].nextTools)+'">'+config.next.map(x=>'<a class="chip" href="'+x.url+'">'+esc(x.h1)+'</a>').join('')+'</nav>');
  html=html.replace(/<details class="about">[\s\S]*?<\/details>/,'<details class="about"><summary>'+esc(ar[r.section].aboutTitle)+'</summary><p>'+esc(ar[r.section].aboutLine)+'</p><dl class="faq">'+strings.faq.map(q=>'<dt>'+esc(q[0])+'</dt><dd>'+esc(q[1])+'</dd>').join('')+'</dl><p class="pilot-scope">معاينة عربية تجريبية. لم تُنشر هذه النسخة ولم تُراجع لغويًا من متحدث أصلي بعد.</p></details>');
  return shell(html,r.id,'/'+r.section+'/'+r.id+'/');
}
function renderHub(){
  let html=fs.readFileSync(path.join(root,'image/index.html'),'utf8');
  html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>أدوات الصور والملفات — معاينة بالعربية</title>').replace(/<div class="tool-head">[\s\S]*?<\/div>/,'<div class="tool-head"><h1>أدوات الصور والملفات</h1><p class="lead">ثلاث أدوات تعمل داخل متصفحك. اختر ما تحتاجه وابدأ.</p></div>');
  html=html.replace(/<div class="grid tools-grid">[\s\S]*?<\/div>/,'<div class="grid tools-grid">'+routes.map(r=>'<a class="card" href="'+r.route+'"><h3>'+esc(ar.tools[r.id].h1)+'</h3><p>'+esc(ar.tools[r.id].line)+'</p></a>').join('')+'</div>');
  html=html.replace(/<details class="about">[\s\S]*?<\/details>/,'<details class="about"><summary>عن هذه المعاينة</summary><p>معاينة محلية لثلاث أدوات باللغة العربية. تعالج الملفات بمحركات الموقع الفعلية. لم تُنشر النسخة ولم تُراجع لغويًا من متحدث أصلي بعد.</p></details>');
  html=html.replace(/<script>window\.IMGT_STRINGS=[\s\S]*?<\/script>/,'').replace(/<script src="\/image\/img-tools\.js" defer><\/script>/,'');
  return shell(html,'','/image/');
}
function transformRuntime(source){
  // Keep machine coordinates/order unchanged. Only local numeric parsing and visible reorder directions adapt.
  const normalize='window.__pbArabicNumber='+normalizeArabicNumber.toString()+';\n';
  return normalize+source.replace(/\b(inp|input)\.type = 'number'/g,(_,name)=>name+".type = 'text'; "+name+".setAttribute('inputmode','decimal'); "+name+".setAttribute('dir','ltr'); "+name+".setAttribute('data-pilot-number','1')").replace(/parseFloat\(inp\.value\)/g,'parseFloat(window.__pbArabicNumber(inp.value))').replace(/Number\(input\.value\)/g,'Number(window.__pbArabicNumber(input.value))').replace(/var l = el\('button', 'ibtn', '←'\)/g,"var l = el('button', 'ibtn', '→')").replace(/var r = el\('button', 'ibtn', '→'\)/g,"var r = el('button', 'ibtn', '←')");
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.woff2':'font/woff2','.wasm':'application/wasm'};
function createServer(){return http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  let route;try{route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);return res.end();}
  try{
    let data,type='text/html; charset=utf-8';const def=routes.find(r=>r.route===route);
    if(route==='/')data=renderHub();else if(def)data=renderPage(def);else{
      if(!(route.startsWith('/assets/')||route.startsWith('/image/tools/')||route.startsWith('/pdf/tools/')||['/image/img-tools.js','/pdf/pdf-tools.js','/favicon.svg','/favicon.ico','/favicon-32.png','/icon-180.png','/icon-192.png','/icon-512.png','/manifest.json'].includes(route))){res.writeHead(404);return res.end();}
      const file=path.resolve(root,'.'+route);if(!file.startsWith(root+path.sep)||route.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.'))){res.writeHead(404);return res.end();}
      data=fs.readFileSync(file);if(['/image/img-tools.js','/pdf/pdf-tools.js','/image/tools/image-compress.js'].includes(route))data=transformRuntime(data.toString('utf8'));type=types[path.extname(file)]||'application/octet-stream';
    }
    res.writeHead(200,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end('Local preview could not be rendered.');console.error(e.message);}
});}
if(require.main===module){const port=Number(process.argv[2]||8797);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');createServer().listen(port,'127.0.0.1',()=>console.log('Arabic local pilot: http://127.0.0.1:'+port+'/'));}
module.exports={routes,renderPage,renderHub,transformRuntime,normalizeArabicNumber,createServer};
