// web/ui/theme.js  [ENG-UI]
// The v3 visual language, in one place: design tokens plus the furniture every
// panel shares (frames with gold corner brackets, parchment grounds, buttons,
// tabs, cards, bars, scrollbars, motion).
//
// Exactly one <style> tag, id `sq-theme-style`. Selectors are `.sq-theme-*`.
// The single exception is a `:root { --sq-* }` token block — custom properties
// need a common ancestor to inherit from, and nothing but variables is declared
// there. No bare tag is ever styled.

import { PALETTE_V3 } from '../../shared/constants.js';

const STYLE_ID = 'sq-theme-style';

export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const P = PALETTE_V3;

// Elemental accents, used to colour a category consistently everywhere:
// the same idea always wears the same colour.
export const ELEMENTS = Object.freeze({
  materials: P.geo,
  tools: P.pyro,
  gadgets: P.electro,
  blocks: P.anemo,
  gear: P.hydro,
  relics: P.gold,
  boxes: P.electro,
  buildings: P.geo,
  saplings: P.dendro,
  quests: P.hydro,
  craft: P.pyro,
  shop: P.geo,
});

export function elementColor(key) {
  return ELEMENTS[key] || P.gold;
}

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

export function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback || 0);
}

// ease-out-cubic — the house easing for every count-up and tween.
export function ease(t) {
  const c = 1 - t;
  return 1 - c * c * c;
}

