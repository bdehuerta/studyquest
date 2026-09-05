// tools/checks/03-migration.mjs — three save generations survive a boot.
//
// The user has real progress on disk. v3 adds state keys and touches migration,
// so "the app still starts" is not the bar — the bar is that a save written by
// an older build comes back with its data intact. This suite plants one save of
// each generation in a scratch data dir and asserts, field by field, that the
// values the player earned are still there after the server has migrated them.
//
//   v1  data/state.json          flat, single save, none of the v2/v3 keys
//   v2  data/slot-2.json         flat per-slot file
//   v3  data/Slot 3/state.json   folder-per-slot, the current layout
//
// The values below are deliberately odd numbers: if migration ever resets a
// field to a default, the assertion says so instead of silently matching.

const V1_MARKER = 'V1 Scholar';
const V2_MARKER = 'V2 Scholar';
const V3_MARKER = 'V3 Scholar';

/** A save as v1 wrote it: no energy, no gatherTools, no blueprints, no harvested,
 *  no shops, no relics, no meta. Everything migrateState() has to fill in. */
function v1Save() {
  return {
    player: {
      name: V1_MARKER,
      level: 7,
      xp: 640,
      xpToNext: 900,
      x: 31,
      y: 12,
      coins: { focus: 4242, insight: 1337, grind: 99, spark: 7 },
      darkBoxes: 5,
      streak: 11,
      lastActiveDate: '2026-01-04',
    },
    materials: { ironwood: 41, chalkstone: 23, inkglass: 8 },
    tools: [{ uid: 'v1-tool', toolId: 'focus_lamp' }],
    buildings: [{ uid: 'v1-hut', buildingId: 'study_hut', x: 22, y: 17 }],
    pendingBuildings: [],
    tasks: [
      { id: 'v1-a', title: 'Old task that must survive', subject: 'math', workType: 'practice',
        difficulty: 3, estMinutes: 90, status: 'done', minutesLogged: 95, rank: 'A',
        dueInDays: 0, completedAt: 1735689600000 },
      { id: 'v1-b', title: 'Second old task', subject: 'history', workType: 'reading',
        difficulty: 2, estMinutes: 45, status: 'todo', minutesLogged: 10, rank: null,
        dueInDays: 3, completedAt: null },
    ],
    sessions: [{ id: 'v1-s1', minutes: 95, subject: 'math', at: 1735689600000 }],
    log: [{ ts: 1735689600000, text: 'a v1 log line', kind: 'info' }],
  };
}

