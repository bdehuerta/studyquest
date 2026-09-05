// web/ui/importer.js  [AGENT-H]
// Paste your real syllabus in, see what would become quests, then commit.
// The preview is parsed client-side purely so you can look before you leap —
// the server's parse is the authoritative one and its result is what we report.
// Exactly one <style> tag, every selector namespaced .sq-import-*.

import {
  PALETTE,
  SUBJECTS,
  WORK_TYPES,
  WORK_TYPE_IDS,
} from '../../shared/constants.js';

const STYLE_ID = 'sq-import-style';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

const FORMAT_HINTS = [
  {
    id: 'json',
    name: 'JSON',
    hint: 'an array of objects, or { "tasks": [ … ] }',
    example: '[{"title":"Essay on Rome","subject":"History","type":"writing","diff":3,"minutes":120,"due":5}]',
  },
  {
    id: 'csv',
    name: 'CSV / TSV',
    hint: 'a header row, then one task per line (delimiter auto-detected)',
    example: 'title,subject,workType,difficulty,estMinutes,dueInDays\nEssay on Rome,History,writing,3,120,5',
  },
  {
    id: 'md',
    name: 'Markdown checklist',
    hint: 'ticked boxes are skipped, bare ones are fine too',
    example: '- [ ] Essay on Rome (History, writing, d3, 120m, due 5d)',
  },
  {
    id: 'lines',
    name: 'Plain lines',
    hint: 'one task per line — everything else is guessed from the words',
    example: 'Read chapter 4 of the econ textbook',
  },
];

const SAMPLE = `- [ ] Essay on Rome (History, writing, d3, 120m, due 5d)
- [ ] Problem set 7 (Mathematics, practice, d4, 90m, due 2d)
Read chapter 4 of the econ textbook
Lab report: titration writeup`;

// Keyword → work type. Order matters: the first hit wins.
const WORK_KEYWORDS = [
  [/\b(essay|report|write|writing|dissertation|paper|memo)\b/i, 'writing'],
  [/\b(problem\s*set|pset|exercis|drill|practice|problems|worksheet)\b/i, 'practice'],
  [/\b(read|reading|chapter|textbook|article|pages?)\b/i, 'reading'],
  [/\b(lab|experiment|practical|titration|dissection)\b/i, 'lab'],
  [/\b(revise|revision|review|recap|flashcards?|memoris|memoriz)\b/i, 'revision'],
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback || 0);
}

function subjectOf(id) {
  return SUBJECTS.find((s) => s.id === id) || SUBJECTS[SUBJECTS.length - 1];
}

/** Loose subject match: id, full name, or a distinctive prefix. */
function matchSubject(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'other';
  for (const s of SUBJECTS) {
    if (s.id === v || s.name.toLowerCase() === v) return s.id;
  }
  for (const s of SUBJECTS) {
    const n = s.name.toLowerCase();
    if (v.length >= 3 && (n.indexOf(v) === 0 || v.indexOf(n) === 0)) return s.id;
  }
  if (/\bmath/i.test(v)) return 'math';
  if (/\b(cs|comp|program|softw|code)/i.test(v)) return 'cs';
  if (/\becon/i.test(v)) return 'econ';
  if (/\bhist/i.test(v)) return 'history';
  if (/\b(lang|span|french|german|latin|english)/i.test(v)) return 'lang';
  return 'other';
}

function matchWorkType(raw, title) {
  const v = String(raw || '').trim().toLowerCase();
  if (WORK_TYPE_IDS.indexOf(v) !== -1) return v;
  for (const id of WORK_TYPE_IDS) {
    if (WORK_TYPES[id].name.toLowerCase() === v) return id;
  }
  const hay = `${title || ''} ${raw || ''}`;
  for (const [re, id] of WORK_KEYWORDS) {
    if (re.test(hay)) return id;
  }
  return 'project';
}

