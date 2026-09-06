// Frozen shared vocabulary. Every module imports from here; nobody redefines these.

export const TILE = 16;
export const WORLD_W = 64;
export const WORLD_H = 48;

// ===========================================================================
// MONEY — two currencies, not four
// ===========================================================================
// focus / insight / grind / spark all collapsed into FLORINS. Four wallets meant
// four numbers to read, four prices per item and a shop you could be too poor
// for in one currency while rich in another.
//
//   FLORINS  gold, the main currency. Everything is priced in them. Earned by
//            studying and by selling what you gather.
//   SHARDS   earned ONLY through real work: study pays Dark Boxes, and Dark
//            Boxes pay shards. Spent on enchanting, and later on companions.
//            Tradeable for florins at the Exchange, deliberately expensively.
//
// The direction is one-way on purpose (shards -> florins, never back), so the
// only route to shards stays doing the work.
export const CURRENCIES = Object.freeze({
  florin: { id: 'florin', name: 'Florins', symbol: '✦', color: '#e8b64c' },
  shard:  { id: 'shard',  name: 'Shards',  symbol: '◈', color: '#7fd7e8' },
});
export const CURRENCY_IDS = Object.freeze(['florin', 'shard']);

/** The one currency everything is priced in. */
export const MAIN_CURRENCY = 'florin';

/**
 * Shards -> Florins at the Exchange. Deliberately steep: a florin bought this
 * way must cost more work than a florin earned by studying or selling, or
 * shards become a shortcut past the game.
 */
export const SHARD_TO_FLORIN = Object.freeze({ shards: 25, florins: 1 });

// Work types used to SPLIT a payout across the four currencies. With one coin
// there is nothing to split, so the difference between kinds of work becomes a
// multiplier on the florins they pay: a Project is still worth more than an
// evening of reading, it just arrives in one wallet.
//
// `pay` is centred on 1.0 so the total economy is unchanged by the collapse.
export const WORK_TYPES = Object.freeze({
  reading:  { id: 'reading',  name: 'Reading',  pay: 0.95 },
  practice: { id: 'practice', name: 'Practice', pay: 1.00 },
  project:  { id: 'project',  name: 'Project',  pay: 1.15 },
  writing:  { id: 'writing',  name: 'Writing',  pay: 1.10 },
  revision: { id: 'revision', name: 'Revision', pay: 0.95 },
  lab:      { id: 'lab',      name: 'Lab',      pay: 1.10 },
});
export const WORK_TYPE_IDS = Object.freeze(Object.keys(WORK_TYPES));

// Subjects are user-editable in a later version; the prototype ships with these.
// Subjects keep their identity the same way work types do: as a multiplier on
// the florins the work pays. The old per-currency bias is collapsed into one
// number (roughly its average), so a maths problem set still pays a little
// better than the same hour of "other".
export const SUBJECTS = Object.freeze([
  { id: 'math',    name: 'Mathematics',  color: '#4aa3ff', pay: 1.10 },
  { id: 'cs',      name: 'Computer Sci', color: '#5ad18a', pay: 1.10 },
  { id: 'econ',    name: 'Economics',    color: '#ffd93d', pay: 1.05 },
  { id: 'history', name: 'History',      color: '#c98a5a', pay: 1.05 },
  { id: 'lang',    name: 'Languages',    color: '#a86cff', pay: 1.05 },
  { id: 'other',   name: 'Other',        color: '#9aa0aa', pay: 1.00 },
]);
export const SUBJECT_PAY = Object.freeze(
  Object.fromEntries(SUBJECTS.map((s) => [s.id, s.pay]))
);

export const RANKS = Object.freeze(['F', 'D', 'C', 'B', 'A', 'S']);
export const RANK_MULT = Object.freeze({ F: 0.2, D: 0.5, C: 0.8, B: 1.1, A: 1.4, S: 1.8 });
export const RANK_COLOR = Object.freeze({
  F: '#7a7f88', D: '#9aa0aa', C: '#5ad18a', B: '#4aa3ff', A: '#a86cff', S: '#ffd93d',
});

export const RARITIES = Object.freeze({
  common:    { id: 'common',    name: 'Common',    weight: 58, color: '#9aa0aa' },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  weight: 26, color: '#5ad18a' },
  rare:      { id: 'rare',      name: 'Rare',      weight: 11, color: '#4aa3ff' },
  epic:      { id: 'epic',      name: 'Epic',      weight: 4,  color: '#a86cff' },
  legendary: { id: 'legendary', name: 'Legendary', weight: 1,  color: '#ffd93d' },
});

export const TILE_TYPES = Object.freeze({
  grass: 0, path: 1, water: 2, stone: 3, tree: 4, sand: 5,
  // v5: the Blue Bloom. Its own tile because it needs its own art, its own
  // gather rule and its own drop — a recoloured tree would have been felled by
  // the same code that fells every other tree and dropped timber.
  bluetree: 6,
  // v6: the Snowfall Reaches. Snow walks like grass; ice walks like path but
  // reads differently; a snowpine is the north's tree and blocks like one.
  snow: 7,
  ice: 8,
  snowpine: 9,
  crag: 10,
  // v7: the mountain. A cliff FACE is the rock you see under a terrace edge and
  // is never walkable. A ladder or a stair is the only tile you may change
  // layer on. Cracked crag is a wall until you have the Stone Hammer. An ice
  // gate is a wall while its plates are unheld; a plate is floor you can stand
  // on and a boulder can rest on.
  cliff: 11,
  ladder: 12,
  stair: 13,
  crackedcrag: 14,
  icegate: 15,
  plate: 16,
  // The floor of the summit cave: worn rock, walkable. `stone` could not be
  // used — that is the Home Block's minable boulder and it is solid.
  rockfloor: 17,
  // RIMEWALL: piled stone bound in ice. The labyrinth and the dungeon are built
  // of it because NO TOOL IN THE GAME TOUCHES IT. The maze's walls used to be
  // snowpines, which are a gather node — so the axe you arrive with made the
  // whole labyrinth optional.
  rimewall: 18,
  // A road in the snow: packed grit and boot-ice, not the Home Block's brown
  // dirt. Every road up here was drawn with Home's path tile, which read as a
  // garden path laid across a mountain.
  snowroad: 19,
  // A door with a lock in it. Solid until you carry its key — the oldest gate
  // in the genre, and the first one in this game that a KEY opens rather than a
  // level, a plate or a tool.
  lockdoor: 20,
  // Furniture. Solid, and drawn as what it is: a lit brazier and a stack of
  // crates. Both were standing in as OTHER tiles — the brazier as a pressure
  // plate, which is the one thing in the game a player must never misread.
  brazier: 21,
  crate: 22,
});
/**
 * WHICH TILES ARE TIMBER — i.e. behave like a tree everywhere it matters:
 * finite, replantable, dropping the tree table, and leaving a stump when felled.
 * A set rather than `tile === 'tree'` scattered about, because the Reaches added
 * a second one and there will be a third.
 */
export const TIMBER_TILES = Object.freeze(['tree', 'snowpine']);

export const SOLID_TILES = Object.freeze([
  TILE_TYPES.water, TILE_TYPES.tree, TILE_TYPES.stone, TILE_TYPES.bluetree,
  TILE_TYPES.snowpine, TILE_TYPES.crag,
  // A cliff face is rock seen edge-on; cracked crag is rock until it is broken.
  // An ice gate is solid CLOSED and its openness is decided per-frame, so it is
  // solid here and the world lets you through when its plates are held.
  TILE_TYPES.cliff, TILE_TYPES.crackedcrag, TILE_TYPES.icegate,
  TILE_TYPES.rimewall,
  // Solid by default; the world lets you through when you hold the key.
  TILE_TYPES.lockdoor,
  TILE_TYPES.brazier, TILE_TYPES.crate,
]);

export const PALETTE = Object.freeze({
  bg: '#12141c', panel: '#1c1f2b', panelLight: '#272b3a', border: '#3a4054',
  text: '#e6e8ef', textDim: '#9aa0aa', accent: '#ffd93d', good: '#5ad18a', bad: '#ff6b6b',
});

export const DAILY_SESSION_COIN_CAP = 400;
export const PITY_THRESHOLD = 12; // boxes without epic+ before one is guaranteed

// --- Frozen id lists. Agent B draws sprites for these; agent C defines their stats.
// Neither may add, rename, or remove ids without the integrator changing this file.
export const MATERIAL_IDS = Object.freeze([
  // INKGLASS REMOVED (Bruno, 2026-09-02). It was the reeds' yield; the reeds
  // went, and rather than invent a new source for a material nothing could
  // reach, the material and every recipe that called for it go too.
  'ironwood', 'chalkstone', 'copperwire', 'lenscrystal',
  // v5: pulled out of the lake from a boat. A material rather than a special
  // case, so it stacks, shows in the Bag and sells through the ordinary path —
  // only its PRICE is special (4 for 1), and that is one line in
  // SELL_BUNDLE_OVERRIDE.
  'wild_tuna',
  'runeplate', 'voidshard', 'sunfiber',
]);
export const TOOL_IDS = Object.freeze([
  'focus_lamp', 'quill_of_clarity', 'grindstone', 'insight_lens',
  'chrono_hourglass', 'sparkforge_hammer',
  // v2 gathering tools — these have durability and act on the world
  'axe', 'pickaxe', 'dredge', 'sifter',
]);
export const BUILDING_IDS = Object.freeze([
  'study_hut', 'library', 'forge', 'observatory', 'lab', 'shrine', 'workshop',
  // v2 — shops you can walk into
  'trading_post', 'archive',
  // v5 — the two vendors that are PLACES rather than tabs. Splitting the
  // Archive from the Market left the Exchange with nowhere to stand, and the
  // Woodsman needs somewhere to hide.
  'exchange_post', 'woodsman_camp', 'stonemason_camp',
]);
export const BUILDING_FOOTPRINT = Object.freeze({
  study_hut: { w: 2, h: 2 }, library: { w: 3, h: 2 }, forge: { w: 2, h: 2 },
  observatory: { w: 2, h: 3 }, lab: { w: 3, h: 2 }, shrine: { w: 1, h: 2 },
  workshop: { w: 3, h: 3 }, trading_post: { w: 3, h: 2 }, archive: { w: 2, h: 2 },
  // The roulette table is the wide half of the Exchange's footprint.
  exchange_post: { w: 3, h: 2 }, woodsman_camp: { w: 2, h: 2 },
  // The Stonemason's is drawn as a MOUNTAIN — the peak overhangs upward well
  // past this footprint, which is only the ground the mouth stands on. Wide,
  // because a mountain that is narrower than the rock around it reads as a tent.
  stonemason_camp: { w: 5, h: 2 },
});

// ===========================================================================
// v2 — gathering, energy, shops, blueprints, save slots
// ===========================================================================

// STAMINA (v3, was "Energy") is a pacing meter, not a gate on studying.
// It regenerates on its own so the world is always playable; what studying
// buys you is REACH — coins, rare drops, and access to new regions of the map,
// which is where the materials that matter actually live. The incentive to
// study is positive (better places open up) rather than restrictive
// (a meter refuses you). See REGIONS below.
export const STAMINA_REGEN_PER_MINUTE = 100;   // full bar from empty in ~1 min
export const BASE_MAX_STAMINA = 100;