/** Count a number up (or snap it down) inside a node. Returns a cancel fn. */
export function countTo(node, from, to, opts) {
  const o = opts || {};
  const dur = num(o.duration, 520);
  const fmt = o.format || ((v) => String(Math.round(v)));
  if (!node) return () => {};
  if (to <= from || dur <= 0) { node.textContent = fmt(to); return () => {}; }
  let raf = 0;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    node.textContent = fmt(from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else { raf = 0; node.textContent = fmt(to); }
  };
  raf = requestAnimationFrame(step);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

/** Restart a CSS animation class on a node (reflow-forced). */
export function pulse(node, cls) {
  if (!node) return;
  const c = cls || 'sq-theme-bump';
  node.classList.remove(c);
  void node.offsetWidth;
  node.classList.add(c);
}

export function formatPlaytime(ms) {
  const total = Math.max(0, Math.floor(num(ms, 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return total > 0 ? `${total}s` : '—';
}

export function formatRelative(ts) {
  const t = typeof ts === 'string' ? Date.parse(ts) : num(ts, 0);
  if (!Number.isFinite(t) || t <= 0) return 'never';
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function injectTheme() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
:root {
  --sq-ink: ${P.ink};
  --sq-slate: ${P.slate};
  --sq-slate-light: ${P.slateLight};
  --sq-parchment: ${P.parchment};
  --sq-parchment-dim: ${P.parchmentDim};
  --sq-gold: ${P.gold};
  --sq-gold-bright: ${P.goldBright};
  --sq-gold-deep: ${P.goldDeep};
  --sq-sun: ${P.sun};
  --sq-shade: ${P.shade};
  --sq-good: ${P.good};
  --sq-bad: ${P.bad};
  --sq-text: ${P.text};
  --sq-text-dim: ${P.textDim};
  --sq-anemo: ${P.anemo};
  --sq-geo: ${P.geo};
  --sq-electro: ${P.electro};
  --sq-pyro: ${P.pyro};
  --sq-hydro: ${P.hydro};
  --sq-dendro: ${P.dendro};
  --sq-accent: ${P.gold};
  --sq-mono: ${MONO};
}

/* ---- scrim: the world dims, the panel arrives ------------------------- */
.sq-theme-scrim {
  position: fixed; inset: 0; z-index: 60;
  display: grid; place-items: center;
  padding: 40px 24px 92px;
  background:
    radial-gradient(120% 90% at 50% 40%, rgba(26,20,38,.60), rgba(12,9,20,.90));
  font-family: var(--sq-mono);
  animation: sq-theme-fadein 160ms ease-out both;
}
.sq-theme-scrim[hidden] { display: none; }

/* ---- the frame: deep slate, thin gold rules, corner brackets ---------- */
.sq-theme-frame {
  position: relative;
  background:
    linear-gradient(180deg, var(--sq-slate-light) 0%, var(--sq-slate) 22%, var(--sq-ink) 100%);
  border: 2px solid var(--sq-gold-deep);
  outline: 2px solid var(--sq-ink);
  box-shadow: 0 0 0 1px rgba(255,204,92,.28) inset, 6px 8px 0 rgba(10,7,18,.70);
  image-rendering: pixelated;
}
.sq-theme-frame::before {
  content: ''; position: absolute; inset: 3px; pointer-events: none; z-index: 3;
  background:
    linear-gradient(var(--sq-gold), var(--sq-gold)) left    top    / 16px 2px no-repeat,
    linear-gradient(var(--sq-gold), var(--sq-gold)) left    top    / 2px 16px no-repeat,
    linear-gradient(var(--sq-gold), var(--sq-gold)) right   top    / 16px 2px no-repeat,
    linear-gradient(var(--sq-gold), var(--sq-gold)) right   top    / 2px 16px no-repeat,
    linear-gradient(var(--sq-gold), var(--sq-gold)) left    bottom / 16px 2px no-repeat,
    linear-gradient(var(--sq-gold), var(--sq-gold)) left    bottom / 2px 16px no-repeat,
    linear-gradient(var(--sq-gold), var(--sq-gold)) right   bottom / 16px 2px no-repeat,
    linear-gradient(var(--sq-gold), var(--sq-gold)) right   bottom / 2px 16px no-repeat;
}
/* the little inset stud that sits in each bracket */
.sq-theme-frame::after {
  content: ''; position: absolute; inset: 7px; pointer-events: none; z-index: 3;
  background:
    linear-gradient(var(--sq-gold-bright), var(--sq-gold-bright)) left  top    / 3px 3px no-repeat,
    linear-gradient(var(--sq-gold-bright), var(--sq-gold-bright)) right top    / 3px 3px no-repeat,
    linear-gradient(var(--sq-gold-bright), var(--sq-gold-bright)) left  bottom / 3px 3px no-repeat,
    linear-gradient(var(--sq-gold-bright), var(--sq-gold-bright)) right bottom / 3px 3px no-repeat;
}
.sq-theme-rise { animation: sq-theme-rise 260ms cubic-bezier(.16,.9,.3,1.03) both; }

/* ---- header band ------------------------------------------------------ */
.sq-theme-head {
  position: relative; z-index: 4;
  display: flex; align-items: center; gap: 14px;
  padding: 14px 20px 12px;
  background: linear-gradient(180deg, rgba(61,52,87,.9), rgba(26,20,38,.2));
  border-bottom: 2px solid var(--sq-gold-deep);
}
.sq-theme-title {
  font-size: 15px; letter-spacing: .30em; font-weight: 700;
  color: var(--sq-gold-bright);
  text-shadow: 0 2px 0 var(--sq-ink);
}
.sq-theme-sub {
  font-size: 10px; letter-spacing: .18em; color: var(--sq-text-dim);
}
.sq-theme-spacer { flex: 1 1 auto; }

.sq-theme-x {
  font: inherit; font-size: 13px; line-height: 1; cursor: pointer;
  color: var(--sq-parchment-dim); background: var(--sq-ink);
  border: 2px solid var(--sq-slate-light); padding: 6px 9px;
  transition: color 120ms, border-color 120ms, background 120ms;
}
.sq-theme-x:hover { color: var(--sq-bad); border-color: var(--sq-bad); background: var(--sq-slate); }

/* ---- tabs ------------------------------------------------------------- */
.sq-theme-tabs {
  position: relative; z-index: 4;
  display: flex; gap: 0; flex-wrap: wrap;
  padding: 0 16px; background: rgba(26,20,38,.72);
  border-bottom: 2px solid var(--sq-gold-deep);
}
.sq-theme-tab {
  font: inherit; font-size: 10px; letter-spacing: .18em; cursor: pointer;
  color: var(--sq-text-dim); background: transparent;
  border: 0; border-bottom: 3px solid transparent;
  padding: 11px 16px 9px; position: relative;
  transition: color 140ms, border-color 140ms, transform 120ms;
}
.sq-theme-tab:hover { color: var(--sq-parchment); transform: translateY(-1px); }
.sq-theme-tab.sq-theme-on {
  color: var(--sq-gold-bright); border-bottom-color: var(--sq-gold);
  text-shadow: 0 0 10px rgba(255,204,92,.45);
}

/* ---- parchment content ground ---------------------------------------- */
.sq-theme-body {
  position: relative; z-index: 2;
  overflow: auto;
  padding: 18px 20px 22px;
  color: #3a2c1e;
  background:
    repeating-linear-gradient(0deg, rgba(120,86,46,.045) 0 2px, transparent 2px 4px),
    linear-gradient(180deg, var(--sq-parchment) 0%, var(--sq-parchment-dim) 100%);
  border-top: 1px solid rgba(255,233,168,.5);
}
.sq-theme-body-dark {
  color: var(--sq-text);
  background:
    repeating-linear-gradient(0deg, rgba(255,233,168,.030) 0 2px, transparent 2px 4px),
    linear-gradient(180deg, var(--sq-slate) 0%, var(--sq-ink) 100%);
}
.sq-theme-body::-webkit-scrollbar { width: 10px; height: 10px; }
.sq-theme-body::-webkit-scrollbar-track { background: rgba(74,63,107,.18); }
.sq-theme-body::-webkit-scrollbar-thumb {
  background: var(--sq-gold-deep); border: 2px solid rgba(0,0,0,.20);
}
.sq-theme-body::-webkit-scrollbar-thumb:hover { background: var(--sq-gold); }

/* ---- section headings on parchment ----------------------------------- */
.sq-theme-rule {
  display: flex; align-items: center; gap: 10px;
  margin: 20px 0 12px; font-size: 10px; letter-spacing: .24em;
  color: #7a5a2c;
}
.sq-theme-rule:first-child { margin-top: 2px; }
.sq-theme-rule::after {
  content: ''; flex: 1 1 auto; height: 2px;
  background: linear-gradient(90deg, var(--sq-gold-deep), rgba(201,146,47,0));
}
.sq-theme-rule-dark { color: var(--sq-gold); }

/* ---- cards ------------------------------------------------------------ */
.sq-theme-card {
  position: relative;
  background: linear-gradient(180deg, #fdf3dd 0%, #efdcb6 100%);
  border: 2px solid #c9a86a;
  box-shadow: 3px 3px 0 rgba(90,64,30,.28);
  transition: transform 130ms cubic-bezier(.2,.9,.3,1.1), box-shadow 130ms, border-color 130ms;
}
.sq-theme-card:hover {
  transform: translate(-1px, -2px);
  box-shadow: 5px 6px 0 rgba(90,64,30,.32);
  border-color: var(--sq-gold-deep);
}
.sq-theme-card-dark {
  background: linear-gradient(180deg, var(--sq-slate-light) 0%, var(--sq-slate) 100%);
  border-color: var(--sq-shade); box-shadow: 3px 3px 0 rgba(10,7,18,.6);
  color: var(--sq-text);
}
.sq-theme-card-dark:hover { border-color: var(--sq-gold-deep); }

/* ---- buttons ---------------------------------------------------------- */
.sq-theme-btn {
  font: inherit; font-size: 10px; letter-spacing: .16em; cursor: pointer;
  color: var(--sq-parchment); background: var(--sq-slate);
  border: 2px solid var(--sq-shade); padding: 8px 14px;
  box-shadow: 2px 2px 0 rgba(10,7,18,.55);
  transition: transform 90ms, box-shadow 90ms, background 120ms, border-color 120ms, color 120ms;
}
.sq-theme-btn:hover:not(:disabled) {
  background: var(--sq-slate-light); border-color: var(--sq-gold); color: var(--sq-gold-bright);
}
.sq-theme-btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: 0 0 0 rgba(0,0,0,0); }
.sq-theme-btn:disabled { opacity: .42; cursor: not-allowed; box-shadow: none; }
.sq-theme-btn.sq-theme-go {
  color: var(--sq-ink);
  background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold-deep));
  border-color: var(--sq-gold-bright); font-weight: 700;
}
.sq-theme-btn.sq-theme-go:hover:not(:disabled) {
  background: linear-gradient(180deg, #fff8e0, var(--sq-gold));
  color: var(--sq-ink);
}
.sq-theme-btn.sq-theme-danger { border-color: var(--sq-bad); color: #ffbfae; }
.sq-theme-btn.sq-theme-danger:hover:not(:disabled) {
  background: var(--sq-bad); color: var(--sq-ink); border-color: var(--sq-bad);
}

/* ---- chips, bars, empties -------------------------------------------- */
.sq-theme-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9px; letter-spacing: .10em; padding: 3px 7px;
  border: 2px solid #c9a86a; background: rgba(255,255,255,.42); color: #5a4020;
}
.sq-theme-bar {
  position: relative; height: 8px; background: var(--sq-ink);
  border: 2px solid var(--sq-shade); overflow: hidden;
}
.sq-theme-bar-fill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(180deg, var(--sq-gold-bright), var(--sq-gold-deep));
  transition: width 420ms cubic-bezier(.2,.9,.3,1);
}
.sq-theme-bar-fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.35) 50%, rgba(255,255,255,0) 100%);
  animation: sq-theme-sheen 2.6s linear infinite;
}
.sq-theme-empty {
  padding: 22px 18px; text-align: center; font-size: 11px; line-height: 1.9;
  color: #8a6a3c; border: 2px dashed #c9a86a; background: rgba(255,255,255,.28);
}
.sq-theme-empty-dark { color: var(--sq-text-dim); border-color: var(--sq-shade); background: rgba(26,20,38,.4); }
.sq-theme-toast {
  position: absolute; left: 20px; right: 20px; bottom: 16px; z-index: 6;
  padding: 10px 14px; font-size: 10px; letter-spacing: .08em;
  color: #ffd8cd; background: rgba(26,20,38,.96);
  border: 2px solid var(--sq-bad); box-shadow: 3px 3px 0 rgba(10,7,18,.6);
  animation: sq-theme-rise 200ms ease-out both;
}
.sq-theme-toast.sq-theme-ok { color: #dff0c4; border-color: var(--sq-good); }
.sq-theme-toast[hidden] { display: none; }

/* ---- motion ----------------------------------------------------------- */
.sq-theme-bump { animation: sq-theme-bump 420ms cubic-bezier(.2,1.4,.4,1) both; }
@keyframes sq-theme-bump {
  0% { transform: scale(1); } 35% { transform: scale(1.18); } 100% { transform: scale(1); }
}
@keyframes sq-theme-fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes sq-theme-rise {
  from { opacity: 0; transform: translateY(14px) scale(.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes sq-theme-sheen {
  0% { transform: translateX(-100%); } 60%, 100% { transform: translateX(100%); }
}
@keyframes sq-theme-glow {
  0%, 100% { box-shadow: 0 0 0 rgba(255,204,92,0); }
  50% { box-shadow: 0 0 14px rgba(255,204,92,.55); }
}
@media (prefers-reduced-motion: reduce) {
  .sq-theme-scrim, .sq-theme-rise, .sq-theme-bump, .sq-theme-toast { animation: none; }
  .sq-theme-bar-fill::after { animation: none; }
}
`;
  document.head.appendChild(s);
}

export default injectTheme;
