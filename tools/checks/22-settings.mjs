// tools/checks/22-settings.mjs — settings that survive a restart.
//
// WHY THIS EXISTS
//
// Settings were kept in localStorage. localStorage is keyed by ORIGIN, and the
// native shell binds the server to a FREE PORT chosen at every launch — so
// every launch was http://127.0.0.1:<a different number>, a brand new origin
// with an empty store, and every setting silently reset itself. Nothing caught
// it because in the browser harness the port never changes.
//
// So this suite does not test localStorage at all. It tests the thing that
// actually has to be true: a setting changed in the sheet is ON DISK, in the
// data dir, where the next launch will find it whatever port it lands on.

const NOW = Date.now();

export default {
  name: 'settings — written to disk, not to an origin that will not be there',
  order: 23,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': {
      player: {
        name: 'Tinker', level: 3, xp: 0, xpToNext: 120,
        x: 25, y: 19, area: 'home',
        coins: { florin: 10, shard: 0 },
        darkBoxes: 0, streak: 0, lastActiveDate: null,
        energy: 40, maxEnergy: 40,
        gatherTools: [], activeGatherTool: null,
        equipped: [null, null], activeSlot: 0, equipMigrated: true,
        saplings: 0, pity: 0, charms: [null, null], ownedCharms: [],
      },
      materials: {}, tools: [], buildings: [], pendingBuildings: [],
      tasks: [], sessions: [], log: [], harvested: {}, blueprints: [],
      relics: [], plantings: {}, gadgets: {}, cooldowns: {}, blocks: {},
      placedBlocks: {}, refundBank: { materials: {}, coins: {} }, effects: {},
      questItems: {}, vendorsUnlocked: [], questsDone: [],
      lifetime: {
        tasksCompleted: 0, studyMinutes: 0, sessions: 0,
        treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
      },
    },
    'Slot 1/meta.json': {
      slot: 1, name: 'Tinker', createdAt: NOW, lastPlayedAt: NOW,
      playtimeMs: 1000, level: 3, tasksDone: 0, tasksTotal: 0, savedAt: NOW,
    },
  },

  steps: [
    { type: 'navigate', url: '/', label: 'load the game' },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the boot overlay clears',
      expr: "const b = document.getElementById('boot'); return !b || b.classList.contains('hidden');",
    },
    {
      type: 'waitFor', timeoutMs: 10000, label: 'the launch menu is up',
      expr: "const r = document.querySelector('.sq-launch-root'); return !!r && !r.hidden;",
    },
    {
      type: 'eval', label: 'open SETTINGS',
      expr: `
        const b = [...document.querySelectorAll('.sq-launch-root button')]
          .find((x) => /^settings$/i.test((x.textContent || '').trim()));
        if (!b) throw new Error('no SETTINGS button on the title screen');
        b.click();
        return 'opened';
      `,
    },
    { type: 'wait', ms: 500 },
    {
      type: 'eval', label: 'turn the Event log off',
      expr: `
        const rows = [...document.querySelectorAll('.sq-launch-opt')];
        const row = rows.find((r) => /event log/i.test(r.textContent || ''));
        if (!row) throw new Error('no Event log row in the settings sheet');
        const t = row.querySelector('button');
        const before = (t.textContent || '').trim();
        t.click();
        return before + ' -> ' + (row.querySelector('button').textContent || '').trim();
      `,
    },
    {
      type: 'eval', label: 'and drag the music down to 12%',
      expr: `
        const s = document.querySelector('.sq-launch-volslider');
        if (!s) throw new Error('no volume slider');
        s.value = '12';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return s.value;
      `,
    },
    // The slider debounces its write, so give it room to land.
    { type: 'wait', ms: 1200 },
    {
      // THE REAL ASSERTION: the server has them, which means they are on disk
      // and independent of this origin.
      type: 'assert', label: 'the server has the event log switched off',
      expr: `
        return fetch('/api/settings').then((r) => r.json()).then((j) => j.settings.eventLog);
      `,
      equals: false,
    },
    {
      type: 'assert', label: 'and the music volume it was given',
      expr: `
        return fetch('/api/settings').then((r) => r.json()).then((j) => j.settings.musicVolume);
      `,
      equals: 12,
    },
    {
      // settings.json sits BESIDE the slots, not inside one: they are the
      // installation's preferences and must not travel with a save.
      type: 'file', path: 'settings.json',
      json: { eventLog: false, musicVolume: 12 },
      label: 'and it is a file in the data dir, beside the slots',
    },
    {
      // A NEW ORIGIN. This is the actual failure the user hit: next launch, new
      // port, empty localStorage. Simulated by clearing the cache and asking
      // the page to hydrate again, which is what boot does.
      type: 'eval', label: 'wipe the local cache, as a new port would',
      expr: "window.localStorage.removeItem('sq.settings.v3'); return 'cleared';",
    },
    {
      type: 'assert', label: 'and the settings come back from disk',
      expr: `
        return import('/web/ui/launch.js').then((m) => m.hydrateSettings())
          .then((s) => s.eventLog === false && s.musicVolume === 12);
      `,
      equals: true,
    },
  ],
};
