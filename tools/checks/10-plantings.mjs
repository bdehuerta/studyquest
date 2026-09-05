// tools/checks/10-plantings.mjs — saplings, on screen, in a real browser.
//
// WHY THIS SUITE EXISTS
//
// /api/plant worked from the day v3 landed. `state.plantings` was written, the
// event log announced it, and every API suite went green — while the tile in
// the game stayed bare grass, because web/world/world.js never read
// `state.plantings` and never drew SPRITES3.saplings. A suite that only checks
// "nothing threw" cannot see that, and this project has shipped that exact
// class of bug more than once.
//
// So this suite asserts PIXELS. It reads the sapling art out of art.js at run
// time, works out where each planting's tile lands on the canvas from the
// renderer's own camera, and counts how many pixels of that art are actually
// on screen there. Bare grass must score zero. If plantings ever come unwired
// again — mirror dropped, render pass removed, art renamed — these counts go to
// zero and the suite fails.
//
// It also drives the whole loop through the keyboard: stand on open ground,
// face a stump, press E, and watch a sapling appear where the stump was.

const M = 60000;
const NOW = Date.now();

/**
 * The four SAPLING_STAGES, laid out left to right on one row of grass.
 *
 * Every one is saved with `stage: 'sprout'` ON PURPOSE. Growth is a pure
 * function of plantedAt, and the client is supposed to recompute it on its own
 * clock so a sapling visibly climbs its stages without a round-trip. If the
 * renderer ever went back to trusting the saved snapshot, every one of these
 * would draw as a sprout and the stage assertion below would catch it.
 */
const PLANTED = {
  '18,21': { plantedAt: NOW - 1 * M, stage: 'sprout', source: 'sapling', boostMinutes: 0 },
  '19,21': { plantedAt: NOW - 25 * M, stage: 'sprout', source: 'sapling', boostMinutes: 0 },
  '21,21': { plantedAt: NOW - 70 * M, stage: 'sprout', source: 'sapling', boostMinutes: 0 },
  '22,21': { plantedAt: NOW - 130 * M, stage: 'sprout', source: 'seedpod', boostMinutes: 0 },
};

/**
 * A felled tree directly below the scholar, who starts facing down.
 *
 * The whole scene sits west of the plaza on purpose. The server plants the
 * three starter buildings at x29-33 whatever the save says, and standing beside
 * one changes what E does (the building wins; the prompt switches to P) as well
 * as drawing over the tiles being measured.
 */
const STUMP = {
  '20,20': {
    nodeType: 'tree', hitsLeft: 0, respawnAt: null,
    felled: true, felledAt: NOW - M, plantable: true, stumpUntil: NOW + 9 * M,
  },
};

function seedSave() {
  return {
    player: {
      name: 'Forester', level: 4, xp: 0, xpToNext: 500,
      x: 20, y: 19,
      coins: { focus: 50, insight: 50, grind: 50, spark: 50 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 100, maxEnergy: 100,
      gatherTools: [{ uid: 'axe-1', toolId: 'axe', durability: 60, maxDurability: 60 }],
      activeGatherTool: 'axe-1',
      // HOLDING the saplings, with the axe carried in the other hand. Only the
      // SELECTED slot acts, so a suite about planting has to select the seeds:
      // left to the migration the axe lands in slot 1 and is selected, and
      // every plant assertion below fails for a reason that is not planting.
      equipped: [{ kind: 'seed', itemId: 'sapling' }, { kind: 'tool', itemId: 'axe', uid: 'axe-1' }],
      activeSlot: 0,
      equipMigrated: true,
      saplings: 3,
    },
    materials: { ironwood: 0, chalkstone: 0, seedpod: 0 },
    tools: [],
    // Seeded explicitly and FAR from the measured tiles. A save that is missing
    // any of the three starter buildings gets them raised automatically, right
    // beside wherever the scholar happens to stand — which drew over the tiles
    // this suite measures and changed what E does (a building you are standing
    // beside wins over planting; the prompt becomes P).
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 25, y: 12 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 29, y: 12 },
      { uid: 'seed-archive', buildingId: 'archive', x: 25, y: 15 },
    ],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: { ...STUMP },
    blueprints: [], relics: [],
    plantings: { ...PLANTED },
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 1, saplingsPlanted: 4, blocksPlaced: 0,
    },
  };
}

/**
 * Count, inside one tile's rect on the live canvas, how many pixels carry a
 * colour from the authored sapling art.
 *
 * The palette is read from web/world/art.js at run time rather than hardcoded,
 * so this measures "the art in art.js reached the screen" and not "some green
 * pixels exist". The tile rect comes from the renderer's own camera probe, so
 * it stays correct even if the camera maths changes.
 */
