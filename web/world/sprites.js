// AGENT-B — web/world/sprites.js
// Every pixel in this game is drawn from the hand-authored string grids below.
// No image files, no base64, no fetch, no external URLs.
//
// A sprite is { w, h, palette: {char:'#rrggbb'}, rows: [ '..aa..', ... ] }.
// '.' is transparent. Sprites are rasterised ONCE per (sprite, scale) into an
// offscreen canvas and blitted thereafter — per-pixel fillRect every frame for a
// screenful of tiles is far too slow.

import { TILE, BUILDING_IDS, BUILDING_FOOTPRINT } from '../../shared/constants.js';

/* ------------------------------------------------------------------ *
 * Shared palette — v3.
 *
 * The v1/v2 palette was dusky and low-saturation: every material sat in the
 * same narrow grey-green band, which is exactly why the world read as flat.
 * v3 re-authors every ramp around two ideas taken from PALETTE_V3:
 *
 *  1. COLOUR TEMPERATURE, not brightness. A shaded green is a *different hue*
 *     to a sunlit green — it shifts toward the violet-teal of PALETTE_V3.shade
 *     (#4a3f6b) while the lit end shifts toward PALETTE_V3.sun (#fff3d0).
 *     Sand and wood run warm; stone and water run cool.
 *  2. SATURATION. Mid-tones are pushed well off grey so the world reads as
 *     lit by an actual sun rather than by an overcast sky.
 *
 * Char keys are unchanged from v2 so every existing string-grid still parses;
 * only the colours behind them moved. Uppercase keys are new v3 additions.
 * ------------------------------------------------------------------ */
export const PAL = Object.freeze({
  '0': '#241a2e', // outline — warm violet-black, never pure black
  '1': '#3a2b4a', // drop shadow
  '2': '#2f6050', // grass, deep shade  (cool: shifted to teal)
  '3': '#448a48', // grass base
  '4': '#65ab4c', // grass light        (warming)
  '5': '#93cc5c', // grass highlight    (warm yellow-green)
  '6': '#7a5236', // dirt dark
  '7': '#a87a4c', // dirt base
  '8': '#dfc088', // sand base          (warm)
  '9': '#f4e0b0', // sand light
  a: '#154a63', // water deep
  b: '#2a86a6', // water base
  c: '#66c8d4', // water light
  d: '#413c56', // stone dark         (cool violet)
  e: '#6b6688', // stone base
  f: '#a49fbe', // stone light
  g: '#255a3e', // foliage darkest    (cool)
  h: '#3f8443', // foliage mid
  i: '#6cae46', // foliage light
  j: '#54341f', // wood dark
  k: '#8a5c34', // wood mid
  l: '#c08a4e', // wood light
  m: '#fff3d0', // pale / glass shine
  n: '#ff8a3c', // ember orange
  o: '#ffcc5c', // gold
  p: '#b78fd4', // arcane purple
  q: '#5cc0f0', // lit window blue
  r: '#8fc85a', // reagent green
  s: '#e2654a', // hot red
  t: '#f0c9a0', // skin
  u: '#3d3457', // robe dark
  v: '#6a5a95', // robe light

  // --- v3 additions -------------------------------------------------
  w: '#b8dd6e', // grass sun-dapple, the brightest green
  x: '#4a3f6b', // deep cool shade (PALETTE_V3.shade)
  y: '#ffd98a', // warm lamp glow
  z: '#6b6270', // ash grey
  A: '#3a3440', // ash dark
  B: '#9a8f9c', // ash light
  C: '#7fae4a', // moss
  D: '#3c2a1c', // bark dark
  E: '#a9793f', // bark light / sunlit trunk
  F: '#d8f6f6', // water foam / specular
  G: '#c9c0d8', // stone sunlit face
  H: '#c9922f', // deep gold
  I: '#f4e4c1', // parchment
  J: '#c9a86a', // rope / straw
  K: '#a9d95c', // leaf, sunlit
  L: '#79b447', // leaf, mid-warm
  M: '#2f5a44', // leaf, cool shadow
  N: '#f08fa8', // flower pink
  O: '#fff8e4', // flower white
  P: '#7fdcdc', // crystal cyan
  Q: '#5a5568', // iron
  R: '#c4553f', // roof tile, base
  S: '#8a3628', // roof tile, shadow
  T: '#e2795a', // roof tile, sunlit
  U: '#1d3a52', // deep shadow blue (under-eaves)
  V: '#efc9a0', // warm plaster

  // --- v10: the farlands. Cooled lava — near-black with the heat still in the
  //     cracks. Deliberately dark, so the red reads as embers rather than clay.
  W: '#3a1c1c', // basalt, the cold crust
  X: '#5e2622', // the crack between plates, still warm
});

/* ------------------------------------------------------------------ *
 * Directional lighting — the single biggest reason v3 does not look flat.
 *
 * Every sprite is lit from the TOP-LEFT. Rather than hand-authoring a lit
 * face and a shaded face into hundreds of string grids, the rasteriser
 * derives them: a pixel whose up/left neighbours are empty sits on the
 * silhouette edge facing the sun and is mixed toward PALETTE_V3.sun; a pixel
 * whose down/right neighbours are empty sits on the away face and is mixed
 * toward PALETTE_V3.shade. Internal material boundaries get a weaker version
 * of the same treatment, which gives planks, sills and roof tiles volume.
 *
 * This is applied ONCE, at rasterisation, into the cached offscreen canvas,
 * so it costs nothing per frame.
 * ------------------------------------------------------------------ */
export const LIGHT_DIR = Object.freeze({ x: -1, y: -1 }); // sun is up-and-left
const SUN_COLOR = '#fff3d0';
const SHADE_COLOR = '#4a3f6b';
const SUN_MIX = 0.34; // how far a fully-lit edge travels toward the sun
const SHADE_MIX = 0.38; // …and a fully-shaded edge toward the cool shade

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}
function rgbToHex(r, g, b) {
  const c = (v) => {
    const n = Math.max(0, Math.min(255, Math.round(v)));
    return (n < 16 ? '0' : '') + n.toString(16);
  };
  return '#' + c(r) + c(g) + c(b);
}
/** Linear blend between two hex colours. t=0 -> a, t=1 -> b. */
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k);
}
/** Multiply a colour's brightness, keeping hue. Used for quick ramps. */
export function shadeHex(hex, mult) {
  const c = hexToRgb(hex);
  return rgbToHex(c[0] * mult, c[1] * mult, c[2] * mult);
}

const SUN_RGB = hexToRgb(SUN_COLOR);
const SHADE_RGB = hexToRgb(SHADE_COLOR);
const LIT_CACHE = new Map(); // "hex|bucket" -> hex

/** Colour of `hex` at light level `d` in -1..1 (negative = away from the sun). */
function litColor(hex, d) {
  const bucket = Math.max(-6, Math.min(6, Math.round(d * 6)));
  if (bucket === 0) return hex;
  const key = hex + '|' + bucket;
  const hit = LIT_CACHE.get(key);
  if (hit) return hit;
  const base = hexToRgb(hex);
  const t = Math.abs(bucket) / 6;
  const target = bucket > 0 ? SUN_RGB : SHADE_RGB;
  const amt = (bucket > 0 ? SUN_MIX : SHADE_MIX) * t;
  const out = rgbToHex(
    base[0] + (target[0] - base[0]) * amt,
    base[1] + (target[1] - base[1]) * amt,
    base[2] + (target[2] - base[2]) * amt
  );
  LIT_CACHE.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ *
 * Core sprite helpers
 * ------------------------------------------------------------------ */

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
  return null; // node --check / non-browser: never actually drawn
}

/**
 * makeSprite(rows, palette) -> { w, h, palette, rows }
 * Rows shorter than the widest row are right-padded with transparency, and an
 * optional `size` forces exact dimensions (used so building sprites are always
 * exactly footprint*TILE even if a row was mistyped). Defensive by design: a
 * malformed grid must never throw inside the render loop.
 */
export function makeSprite(rows, palette, size) {
  const src = Array.isArray(rows) ? rows.map((r) => String(r == null ? '' : r)) : [];
  let w = 0;
  for (const r of src) w = Math.max(w, r.length);
  let h = src.length;
  if (size && size.w) w = size.w;
  if (size && size.h) h = size.h;
  const out = new Array(h);
  for (let y = 0; y < h; y++) {
    let r = src[y] || '';
    if (r.length !== w && typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[sprites] ' + ((size && size.label) || 'sprite') +
          ' row ' + y + ' is ' + r.length + ' wide, expected ' + w
      );
    }
    if (r.length < w) r += '.'.repeat(w - r.length);
    else if (r.length > w) r = r.slice(0, w);
    out[y] = r;
  }
  const shade = size && size.shade != null ? Number(size.shade) || 0 : 0;
  return { w, h, palette: palette || PAL, rows: out, shade, _cache: null };
}

/**
 * Return a copy of `rows` with characters remapped. Used to derive the sunlit
 * and shaded variants of a terrain grid from one authored base, which
 * guarantees the row widths can never drift apart.
 */
export function remapRows(rows, map) {
  return rows.map((r) =>
    r
      .split('')
      .map((ch) => (map[ch] != null ? map[ch] : ch))
      .join('')
  );
}

/** Roll a grid by (dx,dy) with wraparound — cheap animation frames for water. */
export function rollRows(rows, dx, dy) {
  const h = rows.length;
  if (!h) return rows;
  const w = rows[0].length;
  const out = new Array(h);
  for (let y = 0; y < h; y++) {
    const src = rows[((y - dy) % h + h) % h];
    let line = '';
    for (let x = 0; x < w; x++) line += src[((x - dx) % w + w) % w];
    out[y] = line;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Grid builder — a mutable char canvas for art that is easier to compose
 * than to type out (gate structures, fence auto-connect variants).
 * Widths are structural, so they can never be mistyped.
 * ------------------------------------------------------------------ */
export function grid(w, h, ch) {
  const g = { w, h, rows: [] };
  for (let y = 0; y < h; y++) g.rows.push(new Array(w).fill(ch || '.'));
  return g;
}
export function px(g, x, y, ch) {
  if (!g || x < 0 || y < 0 || x >= g.w || y >= g.h) return;
  if (ch === '~') return;
  g.rows[y][x] = ch;
}
export function box(g, x, y, w, h, ch) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) px(g, x + dx, y + dy, ch);
}
/** Stamp a string-grid at (x,y). '~' in the source means "leave alone". */
export function stamp(g, x, y, rows) {
  for (let dy = 0; dy < rows.length; dy++) {
    const row = rows[dy];
    for (let dx = 0; dx < row.length; dx++) px(g, x + dx, y + dy, row[dx]);
  }
}
export function gridRows(g) {
  return g.rows.map((r) => r.join(''));
}

const MISSING_WARNED = new Set();

function rasterise(sprite, scale) {
  const cv = makeCanvas(sprite.w * scale, sprite.h * scale);
  if (!cv) return null;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.imageSmoothingEnabled = false;
  const pal = sprite.palette || PAL;
  const shade = sprite.shade || 0;

  if (shade <= 0) {
    // Flat path: batch runs of identical colour on a row into one fillRect.
    for (let y = 0; y < sprite.h; y++) {
      const row = sprite.rows[y] || '';
      let x = 0;
      while (x < sprite.w) {
        const ch = row[x] || '.';
        if (ch === '.' || ch === ' ') {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < sprite.w && (row[x + run] || '.') === ch) run++;
        const col = pal[ch];
        if (col) {
          c.fillStyle = col;
          c.fillRect(x * scale, y * scale, run * scale, scale);
        }
        x += run;
      }
    }
    return cv;
  }

  // Lit path. Slower per pixel, but this runs once per (sprite, scale) and the
  // result is cached, so the cost never reaches the render loop.
  const rows = sprite.rows;
  const at = (x, y) => {
    if (x < 0 || y < 0 || x >= sprite.w || y >= sprite.h) return '.';
    const ch = (rows[y] || '')[x];
    return ch == null || ch === ' ' ? '.' : ch;
  };
  const solid = (x, y) => at(x, y) !== '.';

  for (let y = 0; y < sprite.h; y++) {
    const row = rows[y] || '';
    let x = 0;
    let runStart = 0;
    let runColor = null;
    const flush = (end) => {
      if (runColor && end > runStart) {
        c.fillStyle = runColor;
        c.fillRect(runStart * scale, y * scale, (end - runStart) * scale, scale);
      }
      runColor = null;
    };
    for (x = 0; x < sprite.w; x++) {
      const ch = row[x] || '.';
      if (ch === '.' || ch === ' ') {
        flush(x);
        continue;
      }
      const base = pal[ch];
      if (!base) {
        flush(x);
        continue;
      }
      // Silhouette term: how much of the up-left / down-right shoulder is open.
      let open = 0;
      let away = 0;
      if (!solid(x - 1, y)) open++;
      if (!solid(x, y - 1)) open++;
      if (!solid(x - 1, y - 1)) open++;
      if (!solid(x + 1, y)) away++;
      if (!solid(x, y + 1)) away++;
      if (!solid(x + 1, y + 1)) away++;
      // Internal term: a material boundary is a surface change, so it catches
      // light too — at half strength, so detail reads without shouting.
      let diffUp = 0;
      let diffDn = 0;
      if (solid(x - 1, y) && at(x - 1, y) !== ch) diffUp++;
      if (solid(x, y - 1) && at(x, y - 1) !== ch) diffUp++;
      if (solid(x + 1, y) && at(x + 1, y) !== ch) diffDn++;
      if (solid(x, y + 1) && at(x, y + 1) !== ch) diffDn++;

      const d =
        ((open - away) / 3) * shade + ((diffUp - diffDn) / 2) * shade * 0.35;
      const col = litColor(base, Math.max(-1, Math.min(1, d)));
      if (col !== runColor) {
        flush(x);
        runStart = x;
        runColor = col;
      }
    }
    flush(sprite.w);
  }
  return cv;
}

