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
  crossingRows, CHEESE_CAVE, FARLANDS_CAMP, questSitesFor, AREAS,
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
  //
  //         SHORT, like every other map's. Bruno: "could you make the road less
  //         lengthy? like the rest of them, just a few blocks of path and the
  //         gap in the wall." The long version — spines up both sides and rungs
  //         across — was scaffolding for a region with no landmarks yet, and it
  //         made the placeholder look like a plan. The landmarks are the
  //         chapter's job; this is just the way in.
  const road = crossingRows('farlands', 'east');
  const y0 = road ? road.y0 : 42;
  const y1 = road ? road.y1 : 44;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = WORLD_W - 1; x >= WORLD_W - 10; x -= 1) put(x, y, T.path);
  }

  // ---- 3c. THE CHEESE CAVE: a rock mass, with a hole in it.
  //
  //          The first cut was a nine-by-eight rectangle of cave floor with a
  //          rim round it, which from outside is not a cave — it is a room with
  //          the roof off, and you can see the whole of it before you go in.
  //          Bruno: "from the outside I should not be able to see the cave!"
  //
  //          So it is an OUTCROP now: a mass of crag standing on the moor with
  //          one dark opening cut into its south face. From outside you see
  //          rock and a hole. The two tiles of cave floor inside the hole are
  //          all you get, and they are dark, so the mouth reads as somewhere
  //          that goes back rather than somewhere that stops.
  //          ROUNDED, not a box. Bruno: "can you make the mountain where the
  //          stairs and the door to the labyrinth in the farlands a bit more
  //          rounder or at least with softer edges in stone?" A rectangle of
  //          crag reads as a building somebody put there; rock does not have
  //          corners. So the mass is an ELLIPSE, and its edge is roughened by
  //          the same deterministic scatter the rest of the map uses, which
  //          keeps it a hill rather than a stadium.
  const H = CHEESE_CAVE.hollow;
  const cx = (H.x0 + H.x1) / 2;
  const cy = (H.y0 + H.y1) / 2;
  const rx = (H.x1 - H.x0) / 2 + 0.5;
  const ry = (H.y1 - H.y0) / 2 + 0.5;
  for (let y = H.y0 - 1; y <= H.y1 + 1; y += 1) {
    for (let x = H.x0 - 1; x <= H.x1 + 1; x += 1) {
      // Distance in ellipse units: 1.0 is the edge.
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      // ...and the edge wanders by a fifth of a radius, so no two sides of it
      // are the same shape.
      const rough = 0.86 + scatter(x, y, (seed | 0) + 733) * 0.22;
      if (d <= rough) put(x, y, T.crag);
    }
  }
  // The mouth: a two-tile notch in the south face, and the stair at the back
  // of it. Cut AFTER the mass, so it is a hole in rock rather than rock round
  // a hole — the same ordering the grove's door and the Reaches' roads taught.
  const M = CHEESE_CAVE.mouth;
  put(M.x, M.y + 1, T.rockfloor);
  put(M.x, M.y, T.stair);
  // The door his end of the warren opens, set into the same face.
  put(CHEESE_CAVE.door.x, CHEESE_CAVE.door.y, T.lockdoor);
  put(CHEESE_CAVE.door.x, CHEESE_CAVE.door.y + 1, T.rockfloor);

  // ...and the road runs along the foot of the outcrop, never through it: the
  // way home has to survive the scenery.
  for (let y = y0; y <= y1; y += 1) {
    for (let x = H.x0 - 1; x <= H.x1 + 1; x += 1) put(x, y, T.path);
  }

  // ---- 3d. ILSA'S CAMP, west along the road. One fire, and room around it.
  //
  //          Deliberately small. Eleven more families exist and none of them is
  //          within nine miles of this one — that is the whole point of the
  //          chapter — so a camp that looked like a settlement would be telling
  //          the player the opposite of the truth.
  const R = FARLANDS_CAMP.rect;
  for (let y = R.y0; y <= R.y1; y += 1) {
    for (let x = R.x0; x <= R.x1; x += 1) {
      if (tiles[idx(x, y)] === T.crag) put(x, y, T.emberrock);
    }
  }
  // A short path from the road up to the fire, so the camp reads as lived in
  // and, more usefully, so it can be found from the one road on the map.
  for (let y = y0; y >= FARLANDS_CAMP.y; y -= 1) put(FARLANDS_CAMP.x, y, T.path);
  put(FARLANDS_CAMP.x, FARLANDS_CAMP.y, T.brazier);
  // Her shelter and her stores, either side of it.
  put(FARLANDS_CAMP.x - 2, FARLANDS_CAMP.y, T.crate);
  put(FARLANDS_CAMP.x + 2, FARLANDS_CAMP.y - 1, T.crate);

  // ---- 3e. PAPER ON THE GROUND, under every page that is lying about.
  //
  //          Bruno: "wherever there are codex pages in the floor add paper
  //          pages on the floor you can set on and remove it when you take the
  //          pages." Walkable, because you stand on it to pick the page up —
  //          and world.js stops drawing it once the page is taken, so the
  //          ground stops advertising something that is not there any more.
  for (const q of questSitesFor(AREAS.farlands, 0)) put(q.x, q.y, T.scatteredpaper);

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

