// server/api.js  [AGENT-A]
// Every API route. handleApi never throws; game-level failures come back as
// { status:200, json:{ ok:false, error:'...' } }.

import {
  WORLD_W,
  WORLD_H,
  WORK_TYPE_IDS,
  SUBJECTS,
  BUILDING_FOOTPRINT,
  counterRect,
  plantingBlockedAt,
  QUEST_ITEMS,
  CHARMS,
  CHARM_IDS,
  CHARM_SLOT_COUNT,
  GATHER_TOOL_IDS,
  HERALD,
  HERALD_DIALOGUE,
  HUT,
  BOAT,
  FISHING,
  HUTKEEPER_DIALOGUE,
  AREAS,
  CROSSING,
  WISE_MAN,
  WISE_MAN_DIALOGUE,
  WISE_MAN_RETURN_DIALOGUE,
  QUEST_ITEM_IDS,
  VENDOR_LOCKS,
  QUEST_XP,
  SELL_XP_PER_UNIT,
  BOX_XP_RANGE,
  BUILDING_IDS,
  MATERIAL_IDS,
  CURRENCY_IDS,
  MAIN_CURRENCY,
  DAILY_SESSION_COIN_CAP,
  // --- v2 ---
  GATHER_NODES,
  TOOL_DURABILITY,
  BASE_MAX_ENERGY,
  maxEnergyFor,
  STAMINA_PER_LEVEL,
  ENERGY_PER_TASK_DIFFICULTY,
  ENERGY_PER_TRACKED_MINUTE,
  STAMINA_REGEN_PER_MINUTE,
  STUMP_MINUTES,
  STUDY_DROP_MIN_RANK,
  STUDY_DROP_BASE_CHANCE,
  STUDY_DROP_PER_DIFFICULTY,
  RANKS,
  // --- v3 ---
  TREES_REGROW,
  SAPLING_STAGES,
  SAPLING_TOTAL_MINUTES,
  BUILDING_ROLES,
  GATES,
  AREA_HOME,
  GADGET_IDS,
  BLOCK_IDS,
  BLOCK_REFUND_RATE,
  TILE_TYPES,
  EQUIP_SLOT_COUNT,
  SEED_ITEM_ID,
  tileKey,
  parseTileKey,
  TIMBER_TILES,
  REACHES_GEAR,
  REACHES_GEAR_XP,
  GEAR_SITES,
  REACHES_BOULDERS,
  REACHES_PLATES,
  WARDEN,
  WISE_CAVE,
  crossingAt,
  AREA_NAMES,
  STANDARD_DIALOGUE,
  RING_DIALOGUE,
  questSitesFor,
  QUEST_ITEMS as QUEST_ITEM_DEFS,
  AREA_PUZZLES,
  bouldersFor,
  platesFor,
  TOWER,
  TOWER_FLOORS,
  DOOR_KEYS,
  ELDERWATCH_SWITCHES,
} from '../shared/constants.js';
import { sweepCodex } from '../shared/codex.js';

import {
  computeTaskPayout,
  computeSessionPayout,
  rollDarkBox,
  applyLevelUps,
  xpToNext,
  sessionCoinsToday,
  emptyCoins,
} from '../shared/economy.js';

import {
  getRecipe, checkCraft, TOOLS, BUILDINGS, MATERIALS,
  // --- v3 ---
  GADGETS, BLOCKS, TREE_DROP_TABLE, RECIPES,
  rollTreeDrops, growthOf, isTreeDrop, isAlwaysKnown,
  getRecipeFor, outputQtyOf, unitCostOf, materialName,
} from '../shared/recipes.js';

// --- v4: the grading seam. api.js knows these three names and nothing about
// how a grade is arrived at.
import {
  gradeSubmission,
  graderId,
  GRADER_LABELS,
  MAX_SUBMISSION_CHARS,
} from './grader.js';

import {
  defaultState, pushLog,
  normaliseRef, syncLegacyGatherTool, equipIntoFirstFreeSlot,
} from './store.js';
import * as Shops from './shops.js';
import { importTasks } from './import.js';
import {
  listSlots, switchSlot, createSlot, deleteSlot, renameSlot,
  DATA_DIR, slotDir,
  readSettings as readStoredSettings, writeSettings as writeStoredSettings,
} from './slots.js';

// ---------------------------------------------------------------- utilities

