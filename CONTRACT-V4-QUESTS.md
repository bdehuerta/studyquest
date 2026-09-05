# v4 — Quests become submitted work, graded

Read CONTRACT-V3.md first. All prior rules hold (zero dependencies, no downloaded
assets, procedural art, location-gated economy, stamina regenerates, studying buys reach).

## The change
Today a quest is completed by **self-grading**: you click Complete and pick a
quality 1-5. That is the weakest link in the whole design — the reward is
whatever you say it is.

v4 replaces it: you **submit the actual work**, it gets **graded**, and the grade
drives the reward. The grader will eventually be a small LLM. **This round builds
the GUI and the full seam, with a local stub grader — no model is called yet.**

## The seam (this is the important part)
`server/grader.js` owns grading and nothing else knows how it works.

```js
export async function gradeSubmission({ task, submission, state }) -> Grading
```

`Grading` — the contract every grader must satisfy, stub or model:
```js
{
  rank: 'F'|'D'|'C'|'B'|'A'|'S',
  score: 0..100,
  rubric: [ { criterion, score, max, comment } ],   // 3-5 rows
  feedback: 'a short paragraph addressed to the student',
  strengths: [string], improvements: [string],
  confidence: 0..1,
  grader: 'stub' | 'llm',
  model: string|null,
  gradedAt: number,
}
```

Selection is by `process.env.SQ_GRADER` (`stub` default, `llm` later). The LLM
adapter must exist as a **clearly-marked stub file that throws a helpful "not
configured yet" error** — never a fake that pretends to work, and never a
network call. Design its request/response shape against the real Anthropic
Messages API so wiring it later is small: **load the `claude-api` skill before
writing that adapter** and follow it for model ids and message shape.

The stub grader must be genuinely useful for exercising the UI: derive a
plausible score from real signals it can see (submission length vs the task's
estimated minutes, whether it was on time, difficulty, keyword overlap with the
title), produce a real rubric, and vary its output. Label it honestly as an
estimate everywhere it surfaces.

## Rewards
Grading replaces the self-graded `quality`. Feed the resulting rank into the
existing `computeTaskPayout` path so coins/xp/stamina/box logic is unchanged.
**Additionally, grading awards resources** — that is the user's ask. Rank A and
above drops materials (reuse the `rollStudyDrop` shape and weighting: bias toward
what the player holds least). Higher ranks drop more and rarer. Keep it modest —
studying must stay the best route to reach, not become a materials firehose.

## Routes
```
POST /api/quest/submit   { taskId, submission: { kind:'text'|'file', text, filename? } }
                         -> { ok, state, grading, reward }
GET  /api/quest/:id/grading                    -> { ok, grading }
POST /api/quest/regrade  { taskId }            -> only if a submission exists
```
Store `task.submission` and `task.grading` on the task. Submissions can be large:
cap stored text (say 20k chars) and say so when truncating. Keep the old
self-grade path working as a fallback for tasks with no submission — do not
strip it out.

## The GUI (the deliverable the user actually sees)
Rebuild the quest panel in the v3 parchment/gold theme, with three states per quest:

1. **Open** — the quest card as now, but the primary action is **Submit Work**.
2. **Composer** — a real writing surface: a large textarea, a word/char count
   against the task's expectations, the task's own brief shown alongside so you
   can see what you're answering, an attach-a-file affordance (read locally via
   FileReader, no upload service), and a Submit button. Draft text must survive
   closing the panel.
3. **Graded** — the result, and this should feel like the reward moment: the rank
   as a large stamped letter, the rubric as rows with score bars, the feedback
   paragraph, strengths/improvements, the resources awarded, and a Resubmit
   option. Show the grader's identity and confidence honestly — when it is the
   stub, say so plainly ("estimated locally — no model configured").

A "grading…" state is required and must look deliberate (this will be a real
network round-trip later, taking seconds).

## Rules
Own: `web/ui/tasks.js`, `server/grader.js` (new), `server/api.js`, and you may add
`server/graders/llm.js`. Nothing else. One namespaced `<style>` tag, `.sq-tasks-*`.
No libraries, no external calls, no alert/confirm/prompt. Every new state key in
`defaultState()` and the migration path.
Verify with `./tools/check.sh` and `node tools/smoke.mjs` — both must pass, and add
coverage for submit → grade → reward, plus the truncation and no-submission paths.
