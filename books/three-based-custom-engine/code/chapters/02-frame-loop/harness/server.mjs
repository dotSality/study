// Сервер стенда. Свой, а не esbuild --serve: странице нужны заголовки COOP/COEP,
// а в ServeOptions esbuild 0.28.1 произвольных заголовков нет.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function createStandServer(webDir) {
  const root = path.resolve(webDir);
  return http.createServer((req, res) => {
    const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    // Chrome сам просит /favicon.ico; 404 на него испортил бы критерий
    // «ноль ошибок в консоли».
    if (rel === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
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
  });
}

export async function startStandServer(webDir) {
  const server = createStandServer(webDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/index.html`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
