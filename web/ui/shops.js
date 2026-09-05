// web/ui/shops.js  [AGENT-H]
// The four vendors. They are deliberately four different characters, not four
// tables: the Merchant restocks and haggles, the Archivist gates progression,
// v5: the Broker sells nothing at all (Dark Boxes are earned, never bought) and
// the Exchange turns shards into florins one way, at a deliberately steep rate.
// Which vendors appear is decided by the BUILDING you walked into — see
// VENDORS_AT.
// Exactly one <style> tag, every selector namespaced .sq-shops-*.

import {
  PALETTE,
  CURRENCIES,
  CURRENCY_IDS,
  RARITIES,
  MATERIAL_IDS,
  MAIN_CURRENCY,
  sellBundle,
  CHARMS,
  QUEST_ITEMS,
  SHARD_TO_FLORIN,
} from '../../shared/constants.js';
import {
  MATERIALS,
  TOOLS,
  BUILDINGS,
  RECIPES,
  getRecipe,
} from '../../shared/recipes.js';

const STYLE_ID = 'sq-shops-style';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

// The vendors, in the order they matter to a new player.
const VENDORS = [
  {
    id: 'merchant',
    tab: 'MERCHANT',
    glyph: '🜛',
    name: 'The Wandering Merchant',
    // He stopped restocking when the shelf became fixed; the old line promised a
    // fresh five every morning and had been a lie ever since.
    line: 'Tools, charms, and whatever else I am carrying. I do not restock, and I do not run out.',
    color: CURRENCIES.florin.color,
  },
  {
    id: 'archivist',
    tab: 'ARCHIVIST',
    glyph: '✦',
    name: 'The Archivist',
    line: 'You cannot build what you have not read. Every blueprint here is a door; the coin is only the handle.',
    color: PALETTE.accent,
  },
  {
    id: 'broker',
    tab: 'BROKER',
    glyph: '⬛',
    name: 'The Broker',
    line: 'I dealt in boxes once. They are not for sale at any price now — go and earn them.',
    color: PALETTE.textDim,
  },
  {
    id: 'exchange',
    tab: 'EXCHANGE',
    glyph: '⇄',
    name: 'The Exchange',
    line: 'Shards for florins. Twenty-five for one, and no, not the other way round.',
    color: CURRENCIES.florin.color,
  },
  {
    id: 'woodsman',
    tab: 'WOODSMAN',
    glyph: '🪓',
    name: 'The Woodsman',
    line: 'You found me. Then you may as well sell me your timber — I pay better than town.',
    color: PALETTE.good,
  },
  {
    id: 'stonemason',
    tab: 'STONEMASON',
    glyph: '⛰',
    name: 'The Stonemason',
    line: 'Stone. Not wood, not glass, not whatever that is. Stone, and I pay properly for it.',
    color: CURRENCIES.shard.color,
  },
];

/**
 * WHICH VENDOR STANDS WHERE.
 *
 * The Archive and the Market both used to show every vendor's stock, which made
 * the two buildings interchangeable and the walk between them pointless. A shop
 * is a PLACE: what you can do is decided by the door you came through.
 *
 * A panel opened with no place at all (the old ⌘3 shortcut) shows nothing to
 * buy — see `render`. That is the bypass closed at the panel itself, so it
 * stays closed however the panel is raised.
 */
const VENDORS_AT = Object.freeze({
  trading_post:  ['merchant'],
  archive:       ['archivist'],
  exchange_post: ['exchange'],
  woodsman_camp:   ['woodsman'],
  stonemason_camp: ['stonemason'],
});

// Fallback shelf price when the vendor has not quoted one yet. Only ever shown
// with a "~" and a tooltip saying so — the server's number is authoritative.
const RARITY_BASE_PRICE = {
  common: 20, uncommon: 45, rare: 110, epic: 260, legendary: 700,
};

const SELL_RATE = 0.4;      // legacy; the sell side quotes bundles now

/**
 * WHAT THE TRADING POST TAKES.
 *
 * Timber, stone and fish — not "every material you happen to hold". The Post is
 * a town counter, not a fence: it should buy the things the Home Block produces
 * and nothing else, which is also why the outlanders still matter.
 *
 * The rates are the ordinary town bundles (5 commons for 1 florin) against the
 * outlanders' 7-for-2, so he is deliberately the worse price for wood and
 * stone. Fish he is the only buyer for, at 4 for 1.
 */
const TOWN_BUYS = Object.freeze([
  'ironwood', 'heartwood', 'resin', 'seedpod',
  'chalkstone', 'lenscrystal',
  'wild_tuna',
]);
// The Exchange's fixed, deliberately steep rate. Mirrors SHARD_TO_FLORIN on the
// server; the server is still the authority and re-checks every trade.
const RATE = SHARD_TO_FLORIN;
const MAIN = MAIN_CURRENCY;
const BROKER_BASE = 300;
const BROKER_STEP = 1.6;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback || 0);
}

function rarityColor(rarity) {
  const r = RARITIES[rarity];
  return (r && r.color) || PALETTE.border;
}

function matDef(id) {
  return (MATERIALS && MATERIALS[id]) || {
    id, name: String(id), rarity: 'common', color: PALETTE.textDim, symbol: '?',
  };
}

/** Turn anything price-shaped into a { coinId: amount } map. */
function coinMap(price, currencyHint) {
  const out = {};
  if (price === null || price === undefined) return out;
  if (typeof price === 'number') {
    const id = CURRENCY_IDS.indexOf(currencyHint) !== -1 ? currencyHint : 'focus';
    if (price > 0) out[id] = Math.round(price);
    return out;
  }
  if (typeof price === 'object') {
    for (const id of CURRENCY_IDS) {
      const v = num(price[id], 0);
      if (v > 0) out[id] = Math.round(v);
    }
  }
  return out;
}

function priceTotal(map) {
  return CURRENCY_IDS.reduce((s, id) => s + num(map[id], 0), 0);
}

function canAffordMap(wallet, map) {
  for (const id of CURRENCY_IDS) {
    if (num(map[id], 0) > num(wallet && wallet[id], 0)) return false;
  }
  return true;
}

/** A row of coin chips, red where the wallet cannot cover it. */
function priceRow(map, wallet, approx) {
  const row = el('div', 'sq-shops-price');
  const ids = CURRENCY_IDS.filter((id) => num(map[id], 0) > 0);
  if (!ids.length) {
    row.appendChild(el('span', 'sq-shops-chip', 'free'));
    return row;
  }
  for (const id of ids) {
    const c = CURRENCIES[id];
    const need = num(map[id], 0);
    const have = num(wallet && wallet[id], 0);
    const ok = have >= need;
    const chip = el('span', `sq-shops-chip ${ok ? 'sq-shops-can' : 'sq-shops-cant'}`,
      `${c.symbol} ${approx ? '~' : ''}${need}`);
    chip.title = `${c.name}: you hold ${have}, this costs ${need}.`
      + (approx ? '\nEstimated — the vendor confirms the real price on purchase.' : '');
    row.appendChild(chip);
  }
  return row;
}