/** Returns (and memoises) the offscreen canvas for this sprite at this scale. */
export function spriteCanvas(sprite, scale) {
  if (!sprite) return null;
  const s = Math.max(1, Math.round(scale || 1));
  if (!sprite._cache) sprite._cache = new Map();
  let cv = sprite._cache.get(s);
  if (cv === undefined) {
    cv = rasterise(sprite, s);
    sprite._cache.set(s, cv);
  }
  return cv;
}

/** drawSprite(ctx, sprite, px, py, scale) — px/py are destination device px. */
export function drawSprite(ctx, sprite, px, py, scale) {
  const s = Math.max(1, Math.round(scale || 1));
  if (!ctx) return;
  if (!sprite || !sprite.rows || !sprite.rows.length) {
    // Missing art must never kill the frame — draw a magenta placeholder.
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(px | 0, py | 0, TILE * s, TILE * s);
    ctx.fillStyle = '#000000';
    ctx.fillRect((px | 0) + s, (py | 0) + s, TILE * s - 2 * s, TILE * s - 2 * s);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect((px | 0) + 2 * s, (py | 0) + 2 * s, TILE * s - 4 * s, TILE * s - 4 * s);
    return;
  }
  const cv = spriteCanvas(sprite, s);
  if (cv) {
    ctx.drawImage(cv, px | 0, py | 0);
    return;
  }
  // Last-resort direct path (no canvas factory available).
  const pal = sprite.palette || PAL;
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      const ch = row[x];
      if (!ch || ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect((px | 0) + x * s, (py | 0) + y * s, s, s);
    }
  }
}

/** Translucent + colour-washed draw, used by build mode for the placement ghost. */
export function drawSpriteGhost(ctx, sprite, px, py, scale, tint, alpha) {
  if (!ctx) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha == null ? 0.6 : alpha;
  drawSprite(ctx, sprite, px, py, scale);
  ctx.globalAlpha = prev;
  if (tint && sprite) {
    const s = Math.max(1, Math.round(scale || 1));
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = tint;
    ctx.fillRect(px | 0, py | 0, sprite.w * s, sprite.h * s);
    ctx.globalAlpha = prev;
  }
}

/** Mirror a string grid horizontally (used to derive the right-facing walk). */
function mirror(rows) {
  return rows.map((r) => r.split('').reverse().join(''));
}
function fill(ch, n) {
  return ch.repeat(Math.max(0, n));
}

/* ================================================================== *
 * TERRAIN — 16x16
 *
 * Ground is authored ONCE per material and then remapped into a warm
 * (sunlit) and a cool (shaded) tier. The remap is a hue shift, not a
 * brightness shift: shaded grass becomes the teal-green '2', sunlit grass
 * the yellow-green '5'/'w'. world.js picks the tier from low-frequency
 * noise, so the meadow reads as sun and cloud rather than as a texture.
 * ================================================================== */

// Blades cluster rather than speckle — speckle reads as noise, clusters read
// as grass. Three bases so a large field never shows an obvious repeat.
const GRASS_0 = [
  '3333333333333333',
  '3343333334433333',
  '3444333344433433',
  '3343333334433443',
  '3333343333333443',
  '3333443333333433',
  '3433433334333333',
  '3443333344433333',
  '3333333334433433',
  '3334433333333333',
  '3344433333344433',
  '3334333333443343',
  '3333333333433333',
  '3433333333333443',
  '3443333433334433',
  '3433334433333333',
];
const GRASS_1 = [
  '3333443333333433',
  '3333443334433443',
  '3433333344433433',
  '3443333334333333',
  '3443333333334433',
  '3333333333344433',
  '3334433333433333',
  '3344433333333443',
  '3334333433333443',
  '3333334433333333',
  '3433344433334333',
  '3443334333344433',
  '3443333333443333',
  '3333333333333433',
  '3334333334333443',
  '3344333344333443',
];
const GRASS_2 = [
  '3333333344333333',
  '3443333444333433',
  '3443333344333443',
  '3333333333333443',
  '3334433333333333',
  '3344433334433333',
  '3334333344433433',
  '3333333334333443',
  '3433333333333443',
  '3443334433333333',
  '3443344433334433',
  '3333334333344433',
  '3333333333334333',
  '3443333433333333',
  '3443334433333443',
  '3333334433333443',
];

// Sunlit tier: every green climbs one step and picks up dapple.
const SUNNY = { '3': '4', '4': '5', '5': 'w' };
// Shaded tier: every green cools one step toward the teal shadow.
const SHADY = { '4': '3', '3': '2', '5': '4' };

// Flower clumps, sprinkled sparsely on sunlit grass only.
const GRASS_FLOWERS = [
  '3333333333333333',
  '3343333334433333',
  '3444333344433433',
  '3343333334433443',
  '333334333333N443',
  '3333443333N3O433',
  '3433433334N33333',
  '3443333344433333',
  '3333333334433433',
  '333443333333O333',
  '3344433333N44433',
  '333433333N443343',
  '3333333333433333',
  '3433333333333443',
  '3443333433334433',
  '3433334433333333',
];

const SAND_0 = [
  '8888888888888888',
  '8988888888899888',
  '8888887888888888',
  '8899888888888988',
  '8888888899888888',
  '8888788888888788',
  '9888888888899888',
  '8888899888888888',
  '8878888888888898',
  '8888888888788888',
  '8998888899888888',
  '8888888888888998',
  '8888788888888888',
  '8899888878888888',
  '8888888888899888',
  '8888888998888888',
];
const SAND_1 = [
  '8888899888888888',
  '8888888888788888',
  '8998888888888998',
  '8888878888888888',
  '8888888888998888',
  '9988888899888888',
  '8888888888888788',
  '8878888888899888',
  '8888899888888888',
  '8888888888888898',
  '8988888878888888',
  '8888788888899888',
  '8899888888888888',
  '8888888899888788',
  '8888888888888888',
  '8988888888899888',
];

// Dirt path: warm earth with pale gravel worn into it.
const PATH_0 = [
  '7777777777777777',
  '7767777777787777',
  '7777787777777677',
  '7877777677777777',
  '7777777777687777',
  '7677777787777877',
  '7777677777777877',
  '7787777777677777',
  '6777777787777777',
  '7777877777787767',
  '7778777777777767',
  '7777777677778777',
  '7877777777777777',
  '7877777767677777',
  '7777787777777787',
  '7767777877777777',
];
const PATH_1 = [
  '7777877777777677',
  '7777877777787777',
  '7677777777677777',
  '7777777687777877',
  '7787777777777777',
  '7777677777778777',
  '7877777787777677',
  '7877777777777777',
  '7777777677787777',
  '7677778777777877',
  '7777777777677877',
  '7778777777777777',
  '7777777787677777',
  '7677777777777787',
  '7777877777777777',
  '7777877767777777',
];

// Water: deep base with lighter crests, four frames derived by rolling the
// grid so the swell visibly travels. The bright specular is a separate
// overlay drawn by world.js, so it can sweep independently of the swell.
const WATER_0 = [
  'bbbbbbbbbbbbbbbb',
  'bbbccbbbbbbbbbbb',
  'baabbbbbbbbccbbb',
  'baabbbbbbbbccbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbaabbbbbbb',
  'bbbccbbaabbbbbbb',
  'bbbccbbbbbbbaabb',
  'bbbbbbbbbbbbaabb',
  'bbbbbbbbccbbbbbb',
  'baabbbbbccbbbbbb',
  'baabbbbbbbbbbccb',
  'bbbbbbbbbbbbbccb',
  'bbbbccbbbbbbbbbb',
  'bbbbccbbaabbbbbb',
  'bbbbbbbbaabbbbbb',
];

// Stone: a raised outcrop. The top and left faces catch the sun ('f'/'G'),
// the bottom and right fall away into the cool 'd', so the tile reads as a
// block of rock rather than as grey ground.
const STONE_0 = [
  'GGGGGGGGGGGGGGGG',
  'GffffffffffffffG',
  'Gfeeeeeefeeeeedd',
  'Gfeeefeeeeeeeedd',
  'Gfeeefeeeeffeedd',
  'Gfeeeeeeeeffeedd',
  'Gfeeeeeddeeeeedd',
  'Gfeeeeeddeeeeedd',
  'Gfeeffeeeeeeeedd',
  'Gfeeffeeeeeddedd',
  'Gfeeeeeeeeeddedd',
  'Gfeeeeeeffeeeedd',
  'Gfeeddeeffeeeedd',
  'Gfeeddeeeeeeeedd',
  'Gdddddddddddaddd',
  'dddddddddddddddd',
];

/* ------------------------------------------------------------------ *
 * HARVESTED / DEPLETED VARIANTS
 * Trees, stumps and saplings are OBJECTS in v3 (transparent, drawn over the
 * ground in the depth-sorted pass) so they can sway, cast contact shadow and
 * let the player walk behind them. Rubble and the water/sand variants remain
 * full tiles because they are ground, not scenery.
 * ------------------------------------------------------------------ */

// Broken stone: a shallow pit ringed with loose chips, lit from the top-left.
const RUBBLE_0 = [
  'eeeeeeeeeeeeeeee',
  'efeddddddefedddd',
  'edeeddddddededdd',
  'ddddddAAdddddddd',
  'dddddAffAddddddd',
  'ddddAffffAdddddd',
  'ddddAfeeeAdddddd',
  'dddddAeeeAdddddd',
  'ddddddAAAddddddd',
  'ddfeddddddddfedd',
  'ddeeddddddddeddd',
  'dddddddddddddddd',
  'ddddfeddddddfedd',
  'dddfffeddddfeedd',
  'dddfeeedddddeedd',
  'ddddAAAddddddAdd',
];

// Dredged shallows: dark water with the stubs of cut reeds.
const DRIEDREEDS_0 = [
  'aaaaaaaaaaaaaaaa',
  'aabaaaaaaaabaaaa',
  'aaaaaagCaaaaaaaa',
  'aaaaaagCaaagCaaa',
  'abaaaagCaaagCaaa',
  'aaaaaa00aaa00aaa',
  'aaaaaaaaaaaaaaaa',
  'aagCaaaaaaaaaaaa',
  'aagCaaaaaagCaaaa',
  'aagCaaaaaagCaaaa',
  'aa00aaaaaa00aaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaagCaaaaaa',
  'abaaaaaagCaaabaa',
  'aaaaaaaa00aaaaaa',
  'aaaaaaaaaaaaaaaa',
];

// Sifted sand: the furrows a sieve leaves behind.
const SIFTEDSAND_0 = [
  '8888888888888888',
  '8877888887788888',
  '8877888887788888',
  '8888888888888888',
  '8888887788888888',
  '8888887788887788',
  '8888888888887788',
  '8888888888888888',
  '8877888888888888',
  '8877888877888888',
  '8888888877888888',
  '8888888888888888',
  '8888887788888888',
  '9988887788889988',
  '9988888888889988',
  '8888888888888888',
];

/* ================================================================== *
 * PLAYER — 16x16, a small scholar in a hooded robe with a satchel
 * ================================================================== */

const P_DOWN_0 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvvv0...',
  '...0vttttttv0...',
  '...0vt0tt0tv0...',
  '....0tttttt0....',
  '....0uuuuuu0....',
  '...0uuuuuuuu0...',
  '..0kkuuuuuuu0...',
  '..0kk0uuuuuu0...',
  '...0uuuuuuuu0...',
  '...0uuuuuuuu0...',
  '....0jj00jj0....',
  '.....00..00.....',
];
const P_DOWN_1 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvvv0...',
  '...0vttttttv0...',
  '...0vt0tt0tv0...',
  '....0tttttt0....',
  '....0uuuuuu0....',
  '...0uuuuuuuu0...',
  '...0kkuuuuuu0...',
  '...0kk0uuuuu0...',
  '...0uuuuuuuu0...',
  '...0uuuuuuuu0...',
  '...0jj0..0jj0...',
  '...00.....00....',
];

const P_UP_0 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvvv0...',
  '...0vvvvvvvv0...',
  '...0vvvvvvvv0...',
  '....0vvvvvv0....',
  '....0uuuuuu0....',
  '...0uuuuuuuu0...',
  '..0kkuu00uuu0...',
  '..0kk0u00uuu0...',
  '...0uuu00uuu0...',
  '...0uuuuuuuu0...',
  '....0jj00jj0....',
  '.....00..00.....',
];
const P_UP_1 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvvv0...',
  '...0vvvvvvvv0...',
  '...0vvvvvvvv0...',
  '....0vvvvvv0....',
  '....0uuuuuu0....',
  '...0uuuuuuuu0...',
  '...0kkuu00uu0...',
  '...0kk0u00uu0...',
  '...0uuu00uuu0...',
  '...0uuuuuuuu0...',
  '...0jj0..0jj0...',
  '...00.....00....',
];

const P_LEFT_0 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvv0....',
  '...0vtttvvv0....',
  '...0t0ttvvv0....',
  '....0ttttv0.....',
  '....0uuuuu0.....',
  '...0uuuuukk0....',
  '...0uuuuu0kk0...',
  '...0uuuuuu0k0...',
  '...0uuuuuu0.....',
  '....0uuuu0......',
  '....0jj0j0......',
  '.....00.00......',
];
const P_LEFT_1 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvv0....',
  '...0vtttvvv0....',
  '...0t0ttvvv0....',
  '....0ttttv0.....',
  '....0uuuuu0.....',
  '...0uuuuukk0....',
  '...0uuuuu0kk0...',
  '...0uuuuuu0k0...',
  '...0uuuuuu0.....',
  '....0uuuu0......',
  '...0jj00j0......',
  '....00...00.....',
];

/* ------------------------------------------------------------------ *
 * SWING POSES (v2 gathering) — 2 frames per facing.
 * Frame 0 is the wind-up (tool raised), frame 1 the strike (tool planted
 * in the direction the scholar faces). Same body as the walk cycle so the
 * transition reads as one character, with a tool grafted on.
 * ------------------------------------------------------------------ */

