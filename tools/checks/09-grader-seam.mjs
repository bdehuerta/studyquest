// tools/checks/09-grader-seam.mjs — the seam itself, with SQ_GRADER=llm.
//
// The point of v4 is that grading is swappable. The point of THIS suite is that
// the swap is honest: with the model grader selected and no model wired up,
// submitting must fail loudly and change nothing. A grader that quietly fell
// back to the stub while claiming to be a model would be worse than no grader
// at all, because the reward it drove would be a lie.
//
// If someone later implements server/graders/llm.js, this suite's expectations
// flip from "refused" to "graded, grader:'llm'" — and that is exactly the
// signal you want a test to give you.

function task(id) {
  return {
    id, title: 'Essay on the causes of the Reformation',
    subject: 'history', workType: 'writing',
    difficulty: 4, estMinutes: 120,
    status: 'todo', minutesLogged: 90,
    rank: null, dueInDays: 2, completedAt: null,
  };
}

export default {
  name: 'v4 seam — SQ_GRADER=llm refuses honestly instead of faking a grade',
  order: 90,
  browser: false,

  env: { SQ_GRADER: 'llm' },

  seed: {
    'Slot 1/state.json': {
      player: {
        name: 'Seam Tester', level: 3, xp: 0, xpToNext: 500,
        x: 24, y: 18,
        coins: { focus: 7, insight: 7, grind: 7, spark: 7 },
        darkBoxes: 0, streak: 0, lastActiveDate: null,
        energy: 50, maxEnergy: 100,
        gatherTools: [], activeGatherTool: null, saplings: 0,
      },
      materials: {}, tools: [], buildings: [], pendingBuildings: [],
      tasks: [task('seam-1')],
      sessions: [], log: [], harvested: {}, blueprints: [], relics: [],
      plantings: {}, gadgets: {}, cooldowns: {}, blocks: {}, placedBlocks: {},
      refundBank: { materials: {}, coins: {} }, effects: {},
      lifetime: { tasksCompleted: 0, studyMinutes: 0, sessions: 0, treesFelled: 0, saplingsPlanted: 0, blocksPlaced: 0 },
    },
    'Slot 1/meta.json': {
      slot: 1, name: 'Seam Tester', createdAt: 1750000000000, lastPlayedAt: 1750000000000,
      playtimeMs: 1000, level: 3, tasksDone: 0, tasksTotal: 1, savedAt: 1750000000000,
    },
  },

  steps: [
    { type: 'note', text: 'SQ_GRADER=llm selects server/graders/llm.js, which is a marked stub that throws.' },
    { type: 'api', route: '/api/quest/config', expectOk: true, label: 'the server admits which grader is selected', path: 'grader', equals: 'llm' },
    { type: 'api', route: '/api/quest/config', label: 'and does not claim it is a local estimate', path: 'graderNote', equals: 'graded by a language model' },

    {
      type: 'api', route: '/api/quest/submit',
      body: { taskId: 'seam-1', submission: { kind: 'text', text: 'A perfectly reasonable answer about indulgences and printing.' } },
      label: 'submitting is refused, not faked', path: 'ok', equals: false,
    },
    {
      type: 'api', route: '/api/quest/submit',
      body: { taskId: 'seam-1', submission: { kind: 'text', text: 'A perfectly reasonable answer about indulgences and printing.' } },
      label: 'and the refusal says exactly what is missing', path: 'error',
      equals: 'grading failed: the language-model grader is not configured yet — set ANTHROPIC_API_KEY and implement gradeWithLLM (see the checklist at the top of server/graders/llm.js). Run with SQ_GRADER=stub (the default) to use the local estimator instead.',
    },

    { type: 'note', text: 'A failed grade must leave the save exactly as it was — no half-completed quest, no coins.' },
    { type: 'api', route: '/api/state', label: 'the quest is untouched', path: 'state.tasks.0.status', equals: 'todo' },
    { type: 'api', route: '/api/state', label: 'nothing was stored', path: 'state.tasks.0.submission', equals: null },
    { type: 'api', route: '/api/state', label: 'and nothing was graded', path: 'state.tasks.0.grading', equals: null },
    { type: 'api', route: '/api/state', label: 'no coins were paid', path: 'state.player.coins.florin', equals: 28 },   // 7+7+7+7, collapsed, unchanged by the failed grade
    { type: 'api', route: '/api/state', label: 'and the gates did not move', path: 'state.lifetime.tasksCompleted', equals: 0 },

    { type: 'note', text: 'The fallback path does not go through the grader, so it still works with the model selected.' },
    {
      type: 'api', route: '/api/task/complete', body: { taskId: 'seam-1', quality: 3, onTime: true },
      expectOk: true, label: 'self-grading still completes a quest', path: 'reward.rank', truthy: true,
    },

    { type: 'api', route: '/api/state', expectOk: true, label: 'the server survived a grader that throws', path: 'state.player.name', equals: 'Seam Tester' },
  ],
};