let uidCounter = 0;
function uid(prefix = 'id') {
  uidCounter = (uidCounter + 1) % 1e6;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}_${rand}`;
}

const SUBJECT_IDS = SUBJECTS.map((s) => s.id);

const ok = (extra = {}) => ({ status: 200, json: { ok: true, ...extra } });
const fail = (error, status = 200) => ({ status, json: { ok: false, error: String(error) } });

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function num(v) {
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// A second, hand-written copy of the coin shape lived here and outlived the
// currency collapse — it kept minting focus/insight/grind/spark into every
// payout, and from there into the saved wallet, long after nothing else knew
// what those were. There is one definition now, in economy.js, built from
// CURRENCY_IDS.
const emptyCoinObj = emptyCoins;

/** Normalise whatever economy hands back into a safe PayoutResult. */
function normalizePayout(p) {
  const src = isObj(p) ? p : {};
  const coins = emptyCoinObj();
  if (isObj(src.coins)) {
    for (const c of CURRENCY_IDS) {
      const v = num(src.coins[c]);
      coins[c] = v === null ? 0 : Math.round(v);
    }
  }
  return {
    coins,
    xp: Math.max(0, Math.round(num(src.xp) ?? 0)),
    darkBoxes: Math.max(0, Math.round(num(src.darkBoxes) ?? 0)),
    rank: typeof src.rank === 'string' ? src.rank : 'C',
    breakdown: Array.isArray(src.breakdown) ? src.breakdown.slice() : [],
  };
}

function creditPayout(state, payout) {
  const p = state.player;
  for (const c of CURRENCY_IDS) p.coins[c] = (num(p.coins[c]) ?? 0) + payout.coins[c];
  p.xp = (num(p.xp) ?? 0) + payout.xp;
  p.darkBoxes = (num(p.darkBoxes) ?? 0) + payout.darkBoxes;
}

function coinSummary(coins) {
  const parts = CURRENCY_IDS.filter((c) => coins[c] > 0).map((c) => `${coins[c]} ${c}`);
  return parts.length ? parts.join(', ') : 'no coins';
}

function totalOf(coins) {
  return CURRENCY_IDS.reduce((s, c) => s + (num(coins[c]) ?? 0), 0);
}

function touchStreak(state) {
  const p = state.player;
  const today = new Date().toISOString().slice(0, 10);
  if (p.lastActiveDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  p.streak = p.lastActiveDate === yesterday ? (num(p.streak) ?? 0) + 1 : 1;
  p.lastActiveDate = today;
}

function footprintOf(buildingId) {
  const fp = BUILDING_FOOTPRINT[buildingId];
  if (fp) return fp;
  const def = BUILDINGS && BUILDINGS[buildingId];
  if (def && num(def.w) && num(def.h)) return { w: num(def.w), h: num(def.h) };
  return { w: 1, h: 1 };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------- v2: energy

// How much each building raises the energy ceiling. Buildings are the only
// thing that lifts it — energy itself still comes only from study.
// ENERGY_BONUS_BY_BUILDING now lives in shared/constants.js — store.js needs
// it as well, to start a new save on a full bar.

/** Recompute player.maxEnergy from BASE_MAX_ENERGY + what has been built. */
function refreshMaxEnergy(state) {
  const max = maxEnergyFor(state.buildings, state.player && state.player.level);
  state.player.maxEnergy = max;
  const cur = num(state.player.energy);
  state.player.energy = clamp(cur === null ? 0 : cur, 0, max);
  return max;
}

/** Credit energy, clamped to the ceiling. Returns how much actually landed. */
function grantEnergy(state, amountRaw) {
  const max = refreshMaxEnergy(state);
  const amount = Math.max(0, Math.round(num(amountRaw) ?? 0));
  const before = num(state.player.energy) ?? 0;
  const after = clamp(before + amount, 0, max);
  state.player.energy = after;
  return { gained: after - before, wasted: amount - (after - before), energy: after, maxEnergy: max };
}

function energyNote(e) {
  if (!e || e.gained <= 0) {
    return e && e.wasted > 0 ? ', energy already full' : '';
  }
  return `, +${e.gained} energy` + (e.wasted > 0 ? ` (${e.wasted} spilled — energy is full)` : '');
}

// ---------------------------------------------------------------- the router

/**
 * Stamina regenerates with wall-clock time, whether the game is open or not.
 * We do not tick on a timer — we store when stamina was last settled and pay
 * out the elapsed time lazily on the next request. That way closing the app
 * for an hour credits the hour, and there is no background work to leak.
 */
/**
 * A study drop is the reward for quality, not volume: nothing below rank A can
 * ever produce one. The material pool is weighted toward what the player has
 * least of, so drops feel like they unblock rather than pile up.
 */
function rollStudyDrop(state, rank, difficulty) {
  const minIdx = RANKS.indexOf(STUDY_DROP_MIN_RANK);
  const gotIdx = RANKS.indexOf(String(rank));
  if (gotIdx < 0 || minIdx < 0 || gotIdx < minIdx) return null;

  const chance = STUDY_DROP_BASE_CHANCE + STUDY_DROP_PER_DIFFICULTY * (num(difficulty) ?? 1);
  if (Math.random() >= clamp(chance, 0, 0.75)) return null;

  // Bias toward the scarcest material the player currently holds.
  // v3: never a tree drop. Heartwood, Resin and Seedpod come out of a tree you
  // felled and replaced, or they do not come at all.
  const pool = Object.keys(MATERIALS).filter((id) => !isTreeDrop(id));
  if (!pool.length) return null;
  pool.sort((a, b) => (num(state.materials?.[a]) ?? 0) - (num(state.materials?.[b]) ?? 0));
  const pick = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
  const qty = gotIdx >= RANKS.indexOf('S') ? 2 : 1;

  if (!isObj(state.materials)) state.materials = {};
  state.materials[pick] = (num(state.materials[pick]) ?? 0) + qty;
  return { materialId: pick, name: MATERIALS[pick]?.name || pick, qty };
}

function regenStamina(state) {
  const p = state && state.player;
  if (!isObj(p)) return;
  const max = num(p.maxEnergy) ?? BASE_MAX_ENERGY;
  const now = Date.now();
  const last = num(p.staminaAt);
  if (!last) { p.staminaAt = now; return; }          // first sighting, no backpay
  const minutes = (now - last) / 60000;
  if (minutes <= 0) { p.staminaAt = now; return; }
  const before = clamp(num(p.energy) ?? 0, 0, max);
  if (before >= max) { p.staminaAt = now; return; }  // full: don't bank credit
  const after = clamp(before + minutes * STAMINA_REGEN_PER_MINUTE, 0, max);
  p.energy = Math.floor(after);
  // Keep the remainder owed rather than rounding it away, so a slow trickle
  // still adds up across many short requests.
  p.staminaAt = now - Math.round(((after - Math.floor(after)) / STAMINA_REGEN_PER_MINUTE) * 60000);
}

// =========================================================================
// v3 FOUNDATIONS
// =========================================================================

// ---------------------------------------------------------------- node rules
/**
 * Derived ONCE from GATHER_NODES so that "trees are finite" is a property of
 * the node table rather than an `if (nodeType === 'tree')` buried in the
 * gather route. Adding a second finite node type later is a data change here,
 * not a code change down there.
 *
 *   finite     — destroyed permanently; leaves a stump, never a respawn timer
 *   dropTable  — a weighted mix instead of one material
 *   plantable  — a stump of this type can be replanted
 */
const NODE_RULES = Object.freeze(
  Object.fromEntries(
    Object.entries(GATHER_NODES).map(([id, node]) => {
      const isTree = TIMBER_TILES.indexOf(node.tile) !== -1;
      // An explicit `finite` on the node wins. The rule used to be "a finite
      // node is a tree", which is no longer true: the Blue Bloom is finite and
      // is not a tree, and it must never be plantable — a stump you can replant
      // would be a second Blue Key.
      const finite = node.finite === true ? true : (isTree ? !TREES_REGROW : false);
      return [
        id,
        Object.freeze({
          ...node,
          finite,
          respawnHours: finite ? null : node.respawnHours,
          dropTable: isTree ? TREE_DROP_TABLE : null,
          plantable: node.plantable === false ? false : isTree,
        }),
      ];
    })
  )
);

// ---------------------------------------------------------------- state slots

/**
 * The three v5 progress slots. Each is lazily created, because an old save
 * predates all of them and the backfill must not be the only thing standing
 * between a returning player and a crash.
 */
function questItemsOf(state) {
  if (!isObj(state.questItems)) state.questItems = {};
  return state.questItems;
}
function unlockedOf(state) {
  if (!Array.isArray(state.vendorsUnlocked)) state.vendorsUnlocked = [];
  return state.vendorsUnlocked;
}
function questsDoneOf(state) {
  if (!Array.isArray(state.questsDone)) state.questsDone = [];
  return state.questsDone;
}

/**
 * Award XP and settle any levels it earns.
 *
 * Every XP source in the game goes through here so that levelling can never be
 * forgotten at one call site — which matters more than usual now, because
 * `player.level` is what the Stonemason's door is locked to.
 */
function grantXp(state, amount, reason) {
  const n = Math.max(0, Math.round(num(amount) ?? 0));
  if (n <= 0) return { xp: 0, levelsGained: 0, level: num(state.player.level) ?? 1 };
  state.player.xp = Math.max(0, Math.round(num(state.player.xp) ?? 0)) + n;
  const before = Math.max(1, Math.floor(num(state.player.level) ?? 1));
  const res = applyLevelUps(state.player) || { levelsGained: 0 };
  if (res.levelsGained > 0) {
    // A level buys stamina, so the ceiling has to move with it — and the new
    // headroom is granted rather than merely allowed, or the reward is invisible
    // until the next night's rest.
    const gained = STAMINA_PER_LEVEL * (state.player.level - before);
    refreshMaxEnergy(state);
    state.player.energy = clamp(
      (num(state.player.energy) ?? 0) + gained, 0, num(state.player.maxEnergy) ?? BASE_MAX_ENERGY
    );
    pushLog(
      state,
      `LEVEL ${state.player.level} — ${reason || 'experience earned'}. `
      + `+${gained} max stamina.`,
      'level'
    );
  }
  return { xp: n, levelsGained: res.levelsGained, level: state.player.level };
}

/**
 * Pay a one-off quest award, once. Returns the XP actually granted, which is 0
 * the second time — the guard is the point, since talking to an NPC twice is
 * the most ordinary thing a player does.
 */
function completeQuest(state, questId, reason) {
  const done = questsDoneOf(state);
  if (done.includes(questId)) return 0;
  done.push(questId);
  const xp = Math.max(0, Math.round(num(QUEST_XP[questId]) ?? 0));
  if (xp > 0) grantXp(state, xp, reason || 'a quest completed');
  return xp;
}

function lifetime(state) {
  if (!isObj(state.lifetime)) state.lifetime = {};
  const l = state.lifetime;
  for (const k of ['tasksCompleted', 'studyMinutes', 'sessions', 'treesFelled', 'saplingsPlanted', 'blocksPlaced']) {
    if (!Number.isFinite(Number(l[k]))) l[k] = 0;
  }
  return l;
}

function bumpLifetime(state, key, by = 1) {
  const l = lifetime(state);
  l[key] = (num(l[key]) ?? 0) + by;
  return l[key];
}

function effects(state) {
  if (!isObj(state.effects)) state.effects = {};
  const e = state.effects;
  if (!Number.isFinite(Number(e.studyMult)) || Number(e.studyMult) < 1) e.studyMult = 1;
  if (!Number.isFinite(Number(e.studyMultUses))) e.studyMultUses = 0;
  if (!Number.isFinite(Number(e.craftPermits))) e.craftPermits = 0;
  if (typeof e.craftPermitDay !== 'string') e.craftPermitDay = null;
  if (!Number.isFinite(Number(e.revealUntil))) e.revealUntil = 0;
  if (!Number.isFinite(Number(e.markUntil))) e.markUntil = 0;
  return e;
}

function plantings(state) {
  if (!isObj(state.plantings)) state.plantings = {};
  return state.plantings;
}

function placedBlocks(state) {
  if (!isObj(state.placedBlocks)) state.placedBlocks = {};
  return state.placedBlocks;
}

function gadgetBag(state) {
  if (!isObj(state.gadgets)) state.gadgets = {};
  for (const id of GADGET_IDS) {
    if (!Number.isFinite(Number(state.gadgets[id]))) state.gadgets[id] = 0;
  }
  return state.gadgets;
}

function blockBag(state) {
  if (!isObj(state.blocks)) state.blocks = {};
  for (const id of BLOCK_IDS) {
    if (!Number.isFinite(Number(state.blocks[id]))) state.blocks[id] = 0;
  }
  return state.blocks;
}

function cooldowns(state) {
  if (!isObj(state.cooldowns)) state.cooldowns = {};
  return state.cooldowns;
}

function materialsOf(state) {
  if (!isObj(state.materials)) state.materials = {};
  return state.materials;
}

/** "2h 5m", "45m", "20s" — for cooldowns and growth timers. */
function humanDuration(ms) {
  const s = Math.max(0, Math.ceil(num(ms) ?? 0) / 1000);
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// The Focus Bell is the only thing that can lift a study payout. It is spent
// by the very next payout, task or session, and it is applied BEFORE the daily
// session cap so it can never be used to reach past the cap.
function consumeStudyBuff(state, payout) {
  const eff = effects(state);
  const uses = num(eff.studyMultUses) ?? 0;
  const mult = num(eff.studyMult) ?? 1;
  if (uses <= 0 || mult <= 1) return null;
  for (const c of CURRENCY_IDS) payout.coins[c] = Math.round(payout.coins[c] * mult);
  payout.xp = Math.round(payout.xp * mult);
  eff.studyMultUses = uses - 1;
  if (eff.studyMultUses <= 0) {
    eff.studyMultUses = 0;
    eff.studyMult = 1;
  }
  payout.breakdown.push(`Focus Bell ×${mult.toFixed(2)}`);
  return mult;
}

// ---------------------------------------------------------------- fractional refunds
/**
 * Blocks cost a fraction of a material each (a path stone is a quarter of a
 * chalkstone), so half of that rounds to nothing. Instead of silently eating
 * the refund we bank the fraction and pay it the moment it crosses a whole
 * unit. Over a row of fences the player gets back exactly half, to the unit.
 */
function refundBank(state) {
  if (!isObj(state.refundBank)) state.refundBank = { materials: {}, coins: {} };
  if (!isObj(state.refundBank.materials)) state.refundBank.materials = {};
  if (!isObj(state.refundBank.coins)) state.refundBank.coins = {};
  return state.refundBank;
}

function creditFractional(state, matFrac, coinFrac) {
  const bank = refundBank(state);
  const mats = materialsOf(state);
  const paidMaterials = {};
  const paidCoins = {};

  for (const [id, amtRaw] of Object.entries(matFrac || {})) {
    const amt = num(amtRaw) ?? 0;
    if (amt <= 0) continue;
    const total = (num(bank.materials[id]) ?? 0) + amt;
    const whole = Math.floor(total + 1e-9);
    bank.materials[id] = Math.max(0, total - whole);
    if (whole > 0) {
      mats[id] = (num(mats[id]) ?? 0) + whole;
      paidMaterials[id] = whole;
    }
  }
  for (const [id, amtRaw] of Object.entries(coinFrac || {})) {
    if (!CURRENCY_IDS.includes(id)) continue;
    const amt = num(amtRaw) ?? 0;
    if (amt <= 0) continue;
    const total = (num(bank.coins[id]) ?? 0) + amt;
    const whole = Math.floor(total + 1e-9);
    bank.coins[id] = Math.max(0, total - whole);
    if (whole > 0) {
      state.player.coins[id] = (num(state.player.coins[id]) ?? 0) + whole;
      paidCoins[id] = whole;
    }
  }
  return { materials: paidMaterials, coins: paidCoins };
}

// =========================================================================
// v3: PLACES, NOT BUTTONS — building-role adjacency
// =========================================================================

/** What each role reads like when you are standing in the wrong place. */
const ROLE_PHRASE = Object.freeze({
  craft: 'you need to be at a house to craft',
  shop: 'you need to be at the Shop to trade',
  blueprints: 'you need to be at the Archive to deal in blueprints',
  repair: 'you need to be at a Forge to repair a tool',
  boxes: 'you need to be at the Observatory or a Shrine to open a Dark Box there',
  blocks: 'you need to be at a Workshop for that',
  study: 'you need to be at the Library for that',
  exchange: 'you need to be at the Exchange to trade shards for florins',
  woodsman: 'the Woodsman buys timber, and he is not here — try the woods in the south-west',
  stonemason: 'the Stonemason buys stone, and he is not here — try the mountain in the south-east',
});

const ROLE_VERB = Object.freeze({
  craft: 'craft', shop: 'trade', blueprints: 'buy blueprints',
  repair: 'repair tools', boxes: 'open Dark Boxes', blocks: 'manage blocks',
  exchange: 'trade shards', woodsman: 'sell timber', stonemason: 'sell stone',
  study: 'study',
});

/** Every building id that carries a role, derived from BUILDING_ROLES. */
function buildingIdsWithRole(role) {
  return Object.keys(BUILDING_ROLES).filter((id) => (BUILDING_ROLES[id] || []).includes(role));
}

function buildingName(id) {
  return (BUILDINGS && BUILDINGS[id] && BUILDINGS[id].name) || String(id);
}

function rolesOfBuilding(id) {
  const r = BUILDING_ROLES[id];
  return Array.isArray(r) ? r.slice() : [];
}

/** Chebyshev distance from a tile to a rectangle (0 = inside it). */
function rectDistance(px, py, r) {
  const dx = px < r.x ? r.x - px : (px > r.x + r.w - 1 ? px - (r.x + r.w - 1) : 0);
  const dy = py < r.y ? r.y - py : (py > r.y + r.h - 1 ? py - (r.y + r.h - 1) : 0);
  return Math.max(dx, dy);
}

/**
 * Where the player is, for the purpose of a role check. The client sends its
 * position because the client owns movement; we clamp it to the world and fall
 * back to the last position the server persisted. Terrain is trusted, position
 * is clamped — the same trust boundary the gather route already draws.
 */
function playerPosition(b, state) {
  const bx = num(b && (b.px !== undefined ? b.px : b.playerX));
  const by = num(b && (b.py !== undefined ? b.py : b.playerY));
  const x = bx === null ? num(state.player && state.player.x) : bx;
  const y = by === null ? num(state.player && state.player.y) : by;
  return {
    x: clamp(Math.round(x === null ? 0 : x), 0, WORLD_W - 1),
    y: clamp(Math.round(y === null ? 0 : y), 0, WORLD_H - 1),
    fromClient: bx !== null && by !== null,
  };
}

/** Every standing building, with its footprint, roles and distance from px,py. */
function buildingsNear(state, px, py) {
  const built = Array.isArray(state.buildings) ? state.buildings : [];
  return built.filter(isObj).map((b) => {
    const fp = footprintOf(b.buildingId);
    const bx = num(b.x) ?? 0;
    const by = num(b.y) ?? 0;
    // The COUNTER, not the footprint. For the Stonemason those differ: his
    // building is the mountain and his counter is inside the cave.
    const rect = counterRect(b.buildingId, bx, by, fp);
    const distance = rectDistance(px, py, rect);
    return {
      uid: b.uid,
      buildingId: b.buildingId,
      name: buildingName(b.buildingId),
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      roles: rolesOfBuilding(b.buildingId),
      distance,
      adjacent: distance <= 1,
    };
  });
}

/** The full "what can I do standing here" report. Used by /api/interact. */
function placeReport(state, px, py) {
  const all = buildingsNear(state, px, py).sort((a, b) => a.distance - b.distance);
  const adjacent = all.filter((b) => b.adjacent);
  const roles = [];
  for (const b of adjacent) for (const r of b.roles) if (!roles.includes(r)) roles.push(r);

  const eff = effects(state);
  const now = Date.now();
  const bench = (num(eff.craftPermits) ?? 0) > 0;
  if (bench && !roles.includes('craft')) roles.push('craft');

  const key = tileKey(areaOf(state), px, py);
  const planted = plantings(state)[key];
  const harvested = isObj(state.harvested) ? state.harvested[key] : null;

  return {
    area: AREA_HOME,
    x: px, y: py,
    roles,
    // one prompt line per adjacent building, ready to render
    prompts: adjacent
      .filter((b) => b.roles.length)
      .map((b) => ({
        uid: b.uid,
        buildingId: b.buildingId,
        name: b.name,
        roles: b.roles,
        text: `${b.name} — press E to ${b.roles.map((r) => ROLE_VERB[r] || r).join(' / ')}`,
      })),
    buildings: adjacent,
    nearest: all.slice(0, 4),
    benchPermit: bench ? num(eff.craftPermits) ?? 0 : 0,
    reveal: (num(eff.revealUntil) ?? 0) > now ? { until: eff.revealUntil, msLeft: eff.revealUntil - now } : null,
    planting: planted ? plantingView(key, planted, now, areaOf(state)) : null,
    stump: isObj(harvested) && harvested.felled ? { x: px, y: py, felledAt: harvested.felledAt || null, plantable: true } : null,
  };
}

/**
 * Refuse specifically, or return null to allow. The refusal always names a real
 * place the player can walk to — a building they own if they own one, and the
 * list of buildings that would carry the role if they do not.
 */
/** "Forge" -> "the Forge", but "The Stonemason's Cave" is left as it is. */
function withThe(name) {
  const n = String(name || '');
  return /^the\s/i.test(n) ? n : `the ${n}`;
}

function requireRole(state, b, role) {
  const pos = playerPosition(b, state);
  const near = buildingsNear(state, pos.x, pos.y);
  if (near.some((x) => x.adjacent && x.roles.includes(role))) return null;

  const phrase = ROLE_PHRASE[role] || `you need to be somewhere that offers "${role}"`;
  const owned = near.filter((x) => x.roles.includes(role)).sort((a, c) => a.distance - c.distance);

  if (owned.length) {
    const t = owned[0];
    return fail(
      // Building names are not uniform: most are bare nouns ("Forge"), but a
      // couple already carry their own article ("The Stonemason's Cave"), and
      // prefixing those gave "the The Stonemason's Cave".
      `${phrase} — ${withThe(t.name)} at ${t.x},${t.y} will do. ` +
      `You are at ${pos.x},${pos.y}, ${t.distance} tile${t.distance === 1 ? '' : 's'} away.`
    );
  }

  const candidates = buildingIdsWithRole(role).map(buildingName);
  const list = candidates.length > 1
    ? `${candidates.slice(0, -1).join(', ')} or ${candidates[candidates.length - 1]}`
    : (candidates[0] || 'a suitable building');
  return fail(
    `${phrase}, and there is nothing like that on your land yet. ` +
    `The ${list} would all serve — craft one and place it near your hut.`
  );
}

// =========================================================================
// v3: GATES — honest progress toward the four seams
// =========================================================================

/**
 * Gate requirements are checked against LIFETIME STUDY TOTALS and level only.
 * Coins are deliberately absent: you cannot buy your way through a gate, and
 * nothing here may ever read state.player.coins.
 */
const GATE_METRICS = Object.freeze({
  tasksCompleted: {
    label: 'tasks completed',
    unit: 'tasks',
    get: (s) => Math.floor(num(lifetime(s).tasksCompleted) ?? 0),
  },
  studyMinutes: {
    label: 'minutes of tracked study',
    unit: 'minutes',
    get: (s) => Math.floor(num(lifetime(s).studyMinutes) ?? 0),
  },
  level: {
    label: 'scholar level',
    unit: 'levels',
    get: (s) => Math.max(1, Math.floor(num(s.player && s.player.level) ?? 1)),
  },
});

function gateStatus(state) {
  return GATES.map((gate) => {
    const reqs = isObj(gate.requires) ? gate.requires : {};
    const progress = Object.entries(reqs).map(([key, needRaw]) => {
      const metric = GATE_METRICS[key] || null;
      const need = Math.max(0, Math.round(num(needRaw) ?? 0));
      const have = metric ? metric.get(state) : 0;
      return {
        key,
        label: metric ? metric.label : key,
        have,
        need,
        remaining: Math.max(0, need - have),
        done: have >= need,
        text: `${key} ${Math.min(have, need)}/${need}`,
      };
    });

    const unlocked = progress.length > 0 && progress.every((p) => p.done);
    const outstanding = progress.filter((p) => !p.done);
    return {
      id: gate.id,
      side: gate.side,
      area: gate.area,
      name: gate.name,
      structure: gate.structure,
      requires: reqs,
      unlocked,
      progress,
      // "tasksCompleted 3/5" — exactly the string the contract asks for
      summary: progress.map((p) => p.text).join(', '),
      // what the world should say when you walk into it
      refusal: unlocked
        ? `${gate.name} stands open, but nothing has been built beyond it yet.`
        : `${gate.name} is barred. ` +
          outstanding
            .map((p) => `${p.remaining} more ${p.label} (${p.have}/${p.need})`)
            .join(' and ') +
          '. Only real study moves this.',
    };
  });
}

// =========================================================================
// v3: PLANTINGS
// =========================================================================

function plantingView(key, planting, now = Date.now(), area = AREAS.home) {
  // parseTileKey returns null for another map's key; callers filter on that, so
  // 0,0 is only ever reached by a genuinely malformed key.
  const at = parseTileKey(key, area) || { x: 0, y: 0 };
  const x = at.x;
  const y = at.y;
  const growth = growthOf(planting, now);
  return {
    key,
    x,
    y,
    plantedAt: num(planting.plantedAt) ?? now,
    source: planting.source || 'sapling',
    boostMinutes: Math.max(0, num(planting.boostMinutes) ?? 0),
    ...growth,
  };
}

/**
 * The plantings ON THE MAP THE SCHOLAR IS STANDING ON. The Quests panel lists
 * these by coordinate, and coordinates from another map are worse than useless:
 * they send you to a tile that has nothing on it.
 */
function plantingList(state, now = Date.now()) {
  const area = areaOf(state);
  return Object.entries(plantings(state))
    .filter(([k, p]) => isObj(p) && parseTileKey(k, area))
    .map(([k, p]) => plantingView(k, p, now, area))
    .sort((a, c) => a.msRemaining - c.msRemaining);
}

/** What (if anything) already sits on a tile. Terrain is the client's business. */
function tileOccupant(state, x, y) {
  const key = tileKey(areaOf(state), x, y);
  for (const b of buildingsNear(state, x, y)) {
    if (b.distance === 0) return { kind: 'building', name: b.name, x: b.x, y: b.y };
  }
  const block = placedBlocks(state)[key];
  if (isObj(block)) {
    return { kind: 'block', name: (BLOCKS[block.blockId] && BLOCKS[block.blockId].name) || block.blockId };
  }
  const plant = plantings(state)[key];
  if (isObj(plant)) return { kind: 'planting', name: growthOf(plant).stageLabel };
  return null;
}

/** Tile names the client may send. Anything else is treated as "not grass". */
// Snow takes a sapling as readily as grass — the Reaches' pines are felled with
// the same axe and have to be replantable for the same reason Home's trees do:
// a finite tree with no way back strips the map for good.
const PLANTABLE_TILES = Object.freeze([
  'grass', String(TILE_TYPES.grass),
  'snow', String(TILE_TYPES.snow),
]);

// =========================================================================
// v4 — SUBMITTED WORK, GRADED
// =========================================================================

/**
 * The v4 migration, and it runs on EVERY request rather than once at load.
 *
 * The two new keys (`task.submission`, `task.grading`) live on task objects,
 * which are created by three different paths — the seed state, /api/task/create
 * and the syllabus importer — so a one-shot migration would have to be repeated
 * in all three. Normalising here instead means a task can never reach a route
 * without the keys, whatever produced it and however old the save is. It is
 * idempotent and costs one pass over a list that is tens of items long.
 *
 * It only ever ADDS. A task that already carries a submission or a grading is
 * left exactly as it is — losing a player's real progress is the one failure
 * with no recovery.
 */
function migrateQuestFields(state) {
  if (!Array.isArray(state.tasks)) return;
  for (const t of state.tasks) {
    if (!isObj(t)) continue;
    if (t.submission === undefined) t.submission = null;
    if (t.grading === undefined) t.grading = null;
  }
}

/** The empty shape a brand-new task carries, so the two are never out of step. */
function questDefaults() {
  return { submission: null, grading: null };
}

const SUBMISSION_KINDS = Object.freeze(['text', 'file']);

/**
 * Normalise and CAP an incoming submission. Real work can be long; a save file
 * that has swallowed a 4MB paste is a broken save. Truncation is never silent —
 * the stored record carries `truncated` and `originalChars`, and the route says
 * so in its response and in the event log.
 */
function normalizeSubmission(raw) {
  if (!isObj(raw)) return { error: 'submission must be an object' };
  const kind = SUBMISSION_KINDS.includes(raw.kind) ? raw.kind : 'text';
  const text = typeof raw.text === 'string' ? raw.text : '';
  if (!text.trim()) return { error: 'there is nothing to submit — write something first' };

  const originalChars = text.length;
  const truncated = originalChars > MAX_SUBMISSION_CHARS;
  const kept = truncated ? text.slice(0, MAX_SUBMISSION_CHARS) : text;

  const filename = typeof raw.filename === 'string' && raw.filename.trim()
    ? raw.filename.trim().slice(0, 160)
    : null;

  return {
    submission: {
      kind,
      text: kept,
      filename,
      chars: kept.length,
      words: kept.trim() ? kept.trim().split(/\s+/).length : 0,
      originalChars,
      truncated,
      submittedAt: Date.now(),
    },
  };
}

// --- rewards -------------------------------------------------------------

/**
 * Grading drops materials at rank A and above — the user's ask, and the one
 * place a grade pays in something other than coins.
 *
 * Deliberately small and deliberately NOT random: the reward moment should be
 * legible, and studying has to stay the best route to reach without becoming a
 * materials firehose.
 *
 *   rank A  →  1 material  ×1   from commons and uncommons
 *   rank S  →  2 materials ×2 and ×1, and rares join the pool
 *
 * Weighting is the same idea as rollStudyDrop: bias hard toward whatever the
 * player holds least of, so a drop unblocks rather than piles up. Tree drops
 * are never in the pool — those come out of a tree you felled and replanted.
 */
const GRADE_DROP_TIERS = Object.freeze({
  A: { picks: 1, qty: [1], rarities: ['common', 'uncommon'] },
  S: { picks: 2, qty: [2, 1], rarities: ['common', 'uncommon', 'rare'] },
});

function rollGradeDrops(state, rank) {
  const tier = GRADE_DROP_TIERS[String(rank)];
  if (!tier) return [];

  const pool = Object.keys(MATERIALS).filter(
    (id) => !isTreeDrop(id) && tier.rarities.includes(MATERIALS[id] && MATERIALS[id].rarity)
  );
  if (!pool.length) return [];

  if (!isObj(state.materials)) state.materials = {};
  // Scarcest first. Ties break on id so the order is stable across requests.
  pool.sort((a, b) => {
    const d = (num(state.materials[a]) ?? 0) - (num(state.materials[b]) ?? 0);
    return d !== 0 ? d : a.localeCompare(b);
  });

  const out = [];
  for (let i = 0; i < tier.picks && i < pool.length; i++) {
    const id = pool[i];
    const qty = tier.qty[i] || 1;
    state.materials[id] = (num(state.materials[id]) ?? 0) + qty;
    out.push({ materialId: id, name: (MATERIALS[id] && MATERIALS[id].name) || id, qty });
  }
  return out;
}

/**
 * A grade replaces the self-graded quality star rating. computeTaskPayout still
 * owns coins / xp / dark boxes / stamina — it is handed a quality derived from
 * the score, so nothing downstream of it changed in v4.
 *
 * The mapping is linear across the whole 0-100 range: 0 → 1 star, 100 → 5.
 * It is NOT rounded to a whole star, because computeTaskPayout does not need it
 * to be and rounding would throw away a rank's worth of resolution.
 */
function qualityFromScore(score) {
  return clamp(1 + (clamp(num(score) ?? 0, 0, 100) / 100) * 4, 1, 5);
}

/**
 * The shared completion path. Called by BOTH the graded route and the old
 * self-grade route, so there is exactly one place that pays a task out.
 */
function payOutTask(state, task, { quality, onTime, gradeRank }) {
  const payout = normalizePayout(
    computeTaskPayout(state, {
      subject: task.subject,
      workType: task.workType,
      difficulty: task.difficulty,
      estMinutes: task.estMinutes,
      minutesLogged: num(task.minutesLogged) ?? 0,
      quality,
      onTime,
      // A graded submission was judged on its content; do not also score it on
      // whether a timer happened to be running.
      assessed: Boolean(gradeRank),
    })
  );
  consumeStudyBuff(state, payout);
  creditPayout(state, payout);
  bumpLifetime(state, 'tasksCompleted', 1);
  const levels = applyLevelUps(state.player) || { levelsGained: 0 };
  touchStreak(state);

  task.status = 'done';
  task.rank = payout.rank;
  task.completedAt = Date.now();

  const studyDrop = rollStudyDrop(state, payout.rank, task.difficulty);
  // v4: grading pays materials of its own, on the GRADER's rank rather than the
  // payout rank, because that is the rank the player was just shown.
  const gradeDrops = gradeRank ? rollGradeDrops(state, gradeRank) : [];

  const energy = grantEnergy(state, ENERGY_PER_TASK_DIFFICULTY * task.difficulty);
  payout.energy = energy.gained;
  payout.breakdown.push(`+${energy.gained} energy (${ENERGY_PER_TASK_DIFFICULTY} x difficulty ${task.difficulty})`);

  return { payout, studyDrop, gradeDrops, levels, energy };
}

function questView(task) {
  return {
    taskId: task.id,
    title: task.title,
    submission: isObj(task.submission) ? task.submission : null,
    grading: isObj(task.grading) ? task.grading : null,
  };
}

function findTask(state, taskId) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  return tasks.find((t) => isObj(t) && t.id === taskId) || null;
}

/** POST /api/quest/submit — the v4 main event. */
async function routeQuestSubmit(b, state, save) {
  const taskId = typeof b.taskId === 'string' ? b.taskId : null;
  if (!taskId) return fail('taskId is required');
  const task = findTask(state, taskId);
  if (!task) return fail('that quest does not exist');

  const norm = normalizeSubmission(b.submission);
  if (norm.error) return fail(norm.error);
  const submission = norm.submission;

  let grading;
  try {
    grading = await gradeSubmission({ task, submission, state });
  } catch (err) {
    // The grader failing must not eat the work. Nothing is stored, nothing is
    // paid, and the player is told exactly what is wrong.
    return fail(`grading failed: ${(err && err.message) || String(err)}`);
  }

  const resubmission = task.status === 'done';
  task.submission = submission;
  task.grading = grading;

  const truncNote = submission.truncated
    ? ` Your submission was ${submission.originalChars} characters; only the first ${MAX_SUBMISSION_CHARS} were kept and graded.`
    : '';

  if (resubmission) {
    // A resubmission regrades and updates the record, but pays nothing: this
    // quest has already been paid out once, and re-rolling a graded reward
    // until it comes up S would beat actually doing the work.
    task.rank = grading.rank;
    pushLog(
      state,
      `Resubmitted "${task.title}" — regraded ${grading.rank} (${grading.score}/100). Already paid; no further reward.${truncNote}`,
      'task'
    );
    save(state);
    return ok({
      state, grading, reward: null, regraded: true,
      truncated: submission.truncated, storedChars: submission.chars,
      graderNote: GRADER_LABELS[grading.grader] || grading.grader,
    });
  }

  const res = payOutTask(state, task, {
    quality: qualityFromScore(grading.score),
    onTime: !(Number.isFinite(Number(task.dueInDays)) && Number(task.dueInDays) < 0),
    gradeRank: grading.rank,
  });
  const { payout, studyDrop, gradeDrops, levels, energy } = res;
  payout.grading = grading;
  payout.gradeDrops = gradeDrops;

  const dropNote = gradeDrops.length
    ? ` Rank ${grading.rank} yielded ${gradeDrops.map((d) => `${d.name} x${d.qty}`).join(', ')}.`
    : '';

  pushLog(
    state,
    (studyDrop ? `Insight rewarded: ${studyDrop.name} x${studyDrop.qty}. ` : '') +
    `Submitted "${task.title}" — graded ${grading.rank} (${grading.score}/100), ` +
    `+${payout.xp} xp, ${coinSummary(payout.coins)}` +
      (payout.darkBoxes > 0 ? `, +${payout.darkBoxes} dark box${payout.darkBoxes > 1 ? 'es' : ''}` : '') +
      energyNote(energy) + '.' + dropNote + truncNote,
    'task'
  );
  if (levels.levelsGained > 0) {
    pushLog(state, `Level up! You are now level ${state.player.level}.`, 'level');
  }

  save(state);
  return ok({
    state, grading, reward: payout, gradeDrops,
    truncated: submission.truncated, storedChars: submission.chars,
    graderNote: GRADER_LABELS[grading.grader] || grading.grader,
  });
}

/** POST /api/quest/regrade — re-run the grader over the stored submission. */
async function routeQuestRegrade(b, state, save) {
  const taskId = typeof b.taskId === 'string' ? b.taskId : null;
  if (!taskId) return fail('taskId is required');
  const task = findTask(state, taskId);
  if (!task) return fail('that quest does not exist');
  if (!isObj(task.submission)) {
    return fail('there is nothing to regrade — this quest has no submission yet');
  }

  let grading;
  try {
    grading = await gradeSubmission({ task, submission: task.submission, state });
  } catch (err) {
    return fail(`grading failed: ${(err && err.message) || String(err)}`);
  }

  task.grading = grading;
  if (task.status === 'done') task.rank = grading.rank;
  pushLog(state, `Regraded "${task.title}" — ${grading.rank} (${grading.score}/100). No further reward.`, 'task');
  save(state);
  return ok({
    state, grading, reward: null, regraded: true,
    graderNote: GRADER_LABELS[grading.grader] || grading.grader,
  });
}

/** GET /api/quest/:id/grading */
function routeQuestGrading(taskId, state) {
  const task = findTask(state, taskId);
  if (!task) return fail('that quest does not exist');
  return ok({
    grading: isObj(task.grading) ? task.grading : null,
    quest: questView(task),
    grader: graderId(),
    graderNote: GRADER_LABELS[graderId()] || graderId(),
    maxSubmissionChars: MAX_SUBMISSION_CHARS,
  });
}

// =========================================================================

export async function handleApi(pathname, body, state, save) {
  try {
    const route = String(pathname || '').replace(/\/+$/, '') || '/';
    const b = isObj(body) ? body : {};
    // EVERY PERSIST SWEEPS THE CODEX. One wrapper, rather than a `record(...)`
    // at each of the ~40 places something discoverable happens — the Codex has
    // no call sites to forget, so a route added next year is covered by having
    // been written at all. See shared/codex.js.
    const write = typeof save === 'function' ? save : () => {};
    const persist = (s) => { sweepCodex(s); return write(s); };

    if (!isObj(state)) return fail('server state is not initialised', 500);

    // Settle stamina before anything reads or spends it.
    refreshMaxEnergy(state);
    regenStamina(state);
    // v4: every task carries submission/grading keys before any route sees it.
    migrateQuestFields(state);

    // The only route with a variable in its path. Matched before the switch so
    // the switch stays a flat table of literals.
    const gradingPath = /^\/api\/quest\/([^/]+)\/grading$/.exec(route);
    if (gradingPath) {
      let id = gradingPath[1];
      try { id = decodeURIComponent(id); } catch { /* leave it as sent */ }
      return routeQuestGrading(id, state);
    }

    switch (route) {
      case '/api/state':
        // cheap place to keep the energy ceiling in step with what is built,
        // including for a v1 save that has just been migrated
        refreshMaxEnergy(state);
        // The Herald is summoned lazily, here, for the same reason the energy
        // ceiling is refreshed here: a save that was ALREADY past level 20
        // before he existed must summon him too, and a levelling path that
        // forgot to call it would strand him forever. Persisted when it fires,
        // or the ride restarts on every read.
        if (tickHerald(state)) persist(state);
        // v3 rides along on every state read so the UI and the world never have
        // to poll a second endpoint to draw honest gates or growing saplings.
        return ok({
          state,
          gates: gateStatus(state),
          plantings: plantingList(state),
          here: placeReport(state, num(state.player.x) ?? 0, num(state.player.y) ?? 0),
        });

      case '/api/task/create':
        return routeTaskCreate(b, state, persist);

      case '/api/task/complete':
        return routeTaskComplete(b, state, persist);

      case '/api/session/log':
        return routeSessionLog(b, state, persist);

      case '/api/player/move':
        return routePlayerMove(b, state, persist);

      case '/api/box/open':
        return routeBoxOpen(b, state, persist);

      case '/api/charm':
        return routeCharm(b, state, persist);

      case '/api/boat/board':
        return routeBoatBoard(b, state, persist);

      case '/api/travel':
        return routeTravel(b, state, persist);

      case '/api/hut/open':
        return routeHutOpen(b, state, persist);

      case '/api/fish':
        return routeFish(b, state, persist);

      case '/api/npc/talk':
        return routeNpcTalk(b, state, persist);

      case '/api/craft':
        return routeCraft(b, state, persist);

      case '/api/build':
        return routeBuild(b, state, persist);

      case '/api/tool/equip':
        return routeToolEquip(b, state, persist);

      case '/api/dev/reset':
        return routeReset(state, persist);

      case '/api/dev/grant':
        return routeDevGrant(b, state, persist);

      // Skip the Herald's 16 seconds of riding. A test seam, next to the other
      // dev route: it winds `summonedAt` into the past, which is the SAME state
      // the player reaches by waiting rather than a second code path. It cannot
      // summon him — only level 20 does that — so it is not a way to reach the
      // quest early.
      case '/api/dev/herald-arrive': {
        const h = heraldOf(state);
        if (!h.summonedAt) return fail('he has not been sent yet');
        h.summonedAt = Date.now() - HERALD.rideMs - 1000;
        persist(state);
        return ok({ state, herald: { ...h } });
      }

      // A SAVE the player asks for by name. Progress already persists on every
      // action, but "it saves automatically" is a claim the player has to take
      // on faith — this gives them a button that provably wrote, and a
      // timestamp the pause menu can show back to them.
      case '/api/save':
        return routeSave(state, persist);

      // ------------------------------------------------------------- v2
      case '/api/gather':
        return routeGather(b, state, persist);

      case '/api/tool/repair':
        return routeToolRepair(b, state, persist);

      case '/api/tool/equipGather':
        return routeEquipGather(b, state, persist);

      // ------------------------------------------------- equipment (2 slots)
      case '/api/equip/slot':
        return routeEquipSlot(b, state, persist);

      case '/api/equip/active':
        return routeEquipActive(b, state, persist);

      case '/api/shops':
        return routeShops(b, state, persist);

      case '/api/shop/buy':
        return routeShopBuy(b, state, persist);

      case '/api/shop/sell':
        return routeShopSell(b, state, persist);

      case '/api/exchange':
        return routeExchange(b, state, persist);

      case '/api/tasks/import':
        return routeTasksImport(b, state, persist);

      // APP SETTINGS. Not save data — they belong to the installation, not to
      // a slot, and they are read and written through the server because the
      // page's localStorage is keyed by an origin whose PORT changes on every
      // launch. See SETTINGS_PATH in slots.js.
      case '/api/tower/climb':
        return routeTowerClimb(b, state, persist);

      case '/api/quest/take':
        return routeQuestTake(b, state, persist);

      case '/api/reaches/gear':
        return routeReachesGear(b, state, persist);

      case '/api/reaches/push':
        return routeReachesPush(b, state, persist);

      case '/api/switch/throw':
        return routeSwitchThrow(b, state, persist);
      case '/api/door/open':
        return routeDoorOpen(b, state, persist);
      case '/api/reaches/reset':
        return routeReachesReset(b, state, persist);

      case '/api/reaches/warden':
        return routeReachesWarden(b, state, persist);

      case '/api/settings':
        return routeSettings(b, persist);

      case '/api/slots':
        return routeSlotsList(state, persist);

      case '/api/slots/switch':
        return routeSlotsSwitch(b, state, persist);

      case '/api/slots/create':
        return routeSlotsCreate(b, state, persist);

      case '/api/slots/delete':
        return routeSlotsDelete(b, state, persist);

      case '/api/slots/rename':
        return routeSlotsRename(b, state, persist);

      // ------------------------------------------------------------- v3
      case '/api/interact':
        return routeInteract(b, state, persist);

      case '/api/gates':
        return ok({ gates: gateStatus(state), lifetime: lifetime(state) });

      case '/api/plant':
        return routePlant(b, state, persist);

      case '/api/plantings':
        return ok({
          plantings: plantingList(state),
          stages: SAPLING_STAGES,
          totalMinutes: SAPLING_TOTAL_MINUTES,
          saplings: Math.max(0, num(state.player.saplings) ?? 0),
          seedpods: Math.max(0, num(materialsOf(state).seedpod) ?? 0),
        });

      case '/api/gadget/use':
        return routeGadgetUse(b, state, persist);

      case '/api/gadgets':
        return ok({ gadgets: gadgetView(state) });

      case '/api/block/place':
        return routeBlockPlace(b, state, persist);

      case '/api/block/remove':
        return routeBlockRemove(b, state, persist);

      // ------------------------------------------------------------- v4
      case '/api/quest/submit':
        return await routeQuestSubmit(b, state, persist);

      case '/api/quest/regrade':
        return await routeQuestRegrade(b, state, persist);

      case '/api/quest/config':
        return ok({
          grader: graderId(),
          graderNote: GRADER_LABELS[graderId()] || graderId(),
          maxSubmissionChars: MAX_SUBMISSION_CHARS,
        });

      case '/api/blocks':
        return ok({
          blocks: blockView(state),
          placed: Object.entries(placedBlocks(state)).map(([k, v]) => ({ key: k, ...v })),
          refundRate: BLOCK_REFUND_RATE,
        });

      default:
        return fail('unknown route');
    }
  } catch (err) {
    return {
      status: 200,
      json: { ok: false, error: `internal error: ${(err && err.message) || String(err)}` },
    };
  }
}

// ---------------------------------------------------------------- routes

function routeTaskCreate(b, state, save) {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return fail('a task needs a title');
  if (title.length > 120) return fail('title is too long (max 120 characters)');

  const subject = SUBJECT_IDS.includes(b.subject) ? b.subject : null;
  if (!subject) return fail(`unknown subject "${b.subject}" — expected one of ${SUBJECT_IDS.join(', ')}`);

  const workType = WORK_TYPE_IDS.includes(b.workType) ? b.workType : null;
  if (!workType) return fail(`unknown work type "${b.workType}" — expected one of ${WORK_TYPE_IDS.join(', ')}`);

  const difficulty = num(b.difficulty);
  if (difficulty === null) return fail('difficulty must be a number from 1 to 5');
  const estMinutes = num(b.estMinutes);
  if (estMinutes === null) return fail('estMinutes must be a number');

  let dueInDays = null;
  if (b.dueInDays !== null && b.dueInDays !== undefined && b.dueInDays !== '') {
    const d = num(b.dueInDays);
    if (d === null) return fail('dueInDays must be a number or null');
    dueInDays = clamp(Math.round(d), 0, 365);
  }

  const task = {
    id: uid('task'),
    title,
    subject,
    workType,
    difficulty: clamp(Math.round(difficulty), 1, 5),
    estMinutes: clamp(Math.round(estMinutes), 5, 1440),
    status: 'todo',
    minutesLogged: 0,
    rank: null,
    dueInDays,
    completedAt: null,
    // v4: a new quest starts with the same empty submission/grading keys that
    // migrateQuestFields backfills onto every older save.
    ...questDefaults(),
  };

  if (!Array.isArray(state.tasks)) state.tasks = [];
  state.tasks.push(task);
  pushLog(state, `New quest accepted: ${task.title}`, 'task');
  save(state);
  return ok({ state, task });
}

function routeTaskComplete(b, state, save) {
  const taskId = typeof b.taskId === 'string' ? b.taskId : null;
  if (!taskId) return fail('taskId is required');

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const task = tasks.find((t) => t && t.id === taskId);
  if (!task) return fail('that task does not exist');
  if (task.status === 'done') return fail('that task is already complete');

  const qRaw = num(b.quality);
  if (qRaw === null) return fail('quality must be a number from 1 to 5');
  const quality = clamp(Math.round(qRaw), 1, 5);
  const onTime = b.onTime === undefined ? true : Boolean(b.onTime);

  // v4: this is the FALLBACK path, kept working on purpose for tasks with no
  // submission (imported checklists, tracked-time-only work, offline hand-ins).
  // It shares payOutTask with the graded route, so coins/xp/stamina/box logic
  // and the lifetime totals the gates read are identical either way. What it
  // does NOT get is the grade-driven material drop — that is grading's reward.
  const { payout, studyDrop, levels, energy } = payOutTask(state, task, {
    quality, onTime, gradeRank: null,
  });

  pushLog(
    state,
    (studyDrop ? `Insight rewarded: ${studyDrop.name} x${studyDrop.qty}. ` : '') +
    `Completed "${task.title}" — rank ${payout.rank}, +${payout.xp} xp, ${coinSummary(payout.coins)}` +
      (payout.darkBoxes > 0 ? `, +${payout.darkBoxes} dark box${payout.darkBoxes > 1 ? 'es' : ''}` : '') +
      energyNote(energy),
    'task'
  );
  if (levels.levelsGained > 0) {
    pushLog(state, `Level up! You are now level ${state.player.level}.`, 'level');
  }

  save(state);
  return ok({ state, reward: payout });
}

function routeSessionLog(b, state, save) {
  const minutesRaw = num(b.minutes);
  if (minutesRaw === null) return fail('minutes must be a number');
  const minutes = clamp(Math.round(minutesRaw), 1, 480);

  const taskId = typeof b.taskId === 'string' && b.taskId ? b.taskId : null;
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  let task = null;
  if (taskId) {
    task = tasks.find((t) => t && t.id === taskId) || null;
    if (!task) return fail('that task does not exist');
  }

  const subject = SUBJECT_IDS.includes(b.subject)
    ? b.subject
    : (task && SUBJECT_IDS.includes(task.subject) ? task.subject : null);
  if (!subject) return fail(`unknown subject "${b.subject}" — expected one of ${SUBJECT_IDS.join(', ')}`);

  const workType = WORK_TYPE_IDS.includes(b.workType)
    ? b.workType
    : (task && WORK_TYPE_IDS.includes(task.workType) ? task.workType : null);
  if (!workType) return fail(`unknown work type "${b.workType}" — expected one of ${WORK_TYPE_IDS.join(', ')}`);

  const fsRaw = num(b.focusScore);
  const focusScore = fsRaw === null ? 1 : clamp(fsRaw, 0.5, 1.5);

  const payout = normalizePayout(
    computeSessionPayout(state, { subject, workType, minutes, focusScore })
  );
  // The bell lifts the payout BEFORE the cap, so it can never reach past it.
  consumeStudyBuff(state, payout);

  // --- daily coin cap ---------------------------------------------------
  const already = Math.max(0, num(sessionCoinsToday(state)) ?? 0);
  const remaining = Math.max(0, DAILY_SESSION_COIN_CAP - already);
  const wanted = totalOf(payout.coins);
  let capNote = null;

  if (remaining <= 0 && wanted > 0) {
    payout.coins = emptyCoinObj();
    capNote = `daily session coin cap reached (${DAILY_SESSION_COIN_CAP}) — no coins from this session`;
  } else if (wanted > remaining) {
    const scale = remaining / wanted;
    let handed = 0;
    for (const c of CURRENCY_IDS) {
      const v = Math.floor(payout.coins[c] * scale);
      payout.coins[c] = v;
      handed += v;
    }
    capNote = `daily session coin cap: only ${handed} of ${wanted} coins awarded`;
  }
  if (capNote) payout.breakdown.push(capNote);

  creditPayout(state, payout);
  bumpLifetime(state, 'studyMinutes', minutes);
  bumpLifetime(state, 'sessions', 1);
  const levels = applyLevelUps(state.player) || { levelsGained: 0 };
  touchStreak(state);

  const endedAt = Date.now();
  const session = {
    id: uid('sess'),
    taskId,
    subject,
    workType,
    minutes,
    startedAt: endedAt - minutes * 60000,
    endedAt,
    // extra bookkeeping so the daily cap can be recomputed from history
    coins: { ...payout.coins },
    coinsAwarded: totalOf(payout.coins),
    xp: payout.xp,
  };
  if (!Array.isArray(state.sessions)) state.sessions = [];
  state.sessions.push(session);

  if (task) task.minutesLogged = (num(task.minutesLogged) ?? 0) + minutes;

  // v2: tracked minutes are the main source of Energy. There is no other one
  // besides completing a task — energy never regenerates on its own.
  const energy = grantEnergy(state, ENERGY_PER_TRACKED_MINUTE * minutes);
  payout.energy = energy.gained;
  session.energy = energy.gained;
  payout.breakdown.push(`+${energy.gained} energy (1 per 3 tracked minutes)`);

  pushLog(
    state,
    `Studied ${minutes} min of ${workType}${task ? ` on "${task.title}"` : ''} — +${payout.xp} xp, ${coinSummary(payout.coins)}` +
      energyNote(energy) +
      (capNote ? ` (${capNote})` : ''),
    'session'
  );
  if (levels.levelsGained > 0) {
    pushLog(state, `Level up! You are now level ${state.player.level}.`, 'level');
  }

  save(state);
  return ok({ state, reward: payout, session });
}

function routePlayerMove(b, state, save) {
  // THE BOAT FOLLOWS. While she is being ridden the scholar and the boat are
  // the same object as far as position goes — recording only the player would
  // leave her moored where you got in, and stepping out would teleport her
  // back across the lake.
  const ridingBoat = isObj(state.boat) && state.boat.riding;
  const x = num(b.x);
  const y = num(b.y);
  if (x === null || y === null) return fail('move needs numeric x and y');
  state.player.x = clamp(Math.round(x), 0, WORLD_W - 1);
  state.player.y = clamp(Math.round(y), 0, WORLD_H - 1);
  if (ridingBoat) {
    state.boat.x = state.player.x;
    state.boat.y = state.player.y;
  }
  save(state);
  return ok();
}

function routeBoxOpen(b, state, save) {
  const raw = b.count === undefined || b.count === null ? 1 : num(b.count);
  if (raw === null) return fail('count must be a number');
  const count = clamp(Math.round(raw), 1, 10);

  const have = num(state.player.darkBoxes) ?? 0;
  if (have < count) {
    return fail(`you only have ${have} dark box${have === 1 ? '' : 'es'} — cannot open ${count}`);
  }

  const result = rollDarkBox(state, count) || {};
  const drops = Array.isArray(result.drops) ? result.drops : [];

  state.player.darkBoxes = have - count;
  // Boxes pay SHARDS now, not materials. The material branch is kept for any
  // drop that still names one, so an older client or a future mixed pool does
  // not silently drop rewards on the floor.
  if (!state.materials) state.materials = {};
  if (!isObj(state.player.coins)) state.player.coins = emptyCoins();
  let shardsWon = 0;
  for (const drop of drops) {
    if (!isObj(drop)) continue;
    const qty = Math.max(0, Math.round(num(drop.qty) ?? 0));
    if (drop.kind === 'shard' || drop.currencyId === 'shard') {
      state.player.coins.shard = (num(state.player.coins.shard) ?? 0) + qty;
      shardsWon += qty;
      continue;
    }
    const id = drop.materialId;
    if (!MATERIAL_IDS.includes(id)) continue;
    state.materials[id] = (num(state.materials[id]) ?? 0) + qty;
  }

  // Boxes pay experience as well as shards, rolled per box so opening ten is
  // ten rolls rather than one scaled one.
  const [xpLo, xpHi] = BOX_XP_RANGE;
  let xpWon = 0;
  for (let i = 0; i < count; i += 1) {
    xpWon += xpLo + Math.floor(Math.random() * (xpHi - xpLo + 1));
  }
  const boxXp = grantXp(state, xpWon, 'the dark opens');

  const summary = (shardsWon > 0
    ? `${shardsWon} shard${shardsWon === 1 ? '' : 's'}`
    : drops.filter(isObj).map((d) => `${d.qty}x ${d.name || d.materialId}`).join(', '))
    + (boxXp.xp > 0 ? ` and ${boxXp.xp} xp` : '');
  pushLog(
    state,
    `Opened ${count} dark box${count === 1 ? '' : 'es'} — ${summary || 'nothing but dust'}`,
    'box'
  );

  save(state);
  return ok({
    state, drops, pity: num(result.pity) ?? 0, best: result.best || null,
    xp: boxXp.xp, levelsGained: boxXp.levelsGained, level: boxXp.level,
  });
}

function routeCraft(b, state, save) {
  const recipeId = typeof b.recipeId === 'string' ? b.recipeId : '';
  if (!recipeId) return fail('recipeId is required');

  const recipe = getRecipe(recipeId);
  if (!recipe) return fail(`unknown recipe "${recipeId}"`);

  // --- v3 place gate ------------------------------------------------------
  // Crafting is a thing you do somewhere. The one exception is a Portable
  // Bench that has been unfolded — that is the whole point of the gadget.
  const eff = effects(state);
  let usedBench = false;
  const placeRefusal = requireRole(state, b, 'craft');
  if (placeRefusal) {
    if ((num(eff.craftPermits) ?? 0) > 0) {
      usedBench = true;
    } else {
      return placeRefusal;
    }
  }

  // --- v2 blueprint gate -------------------------------------------------
  // Knowing a recipe is a thing you buy. state.blueprints is seeded from
  // STARTER_BLUEPRINTS (axe, pickaxe, focus lamp, study hut); everything else
  // comes from the Archivist.
  if (!Array.isArray(state.blueprints)) state.blueprints = [];
  if (!isAlwaysKnown(recipeId) && !state.blueprints.includes(recipeId)) {
    return fail(`you do not know how to make the ${outputLabel(recipe)} — buy its blueprint from the Archivist first`);
  }

  const check = checkCraft(state, recipeId) || { ok: false, missing: [] };
  if (!check.ok) {
    const missing = Array.isArray(check.missing) ? check.missing : [];
    const text = missing
      .map((m) => `${(m && m.label) || '?'} (${(m && m.have) ?? 0}/${(m && m.need) ?? 0})`)
      .join(', ');
    return fail(text ? `not enough materials: ${text}` : 'you cannot craft that yet');
  }

  // deduct
  const mats = isObj(recipe.materials) ? recipe.materials : {};
  for (const [id, qtyRaw] of Object.entries(mats)) {
    const qty = num(qtyRaw) ?? 0;
    state.materials[id] = (num(state.materials[id]) ?? 0) - qty;
    if (state.materials[id] < 0) state.materials[id] = 0;
  }
  const cost = isObj(recipe.coins) ? recipe.coins : {};
  for (const c of CURRENCY_IDS) {
    const qty = num(cost[c]) ?? 0;
    state.player.coins[c] = (num(state.player.coins[c]) ?? 0) - qty;
    if (state.player.coins[c] < 0) state.player.coins[c] = 0;
  }

  let made;
  if (recipe.kind === 'tool') {
    const def = (TOOLS && TOOLS[recipe.outputId]) || null;

    if (def && def.gather) {
      // v2: gathering tools live in their own list. They carry durability and
      // are NOT subject to the 2-slot passive equip cap — an axe in your hand
      // should never cost you a Focus Lamp.
      if (!Array.isArray(state.player.gatherTools)) state.player.gatherTools = [];
      const maxDur = num(TOOL_DURABILITY[recipe.outputId]) ?? 40;
      const gTool = {
        uid: uid('gtool'),
        toolId: recipe.outputId,
        durability: maxDur,
        maxDurability: maxDur,
      };
      state.player.gatherTools.push(gTool);
      // Your first axe goes straight into a free slot — otherwise a new player
      // crafts it, walks to a tree and is told they are not holding anything.
      const landed = equipIntoFirstFreeSlot(state, {
        kind: 'tool', itemId: gTool.toolId, uid: gTool.uid,
      });
      const autoEquipped = landed !== -1;
      made = {
        kind: 'gatherTool', id: recipe.outputId, name: def.name || recipe.outputId,
        uid: gTool.uid, durability: maxDur, maxDurability: maxDur, equipped: autoEquipped,
      };
      pushLog(
        state,
        `Crafted ${made.name} (${maxDur} durability)${autoEquipped ? ' — equipped.' : '.'}`,
        'craft'
      );
    } else {
      const tool = { uid: uid('tool'), itemId: recipe.outputId, equipped: false };
      if (!Array.isArray(state.tools)) state.tools = [];
      state.tools.push(tool);
      made = { kind: 'tool', id: recipe.outputId, name: (def && def.name) || recipe.outputId, uid: tool.uid };
      pushLog(state, `Crafted ${made.name}.`, 'craft');
    }
  } else if (recipe.kind === 'building') {
    const def = (BUILDINGS && BUILDINGS[recipe.outputId]) || null;
    if (!Array.isArray(state.pendingBuildings)) state.pendingBuildings = [];
    state.pendingBuildings.push(recipe.outputId);
    made = {
      kind: 'building',
      id: recipe.outputId,
      name: (def && def.name) || recipe.outputId,
      placeable: true,
    };
    pushLog(state, `Crafted ${made.name} — ready to place.`, 'craft');
  } else if (recipe.kind === 'gadget') {
    const def = GADGETS[recipe.outputId] || null;
    if (!def) return fail(`recipe "${recipeId}" makes a gadget that does not exist`);
    const bag = gadgetBag(state);
    const qty = outputQtyOf(recipe);
    bag[recipe.outputId] = (num(bag[recipe.outputId]) ?? 0) + qty;
    made = {
      kind: 'gadget', id: def.id, name: def.name, qty,
      owned: bag[recipe.outputId], cooldownMs: def.cooldownMs, effect: def.effect,
    };
    pushLog(state, `Crafted ${def.name}. Use it from your inventory.`, 'craft');
  } else if (recipe.kind === 'block') {
    const def = BLOCKS[recipe.outputId] || null;
    if (!def) return fail(`recipe "${recipeId}" makes a block that does not exist`);
    const bag = blockBag(state);
    const qty = outputQtyOf(recipe);
    bag[recipe.outputId] = (num(bag[recipe.outputId]) ?? 0) + qty;
    made = {
      kind: 'block', id: def.id, name: def.name, qty,
      owned: bag[recipe.outputId], solid: Boolean(def.solid), color: def.color,
    };
    pushLog(state, `Made ${qty}x ${def.name}. Place them wherever you like.`, 'craft');
  } else {
    return fail(`recipe "${recipeId}" has an unknown kind "${recipe.kind}"`);
  }

  if (usedBench) {
    eff.craftPermits = Math.max(0, (num(eff.craftPermits) ?? 0) - 1);
    made.awayFromHome = true;
    pushLog(state, 'Folded the Portable Bench back up. That was the one craft it had in it.', 'craft');
  }

  save(state);
  return ok({ state, made });
}

function routeBuild(b, state, save) {
  const buildingId = typeof b.buildingId === 'string' ? b.buildingId : '';
  if (!buildingId) return fail('buildingId is required');
  if (!BUILDING_IDS.includes(buildingId)) return fail(`unknown building "${buildingId}"`);

  if (!Array.isArray(state.pendingBuildings)) state.pendingBuildings = [];
  const idx = state.pendingBuildings.indexOf(buildingId);
  if (idx === -1) return fail('you have not crafted that building yet');

  const x = num(b.x);
  const y = num(b.y);
  if (x === null || y === null) return fail('build needs numeric x and y');
  const px = Math.round(x);
  const py = Math.round(y);

  const fp = footprintOf(buildingId);
  if (px < 0 || py < 0 || px + fp.w > WORLD_W || py + fp.h > WORLD_H) {
    return fail('that spot is outside the world');
  }

  if (!Array.isArray(state.buildings)) state.buildings = [];
  const here = { x: px, y: py, w: fp.w, h: fp.h };
  for (const existing of state.buildings) {
    if (!isObj(existing)) continue;
    const efp = footprintOf(existing.buildingId);
    const there = { x: num(existing.x) ?? 0, y: num(existing.y) ?? 0, w: efp.w, h: efp.h };
    if (rectsOverlap(here, there)) return fail('another building is already there');
  }

  state.pendingBuildings.splice(idx, 1);
  const building = { uid: uid('bld'), buildingId, x: px, y: py };
  state.buildings.push(building);

  const def = (BUILDINGS && BUILDINGS[buildingId]) || null;
  const beforeMax = num(state.player.maxEnergy) ?? BASE_MAX_ENERGY;
  const afterMax = refreshMaxEnergy(state);
  pushLog(
    state,
    `Built ${(def && def.name) || buildingId} at ${px},${py}.` +
      (afterMax > beforeMax ? ` Max energy is now ${afterMax}.` : ''),
    'build'
  );

  save(state);
  return ok({ state, building });
}

const MAX_EQUIPPED = 2;

function routeToolEquip(b, state, save) {
  const toolUid = typeof b.uid === 'string' ? b.uid : '';
  if (!toolUid) return fail('uid is required');
  if (typeof b.equipped !== 'boolean') return fail('equipped must be true or false');

  if (!Array.isArray(state.tools)) state.tools = [];
  const tool = state.tools.find((t) => isObj(t) && t.uid === toolUid);
  if (!tool) return fail('you do not own that tool');

  if (b.equipped) {
    if (tool.equipped) return ok({ state });
    const equippedCount = state.tools.filter((t) => isObj(t) && t.equipped).length;
    if (equippedCount >= MAX_EQUIPPED) {
      return fail(`you can only have ${MAX_EQUIPPED} tools equipped — unequip one first`);
    }
    tool.equipped = true;
  } else {
    tool.equipped = false;
  }

  const def = (TOOLS && TOOLS[tool.itemId]) || null;
  pushLog(
    state,
    `${b.equipped ? 'Equipped' : 'Stowed'} ${(def && def.name) || tool.itemId}.`,
    'tool'
  );

  save(state);
  return ok({ state });
}

function routeSave(state, save) {
  if (!isObj(state.meta)) state.meta = {};
  const at = Date.now();
  state.meta.savedAt = at;
  save(state);
  pushLog(state, 'Game saved.', 'system');
  return ok({ state, savedAt: at });
}

function routeReset(state, save) {
  // Keep the save-slot identity, otherwise the reset would write itself into
  // whatever slot happened to be active rather than the one being played.
  const keepMeta = isObj(state.meta) ? { slot: state.meta.slot, name: state.meta.name } : {};
  const fresh = defaultState();
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
  if (keepMeta.slot) state.meta.slot = keepMeta.slot;
  if (keepMeta.name) state.meta.name = keepMeta.name;
  refreshMaxEnergy(state);
  pushLog(state, 'World reset. A new scholar begins.', 'info');
  save(state);
  return ok({ state });
}

// =========================================================================
// v2 ROUTES
// =========================================================================

// ---------------------------------------------------------------- gathering

/**
 * The server does NOT own the tile map. The world is generated client-side from
 * a fixed seed (web/world/world.js), so the server cannot look up what is at a
 * given tile. The client therefore tells us the node type, and we trust it on
 * terrain only — this is a single-player local game, so terrain honesty is not
 * a security boundary. EVERYTHING else (node type validity, respawn timers,
 * hit counts, tool ownership, tool match, durability, energy) is validated
 * strictly here, because those are the parts that carry real cost.
 */
function routeGather(b, state, save) {
  const x = num(b.x);
  const y = num(b.y);
  if (x === null || y === null) return fail('gather needs numeric x and y');
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) {
    return fail('that tile is outside the world');
  }

  const nodeType = typeof b.nodeType === 'string' ? b.nodeType : '';
  const node = NODE_RULES[nodeType];
  if (!node) {
    return fail(
      nodeType
        ? `there is nothing to harvest at ${tx},${ty} — "${nodeType}" is not a resource node`
        : `there is nothing to harvest at ${tx},${ty}`
    );
  }

  if (!isObj(state.harvested)) state.harvested = {};
  // PER MAP. A bare "x,y" key is one namespace shared by both maps, which meant
  // felling a pine in the Reaches felled the tree on the same coordinates at
  // Home. Home keeps the bare key, so no save needs migrating.
  const key = tileKey(areaOf(state), tx, ty);
  const now = Date.now();
  let entry = state.harvested[key];

  // 0. v3: is this a planted sapling? Only a mature one can be felled, and
  //    felling it consumes the planting so the tile goes back to being a stump.
  let planting = null;
  if (node.plantable) {
    const p = plantings(state)[key];
    if (isObj(p)) {
      const growth = growthOf(p, now);
      if (!growth.mature) {
        return fail(
          `that ${growth.stageLabel.toLowerCase()} is not ready — ` +
          `${humanDuration(growth.msRemaining)} left before it is a tree worth felling.`
        );
      }
      planting = p;
    }
  }

  // 0b. v3: a felled tree is gone for good. This is the economic spine — the
  //     only way back is a sapling, so say that rather than a timer.
  if (!planting && isObj(entry) && entry.felled) {
    // A felled node that CANNOT be replanted must not be offered a sapling.
    // The Blue Bloom is the only one of these: it is unique, it is gone, and
    // telling the player to plant it back would be a lie that costs them a
    // walk to the Market and 10 florins to discover.
    if (entry.plantable === false || node.plantable === false) {
      return fail(
        `the Blue Bloom at ${tx},${ty} is already cut. There was only ever one, ` +
        'and it does not grow back.'
      );
    }
    return fail(
      `that tree is gone for good — trees do not grow back in this world. ` +
      `Plant a sapling on the stump at ${tx},${ty} if you want another one.`
    );
  }

  // 1. already harvested and still respawning?
  if (isObj(entry) && num(entry.respawnAt)) {
    const respawnAt = num(entry.respawnAt);
    if (respawnAt > now) {
      const mins = Math.max(1, Math.ceil((respawnAt - now) / 60000));
      const label = mins >= 120 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`;
      return fail(`that ${nodeType} was already harvested — it grows back in about ${label}`);
    }
    delete state.harvested[key];
    entry = undefined;
  }

  // a part-damaged node of a different type means the client's map moved on
  if (isObj(entry) && entry.nodeType !== nodeType) entry = undefined;

  // 2a. GEAR NODES ask what you have, not what you are holding. Reaches gear is
  //     passive and never occupies a hand, so cracked crag is worked by owning
  //     the Stone Hammer rather than by selecting it.
  const gearNode = !!node.gear;
  if (gearNode && !hasGear(state, node.gear)) {
    const g = REACHES_GEAR[node.gear];
    return fail(`the rock is cracked, but it will not give — you need the ${(g && g.name) || node.gear}.`);
  }

  // 2. the right tool, in hand
  if (!Array.isArray(state.player.gatherTools)) state.player.gatherTools = [];
  const wantedToolId = node.tool;
  const wantedName = (TOOLS[wantedToolId] && TOOLS[wantedToolId].name) || wantedToolId;

  if (!gearNode && !state.player.gatherTools.length) {
    return fail(`you have no gathering tools — craft ${aOrAn(wantedName)} first`);
  }
  // EQUIPPED AND SELECTED. Only the active slot swings; the other hand is
  // carrying, not holding. A tool one keypress away says so by name.
  const tool = gearNode ? null : equippedToolFor(state, wantedToolId);
  if (!gearNode && !tool) {
    const stowed = stowedRef(state);
    const stowedTool = stowed && stowed.kind === 'tool'
      ? state.player.gatherTools.find((t) => isObj(t) && t.uid === stowed.uid)
      : null;
    if (stowedTool && stowedTool.toolId === wantedToolId) {
      return fail(
        `your ${wantedName} is in slot ${stowedSlotNumber(state)} — press ${stowedSlotNumber(state)} to take it out`
      );
    }
    const owns = state.player.gatherTools.some((t) => isObj(t) && t.toolId === wantedToolId);
    if (owns) {
      return fail(
        `your ${wantedName} is in the bag, not in your hands — open the Bag (Tab) and equip it to a slot`
      );
    }
    const held = equippedRefs(state).map(refLabel);
    return fail(
      held.length
        ? `${held.join(' and ')} cannot work ${nodeType} — you need ${aOrAn(wantedName)} for that`
        : `nothing is in your hands — equip ${aOrAn(wantedName)} to work this ${nodeType}`
    );
  }

  // 3. durability. Gear never wears out: the Stone Hammer is a permanent fact
  //    about you, not a consumable, and a puzzle key that can break is a
  //    soft-lock waiting to happen.
  const durability = tool ? (num(tool.durability) ?? 0) : 1;
  if (tool && durability <= 0) {
    return fail(`your ${wantedName} is worn out — repair it at a Forge before using it again`);
  }

  // 4. energy
  const cost = num(node.energy) ?? 0;
  refreshMaxEnergy(state);
  const energyNow = num(state.player.energy) ?? 0;
  if (energyNow < cost) {
    return fail(
      `working ${nodeType} costs ${cost} energy and you have ${Math.floor(energyNow)} — ` +
      'energy comes only from tracked study time and finished tasks'
    );
  }

  // ---- all checks passed: swing -----------------------------------------
  state.player.energy = clamp(energyNow - cost, 0, num(state.player.maxEnergy) ?? BASE_MAX_ENERGY);
  if (tool) tool.durability = durability - 1;

  const totalHits = Math.max(1, Math.round(num(node.hits) ?? 1));
  let hitsLeft = isObj(entry) ? (num(entry.hitsLeft) ?? totalHits) : totalHits;
  hitsLeft -= 1;

  const materialId = node.yields;
  let qty = 0;
  let destroyed = false;
  let drops = [];
  /** The quest item this swing granted, if it finished off a quest node. */
  let questGranted = null;

  if (hitsLeft <= 0) {
    destroyed = true;
    hitsLeft = 0;

    if (!isObj(state.materials)) state.materials = {};

    if (node.questItem) {
      // A quest node yields NO material — only the key, and only ever one of
      // them. `finite` above guarantees the node never comes back, so the
      // second guard here is belt and braces against a save whose `harvested`
      // record was lost: you cannot end up holding two Blue Keys.
      const items = questItemsOf(state);
      const already = Math.max(0, num(items[node.questItem]) ?? 0);
      questGranted = node.questItem;
      if (already < 1) items[node.questItem] = 1;
      const def = QUEST_ITEMS[node.questItem] || { name: node.questItem, color: '#9aa0aa' };
      drops = [{
        kind: 'questItem', questItemId: node.questItem, materialId: null,
        name: def.name, qty: 1, rarity: 'legendary', color: def.color,
      }];
      qty = 1;
    } else if (node.dropTable) {
      // v3: a felled tree gives a weighted mix, not one material.
      drops = rollTreeDrops();
      for (const d of drops) {
        state.materials[d.materialId] = (num(state.materials[d.materialId]) ?? 0) + d.qty;
      }
      const primary = drops.find((d) => d.materialId === materialId) || drops[0] || null;
      qty = primary ? primary.qty : 0;
    } else {
      const [lo, hi] = Array.isArray(node.qty) ? node.qty : [1, 1];
      const loN = Math.max(0, Math.round(num(lo) ?? 1));
      const hiN = Math.max(loN, Math.round(num(hi) ?? loN));
      qty = loN + Math.floor(Math.random() * (hiN - loN + 1));
      state.materials[materialId] = (num(state.materials[materialId]) ?? 0) + qty;
      drops = [{
        materialId,
        name: (MATERIALS[materialId] && MATERIALS[materialId].name) || materialId,
        qty,
        rarity: (MATERIALS[materialId] && MATERIALS[materialId].rarity) || 'common',
        color: (MATERIALS[materialId] && MATERIALS[materialId].color) || '#9aa0aa',
      }];
    }

    if (node.finite) {
      // No respawnAt, ever. A stump is forever until something is planted on it.
      state.harvested[key] = {
        nodeType, hitsLeft: 0, respawnAt: null,
        felled: true, felledAt: now, plantable: Boolean(node.plantable),
        // The stump is visible for STUMP_MINUTES, then the ground clears. The
        // record itself is kept forever so the tree can never render again.
        stumpUntil: now + STUMP_MINUTES * 60000,
      };
      bumpLifetime(state, 'treesFelled', 1);
      if (planting) delete plantings(state)[key];
    } else {
      const respawnAt = now + (num(node.respawnHours) ?? 6) * 3600000;
      state.harvested[key] = { nodeType, hitsLeft: 0, respawnAt };
    }
  } else {
    // still standing — remember the damage, no respawn timer yet
    state.harvested[key] = { nodeType, hitsLeft, respawnAt: null };
  }

  // ---- tool wear ---------------------------------------------------------
  let toolBroke = false;
  if (tool && tool.durability <= 0) {
    toolBroke = true;
    state.player.gatherTools = state.player.gatherTools.filter((t) => isObj(t) && t.uid !== tool.uid);
    // The broken tool leaves its slot; a spare of the same kind steps into it,
    // so the prompt you were using does not silently vanish mid-job.
    const eq = slotsOf(state);
    const wasIn = eq.findIndex((r) => isObj(r) && r.uid === tool.uid);
    const replacement = state.player.gatherTools.find((t) => t.toolId === wantedToolId)
      || state.player.gatherTools[0] || null;
    if (wasIn !== -1) {
      eq[wasIn] = replacement ? { kind: 'tool', itemId: replacement.toolId, uid: replacement.uid } : null;
    }
    syncLegacyGatherTool(state);
  }

  const matName = (MATERIALS[materialId] && MATERIALS[materialId].name) || materialId;
  if (destroyed) {
    const haul = drops.map((d) => `${d.qty}x ${d.name}`).join(', ') || 'nothing';
    if (node.finite) {
      const gotPod = drops.some((d) => d.materialId === 'seedpod');
      pushLog(
        state,
        `Felled ${planting ? 'the tree you planted' : 'a tree'} at ${tx},${ty} — ${haul} (-${cost} energy). ` +
        'The stump will stay a stump unless you plant a sapling on it.' +
        (gotPod ? ' A seedpod fell with it — that plants like a free sapling.' : ''),
        'gather'
      );
    } else {
      pushLog(state, `Harvested ${haul} from a ${nodeType} at ${tx},${ty} (-${cost} energy).`, 'gather');
    }
  } else {
    pushLog(state, `Struck the ${nodeType} at ${tx},${ty} — ${hitsLeft} more to go (-${cost} energy).`, 'gather');
  }
  if (toolBroke) pushLog(state, `Your ${wantedName} broke.`, 'gather');

  // Felling the Blue Bloom is a quest beat, not a harvest: it pays experience
  // once and says plainly what the key is for, because nothing else in the
  // world will tell you.
  let questXp = 0;
  if (questGranted) {
    const def = QUEST_ITEMS[questGranted] || { name: questGranted };
    questXp = completeQuest(state, 'bloom_felled', `the ${def.name} is yours`);
    pushLog(
      state,
      `The Blue Bloom comes apart and leaves a ${def.name} in your pack. ` +
      'The Woodsman in the south-west has been asking for one of these.',
      'quest'
    );
  }

  save(state);
  return ok({
    state,
    result: {
      nodeType,
      materialId,
      materialName: matName,
      qty,
      drops,
      destroyed,
      // v3: `permanent` tells the world to draw a stump that never comes back.
      permanent: destroyed && Boolean(node.finite),
      plantable: destroyed && Boolean(node.plantable),
      fromPlanting: Boolean(planting),
      questItemId: questGranted,
      questXp,
      hitsLeft,
      totalHits,
      energySpent: cost,
      energy: state.player.energy,
      maxEnergy: state.player.maxEnergy,
      toolBroke,
      toolUid: tool ? tool.uid : null,
      durability: tool ? Math.max(0, tool.durability) : null,
      maxDurability: tool ? (num(tool.maxDurability) ?? 1) : null,
      respawnAt: destroyed ? state.harvested[key].respawnAt : null,
    },
  });
}

