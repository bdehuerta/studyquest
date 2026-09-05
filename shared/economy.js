// shared/economy.js  [AGENT-C]
// Payouts, coin maths, bonus aggregation and dark-box rolls.
// Pure ES module, imported by BOTH the Node server and the browser:
// no `node:` imports, no DOM, no globals beyond Math/Date.
//
// ROUNDING RULE: every multiplier is applied in floating point and each
// currency is rounded exactly once, at the very end. Nothing is ever negative
// or NaN — clamp() guards every external number that enters the chain.

import {
  CURRENCY_IDS,
  CURRENCIES,
  WORK_TYPES,
  SUBJECT_PAY,
  MAIN_CURRENCY,
  RANK_MULT,
  RARITIES,
  PITY_THRESHOLD,
} from './constants.js';

import { MATERIALS, TOOLS, BUILDINGS } from './recipes.js';

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------

/** Clamp n into [lo, hi]; non-finite input becomes lo. */
export function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Non-negative safe number, default 0. */
function num(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// ---------------------------------------------------------------------------
// coin primitives
// ---------------------------------------------------------------------------

export function emptyCoins() {
  const out = {};
  for (const id of CURRENCY_IDS) out[id] = 0;
  return out;
}

export function addCoins(a, b) {
  const out = emptyCoins();
  for (const id of CURRENCY_IDS) out[id] = num(a && a[id]) + num(b && b[id]);
  return out;
}

/** May go negative — callers decide whether that is legal. */
export function subtractCoins(a, b) {
  const out = emptyCoins();
  for (const id of CURRENCY_IDS) out[id] = num(a && a[id]) - num(b && b[id]);
  return out;
}

export function canAfford(wallet, cost) {
  for (const id of CURRENCY_IDS) {
    if (num(wallet && wallet[id]) < num(cost && cost[id])) return false;
  }
  return true;
}

export function totalCoins(coins) {
  let t = 0;
  for (const id of CURRENCY_IDS) t += num(coins && coins[id]);
  return t;
}

// ---------------------------------------------------------------------------
// ranks + levelling
// ---------------------------------------------------------------------------

const RANK_CUTS = [
  [0.85, 'S'],
  [0.68, 'A'],
  [0.50, 'B'],
  [0.32, 'C'],
  [0.18, 'D'],
];

/** 0..1 composite score -> letter rank. */
export function rankFromScore(score01) {
  const s = clamp(score01, 0, 1);
  for (const [cut, rank] of RANK_CUTS) if (s >= cut) return rank;
  return 'F';
}

/**
 * XP required to go from `level` to `level + 1`.
 *
 * LINEAR, not exponential. It was `100 * 1.35^(level-1)`, inherited from v1
 * when studying was the only source of experience. Compounding at 35% a level
 * meant level 20 alone cost 45,000 xp — a wall rather than a curve — and made
 * the cost of any given level impossible to hold in your head.
 *
 * Measured against real play at 90 + 60(level-1): a mid-sized task pays about
 * 214 xp (174 directly, plus 1-5 dark boxes at 10-30 each), so
 *   level 10 — the Stonemason's gate — is about FOURTEEN tasks,
 *   level 20 is about fifty-six.
 * Selling is deliberately not a levelling route: a lot of seven pays 14 xp, so
 * you would need ~200 lots for one mid task. Trade is for florins; study is for
 * levels, and that is the right way round for this game.
 */
export const XP_BASE = 90;
export const XP_STEP = 60;
export function xpToNext(level) {
  const lv = Math.max(1, Math.floor(num(level, 1)));
  return XP_BASE + XP_STEP * (lv - 1);
}

/**
 * applyLevelUps(player) — the ONE mutating helper in this module (documented in
 * the contract as such). Drains player.xp into levels and refreshes xpToNext.
 */
export function applyLevelUps(player) {
  if (!player) return { levelsGained: 0 };
  player.level = Math.max(1, Math.floor(num(player.level, 1)));
  player.xp = Math.max(0, Math.floor(num(player.xp, 0)));

  let gained = 0;
  let need = xpToNext(player.level);
  // hard stop guards against a corrupt xp value spinning forever
  while (player.xp >= need && gained < 500) {
    player.xp -= need;
    player.level += 1;
    gained += 1;
    need = xpToNext(player.level);
  }
  player.xpToNext = need;
  return { levelsGained: gained };
}

// ---------------------------------------------------------------------------
// bonuses
// ---------------------------------------------------------------------------

/**
 * Every active bonus source, with a display label, so payout breakdowns can
 * name the thing that helped. Internal — computeBonuses is the public shape.
 */
function bonusSources(state) {
  const out = [];
  const buildings = (state && Array.isArray(state.buildings)) ? state.buildings : [];
  for (const b of buildings) {
    const def = BUILDINGS[b && b.buildingId];
    if (def && def.passive) out.push({ label: def.name, bonus: def.passive });
  }
  const tools = (state && Array.isArray(state.tools)) ? state.tools : [];
  for (const t of tools) {
    if (!t || !t.equipped) continue;
    const def = TOOLS[t.itemId];
    if (def && def.bonus) out.push({ label: def.name, bonus: def.bonus });
  }
  return out;
}

/**
 * computeBonuses(state) -> { coinMult:{focus,insight,grind,spark}, xpMult, boxChanceBonus }
 * coinMult always carries all four currencies, defaulting to 1.
 * Multiplicative for multipliers, additive for box chance.
 */
export function computeBonuses(state) {
  const coinMult = {};
  for (const id of CURRENCY_IDS) coinMult[id] = 1;
  let xpMult = 1;
  let boxChanceBonus = 0;

  for (const src of bonusSources(state)) {
    const b = src.bonus || {};
    if (b.coinMult) {
      for (const id of CURRENCY_IDS) {
        const m = num(b.coinMult[id], 1);
        if (m > 0) coinMult[id] *= m;
      }
    }
    const xm = num(b.xpMult, 1);
    if (xm > 0) xpMult *= xm;
    boxChanceBonus += num(b.boxChanceBonus, 0);
  }

  return {
    coinMult,
    xpMult,
    boxChanceBonus: clamp(boxChanceBonus, 0, 0.6),
  };
}

// ---------------------------------------------------------------------------
// payout internals
// ---------------------------------------------------------------------------

// ===========================================================================
// WHAT STUDYING PAYS
// ===========================================================================
// NOT florins. Studying and homework pay DARK BOXES; boxes pay shards; shards
// buy florins at the Exchange, expensively. Florins themselves come from
// quests, from selling what you gather, and from chests.
//
// That is the whole point of the loop: real work cannot be turned straight into
// money, so money can never be a reason to fake the work. What real work buys
// is boxes — and the boxes are the reward that feels like one.
//
// The `pool` a task computes is therefore no longer a coin amount. It is a
// measure of how much work was done, and it decides HOW MANY BOXES fall out.
export const POOL_PER_BOX = 45;
export const MAX_BOXES_PER_TASK = 5;

/**
 * How many boxes a piece of work is worth.
 * Always at least one for anything that graded at all — finishing a real task
 * and being handed nothing is the single most demoralising outcome the old
 * roll could produce.
 */
export function boxesForPool(pool, rank, boxChance) {
  const scaled = Math.floor(Math.max(0, num(pool, 0)) / POOL_PER_BOX);
  let boxes = Math.max(1, scaled);
  if (rank === 'S') boxes += 1;                       // a flawless job is worth more
  if (Math.random() < num(boxChance, 0)) boxes += 1;  // and the old lucky roll survives
  return Math.min(MAX_BOXES_PER_TASK, boxes);
}

/** The work type's payout multiplier. An unknown type pays flat, never zero. */
function payFor(workType) {
  const wt = WORK_TYPES[workType];
  return wt && num(wt.pay, 0) > 0 ? num(wt.pay) : 1;
}

/** The subject's payout multiplier. Unknown subjects pay flat. */
function subjectPayFor(subject) {
  const m = num(SUBJECT_PAY[subject], 1);
  return m > 0 ? m : 1;
}

/**
 * Turn `pool` into FLORINS, scaled by what kind of work it was, what subject it
 * was for, and any bonuses. There is nothing to split any more — one currency —
 * so what used to be a spread across four wallets is now one multiplier.
 *
 * Shards are deliberately never produced here: study pays Dark Boxes, and only
 * Dark Boxes pay shards. Returns UNROUNDED floats; the caller rounds once.
 */
function splitPool(pool, workType, subject, bonuses) {
  const raw = emptyCoins();
  raw[MAIN_CURRENCY] = pool
    * payFor(workType)
    * subjectPayFor(subject)
    * num(bonuses.coinMult[MAIN_CURRENCY], 1);
  return raw;
}

function roundCoins(raw) {
  const out = emptyCoins();
  for (const id of CURRENCY_IDS) {
    const v = num(raw[id], 0);
    out[id] = Math.max(0, Math.round(v));
  }
  return out;
}

/** Up to `max` short "Library ×1.15 insight"-style lines. */
function bonusBreakdownLines(state, max) {
  const lines = [];
  for (const src of bonusSources(state)) {
    if (lines.length >= max) break;
    const b = src.bonus || {};
    const parts = [];
    if (b.coinMult) {
      const entries = CURRENCY_IDS
        .map((id) => [id, num(b.coinMult[id], 1)])
        .filter(([, m]) => m !== 1);
      if (entries.length >= CURRENCY_IDS.length) {
        parts.push(`×${entries[0][1].toFixed(2)} all coins`);
      } else {
        for (const [id, m] of entries) parts.push(`×${m.toFixed(2)} ${id}`);
      }
    }
    if (num(b.xpMult, 1) !== 1) parts.push(`×${num(b.xpMult, 1).toFixed(2)} xp`);
    if (num(b.boxChanceBonus, 0) > 0) {
      parts.push(`+${Math.round(num(b.boxChanceBonus) * 100)}% box`);
    }
    if (parts.length) lines.push(`${src.label} ${parts.join(', ')}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// task payout
// ---------------------------------------------------------------------------

const QUALITY_WEIGHT = 0.65;
const EFFORT_WEIGHT = 0.35;
const EFFORT_CAP = 1.25;   // logging more than 125% of the estimate stops paying
const EFFORT_TARGET = 1.1; // ratio at which effort scores a full 1.0

/**
 * computeTaskPayout(state, opts) -> PayoutResult. Never mutates state.
 * opts: { subject, workType, difficulty, estMinutes, minutesLogged, quality, onTime }
 */
export function computeTaskPayout(state, opts = {}) {
  const {
    subject, workType, difficulty, estMinutes, minutesLogged, quality, onTime,
  } = opts;

  const diff = clamp(Math.round(num(difficulty, 1)), 1, 5);
  const pool = diff * 20;

  // --- composite score -> rank -------------------------------------------
  const q = clamp(num(quality, 3), 1, 5);
  const qualityScore = (q - 1) / 4;

  const est = Math.max(1, num(estMinutes, 30));
  const logged = Math.max(0, num(minutesLogged, 0));
  const ratio = clamp(logged / est, 0, EFFORT_CAP);
  const effortScore = clamp(ratio / EFFORT_TARGET, 0, 1);

  // When the work itself was assessed (a graded submission), the grade IS the
  // judgement — folding in a tracked-minutes effort term double-counts and, for
  // an essay with no timer logged, mathematically caps the result at rank B.
  const assessed = Boolean(opts.assessed);
  const score = assessed
    ? qualityScore
    : QUALITY_WEIGHT * qualityScore + EFFORT_WEIGHT * effortScore;
  const rank = rankFromScore(score);
  const rankMult = num(RANK_MULT[rank], 1);

  // --- multipliers --------------------------------------------------------
  const bonuses = computeBonuses(state);
  const timing = onTime ? 1.2 : 0.6;

  // The work still gets weighed exactly as before — kind of work, subject,
  // gear, whether it was on time — but what the weighing BUYS is boxes.
  const raw = splitPool(pool, workType, subject, bonuses);
  const effort = num(raw[MAIN_CURRENCY], 0) * timing * rankMult;

  // NO FLORINS. Submitting work does not pay money; it pays Dark Boxes.
  const coins = emptyCoins();
  const xp = Math.max(0, Math.round(Math.round(effort * 1.5) * bonuses.xpMult));

  // --- dark boxes ---------------------------------------------------------
  const boxChance = clamp(0.1 + diff * 0.04 + bonuses.boxChanceBonus, 0, 0.95);
  const darkBoxes = boxesForPool(effort, rank, boxChance);

  // --- breakdown ----------------------------------------------------------
  const breakdown = [`difficulty ${diff} → ${pool} pool`];
  breakdown.push(onTime ? 'on time ×1.2' : 'late ×0.6');
  // Effort is 35% of the rank score, so an untracked task caps out around B.
  // Say so explicitly — a silent two-rank penalty just reads as the app being unfair.
  if (assessed) {
    breakdown.push('graded on the work submitted — tracked time not counted');
  } else if (logged <= 0) {
    breakdown.push('no time tracked → effort 0/35, rank capped near B');
  } else {
    breakdown.push(`${logged}/${est} min tracked → effort ${Math.round(effortScore * 100)}%`);
  }
  breakdown.push(`Rank ${rank} ×${rankMult}`);
  const bonusLines = bonusBreakdownLines(state, 2);
  for (const line of bonusLines) breakdown.push(line);
  if (bonusLines.length === 0) breakdown.push('no gear or buildings ×1.0');
  breakdown.push(`Dark Box ×${darkBoxes} — open them for shards`);

  return { coins, xp, darkBoxes, rank, breakdown };
}

// ---------------------------------------------------------------------------
// session payout

// Tuning dial for how much tracked sitting is worth relative to shipping work.
// Raise it and grinding the timer starts to out-earn finishing assignments;
// lower it and the daily cap becomes decorative. See computeSessionPayout.
const SESSION_POOL_SCALE = 4;

// ---------------------------------------------------------------------------

/**
 * computeSessionPayout(state, opts) -> PayoutResult. Never mutates state.
 * opts: { subject, workType, minutes, focusScore }
 *
 * Deliberately weaker per hour than shipping a task, but not so weak that the
 * daily cap is unreachable: the pool is
 * floor(minutes / 5) * focusScore * SESSION_POOL_SCALE.
 * At scale 4, a focused 60-minute session pays ~72 coins against ~173 for
 * finishing a difficulty-5 assignment, and DAILY_SESSION_COIN_CAP starts to
 * bind at roughly five and a half hours of tracked sitting — which is the
 * point of the cap. rank is always null for sessions.
 */
export function computeSessionPayout(state, opts = {}) {
  const { subject, workType, minutes, focusScore } = opts;

  const mins = Math.max(0, Math.floor(num(minutes, 0)));
  const focus = clamp(num(focusScore, 1), 0.5, 1.5);
  const pool = Math.floor(mins / 5) * focus * SESSION_POOL_SCALE;

  const bonuses = computeBonuses(state);
  const raw = splitPool(pool, workType, subject, bonuses);
  const effort = num(raw[MAIN_CURRENCY], 0);

  // A tracked sitting pays NO florins either — same rule as a submitted task.
  const coins = emptyCoins();
  const xp = Math.max(0, Math.round(Math.round(effort * 1.5) * bonuses.xpMult));

  // Boxes only for real sittings (25+ minutes). A sitting is worth less than a
  // finished piece of work, so it takes more of it to earn a box.
  const eligible = mins >= 25;
  const boxChance = eligible ? clamp(0.03 + bonuses.boxChanceBonus, 0, 0.5) : 0;
  const darkBoxes = eligible
    ? Math.min(MAX_BOXES_PER_TASK, Math.max(1, Math.floor(effort / (POOL_PER_BOX * 2))))
      + (Math.random() < boxChance ? 1 : 0)
    : 0;

  const breakdown = [
    `${mins} min × focus ${focus} → ${Math.round(pool)} pool`,
    `${(WORK_TYPES[workType] && WORK_TYPES[workType].name) || 'Session'} ×${payFor(workType)}`,
  ];
  const bonusLines = bonusBreakdownLines(state, 2);
  for (const line of bonusLines) breakdown.push(line);
  breakdown.push(
    eligible
      ? `Dark Box ×${darkBoxes} — open them for shards`
      : 'under 25 min → no Dark Box'
  );

  return { coins, xp, darkBoxes, rank: null, breakdown };
}

// ---------------------------------------------------------------------------
// dark boxes
// ---------------------------------------------------------------------------

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// v3: tree drops are deliberately NOT in the Dark Box pool. Heartwood, Resin
// and Seedpod exist to make chopping worth doing; if a box could hand them out
// the finite-forest loop would have a way around itself.
const MATERIALS_BY_RARITY = (() => {
  const map = {};
  for (const r of RARITY_ORDER) map[r] = [];
  for (const m of Object.values(MATERIALS)) {
    if (m.treeDrop) continue;
    if (map[m.rarity]) map[m.rarity].push(m.id);
  }
  return map;
})();

const QTY_RANGE = {
  common: [1, 3], uncommon: [1, 2], rare: [1, 2], epic: [1, 1], legendary: [1, 1],
};

function rollRarity() {
  let total = 0;
  for (const r of RARITY_ORDER) total += num(RARITIES[r].weight, 0);
  let roll = Math.random() * total;
  for (const r of RARITY_ORDER) {
    roll -= num(RARITIES[r].weight, 0);
    if (roll <= 0) return r;
  }
  return 'common';
}

function pickMaterial(rarity) {
  const pool = MATERIALS_BY_RARITY[rarity];
  if (!pool || pool.length === 0) return MATERIALS_BY_RARITY.common[0];
  return pool[randInt(0, pool.length - 1)];
}

/**
 * rollDarkBox(state, count) -> { drops:[MaterialDrop], pity:number, best:rarity }
 *
 * MUTATION EXCEPTION: this is the one function in economy.js that reads and
 * writes state — it maintains `state.player.pity`, creating it if absent.
 * Everything else here is pure. The pity timer counts boxes opened without an
 * epic-or-better; when it reaches PITY_THRESHOLD the next box is forced to
 * epic. Any epic-or-better drop (rolled or forced) resets the counter to 0.
 */
/**
 * How many shards each rarity pays.
 *
 * Tuned against the old material drops so a box is worth roughly what it was:
 * a common box is pocket change, a legendary is most of a florin's worth at the
 * Exchange (25 shards -> 1 florin). Cheap enough that shards are not a fast
 * road to money, generous enough that opening a box still feels like a reward.
 */
export const SHARD_QTY_RANGE = Object.freeze({
  common:    [2, 4],
  uncommon:  [4, 7],
  rare:      [8, 12],
  epic:      [14, 20],
  legendary: [28, 40],
});

export function rollDarkBox(state, count = 1) {
  const n = Math.max(0, Math.floor(num(count, 1)));
  const player = (state && state.player) ? state.player : null;
  if (player && !Number.isFinite(Number(player.pity))) player.pity = 0;

  let pity = player ? Math.max(0, Math.floor(num(player.pity, 0))) : 0;
  const drops = [];
  let bestIdx = -1;

  for (let i = 0; i < n; i++) {
    let rarity;
    if (pity >= PITY_THRESHOLD) {
      rarity = 'epic'; // pity break
    } else {
      rarity = rollRarity();
    }

    const idx = RARITY_ORDER.indexOf(rarity);
    if (idx >= 3) pity = 0; else pity += 1;   // epic (3) or legendary (4) resets
    if (idx > bestIdx) bestIdx = idx;

    // Boxes pay SHARDS, never materials.
    //
    // Materials are what you gather; shards are what real work pays, and the
    // box is the only thing that produces them. Rarity still decides how many,
    // so the pity timer and a legendary pull both still mean something — the
    // reward is bigger, not a different substance.
    const [lo, hi] = SHARD_QTY_RANGE[rarity] || [1, 1];
    drops.push({
      kind: 'shard',
      currencyId: 'shard',
      // materialId stays null so nothing downstream mistakes this for a
      // material and quietly credits the wrong pile.
      materialId: null,
      name: CURRENCIES.shard.name,
      qty: randInt(lo, hi),
      rarity,
      color: CURRENCIES.shard.color,
    });
  }

  if (player) player.pity = pity;
  return { drops, pity, best: bestIdx >= 0 ? RARITY_ORDER[bestIdx] : null };
}

// ---------------------------------------------------------------------------
// daily session cap support
// ---------------------------------------------------------------------------

function localDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * sessionCoinsToday(state) -> number
 *
 * CROSS-AGENT CONTRACT (matches AGENT-A's server/api.js):
 * This reports coins ALREADY AWARDED today — it never recomputes a payout, so
 * the daily cap always agrees with what was actually paid out.
 *
 * The authoritative source is the SESSION RECORD. AGENT-A writes `coins` (the
 * coin object), `coinsAwarded` (the summed number) and `xp` onto every session
 * record. Read order, first hit wins per record:
 *   1. `session.coinsAwarded`  (number, or a coin object — both accepted)
 *   2. `session.coins`         (coin object, summed with totalCoins)
 *   3. `session.coinsEarned`   (legacy alias, number or coin object)
 *
 * Sessions count when their `endedAt` falls on today's LOCAL date (`startedAt`
 * is used only if `endedAt` is missing). If NO session record from today
 * carries any of those fields, we fall back to summing `coins`/`amount` off
 * state.log entries with kind === 'session' — best-effort only.
 */
export function sessionCoinsToday(state) {
  const today = localDateKey(new Date());
  const sessions = (state && Array.isArray(state.sessions)) ? state.sessions : [];

  const valueOf = (v) => (
    v && typeof v === 'object' ? totalCoins(v) : Math.max(0, num(v, 0))
  );

  let total = 0;
  let sawField = false;

  for (const s of sessions) {
    if (!s) continue;
    const key = localDateKey(s.endedAt || s.startedAt);
    if (key !== today) continue;

    let raw = null;
    if (s.coinsAwarded !== undefined && s.coinsAwarded !== null) raw = s.coinsAwarded;
    else if (s.coins !== undefined && s.coins !== null) raw = s.coins;
    else if (s.coinsEarned !== undefined && s.coinsEarned !== null) raw = s.coinsEarned;
    if (raw === null) continue;

    sawField = true;
    total += valueOf(raw);
  }
  if (sawField) return Math.round(total);

  // fallback: log entries of kind 'session'
  const log = (state && Array.isArray(state.log)) ? state.log : [];
  let fallback = 0;
  for (const e of log) {
    if (!e || e.kind !== 'session') continue;
    if (localDateKey(e.ts) !== today) continue;
    if (e.coins && typeof e.coins === 'object') fallback += totalCoins(e.coins);
    else fallback += Math.max(0, num(e.amount, 0));
  }
  return Math.round(fallback);
}
