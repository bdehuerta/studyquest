// ENG-WORLD — web/world/gates.js
// The four seams of the Home Block.
//
// v3 reframes the map as the first of many areas, so every edge has to be
// honest about the fact that something is meant to be on the other side. Each
// side gets a real structure with a signpost naming the area beyond, and
// walking up to a locked one tells you exactly what it is waiting for.
//
// Everything here is derived from GATES and REGIONS in constants.js and from
// an AREA descriptor (id, origin, size) — nothing is hardcoded to 64x48, so a
// second block can be dropped in later with its own origin and get its own
// gates for free.
//
// ENG-SYSTEMS is still landing the server side of gate progress. Every read of
// `state` below is defensive: if the authoritative numbers are absent we
// derive the best local approximation rather than showing nothing.

import { GATES, REGIONS, TILE } from '../../shared/constants.js';
import { SPRITES3, GATE_SPAN, GATE_RISE, VGATE_SPAN, VGATE_DEPTH, VGATE_OPENING } from './art.js';

/** Which sprite and orientation each structure name uses. */
const STRUCTURE_ART = {
  'treeline arch': { key: 'treeline', axis: 'h' },
  'cut stone gateway': { key: 'stoneV', axis: 'v' },
  'flooded causeway': { key: 'causeway', axis: 'h' },
  'ash-choked pass': { key: 'ashV', axis: 'v' },
};

/** Horizontal gates leave a 3-tile walkable slot in the middle of their span. */
const H_OPENING = Object.freeze({ from: 3, to: 6 });

const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

/**
 * buildGates(area) -> [gate]
 * `area` is { id, ox, oy, w, h } in tiles. Each gate carries the tiles it
 * blocks, the tiles that form its threshold, its approach rect, where its
 * signpost stands, and how to draw it.
 */
