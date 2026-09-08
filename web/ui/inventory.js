// web/ui/inventory.js  [ENG-UI]
// The bag. One home for everything the player owns: materials and tree drops,
// gadgets (which are USED from here), blocks, gathering tools with durability,
// passive gear with equip state, relics, Dark Boxes and buildings waiting to be
// placed. Nothing in this list lives in the Craft panel any more.
//
// Exactly one <style> tag, every selector namespaced .sq-inv-*.

import { activeQuests } from '../../shared/quests.js';
import {
  PALETTE_V3,
  RARITIES,
  MATERIAL_IDS,
  TREE_DROP_IDS,
  GADGET_IDS,
  BLOCK_IDS,
  GATHER_NODES,
  TOOL_DURABILITY,
  DOLL_SLOTS,
  SEED_ITEM_ID,
  QUEST_ITEMS,
  QUEST_ITEM_IDS,
  REACHES_GEAR,
  CHARMS,
  CHARM_SLOT_COUNT,
} from '../../shared/constants.js';
import * as RECIPE_MOD from '../../shared/recipes.js';
// The doll shows the REAL player sprite, not a drawing of one — the figure
// you dress here is the figure you walk around as.
import { SPRITES, drawSprite } from '../world/sprites.js';
import { injectTheme, el, num, elementColor, countTo, pulse } from './theme.js';

const STYLE_ID = 'sq-inv-style';

const MATERIALS = RECIPE_MOD.MATERIALS || {};
const TOOLS = RECIPE_MOD.TOOLS || {};

// Gadget and block definitions are ENG-SYSTEMS' to own; until shared/recipes.js
// exports them, these descriptions keep the screen honest and readable. Anything
// the shared module does export always wins.
const GADGET_FALLBACK = {
  lantern: { name: 'Prospector\'s Lantern', desc: 'Reveals every resource node on screen for a while.', cooldownMinutes: 20 },
  compass: { name: 'Forester\'s Compass', desc: 'Marks the nearest tree still standing.', cooldownMinutes: 10 },
  watering_can: { name: 'Watering Can', desc: 'Advances one sapling a full growth stage.', cooldownMinutes: 30 },
  portable_bench: { name: 'Portable Bench', desc: 'One craft away from a house. Once a day.', cooldownMinutes: 1440 },
  focus_bell: { name: 'Focus Bell', desc: 'Boosts the payout of your next study session.', cooldownMinutes: 240 },
  surveyors_glass: { name: 'Surveyor\'s Glass', desc: 'Previews what a locked gate is waiting for.', cooldownMinutes: 15 },
};

const BLOCK_FALLBACK = {
  path_stone: { name: 'Path Stone', desc: 'A tile of laid path.' },
  fence_wood: { name: 'Wooden Fence', desc: 'One length of fence.' },
  wall_stone: { name: 'Stone Wall', desc: 'A solid block of wall.' },
  lamp_post: { name: 'Lamp Post', desc: 'Lights the ground around it.' },
  planter: { name: 'Planter', desc: 'A raised bed. Decorative.' },
  signpost: { name: 'Signpost', desc: 'Points somewhere. Says nothing.' },
};

// Four tabs, not eight. Bruno: "merge in the inventory all items into one
// category + the relics and dark boxes ones with a search box."
// ITEMS is everything you carry and spend; RELICS and DARK BOXES stay apart
// because neither is a thing you carry — one is a permanent bonus, the other is
// unopened. GEAR is the paper-doll, which is a different shape of screen.
// The search box spans whichever tab is open, which is what makes one long
// ITEMS list workable.
const TABS = [
  { id: 'quests', label: 'QUESTS', key: 'quests' },
  { id: 'items', label: 'ITEMS', key: 'materials' },
  { id: 'gear', label: 'GEAR', key: 'gear' },
  { id: 'relics', label: 'RELICS', key: 'relics' },
  { id: 'boxes', label: 'DARK BOXES', key: 'boxes' },
];

function rarityColor(rarity) {
  const r = RARITIES[rarity];
  return (r && r.color) || '#c9a86a';
}

function gadgetDef(id) {
  const shared = (RECIPE_MOD.GADGETS && RECIPE_MOD.GADGETS[id]) || null;
  const fb = GADGET_FALLBACK[id] || {};
  return {
    id,
    name: (shared && shared.name) || fb.name || id.replace(/_/g, ' '),
    desc: (shared && (shared.desc || shared.effect)) || fb.desc || '',
    cooldownMinutes: num(shared && (shared.cooldownMinutes || shared.cooldown), fb.cooldownMinutes || 0),
  };
}

function blockDef(id) {
  const shared = (RECIPE_MOD.BLOCKS && RECIPE_MOD.BLOCKS[id]) || null;
  const fb = BLOCK_FALLBACK[id] || {};
  return {
    id,
    name: (shared && shared.name) || fb.name || id.replace(/_/g, ' '),
    desc: (shared && shared.desc) || fb.desc || '',
  };
}

