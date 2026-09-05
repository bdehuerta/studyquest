// tools/lib/cdp.mjs — a minimal Chrome DevTools Protocol client.
//
// Zero dependencies: Node 24 ships a global WebSocket, and Chrome's discovery
// endpoints are plain HTTP. We connect straight to the *page* target's socket
// rather than the browser's, which means no flat-session bookkeeping — every
// Runtime/Page/Log/Input command applies to the one tab we drive.
//
// The console-error capture is the point of this file. A throw inside a render
// loop or a setState handler does not fail an HTTP request and does not change
// the DOM in any way a selector assertion would notice; it only shows up here.

import { spawnTracked, killTracked, freePort, waitFor, sleep } from './proc.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function chromeAvailable() {
  try { return fs.statSync(CHROME).isFile(); } catch { return false; }
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export class Browser {
  constructor({ port, child, userDataDir }) {
    this.port = port;
    this.child = child;
    this.userDataDir = userDataDir;
  }

  static async launch({ headless = true, windowSize = '1280,800' } = {}) {
    if (!chromeAvailable()) {
      throw new Error(`Chrome was not found at ${CHROME}. Install Google Chrome, or run with --no-browser.`);
    }
    const port = await freePort();
    // A throwaway profile per run: no extensions, no restored tabs, no
    // "Chrome didn't shut down correctly" bubble stealing the first paint.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-chrome-'));
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--disable-extensions',
      '--mute-audio',
      `--window-size=${windowSize}`,
      'about:blank',
    ];
    if (headless) args.unshift('--headless=new');

    const child = spawnTracked('chrome', CHROME, args, { stdio: 'ignore' });
    const browser = new Browser({ port, child, userDataDir });
    await waitFor(async () => {
      const v = await getJSON(`http://127.0.0.1:${port}/json/version`);
      return !!v.webSocketDebuggerUrl;
    }, { timeoutMs: 20000, label: 'Chrome DevTools endpoint' });
    return browser;
  }

  /**
   * A FRESH TAB PER SUITE.
   *
   * This used to hand every suite the same about:blank tab Chrome opens at
   * launch, and `Page.close()` parked it back on about:blank between suites.
   * That was never enough: a suite leaves service workers, timers, pending
   * fetches and a render loop behind, and the next suite inherits all of it in
   * the same renderer. The symptom was a full run where `Page.captureScreenshot`
   * or `Runtime.evaluate` hung for 30s in whichever suite happened to run after
   * the heavy ones — while every one of those suites passed alone.
   *
   * So: create a new target here and dispose of it in `close()`. Chrome's own
   * launch tab is never touched, which is what keeps this safe — disposing of
   * the LAST tab exits the browser and strands every later suite, and that is
   * why the old code would not close anything.
   */
  async page() {
    // Make sure the browser is up and has at least Chrome's own launch tab, so
    // the target we add is never the only one.
    await waitFor(async () => {
      const list = await getJSON(`http://127.0.0.1:${this.port}/json/list`);
      return list.some((t) => t.type === 'page') ? true : null;
    }, { timeoutMs: 15000, label: 'a page target' });

    const created = await this._newTarget();
    const page = new Page(created.webSocketDebuggerUrl);
    // Keep the id and the port so close() can actually dispose of the tab.
    page.targetId = created.id;
    page.devtoolsPort = this.port;
    await page.connect();
    return page;
  }

  /**
   * `/json/new` wants PUT on current Chrome and GET on older builds, and it
   * answers 405 rather than anything descriptive when you pick wrong. Try both,
   * then fall back to reusing an existing tab so a Chrome version change
   * degrades to the old behaviour instead of failing the whole run.
   */
  async _newTarget() {
    const url = `http://127.0.0.1:${this.port}/json/new?about:blank`;
    for (const method of ['PUT', 'GET']) {
      try {
        const res = await fetch(url, { method });
        if (!res.ok) continue;
        const t = await res.json();
        if (t && t.webSocketDebuggerUrl) return t;
      } catch { /* try the next verb */ }
    }
    const list = await getJSON(`http://127.0.0.1:${this.port}/json/list`);
    const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!pages.length) throw new Error('could not open or find a page target');
    return pages[0];
  }

  async close() {
    await killTracked(this.child, 2000);
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

export class Page {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    /** Everything that went wrong in the page, in order. */
    this.consoleErrors = [];
    /** Everything the page said, for the failure report's context. */
    this.consoleLog = [];
    this.collecting = true;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      const fail = (e) => reject(new Error(`CDP socket failed: ${e && e.message ? e.message : 'closed'}`));
      ws.addEventListener('error', fail, { once: true });
      ws.addEventListener('open', async () => {
        ws.removeEventListener('error', fail);
        ws.addEventListener('message', (ev) => this._onMessage(ev.data));
        ws.addEventListener('close', () => {
          for (const { reject: rj } of this.pending.values()) rj(new Error('CDP socket closed'));
          this.pending.clear();
        });
        try {
          await this.send('Runtime.enable');
          await this.send('Log.enable');
          await this.send('Page.enable');
          await this.send('Network.enable');
          resolve(this);
        } catch (err) { reject(err); }
      }, { once: true });
    });
  }

  _record(kind, text, detail) {
    if (!this.collecting) return;
    const entry = { kind, text: String(text).slice(0, 4000), detail, at: Date.now() };
    this.consoleLog.push(entry);
    if (kind === 'error' || kind === 'exception' || kind === 'requestFailed') {
      this.consoleErrors.push(entry);
    }
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? ` — ${msg.error.data}` : ''}`));
      else resolve(msg.result);
      return;
    }

    const p = msg.params || {};
    switch (msg.method) {
      case 'Runtime.consoleAPICalled': {
        const text = (p.args || []).map(describeRemote).join(' ');
        // console.error is how main.js reports a panel's setState throwing —
        // "One panel throwing must not stop the others" means the throw is
        // swallowed and this is the ONLY trace of it. It must fail the run.
        this._record(p.type === 'error' ? 'error' : p.type === 'warning' ? 'warn' : 'log', text);
        break;
      }
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails || {};
        const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception';
        const where = d.url ? ` (${d.url}:${(d.lineNumber ?? 0) + 1}:${(d.columnNumber ?? 0) + 1})` : '';
        this._record('exception', `${desc}${where}`);
        break;
      }
      case 'Log.entryAdded': {
        const e = p.entry || {};
        if (e.level === 'error') this._record('error', `[${e.source}] ${e.text}${e.url ? ` (${e.url})` : ''}`);
        else if (e.level === 'warning') this._record('warn', `[${e.source}] ${e.text}`);
        break;
      }
      case 'Network.loadingFailed': {
        // A 404 on an ES module is silent in the DOM but fatal to the game.
        if (p.type === 'Script' || p.type === 'Stylesheet' || p.type === 'Document' || p.type === 'XHR' || p.type === 'Fetch') {
          this._record('requestFailed', `${p.type} failed to load: ${p.errorText}`);
        }
        break;
      }
      default: break;
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) return reject(new Error('CDP socket is not open'));
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP ${method} timed out after 30s`));
        }
      }, 30000).unref?.();
    });
  }

  /** Evaluate an expression in the page and return its JS value. Throws on page throw. */
  async evaluate(expression, { awaitPromise = true } = {}) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(() => { ${/\breturn\b|;/.test(expression) ? expression : `return (${expression});`} })()`,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text;
      throw new Error(`evaluate threw: ${desc}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async navigate(url, { waitUntil = 'load', timeoutMs = 20000 } = {}) {
    const loaded = new Promise((resolve) => {
      const onMsg = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        const done = waitUntil === 'domcontentloaded'
          ? m.method === 'Page.domContentEventFired'
          : m.method === 'Page.loadEventFired';
        if (done) { this.ws.removeEventListener('message', onMsg); resolve(true); }
      };
      this.ws.addEventListener('message', onMsg);
      setTimeout(() => { this.ws.removeEventListener('message', onMsg); resolve(false); }, timeoutMs).unref?.();
    });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  /** A real key event, so the game's window-level keydown handlers fire. */
  /**
   * HOLD a key down for `ms`, then release it.
   *
   * `key()` sends keyDown and keyUp back to back, which is right for a command
   * (Tab, Escape, 1) and useless for movement: the player moves while a key is
   * HELD, so fifty taps travel about as far as one. Anything that walks needs
   * this instead.
   */
  async hold(key, ms = 500, { modifiers = 0 } = {}) {
    const info = keyInfo(key);
    const base = {
      modifiers,
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.vk,
      nativeVirtualKeyCode: info.vk,
    };
    await this.send('Input.dispatchKeyEvent', {
      ...base, type: 'keyDown', text: info.text, unmodifiedText: info.text,
    });
    // Chrome only autorepeats for text input; a game reading keydown/keyup
    // state does not need repeats, just the gap.
    await sleep(Math.max(0, Number(ms) || 0));
    await this.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
  }

  async key(key, { modifiers = 0 } = {}) {
    const info = keyInfo(key);
    for (const type of ['keyDown', 'char', 'keyUp']) {
      if (type === 'char' && !info.text) continue;
      await this.send('Input.dispatchKeyEvent', {
        type: type === 'char' ? 'char' : type,
        modifiers,
        key: info.key,
        code: info.code,
        windowsVirtualKeyCode: info.vk,
        nativeVirtualKeyCode: info.vk,
        text: type === 'char' ? info.text : (type === 'keyDown' ? info.text : undefined),
        unmodifiedText: type === 'keyDown' ? info.text : undefined,
      });
    }
  }

  /** Click the centre of the first element matching `selector`. */
  async click(selector) {
    const box = await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    `);
    if (!box) throw new Error(`click: no element matches ${selector}`);
    if (box.w === 0 || box.h === 0) throw new Error(`click: ${selector} has zero size (hidden?)`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type, x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1,
      });
    }
  }

  async screenshot(file) {
    const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  }

  /** Forget everything collected so far — used between suites. */
  reset() {
    this.consoleErrors = [];
    this.consoleLog = [];
  }

  async close() {
    // Park on about:blank FIRST. This tears the app down — render loop, timers,
    // in-flight fetches — while the socket is still up to acknowledge it, so
    // the dispose below never races a page that is mid-frame.
    try { await this.send('Page.navigate', { url: 'about:blank' }); } catch { /* already gone */ }
    await sleep(80);
    try { this.ws && this.ws.close(); } catch { /* ignore */ }
    await sleep(20);
    // Then actually dispose of the tab. `Browser.page()` gave this suite its
    // own, and Chrome's launch tab is still open, so this can never be the last
    // one — which is the thing that used to take the whole browser down.
    if (this.targetId && this.devtoolsPort) {
      try {
        await fetch(`http://127.0.0.1:${this.devtoolsPort}/json/close/${this.targetId}`);
      } catch { /* the tab may already be gone; the run continues either way */ }
      await sleep(60);
    }
  }
}

