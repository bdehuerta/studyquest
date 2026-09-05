// The in-game pause box. Deliberately small and quiet: Esc is pressed often and
// mid-play, so it must not take over the screen the way the title menu does.
// Leaving to the title screen is an explicit choice here, never a side effect.

import { PALETTE_V3 as P } from '../shared/constants.js';

const STYLE_ID = 'sq-pause-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-pause-scrim {
  position: fixed; inset: 0; z-index: 120; display: none;
  background: rgba(12,9,20,0.55);
  align-items: center; justify-content: center;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.sq-pause-scrim[data-open="1"] { display: flex; }
.sq-pause-box {
  width: 300px; background: ${P.slate};
  border: 3px solid ${P.gold}; box-shadow: 0 0 0 3px ${P.ink}, 6px 6px 0 rgba(0,0,0,0.45);
  padding: 0 0 16px; animation: sq-pause-in 120ms ease-out;
}
@keyframes sq-pause-in { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }
.sq-pause-head {
  background: ${P.ink}; border-bottom: 2px solid ${P.goldDeep};
  padding: 10px 14px; color: ${P.gold};
  font-size: 12px; letter-spacing: 0.22em; text-align: center;
}
.sq-pause-body { padding: 16px 18px 0; display: grid; gap: 8px; }
.sq-pause-btn {
  font: inherit; font-size: 12px; letter-spacing: 0.1em; cursor: pointer;
  color: ${P.parchment}; background: ${P.slateLight};
  border: 2px solid ${P.goldDeep}; padding: 10px 12px; text-align: center;
  transition: background 90ms linear, color 90ms linear;
}
.sq-pause-btn:hover { background: ${P.gold}; color: ${P.ink}; }
.sq-pause-btn:active { transform: translate(1px, 1px); }
.sq-pause-btn.sq-pause-quit { border-color: ${P.pyro}; color: ${P.pyro}; }
.sq-pause-btn.sq-pause-quit:hover { background: ${P.pyro}; color: ${P.ink}; }
.sq-pause-note {
  margin-top: 12px; text-align: center; font-size: 10px; color: ${P.textDim};
  letter-spacing: 0.06em;
}
.sq-pause-note.sq-pause-note-warn { color: ${P.pyro}; }
.sq-pause-btn.sq-pause-go { border-color: ${P.good}; color: ${P.good}; }
.sq-pause-btn.sq-pause-go:hover { background: ${P.good}; color: ${P.ink}; }
.sq-pause-btn:disabled { opacity: .5; cursor: default; }
.sq-pause-btn:disabled:hover { background: ${P.slateLight}; color: ${P.parchment}; }
/* The unsaved-exit warning replaces the buttons rather than stacking on top of
   them: a second box over the first is how a misclick becomes a lost save. */
/* An element with an explicit display value ignores the hidden attribute, which
   is how the warning ended up drawn under the buttons it was meant to replace.
   This project has shipped that exact bug before (see .sq-launch-stage). */
