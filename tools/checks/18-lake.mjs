// tools/checks/18-lake.mjs — the hut, the keeper, the boat and the fish.
//
// WHY THIS SUITE EXISTS
//
// This is a CHAIN, and a chain is the shape that most easily looks finished
// while being broken in one link: reach level 15 -> the Silver Key appears on
// the counter -> buy it -> unlock the hut -> the Hutkeeper comes out and hands
// over the boat -> the boat appears in the lake -> fish from it.
//
// Every link is gated, and every gate is enforced on the SERVER. So the suite
// walks the chain in order and, at each step, first checks that the gate
// REFUSES before checking that it opens — a lock nobody tests locked is a lock
// nobody knows is there.
//
// The save starts at level 14. Level 15 is what puts the key on the counter,
// and that boundary is worth testing rather than assuming.

const NOW = Date.now();

function save() {
  return {
    player: {
      name: 'Angler', level: 14, xp: 0, xpToNext: 870,
      x: 26, y: 19,
      coins: { florin: 60, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 136, maxEnergy: 136,
      gatherTools: [], activeGatherTool: null,
      equipped: [null, null], activeSlot: 0, equipMigrated: true,
      saplings: 0, pity: 0, charms: [null, null], ownedCharms: [],
    },
    materials: {}, tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
      { uid: 'seed-archive', buildingId: 'archive', x: 22, y: 20 },
      { uid: 'seed-exchange', buildingId: 'exchange_post', x: 26, y: 20 },
    ],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    questItems: {}, vendorsUnlocked: [], questsDone: [],
    hut: { opened: false, spoken: false },
    boat: { granted: false, lastCastAt: 0 },
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
  };
}