function aOrAn(name) {
  return /^[aeiou]/i.test(String(name)) ? `an ${name}` : `a ${name}`;
}

// ---------------------------------------------------------------- tool repair

// Repair costs scale with how worn the tool is: you pay for the missing
// durability, not for the tool. Topping up a nearly-full tool is cheap.
const REPAIR_MATERIAL = Object.freeze({
  axe: 'ironwood', pickaxe: 'chalkstone', dredge: 'ironwood', sifter: 'copperwire',
});
const REPAIR_UNITS_PER_MATERIAL = 15; // 1 material per 15 points of wear
const REPAIR_COINS_PER_POINT = 2;     // grind coins per point of wear

function routeToolRepair(b, state, save) {
  const toolUid = typeof b.uid === 'string' ? b.uid : '';
  if (!toolUid) return fail('uid is required');

  // v3: repair is a PLACE, not a check on whether you own a forge somewhere.
  const refusal = requireRole(state, b, 'repair');
  if (refusal) return refusal;

  if (!Array.isArray(state.player.gatherTools)) state.player.gatherTools = [];
  const tool = state.player.gatherTools.find((t) => isObj(t) && t.uid === toolUid);
  if (!tool) return fail('you are not carrying that tool');

  const maxDur = Math.max(1, num(tool.maxDurability) ?? 1);
  const dur = clamp(num(tool.durability) ?? 0, 0, maxDur);
  const wear = maxDur - dur;
  const name = (TOOLS[tool.toolId] && TOOLS[tool.toolId].name) || tool.toolId;
  if (wear <= 0) return fail(`your ${name} is already in perfect condition`);

  const matId = REPAIR_MATERIAL[tool.toolId] || 'chalkstone';
  const matNeed = Math.max(1, Math.ceil(wear / REPAIR_UNITS_PER_MATERIAL));
  const coinNeed = Math.max(10, wear * REPAIR_COINS_PER_POINT);
  const matName = (MATERIALS[matId] && MATERIALS[matId].name) || matId;

  if (!isObj(state.materials)) state.materials = {};
  const matHave = num(state.materials[matId]) ?? 0;
  const coinHave = num(state.player.coins.grind) ?? 0;
  const missing = [];
  if (matHave < matNeed) missing.push(`${matName} (${matHave}/${matNeed})`);
  if (coinHave < coinNeed) missing.push(`Grind coins (${coinHave}/${coinNeed})`);
  if (missing.length) {
    return fail(`the smith wants ${matNeed}x ${matName} and ${coinNeed} grind — you are short: ${missing.join(', ')}`);
  }

  state.materials[matId] = matHave - matNeed;
  state.player.coins.grind = coinHave - coinNeed;
  tool.durability = maxDur;

  pushLog(state, `Repaired ${name} to ${maxDur}/${maxDur} for ${matNeed}x ${matName} and ${coinNeed} grind.`, 'craft');
  save(state);
  return ok({ state, repaired: { uid: tool.uid, toolId: tool.toolId, name, durability: maxDur, maxDurability: maxDur, cost: { materialId: matId, qty: matNeed, grind: coinNeed } } });
}

