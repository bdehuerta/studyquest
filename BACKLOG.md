# StudyQuest — change list
Compiled 2026-08-30. Specs: CONTRACT-V5.md. Defects: REVIEW-SERVER.md, REVIEW-CLIENT.md.

## IN PROGRESS
(nothing — next item is 3, BLOCK PLACEMENT; then 9, PANEL CONSISTENCY)

## QUEUED, IN ORDER
~~0a. Inkglass has no source~~ — **ANSWERED 2026-09-02: removed entirely, see below.**

0. **MAP EXPANSION, EASTWARD.** (Bruno, 2026-08-31 — next up.)
   *"Map expansion comes after the dialogue with the wandering merchant in level
   20 finishes (at the east)."*

   The Herald's objective is currently a promise the map cannot keep: he sends
   you east to the Wise Man of the mountain, in the highest of the snowy peaks,
   and there is no east. That region is the next piece of work.

   What already exists to build on:
   - `HERALD_DIALOGUE.objective` is the brief, and `herald.spoken` on the save
     is the flag that says the player has been given it — so the expansion can
     be gated on it without inventing new state.
   - `QUEST_XP.wise_man_found` is already reserved at **400**, deliberately not
     paid by the Herald. Hearing about a journey is not making it.
   - `REGIONS` in shared/constants.js has the shape for a second region, and the
     four edge gates in `gates.js` are written but wired to nothing (see the
     known defects) — the east gate is the obvious door.
   - The cave darkness and the lantern already work, so a snowy peak with its
     own weather or dark is not starting from zero.

   Open questions before starting: does the map GROW (one bigger world) or does
   the east become a second area joined by a road? The v5 contract says
   "squared biome areas joined by roads", which argues for the second.

~~1. ONLY THE SELECTED SLOT WORKS~~ — **DONE 2026-08-31, see below.**

~~1b. Remove buildings from the Bag~~ — **DONE 2026-08-31, see below.**

~~2. XP LEVELLING~~ — **DONE 2026-08-31, see below.**

3. **Block placement** — `inventory.js` PLACE posts a block id to `/api/build`
   and fails; `/api/block/place` exists and is never called.
9. **Panel consistency** — finish the parchment/gold pass; Shops still wears the
   old flat dark look.
~~10 / 10b. Top banner hierarchy + the macOS traffic-light collision~~ — **DONE 2026-08-31, see below.**

## LARGER GOALS (v5, specced not started)
11. **Tasks vs Quests split.** TASKS = real coursework, `Q`, submit + LLM-grade.
    QUESTS = real video-game quests, no hotkey, accepted at **wooden billboards**
    around the map: deliver items to NPCs, find places, adventures.
12. **NPCs** — standing at fixed posts, `E` to talk. Give quests, take
    deliveries, teach recipes.
13. **Hand-authored quest catalogue**, keyed by `area` so it survives the map
    expanding Zelda-style into more squared biome areas joined by roads.
14. **DOCUMENTATION — Codex + first-run tutorial.** Two halves, both confirmed:

    **a) First-run tutorial**, for a new player or a new save. A short guided
    opening that walks through the actual loop rather than a wall of text:
    log or submit a first piece of work -> see the payout -> craft the axe at the
    Study Hut -> fell a tree -> see the stump and learn trees do not grow back ->
    buy a sapling at the Market -> plant it. That sequence teaches every rule the
    game will not otherwise state. Skippable, and it must NEVER re-run on an
    existing save (gate on `meta`, not on level or progress).

    **b) The Codex / journal** — fills in as you DISCOVER things, it is not a
    manual dump. Entries unlock on first encounter: materials on first pickup,
    buildings on first visit, gadgets on first craft, NPCs on first conversation,
    regions on first entry. Unfound entries read `??????` so the gaps are
    visible and tempt exploration. Shows completion (`23/48 known`) per category.
    Each entry carries flavour text, not just stats — it is a reward for
    exploring, and the place a returning player checks to remember a rule.
    Must cover the rules that are otherwise invisible: stamina regenerates,
    trees are permanent, blueprints gate crafting, gates need study not coins.
15. **Items revamp** — tiers and refining (raw -> processed -> finished, with
    Forge/Workshop/Lab each owning a different step) AND more variety.
16. **Enchanting** — new system, spends Shards on tools and weapons. Weapons do
    not exist yet.
17. **Characters and companions** — bought with Shards. Future.

## DECIDED
- Boxes pay Shards ONLY, no materials.
- Florins are the main currency; Shards come from tasks.
- Shards -> Florins only, expensively.
- NPCs stand still; no wandering.
- Quests are hand-authored, not procedural.
- Market is for buying goods.

## OPEN — do not guess
- **The roulette table** — what it wagers, what it pays, whether it has a floor.
- **Subject identity** — with one uniform coin, History and Maths pay the same.
  Move it to per-subject XP, a payout multiplier, signature materials, or drop it.

## SELLING — decided, with an interim
Selling will move to **other NPCs** in a future change. Until those NPCs exist,
the sell side **stays at the Market**, marked temporary in the code. Removing it
early breaks the tree loop: fell -> sell wood (~19) -> buy sapling (10) ->
replant. With trees permanently finite and no sell route, a save runs out of
Florins and can never replant, and the map goes treeless one way.
The Market's presentation becomes buy-first now; the sell tab is deleted only
when the selling NPCs land.

## KNOWN DEFECTS STILL OPEN (from the two reviews)
- `gates.js` (280 lines) and `lighting.js` (443 lines) imported by NOTHING.
  No edge gates exist; the whole v3 lighting pass is dead.
- `art.js`: only `SPRITES3.stump` is used. Trees, saplings, blocks, gates,
  signpost — finished art never on screen.
- `world.js` never reads `state.placedBlocks`; `drawTile` called without
  `tier`/`anim`, so colour temperatures and water frames never render.
- `menubg.js` paints a scene invisible behind the launch panel's opaque
  gradient (goal 8 fixes this).
- Daily session cap caps coins only — XP, stamina, boxes and the lifetime
  counters that gate regions all bypass it; calls are unlimited.
- `px`/`py` in a request body override the server's player position, defeating
  every location gate.
- One Escape both closes a panel and opens the pause box.
- `game.stop()` never releases input — Q at the title screen opens the task log
  invisibly behind it.
- `build-app.sh --verify` is a no-op; the orphan-process check has never run.
- `Panels.swift` Help text teaches three reversed rules.
- Harness trap: an `api` step without `expectOk` passes on any `ok:false`.
- `SPRITES.tiles.stump` is still a tree sprite, masked by a fallback.

## DONE THIS SESSION
- **Start menu rebuilt** — title screen is now title + PLAY only; saves appear
  after pressing PLAY. "THE HOME BLOCK" removed. The launch panel's opaque
  ground was what hid `menubg.js` entirely, so the painted scene is finally
  visible. HUD banner, event log and the Continue/Settings/Quit footer no longer
  bleed onto the title screen. Boot suite now asserts the PLAY gate.
  NOTE: the backdrop is the painted title scene, NOT the live game map. Bruno
  asked for "a background of the map" — swapping it is a follow-up.
- **Movement jitter fixed** — camera and player were rounded independently, so
  the player oscillated 3 screen px, ~20x/sec. Measured: 30 direction reversals
  in 1.4s before, 0 after.
- **Planting works end to end** — four growth stages render, plant prompt,
  growth countdown, mature saplings chop like wild trees. New pixel-asserting
  smoke suite (10-plantings) that fails if it ever becomes unwired again.
- Pause menu "Settings" opens the real settings sheet (was jumping to title).
- Plant prompt restricted to stumps (interim, see item 0).
- App icon cache flushed (was a stale LaunchServices cache, not a build fault).
- Malformed save no longer bricks the boot (one bad slot took slots 2-5 down).
- Graded tasks pay the grade they show (effort term no longer caps essays at B).
- Crafting reachable — panels now receive the building that opened them.
- Plant/block/interact api methods wired in `web/main.js`.

---
## DONE 2026-08-30 (late) — item 0, EQUIPMENT, SHIPPED AND DEPLOYED

Two visible equip slots, end to end, built and in the running `.app`.

- `shared/constants.js` — `EQUIP_SLOT_COUNT`, `EQUIP_KINDS`, `SEED_ITEM_ID`,
  `DOLL_SLOTS`.
- `server/store.js` — `player.equipped` (two refs) + `player.activeSlot`;
  `migrateEquipment()` folds the old `activeGatherTool` into slot 1 and hands
  seeds to a save that owns saplings, so no existing save loses planting.
- `server/api.js` — `/api/equip/slot` and `/api/equip/active`; gathering now
  requires the tool to be IN A SLOT; a tool that breaks is replaced in its own
  slot by a spare.
- `web/world/world.js` — every prompt keys off equipment, never the bag; keys
  `1` / `2` select a slot, and pressing the ACTIVE slot's own number uses it.
- `web/main.js` — `equipSlot` / `clearSlot` / `setActiveSlot`, `onEquipActive`,
  and slot normalisation. Also `window.__sqState` / `window.__sqApi` for tests.
- `web/ui/hud.js` — the single hidden tool readout is now TWO clickable slots.
- `web/ui/inventory.js` — four tabs (ITEMS / GEAR / RELICS / DARK BOXES) instead
  of eight; slot buttons on every equippable row; a SEEDS section (saplings were
  previously invisible in the bag); a Minecraft-style paper-doll on GEAR drawn
  with the real player sprite.

Proven by `tools/checks/11-equipment.mjs` — 61 steps, all asserting what the
player is actually SHOWN, not what the server claims.

**Also fixed:** a new game now starts on a FULL stamina bar. `defaultState`
opened at 100 while the starting Study Hut already raised the ceiling to 110,
so a brand-new save showed 100/110. `ENERGY_BONUS_BY_BUILDING` and
`maxEnergyFor()` moved to `shared/constants.js` so store and api derive the same
number from the same starting buildings.

