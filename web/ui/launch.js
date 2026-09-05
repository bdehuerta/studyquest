// web/ui/launch.js  [ENG-UI]
// The title screen. It is the app's entry point, shown before the world exists,
// and it is the ONLY place saves are managed — the old in-game saves panel is
// gone. Nothing here mutates game state directly: slot writes go straight to
// /api/slots/*, and loading a slot goes through api.switchSlot (which reloads).
//
// Exactly one <style> tag, every selector namespaced .sq-launch-*.

import { MAX_SAVE_SLOTS } from '../../shared/constants.js';
import {
  injectTheme, el, num, formatPlaytime, formatRelative,
} from './theme.js';

const STYLE_ID = 'sq-launch-style';
const SLOT_COUNT = Number(MAX_SAVE_SLOTS) || 5;
const SETTINGS_KEY = 'sq.settings.v3';

/** Menu music volume, 0..100. The default matches VOLUME in ui/music.js. */
export const DEFAULT_MUSIC_VOLUME = 34;

export function readSettings() {
  const base = {
    motion: true, eventLog: true, flourish: true,
    musicVolume: DEFAULT_MUSIC_VOLUME,
  };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      // Booleans and numbers are read separately. The loop used to accept only
      // booleans, so a numeric setting added later would have been silently
      // dropped on every read and the slider would have snapped back to its
      // default every time the menu was reopened.
      for (const k of Object.keys(base)) {
        if (typeof base[k] === 'boolean' && typeof parsed[k] === 'boolean') base[k] = parsed[k];
        if (typeof base[k] === 'number' && Number.isFinite(Number(parsed[k]))) {
          base[k] = Math.max(0, Math.min(100, Math.round(Number(parsed[k]))));
        }
      }
    }
  } catch (err) { /* storage can be denied; defaults are fine */ }
  return base;
}

/**
 * Written to BOTH places, and the disk copy is the one that matters.
 *
 * localStorage is keyed by origin, and the native shell binds the server to a
 * free port chosen at launch — so every launch was a new origin with an empty
 * store, and every setting appeared to reset itself. localStorage is kept as a
 * synchronous cache so the first paint has the right values without waiting on
 * a fetch; `/api/settings` is what survives the restart.
 */
function writeSettings(s) {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
  catch (err) { /* nothing we can do, and nothing that should break the menu */ }
  try {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: s }),
    }).catch(() => {});
  } catch (err) { /* a menu must never fail on a failed save of a preference */ }
}

/**
 * Pull the stored settings off the server into the local cache. Called once at
 * boot, BEFORE the menu paints or the music starts, so the slider and the
 * toggles come up where they were left.
 *
 * Anything that goes wrong leaves the cached/default values in place: settings
 * are a convenience, and no failure here may stop the game loading.
 */
export async function hydrateSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    const stored = json && json.settings;
    if (!stored || typeof stored !== 'object' || !Object.keys(stored).length) {
      // Nothing on disk yet — seed it from whatever this origin already had, so
      // the first run after this change keeps the settings you can see.
      writeSettings(readSettings());
      return readSettings();
    }
    const merged = Object.assign({}, readSettings(), stored);
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch { /* cache only */ }
    return readSettings();
  } catch (err) {
    return readSettings();
  }
}