/** Absolute or relative due value → whole days from today. */
function parseDue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  let m = v.match(/^(-?\d+)\s*d(ays?)?$/);
  if (m) return parseInt(m[1], 10);
  if (v === 'today') return 0;
  if (v === 'tomorrow') return 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysTo = (d) => Math.round((d.getTime() - today.getTime()) / 86400000);

  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);          // 2026-09-14
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isFinite(d.getTime()) ? daysTo(d) : null;
  }
  m = v.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?$/); // 14/09 or 14/09/2026
  if (m) {
    let y = m[3] ? +m[3] : today.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && daysTo(d) < -180) d.setFullYear(y + 1);
    return Number.isFinite(d.getTime()) ? daysTo(d) : null;
  }
  m = v.match(/^([a-z]{3,9})\.?\s+(\d{1,2})$/) || v.match(/^(\d{1,2})\s+([a-z]{3,9})$/);
  if (m) {
    const monthStr = /^\d/.test(m[1]) ? m[2] : m[1];
    const dayStr = /^\d/.test(m[1]) ? m[1] : m[2];
    const mi = MONTHS.indexOf(monthStr.slice(0, 3));
    if (mi === -1) return null;
    const d = new Date(today.getFullYear(), mi, +dayStr);
    if (daysTo(d) < -180) d.setFullYear(today.getFullYear() + 1);
    return daysTo(d);
  }
  return null;
}

function clampDiff(v, fallback) {
  const n = Math.round(num(v, fallback === undefined ? 3 : fallback));
  return Math.max(1, Math.min(5, n || 3));
}

function clampMinutes(v, fallback) {
  const n = Math.round(num(v, fallback === undefined ? 60 : fallback));
  return Math.max(5, Math.min(1440, n || 60));
}

/** Pull the loose fields out of an object with any of the accepted key names. */
function fromObject(o) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
      const lower = Object.keys(o).find((kk) => kk.toLowerCase() === k.toLowerCase());
      if (lower && o[lower] !== undefined && o[lower] !== null && o[lower] !== '') return o[lower];
    }
    return undefined;
  };
  const title = String(pick('title', 'name', 'assignment', 'task') || '').trim();
  if (!title) return null;
  let minutes = pick('estMinutes', 'minutes', 'est', 'duration');
  const hours = pick('hours');
  if ((minutes === undefined || minutes === '') && hours !== undefined) {
    minutes = num(hours, 1) * 60;
  }
  return {
    title,
    subject: matchSubject(pick('subject', 'course', 'class', 'module')),
    workType: matchWorkType(pick('workType', 'type', 'kind'), title),
    difficulty: clampDiff(pick('difficulty', 'diff', 'level')),
    estMinutes: clampMinutes(minutes),
    dueInDays: parseDue(pick('dueInDays', 'due', 'dueDate', 'deadline')),
  };
}

/** `Essay on Rome (History, writing, d3, 120m, due 5d)` → fields. */
function fromLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  let title = raw;
  let inner = '';
  const m = raw.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (m && m[2].indexOf(',') !== -1) {
    title = m[1].trim();
    inner = m[2];
  }
  if (!title) return null;

  let subject;
  let workType;
  let difficulty;
  let minutes;
  let due;

  for (const partRaw of inner.split(',')) {
    const part = partRaw.trim();
    if (!part) continue;
    let mm;
    if ((mm = part.match(/^d(?:iff)?\s*([1-5])$/i))) { difficulty = +mm[1]; continue; }
    if ((mm = part.match(/^(\d+)\s*m(in(ute)?s?)?$/i))) { minutes = +mm[1]; continue; }
    if ((mm = part.match(/^(\d+(?:\.\d+)?)\s*h(ours?|rs?)?$/i))) { minutes = Math.round(+mm[1] * 60); continue; }
    if ((mm = part.match(/^due\s+(.+)$/i))) { due = parseDue(mm[1]); continue; }
    if (workType === undefined && WORK_TYPE_IDS.indexOf(part.toLowerCase()) !== -1) {
      workType = part.toLowerCase();
      continue;
    }
    if (subject === undefined) {
      const s = matchSubject(part);
      if (s !== 'other') { subject = s; continue; }
    }
    if (workType === undefined) {
      const w = WORK_TYPE_IDS.find((id) => WORK_TYPES[id].name.toLowerCase() === part.toLowerCase());
      if (w) { workType = w; continue; }
    }
  }

  return {
    title,
    subject: subject || matchSubject(''),
    workType: workType || matchWorkType('', title),
    difficulty: clampDiff(difficulty),
    estMinutes: clampMinutes(minutes),
    dueInDays: due === undefined ? null : due,
  };
}

