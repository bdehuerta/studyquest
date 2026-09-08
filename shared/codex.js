// shared/codex.js — THE CODEX: a ledger of what you have actually seen.
//
// Bruno, on what should be behind the Elderwatch guardroom's barred door: "the
// codex ... a menu like the inventory or the quests, this menu will keep a list
// of items that you discover and quests you make, like a journal."
//
// TWO RULES DECIDE THE WHOLE DESIGN.
//
// 1. IT IS NOT A MANUAL. Nothing is listed until you have met it. An unfound
//    entry is drawn as `??????` so the gap is visible — the empty slots are the
//    point, because a blank you can see is an invitation and a wall of text is
//    homework. Every entry carries flavour, not just numbers: the Codex is a
//    reward for exploring, and the place a returning player goes to remember a
//    rule the game never says out loud.
//
// 2. DISCOVERY IS DERIVED, NOT REPORTED. Every entry owns a predicate over the
//    save, and a sweep unions whatever is true right now into a set that is
//    never unlearned. The alternative was a `codex.record(...)` call at each of
//    the seven places materials are granted, five where buildings are raised,
//    and so on for every category — which is exactly the shape of bug this
//    project keeps finding: a feature wired to six of its seven sites, passing
//    every test because nothing throws at the seventh. A predicate cannot be
//    forgotten at a call site, because it has no call sites.
//
//    The high-water mark matters: `materials.ironwood > 0` is true while you
//    hold some and false the moment you spend the last one. KNOWN is not HAVE.
//    Once swept in, an entry stays.
//
// The `rule` category is the one that is not a thing you can hold. Those are
// the game's invisible mechanics — stamina comes back, trees do not, blueprints
// gate the bench, the gates want study and not coins — each unlocked by the
// moment a player would first want it explained.

import {
  MATERIAL_IDS, QUEST_ITEMS, AREA_NAMES, AREAS,
  TOOL_IDS, GADGET_IDS, BUILDING_IDS, NPC_AT_BUILDING,
} from './constants.js';
import { MATERIALS, BUILDINGS, GADGETS, TOOLS } from './recipes.js';

/* ============================================================= small helpers
 * Every predicate is handed the whole save and must survive a MISSING FIELD:
 * these run against saves written before the Codex existed, and one `undefined`
 * dereference in a sweep that runs on every persist would take the game down.
 */
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const count = (v, id) => Number(obj(v)[id]) > 0;
/** Owned, whether the list holds bare ids or `{ id }` records. */
const owns = (list, id) => arr(list).some((e) => (e && typeof e === 'object' ? e.id : e) === id);

/* =================================================================== MATERIALS
 * Names, rarities and colours already live in recipes.js. What the Codex adds
 * is the half a sentence that makes a material a THING rather than a row.
 */
const MATERIAL_FLAVOUR = {
  ironwood: 'Cut from the black-barked trees that will not grow back. Every plank in the '
    + 'Home Block is somebody\'s decision not to plant a sapling.',
  chalkstone: 'Soft enough to write with, hard enough to build with. The Stonemason claims '
    + 'both uses are the same use.',
  copperwire: 'Drawn thin and coiled. Nobody in the Home Block remembers who drew it.',
  sunfiber: 'Pale grass that keeps the warmth of the afternoon it was cut in. Costly to '
    + 'gather and impossible to store badly.',
  lenscrystal: 'Ground flat on one face by water, by accident, over a very long time. The '
    + 'Observatory is built around four of them.',
  runeplate: 'A palm of grey metal with a mark on it that is not in any alphabet the Archive '
    + 'has. It is warm on the marked side.',
  voidshard: 'A piece of somewhere with no light in it. Holding one, you notice you have '
    + 'stopped hearing the room.',
  heartwood: 'The dense middle of an old trunk. One tree gives it once.',
  wild_tuna: 'Silver, heavy, and pulled from the lake by the mountain. Sells better than it '
    + 'has any right to.',
  resin: 'Amber, still slightly soft. Something small is in this one.',
  seedpod: 'It rattles. Planted, it becomes a tree in two hours and a stump forever after '
    + 'that, so plant it somewhere you meant to.',
};

