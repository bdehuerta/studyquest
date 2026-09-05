// tools/checks/14-cave.mjs — the mountain, and the roof that lifts when you enter.
//
// WHY THIS SUITE EXISTS
//
// The Stonemason's chamber is real walkable floor cut into a stone massif. Draw
// nothing over it and the "cave" is an open-topped pit in a hillside: you can
// see the whole interior from outside, and stepping in changes nothing. What
// makes it an interior is the rock ON TOP, and that rock fading as you walk
// under it.
//
// None of that is visible to a test that only checks the API. So this walks in
// through the mouth ON THE KEYBOARD and watches the roof lift.
//
// The save is seeded AT the mouth rather than moved there mid-run: the client
// caches state at boot and the renderer starts from that cache, so moving the
// server alone leaves the scholar standing where the page already thought they
// were. Seeding a position is reliable; repositioning is not.

const NOW = Date.now();
const MOUTH_X = 49;
const MOUTH_Y = 37;

function save() {
  return {
    player: {
      name: 'Spelunker', level: 6, xp: 0, xpToNext: 900,
      x: MOUTH_X, y: MOUTH_Y,
      coins: { florin: 200, shard: 0 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 110, maxEnergy: 110,
      gatherTools: [], activeGatherTool: null,
      equipped: [null, null], activeSlot: 0, equipMigrated: true, saplings: 0, pity: 0,
      // Owns a lantern, WEARING NOTHING. The dark is tested first, then the
      // light — a save that starts with it on could not show the difference.
      ownedCharms: ['lantern_charm'], charms: [null, null],
    },
    // 14 stone = two full lots of 7, the outlander's common bundle.
    materials: { chalkstone: 14, ironwood: 4 },
    tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
      { uid: 'seed-archive', buildingId: 'archive', x: 22, y: 20 },
      { uid: 'seed-exchange', buildingId: 'exchange_post', x: 26, y: 20 },
      { uid: 'seed-woodsman', buildingId: 'woodsman_camp', x: 8, y: 38 },
      { uid: 'seed-stonemason', buildingId: 'stonemason_camp', x: 52, y: 34 },
    ],
    // These vendors are LOCKED for a new save (see 15-outlanders). This suite
    // is about their PRICES and their refusals-by-material, not about their
    // doors, so it seeds them open rather than doing the unlock quest first.
    questItems: {}, vendorsUnlocked: ['woodsman', 'stonemason'], questsDone: [],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
    meta: { slot: 1, name: 'Spelunker', createdAt: NOW, lastPlayedAt: NOW, playtimeMs: 1000 },
  };
}

