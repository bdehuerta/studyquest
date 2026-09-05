// web/ui/hud.js  [ENG-UI]
// The banner. v3 redesign: a three-zone hierarchy instead of one dense row —
//   left    who you are (crest, name, level, XP)
//   middle  what you can do right now (stamina, the tool in your hand)
//   right   what you own (currencies as differentiated coin plaques, then
//           boxes and streak set apart as counters, not currencies)
// The event log no longer sits under the banner overlapping the world: it is a
// quiet corner feed above the dock that fades itself out, and it can be turned
// off entirely from the launch menu's Settings.
//
// Exactly one <style> tag, every selector namespaced .sq-hud-*.

import {
  CURRENCIES,
  CURRENCY_IDS,
  PALETTE_V3,
  RANK_COLOR,
  GATHER_NODES,
} from '../../shared/constants.js';
import { TOOLS, GADGETS } from '../../shared/recipes.js';
import { injectTheme, el, num, ease, pulse } from './theme.js';

const STYLE_ID = 'sq-hud-style';

const LOG_KIND_COLOR = {
  reward: PALETTE_V3.gold,
  good: PALETTE_V3.good,
  levelup: PALETTE_V3.goldBright,
  level: PALETTE_V3.goldBright,
  task: PALETTE_V3.good,
  session: PALETTE_V3.hydro,
  craft: PALETTE_V3.pyro,
  build: PALETTE_V3.geo,
  box: PALETTE_V3.electro,
  drop: PALETTE_V3.electro,
  gather: PALETTE_V3.dendro,
  bad: PALETTE_V3.bad,
  error: PALETTE_V3.bad,
  warn: PALETTE_V3.bad,
  info: PALETTE_V3.textDim,
};

function logColor(kind) {
  return LOG_KIND_COLOR[String(kind || 'info')] || PALETTE_V3.textDim;
}

/**
 * Mark the document native from the PAGE side too.
 *
 * GameWindow.swift already sets `data-native` at document start, and also sets
 * `window.__sqNative`. Doing it here as well costs nothing and removes a whole
 * class of doubt: if the injected script ever runs before `documentElement`
 * exists, or is changed, the gutter still appears. Two independent routes to
 * one attribute, and neither can set it in a browser.
 */
function markNativeFromPage() {
  try {
    if (typeof window === 'undefined' || !window.__sqNative) return;
    const root = document.documentElement;
    if (root && !root.hasAttribute('data-native')) root.setAttribute('data-native', 'macos');
  } catch (err) { /* a browser: nothing to mark */ }
}

function injectStyle() {
  markNativeFromPage();
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-hud-root {
  position: fixed; top: 0; left: 0; right: 0; z-index: 45;
  font-family: var(--sq-mono); letter-spacing: .06em;
  pointer-events: none;
}
.sq-hud-root > * { pointer-events: auto; }

/* ---- THE TRAFFIC-LIGHT GUTTER -----------------------------------------
   The native shell uses a full-size content view with no titlebar area, so
   macOS draws close/minimise/zoom straight over the top-left of this banner —
   on top of the crest and the player's name. The data-native attribute is set
   by GameWindow.swift after load, so the BROWSER build is not left with a
   random gap it has no reason for. 84px clears the three lights plus their
   inset at every window size; they never move off the top-left corner.
   (No backticks in comments inside this template literal — that is twice now.) */
html[data-native] .sq-hud-id { padding-left: 96px; }
html[data-native] .sq-hud-crest { margin-left: 0; }
/* The gutter is DRAWN, not just left blank. Reserving the space stopped the
   lights landing on the crest, but they still sat directly on the HUD's own
   gradient with nothing between them — so they read as part of the banner
   rather than as window chrome. Bruno: "it is still merged with the app street
   light buttons of the mac." This paints a recessed titlebar strip behind them,
   with a rule down its right edge, so the eye reads chrome | game. */
html[data-native] .sq-hud-bar::before {
  content: '';
  position: absolute; left: 0; top: 0; bottom: 0; width: 104px;
  /* A soft darkening that FADES OUT to the right, not a hard block with a rule
     down it. The first version was a near-black rectangle with a gold border
     and read as a bug stuck on the corner rather than as window chrome — the
     boundary was louder than anything it separated. This just sinks the corner
     so the lights have somewhere quiet to sit. */
  background: linear-gradient(90deg,
    rgba(6,4,12,.92) 0%, rgba(6,4,12,.86) 52%, rgba(6,4,12,0) 100%);
  pointer-events: none;
  z-index: 1;
}
html[data-native] .sq-hud-id { position: relative; z-index: 2; }

/* ---- the banner ------------------------------------------------------- */
.sq-hud-bar {
  position: relative;
  display: flex; align-items: stretch; gap: 0;
  padding: 0 14px 0 0;
  background:
    linear-gradient(180deg, rgba(61,52,87,.97) 0%, rgba(42,35,64,.95) 60%, rgba(26,20,38,.92) 100%);
  border-bottom: 2px solid var(--sq-gold-deep);
  box-shadow: 0 3px 0 rgba(10,7,18,.55);
  animation: sq-hud-drop 420ms cubic-bezier(.16,.9,.3,1.03) both;
}
/* the thin gold hairline that reads as a rule rather than a border */
.sq-hud-bar::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 1px;
  background: linear-gradient(90deg,
    rgba(255,204,92,0), rgba(255,233,168,.9) 18%, rgba(255,233,168,.9) 82%, rgba(255,204,92,0));
}