function splitCells(line, delim) {
  // Minimal CSV: honours "quoted, cells" but nothing more exotic.
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { quoted = false; }
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function detectFormat(text) {
  const t = String(text || '').trim();
  if (!t) return 'empty';
  if (t[0] === '[' || t[0] === '{') return 'json';
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  const checkish = lines.filter((l) => /^\s*[-*]\s*\[[ xX]?\]/.test(l)).length;
  if (checkish >= Math.max(1, Math.ceil(lines.length * 0.4))) return 'md';
  const first = lines[0] || '';
  if (lines.length >= 2 && /(title|name|assignment|task)/i.test(first)) {
    if (first.indexOf('\t') !== -1 || first.indexOf(',') !== -1 || first.indexOf(';') !== -1) {
      return 'csv';
    }
  }
  return 'lines';
}

/**
 * Client-side dry run. Deliberately mirrors the documented server rules, but
 * the server is authoritative — this only exists so you can look first.
 */
function parsePreview(text) {
  const tasks = [];
  const skipped = [];
  const format = detectFormat(text);
  const raw = String(text || '');

  if (format === 'empty') return { format, tasks, skipped };

  if (format === 'json') {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      skipped.push({ line: raw.slice(0, 90), reason: `not valid JSON — ${(err && err.message) || err}` });
      return { format, tasks, skipped };
    }
    const arr = Array.isArray(data) ? data : (data && Array.isArray(data.tasks) ? data.tasks : null);
    if (!arr) {
      skipped.push({ line: raw.slice(0, 90), reason: 'JSON is neither an array nor { tasks: [ … ] }' });
      return { format, tasks, skipped };
    }
    arr.forEach((o, i) => {
      if (!o || typeof o !== 'object') {
        skipped.push({ line: `item ${i + 1}`, reason: 'not an object' });
        return;
      }
      const t = fromObject(o);
      if (t) tasks.push(t);
      else skipped.push({ line: `item ${i + 1}`, reason: 'no title / name / assignment field' });
    });
    return { format, tasks, skipped };
  }

  const lines = raw.split(/\r?\n/);

  if (format === 'csv') {
    const nonEmpty = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim());
    const header = nonEmpty[0].l;
    const delim = header.indexOf('\t') !== -1 ? '\t'
      : (header.split(';').length > header.split(',').length ? ';' : ',');
    const cols = splitCells(header, delim).map((c) => c.toLowerCase());
    for (const { l, i } of nonEmpty.slice(1)) {
      const cells = splitCells(l, delim);
      const o = {};
      cols.forEach((c, ci) => { if (c) o[c] = cells[ci]; });
      const t = fromObject(o);
      if (t) tasks.push(t);
      else skipped.push({ line: `line ${i + 1}: ${l.slice(0, 70)}`, reason: 'no title column value' });
    }
    return { format, tasks, skipped };
  }

  // markdown checklist and plain lines share a path
  lines.forEach((lineRaw, i) => {
    const line = lineRaw.trim();
    if (!line) return;
    if (/^#{1,6}\s/.test(line)) return;                       // a heading is not a task
    let body = line;
    const box = line.match(/^[-*]\s*\[([ xX]?)\]\s*(.*)$/);
    if (box) {
      if (box[1].toLowerCase() === 'x') {
        skipped.push({ line: `line ${i + 1}: ${line.slice(0, 70)}`, reason: 'already ticked off' });
        return;
      }
      body = box[2].trim();
    } else if (format === 'md') {
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet) body = bullet[1].trim();
    }
    if (!body) {
      skipped.push({ line: `line ${i + 1}: ${line.slice(0, 70)}`, reason: 'empty after the checkbox' });
      return;
    }
    if (body.length < 3) {
      skipped.push({ line: `line ${i + 1}: ${body}`, reason: 'too short to be a task title' });
      return;
    }
    const t = fromLine(body);
    if (t) tasks.push(t);
    else skipped.push({ line: `line ${i + 1}: ${body.slice(0, 70)}`, reason: 'could not read a title' });
  });

  return { format, tasks, skipped };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.sq-import-scrim {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(8,9,14,0.72);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 56px 16px 16px;
  overflow: auto;
  font-family: ${MONO};
  letter-spacing: 0.06em;
  color: ${PALETTE.text};
  image-rendering: pixelated;
}
.sq-import-scrim[hidden] { display: none; }
.sq-import-panel {
  position: relative;
  width: 100%; max-width: 860px;
  max-height: calc(100vh - 72px);
  display: flex; flex-direction: column;
  background: ${PALETTE.panel};
  border: 3px solid ${PALETTE.border};
  box-shadow: 7px 7px 0 rgba(0,0,0,0.7);
}
.sq-import-head {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: ${PALETTE.panelLight};
  border-bottom: 3px solid ${PALETTE.border};
}
.sq-import-title { font-size: 14px; font-weight: 700; color: ${PALETTE.accent}; }
.sq-import-x {
  font-family: ${MONO}; font-size: 14px; line-height: 1;
  padding: 4px 9px; cursor: pointer;
  background: ${PALETTE.panel}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
  box-shadow: 2px 2px 0 rgba(0,0,0,0.6);
}
.sq-import-x:hover { background: ${PALETTE.bad}; color: ${PALETTE.bg}; }
.sq-import-body {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 14px;
  display: flex; flex-direction: column; gap: 14px;
}

