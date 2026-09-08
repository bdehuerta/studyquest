// tools/checks/08-quest-ui.mjs — the v4 quest panel, driven in a real browser.
//
// This project has shipped panels that rendered without throwing and were
// visibly wrong, and green API suites did not catch it. So this suite clicks
// through all three quest states in Chrome, asserts the things you would
// otherwise only notice by looking, and leaves a screenshot of each.
//
//   list      → the roll, in the v3 parchment/gold frame (NOT the old flat box)
//   composer  → a real textarea, the brief beside it, a live word gauge
//   grading   → the deliberate wait, which must actually appear on screen
//   graded    → stamped rank, rubric bars, feedback, materials, Resubmit
//
// Plus the two things easiest to get wrong and hardest to see: the draft
// surviving a panel close, and the rubric bars actually having width.

const ESSAY =
  'The causes of the Reformation were structural long before they were doctrinal. ' +
  'Indulgences drained silver out of the German lands toward Rome, and the resentment around that traffic was fiscal as much as spiritual. ' +
  'Printing changed the tempo of the argument: a pamphlet written in Wittenberg could be answered in Basel inside a fortnight.\n\n' +
  'Political fragmentation supplied the shelter. Princes who resented papal taxation found in reform a lever against both emperor and curia, ' +
  'and they protected preachers whom a more centralised realm would have burned without ceremony.\n\n' +
  'Humanism supplied the method. Erasmus put a critical Greek New Testament into scholarly hands, and once the text could be argued from, ' +
  'the monopoly on interpretation had already gone. What changed by 1517 was the speed at which an argument could travel.';

function task(id, title) {
  return {
    id, title,
    subject: 'history', workType: 'writing',
    difficulty: 4, estMinutes: 120,
    status: 'todo', minutesLogged: 90,
    rank: null, dueInDays: 2, completedAt: null,
  };
}

