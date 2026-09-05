// server/shops.js  [AGENT-F]
// The four vendors. Pure logic over `state` — no file io, no http.
//
//   merchant  — 5 material offers, rerolled once per local day from a SEEDED rng
//               (never Math.random: the same day must give the same stock, and
//               a different day must give different stock, even across restarts).
//   archivist — blueprints, and ONLY blueprints. This is the crafting gate and
//               the main florin sink.
//   broker    — no longer sells Dark Boxes at any price. Boxes are earned by
//               submitting work; see the note by BUYBACK_RATE.
//   exchange  — an NPC with a roulette table who turns SHARDS into FLORINS,
//               one way only and deliberately expensively.

import {
  CURRENCY_IDS, MATERIAL_IDS, SAPLING_TOTAL_MINUTES,
  MAIN_CURRENCY, SHARD_TO_FLORIN, TOOL_DURABILITY,
  sellBundle,
  CHARMS,
  CHARM_IDS,
  HUT,
  QUEST_ITEMS,
} from '../shared/constants.js';
import {
  MATERIALS, RECIPES, getRecipe, TOOLS, BUILDINGS,
  ALL_MATERIAL_IDS, isTreeDrop,
} from '../shared/recipes.js';
import { pushLog } from './store.js';

// ---------------------------------------------------------------- price table

/** What a unit of each rarity is worth, and which currency that vendor deals in. */
// What ONE unit costs to BUY. Rescaled with everything else when florins
// became rare: a common material was 14 florins when a florin was worth about a
// fifth of one, and is 1 now. The spread against the sell bundle (5 commons for
// 1 florin) is deliberately steep — buying materials should be the expensive
// way to get them, and gathering the cheap one.
const RARITY_PRICE = Object.freeze({
  common: 1, uncommon: 2, rare: 5, epic: 12, legendary: 30,
});
// Everything is priced in FLORINS. The four currencies existed to give the
// Exchange something to convert between; the Exchange now converts shards into
// florins instead, which is a real decision rather than shuffling piles.
const RARITY_CURRENCY = Object.freeze({
  common: MAIN_CURRENCY, uncommon: MAIN_CURRENCY, rare: MAIN_CURRENCY,
  epic: MAIN_CURRENCY, legendary: MAIN_CURRENCY,
});
/**
 * DEAD as a sell rate — selling is bundles now (see SELL_BUNDLES). Kept only
 * because `materialSellPrice` is still used to VALUE a material for the refund
 * bank and for blueprint pricing, where a per-unit number is the right shape.
 * Nothing quotes a sale from it.
 */
export const BUYBACK_RATE = 0.4;

// The Broker used to sell Dark Boxes at an escalating price. He no longer sells
// them at ANY price: boxes are earned by submitting work and by nothing else,
// which is the one rule that keeps progression tied to actually studying. The
// constants are gone rather than set high — a price that merely escalates is
// still a price.

/**
 * v3 tree drops are priced by hand rather than off their rarity band. They are
 * a harvest, not salvage: the whole chop → sell → buy-a-sapling loop has to
 * clear a small profit, and rarity pricing alone made Heartwood worth the same
 * as Inkglass, which is wrong for something you can only get by felling a tree
 * you then have to replace. See TREE_ECONOMY_NOTE.
 */
const TREE_DROP_PRICE = Object.freeze({
  heartwood: 3,
  resin:     2,
  seedpod:   5,
});

/**
 * The Woodsman, hidden in a cave in the south-east, buys timber and nothing
 * else — at nearly full price instead of the Trading Post's 40%. Finding him is
 * what you are paid for. He is the reason the Market can be buy-only without
 * the chop -> sell -> replant loop dying.
 */
// Superseded by SELL_BUNDLES.outlander; kept as a doc of the old design.
export const WOODSMAN_RATE = 0.9;
// Timber only. Heartwood and Amber Resin came off his counter on Bruno's call
// (2026-09-03): they are crafting stock, and a buyer paying outlander rates for
// them meant the sensible move was always to sell them rather than build with
// them. The Trading Post still takes them, at the worse town rate.
export const WOODSMAN_BUYS = Object.freeze(['ironwood']);

/**
 * The Stonemason, under the mountain in the south-east. Same deal, other trade:
 * he takes STONE and will not look at timber. Two buyers in two far corners is
 * what stops "go and sell" being one short walk to one counter.
 */
