// tools/checks/15-outlanders.mjs — the two outlander doors, and the Blue Bloom.
//
// WHY THIS SUITE EXISTS
//
// Two vendors that start CLOSED, and two completely different keys:
//   - the Stonemason wants LEVEL 10 and says so;
//   - the Woodsman wants the BLUE KEY, cut from the one Blue Bloom on the map.
//
// Every part of that is easy to build in a way that looks finished and does
// nothing. The lock can live only in the UI (so the API still sells); the
// dialogue can be written and never rendered; the key can drop and never be
// spent; the bloom can exist in the constants and never be carved into the map.
// This suite therefore asserts, in order: the tile is really there, the sell
// ROUTE refuses, the dialogue is on SCREEN, felling the bloom puts a key in the
// Bag, talking spends it, and only then do the sell rows appear.
//
// It also pins the thing that had been silently broken for a whole session:
// `normShops` built a fresh object that dropped `woodsman` and `stonemason`, so
// their sell rows never rendered at all. 13-economy missed it by asserting
// prices off the API response instead of off the screen. The last assertions
// here read the DOM.

const NOW = Date.now();

// The Blue Bloom's fixed home, from shared/constants.js BLOOM.
const BLOOM_X = 6;
const BLOOM_Y = 5;

/** Standing one tile below the bloom, facing up at it. */
function save(overrides) {
  return {
    player: {
      name: 'Forager', level: 4, xp: 0, xpToNext: 500,
      x: BLOOM_X, y: BLOOM_Y + 1,
      coins: { florin: 100, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 110, maxEnergy: 110,
      gatherTools: [{ uid: 'axe-1', toolId: 'axe', durability: 60, maxDurability: 60 }],
      activeGatherTool: 'axe-1',
      // Axe IN HAND and SELECTED — only the selected slot acts.
      equipped: [{ kind: 'tool', itemId: 'axe', uid: 'axe-1' }, null],
      activeSlot: 0, equipMigrated: true, saplings: 0, pity: 0,
      ...(overrides && overrides.player) || {},
    },
    materials: { ironwood: 12, chalkstone: 12 },
    tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
      { uid: 'seed-archive', buildingId: 'archive', x: 22, y: 20 },
      { uid: 'seed-exchange', buildingId: 'exchange_post', x: 26, y: 20 },
      { uid: 'seed-woodsman', buildingId: 'woodsman_camp', x: 8, y: 38 },
      { uid: 'seed-stonemason', buildingId: 'stonemason_camp', x: 52, y: 34 },
    ],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    questItems: {}, vendorsUnlocked: [], questsDone: [],
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
    ...(overrides && overrides.top) || {},
  };
}

/** Move the SERVER's player, then pull the move back through the app's client. */
/**
 * Put the scholar on a tile — BOTH the renderer and the server.
 *
 * Moving only the server used to be enough. It is not any more: interacting
 * flushes the RENDERER's position first (so pressing E the instant you arrive
 * is not refused on a stale tile), which would overwrite a server-only move
 * with wherever the renderer still thought it was. Moving one half of the world
 * is a state no player can produce, so the helper moves both.
 */
function standAt(x, y) {
  return `
    window.__sqStood = 'pending';
    window.__sqWorld.setPlayerTile(${x}, ${y});
    fetch('/api/player/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: ${x}, y: ${y} }),
    })
      .then((r) => r.json())
      .then((j) => (j.ok ? window.__sqApi.setActiveSlot(1).then(() => 'ok') : j.error))
      .then((r) => { window.__sqStood = r; }, (e) => { window.__sqStood = e.message; });
    return 'moving';
  `;
}

const stood = {
  type: 'waitFor', timeoutMs: 8000, label: 'the scholar is standing there',
  expr: "if (window.__sqStood === 'pending') return false; if (window.__sqStood !== 'ok') throw new Error(window.__sqStood); return true;",
};

/** Fire an api call and stash the answer — never returns the promise (see 11). */
function fire(name, js) {
  return `window.${name} = 'pending'; ${js}
    .then((j) => { window.${name} = j; }, (e) => { window.${name} = { ok: false, error: e.message }; });
    return 'sent';`;
}
function answered(name, label) {
  return { type: 'waitFor', timeoutMs: 8000, label, expr: `return window.${name} !== 'pending';` };
}