**Unequipping** works from the Bag (press the lit slot button on the item's row)
and from the paper-doll (click the active hand slot). From the WORLD, pressing a
slot's number USES it rather than putting it down — that is deliberate, but if
it turns out to be the thing players reach for, the place to change it is
`selectSlot()` in `web/world/world.js`.

## DONE 2026-08-30 (evening) — four defects Bruno found, all reproduced first

1. **CONTINUE pointed at the wrong save.** Two causes, both fixed.
   - `web/ui/launch.js:mostRecent()` sorted on `Date.parse(lastPlayedAt)`, but
     the server writes that field as an epoch NUMBER and `Date.parse` returns
     NaN for a number. Every save scored 0, so the sort fell through to its
     tie-break — hours played. Slot 1 had 6.3M ms on it and always won.
   - `server/slots.js:loadActiveState()` stamped `lastPlayedAt = Date.now()` on
     the active slot at BOOT, so merely opening the app rewrote it. A save
     counts as played when it is LOADED, not when it is read off disk. The
     stamp was doubling as the playtime baseline, so that moved to a module
     `bootAt` and a `playing` flag rather than being deleted outright.
   Proven by `tools/checks/12-continue-slot.mjs`.

2. **Putting the saplings away did not stick.** The equipment fold-forward in
   `server/store.js` was written as a plain rule instead of a one-time step, so
   every boot put the seeds back in your hand — the game undoing a choice you
   had just made. Gated on a persisted `player.equipMigrated`, which is also
   excluded from the defaults backfill so an old save still gets its one
   migration. `11-equipment` now covers it, and the test was checked BOTH WAYS:
   it fails with the guard removed. It only reproduces across a server
   RESTART — a browser reload does not re-migrate, because state is in memory.

3. **New games started at 100/110 stamina.** `defaultState` opened at
   `BASE_MAX_ENERGY` while the starting Study Hut already raised the ceiling.
   `ENERGY_BONUS_BY_BUILDING` and `maxEnergyFor()` moved to
   `shared/constants.js` so store and api derive the same number from the same
   starting buildings.

4. **Saving is now an explicit choice.** `/api/save`, a SAVE GAME entry in the
   Esc menu showing when the game last wrote, and a warning that replaces the
   buttons when you leave having not saved in 30s: SAVE AND QUIT / QUIT WITHOUT
   SAVING / BACK. A failed save does NOT fall through to quitting. No
   alert/confirm anywhere. Note `.sq-pause-warn` needed
   `.sq-pause-scrim [hidden] { display: none !important }` — an explicit
   `display` makes the `hidden` attribute inert, which this project has now
   shipped twice; 02-play asserts the warning is invisible by MEASUREMENT
   (`getClientRects`), not by trusting the attribute.

## DONE 2026-08-30 (late evening) — QUIT actually quits

QUIT in the launch menu called `window.close()`, which a page cannot do to a
window it did not open, so it dead-ended on "This window has to be closed from
the title bar (⌘W)".

Now: it saves, then asks AppKit to terminate through a new `sq` script-message
channel — `GameWindow.swift` conforms to `WKScriptMessageHandler` and the
injected native-feel script exposes `window.__sqQuit()`. Only named message
types are honoured; anything else is ignored rather than guessed at. In a plain
browser (no shell) the old close-then-explain path still runs, so the browser
build is not left with a button that silently does nothing.

`12-continue-slot` stubs the bridge and asserts QUIT uses it, saves first, and
never shows the ⌘W message.

## DONE 2026-08-30 (night) — THE ECONOMY PASS (items 3-6), shipped

All four landed together because they rewrite the same prices.

**Two currencies.** focus/insight/grind/spark collapsed into **Florins**;
**Shards** added. Old saves have their four piles SUMMED into florins on load —
dropping them would have confiscated every existing wallet. Work types and
subjects keep their identity as a payout MULTIPLIER (`pay`) instead of a split
across four coins, so a Project in Maths still beats an hour of casual reading.

**What studying pays.** Bruno, mid-pass: *"by submitting tasks I do not get
florins. florins are obtained by completing quests and by selling/finding them
in chests. by doing homework and studying I get dark boxes."* So task and
session payouts now pay ZERO florins — XP and **Dark Boxes**, scaled by the same
weighing as before (`POOL_PER_BOX`, `boxesForPool`), with at least one box for
anything that graded at all. Boxes pay **shards only**, never materials, with
rarity setting the amount so the pity timer still means something.

**Dark Boxes cannot be bought.** The Broker's escalating box price is gone, not
raised. `/api/shop/buy` refuses by name and points at submitting work; the
vendor listing returns `closed: true` and no offers.

**The Exchange is a place, not a tab.** `exchange_post` is a building in the
plaza with a roulette table in front of it — decorative, and the panel says so
rather than implying the wheel sets the rate. 25 shards -> 1 florin, one way;
florins -> shards is refused outright. Whole florins only, and leftover shards
stay with the player rather than being shaved off.

**Archive / Market split + the ⌘3 bypass.** `VENDORS_AT` decides which vendor a
building shows; the Archive shows blueprints, the Market goods, and neither
mentions the other. The `Game > Shops ⌘3` menu item is REMOVED, and the panel
opened without a building clears its place and offers nothing — closed at the
panel, so it stays closed however the panel is raised.

**The Woodsman.** With the Market buy-only, selling needed a home or the
chop -> sell -> replant loop dies. He is in a carved cave in the south-east
(`CAVE` in shared/constants.js) and pays 90% of list for timber against the
Trading Post's 40% — the walk is what you are paid for. Selling to him requires
standing in his cave.

**Three copies of the coin shape.** `server/api.js` and `server/store.js` each
had their own hand-written `{focus,insight,grind,spark}`, which kept minting the
dead currencies back into every wallet from two directions after the collapse.
Both now derive from CURRENCY_IDS. This is why `13-economy` asserts the wallet
has EXACTLY two keys rather than that florins exist.

**The inert-hidden trap, third time.** `.sq-shops-tab` sets `display:flex`, so
hiding a vendor tab did nothing — every shop still listed every other shop, the
precise bug the split was for. Worse, the first version of the test trusted
`b.hidden` and passed with all five tabs on screen. Both fixed: a scoped
`[hidden] { display: none !important }`, and the suite now MEASURES
(`getClientRects` + `getComputedStyle`) instead of asking the DOM property.

Proven by `tools/checks/13-economy.mjs` — 56 steps.

**Still open after this pass:**
- Florins now have exactly one source in-game: SELLING. Quests and chests are
  specced but not built, so until they land, gathering and selling is the whole
  income. Worth watching that blueprint prices still feel reachable.
- The cave has no transparent roof yet: it is an open chamber in the rock rather
  than an interior you step into. The vendor inside works; the lighting does not
  exist. See the note in world.js.
- The Exchange and the Woodsman are BUILDINGS, not standing NPCs with sprites.
  The v5 NPC work (items 11-17) is where they get faces.

## DONE 2026-08-30 (night, later) — the NPCs, the mountain and the cave roof

Bruno: *"where is the npc? add the npc and make it look like a mountain. this
npc will buy stone for florins rather than wood. wood will be bought by another
npc in this area"* (south-west), and *"add the roof of the cave"*.

**There were no NPCs, and no art at all.** `exchange_post` and `woodsman_camp`
were placed in the world with no entry in BUILDING_ROWS, so buildingSprite()
returned null and the vendors were literally invisible patches of ground. Now:
- `B_STONEMASON` — a 112x128 MOUNTAIN, generated from a shape function rather
  than hand-typed rows so the silhouette stays smooth and symmetric. Snow cap,
  crag shading (two out-of-phase waves; a single sine striped it like a barber's
  pole), and a mouth cut into the base. It overhangs its footprint by 5 tiles.
- `B_WOODSMAN` — a lean-to and a stack of cut logs.
- `B_EXCHANGE` — a canopied stall with the roulette table out front.
- `NPC_SPRITES` — the player's own standing frame, recoloured per vendor, so an
  NPC reads as the same kind of thing as the character without a second
  animation system. world.js stands each one below their building's front edge
  and depth-sorts them with everything else, so you can walk behind them.

**Two buyers, two corners.** The Stonemason takes STONE (chalkstone,
lenscrystal) under the mountain in the south-east; the Woodsman takes TIMBER
(ironwood, heartwood, resin) in a clearing in the south-west woods. Both pay 90%
of list against the Trading Post's 40%, and each refuses the other's goods by
name. One `outlanderView` / `outlanderPrice` builds both — two vendors written
out twice is two vendors that drift apart.

**The cave roof.** The chamber floor is walkable, so without rock overhead the
cave was an open-topped pit. `drawCaveRoof` paints stone over the chamber AFTER
the player and vendors, and tweens to 0.14 alpha when the player is inside —
fading rather than vanishing, so you can still tell you are underneath
something. The mouth is never covered: a doorway you cannot see is a doorway
nobody finds, and it is three tiles tall for the same reason.

**Two real bugs found on the way:**
- `flushPosition` fired on pagehide even when the world was never started, so
  leaving from the title screen wrote the stale starting tile over a position
  saved by any other route. Now gated on `game.isRunning()`.
- The smoke harness had no way to HOLD a key: `key` sends keyDown and keyUp back
  to back, so fifty taps travel about as far as one and "walk east" in 02-play
  was never really walking. Added `Page.hold` + a `hold` step; 14-cave walks in
  and out of the mountain with it.

Proven by `tools/checks/14-cave.mjs` (23 steps: walks in through the mouth,
watches the roof lift, trades, walks out and watches it close) and the extended
`13-economy` (67 steps).

**Still open:**
- The Woodsman's clearing has art and a vendor but no test of its own; 13-economy
  covers his refusals and prices, not his surroundings.
- Chests and quests remain the two unbuilt florin sources.

## ~~KNOWN HARNESS DEFECT~~ — FIXED 2026-08-31

Was: `11-equipment` stalled intermittently when it ran after `02-play`, an
in-page fetch left pending and CDP timing out at 30s on a different step each
run. Worked around with `order: 15`. By 2026-08-31 it had stopped being
intermittent — a full run reliably lost `02-play` to a 30s
`Page.captureScreenshot` timeout and then handed the next two suites
"timed out waiting for a page target", while every one of those three passed
alone.

Root cause, as the old note guessed: EVERY SUITE SHARED ONE TAB. `Browser.page()`
handed out the about:blank tab Chrome opens at launch, and `Page.close()` parked
it back on about:blank. Parking is not tearing down — service workers, timers,
pending fetches and a render loop all survive into the next suite's renderer.

Fixed in `tools/lib/cdp.mjs`: `page()` now opens its own target per suite via
`/json/new` and `close()` disposes of it via `/json/close`. The reason the old
code refused to close anything was that disposing of the LAST tab exits Chrome
and strands every later suite — so the fix leans on Chrome's own launch tab
never being touched, which means the tab being closed is never the last one.
`/json/new` wants PUT on current Chrome and GET on older builds, so both are
tried and it falls back to reusing an existing tab rather than failing the run.

Result: all 14 suites pass in ONE run for the first time (599 steps).
`order: 15` on `11-equipment` is left in place — it is harmless, and removing it
is a change that would need its own full run to justify.

## HANDOFF 2026-08-30 (SUPERSEDED — item 0 is now done, see above)

**Tree state: GREEN.** `./tools/check.sh` clean; `smoke 01-boot 02-play` pass
(56 steps). Item 0 (equipment) is **PARTIALLY IMPLEMENTED IN SOURCE BUT NOT
DEPLOYED** — the running app is the previous clean build (start menu).

The agent was stopped mid-step. Its last words: *"Now the 1/2 keys and
equipment-aware E, plus the debug probes."* So assume:
- server-side slot model + migration: likely written
- inventory merge / search: partial or not started
- `1`/`2` keybinds, equipment-aware `E`: NOT written
- gear paper-doll: NOT started (it was told to skip if short on time)

**FIRST ACTIONS NEXT SESSION:**
1. `./tools/check.sh && node tools/smoke.mjs` (all 10) to confirm.
2. `git`-less rollback if needed: a known-good copy of every source file is
   inside `dist/StudyQuest.app/Contents/Resources/app/` — restore from there
   rather than hand-repairing partial edits.
3. Diff source against that bundle copy to see exactly what the agent changed:
   `diff -rq server shared web dist/StudyQuest.app/Contents/Resources/app/`
4. Finish item 0 from wherever it actually got to, then deploy.

**Do NOT start the economy pass (items 3-6) without a full budget** — it
rewrites every price and cannot ship half-done.

---
## DONE 2026-08-31 — item 1, ONLY THE SELECTED SLOT ACTS

Bruno: *"you can only use those items that are equipped and selected (1 and 2
but only one of those selected)."*

Before: `equippedRefs()` returned BOTH slots, active first, and every prompt and
action walked that list — so an axe in slot 2 chopped while slot 1 was selected.
The active slot was a tie-break and a HUD ordering, which is not what selecting
means. Now the active slot is the only thing in your hands; the other slot is
CARRIED.

- `web/world/world.js` — `equippedRefs()` returns the active ref alone.
  `seedEquipped` and `equippedToolFor` follow with no other change, which is why
  the narrowing is done in one function rather than at each call site. Added
  `stowedRef()` / `stowedSlotNumber()` / `stowedToolFor()`, used ONLY to write
  hints — they never grant an action.
- `server/api.js` — the same narrowing, plus `stowedRef()`, because a client-only
  fix leaves the stowed axe swinging for anything that calls the api directly.
  Both refusals now name the key: *"your Woodcutter's Axe is in slot 1 — press 1
  to take it out"*, and the same for saplings.
- `web/ui/hud.js` — `.sq-hud-slotstowed` dims the inactive slot (opacity .46,
  desaturated) and lifts on hover. Unhighlighted was not enough: the slot cannot
  be used, so it has to read as put away. Tooltips say so too.

**One behaviour changed that was not in the spec, deliberately.**
`routeEquipSlot` ended with `state.player.activeSlot = idx` — equipping into a
slot always selected it. Harmless while both slots were live; under the new rule
it means loading your SECOND hand silently disarms the first, and you can never
fill slot 2 while keeping the axe out. Now it only auto-selects when your hands
were empty. Otherwise the player's selection stands.

**Tests.** The assertion "the chop prompt survives a second slot being filled"
encoded the old rule. It was INVERTED, not deleted — `11-equipment` now presses
2, watches the chop prompt die, reads the new hint, measures the HUD dimming
with `getComputedStyle` (not a class name — see the inert-`hidden` history), and
asks the SERVER to swing with the stowed axe to prove it refuses by name. Also
had to stop a later assertion passing for the wrong reason: after the HUD click
leaves slot 2 selected, the chop prompt is already gone, so "the chop prompt
goes away with the axe" proved nothing until slot 1 is reselected first.
Checked both ways: widening `equippedRefs()` back to two slots fails the suite
at "the axe is STOWED".

Two other suites were legitimately caught by the new rule and fixed at the
fixture, not by loosening the rule:
- `10-plantings` let the migration place the axe in slot 1 and select it, so the
  seeds ended up stowed. The save now HOLDS the saplings — a suite about
  planting should.
- `06-v3` plants and fells in the same run, so it now presses 2 before planting
  and 1 before felling. The step that used to plant directly is kept as an
  assertion that planting is REFUSED with the axe selected.

All 14 suites pass (599 steps). Built and in `dist/StudyQuest.app`.

## DONE 2026-08-31 (later) — the Stonemason's counter, and item 1b

**The Stonemason could be traded with from outside his cave.** (Bruno.)
Reach is "within one tile of the building's footprint", which is right for a hut
you walk up to and wrong for him: his building is the MOUNTAIN, anchored at
`CAVE.y - 2` in the rock ABOVE the chamber, so the footprint's one-tile margin
reached out onto the hillside. You could sell him stone without ever going in,
which makes the whole cave pointless.

Fix: `BUILDING_COUNTER` + `counterRect()` in `shared/constants.js`. A counter is
an OFFSET from the building's anchor (so it travels if the building is ever
moved) and REPLACES the footprint for reach — it is not added to it. The
Stonemason's is `{ dx: 1, dy: 2, w: 3, h: 2 }`: the top of the chamber, where he
actually stands. Read by `buildingsNear` (server), `adjacentBuilding` (world) and
the floating "E stonemason camp" prompt, which was also anchored to the footprint
and so hung in the hillside above a player standing in the cave.

Proven by four new steps in `13-economy`: stand at 54,33 on the hillside, try to
sell, and both the server AND the world prompt must refuse. Checked both ways —
reverting `buildingsNear` to the footprint fails at "the Stonemason is NOT
reachable from outside his cave".

**1b — buildings are out of the Bag.** `renderBuildings()` and its helper are
gone from `web/ui/inventory.js`, along with the now-unused BUILDINGS and
BUILDING_FOOTPRINT imports.

