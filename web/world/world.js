// AGENT-B — web/world/world.js
// The single entry point for the whole canvas game: deterministic worldgen,
// camera, fixed-timestep loop, render order, toasts and interaction.

import { buildReaches as buildReachesMap } from './reaches.js';
import { buildElderwatch as buildElderwatchMap, buildTowerFloor } from './elderwatch.js';
import { buildFarlands as buildFarlandsMap } from './farlands.js';
import {
  TILE,
  WORLD_W,
  WORLD_H,
  TILE_TYPES,
  AREAS,
  CROSSING,
  PEAK,
  WISE_MAN,
  CAVE,
  GROVE,
  BLOOM,
  parseTileKey,
  LAYER_LIFT, LAYER_NAMES, LAYER_COUNT,
  REACHES_GEAR, GEAR_SITES,
  EAST_ROAD, AREA_PUZZLES, bouldersFor, platesFor,
  ELDERWATCH, ELDERWATCH_WATCH, crossingAt, crossingRows, questSitesFor, DOOR_KEYS, QUEST_ITEMS,
  AREA_NAMES,
  CHEESECAKE_HERMIT, ELDERWATCH_SWITCHES,
  TOWER, TOWER_FLOORS,
  WARDEN, WISE_CAVE,
  HUT,
  BOAT,
  FISHING,
  PLAZA,
  inPlaza,
  plantingBlockedAt,
  counterRect,
  CAVE_DARKNESS,
  LIGHT_LIFT,
  HERALD,
  lightRadiusOf,
  speedMultiplierOf,
  SOLID_TILES,
  PALETTE,
  GATHER_NODES,
  SAPLING_STAGES,
  SAPLING_TOTAL_MINUTES,
  STUMP_MINUTES,
} from '../../shared/constants.js';
import { MATERIALS, growthOf } from '../../shared/recipes.js';
import { SPRITES3 } from './art.js';
// lighting.js was written for v3 and imported by NOTHING — REVIEW-CLIENT.md
// lists the whole module as dead. `drawLightPool` is exactly the lantern, so
// the file starts earning its place here rather than being deleted.
import { drawLightPool } from './lighting.js';
import {
  drawTile,
  drawSprite,
  HERALD_FRAMES,
  HUT_SPRITES,
  BOAT_SPRITE,
  BOULDER_SPRITE,
  PLATE_DOWN_SPRITE,
  WISEMAN_SPRITE,
  GEAR_SPRITE,
  STANDARD_SPRITE,
  CODEX_SPRITE,
  PAGE_SPRITE,
  FIRE_PAN_FRAMES,
  WATCH_FRAMES,
  WARDEN_FRAMES,
  drawTextOutlined,
  textWidth,
  buildingSprite,
  NPC_SPRITES,
  harvestedSprite,
  NODE_STYLE,
  SPRITES,
} from './sprites.js';
import {
  createPlayer,
  createInput,
  isTypingTarget,
  SWING_IMPACT_MS,
} from './player.js';
import { createBuildMode, footprintOf, buildingRect, buildingAt, checkPlacement } from './build.js';

export const WORLD_SEED = 20260828;

const SOLID = new Set(SOLID_TILES);

/* ------------------------------------------------------------------ *
 * v2 gathering tables
 * ------------------------------------------------------------------ */

/**
 * tile id -> GATHER_NODES id, derived from the frozen table itself so the
 * renderer and the server can never disagree about what is harvestable.
 */
const NODE_BY_TILE = new Map();
for (const key of Object.keys(GATHER_NODES)) {
  const n = GATHER_NODES[key];
  const t = TILE_TYPES[n.tile];
  if (t != null) NODE_BY_TILE.set(t, n.id);
}

/**
 * Once harvested, a stump or a heap of rubble can be walked over and built on.
 * Dredged shallows are still water and sifted sand was never solid, so tree and
 * stone are the only two nodes whose solidity actually changes.
 */
const PASSABLE_WHEN_HARVESTED = new Set(['tree', 'snowpine', 'stone', 'crackedcrag']);
/** Node types that leave a STUMP rather than a depleted-tile variant. */
const TIMBER_NODES = new Set(['tree', 'snowpine']);
/** How fast the scholar moves while on a ladder or a stair. */
const CLIMB_SPEED = 0.5;
/** Per second, how much of the gap to the tile's height is left after easing. */
const LIFT_EASE = 0.0005;

/** What the prompt over a node calls the act of harvesting it. */
const GATHER_VERB = Object.freeze({
  tree: 'chop',
  snowpine: 'chop',
  crackedcrag: 'break the cracked rock',
  stone: 'mine',
  reeds: 'dredge',
  sand: 'sift',
  // Named, not "chop": you should be able to tell from the prompt alone that
  // this is not another tree.
  bluetree: 'cut the Blue Bloom',
});

/**
 * PLANTINGS — the only way a tree ever comes back (TREES_REGROW is false).
 *
 * `state.plantings` is keyed "x,y" and carries { plantedAt, stage, source,
 * boostMinutes }. The SERVER is the authority on the stage, but growth is a
 * pure function of wall-clock time (shared/recipes.js growthOf), so the client
 * recomputes it on its own clock. Without that a sprout would sit at stage 0
 * on screen until something else happened to push new state down.
 */
/** Terrain a sapling will take root in. A felled stump also counts, always. */
const PLANTABLE_TILE_IDS = new Set([TILE_TYPES.grass, TILE_TYPES.snow]);
/**
 * What we tell the server is on the ground. The server re-checks it against
 * PLANTABLE_TILES, so it has to name the RIGHT ground: snow in the Reaches,
 * grass at Home.
 */
const PLANTED_TILE_NAME = { home: 'grass', peaks: 'snow' };
/** The stage id of a planting that is a tree in every way, axe included. */
const MATURE_STAGE = SAPLING_STAGES[SAPLING_STAGES.length - 1].id;
/** A mature planting is chopped exactly like the wild tree of its own map. */
const PLANTING_NODE_TYPE = { home: 'tree', peaks: 'snowpine' };
/** Colours for the growth pip row over a planting. */
const PIP_ON = PALETTE.good || '#8fc85a';
const PIP_OFF = PALETTE.border || '#2a2340';

/** How long a floating toast keeps absorbing duplicate text, ms. */
const TOAST_MERGE_MS = 500;
/** Cap on live particles — a burst is spectacle, not a memory leak. */
const MAX_PARTICLES = 240;
const WORLD_PX_W = WORLD_W * TILE;
const WORLD_PX_H = WORLD_H * TILE;

// Guaranteed-clear plaza so the player never spawns stuck and has room to build.
// PLAZA moved to shared/constants.js — the SERVER needs it now that planting is
// refused inside the square, and a second copy here would be a second answer.
// Re-exported so every existing importer keeps working.
export { PLAZA };



/* ================================================================== *
 * Hand-written value noise
 * ================================================================== */

function hash2i(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return h >>> 0;
}
function rnd01(x, y, seed) {
  return hash2i(x, y, seed) / 4294967296;
}
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/** Bilinearly interpolated value noise on an integer lattice. */
function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const a = rnd01(x0, y0, seed);
  const b = rnd01(x0 + 1, y0, seed);
  const c = rnd01(x0, y0 + 1, seed);
  const d = rnd01(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/** Fractal sum of value noise, normalised to 0..1. */
function fbm(x, y, seed, octaves, freq) {
  let amp = 1;
  let f = freq;
  let sum = 0;
  let norm = 0;
  const n = octaves || 3;
  for (let i = 0; i < n; i++) {
    sum += valueNoise(x * f, y * f, seed + i * 7919) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/* ================================================================== *
 * World generation
 * ================================================================== */

// `inPlaza` comes from shared/constants.js too, for the same reason.

/**
 * createWorld(seed) -> { w, h, seed, tiles: Uint8Array }
 * Water in low areas with sand at the margins, stone outcrops high, trees
 * scattered on grass by a second noise channel, plus a few dirt paths.
 */
/**
 * THE SNOWFALL REACHES — the second map.
 *
 * Same size as the Home Block and generated from the same noise, but read
 * differently: elevation makes ICE where the Home Block made water, SNOW where
 * it made grass, CRAG where it made stone, and snowpines instead of trees. It
 * is the same country under a different sky, which is what makes walking into
 * it feel like walking rather than teleporting into a tech demo.
 *
 * One road, west to east, from the crossing to the foot of the high peak — the
 * Wise Man lives at the top of it. Everything else is open country for the
 * quests and puzzles that come next.
 *
 * The seed is offset so the two maps are not the same shapes in different
 * colours.
 */
function buildPeaks(seed, tiles, idx) {
  const s = (seed + 90210) | 0;

  for (let y = 0; y < WORLD_H; y += 1) {
    for (let x = 0; x < WORLD_W; x += 1) {
      const elev = fbm(x, y, s, 4, 1 / 15);
      const rock = fbm(x, y, s + 1013, 3, 1 / 8);
      const pines = fbm(x, y, s + 7717, 3, 1 / 6);
      const jitter = rnd01(x, y, s + 4242);

      let t;
      if (elev < 0.33) t = TILE_TYPES.ice;              // frozen tarns
      else if (elev > 0.62 && rock > 0.55) t = TILE_TYPES.crag;
      else t = TILE_TYPES.snow;
      if (t === TILE_TYPES.snow && pines > 0.545 && jitter > 0.32) t = TILE_TYPES.snowpine;
      tiles[idx(x, y)] = t;
    }
  }

  // --- THE HIGH PEAK, north-east. A ring of crag with a way up its west face.
  const px = PEAK.x;
  const py = PEAK.y;
  for (let y = py - PEAK.r; y <= py + PEAK.r; y += 1) {
    for (let x = px - PEAK.r; x <= px + PEAK.r; x += 1) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      const d = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
      if (d <= PEAK.r - 2) tiles[idx(x, y)] = TILE_TYPES.snow;   // the shoulder
      else if (d <= PEAK.r) tiles[idx(x, y)] = TILE_TYPES.crag;
    }
  }
  // The way in, from the west, so the summit is reached rather than found.
  for (let x = px - PEAK.r; x <= px; x += 1) {
    if (x < 0 || x >= WORLD_W) continue;
    tiles[idx(x, py)] = TILE_TYPES.path;
  }

  // --- THE ROAD, west to east: the crossing to the foot of the peak.
  const roadY = CROSSING.gapY + 1;
  for (let x = 0; x <= px - PEAK.r; x += 1) {
    tiles[idx(x, roadY)] = TILE_TYPES.path;
    // Two tiles wide, like the Home Block's roads, where there is room.
    if (roadY + 1 < WORLD_H) tiles[idx(x, roadY + 1)] = TILE_TYPES.path;
  }
  // And down to the peak's approach row if they differ.
  const lo = Math.min(roadY, py);
  const hi = Math.max(roadY, py);
  for (let y = lo; y <= hi; y += 1) tiles[idx(px - PEAK.r, y)] = TILE_TYPES.path;

  // --- the arrival apron, so you do not land inside a pine.
  for (let y = CROSSING.gapY; y < CROSSING.gapY + CROSSING.gapH; y += 1) {
    for (let x = 0; x <= CROSSING.peaksEntryX + 2; x += 1) tiles[idx(x, y)] = TILE_TYPES.path;
  }

  sealBorder(tiles, idx, {
    solid: TILE_TYPES.snowpine,
    rock: TILE_TYPES.crag,
    gapSide: 'west',
    gapY: CROSSING.gapY,
    gapH: CROSSING.gapH,
  });

  return { w: WORLD_W, h: WORLD_H, seed: s, tiles };
}

/**
 * Wall a map in, leaving one gap.
 *
 * Every edge tile becomes tree or rock — which one is decided by what is
 * already there, so a shoreline gets rock and a meadow gets trees rather than a
 * uniform picket fence around the world. The gap is passed in rather than
 * inferred: there is exactly one way out of each map and it should be a
 * decision, not a side effect.
 */
function sealBorder(tiles, idx, opts) {
  const o = opts || {};
  const solid = o.solid === undefined ? TILE_TYPES.tree : o.solid;
  const rock = o.rock === undefined ? TILE_TYPES.stone : o.rock;
  // ONE GAP WAS ENOUGH UNTIL THE HOME BLOCK HAD TWO WAYS OUT: east to the
  // Reaches and, since the farlands, west past the Woodsman. `gaps` is the
  // general form; `gapSide`/`gapY`/`gapH` still work and mean one of them.
  const gaps = Array.isArray(o.gaps) ? o.gaps.slice() : [];
  if (o.gapSide) gaps.push({ side: o.gapSide, y0: o.gapY, h: o.gapH });
  const inGap = (side, y) => gaps.some((g) => {
    if (g.side !== side) return false;
    const a = Number.isFinite(g.y0) ? g.y0 : -99;
    return y >= a && y <= a + (Number.isFinite(g.h) ? g.h : 0) - 1;
  });

  const wall = (x, y) => {
    // Water and sand at the edge become ROCK; anything else becomes the solid.
    // A tree growing out of the lake looks like a mistake.
    const t = tiles[idx(x, y)];
    const wet = t === TILE_TYPES.water || t === TILE_TYPES.sand || t === TILE_TYPES.ice;
    tiles[idx(x, y)] = wet ? rock : solid;
  };

  for (let x = 0; x < WORLD_W; x += 1) { wall(x, 0); wall(x, WORLD_H - 1); }
  for (let y = 0; y < WORLD_H; y += 1) {
    if (!inGap('west', y)) wall(0, y);
    if (!inGap('east', y)) wall(WORLD_W - 1, y);
  }
}

export function createWorld(seed, area) {
  const s = Number.isFinite(Number(seed)) ? Number(seed) | 0 : WORLD_SEED;
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const idx = (x, y) => y * WORLD_W + x;
  // THE REACHES ARE AUTHORED, NOT GENERATED. Noise can make a snowfield; it
  // cannot make a labyrinth, a sight-line or a slide you have to read before
  // you commit to it. See world/reaches.js.
  if (area === AREAS.peaks) return buildReachesMap(s);
  // Elderwatch is flat — one layer everywhere, no lift, no cliff face, no
  // ledge. The mountain's whole vocabulary is deliberately absent from it.
  if (area === AREAS.elderwatch) return buildElderwatchMap(s);
  // The farlands are raw — ground, a wall and the road in. See world/farlands.js.
  if (area === AREAS.farlands) return buildFarlandsMap(s);

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const elev = fbm(x, y, s, 4, 1 / 14);
      const rock = fbm(x, y, s + 1013, 3, 1 / 9);
      const trees = fbm(x, y, s + 7717, 3, 1 / 6);
      const jitter = rnd01(x, y, s + 4242);

      let t;
      if (elev < 0.345) t = TILE_TYPES.water;
      else if (elev < 0.405) t = TILE_TYPES.sand;
      else if (elev > 0.64 && rock > 0.60) t = TILE_TYPES.stone;
      else t = TILE_TYPES.grass;

      // A THICKER WOOD. Bruno, 2026-08-31: "add more trees around." The map
      // ran about 11% trees against 61% bare grass, which read as a lawn with
      // ornaments rather than a wooded block — and with every tree now dropping
      // a seedpod, a denser forest is something to work rather than a wall.
      //
      // Roads are safe by construction: the dirt paths are carved AFTER this
      // pass and overwrite whatever they cross, so raising the density here can
      // never block one. The plaza, the grove and the glade are carved later
      // too, for the same reason.
      if (t === TILE_TYPES.grass && trees > 0.495 && jitter > 0.30) t = TILE_TYPES.tree;
      tiles[idx(x, y)] = t;
    }
  }

  // --- Sand margin: any grass touching water becomes beach.
  const copy = tiles.slice();
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (copy[idx(x, y)] === TILE_TYPES.water) continue;
      if (copy[idx(x, y)] === TILE_TYPES.stone) continue;
      let nearWater = false;
      for (let dy = -1; dy <= 1 && !nearWater; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
          if (copy[idx(nx, ny)] === TILE_TYPES.water) {
            nearWater = true;
            break;
          }
        }
      }
      if (nearWater) tiles[idx(x, y)] = TILE_TYPES.sand;
    }
  }

  // --- A few dirt paths radiating from the plaza. Deterministic drunken walk.
  const targets = [
    { x: 6, y: 6 },
    { x: 57, y: 9 },
    { x: 10, y: 41 },
    { x: 54, y: 40 },
    { x: 32, y: 3 },
  ];
  let step = 0;
  for (const t of targets) {
    let cx = PLAZA.cx;
    let cy = PLAZA.cy;
    let guard = 400;
    while (guard-- > 0 && (cx !== t.x || cy !== t.y)) {
      const r = rnd01(cx, cy, s + 555 + step++);
      const dx = Math.sign(t.x - cx);
      const dy = Math.sign(t.y - cy);
      if (dx !== 0 && (dy === 0 || r < 0.5)) cx += dx;
      else if (dy !== 0) cy += dy;
      else if (dx !== 0) cx += dx;
      for (let oy = 0; oy <= 1; oy++) {
        for (let ox = 0; ox <= 1; ox++) {
          const px = cx + ox;
          const py = cy + oy;
          if (px < 0 || py < 0 || px >= WORLD_W || py >= WORLD_H) continue;
          const cur = tiles[idx(px, py)];
          if (cur === TILE_TYPES.water) continue; // paths do not cross the lake
          if (ox === 1 && oy === 1 && rnd01(px, py, s + 99) < 0.5) continue; // ragged edge
          tiles[idx(px, py)] = TILE_TYPES.path;
        }
      }
    }
  }

  // --- Plaza: guaranteed clear, walkable, with a small path cross.
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (!inPlaza(x, y)) continue;
      const onCross = x === PLAZA.cx || y === PLAZA.cy;
      tiles[idx(x, y)] = onCross ? TILE_TYPES.path : TILE_TYPES.grass;
    }
  }

  // --- The Woodsman's clearing, south-west.
  //
  // A patch of open ground ringed by trees, with ONE GAP: the door, on the
  // south edge at GROVE.doorX. He is hidden by the forest rather than under
  // rock, so this is a hole in the woods, not a hole in a hill — and a hole
  // with one way in reads as somewhere hidden rather than somewhere fenced.
  //
  // The ring is now AUTHORITATIVE: it plants a tree on every border tile that
  // is not water and not the door, path included. Skipping path tiles (which is
  // what it did before) left the gap wherever the approach happened to cross —
  // two tiles wide for the two-wide path, and a third where the plaza road met
  // the ring. Where the way in is should be a decision, not a leftover.
  const groveDoorY = GROVE.y + GROVE.h;
  for (let y = GROVE.y - 1; y <= GROVE.y + GROVE.h; y += 1) {
    for (let x = GROVE.x - 1; x <= GROVE.x + GROVE.w; x += 1) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      const inside = x >= GROVE.x && x < GROVE.x + GROVE.w
        && y >= GROVE.y && y < GROVE.y + GROVE.h;
      if (inside) { tiles[idx(x, y)] = TILE_TYPES.grass; continue; }
      if (x === GROVE.doorX && y === groveDoorY) continue;   // the one way in
      // Water is left alone: a tree standing in the lake reads as a mistake,
      // and water walls the clearing just as well as a trunk does.
      if (tiles[idx(x, y)] !== TILE_TYPES.water) tiles[idx(x, y)] = TILE_TYPES.tree;
    }
  }
  // The door itself, and a single-tile path leading south out of it, so the
  // clearing reads as somewhere people go rather than somewhere they broke into.
  for (let y = groveDoorY; y < WORLD_H && y < groveDoorY + 4; y += 1) {
    if (tiles[idx(GROVE.doorX, y)] === TILE_TYPES.water) continue;
    tiles[idx(GROVE.doorX, y)] = TILE_TYPES.path;
  }

  // --- The storage hut, north-east, in the woods.
  //
  // Carved for the same reason the grove and the glade are: the noise put a
  // tree squarely inside the footprint, and a hut with a trunk through it is
  // not a hut. The clearing is small and ringed with trees — he is hidden in
  // the wood, not standing in a field — with the door's approach kept open.
  for (let y = HUT.y - 2; y <= HUT.y + HUT.h + 2; y += 1) {
    for (let x = HUT.x - 2; x <= HUT.x + HUT.w + 1; x += 1) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      const inside = x >= HUT.x - 1 && x <= HUT.x + HUT.w
        && y >= HUT.y - 1 && y <= HUT.y + HUT.h + 1;
      if (inside) {
        // Never overwrite a road: the dirt path already runs past this spot and
        // it is how anyone gets here.
        if (tiles[idx(x, y)] !== TILE_TYPES.path) tiles[idx(x, y)] = TILE_TYPES.grass;
      } else if (tiles[idx(x, y)] !== TILE_TYPES.water
        && tiles[idx(x, y)] !== TILE_TYPES.path) {
        tiles[idx(x, y)] = TILE_TYPES.tree;
      }
    }
  }

  // --- The Blue Bloom's glade, north-west.
  //
  // Exactly one bluetree tile, in a clearing, at a FIXED spot. It is the whole
  // of the Woodsman's unlock, so leaving it to the noise — "there is usually a
  // clearing up there" — would mean a save where the quest cannot be finished.
  //
  // The clearing does NOT force land over water. Bruno, 2026-08-31: "I liked
  // the blue bloom as it was, don't change it. you can reach it by cutting down
  // a tree." He is right, and my first reading of it was wrong: I ran a flood
  // fill that treated TREES as impassable and concluded the glade was cut off.
  // Trees are not walls — an axe removes them, and clearing a way in is a
  // perfectly good thing to make the player do. Only water and stone are real
  // barriers, and by that measure the glade has always been reachable.
  // See the reachability assertion in tools/checks/15-outlanders.mjs, which now
  // measures the right thing.
  for (let y = BLOOM.y - BLOOM.clearR; y <= BLOOM.y + BLOOM.clearR; y += 1) {
    for (let x = BLOOM.x - BLOOM.clearR; x <= BLOOM.x + BLOOM.clearR; x += 1) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      const dx = x - BLOOM.x;
      const dy = y - BLOOM.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= BLOOM.clearR - 0.5) tiles[idx(x, y)] = TILE_TYPES.grass;
      else if (d <= BLOOM.clearR + 0.5
        && tiles[idx(x, y)] !== TILE_TYPES.water
        && tiles[idx(x, y)] !== TILE_TYPES.path) {
        tiles[idx(x, y)] = TILE_TYPES.tree;
      }
    }
  }
  // A path south out of the glade, so it is somewhere you can arrive at rather
  // than somewhere you stumble into.
  for (let y = BLOOM.y + BLOOM.clearR; y < WORLD_H && y < BLOOM.y + BLOOM.clearR + 4; y += 1) {
    if (tiles[idx(BLOOM.x, y)] === TILE_TYPES.water) continue;
    tiles[idx(BLOOM.x, y)] = TILE_TYPES.path;
  }
  // The bloom itself goes down LAST, so nothing above can overwrite it.
  tiles[idx(BLOOM.x, BLOOM.y)] = TILE_TYPES.bluetree;

  // --- THE ROAD OUT, and the wall around everything else.
  //
  // Bruno, 2026-09-02: "the border of the home ... should have all of the
  // border blocks covered by trees or rocks, except for the road in the top
  // right area where you can travel to the next area."
  //
  // The road first: it already runs past the hut but stopped short of the edge,
  // so it is carried east to the last column on the crossing rows. Then the
  // border is walled. Order matters — walling first and carving second would
  // work, but carving first and walling second would seal the road again, and
  // that is exactly the kind of ordering bug the grove's door taught.
  for (let y = CROSSING.gapY; y < CROSSING.gapY + CROSSING.gapH; y += 1) {
    for (let x = HUT.x; x < WORLD_W; x += 1) tiles[idx(x, y)] = TILE_TYPES.path;
  }

  // THE ROAD WEST, past the Woodsman, out to the farlands.
  //
  // Bruno asked for this to change NOTHING but the road and the wall: "dont
  // change the terrain, just add path in grass near the map border and remove
  // the stone walls to create an opening." So it paints path over the tiles
  // that are already grass and leaves everything else — the Woodsman's trees,
  // his camp, the shoreline — exactly where it is. A road that bulldozed the
  // grove to reach the edge would be a different request.
  const west = crossingRows(AREAS.home, 'west');
  if (west) {
    for (let y = west.y0; y <= west.y1; y += 1) {
      // THE OPENING, x1-8: the corner is noise rock and trees, and three rows
      // of road that stop dead against it are not a way out. Bruno sanctioned
      // exactly this much — "remove the stone walls to create an opening" — and
      // no more. It runs SOUTH of the Woodsman's clearing, whose ring is x6-12
      // by y36-41 and must keep having exactly one door in it.
      for (let x = 1; x <= 8; x += 1) tiles[idx(x, y)] = TILE_TYPES.path;
      // ...and beyond that, road only where there was already open grass, so it
      // joins the path already coming down from the grove door rather than
      // ploughing on through whatever is in the way.
      for (let x = 9; x <= 14; x += 1) {
        if (tiles[idx(x, y)] === TILE_TYPES.grass) tiles[idx(x, y)] = TILE_TYPES.path;
      }
    }
  }

  sealBorder(tiles, idx, {
    solid: TILE_TYPES.tree,
    rock: TILE_TYPES.stone,
    gaps: [
      { side: 'east', y0: CROSSING.gapY, h: CROSSING.gapH },
      ...(west ? [{ side: 'west', y0: west.y0, h: west.y1 - west.y0 + 1 }] : []),
    ],
  });
  // ...and the gap itself is ROAD, not whatever noise put there: the three rows
  // the border leaves open have to be walkable or the opening is decorative.
  if (west) {
    for (let y = west.y0; y <= west.y1; y += 1) tiles[idx(0, y)] = TILE_TYPES.path;
  }

  // --- The Stonemason's mountain, south-east.
  //
  // A broad massif of stone with a chamber hollowed out of it. The stone ring
  // is deliberately THICK — a mountain you can see round the back of is a
  // boulder — and the chamber inside is real walkable floor.
  //
  // Carved rather than left to the noise: the Woodsman has to be findable, and
  // a chamber that only exists when the seed happens to cooperate is not a
  // place, it is a coincidence. A solid ring of stone with a floor inside and
  // one corridor west, so the way in reads as a mouth rather than a gap.
  //
  // The transparent roof — walking in dims the world outside and lifts the
  // stone overhead — is NOT here yet; see BACKLOG. Until then the chamber is
  // simply open to the sky, which is honest: it looks like a hollow in the
  // rock, and everything about the vendor inside already works.
  // The rock around the chamber is an irregular BLOB, not a rectangle.
  //
  // The first pass squared off a block of stone around the cave, which read as
  // a wall someone had built rather than a hill: uniform, straight-edged and
  // far too big. This is an ellipse with the same value noise the rest of the
  // terrain uses pushed into its radius, so the outline wanders, the corners
  // round off, and no two edges are the same line.
  const cx = CAVE.x + CAVE.w / 2 - 0.5;
  const cy = CAVE.y + CAVE.h / 2 - 0.5;
  const RX = CAVE.w / 2 + 3;
  const RY = CAVE.h / 2 + 2.5;
  for (let y = Math.floor(cy - RY - 3); y <= Math.ceil(cy + RY + 3); y += 1) {
    for (let x = Math.floor(cx - RX - 3); x <= Math.ceil(cx + RX + 3); x += 1) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      if (tiles[idx(x, y)] === TILE_TYPES.water) continue;
      const nx = (x - cx) / RX;
      const ny = (y - cy) / RY;
      // fbm pushes the edge in and out by up to ~25%, which is what turns the
      // ellipse into a hillside.
      const wobble = 0.75 + fbm(x * 1.6, y * 1.6, s + 3131, 3, 1 / 5) * 0.5;
      if (nx * nx + ny * ny <= wobble) tiles[idx(x, y)] = TILE_TYPES.stone;
    }
  }
  for (let y = CAVE.y - 1; y <= CAVE.y + CAVE.h; y += 1) {
    for (let x = CAVE.x - 1; x <= CAVE.x + CAVE.w; x += 1) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      const inside = x >= CAVE.x && x < CAVE.x + CAVE.w
        && y >= CAVE.y && y < CAVE.y + CAVE.h;
      tiles[idx(x, y)] = inside ? TILE_TYPES.path : TILE_TYPES.stone;
    }
  }
  // The corridor in: a THREE-tile-high mouth running west to open ground.
  // Three rather than two so the way out is findable — a mouth you can only
  // leave by lining up on exactly the right row is a trap, not a door.
  for (let x = CAVE.mouthX; x < CAVE.x; x += 1) {
    for (let y = CAVE.mouthY; y < CAVE.mouthY + 3; y += 1) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      tiles[idx(x, y)] = TILE_TYPES.path;
    }
  }

  return { w: WORLD_W, h: WORLD_H, seed: s, tiles };
}