const P_SWING_DOWN_0 = [
  '............0f0.',
  '...........0fff0',
  '.....0000000ff0.',
  '....0vvvvvv0l0..',
  '...0vvvvvvvv0l..',
  '...0vttttttv0l..',
  '...0vt0tt0tv0l..',
  '....0tttttt0l...',
  '....0uuuuuu0k...',
  '...0uuuuuuuut0..',
  '..0kkuuuuuuu0...',
  '..0kk0uuuuuu0...',
  '...0uuuuuuuu0...',
  '...0uuuuuuuu0...',
  '....0jj00jj0....',
  '.....00..00.....',
];
const P_SWING_DOWN_1 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvvv0...',
  '...0vttttttv0...',
  '...0vt0tt0tv0...',
  '....0tttttt0....',
  '....0uuuuuu0....',
  '...0uuuuuuuu0t..',
  '..0kkuuuuuuu0l..',
  '..0kk0uuuuuu0l..',
  '...0uuuuuuuu0l..',
  '...0uuuuuuuu00f0',
  '....0jj00jj00ff0',
  '.....00..00.0f0.',
];

const P_SWING_UP_0 = [
  '............0f0.',
  '...........0fff0',
  '.....0000000ff0.',
  '....0vvvvvv0l0..',
  '...0vvvvvvvv0l..',
  '...0vvvvvvvv0l..',
  '...0vvvvvvvv0l..',
  '....0vvvvvv0l...',
  '....0uuuuuu0k...',
  '...0uuuuuuuut0..',
  '..0kkuu00uuu0...',
  '..0kk0u00uuu0...',
  '...0uuu00uuu0...',
  '...0uuuuuuuu0...',
  '....0jj00jj0....',
  '.....00..00.....',
];
const P_SWING_UP_1 = [
  '...0ffff0.......',
  '...0ffff0l......',
  '.....000000l....',
  '....0vvvvvv0l...',
  '...0vvvvvvvv0k..',
  '...0vvvvvvvv0k..',
  '...0vvvvvvvv0k..',
  '....0vvvvvv0k...',
  '....0uuuuuu0k...',
  '...0uuuuuuuut0..',
  '...0kkuu00uu0...',
  '...0kk0u00uu0...',
  '...0uuu00uuu0...',
  '...0uuuuuuuu0...',
  '...0jj0..0jj0...',
  '...00.....00....',
];

const P_SWING_LEFT_0 = [
  '..........0fff0.',
  '..........0fff0.',
  '.....000000l....',
  '....0vvvvvv0l...',
  '...0vvvvvvv0k...',
  '...0vtttvvv0k...',
  '...0t0ttvvv0k...',
  '....0ttttv0k....',
  '....0uuuuu0t....',
  '...0uuuuukk0....',
  '...0uuuuu0kk0...',
  '...0uuuuuu0k0...',
  '...0uuuuuu0.....',
  '....0uuuu0......',
  '....0jj0j0......',
  '.....00.00......',
];
const P_SWING_LEFT_1 = [
  '................',
  '................',
  '.....000000.....',
  '....0vvvvvv0....',
  '...0vvvvvvv0....',
  '...0vtttvvv0....',
  '...0t0ttvvv0....',
  '....0ttttv0.....',
  '...t0uuuuu0.....',
  '..l0uuuuukk0....',
  '.ll0uuuuu0kk0...',
  '0f00uuuuuu0k0...',
  'fff0uuuuuu0.....',
  '0f0.0uuuu0......',
  '....0jj0j0......',
  '.....00.00......',
];

/* ================================================================== *
 * BUILDINGS — footprint*16 in each dimension
 * ================================================================== */

// --- study_hut : 2x2 -> 32x32. A humble timber cabin.
const B_STUDY_HUT = [
  fill('.', 32),
  fill('.', 32),
  fill('.', 32),
  fill('.', 32),
  fill('.', 32),
  fill('.', 32),
  fill('.', 14) + '0000' + fill('.', 14),
  fill('.', 12) + '0jjjj0' + fill('.', 14),
  fill('.', 10) + '0jjjjjjjj0' + fill('.', 12),
  fill('.', 8) + '0jjjjjjjjjjjj0' + fill('.', 10),
  fill('.', 6) + '0jjjjjjjjjjjjjjjj0' + fill('.', 8),
  fill('.', 4) + '0' + fill('j', 20) + '0' + fill('.', 6),
  fill('.', 2) + '0' + fill('j', 24) + '0' + fill('.', 4),
  '00' + fill('j', 28) + '00',
  '0' + fill('k', 30) + '0',
  fill('0', 32),
  '..0' + fill('l', 26) + '0..',
  '..0' + fill('l', 26) + '0..',
  '..0lll0qqq0' + fill('l', 18) + '0..',
  '..0lll0qmq0' + fill('l', 18) + '0..',
  '..0lll0qqq0' + fill('l', 18) + '0..',
  '..0lll00000' + fill('l', 18) + '0..',
  '..0' + fill('l', 13) + '0jjjj0' + fill('l', 7) + '0..',
  '..0' + fill('l', 13) + '0jjjj0' + fill('l', 7) + '0..',
  '..0' + fill('l', 13) + '0jjjj0' + fill('l', 7) + '0..',
  '..0' + fill('l', 13) + '0jjoj0' + fill('l', 7) + '0..',
  '..0' + fill('l', 13) + '0jjjj0' + fill('l', 7) + '0..',
  '..0' + fill('l', 13) + '0jjjj0' + fill('l', 7) + '0..',
  '..0' + fill('l', 13) + '0jjjj0' + fill('l', 7) + '0..',
  '..0' + fill('l', 13) + '0jjjj0' + fill('l', 7) + '0..',
  '..' + fill('0', 28) + '..',
  '...' + fill('1', 26) + '...',
];

// --- library : 3x2 -> 48x32. Domed roof + shelves of books.
const LIB_SHELF_A = '..0lll0' + 'qqoorrppqqoorr' + '0llll0' + 'ppqqoorrqqoopp' + '0lll0..';
const LIB_SHELF_B = '..0lll0' + 'rrppqqooppqqoo' + '0llll0' + 'ooqqrrppooqqrr' + '0lll0..';
const LIB_PLANK = '..0lll0' + fill('0', 14) + '0llll0' + fill('0', 14) + '0lll0..';
const B_LIBRARY = [
  fill('.', 48),
  fill('.', 23) + 'oo' + fill('.', 23),
  fill('.', 22) + '0oo0' + fill('.', 22),
  fill('.', 20) + fill('0', 8) + fill('.', 20),
  fill('.', 18) + '00' + fill('f', 8) + '00' + fill('.', 18),
  fill('.', 16) + '00' + fill('f', 12) + '00' + fill('.', 16),
  fill('.', 15) + '0' + fill('f', 16) + '0' + fill('.', 15),
  fill('.', 14) + '0' + fill('f', 18) + '0' + fill('.', 14),
  fill('.', 14) + '0fe' + fill('f', 14) + 'ef0' + fill('.', 14),
  fill('.', 13) + '0' + fill('f', 20) + '0' + fill('.', 13),
  fill('.', 13) + '0' + fill('e', 20) + '0' + fill('.', 13),
  fill('.', 12) + fill('0', 24) + fill('.', 12),
  '..' + fill('0', 44) + '..',
  '..0' + fill('k', 42) + '0..',
  '..0' + fill('k', 42) + '0..',
  '..' + fill('0', 44) + '..',
  '..0' + fill('l', 42) + '0..',
  LIB_SHELF_A,
  LIB_SHELF_A,
  LIB_PLANK,
  LIB_SHELF_B,
  LIB_SHELF_B,
  LIB_PLANK,
  LIB_SHELF_A,
  LIB_SHELF_A,
  '..0' + fill('l', 42) + '0..',
  '..0' + fill('l', 17) + '0jjjjjj0' + fill('l', 17) + '0..',
  '..0' + fill('l', 17) + '0jjjjjj0' + fill('l', 17) + '0..',
  '..0' + fill('l', 17) + '0jjojjj0' + fill('l', 17) + '0..',
  '..0' + fill('l', 17) + '0jjjjjj0' + fill('l', 17) + '0..',
  '..' + fill('0', 44) + '..',
  '...' + fill('1', 42) + '...',
];

// --- forge : 2x2 -> 32x32. Stone shed, tall chimney, glowing mouth.
const FORGE_CHIM = fill('.', 20) + '0eeeee0' + fill('.', 5);
const B_FORGE = [
  fill('.', 32),
  fill('.', 32),
  fill('.', 20) + fill('0', 7) + fill('.', 5),
  FORGE_CHIM,
  fill('.', 20) + '0edeee0' + fill('.', 5),
  FORGE_CHIM,
  FORGE_CHIM,
  fill('.', 20) + '0eeede0' + fill('.', 5),
  FORGE_CHIM,
  FORGE_CHIM,
  fill('.', 20) + '0edeee0' + fill('.', 5),
  FORGE_CHIM,
  FORGE_CHIM,
  fill('.', 20) + '0eeeee0' + fill('.', 5),
  fill('.', 5) + fill('0', 22) + fill('.', 5),
  '...0' + fill('d', 24) + '0...',
  '..0' + fill('d', 26) + '0..',
  '0' + fill('d', 30) + '0',
  '0' + fill('e', 30) + '0',
  fill('0', 32),
  '..0' + fill('e', 26) + '0..',
  '..0' + fill('e', 26) + '0..',
  '..0' + fill('e', 8) + '0' + fill('n', 8) + '0' + fill('e', 8) + '0..',
  '..0' + fill('e', 8) + '0nnoooonn0' + fill('e', 8) + '0..',
  '..0' + fill('e', 8) + '0nooooooon' + fill('e', 8) + '0..',
  '..0' + fill('e', 8) + '0nnooooon0' + fill('e', 8) + '0..',
  '..0' + fill('e', 8) + '0snnnnnns0' + fill('e', 8) + '0..',
  '..0' + fill('e', 8) + '0ssnnnnss0' + fill('e', 8) + '0..',
  '..0' + fill('e', 8) + '0' + fill('0', 8) + '0' + fill('e', 8) + '0..',
  '..0' + fill('e', 26) + '0..',
  '..' + fill('0', 28) + '..',
  '...' + fill('1', 26) + '...',
];

// --- observatory : 2x3 -> 32x48. Slender tower, slitted dome, telescope tube.
const OBS_WALL = '..0' + fill('e', 26) + '0..';
const B_OBSERVATORY = [
  fill('.', 32),
  fill('.', 20) + '0mmmm0' + fill('.', 6),
  fill('.', 19) + '0mmmm0' + fill('.', 7),
  fill('.', 18) + '0mmmm0' + fill('.', 8),
  fill('.', 11) + fill('0', 10) + fill('.', 11),
  fill('.', 10) + '00' + fill('f', 8) + '00' + fill('.', 10),
  fill('.', 8) + '00' + fill('f', 12) + '00' + fill('.', 8),
  fill('.', 7) + '0' + fill('f', 16) + '0' + fill('.', 7),
  fill('.', 6) + '0' + fill('f', 18) + '0' + fill('.', 6),
  fill('.', 6) + '0fffff0000fffffffff0' + fill('.', 6),
  fill('.', 5) + '0ffffff0000ffffffffff0' + fill('.', 5),
  fill('.', 5) + '0ffffff0000ffffffffff0' + fill('.', 5),
  fill('.', 5) + '0eeeeee0000eeeeeeeeee0' + fill('.', 5),
  fill('.', 5) + fill('0', 22) + fill('.', 5),
  '...' + fill('0', 26) + '...',
  OBS_WALL,
  OBS_WALL,
  '..0' + fill('d', 26) + '0..',
  OBS_WALL,
  OBS_WALL,
  '..0' + fill('e', 4) + '0qqqq0' + fill('e', 6) + '0qqqq0' + fill('e', 4) + '0..',
  '..0' + fill('e', 4) + '0qmqq0' + fill('e', 6) + '0qqmq0' + fill('e', 4) + '0..',
  '..0' + fill('e', 4) + '0qqqq0' + fill('e', 6) + '0qqqq0' + fill('e', 4) + '0..',
  '..0' + fill('e', 4) + '000000' + fill('e', 6) + '000000' + fill('e', 4) + '0..',
  OBS_WALL,
  OBS_WALL,
  '..0' + fill('d', 26) + '0..',
  '..0' + fill('d', 26) + '0..',
  OBS_WALL,
  OBS_WALL,
  '..0' + fill('e', 4) + '0pppp0' + fill('e', 6) + '0pppp0' + fill('e', 4) + '0..',
  '..0' + fill('e', 4) + '0ppmp0' + fill('e', 6) + '0pmpp0' + fill('e', 4) + '0..',
  '..0' + fill('e', 4) + '0pppp0' + fill('e', 6) + '0pppp0' + fill('e', 4) + '0..',
  '..0' + fill('e', 4) + '000000' + fill('e', 6) + '000000' + fill('e', 4) + '0..',
  OBS_WALL,
  OBS_WALL,
  '..0' + fill('d', 26) + '0..',
  OBS_WALL,
  OBS_WALL,
  '..0' + fill('e', 9) + '0jjjjjj0' + fill('e', 9) + '0..',
  '..0' + fill('e', 9) + '0jjjjjj0' + fill('e', 9) + '0..',
  '..0' + fill('e', 9) + '0jjjjjj0' + fill('e', 9) + '0..',
  '..0' + fill('e', 9) + '0jjojjj0' + fill('e', 9) + '0..',
  '..0' + fill('e', 9) + '0jjjjjj0' + fill('e', 9) + '0..',
  '..0' + fill('e', 9) + '0jjjjjj0' + fill('e', 9) + '0..',
  '..0' + fill('e', 9) + '0jjjjjj0' + fill('e', 9) + '0..',
  '..' + fill('0', 28) + '..',
  '...' + fill('1', 26) + '...',
];

