#!/usr/bin/env node
// tools/smoke.mjs — StudyQuest's smoke-test harness.
//
//   node tools/smoke.mjs                    run every suite in tools/checks/
//   node tools/smoke.mjs boot world         run only those suites
//   node tools/smoke.mjs --list             list the suites it can see
//   node tools/smoke.mjs --headful          watch it happen in a real window
//   node tools/smoke.mjs --shots-dir DIR    where screenshots land
//   node tools/smoke.mjs --keep-data        leave the scratch save dir behind
//   node tools/smoke.mjs --no-browser       API-only suites (no Chrome)
//   node tools/smoke.mjs --bail             stop at the first failing suite
//
// For each suite it boots `node server.js` on a scratch port with a scratch
// SQ_DATA_DIR, drives headless Chrome over CDP, and runs the suite's steps.
// It always fails on an uncaught page exception or a console error, because
// that is the failure mode this project actually has: a throw inside a render
// loop or a setState handler leaves the DOM looking plausible and only ever
// shows up in the console.
//
// Suites are data (tools/checks/*.json or *.mjs) so new cases need no changes
// here. See tools/checks/README.md for the step vocabulary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Browser, chromeAvailable } from './lib/cdp.mjs';
import { GameServer, makeScratchDir, seedDataDir } from './lib/server.mjs';
import { killAllTracked, trackedNames, sleep } from './lib/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHECKS = path.join(HERE, 'checks');

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const opts = {
  headful: argv.includes('--headful'),
  list: argv.includes('--list'),
  keepData: argv.includes('--keep-data'),
  noBrowser: argv.includes('--no-browser'),
  bail: argv.includes('--bail'),
  shotsDir: path.join(HERE, 'shots'),
};
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--shots-dir' && argv[i + 1]) { opts.shotsDir = path.resolve(argv[++i]); }
}
const wanted = argv.filter((a) => !a.startsWith('--') && a !== opts.shotsDir);

// ---------------------------------------------------------------- output

