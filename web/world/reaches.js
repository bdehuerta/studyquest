// web/world/reaches.js — the Snowfall Reaches: a mountain of five terraces.
//
// WHY THIS IS NOT NOISE, AND WHY IT IS STACKED
//
// The first Reaches was the Home Block's generator with the palette swapped.
// The second was authored but laid out west-to-east, which meant the climb ran
// sideways: the drawn cliff faces hang off the SOUTH edge of a terrace, so a
// mountain that climbs eastward has no face pointing at you and no way to tell
// which of two fields of snow is the higher one. Bruno got stuck at a ladder for
// exactly that reason.
//
// So the mountain is STACKED. Five terraces, bottom of the map to the top, and
// you arrive on the lowest one. North is up, always. Each terrace is a room with
// exactly one way out of the top of it, and that way out is behind that
// terrace's puzzle:
//
//   0  THE FOOT              the labyrinth      -> a stair,  and the Hooks
//   1  THE FROZEN TARN       the slide          -> a ladder, and the Crampons
//   2  THE BOULDER TERRACE   boulders on plates -> a stair
//   3  THE SHATTERED STEPS   the dungeon        -> a ladder, and the Hammer
//   4  THE SUMMIT            the Rime Warden    -> the cave
//
// Every ladder needs the Climbing Hooks; a stair needs only legs. That is the
// whole difference between them and the reason the mountain has both.

import {
  WORLD_W, WORLD_H, TILE_TYPES,
  CROSSING, TERRACE_BANDS, CLIMBS, EAST_ROAD,
  GEAR_SITES, REACHES_PLATES, REACHES_GATES, REACHES_BOULDERS,
  WARDEN, WISE_CAVE,
} from '../../shared/constants.js';

const T = TILE_TYPES;

/**
 * THE LABYRINTH, 15x15, drawn rather than generated at run time.
 *
 * Door on the WEST edge, exit at the NORTH-east corner — opposite corners, so
 * the walk is a real one: 28 tiles between them, with the Climbing Hooks down a
 * 56-tile detour off it. Verified connected on every test run; see
 * tools/checks/23-mountain.mjs.
 *
 *   #  rimewall (no tool in the game touches it)   .  open snow
 *   E  the way in    X  the way out    *  where the Hooks lie
 */
const MAZE_X = 10;
const MAZE_Y = 32;
const MAZE = [
  '#############X#',
  '#.........#...#',
  '#.###.#####.#.#',
  '#.#*#.#.....#.#',
  '#.#.#.#.#####.#',
  '#...#.......#.#',
  '###########.#.#',
  '#.....#.....#.#',
  '#.###.#######.#',
  '#.#...........#',
  '#.###########.#',
  '#...#...#.....#',
  '###...###.#####',
  'E...#.........#',
  '###############',
];
const MAZE_DOOR = { x: MAZE_X, y: MAZE_Y + 13 };
const MAZE_EXIT = { x: MAZE_X + 13, y: MAZE_Y };

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
}