function seedSave() {
  return {
    player: {
      name: 'UI Tester', level: 6, xp: 10, xpToNext: 1000,
      x: 24, y: 18,
      coins: { focus: 100, insight: 100, grind: 100, spark: 100 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 100, maxEnergy: 100,
      gatherTools: [], activeGatherTool: null, saplings: 0,
    },
    materials: {}, tools: [], buildings: [], pendingBuildings: [],
    tasks: [
      task('ui-main', 'Essay on the causes of the Reformation'),
      task('ui-draft', 'Seminar notes on the Peace of Augsburg'),
    ],
    sessions: [], log: [], harvested: {}, blueprints: [], relics: [],
    plantings: {}, gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    lifetime: { tasksCompleted: 0, studyMinutes: 90, sessions: 0, treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0 },
  };
}

/** Click the SUBMIT WORK button on the card whose title contains `needle`. */
function clickSubmitOn(needle) {
  return `
    const cards = [...document.querySelectorAll('.sq-tasks-card')];
    const card = cards.find(c => (c.textContent || '').includes(${JSON.stringify(needle)}));
    if (!card) return 'no card for ${needle}';
    const btn = [...card.querySelectorAll('button')].find(b => /submit work/i.test(b.textContent || ''));
    if (!btn) return 'no submit button';
    btn.click();
    return 'clicked';
  `;
}

/** Type into the composer the way a person does: set value, fire input. */
function typeIntoComposer(text) {
  return `
    const a = document.querySelector('.sq-tasks-area');
    if (!a) return 'no textarea';
    a.value = ${JSON.stringify(text)};
    a.dispatchEvent(new Event('input', { bubbles: true }));
    return a.value.length;
  `;
}

export default {
  name: 'v4 UI — the quest panel, clicked through all three states',
  order: 80,
  browser: true,

  // Chrome is reused across suites, so the PREVIOUS suite's page is still alive
  // and still posting moves at a port that has since closed. 02-play allows the
  // same line for the same reason.
  allowConsole: [
    'favicon\\.ico',
    'Failed to load resource.*favicon',
    'ERR_CONNECTION_REFUSED.*\\/api\\/player\\/move',
  ],

  seed: {
    'Slot 1/state.json': seedSave(),
    'Slot 1/meta.json': {
      slot: 1, name: 'UI Tester', createdAt: 1750000000000, lastPlayedAt: 1750000000000,
      playtimeMs: 60000, level: 6, tasksDone: 0, tasksTotal: 2, savedAt: 1750000000000,
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
    { type: 'wait', ms: 400 },

    // ------------------------------------------------------------- the list
    { type: 'key', key: 't', label: 'open the Task Log (T)' },
    { type: 'wait', ms: 350 },
    {
      type: 'assert', label: 'the panel wears the v3 frame, not the old flat box',
      expr: "const p=document.querySelector('.sq-tasks-panel'); return !!p && p.classList.contains('sq-theme-frame');",
    },
    {
      type: 'assert', label: 'the content ground is parchment',
      expr: "const b=document.querySelector('.sq-tasks-body'); if(!b) return false; const bg=getComputedStyle(b).backgroundImage||''; return bg.includes('gradient');",
    },
    {
      type: 'assert', label: 'every open quest offers SUBMIT WORK as its primary action',
      expr: "const bs=[...document.querySelectorAll('.sq-tasks-card button')].map(b=>(b.textContent||'').trim()); return bs.filter(t=>/submit work/i.test(t)).length === 2;",
    },
    {
      type: 'assert', label: 'the self-grade fallback is still reachable',
      expr: "return [...document.querySelectorAll('.sq-tasks-quiet')].some(b=>/self grade/i.test(b.textContent||''));",
    },
    { type: 'screenshot', file: 'v4-quests-list.png', label: 'screenshot: the quest roll' },

    // ---------------------------------------------------------- the composer
    { type: 'eval', label: 'open the composer for the essay', expr: clickSubmitOn('Reformation') },
    { type: 'waitFor', timeoutMs: 4000, label: 'the writing surface appears', expr: "return !!document.querySelector('.sq-tasks-area');" },
    {
      type: 'assert', label: 'the brief is shown beside it',
      expr: "const b=document.querySelector('.sq-tasks-brief'); return !!b && /Reformation/.test(b.textContent||'');",
    },
    {
      type: 'assert', label: 'the brief names the estimate and the deadline',
      expr: "const b=document.querySelector('.sq-tasks-brief').textContent||''; return /120 min/.test(b) && /in 2d/.test(b);",
    },
    {
      type: 'assert', label: 'there is a file attach affordance',
      expr: "const i=document.querySelector('.sq-tasks-file'); return !!i && i.type === 'file';",
    },
    {
      type: 'assert', label: 'the word gauge starts at zero',
      expr: "const g=document.querySelector('.sq-tasks-gaugetext'); return !!g && /^0 words/.test(g.textContent||'');",
    },
    { type: 'screenshot', file: 'v4-composer-empty.png', label: 'screenshot: the empty composer' },

    { type: 'eval', label: 'write the essay', expr: typeIntoComposer(ESSAY) },
    { type: 'wait', ms: 400 },
    {
      type: 'assert', label: 'the word count is live and counts against a target',
      expr: "const g=(document.querySelector('.sq-tasks-gaugetext')||{}).textContent||''; const m=/^(\\d+) words .* guide (\\d+)$/.exec(g); return !!m && Number(m[1]) > 100 && Number(m[2]) > 100;",
    },
    {
      type: 'assert', label: 'and the gauge bar actually filled',
      expr: "const f=document.querySelector('.sq-tasks-gaugefill'); return !!f && parseFloat(f.style.width) > 5;",
    },
    { type: 'screenshot', file: 'v4-composer-written.png', label: 'screenshot: the composer with work in it' },

    // ---------------------------------------------------------- grading…
    {
      type: 'eval', label: 'hand it in',
      expr: "const b=[...document.querySelectorAll('.sq-tasks-actionrow button')].find(x=>/hand it in/i.test(x.textContent||'')); if(!b) return 'no submit'; b.click(); return 'clicked';",
    },
    { type: 'waitFor', timeoutMs: 3000, label: 'the grading state appears — it must not flash past', expr: "return !!document.querySelector('.sq-tasks-seal');" },
    {
      type: 'assert', label: 'and says what it is doing',
      expr: "const w=document.querySelector('.sq-tasks-waitsub'); return !!w && (w.textContent||'').trim().length > 5;",
    },
    { type: 'screenshot', file: 'v4-grading.png', label: 'screenshot: grading…' },

    // ------------------------------------------------------------- graded
    { type: 'waitFor', timeoutMs: 12000, label: 'the grade is stamped', expr: "return !!document.querySelector('.sq-tasks-stamp');" },
    { type: 'wait', ms: 900, label: 'let the stamp land and the rubric bars grow' },
    {
      type: 'assert', label: 'the stamp is a real rank letter',
      expr: "const s=document.querySelector('.sq-tasks-stamp'); return !!s && /^[FDCBAS]$/.test((s.textContent||'').trim());",
    },
    {
      type: 'assert', label: 'the score is shown out of 100',
      expr: "const v=document.querySelector('.sq-tasks-verdictscore'); return !!v && /\\d+\\s*\\/ 100/.test(v.textContent||'');",
    },
    {
      type: 'assert', label: 'the grader is named honestly as a local estimate',
      expr: "const g=document.querySelector('.sq-tasks-graderline'); return !!g && /no model configured/i.test(g.textContent||'');",
    },
    {
      type: 'assert', label: 'confidence is on screen',
      expr: "return /confidence \\d+%/.test((document.querySelector('.sq-tasks-graderline')||{}).textContent||'');",
    },
    {
      type: 'assert', label: 'the rubric has 3-5 rows',
      expr: "const n=document.querySelectorAll('.sq-tasks-row').length; return n >= 3 && n <= 5;",
    },
    {
      type: 'assert', label: 'and every row drew a bar with real width',
      expr: "const fs=[...document.querySelectorAll('.sq-tasks-rowfill')]; return fs.length >= 3 && fs.every(f => f.style.width && f.style.width !== '0%');",
    },
    {
      type: 'assert', label: 'a feedback paragraph is present',
      expr: "const p=document.querySelector('.sq-tasks-prose'); return !!p && (p.textContent||'').length > 80;",
    },
    {
      type: 'assert', label: 'strengths and improvements are both listed',
      expr: "const h=[...document.querySelectorAll('.sq-tasks-listhead')].map(x=>x.textContent); return h.some(t=>/WORKED/.test(t)) && h.some(t=>/CHANGE/.test(t));",
    },
    {
      type: 'assert', label: 'the reward is shown, materials included',
      expr: "const l=document.querySelector('.sq-tasks-loot'); return !!l && l.querySelectorAll('.sq-tasks-lootitem').length > 0;",
    },
    {
      type: 'assert', label: 'what was handed in is shown back',
      expr: "const s=document.querySelector('.sq-tasks-submitted'); return !!s && /Reformation/.test(s.textContent||'');",
    },
    {
      type: 'assert', label: 'Resubmit and Regrade are both offered',
      expr: "const bs=[...document.querySelectorAll('.sq-tasks-actionrow button')].map(b=>b.textContent||''); return bs.some(t=>/resubmit/i.test(t)) && bs.some(t=>/regrade/i.test(t));",
    },
    { type: 'screenshot', file: 'v4-graded.png', label: 'screenshot: the graded sheet' },
    {
      type: 'eval', label: 'scroll to the bottom of the sheet',
      expr: "const b=document.querySelector('.sq-tasks-body'); b.scrollTop = b.scrollHeight; return b.scrollTop;",
    },
    { type: 'wait', ms: 250 },
    { type: 'screenshot', file: 'v4-graded-bottom.png', label: 'screenshot: feedback, lists and what was handed in' },

    // ------------------------------------------------- the reward really landed
    { type: 'api', route: '/api/state', expectOk: true, label: 'the quest is done on the server', path: 'state.tasks.0.status', equals: 'done' },
    { type: 'api', route: '/api/state', label: 'the grade was stored', path: 'state.tasks.0.grading.grader', equals: 'stub' },
    { type: 'api', route: '/api/state', label: 'and the HUD has coins it did not have', path: 'state.player.coins.florin', truthy: true },

    // ------------------------------------------------------- drafts survive
    {
      type: 'eval', label: 'back to the log',
      expr: "const b=[...document.querySelectorAll('.sq-tasks-actionrow button')].find(x=>/back to log/i.test(x.textContent||'')); if(!b) return 'missing'; b.click(); return 'clicked';",
    },
    { type: 'wait', ms: 250 },
    { type: 'eval', label: 'start a draft on the second quest', expr: clickSubmitOn('Augsburg') },
    { type: 'waitFor', timeoutMs: 4000, expr: "return !!document.querySelector('.sq-tasks-area');", label: 'composer open again' },
    { type: 'eval', label: 'type half a paragraph', expr: typeIntoComposer('Augsburg settled the question by not answering it: cuius regio, eius religio.') },
    { type: 'wait', ms: 500 },
    { type: 'key', key: 'Escape', label: 'step back to the log' },
    { type: 'wait', ms: 200 },
    { type: 'key', key: 'Escape', label: 'close the panel entirely' },
    { type: 'wait', ms: 300 },
    { type: 'assert', label: 'the panel really closed', expr: "const s=document.querySelector('.sq-tasks-scrim'); return !!s && s.hidden;" },
    { type: 'key', key: 't', label: 'reopen the Task Log' },
    { type: 'wait', ms: 350 },
    {
      type: 'assert', label: 'the log flags the saved draft',
      expr: "const cards=[...document.querySelectorAll('.sq-tasks-card')]; const c=cards.find(x=>/Augsburg/.test(x.textContent||'')); return !!c && /draft saved/i.test(c.textContent||'');",
    },
    { type: 'eval', label: 'reopen that composer', expr: clickSubmitOn('Augsburg') },
    { type: 'waitFor', timeoutMs: 4000, expr: "return !!document.querySelector('.sq-tasks-area');", label: 'composer open' },
    {
      type: 'assert', label: 'the draft text survived the panel closing',
      expr: "const a=document.querySelector('.sq-tasks-area'); return !!a && /cuius regio/.test(a.value||'');",
    },
    { type: 'screenshot', file: 'v4-draft-restored.png', label: 'screenshot: a restored draft' },

    // ------------------------------------------- the self-grade fallback modal
    // main.js owns the global Escape: it unwinds the whole panel and, with
    // nothing open, raises the pause box. So get back to a clean, OPEN quest
    // log deliberately rather than assuming where Escape left us.
    { type: 'key', key: 'Escape', label: 'leave the composer' },
    { type: 'wait', ms: 300 },
    {
      type: 'eval', label: 'dismiss the pause box if Escape raised one',
      expr: "const b=[...document.querySelectorAll('.sq-pause-btn')].find(x=>/resume/i.test(x.textContent||'')); if(b) { b.click(); return 'resumed'; } return 'no pause box';",
    },
    { type: 'wait', ms: 300 },
    {
      type: 'eval', label: 'make sure the quest log is open',
      expr: "const s=document.querySelector('.sq-tasks-scrim'); if(s && s.hidden) window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true})); return 'ok';",
    },
    { type: 'waitFor', timeoutMs: 4000, label: 'the log is up', expr: "const s=document.querySelector('.sq-tasks-scrim'); return !!s && !s.hidden;" },
    {
      type: 'eval', label: 'open the self-grade fallback',
      expr: "const b=[...document.querySelectorAll('.sq-tasks-quiet')].find(x=>/self grade/i.test(x.textContent||'')); if(!b) return 'missing'; b.click(); return 'clicked';",
    },
    { type: 'waitFor', timeoutMs: 3000, label: 'the modal opens', expr: "const m=document.querySelector('.sq-tasks-modal'); return !!m && !m.hidden;" },
    {
      type: 'assert', label: 'it wears the same frame as everything else',
      expr: "const b=document.querySelector('.sq-tasks-modalbox'); return !!b && b.classList.contains('sq-theme-frame');",
    },
    {
      type: 'assert', label: 'and it is honest that self-grading forfeits the material drop',
      expr: "return /do not earn the material drop/i.test((document.querySelector('.sq-tasks-modal')||{}).textContent||'');",
    },
    { type: 'wait', ms: 500, label: 'let the modal finish rising before capturing it' },
    {
      // The assertions above are the real test; this capture is documentation.
      // CDP's captureScreenshot occasionally times out on a full nine-suite run
      // (a compositor stall, not a page problem), so it must not fail the suite.
      type: 'screenshot', file: 'v4-selfgrade-modal.png', optional: true,
      label: 'screenshot: the self-grade fallback',
    },
    {
      type: 'eval', label: 'cancel out of it',
      expr: "const b=[...document.querySelectorAll('.sq-tasks-modalrow button')].find(x=>/cancel/i.test(x.textContent||'')); if(!b) return 'missing'; b.click(); return 'clicked';",
    },
    { type: 'wait', ms: 250 },
    {
      type: 'assert', label: 'cancelling dismisses the modal without completing anything',
      expr: "const m=document.querySelector('.sq-tasks-modal'); return m.hidden;",
    },
    { type: 'api', route: '/api/state', label: 'and the self-graded quest was NOT completed by cancelling', path: 'state.tasks.1.status', equals: 'todo' },

    // ------------------------------------------------------ nothing exploded
    // The panel is dismissed with its own ✕ rather than Escape: Escape is
    // main.js's, it unwinds into the pause box, and 02-play already owns that
    // path. What matters here is that the world survived the whole sequence.
    { type: 'eval', label: 'close the log with its own button', expr: "const x=document.querySelector('.sq-tasks-panel .sq-theme-x'); if(!x) return 'missing'; x.click(); return 'clicked';" },
    { type: 'wait', ms: 500 },
    { type: 'assert', label: 'the log is closed', expr: "const s=document.querySelector('.sq-tasks-scrim'); return !!s && s.hidden;" },
    {
      type: 'assert', label: 'the world is still running underneath all of that',
      expr: "const b=document.getElementById('boot'); return !b || b.className !== 'error';",
    },
  ],
};
