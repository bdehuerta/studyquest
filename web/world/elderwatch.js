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
  ELDERWATCH, ELDERWATCH_GATES, ELDERWATCH_PLATES, TOWER, TOWER_FLOORS,
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

  // ---- 1. the moor outside: cold grass gone to scrub, with copses of pine.
  for (let y = 0; y < WORLD_H; y += 1) {
    for (let x = 0; x < WORLD_W; x += 1) {
      const wood = scatter(Math.floor(x / 5), Math.floor(y / 5), (seed | 0) + 313);
      const fine = scatter(x, y, (seed | 0) + 7);
      tiles[idx(x, y)] = (wood > 0.66 && fine > 0.45) ? T.tree : T.grass;
    }
  }

  // ---- 2. the road in from the west, up to the fort's gate.
  const road = crossingRows('elderwatch', 'west');
  const roadY = road ? road.y0 + 1 : 33;
  for (let x = 0; x <= W.x0; x += 1) put(x, roadY, T.path);
  for (let y = Math.min(roadY, ELDERWATCH.gate.y); y <= Math.max(roadY, ELDERWATCH.gate.y); y += 1) {
    put(W.x0 - 1, y, T.path);
  }

  // ---- 3. THE OUTER WALL, two tiles thick. A fort you can see round the back
  //         of is a fence.
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

  // ---- 4. THE BAILEY. Cobbled ground, and a garrison's clutter on it: a
  //         well, stacked crates, braziers, and lean-to sheds against the
  //         wall. An empty yard reads as an unfinished map.
  floor(W.x0 + 2, W.y0 + 2, W.x1 - 2, W.y1 - 2, T.grass);
  const cobbles = [
    [22, 24, 34, 26], [34, 30, 40, 36], [40, 20, 50, 22],
  ];
  for (const [x0, y0, x1, y1] of cobbles) floor(x0, y0, x1, y1, T.path);
  // sheds and stores along the north and east walls. The south-east one is NOT
  // here: that rectangle is the guardroom, and it gets a barred door rather
  // than a doorway (step 6).
  for (const [x0, y0, x1, y1] of [[22, 11, 30, 14], [46, 11, 52, 15]]) {
    ring(x0, y0, x1, y1, T.rimewall);
    floor(x0 + 1, y0 + 1, x1 - 1, y1 - 1, T.rockfloor);
    put(Math.round((x0 + x1) / 2), y1, T.rockfloor);   // a doorway
  }
  // the well
  for (const [x, y] of [[26, 30], [27, 30], [26, 31], [27, 31]]) put(x, y, T.stone);
  // and a scatter of stacked stone around the yard's edges
  // NOT on column 21 — that is `watch_west`'s lane, and two stones parked on
  // it walled the wall-walk shut.
  for (const [x, y] of [
    [20, 18], [20, 19], [31, 12], [44, 34], [45, 34], [52, 26], [52, 27], [23, 36], [24, 36],
  ]) put(x, y, T.stone);

  // ---- 5. THE KEEP: a ROUND TOWER in the middle of the bailey, with its door
  //         in the south face. Inside it, the map greys out and you climb.
  for (let y = TOWER.cy - TOWER.r - 1; y <= TOWER.cy + TOWER.r + 1; y += 1) {
    for (let x = TOWER.cx - TOWER.r - 1; x <= TOWER.cx + TOWER.r + 1; x += 1) {
      const d = Math.hypot(x - TOWER.cx, y - TOWER.cy);
      if (d <= TOWER.r) put(x, y, T.cliff);            // the tower's bulk
      else if (d <= TOWER.r + 1) put(x, y, T.rimewall); // its footing
    }
  }
  // THE DOOR IS A STAIR. Stepping onto it is what takes you into the Keep —
  // as a rockfloor tile it was a doorway with no door behind it, and the tower
  // could be walked up to and not entered.
  put(TOWER.doorX, TOWER.doorY, T.stair);
  put(TOWER.doorX, TOWER.doorY + 1, T.rockfloor);
  for (let y = TOWER.doorY + 1; y <= W.y1 - 2; y += 1) put(TOWER.doorX, y, T.path);

  // ---- 6. THE GUARDROOM, south-east against the wall, behind a barred door
  //         held by two plates. The last room of the flat fort: when the keep
  //         became a tower it landed on the old guardroom AND on the barrels
  //         that opened it, so the whole lock moved out here to the yard's edge
  //         where there is ground wide enough to shove a barrel along.
  const G = ELDERWATCH.guardroom;
  ring(G.x0, G.y0, G.x1, G.y1, T.rimewall);
  floor(G.x0 + 1, G.y0 + 1, G.x1 - 1, G.y1 - 1, T.rockfloor);
  // THE BARREL ROAD FIRST, THE PLATES ON TOP OF IT. The row the barrels are
  // shoved along has to be plain walkable ground the whole way — and cobbling
  // it after laying the plates would pave straight over them, which is the same
  // ordering bug the grove's door and the Reaches' labyrinth both taught.
  floor(24, G.y1 + 1, G.x1 + 1, G.y1 + 1, T.path);
  for (const g of ELDERWATCH_GATES.guardroom) put(g.x, g.y, T.icegate);
  for (const p of ELDERWATCH_PLATES) put(p.x, p.y, T.plate);
  put(ELDERWATCH.codex.x, ELDERWATCH.codex.y, T.rockfloor);
  // a table and a brazier, so the room reads as somewhere people sat
  put(G.x0 + 1, G.y0 + 1, T.crate);
  put(G.x1 - 1, G.y0 + 1, T.brazier);

  // ---- 7. seal the map, leaving the road west open.
  for (let x = 0; x < WORLD_W; x += 1) { put(x, 0, T.stone); put(x, WORLD_H - 1, T.stone); }
  for (let y = 0; y < WORLD_H; y += 1) {
    put(WORLD_W - 1, y, T.stone);
    if (!road || y < road.y0 || y > road.y1) put(0, y, T.stone);
    else put(0, y, T.path);
  }

  return { w: WORLD_W, h: WORLD_H, seed: seed | 0, tiles, layers };
}

