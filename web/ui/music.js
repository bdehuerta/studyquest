// web/ui/music.js  [ENG-UI]
//
// MENU MUSIC. Loops while either launch screen is up — the title and the save
// list — and stops the moment the world starts.
//
// Bruno, 2026-08-31: "play it in a loop when the menu is open only. no music
// when you enter the actual game."
//
// THE AUTOPLAY PROBLEM, and why this is not just `audio.play()`.
//
// Browsers refuse to start audible playback before the user has interacted with
// the page, and the menu is the FIRST thing on screen — there has been no click
// yet. `play()` therefore rejects, silently, on the very screen the music is
// for. So: try immediately, and if the browser says no, arm a one-shot listener
// and start on the first click or keypress instead. The player presses PLAY
// within seconds of arriving, so in practice the music starts then.
//
// The native shell is not exempt: WKWebView applies the same rule unless the
// host opts out, so the fallback matters there too.
//
// Volume is deliberately low. This plays under a menu, not over it.

const SRC = '/web/audio/menu.mp3';
/** Default gain, 0..1. Mirrored by DEFAULT_MUSIC_VOLUME in ui/launch.js. */
const VOLUME = 0.34;
/** Where the launch settings are kept. Read directly rather than imported so
 *  this module has no dependency on the menu it plays under. */
const SETTINGS_KEY = 'sq.settings.v3';
/** How long to fade in and out, ms. A hard cut on a loop reads as a glitch. */
const FADE_MS = 420;

/**
 * The saved volume, 0..1. Read straight from localStorage: the settings sheet
 * is the only writer, and importing it here would make the music depend on the
 * menu rather than the other way round.
 */
function savedVolume() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return VOLUME;
    const parsed = JSON.parse(raw);
    const v = parsed && Number(parsed.musicVolume);
    if (!Number.isFinite(v)) return VOLUME;
    return Math.max(0, Math.min(1, v / 100));
  } catch (err) {
    return VOLUME;
  }
}

export function createMusic() {
  let audio = null;
  let wantPlaying = false;
  let armed = false;
  let fade = null;
  /** Current target gain. Changed live by the settings slider. */
  let gain = savedVolume();

  // The slider dispatches on every drag, so the change is HEARD while it is
  // being made. A volume control you cannot hear until you let go is a guess.
  if (typeof window !== 'undefined') {
    window.addEventListener('sq-music-volume', (e) => {
      const v = e && e.detail && Number(e.detail.volume);
      if (!Number.isFinite(v)) return;
      gain = Math.max(0, Math.min(1, v / 100));
      // Set outright rather than ramped: this IS the player moving the volume,
      // and a fade would lag the thumb.
      clearFade();
      const a = audio;
      if (a && wantPlaying) { try { a.volume = gain; } catch (err) { /* detached */ } }
    });
  }

  function ensure() {
    if (audio || typeof Audio === 'undefined') return audio;
    try {
      audio = new Audio(SRC);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
    } catch (err) {
      audio = null;
    }
    return audio;
  }

  function clearFade() {
    if (fade !== null) { clearInterval(fade); fade = null; }
  }

  /** Ramp the volume, and optionally pause once it reaches zero. */
  function rampTo(target, thenPause) {
    const a = ensure();
    if (!a) return;
    clearFade();
    const from = a.volume;
    const started = Date.now();
    fade = setInterval(() => {
      const k = Math.min(1, (Date.now() - started) / FADE_MS);
      try { a.volume = from + (target - from) * k; } catch (err) { /* detached */ }
      if (k >= 1) {
        clearFade();
        if (thenPause) { try { a.pause(); } catch (err) { /* already gone */ } }
      }
    }, 30);
  }

  /**
   * Arm a one-shot "start on first interaction" listener. Only ever armed when
   * the browser has actually refused, so a page that allows autoplay never adds
   * listeners it does not need.
   */
  function armFirstGesture() {
    if (armed || typeof window === 'undefined') return;
    armed = true;
    const go = () => {
      window.removeEventListener('pointerdown', go, true);
      window.removeEventListener('keydown', go, true);
      armed = false;
      if (wantPlaying) start();
    };
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
  }

  function start() {
    wantPlaying = true;
    // Re-read on every open: the slider writes to localStorage, and the menu
    // can be reopened after a change without this module being rebuilt.
    gain = savedVolume();
    const a = ensure();
    if (!a) return;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => rampTo(gain, false), () => armFirstGesture());
    } else {
      rampTo(gain, false);
    }
  }

  function stop() {
    wantPlaying = false;
    const a = audio;
    if (!a) return;
    rampTo(0, true);
  }

  return {
    /** The menu is on screen. */
    start,
    /** The world is starting, or the page is going away. */
    stop,
    /** Test seam: is it meant to be playing, and is it actually? */
    probe: () => ({
      wanted: wantPlaying,
      playing: !!(audio && !audio.paused),
      volume: audio ? audio.volume : 0,
      gain,
      src: SRC,
    }),
  };
}

export default createMusic;
