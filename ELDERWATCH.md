# ELDERWATCH — the third map

The Wise Man's errand, in one line: *the Ashen Standard hangs in the Hall of
Keeping, behind a garrison that has forgotten what it is guarding.*

## THE OPPOSITE OF A MOUNTAIN

The Reaches climb. Elderwatch does not. It is flat — one layer everywhere, so
there is no lift, no cliff face and no ledge — walled, and made of ROOMS. The
whole vocabulary of the mountain is deliberately absent, because a fort that
reads like a mountain is just more mountain. What stops you here is **people**.

## THE ROUTE, AND WHAT EACH LOCK COSTS

**Outside**, the bailey: cobbles, a well, sheds against the wall, stacked stone,
and the round Keep in the middle of it.

| Lock | Opened by |
|---|---|
| The outer wall | the front gate is barred for the whole visit; the **culvert** under the west wall is cracked — and the **Stone Hammer** is already in your pack, off the mountain |
| The guardroom | two barrels shoved the length of the south yard onto two plates — under the eye of `watch_south`, who paces that exact row. Behind the door: the **Codex** |

The bailey is a RING, and the garrison walks one: four watchmen, one to a side.
Two of those sides are columns, which is why a beat may now name a `colX`
instead of a `rowY`.

**Inside the Keep**, four floors, climbed one at a time. Stepping onto a stair
takes you up; there is no key to press, because a staircase you have to ask
permission to use is a staircase you walk past.

| Floor | | Its lock |
|---|---|---|
| 1 | **The Guardroom** | two watchmen on a ring corridor — time them |
| 2 | **The Cistern** | two barrels onto two plates opens the gate to the stair |
| 3 | **The Armoury** | a bricked arch — the Stone Hammer — and the **Brass Key** behind it |
| 4 | **The Hall of Keeping** | a locked door in a WALL — the Brass Key — the **Ashen Standard**, and the chest beside its stand |

## WHAT THE TOWER BROKE ON ITS WAY UP

The keep was built in the middle of a bailey that already had a puzzle in it,
and it landed on top of it. A barrel, a plate and two thirds of the barred gate
ended up inside solid stone; so did the old flat keep's locked door; and both
watchmen were left pacing beats that ran eight of their thirteen tiles through
the tower. The yard's entire encounter had stopped happening.

**All 25 smoke suites passed the whole time**, because a buried barrel throws no
error. The answer is `tools/lib/geometry.mjs`, now stage 4 of `check.sh`: it
generates the real map and asserts that every declared coordinate — boulder,
plate, gate, patrol lane, quest item, stair, lock — stands on a tile a scholar
could be on. It found eight the first time it ran, five of which had shipped
with the tower: three of the Keep's own patrols walk through their own braziers
and crates.

The yard puzzle is re-sited to the south row, outboard of the tower's footing.
Its plates FLANK the guardroom door rather than sitting under it — under it, the
two barrels sealed the one tile you could step through the door from, and the
lock opened onto ground you could no longer reach.

## THE TOWER GREYS THE WORLD OUT

A floor is a full-size map with one round room cut into it, so nothing
downstream — collision, the camera, the tile loop — needs to know the tower
exists. The bailey is still DRAWN around the room, and greyed: you are on one
floor of one tower and the rest of Elderwatch is somewhere below you.

Four rooms at the same coordinates is a thing a flat fort could not do, and it
is the reason the keep became a tower.

Old gear opening a new door is the cheapest way to make a journey feel like one:
the first thing Elderwatch asks of you is the last thing the mountain gave you.

## WHAT IT ADDED TO THE ENGINE

- **A crossings table.** Two maps could be a pair of constants. Three cannot,
  and the Reaches have a door at each end — so "am I on a way out, and where
  does it go" is now asked of `CROSSINGS` by both the world and the server.
- **Per-area puzzle furniture.** `AREA_PUZZLES` keys boulders, plates, gates and
  the door a patrol throws you back to. Elderwatch inherits the whole apparatus
  without a second copy of the rules that move it.
- **Patrols as a table.** The Rime Warden's beat became `pace(beat)` — a pure
  function of the clock — and the watch are two more of them.
- **Keys and locked doors.** The first gate in this game that a KEY opens rather
  than a level, a plate or a tool.
- **Vertical patrol lanes.** A beat is a lane now, not a row: `colX`/`fromY`/
  `toY` alongside `rowY`/`fromX`/`toX`, and `patrolSees` reads down whichever
  axis the watchman walks.
- **The Codex**, behind the guardroom door — see `shared/codex.js`. Discovery is
  DERIVED: every entry owns a predicate over the save and one sweep, wired into
  the single `persist` wrapper every route already goes through, unions in
  whatever is true. There is no `codex.record(...)` to forget at the seventh of
  seven material-granting sites.
- **A reset that is not a punishment.** Arriving in Elderwatch puts the yard's
  barrels back. A barrel shoved against a wall on a one-row yard can never be
  shoved back — there is nowhere to stand behind it — and being caught is not a
  reliable undo for a player who is never caught.

## THE TOP FLOOR, AND WHAT IT IS FOR

Two things were wrong with it, and they were the same thing twice.

**The Brass Key gated nothing.** The Hall's locked door was a single tile
standing in an open round room, so you walked around it and the entire Armoury
detour that earns the Key was optional. `probeStep` across that one tile
answered "solid" exactly as the suite expected, the whole time — the question it
asked was *is this tile solid* and the question that mattered was *is there
another way round*. A door is only a door if it is in a wall; there is a wall
now (`shrineWallY`), and `geometry.mjs` floods the floor from the arrival stair
and requires that what a lock guards is unreachable while it is shut.

**And the floor unlocked nothing.** Taking the Standard paid xp, played a scene
and set an objective pointing at a region that does not exist. So the chest
beside the stand holds **Ranon's Ring** — and the Ring is what opens the Codex.

That is the shape of it: the ledger comes off a table on the GROUND floor and
does not open. It stays shut for the whole climb. The thing that opens it is
four floors up, behind the Key, in a chest that has been opened often in a room
where nothing else has. What you read first, when it finally opens, is why it
was shut.

The reveal is Ranon's — the false heir the Herald named on the road, who killed
his father for the throne. He did not lose the Standard and he did not burn it,
because a burnt banner is a story people tell. He filed it, and then spent forty
years posting to this fort only men who would not ask what they were guarding.
The Wise Man had it the wrong way round: they did not stop asking. They were
chosen for not asking.

**You have to KEEP the ring to keep reading.** That this costs anything is not
something the game says yet.

## WHAT IS NOT HERE

No boss. The garrison *is* the encounter, and a third patrol with more hit
points than the other two would be a boss in the way a wall is a puzzle. If
Elderwatch grows one it should be the Castellan, and it should want something
other than timing.

Carrying the Standard west is still the next region, and the farlands still do
not exist. What has changed is that leaving is no longer the only thing the top
floor gives you.
