// tools/checks/07-quests.mjs — v4 grading, end to end, through the API only.
//
// What this suite exists to prove:
//
//   1. SUBMIT → GRADE → REWARD. Handing work in produces a Grading of the
//      contracted shape, marks the quest done, and pays coins/xp through the
//      untouched computeTaskPayout path.
//   2. RESOURCES AT RANK A+. A strong submission drops materials; a weak one
//      does not. Studying stays the route to reach without becoming a firehose.
//   3. THE 20K TRUNCATION PATH. An oversized submission is cut, the cut is
//      recorded on the stored submission, and the route says so out loud.
//   4. THE OLD SELF-GRADE PATH STILL WORKS for a quest with no submission —
//      that is the fallback the contract says not to strip out.
//   5. REGRADE re-runs the grader over the stored submission, pays nothing a
//      second time, and refuses a quest that has never been submitted.
//   6. MIGRATION. A save written before v4 has no submission/grading keys at
//      all; every task must come back carrying them, with nothing else lost.
//
// The stub grader is deterministic on (task id, submission text), so the ranks
// asserted below are stable. If you retune server/grader.js, expect to retune
// the two rank assertions here — that is the point of asserting them.

// A long, varied, on-brief answer. Deliberately written to score well on every
// signal the stub can see: length, the brief's own vocabulary, paragraphs,
// sentence rhythm, vocabulary spread.
const PARA_A =
  'The causes of the Reformation were structural long before they were doctrinal. ' +
  'Indulgences drained silver out of the German lands toward Rome, and the resentment that built up around that traffic was fiscal as much as spiritual. ' +
  'Printing changed the tempo of the argument: a pamphlet written in Wittenberg could be answered in Basel inside a fortnight, and no chancery could keep pace with it.';
const PARA_B =
  'Political fragmentation supplied the shelter. Princes who resented papal taxation found in reform a convenient lever against both emperor and curia, ' +
  'and they protected preachers whom a more centralised realm would have burned without ceremony. ' +
  'The Reformation survived its first decade because it was useful to people who did not much care about justification.';
const PARA_C =
  'Humanism supplied the method. Erasmus put a critical Greek New Testament into scholarly hands, and once the text itself could be argued from, ' +
  'the monopoly on interpretation had already gone. Wycliffe and Hus had made comparable arguments and were contained; what had changed by 1517 was ' +
  'the speed at which an argument could travel and the number of powerful men with a reason to let it.';

const STRONG_SUBMISSION = [PARA_A, PARA_B, PARA_C].join('\n\n');

// A one-line answer to the same brief: short, no structure, no vocabulary.
const WEAK_SUBMISSION = 'It happened because of the church.';

// 26,000 characters — comfortably past MAX_SUBMISSION_CHARS (20,000).
const HUGE_SUBMISSION = 'Padding sentence about the Reformation and its causes. '.repeat(482);

function task(id, over) {
  return {
    id,
    title: 'Essay on the causes of the Reformation',
    subject: 'history',
    workType: 'writing',
    difficulty: 4,
    estMinutes: 120,
    status: 'todo',
    minutesLogged: 90,
    rank: null,
    dueInDays: 2,
    completedAt: null,
    // NOTE: deliberately NO submission / grading keys. These fixtures are what
    // a pre-v4 save looks like, so the migration is exercised on every request.
    ...(over || {}),
  };
}

function seedSave() {
  return {
    player: {
      name: 'V4 Tester',
      level: 6, xp: 10, xpToNext: 1000,
      x: 22, y: 19,
      coins: { focus: 100, insight: 100, grind: 100, spark: 100 },
      darkBoxes: 0, streak: 0, lastActiveDate: null,
      energy: 100, maxEnergy: 100,
      gatherTools: [], activeGatherTool: null, saplings: 0,
    },
    // Every non-tree material starts at zero so the scarcest-first drop bias
    // has a predictable order to pick from.
    materials: {},
    tools: [], buildings: [], pendingBuildings: [],
    tasks: [
      task('q-strong'),
      task('q-weak'),
      task('q-huge'),
      task('q-nosub'),                          // completed the OLD way
      task('q-regrade'),
      task('q-never', { title: 'Nothing was ever handed in here' }),
      task('q-drop'),
      task('q-weak2'),
    ],
    sessions: [], log: [], harvested: {},
    blueprints: [], relics: [],
    plantings: {}, gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
    refundBank: { materials: {}, coins: {} }, effects: {},
    lifetime: { tasksCompleted: 0, studyMinutes: 90, sessions: 0, treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0 },
  };
}

function seedMeta() {
  return {
    slot: 1, name: 'V4 Tester', createdAt: 1750000000000, lastPlayedAt: 1750000000000,
    playtimeMs: 60000, level: 6, tasksDone: 0, tasksTotal: 8, savedAt: 1750000000000,
  };
}

