// server/import.js  [AGENT-F]
// Turn a blob of real syllabus text into task drafts.
//
// This is fed by a human pasting from a PDF, a Notion export, a spreadsheet or
// their own notes, so it must survive BOM characters, smart quotes, CRLF,
// trailing commas in JSON, ragged CSV rows and blank lines. Nothing that has
// content is ever dropped silently: a line either becomes a task or lands in
// `skipped` with a reason a person can act on.

import { SUBJECTS, WORK_TYPE_IDS, WORK_TYPES } from '../shared/constants.js';

export const MAX_IMPORT = 200;

const SUBJECT_IDS = SUBJECTS.map((s) => s.id);

// ---------------------------------------------------------------- text hygiene

/** Strip BOM, normalise newlines, and fold typographic punctuation to ASCII. */
export function cleanText(raw) {
  let t = typeof raw === 'string' ? raw : '';
  t = t.replace(/^\uFEFF/, '');
  t = t.replace(/\uFEFF/g, '');
  t = t.replace(/\r\n?/g, '\n');
  t = t.replace(/[\u2018\u2019\u201B\u2032]/g, "'");
  t = t.replace(/[\u201C\u201D\u201F\u2033]/g, '"');
  t = t.replace(/[\u2013\u2014\u2212]/g, '-');
  t = t.replace(/\u2026/g, '...');
  t = t.replace(/\u00A0/g, ' ');
  return t;
}

// ---------------------------------------------------------------- vocab

const SUBJECT_ALIASES = {
  math: ['math', 'maths', 'mathematics', 'calculus', 'calc', 'algebra', 'geometry', 'statistics', 'stats', 'analysis'],
  cs: ['cs', 'compsci', 'comp sci', 'computer science', 'computing', 'programming', 'software', 'informatics', 'algorithms'],
  econ: ['econ', 'economics', 'macro', 'macroeconomics', 'micro', 'microeconomics', 'finance', 'accounting', 'business'],
  history: ['history', 'hist', 'historia', 'classics', 'politics', 'geography', 'philosophy'],
  lang: ['lang', 'language', 'languages', 'english', 'spanish', 'french', 'german', 'italian', 'latin', 'literature', 'lit'],
  other: ['other', 'misc', 'general'],
};

/** Keyword -> workType. Order matters: the first match in the title wins. */
const WORKTYPE_KEYWORDS = [
  ['lab', /\b(lab|labs|laboratory|experiment|practical|dissection|titration|fieldwork)\b/i],
  // practice is tested before writing so "past paper" is not read as an essay
  ['practice', /\b(problem set|problem-set|psets?|p-set|exercises?|exercise|drills?|practice|worksheet|questions?|homework|hw|past ?papers?|mock ?exam)\b/i],
  ['writing', /\b(essay|report|write|writing|dissertation|thesis|memo|reflection|commentary|write-?up|(?:term|research|position|seminar) paper)\b/i],
  ['reading', /\b(read|reading|chapter|ch\.?\s?\d|pages?|pp\.|textbook|article|paper to read|literature review|annotate)\b/i],
  ['revision', /\b(revise|revision|review|recap|flashcards?|memoris|memoriz|exam prep|study for|quiz prep|test prep)\b/i],
  ['project', /\b(project|build|implement|prototype|presentation|slides|poster|design|coursework|portfolio)\b/i],
];

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

// ---------------------------------------------------------------- field coercion

export function normalizeSubject(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (SUBJECT_IDS.includes(v)) return v;
  for (const s of SUBJECTS) {
    if (s.name.toLowerCase() === v) return s.id;
  }
  for (const [id, aliases] of Object.entries(SUBJECT_ALIASES)) {
    for (const a of aliases) {
      if (v === a || v.startsWith(`${a} `) || v.includes(a)) return id;
    }
  }
  return null;
}

export function normalizeWorkType(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (WORK_TYPE_IDS.includes(v)) return v;
  for (const id of WORK_TYPE_IDS) {
    if ((WORK_TYPES[id].name || '').toLowerCase() === v) return id;
  }
  const synonyms = {
    read: 'reading', write: 'writing', essay: 'writing', paper: 'writing',
    exercise: 'practice', exercises: 'practice', homework: 'practice',
    problemset: 'practice', 'problem set': 'practice', pset: 'practice',
    revise: 'revision', review: 'revision', study: 'revision',
    experiment: 'lab', practical: 'lab',
    build: 'project', coursework: 'project', presentation: 'project',
  };
  return synonyms[v] || null;
}

