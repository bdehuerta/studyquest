// server/graders/llm.js  [v4]
//
// ############################################################################
// #  THIS IS A STUB. IT DOES NOT GRADE ANYTHING AND IT MAKES NO NETWORK CALL. #
// #  Calling it throws. That is the whole point: a grader that pretended to   #
// #  work would be worse than no grader, because the reward it drove would be #
// #  a lie.                                                                   #
// ############################################################################
//
// What IS real here: the request and response shape, worked out against the
// Anthropic Messages API so that wiring a model later is a small, obvious
// change rather than a redesign. `buildRequest()` below returns a body you
// could POST today; `parseResponse()` turns a real Messages response into the
// Grading that server/grader.js expects.
//
// ---------------------------------------------------------------------------
// TO MAKE THIS REAL — the complete list, nothing else in the repo changes:
//
//   1. `npm install @anthropic-ai/sdk` and remove the zero-dependency rule for
//      the SERVER only (the browser side must stay dependency-free — CONTRACT.md
//      rule 1 is about web/, and the server already runs on Node stdlib).
//      If you would rather keep the zero-dependency rule everywhere, skip the
//      SDK and POST buildRequest() to https://api.anthropic.com/v1/messages
//      with Node's global fetch and these headers:
//          x-api-key: <key>
//          anthropic-version: 2023-06-01
//          content-type: application/json
//
//   2. Supply a credential. `ANTHROPIC_API_KEY` is the usual route; an
//      `ant auth login` profile also works with the SDK's zero-arg client.
//      Read it in getApiKey() below. NEVER hardcode it and never ship it in
//      the app bundle — the macOS shell in app/ would carry it to the user.
//
//   3. Delete the `throw` in gradeWithLLM and replace the marked block with:
//
//          const client = new Anthropic();                       // SDK route
//          const res = await client.messages.create(buildRequest({ task, submission }));
//          return parseResponse(res);
//
//      or, over raw fetch:
//
//          const res = await fetch(ENDPOINT, { method:'POST', headers, body:
//            JSON.stringify(buildRequest({ task, submission })) }).then(r => r.json());
//          return parseResponse(res);
//
//   4. Run the server with SQ_GRADER=llm. `stub` stays the default, so a
//      missing key can never silently degrade into a fake grade.
//
//   5. Decide the failure policy. Right now server/api.js turns any grader
//      throw into `{ ok:false, error }` and leaves the quest ungraded and
//      un-completed, which is the honest default. If you would rather fall
//      back to the stub on a network failure, do it in server/grader.js —
//      NOT here — and make the returned Grading say `grader:'stub'` so the UI
//      keeps telling the truth about where the number came from.
//
//   6. Costs and latency are real. A grade is one request of a few thousand
//      input tokens; the UI already has a deliberate "grading…" state built
//      for a multi-second round trip. Consider prompt caching on the system
//      block if grading volume grows.
// ---------------------------------------------------------------------------

export const ENDPOINT = 'https://api.anthropic.com/v1/messages';

// Model ids are exact strings — never append a date suffix.
export const MODEL = 'claude-opus-5';

/** Where the key will come from. Returns null today; that is not an error. */
export function getApiKey() {
  return process.env.ANTHROPIC_API_KEY || null;
}

export const SYSTEM_PROMPT = [
  'You are a fair, specific university tutor grading a single piece of student work.',
  'You are given the assignment brief and the student\'s submission.',
  'Grade only what is in front of you. Do not invent facts about the course.',
  'Be concrete: quote or name the part of the submission a comment refers to.',
  'Marks are earned, not given. A submission that restates the brief without',
  'developing it is a C at best, however long it is.',
].join(' ');

/**
 * The rubric the model must fill in. Kept as data so the stub grader in
 * grader.js and a future model grader can be compared row for row.
 */
export const RUBRIC_SPEC = Object.freeze([
  { criterion: 'Understanding', max: 30 },
  { criterion: 'Evidence & reasoning', max: 25 },
  { criterion: 'Structure', max: 15 },
  { criterion: 'Craft', max: 15 },
  { criterion: 'Timeliness', max: 15 },
]);

/**
 * The JSON schema the response is constrained to. Passed as
 * `output_config.format` — structured outputs, not a tool, and not the
 * deprecated top-level `output_format` parameter.
 */
