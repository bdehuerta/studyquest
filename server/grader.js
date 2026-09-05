// server/grader.js  [v4 — quests become submitted work, graded]
//
// THE SEAM. Grading lives here and nowhere else. api.js knows one function and
// one value shape; it does not know whether a model was involved.
//
//   export async function gradeSubmission({ task, submission, state }) -> Grading
//
// Which implementation runs is chosen by `process.env.SQ_GRADER`:
//
//   stub  (default)  — the local estimator below. No network, no model.
//   llm              — ./graders/llm.js, which currently THROWS a helpful
//                      "not configured" error. It is a marked stub, not a fake.
//
// Adding a third grader means adding a row to IMPLEMENTATIONS and a module that
// returns a Grading. Nothing else in the codebase changes.

import { RANKS } from '../shared/constants.js';
import { rankFromScore } from '../shared/economy.js';

// ---------------------------------------------------------------------------
// the contract
// ---------------------------------------------------------------------------

/**
 * Grading — every grader, stub or model, must return exactly this shape.
 *
 * {
 *   rank: 'F'|'D'|'C'|'B'|'A'|'S',
 *   score: 0..100,
 *   rubric: [ { criterion, score, max, comment } ],   // 3-5 rows
 *   feedback: 'a short paragraph addressed to the student',
 *   strengths: [string], improvements: [string],
 *   confidence: 0..1,
 *   grader: 'stub' | 'llm',
 *   model: string|null,
 *   gradedAt: number,
 * }
 */

/** Stored submissions are capped. Anything past this is cut, and we say so. */
export const MAX_SUBMISSION_CHARS = 20000;

/** What the UI prints when it needs to be honest about where a grade came from. */
export const GRADER_LABELS = Object.freeze({
  stub: 'estimated locally — no model configured',
  llm: 'graded by a language model',
});

