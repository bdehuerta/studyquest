# StudyQuest v5 — Tasks vs Quests, NPCs, Codex, Refining

Decisions below came directly from Bruno. Read CONTRACT-V3.md and
CONTRACT-V4-QUESTS.md first, and both review files (REVIEW-SERVER.md,
REVIEW-CLIENT.md) — much of v3 is authored but unwired, and that is the
foundation several of these goals sit on.

---

## 1. TASKS and QUESTS are two different things

**TASKS — real coursework.** Opened with **Q**, in the panel where Quests live
today. Its whole job is **submitting work**: write or attach, submit, get graded
(v4 grader seam), get paid. Rename the panel and everything the player sees from
"quest" to "task". This is the LLM-graded surface.

**QUESTS — actual video-game quests.** A separate system with its own panel, and
**it is not on the dock and has no hotkey**. Quests are read and accepted at
**wooden billboards placed around the map**. Content is adventuring, not study:
- bring items to NPCs
- find places
- go somewhere and come back

This follows the v3 rule that economic and narrative actions have a *place*.

## 2. NPCs — standing, at fixed spots
Pixel characters who hold their post (beside a building, at a crossroads, by a
gate). Walk up, press **E**, a dialogue panel opens. They give quests, take
deliveries, and can teach things (e.g. unlock a refining recipe).
No wandering, no routes. Give them enough presence to be worth walking to:
a name, a role, an idle animation, and dialogue with real voice.

## 3. Quest content — authored, hand-written
A fixed catalogue of real quests with characters and small stories. Not
procedural templates.

**Because the map is going to grow, quests must be authored per-area from the
start.** Bruno's words: the map expands "like a zelda pixelated 2d map: more
squared areas like the current map but with other biomes and roads."
So: quest definitions carry an `area` id, live in data (not code), and the
loader must handle areas that do not exist yet. The Home Block is area one.
Roads should read as continuing off-map toward neighbours, not dead-ending.

## 4. Documentation — Codex + first-run tutorial
**Codex**: a journal that fills in as you discover things — materials,
buildings, gadgets, NPCs, regions. Entries unlock on first encounter and show
`23/48 known`. Unfound entries appear as `??????`. It is a reward for
exploring, not a manual dump.
**First-run tutorial**: a short guided opening through the first craft, first
chop and first study session. Skippable, and it must never re-run on an existing
save.

## 5. Items and resources — depth AND variety
Both, together:
- **Tiers and refining**: raw -> processed -> finished (ironwood -> planks ->
  furniture). Multi-step chains give the buildings real jobs: the Forge, the
  Workshop and the Lab should each own a step rather than all being "craft".
- **More variety**: widen the catalogue — materials, tools, gadgets,
  decorations. New biomes (future areas) are where new raw materials come from.
Keep the v3 rule: studying stays the best route to reach. Refining must not
become a way to out-earn study.

## 6. Player movement — fix the stutter
Reported: "feels laggy... it looks like it is stopping and starting constantly
but at high speeds." That is **not** a speed problem — do not just raise the
speed. It reads as a frame-pacing fault. Investigate in this order:
1. Fixed-timestep updates with **no interpolation** between them at render time
   — the most likely cause of exactly this symptom.
2. Position rounded/floored to whole pixels each frame, so at speed the sprite
   lands on the same pixel twice then jumps two.
3. Camera lerp fighting the integer scale factor.
4. `dt` spikes from the render loop's work not being smoothed.
Fix the cause, then confirm by eye at high speed — a metric is not proof here.