export const STONEMASON_RATE = 0.9;
export const STONEMASON_BUYS = Object.freeze(['chalkstone', 'lenscrystal']);

/**
 * WHAT THE TRADING POST TAKES — timber, stone and fish, and nothing else.
 *
 * The Post is a town counter, not a fence. It used to accept any material in
 * the game, which made the outlanders pointless for anything they did not
 * happen to specialise in and let a Home Block scholar cash out materials from
 * regions they cannot reach. Enforced HERE as well as in the panel: a rule that
 * only the UI knows is not a rule.
 *
 * He pays the ordinary town bundle (5 commons for a florin) against the
 * outlanders' 7-for-2, so he is deliberately the worse price for wood and
 * stone. Fish he is the only buyer for.
 */
export const MERCHANT_BUYS = Object.freeze([
  'ironwood', 'heartwood', 'resin', 'seedpod',
  'chalkstone', 'lenscrystal',
  'wild_tuna',
]);

/** Which outlander deals in this material, or null for neither. */
export function outlanderFor(id) {
  if (WOODSMAN_BUYS.indexOf(id) !== -1) return 'woodsman';
  if (STONEMASON_BUYS.indexOf(id) !== -1) return 'stonemason';
  return null;
}

/**
 * THE BUNDLE a vendor pays for this material: `{ per, pay }`.
 *
 * Selling is no longer "N florins each". Florins are rare, and a per-unit price
 * cannot express "five ironwood for one florin" without inventing fractions —
 * every common material would round to 1 florin each and the whole rebalance
 * would evaporate in the rounding. Rarity picks the bundle; the vendor picks
 * which table.
 */
export function bundleFor(id, vendor) {
  const m = MATERIALS[id];
  const rarity = (m && m.rarity) || 'common';
  return sellBundle(rarity, vendor === 'merchant' ? 'town' : 'outlander', id);
}

/**
 * What `qty` units actually fetch, and what it costs to hand over.
 * Whole bundles only — the remainder stays in the pack rather than being
 * quietly swallowed.
 */
export function quoteSale(id, qty, vendor) {
  const b = bundleFor(id, vendor);
  const bundles = Math.floor(Math.max(0, qty) / b.per);
  return { bundles, per: b.per, pay: b.pay, earned: bundles * b.pay, spent: bundles * b.per };
}

/** Kept for callers that still name the Woodsman directly. */
export function woodsmanBundle(id) {
  return bundleFor(id, 'woodsman');
}

const VENDOR_NAME = Object.freeze({
  merchant: 'Merchant', woodsman: 'Woodsman', stonemason: 'Stonemason',
});

/** A sapling costs coins, not materials — that is the reinvestment. */
export const SAPLING_PRICE = 1;
export const SAPLING_CURRENCY = MAIN_CURRENCY;
export const SAPLING_BULK_QTY = 5;
export const SAPLING_BULK_PRICE = 4;    // one free for buying the tray

export const TREE_ECONOMY_NOTE =
  'Every tree you fell drops exactly one Seedpod, and a Seedpod plants like a free sapling — '
  + 'so the wood replaces itself if you replant. '
  + `Saplings on the counter cost ${SAPLING_PRICE} florin and take ${SAPLING_TOTAL_MINUTES} `
  + 'minutes to mature; buy them to GROW the forest, not to keep it. '
  + 'Florins are rare: stone is the steady purse, since it grows back and trees do not.';

export function materialPrice(materialId) {
  const m = MATERIALS[materialId];
  if (!m) return null;
  return {
    currency: RARITY_CURRENCY[m.rarity] || MAIN_CURRENCY,
    price: TREE_DROP_PRICE[materialId] || RARITY_PRICE[m.rarity] || 20,
    rarity: m.rarity,
  };
}

export function materialSellPrice(materialId) {
  const p = materialPrice(materialId);
  if (!p) return null;
  return { currency: p.currency, price: Math.max(1, Math.round(p.price * BUYBACK_RATE)) };
}

// ---------------------------------------------------------------- seeded rng

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------- merchant

// Weighted so a day's stock is mostly usable commons with the odd luxury.
const STOCK_WEIGHT = Object.freeze({
  common: 46, uncommon: 28, rare: 16, epic: 8, legendary: 2,
});
const STOCK_QTY = Object.freeze({
  common: [3, 8], uncommon: [2, 5], rare: [1, 3], epic: [1, 2], legendary: [1, 1],
});

