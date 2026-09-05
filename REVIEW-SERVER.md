# REVIEW-SERVER.md

Server + shared + tooling review. Scope: `server/*.js`, `shared/*.js`, `server.js`,
`tools/`. Reviewed against `CONTRACT.md`, `CONTRACT-V2.md`, `CONTRACT-V3.md`,
`CONTRACT-V4-QUESTS.md`, `RESUME.md`.

Everything filed below was reproduced against a scratch server
(`SQ_DATA_DIR=/tmp/sq*`, ports 791x). The real save directory was never touched.
`./tools/check.sh` and `node tools/smoke.mjs --no-browser` both pass on the tree
as it stands (9 suites, 3 skipped for lack of a browser).

---

## BLOCKERS

### [BLOCKER] A malformed save kills the server at boot, and takes every other slot with it
`server/store.js:252`

`migrateState` guards `state.materials`, `state.harvested`, `state.shops`,
`state.meta`, `state.effects` and `state.lifetime` against being the wrong type,
but never guards `state.player`. Line 252 writes `state.player.coins = …`, which
in ESM strict mode throws a `TypeError` if `player` is a primitive. The throw
propagates through `readSlotState` → `loadActiveState` → `loadState`, which is
called at module scope in `server.js:22`. The process dies before `listen`.

Failure scenario — reproduced:
```
$ cat "$SQ_DATA_DIR/Slot 1/state.json"
{"player": 5, "materials": {}, "tasks": []}
$ SQ_DATA_DIR=/tmp/sqtest node server.js
TypeError: Cannot create property 'coins' on number '5'
    at migrateState (server/store.js:252:62)
    at readSlotState (server/slots.js:365:13)
    at loadActiveState (server/slots.js:396:15)
exit=1
```
`loadActiveState`'s fallback loop (`slots.js:400-403`) calls `readSlotState` on
every other slot, so it throws again on the first re-read — a single bad slot
makes slots 2-5 unreachable too. There is no recovery path in the app: the
window never opens, and the native shell has no console to show the user why.
The same throw inside `switchSlot` is caught by `handleApi` and returns
`ok:false`, so this is specifically a boot-time hole.

Confidence: **certain**

---

### [BLOCKER] Nine v3/v4 routes have no client caller — saplings, seedpods and blocks are unspendable, and the forest can only shrink
`server/api.js:1111` `:1129` `:1132` `:1105` `:1108` `:1114` `:1126` `:1142` `:1149`

Grepping `web/` for every route the server exposes:

| route | client references |
|---|---|
| `/api/plant` | **0** |
| `/api/plantings` | **0** |
| `/api/block/place` | **0** |
| `/api/block/remove` | **0** |
| `/api/blocks` | **0** |
| `/api/interact` | **0** |
| `/api/gates` | **0** |
| `/api/gadgets` | **0** |
| `/api/quest/config` | **0** |

`web/main.js:70-125` builds the whole `api` object and it has no `plant`, no
`placeBlock`, no `removeBlock`, no `interact`. `web/world/art.js` already draws
sapling growth stages and block sprites, so the assets exist and nothing can
ever produce them.

Failure scenario: the player fells their first tree (`/api/gather` works). Trees
are permanently finite (`TREES_REGROW = false`, `constants.js:219`) and the
server correctly writes `felled:true` with no `respawnAt`. The only way back is
`/api/plant`, which nothing calls. `defaultState()` seeds `player.saplings = 2`
and the Merchant sells saplings, so the player buys saplings that go into a
counter they can never spend, while the Home Block's forest goes to zero and
stays there. Identically, `craft_block_*` recipes spend real materials and coins
for blocks that can never leave the bag, and the four gates the v3 contract calls
"honest seams" are computed server-side and never displayed.

This is the v3 economic spine (`CONTRACT-V3.md`, "TREES ARE FINITE") failing
closed. It is not a server bug — every one of these routes works when curled —
but the seam is only half built, and the half that is missing is the one that
makes the design solvent.

Confidence: **certain** (route behaviour verified by curl; absence of callers
verified by grep over `web/`)

---

### [BLOCKER] The daily session cap caps coins only — XP, stamina, dark-box rolls and the lifetime totals the gates read all bypass it
`server/api.js:1287-1306`, `shared/economy.js:359`

`routeSessionLog` scales `payout.coins` down to the remaining cap, but:

* `payout.xp` was already computed inside `computeSessionPayout` from the
  **pre-cap** coin total (`economy.js:359`) and is never touched again. A session
  whose coins are zeroed still pays full XP.
