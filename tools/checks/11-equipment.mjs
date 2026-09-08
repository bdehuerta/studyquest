// tools/checks/11-equipment.mjs — the two equipment slots, end to end.
//
// WHY THIS SUITE EXISTS
//
// The rule the whole feature rests on is: THE WORLD KEYS OFF WHAT IS EQUIPPED,
// NEVER OFF WHAT IS IN THE BAG. That rule is invisible to an API test — the
// server happily reports `equipped` while the canvas still offers to chop with
// an axe that is sitting in the pack, which is exactly the shape of bug this
// project keeps shipping (see the note at the top of 10-plantings.mjs).
//
// So this suite asserts the PROMPTS THE PLAYER IS ACTUALLY SHOWN, read out of
// the renderer's own per-frame list, while moving the same objects between the
// bag and the slots. It also drives the 1 / 2 keys and clicks the HUD, because
// those are two different routes into one piece of state and either can rot.
//
// The scene: the scholar stands at 20,19 facing DOWN at a live tree at 20,20,
// owning an axe and three saplings, with BOTH SLOTS EMPTY. That is the state
// where every wrong implementation gives itself away — an empty-handed player
// standing in front of a tree must not be offered "E chop".

const NOW = Date.now();

// WHERE THE SCHOLAR STANDS
//
// The tile map is generated from noise in web/world/world.js and knows nothing
// about the save, so a tree cannot be seeded — `state.harvested` records
// DEPLETED nodes only. These coordinates are a real tree in the generated Home
// Block, found by scanning the live world once and pinned here because the
// generator is deterministic.
//
// If world generation ever changes, the "facing a real tree" assertion below
// fails immediately and by name. Re-scan and update these two numbers; do not
// delete the assertion.
const TREE_X = 23;
const TREE_Y = 24;

// NOTE: there is no seeded tree in `harvested` on purpose.
//
// `state.harvested` records DEPLETED nodes only — putting a fresh tree in it
// does not create one, because the tile map itself is generated from noise in
// web/world/world.js and knows nothing about the save. The suite therefore
// finds a real tree at run time and stands the scholar on the tile above it.
function seedSave() {
  return {
    player: {
      name: 'Quartermaster', level: 4, xp: 0, xpToNext: 500,
      x: TREE_X, y: TREE_Y - 1,
      coins: { focus: 50, insight: 50, grind: 50, spark: 50 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 100, maxEnergy: 100,
      gatherTools: [{ uid: 'axe-1', toolId: 'axe', durability: 60, maxDurability: 60 }],
      // BOTH EMPTY, and `activeGatherTool` null — this save owns an axe and
      // holds nothing. The migration must not helpfully fill slot 1 from the
      // bag, or the first assertion below silently stops testing anything.
      activeGatherTool: null,
      equipped: [null, null],
      activeSlot: 0,
      saplings: 3,
    },
    materials: { ironwood: 0, chalkstone: 0, seedpod: 0 },
    tools: [],
    // Far from 20,19 — a building you stand beside wins over both prompts.
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 25, y: 12 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 29, y: 12 },
      { uid: 'seed-archive', buildingId: 'archive', x: 25, y: 15 },
    ],
    // One building crafted and not yet raised. It exists so the Bag can be
    // asserted NOT to show it — an empty list would pass either way.
    pendingBuildings: ['forge'], tasks: [], sessions: [], log: [],
    harvested: {},
    blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
  };
}

/** The prompts drawn on the last frame, joined — the player's-eye view. */
const PROMPTS = "return window.__sqWorld.getPrompts().join(' | ');";

/**
 * The harness's `assert` step only knows `equals`, so a substring check has to
 * come back as a boolean. These two keep the intent readable at the call site.
 */
const promptHas = (text) =>
  `return window.__sqWorld.getPrompts().join(' | ').indexOf(${JSON.stringify(text)}) !== -1;`;
const promptLacks = (text) =>
  `return window.__sqWorld.getPrompts().join(' | ').indexOf(${JSON.stringify(text)}) === -1;`;

/** The live server state, which the client mirrors onto the window. */
const PLAYER = "return window.__sqState().player;";

