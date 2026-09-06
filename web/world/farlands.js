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
  //         So the road is the full width of the gap and runs most of the way
  //         across the map — and it has NO WALLS ALONG IT.
  //
  //         The first fix gave it walled shoulders, which was worse than the
  //         problem: a wall the width of the map with its only door at the far
  //         west end, and a stale save had put him on the north side of it. The
  //         map was technically connected and he was technically not stuck; he
  //         had a fifty-tile detour with no landmark to aim at, which is the
  //         same thing. A road you can step onto from anywhere cannot do that.
  const road = crossingRows('farlands', 'east');
  const y0 = road ? road.y0 : 42;
  const y1 = road ? road.y1 : 44;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = WORLD_W - 1; x >= 12; x -= 1) put(x, y, T.path);
  }
  // A cairn either side of where the road gives out, so the far end reads as
  // unfinished rather than as somewhere you failed to find the rest of.
  put(11, y0, T.crag);
  put(11, y1, T.crag);

  // ---- 3b. WAYMARKERS, so the road can be found from anywhere on the map.
  //
  //          Three times now Bruno has been unable to leave this map, and only
  //          the first time was he actually blocked. The other two he was loose
  //          on a featureless red field where the only exit is a band of path
  //          at the bottom of it — "walk south" is a thing I can say and the
  //          map cannot. A placeholder region has no landmarks by definition,
  //          so it has to be given some.
  //
  //          Lines of cairns run down to the road at intervals across the whole
  //          map. From anywhere you can see one, and every one of them leads
  //          south to the road: follow any of them and you are out. They are
  //          scenery, not walls — they are one tile wide with gaps, so nothing
  //          can be walked round or trapped behind them.
  for (let x = 6; x < WORLD_W; x += 9) {
    for (let y = 3; y < y0 - 1; y += 4) put(x, y, T.crag);
  }
  for (let y = y1 + 2; y < WORLD_H - 2; y += 4) {
    for (let x = 6; x < WORLD_W; x += 9) put(x, y, T.crag);
  }

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
