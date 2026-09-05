// AGENT-B — web/world/build.js
// Build mode: a translucent ghost of the chosen building follows the mouse
// (snapped to tiles), green where placement is legal and red where it is not.
// ALL placement-legality logic lives here; world.js reuses it.

import {
  TILE,
  WORLD_W,
  WORLD_H,
  SOLID_TILES,
  BUILDING_FOOTPRINT,
  PALETTE,
} from '../../shared/constants.js';
import { buildingSprite, drawSpriteGhost } from './sprites.js';

const SOLID = new Set(SOLID_TILES);

export const LEGAL_COLOR = PALETTE.good || '#5ad18a';
export const ILLEGAL_COLOR = PALETTE.bad || '#ff6b6b';

/** Footprint in tiles for a building id (defensive default 1x1). */
export function footprintOf(buildingId) {
  const f = BUILDING_FOOTPRINT[buildingId];
  return f ? { w: f.w, h: f.h } : { w: 1, h: 1 };
}

/** Tile rect { x, y, w, h } occupied by a placed building record. */
export function buildingRect(b) {
  if (!b) return null;
  const f = footprintOf(b.buildingId);
  return { x: b.x | 0, y: b.y | 0, w: f.w, h: f.h };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** True if (x,y) is a solid terrain tile. Out of bounds counts as solid. */
export function isSolidTile(world, x, y) {
  if (!world || !world.tiles) return false;
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return true;
  return SOLID.has(world.tiles[y * world.w + x]);
}

/** True if any existing building covers tile (x, y). */
export function buildingAt(buildings, x, y) {
  const list = Array.isArray(buildings) ? buildings : [];
  for (const b of list) {
    const r = buildingRect(b);
    if (!r) continue;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return b;
  }
  return null;
}

/**
 * checkPlacement(world, buildings, buildingId, x, y, solidFn) -> { ok, reason }
 * Illegal = out of bounds, overlapping a solid tile, or overlapping a building.
 * `solidFn(x, y)` is an optional solidity override — world.js passes one that
 * knows about harvested nodes, so a stump can be built over but a live tree
 * cannot. Omitted, it falls back to raw terrain solidity.
 */
export function checkPlacement(world, buildings, buildingId, x, y, solidFn) {
  const solid =
    typeof solidFn === 'function' ? solidFn : (sx, sy) => isSolidTile(world, sx, sy);
  const f = footprintOf(buildingId);
  const tx = Math.round(Number(x) || 0);
  const ty = Math.round(Number(y) || 0);
  if (!buildingId) return { ok: false, reason: 'no building selected' };
  if (tx < 0 || ty < 0 || tx + f.w > WORLD_W || ty + f.h > WORLD_H) {
    return { ok: false, reason: 'outside the world' };
  }
  for (let dy = 0; dy < f.h; dy++) {
    for (let dx = 0; dx < f.w; dx++) {
      if (solid(tx + dx, ty + dy)) {
        return { ok: false, reason: 'blocked terrain' };
      }
    }
  }
  const rect = { x: tx, y: ty, w: f.w, h: f.h };
  const list = Array.isArray(buildings) ? buildings : [];
  for (const b of list) {
    const r = buildingRect(b);
    if (r && rectsOverlap(rect, r)) return { ok: false, reason: 'something is already here' };
  }
  return { ok: true, reason: '' };
}

/** Boolean convenience wrapper around checkPlacement. */
export function canPlace(world, buildings, buildingId, x, y, solidFn) {
  return checkPlacement(world, buildings, buildingId, x, y, solidFn).ok;
}

/**
 * createBuildMode({ getWorld, getBuildings, isSolid })
 * The host (world.js) feeds it a cursor position and confirm/cancel intents.
 * `isSolid(x, y)` is optional and overrides terrain solidity (see checkPlacement).
 */
export function createBuildMode(deps) {
  const getWorld = (deps && deps.getWorld) || (() => null);
  const getBuildings = (deps && deps.getBuildings) || (() => []);
  const solidFn = deps && typeof deps.isSolid === 'function' ? deps.isSolid : null;

  const mode = {
    active: false,
    buildingId: null,
    tx: 0,
    ty: 0,
    ok: false,
    reason: '',
    onPlace: null, // fn(buildingId, x, y)
    onCancel: null,
    onReject: null, // fn(reason) — host can toast it
  };

  function revalidate() {
    if (!mode.active) {
      mode.ok = false;
      mode.reason = '';
      return;
    }
    const r = checkPlacement(
      getWorld(), getBuildings(), mode.buildingId, mode.tx, mode.ty, solidFn
    );
    mode.ok = r.ok;
    mode.reason = r.reason;
  }

  return {
    isActive() {
      return mode.active;
    },
    buildingId() {
      return mode.buildingId;
    },
    tile() {
      return { x: mode.tx, y: mode.ty };
    },
    legal() {
      return mode.ok;
    },
    reason() {
      return mode.reason;
    },

    enter(buildingId, atTile) {
      mode.active = true;
      mode.buildingId = buildingId;
      if (atTile) {
        const f = footprintOf(buildingId);
        mode.tx = Math.round(atTile.x - (f.w - 1) / 2);
        mode.ty = Math.round(atTile.y - (f.h - 1) / 2);
      }
      revalidate();
    },
    exit() {
      mode.active = false;
      mode.buildingId = null;
      mode.ok = false;
    },

    /** Centre the ghost on a world-pixel cursor position. */
    setCursorWorld(wx, wy) {
      if (!mode.active) return;
      const f = footprintOf(mode.buildingId);
      mode.tx = Math.round(wx / TILE - f.w / 2);
      mode.ty = Math.round(wy / TILE - f.h / 2);
      revalidate();
    },
    /** Place the ghost by its top-left tile directly. */
    setTile(tx, ty) {
      if (!mode.active) return;
      mode.tx = Math.round(tx) | 0;
      mode.ty = Math.round(ty) | 0;
      revalidate();
    },
    nudge(dx, dy) {
      if (!mode.active) return;
      mode.tx += dx | 0;
      mode.ty += dy | 0;
      revalidate();
    },

    /** Confirm. Returns true if onPlace fired. */
    confirm() {
      if (!mode.active) return false;
      revalidate();
      if (!mode.ok) {
        if (typeof mode.onReject === 'function') {
          try {
            mode.onReject(mode.reason);
          } catch (err) {
            if (typeof console !== 'undefined') console.error('[build] onReject', err);
          }
        }
        return false;
      }
      const id = mode.buildingId;
      const x = mode.tx;
      const y = mode.ty;
      mode.active = false;
      mode.buildingId = null;
      if (typeof mode.onPlace === 'function') {
        try {
          mode.onPlace(id, x, y);
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[build] onPlace', err);
        }
      }
      return true;
    },

    cancel() {
      if (!mode.active) return false;
      mode.active = false;
      mode.buildingId = null;
      mode.ok = false;
      if (typeof mode.onCancel === 'function') {
        try {
          mode.onCancel();
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[build] onCancel', err);
        }
      }
      return true;
    },

    set onPlace(fn) {
      mode.onPlace = fn;
    },
    get onPlace() {
      return mode.onPlace;
    },
    set onCancel(fn) {
      mode.onCancel = fn;
    },
    get onCancel() {
      return mode.onCancel;
    },
    set onReject(fn) {
      mode.onReject = fn;
    },
    get onReject() {
      return mode.onReject;
    },

    /**
     * draw(ctx, camX, camY, scale) — `cam` is in world pixels and may be
     * fractional: the renderer snaps it to the screen-pixel grid. Round once,
     * in screen space, exactly as player.draw does.
     */
    draw(ctx, camX, camY, scale) {
      if (!mode.active || !ctx) return;
      revalidate();
      const f = footprintOf(mode.buildingId);
      const spr = buildingSprite(mode.buildingId);
      const sx = Math.round((mode.tx * TILE - camX) * scale);
      const sy = Math.round((mode.ty * TILE - camY) * scale);
      const tint = mode.ok ? LEGAL_COLOR : ILLEGAL_COLOR;

      drawSpriteGhost(ctx, spr, sx, sy, scale, tint, 0.55);

      // Footprint wash + a 1-tile grid outline.
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = tint;
      ctx.fillRect(sx, sy, f.w * TILE * scale, f.h * TILE * scale);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = tint;
      const t = TILE * scale;
      const line = Math.max(1, scale);
      for (let gy = 0; gy <= f.h; gy++) {
        ctx.fillRect(sx, sy + gy * t - (gy === f.h ? line : 0), f.w * t, line);
      }
      for (let gx = 0; gx <= f.w; gx++) {
        ctx.fillRect(sx + gx * t - (gx === f.w ? line : 0), sy, line, f.h * t);
      }
      ctx.globalAlpha = prev;
    },
  };
}

export default createBuildMode;
