// tools/checks/16-outlanders-open.mjs — the two doors OPENING.
//
// 15-outlanders proves both vendors start shut and walks the long way round to
// the Woodsman. This suite covers the two states 15 cannot reach in one save:
//
//   1. THE KEY BEFORE THE CONVERSATION. Bruno: "if you find the blue key by
//      cutting down the blue tree before even interacting with the wood npc, it
//      will go right to the last dialogue of letting you buy and thanking you."
//      So: a save that already holds the key and has NEVER spoken to him. The
//      first thing he says must be the thank-you, not the request — a stage
//      machine that stored "which line did I last say" instead of deriving it
//      would fail exactly here.
//
//   2. LEVEL 10. The Stonemason's lock is a level, so the save is seeded at 10
//      and his first line must be the one that opens the door. Seeding the
//      level is honest here: what is under test is the DOOR reacting to the
//      level, not the arithmetic of xpToNext, which shared/economy.js owns and
//      06-v3 already exercises.

const NOW = Date.now();

function save() {
  return {
    player: {
      name: 'Journeyman',
      // Level 10 exactly — the boundary, not comfortably past it. An off-by-one
      // in the lock (> instead of >=) is the likeliest way this breaks.
      // Level 10 EXACTLY, and no xp banked: the Stonemason's boundary test
      // below depends on both, so the level-up test cannot get there by seeding
      // the player next to a threshold. It opens a pile of boxes instead.
      level: 10, xp: 0, xpToNext: 630,
      x: 8, y: 39,
      coins: { florin: 100, shard: 0 },
      // Enough to buy a level at 10-30 xp each: level 11 costs 630.
      darkBoxes: 40, streak: 0, lastActiveDate: null,
      energy: 110, maxEnergy: 110,
      gatherTools: [{ uid: 'pick-1', toolId: 'pickaxe', durability: 50, maxDurability: 50 }],
      activeGatherTool: 'pick-1',
      equipped: [{ kind: 'tool', itemId: 'pickaxe', uid: 'pick-1' }, null],
      activeSlot: 0, equipMigrated: true, saplings: 0, pity: 0,
    },
    materials: { ironwood: 10, chalkstone: 14 },
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
    // THE KEY IS ALREADY IN THE PACK, and he has never been spoken to.
    questItems: { blue_key: 1 },
    vendorsUnlocked: [],
    questsDone: [],
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
  };
}

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