export function buildGates(area) {
  const ox = area.ox | 0;
  const oy = area.oy | 0;
  const w = area.w | 0;
  const h = area.h | 0;
  const out = [];

  for (const def of GATES) {
    const art = STRUCTURE_ART[def.structure] || { key: 'stone', axis: 'h' };
    const sprite = SPRITES3.gates[art.key] || null;
    const region = REGION_BY_ID.get(def.area) || null;
    const g = {
      id: def.id,
      side: def.side,
      area: def.area,
      name: def.name,
      structure: def.structure,
      requires: def.requires || null,
      blurb: (region && region.blurb) || '',
      sprite,
      axis: art.axis,
      solid: new Set(),
      threshold: new Set(),
      /** tiles the whole structure covers, for the approach test and worldgen */
      footprint: { x: 0, y: 0, w: 0, h: 0 },
      /** where the sprite's top-left corner lands, in tiles */
      drawX: 0,
      drawY: 0,
      /** tile the signpost stands on, and which way the player reads it from */
      signX: 0,
      signY: 0,
      /** rect the player has to be inside for the gate to announce itself */
      approach: { x: 0, y: 0, w: 0, h: 0 },
    };

    if (art.axis === 'h') {
      const cx = ox + (w >> 1);
      const x0 = cx - (GATE_SPAN >> 1);
      const north = def.side === 'north';
      // The structure is bottom-aligned to its band, which sits against the edge.
      const y0 = north ? oy : oy + h - GATE_RISE;
      g.footprint = { x: x0, y: y0, w: GATE_SPAN, h: GATE_RISE };
      g.drawX = x0;
      g.drawY = y0;
      for (let dy = 0; dy < GATE_RISE; dy++) {
        for (let dx = 0; dx < GATE_SPAN; dx++) {
          const open = dx >= H_OPENING.from && dx < H_OPENING.to;
          // Only the two rows nearest the edge are structure; the rest of the
          // sprite is canopy or sky overhanging walkable ground.
          const nearEdge = north ? dy < 3 : dy >= GATE_RISE - 3;
          if (!nearEdge) continue;
          const key = x0 + dx + ',' + (y0 + dy);
          if (open) g.threshold.add(key);
          else g.solid.add(key);
        }
      }
      g.signX = x0 + GATE_SPAN - 2;
      g.signY = north ? y0 + 3 : y0 + GATE_RISE - 4;
      g.approach = { x: x0 - 1, y: north ? oy : oy + h - 8, w: GATE_SPAN + 2, h: 8 };
    } else {
      const cy = oy + (h >> 1);
      const y0 = cy - (VGATE_SPAN >> 1);
      const west = def.side === 'west';
      const x0 = west ? ox : ox + w - VGATE_DEPTH;
      g.footprint = { x: x0, y: y0, w: VGATE_DEPTH, h: VGATE_SPAN };
      g.drawX = x0;
      g.drawY = y0;
      for (let dy = 0; dy < VGATE_SPAN; dy++) {
        const open = dy >= VGATE_OPENING.from && dy < VGATE_OPENING.to;
        for (let dx = 0; dx < VGATE_DEPTH; dx++) {
          const key = x0 + dx + ',' + (y0 + dy);
          if (open) g.threshold.add(key);
          else g.solid.add(key);
        }
      }
      g.signX = west ? x0 + VGATE_DEPTH + 1 : x0 - 2;
      g.signY = y0 + VGATE_OPENING.to + 1;
      g.approach = {
        x: west ? ox : ox + w - 8,
        y: y0 - 1,
        w: 8,
        h: VGATE_SPAN + 2,
      };
    }
    out.push(g);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Best-effort lifetime study totals. Prefers whatever ENG-SYSTEMS puts on
 * state (state.stats / state.lifetime), and falls back to counting the raw
 * task and session arrays so the gate still shows honest numbers today.
 */
export function studyTotals(state) {
  const s = state || {};
  const stats = s.stats || s.lifetime || s.totals || {};
  let tasksCompleted = num(stats.tasksCompleted != null ? stats.tasksCompleted : stats.tasks);
  let studyMinutes = num(stats.studyMinutes != null ? stats.studyMinutes : stats.minutes);
  if (!tasksCompleted && Array.isArray(s.tasks)) {
    tasksCompleted = s.tasks.filter((t) => t && t.status === 'done').length;
  }
  if (!studyMinutes && Array.isArray(s.sessions)) {
    studyMinutes = s.sessions.reduce((a, x) => a + num(x && x.minutes), 0);
  }
  const level = num(s.player && s.player.level) || 1;
  return { tasksCompleted, studyMinutes, level };
}

const REQ_LABEL = {
  tasksCompleted: 'tasks finished',
  studyMinutes: 'minutes studied',
  level: 'scholar level',
};

/**
 * gateProgress(state, gate) -> { unlocked, lines:[{label, have, need, ok}] }
 * If the server has published an authoritative view (state.gates[id]) that
 * wins; otherwise the requirement is checked against local totals.
 */
export function gateProgress(state, gate) {
  const s = state || {};
  const server =
    (s.gates && s.gates[gate.id]) ||
    (s.regions && s.regions[gate.area]) ||
    null;

  if (server && typeof server === 'object') {
    const lines = [];
    const src = Array.isArray(server.progress) ? server.progress : null;
    if (src) {
      for (const p of src) {
        if (!p) continue;
        lines.push({
          label: String(p.label || p.key || ''),
          have: num(p.have),
          need: num(p.need),
          ok: p.ok != null ? !!p.ok : num(p.have) >= num(p.need),
        });
      }
    }
    if (lines.length || server.unlocked != null) {
      return {
        unlocked: !!server.unlocked,
        lines: lines.length ? lines : requirementLines(state, gate),
      };
    }
  }

  const lines = requirementLines(state, gate);
  return { unlocked: lines.length > 0 && lines.every((l) => l.ok), lines };
}

function requirementLines(state, gate) {
  const req = gate.requires;
  if (!req) return [{ label: 'open', have: 1, need: 1, ok: true }];
  const totals = studyTotals(state);
  const lines = [];
  for (const key of Object.keys(req)) {
    const need = num(req[key]);
    const have = num(totals[key]);
    lines.push({
      label: REQ_LABEL[key] || key,
      have,
      need,
      ok: have >= need,
    });
  }
  return lines;
}

/** One short line per unmet requirement, ready to toast. */
export function refusalLines(gate, progress) {
  const out = [];
  const unmet = progress.lines.filter((l) => !l.ok);
  const src = unmet.length ? unmet : progress.lines;
  for (const l of src.slice(0, 2)) {
    out.push(l.label + '  ' + Math.floor(l.have) + ' / ' + Math.floor(l.need));
  }
  return out;
}

/** Compact "3/5 tasks" style summary for the on-screen gate hint. */
export function progressSummary(progress) {
  const unmet = progress.lines.filter((l) => !l.ok);
  if (!unmet.length) return '';
  const l = unmet[0];
  return Math.floor(l.have) + ' / ' + Math.floor(l.need) + ' ' + l.label;
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export function gateSolidAt(gates, tx, ty) {
  const key = tx + ',' + ty;
  for (const g of gates) if (g.solid.has(key)) return g;
  return null;
}

export function gateThresholdAt(gates, tx, ty) {
  const key = tx + ',' + ty;
  for (const g of gates) if (g.threshold.has(key)) return g;
  return null;
}

export function gateAt(gates, tx, ty) {
  return gateSolidAt(gates, tx, ty) || gateThresholdAt(gates, tx, ty);
}

export function gateInApproach(gates, tx, ty) {
  for (const g of gates) {
    const a = g.approach;
    if (tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h) return g;
  }
  return null;
}

/** World-pixel centre of a gate's opening — where the hint text is anchored. */
export function gateHintAnchor(gate) {
  const f = gate.footprint;
  if (gate.axis === 'h') {
    const cx = (f.x + GATE_SPAN / 2) * TILE;
    const cy = gate.side === 'north' ? (f.y + 3) * TILE : (f.y + f.h - 3) * TILE;
    return { x: cx, y: cy };
  }
  const cy = (f.y + (VGATE_OPENING.from + VGATE_OPENING.to) / 2) * TILE;
  const cx = gate.side === 'west' ? (f.x + f.w) * TILE : f.x * TILE;
  return { x: cx, y: cy };
}

export default buildGates;