BUT: the backlog note said "build mode is entered from the world, not the Bag."
That was WRONG — `api.requestBuildMode` had exactly one caller in the whole
codebase, and it was that PLACE button. Deleting the section outright would have
left every crafted building unplaceable, with no way to raise it and no error to
explain why. So the list MOVED rather than being deleted: `renderPending()` in
`web/ui/craft.js` shows "READY TO RAISE — n" at the top of the bench's RECIPES
tab, which is where the building was paid for in the first place.

`11-equipment` now seeds one unraised Forge (an empty list would pass either
way), asserts the Bag has no BUILDINGS section and no row offering to place it —
scoped to buildings, because the Bag still has a PLACE button for BLOCKS, and
blocks really are carried — then opens the bench and asserts the Forge is there
with a working PLACE button. That last assertion is the one that stops this
change from stranding a building somebody has already paid for.

## DONE 2026-08-31 (later still) — 1 and 2 select, E uses

Bruno: *"when I press 1 or 2, it mines/uses axe. it should only use them when I
press E with those tools equipped."*

`selectSlot()` had a second job: pressing the number of the slot that was
ALREADY active USED what was in it — swing, plant, or fire a gadget. So 1 and 2
were a select key and a use key at once, and which one you got depended on state
you could not see while looking at the tree. Press 1 meaning "switch back to my
axe" and you felled a tree instead.

Now they only select. Pressing the number you are already on is a toast naming
what is in your hand and nothing more. E is the use key and the only one — it
already covered both gathering and planting, so nothing moved to get here.

The gadget branch that went with it was dead: `onUseGadget` defaults to null and
`web/main.js` never sets it, so that path only ever toasted "not wired up yet".
Gadgets are used from the Bag. Nothing was lost by deleting it.

`11-equipment` asserts it directly: note how far into the tree we are, press 1
again on the already-selected axe, and the tree must be untouched — then press E
and it must take the hit. A guard on both halves, so nobody "fixes" this by
making E stop working either.

## DONE 2026-08-31 (evening) — E closes the panel it opened

Bruno: *"when I open the exchange or the pop up of the other buildings, if I
click E again while its open it should also close."*

E is now a toggle, like Q and Tab.

The check had to live in `web/world/world.js`, not in the keydown handler in
`web/main.js`, and that is the whole subtlety: `createInput` registers its
listener when the game is constructed, so it runs BEFORE main.js's handler on
the same event. Closing the panel from main.js would have been too late — the
world would already have fallen through to its gather branch, and the keypress
meant to dismiss the shop would fell the tree standing behind it.

So the world asks two new hooks before it does anything else with E:
`api.isPanelOpen()` and `api.onClosePanels()`, which main.js answers from the
panel registry it already owns. A panel on screen swallows the press entirely.

`11-equipment` asserts both halves while the scholar faces a live tree: open a
panel, note how far into the tree we are, press E, and the panel must be gone
AND the tree untouched — then E must still chop once nothing is covering the
world.

NOT tested at a building through the real walk-up path: `standAt()` in
13-economy moves the SERVER's player, and the renderer only adopts the server
position on its first setState, so the world does not think you are standing
anywhere new. The suites open those panels through `openAt()` for that reason.
The mechanism above is shared by every route into a panel, so it is covered;
what is not covered is `adjacentBuilding()` itself, which this change did not
touch.

---
## DONE 2026-08-31 (night) — THE OUTLANDERS: locked doors, dialogue, and XP

Bruno asked to finish this corner of the map: give the two buying NPCs an
interface, put them behind unlocks, write their dialogue, and start paying XP.

**Both vendors now start CLOSED**, and the lock is enforced on `/api/shop/sell`,
not in the panel. A lock that lives only in the UI is not a lock, and this
project has shipped that mistake before.
- **Stonemason** — wants LEVEL 10. Below it he tells you you are not
  professional enough and counts off how many levels are left.
- **Woodsman** — wants the BLUE KEY.

**The Blue Bloom.** One `bluetree` tile at a FIXED spot in the north-west
(`BLOOM` in shared/constants.js), in a clearing carved into the map rather than
left to the noise — it is the whole of the Woodsman's unlock, so "the seed
usually puts a gap there" is not an acceptable failure mode. Its own tile type,
its own sprite (a domed cap, dark gill line, pale stalk, drawn in the water
palette so it reads cold against a warm-green wood), its own harvested stump and
its own blue spore particles. Five swings with an axe. It yields NO material —
only the key — and `finite: true` with `plantable: false`, so it never grows
back and cannot be replanted into a second key. Swinging at the cut stalk says
so by name instead of offering you a sapling.

**The Blue Key is a QUEST ITEM, not a material.** Deliberately: a material can
be sold, crafted with, and rolled out of a dark box, and every one of those
would be a way to get the key without finding the Bloom. It lives in
`state.questItems` and appears in the Bag under QUEST ITEMS, with no slot
buttons — a key is not held in your hands.

**Talking is the interaction.** `/api/npc/talk` requires standing at the
vendor's counter, and OPENING HIS PANEL IS TALKING TO HIM — walking up and
pressing E is exactly that, and making the player click again would leave the
key in their pack with no sign of what to do with it. The key is spent HERE
rather than on the first sale, so a player who never speaks to him cannot lose
it to a transaction they were never told about.

The four dialogue stages are DERIVED from state, never stored, so a save can
never be stranded on a line that no longer matches the world. That is what makes
Bruno's edge case work for free: *"if you find the blue key before even
interacting with the wood npc, it will go right to the last dialogue"* — there is
no "which line did I last say" to be wrong.

**XP.** Three sources, all through one funnel (`grantXp`), so levelling can
never be forgotten at a call site — which matters more than usual now that
`player.level` is a door:
- selling: 2 xp per UNIT (not per sale, or the cheapest strategy is twenty
  separate sales of one);
- dark boxes: 10-30 xp, rolled per box;
- quests: one-off, guarded by `state.questsDone` so talking twice pays once.

**A bug this uncovered, open for a whole session.** `normShops()` in
web/ui/shops.js built a fresh object that never carried `woodsman` or
`stonemason`, so BOTH outlander tabs fell through to "He is not buying just now"
no matter what the server sent. Their sell rows had never rendered. 13-economy
missed it because it asserted their prices off the API response and their sales
through `api.sell` — never off the screen. The new suites read the DOM.

**Two new suites.**
- `15-outlanders` (78 steps) — the tile is really carved; both sell ROUTES
  refuse; both refusals are DRAWN; felling the Bloom puts a key in the Bag;
  talking spends it; only then do the rows appear; selling pays 2 xp a unit;
  and a second conversation neither re-thanks you nor wants a second key.
- `16-outlanders-open` (33 steps) — the two states one save cannot reach:
  arriving with the key already in hand and never having spoken (he must go
  straight to the thank-you), and arriving at level 10 EXACTLY (the boundary, so
  a `>` where `>=` belongs fails here).

**Open / assumed:**
- The Bloom is felled with an AXE. Bruno said "mine", but it is a tree and it
  gates the WOOD vendor, so the axe was the reading. One line in
  shared/constants.js if that is wrong.
- Existing saves are LOCKED OUT of both vendors until they do the unlock. That
  follows from the feature, but it does mean a save that was selling timber
  yesterday cannot today until it walks north-west.
- The Stonemason's level 10 has never been costed against the real curve. See
  item 2.

## DONE 2026-08-31 (night, later) — the dialogue box

Bruno: *"can the dialogues be in boxes (white background, black text and
borders) like in a nintendo 2d game? click e to pass the dialogue. the dialogue
box rectangular in the centre bottom of the screen."*

`web/ui/dialogue.js`. White ground, black text, 4px black border with an inset
second rule, rectangular, centred along the bottom, the speaker's name in a
black tab on the top edge, `1 / 5` and `E next` in the footer. Text types out; E
finishes the line, E again moves on, E on the last line closes. Clicking the box
does the same.

Deliberately NOT themed. Every other surface in this game is dark parchment and
gold; this one is white because that is what it is imitating, and half-adopting
the house style would land it between the two and look like neither. It is the
only `.sq-dlg-*` surface and owns its own <style>.

It lives OVER THE WORLD, not inside the shop panel, and the shop opens only
AFTER the conversation and only if the vendor agreed — for one who refuses you
it never opens at all. `game.onInteract` routes the two outlander buildings to
`speakTo()` instead of straight to the panel.

E reaches the dialogue BEFORE the panel-close check in world.js, and ADVANCES
rather than closes. Same reason as the panel check itself: `createInput`
registers first, so handling it in main.js would let the world chop the tree
behind the box.

**Two real bugs found while doing it.**
1. The shop panel CACHED the vendor lock state. Talk to the Woodsman holding the
   key, he unlocks — then his counter opened on stale data and told you he would
   not trade, seconds after saying he would. `panels.shops.invalidate()`, called
   when a door opens.
2. Two stray `Escape` steps in 15-outlanders had nothing left to close (the box
   closes itself), so they hit the PAUSE key, and a pause menu left up dimmed
   the whole overlay — which is why the first screenshot of the box looked grey
   instead of white. There is an assertion for that now.

**A false alarm I raised and then withdrew — worth recording.**
I flood-filled from the plaza to check the Blue Bloom's glade was reachable,
counted TREES as impassable, concluded it was a grass island cut off by the
lake, and "fixed" the map: forced land over water and laid a causeway east.
Bruno: *"no no I liked the blue bloom as it was don't change it. you can reach
it by cutting down a tree."* He was right. Trees are not walls — an axe removes
them, and clearing a way in is a perfectly good thing to ask of the player.
Measured properly (water and stone blocking, trees not) all four tiles beside
the Bloom are reachable, and always were. The carve is reverted to exactly what
it was; the assertion in 15-outlanders now measures reachability WITH AN AXE and
says in the comment why trees are excluded.

## DONE 2026-08-31 (night, last) — two fixes Bruno found

**1. A conversation survived leaving the world.** *"when I go to the start menu
and the dialogue is still running it does not disappear."* The box is
deliberately not one of the `panels`, so `closeAll()` never touched it and a
half-read line sat over the title menu.

Fixed with a new `dismiss()` on the dialogue, called from `quitToMenu`, from
`showMenu()` as a backstop for any future route to the title, and from Escape.
DISMISS, NOT CLOSE, and the distinction is the whole point: `close()` means the
player read to the end, so it runs `onDone` — which is what opens the vendor's
counter. Quitting mid-sentence would have popped a shop open behind the menu you
just asked for. `15-outlanders` asserts both halves: the box is gone AND no shop
opened. Checked both ways — removing the dismiss fails at "the dialogue box is
GONE".

Also found on the way: `pause.onQuitToMenu` is a SETTER with no getter, so
reading it back returns undefined. The quit action is a named `quitToMenu`
function now, assigned to the setter and exposed to the harness directly.

**2. New games spawn in the middle of the plaza.** *"all new games should start
with the player spawning in the center of the four buildings, in the middle of
the map."* The four are Study Hut (22,17 2x2), Trading Post (26,17 3x2), Archive
(22,20 2x2) and Exchange (26,20 3x2): together x 22-28, y 17-21, so the centre
is exactly (25, 19) and that tile is open ground between all four. The old start
was (24,18) — level with the TOP pair, which reads as standing beside the Study
Hut rather than in the square.

`SPAWN` in shared/constants.js, used by `defaultState`. `PLAZA` is left alone —
it describes the plaza the world CARVES, which is a different thing. Existing
saves keep wherever they were standing, which is right. `05-api` asserts the
fresh spawn is 25,19.

## DONE 2026-08-31 (night, final) — the world holds still while the UI is up

Bruno: *"when you are in a dialogue, text box, or opened a building or
inventory/Q, you should not be able to move."*

The world kept running under every panel, so you could walk off while reading a
shop and the position that got saved was wherever WASD had carried you behind
the box. Now `uiBlocking()` in world.js hands the player a ZEROED INPUT while a
dialogue, any panel, or the PAUSE MENU is on screen. Pause was not on Bruno's
list but had the same hole — it is not one of `panels` either.

Two decisions worth keeping:
- A zeroed input rather than skipping `player.update()`. That update also
  settles the swing and the idle frame; skipping it leaves the scholar frozen
  mid-stride.
- Asked EVERY FRAME, not latched on open/close. A panel that closes by a route
  nobody remembered to hook would otherwise leave the player unable to move for
  the rest of the session — a far worse bug than the one being fixed.

The test asserts BOTH directions — walks, freezes, walks again. A freeze test
that only checks "did not move" passes on a world that has stopped for any
reason at all. Verified both ways: removing the freeze fails at "the scholar has
not moved a single pixel".

**A harness finding, recorded because it cost an hour.** The test lives in
`14-cave`, NOT `11-equipment`. 11 restarts the server mid-suite and navigates to
a new port, and after that the page's timers run at a crawl — sampling the
player's position gave FIVE readings in three seconds, and held keys move nobody.
The freeze assertions would have passed there while proving nothing. Anything
that needs real movement belongs in a suite that has not navigated mid-run;
14-cave already walks the scholar in and out of the mountain on held keys.
Also note `02-play` "walks" with `key`+`times`, which is taps, not holds — it
does not prove movement either.

## DONE 2026-08-31 (night, really final) — the red message on the first talk

Bruno: *"when I get the blue bloom and talk to the woodsman, a red message pops
up and if I talk again then it works."*