function pickWeighted(rng, pool) {
  const total = pool.reduce((s, p) => s + p.w, 0);
  let r = rng() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.id;
  }
  return pool[pool.length - 1].id;
}

/**
 * THE MERCHANT'S SHELF — tools and charms, never materials.
 *
 * Bruno, 2026-08-31: *"materials which cannot be obtained in this area should
 * not be sold in the shop, the trading shop should instead sell gear and charms
 * that give small speed boosts (very expensive in florins) or the lanterns."*
 *
 * He was right that it was incoherent: the shelf rolled from ALL of
 * MATERIAL_IDS, so a Home Block scholar could buy Voidshard and Runeplate —
 * materials from regions they cannot reach — off a market stall. That made the
 * gates decorative and gathering pointless.
 *
 * The shelf is now FIXED, not rolled: replacement axes and pickaxes, and the
 * charms. There is nothing random about a blacksmith's stock, and a daily
 * reroll on four items only ever meant "come back tomorrow and hope".
 */
function rollMerchantStock(dayKey) {
  const offers = [];

  // Replacement tools. Durability is finite and a broken axe with no ironwood
  // to craft another is the one way this game can still soft-lock.
  for (const toolId of ['axe', 'pickaxe', 'sifter']) {
    const t = TOOLS[toolId];
    if (!t) continue;
    offers.push({
      id: `merchant_tool_${toolId}`,
      shopId: 'merchant',
      kind: 'tool',
      toolId,
      name: t.name,
      desc: t.desc || '',
      rarity: 'common',
      color: '#c9922f',
      qty: 1,
      currency: MAIN_CURRENCY,
      price: TOOL_SHOP_PRICE[toolId] || 4,
      sold: false,
    });
  }

  // Charms. Expensive on purpose — they are the only permanent upgrade money
  // can buy, and florins are rare.
  for (const id of CHARM_IDS) {
    const c = CHARMS[id];
    offers.push({
      id: `merchant_charm_${id}`,
      shopId: 'merchant',
      kind: 'charm',
      charmId: id,
      name: c.name,
      desc: c.desc,
      rarity: 'rare',
      color: c.color,
      qty: 1,
      currency: MAIN_CURRENCY,
      price: c.price,
      sold: false,
    });
  }

  return offers;
}

/** What a replacement tool costs at the counter. */
const TOOL_SHOP_PRICE = Object.freeze({ axe: 4, pickaxe: 5, sifter: 14 });

// ---------------------------------------------------------------- nursery

/** Permanent sapling stock. Not rerolled, never sold out. */
export function saplingOffers() {
  return [
    {
      id: 'sapling_x1', shopId: 'merchant', kind: 'sapling',
      name: 'Sapling', desc: 'Plant it on grass. Mature in ' + SAPLING_TOTAL_MINUTES + ' minutes.',
      qty: 1, currency: SAPLING_CURRENCY, price: SAPLING_PRICE, sold: false,
    },
    {
      id: 'sapling_x5', shopId: 'merchant', kind: 'sapling',
      name: `Tray of ${SAPLING_BULK_QTY} Saplings`, desc: 'The whole tray, slightly cheaper.',
      qty: SAPLING_BULK_QTY, currency: SAPLING_CURRENCY, price: SAPLING_BULK_PRICE, sold: false,
    },
  ];
}

const SAPLING_OFFER_BY_ID = Object.freeze({
  sapling_x1: { qty: 1, price: SAPLING_PRICE },
  sapling_x5: { qty: SAPLING_BULK_QTY, price: SAPLING_BULK_PRICE },
});

// ---------------------------------------------------------------- archivist

/** Blueprint price scales with the power of the thing it unlocks. */
export function blueprintPrice(recipe) {
  if (!recipe) return 0;
  let coinSum = 0;
  for (const c of CURRENCY_IDS) coinSum += Number((recipe.coins || {})[c]) || 0;
  let matValue = 0;
  for (const [id, qty] of Object.entries(recipe.materials || {})) {
    const p = materialPrice(id);
    if (p) matValue += p.price * (Number(qty) || 0);
  }
  // Rescaled with the rest of the economy. The +3 floor is what keeps a
  // blueprint for a cheap recipe from costing nothing at all.
  const raw = 0.5 * coinSum + 0.5 * matValue + 3;
  return Math.max(3, Math.round(raw));
}

