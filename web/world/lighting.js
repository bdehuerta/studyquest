// ENG-WORLD — web/world/lighting.js
// The atmosphere layer. Sprites carry their own baked top-left lighting (see
// the rasteriser in sprites.js); this module supplies everything that has to
// change per frame or per position:
//
//   - a static sun/shade field that decides which colour temperature each
//     patch of ground is authored in (stable, so tiles never pop),
//   - slow drifting cloud shadows over the top of it (moving, so the meadow
//     breathes),
//   - ambient occlusion where anything solid meets the ground — the single
//     change that stops sprites looking pasted on,
//   - contact shadows under objects and the player,
//   - a travelling specular on water,
//   - drifting light motes,
//   - warm pooled light from lamp posts and lanterns,
//   - a gentle global grade: warm toward the sun, cool away from it.
//
// Everything here is plain canvas 2D. No libraries, no images.

import { TILE } from '../../shared/constants.js';

export const SUN = '#fff3d0';
export const SHADE = '#4a3f6b';
/** The sun sits up and to the left, and every module agrees on that. */
export const SUN_VEC = Object.freeze({ x: -1, y: -1 });

/* ------------------------------------------------------------------ *
 * Noise — the same hand-written value noise the worldgen uses, kept local
 * so the lighting field does not depend on worldgen internals.
 * ------------------------------------------------------------------ */

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function vnoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}
function fbm2(x, y, seed) {
  return (
    vnoise(x, y, seed) * 0.6 +
    vnoise(x * 2.1, y * 2.1, seed + 977) * 0.28 +
    vnoise(x * 4.3, y * 4.3, seed + 1931) * 0.12
  );
}

/* ------------------------------------------------------------------ *
 * The static sun field
 * ------------------------------------------------------------------ */

const SUN_SEED = 8123;

/**
 * groundTier(tx, ty) -> 'shade' | 'mid' | 'sun'
 * Broad, stable patches of sunlight and shadow across the map. Static on
 * purpose: if this drifted, every tile at a boundary would visibly pop from
 * one authored variant to another. The *moving* light is the cloud layer.
 */
export function groundTier(tx, ty) {
  const n = fbm2(tx * 0.055, ty * 0.055, SUN_SEED);
  if (n < 0.44) return 'shade';
  if (n > 0.565) return 'sun';
  return 'mid';
}

/* ------------------------------------------------------------------ *
 * Cloud shadows — rendered tiny and upscaled with smoothing ON, which is
 * the only smoothed draw in the whole game and the cheapest way to get a
 * genuinely soft shadow out of a pixel renderer.
 * ------------------------------------------------------------------ */

const CLOUD_CELL = 24; // world px per cloud sample

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') {
    try {
      return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    } catch (_) {
      /* fall through */
    }
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  }
  return null;
}