function localDayKey(d) {
  const dt = d || new Date();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Time left until local midnight, as a human string. */
function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const ms = Math.max(0, next.getTime() - now.getTime());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** What a recipe actually gives you, in words. */
function recipeUnlocks(recipe) {
  if (!recipe) return { name: 'Unknown', desc: '', kind: '' };
  if (recipe.kind === 'building') {
    const b = (BUILDINGS && BUILDINGS[recipe.outputId]) || null;
    return {
      name: (b && b.name) || recipe.outputId,
      desc: (b && b.desc) || '',
      kind: 'BUILDING',
    };
  }
  const t = (TOOLS && TOOLS[recipe.outputId]) || null;
  return {
    name: (t && t.name) || recipe.outputId,
    desc: (t && t.desc) || '',
    kind: (t && t.gather) ? 'GATHERING TOOL' : 'TOOL',
  };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-shops-scrim {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(8,9,14,0.72);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 56px 16px 16px;
  overflow: auto;
  font-family: ${MONO};
  letter-spacing: 0.06em;
  color: ${PALETTE.text};
  image-rendering: pixelated;
}
.sq-shops-scrim[hidden] { display: none; }
.sq-shops-panel {
  position: relative;
  width: 100%; max-width: 900px;
  max-height: calc(100vh - 72px);
  display: flex; flex-direction: column;
  background: ${PALETTE.panel};
  border: 3px solid ${PALETTE.border};
  box-shadow: 7px 7px 0 rgba(0,0,0,0.7);
}
.sq-shops-head {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: ${PALETTE.panelLight};
  border-bottom: 3px solid ${PALETTE.border};
}
.sq-shops-title { font-size: 14px; font-weight: 700; color: ${PALETTE.accent}; }
.sq-shops-wallet { display: flex; gap: 8px; flex-wrap: wrap; }
.sq-shops-wcoin {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; padding: 2px 6px;
  border: 2px solid ${PALETTE.border};
  background: ${PALETTE.panel};
  font-variant-numeric: tabular-nums;
}
.sq-shops-x {
  font-family: ${MONO}; font-size: 14px; line-height: 1;
  padding: 4px 9px; cursor: pointer;
  background: ${PALETTE.panel}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
  box-shadow: 2px 2px 0 rgba(0,0,0,0.6);
}
.sq-shops-x:hover { background: ${PALETTE.bad}; color: ${PALETTE.bg}; }

.sq-shops-roulette {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; margin-bottom: 14px;
  background: rgba(12,10,20,.35); border: 2px solid var(--sq-shade);
}
.sq-shops-wheel {
  font-size: 30px; line-height: 1; color: ${CURRENCIES.florin.color};
  transition: transform 900ms cubic-bezier(.2,.9,.2,1);
}
.sq-shops-wheelspin { transform: rotate(1080deg); }
.sq-shops-roulettenote { font-size: 10px; line-height: 1.5; color: ${PALETTE.textDim}; }
.sq-shops-tabs { flex: 0 0 auto; display: flex; border-bottom: 3px solid ${PALETTE.border}; }
/* An element with an explicit display value ignores the hidden attribute. The
   vendor tabs set display:flex, so hiding a vendor did nothing at all and every
   shop still listed every other shop — the exact bug the split was meant to
   fix, hidden behind a test that trusted the attribute instead of measuring. */
.sq-shops-scrim [hidden] { display: none !important; }
.sq-shops-tab {
  flex: 1 1 auto;
  font-family: ${MONO}; letter-spacing: 0.1em; font-size: 11px;
  padding: 9px 6px; cursor: pointer;
  background: ${PALETTE.panel}; color: ${PALETTE.textDim};
  border: 0; border-right: 2px solid ${PALETTE.border};
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.sq-shops-tab:last-child { border-right: 0; }
.sq-shops-tab:hover { color: ${PALETTE.text}; }
.sq-shops-tab.sq-shops-active { background: ${PALETTE.panelLight}; }
.sq-shops-tabdot {
  font-size: 9px; padding: 1px 5px;
  border: 2px solid currentColor;
}

.sq-shops-body {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 14px;
}

/* ---- the vendor speaks first: each tab opens with a character, not a table ---- */
.sq-shops-vendor {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 11px 12px; margin-bottom: 14px;
  background: ${PALETTE.bg};
  border: 3px solid ${PALETTE.border};
  box-shadow: 4px 4px 0 rgba(0,0,0,0.55);
}
.sq-shops-portrait {
  flex: 0 0 auto;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; line-height: 1;
  background: ${PALETTE.panelLight};
  border: 3px solid ${PALETTE.border};
}
.sq-shops-vinfo { flex: 1 1 auto; min-width: 0; }
.sq-shops-vname { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.sq-shops-vline { font-size: 10px; color: ${PALETTE.textDim}; line-height: 1.5; }
.sq-shops-vnote { font-size: 9px; color: ${PALETTE.accent}; margin-top: 6px; }

/* ---- BUY / SELL ---- */
.sq-shops-modes { display: flex; gap: 8px; margin: 0 0 14px; }
.sq-shops-mode {
  flex: 1 1 0; padding: 9px 0; cursor: pointer;
  font: inherit; font-size: 11px; letter-spacing: .18em;
  background: rgba(26,20,38,.55); color: ${PALETTE.textDim};
  border: 2px solid ${PALETTE.border};
}
.sq-shops-mode:hover { border-color: rgba(201,146,47,.55); color: ${PALETTE.text}; }
.sq-shops-modeon {
  background: rgba(201,146,47,.16); border-color: #c9922f; color: #ffe9a8;
  box-shadow: inset 0 0 0 1px rgba(201,146,47,.30);
}

.sq-shops-sub {
  font-size: 10px; color: ${PALETTE.textDim};
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 2px solid ${PALETTE.border};
}
.sq-shops-sub:first-child { margin-top: 0; }
.sq-shops-empty { font-size: 10px; color: ${PALETTE.textDim}; padding: 6px 0; }
.sq-shops-note { font-size: 9px; color: ${PALETTE.textDim}; margin-top: 6px; line-height: 1.5; }

.sq-shops-cards { display: flex; flex-direction: column; gap: 9px; }
.sq-shops-offer {
  display: flex; gap: 11px; align-items: center; flex-wrap: wrap;
  padding: 9px 11px;
  background: ${PALETTE.bg};
  border: 2px solid ${PALETTE.border};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.55);
}
.sq-shops-sym { font-size: 22px; line-height: 1; flex: 0 0 auto; width: 26px; text-align: center; }
.sq-shops-oinfo { flex: 1 1 200px; min-width: 0; }
.sq-shops-oname { font-size: 12px; }
.sq-shops-odesc { font-size: 9px; color: ${PALETTE.textDim}; margin-top: 3px; line-height: 1.5; }
.sq-shops-oside { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.sq-shops-price { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.sq-shops-chip {
  font-size: 10px; padding: 2px 6px;
  border: 2px solid ${PALETTE.border};
  background: ${PALETTE.panelLight};
  font-variant-numeric: tabular-nums;
}
.sq-shops-chip.sq-shops-can { color: ${PALETTE.good}; border-color: ${PALETTE.good}; }
.sq-shops-chip.sq-shops-cant { color: ${PALETTE.bad}; border-color: ${PALETTE.bad}; }

.sq-shops-btn {
  font-family: ${MONO}; letter-spacing: 0.08em;
  font-size: 11px; padding: 6px 12px; cursor: pointer;
  background: ${PALETTE.panelLight}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.6);
}
.sq-shops-btn:hover:not(:disabled) { background: ${PALETTE.accent}; color: ${PALETTE.bg}; }
.sq-shops-btn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 1px 1px 0 rgba(0,0,0,0.6); }
.sq-shops-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.sq-shops-btn.sq-shops-go { background: ${PALETTE.good}; color: ${PALETTE.bg}; border-color: ${PALETTE.good}; }
.sq-shops-btn.sq-shops-tiny { font-size: 11px; padding: 3px 9px; }

/* ---- the sell side ---- */
.sq-shops-sell {
  display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;
  padding: 11px;
  background: ${PALETTE.bg};
  border: 2px solid ${PALETTE.border};
}
.sq-shops-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sq-shops-label { font-size: 9px; color: ${PALETTE.textDim}; }
.sq-shops-select, .sq-shops-input {
  font-family: ${MONO}; letter-spacing: 0.06em; font-size: 11px;
  padding: 5px 6px;
  height: 26px; box-sizing: border-box; line-height: 1;
  background: ${PALETTE.panel}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
  flex: 0 0 auto;
}
.sq-shops-select:focus, .sq-shops-input:focus { outline: none; border-color: ${PALETTE.accent}; }
.sq-shops-stepper { display: flex; gap: 0; align-items: stretch; }
.sq-shops-step {
  font-family: ${MONO}; font-size: 13px; line-height: 1;
  width: 26px; height: 26px; cursor: pointer;
  background: ${PALETTE.panelLight}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
}
.sq-shops-step:hover:not(:disabled) { background: ${PALETTE.accent}; color: ${PALETTE.bg}; }
.sq-shops-step:disabled { opacity: 0.35; cursor: not-allowed; }
.sq-shops-qty {
  width: 54px; text-align: center;
  border-left: 0; border-right: 0;
}
.sq-shops-quote {
  font-size: 11px; color: ${PALETTE.good};
  padding: 5px 0;
  font-variant-numeric: tabular-nums;
}
.sq-shops-quote.sq-shops-quietquote { color: ${PALETTE.textDim}; }

/* ---- the Archivist: this is the progression gate, so it gets the weight ---- */
.sq-shops-arch { border-color: ${PALETTE.accent}; }
.sq-shops-progress {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: ${PALETTE.bg};
  border: 3px solid ${PALETTE.accent};
  box-shadow: 4px 4px 0 rgba(0,0,0,0.55);
}
.sq-shops-progresstop {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 11px; margin-bottom: 7px;
}
.sq-shops-progresscount { color: ${PALETTE.accent}; font-variant-numeric: tabular-nums; }
.sq-shops-progressbar {
  height: 12px; width: 100%;
  background: ${PALETTE.panel};
  border: 2px solid ${PALETTE.border};
  overflow: hidden;
}
.sq-shops-progressfill {
  height: 100%; width: 0%;
  background: ${PALETTE.accent};
  transition: width 380ms cubic-bezier(.2,.9,.25,1);
}
.sq-shops-bp {
  display: flex; gap: 11px; align-items: flex-start; flex-wrap: wrap;
  padding: 11px 12px;
  background: ${PALETTE.bg};
  border: 3px solid ${PALETTE.accent};
  box-shadow: 4px 4px 0 rgba(0,0,0,0.6);
}
.sq-shops-bp.sq-shops-owned {
  border: 2px solid ${PALETTE.good};
  box-shadow: 2px 2px 0 rgba(0,0,0,0.5);
  padding: 7px 10px;
  opacity: 0.78;
}
.sq-shops-bplock { font-size: 20px; line-height: 1; flex: 0 0 auto; }
.sq-shops-bpinfo { flex: 1 1 240px; min-width: 0; }
.sq-shops-bpkind {
  font-size: 8px; color: ${PALETTE.textDim};
  letter-spacing: 0.16em; margin-bottom: 3px;
}
.sq-shops-bpname { font-size: 13px; color: ${PALETTE.accent}; }
.sq-shops-bp.sq-shops-owned .sq-shops-bpname { font-size: 11px; color: ${PALETTE.good}; }
.sq-shops-bpunlocks { font-size: 9px; color: ${PALETTE.textDim}; margin-top: 4px; line-height: 1.5; }
.sq-shops-bpingr { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.sq-shops-known {
  font-size: 9px; color: ${PALETTE.good};
  border: 2px solid ${PALETTE.good};
  padding: 3px 8px;
}

/* ---- the Broker: the escalation must be visible, not discovered ---- */
.sq-shops-ladder {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: stretch;
  margin: 10px 0 4px;
}
.sq-shops-rung {
  flex: 0 0 auto;
  padding: 6px 9px; min-width: 62px;
  text-align: center;
  font-size: 10px;
  border: 2px solid ${PALETTE.border};
  background: ${PALETTE.panel};
  color: ${PALETTE.textDim};
  font-variant-numeric: tabular-nums;
}
.sq-shops-rung.sq-shops-spent { opacity: 0.4; text-decoration: line-through; }
.sq-shops-rung.sq-shops-now {
  border-color: ${PALETTE.accent}; color: ${PALETTE.accent};
  background: ${PALETTE.bg};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.55);
}
.sq-shops-rung.sq-shops-next { border-color: ${PALETTE.bad}; color: ${PALETTE.bad}; }
.sq-shops-runglabel { font-size: 8px; display: block; color: inherit; opacity: 0.8; }
.sq-shops-bigprice {
  font-size: 30px; line-height: 1; font-weight: 800;
  color: ${PALETTE.accent};
  text-shadow: 3px 3px 0 rgba(0,0,0,0.6);
  font-variant-numeric: tabular-nums;
}
.sq-shops-nextprice { font-size: 11px; color: ${PALETTE.bad}; margin-top: 6px; }

/* ---- the Exchange: show the loss, never bury it ---- */
.sq-shops-convert {
  display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap;
  padding: 12px;
  background: ${PALETTE.bg};
  border: 2px solid ${PALETTE.border};
}
.sq-shops-flow {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  font-size: 14px;
}
.sq-shops-flowbox {
  padding: 8px 12px; min-width: 96px; text-align: center;
  border: 3px solid ${PALETTE.border};
  background: ${PALETTE.panel};
  font-variant-numeric: tabular-nums;
}
.sq-shops-flowamt { font-size: 20px; font-weight: 700; }
.sq-shops-flowcur { font-size: 9px; color: ${PALETTE.textDim}; margin-top: 3px; }
.sq-shops-arrow { font-size: 20px; color: ${PALETTE.textDim}; }
.sq-shops-loss {
  margin-top: 10px; padding: 8px 10px;
  font-size: 11px; color: ${PALETTE.bad};
  border: 2px dashed ${PALETTE.bad};
  font-variant-numeric: tabular-nums;
}

/* ---- closed / error states ---- */
.sq-shops-closed {
  padding: 22px 16px; text-align: center;
  border: 3px dashed ${PALETTE.border};
  background: ${PALETTE.bg};
}
.sq-shops-closedglyph { font-size: 30px; margin-bottom: 10px; }
.sq-shops-closedline {
  font-size: 11px; line-height: 1.6; color: ${PALETTE.textDim};
  max-width: 46ch; margin: 6px auto 0;
}
.sq-shops-closedtitle { font-size: 12px; color: ${PALETTE.textDim}; margin-bottom: 6px; }
.sq-shops-closedwhy { font-size: 9px; color: ${PALETTE.textDim}; margin-bottom: 12px; word-break: break-word; }

.sq-shops-toast {
  position: absolute; left: 14px; right: 14px; bottom: 10px;
  padding: 8px 10px; font-size: 11px;
  background: ${PALETTE.bg}; color: ${PALETTE.bad};
  border: 2px solid ${PALETTE.bad};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.6);
  z-index: 5;
}
.sq-shops-toast[hidden] { display: none; }
.sq-shops-toast.sq-shops-ok { color: ${PALETTE.good}; border-color: ${PALETTE.good}; }
`;
  document.head.appendChild(s);
}

export function createShops(root, api) {
  injectStyle();

  const host = root || document.body;
  let state = null;
  let open = false;
  let tab = 'merchant';

  // Which building raised the panel. `null` means "opened from nowhere" — the
  // menu shortcut, or a caller that forgot — and nothing is for sale.
  let place = null;

  /** The vendors reachable from where the player is standing. */
  function allowedVendors() {
    const ids = VENDORS_AT[place] || [];
    return VENDORS.filter((v) => ids.indexOf(v.id) !== -1);
  }

  // Vendor stock as last handed over by the server. `null` means never loaded.
  let shopData = null;
  let shopError = null;
  let loading = false;

  // Sticky form state — these must survive a re-render triggered by setState.
  const sellForm = { materialId: null, qty: 1 };
  /**
   * Which half of the Trading Post is showing. Two buttons at the top rather
   * than one long page: buying and selling are different errands, and stacking
   * them meant scrolling past the whole counter to reach the sell side.
   */
  let postMode = 'buy';
  const exForm = { from: 'grind', to: 'spark', amount: 100 };

  // ---- shell ---------------------------------------------------------------
  const scrim = el('div', 'sq-shops-scrim');
  scrim.hidden = true;
  const panel = el('div', 'sq-shops-panel');
  scrim.appendChild(panel);

  const head = el('div', 'sq-shops-head');
  // The title names the building you walked into. "MARKET ROW" everywhere was
  // a leftover from when every vendor shared one screen.
  const titleEl = el('div', 'sq-shops-title', 'MARKET ROW');
  head.appendChild(titleEl);
  const walletEl = el('div', 'sq-shops-wallet');
  head.appendChild(walletEl);
  const xBtn = el('button', 'sq-shops-x', '✕');
  xBtn.type = 'button';
  head.appendChild(xBtn);
  panel.appendChild(head);

  const tabsBar = el('div', 'sq-shops-tabs');
  const tabBtns = {};
  const tabDots = {};
  for (const v of VENDORS) {
    const b = el('button', 'sq-shops-tab');
    b.type = 'button';
    b.appendChild(el('span', null, v.tab));
    const dot = el('span', 'sq-shops-tabdot');
    dot.hidden = true;
    b.appendChild(dot);
    b.addEventListener('click', () => {
      tab = v.id;
      render();
    });
    tabsBar.appendChild(b);
    tabBtns[v.id] = b;
    tabDots[v.id] = dot;
  }
  panel.appendChild(tabsBar);

  const body = el('div', 'sq-shops-body');
  panel.appendChild(body);

  const toast = el('div', 'sq-shops-toast');
  toast.hidden = true;
  panel.appendChild(toast);

  host.appendChild(scrim);

  let toastTimer = 0;
  function showToast(msg, ok) {
    toast.textContent = String(msg || '');
    toast.classList.toggle('sq-shops-ok', !!ok);
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  // ---- state readers -------------------------------------------------------
  function wallet() {
    return (state && state.player && state.player.coins) || {};
  }
  function materialsHeld() {
    return (state && state.materials) || {};
  }
  function heldQty(id) {
    return num(materialsHeld()[id], 0);
  }
  function ownedBlueprints() {
    return (state && Array.isArray(state.blueprints)) ? state.blueprints : [];
  }
  function ownsBlueprint(recipeId) {
    return ownedBlueprints().indexOf(recipeId) !== -1;
  }

  // ---- normalising whatever /api/shops hands back --------------------------
  // The server module is being written in parallel, so accept every reasonable
  // shape rather than hard-coding one and breaking on the first mismatch.
  function pickStock(raw, id) {
    if (!raw || typeof raw !== 'object') return [];
    const direct = raw[id];
    if (Array.isArray(direct)) return direct;
    if (direct && Array.isArray(direct.stock)) return direct.stock;
    if (direct && Array.isArray(direct.offers)) return direct.offers;
    if (raw.stock && typeof raw.stock === 'object') {
      const s = raw.stock[id];
      if (Array.isArray(s)) return s;
      if (s && Array.isArray(s.offers)) return s.offers;
    }
    return [];
  }

  function normShops(res) {
    const raw = (res && (res.shops || res.state && res.state.shops)) || null;
    const fromState = (state && state.shops) || null;
    const src = raw || fromState;
    if (!src || typeof src !== 'object') return null;

    // The shelf carries TOOLS and CHARMS now, not materials — so the mapper can
    // no longer assume a materialId, and an offer without one is no longer junk
    // to be filtered away. `kind` decides how the card is drawn.
    const merchant = pickStock(src, 'merchant').map((o, i) => {
      if (!o || typeof o !== 'object') return null;
      const kind = o.kind
        || (o.charmId ? 'charm' : (o.questItemId ? 'questItem' : (o.toolId ? 'tool' : 'material')));
      return {
        offerId: o.offerId || o.id || `merchant-${i}`,
        kind,
        materialId: o.materialId || (kind === 'material' ? (o.material || o.itemId) : null),
        toolId: o.toolId || null,
        charmId: o.charmId || null,
        questItemId: o.questItemId || null,
        name: o.name || '',
        desc: o.desc || '',
        color: o.color || null,
        rarity: o.rarity || 'common',
        qty: Math.max(1, Math.round(num(o.qty || o.count, 1))),
        price: coinMap(o.price !== undefined ? o.price : o.cost, o.currency),
        soldOut: !!(o.soldOut || o.sold),
      };
      // THE FILTER IS WHY THE SILVER KEY NEVER APPEARED. It kept only offers
      // with a material, tool or charm id — a QUEST ITEM has none of those, so
      // the key was dropped here, silently, after the server had correctly put
      // it on the counter. Every kind the shelf can carry has to be named.
    }).filter((o) => o && (o.materialId || o.toolId || o.charmId || o.questItemId));

    const archivist = pickStock(src, 'archivist').map((o, i) => {
      if (!o || typeof o !== 'object') return null;
      const recipeId = o.recipeId || o.blueprintId || o.unlocks || o.id;
      return {
        offerId: o.offerId || o.id || recipeId || `archivist-${i}`,
        recipeId,
        price: coinMap(o.price !== undefined ? o.price : o.cost, o.currency),
      };
    }).filter((o) => o && o.recipeId);

    const brokerStock = pickStock(src, 'broker');
    const brokerRaw = (src.broker && !Array.isArray(src.broker)) ? src.broker : {};
    const firstBox = brokerStock.find((o) => o && typeof o === 'object') || {};
    const sold = Math.max(0, Math.round(num(
      src.brokerBoxesSoldToday !== undefined ? src.brokerBoxesSoldToday : brokerRaw.soldToday, 0)));

    let brokerPrice = coinMap(
      firstBox.price !== undefined ? firstBox.price
        : (brokerRaw.price !== undefined ? brokerRaw.price : null),
      firstBox.currency || brokerRaw.currency);
    let brokerQuoted = priceTotal(brokerPrice) > 0;
    if (!brokerQuoted) {
      brokerPrice = coinMap(Math.round(BROKER_BASE * Math.pow(BROKER_STEP, sold)), 'focus');
    }
    let brokerNext = coinMap(
      brokerRaw.nextPrice !== undefined ? brokerRaw.nextPrice : firstBox.nextPrice,
      firstBox.currency || brokerRaw.currency);
    if (priceTotal(brokerNext) <= 0) {
      brokerNext = {};
      for (const id of CURRENCY_IDS) {
        const v = num(brokerPrice[id], 0);
        if (v > 0) brokerNext[id] = Math.round(v * BROKER_STEP);
      }
    }

    return {
      refreshedOn: src.refreshedOn || src.day || null,
      merchant,
      archivist,
      broker: {
        offerId: firstBox.offerId || firstBox.id || brokerRaw.offerId || 'dark_box',
        soldToday: sold,
        price: brokerPrice,
        nextPrice: brokerNext,
        quoted: brokerQuoted,
      },
      // THE OUTLANDERS WERE BEING DROPPED HERE.
      //
      // `renderOutlander` reads `shopData[vendorId].buys`, and this function
      // built a fresh object that never carried `woodsman` or `stonemason` —
      // so both tabs fell through to "He is not buying just now" no matter what
      // the server sent. It went unnoticed because 13-economy asserted their
      // prices off the API response and their sales through `api.sell`, never
      // off the rows on screen. Passed through verbatim now.
      // The Merchant's own buy list, so the sell tab quotes the vendor's lots
      // rather than a second guess derived here.
      merchantBuys: (src.merchant && Array.isArray(src.merchant.buys)) ? src.merchant.buys : null,
      woodsman: (src.woodsman && typeof src.woodsman === 'object') ? src.woodsman : null,
      stonemason: (src.stonemason && typeof src.stonemason === 'object') ? src.stonemason : null,
      // Who will trade with you at all — the server's answer, not ours.
      vendors: (res && res.vendors && typeof res.vendors === 'object') ? res.vendors : null,
      sellPrices: (src.sellPrices && typeof src.sellPrices === 'object') ? src.sellPrices : null,
      shelfPrices: (src.prices && typeof src.prices === 'object') ? src.prices : null,
    };
  }

  /** Shelf price of a material — the vendor's quote if we have one, else an estimate. */
  function shelfPrice(materialId) {
    if (shopData && shopData.shelfPrices) {
      const p = coinMap(shopData.shelfPrices[materialId]);
      if (priceTotal(p) > 0) return { map: p, approx: false };
    }
    if (shopData && Array.isArray(shopData.merchant)) {
      const hit = shopData.merchant.find((o) => o.materialId === materialId && priceTotal(o.price) > 0);
      if (hit) {
        const per = {};
        for (const id of CURRENCY_IDS) {
          const v = num(hit.price[id], 0);
          if (v > 0) per[id] = Math.max(1, Math.round(v / Math.max(1, hit.qty)));
        }
        return { map: per, approx: false };
      }
    }
    const def = matDef(materialId);
    const base = RARITY_BASE_PRICE[def.rarity] || RARITY_BASE_PRICE.common;
    return { map: coinMap(base, 'focus'), approx: true };
  }

  /**
   * The town's lot for a material: `{ per, pay }`.
   *
   * Prefers the vendor's own quote out of `shopData`, so the panel and the
   * server cannot disagree; falls back to the shared rarity table, which is the
   * same table the server derives from.
   */
  function townBundle(materialId) {
    const listed = shopData && Array.isArray(shopData.merchantBuys)
      ? shopData.merchantBuys.find((x) => x && x.materialId === materialId) : null;
    if (listed && num(listed.per, 0) > 0) {
      return { per: num(listed.per, 5), pay: Math.max(1, num(listed.pay, 1)) };
    }
    const def = matDef(materialId);
    return sellBundle(def.rarity, 'town');
  }

  /** What the merchant pays per unit — 40% of the shelf price. */
  function sellUnit(materialId) {
    if (shopData && shopData.sellPrices) {
      const p = coinMap(shopData.sellPrices[materialId]);
      if (priceTotal(p) > 0) return { map: p, approx: false };
    }
    const shelf = shelfPrice(materialId);
    const out = {};
    for (const id of CURRENCY_IDS) {
      const v = num(shelf.map[id], 0);
      if (v > 0) out[id] = Math.max(1, Math.round(v * SELL_RATE));
    }
    return { map: out, approx: true };
  }

  // ---- loading -------------------------------------------------------------
  async function refresh(force) {
    if (loading) return;
    if (shopData && !force) return;
    loading = true;
    if (open) render();
    try {
      const res = await api.shops();
      if (res && res.ok) {
        shopError = null;
        shopData = normShops(res);
        if (!shopData) shopError = 'The vendors sent back nothing to sell.';
      } else {
        shopError = (res && res.error) || 'The vendors did not answer.';
      }
    } catch (err) {
      shopError = String((err && err.message) || err);
    } finally {
      loading = false;
      if (open) render();
    }
  }

  // ---- shared bits ---------------------------------------------------------
  function vendorHeader(v, note) {
    const box = el('div', 'sq-shops-vendor');
    if (v.id === 'archivist') box.classList.add('sq-shops-arch');
    box.style.borderColor = v.color;
    const portrait = el('div', 'sq-shops-portrait', v.glyph);
    portrait.style.color = v.color;
    portrait.style.borderColor = v.color;
    box.appendChild(portrait);
    const info = el('div', 'sq-shops-vinfo');
    const nameEl = el('div', 'sq-shops-vname', v.name);
    nameEl.style.color = v.color;
    info.appendChild(nameEl);
    info.appendChild(el('div', 'sq-shops-vline', `“${v.line}”`));
    if (note) info.appendChild(el('div', 'sq-shops-vnote', note));
    box.appendChild(info);
    return box;
  }

  function closedState(why) {
    const box = el('div', 'sq-shops-closed');
    box.appendChild(el('div', 'sq-shops-closedglyph', '🚪'));
    box.appendChild(el('div', 'sq-shops-closedtitle',
      loading ? 'Market Row is opening up…' : 'The vendors are closed.'));
    if (!loading) {
      box.appendChild(el('div', 'sq-shops-closedwhy',
        why ? String(why) : 'Nobody answered the door.'));
      const btn = el('button', 'sq-shops-btn', 'KNOCK AGAIN');
      btn.type = 'button';
      btn.addEventListener('click', () => { refresh(true); });
      box.appendChild(btn);
    }
    return box;
  }

  function field(label, node) {
    const f = el('div', 'sq-shops-field');
    f.appendChild(el('div', 'sq-shops-label', label));
    f.appendChild(node);
    return f;
  }

  async function doBuy(shopId, offerId, label, btn) {
    btn.disabled = true;
    try {
      const res = await api.buy(shopId, offerId);
      if (res && res.ok) {
        showToast(`Bought ${label}.`, true);
        // The purchase changed the stock as well as the wallet.
        await refresh(true);
        if (res.state) setState(res.state);
        else render();
      } else {
        showToast((res && res.error) || 'The vendor refused the sale.');
        btn.disabled = false;
      }
    } catch (err) {
      showToast(String((err && err.message) || err));
      btn.disabled = false;
    }
  }

  // ---- tab: the Wandering Merchant -----------------------------------------
  function renderMerchant() {
    const v = VENDORS[0];
    body.appendChild(vendorHeader(v,
      'A fixed counter. He does not restock, and nothing here sells out — '
      + 'the tools are replacements, the charms are permanent.'));

    if (!shopData) { body.appendChild(closedState(shopError)); return; }

    const stock = shopData.merchant || [];
    // TWO SECTIONS. Bruno, 2026-09-02: "revamp the trading hall into 2
    // sections: buy ... and a sell section". They were already one after the
    // other; what was missing was saying so, and saying WHAT he takes.
    // The two errands, as buttons. Drawn before either list so the choice is
    // the first thing on the page rather than something found by scrolling.
    const modes = el('div', 'sq-shops-modes');
    for (const m of [{ id: 'buy', label: 'BUY' }, { id: 'sell', label: 'SELL' }]) {
      const b = el('button', `sq-shops-mode${postMode === m.id ? ' sq-shops-modeon' : ''}`, m.label);
      b.type = 'button';
      b.addEventListener('click', () => { postMode = m.id; body.scrollTop = 0; render(); });
      modes.appendChild(b);
    }
    body.appendChild(modes);

    if (postMode === 'sell') { renderSellCards(); return; }

    body.appendChild(el('div', 'sq-shops-sub', `${stock.length} on the counter`));
    if (!stock.length) {
      body.appendChild(el('div', 'sq-shops-empty', 'The counter is bare.'));
    } else {
      const w = wallet();
      const cards = el('div', 'sq-shops-cards');
      for (const o of stock) {
        // Three kinds of card off one shape. Materials are gone from the shelf,
        // but the branch stays so an old save's leftover stock still draws.
        const charm = o.charmId ? CHARMS[o.charmId] : null;
        const quest = o.questItemId ? QUEST_ITEMS[o.questItemId] : null;
        const def = charm
          ? { name: charm.name, symbol: charm.symbol, color: charm.color, rarity: 'rare' }
          : (quest
            ? { name: quest.name, symbol: quest.symbol, color: quest.color, rarity: 'rare' }
            : (o.toolId
              ? { name: o.name || o.toolId, symbol: '⚒', color: '#c9922f', rarity: 'common' }
              : matDef(o.materialId)));
        const card = el('div', 'sq-shops-offer');
        card.style.borderColor = def.color || rarityColor(def.rarity);
        const sym = el('div', 'sq-shops-sym', def.symbol || '?');
        sym.style.color = def.color || rarityColor(def.rarity);
        card.appendChild(sym);

        const info = el('div', 'sq-shops-oinfo');
        info.appendChild(el('div', 'sq-shops-oname',
          def.name + (o.kind === 'material' ? ` ×${o.qty}` : '')));
        const owned = charm
          ? ((state && state.player && (state.player.ownedCharms || [])).indexOf(o.charmId) !== -1)
          : false;
        info.appendChild(el('div', 'sq-shops-odesc',
          charm ? (owned ? 'OWNED · ' + charm.desc : charm.desc)
            : (quest ? (o.desc || quest.desc)
            : (o.toolId ? (o.desc || 'A replacement. Tools wear out.')
              : `${String(def.rarity || '').toUpperCase()} · you hold ${heldQty(o.materialId)}`))));
        card.appendChild(info);

        const side = el('div', 'sq-shops-oside');
        side.appendChild(priceRow(o.price, w, false));
        const btn = el('button', 'sq-shops-btn', 'BUY');
        btn.type = 'button';
        const affordable = canAffordMap(w, o.price);
        if (owned) {
          // A charm is a permanent effect. A second does nothing but cost you
          // twice, and the server refuses it — say so here rather than letting
          // the click fail.
          btn.disabled = true;
          btn.textContent = 'OWNED';
        } else if (o.soldOut) {
          btn.disabled = true;
          btn.textContent = 'SOLD';
        } else if (!affordable) {
          btn.disabled = true;
          btn.title = 'Not enough coin for this one.';
        } else {
          btn.classList.add('sq-shops-go');
        }
        btn.addEventListener('click', () => doBuy('merchant', o.offerId, `${def.name} ×${o.qty}`, btn));
        side.appendChild(btn);
        card.appendChild(side);
        cards.appendChild(card);
      }
      body.appendChild(cards);
    }

  }

  /** Every material the Trading Post takes, as a buy-style card with a SELL. */
  function renderSellCards() {
    body.appendChild(el('div', 'sq-shops-note',
      'He takes timber, stone and fish. He pays LESS than the Woodsman and the '
      + 'Stonemason for wood and stone — they are a long walk, and that is what '
      + 'the walk is worth. Fish he is the only buyer for.'));

    const cards = el('div', 'sq-shops-cards');
    for (const id of TOWN_BUYS) {
      const def = matDef(id);
      const have = heldQty(id);
      const b = townBundle(id);
      const lots = Math.floor(have / b.per);
      const sym = CURRENCIES[MAIN_CURRENCY].symbol;

      const card = el('div', 'sq-shops-offer');
      card.style.borderColor = def.color || rarityColor(def.rarity);
      const symEl = el('div', 'sq-shops-sym', def.symbol || '?');
      symEl.style.color = def.color || rarityColor(def.rarity);
      card.appendChild(symEl);

      const info = el('div', 'sq-shops-oinfo');
      info.appendChild(el('div', 'sq-shops-oname', def.name));
      info.appendChild(el('div', 'sq-shops-odesc',
        `${b.per} for ${sym} ${b.pay}  ·  you carry ${have}`
        + (lots > 0 ? `  ·  ${lots} lot${lots === 1 ? '' : 's'} ready` : '')));
      card.appendChild(info);

      const side = el('div', 'sq-shops-oside');
      // What ONE click sells: every whole lot you are carrying. The stepper it
      // replaces existed to pick a number, and whole lots is the only number
      // that pays anything — a remainder is handed straight back.
      const qty = lots * b.per;
      side.appendChild(el('div', 'sq-shops-price',
        lots > 0 ? `${sym} ${lots * b.pay}` : '—'));
      const btn = el('button', 'sq-shops-btn', lots > 0 ? `SELL ${qty}` : 'SELL');
      btn.type = 'button';
      if (lots < 1) {
        btn.disabled = true;
        btn.title = have > 0
          ? `He deals in lots of ${b.per}. You have ${have}.`
          : 'You are not carrying any.';
      } else {
        btn.classList.add('sq-shops-go');
      }
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = await api.sell(id, qty);
          if (res && res.ok) {
            const lvl = num(res.levelsGained, 0) > 0 ? `  LEVEL ${res.level}!` : '';
            showToast(
              `Sold ${num(res.qty, qty)} ${def.name} for ${sym} ${res.earned}.`
              + (num(res.xp, 0) > 0 ? `  +${res.xp} xp${lvl}` : ''),
              true
            );
            if (res.state) setState(res.state); else render();
          } else {
            showToast((res && res.error) || 'He would not take that.');
            btn.disabled = false;
          }
        } catch (err) { showToast(String((err && err.message) || err)); btn.disabled = false; }
      });
      side.appendChild(btn);
      card.appendChild(side);
      cards.appendChild(card);
    }
    body.appendChild(cards);
  }

  // ---- tab: the Archivist ---------------------------------------------------
  function renderArchivist() {
    const v = VENDORS[1];
    body.appendChild(vendorHeader(v,
      'The shelves are being re-catalogued.'));

    // BLUEPRINTS ARE PARKED, exactly as the crafting bench is. Bruno,
    // 2026-09-02: "disable blueprints for now in the archive like the study hut
    // was temporarily disabled."
    //
    // The reason is the same one: seven recipes went with inkglass, crafting
    // itself is behind a placeholder, and a shop selling the RIGHT to make
    // things nobody can make is worse than a shop that admits it is shut. The
    // listing code below is untouched and comes back with the bench.
    const box = el('div', 'sq-shops-closed');
    box.appendChild(el('div', 'sq-shops-closedglyph', '✦'));
    box.appendChild(el('div', 'sq-shops-closedtitle', 'ROLLING OUT IN FUTURE UPDATES'));
    box.appendChild(el('div', 'sq-shops-closedline',
      'The Archivist is re-cutting every blueprint she has. Blueprints return with the '
      + 'crafting bench, alongside item tiers and refining.'));
    box.appendChild(el('div', 'sq-shops-closedline',
      'Until then the Trading Post sells the tools — a replacement axe, pickaxe or sifter — '
      + 'and the charms.'));
    body.appendChild(box);
  }

  /** The full blueprint listing, kept for when the Archive reopens. */
  function renderArchivistListing() {
    const v = VENDORS[1];
    const allRecipes = Array.isArray(RECIPES) ? RECIPES.filter((r) => r && r.id) : [];
    const owned = ownedBlueprints();
    const knownCount = allRecipes.filter((r) => owned.indexOf(r.id) !== -1).length;
    const total = allRecipes.length;

    body.appendChild(vendorHeader(v,
      'Nothing in the Workshop can be crafted until its blueprint is read.'));

    // Progress: the single number that says how far the game is opened up.
    const prog = el('div', 'sq-shops-progress');
    const top = el('div', 'sq-shops-progresstop');
    top.appendChild(el('span', null, 'BLUEPRINTS READ'));
    top.appendChild(el('span', 'sq-shops-progresscount', `${knownCount} / ${total || '?'}`));
    prog.appendChild(top);
    const pbar = el('div', 'sq-shops-progressbar');
    const pfill = el('div', 'sq-shops-progressfill');
    pfill.style.width = total ? `${Math.round((knownCount / total) * 100)}%` : '0%';
    pbar.appendChild(pfill);
    prog.appendChild(pbar);
    body.appendChild(prog);

    if (!state || !Array.isArray(state.blueprints)) {
      body.appendChild(el('div', 'sq-shops-note',
        'This save predates the Archivist — every recipe is already known to you.'));
    }

    // Offers: prefer the Archivist's own stock, fall back to every un-owned
    // recipe so the tab is never empty just because the route is not up yet.
    let offers = (shopData && Array.isArray(shopData.archivist)) ? shopData.archivist : [];
    let estimated = false;
    if (!offers.length) {
      estimated = true;
      offers = allRecipes
        .filter((r) => owned.indexOf(r.id) === -1)
        .map((r) => ({ offerId: r.id, recipeId: r.id, price: estimateBlueprintPrice(r) }));
    }
    const forSale = offers.filter((o) => !ownsBlueprint(o.recipeId));

    body.appendChild(el('div', 'sq-shops-sub', `SEALED — ${forSale.length} FOR SALE`));
    if (!forSale.length) {
      body.appendChild(el('div', 'sq-shops-empty',
        shopData || estimated
          ? 'Every blueprint is yours. The Archivist has nothing left to teach you.'
          : 'The reading room is dark.'));
    } else {
      const w = wallet();
      const cards = el('div', 'sq-shops-cards');
      for (const o of forSale) {
        const recipe = getRecipe(o.recipeId);
        const un = recipeUnlocks(recipe);
        const card = el('div', 'sq-shops-bp');
        card.appendChild(el('div', 'sq-shops-bplock', '🔒'));

        const info = el('div', 'sq-shops-bpinfo');
        info.appendChild(el('div', 'sq-shops-bpkind', `BLUEPRINT · ${un.kind}`));
        info.appendChild(el('div', 'sq-shops-bpname', un.name));
        info.appendChild(el('div', 'sq-shops-bpunlocks',
          `Unlocks: ${un.desc || `the ${un.name} recipe`}`));
        if (recipe && recipe.materials && Object.keys(recipe.materials).length) {
          const ing = el('div', 'sq-shops-bpingr');
          for (const [mid, need] of Object.entries(recipe.materials)) {
            const d = matDef(mid);
            const have = heldQty(mid);
            ing.appendChild(el('span',
              `sq-shops-chip ${have >= num(need, 0) ? 'sq-shops-can' : ''}`,
              `${d.symbol || ''} ${d.name} ${have}/${num(need, 0)}`));
          }
          info.appendChild(ing);
        }
        card.appendChild(info);

        const side = el('div', 'sq-shops-oside');
        side.appendChild(priceRow(o.price, w, estimated));
        const btn = el('button', 'sq-shops-btn', 'LEARN');
        btn.type = 'button';
        if (!canAffordMap(w, o.price)) {
          btn.disabled = true;
          btn.title = 'Not enough coin. Study, sell, or convert.';
        } else {
          btn.classList.add('sq-shops-go');
        }
        btn.addEventListener('click', () => doBuy('archivist', o.offerId, `the ${un.name} blueprint`, btn));
        side.appendChild(btn);
        card.appendChild(side);
        cards.appendChild(card);
      }
      body.appendChild(cards);
    }

    // Known blueprints — deliberately compact; they are settled business.
    const known = allRecipes.filter((r) => owned.indexOf(r.id) !== -1);
    body.appendChild(el('div', 'sq-shops-sub', `KNOWN — ${known.length}`));
    if (!known.length) {
      body.appendChild(el('div', 'sq-shops-empty', 'You have read nothing yet.'));
    } else {
      const cards = el('div', 'sq-shops-cards');
      for (const r of known) {
        const un = recipeUnlocks(r);
        const card = el('div', 'sq-shops-bp sq-shops-owned');
        card.appendChild(el('div', 'sq-shops-bplock', '✓'));
        const info = el('div', 'sq-shops-bpinfo');
        info.appendChild(el('div', 'sq-shops-bpname', un.name));
        card.appendChild(info);
        card.appendChild(el('span', 'sq-shops-known', 'KNOWN'));
        cards.appendChild(card);
      }
      body.appendChild(cards);
    }
  }

  /** Rough blueprint price from what the recipe itself costs to build. */
  function estimateBlueprintPrice(recipe) {
    const coins = (recipe && recipe.coins && typeof recipe.coins === 'object') ? recipe.coins : {};
    const out = {};
    let any = false;
    for (const id of CURRENCY_IDS) {
      const v = num(coins[id], 0);
      if (v > 0) { out[id] = Math.max(20, Math.round(v * 0.75)); any = true; }
    }
    if (!any) out.focus = 60;
    return out;
  }

  // ---- tab: the Broker ------------------------------------------------------
  function renderBroker() {
    const v = VENDORS[2];
    body.appendChild(vendorHeader(v,
      'His price resets at midnight, and only at midnight.'));

    if (!shopData) { body.appendChild(closedState(shopError)); return; }

    const b = shopData.broker;
    const w = wallet();
    const sold = b.soldToday;

    body.appendChild(el('div', 'sq-shops-sub',
      `DARK BOXES — ${sold} bought today`));

    const card = el('div', 'sq-shops-offer');
    card.appendChild(el('div', 'sq-shops-sym', '⬛'));
    const info = el('div', 'sq-shops-oinfo');
    info.appendChild(el('div', 'sq-shops-oname', 'One Dark Box'));
    info.appendChild(el('div', 'sq-shops-odesc',
      `You hold ${num(state && state.player && state.player.darkBoxes, 0)}. `
      + 'Each purchase raises the next price by 60% until midnight.'));
    card.appendChild(info);

    const side = el('div', 'sq-shops-oside');
    const totalNow = priceTotal(b.price);
    const bigp = el('div', 'sq-shops-bigprice', String(totalNow));
    side.appendChild(bigp);
    side.appendChild(priceRow(b.price, w, !b.quoted));
    const btn = el('button', 'sq-shops-btn', 'BUY A BOX');
    btn.type = 'button';
    if (!canAffordMap(w, b.price)) {
      btn.disabled = true;
      btn.title = 'Not enough coin at today’s price.';
    } else {
      btn.classList.add('sq-shops-go');
    }
    btn.addEventListener('click', () => doBuy('broker', b.offerId, 'a Dark Box', btn));
    side.appendChild(btn);
    const nextBits = CURRENCY_IDS.filter((id) => num(b.nextPrice[id], 0) > 0)
      .map((id) => `${CURRENCIES[id].symbol} ${num(b.nextPrice[id], 0)}`).join('  ');
    side.appendChild(el('div', 'sq-shops-nextprice',
      nextBits ? `next box: ${nextBits}` : ''));
    card.appendChild(side);
    body.appendChild(card);

    // The ladder makes the ceiling visible before you hit it.
    body.appendChild(el('div', 'sq-shops-sub', 'TODAY’S LADDER'));
    const ladder = el('div', 'sq-shops-ladder');
    const baseTotal = totalNow > 0 ? totalNow / Math.pow(BROKER_STEP, 0) : BROKER_BASE;
    for (let i = 0; i < 6; i++) {
      const step = sold + i;
      const price = i === 0
        ? totalNow
        : Math.round(baseTotal * Math.pow(BROKER_STEP, i));
      const rung = el('div', 'sq-shops-rung');
      if (i === 0) rung.classList.add('sq-shops-now');
      if (i === 1) rung.classList.add('sq-shops-next');
      rung.appendChild(el('span', 'sq-shops-runglabel',
        i === 0 ? 'NOW' : `#${step + 1}`));
      rung.appendChild(el('span', null, String(price)));
      ladder.appendChild(rung);
    }
    body.appendChild(ladder);
    body.appendChild(el('div', 'sq-shops-note',
      'The escalation is the whole design: you cannot buy your way past studying, '
      + 'only borrow against tomorrow. Resets at midnight — in ' + untilMidnight() + '.'));
  }

  // ---- tab: the Exchange ----------------------------------------------------
  function renderExchange() {
    const v = VENDORS.find((x) => x.id === 'exchange');
    body.appendChild(vendorHeader(v,
      `${RATE.shards} shards for ${RATE.florins} florin. One direction only.`));

    // The roulette table. Decoration, and labelled as such — a wheel that
    // looks like it decides the rate but does not would be a lie told in
    // pixels. It spins when you trade, and that is all it does.
    const table = el('div', 'sq-shops-roulette');
    const wheel = el('div', 'sq-shops-wheel', '◉');
    table.appendChild(wheel);
    const tableNote = el('div', 'sq-shops-roulettenote',
      'He keeps a roulette table between you and him. The rate is fixed; the wheel is for show.');
    table.appendChild(tableNote);
    body.appendChild(table);

    const w = wallet();
    body.appendChild(el('div', 'sq-shops-sub', 'SHARDS → FLORINS'));

    const box = el('div', 'sq-shops-convert');
    const amtIn = el('input', 'sq-shops-input');
    amtIn.type = 'number';
    amtIn.min = String(RATE.shards);
    amtIn.step = String(RATE.shards);
    amtIn.style.width = '110px';
    amtIn.value = String(Math.max(RATE.shards, Math.round(exForm.amount) || RATE.shards));
    box.appendChild(field('Shards', amtIn));

    const maxBtn = el('button', 'sq-shops-btn sq-shops-tiny', 'MAX');
    maxBtn.type = 'button';
    box.appendChild(field(' ', maxBtn));

    const goBtn = el('button', 'sq-shops-btn sq-shops-go', 'TRADE');
    goBtn.type = 'button';
    box.appendChild(field(' ', goBtn));
    body.appendChild(box);

    const flow = el('div', 'sq-shops-flow');
    const fromBox = el('div', 'sq-shops-flowbox');
    const fromAmt = el('div', 'sq-shops-flowamt', '0');
    const fromCur = el('div', 'sq-shops-flowcur', '');
    fromBox.appendChild(fromAmt);
    fromBox.appendChild(fromCur);
    flow.appendChild(fromBox);
    flow.appendChild(el('div', 'sq-shops-arrow', '⇒'));
    const toBox = el('div', 'sq-shops-flowbox');
    const toAmt = el('div', 'sq-shops-flowamt', '0');
    const toCur = el('div', 'sq-shops-flowcur', '');
    toBox.appendChild(toAmt);
    toBox.appendChild(toCur);
    flow.appendChild(toBox);
    const wrapFlow = el('div');
    wrapFlow.style.marginTop = '12px';
    wrapFlow.appendChild(flow);
    const loss = el('div', 'sq-shops-loss', '');
    wrapFlow.appendChild(loss);
    body.appendChild(wrapFlow);

    const cFrom = CURRENCIES.shard;
    const cTo = CURRENCIES[MAIN];

    function paint() {
      const asked = Math.max(0, Math.round(num(amtIn.value, 0)));
      exForm.amount = asked;
      const held = num(w.shard, 0);
      // Whole florins only, and the leftover shards are NOT taken — the server
      // does the same. Quietly pocketing the remainder of a trade is how a
      // player loses coins they earned and never finds out why.
      const florins = Math.floor(asked / RATE.shards) * RATE.florins;
      const spent = florins > 0 ? (florins / RATE.florins) * RATE.shards : 0;

      fromAmt.textContent = `${cFrom.symbol} ${spent}`;
      fromAmt.style.color = cFrom.color;
      fromBox.style.borderColor = cFrom.color;
      fromCur.textContent = `${cFrom.name} — you hold ${held}`;
      toAmt.textContent = `${cTo.symbol} ${florins}`;
      toAmt.style.color = cTo.color;
      toBox.style.borderColor = cTo.color;
      toCur.textContent = cTo.name;

      if (held <= 0) {
        loss.textContent = 'You have no shards. Submit work — graded work pays Dark Boxes, and boxes pay shards.';
        goBtn.disabled = true;
      } else if (florins < 1) {
        loss.textContent = `${RATE.shards} shards buy ${RATE.florins} florin. That is not enough yet.`;
        goBtn.disabled = true;
      } else if (spent > held) {
        loss.textContent = `You only hold ${held} shards.`;
        goBtn.disabled = true;
      } else {
        loss.textContent = `${spent} shards for ${florins} florin${florins === 1 ? '' : 's'}. `
          + `The ${asked - spent} shards over the line stay with you.`;
        goBtn.disabled = false;
      }
    }

    amtIn.addEventListener('input', paint);
    maxBtn.addEventListener('click', () => {
      amtIn.value = String(Math.max(0, Math.round(num(w.shard, 0))));
      paint();
    });

    goBtn.addEventListener('click', async () => {
      const amount = exForm.amount;
      goBtn.disabled = true;
      wheel.classList.add('sq-shops-wheelspin');
      try {
        const res = await api.exchange('shard', MAIN, amount);
        if (res && res.ok) {
          showToast(`${res.spent} shards → ${res.received} florin${res.received === 1 ? '' : 's'}.`, true);
          if (res.state) setState(res.state);
          else render();
        } else {
          showToast((res && res.error) || 'The Exchange declined.');
          goBtn.disabled = false;
        }
      } catch (err) {
        showToast(String((err && err.message) || err));
        goBtn.disabled = false;
      } finally {
        setTimeout(() => wheel.classList.remove('sq-shops-wheelspin'), 900);
      }
    });

    paint();
    body.appendChild(el('div', 'sq-shops-note',
      'Florins bought here cost far more work than florins earned by studying or '
      + 'selling. That is deliberate: shards are not meant to be a shortcut, and '
      + 'he will not turn florins back into shards at any price.'));
  }

  /**
   * The two outlanders — the Woodsman (timber, south-west woods) and the
   * Stonemason (stone, under the south-east mountain). They BUY and do not
   * sell: between them they are the reason the gather -> sell -> reinvest loop
   * still closes now the Market only sells goods.
   *
   * One renderer for both. Two vendors written out twice is two vendors that
   * quietly drift apart.
   */
  function renderOutlander(vendorId) {
    const v = VENDORS.find((x) => x.id === vendorId);
    body.appendChild(vendorHeader(v,
      vendorId === 'stonemason'
        ? 'Buys stone. Pays well over town rates.'
        : 'Buys timber. Pays well over town rates.'));

    // THE CONVERSATION IS NOT HERE ANY MORE. It is a Nintendo-style box over
    // the world (web/ui/dialogue.js), raised by pressing E at his counter, and
    // this panel only opens AFTER it, and only if he agreed to trade. Speaking
    // to someone is not shopping.
    //
    // WHO DECIDES THE DOOR IS SHUT: the server. `shops.vendors` is its answer,
    // read, never computed here. The panel is still gated because it can be
    // reached without the conversation — a stale panel left open across an
    // unlock, or any future route in — and a shop that lists prices you cannot
    // buy at is worse than one that says it is shut.
    const fromShops = shopData && shopData.vendors && shopData.vendors[vendorId];
    if (!fromShops || !fromShops.unlocked) {
      body.appendChild(el('div', 'sq-shops-empty',
        'He will not trade with you yet. Speak to him — press E at his counter.'));
      return;
    }

    const src = shopData && shopData[vendorId] ? shopData[vendorId] : null;
    const buys = (src && Array.isArray(src.buys)) ? src.buys : [];
    if (!buys.length) {
      body.appendChild(el('div', 'sq-shops-empty', 'He is not buying just now.'));
      return;
    }

    body.appendChild(el('div', 'sq-shops-sub', 'HE BUYS'));
    const rows = el('div', 'sq-shops-rows');
    for (const b of buys) {
      const row = el('div', 'sq-shops-row');
      row.style.borderLeftColor = b.color || PALETTE.textDim;
      const main = el('div', 'sq-shops-rowmain');
      main.appendChild(el('div', 'sq-shops-rowname', b.name || b.materialId));
      // BUNDLES, not a unit price. Florins are rare enough that "N each" cannot
      // express the rate without inventing fractions of a florin.
      const per = Math.max(1, num(b.per, 5));
      const pay = Math.max(1, num(b.pay, 1));
      const tPer = num(b.townPer, 0);
      const tPay = num(b.townPay, 0);
      main.appendChild(el('div', 'sq-shops-rowdesc',
        `${per} for ${pay} florin${pay === 1 ? '' : 's'}`
        + (tPer > 0 ? ` — the Trading Post gives ${tPay} for ${tPer}.` : '.')));
      const have = num(b.have, 0);
      const lots = Math.floor(have / per);
      main.appendChild(el('div', 'sq-shops-rownote',
        `You carry ${have} — ${lots} lot${lots === 1 ? '' : 's'}`
        + (lots > 0 ? `, worth ${lots * pay} florin${lots * pay === 1 ? '' : 's'}.` : '.')));
      row.appendChild(main);

      const side = el('div', 'sq-shops-rowside');
      const qty = el('input', 'sq-shops-input');
      qty.type = 'number';
      qty.min = '1';
      qty.max = String(Math.max(1, num(b.have, 0)));
      // Default to ONE FULL LOT. Defaulting to 1 would make the obvious click a
      // refusal every time, since a single unit never makes a bundle.
      qty.value = String(Math.max(1, Math.min(num(b.have, 0), per)));
      qty.style.width = '64px';
      side.appendChild(qty);
      const sellBtn = el('button', 'sq-shops-btn sq-shops-go', 'SELL');
      sellBtn.type = 'button';
      sellBtn.disabled = have < per;
      sellBtn.addEventListener('click', async () => {
        sellBtn.disabled = true;
        try {
          const n = Math.max(1, Math.round(num(qty.value, 1)));
          const res = await api.sell(b.materialId, n, vendorId);
          if (res && res.ok) {
            const lvl = num(res.levelsGained, 0) > 0 ? `  LEVEL ${res.level}!` : '';
            const took = num(res.qty, n);
            const kept = num(res.kept, 0);
            showToast(
              `Sold ${took} ${b.name} for ${res.earned} florin${res.earned === 1 ? '' : 's'}.`
              + (kept > 0 ? `  ${kept} kept — not a full lot.` : '')
              + (num(res.xp, 0) > 0 ? `  +${res.xp} xp${lvl}` : ''),
              true
            );
            if (res.state) setState(res.state); else render();
          } else {
            showToast((res && res.error) || 'He would not take that.');
            sellBtn.disabled = false;
          }
        } catch (err) { showToast(String((err && err.message) || err)); sellBtn.disabled = false; }
      });
      side.appendChild(sellBtn);
      row.appendChild(side);
      rows.appendChild(row);
    }
    body.appendChild(rows);
    body.appendChild(el('div', 'sq-shops-note',
      'He is a long way from the plaza on purpose. The walk is what you are paid for.'));
  }

  // ---- render ---------------------------------------------------------------
  function paintWallet() {
    walletEl.textContent = '';
    const w = wallet();
    for (const id of CURRENCY_IDS) {
      const c = CURRENCIES[id];
      const chip = el('div', 'sq-shops-wcoin');
      chip.style.color = c.color;
      chip.style.borderColor = c.color;
      chip.title = c.name;
      chip.appendChild(el('span', null, c.symbol));
      chip.appendChild(el('span', null, String(Math.round(num(w[id], 0)))));
      walletEl.appendChild(chip);
    }
  }

  const PLACE_TITLE = Object.freeze({
    trading_post: 'THE TRADING POST',
    archive: 'THE ARCHIVE',
    exchange_post: 'THE EXCHANGE',
    woodsman_camp: "THE WOODSMAN'S CAMP",
    stonemason_camp: "THE STONEMASON'S CAVE",
  });

  function paintTitle() {
    titleEl.textContent = PLACE_TITLE[place] || 'NOWHERE IN PARTICULAR';
  }

  function paintTabs() {
    const here = allowedVendors().map((v) => v.id);
    for (const v of VENDORS) {
      const b = tabBtns[v.id];
      // A tab for a vendor who is not in this building is not disabled, it is
      // not there: the Archive should not even hint that the Market exists.
      b.hidden = here.indexOf(v.id) === -1;
      b.classList.toggle('sq-shops-active', v.id === tab);
      b.style.color = v.id === tab ? v.color : '';
      b.style.boxShadow = v.id === tab ? `inset 0 -3px 0 ${v.color}` : '';
      const dot = tabDots[v.id];
      if (v.id === 'archivist') {
        // The one badge worth carrying: how much of the game is still sealed.
        const all = Array.isArray(RECIPES) ? RECIPES.filter((r) => r && r.id) : [];
        const owned = ownedBlueprints();
        const locked = state && Array.isArray(state.blueprints)
          ? all.filter((r) => owned.indexOf(r.id) === -1).length
          : 0;
        dot.hidden = locked <= 0;
        dot.textContent = String(locked);
        dot.style.color = PALETTE.accent;
      } else {
        dot.hidden = true;
      }
    }
  }

  /** Never rebuild while the player is mid-type in a stepper or amount box. */
  function isTypingInside() {
    const a = document.activeElement;
    if (!a || !scrim.contains(a)) return false;
    return a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA';
  }

  let pendingRender = false;

  function render() {
    try {
      if (isTypingInside()) { pendingRender = true; paintWallet(); return; }
      pendingRender = false;
      paintWallet();
      paintTitle();
      paintTabs();
      body.textContent = '';

      const here = allowedVendors().map((v) => v.id);
      if (!here.length) {
        // Opened from nowhere. Trading is a place you walk to, so say that
        // plainly rather than showing a shop that is not in front of you.
        body.appendChild(el('div', 'sq-shops-empty',
          'There is no one here to trade with. The Market, the Archive and the '
          + 'Exchange are places — walk up to one and press E.'));
        return;
      }
      // Belt and braces: a tab left over from another building must not render
      // that building's stock here.
      if (here.indexOf(tab) === -1) tab = here[0];

      if (tab === 'merchant') renderMerchant();
      else if (tab === 'archivist') renderArchivist();
      else if (tab === 'broker') renderBroker();
      else if (tab === 'woodsman' || tab === 'stonemason') renderOutlander(tab);
      else renderExchange();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-shops] render', err);
      body.textContent = '';
      body.appendChild(el('div', 'sq-shops-empty', 'This vendor could not be drawn.'));
    }
  }

  scrim.addEventListener('focusout', () => {
    setTimeout(() => { if (pendingRender && !isTypingInside()) render(); }, 0);
  });

  // ---- panel plumbing -------------------------------------------------------
  function setState(next) {
    try {
      state = next || null;
      if (open) render();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-shops] setState', err);
    }
  }

  /** Raised by walking into a building. `buildingId` decides everything. */
  function openAt(buildingId) {
    place = typeof buildingId === 'string' ? buildingId : null;
    const here = allowedVendors();
    // Land on the vendor who is actually here rather than whatever tab was
    // last open somewhere else.
    if (here.length) tab = here[0].id;
    doOpen();
  }

  /**
   * Opened WITHOUT a building — the old ⌘3 route, or a caller that forgot.
   * `place` is cleared rather than left at whatever building was last visited,
   * or the shortcut would quietly reopen the last shop from anywhere on the map,
   * which is exactly the bypass being closed.
   */
  function openAnywhere() {
    place = null;
    doOpen();
  }

  function doOpen() {
    open = true;
    scrim.hidden = false;
    body.scrollTop = 0;
    render();
    // RE-READ ON EVERY OPEN.
    //
    // "Once per session" was wrong, and it hid the Silver Key: the key is added
    // to the counter on READ, from live state, so a shelf fetched before the
    // scholar reached level 15 simply never had it — and nothing invalidated
    // the cache, because levelling is not a shop event.
    //
    // The correct rule was never "cache it", it was "do not REROLL it daily".
    // The shelf is a handful of rows from a local server; fetching it each time
    // the counter is opened costs nothing and is always right.
    refresh(true);
  }

  function doClose() {
    open = false;
    scrim.hidden = true;
    toast.hidden = true;
  }

  function toggle() { if (open) doClose(); else doOpen(); }

  xBtn.addEventListener('click', doClose);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) doClose(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) doClose(); });

  return {
    setState,
    toggle,
    openAt,
    /**
     * Throw away the cached vendor data so the next open refetches.
     *
     * Needed because a vendor's DOOR can change while the panel is shut: talk
     * to the Woodsman holding the Blue Key and he unlocks, but `shopData` still
     * carries the lock state from before, and `doOpen` only refetches when the
     * day has rolled over. His counter would open saying he will not trade.
     */
    invalidate: () => { shopData = null; },
    open: openAnywhere,
    close: doClose,
    isOpen: () => open,
    /** Test seam: which building the panel currently believes it is in. */
    getPlace: () => place,
  };
}

export default createShops;
