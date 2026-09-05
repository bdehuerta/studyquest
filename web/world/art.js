// ENG-WORLD — web/world/art.js
// v3 object art: everything that stands ON the ground rather than being it.
//
// In v1/v2 a tree was a 16x16 tile. That is why the world looked pasted
// together: the canopy could not overhang, the player could not walk behind
// it, it could not sway, and it could not drop a contact shadow. In v3 every
// piece of scenery below is a transparent sprite drawn in the depth-sorted
// object pass over real ground, with an anchor telling the renderer how far
// above its tile it rises.
//
// Same rules as everywhere else: hand-authored string grids only, no image
// files, no fetch. Widths are either typed exactly or produced by the grid
// builder in sprites.js, which cannot mistype them.

import { TILE, BLOCK_IDS, SAPLING_STAGES } from '../../shared/constants.js';
import { PAL, makeSprite, grid, px, box, stamp, gridRows } from './sprites.js';

const OBJ = (label, h, shade) => ({ w: 16, h: h || 16, label, shade: shade == null ? 1 : shade });

/* ================================================================== *
 * TREES — canopy and trunk are separate so the canopy can sway
 * ================================================================== */

const OAK_CANOPY = [
  '......KKKK......',
  '....KKKKKKKK....',
  '..KKKKKKKKLLL...',
  '..KKKKKKKLLLLh..',
  '.KKKKKKKLLLLhhh.',
  'KKKKKKLLLLLhhhM.',
  'KKKKKLLLLLhhhhMM',
  'KKKKLLLLLLhhhhMM',
  'KKKLLLLLLhhhhMMM',
  '.KKLLLLLLhhhhMM.',
  '.KLLLLLLLhhhMMM.',
  '..LLLLLLLhhhMM..',
  '...LLLLLhhhMM...',
  '....LLLhhhMM....',
  '.....hhhhhh.....',
  '......Mhhh......',
];

const PINE_CANOPY = [
  '.......g........',
  '......gKg.......',
  '.....gKKKg......',
  '....gKKLLhg.....',
  '...gKKKLLhhg....',
  '....gKKLLhg.....',
  '...gKKKLLhhg....',
  '..gKKKKLLLhhg...',
  '...gKKKLLhhg....',
  '..gKKKKLLLhhg...',
  '.gKKKKKLLLhhhMg.',
  '..gKKKKLLLhhMg..',
  '.gKKKKKLLLhhhMg.',
  'gKKKKKKLLLhhhMMg',
  '..ggMMhhhMMgg...',
  '................',
];

const TRUNK_OAK = [
  '................',
  '................',
  '................',
  '................',
  '.....0DEEjD0....',
  '.....0DEEjD0....',
  '.....0DEEjD0....',
  '.....0DEEjD0....',
  '.....0DEEjD0....',
  '.....0DEEjD0....',
  '.....0DEEjD0....',
  '....0DDEEjjD0...',
  '...0DDEEEjjjD0..',
  '..0DDEECEjjjjD0.',
  '..0DEEEEEjjjjD0.',
  '...00000000000..',
];

const TRUNK_PINE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......0DEjD0....',
  '......0DEjD0....',
  '......0DEjD0....',
  '......0DEjD0....',
  '......0DEjD0....',
  '......0DEjD0....',
  '.....0DDEjjD0...',
  '....0DDEEjjjD0..',
  '....0DEEEjjjD0..',
  '...0DDEEECjjjD0.',
  '....000000000...',
];

/** A felled tree. Permanent in v3 — nothing regrows a stump. */
const STUMP = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....000000.....',
  '....0DDDDDD0....',
  '...0DEEllEED0...',
  '...0DEllllED0...',
  '...0DElEElED0...',
  '...0DEllllED0...',
  '...0DEEllEED0...',
  '....0DDDDDD0....',
  '.....000000.....',
  '................',
];

/* ================================================================== *
 * SAPLINGS — the four SAPLING_STAGES, visibly different at a glance
 * ================================================================== */