async function postJson(route, body) {
  try {
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json();
    if (!json || typeof json !== 'object') return { ok: false, error: 'the server sent back something unreadable' };
    return json;
  } catch (err) {
    return { ok: false, error: `could not reach the server (${(err && err.message) || 'network error'})` };
  }
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-launch-root {
  position: fixed; inset: 0; z-index: 90;
  font-family: var(--sq-mono); color: var(--sq-text);
  display: grid; grid-template-rows: auto 1fr auto;
  /* Translucent on purpose: #menubg paints the scene behind this and an opaque
     ground here made it invisible. Keep enough veil for text to stay legible. */
  background:
    radial-gradient(90% 70% at 50% 8%, rgba(255,204,92,.10), rgba(255,204,92,0) 60%),
    linear-gradient(180deg, rgba(20,14,34,.72) 0%, rgba(14,10,24,.80) 55%, rgba(10,7,18,.88) 100%);
  overflow: hidden;
  animation: sq-launch-in 320ms ease-out both;
}
.sq-launch-root[hidden] { display: none; }
.sq-launch-root.sq-launch-out { animation: sq-launch-out 260ms ease-in both; }

/* drifting pixel motes — depth without blur */
.sq-launch-motes {
  position: absolute; inset: 0; pointer-events: none; opacity: .55;
  background-image:
    radial-gradient(2px 2px at 12% 22%, var(--sq-gold) 50%, transparent 51%),
    radial-gradient(2px 2px at 78% 14%, var(--sq-parchment) 50%, transparent 51%),
    radial-gradient(2px 2px at 34% 72%, var(--sq-anemo) 50%, transparent 51%),
    radial-gradient(2px 2px at 88% 64%, var(--sq-gold-bright) 50%, transparent 51%),
    radial-gradient(2px 2px at 58% 40%, var(--sq-electro) 50%, transparent 51%),
    radial-gradient(2px 2px at 22% 52%, var(--sq-gold) 50%, transparent 51%);
  animation: sq-launch-drift 14s linear infinite alternate;
}

/* ---- title ------------------------------------------------------------ */
.sq-launch-titlewrap {
  position: relative; z-index: 2; text-align: center;
  padding: 46px 24px 18px;
}
.sq-launch-crest {
  display: inline-block; margin-bottom: 10px;
  font-size: 26px; line-height: 1; color: var(--sq-gold);
  text-shadow: 0 0 18px rgba(255,204,92,.5);
  animation: sq-launch-breathe 4.2s ease-in-out infinite;
}
.sq-launch-title {
  font-size: 40px; font-weight: 700; letter-spacing: .34em;
  color: var(--sq-parchment);
  text-shadow:
    0 2px 0 var(--sq-gold-deep), 0 4px 0 #6b4d1a, 0 6px 0 rgba(10,7,18,.9),
    0 0 26px rgba(255,204,92,.30);
}
.sq-launch-rule {
  margin: 14px auto 0; width: min(560px, 76vw); height: 2px;
  background: linear-gradient(90deg, rgba(201,146,47,0), var(--sq-gold), rgba(201,146,47,0));
}
.sq-launch-title {
  font-size: clamp(38px, 7vw, 78px) !important;
  font-weight: 700 !important;
  letter-spacing: 0.16em !important;
  text-shadow: 0 3px 0 rgba(10,7,18,.9), 0 0 26px rgba(255,204,92,.35);
}
.sq-launch-tag {
  margin-top: 12px; font-size: 10px; letter-spacing: .28em; color: var(--sq-text-dim);
}

/* ---- slot grid -------------------------------------------------------- */
.sq-launch-gate {
  display: grid; place-items: center; align-content: center; gap: 18px;
}
.sq-launch-gate[hidden] { display: none; }
.sq-launch-play {
  font: inherit; font-size: 20px; letter-spacing: 0.34em; cursor: pointer;
  color: var(--sq-ink); background: var(--sq-gold);
  border: 3px solid var(--sq-gold-bright);
  box-shadow: 0 0 0 3px rgba(20,14,34,.85), 0 6px 0 rgba(0,0,0,.45);
  padding: 16px 54px 16px 60px;
  animation: sq-launch-pulse 2.4s ease-in-out infinite;
}
.sq-launch-play:hover { background: var(--sq-gold-bright); }
.sq-launch-play:active { transform: translateY(2px); box-shadow: 0 0 0 3px rgba(20,14,34,.85), 0 3px 0 rgba(0,0,0,.45); }
@keyframes sq-launch-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.14); }
}
.sq-launch-stage[hidden] { display: none !important; }
.sq-launch-stage {
  position: relative; z-index: 2; overflow: auto;
  padding: 10px 26px 18px;
}
.sq-launch-stage::-webkit-scrollbar { width: 10px; }
.sq-launch-stage::-webkit-scrollbar-thumb { background: var(--sq-gold-deep); }
.sq-launch-grid {
  display: grid; gap: 14px; margin: 0 auto; width: min(1080px, 100%);
  grid-template-columns: repeat(auto-fit, minmax(198px, 1fr));
}
.sq-launch-slot {
  position: relative; padding: 16px 15px 14px; text-align: left; cursor: pointer;
  font: inherit; color: var(--sq-text);
  background: linear-gradient(180deg, var(--sq-slate-light) 0%, var(--sq-slate) 60%, #1f1930 100%);
  border: 2px solid var(--sq-shade); outline: 2px solid rgba(10,7,18,.85);
  box-shadow: 4px 5px 0 rgba(10,7,18,.62);
  transition: transform 140ms cubic-bezier(.2,.9,.3,1.1), border-color 140ms, box-shadow 140ms;
  animation: sq-launch-card 380ms cubic-bezier(.16,.9,.3,1.03) both;
}
.sq-launch-slot:hover { transform: translate(-1px, -3px); border-color: var(--sq-gold); box-shadow: 6px 8px 0 rgba(10,7,18,.7); }
.sq-launch-slot.sq-launch-recent { border-color: var(--sq-gold-deep); }
.sq-launch-slot.sq-launch-recent::after {
  content: 'MOST RECENT'; position: absolute; top: -2px; right: -2px;
  font-size: 8px; letter-spacing: .14em; padding: 3px 7px;
  color: var(--sq-ink); background: var(--sq-gold);
}
.sq-launch-slot.sq-launch-empty { border-style: dashed; background: rgba(42,35,64,.5); }
.sq-launch-slotno {
  font-size: 9px; letter-spacing: .22em; color: var(--sq-gold-deep);
}
.sq-launch-slotname {
  margin-top: 6px; font-size: 15px; letter-spacing: .10em; color: var(--sq-parchment);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sq-launch-slotlv {
  margin-top: 10px; display: inline-block; font-size: 10px; letter-spacing: .12em;
  color: var(--sq-ink); background: var(--sq-gold); padding: 2px 8px;
}
.sq-launch-meta { margin-top: 12px; font-size: 9px; line-height: 1.9; color: var(--sq-text-dim); }
.sq-launch-meta b { color: var(--sq-parchment-dim); font-weight: 400; }
.sq-launch-emptyline { margin-top: 18px; font-size: 11px; color: var(--sq-text-dim); }
.sq-launch-plus {
  margin-top: 12px; font-size: 26px; line-height: 1; color: var(--sq-gold-deep);
}
.sq-launch-slotacts { margin-top: 13px; display: flex; gap: 6px; flex-wrap: wrap; }
.sq-launch-mini {
  font: inherit; font-size: 9px; letter-spacing: .12em; cursor: pointer;
  color: var(--sq-parchment-dim); background: rgba(10,7,18,.55);
  border: 2px solid var(--sq-shade); padding: 5px 9px;
  transition: color 120ms, border-color 120ms;
}
.sq-launch-mini:hover { color: var(--sq-gold-bright); border-color: var(--sq-gold); }
.sq-launch-mini.sq-launch-danger:hover { color: var(--sq-bad); border-color: var(--sq-bad); }
.sq-launch-input {
  font: inherit; font-size: 11px; width: 100%; margin-top: 10px; padding: 6px 8px;
  color: var(--sq-parchment); background: var(--sq-ink);
  border: 2px solid var(--sq-gold-deep); outline: none;
}
.sq-launch-confirm {
  margin-top: 10px; padding: 9px 10px; font-size: 9px; line-height: 1.8;
  color: #ffd8cd; border: 2px solid var(--sq-bad); background: rgba(226,101,74,.14);
}

/* The one green button in the game. It is green because it is not part of the
   game — it is a workshop tool, and it should never be mistaken for a thing the
   scholar can do. */
.sq-launch-dev {
  border-color: #4e9a5a !important;
  color: #8fe0a0 !important;
}
.sq-launch-dev:hover { background: rgba(78,154,90,.18) !important; }

/* ---- the music volume row ---- */
.sq-launch-vol { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.sq-launch-volslider {
  width: 132px; accent-color: #c9922f; cursor: pointer;
}
.sq-launch-volread {
  min-width: 42px; text-align: right;
  font-size: 11px; letter-spacing: .08em; color: #4a4636;
}
.sq-launch-volread.sq-launch-voloff { color: #9a5040; }

/* ---- the developer sheet ----
   The sheet body is PARCHMENT, so everything in here is dark-on-light. The
   first pass reused the footer button's light-green-on-dark and it came out
   almost invisible against the paper — the same colour has to mean the same
   thing in two very different places, which means two rules, not one. */
.sq-launch-devbox { display: grid; gap: 12px; min-width: 320px; }
.sq-launch-devrow { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.sq-launch-devrow label {
  font-size: 10px; letter-spacing: .12em; color: #4a4636;
}
.sq-launch-devrow input {
  width: 90px; padding: 5px 7px; font: inherit; font-size: 12px;
  background: #fffdf7; color: #10100c;
  border: 2px solid #10100c;
}
/* The grant button, ON PARCHMENT: solid green with dark text. */
.sq-launch-devbox .sq-launch-dev {
  background: #4e9a5a !important;
  border-color: #2f6b3c !important;
  color: #08170c !important;
  font-weight: 700;
}
.sq-launch-devbox .sq-launch-dev:hover { background: #5fb06c !important; }
.sq-launch-devbox .sq-launch-dev:disabled { opacity: .65; }
.sq-launch-devnote {
  font-size: 10px; line-height: 1.55; color: #4a4636;
  border-top: 1px solid rgba(16,16,12,.22); padding-top: 9px;
}

/* ---- footer ----------------------------------------------------------- */
.sq-launch-foot[hidden] { display: none !important; }
.sq-launch-foot {
  position: relative; z-index: 2;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 16px 26px 22px;
  border-top: 2px solid var(--sq-gold-deep);
  background: linear-gradient(180deg, rgba(26,20,38,0), rgba(10,7,18,.85));
}
.sq-launch-big {
  font: inherit; font-size: 12px; letter-spacing: .20em; font-weight: 700; cursor: pointer;
  color: var(--sq-ink); padding: 12px 26px;
  background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold-deep));
  border: 2px solid var(--sq-gold-bright); box-shadow: 3px 3px 0 rgba(10,7,18,.7);
  transition: transform 90ms, box-shadow 90ms, filter 140ms;
}
.sq-launch-big:hover:not(:disabled) { filter: brightness(1.12); }
.sq-launch-big:active:not(:disabled) { transform: translate(2px,2px); box-shadow: none; }
.sq-launch-big:disabled { opacity: .4; cursor: not-allowed; }
.sq-launch-status {
  margin-left: auto; font-size: 10px; letter-spacing: .08em; color: var(--sq-text-dim);
  max-width: 46%; text-align: right;
}
.sq-launch-status.sq-launch-bad { color: #ffb3a3; }
.sq-launch-status.sq-launch-ok { color: var(--sq-good); }

/* ---- settings sheet --------------------------------------------------- */
.sq-launch-sheet {
  position: fixed; inset: 0; z-index: 130; display: grid; place-items: center;
  background: rgba(12,9,20,.86); padding: 30px;
  animation: sq-launch-in 180ms ease-out both;
}
.sq-launch-sheet[hidden] { display: none; }
.sq-launch-sheetbox { width: min(460px, 92vw); }
.sq-launch-sheetbody { padding: 18px 20px 20px; }
.sq-launch-opt {
  display: flex; align-items: center; gap: 12px; padding: 11px 0;
  border-bottom: 1px solid rgba(201,146,47,.35); font-size: 11px; color: #4a3620;
}
.sq-launch-opt:last-child { border-bottom: 0; }
.sq-launch-optname { flex: 1 1 auto; }
.sq-launch-optdesc { display: block; margin-top: 3px; font-size: 9px; color: #8a6a3c; }
.sq-launch-toggle {
  font: inherit; font-size: 9px; letter-spacing: .14em; cursor: pointer;
  min-width: 56px; padding: 6px 10px; color: #5a4020;
  background: rgba(255,255,255,.5); border: 2px solid #c9a86a;
  transition: background 130ms, color 130ms, border-color 130ms;
}
.sq-launch-toggle.sq-launch-on {
  color: var(--sq-ink); background: var(--sq-gold); border-color: var(--sq-gold-deep); font-weight: 700;
}
.sq-launch-sheetfoot { display: flex; gap: 8px; justify-content: flex-end; padding: 14px 20px 16px; }

@keyframes sq-launch-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes sq-launch-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes sq-launch-card {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sq-launch-breathe {
  0%, 100% { transform: translateY(0); opacity: .9; }
  50% { transform: translateY(-4px); opacity: 1; }
}
@keyframes sq-launch-drift {
  from { transform: translate3d(0,0,0); } to { transform: translate3d(-24px,-18px,0); }
}
@media (prefers-reduced-motion: reduce) {
  .sq-launch-root, .sq-launch-slot, .sq-launch-motes, .sq-launch-crest { animation: none; }
}
`;
  document.head.appendChild(s);
}

export function createLaunch(root, api) {
  injectTheme();
  injectStyle();

  const host = root || document.body;
  let visible = false;
  let slots = [];
  let loaded = false;
  let busy = false;
  let state = null;
  // Which slot card is currently showing an inline editor, and of what kind.
  let editing = null;   // { slot, mode: 'rename' | 'create' | 'delete' }

  const wrap = el('div', 'sq-launch-root');
  wrap.hidden = true;
  wrap.appendChild(el('div', 'sq-launch-motes'));

  // --- title
  const titleWrap = el('div', 'sq-launch-titlewrap');
  titleWrap.appendChild(el('div', 'sq-launch-crest', '✦'));
  titleWrap.appendChild(el('div', 'sq-launch-title', 'STUDYQUEST'));
  titleWrap.appendChild(el('div', 'sq-launch-rule'));
  wrap.appendChild(titleWrap);

  // --- slots
  // The first thing you see is the title and PLAY. The save slots are a second
  // step, so the opening screen is not a wall of empty cards.
  const gateWrap = el('div', 'sq-launch-gate');
  const playBtn = el('button', 'sq-launch-play', 'PLAY');
  gateWrap.appendChild(playBtn);
  wrap.appendChild(gateWrap);

  const stage = el('div', 'sq-launch-stage');
  const grid = el('div', 'sq-launch-grid');
  stage.appendChild(grid);
  wrap.appendChild(stage);

  // --- footer
  const foot = el('div', 'sq-launch-foot');
  const continueBtn = el('button', 'sq-launch-big', 'CONTINUE');
  continueBtn.type = 'button';
  foot.appendChild(continueBtn);

  const settingsBtn = el('button', 'sq-theme-btn', 'SETTINGS');
  settingsBtn.type = 'button';
  foot.appendChild(settingsBtn);

  // DEVELOPER MODE. Green, and on the launch screen rather than in the game,
  // because it is a thing you set UP a save with, not something you reach for
  // mid-play. It grants; it does not switch anything on — see /api/dev/grant.
  const devBtn = el('button', 'sq-theme-btn sq-launch-dev', 'DEVELOPER MODE');
  devBtn.type = 'button';
  devBtn.title = 'Set a level, hand over money and gear, repair everything. Marks the save.';
  foot.appendChild(devBtn);

  const quitBtn = el('button', 'sq-theme-btn sq-theme-danger', 'QUIT');
  quitBtn.type = 'button';
  foot.appendChild(quitBtn);

  const status = el('div', 'sq-launch-status', '');
  foot.appendChild(status);
  wrap.appendChild(foot);

  // --- settings sheet
  const sheet = el('div', 'sq-launch-sheet');
  sheet.hidden = true;
  const sheetBox = el('div', 'sq-theme-frame sq-theme-rise sq-launch-sheetbox');
  const sheetHead = el('div', 'sq-theme-head');
  const sheetTitle = el('div', 'sq-theme-title', 'SETTINGS');
  sheetHead.appendChild(sheetTitle);
  sheetHead.appendChild(el('div', 'sq-theme-spacer'));
  const sheetX = el('button', 'sq-theme-x', '✕');
  sheetX.type = 'button';
  sheetHead.appendChild(sheetX);
  sheetBox.appendChild(sheetHead);
  const sheetBody = el('div', 'sq-theme-body sq-launch-sheetbody');
  sheetBox.appendChild(sheetBody);
  const sheetFoot = el('div', 'sq-launch-sheetfoot');
  const sheetDone = el('button', 'sq-theme-btn sq-theme-go', 'DONE');
  sheetDone.type = 'button';
  sheetFoot.appendChild(sheetDone);
  sheetBox.appendChild(sheetFoot);
  sheet.appendChild(sheetBox);
  wrap.appendChild(sheet);

  host.appendChild(wrap);

  const OPTIONS = [
    { key: 'motion', name: 'Panel motion', desc: 'Panels ease in and cards lift on hover.' },
    { key: 'eventLog', name: 'Event log', desc: 'The rolling log under the banner. Off keeps the world clear.' },
    { key: 'flourish', name: 'Reward flourish', desc: 'The full-screen celebration when a quest pays out.' },
  ];

  let settings = readSettings();

  function applySettings() {
    try {
      document.documentElement.classList.toggle('sq-nomotion', !settings.motion);
      document.documentElement.classList.toggle('sq-nolog', !settings.eventLog);
      document.documentElement.classList.toggle('sq-noflourish', !settings.flourish);
      window.dispatchEvent(new CustomEvent('sq-settings', { detail: Object.assign({}, settings) }));
    } catch (err) { /* non-fatal */ }
  }

  function renderSettings() {
    sheetBody.textContent = '';
    for (const opt of OPTIONS) {
      const row = el('div', 'sq-launch-opt');
      const nameWrap = el('div', 'sq-launch-optname');
      nameWrap.appendChild(el('span', null, opt.name));
      nameWrap.appendChild(el('span', 'sq-launch-optdesc', opt.desc));
      row.appendChild(nameWrap);
      const on = settings[opt.key] !== false;
      const t = el('button', `sq-launch-toggle${on ? ' sq-launch-on' : ''}`, on ? 'ON' : 'OFF');
      t.type = 'button';
      t.addEventListener('click', () => {
        settings = Object.assign({}, settings, { [opt.key]: !on });
        writeSettings(settings);
        applySettings();
        renderSettings();
      });
      row.appendChild(t);
      sheetBody.appendChild(row);
    }
    // --- MENU MUSIC VOLUME.
    //
    // A slider rather than another ON/OFF, because "quieter" is the thing
    // people actually want from menu music — and 0 IS the off switch, so it
    // does not need a second control beside it. The number is shown because a
    // bare slider gives you no way to come back to a setting you liked.
    {
      const row = el('div', 'sq-launch-opt');
      const nameWrap = el('div', 'sq-launch-optname');
      nameWrap.appendChild(el('span', null, 'Menu music'));
      const desc = el('span', 'sq-launch-optdesc',
        'Plays on this screen only — never in the world. Drag to nothing to silence it.');
      nameWrap.appendChild(desc);
      row.appendChild(nameWrap);

      const vol = el('div', 'sq-launch-vol');
      const slider = el('input', 'sq-launch-volslider');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.value = String(settings.musicVolume);
      const read = el('div', 'sq-launch-volread', `${settings.musicVolume}%`);

      const apply = (raw, persist) => {
        const v = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
        read.textContent = v === 0 ? 'OFF' : `${v}%`;
        read.classList.toggle('sq-launch-voloff', v === 0);
        // Heard IMMEDIATELY, on every drag — a volume control you cannot hear
        // while you set it is a guess. Written only on release, so dragging
        // across the range does not hammer localStorage.
        try {
          window.dispatchEvent(new CustomEvent('sq-music-volume', { detail: { volume: v } }));
        } catch (err) { /* non-fatal */ }
        if (persist) {
          settings = Object.assign({}, settings, { musicVolume: v });
          writeSettings(settings);
        }
      };
      slider.addEventListener('input', () => apply(slider.value, false));
      slider.addEventListener('change', () => apply(slider.value, true));
      vol.appendChild(slider);
      vol.appendChild(read);
      row.appendChild(vol);
      sheetBody.appendChild(row);
      // Paint the readout once so it reads OFF at zero rather than "0%".
      apply(slider.value, false);
    }

    const note = el('div', 'sq-theme-empty', 'Settings are stored in this browser only. They never touch a save.');
    note.style.marginTop = '14px';
    sheetBody.appendChild(note);
  }

  /**
   * THE DEVELOPER SHEET.
   *
   * Reuses the settings sheet's frame rather than building a second one — the
   * whole point is that it is a workshop drawer, not a feature.
   */
  function renderDev() {
    sheetTitle.textContent = 'DEVELOPER MODE';
    sheetBody.textContent = '';
    const box = el('div', 'sq-launch-devbox');

    const mkRow = (labelText, value, min, max) => {
      const row = el('div', 'sq-launch-devrow');
      const lab = el('label', null, labelText);
      const inp = el('input');
      inp.type = 'number';
      inp.min = String(min);
      inp.max = String(max);
      inp.value = String(value);
      row.appendChild(lab);
      row.appendChild(inp);
      box.appendChild(row);
      return inp;
    };

    const levelInput = mkRow('LEVEL', 20, 1, 99);
    const florinInput = mkRow('FLORINS', 99999, 0, 999999);
    const shardInput = mkRow('SHARDS', 9999, 0, 999999);

    const grant = el('button', 'sq-theme-btn sq-theme-go sq-launch-dev', 'GRANT IT ALL');
    grant.type = 'button';
    grant.addEventListener('click', async () => {
      grant.disabled = true;
      grant.textContent = 'GRANTING…';
      const body = {
        level: Number(levelInput.value),
        florins: Number(florinInput.value),
        shards: Number(shardInput.value),
        allItems: true,
        allTools: true,
        repair: true,
      };
      const res = await postJson('/api/dev/grant', body);
      if (res && res.ok) {
        grant.textContent = 'GRANTED';
        setStatus('Developer grant applied. Load the save to see it.');
        // The save list shows level and progress, so it is now out of date.
        if (typeof api.refreshSlots === 'function') { try { await api.refreshSlots(); } catch (err) { /* cosmetic */ } }
      } else {
        grant.textContent = 'GRANT IT ALL';
        grant.disabled = false;
        setStatus((res && res.error) || 'the grant did not go through');
      }
    });
    box.appendChild(grant);

    box.appendChild(el('div', 'sq-launch-devnote',
      'Applies to the ACTIVE save, immediately. Sets the level outright (xp resets into it), '
      + 'sets the purse, and hands over every material, gadget, block, blueprint, charm and tool '
      + 'at full durability. Level 20 is what brings the Herald.'));
    box.appendChild(el('div', 'sq-launch-devnote',
      'Nothing is switched ON — there is no cheat mode for the rest of the game to branch on. '
      + 'The save is stamped as developer-touched and never un-stamped, so a level 20 here is '
      + 'not evidence of anything later.'));

    sheetBody.appendChild(box);
  }

  devBtn.addEventListener('click', () => { renderDev(); sheet.hidden = false; });
  settingsBtn.addEventListener('click', () => {
    sheetTitle.textContent = 'SETTINGS';
    renderSettings();
    sheet.hidden = false;
  });
  sheetX.addEventListener('click', () => { sheet.hidden = true; });
  sheetDone.addEventListener('click', () => { sheet.hidden = true; });

  quitBtn.addEventListener('click', async () => {
    setStatus('Saving and closing…');
    // Write first. QUIT from the title screen is a normal way to leave the game,
    // and it must not be the one exit that loses the last few actions.
    try {
      if (typeof api.save === 'function') await api.save();
    } catch (err) { /* a failed save must not trap you in the menu */ }

    // In the native shell, ask AppKit to terminate — a page cannot close a
    // window it did not open, which is why this used to dead-end on
    // "close it from the title bar (⌘W)".
    let asked = false;
    try { asked = typeof window.__sqQuit === 'function' && window.__sqQuit() === true; }
    catch (err) { asked = false; }
    if (asked) return;

    // Plain browser: try the standard close, and if the browser refuses (it
    // will, for a tab the script did not open) say so plainly rather than
    // pretending the click did nothing.
    try { window.close(); } catch (err) { /* ignore */ }
    setTimeout(() => {
      setStatus('This window has to be closed from the title bar (⌘W).', 'bad');
    }, 350);
  });

  function setStatus(text, kind) {
    status.textContent = String(text || '');
    status.classList.toggle('sq-launch-bad', kind === 'bad');
    status.classList.toggle('sq-launch-ok', kind === 'ok');
  }

  // ---- slot data ---------------------------------------------------------
  function normSlots(list) {
    const out = [];
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const hit = Array.isArray(list) ? list.find((s) => s && num(s.slot, 0) === i) : null;
      out.push({
        slot: i,
        exists: !!(hit && (hit.exists === undefined ? true : hit.exists)),
        name: (hit && hit.name) || `Save ${i}`,
        level: hit ? num(hit.level, 1) : 1,
        playtimeMs: hit ? num(hit.playtimeMs, 0) : 0,
        lastPlayedAt: (hit && hit.lastPlayedAt) || null,
        active: !!(hit && hit.active),
      });
    }
    return out;
  }

  async function loadSlots(quiet) {
    if (!quiet) setStatus('Reading saves…');
    let res;
    try {
      res = typeof api.slots === 'function' ? await api.slots() : null;
    } catch (err) {
      res = { ok: false, error: (err && err.message) || 'network error' };
    }
    if (!res) {
      try {
        res = await fetch('/api/slots').then((r) => r.json());
      } catch (err) {
        res = { ok: false, error: (err && err.message) || 'network error' };
      }
    }
    if (res && res.ok) {
      slots = normSlots(res.slots || res.state && res.state.slots);
      loaded = true;
      if (!quiet) setStatus('');
    } else {
      loaded = true;
      slots = normSlots([]);
      setStatus((res && res.error) || 'Could not read the save folder.', 'bad');
    }
    render();
  }

  /**
   * When a save was last played, in ms.
   *
   * `lastPlayedAt` arrives from the server as an EPOCH NUMBER — slots.js writes
   * `Date.now()`. `Date.parse` only accepts strings and returns NaN for a
   * number, which the old `|| 0` then quietly turned into "never played". Every
   * slot scored 0, the sort fell through to its `playtimeMs` tie-break, and
   * CONTINUE pointed at the save with the MOST HOURS rather than the one played
   * most recently — which is only visibly wrong once a second save exists.
   *
   * Strings are still accepted in case a save ever carries an ISO date.
   */
  function playedAt(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;      // "1788105189283"
      const t = Date.parse(v);                        // "2026-08-30T15:53:09Z"
      return Number.isFinite(t) && t > 0 ? t : 0;
    }
    return 0;
  }

  function mostRecent() {
    const used = slots.filter((s) => s.exists);
    if (!used.length) return null;
    const scored = used.slice().sort((a, b) => {
      const ta = playedAt(a.lastPlayedAt);
      const tb = playedAt(b.lastPlayedAt);
      if (tb !== ta) return tb - ta;
      // Only a genuine tie (or two saves that have never been played) reaches
      // the hours played.
      return b.playtimeMs - a.playtimeMs;
    });
    return scored[0];
  }

  // ---- actions -----------------------------------------------------------
  async function chooseSlot(slot) {
    if (busy) return;
    busy = true;
    setStatus(`Loading slot ${slot}…`);
    render();
    let res = { ok: true };
    try {
      if (typeof api.switchSlot === 'function') res = await api.switchSlot(slot);
      else res = await postJson('/api/slots/switch', { slot });
    } catch (err) {
      res = { ok: false, error: (err && err.message) || 'network error' };
    }
    if (!res || res.ok === false) {
      busy = false;
      setStatus((res && res.error) || 'That save would not open.', 'bad');
      render();
      return;
    }
    // switchSlot reloads the page on success; if it did not (same slot already
    // active, or a server that answers without a reload) we hand off ourselves.
    busy = false;
    setStatus('');
    hide();
    try { if (typeof onChosenRef.fn === 'function') onChosenRef.fn(slot); }
    catch (err) { if (typeof console !== 'undefined') console.error('[sq-launch] onChosen', err); }
  }

  async function createSlot(slot, name) {
    busy = true; render();
    const res = await postJson('/api/slots/create', { slot, name: name || `Save ${slot}` });
    busy = false;
    if (res.ok) {
      editing = null;
      setStatus(`Slot ${slot} created.`, 'ok');
      await loadSlots(true);
      chooseSlot(slot);
    } else {
      setStatus(res.error || 'Could not create that save.', 'bad');
      render();
    }
  }

  async function renameSlot(slot, name) {
    const clean = String(name || '').trim().slice(0, 28);
    if (!clean) { setStatus('A save needs a name.', 'bad'); return; }
    busy = true; render();
    const res = await postJson('/api/slots/rename', { slot, name: clean });
    busy = false;
    editing = null;
    if (res.ok) { setStatus(`Renamed to “${clean}”.`, 'ok'); await loadSlots(true); }
    else { setStatus(res.error || 'Could not rename that save.', 'bad'); render(); }
  }

  async function deleteSlot(slot) {
    busy = true; render();
    const res = await postJson('/api/slots/delete', { slot });
    busy = false;
    editing = null;
    if (res.ok) { setStatus(`Slot ${slot} erased.`, 'ok'); await loadSlots(true); }
    else { setStatus(res.error || 'Could not delete that save.', 'bad'); render(); }
  }

  // ---- render ------------------------------------------------------------
  function slotCard(s, recentSlot) {
    const card = el('div', 'sq-launch-slot' + (s.exists ? '' : ' sq-launch-empty')
      + (s.exists && recentSlot === s.slot ? ' sq-launch-recent' : ''));
    card.style.animationDelay = `${(s.slot - 1) * 55}ms`;
    card.appendChild(el('div', 'sq-launch-slotno', `SLOT ${s.slot}`));

    if (!s.exists) {
      card.appendChild(el('div', 'sq-launch-slotname', 'Empty'));
      card.appendChild(el('div', 'sq-launch-plus', '+'));
      card.appendChild(el('div', 'sq-launch-emptyline', 'Begin a new scholar here.'));
      if (editing && editing.slot === s.slot && editing.mode === 'create') {
        const input = el('input', 'sq-launch-input');
        input.type = 'text';
        input.value = `Save ${s.slot}`;
        input.maxLength = 28;
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') createSlot(s.slot, input.value);
          if (e.key === 'Escape') { editing = null; render(); }
        });
        card.appendChild(input);
        const acts = el('div', 'sq-launch-slotacts');
        const go = el('button', 'sq-launch-mini', 'BEGIN');
        go.type = 'button';
        go.addEventListener('click', () => createSlot(s.slot, input.value));
        const cancel = el('button', 'sq-launch-mini', 'CANCEL');
        cancel.type = 'button';
        cancel.addEventListener('click', () => { editing = null; render(); });
        acts.appendChild(go); acts.appendChild(cancel);
        card.appendChild(acts);
        setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 30);
      } else {
        const acts = el('div', 'sq-launch-slotacts');
        const go = el('button', 'sq-launch-mini', 'NEW GAME');
        go.type = 'button';
        go.disabled = busy;
        go.addEventListener('click', () => { editing = { slot: s.slot, mode: 'create' }; render(); });
        acts.appendChild(go);
        card.appendChild(acts);
      }
      return card;
    }

    card.appendChild(el('div', 'sq-launch-slotname', s.name));
    card.appendChild(el('div', 'sq-launch-slotlv', `LV ${s.level}`));
    const meta = el('div', 'sq-launch-meta');
    const pt = el('div');
    pt.appendChild(el('b', null, 'Playtime '));
    pt.appendChild(el('span', null, formatPlaytime(s.playtimeMs)));
    meta.appendChild(pt);
    const lp = el('div');
    lp.appendChild(el('b', null, 'Last played '));
    lp.appendChild(el('span', null, formatRelative(s.lastPlayedAt)));
    meta.appendChild(lp);
    card.appendChild(meta);

    if (editing && editing.slot === s.slot && editing.mode === 'rename') {
      const input = el('input', 'sq-launch-input');
      input.type = 'text';
      input.value = s.name;
      input.maxLength = 28;
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') renameSlot(s.slot, input.value);
        if (e.key === 'Escape') { editing = null; render(); }
      });
      card.appendChild(input);
      const acts = el('div', 'sq-launch-slotacts');
      const save = el('button', 'sq-launch-mini', 'SAVE NAME');
      save.type = 'button';
      save.addEventListener('click', () => renameSlot(s.slot, input.value));
      const cancel = el('button', 'sq-launch-mini', 'CANCEL');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { editing = null; render(); });
      acts.appendChild(save); acts.appendChild(cancel);
      card.appendChild(acts);
      setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 30);
      return card;
    }

    if (editing && editing.slot === s.slot && editing.mode === 'delete') {
      card.appendChild(el('div', 'sq-launch-confirm',
        `Erase “${s.name}” — level ${s.level}, ${formatPlaytime(s.playtimeMs)} played? This cannot be undone.`));
      const acts = el('div', 'sq-launch-slotacts');
      const yes = el('button', 'sq-launch-mini sq-launch-danger', 'ERASE IT');
      yes.type = 'button';
      yes.addEventListener('click', () => deleteSlot(s.slot));
      const no = el('button', 'sq-launch-mini', 'KEEP');
      no.type = 'button';
      no.addEventListener('click', () => { editing = null; render(); });
      acts.appendChild(yes); acts.appendChild(no);
      card.appendChild(acts);
      return card;
    }

    const acts = el('div', 'sq-launch-slotacts');
    const play = el('button', 'sq-launch-mini', 'PLAY');
    play.type = 'button';
    play.disabled = busy;
    play.addEventListener('click', () => chooseSlot(s.slot));
    const ren = el('button', 'sq-launch-mini', 'RENAME');
    ren.type = 'button';
    ren.addEventListener('click', () => { editing = { slot: s.slot, mode: 'rename' }; render(); });
    const del = el('button', 'sq-launch-mini sq-launch-danger', 'DELETE');
    del.type = 'button';
    del.addEventListener('click', () => { editing = { slot: s.slot, mode: 'delete' }; render(); });
    acts.appendChild(play); acts.appendChild(ren); acts.appendChild(del);
    card.appendChild(acts);

    card.addEventListener('dblclick', () => chooseSlot(s.slot));
    return card;
  }

  function render() {
    try {
      grid.textContent = '';
      if (!loaded) {
        const wait = el('div', 'sq-theme-empty sq-theme-empty-dark', 'Reading the save folder…');
        wait.style.gridColumn = '1 / -1';
        grid.appendChild(wait);
      } else {
        const recent = mostRecent();
        const recentSlot = recent ? recent.slot : 0;
        for (const s of slots) grid.appendChild(slotCard(s, recentSlot));
      }
      const recent = mostRecent();
      continueBtn.disabled = busy || !recent;
      continueBtn.textContent = recent ? `CONTINUE · ${recent.name}` : 'NO SAVE YET';
      continueBtn.title = recent
        ? `Load ${recent.name} — level ${recent.level}, last played ${formatRelative(recent.lastPlayedAt)}.`
        : 'Start a new game in any empty slot first.';
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-launch] render', err);
    }
  }

  continueBtn.addEventListener('click', () => {
    const recent = mostRecent();
    if (recent) chooseSlot(recent.slot);
  });

  const onChosenRef = { fn: null };

  function show() {
    visible = true;
    wrap.hidden = false;
    wrap.classList.remove('sq-launch-out');
    editing = null;
    setStatus('');
    // Always open on the title screen, never straight into the save list —
    // including when returning here via Quit to Menu.
    showGate();
    render();
    loadSlots(false);
  }

  function hide() {
    if (!visible) { wrap.hidden = true; return; }
    visible = false;
    wrap.classList.add('sq-launch-out');
    setTimeout(() => { wrap.hidden = true; wrap.classList.remove('sq-launch-out'); }, 240);
  }

  function setState(next) {
    try {
      state = next || null;
      // A live state tells us which slot is loaded and how far it has got,
      // so the menu is accurate even before /api/slots answers.
      const meta = state && state.meta;
      const player = state && state.player;
      if (meta && num(meta.slot, 0) > 0) {
        const hit = slots.find((s) => s.slot === num(meta.slot, 0));
        if (hit) {
          hit.exists = true;
          if (meta.name) hit.name = String(meta.name);
          if (player) hit.level = num(player.level, hit.level);
          hit.playtimeMs = num(meta.playtimeMs, hit.playtimeMs);
          hit.lastPlayedAt = meta.lastPlayedAt || hit.lastPlayedAt;
          if (visible) render();
        }
      }
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-launch] setState', err);
    }
  }

  applySettings();

  // The settings sheet is reachable from two places: the title screen and the
  // in-game pause menu. It is reparented to <body> on first use so it does not
  // depend on the launch panel being visible.
  function showGate() {
    gateWrap.hidden = false;
    stage.hidden = true;
    foot.hidden = true;      // Continue/Settings/Quit belong to the save screen
  }
  function showSlots() {
    gateWrap.hidden = true;
    stage.hidden = false;
    foot.hidden = false;
    loadSlots(true);
  }
  playBtn.addEventListener('click', showSlots);

  function openSettings() {
    try {
      if (sheet.parentNode !== document.body) document.body.appendChild(sheet);
      renderSettings();
      sheet.hidden = false;
      return true;
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-launch] openSettings', err);
      return false;
    }
  }

  const outer = {
    show, hide,
    openSettings,
    showGate,
    isSettingsOpen: () => !sheet.hidden,
    isVisible: () => visible,
    setState,
    refresh: () => loadSlots(true),
    get onChosen() { return onChosenRef.fn; },
    set onChosen(fn) { onChosenRef.fn = typeof fn === 'function' ? fn : null; },
  };
  return outer;
}

export default createLaunch;