function describeRemote(arg) {
  if (!arg) return '';
  if (arg.type === 'string') return arg.value;
  if ('value' in arg) return JSON.stringify(arg.value);
  if (arg.description) return arg.description;
  if (arg.preview && arg.preview.properties) {
    return `{${arg.preview.properties.map((p) => `${p.name}: ${p.value}`).join(', ')}}`;
  }
  return arg.type || '?';
}

const NAMED_KEYS = {
  Enter:     { code: 'Enter',      vk: 13, text: '\r' },
  Escape:    { code: 'Escape',     vk: 27, text: '' },
  Tab:       { code: 'Tab',        vk: 9,  text: '\t' },
  Space:     { code: 'Space',      vk: 32, text: ' ', key: ' ' },
  ArrowUp:   { code: 'ArrowUp',    vk: 38, text: '' },
  ArrowDown: { code: 'ArrowDown',  vk: 40, text: '' },
  ArrowLeft: { code: 'ArrowLeft',  vk: 37, text: '' },
  ArrowRight:{ code: 'ArrowRight', vk: 39, text: '' },
  Backspace: { code: 'Backspace',  vk: 8,  text: '' },
};

function keyInfo(key) {
  if (NAMED_KEYS[key]) return { key: NAMED_KEYS[key].key || key, ...NAMED_KEYS[key] };
  const ch = String(key);
  const upper = ch.toUpperCase();
  if (/^[a-zA-Z]$/.test(ch)) return { key: ch, code: `Key${upper}`, vk: upper.charCodeAt(0), text: ch };
  if (/^[0-9]$/.test(ch)) return { key: ch, code: `Digit${ch}`, vk: ch.charCodeAt(0), text: ch };
  return { key: ch, code: ch, vk: ch.charCodeAt(0) || 0, text: ch };
}