/**
 * buildTowerFloor(n) -> { w, h, seed, tiles, layers }
 *
 * ONE FLOOR OF THE KEEP, drawn on a full-size map so that everything
 * downstream — collision, the camera, the tile loop — needs no special case.
 * Outside the tower's circle is solid: it is not part of this floor, and while
 * you are on this floor it is not part of the world either. The renderer greys
 * it out, so what you see is one room hanging in the middle of Elderwatch.
 */
export function buildTowerFloor(n) {
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const layers = new Uint8Array(WORLD_W * WORLD_H);
  const idx = (x, y) => y * WORLD_W + x;
  const put = (x, y, t) => { if (inBounds(x, y)) tiles[idx(x, y)] = t; };
  const floorDef = TOWER_FLOORS[n - 1];
  if (!floorDef) return { w: WORLD_W, h: WORLD_H, seed: n, tiles, layers };

  // Everything is rock; the room is cut out of it.
  tiles.fill(T.cliff);
  for (let y = TOWER.cy - TOWER.r; y <= TOWER.cy + TOWER.r; y += 1) {
    for (let x = TOWER.cx - TOWER.r; x <= TOWER.cx + TOWER.r; x += 1) {
      const d = Math.hypot(x - TOWER.cx, y - TOWER.cy);
      if (d <= TOWER.r - 2) put(x, y, T.rockfloor);
      else if (d <= TOWER.r) put(x, y, T.rimewall);
    }
  }

  // The furniture, all of it drawn as tiles so it collides like a room should.
  // Every prop is a real tile, so it collides like the thing it looks like. The
  // brazier used to stand in as a PRESSURE PLATE, which is the one prop in this
  // game a player must never misread.
  const PROP_TILE = {
    pillar: T.rimewall,
    crate: T.crate,
    brazier: T.brazier,
    table: T.crate,
    rack: T.crate,
    banner: T.rimewall,
    water: T.water,
  };
  for (const prop of (floorDef.props || [])) {
    put(prop.x, prop.y, PROP_TILE[prop.kind] || T.crate);
  }
  for (const c of (floorDef.cracked || [])) put(c.x, c.y, T.crackedcrag);
  for (const g of Object.values(floorDef.gates || {})) {
    for (const t of g) put(t.x, t.y, T.icegate);
  }
  for (const p of (floorDef.plates || [])) put(p.x, p.y, T.plate);
  for (const b of (floorDef.boulders || [])) put(b.x, b.y, T.rockfloor);
  if (floorDef.lock) put(floorDef.lock.x, floorDef.lock.y, T.lockdoor);
  if (floorDef.up) put(floorDef.up.x, floorDef.up.y, T.stair);
  if (floorDef.down) put(floorDef.down.x, floorDef.down.y, T.ladder);

  return { w: WORLD_W, h: WORLD_H, seed: n, tiles, layers };
}

export default buildElderwatch;
