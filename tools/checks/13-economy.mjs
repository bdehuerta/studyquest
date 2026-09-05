// tools/checks/13-economy.mjs — the v5 economy pass, asserted end to end.
//
// WHY THIS SUITE EXISTS
//
// Four changes that all touch the same prices landed together, and every one of
// them is the kind that a "nothing threw" test cannot see:
//
//   1. The Archive deals in BLUEPRINTS and the Market in GOODS. They used to
//      share one panel that showed everything at both, which made the two
//      buildings interchangeable and the walk between them pointless.
//   2. Four currencies collapsed into Florins, with Shards alongside.
//   3. Dark Boxes CANNOT BE BOUGHT. Not "expensive" — refused.
//   4. The Exchange trades shards for florins one way, steeply.
//
// So this asserts what the player is shown and what the server will actually
// do, not what the vendor data happens to contain.

const NOW = Date.now();

function save(over) {
  return Object.assign({
    player: {
      name: 'Trader', level: 6, xp: 0, xpToNext: 900,
      x: 26, y: 15,
      coins: { florin: 500, shard: 120 },
      darkBoxes: 3, streak: 0, lastActiveDate: null,
      energy: 110, maxEnergy: 110,
      gatherTools: [], activeGatherTool: null,
      equipped: [null, null], activeSlot: 0, equipMigrated: true, saplings: 0,
      pity: 0,
    },
    materials: { ironwood: 20, chalkstone: 20, heartwood: 6, resin: 4, seedpod: 0 },
    tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
      { uid: 'seed-archive', buildingId: 'archive', x: 22, y: 20 },
      { uid: 'seed-exchange', buildingId: 'exchange_post', x: 26, y: 20 },
      { uid: 'seed-woodsman', buildingId: 'woodsman_camp', x: 8, y: 38 },
      { uid: "seed-stonemason", buildingId: "stonemason_camp", x: 52, y: 34 },
    ],
    // These vendors are LOCKED for a new save (see 15-outlanders). This suite
    // is about their PRICES and their refusals-by-material, not about their
    // doors, so it seeds them open rather than doing the unlock quest first.
    questItems: {}, vendorsUnlocked: ['woodsman', 'stonemason'], questsDone: [],
    // A save whose Merchant stock was ALREADY ROLLED TODAY, at the old prices.
    // This is the exact state that hid the repricing: stock is rolled once a
    // day and cached with its prices baked in, so a save that had already
    // opened the shop kept yesterday's numbers on the shelf until tomorrow.
    // `pricingVersion` is deliberately absent, as it would be in a real save
    // written before the version existed.
    shops: {
      refreshedOn: new Date().toISOString().slice(0, 10),
      stock: {
        merchant: [{ offerId: 'stale-1', materialId: 'ironwood', qty: 2, price: { florin: 28 }, sold: false }],
        broker: [], archivist: [],
      },
      brokerBoxesSoldToday: 0,
    },
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
    meta: { slot: 1, name: 'Trader', createdAt: NOW, lastPlayedAt: NOW, playtimeMs: 1000 },
  }, over || {});
}

/**
 * Stand the player somewhere, on the SERVER.
 *
 * Every trade is gated on where the player actually is — `requireRole` reads
 * the saved position and ignores whatever coordinates a request carries, which
 * is right: a client should not be able to claim it is standing at a shop. So
 * the suite has to move for real before it can trade.
 */
function standAt(x, y) {
  return `
    window.__sqStood = 'pending';
    fetch('/api/player/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: ${x}, y: ${y} }),
    })
      .then((r) => r.json())
      // Pull the new position back through the app's own api client: main.js
      // caches state and the renderer starts from that cache, so moving the
      // server alone leaves the scholar standing where the page already thought
      // they were. Any state-returning call will do.
      .then((j) => (j.ok ? window.__sqApi.setActiveSlot(1).then(() => 'ok') : j.error))
      .then((r) => { window.__sqStood = r; }, (e) => { window.__sqStood = e.message; });
    return 'moving';
  `;
}

/** Fire an api call and stash the answer — never return the promise (see 11). */
function fire(name, js) {
  return `window.${name} = 'pending'; ${js}
    .then((j) => { window.${name} = j; }, (e) => { window.${name} = { ok: false, error: e.message }; });
    return 'sent';`;
}
function answered(name, label) {
  return { type: 'waitFor', timeoutMs: 8000, label, expr: `return window.${name} !== 'pending';` };
}