/**
 * Equip through the app's OWN api client, not a raw fetch.
 * A raw fetch would move the server and leave the client's copy of state
 * behind — a split no player can produce, and one that would make every
 * assertion below about the canvas meaningless.
 *
 * These FIRE the call and stash the outcome on `window.__sqEquip` rather than
 * returning the promise. Returning it makes the harness use CDP's awaitPromise,
 * and a page left slow by an earlier browser suite then hangs the whole run for
 * 30s (see the note on orphaned tabs in tools/lib/cdp.mjs). Firing and then
 * WAITING FOR THE RESULT is both immune to that and a truer test: it asserts
 * the state the player would actually end up in.
 */
function fire(js) {
  return `window.__sqEquip = 'pending'; ${js}
    .then((j) => { window.__sqEquip = j.ok ? 'ok' : ('FAILED: ' + j.error); },
          (e) => { window.__sqEquip = 'THREW: ' + e.message; });
    return 'sent';`;
}

const settled = {
  type: 'waitFor', timeoutMs: 8000, label: 'the server answered',
  expr: "if (window.__sqEquip === 'pending') return false; if (window.__sqEquip !== 'ok') throw new Error(window.__sqEquip); return true;",
};

function equip(slot, ref) {
  return fire(`window.__sqApi.equipSlot(${slot}, ${JSON.stringify(ref)})`);
}

function clearSlot(slot) {
  return fire(`window.__sqApi.clearSlot(${slot})`);
}