// ---------------------------------------------------------------- equipment
//
// Two visible slots. Everything in EITHER slot is "equipped" and works; the
// active slot (keys 1 and 2 in the world) is the tie-break when both slots
// could act on the same tile, and it is what the HUD shows in front.

function slotsOf(state) {
  const p = state.player;
  if (!Array.isArray(p.equipped)) p.equipped = [null, null];
  p.equipped.length = EQUIP_SLOT_COUNT;
  return p.equipped;
}

function activeIndex(state) {
  return Number(state.player.activeSlot) === 1 ? 1 : 0;
}

/** Every non-empty slot, active one first. */
/**
 * What is IN YOUR HANDS — the active slot, and nothing else.
 *
 * The other slot is CARRIED, not held. This used to return both slots (active
 * first), which made selecting a slot a mere tie-break: an axe in slot 2 still
 * chopped while slot 1 was selected. Selecting has to mean something, so it
 * means this. `stowedRef()` is the other one, and it exists only so refusals
 * can name the key that would fix them.
 */
function equippedRefs(state) {
  const s = slotsOf(state);
  return [s[activeIndex(state)]].filter(isObj);
}

/** The ref in the INACTIVE slot, or null. Never acts; only explains itself. */
function stowedRef(state) {
  const s = slotsOf(state);
  const a = activeIndex(state);
  const r = s[a === 0 ? 1 : 0];
  return isObj(r) ? r : null;
}