// --- lab : 3x2 -> 48x32. Flat roof, vent pipes, a wall of bubbling flasks.
const LAB_VENT = fill('.', 8) + '0ee0' + fill('.', 24) + '0ee0' + fill('.', 8);
const LAB_WALL = '..0' + fill('e', 42) + '0..';
const B_LAB = [
  fill('.', 48),
  LAB_VENT,
  fill('.', 8) + '0ed0' + fill('.', 24) + '0de0' + fill('.', 8),
  LAB_VENT,
  LAB_VENT,
  fill('.', 8) + '0ed0' + fill('.', 24) + '0de0' + fill('.', 8),
  '..' + fill('0', 44) + '..',
  '..0' + fill('d', 42) + '0..',
  '..0' + fill('d', 42) + '0..',
  '..' + fill('0', 44) + '..',
  LAB_WALL,
  LAB_WALL,
  '..0ee0' + fill('0', 20) + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'aaaaaaaaaaaaaaaaaaaa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'aarraaaaaaappaaaaaaa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'aarraaaaaaappaaaaaaa' + '0eeeee0' + 'eee0jjoj0eee' + '0..',
  '..0ee0' + 'arrrraaaappppaaaraaa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'arrrraaaappppaarrraa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'arrrraaaappppaarrraa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'a0rr0aaaa0pp0aarrraa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'aa00aaaaaa00aaa000aa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'aaaaaaaaaaaaaaaaaaaa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + 'aaaaaaaaaaaaaaaaaaaa' + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  '..0ee0' + fill('0', 20) + '0eeeee0' + 'eee0jjjj0eee' + '0..',
  LAB_WALL,
  '..0' + fill('e', 11) + '0mm0' + fill('e', 12) + '0mm0' + fill('e', 11) + '0..',
  '..0' + fill('e', 11) + '0qq0' + fill('e', 12) + '0qq0' + fill('e', 11) + '0..',
  '..0' + fill('e', 11) + '0000' + fill('e', 12) + '0000' + fill('e', 11) + '0..',
  LAB_WALL,
  LAB_WALL,
  '..' + fill('0', 44) + '..',
  '...' + fill('1', 42) + '...',
];

// --- shrine : 1x2 -> 16x32. A small standing stone with a carved rune.
const B_SHRINE = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '....0ffffff0....',
  '...0ffffffff0...',
  '...0ffffffff0...',
  '...0ffeeeeff0...',
  '...0ffeppeff0...',
  '...0ffeppeff0...',
  '...0ffeeeeff0...',
  '...0ffffffff0...',
  '...0fffoofff0...',
  '...0ffffffff0...',
  '...0ffffffff0...',
  '...0ffeeffff0...',
  '...0ffffffff0...',
  '...0ffffeeff0...',
  '...0ffffffff0...',
  '...0eeeeeeee0...',
  '...0eeeeeeee0...',
  '...0eeeeeeee0...',
  '..0eeeeeeeeee0..',
  '..0eeeeeeeeee0..',
  '..0dddddddddd0..',
  '.0dddddddddddd0.',
  '.0dd33dd33dd3d0.',
  '.0dddddddddddd0.',
  '.00dddddddddd00.',
  '..000000000000..',
  '...1111111111...',
  '................',
];

// --- workshop : 3x3 -> 48x48. The big one: sawtooth north-light roof.
const WS_TOOTH = [
  '..............00',
  '............00kk',
  '..........00kkkk',
  '........00kkkkkk',
  '......00kkkkkkkk',
  '....00kkkkkkkkkk',
  '..00kkkkkkkkkkkk',
  '00kkkkkkkkkkkkkk',
  '0qqqqqqqqqqqqqq0',
  '0qmqqqqqqqmqqqq0',
  '0qqqqqqqqqqqqqq0',
  '0jjjjjjjjjjjjjj0',
];
const WS_WALL = '..0' + fill('e', 42) + '0..';
function wsFace(win, board) {
  return (
    '..0' + fill('e', 3) + '0' + win + '0' + fill('e', 6) + '0' + board + '0' + fill('e', 2) + '0..'
  );
}
function wsBench(bench, brazier) {
  return (
    '..0' + fill('e', 7) + '0' + bench + '0' + fill('e', 6) + '0' + brazier + '0' + fill('e', 7) + '0..'
  );
}
const WS_DOOR = (panelL, panelR) =>
  '..0' + fill('e', 13) + '0' + panelL + '0' + panelR + '0' + fill('e', 14) + '0..';
const B_WORKSHOP = [
  fill('.', 48),
  fill('.', 48),
  ...WS_TOOTH.map((r) => r + r + r),
  fill('0', 48),
  '..0' + fill('k', 42) + '0..',
  '..' + fill('0', 44) + '..',
  WS_WALL,
  WS_WALL,
  wsFace(fill('m', 14), fill('l', 13)),
  wsFace('qqqqqqqqqqqqqq', 'lloolllooolll'),
  wsFace('qqmqqqqqqmqqqq', 'lo0ol0o0olo0l'),
  wsFace('qqqqqqqqqqqqqq', 'l0000l000l000'),
  wsFace('qqqqmqqqqqqqqq', 'llllllllllllk'),
  wsFace(fill('0', 14), fill('l', 13)),
  WS_WALL,
  '..0' + fill('e', 42) + '0..',
  '..0' + fill('d', 42) + '0..',
  WS_WALL,
  WS_WALL,
  wsBench(fill('k', 14), 'nnnn'),
  wsBench(fill('j', 14), 'nooo'),
  wsBench('j0jjjjjjjjjj0j', 'nnon'),
  wsBench('j0jjjjjjjjjj0j', '0000'),
  wsBench(fill('0', 14), fill('e', 4)),
  WS_WALL,
  WS_WALL,
  '..0' + fill('e', 42) + '0..',
  WS_DOOR(fill('j', 6), fill('j', 6)),
  WS_DOOR(fill('j', 6), fill('j', 6)),
  WS_DOOR('jjjjoj', 'jojjjj'),
  WS_DOOR(fill('j', 6), fill('j', 6)),
  WS_DOOR(fill('j', 6), fill('j', 6)),
  WS_DOOR(fill('j', 6), fill('j', 6)),
  WS_DOOR(fill('j', 6), fill('j', 6)),
  '..' + fill('0', 44) + '..',
  '...' + fill('1', 42) + '...',
  fill('.', 48),
];

// --- trading_post : 3x2 -> 48x32. A market stall: striped awning on posts,
//     a shelf of wares behind the counter, crates stacked out front.
const TP_AWNING = '..0' + 'ssssmmmm'.repeat(5) + 'ss' + '0..';
function tpShelf(a, b, c) {
  return '..0kk0' + 'jj0' + a + '0jjjj0' + b + '0jjjj0' + c + '0jj' + '0kk0..';
}
const TP_CRATE = [
  '0llllll0',
  '0l0kk0l0',
  '0lkkkkl0',
  '0lkkkkl0',
  '0l0kk0l0',
  '0llllll0',
];
function tpCrateRow(i) {
  const c = TP_CRATE[i];
  return fill('.', 4) + c + fill('.', 8) + c + fill('.', 8) + c + fill('.', 4);
}
const B_TRADING_POST = [
  fill('.', 48),
  fill('.', 48),
  fill('.', 48),
  '..' + fill('0', 44) + '..',
  '..0' + fill('k', 42) + '0..',
  '..' + fill('0', 44) + '..',
  TP_AWNING,
  TP_AWNING,
  TP_AWNING,
  TP_AWNING,
  TP_AWNING,
  TP_AWNING,
  '..' + fill('0', 44) + '..',
  '..0' + '00..'.repeat(10) + '00' + '0..',
  tpShelf('oooooo', 'rrrrrr', 'pppppp'),
  tpShelf('o0oo0o', 'r0rr0r', 'p0pp0p'),
  tpShelf('oooooo', 'rrrrrr', 'pppppp'),
  tpShelf('000000', '000000', '000000'),
  '..0kk0' + fill('j', 36) + '0kk0..',
  '..' + fill('0', 44) + '..',
  '..0' + fill('l', 42) + '0..',
  '..0' + fill('l', 42) + '0..',
  '..' + fill('0', 44) + '..',
  fill('.', 48),
  tpCrateRow(0),
  tpCrateRow(1),
  tpCrateRow(2),
  tpCrateRow(3),
  tpCrateRow(4),
  tpCrateRow(5),
  '..' + fill('0', 44) + '..',
  '...' + fill('1', 42) + '...',
];

// --- archive : 2x2 -> 32x32. Stone hall, pedimented roof, tall narrow windows.
const ARC_WALL = '..0' + fill('e', 26) + '0..';
function arcWin(a, b) {
  return '..0' + fill('e', 4) + '0' + a + '0' + fill('e', 8) + '0' + b + '0' + fill('e', 4) + '0..';
}
function arcDoor(mid) {
  return '..0' + fill('e', 9) + '0' + mid + '0' + fill('e', 9) + '0..';
}
const B_ARCHIVE = [
  fill('.', 32),
  fill('.', 32),
  fill('.', 15) + '00' + fill('.', 15),
  fill('.', 13) + '0ffff0' + fill('.', 13),
  fill('.', 11) + '0ffffffff0' + fill('.', 11),
  fill('.', 9) + '0' + fill('f', 12) + '0' + fill('.', 9),
  fill('.', 7) + '0' + fill('f', 16) + '0' + fill('.', 7),
  fill('.', 5) + '0' + fill('f', 20) + '0' + fill('.', 5),
  fill('.', 3) + '0' + fill('f', 24) + '0' + fill('.', 3),
  '.0' + fill('f', 28) + '0.',
  fill('0', 32),
  '..0' + fill('e', 26) + '0..',
  '..0' + fill('d', 26) + '0..',
  '..' + fill('0', 28) + '..',
  arcWin('000', '000'),
  arcWin('0q0', '0q0'),
  arcWin('qqq', 'qqq'),
  arcWin('qmq', 'qqq'),
  arcWin('qqq', 'qmq'),
  arcWin('qqq', 'qqq'),
  arcWin('qqq', 'qqq'),
  arcWin('qmq', 'qqq'),
  arcWin('qqq', 'qqq'),
  arcWin('000', '000'),
  ARC_WALL,
  ARC_WALL,
  arcDoor('jjjjjj'),
  arcDoor('jjjjjj'),
  arcDoor('jjojjj'),
  arcDoor('jjjjjj'),
  '..' + fill('0', 28) + '..',
  '...' + fill('1', 26) + '...',
];

// --- dark box : 16x16 ominous crate
const B_BOX_DARK = [
  '................',
  '..000000000000..',
  '..0uuuuuuuuuu0..',
  '..0upp0000ppu0..',
  '..0uu0pppppuu0..',
  '..0uu0p000puu0..',
  '..0uu0p0p0puu0..',
  '..0uu0p0p0puu0..',
  '..0uu0p000puu0..',
  '..0uu0pppppuu0..',
  '..0upp0000ppu0..',
  '..0uuuuuuuuuu0..',
  '..0u00uuuu00u0..',
  '..000000000000..',
  '...1111111111...',
  '................',
];

/* ================================================================== *
 * SPRITE TABLE
 * ================================================================== */

const T16 = { w: 16, h: 16 };
/** Ground with real relief — the rasteriser lights its faces from the top-left. */
const T16R = { w: 16, h: 16, shade: 0.85 };
/** Characters: enough rim light to lift them off the ground, not enough to fry them. */
const T16P = { w: 16, h: 16, shade: 0.7 };

/**
 * Art that is TALLER than the ground it stands on, in tiles.
 *
 * Sprites are drawn bottom-aligned to their footprint, so extra height rises
 * above the building instead of spilling onto the tiles below. The mountain
 * needs a lot of it: its footprint is the cave mouth, not the peak.
 */
const BUILDING_OVERHANG = Object.freeze({ stonemason_camp: 3 });

function bSize(id) {
  const f = BUILDING_FOOTPRINT[id] || { w: 2, h: 2 };
  const extra = BUILDING_OVERHANG[id] || 0;
  // Buildings take the full lighting pass: a warm lit face on the sun side and
  // a cool one away from it is the whole difference between "box" and "house".
  return { w: f.w * TILE, h: (f.h + extra) * TILE, label: id, shade: 1 };
}


/* ------------------------------------------------------------------ *
 * v5 — the outlanders and the Exchange.
 *
 * These three buildings existed in the data with no art at all, which is why
 * walking to them showed an empty patch of ground and the vendors were
 * invisible. Drawn bottom-aligned to their footprint like every other building,
 * so a tall sprite (the mountain especially) overhangs upward.
 * ------------------------------------------------------------------ */

/**
 * THE MOUNTAIN. Home of the Stonemason, in the south-east.
 *
 * 48 wide (its 3-tile footprint) and 56 tall, so the peak rises well above the
 * ground it stands on. The mouth is cut at the bottom centre and left dark —
 * the chamber behind it is real floor you can walk into, and the roof over it
 * lifts when you do (see the roof pass in world.js).
 */
