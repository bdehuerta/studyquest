# StudyQuest Prototype — SHARED CONTRACT (read fully before writing code)

Zero-dependency prototype. **No npm install. No downloaded assets. No external URLs.**
Node stdlib only on the server; plain ES modules in the browser; all art drawn
procedurally to a canvas. Runs with `node server.js` on http://localhost:7777.

## Golden rules
1. **Only touch files you own** (see OWNERSHIP). Never edit another agent's file.
2. Browser code is ES modules: `import { x } from '../shared/economy.js'`. No bundler.
   Every import path must be a real relative path with a `.js` extension.
3. Server code is CommonJS-free ESM too — the package uses `.mjs`-style ESM via
   `import`. Files under `server/` and `server.js` use `import`/`export` syntax.
   (A `package.json` with `{"type":"module"}` is provided by the integrator.)
4. No `alert()`, `confirm()`, `prompt()` anywhere.
5. Pixel art only: integer scaling, `ctx.imageSmoothingEnabled = false`.
6. Keep it readable. This is a prototype meant to be extended, not shipped.

## Repo layout
```
proto/
  server.js              [INTEGRATOR]  http server, static files, routes API
  package.json           [INTEGRATOR]
  index.html             [INTEGRATOR]
  web/main.js            [INTEGRATOR]  boot + wiring between world and ui
  web/style.css          [INTEGRATOR]
  server/store.js        [AGENT-A]     JSON persistence + state defaults
  server/api.js          [AGENT-A]     all API request handlers
  shared/constants.js    [INTEGRATOR]  frozen enums — provided, do not edit
  shared/economy.js      [AGENT-C]     payouts, coin types, dark box rolls
  shared/recipes.js      [AGENT-C]     materials, tools, buildings, crafting
  web/world/sprites.js   [AGENT-B]     sprite definitions + draw helpers
  web/world/world.js     [AGENT-B]     tile map, camera, render loop
  web/world/player.js    [AGENT-B]     character movement + animation
  web/world/build.js     [AGENT-B]     building placement mode
  web/ui/hud.js          [AGENT-D]     top bar: coins, xp, level, boxes
  web/ui/tasks.js        [AGENT-D]     task list + session timer + grading modal
  web/ui/craft.js        [AGENT-D]     inventory + crafting bench + build menu
  web/ui/gacha.js        [AGENT-D]     dark box opening animation
  data/state.json        (generated at runtime)
```

## GAME STATE (single source of truth, persisted as data/state.json)
```js
{
  player: {
    name: "Scholar", level: 1, xp: 0, xpToNext: 100,
    x: 24, y: 18,                     // tile coords in the world
    coins: { focus: 0, insight: 0, grind: 0, spark: 0 },
    darkBoxes: 0,
    streak: 0, lastActiveDate: null
  },
  materials: { "ironwood": 0, ... },   // materialId -> qty
  tools:     [ { uid, itemId, equipped:false } ],
  buildings: [ { uid, buildingId, x, y } ],
  tasks:     [ { id, title, subject, workType, difficulty, estMinutes,
                 status: "todo"|"done", minutesLogged: 0,
                 rank: null, dueInDays: null, completedAt: null } ],
  sessions:  [ { id, taskId|null, subject, workType, minutes, startedAt, endedAt } ],
  log:       [ { ts, text, kind } ]    // newest last, cap 200
}
```

## API (all JSON; server owns state, client never mutates directly)
```
GET  /api/state                  -> { ok:true, state }
POST /api/task/create            { title, subject, workType, difficulty, estMinutes, dueInDays }
                                 -> { ok, state, task }
POST /api/task/complete          { taskId, quality:1..5, onTime:bool }
                                 -> { ok, state, reward }   // reward = PayoutResult
POST /api/session/log            { taskId|null, subject, workType, minutes, focusScore:0.5|1|1.5 }
                                 -> { ok, state, reward }
POST /api/player/move            { x, y }                      -> { ok }
POST /api/box/open               { count:1 }                   -> { ok, state, drops:[MaterialDrop] }
POST /api/craft                  { recipeId }                  -> { ok, state, made }
POST /api/build                  { buildingId, x, y }          -> { ok, state, building }
POST /api/tool/equip             { uid, equipped }             -> { ok, state }
POST /api/dev/reset                                            -> { ok, state }
```
Errors: `{ ok:false, error:"human readable reason" }` with HTTP 200. Never throw to
the client. Every mutating route returns the FULL new state so the client just replaces it.

