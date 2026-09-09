# StudyQuest — HANDOFF

**Read this first, then `BACKLOG.md` (newest entry at the top).** Per-map notes
live in `REACHES.md` and `ELDERWATCH.md`.

---

## The one command

```sh
./tools/ship.sh              # contracts → smoke → build → verify the bundle
./tools/ship.sh --fast       # contracts + build, no browser suites
./tools/ship.sh --only 23-mountain 25-elderwatch
```

It exists because doing this by hand went wrong twice, both expensively:

- **Committing is not shipping.** A whole session's fixes were committed and
  never built. Bruno came back reporting every one as still broken, and three
  rounds of diagnosis went into a map that was already correct in the repo.
- **Rebuilding is not relaunching.** `build-app.sh` does not restart a window he
  already has open. Finish by telling him **⌘Q and reopen** — the script says so
  when it sees the app running.

`node --check` passing means a file parses. It does not mean the change reached
the app. Step 4 greps the bundle for exactly that reason.

## Running it

```sh
node server.js                       # dev, :7777
open dist/StudyQuest.app             # what Bruno actually plays
```

Saves: `~/Library/Application Support/StudyQuest/Slot N/state.json`.
**Never point tests at that directory** — they seed and wipe what they are
given. `ship.sh` uses a scratch `SQ_DATA_DIR`; do the same by hand.

---

## Where the game is

Four regions, and **Quest One runs end to end**:

```
Home Block --(Herald, level 20)--> Snowfall Reaches --(Wise Man)--> Elderwatch
     ^                                    |                             |
     |                          (Codex + Ring back to him)      Standard, Codex, Ring
     |                                    v
     +--------------------------- the Farlands  →  Ilsa → the recall → the muster
```

Three quests, in the Bag's first tab: **Raise the Levy** (8 steps, completable),
**The Blue Bloom**, **A Man About a Cheesecake**.

**Keys:** WASD move · E interact · 1/2 select a slot · P boat · L saves ·
**T** tasks (real coursework) · **Tab** the Bag · **J** the Codex · Esc unwinds.

### The story, in one paragraph
A false heir holds Gotham. You go to borrow an army and find that the man you
are fighting spent forty years making sure it can never be gathered — not with
soldiers, with paperwork. The Ashen Standard was never stolen; it was **lodged
as surety** against a debt with a date on it. The twelve families were scattered
nine miles apart by written order. You undo it with one page in his own hand,
because the Codex is not a confession but a **formulary**. The cost is stated
and not resolved: you moved several hundred people with a signature, which is
the instrument the whole story condemns. That is Chapter Two's problem.

---

## The guard rail

`tools/lib/geometry.mjs`, stage 4 of `check.sh`. It generates the real maps and
asserts what the smoke suites structurally cannot:

- every declared coordinate stands on ground that exists
- every patrol lane is walkable end to end
- a lock, gate or arch makes its prize **unreachable while shut**
- no piece of Reaches gear is behind itself
- the way out of a map is not a detour, and is reachable from where you land
- a Codex page never fills its own gap
- with a watchman in the Elderwatch breach, the winch and front gate still reach

It has found **a dozen real bugs that all 25 smoke suites passed straight
through** — buried barrels, buried watchmen, three barriers you could walk
around, and a Brass Key that gated nothing. **Run it after any map change**, and
when you add a check, *prove it fails* by breaking the thing on purpose. Two of
mine passed while the bug was still live because they tested around it.

---

## Hard-won rules (do not quietly revert)

**Design**
- Only the SELECTED equip slot acts. `1`/`2` only select; `E` is the only use key.
- Reach is the COUNTER, not the footprint (`BUILDING_COUNTER`).
- Studying pays Dark Boxes, never Florins.
- A barrel is SOLID, so on a one-tile corridor every barrel is a wall. A lock
  that opens onto ground you can no longer reach is worse than one that never
  opens.
- **A door is only a door if it is in a wall.** Three barriers in the Keep were
  loose tiles you walked around.
- Beating a guardian is permanent; the door it stood in front of stays open.
  (Plates are how you beat the Warden, not a switch to keep held.)

**Architecture**
- **Prefer a chokepoint over call sites.** The Codex sweep, the quest stages and
  the page gaps are all *predicates over the save*, evaluated at the one place
  every route persists through. A predicate has no call site to forget.
- **One implementation of a decision, shared.** The client and server each kept
  their own list of valid area ids; only one learned about the Farlands, and the
  mismatch froze the player's position and made travel impossible from anywhere.
  `areaOfSave()` is now the single copy.
- Derived state the *renderer* needs must be **materialised** into the save on
  every request, not just when a route happens to touch it.

**Editing and testing**
- **A scripted find-and-replace on a string that occurs twice is a coin flip.**
  It bit twice in one session; once it spliced prompt-drawing code into the
  keyboard handler, which parsed fine and broke an NPC entirely. Anchor on
  unique context.
- **When a CDP test flakes on a held key, remove the input — do not lengthen the
  walk.** Under load the harness drops most of a hold's frames, so distance and
  duration are both the wrong knob (900ms, 1600ms and a shorter walk all failed).
- Run **one** smoke suite at a time. Two at once put the machine at load 18 and
  produced eight failures that were all about the laptop.
- Suites assert what the player is SHOWN — measured geometry, never `el.hidden`.

---

## Next, in rough order

1. **Chapter Two.** The hook is written: *The Hand That Signs*, in the Codex's
   Rules of the World. You now know the easy way to govern and it worked.
2. **Fill out the Farlands.** One camp, one cave, a road. The other eleven
   families are places waiting to exist; `shared/pages.js` is where their side
   of the paperwork goes.
3. **The muster's four-minute wait** is one constant in `server/api.js`
   (`MUSTER_WAIT_MS`) if it reads as dead time rather than distance.
4. **Backlog leftovers:** block placement (`inventory.js` posts to `/api/build`
   while `/api/block/place` is the real route), and the Shops panel still wears
   the old flat look.

## Repo

`github.com/bdehuerta/studyquest`, branch `main`, ordinary fast-forward pushes.
`dist/`, `data/`, `tools/shots/` and `.DS_Store` are gitignored on purpose — the
repo holds the game, not the build output or anybody's playthrough.