* `bumpLifetime(state,'studyMinutes', minutes)` and `bumpLifetime(state,'sessions',1)`
  run unconditionally (`api.js:1309-1310`).
* `grantEnergy(state, ENERGY_PER_TRACKED_MINUTE * minutes)` runs unconditionally
  (`api.js:1335`).
* `minutes` is clamped to 1-480 *per call*, with no limit on calls per day and no
  check that the implied `[startedAt, endedAt]` windows do not overlap.

`level` and `studyMinutes` are both gate metrics (`GATE_METRICS`, `api.js:591`),
and `CONTRACT-V3.md` states you cannot buy your way through a gate — but you can
POST your way through one.

Failure scenario — reproduced. Ten POSTs to `/api/session/log` with
`{minutes:480, focusScore:1.5}`, from a brand-new save, taking about two seconds:

```
coins    {focus:232, insight:173, grind:347, spark:187}   ← cap held
xp       483   level 13                                   ← cap did not
lifetime {studyMinutes: 4800, sessions: 10}
breakdown [... 'daily session coin cap: only 0 of 678 coins awarded']
reward.xp 1048                                            ← paid in full anyway
```
and the gates afterwards:
```
gate_quarry   unlocked=True   studyMinutes 600/600
gate_ashen    unlocked=False  level 13/25, studyMinutes 2400/2400
```
Quarry Ridge unlocked, and the Ashen Waste's 40-tracked-hour requirement fully
satisfied, from ten HTTP requests. 4800 minutes is 80 hours claimed inside one
calendar day and nothing rejects it.

Confidence: **certain**

---

## MAJOR

### [MAJOR] The grade the player is shown and the grade they are paid for are different, and the graded path can never exceed rank B
`server/api.js:822-862`, `server/api.js:924-928`, `shared/economy.js:254-281`

v4 says grading replaces the self-graded quality. In practice `qualityFromScore`
converts the score to a 1-5 quality and hands it to `computeTaskPayout`, which
still blends it with a 35%-weighted **effort** term derived from
`minutesLogged / estMinutes`. A submitted essay normally has `minutesLogged: 0`.
`task.rank` is then set to `payout.rank` (`api.js:849`), not `grading.rank`.

Two consequences:

1. The composite score is capped at `QUALITY_WEIGHT` = 0.65 when no time is
   tracked. The `S` cut is 0.85 and the `A` cut is 0.68 (`economy.js:82-88`), so
   **a perfectly graded submission with no tracked time can never score above
   rank B**. `rollStudyDrop` reads `payout.rank` and requires `A`
   (`STUDY_DROP_MIN_RANK`), so it can never fire on the graded path either, and
   the rank-S guaranteed Dark Box is unreachable.
2. The client stamps `grading.rank` as the big letter and the quest card reads
   `task.rank`. They disagree.

Failure scenario — reproduced. New save, difficulty-4 writing task, 120 est
minutes, the three-paragraph Reformation essay from `07-quests.mjs`:
```
grading.rank = A  (score 82)
reward.rank  = B
task.rank stored = B
breakdown: ['difficulty 4 → 80 pool', 'on time ×1.2',
            'no time tracked → effort 0/35, rank capped near B',
            'Rank B ×1.1', ...]
```
The player is told A and paid ×1.1 instead of ×1.4.

Related: `routeQuestRegrade` (`api.js:976`) and the resubmission branch
(`api.js:910`) both overwrite `task.rank` with `grading.rank`, so a regrade
silently changes the stored rank onto a different scale from the one the payout
used. The rank in the save after a regrade no longer corresponds to what was
paid.

Confidence: **certain**

---

### [MAJOR] `px` / `py` in the request body override the server's own player position, defeating every v3 place gate
`server/api.js:481-491`

`playerPosition` prefers `b.px`/`b.py` (or `b.playerX`/`b.playerY`) over
`state.player.x/y`, which the world commits authoritatively. The comment calls
this "the same trust boundary the gather route already draws", but gather trusts
the *terrain*; this trusts the *position*, which the server already owns.

Failure scenario — reproduced:
```
POST /api/player/move {x:60, y:45}
POST /api/craft {"recipeId":"craft_axe"}
  -> ok:false "you need to be at a house to craft — the Study Hut at 22,17 will do.
     You are at 60,45, 37 tiles away."
POST /api/craft {"recipeId":"craft_axe","px":22,"py":17}
  -> ok:true, axe crafted from 37 tiles away
```
This applies to every gated route: `/api/craft`, `/api/shop/buy`,
`/api/shop/sell`, `/api/exchange`, `/api/tool/repair`.

