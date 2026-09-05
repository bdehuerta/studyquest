# REVIEW-CLIENT — browser client + native app

Scope: `web/main.js`, `web/menubg.js`, `web/pause.js`, `web/style.css`, `index.html`,
`web/world/*.js`, `web/ui/*.js`, `app/Sources/*.swift`, `app/IconGen/main.swift`,
`build-app.sh`. Reviewed against `CONTRACT.md`, `CONTRACT-V2.md`, `CONTRACT-V3.md`,
`CONTRACT-V4-QUESTS.md`, `RESUME.md`.

Everything marked **certain** below was reproduced by driving the real app in headless
Chrome over CDP against a scratch `SQ_DATA_DIR`. The user's real saves were not touched.
Screenshots were read back and inspected. Boot is clean: zero console errors, zero
exceptions, zero sprite row-width warnings.

---

## BLOCKERS

### [BLOCKER] Crafting is unreachable — the craft panel's location is never set
web/ui/craft.js:164, web/ui/craft.js:579-580, web/main.js:207-211

`craft.js` starts with `let location = null` and only ever leaves that state via
`setLocation(buildingId)` or `doOpen(buildingId)`. `main.js` opens the panel through
`openOnly()`, which calls `p.open()` with **no argument** — so `doOpen(undefined)` skips
`setLocation` and `location` stays `null` for the life of the session. `render()` then
takes the `if (!location) { renderNowhere(); return; }` branch every single time.
`setLocation`, `openAt` and `getLocation` are exported and never called by anything.

Failure scenario: walk up to the Study Hut, press E -> the Craft panel opens showing
**"NO BENCH IN REACH — YOU MUST BE AT A HOUSE TO CRAFT"** and then lists
"Study Hut … standing at 22, 16". It tells you to walk to the building you are standing
at. There is no recipe list, no craft button, no way through. The same happens at the
Forge and the Lab. Crafting cannot be performed at all in the shipped client.

Confidence: certain (reproduced; screenshot read back)

### [BLOCKER] "Place" on a block posts a block id to /api/build and destroys the action
web/ui/inventory.js:551-561, web/main.js:121-125, web/world/build.js:22-25

`requestPlacement()` falls through to `api.requestBuildMode(blockId)` because main.js
exposes no `requestBlockMode`/`placeBlock`. That enters the **building** ghost with a
block id: `footprintOf('fence_wood')` misses `BUILDING_FOOTPRINT` and returns 1x1,
`buildingSprite('fence_wood')` returns null, and `drawSprite` paints its magenta
missing-art placeholder. Confirming posts `/api/build {buildingId:'fence_wood'}`, which
the server answers `{"ok":false,"error":"unknown building \"fence_wood\""}`.

The correct routes exist server-side and the client calls none of them:
`/api/block/place`, `/api/block/remove`, `/api/blocks`, `/api/plant`, `/api/plantings`,
`/api/gates`, `/api/interact`. Only `/api/gadget/use` is wired.

Failure scenario: Tab -> BLOCKS -> PLACE on a wooden fence -> a solid magenta square
follows the cursor with the toast "PLACING FENCE WOOD — CLICK TO CONFIRM" -> click ->
nothing is placed, a red error toast flashes for 1.2s and is gone. The block is not
consumed but the whole feature is dead. Blocks and their refund path (a V3 deliverable)
are unreachable.

Confidence: certain (reproduced; ghost screenshot read back, server response captured)

---

## MAJOR

### [MAJOR] web/world/gates.js is imported by nothing — the four edge gates do not exist
web/world/gates.js:1-280, web/world/world.js:5-32

`gates.js` exports `buildGates`, `studyTotals`, `gateProgress`, `refusalLines`,
`progressSummary`, `gateSolidAt`, `gateThresholdAt`, `gateAt`, `gateInApproach`,
`gateHintAnchor`. Grep across `web/ shared/ server/ tools/ index.html`: the only line
that mentions `gates.js` is its own header comment. `world.js` imports
`constants, recipes, art, sprites, player, build` and nothing else. The module is 280
lines of dead code, and with it `art.js`'s `GATE_SPAN/GATE_RISE/VGATE_*`.

CONTRACT-V3 "THE MAP IS NOW THE HOME BLOCK" requires a visible thematic gate with a
signpost on each of the four sides, and "Walking into one gives a readable refusal,
never silence."