// Studying still tops stamina up instantly — a nice-to-have, not the only source.
export const STAMINA_PER_TRACKED_MINUTE = 1 / 3;
export const STAMINA_PER_TASK_DIFFICULTY = 8;

// Back-compat aliases so nothing that already imports these breaks mid-migration.
export const ENERGY_PER_TRACKED_MINUTE = STAMINA_PER_TRACKED_MINUTE;
export const ENERGY_PER_TASK_DIFFICULTY = STAMINA_PER_TASK_DIFFICULTY;
export const BASE_MAX_ENERGY = BASE_MAX_STAMINA;

// How much each BUILDING TYPE adds to the stamina ceiling, counted once per
// type so raising five study huts is not a strategy. This lives here rather
// than in server/api.js because store.js needs it too: a new save must start
// with a FULL bar, and "full" is not BASE_MAX_ENERGY — spawn already ships with
// a Study Hut, so the real ceiling on turn one is higher than the base.
export const ENERGY_BONUS_BY_BUILDING = Object.freeze({
  study_hut: 10, library: 10, forge: 10, observatory: 10,
  lab: 15, shrine: 20, workshop: 30, trading_post: 0, archive: 0,
});

/** The stamina ceiling for a given set of raised buildings. */
/**
 * WHAT A LEVEL BUYS YOU: stamina.
 *
 * Until now a level did nothing at all except open the Stonemason's door at 10
 * — a number that gated exactly one vendor and was otherwise decoration.
 * Stamina is the right reward because it is the thing every other system spends:
 * more of it means more gathering and more tracked study between rests, so
 * levelling makes the loop you already play longer rather than bolting a new
 * one on.
 */
export const STAMINA_PER_LEVEL = 2;

export function maxEnergyFor(buildings, level) {
  let bonus = 0;
  const counted = new Set();
  for (const b of (Array.isArray(buildings) ? buildings : [])) {
    if (!b || typeof b !== 'object') continue;
    if (counted.has(b.buildingId)) continue;
    counted.add(b.buildingId);
    bonus += ENERGY_BONUS_BY_BUILDING[b.buildingId] || 0;
  }
  // Level 1 grants nothing, so a new save is unchanged.
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return BASE_MAX_ENERGY + bonus + STAMINA_PER_LEVEL * (lv - 1);
}

export const GATHER_NODES = Object.freeze({
  tree:  { id: 'tree',  tile: 'tree',  tool: 'axe',      energy: 4, yields: 'ironwood',   qty: [1, 3], respawnHours: 6,  hits: 3 },
  // THE NORTH'S TREE (Bruno, 2026-09-03: "I should be able to fell trees in the
  // snowy biome too"). Same axe, same timber, one more hit for the frozen wood.
  // It is a TIMBER tile — see TIMBER_TILES — so it inherits the whole tree deal:
  // finite, replantable, and the same drop table.
  snowpine: { id: 'snowpine', tile: 'snowpine', tool: 'axe', energy: 5, yields: 'ironwood', qty: [1, 3], respawnHours: 6, hits: 4 },
  stone: { id: 'stone', tile: 'stone', tool: 'pickaxe',  energy: 6, yields: 'chalkstone', qty: [1, 2], respawnHours: 10, hits: 4 },
  // v7: cracked crag. `gear` rather than `tool` — the Stone Hammer is Reaches
  // gear, which is passive and never occupies a hand, so this node asks what
  // you HAVE rather than what you are holding. Everything else about it (hits,
  // stamina, particles, the prompt) it inherits from the node machinery.
  crackedcrag: {
    id: 'crackedcrag', tile: 'crackedcrag', gear: 'hammer', energy: 6,
    yields: 'chalkstone', qty: [1, 2], respawnHours: null, hits: 3,
    finite: true, plantable: false,
  },
  // REEDS REMOVED (Bruno, 2026-09-02): "remove reed dredges and the water
  // should be normal water, not water + reeds." Water is water now — nothing
  // is harvested from it, and the lake is for boats.
  //
  sand:  { id: 'sand',  tile: 'sand',  tool: 'sifter',   energy: 3, yields: 'copperwire', qty: [1, 2], respawnHours: 8,  hits: 2 },
  // The Blue Bloom, in the north-west. There is exactly one on the map, it
  // never grows back, and it yields no material at all — only the Blue Key.
  // `finite: true` is explicit here rather than inferred from the tile, because
  // the finite rule was written as "is it a tree", and this is not one.
  bluetree: {
    id: 'bluetree', tile: 'bluetree', tool: 'axe', energy: 8,
    yields: null, questItem: 'blue_key', qty: [1, 1],
    respawnHours: null, hits: 5, finite: true, plantable: false,
  },
});

// Gathering tools are separate from the passive bonus tools in TOOL_IDS.
// The dredge is gone with the reeds. `TOOLS.dredge` and its TOOL_IDS entry are
// KEPT so a save that already owns one still renders its name rather than
// showing `undefined`; the migration takes it out of the pack.
export const GATHER_TOOL_IDS = Object.freeze(['axe', 'pickaxe', 'sifter']);
export const TOOL_DURABILITY = Object.freeze({ axe: 60, pickaxe: 50, dredge: 40, sifter: 45 });

export const SHOP_IDS = Object.freeze(['merchant', 'archivist', 'broker', 'exchange']);

// Recipes must be unlocked with a blueprint before they can be crafted.
// These few are known from the start so a new save is never soft-locked.
export const STARTER_BLUEPRINTS = Object.freeze([
  'craft_axe', 'craft_pickaxe', 'craft_focus_lamp', 'build_study_hut',
]);

export const MAX_SAVE_SLOTS = 5;


// ===========================================================================
// v3 — REGIONS: what studying actually buys
// ===========================================================================
// The map is divided into regions. The starting one is always open; the rest
// unlock against milestones that can ONLY be moved by real study. Each region
// deeper holds materials the previous one cannot yield, so grinding the starting
// meadow is always possible and always the worst option available.
//
// `requires` is checked against lifetime study totals, never against coins —
// you cannot buy your way into a region.
export const REGIONS = Object.freeze([
  {
    id: 'meadowlands', name: 'The Meadowlands', order: 0,
    blurb: 'Where every scholar starts. Common wood and stone, and not much else.',
    requires: null,
    materials: ['ironwood', 'chalkstone', 'copperwire'],
  },
  {
    id: 'thicket', name: 'The Deepening Thicket', order: 1,
    blurb: 'Older trees, and the first sunfiber. Something moves between the trunks.',
    requires: { tasksCompleted: 5 },
    materials: ['ironwood', 'sunfiber'],
  },
  {
    id: 'quarry', name: 'Quarry Ridge', order: 2,
    blurb: 'Cut stone and exposed seams. The Lenscrystal starts here.',
    requires: { studyMinutes: 600 },          // 10 tracked hours
    materials: ['chalkstone', 'copperwire', 'lenscrystal'],
  },
  {
    id: 'drowned', name: 'The Drowned Archive', order: 3,
    blurb: 'A library the water took. Runeplate, and pages still legible.',
    requires: { level: 15, tasksCompleted: 20 },
    materials: ['lenscrystal', 'runeplate'],
  },
  {
    id: 'ashen', name: 'The Ashen Waste', order: 4,
    blurb: 'Nothing grows. Voidshard does not grow either — it accumulates.',
    requires: { level: 25, studyMinutes: 2400 },   // 40 tracked hours
    materials: ['runeplate', 'voidshard'],
  },
]);

// Rare drops from studying itself, independent of Dark Boxes. High-ranking work
// on hard tasks occasionally yields a material directly — the reward for doing
// the difficult thing well rather than the frequent thing often.
export const STUDY_DROP_MIN_RANK = 'A';
export const STUDY_DROP_BASE_CHANCE = 0.18;      // at rank A, difficulty 1
export const STUDY_DROP_PER_DIFFICULTY = 0.05;   // +5% per point of difficulty

// ===========================================================================
// v3 — Home Block: places not buttons, finite trees, gadgets, blocks
// ===========================================================================

// What each building lets you DO when you stand next to it and press E.
// This is the authority — no panel may be opened from a dock button if its
// capability appears here.
export const BUILDING_ROLES = Object.freeze({
  study_hut:    ['craft'],
  workshop:     ['craft', 'blocks'],
  forge:        ['craft', 'repair'],
  // The Market SELLS GOODS and nothing else; the Archive deals in BLUEPRINTS
  // and nothing else. They used to share one panel that showed everything at
  // both, which made the two buildings interchangeable and the split pointless.
  trading_post:  ['shop'],
  archive:       ['blueprints'],
  exchange_post:   ['exchange'],
  // Two buyers, two materials, two corners of the map. The Stonemason is in the
  // mountain cave in the south-east and takes STONE; the Woodsman is in the
  // bottom-left woods and takes TIMBER. Neither will touch the other's trade.
  woodsman_camp:   ['woodsman'],
  stonemason_camp: ['stonemason'],
  library:      ['study'],
  observatory:  ['boxes'],
  shrine:       ['boxes'],
  lab:          ['craft'],
});

/**
 * The Woodsman's cave, in the south-east of the Home Block. `x/y/w/h` is the
 * chamber floor; the ring one tile outside is forced to stone by the world
 * generator. `mouthX/mouthY` is where the corridor starts, running east in.
 *
 * It lives in the shared vocabulary because BOTH sides need it: the client
 * carves the tiles, and the server places the Woodsman's camp inside. A cave
 * the client digs and the server does not know about gets a vendor bricked
 * into a wall.
 */
export const CAVE = Object.freeze({ x: 52, y: 36, w: 5, h: 4, mouthX: 48, mouthY: 37 });

/**
 * The Woodsman's clearing, in the south-WEST woods. A patch of open ground
 * ringed by trees rather than stone — he is hidden by the forest, not under it.
 */
/**
 * The Woodsman's clearing, in the south-WEST woods.
 *
 * Ringed by trees on every side but ONE — `doorX` on the south edge is the
 * single gap, and the only way in without an axe. Bruno, 2026-08-31: "I liked
 * how the woodsman was surrounded by trees except by one block which was the
 * entrance, can you redo that?"
 *
 * The gap has to be DECLARED rather than fall out of what happens to be carved
 * there. It was previously wherever the approach path crossed the ring, which
 * with a two-tile-wide path meant two gaps — and the plaza road arriving on the
 * ring made a third. A door is a design decision, not a side effect.
 */
export const GROVE = Object.freeze({ x: 7, y: 37, w: 5, h: 4, doorX: 9 });

/**
 * The Blue Bloom's glade, in the NORTH-WEST corner.
 *
 * One node, at a fixed tile, in a clearing carved out of the noise so it can
 * always be found and always be walked up to. It is the whole of the Woodsman's
 * unlock, so "the seed happened not to put trees there" is not an acceptable
 * failure mode.
 */
export const BLOOM = Object.freeze({ x: 6, y: 5, clearR: 3 });

/**
 * WHERE A NEW GAME BEGINS — the gap in the middle of the four plaza buildings.
 *
 * Bruno, 2026-08-31: "all new games should start with the player spawning in
 * the center of the four buildings, in the middle of the map."
 *
 * The four are Study Hut (22,17 2x2), Trading Post (26,17 3x2), Archive
 * (22,20 2x2) and Exchange (26,20 3x2) — together they span x 22..28 and
 * y 17..21, so their centre is (25, 19), and that tile is the open ground
 * between all four rather than a corner of any of them. The old spawn was
 * (24,18), which is level with the TOP pair and reads as standing beside the
 * Study Hut instead of in the middle of the square.
 *
 * A new save's position comes from here; `PLAZA` still describes the plaza the
 * world CARVES, which is a different thing and is deliberately left alone.
 */