Second-order problem: `web/main.js` never sends `px`/`py` at all — the parameter
has no client implementation. So the gate always falls back to the position
committed by `onMoveCommit`, which fires "at most every 400ms and only when the
tile changes" (`web/main.js:273`). Walking up to the Study Hut and pressing E
inside that window is refused for a position the player has already left. The
server built a protocol the client does not speak, and the fallback has a race.

Confidence: **certain** (bypass reproduced; client absence verified by grep)

---

### [MAJOR] `dueInDays` never decays and can never be negative, so the late penalty and the Timeliness rubric row are unreachable
`server/api.js:1189`, `server/api.js:2053-2055`, `server/api.js:926`

`dueInDays` is stored as a static integer at creation and nothing decrements it
over wall-clock time (grepped: it is only ever written by `routeTaskCreate`,
`routeTasksImport` and the seed). Both write paths clamp it to `[0, 365]`, and
`normalizeDue` in the importer clamps to `[0, 365]` as well
(`server/import.js:184, 189`).

Consequences:
* `routeQuestSubmit` computes `onTime: !(dueInDays < 0)` — always `true`. Every
  graded submission gets the ×1.2 on-time bonus forever; the ×0.6 late branch in
  `computeTaskPayout` (`economy.js:286`) is dead on the graded path.
* The grader's Timeliness row (`server/grader.js:240-256`) has a `d < 0` late
  branch that can never execute; the row scores 12-15/15 unconditionally.
* An imported syllabus entry whose real deadline has already passed
  (`due 2026-08-01` imported today) becomes `dueInDays: 0` — "due today" — rather
  than being flagged as overdue. A real syllabus paste is exactly where this
  shows up.

The deadline pressure the whole quest design implies simply does not exist. This
needs either a stored absolute due date or a per-request decay, not a stored
relative one.

Confidence: **certain**

---

### [MAJOR] Three declared building roles are never enforced, and four world routes have no positional gate at all
`server/api.js:438-452` vs `server/api.js:1414, 1894, 2003, 2013, 2023`

`BUILDING_ROLES` declares `boxes` (observatory/shrine), `blocks` (workshop) and
`study` (library). `ROLE_PHRASE` and `ROLE_VERB` both carry copy for all three.
`requireRole` is called for exactly `craft`, `repair` and `shop` — never for
`boxes`, `blocks` or `study`.

So `placeReport` renders "Observatory — press E to open Dark Boxes" and
"Workshop — press E to manage blocks" as if those were locations, while
`/api/box/open` and `/api/block/place` answer from anywhere in the world.
`/api/plant` and `/api/gather` have no adjacency check of any kind either — the
06-v3 suite itself fells a tree at `40,10` while the player stands at `22,19`.

Failure scenario: the player builds an Observatory because the prompt implies
Dark Boxes need one; it changes nothing. Conversely a player with no Observatory
opens boxes anyway, so the building is a pure coin sink with no function.

Confidence: **certain**

---

### [MAJOR] A request body over 1 MB is dropped with no error, and its handler promise never settles
`server.js:33-45`

`readBody` destroys the socket at 1 MB (`if (raw.length > 1e6) req.destroy()`).
`req.destroy()` emits `close`, not necessarily `error`, and there is no `close`
handler — so neither the `end` nor the `error` resolver runs and the promise is
never settled. The `await readBody(req)` in the request handler is pinned
forever. One leaked pending frame (plus its accumulated `raw` string) per
oversized request.

The client sees a reset connection with no JSON at all, so it cannot show
"that paste is too big".

Failure scenario — reproduced against `/api/tasks/import` with a 1.2 MB body:
```
curl ... -> http=100, exit 56 (connection reset by peer)
/tmp/bigout.txt: (empty)
server: still alive, nothing logged
```
This is reachable in normal play twice over. `/api/tasks/import` exists precisely
to take a pasted real syllabus. And the v4 composer attaches a file via
FileReader and posts its full text — `MAX_SUBMISSION_CHARS` truncation happens in
`normalizeSubmission`, i.e. *after* `readBody` — so attaching any text file over
~1 MB fails silently on the headline v4 feature.

Confidence: **certain**

---

### [MAJOR] Every `/api/player/move` rewrites the entire save synchronously
`server/slots.js:114-125`, `server/api.js:1355-1363`