function outputName(recipe) {
  if (!recipe) return '?';
  if (recipe.kind === 'tool') return (TOOLS[recipe.outputId] || {}).name || recipe.outputId;
  if (recipe.kind === 'building') return (BUILDINGS[recipe.outputId] || {}).name || recipe.outputId;
  return recipe.outputId;
}

function outputDesc(recipe) {
  if (!recipe) return '';
  const def = recipe.kind === 'tool' ? TOOLS[recipe.outputId] : BUILDINGS[recipe.outputId];
  return (def && def.desc) || '';
}

function archivistStock(state) {
  const owned = new Set(Array.isArray(state.blueprints) ? state.blueprints : []);
  return RECIPES.filter((r) => !owned.has(r.id)).map((r) => ({
    id: `blueprint_${r.id}`,
    shopId: 'archivist',
    kind: 'blueprint',
    recipeId: r.id,
    name: `Blueprint: ${outputName(r)}`,
    desc: outputDesc(r),
    outputKind: r.kind,
    currency: MAIN_CURRENCY,
    price: blueprintPrice(r),
    sold: false,
  }));
}

// ---------------------------------------------------------------- broker

// The Broker sold Dark Boxes at an escalating same-day price. That route is
// GONE — not repriced, gone. Boxes come from submitting work, and buying
// progression was the one thing that could make studying optional.
//
// He keeps his corner and now deals in nothing, pending a new trade. His entry
// is still listed so a save that has him placed does not point at a vendor that
// does not exist.

// ---------------------------------------------------------------- refresh

function ensureShops(state) {
  if (!state.shops || typeof state.shops !== 'object') {
    state.shops = {
      refreshedOn: null, pricingVersion: PRICING_VERSION,
      stock: { merchant: [], broker: [], archivist: [] }, brokerBoxesSoldToday: 0,
    };
  }
  if (!state.shops.stock || typeof state.shops.stock !== 'object') {
    state.shops.stock = { merchant: [], broker: [], archivist: [] };
  }
  for (const k of ['merchant', 'broker', 'archivist']) {
    if (!Array.isArray(state.shops.stock[k])) state.shops.stock[k] = [];
  }
  if (!Number.isFinite(Number(state.shops.brokerBoxesSoldToday))) state.shops.brokerBoxesSoldToday = 0;
  return state.shops;
}

/** Reroll the daily stock if we have crossed into a new local day. Returns true if it did. */
/**
 * Bump this whenever the price tables change.
 *
 * The Merchant's stock is rolled ONCE A DAY and cached in the save with its
 * prices baked in, so a repricing was invisible to anyone whose stock had
 * already been rolled — the old numbers sat on the shelf until tomorrow. Bruno,
 * 2026-08-31: "I dont see in the game the pricing changes." A day key alone
 * cannot express "and also whenever the rules change", so the version goes
 * beside it.
 */
export const PRICING_VERSION = 2;

/**
 * THE TRADING POST DOES NOT RESTOCK. Bruno, 2026-08-31.
 *
 * The daily reroll was left over from when the shelf was a random five
 * materials and "come back tomorrow" was the whole shape of the shop. It sells
 * a fixed counter now — two replacement tools and two charms — and a permanent
 * shelf that rebuilds itself at midnight is just a fact nobody can observe,
 * with a promise in the UI ("restocks tomorrow") that is no longer true.
 *
 * The stock is rebuilt only when there is a REASON to:
 *   - it has never been built (a new or migrated save), or
 *   - `PRICING_VERSION` moved, which is what carries a repricing into a save
 *     that already has a shelf. That one matters: prices are baked into the
 *     offers, so without it a rebalance is invisible until something forces a
 *     rebuild — and there is no longer a midnight to do the forcing.
 *
 * `brokerBoxesSoldToday` still resets on the day, because the daily cap it
 * counts IS a daily thing. That is a different clock from the shelf.
 */