export function createLighting() {
  let cloudCv = null;
  let cloudCtx = null;
  let cloudW = 0;
  let cloudH = 0;
  const motes = [];

  function ensureCloud(w, h) {
    if (cloudCv && cloudW === w && cloudH === h) return true;
    cloudCv = makeCanvas(w, h);
    if (!cloudCv) return false;
    cloudCtx = cloudCv.getContext('2d');
    if (!cloudCtx) {
      cloudCv = null;
      return false;
    }
    cloudW = w;
    cloudH = h;
    return true;
  }

  /**
   * Drifting cloud shadow over the whole viewport. Two layers moving at
   * different speeds so the sky does not read as one sliding sheet.
   */
  function drawCloudShadows(ctx, camX, camY, viewW, viewH, S, timeMs) {
    const cw = Math.ceil(viewW / CLOUD_CELL) + 2;
    const ch = Math.ceil(viewH / CLOUD_CELL) + 2;
    if (!ensureCloud(cw, ch)) return;
    const t = timeMs / 1000;
    const ox = Math.floor(camX / CLOUD_CELL);
    const oy = Math.floor(camY / CLOUD_CELL);
    const img = cloudCtx.createImageData(cw, ch);
    const data = img.data;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const wx = (x + ox) * 0.11;
        const wy = (y + oy) * 0.11;
        const a = fbm2(wx - t * 0.035, wy - t * 0.018, 4211);
        const b = fbm2(wx * 0.5 + t * 0.02, wy * 0.5 + t * 0.012, 9007);
        const n = a * 0.65 + b * 0.35;
        // Only the darker half of the field becomes shadow; the bright half
        // becomes a faint warm lift, so the ground looks dappled, not dirty.
        const i = (y * cw + x) * 4;
        if (n < 0.47) {
          const k = Math.min(1, (0.47 - n) * 4.2);
          data[i] = 0x3a;
          data[i + 1] = 0x2f;
          data[i + 2] = 0x5c;
          data[i + 3] = Math.round(k * 58);
        } else if (n > 0.56) {
          const k = Math.min(1, (n - 0.56) * 4.2);
          data[i] = 0xff;
          data[i + 1] = 0xf3;
          data[i + 2] = 0xd0;
          data[i + 3] = Math.round(k * 34);
        } else {
          data[i + 3] = 0;
        }
      }
    }
    cloudCtx.putImageData(img, 0, 0);
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    const dx = -((camX % CLOUD_CELL) + CLOUD_CELL) % CLOUD_CELL;
    const dy = -((camY % CLOUD_CELL) + CLOUD_CELL) % CLOUD_CELL;
    ctx.drawImage(
      cloudCv,
      Math.round(dx * S),
      Math.round(dy * S),
      Math.round(cw * CLOUD_CELL * S),
      Math.round(ch * CLOUD_CELL * S)
    );
    ctx.imageSmoothingEnabled = prevSmooth;
  }

  /* ---------------- motes ---------------- */

  function updateMotes(dtMs, camX, camY, viewW, viewH) {
    const want = 34;
    while (motes.length < want) {
      motes.push({
        x: camX + Math.random() * viewW,
        y: camY + Math.random() * viewH,
        vx: 0.06 + Math.random() * 0.14,
        vy: -0.02 - Math.random() * 0.07,
        phase: Math.random() * Math.PI * 2,
        size: Math.random() < 0.22 ? 2 : 1,
        life: 0,
        max: 6000 + Math.random() * 9000,
      });
    }
    const k = dtMs / 16.6667;
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.life += dtMs;
      m.x += m.vx * k;
      m.y += m.vy * k;
      m.phase += 0.03 * k;
      const out =
        m.life > m.max ||
        m.x < camX - 40 ||
        m.x > camX + viewW + 40 ||
        m.y < camY - 40 ||
        m.y > camY + viewH + 40;
      if (out) motes.splice(i, 1);
    }
  }

  function drawMotes(ctx, camX, camY, S) {
    if (!motes.length) return;
    const prev = ctx.globalAlpha;
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const fade =
        Math.min(1, m.life / 900) * Math.min(1, (m.max - m.life) / 1200);
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(m.phase));
      ctx.globalAlpha = Math.max(0, Math.min(1, fade * tw * 0.5));
      ctx.fillStyle = m.size > 1 ? '#fff3d0' : '#ffe9a8';
      const sway = Math.sin(m.phase * 0.7) * 2;
      ctx.fillRect(
        Math.round(m.x + sway - camX) * S,
        Math.round(m.y - camY) * S,
        m.size * S,
        m.size * S
      );
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prev;
  }

  return { drawCloudShadows, updateMotes, drawMotes, moteCount: () => motes.length };
}

/* ------------------------------------------------------------------ *
 * Ambient occlusion at the foot of anything solid
 * ------------------------------------------------------------------ */

/**
 * drawGroundAO(ctx, opts)
 * For every visible walkable tile, darken the edges that face a solid
 * neighbour on the sun side (up / left), because that is the side the
 * shadow falls away from. Three alpha steps per edge give a soft falloff
 * without a gradient object per tile.
 *
 * `isOccluder(tx, ty)` -> boolean.
 */
export function drawGroundAO(ctx, opts) {
  const { tx0, ty0, tx1, ty1, camX, camY, S, isOccluder } = opts;
  if (typeof isOccluder !== 'function') return;
  const prev = ctx.globalAlpha;
  ctx.fillStyle = '#241a2e';
  const steps = [
    { d: 1, a: 0.3 },
    { d: 2, a: 0.18 },
    { d: 3, a: 0.09 },
  ];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isOccluder(tx, ty)) continue;
      const up = isOccluder(tx, ty - 1);
      const left = isOccluder(tx - 1, ty);
      const ul = isOccluder(tx - 1, ty - 1);
      if (!up && !left && !ul) continue;
      const px0 = (tx * TILE - camX) * S;
      const py0 = (ty * TILE - camY) * S;
      const size = TILE * S;
      for (const st of steps) {
        const th = st.d * S;
        if (up) {
          ctx.globalAlpha = st.a;
          ctx.fillRect(px0, py0 + (st.d - 1) * S, size, S);
        }
        if (left) {
          ctx.globalAlpha = st.a;
          ctx.fillRect(px0 + (st.d - 1) * S, py0, S, size);
        }
        if (!up && !left && ul && st.d === 1) {
          ctx.globalAlpha = st.a * 0.8;
          ctx.fillRect(px0, py0, th, th);
        }
      }
    }
  }
  ctx.globalAlpha = prev;
}

/**
 * A soft elliptical contact shadow under an object, offset down-and-right
 * because the sun is up-and-left. Drawn as stacked rows so it stays crisp
 * pixel art rather than a blurry blob.
 */