/**
 * buildCheeseCave(seed) -> { w, h, seed, tiles, layers }
 *
 * THE WARREN, as its own full-size map — the same trick the Keep of Elderwatch
 * uses. Collision, the camera and the tile loop never learn that a cave exists;
 * they are handed a map that happens to be almost entirely solid rock with
 * corridors cut through it.
 *
 * What differs from the Keep is the LIGHT. A tower floor greys the world out
 * around a lit room, so you can read the whole floor at a glance and the puzzle
 * is timing. This lights nothing: it is the Stonemason's dark, and all you ever
 * see is the pool the lantern makes. You cannot read a maze you cannot see, so
 * the maze has to be walked — which is the point, and the reason the cave mouth
 * says out loud that you should bring a lantern.
 *
 * A PERFECT MAZE, carved on odd cells by iterative backtracking. Perfect means
 * exactly one route between any two points and no closed-off pockets: every
 * corridor connects, so the monger is always reachable and nowhere in here can
 * strand you. Deterministic from the seed, so the cave is the same cave every
 * time you come back to it — a maze that reshuffles is not a place.
 */
export function buildCheeseCave(seed) {
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const layers = new Uint8Array(WORLD_W * WORLD_H);
  const idx = (x, y) => y * WORLD_W + x;
  const put = (x, y, t) => {
    if (x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H) tiles[idx(x, y)] = t;
  };

  // Solid rock, and the corridors are cut out of it.
  tiles.fill(T.crag);

  // A small deterministic PRNG, so the warren is the same warren every visit.
  let n = (seed | 0) || 1;
  const rnd = () => {
    n ^= n << 13; n |= 0; n ^= n >>> 17; n ^= n << 5; n |= 0;
    return ((n >>> 0) % 100000) / 100000;
  };

  const inCell = (x, y) => x > 0 && y > 0 && x < WORLD_W - 1 && y < WORLD_H - 1;
  const start = CHEESE_CAVE.entry;
  const seen = new Set([`${start.x},${start.y}`]);
  const stack = [[start.x, start.y]];
  put(start.x, start.y, T.rockfloor);

  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    // Neighbours two cells away, so the tile between becomes the doorway.
    const opts = [[2, 0], [-2, 0], [0, 2], [0, -2]]
      .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny]) => inCell(nx, ny) && !seen.has(`${nx},${ny}`));
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = opts[Math.floor(rnd() * opts.length) % opts.length];
    put(x + dx / 2, y + dy / 2, T.rockfloor);
    put(nx, ny, T.rockfloor);
    seen.add(`${nx},${ny}`);
    stack.push([nx, ny]);
  }

  // The two things that are not corridor: where he stands, and the way out
  // beside him. Both are carved regardless of what the maze did, and joined to
  // it, so neither can end up walled off by an unlucky seed.
  const { monger, exit } = CHEESE_CAVE;
  put(monger.x, monger.y, T.rockfloor);
  put(exit.x, exit.y, T.stair);
  put((monger.x + exit.x) / 2, monger.y, T.rockfloor);

  // ...and the entry is a stair too: stepping onto it is how you leave the way
  // you came, for anybody who turns round before finding him.
  put(start.x, start.y, T.stair);

  return { w: WORLD_W, h: WORLD_H, seed: seed | 0, tiles, layers };
}