/* ================================================================== *
 * HIERARCHY — three tiers, weighted by how often you look at them.
 *
 * The banner was one row of equally loud things, and the loudest was the least
 * urgent: a big gold crest and the player's name, which never change, sat in
 * front of the stamina bar, which you watch every swing.
 *
 *   TIER 1  stamina and the two equip slots — what you are about to spend and
 *           what is in your hands. Brightest, largest, centre.
 *   TIER 2  florins, shards, boxes, streak — reference. Present, quiet.
 *   TIER 3  crest, name, level, xp — identity. It does not change minute to
 *           minute, so it is the smallest and dimmest thing here.
 *
 * Nothing is removed. Everything is still one glance away; the glance just has
 * an order now.
 * ================================================================== */

/* --- TIER 3: identity. Quiet on purpose. --- */
.sq-hud-id {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 14px 8px 12px;
  background: linear-gradient(180deg, rgba(255,204,92,.06), rgba(255,204,92,0));
  border-right: 2px solid rgba(201,146,47,.22);
  opacity: .88;
  transition: opacity 180ms ease;
}
.sq-hud-id:hover { opacity: 1; }
.sq-hud-crest {
  width: 26px; height: 26px; flex: 0 0 auto; display: grid; place-items: center;
  font-size: 12px; color: var(--sq-ink);
  background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold-deep));
  border: 2px solid var(--sq-ink);
  box-shadow: 0 0 0 2px var(--sq-gold-deep);
}
.sq-hud-idtext { min-width: 0; }
.sq-hud-nameline { display: flex; align-items: baseline; gap: 8px; }
.sq-hud-name {
  font-size: 11px; letter-spacing: .14em; color: var(--sq-parchment-dim);
  text-shadow: 0 2px 0 rgba(10,7,18,.8);
  max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sq-hud-level {
  font-size: 8px; letter-spacing: .12em; font-weight: 700; padding: 1px 6px;
  color: var(--sq-ink); background: var(--sq-gold);
}
.sq-hud-xpwrap { margin-top: 4px; display: flex; align-items: center; gap: 7px; }
.sq-hud-xpbar {
  position: relative; width: 120px; height: 6px; overflow: hidden;
  background: var(--sq-ink); border: 2px solid var(--sq-shade);
}
.sq-hud-xpfill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold-deep));
  transition: width 480ms cubic-bezier(.2,.9,.3,1);
}
/* No sheen here any more. An animation on the least urgent thing in the bar
   pulled the eye to exactly the wrong place; tier 1 owns the motion now. */
.sq-hud-xptext { font-size: 9px; letter-spacing: .10em; color: var(--sq-parchment-dim); }