Failure scenario: walk north until the camera stops at row 0 -> plain grass and trees to
the map edge, no structure, no signpost, no refusal, no message of any kind. The server
already serves the data (`GET /api/gates` returns all four with live progress rows); the
client never asks.

Confidence: certain (reproduced; walked to the north edge, screenshot read back)

### [MAJOR] web/world/lighting.js is imported by nothing — the whole lighting pass is dead
web/world/lighting.js:1-443

Same test, same result: the only mention of `lighting.js` anywhere is its own header.
`createLighting`, `groundTier`, `drawGroundAO`, `drawContactShadow`, `drawWaterSpecular`,
`drawLightPool`, `drawGrade`, `swayOffset`, `SUN`, `SHADE`, `SUN_VEC` are all unreferenced.

Compounding it: `world.js:1159` calls `drawTile(ctx, tileId, tx, ty, px, py, S)` with
seven arguments, but the signature is `drawTile(ctx, tileId, x, y, px, py, scale, tier,
anim)` (sprites.js:1620). `tier` and `anim` arrive `undefined`, so `tileSprite` always
falls back to `tiers.mid` and water's frame index is `(0 + x*2 + y) % 4` — constant per
tile. The three authored colour temperatures (`GRASS_TIERS.shade/sun`, `SAND_TIERS`,
`PATH_TIERS`) and the four rolled water frames never appear.

Failure scenario: the world is uniformly flat-lit, water never moves, there is no sun
dapple, no contact shadow, no ambient occlusion. This is the "obviously, visibly a
different game to look at" half of the V3 visual pass, and none of it renders.

Confidence: certain (grep + code path; visually confirmed on the in-world screenshot)

### [MAJOR] Only `SPRITES3.stump` reaches the screen — every other sprite in art.js is dead
web/world/art.js:619-656, web/world/world.js:1153

`world.js` imports `{ SPRITES3 }` and uses exactly one key: `SPRITES3.stump`. Unused:
`SPRITES3.trees` (oak + pine canopy/trunk pairs with `canopyDy` and `sway`),
`SPRITES3.saplings` (sprout / seedling / young), `SPRITES3.blocks` (path_stone, 16 fence
variants, 16 wall variants, lamp_post, planter, signpost), `SPRITES3.gates` (six pieces),
`SPRITES3.signpost`. Unused helper exports: `blockSprite`, `saplingSprite`, `treeSpecies`,
`CONNECTING_BLOCKS`, `SOLID_BLOCKS`, `BLOCK_RISE`, `BLOCK_NAMES`, `SAPLING_STAGE_IDS`,
`BLOCK_ID_LIST`, `CONNECT_N/E/S/W`.

I rendered every one of them into a canvas and looked at the result. **None is blank and
none is a placeholder** — they are finished, good-looking sprites, including all six gate
structures at 144x96 and 64x144. This is completed art that has never been on screen.

The file's own header says "In v3 every piece of scenery below is a transparent sprite
drawn in the depth-sorted object pass over real ground". `world.js` still draws trees as
the flat v1 16x16 `SPRITES.tiles.tree`, in the tile loop, with no object pass, no
overhang, no sway, no shadow.

Confidence: certain (grep + rendered sheet, screenshots read back)

### [MAJOR] Planted saplings and placed blocks are invisible — world.js never reads either state key
web/world/world.js:344-368 (`rebuildHarvested`), web/world/world.js:370-392 (`setState`)

`setState` mirrors `state.buildings` and `state.harvested` and nothing else. `state.plantings`
and `state.placedBlocks` (both defined in `server/store.js:198-200`, both migrated, both
written by live routes) are never read by the renderer, and the strings `plantings` /
`placedBlocks` do not appear anywhere under `web/`.

Failure scenario: `POST /api/block/place {blockId:'lamp_post',x:25,y:19}` and
`POST /api/plant {x:27,y:21,tile:'grass'}` both return `ok:true`. The HUD event log prints
"Placed a Stone Wall at 26,19" and "Planted a sapling at 27,21. A mature tree in 2h" — and
the tiles in question stay bare grass and path. The player is told the thing happened and
sees no evidence of it. CONTRACT-V3 requires "Growth stages must be visible in the world
(sprout -> sapling -> young -> mature)".