A RACE, not a dialogue bug. Position reaches the server through `onMoveCommit`,
which is throttled to one post per MOVE_COMMIT_MS (400ms) and only fires on a
tile change. Press E the instant you arrive and the talk goes out while the
server still holds your PREVIOUS tile, so `requireRole` refuses — the red toast.
The second press worked because the throttled commit had landed in between.

`game.onInteract` is now async and awaits `commitPosition()` before doing
anything else. EVERY interaction, not just the vendors: crafting and the shops
are position-gated too and had the same race; it is only more visible at the
outlanders because their refusal is a toast rather than a panel that opens
saying you are nowhere.

NOT fixed by sending `px`/`py` in the request body. That override exists and
would have worked, and it is precisely the hole REVIEW-SERVER.md flags as
defeating location gating. The server still decides; it is simply no longer
being asked about a stale position.

Proven in `14-cave`, deterministically rather than by racing a timer: move the
SERVER's player to the plaza while the renderer stays at the counter — exactly
the state the throttle leaves behind — then press E once. Checked both ways.

**This broke 15 and 16, and they were right to break.** Their `standAt()` moved
only the SERVER's player and left the renderer at spawn. That was fine while
nothing consulted the renderer's position; now the flush overwrites it. Moving
half the world is a state no player can produce. `standAt` moves both now, via a
new `setPlayerTile` TEST SEAM on the world api — nothing in the game calls it,
it is client-side only, and every gate still runs on the server.

Also learned, the hard way, twice in one evening: a suite that walks somewhere
must assert it ARRIVED WITHIN REACH. The first version of the 14-cave test
walked into the chamber but stopped at the far corner, outside the Stonemason's
counter rect, and failed for a reason that had nothing to do with the race.

---
## DONE 2026-08-31 — FLORINS MADE RARE, and item 2, XP LEVELLING

### Florins are rare and expensive

Bruno: *"the florins are meant to be rare and expensive. reduce the starting
amount to 25. by selling you should obtain 1-2 florins and them to be expensive
(5 ironwood for 1 florin in market and 7 ironwood for 2 florins in the woodsman
npc; these amounts can be escalable to more ironwood for more florins)."*

**Selling is now BUNDLES, not a unit price.** `SELL_BUNDLES` in
shared/constants.js, keyed by rarity, with a table per vendor. A sale is
`floor(qty / per) * pay` and THE REMAINDER IS NOT TAKEN — sell 8 timber to the
Woodsman and you get 2 florins and 1 ironwood back. A per-unit price could not
express "5 for 1" at all: every common material would round to 1 florin each and
the whole rebalance would evaporate in the rounding.

Bruno's two numbers land as the COMMON tier, which is where Ironwood and
Chalkstone sit: town 5 -> 1, outlander 7 -> 2. Every other rarity scales from
there, and the outlanders are better value at every tier.

**Everything else had to move with it.** A florin went from being worth about an
eighth of a common material to about five of them — roughly 20x — so:
- starting purse 120 -> **25** (`STARTING_FLORINS`);
- all 31 recipe coin costs divided by 20 (40 -> 2, 400 -> 20);
- buy prices `RARITY_PRICE` 14/34/80/190/460 -> **1/2/5/12/30**;
- tree drops 50/40/100 -> **3/2/5**;
- saplings 10 -> **1** (tray of 5 for 4);
- blueprints: floor 60 -> **3**, formula rescaled.
Rescaled at the source rather than hidden behind a divisor at every read site.

**A consequence worth knowing: a felled tree no longer pays for its own
sapling.** A tree yields ~1.5 Ironwood, so ~1.5 trees per florin at the
Woodsman, and a sapling costs 1. That is close to break-even and deliberately
not better. STONE is the sustainable purse — it respawns and trees do not — so
the loop is now *mine stone for money, fell trees for timber*. TREE_ECONOMY_NOTE
says so in the game.

**Block refunds now bank instead of paying out**, and that is correct rather
than a regression: 4 Wall Stone cost 1 florin, so half of one block's share is
an eighth of a florin and there is no coin that small. `creditFractional` and
`state.refundBank` already existed for exactly this. Rounding up would have made
place-and-remove a money printer.

### Item 2 — XP LEVELLING

**The curve was exponential and is now linear.** `100 * 1.35^(level-1)` was
inherited from v1 when studying was the only xp source; compounding at 35% meant
level 20 ALONE cost 45,000 xp. Now `90 + 60 * (level - 1)`.

Costed against real play rather than guessed: a mid task pays ~214 xp (174
directly plus 1-5 boxes at 10-30). So **level 10 — the Stonemason's gate — is
about fourteen tasks**, and level 20 about fifty-six. Selling is deliberately
NOT a levelling route: a lot of seven pays 14 xp, so ~200 lots equal one task.
Trade is for florins, study is for levels, which is the right way round here.

**A level now DOES something: stamina.** `STAMINA_PER_LEVEL = 2`, folded into
`maxEnergyFor(buildings, level)`. Stamina is the right reward because it is what
every other system spends — levelling makes the loop you already play longer
rather than bolting a new one on. The new headroom is GRANTED at the moment of
levelling, not merely allowed: a reward you cannot spend until tomorrow is not
one. Level 1 grants nothing, so a new save is unchanged.

**There is a level-up moment.** `watchLevel` in web/main.js hangs off the state
broadcast rather than off each route's reply — xp now arrives from four places
(submitting work, logging a session, opening a box, selling), and a celebration
wired at each is one that will be missed at the fifth. It is `null` until the
first state lands, so LOADING a level-9 save is not mistaken for reaching it.
The level that opens the Stonemason says so, because nothing else would tell you
and it is a long walk to find out by hand.

**Study still pays xp directly AND through boxes.** Left as it is, deliberately:
it is the dominant source and the game is about studying. The box xp is variance
on top, not a second salary.

**Still open:** the curve past level 20 has not been played, only calculated;
and nothing yet uses `level` except stamina and the Stonemason's door.

---
## DONE 2026-08-31 — one seedpod per tree, and the top banner (items 10 / 10b)

### Seeds: one per tree felled

Bruno: *"it would be better to change the drop rate of seeds to 1 per tree
felled."* It was SIX PER CENT — sixteen trees to replace one — which with
permanent trees and newly rare florins was a forest draining one way. Now every
felled tree drops exactly one Seedpod, and a Seedpod plants like a free sapling.

This also settles the tension flagged when florins were rebalanced: a felled
tree DOES pay for its own replacement again, in seeds rather than coins. Buying
saplings is now how you GROW the wood, not how you keep it. TREE_ECONOMY_NOTE
says so in-game, and 06-v3 asserts a seedpod after every fell.

### The top banner — hierarchy (item 10)

It was one row of equally loud things, and the loudest was the least urgent: a
34px gold crest and a name that never change, in front of the stamina bar you
watch every swing. Three tiers now, and the CSS says which is which:

  TIER 1  stamina + the two equip slots — what you are about to spend and what
          is in your hands. Stamina went 176x10 -> 208x14 with a gold border.
  TIER 2  florins, shards, boxes, streak — present, stepped back to .84/.80,
          full strength on hover.
  TIER 3  crest, name, level, xp — identity, .66 and smaller (crest 34 -> 26,
          name 13px -> 11px, xp bar 148x7 -> 108x5).

The animated sheen came OFF the xp bar: motion on the least urgent thing in the
bar pulled the eye to exactly the wrong place.

Nothing was removed — everything is still one glance away, the glance just has
an order. `14-cave` measures the ordering (slot opacity > coin > identity) and
that stamina is the biggest meter, rather than trusting the stylesheet.

### The traffic lights (item 10b)

The shell uses a full-size content view with no titlebar area, so macOS drew
close/minimise/zoom straight over the crest and the player's name.
`GameWindow.swift` now stamps `data-native="macos"` on the document after load,
and hud.css reserves 84px of left padding ONLY under that attribute — so the
browser build is not left with a mystery gap. The suite asserts both: no gutter
in a browser, a gutter once the attribute is set. The lights never move off the
top-left, so no other corner needs reserving.

**And the REVIEW-CLIENT note that came with 10b:** at the NORTH EDGE of the map
the scholar could be hidden behind the banner entirely, because the camera
cannot scroll past y=0. `clampCam` now takes a floor, and for y that floor is
minus one banner height, so the map is pushed down instead. The tile loop
already clamped its row index at 0, so the space above simply shows the clear
colour. Verified by screenshot and by an assertion that the sprite's top sits
below the banner's bottom at tile 24,0.

**Two mistakes of mine worth recording.** Backticks in a comment inside a
template literal broke hud.js at parse time — the third time this project has
hit that, and there is now a comment saying so. And the first pass at the tiers
set identity BRIGHTER than the purse, contradicting the ordering it was meant to
create; the measured assertion caught it, which is the argument for measuring.

---
## DONE 2026-08-31 — items, materials, charms, and the dark

Bruno, five things in one go.

### 1. A new save carries nothing but its tools

*"only start with the axe, the pickaxe and 2 tree seeds."* The crate of common
salvage (3 ironwood, 4 chalkstone, 1 copperwire) existed to unblock crafting the
first axe, back when a new save owned NO tools. The starter pack made it dead
weight months ago. `materials: emptyMaterials()` now, and an empty pack makes
the first tree worth chopping.

### 2. The Merchant sells no materials

*"materials which cannot be obtained in this area should not be sold in the
shop."* He is right, and it was worse than untidy: `rollMerchantStock` rolled
from ALL of MATERIAL_IDS, so a Home Block scholar could buy VOIDSHARD and
RUNEPLATE — materials from regions the gates have not opened — off a market
stall. That made the gates decorative and gathering pointless.

The shelf is now FIXED rather than rolled — there is nothing random about a
blacksmith's stock, and a daily reroll on four items only ever meant "come back
tomorrow and hope":
  - replacement **axe (4f)** and **pickaxe (5f)** — durability is finite, and a
    broken axe with no ironwood to craft another is the last remaining
    soft-lock in the game;
  - the **charms**.

### 3. Charms — worn, not held

Two slots, separate from the two HAND slots, which is exactly what the
paper-doll's `charm1` / `charm2` were always waiting for. A charm is not a
gadget (one-shot) and not a tool (never touches a node): it is an effect that
lasts as long as you wear it.

  | charm | florins | effect |
  |---|---|---|
  | Everburning Lantern | 12 | lights 4.5 tiles in the dark |
  | Deepwick Lantern | 34 | lights 7.5 tiles |
  | Charm of Swift Feet | 40 | +18% walking pace |

Deliberately dear — a new purse holds 25, and they are the only permanent
upgrade money can buy. OWNED and WORN are separate (`player.ownedCharms` vs
`player.charms`) so taking a lantern off is not selling it. Buying a second copy
is refused and refunded: a duplicate does nothing.

### 4. The cave is dark, and a lantern is the answer

*"the cave should be dark, and with the lantern... you should be able to see in
a circular area around the player in the darkness, like fire light."*

A full-screen wash of near-black while you are in the chamber, with the light
punched OUT of it using `destination-out` — that is what gives a hole you can
see through rather than a bright patch floating on top of the dark — and then
`drawLightPool` adds the warm firelight over the hole it just made.

**This finally puts `lighting.js` to work.** REVIEW-CLIENT.md lists all 443
lines of it as imported by nothing; `drawLightPool` was already exactly the
lantern.

`CAVE_DARKNESS = 0.86`, NOT 1, on purpose: the Stonemason lives down there, and
a player who cannot see the way out of the room they just walked into has been
punished rather than challenged. You can make out the walls; you cannot read the
floor.

Took THREE tuning passes to read as fire rather than a warm smudge — the first
fell off far too early, the second was too dim against a dark brown floor, and
the third washed the scholar out of the middle of their own lantern. Screenshots
caught all three; no assertion would have.

### 5. Crafting is parked

*"for the moment set the crafting page in the study house to 'rolling out in
future updates' text."* The recipe list is left INTACT behind the placeholder
rather than deleted — it works, and it returns with item tiers (item 15). Two
things stay reachable through it:
  - **REPAIR**, because a worn-out tool with no way to mend it is a soft-lock;
  - the **pending-buildings list**, because it is the only route to raising a
    building you have already paid for.

**Still open:** the scholar's sprite is dark-on-dark inside their own lantern —
readable, but it would be better with a rim light. And no region other than the
cave is dark yet, so the Deepwick Lantern is currently a strictly-worse buy than
the Everburning at three times the price.

---
## DONE 2026-08-31 — the lantern actually lights, and the banner gutter is drawn

### The lantern was ERASING the world, not lighting it

Bruno: *"the lantern light needs to shed light and you be able to see as if it
were day your surroundings but slightly tinted like a fire light. now I cant see
anything just a beam of light."*

MY BUG, and a real one. The first version drew the black wash straight onto the
GAME canvas and punched the light out of it with `destination-out`. That
composite does not know what it is erasing — it removed the WORLD along with the
wash, so the pool showed the empty page behind the map. A beam of nothing.

The fix is a separate layer: build the wash on a scratch canvas, punch the hole
THERE, then stamp that canvas over the world with ordinary source-over. Inside
the circle the wash is simply absent, so the room shows at full daylight and the
warm pool drawn afterwards only tints it. `LIGHT_LIFT` is 1 now, and the falloff
holds full lift to 70% of the radius before dropping fast.

**Worth remembering:** the three "tuning passes" before this were me adjusting
brightness on a broken composite instead of asking why the middle of the pool
was EMPTY rather than dim. Dim and empty look similar in a screenshot at a
glance; they have completely different causes.