export function refreshShops(state) {
  const shops = ensureShops(state);
  const today = localDayKey();
  const priced = Number(shops.pricingVersion) || 0;

  // The one thing that is still per-day: the Broker's box counter.
  if (shops.refreshedOn !== today) {
    shops.refreshedOn = today;
    shops.brokerBoxesSoldToday = 0;
  }

  if (priced === PRICING_VERSION && shops.stock.merchant.length) return false;

  shops.pricingVersion = PRICING_VERSION;
  shops.stock.merchant = rollMerchantStock(today);
  // archivist + broker are derived on read, so their cached lists stay empty
  shops.stock.broker = [];
  shops.stock.archivist = [];
  return true;
}

/**
 * One of the two outlanders — the Woodsman or the Stonemason. They differ only
 * in what they take and where they stand, so they are built from one shape:
 * two vendors written twice is two vendors that drift apart.
 */
function outlanderView(state, vendor, meta) {
  const list = vendor === 'stonemason' ? STONEMASON_BUYS : WOODSMAN_BUYS;
  return {
    id: vendor,
    name: meta.name,
    blurb: meta.blurb,
    // The outlanders' advantage is the BUNDLE, not a rate — see `buys` below.
    buybackRate: null,
    buys: list.map((id) => {
      const here = bundleFor(id, vendor);
      const town = bundleFor(id, 'merchant');
      return {
        materialId: id,
        name: MATERIALS[id].name,
        rarity: MATERIALS[id].rarity,
        color: MATERIALS[id].color,
        have: Math.max(0, Number((state.materials || {})[id]) || 0),
        currency: MAIN_CURRENCY,
        // Their whole reason to exist: a better lot than the Trading Post,
        // paid for by the walk out to find them.
        per: here.per, pay: here.pay,
        townPer: town.per, townPay: town.pay,
      };
    }),
  };
}

/**
 * The Silver Key, if the scholar is far enough along to be offered it.
 *
 * NOT part of the rolled stock: the stock is fixed and cached in the save,
 * and a level-gated item baked into it would either never appear (cached
 * before level 15) or never go away (cached after). It is added on READ, from
 * live state, which is the only way a conditional offer can be honest.
 */
function silverKeyOffer(state) {
  const level = Math.max(1, Math.floor(Number(state.player && state.player.level) || 1));
  if (level < HUT.keyLevel) return null;
  // Once the hut is open the key has done its job and nobody needs a second.
  if (state.hut && state.hut.opened) return null;
  const held = Math.max(0, Number((state.questItems || {}).silver_key) || 0);
  if (held > 0) return null;
  const def = QUEST_ITEMS.silver_key;
  return {
    id: 'merchant_key_silver',
    shopId: 'merchant',
    kind: 'questItem',
    questItemId: 'silver_key',
    name: def.name,
    desc: def.desc,
    rarity: 'rare',
    color: def.color,
    qty: 1,
    currency: MAIN_CURRENCY,
    price: HUT.keyPrice,
    sold: false,
  };
}

/** The full vendor view for the UI. Refreshes stale stock as a side effect. */
export function getShops(state) {
  refreshShops(state);
  const shops = ensureShops(state);
  const owned = Array.isArray(state.blueprints) ? state.blueprints : [];

  return {
    refreshedOn: shops.refreshedOn,
    merchant: {
      id: 'merchant',
      name: 'The Wandering Merchant',
      blurb: 'Sets out five things each morning and buys whatever you have too much of.',
      buybackRate: null,
      offers: shops.stock.merchant.filter((o) => o && !o.sold)
        .concat([silverKeyOffer(state)].filter(Boolean)),
      // v3: the nursery never sells out and never rerolls. Saplings are the
      // only way the forest comes back, so they must always be on the counter.
      nursery: {
        note: TREE_ECONOMY_NOTE,
        growMinutes: SAPLING_TOTAL_MINUTES,
        have: Math.max(0, Number(state.player && state.player.saplings) || 0),
        offers: saplingOffers(),
      },
      buys: ALL_MATERIAL_IDS.map((id) => {
        const b = bundleFor(id, 'merchant');
        return {
          materialId: id,
          name: MATERIALS[id].name,
          rarity: MATERIALS[id].rarity,
          color: MATERIALS[id].color,
          have: Math.max(0, Number((state.materials || {})[id]) || 0),
          currency: MAIN_CURRENCY,
          per: b.per, pay: b.pay,
          treeDrop: isTreeDrop(id),
        };
      }),
    },
    archivist: {
      id: 'archivist',
      name: 'The Archivist',
      blurb: 'Nothing is craftable until it is known. Blueprints are permanent.',
      owned: owned.slice(),
      offers: archivistStock(state),
    },
    broker: {
      id: 'broker',
      name: 'The Broker',
      blurb: 'Dealt in Dark Boxes, once. They cannot be bought at any price now — '
        + 'they are earned by submitting your work.',
      closed: true,
      offers: [],
    },
    exchange: {
      id: 'exchange',
      name: 'The Exchange',
      blurb: `Turns shards into florins at ${SHARD_TO_FLORIN.shards} for ${SHARD_TO_FLORIN.florins}. `
        + 'He will not trade the other way.',
      // The roulette table in front of him is scenery for now: the rate is
      // fixed and the wheel decides nothing.
      roulette: { decorative: true },
      from: 'shard',
      to: MAIN_CURRENCY,
      rate: SHARD_TO_FLORIN,
      have: have(state, 'shard'),
      currencies: CURRENCY_IDS.slice(),
    },
    woodsman: outlanderView(state, 'woodsman', {
      name: 'The Woodsman',
      blurb: 'Camps in the south-west woods and pays well over the odds for timber.',
    }),
    stonemason: outlanderView(state, 'stonemason', {
      name: 'The Stonemason',
      blurb: 'Lives under the mountain in the south-east. Buys stone, and only stone.',
    }),
  };
}