export const SPAWN = Object.freeze({ x: 25, y: 19 });

/**
 * The village square — the ground the four starting buildings box in, and the
 * path cross through it.
 *
 * Lives HERE rather than in web/world/world.js because the server needs it too:
 * planting is refused inside it, and the server is the authority on that. The
 * world still re-exports it so nothing that imported it from there breaks.
 */
export const PLAZA = Object.freeze({ cx: 24, cy: 18, w: 12, h: 12 });

export function inPlaza(x, y) {
  const hx = PLAZA.w / 2;
  const hy = PLAZA.h / 2;
  return x >= PLAZA.cx - hx && x < PLAZA.cx + hx && y >= PLAZA.cy - hy && y < PLAZA.cy + hy;
}

/**
 * Where a vendor's NPC stands: one tile below the front edge of his building,
 * centred. Mirrors the placement in web/world/world.js — and lives here so the
 * SERVER can work it out too, which is what "do not let a tree grow on top of
 * the Woodsman" requires.
 */
export function npcStandTile(buildingId, bx, by, fp) {
  const w = (fp && fp.w) || 1;
  const h = (fp && fp.h) || 1;
  return { x: bx + Math.floor(w / 2), y: by + h };
}

/** How far from a standing NPC the ground is kept clear, in tiles. */
export const NPC_CLEAR_RADIUS = 1;

/**
 * IS PLANTING FORBIDDEN HERE?
 *
 * Bruno, 2026-09-01: *"in this area, seeds should not be allowed to be planted
 * (would obstruct the buildings and the npcs). this also applies to the area
 * near the woodsman npc (the soil 1 block right next to it)."*
 *
 * Two rules, one function, shared by the client's prompt and the server's
 * refusal — a tree that the world declines to offer but the API would happily
 * plant is the shape of bug this project keeps shipping.
 *
 * 1. ROUND A BUILDING. One clear tile on every side. A mature tree is a SOLID
 *    tile and trees do not grow back, so one planted between the Market and the
 *    Archive walls off a doorway permanently.
 * 2. ROUND AN NPC. Every standing vendor keeps a clear tile on each side. The
 *    Woodsman is the one that matters: he stands in a clearing barely wider
 *    than he is, and a tree beside him is a vendor you cannot reach.
 *
 * `buildings` is the save's building list. With none, nothing is blocked —
 * there is nothing to obstruct.
 */
export function plantingBlockedAt(x, y, buildings, footprintOf) {
  // 0. THE STORAGE HUT. It is carved terrain with a sprite rather than a
  //    building record, so the loop below never sees it — and a hut you can
  //    plant a tree against is the same problem as a Market you can, which is
  //    what this rule exists for. Same one-tile halo as everything else.
  if (x >= HUT.x - 1 && x <= HUT.x + HUT.w && y >= HUT.y - 1 && y <= HUT.y + HUT.h) {
    return 'building';
  }
  const list = Array.isArray(buildings) ? buildings : [];
  // 1. A ONE-TILE HALO ROUND EVERY BUILDING.
  //
  // Not a plaza box: the first pass blocked the whole 12x12 PLAZA, which
  // sterilised a large square of map for a problem that is really about
  // DOORWAYS, and broke an unrelated planting test five tiles from any wall.
  // A halo is tighter, self-maintaining — it follows a building if it moves,
  // and covers anything raised later — and it is exactly what the picture
  // showed: the gaps between the four plaza buildings, all of which are within
  // one tile of a wall.
  for (const b of list) {
    if (!b || !b.buildingId) continue;
    const fp = typeof footprintOf === 'function'
      ? footprintOf(b.buildingId)
      : BUILDING_FOOTPRINT[b.buildingId];
    const bx = Number(b.x) || 0;
    const by = Number(b.y) || 0;
    const w = (fp && fp.w) || 1;
    const h = (fp && fp.h) || 1;
    if (x >= bx - 1 && x <= bx + w && y >= by - 1 && y <= by + h) return 'building';
  }
  for (const b of list) {
    if (!b || !b.buildingId) continue;
    const roles = BUILDING_ROLES[b.buildingId];
    // 2. Only buildings that HAVE a standing vendor. A Study Hut has nobody
    //    outside it to bury.
    if (!roles || !roles.length) continue;
    if (!NPC_AT_BUILDING[b.buildingId]) continue;
    const fp = typeof footprintOf === 'function'
      ? footprintOf(b.buildingId)
      : BUILDING_FOOTPRINT[b.buildingId];
    const t = npcStandTile(b.buildingId, Number(b.x) || 0, Number(b.y) || 0, fp);
    if (Math.abs(x - t.x) <= NPC_CLEAR_RADIUS && Math.abs(y - t.y) <= NPC_CLEAR_RADIUS) {
      return 'npc';
    }
  }
  return null;
}

/**
 * Which buildings have somebody standing outside them. Mirrors NPC_AT_BUILDING
 * in web/world/world.js; here so the planting rule can be shared.
 */
export const NPC_AT_BUILDING = Object.freeze({
  exchange_post: 'exchange',
  woodsman_camp: 'woodsman',
  stonemason_camp: 'stonemason',
});

/**
 * QUEST ITEMS — carried, countable, and never sellable.
 *
 * Deliberately NOT materials. A material can be sold, crafted with, and rolled
 * out of a dark box, and every one of those would be a way to get the Blue Key
 * without finding the Blue Bloom. They live in `state.questItems` for the same
 * reason.
 */
export const QUEST_ITEMS = Object.freeze({
  blue_key: Object.freeze({
    id: 'blue_key',
    name: 'Blue Key',
    symbol: '⚿',
    color: '#5fc9e8',
    desc: 'A cold, faintly glowing spore-key cut from the Blue Bloom. The Woodsman has been waiting years for one.',
  }),
  silver_key: Object.freeze({
    id: 'silver_key',
    name: 'Silver Key',
    symbol: '⚷',
    color: '#cdd6e0',
    desc: 'Cut for the storage hut in the north-east woods. Somebody is still inside it.',
  }),
  brass_key: Object.freeze({
    id: 'brass_key',
    name: 'Brass Key',
    symbol: '⚸',
    color: '#e8b64c',
    desc: 'Hangs on a hook in the Elderwatch guardroom. It opens the keep, and the garrison '
      + 'has long since stopped wondering why anyone would want to go in.',
  }),
  ashen_standard: Object.freeze({
    id: 'ashen_standard',
    name: 'The Ashen Standard',
    symbol: '⚑',
    color: '#c9c0d8',
    desc: 'Twelve families\' banner, grey with forty years of somebody else\'s dust. Carry it '
      + 'back to the farlands and they will raise the Levy.',
  }),
  /**
   * RANON'S RING, in the chest beside the Standard's stand.
   *
   * The Herald named him on the road: the false heir on Gotham's throne, who
   * killed his own father to take the realm. This is his, and it is here — in
   * the one room of the one fort that was told not to ask questions — which is
   * the whole reveal. He did not lose the Standard. He FILED it.
   *
   * You need it to read the Codex, and the Codex is where you learn why he
   * wanted it kept somewhere no one would ever read it. That it costs anything
   * to carry is not something the game says yet.
   */
  ranons_ring: Object.freeze({
    id: 'ranons_ring',
    name: "Ranon's Ring",
    symbol: '◉',
    color: '#8f6fc4',
    desc: 'A heavy signet, the crest filed flat and re-cut. Cold in a way the Reaches never '
      + 'managed. Hold it against a written page and the writing changes its mind.',
  }),
  /**
   * THE CODEX. Behind the barred door of the Elderwatch guardroom, which is
   * the one lock in the fort that opens onto knowledge rather than a way on.
   *
   * It is not a manual. It is a LEDGER OF WHAT YOU HAVE SEEN, and the watch
   * have been keeping it for forty years without reading it — which is the
   * same joke as the Standard, told smaller.
   */
  codex: Object.freeze({
    id: 'codex',
    name: 'The Codex',
    symbol: '❦',
    color: '#d8c89a',
    desc: 'A garrison ledger, half-filled in a dozen hands. The blank pages fill themselves '
      + 'in as you go: every material, place and person you meet writes itself down.',
  }),
});
export const QUEST_ITEM_IDS = Object.freeze(Object.keys(QUEST_ITEMS));

/**
 * WHO WILL TRADE WITH YOU, AND WHAT IT TAKES.
 *
 * Both outlanders start CLOSED. The Stonemason wants a reputation he can see —
 * a level — and the Woodsman wants the Blue Key. Written as data because the
 * server enforces it and the dialogue explains it, and those two drifting apart
 * is how you get an NPC who refuses you while telling you he is open.
 */
export const VENDOR_LOCKS = Object.freeze({
  stonemason: Object.freeze({ kind: 'level', level: 10 }),
  woodsman: Object.freeze({ kind: 'questItem', itemId: 'blue_key' }),
});
export const LOCKED_VENDOR_IDS = Object.freeze(Object.keys(VENDOR_LOCKS));

/**
 * XP, the second currency of progress.
 *
 * Selling pays per UNIT, not per sale, so a stack of twenty is twenty times the
 * experience of one — otherwise the cheapest strategy is twenty separate sales.
 */
/**
 * WHAT SELLING PAYS — in BUNDLES, not per unit.
 *
 * Bruno, 2026-08-31: *"the florins are meant to be rare and expensive... by
 * selling you should obtain 1-2 florins and them to be expensive (5 ironwood
 * for 1 florin in market and 7 ironwood for 2 florins in the woodsman npc;
 * these amounts can be escalable to more ironwood for more florins)."*
 *
 * So a sale is `floor(qty / per) * pay`, and the REMAINDER IS NOT TAKEN —
 * selling 12 ironwood in town pays 2 florins and hands 2 back. Shaving the
 * remainder off would be quietly charging for nothing, and the shard Exchange
 * already set the precedent of leaving it.
 *
 * Keyed by rarity so every material is covered and the outlanders stay better
 * value at every tier. Ironwood and Chalkstone are common, which is where
 * Bruno's two numbers land: 5 -> 1 in town, 7 -> 2 out in the world.
 */
export const SELL_BUNDLES = Object.freeze({
  town: Object.freeze({
    common:    Object.freeze({ per: 5, pay: 1 }),
    uncommon:  Object.freeze({ per: 3, pay: 1 }),
    rare:      Object.freeze({ per: 2, pay: 1 }),
    epic:      Object.freeze({ per: 1, pay: 1 }),
    legendary: Object.freeze({ per: 1, pay: 3 }),
  }),
  // Better at every tier — the walk out to them is what you are paid for.
  outlander: Object.freeze({
    common:    Object.freeze({ per: 7, pay: 2 }),
    uncommon:  Object.freeze({ per: 4, pay: 2 }),
    rare:      Object.freeze({ per: 2, pay: 2 }),
    epic:      Object.freeze({ per: 1, pay: 2 }),
    legendary: Object.freeze({ per: 1, pay: 5 }),
  }),
});

