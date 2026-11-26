// PROTOTYPE (branch prototype/pp-ocrv6, throwaway): serves a built dist/ with the headers nginx sends
// (nginx-headers.conf), so the WebKit run on a macOS runner, which has no Docker, reads under the real CSP.
// Usage: node serve.mjs <dist> <port>
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [dist, port] = process.argv.slice(2);
const conf = readFileSync(new URL('../../../../nginx-headers.conf', import.meta.url), 'utf8');
const headers = Object.fromEntries([...conf.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"/gm)].map((m) => [m[1], m[2]]));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dist, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, headers);
    res.end();
  }
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${dist} on http://127.0.0.1:${port} with ${Object.keys(headers).join(', ')}`));
