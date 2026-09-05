// web/ui/tasks.js  [ENG-UI]
// The Quest Log, v4: a quest is no longer something you tick and self-rate. You
// submit the actual work, it gets graded, and the grade drives the reward.
//
// Three states per quest, plus the log itself:
//   list      the quest roll — every open quest offers SUBMIT WORK
//   composer  a real writing surface with the brief beside it
//   grading   a deliberate wait; this becomes a model round-trip later
//   graded    the reward moment: stamped rank, rubric, feedback, materials
//
// Dressed in the v3 parchment/gold language from theme.js. Exactly one <style>
// tag, every selector namespaced .sq-tasks-*.

import {
  SUBJECTS,
  WORK_TYPES,
  WORK_TYPE_IDS,
  RANK_COLOR,
} from '../../shared/constants.js';
import { injectTheme, el, num, MONO } from './theme.js';

const STYLE_ID = 'sq-tasks-style';

const QUALITY_LABELS = {
  1: 'scraped through',
  2: 'got there eventually',
  3: 'solid work',
  4: 'sharp and clean',
  5: 'nailed it',
};

const RANK_WORD = {
  S: 'Outstanding', A: 'Excellent', B: 'Strong',
  C: 'Solid', D: 'Thin', F: 'Not yet',
};

// Mirrored from server/grader.js. That file is the authority — the server
// enforces the cap and computes the real grade; these copies exist only so the
// composer can show a live target while you type (labelled "guide", never
// presented as the grade) and phrase the truncation warning.
const MAX_SUBMISSION_CHARS = 20000;
const WORDS_PER_ESTIMATED_MINUTE = 4;
const EXPECTED_WORDS_CEILING = 900;

function expectedWordsFor(task) {
  const est = Math.min(1440, Math.max(5, num(task && task.estMinutes, 30)));
  const diff = Math.min(5, Math.max(1, Math.round(num(task && task.difficulty, 3))));
  const demand = 0.85 + 0.075 * diff;
  return Math.min(EXPECTED_WORDS_CEILING, Math.max(60, Math.round(est * WORDS_PER_ESTIMATED_MINUTE * demand)));
}