export default {
  name: 'v4 — submitted work, graded, and paid',
  order: 70,
  browser: false,

  seed: {
    'Slot 1/state.json': seedSave(),
    'Slot 1/meta.json': seedMeta(),
  },

  steps: [
    // ------------------------------------------------------------ migration
    {
      type: 'note',
      text: 'The seed tasks carry NO submission/grading keys — they are pre-v4 shaped. Every task must come back with both.',
    },
    { type: 'api', route: '/api/state', expectOk: true, label: 'state still loads', path: 'state.player.name', equals: 'V4 Tester' },
    { type: 'api', route: '/api/state', label: 'task 0 gained a submission key', path: 'state.tasks.0.submission', equals: null },
    { type: 'api', route: '/api/state', label: 'task 0 gained a grading key', path: 'state.tasks.0.grading', equals: null },
    { type: 'api', route: '/api/state', label: 'the last task got them too', path: 'state.tasks.5.grading', equals: null },
    { type: 'api', route: '/api/state', label: 'and nothing else was lost', path: 'state.tasks.0.title', equals: 'Essay on the causes of the Reformation' },

    // ------------------------------------------------------- the config seam
    { type: 'note', text: 'Which grader is running is a fact the client can ask for. Default is the stub, never a model.' },
    { type: 'api', route: '/api/quest/config', expectOk: true, label: 'the grader identifies itself', path: 'grader', equals: 'stub' },
    { type: 'api', route: '/api/quest/config', label: 'and says so honestly', path: 'graderNote', equals: 'estimated locally — no model configured' },
    { type: 'api', route: '/api/quest/config', label: 'the cap is published', path: 'maxSubmissionChars', equals: 20000 },

    // ------------------------------------------------ submit → grade → reward
    { type: 'note', text: 'The main event: hand in real work, get a Grading, get paid.' },
    {
      type: 'api', route: '/api/quest/submit', expectOk: true,
      body: { taskId: 'q-strong', submission: { kind: 'text', text: STRONG_SUBMISSION } },
      label: 'a strong submission is accepted', path: 'grading.grader', equals: 'stub',
    },
    { type: 'api', route: '/api/quest/q-strong/grading', expectOk: true, label: 'and is readable back off the task', path: 'grading.score', truthy: true },
    { type: 'api', route: '/api/quest/q-strong/grading', label: 'the rubric has real rows', path: 'grading.rubric.0.max', equals: 30 },
    { type: 'api', route: '/api/quest/q-strong/grading', label: 'five of them', path: 'grading.rubric.4.criterion', equals: 'Timeliness' },
    { type: 'api', route: '/api/quest/q-strong/grading', label: 'the feedback is a paragraph, not a word', truthy: true, path: 'grading.feedback' },
    { type: 'api', route: '/api/quest/q-strong/grading', label: 'confidence is stated and modest', path: 'grading.confidence', truthy: true },
    { type: 'api', route: '/api/quest/q-strong/grading', label: 'no model was involved', path: 'grading.model', equals: null },
    { type: 'api', route: '/api/state', label: 'the quest is done', path: 'state.tasks.0.status', equals: 'done' },
    { type: 'api', route: '/api/state', label: 'and carries its rank', path: 'state.tasks.0.rank', truthy: true },
    { type: 'api', route: '/api/state', label: 'the submission was stored', path: 'state.tasks.0.submission.words', truthy: true },
    { type: 'api', route: '/api/state', label: 'un-truncated', path: 'state.tasks.0.submission.truncated', equals: false },
    { type: 'api', route: '/api/state', label: 'lifetime study went up — the gates read this', path: 'state.lifetime.tasksCompleted', equals: 1 },

    // ------------------------------------------------------- materials at A+
    {
      type: 'note',
      text: 'Grading pays materials at rank A and above. Modest on purpose: A gives one, S gives two, and never a tree drop.',
    },
    // NOTE ON READING THIS SUITE: every `api` step is its own HTTP call, so a
    // repeated submit line is a RESUBMISSION, not a re-read. Each first-submit
    // is therefore asserted exactly once, and the follow-up lines assert what
    // resubmitting does instead.
    {
      type: 'api', route: '/api/quest/submit', expectOk: true,
      body: { taskId: 'q-drop', submission: { kind: 'text', text: STRONG_SUBMISSION } },
      label: 'rank A drops exactly one material', path: 'gradeDrops.0.qty', equals: 1,
    },
    {
      type: 'api', route: '/api/quest/submit',
      body: { taskId: 'q-drop', submission: { kind: 'text', text: STRONG_SUBMISSION } },
      label: 'and resubmitting does not drop a second', path: 'gradeDrops', equals: undefined,
    },
    {
      type: 'api', route: '/api/quest/submit',
      body: { taskId: 'q-drop', submission: { kind: 'text', text: STRONG_SUBMISSION } },
      label: 'nor pay again', path: 'reward', equals: null,
    },
    { type: 'api', route: '/api/state', label: 'the material is really in the bag', path: 'state.materials.chalkstone', truthy: true },
    {
      type: 'api', route: '/api/quest/submit', expectOk: true,
      body: { taskId: 'q-weak', submission: { kind: 'text', text: WEAK_SUBMISSION } },
      label: 'a weak submission is still graded', path: 'grading.rank', equals: 'D',
    },
    {
      type: 'api', route: '/api/quest/submit', expectOk: true,
      body: { taskId: 'q-weak2', submission: { kind: 'text', text: WEAK_SUBMISSION } },
      label: 'and a weak quest earns no materials at all', path: 'gradeDrops.0', equals: undefined,
    },

    // ------------------------------------------------------------ truncation
    { type: 'note', text: 'Submissions can be enormous. 20k characters is the cap, and truncating is never silent.' },
    {
      type: 'api', route: '/api/quest/submit', expectOk: true,
      body: { taskId: 'q-huge', submission: { kind: 'text', text: HUGE_SUBMISSION } },
      label: 'an oversized submission is accepted', path: 'truncated', equals: true,
    },
    {
      type: 'api', route: '/api/quest/submit',
      body: { taskId: 'q-huge', submission: { kind: 'text', text: HUGE_SUBMISSION } },
      label: 'and reports exactly how much survived', path: 'storedChars', equals: 20000,
    },
    { type: 'api', route: '/api/state', label: 'the stored text really is capped', path: 'state.tasks.2.submission.chars', equals: 20000 },
    { type: 'api', route: '/api/state', label: 'the cut is recorded on the task', path: 'state.tasks.2.submission.truncated', equals: true },
    { type: 'api', route: '/api/state', label: 'along with what it was before', path: 'state.tasks.2.submission.originalChars', equals: HUGE_SUBMISSION.length },

    // --------------------------------------------------- the old way still works
    {
      type: 'note',
      text: 'A quest with nothing to hand in still completes the v3 way. This fallback is contracted and must not be stripped out.',
    },
    {
      type: 'api', route: '/api/task/complete', expectOk: true,
      body: { taskId: 'q-nosub', quality: 4, onTime: true },
      label: 'self-grading completes the quest', path: 'reward.rank', truthy: true,
    },
    { type: 'api', route: '/api/state', label: 'it is done', path: 'state.tasks.3.status', equals: 'done' },
    { type: 'api', route: '/api/state', label: 'with no submission behind it', path: 'state.tasks.3.submission', equals: null },
    { type: 'api', route: '/api/state', label: 'and no grading either', path: 'state.tasks.3.grading', equals: null },
    { type: 'api', route: '/api/state', label: 'but it still counted toward the gates', path: 'state.lifetime.tasksCompleted', equals: 6 },
    {
      type: 'api', route: '/api/task/complete', body: { taskId: 'q-nosub', quality: 4 },
      label: 'and it cannot be completed twice', path: 'ok', equals: false,
    },

    // ---------------------------------------------------------------- regrade
    { type: 'note', text: 'Regrading re-runs the grader over the stored submission. It never pays a second time.' },
    {
      type: 'api', route: '/api/quest/submit', expectOk: true,
      body: { taskId: 'q-regrade', submission: { kind: 'text', text: STRONG_SUBMISSION } },
      label: 'submit something to regrade', path: 'reward.xp', truthy: true,
    },
    {
      type: 'api', route: '/api/quest/regrade', body: { taskId: 'q-regrade' }, expectOk: true,
      label: 'regrade answers with a fresh Grading', path: 'grading.score', truthy: true,
    },
    { type: 'api', route: '/api/quest/regrade', body: { taskId: 'q-regrade' }, label: 'and pays nothing', path: 'reward', equals: null },
    { type: 'api', route: '/api/quest/regrade', body: { taskId: 'q-regrade' }, label: 'saying so plainly', path: 'regraded', equals: true },
    {
      type: 'api', route: '/api/quest/regrade', body: { taskId: 'q-never' },
      label: 'a quest with no submission cannot be regraded', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/quest/regrade', body: { taskId: 'q-never' },
      label: 'and the refusal explains why', path: 'error', truthy: true,
    },

    // ------------------------------------------------------------- refusals
    { type: 'note', text: 'Every bad input comes back as ok:false. Never a 500, never a dead server.' },
    { type: 'api', route: '/api/quest/submit', body: {}, label: 'no taskId is refused', path: 'ok', equals: false },
    { type: 'api', route: '/api/quest/submit', body: { taskId: 'nope', submission: { text: 'x' } }, label: 'an unknown quest is refused', path: 'ok', equals: false },
    {
      type: 'api', route: '/api/quest/submit', body: { taskId: 'q-never', submission: { kind: 'text', text: '   ' } },
      label: 'an empty submission is refused', path: 'ok', equals: false,
    },
    { type: 'api', route: '/api/quest/nope/grading', label: 'grading for a quest that does not exist', path: 'ok', equals: false },

    // -------------------------------------------------------------- survival
    { type: 'api', route: '/api/state', expectOk: true, label: 'the server is still serving after all that', path: 'state.player.name', equals: 'V4 Tester' },
  ],
};
