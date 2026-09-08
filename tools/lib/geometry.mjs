// tools/lib/geometry.mjs — is every piece of puzzle furniture standing on
// ground that exists?
//
// WHY THIS EXISTS. When the Keep of Elderwatch became a round tower, the tower
// was built in the middle of the bailey — directly on top of the yard puzzle
// that was already there. A barrel, a plate and two thirds of a barred gate
// ended up inside solid stone, the old keep's locked door ended up inside solid
// stone, and BOTH watchmen were left pacing beats that ran eight tiles through
// the middle of the tower. The bailey's entire encounter had stopped happening.
//
// Every one of the 25 smoke suites passed the whole time. They had to: nothing
// threw, no promise rejected, the map still built. This project's signature
// failure mode is finished code wired to nothing, and the answer to it is to
// assert what the PLAYER IS SHOWN — so this asks the only question that would
// have caught it, which is whether the tile under each declared coordinate is
// one a scholar could ever stand on.
//
// It generates the real map with the real worldgen and reads the real tiles.
// A copy of the geometry would be the copy that goes stale.

import {
  TILE_TYPES, SOLID_TILES, WORLD_W, WORLD_H,
  AREAS, AREA_PUZZLES, TOWER_FLOORS, ELDERWATCH, ELDERWATCH_WATCH,
  bouldersFor, platesFor, questSitesFor, GEAR_SITES, CROSSINGS, WARDEN,
  AREA_IDS, areaOfSave,
  ELDERWATCH_SWITCHES,
} from '../../shared/constants.js';
import { buildElderwatch, buildTowerFloor } from '../../web/world/elderwatch.js';
import { buildReaches } from '../../web/world/reaches.js';
import { buildFarlands } from '../../web/world/farlands.js';
import { createWorld } from '../../web/world/world.js';
import { pagesContract, CODEX_PAGE_IDS } from '../../shared/pages.js';

const SOLID = new Set(SOLID_TILES);
const T = TILE_TYPES;
const reaches = buildReaches(1);

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const isTTY = process.stdout.isTTY;
const R = isTTY ? '\x1b[31m' : '';
const G = isTTY ? '\x1b[32m' : '';
const D = isTTY ? '\x1b[2m' : '';
const X = isTTY ? '\x1b[0m' : '';

const failures = [];
let checked = 0;

function tileName(t) {
  return Object.keys(T).find((k) => T[k] === t) || `#${t}`;
}

/**
 * Assert a tile is something the player can be on.
 *
 * A gate and a locked door are SOLID by design — that is what makes them doors
 * — so they are named as expected rather than demanded to be walkable.
 */
function expectTile(map, label, x, y, { walkable = true, oneOf = null } = {}) {
  checked += 1;
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) {
    failures.push(`${label} at ${x},${y} is off the map`);
    return;
  }
  const t = map.tiles[y * WORLD_W + x];
  if (oneOf) {
    if (!oneOf.includes(t)) {
      failures.push(
        `${label} at ${x},${y} is ${tileName(t)}, expected ${oneOf.map(tileName).join(' or ')}`);
    }
    return;
  }
  if (walkable && SOLID.has(t)) {
    failures.push(`${label} at ${x},${y} stands in solid ${tileName(t)}`);
  }
}

/** Every tile of a patrol's lane, end to end. */
function laneTiles(beat) {
  const out = [];
  if (Number.isFinite(beat.colX)) {
    const a = Math.min(beat.fromY, beat.toY);
    const b = Math.max(beat.fromY, beat.toY);
    for (let y = a; y <= b; y += 1) out.push([beat.colX, y]);
  } else {
    const a = Math.min(beat.fromX, beat.toX);
    const b = Math.max(beat.fromX, beat.toX);
    for (let x = a; x <= b; x += 1) out.push([x, beat.rowY]);
  }
  return out;
}

/**
 * One room's furniture against one map's tiles.
 *
 * `puzzle` is whatever `AREA_PUZZLES` or a tower floor declares; they are the
 * same shape on purpose, which is what let Elderwatch inherit the mountain's
 * whole apparatus, and is what lets one checker cover both.
 */