/** isSolid(world, x, y) — out of bounds counts as solid. */
export function isSolid(world, x, y) {
  if (!world || !world.tiles) return false;
  const w = world.w || WORLD_W;
  const h = world.h || WORLD_H;
  if (x < 0 || y < 0 || x >= w || y >= h) return true;
  return SOLID.has(world.tiles[y * w + x]);
}

/* ================================================================== *
 * createGame
 * ================================================================== */

const STEP_MS = 1000 / 60;
const TOAST_MS = 1200;

export function createGame(canvas) {
  // The world is REBUILT when the scholar crosses maps. `let`, not `const`:
  // the two areas are two different Uint8Arrays, and everything downstream —
  // collision, prompts, the minimap — reads whichever is current.
  let world = createWorld(WORLD_SEED, AREAS.home);
  let worldArea = AREAS.home;
  /**
   * WHICH FLOOR OF THE KEEP, 0 for the bailey.
   *
   * A floor is a full-size map with one round room cut into it, so nothing
   * downstream — collision, the camera, the tile loop — needs to know the
   * tower exists. `groundWorld` is kept alongside it so the bailey can still be
   * DRAWN, greyed, around the room you are standing in.
   */
  let towerFloor = 0;
  let groundWorld = null;
  /** The node a mature planting becomes on THIS map. */
  const plantingNodeType = () => PLANTING_NODE_TYPE[worldArea] || PLANTING_NODE_TYPE.home;
  /** What we tell the server is underfoot when planting on THIS map. */
  const plantedTileName = () => PLANTED_TILE_NAME[worldArea] || PLANTED_TILE_NAME.home;
  /** Bare ground for this map — what a stump or a planting sits on. */
  const groundTile = () => (worldArea === AREAS.peaks ? TILE_TYPES.snow : TILE_TYPES.grass);
  /** Was the scholar aboard on the last state? Boarding is a teleport. */
  let lastRiding = false;

  /** Which map the save says we are on. Older saves have no area at all. */
  function stateArea() {
    const a = state && state.player && state.player.area;
    // A whitelist, not a two-way switch. With three maps, "not peaks" no longer
    // means "home", and a save standing in Elderwatch was quietly redrawn as
    // the Home Block.
    return (a === AREAS.peaks || a === AREAS.elderwatch) ? a : AREAS.home;
  }

  /**
   * Swap the terrain if the save has moved us to the other map.
   *
   * Called from setState rather than on a timer: crossing is a server decision
   * that arrives in state, and the renderer's job is to notice.
   */
  function stateFloor() {
    const f = state && state.tower && Number(state.tower.floor);
    return Number.isFinite(f) && f > 0 && f <= TOWER.floors ? f : 0;
  }

  function syncArea() {
    const want = stateArea();
    const wantFloor = want === AREAS.elderwatch ? stateFloor() : 0;
    if (want === worldArea && wantFloor === towerFloor) return false;
    towerFloor = wantFloor;
    if (towerFloor > 0) {
      if (!groundWorld) groundWorld = createWorld(WORLD_SEED, AREAS.elderwatch);
      world = buildTowerFloor(towerFloor);
    } else {
      world = createWorld(WORLD_SEED, want);
      groundWorld = want === AREAS.elderwatch ? world : null;
    }
    worldArea = want;
    build.setWorld ? build.setWorld(world) : null;
    occupied.clear();
    rebuildBuildings();
    snapCamera();
    return true;
  }
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha: false }) : null;

  let state = null;
  let buildings = []; // [{ uid, buildingId, x, y, rect, sortY }]

  /**
   * Standing vendors. Which building each one belongs to is fixed — these are
   * not wandering NPCs and are not meant to be; they are the face on a counter.
   */
  const NPC_AT_BUILDING = Object.freeze({
    exchange_post: 'exchange',
    woodsman_camp: 'woodsman',
    stonemason_camp: 'stonemason',
  });
  const npcs = [];   // [{ id, buildingId, x, y, px, py, sortY }]
  const occupied = new Set(); // "x,y" tiles covered by a building
  let firstStateApplied = false;
  /** While sliding on ice, the direction you are committed to. */
  let slide = null;
  /**
   * HOW HIGH THE SCHOLAR IS DRAWN, in world pixels, eased.
   *
   * Her terrace is a property of the TILE she stands on, so the moment she
   * crossed onto a stair her drawn position jumped a whole terrace — twelve
   * world pixels, thirty-six on screen, in one frame. That does not read as
   * climbing, it reads as teleporting. This value chases the tile's lift
   * instead, so she visibly rises up the rock face and settles at the top.
   */
  let drawLift = 0;
  /** Debounce: one shove per keypress, and one catch per pass. */
  let caughtAt = 0;
  /** How long the current slide has failed to move her. See update(). */
  let stalledMs = 0;
  /** The direction that landed her on solid ground, until the key is released. */
  let landedDir = null;
  /** When the keep's stairs last moved her, so arriving does not re-trigger. */
  let climbedAt = 0;
  /** The step she arrived on, which does not count until she leaves it. */
  let climbTile = null;

  const player = createPlayer(PLAZA.cx, PLAZA.cy);
  const input = createInput(typeof window !== 'undefined' ? window : null);

  const build = createBuildMode({
    getWorld: () => world,
    getBuildings: () => buildings,
    // A cleared stump is buildable ground; a standing tree is not.
    isSolid: (x, y) => isSolidHere(x, y),
  });

  const cam = { x: 0, y: 0 };
  const view = { S: 3, w: 320, h: 200, dpr: 1, cssW: 960, cssH: 540 };
  const mouse = { cssX: 0, cssY: 0, inside: false };
  const toasts = [];

  // --- gathering ---------------------------------------------------
  /** "x,y" -> { x, y, nodeType, hitsLeft, respawnAt }. Mirrors state.harvested. */
  const harvested = new Map();
  /**
   * "x,y" -> { x, y, plantedAt, boostMinutes, source, growth }. Mirrors
   * `state.plantings` exactly the way `harvested` mirrors `state.harvested`.
   */
  const plantings = new Map();
  const particles = [];
  const shakes = []; // { x, y, dx, dy, mag, ms, dur }
  const swings = []; // in-flight gather attempts awaiting their impact frame
  // Two clocks, deliberately: `clockMs` is wall time, because respawnAt comes
  // from the server as an absolute timestamp; `simMs` is accumulated simulation
  // time, which is what animation and swing timing must run on so they stay in
  // step with the fixed timestep rather than with the frame schedule.
  let clockMs = Date.now();
  let simMs = 0;
  let sweepAcc = 0;
  let facingNode = null; // { x, y, nodeType } — the highlighted target, if any
  // { x, y, tile, onStump } — bare plantable ground the scholar is facing.
  let facingPlant = null;
  // The planting the scholar is facing, so its growth can be read on approach.
  let facingGrowth = null;
  // The interaction prompts painted on the last frame (see getPrompts()).
  const lastPrompts = [];

  let running = false;
  let rafId = 0;
  let lastTs = 0;
  let acc = 0;
  let nearBuilding = null;

  const api = {
    start,
    stop,
    setState,
    enterBuildMode,
    exitBuildMode,
    isBuildMode,
    onBuildPlace: null,
    onMoveCommit: null,
    onInteract: null,
    /** fn(x, y, nodeType) -> Promise<{ ok, error?, result? }> */
    onGather: null,
    /**
     * fn(x, y, opts) -> Promise<{ ok, error?, state? }>
     * `opts` is { tile, source }: `tile` is what the CLIENT says is on the
     * ground, which /api/plant requires for anything that is not a stump.
     */
    onPlant: null,
    toast,
    // extras (not part of the contract, but handy for the integrator)
    getWorld: () => world,
    getPlayerTile: () => ({ x: player.tileX(), y: player.tileY() }),
    /**
     * TEST SEAM. Put the RENDERER's player on a tile.
     *
     * Nothing in the game calls this — walking is the only way a player moves.
     * It exists because the suites used to move only the SERVER's player and
     * leave the renderer at spawn, which stopped working the moment interacting
     * began flushing the renderer's real position first (and rightly so: a test
     * that moves half the world is testing a state no player can be in).
     * Client-side only; every location gate still runs on the server.
     */
    setPlayerTile: (x, y) => { player.setTile(x, y); },
    /** Is the world actually being played, as opposed to sitting behind the menu? */
    isRunning: () => running,
    /** The standing vendors, and where they stand. Read-only. */
    getNpcs: () => npcs.map((n) => ({ ...n })),
    /** How opaque the cave roof is right now: 1 outside, ~0 inside. */
    getRoofAlpha: () => roofAlpha,
    isInCave: () => playerInCave(),
    /** Test seam: which map is under the scholar's feet. */
    getArea: () => worldArea,
    /** Test seam: the mountain — height, gear, boulders and the Warden. */
    getMountain: () => ({
      layer: layerAt(player.tileX(), player.tileY()),
      layerName: LAYER_NAMES[layerAt(player.tileX(), player.tileY())] || null,
      gear: reachesState().gear.slice(),
      boulders: boulderList(),
      floor: towerFloor,
      patrols: patrolList().length,
      platesHeld: (towerFloor > 0 ? (puzzleSet().plates || []) : platesFor(worldArea))
        .filter((pl) => plateHeld(pl.x, pl.y))
        .map((pl) => pl.id || `${pl.x},${pl.y}`),
      gateOpen: Object.fromEntries(
        Object.keys((puzzleSet() || { gates: {} }).gates || {}).map((k) => [k, gateOpen(k)])
      ),
      warden: wardenState(),
      wardenBeaten: reachesState().wardenBeaten,
      seen: wardenSees(),
      sliding: !!slide,
      inCave: inWiseCave(),
    }),
    /** Test seam: is this tile walkable from where the scholar stands? */
    probeBlocked: (tx, ty) => isBlocked(tx, ty),
    /**
     * Test seam: the mountain's step rule between two arbitrary tiles, and the
     * one the game itself uses. Lets a test flood-fill the whole climb.
     */
    probeStep: (fx, fy, tx, ty) => {
      if (gateIsOpen(tx, ty)) return false;
      if (isSolidHere(tx, ty)) return true;
      return stepBlocked(fx, fy, tx, ty);
    },
    /** Test seam: where a slide starting here in this direction would end. */
    probeSlide: (fx, fy, dx, dy) => {
      // CRAMPONS STOP THE SLIDE, here as in the movement loop. Without this the
      // probe slid on ice whatever you were wearing, and a route that only
      // opens once you can stand still on the tarn looked permanently shut.
      // ONE test for "can I put a foot there", shared by both branches and by
      // probeStep. Written out twice, the open-gate case was missed in one of
      // them and a gate you had just unlocked still stopped the slide dead.
      const shut = (ax, ay, bx, by) => {
        if (gateIsOpen(bx, by)) return false;
        return isSolidHere(bx, by) || stepBlocked(ax, ay, bx, by);
      };
      if (hasGear('crampons')) {
        const nx = fx + dx;
        const ny = fy + dy;
        return shut(fx, fy, nx, ny) ? { x: fx, y: fy } : { x: nx, y: ny };
      }
      let x = fx;
      let y = fy;
      for (let guard = 0; guard < 80; guard += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (shut(x, y, nx, ny)) break;
        x = nx;
        y = ny;
        if (tileAtSafe(x, y) !== TILE_TYPES.ice) break;
      }
      return { x, y };
    },
    /** Test seam: the hut, the boat and whether the scholar is aboard. */
    getLake: () => ({
      hut: hutState(),
      atDoor: atHutDoor(),
      boatGranted: boatGranted(),
      onBoat: onBoat(),
      riding: riding(),
      nextToBoat: nextToBoat(),
      boat: boatTile(),
      // Pixels, not tiles: the tile pair is trivially equal while riding
      // (boatTile() RETURNS the player's tile), so it can never catch the boat
      // lagging a tile behind the scholar on screen. The pixels can.
      boatPx: boatPixel(),
      playerPx: { px: player.px, py: player.py },
      shore: shoreBesideBoat(),
      atCrossing: atCrossing(),
      atWiseMan: atWiseMan(),
      door: hutDoorTile(),
    }),
    /** Test seam: where the Herald is on his ride, or null before he is sent. */
    getHerald: () => {
      const h = heraldState();
      return h ? { ...h } : null;
    },
    /** Test seam: darkness level and lantern reach. */
    getLightProbe: lightProbe,
    getFacingNode: () => (facingNode ? { ...facingNode } : null),
    getFacingPlant: () => (facingPlant ? { ...facingPlant } : null),
    getPlantings: () => [...plantings.values()].map((p) => ({ ...p })),
    getSeedStock: seedStock,
    /** fn(slotIndex) -> void. Raised when 1/2 selects a different slot. */
    onEquipActive: null,
    /** fn(gadgetId) -> void. Raised when the active slot holds a gadget. */
    onUseGadget: null,
    /**
     * A conversation is running. E ADVANCES it — it is the whole interaction —
     * so this is asked BEFORE `isPanelOpen`, and the dialogue is never treated
     * as a panel to be closed.
     */
    isDialogueOpen: null,
    /** fn() -> void. Show the next line, or finish the conversation. */
    onAdvanceDialogue: null,
    /** fn() -> void. Raised by L while standing on the boat. */
    onFish: null,
    /** fn(gearId) -> void. Raised by E over a piece of Reaches gear. */
    onTakeGear: null,
    /** fn(itemId) -> void. Raised by E over a quest item lying on the ground. */
    onTakeQuestItem: null,
    /** fn(+1|-1) -> void. Raised by stepping onto a stair inside the keep. */
    onClimbTower: null,
    /** fn(x, y, dx, dy) -> void. Raised by E against a boulder. */
    onPushBoulder: null,
    /** fn() -> void. Raised when the Warden's line falls across you. */
    onWardenCaught: null,
    /** fn() -> void. Raised on the frame all three summit plates are held. */
    onWardenBeaten: null,
    /** fn(shoreTile|null) -> void. Raised by P to climb into or out of the boat. */
    onBoard: null,
    /** fn() -> boolean. Is the pause menu up? Also freezes the player. */
    isPauseOpen: null,
    /**
     * The integrator answers these two so E can CLOSE a panel it opened.
     *
     * The world cannot see the UI, and the check has to happen HERE rather than
     * in a keydown handler in main.js: `createInput` is registered first, so by
     * the time main.js saw the same E the world would already have chopped the
     * tree standing behind the open panel. (Bruno, 2026-08-31.)
     */
    isPanelOpen: null,
    /** fn() -> void. Close whatever `isPanelOpen` reported. */
    onClosePanels: null,
    // --- equipment, read-only. The two slots are what every prompt keys off.
    getEquipment: () => equipSlots().map((r) => (r ? { ...r } : null)),
    getActiveSlot: activeSlot,
    isSeedEquipped: seedEquipped,
    /**
     * Test seam: the toasts currently floating over the world.
     *
     * Toasts are drawn ON THE CANVAS, not into the DOM, so a test that greps
     * document.body for them finds nothing — which is exactly the mistake that
     * made this probe necessary.
     */
    getToasts: () => toasts.map((t) => String(t.text || '')),
    /** The interaction prompt text painted on the last frame. */
    getPrompts: () => lastPrompts.slice(),
    /**
     * What the renderer is actually doing this frame. `cam` is raw (unsnapped);
     * `S` is the integer device scale. The smoke harness needs both to check
     * that the player's drawn offset advances monotonically instead of
     * shuddering, which is the one thing a screenshot cannot show.
     */
    getRenderProbe: () => ({
      camX: cam.x, camY: cam.y, S: view.S,
      // How high she is DRAWN right now, and how high the tile she stands on
      // says she should be. They differ while she is climbing, which is the
      // whole point — see drawLift.
      lift: drawLift,
      tileLift: liftAt(player.tileX(), player.tileY()),
      px: player.px, py: player.py,
      // The exact screen x/y the player sprite is drawn at, and the screen x/y
      // of world origin, so a caller can take their difference.
      sx: Math.round((player.px - Math.round(cam.x * view.S) / view.S) * view.S),
      sy: Math.round((player.py - Math.round(cam.y * view.S) / view.S) * view.S),
      originX: Math.round((0 - Math.round(cam.x * view.S) / view.S) * view.S),
      originY: Math.round((0 - Math.round(cam.y * view.S) / view.S) * view.S),
    }),
    destroy,
  };

  /* ---------------- state ---------------- */

  function rebuildBuildings() {
    buildings = [];
    npcs.length = 0;
    occupied.clear();
    // The Home Block's buildings and vendors do not exist in the Reaches. The
    // save carries one building list because there is one settlement; drawing
    // it on the second map would put the Trading Post in a snowfield.
    if (worldArea !== AREAS.home) return;
    const list = state && Array.isArray(state.buildings) ? state.buildings : [];
    for (const b of list) {
      if (!b || !b.buildingId) continue;
      const rect = buildingRect(b);
      if (!rect) continue;
      const rec = {
        uid: b.uid,
        buildingId: b.buildingId,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        sortY: (rect.y + rect.h) * TILE,
      };
      buildings.push(rec);
      // The vendor standing outside. Bruno: "where is the npc?" — the vendor
      // buildings had art but nobody in front of them, so a shop you could
      // trade at looked like scenery. They never move: one tile below the
      // building's front edge, depth-sorted with everything else so you can
      // walk behind them.
      const npcId = NPC_AT_BUILDING[b.buildingId];
      if (npcId) {
        const nx = rect.x + Math.floor(rect.w / 2);
        const ny = rect.y + rect.h;
        npcs.push({
          id: npcId,
          buildingId: b.buildingId,
          x: nx,
          y: ny,
          // Stand them a few pixels into their own tile so they read as being
          // AT the counter rather than on the path in front of it.
          px: nx * TILE,
          py: ny * TILE - 4,
          sortY: (ny + 1) * TILE - 4,
        });
      }
      for (let dy = 0; dy < rect.h; dy++) {
        for (let dx = 0; dx < rect.w; dx++) occupied.add(rect.x + dx + ',' + (rect.y + dy));
      }
    }

    // THE STORAGE HUT IS SOLID TOO. Bruno, 2026-09-02: "I should not be able to
    // walk behind the house ... it should be like the other buildings."
    //
    // It is carved terrain with a sprite, not a building record, so nothing
    // above ever added it to `occupied` and the scholar walked straight through
    // the walls. Added here rather than by making the ground a solid TILE,
    // because the tile under a building should stay walkable ground — that is
    // how every other building in the game blocks.
    for (let dy = 0; dy < HUT.h; dy += 1) {
      for (let dx = 0; dx < HUT.w; dx += 1) occupied.add((HUT.x + dx) + ',' + (HUT.y + dy));
    }
  }

  /**
   * Mirror `state.harvested` into a numeric-keyed lookup. The server is the
   * authority; anything this module wrote optimistically after a swing is
   * replaced wholesale on the next state push.
   */
  function rebuildHarvested() {
    harvested.clear();
    const src = state && state.harvested;
    if (!src || typeof src !== 'object') return;
    for (const key of Object.keys(src)) {
      const e = src[key];
      if (!e) continue;
      // ONLY THIS MAP'S TILES. Tile state is keyed per area; a key belonging to
      // the other map parses to null and is skipped. Without this, Home's
      // stumps and the felled Blue Bloom were painted onto the snow.
      const at = parseTileKey(key, worldArea);
      if (!at) continue;
      const x = at.x;
      const y = at.y;
      const nodeType =
        e.nodeType && GATHER_NODES[e.nodeType] ? e.nodeType : tileNodeType(x, y);
      if (!nodeType) continue;
      harvested.set(x + ',' + y, {
        x,
        y,
        nodeType,
        hitsLeft: Number.isFinite(Number(e.hitsLeft)) ? Number(e.hitsLeft) : 0,
        respawnAt: Number(e.respawnAt) || 0,
        felled: Boolean(e.felled),
        stumpUntil: Number(e.stumpUntil) || 0,
      });
    }
  }

  /**
   * Mirror `state.plantings` into a numeric-keyed lookup, the same contract
   * rebuildHarvested() follows: the server is the authority, and anything the
   * client guessed is replaced wholesale on the next state push.
   *
   * The stage the server sent is deliberately NOT trusted for drawing. It is a
   * snapshot taken when the save was last written; growthOf() recomputes it
   * from plantedAt on the local clock so a sapling visibly climbs its four
   * stages without a round-trip. The server still decides what can be felled.
   */
  function rebuildPlantings() {
    plantings.clear();
    const src = state && state.plantings;
    if (!src || typeof src !== 'object') return;
    const now = Date.now();
    for (const key of Object.keys(src)) {
      const e = src[key];
      if (!e || typeof e !== 'object') continue;
      const at = parseTileKey(key, worldArea);
      if (!at) continue;
      const x = at.x;
      const y = at.y;
      const plantedAt = Number(e.plantedAt);
      const rec = {
        x,
        y,
        plantedAt: Number.isFinite(plantedAt) ? plantedAt : now,
        boostMinutes: Math.max(0, Number(e.boostMinutes) || 0),
        source: e.source === 'seedpod' ? 'seedpod' : 'sapling',
        growth: null,
      };
      rec.growth = growthAt(rec, now);
      plantings.set(x + ',' + y, rec);
    }
  }

  /** growthOf(), never allowed to throw into a render frame. */
  function growthAt(rec, now) {
    try {
      return growthOf(rec, now);
    } catch (err) {
      console.error('[world] growthOf', err);
      return {
        stage: SAPLING_STAGES[0].id, stageLabel: SAPLING_STAGES[0].label,
        stageIndex: 0, stageCount: SAPLING_STAGES.length, mature: false,
        minutesRemaining: SAPLING_TOTAL_MINUTES, msRemaining: SAPLING_TOTAL_MINUTES * 60000,
        progress01: 0,
      };
    }
  }

  /** Recompute every planting's stage on the clock. Called by the 500ms sweep. */
  function sweepPlantings() {
    if (!plantings.size) return;
    for (const rec of plantings.values()) rec.growth = growthAt(rec, clockMs);
  }

  /** The planting on a tile, or null. Never throws. */
  function plantingAt(tx, ty) {
    if (!plantings.size) return null;
    return plantings.get(tx + ',' + ty) || null;
  }

  /** True when the tile carries a planting that has finished growing. */
  function isMaturePlanting(tx, ty) {
    const p = plantingAt(tx, ty);
    return !!(p && p.growth && p.growth.mature);
  }

  /**
   * What is in the bag to plant. The server spends `player.saplings` first and
   * falls back to the `seedpod` material, so both count towards "can I plant".
   */
  function seedStock() {
    const pl = state && state.player;
    const mats = (state && state.materials) || null;
    const saplings = Math.max(0, Number(pl && pl.saplings) || 0);
    const seedpods = Math.max(0, Number(mats && mats.seedpod) || 0);
    return { saplings, seedpods, total: saplings + seedpods };
  }

  /* ---------------- equipment ---------------- */
  // Two slots. EVERY world prompt below keys off these and never off the bag:
  // carrying seeds offers nothing, seeds in a slot offer to plant. The active
  // slot (keys 1/2) breaks ties and is what the HUD shows in front.

  /** The two slots, as [ref|null, ref|null]. */
  function equipSlots() {
    const pl = state && state.player;
    const raw = pl && Array.isArray(pl.equipped) ? pl.equipped : [];
    return [raw[0] || null, raw[1] || null];
  }

  /** 0 or 1 — which slot the world acts through first. */
  function activeSlot() {
    const pl = state && state.player;
    return Number(pl && pl.activeSlot) === 1 ? 1 : 0;
  }

  /**
   * What is IN YOUR HANDS — the active slot only.
   *
   * The other slot is CARRIED, not held. This used to return both slots with
   * the active one first, which meant an axe in slot 2 chopped happily while
   * slot 1 was selected, and selecting a slot was only ever a tie-break. Every
   * prompt and every action walks this list, so narrowing it here is the whole
   * rule. `stowedRef()` is the other slot, and it is used ONLY to write hints.
   */
  function equippedRefs() {
    return [equipSlots()[activeSlot()]].filter(Boolean);
  }

  /** The ref in the INACTIVE slot, or null. It never acts. */
  function stowedRef() {
    const s = equipSlots();
    return s[activeSlot() === 0 ? 1 : 0] || null;
  }

  /** 1 or 2 — the key that would make the stowed slot active. */
  function stowedSlotNumber() {
    return activeSlot() === 0 ? 2 : 1;
  }

  /** Is the tool for this node sitting in the OTHER slot, one keypress away? */
  function stowedToolFor(nodeType) {
    const def = GATHER_NODES[nodeType];
    if (!def) return false;
    const ref = stowedRef();
    if (!ref || ref.kind !== 'tool') return false;
    const pl = (state && state.player) || {};
    const tools = Array.isArray(pl.gatherTools) ? pl.gatherTools : [];
    const t = tools.find((x) => x && x.uid === ref.uid);
    return !!(t && t.toolId === def.tool);
  }

  /** Is a seed in a slot? The single gate on every plant prompt. */
  function seedEquipped() {
    return equippedRefs().some((r) => r && r.kind === 'seed');
  }

  /** The equipped gathering tool record for a node type, or null. */
  function equippedToolFor(nodeType) {
    const def = GATHER_NODES[nodeType];
    if (!def) return null;
    const pl = (state && state.player) || {};
    const tools = Array.isArray(pl.gatherTools) ? pl.gatherTools : [];
    for (const ref of equippedRefs()) {
      if (!ref || ref.kind !== 'tool') continue;
      const t = tools.find((x) => x && x.uid === ref.uid);
      if (t && t.toolId === def.tool) return t;
    }
    return null;
  }

  /** Do you own the tool for this node at all, equipped or not? */
  function ownsToolFor(nodeType) {
    const def = GATHER_NODES[nodeType];
    if (!def) return false;
    const pl = (state && state.player) || {};
    const tools = Array.isArray(pl.gatherTools) ? pl.gatherTools : [];
    return tools.some((t) => t && t.toolId === def.tool);
  }

  function toolNameFor(nodeType) {
    const def = GATHER_NODES[nodeType];
    const id = (def && def.tool) || 'tool';
    return String(id).replace(/_/g, ' ');
  }

  function setState(next) {
    // Fresh state, fresh lists: a push that lands mid-frame must not be read
    // through a cache built before it arrived.
    invalidateFrameCaches();
    state = next || null;
    // BOARDING AND LEAVING THE BOAT ARE TELEPORTS, and so is crossing maps.
    //
    // The renderer adopts the server's position only on the FIRST setState, so
    // that it never fights local movement — which is right for walking and
    // wrong for the three moments the server legitimately puts the scholar
    // somewhere else. Without this, climbing in left the sprite on the bank
    // while the save said they were afloat.
    const nowRiding = !!(state && state.boat && state.boat.riding);
    const boardChanged = nowRiding !== lastRiding;
    lastRiding = nowRiding;

    // CROSSING MAPS. The server moves the scholar and the new area arrives in
    // state; this is where the renderer notices and swaps the terrain under
    // them. Before rebuildBuildings, because the buildings belong to one map.
    const crossed = syncArea();
    if (crossed) climbTile = { x: Number(state && state.player && state.player.x), y: Number(state && state.player && state.player.y) };
    if ((crossed || boardChanged) && state && state.player) {
      const px = Number(state.player.x);
      const py = Number(state.player.y);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        player.setTile(px, py);
        snapCamera();
      }
    }
    rebuildBuildings(); // cheap: a small array. The tile cache is never touched here.
    rebuildHarvested();
    rebuildPlantings();
    if (!firstStateApplied && state && state.player) {
      const px = Number(state.player.x);
      const py = Number(state.player.y);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        // The saved tile can be solid — a tree grew back over a stump, a
        // building was raised on top of you, terrain changed between versions.
        // Never drop the player inside geometry: walk outwards to the nearest
        // free tile and tell the server where we actually put them.
        const free = nearestFreeTile(px, py);
        player.setTile(free.x, free.y);
        snapCamera();
        if ((free.x !== px || free.y !== py) && typeof api.onMoveCommit === 'function') {
          try { api.onMoveCommit(free.x, free.y); } catch {}
          toast('you were stuck — moved to open ground', '#ffd93d');
        }
      }
      firstStateApplied = true;
    }
  }

  /* ---------------- nodes ---------------- */

  /** GATHER_NODES id of the terrain at (tx,ty), ignoring harvest state. */
  function tileNodeType(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return null;
    return NODE_BY_TILE.get(world.tiles[ty * WORLD_W + tx]) || null;
  }

  /** Live harvest record for a tile, or null once its respawn time has passed. */
  function harvestAt(tx, ty) {
    const e = harvested.get(tx + ',' + ty);
    if (!e) return null;
    if (e.respawnAt > 0 && e.respawnAt <= clockMs) return null;
    return e;
  }

  /**
   * True while the node is gone. Two ways that happens: it is waiting out a
   * respawn (stone, sand, reeds), or it was FELLED and is never coming back
   * (trees). A felled tree has no respawnAt at all, so testing only for a
   * pending respawn left the tile behaving as a live tree — no stump drawn,
   * and an "E chop" prompt on empty ground.
   */
  function isDepleted(tx, ty) {
    const e = harvestAt(tx, ty);
    return !!(e && (e.felled || e.respawnAt > 0));
  }

  /** Drop harvest records whose respawn has come due. Called on the clock. */
  function sweepHarvested() {
    if (!harvested.size) return;
    for (const [key, e] of harvested) {
      // A felled tree is permanent. Its stump stops being drawn once
      // stumpUntil passes, but the record stays so the tree never returns.
      if (e.felled) continue;
      if (e.respawnAt > 0 && e.respawnAt <= clockMs) harvested.delete(key);
    }
  }

  /* ---------------- collision ---------------- */

  /**
   * Terrain solidity with harvest state folded in: a felled tree or a mined
   * outcrop stops blocking the way, everything else keeps its v1 behaviour.
   * Out of bounds counts as solid.
   */
  /**
   * Breadth-first search outwards for a tile you can actually stand on.
   * Falls back to the original tile if the whole neighbourhood is blocked,
   * which should be impossible but must not hang the boot.
   */
  function nearestFreeTile(sx, sy) {
    const start = { x: Math.round(sx), y: Math.round(sy) };
    if (!isSolidHere(start.x, start.y)) return start;
    const seen = new Set([start.x + ',' + start.y]);
    const queue = [start];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let guard = 0;
    while (queue.length && guard++ < 4096) {
      const cur = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
        const key = nx + ',' + ny;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!isSolidHere(nx, ny)) return { x: nx, y: ny };
        queue.push({ x: nx, y: ny });
      }
    }
    return start;
  }

  function isSolidHere(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return true;
    // A planting owns its tile outright, terrain included: planting on a stump
    // deletes the harvested record server-side, and without this the old tree
    // tile would go back to blocking the way under a knee-high sprout. Only a
    // mature planting — a real tree again — is solid.
    const planted = plantingAt(tx, ty);
    if (planted) return !!(planted.growth && planted.growth.mature);
    const t = world.tiles[ty * WORLD_W + tx];
    if (!SOLID.has(t)) return false;
    const nodeType = NODE_BY_TILE.get(t);
    if (nodeType && PASSABLE_WHEN_HARVESTED.has(nodeType) && isDepleted(tx, ty)) return false;
    return true;
  }

  /**
   * WHILE RIDING, THE WORLD INVERTS.
   *
   * Water is the only thing a boat crosses and land is the only thing it
   * cannot, so the test FLIPS rather than being switched off. Left alone the
   * boat would sail across meadows; switched off entirely it would sail
   * through the mountain.
   */
  function boatBlocked(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return true;
    return world.tiles[ty * WORLD_W + tx] !== TILE_TYPES.water;
  }

  function isBlocked(tx, ty) {
    if (riding()) return boatBlocked(tx, ty);
    // GROUND SHE IS ALREADY STANDING ON IS NEVER A WALL.
    //
    // The mountain's rule is relative — whether a tile may be entered depends on
    // the terrace she is standing on — so a tile can turn solid UNDER her. Hop
    // south off a ledge and the tile she is still half standing in becomes
    // "you may not climb up there"; her box overlaps it, every direction is
    // refused, and she is welded in place until the save is reloaded. Which is
    // exactly what Bruno hit sliding off the ice.
    if (player.overlapsTile(tx, ty)) return false;
    // AN OPEN GATE IS A HOLE, and has to be answered BEFORE the terrain. An ice
    // gate is a solid tile — that is what makes it a gate — so the ordinary
    // solidity test blocks it whatever its plates say. The first cut had this
    // check after `isSolidHere`, which meant the gate never opened at all; the
    // suite passed anyway because the old map let you walk round it.
    if (gateIsOpen(tx, ty)) return false;
    if (puzzleSet() && mountainBlocks(tx, ty)) return true;
    if (isSolidHere(tx, ty)) return true;
    return occupied.has(tx + ',' + ty);
  }

  /**
   * A DOOR THAT IS OPEN TO YOU, whatever kind of door it is.
   *
   * Gates and locked doors are SOLID TILES — that is what makes them doors — so
   * the ordinary solidity test blocks them however their plates or their locks
   * stand. Both have to be answered before the terrain is consulted, and both
   * have to be answered in ONE place: the ice gate was written first and the
   * keep door repeated the same mistake a week later, each silently blocked by
   * `isSolidHere` after its own rule had said yes.
   */
  function gateIsOpen(tx, ty) {
    const t = tileAtSafe(tx, ty);
    if (t === TILE_TYPES.icegate) {
      const name = gateAt(tx, ty);
      return !!name && gateOpen(name);
    }
    if (t === TILE_TYPES.lockdoor) {
      const lock = lockHere();
      return !!lock && lock.x === tx && lock.y === ty && doorOpened();
    }
    return false;
  }

  /**
   * THE MOUNTAIN'S OWN COLLISION.
   *
   * Three rules on top of "is this tile solid":
   *
   *   1. A TERRACE EDGE IS A WALL. You may only step onto a tile on your own
   *      layer. A ladder or a stair is the exception and the only one — that is
   *      what makes height a thing you climb rather than a thing you walk past.
   *   2. An ice gate is solid while its plates are unheld, and thin air while
   *      they are held.
   *   3. A boulder is solid. You push it with E; you never walk through it.
   *
   * The "from" tile is the scholar's current one. Her hitbox can straddle two
   * tiles, so this is an approximation — but it is the same approximation the
   * rest of the collision makes, and at a terrace edge the wall is continuous,
   * so there is nowhere for the imprecision to leak through.
   */
  function mountainBlocks(tx, ty) {
    return stepBlocked(player.tileX(), player.tileY(), tx, ty);
  }

  /**
   * The mountain's step rule, as a PURE function of two tiles.
   *
   * Pulled out of `mountainBlocks` so that a route can be walked without a
   * scholar to walk it — the reachability test flood-fills the whole map
   * through this exact function. A test that re-implemented the rule would be a
   * second copy of it, and the second copy is the one that goes stale.
   */
  function stepBlocked(fx, fy, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return true;
    const t = tileAtSafe(tx, ty);

    // An ice gate: solid until its plates are held.
    if (t === TILE_TYPES.icegate) {
      const name = gateAt(tx, ty);
      if (!name || !gateOpen(name)) return true;
      return false;
    }
    // A LOCKED DOOR IS SHUT UNTIL YOU HAVE OPENED IT.
    //
    // It used to open for whoever merely CARRIED the key — you walked at it and
    // it was simply not there, so the key was never turned by anybody. Bruno,
    // 2026-09-06: "the brass key should open the door at the top of the
    // elderwatch tower, by using it with E on the door at the top (which should
    // open)." Turning it is an act now; the save remembers, so a door you have
    // opened stays open.
    if (t === TILE_TYPES.lockdoor) {
      const lock = lockHere();
      if (lock && lock.x === tx && lock.y === ty) return !doorOpened();
      return true;
    }
    // Cracked crag stops being a wall once it has been broken — which the
    // gather system already records, per map, as a felled node.
    if (t === TILE_TYPES.crackedcrag && isDepleted(tx, ty)) return false;
    if (boulderAt(tx, ty)) return true;

    const from = layerAt(fx, fy);
    const to = layerAt(tx, ty);
    if (from === to) return false;

    // HOPPING DOWN A LEDGE. Stepping SOUTH off a terrace onto the ground below
    // is free; every other way between terraces needs a ladder or a stair.
    //
    // This is the one rule that turns a climb into a map. Shortcuts open behind
    // you as you go up, so coming back down is a decision rather than a retrace
    // — and it costs nothing in gating, because down is always the way you came
    // from. Only a single terrace at a time: a scholar is not jumping off a
    // cliff, she is stepping off a ledge.
    if (ty === fy + 1 && to === from - 1) return false;

    // Only a ladder or a stair bridges terraces, and only one at a time.
    if (Math.abs(from - to) > 1) return true;
    const climbTo = isClimbTile(tx, ty);
    const climbFrom = isClimbTile(fx, fy);
    if (!climbTo && !climbFrom) return true;
    // EVERY CLIMB NEEDS THE HOOKS — stairs as well as ladders.
    //
    // It used to be ladders only, on the theory that a stair needs nothing but
    // legs. Bruno, 2026-09-06: "I should not be able to climb stairs without
    // the climbing hooks." He is right about what it costs: with stairs free,
    // the mountain's first terraces could be walked without finding anything,
    // so the Hooks were the first piece of gear you could skip. Now the gear IS
    // the gate, and the whole mountain is behind it.
    //
    // The Hooks themselves lie on LAYER 0 (GEAR_SITES), so nothing you need to
    // reach them is behind them. `tools/lib/geometry.mjs` proves that rather
    // than trusting it.
    if (!hasGear('hooks')) return true;
    return false;
  }

  /**
   * A dry, empty tile beside the boat to step out onto, or null.
   *
   * Searched here rather than trusted from a keypress: "P near the shore"
   * has to mean a specific tile, and the server checks the same thing again
   * before it moves anybody.
   */
  function shoreBesideBoat() {
    const t = boatTile();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
      if (world.tiles[ny * WORLD_W + nx] === TILE_TYPES.water) continue;
      if (isSolidHere(nx, ny)) continue;
      if (occupied.has(nx + ',' + ny)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  /* ---------------- viewport ---------------- */

  function resize() {
    if (!canvas) return;
    const cssW = Math.max(1, canvas.clientWidth || canvas.width || 960);
    const cssH = Math.max(1, canvas.clientHeight || canvas.height || 540);
    const dpr = Math.min(2, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const base = cssW < 760 || cssH < 520 ? 2 : 3;
    view.cssW = cssW;
    view.cssH = cssH;
    view.dpr = dpr;
    view.S = Math.max(1, Math.round(base * dpr));
    view.w = Math.ceil(bw / view.S);
    view.h = Math.ceil(bh / view.S);
    if (ctx) ctx.imageSmoothingEnabled = false;
  }

  function camTarget() {
    return {
      x: player.centerX() - view.w / 2,
      y: player.centerY() - view.h / 2,
    };
  }
  /**
   * How much empty space to allow ABOVE the map, in world pixels.
   *
   * REVIEW-CLIENT.md: at the north edge of the map the player can be hidden
   * behind the HUD banner entirely — the camera cannot scroll past y=0, so the
   * top row of tiles is drawn under the banner and the scholar with it. Letting
   * the camera go a banner's height NEGATIVE pushes the map down instead, so
   * the north edge is reachable and visible. The tile loop already clamps its
   * row index at 0, so the space above simply shows the clear colour.
   *
   * Measured in CSS pixels and converted, because the banner does not change
   * size with the world scale.
   */
  const BANNER_CSS_PX = 58;
  function topInset() {
    const scale = Math.max(1, view.S || 1);
    // THE HIGHEST TERRACE IS DRAWN ABOVE THE MAP. A tile on layer n is lifted
    // n * LAYER_LIFT up the screen, so on a five-terrace mountain the summit is
    // painted a full 48 world pixels — three tiles — higher than its own row.
    // The camera could only rise as far as the banner's height, so the top of
    // the summit, the cave and the old man sitting in it were all off the top
    // of the view or behind the HUD.
    const lift = worldArea === AREAS.peaks ? LAYER_LIFT * (LAYER_COUNT - 1) : 0;
    return BANNER_CSS_PX / scale + lift;
  }

  function clampCam(v, span, worldSpan, minV) {
    const lo = Number.isFinite(minV) ? minV : 0;
    if (span >= worldSpan) return Math.round((worldSpan - span) / 2);
    return Math.max(lo, Math.min(worldSpan - span, v));
  }
  /**
   * Put the drawn height where the tile says it is, with no easing. For the
   * three moments the scholar is legitimately somewhere else in one frame:
   * loading a save, crossing between maps, and being thrown back by the Warden.
   * Easing those would send her gliding across the screen.
   */
  function snapLift() {
    drawLift = liftAt(player.tileX(), player.tileY());
  }

  function snapCamera() {
    snapLift();
    const t = camTarget();
    cam.x = clampCam(t.x, view.w, WORLD_PX_W);
    cam.y = clampCam(t.y, view.h, WORLD_PX_H, -topInset());
  }

  /* ---------------- toasts ---------------- */

  /**
   * toast(text, color, worldX, worldY)
   * Anchored over the player unless world coordinates are given. Identical text
   * raised twice in quick succession (the integrator toasts a gather result at
   * the same moment this module does) merges into one, re-anchored and
   * re-coloured by the later call rather than stacking a duplicate.
   */
  function toast(text, color, worldX, worldY) {
    const str = String(text == null ? '' : text);
    const key = str.trim().toUpperCase();
    const x = Number.isFinite(worldX) ? worldX : player.centerX();
    const y = Number.isFinite(worldY) ? worldY : player.py - 2;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      if (t.key === key && t.age < TOAST_MERGE_MS) {
        t.x = x;
        t.y = y;
        if (color) t.color = color;
        t.age = Math.min(t.age, 100);
        return;
      }
    }
    toasts.push({
      text: str, key, color: color || PALETTE.accent, x, y, age: 0,
      lines: wrapToast(str),
    });
    if (toasts.length > 24) toasts.splice(0, toasts.length - 24);
  }

  /**
   * Break a message into short lines at word boundaries. Refusal messages from
   * the server are full sentences; drawn as one line they run the width of the
   * screen and collide with every other toast.
   */
  const TOAST_COLS = 42;
  function wrapToast(str) {
    const words = String(str).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    for (const word of words) {
      if (!line) { line = word; continue; }
      if (line.length + 1 + word.length <= TOAST_COLS) line += ' ' + word;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  }

  /* ---------------- particles & shake ---------------- */

  /**
   * A puff of chips in the node's own material colours. `power` scales the
   * initial speed — a hit is a spatter, a kill is a burst.
   */
  function spawnParticles(tx, ty, nodeType, count, power) {
    const style = NODE_STYLE[nodeType] || NODE_STYLE.tree;
    const chips = style.chips;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const p = power || 1;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.35 + Math.random() * 0.7) * p;
      particles.push({
        x: cx + (Math.random() * 9 - 4.5),
        y: cy + (Math.random() * 9 - 4.5),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.85 * p,
        g: style.gravity,
        life: 0,
        max: 340 + Math.random() * 280,
        color: chips[i % chips.length],
        size: Math.random() < 0.28 ? 2 : 1,
      });
    }
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  function updateParticles(dtMs) {
    if (!particles.length) return;
    const k = dtMs / 16.6667;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dtMs;
      if (p.life >= p.max) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vy += p.g * k;
      p.vx *= 1 - 0.02 * k;
    }
  }

  /** Kick a tile a few pixels in a direction, decaying over `dur` ms. */
  function shakeTile(tx, ty, dx, dy, mag, dur) {
    shakes.push({ x: tx, y: ty, dx, dy, mag, ms: 0, dur: dur || 220 });
    if (shakes.length > 12) shakes.splice(0, shakes.length - 12);
  }

  function updateShakes(dtMs) {
    for (let i = shakes.length - 1; i >= 0; i--) {
      shakes[i].ms += dtMs;
      if (shakes[i].ms >= shakes[i].dur) shakes.splice(i, 1);
    }
  }

  /** Accumulated pixel offset for one tile this frame (0,0 when not shaking). */
  function shakeOffsetAt(tx, ty) {
    let ox = 0;
    let oy = 0;
    for (let i = 0; i < shakes.length; i++) {
      const s = shakes[i];
      if (s.x !== tx || s.y !== ty) continue;
      const p = s.ms / s.dur;
      const damp = 1 - p;
      const osc = Math.sin(p * Math.PI * 3);
      ox += s.dx * s.mag * damp * osc;
      oy += s.dy * s.mag * damp * osc;
    }
    return { x: Math.round(ox), y: Math.round(oy) };
  }

  /* ---------------- gathering ---------------- */

  /** The faced tile, if it is a harvestable node that has not been cleared. */
  function targetNode() {
    const f = player.facingTile();
    // A planting answers for its own tile. Mature, it is a tree and can be
    // felled; still growing, it is not a target at all — which also stops a
    // sapling planted on a stump from reading as a full-grown tree, because
    // the terrain map underneath it still says "tree" forever.
    const planted = plantingAt(f.x, f.y);
    if (planted) {
      if (!(planted.growth && planted.growth.mature)) return null;
      return { x: f.x, y: f.y, nodeType: plantingNodeType(), planted: true };
    }
    const nodeType = tileNodeType(f.x, f.y);
    if (!nodeType) return null;
    if (isDepleted(f.x, f.y)) return null;
    return { x: f.x, y: f.y, nodeType };
  }

  /**
   * Is the faced node actually workable RIGHT NOW — i.e. is the tool for it in
   * a slot? A node you cannot work still gets a quiet hint rather than the gold
   * "E chop" prompt, so the world never offers an action equipment refuses.
   */
  function nodeReady(node) {
    if (!node) return false;
    // A GEAR NODE ASKS WHAT YOU HAVE, NOT WHAT YOU ARE HOLDING. Reaches gear is
    // passive and never occupies a hand, so cracked crag is worked by OWNING
    // the Stone Hammer. Without this the readiness test looked up `node.tool`,
    // which a gear node does not have, decided nothing could ever work it, and
    // the hammer was a thing you could find and never use — the swing at the
    // E key is gated on exactly this predicate.
    const def = GATHER_NODES[node.nodeType];
    if (def && def.gear) return hasGear(def.gear);
    return !!equippedToolFor(node.nodeType);
  }

  /** The name of whatever a node needs — a tool in hand, or gear you carry. */
  function requirementNameFor(nodeType) {
    const def = GATHER_NODES[nodeType];
    if (def && def.gear) {
      const g = REACHES_GEAR[def.gear];
      return (g && g.name) || def.gear;
    }
    return toolNameFor(nodeType);
  }

  /** Does this node want gear rather than a tool? */
  function isGearNode(nodeType) {
    const def = GATHER_NODES[nodeType];
    return !!(def && def.gear);
  }

  function nodeCenter(tx, ty) {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  /**
   * Turn a server refusal into something a first-time player can act on. The
   * common case really is "I have not crafted the axe yet", so that message
   * names the tool and the key that opens the crafting bench.
   */
  function refusalHint(reason, nodeType) {
    const r = String(reason || '').toLowerCase();
    if (/energy|tired|exhaust/.test(r)) return 'study to refill energy';
    if (/tool|axe|pickaxe|dredge|sifter|equip/.test(r)) {
      const tool = String(
        (GATHER_NODES[nodeType] && GATHER_NODES[nodeType].tool) || 'tool'
      ).replace(/_/g, ' ');
      const article = /^[aeiou]/.test(tool) ? 'an' : 'a';
      return 'press C to craft ' + article + ' ' + tool;
    }
    if (/respawn|regrow|grow|wait|empty|deplet/.test(r)) return 'it needs time to regrow';
    if (/durab|broke|broken/.test(r)) return 'repair it at a forge';
    return '';
  }

  /** Optimistically record damage so the depletion bar reacts immediately. */
  function noteDamage(tx, ty, nodeType, hitsLeft, destroyed) {
    const key = tx + ',' + ty;
    const def = GATHER_NODES[nodeType];
    if (destroyed) {
      const hours = (def && def.respawnHours) || 6;
      harvested.set(key, {
        x: tx,
        y: ty,
        nodeType,
        hitsLeft: 0,
        respawnAt: clockMs + hours * 3600000,
      });
      return;
    }
    const left = Number.isFinite(Number(hitsLeft))
      ? Number(hitsLeft)
      : Math.max(0, ((def && def.hits) || 3) - 1);
    harvested.set(key, { x: tx, y: ty, nodeType, hitsLeft: left, respawnAt: 0 });
  }

  /** Apply the visual consequences of one resolved swing, at its impact frame. */
  function applySwing(sw) {
    const c = nodeCenter(sw.x, sw.y);
    // Direction the tile is kicked: toward the player who struck it.
    const dx = Math.sign(player.centerX() - c.x);
    const dy = Math.sign(player.centerY() - c.y);
    const r = sw.result || {};

    if (!r.ok) {
      // A refusal is a dull thunk: a small shake, no chips, a red reason.
      shakeTile(sw.x, sw.y, dx || 0, dy || 1, 1, 160);
      const reason = r.error || 'nothing happens';
      toast(reason, PALETTE.bad, c.x, c.y - 6);
      const hint = refusalHint(reason, sw.nodeType);
      if (hint) toast(hint, PALETTE.textDim, c.x, c.y - 6);
      return;
    }

    const res = r.result || {};
    const nodeType = res.nodeType && GATHER_NODES[res.nodeType] ? res.nodeType : sw.nodeType;
    shakeTile(sw.x, sw.y, dx || 0, dy || 1, res.destroyed ? 3 : 2, res.destroyed ? 280 : 200);
    spawnParticles(sw.x, sw.y, nodeType, res.destroyed ? 16 : 4 + Math.floor(Math.random() * 5),
      res.destroyed ? 1.7 : 1);

    if (res.destroyed) {
      // Felling a planting consumes it and leaves a stump, exactly as the
      // server does. Dropping the local record here means the tile stops
      // drawing a tree the instant the axe lands rather than on the next push.
      if (plantings.delete(sw.x + ',' + sw.y)) {
        harvested.set(sw.x + ',' + sw.y, {
          x: sw.x, y: sw.y, nodeType: plantingNodeType(), hitsLeft: 0,
          respawnAt: 0, felled: true, stumpUntil: clockMs + STUMP_MINUTES * 60000,
        });
      } else {
        noteDamage(sw.x, sw.y, nodeType, 0, true);
      }
      const mat = MATERIALS && MATERIALS[res.materialId];
      const color = (mat && mat.color) || (NODE_STYLE[nodeType] || NODE_STYLE.tree).text;
      const name = (mat && mat.name) || res.materialId || 'material';
      const qty = Number(res.qty) || 0;
      if (qty > 0) toast('+' + qty + ' ' + name, color, c.x, c.y - 6);
    } else {
      noteDamage(sw.x, sw.y, nodeType, res.hitsLeft, false);
    }

    if (res.toolBroke) toast('your tool broke', PALETTE.bad, c.x, c.y - 6);
  }

  /**
   * Raise a gather attempt at (tx,ty). The swing plays immediately; the visual
   * consequence waits for BOTH the impact frame and the server's answer, so a
   * refusal never throws chips it should not have.
   */
  function attemptGather(tx, ty, dir) {
    if (build.isActive()) return false;
    if (player.isSwinging()) return false;
    const planted = plantingAt(tx, ty);
    // Same rule as targetNode(): a planting is only swingable once mature.
    if (planted && !isMaturePlanting(tx, ty)) return false;
    const nodeType = planted ? plantingNodeType() : tileNodeType(tx, ty);
    if (!nodeType) return false;
    if (!planted && isDepleted(tx, ty)) return false;

    player.startSwing(dir || player.dir);
    const sw = {
      x: tx,
      y: ty,
      nodeType,
      impactAt: simMs + SWING_IMPACT_MS,
      resolved: false,
      applied: false,
      result: null,
    };
    swings.push(sw);
    if (swings.length > 8) swings.splice(0, swings.length - 8);

    const fn = api.onGather;
    if (typeof fn !== 'function') {
      sw.resolved = true;
      sw.result = { ok: false, error: 'gathering is not wired up yet' };
      return true;
    }
    const settle = (value) => {
      sw.resolved = true;
      sw.result = value && typeof value === 'object' ? value : { ok: false, error: 'no response' };
    };
    try {
      Promise.resolve(fn(tx, ty, nodeType)).then(settle, (err) => {
        console.error('[world] onGather', err);
        settle({ ok: false, error: (err && err.message) || 'gather failed' });
      });
    } catch (err) {
      console.error('[world] onGather', err);
      settle({ ok: false, error: (err && err.message) || 'gather failed' });
    }
    return true;
  }

  /** Fire the feedback for any swing that has both landed and been answered. */
  function updateSwings() {
    for (let i = swings.length - 1; i >= 0; i--) {
      const sw = swings[i];
      if (sw.applied) {
        swings.splice(i, 1);
        continue;
      }
      if (!sw.resolved || simMs < sw.impactAt) continue;
      sw.applied = true;
      try {
        applySwing(sw);
      } catch (err) {
        console.error('[world] gather feedback', err);
      }
      swings.splice(i, 1);
    }
  }

  /* ---------------- planting ---------------- */

  /**
   * The faced tile, if a sapling would take root in it.
   *
   * Two kinds of ground qualify, and the server agrees on both: open grass, and
   * the stump of a felled tree. The stump case is the one that matters, because
   * TREES_REGROW is false — replanting a stump is the only way the Home Block's
   * forest ever grows back.
   *
   * Returns null (no prompt, no highlight) when there is nothing in the bag.
   */
  function plantTargetAt(tx, ty) {
    if (build.isActive()) return null;
    if (!state) return null;
    // EQUIPMENT, not the bag. Holding seeds is not intending to plant — that is
    // why this prompt used to appear on every patch of grass walked past. With
    // seeds in a slot it appears on open grass AND on stumps, as it should.
    if (!seedEquipped()) return null;
    // The square and the ground beside a trader are off limits. Checked with
    // the SAME shared rule the server refuses with — a prompt the API declines
    // is exactly the kind of lie this project keeps having to fix.
    if (plantingBlockedAt(tx, ty, state.buildings, footprintOf)) return null;
    if (seedStock().total < 1) return null;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return null;
    const key = tx + ',' + ty;
    if (plantings.has(key)) return null;          // already growing
    if (occupied.has(key)) return null;           // a building stands here
    const blocks = state.blocks;
    if (blocks && typeof blocks === 'object' && blocks[key]) return null;

    const e = harvestAt(tx, ty);
    // A felled tree is a stump forever, whether or not the stump art has faded.
    if (e && e.felled) return { x: tx, y: ty, tile: plantedTileName(), onStump: true };
    if (isDepleted(tx, ty)) return null;          // mined rubble, dredged reeds
    // NOT ON A CARVED ROUTE. The Reaches' roads and the labyrinth's corridors
    // are plain snow, snow is plantable, and a planted tree is solid — one
    // sapling in a one-tile corridor seals the maze behind you. `routed` is the
    // set the worldgen already keeps of every tile it deliberately cut.
    if (world.routed && world.routed.has(`${tx},${ty}`)) return null;
    if (!PLANTABLE_TILE_IDS.has(world.tiles[ty * WORLD_W + tx])) return null;
    return { x: tx, y: ty, tile: plantedTileName(), onStump: false };
  }

  /** plantTargetAt() for the tile the scholar is facing. */
  function plantTarget() {
    const f = player.facingTile();
    return plantTargetAt(f.x, f.y);
  }

  /**
   * Raise a plant attempt. The server owns stock, occupancy and bounds; all we
   * promise is that the ground reads as plantable from here.
   */
  function attemptPlant(target) {
    const t = target || plantTarget();
    if (!t) return false;
    if (player.isSwinging()) return false;
    const fn = api.onPlant;
    const c = nodeCenter(t.x, t.y);
    if (typeof fn !== 'function') {
      toast('planting is not wired up yet', PALETTE.bad, c.x, c.y - 6);
      return false;
    }
    const stock = seedStock();
    // Prefer the paid sapling, then the free seedpod — the same order the
    // server spends them in, so the prompt and the receipt cannot disagree.
    const source = stock.saplings > 0 ? 'sapling' : 'seedpod';
    const settle = (r) => {
      const res = r && typeof r === 'object' ? r : { ok: false, error: 'no response' };
      if (!res.ok) {
        shakeTile(t.x, t.y, 0, 1, 1, 160);
        return;
      }
      // The state push that comes back with the answer is what actually draws
      // the sprout; this is only the little puff of soil that says it landed.
      spawnParticles(t.x, t.y, 'sand', 8, 0.9);
      toast(source === 'seedpod' ? 'seedpod planted' : 'sapling planted',
        PALETTE.good, c.x, c.y - 6);
    };
    try {
      Promise.resolve(fn(t.x, t.y, { tile: t.tile, source })).then(settle, (err) => {
        console.error('[world] onPlant', err);
        settle({ ok: false, error: (err && err.message) || 'planting failed' });
      });
    } catch (err) {
      console.error('[world] onPlant', err);
      settle({ ok: false, error: (err && err.message) || 'planting failed' });
    }
    return true;
  }

  /* ---------------- build mode ---------------- */

  function enterBuildMode(buildingId) {
    build.enter(buildingId, { x: player.tileX(), y: player.tileY() - 1 });
    if (mouse.inside) syncGhostToMouse();
  }
  function exitBuildMode() {
    build.cancel();
  }
  function isBuildMode() {
    return build.isActive();
  }

  build.onPlace = (id, x, y) => {
    if (typeof api.onBuildPlace === 'function') {
      try {
        api.onBuildPlace(id, x, y);
      } catch (err) {
        console.error('[world] onBuildPlace', err);
      }
    }
  };
  build.onReject = (reason) => toast(reason || 'cannot build here', PALETTE.bad);

  function syncGhostToMouse() {
    if (!build.isActive()) return;
    const wx = mouse.cssX * view.dpr / view.S + cam.x;
    const wy = mouse.cssY * view.dpr / view.S + cam.y;
    build.setCursorWorld(wx, wy);
  }

  /* ---------------- interaction ---------------- */

  /**
   * An input that is never pressing anything. Handed to the player in place of
   * the real one while the UI has the screen.
   */
  const NO_INPUT = Object.freeze({ axis: () => ({ x: 0, y: 0 }), isDown: () => false });

  /**
   * Is something on screen that should hold the world still? A panel, a
   * conversation, or the pause menu.
   *
   * Asked every frame rather than latched on open/close: a panel that closes by
   * a route nobody remembered to hook would otherwise leave the player frozen
   * for the rest of the session, which is a far worse bug than the one being
   * fixed. Each hook is optional, so a bare `createGame()` with no integrator
   * still moves.
   */
  function uiBlocking() {
    for (const fn of [api.isDialogueOpen, api.isPanelOpen, api.isPauseOpen]) {
      if (typeof fn !== 'function') continue;
      try { if (fn()) return true; } catch (err) { console.error('[world] uiBlocking', err); }
    }
    return false;
  }

  /**
   * THE HERALD'S RIDE.
   *
   * Derived from `state.herald.summonedAt` and the wall clock, never ticked —
   * close the game halfway through his arrival and he is simply further along
   * when you come back, which is what "he is riding here" ought to mean.
   *
   * Two legs: east along the clear row, then a turn down to the middle. A
   * straight diagonal read as him swimming across the corner of the map; the
   * dog-leg keeps him on the open row HERALD.rowY for the whole approach, which
   * is the row that was measured to have no water in it.
   *
   * Returns null when he has not been summoned at all.
   */
  function heraldState() {
    if (!atHome()) return null;
    const h = state && state.herald;
    const at = h && Number(h.summonedAt);
    if (!at) return null;
    const t = Math.max(0, Math.min(1, (clockMs - at) / HERALD.rideMs));
    const arrived = t >= 1;

    let tx;
    let ty;
    if (t < HERALD.turnAt) {
      const k = t / HERALD.turnAt;
      tx = HERALD.fromX + (HERALD.stopX - HERALD.fromX) * k;
      ty = HERALD.rowY;
    } else {
      const k = (t - HERALD.turnAt) / (1 - HERALD.turnAt);
      tx = HERALD.stopX;
      ty = HERALD.rowY + (HERALD.stopY - HERALD.rowY) * k;
    }
    // A two-pixel canter while he is still moving. One sprite, one offset — at
    // this scale that reads as a horse rather than as a sliding decal.
    const bob = arrived ? 0 : (Math.sin(clockMs / 90) > 0 ? -1 : 0);
    return {
      arrived,
      progress: t,
      tileX: Math.round(tx),
      tileY: Math.round(ty),
      px: tx * TILE,
      py: ty * TILE + bob,
      spoken: !!(h && h.spoken),
      // Which walk frame is on screen. 0 while standing.
      frame: arrived ? 0 : (Math.floor(clockMs / HERALD.stepMs) % 2),
    };
  }

  /** Is the scholar close enough to speak to him? */
  function heraldInReach() {
    const h = heraldState();
    if (!h || !h.arrived) return false;
    const dx = Math.abs(player.tileX() - HERALD.stopX);
    const dy = Math.abs(player.tileY() - HERALD.stopY);
    return Math.max(dx, dy) <= 2;
  }

  /**
   * The Cheesecake Hermit, at the far left of the Summit. Purely an easter egg:
   * he gates nothing, so he needs no state at all — just a tile and a radius.
   */
  function hermitInReach() {
    if (worldArea !== AREAS.peaks) return false;
    const dx = Math.abs(player.tileX() - CHEESECAKE_HERMIT.x);
    const dy = Math.abs(player.tileY() - CHEESECAKE_HERMIT.y);
    return Math.max(dx, dy) <= 2;
  }

  /** The hut's state, from the save. */
  /**
   * IS THE SCHOLAR ON THE HOME BLOCK?
   *
   * Every Home-only feature is gated through this ONE predicate rather than
   * through a guard at each draw and each keypress. The hut, the keeper, the
   * boat, the fishing line, the cave roof and the Herald all live at fixed
   * coordinates, and those coordinates exist on BOTH maps — so without this the
   * Reaches grow a phantom hut door at 53,10, a boat you can board at 44,40 and
   * a slab of the Stonemason's ceiling in the middle of a snowfield. Guarding
   * the draws one at a time is what let those through the first time.
   */
  function atHome() {
    return worldArea === AREAS.home;
  }

  function hutState() {
    const h = state && state.hut;
    return { opened: atHome() && !!(h && h.opened), spoken: !!(h && h.spoken) };
  }
  /** Where the hut's door opens onto — and where the keeper stands once out. */
  function hutDoorTile() {
    return { x: HUT.x + Math.floor(HUT.w / 2), y: HUT.y + HUT.h };
  }
  function atHutDoor() {
    if (!atHome()) return false;
    const d = hutDoorTile();
    return Math.max(Math.abs(player.tileX() - d.x), Math.abs(player.tileY() - d.y)) <= 2;
  }

  /** Has the boat been handed over? */
  function boatGranted() {
    return atHome() && !!(state && state.boat && state.boat.granted);
  }
  /** Is the scholar standing on the boat? Fishing is only legal from it. */
  function onBoat() {
    return riding();
  }

  /** Standing on the crossing column, in the gap rows? */
  /**
   * Standing on a way out of this map?
   *
   * Read off the CROSSINGS table rather than from a pair of constants: there
   * are three maps now and the Reaches have a door at each end, so "which way
   * out is this" is a question with more than one answer.
   */
  function crossingHere() {
    return crossingAt(worldArea, player.tileX(), player.tileY());
  }
  function atCrossing() {
    return !!crossingHere();
  }

  /** Close enough to speak to the Wise Man, on the peak? */
  function atWiseMan() {
    if (worldArea !== AREAS.peaks) return false;
    return Math.max(
      Math.abs(player.tileX() - WISE_MAN.x),
      Math.abs(player.tileY() - WISE_MAN.y)
    ) <= 2;
  }

  /** Standing on a tile touching the boat — close enough to climb in. */
  function nextToBoat() {
    if (!atHome()) return false;
    const bx = boatTile().x;
    const by = boatTile().y;
    return Math.max(Math.abs(player.tileX() - bx), Math.abs(player.tileY() - by)) <= 1;
  }

  /**
   * Where the boat is.
   *
   * WHILE RIDING SHE IS WHEREVER THE SCHOLAR IS, taken from the renderer rather
   * than from state. The server does record her — `/api/player/move` drags her
   * along — but that route answers with `ok()` and no state, so the client's
   * copy would not catch up until some other call happened to return one. She
   * would be drawn at the mooring while you rowed away from it.
   *
   * Moored, she comes from the save, because then the server really is the one
   * that knows.
   */
  /**
   * Where the boat is IN PIXELS.
   *
   * The scholar moves in free pixels with a hitbox; the boat used to be drawn
   * at `tile * TILE`, so while rowing she jumped a whole tile at a time and the
   * scholar slid out of her between jumps. Riding means they are one object:
   * one position, in the same units.
   */
  function boatPixel() {
    if (riding()) return { px: player.px, py: player.py };
    const t = boatTile();
    return { px: t.x * TILE, py: t.y * TILE };
  }

  function boatTile() {
    if (riding()) return { x: player.tileX(), y: player.tileY() };
    const b = state && state.boat;
    const x = Number(b && b.x);
    const y = Number(b && b.y);
    return {
      x: Number.isFinite(x) ? x : BOAT.x,
      y: Number.isFinite(y) ? y : BOAT.y,
    };
  }

  /* ================================================================= *
   * THE MOUNTAIN — layers, gear, ice, boulders and the Warden.
   * ================================================================= */

  /** The floor's own definition, or null in the bailey. */
  function floorDef() {
    return towerFloor > 0 ? TOWER_FLOORS[towerFloor - 1] : null;
  }

  /**
   * The boulders, plates, gates and get-thrown-back door that apply RIGHT NOW.
   *
   * On a tower floor that is the floor's own furniture; everywhere else it is
   * the map's. One accessor, so nothing downstream has to know which.
   */
  function puzzleSet() {
    const f = floorDef();
    if (f) {
      return {
        boulders: f.boulders || [],
        plates: f.plates || [],
        gates: f.gates || {},
        door: f.door,
      };
    }
    return AREA_PUZZLES[worldArea] || null;
  }

  /** A key for the boulder store: the map, the floor, and the boulder. */
  function boulderKey(id) {
    return towerFloor > 0 ? `${worldArea}:f${towerFloor}:${id}` : `${worldArea}:${id}`;
  }

  /** Is this tile inside the keep's circle? */
  function insideTower(tx, ty) {
    return Math.hypot(tx - TOWER.cx, ty - TOWER.cy) <= TOWER.r;
  }

  /** Which terrace a tile is on. Flat maps are all layer 0. */
  function layerAt(tx, ty) {
    if (!world.layers) return 0;
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return 0;
    return world.layers[ty * WORLD_W + tx];
  }

  /** A ladder or a stair: the only two tiles you may change terrace on. */
  function isClimbTile(tx, ty) {
    const t = tileAtSafe(tx, ty);
    return t === TILE_TYPES.ladder || t === TILE_TYPES.stair;
  }

  function tileAtSafe(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return -1;
    return world.tiles[ty * WORLD_W + tx];
  }

  /** What the scholar has found up here. */
  function reachesState() {
    const r = (state && state.reaches) || null;
    return {
      gear: (r && Array.isArray(r.gear)) ? r.gear : [],
      boulders: (r && r.boulders) || null,
      wardenBeaten: !!(r && r.warden && r.warden.beaten),
    };
  }
  function hasGear(id) { return reachesState().gear.indexOf(id) !== -1; }

  /**
   * WHERE EVERY BOULDER IS. The server owns the positions; before the first
   * state arrives, and for a save written before the mountain existed, they
   * stand where the design puts them.
   */
  /**
   * PER-FRAME CACHES for the two lists everything else asks for.
   *
   * `boulderList()` allocated a fresh array on every call, and `boulderAt()`
   * calls it — which `stepBlocked` does several times per frame per axis, and
   * which `plateHeld` -> `gateOpen` does again for every gate tile. `patrolList()`
   * now walks each beat's lane looking for a wall, and both the collision pass
   * and the draw pass ask for it. Together that was hundreds of throwaway arrays
   * a second: not slow arithmetic, but steady GC pressure, which shows up as
   * exactly the symptom Bruno reported — movement that hitches in small stops
   * rather than running slow.
   *
   * Stamped with the frame's clock, so nothing can read a stale list: every
   * caller inside one update/render pass sees the same answer, and the next
   * frame rebuilds.
   */
  let boulderCache = { at: -1, list: null };
  let patrolCache = { at: -1, list: null };
  function invalidateFrameCaches() {
    boulderCache.at = -1;
    patrolCache.at = -1;
  }

  function boulderList() {
    if (boulderCache.at === clockMs && boulderCache.list) return boulderCache.list;
    const list = boulderListUncached();
    boulderCache = { at: clockMs, list };
    return list;
  }

  function boulderListUncached() {
    const saved = reachesState().boulders;
    const out = [];
    const set = puzzleSet();
    const list = towerFloor > 0 ? (set ? set.boulders : []) : bouldersFor(worldArea);
    for (const b of list) {
      // Keyed `area:id`. Two maps may both have a boulder called `yard_a`, so
      // the store carries the map; the bare id is read as a fallback so a save
      // written before Elderwatch existed still finds its own boulders.
      const at = saved && (saved[boulderKey(b.id)] || saved[b.id]);
      out.push({
        id: b.id,
        x: at && Number.isFinite(Number(at.x)) ? Number(at.x) : b.x,
        y: at && Number.isFinite(Number(at.y)) ? Number(at.y) : b.y,
      });
    }
    return out;
  }
  function boulderAt(tx, ty) {
    if (!puzzleSet()) return null;
    return boulderList().find((b) => b.x === tx && b.y === ty) || null;
  }

  /** A plate is held while something heavy rests on it. */
  function plateHeld(px, py) {
    if (boulderAt(px, py)) return true;
    return player.tileX() === px && player.tileY() === py;
  }

  /** An ice gate stands until every plate of its name is held. */
  /** Has a winch that opens this gate been thrown, and stayed thrown? */
  function switchThrown(id) {
    const doors = (state && state.doors) || {};
    return !!doors[`${worldArea}:switch:${id}`];
  }

  /**
   * A gate stands until every plate of its name is held — OR until a winch
   * that opens it has been thrown. Plates are a grip you must keep; a winch is
   * a decision you made once, which is what a front gate needs.
   */
  function gateOpen(name) {
    if (switchesHere().some((w) => w.opens === name && switchThrown(w.id))) return true;
    const set = puzzleSet();
    const all = towerFloor > 0 ? (set ? set.plates : []) : platesFor(worldArea);
    const plates = all.filter((p) => p.gate === name);
    if (!plates.length) return false;
    return plates.every((p) => plateHeld(p.x, p.y));
  }

  /** The winches on this map and floor. Only Elderwatch's bailey has any. */
  function switchesHere() {
    if (worldArea !== AREAS.elderwatch || towerFloor > 0) return [];
    return ELDERWATCH_SWITCHES;
  }
  function switchInReach() {
    const t = { x: player.tileX(), y: player.tileY() };
    const f = player.facingTile();
    return switchesHere().find((w) => (Math.max(Math.abs(t.x - w.x), Math.abs(t.y - w.y)) <= 1)
      || (w.x === f.x && w.y === f.y)) || null;
  }
  function gateAt(tx, ty) {
    const set = puzzleSet();
    if (!set) return null;
    for (const [name, tiles] of Object.entries(set.gates)) {
      if (tiles.some((t) => t.x === tx && t.y === ty)) return name;
    }
    return null;
  }

  /** A quest item lying here that has not been taken yet. */
  function questSiteAt(tx, ty) {
    const sites = questSitesFor(worldArea, towerFloor);
    if (!sites.length) return null;
    const held = (state && state.questItems) || {};
    return sites.find((q) => q.x === tx && q.y === ty && !(Number(held[q.item]) > 0)) || null;
  }
  function questSiteInReach() {
    const t = { x: player.tileX(), y: player.tileY() };
    const f = player.facingTile();
    return questSiteAt(t.x, t.y) || questSiteAt(f.x, f.y);
  }
  /** Has the locked door on this floor been unlocked already? */
  function doorOpened() {
    const doors = (state && state.doors) || {};
    return !!doors[towerFloor > 0 ? `${worldArea}:f${towerFloor}` : `${worldArea}`];
  }

  /** The locked door that applies here — the floor's, or the map's. */
  function lockHere() {
    const f = floorDef();
    if (f) return f.lock || null;
    return DOOR_KEYS[worldArea] || null;
  }

  /** Do you carry this quest item? */
  function holdsItem(id) {
    const held = (state && state.questItems) || {};
    return Number(held[id]) > 0;
  }

  /** The gear lying on the ground here, if it has not been picked up. */
  function gearAt(tx, ty) {
    if (worldArea !== AREAS.peaks) return null;
    const site = GEAR_SITES.find((g) => g.x === tx && g.y === ty);
    if (!site || hasGear(site.gear)) return null;
    return site;
  }
  function gearInReach() {
    const t = { x: player.tileX(), y: player.tileY() };
    const f = player.facingTile();
    return gearAt(t.x, t.y) || gearAt(f.x, f.y);
  }

  /**
   * THE RIME WARDEN. Its walk is a pure function of the clock, exactly like the
   * Herald's ride — no timer, no accumulated drift, and a reload puts it back
   * on the same beat rather than wherever it happened to be.
   */
  /**
   * A BEAT, WALKED ON THE CLOCK. Pure function of the time, exactly like the
   * Herald's ride: no timer, no accumulated drift, and a reload puts the walker
   * back on the same step rather than wherever it happened to be.
   */
  /**
   * WHERE A PATROL IS RIGHT NOW — a pure function of the clock.
   *
   * A beat is a LANE, walked end to end and back. Horizontal lanes name a
   * `rowY` and run `fromX`->`toX`; vertical ones name a `colX` and run
   * `fromY`->`toY`. Vertical came in with Elderwatch's bailey, which is a RING
   * around the keep: two of its four sides are columns, and with only rows to
   * offer, the garrison had been given beats that ran through the tower.
   *
   * `dx`/`dy` is the way the watchman is looking, and the axis `patrolSees`
   * reads down. `dir` is kept for the callers that only ever knew about rows.
   */
  function pace(beat) {
    const vertical = Number.isFinite(beat.colX);
    const from = vertical ? beat.fromY : beat.fromX;
    const to = vertical ? beat.toY : beat.toX;
    const span = Math.abs(to - from);
    if (span <= 0) return null;
    const step = Math.floor(clockMs / beat.stepMs) % (span * 2);
    const forward = step < span;
    const dir = Math.sign(to - from);
    const at = forward ? from + step * dir : to - (step - span) * dir;
    const d = forward ? dir : -dir;
    return vertical
      ? { x: beat.colX, y: at, dx: 0, dy: d, dir: d, sight: beat.sight }
      : { x: at, y: beat.rowY, dx: d, dy: 0, dir: d, sight: beat.sight };
  }

  function wardenState() {
    if (worldArea !== AREAS.peaks) return null;
    if (reachesState().wardenBeaten) return null;
    return pace(WARDEN);
  }

  /**
   * A PATROL STOPS AT WHAT IS IN HIS WAY.
   *
   * `pace` is a pure function of the clock with no collision in it, which is
   * right — a beat should not drift out of step because somebody stood on it.
   * But it meant a watchman walked THROUGH the walls his lane happened to touch.
   *
   * So the beat still says where he WANTS to be, and this walks the lane from
   * his end of it and stops him at the last clear tile before the first wall.
   * He turns round early instead of clipping through it.
   */
  /**
   * WALLS ONLY — not boulders.
   *
   * Blocking on boulders as well looked right and killed the Rime Warden
   * outright: he paces row 5 and his own three boulders START on row 5, at
   * x47, x51 and x55, so he was pinned at the west end of his beat behind the
   * first of them and could never see anybody again. His stones are the puzzle
   * he is guarding; walking among them is the encounter.
   *
   * Bruno's report was about walls — "npcs are going across walls, specially
   * enemies or guards" — so that is exactly what this stops, for movement and
   * for line of sight alike.
   */
  function blockedForPatrol(tx, ty) {
    const t = tileAtSafe(tx, ty);
    if (t === TILE_TYPES.icegate) return !gateOpen(gateAt(tx, ty));
    return SOLID.has(t);
  }

  function stopAtBlocker(beat, at) {
    const vertical = Number.isFinite(beat.colX);
    const from = vertical ? beat.fromY : beat.fromX;
    const cur = vertical ? at.y : at.x;
    const step = Math.sign(cur - from) || 1;
    let last = from;
    for (let v = from; v !== cur + step; v += step) {
      const x = vertical ? beat.colX : v;
      const y = vertical ? v : beat.rowY;
      if (blockedForPatrol(x, y)) break;
      last = v;
    }
    return vertical ? { ...at, y: last } : { ...at, x: last };
  }

  /** Everyone walking a beat on this map. Cached for the frame. */
  function patrolList() {
    if (patrolCache.at === clockMs && patrolCache.list) return patrolCache.list;
    const list = patrolListUncached();
    patrolCache = { at: clockMs, list };
    return list;
  }

  function patrolListUncached() {
    if (worldArea === AREAS.peaks) {
      const w = wardenState();
      return w ? [stopAtBlocker(WARDEN, w)] : [];
    }
    if (worldArea === AREAS.elderwatch) {
      const f = floorDef();
      const beats = f ? (f.patrols || []) : ELDERWATCH_WATCH;
      return beats
        .map((b) => { const at = pace(b); return at ? stopAtBlocker(b, at) : null; })
        .filter(Boolean);
    }
    return [];
  }

  /**
   * Are you standing in a line somebody is looking down?
   *
   * Down the lane he walks, whichever axis that is. A watchman on a column
   * looks up or down it; one on a row looks along it.
   */
  function patrolSees() {
    for (const w of patrolList()) {
      const dx = w.dy ? 0 : w.dx;
      const dy = w.dy ? w.dy : 0;
      if (dy) { if (player.tileX() !== w.x) continue; } else if (player.tileY() !== w.y) continue;
      const ahead = dy ? (player.tileY() - w.y) * dy : (player.tileX() - w.x) * dx;
      if (ahead <= 0 || ahead > w.sight) continue;
      // AND HE HAS TO BE ABLE TO SEE IT. The sight test used to be pure
      // arithmetic down the axis, so a watchman spotted you through the keep's
      // wall, through a barrel and through a shut gate. Walk the line.
      let clear = true;
      for (let i = 1; i < ahead; i += 1) {
        if (blockedForPatrol(w.x + dx * i, w.y + dy * i)) { clear = false; break; }
      }
      if (clear) return true;
    }
    return false;
  }
  const wardenSees = patrolSees;

  /**
   * HOW FAR UP THE SCREEN A TILE IS DRAWN, in world pixels.
   *
   * This is the entire third dimension. Every coordinate in the game stays a
   * flat (x, y); only the DRAW is moved, and the gap the move leaves behind is
   * filled with cliff face. Nothing else in the engine knows the mountain has
   * height.
   */
  function liftAt(tx, ty) {
    return layerAt(tx, ty) * LAYER_LIFT;
  }

  /** Standing on ice with nothing on your boots to hold it. */
  function onSlipperyIce() {
    if (worldArea !== AREAS.peaks) return false;
    if (hasGear('crampons')) return false;
    return tileAtSafe(player.tileX(), player.tileY()) === TILE_TYPES.ice;
  }

  /** Inside the summit cave — dark, like the Stonemason's. */
  function inWiseCave() {
    if (worldArea !== AREAS.peaks) return false;
    const tx = player.tileX();
    const ty = player.tileY();
    return tx >= WISE_CAVE.x && tx < WISE_CAVE.x + WISE_CAVE.w
      && ty >= WISE_CAVE.y && ty < WISE_CAVE.y + WISE_CAVE.h;
  }

  /** Is the scholar aboard the boat right now? */
  function riding() {
    return atHome() && !!(state && state.boat && state.boat.riding);
  }

  function adjacentBuilding() {
    const px = player.tileX();
    const py = player.tileY();
    let best = null;
    for (const b of buildings) {
      // The COUNTER, not the footprint — see BUILDING_COUNTER. The Stonemason's
      // mountain is anchored in the rock above his cave, so its footprint's
      // margin spilled out onto the hillside and let you trade from outside.
      const c = counterRect(b.buildingId, b.x, b.y, b);
      if (px >= c.x - 1 && px <= c.x + c.w && py >= c.y - 1 && py <= c.y + c.h) {
        if (!best) best = b;
      }
    }
    return best;
  }

  function fireInteract(buildingId) {
    if (typeof api.onInteract !== 'function') return;
    try {
      api.onInteract(buildingId == null ? null : buildingId);
    } catch (err) {
      console.error('[world] onInteract', err);
    }
  }

  /* ---------------- events ---------------- */

  /**
   * Keys 1 and 2 — the equipment slots.
   *
   * 1 and 2 ONLY SELECT. They never use what is in the slot.
   *
   * They used to double as a use key: pressing the number of the slot that was
   * ALREADY active swung the tool or planted the seed. Bruno, 2026-08-31:
   * *"when I press 1 or 2, it mines/uses axe. it should only use them when I
   * press E with those tools equipped."* He is right — one key doing two
   * different things depending on hidden state is how you chop a tree you meant
   * to switch away from. E is the use key, and the only use key.
   *
   * Pressing the number of the slot you are already on is therefore a no-op
   * apart from a toast confirming what is in your hand, which is what a
   * selection key should do.
   */
  function selectSlot(idx) {
    const slots = equipSlots();
    const ref = slots[idx];
    // Selecting an empty slot is still a real choice — it is how you put
    // everything down — but say so, or it reads as a dead key.
    if (idx !== activeSlot() && typeof api.onEquipActive === 'function') {
      try { api.onEquipActive(idx); } catch (err) { console.error('[world] onEquipActive', err); }
    }
    toast(ref ? `slot ${idx + 1}: ${refLabelOf(ref)}` : `slot ${idx + 1} — empty`,
      ref ? PALETTE.accent : PALETTE.textDim);
  }

  /** A readable name for whatever is in a slot, for toasts and the HUD. */
  function refLabelOf(ref) {
    if (!ref) return 'nothing';
    if (ref.kind === 'seed') return 'saplings';
    return String(ref.itemId || ref.kind).replace(/_/g, ' ');
  }

  function onKeyPress(code) {
    // The input layer is still bound while the game is stopped (title screen,
    // quit to menu), so every world key must refuse to act when it is not
    // running — otherwise 1 and 2 fire equip requests from the title screen.
    if (!running) return;
    if (code === 'Digit1' || code === 'Numpad1') { selectSlot(0); return; }
    if (code === 'Digit2' || code === 'Numpad2') { selectSlot(1); return; }
    if (build.isActive()) {
      if (code === 'Escape') {
        build.cancel();
        toast('build cancelled', PALETTE.textDim);
        return;
      }
      if (code === 'Enter' || code === 'Space') {
        build.confirm();
        return;
      }
      return;
    }
    if (code === 'KeyE') {
      // A node the scholar is squarely facing wins over a building they merely
      // A conversation is running: E reads the next line. Before the panel
      // check, because a conversation can be raised over an open panel and
      // closing that panel out from under it would strand the box.
      if (typeof api.isDialogueOpen === 'function' && api.isDialogueOpen()) {
        if (typeof api.onAdvanceDialogue === 'function') {
          try { api.onAdvanceDialogue(); } catch (err) { console.error('[world] onAdvanceDialogue', err); }
        }
        return;
      }
      // The Wise Man, at the back of the summit cave.
      if (atWiseMan()) { fireInteract('__wiseman'); return; }
      // THE MOUNTAIN. Gear lying on the ground, and boulders to shove. Before
      // the node sweep: a boulder standing on a plate is not a rock to mine.
      const q = questSiteInReach();
      if (q) {
        if (typeof api.onTakeQuestItem === 'function') {
          try { api.onTakeQuestItem(q.item); } catch (err) { console.error('[world] onTakeQuestItem', err); }
        }
        return;
      }
      const gear = gearInReach();
      if (gear) {
        if (typeof api.onTakeGear === 'function') {
          try { api.onTakeGear(gear.gear); } catch (err) { console.error('[world] onTakeGear', err); }
        }
        return;
      }
      const facedBoulder = (() => {
        const f = player.facingTile();
        return boulderAt(f.x, f.y);
      })();
      if (facedBoulder) {
        const dir = player.facingDelta ? player.facingDelta() : null;
        const dx = dir ? dir.x : facedBoulder.x - player.tileX();
        const dy = dir ? dir.y : facedBoulder.y - player.tileY();
        const tx = facedBoulder.x + Math.sign(dx);
        const ty = facedBoulder.y + Math.sign(dy);
        if (isBlocked(tx, ty)) {
          toast('it will not budge — there is rock behind it', PALETTE.textDim);
          return;
        }
        if (typeof api.onPushBoulder === 'function') {
          try {
            api.onPushBoulder(facedBoulder.x, facedBoulder.y, Math.sign(dx), Math.sign(dy));
          } catch (err) { console.error('[world] onPushBoulder', err); }
        }
        return;
      }
      // The edge of the world. E on the crossing column walks you over.
      if (atCrossing()) { fireInteract('__travel'); return; }
      // The hut has no building record either — it is carved terrain with a
      // sprite — so it needs its own check before the building sweep.
      if (atHutDoor()) { fireInteract('__hut'); return; }
      // The Herald: he stands in the middle of the map with no building to be
      // adjacent to, so the ordinary building check below would never find him.
      // After the dialogue check, so E still pages through what he is saying.
      if (heraldInReach()) { fireInteract('__herald'); return; }
      if (hermitInReach()) { fireInteract('__cheesecake'); return; }
      {
        const lock = lockHere();
        const f3 = player.facingTile();
        if (lock && lock.x === f3.x && lock.y === f3.y && !doorOpened() && holdsItem(lock.item)) {
          fireInteract('__door'); return;
        }
        const w = switchInReach();
        if (w && !switchThrown(w.id)) { fireInteract(`__switch:${w.id}`); return; }
      }
      // A panel is already on screen: E closes it and does NOTHING else.
      // Bruno: "if I click E again while its open it should also close." Doing
      // it before the gather branch matters — otherwise the keypress meant to
      // dismiss the shop fells the tree behind it.
      if (typeof api.isPanelOpen === 'function' && api.isPanelOpen()) {
        if (typeof api.onClosePanels === 'function') {
          try { api.onClosePanels(); } catch (err) { console.error('[world] onClosePanels', err); }
        }
        return;
      }
      // happen to be standing beside; facing a building still opens its panel.
      const facedBuilding = (() => {
        const f = player.facingTile();
        return buildingAt(buildings, f.x, f.y);
      })();
      if (!facedBuilding) {
        const n = targetNode();
        // Only swing when the tool is in a slot. Otherwise fall through: the
        // prompt already says to equip it, and E stays useful for whatever else
        // is here rather than posting a request the server will refuse.
        if (n && nodeReady(n) && attemptGather(n.x, n.y, player.dir)) return;
        // Nothing to chop in front of us: bare plantable ground takes a sapling.
        // A building the scholar merely stands beside still wins over this, so
        // E never stops opening the shop you are leaning on — the prompt says
        // "P plant" in that case, and P works everywhere.
        if (facingPlant && !nearBuilding && attemptPlant(facingPlant)) return;
      }
      const b = facedBuilding || adjacentBuilding();
      fireInteract(b ? b.buildingId : null);
      return;
    }
    if (code === 'KeyP') {
      // P is BOARDING when you are standing on or beside the boat, and planting
      // otherwise. The boat wins: you are not going to plant a sapling in a
      // lake, and P is the only key the boat has.
      if (boatGranted() && (riding() || nextToBoat())) {
        if (typeof api.onBoard === 'function') {
          try { api.onBoard(riding() ? shoreBesideBoat() : null); }
          catch (err) { console.error('[world] onBoard', err); }
        }
        return;
      }
      if (facingPlant) attemptPlant(facingPlant);
    }
    // L — cast a line. Only from the boat; the server enforces both that and
    // the interval, so a fast finger gets a refusal rather than a fish.
    if (code === 'KeyL') {
      if (!onBoat()) {
        if (boatGranted()) toast('you can only fish from the boat', PALETTE.textDim);
        return;
      }
      if (typeof api.onFish === 'function') {
        try { api.onFish(); } catch (err) { console.error('[world] onFish', err); }
      }
    }
  }

  function onMouseMove(e) {
    if (!canvas || !canvas.getBoundingClientRect) return;
    const r = canvas.getBoundingClientRect();
    mouse.cssX = e.clientX - r.left;
    mouse.cssY = e.clientY - r.top;
    mouse.inside = true;
    syncGhostToMouse();
  }
  function onMouseLeave() {
    mouse.inside = false;
  }
  function onMouseDown(e) {
    if (isTypingTarget()) return;
    if (build.isActive()) {
      if (e.button === 2) {
        build.cancel();
        toast('build cancelled', PALETTE.textDim);
      } else if (e.button === 0) {
        onMouseMove(e);
        build.confirm();
      }
      if (e.preventDefault) e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    onMouseMove(e);
    const wx = mouse.cssX * view.dpr / view.S + cam.x;
    const wy = mouse.cssY * view.dpr / view.S + cam.y;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    const b = buildingAt(buildings, tx, ty);
    if (!b) {
      // Clicking an orthogonally adjacent node swings at it, turning to face it.
      const dx = tx - player.tileX();
      const dy = ty - player.tileY();
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        let dir = player.dir;
        if (dx === -1) dir = 'left';
        else if (dx === 1) dir = 'right';
        else if (dy === -1) dir = 'up';
        else if (dy === 1) dir = 'down';
        if (attemptGather(tx, ty, dir)) return;
        // Clicking adjacent bare ground plants there, the mirror of clicking
        // an adjacent node to swing at it. Turn to face it first, so the
        // scholar is not planting over their shoulder.
        const seedable = plantTargetAt(tx, ty);
        if (seedable) {
          player.dir = dir;
          if (attemptPlant(seedable)) return;
        }
      }
    }
    fireInteract(b ? b.buildingId : null);
  }
  function onContextMenu(e) {
    if (build.isActive() && e.preventDefault) e.preventDefault();
  }

  input.onPress(onKeyPress);

  let listenersBound = false;
  function bindListeners() {
    if (listenersBound || !canvas || !canvas.addEventListener) return;
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    if (typeof window !== 'undefined') window.addEventListener('resize', resize);
    listenersBound = true;
  }
  function unbindListeners() {
    if (!listenersBound || !canvas) return;
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseleave', onMouseLeave);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('contextmenu', onContextMenu);
    if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
    listenersBound = false;
  }

  /* ---------------- loop ---------------- */

  player.onMoveCommit = (x, y) => {
    if (typeof api.onMoveCommit === 'function') {
      try {
        api.onMoveCommit(x, y);
      } catch (err) {
        console.error('[world] onMoveCommit', err);
      }
    }
  };

  function update(dtMs, now) {
    clockMs = Date.now();
    // A NEW FRAME IS A NEW ANSWER. Keyed on the clock alone, two frames landing
    // inside the same millisecond would share a list — harmless for positions,
    // wrong for one frame after a push lands.
    invalidateFrameCaches();
    simMs += dtMs;
    // NOTHING ON SCREEN MEANS NOTHING MOVES.
    //
    // Bruno, 2026-08-31: "when you are in a dialogue, text box, or opened a
    // building or inventory/Q, you should not be able to move." He is right —
    // the world kept walking underneath every panel, so you could wander off
    // while reading a shop, and the position that got saved was wherever WASD
    // had carried you behind the box.
    //
    // Handled by feeding the player a zeroed input rather than skipping the
    // update: `update()` also settles the swing animation and the idle frame,
    // and skipping it leaves the scholar frozen mid-stride.
    // Worn charms can change walking pace. Applied every frame rather than on
    // equip, because a charm can be put on from the Bag while the world runs.
    // CLIMBING IS SLOWER THAN WALKING. A ladder crossed at walking pace is a
    // ladder you barely see, which is half of why the way up read as a
    // teleport; the other half is the lift, eased below.
    const onClimb = worldArea === AREAS.peaks && isClimbTile(player.tileX(), player.tileY());
    player.speedMult = speedMultiplierOf(wornCharms()) * (onClimb ? CLIMB_SPEED : 1);
    // ICE. Without crampons, stepping onto ice commits you: the axis is taken
    // out of your hands and you keep going until something stops you or the ice
    // runs out. Done by feeding the player a SYNTHETIC INPUT rather than by
    // moving them directly, so the slide goes through exactly the same
    // collision, wall-sliding and animation as a walked step.
    // A PANEL PAUSES THE SLIDE; IT DOES NOT CANCEL IT.
    //
    // Clearing it meant the Bag was a brake: open it halfway across the ice,
    // close it, and you were standing still wherever you liked — which is a
    // free stop anywhere on the tarn, and the tarn is a puzzle about not being
    // able to stop. She keeps her line and picks it up again when the panel
    // closes.
    const paused = uiBlocking();
    let feed = paused ? NO_INPUT : input;
    if (!paused) {
      const ax = input.axis();
      if (slide) {
        const nx = player.tileX() + slide.x;
        const ny = player.tileY() + slide.y;
        if (!onSlipperyIce()) {
          // LANDED. She has reached ground that will hold her, and the key that
          // sent her may well still be down — so latch the direction and refuse
          // it until it is released. Without this, holding east across the tarn
          // carried her over the island and straight back onto the ice on the
          // far side of it: the one tile you are trying to stop on is the one
          // tile a held key walks you off. Every ice puzzle in the genre works
          // this way, and this is why.
          landedDir = slide;
          slide = null;
        } else if (isBlocked(nx, ny)) {
          slide = null;
        }
      }
      if (landedDir) {
        const same = Math.sign(ax.x) === landedDir.x && Math.sign(ax.y) === landedDir.y;
        if ((!ax.x && !ax.y) || !same || onSlipperyIce()) landedDir = null;
      }
      if (!slide && onSlipperyIce() && (ax.x || ax.y)) {
        // THE PRESSED DIRECTION MAY BE INTO A ROCK. Ordinary walking resolves
        // each axis on its own, so holding into a wall and pressing another way
        // slides you ALONG it. A slide collapses the input to a single
        // direction, and the first cut always collapsed it to the dominant one
        // — so pressed against a pillar with that key still held, every other
        // key did nothing and the ice read as a trap. Try the dominant axis
        // first and fall back to the other one.
        const px = Math.sign(ax.x);
        const py = Math.sign(ax.y);
        const wantX = { x: px, y: 0 };
        const wantY = { x: 0, y: py };
        const order = Math.abs(ax.x) >= Math.abs(ax.y) ? [wantX, wantY] : [wantY, wantX];
        for (const dir of order) {
          if (!dir.x && !dir.y) continue;
          if (isBlocked(player.tileX() + dir.x, player.tileY() + dir.y)) continue;
          slide = dir;
          break;
        }
        // A SLIDE RUNS IN A LANE.
        //
        // She walks in free pixels; the slide reasons in TILES. Step onto ice
        // half a tile out of true and the two disagree — the tile ahead reads
        // free while her body is fouling the corner of a pillar beside it, so
        // she stops dead with the slide still running and every key ignored.
        // That is the ice "trap": not a rule, a rounding difference.
        //
        // Snapping the cross-axis to the centre of the tile she is ALREADY
        // standing in cannot push her into anything (it only ever moves her
        // away from her neighbours), and from there the tile checks and the
        // pixel collision agree for the whole slide.
        if (slide) {
          if (slide.x) player.py = player.tileY() * TILE;
          else player.px = player.tileX() * TILE;
        }
      }
      if (slide) feed = { axis: () => slide };
      // Still holding the key that landed her: she stays put until it is let go.
      else if (landedDir) feed = NO_INPUT;
    }
    const wasX = player.px;
    const wasY = player.py;
    player.update(dtMs, feed, isBlocked, now);
    // BELT AND BRACES. Whatever the reason a slide stops making progress —
    // a corner the tile check cannot see, a gate closing, anything I have not
    // thought of — a slide that is not moving her is not a slide, and holding
    // it would mean holding her input hostage. Clear it and let the next frame
    // read the keys again.
    // ...but not while a panel is up: she is not moving because nothing is
    // being asked of her, and a paused slide is not a stalled one.
    if (!paused && slide
      && Math.abs(player.px - wasX) < 0.01 && Math.abs(player.py - wasY) < 0.01) {
      stalledMs += dtMs;
      if (stalledMs >= 90) { slide = null; stalledMs = 0; }
    } else {
      stalledMs = 0;
    }

    // THE STAIRS OF THE KEEP. Stepping onto one moves you a floor, the way a
    // doorway in a Zelda dungeon does — no key to press, because a staircase
    // you have to ask permission to use is a staircase you will walk past. The
    // debounce is the whole of the safety: arriving on a floor puts you ON its
    // opposite stair, and without it you would ride up and down forever.
    if (worldArea === AREAS.elderwatch && clockMs - climbedAt > 400) {
      const tx = player.tileX();
      const ty = player.tileY();
      // THE STEP YOU ARRIVED ON DOES NOT COUNT until you leave it. Every floor
      // puts you down on its opposite stair, so without this she would arrive
      // and immediately take the same flight back — a lift stuck between two
      // floors.
      if (climbTile && (climbTile.x !== tx || climbTile.y !== ty)) climbTile = null;
      const here = tileAtSafe(tx, ty);
      const up = here === TILE_TYPES.stair;
      const down = here === TILE_TYPES.ladder;
      if (!climbTile && (up || down) && (towerFloor > 0 || up)) {
        climbedAt = clockMs;
        climbTile = { x: tx, y: ty };
        if (typeof api.onClimbTower === 'function') {
          try { api.onClimbTower(up ? 1 : -1); } catch (err) { console.error('[world] onClimbTower', err); }
        }
      }
    }

    // THE WARDEN'S LINE. Checked after the move, so being caught is about where
    // you ended up rather than where you set off from.
    if (puzzleSet() && patrolSees() && clockMs - caughtAt > 1500) {
      caughtAt = clockMs;
      slide = null;
      toast(worldArea === AREAS.peaks
        ? 'the Warden turns — and sees you'
        : 'a watchman turns — and sees you', PALETTE.bad);
      if (typeof api.onWardenCaught === 'function') {
        try { api.onWardenCaught(); } catch (err) { console.error('[world] onWardenCaught', err); }
      }
      const door = puzzleSet().door;
      player.setTile(door.x, door.y);
      snapCamera();
    }
    // ...and its undoing: three plates held at once.
    if (worldArea === AREAS.peaks && !reachesState().wardenBeaten
        && WARDEN.plates.every((pl) => plateHeld(pl.x, pl.y))) {
      if (typeof api.onWardenBeaten === 'function') {
        try { api.onWardenBeaten(); } catch (err) { console.error('[world] onWardenBeaten', err); }
      }
    }
    nearBuilding = adjacentBuilding();
    facingNode = build.isActive() ? null : targetNode();
    // Planting and growth readouts are their own guarded pass: a bad planting
    // record must not stop the player from moving.
    try {
      facingPlant = facingNode ? null : plantTarget();
      const f = player.facingTile();
      facingGrowth = build.isActive() ? null : plantingAt(f.x, f.y);
    } catch (err) {
      console.error('[world] planting update', err);
      facingPlant = null;
      facingGrowth = null;
    }

    // Gathering systems. Each is individually guarded: a bad particle must not
    // take the movement or the camera down with it.
    try {
      updateSwings();
      updateParticles(dtMs);
      updateShakes(dtMs);
    } catch (err) {
      console.error('[world] gather update', err);
    }

    // Respawns are checked here on the clock, never per tile draw.
    sweepAcc += dtMs;
    if (sweepAcc >= 500) {
      sweepAcc = 0;
      sweepHarvested();
      sweepPlantings();
    }

    // The drawn height chases the tile's, framerate-independently. Snapped at
    // the end so it actually arrives rather than approaching forever.
    {
      const want = liftAt(player.tileX(), player.tileY());
      const k = 1 - Math.pow(LIFT_EASE, dtMs / 1000);
      drawLift += (want - drawLift) * k;
      if (Math.abs(want - drawLift) < 0.05) drawLift = want;
    }

    /**
     * SMOOTH CAMERA FOLLOW (exponential lerp, framerate independent).
     *
     * 0.001 left the camera a long way behind: at 60fps it closes only ~11% of
     * the gap per frame, so it trails the scholar while she walks and then
     * drifts to a stop after she does. Combined with the pixel snap below, that
     * drift is what read as the world sliding underneath her. 1e-7 closes ~80%
     * a frame — still eased, still framerate-independent, but it sits on her.
     */
    const t = camTarget();
    const k = 1 - Math.pow(1e-7, dtMs / 1000);
    cam.x += (t.x - cam.x) * k;
    cam.y += (t.y - cam.y) * k;
    cam.x = clampCam(cam.x, view.w, WORLD_PX_W);
    cam.y = clampCam(cam.y, view.h, WORLD_PX_H, -topInset());

    for (let i = toasts.length - 1; i >= 0; i--) {
      toasts[i].age += dtMs;
      if (toasts[i].age >= TOAST_MS) toasts.splice(i, 1);
    }
  }

  /**
   * Corner brackets around the faced node, pulsing gently. This is the whole
   * tutorial for gathering: if it glows, you can hit it.
   */
  function drawNodeHighlight(ctx2, node, camX, camY, S, color) {
    const style = NODE_STYLE[node.nodeType] || NODE_STYLE.tree;
    const x = Math.round((node.x * TILE - camX) * S);
    const y = Math.round((node.y * TILE - camY) * S);
    const size = TILE * S;
    const arm = Math.max(2, Math.round(4 * S));
    const th = Math.max(1, Math.round(S / 2));
    const pulse = 0.45 + 0.3 * Math.sin(simMs / 190);
    const prev = ctx2.globalAlpha;
    ctx2.globalAlpha = pulse;
    ctx2.fillStyle = color || style.text || PALETTE.accent;
    // top-left, top-right, bottom-left, bottom-right
    ctx2.fillRect(x, y, arm, th);
    ctx2.fillRect(x, y, th, arm);
    ctx2.fillRect(x + size - arm, y, arm, th);
    ctx2.fillRect(x + size - th, y, th, arm);
    ctx2.fillRect(x, y + size - th, arm, th);
    ctx2.fillRect(x, y + size - arm, th, arm);
    ctx2.fillRect(x + size - arm, y + size - th, arm, th);
    ctx2.fillRect(x + size - th, y + size - arm, th, arm);
    ctx2.globalAlpha = prev;
  }

  /**
   * The sprite for a planting at its current stage.
   *
   * SPRITES3.saplings has authored art for the first three SAPLING_STAGES and
   * a deliberate null for the fourth: a mature planting is a wild tree in every
   * way that matters, so it borrows the tree tile rather than owning a fourth
   * near-identical grid.
   */
  function plantingSprite(rec) {
    const stage = (rec && rec.growth && rec.growth.stage) || SAPLING_STAGES[0].id;
    if (stage === MATURE_STAGE) return SPRITES.tiles.tree || null;
    const set = SPRITES3.saplings || null;
    return (set && set[stage]) || (set && set[SAPLING_STAGES[0].id]) || null;
  }

  /**
   * Four pips over a planting, one per SAPLING_STAGES entry, filled up to the
   * stage it has reached. This is the whole readout: waiting is only bearable
   * if you can see it moving.
   */
  function drawGrowthPips(ctx2, rec, camX, camY, S) {
    const g = rec && rec.growth;
    if (!g) return;
    const n = Math.max(1, g.stageCount || SAPLING_STAGES.length);
    const dot = 2;
    const gap = 1;
    const totalW = n * dot + (n - 1) * gap;
    const x0 = Math.round((rec.x * TILE + (TILE - totalW) / 2 - camX) * S);
    const y0 = Math.round((rec.y * TILE - 4 - camY) * S);
    ctx2.fillStyle = '#0d0f16';
    ctx2.fillRect(x0 - S, y0 - S, (totalW + 2) * S, (dot + 2) * S);
    for (let i = 0; i < n; i++) {
      ctx2.fillStyle = i <= (g.stageIndex || 0) ? PIP_ON : PIP_OFF;
      ctx2.fillRect(x0 + i * (dot + gap) * S, y0, dot * S, dot * S);
    }
  }

  /** "40m" / "2h 5m" / "ready" — short enough to sit over one tile. */
  function growthLabel(g) {
    if (!g) return '';
    if (g.mature) return 'ready';
    const mins = Math.max(1, Math.ceil(Number(g.minutesRemaining) || 0));
    if (mins < 60) return 'ready in ' + mins + 'm';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return 'ready in ' + h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function drawParticles(ctx2, camX, camY, S) {
    if (!particles.length) return;
    const prev = ctx2.globalAlpha;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const t = p.life / p.max;
      ctx2.globalAlpha = Math.max(0, Math.min(1, t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4));
      ctx2.fillStyle = p.color;
      ctx2.fillRect(
        Math.round((p.x - camX) * S),
        Math.round((p.y - camY) * S),
        p.size * S,
        p.size * S
      );
    }
    ctx2.globalAlpha = prev;
  }

  /** A 3px pixel bar over any node that has taken damage but is still standing. */
  function drawDepletionBars(ctx2, camX, camY, S) {
    if (!harvested.size) return;
    const barW = 12;
    const barH = 3;
    for (const e of harvested.values()) {
      if (e.respawnAt > 0) continue; // destroyed: the variant sprite says it all
      const def = GATHER_NODES[e.nodeType];
      const hits = (def && def.hits) || 3;
      if (!(e.hitsLeft > 0) || e.hitsLeft >= hits) continue;
      const x = Math.round((e.x * TILE + (TILE - barW) / 2 - camX) * S);
      const y = Math.round((e.y * TILE - 4 - camY) * S);
      const ratio = Math.max(0, Math.min(1, e.hitsLeft / hits));
      ctx2.fillStyle = '#0d0f16';
      ctx2.fillRect(x - S, y - S, (barW + 2) * S, (barH + 2) * S);
      ctx2.fillStyle = PALETTE.border;
      ctx2.fillRect(x, y, barW * S, barH * S);
      ctx2.fillStyle = ratio > 0.5 ? PALETTE.good : PALETTE.accent;
      ctx2.fillRect(x, y, Math.max(S, Math.round(barW * ratio) * S), barH * S);
    }
  }

  /**
   * A pulsing bolt over the scholar once energy is nearly gone. The full bar is
   * agent H's HUD; this is only the in-world tell that the next swing may fail.
   */
  function drawLowEnergy(ctx2, camX, camY, S) {
    const pl = state && state.player;
    if (!pl) return;
    const max = Number(pl.maxEnergy) || 0;
    const cur = Number(pl.energy);
    if (!(max > 0) || !Number.isFinite(cur)) return;
    if (cur / max >= 0.25) return;
    const spr = SPRITES.ui && SPRITES.ui.lowEnergy;
    if (!spr) return;
    const bob = Math.sin(simMs / 220) * 1.5;
    const x = Math.round((player.px + 5 - camX) * S);
    const y = Math.round((player.py - 11 + bob - camY) * S);
    const prev = ctx2.globalAlpha;
    ctx2.globalAlpha = 0.55 + 0.45 * Math.sin(simMs / 150);
    drawSprite(ctx2, spr, x, y, S);
    ctx2.globalAlpha = prev;
  }

  /** Keep a text run of pixel width `w` fully on screen. */
  function clampToCanvas(x, w) {
    const pad = 4;
    const max = Math.max(pad, canvas.width - w - pad);
    return Math.max(pad, Math.min(max, x));
  }

  /** Is the player standing inside the mountain chamber? */
  function playerInCave() {
    if (worldArea !== AREAS.home) return false;
    const tx = player.tileX();
    const ty = player.tileY();
    return tx >= CAVE.x && tx < CAVE.x + CAVE.w && ty >= CAVE.y && ty < CAVE.y + CAVE.h;
  }

  // How see-through the roof is, tweened so walking in and out fades rather
  // than snapping. 1 = solid rock overhead, 0 = fully lifted.
  let roofAlpha = 1;

  /**
   * The rock over the Stonemason's chamber.
   *
   * The chamber floor is real walkable tiles, so without this the cave reads as
   * an open-topped pit in the hillside. Drawing stone over it and fading that
   * out as you enter is what turns it into an interior you step INTO.
   */
  /**
   * HOW DARK IT IS RIGHT NOW, 0..1. Eased, so walking in fades rather than
   * snapping — the roof already does the same and the two must agree.
   */
  let darkAlpha = 0;

  /** The charms the scholar is wearing, from the server's copy of state. */
  function wornCharms() {
    const p = state && state.player;
    return (p && Array.isArray(p.charms)) ? p.charms : [];
  }

  /**
   * THE CAVE IS DARK, and a lantern is what makes it a room again.
   *
   * Bruno, 2026-08-31: "the cave should be dark, and with the lantern you can
   * craft equipped you should be able to see in a circular area around the
   * player in the darkness, like fire light."
   *
   * Drawn as a full-screen wash of near-black, with the light punched OUT of it
   * using `destination-out` — that is what gives a hard-edged pool of vision
   * rather than a bright patch floating on top of the dark. `drawLightPool`
   * then adds the warm firelight on top of the hole it just made.
   *
   * CAVE_DARKNESS is deliberately not 1. The Stonemason lives down here, and a
   * player who cannot see the way out of the room they walked into has been
   * punished rather than challenged: you can make out the walls, you just
   * cannot read the floor.
   */
  /** Scratch layer for the darkness. Rebuilt only when the canvas resizes. */
  let darkLayer = null;

  function drawDarkness(g, camX, camY, S) {
    const want = ((worldArea === AREAS.home && playerInCave()) || inWiseCave())
      ? CAVE_DARKNESS : 0;
    darkAlpha += (want - darkAlpha) * 0.14;
    if (Math.abs(darkAlpha - want) < 0.005) darkAlpha = want;
    if (darkAlpha <= 0.01) return;

    const w = g.canvas.width;
    const h = g.canvas.height;
    const radiusTiles = lightRadiusOf(wornCharms());

    // THE DARKNESS IS BUILT ON ITS OWN LAYER, then stamped over the world.
    //
    // The first version drew the black wash straight onto the game canvas and
    // punched the light out of it with `destination-out`. That composite does
    // not know what it is erasing: it removed the WORLD along with the wash, so
    // the lantern was a hole showing the empty page behind the map — a beam of
    // nothing rather than a lit room. Bruno: "now I cant see anything just a
    // beam of light."
    //
    // Punching the hole in a SEPARATE canvas and then drawing that canvas over
    // the world with the ordinary source-over is the whole fix. Inside the
    // circle the wash simply is not there, so the world beneath shows through
    // at full daylight.
    if (!darkLayer || darkLayer.width !== w || darkLayer.height !== h) {
      darkLayer = (typeof document !== 'undefined')
        ? Object.assign(document.createElement('canvas'), { width: w, height: h })
        : null;
    }
    if (!darkLayer) return;
    const d = darkLayer.getContext('2d');
    if (!d) return;

    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.globalAlpha = 1;
    d.clearRect(0, 0, w, h);
    d.fillStyle = '#05060c';
    d.fillRect(0, 0, w, h);

    // ONE POOL, AND IT IS THE ONE YOU CARRY. Every dark place in the game is
    // lit by the lantern and by nothing else — the summit cave included, since
    // its hearth was removed.
    const pools = [];
    if (radiusTiles > 0) {
      pools.push({
        x: (player.centerX() - camX) * S,
        // LIFTED WITH HER. A tile on the top terrace is drawn 48 world pixels
        // up the screen and so is she — but the lantern pool was centred on her
        // UNLIFTED position, so in the summit cave her light appeared three
        // tiles below her, outside the room she was standing in.
        y: (player.centerY() - camY - drawLift) * S,
        r: Math.max(1, radiusTiles * TILE * S),
      });
    }
    for (const pool of pools) {
      const cx = pool.x;
      const cy = pool.y;
      const r = pool.r;
      let grad = null;
      try {
        grad = d.createRadialGradient(cx, cy, 0, cx, cy, r);
      } catch (err) { grad = null; }
      if (grad) {
        // FULL lift across most of the pool, then a fast falloff. Inside the
        // lantern you should see as if it were day; the tint comes from the
        // warm pool drawn afterwards, not from leaving the room half-dark.
        grad.addColorStop(0, `rgba(0,0,0,${LIGHT_LIFT})`);
        grad.addColorStop(0.70, `rgba(0,0,0,${LIGHT_LIFT})`);
        grad.addColorStop(0.88, 'rgba(0,0,0,0.55)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        d.globalCompositeOperation = 'destination-out';
        d.fillStyle = grad;
        d.fillRect(cx - r, cy - r, r * 2, r * 2);
        d.globalCompositeOperation = 'source-over';
      }
    }

    // THE CAVE IS LIT BY WHAT YOU CARRY, AND BY NOTHING ELSE.
    //
    // It used to light itself: a `destination-out` wash lifted 90% of the dark
    // off the WHOLE room, with a warmer radial at the old man's hearth on top.
    // The reasoning was that arriving at the end of the Herald's errand without
    // a lantern and finding a black room with a voice in it is not the scene.
    //
    // Bruno, 2026-09-06: "the light from the lamp works correctly in the wise
    // man's cave, but there is also light in the area. remove that preexisting
    // lighting so that the only lighting is the one of the lamp around my
    // character." So the room wash and the hearth glow are gone, and the summit
    // cave now works exactly like the Stonemason's: one pool, and it is yours.
    //
    // The cost is real and deliberate — with no lantern the chamber is dark and
    // the Wise Man is a voice you cannot see. He still speaks; E still reaches
    // him. CAVE_DARKNESS is not 1, so it is gloom rather than pitch black.

    g.save();
    g.globalAlpha = darkAlpha;
    g.drawImage(darkLayer, 0, 0);
    g.restore();

    // The warm tint, over the now-visible ground. Gentle: the room is already
    // lit by the hole above, and this only makes the light look like fire.
    if (radiusTiles > 0) {
      drawLightPool(
        g, player.centerX(), player.centerY(), radiusTiles * TILE * 1.0,
        camX, camY, S,
        { alpha: 0.30 * darkAlpha, inner: 'rgba(255,196,120,0.22)', mid: 'rgba(255,158,72,0.14)' }
      );
    }
  }

  /** Test seam: how dark the screen is, and how far the lantern reaches. */
  function lightProbe() {
    return { darkness: darkAlpha, lightTiles: lightRadiusOf(wornCharms()) };
  }

  function drawCaveRoof(g, camX, camY, S) {
    // HOME ONLY. Outside the chamber `want` is 1, so with no guard this painted
    // the Stonemason's ceiling — a solid slab of stone tiles — onto whatever
    // happened to be at the same coordinates on the other map.
    if (!atHome()) { roofAlpha = 0; return; }
    const want = playerInCave() ? 0.14 : 1;
    // ~180ms to settle at 60fps, and snapped at the ends so it actually finishes.
    roofAlpha += (want - roofAlpha) * 0.18;
    if (Math.abs(roofAlpha - want) < 0.01) roofAlpha = want;
    if (roofAlpha <= 0.02) return;

    const spr = SPRITES.tiles.stone;
    g.save();
    g.globalAlpha = roofAlpha;
    for (let ty = CAVE.y; ty < CAVE.y + CAVE.h; ty += 1) {
      for (let tx = CAVE.x; tx < CAVE.x + CAVE.w; tx += 1) {
        // The mouth is left open at all times — a doorway you cannot see is a
        // doorway nobody finds.
        if (ty >= CAVE.mouthY && ty < CAVE.mouthY + 3 && tx < CAVE.x + 1) continue;
        drawSprite(g, spr,
          Math.round((tx * TILE - camX) * S),
          Math.round((ty * TILE - camY) * S), S);
      }
    }
    g.restore();
  }

  /**
   * A cliff face: the rock you see under a terrace edge.
   *
   * Painted rather than tiled. At six pixels tall a sprite would be mostly
   * clipped, and the two things that actually sell the drop are a lit lip along
   * the top and the shadow pooling at the bottom.
   */
  function drawCliffFace(g, px, py, h, S, tileId) {
    if (h <= 0) return;
    const w = TILE * S;
    const line = Math.max(1, Math.round(S));
    // A LADDER carries its art down the face — it is pinned to the rock and has
    // to reach the ground to read as one. A STAIR does not: Bruno, 2026-09-04,
    // "only 1 stair block and the snow, not 2 stair blocks". A flight drawn
    // down the face on top of the flight on the terrace read as two storeys of
    // steps for a single step up.
    const climb = tileId === TILE_TYPES.ladder ? SPRITES.tiles.ladder : null;
    if (climb) {
      g.save();
      g.beginPath();
      g.rect(px, py, w, h);
      g.clip();
      drawSprite(g, climb, px, py + h - TILE * S, S);
      if (h > TILE * S) drawSprite(g, climb, px, py + h - 2 * TILE * S, S);
      g.restore();
      // No lit lip and no cast shadow on a way up: it is a hole in the cliff,
      // not part of its face.
      return;
    }
    // REAL ROCK, NOT A GREY BAR. The face is the cliff TILE, clipped to the
    // height of the drop and bottom-aligned, so a terrace edge is made of the
    // same stone as everything else and gets its grain and its chipped
    // silhouette for free. A flat fill read as a shadow under a rug, which is
    // exactly how the first cut looked and why the mountain had no height.
    const spr = SPRITES.tiles.cliff;
    g.save();
    g.beginPath();
    g.rect(px, py, w, h);
    g.clip();
    if (spr) {
      // Two tiles deep, so a drop taller than one tile still has rock in it.
      drawSprite(g, spr, px, py + h - TILE * S, S);
      if (h > TILE * S) drawSprite(g, spr, px, py + h - 2 * TILE * S, S);
    } else {
      g.fillStyle = '#413c56';
      g.fillRect(px, py, w, h);
    }
    g.restore();
    // The lit lip along the top, where the terrace above catches the light...
    g.fillStyle = '#c9c0d8';
    g.fillRect(px, py, w, line);
    g.fillStyle = '#6b6688';
    g.fillRect(px, py + line, w, line);
    // ...the dark base where it meets the ground...
    g.fillStyle = '#241a2e';
    g.fillRect(px, py + h - line, w, line);
    // ...and the shadow the drop casts onto the ground below it. Without this
    // the face floats; with it the terrace has weight.
    const prev = g.globalAlpha;
    g.globalAlpha = 0.24;
    g.fillStyle = '#241a2e';
    g.fillRect(px, py + h, w, Math.round(3 * S));
    g.globalAlpha = prev;
  }

  /**
   * The edge of a terrace seen side-on. Narrow — it is the corner of the drop,
   * not the drop itself — but it is what turns "two kinds of ground" into "a
   * step up".
   */
  function drawCliffEdge(g, px, py, h, S, side) {
    const w = Math.max(2, Math.round(2 * S));
    const x = side === 'left' ? px : px - w;
    g.fillStyle = '#413c56';
    g.fillRect(x, py, w, TILE * S);
    g.fillStyle = side === 'left' ? '#6b6688' : '#241a2e';
    g.fillRect(x, py, Math.max(1, Math.round(S)), TILE * S);
    // and the lip of the drop, along the bottom, so the corner turns
    g.fillStyle = '#241a2e';
    g.fillRect(x, py + TILE * S, w, h);
  }

  function render() {
    if (!ctx) return;
    // Every world prompt drawn this frame, so a test can assert what the player
    // is actually being offered rather than guessing from state.
    lastPrompts.length = 0;
    const S = view.S;
    // THE CAMERA IS SNAPPED TO WHOLE SCREEN PIXELS, NOT WHOLE WORLD PIXELS.
    //
    // It used to be Math.round(cam.x), and the player was separately rounded in
    // player.draw. Two continuously-moving values rounded independently means
    // their DIFFERENCE flips by a world pixel whenever they cross their rounding
    // boundaries at different moments — a 1px world / 3px screen shudder every
    // frame while walking. Rounding here to a multiple of 1/S keeps every
    // world-space integer landing on an exact device pixel (so tiles stay crisp
    // and seamless) while leaving the camera free to move in sub-world-pixel
    // steps. Every draw site then rounds ONCE, in screen space, at the end.
    /**
     * ONE PIXEL GRID FOR EVERYTHING.
     *
     * The camera was snapped to whole DEVICE pixels while the scholar is drawn
     * at `Math.round((p.px - camX) * S)` — rounded again, separately. Two
     * independent roundings on the same frame means her offset from the centre
     * of the screen wobbles by a pixel as the camera crosses each grid line,
     * every few frames, forever. That is the shimmer that reads as small stops.
     *
     * Snapping the camera to whole WORLD pixels instead puts the camera and
     * everything drawn against it on the SAME grid, so the second rounding is
     * exact and she stops vibrating relative to the ground she is walking on.
     */
    const camX = Math.round(cam.x);
    const camY = Math.round(cam.y);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- tiles: only the visible window, never the whole map
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const ty0 = Math.max(0, Math.floor(camY / TILE));
    const tx1 = Math.min(WORLD_W - 1, Math.floor((camX + view.w) / TILE));
    /**
     * DRAW PAST THE BOTTOM OF THE VIEW, by as many rows as the tallest terrace
     * is lifted.
     *
     * Every tile on the mountain is painted `layer * LAYER_LIFT` further UP the
     * screen than its own row, so a row BELOW the viewport can land inside it.
     * This bound only counted rows whose unlifted position was on screen, so
     * those rows were never drawn and the bottom of the screen was left as bare
     * canvas — Bruno: "when I move up on the map in the reaches, the lower area
     * of the screen goes black." The higher you climbed the taller the black
     * band got, because more of what should have filled it was lifted.
     *
     * `topInset()` already makes the same allowance at the top of the view, for
     * the same reason and in the other direction.
     */
    const liftRows = world.layers
      ? Math.ceil((LAYER_LIFT * (LAYER_COUNT - 1)) / TILE)
      : 0;
    const ty1 = Math.min(WORLD_H - 1, Math.floor((camY + view.h) / TILE) + liftRows);
    const anyShake = shakes.length > 0;
    const hasLayers = !!world.layers;
    const anyHarvest = harvested.size > 0;
    const anyPlanting = plantings.size > 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      const rowBase = ty * WORLD_W;
      const rowY = Math.round((ty * TILE - camY) * S);
      for (let tx = tx0; tx <= tx1; tx++) {
        let px = Math.round((tx * TILE - camX) * S);
        let py = rowY;
        // THE MOUNTAIN'S HEIGHT. A tile on a terrace is drawn further up the
        // screen, and the strip it vacates is painted as the rock face you
        // would be looking at from below.
        if (hasLayers) {
          const lift = liftAt(tx, ty);
          if (lift) py = Math.round((ty * TILE - camY - lift) * S);
          // South face: the big one, the whole height of the drop. A ladder or
          // a stair carries its OWN art down the face, so the way up is drawn
          // as one continuous flight from the ground to the terrace instead of
          // a rung floating at the top of a cliff — which is exactly what Bruno
          // got stuck on.
          const drop = lift - liftAt(tx, ty + 1);
          if (drop > 0) drawCliffFace(ctx, px, py + TILE * S, drop * S, S, world.tiles[rowBase + tx]);
          // Side faces: a terrace edge running north-south has no southern
          // drop to paint, and without these the height simply does not read —
          // you get two fields of different ground with an invisible wall
          // between them, which is exactly how the first cut looked.
          const dl = lift - liftAt(tx - 1, ty);
          if (dl > 0) drawCliffEdge(ctx, px, py, dl * S, S, 'left');
          const dr = lift - liftAt(tx + 1, ty);
          if (dr > 0) drawCliffEdge(ctx, px + TILE * S, py, dr * S, S, 'right');
        }
        if (anyShake) {
          const o = shakeOffsetAt(tx, ty);
          px += o.x * S;
          py += o.y * S;
        }
        // A depleted node shows its harvested variant until it respawns.
        // A FELLED tree is different: the stump is drawn only until stumpUntil,
        // and after that the tile reverts to bare grass — never back to a tree,
        // because the terrain map still says "tree" there forever.
        let variant = null;
        let forceTile = -1;
        let over = null;
        const planted = anyPlanting ? plantingAt(tx, ty) : null;
        if (planted) {
          // A planting owns its tile: the ground is forced to bare ground (it
          // may be a former tree tile, or a stump that was replanted) and the
          // stage sprite is laid over it as an object. BARE GROUND IS PER MAP —
          // forcing grass here painted a green square into the snowfield.
          forceTile = groundTile();
          over = plantingSprite(planted);
        } else if (anyHarvest && isDepleted(tx, ty)) {
          const e = harvestAt(tx, ty);
          if (e && TIMBER_NODES.has(e.nodeType)) {
            // The terrain map still says "tree" here forever, so the ground is
            // forced to bare ground and the stump is laid over it as an object.
            // Once stumpUntil passes only the ground is left.
            forceTile = groundTile();
            const stumpGone = e.stumpUntil > 0 && clockMs >= e.stumpUntil;
            if (!stumpGone) over = SPRITES3.stump || harvestedSprite('tree');
          } else {
            variant = e ? harvestedSprite(e.nodeType) : null;
          }
        }
        // INSIDE THE KEEP, the room is this floor and everything around it is
        // the bailey, drawn from the ground map and greyed afterwards. You are
        // on one floor of one tower and the rest of Elderwatch is below you.
        const src = (towerFloor > 0 && groundWorld && !insideTower(tx, ty))
          ? groundWorld : world;
        if (variant) drawSprite(ctx, variant, px, py, S);
        else drawTile(ctx, forceTile >= 0 ? forceTile : src.tiles[rowBase + tx], tx, ty, px, py, S);
        if (over) drawSprite(ctx, over, px, py, S);
      }
    }

    // --- THE KEEP GREYS THE WORLD OUT AROUND IT.
    //
    // Painted after the ground and before anything standing on it, so the
    // bailey goes flat and cold while the room you are in keeps its colour. The
    // hole is the tower's circle, feathered at the wall so the edge reads as
    // distance rather than as a cut-out.
    if (towerFloor > 0) {
      const cx = (TOWER.cx * TILE + TILE / 2 - camX) * S;
      const cy = (TOWER.cy * TILE + TILE / 2 - camY) * S;
      const r = (TOWER.r + 1) * TILE * S;
      ctx.save();
      let hole = null;
      try { hole = ctx.createRadialGradient(cx, cy, r * 0.86, cx, cy, r); } catch { hole = null; }
      if (hole) {
        hole.addColorStop(0, 'rgba(26,26,34,0)');
        hole.addColorStop(1, 'rgba(26,26,34,0.82)');
        ctx.fillStyle = hole;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      ctx.fillStyle = 'rgba(26,26,34,0.82)';
      // The four bands outside the circle's bounding box.
      ctx.fillRect(0, 0, canvas.width, Math.max(0, cy - r));
      ctx.fillRect(0, cy + r, canvas.width, Math.max(0, canvas.height - (cy + r)));
      ctx.fillRect(0, Math.max(0, cy - r), Math.max(0, cx - r), r * 2);
      ctx.fillRect(cx + r, Math.max(0, cy - r), Math.max(0, canvas.width - (cx + r)), r * 2);
      ctx.restore();
    }

    // --- the tile the scholar is facing, when it can be harvested
    if (facingNode) drawNodeHighlight(ctx, facingNode, camX, camY, S);
    // --- ...or when a sapling would take root in it
    else if (facingPlant) {
      drawNodeHighlight(ctx, { x: facingPlant.x, y: facingPlant.y, nodeType: 'plant' },
        camX, camY, S, PALETTE.good);
    }

    // --- THE MOUNTAIN'S FLOOR MARKINGS: a held plate, and the Warden's line of
    //     sight. Both are painted on the GROUND, and so both go down BEFORE the
    //     depth-sorted pass — drawn after it they were laid over the scholar's
    //     feet, which read as her standing under the floor.
    if (puzzleSet()) {
      const at = (x, y) => ({
        px: Math.round((x * TILE - camX) * S),
        py: Math.round((y * TILE - camY - liftAt(x, y)) * S),
      });
      for (const pl of (towerFloor > 0 ? (puzzleSet().plates || []) : platesFor(worldArea))) {
        if (!plateHeld(pl.x, pl.y)) continue;
        const q = at(pl.x, pl.y);
        drawSprite(ctx, PLATE_DOWN_SPRITE, q.px, q.py, S);
      }
      for (const seer of patrolList()) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = worldArea === AREAS.peaks ? '#66c8d4' : '#ffd93d';
        for (let i = 1; i <= seer.sight; i += 1) {
          const c = at(seer.x + seer.dir * i, seer.y);
          ctx.fillRect(c.px, c.py, TILE * S, TILE * S);
        }
        ctx.restore();
      }
    }

    // --- buildings + player, depth sorted so the player walks behind tall walls
    const drawables = [];
    for (const b of buildings) {
      if (b.x + b.w < tx0 - 1 || b.x > tx1 + 1 || b.y + b.h < ty0 - 4 || b.y > ty1 + 1) continue;
      drawables.push({ sortY: b.sortY, kind: 'b', ref: b });
    }
    for (const n of npcs) {
      if (n.x < tx0 - 2 || n.x > tx1 + 2 || n.y < ty0 - 2 || n.y > ty1 + 2) continue;
      drawables.push({ sortY: n.sortY, kind: 'n', ref: n });
    }
    drawables.push({ sortY: player.sortY(), kind: 'p', ref: player });
    // THE MOUNTAIN'S STANDING OBJECTS SORT WITH HER.
    //
    // Boulders, the gear caches and the Warden used to be painted after the
    // whole sorted pass, which meant a boulder the scholar was standing SOUTH
    // of covered her from the shins up — she disappeared behind the very rock
    // she was pushing. They are objects in the room, so they queue up with
    // everything else in the room and are drawn back-to-front by foot position.
    if (puzzleSet()) {
      for (const b of boulderList()) {
        drawables.push({ sortY: (b.y + 1) * TILE - liftAt(b.x, b.y), kind: 'k', ref: b });
      }
      for (const g of GEAR_SITES) {
        if (hasGear(g.gear)) continue;
        drawables.push({ sortY: (g.y + 1) * TILE - liftAt(g.x, g.y), kind: 'g', ref: g });
      }
      const sites = questSitesFor(worldArea, towerFloor);
      for (const q of sites) {
        if (holdsItem(q.item)) continue;
        drawables.push({ sortY: (q.y + 1) * TILE - liftAt(q.x, q.y), kind: 'q', ref: q });
      }
      for (const w of patrolList()) {
        drawables.push({ sortY: (w.y + 1) * TILE - liftAt(w.x, w.y), kind: 'w', ref: w });
      }
      if (worldArea === AREAS.peaks) {
        drawables.push({
          sortY: (WISE_MAN.y + 1) * TILE - liftAt(WISE_MAN.x, WISE_MAN.y),
          kind: 'o', ref: WISE_MAN,
        });
        drawables.push({
          sortY: (CHEESECAKE_HERMIT.y + 1) * TILE
            - liftAt(CHEESECAKE_HERMIT.x, CHEESECAKE_HERMIT.y),
          kind: 'h', ref: CHEESECAKE_HERMIT,
        });
        const fire = { x: CHEESECAKE_HERMIT.x + 1, y: CHEESECAKE_HERMIT.y };
        drawables.push({
          sortY: (fire.y + 1) * TILE - liftAt(fire.x, fire.y),
          kind: 'f', ref: fire,
        });
      }
    }
    drawables.sort((a, b) => a.sortY - b.sortY);

    // Where a thing standing on the mountain is drawn, and the soft contact
    // shadow under it. One light, one direction — without the shadow a boulder
    // reads as a sticker on the snow rather than as a thing sitting on it.
    const mountainAt = (x, y, dy) => ({
      px: Math.round((x * TILE - camX) * S),
      py: Math.round((y * TILE - camY - liftAt(x, y) + (dy || 0)) * S),
    });
    const mountainShadow = (x, y, w) => {
      const q = mountainAt(x, y, 0);
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = '#241a2e';
      ctx.fillRect(q.px + Math.round((16 - w) / 2) * S, q.py + 13 * S, w * S, 2 * S);
      ctx.globalAlpha = prev;
    };

    for (const d of drawables) {
      if (d.kind === 'k') {
        mountainShadow(d.ref.x, d.ref.y, 12);
        const q = mountainAt(d.ref.x, d.ref.y, 0);
        drawSprite(ctx, BOULDER_SPRITE, q.px, q.py, S);
      } else if (d.kind === 'g') {
        // A small bob, so a thing worth crossing a mountain for does not read
        // as part of the scenery.
        mountainShadow(d.ref.x, d.ref.y, 8);
        const bob = Math.round(Math.sin(clockMs / 380 + d.ref.x) * 1.5);
        const q = mountainAt(d.ref.x, d.ref.y, bob - 3);
        drawSprite(ctx, GEAR_SPRITE, q.px, q.py, S);
      } else if (d.kind === 'q') {
        // The Standard has its own art; a key on a hook borrows the gear cache.
        mountainShadow(d.ref.x, d.ref.y, 8);
        const bob = Math.round(Math.sin(clockMs / 420 + d.ref.x) * 1.5);
        const p2 = mountainAt(d.ref.x, d.ref.y, bob - 3);
        // Each of the three has its own art. Drawn as a gear cache they were
        // three identical crates, and "the thing you came for" is the one
        // object on a map that must not look like scenery.
        const QUEST_SPRITE = {
          ashen_standard: STANDARD_SPRITE,
          codex: CODEX_SPRITE,
          burnt_requisition: PAGE_SPRITE,
          levy_roll: PAGE_SPRITE,
        };
        drawSprite(ctx, QUEST_SPRITE[d.ref.item] || GEAR_SPRITE, p2.px, p2.py, S);
      } else if (d.kind === 'w') {
        mountainShadow(d.ref.x, d.ref.y, 10);
        const q = mountainAt(d.ref.x, d.ref.y, -4);
        const frames = worldArea === AREAS.peaks ? WARDEN_FRAMES : WATCH_FRAMES;
        drawSprite(ctx, frames[Math.floor(clockMs / 320) % frames.length], q.px, q.py, S);
      } else if (d.kind === 'o') {
        const q = mountainAt(d.ref.x, d.ref.y, -2);
        drawSprite(ctx, WISEMAN_SPRITE, q.px, q.py, S);
      } else if (d.kind === 'f') {
        // The cookfire, drawn over its brazier tile so the pan sits on the
        // flames rather than beside them.
        const q = mountainAt(d.ref.x, d.ref.y, -1);
        drawSprite(ctx, FIRE_PAN_FRAMES[Math.floor(clockMs / 240) % FIRE_PAN_FRAMES.length],
          q.px, q.py, S);
      } else if (d.kind === 'h') {
        // The hermit, warming his hands. Borrows the Wise Man's art — two old
        // men in very large coats at either end of the same shelf is a joke
        // rather than an oversight — with a small fire of his own beside him.
        mountainShadow(d.ref.x, d.ref.y, 9);
        const q = mountainAt(d.ref.x, d.ref.y, -2);
        drawSprite(ctx, WISEMAN_SPRITE, q.px, q.py, S);
      } else if (d.kind === 'p') {
        // THE HULL GOES IN FRONT OF HER, and last.
        //
        // Behind her it was invisible — she read as walking on the water. In
        // front, nudged down 5px, the gunwale hides her legs from the shin
        // down, which is what sitting in a boat looks like. She is also drawn
        // STILL and without her contact shadow: a rowed scholar does not
        // paddle her feet, and there is no ground under her to cast onto.
        const afloat = worldArea === AREAS.home && riding();
        // She stands on the terrace she is on: the same lift the ground got, so
        // climbing a ladder visibly takes her up the rock face. EASED, not
        // snapped — see drawLift.
        const camLift = camY + drawLift;
        player.draw(ctx, camX, camLift, S, afloat ? { still: true, shadow: false } : null);
        if (afloat) {
          const bp = boatPixel();
          drawSprite(ctx, BOAT_SPRITE,
            Math.round((bp.px - camX) * S), Math.round((bp.py + 5 - camLift) * S), S);
        }
      } else if (d.kind === 'n') {
        const n = d.ref;
        const spr = NPC_SPRITES[n.id];
        if (spr) {
          drawSprite(ctx, spr,
            Math.round((n.px - camX) * S), Math.round((n.py - camY) * S), S);
        }
      } else {
        const b = d.ref;
        const spr = buildingSprite(b.buildingId);
        const sx = Math.round((b.x * TILE - camX) * S);
        // Sprites are drawn bottom-aligned to their footprint, so tall art
        // (observatory, workshop) overhangs upward.
        const sh = spr ? spr.h : b.h * TILE;
        const sy = Math.round(((b.y + b.h) * TILE - sh - camY) * S);
        drawSprite(ctx, spr, sx, sy, S);
      }
    }

    // --- gathering feedback, above the world but below the UI hints
    try {
      drawParticles(ctx, camX, camY, S);
      drawDepletionBars(ctx, camX, camY, S);
      drawLowEnergy(ctx, camX, camY, S);
    } catch (err) {
      console.error('[world] gather render', err);
    }

    // --- growth pips over the planting the scholar is facing. Its own try, so
    // a malformed planting cannot take the rest of the frame down with it.
    try {
      // Only while it is still growing. A mature planting is a tree with an
      // "E chop" prompt already over it, and a second row of text there just
      // collides with it — the pips exist to make WAITING legible.
      if (!build.isActive() && facingGrowth
        && !(facingGrowth.growth && facingGrowth.growth.mature)) {
        drawGrowthPips(ctx, facingGrowth, camX, camY, S);
      }
    } catch (err) {
      console.error('[world] planting render', err);
    }

    // --- the cave roof
    //
    // Drawn AFTER the player and the vendors, because it is above them: the
    // chamber is under the mountain, so standing outside you see rock, and
    // stepping in lifts it. The roof fades rather than vanishing, so you can
    // still tell you are underneath something.
    drawCaveRoof(ctx, camX, camY, S);
    // THE DARK. Painted after the roof and after everything else in the world,
    // so it dims the chamber, the vendor and the scholar alike.
    drawDarkness(ctx, camX, camY, S);

    // --- the storage hut, its keeper, and the boat. HOME ONLY.
    if (worldArea === AREAS.home) {
      const hut = hutState();
      const hx = Math.round((HUT.x * TILE - camX) * S);
      // The sprite overhangs its footprint upward, like every other building.
      const hy = Math.round(((HUT.y + HUT.h) * TILE - camY) * S) - HUT_SPRITES.shut.h * S;
      drawSprite(ctx, hut.opened ? HUT_SPRITES.open : HUT_SPRITES.shut, hx, hy, S);

      if (hut.opened) {
        // The keeper stands in his own doorway once he is out of it.
        const d = hutDoorTile();
        const kx = Math.round((d.x * TILE - camX) * S);
        const ky = Math.round((d.y * TILE - camY) * S) - 4 * S;
        const spr = NPC_SPRITES.hutkeeper;
        if (spr) drawSprite(ctx, spr, kx, ky, S);
      }

      // Moored only. While she is being rowed she is drawn with the scholar,
      // above, so that the two move as one and she stays underneath her.
      if (boatGranted() && !riding()) {
        const t = boatTile();
        const bx = Math.round((t.x * TILE - camX) * S);
        const by = Math.round((t.y * TILE - camY) * S);
        drawSprite(ctx, BOAT_SPRITE, bx, by, S);
      }
    }

    // --- the Herald, drawn over the world and under the UI. Not depth-sorted
    // with the NPCs: he is 24px tall and arrives at a fixed place, so sorting
    // him by foot position against 16px sprites would tuck him behind grass.
    const herald = worldArea === AREAS.home ? heraldState() : null;
    if (herald) {
      const hx = Math.round((herald.px - camX) * S);
      const hy = Math.round((herald.py - camY) * S) - 8 * S;
      // Legs swap on a timer while he moves, and stop on frame 0 when he does —
      // a horse at rest stands with its legs apart, not mid-stride.
      const frame = herald.arrived
        ? 0
        : (Math.floor(clockMs / HERALD.stepMs) % HERALD_FRAMES.length);
      drawSprite(ctx, HERALD_FRAMES[frame], hx, hy, S);
    }

    // --- build ghost
    build.draw(ctx, camX, camY, S);

    // --- interaction hint
    const ts = Math.max(1, Math.round(S / 2)); // text is drawn at half the world scale
    // --- the hut, and the boat.
    if (!build.isActive() && atHutDoor()) {
      const hut = hutState();
      const label = hut.opened ? 'E  speak to the Hutkeeper' : 'E  unlock the hut';
      const w = textWidth(label, ts);
      const d = hutDoorTile();
      const hx = clampToCanvas(
        Math.round((d.x * TILE + TILE / 2 - camX) * S - w / 2), w
      );
      const hy = Math.round((d.y * TILE - camY) * S) - 12 * S;
      drawTextOutlined(ctx, label, hx, hy, ts, PALETTE.accent, '#0d0f16');
      lastPrompts.push(label);
    }
    if (!build.isActive() && boatGranted() && !riding() && nextToBoat()) {
      const label = 'P  take the boat';
      const w = textWidth(label, ts);
      const t = boatTile();
      const bx = clampToCanvas(Math.round((t.x * TILE + TILE / 2 - camX) * S - w / 2), w);
      const by = Math.round((t.y * TILE - camY) * S) - 12 * S;
      drawTextOutlined(ctx, label, bx, by, ts, PALETTE.accent, '#0d0f16');
      lastPrompts.push(label);
    }
    if (!build.isActive() && atCrossing()) {
      const c = crossingHere();
      // A ROAD YOU CANNOT TAKE HAS TO SAY SO. The prompt was always "E take the
      // road east", including at a crossing the server was about to refuse — so
      // a shut road read as a broken one. Same rule as the ladder you have no
      // hooks for: it must say it is a ladder.
      const shut = c && ((c.needs === 'herald' && !(state && state.herald && state.herald.spoken))
        || (c.needs === 'wiseman' && !(state && state.wiseMan && state.wiseMan.spoken)));
      /**
       * NAME WHERE THE ROAD GOES.
       *
       * It used to say "take the road east" / "go back west" off the EDGE, so
       * the brand new road out of the Home Block read as "go back west" to a
       * map you had never seen. The edge is not the interesting fact; the
       * destination is. "Go back" only when you have actually been there —
       * `areaPos` remembers every map you have stood on.
       */
      const dest = (c && AREA_NAMES[c.to]) || 'the next region';
      const been = !!(c && state && state.areaPos && state.areaPos[c.to]);
      const label = shut
        ? 'the road is here, but you have no reason to walk it yet'
        : `E  ${been ? 'go back to' : 'travel to'} ${dest}`;
      const w = textWidth(label, ts);
      const cx = clampToCanvas(Math.round((player.centerX() - camX) * S - w / 2), w);
      const cy = Math.round((player.py - camY) * S) - 16 * S;
      drawTextOutlined(ctx, label, cx, cy, ts, shut ? PALETTE.textDim : PALETTE.accent, '#0d0f16');
      lastPrompts.push(label);
    }
    // --- what a quest item on the ground offers, and what a locked door wants.
    //     Neither belongs to the mountain, so both sit outside its block.
    if (!build.isActive()) {
      const q = questSiteInReach();
      if (q) {
        const def = QUEST_ITEMS[q.item] || { name: q.item };
        const label = `E  take ${def.name}`;
        const w = textWidth(label, ts);
        const qx = clampToCanvas(
          Math.round((q.x * TILE + TILE / 2 - camX) * S - w / 2), w
        );
        const qy = Math.round((q.y * TILE - camY - liftAt(q.x, q.y)) * S) - 12 * S;
        drawTextOutlined(ctx, label, qx, qy, ts, PALETTE.accent, '#0d0f16');
        lastPrompts.push(label);
      }
      const lock = lockHere();
      const f = player.facingTile();
      if (lock && lock.x === f.x && lock.y === f.y && !doorOpened()) {
        const def = QUEST_ITEMS[lock.item] || { name: lock.item };
        const label = holdsItem(lock.item)
          ? `E  turn the ${def.name}`
          : `locked — it wants the ${def.name}`;
        const w = textWidth(label, ts);
        const lx = clampToCanvas(
          Math.round((lock.x * TILE + TILE / 2 - camX) * S - w / 2), w
        );
        const ly = Math.round((lock.y * TILE - camY - liftAt(lock.x, lock.y)) * S) - 12 * S;
        drawTextOutlined(ctx, label, lx, ly, ts,
          holdsItem(lock.item) ? PALETTE.accent : PALETTE.textDim, '#0d0f16');
        lastPrompts.push(label);
      }
      const winch = switchInReach();
      if (winch) {
        const label = switchThrown(winch.id) ? 'the winch is thrown' : winch.prompt;
        const w2 = textWidth(label, ts);
        const wx = clampToCanvas(
          Math.round((winch.x * TILE + TILE / 2 - camX) * S - w2 / 2), w2
        );
        const wy = Math.round((winch.y * TILE - camY - liftAt(winch.x, winch.y)) * S) - 12 * S;
        drawTextOutlined(ctx, label, wx, wy, ts,
          switchThrown(winch.id) ? PALETTE.textDim : PALETTE.accent, '#0d0f16');
        lastPrompts.push(label);
      }
    }

    // --- the mountain's prompts
    if (!build.isActive() && worldArea === AREAS.peaks) {
      const g = gearInReach();
      if (g) {
        const def = REACHES_GEAR[g.gear] || { name: g.gear };
        const label = `E  take the ${def.name}`;
        const w = textWidth(label, ts);
        const gx = clampToCanvas(
          Math.round((g.x * TILE + TILE / 2 - camX) * S - w / 2), w
        );
        const gy = Math.round((g.y * TILE - camY - liftAt(g.x, g.y)) * S) - 12 * S;
        drawTextOutlined(ctx, label, gx, gy, ts, PALETTE.accent, '#0d0f16');
        lastPrompts.push(label);
      } else {
        const f = player.facingTile();
        const b = boulderAt(f.x, f.y);
        if (b) {
          const label = 'E  put your shoulder to it';
          const w = textWidth(label, ts);
          const bx = clampToCanvas(
            Math.round((b.x * TILE + TILE / 2 - camX) * S - w / 2), w
          );
          const by = Math.round((b.y * TILE - camY - liftAt(b.x, b.y)) * S) - 12 * S;
          drawTextOutlined(ctx, label, bx, by, ts, PALETTE.accent, '#0d0f16');
          lastPrompts.push(label);
        }
      }
      // THE ROAD EAST HAS NO PROMPT OF ITS OWN. It used to name itself and
      // where it went, which was right while it was a dead end — but it ends at
      // a crossing now, and the crossing's own "E take the road east" was
      // already there. Two labels over one tile is one label too many.
      // A ladder you cannot climb has to SAY it is a ladder, or it reads as
      // decoration and the mountain reads as a dead end.
      const f2 = player.facingTile();
      if (isClimbTile(f2.x, f2.y) && tileAtSafe(f2.x, f2.y) === TILE_TYPES.ladder && !hasGear('hooks')) {
        const label = 'a ladder — you have nothing to grip the rungs with';
        const w = textWidth(label, ts);
        const lx = clampToCanvas(
          Math.round((f2.x * TILE + TILE / 2 - camX) * S - w / 2), w
        );
        const ly = Math.round((f2.y * TILE - camY - liftAt(f2.x, f2.y)) * S) - 12 * S;
        drawTextOutlined(ctx, label, lx, ly, ts, PALETTE.textDim, '#0d0f16');
        lastPrompts.push(label);
      }
    }
    if (!build.isActive() && atWiseMan()) {
      const label = 'E  speak to the Wise Man';
      const w = textWidth(label, ts);
      const cx = clampToCanvas(Math.round((WISE_MAN.x * TILE + TILE / 2 - camX) * S - w / 2), w);
      const cy = Math.round((WISE_MAN.y * TILE - camY) * S) - 14 * S;
      drawTextOutlined(ctx, label, cx, cy, ts, PALETTE.accent, '#0d0f16');
      lastPrompts.push(label);
    }
    if (!build.isActive() && riding()) {
      const label = shoreBesideBoat() ? 'L  cast a line   ·   P  step ashore' : 'L  cast a line';
      const w = textWidth(label, ts);
      // Anchored to the boat, not to BOAT — the constant is where she was
      // FIRST tied up, so the prompt used to stay behind on the far bank.
      const bp = boatPixel();
      const bx = clampToCanvas(
        Math.round((bp.px + TILE / 2 - camX) * S - w / 2), w
      );
      const by = Math.round((bp.py - camY) * S) - 12 * S;
      drawTextOutlined(ctx, label, bx, by, ts, PALETTE.accent, '#0d0f16');
      lastPrompts.push(label);
    }

    if (hermitInReach()) {
      const label = 'E  speak to the man with the fire';
      const w = textWidth(label, ts);
      const kx = clampToCanvas(
        Math.round((CHEESECAKE_HERMIT.x * TILE + TILE / 2 - camX) * S - w / 2), w
      );
      const ky = Math.round(
        (CHEESECAKE_HERMIT.y * TILE - camY - liftAt(CHEESECAKE_HERMIT.x, CHEESECAKE_HERMIT.y)) * S
      ) - 14 * S;
      drawTextOutlined(ctx, label, kx, ky, ts, PALETTE.accent, '#0d0f16');
      lastPrompts.push(label);
    }

    // --- the Herald's prompt, so you know he can be spoken to at all.
    // Drawn HERE, after `ts` exists — it was above the sprite at first, which
    // parses fine and throws on the first frame the rider is in reach.
    if (heraldInReach()) {
      const label = 'E  speak to the rider';
      const w = textWidth(label, ts);
      const hx = clampToCanvas(
        Math.round((HERALD.stopX * TILE + TILE / 2 - camX) * S - w / 2), w
      );
      const hy = Math.round((HERALD.stopY * TILE - camY) * S) - 14 * S;
      drawTextOutlined(ctx, label, hx, hy, ts, PALETTE.accent, '#0d0f16');
      lastPrompts.push(label);
    }

    if (!build.isActive() && facingNode && !player.isSwinging()) {
      // The gold "E chop" only appears when the tool for this node is IN THE
      // SELECTED slot. In the other slot gets a dim hint naming the one key
      // that fixes it; in the bag gets the generic equip reminder; not owned
      // at all gets a dim note saying what it would take.
      const ready = nodeReady(facingNode);
      const verb = GATHER_VERB[facingNode.nodeType] || 'gather';
      const tname = requirementNameFor(facingNode.nodeType);
      // A gear node never says "equip" or "press 2": there is nothing to equip
      // and no slot it could go in. Either you have the thing or you do not.
      const label = ready ? ('E  ' + verb)
        : isGearNode(facingNode.nodeType)
          ? ('needs the ' + tname)
          : stowedToolFor(facingNode.nodeType)
            ? ('press ' + stowedSlotNumber() + ' for your ' + tname)
            : ownsToolFor(facingNode.nodeType) ? ('equip your ' + tname + '  (1 / 2)')
              : ('needs ' + (/^[aeiou]/.test(tname) ? 'an ' : 'a ') + tname);
      const w = textWidth(label, ts);
      const hx = clampToCanvas(
        Math.round((facingNode.x * TILE + TILE / 2 - camX) * S - w / 2), w
      );
      const hy = Math.round((facingNode.y * TILE - camY) * S) - 8 * S;
      drawTextOutlined(ctx, label, hx, hy, ts,
        ready ? PALETTE.accent : PALETTE.textDim, '#0d0f16');
      lastPrompts.push(label);
    }
    // The plant prompt, and the growth readout that replaces it once something
    // is in the ground. Guarded: new text passes are where frames go to die.
    try {
      if (!build.isActive() && !player.isSwinging() && facingGrowth
        && !(facingGrowth.growth && facingGrowth.growth.mature)) {
        const g = facingGrowth.growth;
        const label = growthLabel(g);
        if (label) {
          const w = textWidth(label, ts);
          const hx = clampToCanvas(
            Math.round((facingGrowth.x * TILE + TILE / 2 - camX) * S - w / 2), w
          );
          // Above the pip row (which sits at -4), clear of it by a full line.
          const hy = Math.round((facingGrowth.y * TILE - camY) * S) - 12 * S;
          drawTextOutlined(ctx, label, hx, hy, ts, PALETTE.textDim, '#0d0f16');
        }
      } else if (!build.isActive() && facingPlant && !player.isSwinging()) {
        // E is only offered when it is not already spoken for by a building the
        // scholar happens to be standing beside; P always plants.
        const stock = seedStock();
        const what = stock.saplings > 0 ? 'sapling' : 'seedpod';
        const key = nearBuilding ? 'P' : 'E';
        const label = key + '  plant ' + what;
        const w = textWidth(label, ts);
        const hx = clampToCanvas(
          Math.round((facingPlant.x * TILE + TILE / 2 - camX) * S - w / 2), w
        );
        const hy = Math.round((facingPlant.y * TILE - camY) * S) - 8 * S;
        drawTextOutlined(ctx, label, hx, hy, ts, PALETTE.good, '#0d0f16');
        lastPrompts.push(label);
      }
    } catch (err) {
      console.error('[world] plant prompt', err);
    }
    // The Herald wins over a building prompt when both are in reach: E already
    // prefers him, so showing both would offer a choice the key does not give.
    if (!build.isActive() && !facingNode && nearBuilding && !heraldInReach()) {
      const label = 'E  ' + String(nearBuilding.buildingId).replace(/_/g, ' ');
      const w = textWidth(label, ts);
      // Anchored to the COUNTER, not the footprint. The Stonemason's mountain
      // is anchored two tiles up in the rock, so a footprint-anchored prompt
      // floated in the hillside above a player standing in his cave.
      const nb = counterRect(nearBuilding.buildingId, nearBuilding.x, nearBuilding.y, nearBuilding);
      const hx = clampToCanvas(
        Math.round(((nb.x + nb.w / 2) * TILE - camX) * S - w / 2), w
      );
      const hy = Math.round(((nb.y + nb.h) * TILE - camY) * S) + 2 * S;
      drawTextOutlined(ctx, label, hx, hy, ts, PALETTE.accent, '#0d0f16');
    }

    // --- floating toasts. Newest sits closest to its anchor and older ones
    // are pushed up by their real height, so multi-line messages never overlap.
    const lineH = 9 * ts;
    let stack = 0;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      const p = t.age / TOAST_MS;
      const rise = 22 * p;
      const alpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      const lines = t.lines && t.lines.length ? t.lines : [t.text];
      const blockTop = Math.round((t.y - rise - camY) * S) - stack - (lines.length - 1) * lineH;
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      for (let li = 0; li < lines.length; li++) {
        const w = textWidth(lines[li], ts);
        const sx = clampToCanvas(Math.round((t.x - camX) * S - w / 2), w);
        drawTextOutlined(ctx, lines[li], sx, blockTop + li * lineH, ts, t.color, '#0d0f16');
      }
      ctx.globalAlpha = prev;
      stack += lines.length * lineH + 3 * ts;
    }
  }

  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    try {
      if (!lastTs) lastTs = ts;
      let dt = ts - lastTs;
      lastTs = ts;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > 250) dt = 250; // tab was backgrounded
      acc += dt;
      let steps = 0;
      while (acc >= STEP_MS && steps < 5) {
        update(STEP_MS, ts);
        acc -= STEP_MS;
        steps++;
      }
      if (steps === 5) acc = 0;
      render();
    } catch (err) {
      // A single exception must never kill the demo.
      console.error('[world] frame error', err);
    }
  }

  function start() {
    if (running) return;
    resize();
    snapCamera();
    bindListeners();
    running = true;
    lastTs = 0;
    acc = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function destroy() {
    stop();
    unbindListeners();
    input.dispose();
  }

  // Size the canvas immediately so a pre-start render is not garbage.
  resize();
  snapCamera();

  // One deliberate handle for the smoke harness. The browser suites drive the
  // real app and have no other way to ask the renderer what it is doing — which
  // is how a finished feature wired to nothing passed every suite before. Every
  // member of `api` used through it is a read-only accessor.
  if (typeof window !== 'undefined') window.__sqWorld = api;

  return api;
}

// Re-exported so other agent-B modules and the integrator share one source.
export { footprintOf, buildingRect, checkPlacement };
export default createGame;