### The banner gutter is now DRAWN, not just reserved

Bruno: *"the top bar has not been fixed. it is still merged with the app street
light buttons of the mac."*

The `data-native` flag WAS reaching the app — it is in the built binary — so the
space was reserved and the lights were no longer landing on the crest. But they
sat directly on the HUD's own gradient with nothing between them, which is what
"merged" means. RESERVING SPACE IS NOT SHOWING A BOUNDARY.

`.sq-hud-bar::before` under `[data-native]` now paints a recessed dark strip
92px wide with a gold rule down its right edge, so the eye reads chrome | game.
The suite asserts the strip exists and is wide enough, not just that the padding
is there.

Also added a page-side fallback: `hud.js` sets `data-native` from
`window.__sqNative` if the attribute is missing. Two independent routes to one
attribute, and neither can fire in a browser.

**Resolved same day** — see the Deepwick note below.

---
## DONE 2026-08-31 — one lantern, and it lights half a block

Bruno: *"only have 1 lantern. the everburning and it should light less area,
around the player 1/2 block in a circular direction."*

**The Deepwick is gone.** It was flagged as a strictly worse buy the moment it
shipped (34f for 7.5 tiles against 12f for 4.5, when 4.5 already lit the whole
chamber). With the Everburning cut to half a block, a second lamp that
trivialises the dark is the opposite of what the dark is for. If a bigger dark
region ever wants a bigger lamp, it can bring its own.

**The Everburning lights 1.5 tiles** — a circle three tiles across: your own
tile plus about half a block of ground in every direction. It was 4.5, which lit
most of the chamber at once and made the darkness decorative. At this radius you
have to WALK the cave to learn it, which is the point of carrying a lantern.

The Merchant's counter is now four things: axe 4f, pickaxe 5f, Everburning
Lantern 12f, Charm of Swift Feet 40f.

---
## FIXED 2026-08-31 — the "harness flakiness" was a real defect in the suites

A different suite failed at step 4 on each full run — always
"the title screen steps aside", timing out after 10s. I called it the known CDP
flakiness twice. IT WAS NOT.

The log said so plainly, one line above the failure: the entry eval returned
**"no continue/load"**. The launch panel leads with PLAY and lists saves only
after PLAY is pressed, and BOTH renders are async — so a single click on
"whatever is on screen right now" raced the panel. When the eval landed first it
found no button, clicked nothing, and the wait for the title screen to disappear
then timed out ten seconds later. Which suite lost the race depended on timing,
which is exactly what made it look like flakiness.

Eight entry points across seven suites carried the same fragile step (11 has two
— one after its mid-suite server restart). All are now a `waitFor` that presses
PLAY if that is what is showing, then CONTINUE/LOAD once the saves appear, and
returns true only when the title screen is really gone. A genuine dead end still
fails, at the right step, with the right message.

Two clean full runs back to back afterwards.

**The lesson, since this cost three runs:** read the eval's RETURN VALUE before
reaching for a known-issue explanation. "waitFor timed out" is the symptom; the
step above it had already printed the cause.

---
## DONE 2026-08-31 — the doll's charm slots, and box xp made visible

### The paper-doll's CHARM slots were not connected

Bruno: *"it does not let me equip the lantern in slots 1 or 2 from the gears
menu in the inventory."* He was clicking exactly the right thing.

`dollSlotCell` bound the two `gear:` slots to `gearList()` — the old
passive-bonus TOOLS (Focus Lamp and friends) — not to `player.charms`. So a
charm you owned never appeared on the doll, and clicking the cell marked CHARM
did nothing at all: it looked like a slot and behaved like a label. The CHARMS
list further down the GEAR tab did work, but the doll is where anyone would try
first.

Now: an empty charm cell puts on the first charm you own and are not wearing; a
filled one takes it off; the cell names the charm. Slots relabelled CHARM 1 /
CHARM 2 with a note saying worn-not-held, and the hint under the doll spells out
the difference between the two HAND slots and the two CHARM slots.

Passive gear keeps its own list (`renderGear`) and gives up its doll cells —
nobody owns any while crafting is parked.

### Dark box xp: happening, never shown

*"dark boxes should give around 10-30xp when opened."* They already did, and had
since the levelling pass — verified live: three opens paid 13, 13 and 28. But
`openBoxes` played the reveal reel over the DROPS only, so from the player's
side the experience did not exist. Asked for twice, which is the tell that a
thing is working and not being displayed.

`+N xp` is toasted after the animation. `16-outlanders-open` asserts it — via a
new `getToasts()` probe on the world, because toasts are drawn ON THE CANVAS and
a test that greps `document.body` for them finds nothing. That mistake cost a
run.

### A harness note, second sighting

The charm-doll test was first placed mid-cave, and the walk back out then
stopped working: no panel open, no pause, focus on BODY, clear floor to the
west, and the scholar simply did not move. Same stall as the one documented in
11-equipment — enough DOM churn (the GEAR tab redraws a canvas paper-doll on
every render) and the page's timers crawl, so a held key delivers almost no
frames. Nothing in the test needs to run mid-cave, so it runs last.

**Anything that depends on HELD KEYS must come before heavy panel work in a
suite, not after.** That is now twice.

---
## DONE 2026-08-31 (late) — the title text, the fixed counter, and dead keys at the menu

### The banner collision was the WINDOW TITLE, not the traffic lights

Bruno sent a screenshot and it settled two failed attempts at once: macOS was
drawing a bold **"StudyQuest"** straight across the player's name. With
`.fullSizeContentView` and `titlebarAppearsTransparent`, AppKit keeps the
titlebar but STILL DRAWS THE TITLE over the content — and the title starts to
the RIGHT of the traffic lights, so the gutter reserved for them could never
have helped. I was solving the wrong half of the corner, twice.

`window.titleVisibility = .hidden` drops the text and keeps the titlebar, so
dragging, double-click-to-zoom and the lights all still work. The window needs
no visible title: the app name is in the menu bar and the HUD says who you are.

NOT testable by the suites — it is AppKit chrome, invisible to headless Chrome.

**The lesson:** two rounds of "still broken" on a UI bug I could not see meant I
should have asked for the screenshot sooner instead of tuning my own render.

### The Trading Post does not restock

Bruno: *"the trading post will not restock every day: change that."*

The daily reroll was left over from when the shelf was a random five materials
and "come back tomorrow" was the whole shape of the shop. It sells a FIXED
counter now — two replacement tools, two charms — so a shelf that silently
rebuilt itself at midnight was a fact nobody could observe, with a promise in
the UI ("Restocks tomorrow — a fresh five in...") that was no longer true.

Two things kept on purpose:
- **`PRICING_VERSION` still forces a rebuild.** Prices are baked into the
  offers, so without it a repricing is invisible in any save that already has a
  shelf — and there is no longer a midnight to force one.
- **`brokerBoxesSoldToday` still resets on the day.** That cap really is daily;
  it is a different clock from the shelf.

Verified live: a save whose shelf was built yesterday keeps it today, while the
Broker's counter resets.

### The world's keys are dead at the title screen

Bruno: *"the esc key works outside of the game (in the start menu and save
selection menu), it should not."* Worse than reported: `game.stop()` halts the
world but never released the KEYS, so Esc opened the pause menu BEHIND the
launch panel and Q opened the task log invisibly underneath it — the Q half of
which REVIEW-CLIENT.md had already listed as an open defect.

`atTitleScreen()` gates the whole keydown handler. It reads the launch panel's
own state (`sq-menu-open` / `.sq-launch-root`) rather than a second flag that
could drift from it. Checked both ways: removing the guard fails
`12-continue-slot` at "Escape did NOT raise the pause menu behind it".

---
## DONE 2026-08-31 — a thicker wood

Bruno: *"add more trees around (remember not to block paths to the woodsman or
the dirt roads)."*

Density raised from `trees > 0.575 && jitter > 0.32` to `> 0.495 && > 0.30`.
Measured: **11.3% of the map to 21.5%**, grass down from 61% to 51%. It read as
a lawn with ornaments before; it reads as a wooded block now. With every tree
dropping a seedpod, a thicker forest is something to work rather than a wall.

**The warning was half unnecessary and half exactly right.**

Unnecessary: the dirt paths are carved AFTER the tree pass and overwrite
whatever they cross, so raising density can never block a road. Same for the
plaza, the grove and the glade — all carved later.

Exactly right: the GROVE and GLADE ring carves run later still, and they planted
a tree on whatever they found, PATH INCLUDED. A tree could land squarely on the
dirt road leading to the Woodsman — a wall across the only marked way to him.
Both rings skip path tiles now. That was live at the old density too; the extra
trees would only have made it likelier.

