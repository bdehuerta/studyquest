// AGENT-B — web/world/player.js
// Smooth 8-direction movement with per-axis collision (so the scholar slides
// along walls instead of sticking), 2-frame walk animation, and a throttled
// move-commit callback for the server.

import { TILE, WORLD_W, WORLD_H } from '../../shared/constants.js';
import { SPRITES, drawSprite } from './sprites.js';

/** Tiles per second. */
export const PLAYER_SPEED = 4.5;
/** Collision box in sprite-local pixels — feet only, so heads overlap scenery. */
export const PLAYER_HITBOX = Object.freeze({ ox: 4, oy: 9, w: 8, h: 6 });
/** Minimum gap between onMoveCommit calls, ms. */
export const MOVE_COMMIT_MS = 400;

const FRAME_MS = 170;

/** Total length of a gathering swing. Movement input is ignored throughout. */
export const SWING_MS = 260;
/** How far into the swing the tool actually lands — feedback fires here. */
export const SWING_IMPACT_MS = 110;
/** Fraction of the swing spent winding up (frame 0) before the strike (frame 1). */
const SWING_WINDUP = 0.42;

const KEYS_LEFT = ['ArrowLeft', 'KeyA'];
const KEYS_RIGHT = ['ArrowRight', 'KeyD'];
const KEYS_UP = ['ArrowUp', 'KeyW'];
const KEYS_DOWN = ['ArrowDown', 'KeyS'];

/** True when the user is typing into a UI field — movement must be ignored then. */
export function isTypingTarget(el) {
  const t = el || (typeof document !== 'undefined' ? document.activeElement : null);
  if (!t || !t.tagName) return false;
  const tag = String(t.tagName).toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (t.isContentEditable) return true;
  return false;
}

/**
 * createInput(target) -> keyboard state machine.
 * Registers on `target` (default window) and can be disposed.
 */