/** The bundle a vendor pays for a material of this rarity. */
export function sellBundle(rarity, vendor, materialId) {
  const town = vendor === 'merchant' || vendor === 'town';
  const over = materialId && SELL_BUNDLE_OVERRIDE[materialId];
  if (over) return town ? over.town : over.outlander;
  const table = town ? SELL_BUNDLES.town : SELL_BUNDLES.outlander;
  return table[rarity] || table.common;
}

/**
 * How much a NEW purse holds. Was 120, when a common material sold for 8
 * florins each; a florin is now worth about five of them.
 */
/**
 * CHARMS — worn, not held.
 *
 * Bruno, 2026-08-31: *"the trading shop should instead sell gear and charms
 * that give small speed boosts (very expensive in florins) or the lanterns."*
 *
 * They are NOT gadgets (one-shot consumables) and NOT tools (they never touch a
 * node). A charm sits in one of two charm slots and its effect applies for as
 * long as it is worn, which is why the paper-doll already had `charm1`/`charm2`
 * waiting for them.
 *
 * `speed` multiplies walking pace. `light` is the radius in TILES that the
 * wearer can see inside a dark place; 0 means the charm does not light
 * anything.
 */
export const CHARMS = Object.freeze({
  lantern_charm: Object.freeze({
    id: 'lantern_charm',
    name: 'Everburning Lantern',
    symbol: '🏮',
    color: '#ffd98a',
    price: 12,
    speed: 1,
    // HALF A BLOCK AROUND YOU, and no more. Bruno, 2026-08-31: "it should light
    // less area, around the player 1/2 block in a circular direction."
    //
    // 1.5 tiles of radius is a circle three tiles across: your own tile, plus
    // about half a block of ground in every direction. It was 4.5, which lit
    // most of the chamber at once and made the dark decorative — at this radius
    // you have to walk the cave to learn it, which is the point of a lantern.
    light: 1.5,
    desc: 'Burns without fuel, and not brightly. It shows you the ground at your feet and '
      + 'half a block around them — enough to walk a cave, not enough to see across one.',
  }),
  swift_charm: Object.freeze({
    id: 'swift_charm',
    name: 'Charm of Swift Feet',
    symbol: '➤',
    color: '#8fd7f0',
    price: 40,
    speed: 1.18,
    light: 0,
    desc: 'A worn river stone on a thong. You walk a little faster. Only a little — '
      + 'and the Merchant knows exactly what a little is worth.',
  }),
});
// ONE LANTERN, not two. The Deepwick (34f, 7.5 tiles) was a strictly worse buy
// the moment the Everburning could light the whole chamber for 12 — and now
// that the Everburning lights half a block, a second lantern that trivialises
// the dark is the opposite of what the dark is for. If a bigger dark region
// ever wants a bigger lamp, it can bring its own.
export const CHARM_IDS = Object.freeze(Object.keys(CHARMS));
export const CHARM_SLOT_COUNT = 2;

/** The best light radius among the charms actually worn, in tiles. 0 if none. */
export function lightRadiusOf(charms) {
  let best = 0;
  for (const c of (Array.isArray(charms) ? charms : [])) {
    const def = c && CHARMS[typeof c === 'string' ? c : c.itemId];
    if (def && def.light > best) best = def.light;
  }
  return best;
}

/** Walking pace multiplier from worn charms. They do NOT stack multiplicatively. */
export function speedMultiplierOf(charms) {
  let best = 1;
  for (const c of (Array.isArray(charms) ? charms : [])) {
    const def = c && CHARMS[typeof c === 'string' ? c : c.itemId];
    if (def && def.speed > best) best = def.speed;
  }
  return best;
}

/**
 * HOW DARK A DARK PLACE IS, without a light.
 *
 * Not pitch black on purpose. The Stonemason lives in the cave, and a player
 * who cannot see the way out of the room they just walked into has been
 * punished rather than challenged. You can find the walls; you cannot read the
 * floor. A lantern turns it back into a room.
 */
export const CAVE_DARKNESS = 0.86;
/**
 * How much of the darkness a light lifts at its centre — FULLY, now.
 *
 * It was 0.98 and the pool still fell off far too early, so the middle of the
 * lantern was half-dark and the whole thing read as a warm smudge. Bruno wanted
 * to "see as if it were day your surroundings but slightly tinted like a fire
 * light", and that means the wash is simply absent inside the pool: the tint
 * comes from the warm glow drawn afterwards, not from leaving the room dim.
 * Kept as a named constant because it is a design decision, not a magic number.
 */
export const LIGHT_LIFT = 1;

/**
 * THE HERALD — the Wandering Merchant who rides in at level 20.
 *
 * Bruno, 2026-08-31: he arrives on horseback from the LEFT side of the map,
 * from open ground, rides to the middle, and stays there forever. Talking to
 * him opens the quest that points east.
 *
 * The route is fixed rather than pathfound. `rowY: 22` was measured against the
 * generated world: it is the left-edge row with NO water and the fewest solid
 * tiles between the edge and the centre, so he rides in across open country
 * rather than swimming. `stopX/stopY` is the middle of the map, which happens
 * to be a dirt path — a good place for a man on a horse to stop.
 *
 * `rideMs` is wall-clock, and the ride is derived from `herald.summonedAt`
 * rather than ticked. Close the game halfway through his arrival and he is
 * simply further along when you come back, which is what "he is riding here"
 * should mean.
 */
export const HERALD = Object.freeze({
  id: 'herald',
  level: 20,
  name: 'The Wandering Merchant',
  fromX: -2,
  // The approach row, measured against the generated world: row 22 is the only
  // left-edge row that reaches x=25 with NO trees, NO water and NO stone in the
  // way. He rode row 22 to x=32 before, which took him through a couple of
  // trees and left him standing on the dirt road.
  rowY: 22,
  // THE MIDDLE OF THE FOUR BUILDINGS, not the middle of the map. Bruno,
  // 2026-08-31: "the horse man should stop at the middle between the four
  // buildings." That is SPAWN — the open ground the four plaza buildings box
  // in — and the column from row 22 up to it is clear the whole way.
  stopX: 25,
  stopY: 19,
  rideMs: 16000,
  /** Fraction of the ride spent going east before turning up to the plaza. */
  turnAt: 0.86,
  /** Milliseconds per leg-swap while he is moving. */
  stepMs: 190,
});

/**
 * What he says. Four beats: the arrival, the danger, the ask, the direction.
 *
 * Written as data so the server owns it and the client only draws it — the same
 * rule the outlanders follow. The last beat carries an OBJECTIVE, which the
 * dialogue box renders in italics as its own line.
 */
export const HERALD_DIALOGUE = Object.freeze({
  name: 'The Wandering Merchant',
  lines: Object.freeze([
    'He swings down from the saddle before the horse has fully stopped, and the animal stands steaming in the cold.',
    '"Well met. I have ridden a long way to find someone who is not yet afraid."',
    '"The Kingdom of Gotham is failing. Ranon sits the throne — the false heir, who killed his own father to take full control of the realm — and the border holds only because nobody has yet told the border it has fallen."',
    '"You cannot face him with what you have. But you can Levy the strength of the tribes of the farlands, if you can find someone they will listen to."',
    '"Thou must journey eastward, looking for the Wise Man of the mountain, who lives in the highest of the snowy peaks, and who will be able to guide you in your quest to take back our Kingdom."',
    'He puts a hand on your shoulder, briefly, the way a man does when he does not expect to see you again.',
  ]),
  objective: 'Travel eastward to find the Wise Man of the mountains. '
    + 'Find him, and convince him to tell you his deepest secret.',
});

/**
 * THE LAKE: a hut, a keeper, a boat, and fish.
 *
 * Bruno, 2026-09-02. The chain is: reach level 15 -> buy a Silver Key (5f) ->
 * open the storage hut in the north-east woods -> the Hutkeeper comes out and
 * gives you the wooden boat -> the boat appears in the lake by the cave ->
 * stand on it and press L to fish.
 */
export const HUT = Object.freeze({
  id: 'storage_hut',
  /** North-east, in the woods. The door faces south, onto the tile below it. */
  x: 52, y: 8, w: 3, h: 2,
  /** The level at which the Silver Key appears on the Merchant's counter. */
  keyLevel: 15,
  keyPrice: 5,
});

/** Where the wooden boat is moored once the Hutkeeper hands it over. */
export const BOAT = Object.freeze({ x: 44, y: 40 });

/** How fishing works from the boat. */
export const FISHING = Object.freeze({
  /** One cast per this many milliseconds. */
  intervalMs: 10000,
  /** Chance a cast brings something up. */
  chance: 0.6,
  /** What it brings up, and how many. */
  catchId: 'wild_tuna',
  catchQty: 1,
});

export const HUTKEEPER_DIALOGUE = Object.freeze({
  name: 'The Hutkeeper',
  lines: Object.freeze([
    'The lock turns with a sound like a bone setting, and the door swings out on its own weight.',
    'A man blinks at the daylight, one hand up against it.',
    '"Oh — oh, thank you. Thank you. I have been in there since the last keeper lost the key, '
      + 'and I could not tell you how long that has been."',
    '"There is nothing in there worth having but the boat, and I have no use for a boat. Take it. '
      + 'Truly — take it, it is yours."',
    'He points down the slope, towards the water by the mountain.',
    '"She is not much. But she floats, and the fish out there have never seen a hook."',
  ]),
});

/**
 * WHAT A SALE IS WORTH, when the rarity table is wrong for one thing.
 *
 * Wild Tuna is 4 for 1 florin at the Trading Post, which is Bruno's number and
 * does not match any rarity band. An override table beats bending the bands —
 * they price eight other materials correctly.
 */
export const SELL_BUNDLE_OVERRIDE = Object.freeze({
  wild_tuna: Object.freeze({
    town: Object.freeze({ per: 4, pay: 1 }),
    // The outlanders deal in timber and stone. Nobody out there wants fish, so
    // this exists only so the lookup never returns undefined.
    outlander: Object.freeze({ per: 4, pay: 1 }),
  }),
});

/**
 * THE TWO MAPS.
 *
 * Bruno, 2026-09-02: the Herald sends you east; following the north-east road
 * to the edge of the Home Block takes you to a second map the same size — snowy,
 * Zelda-shaped, with the Wise Man of the mountain somewhere in it.
 *
 * `area` lives on the PLAYER, not on the save, because it is where the scholar
 * is standing — and each area keeps its own last position so walking back and
 * forth does not dump you at a fixed spot every time.
 */
export const AREAS = Object.freeze({
  home: 'home',
  peaks: 'peaks',
  elderwatch: 'elderwatch',
});
export const AREA_IDS = Object.freeze(Object.keys(AREAS));
export const AREA_NAMES = Object.freeze({
  home: 'The Home Block',
  elderwatch: 'Elderwatch',
  peaks: 'The Snowfall Reaches',
});

/**
 * TILE STATE IS PER-MAP.
 *
 * `state.harvested` and `state.plantings` are keyed by tile, and until now the
 * key was bare "x,y" — one namespace shared by both maps. So felling a pine in
 * the Reaches felled the tree on the same coordinates at Home, and Home's
 * stumps and saplings were painted onto the snow. Two maps, one key: the map
 * has to be part of it.
 *
 * The Home Block keeps the BARE key so that every existing save keeps its
 * stumps, its saplings and its felled Blue Bloom with no migration at all. Only
 * the second map, which no save can have written to yet, gets a prefix.
 *
 * Both the server and the renderer derive their keys here, because two copies
 * of a key format is two copies of a rule that will drift.
 */