export function drawContactShadow(ctx, worldCx, worldBaseY, widthPx, camX, camY, S, alpha) {
  const w = Math.max(4, widthPx | 0);
  const h = Math.max(2, Math.round(w * 0.34));
  const cx = worldCx + Math.round(w * 0.08); // pushed away from the sun
  const cy = worldBaseY - Math.round(h / 2) + 1;
  const prev = ctx.globalAlpha;
  ctx.fillStyle = '#241a2e';
  for (let row = 0; row < h; row++) {
    const t = (row + 0.5) / h - 0.5; // -0.5 .. 0.5
    const half = Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - 4 * t * t)));
    if (half <= 0) continue;
    ctx.globalAlpha = (alpha == null ? 0.3 : alpha) * (1 - Math.abs(t) * 0.7);
    ctx.fillRect(
      Math.round(cx - half - camX) * S,
      Math.round(cy + row - camY) * S,
      half * 2 * S,
      S
    );
  }
  ctx.globalAlpha = prev;
}

/* ------------------------------------------------------------------ *
 * Water specular — a bright band travelling across the surface
 * ------------------------------------------------------------------ */

/**
 * drawWaterSpecular(ctx, opts) — bright glints on water tiles, arranged in a
 * diagonal wave that sweeps across the lake. Called once with the visible
 * window; it decides per tile whether the crest is passing over it.
 */
export function drawWaterSpecular(ctx, opts) {
  const { tx0, ty0, tx1, ty1, camX, camY, S, timeMs, isWater } = opts;
  if (typeof isWater !== 'function') return;
  const t = timeMs / 1000;
  const prev = ctx.globalAlpha;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!isWater(tx, ty)) continue;
      const phase = tx * 0.55 + ty * 0.3 - t * 1.15;
      const s = Math.sin(phase);
      if (s < 0.55) continue;
      const k = (s - 0.55) / 0.45;
      const px0 = (tx * TILE - camX) * S;
      const py0 = (ty * TILE - camY) * S;
      ctx.globalAlpha = 0.16 + 0.4 * k;
      ctx.fillStyle = '#d8f6f6';
      const off = Math.floor(((phase % 1) + 1) % 1 * 8);
      ctx.fillRect(px0 + (2 + off) * S, py0 + 4 * S, 5 * S, S);
      ctx.fillRect(px0 + (5 + off) * S, py0 + 9 * S, 4 * S, S);
      ctx.globalAlpha = (0.16 + 0.4 * k) * 0.5;
      ctx.fillRect(px0 + (1 + off) * S, py0 + 12 * S, 3 * S, S);
    }
  }
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prev;
}

/* ------------------------------------------------------------------ *
 * Pooled warm light (lamp posts, the lantern gadget)
 * ------------------------------------------------------------------ */

/**
 * drawLightPool(ctx, worldX, worldY, radiusPx, camX, camY, S, opts)
 * A warm radial pool laid over the ground with 'lighter', plus a tighter
 * core. This is where the lighting work pays off: a lamp post that actually
 * lights the ground reads as part of the world, not as a decal on it.
 */
export function drawLightPool(ctx, worldX, worldY, radiusPx, camX, camY, S, opts) {
  const o = opts || {};
  const cx = (worldX - camX) * S;
  const cy = (worldY - camY) * S;
  const r = Math.max(1, radiusPx * S);
  if (!ctx.createRadialGradient) return;
  let grad;
  try {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  } catch (_) {
    return;
  }
  const inner = o.inner || 'rgba(255,217,138,0.55)';
  const mid = o.mid || 'rgba(255,180,90,0.22)';
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(1, 'rgba(255,160,70,0)');
  const prevOp = ctx.globalCompositeOperation;
  const prevA = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevA;
}

/* ------------------------------------------------------------------ *
 * Global grade
 * ------------------------------------------------------------------ */

/**
 * A very gentle warm-to-cool wash across the frame, plus a soft vignette.
 * It ties the whole image together the way a colour grade does: the sun
 * corner is warmer than the far corner, and the edges fall off.
 */
export function drawGrade(ctx, w, h) {
  if (!ctx.createLinearGradient) return;
  const prevOp = ctx.globalCompositeOperation;
  const prevA = ctx.globalAlpha;
  try {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,236,190,0.16)');
    g.addColorStop(0.5, 'rgba(255,236,190,0.03)');
    g.addColorStop(1, 'rgba(74,63,107,0.20)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } catch (_) {
    /* ignore */
  }
  try {
    const r = Math.max(w, h) * 0.78;
    const v = ctx.createRadialGradient(w / 2, h / 2, r * 0.42, w / 2, h / 2, r);
    v.addColorStop(0, 'rgba(26,20,38,0)');
    v.addColorStop(1, 'rgba(26,20,38,0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  } catch (_) {
    /* ignore */
  }
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevA;
}

/** Foliage sway offset in pixels for an object at (tx,ty). */
export function swayOffset(tx, ty, timeMs, amount) {
  const phase = (tx * 0.9 + ty * 1.7) % (Math.PI * 2);
  const a = amount == null ? 1 : amount;
  const s =
    Math.sin(timeMs / 1400 + phase) * 0.7 + Math.sin(timeMs / 610 + phase * 1.9) * 0.3;
  return Math.round(s * a);
}

export default createLighting;
