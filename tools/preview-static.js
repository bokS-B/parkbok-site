// Development preview only: static GET/HEAD, no upload or document conversion API.
// node tools/preview-static.js 8790
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 8790);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (_) { res.writeHead(400); return res.end(); }
  const parts = pathname.split(/[\\/]/).filter(Boolean);
  if (parts[0] === 'tools' || parts.some(x => x.startsWith('.') || ['_build', 'docs', 'tests', 'test-results', 'node_modules', 'src'].includes(x))) { res.writeHead(404); return res.end(); }
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(404); return res.end(); }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.statSync(file).isFile()) throw Error('not a file');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch (_) { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Static preview: http://127.0.0.1:${port}/`));