const SAP_SPROUT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....K...K......',
  '.....KKLKK......',
  '.......h........',
  '.......h........',
  '......ggg.......',
];

const SAP_SEEDLING = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....K...K......',
  '....KKL.LKK.....',
  '......KLK.......',
  '.......h........',
  '.......h........',
  '......Kh........',
  '.......h........',
  '......ggg.......',
];

const SAP_YOUNG = [
  '................',
  '................',
  '................',
  '................',
  '.....KKKK.......',
  '....KKKKLL......',
  '...KKKKLLLh.....',
  '...KKKLLLhhM....',
  '...KKLLLhhhM....',
  '....KLLLhhM.....',
  '.....LLhhM......',
  '......Lhh.......',
  '.......jD.......',
  '.......jD.......',
  '......DjDD......',
  '.....00000......',
];

/* ================================================================== *
 * BLOCKS — the six BLOCK_IDS
 *
 * Fences and walls read their four orthogonal neighbours and pick the
 * matching variant, so a run of fence becomes a fence rather than a row of
 * identical stamps. Mask bits: 1 = north, 2 = east, 4 = south, 8 = west.
 * ================================================================== */

export const CONNECT_N = 1;
export const CONNECT_E = 2;
export const CONNECT_S = 4;
export const CONNECT_W = 8;

/** Wooden fence: a post at the centre, rails reaching to each connected side. */
function fenceRows(mask) {
  const g = grid(16, 16, '.');
  // rails first, so the post reads as in front of them
  const railH = (x0, x1) => {
    box(g, x0, 6, x1 - x0, 2, 'l');
    box(g, x0, 7, x1 - x0, 1, 'k');
    box(g, x0, 10, x1 - x0, 2, 'l');
    box(g, x0, 11, x1 - x0, 1, 'k');
  };
  const railV = (y0, y1) => {
    box(g, 6, y0, 2, y1 - y0, 'k');
    box(g, 7, y0, 1, y1 - y0, 'j');
    box(g, 10, y0, 2, y1 - y0, 'k');
    box(g, 11, y0, 1, y1 - y0, 'j');
  };
  if (mask & CONNECT_W) railH(0, 8);
  if (mask & CONNECT_E) railH(8, 16);
  if (mask & CONNECT_N) railV(0, 8);
  if (mask & CONNECT_S) railV(8, 16);
  // post
  box(g, 6, 4, 4, 12, 'k');
  box(g, 6, 4, 1, 12, 'l'); // sunlit left edge
  box(g, 6, 4, 4, 1, 'l'); // sunlit cap
  box(g, 9, 5, 1, 11, 'j'); // shaded right edge
  box(g, 6, 15, 4, 1, '0');
  return gridRows(g);
}

/** Cut-stone wall: a solid block with capstones, taller than one tile. */
function wallRows(mask) {
  const g = grid(16, 20, '.');
  box(g, 1, 4, 14, 16, 'e');
  box(g, 1, 4, 14, 2, 'f'); // sunlit cap
  box(g, 1, 4, 2, 16, 'f'); // sunlit left face
  box(g, 13, 6, 2, 14, 'd'); // shaded right face
  box(g, 1, 18, 14, 2, 'd'); // grounded base
  // coursing
  for (let y = 8; y < 18; y += 4) box(g, 2, y, 12, 1, 'd');
  for (let y = 10; y < 18; y += 4) box(g, 7, y - 2, 1, 4, 'd');
  // Open sides get a finished pillar edge; connected sides run straight out.
  if (mask & CONNECT_W) box(g, 0, 6, 2, 12, 'e');
  else box(g, 1, 4, 1, 16, '0');
  if (mask & CONNECT_E) box(g, 14, 6, 2, 12, 'e');
  else box(g, 14, 4, 1, 16, '0');
  if (!(mask & CONNECT_N)) box(g, 1, 4, 14, 1, 'G');
  box(g, 1, 19, 14, 1, '0');
  return gridRows(g);
}

