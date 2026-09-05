// tools/lib/server.mjs — boot `node server.js` on a scratch port + scratch data
// dir, wait until it actually answers, and tear it down without fail.
//
// The scratch data dir is not a convenience, it is a safety rule: the harness
// must never be able to touch ~/Library/Application Support/StudyQuest. We pass
// SQ_DATA_DIR explicitly on every boot, and refuse to start if it resolves
// anywhere near the real save location.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnTracked, killTracked, freePort, waitFor, sleep } from './proc.mjs';

const REAL_SAVE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'StudyQuest');

export function assertScratch(dir) {
  const abs = path.resolve(dir);
  if (abs === REAL_SAVE_DIR || abs.startsWith(REAL_SAVE_DIR + path.sep)) {
    throw new Error(`refusing to run against the real save directory: ${abs}`);
  }
  return abs;
}

export function makeScratchDir(tag = 'run') {
  return assertScratch(fs.mkdtempSync(path.join(os.tmpdir(), `sq-smoke-${tag}-`)));
}

export class GameServer {
  constructor({ root, dataDir, port, child }) {
    this.root = root;
    this.dataDir = dataDir;
    this.port = port;
    this.child = child;
    this.stdout = '';
    this.stderr = '';
  }

  get base() { return `http://127.0.0.1:${this.port}`; }

  /** Anything the server logged to stderr, which for this server means a
   *  caught-but-real exception inside handleApi. Worth failing a run over. */
  get serverErrors() {
    return this.stderr
      .split('\n')
      .filter((l) => l.trim() && !/^\s*$/.test(l))
      .filter((l) => /\[api\]|\[slots\]\s+(write failed|could not)|Error:|error:/i.test(l));
  }

  static async start({ root, dataDir, env = {}, timeoutMs = 20000 }) {
    assertScratch(dataDir);
    fs.mkdirSync(dataDir, { recursive: true });
    const port = await freePort();
    const child = spawnTracked('server', process.execPath, ['server.js'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port), SQ_DATA_DIR: dataDir, NODE_ENV: 'test', ...env },
    });
    const srv = new GameServer({ root, dataDir, port, child });
    child.stdout.on('data', (b) => { srv.stdout += b; });
    child.stderr.on('data', (b) => { srv.stderr += b; });

    let died = null;
    child.on('exit', (code, sig) => { died = `server exited early (code ${code}, signal ${sig})`; });

    try {
      await waitFor(async () => {
        if (died) throw new Error(died);
        const res = await fetch(`${srv.base}/api/state`);
        if (!res.ok) return false;
        const json = await res.json();
        return json && json.ok === true;
      }, { timeoutMs, intervalMs: 100, label: `${srv.base}/api/state` });
    } catch (err) {
      const detail = [srv.stdout, srv.stderr].filter(Boolean).join('\n').trim();
      await killTracked(child, 500);
      throw new Error(`${err.message}\n${died || ''}\n--- server output ---\n${detail || '(nothing)'}`);
    }
    return srv;
  }

  async api(route, body) {
    const url = `${this.base}${route.startsWith('/') ? route : `/${route}`}`;
    const init = body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  }

  async stop() {
    await killTracked(this.child, 2000);
    await sleep(50);
  }

  /** Delete the scratch data dir. Refuses anything that is not scratch. */
  cleanup() {
    try {
      assertScratch(this.dataDir);
      fs.rmSync(this.dataDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  }
}

/**
 * Write a seed map into a data dir. Keys are paths relative to the dir;
 * values are objects (written as JSON) or strings (written verbatim).
 * This is how the migration suite plants a v1, a v2 and a v3 save side by side.
 */
export function seedDataDir(dir, seed) {
  assertScratch(dir);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, value] of Object.entries(seed || {})) {
    const abs = path.resolve(dir, rel);
    if (!abs.startsWith(path.resolve(dir) + path.sep)) {
      throw new Error(`seed path escapes the scratch dir: ${rel}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8');
  }
}
