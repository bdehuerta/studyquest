// Integration layer: owns the api client, holds the authoritative client copy of state,
// and wires the canvas game (agent B) to the DOM panels (agent D).

import { createGame } from './world/world.js';
import { createHud } from './ui/hud.js';
import { createTasks } from './ui/tasks.js';
import { createCraft } from './ui/craft.js';
import { createDialogue } from './ui/dialogue.js';
import { createMusic } from './ui/music.js';
import { createGacha } from './ui/gacha.js';
import { BUILDING_ROLES, STAMINA_PER_LEVEL, VENDOR_LOCKS } from '../shared/constants.js';
import { createLaunch, hydrateSettings } from './ui/launch.js';
import { createMenuBackground } from './menubg.js';
import { createPause } from './pause.js';

const boot = document.getElementById('boot');
const bootFail = (msg, err) => {
  boot.className = 'error';
  boot.textContent = `${msg}\n\n${err && (err.stack || err.message || err)}`;
  console.error(msg, err);
};
window.addEventListener('error', (e) => bootFail('Uncaught error', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => bootFail('Unhandled rejection', e.reason));

let state = null;

// When the server last wrote. Read by the pause menu's save notice.
let lastSavedAt = 0;

// The server marks the equipped gathering tool as `player.activeGatherTool`
// (a uid); the UI panels look for a per-tool `equipped` flag or one of several
// alias keys. Rather than force either side to change, normalise here — this is
// exactly the seam the integration layer exists for.
function normaliseState(s) {
  if (!s || !s.player) return s;
  const active = s.player.activeGatherTool || null;
  s.player.equippedGatherUid = active;
  s.player.equippedGather = active;

  // EQUIPMENT. The server owns `player.equipped` (two entries, each null or
  // { kind, itemId, uid? }) and `player.activeSlot` (0-based). Defend against a
  // response written by an older server: the panels below index [0] and [1]
  // unconditionally, and a missing array would take the whole HUD down.
  if (!Array.isArray(s.player.equipped)) s.player.equipped = [null, null];
  s.player.equipped.length = 2;
  for (let i = 0; i < 2; i += 1) if (!s.player.equipped[i]) s.player.equipped[i] = null;
  s.player.activeSlot = Number(s.player.activeSlot) === 1 ? 1 : 0;

  // A tool is "equipped" if it is in EITHER slot — not just the active one.
  // The old flag meant "in the one hidden slot"; panels still read it, so it
  // has to keep meaning something true.
  const heldUids = new Set(
    s.player.equipped.filter((r) => r && r.uid).map((r) => r.uid)
  );
  if (Array.isArray(s.player.gatherTools)) {
    for (const t of s.player.gatherTools) {
      t.equipped = !!t && heldUids.has(t.uid);
      t.slot = s.player.equipped.findIndex((r) => r && r.uid === t.uid) + 1 || 0;
    }
  }
  return s;
}

/**
 * THE LEVEL-UP MOMENT.
 *
 * Hung off the state broadcast rather than off each route's reply, because XP
 * now arrives from four places — submitting work, logging a session, opening a
 * dark box, and selling — and a celebration wired at each of them is a
 * celebration that will be missed at the fifth. Watching the number is the one
 * hook that cannot be forgotten.
 *
 * `null` until the first state lands, so LOADING a save at level 9 is not
 * mistaken for having just reached it.
 */
let lastLevel = null;
function watchLevel(next) {
  const lv = Math.max(1, Math.floor((next && next.player && Number(next.player.level)) || 1));
  if (lastLevel === null) { lastLevel = lv; return; }
  if (lv <= lastLevel) { lastLevel = lv; return; }
  const gained = lv - lastLevel;
  lastLevel = lv;
  if (!game || typeof game.toast !== 'function') return;
  game.toast(`LEVEL ${lv}`, '#ffd93d');
  const stamina = STAMINA_PER_LEVEL * gained;
  game.toast(`+${stamina} max stamina`, '#5ad18a');
  // The one level that opens a door says so, because nothing else will tell you
  // and the Stonemason is a long walk to discover it by hand.
  const lock = VENDOR_LOCKS.stonemason;
  if (lock && lock.kind === 'level' && lv >= lock.level && lv - gained < lock.level) {
    game.toast('the Stonemason will trade with you now', '#5fc9e8');
  }
}

const listeners = [];
const broadcast = () => {
  for (const fn of listeners) {
    // One panel throwing must not stop the others from updating.
    try { fn(state); } catch (err) { console.error('setState failed', err); }
  }
};

async function post(route, body) {
  try {
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json();
    if (json && json.state) {
      state = normaliseState(json.state);
      // Every route that answers with state has already written to disk, so
      // this IS the moment the game last saved. The pause menu shows it back
      // and warns when it goes stale.
      lastSavedAt = Date.now();
      broadcast();
    }
    return json;
  } catch (err) {
    return { ok: false, error: `network: ${err.message}` };
  }
}

// --- api surface handed to every UI panel (see CONTRACT interface addendum)
const api = {
  getState: () => state,
  createTask: (o) => post('/api/task/create', o),
  completeTask: async (o) => {
    const r = await post('/api/task/complete', o);
    if (r.ok && r.reward) await showReward(r.reward);
    return r;
  },
  logSession: async (o) => {
    const r = await post('/api/session/log', o);
    if (r.ok && r.reward) await showReward(r.reward);
    return r;
  },
  openBoxes: async (n) => {
    const r = await post('/api/box/open', { count: n });
    if (r.ok && r.drops) await gacha.playOpening(r.drops);
    // SAY THE XP OUT LOUD. The server has paid 10-30 xp per box since the
    // levelling pass, but the opening reel only ever showed the DROPS — so from
    // the player's side the experience simply did not exist. Bruno asked for it
    // twice, which is the tell that a thing is happening and not being shown.
    // Toasted after the animation so it does not compete with the reveal; the
    // level-up banner (watchLevel) fires on its own if one lands.
    if (r.ok && r.xp > 0) game.toast(`+${r.xp} xp`, '#5ad18a');
    return r;
  },
  craft: (id) => post('/api/craft', { recipeId: id }),
  build: (buildingId, x, y) => post('/api/build', { buildingId, x, y }),
  equip: (uid, equipped) => post('/api/tool/equip', { uid, equipped }),

  // --- EQUIPMENT: two visible slots. `slot` is 1-based here and everywhere the
  // player can see it; only the server's internal array is 0-based.
  equipSlot: (slot, ref) => post('/api/equip/slot', { slot, ref }),
  clearSlot: (slot) => post('/api/equip/slot', { slot, clear: true }),
  setActiveSlot: (slot) => post('/api/equip/active', { slot }),
  reset: () => post('/api/dev/reset'),

  /** An explicit save the player asked for. Resolves false if it did not land. */
  save: async () => {
    const r = await post('/api/save');
    return !!(r && r.ok);
  },

  // --- v3: planting and blocks. These routes have existed and worked since v3
  // but nothing on the client ever called them, so saplings could be bought and
  // never planted and blocks crafted and never placed.
  plant: (x, y, opts) => post('/api/plant', { x, y, ...(opts || {}) }),
  placeBlock: (blockId, x, y, opts) => post('/api/block/place', { blockId, x, y, ...(opts || {}) }),
  removeBlock: (x, y) => post('/api/block/remove', { x, y }),
  interactAt: (px, py) => post('/api/interact', { px, py }),

  // --- v2: world gathering
  gather: (x, y, nodeType) => post('/api/gather', { x, y, nodeType }),
  equipGather: (uid) => post('/api/tool/equipGather', { uid }),
  repairTool: (uid) => post('/api/tool/repair', { uid }),

  // --- v2: shops
  shops: async () => {
    try {
      const r = await fetch('/api/shops').then((res) => res.json());
      return r;
    } catch (err) { return { ok: false, error: `network: ${err.message}` }; }
  },
  buy: (shopId, offerId) => post('/api/shop/buy', { shopId, offerId }),
  sell: (materialId, qty, vendor) => post('/api/shop/sell', { materialId, qty, vendor }),
  exchange: (from, to, amount) => post('/api/exchange', { from, to, amount }),
  // v5: speaking to an outlander. This is also the ONLY thing that opens his
  // door — the key is spent here, not on the first sale, so a player who never
  // talks to him cannot lose it to a transaction they were not told about.
  talk: (vendor) => post('/api/npc/talk', { vendor }),
  // v5 lake: unlocking the hut and casting a line.
  openHut: () => post('/api/hut/open'),
  fish: () => post('/api/fish'),
  // v6: the boat, and the road east.
  board: (shore) => post('/api/boat/board', shore ? { x: shore.x, y: shore.y } : {}),
  // v7: the mountain.
  takeGear: (gear) => post('/api/reaches/gear', { gear }),
  takeQuestItem: (item) => post('/api/quest/take', { item }),
  climbTower: (dir) => post('/api/tower/climb', { dir }),
  pushBoulder: (x, y, dx, dy) => post('/api/reaches/push', { x, y, dx, dy }),
  wardenReset: () => post('/api/reaches/reset', {}),
  wardenBeaten: () => post('/api/reaches/warden', {}),
  travel: () => post('/api/travel'),
  // v5 charms: worn, not held. slot is 1-based as the player sees it.
  wearCharm: (slot, charmId) => post('/api/charm', { slot, charmId }),
  removeCharm: (slot) => post('/api/charm', { slot, clear: true }),

  // --- v2: import the user's real syllabus
  importTasks: (text) => post('/api/tasks/import', { text }),

  // --- v2: save slots
  slots: async () => {
    try { return await fetch('/api/slots').then((res) => res.json()); }
    catch (err) { return { ok: false, error: `network: ${err.message}` }; }
  },
  // A slot switch swaps the player, the buildings and the harvested map all at
  // once. The renderer only adopts the server's player position on its first
  // setState (so it never fights local movement), so patching state in place
  // would leave the character standing in the old save's spot. A reload is the
  // honest way to rebuild everything from the new slot.
  switchSlot: async (slot) => {
    const r = await post('/api/slots/switch', { slot });
    if (r.ok) location.reload();
    return r;
  },
  requestBuildMode: (buildingId) => {
    closeAll();
    game.enterBuildMode(buildingId);
    game.toast(`Placing ${buildingId.replace(/_/g, ' ')} — click to confirm, Esc to cancel`, '#ffd93d');
  },
};

async function showReward(payout) {
  hud.flashReward(payout);
  const bits = [];
  for (const [id, n] of Object.entries(payout.coins || {})) if (n > 0) bits.push(`+${n} ${id}`);
  if (payout.xp) bits.push(`+${payout.xp} xp`);
  if (bits.length) game.toast(bits.join('  '), '#5ad18a');
  if (payout.darkBoxes > 0) game.toast(`DARK BOX ×${payout.darkBoxes}`, '#a86cff');
}

// --- construct
const canvas = document.getElementById('stage');
const overlay = document.getElementById('overlay');

let game, hud, gacha, pause, dialogue;
// Constructed eagerly and outside the try below: a missing audio file must not
// take the game down, and the module itself never throws — it just stays quiet.
const music = createMusic();
const panels = {};

try {
  game = createGame(canvas);
  hud = createHud(overlay, api);
  panels.tasks = createTasks(overlay, api);
  panels.craft = createCraft(overlay, api);
  panels.gacha = gacha = createGacha(overlay, api);
  // NOT in `panels`: it is not a panel. It never appears in the dock, Esc does
  // not close it the way Esc closes a panel, and `closeAll()` must not wipe a
  // conversation the player is halfway through reading.
  dialogue = createDialogue(overlay);
} catch (err) {
  bootFail('Failed to construct the game modules.', err);
  throw err;
}

listeners.push((s) => game.setState(s), (s) => hud.setState(s), watchLevel);
for (const p of Object.values(panels)) listeners.push((s) => p.setState(s));

game.onBuildPlace = async (buildingId, x, y) => {
  const r = await api.build(buildingId, x, y);
  game.exitBuildMode();
  game.toast(r.ok ? 'Built!' : r.error, r.ok ? '#5ad18a' : '#ff6b6b');
};
game.onMoveCommit = (x, y) => {
  // Fire-and-forget: position is cosmetic, a dropped update is harmless.
  fetch('/api/player/move', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  }).catch(() => {});
};
/**
 * L on the boat. The server owns the interval and the odds; this only says what
 * happened, because a client that decided either would be deciding the loot.
 */