## SHARED VALUE OBJECTS (exact shapes — agents A, C, D all depend on these)
```js
// PayoutResult, returned by economy.computeTaskPayout / computeSessionPayout
{ coins: { focus:0, insight:0, grind:0, spark:0 },
  xp: 0, darkBoxes: 0, rank: "C", breakdown: ["difficulty x3", "on time x1.2"] }

// MaterialDrop, returned by economy.rollDarkBox
{ materialId: "ironwood", name: "Ironwood", qty: 2, rarity: "common", color: "#8a6" }
```

## CURRENCIES (frozen — in shared/constants.js)
| id | name | symbol | color | earned from |
|---|---|---|---|---|
| focus | Focus | ◉ | #4aa3ff | timed deep-work sessions |
| insight | Insight | ◆ | #a86cff | reading, theory, research |
| grind | Grind | ■ | #ff9a3c | problem sets, labs, drills |
| spark | Spark | ★ | #ffd93d | essays, projects, creative work |

**Dark Boxes** are not a currency — they are rolled as a rare drop and opened for materials.

## WORK TYPES -> currency weights (frozen, in constants.js)
```
reading  -> insight .7, focus .3
practice -> grind .7, focus .3
project  -> spark .6, grind .2, insight .2
writing  -> spark .6, insight .4
revision -> focus .5, grind .5
lab      -> grind .5, insight .3, spark .2
```
Subject supplies a small bias multiplier (constants.SUBJECT_BIAS), default 1.0.

## SPRITE FORMAT (agent B defines, agent D may reuse)
A sprite is `{ w, h, palette: {char: "#rrggbb"}, rows: ["..aa..", ...] }`.
`'.'` = transparent. Draw with `drawSprite(ctx, sprite, px, py, scale)`.
Everything is drawn from these — **no image files, no base64, no fetch**.

## WORLD
64 x 48 tile grid, TILE = 16px, rendered at scale 2 or 3. Camera follows player,
clamped to world bounds. Terrain generated deterministically from a fixed seed
(simple value noise, written by hand — no libraries). Tile types: grass, dirt path,
water, stone, tree. Buildings occupy their footprint and block movement.

## HOW AGENTS COORDINATE
- `shared/constants.js` is written by the integrator BEFORE you start. Import from it,
  never redefine its values.
- If you need something from another agent's module, import it by the exact path and
  function name listed in your task brief. Assume it will exist. Do not stub it.
- Write your files, then verify with `node --check <file>` on every file you create.

---

# INTERFACE ADDENDUM (exact export signatures — do not deviate)

## shared/economy.js  [AGENT-C]
```js
export function emptyCoins()                          // -> {focus:0,insight:0,grind:0,spark:0}
export function addCoins(a, b)                        // -> new coin object
export function subtractCoins(a, b)                   // -> new coin object (may go negative)
export function canAfford(wallet, cost)               // -> boolean
export function totalCoins(coins)                     // -> number (sum, for display)
export function rankFromScore(score01)                // 0..1 -> 'F'|'D'|'C'|'B'|'A'|'S'
export function xpToNext(level)                       // -> number
export function computeBonuses(state)                 // -> { coinMult:{focus:1,...}, xpMult:1, boxChanceBonus:0 }
export function computeTaskPayout(state, opts)        // opts:{subject,workType,difficulty,estMinutes,minutesLogged,quality,onTime}
export function computeSessionPayout(state, opts)     // opts:{subject,workType,minutes,focusScore}
export function rollDarkBox(state, count)             // -> { drops:[MaterialDrop], pity:number, best:'rare' }
export function applyLevelUps(player)                 // mutates player, -> { levelsGained:number }
export function sessionCoinsToday(state)              // -> number, for the daily cap
```
`computeTaskPayout` / `computeSessionPayout` return a **PayoutResult** (shape in the
main contract) and must NOT mutate state.