/** No explicit work type? Guess from the words in the title. */
export function inferWorkType(title) {
  const t = String(title || '');
  for (const [id, re] of WORKTYPE_KEYWORDS) {
    if (re.test(t)) return id;
  }
  return 'project';
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function normalizeDifficulty(value) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim().toLowerCase();
  const named = { trivial: 1, easy: 2, medium: 3, moderate: 3, normal: 3, hard: 4, brutal: 5, extreme: 5 };
  if (named[s] !== undefined) return named[s];
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.round(n), 1, 5);
}

/** Accepts 90, "90", "90m", "1.5h", "1h30", "2 hours". */
export function normalizeMinutes(value, fieldName = '') {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim().toLowerCase();

  const hm = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(\d+)?\s*(?:m(?:in(?:utes?)?)?)?$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = hm[2] ? Number(hm[2]) : 0;
    if (Number.isFinite(h)) return clamp(Math.round(h * 60 + m), 5, 1440);
  }
  const mm = s.match(/^(\d+(?:\.\d+)?)\s*(?:m(?:in(?:utes?)?)?)?$/);
  if (mm) {
    let n = Number(mm[1]);
    if (!Number.isFinite(n)) return null;
    // a bare number in a column literally called "hours" means hours
    if (/hour|hrs?\b/.test(fieldName) && !/min/.test(fieldName)) n *= 60;
    return clamp(Math.round(n), 5, 1440);
  }
  const any = s.match(/(\d+(?:\.\d+)?)/);
  if (!any) return null;
  return clamp(Math.round(Number(any[1])), 5, 1440);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * "5", "5d", "in 3 days", "tomorrow", "2026-09-14", "14/09", "Sept 14",
 * "14 September" -> a whole number of days from today. Returns null when the
 * value carries no usable date at all.
 */