/**
 * P beside or aboard the boat. The shore tile comes from the world, which knows
 * the terrain; the server checks it again before moving anybody, because "the
 * client said it was fine" has never been a check.
 */
game.onBoard = async (shore) => {
  const wasRiding = !!(state && state.boat && state.boat.riding);
  if (wasRiding && !shore) {
    game.toast('bring her alongside open ground first', '#a494c4');
    // Returned rather than dropped: a caller awaiting this — the world, or a
    // test — should get a refusal, not a promise that never settles.
    return { ok: false, error: 'no open ground beside the boat' };
  }
  const r = await api.board(shore);
  if (!r || !r.ok) { game.toast((r && r.error) || 'she will not have you', '#a494c4'); return r; }
  game.toast(r.riding ? 'aboard — WASD to row, L to fish' : 'ashore', '#8fd7f0');
  return r;
};

/* ---- the mountain -------------------------------------------------- */
game.onTakeGear = async (gear) => {
  // The server checks you are standing over it, and the position it checks is
  // the one it last heard about — which is throttled. Commit first, exactly as
  // talking to a vendor does, or picking something up off the floor fails once
  // and works on the second press.
  await commitPosition();
  const r = await api.takeGear(gear);
  if (!r || !r.ok) { game.toast((r && r.error) || 'it will not come loose', '#a494c4'); return r; }
  game.toast(r.name.toUpperCase(), '#5fc9e8');
  game.toast(r.blurb, '#9aa0aa');
  if (r.xp > 0) game.toast(`+${r.xp} xp`, '#5ad18a');
  return r;
};