/* ====================================================================== PLACES
 * Regions, and the two rooms worth their own entry because they are the only
 * indoor spaces with rules of their own.
 */
const PLACES = [
  {
    id: AREAS.home, name: AREA_NAMES.home,
    flavour: 'Grass, a lake, a road east, and a wall of trees and rock around the whole of '
      + 'it. Everything you own started here.',
    known: (s) => true,
  },
  {
    id: AREAS.peaks, name: AREA_NAMES.peaks,
    flavour: 'The road climbs and the trees go from green to black. Terraces, ice you cannot '
      + 'stop on, a labyrinth of rimewall, and the Wise Man at the top of it.',
    // Carrying the mountain's gear counts. You cannot hold the crampons without
    // having been up there for them, and a scholar who walked off the peak
    // straight into Elderwatch has no `areaPos.peaks` to prove it with.
    known: (s) => obj(s.player).area === AREAS.peaks
      || AREAS.peaks in obj(s.areaPos)
      || arr(obj(s.reaches).gear).length > 0,
  },
  {
    id: AREAS.elderwatch, name: AREA_NAMES.elderwatch,
    flavour: 'A square of wall on a flat cold moor, with a barred gate and a round keep in '
      + 'the middle of it. Nothing here climbs. What stops you is people.',
    known: (s) => obj(s.player).area === AREAS.elderwatch || AREAS.elderwatch in obj(s.areaPos),
  },
  {
    id: 'summit_cave', name: 'The Summit Cave',
    flavour: 'Dark enough that the lantern is not optional. The Wise Man has been in here '
      + 'long enough to stop minding.',
    known: (s) => obj(s.wiseMan).found === true,
  },
  {
    id: 'the_keep', name: 'The Keep of Elderwatch',
    flavour: 'Four floors of one round tower, climbed a stair at a time: the Guardroom, the '
      + 'Cistern, the Armoury, and the Hall of Keeping at the top.',
    known: (s) => Number(obj(s.tower).floor) > 0 || count(s.questItems, 'brass_key'),
  },
];

/* ====================================================================== PEOPLE
 * Everyone who says something. `known` is the flag that already records having
 * spoken to them, so nothing new has to be written down when you do.
 */
const PEOPLE = [
  {
    id: 'exchange', name: 'The Exchange Clerk',
    flavour: 'Turns Shards into Florins at a rate he describes as fair and nobody else does.',
    known: (s) => owns(s.buildings, 'exchange_post'),
  },
  {
    id: 'woodsman', name: 'The Woodsman',
    flavour: 'Waited years for a Blue Key and did not once consider cutting the door down.',
    known: (s) => arr(s.vendorsUnlocked).indexOf('woodsman') !== -1,
  },
  {
    id: 'stonemason', name: 'The Stonemason',
    flavour: 'Works out of a cave under a mountain that is also, as far as the game is '
      + 'concerned, his building.',
    known: (s) => arr(s.vendorsUnlocked).indexOf('stonemason') !== -1,
  },
  {
    id: 'hutkeeper', name: 'The Hutkeeper',
    flavour: 'Was locked in a storage hut in the north-east woods. Gave you the boat and did '
      + 'not explain the hut.',
    known: (s) => obj(s.hut).spoken === true,
  },
  {
    id: 'herald', name: 'The Herald',
    flavour: 'Arrives at level twenty with an errand and no intention of running it himself. '
      + 'Points east, at a mountain.',
    known: (s) => obj(s.herald).spoken === true,
  },
  {
    id: 'wiseman', name: 'The Wise Man of the Mountain',
    flavour: 'At the back of the summit cave. Knew about the Standard, and knew that the '
      + 'garrison had stopped asking what it was.',
    known: (s) => obj(s.wiseMan).spoken === true,
  },
  {
    id: 'rime_warden', name: 'The Rime Warden',
    flavour: 'Not a person so much as a beat, walked back and forth across the one route up. '
      + 'Three plates held at once and it breaks.',
    known: (s) => obj(obj(s.reaches).warden).beaten === true
      || obj(s.player).area === AREAS.peaks,
  },
  {
    id: 'the_watch', name: 'The Watch of Elderwatch',
    flavour: 'Four of them in the bailey and more up the tower, walking a ring around a thing '
      + 'none of them could name.',
    known: (s) => obj(s.player).area === AREAS.elderwatch || AREAS.elderwatch in obj(s.areaPos),
  },
];