const B_STONEMASON = (() => {
  const W = 5 * 16;         // footprint width
  const H = (2 + 3) * 16;   // footprint + overhang
  const rows = [];
  // A symmetric massif: the peak is 6 wide at the top and the flanks widen to
  // the full 48 by the base. Written as a shape function rather than 64 hand
  // -typed strings so the silhouette stays smooth and stays symmetric.
  // The profile. Not a triangle: a mountain read as a cone is a tent, and a
  // cone with a straight edge reads as a pyramid. This eases outward (so the
  // shoulders round off rather than meeting the ground at a corner) and carries
  // a slow wobble down each flank so the two sides are never the same line.
  const halfAt = (y) => {
    const t = y / (H - 1);
    const eased = Math.pow(t, 1.6);                 // steep peak, flaring base
    const wobble = 2.2 * Math.sin(t * 7.5) + 1.4 * Math.sin(t * 3.1 + 1.7);
    return Math.max(4, Math.round(4 + eased * 32 + wobble));
  };
  // A second, independent wobble applied to the LEFT edge only, so the massif
  // is asymmetric the way real rock is instead of mirror-perfect.
  const leanAt = (y) => {
    const t = y / (H - 1);
    return 1.8 * Math.sin(t * 5.2 + 0.6) + 1.1 * Math.sin(t * 11.0);
  };
  const MOUTH_H = 14;
  const MOUTH_HALF = 7;

  for (let y = 0; y < H; y += 1) {
    const half = halfAt(y);
    const cells = new Array(W).fill('.');
    const lean = leanAt(y);
    for (let x = 0; x < W; x += 1) {
      const off = x - (W / 2 - 0.5);
      // The lean pushes the left flank in and out independently of the right.
      const d = off < 0 ? Math.abs(off) + lean : Math.abs(off);
      if (d > half) continue;
      const edge = d > half - 1.2;
      if (edge) { cells[x] = '0'; continue; }         // outline
      if (y < H * 0.18) { cells[x] = d > half - 2.4 ? 'm' : '9'; continue; }  // snow cap
      if (y < H * 0.28) { cells[x] = d > half - 2 ? 'f' : 'm'; continue; }    // melt line
      // rock: lighter on the sun side (up-and-left), darker away from it
      // Rock face. The first pass used a clean sine, which striped the whole
      // mountain like a barber's pole. Two out-of-phase waves at different
      // frequencies break the regularity into something closer to crags, and
      // the highlight is rationed to the sunward flank so it reads as light on
      // rock rather than paint.
      const lit = off < -half * 0.15;
      const crag = Math.sin(d * 0.42 + y * 0.11) + 0.6 * Math.sin(d * 1.13 - y * 0.05);
      if (lit) cells[x] = crag > 1.0 ? 'f' : (crag > -0.2 ? 'e' : 'd');
      else cells[x] = crag > 1.15 ? 'e' : 'd';
    }
    // the cave mouth, cut into the base
    if (y >= H - MOUTH_H) {
      const floor = y >= H - 2;
      for (let x = 0; x < W; x += 1) {
        const d = Math.abs(x - (W / 2 - 0.5));
        if (d > MOUTH_HALF) continue;
        if (d > MOUTH_HALF - 1) cells[x] = '0';
        else cells[x] = floor ? '1' : (y === H - MOUTH_H ? '0' : '1');
      }
    }
    rows.push(cells.join(''));
  }
  return rows;
})();

/**
 * THE WOODSMAN'S CAMP. A lean-to and a stack of cut logs, in the south-west
 * woods. Deliberately small and low: he is hidden by trees, not by rock.
 */
const B_WOODSMAN = [
  '................................',
  '................................',
  '................................',
  '..............00................',
  '............00ll00..............',
  '..........00llllll00............',
  '........00llllllllll00..........',
  '......00llllllllllllll00........',
  '....00llllllllllllllllll00......',
  '..00llllllllllllllllllllll00....',
  '.0kkkkkkkkkkkkkkkkkkkkkkkkkk0...',
  '.0jjjjjjjjjjjjjjjjjjjjjjjjjj0...',
  '.0j......................jj0....',
  '.0j...0000....0000.......jj0....',
  '.0j..0kkkk0..0kkkk0......jj0....',
  '.0j..0kjjk0..0kjjk0......jj0....',
  '.0j..0kkkk0..0kkkk0......jj0....',
  '.0j...0000....0000.......jj0....',
  '.0j......................jj0....',
  '.0j..000..000..000.......jj0....',
  '.0j.0jkj00jkj00jkj0......jj0....',
  '.0j.0jjj00jjj00jjj0......jj0....',
  '.0j..000..000..000.......jj0....',
  '.0jjjjjjjjjjjjjjjjjjjjjjjjj0....',
  '..0000000000000000000000000.....',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

/**
 * THE EXCHANGE. A canopied stall with the roulette table out front — the wheel
 * is the pale disc on the table top. Scenery, and the panel says so.
 */
const B_EXCHANGE = [
  '................................................',
  '.....................0000.......................',
  '..................000oooo000....................',
  '...............000oooooooooo000.................',
  '............000oooooooooooooooo000..............',
  '.........000oooooooooooooooooooooo000...........',
  '......0000oooooooooooooooooooooooooo0000........',
  '....00pppppppppppppppppppppppppppppppppp00......',
  '....0pppppppppppppppppppppppppppppppppppp0......',
  '....00pppppppppppppppppppppppppppppppppp00......',
  '.....0j0..............................0j0.......',
  '.....0j0..............................0j0.......',
  '.....0j0..............................0j0.......',
  '.....0j0..............................0j0.......',
  '.....0j0..............................0j0.......',
  '.....0j0..............................0j0.......',
  '.....0j0..............................0j0.......',
  '.....0j0...0000000000000000000000.....0j0.......',
  '.....0j0..0kkkkkkkkkkkkkkkkkkkkkk0....0j0.......',
  '.....0j0.0kkkk000000000000kkkkkkkk0...0j0.......',
  '.....0j0.0kkk0mmmmmmmmmmmm0kkkkkkk0...0j0.......',
  '.....0j0.0kkk0mm0mm0mm0mm00kkkkkkk0...0j0.......',
  '.....0j0.0kkk0mmmmoommmmmm0kkkkkkk0...0j0.......',
  '.....0j0.0kkk0mm0mm0mm0mm00kkkkkkk0...0j0.......',
  '.....0j0.0kkkk0mmmmmmmmmm0kkkkkkkk0...0j0.......',
  '.....0j0..0kkkk0000000000kkkkkkkkk0...0j0.......',
  '.....0j0...0kkkkkkkkkkkkkkkkkkkkk0....0j0.......',
  '.....000....000000000000000000000.....000.......',
  '.....................0jj0.......................',
  '.....................0jj0.......................',
  '.....................0jj0.......................',
  '.....................0000.......................',
];

/**
 * THE VENDORS THEMSELVES.
 *
 * Bruno: "where is the npc?" — the buildings had no art and no one standing at
 * them. Each vendor is the player's own standing frame recoloured, so an NPC
 * reads as the same KIND of thing as the character without needing a second
 * animation system. They never move; world.js stands them in front of their
 * building and depth-sorts them with everything else.
 */
function npcSprite(map) {
  return makeSprite(remapRows(P_DOWN_0, map), PAL, T16P);
}

/**
 * THE HERALD, mounted — TWO FRAMES.
 *
 * 24x24, half a tile taller and wider than a standing NPC, because a man on a
 * horse should not read as a man.
 *
 * The rider is identical in both frames — hood, face, shoulders, cloak — and
 * ONLY THE LEGS move: fore-forward/hind-back, then swapped. That is what a walk
 * cycle is at this scale, and animating the rider too would read as a wobble
 * rather than a canter. Bruno, 2026-08-31: "the horse needs to move its legs
 * when walking and the rider needs to be a bit more real."
 *
 * Facing RIGHT: he only ever rides east and stops facing the plaza, so there is
 * no second direction to draw. Frame A is also the standing pose — a horse at
 * rest has its legs apart, not mid-stride.
 */
const HERALD_MOUNTED_A = [
  '........................',
  '..............0000......',
  '.............0uvvu0.....',
  '............0uvvvvu0....',
  '............0ttttt0.....',
  '............0t00t0......',
  '............0tttt0......',
  '.............0tt0.......',
  '...........00vvvv00.....',
  '..........0uvvvvvvu0....',
  '..........0uvvvvvvu0....',
  '..........0uvvvvvvu0....',
  '.........0uvvvvvvvu0....',
  '...000...0kkkkkkkkkk0...',
  '..0kEk0.0kkkkkkkkkkkk0..',
  '..0kkEkkkkkkkkkkkkkkkk0.',
  '..0kk0kkkkkkkkkkkkkkkk0j',
  '..00.0kkkkkkkkkkkkkkkk0j',
  '.....0kkkkkkkkkkkkkkkk0j',
  '.....0kk0kkkk0kkkk0kkk0.',
  '.....0k0..0k0.0kk0..0k0.',
  '.....0k0..0k0.0kk0..0k0.',
  '.....0j0..0j0..0j0..0j0.',
  '.....000..000..000..000.',
];

const HERALD_MOUNTED_B = [
  '........................',
  '..............0000......',
  '.............0uvvu0.....',
  '............0uvvvvu0....',
  '............0ttttt0.....',
  '............0t00t0......',
  '............0tttt0......',
  '.............0tt0.......',
  '...........00vvvv00.....',
  '..........0uvvvvvvu0....',
  '..........0uvvvvvvu0....',
  '..........0uvvvvvvu0....',
  '.........0uvvvvvvvu0....',
  '...000...0kkkkkkkkkk0...',
  '..0kEk0.0kkkkkkkkkkkk0..',
  '..0kkEkkkkkkkkkkkkkkkk0.',
  '..0kk0kkkkkkkkkkkkkkkk0j',
  '..00.0kkkkkkkkkkkkkkkk0j',
  '.....0kkkkkkkkkkkkkkkk0j',
  '.....0kkk0kkk0kkk0kkkk0.',
  '....0k0..0k0...0k0.0k0..',
  '....0k0..0k0...0k0.0k0..',
  '....0j0..0j0...0j0.0j0..',
  '....000..000...000.000..',
];

/**
 * THE STORAGE HUT, north-east. 48x32 — three tiles wide, two deep, plus the
 * overhang every building here has.
 *
 * Two states. SHUT has a plank door with an iron ring; OPEN swaps the door for
 * the dark inside, which is the honest way to show a door somebody has come out
 * of — a hut you can see into is a hut that has been opened.
 *
 * Generated from a shape function rather than typed out: 48 characters a row,
 * 32 rows, twice, is a width mismatch waiting to happen, and the rasteriser only
 * tells you AFTER it has drawn nothing.
 */
const HUT_SHUT_ROWS = [
  '................................................',
  '................................................',
  '.......0RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR0.......',
  '......TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT......',
  '.....0TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT0.....',
  '....0RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR0....',
  '...0RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR0...',
  '.0SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS0.',
  '.0kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk000000000000kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk0jjjjjjjooj0kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0jjjjjjjjjj0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk000000000000kkkkkkkkkkkkkkkk0.',
  '.0000000000000000000000000000000000000000000000.',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
];

const HUT_OPEN_ROWS = [
  '................................................',
  '................................................',
  '.......0RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR0.......',
  '......TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT......',
  '.....0TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT0.....',
  '....0RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR0....',
  '...0RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR0...',
  '.0SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS0.',
  '.0kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk000000000000kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkkkk0.',
  '.0kllkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkllk0.',
  '.0kkkkkkkkkkkkkkkk0xxxxxxxxxx0kkkkkkkkkkkkkkkk0.',
  '.0kkkkkkkkkkkkkkkk000000000000kkkkkkkkkkkkkkkk0.',
  '.0000000000000000000000000000000000000000000000.',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
];

/**
 * THE WOODEN BOAT. 16x16, drawn on the water — a shallow hull with a thwart
 * across it. She is not much; the Hutkeeper says so himself.
 */
const BOAT_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '....00000000....',
  '...llllllllll...',
  '..0jjjjjjjjjj0..',
  '.0jjjjjjjjjjjj0.',
  '.0jjjkkkkkkjjj0.',
  '..0jjjjjjjjjj0..',
  '...0jjjjjjjj0...',
  '....00000000....',
  '................',
  '................',
  '................',
  '................',
];

export const HUT_SPRITES = Object.freeze({
  shut: makeSprite(HUT_SHUT_ROWS, PAL, { w: 48, h: 32, label: 'hutShut' }),
  open: makeSprite(HUT_OPEN_ROWS, PAL, { w: 48, h: 32, label: 'hutOpen' }),
});
export const BOAT_SPRITE = makeSprite(BOAT_ROWS, PAL, { w: 16, h: 16, label: 'boat' });

export const NPC_SPRITES = Object.freeze({
  // grey stone-dusted coat, pale hair
  stonemason: npcSprite({ v: 'f', u: 'e', k: 'd', j: '6' }),
  // green woods coat, brown hair
  woodsman: npcSprite({ v: 'j', u: 'g', k: 'k', j: '6' }),
  // purple stall coat, gold trim
  exchange: npcSprite({ v: 'p', u: 'p', k: 'o', j: '6' }),
  // Pale from years indoors, in a faded coat.
  hutkeeper: npcSprite({ v: 'z', u: 'B', k: 'I', j: '6' }),
});

/**
 * The Herald on his horse. Not in NPC_SPRITES: a different size, and two
 * frames. Index 0 is also the standing pose.
 */
export const HERALD_FRAMES = Object.freeze([
  makeSprite(HERALD_MOUNTED_A, PAL, { w: 24, h: 24, label: 'herald0' }),
  makeSprite(HERALD_MOUNTED_B, PAL, { w: 24, h: 24, label: 'herald1' }),
]);
/** Kept for callers that just want him standing. */
export const HERALD_SPRITE = HERALD_FRAMES[0];

const BUILDING_ROWS = {
  study_hut: B_STUDY_HUT,
  library: B_LIBRARY,
  forge: B_FORGE,
  observatory: B_OBSERVATORY,
  lab: B_LAB,
  shrine: B_SHRINE,
  workshop: B_WORKSHOP,
  trading_post: B_TRADING_POST,
  archive: B_ARCHIVE,
  // v5
  exchange_post: B_EXCHANGE,
  woodsman_camp: B_WOODSMAN,
  // The peak sprite is deliberately NOT used. Bruno: "remove this mountain
  // icon. just the peak. the stone blocks and everything else is alright." The
  // massif of stone tiles reads as the mountain on its own; the drawn peak on
  // top of it was a second mountain sitting on the first. B_STONEMASON is kept
  // (unused) rather than deleted in case a peak is wanted again on a taller map.
  stonemason_camp: [],
};

const buildings = {};
for (const id of BUILDING_IDS) {
  const rows = BUILDING_ROWS[id];
  buildings[id] = makeSprite(rows || [], PAL, bSize(id));
}

