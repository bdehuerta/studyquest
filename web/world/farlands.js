// web/world/farlands.js — THE FARLANDS: cooled lava, and nothing else yet.
//
// The fourth map, west of the Home Block past the Woodsman. It is RAW on
// purpose. Bruno, 2026-09-06: "the farlands will be a lava map — just create
// the map raw with reddish ground only, this will be a future expansion."
//
// So there is ground, a wall around it, and the road you came in on. No
// puzzle, no NPC, no gear, nothing to take. What it buys right now is that the
// Ashen Standard's objective — carry it west, back to the tribes of the
// farlands — stops pointing at a place that does not exist. The Herald's errand
// pointed at the Reaches for a week before the Reaches were built, and that is
// the shape of promise this repository keeps having to make good on.
//
// When it grows: lava as a hazard tile, the tribes, and the Levy.

import {
  WORLD_W, WORLD_H, TILE_TYPES,
  crossingRows,
} from '../../shared/constants.js';

const T = TILE_TYPES;

function scatter(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * buildFarlands(seed) -> { w, h, seed, tiles, layers }
 *
 * `layers` is all-zero: the farlands are flat, like Elderwatch, so nothing
 * downstream needs to know they exist.
 */
export function buildFarlands(seed) {
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const layers = new Uint8Array(WORLD_W * WORLD_H);
  const idx = (x, y) => y * WORLD_W + x;
  const put = (x, y, t) => {
    if (x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H) tiles[idx(x, y)] = t;
  };

  // ---- 1. the ground: cooled lava, everywhere.
  tiles.fill(T.emberrock);

  // ---- 2. a scatter of crag, so it is not one flat field of red. Sparse:
  //         this is a floor waiting for a map, not a map.
  for (let y = 0; y < WORLD_H; y += 1) {
    for (let x = 0; x < WORLD_W; x += 1) {
      const clump = scatter(Math.floor(x / 4), Math.floor(y / 4), (seed | 0) + 401);
      const grain = scatter(x, y, (seed | 0) + 53);
      if (clump > 0.74 && grain > 0.55) put(x, y, T.crag);
    }
  }

  // ---- 3. THE ROAD IN, from the east gap, carved BEFORE the wall goes up.
  //         Walling first and carving second would work; carving first and
  //         walling second would seal the road — the ordering bug the grove's
  //         door taught and the Home Block's east road had to relearn.
  //
  //         AND IT IS BIG, because it is the only thing on this map. Bruno
  //         crossed over, walked up the east wall to row 10 — where the HOME
  //         BLOCK's road is — and found nothing but red ground and a refusal.
  //         He was not stuck; he was lost, which on a featureless map is the
  //         same experience. One tile of path thirteen tiles long was a way out
  //         you had to already know about.
  //
  //         So: the full width of the gap, running most of the way across the
  //         map, with a walled shoulder either side of it. Until there is
  //         something else here, the road IS the map, and you can see it from
  //         anywhere along the east wall.
  const road = crossingRows('farlands', 'east');
  const y0 = road ? road.y0 : 42;
  const y1 = road ? road.y1 : 44;
  for (let y = y0 - 1; y <= y1 + 1; y += 1) {
    for (let x = WORLD_W - 1; x >= 12; x -= 1) {
      put(x, y, (y < y0 || y > y1) ? T.crag : T.path);
    }
  }
  // A waymarker where the road gives out, so the far end reads as unfinished
  // rather than as somewhere you failed to find the rest of.
  for (const [dx, dy] of [[0, -1], [0, 1]]) put(12 + dx, y0 + 1 + dy, T.crag);

  // ---- 4. seal it, leaving the road east open. Rock, not trees: nothing grows
  //         here.
  for (let x = 0; x < WORLD_W; x += 1) { put(x, 0, T.crag); put(x, WORLD_H - 1, T.crag); }
  for (let y = 0; y < WORLD_H; y += 1) {
    put(0, y, T.crag);
    if (!road || y < road.y0 || y > road.y1) put(WORLD_W - 1, y, T.crag);
    else put(WORLD_W - 1, y, T.path);
  }

  return { w: WORLD_W, h: WORLD_H, seed: seed | 0, tiles, layers };
}

export default buildFarlands;