.sq-import-lead { font-size: 10px; color: ${PALETTE.textDim}; line-height: 1.6; }

.sq-import-ta {
  font-family: ${MONO}; letter-spacing: 0.04em; font-size: 11px; line-height: 1.6;
  width: 100%; box-sizing: border-box;
  min-height: 190px; resize: vertical;
  padding: 9px 10px;
  background: ${PALETTE.bg}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
}
.sq-import-ta:focus { outline: none; border-color: ${PALETTE.accent}; }

.sq-import-formats { border: 2px solid ${PALETTE.border}; }
.sq-import-fhead {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; text-align: left; cursor: pointer;
  font-family: ${MONO}; letter-spacing: 0.1em; font-size: 10px;
  padding: 7px 10px;
  color: ${PALETTE.textDim};
  background: ${PALETTE.panelLight};
  border: 0;
}
.sq-import-fhead:hover { color: ${PALETTE.accent}; }
.sq-import-flist { padding: 10px; display: flex; flex-direction: column; gap: 9px; }
.sq-import-flist[hidden] { display: none; }
.sq-import-fmt { border-left: 3px solid ${PALETTE.border}; padding-left: 9px; }
.sq-import-fmt.sq-import-detected { border-left-color: ${PALETTE.good}; }
.sq-import-fname { font-size: 10px; color: ${PALETTE.text}; }
.sq-import-fname .sq-import-tag {
  font-size: 8px; color: ${PALETTE.good};
  border: 2px solid ${PALETTE.good}; padding: 1px 5px; margin-left: 7px;
}
.sq-import-fhint { font-size: 9px; color: ${PALETTE.textDim}; margin: 2px 0 4px; }
.sq-import-fex {
  font-size: 9px; color: ${PALETTE.accent};
  background: ${PALETTE.bg};
  border: 2px solid ${PALETTE.border};
  padding: 5px 7px;
  white-space: pre-wrap; word-break: break-word;
  line-height: 1.5;
}

.sq-import-row { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; }
.sq-import-btn {
  font-family: ${MONO}; letter-spacing: 0.08em;
  font-size: 11px; padding: 7px 14px; cursor: pointer;
  background: ${PALETTE.panelLight}; color: ${PALETTE.text};
  border: 2px solid ${PALETTE.border};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.6);
}
.sq-import-btn:hover:not(:disabled) { background: ${PALETTE.accent}; color: ${PALETTE.bg}; }
.sq-import-btn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 1px 1px 0 rgba(0,0,0,0.6); }
.sq-import-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.sq-import-btn.sq-import-go { background: ${PALETTE.good}; color: ${PALETTE.bg}; border-color: ${PALETTE.good}; }
.sq-import-btn.sq-import-quiet { font-size: 10px; padding: 5px 10px; box-shadow: 2px 2px 0 rgba(0,0,0,0.6); }
.sq-import-detect { font-size: 9px; color: ${PALETTE.textDim}; }
.sq-import-detect b { color: ${PALETTE.good}; font-weight: 400; }

.sq-import-section { border: 2px solid ${PALETTE.border}; }
.sq-import-section[hidden] { display: none; }
.sq-import-shead {
  padding: 7px 10px; font-size: 10px;
  background: ${PALETTE.panelLight};
  border-bottom: 2px solid ${PALETTE.border};
  color: ${PALETTE.textDim};
}
.sq-import-sbody { padding: 10px; display: flex; flex-direction: column; gap: 8px; }