/* ------------------------------------------------------------------ *
 * Ground tiers. Each ground material exists in three colour temperatures:
 * SHADE (cool, teal-shifted), MID (the authored base) and SUN (warm,
 * yellow-shifted). world.js chooses the tier from a low-frequency noise
 * field, so light pools across the meadow in broad patches instead of
 * flickering per tile.
 * ------------------------------------------------------------------ */
const GRASS_BASES = [GRASS_0, GRASS_1, GRASS_2];
const SAND_BASES = [SAND_0, SAND_1];
const PATH_BASES = [PATH_0, PATH_1];

function tierSet(bases, map) {
  return bases.map((rows) => makeSprite(map ? remapRows(rows, map) : rows, PAL, T16));
}

const GRASS_TIERS = {
  shade: tierSet(GRASS_BASES, SHADY),
  mid: tierSet(GRASS_BASES, null),
  sun: tierSet(GRASS_BASES, SUNNY).concat([
    makeSprite(remapRows(GRASS_FLOWERS, SUNNY), PAL, T16),
  ]),
};
const SAND_TIERS = {
  shade: tierSet(SAND_BASES, { '8': '7', '9': '8' }),
  mid: tierSet(SAND_BASES, null),
  sun: tierSet(SAND_BASES, { '8': '9', '9': 'm' }),
};
const PATH_TIERS = {
  shade: tierSet(PATH_BASES, { '7': '6', '6': 'j', '8': '7' }),
  mid: tierSet(PATH_BASES, null),
  sun: tierSet(PATH_BASES, { '7': 'l', '6': '7', '8': 'l' }),
};

/** Four rolled frames of the swell, so open water is never static. */
const WATER_FRAMES = [0, 1, 2, 3].map((i) =>
  makeSprite(rollRows(WATER_0, i * 2, i), PAL, T16)
);

// A tree drawn flat into one tile. Kept only so SPRITES.tiles.tree still
// exists for the v1 contract — the world renders trees as objects (see art.js)
// so they can sway, overhang and cast a contact shadow.
// The canopy is shaded as a contiguous right-hand edge. An earlier version
// stepped the darkest tone (M) diagonally through the crown, which at 3-4x
// scale read as a stray branch poking out of every tree.
const TREE_TILE_0 = [
  '3333333333333333',
  '3333333333333333',
  '33333KKKKK333333',
  '3333KKKKKKKh3333',
  '333KKKKKKLLhh333',
  '33KKKKKKLLLhhM33',
  '33KKKKKLLLLhhM33',
  '33KKKKKLLLhhhM33',
  '333KKKLLLhhhM333',
  '3333KKLLLhhM3333',
  '33333LLhhhM33333',
  '3333333jD3333333',
  '3333333jD3333333',
  '333333DjDD333333',
  '3333300000333333',
  '3333333333333333',
];

/**
 * THE BLUE BLOOM — the one on the map, in the north-west.
 *
 * Read as a fungus rather than a tree: a wide domed cap with a dark gill line
 * under it and a fat pale stalk, in the water palette so it is unmistakably
 * cold against a wood full of warm greens. Lit from the top-left like
 * everything else — the F highlights are on the left of the cap and the left of
 * the stalk, the b/a shading on the right and underneath.
 */
const BLOOM_TILE_0 = [
  '3333333333333333',
  '3333333333333333',
  '333333cccc333333',
  '3333ccFFFFcc3333',
  '333cFFFFcccccb33',
  '33cFFFcccccccbb3',
  '33cFFccccccccbb3',
  '3bbbbbbbbbbbbbb3',
  '33aaaaaaaaaaaa33',
  '3333PPPPPPPP3333',
  '333333FPPb333333',
  '333333FPPb333333',
  '333333FPPb333333',
  '33333FPPPPb33333',
  '3333FPPPPPPb3333',
  '3333300000333333',
];

/** What is left after it is cut: the stalk, sheared off at the ground. */
const BLOOM_STUMP_0 = [
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '3333333333333333',
  '333333aaaa333333',
  '33333aPPPPa33333',
  '3333aPFPPbPa3333',
  '3333aPPPPPPa3333',
  '33333aaaaaa33333',
  '3333300000333333',
];

/* ------------------------------------------------------------------ *
 * THE SNOWFALL REACHES — the second map's ground.
 *
 * Generated from shape functions with a deterministic scatter rather than
 * hand-typed: 16 rows of 16 is where width mistakes hide, and a RANDOM scatter
 * would shimmer between frames because these are rebuilt per draw call.
 * ------------------------------------------------------------------ */
const SNOW_0 = [
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOFFOOOOFOO',
  'mOOOOOOFOOOOOFOO',
  'OOOOOmOFOOOOOOOF',
  'OOOOOOmOOOOOOOOO',
  'OOOmFmOFOOOOOOmO',
  'OOOOOOOOOOOOOOOO',
  'OOFOOmOOOOOmOOOO',
  'OOOFFmOOmOOOOOOO',
  'OOOmOOOOOOOOOOOO',
  'OOOFOOOOOOOFOOOO',
  'OOOOOmOOFOOOFOFO',
  'OOFOOOFOOOOOOmOO',
  'OOFOOOOOOOOOOOOF',
  'OOOOOOFOFOOOOOOO',
  'OOOOOOOOOOFOOOFO',
];
const ICE_0 = [
  'cFcccFcccccccccc',
  'cccccccccccccccc',
  'ccccccccFccFcccc',
  'ccccccccccbccccc',
  'cccFcccFccbccccc',
  'FcccFFccccbccccc',
  'Fcbbbbbbbbbbbbcc',
  'FccbFcccccbccccc',
  'FcccbcccFcbcccFF',
  'cccFcccFccbccccc',
  'FcccccccccbccFcc',
  'cccccccFcFbccccc',
  'cFccccFccccccccc',
  'cccccccccccccccc',
  'cccccccccFcccccc',
  'ccccFcccccccccFc',
];
const CRAG_0 = [
  'ffffffffffffffff',
  'feeeeeeeedeeeeee',
  'feeGeeeeeeGdeeee',
  'feeededeeeeeeeee',
  'feeeeeeeeedeeedG',
  'feeGeeeGeGdeeeee',
  'feGeeeeeeeeeeede',
  'fedeeedeGeeeeeee',
  'fdeeeeeeeeeeGeed',
  'feeeedeeeeeeeeed',
  'feeeedeeeeeeedGd',
  'fdGdededGeeGedeG',
  'feeeeeeeeeeeeeee',
  'feeeeeeeGeeedeed',
  'feeGeeeeeedeeeee',
  'feeeeeeeeddeeeee',
];
const SNOWPINE_0 = [
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOO',
  'OOOOOOO00OOOOOOO',
  'OOOOOO0MM0OOOOOO',
  'OOOOOO0FF0OOOOOO',
  'OOOOO0MMMM0OOOOO',
  'OOOOO0FFFM0OOOOO',
  'OOOO0MMMMMM0OOOO',
  'OOOO0FFFMMM0OOOO',
  'OOO0MMMMMMMM0OOO',
  'OOO0FFFMMMMM0OOO',
  'OOOOOO0DD0OOOOOO',
  'OOOOOO0DD0OOOOOO',
  'OOOOOO0DD0OOOOOO',
  'OOOOO000000OOOOO',
  'OOOOOOOOOOOOOOOO',
];

/* ------------------------------------------------------------------ *
 * v7 — THE MOUNTAIN. Cliff faces, ladders, stairs, cracked rock, ice
 * gates, pressure plates, and what stands in front of the cave.
 * ------------------------------------------------------------------ */

// RIMEWALL — piled stone bound in ice, and the one wall in the game no tool
// touches. Deliberately reads as MASONRY rather than as rock: a wall you cannot
// break has to look built, or players will keep swinging at it.
const RIMEWALL_0 = [
  'GGGGGGGGGGGGGGGG',
  'GffffffGfffffffG',
  'Gfeeeeefeeeeeeff',
  'GfeeeeefeeeeeefF',
  'Gfeeeeefeeeeeeff',
  'Gffffffffffffffff'.slice(0, 16),
  'GfeeefeeeeeefeeG',
  'GfeeefeeeeeefeeG',
  'GFeeefeeeeeefeeG',
  'Gfeeefeeeeeefeef',
  'Gffffffffffffffff'.slice(0, 16),
  'Gfeeeeeeefeeeeef',
  'GfeeeeeeefeeeeeF',
  'Gfeeeeeeefeeeeef',
  'Gdddddddddddddddd'.slice(0, 16),
  '1111111111111111',
];

// A flight of steps CUT INTO ROCK, seen from above and in front: dark stone
// cheeks either side, treads catching the light along their northern lip. The
// first version was flat stripes on open ground, which read as a zebra crossing.
const STAIR_1 = [
  'ddGGGGGGGGGGGGdd',
  'ddffffffffffffdd',
  'ddeeeeeeeeeeeedd',
  'dd111111111111dd',
  'ddGGGGGGGGGGGGdd',
  'ddffffffffffffdd',
  'ddeeeeeeeeeeeedd',
  'dd111111111111dd',
  'ddGGGGGGGGGGGGdd',
  'ddffffffffffffdd',
  'ddeeeeeeeeeeeedd',
  'dd111111111111dd',
  'ddGGGGGGGGGGGGdd',
  'ddffffffffffffdd',
  'ddeeeeeeeeeeeedd',
  'dd111111111111dd',
];

// A LIT BRAZIER: an iron bowl on three legs with a fire in it. Warm, and the
// only warm thing in a stone room — which is what a brazier is for.
const BRAZIER_0 = [
  '................',
  '.......nn.......',
  '......nyyn......',
  '.....nyoyyn.....',
  '....nyoooyyn....',
  '....nyooooyn....',
  '.....nyooyn.....',
  '...0QQQQQQQQ0...',
  '..0QzzzzzzzzQ0..',
  '..0QzAAAAAAzQ0..',
  '...0QzzzzzzQ0...',
  '....0QQQQQQ0....',
  '......0QQ0......',
  '.....0Q00Q0.....',
  '....0Q0..0Q0....',
  '....00....00....',
];

// A STACK OF CRATES: banded wood, a garrison's clutter. Solid.
const CRATE_0 = [
  '................',
  '..000000000000..',
  '..0llkkllkkll0..',
  '..0lkkllkkllk0..',
  '..0kQQQQQQQQk0..',
  '..0lkkllkkllk0..',
  '..0llkkllkkll0..',
  '..000000000000..',
  '.0000000000000..',
  '.0jkkllkkllkj0..',
  '.0jkQQQQQQQkj0..',
  '.0jkkllkkllkj0..',
  '.0jllkkllkklj0..',
  '.0jkkllkkllkj0..',
  '.0000000000000..',
  '................',
];

// A LOCKED DOOR: banded oak with an iron plate and a keyhole you can read from
// across the room. It has to look like a KEY opens it, not a lever or a plate.
const LOCKDOOR_0 = [
  '0000000000000000',
  '0kkllkkllkkllkk0',
  '0kllkkllkkllkkl0',
  '0kkQQQQQQQQQQkk0',
  '0klQzzzzzzzzQlk0',
  '0kkQzzz00zzzQkk0',
  '0klQzzz00zzzQlk0',
  '0kkQzzzz00zzQkk0',
  '0klQzzzz00zzQlk0',
  '0kkQzzzzzzzzQkk0',
  '0klQQQQQQQQQQlk0',
  '0kkllkkllkkllkk0',
  '0kllkkllkkllkkl0',
  '0kkllkkllkkllkk0',
  '0kllkkllkkllkkl0',
  '0000000000000000',
];

// A ROAD IN THE SNOW: grit and packed ice trodden into a paler band, with the
// snow still lying at its edges. Warm greys, so it reads as a way through
// rather than as another kind of ground.
const SNOWROAD_0 = [
  'OOBOOBOOOBOOOOBO',
  'BOOBBOzOBOOBBOOB',
  'OBzBBOOBBBOzBBOO',
  'BOBBOOBBzBOBBOBB',
  'OBBOBzBOBBOOBBBO',
  'BOOBBOBBzOBBOOBB',
  'OBzBBOOBBOBzBBOO',
  'BOBBOBBOBBOOBBzB',
  'OOBBzBOBBOBBOOBO',
  'BOBBOOBzBBOBBOBB',
  'OBBOBBOBBzOBBOOB',
  'BzBBOOBBOBBOzBBO',
  'OBBOBzBBOOBBBOBB',
  'BOOBBOBBzBOBBOOB',
  'OBzBOOBBOBBOBzBO',
  'OOBOOBOOBOOOBOOO',
];

// A BRICKED DOORWAY AFTER THE HAMMER. Dark floor, the broken-off jambs still
// standing at each side, and the rubble you knocked out lying where it fell.
// Without this a broken wall went on being drawn as a wall: the tile map still
// says "crackedcrag" there forever, and nothing replaced it — so the doorway
// you had just opened looked exactly as shut as before you swung.
const BROKENWALL_0 = [
  'GffdddddddddffGf',
  'ffedddddddddeffe',
  'fedddddddddddefe',
  'edd1ddd1ddd1ddde',
  'edddddddddddddde',
  'ed1dddddd1dddd1d',
  'dddddddddddddddd',
  'ddddeGdddddddddd',
  'dddffedddGfeddd1',
  'dd1feeddddefeddd',
  'dddeed1dddeeeddd',
  'dGfdddddddddddGf',
  'dffeddGfeddddffe',
  'defeddffedd1defe',
  'ddeeddefeddddeed',
  'd1dddddeed1ddd1d',
];

