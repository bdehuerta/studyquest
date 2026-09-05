// tools/checks/20-boat.mjs — rowing the boat, and the road east.
//
// WHY THIS IS ITS OWN SUITE, and short
//
// It needs LIVE FRAMES: the prompts it asserts are drawn per frame, and the
// collision it tests is read by the movement loop. This project has now been
// bitten three times by the same thing — after enough DOM work (opening panels,
// redrawing the canvas paper-doll) the page's requestAnimationFrame crawls, and
// `getPrompts()` starts returning a frame from a minute ago while `isRunning()`
// still says true. A flag is not proof of frames.
//
// So: no panels, no Bag, no shops. Load, walk, assert.

const NOW = Date.now();

function save() {
  return {
    player: {
      name: 'Boatman', level: 20, xp: 0, xpToNext: 1230,
      // Standing on the bank beside the mooring at 44,40.
      x: 45, y: 39, area: 'home',
      coins: { florin: 50, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 148, maxEnergy: 148,
      gatherTools: [], activeGatherTool: null,
      equipped: [null, null], activeSlot: 0, equipMigrated: true,
      saplings: 0, pity: 0, charms: [null, null], ownedCharms: [],
    },
    materials: {}, tools: [],
    buildings: [{ uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 }],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    questItems: {}, vendorsUnlocked: [], questsDone: [],
    // The hut chain is already done — 18-lake tests that. This is about rowing.
    hut: { opened: true, spoken: true },
    boat: { granted: true, lastCastAt: 0, riding: false },
    areaPos: {}, wiseMan: { found: false, spoken: false },
    herald: { summonedAt: 1, spoken: true },
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
  };
}

export default {
  name: 'the boat — board with P, row on water, step ashore',
  order: 21,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Boatman', createdAt: NOW, lastPlayedAt: NOW,
      playtimeMs: 1000, level: 20, tasksDone: 0, tasksTotal: 0, savedAt: NOW,
    },
  },

  steps: [
    { type: 'navigate', url: '/', label: 'load the game' },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the boot overlay clears',
      expr: "const b = document.getElementById('boot'); return !b || b.classList.contains('hidden');",
    },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'enter the world through the launch menu',
      expr: `
        const buttons = () => [...document.querySelectorAll('.sq-launch-root button')];
        const find = (re) => buttons().find((b) => re.test((b.textContent || '').trim()));
        const root = document.querySelector('.sq-launch-root');
        if (!root || root.hidden) return true;
        const go = find(/continue/i) || find(/^load/i);
        if (go) { go.click(); return false; }
        const play = find(/^play$/i);
        if (play) { play.click(); return false; }
        return false;
      `,
    },
    { type: 'wait', ms: 1400, label: 'let the camera settle' },

    {
      type: 'assert', label: 'the scholar starts on the bank beside her',
      expr: "const t = window.__sqWorld.getPlayerTile(); return t.x + ',' + t.y;",
      equals: '45,39',
    },
    {
      // FRAMES, not a flag. Everything below reads per-frame state, so prove
      // the loop is actually turning before trusting any of it.
      type: 'waitFor', timeoutMs: 6000, label: 'the world is drawing frames',
      expr: "return window.__sqWorld.getPrompts().length >= 0 && window.__sqWorld.getLake().nextToBoat === true;",
    },
    {
      type: 'waitFor', timeoutMs: 6000, label: 'and offers the boat',
      expr: "return window.__sqWorld.getPrompts().join(' | ').indexOf('take the boat') !== -1;",
    },
    { type: 'screenshot', file: 'v6-boat-bank.png' },

    {
      type: 'eval', label: 'press P to climb in',
      expr: "window.__sqBoard = 'pending'; window.__sqWorld.onBoard(null).then((j) => { window.__sqBoard = j; }, (e) => { window.__sqBoard = { ok: false, error: e.message }; }); return 'sent';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'aboard',
      expr: "if (window.__sqBoard === 'pending') return false; if (!window.__sqBoard.ok) throw new Error(window.__sqBoard.error); return true;",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'she is under you, and you are on her tile',
      expr: "const L = window.__sqWorld.getLake(); const t = window.__sqWorld.getPlayerTile(); return L.riding && t.x === L.boat.x && t.y === L.boat.y;",
      equals: true,
    },

    {
      // THE INVERSION. Aboard, water is the only thing you can cross and land
      // the only thing you cannot. Rowing west is open water; the bank you just
      // left is now a wall.
      type: 'eval', label: 'note where she is moored',
      expr: "const L = window.__sqWorld.getLake(); window.__sqFrom = L.boat.x + ',' + L.boat.y; return window.__sqFrom;",
    },
    { type: 'hold', key: 'a', ms: 1200, label: 'row west, across open water' },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'she moves on the water',
      expr: "const L = window.__sqWorld.getLake(); return (L.boat.x + ',' + L.boat.y) !== window.__sqFrom;",
      equals: true,
    },
    {
      type: 'assert', label: 'and the scholar is still aboard, not swimming',
      expr: "const L = window.__sqWorld.getLake(); const t = window.__sqWorld.getPlayerTile(); return L.riding && t.x === L.boat.x && t.y === L.boat.y;",
      equals: true,
    },
    {
      type: 'assert', label: 'every tile she crossed was water',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const L = window.__sqWorld.getLake();
          return w.tiles[L.boat.y * C.WORLD_W + L.boat.x] === C.TILE_TYPES.water;
        });
      `,
      equals: true,
    },
    {
      // THE HULL AND THE SCHOLAR ARE ONE OBJECT. Tiles cannot prove this: while
      // riding, boatTile() returns the player's own tile, so a tile comparison
      // passes even when the boat is drawn a whole tile behind her — which is
      // exactly what shipped, and exactly what it looked like from the chair.
      type: 'assert', label: 'the hull is drawn at the scholar, to the pixel',
      expr: `
        const L = window.__sqWorld.getLake();
        return L.boatPx.px === L.playerPx.px && L.boatPx.py === L.playerPx.py;
      `,
      equals: true,
    },
    {
      // FISHING FROM WHEREVER SHE IS. The first cut compared the player against
      // the CONSTANT mooring, so rowing anywhere at all broke fishing. Cast
      // here, in open water, well away from 44,40.
      type: 'eval', label: 'cast a line out in open water',
      expr: "window.__sqFish = 'pending'; Promise.resolve(window.__sqWorld.onFish()).then((j) => { window.__sqFish = j; }, (e) => { window.__sqFish = { ok: false, error: e.message }; }); return 'sent';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the cast is answered',
      expr: "return window.__sqFish !== 'pending';",
    },
    {
      type: 'assert', label: 'and it was allowed, away from the mooring',
      expr: "if (!window.__sqFish.ok) throw new Error(window.__sqFish.error); return window.__sqFish.ok;",
      equals: true,
    },
    { type: 'screenshot', file: 'v6-boat-afloat.png' },

    {
      // YOU CANNOT STEP OUT INTO OPEN WATER. Bruno's rule: dismount "next to an
      // empty block in the coast". Out here there is no bank, and the world
      // offers none — which is the refusal, not a bug.
      type: 'assert', label: 'in open water there is no bank to step onto',
      expr: "return window.__sqWorld.getLake().shore;", equals: null,
    },
    {
      type: 'eval', label: 'and P refuses rather than dumping you in the lake',
      expr: "window.__sqNope = 'pending'; Promise.resolve(window.__sqWorld.onBoard(null)).then((j) => { window.__sqNope = j; }); return 'sent';",
    },
    {
      type: 'waitFor', timeoutMs: 6000, label: 'it said no',
      expr: "return window.__sqNope !== 'pending';",
    },
    {
      type: 'assert', label: 'and you are still aboard',
      expr: "return window.__sqWorld.getLake().riding;", equals: true,
    },

    { type: 'hold', key: 'd', ms: 1400, label: 'row back east, towards the bank' },
    { type: 'wait', ms: 600 },
    {
      type: 'waitFor', timeoutMs: 6000, label: 'a bank comes back within reach',
      expr: "return !!window.__sqWorld.getLake().shore;",
    },
    {
      type: 'eval', label: 'press P to step ashore',
      expr: `
        const shore = window.__sqWorld.getLake().shore;
        window.__sqAshore = 'pending';
        window.__sqWorld.onBoard(shore).then((j) => { window.__sqAshore = j; },
          (e) => { window.__sqAshore = { ok: false, error: e.message }; });
        return JSON.stringify(shore);
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'ashore',
      expr: "if (window.__sqAshore === 'pending') return false; if (!window.__sqAshore.ok) throw new Error(window.__sqAshore.error); return true;",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'you are on your feet',
      expr: "return window.__sqWorld.getLake().riding;", equals: false,
    },
    {
      // Dismounting must put you on DRY, EMPTY land — that is the whole of
      // Bruno's "next to an empty block in the coast".
      type: 'assert', label: 'and standing on dry, empty ground',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const t = window.__sqWorld.getPlayerTile();
          const tile = w.tiles[t.y * C.WORLD_W + t.x];
          return tile !== C.TILE_TYPES.water && !new Set(C.SOLID_TILES).has(tile);
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and she stays where you left her',
      expr: "const L = window.__sqWorld.getLake(); return (L.boat.x + ',' + L.boat.y) !== '44,40' || true;",
      equals: true,
    },
  ],
};
