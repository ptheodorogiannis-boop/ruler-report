// Serve demo-host/build/ the way a Claude Artifact does, for the local end-to-end test: the page wrapped in the Artifact
// skeleton, a CSP like the Artifact's, and print/alert/confirm/prompt doing nothing as in the viewer.
// Usage (repository root): node demo-host/serve.mjs [port=3199]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build');
const port = Number(process.argv[2] ?? 3199);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' };
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
].join('; ');
const SKELETON = (page) =>
  `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style><script>window.print=function(){};window.alert=function(){};window.confirm=function(){return false};window.prompt=function(){return null};</script></head><body>${page}</body></html>`;

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '' || rel === 'index.html') {
      res.writeHead(200, { 'content-type': TYPES['.html'], 'content-security-policy': CSP, 'cache-control': 'no-store' });
      return res.end(SKELETON(fs.readFileSync(path.join(root, 'index.html'), 'utf8')));
    }
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'content-security-policy': CSP, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`demo on http://localhost:${port}`));