**Connectivity measured, not eyeballed.** A flood fill from the plaza with trees
counted AS WALLS reaches the Woodsman's clearing and the cave mouth, so neither
needs an axe to get to. Two of the five road corners are not walkable — but they
measure IDENTICALLY at the old density, so that is pre-existing (one is the
Bloom's island in the lake, the other is behind the mountain massif), not
something the trees caused. Checking before/after rather than just after is what
made that distinction available.

`15-outlanders` now asserts the density floor (16%, well under the measured
21.5% so a small retune survives, high enough that reverting fails) and that the
Woodsman and cave mouth stay reachable on foot.

---
## DONE 2026-08-31 — the grove has ONE door again

Bruno: *"I liked how the woodsman was surrounded by trees except by one block
which was the entrance, can you redo that?"*

It had drifted, and the last change made it worse. The gap was never DECLARED —
it was wherever the approach happened to cross the ring. The path south out of
the clearing was two tiles wide, so it punched a two-tile hole; the plaza road
arriving on the ring's edge opened a third; and telling the ring to skip every
PATH tile (done an hour earlier so a tree could not land on the road) turned
each crossing into a permanent opening.

The ring is AUTHORITATIVE now: it plants a tree on every border tile that is not
water and not the door, path included. The door is declared — `GROVE.doorX`, on
the south edge — and the path out of it is one tile wide, joining the road just
south. Water is still left alone: a tree standing in the lake reads as a
mistake, and water walls the clearing as well as a trunk does.

Result, counted rather than eyeballed:

    36 444444441      the ring, complete
    37 440000041
    38 040000041      0 = the clearing
    39 040000041
    40 040000040
    41 044414440      <- ONE gap, at doorX
    42 000011100      the path south, joining the road

The Woodsman stays reachable on foot with no chopping. `15-outlanders` counts
the ring's walkable gaps and fails on anything but exactly one, at doorX.

**The lesson:** "where the way in is" is a design decision. Leaving it to fall
out of whatever else got carved there meant it changed every time something
adjacent changed, three times over.

---
## DONE 2026-08-31 — THE HERALD: he rides in at level 20 and points east

Bruno's spec, in full: at level 20 the Wandering Merchant rides a horse in from
the LEFT of the map, from open ground, to the middle, and stays there forever.
Talking to him opens the quest — Gotham, Ranon the false heir, the tribes of the
farlands, and the Wise Man of the snowy peaks.

**A shape this codebase had not had before:** something that happens ONCE, on a
wall clock, triggered by a level, that then stands there permanently. Almost
every part of it can look finished and do nothing, which is what `17-herald`
(31 steps) exists to stop.

**The summon** stamps `herald.summonedAt` the first time the scholar is seen at
level 20. Checked LAZILY on a state read, like the stamina tick — so a save that
was already past 20 before he existed summons him too, and a levelling path that
forgot to call it cannot strand him forever.

**The ride is derived, never ticked.** Position comes from `summonedAt` against
the wall clock, so closing the game halfway through the arrival just means he is
further along when you come back. Two legs — east along the clear row, then a
turn down to the centre. A straight diagonal read as him swimming across the
corner of the map.

**The route was MEASURED, not guessed.** Every left-edge row was scored for
water and blocked tiles between the edge and the centre; `rowY: 22` is the one
with no water at all and only two solid tiles the whole approach. The stop
(32,24) is the middle of the map and happens to be a dirt path. The suite
asserts the approach row stays water-free, so a terrain retune cannot quietly
have him ride in through the lake.

**Talking.** He has no building to stand beside, so `requireRole` is no use: the
gate is a plain distance to where he stopped, and the world raises a `__herald`
sentinel that E handles BEFORE any building. He refuses to talk mid-gallop. His
prompt suppresses a building prompt when both are in reach, because E already
prefers him and showing both offers a choice the key does not give.

**The objective is its own final panel**, italic with a rule down its left edge,
and the box's name tab switches to NEW OBJECTIVE for it. Kept apart from his
lines rather than appended as one: it is not something he SAYS, it is what you
are now doing. 400 xp, paid once; hearing it again is free.

`/api/dev/herald-arrive` winds `summonedAt` into the past so a suite need not
wait 16 real seconds. It cannot SUMMON him — only level 20 does — so it is not a
route to the quest early.

**Fifth time today** I put backticks in a comment inside a template literal and
broke a file at parse time. There is now a comment in that exact spot saying so.

**Open:** the horse-and-rider sprite is legible but crude at 24x24, and the
quest it opens has nowhere to go yet — there is no eastern mountain and no Wise
Man. The objective is a promise the map cannot keep until that region exists.

---
## DONE 2026-08-31 — the Herald's reward moved, menu music, developer mode

### The 400 xp belongs to the arrival, not the telling

Bruno: *"he pays 400 xp when you find the wise man you are going to be looking
for next."* `herald_heard` is 0 now and `QUEST_XP.wise_man_found` is 400,
reserved for a region that does not exist yet. Being told about a journey is not
making it, and paying up front spends the quest before it starts. The telling is
still recorded as a quest beat so a Codex — or any future "have you been told?"
check — has something to read.

### Menu music

`web/audio/menu.mp3`, looping on BOTH launch screens (they are the same panel),
stopped the instant the world starts. Started and stopped in exactly the two
places the menu is raised and dismissed, so it cannot be left playing over the
game or silent over the title.

**The real problem was AUTOPLAY.** Browsers refuse audible playback before the
first user interaction, and the menu is the first thing on screen — so
`audio.play()` rejects, silently, on precisely the screen the music is for. It
tries immediately and, if refused, arms a one-shot pointer/key listener and
starts on the first interaction instead. In practice that is pressing PLAY.
WKWebView applies the same policy, so this matters in the shipped app too.
Fades rather than cuts, and sits at a third volume: it plays UNDER a menu.

Also: the server's MIME map IS its allow-list — an unknown extension 404s by
design, which is what stops it serving the source tree. `.mp3`/`.ogg`/`.wav`
added. `build-app.sh` copies `web/` wholesale, so the file ships with no change
there (bundle went 3.3M -> 4.7M).

### Developer mode

A GREEN button in the launch footer — green because it is not part of the game,
and must never be mistaken for something the scholar can do. It opens a sheet
with level, florins and shards, and grants every material, gadget, block,
blueprint, charm and tool at full durability.

Two deliberate constraints:
- **It grants; it does not switch anything on.** There is no cheat flag for the
  rest of the game to branch on — that is what would actually alter normal
  gameplay, by giving every system a second code path only a developer walks.
- **It stamps `meta.devUsed` and never clears it.** A save handed level 20 is
  not evidence of anything, and later me should be able to tell at a glance.

Setting level 20 there summons the Herald, which is the point, and the suite
asserts exactly that.

One thing worth recording: the sheet body is PARCHMENT and the footer is dark,
so the same green had to be written twice. The first pass reused the footer's
light-green-on-dark inside the sheet and it came out all but invisible on paper.
`12-continue-slot` now measures the button's foreground/background luminance
difference rather than trusting the stylesheet.

---
## DONE 2026-08-31 — the Herald: where he stops, and how he moves

Bruno: *"the horse man should stop at the middle between the four buildings. it
currently goes across a couple of trees and in the road. improve the animation:
the horse needs to move its legs when walking and the rider needs to be a bit
more real."*

**Where he stops.** (32,24) was "the middle of the map" — and it is a DIRT PATH,
which is why he ended up standing on the road. He stops at (25,19) now: SPAWN,
the open ground the four plaza buildings box in, and the same tile a new save
begins on.

**The route.** Measured again, this time counting TREES and STONE as well as
water — the first pass only scored water, which is how he ended up riding
through a couple of trees. Row 22 is the only left-edge row that reaches the
plaza with none of the three, and the column north from it to the stop is clear
as well. `17-herald` now walks BOTH legs of the route and fails if anything
solid sits on either, so a terrain retune that grows a tree across his path
breaks a test rather than appearing on screen.

**The animation.** Two frames, and ONLY THE LEGS change between them:
fore-forward/hind-back, then swapped. The rider is identical in both on purpose
— at 24x24 a rider that moves too reads as a wobble rather than a canter. Frame
0 doubles as the standing pose, because a horse at rest stands with its legs
apart rather than mid-stride, so he stops cleanly instead of freezing mid-step.
`HERALD.stepMs` (190ms) is the swap rate.

The rider gained a hood crown, a face with eyes and a chin, shoulders and a
cloak over the torso, instead of the coloured blob he was.

The suite samples his frame repeatedly during the ride and requires BOTH to
appear, then checks he is on frame 0 once stopped. One frame is a still image;
two is a walk.

---
## DONE 2026-09-01 — nothing grows against a wall, or beside a trader

Bruno, with a screenshot of the plaza: *"in this area, seeds should not be
allowed to be planted (would obstruct the buildings and the npcs). this also
applies to the area near the woodsman npc (the soil 1 block right next to it)."*

`plantingBlockedAt()` in shared/constants.js, used by BOTH the world's plant
prompt and the server's refusal. One rule, two callers — a prompt the API would
decline is the exact shape of bug this project keeps having to fix, and it has
shipped that bug more than once.

Two clauses:
1. **One clear tile around every building.** A mature tree is a SOLID tile and
   trees do not grow back, so one planted in the gap Bruno photographed walls
   off a doorway permanently.
2. **One clear tile around every standing vendor.** The Woodsman is the case
   that matters: he stands in a clearing barely wider than he is.

**I started with a plaza box and backed out of it.** Blocking the whole 12x12
`PLAZA` sterilised a large square of map for a problem that is really about
DOORWAYS, and it broke an unrelated planting test five tiles from any wall. The
halo is tighter, follows a building if it moves, covers anything raised later —
and it closes exactly the gaps in the screenshot, since every one of them is
within a tile of a wall.

`PLAZA` and `inPlaza` moved from web/world/world.js into shared/constants.js on
the way (the server needed them), and world.js re-exports them so nothing that
imported from there broke.

**Where the NPC clause earns its keep:** the building halo already covers the
tile the Woodsman stands on, so the only place the second rule changes anything
is the row BELOW him — outside the camp's halo, still right beside the man. That
is what `10-plantings` asserts, rather than a tile the halo would have caught
anyway. My first version of that assertion tested two tiles to his side, which
the halo also covers, and it failed — correctly. The test was wrong, not the
rule.

---
## DONE 2026-09-05 (3) — ELDERWATCH, the third map

The Wise Man's errand made good: the Ashen Standard, in the Hall of Keeping,
behind a garrison that has forgotten what it is guarding. Design and outcome in
ELDERWATCH.md.

BUILT AS THE OPPOSITE OF THE MOUNTAIN — flat, one layer everywhere, walled, and
made of rooms. No lift, no cliff face, no ledge: the Reaches' whole vocabulary
is deliberately absent, because a fort that reads like a mountain is just more
mountain. What stops you is people.

THE ROUTE: the barred gate is never the way in — the cracked CULVERT under the
west wall is, and the Stone Hammer that opens it is the last thing the mountain
gave you. Then two watchmen with sight-lines; then a barred door held by two
plates (the barrels are the mountain's boulders in another coat); then the Brass
Key; then the keep.

WHAT IT COST THE ENGINE, and all of it was generalisation rather than addition:
  * CROSSINGS, a table. Two maps could be a pair of constants; three cannot, and
    the Reaches have a door at each end.
  * AREA_PUZZLES, keying boulders, plates, gates and the door a patrol throws
    you back to. Boulder state is now keyed `area:id` — two maps may both have a
    `yard_a`.
  * `pace(beat)`, a patrol as a pure function of the clock. The Warden was the
    first one; the watch are two more.
  * Keys and locked doors — the first gate here that a KEY opens rather than a
    level, a plate or a tool.

AND THE SAME BUG, TWICE, A WEEK APART: a gate is a SOLID TILE, so the ordinary
solidity test blocks it however its plates stand. I fixed that for the ice gate
on the mountain and then wrote the keep door with the identical hole — its own
rule said yes and `isSolidHere` said no immediately afterwards. Both now go
through one predicate, asked before the terrain, on every map.

Three whitelists also had to stop being two-way switches (`areaOf`, `stateArea`,
and the boulder store): with three maps, "not peaks" no longer means "home", and
a save standing in Elderwatch was quietly redrawn as the Home Block.

25 suites. The new one walks the whole fort through `probeStep` — the function
the game's collision actually calls — and asserts after each lock that the next
thing is reachable and the one after it is not.

## DONE 2026-09-05 (2) — the ice trap, properly this time; and the repo

TWO WAYS TO GET STUCK, AND THE SECOND ONE WAS THE REAL ONE.

1. THE SLIDE AND THE COLLISION DISAGREED. She walks in free PIXELS; the slide
   reasons in TILES. Step onto ice half a tile out of true and the tile ahead
   reads free while her body is fouling the corner of a pillar beside it — she
   stops dead with the slide still running and every key ignored. A slide now
   snaps the CROSS-axis to the centre of the tile she is already standing in
   (which can only move her away from her neighbours, never into them), so the
   two agree for the whole slide. Plus a backstop: a slide that has not moved
   her for 90ms is not a slide, and is dropped.

2. SHE COULD BE WELDED INSIDE THE GEOMETRY, which is why only a reload freed
   her. The mountain's blocked-test is RELATIVE — whether a tile may be entered
   depends on which terrace you are standing on — so a tile can turn solid UNDER
   her. Slide south off a ledge and the tile she is still half standing in
   becomes "you may not climb up there"; her box overlaps it, every direction is
   refused, and she is stuck until load-time's nearestFreeTile rescue picks her
   up. GROUND SHE IS ALREADY STANDING ON IS NEVER A WALL now — `isBlocked`
   exempts any tile her box overlaps. Verified by removing the exemption and
   watching her weld herself to 30,32.

That second one is a general hazard, not a Reaches one: any position-dependent
collision predicate can trap a multi-tile hitbox. The exemption is the fix for
the class, not just for the ledge.

THE REPO. github.com/bdehuerta/studyquest, private. `data/` is NOT in it — those
are real slots with real tasks and study sessions typed by a real person, and
they are not code. Nor is `dist/` (7MB, one command rebuilds it) or
`tools/shots/` (6MB, regenerated by every test run).

## DONE 2026-09-05 — the ice jammed, and the road east still went nowhere

THE ICE WAS A TRAP IF YOU HELD A KEY INTO A ROCK. Walking resolves each axis on
its own, so pressing into a wall and pressing another way slips you ALONG it. A
slide collapses the input to ONE direction, and the first cut always collapsed
it to the dominant one — so pressed against a pillar with that key still held,
every other key did nothing and the ice read as a trap. It now tries the
dominant axis first and falls back to the other, which is the same behaviour
walking already had. Also swept the whole tarn offline for tiles with no way out
at all: there are none.

MY FIRST TEST FOR IT WAS VACUOUS, and passed against a knowingly broken build. I
had put it after the dev grant that hands over every piece of gear — including
the CRAMPONS, which switch sliding off entirely. She was not sliding at all, so
of course she was never stuck. Moved before the grant, it fails on the old code
with "stuck at 24,27 with two keys held" and passes on the new.

THE ROAD EAST WAS STILL UNREACHABLE FROM THE MAZE. It ran along row 32 — the
terrace's top row, where the stair out of the labyrinth stands carrying the
terrace ABOVE it. Stepping east off that stair was therefore a step between two
terraces, which only a ladder or a stair may be. The road moved one row down to
33, where it is flat all the way, and the hole it cuts in the maze's east wall
opens straight onto the corridor inside.

AND THE FLOOD FILL COULD NOT HAVE CAUGHT THAT. The tarn sits directly north of
the road and you may hop DOWN a ledge, so the fill cheerfully reached the road
from above while the door out of the labyrinth was sealed against it — the
assertion was true and meant nothing. There is now a second one that checks the
single step that was broken.

ITS FAR END IS A PASS rather than a road that stops in a field: two piers of
rimewall frame the last tile with the sealed border beyond, so you can see where
it goes and that it is not open yet.

## DONE 2026-09-04 (5) — the road nobody could reach, and a fire that shone through rock

THE ROAD EAST WAS DRAWN AND UNREACHABLE. Bruno: "you did not build the road
east." It was there — a grit road along the top of the Foot terrace, with its
own prompt — and there was no way to walk onto it. The labyrinth is fifteen rows
tall in a fifteen-row terrace, so it divides the Foot in two with no lane above
it or below it, and the road started one tile east of the maze's north-east
corner. It now starts IN that corner, cutting through the wall beside the stair,
so stepping out of the maze puts you on it. 23-mountain asserts every tile of it
is reachable from the arrival — a road you can see and cannot walk to is
scenery, and nothing was testing that.

THE HEARTH LIT THE MOUNTAINSIDE. The cave's fire was a plain radial pool, so it
reached straight through two walls and lit the boulders out on the Warden's
shelf. Clipped to the room it was worse: a hard-edged puddle with half the
chamber still dark. The room is now lit AS A ROOM — the wash is lifted off the
whole cave and its doorway, so the edge of the light falls exactly on the walls
— with the hearth a warmer spot inside it rather than the only thing you can see
by.

THE LABYRINTH'S STAIR moved into the north doorway itself (23,32 rather than
23,31), so the maze opens directly onto the flight instead of a step, a pause,
and then the terrace. The tarn's slide route is anchored to where you first
stand, so the pillar that starts it moved down a row with it — verified with the
standalone slide solver, which is the only way to know a slide puzzle is still
both solvable and still mandatory.

## DONE 2026-09-04 (4) — the old man you could not see, and a road east

THE WISE MAN WAS BEHIND THE HUD. Not missing — drawn, but off the top of the
view. A tile on layer n is lifted n*LAYER_LIFT up the screen, so on a
five-terrace mountain the summit is painted 48 world pixels — three whole tiles
— above its own row, and the camera was only allowed to rise by the banner's
height. `topInset()` now adds the mountain's maximum lift while you are in the
Reaches, and the map's border rows take the layer of the terrace they border
(left on 0, the top row drew unlifted against a summit three tiles up and opened
a band of bare background across the top).

AND THE CAVE WAS TOO DARK TO SEE HIM IN. Every other dark place is lit by what
you carry, which the Stonemason's chamber can afford because nothing in it has
to be SEEN. This is the end of the Herald's errand: arriving without a lantern
charm and finding a black room with a voice in it is not the scene. The old man
keeps a fire now — a second light pool, centred on him, part of the room.

THE STAIRS WERE TWO STOREYS TALL. A climb tile carried its art down the cliff
face as well, which is right for a LADDER (pinned to the rock, it has to reach
the ground) and wrong for a stair: one step up was drawn as two flights. Ladders
keep it; stairs are the tile alone, with the ground below.

A ROAD EAST, out of the labyrinth's north door and away along the top of the
Foot terrace. It goes nowhere yet — that is the point. Standing on its last
stretch the world names it, and what it says changes once the Wise Man has told
you about Elderwatch: a question first, an errand afterwards.

AND THE SNOW ROAD I HAVE OWED SINCE THE REGION SHIPPED. Every road up here was
the Home Block's brown dirt, which read as a garden path laid across a mountain.
`snowroad` is grit and packed ice in warm greys.

## DONE 2026-09-04 (3) — a climb that reads as a climb

Bruno: "you should not go up stairs so quickly. it teleports instead of
climbing."

TWO CAUSES, BOTH IN THE DRAWING. Her terrace is a property of the TILE she
stands on, so the instant she crossed onto a stair her drawn position jumped a
whole terrace — twelve world pixels, thirty-six on screen, in ONE frame. And she
crossed it at full walking pace, so the whole ascent was over in about a fifth of
a second. Between them: a blink, not a climb.

  * `drawLift` now chases the tile's height instead of taking it, so she rises
    visibly up the rock face and settles at the top. Snapped rather than eased
    for the three moments she is legitimately somewhere else in one frame:
    loading a save, crossing between maps, and being thrown back by the Warden.
    Easing those would send her gliding across the screen.
  * Movement on a ladder or a stair runs at half speed. A ladder crossed at
    walking pace is a ladder you never see.

TESTED IN FRAMES, NOT IN FLAGS: the suite samples her drawn height every 40ms
across the step and demands at least three distinct values BETWEEN the two
terrace heights. If the lift snapped, every sample would read either 0 or the
full height and there would be nothing in between — the in-between is the climb.
Verified by removing the easing and watching it go red.

## DONE 2026-09-04 (2) — the boulders covered you, and a broken wall stayed a wall

Two of Bruno's, both in the drawing rather than the rules.

BOULDERS DREW OVER THE SCHOLAR. The mountain's standing objects — boulders, the
gear caches, the Warden, the old man — were painted in their own pass AFTER the
depth-sorted one, so anything she stood south of covered her from the shins up:
she vanished behind the very rock she was pushing. They now queue up in the
drawables list and are drawn back-to-front by foot position like every other
object in the world.

The same pass also carried the two things that are FLOOR MARKINGS — a held
plate and the Warden's sight-line — which were therefore being laid over her
feet. Those moved the other way, to before the sorted pass, where ground
markings belong.

A BROKEN WALL WENT ON BEING DRAWN AS A WALL. The tile map still says
"crackedcrag" at that tile forever (that is how every finite node works), and
`HARVESTED_TILE` had no entry for it — so the renderer fell through to drawing
the tile itself, and a doorway you had just hammered open looked exactly as shut
as before you swung. It now has its own art: dark floor, the broken-off jambs
still standing at each side, and the rubble lying where it fell.

## DONE 2026-09-04 — the Hammer could never swing, and the tarn could be walked round

Bruno: "how do you equip the stone hammer to break the blocks?" — you don't, and
that was the bug.

THE HAMMER WAS WIRED TO NOTHING. Reaches gear is passive by design, but
`nodeReady()` — the predicate the E key is gated on — asked `equippedToolFor()`,
which looks up `node.tool`. A gear node has `gear` and no `tool`, so the lookup
found nothing, the swing never fired, and the prompt read "needs a tool". You
could find the Stone Hammer and never use it. `nodeReady` now asks for the GEAR
when a node wants gear, the prompt says "needs the Stone Hammer" instead of
offering a slot to put it in, and there is nothing to equip.

WHY NO TEST CAUGHT IT: every version of 23-mountain broke the bricked doorways
by POSTing to /api/gather, which skips the client entirely — and the client was
the broken half. The suite now stands in front of a doorway, asserts the world
OFFERS "E break the cracked rock" with both hands empty, and breaks it with
three presses of the E key before falling back to the API for the rest.

THE FROZEN TARN IS ICE WALL TO WALL. It had snow margins along the top, the
bottom and both ends, so the entire slide could be walked round on dry ground —
the puzzle was optional. The only ground you can stand still on now is the
island with the Crampons on it and the landing at the top of the stair.

Two pillars carry the whole puzzle, and both are load-bearing:
  * (26,30) stops the first slide east out of the landing, and from there north
    then east runs onto the island. The route is three slides long.
  * (50,26) sits directly under the ladder's foot so that NOTHING can come to
    rest on it — a slide up that column is stopped a tile early and no other
    direction can end there. Without it a lucky slide reaches the ladder and the
    Crampons are decoration. Verified with a standalone slide solver as well as
    by the suite.

## DONE 2026-09-03 (6) — THE REACHES, STACKED

Bruno got stuck at a ladder (screenshot). The cause was structural rather than
cosmetic: v2 climbed WEST TO EAST, and the cliff faces that tell you which way
is up hang off the SOUTH edge of a terrace. A mountain that climbs sideways
shows the player no face at all — two fields of snow at different heights look
identical, and a ladder set in a wall reads as scenery.

THE MOUNTAIN IS NOW STACKED: five terraces up the screen, arriving on the
lowest. Each is a room with one way out of the top of it, behind its own puzzle:
the labyrinth -> a stair; the tarn's slide -> a ladder; boulders on plates -> a
stair; the dungeon -> a ladder; the Warden -> the cave. Ladders need the Hooks;
stairs need legs.

HOME WAS NOT TOUCHED. Its road east stays past the storage hut at the top of the
map; the Reaches receive you at the bottom. Travelling is a teleport, so the two
sides never had to line up — CROSSING.peaksEntryY was the whole change.

HEIGHT THAT READS: the step is 12px of a 16px tile; a terrace edge is the cliff
TILE clipped to the drop (real grain, not a grey bar) with a lit lip, a black
base and a shadow cast onto the ground below; and A LADDER OR STAIR CARRIES ITS
OWN ART DOWN THE FACE, so the flight is continuous from the ground to the
terrace above. That last one is exactly what was missing from the screenshot.

FOUR REAL BUGS FOUND WHILE REBUILDING, three of them invisible before:
  * THE ICE GATE COULD NEVER OPEN. `isBlocked` asked the mountain first and the
    terrain second — but an ice gate IS a solid tile, so the terrain test
    blocked it whatever its plates said. It passed for a year of test runs
    because the v2 map let you WALK AROUND the gate: the lock was never a lock.
    Open gates are now answered before terrain, in one shared predicate used by
    the movement code and both test probes.
  * `probeSlide` ignored the Crampons, so the reachability test slid on ice
    whatever you were wearing and a route that only opens once you can stand
    still looked permanently shut.
  * every way up was placed as its terrace was built, and the NEXT terrace's
    floor pass painted over it — the stair out of the labyrinth was plain snow
    by the time the map finished. All four are cut last now.
  * the bricked doorway into the gallery had a tile of wall behind it.

Two suite assertions were stale by design after the rebuild ("nothing above the
first terrace is reachable" is now false ON PURPOSE — the tarn is open from the
start and its slide is the puzzle) and one hard-coded scan window quietly
stopped testing when the terraces moved. Both fixed at the assertion.

## DONE 2026-09-03 (5) — THE REACHES REMADE

Plan and outcome both in REACHES.md. Three defects, one design failure.

1. THE LABYRINTH COULD BE CHOPPED THROUGH. Its walls were snowpines, and a
   snowpine is a gather node — the axe every scholar arrives with made the whole
   maze optional. Walls are now RIMEWALL: not a node, so no swing is ever
   offered, and a forged gather sent straight to the server still cannot open it
   (a felled record only frees a tile whose TYPE is a node). Both asserted.
2. THE STONE MAZE MADE NO SENSE. It was a slab of crag with one-tile corridors
   cut out by a line tool: worms, not architecture. Rebuilt the other way round
   — solid rock, five chambers carved into it, doorways two tiles wide, walls
   two tiles thick, and the cracked crag turned into bricked-up doorways. The
   floor was also within a shade of the walls, so the level read as one lump of
   stone; the floor is now dark slate under masonry walls.
3. ONE STAIR, DRAWN WRONG. It was flat stripes on open ground. It is now a
   flight cut into rock with dark cheeks and lit treads, and the terrace ladder
   is pinned INTO the cliff face instead of standing on the terrace beside it.
4. WHAT WAS MISSING: LEDGES. Stepping south off a terrace is free; every other
   way up needs a ladder or a stair. The wall pass leaves south-facing edges
   open so the drop is a ledge rather than a wall. This is the single change
   that makes the climb a loop rather than a corridor.

ALSO, off the Nintendo list: cliffs got a lit cap, a black base and a cast
shadow, and the step went 6px -> 10px; every standing object casts a contact
shadow; pines come in copses rather than per-tile sprinkle; the tarn lost its
right angles.

TWO VACUOUS ASSERTIONS CAUGHT IN THE WRITING, both of which passed against a
knowingly broken build: the "axe is refused" check was being refused for having
NO AXE, and the wall it aimed at was a corridor tile. The fixture now carries
the axe and the test aims at a wall it is standing in front of.

## DONE 2026-09-03 (4) — the Home Block stops leaking into the Reaches

Bruno: "things from the home world still appear in the reaches, like the boat or
the ceiling of the cave, or the npcs."

ONE CAUSE, FIVE SYMPTOMS. The hut, the mooring, the Herald's stop and the
Stonemason's chamber all live at FIXED coordinates — and every one of those
coordinates exists on the second map too. Each feature was guarded (or not) at
its own draw site, so the Reaches grew a door to unlock at 53,10, a boat to
board at 44,40, a rider to talk to at 25,19, and a slab of the Stonemason's
CEILING painted across the snow at 52,36 (drawCaveRoof was not guarded at all:
outside the chamber its target opacity is 1, so it drew at full strength).

Fixed at ONE predicate, `atHome()`, which `hutState`, `atHutDoor`,
`boatGranted`, `nextToBoat`, `riding`, `heraldState` and `drawCaveRoof` now all
pass through. Guarding draws one at a time is exactly what let these through:
the next Home feature added will be wrong in the same way unless it goes through
the same gate.

THE TEST WAS WRONG TWICE BEFORE IT WAS RIGHT, and both times it passed on a
deliberately broken build:
  1. it sampled the middle of the SCREEN — but the camera clamps at the map
     edge, so screen-centre is not where the scholar is standing, and it read a
     tile nowhere near the cave;
  2. it then sampled beside her and landed on a snowpine, so "not snow-bright"
     was true for the wrong reason.
It now finds a tile the map itself says is SNOW inside the cave rectangle, works
out where that lands from the render probe's world origin, and reads that pixel.
Verified by deleting the guard and watching it go red, then restoring it.

## DONE 2026-09-03 (3) — THE REACHES BECOME A MOUNTAIN

The plan is REACHES.md; this is what shipped against it. Home is untouched.

THE ONE CHANGE EVERYTHING RESTS ON: every Reaches tile carries a LAYER (0-3).
You move within your layer; a terrace edge is a wall; ladders and stairs are the
only two tiles that bridge one. Drawn by lifting a tile `layer * 6px` up the
screen and filling the gap with rock — every coordinate in the game is still a
flat (x, y) and nothing else in the engine knows the mountain has height.

THE MAP IS AUTHORED (web/world/reaches.js). Noise can make a snowfield; it
cannot make a labyrinth, a sight-line, or a slide you have to read before you
commit to it. Terraces are painted rectangles, the maze is drawn as text.

FIVE LOCKS, IN ORDER: the pine labyrinth (attention) -> the Climbing Hooks
(every ladder) -> the frozen tarn's slide puzzle (Crampons) -> two boulders on
two plates (the ice gate onto the stair) -> the Stone Hammer (five walls of
cracked crag) -> the Rime Warden (the cave). Gear is PASSIVE and never
equipped: a puzzle you can fail by holding the wrong thing is an errand.

THE WARDEN is a boss in a game with no combat: a patrol, a sight-line, three
plates. Caught, you go back to the ladder head and its boulders reset. Nothing
has hit points and losing costs you the room rather than the save.

THE OLD MAN tells the story the Herald could not, and names the next region:
Elderwatch, and the Ashen Standard the tribes will raise a Levy for.

HOW IT IS TESTED, AND WHY THAT SHAPE: 19-reaches is `browser: false` and never
drew the map, which is how the last round of bugs got through. 23-mountain
FLOOD-FILLS the whole climb through `probeStep` — the exact function the game's
collision calls, not a copy of the rule — and through `probeSlide` for the ice,
asserting after each lock that the next thing is reachable and the one after it
is not. 24-warden drives the patrol, gets caught on purpose, and pushes the
three boulders. The labyrinth is walked on every run: it was drawn wrong twice
(a door opening onto a wall, then an east wall standing in the only lane out)
and both times the fill caught it before it could ship.

FOUR MAP BUGS THE FILL CAUGHT, all the same species — a later pass quietly
painting over an earlier one:
  * the maze's east wall stood in column 18, the one lane between the labyrinth
    and the terrace wall;
  * the terrace wall sealed the ladder's own approach (the road ran up column
    19, which IS the wall — its only hole is the tile in front of the ladder);
  * the Shattered Steps' rectangle ran down to y=19 and repainted the boulder
    room as layer-2 crag, walling the puzzle in from every side;
  * the upper corridor was cut along row 8, which the Summit's south wall is
    built on top of later.

