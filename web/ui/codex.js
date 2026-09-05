// web/ui/codex.js — THE CODEX, the journal you find rather than start with.
//
// Behind the barred door of the Elderwatch guardroom. Until you are carrying
// it, [J] says so and nothing opens: the book is a thing, and a menu that works
// before you have found the object it represents is not a discovery, it is a
// tab.
//
// WHAT IT SHOWS is the sweep in shared/codex.js — every material, building,
// tool, gadget, place, person, relic and rule you have met, and a `??????` for
// every one you have not. The blanks are the feature. A page that listed only
// what you had found would look finished the moment you found one thing, and
// there would be nothing in it to want.
//
// Exactly one <style> tag, id `sq-codex-style`, every selector `.sq-codex-*`.
// The frame, tabs, cards and chips are the shared theme's, so this panel wears
// the same parchment and gold as the rest without a second copy of it.

import { CODEX_CATEGORIES, codexPage, codexProgress, hasCodex } from '../../shared/codex.js';
import { RARITIES } from '../../shared/constants.js';
import { injectTheme, el, MONO } from './theme.js';

const STYLE_ID = 'sq-codex-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-codex-frame { width: min(880px, 94vw); max-height: min(78vh, 720px); display: flex; flex-direction: column; }
.sq-codex-body { overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.sq-codex-blurb { font-size: 11px; color: var(--sq-text-dim); letter-spacing: .06em; }

/* the shelf: one card per entry, known or not */
.sq-codex-grid {
  display: grid; gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
}
.sq-codex-entry {
  display: grid; grid-template-columns: 30px 1fr; gap: 9px;
  padding: 9px 10px; align-items: start;
}
.sq-codex-sigil {
  width: 28px; height: 28px; display: grid; place-items: center;
  font-family: ${MONO}; font-size: 15px; font-weight: 700;
  border: 2px solid var(--sq-gold-deep); background: rgba(0,0,0,.32);
}
.sq-codex-name { font-size: 12px; font-weight: 700; letter-spacing: .06em; color: var(--sq-text); }
.sq-codex-flavour { margin-top: 4px; font-size: 11px; line-height: 1.5; color: var(--sq-text-dim); }
.sq-codex-rarity { margin-top: 5px; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; }

/* AN UNFOUND ENTRY IS DRAWN, NOT HIDDEN — the gap is the invitation. */
.sq-codex-unknown { opacity: .40; }
.sq-codex-unknown .sq-codex-sigil { border-style: dashed; color: var(--sq-text-dim); }
.sq-codex-unknown .sq-codex-name { color: var(--sq-text-dim); letter-spacing: .22em; }

.sq-codex-count { font-size: 11px; letter-spacing: .1em; color: var(--sq-gold); }
.sq-codex-tabcount { opacity: .62; }
`;
  document.head.appendChild(s);
}

/**
 * createCodex(overlay, api) -> panel
 *
 * The same contract every panel keeps: setState / toggle / open / close /
 * isOpen, plus the seams the smoke suite reads.
 */
export function createCodex(overlay) {
  injectTheme();
  injectStyle();

  let state = null;
  let open = false;
  let tab = CODEX_CATEGORIES[0].id;
  let onDenied = null;

  const scrim = el('div', 'sq-theme-scrim sq-codex-scrim');
  scrim.hidden = true;
  const frame = el('div', 'sq-theme-frame sq-theme-rise sq-codex-frame');
  const head = el('div', 'sq-theme-head');
  const title = el('div', 'sq-theme-title', 'THE CODEX');
  const count = el('div', 'sq-codex-count', '');
  const x = el('button', 'sq-theme-x', '✕');
  const tabs = el('div', 'sq-theme-tabs');
  const body = el('div', 'sq-theme-body sq-codex-body');

  head.append(title, count, x);
  frame.append(head, tabs, body);
  scrim.append(frame);
  (overlay || document.body).appendChild(scrim);

  x.addEventListener('click', () => doClose());
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) doClose(); });

  function rarityColor(r) {
    const def = RARITIES[r];
    return (def && def.color) || 'var(--sq-text-dim)';
  }

  function renderTabs() {
    tabs.textContent = '';
    const prog = codexProgress(state || {});
    for (const c of CODEX_CATEGORIES) {
      const per = prog.per[c.id] || { known: 0, total: 0 };
      const b = el('button', `sq-theme-tab${c.id === tab ? ' sq-theme-on' : ''}`);
      b.append(el('span', null, c.name),
        el('span', 'sq-codex-tabcount', ` ${per.known}/${per.total}`));
      b.addEventListener('click', () => { tab = c.id; render(); });
      tabs.appendChild(b);
    }
  }

  function render() {
    if (!open) return;
    const prog = codexProgress(state || {});
    count.textContent = `${prog.known}/${prog.total} known`;
    renderTabs();

    const cat = CODEX_CATEGORIES.find((c) => c.id === tab) || CODEX_CATEGORIES[0];
    const page = codexPage(state || {}, cat.id);
    body.textContent = '';
    body.appendChild(el('div', 'sq-codex-blurb', cat.blurb));

    const grid = el('div', 'sq-codex-grid');
    for (const row of page.rows) {
      const card = el('div',
        `sq-theme-card sq-codex-entry${row.known ? '' : ' sq-codex-unknown'}`);
      const sigil = el('div', 'sq-codex-sigil', row.known ? (row.symbol || '❖') : '?');
      if (row.known && row.color) sigil.style.color = row.color;
      const text = el('div');
      text.appendChild(el('div', 'sq-codex-name', row.name));
      if (row.known && row.flavour) {
        text.appendChild(el('div', 'sq-codex-flavour', row.flavour));
      }
      if (row.known && row.rarity) {
        const r = el('div', 'sq-codex-rarity', row.rarity);
        r.style.color = rarityColor(row.rarity);
        text.appendChild(r);
      }
      card.append(sigil, text);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  function setState(next) {
    state = next;
    render();
  }

  /**
   * THE BOOK HAS TO BE IN YOUR HANDS.
   *
   * Refused rather than shown empty: an empty Codex and a Codex you have not
   * found look identical, and one of them is a bug.
   */
  function doOpen() {
    if (!hasCodex(state)) {
      if (typeof onDenied === 'function') onDenied();
      return false;
    }
    open = true;
    scrim.hidden = false;
    render();
    return true;
  }

  function doClose() {
    open = false;
    scrim.hidden = true;
  }

  function toggle() {
    if (open) { doClose(); return false; }
    return doOpen();
  }

  return {
    setState,
    toggle,
    open: doOpen,
    close: doClose,
    isOpen: () => open,
    /** Read by the dock: no button until the book is in the pack. */
    isAvailable: () => hasCodex(state),
    /** Called instead of opening when the book has not been found. */
    setOnDenied: (fn) => { onDenied = fn; },
    /** Test seam: which section is showing, and how full it is. */
    page: () => codexPage(state || {}, tab),
    /** Test seam: the whole tally, without reading the DOM. */
    progress: () => codexProgress(state || {}),
    /** Test seam: how many entry cards are actually on screen, and how many are blanks. */
    shown: () => ({
      cards: scrim.querySelectorAll('.sq-codex-entry').length,
      blanks: scrim.querySelectorAll('.sq-codex-unknown').length,
    }),
    selectTab: (id) => { tab = id; render(); },
  };
}

export default createCodex;