/** 1 or 2 — the number the player would press to make the stowed slot active. */
function stowedSlotNumber(state) {
  return activeIndex(state) === 0 ? 2 : 1;
}

/** True when a seed is in a slot — the ONLY thing that offers the plant prompt. */
function seedEquipped(state) {
  return equippedRefs(state).some((r) => r.kind === 'seed');
}

/** The gathering tool matching `toolId` in the ACTIVE slot, or null. */
function equippedToolFor(state, toolId) {
  const tools = Array.isArray(state.player.gatherTools) ? state.player.gatherTools : [];
  for (const ref of equippedRefs(state)) {
    if (ref.kind !== 'tool') continue;
    const t = tools.find((x) => isObj(x) && x.uid === ref.uid);
    if (t && t.toolId === toolId) return t;
  }
  return null;
}

/** A human name for whatever is in a slot. */
function refLabel(ref) {
  if (!isObj(ref)) return 'nothing';
  if (ref.kind === 'seed') return 'Saplings';
  if (ref.kind === 'gadget') return (GADGETS[ref.itemId] && GADGETS[ref.itemId].name) || ref.itemId;
  return (TOOLS[ref.itemId] && TOOLS[ref.itemId].name) || ref.itemId;
}

/** Read `slot` from a request body as a 0-based index, or null. */
function slotIndexOf(b) {
  const n = Number(b.slot);
  if (!Number.isFinite(n)) return null;
  if (n === 1 || n === 2) return n - 1;          // 1-based, as the player sees it
  if (n === 0 && b.zeroBased) return 0;
  return null;
}

function routeEquipSlot(b, state, save) {
  const idx = slotIndexOf(b);
  if (idx === null) return fail('which slot? send slot: 1 or slot: 2');
  const s = slotsOf(state);

  if (b.clear === true || b.ref === null || b.kind === 'none') {
    const had = refLabel(s[idx]);
    if (!s[idx]) return fail(`slot ${idx + 1} is already empty`);
    s[idx] = null;
    syncLegacyGatherTool(state);
    pushLog(state, `Put ${had} away — slot ${idx + 1} is empty.`, 'tool');
    save(state);
    return ok({ state, equipped: s, activeSlot: activeIndex(state) });
  }

  const raw = isObj(b.ref) ? b.ref : { kind: b.kind, itemId: b.itemId, uid: b.uid };
  const ref = normaliseRef(raw, state);
  if (!ref) {
    return fail('that is not something a slot can hold — slots take gathering tools, seeds and gadgets');
  }

  // You must actually own it. A slot naming a thing you do not have would show
  // a prompt in the world that can never succeed.
  if (ref.kind === 'seed') {
    const seeds = Math.max(0, num(state.player.saplings) ?? 0)
      + Math.max(0, num(materialsOf(state).seedpod) ?? 0);
    if (seeds < 1) {
      return fail('you have no saplings or seedpods to hold — the Merchant sells saplings at the Trading Post');
    }
  }
  if (ref.kind === 'gadget') {
    const held = num((state.gadgets || {})[ref.itemId]) ?? 0;
    if (held < 1) return fail(`you have no ${refLabel(ref)} — craft one at a house first`);
  }

  // The same thing cannot fill both slots.
  const other = idx === 0 ? 1 : 0;
  const o = s[other];
  if (o && o.kind === ref.kind && o.itemId === ref.itemId && (o.uid || null) === (ref.uid || null)) {
    s[other] = null;
  }

  s[idx] = ref;
  // Selecting is now a real choice — only the active slot acts — so equipping
  // must not quietly make one for you. Filling your SECOND hand while holding
  // an axe used to move the selection onto the new item, which under the new
  // rule means loading slot 2 disarms you. Take the new item out only when
  // your hands were empty; otherwise the player's selection stands and they
  // press 1 / 2 when they want to switch.
  if (!s[activeIndex(state)]) state.player.activeSlot = idx;
  syncLegacyGatherTool(state);
  pushLog(state, `${refLabel(ref)} in slot ${idx + 1}.`, 'tool');
  save(state);
  return ok({ state, equipped: s, activeSlot: idx });
}

function routeEquipActive(b, state, save) {
  const idx = slotIndexOf(b);
  if (idx === null) return fail('which slot? send slot: 1 or slot: 2');
  slotsOf(state);
  state.player.activeSlot = idx;
  syncLegacyGatherTool(state);
  save(state);
  return ok({ state, equipped: slotsOf(state), activeSlot: idx });
}

/**
 * The v2 endpoint, kept working. It used to set the one hidden slot; now it
 * puts the tool in the active slot (or the first free one), so old callers and
 * the Bag's EQUIP button land in the same place.
 */
function routeEquipGather(b, state, save) {
  const toolUid = typeof b.uid === 'string' ? b.uid : '';
  if (!Array.isArray(state.player.gatherTools)) state.player.gatherTools = [];
  const s = slotsOf(state);

  if (!toolUid || toolUid === 'none') {
    for (let i = 0; i < EQUIP_SLOT_COUNT; i += 1) if (s[i] && s[i].kind === 'tool') s[i] = null;
    syncLegacyGatherTool(state);
    pushLog(state, 'Put your gathering tool away.', 'tool');
    save(state);
    return ok({ state, equipped: s });
  }

  const tool = state.player.gatherTools.find((t) => isObj(t) && t.uid === toolUid);
  if (!tool) return fail('you are not carrying that gathering tool');

  const ref = { kind: 'tool', itemId: tool.toolId, uid: tool.uid };
  const already = s.findIndex((r) => isObj(r) && r.uid === tool.uid);
  let idx;
  if (already !== -1) idx = already;
  else {
    const free = s.findIndex((r) => !r);
    idx = free !== -1 ? free : activeIndex(state);
    s[idx] = ref;
  }
  state.player.activeSlot = idx;
  syncLegacyGatherTool(state);
  const name = (TOOLS[tool.toolId] && TOOLS[tool.toolId].name) || tool.toolId;
  pushLog(state, `Took up the ${name} (${tool.durability}/${tool.maxDurability}) — slot ${idx + 1}.`, 'tool');
  save(state);
  return ok({ state, active: tool.uid, equipped: s, activeSlot: idx });
}

// ---------------------------------------------------------------- shops

/** A human name for whatever a recipe produces, whatever kind it is. */
function outputLabel(recipe) {
  if (!recipe) return 'that';
  const id = recipe.outputId;
  if (recipe.kind === 'tool') return (TOOLS[id] && TOOLS[id].name) || id;
  if (recipe.kind === 'building') return (BUILDINGS[id] && BUILDINGS[id].name) || id;
  if (recipe.kind === 'gadget') return (GADGETS[id] && GADGETS[id].name) || id;
  if (recipe.kind === 'block') return (BLOCKS[id] && BLOCKS[id].name) || id;
  return String(id);
}

/**
 * Which building role a given vendor is served from. Blueprints live at the
 * Archive, everything else at the Shop — straight out of BUILDING_ROLES.
 */
function shopRole(shopId) {
  return shopId === 'archivist' ? 'blueprints' : 'shop';
}

/**
 * Reading the stall is not trading. /api/shops answers anywhere so the UI can
 * show prices and the quest log can point you at them, but it says plainly
 * whether you are close enough to actually buy. Every MUTATING shop route is
 * gated below.
 */
function routeShops(b, state, save) {
  const before = state.shops && state.shops.refreshedOn;
  const shops = Shops.getShops(state);
  if (before !== shops.refreshedOn) {
    pushLog(state, 'The Wandering Merchant has laid out a new day of stock.', 'shop');
    save(state);
  }
  const pos = playerPosition(b, state);
  const here = placeReport(state, pos.x, pos.y);
  return ok({
    state,
    shops,
    atShop: here.roles.includes('shop'),
    atArchive: here.roles.includes('blueprints'),
    // The outlander doors, so the panel can draw the right dialogue without a
    // second round trip. The UI must never DECIDE any of this — it only shows
    // what the server already decided on the sell route.
    vendors: {
      woodsman: { unlocked: vendorUnlocked(state, 'woodsman'), lock: lockStatus(state, 'woodsman') },
      stonemason: { unlocked: vendorUnlocked(state, 'stonemason'), lock: lockStatus(state, 'stonemason') },
    },
    here,
  });
}

function routeShopBuy(b, state, save) {
  const shopId = typeof b.shopId === 'string' ? b.shopId : '';
  if (!shopId) return fail('shopId is required');
  const offerId = typeof b.offerId === 'string' ? b.offerId : '';
  if (!offerId && shopId !== 'broker') return fail('offerId is required');

  const refusal = requireRole(state, b, shopRole(shopId));
  if (refusal) return refusal;

  const res = Shops.buy(state, shopId, offerId);
  if (!res.ok) return fail(res.error);
  save(state);
  return ok({ state, bought: res.bought, shops: Shops.getShops(state) });
}

// =========================================================================
// v5: THE OUTLANDERS — locks, and the dialogue that explains them
// =========================================================================
//
// Both vendors start closed. The gate is enforced HERE, on the sell route, and
// merely EXPLAINED by the dialogue: a lock that only exists in the UI is not a
// lock, and this project has shipped that mistake before.

/** Vendor display names, used by the dialogue and by refusals. */
const VENDOR_NAMES = Object.freeze({
  woodsman: 'Aldren the Woodsman',
  stonemason: 'Bruk the Stonemason',
});

/** Has this vendor already agreed to trade? Once true, it stays true. */
function vendorUnlocked(state, vendor) {
  return unlockedOf(state).includes(vendor);
}

/**
 * Can the lock be opened RIGHT NOW? Returns what the caller needs to say so,
 * rather than a bare boolean — every refusal in this file names the thing that
 * would fix it, and "he will not trade with you" alone does not.
 */
function lockStatus(state, vendor) {
  const lock = VENDOR_LOCKS[vendor];
  if (!lock) return { locked: false, kind: 'none', can: true };
  if (vendorUnlocked(state, vendor)) return { locked: false, kind: lock.kind, can: true };

  if (lock.kind === 'level') {
    const level = Math.max(1, Math.floor(num(state.player.level) ?? 1));
    return {
      locked: true, kind: 'level', can: level >= lock.level,
      level, need: lock.level, short: Math.max(0, lock.level - level),
    };
  }
  if (lock.kind === 'questItem') {
    const have = Math.max(0, num(questItemsOf(state)[lock.itemId]) ?? 0);
    const def = QUEST_ITEMS[lock.itemId] || { name: lock.itemId };
    return { locked: true, kind: 'questItem', can: have > 0, itemId: lock.itemId, itemName: def.name, have };
  }
  return { locked: true, kind: lock.kind, can: false };
}

/**
 * Open the door if the condition is met, and pay the one-off XP for it.
 *
 * The Woodsman's key is SPENT here — that is what "it disappears when you
 * interact again with him" means. Spending it on the sell route instead would
 * mean a player who never talks to him loses the key to his first sale without
 * ever being told what happened.
 */
function tryUnlockVendor(state, vendor) {
  const st = lockStatus(state, vendor);
  if (!st.locked) return { opened: false, already: true, status: st };
  if (!st.can) return { opened: false, already: false, status: st };

  if (st.kind === 'questItem') {
    const items = questItemsOf(state);
    const have = Math.max(0, num(items[st.itemId]) ?? 0);
    if (have <= 1) delete items[st.itemId];
    else items[st.itemId] = have - 1;
  }
  unlockedOf(state).push(vendor);
  const xp = completeQuest(state, `${vendor}_opened`, `${VENDOR_NAMES[vendor] || vendor} will trade with you`);
  pushLog(state, `${VENDOR_NAMES[vendor] || vendor} will trade with you now.`, 'quest');
  return { opened: true, already: false, status: lockStatus(state, vendor), xp };
}

/**
 * THE DIALOGUE.
 *
 * Four stages, and which one you get is derived from state rather than stored,
 * so a save can never be stranded on a line that no longer matches the world.
 * `opening` is the one that only ever plays once — the moment the door opens —
 * and it is produced by tryUnlockVendor having just succeeded, not by a flag.
 */
function vendorDialogue(state, vendor, opened) {
  const name = VENDOR_NAMES[vendor] || vendor;
  const st = lockStatus(state, vendor);

  if (vendor === 'woodsman') {
    if (opened) {
      return {
        stage: 'opening',
        name,
        lines: [
          'His eyes go to your hand before you have finished speaking.',
          '"That is Bloom-cut. I have not seen one of those since my father worked this wood."',
          'He takes the key with both hands and hangs it on a nail above the log stack.',
          '"Thank you. Truly. Bring me your timber and I will pay you properly for it — none of that Trading Post nonsense."',
        ],
      };
    }
    if (st.locked) {
      return {
        stage: 'locked',
        name,
        lines: [
          'The woodsman does not put down his axe.',
          '"I do not trade with strangers, and out here everyone is a stranger."',
          '"There is a Blue Bloom in the north-west of the map — a great blue growth, more fungus than tree. Cut it down and bring me the key inside it."',
          '"Do that and I will know you can find your way. Then we can talk about timber."',
        ],
        hint: 'Find the Blue Bloom in the far north-west and fell it with an axe.',
      };
    }
    return {
      stage: 'open',
      name,
      lines: [
        '"Back again." He nods at the log stack. "You know my prices. Better than town, and worth the walk."',
      ],
    };
  }

  // stonemason
  if (opened) {
    return {
      stage: 'opening',
      name,
      lines: [
        'The stonemason looks you over a second time, and something in him settles.',
        `"Level ${st.level || ''}. Right. You have put the hours in — I can see it in how you carry the pick."`,
        '"Bring me stone, then. I pay for stone, not for enthusiasm."',
      ],
    };
  }
  if (st.locked) {
    return {
      stage: 'locked',
      name,
      lines: [
        'The stonemason barely looks up from the block he is dressing.',
        '"You are not professional enough for me yet. I do not buy from amateurs — they bring me cracked stone and waste my morning."',
        `"Come back when you have reached level ${st.need}. You are ${st.level} now. That is ${st.short} to go."`,
      ],
      hint: `Reach level ${st.need}. You gain experience by selling, opening dark boxes and finishing quests.`,
    };
  }
  return {
    stage: 'open',
    name,
    lines: ['"Stone, is it. Set it down where I can see it."'],
  };
}

/**
 * POST /api/npc/talk — walking up to an outlander and speaking to him.
 *
 * This is where a lock actually opens, because talking is the thing the player
 * does deliberately. It requires standing at his counter for the same reason
 * selling does: an unlock you can trigger from across the map is not a journey.
 */
function routeNpcTalk(b, state, save) {
  if (b.vendor === 'herald') return routeHeraldTalk(b, state, save);
  if (b.vendor === 'hutkeeper') return routeHutkeeperTalk(b, state, save);
  if (b.vendor === 'wiseman') return routeWiseManTalk(b, state, save);
  const vendor = (b.vendor === 'woodsman' || b.vendor === 'stonemason') ? b.vendor : null;
  if (!vendor) return fail('talk to whom? send vendor: "woodsman", "stonemason" or "herald"');

  const refusal = requireRole(state, b, vendor);
  if (refusal) return refusal;

  const res = tryUnlockVendor(state, vendor);
  const dialogue = vendorDialogue(state, vendor, res.opened);
  save(state);
  return ok({
    state,
    vendor,
    dialogue,
    unlocked: vendorUnlocked(state, vendor),
    justOpened: res.opened,
    xp: res.opened ? (res.xp || 0) : 0,
    lock: lockStatus(state, vendor),
  });
}

/**
 * POST /api/charm — wear or remove a charm.
 *
 * Charms are OWNED (`player.ownedCharms`) and separately WORN
 * (`player.charms`, two slots). Keeping the two apart is what lets you take a
 * lantern off without selling it, and what stops a worn charm being invisible
 * in the Bag.
 */
function routeCharm(b, state, save) {
  const p = state.player;
  if (!Array.isArray(p.charms)) p.charms = [null, null];
  p.charms.length = CHARM_SLOT_COUNT;
  if (!Array.isArray(p.ownedCharms)) p.ownedCharms = [];

  const n = Number(b.slot);
  if (!Number.isFinite(n) || n < 1 || n > CHARM_SLOT_COUNT) {
    return fail(`which charm slot? send slot: 1 or ${CHARM_SLOT_COUNT}`);
  }
  const idx = n - 1;

  if (b.clear === true || b.charmId === null) {
    const had = p.charms[idx];
    if (!had) return fail(`charm slot ${n} is already empty`);
    p.charms[idx] = null;
    pushLog(state, `Took off the ${(CHARMS[had] || {}).name || had}.`, 'tool');
    save(state);
    return ok({ state, charms: p.charms.slice() });
  }

  const charmId = typeof b.charmId === 'string' ? b.charmId : '';
  if (!CHARMS[charmId]) return fail(`"${b.charmId}" is not a charm`);
  if (!p.ownedCharms.includes(charmId)) {
    return fail(`you do not own the ${CHARMS[charmId].name} — the Merchant sells it at the Trading Post`);
  }
  // The same charm in both slots would be a second copy of one effect.
  const other = idx === 0 ? 1 : 0;
  if (p.charms[other] === charmId) p.charms[other] = null;
  p.charms[idx] = charmId;
  pushLog(state, `Put on the ${CHARMS[charmId].name}.`, 'tool');
  save(state);
  return ok({ state, charms: p.charms.slice() });
}

/**
 * THE HERALD. Summoned the first time the scholar is seen at HERALD.level.
 *
 * Lazy, like the sapling growth and the stamina tick: checked whenever state is
 * read rather than pushed at the moment of levelling. A save that was ALREADY
 * past level 20 before he existed must summon him too, and a levelling path
 * that forgot to call this would otherwise strand him forever.
 */
function heraldOf(state) {
  if (!isObj(state.herald)) state.herald = { summonedAt: null, spoken: false };
  return state.herald;
}

function tickHerald(state) {
  const h = heraldOf(state);
  if (h.summonedAt) return false;
  const level = Math.max(1, Math.floor(num(state.player && state.player.level) ?? 1));
  if (level < HERALD.level) return false;
  h.summonedAt = Date.now();
  pushLog(
    state,
    'A rider has come through the western treeline, making for the middle of the Home Block. '
    + 'He does not look like a merchant.',
    'quest'
  );
  return true;
}

/** Has he finished the ride and dismounted? Wall-clock, same as the client. */
function heraldArrived(state) {
  const h = heraldOf(state);
  if (!h.summonedAt) return false;
  return Date.now() - num(h.summonedAt, 0) >= HERALD.rideMs;
}

/**
 * POST /api/npc/talk with vendor "herald".
 *
 * He is not a vendor and has no counter, so the location gate is a plain
 * distance to where he stopped rather than `requireRole` — there is no building
 * to be adjacent to.
 */
function routeHeraldTalk(b, state, save) {
  const h = heraldOf(state);
  if (!h.summonedAt) {
    return fail(`there is no rider here — he comes at level ${HERALD.level}`);
  }
  if (!heraldArrived(state)) {
    return fail('he is still riding in. Wait for him to reach the middle.');
  }
  const pos = playerPosition(b, state);
  const dist = Math.max(Math.abs(pos.x - HERALD.stopX), Math.abs(pos.y - HERALD.stopY));
  if (dist > 2) {
    return fail(
      `the rider waits in the middle of the map, at ${HERALD.stopX},${HERALD.stopY} — `
      + `you are at ${pos.x},${pos.y}. Walk up to him.`
    );
  }

  // The quest xp is paid ONCE, on the first telling; hearing it again is free
  // and says the same thing, because a quest you have been given does not
  // change when you ask about it.
  const first = !h.spoken;
  let xp = 0;
  if (first) {
    h.spoken = true;
    // Recorded, not rewarded. `herald_heard` is worth 0 — the 400 is reserved
    // for `wise_man_found`, because being told about a journey is not the same
    // as making it. The quest record still goes in, so the Codex and any future
    // "have you been told?" check has something to read.
    xp = completeQuest(state, 'herald_heard', 'the Herald has told you what is coming');
    pushLog(state, `New objective — ${HERALD_DIALOGUE.objective}`, 'quest');
  }
  save(state);
  return ok({
    state,
    vendor: 'herald',
    dialogue: {
      stage: first ? 'opening' : 'open',
      name: HERALD_DIALOGUE.name,
      lines: HERALD_DIALOGUE.lines.slice(),
      objective: HERALD_DIALOGUE.objective,
    },
    unlocked: true,
    justOpened: false,
    xp,
  });
}

/**
 * POST /api/dev/grant — DEVELOPER MODE.
 *
 * Bruno, 2026-08-31: a way to "test level 20 xp without altering normal
 * gameplay" — set a level, hand over money and gear, and repair everything.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * It does not turn anything on permanently. Every call is a one-off grant, so
 * there is no "cheat mode" flag for the rest of the game to branch on — which
 * is what would actually alter normal gameplay, by giving every system a second
 * code path that only developers ever exercise.
 *
 * And it does not hide itself. `meta.devUsed` is stamped on any save it touches
 * and never cleared. A save that has been handed level 20 is not evidence of
 * anything, and later me should be able to tell the difference at a glance.
 */