STILL OWED: a packed-snow variant of the path tile — the roads up here are
drawn in the Home Block's brown dirt.

## DONE 2026-09-03 (2) — two maps that are actually two maps

**The Woodsman stopped buying Heartwood and Amber Resin.** He takes timber only
now. The Trading Post still takes them, at the worse town rate.

**TILE STATE WAS ONE NAMESPACE FOR BOTH MAPS.** `state.harvested` and
`state.plantings` were keyed bare "x,y", so felling a pine in the Reaches felled
the tree on the same coordinates at Home, and Home's stumps, saplings and felled
Blue Bloom were painted onto the snow — the "blue bloom and a boat copied into
the snowy map". Fixed with `tileKey(area, x, y)` / `parseTileKey` in
shared/constants.js, derived by BOTH the server and the renderer. Home keeps the
BARE key, so not one existing save needs migrating; only the second map, which
no save can have written to yet, gets a prefix.

**Snowpines are trees now.** `TIMBER_TILES` replaces `node.tile === 'tree'`, so a
snowpine inherits the whole deal: axe, finite, replantable, the same drop table,
the same stump. Snow is plantable ground. A stump or a planting forces the
ground under it to bare BARE GROUND PER MAP rather than always grass — that
green square in the snowfield was this.

**SETTINGS NEVER PERSISTED, AND THE REASON IS THE PORT.** They lived in
localStorage, which is keyed by ORIGIN, and the native shell calls
`SQ.freePort()` at every launch — so every launch was a different origin with an
empty store. They now live in `settings.json` in the data dir (beside the slots,
not inside one: they are the installation's preferences and must not travel with
a save), read and written through `/api/settings`. localStorage stays as a
synchronous cache so the first paint is right; `hydrateSettings()` is awaited at
boot before the menu is built.