.sq-pause-scrim [hidden] { display: none !important; }
.sq-pause-warn { display: grid; gap: 8px; }
.sq-pause-warntext {
  font-size: 11px; line-height: 1.5; color: ${P.pyro};
  border-left: 3px solid ${P.pyro}; padding: 8px 10px; margin-bottom: 4px;
  background: rgba(0,0,0,0.25); letter-spacing: 0.04em; text-align: left;
}
`;
  document.head.appendChild(s);
}

export function createPause(root) {
  injectStyle();

  const scrim = document.createElement('div');
  scrim.className = 'sq-pause-scrim';
  const box = document.createElement('div');
  box.className = 'sq-pause-box';

  const head = document.createElement('div');
  head.className = 'sq-pause-head';
  head.textContent = 'PAUSED';
  box.appendChild(head);

  const body = document.createElement('div');
  body.className = 'sq-pause-body';
  box.appendChild(body);

  const cbs = { resume: null, quit: null, options: null, save: null };

  // When the game last actually wrote to disk. The integration layer sets this
  // on every successful save; 0 means "not since this box was created".
  let lastSavedAt = 0;

  // How stale a save may be before leaving asks about it. Bruno: "every time
  // you exit without saving in the previous 30 seconds a warning message
  // should appear telling you to save."
  const STALE_MS = 30000;

  function button(label, cls, key) {
    const b = document.createElement('button');
    b.className = 'sq-pause-btn' + (cls ? ' ' + cls : '');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      // SAVE and QUIT have their own handlers attached below — `save` writes,
      // and `quit` has to check staleness first.
      if (key === 'save') return;
      if (key === 'quit') {
        const secs = lastSavedAt ? Math.round((Date.now() - lastSavedAt) / 1000) : null;
        if (secs === null || secs > STALE_MS / 1000) {
          showWarning(secs === null ? '30+' : secs);
          return;
        }
      }
      const fn = cbs[key];
      if (typeof fn === 'function') { try { fn(); } catch (err) { console.error('[sq-pause]', err); } }
    });
    body.appendChild(b);
    return b;
  }

  const resumeBtn = button('RESUME', '', 'resume');
  const saveBtn = button('SAVE GAME', 'sq-pause-go', 'save');
  const settingsBtn = button('SETTINGS', '', 'options');
  const quitBtn = button('QUIT TO MENU', 'sq-pause-quit', 'quit');

  const note = document.createElement('div');
  note.className = 'sq-pause-note';
  body.appendChild(note);

  /** "just now" / "2 min ago" for the last write. */
  function sinceText() {
    if (!lastSavedAt) return 'progress saves automatically';
    const secs = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
    if (secs < 5) return 'saved just now';
    if (secs < 60) return `saved ${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `saved ${mins} min ago`;
  }

  function paintNote() {
    const stale = lastSavedAt > 0 && Date.now() - lastSavedAt > STALE_MS;
    note.textContent = sinceText();
    note.classList.toggle('sq-pause-note-warn', stale);
  }

  // --- the unsaved-exit warning -------------------------------------------
  // Built once, swapped in place of the buttons. No alert()/confirm(): a native
  // dialog blocks the page and there is a standing rule against them.
  const warn = document.createElement('div');
  warn.className = 'sq-pause-warn';
  warn.hidden = true;
  const warnText = document.createElement('div');
  warnText.className = 'sq-pause-warntext';
  warn.appendChild(warnText);

  function warnButton(label, cls, fn) {
    const b = document.createElement('button');
    b.className = 'sq-pause-btn' + (cls ? ' ' + cls : '');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fn);
    warn.appendChild(b);
    return b;
  }

  const mainButtons = [resumeBtn, saveBtn, settingsBtn, quitBtn, note];

  function showMain() {
    warn.hidden = true;
    for (const n of mainButtons) n.hidden = false;
    paintNote();
  }

  function showWarning(secs) {
    warnText.textContent =
      `You have not saved for ${secs}s. Anything since then is only in this session — `
      + 'save before you leave, or leave it behind.';
    for (const n of mainButtons) n.hidden = true;
    warn.hidden = false;
  }

  async function doSave() {
    const fn = cbs.save;
    if (typeof fn !== 'function') return false;
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING…';
    let okd = false;
    try { okd = (await fn()) !== false; } catch (err) { console.error('[sq-pause] save', err); }
    saveBtn.disabled = false;
    saveBtn.textContent = okd ? 'SAVED' : 'SAVE FAILED';
    setTimeout(() => { saveBtn.textContent = 'SAVE GAME'; }, 1400);
    paintNote();
    return okd;
  }

  saveBtn.addEventListener('click', doSave);

  warnButton('SAVE AND QUIT', 'sq-pause-go', async () => {
    const okd = await doSave();
    // A failed save must not be followed by leaving anyway — that is the one
    // outcome the warning exists to prevent.
    if (!okd) { warnText.textContent = 'The save did not go through. Try again before leaving.'; return; }
    showMain();
    if (typeof cbs.quit === 'function') cbs.quit();
  });
  warnButton('QUIT WITHOUT SAVING', 'sq-pause-quit', () => {
    showMain();
    if (typeof cbs.quit === 'function') cbs.quit();
  });
  warnButton('BACK', '', showMain);

  body.appendChild(warn);

  scrim.appendChild(box);
  // Clicking the dimmed area is the same as resuming — a misclick should never
  // throw you out of the world.
  scrim.addEventListener('mousedown', (e) => {
    if (e.target !== scrim) return;
    const fn = cbs.resume;
    if (typeof fn === 'function') fn();
  });

  (root || document.body).appendChild(scrim);

  let open = false;
  showMain();
  return {
    // Always reopens on the buttons, never on a warning left over from last
    // time — Esc should show the same box every time it is pressed.
    open() { open = true; scrim.dataset.open = '1'; showMain(); },
    close() { open = false; delete scrim.dataset.open; showMain(); },
    isOpen: () => open,
    /** ms timestamp of the last successful write, from the integration layer. */
    setSavedAt(ts) { lastSavedAt = Number(ts) || 0; paintNote(); },
    set onResume(fn) { cbs.resume = fn; },
    set onQuitToMenu(fn) { cbs.quit = fn; },
    set onOptions(fn) { cbs.options = fn; },
    /** fn() -> Promise<boolean>. Must resolve false if the write failed. */
    set onSave(fn) { cbs.save = fn; },
  };
}