function routeDevGrant(b, state, save) {
  const p = state.player;
  const done = [];

  // --- level. Set outright rather than by adding xp: "put me at 20" is the
  // request, and walking the curve to get there is exactly the grind being
  // skipped. xp is zeroed into the new level so the bar reads honestly.
  const level = Math.round(num(b.level) ?? NaN);
  if (Number.isFinite(level) && level >= 1 && level <= 99) {
    p.level = level;
    p.xp = 0;
    p.xpToNext = xpToNext(level);
    refreshMaxEnergy(state);
    p.energy = num(p.maxEnergy) ?? BASE_MAX_ENERGY;
    done.push(`level ${level}`);
  }

  // --- v7: the mountain, for testing what is behind it. Every piece of gear,
  //     and the Warden already broken.
  // --- v10: quest items, for testing what waits on them. The Codex and the
  //     Ring gate the Wise Man's second telling and the road west, and walking
  //     the whole of Elderwatch to reach that state in every suite that needs
  //     it would be a test of Elderwatch, not of the thing under test.
  if (isObj(b.questItems)) {
    const items = questItemsOf(state);
    for (const [id, qty] of Object.entries(b.questItems)) {
      if (!QUEST_ITEM_DEFS[id]) continue;
      const n = Math.max(0, Math.round(num(qty) ?? 0));
      if (n > 0) items[id] = n; else delete items[id];
    }
    done.push(`quest items ${Object.keys(b.questItems).join(', ')}`);
  }
  if (b.reachesGear === true) {
    const r = reachesOf(state);
    for (const id of Object.keys(REACHES_GEAR)) if (r.gear.indexOf(id) === -1) r.gear.push(id);
    done.push('all Reaches gear');
  }
  if (b.wardenBeaten === true) {
    reachesOf(state).warden.beaten = true;
    done.push('the Rime Warden broken');
  }

  // --- money
  const florins = Math.round(num(b.florins) ?? NaN);
  if (Number.isFinite(florins) && florins >= 0) {
    if (!isObj(p.coins)) p.coins = emptyCoins();
    p.coins[MAIN_CURRENCY] = florins;
    done.push(`${florins} florins`);
  }
  const shards = Math.round(num(b.shards) ?? NaN);
  if (Number.isFinite(shards) && shards >= 0) {
    if (!isObj(p.coins)) p.coins = emptyCoins();
    p.coins.shard = shards;
    done.push(`${shards} shards`);
  }

  // --- everything you can hold
  if (b.allItems === true) {
    if (!isObj(state.materials)) state.materials = {};
    for (const id of MATERIAL_IDS) state.materials[id] = Math.max(99, num(state.materials[id]) ?? 0);
    if (!isObj(state.gadgets)) state.gadgets = {};
    for (const id of GADGET_IDS) state.gadgets[id] = Math.max(9, num(state.gadgets[id]) ?? 0);
    if (!isObj(state.blocks)) state.blocks = {};
    for (const id of BLOCK_IDS) state.blocks[id] = Math.max(99, num(state.blocks[id]) ?? 0);
    if (!Array.isArray(state.blueprints)) state.blueprints = [];
    for (const r of RECIPES) if (r && r.id && !state.blueprints.includes(r.id)) state.blueprints.push(r.id);
    if (!Array.isArray(p.ownedCharms)) p.ownedCharms = [];
    for (const id of CHARM_IDS) if (!p.ownedCharms.includes(id)) p.ownedCharms.push(id);
    p.saplings = Math.max(50, num(p.saplings) ?? 0);
    p.darkBoxes = Math.max(25, num(p.darkBoxes) ?? 0);
    done.push('every material, gadget, block, blueprint and charm');
  }

  // --- one of every gathering tool, at full durability
  if (b.allTools === true) {
    if (!Array.isArray(p.gatherTools)) p.gatherTools = [];
    for (const toolId of GATHER_TOOL_IDS) {
      const max = TOOL_DURABILITY[toolId] || 50;
      if (!p.gatherTools.some((t) => isObj(t) && t.toolId === toolId)) {
        p.gatherTools.push({
          uid: `dev-${toolId}`, toolId, durability: max, maxDurability: max,
        });
      }
    }
    done.push('one of every tool');
  }

  // --- mend everything, including tools that were already owned
  if (b.repair === true) {
    let mended = 0;
    for (const t of (Array.isArray(p.gatherTools) ? p.gatherTools : [])) {
      if (!isObj(t)) continue;
      const max = num(t.maxDurability) ?? TOOL_DURABILITY[t.toolId] ?? 50;
      t.maxDurability = max;
      if ((num(t.durability) ?? 0) < max) mended += 1;
      t.durability = max;
    }
    done.push(`repaired ${mended} tool${mended === 1 ? '' : 's'}`);
  }

  if (!done.length) {
    return fail('nothing asked for — send level, florins, shards, allItems, allTools or repair');
  }

  if (!isObj(state.meta)) state.meta = {};
  state.meta.devUsed = true;
  pushLog(state, `DEVELOPER MODE — ${done.join(', ')}.`, 'quest');
  save(state);
  return ok({ state, granted: done });
}

// =========================================================================
// v5: THE LAKE — the hut, the keeper, the boat and the fish
// =========================================================================

function hutOf(state) {
  if (!isObj(state.hut)) state.hut = { opened: false, spoken: false };
  return state.hut;
}
function boatOf(state) {
  if (!isObj(state.boat)) state.boat = { granted: false, lastCastAt: 0 };
  return state.boat;
}

/** Chebyshev distance, the same reach every other standing thing uses. */
function within(pos, x, y, r) {
  return Math.max(Math.abs(pos.x - x), Math.abs(pos.y - y)) <= r;
}

/** The tile the hut's door opens onto: below the middle of its front edge. */
function hutDoorTile() {
  return { x: HUT.x + Math.floor(HUT.w / 2), y: HUT.y + HUT.h };
}

/**
 * POST /api/hut/open — turn the Silver Key in the storage hut.
 *
 * The key is SPENT here, and the boat is granted here, so the whole
 * transaction is one call: a player who is interrupted between unlocking and
 * being given the boat would otherwise be left with neither.
 */
function routeHutOpen(b, state, save) {
  const hut = hutOf(state);
  if (hut.opened) return fail('the hut is already open.');

  const pos = playerPosition(b, state);
  const door = hutDoorTile();
  if (!within(pos, door.x, door.y, 2)) {
    return fail(
      `the storage hut is in the north-east woods, at ${door.x},${door.y} — `
      + `you are at ${pos.x},${pos.y}.`
    );
  }
  const items = questItemsOf(state);
  if (!(num(items.silver_key) > 0)) {
    return fail(
      'the door is locked and there is no handle on this side. '
      + `The Merchant cuts Silver Keys once you reach level ${HUT.keyLevel}.`
    );
  }

  delete items.silver_key;
  hut.opened = true;
  const boat = boatOf(state);
  boat.granted = true;
  pushLog(
    state,
    'The Silver Key turns. The Hutkeeper steps out blinking, and gives you the wooden boat '
    + `that was stored inside. She is moored in the lake at ${BOAT.x},${BOAT.y}.`,
    'quest'
  );
  save(state);
  return ok({ state, hut: { ...hut }, boat: { ...boat } });
}

/** POST /api/npc/talk with vendor "hutkeeper". */
function routeHutkeeperTalk(b, state, save) {
  const hut = hutOf(state);
  if (!hut.opened) return fail('nobody answers. The door is still locked.');

  const pos = playerPosition(b, state);
  const door = hutDoorTile();
  if (!within(pos, door.x, door.y, 2)) {
    return fail(`the Hutkeeper is standing by his hut at ${door.x},${door.y} — you are at ${pos.x},${pos.y}.`);
  }

  const first = !hut.spoken;
  if (first) {
    hut.spoken = true;
    save(state);
  }
  return ok({
    state,
    vendor: 'hutkeeper',
    dialogue: {
      stage: first ? 'opening' : 'open',
      name: HUTKEEPER_DIALOGUE.name,
      lines: first
        ? HUTKEEPER_DIALOGUE.lines.slice()
        : ['"Still here. Still grateful." He nods at the water. "Go on — she is yours."'],
    },
    unlocked: true,
    justOpened: false,
    xp: 0,
  });
}

/**
 * POST /api/fish — one cast, from the boat.
 *
 * The cooldown is enforced on the SERVER against its own clock rather than
 * trusted from the client, because a fishing rate is exactly the thing a
 * fast-clicking client would otherwise walk straight through.
 */
function routeFish(b, state, save) {
  const boat = boatOf(state);
  if (!boat.granted) return fail('you have no boat. The Hutkeeper has one, if anyone ever lets him out.');

  // ABOARD, not "standing on the mooring". The first version compared the
  // player against the CONSTANT BOAT.x/BOAT.y, so the moment you rowed one tile
  // away from where she was first tied up, every cast was refused. Riding is
  // the server's own flag — it is set in routeBoatBoard and cleared on landing
  // and on crossing maps — so it is the thing to ask.
  if (!boat.riding) {
    return fail('you can only fish from the boat — climb aboard with P first.');
  }

  const now = Date.now();
  const last = num(boat.lastCastAt) ?? 0;
  const waited = now - last;
  if (last && waited < FISHING.intervalMs) {
    const left = Math.ceil((FISHING.intervalMs - waited) / 1000);
    return fail(`the line is still out — ${left}s to go.`);
  }
  boat.lastCastAt = now;

  const hooked = Math.random() < FISHING.chance;
  let caught = 0;
  if (hooked) {
    if (!isObj(state.materials)) state.materials = {};
    caught = FISHING.catchQty;
    state.materials[FISHING.catchId] = (num(state.materials[FISHING.catchId]) ?? 0) + caught;
    const def = MATERIALS[FISHING.catchId] || { name: FISHING.catchId };
    pushLog(state, `Landed ${caught} ${def.name}.`, 'gather');
  } else {
    pushLog(state, 'The line comes back empty.', 'gather');
  }

  save(state);
  return ok({
    state,
    hooked,
    caught,
    materialId: FISHING.catchId,
    nextCastMs: FISHING.intervalMs,
  });
}

// =========================================================================
// v6: THE SECOND MAP — crossing over, and the Wise Man
// =========================================================================

/** Which map the scholar is standing on. Defaults to home for older saves. */
function areaOf(state) {
  const a = state.player && state.player.area;
  // A whitelist, not a two-way switch: there are three maps now and a save that
  // names one of them must not be quietly sent home.
  return (a === AREAS.peaks || a === AREAS.elderwatch || a === AREAS.farlands)
    ? a : AREAS.home;
}

function wiseManOf(state) {
  if (!isObj(state.wiseMan)) state.wiseMan = { found: false, spoken: false, returned: false };
  // `returned` is v10: he has read the Codex and opened the road west. Seeded
  // lazily so a save from before the second telling existed walks into it.
  if (typeof state.wiseMan.returned !== 'boolean') state.wiseMan.returned = false;
  return state.wiseMan;
}

/**
 * POST /api/travel — walk off the edge of the world onto the next one.
 *
 * The client asks when the scholar reaches the crossing column; the SERVER
 * decides whether they may, because the whole point of sealing the borders is
 * that there is one way through and it is gated.
 *
 * The gate is the Herald: you may not wander east before you have been told to
 * go east. Without that the second map is just a place the map happens to allow,
 * and his whole errand is decoration.
 */
function routeTravel(b, state, save) {
  const from = areaOf(state);
  const pos = playerPosition(b, state);

  // WHICH WAY OUT AM I STANDING ON? Asked of the CROSSINGS table, because
  // there are three maps now and the Reaches have a door at each end.
  const crossing = crossingAt(from, pos.x, pos.y);
  if (!crossing) {
    return fail('there is no way out of the map here — the roads leave from the edges.');
  }
  if (crossing.needs === 'herald' && !(isObj(state.herald) && state.herald.spoken)) {
    return fail(crossing.refusal);
  }
  if (crossing.needs === 'wiseman' && !(isObj(state.wiseMan) && state.wiseMan.spoken)) {
    return fail(crossing.refusal);
  }
  // THE ROAD WEST is the Wise Man's second telling: he asked for the Codex and
  // the Ring and asked you not to go west without him, and this is where that
  // request stops being a line of dialogue.
  if (crossing.needs === 'wiseman_returned'
      && !(isObj(state.wiseMan) && state.wiseMan.returned)) {
    return fail(crossing.refusal);
  }

  // Remember where we were standing, so coming back is coming BACK.
  if (!isObj(state.areaPos)) state.areaPos = {};
  state.areaPos[from] = { x: pos.x, y: pos.y };

  const landing = { x: crossing.landing.x, y: crossing.landing.y };

  const to = crossing.to;
  state.player.area = to;
  state.player.x = landing.x;
  state.player.y = landing.y;
  // Stepping onto a boat is a thing you do on ONE lake. Crossing maps puts you
  // back on your feet, or the boat would follow you into the mountains.
  const boat = boatOf(state);
  boat.riding = false;
  // LEAVING A MAP PUTS ITS ROCKS BACK.
  //
  // It used to be arrival, and only Elderwatch's bailey — added as a safety net
  // because a barrel shoved against a wall can never be shoved back and a
  // player who is never caught would be left holding a lock that cannot open.
  // The rule is better as a rule: every map, every room of it, on the way OUT.
  // A half-pushed puzzle is not a thing worth carrying across a mountain, and
  // "walk out and back in" is then a reset the player can always reach for
  // without having to be caught to get it.
  resetMapRocks(state, from);

  const ARRIVALS = {
    peaks: 'The road climbs, the air thins, and the trees go from green to black. '
      + 'You have crossed into the Snowfall Reaches.',
    home: 'The snow gives way to grass. You are back in the Home Block.',
    elderwatch: 'The mountain falls away behind you and the road runs out onto a flat, '
      + 'cold moor. Elderwatch sits on it: a square of wall with a barred gate, and nobody '
      + 'on it who is expecting anyone.',
    farlands: 'The grass gives out. The ground west of the Home Block is old lava, red-black '
      + 'and cracked underfoot, and it goes on further than you can see. Somewhere out here '
      + 'are the tribes the Standard would raise. Not today: there is nothing here yet.',
  };
  pushLog(state, ARRIVALS[to] || `You have crossed into ${AREA_NAMES[to] || to}.`, 'quest');
  save(state);
  return ok({ state, area: to, at: landing });
}

/**
 * POST /api/boat/board — climb in, or climb out.
 *
 * One route for both, because from the player's side P is one key and the boat
 * is one thing. Boarding snaps you onto her; leaving puts you on the tile you
 * asked for, which the client has already checked is dry, empty land — and the
 * server checks again, because "the client said it was fine" is not a check.
 */
function routeBoatBoard(b, state, save) {
  const boat = boatOf(state);
  if (!boat.granted) return fail('you have no boat.');
  if (areaOf(state) !== AREAS.home) return fail('she is moored in the Home Block.');

  const pos = playerPosition(b, state);
  const bx = Number.isFinite(num(boat.x)) ? num(boat.x) : BOAT.x;
  const by = Number.isFinite(num(boat.y)) ? num(boat.y) : BOAT.y;

  if (!boat.riding) {
    // Climbing in: you have to be able to reach her.
    const dist = Math.max(Math.abs(pos.x - bx), Math.abs(pos.y - by));
    if (dist > 1) return fail(`the boat is at ${bx},${by} — walk to the water's edge beside her.`);
    boat.riding = true;
    boat.x = bx;
    boat.y = by;
    state.player.x = bx;
    state.player.y = by;
    pushLog(state, 'You step down into the boat.', 'gather');
    save(state);
    return ok({ state, riding: true, boat: { x: bx, y: by } });
  }

  // Climbing out. The client sends the shore tile it wants; it must be a real,
  // empty, walkable tile NEXT to the boat.
  const tx = Math.round(num(b.x) ?? NaN);
  const ty = Math.round(num(b.y) ?? NaN);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
    return fail('there is nowhere to step out onto — bring her alongside open ground.');
  }
  if (Math.max(Math.abs(tx - bx), Math.abs(ty - by)) !== 1) {
    return fail('you can only step out onto the bank right beside the boat.');
  }
  const occupied = tileOccupant(state, tx, ty);
  if (occupied) {
    return fail(`${tx},${ty} is taken by ${occupied.kind === 'building' ? 'the ' : 'a '}${occupied.name}.`);
  }
  boat.riding = false;
  boat.x = bx;
  boat.y = by;
  state.player.x = tx;
  state.player.y = ty;
  pushLog(state, 'You climb out onto the bank. The boat stays where you left her.', 'gather');
  save(state);
  return ok({ state, riding: false, boat: { x: bx, y: by }, at: { x: tx, y: ty } });
}

/** POST /api/npc/talk with vendor "wiseman". */
// ---------------------------------------------------- v7: the mountain
/**
 * THE REACHES' OWN STATE: what you have found, where the boulders are, and
 * whether the Warden still stands.
 *
 * A NOTE ON TRUST. The server has no terrain model — the world is generated in
 * the browser and always has been, which is why `/api/gather` is told what kind
 * of node it is aiming at. Boulder pushes are the same bargain: the client
 * knows what is solid, the server owns WHERE EVERY BOULDER IS and refuses
 * anything that is not a single orthogonal step from a boulder it already knows
 * about onto a tile no other boulder holds. That is the half of it worth
 * defending; a client that lies about a wall is only cheating itself out of a
 * puzzle.
 */
function reachesOf(state) {
  if (!isObj(state.reaches)) state.reaches = {};
  const r = state.reaches;
  if (!Array.isArray(r.gear)) r.gear = [];
  if (!isObj(r.boulders)) r.boulders = {};
  if (!isObj(r.warden)) r.warden = { beaten: false };
  // Every boulder starts where the design says it does, and stays wherever it
  // was last pushed. Seeded lazily so a save made before the mountain existed
  // walks into a fully-built one.
  for (const b of ALL_BOULDERS) {
    if (!isObj(r.boulders[b.key])) r.boulders[b.key] = { x: b.x, y: b.y };
  }
  return r;
}

/**
 * EVERY BOULDER ON EVERY MAP, keyed `area:id`.
 *
 * Elderwatch's barrels are the mountain's boulders in another coat, so they go
 * through the same routes and the same store — but two maps may both have a
 * boulder called `yard_a`, so the key carries the map.
 */
const ALL_BOULDERS = Object.freeze([
  ...Object.keys(AREA_PUZZLES).flatMap((area) =>
    bouldersFor(area).map((b) => ({ key: `${area}:${b.id}`, area, id: b.id, x: b.x, y: b.y }))),
  // ...and one set per floor of the Keep. Two floors may both have a boulder
  // called `cistern_a`, so the key carries the floor as well as the map.
  ...TOWER_FLOORS.flatMap((f) => (f.boulders || []).map((b) => ({
    key: `${AREAS.elderwatch}:f${f.n}:${b.id}`, area: AREAS.elderwatch, id: b.id, x: b.x, y: b.y,
  }))),
]);

function hasGear(state, id) {
  return reachesOf(state).gear.indexOf(id) !== -1;
}

/**
 * WHICH LOCKED DOORS HAVE BEEN OPENED, keyed `area:fN`.
 *
 * A door that a key opens BY BEING CARRIED is not a door the player ever opens
 * — you walk at it and it is simply not there. Bruno, 2026-09-06: "the brass
 * key should open the door at the top of the elderwatch tower, by using it with
 * E on the door at the top (which should open)." So turning the key is an act,
 * it happens once, and the door stays open afterwards: coming back to a door
 * you have already unlocked and having to unlock it again is worse than never
 * having locked it.
 */
function doorsOf(state) {
  if (!isObj(state.doors)) state.doors = {};
  return state.doors;
}

function doorKeyFor(area, floor) {
  return floor > 0 ? `${area}:f${floor}` : `${area}`;
}

/** The locked door that applies where the player is standing, or null. */
function lockFor(area, floor) {
  if (area === AREAS.elderwatch && floor > 0) {
    return (TOWER_FLOORS[floor - 1] || {}).lock || null;
  }
  return DOOR_KEYS[area] || null;
}

/**
 * POST /api/door/open — turn the key in the door you are facing.
 *
 * Refuses unless the door is really there, you are beside it, and you are
 * carrying what it wants. The client knows all three; the server owns whether
 * the door is now open, because "the door is open" is a fact about the save.
 */
function routeDoorOpen(b, state, save) {
  const area = areaOf(state);
  const floor = area === AREAS.elderwatch ? towerFloorOf(state) : 0;
  const lock = lockFor(area, floor);
  if (!lock) return fail('there is no locked door here.');

  const doors = doorsOf(state);
  const id = doorKeyFor(area, floor);
  if (doors[id]) return ok({ state, opened: true, already: true });

  const pos = playerPosition(b, state);
  if (Math.max(Math.abs(pos.x - lock.x), Math.abs(pos.y - lock.y)) > 1) {
    return fail(`the door is at ${lock.x},${lock.y} — you are at ${pos.x},${pos.y}.`);
  }
  const items = questItemsOf(state);
  if (!((num(items[lock.item]) ?? 0) > 0)) {
    const def = QUEST_ITEM_DEFS[lock.item] || { name: lock.item };
    return fail(`it is locked, and you are not carrying the ${def.name}.`);
  }

  doors[id] = true;
  const def = QUEST_ITEM_DEFS[lock.item] || { name: lock.item };
  pushLog(state, `The ${def.name} turns, and the door gives.`, 'quest');
  save(state);
  return ok({ state, opened: true, already: false, name: def.name });
}

/**
 * POST /api/switch/throw — throw a winch, and leave it thrown.
 *
 * Recorded in `state.doors` beside the locked doors, because from the save's
 * point of view they are the same fact: a way through that used to be shut and
 * now is not. A plate could not do this — a plate is held while something heavy
 * sits on it and shuts the instant you step off, which is no use for a gate you
 * want to walk out of.
 */