function checkRoom(map, where, puzzle, extras = {}) {
  for (const b of (puzzle.boulders || [])) {
    expectTile(map, `${where}: boulder "${b.id}" starts`, b.x, b.y);
  }
  for (const p of (puzzle.plates || [])) {
    // A plate must BE a plate. Drawn as bare floor it is an invisible trigger,
    // and drawn as a brazier it is a lie — which is exactly what happened once.
    expectTile(map, `${where}: plate "${p.id}"`, p.x, p.y, { oneOf: [T.plate] });
  }
  for (const [name, tiles] of Object.entries(puzzle.gates || {})) {
    for (const t of tiles) {
      expectTile(map, `${where}: gate "${name}"`, t.x, t.y, { oneOf: [T.icegate] });
    }
  }
  if (puzzle.door) {
    expectTile(map, `${where}: the tile a patrol throws you back to`, puzzle.door.x, puzzle.door.y);
  }
  for (const beat of (extras.patrols || [])) {
    for (const [x, y] of laneTiles(beat)) {
      expectTile(map, `${where}: ${beat.id || 'patrol'} paces`, x, y);
    }
  }
  for (const q of (extras.quests || [])) {
    expectTile(map, `${where}: the ${q.item} lies`, q.x, q.y);
  }
  if (extras.lock) {
    expectTile(map, `${where}: locked door`, extras.lock.x, extras.lock.y, { oneOf: [T.lockdoor] });
  }
  for (const c of (extras.cracked || [])) {
    expectTile(map, `${where}: cracked arch`, c.x, c.y, { oneOf: [T.crackedcrag] });
  }
  for (const s of (extras.stairs || [])) {
    if (!s) continue;
    expectTile(map, `${where}: stair`, s.x, s.y, { oneOf: [T.stair, T.ladder] });
  }
}

// ── the bailey ───────────────────────────────────────────────────────────────
const bailey = buildElderwatch(1);
checkRoom(bailey, 'Elderwatch bailey', {
  boulders: bouldersFor(AREAS.elderwatch),
  plates: platesFor(AREAS.elderwatch),
  gates: (AREA_PUZZLES[AREAS.elderwatch] || {}).gates,
  door: (AREA_PUZZLES[AREAS.elderwatch] || {}).door,
}, {
  patrols: ELDERWATCH_WATCH,
  quests: questSitesFor(AREAS.elderwatch, 0),
});
// The way in, and the way up. Both are tiles with a job.
expectTile(bailey, 'Elderwatch: the culvert',
  ELDERWATCH.culvert.x + 1, ELDERWATCH.culvert.y, { oneOf: [T.crackedcrag] });