function fire(name, js) {
  return `window.${name} = 'pending'; ${js}
    .then((j) => { window.${name} = j; }, (e) => { window.${name} = { ok: false, error: e.message }; });
    return 'sent';`;
}
function answered(name, label) {
  return { type: 'waitFor', timeoutMs: 8000, label, expr: `return window.${name} !== 'pending';` };
}
/** The Nintendo-style box over the world, read to the end by pressing E. */
const BOX = ".sq-dlg-root:not([hidden]) .sq-dlg-box";
const BOX_OPEN = `return !!document.querySelector(${JSON.stringify(BOX)});`;
const READ_ALL = `
  const dlg = window.__sqDialogue && window.__sqDialogue();
  if (!dlg || !dlg.isOpen()) { window.__sqSaid = ''; return 'no box'; }
  const seen = [];
  for (let i = 0; i < 40 && dlg.isOpen(); i += 1) {
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
function saidLacks(text) {
  return "return String(window.__sqSaid || '').toLowerCase().indexOf("
    + JSON.stringify(String(text).toLowerCase()) + ") === -1;";
}

export default {
  name: 'outlanders — the key in hand, and the level already earned',
  order: 17,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Journeyman', createdAt: NOW, lastPlayedAt: NOW,
      playtimeMs: 1000, level: 10, tasksDone: 0, tasksTotal: 0, savedAt: NOW,
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
    {
      type: 'assert', label: 'the save really is carrying the key, unspoken-for',
      expr: "const s = window.__sqState(); return s.questItems.blue_key + '/' + (s.vendorsUnlocked || []).length;",
      equals: '1/0',
    },

    // ------------------- 1. THE KEY BEFORE THE CONVERSATION EVER HAPPENED
    {
      type: 'eval', label: 'press E at the Woodsman for the FIRST time',
      expr: "window.__sqWorld.onInteract('woodsman_camp'); return 'talked';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'he speaks', expr: BOX_OPEN,
    },
    { type: 'screenshot', file: 'v5-woodsman-firstmeet.png' },
    { type: 'eval', label: 'read the whole conversation', expr: READ_ALL },
    {
      type: 'assert', label: 'he goes straight to thanking you',
      expr: saidHas('thank you'), equals: true,
    },
    {
      type: 'assert', label: 'and never asks for the Bloom he can already see',
      expr: saidLacks('cut it down and bring me'), equals: true,
    },
    {
      type: 'assert', label: 'the key is spent on that first meeting',
      expr: "return window.__sqState().questItems.blue_key === undefined;", equals: true,
    },
    {
      // The counter opens only AFTER the conversation — that is the point of
      // reading it to the end above.
      type: 'waitFor', timeoutMs: 8000, label: 'and then his counter opens on its own',
      expr: "return document.querySelectorAll('.sq-shops-row').length > 0;",
    },
    { type: 'screenshot', file: 'v5-woodsman-open.png' },
    { type: 'key', key: 'Escape', label: 'close the panel' },
    { type: 'wait', ms: 500 },

    // ---------------------------------------------- 2. LEVEL 10 OPENS STONE
    { type: 'eval', label: 'walk to the mountain', expr: standAt(54, 36) },
    stood,
    {
      type: 'assert', label: 'still level 10, and he has never been spoken to',
      expr: "const s = window.__sqState(); return s.player.level + '/' + (s.vendorsUnlocked || []).indexOf('stonemason');",
      equals: '10/-1',
    },
    {
      type: 'eval', label: 'press E at the Stonemason',
      expr: "window.__sqWorld.onInteract('stonemason_camp'); return 'talked';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'he speaks', expr: BOX_OPEN,
    },
    { type: 'screenshot', file: 'v5-stonemason-open.png' },
    { type: 'eval', label: 'read the whole conversation', expr: READ_ALL },
    {
      type: 'assert', label: 'level 10 exactly is enough — he does not say "amateurs"',
      expr: saidLacks('amateur'), equals: true,
    },
    {
      type: 'assert', label: 'he asks for stone instead',
      expr: saidHas('bring me stone'), equals: true,
    },
    {
      type: 'assert', label: 'and the server recorded the door open',
      expr: "return (window.__sqState().vendorsUnlocked || []).indexOf('stonemason') !== -1;",
      equals: true,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'his sell rows are on screen',
      expr: "return document.querySelectorAll('.sq-shops-row').length > 0;",
    },
    {
      type: 'assert', label: 'and they are stone, not timber',
      expr: "const t = document.querySelector('.sq-shops-rows').textContent; return /Chalkstone/i.test(t) && !/Ironwood/i.test(t);",
      equals: true,
    },
    {
      // A LOT OF SEVEN. Stone is common, and an outlander's common lot is 7.
      type: 'eval', label: 'sell him a lot of 7 stone',
      expr: fire('__sqStone', "window.__sqApi.sell('chalkstone', 7, 'stonemason')"),
    },
    answered('__sqStone', 'the Stonemason answered'),
    {
      type: 'assert', label: '7 stone for 2 florins, and 2 xp per stone',
      expr: "const r = window.__sqStone; return r.ok === true && r.earned === 2 && r.per === 7 && r.xp === 14;",
      equals: true,
    },

    // -------------------------------------------- 3. DARK BOXES PAY XP TOO
    {
      type: 'eval', label: 'note the xp before opening a box',
      expr: "window.__sqXp0 = window.__sqState().player.xp; return String(window.__sqXp0);",
    },
    {
      type: 'eval', label: 'open one dark box',
      expr: fire('__sqBox', "window.__sqApi.openBoxes(1)"),
    },
    answered('__sqBox', 'the box answered'),
    {
      type: 'assert', label: 'a box pays between 10 and 30 xp',
      expr: "const b = window.__sqBox; return b.ok === true && b.xp >= 10 && b.xp <= 30;",
      equals: true,
    },
    {
      // AND THE PLAYER IS TOLD. The server had been paying box xp since the
      // levelling pass, but the opening reel showed only the drops, so from the
      // player's side it did not exist — which is why it was reported twice as
      // missing. The toast is the whole fix, and this is its guard.
      type: 'waitFor', timeoutMs: 6000, label: 'and the opening says so on screen',
      expr: "return window.__sqWorld.getToasts().some((t) => /\\+\\d+ xp/i.test(t));",
    },

    // ---------------------------------------------- 4. A LEVEL BUYS STAMINA
    //
    // Until item 2 a level did nothing at all except open this vendor's door,
    // which made it a gate rather than a progression. Every level is now worth
    // STAMINA_PER_LEVEL on the ceiling, and the new headroom is GRANTED rather
    // than merely allowed — a reward you cannot spend until tomorrow is not one.
    {
      type: 'eval', label: 'note stamina and how far off the next level is',
      expr: `
        const p = window.__sqState().player;
        window.__sqBefore = { max: p.maxEnergy, energy: p.energy, level: p.level, xp: p.xp, toNext: p.xpToNext };
        return JSON.stringify(window.__sqBefore);
      `,
    },
    {
      type: 'assert', label: 'the ceiling already reflects level 10',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const p = window.__sqState().player;
          return p.maxEnergy === C.maxEnergyFor(window.__sqState().buildings, p.level);
        });
      `,
      equals: true,
    },
    {
      // Through the raw route rather than `openBoxes`, which plays the opening
      // animation and would make four calls a slow wait. What is under test is
      // the server's levelling, not the gacha reel — 13-economy covers that.
      type: 'eval', label: 'open enough boxes to buy a level',
      expr: fire('__sqLvl', `(async () => {
        for (let i = 0; i < 6; i += 1) {
          const r = await fetch('/api/box/open', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 6 }),
          }).then((x) => x.json());
          if (!r.ok) return { ok: false, error: r.error };
          if (r.state) window.__sqLast = r.state;
          if (r.levelsGained > 0) return { ok: true, level: r.level };
        }
        return { ok: false, error: 'no level in 36 boxes' };
      })()`),
    },
    answered('__sqLvl', 'the boxes answered'),
    {
      type: 'assert', label: 'a level was reached',
      expr: "return window.__sqLvl.ok === true;", equals: true,
    },
    {
      // The raw fetches above bypass the app's api client, so this module's
      // copy of state is stale. Pull it forward before reading the player.
      type: 'eval', label: 'pull the new state through the app client',
      expr: fire('__sqPull', "window.__sqApi.setActiveSlot(1)"),
    },
    answered('__sqPull', 'state is current again'),
    {
      type: 'assert', label: 'and the ceiling rose with it',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const p = window.__sqState().player;
          const climbed = p.level - window.__sqBefore.level;
          return p.maxEnergy === window.__sqBefore.max + C.STAMINA_PER_LEVEL * climbed;
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and the new headroom was actually granted, not just allowed',
      expr: "const p = window.__sqState().player; return p.energy > window.__sqBefore.energy;",
      equals: true,
    },
    {
      // Linear, so the next level costs a fixed step more than the last — the
      // old 1.35^n curve made level 20 alone cost 45,000 xp.
      type: 'assert', label: 'the curve is linear, not compounding',
      expr: `
        return import('/shared/economy.js').then((E) => {
          const a = E.xpToNext(3) - E.xpToNext(2);
          const b = E.xpToNext(9) - E.xpToNext(8);
          return a === b && a === E.XP_STEP;
        });
      `,
      equals: true,
    },
  ],
};