const C = process.stdout.isTTY
  ? { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { r: '', g: '', y: '', c: '', d: '', b: '', x: '' };
const say = (s = '') => process.stdout.write(`${s}\n`);
const pass = (s) => say(`  ${C.g}✓${C.x} ${s}`);
const fail = (s) => say(`  ${C.r}✗${C.x} ${s}`);
const info = (s) => say(`  ${C.d}·${C.x} ${C.d}${s}${C.x}`);

// ---------------------------------------------------------------- suites

async function loadSuites() {
  if (!fs.existsSync(CHECKS)) return [];
  const files = fs.readdirSync(CHECKS).filter((f) => /\.(json|mjs)$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    const id = f.replace(/\.(json|mjs)$/, '');
    const abs = path.join(CHECKS, f);
    let suite;
    try {
      if (f.endsWith('.json')) {
        suite = JSON.parse(fs.readFileSync(abs, 'utf8'));
      } else {
        const mod = await import(pathToFileURL(abs).href);
        suite = mod.default;
        if (typeof suite === 'function') suite = await suite();
      }
    } catch (err) {
      // A broken suite file is itself a failure, not a reason to abort the run.
      out.push({ id, file: abs, broken: err });
      continue;
    }
    out.push({ id, file: abs, order: Number(suite.order) || 100, ...suite });
  }
  out.sort((a, b) => (a.order || 100) - (b.order || 100) || a.id.localeCompare(b.id));
  return out;
}

// ---------------------------------------------------------------- step engine

class StepFail extends Error {}

function interpolate(str, ctx) {
  return String(str).replace(/\$\{(\w+)\}/g, (m, k) => (k in ctx ? ctx[k] : m));
}

async function runStep(step, ctx) {
  const { page, suite } = ctx;
  // Read the server fresh every step: a `restart` step swaps it out underneath us.
  const server = ctx.server;
  const label = step.label || step.type;

  switch (step.type) {
    case 'restart': {
      // Boot a second time against the SAME scratch data dir. This is how
      // "migration is idempotent" is actually proven — the second boot must
      // find nothing left to migrate and must not touch what the first wrote.
      const dataDir = server.dataDir;
      await server.stop();
      const next = await GameServer.start({ root: ROOT, dataDir, env: suite.env || {} });
      ctx.servers.push(next);
      ctx.server = next;
      ctx.vars.port = next.port;
      ctx.vars.base = next.base;
      return `restarted on :${next.port} against the same data dir`;
    }
    case 'navigate': {
      if (!page) throw new StepFail('navigate needs a browser (running with --no-browser)');
      const url = /^https?:/.test(step.url || '/') ? step.url : `${server.base}${step.url || '/'}`;
      await page.navigate(url, { waitUntil: step.waitUntil || 'load', timeoutMs: step.timeoutMs || 20000 });
      return `navigated to ${url}`;
    }

    case 'wait':
      await sleep(Number(step.ms) || 100);
      return `waited ${Number(step.ms) || 100}ms`;

    case 'waitFor': {
      if (!page) throw new StepFail('waitFor needs a browser');
      const timeout = Number(step.timeoutMs) || 10000;
      const deadline = Date.now() + timeout;
      let last;
      while (Date.now() < deadline) {
        try { last = await page.evaluate(step.expr); if (last) return `true: ${step.expr}`; }
        catch (err) { last = `threw: ${err.message}`; }
        await sleep(Number(step.intervalMs) || 100);
      }
      throw new StepFail(`waitFor timed out after ${timeout}ms — ${step.expr}\n      last value: ${JSON.stringify(last)}`);
    }

    case 'eval': {
      if (!page) throw new StepFail('eval needs a browser');
      const v = await page.evaluate(step.expr);
      if (step.into) ctx.vars[step.into] = v;
      return `${step.expr} => ${JSON.stringify(v)}`;
    }

    case 'assert': {
      if (!page) throw new StepFail('assert needs a browser');
      const v = await page.evaluate(step.expr);
      if ('equals' in step) {
        if (JSON.stringify(v) !== JSON.stringify(step.equals)) {
          throw new StepFail(`${label}: expected ${JSON.stringify(step.equals)}, got ${JSON.stringify(v)}\n      expr: ${step.expr}`);
        }
        return `${label} == ${JSON.stringify(step.equals)}`;
      }
      if (!v) throw new StepFail(`${label}: falsy (${JSON.stringify(v)})\n      expr: ${step.expr}`);
      return `${label} (${JSON.stringify(v)})`;
    }

    case 'click':
      if (!page) throw new StepFail('click needs a browser');
      await page.click(step.selector);
      if (step.settleMs !== 0) await sleep(Number(step.settleMs) || 150);
      return `clicked ${step.selector}`;

    case 'hold': {
      // Movement: hold the key, do not tap it. See Page.hold in lib/cdp.mjs.
      if (!page) throw new StepFail('hold needs a browser');
      const ms = Number(step.ms) || 500;
      await page.hold(step.key, ms);
      if (step.settleMs !== 0) await sleep(Number(step.settleMs) || 200);
      return `held ${step.key} for ${ms}ms`;
    }

    case 'key':
      if (!page) throw new StepFail('key needs a browser');
      for (let i = 0; i < (Number(step.times) || 1); i += 1) {
        await page.key(step.key);
        await sleep(Number(step.gapMs) || 30);
      }
      if (step.settleMs !== 0) await sleep(Number(step.settleMs) || 120);
      return `pressed ${step.key}${step.times > 1 ? ` x${step.times}` : ''}`;

    case 'screenshot': {
      if (!page) return 'screenshot skipped (--no-browser)';
      const name = interpolate(step.file || `${suite.id}-${Date.now()}.png`, ctx.vars);
      const file = path.isAbsolute(name) ? name : path.join(ctx.shotsDir, name);
      await page.screenshot(file);
      ctx.shots.push(file);
      return `saved ${path.relative(ROOT, file)}`;
    }

    case 'api': {
      const r = await server.api(step.route, step.body);
      if (step.into) ctx.vars[step.into] = r.json;
      if (step.expectStatus && r.status !== step.expectStatus) {
        throw new StepFail(`${step.route}: expected HTTP ${step.expectStatus}, got ${r.status}`);
      }
      if (step.expectOk !== false && r.json && r.json.ok === false && step.expectOk !== undefined) {
        throw new StepFail(`${step.route}: server said not ok — ${r.json.error}`);
      }
      if (step.expectOk === true && !(r.json && r.json.ok === true)) {
        throw new StepFail(`${step.route}: expected ok:true, got ${r.text.slice(0, 300)}`);
      }
      // `path` is a dotted path into the response; `equals` / `truthy` check it.
      if (step.path) {
        const v = dig(r.json, step.path);
        if ('equals' in step && JSON.stringify(v) !== JSON.stringify(step.equals)) {
          throw new StepFail(`${step.route} ${step.path}: expected ${JSON.stringify(step.equals)}, got ${JSON.stringify(v)}`);
        }
        if (step.truthy && !v) throw new StepFail(`${step.route} ${step.path}: falsy (${JSON.stringify(v)})`);
        return `${step.route} ${step.path} = ${JSON.stringify(v)}`;
      }
      return `${step.route} -> HTTP ${r.status}`;
    }

    case 'file': {
      // Assert something about the scratch data dir — used by the save tests.
      const abs = path.resolve(server.dataDir, step.path);
      const exists = fs.existsSync(abs);
      if (step.exists === false) {
        if (exists) throw new StepFail(`${step.path} should not exist, but does`);
        return `${step.path} absent, as expected`;
      }
      if (!exists) throw new StepFail(`${step.path} is missing from the data dir`);
      if (step.json) {
        let parsed;
        try { parsed = JSON.parse(fs.readFileSync(abs, 'utf8')); }
        catch (err) { throw new StepFail(`${step.path} is not valid JSON: ${err.message}`); }
        for (const [dotted, expected] of Object.entries(step.json)) {
          const v = dig(parsed, dotted);
          if (JSON.stringify(v) !== JSON.stringify(expected)) {
            throw new StepFail(`${step.path} ${dotted}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(v)}`);
          }
        }
      }
      return `${step.path} ok`;
    }

    case 'clearErrors':
      if (page) page.reset();
      return 'console error buffer cleared';

    case 'note':
      return step.text || '';

    default:
      throw new StepFail(`unknown step type "${step.type}" — see tools/checks/README.md`);
  }
}

function dig(obj, dotted) {
  return String(dotted).split('.').reduce((o, k) => {
    if (o === undefined || o === null) return undefined;
    return /^\d+$/.test(k) ? o[Number(k)] : o[k];
  }, obj);
}

// ---------------------------------------------------------------- suite runner

async function runSuite(suite, browser) {
  const result = { id: suite.id, name: suite.name || suite.id, failures: [], steps: 0, shots: [], skipped: false };
  say(`\n${C.b}▸ ${result.name}${C.x} ${C.d}(${path.relative(ROOT, suite.file)})${C.x}`);

  if (suite.broken) {
    result.failures.push(`suite file could not be loaded: ${suite.broken.message}`);
    fail(result.failures[0]);
    return result;
  }
  if (suite.browser !== false && opts.noBrowser) {
    result.skipped = 'needs a browser, running with --no-browser';
    info(result.skipped);
    return result;
  }

  const dataDir = makeScratchDir(suite.id);
  const servers = [];   // more than one if the suite uses a `restart` step
  let server = null;
  let page = null;

  try {
    if (suite.seed) {
      const seed = typeof suite.seed === 'function' ? await suite.seed() : suite.seed;
      seedDataDir(dataDir, seed);
      info(`seeded ${Object.keys(seed).length} file(s) into the scratch data dir`);
    }

    server = await GameServer.start({ root: ROOT, dataDir, env: suite.env || {} });
    servers.push(server);
    info(`server on :${server.port}  data ${dataDir}`);

    if (suite.browser !== false && browser) {
      page = await browser.page();
      page.reset();
    }

    const ctx = {
      page, server, suite, servers,
      vars: { port: server.port, base: server.base },
      shots: [], shotsDir: opts.shotsDir,
    };

    for (const step of suite.steps || []) {
      result.steps += 1;
      const label = step.label || `${step.type}`;
      try {
        const detail = await runStep(step, ctx);
        pass(`${label}${detail && detail !== label ? `  ${C.d}${detail}${C.x}` : ''}`);
      } catch (err) {
        const msg = `${label}: ${err.message}`;
        result.failures.push(msg);
        fail(msg);
        if (step.optional) { result.failures.pop(); info('(step marked optional — not counted)'); continue; }
        break; // a suite's steps are a sequence; after a break the rest is noise
      }
    }
    result.shots = ctx.shots;

    // --- the checks that run on every suite, whatever its steps say ---------
    if (page) {
      const allowed = (suite.allowConsole || []).map((p) => new RegExp(p));
      const errs = page.consoleErrors.filter((e) => !allowed.some((re) => re.test(e.text)));
      if (errs.length) {
        result.failures.push(`${errs.length} console error(s) / page exception(s)`);
        fail(`${errs.length} console error(s) / page exception(s):`);
        for (const e of errs.slice(0, 12)) say(`      ${C.r}${e.kind}${C.x} ${e.text.split('\n').slice(0, 4).join('\n      ')}`);
        if (errs.length > 12) say(`      ${C.d}… and ${errs.length - 12} more${C.x}`);
      } else {
        pass('no console errors or page exceptions');
      }
    }

    const serr = servers
      .flatMap((s) => s.serverErrors)
      .filter((l) => !(suite.allowServerErrors || []).some((p) => new RegExp(p).test(l)));
    if (serr.length) {
      result.failures.push(`${serr.length} server-side error line(s)`);
      fail(`server stderr reported ${serr.length} error line(s):`);
      for (const l of serr.slice(0, 8)) say(`      ${C.r}${l.trim()}${C.x}`);
    } else {
      pass('server logged no errors');
    }
  } catch (err) {
    result.failures.push(err.message);
    fail(err.message.split('\n')[0]);
    for (const l of err.message.split('\n').slice(1, 14)) say(`      ${C.d}${l}${C.x}`);
  } finally {
    if (page) await page.close().catch(() => {});
    for (const s of servers) await s.stop().catch(() => {});
    if (server) {
      if (opts.keepData) info(`kept scratch data at ${server.dataDir}`);
      else server.cleanup();
    }
  }
  return result;
}

// ---------------------------------------------------------------- main

async function main() {
  const suites = await loadSuites();

  if (opts.list) {
    say(`${C.b}suites in ${path.relative(ROOT, CHECKS)}${C.x}`);
    for (const s of suites) say(`  ${s.id.padEnd(16)} ${s.broken ? `${C.r}BROKEN${C.x}` : (s.name || '')}`);
    return 0;
  }

  const selected = wanted.length ? suites.filter((s) => wanted.includes(s.id)) : suites;
  if (!selected.length) {
    say(`${C.r}no suites matched${C.x} ${wanted.join(', ') || '(none found in tools/checks/)'}`);
    return 2;
  }

  say(`${C.b}StudyQuest smoke${C.x}  ${C.d}${selected.length} suite(s) · node ${process.version}${C.x}`);

  let browser = null;
  const needBrowser = !opts.noBrowser && selected.some((s) => s.browser !== false);
  if (needBrowser) {
    if (!chromeAvailable()) {
      say(`${C.r}Chrome is not installed at the expected path.${C.x} Re-run with --no-browser for API-only suites.`);
      return 2;
    }
    browser = await Browser.launch({ headless: !opts.headful });
    say(`${C.d}chrome ${opts.headful ? 'headful' : 'headless'} on :${browser.port}${C.x}`);
  }

  const results = [];
  try {
    for (const suite of selected) {
      const r = await runSuite(suite, browser);
      results.push(r);
      if (opts.bail && r.failures.length) { say(`\n${C.y}--bail: stopping after the first failure${C.x}`); break; }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await killAllTracked();
  }

  // ---- report
  const failed = results.filter((r) => r.failures.length);
  const skipped = results.filter((r) => r.skipped);
  const shots = results.flatMap((r) => r.shots);
  say(`\n${C.b}────────────────────────────────────────────${C.x}`);
  for (const r of results) {
    const mark = r.failures.length ? `${C.r}FAIL${C.x}` : r.skipped ? `${C.y}SKIP${C.x}` : `${C.g}PASS${C.x}`;
    say(`  ${mark}  ${r.id.padEnd(16)} ${C.d}${r.steps} step(s)${C.x}`);
    for (const f of r.failures) say(`        ${C.r}${f.split('\n')[0]}${C.x}`);
  }
  if (shots.length) {
    say(`\n  ${C.c}screenshots${C.x}`);
    for (const s of shots) say(`    ${path.relative(ROOT, s)}`);
  }

  const leaked = trackedNames();
  if (leaked.length) say(`\n  ${C.r}leaked processes: ${leaked.join(', ')}${C.x}`);

  say('');
  if (failed.length) {
    say(`${C.r}${C.b}✗ ${failed.length} of ${results.length} suite(s) failed${C.x}${skipped.length ? ` (${skipped.length} skipped)` : ''}\n`);
    return 1;
  }
  say(`${C.g}${C.b}✓ all ${results.length} suite(s) passed${C.x}${skipped.length ? ` (${skipped.length} skipped)` : ''}\n`);
  return 0;
}

main().then(
  async (code) => { await killAllTracked(); process.exit(code); },
  async (err) => {
    say(`\n${C.r}harness crashed:${C.x} ${err && (err.stack || err.message)}`);
    await killAllTracked();
    process.exit(1);
  },
);
