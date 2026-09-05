// tools/checks/21-snowfall.mjs — what the Snowfall Reaches actually LOOK like.
//
// WHY THIS EXISTS: 19-reaches is `browser: false`. It counts border tiles and
// tests the crossing gates through the API and never once draws the map — so
// the Home Block's boat, hut and quest bloom being painted on top of the snow
// went straight past it, and so did per-tile state that both maps share.
// Standing in a place and looking at it is a different test from asking the
// server about it.

const NOW = Date.now();

function save(over) {
  return {
    player: {
      name: 'Snowwalker', level: 20, xp: 0, xpToNext: 1230,
      x: 60, y: 10, area: 'home',
      coins: { florin: 200, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 148, maxEnergy: 148,
      gatherTools: [{ uid: 'axe-1', toolId: 'axe', durability: 40, maxDurability: 40 }],
      activeGatherTool: 'axe-1',
      equipped: [{ kind: 'tool', itemId: 'axe', uid: 'axe-1' }, null],
      activeSlot: 0, equipMigrated: true,
      saplings: 0, pity: 0, charms: [null, null], ownedCharms: [],
    },
    materials: {}, tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
    ],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    // Home Block tile-state, all of it near where we will stand in the snow.
    harvested: {
      '6,5': { nodeType: 'bluetree', hitsLeft: 0, felled: true, respawnAt: null },
      // stumpUntil is REQUIRED on a tree record: the one-time v3.1 survey
      // deletes any tree entry without one as a pre-permanence relic, and
      // without it this fixture's stump vanished on load.
      '7,6': { nodeType: 'tree', hitsLeft: 0, felled: true, respawnAt: null, stumpUntil: NOW + 864e5 },
    },
    blueprints: [], relics: [],
    plantings: { '5,6': { nodeType: 'tree', plantedAt: 1 } },
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    questItems: {}, vendorsUnlocked: [], questsDone: [],
    // Everything from Home is FINISHED — the hut open, the boat afloat. This is
    // the save that used to paint all of it onto the snow.
    hut: { opened: true, spoken: true },
    boat: { granted: true, lastCastAt: 0, riding: false },
    areaPos: {},
    wiseMan: { found: false, spoken: false },
    herald: { summonedAt: 1, spoken: true },
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
    ...(over || {}),
  };
}

