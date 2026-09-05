// web/ui/craft.js  [ENG-UI]
// The crafting bench. v3: this is a PLACE, not a button. It only opens when the
// player is standing at a building whose BUILDING_ROLES include 'craft', and it
// says so plainly when opened without one.
//
// What used to live here and does not any more:
//   · the MATERIALS tab      -> web/ui/inventory.js
//   · gear equip / unequip   -> web/ui/inventory.js
//   · gathering tool list    -> web/ui/inventory.js (durability shown there)
//   · "ready to place" and "standing" buildings -> web/ui/inventory.js
// What stays: recipes and the act of crafting, plus repair (a forge-only role)
// and block recipes (a workshop-only role).
//
// Exactly one <style> tag, every selector namespaced .sq-craft-*.

import {
  RARITIES,
  BUILDING_FOOTPRINT,
  BUILDING_ROLES,
  BLOCK_IDS,
  TOOL_DURABILITY,
  PALETTE_V3,
} from '../../shared/constants.js';
import * as RECIPE_MOD from '../../shared/recipes.js';
import { injectTheme, el, num, elementColor } from './theme.js';

const STYLE_ID = 'sq-craft-style';

const MATERIALS = RECIPE_MOD.MATERIALS || {};
const TOOLS = RECIPE_MOD.TOOLS || {};
const BUILDINGS = RECIPE_MOD.BUILDINGS || {};
const RECIPES = RECIPE_MOD.RECIPES || [];
const checkCraft = RECIPE_MOD.checkCraft || (() => ({ ok: false, missing: [] }));

// Which buildings can craft at all — read straight off the authority so a new
// role in constants.js shows up here without an edit.
function craftPlaces() {
  return Object.keys(BUILDING_ROLES).filter((id) => {
    const roles = BUILDING_ROLES[id];
    return Array.isArray(roles) && roles.indexOf('craft') !== -1;
  });
}

function rolesOf(buildingId) {
  const r = BUILDING_ROLES[buildingId];
  return Array.isArray(r) ? r : [];
}