// Stepping onto a stair in the Keep. Awaited position first: the server checks
// which floor you are on, and it only knows where you are if you have told it.
let climbing = false;
game.onClimbTower = async (dir) => {
  if (climbing) return null;
  climbing = true;
  try {
    await commitPosition();
    const r = await api.climbTower(dir);
    if (!r || !r.ok) { game.toast((r && r.error) || 'the stair will not have you', '#a494c4'); return r; }
    if (r.floor > 0) game.toast(r.name.toUpperCase(), '#e8b64c');
    else game.toast('the bailey', '#9aa0aa');
    return r;
  } finally { climbing = false; }
};

game.onTakeQuestItem = async (item) => {
  await commitPosition();
  const r = await api.takeQuestItem(item);
  if (!r || !r.ok) { game.toast((r && r.error) || 'it will not come free', '#a494c4'); return r; }
  game.toast(r.name.toUpperCase(), '#e8b64c');
  if (r.xp > 0) game.toast(`+${r.xp} xp`, '#5ad18a');
  // The Standard has a scene attached — it is the end of the Wise Man's errand,
  // and the objective it sets is the next chapter.
  if (r.dialogue) {
    dialogue.show(r.dialogue.lines, {
      name: r.dialogue.name,
      objective: r.dialogue.objective || null,
    });
  }
  return r;
};