export function createInput(target) {
  const el = target || (typeof window !== 'undefined' ? window : null);
  const down = new Set();
  const pressListeners = [];
  let disposed = false;

  function onDown(e) {
    if (disposed) return;
    if (isTypingTarget()) {
      down.clear();
      return;
    }
    if (!down.has(e.code)) {
      for (const fn of pressListeners) {
        try {
          fn(e.code, e);
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[input]', err);
        }
      }
    }
    down.add(e.code);
    // Stop the arrow keys / space from scrolling the page.
    if (
      e.code === 'Space' ||
      e.code.indexOf('Arrow') === 0 ||
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD'
    ) {
      if (e.preventDefault) e.preventDefault();
    }
  }
  function onUp(e) {
    down.delete(e.code);
  }
  function onBlur() {
    down.clear();
  }

  if (el && el.addEventListener) {
    el.addEventListener('keydown', onDown);
    el.addEventListener('keyup', onUp);
    el.addEventListener('blur', onBlur);
  }

  function any(codes) {
    for (const c of codes) if (down.has(c)) return true;
    return false;
  }

  return {
    isDown(code) {
      return down.has(code);
    },
    /** Normalised movement axis, zeroed while typing in a UI field. */
    axis() {
      if (isTypingTarget()) return { x: 0, y: 0 };
      let x = 0;
      let y = 0;
      if (any(KEYS_LEFT)) x -= 1;
      if (any(KEYS_RIGHT)) x += 1;
      if (any(KEYS_UP)) y -= 1;
      if (any(KEYS_DOWN)) y += 1;
      if (x && y) {
        const inv = Math.SQRT1_2;
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    /** cb(code, event) on the first frame a key goes down. */
    onPress(cb) {
      if (typeof cb === 'function') pressListeners.push(cb);
    },
    clear() {
      down.clear();
    },
    dispose() {
      disposed = true;
      down.clear();
      pressListeners.length = 0;
      if (el && el.removeEventListener) {
        el.removeEventListener('keydown', onDown);
        el.removeEventListener('keyup', onUp);
        el.removeEventListener('blur', onBlur);
      }
    },
  };
}

/**
 * createPlayer(tileX, tileY)
 * Position is stored as the world-pixel top-left of the 16x16 sprite.
 */
export function createPlayer(tileX, tileY) {
  const p = {
    px: (Number(tileX) || 0) * TILE,
    py: (Number(tileY) || 0) * TILE,
    dir: 'down',
    frame: 0,
    moving: false,
    animMs: 0,
    onMoveCommit: null,
    swinging: false,
    swingMs: 0,
    _lastCommitAt: -1e9,
    _lastCommitTile: null,
  };

  /** Begin a gathering swing in `dir` (defaults to the current facing). */
  p.startSwing = function startSwing(dir) {
    if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') p.dir = dir;
    p.swinging = true;
    p.swingMs = 0;
    p.moving = false;
    p.animMs = 0;
    p.frame = 0;
  };
  p.isSwinging = () => p.swinging;
  /** 0..1 progress through the current swing. */
  p.swingProgress = () => (p.swinging ? Math.min(1, p.swingMs / SWING_MS) : 0);
  p.cancelSwing = function cancelSwing() {
    p.swinging = false;
    p.swingMs = 0;
  };

  /** Tile directly in front of the scholar, in tile coords. */
  p.facingTile = function facingTile() {
    const x = p.tileX();
    const y = p.tileY();
    if (p.dir === 'left') return { x: x - 1, y };
    if (p.dir === 'right') return { x: x + 1, y };
    if (p.dir === 'up') return { x, y: y - 1 };
    return { x, y: y + 1 };
  };

  /**
   * Is her collision box standing on this tile RIGHT NOW?
   *
   * The world's blocked-test depends on where she is (the mountain's layer rule
   * asks which terrace she is standing on), so a tile can BECOME blocked under
   * her: step south off a ledge and the tile behind her — the one she is still
   * half standing in — turns into "you may not go up there". Her box overlaps
   * it, every move is refused, and she is welded in place until the save is
   * reloaded. The world uses this to exempt the ground she already occupies.
   */
  p.overlapsTile = function overlapsTile(tx, ty) {
    const x0 = p.px + PLAYER_HITBOX.ox;
    const y0 = p.py + PLAYER_HITBOX.oy;
    const x1 = x0 + PLAYER_HITBOX.w - 1;
    const y1 = y0 + PLAYER_HITBOX.h - 1;
    return tx >= Math.floor(x0 / TILE) && tx <= Math.floor(x1 / TILE)
      && ty >= Math.floor(y0 / TILE) && ty <= Math.floor(y1 / TILE);
  };

  /** The unit step she is facing: (-1,0), (1,0), (0,-1) or (0,1). */
  p.facingDelta = function facingDelta() {
    if (p.dir === 'left') return { x: -1, y: 0 };
    if (p.dir === 'right') return { x: 1, y: 0 };
    if (p.dir === 'up') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  };

  /** Centre of the collision box, in world pixels. */
  p.centerX = () => p.px + PLAYER_HITBOX.ox + PLAYER_HITBOX.w / 2;
  p.centerY = () => p.py + PLAYER_HITBOX.oy + PLAYER_HITBOX.h / 2;
  /** Y used for depth sorting — the feet. */
  p.sortY = () => p.py + TILE;
  p.tileX = () => Math.floor(p.centerX() / TILE);
  p.tileY = () => Math.floor(p.centerY() / TILE);

  /** Walking pace multiplier, 1 by default. Set by the world from worn charms. */
  p.speedMult = 1;

  p.setTile = function setTile(tx, ty) {
    p.px = (Number(tx) || 0) * TILE;
    p.py = (Number(ty) || 0) * TILE;
    p._lastCommitTile = p.tileX() + ',' + p.tileY();
  };

  function boxBlocked(nx, ny, isBlocked) {
    const x0 = nx + PLAYER_HITBOX.ox;
    const y0 = ny + PLAYER_HITBOX.oy;
    const x1 = x0 + PLAYER_HITBOX.w - 1;
    const y1 = y0 + PLAYER_HITBOX.h - 1;
    if (x0 < 0 || y0 < 0) return true;
    if (x1 >= WORLD_W * TILE || y1 >= WORLD_H * TILE) return true;
    const tx0 = Math.floor(x0 / TILE);
    const ty0 = Math.floor(y0 / TILE);
    const tx1 = Math.floor(x1 / TILE);
    const ty1 = Math.floor(y1 / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isBlocked(tx, ty)) return true;
      }
    }
    return false;
  }

  /**
   * update(dtMs, input, isBlocked, nowMs)
   * isBlocked(tileX, tileY) -> boolean (solid terrain OR a building footprint).
   */
  p.update = function update(dtMs, input, isBlocked, nowMs) {
    const dt = Math.min(50, Math.max(0, dtMs || 0)) / 1000;
    const blocked = typeof isBlocked === 'function' ? isBlocked : () => false;

    // A swing locks the scholar in place: input is read but discarded, so a
    // held key does not queue up a lurch when the animation ends.
    if (p.swinging) {
      p.swingMs += dtMs || 0;
      if (p.swingMs >= SWING_MS) {
        p.swinging = false;
        p.swingMs = 0;
      }
      p.moving = false;
      p.animMs = 0;
      p.frame = 0;
      return;
    }

    const ax = input && input.axis ? input.axis() : { x: 0, y: 0 };
    // A worn charm can make the scholar quicker. Read off the player rather
    // than baked in, so the world can set it from state and this module stays
    // ignorant of charms.
    const mult = Number(p.speedMult) > 0 ? Number(p.speedMult) : 1;
    const speed = PLAYER_SPEED * TILE * mult;
    const dx = ax.x * speed * dt;
    const dy = ax.y * speed * dt;

    // Per-axis resolution => sliding along walls rather than sticking on them.
    if (dx !== 0) {
      const nx = p.px + dx;
      if (!boxBlocked(nx, p.py, blocked)) p.px = nx;
      else {
        // Nudge flush against the obstacle so there is no visible gap.
        const step = dx > 0 ? 1 : -1;
        let guard = Math.ceil(Math.abs(dx)) + 1;
        while (guard-- > 0 && !boxBlocked(p.px + step, p.py, blocked)) p.px += step;
      }
    }
    if (dy !== 0) {
      const ny = p.py + dy;
      if (!boxBlocked(p.px, ny, blocked)) p.py = ny;
      else {
        const step = dy > 0 ? 1 : -1;
        let guard = Math.ceil(Math.abs(dy)) + 1;
        while (guard-- > 0 && !boxBlocked(p.px, p.py + step, blocked)) p.py += step;
      }
    }

    p.moving = ax.x !== 0 || ax.y !== 0;
    if (p.moving) {
      if (Math.abs(ax.x) > Math.abs(ax.y)) p.dir = ax.x < 0 ? 'left' : 'right';
      else p.dir = ax.y < 0 ? 'up' : 'down';
      p.animMs += dtMs || 0;
      if (p.animMs >= FRAME_MS) {
        p.animMs -= FRAME_MS;
        p.frame = p.frame ? 0 : 1;
      }
    } else {
      p.animMs = 0;
      p.frame = 0;
    }

    // Throttled commit — at most every MOVE_COMMIT_MS, and only on tile change.
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const key = p.tileX() + ',' + p.tileY();
    if (p._lastCommitTile === null) p._lastCommitTile = key;
    if (key !== p._lastCommitTile && now - p._lastCommitAt >= MOVE_COMMIT_MS) {
      p._lastCommitTile = key;
      p._lastCommitAt = now;
      if (typeof p.onMoveCommit === 'function') {
        try {
          p.onMoveCommit(p.tileX(), p.tileY());
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[player] onMoveCommit', err);
        }
      }
    }
  };

  /**
   * draw(ctx, camX, camY, scale)
   *
   * `camX`/`camY` are in WORLD pixels and are NOT necessarily integers — the
   * renderer snaps the camera to the screen-pixel grid (a multiple of 1/scale),
   * not the world-pixel grid. Round ONCE, here, in screen space.
   *
   * The old form was `(Math.round(p.px) - camX) * scale`, which rounded the
   * player and the camera independently. Two smoothly-moving values rounded
   * apart makes their difference oscillate by a pixel as they cross rounding
   * boundaries at different times — the vibration you could feel while walking.
   */
  p.draw = function draw(ctx, camX, camY, scale, opts) {
    // `still` freezes the walk cycle and `shadow:false` drops the contact
    // shadow — both for the boat, where the legs are hidden behind the hull and
    // there is no ground to cast onto. Options rather than a `riding` flag: the
    // player module knows nothing about boats and should keep it that way.
    const still = !!(opts && opts.still);
    const wantShadow = !(opts && opts.shadow === false);
    let set;
    let idx;
    if (p.swinging) {
      const swing = SPRITES.player && SPRITES.player.swing;
      set = (swing && (swing[p.dir] || swing.down)) || null;
      idx = p.swingMs / SWING_MS < SWING_WINDUP ? 0 : 1;
      // Missing swing art must never blank the character out.
      if (!set) {
        set = (SPRITES.player && SPRITES.player[p.dir]) || SPRITES.player.down;
        idx = 1;
      }
    } else {
      set = (SPRITES.player && SPRITES.player[p.dir]) || SPRITES.player.down;
      idx = p.moving && !still ? p.frame : 0;
    }
    const spr = set && set[idx];
    const sx = Math.round((p.px - camX) * scale);
    const sy = Math.round((p.py - camY) * scale);
    // Soft contact shadow so the sprite sits on the ground.
    if (ctx && wantShadow) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#0d0f16';
      ctx.fillRect(sx + 4 * scale, sy + 13 * scale, 8 * scale, 2 * scale);
      ctx.globalAlpha = prev;
    }
    drawSprite(ctx, spr, sx, sy, scale);
  };

  return p;
}

export default createPlayer;
