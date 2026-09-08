// shared/recipes.js  [AGENT-C]
// Materials, tools, buildings and crafting recipes.
// Pure data + pure functions. No DOM, no node builtins — imported by BOTH
// the server and the browser.

import {
  MATERIAL_IDS,
  TOOL_IDS,
  BUILDING_IDS,
  BUILDING_FOOTPRINT,
  CURRENCIES,
  RARITIES,
  // --- v3 ---
  TREE_DROP_IDS,
  GADGET_IDS,
  BLOCK_IDS,
  SAPLING_STAGES,
  SAPLING_TOTAL_MINUTES,
} from './constants.js';

// ---------------------------------------------------------------------------
// MATERIALS — one entry per id in MATERIAL_IDS.
// Spread: 3 common / 2 uncommon / 1 rare / 1 epic / 1 legendary.
// `symbol` is a single character used for text-mode display and tooltips.
// ---------------------------------------------------------------------------
export const MATERIALS = Object.freeze({
  ironwood:    { id: 'ironwood',    name: 'Ironwood',    rarity: 'common',    color: '#8a6a42', symbol: '#' },
  chalkstone:  { id: 'chalkstone',  name: 'Chalkstone',  rarity: 'common',    color: '#d8d4c6', symbol: '=' },
  copperwire:  { id: 'copperwire',  name: 'Copperwire',  rarity: 'common',    color: '#c9743a', symbol: '~' },
  sunfiber:    { id: 'sunfiber',    name: 'Sunfiber',    rarity: 'uncommon',  color: '#e8c15a', symbol: '/' },
  lenscrystal: { id: 'lenscrystal', name: 'Lenscrystal', rarity: 'rare',      color: '#7fd7ff', symbol: '<' },
  runeplate:   { id: 'runeplate',   name: 'Runeplate',   rarity: 'epic',      color: '#a86cff', symbol: '&' },
  voidshard:   { id: 'voidshard',   name: 'Voidshard',   rarity: 'legendary', color: '#ffd93d', symbol: '*' },

  // --- v3 TREE DROPS -------------------------------------------------------
  // These are NOT in MATERIAL_IDS: they come only out of a felled tree, never
  // out of a Dark Box and never out of a study drop. `treeDrop: true` is what
  // every other module should test against — do not hardcode the id list.
  heartwood: {
    id: 'heartwood', name: 'Heartwood', rarity: 'uncommon',
    color: '#6b3f2a', symbol: 'H', treeDrop: true,
  },
  wild_tuna: {
    id: 'wild_tuna', name: 'Wild Tuna', rarity: 'common',
    color: '#4f7fa8', symbol: '~',
    desc: 'Silver-sided and heavier than it looks. The Trading Post takes four for a florin.',
  },
  resin: {
    id: 'resin', name: 'Amber Resin', rarity: 'uncommon',
    color: '#e0a850', symbol: 'r', treeDrop: true,
  },
  seedpod: {
    id: 'seedpod', name: 'Seedpod', rarity: 'rare',
    color: '#8fc85a', symbol: 'p', treeDrop: true,
    // A seedpod IS a sapling. Planting one costs nothing at the Shop, which is
    // why it reads as a lucky find rather than just another sellable.
    plantable: true,
  },
});

/** Every material id the game can hold: the frozen core list plus tree drops. */
export const ALL_MATERIAL_IDS = Object.freeze(
  MATERIAL_IDS.concat(TREE_DROP_IDS.filter((id) => !MATERIAL_IDS.includes(id)))
);

/** True for materials that only a felled tree can produce. */
export function isTreeDrop(id) {
  return Boolean(MATERIALS[id] && MATERIALS[id].treeDrop);
}

