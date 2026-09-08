// tools/checks/25-elderwatch.mjs — the garrison, and the Standard.
//
// The third map is the opposite of the second: flat, walled, made of rooms, and
// what stops you is people rather than terrain. So this suite asks the same
// question 23-mountain asks — is there a route, and is every lock on it a real
// lock — but the locks are a cracked culvert, two patrolling watchmen, a barred
// door on two plates, and a keyed keep.
//
// The flood fill goes through `probeStep`, the same function the game's own
// collision calls. A copy of the rule would be the copy that goes stale.

const NOW = Date.now();

function save(over) {
  return {
    player: {
      name: 'Standard-bearer', level: 20, xp: 0, xpToNext: 1230,
      x: 2, y: 33, area: 'elderwatch',
      coins: { florin: 50, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 148, maxEnergy: 148,
      gatherTools: [], activeGatherTool: null,
      equipped: [null, null], activeSlot: 0, equipMigrated: true,
      saplings: 0, pity: 0, charms: [null, null], ownedCharms: [],
    },
    materials: {}, tools: [], buildings: [], pendingBuildings: [],
    tasks: [], sessions: [], log: [], harvested: {}, blueprints: [],
    relics: [], plantings: {}, gadgets: {}, cooldowns: {}, blocks: {},
    placedBlocks: {}, refundBank: { materials: {}, coins: {} }, effects: {},
    questItems: {}, vendorsUnlocked: [], questsDone: [],
    hut: { opened: true, spoken: true },
    boat: { granted: false, lastCastAt: 0, riding: false },
    areaPos: {},
    // He has been found and has told you where to go — that is what opens the
    // road here at all.
    wiseMan: { found: true, spoken: true },
    herald: { summonedAt: 1, spoken: true },
    // She comes off the mountain carrying everything it gave her.
    reaches: { gear: ['hooks', 'crampons', 'hammer'], boulders: {}, warden: { beaten: true } },
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
    ...(over || {}),
  };
}

const FILL = `
  const W = window.__sqWorld;
  const seen = new Set(['2,33']);
  const queue = [{ x: 2, y: 33 }];
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    const cur = queue.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (W.probeStep(cur.x, cur.y, nx, ny)) continue;
      const key = nx + ',' + ny;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  RESULT
`;
const fill = (result) => FILL.replace('RESULT', result);

const YARD = '25,25';
// A tile inside the guardroom, behind the barred door.
const GUARDROOM = '49,34';

export default {
  name: 'Elderwatch — a culvert, a watch, a barred door and a keyed keep',
  order: 26,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Standard-bearer', createdAt: NOW, lastPlayedAt: NOW,
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
      type: 'assert', label: 'we are on the moor outside Elderwatch',
      expr: "return window.__sqWorld.getArea();", equals: 'elderwatch',
    },
    { type: 'screenshot', file: 'v8-elderwatch.png' },

    { type: 'note', text: 'THE WALL. The gate is barred and the culvert is not broken yet.' },
    {
      type: 'assert', label: 'nothing inside the fort can be reached',
      expr: fill(`return seen.has('${YARD}');`),
      equals: false,
    },
    {
      type: 'eval', label: 'stand at the culvert and face it',
      expr: "window.__sqWorld.setPlayerTile(17, 33); return 'ok';",
    },
    { type: 'hold', key: 'd', ms: 250, label: 'face the wall' },
    { type: 'wait', ms: 500 },
    {
      // THE HAMMER OFF THE MOUNTAIN OPENS THE FIRST DOOR HERE. Old gear opening
      // a new lock is the cheapest way to make a journey feel like one.
      type: 'assert', label: 'the Stone Hammer is offered the cracked culvert',
      expr: "return window.__sqWorld.getPrompts().join(' | ');",
      equals: 'E  break the cracked rock',
    },
    {
      type: 'eval', label: 'break through the wall',
      expr: `
        window.__sqIn = 'pending';
        (async () => {
          for (const [x, y] of [[18, 33], [19, 33]]) {
            for (let i = 0; i < 4; i += 1) {
              const r = await fetch('/api/gather', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x, y, nodeType: 'crackedcrag' }),
              }).then((z) => z.json());
              if (!r.ok) { window.__sqIn = { ok: false, error: x + ',' + y + ': ' + r.error }; return; }
              if (r.result && r.result.destroyed) break;
            }
          }
          window.__sqIn = { ok: true };
        })();
        return 'swinging';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the culvert gives',
      expr: "if (window.__sqIn === 'pending') return false; if (!window.__sqIn.ok) throw new Error(window.__sqIn.error); return true;",
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'and now the bailey is',
      expr: fill(`return seen.has('${YARD}');`),
      equals: true,
    },

    { type: 'note', text: 'THE YARD. Two barrels, two plates, and the guardroom behind them.' },
    {
      // THE REGRESSION THIS SUITE MISSED. When the keep became a tower it was
      // built on top of this puzzle: a barrel, a plate and two thirds of the
      // gate ended up inside solid stone, and every suite still passed, because
      // a buried barrel throws no error. So the yard is now PLAYED, not merely
      // declared — pushed, opened, walked through.
      type: 'assert', label: 'the guardroom is shut',
      expr: fill(`return seen.has('${GUARDROOM}');`),
      equals: false,
    },
    {
      // SIX, walking a ring around the keep. Two of them used to pace straight
      // through it; one of the four that replaced them ended his beat flush
      // against a shed and stood there facing the wall.
      type: 'assert', label: 'and six of the watch walk a ring, not the inside of the keep',
      expr: "return window.__sqWorld.getMountain().patrols;", equals: 6,
    },
    // The far barrel first. Park the near one on its plate and the far one can
    // no longer get past it — recoverable, but only by knowing to shove it on.
    ...[[44, 51], [40, 49]].flatMap(([from, to]) => {
      const steps = [];
      for (let x = from; x < to; x += 1) {
        steps.push({
          type: 'api', route: '/api/player/move', body: { x: x - 1, y: 38 }, expectOk: true,
          label: `behind the barrel at ${x},38`,
        });
        steps.push({
          type: 'api', route: '/api/reaches/push', body: { x, y: 38, dx: 1, dy: 0 }, expectOk: true,
          label: `roll it to ${x + 1},38`,
        });
      }
      return steps;
    }),
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'both plates held, and the barred door lifts',
      expr: "return window.__sqWorld.getMountain().gateOpen.guardroom;", equals: true,
    },
    {
      type: 'assert', label: 'and the guardroom is walkable now',
      expr: fill(`return seen.has('${GUARDROOM}');`),
      equals: true,
    },
    { type: 'screenshot', file: 'v8-yard.png' },

    { type: 'note', text: 'THE CODEX, on the table at the back of it.' },
    {
      type: 'assert', label: 'no journal, no panel',
      expr: "return window.__sqPanels.codex.isAvailable();", equals: false,
    },
    {
      type: 'eval', label: 'take the Codex off the table',
      expr: `
        window.__sqCodex = 'pending';
        window.__sqWorld.setPlayerTile(49, 34);
        setTimeout(() => {
          Promise.resolve(window.__sqWorld.onTakeQuestItem('codex'))
            .then((j) => { window.__sqCodex = j; }, (e) => { window.__sqCodex = { ok: false, error: e.message }; });
        }, 300);
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'it comes off the table',
      expr: "if (window.__sqCodex === 'pending') return false; if (!window.__sqCodex.ok) throw new Error(window.__sqCodex.error); return true;",
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'and it pays what the yard was worth',
      expr: "return window.__sqCodex.xp;", equals: 220,
    },
    {
      // A SHUT BOOK. The ledger is in the pack and it still will not open —
      // the other half is four floors up, and that is what the climb is for.
      type: 'assert', label: 'but the book alone will not open',
      expr: "return JSON.stringify(window.__sqPanels.codex.gate());",
      equals: '{"book":true,"ring":false}',
    },
    {
      type: 'assert', label: 'and the panel still refuses',
      expr: "return String(window.__sqPanels.codex.open());", equals: 'false',
    },
    { type: 'note', text: 'The rest of the Codex waits on the ring, at the top of the tower.' },

    { type: 'note', text: 'LEAVING PUTS THE ROCKS BACK.' },
    {
      // Bruno, 2026-09-06: "when I leave the map block ... the rocks you can
      // move should reset to their original positions." Walk west out of
      // Elderwatch and back in, and the barrels are where they started — which
      // is also the reset a player can always reach for, since a barrel shoved
      // against a wall can never be shoved back.
      type: 'api', route: '/api/player/move', body: { x: 1, y: 33 }, expectOk: true,
      label: 'walk to the west road',
    },
    { type: 'api', route: '/api/travel', body: { x: 1, y: 33 }, expectOk: true, label: 'leave for the Reaches' },
    // The road back is the crossing COLUMN at x62; x61 is where you land.
    { type: 'api', route: '/api/player/move', body: { x: 62, y: 33 }, expectOk: true, label: 'turn straight round' },
    {
      type: 'api', route: '/api/travel', body: { x: 62, y: 33 }, expectOk: true,
      label: 'and come back', path: 'area', equals: 'elderwatch',
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'the barrels are back at the start of the yard',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const want = JSON.stringify(C.ELDERWATCH_BOULDERS.map((b) => [b.id, b.x, b.y]));
          const got = JSON.stringify(
            window.__sqWorld.getMountain().boulders.map((b) => [b.id, b.x, b.y]));
          return got === want;
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and the barred door is shut again',
      expr: "return window.__sqWorld.getMountain().gateOpen.guardroom;", equals: false,
    },
    {
      type: 'assert', label: 'but the Codex you took is still yours',
      expr: "return JSON.stringify(window.__sqPanels.codex.gate());",
      equals: '{"book":true,"ring":false}',
    },

    { type: 'note', text: 'THE KEEP. Four floors, and the map greys out around each one.' },
    {
      // NO HELD KEY. This flaked four times — at 900ms, at 1600ms, and again
      // from one tile away — because the failure was never the distance. Under
      // load the harness drops most of a hold's frames and she covers no ground
      // at all, so every fix that adjusted the walk was tuning the wrong knob.
      //
      // She is placed ON the stair instead. What is under test is unchanged:
      // BEING ON A STAIR IS WHAT CLIMBS IT — the world checks the tile she
      // stands on each update and raises `onClimbTower`, and that is the code
      // path a walking player takes too. What is given up is the walk itself,
      // which `02-play` and `23-mountain` both exercise at length elsewhere.
      type: 'eval', label: 'step onto the tower stair',
      expr: "window.__sqWorld.setPlayerTile(37, 35); return 'ok';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the Guardroom, floor one',
      expr: "return window.__sqWorld.getMountain().floor === 1;",
    },
    { type: 'eval', label: 'stand in the middle of the room', expr: "window.__sqWorld.setPlayerTile(37, 24); return 'ok';" },
    { type: 'wait', ms: 800 },
    { type: 'screenshot', file: 'v8-keep-1.png' },
    {
      // ONE ROOM, AND THE REST OF ELDERWATCH BELOW IT. The floor is a full-size
      // map with a round room cut into it; outside that circle the bailey is
      // still drawn, and greyed.
      type: 'assert', label: 'outside the tower is not part of this floor',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const W = window.__sqWorld;
          // A tile out in the bailey, well beyond the circle.
          return W.probeStep(C.TOWER.cx, C.TOWER.cy, 22, 12);
        });
      `,
      equals: true,
    },
    {
      // Three, since the Guardroom floor got a third beat along row 17.
      type: 'assert', label: 'and three watchmen walk it',
      expr: "return window.__sqWorld.getMountain().patrols;", equals: 3,
    },
    {
      type: 'eval', label: 'stand in a watchman’s path',
      expr: "window.__sqWorld.setPlayerTile(35, 21); return 'ok';",
    },
    {
      type: 'waitFor', timeoutMs: 25000, label: 'caught — and put back at this floor’s door',
      expr: `
        const t = window.__sqWorld.getPlayerTile();
        return t.x === 37 && t.y === 32;
      `,
    },

    { type: 'note', text: 'UP: the Cistern, and its two barrels.' },
    {
      type: 'api', route: '/api/tower/climb', body: { dir: 1 }, expectOk: true,
      label: 'climb to floor two', path: 'name', equals: 'The Cistern',
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'the way up is shut behind the gate',
      expr: "return window.__sqWorld.getMountain().gateOpen.cistern;", equals: false,
    },
    ...[[32, 22], [32, 26]].flatMap(([x0, y]) => {
      const steps = [];
      for (let x = x0; x < 40; x += 1) {
        steps.push({
          type: 'api', route: '/api/player/move', body: { x: x - 1, y }, expectOk: true,
          label: `behind the barrel at ${x},${y}`,
        });
        steps.push({
          type: 'api', route: '/api/reaches/push', body: { x, y, dx: 1, dy: 0 }, expectOk: true,
          label: `roll it to ${x + 1},${y}`,
        });
      }
      return steps;
    }),
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'both plates held, and the gate opens',
      expr: "return window.__sqWorld.getMountain().gateOpen.cistern;", equals: true,
    },
    { type: 'screenshot', file: 'v8-keep-2.png' },

    { type: 'note', text: 'UP: the Armoury, a bricked arch, and the Brass Key behind it.' },
    {
      type: 'api', route: '/api/tower/climb', body: { dir: 1 }, expectOk: true,
      label: 'climb to floor three', path: 'name', equals: 'The Armoury',
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'the arch is bricked, and the Key is behind it',
      expr: "return window.__sqWorld.probeStep(33, 24, 32, 24);", equals: true,
    },
    {
      type: 'eval', label: 'break the arch with the Stone Hammer',
      expr: `
        window.__sqArch = 'pending';
        (async () => {
          for (const [x, y] of [[32, 23], [32, 24], [32, 25]]) {
            for (let i = 0; i < 4; i += 1) {
              const r = await fetch('/api/gather', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x, y, nodeType: 'crackedcrag' }),
              }).then((z) => z.json());
              if (!r.ok) { window.__sqArch = { ok: false, error: x + ',' + y + ': ' + r.error }; return; }
              if (r.result && r.result.destroyed) break;
            }
          }
          window.__sqArch = { ok: true };
        })();
        return 'swinging';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the arch gives',
      expr: "if (window.__sqArch === 'pending') return false; if (!window.__sqArch.ok) throw new Error(window.__sqArch.error); return true;",
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'and the way west is open',
      expr: "return window.__sqWorld.probeStep(33, 24, 32, 24);", equals: false,
    },
    {
      type: 'eval', label: 'take the Brass Key',
      expr: `
        window.__sqKey = 'pending';
        window.__sqWorld.setPlayerTile(30, 24);
        setTimeout(() => {
          Promise.resolve(window.__sqWorld.onTakeQuestItem('brass_key'))
            .then((j) => { window.__sqKey = j; }, (e) => { window.__sqKey = { ok: false, error: e.message }; });
        }, 300);
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'it is yours',
      expr: "if (window.__sqKey === 'pending') return false; if (!window.__sqKey.ok) throw new Error(window.__sqKey.error); return true;",
    },
    { type: 'screenshot', file: 'v8-keep-3.png' },

    { type: 'note', text: 'UP: the Hall of Keeping.' },
    {
      type: 'api', route: '/api/tower/climb', body: { dir: 1 }, expectOk: true,
      label: 'climb to floor four', path: 'name', equals: 'The Hall of Keeping',
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 700 },
    {
      // AND IT IS IN A WALL NOW. The door used to stand alone in an open round
      // room, so this same assertion passed while the Standard behind it could
      // simply be walked to. `tools/lib/geometry.mjs` asserts the walk-around.
      // SHUT, EVEN HOLDING THE KEY. It used to open for whoever merely carried
      // one — you walked at it and it was not there. The key gets TURNED now.
      type: 'assert', label: 'the shrine door is shut even with the Key in hand',
      expr: "return window.__sqWorld.probeStep(37, 23, 37, 22);", equals: true,
    },
    {
      type: 'api', route: '/api/player/move', body: { x: 37, y: 23 }, expectOk: true,
      label: 'stand at the door',
    },
    {
      type: 'api', route: '/api/door/open', body: {}, expectOk: true,
      label: 'turn the Brass Key in it', path: 'opened', equals: true,
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'and now it is open, and stays open',
      expr: "return window.__sqWorld.probeStep(37, 23, 37, 22);", equals: false,
    },
    {
      type: 'eval', label: 'take the Ashen Standard',
      expr: `
        window.__sqStd = 'pending';
        window.__sqWorld.setPlayerTile(37, 21);
        setTimeout(() => {
          Promise.resolve(window.__sqWorld.onTakeQuestItem('ashen_standard'))
            .then((j) => { window.__sqStd = j; }, (e) => { window.__sqStd = { ok: false, error: e.message }; });
        }, 300);
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'it comes off the stand',
      expr: "if (window.__sqStd === 'pending') return false; if (!window.__sqStd.ok) throw new Error(window.__sqStd.error); return true;",
    },
    {
      type: 'assert', label: 'and it pays what the whole errand was worth',
      expr: "return window.__sqStd.xp;", equals: 600,
    },
    { type: 'wait', ms: 700 },
    { type: 'screenshot', file: 'v8-standard.png' },

    { type: 'note', text: 'THE CHEST beside the stand — and what was actually in this room.' },
    {
      type: 'eval', label: "take Ranon's Ring out of the chest",
      expr: `
        window.__sqRing = 'pending';
        window.__sqWorld.setPlayerTile(40, 22);
        setTimeout(() => {
          Promise.resolve(window.__sqWorld.onTakeQuestItem('ranons_ring'))
            .then((j) => { window.__sqRing = j; }, (e) => { window.__sqRing = { ok: false, error: e.message }; });
        }, 300);
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'it comes out of the chest',
      expr: "if (window.__sqRing === 'pending') return false; if (!window.__sqRing.ok) throw new Error(window.__sqRing.error); return true;",
    },
    {
      type: 'assert', label: 'and the reveal plays',
      expr: "return (window.__sqRing.dialogue && window.__sqRing.dialogue.name) || 'none';",
      equals: 'The Hall of Keeping',
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 700 },
    {
      // THIS IS WHAT THE TOP FLOOR UNLOCKS. The book has been in the pack since
      // the guardroom and shut the whole way up.
      type: 'assert', label: 'both halves now, and the Codex opens',
      expr: "return JSON.stringify(window.__sqPanels.codex.gate());",
      equals: '{"book":true,"ring":true}',
    },
    {
      type: 'eval', label: 'open it',
      expr: "return String(window.__sqPanels.codex.open());",
    },
    { type: 'wait', ms: 500 },
    {
      // IT ALREADY KNOWS WHERE SHE HAS BEEN. The sweep has run since the first
      // save, so a journal opened late is opened FULL — which is what lets it be
      // a reward instead of a tutorial.
      type: 'assert', label: 'it opens already knowing everywhere she had been',
      expr: `
        const seenIds = window.__sqPanels.codex.page().rows.filter((r) => r.known).map((r) => r.id);
        window.__sqPanels.codex.selectTab('place');
        const places = window.__sqPanels.codex.page().rows.filter((r) => r.known).map((r) => r.id);
        return places.sort().join(',');
      `,
      // NOT the_keep: she has not climbed a stair yet, and the Codex is a record
      // of what she has seen rather than of what the map contains.
      equals: 'elderwatch,home,peaks,summit_cave,the_keep',
    },
    {
      // The blanks are the feature: a page showing only what you have found
      // would look finished the moment you found one thing.
      type: 'assert', label: 'and the unfound are drawn as blanks, not dropped',
      expr: `
        window.__sqPanels.codex.selectTab('material');
        const s = window.__sqPanels.codex.shown();
        return s.cards === 11 && s.blanks > 0 && s.blanks < 11;
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v8-codex.png' },
    {
      type: 'assert', label: "and the first thing in it is Ranon's masterplan",
      expr: `
        window.__sqPanels.codex.selectTab('rule');
        const r = window.__sqPanels.codex.page().rows.find((x) => x.id === 'ranons_plan');
        return !!(r && r.known);
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v8-codex.png' },
  ],
};
