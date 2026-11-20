import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../docs/', import.meta.url)).replace(/[\\/]$/, '');
const port = Number(process.env.JOURNAL_PORT ?? 4173);
const prefix = '/ressenti/';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname.slice(1);
    const filename = resolve(root, relative || 'index.html');
    if (!filename.startsWith(root + sep) || !(await stat(filename)).isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(filename).pipe(res);
  } catch {
    res.writeHead(404);
    res.end('Introuvable');
  }
}).listen(port, '127.0.0.1', () => console.log(`Journal disponible sur http://127.0.0.1:${port}${prefix}`));