const stood = {
  type: 'waitFor', timeoutMs: 6000, label: 'the player is standing there',
  expr: "if (window.__sqStood === 'pending') return false; if (window.__sqStood !== 'ok') throw new Error(window.__sqStood); return true;",
};

/** Open the shops panel as if the player walked into `buildingId`. */
const openAt = (buildingId) => `
  window.__sqPanels.shops.openAt(${JSON.stringify(buildingId)});
  return window.__sqPanels.shops.getPlace();
`;

/** What the panel is actually showing: the visible vendor tabs. */
// MEASURED, not `!b.hidden`.
//
// The first version of this trusted the hidden attribute and passed while all
// five tabs were still on screen: .sq-shops-tab sets display:flex, which makes
// `hidden` inert. Anything asserting visibility in this project has to ask the
// layout, not the DOM property.
const VISIBLE_TABS = `
  return [...document.querySelectorAll('.sq-shops-tab')]
    .filter((b) => b.getClientRects().length > 0 && getComputedStyle(b).display !== 'none')
    .map((b) => b.textContent.replace(/[0-9]+$/, '').trim())
    .join(',');
`;

export default {
  name: 'v5 economy — two coins, four places, boxes that cannot be bought',
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
      slot: 1, name: 'Trader', createdAt: NOW, lastPlayedAt: NOW,
      playtimeMs: 1000, level: 6, tasksDone: 0, tasksTotal: 0, savedAt: NOW,
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
    { type: 'wait', ms: 1000, label: 'let the camera settle' },

    // ================================================ 2. two currencies
    {
      type: 'assert', label: 'the wallet holds exactly two currencies',
      expr: "return JSON.stringify(Object.keys(window.__sqState().player.coins).sort());",
      equals: '["florin","shard"]',
    },
    {
      type: 'assert', label: 'and the banner draws a plaque for each',
      expr: "return document.querySelectorAll('.sq-hud-coin').length;", equals: 2,
    },
    {
      type: 'assert', label: 'no trace of the old four anywhere in the banner',
      expr: `
        const t = document.querySelector('.sq-hud-purse').textContent.toLowerCase();
        return /focus|insight|grind|spark/.test(t) === false;
      `,
      equals: true,
    },

    // ================================================ 1. the Archive / Market split
    { type: 'eval', label: 'walk into the Market', expr: openAt('trading_post') },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'the Market shows the Merchant and NOTHING else',
      expr: VISIBLE_TABS, equals: 'MERCHANT',
    },
    {
      type: 'assert', label: 'and no blueprint is on sale here',
      expr: "return /blueprint/i.test(document.querySelector('.sq-shops-body, .sq-shops-panel').textContent) === false;",
      equals: true,
    },
    { type: 'eval', label: 'walk into the Archive', expr: openAt('archive') },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'the Archive shows the Archivist and NOTHING else',
      expr: VISIBLE_TABS, equals: 'ARCHIVIST',
    },
    { type: 'screenshot', file: 'v5-archive-only.png' },

    // ------------------------------------------- the ⌘3 bypass is closed
    {
      type: 'eval', label: 'open the shops panel from nowhere, the old ⌘3 way',
      expr: "window.__sqPanels.shops.open(); return String(window.__sqPanels.shops.getPlace());",
      // `open()` must forget the last building, or the shortcut quietly
      // reopens whichever shop you were in last, from anywhere on the map.
    },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'opened from nowhere, the panel belongs to no building',
      expr: "return String(window.__sqPanels.shops.getPlace());", equals: 'null',
    },
    {
      type: 'assert', label: 'and there is nothing to trade',
      expr: "return /no one here to trade with/i.test(document.body.textContent);",
      equals: true,
    },
    {
      type: 'assert', label: 'not one vendor tab is showing',
      expr: VISIBLE_TABS, equals: '',
    },

    // ================================================ 3. boxes cannot be bought
    { type: 'eval', label: 'stand at the Market', expr: standAt(26, 16) },
    stood,
    {
      type: 'eval', label: 'try to buy a Dark Box from the Broker anyway',
      expr: `
        window.__sqBuy = 'pending';
        fetch('/api/shop/buy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // Standing right at the Market, so the proximity gate passes and what we
          // are testing is the BOX rule itself rather than "you are too far away".
          body: JSON.stringify({ shopId: 'broker', offerId: 'dark_box', x: 26, y: 16 }),
        }).then((r) => r.json()).then((j) => { window.__sqBuy = j; }, (e) => { window.__sqBuy = { error: e.message }; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the server answered',
      expr: "return window.__sqBuy !== 'pending';",
    },
    {
      type: 'assert', label: 'the server REFUSES — not a price, a refusal',
      expr: "return window.__sqBuy.ok === false;", equals: true,
    },
    {
      type: 'assert', label: 'and says where boxes actually come from',
      expr: "return /submit work/i.test(window.__sqBuy.error || '');", equals: true,
    },
    {
      type: 'assert', label: 'no box was handed over',
      expr: "return window.__sqState().player.darkBoxes;", equals: 3,
    },
    {
      type: 'assert', label: 'the vendor list offers no box at any price',
      expr: `
        return fetch('/api/shops').then((r) => r.json()).then((j) => {
          const b = j.shops ? j.shops.broker : (j.broker || {});
          return Array.isArray(b.offers) && b.offers.length === 0 && b.closed === true;
        });
      `,
      equals: true,
    },

    // ---------------------------------- boxes pay SHARDS, not materials
    {
      type: 'eval', label: 'open the three boxes we do have',
      expr: `
        window.__sqOpen = 'pending';
        window.__sqApi.openBoxes(3).then((j) => { window.__sqOpen = j; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the boxes opened',
      expr: "return window.__sqOpen !== 'pending';",
    },
    {
      type: 'assert', label: 'every drop was shards',
      expr: "return (window.__sqOpen.drops || []).every((d) => d && d.kind === 'shard');",
      equals: true,
    },
    {
      type: 'assert', label: 'shards went up',
      expr: "return window.__sqState().player.coins.shard > 120;", equals: true,
    },
    {
      type: 'assert', label: 'and no material was quietly credited',
      expr: "return window.__sqState().materials.ironwood;", equals: 20,
    },

    // ================================================ 4. the Exchange
    { type: 'eval', label: 'stand at the Exchange', expr: standAt(26, 19) },
    stood,
    { type: 'eval', label: 'walk to the Exchange', expr: openAt('exchange_post') },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'the Exchange stands alone, apart from the Market',
      expr: VISIBLE_TABS, equals: 'EXCHANGE',
    },
    {
      type: 'assert', label: 'the roulette table is there, and admits it is scenery',
      expr: "const r=document.querySelector('.sq-shops-roulette'); return !!r && /for show/i.test(r.textContent);",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-exchange-roulette.png' },
    {
      type: 'eval', label: 'trade 100 shards',
      expr: `
        window.__sqEx = 'pending';
        window.__sqApi.exchange('shard', 'florin', 100).then((j) => { window.__sqEx = j; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the Exchange answered',
      expr: "return window.__sqEx !== 'pending';",
    },
    {
      type: 'assert', label: '100 shards buy 4 florins — 25 to 1, and steep on purpose',
      expr: "return window.__sqEx.ok === true && window.__sqEx.received;", equals: 4,
    },
    {
      type: 'assert', label: 'and exactly 100 shards were taken, not a shard more',
      expr: "return window.__sqEx.spent;", equals: 100,
    },
    {
      type: 'eval', label: 'try to buy shards BACK with florins',
      expr: `
        window.__sqBack = 'pending';
        window.__sqApi.exchange('florin', 'shard', 100).then((j) => { window.__sqBack = j; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the Exchange answered again',
      expr: "return window.__sqBack !== 'pending';",
    },
    {
      type: 'assert', label: 'refused — shards are earned, never bought',
      expr: "return window.__sqBack.ok === false && /never the other way|earned/i.test(window.__sqBack.error || '');",
      equals: true,
    },

    // ================================================ the two outlanders
    {
      type: 'assert', label: 'the mountain chamber is carved and walkable',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          const solid = new Set(C.SOLID_TILES);
          let floor = 0;
          for (let y = C.CAVE.y; y < C.CAVE.y + C.CAVE.h; y += 1) {
            for (let x = C.CAVE.x; x < C.CAVE.x + C.CAVE.w; x += 1) {
              if (!solid.has(w.tiles[y * C.WORLD_W + x])) floor += 1;
            }
          }
          return floor === C.CAVE.w * C.CAVE.h;
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and it sits inside a massif, not a one-tile crust',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const w = window.__sqWorld.getWorld();
          // Two tiles out from the chamber must still be rock. The massif is
          // an irregular blob, not a rectangle, so this is deliberately close
          // in — the far edge wanders on purpose.
          let rock = 0, checked = 0;
          for (let x = C.CAVE.x - 1; x < C.CAVE.x + C.CAVE.w + 1; x += 1) {
            for (const y of [C.CAVE.y - 2, C.CAVE.y + C.CAVE.h + 1]) {
              if (x < 0 || y < 0 || x >= C.WORLD_W || y >= C.WORLD_H) continue;
              checked += 1;
              if (w.tiles[y * C.WORLD_W + x] === C.TILE_TYPES.stone) rock += 1;
            }
          }
          return checked > 0 && rock / checked > 0.8;
        });
      `,
      equals: true,
    },

    // ------------------------------------------------ the NPCs actually exist
    {
      type: 'assert', label: 'a vendor stands at each of the three counters',
      expr: "return window.__sqWorld.getNpcs().map((n) => n.id).sort().join(',');",
      equals: 'exchange,stonemason,woodsman',
    },
    {
      type: 'assert', label: 'each one stands just outside their own building, not inside it',
      expr: `
        // Cross-checked against the SAVE's buildings, not a renderer accessor:
        // the point is that the vendor stands at the building the server placed.
        return import('/shared/constants.js').then((C) => {
          const bs = window.__sqState().buildings;
          return window.__sqWorld.getNpcs().every((n) => {
            const b = bs.find((x) => x.buildingId === n.buildingId);
            if (!b) return false;
            const f = C.BUILDING_FOOTPRINT[b.buildingId];
            return n.y === b.y + f.h && n.x >= b.x && n.x < b.x + f.w;
          });
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and each has real art rather than a missing sprite',
      expr: `
        return import('/web/world/sprites.js').then((m) => {
          const ids = ['exchange', 'woodsman', 'stonemason'];
          return ids.every((id) => {
            const s = m.NPC_SPRITES[id];
            return !!s && s.rows && s.rows.some((r) => /[^.]/.test(r));
          });
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'the mountain and the camp are drawn, not blank ground',
      expr: `
        return import('/web/world/sprites.js').then((m) => {
          // stonemason_camp is intentionally blank — the stone tiles ARE the
          // mountain, and a drawn peak on top of them was one mountain too many.
          return ['woodsman_camp', 'exchange_post'].every((id) => {
            const s = m.SPRITES.buildings[id];
            return !!s && s.rows.some((r) => /[^.]/.test(r));
          });
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and the Stonemason draws NO peak over the stone',
      expr: `
        return import('/web/world/sprites.js').then((m) => {
          const s = m.SPRITES.buildings.stonemason_camp;
          return !s || !s.rows || s.rows.every((r) => !/[^.]/.test(r));
        });
      `,
      equals: true,
    },

    // ================================================ selling to the right man
    {
      type: 'eval', label: 'try to sell STONE to the Woodsman',
      expr: `
        window.__sqWrong = 'pending';
        window.__sqApi.sell('chalkstone', 1, 'woodsman').then((j) => { window.__sqWrong = j; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the server answered',
      expr: "return window.__sqWrong !== 'pending';",
    },
    {
      type: 'assert', label: 'refused — the Woodsman deals in timber only',
      expr: "return window.__sqWrong.ok === false;", equals: true,
    },
    // ---- A REPRICING MUST REACH A SAVE THAT ALREADY HAS STOCK -------------
    //
    // Bruno, 2026-08-31: "I dont see in the game the pricing changes." Stock is
    // rolled once a day and cached in the save WITH ITS PRICES BAKED IN, so the
    // rebalance was invisible to anyone whose shelf had already been filled.
    // `PRICING_VERSION` sits beside the day key: a day alone cannot express
    // "and also whenever the rules change".
    {
      type: 'eval', label: 'read the shop',
      expr: fire('__sqShop', 'window.__sqApi.shops()'),
    },
    answered('__sqShop', 'the shop answered'),
    {
      type: 'assert', label: 'the stale 28-florin offer is gone',
      expr: "const o = window.__sqShop.shops.merchant.offers || []; return o.some((x) => x.offerId === 'stale-1');",
      equals: false,
    },
    {
      // THE SHELF SELLS NO MATERIALS. Bruno, 2026-08-31: "materials which
      // cannot be obtained in this area should not be sold in the shop." It
      // used to roll from ALL of MATERIAL_IDS, so a Home Block scholar could
      // buy Voidshard and Runeplate off a market stall — materials from regions
      // they cannot reach — which made the gates decorative and gathering
      // pointless. Tools and charms only now.
      // THE TRADING POST DOES NOT RESTOCK (Bruno, 2026-08-31). The daily reroll
      // was left over from when the shelf was a random five materials and "come
      // back tomorrow" was the whole shape of the shop. A fixed counter that
      // silently rebuilds itself at midnight is a fact nobody can observe, with
      // a promise in the UI that is no longer true. Offer ids are fixed now;
      // a rerolled shelf keyed them by the day it was rolled.
      type: 'assert', label: 'the counter carries fixed stock, not a daily roll',
      expr: `
        const o = window.__sqShop.shops.merchant.offers || [];
        return o.length > 0 && o.every((x) => /^merchant_(tool|charm)_/.test(x.id));
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and nothing on it ever sells out',
      expr: "return (window.__sqShop.shops.merchant.offers || []).some((x) => x.sold || x.soldOut);",
      equals: false,
    },
    {
      type: 'assert', label: 'the Merchant sells no materials at all',
      expr: `
        const o = window.__sqShop.shops.merchant.offers || [];
        if (!o.length) return 'no stock';
        return o.every((x) => x.kind === 'tool' || x.kind === 'charm');
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and he does carry both a replacement axe and a charm',
      expr: `
        const o = window.__sqShop.shops.merchant.offers || [];
        return o.some((x) => x.toolId === 'axe') && o.some((x) => x.charmId);
      `,
      equals: true,
    },
    {
      // The charms are meant to be dear — they are the only permanent upgrade
      // money buys, and a new purse holds 25.
      type: 'assert', label: 'a charm costs more than a new purse holds',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const o = window.__sqShop.shops.merchant.offers || [];
          const dear = o.filter((x) => x.charmId && x.price > C.STARTING_FLORINS);
          return dear.length > 0;
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'the Market buys ironwood five for one',
      expr: `
        const b = (window.__sqShop.shops.merchant.buys || []).find((x) => x.materialId === 'ironwood');
        return b ? (b.per + '/' + b.pay) : 'missing';
      `,
      equals: '5/1',
    },
    {
      type: 'assert', label: 'and a sapling costs one florin',
      expr: "const p = window.__sqShop.shops.merchant.nursery.offers[0].price; return typeof p === 'number' ? p : p.florin;",
      equals: 1,
    },

    // ---- BUY / SELL, AND THE SILVER KEY ------------------------------------
    //
    // Bruno, 2026-09-02: "I dont see the silver key option to buy" and "the
    // sell system should be like the buy buttons instead of a scroll menu."
    //
    // The key was a real bug and a nasty one: the SERVER put it on the counter
    // correctly, and `normShops` on the client threw it away — its filter kept
    // only offers with a material, tool or charm id, and a QUEST ITEM has none
    // of those. It failed silently, after the hard part had worked.
    {
      type: 'eval', label: 'stand at the Trading Post',
      expr: standAt(26, 19),
    },
    stood,
    {
      type: 'eval', label: 'reach the level the key appears at',
      expr: fire('__sqLvl15', `fetch('/api/dev/grant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 15 }),
      }).then((r) => r.json()).then(() => window.__sqApi.setActiveSlot(1))`),
    },
    answered('__sqLvl15', 'level granted'),
    {
      type: 'eval', label: 'open the Trading Post',
      expr: "window.__sqPanels.shops.openAt('trading_post'); return 'opened';",
    },
    { type: 'wait', ms: 1200 },
    {
      type: 'assert', label: 'the panel offers BUY and SELL as two buttons',
      expr: `
        const ms = [...document.querySelectorAll('.sq-shops-mode')].map((b) => (b.textContent || '').trim());
        return ms.join(',');
      `,
      equals: 'BUY,SELL',
    },
    {
      type: 'assert', label: 'and the Silver Key is ON THE COUNTER, not swallowed',
      expr: "return /Silver Key/i.test(document.querySelector('.sq-shops-body, .sq-shops-panel').textContent);",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-post-buy.png' },
    {
      type: 'eval', label: 'switch to SELL',
      expr: "const b = [...document.querySelectorAll('.sq-shops-mode')].find((x) => /SELL/i.test(x.textContent||'')); b.click(); return 'sell';",
    },
    { type: 'wait', ms: 700 },
    {
      // Cards, not a dropdown. Every material he takes gets one, whether or not
      // you are carrying any — the counter should say what he wants before you
      // have it.
      type: 'assert', label: 'the sell side is cards with SELL buttons, not a picker',
      expr: `
        const cards = [...document.querySelectorAll('.sq-shops-offer')];
        const sells = cards.filter((c) => /SELL/i.test((c.textContent || '')));
        const picker = document.querySelector('.sq-shops-select');
        if (picker) return 'still a dropdown';
        return cards.length >= 4 && sells.length === cards.length;
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and Wild Tuna is one of them, at four for one',
      expr: `
        const t = [...document.querySelectorAll('.sq-shops-offer')]
          .find((c) => /Wild Tuna/i.test(c.textContent || ''));
        return !!t && /4 for/i.test(t.textContent || '');
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v5-post-sell.png' },
    { type: 'key', key: 'Escape', label: 'close the Post' },
    { type: 'wait', ms: 500 },

    // ---- THE COUNTER IS INSIDE THE CAVE ------------------------------------
    //
    // Bruno, 2026-08-31: "the stonemason npc can be interacted with from
    // outside the cave." His building is the MOUNTAIN, anchored at CAVE.y - 2
    // in the rock above the chamber, and reach was footprint-plus-one — so its
    // margin spilled out onto the hillside and you could trade with him without
    // ever going in. 54,33 is on that hillside, two tiles above the mountain's
    // anchor and nowhere near the chamber.
    {
      type: 'eval', label: 'stand on the hillside ABOVE the mountain',
      expr: standAt(54, 33),
    },
    stood,
    {
      type: 'eval', label: 'try to sell from out there',
      expr: `
        window.__sqOutside = 'pending';
        window.__sqApi.sell('chalkstone', 7, 'stonemason').then((j) => { window.__sqOutside = j; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the server answered from the hillside',
      expr: "return window.__sqOutside !== 'pending';",
    },
    {
      type: 'assert', label: 'the Stonemason is NOT reachable from outside his cave',
      expr: "return window.__sqOutside.ok === false;", equals: true,
    },
    {
      type: 'assert', label: 'and the world offers no counter prompt out there either',
      expr: "return window.__sqWorld.getPrompts().join(' | ').indexOf('stonemason') === -1;",
      equals: true,
    },
    {
      type: 'eval', label: 'stand in the mountain chamber',
      expr: standAt(54, 36),
    },
    stood,
    {
      type: 'eval', label: 'sell the Stonemason his stone',
      expr: `
        window.__sqStone = 'pending';
        window.__sqApi.sell('chalkstone', 7, 'stonemason').then((j) => { window.__sqStone = j; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the Stonemason answered',
      expr: "return window.__sqStone !== 'pending';",
    },
    {
      type: 'assert', label: 'he bought it, in florins',
      expr: "return window.__sqStone.ok === true && window.__sqStone.earned > 0;",
      equals: true,
    },
    {
      type: 'assert', label: 'and he pays over the town rate',
      expr: `
        return fetch('/api/shops').then((r) => r.json()).then((j) => {
          const s = j.shops || j;
          const c = (s.stonemason.buys || []).find((b) => b.materialId === 'chalkstone');
          if (!c) return false;
          // BETTER VALUE, measured as units-per-florin — the outlander's lot is
          // bigger AND pays more, so comparing bare numbers proves nothing.
          return (c.per / c.pay) < (c.townPer / c.townPay);
        });
      `,
      equals: true,
    },
    {
      type: 'eval', label: 'try to sell him TIMBER',
      expr: `
        window.__sqWrong2 = 'pending';
        window.__sqApi.sell('ironwood', 1, 'stonemason').then((j) => { window.__sqWrong2 = j; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the server answered',
      expr: "return window.__sqWrong2 !== 'pending';",
    },
    {
      type: 'assert', label: 'refused — stone only, and the message says so',
      expr: "return window.__sqWrong2.ok === false && /stone only/i.test(window.__sqWrong2.error || '');",
      equals: true,
    },
  ],
};
