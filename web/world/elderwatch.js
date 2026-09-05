// web/world/elderwatch.js — Elderwatch: a garrison, built as the opposite of a mountain.
//
// The Reaches climb. This does not: it is flat, walled, and made of ROOMS, and
// what stops you is people rather than terrain. One layer everywhere, so there
// is no lift, no cliff face and no ledge — the whole vocabulary of the mountain
// is deliberately absent, because a fort that reads like a mountain is just
// more mountain.
//
// The route, and what each lock costs:
//
//   the outer wall   the front gate is barred; the CULVERT under the west wall
//                    is cracked -> the Stone Hammer, which you already carry
//                    off the mountain
//   the yard         two watchmen on patrol, each with a line of sight
//   the guardroom    a barred door held by two plates -> the barrels
//   the keep door    the Brass Key, off the guardroom wall
//   the Hall         the Ashen Standard

import {
  WORLD_W, WORLD_H, TILE_TYPES,
  crossingRows,
  ELDERWATCH, ELDERWATCH_BOULDERS, ELDERWATCH_PLATES, ELDERWATCH_GATES, DOOR_KEYS,
} from '../../shared/constants.js';

const T = TILE_TYPES;

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
}

function scatter(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * buildElderwatch(seed) -> { w, h, seed, tiles, layers }
 *
 * `layers` is returned all-zero. Everything downstream reads it, and a flat map
 * is simply a map on one terrace — no special case anywhere else.
 */
export function buildElderwatch(seed) {
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const layers = new Uint8Array(WORLD_W * WORLD_H);
  const idx = (x, y) => y * WORLD_W + x;
  const put = (x, y, t) => { if (inBounds(x, y)) tiles[idx(x, y)] = t; };
  const rect = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) fn(x, y);
  };
  const floor = (x0, y0, x1, y1, t) => rect(x0, y0, x1, y1, (x, y) => put(x, y, t));
  const ring = (x0, y0, x1, y1, t) => {
    for (let x = x0; x <= x1; x += 1) { put(x, y0, t); put(x, y1, t); }
    for (let y = y0; y <= y1; y += 1) { put(x0, y, t); put(x1, y, t); }
  };

  const W = ELDERWATCH.wall;
  const K = ELDERWATCH.keep;
  const G = ELDERWATCH.guardroom;

  // ---- 1. the moor outside: cold grass gone to scrub, with copses of pine.
  for (let y = 0; y < WORLD_H; y += 1) {
    for (let x = 0; x < WORLD_W; x += 1) {
      const wood = scatter(Math.floor(x / 5), Math.floor(y / 5), (seed | 0) + 313);
      const fine = scatter(x, y, (seed | 0) + 7);
      tiles[idx(x, y)] = (wood > 0.66 && fine > 0.45) ? T.tree : T.grass;
    }
  }

  // ---- 2. the road in from the west, and the one that runs to the gate.
  const road = crossingRows('elderwatch', 'west');
  const roadY = road ? road.y0 + 1 : 33;
  for (let x = 0; x <= W.x0; x += 1) put(x, roadY, T.path);
  for (let y = Math.min(roadY, ELDERWATCH.gate.y); y <= Math.max(roadY, ELDERWATCH.gate.y); y += 1) {
    put(W.x0 - 1, y, T.path);
  }

  // ---- 3. THE WALL. Two tiles thick — a fort you can see round the back of is
  //         a fence. Rimewall, the one masonry no tool in the game touches.
  rect(W.x0, W.y0, W.x1, W.y1, (x, y) => put(x, y, T.grass));
  ring(W.x0, W.y0, W.x1, W.y1, T.rimewall);
  ring(W.x0 + 1, W.y0 + 1, W.x1 - 1, W.y1 - 1, T.rimewall);

  // The front gate: SHUT, for the whole visit. It is what makes the culvert the
  // way in rather than a shortcut.
  put(ELDERWATCH.gate.x, ELDERWATCH.gate.y, T.icegate);
  put(ELDERWATCH.gate.x + 1, ELDERWATCH.gate.y, T.icegate);

  // The culvert: cracked masonry, both tiles of the wall's thickness.
  put(ELDERWATCH.culvert.x, ELDERWATCH.culvert.y, T.crackedcrag);
  put(ELDERWATCH.culvert.x + 1, ELDERWATCH.culvert.y, T.crackedcrag);

  // ---- 4. THE YARD: open ground, a well, and two watchmen's beats.
  floor(W.x0 + 2, W.y0 + 2, W.x1 - 2, W.y1 - 2, T.grass);
  for (const [x, y] of [[26, 16], [27, 16], [26, 17], [27, 17]]) put(x, y, T.stone);

  // ---- 5. THE KEEP, north-east. Stone walls, a rock floor, one door.
  ring(K.x0, K.y0, K.x1, K.y1, T.cliff);
  floor(K.x0 + 1, K.y0 + 1, K.x1 - 1, K.y1 - 1, T.rockfloor);
  // The keep door is LOCKED. Solid until you carry the Brass Key.
  put(DOOR_KEYS.elderwatch.x, DOOR_KEYS.elderwatch.y, T.lockdoor);
  // The Hall of Keeping is the back of the keep, behind an inner arch.
  for (let x = K.x0 + 1; x <= K.x1 - 1; x += 1) put(x, K.y0 + 5, T.cliff);
  put(K.doorX, K.y0 + 5, T.rockfloor);
  put(ELDERWATCH.standard.x, ELDERWATCH.standard.y, T.rockfloor);

  // ---- 6. THE GUARDROOM, south-east, behind a barred door on two plates.
  ring(G.x0, G.y0, G.x1, G.y1, T.rimewall);
  floor(G.x0 + 1, G.y0 + 1, G.x1 - 1, G.y1 - 1, T.rockfloor);
  for (const g of ELDERWATCH_GATES.guardroom) put(g.x, g.y, T.icegate);
  for (const p of ELDERWATCH_PLATES) put(p.x, p.y, T.plate);
  for (const b of ELDERWATCH_BOULDERS) put(b.x, b.y, T.grass);
  put(ELDERWATCH.key.x, ELDERWATCH.key.y, T.rockfloor);

  // ---- 7. seal the map, leaving the road west open.
  for (let x = 0; x < WORLD_W; x += 1) { put(x, 0, T.stone); put(x, WORLD_H - 1, T.stone); }
  for (let y = 0; y < WORLD_H; y += 1) {
    put(WORLD_W - 1, y, T.stone);
    if (!road || y < road.y0 || y > road.y1) put(0, y, T.stone);
    else put(0, y, T.path);
  }

  return { w: WORLD_W, h: WORLD_H, seed: seed | 0, tiles, layers };
}

export default buildElderwatch;
