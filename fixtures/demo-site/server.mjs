import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  if (!extname(p)) p += '.html';
  const f = join(root, p);
  if (!f.startsWith(root) || !existsSync(f)) {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(port, () => console.log(`demo site: http://localhost:${port}`));
