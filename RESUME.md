# StudyQuest — RESUME

**See `HANDOFF.md`.** It is the cold-start document: the one command, where the
game is, the guard rail, the rules not to revert, and what is next.

    ./tools/ship.sh          contracts -> smoke -> build -> verify the bundle

This file is kept only so anyone who opens it first is sent to the right place.
Everything below is older scope, left for the record.

---

## OLDER SCOPE, STILL OPEN



### ~~1. Launch menu / title screen~~ — SHIPPED (`web/ui/launch.js`)
### ~~2. Inventory~~ — SHIPPED on `[Tab]` (`web/ui/inventory.js`)
### The keys as they actually stand
W A S D move · E interact · 1/2 select a slot · P boat · L saves · Q quests ·
Tab inventory · **J codex** · Esc unwinds. Free and obvious next: X, R, F, G.

### 1. (was 1) Launch menu / title screen  ← DONE, kept for the record
A GUI that appears **on launch, before the game world**, and is the *only* place
saves are managed. Requirements as stated by the user:

- Pops up when you "log in" — i.e. it is the app's entry point, not an overlay
  you summon mid-game.
- **Save-slot interaction moves here entirely.** The in-game Saves panel
  (`web/ui/saves.js`, currently bound to `[L]`) must be **removed from the game
  HUD** — its slot cards, Load / New Game / Rename / Delete, playtime and
  last-played all migrate into this screen. Do not leave two ways to do it.
- Presumed shape (confirm with the user): title art, the five slot cards,
  Continue (most recent slot), Settings, Quit.
- The native `File ▸ Switch Save` menu should either drive this screen or be
  reconsidered — decide deliberately rather than leaving three routes to saves.
- Because a slot switch already forces `location.reload()`, the launch screen is
  a natural boot gate: load → hide launch screen → start the world.

Files this will touch: a new `web/ui/launch.js`, `web/main.js` (boot order — the
game must not `game.start()` until a slot is chosen), `index.html`, and deleting
the `[L]` binding + dock button. `app/Sources/MenuBar.swift` if the native menu
changes.

### 2. Inventory — keybind and view
There is currently **no inventory screen**. Materials are only visible inside the
Craft panel's Materials tab, which is the wrong home for them.
- Needs its own keybind. **Free keys today: `E` is interact, and taken are
  W A S D / Q C T B I L.** Suggest **`Tab`** or **`X`** — `I` is already Import,
  so if inventory wants `I`, Import must move first.
- Needs a real view: materials with rarity borders, gathering tools with
  durability, passive gear with equip state, relics, and Dark Boxes in one place.
- Decide what leaves the Craft panel so there is one home per concept.

### 3. Top banner (HUD) redesign
The user wants GUI changes to the banner across the top of the screen.
**OPEN QUESTION — ask before building:** what specifically is wrong with it?
Current banner shows: name, level, XP bar, stamina bar, equipped gathering tool
with durability pips, four currency counters, Dark Box count, and a 5-line event
log beneath. Candidate problems: it is dense, the event log overlaps the world,
currencies read as a flat undifferentiated row.

---

## ALSO OUTSTANDING (from this session, not yet built)

- **REGIONS.** Specified in `shared/constants.js` (`REGIONS`, 5 tiers, unlock
  thresholds on lifetime study only) but **nothing enforces them**. Needs real
  worldgen work to partition the map + barriers + an unlock notification.
  This is the biggest remaining piece.
- **The user's real syllabus** has never been imported. Ask for it. Their real
  subjects should also replace the placeholder six in `SUBJECTS`.

## DESIGN DECISIONS THAT MUST NOT BE SILENTLY REVERSED

- **Stamina regenerates on its own** (2.5/min, lazy wall-clock tick in
  `regenStamina`). It is a pacing meter, NOT a gate on studying. An earlier
  design gated all world action behind study-earned Energy; the user changed it
  deliberately. Do not reintroduce the gate.
- **What studying buys is reach**: coins, rare drops at rank A+, and region
  access. The incentive is positive (better places open) not restrictive.
- Sessions pay less per hour than finishing tasks, and are capped daily. This
  stops timer-grinding from beating real work.
- Blueprints gate crafting; the Archivist is the main coin sink.
- Zero dependencies. No npm install, no downloaded assets, all art procedural.

## ARCHITECTURE NOTE
`CONTRACT.md` + `CONTRACT-V2.md` are the interface specs the parallel agents
built against. Read them before changing anything crossing a module boundary.
Ownership split that worked: server / shared-logic / world-canvas / DOM-UI, with
the integrator owning `server.js`, `index.html`, `web/main.js`, `web/style.css`,
`shared/constants.js`.

---

# v3 STATUS (session end, agents cut off by session limit at 5:20pm Madrid)

## Landed and verified (5/5 smoke suites, 84 steps, pre-flight clean)
- `tools/` harness: `check.sh` (syntax + import paths + id-contract checks),
  `smoke.mjs` (data-driven suites, fails on console errors, tests v1→v2→v3 save
  migration), `backup-saves.sh`. **Run `./tools/check.sh && node tools/smoke.mjs`
  before touching anything.**
- Genshin-style UI pass on the inventory + banner; parchment/gold theme in
  `web/ui/theme.js`.
- `web/ui/inventory.js` — full bag, Tab keybind, gadgets used from here.
- `web/ui/launch.js` — WRITTEN BUT NOT WIRED (see below).
- Gadgets + blocks + tree drops in `shared/recipes.js`; all id contracts hold.
- `web/world/art.js`, `lighting.js`, `gates.js` — new world modules.
- Dock trimmed to Quests + Inventory; interaction is role-driven off
  `BUILDING_ROLES` in web/main.js.