Confidence: certain (reproduced; screenshot read back with the log lines visible beside
the empty tiles)

### [MAJOR] The painted title scene is drawn every frame and is completely invisible
web/menubg.js:56-159, web/style.css:41-43, web/ui/launch.js:57

`#menubg` is `z-index: 80`. `.sq-launch-root` is `position: fixed; inset: 0; z-index: 90`
with an **opaque** background: `linear-gradient(rgb(36,29,56) 0%, rgb(26,20,38) 55%,
rgb(14,10,24) 100%)` plus two radial washes, `opacity: 1`. It covers the entire viewport
above the canvas. The launch menu is the only thing that ever sets `body.sq-menu-open`,
so the canvas is never visible without the launch root over it.

I read the canvas back directly: pixel at (0.5w, 0.72h) is `rgb(240,185,140)` — the sun is
being painted. The composited screenshot at that point is flat dark purple. Meanwhile
`createMenuBackground.start()` keeps a `requestAnimationFrame` loop running for as long as
the menu is up, repainting a 320x200 scene with two cloud layers, 26 motes and a
`drawImage` upscale that nobody sees.

Note that `tools/checks/01-boot.json`'s "the menu has a painted background" assertion reads
`getImageData` off the canvas, so it passes while the user sees none of it.

Failure scenario: launch the game -> the title screen is a plain purple gradient. 160 lines
of sunset, towers, platform and drifting clouds are behind it.

Confidence: certain (computed styles captured, canvas pixel sampled, screenshot read back)

### [MAJOR] One Escape closes the panel AND opens the pause menu
web/main.js:234-248, web/ui/tasks.js:1329-1337, web/ui/craft.js:600, web/ui/gacha.js:523-527

`tasks.js`, `craft.js` and `gacha.js` each register their own window-level Escape handler at
construction time and close themselves without `stopPropagation()`. `main.js` registers its
handler at line 234 — **after** those three are constructed (lines 147-149) — so it runs
second, finds `Object.values(panels).some(p => p.isOpen())` already false, falls through to
`if (pause) { … pause.open() }` and opens the pause box.

`shops.js`, `inventory.js` and `importer.js` are constructed inside `loadOptionalPanels()`,
which runs *after* main.js's handler, so those three behave correctly. The bug is exactly
the three eagerly-constructed panels.

Measured, one Escape press each time:

| open panel | result |
|---|---|
| Quests | panel closes **and pause opens** |
| Craft  | panel closes **and pause opens** |
| Shops  | panel closes, pause stays closed |
| Inventory | panel closes, pause stays closed |

Failure scenario: press Q, read a quest, press Escape -> the quest log closes and the PAUSED
box is now over the world. Press Escape again to clear it. Every panel dismissal costs two
Escapes and flashes a modal you did not ask for. `main.js`'s own comment — "Esc unwinds …
and if nothing was open it is the pause key" — describes behaviour the code does not have.

Confidence: certain (reproduced for all four panels)

### [MAJOR] Keyboard input is never released on Quit to Menu — keys act on the hidden world
web/main.js:348-354, web/world/world.js:1283-1293, web/world/player.js:44-138

`pause.onQuitToMenu` calls `game.stop()`, which clears `running` and cancels the rAF but
does **not** call `unbindListeners()` or `input.dispose()`. Only `destroy()` does that, and
nothing ever calls `destroy()`. The `createInput` keydown listener and the canvas mouse
listeners stay on `window`/`canvas` for the life of the page. main.js's own `Q`/`Tab`
handler is likewise unconditional — it never checks whether the launch menu is up.

Failure scenario: Esc -> QUIT TO MENU -> at the title screen press Q. The Quest Log opens
(computed `display: grid`) behind the launch root, invisible. Press CONTINUE and you are
dropped into the world with the quest panel already covering it. Pressing E at the title
screen likewise fires `onInteract` on whatever building the frozen player is standing next
to, and WASD is still being fed into the input set.

Confidence: certain (reproduced; panel display state read after the quit)

### [MAJOR] The Importer panel is constructed on every boot and cannot be opened
web/main.js:252-271, web/ui/importer.js (948 lines)

