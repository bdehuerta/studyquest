# THE SNOWFALL REACHES — design

The Reaches shipped as a *place*: a region, a road, a peak and a Wise Man at the
end of it. You walked east and you were there. This is the plan to make it a
*game* — a mountain you climb, in the Zelda sense: locked by what you can do
rather than by where you have walked, and shaped so that the way up is found
rather than followed.

Home is not touched by any of it.

---

## 1. THE MOUNTAIN HAS HEIGHT

The one change everything else rests on. Every Reaches tile carries a LAYER,
0–3. You move within your layer; a cliff edge is a wall no matter what is
painted on the other side of it; you change layer only on a LADDER or a STAIR.

Drawn the way a 2D game fakes a third dimension: a tile on layer *n* is lifted
`n * 6px` up the screen, and every tile whose southern neighbour is lower gets a
CLIFF FACE drawn below it, as tall as the drop. The scholar is lifted by her own
layer, so climbing a ladder visibly takes her up the rock face. Nothing about
this is 3D maths — it is one offset and one extra strip of pixels, which is
exactly how Link's Awakening does it, and it is why the mountain will read as a
mountain rather than as a differently-coloured field.

## 2. FOUR TERRACES, WEST TO EAST

| Layer | Name                | What is there                                    |
|-------|---------------------|--------------------------------------------------|
| 0     | The Wind Gate       | Arrival, the pine labyrinth, the Climbing Hooks   |
| 1     | The Rime Terrace    | The frozen tarn, the sliding puzzle, the Crampons |
| 2     | The Shattered Steps | Cracked crag, the boulder locks, the Stone Hammer |
| 3     | The Summit          | The Rime Warden, and the cave                     |

## 3. THREE THINGS YOU FIND, AND WHAT EACH ONE OPENS

Reaches gear is PASSIVE and always on once found — it is not equipped and does
not compete for the two hand slots, because a puzzle you can fail by having the
wrong thing in your hands is not a puzzle, it is an errand.

- **Climbing Hooks** — ladders. Without them a ladder is scenery.
- **Crampons** — ice holds your feet. Without them you slide until you hit
  something, which is the ice puzzle, and with them the ice is a floor.
- **Stone Hammer** — cracked crag breaks. It is a gather node with a `gear`
  requirement rather than a `tool` one, so it inherits swings, particles,
  stamina and prompts from machinery that already works.

## 4. THE PUZZLES

- **Sliding ice.** Step on, keep going until something stops you. The tarn is a
  board: crag pillars are the walls, and the route to the Crampons is a
  sequence of slides you have to read before you commit to the first one.
- **Boulders and plates.** Walk into a snow boulder and it moves one tile if the
  tile beyond is clear and on the same layer. A plate under a boulder is held
  down; a plate with nothing on it is not. Ice gates open while every plate of
  their colour is held — so a boulder is a way to *keep* one held while you
  stand somewhere else.
- **Cracked crag.** Walls that are only walls until you have the hammer.
- **The pine labyrinth.** No mechanic at all — hedges and one route. The first
  thing the region asks of you should be attention, not equipment.

## 5. THE RIME WARDEN

A boss, in a game with no combat and no business growing one. So it is a boss
the way a Zelda dungeon boss is: a room, a rule, and three phases.

It paces the summit shelf in front of the cave mouth. It has a sight-line — the
tiles directly ahead of it. Caught in it, you are thrown back to the room's
entrance and every boulder resets. Three plates must be held to break it. You
move boulders while it is looking the other way; the last plate shatters it.

Nothing takes damage, nothing has hit points, and losing costs you the room
rather than the save.

## 6. THE OLD MAN IN THE CAVE

The summit cave is dark. At the back of it is the Wise Man, and he tells you
what the Herald could not: what happened to the kingdom, what Ranon did, and
where the army is to be raised. It ends on the objective the next region will be
built around. 400 xp, which has been reserved for him since the Herald first
mentioned him.

---

## BUILT — 2026-09-03

All six, in this order:

1. **Layers, cliffs, ladders, stairs.** `layers` is a parallel array beside
   `tiles`; `stepBlocked()` is the whole rule and is a pure function of two
   tiles, which is what lets a test flood-fill the climb through the exact
   function the game's collision calls. Terrace edges are also literal cliff
   TILES on the low side — the drop is a wall you can see, and the layer rule
   becomes the second guarantee rather than the only one.