game.onPushBoulder = async (x, y, dx, dy) => {
  await commitPosition();
  const r = await api.pushBoulder(x, y, dx, dy);
  if (!r || !r.ok) { game.toast((r && r.error) || 'it does not move', '#a494c4'); return r; }
  return r;
};

game.onWardenCaught = async () => {
  const r = await api.wardenReset();
  if (r && r.ok) game.toast('thrown back to the ladder head', '#ff6b6b');
  return r;
};

// Fired every frame the three plates are held, so it must be idempotent and
// must not spam the server: the first success latches it.
let wardenClaimed = false;
game.onWardenBeaten = async () => {
  if (wardenClaimed) return null;
  wardenClaimed = true;
  const r = await api.wardenBeaten();
  if (!r || !r.ok) { wardenClaimed = false; return r; }
  game.toast('THE RIME WARDEN BREAKS', '#5fc9e8');
  if (r.xp > 0) game.toast(`+${r.xp} xp`, '#5ad18a');
  return r;
};

game.onFish = async () => {
  const r = await api.fish();
  if (!r || !r.ok) { game.toast((r && r.error) || 'the line will not cast', '#a494c4'); return r; }
  if (r.hooked) game.toast(`+${r.caught} Wild Tuna`, '#5ad18a');
  else game.toast('nothing this time', '#a494c4');
  return r;
};

// The world raises a gather attempt; the server is the authority on whether it
// is legal. We hand the whole result back so the renderer can animate a refusal
// as readably as a success.
game.onGather = async (x, y, nodeType) => {
  const r = await api.gather(x, y, nodeType);
  // The world module toasts the refusal itself, anchored over the node it was
  // aimed at. Toasting it here too printed the same sentence twice, in two
  // places, and the two overlapped into unreadable text.
  if (!r.ok) return r;
  const res = r.result || {};
  // A quest node pays no material, so the ordinary "+2 ironwood" toast would
  // read "+1 null". It gets its own, louder, and a second line saying who wants
  // the thing — the whole point of the item is a place to take it.
  if (res.questItemId) {
    game.toast('BLUE KEY', '#5fc9e8');
    game.toast('the Woodsman has been asking for one', '#9aa0aa');
    if (res.questXp > 0) game.toast(`+${res.questXp} xp`, '#5ad18a');
  } else if (res.destroyed && res.qty > 0) {
    game.toast(`+${res.qty} ${res.materialId}`, '#5ad18a');
  }
  if (res.toolBroke) game.toast('your tool broke!', '#ff6b6b');
  return r;
};

// Which panel a building opens is decided by BUILDING_ROLES, not by a hardcoded
// list here — the contract makes that table the single authority so the server
// and the client cannot disagree about where you are allowed to craft.
// Every trading role opens the SAME panel — the panel then shows only the
// vendor whose building you walked into. See VENDORS_AT in ui/shops.js.
const ROLE_PANEL = {
  craft: 'craft', shop: 'shops', blueprints: 'shops',
  exchange: 'shops', woodsman: 'shops', stonemason: 'shops',
  boxes: 'gacha', study: 'tasks',
};
// The Archive carries `blueprints` only. It opens the shop panel because that is
// where the Archivist lives, but it must NOT hand you the Merchant's floor —
// buying and selling happen at the Trading Post.
const ROLE_TAB = { blueprints: 'archivist', shop: 'merchant' };

// Planting: the world raises the tile, the server decides if it is legal.
// The world knows what is underfoot; the server requires it for anything that
// is not a stump. Dropping `opts` here made planting on open grass impossible.
game.onPlant = async (x, y, opts) => {
  const r = await api.plant(x, y, opts);
  if (!r.ok) { game.toast(r.error || 'nothing takes root here', '#e2654a'); return r; }
  game.toast('planted', '#8fc85a');
  return r;
};