function routeSwitchThrow(b, state, save) {
  const area = areaOf(state);
  if (area !== AREAS.elderwatch || towerFloorOf(state) > 0) {
    return fail('there is nothing to throw here.');
  }
  const wanted = typeof b.id === 'string' ? b.id : '';
  const sw = ELDERWATCH_SWITCHES.find((x) => x.id === wanted);
  if (!sw) return fail(`"${wanted}" is not something this fort has.`);

  const doors = doorsOf(state);
  const id = `${area}:switch:${sw.id}`;
  if (doors[id]) return ok({ state, thrown: true, already: true, opens: sw.opens });

  const pos = playerPosition(b, state);
  if (Math.max(Math.abs(pos.x - sw.x), Math.abs(pos.y - sw.y)) > 1) {
    return fail(`the winch is at ${sw.x},${sw.y} — you are at ${pos.x},${pos.y}.`);
  }
  doors[id] = true;
  pushLog(state, sw.thrown, 'quest');
  save(state);
  return ok({ state, thrown: true, already: false, opens: sw.opens, text: sw.thrown });
}

/** POST /api/reaches/gear — pick up a piece of gear you are standing on. */
function routeReachesGear(b, state, save) {
  if (areaOf(state) !== AREAS.peaks) return fail('there is nothing of the mountain here.');
  const wanted = typeof b.gear === 'string' ? b.gear : '';
  const site = GEAR_SITES.find((g) => g.gear === wanted);
  if (!site) return fail(`"${wanted}" is not something the mountain has.`);

  const r = reachesOf(state);
  if (r.gear.indexOf(site.gear) !== -1) return fail('you already have it.');

  const pos = playerPosition(b, state);
  if (Math.max(Math.abs(pos.x - site.x), Math.abs(pos.y - site.y)) > 1) {
    return fail(`that lies at ${site.x},${site.y} — you are at ${pos.x},${pos.y}.`);
  }

  r.gear.push(site.gear);
  const def = REACHES_GEAR[site.gear];
  const xp = grantXp(state, REACHES_GEAR_XP[site.gear] || 0, `found the ${def.name}`);
  pushLog(state, def.found, 'quest');
  save(state);
  return ok({ state, gear: site.gear, name: def.name, blurb: def.blurb, xp });
}

/**
 * POST /api/reaches/push — shove a boulder one tile.
 *
 * The client has already decided the tile beyond is clear (it owns the
 * terrain); what is checked here is that a boulder is really where you say it
 * is, that the shove is one orthogonal tile, that you are standing on the far
 * side of it to push, and that nothing else is already sitting on the target.
 */
function routeReachesPush(b, state, save) {
  const area = areaOf(state);
  const floor = towerFloorOf(state);
  if (!AREA_PUZZLES[area] && floor === 0) return fail('there is nothing to push here.');
  const r = reachesOf(state);
  // Only the boulders on THIS floor of THIS map: the Keep has a set per floor
  // and they share their names.
  const mine = boulderScope(area, floor);
  const x = Math.round(num(b.x) ?? NaN);
  const y = Math.round(num(b.y) ?? NaN);
  const dx = Math.round(num(b.dx) ?? 0);
  const dy = Math.round(num(b.dy) ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('a push needs the boulder\'s x and y');
  if (Math.abs(dx) + Math.abs(dy) !== 1) return fail('a boulder moves one tile, and not diagonally');

  const entry = Object.entries(r.boulders)
    .find(([k, p]) => mine(k) && p && p.x === x && p.y === y);
  if (!entry) return fail(`there is no boulder at ${x},${y}.`);
  const [id, at] = entry;

  const pos = playerPosition(b, state);
  if (pos.x !== x - dx || pos.y !== y - dy) {
    return fail('you have to be behind a boulder to put your shoulder into it.');
  }

  const tx = x + dx;
  const ty = y + dy;
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return fail('it will not go over the edge.');
  const taken = Object.entries(r.boulders)
    .some(([bid, p]) => mine(bid) && bid !== id && p && p.x === tx && p.y === ty);
  if (taken) return fail('another boulder is already there.');

  at.x = tx;
  at.y = ty;
  save(state);
  return ok({ state, id, at: { x: tx, y: ty }, plates: platesHeld(state) });
}

/**
 * DOES THIS BOULDER KEY BELONG TO THIS ROOM? One rule, in one place.
 *
 * Ground level is `area:id` and a tower floor is `area:fN:id`, so a bare
 * `startsWith('elderwatch:')` matches BOTH — and `platesHeld` used exactly
 * that, which let a barrel two floors up hold a plate down in the bailey.
 * `routeReachesPush` had the `:f` guard and this did not; now neither writes
 * the rule itself.
 */
function boulderScope(area, floor) {
  const prefix = floor > 0 ? `${area}:f${floor}:` : `${area}:`;
  return (k) => k.indexOf(prefix) === 0 && (floor > 0 || k.indexOf(':f') === -1);
}

/** Every boulder that belongs to this room, and where it is. */
function bouldersHere(state, area, floor) {
  const mine = boulderScope(area, floor);
  return Object.entries(reachesOf(state).boulders).filter(([k]) => mine(k));
}

/** The furniture of the room you are in: a tower floor's, or the map's. */
function puzzleHere(area, floor) {
  if (floor > 0) {
    const f = TOWER_FLOORS[floor - 1] || {};
    return { boulders: f.boulders || [], plates: f.plates || [] };
  }
  return { boulders: bouldersFor(area), plates: platesFor(area) };
}

/** Which plates have a boulder on them right now. */
function platesHeld(state, area = areaOf(state)) {
  const floor = area === AREAS.elderwatch ? towerFloorOf(state) : 0;
  const here = bouldersHere(state, area, floor);
  const held = [];
  for (const p of puzzleHere(area, floor).plates) {
    if (here.some(([, bl]) => bl && bl.x === p.x && bl.y === p.y)) {
      held.push(p.id || `${p.x},${p.y}`);
    }
  }
  return held;
}

/**
 * PUT ONE ROOM'S BOULDERS BACK WHERE THEY STARTED.
 *
 * Used by being caught, and by arriving on a map. Sokoban's oldest rule is that
 * every push must be undoable; these are not — a barrel shoved against a wall
 * on the yard's one open row can never be shoved back, because there is nowhere
 * to stand behind it. A reset is what stands in for an undo, so the room has to
 * be genuinely restorable rather than restorable-if-a-watchman-happens-to-see-you.
 */
function resetRoom(state, area, floor) {
  const r = reachesOf(state);
  const prefix = floor > 0 ? `${area}:f${floor}:` : `${area}:`;
  for (const b of puzzleHere(area, floor).boulders) {
    r.boulders[`${prefix}${b.id}`] = { x: b.x, y: b.y };
  }
}

/**
 * EVERY MOVABLE ROCK ON A WHOLE MAP, BACK WHERE IT STARTED.
 *
 * Bruno, 2026-09-06: "when I leave the map block, like the reaches or
 * elderwatch, etc, the rocks you can move should reset to their original
 * positions." One call per map rather than per room, because a map is what the
 * player leaves — the Keep's four floors are inside Elderwatch and go back with
 * it, and the Warden's three are inside the Reaches and go back with those.
 *
 * `bouldersFor(peaks)` already joins the terrace puzzle and the Warden's room,
 * so the mountain needs no special case. Only POSITIONS reset: gear you found
 * and a Warden you broke are yours for good.
 */
function resetMapRocks(state, area) {
  resetRoom(state, area, 0);
  if (area === AREAS.elderwatch) {
    for (const f of TOWER_FLOORS) resetRoom(state, area, f.n);
  }
}

/**
 * POST /api/reaches/reset — the Warden caught you. Every boulder in ITS room
 * goes back; the terrace puzzle below is left alone, because losing a room
 * should cost you that room and nothing else.
 */
function routeReachesReset(b, state, save) {
  const r = reachesOf(state);
  const area = areaOf(state);
  const floor = area === AREAS.elderwatch ? towerFloorOf(state) : 0;
  // THE ROOM YOU ARE ACTUALLY IN. Caught on the Cistern floor, this used to put
  // the BAILEY's barrels back and leave the Cistern's exactly where they were —
  // so a barrel shoved into that floor's one dead end stayed there for the life
  // of the save, and the gate it was meant to open could never be opened again.
  if (area === AREAS.elderwatch) {
    resetRoom(state, area, floor);
    save(state);
    const door = floor > 0
      ? (TOWER_FLOORS[floor - 1] || {}).door
      : AREA_PUZZLES[area].door;
    return ok({ state, at: { ...door } });
  }
  // The mountain: the Warden's three go back and the terrace puzzle below is
  // left alone, because losing a room should cost you that room and nothing else.
  for (const boulder of WARDEN.boulders) {
    r.boulders[`${AREAS.peaks}:${boulder.id}`] = { x: boulder.x, y: boulder.y };
  }
  save(state);
  return ok({ state, at: { x: WARDEN.doorX, y: WARDEN.doorY } });
}

/**
 * POST /api/reaches/warden — all three plates are held; the Warden breaks.
 *
 * The condition is re-derived here from the boulder positions the server
 * itself owns, so "I beat it" is not something a client can simply assert.
 */
function routeReachesWarden(b, state, save) {
  if (areaOf(state) !== AREAS.peaks) return fail('the Warden is on the summit.');
  const r = reachesOf(state);
  if (r.warden.beaten) return ok({ state, beaten: true, xp: 0 });

  const held = new Set(platesHeld(state, AREAS.peaks));
  const need = WARDEN.plates.map((p) => p.id);
  const missing = need.filter((id) => !held.has(id));
  if (missing.length) {
    return fail(`${missing.length} of the three plates is still unheld.`);
  }

  r.warden.beaten = true;
  const xp = grantXp(state, WARDEN.xp, 'the Rime Warden was broken');
  pushLog(state, 'The Rime Warden comes apart in the wind. The way to the cave is open.', 'quest');
  save(state);
  return ok({ state, beaten: true, xp });
}

/** Which floor of the keep the scholar is on, 0 for the bailey. */
function towerFloorOf(state) {
  if (!isObj(state.tower)) state.tower = { floor: 0 };
  const f = Math.round(num(state.tower.floor) ?? 0);
  return f > 0 && f <= TOWER.floors ? f : 0;
}

/**
 * POST /api/tower/climb — up or down one floor of the Keep.
 *
 * The client raises this when she steps onto a stair; the server owns which
 * floor she is on and where she lands. Landing is the OTHER floor's opposite
 * stair, so a climb reads as continuous — you come up where you would have come
 * up, not in the middle of the room.
 */
function routeTowerClimb(b, state, save) {
  if (areaOf(state) !== AREAS.elderwatch) return fail('there is no keep here to climb.');
  const dir = num(b.dir) >= 0 ? 1 : -1;
  const from = towerFloorOf(state);
  const to = from + dir;
  if (to < 0 || to > TOWER.floors) return fail('the stair goes no further.');

  if (to === 0) {
    state.tower.floor = 0;
    state.player.x = TOWER.doorX;
    state.player.y = TOWER.doorY;
    pushLog(state, 'You come back down into the bailey.', 'quest');
    save(state);
    return ok({ state, floor: 0, at: { x: state.player.x, y: state.player.y } });
  }

  const def = TOWER_FLOORS[to - 1];
  // Arriving from below you stand on that floor's DOWN stair; from above, on
  // its UP stair. Either way you arrive on the step you would have arrived on.
  const at = dir > 0 ? def.down : def.up;
  state.tower.floor = to;
  if (at) {
    state.player.x = at.x;
    state.player.y = at.y;
  }
  if (from === 0) pushLog(state, 'The door of the Keep gives, and the stair turns away above you.', 'quest');
  pushLog(state, `${def.name} — floor ${to} of the Keep.`, 'quest');
  save(state);
  return ok({ state, floor: to, name: def.name, at: { x: state.player.x, y: state.player.y } });
}

/**
 * POST /api/quest/take/**
 * POST /api/quest/take — lift a quest item off the ground.
 *
 * The same bargain as everything else out in the world: the client knows the
 * terrain and raises the prompt, the server owns WHETHER YOU MAY HAVE IT. It
 * checks the map, that you are standing on the thing, that you have not already
 * taken it, and — for the Standard — that you carry the key that opens the door
 * in front of it. A locked door is a client-side fact; the prerequisite behind
 * it is not.
 */
function routeQuestTake(b, state, save) {
  const area = areaOf(state);
  const floor = towerFloorOf(state);
  // Elderwatch's two are up the Keep, one floor each; everywhere else they lie
  // on the map.
  const sites = questSitesFor(area, floor);
  const wanted = typeof b.item === 'string' ? b.item : '';
  const site = sites.find((q) => q.item === wanted);
  if (!site) return fail(`there is no ${wanted || 'such thing'} to be had here.`);

  const items = questItemsOf(state);
  if ((num(items[site.item]) ?? 0) > 0) return fail('you already have it.');

  const pos = playerPosition(b, state);
  if (Math.max(Math.abs(pos.x - site.x), Math.abs(pos.y - site.y)) > 1) {
    return fail(`that is at ${site.x},${site.y} — you are at ${pos.x},${pos.y}.`);
  }
  if (site.needs && (num(items[site.needs]) ?? 0) < 1) {
    const need = QUEST_ITEM_DEFS[site.needs] || { name: site.needs };
    return fail(`the way to it is locked — you need the ${need.name}.`);
  }

  items[site.item] = 1;
  const def = QUEST_ITEM_DEFS[site.item] || { name: site.item };
  const xp = site.xp ? completeQuest(state, site.xp, `took the ${def.name}`) : 0;
  pushLog(state, site.found || `You take the ${def.name}.`, 'quest');

  // THE STANDARD IS THE END OF THE ERRAND. It carries its own scene and its own
  // objective, because taking it is the moment the Wise Man was pointing at.
  const SCENES = { ashen_standard: STANDARD_DIALOGUE, ranons_ring: RING_DIALOGUE };
  const scene = SCENES[site.item] || null;
  if (scene) pushLog(state, `New objective — ${scene.objective}`, 'quest');
  save(state);
  return ok({
    state,
    item: site.item,
    name: def.name,
    xp,
    dialogue: scene
      ? { stage: 'opening', name: scene.name, lines: scene.lines.slice(), objective: scene.objective }
      : null,
  });
}

function routeWiseManTalk(b, state, save) {
  if (areaOf(state) !== AREAS.peaks) return fail('he is not here. He is on the mountain.');
  const pos = playerPosition(b, state);
  const dist = Math.max(Math.abs(pos.x - WISE_MAN.x), Math.abs(pos.y - WISE_MAN.y));
  if (dist > 2) {
    return fail(`the Wise Man sits at the back of the summit cave, at ${WISE_MAN.x},${WISE_MAN.y} — you are at ${pos.x},${pos.y}.`);
  }
  // The cave is BEHIND the Warden. Checked here as well as by the door, because
  // a rule only the client knows is not a rule.
  if (!reachesOf(state).warden.beaten) {
    return fail('the Rime Warden still stands between you and that cave.');
  }

  const w = wiseManOf(state);
  const first = !w.spoken;
  let xp = 0;
  if (first) {
    w.found = true;
    w.spoken = true;
    // THE 400 IS PAID HERE, not by the Herald. Being told about a journey is
    // not making it; this is the arrival it was always reserved for.
    xp = completeQuest(state, 'wise_man_found', 'the Wise Man of the mountain has been found');
    pushLog(state, `New objective — ${WISE_MAN_DIALOGUE.objective}`, 'quest');
    save(state);
    return ok({
      state,
      vendor: 'wiseman',
      dialogue: {
        stage: 'opening',
        name: WISE_MAN_DIALOGUE.name,
        lines: WISE_MAN_DIALOGUE.lines.slice(),
        objective: WISE_MAN_DIALOGUE.objective,
      },
      unlocked: true,
      justOpened: false,
      xp,
    });
  }

  /**
   * THE SECOND TELLING, AND IT IS WHAT OPENS THE ROAD WEST.
   *
   * He asked for the ledger and the signet, not the standard — so the check is
   * the Codex and the Ring, exactly the two things he named. Bringing them back
   * is what earns the farlands: the map was reachable the moment it was built,
   * which made it the one journey in this game nobody had to be sent on.
   */
  const items = questItemsOf(state);
  const hasBoth = (num(items.codex) ?? 0) > 0 && (num(items.ranons_ring) ?? 0) > 0;
  if (hasBoth && !w.returned) {
    w.returned = true;
    xp = completeQuest(state, 'wise_man_returned',
      'the Wise Man has read the Codex, and the road west is open');
    pushLog(state, `New objective — ${WISE_MAN_RETURN_DIALOGUE.objective}`, 'quest');
    save(state);
    return ok({
      state,
      vendor: 'wiseman',
      dialogue: {
        stage: 'opening',
        name: WISE_MAN_RETURN_DIALOGUE.name,
        lines: WISE_MAN_RETURN_DIALOGUE.lines.slice(),
        objective: WISE_MAN_RETURN_DIALOGUE.objective,
      },
      unlocked: true,
      justOpened: false,
      xp,
    });
  }

  // Everything after that is him repeating himself, which is what he is for.
  const lines = w.returned
    ? [
      '"West," he says, without turning round. "Past the Home Block, past the woodsman, '
        + 'out onto the burnt ground."',
      '"Show them the ring. And do not lose it before you get there."',
    ]
    : [
      '"Elderwatch," he says, without turning round. "The old road east, past the pass. '
        + 'The Hall of Keeping."',
      '"The standard, yes. But the BOOK and the RING, and bring those to me. It will '
        + 'still be there tomorrow — so will the garrison."',
    ];
  return ok({
    state,
    vendor: 'wiseman',
    dialogue: { stage: 'open', name: WISE_MAN_DIALOGUE.name, lines, objective: null },
    unlocked: true,
    justOpened: false,
    xp,
  });
}

function routeShopSell(b, state, save) {
  // Who is buying decides where you have to be standing. The Woodsman's better
  // price is only available in his cave — that is what you walked out there for.
  const vendor = (b.vendor === 'woodsman' || b.vendor === 'stonemason') ? b.vendor : 'merchant';
  const refusal = requireRole(state, b, vendor === 'merchant' ? 'shop' : vendor);
  if (refusal) return refusal;

  // THE LOCK, enforced on the route rather than in the UI. Both outlanders
  // start closed; the dialogue explains the condition, this refuses until it is
  // met. Note it is checked AFTER the location gate, so a player standing in
  // the wrong place is told about the walk before being told about the lock.
  if (vendor !== 'merchant' && !vendorUnlocked(state, vendor)) {
    const st = lockStatus(state, vendor);
    const who = VENDOR_NAMES[vendor] || vendor;
    if (st.kind === 'level') {
      return fail(
        `${who} will not buy from you yet — he wants level ${st.need} and you are ${st.level}. ` +
        'Talk to him (E) to hear it from him.'
      );
    }
    return fail(
      `${who} will not buy from you yet — he is waiting on the ${st.itemName || 'key'}. ` +
      'Talk to him (E) to hear what he wants.'
    );
  }

  const res = Shops.sell(state, b.materialId, b.qty, vendor);
  if (!res.ok) return fail(res.error);

  // Selling is experience: you learn a trade by doing it. Per UNIT, so one sale
  // of twenty pays the same as twenty sales of one — anything else rewards
  // clicking rather than gathering.
  const soldQty = Math.max(0, Math.round(num(res.qty) ?? 0));
  const gained = grantXp(state, soldQty * SELL_XP_PER_UNIT, 'trade experience');

  save(state);
  return ok({
    state, earned: res.earned, currency: res.currency, vendor: res.vendor,
    sold: { materialId: res.materialId, qty: res.qty },
    // The bundle the sale actually used, and what came back. `qty` is what was
    // TAKEN, not what was offered — whole lots only, and the remainder stays in
    // the pack, so the two numbers differ and the UI has to be able to say so.
    qty: res.qty, offered: res.offered, kept: res.kept,
    per: res.per, pay: res.pay, bundles: res.bundles,
    xp: gained.xp, levelsGained: gained.levelsGained, level: gained.level,
  });
}

function routeExchange(b, state, save) {
  // The Exchange is his own building now, not a counter at the Market.
  const refusal = requireRole(state, b, 'exchange');
  if (refusal) return refusal;

  const res = Shops.exchange(state, b.from, b.to, b.amount);
  if (!res.ok) return fail(res.error);
  save(state);
  return ok({ state, received: res.received, spent: res.spent, lost: res.lost, from: res.from, to: res.to, amount: res.amount });
}

// ---------------------------------------------------------------- import

function routeTasksImport(b, state, save) {
  if (typeof b.text !== 'string') return fail('import needs a "text" field containing the pasted list');

  const result = importTasks(b.text, typeof b.format === 'string' ? b.format : undefined);
  if (!result.ok) return fail(result.error || 'nothing could be read from that text');

  if (!Array.isArray(state.tasks)) state.tasks = [];
  const created = [];
  for (const draft of result.tasks) {
    const task = {
      id: uid('task'),
      title: draft.title,
      subject: SUBJECT_IDS.includes(draft.subject) ? draft.subject : 'other',
      workType: WORK_TYPE_IDS.includes(draft.workType) ? draft.workType : 'project',
      difficulty: clamp(Math.round(num(draft.difficulty) ?? 3), 1, 5),
      estMinutes: clamp(Math.round(num(draft.estMinutes) ?? 60), 5, 1440),
      status: 'todo',
      minutesLogged: 0,
      rank: null,
      dueInDays: draft.dueInDays === null || draft.dueInDays === undefined
        ? null
        : clamp(Math.round(num(draft.dueInDays) ?? 0), 0, 365),
      completedAt: null,
      importedAt: Date.now(),
    };
    state.tasks.push(task);
    created.push(task);
  }

  if (created.length) {
    pushLog(
      state,
      `Imported ${created.length} quest${created.length === 1 ? '' : 's'} from ${result.format} text` +
        (result.skipped.length ? ` (${result.skipped.length} line${result.skipped.length === 1 ? '' : 's'} skipped)` : ''),
      'task'
    );
    save(state);
  }

  return ok({
    state,
    imported: created.length,
    tasks: created,
    skipped: result.skipped,
    format: result.format,
  });
}

// ---------------------------------------------------------------- save slots

/**
 * GET-ish and POST-ish in one: an empty body reads, a `settings` object writes.
 *
 * The whole object is replaced rather than merged, because the client holds the
 * complete set and a merge would make it impossible to ever turn a flag off by
 * omission. Values are not interpreted here — the page owns what a setting
 * MEANS; the server owns only that it survives a restart.
 */
function routeSettings(b) {
  if (isObj(b) && isObj(b.settings)) {
    const clean = {};
    for (const [k, v] of Object.entries(b.settings)) {
      if (typeof k !== 'string' || k.length > 40) continue;
      if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
        clean[k] = typeof v === 'string' ? v.slice(0, 200) : v;
      }
    }
    writeStoredSettings(clean);
    return ok({ settings: clean, saved: true });
  }
  return ok({ settings: readStoredSettings(), saved: false });
}