export default {
  name: 'the lake — a key, a hut, a keeper, a boat and a fish',
  order: 19,
  browser: false,

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Angler', createdAt: NOW, lastPlayedAt: NOW,
      playtimeMs: 1000, level: 14, tasksDone: 0, tasksTotal: 0, savedAt: NOW,
    },
  },

  steps: [
    { type: 'note', text: 'THE REEDS ARE GONE. Water is water; there is nothing to dredge out of it.' },
    {
      type: 'api', route: '/api/gather', body: { x: 20, y: 30, nodeType: 'reeds' },
      label: 'reeds are no longer a resource node at all', path: 'ok', equals: false,
    },

    { type: 'note', text: 'The counter sells the sifter, and nothing that needs a dredge.' },
    {
      type: 'api', route: '/api/shops', expectOk: true,
      label: 'the Prospector’s Sifter is on the counter at 14 florins',
      path: 'shops.merchant.offers.2.price', equals: 14,
    },

    { type: 'note', text: 'THE KEY IS LEVEL-GATED. At 14 it is not on the counter at all.' },
    {
      type: 'api', route: '/api/shops', expectOk: true,
      label: 'no Silver Key at level 14',
      path: 'shops.merchant.offers.5', equals: undefined,
    },
    {
      type: 'api', route: '/api/shop/buy', body: { shopId: 'merchant', offerId: 'merchant_key_silver', px: 26, py: 19 },
      label: 'and it cannot be bought by asking for it directly', path: 'ok', equals: false,
    },
    {
      // The hut is shut, and stays shut without the key.
      type: 'api', route: '/api/hut/open', body: { px: 53, py: 10 },
      label: 'the hut will not open without one', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'hutkeeper', px: 53, py: 10 },
      label: 'and nobody answers the door', path: 'ok', equals: false,
    },

    { type: 'note', text: 'Level 15 is the boundary. One level, and the key appears.' },
    { type: 'api', route: '/api/dev/grant', body: { level: 15 }, expectOk: true, label: 'reach level 15' },
    {
      type: 'api', route: '/api/shops', expectOk: true,
      label: 'the Silver Key is on the counter now',
      path: 'shops.merchant.offers.5.questItemId', equals: 'silver_key',
    },
    {
      type: 'api', route: '/api/shops', expectOk: true,
      label: 'at 5 florins', path: 'shops.merchant.offers.5.price', equals: 5,
    },
    {
      type: 'api', route: '/api/shop/buy', body: { shopId: 'merchant', offerId: 'merchant_key_silver', px: 26, py: 19 },
      expectOk: true, label: 'buy it', path: 'bought.questItemId', equals: 'silver_key',
    },
    {
      type: 'api', route: '/api/state', label: 'it is in the pack', path: 'state.questItems.silver_key', equals: 1,
    },
    {
      // Owning it is not enough — you have to walk there.
      type: 'api', route: '/api/hut/open', body: { px: 10, py: 10 },
      label: 'but the hut still will not open from across the map', path: 'ok', equals: false,
    },

    { type: 'note', text: 'At the door, with the key: the lock turns and the boat changes hands.' },
    {
      type: 'api', route: '/api/hut/open', body: { px: 53, py: 10 }, expectOk: true,
      label: 'the hut opens', path: 'hut.opened', equals: true,
    },
    {
      type: 'api', route: '/api/state', label: 'the key is SPENT — one door, one key',
      path: 'state.questItems.silver_key', equals: undefined,
    },
    {
      type: 'api', route: '/api/state', label: 'and the boat is yours',
      path: 'state.boat.granted', equals: true,
    },
    {
      type: 'api', route: '/api/shops', expectOk: true,
      label: 'the Merchant stops offering a key nobody needs',
      path: 'shops.merchant.offers.5', equals: undefined,
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'hutkeeper', px: 53, py: 10 }, expectOk: true,
      label: 'the Hutkeeper thanks you', path: 'dialogue.stage', equals: 'opening',
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'hutkeeper', px: 53, py: 10 }, expectOk: true,
      label: 'and says it again more briefly the second time', path: 'dialogue.stage', equals: 'open',
    },

    { type: 'note', text: 'FISHING. Only from the boat, only on the interval, and the server owns both.' },
    {
      // ABOARD, not "on her tile". Standing where she happens to be moored is
      // not being in her, and the earlier rule — compare the player to the
      // CONSTANT mooring — meant rowing anywhere at all silently killed
      // fishing. Riding is the flag; this proves it is the flag.
      type: 'api', route: '/api/fish', body: { px: 44, py: 40 },
      label: 'you cannot fish from her tile without climbing in', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/boat/board', body: { px: 45, py: 39 }, expectOk: true,
      label: 'climb in from the bank', path: 'riding', equals: true,
    },
    {
      type: 'api', route: '/api/fish', expectOk: true,
      label: 'the first cast from the boat goes out', path: 'nextCastMs', equals: 10000,
    },
    {
      // The interval is enforced server-side against its own clock — a fast
      // client would otherwise fish as quickly as it could send.
      type: 'api', route: '/api/fish',
      label: 'and a second cast straight away is refused', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/boat/board', body: { x: 45, y: 39 }, expectOk: true,
      label: 'and step back ashore', path: 'riding', equals: false,
    },
    {
      type: 'api', route: '/api/fish',
      label: 'on your feet on the bank, the line will not cast', path: 'ok', equals: false,
    },

    { type: 'note', text: 'THE TRADING POST TAKES TIMBER, STONE AND FISH. Nothing else.' },
    { type: 'api', route: '/api/dev/grant', body: { allItems: true }, expectOk: true, label: 'fill the pack' },
    {
      type: 'api', route: '/api/shop/sell', body: { materialId: 'wild_tuna', qty: 8, vendor: 'merchant', px: 26, py: 19 },
      expectOk: true, label: 'eight Wild Tuna make two florins', path: 'earned', equals: 2,
    },
    {
      type: 'api', route: '/api/shop/sell', body: { materialId: 'wild_tuna', qty: 8, vendor: 'merchant', px: 26, py: 19 },
      label: 'because the rate is four for one', path: 'per', equals: 4,
    },
    {
      type: 'api', route: '/api/shop/sell', body: { materialId: 'ironwood', qty: 5, vendor: 'merchant', px: 26, py: 19 },
      expectOk: true, label: 'and he pays five timber for one florin', path: 'earned', equals: 1,
    },
    {
      // WORSE than the outlanders, deliberately: 5-for-1 here against 7-for-2
      // out in the world. The walk is what the better rate is for.
      type: 'api', route: '/api/shops', expectOk: true,
      label: 'which is worse per unit than the Woodsman',
      path: 'shops.woodsman.buys.0.per', equals: 7,
    },
    {
      type: 'api', route: '/api/shop/sell', body: { materialId: 'voidshard', qty: 5, vendor: 'merchant', px: 26, py: 19 },
      label: 'and he refuses anything that is not timber, stone or fish', path: 'ok', equals: false,
    },
  ],
};
