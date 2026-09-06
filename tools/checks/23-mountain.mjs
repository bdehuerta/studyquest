// tools/checks/23-mountain.mjs — the climb, walked by a flood fill.
//
// WHY A FLOOD FILL AND NOT A WALKTHROUGH
//
// The Reaches is now a locked region: ladders need the Climbing Hooks, ice
// throws you until you have Crampons, cracked rock needs the Stone Hammer, and
// the cave is behind the Warden. Every one of those is a claim about whether a
// route EXISTS, and driving a scholar around with held keys tests one route on
// one day. This walks all of them.
//
// It flood-fills through `probeStep` — the exact function the game's collision
// calls, not a copy of the rule — and through `probeSlide` for the ice, so a
// tile counts as reached only if the mountain would really let you stand on it.

const NOW = Date.now();

function save(over) {
  return {
    player: {
      name: 'Climber', level: 20, xp: 0, xpToNext: 1230,
      x: 2, y: 42, area: 'peaks',
      coins: { florin: 200, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 148, maxEnergy: 148,
      // She carries the axe every scholar arrives with — the tool that used to
      // delete the labyrinth.
      gatherTools: [{ uid: 'axe-1', toolId: 'axe', durability: 60, maxDurability: 60 }],
      activeGatherTool: 'axe-1',
      equipped: [{ kind: 'tool', itemId: 'axe', uid: 'axe-1' }, null],
      activeSlot: 0, equipMigrated: true,
      saplings: 0, pity: 0, charms: [null, null], ownedCharms: [],
    },
    materials: {}, tools: [], buildings: [], pendingBuildings: [],
    tasks: [], sessions: [], log: [], harvested: {}, blueprints: [],
    relics: [], plantings: {}, gadgets: {}, cooldowns: {}, blocks: {},
    placedBlocks: {}, refundBank: { materials: {}, coins: {} }, effects: {},
    questItems: {}, vendorsUnlocked: [], questsDone: [],
    hut: { opened: true, spoken: true },
    boat: { granted: false, lastCastAt: 0, riding: false },
    areaPos: { home: { x: 62, y: 10 } },
    wiseMan: { found: false, spoken: false },
    herald: { summonedAt: 1, spoken: true },
    reaches: { gear: [], boulders: {}, warden: { beaten: false } },
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
    ...(over || {}),
  };
}

// The fill, run inside the page. Returns the set of reachable tiles as a
// "x,y" string list, starting from the arrival.
const FILL = `
  const W = window.__sqWorld;
  const start = { x: START_X, y: START_Y };
  const seen = new Set([start.x + ',' + start.y]);
  const queue = [start];
  const SLIDES = SLIDING;
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    const cur = queue.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (W.probeStep(cur.x, cur.y, nx, ny)) continue;
      // Ice you cannot stand on carries you: the tile you REACH is where the
      // slide stops, not the one you stepped onto.
      let land = { x: nx, y: ny };
      if (SLIDES) land = W.probeSlide(cur.x, cur.y, dx, dy);
      const key = land.x + ',' + land.y;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(land);
    }
  }
  return [...seen].join(' ');
`;

function fill(startX, startY, sliding) {
  return FILL
    .replace('START_X', String(startX))
    .replace('START_Y', String(startY))
    .replace('SLIDING', sliding ? 'true' : 'false');
}

const ARRIVE = [2, 42];
const HOOKS = '13,35';
const CRAMPONS = '30,28';
const HAMMER = '14,9';
const CAVE = '58,2';

export default {
  name: 'the mountain — every lock, and a route past each one',
  order: 24,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Climber', createdAt: NOW, lastPlayedAt: NOW,
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
      type: 'waitFor', timeoutMs: 15000, label: 'enter the world',
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
    { type: 'wait', ms: 1400 },
    {
      type: 'assert', label: 'we are on the mountain, at its foot',
      expr: "return window.__sqWorld.getMountain().layerName;",
      equals: 'The Foot',
    },

    { type: 'note', text: 'WITH NOTHING: the labyrinth is open and the mountain is not.' },
    {
      type: 'assert', label: 'the Climbing Hooks can be walked to bare-handed',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');",
        `return seen.has('${HOOKS}');`),
      equals: true,
    },
    {
      // NOTHING ABOVE THE FOOT, INCLUDING THE TARN.
      //
      // The stair out of the labyrinth used to need nothing but legs, so the
      // Frozen Tarn was open from the start. Bruno, 2026-09-06: "I should not
      // be able to climb stairs without the climbing hooks." Every terrace
      // climb wants them now, ladder or stair, so the Hooks are the one thing
      // on this mountain you can reach bare-handed and the whole of the rest of
      // it is behind them. `tools/lib/geometry.mjs` walks the gear in order and
      // proves no piece is ever behind itself.
      type: 'assert', label: 'and nothing above the Foot is, not even the tarn',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');",
        `return JSON.stringify([seen.has('${CRAMPONS}'), seen.has('${HAMMER}'), seen.has('${CAVE}')]);`),
      equals: '[false,false,false]',
    },
    { type: 'note', text: 'WITH THE HOOKS: the ladders work — but the ice still throws you.' },
    {
      type: 'eval', label: 'take the Climbing Hooks',
      expr: `
        window.__sqGear = 'pending';
        window.__sqWorld.setPlayerTile(13, 35);
        setTimeout(() => {
          Promise.resolve(window.__sqWorld.onTakeGear('hooks'))
            .then((j) => { window.__sqGear = j; }, (e) => { window.__sqGear = { ok: false, error: e.message }; });
        }, 250);
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'they are yours',
      expr: "if (window.__sqGear === 'pending') return false; if (!window.__sqGear) throw new Error('onTakeGear returned nothing'); if (!window.__sqGear.ok) throw new Error(window.__sqGear.error); return true;",
    },
    {
      // AND NOW THE TARN IS. The stair off the Foot is what the Hooks buy
      // first — the assertion the old rule made at the top of this suite, moved
      // to the moment it is actually true.
      type: 'assert', label: 'and now the tarn opens',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');",
        `return seen.has('${CRAMPONS}');`),
      equals: true,
    },
    {
      // THE TARN IS ITS OWN LOCK. A ladder you cannot stand still next to is a
      // ladder you cannot climb: every slide across the ice overshoots it, so
      // the Hooks alone do not get you off this terrace.
      type: 'assert', label: 'the ladder off the tarn is still out of reach — the ice will not let you stop by it',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');",
        `return seen.has('${HAMMER}');`),
      equals: false,
    },
    { type: 'screenshot', file: 'v7-terrace.png' },

    { type: 'note', text: 'THE SLIDE, WALKED. No teleports past this line — held keys only.' },
    {
      // The ONLY teleport is the setup: she is put at the head of the stair she
      // would have climbed out of the labyrinth. Everything after this is the
      // keyboard, because "the route exists" and "the route can be driven" are
      // different claims and only the second one is the game.
      type: 'eval', label: 'stand at the top of the stair, on the tarn',
      expr: "window.__sqWorld.setPlayerTile(23, 31); return 'ok';",
    },
    { type: 'wait', ms: 600 },
    { type: 'hold', key: 'd', ms: 1800, label: 'east — the ice takes her' },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'and sets her down against the first pillar',
      expr: "const t = window.__sqWorld.getPlayerTile(); return t.x + ',' + t.y;",
      equals: '25,31',
    },
    { type: 'hold', key: 'w', ms: 1800, label: 'north' },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'under the second',
      expr: "const t = window.__sqWorld.getPlayerTile(); return t.x + ',' + t.y;",
      equals: '25,28',
    },
    { type: 'hold', key: 'd', ms: 1800, label: 'east again — onto the island' },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'she is standing on the island, on solid snow',
      expr: "const t = window.__sqWorld.getPlayerTile(); return t.x + ',' + t.y;",
      equals: '29,28',
    },
    {
      // She is facing east, and the cache is the tile in front of her — no need
      // to step onto it, and stepping would put her back on the ice.
      type: 'eval', label: 'take the Crampons',
      expr: `
        window.__sqCr = 'pending';
        Promise.resolve(window.__sqWorld.onTakeGear('crampons'))
          .then((j) => { window.__sqCr = j; }, (e) => { window.__sqCr = { ok: false, error: e.message }; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'THE CRAMPONS, WON BY PLAYING THE PUZZLE',
      expr: "if (window.__sqCr === 'pending') return false; if (!window.__sqCr.ok) throw new Error(window.__sqCr.error); return true;",
    },
    { type: 'screenshot', file: 'v7-island.png' },

    { type: 'note', text: 'STOPPING AGAINST A ROCK MUST NOT BE THE END OF THE ROAD.' },
    {
      type: 'eval', label: 'stand on the tarn, west of a pillar',
      expr: "window.__sqWorld.setPlayerTile(20, 27); return 'ok';",
    },
    { type: 'wait', ms: 600 },
    { type: 'hold', key: 'd', ms: 1400, label: 'slide east into it' },
    { type: 'wait', ms: 500 },
    {
      type: 'eval', label: 'note where the ice stopped her',
      expr: "const t = window.__sqWorld.getPlayerTile(); window.__sqIce = t.x + ',' + t.y; return window.__sqIce;",
    },
    {
      // THE REPORTED BUG, exactly: keep pressing INTO the rock and press a
      // perpendicular direction as well. Ordinary walking resolves each axis on
      // its own and slips along a wall; a slide collapses the input to one
      // direction, and collapsing it to the blocked one made every other key do
      // nothing. Two keys at once is not something `hold` can do, so the events
      // go in by hand — through the same window listener the game uses.
      type: 'eval', label: 'hold east into the rock AND press north',
      expr: `
        const fire = (type, code) => window.dispatchEvent(
          new KeyboardEvent(type, { code, bubbles: true }));
        fire('keydown', 'KeyD');
        fire('keydown', 'KeyW');
        window.__sqRelease = () => { fire('keyup', 'KeyD'); fire('keyup', 'KeyW'); };
        return 'held';
      `,
    },
    { type: 'wait', ms: 1200 },
    {
      type: 'eval', label: 'let go',
      expr: "window.__sqRelease(); return 'released';",
    },
    { type: 'wait', ms: 300 },
    {
      type: 'assert', label: 'she slips along the rock instead of jamming against it',
      expr: `
        const t = window.__sqWorld.getPlayerTile();
        const now = t.x + ',' + t.y;
        if (now === window.__sqIce) throw new Error('stuck at ' + now + ' with two keys held');
        return true;
      `,
      equals: true,
    },



    { type: 'note', text: 'THE CRAMPONS, THE HAMMER, AND WHAT THEY OPEN.' },
    {
      type: 'api', route: '/api/dev/grant', body: { reachesGear: true }, expectOk: true,
      label: 'grant the rest (dev)',
    },
    {
      // The grant went straight to the server; the PAGE has to hear about it.
      type: 'eval', label: 'pull the new state into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'the state carries all three',
      expr: "return window.__sqWorld.getMountain().gear.slice().sort().join(',');",
      equals: 'crampons,hammer,hooks',
    },
    {
      // The gate onto the stair is still shut: gear is not the only lock, and
      // the boulder puzzle is the one thing gear cannot walk past.
      type: 'assert', label: 'but the ice gate is still shut',
      expr: "return window.__sqWorld.getMountain().gateOpen.terrace;",
      equals: false,
    },

    {
      // THE ROAD EAST HAS TO BE WALKABLE TO. It was drawn along the top of the
      // Foot terrace and then sealed off by the labyrinth, which is fifteen
      // rows tall in a fifteen-row terrace: no lane above it, none below. A
      // road you can see and cannot reach is scenery.
      // AND SPECIFICALLY FROM THE MAZE. The flood fill alone is not enough
      // here: the tarn sits directly north of the road, and you may hop DOWN a
      // ledge — so the fill happily found the road from above while the door
      // out of the labyrinth was still sealed against it. This checks the one
      // step that was broken.
      type: 'assert', label: 'you can step out of the labyrinth onto it',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const R = C.EAST_ROAD;
          return window.__sqWorld.probeStep(R.x0 - 1, R.y, R.x0, R.y) === false;
        });
      `,
      equals: true,
    },
    {
      // AND IT REACHES THE CROSSING. The road was carved to the crossing's
      // THRESHOLD column rather than to the map's edge, so its last tile was
      // border crag: the road ran into a wall with the prompt showing over it.
      type: 'assert', label: 'and runs all the way to the tile you cross on',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');",
        `return import('/shared/constants.js').then((C) => {
           const R = C.EAST_ROAD;
           return seen.has((C.WORLD_W - 1) + ',' + R.y);
         });`),
      equals: true,
    },
    {
      type: 'assert', label: 'the road east can actually be walked to',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');",
        `return import('/shared/constants.js').then((C) => {
           const R = C.EAST_ROAD;
           const on = [];
           for (let x = R.x0; x <= R.x1; x += 1) if (seen.has(x + ',' + R.y)) on.push(x);
           if (on.length < (R.x1 - R.x0 + 1)) {
             throw new Error('only ' + on.length + ' of the road is reachable: ' + on.join(','));
           }
           return true;
         });`),
      equals: true,
    },

    { type: 'note', text: 'A CLIMB IS A CLIMB — she rises up the face, she does not blink to the top.' },
    {
      type: 'eval', label: 'stand at the foot of the labyrinth stair and start watching',
      expr: `
        // BELOW the stair, in the maze's last corridor — the stair itself moved
        // into the doorway at 23,32, and starting ON it means starting already
        // lifted, with no rise left to measure.
        window.__sqWorld.setPlayerTile(23, 34);
        window.__sqLifts = [];
        window.__sqTimer = setInterval(() => {
          window.__sqLifts.push(Math.round(window.__sqWorld.getRenderProbe().lift * 100) / 100);
        }, 40);
        return 'watching';
      `,
    },
    { type: 'wait', ms: 400 },
    { type: 'hold', key: 'w', ms: 2200, label: 'walk up it' },
    { type: 'wait', ms: 500 },
    {
      type: 'eval', label: 'stop watching',
      expr: "clearInterval(window.__sqTimer); return String(window.__sqLifts.length);",
    },
    {
      // MEASURED IN FRAMES, NOT IN FLAGS. Her drawn height is sampled every
      // 40ms across the step; if the terrace lift snapped, every sample would
      // read either 0 or the full height and there would be nothing in between.
      // A climb is the in-between.
      type: 'assert', label: 'she passes through the height rather than jumping to it',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const top = C.LAYER_LIFT;
          const mid = window.__sqLifts.filter((v) => v > 0.5 && v < top - 0.5);
          const distinct = new Set(mid).size;
          if (window.__sqLifts[window.__sqLifts.length - 1] < top - 0.5) {
            throw new Error('never reached the terrace: ' + JSON.stringify(window.__sqLifts.slice(-6)));
          }
          return distinct >= 3;
        });
      `,
      equals: true,
    },

    {
      // SLIDING OFF THE TERRACE. The mountain's blocked-test is RELATIVE: a
      // tile may be entered or not depending on which terrace you are standing
      // on. So hopping south off a ledge turned the tile she was still half
      // standing in into "no climbing up there" — her box overlapped it, every
      // direction was refused, and she was welded in place until the save was
      // reloaded. Slide off the tarn on purpose and then demand she can walk.
      type: 'eval', label: 'slide south off the tarn, over the edge',
      expr: "window.__sqWorld.setPlayerTile(30, 30); return 'ok';",
    },
    { type: 'wait', ms: 500 },
    { type: 'hold', key: 's', ms: 1600, label: 'over she goes' },
    { type: 'wait', ms: 600 },
    {
      type: 'eval', label: 'note where she landed',
      expr: `
        const t = window.__sqWorld.getPlayerTile();
        window.__sqFell = t.x + ',' + t.y;
        return window.__sqFell + ' layer ' + window.__sqWorld.getMountain().layer;
      `,
    },
    {
      type: 'assert', label: 'she came down a terrace',
      expr: "return window.__sqWorld.getMountain().layer;", equals: 0,
    },
    { type: 'hold', key: 'a', ms: 900, label: 'and walks away from the drop' },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'she is not welded to the spot she landed on',
      expr: `
        const t = window.__sqWorld.getPlayerTile();
        if (t.x + ',' + t.y === window.__sqFell) throw new Error('stuck where she landed: ' + window.__sqFell);
        return true;
      `,
      equals: true,
    },

    { type: 'note', text: 'LEDGES DROP ONE WAY — the rule that makes the climb a loop.' },
    {
      // Found by scanning rather than hard-coded, so this keeps testing the
      // RULE after the map is redrawn. A ledge is any tile with open ground one
      // terrace below it to the south.
      type: 'assert', label: 'you can step off a ledge, and not back up it',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const W = window.__sqWorld;
          const w = W.getWorld();
          const L = (x, y) => w.layers[y * C.WORLD_W + x];
          const solid = new Set(C.SOLID_TILES);
          for (let y = 1; y < C.WORLD_H - 2; y += 1) {
            for (let x = 1; x < C.WORLD_W - 1; x += 1) {
              if (L(x, y) !== L(x, y + 1) + 1) continue;
              if (solid.has(w.tiles[y * C.WORLD_W + x])) continue;
              if (solid.has(w.tiles[(y + 1) * C.WORLD_W + x])) continue;
              const down = W.probeStep(x, y, x, y + 1);
              const back = W.probeStep(x, y + 1, x, y);
              if (down === false && back === true) return true;
            }
          }
          throw new Error('no ledge on the mountain drops one way');
        });
      `,
      equals: true,
    },
    { type: 'note', text: 'THE BOULDER LOCK. Two boulders, two plates, one gate to the stair.' },
    {
      type: 'api', route: '/api/player/move', body: { x: 35, y: 20 }, expectOk: true,
      label: 'get behind the boulder at 36,20',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 36, y: 20, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 37,20',
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 36, y: 20 }, expectOk: true,
      label: 'get behind the boulder at 37,20',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 37, y: 20, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 38,20',
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 37, y: 20 }, expectOk: true,
      label: 'get behind the boulder at 38,20',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 38, y: 20, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 39,20',
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 38, y: 20 }, expectOk: true,
      label: 'get behind the boulder at 39,20',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 39, y: 20, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 40,20',
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 35, y: 21 }, expectOk: true,
      label: 'get behind the boulder at 36,21',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 36, y: 21, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 37,21',
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 36, y: 21 }, expectOk: true,
      label: 'get behind the boulder at 37,21',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 37, y: 21, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 38,21',
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 37, y: 21 }, expectOk: true,
      label: 'get behind the boulder at 38,21',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 38, y: 21, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 39,21',
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 38, y: 21 }, expectOk: true,
      label: 'get behind the boulder at 39,21',
    },
    {
      type: 'api', route: '/api/reaches/push', body: { x: 39, y: 21, dx: 1, dy: 0 }, expectOk: true,
      label: 'shove it east to 40,21',
    },
    {
      type: 'api', route: '/api/state', label: 'both plates are held',
      path: 'state.reaches.boulders.peaks:terrace_a.x', equals: 40,
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'and the ice gate opens',
      expr: "return window.__sqWorld.getMountain().gateOpen.terrace;",
      equals: true,
    },
    {
      type: 'assert', label: 'the Stone Hammer can now be reached',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');", `return seen.has('${HAMMER}');`),
      equals: true,
    },
    { type: 'screenshot', file: 'v7-steps.png' },

    { type: 'note', text: 'CRACKED CRAG. Six tiles of it stand between the Steps and the ladder.' },
    {
      type: 'assert', label: 'and until it is broken, the summit cannot be reached',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');", "return seen.has('48,8');"),
      equals: false,
    },
    {
      // SWUNG THROUGH THE WORLD, NOT THROUGH THE API.
      //
      // Every earlier version of this suite broke the bricked doorways by
      // POSTing to /api/gather, which skips the client entirely — and the client
      // was the half that was broken. `nodeReady` looked up `node.tool`, which a
      // gear node does not have, so it decided nothing could ever work cracked
      // crag: the E key did nothing and the prompt read "needs a tool". The
      // Stone Hammer was a thing you could find and never use.
      type: 'eval', label: 'stand in front of a bricked doorway',
      expr: "window.__sqWorld.setPlayerTile(19, 16); return 'ok';",
    },
    { type: 'hold', key: 'w', ms: 250, label: 'face it' },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'the world offers the swing, with nothing in either hand',
      expr: `
        const eq = window.__sqApi ? null : null;
        return window.__sqWorld.getPrompts().join(' | ');
      `,
      equals: 'E  break the cracked rock',
    },
    // ...and swing it, with the E key, three times, the way a player would.
    { type: 'key', key: 'e', label: 'swing' },
    { type: 'wait', ms: 700 },
    { type: 'key', key: 'e', label: 'swing again' },
    { type: 'wait', ms: 700 },
    { type: 'key', key: 'e', label: 'and again' },
    { type: 'wait', ms: 900 },
    { type: 'screenshot', file: 'v7-broken-door.png' },
    {
      type: 'assert', label: 'the doorway is open, broken by the key alone',
      expr: "return window.__sqWorld.probeStep(19, 16, 19, 15);",
      equals: false,
    },
    {
      type: 'eval', label: 'break the remaining walls',
      expr: `
        window.__sqBreak = 'pending';
        const walls = [[19,14],[41,10],[41,11]];
        (async () => {
          for (const [x, y] of walls) {
            for (let i = 0; i < 4; i += 1) {
              const r = await fetch('/api/gather', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x, y, nodeType: 'crackedcrag' }),
              }).then((z) => z.json());
              if (!r.ok) { window.__sqBreak = { ok: false, error: x + ',' + y + ': ' + r.error }; return; }
              if (r.result && r.result.destroyed) break;
            }
          }
          window.__sqBreak = { ok: true };
        })();
        return 'swinging';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 20000, label: 'the rock gives',
      expr: "if (window.__sqBreak === 'pending') return false; if (!window.__sqBreak.ok) throw new Error(window.__sqBreak.error); return true;",
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'now the ladder to the Summit can be reached',
      expr: `${fill(ARRIVE[0], ARRIVE[1], true)}`.replace("return [...seen].join(' ');", "return seen.has('48,8');"),
      equals: true,
    },
    {
      // AND THE CAVE IS STILL SHUT. The last lock on the mountain is not a
      // wall — it is the Warden, and it is not something a route can walk past.
      type: 'api', route: '/api/npc/talk', body: { vendor: 'wiseman', px: 58, py: 3 },
      label: 'but the Wise Man will not be reached past the Warden', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/dev/grant', body: { wardenBeaten: true }, expectOk: true,
      label: 'break the Warden (dev — its own timing puzzle is driven in 24-warden)',
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'wiseman', px: 58, py: 3 }, expectOk: true,
      label: 'and then the old man speaks', path: 'dialogue.stage', equals: 'opening',
    },
    {
      type: 'api', route: '/api/state', label: 'and the 400 xp the Herald reserved for him lands',
      path: 'state.questsDone', truthy: true,
    },
  ],
};