/** Flagstone path: a laid stone surface, warmer and flatter than terrain. */
const PATH_BLOCK = [
  'fffefffffefffffe',
  'feeeefffeeeeffff',
  'feeeeefeeeeeefff',
  'ffeeeeeeeeeeeeff',
  'dffeeeeeeeeeeedd',
  'ffffeeeedeeeeeed',
  'feeeffffddeeeedd',
  'feeeeeffdddeeddd',
  'ffeeeeefdfffeddd',
  'dffeeeeeffeeeedd',
  'ddfffeeeffeeeeed',
  'dddffffefffeeedd',
  'ddddddffdfffeddd',
  'fddddddddddffedd',
  'ffeddddddddddfdd',
  'dffeeddddddddddd',
];

/** Lamp post: an iron post with a warm lantern head. */
const LAMP_POST = [
  '.......0........',
  '......0y0.......',
  '.....0yOy0......',
  '....0oyOOy0.....',
  '....0oyOOyo0....',
  '....0oyyOyo0....',
  '....0ooyyoo0....',
  '.....0oooo0.....',
  '......0oo0......',
  '.......QQ.......',
  '.......QQ.......',
  '.......QQ.......',
  '.......QQ.......',
  '.......QQ.......',
  '......QQQQ......',
  '.....0QQQQ0.....',
  '.....0QQQQ0.....',
  '......0000......',
];

/** Planter: a timber box of soil with something already coming up. */
const PLANTER = [
  '................',
  '................',
  '................',
  '................',
  '.....K...K......',
  '....KKLKLKK.....',
  '......KLK.......',
  '..0lllllllll0...',
  '..0l7777777l0...',
  '..0l7666667l0...',
  '..0k7666667k0...',
  '..0k7666667k0...',
  '..0kkkkkkkkk0...',
  '..0jjjjjjjjj0...',
  '..0000000000....',
  '................',
];

/** Signpost: a plank on a post. The text on it is drawn by world.js. */
const SIGNPOST = [
  '................',
  '................',
  '..000000000000..',
  '..0llllllllll0..',
  '..0lIIIIIIIIl0..',
  '..0lIIIIIIIIl0..',
  '..0lIIIIIIIIl0..',
  '..0llllllllll0..',
  '..000000000000..',
  '.......kk.......',
  '.......kj.......',
  '.......kj.......',
  '.......kj.......',
  '......Dkjj......',
  '.....0kkjj0.....',
  '......0000......',
];

/* ================================================================== *
 * GATE STRUCTURES — one per side of the Home Block
 *
 * Each is a wide sprite, bottom-aligned to its gate row, built with the grid
 * helper so the widths are structural. GATE_SPAN is in tiles.
 * ================================================================== */

export const GATE_SPAN = 9; // tiles wide
export const GATE_RISE = 6; // tiles tall (the structure overhangs upward)
const GW = GATE_SPAN * TILE; // 144
const GH = GATE_RISE * TILE; // 96

/** north — a treeline arch: two great trunks leaning into a canopy vault. */
function gateTreelineRows() {
  const g = grid(GW, GH, '.');
  // canopy vault
  for (let x = 0; x < GW; x++) {
    const t = (x - GW / 2) / (GW / 2);
    const top = Math.round(6 + 26 * t * t);
    const bottom = Math.round(40 + 30 * t * t);
    for (let y = top; y < bottom; y++) {
      const d = (y - top) / Math.max(1, bottom - top);
      let ch = 'K';
      if (d > 0.28) ch = 'L';
      if (d > 0.52) ch = 'h';
      if (d > 0.74) ch = 'M';
      if (t > 0.35) ch = d > 0.5 ? 'M' : 'h';
      px(g, x, y, ch);
    }
  }
  // hanging leaf fringe
  for (let x = 4; x < GW - 4; x += 5) {
    const t = (x - GW / 2) / (GW / 2);
    const bottom = Math.round(40 + 30 * t * t);
    box(g, x, bottom, 2, 3 + ((x / 5) % 3), 'M');
  }
  // two leaning trunks
  const trunk = (x0, lean) => {
    for (let y = 30; y < GH; y++) {
      const off = Math.round(lean * (GH - y) * 0.16);
      box(g, x0 + off, y, 10, 1, 'j');
      px(g, x0 + off, y, 'D');
      px(g, x0 + off + 1, y, 'E');
      px(g, x0 + off + 2, y, 'E');
      px(g, x0 + off + 9, y, 'D');
    }
  };
  trunk(6, 1);
  trunk(GW - 16, -1);
  // roots
  box(g, 2, GH - 4, 22, 4, 'D');
  box(g, GW - 24, GH - 4, 22, 4, 'D');
  // moss on the ground under the arch
  for (let x = 30; x < GW - 30; x += 7) box(g, x, GH - 3, 4, 2, 'C');
  return gridRows(g);
}