/** Does the dialogue box currently on screen contain this phrase? */
/**
 * THE BOX ON SCREEN, not the api reply.
 *
 * The conversation is a white Nintendo-style box over the world, typed one line
 * at a time. `readAll()` walks it to the end by pressing E, collecting every
 * line, so an assertion never races the typewriter and never depends on which
 * line happens to be showing.
 */
const BOX = ".sq-dlg-root:not([hidden]) .sq-dlg-box";
const BOX_OPEN = `return !!document.querySelector(${JSON.stringify(BOX)});`;

/** Read the whole conversation, pressing E through it, and stash the text. */
const READ_ALL = `
  const dlg = window.__sqDialogue && window.__sqDialogue();
  if (!dlg || !dlg.isOpen()) { window.__sqSaid = ''; return 'no box'; }
  const seen = [];
  for (let i = 0; i < 40 && dlg.isOpen(); i += 1) {
    const line = dlg.currentText();
    if (line && seen[seen.length - 1] !== line) seen.push(line);
    dlg.advance();   // finish typing
    if (dlg.isOpen()) dlg.advance();  // next line (or close on the last)
  }
  window.__sqSaid = seen.join(' | ');
  return window.__sqSaid;
`;

function saidHas(text) {
  return "return String(window.__sqSaid || '').toLowerCase().indexOf("
    + JSON.stringify(String(text).toLowerCase()) + ") !== -1;";
}
function saidLacks(text) {
  return "return String(window.__sqSaid || '').toLowerCase().indexOf("
    + JSON.stringify(String(text).toLowerCase()) + ") === -1;";
}