function bonusText(bonus) {
  if (!bonus || typeof bonus !== 'object') return 'no bonus';
  const parts = [];
  if (bonus.coinMult && typeof bonus.coinMult === 'object') {
    for (const [k, v] of Object.entries(bonus.coinMult)) if (num(v, 1) !== 1) parts.push(`${k} ×${v}`);
  }
  if (num(bonus.xpMult, 1) !== 1) parts.push(`xp ×${bonus.xpMult}`);
  if (num(bonus.boxChanceBonus, 0) !== 0) parts.push(`box +${(num(bonus.boxChanceBonus, 0) * 100).toFixed(1)}%`);
  return parts.length ? parts.join('  ') : 'no bonus';
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-inv-scrim { z-index: 62; }
.sq-inv-panel {
  width: min(1080px, 96vw); max-height: min(84vh, 780px);
  display: flex; flex-direction: column;
}
.sq-inv-body { flex: 1 1 auto; min-height: 240px; }
.sq-inv-count {
  font-size: 9px; letter-spacing: .16em; color: var(--sq-parchment-dim);
  border: 2px solid var(--sq-shade); padding: 4px 9px;
}
.sq-inv-search {
  font: inherit; font-size: 10px; width: 168px; padding: 6px 9px;
  color: var(--sq-parchment); background: var(--sq-ink);
  border: 2px solid var(--sq-shade); outline: none;
}
.sq-inv-search:focus { border-color: var(--sq-gold); }

/* --- material grid ---------------------------------------------------- */
.sq-inv-grid {
  display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(146px, 1fr));
}
.sq-inv-cell {
  position: relative; display: flex; gap: 10px; align-items: center;
  padding: 10px 11px; border-left-width: 6px;
}
.sq-inv-cell.sq-inv-zero { opacity: .42; }
.sq-inv-sym {
  width: 30px; height: 30px; display: grid; place-items: center;
  font-size: 16px; background: rgba(26,20,38,.10); border: 2px solid currentColor;
}
.sq-inv-cinfo { min-width: 0; flex: 1 1 auto; }
.sq-inv-cname {
  font-size: 10px; letter-spacing: .06em; color: #3a2c1e;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sq-inv-cqty { font-size: 15px; font-weight: 700; color: #2c2113; margin-top: 2px; }
.sq-inv-crar { font-size: 8px; letter-spacing: .16em; margin-top: 3px; }

/* --- rows (gadgets, blocks, tools, gear) ------------------------------ */
/* ---- the quest tab: an errand, and the one line that matters --------- */
.sq-inv-quest { padding: 14px 16px; }
.sq-inv-quest-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.sq-inv-quest-name { font-size: 13px; font-weight: 700; letter-spacing: .05em; color: var(--sq-gold); }
.sq-inv-quest-tag, .sq-inv-quest-tag-done {
  font-size: 10px; letter-spacing: .12em; white-space: nowrap;
}
.sq-inv-quest-tag { color: var(--sq-text-dim); }
.sq-inv-quest-tag-done { color: var(--sq-good); }
.sq-inv-quest-giver {
  font-size: 10px; letter-spacing: .11em; text-transform: uppercase;
  color: var(--sq-text-dim); margin-top: 3px;
}
.sq-inv-quest-blurb { font-size: 11.5px; line-height: 1.55; color: var(--sq-text-dim); margin: 8px 0 10px; }
.sq-inv-quest-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.sq-inv-quest-step {
  display: grid; grid-template-columns: 16px 1fr; gap: 7px;
  font-size: 11.5px; line-height: 1.5; color: var(--sq-text-dim);
}
.sq-inv-quest-mark { text-align: center; }
/* DONE steps are the trail behind you: struck through and quiet. */
.sq-inv-quest-step.is-done { opacity: .5; text-decoration: line-through; }
/* ...and the current one is the whole point of opening the tab. */
.sq-inv-quest-step.is-now { color: var(--sq-text); font-weight: 600; text-decoration: none; opacity: 1; }
.sq-inv-quest-step.is-now .sq-inv-quest-mark { color: var(--sq-gold); }
.sq-inv-quest-done .sq-inv-quest-name { color: var(--sq-good); }
.sq-inv-rows { display: grid; gap: 10px; }
.sq-inv-row {
  display: flex; gap: 14px; align-items: center; padding: 12px 14px;
  border-left-width: 6px;
}
.sq-inv-icon {
  width: 40px; height: 40px; flex: 0 0 auto; display: grid; place-items: center;
  font-size: 19px; border: 2px solid currentColor; background: rgba(26,20,38,.08);
}
.sq-inv-main { flex: 1 1 auto; min-width: 0; }
.sq-inv-name { font-size: 12px; letter-spacing: .08em; color: #2c2113; }
.sq-inv-desc { margin-top: 4px; font-size: 10px; line-height: 1.7; color: #6b5433; }
.sq-inv-note { margin-top: 5px; font-size: 9px; letter-spacing: .08em; color: #8a6a3c; }
.sq-inv-side { flex: 0 0 auto; display: flex; flex-direction: column; gap: 7px; align-items: flex-end; }
.sq-inv-stack {
  font-size: 14px; font-weight: 700; color: #2c2113; letter-spacing: .04em;
}
.sq-inv-tag {
  font-size: 8px; letter-spacing: .16em; padding: 3px 7px; color: var(--sq-ink);
  background: var(--sq-gold);
}
.sq-inv-tag.sq-inv-equipped { background: var(--sq-good); }

/* --- the paper-doll. Two columns of slots flanking the figure, Minecraft's
   layout: what you wear on the left, what you hold and carry on the right. --- */
.sq-inv-slotbtns { display: flex; gap: 4px; }
.sq-inv-slotbtn { min-width: 26px; padding: 4px 0; text-align: center; }
.sq-inv-slotbtn-on {
  background: var(--sq-gold); border-color: var(--sq-gold); color: #241a08;
}
.sq-inv-doll {
  display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px;
  align-items: center; justify-items: stretch;
  padding: 16px 14px; margin-bottom: 14px;
  background: rgba(26,20,38,.42); border: 2px solid var(--sq-shade);
}
.sq-inv-dollcol { display: flex; flex-direction: column; gap: 8px; }
.sq-inv-dollfig {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 18px; background: rgba(12,10,20,.55);
  border: 2px solid rgba(201,146,47,.30);
}
.sq-inv-dollfig canvas { image-rendering: pixelated; display: block; }
.sq-inv-dollname { font-size: 8px; letter-spacing: .14em; color: var(--sq-text-dim); }
.sq-inv-dollslot {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px;
  background: rgba(12,10,20,.45); border: 2px solid var(--sq-shade);
  text-align: left; font: inherit; color: inherit; width: 100%;
}
.sq-inv-dollslot.sq-inv-dollopen { cursor: pointer; }
.sq-inv-dollslot.sq-inv-dollopen:hover { border-color: rgba(201,146,47,.55); }
.sq-inv-dolllocked { opacity: .42; cursor: not-allowed; }
.sq-inv-dollactive { border-color: var(--sq-gold); background: rgba(201,146,47,.15); }
.sq-inv-dollglyph { font-size: 15px; color: var(--sq-parchment-dim); width: 18px; text-align: center; }
.sq-inv-dolltext { min-width: 0; }
.sq-inv-dolllabel { font-size: 8px; letter-spacing: .14em; color: var(--sq-text-dim); }
.sq-inv-dollfill {
  font-size: 10px; letter-spacing: .04em; color: var(--sq-parchment-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sq-inv-dollempty .sq-inv-dollfill { color: rgba(164,148,196,.45); }
@media (max-width: 620px) {
  .sq-inv-doll { grid-template-columns: 1fr; }
}
.sq-inv-tag.sq-inv-worn { background: var(--sq-bad); color: #fff; }

/* durability pips */
.sq-inv-pips { display: flex; gap: 2px; margin-top: 8px; }
.sq-inv-pip { width: 8px; height: 8px; background: var(--sq-good); }
.sq-inv-pip.sq-inv-pipoff { background: rgba(58,44,30,.22); }
.sq-inv-worncol .sq-inv-pip { background: var(--sq-bad); }
.sq-inv-dur { margin-top: 5px; font-size: 9px; color: #6b5433; }

/* gadget cooldown */
.sq-inv-cd {
  position: relative; width: 108px; height: 8px; margin-top: 2px;
  background: rgba(58,44,30,.20); border: 2px solid #c9a86a; overflow: hidden;
}
.sq-inv-cdfill {
  position: absolute; inset: 0 auto 0 0;
  background: linear-gradient(180deg, var(--sq-electro), #7d5aa8);
}
.sq-inv-cdtext { font-size: 9px; color: #6b5433; letter-spacing: .06em; }

/* dark boxes */
.sq-inv-boxwrap {
  display: flex; gap: 18px; align-items: center; padding: 20px;
  border-left-width: 6px;
}
.sq-inv-boxglyph {
  width: 78px; height: 78px; display: grid; place-items: center; font-size: 40px;
  color: var(--sq-electro); border: 3px solid var(--sq-electro);
  background: rgba(26,20,38,.10);
  animation: sq-inv-hover 3.4s ease-in-out infinite;
}
.sq-inv-boxcount { font-size: 30px; font-weight: 700; color: #2c2113; }
.sq-inv-boxacts { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }

.sq-inv-hint {
  margin: 0 0 14px; padding: 10px 13px; font-size: 10px; line-height: 1.8;
  color: #6b5433; background: rgba(255,255,255,.42); border-left: 4px solid var(--sq-gold-deep);
}
@keyframes sq-inv-hover {
  0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); }
}
@media (prefers-reduced-motion: reduce) { .sq-inv-boxglyph { animation: none; } }
`;
  document.head.appendChild(s);
}

export function createInventory(root, api) {
  injectTheme();
  injectStyle();

  const host = root || document.body;
  let state = null;
  let open = false;
  let tab = 'items';
  let filter = '';
  let cdTimer = 0;

  const scrim = el('div', 'sq-theme-scrim sq-inv-scrim');
  scrim.hidden = true;
  const panel = el('div', 'sq-theme-frame sq-theme-rise sq-inv-panel');
  scrim.appendChild(panel);

  const head = el('div', 'sq-theme-head');
  head.appendChild(el('div', 'sq-theme-title', 'BAG'));
  const countEl = el('div', 'sq-inv-count', '0 kinds');
  head.appendChild(countEl);
  head.appendChild(el('div', 'sq-theme-spacer'));
  const search = el('input', 'sq-inv-search');
  search.type = 'text';
  search.placeholder = 'filter…';
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); render(); });
  search.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { search.value = ''; filter = ''; search.blur(); render(); }
  });
  head.appendChild(search);
  const xBtn = el('button', 'sq-theme-x', '✕');
  xBtn.type = 'button';
  head.appendChild(xBtn);
  panel.appendChild(head);

  const tabsBar = el('div', 'sq-theme-tabs');
  const tabBtns = {};
  for (const t of TABS) {
    const b = el('button', 'sq-theme-tab', t.label);
    b.type = 'button';
    b.addEventListener('click', () => { tab = t.id; body.scrollTop = 0; render(); });
    tabsBar.appendChild(b);
    tabBtns[t.id] = b;
  }
  panel.appendChild(tabsBar);

  const body = el('div', 'sq-theme-body sq-inv-body');
  panel.appendChild(body);

  const toast = el('div', 'sq-theme-toast');
  toast.hidden = true;
  panel.appendChild(toast);
  let toastTimer = 0;
  function showToast(msg, ok) {
    toast.textContent = String(msg || '');
    toast.classList.toggle('sq-theme-ok', !!ok);
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  host.appendChild(scrim);

  // ---- readers ------------------------------------------------------------
  function matches(text) {
    if (!filter) return true;
    return String(text || '').toLowerCase().indexOf(filter) !== -1;
  }

  function materialsHeld() {
    return (state && state.materials && typeof state.materials === 'object') ? state.materials : {};
  }

  function materialIds() {
    const held = materialsHeld();
    const ids = [];
    const seen = Object.create(null);
    const push = (id) => { if (id && !seen[id]) { seen[id] = true; ids.push(id); } };
    for (const id of MATERIAL_IDS) push(id);
    for (const id of TREE_DROP_IDS) push(id);          // v3 tree drops
    for (const id of Object.keys(held)) push(id);      // anything the server invented
    return ids;
  }

  function matDef(id) {
    return MATERIALS[id] || {
      id, name: String(id).replace(/_/g, ' '), rarity: 'common', color: '#8a6a3c', symbol: '◆',
    };
  }

  /** Gadgets arrive as a map, an array, or not at all. Normalise all three. */
  function gadgetList() {
    const raw = (state && (state.gadgets || (state.player && state.player.gadgets))) || null;
    const cdMap = (state && (state.gadgetCooldowns || (state.player && state.player.gadgetCooldowns))) || {};
    const out = [];
    const push = (id, qty, readyAt) => {
      if (!id) return;
      out.push({
        id, qty: Math.max(0, Math.round(num(qty, 0))),
        readyAt: readyAt ? (typeof readyAt === 'string' ? Date.parse(readyAt) : num(readyAt, 0)) : 0,
        def: gadgetDef(id),
      });
    };
    if (Array.isArray(raw)) {
      for (const g of raw) {
        if (!g) continue;
        if (typeof g === 'string') push(g, 1, cdMap[g]);
        else push(g.id || g.gadgetId, g.qty === undefined ? 1 : g.qty, g.readyAt || g.cooldownUntil || cdMap[g.id]);
      }
    } else if (raw && typeof raw === 'object') {
      for (const [id, v] of Object.entries(raw)) {
        if (v && typeof v === 'object') push(id, v.qty === undefined ? 1 : v.qty, v.readyAt || v.cooldownUntil || cdMap[id]);
        else push(id, v, cdMap[id]);
      }
    }
    const seen = Object.create(null);
    for (const g of out) seen[g.id] = true;
    for (const id of GADGET_IDS) if (!seen[id]) push(id, 0, cdMap[id]);
    return out;
  }

  function blockList() {
    const raw = (state && (state.blocks || (state.player && state.player.blocks))) || null;
    const out = [];
    const push = (id, qty) => {
      if (!id) return;
      out.push({ id, qty: Math.max(0, Math.round(num(qty, 0))), def: blockDef(id) });
    };
    if (Array.isArray(raw)) {
      const tally = Object.create(null);
      for (const b of raw) {
        if (!b) continue;
        const id = typeof b === 'string' ? b : (b.id || b.blockId);
        if (!id) continue;
        tally[id] = (tally[id] || 0) + (typeof b === 'object' ? num(b.qty, 1) : 1);
      }
      for (const [id, q] of Object.entries(tally)) push(id, q);
    } else if (raw && typeof raw === 'object') {
      for (const [id, v] of Object.entries(raw)) push(id, (v && typeof v === 'object') ? v.qty : v);
    }
    const seen = Object.create(null);
    for (const b of out) seen[b.id] = true;
    for (const id of BLOCK_IDS) if (!seen[id]) push(id, 0);
    return out;
  }

  function isGatherId(itemId) {
    const def = TOOLS[itemId] || null;
    return !!(def && def.gather === true);
  }

  function gatherToolList() {
    const p = (state && state.player) || {};
    const out = [];
    const seen = Object.create(null);
    const push = (uid, toolId, dur, maxDur, equipped) => {
      if (!toolId || !isGatherId(toolId)) return;
      const key = String(uid);
      if (seen[key]) return;
      seen[key] = true;
      const max = Math.max(1, num(maxDur, num(TOOL_DURABILITY[toolId], 1)));
      out.push({
        uid, toolId,
        durability: Math.max(0, Math.min(max, num(dur, max))),
        maxDurability: max,
        equipped: !!equipped,
      });
    };
    const equippedUid = p.equippedGather || p.equippedGatherUid || p.gatherToolUid || null;
    if (Array.isArray(p.gatherTools)) {
      for (const t of p.gatherTools) {
        if (!t) continue;
        push(t.uid, t.toolId || t.itemId, t.durability, t.maxDurability,
          t.equipped || (equippedUid && t.uid === equippedUid));
      }
    }
    const legacy = (state && Array.isArray(state.tools)) ? state.tools : [];
    for (const t of legacy) {
      if (!t || !isGatherId(t.itemId)) continue;
      push(t.uid, t.itemId, t.durability, t.maxDurability,
        t.equipped || (equippedUid && t.uid === equippedUid));
    }
    return out;
  }

  function gearList() {
    const all = (state && Array.isArray(state.tools)) ? state.tools : [];
    return all.filter((t) => t && !isGatherId(t.itemId));
  }

  function relicList() {
    const r = (state && Array.isArray(state.relics)) ? state.relics : [];
    return r.filter(Boolean);
  }

  // ---- equipment ----------------------------------------------------------
  // Two slots. Every equippable row carries the same pair of buttons, so
  // "put this in hand" looks and works identically for an axe, a sapling and a
  // gadget. The server refuses anything a slot may not hold, so these buttons
  // never have to know the rules — only how to report a refusal.

  function equippedRefs() {
    const p = (state && state.player) || {};
    const raw = Array.isArray(p.equipped) ? p.equipped : [];
    return [raw[0] || null, raw[1] || null];
  }

  function activeSlotIndex() {
    const p = (state && state.player) || {};
    return Number(p.activeSlot) === 1 ? 1 : 0;
  }

  function sameRef(a, b) {
    if (!a || !b) return false;
    return a.kind === b.kind && a.itemId === b.itemId && (a.uid || null) === (b.uid || null);
  }

  /** Which slot (1 or 2) holds `ref`, or 0. */
  function slotHolding(ref) {
    const eq = equippedRefs();
    if (sameRef(eq[0], ref)) return 1;
    if (sameRef(eq[1], ref)) return 2;
    return 0;
  }

  /**
   * The 1 / 2 buttons for one equippable row.
   * `ref` is { kind, itemId, uid? }. Pressing the button of the slot that
   * already holds it takes it back OUT — the same key both puts down and picks
   * up, so there is no separate unequip control to hunt for.
   */
  function slotButtons(ref, label, opts) {
    const o = opts || {};
    const wrap = el('div', 'sq-inv-slotbtns');
    const held = slotHolding(ref);
    for (const slot of [1, 2]) {
      const mine = held === slot;
      const btn = el('button', `sq-theme-btn sq-inv-slotbtn${mine ? ' sq-inv-slotbtn-on' : ''}`, String(slot));
      btn.type = 'button';
      btn.title = o.disabled
        ? (o.disabledReason || 'Cannot be equipped.')
        : mine ? `In slot ${slot} — press to put ${label} away.`
          : `Put ${label} in slot ${slot} (key ${slot} in the world).`;
      btn.disabled = !!o.disabled;
      btn.addEventListener('click', async () => {
        wrap.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
          const res = mine
            ? (typeof api.clearSlot === 'function' ? await api.clearSlot(slot)
              : { ok: false, error: 'equip is not wired up' })
            : (typeof api.equipSlot === 'function' ? await api.equipSlot(slot, ref)
              : { ok: false, error: 'equip is not wired up' });
          if (res && res.ok) {
            showToast(mine ? `${label} put away.` : `${label} in slot ${slot}.`, true);
            if (res.state) setState(res.state); else render();
          } else {
            showToast((res && res.error) || 'Could not equip that.');
            render();
          }
        } catch (err) { showToast(String((err && err.message) || err)); render(); }
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function seedsHeld() {
    const p = (state && state.player) || {};
    return Math.max(0, num(p.saplings, 0)) + Math.max(0, num(materialsHeld().seedpod, 0));
  }

  // ---- sections -----------------------------------------------------------
  function rule(text, colorKey) {
    const r = el('div', 'sq-theme-rule', text);
    if (colorKey) r.style.color = elementColor(colorKey);
    return r;
  }

  function renderMaterials() {
    const held = materialsHeld();
    const ids = materialIds().filter((id) => matches(matDef(id).name) || matches(id));
    const owned = ids.filter((id) => num(held[id], 0) > 0);
    const rest = ids.filter((id) => num(held[id], 0) <= 0);
    body.appendChild(rule(`MATERIALS — ${owned.length} kinds held`, 'materials'));
    if (!ids.length) {
      body.appendChild(el('div', 'sq-theme-empty', 'Nothing matches that filter.'));
      return;
    }
    const grid = el('div', 'sq-inv-grid');
    for (const id of owned.concat(rest)) {
      const def = matDef(id);
      const qty = num(held[id], 0);
      const cell = el('div', `sq-theme-card sq-inv-cell${qty <= 0 ? ' sq-inv-zero' : ''}`);
      cell.style.borderLeftColor = rarityColor(def.rarity);
      const sym = el('div', 'sq-inv-sym', def.symbol || '◆');
      sym.style.color = def.color || rarityColor(def.rarity);
      cell.appendChild(sym);
      const info = el('div', 'sq-inv-cinfo');
      info.appendChild(el('div', 'sq-inv-cname', def.name || id));
      info.appendChild(el('div', 'sq-inv-cqty', `×${qty}`));
      const rar = el('div', 'sq-inv-crar', String(def.rarity || 'common').toUpperCase());
      rar.style.color = rarityColor(def.rarity);
      info.appendChild(rar);
      cell.appendChild(info);
      cell.title = `${def.name || id} — ${String(def.rarity || 'common')}. Sell surplus at the Trading Post.`;
      grid.appendChild(cell);
    }
    body.appendChild(grid);
  }

  const cdNodes = [];

  function renderGadgets() {
    const list = gadgetList().filter((g) => matches(g.def.name) || matches(g.id));
    body.appendChild(rule('GADGETS — used from here', 'gadgets'));
    body.appendChild(el('div', 'sq-inv-hint',
      'Gadgets are one-shot tools with a cooldown. Craft them at a house; use them here.'));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty', 'No gadgets match that filter.'));
      return;
    }
    const rows = el('div', 'sq-inv-rows');
    const now = Date.now();
    for (const g of list) {
      const row = el('div', 'sq-theme-card sq-inv-row');
      row.style.borderLeftColor = elementColor('gadgets');
      if (g.qty <= 0) row.style.opacity = '.5';
      const icon = el('div', 'sq-inv-icon', '✧');
      icon.style.color = elementColor('gadgets');
      row.appendChild(icon);
      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', g.def.name));
      if (g.def.desc) main.appendChild(el('div', 'sq-inv-desc', g.def.desc));
      if (g.def.cooldownMinutes) {
        main.appendChild(el('div', 'sq-inv-note', `Cooldown ${g.def.cooldownMinutes} min`));
      }
      row.appendChild(main);

      const side = el('div', 'sq-inv-side');
      side.appendChild(el('div', 'sq-inv-stack', `×${g.qty}`));
      // Gadgets can be used from here OR carried in a slot and fired with its
      // number key in the world — the same gadget, two routes, one cooldown.
      if (g.qty > 0) {
        side.appendChild(slotButtons({ kind: 'gadget', itemId: g.id }, g.def.name, {}));
      }
      const cooling = g.readyAt > now;
      const btn = el('button', `sq-theme-btn${!cooling && g.qty > 0 ? ' sq-theme-go' : ''}`, 'USE');
      btn.type = 'button';
      btn.disabled = g.qty <= 0 || cooling;
      if (g.qty <= 0) btn.title = 'You have none of these. Craft one at a house.';
      side.appendChild(btn);

      const cdText = el('div', 'sq-inv-cdtext', '');
      const cdBar = el('div', 'sq-inv-cd');
      const cdFill = el('div', 'sq-inv-cdfill');
      cdBar.appendChild(cdFill);
      if (cooling) { side.appendChild(cdBar); side.appendChild(cdText); }
      cdNodes.push({ gadget: g, bar: cdBar, fill: cdFill, text: cdText, btn });

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          let res;
          if (typeof api.useGadget === 'function') res = await api.useGadget(g.id);
          else {
            res = await fetch('/api/gadget/use', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gadgetId: g.id }),
            }).then((r) => r.json());
          }
          if (res && res.ok) {
            showToast(`${g.def.name} used.`, true);
            pulse(icon);
            if (res.state) setState(res.state);
            else render();
          } else {
            showToast((res && res.error) || 'That gadget did nothing.');
            btn.disabled = false;
          }
        } catch (err) {
          showToast(String((err && err.message) || err));
          btn.disabled = false;
        }
      });

      row.appendChild(side);
      rows.appendChild(row);
    }
    body.appendChild(rows);
    paintCooldowns();
  }

  function paintCooldowns() {
    const now = Date.now();
    for (const n of cdNodes) {
      if (!n.bar.isConnected) continue;
      const left = n.gadget.readyAt - now;
      if (left <= 0) {
        n.bar.hidden = true; n.text.hidden = true;
        if (n.gadget.qty > 0) { n.btn.disabled = false; n.btn.classList.add('sq-theme-go'); }
        continue;
      }
      const total = Math.max(1, num(n.gadget.def.cooldownMinutes, 1) * 60000);
      const pct = Math.max(0, Math.min(100, (left / total) * 100));
      n.fill.style.width = `${pct.toFixed(1)}%`;
      const mins = Math.floor(left / 60000);
      const secs = Math.floor((left % 60000) / 1000);
      n.text.textContent = mins > 0 ? `ready in ${mins}m ${secs}s` : `ready in ${secs}s`;
    }
  }

  function requestPlacement(id, label) {
    // Blocks reuse the world's build ghost. Prefer a dedicated block hook if
    // main.js exposes one; fall back to the building hook so the button is
    // never dead while ENG-WORLD lands the block mode.
    const fn = (typeof api.requestBlockMode === 'function' && api.requestBlockMode)
      || (typeof api.placeBlock === 'function' && api.placeBlock)
      || (typeof api.requestBuildMode === 'function' && api.requestBuildMode)
      || null;
    if (!fn) { showToast('Placement is not wired up yet.'); return false; }
    try { fn(id); } catch (err) { showToast(String((err && err.message) || err)); return false; }
    showToast(`Placing ${label} — click the world to confirm.`, true);
    doClose();
    return true;
  }

  function renderBlocks() {
    const list = blockList().filter((b) => matches(b.def.name) || matches(b.id));
    body.appendChild(rule('BLOCKS — placeable', 'blocks'));
    body.appendChild(el('div', 'sq-inv-hint',
      `Blocks are decoration, not bonuses. Place them anywhere on the Home Block; removing one refunds half.`));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty', 'No blocks match that filter.'));
      return;
    }
    const rows = el('div', 'sq-inv-rows');
    for (const b of list) {
      const row = el('div', 'sq-theme-card sq-inv-row');
      row.style.borderLeftColor = elementColor('blocks');
      if (b.qty <= 0) row.style.opacity = '.5';
      const icon = el('div', 'sq-inv-icon', '▤');
      icon.style.color = elementColor('blocks');
      row.appendChild(icon);
      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', b.def.name));
      if (b.def.desc) main.appendChild(el('div', 'sq-inv-desc', b.def.desc));
      row.appendChild(main);
      const side = el('div', 'sq-inv-side');
      side.appendChild(el('div', 'sq-inv-stack', `×${b.qty}`));
      const btn = el('button', `sq-theme-btn${b.qty > 0 ? ' sq-theme-go' : ''}`, 'PLACE');
      btn.type = 'button';
      btn.disabled = b.qty <= 0;
      if (b.qty <= 0) btn.title = 'None in the bag. Craft blocks at a Workshop.';
      btn.addEventListener('click', () => requestPlacement(b.id, b.def.name));
      side.appendChild(btn);
      row.appendChild(side);
      rows.appendChild(row);
    }
    body.appendChild(rows);
  }

  /**
   * Saplings and seedpods, which used to appear nowhere at all — they were
   * bought at the Trading Post and then invisible, and planting keyed off
   * merely owning them. Both are spent by planting (saplings first), so they
   * share one equippable entry rather than pretending to be two.
   */
  /**
   * QUEST ITEMS. Kept above the ordinary goods because they are the only things
   * in the Bag that cannot be sold, crafted with, or replaced — losing track of
   * the Blue Key means walking to the north-west for a bloom that is not there
   * any more.
   */
  /**
   * REACHES GEAR. Passive, permanent, and not held in either hand — so it is
   * listed rather than equipped. Without this the mountain hands you three
   * things and gives you nowhere to see that you have them.
   */
  function renderReachesGear() {
    const held = (state && state.reaches && Array.isArray(state.reaches.gear))
      ? state.reaches.gear : [];
    const rowsData = held
      .map((id) => ({ id, def: REACHES_GEAR[id] }))
      .filter((r) => r.def && (matches(r.def.name) || matches(r.id)));
    if (!rowsData.length) return;

    body.appendChild(rule('REACHES GEAR', 'relics'));
    const rows = el('div', 'sq-inv-rows');
    for (const r of rowsData) {
      const row = el('div', 'sq-theme-card sq-inv-row');
      row.style.borderLeftColor = '#66c8d4';
      const icon = el('div', 'sq-inv-icon', '⛏');
      icon.style.color = '#66c8d4';
      row.appendChild(icon);
      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', r.def.name));
      main.appendChild(el('div', 'sq-inv-desc', r.def.blurb));
      main.appendChild(el('div', 'sq-inv-note', 'Worn. It works wherever it applies — there is nothing to equip.'));
      row.appendChild(main);
      rows.appendChild(row);
    }
    body.appendChild(rows);
  }

  function renderQuestItems() {
    const held = (state && state.questItems && typeof state.questItems === 'object')
      ? state.questItems : {};
    const rowsData = QUEST_ITEM_IDS
      .map((id) => ({ id, def: QUEST_ITEMS[id], qty: Math.max(0, num(held[id], 0)) }))
      .filter((r) => r.def && r.qty > 0 && (matches(r.def.name) || matches(r.id)));
    if (!rowsData.length) return;

    body.appendChild(rule('QUEST ITEMS', 'relics'));
    const rows = el('div', 'sq-inv-rows');
    for (const r of rowsData) {
      const row = el('div', 'sq-theme-card sq-inv-row');
      row.style.borderLeftColor = r.def.color;
      const icon = el('div', 'sq-inv-icon', r.def.symbol || '✦');
      icon.style.color = r.def.color;
      row.appendChild(icon);
      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', r.def.name));
      if (r.def.desc) main.appendChild(el('div', 'sq-inv-desc', r.def.desc));
      // No slot buttons: a key is not held in your hands, and offering to equip
      // it would suggest there is something to do with it out in the world.
      main.appendChild(el('div', 'sq-inv-note', 'Carried. Hand it over by speaking to the one who wants it.'));
      row.appendChild(main);
      const side = el('div', 'sq-inv-side');
      side.appendChild(el('div', 'sq-inv-stack', `x${r.qty}`));
      row.appendChild(side);
      rows.appendChild(row);
    }
    body.appendChild(rows);
  }

  /**
   * CHARMS — worn, not held.
   *
   * They get their own section rather than slot buttons on an ITEMS row,
   * because a charm never goes in a hand: the two hand slots are for the thing
   * you are about to swing, and a lantern is not that. Two charm slots, and a
   * row per charm you own.
   */
  function renderCharms() {
    const p = (state && state.player) || {};
    const owned = Array.isArray(p.ownedCharms) ? p.ownedCharms : [];
    const worn = Array.isArray(p.charms) ? p.charms : [];
    const rows = owned
      .map((id) => ({ id, def: CHARMS[id] }))
      .filter((r) => r.def && (matches(r.def.name) || matches(r.id)));
    if (!owned.length && !matches('charm')) return;

    body.appendChild(rule(`CHARMS — ${worn.filter(Boolean).length} / ${CHARM_SLOT_COUNT} worn`, 'relics'));
    if (!owned.length) {
      body.appendChild(el('div', 'sq-theme-empty',
        'No charms. The Merchant at the Trading Post sells lanterns and a charm of swift feet — '
        + 'they are the only permanent upgrade money can buy, and they are priced like it.'));
      return;
    }
    const wrap = el('div', 'sq-inv-rows');
    for (const r of rows) {
      const slotIdx = worn.indexOf(r.id);
      const row = el('div', 'sq-theme-card sq-inv-row');
      row.style.borderLeftColor = r.def.color;
      const icon = el('div', 'sq-inv-icon', r.def.symbol || '✦');
      icon.style.color = r.def.color;
      row.appendChild(icon);
      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', r.def.name));
      main.appendChild(el('div', 'sq-inv-desc', r.def.desc || ''));
      const bits = [];
      if (r.def.light > 0) bits.push(`lights ${r.def.light} tiles in the dark`);
      if (r.def.speed > 1) bits.push(`+${Math.round((r.def.speed - 1) * 100)}% walking pace`);
      main.appendChild(el('div', 'sq-inv-note',
        (bits.join(' · ') || 'no effect yet') + (slotIdx !== -1 ? `  ·  WORN (slot ${slotIdx + 1})` : '')));
      row.appendChild(main);

      const side = el('div', 'sq-inv-side');
      const btns = el('div', 'sq-inv-slotbtns');
      for (let i = 0; i < CHARM_SLOT_COUNT; i += 1) {
        const on = worn[i] === r.id;
        const b = el('button', `sq-theme-btn sq-inv-slotbtn${on ? ' sq-theme-on' : ''}`, String(i + 1));
        b.type = 'button';
        b.title = on ? `Take it off (charm slot ${i + 1}).` : `Wear it in charm slot ${i + 1}.`;
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            // Pressing a LIT slot takes the charm off — the same gesture the
            // hand slots use, so the two read the same way.
            const res = on
              ? await api.removeCharm(i + 1)
              : await api.wearCharm(i + 1, r.id);
            if (res && !res.ok) showToast(res.error || 'that charm would not go on');
            if (res && res.state) setState(res.state); else render();
          } catch (err) { showToast(String((err && err.message) || err)); }
          b.disabled = false;
        });
        btns.appendChild(b);
      }
      side.appendChild(btns);
      row.appendChild(side);
      wrap.appendChild(row);
    }
    body.appendChild(wrap);
  }

  function renderSeeds() {
    if (!matches('saplings') && !matches('seeds') && !matches('seedpod')) return;
    const p = (state && state.player) || {};
    const saplings = Math.max(0, num(p.saplings, 0));
    const pods = Math.max(0, num(materialsHeld().seedpod, 0));
    const total = saplings + pods;
    body.appendChild(rule('SEEDS', 'materials'));
    if (total <= 0) {
      body.appendChild(el('div', 'sq-theme-empty',
        'No saplings. The Merchant sells them at the Trading Post — trees do not grow back on their own.'));
      return;
    }
    const rows = el('div', 'sq-inv-rows');
    const row = el('div', 'sq-theme-card sq-inv-row');
    row.style.borderLeftColor = PALETTE_V3.good;
    const icon = el('div', 'sq-inv-icon', '❦');
    icon.style.color = PALETTE_V3.good;
    row.appendChild(icon);
    const main = el('div', 'sq-inv-main');
    main.appendChild(el('div', 'sq-inv-name', 'Saplings'));
    main.appendChild(el('div', 'sq-inv-desc',
      'Put these in a slot, face bare ground or a stump, and press E to plant.'));
    main.appendChild(el('div', 'sq-inv-note',
      `${saplings} sapling(s)${pods ? ` · ${pods} seedpod(s), used once the saplings run out` : ''}`));
    row.appendChild(main);
    const side = el('div', 'sq-inv-side');
    side.appendChild(el('div', 'sq-inv-stack', `x${total}`));
    side.appendChild(slotButtons({ kind: 'seed', itemId: SEED_ITEM_ID }, 'saplings', {}));
    row.appendChild(side);
    rows.appendChild(row);
    body.appendChild(rows);
  }

  function renderTools() {
    const list = gatherToolList().filter((t) => {
      const def = TOOLS[t.toolId] || {};
      return matches(def.name || t.toolId);
    });
    body.appendChild(rule('GATHERING TOOLS', 'tools'));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty',
        'Nothing to swing. Craft an axe or a pickaxe at a house.'));
      return;
    }
    const rows = el('div', 'sq-inv-rows');
    for (const t of list) {
      const def = TOOLS[t.toolId] || { name: t.toolId, desc: '' };
      const nodeDef = def.node ? GATHER_NODES[def.node] : null;
      const ratio = t.durability / Math.max(1, t.maxDurability);
      const worn = ratio <= 0.25;
      const broken = t.durability <= 0;
      const row = el('div', `sq-theme-card sq-inv-row${worn ? ' sq-inv-worncol' : ''}`);
      row.style.borderLeftColor = worn ? PALETTE_V3.bad : elementColor('tools');
      const icon = el('div', 'sq-inv-icon', '⚒');
      icon.style.color = worn ? PALETTE_V3.bad : elementColor('tools');
      row.appendChild(icon);

      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', def.name || t.toolId));
      if (def.desc) main.appendChild(el('div', 'sq-inv-desc', def.desc));
      if (nodeDef) {
        main.appendChild(el('div', 'sq-inv-note',
          `${nodeDef.id} nodes · ${nodeDef.energy} stamina a swing · ${nodeDef.hits} hits to fell`));
      }
      const pips = el('div', 'sq-inv-pips');
      const PIPS = 12;
      const lit = Math.ceil(ratio * PIPS);
      for (let i = 0; i < PIPS; i++) pips.appendChild(el('div', `sq-inv-pip${i >= lit ? ' sq-inv-pipoff' : ''}`));
      main.appendChild(pips);
      main.appendChild(el('div', 'sq-inv-dur',
        broken ? 'BROKEN — repair it at a Forge'
          : `${t.durability} / ${t.maxDurability} durability${worn ? ' — repair at a Forge' : ''}`));
      row.appendChild(main);

      const side = el('div', 'sq-inv-side');
      const ref = { kind: 'tool', itemId: t.toolId, uid: t.uid };
      const inSlot = slotHolding(ref);
      if (inSlot) side.appendChild(el('div', 'sq-inv-tag sq-inv-equipped', `SLOT ${inSlot}`));
      else if (broken) side.appendChild(el('div', 'sq-inv-tag sq-inv-worn', 'SPENT'));
      // A broken tool can still be UNequipped — otherwise it is stuck in hand
      // until repaired, and the prompt in the world keeps pointing at it.
      side.appendChild(slotButtons(ref, def.name || t.toolId, {
        disabled: broken && !inSlot,
        disabledReason: 'Spent. Repair it at a Forge before putting it in hand.',
      }));
      row.appendChild(side);
      rows.appendChild(row);
    }
    body.appendChild(rows);
    body.appendChild(el('div', 'sq-inv-hint',
      'Repairs happen at a Forge — walk up to one and press E.'));
  }

  /** The two charm slots, as charm ids or nulls. */
  function charmsWorn() {
    const p = (state && state.player) || {};
    return Array.isArray(p.charms) ? p.charms : [];
  }
  /** Every charm the scholar owns, worn or not. */
  function ownedCharmIds() {
    const p = (state && state.player) || {};
    return Array.isArray(p.ownedCharms) ? p.ownedCharms : [];
  }

  function equippedGearCount() {
    return gearList().filter((t) => t && t.equipped).length;
  }

  /**
   * The paper-doll. Bruno: "for the gear make it minecraft style: show the
   * armor where you can equip it."
   *
   * Every slot in DOLL_SLOTS is drawn, including the ones that hold nothing yet
   * — armour, companions. A locked slot is not a lie: it says what would fill it
   * and that it is not forgeable yet, which is how a player learns the shape of
   * the game before the content lands. The two hand slots are live and are the
   * same two the world's 1 / 2 keys drive.
   */
  function refDisplayName(ref) {
    if (!ref) return null;
    if (ref.kind === 'seed') return 'Saplings';
    const table = ref.kind === 'gadget' ? (RECIPE_MOD.GADGETS || {}) : TOOLS;
    const def = table[ref.itemId];
    return (def && def.name) || String(ref.itemId).replace(/_/g, ' ');
  }

  function dollFigure() {
    const wrap = el('div', 'sq-inv-dollfig');
    try {
      const sheet = SPRITES && SPRITES.player && SPRITES.player.down;
      const sprite = sheet && sheet[0];
      // spriteCanvas hands back an OffscreenCanvas wherever the browser has
      // one, which is NOT a DOM node and cannot be appended. Draw it into a
      // real <canvas> instead of appending the cache entry.
      const scale = 6;
      if (sprite) {
        const cv = document.createElement('canvas');
        cv.width = sprite.w * scale;
        cv.height = sprite.h * scale;
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = false;
        drawSprite(cx, sprite, 0, 0, scale);
        wrap.appendChild(cv);
      } else {
        wrap.appendChild(el('div', 'sq-inv-dollglyph', '☗'));
      }
    } catch (err) {
      // A figure that will not draw must never take the Gear tab down with it.
      if (typeof console !== 'undefined') console.error('[sq-inv] doll figure', err);
      wrap.appendChild(el('div', 'sq-inv-dollglyph', '☗'));
    }
    const p = (state && state.player) || {};
    wrap.appendChild(el('div', 'sq-inv-dollname',
      String(p.name || 'SCHOLAR').toUpperCase()));
    return wrap;
  }

  function dollSlotCell(def) {
    const eq = equippedRefs();
    const gear = gearList().filter((t) => t && t.equipped);
    const isHand = Number.isInteger(def.hand);
    const isGear = Number.isInteger(def.gear);
    const ref = isHand ? eq[def.hand] : null;
    // THE DOLL'S CHARM SLOTS NOW HOLD CHARMS.
    //
    // They were bound to `gearList()` — the old passive-bonus TOOLS (Focus Lamp
    // and friends) — so clicking the cell marked CHARM did nothing at all, and
    // a charm you owned never appeared on the doll. Bruno: "it does not let me
    // equip the lantern in slots 1 or 2 from the gears menu in the inventory."
    // He was clicking exactly the right thing; it was not connected.
    //
    // Passive gear keeps its own list below (renderGear) — and nobody owns any
    // while crafting is parked, which is why it can give up its doll cells.
    const wornCharmId = isGear ? (charmsWorn()[def.gear] || null) : null;
    const wornCharm = wornCharmId ? CHARMS[wornCharmId] : null;
    const worn = isGear ? (gear[def.gear] || null) : null;

    const locked = !!def.locked;
    const cell = el(locked ? 'div' : 'button',
      `sq-inv-dollslot${locked ? ' sq-inv-dolllocked' : ' sq-inv-dollopen'}`);
    if (!locked) cell.type = 'button';
    if (isHand && def.hand === activeSlotIndex()) cell.classList.add('sq-inv-dollactive');

    let fill = 'empty';
    if (ref) fill = refDisplayName(ref);
    else if (wornCharm) fill = wornCharm.name;
    else if (worn) fill = (TOOLS[worn.itemId] && TOOLS[worn.itemId].name) || worn.itemId;
    if (fill === 'empty') cell.classList.add('sq-inv-dollempty');

    cell.appendChild(el('div', 'sq-inv-dollglyph', def.glyph || '·'));
    const text = el('div', 'sq-inv-dolltext');
    text.appendChild(el('div', 'sq-inv-dolllabel', def.label));
    text.appendChild(el('div', 'sq-inv-dollfill', fill));
    cell.appendChild(text);
    cell.title = def.note || def.label;

    if (!locked) {
      cell.addEventListener('click', async () => {
        try {
          if (isHand) {
            // Clicking the slot that is already active empties it; clicking the
            // other one selects it. Same rule as the number keys in the world.
            const res = (def.hand === activeSlotIndex() && ref)
              ? await api.clearSlot(def.hand + 1)
              : await api.setActiveSlot(def.hand + 1);
            if (res && res.ok) { if (res.state) setState(res.state); else render(); }
            else showToast((res && res.error) || 'Could not change that slot.');
            return;
          }
          if (isGear) {
            // A filled charm slot takes the charm OFF. An empty one puts on the
            // first charm you own and are not already wearing, so the doll is
            // something you can actually dress rather than a read-out.
            if (wornCharmId) {
              const res = await api.removeCharm(def.gear + 1);
              if (res && res.ok) { if (res.state) setState(res.state); else render(); }
              else showToast((res && res.error) || 'Could not take that off.');
              return;
            }
            const spare = ownedCharmIds().find((id) => charmsWorn().indexOf(id) === -1);
            if (spare) {
              const res = await api.wearCharm(def.gear + 1, spare);
              if (res && res.ok) { if (res.state) setState(res.state); else render(); }
              else showToast((res && res.error) || 'Could not put that on.');
              return;
            }
            if (worn) {
              const res = await api.equip(worn.uid, false);
              if (res && res.ok) { if (res.state) setState(res.state); else render(); }
              else showToast((res && res.error) || 'Could not change your gear.');
              return;
            }
            showToast('No charms yet. The Merchant at the Trading Post sells them.');
            return;
          }
          showToast(isGear
            ? 'Nothing in that slot — equip a piece from the list below.'
            : 'Equip something from the ITEMS tab.');
        } catch (err) { showToast(String((err && err.message) || err)); }
      });
    }
    return cell;
  }

  function renderDoll() {
    const doll = el('div', 'sq-inv-doll');
    const left = el('div', 'sq-inv-dollcol');
    const right = el('div', 'sq-inv-dollcol');
    for (const def of DOLL_SLOTS) {
      (def.col === 'right' ? right : left).appendChild(dollSlotCell(def));
    }
    doll.appendChild(left);
    doll.appendChild(dollFigure());
    doll.appendChild(right);
    body.appendChild(doll);
    body.appendChild(el('div', 'sq-inv-hint',
      'SLOT 1 and SLOT 2 are what you HOLD — press 1 or 2 in the world to switch between them, '
      + 'and fill them from the ITEMS tab. The two CHARM slots are what you WEAR: click one to '
      + 'put on a charm you own, or to take it off. Greyed slots are built but not yet forgeable.'));
  }

  function renderGear() {
    const list = gearList().filter((t) => {
      const def = TOOLS[t.itemId] || {};
      return matches(def.name || t.itemId);
    });
    body.appendChild(rule(`PASSIVE GEAR — ${equippedGearCount()} / 2 equipped`, 'gear'));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty', 'No gear yet. Craft a Focus Lamp at a house.'));
      return;
    }
    const rows = el('div', 'sq-inv-rows');
    const sorted = list.slice().sort((a, b) => (b.equipped ? 1 : 0) - (a.equipped ? 1 : 0));
    for (const t of sorted) {
      const def = TOOLS[t.itemId] || { name: t.itemId, desc: '', bonus: null };
      const row = el('div', 'sq-theme-card sq-inv-row');
      row.style.borderLeftColor = t.equipped ? PALETTE_V3.good : elementColor('gear');
      const icon = el('div', 'sq-inv-icon', '◈');
      icon.style.color = t.equipped ? PALETTE_V3.good : elementColor('gear');
      row.appendChild(icon);
      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', def.name || t.itemId));
      if (def.desc) main.appendChild(el('div', 'sq-inv-desc', def.desc));
      main.appendChild(el('div', 'sq-inv-note', bonusText(def.bonus)));
      row.appendChild(main);
      const side = el('div', 'sq-inv-side');
      if (t.equipped) side.appendChild(el('div', 'sq-inv-tag sq-inv-equipped', 'EQUIPPED'));
      const btn = el('button', `sq-theme-btn${t.equipped ? '' : ' sq-theme-go'}`, t.equipped ? 'UNEQUIP' : 'EQUIP');
      btn.type = 'button';
      if (!t.equipped && equippedGearCount() >= 2) {
        btn.disabled = true;
        btn.title = 'Two pieces equipped already — unequip one first.';
      }
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = typeof api.equip === 'function'
            ? await api.equip(t.uid, !t.equipped)
            : { ok: false, error: 'equip is not wired up' };
          if (res && res.ok) { if (res.state) setState(res.state); }
          else { showToast((res && res.error) || 'Could not change your gear.'); btn.disabled = false; }
        } catch (err) { showToast(String((err && err.message) || err)); btn.disabled = false; }
      });
      side.appendChild(btn);
      row.appendChild(side);
      rows.appendChild(row);
    }
    body.appendChild(rows);
  }

  /**
   * THE QUEST TAB — the errands people have given you, and where each stands.
   *
   * Not the Task Log: that is real coursework and lives on [T]. These are
   * conversations somebody started, and what a player needs from them is one
   * line — what am I supposed to be doing — so the current step is the loud
   * thing and the rest is the trail behind it.
   */
  function renderQuests() {
    const list = activeQuests(state || {}).filter((q) => matches(q.name) || matches(q.giver));
    body.appendChild(rule('QUESTS', 'quests'));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty',
        'Nobody has asked you for anything yet. They will.'));
      return;
    }
    const rows = el('div', 'sq-inv-rows');
    for (const q of list) {
      const card = el('div', 'sq-theme-card sq-inv-quest');
      if (q.complete) card.classList.add('sq-inv-quest-done');
      const head2 = el('div', 'sq-inv-quest-head');
      head2.appendChild(el('div', 'sq-inv-quest-name', q.name));
      head2.appendChild(el('div', q.complete ? 'sq-inv-quest-tag-done' : 'sq-inv-quest-tag',
        q.complete ? 'COMPLETE' : `${q.doneCount}/${q.total}`));
      card.appendChild(head2);
      card.appendChild(el('div', 'sq-inv-quest-giver', q.giver));
      card.appendChild(el('div', 'sq-inv-quest-blurb', q.blurb));
      const steps = el('ol', 'sq-inv-quest-steps');
      for (const st of q.steps) {
        const li = el('li', `sq-inv-quest-step${st.done ? ' is-done' : ''}${st.current ? ' is-now' : ''}`);
        li.appendChild(el('span', 'sq-inv-quest-mark', st.done ? '✓' : (st.current ? '▸' : '·')));
        li.appendChild(el('span', null, st.text));
        steps.appendChild(li);
      }
      card.appendChild(steps);
      rows.appendChild(card);
    }
    body.appendChild(rows);
  }

  function renderRelics() {
    const list = relicList().filter((r) => matches(r.name || r.id));
    // Only claim the tab is empty if it really is. This used to say "No relics"
    // under a full list of Reaches gear, because it was the only thing on the
    // tab and could assume it spoke for the whole page.
    const aloneOnTab = !body.childNodes.length;
    if (!list.length && !aloneOnTab) return;
    body.appendChild(rule('RELICS', 'relics'));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty',
        'No relics. They are not bought — they turn up in the deeper regions.'));
      return;
    }
    const rows = el('div', 'sq-inv-rows');
    for (const r of list) {
      const row = el('div', 'sq-theme-card sq-inv-row');
      row.style.borderLeftColor = elementColor('relics');
      const icon = el('div', 'sq-inv-icon', '❖');
      icon.style.color = elementColor('relics');
      row.appendChild(icon);
      const main = el('div', 'sq-inv-main');
      main.appendChild(el('div', 'sq-inv-name', r.name || r.id));
      if (r.desc) main.appendChild(el('div', 'sq-inv-desc', r.desc));
      main.appendChild(el('div', 'sq-inv-note', bonusText(r.passive)));
      row.appendChild(main);
      row.appendChild(el('div', 'sq-inv-side', ''));
      rows.appendChild(row);
    }
    body.appendChild(rows);
  }

  function renderBoxes() {
    const boxes = num(state && state.player && state.player.darkBoxes, 0);
    body.appendChild(rule('DARK BOXES', 'boxes'));
    const wrap = el('div', 'sq-theme-card sq-inv-boxwrap');
    wrap.style.borderLeftColor = elementColor('boxes');
    wrap.appendChild(el('div', 'sq-inv-boxglyph', '⬛'));
    const main = el('div', 'sq-inv-main');
    const count = el('div', 'sq-inv-boxcount', '0');
    main.appendChild(count);
    countTo(count, 0, boxes, { duration: 460 });
    main.appendChild(el('div', 'sq-inv-desc',
      boxes > 0
        ? 'Sealed. Each one holds materials — the good ones rarely.'
        : 'None. They drop from strong work, or the Broker sells them at a price that climbs all day.'));
    const acts = el('div', 'sq-inv-boxacts');
    const one = el('button', `sq-theme-btn${boxes > 0 ? ' sq-theme-go' : ''}`, 'OPEN ONE');
    one.type = 'button';
    one.disabled = boxes < 1;
    one.addEventListener('click', () => openBoxes(1, one));
    acts.appendChild(one);
    const all = el('button', 'sq-theme-btn', `OPEN ALL (${boxes})`);
    all.type = 'button';
    all.disabled = boxes < 2;
    all.addEventListener('click', () => openBoxes(boxes, all));
    acts.appendChild(all);
    main.appendChild(acts);
    wrap.appendChild(main);
    body.appendChild(wrap);
  }

  async function openBoxes(n, btn) {
    if (btn) btn.disabled = true;
    try {
      const res = typeof api.openBoxes === 'function'
        ? await api.openBoxes(n)
        : { ok: false, error: 'box opening is not wired up' };
      if (res && res.ok) { if (res.state) setState(res.state); else render(); }
      else { showToast((res && res.error) || 'Those boxes would not open.'); if (btn) btn.disabled = false; }
    } catch (err) {
      showToast(String((err && err.message) || err));
      if (btn) btn.disabled = false;
    }
  }

  // BUILDINGS ARE NOT ITEMS. `renderBuildings()` used to list
  // `state.pendingBuildings` here with a PLACE button — the one entry in the
  // Bag that was not something you carry. A building is RAISED, so the list and
  // its PLACE button moved to the crafting bench that made it (`renderPending`
  // in web/ui/craft.js). NOTE that button was the ONLY route into build mode,
  // which is why it was moved rather than deleted. `state.pendingBuildings` is
  // untouched — the server still tracks it. (Bruno, 2026-08-31.)

  // ---- render -------------------------------------------------------------
  function countKinds() {
    const held = materialsHeld();
    let n = Object.keys(held).filter((k) => num(held[k], 0) > 0).length;
    n += gadgetList().filter((g) => g.qty > 0).length;
    n += blockList().filter((b) => b.qty > 0).length;
    n += gatherToolList().length + gearList().length + relicList().length;
    return n;
  }

  function render() {
    try {
      cdNodes.length = 0;
      for (const t of TABS) tabBtns[t.id].classList.toggle('sq-theme-on', t.id === tab);
      body.textContent = '';
      countEl.textContent = `${countKinds()} kinds`;
      // ITEMS is one list of everything you carry: what you hold, what you
      // plant, what you spend, what you place. Relics and boxes are deliberately
      // NOT in it — see the note on TABS.
      if (tab === 'items') {
        renderTools();
        renderSeeds();
        renderGadgets();
        renderBlocks();
        renderMaterials();
      } else if (tab === 'gear') { renderDoll(); renderCharms(); renderGear(); }
      else if (tab === 'relics') {
        // THE RELICS TAB IS THE HOME FOR EVERYTHING PERMANENT.
        //
        // Bruno, 2026-09-06: "these upgrades found in the reaches should appear
        // in the relics section of the inventory." They were rendered on the
        // BAG tab only, filed beside stacks of ironwood — which is the wrong
        // shelf for three things you find once and keep forever. The Codex and
        // the Ring belong here for the same reason, so quest items move too:
        // one home per concept, rather than two.
        renderReachesGear();
        renderQuestItems();
        renderRelics();
      }
      else if (tab === 'boxes') renderBoxes();
      else if (tab === 'quests') renderQuests();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-inv] render', err);
      body.textContent = '';
      body.appendChild(el('div', 'sq-theme-empty', 'The bag could not be drawn.'));
    }
  }

  /** Never rebuild the list while the player is typing in the filter box. */
  function isTypingInside() {
    const a = document.activeElement;
    if (!a || !scrim.contains(a)) return false;
    return a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA';
  }
  let pendingRender = false;
  scrim.addEventListener('focusout', () => {
    setTimeout(() => { if (pendingRender && !isTypingInside()) { pendingRender = false; render(); } }, 0);
  });

  function setState(next) {
    try {
      state = next || null;
      if (!open) return;
      if (isTypingInside()) { pendingRender = true; return; }
      render();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-inv] setState', err);
    }
  }

  function doOpen() {
    open = true;
    scrim.hidden = false;
    panel.classList.remove('sq-theme-rise');
    void panel.offsetWidth;
    panel.classList.add('sq-theme-rise');
    body.scrollTop = 0;
    render();
    if (!cdTimer) cdTimer = setInterval(() => { if (open) paintCooldowns(); }, 1000);
  }

  function doClose() {
    open = false;
    scrim.hidden = true;
    toast.hidden = true;
    if (cdTimer) { clearInterval(cdTimer); cdTimer = 0; }
  }

  function toggle() { if (open) doClose(); else doOpen(); }

  xBtn.addEventListener('click', doClose);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) doClose(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) doClose(); });

  return {
    setState,
    toggle,
    open: doOpen,
    close: doClose,
    isOpen: () => open,
  };
}

export default createInventory;