/** east — a cut stone gateway: two piers and a carved lintel. */
function gateStoneRows() {
  const g = grid(GW, GH, '.');
  const pier = (x0) => {
    box(g, x0, 20, 26, GH - 20, 'e');
    box(g, x0, 20, 3, GH - 20, 'f'); // sunlit face
    box(g, x0 + 23, 22, 3, GH - 22, 'd'); // shaded face
    box(g, x0, 20, 26, 3, 'G'); // sunlit cap
    for (let y = 28; y < GH; y += 8) box(g, x0 + 2, y, 22, 1, 'd');
    box(g, x0 - 2, 14, 30, 6, 'e');
    box(g, x0 - 2, 14, 30, 2, 'G');
    box(g, x0 - 2, 19, 30, 1, 'd');
  };
  pier(8);
  pier(GW - 34);
  // lintel spanning the gap
  box(g, 6, 4, GW - 12, 12, 'e');
  box(g, 6, 4, GW - 12, 3, 'G');
  box(g, 6, 14, GW - 12, 2, 'd');
  box(g, 6, 4, 3, 12, 'f');
  // carved keystone + gold inlay
  box(g, GW / 2 - 6, 2, 12, 16, 'f');
  box(g, GW / 2 - 6, 2, 12, 2, 'G');
  box(g, GW / 2 - 3, 6, 6, 8, 'H');
  box(g, GW / 2 - 2, 7, 4, 6, 'o');
  // worn threshold stones
  box(g, 40, GH - 3, GW - 80, 3, 'd');
  return gridRows(g);
}

/** south — a flooded causeway: broken piles standing in dark water. */
function gateCausewayRows() {
  const g = grid(GW, GH, '.');
  // water body filling the lower half
  box(g, 0, GH - 34, GW, 34, 'a');
  for (let y = GH - 32; y < GH; y += 5) {
    for (let x = (y % 10); x < GW; x += 11) box(g, x, y, 4, 1, 'b');
  }
  for (let x = 6; x < GW; x += 17) box(g, x, GH - 26, 5, 1, 'c');
  // broken piles
  const pile = (x0, top) => {
    box(g, x0, top, 8, GH - top, 'j');
    box(g, x0, top, 2, GH - top, 'k');
    box(g, x0 + 6, top + 2, 2, GH - top - 2, 'D');
    box(g, x0, top, 8, 2, 'l');
    box(g, x0 - 1, top + 3, 10, 1, 'C'); // waterline moss
  };
  pile(10, 26);
  pile(30, 34);
  pile(GW - 38, 30);
  pile(GW - 18, 24);
  // a collapsed span of decking between the near piles
  box(g, 8, 24, 34, 5, 'k');
  box(g, 8, 24, 34, 1, 'l');
  box(g, 8, 28, 34, 1, 'D');
  box(g, GW - 40, 22, 34, 5, 'k');
  box(g, GW - 40, 22, 34, 1, 'l');
  box(g, GW - 40, 26, 34, 1, 'D');
  // reeds at the margin
  for (let x = 2; x < GW; x += 9) {
    box(g, x, GH - 14, 1, 12, 'g');
    box(g, x + 2, GH - 10, 1, 8, 'C');
  }
  return gridRows(g);
}