## NOT done — pick up here
1. **`web/ui/launch.js` is not wired.** It exports `createLaunch(root, api)` →
   `{show, hide, isVisible, setState}` + an `onChosen` callback. main.js must
   gate `game.start()` on it. Then **delete `web/ui/saves.js`** (contract says
   one home for saves; it is still on disk and still loadable).
2. **ENG-SYSTEMS died before the v3 routes landed.** No `/api/plant`,
   `/api/gadget/use`, `/api/block/place|remove`, no server-side adjacency
   gating, no gate-progress exposure. The DATA exists (recipes/constants) but
   the routes do not — so gadgets show USE buttons that will 404, and trees may
   still respawn. `TREES_REGROW=false` is not yet honoured server-side.
3. **QA never wrote `QA-REPORT.md`** — no adversarial pass happened.
4. Gates are authored client-side but unverified; regions still unenforced.
5. Stale seed log line still says "Energy comes only from real study" — wrong
   since stamina now regenerates.

## Known-good rollback
`git`-less project; the app bundle in `dist/` is built from the current tree and
launches cleanly. Save backups: `~/studyquest/save-backup-*`.

---

# SESSION END 2026-08-30 — TWO CODE REVIEWS LANDED. READ THEM FIRST.

`REVIEW-SERVER.md` (3 blockers, 8 major, 9 minor) and `REVIEW-CLIENT.md`
(2 blockers, 13 major, 8 minor). Every finding was reproduced, not guessed.
**Start the next session by reading both.**

## FIXED AND DEPLOYED this session
- Malformed save no longer bricks the boot (`store.js` guards a non-object
  `player`). Previously one bad slot made slots 2-5 unreachable. Reproduced+fixed.
- Graded quests now pay the grade they show. `computeTaskPayout` took an
  `assessed` flag; a graded submission is no longer also scored on tracked
  minutes, which had capped every essay at rank B and made the rank-A material
  drop and rank-S Dark Box unreachable.
- `openOnly(name, buildingId)` now passes the building into location-gated
  panels via `openAt`/`setLocation` — this is the crafting blocker: the panel
  opened with `location === null` and told you to walk to the house you were
  standing at.

## THE HEADLINE PROBLEM: large amounts of finished code are wired to NOTHING
An agent was mid-way through fixing this and was stopped; it had written nothing.
- `web/world/gates.js` (280 lines) and `web/world/lighting.js` (443 lines) are
  **imported by nothing**. No edge gates exist in the world; the whole v3
  lighting pass is dead.
- `art.js`: `world.js` uses only `SPRITES3.stump`. Trees, saplings, all six
  blocks, all six gate structures, the signpost — finished art, never on screen.
- `world.js` never reads `state.plantings` or `state.placedBlocks`. Planting and
  block placement succeed server-side and render as bare grass.
- `world.js:1159` calls `drawTile` without `tier`/`anim` — authored colour
  temperatures and water animation frames never render.
- `menubg.js` paints a full sunset scene **nobody can see**: `#menubg` is
  z-index 80, `.sq-launch-root` is 90 with an opaque gradient over it. The boot
  suite asserts the canvas is painted, so it passes while the user sees nothing.
- Nine v3/v4 routes have no client caller: `/api/plant`, `/api/block/place`,
  `/api/block/remove`, `/api/interact`, `/api/gates` among them. Trees are
  finite and planting is the only way back, so the forest can only shrink.
- `inventory.js` PLACE posts a *block* id to `/api/build` -> `unknown building
  "fence_wood"`. `/api/block/place` exists and works; nothing calls it.

## OTHER UNFIXED, WORTH DOING EARLY
- Daily session cap caps coins only. XP, stamina, dark boxes and the `lifetime`
  counters the gates read all bypass it, and calls are unlimited: 10 POSTs in
  ~2s reached level 13, 4800 lifetime minutes, and unlocked Quarry Ridge.
- `px`/`py` in a request body override the server's player position, defeating
  every place gate (crafted from 37 tiles away). The client never sends them.
- One Escape both closes a panel and opens the pause box (Quests/Craft/Boxes
  register their handlers before main.js).
- `game.stop()` never releases input: after Quit to Menu, Q at the title screen
  opens the quest log invisibly behind it.
- `Game > Shops ⌘3` in the native menu bypasses location gating entirely.
- `build-app.sh --verify` is a no-op — `VERIFY` is set and never read, so the
  documented orphan-process release check has never run.
- `Panels.swift` Help text teaches three REVERSED rules ("Energy never
  regenerates", "depleted nodes respawn on their own").
- `shops.js` never got the v3 theme pass.
- Harness trap: an `api` step without `expectOk` passes on any `ok:false`
  (`tools/smoke.mjs:191`). Only one live instance today.
- `SPRITES.tiles.stump` is still `makeSprite(TREE_TILE_0, …)` — a tree — masked
  by a `SPRITES3.stump ||` fallback rather than fixed.
- Browser suites (02, 08) flake occasionally; re-run before believing a failure.

## STILL TRUE
Bruno's real subjects and homework have never been imported; SUBJECTS is
placeholder. The v4 grader seam is ready for a real model — see the six-step
header in `server/graders/llm.js`.

- v5 goals and Bruno-confirmed decisions: see CONTRACT-V5.md
