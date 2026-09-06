// shared/pages.js — THE TORN PAGES: the half of the Codex you have to work out.
//
// Bruno, 2026-09-06: "we need to focus on what the codex does. it is like a
// pokedex of items but also as a journal which during quests you find
// information in pages which are rubbed out or broken, and you figure it out
// bit by bit."
//
// So the Codex has two halves and they do opposite jobs.
//
//   THE CATALOGUE (shared/codex.js) is a record of what you have MET. It fills
//   in by itself, it is never wrong, and an unfound entry is a blank labelled
//   `??????`. It rewards going places.
//
//   THE PAGES are a record of what somebody else wrote and did not want read.
//   They arrive DAMAGED — rubbed out, burnt, torn across, water-got — and a gap
//   is not filled by finding that page again. It is filled by finding a
//   DIFFERENT page that happens to name the same thing. The ledger says the
//   garrison was staffed "by order of ████"; the requisition, found three
//   regions away, is signed. Put them side by side and both become readable.
//
// THAT IS THE WHOLE MECHANIC, and it is why the pages are worth having rather
// than being a lore dump with asterisks in it: a page you cannot read yet is a
// question with a shape, and the shape tells you what to go and look for.
//
// A GAP IS NEVER FILLED BY THE PAGE IT IS ON. If it were, the redaction would
// be decoration — you would find the page, read the page, and the ink would be
// a typographic effect. Every gap points AT something else. `pagesContract()`
// checks that, because it is the one rule the whole feature rests on and it is
// exactly the sort of thing that rots quietly as pages get added.

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Rendered in place of a gap you cannot fill yet. */
export const REDACTION = '████████';

/**
 * EVERY PAGE, and what is missing from each.
 *
 * `lines` is an array of PARAGRAPHS, each of which is an array of segments. A
 * string segment is text as written; an object is a GAP:
 * `{ gap: 'what it really says', by: 'the page id that tells you' }`. Segments
 * inside a paragraph are joined exactly as given, so the text either side of a
 * gap carries its own spacing and punctuation.
 *
 * `found` is a predicate over the save, the same contract the catalogue uses —
 * pages are swept in, never reported, so a page cannot be missed by a quest
 * that forgot to hand it over.
 */
export const CODEX_PAGES = Object.freeze([
  Object.freeze({
    id: 'posting_orders',
    name: 'A Sheaf of Posting Orders',
    where: 'the chest in the Hall of Keeping',
    /** Every one of them is in the chest, so the ring is what reads them. */
    found: (s) => have(s, 'codex') && have(s, 'ranons_ring'),
    lines: Object.freeze([
      Object.freeze(['Forty of them, one to a year, and the hand does not change.']),
      Object.freeze([
        'BY ORDER OF ',
        Object.freeze({ gap: 'THE LORD STEWARD OF GOTHAM', by: 'seal_impression' }),
        ', the garrison at Elderwatch is to be made up of men who have no people in the '
          + 'farlands and no reason to ask after them.',
      ]),
      Object.freeze([
        'Where such men cannot be found, ',
        Object.freeze({ gap: 'they are to be made', by: 'burnt_requisition' }),
        '.',
      ]),
      Object.freeze(['The last order in the sheaf is dated this spring. Whoever writes them '
        + 'is still writing them.']),
    ]),
  }),
  Object.freeze({
    id: 'seal_impression',
    name: 'An Impression in Wax',
    where: 'pressed inside the back cover of the Codex',
    /** It is in the book. You need the ring to see that it matches the ring. */
    found: (s) => have(s, 'codex') && have(s, 'ranons_ring'),
    lines: Object.freeze([
      Object.freeze(['Somebody pressed the seal into the endpaper, hard, as though to keep '
        + 'a copy of it.']),
      Object.freeze(['The crest is filed flat and re-cut — the same mutilation the signet '
        + 'on your hand carries, down to the slip where the graver went wide.']),
      Object.freeze(['Underneath, in a different hand and much later: "he signs everything. '
        + 'that is how you will get him."']),
      Object.freeze([
        'The title around the rim reads ',
        Object.freeze({ gap: 'LORD STEWARD, AND AFTER HIM KING', by: 'levy_roll' }),
        '.',
      ]),
    ]),
  }),
  Object.freeze({
    id: 'burnt_requisition',
    name: 'A Requisition, Burnt Along One Edge',
    where: 'the Farlands',
    found: (s) => have(s, 'burnt_requisition'),
    lines: Object.freeze([
      Object.freeze(['Charred to the fold. What is left is an order for grain, and under it '
        + 'a second order that is not about grain at all.']),
      Object.freeze([
        'Families of the twelve are to be settled ',
        Object.freeze({ gap: 'no fewer than nine miles apart', by: 'levy_roll' }),
        ', and no two of the same name in one place.',
      ]),
      Object.freeze(['Where a man has people in the farlands, he is to be posted to the '
        + 'border, and his people are to be told he has gone willingly.']),
      Object.freeze([
        'That is the answer to the posting orders: ',
        Object.freeze({ gap: 'he did not find men with no people. He made them.',
          by: 'posting_orders' }),
      ]),
    ]),
  }),
  Object.freeze({
    id: 'levy_roll',
    name: 'The Levy Roll of the Twelve Families',
    where: 'the Farlands',
    found: (s) => have(s, 'levy_roll'),
    lines: Object.freeze([
      Object.freeze(['Twelve names down the left, and a column beside them that has been '
        + 'scraped back to the vellum and written over.']),
      Object.freeze([
        'Under the scraping, where the knife did not quite reach: ',
        Object.freeze({ gap: 'SURETY — RETURNED UPON THE RAISING', by: 'posting_orders' }),
        '.',
      ]),
      Object.freeze(['The Standard was not taken. It was LODGED, against a debt; the debt '
        + 'has a date on it, and the date is forty years past.']),
      Object.freeze([
        'The signature at the foot is the same one you have been reading all along: ',
        Object.freeze({ gap: 'RANON, then Lord Steward, keeper of the surety',
          by: 'seal_impression' }),
        '.',
      ]),
    ]),
  }),
]);