`loadOptionalPanels()` builds `panels.importer` and pushes a state listener for it.
Nothing opens it: `index.html` has no importer dock button, `main.js`'s keymap has no
binding, `ROLE_PANEL` (main.js:190) has no importer entry, and the native Game menu
(MenuBar.swift:95-96) only names `tasks`, `craft`, `shops`, `gacha`. I confirmed the bridge
would work — `window.sqMenu.openPanel('importer')` returns `true` and shows the panel — but
nothing in the shipped UI ever calls it.

948 lines of parsing UI, plus a DOM tree and a state listener paid for on every boot and
every `broadcast()`, for a panel with no door. Import is only reachable through the native
`File ▸ Import Tasks… ⌘I`, which bypasses this panel entirely and posts to
`/api/tasks/import` from Swift.

Confidence: certain (grep + bridge probe)

### [MAJOR] The player vanishes behind the HUD banner at the north edge
web/ui/hud.js:53 (`.sq-hud-bar { position: fixed; top: 0; … z-index: 45 }`),
web/world/world.js:509-517 (`clampCam`)

`.sq-hud-bar` is 57.75px tall and opaque. The camera clamps to `[0, worldSpan - span]`, so
at world row 0 the player sprite draws at canvas y 0..48 — entirely under the banner.

Failure scenario: hold W from spawn until you stop. `/api/state` reports the player at
`24,0`; the screen shows grass and nothing else. Your character is gone and there is no
indication of where you are. I cropped and zoomed the region to be sure — the sprite is not
there. The same applies to any building or node in the top ~1.2 tiles of the map.

Confidence: certain (reproduced; crop read back)

### [MAJOR] Shopping is reachable from the Archive and from the native menu anywhere
web/main.js:190 (`ROLE_PANEL`), app/Sources/MenuBar.swift:93-104

CONTRACT-V3: "Buying and selling happens at the Shop building only. The Trading Post.
There is no shop button."

Two breaches:

1. `ROLE_PANEL` maps `blueprints -> 'shops'`, and `BUILDING_ROLES.archive = ['blueprints']`.
   Standing at the Archive and pressing E opens **Market Row on the MERCHANT tab** with live
   BUY buttons on Chalkstone, Inkglass, Sunfiber, Ironwood and a Voidshard. Confirmed on
   screen. The Trading Post is not the only shop.
2. `Game ▸ Shops ⌘3` calls `sqMenu.openPanel('shops')` -> `openOnly('shops')`, which has no
   location check at all. I confirmed `window.sqMenu.openPanel('shops')` opens the panel from
   the middle of a field. `⌘2 Craft` and `⌘4 Dark Boxes` are the same. The dock buttons were
   removed; the native menu kept the same anywhere-access and `Panels.swift:100-101` documents
   it to the user as a feature.

Confidence: certain (1 reproduced with a screenshot; 2 reproduced through the bridge)

### [MAJOR] shops.js never received the v3 theme pass
web/ui/shops.js:190 (`.sq-shops-scrim { position: fixed; inset: 0; z-index: 60 }`)

Every other panel roots on `sq-theme-scrim` from `theme.js` — Quests, Craft, Inventory all
render as parchment on slate with gold rules and corner pieces. `shops.js` and `importer.js`
build their own scrims and never call `injectTheme()`'s classes. On screen, Market Row is
the old flat dark-slate v2 box: no parchment ground, no gold framing, no corner ornaments,
different type colour, different card treatment.

Failure scenario: open the Quest Log then walk to the Trading Post and press E. The two
panels look like they belong to different games. CONTRACT-V3: "Replace the current flat dark
boxes with this."

Confidence: certain (screenshots of both panels read back side by side)

### [MAJOR] The native Help and About text states the reverse of three current design rules
app/Sources/Panels.swift:44-46, 88-97

RESUME.md lists "Stamina regenerates on its own … Do not reintroduce the gate" and "Trees no
longer regrow" under **DESIGN DECISIONS THAT MUST NOT BE SILENTLY REVERSED**. The shipped
Help panel says:

- "Energy comes only from tracked study … **It never regenerates on its own.** That is the
  whole design — the world is somewhere to spend study, not somewhere to avoid it."
- "Depleted nodes leave a stump and **respawn on their own after a while**." (trees are
  finite in v3; the seed log line in the same build tells the player the opposite)
- About: "Energy is only minted by real study. No amount of axes will chop a tree you did
  not earn."