/** west — an ash-choked pass: dead trunks and drifted ash between rock walls. */
function gateAshRows() {
  const g = grid(GW, GH, '.');
  // rock shoulders
  const shoulder = (x0, w, dir) => {
    for (let y = 10; y < GH; y++) {
      const t = (y - 10) / (GH - 10);
      const ww = Math.round(w * (0.45 + 0.55 * t));
      const x = dir > 0 ? x0 : x0 - ww;
      box(g, x, y, ww, 1, 'z');
      px(g, dir > 0 ? x : x + ww - 1, y, dir > 0 ? 'B' : 'A');
      px(g, dir > 0 ? x + ww - 1 : x, y, dir > 0 ? 'A' : 'z');
    }
  };
  shoulder(0, 40, 1);
  shoulder(GW, 40, -1);
  box(g, 0, 10, 20, 3, 'B');
  box(g, GW - 20, 10, 20, 3, 'B');
  // dead trunks leaning across the pass
  const dead = (x0, lean, top) => {
    for (let y = top; y < GH - 6; y++) {
      const off = Math.round(lean * (y - top) * 0.22);
      box(g, x0 + off, y, 5, 1, 'A');
      px(g, x0 + off, y, 'z');
      px(g, x0 + off + 4, y, '0');
    }
  };
  dead(50, 1, 18);
  dead(GW - 58, -1, 12);
  // stripped branches
  box(g, 44, 26, 16, 2, 'A');
  box(g, GW - 62, 20, 18, 2, 'A');
  // ash drifts
  box(g, 0, GH - 8, GW, 8, 'B');
  box(g, 0, GH - 8, GW, 2, 'z');
  for (let x = 3; x < GW; x += 13) box(g, x, GH - 11, 6, 3, 'B');
  // a few embers still alive in the drift
  for (let x = 18; x < GW - 18; x += 29) {
    px(g, x, GH - 5, 'n');
    px(g, x + 1, GH - 4, 's');
  }
  return gridRows(g);
}

/* ------------------------------------------------------------------ *
 * East and west gates run north-south, so they are authored as vertical
 * structures rather than as a rotation of the horizontal ones — a rotated
 * arch reads as a mistake. VGATE_SPAN is the run along the edge.
 * ------------------------------------------------------------------ */

export const VGATE_DEPTH = 4; // tiles, perpendicular to the edge
export const VGATE_SPAN = 9; // tiles, along the edge
const VW = VGATE_DEPTH * TILE; // 64
const VH = VGATE_SPAN * TILE; // 144
/** Rows of the opening, in tiles, measured from the top of the structure. */
export const VGATE_OPENING = Object.freeze({ from: 3, to: 6 });

/** east — cut stone: a north-south curtain wall pierced by a carved gateway. */
function gateStoneVerticalRows() {
  const g = grid(VW, VH, '.');
  const openTop = VGATE_OPENING.from * TILE;
  const openBot = VGATE_OPENING.to * TILE;
  const wall = (y0, y1) => {
    box(g, 8, y0, 48, y1 - y0, 'e');
    box(g, 8, y0, 4, y1 - y0, 'f'); // sunlit west face
    box(g, 50, y0, 6, y1 - y0, 'd'); // shaded east face
    for (let y = y0 + 6; y < y1; y += 9) box(g, 10, y, 40, 1, 'd');
    for (let y = y0 + 2; y < y1; y += 18) box(g, 28, y, 1, 9, 'd');
    box(g, 6, y0, 52, 3, 'G'); // sunlit cap
    box(g, 6, y1 - 3, 52, 3, 'd');
  };
  wall(0, openTop);
  wall(openBot, VH);
  // Piers framing the opening, and the lintel bridging them.
  const pier = (y0) => {
    box(g, 4, y0, 56, 12, 'e');
    box(g, 4, y0, 56, 3, 'G');
    box(g, 4, y0, 4, 12, 'f');
    box(g, 4, y0 + 10, 56, 2, 'd');
  };
  pier(openTop - 12);
  pier(openBot);
  // Gold-inlaid keystone on the south pier, catching the light.
  box(g, 24, openBot + 2, 14, 8, 'f');
  box(g, 27, openBot + 4, 8, 4, 'H');
  box(g, 28, openBot + 5, 6, 2, 'o');
  // Worn threshold flagstones through the opening.
  for (let y = openTop; y < openBot; y += 6) {
    box(g, 10, y + 1, 44, 4, 'd');
    box(g, 10, y + 1, 44, 1, 'e');
  }
  return gridRows(g);
}

