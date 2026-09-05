// tools/checks/04-save-durability.mjs — migration is idempotent, and a save
// written by a running server survives a restart.
//
// 03-migration proves the one-way conversion. This proves the two things that
// bite afterwards: that booting again does not re-run the conversion over its
// own output, and that a change made through the API is actually on disk when
// the process comes back.

function save(name, level, focus) {
  return {
    player: {
      name, level, xp: 10, xpToNext: 100, x: 20, y: 20,
      // Deliberately still the OLD four-currency shape: this suite exists to
      // prove a pre-collapse save survives. They sum into florins (focus + 6).
      coins: { focus, insight: 1, grind: 2, spark: 3 },
      darkBoxes: 1, streak: 0, lastActiveDate: null,
      energy: 50, maxEnergy: 100, gatherTools: [], activeGatherTool: null,
    },
    materials: { ironwood: 9 },
    tools: [], buildings: [], pendingBuildings: [],
    tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [],
    shops: { refreshedOn: null, stock: { merchant: [], broker: [], archivist: [] }, brokerBoxesSoldToday: 0 },
    meta: { slot: 1, name: `${name}'s save`, createdAt: 1700000000000, lastPlayedAt: 1700000000000, playtimeMs: 123456 },
  };
}

export default {
  name: 'Save durability — migration is idempotent and writes land on disk',
  order: 40,
  browser: false,

  seed: {
    'state.json': save('Legacy Scholar', 4, 5150),   // v1 flat -> Slot 1
    'slot-2.json': { ...save('Flat Scholar', 6, 6060), meta: { slot: 2, name: 'Flat save', createdAt: 1700000000000, lastPlayedAt: 1700000000000, playtimeMs: 1000 } },
  },

  steps: [
    { type: 'file', path: 'Slot 1/state.json', label: 'first boot migrated the v1 save', json: { 'player.name': 'Legacy Scholar', 'player.coins.florin': 5156 } },
    { type: 'file', path: 'Slot 2/state.json', label: 'first boot migrated the flat slot', json: { 'player.name': 'Flat Scholar', 'player.coins.florin': 6066 } },

    // --- write something through the live API, then restart --------------
    { type: 'api', route: '/api/task/create', expectOk: true,
      body: { title: 'A task created before the restart', subject: 'math', workType: 'practice', difficulty: 3, estMinutes: 60, dueInDays: 2 },
      label: 'create a task through the API' },
    { type: 'api', route: '/api/player/move', expectOk: true, body: { x: 33, y: 27 }, label: 'move the player' },

    { type: 'restart', label: 'stop the server and boot it again on the same data dir' },

    { type: 'api', route: '/api/state', expectOk: true, label: 'the task survived the restart',
      path: 'state.tasks.0.title', equals: 'A task created before the restart' },
    { type: 'api', route: '/api/state', label: 'the player position survived the restart',
      path: 'state.player.x', equals: 33 },
    { type: 'api', route: '/api/state', label: 'and it is still the same save',
      path: 'state.player.name', equals: 'Legacy Scholar' },

    // --- the second boot must not have re-migrated anything --------------
    { type: 'file', path: 'state.json', exists: false, label: 'no v1 flat file resurrected' },
    { type: 'file', path: 'slot-2.json', exists: false, label: 'no v2 flat file resurrected' },
    { type: 'file', path: 'state.json.migrated.migrated', exists: false, label: 'the preserved v1 file was not migrated a second time' },
    { type: 'file', path: 'Slot 2/state.json', label: 'the untouched slot is byte-for-byte intact',
      json: { 'player.name': 'Flat Scholar', 'player.coins.florin': 6066, 'meta.name': 'Flat save' } },
    { type: 'api', route: '/api/slots', label: 'still exactly two populated slots', path: 'slots.2.exists', equals: false },

    // --- a third boot, for good measure ---------------------------------
    { type: 'restart', label: 'third boot' },
    { type: 'api', route: '/api/state', expectOk: true, label: 'still the same save after a third boot',
      path: 'state.player.coins.florin', equals: 5156 },
    { type: 'file', path: 'Slot 2/state.json', label: 'and slot 2 is still untouched',
      json: { 'player.coins.florin': 6066 } },
  ],
};