RESUME.md flagged the equivalent stale line in the server seed log; this copy in the app was
not caught. It also documents Craft ⌘2 / Shops ⌘3 as the intended way to reach those panels,
which is the contract breach above.

Failure scenario: a new player opens Help ▸ StudyQuest Help and is taught a resource model
the game does not implement.

Confidence: certain

### [MAJOR] `build-app.sh --verify` is accepted and does nothing
build-app.sh:10-13, 34, 38

The header documents `--verify` as "build, then launch the bundle against a SCRATCH save dir,
prove the node child serves, quit it, and prove no node process survives. Never touches the
user's real saves." `VERIFY=0` is declared at line 34 and set to 1 at line 38. It appears
nowhere else in the file (`grep -c VERIFY` = 2).

Failure scenario: DEVOPS runs `./build-app.sh --verify` before a release, sees a clean green
build, and believes the orphan-process check and the scratch-dir launch passed. Neither ran.
This is the one guard that would have caught a supervision regression.

Confidence: certain

---

## MINOR

### [MINOR] `SPRITES.tiles.stump` is still literally a tree
web/world/sprites.js:1497

`stump: makeSprite(TREE_TILE_0, PAL, T16), // see art.js SPRITES3.stump` — the harvested
variant for `tree` is the tree grid. It is currently masked because `world.js:1153` reads
`SPRITES3.stump || harvestedSprite('tree')` and `SPRITES3.stump` is always truthy, but
`harvestedSprite('tree')` is a live exported function and `HARVESTED_TILE.tree = 'stump'`
still points at it. This is the exact bug called out in the brief as already shipped once;
the poisoned value was left in place rather than fixed.

Failure scenario: any future path that reaches `harvestedSprite('tree')` — a stump fallback,
a minimap, a tooltip — draws a full tree over the felled tile.

Confidence: certain (dormant, not currently player-visible)

### [MINOR] The reward flash's Escape handler has the same propagation problem
web/ui/hud.js:721

`const onKey = (e) => { if (e.key === 'Escape') closeFlash(); }` — added and removed
correctly (no leak), but it does not stop propagation, so dismissing a reward flash with
Escape also runs main.js's handler and opens the pause box (or closes an open panel).

Confidence: likely (same mechanism as the demonstrated Escape bug; not separately reproduced)

### [MINOR] `ROLE_PANEL` has no entry for the `repair` or `blocks` roles
web/main.js:190

`BUILDING_ROLES.forge = ['craft','repair']` and `workshop = ['craft','blocks']`. Both are
saved only because `'craft'` comes first in the array and the loop returns on the first hit.
Reorder either array in constants.js and pressing E at that building falls through to
"nothing to do here".

Confidence: certain

### [MINOR] "Reduce motion" only reaches the HUD
web/ui/launch.js:327-329, web/ui/hud.js:226/234/301

`sq-nomotion` is honoured by exactly two rules (`.sq-hud-bar`, `.sq-hud-flash`). The panel
entrance animations (`sq-theme-rise` and the keyframes in theme.js), `countTo`, `pulse`, the
gacha stage and `menubg`'s rAF are all unaffected. A player who turns motion off still gets
almost all of it.

Confidence: certain

### [MINOR] Unused exports across the world modules
web/world/build.js:90 `canPlace`; web/world/sprites.js:106 `LIGHT_DIR`, :135 `mixHex`,
:142 `shadeHex`, :1579 `TILE_VARIANTS`, :1587 `LIGHT_TIERS`; web/ui/launch.js:18 `readSettings`

Referenced nowhere outside their own file. `TILE_VARIANTS` and `LIGHT_TIERS` in particular
are the seams the (dead) lighting module was meant to drive.

Confidence: certain

### [MINOR] `Zoom In` is bound to ⌘+
app/Sources/MenuBar.swift:111

`item("Zoom In", #selector(zoomIn(_:)), "+")` with `.command`. On a US layout `+` requires
Shift, so the declared equivalent does not match a plain ⌘ press. The macOS convention is to
bind `"="` and display `+`.

Confidence: likely (code-level; not tested on a built bundle)

### [MINOR] Opening File ▸ Switch Save blocks the main thread
app/Sources/MenuBar.swift:148, app/Sources/GameAPI.swift:89-100