export function tileKey(area, x, y) {
  const tx = Math.round(Number(x) || 0);
  const ty = Math.round(Number(y) || 0);
  return area && area !== AREAS.home ? `${area}:${tx},${ty}` : `${tx},${ty}`;
}

/**
 * The inverse: read a key back, or null if it belongs to another map.
 * Anything unparseable is treated as "not here" rather than as 0,0.
 */
export function parseTileKey(key, area) {
  const raw = String(key || '');
  const colon = raw.indexOf(':');
  const keyArea = colon === -1 ? AREAS.home : raw.slice(0, colon);
  if (keyArea !== (area || AREAS.home)) return null;
  const parts = raw.slice(colon + 1).split(',');
  const x = parseInt(parts[0], 10);
  const y = parseInt(parts[1], 10);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * THE CROSSING.
 *
 * The Home Block's border is otherwise SEALED — every edge tile is tree or
 * rock, so there is exactly one way out and it is the one the Herald pointed
 * at. `gapY` is the row the north-east road runs out on; stepping onto the last
 * column there crosses over, and you arrive on the matching row of the far map
 * at its western edge.
 *
 * A single named gap rather than "wherever the road happens to reach the edge":
 * the grove taught that lesson — a way in that falls out of what else got
 * carved is a way in that moves every time something adjacent changes.
 */
export const CROSSING = Object.freeze({
  // THE TWO SIDES DO NOT HAVE TO LINE UP. Travelling is a teleport, so Home may
  // keep its road east at the top of the map (past the storage hut, where it
  // has always been) while the Reaches receive you at the BOTTOM — at the foot
  // of the mountain, which is the only place a climb can begin.
  peaksEntryY: 41,
  /** The row the road leaves the Home Block on, and arrives on in the Reaches. */
  gapY: 9,
  /** How many rows tall the gap is. Three, so it reads as a road, not a crack. */
  gapH: 3,
  /** Column you must reach in the Home Block to cross east. */
  homeExitX: 63,
  /** Where you land in the Reaches, and the column you must reach to come back. */
  peaksEntryX: 1,
});

/**
 * THE HIGH PEAK, in the north-east of the Reaches — the highest of the snowy
 * peaks, where the Wise Man lives. A ring of crag with a shoulder of snow
 * inside it and one road up the west face.
 */
export const PEAK = Object.freeze({ x: 48, y: 14, r: 9 });

// ===========================================================================
// v7 — THE MOUNTAIN. Layers, gear, puzzles and the Warden.
// ===========================================================================

/**
 * HOW HIGH ONE TERRACE IS, in screen pixels.
 *
 * The whole third dimension is this number. A tile on layer n is drawn n*LIFT
 * up the screen and the gap it leaves is filled with cliff face, which is the
 * oldest trick in 2D games and the only one that keeps the tile grid intact —
 * every coordinate in the game is still a flat (x, y), and nothing else in the
 * engine has to know that the mountain has height at all.
 */
// Twelve pixels of a sixteen-pixel tile. Big enough that a terrace edge reads
// as a storey rather than a kerb — which is the whole point of drawing height
// at all — and small enough that the tile grid still lines up under it.
export const LAYER_LIFT = 12;
export const LAYER_COUNT = 5;

/**
 * THE MOUNTAIN IS FIVE TERRACES STACKED UP THE SCREEN, and you start on the
 * bottom one. Each is a room with one way up, and that way up is behind that
 * terrace's puzzle. North is higher, always — which is the only arrangement in
 * which the drawn cliff faces (they hang off the SOUTH edge of a terrace) do
 * the work of telling you which way is up.
 */
export const LAYER_NAMES = Object.freeze([
  'The Foot',
  'The Frozen Tarn',
  'The Boulder Terrace',
  'The Shattered Steps',
  'The Summit',
]);

/** The y band each terrace occupies, bottom of the map to the top. */
export const TERRACE_BANDS = Object.freeze([
  Object.freeze({ layer: 0, y0: 32, y1: 46 }),
  Object.freeze({ layer: 1, y0: 24, y1: 31 }),
  Object.freeze({ layer: 2, y0: 17, y1: 23 }),
  Object.freeze({ layer: 3, y0: 9,  y1: 16 }),
  Object.freeze({ layer: 4, y0: 1,  y1: 7 }),
]);

/**
 * REACHES GEAR — passive, always on, never equipped.
 *
 * Deliberately NOT tools. A tool lives in one of two hand slots, and a puzzle
 * you can fail by holding the wrong thing is an errand, not a puzzle. These are
 * found in the world, they are remembered in `state.reaches.gear`, and from
 * then on they are simply true of you.
 */
export const REACHES_GEAR = Object.freeze({
  hooks: {
    id: 'hooks', name: 'Climbing Hooks',
    blurb: 'Iron claws for a frozen ladder. Without them a ladder is scenery.',
    found: 'Climbing Hooks — every ladder in the Reaches is yours now.',
  },
  crampons: {
    id: 'crampons', name: 'Crampons',
    blurb: 'Spiked plates for your boots. Ice stops being a slide and becomes a floor.',
    found: 'Crampons — the ice will hold your feet now.',
  },
  hammer: {
    id: 'hammer', name: 'Stone Hammer',
    blurb: 'A head of blue river-stone. Cracked crag is a wall only until you swing it.',
    found: 'The Stone Hammer — cracked rock is no longer a wall.',
  },
});
export const REACHES_GEAR_IDS = Object.freeze(Object.keys(REACHES_GEAR));

/** What each piece of gear pays when you find it. */
export const REACHES_GEAR_XP = Object.freeze({ hooks: 120, crampons: 150, hammer: 180 });

/**
 * WHERE EACH PIECE LIES. One tile each, at the end of its own puzzle.
 * The server checks the scholar is standing on it before handing it over.
 */
export const GEAR_SITES = Object.freeze([
  // Each lies on the terrace whose puzzle it is the reward for.
  Object.freeze({ gear: 'hooks',    x: 13, y: 35, layer: 0 }),
  Object.freeze({ gear: 'crampons', x: 30, y: 28, layer: 1 }),
  Object.freeze({ gear: 'hammer',   x: 14, y: 9,  layer: 3 }),
]);

/**
 * THE RIME WARDEN.
 *
 * A boss in a game with no combat and no business growing one. So it is a boss
 * the way a Zelda dungeon boss is: a room, a rule and three phases. It paces
 * the shelf in front of the cave; it sees the tiles ahead of it; caught in that
 * line you are put back at the ladder head with every boulder where it started.
 * Three plates held is the kill.
 */
export const WARDEN = Object.freeze({
  id: 'rime_warden',
  name: 'The Rime Warden',
  rowY: 5,
  fromX: 46,
  toX: 60,
  stepMs: 480,
  sight: 4,
  doorX: 48,
  doorY: 7,
  plates: Object.freeze([
    Object.freeze({ id: 'summit_a', x: 50, y: 5 }),
    Object.freeze({ id: 'summit_b', x: 54, y: 5 }),
    Object.freeze({ id: 'summit_c', x: 58, y: 5 }),
  ]),
  boulders: Object.freeze([
    Object.freeze({ id: 'summit_a', x: 47, y: 5 }),
    Object.freeze({ id: 'summit_b', x: 51, y: 5 }),
    Object.freeze({ id: 'summit_c', x: 55, y: 5 }),
  ]),
  xp: 250,
});

/** The Boulder Terrace's two, pushed east onto their plates. */
export const REACHES_BOULDERS = Object.freeze([
  Object.freeze({ id: 'terrace_a', x: 36, y: 20, layer: 2 }),
  Object.freeze({ id: 'terrace_b', x: 36, y: 21, layer: 2 }),
]);

export const REACHES_PLATES = Object.freeze([
  Object.freeze({ id: 'terrace_a', x: 40, y: 20, gate: 'terrace' }),
  Object.freeze({ id: 'terrace_b', x: 40, y: 21, gate: 'terrace' }),
]);

/** The gate across the Boulder Terrace, and the only way to its stair. */
export const REACHES_GATES = Object.freeze({
  terrace: Object.freeze([
    Object.freeze({ x: 20, y: 19 }),
    Object.freeze({ x: 20, y: 20 }),
    Object.freeze({ x: 20, y: 21 }),
  ]),
});

/**
 * THE FOUR WAYS UP, one per terrace, each behind that terrace's puzzle.
 * A STAIR needs only legs; a LADDER needs the Climbing Hooks.
 */
export const CLIMBS = Object.freeze({
  /**
   * 0 -> 1, IN the labyrinth's north door rather than a tile beyond it.
   *
   * At 23,31 the flight sat a row up from the doorway with a landing above it,
   * so the way out of the maze read as a step, then a pause, then the terrace.
   * On the door tile the maze opens directly onto the stair and the landing
   * moves down with it.
   */
  foot:   Object.freeze({ x: 23, y: 32, layer: 1, kind: 'stair' }),
  /** 1 -> 2, on the far side of the frozen tarn. */
  tarn:   Object.freeze({ x: 50, y: 24, layer: 2, kind: 'ladder' }),
  /** 2 -> 3, behind the ice gate. */
  gate:   Object.freeze({ x: 14, y: 17, layer: 3, kind: 'stair' }),
  /** 3 -> 4, out of the dungeon's east chamber onto the summit. */
  summit: Object.freeze({ x: 48, y: 8,  layer: 4, kind: 'ladder' }),
});

/**
 * EVERY WAY BETWEEN MAPS, IN ONE TABLE.
 *
 * The first crossing was a single pair of constants, which was honest while
 * there were two maps. There are three now, and the Reaches have a door at each
 * end — so the question "am I standing on a way out, and where does it go" has
 * to be asked of a table rather than of an `if`.
 *
 * `needs` is the story gate: you may not take a road you have not been told
 * about. The two return legs need nothing, because coming back is never the
 * thing a quest is gating.
 */
export const CROSSINGS = Object.freeze([
  Object.freeze({
    from: 'home', to: 'peaks', edge: 'east',
    x: 63, y0: 9, y1: 11,
    landing: Object.freeze({ x: 2, y: 42 }),
    needs: 'herald',
    refusal: 'the road east runs out of the Home Block and you have no reason to take it. '
      + 'Speak to the rider in the middle of the map first.',
  }),
  Object.freeze({
    from: 'peaks', to: 'home', edge: 'west',
    // x is the THRESHOLD, not a single column: an east crossing triggers at
    // x >= it, a west crossing at x <= it. One tile of slack either side, so
    // the prompt appears as you reach the edge rather than only on it.
    x: 1, y0: 41, y1: 43,
    landing: Object.freeze({ x: 62, y: 10 }),
    needs: null,
  }),
  Object.freeze({
    from: 'peaks', to: 'elderwatch', edge: 'east',
    x: 62, y0: 32, y1: 34,
    landing: Object.freeze({ x: 2, y: 33 }),
    needs: 'wiseman',
    refusal: 'an old road, and no reason yet to walk it. The Wise Man is at the top of this '
      + 'mountain and has not told you where to go.',
  }),
  Object.freeze({
    from: 'elderwatch', to: 'peaks', edge: 'west',
    x: 1, y0: 32, y1: 34,
    landing: Object.freeze({ x: 61, y: 33 }),
    needs: null,
  }),
]);

/** The crossing under this tile, or null. Both the world and the server ask. */
export function crossingAt(area, x, y) {
  for (const c of CROSSINGS) {
    if (c.from !== area) continue;
    if (y < c.y0 || y > c.y1) continue;
    if (c.edge === 'east' ? x >= c.x : x <= c.x) return c;
  }
  return null;
}

/** The rows one map's edge crossing occupies, for the map builders. */
export function crossingRows(from, edge) {
  const c = CROSSINGS.find((k) => k.from === from && k.edge === edge);
  return c ? { y0: c.y0, y1: c.y1, x: c.x } : null;
}

/**
 * THE ROAD EAST — the hook for whatever comes after the mountain.
 *
 * It runs along the top of the Foot terrace, out of the labyrinth's north door
 * and away to the east edge, and it does not go anywhere yet. That is the
 * point: the Wise Man's errand ends by naming Elderwatch and the Hall of
 * Keeping, and a story beat lands better when the player has already SEEN the
 * road they are about to be sent down.
 *
 * IT STARTS AT x0 = 24, WHICH IS A WALL OF THE LABYRINTH, and cuts through it.
 * The maze is fifteen rows tall and the Foot terrace is fifteen rows tall, so
 * the maze divides the terrace in two with no lane above or below it: a road
 * that began one tile further east existed, was drawn, and could not be walked
 * to from anywhere in the world.
 *
 * AND IT RUNS ALONG ROW 33, NOT 32. Row 32 is the terrace's top row, and the
 * stair out of the maze stands on it carrying the terrace ABOVE — so stepping
 * east off that stair was a step between two terraces, which only a ladder or a
 * stair may be. One row down the road is flat all the way, and the hole it cuts
 * in the maze's east wall opens straight onto the corridor inside.
 */
export const EAST_ROAD = Object.freeze({ y: 33, x0: 24, x1: 62 });

/**
 * ===========================================================================
 * ELDERWATCH — a garrison, not a mountain
 * ===========================================================================
 *
 * The Wise Man's errand: the Ashen Standard hangs in the Hall of Keeping,
 * behind a garrison that has forgotten what it is guarding. So the third map is
 * built as the opposite of the second — flat, walled, and made of rooms rather
 * than terraces, and the danger in it is people rather than terrain.
 *
 * THE ROUTE, and what each lock costs:
 *
 *   the outer wall     the front gate is barred, but the CULVERT under the
 *                      west wall is cracked -> the Stone Hammer, which you
 *                      already carry off the mountain. Old gear opening a new
 *                      door is the cheapest way to make a journey feel like one.
 *   the yard           two watchmen on patrol, each with a line of sight.
 *                      Caught, you are put back in the culvert.
 *   the guardroom      a barred door held by two plates -> the barrels, which
 *                      are the Reaches' boulders in another coat. The BRASS KEY
 *                      hangs inside.
 *   the keep door      the Brass Key.
 *   the Hall           the Standard on its stand. Taking it is the quest.
 */
export const ELDERWATCH = Object.freeze({
  /** The fort's outer wall — everything inside is garrison. */
  wall: Object.freeze({ x0: 18, y0: 8, x1: 56, y1: 40 }),
  /** The barred front gate, in the west wall. Shut for the whole visit. */
  gate: Object.freeze({ x: 18, y: 24 }),
  /** The cracked culvert under the wall, three tiles south of the gate. */
  culvert: Object.freeze({ x: 18, y: 33 }),
  /**
   * Where being caught puts you back to: INSIDE the culvert, on the yard's
   * own ground. It used to be 19,33 — the second tile of the wall's thickness,
   * which is cracked masonry and solid until the Stone Hammer opens it. Being
   * put back into a wall is not being put back at the door.
   */
  doorX: 20,
  doorY: 33,
  /**
   * THE GUARDROOM, south-east, against the wall — the one room of the flat
   * fort that survived the keep becoming a tower.
   *
   * The first cut put it at 40,30-52,38 with the Brass Key inside. The tower
   * then landed on top of that, so the room moved out to the wall and the key
   * moved upstairs; what is behind the barred door now is the CODEX. Its south
   * wall is the yard's, which is what the barrels are pushed along.
   */
  guardroom: Object.freeze({ x0: 46, y0: 32, x1: 53, y1: 37 }),
  /** Where the Codex lies, on the table at the back of the guardroom. */
  codex: Object.freeze({ x: 49, y: 33 }),
});

/**
 * THE KEEP OF ELDERWATCH — a round tower, climbed floor by floor.
 *
 * The fort's first cut was flat: a yard, a guardroom, a keep, all on one plane.
 * It read as a diagram. A tower reads as a place — and it lets the map do
 * something the mountain could not, which is to put four rooms at the SAME
 * coordinates and let you climb through them.
 *
 * Inside, the world outside the tower's circle greys out. You are on one floor
 * of one tower and the rest of Elderwatch is somewhere below you.
 *
 *   1  THE GUARDROOM   two watchmen on a ring corridor      -> time them
 *   2  THE CISTERN     two barrels onto two plates           -> the gate opens
 *   3  THE ARMOURY     a bricked arch                        -> the Stone Hammer
 *                      and the BRASS KEY on its hook
 *   4  THE HALL        a locked door                         -> the Brass Key
 *                      and the ASHEN STANDARD on its stand
 */
export const TOWER = Object.freeze({
  /** The circle, in tiles. Everything outside it greys out while you are in. */
  cx: 37, cy: 24, r: 11,
  /** The door in the tower's south face, on the ground floor. */
  doorX: 37, doorY: 35,
  /** How many floors above the ground. */
  floors: 4,
});

/**
 * WHAT IS ON EACH FLOOR. One entry per floor, 1-based.
 *
 * `up`/`down` are the stairs. `patrols` are beats walked on the clock, the same
 * shape the Rime Warden uses. `door` is where a patrol puts you back to on that
 * floor — you lose the floor, not the tower.
 */
export const TOWER_FLOORS = Object.freeze([
  Object.freeze({
    n: 1,
    name: 'The Guardroom',
    up: Object.freeze({ x: 37, y: 16 }),
    down: Object.freeze({ x: 37, y: 33 }),
    door: Object.freeze({ x: 37, y: 32 }),
    patrols: Object.freeze([
      Object.freeze({ rowY: 21, fromX: 29, toX: 45, stepMs: 460, sight: 4 }),
      Object.freeze({ rowY: 27, fromX: 45, toX: 29, stepMs: 560, sight: 4 }),
    ]),
    /** Pillars, crates and braziers — a room, not a disc of floor. */
    props: Object.freeze([
      Object.freeze({ kind: 'pillar', x: 32, y: 19 }),
      Object.freeze({ kind: 'pillar', x: 42, y: 19 }),
      Object.freeze({ kind: 'pillar', x: 32, y: 29 }),
      Object.freeze({ kind: 'pillar', x: 42, y: 29 }),
      Object.freeze({ kind: 'brazier', x: 34, y: 24 }),
      Object.freeze({ kind: 'brazier', x: 40, y: 24 }),
      Object.freeze({ kind: 'crate', x: 30, y: 24 }),
      Object.freeze({ kind: 'crate', x: 30, y: 25 }),
      Object.freeze({ kind: 'table', x: 44, y: 24 }),
    ]),
  }),
  Object.freeze({
    n: 2,
    name: 'The Cistern',
    up: Object.freeze({ x: 45, y: 24 }),
    down: Object.freeze({ x: 37, y: 16 }),
    door: Object.freeze({ x: 37, y: 17 }),
    patrols: Object.freeze([
      // x34-40, not x30-44: the ends of the wider beat ran through the room's
      // own rimewall, its brazier and its crate.
      Object.freeze({ rowY: 30, fromX: 34, toX: 40, stepMs: 620, sight: 3 }),
    ]),
    boulders: Object.freeze([
      Object.freeze({ id: 'cistern_a', x: 32, y: 22 }),
      Object.freeze({ id: 'cistern_b', x: 32, y: 26 }),
    ]),
    plates: Object.freeze([
      Object.freeze({ id: 'cistern_a', x: 40, y: 22, gate: 'cistern' }),
      Object.freeze({ id: 'cistern_b', x: 40, y: 26, gate: 'cistern' }),
    ]),
    gates: Object.freeze({
      cistern: Object.freeze([
        Object.freeze({ x: 43, y: 23 }),
        Object.freeze({ x: 43, y: 24 }),
        Object.freeze({ x: 43, y: 25 }),
      ]),
    }),
    props: Object.freeze([
      Object.freeze({ kind: 'water', x: 36, y: 24 }),
      Object.freeze({ kind: 'water', x: 37, y: 24 }),
      Object.freeze({ kind: 'water', x: 36, y: 25 }),
      Object.freeze({ kind: 'water', x: 37, y: 25 }),
      Object.freeze({ kind: 'brazier', x: 33, y: 30 }),
      Object.freeze({ kind: 'crate', x: 41, y: 30 }),
    ]),
  }),
  Object.freeze({
    n: 3,
    name: 'The Armoury',
    up: Object.freeze({ x: 29, y: 24 }),
    down: Object.freeze({ x: 45, y: 24 }),
    door: Object.freeze({ x: 44, y: 24 }),
    patrols: Object.freeze([
      // toX 31, not 30: 30,20 is this floor's table.
      Object.freeze({ rowY: 20, fromX: 44, toX: 31, stepMs: 500, sight: 5 }),
      Object.freeze({ rowY: 28, fromX: 30, toX: 44, stepMs: 440, sight: 5 }),
    ]),
    /** The bricked arch across the way west. The Stone Hammer opens it. */
    cracked: Object.freeze([
      Object.freeze({ x: 32, y: 23 }),
      Object.freeze({ x: 32, y: 24 }),
      Object.freeze({ x: 32, y: 25 }),
    ]),
    props: Object.freeze([
      Object.freeze({ kind: 'rack', x: 35, y: 19 }),
      Object.freeze({ kind: 'rack', x: 37, y: 19 }),
      Object.freeze({ kind: 'rack', x: 39, y: 19 }),
      Object.freeze({ kind: 'crate', x: 42, y: 30 }),
      Object.freeze({ kind: 'crate', x: 43, y: 30 }),
      Object.freeze({ kind: 'brazier', x: 36, y: 30 }),
      Object.freeze({ kind: 'table', x: 30, y: 20 }),
    ]),
  }),
  Object.freeze({
    n: 4,
    name: 'The Hall of Keeping',
    up: null,
    down: Object.freeze({ x: 29, y: 24 }),
    door: Object.freeze({ x: 30, y: 24 }),
    patrols: Object.freeze([]),
    /**
     * THE SHRINE WALL. Everything north of this row is the shrine, and the
     * locked door in it is the only way through.
     *
     * Without it the Brass Key gated NOTHING: the lock was a single tile
     * standing in the middle of an open round room, so you walked around it.
     * The whole Armoury detour — break the arch, take the Key — was optional,
     * and `probeStep` across the one door tile answered `false` exactly as the
     * suite expected while the room behind it stayed wide open. A door is only
     * a door if it is in a wall.
     */
    shrineWallY: 22,
    /** The locked door through the shrine wall, and what opens it. */
    lock: Object.freeze({ x: 37, y: 22, item: 'brass_key' }),
    props: Object.freeze([
      Object.freeze({ kind: 'brazier', x: 34, y: 20 }),
      Object.freeze({ kind: 'brazier', x: 40, y: 20 }),
      Object.freeze({ kind: 'banner', x: 35, y: 18 }),
      Object.freeze({ kind: 'banner', x: 39, y: 18 }),
      Object.freeze({ kind: 'table', x: 32, y: 28 }),
      Object.freeze({ kind: 'crate', x: 43, y: 27 }),
    ]),
  }),
]);

/** Where the two things you came for sit, and on which floor. */
export const TOWER_ITEMS = Object.freeze([
  Object.freeze({ item: 'brass_key', floor: 3, x: 30, y: 24, xp: 'brass_key_taken',
    found: 'The Brass Key — the Hall above will open now.' }),
  Object.freeze({ item: 'ashen_standard', floor: 4, x: 37, y: 20, xp: 'standard_taken',
    needs: 'brass_key', found: 'THE ASHEN STANDARD.' }),
  // THE CHEST beside the stand. The Standard is what you were sent for; this is
  // what was actually here.
  Object.freeze({ item: 'ranons_ring', floor: 4, x: 40, y: 21, xp: 'ring_taken',
    needs: 'brass_key', found: "RANON'S RING." }),
]);

/**
 * WHAT THE CHEST IN THE HALL OF KEEPING SAYS.
 *
 * The Wise Man's errand was the Standard. The Standard was never the point —
 * it is a banner in a room, and a banner in a room is only dangerous to a man
 * who knows what it would raise. Ranon knew. He did not burn it, because a
 * burnt banner is a story; he put it behind a garrison and told the garrison
 * nothing, which is the same as burning it and quieter.
 *
 * The player has been carrying the Codex since the guardroom and has not been
 * able to open it. This is the scene that explains why, and the ring that fixes
 * it is the same ring that makes the ledger worth reading.
 */
export const RING_DIALOGUE = Object.freeze({
  name: 'The Hall of Keeping',
  lines: Object.freeze([
    'The chest beside the stand is not a garrison chest. It is too good, and it has been '
      + 'opened often — the hinges are clean in a room where nothing else is.',
    'Inside: a signet ring, and forty years of paper.',
    'The paper is requisitions. Postings. Transfer orders, all in one hand, all signed with '
      + 'the same flattened crest. Somebody has been staffing this fort for four decades, and '
      + 'staffing it carefully — with men who would not ask.',
    'You put the ring against the ledger you took from the guardroom, and the Codex opens.',
    '"They stopped asking what it was," the Wise Man had said. He had it the wrong way round. '
      + 'They were CHOSEN for not asking.',
    'Ranon did not lose the Standard. He filed it, and then he spent forty years making sure '
      + 'the filing held — which means he has known, the whole time, exactly what would happen '
      + 'if anyone ever raised the Levy.',
    'The ring is cold. You put it on anyway; without it the Codex is a shut book.',
  ]),
  objective: "Read the Codex [J], and carry the Standard west out of Elderwatch. "
    + 'Ranon has been expecting someone for forty years.',
});

/**
 * THE BARRELS OF THE GUARDROOM LOCK, and the plates they must sit on.
 *
 * ALL OF IT LIVES IN THE SOUTH YARD, on row 38, because the bailey is a RING:
 * the keep fills the middle and the only ground wide enough to shove a barrel
 * along is the strip between the tower's footing and the south wall. The first
 * cut of these sat at x30-40, y32-36 — which the tower was later built directly
 * on top of, burying a barrel, a plate and two thirds of the gate in solid
 * stone. Every coordinate here is checked against the tower's circle by
 * `25-elderwatch`, so that cannot happen again quietly.
 *
 * The push is long and straight and the difficulty is not the route: it is
 * `watch_south`, who paces that exact row. What stops you in Elderwatch is
 * people.
 */
export const ELDERWATCH_BOULDERS = Object.freeze([
  Object.freeze({ id: 'yard_a', x: 40, y: 38 }),
  Object.freeze({ id: 'yard_b', x: 44, y: 38 }),
]);
/**
 * The plates, out on the barrels' road at the east end of it.
 *
 * THE DOOR IS NOT ON THIS ROW, and that is the whole reason it works. Row 38 is
 * a one-tile corridor between the guardroom's south wall and the fort's, and a
 * barrel is SOLID — so a barrel parked anywhere along it cuts the corridor in
 * two. Both of the first two layouts put the door on row 38 and both sealed
 * themselves shut the moment the puzzle was solved: under the door, the barrels
 * walled in the one tile you could step through it from; flanking it, they
 * walled off the whole approach. The lock opened onto ground you could no
 * longer reach, which is a worse failure than a lock that does not open.
 */
export const ELDERWATCH_PLATES = Object.freeze([
  Object.freeze({ id: 'yard_a', x: 49, y: 38, gate: 'guardroom' }),
  Object.freeze({ id: 'yard_b', x: 51, y: 38, gate: 'guardroom' }),
]);
/**
 * The barred door, in the guardroom's WEST face — reached across the open yard
 * at x45, which no barrel ever stands on.
 */
export const ELDERWATCH_GATES = Object.freeze({
  guardroom: Object.freeze([
    Object.freeze({ x: 46, y: 34 }),
    Object.freeze({ x: 46, y: 35 }),
  ]),
});

/**
 * THE WATCH. Two of them, pacing the yard on their own clocks.
 *
 * The same machinery as the Rime Warden — a line, a sight, and being put back
 * where you came in — because the encounter that worked on the mountain works
 * here for a different reason: up there it was a thing to be timed, down here
 * it is a garrison that has not been told there is anything to guard.
 */
export const ELDERWATCH_WATCH = Object.freeze([
  // THE BAILEY IS A RING, so the garrison walks one. The first two beats were
  // rows 20 and 28 across x22-34 — straight through where the keep now stands,
  // so eight of each watchman's thirteen tiles were inside solid stone and the
  // yard's whole encounter had quietly stopped happening. A ring needs lanes on
  // all four sides, and two of those are vertical: hence `colX`.
  /** The west wall walk — the first thing to time, past the culvert you came in by. */
  Object.freeze({ id: 'watch_west', colX: 21, fromY: 34, toY: 13, stepMs: 520, sight: 4 }),
  /** The north yard, in the gap between the two store sheds. */
  Object.freeze({ id: 'watch_north', rowY: 11, fromX: 31, toX: 45, stepMs: 600, sight: 4 }),
  /** The east yard, between the north stores and the guardroom. */
  Object.freeze({ id: 'watch_east', colX: 50, fromY: 17, toY: 30, stepMs: 460, sight: 4 }),
  /** The south yard — the guardroom's own approach, and the barrels' road. */
  Object.freeze({ id: 'watch_south', rowY: 38, fromX: 48, toX: 24, stepMs: 700, sight: 5 }),
]);

/**
 * WHICH PUZZLE FURNITURE BELONGS TO WHICH MAP.
 *
 * Boulders, plates, gates and patrols were all read straight off the Reaches'
 * constants by name, which was fine while the Reaches were the only map with
 * any. One table keyed by area means Elderwatch inherits the whole apparatus —
 * the barrels in its yard ARE the mountain's boulders in another coat — without
 * a second copy of the rules that move them.
 */
export const AREA_PUZZLES = Object.freeze({
  peaks: Object.freeze({
    boulders: REACHES_BOULDERS,
    plates: REACHES_PLATES,
    gates: REACHES_GATES,
    /** Where a patrol puts you back to. */
    door: Object.freeze({ x: WARDEN.doorX, y: WARDEN.doorY }),
  }),
  elderwatch: Object.freeze({
    boulders: ELDERWATCH_BOULDERS,
    plates: ELDERWATCH_PLATES,
    gates: ELDERWATCH_GATES,
    door: Object.freeze({ x: ELDERWATCH.doorX, y: ELDERWATCH.doorY }),
  }),
});

/** Every boulder on a map, wherever it started. */
export function bouldersFor(area) {
  const p = AREA_PUZZLES[area];
  if (!p) return [];
  // The Warden's three are part of its room rather than of the map's furniture,
  // so they are listed separately and joined here.
  return area === AREAS.peaks ? [...p.boulders, ...WARDEN.boulders] : [...p.boulders];
}

/** Every plate on a map. */
export function platesFor(area) {
  const p = AREA_PUZZLES[area];
  if (!p) return [];
  return area === AREAS.peaks ? [...p.plates, ...WARDEN.plates] : [...p.plates];
}

/**
 * THINGS LYING ON THE GROUND THAT A QUEST WANTS.
 *
 * The same shape as GEAR_SITES, and read by the same code: a tile, a prompt, a
 * server route that checks you are standing on it. `needs` is a quest item you
 * must already hold — the Standard is behind the keep door, and the keep door
 * is behind the Brass Key, so the server re-checks the key rather than trusting
 * that a locked door stopped you.
 */
export const QUEST_SITES = Object.freeze({
  /**
   * Elderwatch's GROUND floor has one, in the guardroom: the Codex.
   *
   * The Brass Key and the Standard used to lie out here too, in a flat keep at
   * 44,12 and a guardroom at 50,34. Both went up the tower — see `TOWER_ITEMS`
   * — and this list was left behind pointing at coordinates the keep is now
   * built on. What is down here is the reward for the yard's barrels.
   */
  elderwatch: Object.freeze([
    Object.freeze({
      item: 'codex', x: ELDERWATCH.codex.x, y: ELDERWATCH.codex.y, xp: 'codex_taken',
      found: 'THE CODEX — everything you have seen, written down.',
    }),
  ]),
});

/**
 * Which quest items lie on the ground HERE — this map, this floor.
 *
 * Elderwatch is the only map with two answers: the guardroom's Codex at ground
 * level, and one item per floor of the Keep. Both the world and the server ask
 * this, so the split lives in one place rather than as the same ternary written
 * out three times.
 */
export function questSitesFor(area, floor = 0) {
  if (area === AREAS.elderwatch && floor > 0) {
    return TOWER_ITEMS.filter((q) => q.floor === floor);
  }
  return QUEST_SITES[area] || [];
}

/**
 * Which quest item opens which door tile, per map.
 *
 * EMPTY, and deliberately so. Elderwatch's one locked door was the flat keep's
 * at 44,22; the Hall's door went up to floor 4 and is carried by that floor's
 * own `lock`, so the map-level lookup had nothing left but a coordinate buried
 * in the tower's stone. The table stays because the next map may want one.
 */
export const DOOR_KEYS = Object.freeze({});

/** What the Standard's keeper says when you lift it off the stand. */
export const STANDARD_DIALOGUE = Object.freeze({
  name: 'The Hall of Keeping',
  lines: Object.freeze([
    'The Hall is colder than the yard, and quieter than it has any right to be.',
    'The Standard hangs where it has hung for forty years: grey, heavy, and filed under '
      + 'nothing in particular. Somebody has written a number on the stand.',
    'You take it down. It weighs less than you expected, the way things do when you have '
      + 'been carrying the idea of them for a while.',
    'Nothing sounds. No bell, no shout. The garrison goes on not knowing.',
    '"They stopped asking what it was," the Wise Man had said. "That is how you will get it out."',
  ]),
  objective: 'Carry the Ashen Standard west, out of Elderwatch and back to the tribes of the '
    + 'farlands. They will raise the Levy against Ranon.',
});

/** The summit cave: dark inside, the old man at the back of it. */
export const WISE_CAVE = Object.freeze({
  x: 52, y: 1, w: 8, h: 3,
  doorX: 56, doorY: 4,
});


/** Where the Wise Man sits: the back of the summit cave. */
export const WISE_MAN = Object.freeze({ x: 58, y: 2 });

/**
 * The Wise Man of the mountain. The end of the Herald's errand — and, for now,
 * the end of the road: what he tells you is the hook for whatever comes next.
 */
export const WISE_MAN_DIALOGUE = Object.freeze({
  name: 'The Wise Man of the Mountain',
  lines: Object.freeze([
    'The cave is warmer than the shelf outside, and smells of smoke and old paper.',
    'He does not turn round. "Sit. You have climbed a long way to be told something you '
      + 'will not like."',
    '"Ranon did not take Gotham. Gotham was GIVEN to him — quietly, by men who thought a '
      + 'strong hand on the throne was cheaper than a just one. His father saw it coming '
      + 'and said nothing, and that was the last mistake the old King ever made."',
    '"The Levy you were sent to raise is real. The tribes of the farlands are twelve '
      + 'families and one grudge, and they will not cross the border for a crown."',
    'He turns now. His eyes are very clear.',
    '"But they will cross it for the ASHEN STANDARD. Ranon\'s father took it from them as '
      + 'surety forty years ago and never gave it back. It hangs in the Hall of Keeping at '
      + 'ELDERWATCH, three days east of here, behind a garrison that has forgotten what it '
      + 'is guarding."',
    '"Bring them their standard and they will bring you an army. That is the whole of it, '
      + 'and it is not a comfortable secret: you are not going to free a kingdom by being '
      + 'good. You are going to free it by giving twelve angry families a reason."',
    '"Go east from the pass below. Elderwatch is at the end of the old road. And when the '
      + 'garrison asks what you are, tell them the truth — they will not believe it."',
  ]),
  objective: 'Travel east to Elderwatch and take back the Ashen Standard from the Hall of '
    + 'Keeping. Return it to the tribes of the farlands, and they will raise the Levy '
    + 'against Ranon.',
});

/** Snow, ice and bare rock — the Reaches' own ground. */
export const SNOW_TILES = Object.freeze({
  snow: 7,
  ice: 8,
});

export const STARTING_FLORINS = 25;

export const SELL_XP_PER_UNIT = 2;
/** Dark boxes pay this, per box opened, inclusive. */
export const BOX_XP_RANGE = Object.freeze([10, 30]);
/** One-off awards for quest beats. Paid ONCE, guarded by `state.questsDone`. */
export const QUEST_XP = Object.freeze({
  bloom_felled: 120,
  // ELDERWATCH. Getting in is worth something; getting the Standard out is worth
  // the rest of the story.
  culvert_broken: 150,
  /** The guardroom's barrels, and the journal behind them. */
  codex_taken: 220,
  /** The chest in the Hall. The reveal, and the thing that opens the journal. */
  ring_taken: 350,
  brass_key_taken: 200,
  standard_taken: 600,
  woodsman_opened: 180,
  stonemason_opened: 180,
  // Hearing the Herald pays NOTHING. Bruno, 2026-08-31: "he pays 400 xp when
  // you find the wise man you are going to be looking for next." Being TOLD
  // about a journey is not the same as making it — the reward belongs to the
  // arrival, and paying it up front would spend the quest before it starts.
  herald_heard: 0,
  // Reserved for the Wise Man of the snowy peaks, who does not exist yet. Kept
  // here rather than added later so the number the Herald's quest is worth is
  // written down in one place from the beginning.
  wise_man_found: 400,
});

/**
 * WHERE A VENDOR'S COUNTER ACTUALLY IS, when it is not the building itself.
 *
 * Interaction is normally "stand within one tile of the footprint", which is
 * right for a hut you walk up to. It is wrong for the Stonemason: his building
 * is a MOUNTAIN, anchored in the rock above the chamber, so the footprint's
 * one-tile margin reached out onto the hillside and you could trade with him
 * from outside the cave without ever going in. (Bruno, 2026-08-31.)
 *
 * A counter is given as an OFFSET from the building's anchor, not as absolute
 * world tiles, so it travels with the building if it is ever moved. It REPLACES
 * the footprint for reach purposes — it is not added to it — and reach is still
 * "within one tile of this rect", so the numbers below are the counter itself,
 * not the standing room around it.
 *
 * Both the server (`buildingsNear`) and the world (`adjacentBuilding`) read
 * this. Two copies of a reach rule is two reach rules that drift apart, and the
 * server is the one that refuses the trade.
 */
export const BUILDING_COUNTER = Object.freeze({
  // The mountain is anchored at CAVE.y - 2. Its counter is the top of the
  // chamber, where the Stonemason actually stands: three tiles wide, so you
  // have to be in the cave with him.
  stonemason_camp: Object.freeze({ dx: 1, dy: 2, w: 3, h: 2 }),
});

/**
 * The rect that decides whether you are AT a building — the counter if it has
 * one, otherwise the footprint. `fp` is the building's own {w,h}.
 */
export function counterRect(buildingId, x, y, fp) {
  const c = BUILDING_COUNTER[buildingId];
  if (c) return { x: x + c.dx, y: y + c.dy, w: c.w, h: c.h };
  return { x, y, w: (fp && fp.w) || 1, h: (fp && fp.h) || 1 };
}

export const AREA_HOME = 'home_block';

// The four seams. Nothing beyond them exists yet; the gates must be visible,
// named, and honest about what they are waiting for.
export const GATES = Object.freeze([
  { side: 'north', id: 'gate_thicket',  area: 'thicket',  name: 'The Deepening Thicket',
    structure: 'treeline arch',  requires: { tasksCompleted: 5 } },
  { side: 'east',  id: 'gate_quarry',   area: 'quarry',   name: 'Quarry Ridge',
    structure: 'cut stone gateway', requires: { studyMinutes: 600 } },
  { side: 'south', id: 'gate_drowned',  area: 'drowned',  name: 'The Drowned Archive',
    structure: 'flooded causeway', requires: { level: 15, tasksCompleted: 20 } },
  { side: 'west',  id: 'gate_ashen',    area: 'ashen',    name: 'The Ashen Waste',
    structure: 'ash-choked pass', requires: { level: 25, studyMinutes: 2400 } },
]);

// --- TREES ARE FINITE -------------------------------------------------------
// Chopping a tree destroys it permanently. The only way back is a sapling,
// bought at the Shop and planted. Reinvestment, not regeneration.
export const TREES_REGROW = false;
export const SAPLING_STAGES = Object.freeze([
  { id: 'sprout',  label: 'Sprout',      minutes: 0 },
  { id: 'seedling',label: 'Seedling',    minutes: 20 },
  { id: 'young',   label: 'Young Tree',  minutes: 60 },
  { id: 'mature',  label: 'Mature Tree', minutes: 120 },   // chopable
]);
export const SAPLING_TOTAL_MINUTES = 120;

// Things a felled tree can yield, beyond plain ironwood.
export const TREE_DROP_IDS = Object.freeze(['ironwood', 'heartwood', 'resin', 'seedpod']);

export const GADGET_IDS = Object.freeze([
  'lantern', 'compass', 'watering_can', 'portable_bench', 'focus_bell', 'surveyors_glass',
]);
export const BLOCK_IDS = Object.freeze([
  'path_stone', 'fence_wood', 'wall_stone', 'lamp_post', 'planter', 'signpost',
]);
export const BLOCK_REFUND_RATE = 0.5;   // removing a block returns half its cost

// --- VISUAL DIRECTION -------------------------------------------------------
// v3 targets a richer, warmer, Genshin-adjacent look while staying pixel art.
// These are the anchors; per-material ramps live in the sprite modules.
export const PALETTE_V3 = Object.freeze({
  ink: '#1a1426', slate: '#2a2340', slateLight: '#3d3457',
  parchment: '#f4e4c1', parchmentDim: '#d9c49b',
  gold: '#ffcc5c', goldBright: '#ffe9a8', goldDeep: '#c9922f',
  anemo: '#74c2a8', geo: '#e0a850', electro: '#b78fd4',
  pyro: '#e2654a', hydro: '#4aa8d8', dendro: '#8fc85a',
  sun: '#fff3d0', shade: '#4a3f6b',
  good: '#8fc85a', bad: '#e2654a', text: '#f4e4c1', textDim: '#a494c4',
});

// A felled tree leaves a stump you can see, but only for a while — after this
// the ground goes back to bare grass. The tree itself never returns; only a
// planted sapling brings one back.
export const STUMP_MINUTES = 10;

// ===========================================================================
// EQUIPMENT — two visible slots
// ===========================================================================
// `player.activeGatherTool` used to be a single hidden slot holding one
// gathering tool. It is replaced by TWO VISIBLE SLOTS that accept tools, goods
// (seeds, gadgets) and — when they exist — weapons.
//
// The rule that matters: the world's prompts and the world's actions key off
// what is EQUIPPED, never off what is merely in the bag. Walking past grass
// with saplings in the pack offers nothing; walking past it with saplings in a
// slot offers to plant.
//
// Both slots are live at once. The ACTIVE slot (keys 1 and 2) is the tie-break
// when both slots could act on the tile you face, it is the slot the HUD shows
// in front, and pressing its own number again USES it.
export const EQUIP_SLOT_COUNT = 2;

// What a slot is allowed to hold. `weapon` is declared now and carries nothing:
// weapons do not exist yet, and the slot must not need reworking when they do.
export const EQUIP_KINDS = Object.freeze(['tool', 'seed', 'gadget', 'weapon']);

// The one equippable "good" that is a COUNT rather than a uid'd object.
// Saplings and seedpods are both spent by planting, saplings first, so one
// equippable stands for both exactly the way the plant route already spends them.
export const SEED_ITEM_ID = 'sapling';

// The paper-doll on the Gear screen. `hand` slots are the two live ones above;
// everything else is declared so the layout does not need redrawing when armour,
// charms and companions land. `locked: true` means "drawn, not yet wired".
export const DOLL_SLOTS = Object.freeze([
  { id: 'head',      label: 'HEAD',      col: 'left',   glyph: '⌒', locked: true,  note: 'Armour — not yet forged.' },
  { id: 'body',      label: 'BODY',      col: 'left',   glyph: '▤', locked: true,  note: 'Armour — not yet forged.' },
  { id: 'legs',      label: 'LEGS',      col: 'left',   glyph: '⑂', locked: true,  note: 'Armour — not yet forged.' },
  { id: 'feet',      label: 'FEET',      col: 'left',   glyph: '⌂', locked: true,  note: 'Armour — not yet forged.' },
  { id: 'hand1',     label: 'SLOT 1',    col: 'right',  glyph: '✥', locked: false, hand: 0, note: 'Press 1 to make this slot active.' },
  { id: 'hand2',     label: 'SLOT 2',    col: 'right',  glyph: '✥', locked: false, hand: 1, note: 'Press 2 to make this slot active.' },
  { id: 'charm1',    label: 'CHARM 1',   col: 'right',  glyph: '◈', locked: false, gear: 0, note: 'Worn, not held. Click to put a charm on or take it off.' },
  { id: 'charm2',    label: 'CHARM 2',   col: 'right',  glyph: '◈', locked: false, gear: 1, note: 'Worn, not held. Click to put a charm on or take it off.' },
  { id: 'companion', label: 'COMPANION', col: 'left',   glyph: '☖', locked: true,  note: 'Companions are bought with Shards. Later.' },
]);