export default {
  name: 'equipment — two slots drive every world prompt',

  // ORDER 15 — deliberately EARLY, before 02-play.
  //
  // This suite is not order-sensitive on its own: it passes alone and after
  // 03/04/05. It becomes flaky only when it runs AFTER 02-play, and then the
  // stall wanders between steps (a plain in-page fetch left pending, a CDP
  // evaluate timing out at 30s) while every probe says the page itself is
  // healthy — the scholar has not moved, no requests are queued, the slowest
  // resource is 4ms. That is the orphaned-tab pathology already described in
  // tools/lib/cdp.mjs: every suite reuses one Chrome target. Running earlier
  // sidesteps it without weakening a single assertion. See BACKLOG.md.
  order: 15,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': seedSave(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Quartermaster', createdAt: 1750000000000, lastPlayedAt: 1750000000000,
      playtimeMs: 60000, level: 4, tasksDone: 0, tasksTotal: 0, savedAt: 1750000000000,
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
    { type: 'wait', ms: 1200, label: 'let the camera settle' },
    {
      type: 'assert', label: 'the scholar is now facing a real tree',
      expr: "const n = window.__sqWorld.getFacingNode(); return n && n.nodeType;",
      equals: 'tree',
    },

    // ------------------------------------------- what the migration hands over
    // A save that owns saplings and holds nothing gets the SEEDS put in hand,
    // and nothing else. That is deliberate: before slots existed, merely owning
    // saplings was enough to plant, so an old save that arrived empty-handed
    // would silently lose planting. The AXE is NOT auto-equipped — owning a
    // tool has never been the same as holding it.
    {
      type: 'assert', label: 'the migration puts seeds in hand and leaves the axe in the bag',
      expr: "return JSON.stringify(window.__sqWorld.getEquipment());",
      equals: '[{"kind":"seed","itemId":"sapling"},null]',
    },
    {
      type: 'eval', label: 'empty both hands to test the bare case',
      expr: clearSlot(1),
    },
    settled,
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'both slots are now empty',
      expr: "return JSON.stringify(window.__sqWorld.getEquipment());",
      equals: '[null,null]',
    },

    // --------------------------------- EMPTY HANDS: no action is offered at all
    {
      type: 'assert',
      label: 'facing a tree with the axe IN THE BAG offers no chop, only a reminder',
      expr: promptHas('equip your axe'), equals: true,
    },
    {
      type: 'assert', label: 'and that reminder is NOT the gold "E chop" prompt',
      expr: promptLacks('E  chop'), equals: true,
    },
    {
      type: 'assert', label: 'holding saplings in the bag offers no planting either',
      expr: promptLacks('plant'), equals: true,
    },
    { type: 'key', key: 'e', label: 'press E with empty hands' },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'the tree is untouched — an empty hand cannot chop',
      expr: "const n = window.__sqWorld.getFacingNode(); const h = window.__sqState().harvested[n.x + ',' + n.y]; return h ? h.hitsLeft : 'untouched';",
      equals: 'untouched',
    },

    // ------------------------------------------------ equip the axe into slot 1
    { type: 'eval', label: 'put the axe in slot 1', expr: equip(1, { kind: 'tool', itemId: 'axe', uid: 'axe-1' }) },
    settled,
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'NOW the world offers the chop',
      expr: promptHas('E  chop'), equals: true,
    },
    { type: 'key', key: 'e', label: 'press E with the axe in hand' },
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'the tree took the hit',
      expr: "const n = window.__sqWorld.getFacingNode(); return !!window.__sqState().harvested[n.x + ',' + n.y];",
      equals: true,
    },

    // ------------------------------------------------ seeds into slot 2
    { type: 'eval', label: 'put saplings in slot 2', expr: equip(2, { kind: 'seed', itemId: 'sapling' }) },
    settled,
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'both slots are filled, and by different things',
      expr: "const e = window.__sqWorld.getEquipment(); return e[0].kind + '+' + e[1].kind;",
      equals: 'tool+seed',
    },
    {
      type: 'assert', label: 'slot 1 is still the selected one, so the chop stands',
      expr: promptHas('E  chop'), equals: true,
    },

    // ------------------------------------------- ONLY THE SELECTED SLOT ACTS
    //
    // This replaced an assertion that read "the chop prompt survives a second
    // slot being filled". That WAS the rule, and it was the wrong one: with
    // both slots live, selecting a slot was a tie-break and nothing more, so an
    // axe in slot 2 chopped while slot 1 was selected. The rule now is that the
    // active slot is the only one in your hands. The old assertion is not
    // deleted, it is INVERTED — if anyone widens equippedRefs() back to two
    // slots, this block is what stops them.
    { type: 'key', key: '2', label: 'press 2 to select the saplings' },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'the active slot followed the key, on the server too',
      expr: "return window.__sqWorld.getActiveSlot();", equals: 1,
    },
    {
      type: 'assert', label: 'the axe is STOWED — no chop is offered any more',
      expr: promptLacks('E  chop'), equals: true,
    },
    {
      type: 'assert', label: 'and the hint names the one key that would fix it',
      expr: promptHas('press 1 for your axe'), equals: true,
    },
    {
      type: 'assert', label: 'the HUD dims the stowed slot, not merely un-golds it',
      expr: "const c = document.querySelectorAll('.sq-hud-slot'); const st = [...c].map((n,i)=>n.classList.contains('sq-hud-slotstowed')?i:-1).filter(i=>i>=0); return st.join(',');",
      equals: '0',
    },
    {
      type: 'assert', label: 'and the dimming is real, measured, not just a class',
      expr: "const n = document.querySelectorAll('.sq-hud-slot')[0]; return parseFloat(getComputedStyle(n).opacity) < 0.9;",
      equals: true,
    },

    // The SERVER has to agree, or a client-only fix passes this suite while the
    // stowed axe still swings for anyone who calls the api directly.
    {
      type: 'eval', label: 'ask the server to chop with the stowed axe',
      expr: "window.__sqChop = 'pending'; const n = window.__sqWorld.getFacingNode();"
        + " window.__sqApi.gather(n.x, n.y, n.nodeType)"
        + ".then((j) => { window.__sqChop = j.ok ? 'ALLOWED' : j.error; },"
        + " (e) => { window.__sqChop = 'THREW: ' + e.message; }); return 'sent';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the server answered the chop',
      expr: "return window.__sqChop !== 'pending';",
    },
    {
      type: 'assert', label: 'the server refuses a swing with a stowed tool',
      expr: "return window.__sqChop !== 'ALLOWED';", equals: true,
    },
    {
      type: 'assert', label: 'and its refusal names the slot to press',
      expr: "return /slot 1/.test(String(window.__sqChop)) && /press 1/.test(String(window.__sqChop));",
      equals: true,
    },
    { type: 'key', key: '1', label: 'press 1 to take the axe back out' },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'and back again',
      expr: "return window.__sqWorld.getActiveSlot();", equals: 0,
    },
    {
      type: 'assert', label: 'the chop returns with the axe selected',
      expr: promptHas('E  chop'), equals: true,
    },

    // ---- 1 AND 2 SELECT. THEY DO NOT USE. (Bruno, 2026-08-31) --------------
    // Pressing the number of the slot you are ALREADY on used to swing the tool
    // or plant the seed, so 1 and 2 were a select key and a use key at once,
    // depending on hidden state — press 1 meaning "switch back" and you felled
    // a tree instead. E is the use key now, and the only one.
    {
      type: 'eval', label: 'note how far into the tree we are',
      expr: "const n = window.__sqWorld.getFacingNode(); const h = window.__sqState().harvested[n.x + ',' + n.y]; window.__sqHits = h ? h.hitsLeft : 'untouched'; return String(window.__sqHits);",
    },
    { type: 'key', key: '1', label: 'press 1 AGAIN, on the already-selected axe' },
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'the tree is untouched — 1 selects, it does not swing',
      expr: "const n = window.__sqWorld.getFacingNode(); const h = window.__sqState().harvested[n.x + ',' + n.y]; return (h ? h.hitsLeft : 'untouched') === window.__sqHits;",
      equals: true,
    },
    {
      type: 'assert', label: 'and it is still slot 1 that is selected',
      expr: "return window.__sqWorld.getActiveSlot();", equals: 0,
    },
    {
      type: 'assert', label: 'E still works — that is where using lives now',
      expr: promptHas('E  chop'), equals: true,
    },
    { type: 'key', key: 'e', label: 'press E' },
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'E took the hit that 1 refused to',
      expr: "const n = window.__sqWorld.getFacingNode(); const h = window.__sqState().harvested[n.x + ',' + n.y]; return (h ? h.hitsLeft : 'untouched') !== window.__sqHits;",
      equals: true,
    },

    // ---- E CLOSES AN OPEN PANEL (Bruno, 2026-08-31) ------------------------
    // "if I click E again while its open it should also close." The scholar is
    // still facing the tree here, which is the point: the same keypress used to
    // fall through to the gather branch, so dismissing a shop chopped whatever
    // was standing behind it. Both halves are asserted.
    { type: 'key', key: 'Tab', label: 'open a panel over the world' },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'the panel is up',
      expr: "return window.__sqPanels.inventory.isOpen();", equals: true,
    },
    {
      type: 'eval', label: 'note the tree again',
      expr: "const n = window.__sqWorld.getFacingNode(); const h = window.__sqState().harvested[n.x + ',' + n.y]; window.__sqHits2 = h ? h.hitsLeft : 'untouched'; return String(window.__sqHits2);",
    },
    { type: 'key', key: 'e', label: 'press E with the panel open' },
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'E closed the panel',
      expr: "return window.__sqPanels.inventory.isOpen();", equals: false,
    },
    {
      type: 'assert', label: 'and did NOT chop the tree behind it',
      expr: "const n = window.__sqWorld.getFacingNode(); const h = window.__sqState().harvested[n.x + ',' + n.y]; return (h ? h.hitsLeft : 'untouched') === window.__sqHits2;",
      equals: true,
    },
    {
      type: 'assert', label: 'and E still works once nothing is covering the world',
      expr: promptHas('E  chop'), equals: true,
    },

    // ------------------------------------------------ the HUD shows both slots
    {
      type: 'assert', label: 'the banner draws exactly two slots',
      expr: "return document.querySelectorAll('.sq-hud-slot').length;", equals: 2,
    },
    {
      type: 'assert', label: 'and names what is in them',
      expr: "return /AXE/.test([...document.querySelectorAll('.sq-hud-slot .sq-hud-toolname')].map(n=>n.textContent).join('/'));",
      equals: true,
    },
    {
      type: 'assert', label: 'exactly one slot is marked active',
      expr: "return document.querySelectorAll('.sq-hud-slot.sq-hud-slotactive').length;", equals: 1,
    },
    {
      type: 'eval', label: 'click the second slot in the banner',
      expr: "document.querySelectorAll('.sq-hud-slot')[1].click(); return 'clicked';",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'clicking the HUD moves the active slot too',
      expr: "return window.__sqWorld.getActiveSlot();", equals: 1,
    },

    // ------------------------------------------------ taking things back out
    //
    // The HUD click above left slot 2 selected, and with only the selected slot
    // live the chop prompt is ALREADY gone. Emptying slot 1 from there would
    // "pass" the next assertion without testing anything, so select slot 1 back
    // first and watch the prompt actually die with the axe.
    { type: 'key', key: '1', label: 'select slot 1 again' },
    { type: 'wait', ms: 700 },
    {
      type: 'assert', label: 'the chop is on offer again before we take the axe away',
      expr: promptHas('E  chop'), equals: true,
    },
    {
      type: 'eval', label: 'empty slot 1',
      expr: clearSlot(1),
    },
    settled,
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'the chop prompt goes away with the axe',
      expr: promptLacks('E  chop'), equals: true,
    },

    // ------------------------------------------------ the Bag
    { type: 'key', key: 'Tab', label: 'open the Bag' },
    { type: 'wait', ms: 700 },
    {
      // FIVE NOW: QUESTS leads, because "what am I supposed to be doing" is the
      // question a player opens the Bag with most often.
      type: 'assert', label: 'the Bag has its five tabs, quests first',
      expr: "return [...document.querySelectorAll('.sq-theme-tab')].map(b=>b.textContent.trim()).join(',');",
      equals: 'QUESTS,ITEMS,GEAR,RELICS,DARK BOXES',
    },
    {
      type: 'assert', label: 'ITEMS carries the slot buttons for the axe',
      expr: "return document.querySelectorAll('.sq-inv-slotbtn').length > 0;", equals: true,
    },
    {
      type: 'assert', label: 'and saplings are visible in the bag at last',
      expr: "return /Saplings/.test(document.querySelector('.sq-inv-body').textContent);", equals: true,
    },

    // ---- BUILDINGS ARE NOT ITEMS (Bruno, 2026-08-31) ------------------------
    // The save above holds one unraised Forge. It must not appear in the Bag:
    // a building is raised, not carried. The list and its PLACE button moved to
    // the crafting bench — and that button was the ONLY route into build mode,
    // so the second assertion below is what stops the removal from stranding a
    // building the player has already paid for.
    {
      type: 'assert', label: 'the save really does hold an unraised building',
      expr: "return (window.__sqState().pendingBuildings || []).join(',');", equals: 'forge',
    },
    {
      type: 'assert', label: 'and the Bag does not list it — no BUILDINGS section',
      expr: "return /BUILDINGS/i.test(document.querySelector('.sq-inv-body').textContent);",
      equals: false,
    },
    {
      // Scoped to BUILDINGS on purpose: the Bag still has a PLACE button, for
      // BLOCKS, and blocks really are carried. What must be gone is a row that
      // offers to place a building.
      type: 'assert', label: 'and no row in the bag offers to place the Forge',
      expr: "return [...document.querySelectorAll('.sq-inv-row')].some(r => /forge/i.test(r.textContent || '') && [...r.querySelectorAll('button')].some(b => /place/i.test(b.textContent || '')));",
      equals: false,
    },
    { type: 'key', key: 'Escape', label: 'close the Bag' },
    { type: 'wait', ms: 500 },
    {
      type: 'eval', label: 'open the crafting bench at the Study Hut',
      expr: "window.__sqPanels.craft.openAt('study_hut'); return 'opened';",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'the bench offers the Forge to raise',
      expr: "const b = document.querySelector('.sq-craft-pending'); return !!b && /READY TO RAISE/.test(b.textContent) && /Forge/i.test(b.textContent);",
      equals: true,
    },
    {
      // Crafting is PARKED, not deleted (backlog item 15 brings it back with
      // item tiers). The pending-buildings list has to survive the placeholder,
      // because it is the only route to raising a building you already paid for
      // — which is the assertion below.
      type: 'assert', label: 'the bench says crafting is rolling out in future updates',
      expr: "const b = document.querySelector('.sq-craft-body') || document.body; return /ROLLING OUT IN FUTURE UPDATES/i.test(b.textContent);",
      equals: true,
    },
    {
      type: 'assert', label: 'and no recipe cards are offered while it is parked',
      expr: "return document.querySelectorAll('.sq-craft-card').length;", equals: 0,
    },
    {
      type: 'assert', label: 'with a working PLACE button — build mode still has a door',
      expr: "return [...document.querySelectorAll('.sq-craft-pending button')].some(b => /place/i.test(b.textContent || ''));",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-bench-pending.png' },
    { type: 'key', key: 'Escape', label: 'close the bench' },
    { type: 'wait', ms: 500 },
    { type: 'key', key: 'Tab', label: 'back into the Bag' },
    { type: 'wait', ms: 700 },
    {
      type: 'eval', label: 'put the axe back in slot 1 from the Bag',
      expr: "const rows=[...document.querySelectorAll('.sq-inv-row')];const row=rows.find(r=>/axe/i.test(r.textContent));if(!row) return 'no axe row';const b=row.querySelectorAll('.sq-inv-slotbtn')[0];if(!b) return 'no slot button';b.click();return 'clicked';",
    },
    { type: 'wait', ms: 800 },
    {
      type: 'assert', label: 'the Bag button really equipped it',
      expr: "const e = window.__sqWorld.getEquipment(); return e[0] && e[0].uid;",
      equals: 'axe-1',
    },
    { type: 'screenshot', file: 'v5-bag-items.png' },

    // ------------------------------------------------ the paper-doll
    {
      type: 'eval', label: 'open the GEAR tab',
      expr: "const t=[...document.querySelectorAll('.sq-theme-tab')].find(b=>/GEAR/.test(b.textContent));if(!t) return 'no gear tab';t.click();return 'clicked';",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'the paper-doll is drawn',
      expr: "return !!document.querySelector('.sq-inv-doll');", equals: true,
    },
    {
      type: 'assert', label: 'every declared doll slot has a cell',
      expr: `
        return import('/shared/constants.js').then((m) =>
          document.querySelectorAll('.sq-inv-dollslot').length === m.DOLL_SLOTS.length);
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'the hand slots show what is actually equipped',
      expr: "return /axe/i.test(document.querySelector('.sq-inv-doll').textContent);", equals: true,
    },
    {
      type: 'assert', label: 'the figure drew the real player sprite, not a fallback glyph',
      expr: "const c = document.querySelector('.sq-inv-dollfig canvas'); return !!c && c.width > 0;",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-gear-doll.png' },

    // ------------------------------------ an empty slot SURVIVES a reload
    //
    // Bruno: "when I put away the saplings and go back to the menu, its not
    // saved. they appear again." The fold-forward migration was written as a
    // plain rule instead of a one-time step, so every boot put the seeds back
    // in hand — the game undoing a choice the player had just made. Putting
    // something down is a decision and must persist like any other.
    {
      type: 'eval', label: 'put the saplings away',
      expr: fire('window.__sqApi.clearSlot(2)'),
    },
    settled,
    {
      type: 'assert', label: 'slot 2 is empty before leaving',
      expr: "return window.__sqWorld.getEquipment()[1];", equals: null,
    },
    { type: 'wait', ms: 600, label: 'let the save land' },
    // A browser reload is NOT enough: the server holds state in memory, so
    // nothing re-migrates and the bug cannot show. Restarting against the same
    // data dir is what actually happens when Bruno quits the app and reopens
    // it, and it is the only way this assertion means anything.
    { type: 'restart', label: 'quit the app and reopen it' },
    { type: 'navigate', url: '/', label: 'come back to the menu' },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the boot overlay clears',
      expr: "const b = document.getElementById('boot'); return !b || b.classList.contains('hidden');",
    },
    {
      // Same robust entry as the first one — the launch panel leads with PLAY
      // and lists saves only afterwards, and clicking "whatever is there right
      // now" races both renders.
      type: 'waitFor', timeoutMs: 15000, label: 'load the save again',
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
    {
      type: 'waitFor', timeoutMs: 10000, label: 'the title screen steps aside',
      expr: "const r=document.querySelector('.sq-launch-root'); return !r || r.hidden;",
    },
    { type: 'wait', ms: 1200, label: 'let the camera settle' },
    {
      type: 'assert', label: 'the saplings STAYED put away',
      expr: "return JSON.stringify(window.__sqWorld.getEquipment()[1]);", equals: 'null',
    },
    {
      type: 'assert', label: 'and the axe is still in slot 1 — nothing else was disturbed',
      expr: "const e = window.__sqWorld.getEquipment(); return e[0] && e[0].uid;",
      equals: 'axe-1',
    },
    {
      type: 'assert', label: 'the plant prompt is gone with the seeds',
      expr: promptLacks('plant'), equals: true,
    },
  ],
};