// Block placement, distinct from BUILDING placement — a block id posted to
// /api/build comes back as `unknown building "fence_wood"`.
game.onBlockPlace = async (blockId, x, y) => {
  const r = await api.placeBlock(blockId, x, y);
  game.toast(r.ok ? 'placed' : (r.error || 'cannot place that here'), r.ok ? '#8fc85a' : '#e2654a');
  return r;
};

// The world's 1 / 2 keys only CHOOSE the active slot; what is in the slots is
// decided in the Bag. The world has already redrawn optimistically, so a failure
// here has to be spoken aloud or the HUD and the server disagree in silence.
game.onEquipActive = async (idx) => {
  const r = await api.setActiveSlot(idx + 1);
  if (!r.ok) game.toast(r.error || 'cannot switch slots', '#e2654a');
  return r;
};

// E is a toggle, like Q and Tab. The world asks these two before it does
// anything else with the key, so a panel on screen swallows the press instead
// of it reaching the tree behind the panel.
game.isPanelOpen = () => Object.values(panels).some((p) => p.isOpen());
game.onClosePanels = () => closeAll();

// The dialogue box gets E FIRST, and E ADVANCES it rather than closing it —
// that is the whole interaction. Checked before `isPanelOpen` in world.js, so a
// conversation running over an open panel still reads line by line.
game.isDialogueOpen = () => !!(dialogue && dialogue.isOpen());
// Pause is not in `panels` either, and the world kept running under it — you
// could walk about behind the pause menu.
game.isPauseOpen = () => !!(pause && pause.isOpen());
game.onAdvanceDialogue = () => { if (dialogue) dialogue.advance(); };

/** Which buildings belong to someone you TALK to before you trade with him. */
const TALK_VENDOR_AT = { woodsman_camp: 'woodsman', stonemason_camp: 'stonemason' };

/**
 * Speaking to an outlander.
 *
 * The conversation comes FIRST and the counter opens only after it, and only if
 * he agreed — walking up to someone who has just refused you and being shown
 * his price list anyway would make the refusal meaningless. `/api/npc/talk` is
 * also what spends the Blue Key, so this is the call that opens the door.
 */
async function speakTo(vendor, buildingId) {
  let res;
  try {
    res = await api.talk(vendor);
  } catch (err) {
    game.toast(String((err && err.message) || err), '#e2654a');
    return;
  }
  if (!res || !res.ok) {
    // Usually "you are not standing at his counter", which is worth saying out
    // loud rather than silently doing nothing.
    game.toast((res && res.error) || 'he does not answer', '#e2654a');
    return;
  }
  // No need to apply `res.state` — `post()` already did, for every route that
  // answers with one. Doing it again here would be a second, older copy.

  const d = res.dialogue || {};
  const lines = Array.isArray(d.lines) ? d.lines.slice() : [];
  // The hint is part of what he tells you, so it belongs in the box rather than
  // in a panel the player may never open.
  if (d.hint) lines.push(d.hint);
  if (res.justOpened && res.xp > 0) lines.push(`(+${res.xp} experience)`);

  // A door that just opened invalidates everything the shop panel cached about
  // this vendor — including whether he trades at all. Without this his counter
  // opens on stale data and tells you he will not trade with you, seconds after
  // he said he would.
  if (res.justOpened && panels.shops && typeof panels.shops.invalidate === 'function') {
    panels.shops.invalidate();
  }

  dialogue.show(lines, {
    name: d.name || vendor,
    // The objective is its own final panel, in italics — see dialogue.js. Only
    // the Herald has one; the outlanders pass undefined and nothing changes.
    objective: d.objective || null,
    onDone: () => {
      // Open his counter only if he will actually trade. A locked vendor's
      // panel is an empty shop with his refusal repeated in it. The Herald
      // sells nothing, so `buildingId` is null for him and nothing opens.
      if (buildingId && res.unlocked) openOnly('shops', buildingId);
    },
  });
}

/**
 * Tell the server exactly where the scholar is standing, and WAIT for it.
 *
 * Position is normally committed by `onMoveCommit`, which is throttled to one
 * post per MOVE_COMMIT_MS (400ms) and only fires on a tile change. That is fine
 * for a cosmetic position and wrong for an interaction: press E the instant you
 * arrive and the request goes out while the server still has your PREVIOUS
 * tile, so every location gate refuses you. Bruno, 2026-08-31: "when I get the
 * blue bloom and talk to the woodsman, a red message pops up and if I talk again
 * then it works." The second press worked because the throttled commit had
 * landed in between.
 *
 * This does not weaken the gate. The server still decides; it is simply not
 * being asked about a stale position. `px`/`py` in the request body would have
 * been the shortcut, and that is the override REVIEW-SERVER.md flags as
 * defeating location gating altogether — not the thing to lean on here.
 */