/** west — an ash-choked pass: a rock shoulder split by a drift-clogged gap. */
function gateAshVerticalRows() {
  const g = grid(VW, VH, '.');
  const openTop = VGATE_OPENING.from * TILE;
  const openBot = VGATE_OPENING.to * TILE;
  const rock = (y0, y1) => {
    for (let y = y0; y < y1; y++) {
      const bulge = Math.round(6 * Math.sin(y * 0.07));
      box(g, 4, y, 52 + bulge, 1, 'z');
      px(g, 4, y, 'B');
      px(g, 5, y, 'B');
      px(g, 54 + bulge, y, 'A');
      px(g, 55 + bulge, y, '0');
      if (y % 11 === 0) box(g, 12, y, 26, 1, 'A');
    }
    box(g, 4, y0, 52, 2, 'B');
    box(g, 4, y1 - 2, 52, 2, 'A');
  };
  rock(0, openTop);
  rock(openBot, VH);
  // Dead trunks fallen across the gap.
  const dead = (y0, lean) => {
    for (let x = 6; x < VW - 4; x++) {
      const off = Math.round(lean * (x - 6) * 0.2);
      box(g, x, y0 + off, 1, 4, 'A');
      px(g, x, y0 + off, 'z');
      px(g, x, y0 + off + 3, '0');
    }
  };
  dead(openTop + 6, 1);
  dead(openBot - 12, -1);
  // Ash drifted through the opening.
  box(g, 4, openTop, 52, openBot - openTop, 'B');
  box(g, 4, openTop, 52, 3, 'z');
  dead(openTop + 8, 1);
  dead(openBot - 14, -1);
  for (let y = openTop + 2; y < openBot; y += 7) box(g, 8 + (y % 13), y, 9, 3, 'z');
  // Embers smouldering in the drift.
  for (let y = openTop + 5; y < openBot - 4; y += 15) {
    px(g, 20, y, 'n');
    px(g, 21, y + 1, 's');
    px(g, 38, y + 6, 'n');
  }
  return gridRows(g);
}

/* ================================================================== *
 * SPRITE TABLE
 * ================================================================== */

const TREE_SPECIES = [
  {
    id: 'oak',
    canopy: makeSprite(OAK_CANOPY, PAL, OBJ('oak_canopy')),
    trunk: makeSprite(TRUNK_OAK, PAL, OBJ('oak_trunk')),
    canopyDy: -10,
    sway: 1,
  },
  {
    id: 'pine',
    canopy: makeSprite(PINE_CANOPY, PAL, OBJ('pine_canopy')),
    trunk: makeSprite(TRUNK_PINE, PAL, OBJ('pine_trunk')),
    canopyDy: -11,
    sway: 0.6,
  },
];

const fences = [];
for (let m = 0; m < 16; m++) fences.push(makeSprite(fenceRows(m), PAL, OBJ('fence' + m)));
const walls = [];
for (let m = 0; m < 16; m++) {
  walls.push(makeSprite(wallRows(m), PAL, { w: 16, h: 20, label: 'wall' + m, shade: 1 }));
}

const GATE_SIZE = (label) => ({ w: GW, h: GH, label, shade: 1 });