2. **The authored map** — `web/world/reaches.js`. Terraces painted as
   rectangles, the labyrinth drawn as text and verified connected on every test
   run, every ladder and plate on a named tile the shared constants agree about.
3. **Ice, boulders, plates, gates, cracked crag.** Sliding is a synthetic input
   fed to the ordinary movement code, so a slide collides, wall-slides and
   animates exactly like a walked step.
4. **The three pieces of gear**, each behind its own puzzle, each opening the
   next lock. Passive: never equipped, never worn out.
5. **The Rime Warden.** Patrol, sight-line, three plates. No damage, no hit
   points; being caught costs you the room.
6. **The cave and the old man**, with the story and the objective the next
   region will be built on: Elderwatch, and the Ashen Standard.

### The route, and what each lock costs

| Lock | Opened by | Where |
|---|---|---|
| The pine labyrinth | attention | Wind Gate, layer 0 |
| Every ladder | Climbing Hooks | heart of the labyrinth |
| The frozen tarn | Crampons | a ledge inside the slide |
| The ice gate | two boulders on two plates | Rime Terrace |
| Cracked crag ×5 | Stone Hammer | west alcove of the Steps |
| The cave | the Rime Warden | the Summit |

### What is NOT built

- The Warden passes through boulders rather than being blocked by them. Being
  blocked would let a boulder park in its path and turn the encounter into a
  wall. If it ever should push them, that is a design decision, not an
  oversight.
- Nothing in the Reaches respawns. The pines do (they are ordinary timber), but
  the puzzles are one-way: solved is solved.
- The road tiles up here are the Home Block's brown dirt. A packed-snow variant
  of the path tile is still owed.

---

# REMAKE — 2026-09-03 (v2)

Three real defects and one design failure, plus what a Nintendo 2D map actually
does that this one does not.

## THE DEFECTS

1. **THE LABYRINTH CAN BE CHOPPED THROUGH.** Its walls are snowpines, and
   snowpines are a gather node — so the axe you arrive with makes the maze
   optional. A puzzle you can delete with a tool you already own is not a lock,
   it is a suggestion. Its walls become RIMEWALL: piled, ice-bound stone that no
   tool in the game touches.
2. **THE STONE MAZE MAKES NO SENSE.** The Shattered Steps were built by
   painting a slab of crag and cutting one-tile corridors out of it with a line
   tool. That produces worms, not architecture: corridors that meet at nothing,
   walls one tile thick with no thickness behind them, and no way to tell a
   room from a passage. It is rebuilt as a DUNGEON — rectangular chambers, walls
   two tiles thick, doorways you can see from across the room, and the cracked
   crag turned into bricked-up doorways that plainly used to be doors.
3. **ONE STAIR, AND IT LOOKS WRONG.** A single flight, drawn as flat stripes on
   the ground rather than as steps cut into a cliff. The mountain gets several
   ways up and down, the flight is drawn INTO the rock face it climbs, and the
   region gains the thing that actually makes a Zelda map flow — **ledges you
   can drop off but not climb**.

## WHAT NINTENDO 2D MAPS DO

Read off Link's Awakening and A Link to the Past, and what each one means here:

1. **One idea per screen.** A screen is a room even outdoors: an arrival, a
   labyrinth, a frozen lake, a dungeon, a summit. Each reads at a glance and
   asks one thing.
2. **Cliffs are the map's skeleton.** They are thick, dark, and drawn with a lit
   top lip and a shadowed base, and they cast onto what is below. Height is the
   main compositional device, not decoration on top of one.
3. **Ledges drop one way.** You hop DOWN a south-facing edge freely and climb up
   only where there is a ladder or a stair. This is what makes a Zelda map feel
   like a loop instead of a corridor: shortcuts open behind you.
4. **Interactables are louder than terrain.** Ground is low-contrast and quiet;
   ladders, plates, cracked walls, gear and the boss are saturated and outlined.
   You should be able to point at what matters in a screenshot.
5. **Detail clusters, it does not sprinkle.** Uniform per-tile noise reads as
   static. Trees come in copses with clear ground between them.
6. **One light direction, and everything standing casts a shadow** — boulders,
   gear, the Warden, the old man.
7. **Signpost the lock before the key.** You see the ladder before the Hooks and
   the bricked door before the Hammer, so finding the tool is a memory of a
   place rather than a surprise.