`menuNeedsUpdate` calls `api.slotsSync()`, which does a `DispatchSemaphore.wait` on the main
thread — 3s for `/api/slots`, plus a second 3s `getSync("/api/state")` on the fallback path,
plus 1s of slack each. If the node child is wedged or dead, opening that submenu freezes the
whole UI for up to ~8 seconds with no spinner. `newSave`, `renameSave`, `deleteSave` and
`exportSave` all call it too, before their dialogs appear.

Confidence: certain (code-level)

### [MINOR] `ServerProcess.stop()` leaks the log file handle on the already-exited path
app/Sources/ServerProcess.swift:136

`guard let p = proc, p.isRunning else { logHandle = nil; return }` — when the child has
already exited, the handle is dropped without `close()`. Harmless at quit; it matters if
`stop()`/`start()` are ever cycled.

Confidence: certain (code-level)

### [MINOR] The depletion bar draws over the stump on the tile above it
web/world/world.js:1069-1070

The bar is drawn at `(e.y * TILE - 4 - camY) * S` with a black backing box, i.e. it hangs
4px into the tile above. With a fresh stump directly north of a damaged tree, the black box
and yellow fill sit across the stump's base. Cosmetic, but visible.

Confidence: certain (observed in a crop)

---

## What I checked and found healthy

- **Boot.** Clean in every run: no console errors, no exceptions, no failed module loads
  (only a 404 on `/favicon.ico`). `bootFail` is wired to both `error` and `unhandledrejection`.
- **No throw in a render loop or a setState.** Every panel's `setState` is inside
  `try/catch` (`tasks:1284`, `craft:556`, `shops:1364`, `inventory:893`, `gacha:336`,
  `hud:601`, `launch:660`, `importer:908`), `main.js:41-46` isolates each listener, and
  `world.js` guards the gather update, the gather render, `applySwing`, `onGather`,
  `onBuildPlace`, `onInteract`, `onMoveCommit` and the whole `frame()` body individually.
  I could not make any panel throw.
- **Sprite row widths.** `makeSprite` warns on every mismatched row. I force-imported
  `art.js`, `gates.js` and `lighting.js` in the live page so every sprite in the project —
  including all six gate structures, all 16 fence and 16 wall variants, and both tree
  species — was constructed. **Zero `[sprites]` warnings.** No sprite is blank and none is
  a placeholder; I rendered them all to a sheet and looked at them.
- **rAF and interval hygiene.** `world.stop()` cancels its rAF and re-entry is guarded by
  `running`; `menubg.stop()` cancels correctly; `hud.closeFlash` clears its timer, its rAF
  and its keydown listener; `inventory`'s `cdTimer` is cleared on close; `theme.countTo`
  returns a canceller. The only always-on timer is `tasks.js:565`'s 500ms tick, which is a
  no-op while the session timer is stopped.
- **The v4 quest flow, end to end.** Open -> **Submit Work** -> composer with the task brief
  alongside, a live "160 words · 840 chars · guide 828" counter, an attach-file affordance
  -> **draft survives closing and reopening the panel** (verified: 840 chars back after a
  full close/reopen cycle) -> a deliberate "GRADING…" state with rotating wait lines -> the
  graded view with a large stamped rank letter, score, rubric rows with score bars,
  strengths/improvements, the reward chips and a resubmit path. The grader identity is shown
  honestly: *"Estimated locally — no model configured. This score is measured from length,
  deadline, difficulty and how much of the brief's vocabulary you used. Nothing read your
  argument."* plus "confidence 32%". This part of the client is in good shape.
- **The felled-tree / stump contract.** Verified with planted state: a tree felled inside
  `STUMP_MINUTES` draws the real `SPRITES3.stump` over forced grass; once `stumpUntil` has
  passed the tile reverts to bare grass and never back to a tree; `isDepleted` correctly
  returns true on `felled` with no `respawnAt`, so there is no phantom "E chop" prompt on
  cleared ground and the tile becomes walkable and buildable. `sweepHarvested` correctly
  skips felled records so they are never resurrected. This is the one v3 world rule that
  actually works.
- **The dock.** Exactly two buttons, `tasks` and `inventory` — V3 compliant. Hidden behind
  the launch menu via `body.sq-menu-open`. No craft, shop, box or import button anywhere.
