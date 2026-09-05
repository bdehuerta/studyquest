// tools/checks/17-herald.mjs — the Herald: the ride in, and the quest east.
//
// WHY THIS SUITE EXISTS
//
// He is a scripted arrival, which is a shape this codebase has not had before:
// something that happens ONCE, on a wall clock, triggered by a level, and then
// stands there forever. Almost every part of that can look finished and do
// nothing — the summon can never fire, the ride can be drawn but never end, the
// dialogue can be written and never reachable, the objective can be returned by
// the server and never rendered.
//
// The save is seeded at LEVEL 20 but with `herald: null`, so the summon has to
// happen here, on a state read, exactly as it would for a player who has just
// levelled.
//
// `rideMs` is 16s of wall clock, which is too long to wait for in a suite — so
// the arrival is tested by winding `summonedAt` back into the past through the
// server's own move route. That is honest: it is the same state the player
// reaches by waiting, not a different code path.

const NOW = Date.now();

function save(heraldSummonedAt) {
  return {
    player: {
      name: 'Champion', level: 20, xp: 0, xpToNext: 1230,
      // Two tiles below where he stops — inside his reach, but not standing on
      // top of him. He stops at SPAWN (25,19), the middle of the four plaza
      // buildings, which is also where a new save begins.
      x: 25, y: 21,
      coins: { florin: 25, shard: 0 },
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
    // NOT summoned. The point is that reaching level 20 summons him.
    herald: heraldSummonedAt ? { summonedAt: heraldSummonedAt, spoken: false } : undefined,
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
  };
}

function fire(name, js) {
  return `window.${name} = 'pending'; ${js}
    .then((j) => { window.${name} = j; }, (e) => { window.${name} = { ok: false, error: e.message }; });
    return 'sent';`;
}
function answered(name, label) {
  return { type: 'waitFor', timeoutMs: 8000, label, expr: `return window.${name} !== 'pending';` };
}

const BOX = ".sq-dlg-root:not([hidden]) .sq-dlg-box";
const BOX_OPEN = `return !!document.querySelector(${JSON.stringify(BOX)});`;

/** Page through the whole conversation, collecting every panel. */
const READ_ALL = `
  const dlg = window.__sqDialogue && window.__sqDialogue();
  if (!dlg || !dlg.isOpen()) { window.__sqSaid = ''; return 'no box'; }
  const seen = [];
  for (let i = 0; i < 60 && dlg.isOpen(); i += 1) {
    const line = dlg.currentText();
    if (line && seen[seen.length - 1] !== line) seen.push(line);
    dlg.advance();
    if (dlg.isOpen()) dlg.advance();
  }
  window.__sqSaid = seen.join(' | ');
  return window.__sqSaid;
`;
function saidHas(text) {
  return "return String(window.__sqSaid || '').toLowerCase().indexOf("
    + JSON.stringify(String(text).toLowerCase()) + ") !== -1;";
}

export default {
  name: 'the Herald — he rides in at level 20 and points east',
  order: 18,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(null),
    'Slot 1/meta.json': {
      slot: 1, name: 'Champion', createdAt: NOW, lastPlayedAt: NOW,
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
    { type: 'wait', ms: 1400, label: 'let the camera settle' },

    // ------------------------------------ 1. LEVEL 20 SUMMONS HIM, ON ITS OWN
    {
      // The save was seeded WITHOUT a herald. Reaching level 20 is the trigger,
      // and it is checked lazily on a state read — so a save that was already
      // past 20 before he existed summons him too.
      type: 'assert', label: 'reaching level 20 sent the rider',
      expr: "const h = window.__sqState().herald; return !!(h && h.summonedAt);",
      equals: true,
    },
    {
      type: 'assert', label: 'and he has NOT been spoken to yet',
      expr: "return window.__sqState().herald.spoken;", equals: false,
    },

    // ------------------------------------------- 2. HE IS RIDING, FROM THE LEFT
    {
      type: 'assert', label: 'he starts off the western edge of the map',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const h = window.__sqWorld.getHerald();
          if (!h) return 'no herald';
          return h.arrived === false && h.tileX < C.WORLD_W / 3;
        });
      `,
      equals: true,
    },
    {
      // THE WHOLE ROUTE MUST BE CLEAR — not just of water. Bruno, 2026-08-31:
      // "it currently goes across a couple of trees and in the road." He rode
      // to x=32 before, which took him through trees and left him standing on
      // the dirt path. Row 22 is the only left-edge row that reaches the plaza
      // with no trees, no water and no stone at all, and the column up to the
      // stop is clear too. Both legs are checked, so a terrain retune that
      // grows a tree across his path fails here rather than on screen.
      type: 'assert', label: 'his whole route is open ground — no trees, no water, no stone',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const solid = new Set(C.SOLID_TILES);
          const at = (x, y) => w.tiles[y * C.WORLD_W + x];
          // From x=1, not 0. The Home Block's border is SEALED now — every edge
          // tile is tree or rock, with one gap for the road east — so column 0
          // is a wall by design. He rides out THROUGH the treeline, which is
          // what his arrival log already says; the ride begins off-map at
          // HERALD.fromX and the first tile that has to be clear is the first
          // one inside the wall.
          for (let x = 1; x <= C.HERALD.stopX; x += 1) {
            if (solid.has(at(x, C.HERALD.rowY))) return 'blocked at ' + x + ',' + C.HERALD.rowY;
          }
          const lo = Math.min(C.HERALD.rowY, C.HERALD.stopY);
          const hi = Math.max(C.HERALD.rowY, C.HERALD.stopY);
          for (let y = lo; y <= hi; y += 1) {
            if (solid.has(at(C.HERALD.stopX, y))) return 'blocked at ' + C.HERALD.stopX + ',' + y;
          }
          return true;
        });
      `,
      equals: true,
    },
    {
      // AND HE STOPS BETWEEN THE FOUR BUILDINGS, not on the road in the middle
      // of the map. That tile is SPAWN — the open ground the plaza boxes in.
      type: 'assert', label: 'he is heading for the middle of the four buildings',
      expr: `
        return import('/shared/constants.js').then((C) => {
          return C.HERALD.stopX === C.SPAWN.x && C.HERALD.stopY === C.SPAWN.y;
        });
      `,
      equals: true,
    },
    {
      // The legs have to actually move. Sampled twice a step apart: one frame
      // is a still image, two is a walk.
      type: 'eval', label: 'watch his legs for a moment',
      expr: `
        return import('/shared/constants.js').then((C) => new Promise((res) => {
          const seen = {};
          const t = setInterval(() => {
            const h = window.__sqWorld.getHerald();
            if (h) seen[h.frame] = true;
          }, Math.max(30, Math.round(C.HERALD.stepMs / 3)));
          setTimeout(() => { clearInterval(t); window.__sqLegs = Object.keys(seen); res(window.__sqLegs.join(',')); }, 900);
        }));
      `,
    },
    {
      type: 'assert', label: 'and they are moving — both walk frames were drawn',
      expr: "return (window.__sqLegs || []).length >= 2;", equals: true,
    },
    {
      type: 'eval', label: 'note where he is',
      expr: "window.__sqRideFrom = window.__sqWorld.getHerald().tileX; return String(window.__sqRideFrom);",
    },
    { type: 'wait', ms: 2200, label: 'let him ride a while' },
    {
      type: 'assert', label: 'and he is actually moving east',
      expr: "return window.__sqWorld.getHerald().tileX > window.__sqRideFrom;", equals: true,
    },
    { type: 'screenshot', file: 'v5-herald-riding.png' },
    {
      // Riding is not arriving: he must not be talkable mid-gallop.
      type: 'eval', label: 'try to speak to him mid-ride',
      expr: fire('__sqEarly', "window.__sqApi.talk('herald')"),
    },
    answered('__sqEarly', 'he answered from the saddle'),
    {
      type: 'assert', label: 'he will not stop to talk while riding',
      expr: "return window.__sqEarly.ok === false && /riding/i.test(window.__sqEarly.error || '');",
      equals: true,
    },

    // ------------------------------------------------ 3. HE ARRIVES, AND STAYS
    {
      // Wind the clock back rather than wait 16 real seconds. Same state the
      // player reaches by waiting, reached through the server's own save.
      type: 'eval', label: 'wind his arrival into the past',
      // Wound on the SERVER, then pulled back through the app's own api client:
      // a raw fetch moves the server and leaves this module's copy of state
      // behind, and the ride is drawn from the CLIENT's copy of summonedAt.
      expr: fire('__sqWind', `fetch('/api/dev/herald-arrive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }).then((r) => r.json())
        // Any state-returning POST through the app client will do; this is the
        // cheapest. NOTE no backticks in this comment: it lives inside a
        // template literal, and that has broken a file four times today.
        .then(() => window.__sqApi.setActiveSlot(1))`),
    },
    answered('__sqWind', 'the clock was wound'),
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'he has dismounted in the middle of the map',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const h = window.__sqWorld.getHerald();
          return h.arrived === true && h.tileX === C.HERALD.stopX && h.tileY === C.HERALD.stopY;
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and his legs are still now that he has stopped',
      expr: "return window.__sqWorld.getHerald().frame;", equals: 0,
    },
    {
      type: 'assert', label: 'and the world offers to speak to him',
      expr: "return window.__sqWorld.getPrompts().join(' | ').toLowerCase().indexOf('rider') !== -1;",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-herald-arrived.png' },

    // ------------------------------------------------------ 4. WHAT HE SAYS
    {
      type: 'eval', label: 'press E to speak to him',
      // The api reply is captured alongside the keypress so the xp it paid can
      // be asserted; the world's own call is what actually raises the box.
      expr: "window.__sqSpoke = null; window.__sqApi.talk('herald').then((j) => { window.__sqSpoke = j; }); window.__sqWorld.onInteract('__herald'); return 'talked';",
    },
    { type: 'waitFor', timeoutMs: 8000, label: 'he speaks', expr: BOX_OPEN },
    {
      type: 'assert', label: 'the box names him',
      expr: "const w = document.querySelector('.sq-dlg-who'); return !!w && /merchant/i.test(w.textContent);",
      equals: true,
    },
    { type: 'eval', label: 'read the whole thing', expr: READ_ALL },
    {
      type: 'assert', label: 'he names the Kingdom of Gotham',
      expr: saidHas('Kingdom of Gotham'), equals: true,
    },
    {
      type: 'assert', label: 'and Ranon, the false heir who killed his father',
      expr: "const s = String(window.__sqSaid || '').toLowerCase(); return s.indexOf('ranon') !== -1 && s.indexOf('false heir') !== -1 && s.indexOf('killed his own father') !== -1;",
      equals: true,
    },
    {
      type: 'assert', label: 'the tribes of the farlands are what you must levy',
      expr: saidHas('tribes of the farlands'), equals: true,
    },
    {
      type: 'assert', label: 'and he sends you east, to the Wise Man of the mountain',
      expr: "const s = String(window.__sqSaid || '').toLowerCase(); return s.indexOf('journey eastward') !== -1 && s.indexOf('wise man of the mountain') !== -1 && s.indexOf('snowy peaks') !== -1;",
      equals: true,
    },
    {
      type: 'assert', label: 'the last panel is the OBJECTIVE',
      expr: saidHas('convince him to tell you his deepest secret'), equals: true,
    },
    {
      type: 'assert', label: 'and it was recorded on the server',
      expr: "return window.__sqState().herald.spoken;", equals: true,
    },
    {
      // HEARING HIM PAYS NOTHING. Bruno: "he pays 400 xp when you find the wise
      // man you are going to be looking for next." Being told about a journey
      // is not making it, and paying up front spends the quest before it starts.
      // The 400 is reserved as `wise_man_found` for when that region exists.
      type: 'assert', label: 'hearing the quest pays no xp — the reward is at the other end',
      expr: "return window.__sqSpoke && window.__sqSpoke.xp;", equals: 0,
    },
    {
      type: 'assert', label: 'but the telling is recorded as a quest beat',
      expr: "return (window.__sqState().questsDone || []).indexOf('herald_heard') !== -1;",
      equals: true,
    },
  ],
};
