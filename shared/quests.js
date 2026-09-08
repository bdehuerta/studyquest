// shared/quests.js — QUESTS: the errands people give you.
//
// Not to be confused with TASKS, which are Bruno's real coursework and live on
// [T]. A quest is a conversation somebody started: the Herald's war, the
// Woodsman's flower, the hermit's cheesecake. They are hand-authored, they have
// stages, and they are read in the Bag.
//
// DERIVED, LIKE EVERYTHING ELSE HERE. A quest's stage is a function of the
// save, never a field somebody has to remember to advance. `shared/codex.js`
// explains why at length: a predicate has no call sites to forget, so a quest
// cannot end up stuck on stage 2 because one of the four routes that finishes
// stage 2 did not say so. The cost is that every stage has to be recognisable
// from the save alone — which is a good constraint, because a stage you cannot
// recognise is a stage the player cannot be shown either.
//
// A quest is a list of STEPS. The first step whose `done` is false is where you
// are; if they are all done the quest is complete. `hidden` keeps a quest out
// of the list until it has been offered, so the Bag is not a table of contents
// for the whole game.

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const has = (s, id) => Number(obj(obj(s).questItems)[id]) > 0;
const done = (s, id) => arr(obj(s).questsDone).indexOf(id) !== -1;

export const QUESTS = Object.freeze([
  Object.freeze({
    id: 'the_levy',
    name: 'Raise the Levy',
    giver: 'The Wandering Merchant',
    blurb: 'Gotham is held by a false heir. You cannot fight him with what you have — so '
      + 'fetch an army that is already owed.',
    /** Nothing exists before he rides in at level twenty. */
    hidden: (s) => !obj(obj(s).herald).spoken,
    steps: Object.freeze([
      Object.freeze({
        text: 'Travel east and find the Wise Man of the mountain.',
        done: (s) => obj(obj(s).wiseMan).spoken === true,
      }),
      Object.freeze({
        text: 'Take back the Ashen Standard from the Hall of Keeping at Elderwatch.',
        done: (s) => has(s, 'ashen_standard'),
      }),
      Object.freeze({
        text: 'Find the ledger and the signet the Wise Man asked for.',
        done: (s) => has(s, 'codex') && has(s, 'ranons_ring'),
      }),
      Object.freeze({
        text: 'Carry both back to him on the mountain before going west.',
        done: (s) => obj(obj(s).wiseMan).returned === true,
      }),
      Object.freeze({
        text: 'Travel west into the Farlands and find the twelve families.',
        done: (s) => 'farlands' in obj(obj(s).areaPos) || obj(obj(s).player).area === 'farlands',
      }),
    ]),
  }),

  Object.freeze({
    id: 'the_blue_bloom',
    name: 'The Blue Bloom',
    giver: 'The Woodsman',
    blurb: 'There is one blue tree in the Home Block and he has been waiting years for what '
      + 'grows on it.',
    /** He is behind a locked door until the key exists. */
    hidden: (s) => !has(s, 'blue_key') && !done(s, 'woodsman_opened')
      && arr(obj(s).vendorsUnlocked).indexOf('woodsman') === -1,
    steps: Object.freeze([
      Object.freeze({
        text: 'Fell the Blue Bloom in the north-west woods and take the key it drops.',
        done: (s) => has(s, 'blue_key')
          || arr(obj(s).vendorsUnlocked).indexOf('woodsman') !== -1,
      }),
      Object.freeze({
        text: 'Carry the Blue Key to the Woodsman and open his door.',
        done: (s) => arr(obj(s).vendorsUnlocked).indexOf('woodsman') !== -1,
      }),
    ]),
  }),

  Object.freeze({
    id: 'the_cheesecake',
    name: 'A Man About a Cheesecake',
    giver: 'The Hermit at the End of the Summit',
    blurb: 'He has the tin, the oven, the opinions and four terraces of solitude. What he '
      + 'does not have is cheese.',
    /** He does not exist as a quest until you have let him talk at you. */
    hidden: (s) => !obj(obj(s).hermit).spoken,
    steps: Object.freeze([
      Object.freeze({
        text: 'Take his ten florins west, into the Farlands.',
        done: (s) => 'farlands' in obj(obj(s).areaPos) || obj(obj(s).player).area === 'farlands',
      }),
      Object.freeze({
        text: 'Find the cave in the burnt ground, and the cheesemonger at the end of it. '
          + 'It is dark: bring the Lantern.',
        done: (s) => obj(obj(s).hermit).monger === true || has(s, 'summit_cheese'),
      }),
      Object.freeze({
        text: 'Buy the cheese — ten florins, and he will not be moved on it.',
        done: (s) => has(s, 'summit_cheese') || obj(obj(s).hermit).paid === true,
      }),
      Object.freeze({
        text: 'Carry it back up the mountain to him.',
        done: (s) => obj(obj(s).hermit).paid === true,
      }),
    ]),
  }),
]);

export const QUEST_IDS = Object.freeze(QUESTS.map((q) => q.id));

function safe(fn, state) {
  try { return !!fn(state); } catch { return false; }
}

/**
 * ONE QUEST'S STATE, as the Bag shows it.
 *
 * `stage` is the index of the first unfinished step, or -1 when the whole thing
 * is done. `current` is that step's text — the one line a player actually needs.
 */
export function questState(state, quest) {
  const steps = quest.steps.map((st) => ({ text: st.text, done: safe(st.done, state) }));
  /**
   * A FINISHED LATER STEP FINISHES THE ONES BEFORE IT.
   *
   * These are linear errands, and a step's predicate recognises a STATE rather
   * than an event — so a save can arrive at step 4 by a route that leaves step
   * 1's evidence behind. The hermit's step 1 is "you went west", recognised by
   * `areaPos.farlands`; come home, and a save that has bought his cheese and
   * been given the helm would show as not having started. Walking the list
   * backwards costs nothing and means the Bag can never show a quest as less
   * far along than it demonstrably is.
   */
  for (let i = steps.length - 2; i >= 0; i -= 1) {
    if (steps[i + 1].done) steps[i].done = true;
  }
  // A LATER STEP BEING TRUE DOES NOT SKIP AN EARLIER ONE. Quests are walked in
  // order and a save can satisfy step 3's predicate incidentally — standing in
  // the Farlands satisfies the Levy's step 5 whether or not you took the
  // Standard — so the stage is the FIRST unfinished step, and everything after
  // it is drawn as pending regardless of what its predicate says.
  const stage = steps.findIndex((st) => !st.done);
  return {
    id: quest.id,
    name: quest.name,
    giver: quest.giver,
    blurb: quest.blurb,
    steps: steps.map((st, i) => ({
      text: st.text,
      done: stage === -1 ? true : i < stage,
      current: i === stage,
    })),
    stage,
    complete: stage === -1,
    current: stage === -1 ? null : steps[stage].text,
    doneCount: stage === -1 ? steps.length : stage,
    total: steps.length,
  };
}

/** Every quest that has been offered, in the order they are given. */
export function activeQuests(state) {
  return QUESTS
    .filter((q) => !safe(q.hidden, state))
    .map((q) => questState(state, q));
}

/** `1/3 underway` for the tab. */
export function questProgress(state) {
  const list = activeQuests(state);
  return {
    open: list.filter((q) => !q.complete).length,
    complete: list.filter((q) => q.complete).length,
    total: list.length,
  };
}