/* ======================================================================= RULES
 * THE THINGS THE GAME NEVER SAYS OUT LOUD.
 *
 * Each unlocks at the moment a player first has the question, not at the moment
 * it first becomes relevant — you learn that trees are permanent by felling one
 * and finding a stump, so that is when the page appears to explain it.
 */
const RULES = [
  {
    id: 'stamina', name: 'Stamina comes back',
    flavour: 'It regenerates on its own, in real time, whether the game is open or not. '
      + 'There is nothing to buy and nothing to wait at. Buildings raise the ceiling.',
    known: (s) => Number(obj(s.player).energy) < Number(obj(s.player).maxEnergy),
  },
  {
    id: 'trees', name: 'Trees do not grow back',
    flavour: 'A felled tree leaves a stump, and the stump is permanent. The only way to have '
      + 'more trees is to buy a sapling and plant one — which takes two hours and does work.',
    known: (s) => Number(obj(s.lifetime).treesFelled) > 0,
  },
  {
    id: 'blueprints', name: 'Blueprints gate the bench',
    flavour: 'Knowing the materials is not knowing the recipe. The bench will only make what '
      + 'you hold the blueprint for; the rest are bought, found, or taught.',
    known: (s) => arr(s.blueprints).length > 0,
  },
  {
    id: 'gates', name: 'The gates want study, not coins',
    flavour: 'Region thresholds are read off lifetime study minutes. No amount of Florins '
      + 'opens one, and no amount of Florins ever will.',
    known: (s) => Number(obj(s.lifetime).studyMinutes) > 0,
  },
  {
    id: 'boxes', name: 'Studying pays Dark Boxes',
    flavour: 'Real work pays Boxes. Boxes pay Shards. Shards buy Florins, expensively. '
      + 'Florins themselves come from quests, chests and selling — never from studying.',
    known: (s) => Number(obj(s.player).darkBoxes) > 0
      || Number(obj(s.lifetime).tasksCompleted) > 0,
  },
  {
    id: 'one_hand', name: 'Only the selected hand acts',
    flavour: 'Two slots, one of them live. 1 and 2 choose; E is the only key that uses. The '
      + 'tool in the other hand is carried, not held.',
    known: (s) => arr(obj(s.player).equipped).some(Boolean),
  },
];

/* ================================================================== the catalogue */

function fromTable(category, ids, table, extra) {
  return ids
    .filter((id) => table[id])
    .map((id) => ({
      id, category,
      name: table[id].name || id,
      flavour: table[id].desc || '',
      ...extra(id),
    }));
}

/**
 * EVERY ENTRY THE CODEX CAN EVER HOLD, in the order it is shown.
 *
 * Categories are ordered by how early a player meets them, not alphabetically:
 * you have materials before you have buildings and places before you have
 * relics, so the sections fill roughly top to bottom.
 */
