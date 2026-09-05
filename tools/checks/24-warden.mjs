// tools/checks/24-warden.mjs — the boss, which is a room rather than a fight.
//
// The Rime Warden has no hit points and deals no damage, because this game has
// no combat and no business growing one for a single encounter. What it has is
// a patrol, a sight-line, and three plates. Being seen costs you the room. This
// suite drives all three of those and nothing else.

const NOW = Date.now();

function save() {
  return {
    player: {
      name: 'Summiteer', level: 20, xp: 0, xpToNext: 1230,
      // At the head of the ladder, on the Warden's shelf.
      x: 48, y: 7, area: 'peaks',
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
    areaPos: {}, wiseMan: { found: false, spoken: false },
    herald: { summonedAt: 1, spoken: true },
    reaches: { gear: ['hooks', 'crampons', 'hammer'], boulders: {}, warden: { beaten: false } },
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
  };
}

export default {
  name: 'the Rime Warden — a patrol, a sight-line and three plates',
  order: 25,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Summiteer', createdAt: NOW, lastPlayedAt: NOW,
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
      type: 'assert', label: 'we are on the Summit',
      expr: "return window.__sqWorld.getMountain().layerName;",
      equals: 'The Summit',
    },
    {
      // Standing directly SOUTH of a boulder: she must be in front of it, not
      // behind it. Painted after the depth sort, a boulder covered her from the
      // shins up — she disappeared behind the rock she was pushing.
      type: 'eval', label: 'stand south of a boulder',
      expr: "window.__sqWorld.setPlayerTile(47, 6); return 'ok';",
    },
    { type: 'wait', ms: 700 },
    { type: 'screenshot', file: 'v7-warden.png' },

    {
      // IT MOVES. Read twice, a beat apart: a boss that stands still is a wall
      // with a face, and the whole encounter is built on its timing.
      type: 'eval', label: 'note where it is',
      expr: "window.__sqW0 = window.__sqWorld.getMountain().warden.x; return String(window.__sqW0);",
    },
    { type: 'wait', ms: 1400 },
    {
      type: 'assert', label: 'it paces the shelf',
      expr: "return window.__sqWorld.getMountain().warden.x !== window.__sqW0;",
      equals: true,
    },

    { type: 'note', text: 'THE SIGHT-LINE. Step into the row it walks and it will find you.' },
    {
      type: 'eval', label: 'stand in its path',
      expr: "window.__sqWorld.setPlayerTile(53, 5); return 'standing';",
    },
    {
      // It patrols 46 -> 60 and back at ~0.5s a tile, so one full sweep is
      // about fifteen seconds; twenty is a generous ceiling for being spotted.
      type: 'waitFor', timeoutMs: 25000, label: 'it sees you, and throws you back to the ladder head',
      expr: `
        const t = window.__sqWorld.getPlayerTile();
        return t.x === 48 && t.y === 7;
      `,
    },

    { type: 'note', text: 'THREE PLATES. Held all at once, it comes apart.' },
    {
      type: 'api', route: '/api/reaches/warden', label: 'and not before',
      path: 'ok', equals: false,
    },
    // Each boulder goes four tiles east onto its plate. Driven through the API
    // rather than by walking, because what is under test here is the RULE — the
    // timing is the player's problem and the sight-line above is what proves it.
    ...[[47, 50], [51, 54], [55, 58]].flatMap(([from, to]) => {
      const steps = [];
      for (let x = from; x < to; x += 1) {
        steps.push({
          type: 'api', route: '/api/player/move', body: { x: x - 1, y: 5 }, expectOk: true,
          label: `behind the boulder at ${x},5`,
        });
        steps.push({
          type: 'api', route: '/api/reaches/push', body: { x, y: 5, dx: 1, dy: 0 }, expectOk: true,
          label: `shove it to ${x + 1},5`,
        });
      }
      return steps;
    }),
    {
      type: 'api', route: '/api/reaches/warden', expectOk: true,
      label: 'the Rime Warden breaks', path: 'beaten', equals: true,
    },
    {
      type: 'api', route: '/api/state', label: 'and it stays broken',
      path: 'state.reaches.warden.beaten', equals: true,
    },
    {
      type: 'eval', label: 'pull it into the page',
      expr: "return window.sqMenu.reloadState().then(() => 'reloaded');",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'and the shelf is empty',
      expr: "return window.__sqWorld.getMountain().warden;", equals: null,
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'wiseman', px: 58, py: 3 }, expectOk: true,
      label: 'the cave is open, and the old man talks', path: 'dialogue.stage', equals: 'opening',
    },
    {
      // IN THE CAVE, with the old man. The summit is lifted three tiles up the
      // screen, so before the camera was allowed to rise that far he sat behind
      // the HUD banner and could not be seen at all.
      type: 'eval', label: 'walk into the cave',
      expr: "window.__sqWorld.setPlayerTile(57, 2); return 'ok';",
    },
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'the old man is drawn clear of the banner',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const p = window.__sqWorld.getRenderProbe();
          // Where his feet land on screen, in device pixels.
          const py = p.originY + (C.WISE_MAN.y + 1) * C.TILE * p.S
            - (C.LAYER_LIFT * (C.LAYER_COUNT - 1)) * p.S;
          // The banner is 58 CSS px tall; the canvas is p.S/dpr-scaled, but the
          // banner sits over the top 58*dpr device pixels at most.
          return py > 58 * 2;
        });
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v7-cave.png' },
  ],
};
