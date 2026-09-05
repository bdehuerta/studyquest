// tools/checks/06-v3.mjs — the v3 systems, end to end, through the API only.
//
// What this suite exists to prove, in the order the contract asks for it:
//
//   1. TREES ARE FINITE. A felled tree writes NO respawnAt, comes back with
//      permanent:true, and refuses every later swing. Stone still respawns.
//   2. A stump is still plantable, and a planting grows on WALL-CLOCK time —
//      the fixtures below are dated in the past, so the stage the server
//      reports is derived lazily on read and never from a timer.
//   3. Gadgets apply an effect and then go on cooldown.
//   4. Blocks are placed, removed, and refunded at BLOCK_REFUND_RATE.
//   5. Crafting, trading and repair are refused away from a building and
//      allowed next to one — with a refusal that names a real place.
//   6. Saplings are on the merchant's counter, always.
//
// Everything is seeded rather than played into existence: a suite that has to
// study for ten hours to reach a gate is a suite nobody runs.

const MIN = 60000;

/** Timestamps are built at suite-load time so "45 minutes ago" is really that. */
function ago(minutes) {
  return Date.now() - minutes * MIN;
}

// The three seed buildings sit at study_hut 22,17 (2x2), trading_post 26,17
// (3x2) and archive 22,20 (2x2). These are the tiles a player has to stand on
// to be adjacent to each, and the tile that is adjacent to nothing at all.
const AT_HUT = { px: 22, py: 19 };
const AT_SHOP = { px: 26, py: 19 };
const NOWHERE = { px: 50, py: 40 };

function seedSave() {
  return {
    player: {
      name: 'V3 Tester',
      level: 9,
      xp: 100,
      xpToNext: 1000,
      x: AT_HUT.px,
      y: AT_HUT.py,
      coins: { focus: 500, insight: 500, grind: 500, spark: 500 },
      darkBoxes: 1,
      streak: 4,
      lastActiveDate: null,
      energy: 100,
      maxEnergy: 100,
      gatherTools: [
        { uid: 'v3-axe', toolId: 'axe', durability: 60, maxDurability: 60 },
        { uid: 'v3-pick', toolId: 'pickaxe', durability: 50, maxDurability: 50 },
      ],
      activeGatherTool: 'v3-axe',
      saplings: 3,
    },
    materials: { ironwood: 20, chalkstone: 20, copperwire: 5 },
    tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
      { uid: 'seed-archive', buildingId: 'archive', x: 22, y: 20 },
    ],
    pendingBuildings: [],
    tasks: [],
    sessions: [],
    log: [],
    harvested: {},
    blueprints: ['craft_axe', 'craft_pickaxe', 'craft_focus_lamp', 'build_study_hut'],
    relics: [],

    // --- v3 ---------------------------------------------------------------
    plantings: {
      // planted 200 minutes ago: past SAPLING_TOTAL_MINUTES, so mature and chopable
      '41,10': { plantedAt: ago(200), stage: 'sprout', source: 'sapling', boostMinutes: 0 },
      // planted 45 minutes ago: a Seedling. +30 from the watering can makes it Young.
      '42,10': { plantedAt: ago(45), stage: 'sprout', source: 'sapling', boostMinutes: 0 },
    },
    gadgets: { lantern: 1, watering_can: 1, compass: 1, surveyors_glass: 1 },
    cooldowns: {},
    blocks: { wall_stone: 2, fence_wood: 3 },
    placedBlocks: {},
    refundBank: { materials: {}, coins: {} },
    effects: {},
    // Two tasks' worth of lifetime credit, so the north gate reads 2/5 rather
    // than 0/5 and the progress arithmetic is actually exercised.
    lifetime: { tasksCompleted: 2, studyMinutes: 120, sessions: 1, treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0 },
  };
}

