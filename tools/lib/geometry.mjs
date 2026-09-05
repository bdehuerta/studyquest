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
  bouldersFor, platesFor, questSitesFor,
} from '../../shared/constants.js';
import { buildElderwatch, buildTowerFloor } from '../../web/world/elderwatch.js';

const SOLID = new Set(SOLID_TILES);
const T = TILE_TYPES;

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
