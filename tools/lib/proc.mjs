// tools/lib/proc.mjs — process tracking, ports, and guaranteed teardown.
//
// The rule this file exists to enforce: NOTHING this harness starts is allowed
// to outlive it. Not on success, not on assertion failure, not on ctrl-c, not
// on an uncaught throw.
//
// We do it by pid, never by pattern-matching the command line. `pkill -f
// "PORT=1234"` looks like it should work and does not — PORT is passed in the
// environment, so it never appears in `ps` output, and the pkill silently
// matches nothing (or, worse, something else). Every child is spawned
// `detached: true` so it gets its own process group, and we kill the whole
// group: Chrome in particular forks a renderer, a GPU process and a zygote,
// and killing only the pid we hold leaves all of them behind.

import { spawn } from 'node:child_process';
import net from 'node:net';

/** @type {Set<{pid:number,name:string,child:import('node:child_process').ChildProcess}>} */
const tracked = new Set();
let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // 'exit' handlers must be synchronous — process.kill is, so this is fine.
  process.on('exit', () => killAllSync('SIGKILL'));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      killAllSync('SIGKILL');
      process.exit(130);
    });
  }
  process.on('uncaughtException', (err) => {
    console.error('\n[harness] uncaught exception — tearing down children first');
    console.error(err && (err.stack || err.message || err));
    killAllSync('SIGKILL');
    process.exit(1);
  });
}

/** Spawn a child in its own process group and remember it for teardown. */
export function spawnTracked(name, cmd, args, opts = {}) {
  installHooks();
  const child = spawn(cmd, args, { ...opts, detached: true });
  const rec = { pid: child.pid, name, child };
  tracked.add(rec);
  child.on('exit', () => tracked.delete(rec));
  return child;
}

function signalGroup(pid, sig) {
  if (!pid || pid <= 1) return;
  // Negative pid == "the whole process group". This is the part that actually
  // reaps Chrome's helper processes.
  try { process.kill(-pid, sig); } catch { /* already gone */ }
  try { process.kill(pid, sig); } catch { /* already gone */ }
}

function killAllSync(sig) {
  for (const rec of [...tracked]) {
    signalGroup(rec.pid, sig);
    tracked.delete(rec);
  }
}

/** Polite teardown: SIGTERM, a grace period, then SIGKILL. Never throws. */
export async function killTracked(child, graceMs = 1500) {
  if (!child || !child.pid) return;
  const pid = child.pid;
  signalGroup(pid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    if (!isAlive(pid)) break;
    await sleep(50);
  }
  if (isAlive(pid)) signalGroup(pid, 'SIGKILL');
  await sleep(50);
  for (const rec of [...tracked]) if (rec.pid === pid) tracked.delete(rec);
}

/** Tear down everything still tracked. Safe to call more than once. */
export async function killAllTracked() {
  for (const rec of [...tracked]) await killTracked(rec.child, 800);
}

/** Which children are still tracked — used by the harness's own leak report. */
export function trackedNames() {
  return [...tracked].map((r) => `${r.name}(${r.pid})`);
}

export function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ask the kernel for a port nobody is using. Same trick as Support.swift. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Poll `fn` until it resolves truthy or the timeout expires. */
export async function waitFor(fn, { timeoutMs = 15000, intervalMs = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await sleep(intervalMs);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}
