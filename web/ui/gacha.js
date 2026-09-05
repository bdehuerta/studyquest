// web/ui/gacha.js  [AGENT-D]
// The dark box screen + the opening animation.
// Exactly one <style> tag, every selector namespaced .sq-gacha-*.

import {
  PALETTE,
  RARITIES,
  PITY_THRESHOLD,
} from '../../shared/constants.js';

const STYLE_ID = 'sq-gacha-style';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

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
  return (r && r.color) || PALETTE.textDim;
}

function bestRarity(drops) {
  let best = 'common';
  let bestIdx = 0;
  for (const d of (Array.isArray(drops) ? drops : [])) {
    const idx = RARITY_ORDER.indexOf(d && d.rarity);
    if (idx > bestIdx) { bestIdx = idx; best = RARITY_ORDER[idx]; }
  }
  return best;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-gacha-scrim {
  position: fixed; inset: 0; z-index: 65;
  background: rgba(6,6,11,0.86);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  overflow: auto;
  font-family: ${MONO};
  letter-spacing: 0.08em;
  color: ${PALETTE.text};
  image-rendering: pixelated;
}
.sq-gacha-scrim[hidden] { display: none; }
.sq-gacha-panel {
  position: relative;
  width: 100%; max-width: 640px;
  background: ${PALETTE.panel};
  border: 3px solid #6b4fa0;
  box-shadow: 7px 7px 0 rgba(0,0,0,0.75);
}
.sq-gacha-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: ${PALETTE.panelLight};
  border-bottom: 3px solid #6b4fa0;
}
.sq-gacha-title { font-size: 14px; font-weight: 700; color: #c9a6ff; }
.sq-gacha-x {
  font-family: ${MONO}; font-size: 14px; line-height: 1;
  padding: 4px 9px; cursor: pointer;
  background: ${PALETTE.panel}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
  box-shadow: 2px 2px 0 rgba(0,0,0,0.6);
}
.sq-gacha-x:hover { background: ${PALETTE.bad}; color: ${PALETTE.bg}; }
.sq-gacha-body { padding: 18px; text-align: center; }

.sq-gacha-count {
  font-size: 34px; font-weight: 800; color: #c9a6ff;
  font-variant-numeric: tabular-nums;
  text-shadow: 3px 3px 0 rgba(0,0,0,0.6);
}
.sq-gacha-countlabel { font-size: 10px; color: ${PALETTE.textDim}; margin-bottom: 14px; }
.sq-gacha-buttons { display: flex; gap: 10px; justify-content: center; margin-bottom: 18px; }
.sq-gacha-btn {
  font-family: ${MONO}; letter-spacing: 0.1em;
  font-size: 12px; padding: 9px 18px; cursor: pointer;
  background: ${PALETTE.panelLight}; color: ${PALETTE.text};
  border: 2px solid #6b4fa0;
  box-shadow: 3px 3px 0 rgba(0,0,0,0.6);
}
.sq-gacha-btn:hover:not(:disabled) { background: #6b4fa0; color: #fff; }
.sq-gacha-btn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 1px 1px 0 rgba(0,0,0,0.6); }
.sq-gacha-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.sq-gacha-pitywrap { margin-top: 6px; }
.sq-gacha-pitylabel {
  display: flex; justify-content: space-between;
  font-size: 9px; color: ${PALETTE.textDim}; margin-bottom: 4px;
}
.sq-gacha-pitybar {
  position: relative; height: 12px;
  background: ${PALETTE.bg};
  border: 2px solid ${PALETTE.border};
  overflow: hidden;
}
.sq-gacha-pityfill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: ${RARITIES.epic.color};
  transition: width 400ms cubic-bezier(.2,.9,.25,1);
}

