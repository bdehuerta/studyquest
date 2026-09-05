# StudyQuest v2 — native app, gathering, shops, save slots, real syllabus import

Read CONTRACT.md first — v1 rules still hold (zero dependencies, no downloaded
assets, own only your files, ESM everywhere, no alert/confirm/prompt).

---

## THE CENTRAL DESIGN IDEA: ENERGY

v1 had one loop: do work → get paid. v2 adds a world you can act on, and the
thing that stops that world from becoming a substitute for studying is **Energy**.

- Energy is earned **only** from real study: `1 per 3 tracked minutes`, plus
  `8 × difficulty` on completing a task.
- Energy is the **only** way to swing a tool. Chopping a tree costs 4, mining
  stone costs 6.
- So gathering is a way to *spend* study, never to replace it. An idle player
  with a full inventory of axes can do nothing at all.

`player.energy` / `player.maxEnergy` (base 100, raised by buildings). Energy does
not regenerate with time. This is deliberate and must not be "fixed".

---

## NEW STATE KEYS (added to the v1 shape)

```js
player.energy, player.maxEnergy,
player.gatherTools: [ { uid, toolId, durability, maxDurability } ],
state.harvested:   { "x,y": { nodeType, hitsLeft, respawnAt } },   // depleted nodes
state.blueprints:  [ recipeId ],           // unlocked recipes; seeded from STARTER_BLUEPRINTS
state.shops:       { refreshedOn: "YYYY-MM-DD", stock: { merchant:[], broker:[], archivist:[] },
                     brokerBoxesSoldToday: 0 },
state.relics:      [ { id, name, desc, passive } ],
state.meta:        { slot: 1, name: "Save 1", createdAt, lastPlayedAt, playtimeMs }
```

## NEW API ROUTES

```
POST /api/gather        { x, y }            -> { ok, state, result:{ nodeType, materialId, qty,
                                                  destroyed:bool, energySpent, toolBroke:bool } }
POST /api/tool/repair   { uid }             -> { ok, state }
GET  /api/shops                             -> { ok, shops }        (refreshes stock if stale)
POST /api/shop/buy      { shopId, offerId } -> { ok, state, bought }
POST /api/shop/sell     { materialId, qty } -> { ok, state, earned }
POST /api/exchange      { from, to, amount }-> { ok, state, received }
POST /api/tasks/import  { text, format? }   -> { ok, state, imported:N, skipped:[...] }
GET  /api/slots                             -> { ok, slots:[{slot,name,level,playtimeMs,lastPlayedAt,exists}] }
POST /api/slots/switch  { slot }            -> { ok, state }
POST /api/slots/create  { slot, name }      -> { ok, state }
POST /api/slots/delete  { slot }            -> { ok, slots }
POST /api/slots/rename  { slot, name }      -> { ok, slots }
```

---

## SHOPS (4 vendors, deliberately different)

**merchant** — The Wandering Merchant. Stock of 5 material offers, rerolled once per
local day from a seeded RNG. Also buys your materials at 40% of sale price (a sink
that makes surplus commons useful).

**archivist** — sells **blueprints**. Recipes are LOCKED until their blueprint is
bought. This is the main progression gate and the main coin sink. Blueprint price
scales with the power of what it unlocks. Stock is the full un-owned blueprint list,
not rerolled.

**broker** — sells Dark Boxes for coins. Price **escalates within the same day**
(1st box 300, then ×1.6 each: 300 / 480 / 768 / 1229 …), resetting daily. This
deliberately caps how much you can buy your way out of actually studying.

**exchange** — converts between the four currencies at a **15% haircut**, so
converting is always a real loss. Lets a player who over-earned Grind buy something
priced in Spark, at a cost.

---

## GATHERING

Tiles of type tree / stone / water / sand are harvestable nodes (see `GATHER_NODES`).
Each node takes several hits (`hits`) before it is destroyed and drops its material.
A destroyed node writes `state.harvested["x,y"] = { respawnAt }` and respawns after
`respawnHours` of real time — until then it renders as a stump / rubble / dry patch.

Each swing costs energy AND 1 durability from the equipped gathering tool. At 0
durability the tool breaks and is removed. Repair at a **forge** you have built
(`/api/tool/repair`) for materials + coins.

Gathering the right node needs the right tool: axe→tree, pickaxe→stone,
dredge→water reeds, sifter→sand. Wrong or missing tool = a clear refusal.

---

## TASK IMPORT — the user supplies their real syllabus

`POST /api/tasks/import` accepts a blob of text and auto-detects the format:

1. **JSON** — an array of objects, or `{tasks:[...]}`. Accepts loose field names:
   `title|name|assignment`, `subject|course|class`, `workType|type`,
   `difficulty|diff`, `estMinutes|minutes|est|hours`, `dueInDays|due|dueDate`.
2. **CSV / TSV** — header row, same loose column names, delimiter auto-detected.
3. **Markdown checklist** — `- [ ] Essay on Rome (History, writing, d3, 120m, due 5d)`
   and also bare `- [ ] Essay on Rome` lines.
4. **Plain lines** — one task per line, best-effort.

Unknown subjects map to `other`; unknown work types are **inferred from keywords**
in the title (essay/report→writing, problem set/exercises→practice, read/chapter→
reading, lab/experiment→lab, revise/review→revision, else project). Absolute dates
(`2026-09-14`, `14/09`, `Sept 14`) convert to `dueInDays` relative to today.
Anything unparseable goes into `skipped` with a reason — never silently dropped.

---

## SAVE SLOTS

`MAX_SAVE_SLOTS = 5`. Files: `data/slot-1.json` … `data/slot-5.json`, plus
`data/active.json` holding `{ slot }`. The legacy `data/state.json`, if present,
is migrated into slot 1 on first boot and then left alone.

---

## OWNERSHIP FOR THIS ROUND — do not touch another agent's files

```
AGENT-E (native shell)  app/            everything under it — Swift sources,
                        build-app.sh    Info.plist, icon generation, bundle script
AGENT-F (server)        server/store.js server/api.js server/shops.js
                        server/import.js server/slots.js
AGENT-G (world)         web/world/*.js  (gathering interaction, node damage, stumps,
                                         swing animation, particles, energy gate)
AGENT-H (ui)            web/ui/*.js     (shops, blueprints, import panel, energy bar,
                                         gather HUD, + fix the 2 quest-log bugs)
INTEGRATOR              server.js index.html web/main.js web/style.css
                        shared/constants.js shared/economy.js shared/recipes.js
```