// Worn cave floor: flagstones ground flat by a very long occupancy.
// DARK. A dungeon floor has to sit well below its walls in value or the room
// reads as one undifferentiated mass of stone — which is exactly how the first
// cut looked: you could not tell a chamber from the rock it was cut out of.
const ROCKFLOOR_0 = [
  'dddd1ddddddd1ddd',
  'd1dddddd1ddddddd',
  'ddddd1dddddddd1d',
  'dd1ddddddd1ddddd',
  'ddddddd11ddddddd',
  'd1ddddddddddd1dd',
  'dddd11dddddddddd',
  'ddd1ddddddd1dddd',
  'ddddddddd1dddddd',
  'd11dddddddddddd1',
  'dddddd1ddddddddd',
  'dddddddddd11dddd',
  'd1ddd1ddddddddd1',
  'ddddddddd1dddddd',
  'ddd1dddddddd11dd',
  'ddddddd1dddddddd',
];

// A cliff FACE: rock seen edge-on, dark at the bottom where no light reaches.
const CLIFF_0 = [
  'GGffGGffGGffGGff',
  'ffeeffeeffeeffee',
  'feeeeefeeeefeeee',
  'eeedeeeeedeeeeed',
  'eeeeeedeeeeeddee',
  'edeeeeeeedeeeeee',
  'eeeddeeeeeeeedee',
  'deeeeeeddeeeeeee',
  'eedeeeeeeeedeeed',
  'ddeeeddeeeddeeee',
  'dddeddddeddddedd',
  'dddddddddddddddd',
  'ddd1dddd1ddddd1d',
  '1dd1d1dd1d1dd11d',
  '1111d111d1111d11',
  '1111111111111111',
];

// A ladder pinned to the rock. Read from above, so the rails run vertically
// and the rungs are the thing your eye catches.
const LADDER_0 = [
  'dddkkddddddkkddd',
  'dddkkddddddkkddd',
  'dddkklllllllkddd',
  'dddkkllllllkkddd',
  'dddkkddddddkkddd',
  'dddkkddddddkkddd',
  'dddkklllllllkddd',
  'dddkkllllllkkddd',
  'dddkkddddddkkddd',
  'dddkkddddddkkddd',
  'dddkklllllllkddd',
  'dddkkllllllkkddd',
  'dddkkddddddkkddd',
  'dddkkddddddkkddd',
  'dddkklllllllkddd',
  'dddkkllllllkkddd',
];

// Cut steps. Each tread catches the light along its northern lip.

// Crag with a fracture through it — it has to LOOK breakable from a screen away.
const CRACKED_0 = [
  'ffffffffffffffff',
  'feeeeee0eeeeeeee',
  'feeeeee0eeeeeeee',
  'feeeee0eeeeeeeee',
  'feeeee0eeee0eeee',
  'feeee0eeeee0eeee',
  'feee0eeeeee0eeee',
  'feee0eeeeee0eeee',
  'fee0eeeeeee0eeee',
  'fee0eeeee00eeeee',
  'fe0eeeeee0eeeeee',
  'fe0eeeeee0eeeeee',
  'f0eeeeeee0eeeeee',
  'f0eeeeeee0eeeeee',
  'f0eeeeeee0eeeeee',
  'f0eeeeeeee0eeeee',
];

// An ice gate: a slab of blue ice with a bright rime edge. Solid while it holds.
const ICEGATE_0 = [
  'FFFFFFFFFFFFFFFF',
  'FccccccccccccccF',
  'FcbbbbccbbbbbbcF',
  'FcbbbbccbbbbbbcF',
  'FcbbbbccbbbbbbcF',
  'FccccccccccccccF',
  'FcbbbbbbbbbbbbcF',
  'FcbbbbbbbbbbbbcF',
  'FccccccccccccccF',
  'FcbbbbbbccbbbbcF',
  'FcbbbbbbccbbbbcF',
  'FcbbbbbbccbbbbcF',
  'FccccccccccccccF',
  'FcbbbbbbbbbbbbcF',
  'FcbbbbbbbbbbbbcF',
  'FFFFFFFFFFFFFFFF',
];

// A pressure plate set into the snow: a stone square with a rim.
const PLATE_0 = [
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOO',
  'OOdddddddddddOOO',
  'OOdGGGGGGGGGdOOO',
  'OOdGeeeeeeeGdOOO',
  'OOdGeeeeeeeGdOOO',
  'OOdGeeeeeeeGdOOO',
  'OOdGeeeeeeeGdOOO',
  'OOdGeeeeeeeGdOOO',
  'OOdGeeeeeeeGdOOO',
  'OOdGeeeeeeeGdOOO',
  'OOdGGGGGGGGGdOOO',
  'OOdddddddddddOOO',
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOO',
];

// The same plate, held down: sunk, and lit from within.
const PLATE_DOWN_0 = [
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOO',
  'OOdddddddddddOOO',
  'OOd111111111dOOO',
  'OOd1PPPPPPP1dOOO',
  'OOd1PFFFFFP1dOOO',
  'OOd1PFFFFFP1dOOO',
  'OOd1PFFFFFP1dOOO',
  'OOd1PFFFFFP1dOOO',
  'OOd1PFFFFFP1dOOO',
  'OOd1PPPPPPP1dOOO',
  'OOd111111111dOOO',
  'OOdddddddddddOOO',
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOO',
];

// A snow boulder. Drawn as an object over the ground, so it can move.
const BOULDER_0 = [
  '................',
  '.....000000.....',
  '...00ffffff00...',
  '..0fffGGGfffe0..',
  '.0ffGGGGGGGffe0.',
  '.0fGGGGGGGGGfe0.',
  '0ffGGGGGGGGGffe0',
  '0fGGGGGGGGGGGfe0',
  '0fGGGGGGGGGGGfe0',
  '0feGGGGGGGGGefe0',
  '0feeGGGGGGGeeee0',
  '.0feeeeeeeeeed0.',
  '.0ffeeeeeeeedd0.',
  '..0ffeeeeeddd0..',
  '...00dddddd00...',
  '.....000000.....',
];

// THE RIME WARDEN. Tall, faceless, a column of frozen air with a lit core.
const WARDEN_A = [
  '......0000......',
  '....00FFFF00....',
  '...0FFccccFF0...',
  '...0FccPPccF0...',
  '..0FccPPPPccF0..',
  '..0FcPPmmPPcF0..',
  '..0FcPPmmPPcF0..',
  '..0FccPPPPccF0..',
  '..0FFccccccFF0..',
  '...0FFccccFF0...',
  '...0bFFccFFb0...',
  '...0bbFFFFbb0...',
  '....0bbFFbb0....',
  '.....0bbbb0.....',
  '......0bb0......',
  '.......00.......',
];
const WARDEN_B = [
  '......0000......',
  '....00FFFF00....',
  '...0FFccccFF0...',
  '...0FccPPccF0...',
  '..0FccPPPPccF0..',
  '..0FcPmmmmPcF0..',
  '..0FcPmmmmPcF0..',
  '..0FccPPPPccF0..',
  '..0FFccccccFF0..',
  '...0FFccccFF0...',
  '...0bFFccFFb0...',
  '..0bbFFFFFFbb0..',
  '...0bbFFFFbb0...',
  '....0bbbb0......',
  '.....0bb0.......',
  '......00........',
];

// The Wise Man: an old man sitting, wrapped in a blanket, by a small fire.
const EMBERROCK_0 = [
  'WXWWXWWWXWWWXWWX',
  'XWWWXWWXWWXWWWXW',
  'WWXWWWWWXWWWWXWW',
  'WXWWWXWWWWXWWWWX',
  'WWWWXWWWXWWWXWWW',
  'XWWXWWWWWWXWWWXW',
  'WWWWWXWWXWWWWWWW',
  'WXWWWWWWWWWXWWXW',
  'WWWXWWXWWWWWWWWX',
  'XWWWWWWWXWWXWWWW',
  'WWWWXWWWWWWWWXWW',
  'WXWWWWWXWWXWWWWW',
  'WWWXWWWWWWWWXWWX',
  'XWWWWXWWXWWWWWWW',
  'WWXWWWWWWWXWWXWW',
  'WWWWWXWWWWWWWWWW',
];
const WISEMAN_0 = [
  '................',
  '.....000000.....',
  '....0BBBBBB0....',
  '...0BmmmmmmB0...',
  '...0mtttttm0....',
  '...0mt00t0m0....',
  '...0mttttt m....',
  '...0mmttttm0....',
  '..0BBmmmmmBB0...',
  '..0BuuuuuuuB0...',
  '.0BuuuvvvuuuB0..',
  '.0Buuvvvvvuu B..',
  '.0Buuvvvvvuuu0..',
  '.0BBuuuuuuuBB0..',
  '..0BBBBBBBBB0...',
  '...000000000....',
];

export const SPRITES = {
  tiles: {
    grass: GRASS_TIERS.mid[0],
    path: PATH_TIERS.mid[0],
    water: WATER_FRAMES[0],
    stone: makeSprite(STONE_0, PAL, T16R),
    tree: makeSprite(TREE_TILE_0, PAL, T16),
    sand: SAND_TIERS.mid[0],
    bluetree: makeSprite(BLOOM_TILE_0, PAL, T16),
    // v6 — the Reaches.
    snow: makeSprite(SNOW_0, PAL, T16),
    ice: makeSprite(ICE_0, PAL, T16),
    crag: makeSprite(CRAG_0, PAL, T16R),
    snowpine: makeSprite(SNOWPINE_0, PAL, T16),
    // v7 — the mountain
    cliff: makeSprite(CLIFF_0, PAL, T16R),
    ladder: makeSprite(LADDER_0, PAL, T16R),
    stair: makeSprite(STAIR_1, PAL, T16R),
    crackedcrag: makeSprite(CRACKED_0, PAL, T16R),
    icegate: makeSprite(ICEGATE_0, PAL, T16),
    plate: makeSprite(PLATE_0, PAL, T16),
    rockfloor: makeSprite(ROCKFLOOR_0, PAL, T16R),
    rimewall: makeSprite(RIMEWALL_0, PAL, T16R),
    brokenwall: makeSprite(BROKENWALL_0, PAL, T16R),
    snowroad: makeSprite(SNOWROAD_0, PAL, T16),
    lockdoor: makeSprite(LOCKDOOR_0, PAL, T16R),
    brazier: makeSprite(BRAZIER_0, PAL, T16),
    crate: makeSprite(CRATE_0, PAL, T16),
    // v10 — the farlands: cooled lava, red-black and cracked.
    emberrock: makeSprite(EMBERROCK_0, PAL, T16R),
    // v2 — harvested variants, drawn in place of a depleted node.
    stump: makeSprite(TREE_TILE_0, PAL, T16), // see art.js SPRITES3.stump
    bloomstump: makeSprite(BLOOM_STUMP_0, PAL, T16),
    rubble: makeSprite(RUBBLE_0, PAL, T16R),
    driedreeds: makeSprite(DRIEDREEDS_0, PAL, T16),
    siftedsand: makeSprite(SIFTEDSAND_0, PAL, T16),
  },
  player: {
    down: [makeSprite(P_DOWN_0, PAL, T16P), makeSprite(P_DOWN_1, PAL, T16P)],
    up: [makeSprite(P_UP_0, PAL, T16P), makeSprite(P_UP_1, PAL, T16P)],
    left: [makeSprite(P_LEFT_0, PAL, T16P), makeSprite(P_LEFT_1, PAL, T16P)],
    right: [makeSprite(mirror(P_LEFT_0), PAL, T16P), makeSprite(mirror(P_LEFT_1), PAL, T16P)],
    // v2 — 2-frame gathering swing, one set per facing.
    swing: {
      down: [makeSprite(P_SWING_DOWN_0, PAL, T16P), makeSprite(P_SWING_DOWN_1, PAL, T16P)],
      up: [makeSprite(P_SWING_UP_0, PAL, T16P), makeSprite(P_SWING_UP_1, PAL, T16P)],
      left: [makeSprite(P_SWING_LEFT_0, PAL, T16P), makeSprite(P_SWING_LEFT_1, PAL, T16P)],
      right: [
        makeSprite(mirror(P_SWING_LEFT_0), PAL, T16P),
        makeSprite(mirror(P_SWING_LEFT_1), PAL, T16P),
      ],
    },
  },
  buildings,
  box: {
    dark: makeSprite(B_BOX_DARK, PAL, T16),
  },
  ui: {
    // 7x9 lightning bolt, pulsed over the player when energy runs low.
    lowEnergy: makeSprite(
      [
        '....00.',
        '...0s0.',
        '..0ss0.',
        '.0sss0.',
        '0sssss0',
        '.000s0.',
        '...0s0.',
        '..0s0..',
        '..00...',
      ],
      PAL,
      { w: 7, h: 9, label: 'lowEnergy' }
    ),
  },
};

/* ------------------------------------------------------------------ *
 * GATHERING LOOK-UP TABLES (v2)
 * ------------------------------------------------------------------ */

/** GATHER_NODES id -> the tile sprite drawn while the node is depleted. */
export const HARVESTED_TILE = Object.freeze({
  tree: 'stump',
  // A doorway that has been hammered open. See BROKENWALL_0.
  crackedcrag: 'brokenwall',
  bluetree: 'bloomstump',
  stone: 'rubble',
  reeds: 'driedreeds',
  sand: 'siftedsand',
});

/**
 * Per-node hit feedback: `chips` are the particle colours thrown by a swing,
 * `text` the fallback colour for the floating yield when the material is
 * unknown. Brown chips for wood, grey shards for stone, a blue splash for
 * water, a pale puff for sand.
 */
export const NODE_STYLE = Object.freeze({
  tree: { chips: ['#7d6140', '#4e3d2a', '#a8834f'], text: '#a8834f', gravity: 0.35 },
  stone: { chips: ['#8d95a8', '#666d80', '#454a59'], text: '#9aa0aa', gravity: 0.42 },
  reeds: { chips: ['#4285b3', '#2b5580', '#d6dceb'], text: '#4285b3', gravity: 0.3 },
  sand: { chips: ['#cfba8b', '#b39a6c', '#8d7550'], text: '#cfba8b', gravity: 0.22 },
  // Cold blue spores rather than woodchips — it is not wood.
  bluetree: { chips: ['#d8f6f6', '#66c8d4', '#2a86a6'], text: '#7fdcdc', gravity: 0.18 },
});

