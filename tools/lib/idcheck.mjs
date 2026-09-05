#!/usr/bin/env node
// tools/lib/idcheck.mjs — does every id list in shared/constants.js have an
// implementation behind it?
//
// This exact class of mismatch has already killed the app once. shared/recipes.js
// asserts its key lists against constants.js AT MODULE LOAD, so an id added to
// constants before recipes has an entry for it does not produce a missing item:
// it produces a throw in an import, which takes down server.js and every page
// that imports the module. The failure surfaces as "the whole app is dead", ten
// files away from the edit that caused it.
//
// So this check does two things:
//   1. actually imports the data modules, and reports a load-time throw as the
//      readable one-line cause it really is;
//   2. cross-references each frozen id list against whichever module is
//      supposed to implement it, discovering the implementer by export name so
//      it keeps working as ENG-SYSTEMS adds v3 modules.
//
// Ids that nothing implements YET are reported as PENDING, not as failures —
// this has to give a useful answer against a tree three agents are mid-edit in.
//
//   node tools/lib/idcheck.mjs           report, exit 1 on a hard failure
//   node tools/lib/idcheck.mjs --strict  PENDING counts as a failure too

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const STRICT = process.argv.includes('--strict');

const C = process.stdout.isTTY
  ? { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { r: '', g: '', y: '', d: '', b: '', x: '' };

const hard = [];
const pending = [];
const ok = [];

const say = (s = '') => process.stdout.write(`${s}\n`);
const P = (m) => { ok.push(m); say(`  ${C.g}✓${C.x} ${m}`); };
const F = (m) => { hard.push(m); say(`  ${C.r}✗${C.x} ${m}`); };
const W = (m) => { pending.push(m); say(`  ${C.y}~${C.x} ${m} ${C.d}(pending)${C.x}`); };

/** Import a module, turning a load-time throw into a value we can report. */
async function tryImport(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { missing: true, rel };
  try {
    return { mod: await import(pathToFileURL(abs).href), rel };
  } catch (err) {
    return { error: err, rel };
  }
}

/** Every module that might export an implementation map. */
const DATA_MODULES = [
  'shared/constants.js', 'shared/recipes.js', 'shared/economy.js',
  'shared/gadgets.js', 'shared/blocks.js', 'shared/items.js', 'shared/world.js',
  'server/shops.js', 'server/trees.js', 'server/gadgets.js', 'server/blocks.js',
  'server/regions.js', 'server/store.js',
];

/**
 * Each entry: the frozen id list, and the export names that could implement it.
 * Order matters only for the message; the first module that exports one of the
 * names is treated as the implementer.
 */
const CONTRACTS = [
  // recipes.js asserts MATERIALS itself at load — but against ALL_MATERIAL_IDS,
  // which is MATERIAL_IDS plus the tree drops. Extra keys are only "extra" if
  // that wider list does not claim them either.
  { list: 'MATERIAL_IDS',    impl: ['MATERIALS'],   superset: 'ALL_MATERIAL_IDS' },
  { list: 'TOOL_IDS',        impl: ['TOOLS'] },
  { list: 'BUILDING_IDS',    impl: ['BUILDINGS'] },
  { list: 'GADGET_IDS',      impl: ['GADGETS', 'GADGET_DEFS'] },
  { list: 'BLOCK_IDS',       impl: ['BLOCKS', 'BLOCK_DEFS'] },
  { list: 'GATHER_TOOL_IDS', impl: ['TOOLS'] },
  { list: 'SHOP_IDS',        impl: ['SHOPS', 'SHOP_DEFS'], soft: true },
];

async function main() {
  say(`${C.b}id lists ↔ data modules${C.x}`);

  // --- 1. can the data modules even be loaded? -----------------------------
  const loaded = new Map();
  for (const rel of DATA_MODULES) {
    const r = await tryImport(rel);
    if (r.missing) continue;
    if (r.error) {
      // This is the failure mode the whole check exists for.
      const first = String(r.error.message).split('\n')[0];
      F(`${rel} THROWS ON IMPORT — ${first}`);
      say(`      ${C.d}every module that imports ${path.basename(rel)} is dead until this is fixed${C.x}`);
      continue;
    }
    loaded.set(rel, r.mod);
  }
  if (loaded.has('shared/recipes.js')) P('shared/recipes.js loads (its own key assertions passed)');
  if (loaded.has('shared/constants.js')) P('shared/constants.js loads');

  const K = loaded.get('shared/constants.js');
  if (!K) {
    F('shared/constants.js could not be loaded — nothing else can be checked');
    return report();
  }

  // Where does each candidate export name live?
  const exportHome = new Map();
  for (const [rel, mod] of loaded) {
    for (const name of Object.keys(mod)) {
      if (!exportHome.has(name)) exportHome.set(name, { rel, value: mod[name] });
    }
  }

  // --- 2. list ↔ implementer ------------------------------------------------
  for (const c of CONTRACTS) {
    const ids = K[c.list];
    if (!Array.isArray(ids)) { W(`${c.list} is not exported from constants.js yet`); continue; }

    const found = c.impl.map((n) => exportHome.get(n)).find(Boolean);
    if (!found) {
      const msg = `${c.list} (${ids.length} ids) — nothing exports ${c.impl.join('/')} yet`;
      if (c.soft || !STRICT) W(msg); else F(msg);
      continue;
    }
    const map = found.value;
    if (!map || typeof map !== 'object') { F(`${c.impl[0]} in ${found.rel} is not an object`); continue; }

    const keys = Object.keys(map);
    const missing = ids.filter((id) => !keys.includes(id));
    // "extra" only matters for lists that are meant to be exhaustive.
    const exhaustive = ['MATERIAL_IDS', 'TOOL_IDS', 'BUILDING_IDS'].includes(c.list);
    const wider = c.superset && exportHome.has(c.superset) ? exportHome.get(c.superset).value : null;
    const allowed = new Set([...ids, ...(Array.isArray(wider) ? wider : [])]);
    const extra = exhaustive ? keys.filter((k) => !allowed.has(k)) : [];

    if (missing.length) {
      F(`${c.list} -> ${found.rel}:${c.impl[0]} is missing [${missing.join(', ')}]`);
      say(`      ${C.d}add these to ${found.rel} before the ids ship, or the module throws at load${C.x}`);
    } else if (extra.length) {
      F(`${found.rel}:${c.impl[0]} defines [${extra.join(', ')}] which ${c.list} does not list`);
    } else {
      P(`${c.list} (${ids.length}) fully implemented in ${found.rel}:${c.impl[0]}`);
    }
  }

  // --- 3. cross-list invariants that no module asserts for itself ----------
  const materialUniverse = new Set([
    ...(Array.isArray(K.MATERIAL_IDS) ? K.MATERIAL_IDS : []),
    ...(exportHome.has('ALL_MATERIAL_IDS') && Array.isArray(exportHome.get('ALL_MATERIAL_IDS').value)
      ? exportHome.get('ALL_MATERIAL_IDS').value : []),
    ...(exportHome.has('MATERIALS') && exportHome.get('MATERIALS').value
      ? Object.keys(exportHome.get('MATERIALS').value) : []),
  ]);

  if (Array.isArray(K.TREE_DROP_IDS)) {
    const orphans = K.TREE_DROP_IDS.filter((id) => !materialUniverse.has(id));
    if (orphans.length) {
      F(`TREE_DROP_IDS [${orphans.join(', ')}] are not materials — a felled tree would credit state.materials with a key migrateState() zeroes on the next load`);
    } else P(`TREE_DROP_IDS (${K.TREE_DROP_IDS.length}) are all real materials`);
  }

  if (Array.isArray(K.BUILDING_IDS) && K.BUILDING_ROLES) {
    const roleKeys = Object.keys(K.BUILDING_ROLES);
    const unknown = roleKeys.filter((k) => !K.BUILDING_IDS.includes(k));
    const roleless = K.BUILDING_IDS.filter((k) => !roleKeys.includes(k));
    if (unknown.length) F(`BUILDING_ROLES names buildings that do not exist: [${unknown.join(', ')}]`);
    else if (roleless.length) W(`buildings with no role — unreachable in v3: [${roleless.join(', ')}]`);
    else P('BUILDING_ROLES covers every building exactly');
  }

  if (Array.isArray(K.BUILDING_IDS) && K.BUILDING_FOOTPRINT) {
    const miss = K.BUILDING_IDS.filter((id) => !K.BUILDING_FOOTPRINT[id]);
    if (miss.length) F(`BUILDING_FOOTPRINT is missing [${miss.join(', ')}] — recipes.js throws at load on this`);
    else P('BUILDING_FOOTPRINT covers every building');
  }

  const recipes = exportHome.get('RECIPES');
  if (recipes && Array.isArray(recipes.value)) {
    const recipeIds = new Set(recipes.value.map((r) => r && r.id).filter(Boolean));
    if (Array.isArray(K.STARTER_BLUEPRINTS)) {
      const bad = K.STARTER_BLUEPRINTS.filter((id) => !recipeIds.has(id));
      if (bad.length) F(`STARTER_BLUEPRINTS reference recipes that do not exist: [${bad.join(', ')}] — every new save starts able to craft nothing`);
      else P(`STARTER_BLUEPRINTS (${K.STARTER_BLUEPRINTS.length}) all resolve to real recipes`);
    }
    for (const [listName, label] of [['GADGET_IDS', 'gadget'], ['BLOCK_IDS', 'block']]) {
      const ids = K[listName];
      if (!Array.isArray(ids)) continue;
      const uncraftable = ids.filter((id) => ![...recipeIds].some((r) => r.includes(id)));
      if (uncraftable.length) W(`${label}s with no recipe yet: [${uncraftable.join(', ')}]`);
      else P(`every ${label} has a recipe`);
    }
  } else W('RECIPES is not exported yet — recipe cross-checks skipped');

  if (Array.isArray(K.GATES) && Array.isArray(K.REGIONS)) {
    const regionIds = new Set(K.REGIONS.map((r) => r && (r.id || r.area)).filter(Boolean));
    const bad = K.GATES.filter((g) => g.area && !regionIds.has(g.area)).map((g) => `${g.id}->${g.area}`);
    if (bad.length) F(`GATES point at regions that do not exist in REGIONS: [${bad.join(', ')}]`);
    else P(`all ${K.GATES.length} gates resolve to a real region`);
    const sides = K.GATES.map((g) => g.side).sort().join(',');
    if (sides !== 'east,north,south,west') F(`GATES do not cover all four edges (got: ${sides || 'none'})`);
    else P('all four map edges have a gate');
  }

  if (Array.isArray(K.SAPLING_STAGES)) {
    const mins = K.SAPLING_STAGES.map((s) => Number(s.minutes));
    const sorted = mins.every((m, i) => i === 0 || m > mins[i - 1]);
    if (!sorted) F('SAPLING_STAGES minutes are not strictly increasing');
    else if (Number(K.SAPLING_TOTAL_MINUTES) !== mins[mins.length - 1]) {
      F(`SAPLING_TOTAL_MINUTES (${K.SAPLING_TOTAL_MINUTES}) does not match the last stage (${mins[mins.length - 1]}) — the growth bar and the chopability check would disagree`);
    } else P(`sapling growth: ${K.SAPLING_STAGES.length} stages over ${K.SAPLING_TOTAL_MINUTES} minutes, consistent`);
  }

  return report();
}

function report() {
  say('');
  if (hard.length) {
    say(`${C.r}${C.b}✗ ${hard.length} hard failure(s)${C.x}${pending.length ? `, ${pending.length} pending` : ''}`);
    return 1;
  }
  if (pending.length && STRICT) {
    say(`${C.y}${C.b}✗ ${pending.length} pending item(s) (--strict)${C.x}`);
    return 1;
  }
  say(`${C.g}✓ ${ok.length} id contract(s) hold${C.x}${pending.length ? `${C.y}, ${pending.length} still pending${C.x}` : ''}`);
  return 0;
}

main().then((c) => process.exit(c), (e) => {
  say(`${C.r}idcheck crashed: ${e && (e.stack || e.message)}${C.x}`);
  process.exit(1);
});