export default {
  name: 'the mountain — a chamber you walk into, with rock overhead',
  order: 18,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': save(),
    'Slot 1/meta.json': {
      slot: 1, name: 'Spelunker', createdAt: NOW, lastPlayedAt: NOW,
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
    { type: 'wait', ms: 1400, label: 'let the camera settle' },
    {
      // NO MUSIC IN THE WORLD. The other half of the pair asserted in
      // 12-continue-slot: the menu asks for it, entering the world asks for it
      // to stop. This suite is already past the launch screen, so it is the
      // natural place to check the world is silent.
      type: 'assert', label: 'the menu music is not wanted once the world is up',
      expr: "return window.__sqMusic().probe().wanted;", equals: false,
    },
    {
      type: 'assert', label: 'the scholar starts at the mouth of the cave',
      expr: "const t = window.__sqWorld.getPlayerTile(); return t.x + ',' + t.y;",
      equals: `${MOUTH_X},${MOUTH_Y}`,
    },
    {
      type: 'assert', label: 'standing outside, the rock overhead is solid',
      expr: "return window.__sqWorld.isInCave() === false && window.__sqWorld.getRoofAlpha() > 0.9;",
      equals: true,
    },
    { type: 'screenshot', file: 'v5-mountain-outside.png' },

    // ------------------------------------------------------------ walk in
    { type: 'hold', key: 'd', ms: 2600, label: 'walk east into the mountain' },
    { type: 'wait', ms: 1400, label: 'let the roof finish lifting' },
    {
      type: 'assert', label: 'the corridor let us through — we are in the chamber',
      expr: "return window.__sqWorld.isInCave();", equals: true,
    },
    {
      type: 'assert', label: 'and the roof lifted, so you can see where you are',
      expr: "return window.__sqWorld.getRoofAlpha() < 0.2;", equals: true,
    },
    { type: 'screenshot', file: 'v5-mountain-inside.png' },

    // ---- THE CAVE IS DARK, AND A LANTERN IS THE ANSWER --------------------
    //
    // Bruno, 2026-08-31: "the cave should be dark, and with the lantern you can
    // craft equipped you should be able to see in a circular area around the
    // player in the darkness, like fire light."
    //
    // The darkness eases in rather than snapping, so this waits for it the same
    // way the roof assertions do.
    {
      type: 'waitFor', timeoutMs: 6000, label: 'the chamber goes dark',
      expr: "return window.__sqWorld.getLightProbe().darkness > 0.5;",
    },
    {
      type: 'assert', label: 'and with no charm worn there is no light at all',
      expr: "return window.__sqWorld.getLightProbe().lightTiles;", equals: 0,
    },
    { type: 'screenshot', file: 'v5-cave-dark.png' },
    {
      // NOT pitch black on purpose: the Stonemason lives down here, and a
      // player who cannot see the way out of the room they walked into has been
      // punished rather than challenged.
      type: 'assert', label: 'dark, but not absolutely black',
      expr: "return window.__sqWorld.getLightProbe().darkness < 1;", equals: true,
    },
    {
      type: 'eval', label: 'put the lantern on',
      expr: "window.__sqCharm = 'pending'; window.__sqApi.wearCharm(1, 'lantern_charm').then((j) => { window.__sqCharm = j; }, (e) => { window.__sqCharm = { ok: false, error: e.message }; }); return 'sent';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the lantern is on',
      expr: "if (window.__sqCharm === 'pending') return false; if (!window.__sqCharm.ok) throw new Error(window.__sqCharm.error); return true;",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'now it throws a circle of firelight',
      expr: "return window.__sqWorld.getLightProbe().lightTiles > 0;", equals: true,
    },
    { type: 'screenshot', file: 'v5-cave-lantern.png' },
    {
      type: 'assert', label: 'and the chamber is still dark OUTSIDE that circle',
      expr: "return window.__sqWorld.getLightProbe().darkness > 0.5;", equals: true,
    },

    // -------------------------------------------- the Stonemason is in there
    {
      type: 'assert', label: 'the Stonemason is standing in the chamber',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const n = window.__sqWorld.getNpcs().find((x) => x.id === 'stonemason');
          if (!n) return false;
          return n.x >= C.CAVE.x && n.x < C.CAVE.x + C.CAVE.w
            && n.y >= C.CAVE.y && n.y <= C.CAVE.y + C.CAVE.h;
        });
      `,
      equals: true,
    },
    { type: 'hold', key: 'w', ms: 700, label: 'step up to his counter' },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'and he buys the stone we are carrying',
      expr: `
        window.__sqSold = 'pending';
        window.__sqApi.sell('chalkstone', 7, 'stonemason').then((j) => { window.__sqSold = j; });
        return true;
      `,
      equals: true,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'he answered',
      expr: "return window.__sqSold !== 'pending';",
    },
    {
      type: 'assert', label: 'paid, in florins, standing in his cave',
      expr: "return window.__sqSold.ok === true && window.__sqSold.earned > 0;",
      equals: true,
    },

    // ------------------------------------------------------------ walk out
    // Back down to the corridor row first — the mouth is at CAVE.mouthY, and
    // walking west along the counter row just runs into the chamber wall.
    { type: 'hold', key: 's', ms: 700, label: 'step back off the counter' },
    { type: 'hold', key: 'a', ms: 3000, label: 'walk back out west' },
    { type: 'wait', ms: 1400, label: 'let the roof settle back' },
    {
      type: 'assert', label: 'outside again, the rock closes over the chamber',
      expr: "return window.__sqWorld.isInCave() === false && window.__sqWorld.getRoofAlpha() > 0.9;",
      equals: true,
    },
    {
      // Daylight is not a place a lantern does anything. If the darkness did
      // not lift on the way out, the charm would be a permanent screen filter.
      type: 'waitFor', timeoutMs: 6000, label: 'and the daylight comes back',
      expr: "return window.__sqWorld.getLightProbe().darkness < 0.05;",
    },

    // ---- THE TOP BANNER (items 10 / 10b) ----------------------------------
    //
    // Two separate complaints, both measured rather than eyeballed.
    //
    // HIERARCHY: the bar was one row of equally loud things, and the loudest
    // was the least urgent — a big gold crest and a name that never change, in
    // front of the stamina bar you watch every swing. Stamina is now the widest
    // and tallest meter in the bar, and identity is the dimmest block.
    {
      type: 'assert', label: 'stamina is the most prominent meter, not the xp bar',
      expr: `
        const stam = document.querySelector('.sq-hud-mbar');
        const xp = document.querySelector('.sq-hud-xpbar');
        if (!stam || !xp) return 'missing';
        const s = stam.getBoundingClientRect();
        const x = xp.getBoundingClientRect();
        return s.width > x.width && s.height > x.height;
      `,
      equals: true,
    },
    {
      // The whole ordering, in one measurement: the slots (tier 1) are at full
      // strength, the purse (tier 2) is dimmed, and identity (tier 3) is the
      // dimmest thing in the bar.
      // Ordered by SIZE, not by opacity. Dimming identity to .66 made it read
      // as broken rather than quiet, so the hierarchy is carried by scale now
      // and the opacities only separate the tiers slightly.
      type: 'assert', label: 'the three tiers really are ordered by weight',
      expr: `
        const h = (sel) => {
          const n = document.querySelector(sel);
          return n ? n.getBoundingClientRect().height : null;
        };
        const stam = h('.sq-hud-mbar');
        const xp = h('.sq-hud-xpbar');
        if (stam === null || xp === null) return 'missing';
        const idOp = parseFloat(getComputedStyle(document.querySelector('.sq-hud-id')).opacity);
        const coinOp = parseFloat(getComputedStyle(document.querySelector('.sq-hud-coin')).opacity);
        return stam > xp && coinOp >= idOp;
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and identity is visibly quieter than the rest',
      expr: `
        const id = document.querySelector('.sq-hud-id');
        return !!id && parseFloat(getComputedStyle(id).opacity) < 1;
      `,
      equals: true,
    },
    {
      // The animation used to sit on the xp bar — motion on the least urgent
      // thing in the bar, pulling the eye to the wrong place.
      type: 'assert', label: 'the xp bar no longer animates for attention',
      expr: `
        const f = document.querySelector('.sq-hud-xpfill');
        if (!f) return 'missing';
        const after = getComputedStyle(f, '::after');
        return after.animationName === 'none' || after.content === 'none';
      `,
      equals: true,
    },

    // TRAFFIC LIGHTS: the shell uses a full-size content view, so macOS draws
    // close/minimise/zoom straight over the top-left of this banner. The gutter
    // is keyed off data-native so the BROWSER build gets no mystery gap — which
    // is what this pair of assertions actually pins down.
    {
      type: 'assert', label: 'in a browser there is no traffic-light gutter',
      expr: `
        const id = document.querySelector('.sq-hud-id');
        return !!id && parseFloat(getComputedStyle(id).paddingLeft) < 40;
      `,
      equals: true,
    },
    {
      type: 'eval', label: 'pretend to be the native shell',
      expr: "document.documentElement.setAttribute('data-native', 'macos'); return 'marked';",
    },
    { type: 'wait', ms: 300 },
    {
      type: 'assert', label: 'the native build reserves the corner for them',
      expr: `
        const id = document.querySelector('.sq-hud-id');
        const crest = document.querySelector('.sq-hud-crest');
        if (!id || !crest) return 'missing';
        // The crest must clear the three lights, which sit within ~80px of the
        // left edge at every window size.
        return parseFloat(getComputedStyle(id).paddingLeft) >= 88
          && crest.getBoundingClientRect().left >= 88;
      `,
      equals: true,
    },
    {
      // The gutter must be DRAWN, not merely empty: reserving the space stopped
      // the lights landing on the crest, but they still sat on the HUD's own
      // gradient with nothing between them and the game.
      type: 'assert', label: 'and paints a chrome strip behind them',
      expr: `
        const bar = document.querySelector('.sq-hud-bar');
        if (!bar) return 'missing';
        const before = getComputedStyle(bar, '::before');
        return before.content !== 'none' && parseFloat(before.width) >= 96;
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v5-banner-native.png' },
    {
      // REVIEW-CLIENT.md: at the NORTH EDGE of the map the scholar could be
      // hidden behind this banner entirely — the camera cannot scroll past y=0,
      // so the top row of tiles was drawn under it, player included. The camera
      // may now go a banner's height negative, which pushes the map down.
      type: 'eval', label: 'walk to the very top of the map',
      expr: "const t = window.__sqWorld.getPlayerTile(); window.__sqWasAt = [t.x, t.y]; window.__sqWorld.setPlayerTile(24, 0); return 'north edge';",
    },
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'the scholar is drawn clear of the banner up there',
      expr: `
        const bar = document.querySelector('.sq-hud-bar');
        const p = window.__sqWorld.getRenderProbe();
        if (!bar) return 'no banner';
        // sy is the sprite's top in device pixels; the banner is CSS pixels.
        const dpr = window.devicePixelRatio || 1;
        const spriteTopCss = p.sy / dpr;
        return spriteTopCss >= bar.getBoundingClientRect().bottom;
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v5-north-edge.png' },
    {
      // Back where we were: this suite is about the cave, and every step after
      // this one is anchored to the mouth.
      type: 'eval', label: 'back to the cave mouth',
      expr: "const a = window.__sqWasAt || [49, 37]; window.__sqWorld.setPlayerTile(a[0], a[1]); return a.join(',');",
    },
    { type: 'wait', ms: 700 },
    {
      type: 'eval', label: 'back to being a browser',
      expr: "document.documentElement.removeAttribute('data-native'); return 'unmarked';",
    },

    // ---- E MUST NOT RACE THE POSITION COMMIT (Bruno, 2026-08-31) ----------
    //
    // "when I get the blue bloom and talk to the woodsman, a red message pops
    // up and if I talk again then it works." Position is committed by a
    // THROTTLED post — one per 400ms, and only on a tile change — so pressing E
    // the instant you arrive sends the request while the server still holds
    // your previous tile, and every location gate refuses you. The second press
    // worked because the throttle had fired in between.
    //
    // Reproduced deterministically rather than by racing a timer: move the
    // SERVER's player to the plaza while the renderer stays in the cave. That
    // is exactly the state the throttle leaves behind, and it is stable.
    { type: 'hold', key: 'd', ms: 2600, label: 'walk back into the chamber' },
    { type: 'hold', key: 'w', ms: 900, label: 'and up to his counter' },
    { type: 'wait', ms: 1200 },
    {
      type: 'assert', label: 'the scholar is in the chamber again',
      expr: "return window.__sqWorld.isInCave();", equals: true,
    },
    {
      // AT THE COUNTER, not merely inside the cave — his reach is the counter
      // rect (BUILDING_COUNTER), and walking to the far corner of the chamber
      // is legitimately out of range. Getting this wrong made the first version
      // of this test fail for a reason that had nothing to do with the race.
      type: 'assert', label: 'and within reach of his counter',
      expr: `
        return import('/shared/constants.js').then((C) => {
          const t = window.__sqWorld.getPlayerTile();
          const c = C.counterRect('stonemason_camp', 52, 34, C.BUILDING_FOOTPRINT.stonemason_camp);
          return t.x >= c.x - 1 && t.x <= c.x + c.w && t.y >= c.y - 1 && t.y <= c.y + c.h;
        });
      `,
      equals: true,
    },
    {
      type: 'eval', label: 'remember exactly where that is',
      expr: "const t = window.__sqWorld.getPlayerTile(); window.__sqHere = t.x + ',' + t.y; return window.__sqHere;",
    },
    {
      type: 'eval', label: 'desync the server — it thinks we are in the plaza',
      expr: `
        window.__sqDesync = 'pending';
        fetch('/api/player/move', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: 24, y: 18 }),
        }).then(function (r) { return r.json(); })
          .then(function (j) { window.__sqDesync = j.ok ? 'ok' : j.error; },
                function (e) { window.__sqDesync = e.message; });
        return 'sent';
      `,
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the server moved us away',
      expr: "if (window.__sqDesync === 'pending') return false; if (window.__sqDesync !== 'ok') throw new Error(window.__sqDesync); return true;",
    },
    {
      type: 'assert', label: 'the renderer still knows it is in the cave',
      expr: "return window.__sqWorld.isInCave();", equals: true,
    },
    {
      type: 'eval', label: 'press E at the Stonemason anyway',
      expr: "window.__sqWorld.onInteract('stonemason_camp'); return 'talked';",
    },
    {
      // Without the flush this is a red toast and no box at all.
      type: 'waitFor', timeoutMs: 8000, label: 'he speaks on the FIRST press',
      expr: "return !!document.querySelector('.sq-dlg-root:not([hidden]) .sq-dlg-box');",
    },
    {
      type: 'assert', label: 'and the server was told where we really are',
      expr: "const p = window.__sqState().player; return (p.x + ',' + p.y) === window.__sqHere;",
      equals: true,
    },
    {
      type: 'eval', label: 'read the conversation away',
      expr: `
        const dlg = window.__sqDialogue && window.__sqDialogue();
        if (dlg) { for (let i = 0; i < 40 && dlg.isOpen(); i += 1) { dlg.advance(); } }
        for (const p of Object.values(window.__sqPanels)) { try { p.close(); } catch (e) {} }
        return 'done';
      `,
    },
    { type: 'wait', ms: 600 },

    // ---- NOTHING ON SCREEN MEANS NOTHING MOVES (Bruno, 2026-08-31) --------
    //
    // "when you are in a dialogue, text box, or opened a building or
    // inventory/Q, you should not be able to move." The world kept running
    // under every panel, so you could walk off while reading a shop and the
    // position that got saved was wherever WASD had carried you behind it.
    //
    // THIS LIVES HERE, not in 11-equipment, and the reason is worth writing
    // down: 11 restarts the server mid-suite and navigates to a new port, and
    // after that the page's timers run at a crawl — sampling the player's
    // position gave five readings in three seconds. A held key genuinely moves
    // nobody there, so the test would have "passed" its freeze assertions while
    // proving nothing. This suite already walks the scholar in and out of the
    // mountain on held keys, so movement is known to work in it.
    {
      type: 'eval', label: 'clear the screen — pause is not a panel, so close it too',
      expr: "for (const p of Object.values(window.__sqPanels)) { try { p.close(); } catch (e) {} } if (window.__sqPause && window.__sqPause.isOpen()) window.__sqPause.close(); return 'closed';",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'eval', label: 'note where the scholar is standing',
      expr: "const p = window.__sqWorld.getRenderProbe(); window.__sqPx = Math.round(p.px) + ',' + Math.round(p.py); return window.__sqPx;",
    },
    // BASELINE FIRST. Without it the freeze assertion below would pass on a
    // world that had stopped moving for some entirely unrelated reason.
    // WEST: the block above walked back INTO the chamber, so the corridor out
    // is the direction with room in it.
    { type: 'hold', key: 'a', ms: 900, label: 'hold west with a clear screen' },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'the scholar walks when nothing is on screen',
      expr: "const p = window.__sqWorld.getRenderProbe(); return (Math.round(p.px) + ',' + Math.round(p.py)) !== window.__sqPx;",
      equals: true,
    },
    {
      type: 'eval', label: 'open the Bag and note the position again',
      expr: "window.__sqPanels.inventory.open(); const p = window.__sqWorld.getRenderProbe(); window.__sqPx = Math.round(p.px) + ',' + Math.round(p.py); return window.__sqPx;",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'the Bag is up',
      expr: "return window.__sqPanels.inventory.isOpen();", equals: true,
    },
    { type: 'hold', key: 'a', ms: 1200, label: 'hold west with the Bag open' },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'and the scholar has not moved a single pixel',
      expr: "const p = window.__sqWorld.getRenderProbe(); return (Math.round(p.px) + ',' + Math.round(p.py)) === window.__sqPx;",
      equals: true,
    },
    {
      type: 'eval', label: 'close the Bag',
      expr: "window.__sqPanels.inventory.close(); return 'closed';",
    },
    { type: 'wait', ms: 600 },
    { type: 'hold', key: 'a', ms: 900, label: 'hold west again' },
    { type: 'wait', ms: 400 },
    {
      // The freeze must LIFT, or the fix is worse than the bug it fixes.
      type: 'assert', label: 'and it walks again — the freeze lifted with the panel',
      expr: "const p = window.__sqWorld.getRenderProbe(); return (Math.round(p.px) + ',' + Math.round(p.py)) !== window.__sqPx;",
      equals: true,
    },
    // ---- THE DOLL'S CHARM SLOTS MUST ACTUALLY WORK ------------------------
    //
    // LAST in the suite. Placed mid-cave at first, and the walk back out then
    // stopped working: the scholar simply did not move, with nothing open, no
    // pause, focus on BODY and clear floor to the west. Same shape as the
    // stall documented in 11-equipment — enough DOM churn and the page's timers
    // crawl, so a held key delivers almost no frames. Nothing here needs to run
    // mid-cave, so it runs after every step that depends on walking.
    //
    // Bruno: "it does not let me equip the lantern in slots 1 or 2 from the
    // gears menu in the inventory." He was clicking the two cells marked CHARM
    // on the paper-doll — exactly the right thing — and they were bound to
    // `gearList()`, the old passive-bonus TOOLS, so nothing happened and a
    // charm he owned never appeared on the doll.
    { type: 'key', key: 'Tab', label: 'open the Bag' },
    { type: 'wait', ms: 700 },
    {
      type: 'eval', label: 'go to the GEAR tab',
      expr: "const t = [...document.querySelectorAll('.sq-theme-tab')].find(b => /GEAR/i.test(b.textContent||'')); if (!t) return 'no gear tab'; t.click(); return 'gear';",
    },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'the doll draws exactly two charm slots',
      expr: "return [...document.querySelectorAll('.sq-inv-dollslot')].filter((c) => /CHARM/i.test(c.textContent || '')).length;",
      equals: 2,
    },
    {
      // The lantern went on earlier in this suite, so the doll must NAME it —
      // the old cells were bound to `gearList()` and would say "empty" here
      // however many charms you were wearing.
      type: 'assert', label: 'and the first one names the lantern being worn',
      expr: `
        const c = [...document.querySelectorAll('.sq-inv-dollslot')].filter(x => /CHARM/i.test(x.textContent || ''));
        return /Everburning/i.test(c[0].textContent || '');
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v5-doll-charms.png' },
    {
      type: 'eval', label: 'click the worn slot to take it off',
      expr: "const c = [...document.querySelectorAll('.sq-inv-dollslot')].filter(x => /CHARM/i.test(x.textContent||'')); c[0].click(); return 'clicked';",
    },
    { type: 'wait', ms: 900 },
    {
      type: 'assert', label: 'a filled charm slot takes it off',
      expr: "return (window.__sqState().player.charms || [])[0] === null;", equals: true,
    },
    {
      type: 'assert', label: 'and the cell goes back to empty',
      expr: `
        const c = [...document.querySelectorAll('.sq-inv-dollslot')].filter(x => /CHARM/i.test(x.textContent || ''));
        return /empty/i.test(c[0].textContent || '');
      `,
      equals: true,
    },
    {
      type: 'eval', label: 'click the empty slot to put it back on',
      expr: "const c = [...document.querySelectorAll('.sq-inv-dollslot')].filter(x => /CHARM/i.test(x.textContent||'')); c[0].click(); return 'clicked';",
    },
    { type: 'wait', ms: 900 },
    {
      // THE HALF THAT WAS BROKEN. Clicking an empty charm cell did nothing at
      // all before — it looked like a slot and behaved like a label.
      type: 'assert', label: 'clicking an empty charm slot wears the charm you own',
      expr: "return (window.__sqState().player.charms || [])[0];", equals: 'lantern_charm',
    },
    { type: 'key', key: 'Escape', label: 'close the Bag' },
    { type: 'wait', ms: 600 },

  ],
};