/** Sprite for a depleted node of the given GATHER_NODES id (or null). */
export function harvestedSprite(nodeType) {
  const name = HARVESTED_TILE[nodeType];
  return (name && SPRITES.tiles[name]) || null;
}

/**
 * TILE_VARIANTS — extra (non-contract) export. `SPRITES.tiles.grass` stays a
 * single sprite for contract compliance; the renderer picks a variant here via a
 * hash of (x,y) so large fields of grass/sand do not visibly tile.
 */
export const TILE_VARIANTS = {
  grass: GRASS_TIERS.mid,
  sand: SAND_TIERS.mid,
  path: PATH_TIERS.mid,
};

/** Ground materials that come in three colour temperatures. */
const TIERED = { grass: GRASS_TIERS, sand: SAND_TIERS, path: PATH_TIERS };
export const LIGHT_TIERS = Object.freeze(['shade', 'mid', 'sun']);

/** Cheap deterministic 2D hash, used for tile variant selection. */
export function tileHash(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

// Reaches gear, lying where it was left: a bundle with an iron glint. One
// sprite for all three — what it IS is said by the prompt and the toast, and
// three near-identical 16px bundles would only be three chances to draw badly.
const GEAR_CACHE_0 = [
  '................',
  '................',
  '.....000000.....',
  '....0QQQQQQ0....',
  '...0QGGGGGGQ0...',
  '...0QGmmmmGQ0...',
  '..0QGmoooomGQ0..',
  '..0QGmoHHomGQ0..',
  '..0QGmoHHomGQ0..',
  '..0QGmoooomGQ0..',
  '...0QGmmmmGQ0...',
  '...0QGGGGGGQ0...',
  '....0QQQQQQ0....',
  '.....000000.....',
  '......1111......',
  '................',
];

// A WATCHMAN of Elderwatch: helmet, dark coat, a spear held upright. Human, and
// meant to read as bored rather than as a monster — the garrison has forgotten
// what it is guarding.
const WATCH_A = [
  '................',
  '.....000000.....',
  '....0QQQQQQ0..Q.',
  '...0QGGGGGGQ0.Q.',
  '...0Qtttttt Q.Q.',
  '...0Qt00t00tQ.Q.',
  '...0Qtttttt Q.Q.',
  '....0uuuuuu0..Q.',
  '...0uuvvvvuu0.Q.',
  '..0uuuvvvvuuu0Q.',
  '..0uuuvvvvuuu0Q.',
  '..0uuuuuuuuuu0Q.',
  '...0uu0000uu0.Q.',
  '...0uu0..0uu0.Q.',
  '...000....000.Q.',
  '................',
];
const WATCH_B = [
  '................',
  '.....000000.....',
  '....0QQQQQQ0..Q.',
  '...0QGGGGGGQ0.Q.',
  '...0Qtttttt Q.Q.',
  '...0Qt00t00tQ.Q.',
  '...0Qtttttt Q.Q.',
  '....0uuuuuu0..Q.',
  '...0uuvvvvuu0.Q.',
  '..0uuuvvvvuuu0Q.',
  '..0uuuvvvvuuu0Q.',
  '..0uuuuuuuuuu0Q.',
  '....0uu00uu0..Q.',
  '....0uu00uu0..Q.',
  '....000..000..Q.',
  '................',
];

// THE ASHEN STANDARD on its stand: a grey banner on a pole, dusty gold trim.
const STANDARD_0 = [
  '.......00.......',
  '......0BB0......',
  '.....0BGGB0.....',
  '....0BGGGGB0....',
  '...0BGGGGGGB0...',
  '...0BGHHHHGB0...',
  '...0BGHooHGB0...',
  '...0BGHooHGB0...',
  '...0BGHHHHGB0...',
  '...0BGGGGGGB0...',
  '....0BGGGGB0....',
  '.....0BGGB0.....',
  '......0kk0......',
  '......0kk0......',
  '.....00kk00.....',
  '.....0dddd0.....',
];

/** v7 — things that stand on the mountain rather than being part of it. */
export const BOULDER_SPRITE = makeSprite(BOULDER_0, PAL, { w: 16, h: 16, label: 'boulder' });
export const PLATE_DOWN_SPRITE = makeSprite(PLATE_DOWN_0, PAL, { w: 16, h: 16, label: 'plateDown' });
export const WISEMAN_SPRITE = makeSprite(WISEMAN_0, PAL, { w: 16, h: 16, label: 'wiseman' });
export const GEAR_SPRITE = makeSprite(GEAR_CACHE_0, PAL, { w: 16, h: 16, label: 'gearCache' });
export const STANDARD_SPRITE = makeSprite(STANDARD_0, PAL, { w: 16, h: 16, label: 'standard' });
/**
 * THE CODEX, lying open on the guardroom table.
 *
 * Open rather than shut, and drawn from above at the same three-quarter angle
 * as everything else: a closed book on a table is a brown rectangle, and this
 * is the one object in Elderwatch a player has to want to walk towards.
 */
const CODEX_0 = [
  '................',
  '................',
  '.....000000.....',
  '....0jjjjjj0....',
  '...0jllmmll j...',
  '..0jlmmmmmmlj0..',
  '..0lmmmmmmmml0..',
  '..0lmdmmmmdml0..',
  '..0lmmdmmdmml0..',
  '..0lmdmmmmdml0..',
  '..0lmmmmmmmml0..',
  '..0jlmmmmmmlj0..',
  '...0jllmmllj0...',
  '....0jjjjjj0....',
  '.....000000.....',
  '......0110......',
];
export const CODEX_SPRITE = makeSprite(CODEX_0, PAL, { w: 16, h: 16, label: 'codex' });

/**
 * THE HERMIT'S FIRE, with a pan on it and a crepe going.
 *
 * Two frames, so the flame moves — a still fire on a windy summit reads as a
 * painted rock. The pan is iron seen three-quarters on with the handle out to
 * the right, and the crepe is the one warm pale thing on this whole mountain.
 */
const FIRE_PAN_A = [
  '................',
  '................',
  '.......n........',
  '..n...nsn.......',
  '.nsn..nsn..n....',
  '.nsn.nsson.nsn..',
  'dddddddddddddddd',
  'd00000000000000d',
  '.099999999990jjj',
  '..08888888880...',
  '...0000000000...',
  '..eeeeeeeeee....',
  '...eeeeeeee.....',
  '....dddddd......',
  '................',
  '................',
];
const FIRE_PAN_B = [
  '................',
  '................',
  '...n............',
  '..nsn......n....',
  '..nsn.n...nsn...',
  '.nson.nsn.nsn...',
  'dddddddddddddddd',
  'd00000000000000d',
  '.099999999990jjj',
  '..08999998880...',
  '...0000000000...',
  '..eeeeeeeeee....',
  '...eeeeeeee.....',
  '....dddddd......',
  '................',
  '................',
];
export const FIRE_PAN_FRAMES = Object.freeze([
  makeSprite(FIRE_PAN_A, PAL, { w: 16, h: 16, label: 'firePan0' }),
  makeSprite(FIRE_PAN_B, PAL, { w: 16, h: 16, label: 'firePan1' }),
]);
/** The Elderwatch watch, on their rounds. Two frames, like the Warden. */
export const WATCH_FRAMES = Object.freeze([
  makeSprite(WATCH_A, PAL, { w: 16, h: 16, label: 'watch0' }),
  makeSprite(WATCH_B, PAL, { w: 16, h: 16, label: 'watch1' }),
]);
/** The Warden breathes: two frames, swapped on its own clock. */
export const WARDEN_FRAMES = Object.freeze([
  makeSprite(WARDEN_A, PAL, { w: 16, h: 16, label: 'warden0' }),
  makeSprite(WARDEN_B, PAL, { w: 16, h: 16, label: 'warden1' }),
]);


const TILE_NAME_BY_ID = [
  'grass', 'path', 'water', 'stone', 'tree', 'sand', 'bluetree',
  'snow', 'ice', 'snowpine', 'crag',
  'cliff', 'ladder', 'stair', 'crackedcrag', 'icegate', 'plate', 'rockfloor',
  'rimewall', 'snowroad', 'lockdoor', 'brazier', 'crate',
  // v10 — the farlands
  'emberrock',
];

/**
 * tileSprite(tileId, x, y, tier, anim)
 * `tier` is 'shade' | 'mid' | 'sun' — the colour temperature this patch of
 * ground is standing in, chosen by world.js from a low-frequency light field.
 * `anim` is a frame counter, used by water so the swell moves.
 */
export function tileSprite(tileId, x, y, tier, anim) {
  const name = TILE_NAME_BY_ID[tileId] || 'grass';
  if (name === 'water') {
    const f = (((anim | 0) + x * 2 + y) % WATER_FRAMES.length + WATER_FRAMES.length)
      % WATER_FRAMES.length;
    return WATER_FRAMES[f];
  }
  const tiers = TIERED[name];
  if (tiers) {
    const set = tiers[tier] || tiers.mid;
    return set[tileHash(x, y) % set.length];
  }
  return SPRITES.tiles[name] || SPRITES.tiles.grass;
}

/** Draw one map tile. px/py are destination device pixels. */
export function drawTile(ctx, tileId, x, y, px, py, scale, tier, anim) {
  drawSprite(ctx, tileSprite(tileId, x, y, tier, anim), px, py, scale);
}

/** Building sprite by id, or null (drawSprite then paints a magenta placeholder). */
export function buildingSprite(id) {
  const s = SPRITES.buildings[id];
  if (!s && id && !MISSING_WARNED.has(id)) {
    MISSING_WARNED.add(id);
    if (typeof console !== 'undefined') console.warn('[sprites] no sprite for building', id);
  }
  return s || null;
}

/* ================================================================== *
 * FONT — hand-authored 5x7 bitmap. ctx.fillText is never used.
 * ================================================================== */

const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#..##', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#.##.', '..##.', '.....'],
  '/': ['....#', '...#.', '..#..', '..#..', '.#...', '#....', '#....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
};

export const FONT = Object.freeze({ w: 5, h: 7, gap: 1, glyphs: G });

// Typographic characters the UI passes in that the 5x7 font has no glyph for.
const CHAR_SUBS = {
  '\u2014': '-', '\u2013': '-', '\u2212': '-', '\u00d7': 'X', '\u00b7': '.',
  '\u2022': '.', '\u2026': '.', '\u2019': "'", '\u2018': "'", '\u201c': '"',
  '\u201d': '"', '\u00a0': ' ', '"': "'", ';': ':', '[': '(', ']': ')',
  '{': '(', '}': ')', '\\': '/', '|': '!', '&': '+', '@': 'O', '$': 'S', '^': '*',
  '~': '-', '`': "'",
};
const FONT_ORDER = Object.keys(G);
const FONT_INDEX = new Map(FONT_ORDER.map((ch, i) => [ch, i]));
const fontAtlases = new Map(); // `${color}|${scale}` -> canvas

function fontAtlas(color, scale) {
  const key = color + '|' + scale;
  let cv = fontAtlases.get(key);
  if (cv !== undefined) return cv;
  const cw = FONT.w * scale;
  const ch = FONT.h * scale;
  cv = makeCanvas(cw * FONT_ORDER.length, ch);
  if (cv) {
    const c = cv.getContext('2d');
    if (c) {
      c.imageSmoothingEnabled = false;
      c.fillStyle = color;
      for (let i = 0; i < FONT_ORDER.length; i++) {
        const rows = G[FONT_ORDER[i]];
        for (let y = 0; y < FONT.h; y++) {
          const row = rows[y] || '';
          let x = 0;
          while (x < FONT.w) {
            if (row[x] !== '#') {
              x++;
              continue;
            }
            let run = 1;
            while (x + run < FONT.w && row[x + run] === '#') run++;
            c.fillRect(i * cw + x * scale, y * scale, run * scale, scale);
            x += run;
          }
        }
      }
    } else {
      cv = null;
    }
  }
  fontAtlases.set(key, cv);
  return cv;
}

/** Pixel width of a string at a given scale. */
export function textWidth(str, scale) {
  const s = Math.max(1, Math.round(scale || 1));
  const n = String(str == null ? '' : str).length;
  if (n === 0) return 0;
  return n * (FONT.w + FONT.gap) * s - FONT.gap * s;
}

/** drawText — the ONLY text path in the world renderer. Never ctx.fillText. */
export function drawText(ctx, str, x, y, scale, color) {
  if (!ctx) return;
  const s = Math.max(1, Math.round(scale || 1));
  const col = color || '#e6e8ef';
  const text = String(str == null ? '' : str).toUpperCase();
  const atlas = fontAtlas(col, s);
  const cw = FONT.w * s;
  const chh = FONT.h * s;
  const step = (FONT.w + FONT.gap) * s;
  let px = x | 0;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (!FONT_INDEX.has(ch) && CHAR_SUBS[ch]) ch = CHAR_SUBS[ch];
    if (!FONT_INDEX.has(ch)) ch = '?';
    const idx = FONT_INDEX.get(ch);
    if (idx !== undefined && atlas) {
      ctx.drawImage(atlas, idx * cw, 0, cw, chh, px, y | 0, cw, chh);
    } else if (idx === undefined && ch !== ' ' && atlas === null) {
      ctx.fillStyle = col;
      ctx.fillRect(px, y | 0, cw, chh);
    }
    px += step;
  }
}

/** Text with a 1px-scaled dark outline — used for floating toasts. */
export function drawTextOutlined(ctx, str, x, y, scale, color, outline) {
  const s = Math.max(1, Math.round(scale || 1));
  const o = outline || '#0d0f16';
  drawText(ctx, str, x - s, y, s, o);
  drawText(ctx, str, x + s, y, s, o);
  drawText(ctx, str, x, y - s, s, o);
  drawText(ctx, str, x, y + s, s, o);
  drawText(ctx, str, x, y, s, color);
}

export default SPRITES;