function routeSlotsList(state, save) {
  save(state); // flush so the listing shows current level / playtime
  const activeSlot = (state.meta && state.meta.slot) || 1;
  return ok({
    slots: listSlots(),
    activeSlot,
    // Where the saves actually live, so the UI can show the folder path.
    dataDir: DATA_DIR,
    activeFolder: slotDir(activeSlot),
  });
}

/**
 * NOTE for the integrator: every slot route that changes which save is live
 * returns the NEW state as json.state. server.js already does
 * `if (out.json && out.json.state) state = out.json.state`, so the in-memory
 * reference is swapped for free — but the client must replace its whole state
 * too, and the world/UI must re-render from scratch.
 */
function routeSlotsSwitch(b, state) {
  const res = switchSlot(state, b.slot);
  if (!res.ok) return fail(res.error);
  refreshMaxEnergy(res.state);
  pushLog(res.state, `Loaded "${res.state.meta.name}".`, 'info');
  return ok({ state: res.state, slots: res.slots });
}

function routeSlotsCreate(b, state) {
  const res = createSlot(state, b.slot, b.name);
  if (!res.ok) return fail(res.error);
  refreshMaxEnergy(res.state);
  return ok({ state: res.state, slots: res.slots });
}

function routeSlotsDelete(b, state) {
  const res = deleteSlot(state, b.slot);
  if (!res.ok) return fail(res.error);
  // deleting the ACTIVE slot hands back a different live state
  if (res.state) {
    refreshMaxEnergy(res.state);
    return ok({ state: res.state, slots: res.slots, switchedTo: res.switchedTo });
  }
  return ok({ slots: res.slots });
}

function routeSlotsRename(b, state) {
  const res = renameSlot(state, b.slot, b.name);
  if (!res.ok) return fail(res.error);
  if (res.state) return ok({ state: res.state, slots: res.slots });
  return ok({ slots: res.slots });
}

// =========================================================================
// v3 ROUTES
// =========================================================================

// ---------------------------------------------------------------- interact

/**
 * POST /api/interact { x, y }
 * "What can I do standing here?" The client sends the player's tile; we answer
 * with the roles reachable from it, a ready-made prompt line per adjacent
 * building, the four gates, and whatever is growing under the player's feet.
 * This is the replacement for the dock buttons v2 had.
 */
function routeInteract(b, state, save) {
  const pos = playerPosition(b, state);
  // Standing somewhere is not a mutation, but it IS the player's position, so
  // keep the persisted one in step — the world already commits moves anyway.
  if (pos.fromClient) {
    state.player.x = pos.x;
    state.player.y = pos.y;
    save(state);
  }
  const here = placeReport(state, pos.x, pos.y);
  return ok({
    ...here,
    gates: gateStatus(state),
    saplings: Math.max(0, num(state.player.saplings) ?? 0),
    seedpods: Math.max(0, num(materialsOf(state).seedpod) ?? 0),
  });
}

// ---------------------------------------------------------------- planting

/**
 * POST /api/plant { x, y, source?, tile? }
 *
 * `source` is 'sapling' (bought at the Shop) or 'seedpod' (a lucky tree drop —
 * a seedpod plants exactly like a sapling and costs nothing, which is the
 * whole reason it feels good to find one).
 *
 * `tile` is what the CLIENT says is on the ground. Terrain is trusted, the same
 * boundary /api/gather already draws; everything with a cost — stock, occupancy,
 * bounds, duplicates — is checked here.
 */
function routePlant(b, state, save) {
  const x = num(b.x);
  const y = num(b.y);
  if (x === null || y === null) return fail('planting needs numeric x and y');
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) {
    return fail(`${tx},${ty} is outside the Home Block — you can only plant on your own land`);
  }

  const key = tileKey(areaOf(state), tx, ty);
  const harvested = isObj(state.harvested) ? state.harvested[key] : null;
  const onStump = isObj(harvested) && harvested.felled;

  // 0. is this ground anyone else needs? THE SERVER DECIDES, so a client that
  //    offered the prompt anyway still cannot plant here.
  const forbidden = plantingBlockedAt(tx, ty, state.buildings, footprintOf);
  if (forbidden === 'building') {
    return fail(
      `${tx},${ty} is too close to a wall — a grown tree is a solid tile and trees do not `
      + 'come back, so one here would block a doorway for good. Leave a tile clear.'
    );
  }
  if (forbidden === 'npc') {
    return fail(
      `somebody is standing at ${tx},${ty} — leave the ground beside a trader clear, `
      + 'or you will not be able to reach him once it grows.'
    );
  }

  // 1. is the ground free?
  const occupied = tileOccupant(state, tx, ty);
  if (occupied) {
    return fail(
      occupied.kind === 'planting'
        ? `something is already growing at ${tx},${ty} — a ${occupied.name}`
        : `${tx},${ty} is taken by ${occupied.kind === 'building' ? 'the ' : 'a '}${occupied.name}`
    );
  }

  // 2. is it plantable ground? A stump always is; otherwise the client must
  //    say the tile is grass.
  const tile = typeof b.tile === 'string' ? b.tile.trim().toLowerCase() : '';
  if (!onStump) {
    if (!tile) {
      return fail(`tell me what is on the ground at ${tx},${ty} — saplings only take in open grass or on a stump`);
    }
    if (!PLANTABLE_TILES.includes(tile)) {
      return fail(`nothing will take root in ${tile} — plant on open grass, or on the stump of a tree you felled`);
    }
  }

  // 3. are seeds actually IN YOUR HANDS? Carrying them is not intending to
  //    plant — that is why the prompt used to appear on every patch of grass.
  if (!seedEquipped(state)) {
    const stowed = stowedRef(state);
    if (stowed && stowed.kind === 'seed') {
      return fail(
        `your saplings are in slot ${stowedSlotNumber(state)} — press ${stowedSlotNumber(state)} to take them out`
      );
    }
    return fail('you are not holding any seeds — open the Bag (Tab) and equip saplings to a slot first');
  }

  // 4. do you have something to plant?
  const wanted = typeof b.source === 'string' ? b.source.toLowerCase() : '';
  const mats = materialsOf(state);
  const saplings = Math.max(0, num(state.player.saplings) ?? 0);
  const seedpods = Math.max(0, num(mats.seedpod) ?? 0);

  let source = null;
  if (wanted === 'seedpod') {
    if (seedpods < 1) return fail('you have no seedpods — they fall from felled trees, about one in every sixteen');
    source = 'seedpod';
  } else if (wanted === 'sapling') {
    if (saplings < 1) return fail('you have no saplings — the Wandering Merchant sells them at the Trading Post');
  source = 'sapling';
  } else if (saplings > 0) {
    source = 'sapling';
  } else if (seedpods > 0) {
    source = 'seedpod';
  } else {
    return fail(
      'you have nothing to plant — buy a sapling at the Shop, or fell a tree and hope for a seedpod'
    );
  }

  // ---- all checks passed ------------------------------------------------
  if (source === 'seedpod') mats.seedpod = seedpods - 1;
  else state.player.saplings = saplings - 1;

  const now = Date.now();
  const planting = { plantedAt: now, stage: SAPLING_STAGES[0].id, source, boostMinutes: 0 };
  plantings(state)[key] = planting;
  // The stump is now a planting; drop the harvested record so the tile reads
  // as growing ground rather than as a felled tree.
  if (onStump && isObj(state.harvested)) delete state.harvested[key];

  bumpLifetime(state, 'saplingsPlanted', 1);
  const view = plantingView(key, planting, now, areaOf(state));
  pushLog(
    state,
    `Planted a ${source === 'seedpod' ? 'seedpod' : 'sapling'} at ${tx},${ty}. ` +
    `A mature tree in ${humanDuration(view.msRemaining)}.`,
    'gather'
  );

  save(state);
  return ok({
    state,
    planting: view,
    saplings: Math.max(0, num(state.player.saplings) ?? 0),
    seedpods: Math.max(0, num(mats.seedpod) ?? 0),
  });
}

// ---------------------------------------------------------------- gadgets

function gadgetView(state) {
  const bag = gadgetBag(state);
  const cd = cooldowns(state);
  const now = Date.now();
  return GADGET_IDS.map((id) => {
    const def = GADGETS[id];
    const readyAt = num(cd[id]) ?? 0;
    const msLeft = Math.max(0, readyAt - now);
    return {
      id,
      name: def.name,
      desc: def.desc,
      owned: Math.max(0, num(bag[id]) ?? 0),
      cooldownMs: def.cooldownMs,
      readyAt: readyAt || null,
      msLeft,
      ready: msLeft <= 0,
      readyIn: msLeft > 0 ? humanDuration(msLeft) : null,
      effect: def.effect,
      recipeId: (getRecipeFor('gadget', id) || {}).id || null,
    };
  });
}

/**
 * POST /api/gadget/use { gadgetId, x?, y? }
 *
 * Anything purely visual (the lantern's reveal, the compass marker) is answered
 * with DATA, not with a render: the server has no canvas and does not own the
 * tile map, so it hands the client the numbers and the exclusion set and lets
 * the world draw it.
 */
function routeGadgetUse(b, state, save) {
  const gadgetId = typeof b.gadgetId === 'string' ? b.gadgetId : '';
  if (!gadgetId) return fail('gadgetId is required');
  if (!GADGET_IDS.includes(gadgetId)) {
    return fail(`there is no gadget called "${gadgetId}" — you have ${GADGET_IDS.join(', ')} to choose from`);
  }
  const def = GADGETS[gadgetId];
  const bag = gadgetBag(state);
  if ((num(bag[gadgetId]) ?? 0) < 1) {
    const recipe = getRecipeFor('gadget', gadgetId);
    return fail(
      `you do not have ${aOrAn(def.name)}` +
      (recipe ? ` — craft one at a house (${describeCost(recipe)})` : '')
    );
  }

  const cd = cooldowns(state);
  const now = Date.now();
  const readyAt = num(cd[gadgetId]) ?? 0;
  if (readyAt > now) {
    return fail(`the ${def.name} is still spent — ready again in ${humanDuration(readyAt - now)}`);
  }

  const eff = effects(state);
  const effect = def.effect || {};
  let result = null;

  switch (effect.kind) {
    case 'reveal': {
      const until = now + (num(effect.durationMs) ?? 60000);
      eff.revealUntil = until;
      result = {
        kind: 'reveal',
        radius: num(effect.radius) ?? 12,
        durationMs: num(effect.durationMs) ?? 60000,
        until,
        origin: { x: num(state.player.x) ?? 0, y: num(state.player.y) ?? 0 },
        note: 'light every resource node within the radius until `until`',
      };
      break;
    }

    case 'markTree': {
      // The server does not hold the tile map, so it cannot name a tree. What
      // it CAN do authoritatively is say which tiles are no longer trees: every
      // felled stump, and every planting that is not yet mature. The client
      // marks the nearest tree tile that is not in these sets.
      const stumps = [];
      for (const [k, v] of Object.entries(isObj(state.harvested) ? state.harvested : {})) {
        if (isObj(v) && v.felled) stumps.push(k);
      }
      const immature = plantingList(state, now).filter((p) => !p.mature).map((p) => p.key);
      const mature = plantingList(state, now).filter((p) => p.mature).map((p) => p.key);
      const until = now + (num(effect.durationMs) ?? 60000);
      eff.markUntil = until;
      result = {
        kind: 'markTree',
        from: { x: num(state.player.x) ?? 0, y: num(state.player.y) ?? 0 },
        excludeTiles: stumps.concat(immature),
        matureTiles: mature,
        until,
        note: 'mark the nearest tree tile whose "x,y" key is not in excludeTiles; matureTiles also count as trees',
      };
      break;
    }

    case 'growth': {
      const tx = num(b.x);
      const ty = num(b.y);
      if (tx === null || ty === null) {
        return fail(`the ${def.name} needs a target — stand by a sapling and give me its x and y`);
      }
      const key = tileKey(areaOf(state), tx, ty);
      const planting = plantings(state)[key];
      if (!isObj(planting)) return fail(`nothing is planted at ${key} — the ${def.name} has nothing to water`);
      const before = growthOf(planting, now);
      if (before.mature) return fail(`that one is already a mature tree — save the water for a younger one`);
      planting.boostMinutes = Math.max(0, num(planting.boostMinutes) ?? 0) + (num(effect.minutes) ?? 0);
      const after = growthOf(planting, now);
      result = {
        kind: 'growth',
        minutes: num(effect.minutes) ?? 0,
        planting: plantingView(key, planting, now, areaOf(state)),
        from: before.stage,
        to: after.stage,
        note: after.stage !== before.stage
          ? `it came on from ${before.stageLabel} to ${after.stageLabel}`
          : `${humanDuration(after.msRemaining)} left`,
      };
      break;
    }

    case 'permit': {
      const today = new Date().toISOString().slice(0, 10);
      if (effect.oncePerDay && eff.craftPermitDay === today && (num(eff.craftPermits) ?? 0) <= 0) {
        return fail(`the ${def.name} has already been unfolded today — it holds one craft a day`);
      }
      eff.craftPermitDay = today;
      eff.craftPermits = (num(eff.craftPermits) ?? 0) + (num(effect.uses) ?? 1);
      result = {
        kind: 'permit',
        permit: effect.permit || 'craft',
        uses: eff.craftPermits,
        note: `you can make ${eff.craftPermits} craft${eff.craftPermits === 1 ? '' : 's'} away from a house`,
      };
      break;
    }

    case 'buff': {
      eff.studyMult = num(effect.value) ?? 1.25;
      eff.studyMultUses = num(effect.uses) ?? 1;
      result = {
        kind: 'buff',
        buff: effect.buff || 'studyMult',
        value: eff.studyMult,
        uses: eff.studyMultUses,
        note: `your next study payout pays ×${eff.studyMult.toFixed(2)}`,
      };
      break;
    }

    case 'survey': {
      const gates = gateStatus(state);
      const locked = gates.filter((g) => !g.unlocked);
      result = {
        kind: 'survey',
        gates,
        closest: locked.length
          ? locked
            .slice()
            .sort((a, c) => totalRemaining(a) - totalRemaining(c))[0].id
          : null,
        note: locked.length ? 'the glass reads every seam at once' : 'every gate you can see is already open',
      };
      break;
    }

    default:
      return fail(`the ${def.name} does not know what to do — its effect "${effect.kind}" is not implemented`);
  }

  cd[gadgetId] = now + (num(def.cooldownMs) ?? 0);
  if (def.consumed) bag[gadgetId] = Math.max(0, (num(bag[gadgetId]) ?? 0) - 1);

  pushLog(state, `Used the ${def.name} — ${result.note}.`, 'gadget');
  save(state);
  return ok({
    state,
    used: { gadgetId, name: def.name, readyAt: cd[gadgetId], cooldownMs: def.cooldownMs },
    effect: result,
    gadgets: gadgetView(state),
  });
}

/** Sort key for "which locked gate is closest" — normalised, not absolute. */
function totalRemaining(gate) {
  let sum = 0;
  for (const p of gate.progress) {
    if (p.done || p.need <= 0) continue;
    sum += p.remaining / p.need;
  }
  return sum;
}

/** "2 Ironwood, 40 focus" — for a refusal that has to name a price. */
function describeCost(recipe) {
  const parts = [];
  for (const [id, qty] of Object.entries(recipe.materials || {})) {
    parts.push(`${qty} ${materialName(id)}`);
  }
  for (const c of CURRENCY_IDS) {
    const v = num((recipe.coins || {})[c]) ?? 0;
    if (v > 0) parts.push(`${v} ${c}`);
  }
  return parts.join(', ') || 'free';
}

// ---------------------------------------------------------------- blocks

function blockView(state) {
  const bag = blockBag(state);
  return BLOCK_IDS.map((id) => {
    const def = BLOCKS[id];
    const recipe = getRecipeFor('block', id);
    return {
      id,
      name: def.name,
      desc: def.desc,
      color: def.color,
      solid: Boolean(def.solid),
      label: Boolean(def.label),
      owned: Math.max(0, num(bag[id]) ?? 0),
      recipeId: recipe ? recipe.id : null,
      batch: recipe ? outputQtyOf(recipe) : 1,
      cost: recipe ? { materials: recipe.materials || {}, coins: recipe.coins || {} } : null,
    };
  });
}

/** Tiles the client may name that a block cannot stand on. */
const UNBUILDABLE_TILES = Object.freeze(['water', 'tree', String(TILE_TYPES.water), String(TILE_TYPES.tree)]);

/**
 * POST /api/block/place { blockId, x, y, label? }
 * Blocks are constructive only — they carry no bonus of any kind and nothing
 * in economy.js will ever read them.
 */
function routeBlockPlace(b, state, save) {
  const blockId = typeof b.blockId === 'string' ? b.blockId : '';
  if (!blockId) return fail('blockId is required');
  if (!BLOCK_IDS.includes(blockId)) {
    return fail(`there is no block called "${blockId}" — you can place ${BLOCK_IDS.join(', ')}`);
  }
  const def = BLOCKS[blockId];

  const x = num(b.x);
  const y = num(b.y);
  if (x === null || y === null) return fail('placing a block needs numeric x and y');
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) {
    return fail(`${tx},${ty} is outside the Home Block`);
  }

  const bag = blockBag(state);
  const owned = Math.max(0, num(bag[blockId]) ?? 0);
  if (owned < 1) {
    const recipe = getRecipeFor('block', blockId);
    return fail(
      `you have no ${def.name} left` +
      (recipe ? ` — a batch of ${outputQtyOf(recipe)} costs ${describeCost(recipe)} at a house` : '')
    );
  }

  const occupied = tileOccupant(state, tx, ty);
  if (occupied) {
    return fail(
      occupied.kind === 'block'
        ? `there is already a ${occupied.name} at ${tx},${ty} — take it away first`
        : `${tx},${ty} is taken by ${occupied.kind === 'building' ? 'the ' : 'a '}${occupied.name}`
    );
  }

  const tile = typeof b.tile === 'string' ? b.tile.trim().toLowerCase() : '';
  if (tile && UNBUILDABLE_TILES.includes(tile)) {
    return fail(`a ${def.name} will not stand in ${tile} — pick solid ground`);
  }

  const key = tileKey(areaOf(state), tx, ty);
  const entry = { blockId, placedAt: Date.now() };
  if (def.label && typeof b.label === 'string' && b.label.trim()) {
    entry.label = b.label.trim().slice(0, 40);
  }
  placedBlocks(state)[key] = entry;
  bag[blockId] = owned - 1;
  bumpLifetime(state, 'blocksPlaced', 1);

  pushLog(state, `Placed a ${def.name} at ${tx},${ty}.`, 'build');
  save(state);
  return ok({
    state,
    placed: { key, x: tx, y: ty, ...entry, name: def.name, solid: Boolean(def.solid), color: def.color },
    remaining: bag[blockId],
  });
}

/**
 * POST /api/block/remove { x, y }
 * Refunds BLOCK_REFUND_RATE of what the block cost. Because a single block can
 * cost a fraction of a material, the refund goes through the fractional bank —
 * nothing is lost to rounding, it just arrives a block or two later.
 */
function routeBlockRemove(b, state, save) {
  const x = num(b.x);
  const y = num(b.y);
  if (x === null || y === null) return fail('removing a block needs numeric x and y');
  const tx = Math.round(x);
  const ty = Math.round(y);
  const key = tileKey(areaOf(state), tx, ty);

  const placed = placedBlocks(state)[key];
  if (!isObj(placed)) return fail(`there is nothing of yours to take away at ${tx},${ty}`);
  const def = BLOCKS[placed.blockId];
  if (!def) {
    delete placedBlocks(state)[key];
    save(state);
    return ok({ state, removed: { key, x: tx, y: ty, blockId: placed.blockId }, refund: { materials: {}, coins: {} } });
  }

  const recipe = getRecipeFor('block', placed.blockId);
  const unit = recipe ? unitCostOf(recipe) : { materials: {}, coins: {} };
  const matFrac = {};
  const coinFrac = {};
  for (const [id, amt] of Object.entries(unit.materials)) matFrac[id] = amt * BLOCK_REFUND_RATE;
  for (const [id, amt] of Object.entries(unit.coins)) coinFrac[id] = amt * BLOCK_REFUND_RATE;
  const refund = creditFractional(state, matFrac, coinFrac);

  delete placedBlocks(state)[key];

  const refundText = Object.entries(refund.materials)
    .map(([id, q]) => `${q} ${materialName(id)}`)
    .concat(Object.entries(refund.coins).map(([id, q]) => `${q} ${id}`))
    .join(', ');
  pushLog(
    state,
    `Took away the ${def.name} at ${tx},${ty}` +
    (refundText ? ` — got back ${refundText}.` : ' — the salvage is banked until it makes a whole unit.'),
    'build'
  );

  save(state);
  return ok({
    state,
    removed: { key, x: tx, y: ty, blockId: placed.blockId, name: def.name },
    refund,
    refundRate: BLOCK_REFUND_RATE,
  });
}