export const SPRITES3 = Object.freeze({
  trees: TREE_SPECIES,
  stump: makeSprite(STUMP, PAL, OBJ('stump')),
  saplings: {
    sprout: makeSprite(SAP_SPROUT, PAL, OBJ('sap_sprout')),
    seedling: makeSprite(SAP_SEEDLING, PAL, OBJ('sap_seedling')),
    young: makeSprite(SAP_YOUNG, PAL, OBJ('sap_young')),
    // A mature planting is a wild tree in every way that matters, including
    // that you can put an axe through it.
    mature: null,
  },
  blocks: {
    path_stone: [makeSprite(PATH_BLOCK, PAL, { w: 16, h: 16, label: 'path_stone', shade: 0.4 })],
    fence_wood: fences,
    wall_stone: walls,
    lamp_post: [makeSprite(LAMP_POST, PAL, { w: 16, h: 18, label: 'lamp_post', shade: 0.8 })],
    planter: [makeSprite(PLANTER, PAL, OBJ('planter'))],
    signpost: [makeSprite(SIGNPOST, PAL, OBJ('signpost'))],
  },
  gates: {
    treeline: makeSprite(gateTreelineRows(), PAL, GATE_SIZE('gate_treeline')),
    stone: makeSprite(gateStoneRows(), PAL, GATE_SIZE('gate_stone')),
    causeway: makeSprite(gateCausewayRows(), PAL, GATE_SIZE('gate_causeway')),
    ash: makeSprite(gateAshRows(), PAL, GATE_SIZE('gate_ash')),
    stoneV: makeSprite(gateStoneVerticalRows(), PAL, {
      w: VW, h: VH, label: 'gate_stone_v', shade: 1,
    }),
    ashV: makeSprite(gateAshVerticalRows(), PAL, {
      w: VW, h: VH, label: 'gate_ash_v', shade: 1,
    }),
  },
  signpost: makeSprite(SIGNPOST, PAL, OBJ('signpost')),
});

/* ------------------------------------------------------------------ *
 * Look-ups
 * ------------------------------------------------------------------ */

/** Deterministic species for the wild tree at (x,y). */
export function treeSpecies(x, y) {
  let h = Math.imul(x | 0, 2654435761) ^ Math.imul(y | 0, 40503);
  h = (h ^ (h >>> 15)) >>> 0;
  return TREE_SPECIES[h % TREE_SPECIES.length];
}

/** Which blocks read their neighbours to pick a variant. */
export const CONNECTING_BLOCKS = Object.freeze({ fence_wood: true, wall_stone: true });

/** Blocks a player cannot walk through. */
export const SOLID_BLOCKS = Object.freeze({ wall_stone: true, fence_wood: true, planter: true });

/** How far above its tile a block sprite rises, in pixels. */
export const BLOCK_RISE = Object.freeze({
  path_stone: 0,
  fence_wood: 0,
  wall_stone: 4,
  lamp_post: 2,
  planter: 0,
  signpost: 0,
});

/** Human-readable names, used by the removal prompt and the build ghost. */
export const BLOCK_NAMES = Object.freeze({
  path_stone: 'stone path',
  fence_wood: 'wooden fence',
  wall_stone: 'stone wall',
  lamp_post: 'lamp post',
  planter: 'planter',
  signpost: 'signpost',
});

/**
 * blockSprite(blockId, mask) — `mask` is the neighbour bitfield for connecting
 * blocks and is ignored by the rest. Never returns undefined for a known id.
 */
export function blockSprite(blockId, mask) {
  const set = SPRITES3.blocks[blockId];
  if (!set || !set.length) return null;
  if (set.length === 1) return set[0];
  return set[((mask | 0) % set.length + set.length) % set.length];
}

/** Sprite for a planting at a given SAPLING_STAGES id, or null when mature. */
export function saplingSprite(stageId) {
  return SPRITES3.saplings[stageId] || null;
}

export const SAPLING_STAGE_IDS = SAPLING_STAGES.map((s) => s.id);
export const BLOCK_ID_LIST = BLOCK_IDS.slice();

export default SPRITES3;
