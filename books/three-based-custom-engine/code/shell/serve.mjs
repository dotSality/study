// Стенд-оболочка: собрать все состояния движка и поднять их на одной странице.
// Сервер свой по той же причине, что и в главе 1 (решение Р1.2): нужны COOP/COEP.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { buildAll } from './build-all.mjs';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');
const PORT = 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

await buildAll();

http
  .createServer((req, res) => {
    const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    if (rel === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const file = path.join(webDir, rel);
    if (!file.startsWith(webDir) || !fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`стенд: http://127.0.0.1:${PORT}/`);
  });