function rarityColor(rarity) {
  const r = RARITIES[rarity];
  return (r && r.color) || '#c9a86a';
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
.sq-craft-scrim { z-index: 62; }
.sq-craft-panel {
  width: min(940px, 95vw); max-height: min(84vh, 760px);
  display: flex; flex-direction: column;
}
.sq-craft-body { flex: 1 1 auto; min-height: 220px; }
.sq-craft-place {
  display: flex; align-items: center; gap: 8px;
  font-size: 9px; letter-spacing: .16em; padding: 4px 10px;
  color: var(--sq-ink); background: var(--sq-gold);
}
.sq-craft-place.sq-craft-nowhere { color: #ffd8cd; background: transparent; border: 2px solid var(--sq-bad); }

.sq-craft-pending {
  margin: 0 0 12px; padding: 9px 10px 10px;
  border: 2px solid rgba(201,146,47,.42); background: rgba(201,146,47,.09);
}
.sq-craft-pendtitle {
  font-size: 9px; letter-spacing: .14em; color: var(--sq-gold); margin-bottom: 7px;
}
.sq-craft-pendrow { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.sq-craft-pendrow:last-child { margin-bottom: 0; }
.sq-craft-pendrow .sq-craft-main { flex: 1 1 auto; min-width: 0; }
.sq-craft-hint {
  margin: 0 0 14px; padding: 10px 13px; font-size: 10px; line-height: 1.8;
  color: #6b5433; background: rgba(255,255,255,.45); border-left: 4px solid var(--sq-gold-deep);
}

.sq-craft-cards { display: grid; gap: 10px; }
.sq-craft-card {
  display: flex; gap: 14px; align-items: stretch; padding: 13px 15px;
  border-left-width: 6px;
}
.sq-craft-locked { opacity: .72; border-left-color: #9c8a6a !important; }
.sq-craft-main { flex: 1 1 auto; min-width: 0; }
.sq-craft-name { font-size: 12px; letter-spacing: .08em; color: #2c2113; }
.sq-craft-desc { margin-top: 4px; font-size: 10px; line-height: 1.7; color: #6b5433; }
.sq-craft-lock { margin-top: 7px; font-size: 9px; letter-spacing: .10em; color: #8a6a3c; }

.sq-craft-ings { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.sq-craft-ing {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9px; letter-spacing: .06em; padding: 4px 8px;
  border: 2px solid #c9a86a; background: rgba(255,255,255,.45); color: #5a4020;
}
.sq-craft-have { border-color: var(--sq-good); color: #3d5a1e; background: rgba(143,200,90,.20); }
.sq-craft-need { border-color: var(--sq-bad); color: #7a2f1c; background: rgba(226,101,74,.16); }

.sq-craft-side {
  flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end;
  justify-content: space-between; gap: 9px;
}
.sq-craft-kind {
  font-size: 8px; letter-spacing: .18em; padding: 3px 7px;
  color: #5a4020; border: 2px solid #c9a86a;
}

/* --- the "you are not at a house" state ------------------------------- */
.sq-craft-nowhere-box { padding: 30px 26px; text-align: center; }
.sq-craft-nglyph {
  font-size: 40px; line-height: 1; color: var(--sq-gold-deep);
  animation: sq-craft-sway 3.6s ease-in-out infinite;
}
.sq-craft-ntitle {
  margin-top: 14px; font-size: 14px; letter-spacing: .18em; color: #4a3620;
}
.sq-craft-nline { margin-top: 10px; font-size: 11px; line-height: 1.9; color: #6b5433; }
.sq-craft-nlist {
  margin: 18px auto 0; display: grid; gap: 8px; max-width: 520px; text-align: left;
}
.sq-craft-nrow {
  display: flex; align-items: center; gap: 12px; padding: 10px 13px;
  border-left-width: 6px;
}
.sq-craft-nname { flex: 1 1 auto; font-size: 11px; color: #2c2113; }
.sq-craft-nwhere { font-size: 9px; letter-spacing: .08em; color: #8a6a3c; }
.sq-craft-nwhere.sq-craft-missing { color: #a05038; }

/* --- repair ------------------------------------------------------------ */
.sq-craft-pips { display: flex; gap: 2px; margin-top: 8px; }
.sq-craft-pip { width: 8px; height: 8px; background: var(--sq-good); }
.sq-craft-pipoff { background: rgba(58,44,30,.22); }
.sq-craft-worn .sq-craft-pip { background: var(--sq-bad); }
.sq-craft-dur { margin-top: 5px; font-size: 9px; color: #6b5433; }

@keyframes sq-craft-sway {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-5px) rotate(2deg); }
}
@media (prefers-reduced-motion: reduce) { .sq-craft-nglyph { animation: none; } }
`;
  document.head.appendChild(s);
}

export function createCraft(root, api) {
  injectTheme();
  injectStyle();

  const host = root || document.body;
  let state = null;
  let open = false;
  let tab = 'craft';
  // The building the player is standing at. null means "nowhere in particular",
  // which is exactly the state this panel now refuses to work in.
  let location = null;

  const scrim = el('div', 'sq-theme-scrim sq-craft-scrim');
  scrim.hidden = true;
  const panel = el('div', 'sq-theme-frame sq-theme-rise sq-craft-panel');
  scrim.appendChild(panel);

  const head = el('div', 'sq-theme-head');
  const titleEl = el('div', 'sq-theme-title', 'CRAFTING');
  head.appendChild(titleEl);
  const placeEl = el('div', 'sq-craft-place', '');
  head.appendChild(placeEl);
  head.appendChild(el('div', 'sq-theme-spacer'));
  const xBtn = el('button', 'sq-theme-x', '✕');
  xBtn.type = 'button';
  head.appendChild(xBtn);
  panel.appendChild(head);

  const tabsBar = el('div', 'sq-theme-tabs');
  panel.appendChild(tabsBar);

  const body = el('div', 'sq-theme-body');
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
  function matQty(id) {
    const m = (state && state.materials) || {};
    return num(m[id], 0);
  }

  function buildingName(id) {
    const def = BUILDINGS[id];
    return (def && def.name) || String(id || '').replace(/_/g, ' ');
  }

  function standingAt(buildingId) {
    const list = (state && Array.isArray(state.buildings)) ? state.buildings : [];
    return list.filter((b) => b && b.buildingId === buildingId);
  }

  function blueprintsKnown() {
    return !!(state && Array.isArray(state.blueprints));
  }
  function hasBlueprint(recipeId) {
    if (!blueprintsKnown()) return true;
    return state.blueprints.indexOf(recipeId) !== -1;
  }

  function isBlockRecipe(r) {
    if (!r) return false;
    if (r.kind === 'block') return true;
    return BLOCK_IDS.indexOf(r.outputId) !== -1;
  }

  function outputMeta(recipe) {
    if (!recipe) return { name: 'Unknown', desc: '' };
    if (recipe.kind === 'building') {
      const b = BUILDINGS[recipe.outputId] || null;
      return { name: (b && b.name) || recipe.outputId, desc: (b && b.desc) || '' };
    }
    if (isBlockRecipe(recipe)) {
      const b = (RECIPE_MOD.BLOCKS && RECIPE_MOD.BLOCKS[recipe.outputId]) || null;
      return {
        name: (b && b.name) || String(recipe.outputId || '').replace(/_/g, ' '),
        desc: (b && b.desc) || 'A placeable block. Decoration, not a bonus.',
      };
    }
    const g = (RECIPE_MOD.GADGETS && RECIPE_MOD.GADGETS[recipe.outputId]) || null;
    if (g) return { name: g.name || recipe.outputId, desc: g.desc || g.effect || '' };
    const t = TOOLS[recipe.outputId] || null;
    return { name: (t && t.name) || recipe.outputId, desc: (t && t.desc) || '' };
  }

  // ---- tabs ---------------------------------------------------------------
  function availableTabs() {
    const roles = rolesOf(location);
    const tabs = [{ id: 'craft', label: 'RECIPES' }];
    if (roles.indexOf('blocks') !== -1) tabs.push({ id: 'blocks', label: 'BLOCKS' });
    if (roles.indexOf('repair') !== -1) tabs.push({ id: 'repair', label: 'REPAIR' });
    return tabs;
  }

  function paintTabs() {
    tabsBar.textContent = '';
    const tabs = availableTabs();
    tabsBar.hidden = !location || tabs.length < 2;
    if (!location) return;
    if (!tabs.some((t) => t.id === tab)) tab = tabs[0].id;
    for (const t of tabs) {
      const b = el('button', `sq-theme-tab${t.id === tab ? ' sq-theme-on' : ''}`, t.label);
      b.type = 'button';
      b.addEventListener('click', () => { tab = t.id; body.scrollTop = 0; render(); });
      tabsBar.appendChild(b);
    }
  }

  // ---- the empty state that teaches the new rule --------------------------
  function renderNowhere() {
    const box = el('div', 'sq-craft-nowhere-box');
    box.appendChild(el('div', 'sq-craft-nglyph', '⚒'));
    box.appendChild(el('div', 'sq-craft-ntitle', 'YOU MUST BE AT A HOUSE TO CRAFT'));
    box.appendChild(el('div', 'sq-craft-nline',
      'Crafting happens at a bench, and benches live in buildings. Walk up to one of these and press E.'));
    const list = el('div', 'sq-craft-nlist');
    for (const id of craftPlaces()) {
      const row = el('div', 'sq-theme-card sq-craft-nrow');
      row.style.borderLeftColor = elementColor('craft');
      const nameWrap = el('div', 'sq-craft-nname', buildingName(id));
      const roles = rolesOf(id).filter((r) => r !== 'craft');
      if (roles.length) nameWrap.appendChild(el('div', 'sq-craft-nwhere', `also: ${roles.join(', ')}`));
      row.appendChild(nameWrap);
      const here = standingAt(id);
      if (here.length) {
        const at = here[0];
        row.appendChild(el('div', 'sq-craft-nwhere', `standing at ${num(at.x, 0)}, ${num(at.y, 0)}`));
      } else {
        row.appendChild(el('div', 'sq-craft-nwhere sq-craft-missing', 'not built yet'));
      }
      list.appendChild(row);
    }
    box.appendChild(list);
    box.appendChild(el('div', 'sq-craft-nline',
      'The Study Hut you started with qualifies. Everything you own is in the Bag (Tab).'));
    body.appendChild(box);
  }

  // ---- recipes ------------------------------------------------------------
  function recipeCard(r) {
    const meta = outputMeta(r);

    if (!hasBlueprint(r.id)) {
      const card = el('div', 'sq-theme-card sq-craft-card sq-craft-locked');
      const main = el('div', 'sq-craft-main');
      main.appendChild(el('div', 'sq-craft-name', meta.name));
      if (meta.desc) main.appendChild(el('div', 'sq-craft-desc', meta.desc));
      main.appendChild(el('div', 'sq-craft-lock', '🔒 Ingredients unknown until the blueprint is read — the Archivist sells it.'));
      card.appendChild(main);
      const side = el('div', 'sq-craft-side');
      side.appendChild(el('div', 'sq-craft-kind', String(r.kind || 'item').toUpperCase()));
      const lb = el('button', 'sq-theme-btn', 'LOCKED');
      lb.type = 'button';
      lb.disabled = true;
      lb.title = 'Buy this blueprint from the Archivist to unlock the recipe.';
      side.appendChild(lb);
      card.appendChild(side);
      return card;
    }

    let check = { ok: false, missing: [] };
    try { check = checkCraft(state || {}, r.id) || check; }
    catch (e) { check = { ok: false, missing: [{ label: 'recipe error', have: 0, need: 1 }] }; }

    const card = el('div', 'sq-theme-card sq-craft-card');
    card.style.borderLeftColor = isBlockRecipe(r) ? elementColor('blocks')
      : r.kind === 'building' ? elementColor('buildings') : elementColor('craft');

    const main = el('div', 'sq-craft-main');
    main.appendChild(el('div', 'sq-craft-name', meta.name));
    if (meta.desc) main.appendChild(el('div', 'sq-craft-desc', meta.desc));
    if (r.kind === 'building') {
      const fp = BUILDING_FOOTPRINT[r.outputId];
      const def = BUILDINGS[r.outputId];
      const bits = [];
      if (fp) bits.push(`footprint ${fp.w}×${fp.h}`);
      if (def && def.passive) bits.push(bonusText(def.passive));
      if (bits.length) main.appendChild(el('div', 'sq-craft-lock', bits.join(' · ')));
    }

    const ings = el('div', 'sq-craft-ings');
    const mats = (r.materials && typeof r.materials === 'object') ? r.materials : {};
    for (const [mid, need] of Object.entries(mats)) {
      const def = MATERIALS[mid] || { name: mid, symbol: '◆', rarity: 'common' };
      const have = matQty(mid);
      const okThis = have >= num(need, 0);
      const chip = el('span', `sq-craft-ing ${okThis ? 'sq-craft-have' : 'sq-craft-need'}`,
        `${def.symbol || '◆'} ${def.name || mid} ${have}/${num(need, 0)}`);
      if (!okThis) chip.title = `You need ${num(need, 0) - have} more ${def.name || mid}.`;
      ings.appendChild(chip);
    }
    const costs = (r.coins && typeof r.coins === 'object') ? r.coins : {};
    const wallet = (state && state.player && state.player.coins) || {};
    for (const [cid, need] of Object.entries(costs)) {
      if (!num(need, 0)) continue;
      const have = num(wallet[cid], 0);
      const okThis = have >= num(need, 0);
      ings.appendChild(el('span', `sq-craft-ing ${okThis ? 'sq-craft-have' : 'sq-craft-need'}`,
        `${cid} ${have}/${num(need, 0)}`));
    }
    const missing = Array.isArray(check.missing) ? check.missing : [];
    for (const m of missing) {
      if (!m) continue;
      const label = String(m.label || '');
      if (!label) continue;
      const known = Object.keys(mats).some((k) => label === k || label === (MATERIALS[k] || {}).name)
        || Object.keys(costs).includes(label);
      if (known) continue;
      ings.appendChild(el('span', 'sq-craft-ing sq-craft-need',
        `${label} ${num(m.have, 0)}/${num(m.need, 0)}`));
    }
    if (!ings.childNodes.length) ings.appendChild(el('span', 'sq-craft-ing', 'free'));
    main.appendChild(ings);
    card.appendChild(main);

    const side = el('div', 'sq-craft-side');
    side.appendChild(el('div', 'sq-craft-kind', String(r.kind || 'item').toUpperCase()));
    const btn = el('button', `sq-theme-btn${check.ok ? ' sq-theme-go' : ''}`, 'CRAFT');
    btn.type = 'button';
    btn.disabled = !check.ok;
    btn.title = check.ok ? `Craft ${meta.name}`
      : 'Missing: ' + (missing.length
        ? missing.map((m) => `${m && m.label} ${num(m && m.have, 0)}/${num(m && m.need, 0)}`).join(', ')
        : 'requirements not met');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = typeof api.craft === 'function' ? await api.craft(r.id) : { ok: false, error: 'craft is not wired up' };
        if (res && res.ok) {
          showToast(`Crafted ${meta.name}.`, true);
          if (res.state) setState(res.state);
          else render();
        } else {
          showToast((res && res.error) || 'Could not craft that.');
          btn.disabled = false;
        }
      } catch (err) {
        showToast(String((err && err.message) || err));
        btn.disabled = false;
      }
    });
    side.appendChild(btn);
    card.appendChild(side);
    return card;
  }

  /** Buildings crafted but not yet standing. Empty renders nothing at all. */
  function pendingBuildings() {
    const p = state && state.pendingBuildings;
    if (!Array.isArray(p)) return [];
    return p.map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') return entry.buildingId || entry.id || entry.outputId || null;
      return null;
    }).filter((id) => typeof id === 'string' && id);
  }

  function renderPending() {
    const pend = pendingBuildings();
    if (!pend.length) return;
    const box = el('div', 'sq-craft-pending');
    box.appendChild(el('div', 'sq-craft-pendtitle',
      `READY TO RAISE — ${pend.length} building${pend.length === 1 ? '' : 's'}`));
    for (const bid of pend) {
      const def = BUILDINGS[bid] || { name: bid, desc: '' };
      const fp = BUILDING_FOOTPRINT[bid] || { w: '?', h: '?' };
      const row = el('div', 'sq-theme-card sq-craft-pendrow');
      row.style.borderLeftColor = elementColor('buildings');
      const main = el('div', 'sq-craft-main');
      main.appendChild(el('div', 'sq-craft-name', def.name || bid));
      main.appendChild(el('div', 'sq-craft-lock', `footprint ${fp.w}×${fp.h}`));
      row.appendChild(main);
      const btn = el('button', 'sq-theme-btn sq-theme-go', 'PLACE');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (typeof api.requestBuildMode !== 'function') return;
        // requestBuildMode closes every panel itself and puts the ghost under
        // the cursor, so there is nothing to close here.
        try { api.requestBuildMode(bid); } catch (err) {
          if (typeof console !== 'undefined') console.error('[sq-craft] requestBuildMode', err);
        }
      });
      row.appendChild(btn);
      box.appendChild(row);
    }
    body.appendChild(box);
  }

  /** The placeholder that stands in for the recipe list while it is parked. */
  function renderComingSoon() {
    // The pending-buildings list still belongs here: those are buildings you
    // have already PAID for, and this is the only route to raising them.
    renderPending();

    const box = el('div', 'sq-craft-nowhere-box');
    box.appendChild(el('div', 'sq-craft-nglyph', '⚒'));
    box.appendChild(el('div', 'sq-craft-ntitle', 'ROLLING OUT IN FUTURE UPDATES'));
    box.appendChild(el('div', 'sq-craft-nline',
      'The bench is being rebuilt. Crafting returns with item tiers and refining — '
      + 'raw materials into processed ones, and processed into finished gear.'));
    box.appendChild(el('div', 'sq-craft-nline',
      'Until then: the Merchant at the Trading Post sells replacement axes and pickaxes, '
      + 'and the charms. Repairs still work here.'));
    body.appendChild(box);
  }

  function renderRecipes(onlyBlocks) {
    const all = Array.isArray(RECIPES) ? RECIPES.filter((r) => r && r.id) : [];
    const list = all.filter((r) => (onlyBlocks ? isBlockRecipe(r) : !isBlockRecipe(r)));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty',
        onlyBlocks
          ? 'No block recipes yet. They are being written.'
          : 'No recipes defined.'));
      return;
    }
    if (!onlyBlocks && blueprintsKnown()) {
      const locked = list.filter((r) => !hasBlueprint(r.id)).length;
      body.appendChild(el('div', 'sq-craft-hint',
        locked
          ? `${list.length - locked} recipes known · ${locked} still sealed — the Archivist at the Trading Post sells the blueprints.`
          : 'Every blueprint known. Nothing left to buy from the Archivist.'));
    }
    if (onlyBlocks) {
      body.appendChild(el('div', 'sq-craft-hint',
        'Blocks are placed from the Bag (Tab). Removing one refunds half its cost.'));
    }
    // Buildings you have already paid for and not yet raised. This used to sit
    // in the Bag, which was wrong: a building is not carried, it is RAISED, and
    // it was the one entry in ITEMS that was not an item. It lives here instead
    // because here is where it was built, and because the Bag's PLACE button
    // was the ONLY route into build mode — deleting it outright would have left
    // a crafted building with nowhere to go. (Bruno, 2026-08-31.)
    if (!onlyBlocks) renderPending();
    const wrap = el('div', 'sq-craft-cards');
    for (const r of list) {
      try { wrap.appendChild(recipeCard(r)); } catch (e) { /* skip malformed recipe */ }
    }
    body.appendChild(wrap);
  }

  // ---- repair (forge only) ------------------------------------------------
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
      push(t.uid, t.itemId, t.durability, t.maxDurability, t.equipped || (equippedUid && t.uid === equippedUid));
    }
    return out;
  }

  function renderRepair() {
    const list = gatherToolList();
    body.appendChild(el('div', 'sq-craft-hint',
      'The forge is hot. Worn tools can be brought back here — nowhere else.'));
    if (!list.length) {
      body.appendChild(el('div', 'sq-theme-empty', 'Nothing to repair. You own no gathering tools.'));
      return;
    }
    const wrap = el('div', 'sq-craft-cards');
    for (const t of list) {
      const def = TOOLS[t.toolId] || { name: t.toolId, desc: '' };
      const ratio = t.durability / Math.max(1, t.maxDurability);
      const worn = ratio <= 0.25;
      const card = el('div', `sq-theme-card sq-craft-card${worn ? ' sq-craft-worn' : ''}`);
      card.style.borderLeftColor = worn ? PALETTE_V3.bad : elementColor('tools');
      const main = el('div', 'sq-craft-main');
      main.appendChild(el('div', 'sq-craft-name', def.name || t.toolId));
      if (def.desc) main.appendChild(el('div', 'sq-craft-desc', def.desc));
      const pips = el('div', 'sq-craft-pips');
      const PIPS = 12;
      const lit = Math.ceil(ratio * PIPS);
      for (let i = 0; i < PIPS; i++) pips.appendChild(el('div', `sq-craft-pip${i >= lit ? ' sq-craft-pipoff' : ''}`));
      main.appendChild(pips);
      main.appendChild(el('div', 'sq-craft-dur', `${t.durability} / ${t.maxDurability} durability`));
      card.appendChild(main);

      const side = el('div', 'sq-craft-side');
      const btn = el('button', `sq-theme-btn${t.durability < t.maxDurability ? ' sq-theme-go' : ''}`, 'REPAIR');
      btn.type = 'button';
      btn.disabled = t.durability >= t.maxDurability;
      if (btn.disabled) btn.title = 'Already in perfect condition.';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = typeof api.repairTool === 'function'
            ? await api.repairTool(t.uid)
            : { ok: false, error: 'repair is not wired up' };
          if (res && res.ok) { showToast(`${def.name || t.toolId} repaired.`, true); if (res.state) setState(res.state); }
          else { showToast((res && res.error) || 'Could not repair that tool.'); btn.disabled = false; }
        } catch (err) { showToast(String((err && err.message) || err)); btn.disabled = false; }
      });
      side.appendChild(btn);
      card.appendChild(side);
      wrap.appendChild(card);
    }
    body.appendChild(wrap);
  }

  // ---- render -------------------------------------------------------------
  function paintPlace() {
    if (location) {
      placeEl.className = 'sq-craft-place';
      placeEl.textContent = `AT THE ${buildingName(location).toUpperCase()}`;
      titleEl.textContent = tab === 'repair' ? 'FORGE' : 'CRAFTING';
    } else {
      placeEl.className = 'sq-craft-place sq-craft-nowhere';
      placeEl.textContent = 'NO BENCH IN REACH';
      titleEl.textContent = 'CRAFTING';
    }
  }

  function render() {
    try {
      paintPlace();
      paintTabs();
      body.textContent = '';
      if (!location) { renderNowhere(); return; }
      // CRAFTING IS PARKED. Bruno, 2026-08-31: "for the moment set the crafting
      // page in the study house to 'rolling out in future updates' text."
      //
      // The recipe list is left intact below rather than deleted — it works,
      // and it comes back the day the item tiers land (backlog item 15). Only
      // REPAIR stays reachable, because a worn-out tool with no way to mend it
      // is a soft-lock, and the Merchant charges for a new one.
      if (tab === 'repair') renderRepair();
      else renderComingSoon();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-craft] render', err);
      body.textContent = '';
      body.appendChild(el('div', 'sq-theme-empty', 'This bench could not be drawn.'));
    }
  }

  function setState(next) {
    try {
      state = next || null;
      if (open) render();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-craft] setState', err);
    }
  }

  /**
   * The world tells us where the player is standing. Pass a buildingId whose
   * BUILDING_ROLES include 'craft' to unlock the bench, or null to lock it.
   */
  function setLocation(buildingId) {
    try {
      const id = buildingId || null;
      location = (id && rolesOf(id).indexOf('craft') !== -1) ? id : null;
      if (open) render();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-craft] setLocation', err);
    }
  }

  function doOpen(buildingId) {
    if (buildingId !== undefined) setLocation(buildingId);
    open = true;
    scrim.hidden = false;
    panel.classList.remove('sq-theme-rise');
    void panel.offsetWidth;
    panel.classList.add('sq-theme-rise');
    body.scrollTop = 0;
    render();
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
    setLocation,
    openAt: (buildingId) => doOpen(buildingId || null),
    getLocation: () => location,
    toggle,
    open: doOpen,
    close: doClose,
    isOpen: () => open,
  };
}

export default createCraft;