function countSaplingPixels(tiles, verdict = 'return counts;') {
  return `
    return import('/web/world/art.js').then((m) => {
      const hex = (h) => {
        const s = String(h).replace('#', '');
        return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
      };
      // Only the SPROUT's palette. The young sapling's canopy shares colours
      // with the wild tree tile and with grass detail, so unioning all three
      // stages would score bare ground and stumps above zero and the control
      // assertions would stop meaning anything. The sprout's yellow-greens
      // appear nowhere else on the map, which makes the count a clean signal.
      for (const id of ['sprout', 'seedling', 'young']) {
        if (!m.SPRITES3.saplings[id]) return 'no authored art for stage ' + id;
      }
      const cols = new Set();
      const spr = m.SPRITES3.saplings.sprout;
      for (const row of spr.rows) {
        for (const ch of row) if (ch !== '.' && spr.palette[ch]) cols.add(spr.palette[ch]);
      }
      const want = [...cols].map(hex);
      if (!want.length) return 'the sapling palette is empty';
      const P = window.__sqWorld.getRenderProbe();
      const S = P.S;
      const camX = Math.round(P.camX * S) / S;
      const camY = Math.round(P.camY * S) / S;
      const g = document.getElementById('stage').getContext('2d');
      const at = (tx, ty) => {
        const d = g.getImageData(
          Math.round((tx * 16 - camX) * S), Math.round((ty * 16 - camY) * S), 16 * S, 16 * S
        ).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          for (const w of want) { if (d[i] === w[0] && d[i+1] === w[1] && d[i+2] === w[2]) { n++; break; } }
        }
        return n;
      };
      const counts = ${JSON.stringify(tiles)}.map(([x, y]) => at(x, y));
      ${verdict}
    });
  `;
}