WHAT LET ALL THIS THROUGH: 19-reaches is `browser: false`. It counts all 224
border tiles and tests the crossing gates through the API and never once DRAWS
the second map. New suite 21-snowfall stands in the snow and looks: it crosses
for real, asserts Home's tile state is not rendered there, fells a pine and
checks the record lands under a `peaks:` key while Home's tiles are untouched.
22-settings changes a setting in the sheet and asserts it reaches DISK, then
wipes the local cache the way a new port would and hydrates it back.

AND A TRAP WORTH KEEPING: an `api` step in the smoke harness understands
`path`/`equals` and IGNORES `expr` without a word. Two assertions written that
way passed on an HTTP 200 while asserting nothing. Assertions about a response
body go through a browser `assert` with the page's own fetch.

STILL OPEN: the Reaches' road is drawn in Home's brown dirt, which reads oddly
in a snowfield — it wants a packed-snow variant of the path tile.

## DONE 2026-09-03 — the boat actually carries you

Three defects, one report ("it glitches and the player moves instead of the boat
moving with the player inside, and I cant fish while in it").

1. THE HULL SNAPPED, THE SCHOLAR SLID. She moves in free pixels with a hitbox;
   the boat was drawn at `tile * TILE`. Rowing, the hull jumped a whole tile at a
   time and she slid out of it in between. Now one position in one unit
   (`boatPixel()`), drawn 5px low so the gunwale crosses her shins.
2. THE HULL WAS DRAWN OVER HER HEAD. The moored-boat block runs AFTER the depth
   sort, so aboard she was underneath a 16x16 boat — invisible, which read as
   walking on water. While riding it is now drawn in the sorted pass, just
   before her; the later block only draws her moored.
3. FISHING DIED THE MOMENT YOU ROWED. `routeFish` compared the player to the
   CONSTANT `BOAT.x/BOAT.y` — where she was first tied up — so every cast away
   from the mooring was refused. It now asks `boat.riding`, which is the
   server's own flag, set on boarding and cleared on landing and on crossing.
   The riding prompt had the same constant, and stayed behind on the far bank.

WHY 20-boat PASSED THROUGH ALL OF IT: it asserted `playerTile === boatTile`, and
`boatTile()` RETURNS the player's tile while riding. A tautology. It now compares
PIXELS via a new `getLake().boatPx` / `.playerPx` seam, and casts a line out in
open water. 18-lake's fishing steps boarded nothing — they poked `/api/fish` with
`px/py` on the mooring tile; they now board first, and assert the refusals on
her tile and on the bank.

## DONE 2026-09-02 — the lake: a sifter, no more reeds, and a boat

Bruno, in one message: sell the sifter, remove the reeds and the dredge, and
build the whole fishing chain — hut, key, keeper, boat, fish — plus split the
Trading Post into BUY and SELL.

### The sifter, and the end of the reeds

Prospector's Sifter on the counter at **14 florins**. The `reeds` node and the
`dredge` are gone: water is water now. `TOOLS.dredge` and its TOOL_IDS entry are
KEPT so a save that already owns one still renders its name instead of
`undefined`; there is simply nothing left to use it on and no recipe to make
another. **Inkglass has no source any more — see item 0a.**

### The chain

Level 15 puts a **Silver Key** on the counter at 5f -> carry it to the hut door
in the north-east woods -> the lock turns, the **Hutkeeper** comes out, the key
is SPENT and the **boat** changes hands -> she appears in the lake by the
mountain -> stand on her and press **L**. Ten-second interval, 60% for one Wild
Tuna.

Decisions worth keeping:
- **The key is added on READ, not baked into the stock.** Stock is fixed and
  cached in the save, so a level-gated offer stored in it would either never
  appear (cached before 15) or never go away (cached after). It is computed from
  live state, and it disappears once the hut is open.
- **Unlocking and being given the boat are ONE call.** A player interrupted
  between the two would otherwise be left with neither.
- **The fishing interval is enforced on the server against its own clock.** A
  rate is exactly what a fast-clicking client walks through otherwise.
- The hut's clearing is CARVED, like the grove and the glade — the noise put a
  tree squarely inside the footprint, and the road past it is preserved.

### Two sections at the Trading Post

BUY is the counter. SELL takes **timber, stone and fish** — 5 commons for 1
florin against the outlanders' 7-for-2, and **4 Wild Tuna for 1 florin**, for
which he is the only buyer.

**The "timber, stone and fish only" rule is enforced on the SERVER too**, not
just in the panel. `Shops.sell` accepted ANY material, which let a Home Block
scholar cash out materials from regions they cannot reach and made the
outlanders pointless for anything they did not specialise in. A rule only the UI
knows is not a rule — this project has shipped that mistake more than once.

Wild Tuna is an ordinary MATERIAL so it stacks, shows in the Bag and sells
through the normal path; only its price is special, and that is one line in
`SELL_BUNDLE_OVERRIDE` rather than a bent rarity band.

### A note on the art

The hut is generated from a SHAPE FUNCTION, not typed out. My hand-written
version was one character short on row 3 of 32, and `makeSprite` only reports a
width mismatch after it has already drawn nothing.

**Still open:** the boat cannot be rowed — she is moored at a fixed tile and you
fish from that tile. Moving her is a bigger piece (water pathing, a boarding
state, the camera) and was not asked for.

---
## DONE 2026-09-02 (later) — the Silver Key appeared, and SELL became cards

Bruno: *"I dont see the silver key option to buy. the sell system should be like
the buy buttons instead of a scroll menu ... add two buttons on the top."*

### The key had TWO causes, and the second was self-inflicted

1. **`normShops` threw it away.** Its filter kept only offers carrying a
   material, tool or charm id — a QUEST ITEM has none of those, so the key was
   dropped on the client AFTER the server had correctly put it on the counter.
   A silent failure at the last step of a chain that otherwise worked.

2. **The panel cached the shelf for the whole session.** That was MY change
   earlier the same day, made while removing the daily restock. But the key is
   computed on READ from live state, so a shelf fetched before the scholar
   reached level 15 simply never contained it — and nothing invalidated the
   cache, because levelling is not a shop event.

   The rule I actually wanted was "do not REROLL it daily", not "cache it
   forever". It re-reads on every open now: a handful of rows from a local
   server, always right. **Removing a refresh is not the same as removing a
   reroll**, and conflating them hid a feature for a day.

### SELL is cards now

Every material the Post takes gets a card in the same shape as the buy side —
its rate, what you carry, how many lots are ready — and ONE button that sells
every whole lot. That replaces a dropdown, a stepper and an ALL button: three
controls to answer a question the buy side answers with one click. Whole lots is
the only quantity worth offering, because a remainder is handed straight back.

Items you carry NONE of still get a card, greyed out, so the counter says what
he wants before you have any of it.

**BUY and SELL are two buttons at the top of the panel**, drawn before either
list, so the choice is the first thing on the page rather than something found
by scrolling past the whole counter.

Also fixed on the way: the Merchant's greeting still promised "Five things
today. Different five tomorrow", which had been untrue since the shelf became
fixed.

---
## DONE 2026-09-02 — THE SECOND MAP, the boat, and the end of inkglass

Four things in one message. The big one is that the game has two maps now.

### Inkglass is gone, and the Archive is parked

Rather than invent a source for a material nothing could reach, **inkglass and
every recipe that needed it were removed** — seven of them, including
`build_archive`, `build_library`, `build_lab` and `craft_sifter`. The sifter is
bought at the counter for 14f now, which is a better answer than crafting it.

One recipe had to come BACK: `craft_gadget_focus_bell`, re-cut without inkglass.
The id contract requires every gadget to have a recipe, and removing it broke
`recipes.js` on import. That check was right to refuse.

**The Archive's blueprints are parked**, exactly as the crafting bench is — a
shop selling the right to make things nobody can make is worse than one that
admits it is shut. The listing code is untouched and returns with the bench.

### The Home Block is walled, with one road out

Every border tile is tree or rock except three, at the eastern edge on the road
past the storage hut. The road itself is carved east to the last column FIRST
and the wall goes up SECOND — the other order seals the road, which is exactly
the ordering bug the grove's door taught.

`sealBorder()` picks tree or rock by what is already there, so a shoreline gets
rock and a meadow gets trees rather than a picket fence round the world.
`15-outlanders` counts all 224 border tiles and requires the gaps to be exactly
the declared crossing.

### The Snowfall Reaches

A second map the same size, from the same noise read differently: ICE where the
Home Block made water, SNOW where it made grass, CRAG where it made stone,
snowpines instead of trees. One road west-to-east from the crossing to the foot
of the high peak, and the **Wise Man of the Mountain** at the top of it.

- `player.area` says which map; `state.areaPos` remembers where you were on each,
  so coming back is coming BACK rather than a fixed respawn.
- The Home Block's buildings, vendors, cave and Herald are HOME ONLY — drawing
  the save's one building list on the second map would put the Trading Post in a
  snowfield.
- **The crossing is gated on the Herald.** You may not wander east before you
  have been told to go east; without that the second map is just somewhere the
  map happens to allow and his errand is decoration.
- **The 400 xp finally lands.** `wise_man_found` pays on arrival, which is what
  it was reserved for when the Herald's telling was set to 0.

### The boat

P boards from the bank, WASD rows her, P steps ashore onto dry empty ground.

**The interesting part is the collision INVERSION**: aboard, water is the only
thing you can cross and land the only thing you cannot, so the test FLIPS rather
than switching off. Switched off she would sail through the mountain; left alone
she would sail across meadows.

Two things that had to be got right:
- **Boarding is a TELEPORT.** The renderer adopts the server's position only on
  the first setState so it never fights local movement — right for walking,
  wrong for the three moments the server legitimately moves you (boarding,
  landing, crossing maps). Those now snap.
- **While riding, the boat IS the player**, taken from the renderer. The server
  does drag her along, but `/api/player/move` answers with no state, so the
  client's copy would not catch up and she would be drawn at the mooring while
  you rowed away from it.

You cannot step out into open water — there has to be a bank, and `20-boat`
asserts the refusal as well as the landing.

### The storage hut is solid now

Bruno: *"I should not be able to walk behind the house."* It is carved terrain
with a sprite, not a building record, so nothing ever added it to `occupied` and
the scholar walked through the walls. Added to the collision set and to
`plantingBlockedAt`, with the same one-tile halo every building has.

### A harness lesson, third sighting

The boat test first lived at the end of `14-cave` and failed with every
condition true: `getPrompts()` was returning a frame from minutes earlier while
`isRunning()` still said true. Enough panel work (the Bag, the canvas
paper-doll) and the page's rAF crawls. **A flag is not proof of frames.**
It is now `20-boat` — its own suite, no panels, load-walk-assert.

### Still open — the Reaches are a PLACE, not yet a GAME

Bruno asked for "missions and quests and new puzzles and abilities to overcome
obstacles". What exists is the region, the road, the peak, the Wise Man and the
crossing. What does NOT exist: any puzzle, any new ability, any obstacle that
needs one, and any quest beyond finding him. That is the next body of work and
it is a large one — abilities in particular touch movement, collision and the
equip model at once.
