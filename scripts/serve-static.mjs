/**
 * A static server that behaves like Vercel, for verifying deploys.
 *
 * The important detail: a request for `/dir` (no trailing slash) serves
 * `/dir/index.html` **without redirecting**, exactly as Vercel does. Python's
 * http.server issues a 301 to `/dir/` instead, which silently papers over
 * relative-asset bugs — that is how a broken deploy got past verification once.
 *
 *   node scripts/serve-static.mjs <root> [port]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const root = process.argv[2] || '.';
const port = Number(process.argv[3] || 4180);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const send = (res, code, body, type = 'text/plain') => {
  res.writeHead(code, { 'content-type': type });
  res.end(body);
};

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const path = join(root, normalize(url).replace(/^(\.\.[/\\])+/, ''));

  try {
    const info = await stat(path).catch(() => null);

    if (info?.isFile()) {
      return send(res, 200, await readFile(path), TYPES[extname(path)] || 'application/octet-stream');
    }
    // Directory — serve its index.html in place, no redirect. This is the case
    // that distinguishes a working deploy from a broken one.
    if (info?.isDirectory()) {
      const index = join(path, 'index.html');
      if (await stat(index).catch(() => null)) {
        return send(res, 200, await readFile(index), TYPES['.html']);
      }
    }
    send(res, 404, `not found: ${url}`);
  } catch (err) {
    send(res, 500, String(err));
  }
}).listen(port, () => {
  console.log(`serving ${root} on http://localhost:${port} (Vercel-style, no trailing-slash redirect)`);
});