async function commitPosition() {
  if (!game || typeof game.getPlayerTile !== 'function') return;
  if (typeof game.isRunning === 'function' && !game.isRunning()) return;
  const t = game.getPlayerTile();
  if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y)) return;
  try {
    await fetch('/api/player/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: t.x, y: t.y }),
    });
  } catch { /* the gate will refuse and say why; nothing to add here */ }
}

game.onInteract = async (buildingId) => {
  if (!buildingId) return;
  // The Herald is not a building — the world raises this sentinel when the
  // scholar is standing by him in the middle of the map.
  if (buildingId === '__herald') { await commitPosition(); speakTo('herald', null); return; }
  // The hut: unlock it if it is still shut, otherwise talk to the man who came
  // out of it. One key does both, because from the player's side it is one door.
  // The far map, and the road to it.
  if (buildingId === '__wiseman') { await commitPosition(); speakTo('wiseman', null); return; }
  if (buildingId === '__travel') {
    await commitPosition();
    const r = await api.travel();
    if (!r || !r.ok) { game.toast((r && r.error) || 'the road goes nowhere', '#e2654a'); return; }
    return;
  }
  if (buildingId === '__hut') {
    await commitPosition();
    const shut = !(state && state.hut && state.hut.opened);
    if (shut) {
      const r = await api.openHut();
      if (!r || !r.ok) { game.toast((r && r.error) || 'the door will not move', '#e2654a'); return; }
      game.toast('the Silver Key turns', '#cdd6e0');
    }
    speakTo('hutkeeper', null);
    return;
  }
  // EVERY interaction, not just the vendors: crafting and the shops are gated
  // on position too, and had the same race — it is only more visible at the
  // outlanders because their refusal is a red toast rather than a panel that
  // opens saying you are nowhere.
  await commitPosition();
  const vendor = TALK_VENDOR_AT[buildingId];
  if (vendor) { speakTo(vendor, buildingId); return; }
  const roles = BUILDING_ROLES[buildingId] || [];
  for (const role of roles) {
    const panel = ROLE_PANEL[role];
    if (panel && panels[panel]) return openOnly(panel, buildingId);
  }
  game.toast('nothing to do here', '#a494c4');
};

// The authoritative client copy of server state, for the smoke harness only.
// The world exposes its own probes on `window.__sqWorld`; this is the other
// half — anything the renderer does not mirror (harvested tiles, materials)
// has to be readable somewhere or a test can only assert what the UI claims.
if (typeof window !== 'undefined') window.__sqState = () => state;
// The same api client the panels use. The harness drives it directly for
// SETUP only — a raw fetch() would update the server and leave this module's
// copy of state stale, which is a difference no player can ever create.
if (typeof window !== 'undefined') window.__sqApi = api;
// The panels themselves, so a test can raise one exactly as walking into a
// building does and then assert what it drew. Nothing in the game reads this.
if (typeof window !== 'undefined') window.__sqPanels = panels;
// The dialogue box is not a panel, so it gets its own probe. Tests read the
// BOX ON SCREEN; this is only for driving it (advance) and for asserting the
// line currently being typed without racing the typewriter.
if (typeof window !== 'undefined') window.__sqDialogue = () => dialogue;
if (typeof window !== 'undefined') window.__sqMusic = () => music;

// --- panel management
function closeAll() {
  for (const p of Object.values(panels)) p.close();
  syncDock();
}
function openOnly(name, buildingId) {
  if (!panels[name]) return;
  for (const [k, p] of Object.entries(panels)) {
    if (k !== name) { p.close(); continue; }
    // Location-gated panels need to know which building raised them. Without
    // this the craft panel opened with location === null and told you to walk
    // to the house you were already standing at.
    if (buildingId && typeof p.openAt === 'function') p.openAt(buildingId);
    else if (buildingId && typeof p.setLocation === 'function') { p.setLocation(buildingId); p.open(); }
    else p.open();
  }
  syncDock();
}
function toggle(name) {
  if (!panels[name]) return;
  const wasOpen = panels[name].isOpen();
  closeAll();
  if (!wasOpen) panels[name].open();
  syncDock();
}
function syncDock() {
  for (const btn of document.querySelectorAll('#dock button')) {
    const p = panels[btn.dataset.panel];
    if (!p) { btn.remove(); continue; }
    // A PANEL MAY NOT EXIST YET IN THE FICTION. The Codex is an object you find
    // in Elderwatch, so advertising its button from the first minute would both
    // spoil it and offer a control that refuses. `isAvailable` is optional;
    // a panel without one is always on the dock.
    if (typeof p.isAvailable === 'function') btn.hidden = !p.isAvailable();
    btn.setAttribute('aria-pressed', String(p.isOpen()));
  }
}
for (const btn of document.querySelectorAll('#dock button')) {
  btn.addEventListener('click', () => toggle(btn.dataset.panel));
}