export const CODEX_ENTRIES = Object.freeze([
  ...fromTable('material', MATERIAL_IDS.concat(['heartwood', 'resin', 'seedpod']), MATERIALS,
    (id) => ({
      flavour: MATERIAL_FLAVOUR[id] || '',
      rarity: MATERIALS[id].rarity,
      color: MATERIALS[id].color,
      symbol: MATERIALS[id].symbol,
      known: (s) => count(s.materials, id),
    })),
  ...fromTable('building', BUILDING_IDS, BUILDINGS, (id) => ({
    known: (s) => owns(s.buildings, id) || owns(s.pendingBuildings, id),
  })),
  ...fromTable('tool', TOOL_IDS, TOOLS, (id) => ({
    known: (s) => owns(s.tools, id)
      || owns(obj(s.player).gatherTools, id)
      || arr(obj(s.player).equipped).some((r) => r && r.id === id),
  })),
  ...fromTable('gadget', GADGET_IDS, GADGETS, (id) => ({
    known: (s) => count(s.gadgets, id),
  })),
  ...PLACES.map((p) => ({ ...p, category: 'place' })),
  ...PEOPLE.map((p) => ({ ...p, category: 'person' })),
  ...Object.keys(QUEST_ITEMS).map((id) => ({
    id, category: 'relic',
    name: QUEST_ITEMS[id].name,
    flavour: QUEST_ITEMS[id].desc,
    color: QUEST_ITEMS[id].color,
    symbol: QUEST_ITEMS[id].symbol,
    known: (s) => count(s.questItems, id),
  })),
  ...RULES.map((r) => ({ ...r, category: 'rule' })),
  // THE REVEAL, as an entry. It unlocks on holding both halves — which is the
  // same moment the panel first opens, so the first thing a player ever reads
  // in the Codex is the reason they can read it at all.
  Object.freeze({
    id: 'ranons_plan', category: 'rule', name: "Ranon's Masterplan",
    flavour: 'He did not lose the Ashen Standard, and he did not burn it — a burnt banner is '
      + 'a story people tell. He filed it, in a fort on a cold moor, and then spent forty '
      + 'years posting to that fort only men who would not ask what they were guarding. The '
      + 'Levy could never be raised because the thing that raises it was never missing. It '
      + 'was catalogued.',
    known: (s) => hasCodexBook(s) && hasRing(s),
  }),
  /**
   * AND WHAT YOU DID WITH IT. Written into the Rules of the World because that
   * is what it is — not a plot point but a fact about how this place works, and
   * one the player established personally.
   */
  Object.freeze({
    id: 'the_hand_that_signs', category: 'rule', name: 'The Hand That Signs',
    flavour: 'Ranon kept twelve families nine miles apart for forty years using nothing '
      + 'heavier than a signature, and you brought them back together in eleven days using '
      + 'the same one. The paper did not care either time; it went where it was pointed. '
      + 'Ilsa said she would think hard about who is pointing it, and then said goodnight.',
    known: (s) => !!obj(obj(s).farlands).recall,
  }),
]);

/** The sections, in display order, with the heading each one wears. */
export const CODEX_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'material', name: 'Materials', blurb: 'What the world is made of.' }),
  Object.freeze({ id: 'building', name: 'Buildings', blurb: 'What you have raised.' }),
  Object.freeze({ id: 'tool', name: 'Tools', blurb: 'What you carry.' }),
  Object.freeze({ id: 'gadget', name: 'Gadgets', blurb: 'What you spend.' }),
  Object.freeze({ id: 'place', name: 'Places', blurb: 'Where you have been.' }),
  Object.freeze({ id: 'person', name: 'People', blurb: 'Who you have met.' }),
  Object.freeze({ id: 'relic', name: 'Relics', blurb: 'What the story is about.' }),
  Object.freeze({ id: 'rule', name: 'Rules of the World', blurb: 'What nobody tells you.' }),
]);

/** Every id the Codex knows about, for the contract checks. */
export const CODEX_ENTRY_IDS = Object.freeze(CODEX_ENTRIES.map((e) => `${e.category}:${e.id}`));

