# StudyQuest v3 — Home Block

Read CONTRACT.md and CONTRACT-V2.md first. v1/v2 rules still hold: zero
dependencies, no downloaded assets, all art procedural, own only your files.

---

## THE CENTRAL SHIFT: PLACES, NOT BUTTONS

v2 let you open Craft and Shops from a dock button anywhere in the world. v3
removes that. **Every economic action now has a physical location.**

- **Crafting happens at a house.** Stand next to a craft-capable building, press
  E, craft. The spawn Study Hut qualifies, as do Workshop and Forge.
- **Buying and selling happens at the Shop building only.** The Trading Post.
  There is no shop button.
- The dock keeps only what is not world-located: **Quests (Q)** and
  **Inventory (Tab)**. Saves move to the launch menu (below). Craft, Shops,
  Dark Boxes and Import lose their dock buttons.
- Every removed button needs a discoverable replacement: walking near a building
  must show a clear prompt, and the Quest log should tell you where to go.

`BUILDING_ROLES` in constants.js is the authority on what each building offers.

---

## THE MAP IS NOW "THE HOME BLOCK"

The existing 64x48 map is renamed and reframed as the Home Block — the first of
many areas. **All four edges must be prepared for future expansion.**

- Each side (north / south / east / west) gets a **gate**: a visible, thematic
  edge structure with a signpost naming the area beyond, currently locked.
- Locked gates show what they are waiting on, sourced from `REGIONS` in
  constants.js. Walking into one gives a readable refusal, never silence.
- The world must be authored so a second block can be dropped in later without
  reworking this one: keep worldgen parameterised by an area id and an origin,
  and do not hardcode 64x48 anywhere outside constants.
- Nothing beyond the gates is built in v3. The requirement is that the seams
  exist and are honest.

---

## TREES ARE FINITE

**Trees no longer regrow.** Chopping one destroys it permanently. This is the
economic spine of v3.

- A felled tree leaves a permanent stump and drops wood.
- Wood and other tree drops are **sellable at the Shop**.
- **Saplings are bought at the Shop** and planted on grass. A planted sapling
  grows through visible stages over real time into a full tree, which can then
  be chopped.
- So the forest is a renewable resource only through deliberate reinvestment.
  A player who clear-cuts and does not replant runs out.
- Growth stages must be visible in the world (sprout → sapling → young → mature)
  and the player must be able to see time remaining.
- Stone/sand/water nodes keep their v2 respawn behaviour. Only trees are finite.

---

## CRAFTABLE ITEMS, GADGETS, AND BLOCKS

Three new categories, all crafted at houses:

**Gadgets** — usable items with an effect and a cooldown. They are used from the
Inventory, not passively equipped. Design at least six, each genuinely different.
Examples to build on, not copy: a lantern that reveals resource nodes across the
screen for a time; a compass that marks the nearest un-chopped tree; a watering
can that advances a sapling's growth; a portable bench allowing one craft away
from a house per day; a bell that boosts the next study session's payout; a
surveyor's glass that previews what a gate needs.

**Blocks** — placeable, purely constructive pieces the player positions freely:
paths, fences, walls, lamp posts, planters, signs. Cheap, stackable, no bonuses.
They exist so the Home Block can be personalised. Placement reuses the existing
build-mode ghost. Blocks must be removable and refundable at a partial rate.

**Items** — expand the craftable set generally. Tree drops should feed real
recipes so chopping has a purpose beyond selling.

---

## VISUAL DIRECTION: PIXEL, BUT GENSHIN-LIKE

The current look is competent but drab and flat. Target: **still pixel art, but
with the richness and warmth of Genshin Impact's UI.** Concretely:

- **Palette**: raise saturation and contrast. Warm sunlit greens, real colour
  temperature separation between shade and light, skies and water that read as
  luminous rather than muddy. Keep a limited palette per material, but a wider
  and more vivid one overall.
- **Light**: everything should feel lit from somewhere. Grass with sun dapple,
  buildings with a warm lit side and a cool shadowed side, water with a moving
  specular, soft ambient occlusion where objects meet the ground.
- **UI framing**: Genshin's interface is ornate but legible — panels with
  decorative corner pieces, thin gold rules, a cream/parchment content ground
  against deep slate, elemental accent colours per category, generous spacing.
  Replace the current flat dark boxes with this. Keep it crisp and pixel-aligned;
  ornate must not mean blurry.
- **Motion**: panels ease in, hovers respond, rewards flourish. Nothing static.
- This is a real design pass, not a palette swap. It should be obviously,
  visibly a different game to look at.

---

## CARRIED OVER FROM RESUME.md (still in scope)

1. **Launch menu** — appears on start, before the world. The only place saves are
   managed. Delete the in-game saves panel and its `[L]` binding.
2. **Inventory** — its own screen and keybind (`Tab`). Materials, tree drops,
   gadgets, blocks, tools with durability, gear, relics, Dark Boxes. Gadgets are
   *used* from here.
3. **Top banner redesign** — as part of the visual pass.

---

## DESIGN RULES THAT MUST NOT BE REVERSED

- Stamina regenerates on its own. It is pacing, not a gate on studying.
- What studying buys is **reach**: coins, rare drops at rank A+, region access.
- Sessions pay less per hour than finishing tasks, and are capped daily.
- Blueprints gate crafting; the Archivist is the main coin sink.
- Zero dependencies; all art drawn in code.

---

## TEAM AND OWNERSHIP (v3)

```
MANAGEMENT (main session)  contracts, constants, integration, final call
  owns: CONTRACT-V3.md, shared/constants.js, server.js, index.html,
        web/main.js, web/style.css

ENG-SYSTEMS   server/*.js, shared/economy.js, shared/recipes.js
              trees finite, saplings, shop economy, gadgets/blocks data,
              building-role gating, region/gate scaffolding

ENG-WORLD     web/world/*.js
              home block reframing, four edge gates, sapling growth stages,
              permanent stumps, block placement, gadget effects in world,
              the lighting/palette half of the visual pass

ENG-UI        web/ui/*.js
              launch menu, inventory, banner, the Genshin-style UI pass,
              location-gated craft/shop panels

QA            owns no source. Writes and runs test plans, files defects with
              repro steps, verifies fixes. Has authority to block.

DEVOPS        build-app.sh, app/, and a new tools/ directory
              build pipeline, smoke-test harness, save-migration safety,
              release verification
```