/** A save as v2 wrote it: has the v2 keys, lives in a flat slot-N.json. */
function v2Save(slot) {
  return {
    player: {
      name: V2_MARKER,
      level: 12,
      xp: 120,
      xpToNext: 1400,
      x: 44,
      y: 30,
      coins: { focus: 808, insight: 606, grind: 404, spark: 202 },
      darkBoxes: 2,
      streak: 3,
      lastActiveDate: '2026-02-14',
      energy: 63,
      maxEnergy: 120,
      gatherTools: [
        { uid: 'v2-axe', toolId: 'axe', durability: 37, maxDurability: 60 },
        { uid: 'v2-pick', toolId: 'pickaxe', durability: 12, maxDurability: 50 },
      ],
      activeGatherTool: 'v2-axe',
    },
    materials: { ironwood: 77, chalkstone: 55, inkglass: 33, copperwire: 11 },
    tools: [],
    buildings: [
      { uid: 'v2-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'v2-forge', buildingId: 'forge', x: 30, y: 25 },
    ],
    pendingBuildings: [],
    tasks: [
      { id: 'v2-a', title: 'A v2 task', subject: 'cs', workType: 'project', difficulty: 4,
        estMinutes: 180, status: 'todo', minutesLogged: 45, rank: null, dueInDays: 5, completedAt: null },
    ],
    sessions: [],
    log: [{ ts: 1739491200000, text: 'a v2 log line', kind: 'info' }],
    harvested: { '10,10': { nodeType: 'tree', hitsLeft: 1, respawnAt: 0 } },
    blueprints: ['craft_axe', 'craft_pickaxe', 'craft_focus_lamp', 'build_study_hut', 'build_forge'],
    shops: { refreshedOn: '2026-02-14', stock: { merchant: [], broker: [], archivist: [] }, brokerBoxesSoldToday: 2 },
    relics: [{ id: 'v2-relic', name: 'Cracked Lens', desc: 'a v2 relic', passive: 'insight+1' }],
    meta: { slot, name: 'The v2 Save', createdAt: 1739491200000, lastPlayedAt: 1739491200000, playtimeMs: 5400000 },
  };
}

/** A save in the current folder layout. Must be left exactly where it is. */
function v3Save(slot) {
  const s = v2Save(slot);
  s.player.name = V3_MARKER;
  s.player.level = 9;
  s.player.coins = { focus: 1111, insight: 2222, grind: 3333, spark: 4444 };
  s.materials = { ironwood: 5, chalkstone: 6, inkglass: 7, copperwire: 8 };
  s.meta = { slot, name: 'The v3 Save', createdAt: 1750000000000, lastPlayedAt: 1750000000000, playtimeMs: 9900000 };
  return s;
}

function v3Meta(slot) {
  return {
    slot, name: 'The v3 Save', createdAt: 1750000000000, lastPlayedAt: 1750000000000,
    playtimeMs: 9900000, level: 9, tasksDone: 0, tasksTotal: 1, savedAt: 1750000000000,
  };
}

export default {
  name: 'Save migration — v1, v2 and v3 saves all survive a boot',
  order: 30,
  browser: false,

  seed: {
    'state.json': v1Save(),          // v1: flat, no slots at all  -> Slot 1
    'slot-2.json': v2Save(2),        // v2: flat per-slot file     -> Slot 2
    'Slot 3/state.json': v3Save(3),  // v3: already correct        -> untouched
    'Slot 3/meta.json': v3Meta(3),
  },

  steps: [
    { type: 'note', text: 'The server has already booted, which is when migration runs. Everything below inspects the result.' },

    // ---- the layout is now uniformly v3 -----------------------------------
    { type: 'file', path: 'Slot 1/state.json', label: 'v1 save landed in Slot 1' },
    { type: 'file', path: 'Slot 2/state.json', label: 'v2 save landed in Slot 2' },
    { type: 'file', path: 'Slot 3/state.json', label: 'v3 save is still in Slot 3' },
    { type: 'file', path: 'Slot 1/meta.json',  label: 'Slot 1 got a meta.json' },
    { type: 'file', path: 'Slot 2/meta.json',  label: 'Slot 2 got a meta.json' },

    // ---- nothing was destroyed on the way ---------------------------------
    { type: 'file', path: 'state.json', exists: false, label: 'the v1 flat file was moved aside, not left in place' },
    { type: 'file', path: 'state.json.migrated', label: 'the v1 flat file was PRESERVED as state.json.migrated' },
    { type: 'file', path: 'slot-2.json', exists: false, label: 'the v2 flat file was consumed' },

    // ---- v1 data is intact -------------------------------------------------
    { type: 'file', path: 'Slot 1/state.json', label: 'v1 player survived', json: {
      'player.name': 'V1 Scholar',
      'player.level': 7,
      'player.xp': 640,
      // The four old currencies are SUMMED into florins, not dropped:
      // 4242 + 1337 + 99 + 7. A migration that confiscated the wallet would
      // pass a "no crash" test and rob every existing save.
      'player.coins.florin': 5685,
      'player.darkBoxes': 5,
      'player.streak': 11,
      'player.x': 31,
      'player.y': 12,
      'materials.ironwood': 41,
      'materials.chalkstone': 23,
      'materials.inkglass': 8,
      'tasks.0.title': 'Old task that must survive',
      'tasks.0.status': 'done',
      'tasks.0.minutesLogged': 95,
      'tasks.1.title': 'Second old task',
      'sessions.0.minutes': 95,
      'buildings.0.buildingId': 'study_hut',
      'meta.slot': 1,
    } },
    { type: 'file', path: 'Slot 1/state.json', label: 'v1 save picked up the v2/v3 keys it lacked', json: {
      'shops.brokerBoxesSoldToday': 0,
    } },

    // ---- v2 data is intact -------------------------------------------------
    { type: 'file', path: 'Slot 2/state.json', label: 'v2 player survived', json: {
      'player.name': 'V2 Scholar',
      'player.level': 12,
      'player.maxEnergy': 120,
      'player.energy': 63,
      'player.activeGatherTool': 'v2-axe',
      'player.gatherTools.0.toolId': 'axe',
      'player.gatherTools.0.durability': 37,
      'player.gatherTools.1.durability': 12,
      'materials.ironwood': 77,
      'materials.copperwire': 11,
      // v3.1 deliberately clears pre-permanence tree records: they carried a v2
      // respawnAt and would redraw a felled tree half-rendered. The forest is
      // restored whole instead, so this record must be GONE, not preserved.
      'harvested.10,10': undefined,
      'meta.treeResetV31': true,
      'relics.0.name': 'Cracked Lens',
      'shops.brokerBoxesSoldToday': 2,
      'buildings.1.buildingId': 'forge',
      'meta.name': 'The v2 Save',
      'meta.slot': 2,
      'meta.playtimeMs': 5400000,
    } },

    // ---- v3 data is intact -------------------------------------------------
    { type: 'file', path: 'Slot 3/state.json', label: 'v3 player survived untouched', json: {
      'player.name': 'V3 Scholar',
      'player.level': 9,
      // STILL the old four-currency shape, and that is correct: a slot nobody
      // has opened is not migrated. The collapse happens when the save is
      // loaded, which the "switch to the v3 save" step below then proves.
      'player.coins.focus': 1111,
      'player.coins.spark': 4444,
      'materials.ironwood': 5,
      'meta.name': 'The v3 Save',
      'meta.slot': 3,
      'meta.playtimeMs': 9900000,
    } },

    // ---- v5: the vendors that did not exist when this save was written ------
    //
    // A save from before v5 has no Exchange, no Woodsman and no Stonemason.
    // That is not "their art is missing" — those vendors are ABSENT FROM THE
    // WORLD, so there is nobody to trade shards with and nowhere to sell
    // timber or stone, which are the only ways to earn florins. Bruno hit this
    // as "where is the npc?".
    //
    // They are raised at FIXED homes, not next to the player: the Exchange
    // belongs in the plaza and the outlanders in the places the world generator
    // carves for them. A mountain dropped beside the player would land in the
    // town square.
    // The v1 save carried a Study Hut and nothing else, so the backfill appends
    // the five it is missing in BOOTSTRAP_ROLES order. Asserted by INDEX, not by
    // "some building exists" — /api/shops answers for every vendor whether or
    // not they have been placed, so vendor data proves nothing about the world.
    {
      type: 'api', route: '/api/state', label: 'the v1 save gained the Trading Post',
      path: 'state.buildings.1.buildingId', equals: 'trading_post',
    },
    {
      type: 'api', route: '/api/state', label: 'and the Archive',
      path: 'state.buildings.2.buildingId', equals: 'archive',
    },
    {
      type: 'api', route: '/api/state', label: 'and the Exchange, in the plaza',
      path: 'state.buildings.3.buildingId', equals: 'exchange_post',
    },
    {
      type: 'api', route: '/api/state', label: 'and the Woodsman, out in the grove',
      path: 'state.buildings.4.buildingId', equals: 'woodsman_camp',
    },
    {
      type: 'api', route: '/api/state', label: 'and the Stonemason, under the mountain',
      path: 'state.buildings.5.buildingId', equals: 'stonemason_camp',
    },
    {
      type: 'api', route: '/api/state', label: 'the mountain was NOT dropped in the town square',
      path: 'state.buildings.5.x', equals: 52,
    },

    // ---- the running server agrees ----------------------------------------
    { type: 'api', route: '/api/slots', expectOk: true, label: '/api/slots lists slot 1',
      path: 'slots.0.exists', equals: true },
    { type: 'api', route: '/api/slots', label: 'slot 2 kept its name',
      path: 'slots.1.name', equals: 'The v2 Save' },
    { type: 'api', route: '/api/slots', label: 'slot 3 kept its name',
      path: 'slots.2.name', equals: 'The v3 Save' },
    { type: 'api', route: '/api/slots', label: 'slot 4 is (correctly) empty',
      path: 'slots.3.exists', equals: false },
    { type: 'api', route: '/api/state', expectOk: true, label: 'the active save is the migrated v1 one',
      path: 'state.player.name', equals: 'V1 Scholar' },

    // ---- and switching between them still works ---------------------------
    { type: 'api', route: '/api/slots/switch', body: { slot: 2 }, expectOk: true,
      label: 'switch to the v2 save', path: 'state.player.name', equals: 'V2 Scholar' },
    { type: 'api', route: '/api/slots/switch', body: { slot: 3 }, expectOk: true,
      label: 'switch to the v3 save', path: 'state.player.coins.florin', equals: 11110 },
    { type: 'api', route: '/api/slots/switch', body: { slot: 1 }, expectOk: true,
      label: 'switch back to the v1 save', path: 'state.player.coins.florin', equals: 5685 },

    { type: 'note', text: 'Re-running migration must be a no-op: the second boot is covered by 04-migration-idempotent.' },
  ],
};
