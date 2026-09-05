# StudyQuest — prototype

A pixel study-RPG. Log real study work; earn four kinds of coin, dark boxes, materials;
craft tools; build a world.

## Run it

```
cd ~/studyquest/proto
node server.js
```

Open http://localhost:7777

No `npm install`. No dependencies. No downloaded assets — every sprite is drawn in code.
Requires Node 18+ (uses ESM + `node:` builtins only).

## Controls

| key | |
|---|---|
| WASD / arrows | move |
| E | interact with the building you're standing next to |
| Q | quest log — tasks, grading, session timer |
| C | craft — materials, recipes, gear, placing buildings |
| B | dark boxes |
| Esc | close panel / cancel build placement |

## The loop

1. Add a quest (a real assignment) or start a session timer against a subject.
2. Work. Stop the timer, or complete the quest and grade yourself.
3. Get paid in the currencies that match the **subject** and the **work type** —
   reading pays Insight, problem sets pay Grind, projects pay Spark, deep focus pays Focus.
4. Rarely, a **dark box** drops. Open it for crafting materials.
5. Craft tools (worn, up to 2, small multipliers) and buildings (placed in the world,
   bigger passive multipliers).
6. Buildings make the next cycle pay more.

Sessions are deliberately worth less per hour than finishing work, and are capped daily —
otherwise sitting at a timer would out-earn actually shipping an assignment.

## Where things live

```
server.js           http server + static files
server/store.js     JSON persistence, seed state, migration
server/api.js       all game routes
shared/constants.js frozen vocabulary — currencies, work types, ids, palette
shared/economy.js   payouts, rank, dark box rolls, pity timer
shared/recipes.js   materials, tools, buildings, crafting recipes
web/world/          canvas: worldgen, sprites, movement, build placement
web/ui/             DOM panels: hud, tasks, craft, gacha
web/main.js         wiring
data/state.json     your save (delete it to start over)
```

`CONTRACT.md` is the interface spec the modules were built against — read it before
changing anything that crosses a module boundary.

## Reset

Delete `data/state.json`, or POST `/api/dev/reset`.