// ---------------------------------------------------------------- actions
// Each returns { ok:true, ... } or { ok:false, error } — plain data, no HTTP.

function wallet(state) {
  if (!state.player.coins || typeof state.player.coins !== 'object') {
    state.player.coins = { florin: 0, shard: 0 };
  }
  return state.player.coins;
}

function have(state, currency) {
  return Math.max(0, Number(wallet(state)[currency]) || 0);
}

export function buy(state, shopId, offerId) {
  refreshShops(state);
  const shops = ensureShops(state);
  const id = typeof offerId === 'string' ? offerId : '';
  const shop = typeof shopId === 'string' ? shopId : '';

  if (shop === 'merchant') {
    // v3 nursery: saplings sit outside the daily stock and never run out.
    const sap = SAPLING_OFFER_BY_ID[id];
    if (sap) {
      if (have(state, SAPLING_CURRENCY) < sap.price) {
        return {
          ok: false,
          error: `${sap.qty === 1 ? 'a sapling' : `a tray of ${sap.qty} saplings`} costs ` +
            `${sap.price} ${SAPLING_CURRENCY}, and you have ${have(state, SAPLING_CURRENCY)}`,
        };
      }
      wallet(state)[SAPLING_CURRENCY] = have(state, SAPLING_CURRENCY) - sap.price;
      state.player.saplings = Math.max(0, Number(state.player.saplings) || 0) + sap.qty;
      pushLog(
        state,
        `Bought ${sap.qty} sapling${sap.qty === 1 ? '' : 's'} for ${sap.price} ${SAPLING_CURRENCY}. ` +
        'Plant them on grass inside the Home Block.',
        'shop'
      );
      return {
        ok: true,
        bought: {
          kind: 'sapling', qty: sap.qty, price: sap.price, currency: SAPLING_CURRENCY,
          saplings: state.player.saplings,
        },
      };
    }

    // The Silver Key is added on read, not stored, so it has to be looked for
    // separately — otherwise buying it fails with "he never had that".
    const offer = shops.stock.merchant.find((o) => o && o.id === id && !o.sold)
      || (id === 'merchant_key_silver' ? silverKeyOffer(state) : null);
    if (!offer) return { ok: false, error: 'the merchant has already sold that, or never had it — reopen the stall' };
    if (have(state, offer.currency) < offer.price) {
      return { ok: false, error: `that costs ${offer.price} ${offer.currency}, and you have ${have(state, offer.currency)}` };
    }
    wallet(state)[offer.currency] = have(state, offer.currency) - offer.price;

    // The shelf carries three kinds now. Materials are gone from it entirely —
    // the branch stays only so an old save's leftover stock does not crash.
    let bought;
    if (offer.kind === 'questItem') {
      if (!state.questItems || typeof state.questItems !== 'object') state.questItems = {};
      state.questItems[offer.questItemId] = 1;
      bought = { kind: 'questItem', questItemId: offer.questItemId, qty: 1, price: offer.price, currency: offer.currency };
    } else if (offer.kind === 'charm') {
      if (!Array.isArray(state.player.ownedCharms)) state.player.ownedCharms = [];
      if (state.player.ownedCharms.includes(offer.charmId)) {
        // Refund and refuse: a charm is a permanent effect, and two of the same
        // one does nothing but cost you twice.
        wallet(state)[offer.currency] = have(state, offer.currency) + offer.price;
        return { ok: false, error: `you already own the ${offer.name}. A second would do nothing.` };
      }
      state.player.ownedCharms.push(offer.charmId);
      bought = { kind: 'charm', charmId: offer.charmId, qty: 1, price: offer.price, currency: offer.currency };
    } else if (offer.kind === 'tool') {
      if (!Array.isArray(state.player.gatherTools)) state.player.gatherTools = [];
      const max = TOOL_DURABILITY[offer.toolId] || 50;
      state.player.gatherTools.push({
        uid: `bought-${offer.toolId}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        toolId: offer.toolId, durability: max, maxDurability: max,
      });
      bought = { kind: 'tool', toolId: offer.toolId, qty: 1, price: offer.price, currency: offer.currency };
    } else {
      if (!state.materials || typeof state.materials !== 'object') state.materials = {};
      state.materials[offer.materialId] = (Number(state.materials[offer.materialId]) || 0) + offer.qty;
      bought = { kind: 'material', materialId: offer.materialId, qty: offer.qty, price: offer.price, currency: offer.currency };
    }
    // Tools and charms are not a limited shelf — the Merchant can always sell
    // you another axe. Only the old material offers ever sold out.
    if (offer.kind === 'material') offer.sold = true;
    pushLog(state, `Bought ${offer.name} from the Merchant for ${offer.price} ${offer.currency}.`, 'shop');
    return { ok: true, bought };
  }

  if (shop === 'archivist') {
    const recipeId = id.startsWith('blueprint_') ? id.slice('blueprint_'.length) : id;
    const recipe = getRecipe(recipeId);
    if (!recipe) return { ok: false, error: `the Archivist has no blueprint called "${recipeId}"` };
    if (!Array.isArray(state.blueprints)) state.blueprints = [];
    if (state.blueprints.includes(recipeId)) {
      return { ok: false, error: `you already know how to make the ${outputName(recipe)}` };
    }
    const price = blueprintPrice(recipe);
    if (have(state, 'insight') < price) {
      return { ok: false, error: `that blueprint costs ${price} insight, and you have ${have(state, 'insight')}` };
    }
    wallet(state).insight = have(state, 'insight') - price;
    state.blueprints.push(recipeId);
    pushLog(state, `Bought the ${outputName(recipe)} blueprint for ${price} insight. You can craft it now.`, 'shop');
    return { ok: true, bought: { kind: 'blueprint', recipeId, name: outputName(recipe), price, currency: MAIN_CURRENCY } };
  }

  if (shop === 'broker') {
    // Belt and braces: even if a stale client still has a box offer on screen,
    // the server refuses. The rule is absolute, not merely unlisted.
    return {
      ok: false,
      error: 'Dark Boxes cannot be bought. Submit work — graded work pays them out.',
    };
  }

  if (shop === 'exchange') {
    return { ok: false, error: 'the Exchange does not sell anything — use /api/exchange to convert currency' };
  }
  return { ok: false, error: `there is no shop called "${shopId}"` };
}

/**
 * Sell materials. `vendor` decides the price and what is accepted:
 *   merchant  — the Trading Post's buyback, 40% of list, takes anything.
 *   woodsman  — the cave, 90% of list, takes timber only.
 * An unknown vendor is treated as the merchant rather than refused, so an older
 * client that sends no vendor keeps working at the old price.
 */
export function sell(state, materialId, qtyRaw, vendorRaw) {
  const id = typeof materialId === 'string' ? materialId : '';
  const vendor = (vendorRaw === 'woodsman' || vendorRaw === 'stonemason') ? vendorRaw : 'merchant';
  if (!ALL_MATERIAL_IDS.includes(id)) return { ok: false, error: `"${materialId}" is not a material the Merchant recognises` };
  if (vendor === 'woodsman' && WOODSMAN_BUYS.indexOf(id) === -1) {
    return { ok: false, error: `The Woodsman deals in timber only — ${MATERIALS[id].name} is no use to him.` };
  }
  if (vendor === 'stonemason' && STONEMASON_BUYS.indexOf(id) === -1) {
    return { ok: false, error: `The Stonemason deals in stone only — ${MATERIALS[id].name} is no use to him.` };
  }
  if (vendor === 'merchant' && MERCHANT_BUYS.indexOf(id) === -1) {
    return {
      ok: false,
      error: `The Trading Post buys timber, stone and fish — ${MATERIALS[id].name} is not something `
        + 'anyone here has a use for.',
    };
  }

  const qty = Math.round(Number(qtyRaw));
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: 'sell at least 1 unit' };

  if (!state.materials || typeof state.materials !== 'object') state.materials = {};
  const stock = Math.max(0, Number(state.materials[id]) || 0);
  if (stock < qty) {
    return { ok: false, error: `you only have ${stock}x ${MATERIALS[id].name} — cannot sell ${qty}` };
  }

  const quote = quoteSale(id, qty, vendor);
  if (quote.bundles < 1) {
    return {
      ok: false,
      error: `${VENDOR_NAME[vendor] || 'The Merchant'} deals in lots of ${quote.per} `
        + `${MATERIALS[id].name} for ${quote.pay} florin${quote.pay === 1 ? '' : 's'} — `
        + `you offered ${qty}. Bring at least ${quote.per}.`,
    };
  }

  // Whole bundles only. The remainder is handed back rather than taken.
  const taken = quote.spent;
  const earned = quote.earned;
  state.materials[id] = stock - taken;
  wallet(state)[MAIN_CURRENCY] = have(state, MAIN_CURRENCY) + earned;
  const left = qty - taken;
  pushLog(
    state,
    `Sold ${taken}x ${MATERIALS[id].name} to the ${VENDOR_NAME[vendor] || 'Merchant'} `
      + `for ${earned} florin${earned === 1 ? '' : 's'} (${quote.per} for ${quote.pay}).`
      + (left > 0 ? ` ${left} would not make a lot and stayed in your pack.` : '')
      + (id === 'seedpod' ? ' (A seedpod plants like a free sapling — you sold a tree.)' : ''),
    'shop'
  );
  return {
    ok: true, earned, currency: MAIN_CURRENCY, materialId: id,
    qty: taken, offered: qty, kept: left,
    per: quote.per, pay: quote.pay, bundles: quote.bundles,
    vendor,
  };
}

export function exchange(state, from, to, amountRaw) {
  const f = typeof from === 'string' ? from : '';
  const t = typeof to === 'string' ? to : '';
  const RATE = SHARD_TO_FLORIN;

  // ONE DIRECTION ONLY. Shards are the one thing you cannot buy — they are paid
  // out by Dark Boxes, which are paid out by graded work. Letting florins buy
  // shards back would put a price on the only currency that has to be earned.
  if (f === MAIN_CURRENCY && t === 'shard') {
    return { ok: false, error: 'He deals shards for florins, never the other way. Shards are earned.' };
  }
  if (f !== 'shard' || t !== MAIN_CURRENCY) {
    return {
      ok: false,
      error: `The Exchange trades shards for florins — nothing else.`,
    };
  }

  const amount = Math.round(Number(amountRaw));
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, error: 'exchange at least 1 shard' };

  const balance = have(state, 'shard');
  if (balance < amount) return { ok: false, error: `you have ${balance} shards, not ${amount}` };

  // Whole florins only, and the remainder is NOT taken. Shaving shards off a
  // trade that bought nothing is how a player quietly loses money they earned.
  const received = Math.floor(amount / RATE.shards) * RATE.florins;
  if (received < 1) {
    return {
      ok: false,
      error: `${RATE.shards} shards buy ${RATE.florins} florin — ${amount} is not enough yet.`,
    };
  }
  const spent = Math.ceil(received / RATE.florins) * RATE.shards;

  wallet(state).shard = balance - spent;
  wallet(state)[MAIN_CURRENCY] = have(state, MAIN_CURRENCY) + received;
  pushLog(state, `The Exchange took ${spent} shards and paid ${received} florin${received === 1 ? '' : 's'}.`, 'shop');
  return { ok: true, received, spent, lost: 0, from: 'shard', to: MAIN_CURRENCY, amount: spent };
}
