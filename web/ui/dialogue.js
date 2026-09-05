// web/ui/dialogue.js  [ENG-UI]
//
// THE DIALOGUE BOX — a flat white Nintendo-style box across the bottom of the
// screen, one line at a time, E to advance.
//
// Bruno, 2026-08-31: "can the dialogues be in boxes (white background, black
// text and borders) like in a nintendo 2d game? click e to pass the dialogue.
// the dialogue box rectangular in the centre bottom of the screen."
//
// Deliberately NOT part of the theme. Every other panel in this game is dark
// parchment-and-gold; this one is white with a black border because that is
// what it is imitating, and half-adopting the house style would land it
// somewhere between the two and look like neither. It is the only `.sq-dlg-*`
// surface, and it owns its own <style>.
//
// It sits OVER the world rather than inside the shop panel, because speaking to
// someone is not shopping — the shop only opens once the conversation is over,
// and for a vendor who refuses you it never opens at all.
//
// One box at a time. `show()` while a conversation is running REPLACES it: two
// stacked dialogue boxes is never the right answer, and the second speaker is
// always the more recent intent.

const STYLE_ID = 'sq-dlg-style';

/** Milliseconds per character. Fast enough not to be a wait, slow enough to read as typing. */
const TYPE_MS = 14;

const CSS = `
.sq-dlg-root {
  position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; justify-content: center; align-items: flex-end;
  /* Clear of the bottom dock ([Q] Quests / [Tab] Inventory) — the first pass
     let the box sit on top of it. */
  padding: 0 16px 58px;
  pointer-events: none;
  z-index: 60;
}
.sq-dlg-root[hidden] { display: none !important; }

/* The box. Rectangular, centred, bottom — white ground, black text, black
   border, and a second inset border for the double-ruled look those games use.
   No radius and no shadow on purpose. */
.sq-dlg-box {
  pointer-events: auto;
  width: min(760px, 100%);
  box-sizing: border-box;
  background: #fffdf7;
  color: #10100c;
  border: 4px solid #10100c;
  box-shadow: 0 0 0 3px #fffdf7 inset, 0 6px 0 rgba(0,0,0,.45);
  padding: 14px 18px 12px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  cursor: pointer;
  user-select: none;
}

/* The speaker's name, in a tab that sits on the top edge of the box. */
.sq-dlg-who {
  display: inline-block;
  margin: -26px 0 9px -8px;
  padding: 3px 10px 2px;
  background: #10100c; color: #fffdf7;
  font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
}
.sq-dlg-who[hidden] { display: none !important; }

.sq-dlg-text {
  font-size: 14px; line-height: 1.62;
  min-height: 3.24em;          /* two lines, so the box does not jump about */
  white-space: pre-wrap;
  word-break: break-word;
}
/* Stage direction — what he DOES — reads apart from what he SAYS. */
.sq-dlg-action { font-style: italic; color: #4a4636; }
/* THE OBJECTIVE. Italic, and set apart from both speech and stage direction:
   it is not something anyone said, it is what you are now doing. */
.sq-dlg-objective {
  font-style: italic;
  color: #10100c;
  border-left: 4px solid #10100c;
  padding-left: 12px;
}

.sq-dlg-foot {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 8px; padding-top: 7px;
  border-top: 2px solid #10100c;
  font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
}
.sq-dlg-count { color: #6b6656; }
.sq-dlg-more { color: #10100c; }
/* The blinking "there is more" caret, the one flourish. */
.sq-dlg-caret { animation: sq-dlg-blink 900ms steps(1, end) infinite; }
@keyframes sq-dlg-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .sq-dlg-caret { animation: none; }
}
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

function elem(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

/** A line in quotes is speech; anything else is stage direction. */
function isSpoken(line) {
  return /^[“"']/.test(String(line || '').trim());
}

export function createDialogue(mount) {
  injectStyle();

  const root = elem('div', 'sq-dlg-root');
  root.hidden = true;
  const box = elem('div', 'sq-dlg-box');
  const whoEl = elem('div', 'sq-dlg-who');
  whoEl.hidden = true;
  const textEl = elem('div', 'sq-dlg-text');
  const foot = elem('div', 'sq-dlg-foot');
  const countEl = elem('div', 'sq-dlg-count');
  const moreEl = elem('div', 'sq-dlg-more');
  foot.appendChild(countEl);
  foot.appendChild(moreEl);
  box.appendChild(whoEl);
  box.appendChild(textEl);
  box.appendChild(foot);
  root.appendChild(box);
  if (mount && mount.appendChild) mount.appendChild(root);

  let lines = [];
  let index = 0;
  let onDone = null;
  let open = false;
  /**
   * The quest objective, shown as the LAST panel of the conversation in
   * italics. Kept apart from `lines` rather than appended as one, because it is
   * not something the speaker says — it is what you are now doing, and it wants
   * its own look and its own place at the end.
   */
  let objective = null;
  /** The speaker's name, kept so the objective panel can swap the tab text. */
  let speaker = '';

  // Typewriter state. `typed` is how much of the current line is revealed;
  // when it reaches the line's length the line is finished.
  let typed = 0;
  let timer = null;

  function clearTimer() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  /** Every panel of the conversation: what he says, then the objective. */
  function panels() {
    return objective ? lines.concat([objective]) : lines;
  }
  function onObjective() {
    return !!objective && index === panels().length - 1;
  }
  function currentLine() {
    return String(panels()[index] || '');
  }

  function paint() {
    const line = currentLine();
    const total = panels().length;
    textEl.textContent = line.slice(0, typed);
    textEl.classList.toggle('sq-dlg-action', !isSpoken(line) && !onObjective());
    textEl.classList.toggle('sq-dlg-objective', onObjective());
    whoEl.textContent = onObjective() ? 'NEW OBJECTIVE' : (speaker || '');
    countEl.textContent = total > 1 ? `${index + 1} / ${total}` : '';
    const finishedLine = typed >= line.length;
    const last = index >= total - 1;
    moreEl.textContent = finishedLine
      ? (last ? 'E  close' : 'E  next')
      : 'E  skip';
    moreEl.classList.toggle('sq-dlg-caret', finishedLine);
  }

  function startTyping() {
    clearTimer();
    typed = 0;
    paint();
    const line = currentLine();
    if (!line.length) { typed = 0; paint(); return; }
    timer = setInterval(() => {
      typed += 1;
      if (typed >= line.length) { typed = line.length; clearTimer(); }
      paint();
    }, TYPE_MS);
  }

  /**
   * E, or a click on the box. Two-stage, the way those games do it: the first
   * press finishes the line being typed, the next moves on. Nobody should have
   * to wait for a typewriter they have already read.
   */
  function advance() {
    if (!open) return false;
    const line = currentLine();
    if (typed < line.length) {
      clearTimer();
      typed = line.length;
      paint();
      return true;
    }
    if (index < panels().length - 1) {
      index += 1;
      startTyping();
      return true;
    }
    close();
    return true;
  }

  function close() {
    if (!open) return;
    clearTimer();
    open = false;
    root.hidden = true;
    // Take the callback OFF before calling it: a handler that opens another
    // conversation must not be run twice, and `close()` is reachable from Esc,
    // from the last advance, and from a caller replacing the box.
    const done = onDone;
    onDone = null;
    lines = [];
    objective = null;
    index = 0;
    if (typeof done === 'function') {
      try { done(); } catch (err) {
        if (typeof console !== 'undefined') console.error('[sq-dlg] onDone', err);
      }
    }
  }

  /**
   * Start a conversation. `opts.name` is the speaker; `opts.onDone` runs when
   * the player has read the last line — that is where the shop panel opens.
   */
  function show(nextLines, opts) {
    const list = (Array.isArray(nextLines) ? nextLines : [nextLines])
      .map((l) => String(l == null ? '' : l))
      .filter((l) => l.length > 0);
    if (!list.length) {
      // Nothing to say is not a box with nothing in it — run the follow-up and
      // stay out of the way.
      const done = opts && opts.onDone;
      close();
      if (typeof done === 'function') done();
      return;
    }
    // Replacing a running conversation: drop the old one's callback rather than
    // firing it, or the previous speaker's follow-up lands on the new speaker.
    clearTimer();
    onDone = null;

    lines = list;
    objective = (opts && opts.objective) ? String(opts.objective) : null;
    index = 0;
    speaker = (opts && opts.name) ? String(opts.name) : '';
    whoEl.textContent = speaker;
    whoEl.hidden = !speaker && !objective;
    onDone = (opts && typeof opts.onDone === 'function') ? opts.onDone : null;
    open = true;
    root.hidden = false;
    startTyping();
  }

  box.addEventListener('click', (e) => { e.stopPropagation(); advance(); });

  /**
   * Tear the box down and ABANDON the conversation.
   *
   * Not `close()`: closing means the player read to the end, so it runs
   * `onDone` — which is what opens the vendor's counter. Leaving for the title
   * screen must not do that, or quitting mid-sentence pops a shop open behind
   * the menu. Anywhere the world goes away, this is the one to call.
   */
  function dismiss() {
    if (!open) return;
    onDone = null;
    close();
  }

  return {
    show,
    advance,
    close,
    dismiss,
    isOpen: () => open,
    /** Test seam: the full text of the line being shown, typed or not. */
    currentText: () => currentLine(),
    /** Test seam: how many lines this conversation has, and where we are. */
    progress: () => ({ index, total: lines.length }),
  };
}