/** Deterministic hash noise. Scatter only — never structure. */
function scatter(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * buildReaches(seed) -> { w, h, seed, tiles, layers }
 *
 * `layers` is the parallel array that makes the mountain a mountain. Everything
 * downstream — collision, drawing, the camera — reads both.
 */
export function buildReaches(seed) {
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const layers = new Uint8Array(WORLD_W * WORLD_H);
  const idx = (x, y) => y * WORLD_W + x;
  const put = (x, y, t) => { if (inBounds(x, y)) tiles[idx(x, y)] = t; };
  const lay = (x, y, n) => { if (inBounds(x, y)) layers[idx(x, y)] = n; };
  const rect = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) fn(x, y);
  };
  const floor = (x0, y0, x1, y1, t) => rect(x0, y0, x1, y1, (x, y) => put(x, y, t));
  const wall = (x0, y0, x1, y1) => rect(x0, y0, x1, y1, (x, y) => put(x, y, T.rimewall));

  // ---- 1. bare snow, and pines in COPSES rather than sprinkled per tile.
  for (let y = 0; y < WORLD_H; y += 1) {
    for (let x = 0; x < WORLD_W; x += 1) {
      const wood = scatter(Math.floor(x / 5), Math.floor(y / 5), (seed | 0) + 91);
      const fine = scatter(x, y, seed | 0);
      const dense = wood > 0.62 && fine > 0.40;
      const edge = wood > 0.54 && fine > 0.88;
      tiles[idx(x, y)] = (dense || edge) ? T.snowpine : T.snow;
    }
  }

  // ---- 2. the terraces, as horizontal bands. Bottom of the map is layer 0.
  for (const band of TERRACE_BANDS) {
    rect(0, band.y0, WORLD_W - 1, band.y1, (x, y) => lay(x, y, band.layer));
  }
  // The border rows belong to the terrace they border. Left on layer 0, the top
  // row was drawn UNLIFTED against a summit lifted three tiles, which opened a
  // band of bare background across the top of the mountain.
  const top = TERRACE_BANDS[TERRACE_BANDS.length - 1];
  const bottom = TERRACE_BANDS[0];
  for (let x = 0; x < WORLD_W; x += 1) {
    lay(x, 0, top.layer);
    lay(x, WORLD_H - 1, bottom.layer);
  }

  // ---- 3. THE FOOT, layer 0. You arrive here, at the bottom-left, and the
  //         mountain is in front of you: four terraces of it, up the screen.
  const entryY = CROSSING.peaksEntryY;
  rect(0, entryY - 1, 9, entryY + CROSSING.gapH, (x, y) => put(x, y, T.snow));
  floor(0, entryY, 4, entryY + CROSSING.gapH - 1, T.snowroad);
  // the road from the pass to the labyrinth's west door
  road(4, entryY + 1, MAZE_DOOR.x - 1, entryY + 1);
  road(MAZE_DOOR.x - 1, entryY + 1, MAZE_DOOR.x - 1, MAZE_DOOR.y);

  // ---- 4. the labyrinth itself.
  for (let r = 0; r < MAZE.length; r += 1) {
    const row = MAZE[r];
    for (let c = 0; c < row.length; c += 1) {
      const x = MAZE_X + c;
      const y = MAZE_Y + r;
      lay(x, y, 0);
      put(x, y, row[c] === '#' ? T.rimewall : T.snow);
    }
  }
  // ---- 4b. THE ROAD EAST, out of the labyrinth's north door and away along
  //          the top of the Foot. It goes nowhere yet — see EAST_ROAD.
  for (let x = EAST_ROAD.x0; x <= EAST_ROAD.x1; x += 1) {
    put(x, EAST_ROAD.y, T.snowroad);
    lay(x, EAST_ROAD.y, 0);
  }
  // ITS FAR END IS A PASS, not a road that stops in a field. Two piers of
  // rimewall frame the last tile, and the border beyond it stays sealed: you
  // can see where the road goes and that it is not open yet, which is the whole
  // job of a signpost you cannot follow.
  put(EAST_ROAD.x1, EAST_ROAD.y - 1, T.rimewall);
  put(EAST_ROAD.x1, EAST_ROAD.y + 1, T.rimewall);
  put(EAST_ROAD.x1 - 1, EAST_ROAD.y - 1, T.rimewall);
  put(EAST_ROAD.x1 - 1, EAST_ROAD.y + 1, T.rimewall);

  // ---- 5. THE FROZEN TARN, layer 1. THE WHOLE TERRACE IS ICE, wall to wall.
  //
  //         Bruno, 2026-09-04: "make all of the floor ice so you cant go around
  //         it." He is right — the first cut left snow margins along the top,
  //         the bottom and both ends, so the entire slide could be walked round
  //         on dry ground and the puzzle was optional.
  //
  //         The only ground you can stand still on up here is the island with
  //         the Crampons on it, the landing at the top of the stair you came up
  //         by, and the tile at the foot of the ladder you leave by. Everything
  //         else is ice: without Crampons every step is a slide that only ends
  //         against something.
  rect(1, 24, 62, 31, (x, y) => put(x, y, T.ice));
  // Pillars — the walls of the slide. Hand-placed: a random pillar field is a
  // random puzzle, which is to say not one.
  for (const [x, y] of [
    [12, 25], [20, 25], [28, 25], [36, 25], [44, 25], [52, 25],
    [9, 27], [17, 27], [25, 27], [33, 27], [41, 27], [49, 27],
    [14, 29], [22, 29], [31, 29], [39, 29], [47, 29], [55, 29],
    // THE TWO THAT MAKE IT A PUZZLE RATHER THAN A FIELD OF ICE.
    //
    // (26,31) stops the first slide east out of the stair landing at 25,31 —
    // from there north stops under the pillar at 25,27, and east from THERE
    // runs onto the island. That is the route, and it is three slides long. It
    // moved down a row with the landing: the route is anchored to where you
    // first stand, so moving the door moved this too.
    [26, 31],
    // (50,26) sits directly under the ladder's foot so that nothing can ever
    // come to rest on it: a slide north up that column is stopped a tile early,
    // and no other direction can end there. Without it a lucky slide would land
    // you at the ladder and the Crampons would be decoration.
    [50, 26],
  ]) put(x, y, T.crag);
  // The two footholds. The island is one; the other is the landing at the top
  // of the stair you arrive by. The foot of the LADDER is left as ice on
  // purpose — you cannot stand still beside it until you have the Crampons,
  // which is the whole of this terrace's lock.
  floor(29, 28, 30, 28, T.snow);
  put(CLIMBS.foot.x, CLIMBS.foot.y - 1, T.snow);

  // ---- 6. THE BOULDER TERRACE, layer 2. A wall across it with an ice gate in
  //         it; two boulders, two plates, and the stair beyond.
  floor(1, 17, 62, 23, T.snow);
  wall(20, 17, 20, 23);
  for (const g of REACHES_GATES.terrace) put(g.x, g.y, T.icegate);
  for (const p of REACHES_PLATES) put(p.x, p.y, T.plate);
  for (const b of REACHES_BOULDERS) put(b.x, b.y, T.snow);
  // ---- 7. THE SHATTERED STEPS, layer 3 — A DUNGEON, NOT A WARREN.
  //
  //         Solid rock, with chambers carved into it and doorways two tiles
  //         wide. Two doorways are bricked up with cracked crag; the first is
  //         visible from the room you arrive in, and the Hammer that opens it is
  //         up the OTHER doorway. You meet the lock before you find the key.
  rect(1, 9, 62, 16, (x, y) => { put(x, y, T.rimewall); });
  floor(11, 12, 18, 16, T.rockfloor);   // A — the entry hall, at the stair head
  floor(12, 9, 16, 10, T.rockfloor);    // the Hammer's vault, north of it
  put(14, 11, T.rockfloor);             // the doorway between them
  floor(20, 12, 34, 16, T.rockfloor);   // B — the long gallery, up against the door
  floor(26, 9, 40, 11, T.rockfloor);    // C — the upper hall
  put(30, 11, T.rockfloor);
  floor(42, 9, 52, 12, T.rockfloor);    // D — the east chamber, under the summit
  for (const [x, y] of [[19, 14], [19, 15], [41, 10], [41, 11]]) put(x, y, T.crackedcrag);
  road(30, 12, 30, 11);   // the open doorway from the gallery up to the hall

  // ---- 8. THE SUMMIT, layer 4. The Warden's shelf, walled but for the ladder.
  rect(1, 1, 62, 7, (x, y) => { put(x, y, T.snow); lay(x, y, 4); });
  rect(1, 8, 62, 8, (x, y) => { put(x, y, T.crag); lay(x, y, 4); });
  rect(WISE_CAVE.x - 1, WISE_CAVE.y - 1, WISE_CAVE.x + WISE_CAVE.w, WISE_CAVE.y + WISE_CAVE.h,
    (x, y) => { put(x, y, T.cliff); lay(x, y, 4); });
  rect(WISE_CAVE.x, WISE_CAVE.y, WISE_CAVE.x + WISE_CAVE.w - 1, WISE_CAVE.y + WISE_CAVE.h - 1,
    (x, y) => { put(x, y, T.rockfloor); lay(x, y, 4); });
  put(WISE_CAVE.doorX, WISE_CAVE.doorY, T.rockfloor);
  lay(WISE_CAVE.doorX, WISE_CAVE.doorY, 4);
  for (const p of WARDEN.plates) { put(p.x, p.y, T.plate); lay(p.x, p.y, 4); }
  for (const b of WARDEN.boulders) { put(b.x, b.y, T.snow); lay(b.x, b.y, 4); }
  // ---- 8b. THE FOUR WAYS UP, cut LAST of all the terrain.
  //
  //          Every one of them was being placed as its terrace was built, and
  //          the NEXT terrace's floor pass then painted straight over it — the
  //          stair out of the labyrinth was snow again by the time the map was
  //          finished. Nothing is a way up until every floor has been laid.
  for (const c of Object.values(CLIMBS)) {
    put(c.x, c.y, c.kind === 'ladder' ? T.ladder : T.stair);
    lay(c.x, c.y, c.layer);
  }

  // ---- 9. the gear lies on ground you can stand on, and on the ground that
  //         room is made of.
  for (const g of GEAR_SITES) {
    const here = tiles[idx(g.x, g.y)];
    const walkable = here === T.snow || here === T.ice
      || here === T.rockfloor || here === T.snowroad;
    if (!walkable) put(g.x, g.y, layers[idx(g.x, g.y)] >= 3 ? T.rockfloor : T.snow);
  }

  // ---- 10. THE TERRACE WALLS.
  //
  //          A tile with a HIGHER tile to its east, west or south is rock seen
  //          edge-on: it becomes cliff. A tile with a higher one to its NORTH is
  //          a LEDGE — its face is drawn above it and you may hop down off it,
  //          which is what makes the climb a loop instead of a corridor.
  //
  //          The tile in front of a ladder or a stair is exempt: that is what a
  //          way up IS, the hole in the wall.
  {
    const portal = new Set();
    for (let y = 0; y < WORLD_H; y += 1) {
      for (let x = 0; x < WORLD_W; x += 1) {
        const t = tiles[idx(x, y)];
        if (t !== T.ladder && t !== T.stair) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) portal.add(`${x + dx},${y + dy}`);
      }
    }
    const walls = [];
    for (let y = 0; y < WORLD_H; y += 1) {
      for (let x = 0; x < WORLD_W; x += 1) {
        if (portal.has(`${x},${y}`)) continue;
        const here = layers[idx(x, y)];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          if (layers[idx(nx, ny)] > here) { walls.push([x, y]); break; }
        }
      }
    }
    for (const [x, y] of walls) put(x, y, T.cliff);
  }

  // ---- 11. seal every edge but the road in from Home, at the foot.
  const border = (x, y) => { put(x, y, T.crag); };
  for (let x = 0; x < WORLD_W; x += 1) { border(x, 0); border(x, WORLD_H - 1); }
  for (let y = 0; y < WORLD_H; y += 1) {
    if (y < entryY || y >= entryY + CROSSING.gapH) border(0, y);
    border(WORLD_W - 1, y);
  }
  for (let y = entryY; y < entryY + CROSSING.gapH; y += 1) {
    put(0, y, T.snowroad);
    lay(0, y, 0);
  }

  return { w: WORLD_W, h: WORLD_H, seed: seed | 0, tiles, layers };

  /** Cut a straight run of walkable ground, keeping whatever layer is there. */
  function road(x0, y0, x1, y1) {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    for (let guard = 0; guard < 200; guard += 1) {
      const cur = tiles[idx(x, y)];
      const keep = cur === T.ice || cur === T.plate || cur === T.ladder
        || cur === T.stair || cur === T.icegate;
      if (!keep) put(x, y, layers[idx(x, y)] >= 3 ? T.rockfloor : T.snow);
      if (x === x1 && y === y1) break;
      if (x !== x1) x += dx;
      else if (y !== y1) y += dy;
    }
  }
}

export default buildReaches;