function seedMeta() {
  return {
    slot: 1, name: 'V3 Tester', createdAt: 1750000000000, lastPlayedAt: 1750000000000,
    playtimeMs: 60000, level: 9, tasksDone: 0, tasksTotal: 0, savedAt: 1750000000000,
  };
}

export default {
  name: 'v3 — finite trees, plantings, gadgets, blocks and place-gating',
  order: 60,
  browser: false,

  seed: {
    'Slot 1/state.json': seedSave(),
    'Slot 1/meta.json': seedMeta(),
  },

  steps: [
    { type: 'note', text: 'The v3 routes exist at all — a stale server serving v2 code fails right here.' },
    { type: 'api', route: '/api/gates', expectOk: true, label: 'GET /api/gates answers' },
    { type: 'api', route: '/api/plantings', expectOk: true, label: 'GET /api/plantings answers' },
    { type: 'api', route: '/api/gadgets', expectOk: true, label: 'GET /api/gadgets answers' },
    { type: 'api', route: '/api/blocks', expectOk: true, label: 'GET /api/blocks answers' },

    // ---------------------------------------------------------------- gates
    { type: 'note', text: 'Gate progress is lifetime study only. Coins must never move it.' },
    { type: 'api', route: '/api/gates', label: 'the north gate is locked', path: 'gates.0.unlocked', equals: false },
    { type: 'api', route: '/api/gates', label: 'and it says how far off it is', path: 'gates.0.summary', equals: 'tasksCompleted 2/5' },
    { type: 'api', route: '/api/gates', label: 'with the remainder spelled out', path: 'gates.0.progress.0.remaining', equals: 3 },
    { type: 'api', route: '/api/gates', label: 'all four seams are reported', path: 'gates.3.side', equals: 'west' },
    { type: 'api', route: '/api/gates', label: 'a locked gate carries a readable refusal', path: 'gates.0.refusal', truthy: true },

    // ------------------------------------------------------- place-gating
    { type: 'note', text: 'Every economic action now has a PLACE. Away from a building it is refused, by name.' },
    {
      type: 'api', route: '/api/craft', body: { recipeId: 'craft_block_wall_stone', ...NOWHERE },
      label: 'crafting in the middle of a field is refused', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/craft', body: { recipeId: 'craft_block_wall_stone', ...NOWHERE },
      label: 'and the refusal names somewhere to walk to', path: 'error', truthy: true,
    },
    {
      type: 'api', route: '/api/shop/sell', body: { materialId: 'ironwood', qty: 1, ...NOWHERE },
      label: 'selling away from the Shop is refused', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/tool/repair', body: { uid: 'v3-axe', ...NOWHERE },
      label: 'repairing away from a Forge is refused', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/craft', body: { recipeId: 'craft_block_wall_stone', ...AT_HUT },
      expectOk: true, label: 'the same craft succeeds standing at the Study Hut', path: 'ok', equals: true,
    },
    {
      type: 'api', route: '/api/blocks', label: 'and a batch of 4 Wall Stone landed in the pack (2 + 4)',
      path: 'blocks.2.owned', equals: 6,
    },

    // ------------------------------------------------------- saplings for sale
    { type: 'note', text: 'Saplings must always be buyable, or felling a tree is a one-way loss.' },
    { type: 'api', route: '/api/shops', expectOk: true, label: 'the merchant keeps a nursery', path: 'shops.merchant.nursery.offers.0.id', equals: 'sapling_x1' },
    { type: 'api', route: '/api/shops', label: 'and a tray as well', path: 'shops.merchant.nursery.offers.1.id', equals: 'sapling_x5' },
    {
      type: 'api', route: '/api/shop/buy', body: { shopId: 'merchant', offerId: 'sapling_x1', ...AT_SHOP },
      expectOk: true, label: 'buying a sapling at the Trading Post', path: 'state.player.saplings', equals: 4,
    },
    {
      type: 'api', route: '/api/shop/buy', body: { shopId: 'merchant', offerId: 'sapling_x1', ...NOWHERE },
      label: 'but not from the middle of a field', path: 'ok', equals: false,
    },

    // ------------------------------------------------------- trees are finite
    { type: 'note', text: 'A tree takes 3 swings. The third destroys it FOREVER — no respawnAt, ever.' },
    { type: 'api', route: '/api/gather', body: { x: 40, y: 10, nodeType: 'tree' }, expectOk: true, label: 'swing 1', path: 'result.destroyed', equals: false },
    { type: 'api', route: '/api/gather', body: { x: 40, y: 10, nodeType: 'tree' }, expectOk: true, label: 'swing 2', path: 'result.hitsLeft', equals: 1 },
    { type: 'api', route: '/api/gather', body: { x: 40, y: 10, nodeType: 'tree' }, expectOk: true, label: 'swing 3 fells it', path: 'result.destroyed', equals: true },
    // ONE SEEDPOD PER TREE, GUARANTEED (Bruno, 2026-08-31). It was a 6% chance,
    // which meant sixteen trees felled to replace one — a forest draining one
    // way, now that trees are permanent and florins are rare. Every tree hands
    // back the seed that replaces it, so the wood sustains itself and BUYING
    // saplings is how you grow it rather than how you keep it.
    { type: 'api', route: '/api/state', label: 'felling a tree always yields a seedpod', path: 'state.materials.seedpod', truthy: true },
    { type: 'api', route: '/api/state', label: 'the fall is marked PERMANENT for the world to draw a stump', path: 'state.harvested.40,10.felled', equals: true },
    { type: 'api', route: '/api/state', label: 'and it carries no respawn timer at all', path: 'state.harvested.40,10.respawnAt', equals: null },
    { type: 'api', route: '/api/state', label: 'the stump is flagged plantable', path: 'state.harvested.40,10.plantable', equals: true },
    { type: 'api', route: '/api/state', label: 'the felling is counted for good', path: 'state.lifetime.treesFelled', equals: 1 },
    {
      type: 'api', route: '/api/gather', body: { x: 40, y: 10, nodeType: 'tree' },
      label: 'swinging at the stump is refused — it does not come back', path: 'ok', equals: false,
    },

    { type: 'note', text: 'Stone is NOT finite: it keeps its v2 respawn timer. The difference is data, not a branch.' },
    { type: 'api', route: '/api/tool/equipGather', body: { uid: 'v3-pick' }, expectOk: true, label: 'swap to the pickaxe' },
    { type: 'api', route: '/api/gather', body: { x: 12, y: 12, nodeType: 'stone' }, expectOk: true, label: 'stone swing 1' },
    { type: 'api', route: '/api/gather', body: { x: 12, y: 12, nodeType: 'stone' }, expectOk: true, label: 'stone swing 2' },
    { type: 'api', route: '/api/gather', body: { x: 12, y: 12, nodeType: 'stone' }, expectOk: true, label: 'stone swing 3' },
    { type: 'api', route: '/api/gather', body: { x: 12, y: 12, nodeType: 'stone' }, expectOk: true, label: 'stone swing 4 breaks it', path: 'result.destroyed', equals: true },
    { type: 'api', route: '/api/state', label: 'the stone node DID get a respawn timer', path: 'state.harvested.12,12.respawnAt', truthy: true },
    { type: 'api', route: '/api/state', label: 'and was not marked felled', path: 'state.harvested.12,12.felled', equals: undefined },
    { type: 'api', route: '/api/tool/equipGather', body: { uid: 'v3-axe' }, expectOk: true, label: 'back to the axe' },

    // ------------------------------------------------------- planting a stump
    { type: 'note', text: 'The only way the forest comes back is a sapling planted on the stump.' },
    // ONLY THE SELECTED SLOT ACTS. The axe is back in slot 1 and selected, so
    // the saplings in slot 2 are carried, not held — and the server says so by
    // name. This step used to plant straight from here, back when both slots
    // were live; it is kept as an assertion rather than deleted because it is
    // the cheapest guard against that rule quietly widening again.
    {
      type: 'api', route: '/api/plant', body: { x: 40, y: 10, source: 'sapling' },
      label: 'planting is refused while the axe is the selected slot', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/equip/active', body: { slot: 2 }, expectOk: true,
      label: 'press 2 — take the saplings out',
    },
    {
      type: 'api', route: '/api/plant', body: { x: 40, y: 10 }, expectOk: true,
      label: 'a sapling goes into the stump', path: 'planting.stage', equals: 'sprout',
    },
    { type: 'api', route: '/api/plant', body: { x: 40, y: 10 }, label: 'and nothing else can go on top of it', path: 'ok', equals: false },
    { type: 'api', route: '/api/state', label: 'the stump record is gone — the tile is growing ground now', path: 'state.harvested.40,10', equals: undefined },
    { type: 'api', route: '/api/state', label: 'the planting is counted', path: 'state.lifetime.saplingsPlanted', equals: 1 },
    {
      type: 'api', route: '/api/gather', body: { x: 40, y: 10, nodeType: 'tree' },
      label: 'a sprout cannot be chopped', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/plant', body: { x: 999, y: 999 },
      label: 'planting outside the world is refused', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/plant', body: { x: 15, y: 15, tile: 'water' },
      label: 'and nothing takes root in water', path: 'ok', equals: false,
    },

    // ------------------------------------------- growth is wall-clock, not a timer
    { type: 'note', text: 'These two were planted 200 and 45 minutes ago by the fixture. The stage is computed on read.' },
    { type: 'api', route: '/api/plantings', label: 'the 200-minute-old one is mature', path: 'plantings.0.mature', equals: true },
    { type: 'api', route: '/api/plantings', label: 'the 45-minute-old one is only a Seedling', path: 'plantings.1.stage', equals: 'seedling' },
    { type: 'api', route: '/api/plantings', label: 'and it reports how long is left', path: 'plantings.1.msRemaining', truthy: true },
    // Back to the axe: the saplings have been the selected slot since planting,
    // and a hand full of seeds does not fell a tree.
    {
      type: 'api', route: '/api/equip/active', body: { slot: 1 }, expectOk: true,
      label: 'press 1 — the axe again',
    },
    {
      type: 'api', route: '/api/gather', body: { x: 41, y: 10, nodeType: 'tree' }, expectOk: true,
      label: 'a mature planting can be felled — swing 1', path: 'result.fromPlanting', equals: true,
    },
    { type: 'api', route: '/api/gather', body: { x: 41, y: 10, nodeType: 'tree' }, expectOk: true, label: 'swing 2' },
    { type: 'api', route: '/api/gather', body: { x: 41, y: 10, nodeType: 'tree' }, expectOk: true, label: 'swing 3 fells the tree you grew', path: 'result.permanent', equals: true },
    { type: 'api', route: '/api/state', label: 'the planting is consumed', path: 'state.plantings.41,10', equals: undefined },
    { type: 'api', route: '/api/state', label: 'and it left a permanent stump like any other tree', path: 'state.harvested.41,10.respawnAt', equals: null },

    // ---------------------------------------------------------------- gadgets
    { type: 'note', text: 'A gadget applies its effect, returns DATA for the client to draw, and goes on cooldown.' },
    {
      type: 'api', route: '/api/gadget/use', body: { gadgetId: 'lantern' }, expectOk: true,
      label: 'the lantern returns a reveal duration for the client to draw', path: 'effect.kind', equals: 'reveal',
    },
    { type: 'api', route: '/api/gadget/use', body: { gadgetId: 'lantern' }, label: 'and cannot be used twice in a row', path: 'ok', equals: false },
    { type: 'api', route: '/api/gadgets', label: 'the lantern is now on cooldown', path: 'gadgets.0.ready', equals: false },
    { type: 'api', route: '/api/gadgets', label: 'with the time left spelled out', path: 'gadgets.0.readyIn', truthy: true },
    {
      type: 'api', route: '/api/gadget/use', body: { gadgetId: 'compass' }, expectOk: true,
      label: 'the compass returns tiles to exclude, not a rendered marker', path: 'effect.kind', equals: 'markTree',
    },
    {
      type: 'api', route: '/api/gadget/use', body: { gadgetId: 'watering_can', x: 42, y: 10 }, expectOk: true,
      label: 'the watering can advances a real sapling', path: 'effect.from', equals: 'seedling',
    },
    { type: 'api', route: '/api/gadget/use', body: { gadgetId: 'watering_can', x: 42, y: 10 }, label: 'and is spent', path: 'ok', equals: false },
    { type: 'api', route: '/api/plantings', label: 'the watered sapling really moved a stage', path: 'plantings.0.stage', equals: 'young' },
    {
      type: 'api', route: '/api/gadget/use', body: { gadgetId: 'portable_bench' },
      label: 'a gadget you do not own is refused', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/gadget/use', body: { gadgetId: 'not_a_gadget' },
      label: 'and so is one that does not exist', path: 'ok', equals: false,
    },

    // ---------------------------------------------------------------- blocks
    { type: 'note', text: 'Blocks are constructive only. Placed, removed, refunded at BLOCK_REFUND_RATE.' },
    {
      type: 'api', route: '/api/block/place', body: { blockId: 'wall_stone', x: 30, y: 30, tile: 'grass' },
      expectOk: true, label: 'a wall goes down', path: 'placed.blockId', equals: 'wall_stone',
    },
    {
      type: 'api', route: '/api/block/place', body: { blockId: 'wall_stone', x: 30, y: 30, tile: 'grass' },
      label: 'nothing stacks on top of it', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/block/place', body: { blockId: 'wall_stone', x: 31, y: 30, tile: 'water' },
      label: 'and it will not stand in water', path: 'ok', equals: false,
    },
    { type: 'api', route: '/api/blocks', label: 'the placement is on the map', path: 'placed.0.key', equals: '30,30' },
    { type: 'api', route: '/api/blocks', label: 'at the contracted refund rate', path: 'refundRate', equals: 0.5 },
    // The refund is BANKED, not paid out, and that is correct rather than a
    // regression. A Wall Stone recipe makes 4 blocks for 1 florin, so half of
    // one block's share is an eighth of a florin — there is no coin small
    // enough. `creditFractional` accumulates it until it makes a whole unit,
    // which is exactly what `state.refundBank` is for. Rounding it up instead
    // would turn place-and-remove into a money printer.
    {
      type: 'api', route: '/api/block/remove', body: { x: 30, y: 30 }, expectOk: true,
      label: 'taking it away pays no whole coin', path: 'refund.coins.florin', equals: undefined,
    },
    {
      type: 'api', route: '/api/state', label: 'but the salvage is banked toward one',
      path: 'state.refundBank.coins.florin', truthy: true,
    },
    { type: 'api', route: '/api/blocks', label: 'and the tile is clear again', path: 'placed.0', equals: undefined },
    {
      type: 'api', route: '/api/block/remove', body: { x: 30, y: 30 },
      label: 'removing nothing is refused politely', path: 'ok', equals: false,
    },

    // ---------------------------------------------------------------- survival
    { type: 'note', text: 'After every refusal above the server must still be serving. A throw to the client is a total failure.' },
    { type: 'api', route: '/api/state', expectOk: true, label: 'still alive', path: 'state.player.name', equals: 'V3 Tester' },
    { type: 'api', route: '/api/interact', body: { ...AT_HUT }, expectOk: true, label: '/api/interact reports craft at the hut', path: 'roles.0', equals: 'craft' },
    { type: 'api', route: '/api/interact', body: { ...NOWHERE }, expectOk: true, label: 'and no roles in the middle of a field', path: 'roles.0', equals: undefined },
  ],
};