8. **Landmarks for orientation.** Each terrace has a silhouette you can navigate
   by: the maze wall, the tarn, the dungeon mouth, the summit shelf.

## THE PLAN

- **Tiles:** add `rimewall` (unbreakable). Thicken the terrace step from 6px to
  10px so a drop reads as a drop.
- **Art:** rimewall; a stair drawn as a flight cut into rock; a cliff with a lit
  cap and a cast shadow; drop shadows under everything that stands up.
- **Map:** rebuild `reaches.js` around ROOMS. The labyrinth keeps its verified
  layout and changes material. The Steps become five chambers joined by
  doorways, two of them bricked. Scatter becomes copses.
- **Movement:** hop-down ledges — moving south off a terrace edge is free, and
  every other direction still needs the ladder or the stair.
- **Tests:** the maze walls must be ungatherable; the hop must be one-way; and
  23-mountain's flood fill must still find every lock in order.

## BUILT — the remake

**The three defects.**

- The labyrinth's walls are RIMEWALL: piled stone bound in ice, and the only
  wall in the game no tool touches. It is not a gather node, so the client never
  offers a swing at it — and even a forged "there is a snowpine here" sent
  straight to the server cannot open it, because a felled record only makes a
  tile passable when that tile's TYPE is a node. Both are asserted.
- The Shattered Steps are a DUNGEON: solid rock with five chambers carved out
  of it, joined by doorways, walls two tiles thick. Floor and wall are now far
  apart in value — masonry walls over a dark slate floor — because the first cut
  had them within a shade of each other and the whole level read as one lump of
  stone. Two doorways are bricked up with cracked crag, and the first of them is
  visible from the moment you arrive: you meet the lock before you find the key.
- The stair is drawn as a flight CUT INTO ROCK, with dark cheeks either side and
  treads that catch the light — it was flat stripes on open ground, which read
  as a zebra crossing. The ladder onto the terrace is pinned INTO the cliff
  face rather than standing on the terrace beside it.

**And the thing that was actually missing: LEDGES.** Stepping south off a
terrace is free; every other way between terraces still needs a ladder or a
stair. Shortcuts open behind you as you climb, which is what makes a Zelda map a
loop instead of a corridor — and it costs nothing in gating, because down is
always the way you came from. The terrace-wall pass leaves south-facing edges
open for exactly this reason.

**The rest of the Nintendo list, applied:** cliffs have a lit cap, a black base
and a cast shadow onto the ground below, and the step is 10px rather than 6;
everything that stands up has a contact shadow; pines come in copses instead of
per-tile sprinkle; the tarn lost its right angles; interactables stayed loud
while the ground got quieter.

---

# REMADE AGAIN — 2026-09-03 (v3), the stacked mountain

Bruno got stuck at a ladder. The reason was structural, not cosmetic: v2 climbed
WEST TO EAST, and the cliff faces that tell you which way is up hang off the
SOUTH edge of a terrace. A mountain that climbs sideways has no face pointing at
the player, so two fields of snow at different heights look identical and a
ladder in a wall looks like scenery.

**The mountain is stacked now.** Five terraces, bottom of the map to the top, and
you arrive on the lowest one. North is up, always.

| Layer | Terrace | Its puzzle | The way out of it |
|---|---|---|---|
| 0 | The Foot | the labyrinth (28 tiles door to door; the Hooks down a 56-tile detour) | a stair |
| 1 | The Frozen Tarn | the slide — every slide line overshoots the ladder, so you need the Crampons on the island to stand still beside it | a ladder |
| 2 | The Boulder Terrace | two boulders onto two plates, opening the ice gate in the wall | a stair |
| 3 | The Shattered Steps | the dungeon: find the Hammer up one doorway, break the two that are bricked | a ladder |
| 4 | The Summit | the Rime Warden | the cave |

**Home was not touched.** Its road east stays at the top of the map past the
storage hut; the Reaches simply receive you at the bottom. Travelling is a
teleport, so the two sides never had to line up — `CROSSING.peaksEntryY` is all
it took.

**Making the height read.** The step is 12px of a 16px tile. A terrace edge is
drawn with the cliff TILE clipped to the height of the drop, so it has real
grain rather than being a grey bar, with a lit lip on top, a black base, and a
shadow cast onto the ground below. And a ladder or a stair carries its OWN art
down the face — the flight is drawn continuously from the ground to the terrace
above, which is precisely what was missing when a rung floated at the top of a
cliff with no visible way to it.