// ---------------------------------------------------------------------------
// TREE DROP TABLE — what one felled tree yields.
// Ironwood is the guaranteed backbone; the rest are independent weighted rolls,
// so a tree usually gives wood and occasionally gives something worth keeping.
// Expected value per tree is stated in TREE_DROP_EV_NOTE below.
// ---------------------------------------------------------------------------
export const TREE_DROP_TABLE = Object.freeze([
  { materialId: 'ironwood',  chance: 1.00, qty: [1, 2], rarity: 'common'   },
  { materialId: 'heartwood', chance: 0.22, qty: [1, 1], rarity: 'uncommon' },
  { materialId: 'resin',     chance: 0.20, qty: [1, 1], rarity: 'uncommon' },
  // ONE SEEDPOD PER TREE, GUARANTEED. Bruno, 2026-08-31: "it would be better to
  // change the drop rate of seeds to 1 per tree felled." It was 6%, which meant
  // felling sixteen trees to replace one — with trees permanent and florins now
  // rare, that was a forest draining one way. Every tree you fell now hands
  // back the means to replace itself, so the wood is sustainable by ITSELF
  // rather than by a trip to the Market, and buying saplings becomes a way to
  // GROW the forest instead of the only way to keep it.
  { materialId: 'seedpod',   chance: 1.00, qty: [1, 1], rarity: 'rare'     },
]);

export const TREE_DROP_EV_NOTE =
  'avg 1.5 Ironwood + 22% Heartwood + 20% Resin + exactly 1 Seedpod per tree — '
  + 'a felled tree always returns the seed that replaces it';

/**
 * rollTreeDrops(rng) -> [{ materialId, name, qty, rarity, color }]
 * `rng` defaults to Math.random so the server can pass a seeded one in tests.
 */