## 7. GUI and design
Three things, in Bruno's priority:
1. **The start menu is wrong.** It leaves empty space. It should show a
   **semi-transparent pixelated view of the map** behind, the **game title in
   bold, large letters**, and a **PLAY button** — and the saves screen appears
   only *after* clicking Play. (Note: `menubg.js` already paints a scene that is
   invisible behind the launch panel's opaque gradient — see REVIEW-CLIENT.md.)
2. **Panels are inconsistent.** Inventory and Tasks have the parchment/gold
   pass; Shops and others still wear the old flat dark look. Finish the pass.
3. **The top banner is too dense** — currencies, stamina, XP and tool durability
   all compete. Give it hierarchy.

---

## Sequencing note for whoever picks this up
Several v5 goals sit on v3 code that exists but is wired to nothing (gates,
lighting, plantings, placed blocks, `art.js`). Billboards, NPCs and new biomes
all live in the world renderer. **Wire the dead v3 code first** — otherwise v5
adds a second layer of authored-but-invisible features on top of the first.

---

## 8. QUEUED NEXT (Bruno, in order)

### 8a. Split the Archive and the Market — they currently show the same thing
Both open the same shop panel showing ALL vendors. That is wrong on both sides.
- **The Archive** shows **blueprints only** — those for sale, plus those already
  owned/discovered. Nothing else. No goods, no boxes, no currency exchange.
- **The Market / Trading Post** shows **goods only** — items for sale and the
  sell side. No blueprints.
Root cause is known: `ROLE_PANEL` in `web/main.js` maps both `shop` and
`blueprints` to the `shops` panel, and the panel opens on the Merchant tab
regardless. REVIEW-CLIENT.md also found `Game > Shops ⌘3` in the native menu
opens it from anywhere, bypassing the location gate entirely — fix that too.
The saplings live in the Merchant's permanent nursery stock; confirm they are
reachable once the split lands, since planting depends on it.

### 8b. ONE currency, not four
Collapse `focus / insight / grind / spark` into a single coin.
Touches: `shared/constants.js` (CURRENCIES, WORK_TYPES weights, SUBJECT_BIAS),
`shared/economy.js` (splitPool, coinMult, payouts), `shared/recipes.js` (every
recipe cost), `server/shops.js` (prices, buyback, the Exchange vendor),
`web/ui/hud.js` (the four-chip row), and every panel that prices anything.

**Consequences to decide when we do it — do not silently drop them:**
1. **The Exchange vendor loses its reason to exist.** It converts between
   currencies at a 15% haircut. With one coin it is dead — remove it, or
   repurpose it.
2. **Subject and work-type identity was carried by currency.** Reading paid
   Insight, problem sets paid Grind. With one coin that expression disappears.
   Options: move it into XP/skill per subject, or into a payout multiplier, or
   accept losing it. Ask Bruno rather than deciding silently.
3. Rarity-based material pricing keyed off currency type (`common -> grind`,
   `legendary -> spark`) needs a new basis.

### 8c. Dark Boxes pay SHARDS, not materials
Bruno's direction: boxes are **earned by submitting tasks** (real work), and
opening one yields a **random amount of Shards**. Shards are spent on:
- **enchanting tools and weapons** (weapons do not exist yet — new)
- **purchasing characters and companions** (future)

This is a cleaner split than today and should be treated as the intended shape:
- **World -> materials.** Chopping, mining, dredging, sifting feed crafting.
- **Study -> boxes -> shards.** Real work feeds progression and power.

**Consequences to handle when implementing:**
1. Today boxes drop MATERIALS, and that is currently a real source of them —
   the starting save leans on it. If boxes stop giving materials, verify the
   early game still works: the axe recipe needs 2 ironwood + 3 chalkstone, and
   before you own an axe the only wood comes from the seed crate. Do not create
   a soft-lock.
2. Shards are a third resource type alongside coins and materials. Decide where
   they live in state and in the HUD/inventory before writing code.
3. `rollDarkBox`, the pity timer and rarity weights currently resolve to a
   material. Rarity should map to shard QUANTITY instead (a legendary roll pays
   a large shard sum), so the pity timer keeps meaning something.
4. Enchanting is a new system: what can be enchanted, what an enchant does, and
   whether it is permanent. Not yet specified.

### 8b-REVISED. TWO currencies, not four, not one
Bruno's decision supersedes the "one coin" note above:

- **Florins** — gold coins, the **main** currency. Everything is priced in them.
  Earned from studying and from selling goods.
- **Shards** — obtained through **tasks** (via Dark Boxes, which now pay shards
  ONLY — see 8c; no materials). Spent on enchanting tools and weapons, and later
  on characters and companions.

`focus / insight / grind / spark` all collapse into **Florins**.

**The Exchange vendor becomes an NPC with a roulette table in front of him.**
- He converts **Shards -> Florins**, and the rate is **deliberately expensive**:
  florins must stay costly to buy this way, so shards are not a shortcut past
  studying or selling.
- Direction is shards -> florins. Whether florins -> shards is allowed at all is
  NOT specified — default to NO, so the only route to shards stays real work.

**The Marketplace / Trading Post is for BUYING goods only.**
(Open question flagged below: where selling now happens.)

**Still open, do not guess:**
1. **Selling.** The Market is "only for buying". The sell side currently lives
   there and the tree economy depends on it — a felled tree pays ~19 coins at
   buyback, which is how you afford saplings. If selling leaves the Market it
   needs a home, or the sapling loop breaks.
2. **The roulette table.** What it wagers (shards? florins?), what it pays, and
   whether it is pure gamble or has a floor. Unspecified.
3. **Subject identity.** With Florins uniform, reading/practice/projects all pay
   the same coin. Whether subject difference moves to per-subject XP, a payout
   multiplier, signature materials, or is dropped, is still undecided.