const typing = () => {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
};
/**
 * Is the title / save-select menu on screen?
 *
 * `game.stop()` halts the world but has never released the KEYS — so at the
 * title screen Esc opened the pause menu behind the launch panel, and Q opened
 * the task log invisibly under it (REVIEW-CLIENT.md flagged the Q half; Bruno
 * found the Esc half: "the esc key works outside of the game (in the start menu
 * and save selection menu), it should not").
 *
 * Read off the DOM rather than a flag, because the launch panel is the thing
 * that is actually covering the screen and `showMenu`/`dismissMenu` already
 * maintain it. One source of truth beats two that can disagree.
 */
function atTitleScreen() {
  if (typeof document === 'undefined') return false;
  if (document.body && document.body.classList.contains('sq-menu-open')) return true;
  const root = document.querySelector('.sq-launch-root');
  return !!(root && !root.hidden);
}

window.addEventListener('keydown', (e) => {
  if (typing()) return;
  // NOTHING IN THE WORLD RESPONDS WHILE THE MENU IS UP. Not Esc, not Q, not
  // Tab: they all act on a world the player has left, and every one of them
  // opens something the launch panel then hides.
  if (atTitleScreen()) return;
  const k = e.key === 'Tab' ? 'tab' : e.key.toLowerCase();
  if (k === 'escape') {
    // Esc unwinds: cancel placement, then close panels, and if nothing was
    // open it is the pause key. Esc never leaves the world by itself.
    if (game.isBuildMode()) { game.exitBuildMode(); return; }
    // Esc unwinds one layer at a time, and a conversation is the top layer.
    // Dismissed, not closed: Esc is "I am not reading this", which should not
    // count as having reached the end and open the shop.
    if (dialogue && dialogue.isOpen()) { dialogue.dismiss(); return; }
    const anyOpen = Object.values(panels).some((p) => p.isOpen());
    if (anyOpen) { closeAll(); return; }
    if (pause) {
      if (pause.isOpen()) pause.close();
      // Hand it the current save time on the way in, so the notice and the
      // staleness warning are right every time Esc is pressed — not only after
      // the player has used SAVE GAME once.
      else { pause.setSavedAt(lastSavedAt); pause.open(); }
    }
    return;
  }
  if (k === 'q') { e.preventDefault(); toggle('tasks'); }
  if (k === 'tab') { e.preventDefault(); toggle('inventory'); }
  // J for journal. The panel refuses to open until the Codex is in the pack,
  // and says why — see `setOnDenied` below.
  if (k === 'j') { e.preventDefault(); toggle('codex'); }
});

// v2 panels land incrementally; a missing one must not take the app down with
// it. Load them dynamically and drop the dock button if the module is absent.
async function loadOptionalPanels() {
  const optional = [
    ['shops', './ui/shops.js', 'createShops'],
    ['importer', './ui/importer.js', 'createImporter'],
    ['inventory', './ui/inventory.js', 'createInventory'],
    ['codex', './ui/codex.js', 'createCodex'],
  ];
  for (const [name, path, factory] of optional) {
    try {
      const mod = await import(path);
      panels[name] = mod[factory](overlay, api);
      listeners.push((s2) => panels[name].setState(s2));
      if (state) panels[name].setState(state);
      listeners.push(() => syncDock());
      if (name === 'codex' && typeof panels.codex.setOnDenied === 'function') {
        panels.codex.setOnDenied((why) => {
          game.toast(why === 'shut'
            ? 'the Codex will not open — something is missing from it'
            : 'you have no journal to write in', '#c8b48a');
        });
      }
    } catch (err) {
      console.warn(`optional panel "${name}" not available:`, err.message);
      const btn = document.querySelector(`#dock button[data-panel="${name}"]`);
      if (btn) btn.remove();
    }
  }
  syncDock();
}

// Position is committed at most every 400ms and only when the tile changes, so
// quitting right after a step could lose it and drop you somewhere you weren't.
// Flush on the way out. sendBeacon survives page teardown; fetch may not.
function flushPosition() {
  try {
    if (!game || typeof game.getPlayerTile !== 'function') return;
    // ONLY while the world is actually being played.
    //
    // This fires on pagehide, which includes leaving from the title screen —
    // and there the renderer still holds whatever position it was built with,
    // not where the player is. Flushing that wrote a stale tile over a position
    // saved by any other route, and quietly undid it.
    if (typeof game.isRunning === 'function' && !game.isRunning()) return;
    const { x, y } = game.getPlayerTile();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const body = JSON.stringify({ x, y });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/player/move', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/player/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body, keepalive: true,
      }).catch(() => {});
    }
  } catch {}
}
window.addEventListener('pagehide', flushPosition);
window.addEventListener('beforeunload', flushPosition);
// Quitting the native app hides the window rather than unloading the page.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPosition();
});

