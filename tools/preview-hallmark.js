// Local design review only. No routes from this server are published.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync}=require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline=execFileSync('git',['show','1c6d862f:index.html'],{cwd:root,maxBuffer:2*1024*1024});
const port = Number(process.argv[2] || 8796);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.woff2':'font/woff2','.wasm':'application/wasm'};
http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);return res.end();}
  let route;
  try {route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);return res.end();}
  let file;
  if (route === '/_hallmark/' || route === '/_hallmark') file=path.join(__dirname,'hallmark-compare.html');
  else if (route === '/_hallmark/before/') {res.writeHead(200,{'Content-Type':types['.html']});return res.end(req.method==='HEAD'?undefined:baseline);}
  else if (route === '/_hallmark/b/') file=path.join(root,'index.html');
  else {
    const parts=route.split(/[\\/]/).filter(Boolean);
    if (parts[0]==='tools' || parts.some(x=>x.startsWith('.') || ['_build','docs','tests','node_modules','src'].includes(x))) {res.writeHead(404);return res.end();}
    file=path.resolve(root,'.'+route);
    if (file!==root&&!file.startsWith(root+path.sep)) {res.writeHead(404);return res.end();}
  }
  try {
    if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.statSync(file).isFile())throw Error('not a file');
    const data=fs.readFileSync(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch {res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Hallmark comparison: http://127.0.0.1:${port}/_hallmark/`));