`routePlayerMove` calls `save(state)` → `writeSlotState` → `writeJson`, which
does `fs.writeFileSync(tmp, JSON.stringify(obj, null, 2))` + `renameSync` on the
whole state, then does it a second time for `meta.json`. The world commits a move
roughly every 400ms while walking.

v4 made this much worse: `task.submission.text` is stored on the task at up to
20,000 characters each, and `MAX_IMPORT` allows 200 tasks in one paste.

Failure scenario — measured. A save with 120 graded quests, each carrying a
20,000-character submission, is 2.44 MB on disk. Twenty `/api/player/move`
requests took 336 ms wall (~17 ms each), and each one pretty-printed and wrote
that full 2.44 MB synchronously — about 6 MB/s of write amplification while the
player is simply walking, on the event-loop thread. `state.sessions` also grows
without bound (no cap, unlike `state.log`'s 200), so this only gets worse over a
save's life.

The atomic tmp+rename means no corruption risk, so this is throughput and disk
wear, not data loss. A dirty flag, a debounce, or simply not persisting position
on every commit would all fix it.

Confidence: **certain**

---

### [MAJOR] Two different definitions of "today" in the same codebase
`server/api.js:141` and `:2395`, `server/store.js:69` vs `shared/economy.js:471` and `server/shops.js:97`

UTC (`new Date().toISOString().slice(0,10)`):
* `touchStreak` — the daily streak
* the Portable Bench's `craftPermitDay`
* `defaultState().meta.day`

Local (`getFullYear()/getMonth()/getDate()`):
* `sessionCoinsToday` — the daily session coin cap
* `localDayKey` — merchant stock reroll and `brokerBoxesSoldToday` reset

Failure scenario: the user is in Madrid (UTC+2). They study at 23:00 local on
the 29th and again at 01:00 local on the 30th. Both land on UTC date
`2026-08-29`, so `touchStreak` sees `lastActiveDate === today` and returns early
— two consecutive real days of study advance the streak once. Meanwhile the coin
cap and the shop stock both rolled over at local midnight in between. In the
other direction, a session at 01:00 local on the 30th followed by one at 23:00
local on the 30th is recorded as two different UTC days and can double-advance
the streak.

Confidence: **certain** (the mixed boundary is plain in the code; the specific
streak outcome is **likely** — it depends on which side of midnight the user
plays, which for a study app is the common case)

---

## MINOR

### [MINOR] `/api/dev/reset` wipes playtime and creation date
`server/api.js:1620-1633`

`routeReset` preserves only `meta.slot` and `meta.name`, so `createdAt` resets to
now and `playtimeMs` resets to 0. The slot listing (and the launch menu built on
it) then shows a save the player has had for weeks as brand new with no playtime.
The reset is meant to clear the *game*, not the slot's identity — the comment
says as much and then only carries two of the five identity fields.

Confidence: certain

### [MINOR] The importer reads `- [x]` as done and throws the flag away
`server/import.js:473-490` and `:500`

`parseLooseLine` returns `{ fields, done }` and `parseLinesFormat` destructures
only `{ fields }`. A markdown checklist with items already ticked imports every
one of them as `status: 'todo'`, so pasting a term's finished work hands the
player a stack of free completions. `buildDraft` has no `status` field for it to
flow into either, so this is a two-line gap rather than a one-line one.

Confidence: certain

### [MINOR] `state.sessions` grows without bound
`server/api.js:1328-1329`

`state.log` is capped at 200 (`store.js:27, 516`). `state.sessions` has no cap,
and `sessionCoinsToday` scans the entire array on every session log. It is also
the second-largest contributor to the save-size problem above.

Confidence: certain

### [MINOR] The smoke harness lets an `api` step pass on `ok:false`
`tools/smoke.mjs:191`

```js
if (step.expectOk !== false && r.json && r.json.ok === false && step.expectOk !== undefined) {
```
The trailing `step.expectOk !== undefined` means a step that simply omits
`expectOk` never fails on an error response. Separately, `if (step.path)` at
:198 returns with no assertion when neither `equals` nor `truthy` is given.

Demonstrated with a probe suite:
```
✓ this should surely fail  /api/definitely/not/a/route -> HTTP 200
✓ crafting garbage         /api/craft -> HTTP 200
PASS  99-probe  2 step(s)
```
Both steps got `{ok:false, error:"unknown route"}` / `{ok:false, error:"unknown
recipe"}` and both passed.

Audited the whole suite directory for live instances: of 158 `api` steps, exactly
**one** currently asserts nothing (`05-api.json`, "state carries the shops key" —
it sets `path` with no `equals`/`truthy`). So this is a latent trap rather than
an active cover-up, but it is the exact shape of the 02-play precedent and the
next test someone writes will fall in it.

Confidence: certain

### [MINOR] 02-play still exercises input without asserting any effect
`tools/checks/02-play.json`

The launch-menu regression is genuinely fixed — the `eval` that clicks Continue
is followed by a `waitFor` on `.sq-launch-root` being hidden, which would fail if
the click missed. Good.

What remains: 20 keypresses of `w`/`a`/`s`/`d` and three of `e`, followed by
screenshots and no assertion. Nothing checks `state.player.x` changed, that a
gather happened, or that the quest panel actually opened (only that pressing Q
threw nothing). If the movement keybinding broke tomorrow the suite would still
pass on 35 steps.

`allowConsole` also whitelists `ERR_CONNECTION_REFUSED.*\/api\/player\/move`,
which suppresses the one console signal that would prove moves are not reaching
the server.

Confidence: certain

### [MINOR] Skipped suites are counted as a pass in the final verdict
`tools/smoke.mjs:411-416`

`--no-browser` skips 01-boot, 02-play and 08-quest-ui and the run still prints
`✓ all 9 suite(s) passed (3 skipped)`. The skip count is shown, but a CI gate
reading the exit code cannot tell a full run from a third of one.

Confidence: certain

### [MINOR] The Portable Bench's `oncePerDay` guard is written backwards
`server/api.js:2396`

```js
if (effect.oncePerDay && eff.craftPermitDay === today && (num(eff.craftPermits) ?? 0) <= 0)
```
This refuses only when the permit has *already been spent*. Using the bench,
banking the permit, and using it again passes the guard and accumulates a second
permit. It is unreachable today only because `portable_bench.cooldownMs` is
24 hours and the cooldown check at :2321 runs first — so the guard is dead code
that says the opposite of what it means, and it becomes live the moment anyone
retunes that cooldown.

Confidence: certain

### [MINOR] The "Loaded <save>" log line is written after the save is flushed
`server/api.js:2107`

`switchSlot` calls `writeSlotState(next)` (`slots.js:487`) and *then*
`routeSlotsSwitch` calls `pushLog(res.state, …)`. The line exists in the returned
state and is lost from disk until the next mutating request.

Confidence: certain

### [MINOR] The Focus Bell boosts task payouts, not just sessions
`server/api.js:842`

`consumeStudyBuff` is called from `payOutTask` as well as `routeSessionLog`.
`GADGETS.focus_bell.desc` says "the next study payout", which is arguably either;
`CONTRACT-V3.md` describes it as "a bell that boosts the next study session's
payout". A bell rung and then spent on a difficulty-5 task completion is worth
considerably more than one spent on a capped session. Flagging as intent drift,
not a defect — confirm which was meant.

Confidence: certain (behaviour); the contract reading is a judgement call

---

## What I checked and found healthy

* **`shared/recipes.js` id contracts.** The load-time `assertKeys` block plus
  `tools/lib/idcheck.mjs` genuinely cover the ground: every `MATERIAL_ID`,
  `TOOL_ID`, `BUILDING_ID`, `GADGET_ID`, `BLOCK_ID` has an implementation, every
  gadget and block has a recipe, every footprint matches
  `BUILDING_FOOTPRINT`, every gate resolves to a real region, every tree drop is
  a real material. This is the seam the project historically broke on and it is
  now properly nailed down. `./tools/check.sh` is clean (17 contracts, 1 pending
  — `SHOP_IDS`, which nothing needs).
* **Slot storage and the v1→v2→v3 layout migration.** `migrateFlatSlot` and
  `migrateLegacyOnce` (`slots.js:252-326`) do parse-before-write, write, read
  back, verify `player` exists, and only then remove the source — and the v1 flat
  file is renamed to `.migrated` rather than deleted. `writeJson` is tmp+rename
  throughout, so a crash mid-write cannot leave a torn save. `03-migration.mjs`
  and `04-save-durability.mjs` are the two best tests in the repo: they assert
  named values field by field across three save generations, prove the second
  and third boots re-migrate nothing, and prove an untouched slot stays
  untouched. I could not find a way to lose a save through the slot routes.
* **`tools/lib/server.mjs` safety.** `assertScratch` hard-refuses any data dir at
  or under `~/Library/Application Support/StudyQuest`, and `GameServer.start`
  calls it before every boot including restarts. The harness cannot reach real
  progress.
* **`handleApi` error containment.** Every route including the two `await`ed v4
  ones is inside one try/catch that returns `{ok:false}` at HTTP 200, and
  `server.js` has a second catch behind it. I could not get an unhandled throw
  out of any route — the only crash I found is at boot, before `handleApi`
  exists (blocker 1).
* **The v4 grader seam.** `server/graders/llm.js` throws with an actionable
  message and makes no network call; `SQ_GRADER` defaults to `stub` and an
  unknown value falls back to `stub` rather than erroring. `normalizeGrading`
  coerces and validates, and rejects a rubric with fewer than 3 rows. Grader
  failure leaves the task untouched — `09-grader-seam.mjs` asserts status,
  submission, grading, coins and lifetime all unchanged after a refusal, and it
  passes. The stub is hash-seeded on `(task.id, text)`, so a regrade cannot be
  re-rolled for a better number. Submission truncation is at 20k, recorded on
  the stored record with `originalChars`, surfaced in the response and in the
  log. Resubmission regrades but explicitly pays nothing —
  `07-quests.mjs` asserts both the no-second-drop and the no-second-payment
  paths. This is the best-built part of the server.
* **`migrateQuestFields` on every request.** Running it in the router rather than
  once at load is the right call given tasks are created by three paths, it only
  ever adds, and it is idempotent. Verified a pre-v4 task fixture comes back with
  both keys and nothing lost.
* **Shop economics.** Buyback at 40% and the exchange's 15% haircut are both
  strict losses, so there is no arbitrage loop between them. Merchant stock is
  seeded per local day via mulberry32 so it survives restarts. The broker's
  ×1.6 escalation is read off `brokerBoxesSoldToday` at purchase time and a stale
  offer id is refused with the real current price rather than charged wrongly.
  Blueprints are checked for prior ownership before charging.
* **Fractional block refunds.** `creditFractional` (`api.js:401-431`) banks the
  sub-unit remainder and pays it out on crossing a whole unit, with a `1e-9`
  epsilon on the floor. Correct, and nothing is lost to rounding. (It is
  currently unreachable — see blocker 2.)
* **Dark boxes.** `rollDarkBox` pity counter is bounded, resets on epic+, and
  `routeBoxOpen` checks the balance before spending and filters drops against
  `MATERIAL_IDS` so a bad drop cannot inject a tree material. Tree drops are
  correctly excluded from both the box pool (`economy.js:390-398`) and
  `rollStudyDrop` / `rollGradeDrops`.
* **Replanted trees take a full three swings.** I expected an off-by-one here —
  `harvested[key].hitsLeft` is 0 on a felled tree — but `routePlant:2248` deletes
  the harvested record when the stump is planted, so `hitsLeft` resets to
  `node.hits`. Checked specifically; it is right.
* **`applyLevelUps`** has a 500-iteration ceiling against a corrupt `xp`.
* **Static file serving** (`server.js:47-60`) resolves inside `ROOT` and refuses
  unknown extensions.
* **`06-v3.mjs`** is a real suite: it proves a felled tree writes no `respawnAt`
  and refuses later swings, that stone still respawns, that a planting matures on
  wall-clock time from a past-dated fixture, that a gadget goes on cooldown, that
  a block refunds at `BLOCK_REFUND_RATE`, and that craft/trade/repair are refused
  away from a building and allowed next to one. 82 steps, nearly all with real
  assertions.

## Not covered

* `web/` and `app/` — the second reviewer's scope. I looked at `web/main.js` only
  far enough to establish which server routes have callers (blocker 2, major 5);
  I did not review any client logic.
* `build-app.sh`, `tools/backup-saves.sh`, `tools/lib/cdp.mjs`,
  `tools/lib/proc.mjs`.
* The three browser suites (01-boot, 02-play, 08-quest-ui) were read but not
  executed — I ran `--no-browser`. 02-play is reviewed above from its source;
  01-boot and 08-quest-ui I read without running.
* I did not audit `shared/recipes.js`'s recipe *balance* (costs vs. what the
  economy pays), only its structure and id contracts.
* I did not stress concurrency — a single-player local server with one in-memory
  `state` object and no request queue means two overlapping mutating requests
  interleave on the same object, but I found no realistic client path that issues
  them concurrently and did not chase it.