/** Does the save hold this quest item? */
function have(state, id) {
  return Number(obj(state && state.questItems)[id]) > 0;
}
// A PAGE IS A QUEST ITEM. It could have been its own kind of thing with its own
// route and its own corner of the save; making it an item means it travels the
// machinery that already exists — picked up off the ground by `questSitesFor`,
// listed on the RELICS tab, catalogued, and checked by the same predicates.
// Less new code, and one fewer concept for the next map to have to learn.

export const CODEX_PAGE_IDS = Object.freeze(CODEX_PAGES.map((p) => p.id));

/** Which pages are in the book right now. */
export function knownPageIds(state) {
  const out = [];
  for (const p of CODEX_PAGES) {
    let hit = false;
    try { hit = !!p.found(state); } catch { hit = false; }
    if (hit) out.push(p.id);
  }
  return out;
}

/**
 * ONE PAGE, RENDERED — as much of it as you can currently read.
 *
 * Returns `paragraphs`, each an array of segments: `{ text }` for what is
 * written, and for a gap either
 * `{ text, filled: true, by }` once the corroborating page is in the book, or
 * `{ text: REDACTION, filled: false, by }` while it is not. The `by` is handed
 * back either way so the panel can say WHICH page would fill it once you have
 * that page — a question with a shape is the point, and "you are missing
 * something" is not a shape.
 */
export function readPage(state, pageId) {
  const page = CODEX_PAGES.find((p) => p.id === pageId);
  if (!page) return null;
  const known = new Set(knownPageIds(state));
  if (!known.has(page.id)) return null;
  let gaps = 0;
  let filled = 0;
  const paragraphs = page.lines.map((para) => para.map((seg) => {
    if (typeof seg === 'string') return { text: seg, gap: false };
    gaps += 1;
    const ok = known.has(seg.by);
    if (ok) filled += 1;
    return {
      text: ok ? seg.gap : REDACTION,
      gap: true,
      filled: ok,
      by: seg.by,
      byName: ok ? null : nameOf(seg.by),
    };
  }));
  return {
    id: page.id, name: page.name, where: page.where, paragraphs, gaps, filled,
    whole: gaps === filled,
    /** Every gap still unread, and the page that would fill it. */
    missing: paragraphs.flat().filter((x) => x.gap && !x.filled)
      .map((x) => ({ by: x.by, byName: x.byName })),
  };
}

function nameOf(id) {
  const p = CODEX_PAGES.find((x) => x.id === id);
  return p ? p.name : null;
}

/** Every page you hold, in the order they were written into the module. */
export function readPages(state) {
  return knownPageIds(state).map((id) => readPage(state, id)).filter(Boolean);
}

/** `3/4 pages · 5/7 readable` — what the tab header shows. */
export function pagesProgress(state) {
  const known = knownPageIds(state);
  let gaps = 0;
  let filled = 0;
  for (const id of known) {
    const r = readPage(state, id);
    if (!r) continue;
    gaps += r.gaps;
    filled += r.filled;
  }
  return { known: known.length, total: CODEX_PAGES.length, gaps, filled };
}

/**
 * THE ONE RULE, CHECKED: no gap is filled by the page it sits on.
 *
 * A self-filling gap is a redaction that resolves the moment you can see it,
 * which makes the ink a typographic effect rather than a question. Also
 * verifies every `by` names a page that exists, because a gap pointing at
 * nothing is a gap that can never be filled — unreadable forever, and silent.
 *
 * Called by `tools/lib/geometry.mjs` alongside the map contracts.
 */
export function pagesContract() {
  const ids = new Set(CODEX_PAGE_IDS);
  const problems = [];
  for (const p of CODEX_PAGES) {
    for (const seg of p.lines.flat()) {
      if (typeof seg === 'string') continue;
      if (!seg.by) { problems.push(`page "${p.id}" has a gap with no \`by\``); continue; }
      if (!ids.has(seg.by)) {
        problems.push(`page "${p.id}" has a gap filled by "${seg.by}", which is not a page`);
      }
      if (seg.by === p.id) {
        problems.push(`page "${p.id}" fills its own gap — a redaction you can read `
          + 'the moment you find it is decoration, not a question');
      }
    }
  }
  return problems;
}