export function graderId() {
  const raw = String(process.env.SQ_GRADER || 'stub').trim().toLowerCase();
  return IMPLEMENTATIONS[raw] ? raw : 'stub';
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * A stable 32-bit hash. The stub uses it instead of Math.random so that the
 * same text always earns the same grade: a regrade that moved the score around
 * with nothing changed would be a lie about what the grader can see.
 */
function hash32(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** hash-seeded jitter in [-amp, +amp]. Deterministic per (text, salt). */
function jitter(seed, salt, amp) {
  const h = hash32(`${salt}::${seed}`);
  return ((h % 2001) / 1000 - 1) * amp;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'about',
  'what', 'when', 'have', 'has', 'was', 'were', 'are', 'you', 'not', 'but',
  'all', 'any', 'can', 'its', 'his', 'her', 'their', 'them', 'they', 'our',
  'out', 'how', 'why', 'who', 'one', 'two', 'chapter', 'read', 'write', 'essay',
  'notes', 'problem', 'set', 'exercise', 'exercises', 'revise', 'review',
]);

function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñçàèìòùâêîôû'\s-]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function keyTerms(title) {
  const seen = new Set();
  const out = [];
  for (const w of words(title)) {
    const t = w.replace(/^-+|-+$/g, '');
    if (t.length < 4 || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function sentences(text) {
  return String(text || '')
    .split(/[.!?]+(?:\s|$)|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

// ---------------------------------------------------------------------------
// the stub grader
// ---------------------------------------------------------------------------

/**
 * Five signals, each a real property of the submission the stub can actually
 * observe. Nothing here pretends to understand the work — the labels and the
 * feedback text say so out loud, and `confidence` stays low on purpose.
 *
 *   Coverage    30 — length against what a task of this length/difficulty asks
 *   Relevance   25 — how many of the brief's own key terms appear in the answer
 *   Structure   15 — sentences and paragraphs, i.e. is it organised at all
 *   Craft       15 — vocabulary variety and sentence length sanity
 *   Timeliness  15 — dueInDays at the moment of submission
 */
const WORDS_PER_ESTIMATED_MINUTE = 4;
// A four-hour task does not want 5,000 words of prose — past this the length
// signal has told you everything it can.
const EXPECTED_WORDS_CEILING = 900;

function analyse(task, submission) {
  const text = String((submission && submission.text) || '');
  const w = words(text);
  const wordCount = w.length;
  const charCount = text.length;

  const est = clamp(num(task && task.estMinutes, 30), 5, 1440);
  const difficulty = clamp(Math.round(num(task && task.difficulty, 3)), 1, 5);
  // A harder task of the same length is expected to say more, not less.
  const demand = 0.85 + 0.075 * difficulty;
  const expectedWords = clamp(Math.round(est * WORDS_PER_ESTIMATED_MINUTE * demand), 60, EXPECTED_WORDS_CEILING);

  const terms = keyTerms(task && task.title);
  const bag = new Set(w);
  const hit = terms.filter((t) => bag.has(t) || w.some((x) => x.startsWith(t.slice(0, 5))));

  const sents = sentences(text);
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const unique = new Set(w).size;

  const dueInDays = task && task.dueInDays;
  const hasDue = dueInDays !== null && dueInDays !== undefined && Number.isFinite(Number(dueInDays));
  const onTime = !hasDue || Number(dueInDays) >= 0;

  return {
    text, wordCount, charCount, est, difficulty, expectedWords,
    terms, hit, sents, paras, unique, hasDue, dueInDays, onTime,
    ratio: expectedWords > 0 ? wordCount / expectedWords : 0,
  };
}

function stubRubric(a, seed) {
  const rows = [];

  // --- Coverage / 30 ------------------------------------------------------
  // Full marks land at ~85% of the expected length; going far over is not
  // rewarded, but it is not punished either — padding is a judgement call the
  // stub is honestly not able to make.
  const covRaw = clamp(a.ratio / 0.85, 0, 1.12);
  const cov = clamp(round1(30 * Math.min(1, covRaw) + jitter(seed, 'cov', 1.2)), 0, 30);
  rows.push({
    criterion: 'Coverage',
    score: cov,
    max: 30,
    comment: a.wordCount === 0
      ? 'Nothing was submitted to measure.'
      : `${a.wordCount} words against roughly ${a.expectedWords} expected for a ${a.est}-minute task at difficulty ${a.difficulty}.`,
  });

  // --- Relevance / 25 -----------------------------------------------------
  const relBase = a.terms.length === 0
    ? 0.62                                   // no usable key terms in the title
    : a.hit.length / a.terms.length;
  const rel = clamp(round1(25 * clamp(relBase, 0, 1) + jitter(seed, 'rel', 1.4)), 0, 25);
  rows.push({
    criterion: 'Relevance to the brief',
    score: rel,
    max: 25,
    comment: a.terms.length === 0
      ? 'The quest title carries no distinctive terms, so this is scored neutrally.'
      : `${a.hit.length} of ${a.terms.length} key terms from the brief appear: ${a.terms.map((t) => (a.hit.includes(t) ? t : `${t}✗`)).join(', ')}.`,
  });

  // --- Structure / 15 -----------------------------------------------------
  const sentScore = clamp(a.sents.length / 6, 0, 1);
  const paraScore = clamp((a.paras.length - 1) / 2, 0, 1);
  const str = clamp(round1(15 * (0.65 * sentScore + 0.35 * paraScore) + jitter(seed, 'str', 0.9)), 0, 15);
  rows.push({
    criterion: 'Structure',
    score: str,
    max: 15,
    comment: `${a.sents.length} sentence${a.sents.length === 1 ? '' : 's'} across ${a.paras.length} paragraph${a.paras.length === 1 ? '' : 's'}.`,
  });

  // --- Craft / 15 ---------------------------------------------------------
  // Type-token ratio falls naturally as text gets longer, so it is compared
  // against a length-adjusted target rather than a flat one.
  const ttr = a.wordCount > 0 ? a.unique / a.wordCount : 0;
  const target = clamp(0.78 - Math.log10(Math.max(10, a.wordCount)) * 0.13, 0.28, 0.66);
  const varietyScore = clamp(ttr / target, 0, 1);
  const avgSent = a.sents.length > 0 ? a.wordCount / a.sents.length : 0;
  // 12–28 words a sentence reads as prose; outside that it is a list or a wall.
  const rhythmScore = avgSent === 0 ? 0 : clamp(1 - Math.abs(avgSent - 19) / 19, 0, 1);
  const craft = clamp(round1(15 * (0.6 * varietyScore + 0.4 * rhythmScore) + jitter(seed, 'craft', 0.9)), 0, 15);
  rows.push({
    criterion: 'Craft',
    score: craft,
    max: 15,
    comment: a.wordCount === 0
      ? 'No text to read.'
      : `${a.unique} distinct words (${Math.round(ttr * 100)}% of the total), averaging ${Math.round(avgSent)} words a sentence.`,
  });

  // --- Timeliness / 15 ----------------------------------------------------
  let time = 15;
  let timeNote = 'No deadline was set on this quest.';
  if (a.hasDue) {
    const d = Number(a.dueInDays);
    if (d < 0) {
      time = clamp(15 - Math.abs(d) * 3.5, 0, 15);
      timeNote = `Handed in ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} late.`;
    } else if (d === 0) {
      time = 12;
      timeNote = 'Handed in on the day it was due.';
    } else {
      time = 15;
      timeNote = `Handed in with ${d} day${d === 1 ? '' : 's'} to spare.`;
    }
  }
  rows.push({ criterion: 'Timeliness', score: round1(time), max: 15, comment: timeNote });

  return rows;
}

function stubProse(a, rows, score) {
  const by = Object.fromEntries(rows.map((r) => [r.criterion, r.score / r.max]));
  const strengths = [];
  const improvements = [];

  if (by.Coverage >= 0.8) strengths.push('You wrote at the length the task deserved.');
  else if (a.ratio < 0.45) improvements.push(`Go further — this is roughly ${Math.round(a.ratio * 100)}% of the length a ${a.est}-minute task usually needs.`);
  else improvements.push('A little more depth would push this up a rank.');

  if (by['Relevance to the brief'] >= 0.8) strengths.push('It stays on the brief rather than drifting.');
  else if (a.terms.length) {
    const missed = a.terms.filter((t) => !a.hit.includes(t));
    if (missed.length) improvements.push(`The brief mentions ${missed.slice(0, 3).join(', ')} — none of that shows up in the answer.`);
  }

  if (by.Structure >= 0.75) strengths.push('It is organised into readable parts.');
  else improvements.push('Break it into paragraphs; one block of text is hard to mark and harder to revise from.');

  if (by.Craft >= 0.75) strengths.push('The writing itself is varied and readable.');
  else if (a.wordCount > 40) improvements.push('Vary the sentence length and the vocabulary a little more.');

  if (by.Timeliness >= 1) strengths.push('It arrived on time.');
  else if (a.hasDue && Number(a.dueInDays) < 0) improvements.push('Submitting late costs you a real slice of the grade.');

  const verdict = score >= 85 ? 'This is excellent work'
    : score >= 68 ? 'This is strong work'
    : score >= 50 ? 'This is solid, workable'
    : score >= 32 ? 'This is a start'
    : 'This is thin';

  const subject = a.title ? `"${a.title}"` : 'this quest';
  const feedback =
    `${verdict} on ${subject}. ` +
    `The estimate below is mechanical: it reads length, deadline, difficulty and how much of the brief's own vocabulary you picked up — ` +
    `it does not read the argument. ` +
    (improvements.length ? `The clearest thing to change: ${improvements[0].replace(/^[A-Z]/, (c) => c.toLowerCase())} ` : 'Nothing obvious to change from what can be measured here. ') +
    `Treat the rank as a nudge, not a verdict.`;

  return {
    feedback,
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
  };
}

/**
 * The local estimator. Deliberately labelled an estimate everywhere it
 * surfaces: it has never read a word for meaning, and `confidence` says so.
 */
async function gradeWithStub({ task, submission }) {
  const a = analyse(task, submission);
  a.title = (task && task.title) || '';
  const seed = `${(task && task.id) || 'task'}:${a.text}`;

  const rows = stubRubric(a, seed);
  const score = clamp(Math.round(rows.reduce((s, r) => s + r.score, 0)), 0, 100);
  const rank = rankFromScore(score / 100);
  const prose = stubProse(a, rows, score);

  // Confidence rises with the amount of text there is to look at, and never
  // gets near 1 — the stub is measuring shape, not substance.
  const confidence = clamp(0.22 + Math.min(0.28, a.wordCount / 1600), 0, 0.5);

  return {
    rank,
    score,
    rubric: rows,
    feedback: prose.feedback,
    strengths: prose.strengths,
    improvements: prose.improvements,
    confidence: Math.round(confidence * 100) / 100,
    grader: 'stub',
    model: null,
    gradedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

const IMPLEMENTATIONS = {
  stub: gradeWithStub,
  llm: async (args) => {
    // Loaded lazily so that the default path never even parses the adapter,
    // and so that a future SDK import there cannot break a stub-mode boot.
    const mod = await import('./graders/llm.js');
    return mod.gradeWithLLM(args);
  },
};

/** Coerce whatever a grader returned into a Grading, or throw. */
export function normalizeGrading(g, fallbackGrader) {
  if (!g || typeof g !== 'object') throw new Error('grader returned nothing');
  const score = clamp(Math.round(num(g.score, 0)), 0, 100);
  const rank = RANKS.includes(String(g.rank)) ? String(g.rank) : rankFromScore(score / 100);

  const rubric = (Array.isArray(g.rubric) ? g.rubric : [])
    .slice(0, 5)
    .map((r) => ({
      criterion: String((r && r.criterion) || 'Criterion'),
      score: round1(clamp(num(r && r.score, 0), 0, num(r && r.max, 100))),
      max: Math.max(1, Math.round(num(r && r.max, 100))),
      comment: String((r && r.comment) || ''),
    }));
  if (rubric.length < 3) throw new Error('grader returned fewer than 3 rubric rows');

  const list = (v) => (Array.isArray(v) ? v : []).map((s) => String(s)).filter(Boolean).slice(0, 5);

  return {
    rank,
    score,
    rubric,
    feedback: String(g.feedback || ''),
    strengths: list(g.strengths),
    improvements: list(g.improvements),
    confidence: clamp(num(g.confidence, 0.5), 0, 1),
    grader: String(g.grader || fallbackGrader || 'stub'),
    model: g.model ? String(g.model) : null,
    gradedAt: Number.isFinite(Number(g.gradedAt)) ? Number(g.gradedAt) : Date.now(),
  };
}

/**
 * gradeSubmission({ task, submission, state }) -> Grading
 *
 * Never throws for a reason the caller can do nothing about: if the selected
 * grader fails (the LLM adapter is not configured, a network call died), the
 * error is annotated and rethrown so the route can turn it into an honest
 * ok:false. Callers must await this — a model round-trip takes seconds.
 */
export async function gradeSubmission({ task, submission, state }) {
  const id = graderId();
  const impl = IMPLEMENTATIONS[id];
  const raw = await impl({ task, submission, state });
  return normalizeGrading(raw, id);
}

export default gradeSubmission;
