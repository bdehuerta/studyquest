// server/slots.js  [AGENT-F]
// Save slots: where the data lives, which slot is active, and the
// list/switch/create/delete/rename operations.
//
// STORAGE LAYOUT (v3 — one folder per slot)
//
//   <dataDir>/
//     active.json            { slot, at }
//     Slot 1/
//       state.json           the save itself
//       meta.json            { slot, name, createdAt, lastPlayedAt, playtimeMs, level, ... }
//     Slot 2/
//       ...
//
// meta.json is a deliberate duplicate of a handful of fields from state.json:
// the slot listing (a menu that is opened often) must never have to parse five
// full saves. It is rewritten on every save and can always be regenerated from
// state.json if it goes missing or gets corrupted.
//
// The folder name is ALWAYS `Slot N` — N is the slot's identity. Renaming a
// save changes meta.name only; directories are never renamed, because moving a
// directory out from under a live server is how you lose a save.
//
// This module owns DATA_DIR because it is the lowest layer — store.js re-exports
// it. It imports defaultState/migrateState from store.js, but ONLY calls them
// from inside functions, never at module-evaluation time, so the (deliberate)
// import cycle store.js <-> slots.js is safe under ESM.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_SAVE_SLOTS } from '../shared/constants.js';
import { defaultState, migrateState } from './store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTO_ROOT = path.resolve(HERE, '..');

/**
 * The data directory.
 *
 * SQ_DATA_DIR wins when set — the native macOS shell (AGENT-E) points it at
 * ~/Library/Application Support/StudyQuest/ so saves survive re-installing the
 * app bundle. Without it we fall back to <proto>/data, which is what plain
 * `node server.js` has always used.
 */
function resolveDataDir() {
  const env = typeof process.env.SQ_DATA_DIR === 'string' ? process.env.SQ_DATA_DIR.trim() : '';
  if (!env) return path.join(PROTO_ROOT, 'data');
  let p = env;
  if (p === '~') p = os.homedir();
  else if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

export const DATA_DIR = resolveDataDir();
export const LEGACY_STATE_PATH = path.join(DATA_DIR, 'state.json');
export const ACTIVE_PATH = path.join(DATA_DIR, 'active.json');

// ---------------------------------------------------------------- paths

/** The folder for a slot. Stable for the life of the save: `Slot 1`, `Slot 2`… */
export function slotDir(slot) {
  return path.join(DATA_DIR, `Slot ${slot}`);
}

/** The full save. */
export function slotStatePath(slot) {
  return path.join(slotDir(slot), 'state.json');
}

/** The small listing record. */
export function slotMetaPath(slot) {
  return path.join(slotDir(slot), 'meta.json');
}

/** The pre-v3 flat file, kept only so migration can find it. */
export function legacySlotPath(slot) {
  return path.join(DATA_DIR, `slot-${slot}.json`);
}

/** Back-compat alias — v2 callers used slotPath() to mean "the save file". */
export function slotPath(slot) {
  return slotStatePath(slot);
}

export function isValidSlot(n) {
  return Number.isInteger(n) && n >= 1 && n <= MAX_SAVE_SLOTS;
}

export function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    return true;
  } catch (err) {
    console.error('[slots] could not create data dir', DATA_DIR, err && err.message);
    return false;
  }
}

function ensureSlotDir(slot) {
  try {
    fs.mkdirSync(slotDir(slot), { recursive: true });
    return true;
  } catch (err) {
    console.error('[slots] could not create slot dir', slotDir(slot), err && err.message);
    return false;
  }
}

// ---------------------------------------------------------------- raw file io