export default {
  name: 'the Snowfall Reaches — its own map, its own trees',
  order: 22,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Snowwalker', createdAt: NOW, lastPlayedAt: NOW,
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
    { type: 'wait', ms: 1500, label: 'let the camera settle' },
    {
      type: 'assert', label: 'we start in the Home Block',
      expr: "return window.__sqWorld.getArea();", equals: 'home',
    },
    { type: 'hold', key: 'd', ms: 2600, label: 'walk east along the road to the border' },
    { type: 'wait', ms: 600 },
    {
      type: 'eval', label: 'note where the road ran out',
      expr: "const t = window.__sqWorld.getPlayerTile(); return t.x + ',' + t.y + ' prompts=' + JSON.stringify(window.__sqWorld.getPrompts());",
    },
    { type: 'key', key: 'e', label: 'take the road east' },
    { type: 'wait', ms: 1500 },
    {
      type: 'assert', label: 'we crossed into the Reaches',
      expr: "return window.__sqWorld.getArea();", equals: 'peaks',
    },
    { type: 'screenshot', file: 'v6-reaches-arrival.png' },
    {
      type: 'assert', label: 'and we arrive at the foot of the mountain, not in a snowfield',
      expr: "return window.__sqWorld.getMountain().layerName;",
      equals: 'The Foot',
    },
    {
      // NOTHING FROM HOME IS PAINTED ON THE SNOW. The fixture carries Home tile
      // state — a felled Blue Bloom at 6,5, a felled tree at 7,6, a sapling at
      // 5,6 — all within a few tiles of where we now stand. Every one of them
      // used to be drawn here, the bloom's blue stump included.
      type: 'eval', label: 'stand where Home keeps its bloom, its stump and its sapling',
      expr: "window.__sqWorld.setPlayerTile(6, 7); return 'moved';",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'the Reaches has no plantings of its own to show',
      expr: "return window.__sqWorld.getPlantings().length;", equals: 0,
    },
    { type: 'screenshot', file: 'v6-reaches-clean.png' },

    { type: 'note', text: 'HOME LANDMARKS SIT AT COORDINATES THAT EXIST ON BOTH MAPS.' },
    {
      // The Stonemason's cave, the storage hut, the mooring and the Herald's
      // stop are all FIXED tiles, and every one of those tiles exists up here
      // too. Each was drawn or offered on the snow: a slab of ceiling, a door
      // to unlock, a boat to board, a rider to talk to. Stand on each in turn
      // and demand the Reaches offer nothing.
      type: 'eval', label: "stand under Home's cave roof (54,37)",
      expr: "window.__sqWorld.setPlayerTile(54, 37); return 'ok';",
    },
    { type: 'wait', ms: 800 },
    {
      // MEASURED, NOT ASSUMED. The roof paints STONE over the whole cave
      // rectangle. Find a tile inside that rectangle which the Reaches say is
      // SNOW, work out exactly where it lands on screen from the render probe's
      // world origin, and read that pixel.
      //
      // Anchored to the probe rather than to screen centre, and to a tile the
      // map says is snow rather than to whatever is under the scholar: the
      // camera clamps at the map edge so she is not in the middle of the view,
      // and the first two cuts of this assertion sampled a tile nowhere near
      // the cave and then a snowpine — both passed on a knowingly broken build.
      type: 'assert', label: 'no ceiling is painted over the snow',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const W = window.__sqWorld;
          const w = W.getWorld();
          const me = W.getPlayerTile();
          let target = null;
          for (let y = C.CAVE.y; y < C.CAVE.y + C.CAVE.h && !target; y += 1) {
            for (let x = C.CAVE.x; x < C.CAVE.x + C.CAVE.w; x += 1) {
              if (w.tiles[y * C.WORLD_W + x] !== C.TILE_TYPES.snow) continue;
              if (x === me.x && y === me.y) continue;
              target = { x, y };
              break;
            }
          }
          if (!target) throw new Error('no snow tile inside the cave rect to sample');
          const p = W.getRenderProbe();
          const g = document.querySelector('canvas').getContext('2d');
          const px = Math.round(p.originX + (target.x * C.TILE + 8) * p.S);
          const py = Math.round(p.originY + (target.y * C.TILE + 8) * p.S);
          const d = g.getImageData(px, py, 1, 1).data;
          // snow reads near-white (~245,240,215); the roof's stone is ~107,102,136.
          return d[0] > 190 && d[1] > 190 && d[2] > 160;
        });
      `,
      equals: true,
    },
    {
      type: 'eval', label: "stand at Home's hut door (53,10)",
      expr: "window.__sqWorld.setPlayerTile(53, 10); return 'ok';",
    },
    { type: 'wait', ms: 800 },
    {
      type: 'assert', label: 'there is no hut here to unlock',
      expr: "return window.__sqWorld.getPrompts().join(' | ').toLowerCase().indexOf('hut');",
      equals: -1,
    },
    {
      type: 'eval', label: "stand at Home's mooring (44,40)",
      expr: "window.__sqWorld.setPlayerTile(44, 40); return 'ok';",
    },
    { type: 'wait', ms: 800 },
    {
      type: 'assert', label: 'and no boat to take',
      expr: `
        const L = window.__sqWorld.getLake();
        const p = window.__sqWorld.getPrompts().join(' | ').toLowerCase();
        return L.boatGranted === false && L.riding === false && p.indexOf('boat') === -1;
      `,
      equals: true,
    },
    {
      type: 'eval', label: "stand where the Herald waits (25,19)",
      expr: "window.__sqWorld.setPlayerTile(25, 19); return 'ok';",
    },
    { type: 'wait', ms: 800 },
    {
      type: 'assert', label: 'and no rider on the mountain',
      expr: "return window.__sqWorld.getHerald();", equals: null,
    },
    { type: 'screenshot', file: 'v7-no-doubling.png' },
    { type: 'eval', label: 'the labyrinth', expr: "window.__sqWorld.setPlayerTile(14, 40); return 'ok';" },
    { type: 'wait', ms: 700 },
    { type: 'screenshot', file: 'v7-labyrinth.png' },
    { type: 'eval', label: 'the stair out of the labyrinth', expr: "window.__sqWorld.setPlayerTile(23, 34); return 'ok';" },
    { type: 'wait', ms: 700 },
    { type: 'screenshot', file: 'v7-stair-foot.png' },
    { type: 'eval', label: 'the tarn, and the terraces above it', expr: "window.__sqWorld.setPlayerTile(30, 29); return 'ok';" },
    { type: 'wait', ms: 700 },
    { type: 'screenshot', file: 'v7-tarn.png' },
    { type: 'eval', label: 'the road east, out of the labyrinth', expr: "window.__sqWorld.setPlayerTile(58, 33); return 'ok';" },
    { type: 'wait', ms: 700 },
    { type: 'screenshot', file: 'v7-road-east.png' },
    {
      // FELLING IS PER MAP. Chop a pine here; the Home tile at the same
      // coordinates must be untouched. One shared "x,y" namespace meant felling
      // in one map felled in both.
      type: 'eval', label: 'find a pine to fell',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          // Scanned across the whole map rather than one band: the terraces
          // moved, and a hard-coded window is a test that quietly stops
          // testing the moment the map is redrawn.
          for (let y = 2; y < C.WORLD_H - 2; y += 1) {
            for (let x = 2; x < C.WORLD_W - 2; x += 1) {
              if (w.tiles[y * C.WORLD_W + x] !== C.TILE_TYPES.snowpine) continue;
              // Stand on open ground directly below it and face up.
              const below = w.tiles[(y + 1) * C.WORLD_W + x];
              if (below !== C.TILE_TYPES.snow) continue;
              window.__sqPine = { x, y };
              window.__sqWorld.setPlayerTile(x, y + 1);
              return JSON.stringify(window.__sqPine);
            }
          }
          throw new Error('no snowpine with clear ground under it');
        });
      `,
    },
    { type: 'wait', ms: 500 },
    { type: 'hold', key: 'w', ms: 300, label: 'face the pine' },
    { type: 'wait', ms: 400 },
    {
      type: 'eval', label: 'note what she is facing',
      expr: "return JSON.stringify({ pine: window.__sqPine, tile: window.__sqWorld.getPlayerTile(), facing: window.__sqWorld.getFacingNode(), prompts: window.__sqWorld.getPrompts() });",
    },
    {
      type: 'waitFor', timeoutMs: 6000, label: 'the world offers to chop it',
      expr: "return window.__sqWorld.getPrompts().join(' | ').toLowerCase().indexOf('chop') !== -1;",
    },
    {
      type: 'eval', label: 'swing the axe until it falls',
      expr: `
        window.__sqChop = 'pending';
        const p = window.__sqPine;
        (async () => {
          let last = null;
          for (let i = 0; i < 8; i += 1) {
            last = await window.__sqWorld.onGather(p.x, p.y, 'snowpine');
            if (last && last.result && last.result.destroyed) break;
          }
          window.__sqChop = last;
        })().catch((e) => { window.__sqChop = { ok: false, error: e.message }; });
        return 'swinging';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the pine comes down',
      expr: "if (window.__sqChop === 'pending') return false; if (!window.__sqChop.ok) throw new Error(window.__sqChop.error); return !!(window.__sqChop.result && window.__sqChop.result.destroyed);",
    },
    {
      type: 'assert', label: 'and it paid timber, like any other tree',
      expr: "return window.__sqChop.result.materialId;", equals: 'ironwood',
    },
    {
      // THE POINT OF THE WHOLE SUITE: the felled record is keyed to THIS map.
      //
      // Read through the PAGE's own fetch, as an `assert`, because an `api`
      // step only understands `path`/`equals` — it ignores `expr` without
      // complaining, so the first cut of these two checks asserted nothing at
      // all and passed on an HTTP 200.
      type: 'assert', label: "the felled pine is recorded under the Reaches' own key",
      expr: `
        return fetch('/api/state').then((r) => r.json()).then((j) => {
          const h = (j.state && j.state.harvested) || {};
          return Object.keys(h).some((k) => k.indexOf('peaks:') === 0);
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: "and Home's tiles are exactly the three it started with",
      expr: `
        return fetch('/api/state').then((r) => r.json()).then((j) => {
          const h = (j.state && j.state.harvested) || {};
          // A bare key with no prefix is Home's. Only the fixture's two may exist.
          return Object.keys(h).filter((k) => k.indexOf(':') === -1).sort().join(' ');
        });
      `,
      equals: '6,5 7,6',
    },
    { type: 'screenshot', file: 'v6-reaches-felled.png' },
  ],
};