/** The key an entry is stored under. Category-scoped: a material and a place may share a name. */
export function codexKey(entry) {
  return `${entry.category}:${entry.id}`;
}

/**
 * SWEEP: union everything true right now into the set, and never take one out.
 *
 * Called from the one place every route persists through, so a discovery cannot
 * be missed by a route that forgot to report it. Returns the keys that were NEW
 * this sweep, so the caller can say "3 new entries" without diffing the set.
 *
 * A predicate that throws is treated as "not yet" rather than allowed to take
 * the request down with it: this runs on every single save, and a Codex is not
 * worth losing a save over.
 */
export function sweepCodex(state) {
  if (!state || typeof state !== 'object') return [];
  if (!state.codex || typeof state.codex !== 'object') state.codex = { seen: [] };
  if (!Array.isArray(state.codex.seen)) state.codex.seen = [];
  const seen = new Set(state.codex.seen);
  const fresh = [];
  for (const entry of CODEX_ENTRIES) {
    const key = codexKey(entry);
    if (seen.has(key)) continue;
    let hit = false;
    try { hit = !!entry.known(state); } catch { hit = false; }
    if (!hit) continue;
    seen.add(key);
    fresh.push(key);
  }
  if (fresh.length) state.codex.seen = [...seen];
  return fresh;
}

/**
 * WHAT TO DRAW, for one category — known entries filled in, the rest `??????`.
 *
 * The blanks are deliberate and are NOT dropped: a category that showed only
 * what you had found would look complete the moment you found one thing.
 */
export function codexPage(state, category) {
  const seen = new Set(Array.isArray(state && state.codex && state.codex.seen)
    ? state.codex.seen : []);
  const rows = CODEX_ENTRIES
    .filter((e) => e.category === category)
    .map((e) => {
      const known = seen.has(codexKey(e));
      return known
        ? {
          id: e.id, known: true, name: e.name, flavour: e.flavour,
          rarity: e.rarity || null, color: e.color || null, symbol: e.symbol || null,
        }
        : { id: e.id, known: false, name: '??????', flavour: '', rarity: null, color: null, symbol: null };
    });
  return { category, rows, known: rows.filter((r) => r.known).length, total: rows.length };
}

/** `23/48 known`, per category and overall. */
export function codexProgress(state) {
  const seen = new Set(Array.isArray(state && state.codex && state.codex.seen)
    ? state.codex.seen : []);
  const per = {};
  for (const c of CODEX_CATEGORIES) per[c.id] = { known: 0, total: 0 };
  for (const e of CODEX_ENTRIES) {
    if (!per[e.category]) per[e.category] = { known: 0, total: 0 };
    per[e.category].total += 1;
    if (seen.has(codexKey(e))) per[e.category].known += 1;
  }
  return {
    per,
    known: CODEX_ENTRIES.filter((e) => seen.has(codexKey(e))).length,
    total: CODEX_ENTRIES.length,
  };
}

/**
 * TWO THINGS OPEN THE CODEX, AND YOU FIND THEM FOUR FLOORS APART.
 *
 * The book comes off a table in the guardroom, on the ground. It does not open.
 * The ring comes out of a chest in the Hall of Keeping, at the top of the
 * tower, behind the Brass Key — and it is the ring that makes the ledger
 * readable, which is why the climb is worth making and what the top floor is
 * FOR. A player who finds only the book is carrying a shut book, and is
 * supposed to notice.
 *
 * You must KEEP the ring, not merely have touched it. That it costs anything to
 * carry is not something the game says yet.
 */
export function hasCodex(state) {
  return hasCodexBook(state) && hasRing(state);
}

/** The ledger itself — found first, and useless on its own. */
export function hasCodexBook(state) {
  return Number(obj(state && state.questItems).codex) > 0;
}

/** Ranon's signet. Without it the pages stay shut. */
export function hasRing(state) {
  return Number(obj(state && state.questItems).ranons_ring) > 0;
}