- **Stacking.** `#overlay`(100) > `#menubg`(80) > `#stage`(auto); pause(120) correctly tops
  everything inside the overlay; the dock(40) sits under the panels. The one ordering I would
  question is `gacha`'s stage at 95 vs the launch root at 90 — a box opening would draw over
  the title screen — but no path reaches it there.
- **Text overflow.** At the native window's 1100x760 minimum, `#hint`, `.sq-hud-bar` and the
  document all measure `scrollWidth === clientWidth`. Nothing overflows. The world renderer
  clamps its own text runs to the canvas (`clampToCanvas`) and wraps toasts at 42 columns
  with per-line height accounting.
- **Process supervision.** The `/bin/sh` wrapper is sound: it backgrounds node, traps
  TERM/INT/HUP to kill it, and runs a watchdog that polls the app's pid and reaps node when
  the app dies — which covers SIGKILL/Force Quit, the case a Swift-side handler cannot.
  `"$@"` is properly quoted so a bundle path with spaces survives. `AppDelegate` funnels
  every exit (`applicationWillTerminate`, `applicationShouldTerminate`, window close, fatal
  startup, SIGINT/TERM/HUP via `DispatchSourceSignal`) into one idempotent `shutdown()`.
  `stop()` escalates SIGTERM -> 3s -> SIGKILL. **I could not construct an orphan path.**
- **Port handling.** `SQ.freePort()` binds `127.0.0.1:0`, reads the port back and closes —
  TOCTOU-racy in principle, but it falls back to 7777 on any failure and the readiness poll
  would surface a collision as a clean startup error rather than a hang.
- **`SQ_DATA_DIR`.** Honoured from the app's own environment with `~` expansion and path
  standardisation, defaulting to `~/Library/Application Support/StudyQuest`, and passed
  through to the child. That is what let me review this without going near the real saves.
- **Menu selectors.** Every `@objc` target in `MenuBar.swift` exists on `AppDelegate`;
  AppKit's own selectors correctly use `target = nil` so they travel the responder chain.
  `main.swift --dump-menus` exists specifically to catch an unbound selector, and the
  distinction it draws between `[chain …]` and `[UNBOUND …]` is right.
- **What the bundle ships.** `SHIP_FILES`/`SHIP_DIRS`/`KEEP_OUT` with a hard failure on any
  unclassified top-level directory is a genuinely good guard. `tools/` is correctly excluded,
  `data/` and `node_modules/` are excluded, `.DS_Store` and `*.map` are stripped, both
  post-copy existence assertions are present, `check-imports.mjs` runs before the build, the
  Info.plist is linted, and the ad-hoc signature is verified after signing.
- **State normalisation.** `main.js:29-38` reconciling `activeGatherTool` into the three
  alias keys the panels expect is the right thing in the right place.
- **Position durability.** `flushPosition()` on `pagehide`, `beforeunload` and
  `visibilitychange` with `sendBeacon` and a `keepalive` fetch fallback; `nearestFreeTile`
  BFS on first `setState` so a save cannot drop you inside geometry, with a server correction
  and a toast when it moves you.

## What I did not get to

- `app/IconGen/main.swift` — read only enough to confirm it compiles into the build and
  writes an iconset. Not reviewed for correctness.
- `web/ui/importer.js` internals (parsing, the 948 lines of format detection) — I stopped at
  establishing the panel is unreachable, so its logic is unreviewed.
- `web/ui/gacha.js` opening animation and `web/ui/theme.js` beyond the token/helper layer.
- I never got a rank A+ grading, so the **v4 resource drop** path (`rollStudyDrop` weighting,
  the awarded-materials row in the graded view) is unverified. Ranks C and below render
  correctly.
- I did not build or launch the real `.app` — every Swift finding is from reading the source
  plus the observable behaviour of the same code paths in the browser. The ⌘2/⌘3 contract
  breach is confirmed through the `sqMenu` bridge the menu items call, not by pressing the
  key in a built bundle.
- `pause.js` has setter-only `onResume`/`onQuitToMenu`/`onOptions` properties (no getters).
  Nothing reads them today; I did not chase whether that is deliberate.
- Save migration, gate progress arithmetic, the grader itself and everything under
  `server/`, `shared/`, `tools/` — out of scope, second reviewer.