export function normalizeDue(value, now = new Date()) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim().toLowerCase().replace(/^due[:\s]*/, '').trim();
  if (!s) return null;

  if (/^(today|tonight)$/.test(s)) return 0;
  if (/^tomorrow$/.test(s)) return 1;
  if (/^(next week)$/.test(s)) return 7;

  // weekday names — real syllabi say "due Friday". Always the NEXT one.
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = s.match(/^(?:on\s+|next\s+|this\s+)?(sun|mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?)(?:day)?$/);
  if (wd) {
    const stem = wd[1];
    const idx = WEEKDAYS.findIndex((d) => d.startsWith(stem.replace(/s$/, '')) || stem.startsWith(d.slice(0, 3)));
    if (idx >= 0) {
      const delta = (idx - now.getDay() + 7) % 7;
      return delta === 0 ? 7 : delta; // "Friday" said on a Friday means next Friday
    }
  }

  // relative: 5, 5d, 5 days, "in 5 days", "3 weeks"
  const rel = s.match(/^(?:in\s+)?(\d+(?:\.\d+)?)\s*(d|days?|w|weeks?)?$/);
  if (rel) {
    const n = Number(rel[1]);
    if (Number.isFinite(n)) {
      const unit = rel[2] || 'd';
      const mult = /^w/.test(unit) ? 7 : 1;
      return clamp(Math.round(n * mult), 0, 365);
    }
  }

  const today = startOfDay(now);
  const toDays = (target) => clamp(Math.round((startOfDay(target) - today) / 86400000), 0, 365);

  // ISO: 2026-09-14
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) return toDays(d);
  }

  // D/M or D/M/Y (day first — the contract's example is "14/09")
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const mon = Number(dmy[2]) - 1;
    let year = dmy[3] ? Number(dmy[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) {
      let d = new Date(year, mon, day);
      // no year given and already past -> they mean next year
      if (!dmy[3] && startOfDay(d) < today) d = new Date(year + 1, mon, day);
      if (!Number.isNaN(d.getTime())) return toDays(d);
    }
  }

  // "Sept 14" / "14 Sept" / "September 14, 2026"
  const monthNames = Object.keys(MONTHS).join('|');
  const md = s.match(new RegExp(`^(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?$`));
  const dm = s.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?(?:[,\\s]+(\\d{4}))?$`));
  const hit = md ? { mon: MONTHS[md[1]], day: Number(md[2]), year: md[3] }
    : dm ? { mon: MONTHS[dm[2]], day: Number(dm[1]), year: dm[3] }
      : null;
  if (hit && hit.mon !== undefined && hit.day >= 1 && hit.day <= 31) {
    const year = hit.year ? Number(hit.year) : now.getFullYear();
    let d = new Date(year, hit.mon, hit.day);
    if (!hit.year && startOfDay(d) < today) d = new Date(year + 1, hit.mon, hit.day);
    if (!Number.isNaN(d.getTime())) return toDays(d);
  }

  return null;
}

// ---------------------------------------------------------------- draft builder

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^[-*•\u25CF\d.)\]\s]+/, '')
    .trim()
    .slice(0, 120);
}

/**
 * Build a normalised draft from loose fields. Returns { ok, task } or
 * { ok:false, reason }.
 */
function buildDraft(fields) {
  const title = cleanTitle(fields.title);
  if (!title) return { ok: false, reason: 'no title could be read from this line' };

  const subject = normalizeSubject(fields.subject) || 'other';
  const workType = normalizeWorkType(fields.workType) || inferWorkType(title);
  const difficulty = normalizeDifficulty(fields.difficulty);
  const estMinutes = normalizeMinutes(fields.estMinutes, fields.estMinutesField || '');
  const dueInDays = normalizeDue(fields.dueInDays);

  return {
    ok: true,
    task: {
      title,
      subject,
      workType,
      difficulty: difficulty === null ? 3 : difficulty,
      estMinutes: estMinutes === null ? 60 : estMinutes,
      dueInDays,
    },
  };
}

// ---------------------------------------------------------------- loose keys

const KEY_ALIASES = {
  title: ['title', 'name', 'assignment', 'task', 'item', 'work', 'description', 'what', 'deliverable'],
  subject: ['subject', 'course', 'class', 'module', 'topic', 'unit'],
  workType: ['worktype', 'work type', 'work_type', 'type', 'kind', 'category'],
  difficulty: ['difficulty', 'diff', 'level', 'hardness', 'weight'],
  estMinutes: ['estminutes', 'est minutes', 'est_minutes', 'minutes', 'mins', 'est', 'estimate', 'time', 'duration', 'hours', 'hrs'],
  dueInDays: ['dueindays', 'due in days', 'due_in_days', 'due', 'duedate', 'due date', 'due_date', 'deadline', 'when', 'date'],
};

function normKey(k) {
  return String(k || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** Map an object with arbitrary key spellings onto our canonical field names. */
function mapLooseObject(obj) {
  const out = { estMinutesField: '' };
  const entries = Object.entries(obj || {});
  for (const [canonical, aliases] of Object.entries(KEY_ALIASES)) {
    for (const [rawKey, rawVal] of entries) {
      const k = normKey(rawKey);
      if (aliases.includes(k) || aliases.includes(k.replace(/\s+/g, ''))) {
        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
        if (out[canonical] === undefined) {
          out[canonical] = rawVal;
          if (canonical === 'estMinutes') out.estMinutesField = k;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- JSON

/** JSON.parse, then a forgiving retry that strips trailing commas and // comments. */
function looseJsonParse(text) {
  try { return { ok: true, value: JSON.parse(text) }; } catch (e1) {
    let t = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    try { return { ok: true, value: JSON.parse(t) }; } catch (e2) {
      return { ok: false, error: e2.message || e1.message };
    }
  }
}

function parseJsonFormat(text, skipped) {
  const parsed = looseJsonParse(text.trim());
  if (!parsed.ok) {
    skipped.push({ line: text.trim().slice(0, 120), lineNo: 1, reason: `not valid JSON: ${parsed.error}` });
    return [];
  }
  let arr = parsed.value;
  if (arr && !Array.isArray(arr) && typeof arr === 'object') {
    arr = arr.tasks || arr.items || arr.assignments || arr.data || arr.rows;
  }
  if (!Array.isArray(arr)) {
    skipped.push({ line: text.trim().slice(0, 120), lineNo: 1, reason: 'JSON must be an array of tasks, or an object with a "tasks" array' });
    return [];
  }

  const out = [];
  arr.forEach((row, i) => {
    if (typeof row === 'string') {
      const d = buildDraft({ title: row });
      if (d.ok) out.push(d.task);
      else skipped.push({ line: row, lineNo: i + 1, reason: d.reason });
      return;
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      skipped.push({ line: JSON.stringify(row).slice(0, 120), lineNo: i + 1, reason: 'each entry must be an object or a string' });
      return;
    }
    const fields = mapLooseObject(row);
    const d = buildDraft(fields);
    if (d.ok) out.push(d.task);
    else skipped.push({ line: JSON.stringify(row).slice(0, 120), lineNo: i + 1, reason: d.reason });
  });
  return out;
}

// ---------------------------------------------------------------- CSV / TSV

const DELIMS = ['\t', ',', ';', '|'];

export function detectDelimiter(headerLine) {
  let best = ',';
  let bestCount = 0;
  for (const d of DELIMS) {
    // count only delimiters outside double quotes
    let count = 0;
    let inQ = false;
    for (let i = 0; i < headerLine.length; i += 1) {
      const c = headerLine[i];
      if (c === '"') inQ = !inQ;
      else if (c === d && !inQ) count += 1;
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return bestCount > 0 ? best : null;
}

function splitRow(line, delim) {
  const cells = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseCsvFormat(lines, skipped) {
  const first = lines[0];
  const delim = detectDelimiter(first.text) || ',';
  const header = splitRow(first.text, delim).map(normKey);

  // The header must actually name at least a title-ish column, otherwise this
  // isn't really a table and we should not eat the first row as a header.
  const looksLikeHeader = header.some((h) => KEY_ALIASES.title.includes(h))
    || header.some((h) => KEY_ALIASES.subject.includes(h) || KEY_ALIASES.dueInDays.includes(h));

  const out = [];
  const body = looksLikeHeader ? lines.slice(1) : lines;
  const cols = looksLikeHeader ? header : ['title', 'subject', 'worktype', 'difficulty', 'minutes', 'due'];

  for (const row of body) {
    const cells = splitRow(row.text, delim);
    if (cells.every((c) => c === '')) continue;
    const obj = {};
    cols.forEach((name, i) => {
      if (!name) return;
      if (cells[i] !== undefined) obj[name] = cells[i];
    });
    // extra cells beyond the header are ignored rather than fatal
    const fields = mapLooseObject(obj);
    if (fields.title === undefined && cells[0]) fields.title = cells[0];
    const d = buildDraft(fields);
    if (d.ok) out.push(d.task);
    else skipped.push({ line: row.text, lineNo: row.no, reason: d.reason });
  }
  return out;
}

// ---------------------------------------------------------------- md / plain

const CHECKBOX_RE = /^\s*(?:[-*+]|\d+[.)])\s*\[( |x|X)\]\s*(.*)$/;

/**
 * Pull "(History, writing, d3, 120m, due 5d)" off the end of a line and read
 * whatever it contains. Order-independent: each token is classified by shape.
 */
function parseParenMeta(text) {
  const m = text.match(/^(.*?)\s*[([{]([^)\]}]*)[)\]}]\s*$/);
  if (!m) return { title: text, meta: {} };
  const title = m[1].trim();
  const inner = m[2].trim();
  if (!title || !inner) return { title: text, meta: {} };

  const tokens = inner.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return { title: text, meta: {} };

  const meta = {};
  let recognised = 0;
  for (const tok of tokens) {
    const low = tok.toLowerCase();

    const dueM = low.match(/^(?:due|by|deadline)\s*[:\s]\s*(.+)$/);
    if (dueM) { meta.dueInDays = dueM[1]; recognised += 1; continue; }

    const diffM = low.match(/^(?:d|diff|difficulty)\s*[:=]?\s*(\d)$/);
    if (diffM) { meta.difficulty = diffM[1]; recognised += 1; continue; }

    if (/^\d+(?:\.\d+)?\s*(?:m|min|mins|minutes|h|hr|hrs|hour|hours)$/.test(low)) {
      meta.estMinutes = low; meta.estMinutesField = /h/.test(low.replace(/^\d+(\.\d+)?\s*/, '')) ? 'hours' : 'minutes';
      recognised += 1; continue;
    }

    const wt = normalizeWorkType(low);
    if (wt) { meta.workType = wt; recognised += 1; continue; }

    const sub = normalizeSubject(low);
    if (sub && sub !== 'other') { meta.subject = sub; recognised += 1; continue; }

    // a bare date or "5d"
    if (meta.dueInDays === undefined && normalizeDue(low) !== null) {
      meta.dueInDays = low; recognised += 1; continue;
    }
  }

  // If nothing in the brackets meant anything, it was part of the title.
  if (recognised === 0) return { title: text, meta: {} };
  return { title, meta };
}

function parseLooseLine(text) {
  const cb = text.match(CHECKBOX_RE);
  let body = cb ? cb[2] : text;
  const done = Boolean(cb && cb[1].toLowerCase() === 'x');

  const { title, meta } = parseParenMeta(body.trim());
  const fields = { ...meta, title };

  // "Read chapter 3 — due Friday" style trailing "due ..." without brackets
  if (fields.dueInDays === undefined) {
    const trailing = title.match(/^(.*?)[\s,–-]+(?:due|by|deadline)\s*[:\s]\s*([^,]+)$/i);
    if (trailing && normalizeDue(trailing[2]) !== null) {
      fields.title = trailing[1].trim();
      fields.dueInDays = trailing[2].trim();
    }
  }
  return { fields, done };
}

function parseLinesFormat(lines, skipped) {
  const out = [];
  for (const row of lines) {
    // markdown scaffolding that carries no task
    if (/^\s*#{1,6}\s/.test(row.text)) continue;
    if (/^\s*(?:[-*_=]\s*){3,}$/.test(row.text)) continue;
    if (/^\s*>\s*$/.test(row.text)) continue;

    const { fields } = parseLooseLine(row.text);
    const d = buildDraft(fields);
    if (d.ok) out.push(d.task);
    else skipped.push({ line: row.text, lineNo: row.no, reason: d.reason });
  }
  return out;
}

// ---------------------------------------------------------------- detection

export function detectFormat(text) {
  const t = text.trim();
  if (!t) return 'empty';
  if (t.startsWith('[') || t.startsWith('{')) return 'json';

  const lines = t.split('\n').filter((l) => l.trim());
  const checkboxes = lines.filter((l) => CHECKBOX_RE.test(l)).length;
  if (checkboxes >= 1 && checkboxes >= lines.length * 0.4) return 'markdown';

  const first = lines[0] || '';
  const delim = detectDelimiter(first);
  if (delim) {
    const headerCells = splitRow(first, delim).map(normKey);
    const named = headerCells.filter((h) => Object.values(KEY_ALIASES).some((a) => a.includes(h))).length;
    // a real table: a header that names our columns, and rows of the same width
    if (named >= 2) return 'csv';
    if (delim === '\t' && headerCells.length >= 2) return 'csv';
    if (named >= 1 && headerCells.length >= 3) return 'csv';
  }
  return 'plain';
}

// ---------------------------------------------------------------- entry point

/**
 * importTasks(text, formatHint) -> { ok, format, tasks, skipped }
 * `tasks` are normalised drafts ready for the task-create path.
 */
export function importTasks(rawText, formatHint) {
  const skipped = [];
  const text = cleanText(rawText);
  if (!text.trim()) {
    return { ok: false, error: 'there is nothing to import — paste some text first', format: 'empty', tasks: [], skipped };
  }

  const allowed = ['json', 'csv', 'markdown', 'plain'];
  const format = allowed.includes(formatHint) ? formatHint : detectFormat(text);

  const lines = text.split('\n')
    .map((t, i) => ({ text: t.replace(/\s+$/, ''), no: i + 1 }))
    .filter((l) => l.text.trim() !== ''); // blank lines carry no content

  let tasks = [];
  if (format === 'json') tasks = parseJsonFormat(text, skipped);
  else if (format === 'csv') tasks = parseCsvFormat(lines, skipped);
  else tasks = parseLinesFormat(lines, skipped);

  let truncated = 0;
  if (tasks.length > MAX_IMPORT) {
    truncated = tasks.length - MAX_IMPORT;
    tasks = tasks.slice(0, MAX_IMPORT);
    skipped.push({ line: `(+${truncated} more)`, lineNo: 0, reason: `only ${MAX_IMPORT} tasks can be imported at once` });
  }

  return { ok: true, format, tasks, skipped, truncated };
}