/* ---- opening stage ---- */
.sq-gacha-stage {
  position: fixed; inset: 0; z-index: 95;
  background: rgba(4,4,8,0.94);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 16px;
  font-family: ${MONO}; letter-spacing: 0.08em;
  overflow: hidden;
  cursor: pointer;
}
.sq-gacha-stage[hidden] { display: none; }
.sq-gacha-crate {
  position: relative;
  width: 108px; height: 108px;
  background: linear-gradient(180deg, #24203a 0%, #12101d 100%);
  border: 4px solid #6b4fa0;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.6), 6px 6px 0 rgba(0,0,0,0.6);
}
.sq-gacha-crate::after {
  content: ''; position: absolute; inset: 22px;
  border: 3px solid #3b2f5e;
}
.sq-gacha-crate.sq-gacha-sh1 { animation: sq-gacha-shudder 240ms steps(4,end) infinite; }
.sq-gacha-crate.sq-gacha-sh2 { animation: sq-gacha-shudder 140ms steps(4,end) infinite; }
.sq-gacha-crate.sq-gacha-sh3 { animation: sq-gacha-shudder 70ms steps(4,end) infinite; }
@keyframes sq-gacha-shudder {
  0% { transform: translate(0,0) rotate(0deg); }
  25% { transform: translate(-4px,2px) rotate(-2deg); }
  50% { transform: translate(4px,-3px) rotate(2deg); }
  75% { transform: translate(-3px,-2px) rotate(-1deg); }
  100% { transform: translate(0,0) rotate(0deg); }
}
.sq-gacha-crate.sq-gacha-burst { animation: sq-gacha-burst 320ms ease-out forwards; }
@keyframes sq-gacha-burst {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(1.45); opacity: 1; filter: brightness(2.4); }
  100% { transform: scale(2.6); opacity: 0; filter: brightness(3); }
}
.sq-gacha-beam {
  position: absolute; top: 0; bottom: 0;
  left: 50%; width: 8px; margin-left: -4px;
  opacity: 0;
  background: currentColor;
  box-shadow: 0 0 28px 10px currentColor;
  pointer-events: none;
}
.sq-gacha-beam.sq-gacha-on { animation: sq-gacha-beam 900ms ease-out forwards; }
@keyframes sq-gacha-beam {
  0% { opacity: 0; transform: scaleX(0.2); }
  35% { opacity: 0.95; transform: scaleX(1); }
  100% { opacity: 0; transform: scaleX(7); }
}
.sq-gacha-flash {
  position: fixed; inset: 0; pointer-events: none;
  opacity: 0; background: currentColor;
}
.sq-gacha-flash.sq-gacha-on { animation: sq-gacha-screenflash 520ms ease-out forwards; }
@keyframes sq-gacha-screenflash {
  0% { opacity: 0; }
  12% { opacity: 0.85; }
  100% { opacity: 0; }
}
.sq-gacha-particle {
  position: fixed; width: 6px; height: 6px;
  pointer-events: none;
  background: currentColor;
  animation: sq-gacha-particle 900ms ease-out forwards;
}
@keyframes sq-gacha-particle {
  0% { transform: translate(0,0) scale(1); opacity: 1; }
  100% { transform: translate(var(--sq-dx), var(--sq-dy)) scale(0.2); opacity: 0; }
}
.sq-gacha-drops {
  display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;
  max-width: 640px;
}
.sq-gacha-drop {
  width: 108px;
  padding: 12px 8px;
  background: ${PALETTE.panel};
  border: 3px solid ${PALETTE.border};
  box-shadow: 4px 4px 0 rgba(0,0,0,0.65);
  opacity: 0;
  transform: rotateY(90deg);
  animation: sq-gacha-flip 340ms cubic-bezier(.2,1.3,.3,1) forwards;
}
@keyframes sq-gacha-flip {
  0% { opacity: 0; transform: rotateY(90deg) scale(0.7); }
  70% { opacity: 1; transform: rotateY(-8deg) scale(1.06); }
  100% { opacity: 1; transform: rotateY(0deg) scale(1); }
}
.sq-gacha-dropsym { font-size: 30px; line-height: 1; margin-bottom: 8px; }
.sq-gacha-dropname { font-size: 10px; color: ${PALETTE.text}; word-break: break-word; }
.sq-gacha-dropqty { font-size: 14px; font-weight: 800; margin-top: 5px; font-variant-numeric: tabular-nums; }
.sq-gacha-droprar { font-size: 8px; margin-top: 4px; }
.sq-gacha-skip {
  position: fixed; right: 18px; bottom: 18px;
  font-size: 10px; color: ${PALETTE.textDim};
  border: 2px solid ${PALETTE.border};
  padding: 6px 10px;
  background: ${PALETTE.panel};
}
.sq-gacha-toast {
  position: absolute; left: 14px; right: 14px; bottom: 10px;
  padding: 8px 10px; font-size: 11px;
  background: ${PALETTE.bg}; color: ${PALETTE.bad};
  border: 2px solid ${PALETTE.bad};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.6);
}
.sq-gacha-toast[hidden] { display: none; }
`;
  document.head.appendChild(s);
}

export function createGacha(root, api) {
  injectStyle();

  const host = root || document.body;
  let state = null;
  let open = false;
  let busy = false;
  let lastPity = null; // learned from rollDarkBox results if state does not carry it

  const scrim = el('div', 'sq-gacha-scrim');
  scrim.hidden = true;
  const panel = el('div', 'sq-gacha-panel');
  scrim.appendChild(panel);

  const head = el('div', 'sq-gacha-head');
  head.appendChild(el('div', 'sq-gacha-title', 'DARK BOXES'));
  const xBtn = el('button', 'sq-gacha-x', '✕');
  xBtn.type = 'button';
  head.appendChild(xBtn);
  panel.appendChild(head);

  const body = el('div', 'sq-gacha-body');
  panel.appendChild(body);

  const countEl = el('div', 'sq-gacha-count', '0');
  body.appendChild(countEl);
  body.appendChild(el('div', 'sq-gacha-countlabel', 'boxes in your pack'));

  const btnRow = el('div', 'sq-gacha-buttons');
  const btn1 = el('button', 'sq-gacha-btn', 'OPEN ×1');
  btn1.type = 'button';
  const btn5 = el('button', 'sq-gacha-btn', 'OPEN ×5');
  btn5.type = 'button';
  btnRow.appendChild(btn1);
  btnRow.appendChild(btn5);
  body.appendChild(btnRow);

  const pityWrap = el('div', 'sq-gacha-pitywrap');
  const pityLabel = el('div', 'sq-gacha-pitylabel');
  const pityLeft = el('span', null, '0 / ' + PITY_THRESHOLD);
  const pityRight = el('span', null, `guaranteed Epic in ${PITY_THRESHOLD}`);
  pityLabel.appendChild(pityLeft);
  pityLabel.appendChild(pityRight);
  pityWrap.appendChild(pityLabel);
  const pityBar = el('div', 'sq-gacha-pitybar');
  const pityFill = el('div', 'sq-gacha-pityfill');
  pityBar.appendChild(pityFill);
  pityWrap.appendChild(pityBar);
  body.appendChild(pityWrap);

  const toast = el('div', 'sq-gacha-toast');
  toast.hidden = true;
  panel.appendChild(toast);

  let toastTimer = 0;
  function showError(msg) {
    toast.textContent = String(msg || 'Something went wrong.');
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  // ---- opening stage -----------------------------------------------------
  const stage = el('div', 'sq-gacha-stage');
  stage.hidden = true;
  host.appendChild(scrim);
  host.appendChild(stage);

  function boxCount() {
    const p = (state && state.player) || {};
    return num(p.darkBoxes, 0);
  }

  function readPity() {
    if (lastPity !== null) return lastPity;
    const s = state || {};
    const p = s.player || {};
    const candidates = [s.pity, s.boxPity, p.pity, p.boxPity];
    for (const c of candidates) {
      if (Number.isFinite(Number(c))) return Number(c);
    }
    return 0;
  }

  function render() {
    try {
      const n = boxCount();
      countEl.textContent = String(n);
      btn1.disabled = busy || n < 1;
      btn5.disabled = busy || n < 5;

      const pity = Math.max(0, Math.min(PITY_THRESHOLD, readPity()));
      const left = Math.max(0, PITY_THRESHOLD - pity);
      pityLeft.textContent = `${pity} / ${PITY_THRESHOLD}`;
      pityRight.textContent = left <= 0
        ? 'next box is a guaranteed Epic'
        : `guaranteed Epic in ${left}`;
      pityFill.style.width = ((pity / PITY_THRESHOLD) * 100).toFixed(1) + '%';
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-gacha] render', err);
    }
  }

  function setState(next) {
    try {
      state = next || null;
      render();
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-gacha] setState', err);
    }
  }

  // --- skippable waiting ---
  const skipWaiters = [];
  let skipped = false;

  function wait(ms) {
    return new Promise((resolve) => {
      if (skipped) { resolve(); return; }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(handle);
        const i = skipWaiters.indexOf(finish);
        if (i >= 0) skipWaiters.splice(i, 1);
        resolve();
      };
      const handle = setTimeout(finish, ms);
      skipWaiters.push(finish);
    });
  }

  function doSkip() {
    skipped = true;
    for (const f of skipWaiters.slice()) {
      try { f(); } catch (e) { /* ignore */ }
    }
  }

  stage.addEventListener('click', doSkip);

  function particleBurst(color, count) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < count; i++) {
      const p = el('div', 'sq-gacha-particle');
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 120 + Math.random() * 220;
      p.style.color = color;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.setProperty('--sq-dx', `${Math.cos(ang) * dist}px`);
      p.style.setProperty('--sq-dy', `${Math.sin(ang) * dist}px`);
      const size = 4 + Math.floor(Math.random() * 6);
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      stage.appendChild(p);
      setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 1000);
    }
  }

  function dropCard(d) {
    const rarity = (d && d.rarity) || 'common';
    const col = (d && d.color) || rarityColor(rarity);
    const card = el('div', 'sq-gacha-drop');
    card.style.borderColor = col;
    const sym = el('div', 'sq-gacha-dropsym', (d && d.symbol) || '◈');
    sym.style.color = col;
    card.appendChild(sym);
    card.appendChild(el('div', 'sq-gacha-dropname', (d && d.name) || (d && d.materialId) || '???'));
    const qty = el('div', 'sq-gacha-dropqty', `×${num(d && d.qty, 1)}`);
    qty.style.color = col;
    card.appendChild(qty);
    const rar = el('div', 'sq-gacha-droprar', String(rarity).toUpperCase());
    rar.style.color = rarityColor(rarity);
    card.appendChild(rar);
    return card;
  }

  async function playOpening(drops) {
    try {
      const list = Array.isArray(drops) ? drops.filter(Boolean) : [];
      skipped = false;
      skipWaiters.length = 0;

      stage.textContent = '';
      stage.hidden = false;

      const best = bestRarity(list);
      const bestCol = rarityColor(best);
      const isBig = best === 'epic' || best === 'legendary';

      const crate = el('div', 'sq-gacha-crate sq-gacha-sh1');
      const beam = el('div', 'sq-gacha-beam');
      beam.style.color = bestCol;
      const dropsWrap = el('div', 'sq-gacha-drops');
      const skipHint = el('div', 'sq-gacha-skip', 'click to skip');
      stage.appendChild(beam);
      stage.appendChild(crate);
      stage.appendChild(dropsWrap);
      stage.appendChild(skipHint);

      // shudder, escalating
      await wait(500);
      crate.className = 'sq-gacha-crate sq-gacha-sh2';
      await wait(500);
      crate.className = 'sq-gacha-crate sq-gacha-sh3';
      await wait(400);

      // beam + burst
      if (!skipped) beam.classList.add('sq-gacha-on');
      crate.className = 'sq-gacha-crate sq-gacha-burst';
      await wait(300);
      if (crate.parentNode) crate.parentNode.removeChild(crate);

      if (isBig && !skipped) {
        const flash = el('div', 'sq-gacha-flash sq-gacha-on');
        flash.style.color = bestCol;
        stage.appendChild(flash);
        setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 600);
        particleBurst(bestCol, best === 'legendary' ? 42 : 26);
        await wait(260);
      }

      if (!list.length) {
        dropsWrap.appendChild(el('div', 'sq-gacha-dropname', 'The box was empty.'));
      }
      for (let i = 0; i < list.length; i++) {
        const card = dropCard(list[i]);
        dropsWrap.appendChild(card);
        const rar = list[i] && list[i].rarity;
        if ((rar === 'epic' || rar === 'legendary') && !skipped) {
          particleBurst(rarityColor(rar), rar === 'legendary' ? 24 : 14);
        }
        if (i < list.length - 1) await wait(180);
      }

      await wait(isBig ? 1500 : 900);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-gacha] playOpening', err);
    } finally {
      stage.hidden = true;
      stage.textContent = '';
      skipWaiters.length = 0;
      skipped = false;
    }
  }

  // ---- opening ----------------------------------------------------------
  async function openBoxes(n) {
    if (busy) return;
    if (boxCount() < n) { showError(`You only have ${boxCount()} dark box(es).`); return; }
    busy = true;
    render();
    try {
      const res = await api.openBoxes(n);
      if (!res || !res.ok) {
        showError((res && res.error) || 'Could not open that.');
        return;
      }
      if (Number.isFinite(Number(res.pity))) lastPity = Number(res.pity);
      if (res.state) {
        state = res.state;
        const s = res.state;
        const p = s.player || {};
        const carried = [s.pity, s.boxPity, p.pity, p.boxPity]
          .find((c) => Number.isFinite(Number(c)));
        if (carried !== undefined) lastPity = Number(carried);
      }
      render();
      await playOpening(res.drops || []);
      render();
    } catch (err) {
      showError(String((err && err.message) || err));
    } finally {
      busy = false;
      render();
    }
  }

  btn1.addEventListener('click', () => { openBoxes(1); });
  btn5.addEventListener('click', () => { openBoxes(5); });

  function doOpen() { open = true; scrim.hidden = false; render(); }
  function doClose() { open = false; scrim.hidden = true; toast.hidden = true; }
  function toggle() { if (open) doClose(); else doOpen(); }

  xBtn.addEventListener('click', doClose);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) doClose(); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!stage.hidden) { doSkip(); return; }
    if (open) doClose();
  });

  render();

  return {
    setState,
    toggle,
    open: doOpen,
    close: doClose,
    isOpen: () => open,
    playOpening,
  };
}

export default createGacha;