function countWords(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function subjectOf(id) {
  return SUBJECTS.find((s) => s.id === id) || SUBJECTS[SUBJECTS.length - 1];
}

function workTypeName(id) {
  const w = WORK_TYPES[id];
  return w ? w.name : String(id || '—');
}

async function postJSON(route, body) {
  // The panel talks to the v4 quest routes directly: main.js owns the shared
  // `api` object and this module may not edit it. Everything else still goes
  // through `api`, and a successful call asks main.js to rebroadcast state so
  // the HUD and the world see the new coins too.
  try {
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: `network: ${(err && err.message) || err}` };
  }
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-tasks-scrim { z-index: 61; }
.sq-tasks-panel {
  width: min(1000px, 96vw); max-height: min(88vh, 860px);
  display: flex; flex-direction: column;
}
.sq-tasks-body { flex: 1 1 auto; min-height: 200px; }
.sq-tasks-count {
  font-size: 9px; letter-spacing: .16em; color: var(--sq-parchment-dim);
  border: 2px solid var(--sq-shade); padding: 4px 9px;
}

/* --- the quest roll ---------------------------------------------------- */
.sq-tasks-card { display: flex; align-items: stretch; margin-bottom: 9px; }
.sq-tasks-stripe { width: 7px; flex: 0 0 7px; }
.sq-tasks-cardmain { flex: 1 1 auto; min-width: 0; padding: 10px 13px; }
.sq-tasks-cardtitle {
  font-size: 12px; letter-spacing: .04em; color: #2c2113;
  margin-bottom: 6px; word-break: break-word; line-height: 1.5;
}
.sq-tasks-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sq-tasks-pips { font-size: 11px; color: #a8791f; letter-spacing: .16em; }
.sq-tasks-mins { font-size: 9px; color: #7a5a2c; font-variant-numeric: tabular-nums; }
.sq-tasks-due {
  font-size: 9px; letter-spacing: .08em; padding: 3px 7px;
  border: 2px solid #4c7a3a; color: #3d6630; background: rgba(255,255,255,.4);
}
.sq-tasks-due.sq-tasks-urgent { border-color: #a33c26; color: #a33c26; }
.sq-tasks-cardactions {
  display: flex; flex-direction: column; gap: 5px;
  align-items: stretch; justify-content: center; padding: 8px 10px 8px 0;
}
.sq-tasks-cardactions .sq-theme-btn { white-space: nowrap; }
.sq-tasks-quiet {
  font: inherit; font-size: 9px; letter-spacing: .12em; cursor: pointer;
  background: transparent; border: 0; padding: 3px 2px;
  color: #8a6a3c; text-decoration: underline;
}
.sq-tasks-quiet:hover { color: #5a4020; }

/* the little rank plaque on a finished quest */
.sq-tasks-rankchip {
  align-self: center; display: grid; place-items: center;
  width: 42px; height: 42px; margin-right: 10px; flex: 0 0 42px;
  font-size: 20px; font-weight: 800; line-height: 1;
  background: rgba(26,20,38,.88); border: 2px solid currentColor;
  text-shadow: 0 0 10px currentColor;
}
.sq-tasks-gradedhint { font-size: 9px; color: #7a5a2c; letter-spacing: .1em; }

/* --- the composer ------------------------------------------------------- */
.sq-tasks-composer { display: grid; grid-template-columns: 236px 1fr; gap: 16px; }
@media (max-width: 760px) { .sq-tasks-composer { grid-template-columns: 1fr; } }
.sq-tasks-brief { padding: 13px 14px; align-self: start; }
.sq-tasks-brieftitle {
  font-size: 12px; line-height: 1.55; color: #2c2113; margin-bottom: 10px;
  word-break: break-word;
}
.sq-tasks-briefrow {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 9.5px; letter-spacing: .08em; padding: 5px 0;
  border-top: 1px solid rgba(122,90,44,.22); color: #7a5a2c;
}
.sq-tasks-briefrow span:last-child { color: #2c2113; text-align: right; }
.sq-tasks-briefnote {
  margin-top: 11px; font-size: 9px; line-height: 1.7; color: #8a6a3c;
  border-left: 3px solid var(--sq-gold-deep); padding-left: 8px;
}
.sq-tasks-write { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.sq-tasks-area {
  font-family: ${MONO}; font-size: 12px; line-height: 1.75; letter-spacing: .02em;
  width: 100%; box-sizing: border-box; min-height: 300px; resize: vertical;
  padding: 14px 15px; color: #2c2113;
  background:
    repeating-linear-gradient(0deg, transparent 0 25px, rgba(122,90,44,.13) 25px 26px),
    linear-gradient(180deg, #fffaee, #f6e8c8);
  border: 2px solid #c9a86a; outline: none;
  box-shadow: inset 2px 2px 0 rgba(90,64,30,.10);
}
.sq-tasks-area:focus { border-color: var(--sq-gold-deep); box-shadow: inset 2px 2px 0 rgba(90,64,30,.10), 0 0 0 2px rgba(201,146,47,.35); }
.sq-tasks-area::placeholder { color: #b09468; }
.sq-tasks-gauge { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sq-tasks-gaugebar {
  position: relative; flex: 1 1 140px; height: 9px; min-width: 90px;
  background: rgba(90,64,30,.18); border: 2px solid #c9a86a; overflow: hidden;
}
.sq-tasks-gaugefill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold-deep));
  transition: width 260ms cubic-bezier(.2,.9,.3,1), background 260ms;
}
.sq-tasks-gaugefill.sq-tasks-met { background: linear-gradient(180deg, #9fe08a, #4c7a3a); }
.sq-tasks-gaugetext {
  font-size: 10px; letter-spacing: .08em; color: #5a4020;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.sq-tasks-attachrow { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.sq-tasks-file { display: none; }
.sq-tasks-attached {
  font-size: 9px; letter-spacing: .06em; color: #5a4020;
  border: 2px solid #c9a86a; background: rgba(255,255,255,.45); padding: 4px 8px;
}
.sq-tasks-actionrow { display: flex; gap: 9px; justify-content: flex-end; flex-wrap: wrap; }
.sq-tasks-actionrow .sq-tasks-spacer { flex: 1 1 auto; }

/* --- grading… ----------------------------------------------------------- */
.sq-tasks-waiting {
  display: flex; flex-direction: column; align-items: center; gap: 20px;
  padding: 60px 20px 64px; text-align: center;
}
.sq-tasks-seal {
  position: relative; width: 96px; height: 96px; display: grid; place-items: center;
  border: 3px solid var(--sq-gold-deep); border-radius: 50%;
  background: radial-gradient(circle at 42% 34%, #fff6dc, #e8cd92 62%, #c9922f);
  box-shadow: 0 0 0 6px rgba(201,146,47,.16), 4px 5px 0 rgba(90,64,30,.30);
  animation: sq-tasks-pulse 1.5s ease-in-out infinite;
}
.sq-tasks-seal::after {
  content: ''; position: absolute; inset: -13px;
  border: 3px dashed var(--sq-gold-deep); border-radius: 50%; opacity: .55;
  animation: sq-tasks-spin 4.5s linear infinite;
}
.sq-tasks-sealmark { font-size: 34px; color: #7a5a2c; }
.sq-tasks-waitline { font-size: 13px; letter-spacing: .26em; color: #5a4020; }
.sq-tasks-waitsub {
  font-size: 10px; line-height: 2; letter-spacing: .06em; color: #8a6a3c;
  max-width: 420px; min-height: 40px;
}
@keyframes sq-tasks-spin { to { transform: rotate(360deg); } }
@keyframes sq-tasks-pulse {
  0%, 100% { transform: scale(1); } 50% { transform: scale(1.055); }
}

/* --- the graded sheet --------------------------------------------------- */
.sq-tasks-sheet { display: flex; flex-direction: column; gap: 15px; }
.sq-tasks-verdict { display: flex; align-items: center; gap: 18px; padding: 16px 18px; flex-wrap: wrap; }
.sq-tasks-stamp {
  position: relative; flex: 0 0 auto;
  width: 108px; height: 108px; display: grid; place-items: center;
  font-size: 58px; font-weight: 800; line-height: 1;
  background: rgba(26,20,38,.92);
  border: 4px double currentColor;
  text-shadow: 0 0 22px currentColor, 0 3px 0 rgba(0,0,0,.7);
  transform: rotate(-6deg);
  box-shadow: 5px 6px 0 rgba(90,64,30,.32);
  animation: sq-tasks-slam 460ms cubic-bezier(.2,1.5,.4,1) both;
}
@keyframes sq-tasks-slam {
  0% { transform: rotate(-22deg) scale(2.1); opacity: 0; }
  60% { transform: rotate(-4deg) scale(.94); opacity: 1; }
  100% { transform: rotate(-6deg) scale(1); opacity: 1; }
}
.sq-tasks-verdicttext { flex: 1 1 200px; min-width: 0; }
.sq-tasks-verdictword { font-size: 16px; letter-spacing: .16em; color: #2c2113; }
.sq-tasks-verdictscore {
  font-size: 26px; font-weight: 800; color: #5a4020; margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.sq-tasks-verdictscore small { font-size: 12px; font-weight: 400; color: #8a6a3c; }
.sq-tasks-graderline {
  margin-top: 9px; font-size: 9px; line-height: 1.8; letter-spacing: .06em;
  color: #8a6a3c; border-left: 3px solid #c9a86a; padding-left: 8px;
}
.sq-tasks-graderline b { color: #7a5a2c; }

.sq-tasks-rubric { display: flex; flex-direction: column; gap: 0; }
.sq-tasks-row { padding: 10px 14px; border-bottom: 1px solid rgba(122,90,44,.20); }
.sq-tasks-row:last-child { border-bottom: 0; }
.sq-tasks-rowhead {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  font-size: 11px; letter-spacing: .08em; color: #2c2113;
}
.sq-tasks-rowscore { font-variant-numeric: tabular-nums; color: #5a4020; font-weight: 700; }
.sq-tasks-rowbar {
  position: relative; height: 8px; margin: 7px 0 6px;
  background: rgba(90,64,30,.16); border: 1px solid #c9a86a; overflow: hidden;
}
.sq-tasks-rowfill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold-deep));
  transition: width 620ms cubic-bezier(.2,.9,.3,1);
}
.sq-tasks-rowfill.sq-tasks-weak { background: linear-gradient(180deg, #e3a07f, #a33c26); }
.sq-tasks-rowfill.sq-tasks-strong { background: linear-gradient(180deg, #b6e08a, #4c7a3a); }
.sq-tasks-rowcomment { font-size: 9.5px; line-height: 1.75; color: #7a5a2c; }

.sq-tasks-prose { padding: 14px 16px; font-size: 11px; line-height: 1.95; color: #3a2c1e; }
.sq-tasks-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 680px) { .sq-tasks-lists { grid-template-columns: 1fr; } }
.sq-tasks-listbox { padding: 12px 14px; }
.sq-tasks-listhead { font-size: 9px; letter-spacing: .22em; margin-bottom: 8px; }
.sq-tasks-listhead.sq-tasks-good { color: #3d6630; }
.sq-tasks-listhead.sq-tasks-work { color: #a33c26; }
.sq-tasks-li { font-size: 10px; line-height: 1.85; color: #4a3a24; padding-left: 14px; position: relative; }
.sq-tasks-li::before { content: '◆'; position: absolute; left: 0; top: 0; font-size: 7px; color: #c9a86a; }

.sq-tasks-loot { display: flex; flex-wrap: wrap; gap: 9px; padding: 12px 14px; align-items: center; }
.sq-tasks-lootitem {
  display: flex; align-items: center; gap: 7px; padding: 6px 10px;
  border: 2px solid currentColor; background: rgba(26,20,38,.06);
  font-size: 10px; letter-spacing: .06em;
  animation: sq-tasks-pop 420ms cubic-bezier(.2,1.4,.4,1) both;
}
.sq-tasks-lootsym { font-size: 14px; }
@keyframes sq-tasks-pop {
  0% { transform: scale(.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; }
}
.sq-tasks-submitted {
  padding: 12px 14px; font-size: 10px; line-height: 1.85; color: #7a5a2c;
  max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word;
}

/* --- forms, timer, misc ------------------------------------------------- */
.sq-tasks-form { display: flex; flex-wrap: wrap; gap: 9px; align-items: flex-end; }
.sq-tasks-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sq-tasks-field.sq-tasks-widefield { flex: 1 1 220px; }
.sq-tasks-label { font-size: 8.5px; letter-spacing: .16em; color: #8a6a3c; }
.sq-tasks-input, .sq-tasks-select {
  font-family: ${MONO}; font-size: 11px; letter-spacing: .04em;
  padding: 6px 8px; box-sizing: border-box; height: 28px; line-height: 1;
  color: #2c2113; background: rgba(255,255,255,.55);
  border: 2px solid #c9a86a; outline: none; flex: 0 0 auto;
}
.sq-tasks-input:focus, .sq-tasks-select:focus { border-color: var(--sq-gold-deep); }
.sq-tasks-input.sq-tasks-wide { width: 100%; min-width: 0; }
.sq-tasks-num { width: 72px; }

.sq-tasks-fold {
  font: inherit; font-size: 10px; letter-spacing: .18em;
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  cursor: pointer; padding: 9px 12px; margin-bottom: 9px;
  color: #7a5a2c; background: rgba(255,255,255,.34);
  border: 2px solid #c9a86a;
}
.sq-tasks-fold:hover { color: #2c2113; border-color: var(--sq-gold-deep); }
.sq-tasks-foldbody { padding: 0 2px 4px; }
.sq-tasks-foldbody[hidden] { display: none; }

.sq-tasks-timer { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 14px; }
.sq-tasks-clock {
  font-size: 34px; font-weight: 800; line-height: 1; padding: 7px 15px;
  font-variant-numeric: tabular-nums;
  color: var(--sq-gold-bright); background: rgba(26,20,38,.92);
  border: 2px solid var(--sq-gold-deep);
  text-shadow: 0 0 14px rgba(255,204,92,.45);
}
.sq-tasks-clock.sq-tasks-running { color: #9fe08a; border-color: #4c7a3a; text-shadow: 0 0 14px rgba(159,224,138,.5); }
.sq-tasks-focusnote { font-size: 9px; letter-spacing: .08em; color: #8a6a3c; }

/* --- the self-grade fallback modal ------------------------------------- */
.sq-tasks-modal {
  position: fixed; inset: 0; z-index: 72;
  background: radial-gradient(120% 90% at 50% 40%, rgba(26,20,38,.62), rgba(12,9,20,.90));
  display: grid; place-items: center; padding: 20px;
  font-family: ${MONO};
}
.sq-tasks-modal[hidden] { display: none; }
.sq-tasks-modalbox { width: min(420px, 94vw); }
.sq-tasks-modalbody { display: flex; flex-direction: column; gap: 13px; }
.sq-tasks-modalsub { font-size: 10px; line-height: 1.8; color: #7a5a2c; word-break: break-word; }
.sq-tasks-stars { display: flex; gap: 7px; }
.sq-tasks-star {
  font: inherit; font-size: 19px; line-height: 1; width: 38px; height: 38px;
  cursor: pointer; color: #b09468; background: rgba(255,255,255,.4);
  border: 2px solid #c9a86a; transition: color 120ms, border-color 120ms, transform 90ms;
}
.sq-tasks-star:hover { transform: translateY(-2px); }
.sq-tasks-star.sq-tasks-on { color: var(--sq-gold-deep); border-color: var(--sq-gold-deep); background: rgba(255,233,168,.55); }
.sq-tasks-qlabel { font-size: 11px; color: #2c2113; letter-spacing: .06em; }
.sq-tasks-toggle { display: flex; align-items: center; gap: 9px; font-size: 10px; cursor: pointer; color: #4a3a24; }
.sq-tasks-toggledot { width: 16px; height: 16px; border: 2px solid #c9a86a; background: rgba(255,255,255,.5); }
.sq-tasks-toggle.sq-tasks-on .sq-tasks-toggledot { background: #4c7a3a; border-color: #4c7a3a; }
.sq-tasks-modalrow { display: flex; gap: 9px; justify-content: flex-end; }
`;
  document.head.appendChild(s);
}

export function createTasks(root, api) {
  injectTheme();
  injectStyle();

  const host = root || document.body;
  let state = null;
  let open = false;

  // view: 'list' | 'composer' | 'grading' | 'graded'
  let view = 'list';
  let focusTaskId = null;

  // Drafts live in the closure, so closing the panel (or walking off to chop a
  // tree) never costs the player a paragraph. Mirrored into localStorage so a
  // reload does not either — and every touch of storage is guarded, because a
  // private window throws on access rather than returning null.
  const drafts = new Map();
  const attachments = new Map();
  const DRAFT_KEY = 'sq.v4.quest.drafts';

  function loadDrafts() {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') drafts.set(k, v);
      }
    } catch { /* no storage, or junk in it — drafts simply start empty */ }
  }

  function saveDrafts() {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(drafts)));
    } catch { /* over quota or blocked; the in-memory map still works */ }
  }
  loadDrafts();

  // ---- session timer state (unchanged from v3) ---------------------------
  const timer = {
    running: false, startedAt: 0, accumMs: 0, interruptions: 0,
    subject: SUBJECTS[0].id, workType: WORK_TYPE_IDS[0],
  };
  let tickHandle = 0;

  function elapsedMs() {
    return timer.accumMs + (timer.running ? Date.now() - timer.startedAt : 0);
  }
  function fmtClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function focusScoreFor(n) { return n <= 0 ? 1.5 : (n <= 2 ? 1.0 : 0.5); }

  // ---- skeleton ----------------------------------------------------------
  const scrim = el('div', 'sq-theme-scrim sq-tasks-scrim');
  scrim.hidden = true;
  const panel = el('div', 'sq-theme-frame sq-theme-rise sq-tasks-panel');
  scrim.appendChild(panel);

  const head = el('div', 'sq-theme-head');
  const headTitle = el('div', 'sq-theme-title', 'QUEST LOG');
  const headSub = el('div', 'sq-theme-sub', '');
  head.appendChild(headTitle);
  head.appendChild(headSub);
  head.appendChild(el('div', 'sq-theme-spacer'));
  const headCount = el('div', 'sq-tasks-count', '0 OPEN');
  head.appendChild(headCount);
  const xBtn = el('button', 'sq-theme-x', '✕');
  xBtn.type = 'button';
  head.appendChild(xBtn);
  panel.appendChild(head);

  const body = el('div', 'sq-theme-body sq-tasks-body');
  panel.appendChild(body);

  const toast = el('div', 'sq-theme-toast');
  toast.hidden = true;
  panel.appendChild(toast);

  let toastTimer = 0;
  function say(msg, good) {
    toast.textContent = String(msg || '');
    toast.classList.toggle('sq-theme-ok', !!good);
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5200);
  }
  const showError = (m) => say(m || 'Something went wrong.', false);

  host.appendChild(scrim);

  function rule(text) {
    return el('div', 'sq-theme-rule', text);
  }

  function labeled(text, node, wide) {
    const f = el('div', `sq-tasks-field${wide ? ' sq-tasks-widefield' : ''}`);
    f.appendChild(el('div', 'sq-tasks-label', text));
    f.appendChild(node);
    return f;
  }

  function chip(text, color) {
    const c = el('span', 'sq-theme-chip', text);
    if (color) { c.style.color = color; c.style.borderColor = color; }
    return c;
  }

  function tasksOf() {
    return (state && Array.isArray(state.tasks)) ? state.tasks.filter(Boolean) : [];
  }
  function taskById(id) {
    return tasksOf().find((t) => t.id === id) || null;
  }

  /** Ask main.js to refetch and rebroadcast, so HUD and world see the reward. */
  async function refreshWorld(fallbackState) {
    let refreshed = false;
    try {
      if (window.sqMenu && typeof window.sqMenu.reloadState === 'function') {
        refreshed = await window.sqMenu.reloadState();
      }
    } catch { refreshed = false; }
    if (!refreshed && fallbackState) setState(fallbackState);
  }

  // =======================================================================
  // VIEW: the quest roll
  // =======================================================================

  const fTitle = el('input', 'sq-tasks-input sq-tasks-wide');
  fTitle.type = 'text'; fTitle.placeholder = 'Read chapter 4…'; fTitle.maxLength = 120;
  const fSubject = el('select', 'sq-tasks-select');
  for (const s of SUBJECTS) fSubject.appendChild(new Option(s.name, s.id));
  const fWork = el('select', 'sq-tasks-select');
  for (const id of WORK_TYPE_IDS) fWork.appendChild(new Option(WORK_TYPES[id].name, id));
  const fDiff = el('select', 'sq-tasks-select');
  for (let i = 1; i <= 5; i++) fDiff.appendChild(new Option('◆'.repeat(i), String(i)));
  fDiff.value = '3';
  const fEst = el('input', 'sq-tasks-input sq-tasks-num');
  fEst.type = 'number'; fEst.min = '5'; fEst.value = '60';
  const fDue = el('input', 'sq-tasks-input sq-tasks-num');
  fDue.type = 'number'; fDue.min = '0'; fDue.value = '3';
  const fAdd = el('button', 'sq-theme-btn sq-theme-go', 'ACCEPT QUEST');
  fAdd.type = 'button';
  let formOpen = false;

  fAdd.addEventListener('click', async () => {
    const title = String(fTitle.value || '').trim();
    if (!title) { showError('Give the quest a title first.'); fTitle.focus(); return; }
    fAdd.disabled = true;
    try {
      const res = await api.createTask({
        title,
        subject: fSubject.value,
        workType: fWork.value,
        difficulty: Math.max(1, Math.min(5, Math.round(num(fDiff.value, 3)))),
        estMinutes: Math.max(1, Math.round(num(fEst.value, 60))),
        dueInDays: Math.round(num(fDue.value, 3)),
      });
      if (res && res.ok) {
        fTitle.value = '';
        if (res.state) setState(res.state);
        say('Quest accepted.', true);
      } else showError((res && res.error) || 'Could not create that quest.');
    } catch (err) {
      showError(String((err && err.message) || err));
    } finally { fAdd.disabled = false; }
  });

  const tSubject = el('select', 'sq-tasks-select');
  for (const s of SUBJECTS) tSubject.appendChild(new Option(s.name, s.id));
  const tWork = el('select', 'sq-tasks-select');
  for (const id of WORK_TYPE_IDS) tWork.appendChild(new Option(WORK_TYPES[id].name, id));
  tSubject.value = timer.subject;
  tWork.value = timer.workType;
  tSubject.addEventListener('change', () => { timer.subject = tSubject.value; });
  tWork.addEventListener('change', () => { timer.workType = tWork.value; });

  const clock = el('div', 'sq-tasks-clock', '00:00');
  const startBtn = el('button', 'sq-theme-btn sq-theme-go', 'START');
  startBtn.type = 'button';
  const distractBtn = el('button', 'sq-theme-btn', 'I got distracted (0)');
  distractBtn.type = 'button';
  const focusNote = el('div', 'sq-tasks-focusnote', 'focus ×1.5');
  const mMinutes = el('input', 'sq-tasks-input sq-tasks-num');
  mMinutes.type = 'number'; mMinutes.min = '1'; mMinutes.value = '25';
  const mLogBtn = el('button', 'sq-theme-btn', 'Log manually');
  mLogBtn.type = 'button';

  function paintTimer() {
    clock.textContent = fmtClock(elapsedMs());
    clock.classList.toggle('sq-tasks-running', timer.running);
    startBtn.textContent = timer.running ? 'STOP & LOG' : (timer.accumMs > 0 ? 'RESUME' : 'START');
    distractBtn.textContent = `I got distracted (${timer.interruptions})`;
    focusNote.textContent = `focus ×${focusScoreFor(timer.interruptions)}`;
  }

  function ensureTick() {
    if (tickHandle) return;
    tickHandle = setInterval(() => { if (timer.running) paintTimer(); }, 500);
  }
  ensureTick();

  startBtn.addEventListener('click', async () => {
    if (!timer.running) {
      timer.running = true; timer.startedAt = Date.now(); paintTimer(); return;
    }
    timer.accumMs += Date.now() - timer.startedAt;
    timer.running = false;
    const minutes = Math.max(1, Math.ceil(timer.accumMs / 60000));
    const focusScore = focusScoreFor(timer.interruptions);
    timer.accumMs = 0; timer.interruptions = 0;
    paintTimer();
    await sendSession({ taskId: null, subject: timer.subject, workType: timer.workType, minutes, focusScore });
  });
  distractBtn.addEventListener('click', () => { timer.interruptions += 1; paintTimer(); });
  mLogBtn.addEventListener('click', async () => {
    await sendSession({
      taskId: null, subject: timer.subject, workType: timer.workType,
      minutes: Math.max(1, Math.ceil(num(mMinutes.value, 25))), focusScore: 1.0,
    });
  });

  async function sendSession(payload) {
    try {
      const res = await api.logSession(payload);
      if (res && res.ok) { if (res.state) setState(res.state); say('Session logged.', true); }
      else showError((res && res.error) || 'Could not log that session.');
    } catch (err) { showError(String((err && err.message) || err)); }
  }

  function pips(n) {
    const d = Math.max(0, Math.min(5, Math.round(num(n, 1))));
    return '◆'.repeat(d) + '◇'.repeat(5 - d);
  }

  function questCard(t) {
    const subj = subjectOf(t.subject);
    const done = t.status === 'done';
    const graded = t.grading && typeof t.grading === 'object';
    const card = el('div', 'sq-theme-card sq-tasks-card');
    if (done) card.style.opacity = '0.72';

    const stripe = el('div', 'sq-tasks-stripe');
    stripe.style.background = subj.color;
    card.appendChild(stripe);

    const main = el('div', 'sq-tasks-cardmain');
    main.appendChild(el('div', 'sq-tasks-cardtitle', t.title || '(untitled)'));
    const meta = el('div', 'sq-tasks-meta');
    meta.appendChild(chip(subj.name, subj.color));
    meta.appendChild(chip(workTypeName(t.workType)));
    meta.appendChild(el('span', 'sq-tasks-pips', pips(t.difficulty)));
    meta.appendChild(el('span', 'sq-tasks-mins',
      `${Math.round(num(t.minutesLogged, 0))} / ${Math.round(num(t.estMinutes, 0))} min`));

    if (t.dueInDays !== null && t.dueInDays !== undefined && Number.isFinite(Number(t.dueInDays))) {
      const d = Number(t.dueInDays);
      meta.appendChild(el('span', `sq-tasks-due${d <= 1 ? ' sq-tasks-urgent' : ''}`,
        d < 0 ? `${Math.abs(d)}d late` : (d === 0 ? 'due today' : `${d}d left`)));
    }
    if (drafts.get(t.id) && !done) meta.appendChild(chip('draft saved', '#7a5a2c'));
    main.appendChild(meta);
    if (graded) {
      main.appendChild(el('div', 'sq-tasks-gradedhint',
        `graded ${t.grading.score}/100 · ${t.grading.grader === 'stub' ? 'local estimate' : 'model'}`));
    }
    card.appendChild(main);

    if (done && t.rank) {
      const r = el('div', 'sq-tasks-rankchip', String(t.rank));
      r.style.color = RANK_COLOR[t.rank] || '#c9a86a';
      card.appendChild(r);
    }

    const actions = el('div', 'sq-tasks-cardactions');
    if (!done) {
      const submit = el('button', 'sq-theme-btn sq-theme-go', 'SUBMIT WORK');
      submit.type = 'button';
      submit.addEventListener('click', () => openComposer(t.id));
      actions.appendChild(submit);

      // The v3 self-grade path is kept, deliberately, for work that has no
      // submission to hand in — a lab you attended, a chapter you read.
      const quick = el('button', 'sq-tasks-quiet', 'no write-up — self grade');
      quick.type = 'button';
      quick.addEventListener('click', () => openSelfGrade(t));
      actions.appendChild(quick);
    } else if (graded) {
      const seeBtn = el('button', 'sq-theme-btn', 'SEE GRADE');
      seeBtn.type = 'button';
      seeBtn.addEventListener('click', () => showGraded(t.id, null, false));
      actions.appendChild(seeBtn);
    }
    if (actions.childNodes.length) card.appendChild(actions);
    return card;
  }

  function renderList() {
    body.textContent = '';
    const tasks = tasksOf();
    const todo = tasks.filter((t) => t.status !== 'done');
    const done = tasks.filter((t) => t.status === 'done');

    headTitle.textContent = 'QUEST LOG';
    headSub.textContent = 'submit the work, earn the rank';
    headCount.textContent = `${todo.length} OPEN`;

    body.appendChild(rule(`OPEN — ${todo.length}`));
    if (!todo.length) {
      body.appendChild(el('div', 'sq-theme-empty',
        'No open quests.\nAccept one below, or import your syllabus from the launch menu.'));
    }
    for (const t of todo) {
      try { body.appendChild(questCard(t)); } catch { /* skip a malformed row */ }
    }

    body.appendChild(rule(`COMPLETED — ${done.length}`));
    if (!done.length) {
      body.appendChild(el('div', 'sq-theme-empty', 'Nothing handed in yet.'));
    }
    for (const t of done.slice().reverse().slice(0, 25)) {
      try { body.appendChild(questCard(t)); } catch { /* skip */ }
    }

    // --- study session ---
    body.appendChild(rule('STUDY SESSION'));
    const tCard = el('div', 'sq-theme-card sq-tasks-timer');
    tCard.appendChild(labeled('Subject', tSubject));
    tCard.appendChild(labeled('Work type', tWork));
    tCard.appendChild(clock);
    tCard.appendChild(startBtn);
    tCard.appendChild(distractBtn);
    tCard.appendChild(focusNote);
    tCard.appendChild(labeled('Backfill minutes', mMinutes));
    tCard.appendChild(mLogBtn);
    body.appendChild(tCard);
    paintTimer();

    // --- new quest ---
    body.appendChild(rule('NEW QUEST'));
    const fold = el('button', 'sq-tasks-fold');
    fold.type = 'button';
    fold.appendChild(el('span', null, '＋ ACCEPT A NEW QUEST'));
    const mark = el('span', null, formOpen ? '▾' : '▸');
    fold.appendChild(mark);
    body.appendChild(fold);

    const formBody = el('div', 'sq-tasks-foldbody');
    formBody.hidden = !formOpen;
    const form = el('div', 'sq-tasks-form');
    form.appendChild(labeled('Title', fTitle, true));
    form.appendChild(labeled('Subject', fSubject));
    form.appendChild(labeled('Work type', fWork));
    form.appendChild(labeled('Difficulty', fDiff));
    form.appendChild(labeled('Est. minutes', fEst));
    form.appendChild(labeled('Due in days', fDue));
    form.appendChild(fAdd);
    formBody.appendChild(form);
    body.appendChild(formBody);

    fold.addEventListener('click', () => {
      formOpen = !formOpen;
      formBody.hidden = !formOpen;
      mark.textContent = formOpen ? '▾' : '▸';
      if (formOpen) fTitle.focus();
    });
  }

  // =======================================================================
  // VIEW: composer
  // =======================================================================

  function openComposer(taskId) {
    focusTaskId = taskId;
    view = 'composer';
    render();
  }

  function renderComposer() {
    const t = taskById(focusTaskId);
    if (!t) { view = 'list'; renderList(); return; }

    const subj = subjectOf(t.subject);
    headTitle.textContent = 'SUBMIT WORK';
    headSub.textContent = 'the grade replaces the star rating';
    headCount.textContent = (t.dueInDays === null || t.dueInDays === undefined || !Number.isFinite(Number(t.dueInDays)))
      ? 'NO DEADLINE'
      : (Number(t.dueInDays) < 0 ? `${Math.abs(Number(t.dueInDays))}D LATE` : `DUE IN ${t.dueInDays}D`);

    body.textContent = '';
    const wrap = el('div', 'sq-tasks-composer');

    // --- the brief, beside the writing surface -----------------------------
    const brief = el('div', 'sq-theme-card sq-tasks-brief');
    brief.appendChild(el('div', 'sq-theme-rule', 'THE BRIEF'));
    brief.appendChild(el('div', 'sq-tasks-brieftitle', t.title || '(untitled)'));
    const rows = [
      ['Subject', subj.name],
      ['Work type', workTypeName(t.workType)],
      ['Difficulty', pips(t.difficulty)],
      ['Estimated', `${Math.round(num(t.estMinutes, 0))} min`],
      ['Tracked', `${Math.round(num(t.minutesLogged, 0))} min`],
      ['Due', (t.dueInDays === null || t.dueInDays === undefined || !Number.isFinite(Number(t.dueInDays)))
        ? 'no deadline'
        : (Number(t.dueInDays) < 0 ? `${Math.abs(Number(t.dueInDays))}d late` : `in ${t.dueInDays}d`)],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'sq-tasks-briefrow');
      r.appendChild(el('span', null, k));
      r.appendChild(el('span', null, v));
      brief.appendChild(r);
    }
    brief.appendChild(el('div', 'sq-tasks-briefnote',
      'Write the actual work here, or attach a file from your machine — it is read locally and never uploaded anywhere but your own save.'));
    wrap.appendChild(brief);

    // --- the writing surface ----------------------------------------------
    const write = el('div', 'sq-tasks-write');
    const area = el('textarea', 'sq-tasks-area');
    area.placeholder = 'Write your answer, your notes, your essay…';
    area.value = drafts.get(t.id) || (t.submission && t.submission.text) || '';
    area.spellcheck = true;
    write.appendChild(area);

    const target = expectedWordsFor(t);
    const gauge = el('div', 'sq-tasks-gauge');
    const bar = el('div', 'sq-tasks-gaugebar');
    const fill = el('div', 'sq-tasks-gaugefill');
    bar.appendChild(fill);
    const gtext = el('div', 'sq-tasks-gaugetext', '');
    gauge.appendChild(gtext);
    gauge.appendChild(bar);
    write.appendChild(gauge);

    function paintGauge() {
      const w = countWords(area.value);
      const pct = Math.min(100, Math.round((w / target) * 100));
      fill.style.width = `${pct}%`;
      fill.classList.toggle('sq-tasks-met', w >= target * 0.85);
      gtext.textContent = `${w} words · ${area.value.length} chars · guide ${target}`;
    }
    paintGauge();

    let saveTimer = 0;
    area.addEventListener('input', () => {
      paintGauge();
      drafts.set(t.id, area.value);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveDrafts, 400);
    });

    // --- attach a file, read locally --------------------------------------
    const attachRow = el('div', 'sq-tasks-attachrow');
    const fileInput = el('input', 'sq-tasks-file');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.md,.markdown,.csv,.tex,.json,.rtf,text/*';
    const attachBtn = el('button', 'sq-theme-btn', '📎 ATTACH A FILE');
    attachBtn.type = 'button';
    attachBtn.addEventListener('click', () => fileInput.click());
    const attachedLabel = el('div', 'sq-tasks-attached', '');
    attachedLabel.hidden = !attachments.get(t.id);
    if (attachments.get(t.id)) attachedLabel.textContent = `attached: ${attachments.get(t.id)}`;

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        showError('That file is over 4 MB. Paste the relevant part instead.');
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => showError('That file could not be read.');
      reader.onload = () => {
        const text = String(reader.result || '');
        area.value = area.value.trim()
          ? `${area.value.trim()}\n\n--- ${file.name} ---\n${text}`
          : text;
        attachments.set(t.id, file.name);
        attachedLabel.textContent = `attached: ${file.name}`;
        attachedLabel.hidden = false;
        drafts.set(t.id, area.value);
        saveDrafts();
        paintGauge();
        say(`Read ${file.name} into the submission.`, true);
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    attachRow.appendChild(attachBtn);
    attachRow.appendChild(fileInput);
    attachRow.appendChild(attachedLabel);
    write.appendChild(attachRow);

    // --- actions -----------------------------------------------------------
    const actions = el('div', 'sq-tasks-actionrow');
    const back = el('button', 'sq-theme-btn', '← BACK TO LOG');
    back.type = 'button';
    back.addEventListener('click', () => { view = 'list'; render(); });
    const clearBtn = el('button', 'sq-theme-btn sq-theme-danger', 'CLEAR DRAFT');
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => {
      area.value = '';
      drafts.delete(t.id);
      attachments.delete(t.id);
      attachedLabel.hidden = true;
      saveDrafts();
      paintGauge();
      area.focus();
    });
    const submit = el('button', 'sq-theme-btn sq-theme-go', 'HAND IT IN →');
    submit.type = 'button';
    submit.addEventListener('click', () => {
      const text = area.value;
      if (!text.trim()) { showError('There is nothing to hand in yet.'); area.focus(); return; }
      doSubmit(t, text, attachments.get(t.id) || null);
    });

    actions.appendChild(back);
    actions.appendChild(clearBtn);
    actions.appendChild(el('div', 'sq-tasks-spacer'));
    actions.appendChild(submit);
    write.appendChild(actions);

    wrap.appendChild(write);
    body.appendChild(wrap);
    body.scrollTop = 0;
    setTimeout(() => { try { area.focus(); } catch { /* not focusable yet */ } }, 30);
  }

  // =======================================================================
  // VIEW: grading…
  // =======================================================================

  const WAIT_LINES = [
    'Reading the submission…',
    'Measuring it against the brief…',
    'Filling in the rubric…',
    'Writing the feedback…',
  ];
  let waitHandle = 0;

  function renderGrading() {
    headTitle.textContent = 'GRADING';
    headSub.textContent = 'this takes a moment';
    headCount.textContent = '…';
    body.textContent = '';

    const wrap = el('div', 'sq-tasks-waiting');
    const seal = el('div', 'sq-tasks-seal');
    seal.appendChild(el('div', 'sq-tasks-sealmark', '◈'));
    wrap.appendChild(seal);
    wrap.appendChild(el('div', 'sq-tasks-waitline', 'GRADING…'));
    const sub = el('div', 'sq-tasks-waitsub', WAIT_LINES[0]);
    wrap.appendChild(sub);
    body.appendChild(wrap);

    // The wait is deliberate and staged: once a model is wired in this really
    // is a multi-second round trip, and a UI that only learns that later will
    // have been designed for the wrong thing.
    let i = 0;
    if (waitHandle) clearInterval(waitHandle);
    waitHandle = setInterval(() => {
      i = (i + 1) % WAIT_LINES.length;
      sub.textContent = WAIT_LINES[i];
    }, 900);
  }

  function stopWaiting() {
    if (waitHandle) { clearInterval(waitHandle); waitHandle = 0; }
  }

  // =======================================================================
  // VIEW: graded
  // =======================================================================

  let lastReward = null;      // { payout, gradeDrops } from the most recent submit
  let lastGrading = null;

  function showGraded(taskId, reward, animate) {
    focusTaskId = taskId;
    lastReward = reward || null;
    view = 'graded';
    render(animate !== false);
  }

  function renderGraded(animate) {
    const t = taskById(focusTaskId);
    const g = (t && t.grading) || lastGrading;
    if (!t || !g) { view = 'list'; renderList(); return; }

    headTitle.textContent = 'GRADED';
    headSub.textContent = t.title || '';
    headCount.textContent = `${g.score}/100`;

    body.textContent = '';
    const sheet = el('div', 'sq-tasks-sheet');

    // --- the stamp ---------------------------------------------------------
    const verdict = el('div', 'sq-theme-card sq-tasks-verdict');
    const stamp = el('div', 'sq-tasks-stamp', String(g.rank));
    stamp.style.color = RANK_COLOR[g.rank] || '#c9a86a';
    if (!animate) stamp.style.animation = 'none';
    verdict.appendChild(stamp);

    const vt = el('div', 'sq-tasks-verdicttext');
    vt.appendChild(el('div', 'sq-tasks-verdictword', RANK_WORD[g.rank] || 'Graded'));
    const sc = el('div', 'sq-tasks-verdictscore', `${g.score}`);
    sc.appendChild(el('small', null, ' / 100'));
    vt.appendChild(sc);

    // Honesty about where the number came from is not a footnote; it sits
    // right under the score.
    const isStub = g.grader === 'stub';
    const line = el('div', 'sq-tasks-graderline');
    const b = el('b', null, isStub ? 'Estimated locally — no model configured. ' : `Graded by ${g.model || 'a language model'}. `);
    line.appendChild(b);
    line.appendChild(document.createTextNode(
      isStub
        ? 'This score is measured from length, deadline, difficulty and how much of the brief\'s vocabulary you used. Nothing read your argument.'
        : 'A model read the submission and filled in the rubric below.'
    ));
    line.appendChild(el('div', null, `confidence ${Math.round(num(g.confidence, 0) * 100)}%`));
    vt.appendChild(line);
    verdict.appendChild(vt);
    sheet.appendChild(verdict);

    // --- the reward --------------------------------------------------------
    const drops = (lastReward && Array.isArray(lastReward.gradeDrops)) ? lastReward.gradeDrops : [];
    const payout = lastReward && lastReward.payout;
    if (payout || drops.length) {
      sheet.appendChild(rule('REWARD'));
      const loot = el('div', 'sq-theme-card sq-tasks-loot');
      if (payout) {
        for (const [id, n] of Object.entries(payout.coins || {})) {
          if (num(n, 0) > 0) loot.appendChild(makeLoot(`+${n} ${id}`, '◈', '#7a5a2c'));
        }
        if (num(payout.xp, 0) > 0) loot.appendChild(makeLoot(`+${payout.xp} xp`, '✦', '#3d6630'));
        if (num(payout.darkBoxes, 0) > 0) loot.appendChild(makeLoot(`Dark Box ×${payout.darkBoxes}`, '▣', '#6b3fa0'));
      }
      for (const d of drops) loot.appendChild(makeLoot(`${d.name} ×${d.qty}`, '◆', '#a33c26'));
      if (!loot.childNodes.length) loot.appendChild(el('div', 'sq-tasks-gradedhint', 'No materials this time — rank A and above drops them.'));
      else if (drops.length) {
        loot.appendChild(el('div', 'sq-tasks-gradedhint', `rank ${g.rank} yielded materials`));
      }
      sheet.appendChild(loot);
    }

    // --- the rubric --------------------------------------------------------
    sheet.appendChild(rule('RUBRIC'));
    const rubric = el('div', 'sq-theme-card sq-tasks-rubric');
    const fills = [];
    for (const r of (Array.isArray(g.rubric) ? g.rubric : [])) {
      const row = el('div', 'sq-tasks-row');
      const rh = el('div', 'sq-tasks-rowhead');
      rh.appendChild(el('span', null, r.criterion));
      rh.appendChild(el('span', 'sq-tasks-rowscore', `${r.score} / ${r.max}`));
      row.appendChild(rh);
      const rb = el('div', 'sq-tasks-rowbar');
      const pct = r.max > 0 ? Math.max(0, Math.min(100, (r.score / r.max) * 100)) : 0;
      const rf = el('div', `sq-tasks-rowfill${pct < 40 ? ' sq-tasks-weak' : (pct >= 80 ? ' sq-tasks-strong' : '')}`);
      rb.appendChild(rf);
      row.appendChild(rb);
      if (r.comment) row.appendChild(el('div', 'sq-tasks-rowcomment', r.comment));
      rubric.appendChild(row);
      fills.push([rf, pct]);
    }
    sheet.appendChild(rubric);
    // Let the bars grow rather than appear — the rubric is the part worth reading.
    requestAnimationFrame(() => {
      for (const [node, pct] of fills) node.style.width = `${pct}%`;
    });

    // --- feedback ----------------------------------------------------------
    if (g.feedback) {
      sheet.appendChild(rule('FEEDBACK'));
      sheet.appendChild(el('div', 'sq-theme-card sq-tasks-prose', g.feedback));
    }

    const strengths = Array.isArray(g.strengths) ? g.strengths : [];
    const improvements = Array.isArray(g.improvements) ? g.improvements : [];
    if (strengths.length || improvements.length) {
      const lists = el('div', 'sq-tasks-lists');
      lists.appendChild(makeList('WHAT WORKED', strengths, 'sq-tasks-good', 'Nothing stood out.'));
      lists.appendChild(makeList('WHAT TO CHANGE', improvements, 'sq-tasks-work', 'Nothing obvious.'));
      sheet.appendChild(lists);
    }

    // --- what was handed in ------------------------------------------------
    if (t.submission && t.submission.text) {
      sheet.appendChild(rule('WHAT YOU HANDED IN'));
      const sub = el('div', 'sq-theme-card sq-tasks-submitted', t.submission.text);
      sheet.appendChild(sub);
      const note = [`${t.submission.words || 0} words`];
      if (t.submission.filename) note.push(`from ${t.submission.filename}`);
      if (t.submission.truncated) {
        note.push(`TRUNCATED — ${t.submission.originalChars} characters submitted, first ${t.submission.chars} kept and graded`);
      }
      sheet.appendChild(el('div', 'sq-tasks-gradedhint', note.join(' · ')));
    }

    // --- actions -----------------------------------------------------------
    const actions = el('div', 'sq-tasks-actionrow');
    const back = el('button', 'sq-theme-btn', '← BACK TO LOG');
    back.type = 'button';
    back.addEventListener('click', () => { view = 'list'; lastReward = null; render(); });
    actions.appendChild(back);
    actions.appendChild(el('div', 'sq-tasks-spacer'));

    const regrade = el('button', 'sq-theme-btn', 'REGRADE');
    regrade.type = 'button';
    regrade.addEventListener('click', () => doRegrade(t));
    actions.appendChild(regrade);

    const resubmit = el('button', 'sq-theme-btn sq-theme-go', 'RESUBMIT');
    resubmit.type = 'button';
    resubmit.addEventListener('click', () => {
      if (!drafts.get(t.id) && t.submission && t.submission.text) drafts.set(t.id, t.submission.text);
      openComposer(t.id);
    });
    actions.appendChild(resubmit);
    sheet.appendChild(actions);
    sheet.appendChild(el('div', 'sq-tasks-gradedhint',
      'Resubmitting regrades the work and updates this sheet. The reward for this quest has already been paid, so it is not paid twice.'));

    body.appendChild(sheet);
    body.scrollTop = 0;
  }

  function makeLoot(text, sym, color) {
    const n = el('div', 'sq-tasks-lootitem');
    n.style.color = color;
    n.appendChild(el('span', 'sq-tasks-lootsym', sym));
    n.appendChild(el('span', null, text));
    return n;
  }

  function makeList(title, items, cls, empty) {
    const box = el('div', 'sq-theme-card sq-tasks-listbox');
    box.appendChild(el('div', `sq-tasks-listhead ${cls}`, title));
    if (!items.length) box.appendChild(el('div', 'sq-tasks-li', empty));
    for (const s of items) box.appendChild(el('div', 'sq-tasks-li', s));
    return box;
  }

  // =======================================================================
  // actions
  // =======================================================================

  let busy = false;

  async function doSubmit(task, text, filename) {
    if (busy) return;
    busy = true;
    view = 'grading';
    render();
    // A floor on the wait: the grading state must not flash past. It is a real
    // multi-second round trip once a model is wired in, and the player should
    // learn its rhythm now.
    const started = Date.now();
    const res = await postJSON('/api/quest/submit', {
      taskId: task.id,
      submission: { kind: filename ? 'file' : 'text', text, filename: filename || undefined },
    });
    const wait = Math.max(0, 1200 - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    stopWaiting();
    busy = false;

    if (!res || !res.ok) {
      view = 'composer';
      render();
      showError((res && res.error) || 'Grading failed.');
      return;
    }
    drafts.delete(task.id);
    attachments.delete(task.id);
    saveDrafts();
    lastGrading = res.grading;
    await refreshWorld(res.state);
    if (res.truncated) {
      say(`Submission was over the ${MAX_SUBMISSION_CHARS} character cap — the first ${res.storedChars} were kept and graded.`, false);
    }
    showGraded(task.id, { payout: res.reward, gradeDrops: res.gradeDrops || [] }, true);
  }

  async function doRegrade(task) {
    if (busy) return;
    busy = true;
    view = 'grading';
    render();
    const started = Date.now();
    const res = await postJSON('/api/quest/regrade', { taskId: task.id });
    await new Promise((r) => setTimeout(r, Math.max(0, 1200 - (Date.now() - started))));
    stopWaiting();
    busy = false;
    if (!res || !res.ok) {
      view = 'graded';
      render(false);
      showError((res && res.error) || 'Could not regrade that quest.');
      return;
    }
    lastGrading = res.grading;
    await refreshWorld(res.state);
    showGraded(task.id, null, true);
    say('Regraded. No further reward — this quest was already paid.', true);
  }

  // ---- self-grade fallback modal -----------------------------------------
  const modal = el('div', 'sq-tasks-modal');
  modal.hidden = true;
  const modalBox = el('div', 'sq-theme-frame sq-tasks-modalbox');
  modal.appendChild(modalBox);
  const mHead = el('div', 'sq-theme-head');
  mHead.appendChild(el('div', 'sq-theme-title', 'HOW DID IT GO?'));
  modalBox.appendChild(mHead);
  const mBody = el('div', 'sq-theme-body sq-tasks-modalbody');
  modalBox.appendChild(mBody);
  const mSub = el('div', 'sq-tasks-modalsub', '');
  mBody.appendChild(mSub);
  mBody.appendChild(el('div', 'sq-tasks-modalsub',
    'No write-up to hand in, so you rate this one yourself. Self-graded quests do not earn the material drop that a graded submission can.'));
  const starsRow = el('div', 'sq-tasks-stars');
  const starBtns = [];
  const selfGrade = { taskId: null, quality: 3, onTime: true, busy: false };
  for (let i = 1; i <= 5; i++) {
    const sb = el('button', 'sq-tasks-star', '★');
    sb.type = 'button';
    sb.addEventListener('click', () => { selfGrade.quality = i; paintSelfGrade(); });
    starsRow.appendChild(sb);
    starBtns.push(sb);
  }
  mBody.appendChild(starsRow);
  const qLabel = el('div', 'sq-tasks-qlabel', '');
  mBody.appendChild(qLabel);
  const onTimeToggle = el('div', 'sq-tasks-toggle');
  onTimeToggle.appendChild(el('div', 'sq-tasks-toggledot'));
  onTimeToggle.appendChild(el('span', null, 'Handed in on time'));
  onTimeToggle.addEventListener('click', () => { selfGrade.onTime = !selfGrade.onTime; paintSelfGrade(); });
  mBody.appendChild(onTimeToggle);
  const mRow = el('div', 'sq-tasks-modalrow');
  const mCancel = el('button', 'sq-theme-btn', 'Cancel');
  mCancel.type = 'button';
  const mSubmit = el('button', 'sq-theme-btn sq-theme-go', 'COMPLETE');
  mSubmit.type = 'button';
  mRow.appendChild(mCancel);
  mRow.appendChild(mSubmit);
  mBody.appendChild(mRow);
  host.appendChild(modal);

  function paintSelfGrade() {
    for (let i = 0; i < 5; i++) starBtns[i].classList.toggle('sq-tasks-on', i < selfGrade.quality);
    qLabel.textContent = QUALITY_LABELS[selfGrade.quality] || '';
    onTimeToggle.classList.toggle('sq-tasks-on', !!selfGrade.onTime);
    mSubmit.disabled = selfGrade.busy;
  }

  function openSelfGrade(task) {
    selfGrade.taskId = task.id;
    selfGrade.quality = 3;
    selfGrade.onTime = !(Number.isFinite(Number(task.dueInDays)) && Number(task.dueInDays) < 0);
    selfGrade.busy = false;
    mSub.textContent = String(task.title || '');
    paintSelfGrade();
    modal.hidden = false;
  }

  function closeSelfGrade() { modal.hidden = true; selfGrade.taskId = null; }
  mCancel.addEventListener('click', closeSelfGrade);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeSelfGrade(); });
  mSubmit.addEventListener('click', async () => {
    if (!selfGrade.taskId || selfGrade.busy) return;
    selfGrade.busy = true;
    paintSelfGrade();
    try {
      const res = await api.completeTask({
        taskId: selfGrade.taskId, quality: selfGrade.quality, onTime: !!selfGrade.onTime,
      });
      closeSelfGrade();
      if (res && res.ok) { if (res.state) setState(res.state); }
      else showError((res && res.error) || 'Could not complete that quest.');
    } catch (err) {
      closeSelfGrade();
      showError(String((err && err.message) || err));
    } finally {
      selfGrade.busy = false;
      paintSelfGrade();
    }
  });

  // =======================================================================
  // plumbing
  // =======================================================================

  function render(animate) {
    try {
      if (view === 'composer') renderComposer();
      else if (view === 'grading') renderGrading();
      else if (view === 'graded') renderGraded(animate !== false);
      else renderList();
    } catch (err) {
      body.textContent = '';
      body.appendChild(el('div', 'sq-theme-empty', 'The quest log could not be drawn.'));
      if (typeof console !== 'undefined') console.error('[sq-tasks] render', err);
    }
  }

  function isTypingInside() {
    const a = document.activeElement;
    if (!a || !scrim.contains(a)) return false;
    const tag = a.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  }

  let pendingRender = false;

  function setState(next) {
    try {
      state = next || null;
      if (!open) return;
      // A rebuild while the composer holds focus would eat the caret mid-word.
      // The draft is already in the map, so deferring is safe.
      if (isTypingInside() || view === 'grading') { pendingRender = true; return; }
      pendingRender = false;
      render(false);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-tasks] setState', err);
    }
  }

  scrim.addEventListener('focusout', () => {
    setTimeout(() => {
      if (pendingRender && !isTypingInside() && view !== 'grading') { pendingRender = false; render(false); }
    }, 0);
  });

  function doOpen() {
    open = true;
    scrim.hidden = false;
    if (view === 'grading') view = 'list';
    panel.classList.remove('sq-theme-rise');
    void panel.offsetWidth;
    panel.classList.add('sq-theme-rise');
    render(false);
    body.scrollTop = 0;
  }

  function doClose() {
    open = false;
    scrim.hidden = true;
    stopWaiting();
    closeSelfGrade();
    toast.hidden = true;
    // The draft survives: it is in `drafts`, not in the DOM that just went away.
    if (view === 'grading') view = 'list';
  }

  function toggle() { if (open) doClose(); else doOpen(); }

  xBtn.addEventListener('click', doClose);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) doClose(); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) { closeSelfGrade(); return; }
    if (!open) return;
    // Esc steps back through the views before it closes the panel.
    if (view === 'composer' || view === 'graded') { view = 'list'; render(false); return; }
    if (view === 'grading') return;
    doClose();
  });

  paintTimer();
  paintSelfGrade();

  return {
    setState,
    toggle,
    open: doOpen,
    close: doClose,
    isOpen: () => open,
  };
}

export default createTasks;