export function rollTreeDrops(rng = Math.random) {
  const out = [];
  for (const row of TREE_DROP_TABLE) {
    if (rng() >= row.chance) continue;
    const [lo, hi] = row.qty;
    const qty = lo + Math.floor(rng() * (hi - lo + 1));
    if (qty <= 0) continue;
    const def = MATERIALS[row.materialId] || {};
    out.push({
      materialId: row.materialId,
      name: def.name || row.materialId,
      qty,
      rarity: def.rarity || row.rarity,
      color: def.color || '#9aa0aa',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SAPLING GROWTH — pure, wall-clock, computed lazily on read. Nothing ticks.
// ---------------------------------------------------------------------------

/** The last stage in SAPLING_STAGES is the chopable one. */
export const MATURE_STAGE_ID = SAPLING_STAGES[SAPLING_STAGES.length - 1].id;

/**
 * growthOf(planting, now) -> {
 *   stage, stageLabel, stageIndex, stageCount, mature,
 *   ageMinutes, totalMinutes, minutesRemaining, msRemaining,
 *   progress01, readyAt, nextStage, nextStageAt
 * }
 * Safe on garbage input: a missing plantedAt is treated as "just planted".
 */
export function growthOf(planting, now = Date.now()) {
  const plantedAt = Number(planting && planting.plantedAt);
  const base = Number.isFinite(plantedAt) ? plantedAt : now;
  // A watering can (and anything else that accelerates growth) works by
  // banking minutes here rather than by rewriting plantedAt, so the original
  // planting time stays honest in the save file.
  const boosted = Math.max(0, Number(planting && planting.boostMinutes) || 0);
  const ageMinutes = Math.max(0, (now - base) / 60000) + boosted;

  let stageIndex = 0;
  for (let i = 0; i < SAPLING_STAGES.length; i += 1) {
    if (ageMinutes >= SAPLING_STAGES[i].minutes) stageIndex = i;
  }
  const stage = SAPLING_STAGES[stageIndex];
  const next = SAPLING_STAGES[stageIndex + 1] || null;
  const total = Math.max(1, Number(SAPLING_TOTAL_MINUTES) || 1);
  const minutesRemaining = Math.max(0, total - ageMinutes);

  return {
    stage: stage.id,
    stageLabel: stage.label,
    stageIndex,
    stageCount: SAPLING_STAGES.length,
    mature: stage.id === MATURE_STAGE_ID,
    ageMinutes: Math.floor(ageMinutes),
    totalMinutes: total,
    minutesRemaining: Math.ceil(minutesRemaining),
    msRemaining: Math.max(0, Math.round(minutesRemaining * 60000)),
    progress01: Math.min(1, ageMinutes / total),
    readyAt: base + Math.round((total - boosted) * 60000),
    nextStage: next ? next.id : null,
    nextStageLabel: next ? next.label : null,
    nextStageAt: next ? base + Math.round((next.minutes - boosted) * 60000) : null,
  };
}

// ---------------------------------------------------------------------------
// TOOLS — equippable, small and specialised. Balance rails:
//   no single coinMult above 1.25, boxChanceBonus never above 0.05.
// ---------------------------------------------------------------------------
export const TOOLS = Object.freeze({
  focus_lamp: {
    id: 'focus_lamp',
    name: 'Focus Lamp',
    desc: 'Burns steady through long sittings: +5.5% Florins from everything you do.',
    bonus: { coinMult: { florin: 1.055 } },
  },
  grindstone: {
    id: 'grindstone',
    name: 'Grindstone',
    desc: 'Problem sets wear down faster: +5.5% Florins.',
    bonus: { coinMult: { florin: 1.055 } },
  },
  quill_of_clarity: {
    id: 'quill_of_clarity',
    name: 'Quill of Clarity',
    desc: 'Sentences land the first time: +4.5% Florins and a little extra XP.',
    bonus: { coinMult: { florin: 1.045 }, xpMult: 1.05 },
  },
  insight_lens: {
    id: 'insight_lens',
    name: 'Insight Lens',
    desc: 'Reads between the lines: +5% Florins and +4% chance of a Dark Box.',
    bonus: { coinMult: { florin: 1.050 }, boxChanceBonus: 0.04 },
  },
  chrono_hourglass: {
    id: 'chrono_hourglass',
    name: 'Chrono Hourglass',
    desc: 'Every minute counts twice: +25% XP from all work.',
    bonus: { xpMult: 1.25, boxChanceBonus: 0.01 },
  },
  sparkforge_hammer: {
    id: 'sparkforge_hammer',
    name: 'Sparkforge Hammer',
    desc: 'Beats a little more out of everything: +8% to all four currencies.',
    bonus: { coinMult: { florin: 1.080 }, xpMult: 1.05 },
  },
  /**
   * THE CHEESECAKE HELM. Biscuit brim, set custard crown, one glazed cherry.
   *
   * A hermit made it out of four terraces of solitude and one idea, and it is
   * the only gear in the game that is neither bought, crafted nor found lying
   * about — it is given to you, once, by somebody who is pleased with you. The
   * bonus is small and deliberately about STAMINA: it is a hat made of pudding,
   * and pudding is for after the work.
   */
  cheesecake_helm: {
    id: 'cheesecake_helm',
    name: 'The Cheesecake Helm',
    desc: 'Biscuit brim, set custard crown, one glazed cherry. Worn, it is very slightly '
      + 'harder to be tired: +4 stamina, and +2% Florins because people give you things.',
    bonus: { energyBonus: 4, coinMult: { florin: 1.02 } },
  },

  // --- v2 gathering tools -------------------------------------------------
  // These carry no passive bonus; they exist to act on the world and they wear
  // out. `gather` marks them as equippable in the gathering slot, not the
  // 2-slot passive gear slots.
  axe: {
    id: 'axe', gather: true, node: 'tree',
    name: 'Woodcutter\u2019s Axe',
    desc: 'Fells trees for Ironwood. 4 energy a swing.',
    bonus: {},
  },
  pickaxe: {
    id: 'pickaxe', gather: true, node: 'stone',
    name: 'Iron Pickaxe',
    desc: 'Breaks stone outcrops for Chalkstone. 6 energy a swing.',
    bonus: {},
  },
  dredge: {
    id: 'dredge', gather: true, node: 'reeds',
    name: 'Reed Dredge',
    desc: 'Drags the shallows for Inkglass. 5 energy a swing.',
    bonus: {},
  },
  sifter: {
    id: 'sifter', gather: true, node: 'sand',
    name: 'Prospector\u2019s Sifter',
    desc: 'Sifts sand for Copperwire. 3 energy a swing.',
    bonus: {},
  },
});

// ---------------------------------------------------------------------------
// BUILDINGS — the slower, bigger power source. Footprints MUST match
// BUILDING_FOOTPRINT in constants.js (asserted below at module load).
// ---------------------------------------------------------------------------
export const BUILDINGS = Object.freeze({
  study_hut: {
    id: 'study_hut',
    name: 'Study Hut',
    desc: 'A dry desk and a lamp. +5% to every currency and a trickle of extra XP.',
    w: BUILDING_FOOTPRINT.study_hut.w,
    h: BUILDING_FOOTPRINT.study_hut.h,
    passive: { coinMult: { florin: 1.050 }, xpMult: 1.03 },
  },
  library: {
    id: 'library',
    name: 'Library',
    desc: 'Shelves of half-read theory. +3.8% Florins.',
    w: BUILDING_FOOTPRINT.library.w,
    h: BUILDING_FOOTPRINT.library.h,
    passive: { coinMult: { florin: 1.038 } },
  },
  forge: {
    id: 'forge',
    name: 'Forge',
    desc: 'Where drills get hammered flat. +3.8% Florins.',
    w: BUILDING_FOOTPRINT.forge.w,
    h: BUILDING_FOOTPRINT.forge.h,
    passive: { coinMult: { florin: 1.038 } },
  },
  observatory: {
    id: 'observatory',
    name: 'Observatory',
    desc: 'Watches for rare things falling. +4% Dark Box chance, +1.3% Florins.',
    w: BUILDING_FOOTPRINT.observatory.w,
    h: BUILDING_FOOTPRINT.observatory.h,
    passive: { coinMult: { florin: 1.012 }, boxChanceBonus: 0.04 },
  },
  lab: {
    id: 'lab',
    name: 'Lab',
    desc: 'Benches, burners, notebooks. +6% Florins.',
    w: BUILDING_FOOTPRINT.lab.w,
    h: BUILDING_FOOTPRINT.lab.h,
    passive: { coinMult: { florin: 1.060 } },
  },
  shrine: {
    id: 'shrine',
    name: 'Shrine',
    desc: 'A quiet stone to touch before you start. +20% XP.',
    w: BUILDING_FOOTPRINT.shrine.w,
    h: BUILDING_FOOTPRINT.shrine.h,
    passive: { xpMult: 1.2 },
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    desc: 'The capstone build. +12% to every currency, +10% XP, +2% Dark Box chance.',
    w: BUILDING_FOOTPRINT.workshop.w,
    h: BUILDING_FOOTPRINT.workshop.h,
    passive: {
      coinMult: { florin: 1.120 },
      xpMult: 1.1,
      boxChanceBonus: 0.02,
    },
  },

  // --- v2 shops. No passive bonus: their value is the vendor inside. ------
  trading_post: {
    id: 'trading_post',
    name: 'Trading Post',
    desc: 'The Wandering Merchant and the Broker set up here. Walk in to trade.',
    w: BUILDING_FOOTPRINT.trading_post.w,
    h: BUILDING_FOOTPRINT.trading_post.h,
    passive: {},
  },
  archive: {
    id: 'archive',
    name: 'The Archive',
    desc: 'The Archivist sells blueprints. Nothing is craftable until it is known.',
    w: BUILDING_FOOTPRINT.archive.w,
    h: BUILDING_FOOTPRINT.archive.h,
    passive: {},
  },
  exchange_post: {
    id: 'exchange_post',
    name: 'The Exchange',
    desc: 'A vendor behind a roulette table. He turns shards into florins, expensively, '
      + 'and will not trade the other way.',
    w: BUILDING_FOOTPRINT.exchange_post.w,
    h: BUILDING_FOOTPRINT.exchange_post.h,
    passive: {},
  },
  woodsman_camp: {
    id: 'woodsman_camp',
    name: "The Woodsman's Camp",
    desc: 'A lean-to in the south-west woods. He buys timber at nearly full price '
      + 'and does not advertise.',
    w: BUILDING_FOOTPRINT.woodsman_camp.w,
    h: BUILDING_FOOTPRINT.woodsman_camp.h,
    passive: {},
  },
  stonemason_camp: {
    id: 'stonemason_camp',
    name: "The Stonemason's Cave",
    desc: 'A mountain in the south-east with someone living under it. He buys stone, '
      + 'and only stone.',
    w: BUILDING_FOOTPRINT.stonemason_camp.w,
    h: BUILDING_FOOTPRINT.stonemason_camp.h,
    passive: {},
  },
});

// ---------------------------------------------------------------------------
// GADGETS — consumable-ish usables with a real effect and a real cooldown.
// They are USED from the inventory (POST /api/gadget/use), never equipped, and
// they are not consumed unless `consumed: true`. Six, each doing a different
// kind of thing: two are information, two touch the world, two touch the loop.
//
//   effect.kind is the contract with the client:
//     'reveal'      — client should light up resource nodes for `durationMs`
//     'markTree'    — client should mark the nearest tree not in `excludeTiles`
//     'growth'      — server already advanced a planting; client re-renders it
//     'permit'      — server granted a one-off permission held in state.effects
//     'buff'        — server armed a multiplier consumed by the next payout
//     'survey'      — server returns full gate progress; client shows it
// ---------------------------------------------------------------------------
export const GADGETS = Object.freeze({
  lantern: {
    id: 'lantern',
    name: 'Lantern of Long Nights',
    desc: 'Lights the whole block for 90 seconds — every resource node shows through the dark.',
    cooldownMs: 15 * 60000,
    effect: { kind: 'reveal', radius: 14, durationMs: 90000 },
    consumed: false,
  },
  compass: {
    id: 'compass',
    name: "Forester's Compass",
    desc: 'Points at the nearest tree still standing. Ignores stumps and anything not yet grown.',
    cooldownMs: 5 * 60000,
    effect: { kind: 'markTree', durationMs: 60000 },
    consumed: false,
  },
  watering_can: {
    id: 'watering_can',
    name: 'Copper Watering Can',
    desc: 'Pours 30 minutes of growth into one planted sapling. Needs a target.',
    cooldownMs: 30 * 60000,
    effect: { kind: 'growth', minutes: 30, needsTarget: true },
    consumed: false,
  },
  portable_bench: {
    id: 'portable_bench',
    name: 'Portable Bench',
    desc: 'Unfolds into a workbench: one craft away from a house, once a day.',
    cooldownMs: 24 * 3600000,
    effect: { kind: 'permit', permit: 'craft', uses: 1, oncePerDay: true },
    consumed: false,
  },
  focus_bell: {
    id: 'focus_bell',
    name: 'Focus Bell',
    desc: 'Rung before you sit down: the next study payout pays 25% more.',
    cooldownMs: 6 * 3600000,
    effect: { kind: 'buff', buff: 'studyMult', value: 1.25, uses: 1 },
    consumed: false,
  },
  surveyors_glass: {
    id: 'surveyors_glass',
    name: "Surveyor's Glass",
    desc: 'Reads the four gates and tells you exactly how far each one still is.',
    cooldownMs: 2 * 60000,
    effect: { kind: 'survey' },
    consumed: false,
  },
});

// ---------------------------------------------------------------------------
// BLOCKS — purely constructive. No bonuses, ever. Cheap, crafted in batches,
// placed and removed freely, refunded at BLOCK_REFUND_RATE.
// `solid` tells the world whether the block blocks movement.
// ---------------------------------------------------------------------------
export const BLOCKS = Object.freeze({
  path_stone: {
    id: 'path_stone', name: 'Path Stone', desc: 'A flat set stone. Walk on it.',
    color: '#bdb2a0', solid: false, batch: 8,
  },
  fence_wood: {
    id: 'fence_wood', name: 'Wooden Fence', desc: 'Waist-high rails. Marks a boundary, blocks a step.',
    color: '#8a6a42', solid: true, batch: 6,
  },
  wall_stone: {
    id: 'wall_stone', name: 'Stone Wall', desc: 'Proper masonry. Nothing walks through it.',
    color: '#9a958a', solid: true, batch: 4,
  },
  lamp_post: {
    id: 'lamp_post', name: 'Lamp Post', desc: 'A warm pool of light after dark. Decorative.',
    color: '#ffcc5c', solid: true, batch: 2,
  },
  planter: {
    id: 'planter', name: 'Flower Planter', desc: 'A box of colour. Does nothing at all, deliberately.',
    color: '#8fc85a', solid: false, batch: 4,
  },
  signpost: {
    id: 'signpost', name: 'Signpost', desc: 'Point the way. Carries a short label.',
    color: '#c9922f', solid: true, batch: 2, label: true,
  },
});

// ---------------------------------------------------------------------------
// RECIPES — every tool and every building is craftable.
// Curve: focus_lamp is reachable after ~2 Dark Boxes; workshop is the long game.
// ---------------------------------------------------------------------------
// Seven recipes went with INKGLASS on 2026-09-02: it was the reeds' only
// yield, the reeds are gone, and a recipe nobody can ever complete is worse
// than no recipe. See the backlog if inkglass ever comes back.
export const RECIPES = Object.freeze([
  // --- tools -------------------------------------------------------------
  {
    id: 'craft_focus_lamp',
    kind: 'tool',
    outputId: 'focus_lamp',
    materials: { ironwood: 3, chalkstone: 2 },
    coins: { florin: 2 },
  },
  {
    id: 'craft_grindstone',
    kind: 'tool',
    outputId: 'grindstone',
    materials: { chalkstone: 5, copperwire: 3 },
    coins: { florin: 4 },
  },
  {
    id: 'craft_sparkforge_hammer',
    kind: 'tool',
    outputId: 'sparkforge_hammer',
    materials: { copperwire: 8, lenscrystal: 4, runeplate: 2 },
    coins: { florin: 17 },
  },

  // --- v2 shop buildings ---------------------------------------------------
  {
    id: 'build_trading_post', kind: 'building', outputId: 'trading_post',
    materials: { ironwood: 10, chalkstone: 8, copperwire: 4 },
    coins: { florin: 20 },
  },

  // --- v2 gathering tools -------------------------------------------------
  {
    id: 'craft_axe', kind: 'tool', outputId: 'axe',
    materials: { ironwood: 2, chalkstone: 3 },
    coins: { florin: 3 },
  },
  {
    id: 'craft_pickaxe', kind: 'tool', outputId: 'pickaxe',
    materials: { chalkstone: 5, copperwire: 2 },
    coins: { florin: 5 },
  },
  // craft_dredge REMOVED with the reeds (2026-09-02). `TOOLS.dredge` stays so a
  // save that already owns one still renders its name; there is simply nothing
  // left to use it on and no way to make another.

  // --- buildings ---------------------------------------------------------
  {
    id: 'build_study_hut',
    kind: 'building',
    outputId: 'study_hut',
    materials: { ironwood: 8, chalkstone: 6 },
    coins: { florin: 5 },
  },
  {
    id: 'build_forge',
    kind: 'building',
    outputId: 'forge',
    materials: { chalkstone: 16, ironwood: 8, copperwire: 10 },
    coins: { florin: 16 },
  },
  {
    id: 'build_observatory',
    kind: 'building',
    outputId: 'observatory',
    materials: { copperwire: 12, sunfiber: 6, lenscrystal: 6 },
    coins: { florin: 21 },
  },
  {
    id: 'build_shrine',
    kind: 'building',
    outputId: 'shrine',
    materials: { chalkstone: 12, sunfiber: 10, runeplate: 2 },
    coins: { florin: 22 },
  },
  {
    id: 'build_workshop',
    kind: 'building',
    outputId: 'workshop',
    materials: {
      copperwire: 20, sunfiber: 14, lenscrystal: 12, runeplate: 6, voidshard: 2,
    },
    coins: { florin: 120 },
  },

  // --- v3 gadgets ---------------------------------------------------------
  // Every one costs at least one tree drop, so chopping feeds real recipes and
  // not just the merchant's buyback counter. Blueprint-gated (Archivist).
  {
    id: 'craft_gadget_lantern', kind: 'gadget', outputId: 'lantern', outputQty: 1,
    materials: { resin: 2, copperwire: 2, sunfiber: 1 },
    coins: { florin: 2 },
  },
  {
    id: 'craft_gadget_compass', kind: 'gadget', outputId: 'compass', outputQty: 1,
    materials: { heartwood: 1, copperwire: 2 },
    coins: { florin: 2 },
  },
  {
    id: 'craft_gadget_watering_can', kind: 'gadget', outputId: 'watering_can', outputQty: 1,
    materials: { copperwire: 3, resin: 1 },
    coins: { florin: 3 },
  },
  {
    id: 'craft_gadget_portable_bench', kind: 'gadget', outputId: 'portable_bench', outputQty: 1,
    materials: { heartwood: 3, ironwood: 4, chalkstone: 2 },
    coins: { florin: 6 },
  },
  {
    id: 'craft_gadget_surveyors_glass', kind: 'gadget', outputId: 'surveyors_glass', outputQty: 1,
    materials: { heartwood: 2, copperwire: 3, lenscrystal: 1 },
    coins: { florin: 3 },
  },
  {
    // Re-cut without inkglass. The contract requires every gadget to HAVE a
    // recipe, so removing this one with the rest broke recipes.js on import —
    // a gadget nobody can make is a hole the id check refuses to allow, and it
    // is right to.
    id: 'craft_gadget_focus_bell', kind: 'gadget', outputId: 'focus_bell', outputQty: 1,
    materials: { copperwire: 4, chalkstone: 2 },
    coins: { florin: 2 },
  },

  // --- v3 blocks ----------------------------------------------------------
  // Deliberately NOT blueprint-gated (`alwaysKnown`). Decorating your own land
  // is not a progression reward, and making a fence cost an Archivist trip
  // would be miserable. Crafted in batches so a fence line is one craft.
  {
    id: 'craft_block_path_stone', kind: 'block', outputId: 'path_stone', outputQty: 8,
    alwaysKnown: true, materials: { chalkstone: 2 }, coins: { florin: 1 },
  },
  {
    id: 'craft_block_fence_wood', kind: 'block', outputId: 'fence_wood', outputQty: 6,
    alwaysKnown: true, materials: { ironwood: 2 }, coins: { florin: 1 },
  },
  {
    id: 'craft_block_wall_stone', kind: 'block', outputId: 'wall_stone', outputQty: 4,
    alwaysKnown: true, materials: { chalkstone: 3 }, coins: { florin: 1 },
  },
  {
    id: 'craft_block_lamp_post', kind: 'block', outputId: 'lamp_post', outputQty: 2,
    alwaysKnown: true, materials: { ironwood: 1, copperwire: 1, resin: 1 }, coins: { florin: 1 },
  },
  {
    id: 'craft_block_planter', kind: 'block', outputId: 'planter', outputQty: 4,
    alwaysKnown: true, materials: { ironwood: 1, chalkstone: 1 }, coins: { florin: 1 },
  },
  {
    id: 'craft_block_signpost', kind: 'block', outputId: 'signpost', outputQty: 2,
    alwaysKnown: true, materials: { ironwood: 2 }, coins: { florin: 1 },
  },
]);

/** Recipes that need no blueprint. Blocks are free knowledge; see above. */
export const ALWAYS_KNOWN_RECIPE_IDS = Object.freeze(
  RECIPES.filter((r) => r.alwaysKnown).map((r) => r.id)
);

export function isAlwaysKnown(recipeId) {
  return ALWAYS_KNOWN_RECIPE_IDS.includes(recipeId);
}

/** How many units one craft of this recipe produces (blocks come in batches). */
export function outputQtyOf(recipe) {
  const n = Math.round(Number(recipe && recipe.outputQty));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Per-unit cost of a batch recipe, as floats. Used for block refunds. */
export function unitCostOf(recipe) {
  const qty = outputQtyOf(recipe);
  const materials = {};
  for (const [id, need] of Object.entries((recipe && recipe.materials) || {})) {
    materials[id] = (Number(need) || 0) / qty;
  }
  const coins = {};
  for (const [id, need] of Object.entries((recipe && recipe.coins) || {})) {
    coins[id] = (Number(need) || 0) / qty;
  }
  return { materials, coins };
}

const RECIPE_BY_OUTPUT = (() => {
  const map = {};
  for (const r of RECIPES) {
    if (!map[r.kind]) map[r.kind] = {};
    map[r.kind][r.outputId] = r;
  }
  return map;
})();

/** getRecipeFor('block', 'fence_wood') -> the recipe that makes it, or null. */
export function getRecipeFor(kind, outputId) {
  return (RECIPE_BY_OUTPUT[kind] && RECIPE_BY_OUTPUT[kind][outputId]) || null;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
const RECIPE_BY_ID = Object.freeze(
  Object.fromEntries(RECIPES.map((r) => [r.id, r]))
);

export function getRecipe(id) {
  return RECIPE_BY_ID[id] || null;
}

/** Human label for a material id (falls back to the raw id). */
export function materialName(id) {
  return (MATERIALS[id] && MATERIALS[id].name) || String(id);
}

/**
 * checkCraft(state, recipeId) -> { ok, missing:[{label, have, need}] }
 * Checks BOTH state.materials and state.player.coins. Never throws; an unknown
 * recipe comes back as not-ok with an explanatory "missing" row.
 */
export function checkCraft(state, recipeId) {
  const recipe = getRecipe(recipeId);
  if (!recipe) {
    return { ok: false, missing: [{ label: `Unknown recipe "${recipeId}"`, have: 0, need: 1 }] };
  }
  const mats = (state && state.materials) || {};
  const wallet = (state && state.player && state.player.coins) || {};
  const missing = [];

  for (const [matId, need] of Object.entries(recipe.materials || {})) {
    const have = Number(mats[matId]) || 0;
    if (have < need) missing.push({ label: materialName(matId), have, need });
  }
  for (const [curId, need] of Object.entries(recipe.coins || {})) {
    const have = Number(wallet[curId]) || 0;
    if (have < need) {
      const cur = CURRENCIES[curId];
      missing.push({ label: cur ? `${cur.name} coins` : `${curId} coins`, have, need });
    }
  }
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Development-time sanity checks. These are cheap and catch a constants.js
// change that silently desyncs footprints or id lists.
// ---------------------------------------------------------------------------
function assertKeys(label, obj, ids) {
  const keys = Object.keys(obj);
  const missing = ids.filter((id) => !keys.includes(id));
  const extra = keys.filter((k) => !ids.includes(k));
  if (missing.length || extra.length) {
    throw new Error(
      `recipes.js: ${label} key mismatch. missing=[${missing}] extra=[${extra}]`
    );
  }
}
assertKeys('MATERIALS', MATERIALS, ALL_MATERIAL_IDS);
assertKeys('TOOLS', TOOLS, TOOL_IDS);
assertKeys('BUILDINGS', BUILDINGS, BUILDING_IDS);
assertKeys('GADGETS', GADGETS, GADGET_IDS);
assertKeys('BLOCKS', BLOCKS, BLOCK_IDS);
for (const id of ALL_MATERIAL_IDS) {
  if (!RARITIES[MATERIALS[id].rarity]) {
    throw new Error(`recipes.js: material ${id} has unknown rarity`);
  }
}
for (const id of BUILDING_IDS) {
  const fp = BUILDING_FOOTPRINT[id];
  if (BUILDINGS[id].w !== fp.w || BUILDINGS[id].h !== fp.h) {
    throw new Error(`recipes.js: ${id} footprint does not match BUILDING_FOOTPRINT`);
  }
}
// v3: every gadget and every block must be craftable, or it can never be got.
for (const id of GADGET_IDS) {
  if (!getRecipeFor('gadget', id)) throw new Error(`recipes.js: gadget ${id} has no recipe`);
}
for (const id of BLOCK_IDS) {
  if (!getRecipeFor('block', id)) throw new Error(`recipes.js: block ${id} has no recipe`);
}
// v3: every tree drop must be a real material, or a felled tree drops nothing.
for (const id of TREE_DROP_IDS) {
  if (!MATERIALS[id]) throw new Error(`recipes.js: tree drop ${id} is not a material`);
}
// v3: recipe material costs must reference materials that exist.
for (const r of RECIPES) {
  for (const id of Object.keys(r.materials || {})) {
    if (!MATERIALS[id]) throw new Error(`recipes.js: recipe ${r.id} needs unknown material ${id}`);
  }
}
