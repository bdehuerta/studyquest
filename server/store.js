// server/store.js  [AGENT-A, extended by AGENT-F for v2]
// The seed game state, save migration, and the thin load/save façade over the
// save-slot layer in slots.js. Node stdlib only.

import {
  MATERIAL_IDS,
  BASE_MAX_ENERGY,
  STARTER_BLUEPRINTS,
  BUILDING_FOOTPRINT,
  BUILDING_ROLES,
  GADGET_IDS,
  BLOCK_IDS,
  WORLD_W,
  WORLD_H,
  CURRENCY_IDS,
  TOOL_DURABILITY,
  maxEnergyFor,
  CAVE,
  SPAWN,
  STARTING_FLORINS,
  GROVE,
  EQUIP_SLOT_COUNT,
  EQUIP_KINDS,
  SEED_ITEM_ID,
} from '../shared/constants.js';

import { ALL_MATERIAL_IDS } from '../shared/recipes.js';

import { loadActiveState, writeSlotState } from './slots.js';

// Re-exported so nothing that imported these from store.js in v1 breaks.
// These are *re-export* statements rather than `const x = imported` because
// store.js and slots.js import each other; a plain const would hit the TDZ if
// slots.js happened to be evaluated first.
export { DATA_DIR, LEGACY_STATE_PATH as STATE_PATH } from './slots.js';

const LOG_CAP = 200;

/**
 * A fresh, empty purse.
 *
 * Built from CURRENCY_IDS rather than written out by hand. Three hand-written
 * copies of the coin shape existed when the four currencies collapsed into two,
 * and each one kept minting the dead currencies back into the wallet from a
 * different direction. If the vocabulary changes again, this follows.
 */
function emptyCoins() {
  const out = {};
  for (const id of CURRENCY_IDS) out[id] = 0;
  return out;
}

function emptyMaterials() {
  const m = {};
  for (const id of ALL_MATERIAL_IDS) m[id] = 0;
  return m;
}

function emptyCounts(ids) {
  const o = {};
  for (const id of ids) o[id] = 0;
  return o;
}

/** The v3 effect slots. All of them are wall-clock stamps or one-shot charges. */
function emptyEffects() {
  return {
    studyMult: 1,          // armed by the Focus Bell, spent by the next payout
    studyMultUses: 0,
    craftPermits: 0,       // armed by the Portable Bench: crafts away from a house
    craftPermitDay: null,  // local day the bench was last unfolded
    revealUntil: 0,        // Lantern: client lights nodes until this timestamp
    markUntil: 0,          // Compass: client holds its marker until this timestamp
  };
}