export default {
  name: 'v3 plantings — saplings mirrored, grown, drawn and planted',
  order: 90,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': seedSave(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Forester', createdAt: 1750000000000, lastPlayedAt: 1750000000000,
      playtimeMs: 60000, level: 4, tasksDone: 0, tasksTotal: 0, savedAt: 1750000000000,
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
        if (!root || root.hidden) return true;          // already in the world
        const go = find(/continue/i) || find(/^load/i);
        if (go) { go.click(); return false; }           // saves are up: go in
        const play = find(/^play$/i);
        if (play) { play.click(); return false; }       // still on the title
        return false;                                   // panel not drawn yet
      `,
    },
    {
      type: 'waitFor', timeoutMs: 10000, label: 'the title screen steps aside',
      expr: "const r=document.querySelector('.sq-launch-root'); return !r || r.hidden;",
    },
    { type: 'wait', ms: 1200, label: 'let the camera settle' },

    // ------------------------------------------------- the mirror exists
    {
      type: 'assert', label: 'the renderer exposes its state to the harness',
      expr: "return !!(window.__sqWorld && window.__sqWorld.getPlantings && window.__sqWorld.getRenderProbe);",
    },
    {
      type: 'assert', label: 'all four plantings were mirrored out of state.plantings',
      expr: "return window.__sqWorld.getPlantings().length;", equals: 4,
    },

    // ----------------------------------- growth is recomputed on the client
    {
      type: 'assert',
      label: 'each planting shows the stage its AGE says, not the stage the save says',
      expr: "return window.__sqWorld.getPlantings().sort((a,b)=>a.x-b.x).map(p=>p.growth.stage);",
      equals: ['sprout', 'seedling', 'young', 'mature'],
    },
    {
      type: 'assert', label: 'and the oldest one is chopable',
      expr: "return window.__sqWorld.getPlantings().filter(p=>p.growth.mature).length;", equals: 1,
    },

    // -------------------------------------------- THE PIXELS. The whole point.
    {
      type: 'assert',
      label: 'the authored sapling art is ON SCREEN, and grows with the stage',
      // A sprout is a few pixels, a seedling more, a young tree more again —
      // so the counts must not just be non-zero, they must climb.
      expr: countSaplingPixels(
        [[18, 21], [19, 21], [21, 21]],
        'if (!(counts[0] > 0 && counts[1] > counts[0] && counts[2] > counts[1])) throw new Error("sapling pixel counts do not climb with the stage: " + counts.join(",")); return counts;'
      ),
    },
    {
      type: 'assert', label: 'bare grass carries none of that art',
      expr: countSaplingPixels([[23, 21], [23, 20], [18, 19]]),
      equals: [0, 0, 0],
    },
    { type: 'screenshot', file: 'v3-plantings-stages.png', label: 'screenshot: four stages on one row' },

    // ------------------------------------------ planting, through the keyboard
    {
      type: 'assert', label: 'the stump below the scholar reads as plantable ground',
      expr: "const t = window.__sqWorld.getFacingPlant(); return t && [t.x, t.y, t.onStump];",
      equals: [20, 20, true],
    },
    {
      type: 'assert', label: 'the stump itself carries no sapling art yet',
      expr: countSaplingPixels([[20, 20]]), equals: [0],
    },
    { type: 'assert', label: 'three saplings in the bag', expr: "return window.__sqWorld.getSeedStock().saplings;", equals: 3 },

    { type: 'key', key: 'e', label: 'plant it (E)' },
    {
      // Poll rather than sleep. The round-trip is fast on its own but this is
      // the tenth suite in a run and the browser is busy; a fixed wait was
      // landing just short of it about one run in three.
      type: 'waitFor', timeoutMs: 10000,
      label: 'the plant request reaches the server',
      expr: "return fetch('/api/state').then(r=>r.json()).then(j => !!(j.state.plantings && j.state.plantings['20,20']));",
    },
    {
      // waitFor, not assert: the plant round-trip and the state broadcast that
      // follows it are asynchronous, and under a full ten-suite run the browser
      // is busy enough for a fixed sleep to land short of it.
      type: 'waitFor', timeoutMs: 8000,
      label: 'the renderer picked it up from the state push',
      expr: "return window.__sqWorld.getPlantings().length === 5;",
    },
    { type: 'assert', label: 'and it cost a sapling', expr: "return window.__sqWorld.getSeedStock().saplings;", equals: 2 },
    {
      type: 'api', route: '/api/state', label: 'the save carries the planting',
      expectOk: true, path: 'state.plantings.20,20.plantedAt', truthy: true,
    },
    { type: 'wait', ms: 2600, label: 'let the plant toast rise and expire before sampling pixels' },
    {
      type: 'assert',
      label: 'THE STUMP IS NOW A SPROUT ON SCREEN — art where there was none',
      expr: countSaplingPixels(
        [[20, 20]],
        'if (!(counts[0] > 0)) throw new Error("no sapling art on the tile that was just planted"); return counts;'
      ),
    },
    {
      type: 'assert', label: 'the tile stops offering a plant prompt once something grows there',
      expr: "return window.__sqWorld.getFacingPlant();", equals: null,
    },
    { type: 'screenshot', file: 'v3-plantings-planted.png', label: 'screenshot: planted on a stump' },

    // ---- NOTHING GROWS IN THE SQUARE, OR BESIDE A TRADER ------------------
    //
    // Bruno, 2026-09-01: "in this area, seeds should not be allowed to be
    // planted (would obstruct the buildings and the npcs). this also applies to
    // the area near the woodsman npc (the soil 1 block right next to it)."
    //
    // A mature tree is a SOLID tile and trees do not grow back — so one planted
    // between the Market and the Archive walls off a doorway permanently, and
    // one beside the Woodsman is a vendor you can no longer reach.
    //
    // Both halves are asserted through the SERVER, because that is what decides.
    // The world's prompt uses the same shared rule; a prompt the API refuses is
    // exactly the lie this project keeps having to fix.
    {
      // This save seeds its buildings at 25,12 / 29,12 / 25,15 — deliberately
      // far from the tiles it measures. The tile just below the Study Hut is
      // the doorway case.
      type: 'api', route: '/api/plant', body: { x: 25, y: 14, source: 'sapling' },
      label: 'the ground against a wall is refused', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/plant', body: { x: 25, y: 14, source: 'sapling' },
      label: 'and the refusal says why, not just no', path: 'error', truthy: true,
    },
    {
      type: 'assert', label: 'the gap between the four plaza buildings is closed too',
      expr: `
        return import('/shared/constants.js').then((C) => {
          // The real plaza layout, from server/store.js STARTING_BUILDINGS.
          const bs = [
            { buildingId: 'study_hut', x: 22, y: 17 },
            { buildingId: 'trading_post', x: 26, y: 17 },
            { buildingId: 'archive', x: 22, y: 20 },
            { buildingId: 'exchange_post', x: 26, y: 20 },
          ];
          // Every tile in the gap the screenshot showed.
          for (let y = 19; y <= 19; y += 1) {
            for (let x = 24; x <= 25; x += 1) {
              if (!C.plantingBlockedAt(x, y, bs)) return 'open at ' + x + ',' + y;
            }
          }
          return true;
        });
      `,
      equals: true,
    },
    {
      // The Woodsman stands one tile below the front edge of his camp — at
      // 9,40 for a camp at 8,38. The tile beside him is the one Bruno named.
      type: 'api', route: '/api/plant', body: { x: 10, y: 40, source: 'sapling' },
      label: 'and the soil right next to the Woodsman', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/plant', body: { x: 10, y: 40, source: 'sapling' },
      label: 'which says somebody is standing there', path: 'error', truthy: true,
    },
    {
      // THE NPC RULE HAS TO EARN ITS KEEP. The building halo already covers the
      // tile the Woodsman stands on, so the only place the second rule shows up
      // is the row BELOW him — outside the camp's halo, still right beside the
      // man. Without it that tile is open, and a tree there is a vendor you
      // walk up to and cannot reach.
      type: 'assert', label: 'the tile below him is closed by the NPC rule, not the wall',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const bs = [{ buildingId: 'woodsman_camp', x: 8, y: 38 }];
          const t = C.npcStandTile('woodsman_camp', 8, 38, C.BUILDING_FOOTPRINT.woodsman_camp);
          const below = C.plantingBlockedAt(t.x, t.y + 1, bs);
          const wellClear = C.plantingBlockedAt(t.x, t.y + 3, bs);
          return below === 'npc' && wellClear === null;
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and open country far from both is still plantable ground',
      expr: `
        return import('/shared/constants.js').then((C) => C.plantingBlockedAt(40, 44, []) === null);
      `,
      equals: true,
    },
  ],
};