## shared/recipes.js  [AGENT-C]
```js
export const MATERIALS   // { [id]: { id, name, rarity, color, symbol } }  keys === MATERIAL_IDS
export const TOOLS       // { [id]: { id, name, desc, bonus } }            keys === TOOL_IDS
export const BUILDINGS   // { [id]: { id, name, desc, w, h, passive } }    keys === BUILDING_IDS
export const RECIPES     // [ { id, kind:'tool'|'building', outputId, materials:{}, coins:{} } ]
export function getRecipe(id)
export function checkCraft(state, recipeId)   // -> { ok:boolean, missing:[{label, have, need}] }
```
`bonus` / `passive` shape: `{ coinMult:{focus:1.1}, xpMult:1.0, boxChanceBonus:0.02 }`
(any subset). Footprints must equal `BUILDING_FOOTPRINT` in constants.js.

## web/world/world.js  [AGENT-B]  — single entry point for the whole canvas game
```js
export function createGame(canvas)
// returns:
// {
//   start(), stop(),
//   setState(state),                  // called on every state change
//   enterBuildMode(buildingId),       // shows a ghost that follows the cursor/player
//   exitBuildMode(), isBuildMode(),
//   onBuildPlace: null,               // assign a fn(buildingId, x, y); called on confirm
//   onMoveCommit: null,               // assign a fn(x, y); called at most every 400ms
//   onInteract: null,                 // assign a fn(buildingId|null); called on E / click
//   toast(text, color)                // floating pixel text over the world
// }
```
Also exports `createWorld(seed)` and `isSolid(world, x, y)` from the same file.
`web/world/sprites.js` exports `makeSprite(rows, palette)`, `drawSprite(ctx, sprite, px, py, scale)`
and `SPRITES` with keys: `tiles.{grass,path,water,stone,tree,sand}`,
`player.{down,up,left,right}` (each an array of 2 frames), `buildings.<BUILDING_IDS>`,
`box.dark`. `web/world/player.js` and `web/world/build.js` are internal to agent B.

## web/ui/*.js  [AGENT-D]
Each factory takes `(root, api)` where `root` is a DOM element and `api` is:
```js
{ createTask(o), completeTask(o), logSession(o), openBoxes(n),
  craft(recipeId), build(buildingId,x,y), equip(uid,equipped), reset(),
  requestBuildMode(buildingId),      // hands off to the world for placement
  getState() }
```
Every api call resolves to `{ ok, state?, error?, reward?, drops?, made? }`.
Factories return:
```js
createHud(root, api)    -> { setState(state), flashReward(payout) }
createTasks(root, api)  -> { setState(state), toggle(), open(), close(), isOpen() }
createCraft(root, api)  -> { setState(state), toggle(), open(), close(), isOpen() }
createGacha(root, api)  -> { setState(state), toggle(), open(), close(), isOpen(),
                             playOpening(drops) }   // returns a Promise resolving after the animation
```
**Styling rule for agent D:** each module injects exactly ONE `<style>` tag on first
construction, and every selector is namespaced `.sq-hud-*`, `.sq-tasks-*`,
`.sq-craft-*`, `.sq-gacha-*`. Never style bare tags. Use `PALETTE` from constants.js.

## server/store.js + server/api.js  [AGENT-A]
```js
// store.js
export function loadState()            // reads data/state.json, or seeds a new game
export function saveState(state)       // atomic-ish write
export function defaultState()         // the seed game (see contract state shape)
export function pushLog(state, text, kind)
// api.js
export async function handleApi(pathname, body, state, save)
// -> { status:200, json:{ ok, ... } }   never throws
```
