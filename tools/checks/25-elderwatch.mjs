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

    { type: 'note', text: 'THE KEEP. Four floors, and the map greys out around each one.' },
    {
      type: 'eval', label: 'walk to the tower door',
      expr: "window.__sqWorld.setPlayerTile(37, 37); return 'ok';",
    },
    { type: 'wait', ms: 500 },
    { type: 'hold', key: 'w', ms: 900, label: 'in through the door' },
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
      type: 'assert', label: 'and two watchmen walk it',
      expr: "return window.__sqWorld.getMountain().patrols;", equals: 2,
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
      type: 'assert', label: 'the shrine door opens for the Key',
      expr: "return window.__sqWorld.probeStep(37, 28, 37, 27);", equals: false,
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
  ],
};