export const GRADING_SCHEMA = Object.freeze({
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['score', 'rubric', 'feedback', 'strengths', 'improvements', 'confidence'],
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 100 },
      rubric: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['criterion', 'score', 'max', 'comment'],
          properties: {
            criterion: { type: 'string' },
            score: { type: 'number', minimum: 0 },
            max: { type: 'number', minimum: 1 },
            comment: { type: 'string' },
          },
        },
      },
      feedback: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      improvements: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
  },
});

/** The brief, as the model will see it. Kept separate so it is easy to eyeball. */
export function briefFor(task) {
  const t = task || {};
  const due = (t.dueInDays === null || t.dueInDays === undefined)
    ? 'no deadline'
    : (Number(t.dueInDays) < 0 ? `${Math.abs(Number(t.dueInDays))} day(s) LATE` : `due in ${t.dueInDays} day(s)`);
  return [
    `Title: ${t.title || '(untitled)'}`,
    `Subject: ${t.subject || 'unknown'}`,
    `Work type: ${t.workType || 'unknown'}`,
    `Difficulty: ${t.difficulty ?? '?'} of 5`,
    `Expected effort: ${t.estMinutes ?? '?'} minutes (student logged ${t.minutesLogged ?? 0})`,
    `Deadline: ${due}`,
  ].join('\n');
}

/**
 * buildRequest({ task, submission }) -> a Messages API request body.
 *
 * This is a real, current request shape. Notes on the choices, because they are
 * the parts most likely to be stale by the time someone wires this up:
 *   - adaptive thinking, no budget_tokens (removed on the 4.7+ family)
 *   - effort lives inside output_config, not at the top level
 *   - structured output via output_config.format
 *   - no assistant prefill (rejected on current models)
 */
export function buildRequest({ task, submission }) {
  const text = String((submission && submission.text) || '');
  const filename = (submission && submission.filename) || null;

  return {
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: GRADING_SCHEMA,
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `ASSIGNMENT BRIEF\n${briefFor(task)}` },
          {
            type: 'text',
            text:
              `RUBRIC — score every row, out of the maximum given:\n` +
              RUBRIC_SPEC.map((r) => `- ${r.criterion} (0-${r.max})`).join('\n') +
              `\nThe rubric rows must sum to your overall score out of 100.`,
          },
          {
            type: 'text',
            text: `STUDENT SUBMISSION${filename ? ` (from file: ${filename})` : ''}\n---\n${text}\n---`,
          },
        ],
      },
    ],
  };
}

/**
 * parseResponse(res) -> Grading (minus `rank`, which server/grader.js derives
 * from `score` so that one function owns the score→rank mapping).
 *
 * Handles the two shapes that actually bite: a refusal stop_reason (HTTP 200,
 * no usable content) and content blocks that are not text.
 */
export function parseResponse(res) {
  if (!res || typeof res !== 'object') throw new Error('empty response from the grading model');
  if (res.stop_reason === 'refusal') {
    const why = (res.stop_details && res.stop_details.explanation) || 'no explanation given';
    throw new Error(`the grading model declined to grade this submission (${why})`);
  }

  const blocks = Array.isArray(res.content) ? res.content : [];
  const text = blocks.filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('the grading model returned no text');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('the grading model returned text that is not the JSON the schema asked for');
  }

  return {
    score: parsed.score,
    rubric: parsed.rubric,
    feedback: parsed.feedback,
    strengths: parsed.strengths,
    improvements: parsed.improvements,
    confidence: parsed.confidence,
    grader: 'llm',
    model: res.model || MODEL,
    gradedAt: Date.now(),
  };
}

/**
 * gradeWithLLM({ task, submission, state }) -> Grading
 *
 * STUB. Throws, always, on purpose. See the checklist at the top of this file.
 */
export async function gradeWithLLM(/* { task, submission, state } */) {
  // ---- REPLACE THIS BLOCK WITH THE TWO REAL LINES (step 3 above) ----------
  const key = getApiKey();
  throw new Error(
    'the language-model grader is not configured yet — ' +
    (key
      ? 'a key is present, but server/graders/llm.js is still a stub: implement gradeWithLLM (see the checklist at the top of that file).'
      : 'set ANTHROPIC_API_KEY and implement gradeWithLLM (see the checklist at the top of server/graders/llm.js).') +
    ' Run with SQ_GRADER=stub (the default) to use the local estimator instead.'
  );
  // ------------------------------------------------------------------------
}

export default gradeWithLLM;
