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

**Inside the Keep**, four floors, climbed one at a time. Stepping onto a stair
takes you up; there is no key to press, because a staircase you have to ask
permission to use is a staircase you walk past.

| Floor | | Its lock |
|---|---|---|
| 1 | **The Guardroom** | two watchmen on a ring corridor — time them |
| 2 | **The Cistern** | two barrels onto two plates opens the gate to the stair |
| 3 | **The Armoury** | a bricked arch — the Stone Hammer — and the **Brass Key** behind it |
| 4 | **The Hall of Keeping** | a locked door — the Brass Key — and the **Ashen Standard** |

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

## WHAT IS NOT HERE

No boss. The garrison *is* the encounter, and a third patrol with more hit
points than the other two would be a boss in the way a wall is a puzzle. If
Elderwatch grows one it should be the Castellan, and it should want something
other than timing.

Nothing happens when you leave with the Standard except the objective changing.
The next region — carrying it back to the farlands — is the next region.
