// tools/checks/19-reaches.mjs — the sealed border, the crossing, and the peak.
//
// WHY THIS SUITE EXISTS
//
// The Home Block now has exactly ONE way out and the second map has exactly one
// way back. That is a claim about 224 border tiles, which is not something to
// check by walking around and looking — so this counts them.
//
// It also pins the two gates that make the crossing mean anything: you cannot
// go east before the Herald has told you to, and you cannot cross from
// anywhere but the road.

const NOW = Date.now();

function save(over) {
  return {
    player: {
      name: 'Wayfarer', level: 20, xp: 0, xpToNext: 1230,
      x: 25, y: 19, area: 'home',
      coins: { florin: 200, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 148, maxEnergy: 148,
      gatherTools: [], activeGatherTool: null,
      equipped: [null, null], activeSlot: 0, equipMigrated: true,
      saplings: 0, pity: 0, charms: [null, null], ownedCharms: [],
    },
    materials: {}, tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
    ],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    questItems: {}, vendorsUnlocked: [], questsDone: [],
    hut: { opened: false, spoken: false },
    boat: { granted: false, lastCastAt: 0, riding: false },
    areaPos: {}, wiseMan: { found: false, spoken: false },
    // He has ARRIVED but has NOT been spoken to — the gate under test.
    herald: { summonedAt: 1, spoken: false },
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
    ...(over || {}),
  };
}

export default {
  name: 'the Reaches — a sealed border, one road east, and the Wise Man',
  order: 20,
  browser: false,

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Wayfarer', createdAt: NOW, lastPlayedAt: NOW,
      playtimeMs: 1000, level: 20, tasksDone: 0, tasksTotal: 0, savedAt: NOW,
    },
  },

  steps: [
    { type: 'note', text: 'THE GATE IS THE HERALD. You may not wander east before you have been told to go east — without that, his whole errand is decoration.' },
    {
      type: 'api', route: '/api/travel', body: { px: 63, py: 10 },
      label: 'the road east is refused before he has spoken', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'herald', px: 25, py: 19 }, expectOk: true,
      label: 'hear him out', path: 'dialogue.stage', equals: 'opening',
    },
    {
      type: 'api', route: '/api/travel', body: { px: 20, py: 20 },
      label: 'but you still cannot cross from the middle of a field', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/travel', body: { px: 63, py: 30 },
      label: 'nor from the wrong row of the eastern edge', path: 'ok', equals: false,
    },

    { type: 'note', text: 'On the road, at the edge: over you go.' },
    {
      type: 'api', route: '/api/travel', body: { px: 63, py: 10 }, expectOk: true,
      label: 'the crossing works from the road', path: 'area', equals: 'peaks',
    },
    {
      type: 'api', route: '/api/state', label: 'and the save says which map you are on',
      path: 'state.player.area', equals: 'peaks',
    },
    {
      type: 'api', route: '/api/state', label: 'you land just inside the western edge',
      path: 'state.player.x', equals: 2,
    },
    {
      // Coming back should be coming BACK, not a fixed respawn.
      type: 'api', route: '/api/state', label: 'and where you left the Home Block is remembered',
      path: 'state.areaPos.home.x', equals: 63,
    },

    { type: 'note', text: 'THE WISE MAN is the end of the Herald’s errand, and where the 400 xp finally lands.' },
    {
      // HE IS BEHIND THE WARDEN NOW. The cave at the summit is the last room of
      // the mountain, and reaching its mouth is not the same as getting in.
      type: 'api', route: '/api/npc/talk', body: { vendor: 'wiseman', px: 58, py: 3 },
      label: 'the Warden stands between you and the cave', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/dev/grant', body: { wardenBeaten: true }, expectOk: true,
      label: 'break the Warden (dev)',
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'wiseman', px: 10, py: 10 },
      label: 'he is not shouted to from the foot of the mountain', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'wiseman', px: 58, py: 3 }, expectOk: true,
      label: 'but at the summit he speaks', path: 'dialogue.stage', equals: 'opening',
    },
    {
      type: 'api', route: '/api/npc/talk', body: { vendor: 'wiseman', px: 58, py: 3 },
      label: 'and the second telling is shorter', path: 'dialogue.stage', equals: 'open',
    },
    {
      type: 'api', route: '/api/state', label: 'finding him is recorded',
      path: 'state.wiseMan.found', equals: true,
    },
    {
      type: 'api', route: '/api/state', label: 'and the quest the Herald opened is closed',
      path: 'state.questsDone.1', equals: 'wise_man_found',
    },

    { type: 'note', text: 'And the way home is the same road, in reverse.' },
    {
      type: 'api', route: '/api/travel', body: { px: 1, py: 42 }, expectOk: true,
      label: 'crossing back, from the pass at the foot', path: 'area', equals: 'home',
    },
    {
      type: 'api', route: '/api/state', label: 'and you are in the Home Block again',
      path: 'state.player.area', equals: 'home',
    },
  ],
};
