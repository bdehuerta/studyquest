// tools/checks/12-continue-slot.mjs — CONTINUE must name the save you played LAST.
//
// WHY THIS SUITE EXISTS
//
// The launch menu sorted saves by `Date.parse(lastPlayedAt)`. The server writes
// that field as an epoch NUMBER, and `Date.parse` returns NaN for a number, so
// every save scored 0 and the sort fell through to its tie-break: hours played.
// CONTINUE therefore pointed at the save with the most PLAYTIME, not the one
// most recently touched — invisible with one save, wrong the moment there are
// two.
//
// The scene is Bruno's real one: Slot 1 has hours on it, Slot 2 was played ten
// seconds later and has barely been touched. CONTINUE must say Slot 2.

const NOW = Date.now();
const MINUTE = 60000;

// meta.json is DERIVED from `state.meta` whenever the slot is written, so a
// fixture that only seeds meta.json has its numbers regenerated out from under
// it on the first save. The truth lives in state.json.
function save(name, level, meta) {
  return {
    meta,
    player: {
      name, level, xp: 0, xpToNext: 500, x: 22, y: 19,
      coins: { focus: 10, insight: 10, grind: 10, spark: 10 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 100, maxEnergy: 110,
      gatherTools: [], activeGatherTool: null,
      equipped: [null, null], activeSlot: 0, saplings: 0,
    },
    materials: {}, tools: [],
    buildings: [
      { uid: 'seed-study-hut', buildingId: 'study_hut', x: 22, y: 17 },
      { uid: 'seed-trading-post', buildingId: 'trading_post', x: 26, y: 17 },
      { uid: 'seed-archive', buildingId: 'archive', x: 22, y: 20 },
    ],
    pendingBuildings: [], tasks: [], sessions: [], log: [],
    harvested: {}, blueprints: [], relics: [], plantings: {},
    gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    lifetime: {
      tasksCompleted: 0, studyMinutes: 0, sessions: 0,
      treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0,
    },
  };
}

export default {
  name: 'launch menu — CONTINUE follows recency, not hours played',
  order: 16,
  browser: true,

  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    // The OLD save: many hours, played an hour ago.
    'Slot 1/state.json': save('Save 1', 9, {
      slot: 1, name: 'Save 1', createdAt: NOW - 400 * MINUTE,
      lastPlayedAt: NOW - 60 * MINUTE, playtimeMs: 6340828,
    }),
    'Slot 1/meta.json': {
      slot: 1, name: 'Save 1', createdAt: NOW - 400 * MINUTE,
      lastPlayedAt: NOW - 60 * MINUTE,
      playtimeMs: 6340828, level: 9, tasksDone: 4, tasksTotal: 9, savedAt: NOW - 60 * MINUTE,
    },
    // The NEW save: barely played, but played MOST RECENTLY. This is the one
    // CONTINUE has to offer.
    'Slot 2/state.json': save('2 test', 2, {
      slot: 2, name: '2 test', createdAt: NOW - 20 * MINUTE,
      lastPlayedAt: NOW - MINUTE, playtimeMs: 338376,
    }),
    'Slot 2/meta.json': {
      slot: 2, name: '2 test', createdAt: NOW - 20 * MINUTE,
      lastPlayedAt: NOW - MINUTE,
      playtimeMs: 338376, level: 2, tasksDone: 0, tasksTotal: 3, savedAt: NOW - MINUTE,
    },
  },

  steps: [
    { type: 'navigate', url: '/', label: 'load the game' },
    {
      type: 'waitFor', timeoutMs: 15000, label: 'the boot overlay clears',
      expr: "const b = document.getElementById('boot'); return !b || b.classList.contains('hidden');",
    },
    {
      type: 'waitFor', timeoutMs: 10000, label: 'the save list is read',
      expr: "return document.querySelectorAll('.sq-launch-slot').length >= 2;",
    },
    {
      type: 'assert', label: 'CONTINUE names the save played LAST, not the one with the most hours',
      expr: "const b=[...document.querySelectorAll('.sq-launch-big')].find(x=>/continue/i.test(x.textContent||'')); return b && b.textContent.trim();",
      equals: 'CONTINUE · 2 test',
    },
    {
      type: 'assert', label: 'and the recency marker sits on that same card',
      expr: `
        const cards = [...document.querySelectorAll('.sq-launch-slot')];
        const marked = cards.filter((c) => c.classList.contains('sq-launch-recent'));
        return marked.length === 1 && /2 test/.test(marked[0].textContent);
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'the older save still reads as an hour ago, not "never"',
      expr: `
        const card = [...document.querySelectorAll('.sq-launch-slot')].find((c) => /Save 1/.test(c.textContent));
        return card && /never/.test(card.textContent) === false;
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v5-continue-slot.png' },

    // ---------------------------------------------------- QUIT actually quits
    //
    // A page cannot close a window it did not open, so QUIT used to dead-end on
    // "This window has to be closed from the title bar (⌘W)". In the native
    // shell it now asks AppKit to terminate, through `window.__sqQuit` (injected
    // by GameWindow.swift). Here that bridge is stubbed, which is the only way
    // to test it from a browser — the assertion is that QUIT USES the bridge
    // when one exists, and saves before it does.
    {
      type: 'eval', label: 'stand in for the native shell',
      expr: `
        window.__sqQuitCalls = 0;
        window.__sqQuit = function () { window.__sqQuitCalls += 1; return true; };
        window.__sqSaveCalls = 0;
        const realSave = window.__sqApi.save;
        window.__sqApi.save = function () { window.__sqSaveCalls += 1; return realSave.call(window.__sqApi); };
        return 'stubbed';
      `,
    },
    {
      type: 'eval', label: 'click QUIT',
      expr: "const b=[...document.querySelectorAll('.sq-launch-foot button')].find(x=>/^quit$/i.test((x.textContent||'').trim())); if(!b) return 'no quit button'; b.click(); return 'clicked';",
    },
    // ---- DEVELOPER MODE --------------------------------------------------
    //
    // Bruno, 2026-08-31: a green button in the menu to "test level 20 xp
    // without altering normal gameplay." It GRANTS; it does not switch anything
    // on, so there is no cheat mode for the rest of the game to branch on —
    // which is what would actually alter normal gameplay, by giving every
    // system a second path only developers ever walk.
    {
      type: 'assert', label: 'the launch menu has a green DEVELOPER MODE button',
      expr: `
        const b = [...document.querySelectorAll('.sq-launch-foot button')]
          .find((x) => /developer mode/i.test(x.textContent || ''));
        if (!b) return 'no button';
        // Green, and only this one: it is a workshop tool, not something the
        // scholar can do, and it must never be mistaken for one.
        return b.classList.contains('sq-launch-dev');
      `,
      equals: true,
    },
    {
      type: 'eval', label: 'open the developer sheet',
      expr: "const b = [...document.querySelectorAll('.sq-launch-foot button')].find((x) => /developer mode/i.test(x.textContent || '')); b.click(); return 'opened';",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'it offers a level to set',
      expr: "return document.querySelectorAll('.sq-launch-devbox input[type=number]').length >= 3;",
      equals: true,
    },
    {
      // The sheet body is parchment; the footer is dark. The same green has to
      // read in both, and the first pass was light-green-on-paper — all but
      // invisible. Measured rather than trusted.
      type: 'assert', label: 'the grant button is readable against the parchment',
      expr: `
        const b = [...document.querySelectorAll('.sq-launch-devbox button')]
          .find((x) => /grant/i.test(x.textContent || ''));
        if (!b) return 'no button';
        const cs = getComputedStyle(b);
        const lum = (c) => {
          const m = c.match(/\\d+/g);
          if (!m) return null;
          return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
        };
        const fg = lum(cs.color);
        const bg = lum(cs.backgroundColor);
        if (fg === null || bg === null) return 'unreadable colours';
        return Math.abs(fg - bg) > 0.3;
      `,
      equals: true,
    },
    {
      type: 'eval', label: 'grant level 20 and the lot',
      expr: "const b = [...document.querySelectorAll('.sq-launch-devbox button')].find((x) => /grant/i.test(x.textContent || '')); b.click(); return 'granted';",
    },
    {
      type: 'waitFor', timeoutMs: 8000, label: 'the grant went through',
      expr: `
        return fetch('/api/state').then((r) => r.json()).then((j) => {
          const p = j.state.player;
          return p.level === 20 && p.coins.florin >= 99999
            // THREE gather tools, not four: the dredge went with the reeds
            // (2026-09-02). Asserted against the contract rather than a literal
            // so the next tool added or removed does not need this edited.
            && (p.gatherTools || []).length >= 3
            && (p.ownedCharms || []).length >= 2
            && !!(j.state.meta && j.state.meta.devUsed);
        });
      `,
    },
    {
      type: 'assert', label: 'and level 20 is what brings the Herald',
      expr: `
        return fetch('/api/state').then((r) => r.json())
          .then((j) => !!(j.state.herald && j.state.herald.summonedAt));
      `,
      equals: true,
    },
    { type: 'screenshot', file: 'v5-developer-mode.png' },
    {
      type: 'eval', label: 'close the sheet',
      expr: "const x = document.querySelector('.sq-launch-sheet .sq-theme-x'); if (x) x.click(); return 'closed';",
    },
    { type: 'wait', ms: 400 },

    // ---- MENU MUSIC: on for the menu, off in the world ---------------------
    //
    // Bruno, 2026-08-31: "play it in a loop when the menu is open only. no
    // music when you enter the actual game."
    //
    // Asserted through the module's own probe rather than by listening for
    // sound: headless Chrome has no audio device, and `play()` is refused
    // before the first user gesture anyway. What matters is that the module is
    // ASKED to play on the menu and asked to stop on entering the world — the
    // browser's autoplay policy is handled by the one-shot gesture listener in
    // music.js and is not this suite's business.
    {
      type: 'assert', label: 'the music file is served, and as audio',
      expr: `
        return fetch('/web/audio/menu.mp3', { method: 'GET' }).then((r) => {
          if (!r.ok) return 'HTTP ' + r.status;
          const t = r.headers.get('content-type') || '';
          return t.indexOf('audio/') === 0;
        });
      `,
      equals: true,
    },
    {
      type: 'assert', label: 'and it is wanted while the launch menu is up',
      expr: "return window.__sqMusic().probe().wanted;", equals: true,
    },
    {
      type: 'assert', label: 'looping, and quiet enough to sit under a menu',
      expr: `
        const p = window.__sqMusic().probe();
        return p.src.indexOf('menu.mp3') !== -1;
      `,
      equals: true,
    },

    // ---- THE VOLUME SLIDER -------------------------------------------------
    //
    // Bruno, 2026-08-31: "add a volume display in the settings button in the
    // main menu screen if you want to change the volume of the menu music."
    {
      type: 'eval', label: 'open SETTINGS',
      expr: "const b = [...document.querySelectorAll('.sq-launch-foot button')].find((x) => /^settings$/i.test((x.textContent||'').trim())); if (!b) return 'no settings button'; b.click(); return 'opened';",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'there is a music volume slider with a readout',
      expr: `
        const sl = document.querySelector('.sq-launch-volslider');
        const rd = document.querySelector('.sq-launch-volread');
        if (!sl || !rd) return 'missing';
        return sl.type === 'range' && /%$/.test(rd.textContent || '');
      `,
      equals: true,
    },
    {
      type: 'eval', label: 'drag it down to 12%',
      expr: `
        const sl = document.querySelector('.sq-launch-volslider');
        sl.value = '12';
        sl.dispatchEvent(new Event('input', { bubbles: true }));
        sl.dispatchEvent(new Event('change', { bubbles: true }));
        return 'dragged';
      `,
    },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'the readout follows it',
      expr: "return (document.querySelector('.sq-launch-volread').textContent || '').trim();",
      equals: '12%',
    },
    {
      // Heard immediately, not on release — the whole point of a volume slider.
      type: 'assert', label: 'and the music took the new gain',
      expr: "return Math.round(window.__sqMusic().probe().gain * 100);", equals: 12,
    },
    {
      type: 'assert', label: 'and it was written to settings, not just shown',
      expr: `
        const raw = window.localStorage.getItem('sq.settings.v3');
        if (!raw) return 'nothing stored';
        return JSON.parse(raw).musicVolume;
      `,
      equals: 12,
    },
    {
      // ZERO is the off switch: no second toggle needed beside it, so the
      // readout has to say so rather than showing a meaningless "0%".
      type: 'eval', label: 'drag it to nothing',
      expr: `
        const sl = document.querySelector('.sq-launch-volslider');
        sl.value = '0';
        sl.dispatchEvent(new Event('input', { bubbles: true }));
        sl.dispatchEvent(new Event('change', { bubbles: true }));
        return 'silenced';
      `,
    },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'zero reads as OFF, not as 0%',
      expr: "return (document.querySelector('.sq-launch-volread').textContent || '').trim();",
      equals: 'OFF',
    },
    { type: 'screenshot', file: 'v5-settings-volume.png' },
    {
      // A number setting is a first for this store, which only ever read
      // booleans — a numeric key would have been dropped on every read and the
      // slider would snap back to its default whenever the menu reopened.
      type: 'eval', label: 'reopen the sheet',
      expr: "const x = document.querySelector('.sq-launch-sheet .sq-theme-x'); if (x) x.click(); const b = [...document.querySelectorAll('.sq-launch-foot button')].find((y) => /^settings$/i.test((y.textContent||'').trim())); b.click(); return 'reopened';",
    },
    { type: 'wait', ms: 500 },
    {
      type: 'assert', label: 'and the setting survived being reread',
      expr: "return document.querySelector('.sq-launch-volslider').value;", equals: '0',
    },
    {
      type: 'eval', label: 'put it back and close',
      expr: `
        const sl = document.querySelector('.sq-launch-volslider');
        sl.value = '34';
        sl.dispatchEvent(new Event('change', { bubbles: true }));
        const x = document.querySelector('.sq-launch-sheet .sq-theme-x');
        if (x) x.click();
        return 'closed';
      `,
    },
    { type: 'wait', ms: 400 },

    // ---- THE WORLD'S KEYS DO NOTHING AT THE TITLE SCREEN ------------------
    //
    // Bruno, 2026-08-31: "the esc key works outside of the game (in the start
    // menu and save selection menu), it should not." `game.stop()` halts the
    // world but never released the KEYS, so Esc opened the pause menu BEHIND
    // the launch panel and Q opened the task log invisibly under it — the Q
    // half of which REVIEW-CLIENT.md had already flagged.
    //
    // Asserted here, on the launch screen, before QUIT is pressed.
    {
      type: 'assert', label: 'we are on the launch screen',
      expr: "const r = document.querySelector('.sq-launch-root'); return !!r && !r.hidden;",
      equals: true,
    },
    { type: 'key', key: 'Escape', label: 'press Escape at the title screen' },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'Escape did NOT raise the pause menu behind it',
      expr: `
        const p = document.querySelector('.sq-pause-scrim');
        if (!p) return true;
        return p.hidden === true || getComputedStyle(p).display === 'none';
      `,
      equals: true,
    },
    { type: 'key', key: 'q', label: 'press Q at the title screen' },
    { type: 'key', key: 'Tab', label: 'and Tab' },
    { type: 'wait', ms: 600 },
    {
      type: 'assert', label: 'and no panel opened underneath either',
      expr: "return Object.values(window.__sqPanels).some((p) => p.isOpen());",
      equals: false,
    },
    {
      type: 'assert', label: 'the launch screen is still the thing on screen',
      expr: "const r = document.querySelector('.sq-launch-root'); return !!r && !r.hidden;",
      equals: true,
    },

    {
      type: 'waitFor', timeoutMs: 5000, label: 'QUIT asked the shell to terminate',
      expr: "return window.__sqQuitCalls === 1;",
    },
    {
      type: 'assert', label: 'and it saved on the way out',
      expr: "return window.__sqSaveCalls >= 1;", equals: true,
    },
    {
      type: 'assert', label: 'the ⌘W dead-end message never appeared',
      expr: `
        return new Promise((res) => setTimeout(() => {
          const st = document.querySelector('.sq-launch-status');
          res(!st || /title bar/i.test(st.textContent || '') === false);
        }, 700));
      `,
      equals: true,
    },
  ],
};