/* --- TIER 1: readiness. The loudest thing in the bar. --- */
.sq-hud-mid {
  display: flex; align-items: center; justify-content: center; gap: 22px;
  padding: 8px 20px;
  flex: 1 1 auto; min-width: 0;
}
.sq-hud-meter { min-width: 0; }
.sq-hud-mlabel {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 9px; letter-spacing: .18em; color: var(--sq-parchment-dim); margin-bottom: 4px;
}
.sq-hud-mval { color: var(--sq-parchment); font-size: 10px; }
.sq-hud-mbar {
  position: relative; width: 208px; height: 14px; overflow: hidden;
  background: var(--sq-ink);
  border: 2px solid var(--sq-gold-deep);
  box-shadow: 0 0 0 1px rgba(10,7,18,.6);
}
.sq-hud-mfill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(180deg, #a9dd82, var(--sq-dendro));
  transition: width 420ms cubic-bezier(.2,.9,.3,1);
}
.sq-hud-notch {
  position: absolute; top: 0; bottom: 0; left: 50%; width: 2px;
  background: rgba(26,20,38,.55);
}
.sq-hud-low .sq-hud-mfill { background: linear-gradient(180deg, #f2937c, var(--sq-bad)); }
.sq-hud-low .sq-hud-mlabel { color: #ffb3a3; }
.sq-hud-drain { animation: sq-hud-shake 320ms ease-out; }

/* --- the two equipment slots ---
   Always both drawn, empty included: a slot you cannot see is a slot you
   forget you have, and the 1 / 2 keys need something on screen to name. */
.sq-hud-slots { display: flex; gap: 6px; }
.sq-hud-slot {
  position: relative; display: flex; align-items: center; gap: 9px;
  padding: 6px 11px 6px 9px; min-width: 96px; cursor: pointer;
  background: rgba(26,20,38,.55); border: 2px solid var(--sq-shade);
  font: inherit; color: inherit; text-align: left;
}
.sq-hud-slot:hover { border-color: rgba(201,146,47,.55); }
.sq-hud-slot.sq-hud-slotactive {
  border-color: var(--sq-gold); background: rgba(201,146,47,.16);
  box-shadow: inset 0 0 0 1px rgba(201,146,47,.30);
}
.sq-hud-slotkey {
  position: absolute; top: -2px; left: -2px; padding: 0 3px;
  font-size: 8px; line-height: 11px; letter-spacing: .06em;
  background: var(--sq-shade); color: var(--sq-text-dim);
}
.sq-hud-slotactive .sq-hud-slotkey { background: var(--sq-gold); color: #241a08; }
/* STOWED, not merely unhighlighted. Only the selected slot acts, so the other
   one has to read as put away rather than as a second thing in your hands. */
.sq-hud-slot.sq-hud-slotstowed { opacity: .46; filter: saturate(.35); }
.sq-hud-slot.sq-hud-slotstowed:hover { opacity: .74; filter: none; }
.sq-hud-toolicon { font-size: 14px; color: var(--sq-pyro); }
.sq-hud-slotempty .sq-hud-toolicon { color: rgba(164,148,196,.34); }
.sq-hud-toolname { font-size: 9px; letter-spacing: .12em; color: var(--sq-parchment); }
.sq-hud-slotempty .sq-hud-toolname { color: var(--sq-text-dim); }
.sq-hud-pips { display: flex; gap: 2px; margin-top: 5px; }
.sq-hud-pips[hidden] { display: none; }
.sq-hud-pip { width: 7px; height: 7px; background: var(--sq-good); }
.sq-hud-pip.sq-hud-pipoff { background: rgba(164,148,196,.28); }
.sq-hud-tooldur { font-size: 8px; color: var(--sq-text-dim); letter-spacing: .10em; }
.sq-hud-toolworn { border-color: var(--sq-bad); }
.sq-hud-toolworn .sq-hud-pip { background: var(--sq-bad); }
.sq-hud-toolworn .sq-hud-toolicon { color: var(--sq-bad); }

/* --- zone 3: wealth --- */
.sq-hud-purse {
  display: flex; align-items: center; gap: 8px; padding: 9px 14px;
  border-left: 2px solid rgba(201,146,47,.55);
  background: linear-gradient(180deg, rgba(255,204,92,.10), rgba(255,204,92,0));
}
/* --- TIER 2: the purse. Present, and quieter than the stamina bar.
   A full-strength border in the currency's own colour made two small boxes the
   brightest objects in the banner, which is not what you are watching while you
   swing an axe. The colour survives on the symbol tile and the number; the box
   around it steps back, and hovering brings it fully forward. */
.sq-hud-coin {
  display: flex; align-items: center; gap: 7px; padding: 5px 9px 5px 5px;
  background: rgba(26,20,38,.72);
  border: 2px solid currentColor;
  opacity: .92;
  transition: transform 130ms cubic-bezier(.2,1.2,.4,1), box-shadow 130ms, opacity 140ms;
}
.sq-hud-coin:hover {
  transform: translateY(-2px); box-shadow: 0 3px 0 rgba(10,7,18,.6); opacity: 1;
}
.sq-hud-coinsym {
  width: 20px; height: 20px; display: grid; place-items: center; font-size: 11px;
  color: var(--sq-ink); background: currentColor;
}
.sq-hud-coinsym > span { color: var(--sq-ink); }
.sq-hud-coinbody { line-height: 1.25; }
.sq-hud-coinname { font-size: 7px; letter-spacing: .18em; opacity: .78; }
.sq-hud-coinamt { font-size: 12px; font-weight: 700; letter-spacing: .04em; color: var(--sq-parchment); }
.sq-hud-counters {
  display: flex; align-items: center; gap: 7px; padding: 9px 4px 9px 12px;
  border-left: 2px solid rgba(201,146,47,.28);
}
.sq-hud-badge {
  display: flex; align-items: center; gap: 6px; padding: 6px 9px;
  font-size: 11px; color: var(--sq-parchment-dim);
  background: rgba(26,20,38,.62); border: 2px solid var(--sq-shade);
  opacity: .90;
  transition: border-color 140ms, color 140ms, opacity 140ms;
}
.sq-hud-badge:hover { border-color: var(--sq-gold-deep); color: var(--sq-gold-bright); opacity: 1; }
.sq-hud-badgeamt { font-weight: 700; }
.sq-hud-hot { border-color: var(--sq-pyro); color: #ffcbb8; }

/* ---- the location prompt (what building you are standing at) ---------- */
.sq-hud-place {
  position: fixed; left: 50%; top: 74px; transform: translateX(-50%);
  padding: 8px 18px; font-size: 10px; letter-spacing: .16em;
  color: var(--sq-ink); background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold));
  border: 2px solid var(--sq-ink); box-shadow: 0 0 18px rgba(255,204,92,.35);
  animation: sq-theme-rise 220ms ease-out both;
}
.sq-hud-place[hidden] { display: none; }

/* ---- the log, relocated: quiet, cornered, self-clearing --------------- */
.sq-hud-log {
  position: fixed; left: 12px; bottom: 56px; width: min(330px, 40vw); z-index: 30;
  display: flex; flex-direction: column-reverse; gap: 4px;
  pointer-events: none;
}
.sq-hud-logline {
  font-size: 9px; line-height: 1.6; letter-spacing: .04em;
  padding: 5px 9px; color: var(--sq-parchment-dim);
  background: rgba(18,13,28,.72); border-left: 3px solid var(--sq-shade);
  animation: sq-hud-logio 6.5s ease-out both;
}
.sq-hud-log.sq-hud-pinned .sq-hud-logline { animation: sq-theme-rise 220ms ease-out both; opacity: 1; }
.sq-hud-logtoggle {
  align-self: flex-start; margin-top: 4px; pointer-events: auto;
  font: inherit; font-size: 8px; letter-spacing: .14em; cursor: pointer;
  color: var(--sq-text-dim); background: rgba(18,13,28,.8);
  border: 2px solid var(--sq-shade); padding: 3px 8px;
}
.sq-hud-logtoggle:hover { color: var(--sq-gold-bright); border-color: var(--sq-gold-deep); }
.sq-nolog .sq-hud-log { display: none; }

/* ---- reward flourish -------------------------------------------------- */
.sq-hud-flash-scrim {
  position: fixed; inset: 0; z-index: 80; display: grid; place-items: center;
  background: radial-gradient(70% 60% at 50% 50%, rgba(26,20,38,.55), rgba(10,7,18,.86));
  animation: sq-theme-fadein 150ms ease-out both;
}
.sq-noflourish .sq-hud-flash-scrim { display: none; }
.sq-hud-flash {
  position: relative; min-width: 320px; max-width: 480px; padding: 26px 34px 22px;
  text-align: center; font-family: var(--sq-mono);
  background: linear-gradient(180deg, #fdf3dd 0%, #e9d4ab 100%);
  border: 3px solid var(--sq-gold); outline: 3px solid var(--sq-ink);
  box-shadow: 0 0 44px rgba(255,204,92,.42), 8px 10px 0 rgba(10,7,18,.6);
  animation: sq-hud-burst 420ms cubic-bezier(.16,1.1,.3,1.04) both;
}
.sq-hud-flash::before {
  content: ''; position: absolute; inset: 5px; pointer-events: none;
  border: 1px solid rgba(201,146,47,.6);
}
.sq-hud-flash-title {
  font-size: 11px; letter-spacing: .40em; color: #8a6a3c;
}
.sq-hud-flash-rank {
  margin-top: 6px; font-size: 54px; font-weight: 700; line-height: 1;
  text-shadow: 0 3px 0 rgba(90,64,30,.35);
  animation: sq-hud-stamp 380ms cubic-bezier(.2,1.6,.4,1) both;
}
.sq-hud-flash-coins {
  display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 16px;
}
.sq-hud-flash-coin {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700;
  padding: 5px 11px; background: rgba(26,20,38,.85); border: 2px solid currentColor;
}
.sq-hud-flash-xp { margin-top: 12px; font-size: 15px; font-weight: 700; color: #6b4d1a; }
.sq-hud-flash-box {
  margin-top: 12px; font-size: 12px; letter-spacing: .18em; padding: 7px 12px;
  color: var(--sq-parchment); background: #4a3a6b; border: 2px solid var(--sq-electro);
  animation: sq-theme-glow 1.4s ease-in-out infinite;
}
.sq-hud-flash-lines { margin-top: 16px; display: grid; gap: 3px; }
.sq-hud-flash-line {
  font-size: 9px; letter-spacing: .08em; color: #8a6a3c; opacity: 0;
  animation: sq-hud-linein 260ms ease-out forwards;
}
.sq-hud-flash-hint { margin-top: 16px; font-size: 8px; letter-spacing: .18em; color: #a08a68; }

@keyframes sq-hud-drop {
  from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; }
}
@keyframes sq-hud-shake {
  0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); }
}
@keyframes sq-hud-logio {
  0% { opacity: 0; transform: translateX(-12px); }
  8% { opacity: 1; transform: translateX(0); }
  74% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-6px); }
}
@keyframes sq-hud-burst {
  0% { opacity: 0; transform: scale(.86) translateY(16px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes sq-hud-stamp {
  0% { transform: scale(2.2); opacity: 0; } 100% { transform: scale(1); opacity: 1; }
}
@keyframes sq-hud-linein {
  from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .sq-hud-bar, .sq-hud-flash, .sq-hud-flash-rank, .sq-hud-logline { animation: none; opacity: 1; }
  .sq-hud-xpfill::after { animation: none; }
}
.sq-nomotion .sq-hud-bar, .sq-nomotion .sq-hud-flash { animation: none; }
`;
  document.head.appendChild(s);
}

export function createHud(root, api) {
  injectTheme();
  injectStyle();

  const host = root || document.body;
  const wrap = el('div', 'sq-hud-root');

  const bar = el('div', 'sq-hud-bar');
  wrap.appendChild(bar);

  // --- zone 1: identity ----------------------------------------------------
  const idblock = el('div', 'sq-hud-id');
  idblock.appendChild(el('div', 'sq-hud-crest', '✦'));
  const idtext = el('div', 'sq-hud-idtext');
  const nameLine = el('div', 'sq-hud-nameline');
  const nameEl = el('div', 'sq-hud-name', 'Scholar');
  const levelEl = el('div', 'sq-hud-level', 'LV 1');
  nameLine.appendChild(nameEl);
  nameLine.appendChild(levelEl);
  idtext.appendChild(nameLine);
  const xpwrap = el('div', 'sq-hud-xpwrap');
  const xpbar = el('div', 'sq-hud-xpbar');
  const xpfill = el('div', 'sq-hud-xpfill');
  xpbar.appendChild(xpfill);
  const xptext = el('div', 'sq-hud-xptext', '0 / 100 XP');
  xpwrap.appendChild(xpbar);
  xpwrap.appendChild(xptext);
  idtext.appendChild(xpwrap);
  idblock.appendChild(idtext);
  bar.appendChild(idblock);

  // --- zone 2: readiness ---------------------------------------------------
  const mid = el('div', 'sq-hud-mid');

  const STAMINA_TIP =
    'Stamina — what a swing of a tool costs.\n'
    + 'It refills on its own, so the world is always playable.\n'
    + 'Studying tops it up instantly on top of that.';
  const stamWrap = el('div', 'sq-hud-meter');
  stamWrap.title = STAMINA_TIP;
  const stamLabel = el('div', 'sq-hud-mlabel');
  stamLabel.appendChild(el('span', null, 'STAMINA'));
  const stamVal = el('span', 'sq-hud-mval', '0 / 100');
  stamLabel.appendChild(stamVal);
  const stamBar = el('div', 'sq-hud-mbar');
  const stamFill = el('div', 'sq-hud-mfill');
  stamBar.appendChild(stamFill);
  stamBar.appendChild(el('div', 'sq-hud-notch'));
  stamWrap.appendChild(stamLabel);
  stamWrap.appendChild(stamBar);
  stamWrap.hidden = true;
  mid.appendChild(stamWrap);

  // Two slots, built once and repainted in place. Clicking one makes it active,
  // exactly as pressing its number in the world does — the HUD is not a
  // read-only readout here, it is the same control by another route.
  const PIP_COUNT = 10;
  const slotsEl = el('div', 'sq-hud-slots');
  const slotUI = [0, 1].map((i) => {
    const cell = el('button', 'sq-hud-slot');
    cell.type = 'button';
    cell.appendChild(el('div', 'sq-hud-slotkey', String(i + 1)));
    const icon = el('div', 'sq-hud-toolicon', '·');
    const body = el('div');
    const name = el('div', 'sq-hud-toolname', 'EMPTY');
    const pips = el('div', 'sq-hud-pips');
    const pipNodes = [];
    for (let k = 0; k < PIP_COUNT; k += 1) {
      const pip = el('div', 'sq-hud-pip');
      pips.appendChild(pip);
      pipNodes.push(pip);
    }
    const dur = el('div', 'sq-hud-tooldur', '');
    body.appendChild(name);
    body.appendChild(pips);
    body.appendChild(dur);
    cell.appendChild(icon);
    cell.appendChild(body);
    cell.addEventListener('click', () => {
      // Fire and forget: the response carries state, which repaints this bar.
      if (api && typeof api.setActiveSlot === 'function') api.setActiveSlot(i + 1);
    });
    slotsEl.appendChild(cell);
    return { cell, icon, name, pips, pipNodes, dur };
  });
  mid.appendChild(slotsEl);

  bar.appendChild(mid);

  // --- zone 3: wealth ------------------------------------------------------
  const purse = el('div', 'sq-hud-purse');
  const coinNodes = {};
  for (const id of CURRENCY_IDS) {
    const c = CURRENCIES[id];
    const box = el('div', 'sq-hud-coin');
    box.style.color = c.color;
    box.title = id === 'shard'
      ? `${c.name} — only ever from Dark Boxes, which only graded work pays out. `
        + 'Spent on enchanting; tradeable for Florins at the Exchange.'
      : `${c.name} — the coin everything is priced in. Earned by studying and by selling what you gather.`;
    const symWrap = el('div', 'sq-hud-coinsym');
    symWrap.appendChild(el('span', null, c.symbol));
    box.appendChild(symWrap);
    const bodyEl = el('div', 'sq-hud-coinbody');
    bodyEl.appendChild(el('div', 'sq-hud-coinname', c.name.toUpperCase()));
    const amt = el('div', 'sq-hud-coinamt', '0');
    bodyEl.appendChild(amt);
    box.appendChild(bodyEl);
    purse.appendChild(box);
    coinNodes[id] = { box, amt };
  }
  bar.appendChild(purse);

  const counters = el('div', 'sq-hud-counters');
  const boxEl = el('div', 'sq-hud-badge');
  boxEl.title = 'Dark Boxes — open them from the Bag (Tab).';
  boxEl.appendChild(el('span', null, '⬛'));
  const boxAmt = el('span', 'sq-hud-badgeamt', '0');
  boxEl.appendChild(boxAmt);
  counters.appendChild(boxEl);

  const streakEl = el('div', 'sq-hud-badge');
  streakEl.title = 'Day streak';
  streakEl.appendChild(el('span', null, '☲'));
  const streakAmt = el('span', 'sq-hud-badgeamt', '0');
  streakEl.appendChild(streakAmt);
  counters.appendChild(streakEl);
  bar.appendChild(counters);

  // --- location prompt -----------------------------------------------------
  const placeEl = el('div', 'sq-hud-place');
  placeEl.hidden = true;
  wrap.appendChild(placeEl);

  // --- log -----------------------------------------------------------------
  const logEl = el('div', 'sq-hud-log');
  const logToggle = el('button', 'sq-hud-logtoggle', '≡ PIN LOG');
  logToggle.type = 'button';
  let logPinned = false;
  logToggle.addEventListener('click', () => {
    logPinned = !logPinned;
    logEl.classList.toggle('sq-hud-pinned', logPinned);
    logToggle.textContent = logPinned ? '≡ UNPIN LOG' : '≡ PIN LOG';
    lastLogSig = '';
    renderLog(lastState);
  });
  wrap.appendChild(logEl);
  logEl.appendChild(logToggle);

  host.appendChild(wrap);

  // ---- animated counters --------------------------------------------------
  // Keyed off CURRENCY_IDS rather than a hand-written list, so the counters
  // cannot fall out of step with the wallet again.
  const shown = { darkBoxes: 0 };
  const target = { darkBoxes: 0 };
  for (const id of CURRENCY_IDS) { shown[id] = 0; target[id] = 0; }
  let tickRaf = 0;
  let firstState = true;
  let lastState = null;

  function paintCounters() {
    for (const id of CURRENCY_IDS) coinNodes[id].amt.textContent = String(Math.round(shown[id]));
    boxAmt.textContent = String(Math.round(shown.darkBoxes));
  }

  function runTick() {
    if (tickRaf) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const from = Object.assign({}, shown);
    const dur = 560;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = ease(t);
      for (const k of Object.keys(target)) shown[k] = from[k] + (target[k] - from[k]) * e;
      paintCounters();
      if (t < 1) tickRaf = requestAnimationFrame(step);
      else {
        tickRaf = 0;
        for (const k of Object.keys(target)) shown[k] = target[k];
        paintCounters();
      }
    };
    tickRaf = requestAnimationFrame(step);
  }

  // ---- stamina ------------------------------------------------------------
  const stamAnim = { shown: 0, target: 0, max: 100, raf: 0, first: true };

  function paintStamina() {
    const max = Math.max(1, stamAnim.max);
    const v = stamAnim.shown;
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    stamFill.style.width = pct.toFixed(2) + '%';
    stamVal.textContent = `${Math.round(v)} / ${Math.round(max)}`;
    const low = (stamAnim.target / max) < 0.25;
    stamWrap.classList.toggle('sq-hud-low', low);
    stamWrap.title = low
      ? `Low — ${Math.round(stamAnim.target)} left. It refills on its own.\n${STAMINA_TIP}`
      : STAMINA_TIP;
  }

  function tweenStamina() {
    if (stamAnim.raf) cancelAnimationFrame(stamAnim.raf);
    const from = stamAnim.shown;
    const to = stamAnim.target;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dur = 480;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      stamAnim.shown = from + (to - from) * ease(t);
      paintStamina();
      if (t < 1) stamAnim.raf = requestAnimationFrame(step);
      else { stamAnim.raf = 0; stamAnim.shown = to; paintStamina(); }
    };
    stamAnim.raf = requestAnimationFrame(step);
  }

  function renderStamina(p) {
    // v3 renamed energy to stamina; a save written by either server is fine.
    const raw = (p && p.stamina !== undefined && p.stamina !== null) ? p.stamina
      : (p && p.energy !== undefined && p.energy !== null) ? p.energy : null;
    const rawMax = (p && p.maxStamina !== undefined && p.maxStamina !== null) ? p.maxStamina
      : (p && p.maxEnergy) || 100;
    stamWrap.hidden = raw === null;
    if (raw === null) return;
    stamAnim.max = Math.max(1, num(rawMax, 100));
    const next = Math.max(0, num(raw, 0));
    const dropped = next < stamAnim.target;
    stamAnim.target = next;
    if (stamAnim.first) {
      stamAnim.first = false;
      stamAnim.shown = next;
      paintStamina();
      return;
    }
    if (dropped) pulse(stamWrap, 'sq-hud-drain');
    tweenStamina();
  }

  // ---- the two equipment slots -------------------------------------------
  // Reads `player.equipped` (two refs) and `player.activeSlot`, both owned by
  // the server. NOT `activeGatherTool` — that is the legacy single slot, kept
  // in sync but no longer the truth.

  const SLOT_GLYPH = { tool: '⚒', seed: '❦', gadget: '✦', weapon: '⚔' };

  function refName(ref) {
    if (!ref) return 'EMPTY';
    if (ref.kind === 'seed') return 'SAPLINGS';
    const table = ref.kind === 'gadget' ? GADGETS : TOOLS;
    const def = table && table[ref.itemId];
    return String((def && def.name) || ref.itemId || ref.kind).toUpperCase();
  }

  function renderSlots(p) {
    const refs = (p && Array.isArray(p.equipped)) ? p.equipped : [];
    const active = Number(p && p.activeSlot) === 1 ? 1 : 0;
    const tools = (p && Array.isArray(p.gatherTools)) ? p.gatherTools.filter(Boolean) : [];
    const seeds = Math.max(0, num(p && p.saplings, 0));

    for (let i = 0; i < 2; i += 1) {
      const ui = slotUI[i];
      const ref = refs[i] || null;
      ui.cell.classList.toggle('sq-hud-slotactive', i === active);
      ui.cell.classList.toggle('sq-hud-slotempty', !ref);
      // Dimmed because it genuinely cannot be used, not as decoration: a stowed
      // tool does not chop. An empty slot is already dim, so leave it alone.
      ui.cell.classList.toggle('sq-hud-slotstowed', i !== active && !!ref);
      ui.icon.textContent = ref ? (SLOT_GLYPH[ref.kind] || '·') : '·';
      ui.name.textContent = refName(ref);

      // Durability pips belong to tools; a seed slot shows how many are left
      // instead, because running out mid-planting is the thing you need warning
      // about. Anything else shows neither.
      const tool = (ref && ref.kind === 'tool')
        ? tools.find((t) => t.uid === ref.uid) || null : null;
      ui.pips.hidden = !tool;
      ui.cell.classList.remove('sq-hud-toolworn');
      if (tool) {
        const max = Math.max(1, num(tool.maxDurability, 1));
        const cur = Math.max(0, Math.min(max, num(tool.durability, 0)));
        const lit = Math.ceil((cur / max) * PIP_COUNT);
        for (let k = 0; k < PIP_COUNT; k += 1) {
          ui.pipNodes[k].classList.toggle('sq-hud-pipoff', k >= lit);
        }
        ui.dur.textContent = `${cur}/${max}`;
        const worn = cur / max <= 0.25;
        ui.cell.classList.toggle('sq-hud-toolworn', worn);
        const def = TOOLS && TOOLS[tool.toolId];
        const nodeDef = def && def.node ? GATHER_NODES[def.node] : null;
        const swings = nodeDef ? `\n≈${cur} swings left (${nodeDef.energy} stamina each).` : '';
        const stowedNote = i === active ? ''
          : `\nStowed in slot ${i + 1} — press ${i + 1} to hold it.`;
        ui.cell.title = (worn
          ? `${refName(ref)} is nearly worn out — ${cur}/${max}.${swings}\nRepair it at a Forge.`
          : `${refName(ref)} — ${cur}/${max} durability.${swings}`) + stowedNote;
      } else if (ref && ref.kind === 'seed') {
        ui.dur.textContent = `x${seeds}`;
        ui.cell.title = i === active
          ? `${seeds} sapling(s) in hand. Face bare ground and press E to plant.`
          : `${seeds} sapling(s) stowed in slot ${i + 1} — press ${i + 1} to hold them.`;
      } else if (ref) {
        ui.dur.textContent = '';
        ui.cell.title = i === active
          ? `${refName(ref)} in hand.`
          : `${refName(ref)} stowed in slot ${i + 1} — press ${i + 1} to hold it.`;
      } else {
        ui.dur.textContent = '';
        ui.cell.title = `Slot ${i + 1} is empty. Equip something from the Bag (Tab).`;
      }
    }
  }

  // ---- log ----------------------------------------------------------------
  let lastLogSig = '';

  function renderLog(state) {
    const log = (state && Array.isArray(state.log)) ? state.log : [];
    const last = log.slice(logPinned ? -6 : -3).reverse();
    const sig = last.map((e) => `${e && e.ts}|${e && e.text}`).join('~');
    if (sig === lastLogSig) return;
    lastLogSig = sig;
    logEl.textContent = '';
    for (const entry of last) {
      if (!entry) continue;
      const line = el('div', 'sq-hud-logline', String(entry.text || ''));
      line.style.borderLeftColor = logColor(entry.kind);
      logEl.appendChild(line);
    }
    logEl.appendChild(logToggle);
  }

  // ---- location prompt ----------------------------------------------------
  /**
   * Show what the player is standing at, and what pressing E will do there.
   * main.js can call this from the world's interaction events; passing null
   * clears it.
   */
  function setPrompt(text) {
    try {
      const t = String(text || '').trim();
      placeEl.hidden = !t;
      if (t) {
        placeEl.textContent = t;
        pulse(placeEl, 'sq-theme-rise');
      }
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-hud] setPrompt', err);
    }
  }

  // ---- setState -----------------------------------------------------------
  function setState(state) {
    try {
      lastState = state;
      const p = (state && state.player) || {};
      nameEl.textContent = String(p.name || 'Scholar');
      levelEl.textContent = `LV ${num(p.level, 1)}`;

      const xp = num(p.xp, 0);
      const next = Math.max(1, num(p.xpToNext, 100));
      xpfill.style.width = Math.max(0, Math.min(100, (xp / next) * 100)).toFixed(2) + '%';
      xptext.textContent = `${Math.round(xp)} / ${Math.round(next)}`;

      const coins = p.coins || {};
      let anyUp = false;
      for (const id of CURRENCY_IDS) {
        const v = num(coins[id], 0);
        if (v > target[id]) { anyUp = true; pulse(coinNodes[id].box); }
        target[id] = v;
      }
      const boxes = num(p.darkBoxes, 0);
      if (boxes > target.darkBoxes) { anyUp = true; pulse(boxEl); }
      target.darkBoxes = boxes;

      if (firstState) {
        firstState = false;
        for (const k of Object.keys(target)) shown[k] = target[k];
        paintCounters();
      } else if (anyUp) {
        runTick();
      } else {
        for (const k of Object.keys(target)) shown[k] = target[k];
        paintCounters();
      }

      renderStamina(p);
      renderSlots(p);

      const streak = num(p.streak, 0);
      streakAmt.textContent = String(streak);
      streakEl.classList.toggle('sq-hud-hot', streak >= 3);

      renderLog(state);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-hud] setState', err);
    }
  }

  // ---- flashReward --------------------------------------------------------
  let activeFlash = null;

  function closeFlash() {
    if (!activeFlash) return;
    const { scrim, timer, raf, onKey } = activeFlash;
    activeFlash = null;
    if (timer) clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    if (onKey) window.removeEventListener('keydown', onKey);
    if (scrim && scrim.parentNode) scrim.parentNode.removeChild(scrim);
  }

  function flashReward(payout) {
    try {
      if (!payout) return;
      closeFlash();

      const coins = payout.coins || {};
      const xpGain = num(payout.xp, 0);
      const boxes = num(payout.darkBoxes, 0);
      const breakdown = Array.isArray(payout.breakdown) ? payout.breakdown : [];
      const rank = payout.rank ? String(payout.rank) : null;

      const scrim = el('div', 'sq-hud-flash-scrim');
      const panel = el('div', 'sq-hud-flash');
      scrim.appendChild(panel);

      panel.appendChild(el('div', 'sq-hud-flash-title', 'REWARD'));

      if (rank) {
        const r = el('div', 'sq-hud-flash-rank', rank);
        r.style.color = RANK_COLOR[rank] || PALETTE_V3.gold;
        panel.appendChild(r);
      }

      const coinRow = el('div', 'sq-hud-flash-coins');
      const tally = [];
      for (const id of CURRENCY_IDS) {
        const v = num(coins[id], 0);
        if (v <= 0) continue;
        const c = CURRENCIES[id];
        const chip = el('div', 'sq-hud-flash-coin');
        chip.style.color = c.color;
        chip.appendChild(el('span', null, c.symbol));
        const val = el('span', null, '0');
        chip.appendChild(val);
        coinRow.appendChild(chip);
        tally.push({ node: val, to: v, prefix: '' });
      }
      if (coinRow.childNodes.length) panel.appendChild(coinRow);

      if (xpGain > 0) {
        const xpLine = el('div', 'sq-hud-flash-xp', '+0 XP');
        panel.appendChild(xpLine);
        tally.push({ node: xpLine, to: xpGain, prefix: '+', suffix: ' XP' });
      }

      if (boxes > 0) panel.appendChild(el('div', 'sq-hud-flash-box', `DARK BOX ×${boxes}`));

      if (breakdown.length) {
        const lines = el('div', 'sq-hud-flash-lines');
        breakdown.slice(0, 8).forEach((txt, i) => {
          const l = el('div', 'sq-hud-flash-line', String(txt));
          l.style.animationDelay = `${140 + i * 90}ms`;
          lines.appendChild(l);
        });
        panel.appendChild(lines);
      }

      panel.appendChild(el('div', 'sq-hud-flash-hint', 'CLICK TO DISMISS'));

      scrim.addEventListener('click', closeFlash);
      const onKey = (e) => { if (e.key === 'Escape') closeFlash(); };
      window.addEventListener('keydown', onKey);
      host.appendChild(scrim);

      const dur = 760;
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const step = (now) => {
        if (!activeFlash) return;
        const t = Math.min(1, (now - t0) / dur);
        const e = ease(t);
        for (const c of tally) c.node.textContent = `${c.prefix || ''}${Math.round(c.to * e)}${c.suffix || ''}`;
        if (t < 1) activeFlash.raf = requestAnimationFrame(step);
        else {
          activeFlash.raf = 0;
          for (const c of tally) c.node.textContent = `${c.prefix || ''}${c.to}${c.suffix || ''}`;
        }
      };

      activeFlash = {
        scrim, onKey,
        raf: requestAnimationFrame(step),
        timer: setTimeout(closeFlash, 3000),
      };
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-hud] flashReward', err);
    }
  }

  return { setState, flashReward, setPrompt };
}

export default createHud;