function floodFloorMulti(map, from, openTiles) {
  const open = new Set((openTiles || []).map((t) => `${t.x},${t.y}`));
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [[from.x, from.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
      const key = `${nx},${ny}`;
      if (SOLID.has(map.tiles[ny * WORLD_W + nx]) && !open.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

// ── the Reaches ──────────────────────────────────────────────────────────────
// The mountain has boulders, plates, gates and the Warden's room, and the
// decoration pass that scattered cairns, crates and braziers over it ran AFTER
// they were placed. Same question, same answer.
checkRoom(reaches, 'the Reaches', {
  boulders: bouldersFor(AREAS.peaks),
  plates: platesFor(AREAS.peaks),
  gates: (AREA_PUZZLES[AREAS.peaks] || {}).gates,
  door: (AREA_PUZZLES[AREAS.peaks] || {}).door,
}, {
  quests: questSitesFor(AREAS.peaks, 0),
  // THE WARDEN WALKS A LANE TOO, and it was the one patrol in the game nothing
  // checked. A beat is a pure function of the clock with no collision in it —
  // a watchman does not test the tile he is stepping onto — so a lane laid
  // across a wall is a guard walking through it, every time, forever.
  patrols: [{ ...WARDEN, id: 'the Rime Warden' }],
});
for (const g of GEAR_SITES) {
  expectTile(reaches, `the Reaches: the ${g.gear} lies`, g.x, g.y);
}

// The way in must survive the wood. The moor around Elderwatch is thick with
// trees now, and trees are solid — the road is carved after them, but a check
// beats a comment.
{
  checked += 1;
  const land = CROSSINGS.find((c) => c.to === AREAS.elderwatch).landing;
  const reach = floodFloorMulti(bailey, land, []);
  // The tile you STAND ON to swing the hammer, not the culvert itself: cracked
  // masonry is solid until it is broken, so the culvert is never walkable.
  const stand = { x: ELDERWATCH.culvert.x - 1, y: ELDERWATCH.culvert.y };
  if (!reach.has(`${stand.x},${stand.y}`)) {
    failures.push(
      `Elderwatch: the culvert cannot be reached from the west road landing — nothing can `
      + `stand at ${stand.x},${stand.y}, so the wood or the wall has closed the way in`);
  }

  /**
   * AND THE WINCH MUST BE REACHABLE ONCE YOU ARE INSIDE.
   *
   * It is a SOLID tile, so it is not enough for it to be a lever with a free
   * neighbour: put it in the store's only doorway and the neighbours are still
   * free — one inside, one out — while the room behind it is sealed with the
   * winch in it. What has to be true is that you can stand next to it having
   * walked there, so this asks the flood, not the tile.
   */
  const inside = floodFloorMulti(bailey, { x: ELDERWATCH.doorX, y: ELDERWATCH.doorY }, []);
  for (const sw of ELDERWATCH_SWITCHES) {
    expectTile(bailey, `Elderwatch: the ${sw.id} winch`, sw.x, sw.y, { oneOf: [T.lever] });
    checked += 1;
    const canStand = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => inside.has(`${sw.x + dx},${sw.y + dy}`));
    if (!canStand) {
      failures.push(
        `Elderwatch: the ${sw.id} winch at ${sw.x},${sw.y} cannot be reached — it is solid, and `
        + 'nothing you can walk to is beside it');
    }
  }
}

// ── the Farlands ─────────────────────────────────────────────────────────────
// Raw, but not exempt: the two pages lie on the road in, and a page on a crag
// is a page you cannot pick up.
{
  const far = buildFarlands(1);
  for (const q of questSitesFor(AREAS.farlands, 0)) {
    expectTile(far, `the Farlands: the ${q.item} lies`, q.x, q.y);
  }
  // ...and the way home has to be reachable from where you land, because the
  // road is the only feature on the map. Bruno walked up the east wall to row
  // 10 looking for it and found red ground and a refusal.
  checked += 1;
  const land = CROSSINGS.find((c) => c.to === AREAS.farlands).landing;
  const back = CROSSINGS.find((c) => c.from === AREAS.farlands);
  const reach = floodFloorMulti(far, land, []);
  if (!reach.has(`${WORLD_W - 1},${back.y0 + 1}`)) {
    failures.push('the Farlands: the road home cannot be reached from where you land');
  }
  for (const q of questSitesFor(AREAS.farlands, 0)) {
    checked += 1;
    if (!reach.has(`${q.x},${q.y}`)) {
      failures.push(`the Farlands: the ${q.item} at ${q.x},${q.y} cannot be walked to`);
    }
  }

  /**
   * AND THE WAY OUT MUST NOT BE A DETOUR.
   *
   * Being able to reach the exit is not the same as being able to FIND it.
   * The road's first cut had walled shoulders running the width of the map with
   * their only opening at the far west end — the map was connected, the player
   * was not stuck, and from where a stale save had put him the way home was a
   * fifty-tile hunt with no landmark to aim at. He reported it, correctly, as
   * not being able to leave.
   *
   * So: walk out from the exit and require that every tile it can reach is
   * within a small factor of its straight-line distance. A wall you have to go
   * round shows up as a ratio; a big empty field does not. This is worth
   * enforcing on the Farlands in particular because it is a PLACEHOLDER — there
   * are no landmarks to navigate by and there will not be until it is built.
   */
  checked += 1;
  const exitX = WORLD_W - 1;
  const exitY = back.y0 + 1;
  const dist = new Map([[`${exitX},${exitY}`, 0]]);
  const queue = [[exitX, exitY]];
  while (queue.length) {
    const [x, y] = queue.shift();
    const d = dist.get(`${x},${y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
      if (SOLID.has(far.tiles[ny * WORLD_W + nx])) continue;
      const key = `${nx},${ny}`;
      if (dist.has(key)) continue;
      dist.set(key, d + 1);
      queue.push([nx, ny]);
    }
  }
  let worst = null;
  for (const [key, d] of dist) {
    const [x, y] = key.split(',').map(Number);
    const straight = Math.abs(x - exitX) + Math.abs(y - exitY);
    if (straight < 8) continue;                       // near the door, ratios are noise
    const ratio = d / straight;
    if (!worst || ratio > worst.ratio) worst = { x, y, d, straight, ratio };
  }
  if (worst && worst.ratio > 2) {
    failures.push(
      `the Farlands: from ${worst.x},${worst.y} the way home is ${worst.d} steps against a `
      + `straight line of ${worst.straight} (${worst.ratio.toFixed(1)}x) — something is `
      + 'making the player walk round it');
  }
}

// ── each floor of the Keep ───────────────────────────────────────────────────
for (const f of TOWER_FLOORS) {
  const map = buildTowerFloor(f.n);
  checkRoom(map, `Keep floor ${f.n} (${f.name})`, {
    boulders: f.boulders, plates: f.plates, gates: f.gates, door: f.door,
  }, {
    patrols: f.patrols,
    quests: questSitesFor(AREAS.elderwatch, f.n),
    lock: f.lock,
    cracked: f.cracked,
    stairs: [f.up, f.down],
  });
}

/* ============================================================ locks that lock
 *
 * A DOOR IS ONLY A DOOR IF IT IS IN A WALL. The Hall of Keeping's locked door
 * was one tile standing in the middle of an open round room, so the Brass Key
 * gated nothing and the entire Armoury detour that earns it was optional. The
 * suite's `probeStep` across that one tile answered `false` exactly as expected
 * the whole time, because the question it asked was "is this tile solid" and
 * the question that mattered was "is there another way round".
 *
 * So: flood the floor from the stair you arrive on, and require that what the
 * lock guards is UNREACHABLE while it is shut and reachable once it opens.
 */
function floodFloor(map, from, openTile) {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [[from.x, from.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
      const isOpen = openTile && nx === openTile.x && ny === openTile.y;
      if (SOLID.has(map.tiles[ny * WORLD_W + nx]) && !isOpen) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}


/**
 * EVERY BARRIER ON A FLOOR, and what is behind it.
 *
 * Not just locked doors. A floor's way on may be held by a barred GATE on
 * plates (the Cistern), a bricked ARCH that wants the Stone Hammer (the
 * Armoury), or a locked DOOR that wants a key (the Hall) — and all three
 * shipped as loose tiles standing in the middle of an open round room, walked
 * around by simply going past them. Each is checked the same way: what it
 * guards must be UNREACHABLE while it is shut and reachable once it opens.
 */
for (const f of TOWER_FLOORS) {
  if (!f.down) continue;
  const map = buildTowerFloor(f.n);
  const barriers = [];
  if (f.lock) barriers.push({ what: `the ${f.lock.item} door`, tiles: [f.lock] });
  if (f.cracked && f.cracked.length) barriers.push({ what: 'the bricked arch', tiles: f.cracked });
  for (const [name, tiles] of Object.entries(f.gates || {})) {
    barriers.push({ what: `the "${name}" gate`, tiles });
  }
  if (!barriers.length) continue;

  // What is worth being behind something: the floor's items, and the way UP.
  const prizes = [
    ...questSitesFor(AREAS.elderwatch, f.n).map((q) => ({ name: q.item, x: q.x, y: q.y })),
    ...(f.up ? [{ name: 'the stair up', x: f.up.x, y: f.up.y }] : []),
  ];
  const shut = floodFloorMulti(map, f.down, []);
  const allOpen = floodFloorMulti(map, f.down, barriers.flatMap((b) => b.tiles));
  const guarded = prizes.filter((p) => !shut.has(`${p.x},${p.y}`));

  checked += prizes.length;
  if (prizes.length && !guarded.length) {
    failures.push(
      `Keep floor ${f.n}: ${barriers.map((b) => b.what).join(' and ')} guards nothing — `
      + `${prizes.map((p) => p.name).join(', ')} can all be reached without opening it`);
  }
  for (const p of guarded) {
    if (!allOpen.has(`${p.x},${p.y}`)) {
      failures.push(
        `Keep floor ${f.n}: ${p.name} at ${p.x},${p.y} cannot be reached even with every `
        + 'barrier open — it opens onto nothing');
    }
  }
}

/* ====================================================== the mountain, in order
 *
 * GEAR MUST NOT BE BEHIND ITSELF. Every terrace climb in the Reaches needs the
 * Climbing Hooks, so the Hooks have to lie somewhere you can walk to with
 * nothing — and each later piece has to be reachable with only the pieces found
 * before it. A gating change that strands the first item makes the region
 * unfinishable, and nothing else in the harness would notice: the map still
 * builds, no promise rejects, and the suites walk the mountain with a fixture
 * that starts holding all three.
 *
 * This walks it cold, in the order the design intends.
 */
const CLIMB = new Set([T.ladder, T.stair]);

function walkReaches(gear) {
  const layerAt = (x, y) => reaches.layers[y * WORLD_W + x];
  const tileAt = (x, y) => reaches.tiles[y * WORLD_W + x];
  const start = CROSSINGS.find((c) => c.from === AREAS.home && c.to === AREAS.peaks).landing;
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [[start.x, start.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
      const t = tileAt(nx, ny);
      // Cracked crag is a wall until the Hammer. An ICE GATE is not a gear gate
      // at all — it is a plate puzzle, opened by shoving boulders, so for the
      // question this walk asks ("is a piece of gear behind itself?") it counts
      // as passable. The rest of solid is solid.
      if (t === T.crackedcrag) { if (!gear.has('hammer')) continue; }
      else if (t === T.icegate) { /* a puzzle, not a lock on gear */ }
      else if (SOLID.has(t)) continue;
      const from = layerAt(x, y);
      const to = layerAt(nx, ny);
      if (from !== to) {
        // Hopping one terrace SOUTH off a ledge is free; everything else needs
        // a climb tile, and every climb tile now needs the Hooks.
        const hop = ny === y + 1 && to === from - 1;
        if (!hop) {
          if (Math.abs(from - to) > 1) continue;
          if (!CLIMB.has(t) && !CLIMB.has(tileAt(x, y))) continue;
          if (!gear.has('hooks')) continue;
        }
      }
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

{
  const held = new Set();
  // GEAR_SITES is written in the order the mountain intends them to be found.
  for (const site of GEAR_SITES) {
    checked += 1;
    const reach = walkReaches(held);
    if (!reach.has(`${site.x},${site.y}`)) {
      failures.push(
        `the Reaches: the ${site.gear} at ${site.x},${site.y} (layer ${site.layer}) cannot be `
        + `reached carrying ${held.size ? [...held].join(' + ') : 'nothing'} — it is behind itself`);
      break;
    }
    held.add(site.gear);
  }
  // ...and with all three, the crossing on to Elderwatch must be walkable.
  checked += 1;
  const east = CROSSINGS.find((c) => c.from === AREAS.peaks && c.to === AREAS.elderwatch);
  const full = walkReaches(new Set(GEAR_SITES.map((g) => g.gear)));
  if (!full.has(`${east.x},${east.y0 + 1}`)) {
    failures.push(
      `the Reaches: the road east at ${east.x},${east.y0 + 1} cannot be reached even with `
      + 'every piece of gear — the mountain is a dead end');
  }
}

/* ============================================== the Codex's torn pages
 *
 * Not geometry, but the same kind of contract and the same failure mode: a gap
 * pointing at a page that does not exist can never be filled, and a gap that
 * fills itself is a redaction you can read the moment you find it. Both are
 * silent — the page renders, nothing throws, and the mechanic is just quietly
 * not there. See shared/pages.js.
 */
{
  const problems = pagesContract();
  checked += CODEX_PAGE_IDS.length;
  for (const p of problems) failures.push(`codex pages: ${p}`);
}

/* ====================================== every AREA is a map somebody can be on
 *
 * `AREAS` is the list; the client and the server each used to WRITE OUT which
 * of them they recognised, and the client's copy fell a map behind. A save
 * standing in the Farlands was redrawn as the Home Block, and because position
 * commits carry the area and mismatched ones are discarded, the player was
 * frozen in place as far as the server was concerned and could not travel at
 * all. Both are derived now; this makes sure they stay that way.
 *
 * The test is the real one: build each area's map and require it to come back
 * with ground on it. An area that falls through a whitelist renders as some
 * OTHER area's map, which is a picture, not an error — nothing throws, and the
 * only symptom is a player who cannot leave.
 */
{
  // THE SHARED DECISION ITSELF: a save naming any map must resolve to that map.
  // This is the line that fell behind — it read `peaks || elderwatch ? a : home`
  // and sent every Farlands save to the Home Block.
  for (const area of AREA_IDS) {
    checked += 1;
    const got = areaOfSave({ player: { area } });
    if (got !== area) {
      failures.push(
        `areas: a save in "${area}" resolves to "${got}" — it is falling through the `
        + 'whitelist, so the renderer and the server will disagree about where the player is');
    }
  }
  const seen = new Map();
  for (const area of Object.values(AREAS)) {
    checked += 1;
    let map = null;
    try { map = createWorld(12345, area); } catch (err) {
      failures.push(`areas: "${area}" will not build — ${err.message}`);
      continue;
    }
    if (!map || !map.tiles || map.tiles.length !== WORLD_W * WORLD_H) {
      failures.push(`areas: "${area}" did not return a full map`);
      continue;
    }
    // Two areas that render byte-for-byte the same map means one of them fell
    // through a whitelist onto the other's terrain.
    const sig = map.tiles.join(',');
    if (seen.has(sig)) {
      failures.push(
        `areas: "${area}" renders exactly the same map as "${seen.get(sig)}" — it is falling `
        + 'through a whitelist rather than being drawn');
    } else {
      seen.set(sig, area);
    }
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  if (!QUIET) {
    console.log(`  ${G}✓${X} ${checked} declared coordinate(s) stand on ground that exists`);
    console.log(`    ${D}bailey + ${TOWER_FLOORS.length} floors of the Keep${X}`);
  }
  process.exit(0);
}
console.log(`  ${R}✗${X} ${failures.length} of ${checked} declared coordinate(s) are unreachable`);
for (const f of failures) console.log(`      ${f}`);
process.exit(1);