.sq-import-card {
  display: flex; align-items: stretch;
  background: ${PALETTE.bg};
  border: 2px solid ${PALETTE.border};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.5);
}
.sq-import-stripe { width: 7px; flex: 0 0 7px; background: ${PALETTE.border}; }
.sq-import-cmain { flex: 1 1 auto; padding: 7px 10px; min-width: 0; }
.sq-import-ctitle { font-size: 11px; margin-bottom: 5px; word-break: break-word; }
.sq-import-meta { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.sq-import-badge {
  font-size: 9px; padding: 2px 6px;
  border: 2px solid ${PALETTE.border};
  color: ${PALETTE.textDim};
  background: ${PALETTE.panelLight};
}
.sq-import-pips { font-size: 10px; color: ${PALETTE.accent}; letter-spacing: 0.14em; }
.sq-import-mins { font-size: 9px; color: ${PALETTE.textDim}; font-variant-numeric: tabular-nums; }
.sq-import-due {
  font-size: 9px; padding: 2px 6px;
  border: 2px solid ${PALETTE.good}; color: ${PALETTE.good};
}
.sq-import-due.sq-import-urgent { border-color: ${PALETTE.bad}; color: ${PALETTE.bad}; }

/* ---- skipped lines are the whole point of showing a result at all ---- */
.sq-import-result {
  border: 3px solid ${PALETTE.good};
  background: ${PALETTE.bg};
  padding: 12px;
}
.sq-import-result[hidden] { display: none; }
.sq-import-rbig {
  font-size: 22px; font-weight: 800; color: ${PALETTE.good};
  font-variant-numeric: tabular-nums;
  text-shadow: 3px 3px 0 rgba(0,0,0,0.6);
}
.sq-import-rsub { font-size: 10px; color: ${PALETTE.textDim}; margin-top: 4px; }
.sq-import-result.sq-import-rbad { border-color: ${PALETTE.bad}; }
.sq-import-result.sq-import-rbad .sq-import-rbig { color: ${PALETTE.bad}; }

.sq-import-skipwrap { border: 3px solid ${PALETTE.bad}; }
.sq-import-skipwrap[hidden] { display: none; }
.sq-import-skiphead {
  padding: 7px 10px; font-size: 10px;
  color: ${PALETTE.bad};
  background: ${PALETTE.panelLight};
  border-bottom: 2px solid ${PALETTE.bad};
}
.sq-import-skipbody { padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.sq-import-skip {
  display: flex; gap: 9px; flex-wrap: wrap; align-items: baseline;
  font-size: 9px;
  padding-bottom: 5px;
  border-bottom: 1px solid ${PALETTE.border};
}
.sq-import-skip:last-child { border-bottom: 0; padding-bottom: 0; }
.sq-import-skipline {
  flex: 1 1 240px; min-width: 0;
  color: ${PALETTE.text}; word-break: break-word;
}
.sq-import-skipwhy { flex: 0 0 auto; color: ${PALETTE.bad}; }

.sq-import-empty { font-size: 10px; color: ${PALETTE.textDim}; padding: 4px 0; }
.sq-import-note { font-size: 9px; color: ${PALETTE.textDim}; line-height: 1.6; }

.sq-import-toast {
  position: absolute; left: 14px; right: 14px; bottom: 10px;
  padding: 8px 10px; font-size: 11px;
  background: ${PALETTE.bg}; color: ${PALETTE.bad};
  border: 2px solid ${PALETTE.bad};
  box-shadow: 3px 3px 0 rgba(0,0,0,0.6);
  z-index: 5;
}
.sq-import-toast[hidden] { display: none; }
.sq-import-toast.sq-import-ok { color: ${PALETTE.good}; border-color: ${PALETTE.good}; }
`;
  document.head.appendChild(s);
}

export function createImporter(root, api) {
  injectStyle();

  const host = root || document.body;
  let state = null;
  let open = false;
  let busy = false;
  let preview = null;      // { format, tasks, skipped } from the client dry run
  let result = null;       // { imported, skipped } as reported by the server

  // ---- shell ---------------------------------------------------------------
  const scrim = el('div', 'sq-import-scrim');
  scrim.hidden = true;
  const panel = el('div', 'sq-import-panel');
  scrim.appendChild(panel);

  const head = el('div', 'sq-import-head');
  head.appendChild(el('div', 'sq-import-title', 'IMPORT SYLLABUS'));
  const xBtn = el('button', 'sq-import-x', '✕');
  xBtn.type = 'button';
  head.appendChild(xBtn);
  panel.appendChild(head);

  const body = el('div', 'sq-import-body');
  panel.appendChild(body);

  const toast = el('div', 'sq-import-toast');
  toast.hidden = true;
  panel.appendChild(toast);

  host.appendChild(scrim);

  let toastTimer = 0;
  function showToast(msg, ok) {
    toast.textContent = String(msg || '');
    toast.classList.toggle('sq-import-ok', !!ok);
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }

  // ---- lead + textarea -----------------------------------------------------
  body.appendChild(el('div', 'sq-import-lead',
    'Paste the real thing — a course page, a reading list, an export from whatever '
    + 'you already use. Every line becomes a quest, and anything unreadable is '
    + 'listed back to you rather than quietly dropped.'));

  const ta = el('textarea', 'sq-import-ta');
  ta.placeholder = SAMPLE;
  ta.spellcheck = false;
  ta.setAttribute('aria-label', 'Syllabus text to import');
  body.appendChild(ta);

  // ---- format hints (open by default: this is the instruction manual) ------
  const formats = el('div', 'sq-import-formats');
  const fHead = el('button', 'sq-import-fhead');
  fHead.type = 'button';
  fHead.appendChild(el('span', null, 'FOUR SHAPES ARE ACCEPTED — FORMAT IS AUTO-DETECTED'));
  const fMark = el('span', null, '▾');
  fHead.appendChild(fMark);
  formats.appendChild(fHead);
  const fList = el('div', 'sq-import-flist');
  formats.appendChild(fList);
  const fmtNodes = {};
  for (const f of FORMAT_HINTS) {
    const box = el('div', 'sq-import-fmt');
    const nameLine = el('div', 'sq-import-fname');
    nameLine.appendChild(el('span', null, f.name));
    const tag = el('span', 'sq-import-tag', 'DETECTED');
    tag.hidden = true;
    nameLine.appendChild(tag);
    box.appendChild(nameLine);
    box.appendChild(el('div', 'sq-import-fhint', f.hint));
    box.appendChild(el('div', 'sq-import-fex', f.example));
    fList.appendChild(box);
    fmtNodes[f.id] = { box, tag };
  }
  let fOpen = true;
  fHead.addEventListener('click', () => {
    fOpen = !fOpen;
    fList.hidden = !fOpen;
    fMark.textContent = fOpen ? '▾' : '▸';
  });
  body.appendChild(formats);

  // ---- action row ----------------------------------------------------------
  const row = el('div', 'sq-import-row');
  const previewBtn = el('button', 'sq-import-btn', 'PREVIEW');
  previewBtn.type = 'button';
  const importBtn = el('button', 'sq-import-btn sq-import-go', 'IMPORT');
  importBtn.type = 'button';
  const sampleBtn = el('button', 'sq-import-btn sq-import-quiet', 'Paste a sample');
  sampleBtn.type = 'button';
  const clearBtn = el('button', 'sq-import-btn sq-import-quiet', 'Clear');
  clearBtn.type = 'button';
  const detect = el('div', 'sq-import-detect', '');
  row.appendChild(previewBtn);
  row.appendChild(importBtn);
  row.appendChild(sampleBtn);
  row.appendChild(clearBtn);
  row.appendChild(detect);
  body.appendChild(row);

  // ---- result banner (imported N) -----------------------------------------
  const resultBox = el('div', 'sq-import-result');
  resultBox.hidden = true;
  const resultBig = el('div', 'sq-import-rbig', '');
  const resultSub = el('div', 'sq-import-rsub', '');
  resultBox.appendChild(resultBig);
  resultBox.appendChild(resultSub);
  body.appendChild(resultBox);

  // ---- skipped lines -------------------------------------------------------
  const skipWrap = el('div', 'sq-import-skipwrap');
  skipWrap.hidden = true;
  const skipHead = el('div', 'sq-import-skiphead', 'SKIPPED');
  skipWrap.appendChild(skipHead);
  const skipBody = el('div', 'sq-import-skipbody');
  skipWrap.appendChild(skipBody);
  body.appendChild(skipWrap);

  // ---- preview list --------------------------------------------------------
  const previewSection = el('div', 'sq-import-section');
  previewSection.hidden = true;
  const previewHead = el('div', 'sq-import-shead', 'WOULD BE IMPORTED');
  previewSection.appendChild(previewHead);
  const previewBody = el('div', 'sq-import-sbody');
  previewSection.appendChild(previewBody);
  body.appendChild(previewSection);

  body.appendChild(el('div', 'sq-import-note',
    'The preview is this client reading your text the same way the server does. '
    + 'The server has the last word — after importing, the counts and skipped '
    + 'lines shown are the ones it actually applied.'));

  // ---- rendering -----------------------------------------------------------
  function pips(n) {
    const d = Math.max(0, Math.min(5, Math.round(num(n, 1))));
    return '●'.repeat(d) + '○'.repeat(5 - d);
  }

  function taskCard(t) {
    const subj = subjectOf(t.subject);
    const card = el('div', 'sq-import-card');
    const stripe = el('div', 'sq-import-stripe');
    stripe.style.background = subj.color;
    card.appendChild(stripe);

    const main = el('div', 'sq-import-cmain');
    main.appendChild(el('div', 'sq-import-ctitle', t.title || '(untitled)'));
    const meta = el('div', 'sq-import-meta');
    const sb = el('span', 'sq-import-badge', subj.name);
    sb.style.color = subj.color;
    sb.style.borderColor = subj.color;
    meta.appendChild(sb);
    const w = WORK_TYPES[t.workType];
    meta.appendChild(el('span', 'sq-import-badge', (w && w.name) || String(t.workType || '—')));
    meta.appendChild(el('span', 'sq-import-pips', pips(t.difficulty)));
    meta.appendChild(el('span', 'sq-import-mins', `${Math.round(num(t.estMinutes, 0))} min`));
    if (t.dueInDays !== null && t.dueInDays !== undefined && Number.isFinite(Number(t.dueInDays))) {
      const d = Number(t.dueInDays);
      meta.appendChild(el('span', `sq-import-due${d <= 1 ? ' sq-import-urgent' : ''}`,
        d < 0 ? `${Math.abs(d)}d late` : (d === 0 ? 'due today' : `${d}d left`)));
    } else {
      meta.appendChild(el('span', 'sq-import-badge', 'no due date'));
    }
    main.appendChild(meta);
    card.appendChild(main);
    return card;
  }

  function normSkipped(list) {
    if (!Array.isArray(list)) return [];
    return list.map((s) => {
      if (typeof s === 'string') return { line: s, reason: 'not accepted' };
      if (s && typeof s === 'object') {
        return {
          line: String(s.line !== undefined ? s.line
            : (s.text !== undefined ? s.text : (s.raw !== undefined ? s.raw : ''))) || '(blank)',
          reason: String(s.reason || s.why || s.error || 'not accepted'),
        };
      }
      return { line: String(s), reason: 'not accepted' };
    });
  }

  function renderSkipped(list, headline) {
    const items = normSkipped(list);
    skipBody.textContent = '';
    if (!items.length) { skipWrap.hidden = true; return; }
    skipWrap.hidden = false;
    skipHead.textContent = `${headline} — ${items.length} LINE${items.length === 1 ? '' : 'S'} NOT IMPORTED`;
    for (const s of items) {
      const rowEl = el('div', 'sq-import-skip');
      rowEl.appendChild(el('div', 'sq-import-skipline', s.line));
      rowEl.appendChild(el('div', 'sq-import-skipwhy', s.reason));
      skipBody.appendChild(rowEl);
    }
  }

  function renderPreview() {
    previewBody.textContent = '';
    if (!preview) { previewSection.hidden = true; return; }
    previewSection.hidden = false;
    const n = preview.tasks.length;
    previewHead.textContent = `WOULD BE IMPORTED — ${n} QUEST${n === 1 ? '' : 'S'} (nothing saved yet)`;
    if (!n) {
      previewBody.appendChild(el('div', 'sq-import-empty',
        'Nothing readable in there yet. Check the accepted shapes above.'));
      return;
    }
    for (const t of preview.tasks.slice(0, 60)) {
      try { previewBody.appendChild(taskCard(t)); } catch (e) { /* skip malformed */ }
    }
    if (n > 60) {
      previewBody.appendChild(el('div', 'sq-import-empty', `…and ${n - 60} more.`));
    }
  }

  function paintDetect() {
    const text = ta.value;
    const fmt = detectFormat(text);
    const map = { json: 'json', csv: 'csv', md: 'md', lines: 'lines' };
    for (const f of FORMAT_HINTS) {
      const hit = map[fmt] === f.id;
      fmtNodes[f.id].box.classList.toggle('sq-import-detected', hit);
      fmtNodes[f.id].tag.hidden = !hit;
    }
    const label = {
      empty: '', json: 'JSON', csv: 'CSV / TSV', md: 'markdown checklist', lines: 'plain lines',
    }[fmt] || '';
    detect.textContent = '';
    if (label) {
      detect.appendChild(document.createTextNode('reads as '));
      detect.appendChild(el('b', null, label));
    }
    // Deliberately NOT gated on emptiness: a paste that arrives without an
    // input event would otherwise leave the buttons dead. Emptiness is checked
    // at click time instead, where it can be explained.
    previewBtn.disabled = busy;
    importBtn.disabled = busy;
    clearBtn.disabled = busy;
  }

  ta.addEventListener('input', () => {
    // Typing invalidates a stale preview rather than leaving a lie on screen.
    if (preview) { preview = null; renderPreview(); }
    if (result) { result = null; resultBox.hidden = true; skipWrap.hidden = true; }
    paintDetect();
  });

  // A paste from the clipboard fires `input`, but a drop or a programmatic
  // fill may not — re-read on every event that can change the box.
  ta.addEventListener('change', paintDetect);
  ta.addEventListener('paste', () => setTimeout(paintDetect, 0));
  ta.addEventListener('drop', () => setTimeout(paintDetect, 0));

  previewBtn.addEventListener('click', () => {
    if (!String(ta.value || '').trim()) {
      showToast('Paste your syllabus into the box first.');
      ta.focus();
      return;
    }
    try {
      paintDetect();
      preview = parsePreview(ta.value);
      result = null;
      resultBox.hidden = true;
      renderPreview();
      renderSkipped(preview.skipped, 'PREVIEW');
      previewSection.scrollIntoView({ block: 'nearest' });
      showToast(
        `${preview.tasks.length} would be imported, ${preview.skipped.length} skipped. Nothing saved yet.`,
        true);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-import] preview', err);
      showToast('Could not read that text.');
    }
  });

  sampleBtn.addEventListener('click', () => {
    ta.value = SAMPLE;
    preview = null;
    result = null;
    resultBox.hidden = true;
    renderPreview();
    renderSkipped([], 'PREVIEW');
    paintDetect();
    ta.focus();
  });

  clearBtn.addEventListener('click', () => {
    ta.value = '';
    preview = null;
    result = null;
    resultBox.hidden = true;
    renderPreview();
    renderSkipped([], 'PREVIEW');
    paintDetect();
    ta.focus();
  });

  importBtn.addEventListener('click', async () => {
    const text = String(ta.value || '');
    if (busy) return;
    if (!text.trim()) {
      showToast('Nothing to import — the box is empty.');
      ta.focus();
      return;
    }
    busy = true;
    importBtn.textContent = 'IMPORTING…';
    paintDetect();
    try {
      const res = await api.importTasks(text);
      if (res && res.ok) {
        const imported = Math.max(0, Math.round(num(
          res.imported !== undefined ? res.imported : (res.count !== undefined ? res.count : 0), 0)));
        const skipped = normSkipped(res.skipped);
        result = { imported, skipped };
        // The server's answer replaces the client guess entirely.
        preview = null;
        renderPreview();
        resultBox.hidden = false;
        resultBox.classList.toggle('sq-import-rbad', imported === 0);
        resultBig.textContent = `imported ${imported}`;
        resultSub.textContent = imported === 0
          ? 'Nothing was added. Every line is listed below with the reason.'
          : `${imported} quest${imported === 1 ? '' : 's'} added to your log`
            + (skipped.length ? ` · ${skipped.length} line${skipped.length === 1 ? '' : 's'} skipped` : ' · nothing skipped');
        renderSkipped(skipped, 'SERVER');
        resultBox.scrollIntoView({ block: 'nearest' });
        if (imported > 0) {
          ta.value = '';
          showToast(`imported ${imported}`, true);
        }
        if (res.state) setState(res.state);
      } else {
        showToast((res && res.error) || 'The server refused the import.');
      }
    } catch (err) {
      showToast(String((err && err.message) || err));
    } finally {
      busy = false;
      importBtn.textContent = 'IMPORT';
      paintDetect();
    }
  });

  // ---- panel plumbing ------------------------------------------------------
  function setState(next) {
    try {
      state = next || null;
      void state;
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[sq-import] setState', err);
    }
  }

  function doOpen() {
    open = true;
    scrim.hidden = false;
    body.scrollTop = 0;
    paintDetect();
    ta.focus();
  }

  function doClose() {
    open = false;
    scrim.hidden = true;
    toast.hidden = true;
  }

  function toggle() { if (open) doClose(); else doOpen(); }

  xBtn.addEventListener('click', doClose);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) doClose(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) doClose(); });

  paintDetect();

  return {
    setState,
    toggle,
    open: doOpen,
    close: doClose,
    isOpen: () => open,
  };
}

export default createImporter;