/** Lifetime study totals. Gates read these and ONLY these — never coins. */
function emptyLifetime() {
  return {
    tasksCompleted: 0,
    studyMinutes: 0,
    sessions: 0,
    treesFelled: 0,
    saplingsPlanted: 0,
    blocksPlaced: 0,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** The seed game. Deliberately non-empty so every panel can be exercised on first run. */
// The three buildings a new save spawns with, and therefore the stamina
// ceiling it spawns with. Declared here so `defaultState` can reach both.
const STARTING_BUILDINGS = Object.freeze([
  { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
  { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
  { uid: 'seed-archive', buildingId: 'archive', x: 22, y: 20 },
  // The Exchange stands in the plaza with his roulette table, apart from the
  // Market — the Market buys and sells goods, he deals in shards, and mixing
  // the two in one panel is what the split was for.
  { uid: 'seed-exchange', buildingId: 'exchange_post', x: 26, y: 20 },
  // Neither outlander is in the plaza, and that is the point: they pay nearly
  // full price, and the walk out to them is what you are being paid for. The
  // Woodsman takes timber, in the south-west woods; the Stonemason takes stone,
  // under the mountain in the south-east. Between them they keep the
  // chop/mine -> sell -> reinvest loop alive now the Market only sells.
  { uid: 'seed-woodsman', buildingId: 'woodsman_camp', x: GROVE.x + 1, y: GROVE.y + 1 },
  // Set BEHIND the chamber, not on top of it: the footprint is solid ground, and
  // sitting it over the floor walled off the corridor the player walks in
  // through. Its base is the chamber's back wall, so the peak rises out of the
  // massif and the vendor stands in the chamber below it.
  { uid: 'seed-stonemason', buildingId: 'stonemason_camp', x: CAVE.x, y: CAVE.y - 2 },
]);
const STARTING_MAX_ENERGY = maxEnergyFor(STARTING_BUILDINGS, 1);

export function defaultState() {
  const now = Date.now();
  return {
    player: {
      name: 'Scholar',
      level: 1,
      xp: 0,
      xpToNext: 100,
      // The middle of the four plaza buildings — see SPAWN in shared/constants.
      x: SPAWN.x,
      y: SPAWN.y,
      /** Which map. See AREAS; everything starts in the Home Block. */
      area: 'home',
      // One purse now. 120 florins is the same starting money as the old four
      // piles of 120 were worth to a shop that only ever charged one of them.
      coins: { florin: STARTING_FLORINS, shard: 0 },
      darkBoxes: 3,
      streak: 0,
      lastActiveDate: null,

      // --- v2 -------------------------------------------------------------
      // A small starting grant so a brand new scholar can take a few swings
      // before their first study session. After this, energy comes ONLY from
      // tracked study time and completed tasks. It does not regenerate.
      // A new scholar starts RESTED, on a FULL bar. Stamina regenerates on its
      // own now (a full bar a minute), so starting part-empty was a leftover
      // from the days when studying was what refilled it — it only ever meant a
      // new player's first minute was spent waiting.
      //
      // "Full" is not BASE_MAX_ENERGY: spawn ships with a Study Hut, which
      // raises the ceiling, so both numbers are computed from the same starting
      // buildings listed below. Hardcoding 100 here would show 100/110 on a
      // brand-new save — a bar that has never been spent yet already missing a
      // notch.
      energy: STARTING_MAX_ENERGY,
      maxEnergy: STARTING_MAX_ENERGY,
      // STARTER PACK. A new scholar arrives with the two tools the Home Block
      // is built around: an axe for the trees and a pickaxe for the stone.
      // Without them the first session is a walk around a world where nothing
      // can be touched — every node needs a tool, and the tools need materials
      // that need the tools.
      gatherTools: [
        { uid: 'starter-axe', toolId: 'axe', durability: TOOL_DURABILITY.axe, maxDurability: TOOL_DURABILITY.axe },
        { uid: 'starter-pickaxe', toolId: 'pickaxe', durability: TOOL_DURABILITY.pickaxe, maxDurability: TOOL_DURABILITY.pickaxe },
      ],
      // Legacy single hidden slot. Kept, and kept in sync, so nothing that
      // still reads it breaks — but `equipped` below is the authority now.
      activeGatherTool: 'starter-axe',

      // --- EQUIPMENT: two visible slots ------------------------------------
      // Each entry is null or { kind, itemId, uid? }. See EQUIP_KINDS.
      // A fresh scholar owns no tools and two saplings, so the seeds start in
      // hand: that is what makes the plant prompt appear at all.
      // The axe starts IN HAND — prompts key off what is equipped, so a starter
      // tool sitting in the bag would still leave the first tree unchoppable.
      // The pickaxe and the saplings wait in the Bag for slot 2.
      equipped: [
        { kind: 'tool', itemId: 'axe', uid: 'starter-axe' },
        { kind: 'seed', itemId: SEED_ITEM_ID },
      ],
      activeSlot: 0,
      // A brand-new save has nothing to fold forward: this loadout IS the
      // starting loadout, chosen here rather than inferred by the migration.
      equipMigrated: true,

      // --- v3 -------------------------------------------------------------
      // Two seeds, and they are the whole of the starting inventory alongside
      // the two tools. Every felled tree drops a seedpod, so these two are a
      // head start rather than a supply.
      saplings: 2,

      // --- v5: CHARMS ------------------------------------------------------
      // Worn, not held: two slots, empty at the start. Charms are bought from
      // the Merchant, who no longer sells materials at all.
      charms: [null, null],
    },
    // NOTHING IN THE PACK. Bruno, 2026-08-31: "I start with many materials that
    // I should not start with: only start with the axe, the pickaxe and 2 tree
    // seeds."
    //
    // The crate of salvage existed to unblock crafting the first axe, back when
    // a new save owned no tools. It has been dead weight since the starter pack
    // landed — the axe and pickaxe are HANDED to you now, so there is nothing
    // left to bootstrap and every material should be something you went and
    // got. An empty pack also makes the first tree worth chopping.
    materials: emptyMaterials(),
    tools: [],
    // v3: every economic action now has a PLACE. A save that starts with only
    // a Study Hut can craft but can never shop, and can therefore never buy a
    // sapling or a blueprint — a hard soft-lock. Spawn ships with the three
    // buildings that carry the starting roles: craft, shop, blueprints.
    buildings: STARTING_BUILDINGS.map((b) => ({ ...b })),
    pendingBuildings: [],
    tasks: [
      {
        id: 'seed-task-1',
        submission: null,
        grading: null,
        title: 'Calculus problem set 4',
        subject: 'math',
        workType: 'practice',
        difficulty: 3,
        estMinutes: 90,
        status: 'todo',
        minutesLogged: 0,
        rank: null,
        dueInDays: 2,
        completedAt: null,
      },
      {
        id: 'seed-task-2',
        title: 'Read: The Interwar Economy, ch. 3',
        subject: 'history',
        workType: 'reading',
        difficulty: 2,
        estMinutes: 45,
        status: 'todo',
        minutesLogged: 0,
        rank: null,
        dueInDays: 4,
        completedAt: null,
      },
      {
        id: 'seed-task-3',
        title: 'Build the pathfinding demo',
        subject: 'cs',
        workType: 'project',
        difficulty: 4,
        estMinutes: 180,
        status: 'todo',
        minutesLogged: 0,
        rank: null,
        dueInDays: 7,
        completedAt: null,
      },
      {
        id: 'seed-task-4',
        title: 'Revise elasticity + market failure',
        subject: 'econ',
        workType: 'revision',
        difficulty: 2,
        estMinutes: 60,
        status: 'todo',
        minutesLogged: 0,
        rank: null,
        dueInDays: 1,
        completedAt: null,
      },
    ],
    sessions: [],
    log: [
      { ts: now, text: 'A new scholar arrives. The study hut is already standing.', kind: 'info' },
      { ts: now + 1, text: 'A crate of salvage was left at the hut — enough ironwood and chalkstone for a first axe.', kind: 'info' },
      { ts: now + 2, text: 'Energy comes only from real study. Log a session or finish a task before you swing anything.', kind: 'info' },
      { ts: now + 3, text: 'Trees do not grow back. Every one you fell is gone unless you plant a sapling in its place.', kind: 'info' },
      { ts: now + 4, text: 'Crafting happens at the Study Hut, trading at the Trading Post, blueprints at the Archive. Stand next to them.', kind: 'info' },
    ],

    // --- v2 state keys ------------------------------------------------------
    harvested: {},                         // "x,y" -> { nodeType, hitsLeft, respawnAt }
    blueprints: [...STARTER_BLUEPRINTS],   // recipe ids you are allowed to craft
    shops: {
      refreshedOn: null,
      stock: { merchant: [], broker: [], archivist: [] },
      brokerBoxesSoldToday: 0,
    },
    relics: [],

    // --- v3 state keys ------------------------------------------------------
    plantings: {},                    // "x,y" -> { plantedAt, stage, source, boostMinutes }
    gadgets: emptyCounts(GADGET_IDS), // gadgetId -> how many you own
    cooldowns: {},                    // gadgetId -> timestamp it is usable again
    blocks: emptyCounts(BLOCK_IDS),   // blockId -> how many are in the pack
    placedBlocks: {},                 // "x,y" -> { blockId, placedAt, label }
    // Blocks are cheap enough that half of one unit's cost rounds to zero.
    // Rather than quietly eat the refund we bank the fraction and pay it out
    // the moment it crosses a whole unit. Nothing is ever lost to rounding.
    refundBank: { materials: {}, coins: {} },
    effects: emptyEffects(),
    lifetime: emptyLifetime(),

    // v5 — the outlander unlocks.
    // `questItems` is a plain count map, kept apart from `materials` so nothing
    // that mints materials can ever mint a key. `vendorsUnlocked` is the record
    // of who has agreed to trade; once in here a vendor stays open, so dropping
    // below level 10 (impossible today, but levels are about to be reworked)
    // could never shut a door the player has already walked through.
    // `questsDone` guards the one-off XP awards from being paid twice.
    questItems: {},
    vendorsUnlocked: [],
    questsDone: [],
    // v5 — the Herald. `summonedAt` is stamped the first time the scholar is
    // seen at HERALD.level and never again; the ride is derived from it on the
    // client, so it survives a reload mid-arrival.
    herald: { summonedAt: null, spoken: false },
    // v5 — the lake chain. The hut in the north-east woods is locked until a
    // Silver Key opens it; opening it frees the Hutkeeper and hands over the
    // boat, which then sits in the lake by the mountain.
    hut: { opened: false, spoken: false },
    boat: { granted: false, lastCastAt: 0, riding: false },
    // v7: the mountain. Gear found, where every boulder has been shoved to, and
    // whether the Rime Warden still stands. Seeded lazily by reachesOf() so a
    // save written before the mountain existed walks into a finished one.
    reaches: { gear: [], boulders: {}, warden: { beaten: false } },
    // v8: which floor of the Keep of Elderwatch you are on, 0 for the bailey.
    tower: { floor: 0 },
    // v9: THE CODEX. `seen` is a flat list of `category:id` keys and is a
    // HIGH-WATER MARK — swept in by shared/codex.js on every persist and never
    // taken out again, because knowing a material is not the same as holding
    // one. The book itself is a quest item; this fills in whether you have
    // found it or not, so the day you do it is already full.
    codex: { seen: [] },
    // v10 — the hermit's errand, and whether you are down the cheese cave.
    // `spoken` he has asked; `monger` you have found the cheesemonger; `paid`
    // he has been given the cheese and has baked. Seeded lazily like the rest,
    // so an older save walks into the quest rather than round it.
    hermit: { spoken: false, monger: false, paid: false },
    cave: { in: false },
    // v10 — the Farlands chapter. `metFamily` is Ilsa of the Sallow: the first
    // of the twelve, and the person who explains why a banner is not enough.
    farlands: { metFamily: false },
    // v6 — the second map. `area` is where the scholar is standing; `areaPos`
    // remembers the last tile in each, so walking back and forth does not dump
    // you at a fixed spot every time.
    areaPos: {},
    wiseMan: { found: false, spoken: false },

    meta: {
      slot: 1,
      name: 'Save 1',
      createdAt: now,
      lastPlayedAt: now,
      playtimeMs: 0,
      day: todayISO(),
    },
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Fill in top-level keys (and one level inside player / meta / shops) that an
 * older save file lacks. v1 saves come through here and pick up energy,
 * gatherTools, blueprints, harvested and shops without losing anything.
 */
export function migrateState(state) {
  const base = defaultState();
  if (!isPlainObject(state)) return base;

  for (const key of Object.keys(base)) {
    if (state[key] === undefined || state[key] === null) {
      state[key] = base[key];
      continue;
    }
    // shape mismatch -> take the default rather than crash later
    if (Array.isArray(base[key]) !== Array.isArray(state[key])) {
      state[key] = base[key];
      continue;
    }
    if (isPlainObject(base[key]) && isPlainObject(state[key])) {
      for (const sub of Object.keys(base[key])) {
        // The equipment slots are NOT backfilled from the default. A save that
        // predates them must arrive at migrateEquipment() with empty hands, so
        // the old `activeGatherTool` can be folded into slot 1 — handing it the
        // default loadout first would leave slot 1 taken and drop the tool.
        // The starter pack is for NEW saves only. Backfilling it would hand an
        // existing save a free axe and pickaxe, and — worse — hand it the
        // starter uid in `activeGatherTool`, which the v2 migration then
        // "repaired" by equipping whatever tool that save did own.
        if (key === 'player'
          && (sub === 'equipped' || sub === 'activeSlot' || sub === 'equipMigrated'
            || sub === 'gatherTools' || sub === 'activeGatherTool')) continue;
        if (state[key][sub] === undefined || state[key][sub] === null) {
          state[key][sub] = base[key][sub];
        }
      }
    }
  }

  // A corrupt save must degrade, never crash the boot. If `player` is not an
  // object at all (a truncated write, a hand-edited file), rebuild it from the
  // default rather than throwing a TypeError out of loadState() before the
  // server even listens — which previously took every OTHER slot down with it.
  if (!isPlainObject(state.player)) state.player = defaultState().player;

  // --- MONEY: four currencies collapsed into Florins + Shards ---------------
  //
  // A save from before the collapse carries focus/insight/grind/spark. Those
  // are SUMMED into florins rather than dropped: the four were interchangeable
  // in practice (every price named one of them), so the sum is what the player
  // could actually buy with. Deleting them would confiscate the wallet of every
  // existing save, which is not a migration, it is a robbery.
  if (!isPlainObject(state.player.coins)) state.player.coins = emptyCoins();
  const purse = state.player.coins;
  const LEGACY_COINS = ['focus', 'insight', 'grind', 'spark'];
  let legacy = 0;
  let sawLegacy = false;
  for (const old of LEGACY_COINS) {
    if (purse[old] === undefined) continue;
    sawLegacy = true;
    const v = Number(purse[old]);
    if (Number.isFinite(v) && v > 0) legacy += v;
    delete purse[old];
  }
  if (sawLegacy && legacy > 0) {
    purse.florin = (Number(purse.florin) || 0) + Math.round(legacy);
  }
  for (const c of Object.keys(emptyCoins())) {
    const v = Number(purse[c]);
    purse[c] = Number.isFinite(v) ? v : 0;
  }

  // every material id present — v3 adds the tree drops to this list, so a v2
  // save picks up heartwood/resin/seedpod at 0 rather than as undefined.
  if (!isPlainObject(state.materials)) state.materials = emptyMaterials();
  for (const id of ALL_MATERIAL_IDS) {
    const v = Number(state.materials[id]);
    state.materials[id] = Number.isFinite(v) ? v : 0;
  }

  // --- v2 shapes ---------------------------------------------------------
  const p = state.player;
  if (!Number.isFinite(Number(p.energy))) p.energy = 0;
  else p.energy = Math.max(0, Number(p.energy));
  if (!Number.isFinite(Number(p.maxEnergy)) || Number(p.maxEnergy) <= 0) p.maxEnergy = BASE_MAX_ENERGY;
  if (!Array.isArray(p.gatherTools)) p.gatherTools = [];
  p.gatherTools = p.gatherTools.filter(isPlainObject).map((t) => ({
    uid: String(t.uid || ''),
    toolId: String(t.toolId || t.itemId || ''),
    durability: Math.max(0, Number(t.durability) || 0),
    maxDurability: Math.max(1, Number(t.maxDurability) || 1),
  })).filter((t) => t.uid && t.toolId);
  if (typeof p.activeGatherTool !== 'string') p.activeGatherTool = null;
  if (p.activeGatherTool && !p.gatherTools.some((t) => t.uid === p.activeGatherTool)) {
    p.activeGatherTool = p.gatherTools.length ? p.gatherTools[0].uid : null;
  }

  // --- EQUIPMENT ---------------------------------------------------------
  migrateEquipment(state);

  if (!isPlainObject(state.harvested)) state.harvested = {};
  if (!Array.isArray(state.blueprints)) state.blueprints = [...STARTER_BLUEPRINTS];
  for (const id of STARTER_BLUEPRINTS) {
    if (!state.blueprints.includes(id)) state.blueprints.push(id);
  }
  if (!isPlainObject(state.shops)) state.shops = defaultState().shops;
  if (!isPlainObject(state.shops.stock)) {
    state.shops.stock = { merchant: [], broker: [], archivist: [] };
  }
  for (const k of ['merchant', 'broker', 'archivist']) {
    if (!Array.isArray(state.shops.stock[k])) state.shops.stock[k] = [];
  }
  if (!Number.isFinite(Number(state.shops.brokerBoxesSoldToday))) {
    state.shops.brokerBoxesSoldToday = 0;
  }
  if (!Array.isArray(state.relics)) state.relics = [];

  // --- v3 shapes ---------------------------------------------------------
  migrateV3(state);

  if (!isPlainObject(state.meta)) state.meta = defaultState().meta;
  if (!Number.isFinite(Number(state.meta.playtimeMs))) state.meta.playtimeMs = 0;

  if (!Array.isArray(state.log)) state.log = [];
  if (state.log.length > LOG_CAP) state.log = state.log.slice(-LOG_CAP);

  return state;
}

// ---------------------------------------------------------------------------
// EQUIPMENT — two visible slots
// ---------------------------------------------------------------------------

/** Clean one slot entry, or null. Anything unrecognisable becomes null. */
export function normaliseRef(ref, state) {
  if (!isPlainObject(ref)) return null;
  const kind = String(ref.kind || '');
  if (!EQUIP_KINDS.includes(kind)) return null;
  const itemId = String(ref.itemId || '');
  if (!itemId) return null;
  if (kind === 'tool' || kind === 'weapon') {
    const uid = String(ref.uid || '');
    if (!uid) return null;
    // A tool that has broken and been dropped from the pack cannot stay in a
    // slot: the slot would name a thing the player no longer owns.
    const tools = (state && state.player && Array.isArray(state.player.gatherTools))
      ? state.player.gatherTools : [];
    if (kind === 'tool' && !tools.some((t) => isPlainObject(t) && t.uid === uid)) return null;
    return { kind, itemId, uid };
  }
  if (kind === 'gadget' && !GADGET_IDS.includes(itemId)) return null;
  if (kind === 'seed' && itemId !== SEED_ITEM_ID) return null;
  return { kind, itemId };
}

/**
 * Keep the legacy `player.activeGatherTool` pointing at whatever gathering tool
 * is actually in a slot. Nothing new should read it — but v2 code paths, older
 * builds and any save written by this server all still carry it, so it must
 * never contradict the slots.
 */
export function syncLegacyGatherTool(state) {
  const p = state && state.player;
  if (!isPlainObject(p)) return;
  const slots = Array.isArray(p.equipped) ? p.equipped : [];
  const active = Number(p.activeSlot) === 1 ? 1 : 0;
  const order = [slots[active], slots[active === 0 ? 1 : 0]];
  for (const ref of order) {
    if (isPlainObject(ref) && ref.kind === 'tool' && ref.uid) { p.activeGatherTool = ref.uid; return; }
  }
  p.activeGatherTool = null;
}

/** Put `ref` in the first empty slot. Returns the index used, or -1. */
export function equipIntoFirstFreeSlot(state, ref) {
  const p = state && state.player;
  if (!isPlainObject(p)) return -1;
  if (!Array.isArray(p.equipped)) p.equipped = [null, null];
  for (let i = 0; i < EQUIP_SLOT_COUNT; i += 1) {
    if (!p.equipped[i]) { p.equipped[i] = ref; syncLegacyGatherTool(state); return i; }
  }
  return -1;
}

/**
 * Fold the old single hidden slot into the new pair WITHOUT losing anything.
 *
 * - `activeGatherTool` (one uid) becomes slot 1.
 * - a save that owns saplings or seedpods gets them in slot 2, because before
 *   this change holding seeds was enough to plant. Not doing this would quietly
 *   take planting away from every existing save.
 * Both only ever fill a slot that is EMPTY, so a save that already carries
 * `equipped` keeps exactly what the player chose.
 */
function migrateEquipment(state) {
  const p = state.player;
  if (!Array.isArray(p.equipped)) p.equipped = [null, null];
  p.equipped.length = EQUIP_SLOT_COUNT;
  for (let i = 0; i < EQUIP_SLOT_COUNT; i += 1) {
    p.equipped[i] = normaliseRef(p.equipped[i], state);
  }
  // the same thing must not occupy both slots
  if (p.equipped[0] && p.equipped[1]
    && p.equipped[0].kind === p.equipped[1].kind
    && p.equipped[0].itemId === p.equipped[1].itemId
    && (p.equipped[0].uid || null) === (p.equipped[1].uid || null)) {
    p.equipped[1] = null;
  }

  // ONCE PER SAVE, NOT ONCE PER LOAD.
  //
  // This is the fold-forward from the old single hidden slot, and it must be
  // gated on a persisted flag. Written as a plain rule it re-ran on every boot,
  // so putting your saplings away and quitting put them straight back in your
  // hand next time — the game silently undoing a choice the player had just
  // made. An empty slot is a decision, and a migration must never overrule one.
  if (!p.equipMigrated) {
    if (!p.equipped[0] && typeof p.activeGatherTool === 'string' && p.activeGatherTool) {
      const t = p.gatherTools.find((x) => isPlainObject(x) && x.uid === p.activeGatherTool);
      if (t) p.equipped[0] = { kind: 'tool', itemId: t.toolId, uid: t.uid };
    }
    // Before slots existed, merely OWNING saplings was enough to plant, so a
    // save arriving from that era gets them put in hand — otherwise the upgrade
    // would quietly take planting away from it.
    const holdsSeed = p.equipped.some((r) => r && r.kind === 'seed');
    const seedsOwned = Math.max(0, Number(p.saplings) || 0)
      + Math.max(0, Number(state.materials && state.materials.seedpod) || 0);
    if (!holdsSeed && seedsOwned > 0) {
      const free = p.equipped.findIndex((r) => !r);
      if (free !== -1) p.equipped[free] = { kind: 'seed', itemId: SEED_ITEM_ID };
    }
    p.equipMigrated = true;
  }

  const a = Number(p.activeSlot);
  p.activeSlot = (a === 1) ? 1 : 0;
  // Never leave the active slot pointing at nothing while the other holds something.
  if (!p.equipped[p.activeSlot] && p.equipped[p.activeSlot === 0 ? 1 : 0]) {
    p.activeSlot = p.activeSlot === 0 ? 1 : 0;
  }
  syncLegacyGatherTool(state);
}

// ---------------------------------------------------------------------------
// v3 migration
// ---------------------------------------------------------------------------

function footprint(buildingId) {
  return BUILDING_FOOTPRINT[buildingId] || { w: 1, h: 1 };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Find a spot near (ox, oy) where `buildingId` fits without touching anything
 * already standing. Searches outward in rings so the new building lands as
 * close to spawn as it can. Terrain is the client's business — the server does
 * not own the tile map — so ENG-WORLD may need to nudge one of these if the
 * seed puts water there.
 */
function findFreeSpot(state, buildingId, ox, oy) {
  const fp = footprint(buildingId);
  const built = (Array.isArray(state.buildings) ? state.buildings : []).filter(isPlainObject);
  const fits = (x, y) => {
    if (x < 1 || y < 1 || x + fp.w > WORLD_W - 1 || y + fp.h > WORLD_H - 1) return false;
    const here = { x, y, w: fp.w, h: fp.h };
    for (const b of built) {
      const bf = footprint(b.buildingId);
      // one tile of breathing room, so buildings never share a wall
      const there = { x: (Number(b.x) || 0) - 1, y: (Number(b.y) || 0) - 1, w: bf.w + 2, h: bf.h + 2 };
      if (overlaps(here, there)) return false;
    }
    return true;
  };
  for (let r = 2; r <= 12; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (fits(ox + dx, oy + dy)) return { x: ox + dx, y: oy + dy };
      }
    }
  }
  return null;
}

/**
 * v3 made every economic action location-gated. An existing save that never
 * built a Trading Post or an Archive would be permanently unable to buy a
 * sapling or a blueprint — the player's progress would still be there but the
 * game would be unfinishable. So we raise the missing role buildings for them,
 * once, and say so in the log. This never removes or moves anything.
 */
const BOOTSTRAP_ROLES = Object.freeze([
  { role: 'craft', buildingId: 'study_hut' },
  { role: 'shop', buildingId: 'trading_post' },
  { role: 'blueprints', buildingId: 'archive' },
  // v5. These have FIXED homes, unlike the three above: the Exchange belongs in
  // the plaza, and the two outlanders belong in the cave and the grove the world
  // generator carves for them. Dropping them next to wherever the player happens
  // to be standing would put a mountain in the town square.
  //
  // Without this, every save made before v5 has no Exchange, no Woodsman and no
  // Stonemason — which is not "the NPCs are missing art", it is "those vendors
  // do not exist in your world at all", and is exactly what Bruno was seeing.
  { role: 'exchange', buildingId: 'exchange_post', at: { x: 26, y: 20 } },
  { role: 'woodsman', buildingId: 'woodsman_camp', at: { x: GROVE.x + 1, y: GROVE.y + 1 } },
  { role: 'stonemason', buildingId: 'stonemason_camp', at: { x: CAVE.x, y: CAVE.y - 2 } },
]);

function ensureRoleBuildings(state) {
  if (!Array.isArray(state.buildings)) state.buildings = [];
  const raised = [];
  for (const { role, buildingId, at } of BOOTSTRAP_ROLES) {
    const covered = state.buildings.some(
      (b) => isPlainObject(b) && (BUILDING_ROLES[b.buildingId] || []).includes(role)
    );
    if (covered) continue;
    let spot;
    if (at) {
      // A fixed home. It is raised there even if something is in the way — the
      // world generator clears these places, and a vendor that quietly relocates
      // to the plaza is worse than one standing a tile off.
      spot = { x: at.x, y: at.y };
    } else {
      const ox = Math.max(2, Math.min(WORLD_W - 6, Math.round(Number(state.player && state.player.x) || 24)));
      const oy = Math.max(2, Math.min(WORLD_H - 6, Math.round(Number(state.player && state.player.y) || 18)));
      spot = findFreeSpot(state, buildingId, ox, oy);
    }
    if (!spot) continue;
    state.buildings.push({
      uid: `v3-${buildingId}-${Date.now().toString(36)}`,
      buildingId,
      x: spot.x,
      y: spot.y,
      raisedByMigration: true,
    });
    raised.push(`${buildingId} at ${spot.x},${spot.y}`);
  }
  return raised;
}

/** Lifetime totals for the gates, reconstructed from history on first v3 boot. */
function deriveLifetime(state) {
  const life = emptyLifetime();
  for (const t of Array.isArray(state.tasks) ? state.tasks : []) {
    if (isPlainObject(t) && t.status === 'done') life.tasksCompleted += 1;
  }
  for (const s of Array.isArray(state.sessions) ? state.sessions : []) {
    if (!isPlainObject(s)) continue;
    life.sessions += 1;
    life.studyMinutes += Math.max(0, Number(s.minutes) || 0);
  }
  // minutes logged against tasks that have no surviving session record
  return life;
}

function migrateV3(state) {
  const p = state.player;
  if (!Number.isFinite(Number(p.saplings))) p.saplings = 0;
  else p.saplings = Math.max(0, Math.floor(Number(p.saplings)));

  if (!isPlainObject(state.plantings)) state.plantings = {};
  for (const [key, v] of Object.entries(state.plantings)) {
    if (!isPlainObject(v) || !Number.isFinite(Number(v.plantedAt))) {
      delete state.plantings[key];
      continue;
    }
    v.plantedAt = Number(v.plantedAt);
    v.boostMinutes = Math.max(0, Number(v.boostMinutes) || 0);
    v.source = typeof v.source === 'string' ? v.source : 'sapling';
  }

  if (!isPlainObject(state.gadgets)) state.gadgets = {};
  for (const id of GADGET_IDS) {
    const v = Number(state.gadgets[id]);
    state.gadgets[id] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }
  if (!isPlainObject(state.cooldowns)) state.cooldowns = {};
  for (const [id, v] of Object.entries(state.cooldowns)) {
    if (!GADGET_IDS.includes(id) || !Number.isFinite(Number(v))) delete state.cooldowns[id];
  }

  if (!isPlainObject(state.blocks)) state.blocks = {};
  for (const id of BLOCK_IDS) {
    const v = Number(state.blocks[id]);
    state.blocks[id] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }
  if (!isPlainObject(state.placedBlocks)) state.placedBlocks = {};
  for (const [key, v] of Object.entries(state.placedBlocks)) {
    if (!isPlainObject(v) || !BLOCK_IDS.includes(v.blockId)) delete state.placedBlocks[key];
  }

  if (!isPlainObject(state.refundBank)) state.refundBank = { materials: {}, coins: {} };
  if (!isPlainObject(state.refundBank.materials)) state.refundBank.materials = {};
  if (!isPlainObject(state.refundBank.coins)) state.refundBank.coins = {};

  if (!isPlainObject(state.effects)) state.effects = emptyEffects();
  const eff = emptyEffects();
  for (const k of Object.keys(eff)) {
    if (state.effects[k] === undefined || state.effects[k] === null) state.effects[k] = eff[k];
  }
  if (!Number.isFinite(Number(state.effects.studyMult)) || Number(state.effects.studyMult) < 1) {
    state.effects.studyMult = 1;
  }

  if (!isPlainObject(state.lifetime)) {
    state.lifetime = deriveLifetime(state);
  } else {
    const base = emptyLifetime();
    const derived = deriveLifetime(state);
    for (const k of Object.keys(base)) {
      const v = Number(state.lifetime[k]);
      // never let a migration LOWER a lifetime total — gates must not regress
      const floor = derived[k] !== undefined ? derived[k] : 0;
      state.lifetime[k] = Math.max(Number.isFinite(v) ? v : 0, floor);
    }
  }

  // v3.1: saves made before trees became permanent hold tree records carrying a
  // v2 respawnAt. Those expire and redraw a felled tree half-rendered. There is
  // no way to tell a legitimately-felled tree from a bugged one, so clear the
  // lot once: the forest comes back whole, and every fell after this is clean.
  if (isPlainObject(state.harvested) && !(state.meta && state.meta.treeResetV31)) {
    let cleared = 0;
    for (const [key, e] of Object.entries(state.harvested)) {
      if (!isPlainObject(e)) { delete state.harvested[key]; cleared++; continue; }
      const isTree = e.nodeType === 'tree';
      if (isTree && !e.stumpUntil) { delete state.harvested[key]; cleared++; }
    }
    if (!isPlainObject(state.meta)) state.meta = {};
    state.meta.treeResetV31 = true;
    if (cleared) pushLog(state, `The forest was surveyed and ${cleared} damaged tree record(s) cleared — every tree stands again.`, 'build');
  }

  const raised = ensureRoleBuildings(state);
  if (raised.length) {
    pushLog(
      state,
      'The village grew while you were away: ' + raised.join(', ') +
      '. In this version crafting, trading and blueprints all happen at a building, ' +
      'so the ones you were missing have been raised for you.',
      'build'
    );
  }
  return state;
}

/** Kept as an alias: v1 code and tests referred to this name internally. */
const migrate = migrateState;
export { migrate };

export function loadState() {
  return loadActiveState();
}

export function saveState(state) {
  return writeSlotState(state);
}

export function pushLog(state, text, kind = 'info') {
  if (!state) return null;
  if (!Array.isArray(state.log)) state.log = [];
  const entry = { ts: Date.now(), text: String(text), kind: String(kind || 'info') };
  state.log.push(entry);
  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
  return entry;
}