export default {
  name: 'outlanders — locked doors, the Blue Bloom, and the key that opens one',
  order: 16,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Forager', createdAt: NOW, lastPlayedAt: NOW,
      playtimeMs: 1000, level: 4, tasksDone: 0, tasksTotal: 0, savedAt: NOW,
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
    { type: 'wait', ms: 1400, label: 'let the camera settle' },

    // ---------------------------------------- 1. the Bloom is really on the map
    {
      type: 'assert', label: 'the scholar starts below the Blue Bloom',
      expr: "const t = window.__sqWorld.getPlayerTile(); return t.x + ',' + t.y;",
      equals: `${BLOOM_X},${BLOOM_Y + 1}`,
    },
    // HOLD, not tap: `key` sends keyDown and keyUp back to back, which is not
    // long enough for the player to turn. The bloom is a solid tile, so holding
    // north turns the scholar and walks them into it rather than past it.
    { type: 'hold', key: 'w', ms: 500, label: 'face north, at the bloom' },
    { type: 'wait', ms: 500 },
    {
      // The whole quest rests on this tile existing. Carved, not left to noise.
      type: 'assert', label: 'the tile above really is a bluetree node',
      expr: "const n = window.__sqWorld.getFacingNode(); return n ? n.nodeType + '@' + n.x + ',' + n.y : 'nothing';",
      equals: `bluetree@${BLOOM_X},${BLOOM_Y}`,
    },
    {
      type: 'assert', label: 'and the prompt names it rather than calling it a tree',
      expr: "return window.__sqWorld.getPrompts().join(' | ').indexOf('Blue Bloom') !== -1;",
      equals: true,
    },
    {
      // CAN YOU ACTUALLY GET THERE?
      //
      // With an AXE — which is the right question, and not the one I asked
      // first. The first version of this check treated trees as impassable and
      // reported the glade cut off, so I "fixed" the map by forcing land over
      // the lake and laying a causeway. Bruno: "I liked the blue bloom as it
      // was, don't change it. you can reach it by cutting down a tree." Trees
      // are not walls; an axe removes them, and clearing a way in is a fine
      // thing to ask of the player. WATER and STONE are the real barriers, so
      // they are the only things this fill refuses to cross.
      type: 'assert', label: 'the Bloom can be reached with an axe',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const T = C.TILE_TYPES;
          // Trees are deliberately NOT in here. Chopping one is a legal way
          // through, and counting them as walls is what produced a false alarm.
          const blocking = new Set([T.water, T.stone, T.bluetree]);
          const seen = new Uint8Array(C.WORLD_W * C.WORLD_H);
          // From the PLAZA, where every save starts — not from wherever the
          // scholar happens to be standing, which would prove nothing.
          const q = [[24, 18]];
          seen[18 * C.WORLD_W + 24] = 1;
          while (q.length) {
            const cur = q.pop();
            for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx = cur[0] + d[0], ny = cur[1] + d[1];
              if (nx < 0 || ny < 0 || nx >= C.WORLD_W || ny >= C.WORLD_H) continue;
              const i = ny * C.WORLD_W + nx;
              if (seen[i] || blocking.has(w.tiles[i])) continue;
              seen[i] = 1; q.push([nx, ny]);
            }
          }
          const around = [[0,1],[0,-1],[1,0],[-1,0]]
            .map((d) => [C.BLOOM.x + d[0], C.BLOOM.y + d[1]])
            .filter((t) => seen[t[1] * C.WORLD_W + t[0]]);
          return around.length > 0;
        });
      `,
      equals: true,
    },
    {
      // A THICKER WOOD, WITHOUT BLOCKING ANYTHING. Bruno, 2026-08-31: "add more
      // trees around (remember not to block paths to the woodsman or the dirt
      // roads)."
      //
      // Roads are safe by construction — the dirt paths are carved AFTER the
      // tree pass and overwrite whatever they cross — but the GROVE and GLADE
      // ring carves run later still and used to plant a tree on whatever they
      // found, road included. Both skip path tiles now, and this is the guard.
      type: 'assert', label: 'the wood is thick, and no tree stands on a road',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          let trees = 0;
          for (let i = 0; i < w.tiles.length; i += 1) {
            if (w.tiles[i] === C.TILE_TYPES.tree) trees += 1;
          }
          const share = trees / (C.WORLD_W * C.WORLD_H);
          // Was ~11% and read as a lawn with ornaments. Floor well under the
          // measured 21.5% so a small retune does not fail the suite, but high
          // enough that reverting the density does.
          if (share < 0.16) return 'only ' + (share * 100).toFixed(1) + '% trees';
          return true;
        });
      `,
      equals: true,
    },
    {
      // ONE DOOR, AND ONLY ONE. Bruno, 2026-08-31: "I liked how the woodsman was
      // surrounded by trees except by one block which was the entrance, can you
      // redo that?"
      //
      // The gap used to be wherever the approach happened to cross the ring —
      // two tiles wide for the two-wide path, and a third where the plaza road
      // met it. The ring is authoritative now and the door is declared
      // (GROVE.doorX on the south edge), so this counts the gaps rather than
      // trusting the carve.
      type: 'assert', label: 'the clearing is ringed by trees with exactly one way in',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const solid = new Set(C.SOLID_TILES);
          const G = C.GROVE;
          const gaps = [];
          for (let y = G.y - 1; y <= G.y + G.h; y += 1) {
            for (let x = G.x - 1; x <= G.x + G.w; x += 1) {
              const inside = x >= G.x && x < G.x + G.w && y >= G.y && y < G.y + G.h;
              if (inside) continue;
              if (!solid.has(w.tiles[y * C.WORLD_W + x])) gaps.push(x + ',' + y);
            }
          }
          if (gaps.length !== 1) return gaps.length + ' gaps: ' + gaps.join(' ');
          return gaps[0] === (G.doorX + ',' + (G.y + G.h));
        });
      `,
      equals: true,
    },
    {
      // THE WAY TO THE WOODSMAN MUST STILL BE WALKABLE — no axe required. This
      // is the assertion Bruno's warning is really about: a denser forest that
      // seals his clearing would be a quest nobody can start.
      type: 'assert', label: 'the Woodsman is still reachable on foot from the plaza',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const solid = new Set(C.SOLID_TILES);   // trees COUNT as walls here
          const seen = new Uint8Array(C.WORLD_W * C.WORLD_H);
          const q = [[24, 18]];
          seen[18 * C.WORLD_W + 24] = 1;
          while (q.length) {
            const cur = q.pop();
            for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx = cur[0] + d[0], ny = cur[1] + d[1];
              if (nx < 0 || ny < 0 || nx >= C.WORLD_W || ny >= C.WORLD_H) continue;
              const i = ny * C.WORLD_W + nx;
              if (seen[i] || solid.has(w.tiles[i])) continue;
              seen[i] = 1; q.push([nx, ny]);
            }
          }
          const at = (x, y) => !!seen[y * C.WORLD_W + x];
          // His clearing, and the mouth of the Stonemason's cave.
          return at(C.GROVE.x + 2, C.GROVE.y + 3) && at(C.CAVE.mouthX, C.CAVE.mouthY);
        });
      `,
      equals: true,
    },
    {
      // THE HOME BLOCK IS WALLED, with one road out. Bruno, 2026-09-02: "the
      // border of the home ... should have all of the border blocks covered by
      // trees or rocks, except for the road in the top right area."
      //
      // 224 border tiles is not something to check by walking round and
      // looking, so this counts them — and requires the gap to be exactly the
      // declared crossing, not merely SOME gap.
      type: 'assert', label: 'every border tile is walled but the road east',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const solid = new Set(C.SOLID_TILES);
          const at = (x, y) => w.tiles[y * C.WORLD_W + x];
          const gaps = [];
          for (let x = 0; x < C.WORLD_W; x += 1) {
            if (!solid.has(at(x, 0))) gaps.push(x + ',0');
            if (!solid.has(at(x, C.WORLD_H - 1))) gaps.push(x + ',' + (C.WORLD_H - 1));
          }
          for (let y = 0; y < C.WORLD_H; y += 1) {
            if (!solid.has(at(0, y))) gaps.push('0,' + y);
            if (!solid.has(at(C.WORLD_W - 1, y))) gaps.push((C.WORLD_W - 1) + ',' + y);
          }
          const want = [];
          for (let y = C.CROSSING.gapY; y < C.CROSSING.gapY + C.CROSSING.gapH; y += 1) {
            want.push(C.CROSSING.homeExitX + ',' + y);
          }
          if (gaps.length !== want.length) return gaps.length + ' gaps: ' + gaps.join(' ');
          return want.every((g) => gaps.indexOf(g) !== -1);
        });
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v5-blue-bloom.png' },

    // ------------------------------- 2. both doors are shut, ON THE SELL ROUTE
    //
    // Checked through the API, not the UI: a lock that only exists in the panel
    // is not a lock.
    { type: 'eval', label: 'walk to the Woodsman', expr: standAt(8, 39) },
    stood,
    {
      type: 'eval', label: 'try to sell him timber',
      expr: fire('__sqW1', "window.__sqApi.sell('ironwood', 2, 'woodsman')"),
    },
    answered('__sqW1', 'the Woodsman answered'),
    {
      type: 'assert', label: 'the Woodsman refuses — no key',
      expr: "return window.__sqW1.ok === false && /Blue Key/i.test(window.__sqW1.error || '');",
      equals: true,
    },
    { type: 'eval', label: 'walk to the Stonemason', expr: standAt(54, 36) },
    stood,
    {
      type: 'eval', label: 'try to sell him stone',
      expr: fire('__sqS1', "window.__sqApi.sell('chalkstone', 2, 'stonemason')"),
    },
    answered('__sqS1', 'the Stonemason answered'),
    {
      type: 'assert', label: 'the Stonemason refuses — level 4 is not level 10',
      expr: "return window.__sqS1.ok === false && /level 10/i.test(window.__sqS1.error || '');",
      equals: true,
    },

    // ------------------------------------- 3. the dialogue is actually DRAWN
    // `onInteract` is exactly what pressing E runs — main.js hangs it on the
    // world object. Called directly rather than sending E because standAt()
    // moves the SERVER's player while the renderer keeps its own position, so
    // the world would not agree it is standing at his counter.
    {
      type: 'eval', label: 'press E at the Stonemason',
      expr: "window.__sqWorld.onInteract('stonemason_camp'); return 'talked';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'a dialogue box appears over the world',
      expr: BOX_OPEN,
    },
    {
      // Guards the screenshots below, and a real trap: Esc with nothing open is
      // the PAUSE key, and a pause menu left up dims the whole overlay — which
      // made the dialogue box look grey in the first screenshot of it.
      type: 'assert', label: 'nothing else is on screen — no pause menu dimming it',
      expr: "const p = document.querySelector('.sq-pause-scrim'); return !p || p.hidden === true || getComputedStyle(p).display === 'none';",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-stonemason-locked.png' },
    {
      type: 'assert', label: 'white ground, black border, centred along the bottom',
      expr: `const b = document.querySelector(${JSON.stringify(BOX)});
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        const midX = Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) < 40;
        const low = r.top > window.innerHeight * 0.5;
        return [cs.backgroundColor, cs.borderTopWidth, midX, low].join('/');`,
      equals: 'rgb(255, 253, 247)/4px/true/true',
    },
    { type: 'eval', label: 'read it to the end', expr: READ_ALL },
    {
      type: 'assert', label: 'he says you are not professional enough',
      expr: saidHas('not professional enough'), equals: true,
    },
    {
      type: 'assert', label: 'and tells you the level he wants',
      expr: saidHas('level 10'), equals: true,
    },
    {
      type: 'assert', label: 'the box closes when the last line is passed',
      expr: BOX_OPEN, equals: false,
    },
    {
      // A refusal that then shows you his price list is not a refusal.
      type: 'assert', label: 'and his counter never opened',
      expr: "return window.__sqPanels.shops.isOpen();", equals: false,
    },
    // NO Escape here. Nothing is open — the conversation closed itself on its
    // last line and his counter never opened. Esc with nothing open is the
    // PAUSE key, and a pause menu left up dims every screenshot after it and
    // eats the next keypress. (It did exactly that, and the screenshot caught
    // it.)

    // Walk back first. Talking requires standing at his counter — the same gate
    // as selling — so opening his panel from inside the Stonemason's cave gets
    // a refusal, not a conversation. (Which is correct, and is why this walk is
    // here rather than the gate being relaxed.)
    { type: 'eval', label: 'walk back to the Woodsman', expr: standAt(8, 39) },
    stood,
    {
      type: 'eval', label: 'press E at the Woodsman',
      expr: "window.__sqWorld.onInteract('woodsman_camp'); return 'talked';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'he speaks',
      expr: BOX_OPEN,
    },
    { type: 'screenshot', file: 'v5-woodsman-locked.png' },
    {
      type: 'assert', label: 'his name is on the box',
      expr: "const w = document.querySelector('.sq-dlg-who'); return !!w && /woodsman/i.test(w.textContent);",
      equals: true,
    },
    { type: 'eval', label: 'read it to the end', expr: READ_ALL },
    {
      type: 'assert', label: 'he asks for the Blue Bloom',
      expr: saidHas('Blue Bloom'), equals: true,
    },
    {
      type: 'assert', label: 'and says where it is',
      expr: saidHas('north-west'), equals: true,
    },
    {
      type: 'assert', label: 'his counter stayed shut too',
      expr: "return window.__sqPanels.shops.isOpen();", equals: false,
    },
    // NO Escape here. Nothing is open — the conversation closed itself on its
    // last line and his counter never opened. Esc with nothing open is the
    // PAUSE key, and a pause menu left up dims every screenshot after it and
    // eats the next keypress. (It did exactly that, and the screenshot caught
    // it.)

    // ------------------------------------------------ 4. fell the Blue Bloom
    {
      type: 'eval', label: 'back to the glade',
      expr: standAt(BLOOM_X, BLOOM_Y + 1),
    },
    stood,
    {
      type: 'eval', label: 'cut it down (5 swings)',
      expr: fire('__sqCut', `(async () => {
        let last = null;
        for (let i = 0; i < 5; i += 1) {
          last = await window.__sqApi.gather(${BLOOM_X}, ${BLOOM_Y}, 'bluetree');
          if (!last.ok) break;
        }
        return last;
      })()`),
    },
    answered('__sqCut', 'the bloom answered'),
    {
      type: 'assert', label: 'the last swing destroyed it',
      expr: "return window.__sqCut.ok === true && window.__sqCut.result.destroyed === true;",
      equals: true,
    },
    {
      type: 'assert', label: 'and it paid a Blue Key, not a material',
      expr: "const r = window.__sqCut.result; return r.questItemId + '/' + String(r.materialId);",
      equals: 'blue_key/null',
    },
    {
      type: 'assert', label: 'felling it paid quest xp',
      expr: "return window.__sqCut.result.questXp > 0;", equals: true,
    },
    {
      type: 'assert', label: 'the key is in the save',
      expr: "return window.__sqState().questItems.blue_key;", equals: 1,
    },
    {
      // Unique means unique. A second bloom would be a second key.
      type: 'eval', label: 'swing at the cut bloom again',
      expr: fire('__sqCut2', `window.__sqApi.gather(${BLOOM_X}, ${BLOOM_Y}, 'bluetree')`),
    },
    answered('__sqCut2', 'the stump answered'),
    {
      type: 'assert', label: 'there was only ever one, and it does not grow back',
      expr: "return window.__sqCut2.ok === false && /only ever one/i.test(window.__sqCut2.error || '');",
      equals: true,
    },

    // ------------------------------------- 5. the key is IN THE BAG, on RELICS
    { type: 'key', key: 'Tab', label: 'open the Bag' },
    { type: 'wait', ms: 800 },
    {
      // ON THE RELICS TAB, not the bag list. Quest items and the Reaches gear
      // moved there — Bruno, 2026-09-06: the things you find once and keep
      // forever do not belong filed beside stacks of ironwood.
      type: 'eval', label: 'open the RELICS tab',
      expr: `
        const body = document.querySelector('.sq-inv-body');
        if (!body) throw new Error('the Bag is not open');
        const tabs = [...body.parentElement.querySelectorAll('.sq-theme-tab')];
        const t = tabs.find((b) => /relics/i.test(b.textContent || ''));
        if (!t) throw new Error('no RELICS tab: ' + tabs.map((b) => b.textContent).join('|'));
        t.click();
        return 'clicked';
      `,
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'RELICS shows the Blue Key under QUEST ITEMS',
      expr: "const b = document.querySelector('.sq-inv-body'); return !!b && /QUEST ITEMS/.test(b.textContent) && /Blue Key/.test(b.textContent);",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-blue-key-bag.png' },
    { type: 'key', key: 'Escape', label: 'close the Bag' },
    { type: 'wait', ms: 500 },

    // ------------------------------------ 6. hand it over, and the door opens
    { type: 'eval', label: 'walk back to the Woodsman', expr: standAt(8, 39) },
    stood,
    {
      type: 'eval', label: 'press E holding the key',
      expr: "window.__sqWorld.onInteract('woodsman_camp'); return 'talked';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'he speaks',
      expr: BOX_OPEN,
    },
    { type: 'eval', label: 'read it to the end', expr: READ_ALL },
    {
      type: 'assert', label: 'he thanks you',
      expr: saidHas('thank you'), equals: true,
    },
    {
      type: 'assert', label: 'the key is SPENT — talking is what costs it',
      expr: "return window.__sqState().questItems.blue_key === undefined;", equals: true,
    },
    {
      type: 'assert', label: 'and he is recorded as open, on the server',
      expr: "return (window.__sqState().vendorsUnlocked || []).join(',');", equals: 'woodsman',
    },
    {
      // THE ROWS. This is the assertion that would have caught normShops
      // dropping the outlanders — everything above passed while it was broken.
      type: 'waitFor', timeoutMs: 8000, label: 'his sell rows appear on screen',
      expr: "return document.querySelectorAll('.sq-shops-row').length > 0;",
    },
    {
      type: 'assert', label: 'and they are timber, priced above the town rate',
      expr: "const t = document.querySelector('.sq-shops-rows').textContent; return /Ironwood/i.test(t) && /7 for 2 florins/i.test(t) && /Trading Post gives/i.test(t);",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-woodsman-open.png' },

    // ------------------------------------------------- 7. selling pays XP
    {
      type: 'eval', label: 'note the level and xp before selling',
      expr: "const p = window.__sqState().player; window.__sqBefore = { level: p.level, xp: p.xp }; return JSON.stringify(window.__sqBefore);",
    },
    {
      type: 'eval', label: 'sell him a lot of 7 timber',
      // SEVEN. A common material is sold in lots of 7 to an outlander, and
      // anything short of a full lot is refused outright — florins are rare
      // enough now that they are not paid out per unit at all.
      expr: fire('__sqSell', "window.__sqApi.sell('ironwood', 7, 'woodsman')"),
    },
    answered('__sqSell', 'the sale went through'),
    {
      type: 'assert', label: 'he bought it, in florins',
      expr: "return window.__sqSell.ok === true && window.__sqSell.earned > 0;", equals: true,
    },
    {
      type: 'assert', label: 'and paid 2 xp per unit — 7 sold, 14 xp',
      expr: "return window.__sqSell.xp;", equals: 14,
    },
    {
      type: 'assert', label: 'the lot was 7 for 2 florins',
      expr: "const r = window.__sqSell; return r.per + '/' + r.pay + '/' + r.earned;",
      equals: '7/2/2',
    },

    // ------------------------------- 8. talking again must not re-open anything
    { type: 'key', key: 'Escape', label: 'close the panel' },
    { type: 'wait', ms: 500 },
    {
      type: 'eval', label: 'press E a second time',
      expr: "window.__sqWorld.onInteract('woodsman_camp'); return 'talked';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'he speaks again',
      expr: BOX_OPEN,
    },
    { type: 'eval', label: 'read it to the end', expr: READ_ALL },
    {
      type: 'assert', label: 'he greets you instead of thanking you again',
      expr: saidLacks('thank you'), equals: true,
    },
    {
      type: 'assert', label: 'and he did not want a second key',
      expr: "return (window.__sqState().vendorsUnlocked || []).join(',');", equals: 'woodsman',
    },
    {
      type: 'assert', label: 'the rows are still there',
      expr: "return document.querySelectorAll('.sq-shops-row').length > 0;", equals: true,
    },
    {
      type: 'assert', label: 'and the Stonemason is still shut — one key, one door',
      expr: "return (window.__sqState().vendorsUnlocked || []).indexOf('stonemason');", equals: -1,
    },

    // ------------- 9. A CONVERSATION MUST NOT SURVIVE LEAVING THE WORLD
    //
    // Bruno: "when I go to the start menu and the dialogue is still running it
    // does not disappear." The box is deliberately NOT one of the `panels`, so
    // `closeAll()` never touched it and a half-read line stayed on screen over
    // the title menu. Also asserted: leaving does NOT count as having read it —
    // dismissing must not run the follow-up that opens the vendor's counter.
    { type: 'key', key: 'Escape', label: 'shut whatever is open' },
    { type: 'wait', ms: 400 },
    { type: 'key', key: 'Escape', label: 'and again, in case that raised pause' },
    { type: 'wait', ms: 400 },
    { type: 'eval', label: 'stand at the Woodsman', expr: standAt(8, 39) },
    stood,
    {
      type: 'eval', label: 'start a conversation',
      expr: "window.__sqWorld.onInteract('woodsman_camp'); return 'talked';",
    },
    { type: 'waitFor', timeoutMs: 8000, label: 'the box is up', expr: BOX_OPEN },
    {
      type: 'eval', label: 'walk out to the title screen mid-sentence',
      expr: "window.__sqPause ? window.__sqPause.quitToMenu() : (function(){ throw new Error('no pause probe'); })();",
    },
    { type: 'wait', ms: 1200 },
    {
      type: 'assert', label: 'the dialogue box is GONE',
      expr: BOX_OPEN, equals: false,
    },
    {
      type: 'assert', label: 'and leaving did not count as reading it — no shop opened',
      expr: "return window.__sqPanels.shops.isOpen();", equals: false,
    },
    {
      type: 'assert', label: 'we really are back at the title screen',
      expr: "const r = document.querySelector('.sq-launch-root'); return !!r && !r.hidden;",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-menu-no-dialogue.png' },
  ],
};