// --- native menu bridge.
// The macOS shell (AppKit) drives the game through this. Slot and import
// operations go straight to the HTTP API from Swift — it owns the port — so
// this surface is only the things that need the live page.
window.sqMenu = {
  openPanel(name) {
    if (!panels[name]) return false;
    openOnly(name);
    return true;
  },
  closePanels() { closeAll(); return true; },
  async reloadState() {
    try {
      const json = await fetch('/api/state').then((r) => r.json());
      if (json.ok) { state = normaliseState(json.state); broadcast(); return true; }
    } catch {}
    return false;
  },
  toast(msg, color) {
    try { game.toast(String(msg), color || '#ffd93d'); return true; } catch { return false; }
  },
  ready: true,
};

// --- boot
(async () => {
  try {
    const res = await fetch('/api/state');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'server refused to hand over state');
    state = normaliseState(json.state);
    broadcast();
    await loadOptionalPanels();
    syncDock();
    boot.classList.add('hidden');

    // The launch menu is the front door: it owns save selection and options, and
    // the world does not start until a slot has been chosen. Loading a DIFFERENT
    // slot reloads the page (the world must rebuild from scratch), so we record
    // that this session already came through the door — otherwise the reload
    // would drop the player back at the menu forever.
    // SETTINGS COME OFF DISK FIRST. They are cached in localStorage, which is
    // keyed by an origin whose port changes every launch — so the cache is
    // empty on a fresh run and the real copy is the server's. Awaited before
    // the menu is built so nothing paints at a default it is about to lose.
    await hydrateSettings();
    const launch = createLaunch(overlay, api);
    const menuBg = createMenuBackground(document.getElementById('menubg'));

    // The pause box is in-world furniture; the title screen is a different place
    // entirely, and you only get there by asking for it.
    pause = createPause(overlay);
    pause.onResume = () => pause.close();
    pause.onSave = async () => {
      const okd = await api.save();
      if (okd) {
        pause.setSavedAt(lastSavedAt);
        if (game) game.toast('game saved', '#8fc85a');
      } else if (game) {
        game.toast('the save did not go through', '#e2654a');
      }
      return okd;
    };
    // "Settings" shows the same sheet the title screen does — it does not throw
    // you back to the title screen, which is a different action entirely
    // (Quit to Menu).
    pause.onOptions = () => launch.openSettings();
    const quitToMenu = () => {
      pause.close();
      closeAll();
      // The box is NOT a panel, so `closeAll()` never touched it and a
      // conversation left half-read stayed on screen over the title menu.
      // Dismissed rather than closed: closing counts as having read it, which
      // would open the vendor's counter behind the menu you just asked for.
      if (dialogue) dialogue.dismiss();
      game.stop();
      try { sessionStorage.removeItem('sq-entered'); } catch {}
      showMenu();
    };
    pause.onQuitToMenu = quitToMenu;
    // Test seam. Named and captured rather than read back off `pause`, whose
    // `onQuitToMenu` is a SETTER with no getter — reading it returns undefined.
    if (typeof window !== 'undefined') {
      window.__sqPause = {
        quitToMenu,
        isOpen: () => pause.isOpen(),
        close: () => pause.close(),
      };
    }
    // MENU MUSIC. Started and stopped in exactly the two places the menu is
    // raised and dismissed, so it can never be left playing over the world or
    // silent over the title. Both screens — the title and the save list — are
    // the same launch panel, which is why one pair of calls covers both.
    const showMenu = () => {
      // Belt and braces: every route to the title goes through here, so even a
      // caller that forgets cannot strand a dialogue box over the menu.
      if (dialogue) dialogue.dismiss();
      document.body.classList.add('sq-menu-open');
      menuBg.start();
      launch.setState(state);
      launch.show();
      music.start();
    };
    const dismissMenu = () => {
      document.body.classList.remove('sq-menu-open');
      menuBg.stop();
      music.stop();
    };
    const activeSlot = String((state.meta && state.meta.slot) || 1);
    const entered = sessionStorage.getItem('sq-entered');

    const enterWorld = () => {
      game.start();
      game.toast('Welcome back, Scholar.', '#ffd93d');
    };

    launch.onChosen = async (slot) => {
      dismissMenu();
      try { sessionStorage.setItem('sq-entered', String(slot)); } catch {}
      if (String(slot) === activeSlot) return enterWorld();
      await api.switchSlot(slot);   // reloads the page; we re-enter above
    };

    if (entered === activeSlot) {
      enterWorld();
    } else {
      showMenu();
    }

    window.sqMenu.openLaunch = () => { showMenu(); return true; };
  } catch (err) {
    bootFail('Could not load game state from the server.', err);
  }
})();
