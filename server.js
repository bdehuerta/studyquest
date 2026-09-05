// StudyQuest prototype server. Node stdlib only — no dependencies, no build step.
// Serves the web/ + shared/ folders as static ES modules and routes /api/* to api.js.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, saveState } from './server/store.js';
import { handleApi } from './server/api.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 7777;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  // Audio. Without an entry here the static handler 404s the file by design —
  // the MIME map IS the allow-list, which is what stops it serving the source
  // tree to anyone who asks.
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

let state = loadState();
const save = (s) => saveState(s);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

// Only ever serve files that resolve inside ROOT, and only known extensions.
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) return send(res, 403, 'forbidden', 'text/plain');

  const ext = path.extname(abs);
  if (!MIME[ext]) return send(res, 404, 'not found', 'text/plain');

  fs.readFile(abs, (err, buf) => {
    if (err) return send(res, 404, `not found: ${rel}`, 'text/plain');
    send(res, 200, buf, MIME[ext]);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') return send(res, 405, JSON.stringify({ ok: false, error: 'method not allowed' }));
    return serveStatic(req, res, url.pathname);
  }

  const body = req.method === 'GET' ? {} : await readBody(req);
  if (body === null) return send(res, 400, JSON.stringify({ ok: false, error: 'malformed JSON body' }));

  try {
    const out = await handleApi(url.pathname, body, state, save);
    // api.js may hand back a fresh object (e.g. after /api/dev/reset)
    if (out.json && out.json.state) state = out.json.state;
    send(res, out.status || 200, JSON.stringify(out.json));
  } catch (err) {
    // A bug in game logic must never take the server down mid-demo.
    console.error('[api]', url.pathname, err);
    send(res, 200, JSON.stringify({ ok: false, error: `server error: ${err.message}` }));
  }
});

server.listen(PORT, () => {
  // Saves live wherever the store decided: SQ_DATA_DIR when the native app sets
  // it, otherwise <root>/data. Report the real one, not an assumed path.
  const dataDir = process.env.SQ_DATA_DIR
    ? process.env.SQ_DATA_DIR.replace(/^~/, process.env.HOME || '~')
    : path.join(ROOT, 'data');
  console.log(`\n  StudyQuest  →  http://localhost:${PORT}\n  saves       →  ${dataDir}\n  ctrl-c to stop\n`);
});