function writeJson(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error('[slots] write failed', file, err && err.message);
    return false;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** A slot is "populated" when it has a state.json we can at least stat. */
export function slotExists(slot) {
  if (!isValidSlot(slot)) return false;
  try {
    return fs.statSync(slotStatePath(slot)).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- active slot

/**
 * APP SETTINGS LIVE ON DISK, NOT IN THE BROWSER.
 *
 * They were kept in localStorage, which is keyed by ORIGIN — and the native
 * shell picks a free port at every launch, so every launch was a new origin
 * with an empty store and the settings appeared to reset themselves. They are
 * app-wide preferences, not save data, so they sit beside active.json rather
 * than inside a slot: changing them must not touch a save, and they must not
 * change when you load a different one.
 */
export const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

export function readSettings() {
  const rec = readJson(SETTINGS_PATH);
  return isObj(rec) ? rec : {};
}

export function writeSettings(obj) {
  if (!isObj(obj)) return false;
  ensureDataDir();
  return writeJson(SETTINGS_PATH, obj);
}

export function getActiveSlot() {
  const rec = readJson(ACTIVE_PATH);
  const n = rec && Number(rec.slot);
  return isValidSlot(n) ? n : 1;
}

export function setActiveSlot(slot) {
  if (!isValidSlot(slot)) return false;
  ensureDataDir();
  return writeJson(ACTIVE_PATH, { slot, at: Date.now() });
}

// ---------------------------------------------------------------- playtime

const MAX_TICK_MS = 5 * 60 * 1000; // a gap longer than this is "away", not playtime

/**
 * When this process started serving the active slot.
 *
 * Booting used to stamp `meta.lastPlayedAt = Date.now()` on the active slot, so
 * merely OPENING the app — sitting on the title screen, not loading anything —
 * rewrote that save's "last played" time. That made the active slot eternally
 * the most recent one, so the launch menu's CONTINUE could never move to a save
 * you had played later from somewhere else, and every save reported "just now".
 *
 * The stamp was doing double duty as the playtime baseline, though: without it
 * the first tick after launch would measure the gap since you last played and
 * credit up to MAX_TICK_MS of playtime you did not spend. So the baseline now
 * lives here instead, where it cannot be mistaken for a fact about the save.
 */
let bootAt = Date.now();

/**
 * Has the player actually entered a save this session?
 *
 * The server writes the active slot during boot — migrations run, defaults get
 * backfilled — and every write ticks playtime. That stamped `lastPlayedAt` on
 * the active save before the title screen had even been drawn, which is what
 * pinned CONTINUE to that slot forever. A save counts as played once it is
 * LOADED (switchSlot / createSlot), not once it is read off disk.
 */
let playing = false;

/** Accumulate wall time between saves into meta.playtimeMs. */
function tickPlaytime(state) {
  if (!state || typeof state !== 'object') return;
  if (!state.meta || typeof state.meta !== 'object') state.meta = {};
  const meta = state.meta;
  const now = Date.now();
  // Count from the later of "last saved" and "this process started": time the
  // app spent closed is not playtime.
  const prev = Math.max(Number(meta.lastPlayedAt) || 0, bootAt);
  if (playing && Number.isFinite(prev) && prev > 0 && now > prev) {
    meta.playtimeMs = (Number(meta.playtimeMs) || 0) + Math.min(now - prev, MAX_TICK_MS);
  } else if (!Number.isFinite(Number(meta.playtimeMs))) {
    meta.playtimeMs = 0;
  }
  // Only a save that is actually being played gets its clock moved. A boot-time
  // migration write must not make an untouched save look freshly played.
  if (playing) meta.lastPlayedAt = now;
}

// ---------------------------------------------------------------- meta records

/**
 * Derive the small listing record from a full state.
 * Everything here is cheap to read and safe to regenerate.
 */
function metaFromState(state, slot) {
  const meta = isObj(state && state.meta) ? state.meta : {};
  const player = isObj(state && state.player) ? state.player : {};
  const tasks = Array.isArray(state && state.tasks) ? state.tasks : [];
  const now = Date.now();
  return {
    slot,
    name: (typeof meta.name === 'string' && meta.name.trim()) ? meta.name : `Save ${slot}`,
    createdAt: Number(meta.createdAt) || Number(meta.lastPlayedAt) || now,
    lastPlayedAt: Number(meta.lastPlayedAt) || now,
    playtimeMs: Number(meta.playtimeMs) || 0,
    level: Number(player.level) || 1,
    tasksDone: tasks.filter((t) => t && t.status === 'done').length,
    tasksTotal: tasks.length,
    savedAt: now,
  };
}

function metaLooksValid(m, slot) {
  return isObj(m)
    && typeof m.name === 'string'
    && m.name.length > 0
    && Number(m.slot) === slot
    && Number.isFinite(Number(m.level));
}

function writeSlotMeta(slot, state) {
  return writeJson(slotMetaPath(slot), metaFromState(state, slot));
}

/**
 * The cheap read used by the listing: meta.json only. If it is missing or
 * corrupt we fall back to state.json ONCE and rewrite meta.json from it, so
 * the expensive path self-heals and is never taken twice.
 * Returns null when the slot has no readable save at all.
 */
function readSlotMeta(slot) {
  if (!slotExists(slot)) return null;
  const m = readJson(slotMetaPath(slot));
  if (metaLooksValid(m, slot)) return m;

  const raw = readJson(slotStatePath(slot));
  if (!isObj(raw)) return null; // folder exists, save is unreadable -> empty
  const rebuilt = metaFromState(raw, slot);
  writeJson(slotMetaPath(slot), rebuilt);
  console.log(`[slots] regenerated meta.json for Slot ${slot}`);
  return rebuilt;
}

// ---------------------------------------------------------------- migration

/**
 * Move one flat `slot-N.json` into `Slot N/state.json` + `Slot N/meta.json`.
 *
 * Safety, in order:
 *   1. never runs if the folder already has a state.json (the new file wins,
 *      the flat file is left on disk untouched for the user to inspect);
 *   2. the source is parsed BEFORE anything is written — an unparseable flat
 *      file is left exactly where it is;
 *   3. the new state.json is written, then read back and re-parsed and checked
 *      for a `player` object;
 *   4. only after that read-back succeeds is the flat file removed.
 * Any failure at any step leaves the original flat file in place.
 */
function migrateFlatSlot(slot) {
  const flat = legacySlotPath(slot);
  if (!fs.existsSync(flat)) return false;

  if (slotExists(slot)) {
    console.warn(`[slots] Slot ${slot}/state.json already exists — leaving legacy ${path.basename(flat)} in place`);
    return false;
  }

  const raw = readJson(flat);
  if (!isObj(raw)) {
    console.warn(`[slots] legacy ${path.basename(flat)} is not readable JSON — left untouched`);
    return false;
  }

  const migrated = migrateState(raw);
  migrated.meta = isObj(migrated.meta) ? migrated.meta : {};
  migrated.meta.slot = slot;
  if (!migrated.meta.name) migrated.meta.name = `Save ${slot}`;

  if (!ensureSlotDir(slot)) return false;
  if (!writeJson(slotStatePath(slot), migrated)) return false;

  // confirm the new file before touching the old one
  const back = readJson(slotStatePath(slot));
  if (!isObj(back) || !isObj(back.player)) {
    console.error(`[slots] migration read-back failed for slot ${slot} — legacy file kept`);
    return false;
  }
  writeSlotMeta(slot, back);

  try {
    fs.unlinkSync(flat);
  } catch (err) {
    console.warn(`[slots] migrated slot ${slot} but could not remove ${path.basename(flat)}:`, err && err.message);
  }
  console.log(`[slots] migrated ${path.basename(flat)} -> Slot ${slot}/state.json`);
  return true;
}

/**
 * Move a v1 `data/state.json` into Slot 1. Same read-back guarantee; the legacy
 * file is renamed to state.json.migrated rather than deleted, so nothing is
 * ever destroyed and it cannot resurrect itself if slot 1 is later deleted.
 */
export function migrateLegacyOnce() {
  ensureDataDir();
  if (slotExists(1)) return false;
  if (!fs.existsSync(LEGACY_STATE_PATH)) return false;
  const legacy = readJson(LEGACY_STATE_PATH);
  if (!isObj(legacy)) return false;

  const migrated = migrateState(legacy);
  migrated.meta = isObj(migrated.meta) ? migrated.meta : {};
  migrated.meta.slot = 1;
  if (!migrated.meta.name) migrated.meta.name = 'Save 1';

  if (!ensureSlotDir(1)) return false;
  if (!writeJson(slotStatePath(1), migrated)) return false;

  const back = readJson(slotStatePath(1));
  if (!isObj(back) || !isObj(back.player)) {
    console.error('[slots] legacy migration read-back failed — data/state.json kept');
    return false;
  }
  writeSlotMeta(1, back);

  try {
    fs.renameSync(LEGACY_STATE_PATH, `${LEGACY_STATE_PATH}.migrated`);
  } catch (err) {
    console.warn('[slots] migrated legacy state.json but could not rename it:', err && err.message);
  }
  console.log('[slots] migrated legacy data/state.json into Slot 1');
  return true;
}

/**
 * Bring the whole data dir up to the folder-per-slot layout. Idempotent and
 * safe to call on every boot; does nothing at all once there is nothing left
 * in the old shape.
 */
export function migrateLayoutOnce() {
  ensureDataDir();
  let moved = 0;
  for (let i = 1; i <= MAX_SAVE_SLOTS; i += 1) {
    if (migrateFlatSlot(i)) moved += 1;
  }
  if (migrateLegacyOnce()) moved += 1;
  // Any folder that survived with a save but lost its meta gets one back.
  for (let i = 1; i <= MAX_SAVE_SLOTS; i += 1) {
    if (slotExists(i) && !readJson(slotMetaPath(i))) readSlotMeta(i);
  }
  return moved;
}

// ---------------------------------------------------------------- slot state

function seedSlot(slot, name) {
  const s = defaultState();
  s.meta = s.meta || {};
  s.meta.slot = slot;
  s.meta.name = name || `Save ${slot}`;
  s.meta.createdAt = Date.now();
  s.meta.lastPlayedAt = Date.now();
  s.meta.playtimeMs = 0;
  return s;
}

/** Read a slot's state (migrated). Returns null when the slot is empty. */
export function readSlotState(slot) {
  if (!slotExists(slot)) return null;
  const raw = readJson(slotStatePath(slot));
  if (!isObj(raw)) return null;
  const s = migrateState(raw);
  s.meta = s.meta || {};
  s.meta.slot = slot;
  if (!s.meta.name) s.meta.name = `Save ${slot}`;
  return s;
}

/** Persist a state into the slot recorded on its own meta (default: active). */
export function writeSlotState(state) {
  if (!state || typeof state !== 'object') return false;
  if (!state.meta || typeof state.meta !== 'object') state.meta = {};
  let slot = Number(state.meta.slot);
  if (!isValidSlot(slot)) {
    slot = getActiveSlot();
    state.meta.slot = slot;
  }
  if (!state.meta.name) state.meta.name = `Save ${slot}`;
  tickPlaytime(state);
  ensureSlotDir(slot);
  const wrote = writeJson(slotStatePath(slot), state);
  // meta is a cache of state — only refresh it when the save itself landed
  if (wrote) writeSlotMeta(slot, state);
  return wrote;
}

/** Boot: pick the active slot, seeding one if the disk is empty. */
export function loadActiveState() {
  ensureDataDir();
  migrateLayoutOnce();

  let slot = getActiveSlot();
  let state = readSlotState(slot);

  if (!state) {
    // the recorded active slot is gone — fall back to any populated slot
    for (let i = 1; i <= MAX_SAVE_SLOTS; i += 1) {
      const s = readSlotState(i);
      if (s) { slot = i; state = s; break; }
    }
  }
  if (!state) {
    slot = 1;
    state = seedSlot(1, 'Save 1');
    writeSlotState(state);
  }
  setActiveSlot(slot);
  // NOT `state.meta.lastPlayedAt = Date.now()` — see bootAt above. Opening the
  // app is not playing a save. The stamp lands when the slot is actually
  // loaded (switchSlot / createSlot) and on every save through tickPlaytime.
  bootAt = Date.now();
  return state;
}

// ---------------------------------------------------------------- operations
// Each returns { ok, ... } — never throws, never returns an HTTP shape.

function emptyEntry(slot) {
  return {
    slot,
    name: `Empty slot ${slot}`,
    level: 0,
    playtimeMs: 0,
    lastPlayedAt: null,
    createdAt: null,
    exists: false,
    active: false,
    tasksDone: 0,
    tasksTotal: 0,
    folder: slotDir(slot),
  };
}

/**
 * The menu listing. Reads only the small meta.json files — a full save is
 * parsed only for a slot whose meta is missing or corrupt, and that read
 * rewrites the meta so it does not happen again.
 */
export function listSlots() {
  ensureDataDir();
  const active = getActiveSlot();
  const out = [];
  for (let i = 1; i <= MAX_SAVE_SLOTS; i += 1) {
    let m = null;
    try {
      m = readSlotMeta(i);
    } catch (err) {
      console.error(`[slots] could not read meta for slot ${i}:`, err && err.message);
      m = null;
    }
    if (!m) {
      // no save, or a folder whose state.json is unreadable — report empty
      out.push(emptyEntry(i));
      continue;
    }
    out.push({
      slot: i,
      name: typeof m.name === 'string' && m.name ? m.name : `Save ${i}`,
      level: Number(m.level) || 1,
      playtimeMs: Number(m.playtimeMs) || 0,
      lastPlayedAt: Number(m.lastPlayedAt) || Number(m.createdAt) || null,
      createdAt: Number(m.createdAt) || null,
      exists: true,
      active: i === active,
      tasksDone: Number(m.tasksDone) || 0,
      tasksTotal: Number(m.tasksTotal) || 0,
      folder: slotDir(i),
    });
  }
  return out;
}

/**
 * Switch to another populated slot. `current` is flushed to its own file first
 * so nothing is lost. Returns the NEW live state — the caller must hand it back
 * as json.state so server.js swaps its in-memory reference.
 */
export function switchSlot(current, slot) {
  const n = Math.round(Number(slot));
  if (!isValidSlot(n)) return { ok: false, error: `slot must be a whole number from 1 to ${MAX_SAVE_SLOTS}` };
  if (!slotExists(n)) return { ok: false, error: `slot ${n} is empty — create a save there first` };
  if (current) writeSlotState(current);
  const next = readSlotState(n);
  if (!next) return { ok: false, error: `slot ${n} could not be read — the save file may be corrupt` };
  setActiveSlot(n);
  // Loading a save IS playing it — from here on, writes move its clock.
  playing = true;
  bootAt = Date.now();
  next.meta.lastPlayedAt = Date.now();
  writeSlotState(next);
  return { ok: true, state: next, slots: listSlots() };
}

/** Create a fresh save. Omit `slot` to take the first empty one. */
export function createSlot(current, slot, name) {
  ensureDataDir();
  let n;
  if (slot === undefined || slot === null || slot === '') {
    n = 0;
    for (let i = 1; i <= MAX_SAVE_SLOTS; i += 1) {
      if (!slotExists(i)) { n = i; break; }
    }
    if (!n) return { ok: false, error: `all ${MAX_SAVE_SLOTS} save slots are full — delete one first` };
  } else {
    n = Math.round(Number(slot));
    if (!isValidSlot(n)) return { ok: false, error: `slot must be a whole number from 1 to ${MAX_SAVE_SLOTS}` };
    if (slotExists(n)) return { ok: false, error: `slot ${n} is already in use — delete it first, or pick another` };
  }

  const cleanName = cleanSlotName(name) || `Save ${n}`;
  if (current) writeSlotState(current);
  const fresh = seedSlot(n, cleanName);
  writeSlotState(fresh);
  setActiveSlot(n);
  return { ok: true, state: fresh, slots: listSlots() };
}

/**
 * Remove a slot's folder. Deletes the two files we own and then the directory;
 * anything a user dropped in there by hand makes rmdir fail, and that is fine —
 * the save itself is gone, which is what was asked.
 */
function removeSlotFolder(slot) {
  for (const f of [slotStatePath(slot), slotMetaPath(slot), `${slotStatePath(slot)}.tmp`, `${slotMetaPath(slot)}.tmp`]) {
    try { fs.unlinkSync(f); } catch { /* not there — fine */ }
  }
  if (slotExists(slot)) {
    return { ok: false, error: `could not delete slot ${slot}: the save file is still present` };
  }
  try { fs.rmdirSync(slotDir(slot)); } catch { /* non-empty or gone — harmless */ }
  return { ok: true };
}

/**
 * Delete a slot. Deleting the ACTIVE slot must not leave the server stateless,
 * so we switch to another populated slot, or seed a brand-new slot 1.
 */
export function deleteSlot(current, slot) {
  const n = Math.round(Number(slot));
  if (!isValidSlot(n)) return { ok: false, error: `slot must be a whole number from 1 to ${MAX_SAVE_SLOTS}` };
  if (!slotExists(n)) return { ok: false, error: `slot ${n} is already empty` };

  const wasActive = getActiveSlot() === n
    || (current && current.meta && Number(current.meta.slot) === n);

  // flush the live state first, unless it IS the one being deleted
  if (current && !wasActive) writeSlotState(current);

  const removed = removeSlotFolder(n);
  if (!removed.ok) return removed;

  if (!wasActive) return { ok: true, slots: listSlots() };

  // find a survivor
  let next = null;
  let nextSlot = 0;
  for (let i = 1; i <= MAX_SAVE_SLOTS; i += 1) {
    const s = readSlotState(i);
    if (s) { next = s; nextSlot = i; break; }
  }
  if (!next) {
    nextSlot = 1;
    next = seedSlot(1, 'Save 1');
  }
  next.meta.slot = nextSlot;
  playing = true;
  bootAt = Date.now();
  next.meta.lastPlayedAt = Date.now();
  writeSlotState(next);
  setActiveSlot(nextSlot);
  return { ok: true, state: next, slots: listSlots(), switchedTo: nextSlot };
}

/**
 * Rename a save. The FOLDER is deliberately not renamed — `Slot N` is the
 * slot's identity and a live server holds paths built from it. The display
 * name lives in meta.json (and in state.meta.name, its source of truth).
 */
export function renameSlot(current, slot, name) {
  const n = Math.round(Number(slot));
  if (!isValidSlot(n)) return { ok: false, error: `slot must be a whole number from 1 to ${MAX_SAVE_SLOTS}` };
  if (!slotExists(n)) return { ok: false, error: `slot ${n} is empty — nothing to rename` };
  const cleanName = cleanSlotName(name);
  if (!cleanName) return { ok: false, error: 'a save needs a name (1–40 characters)' };

  // if we are renaming the live save, rename it in memory too
  if (current && current.meta && Number(current.meta.slot) === n) {
    current.meta.name = cleanName;
    writeSlotState(current);
    return { ok: true, slots: listSlots(), state: current };
  }

  const s = readSlotState(n);
  if (!s) return { ok: false, error: `slot ${n} could not be read` };
  s.meta.name = cleanName;
  writeSlotState(s);
  return { ok: true, slots: listSlots() };
}

function cleanSlotName(name) {
  if (typeof name !== 'string') return '';
  const t = name.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40);
  return t;
}
