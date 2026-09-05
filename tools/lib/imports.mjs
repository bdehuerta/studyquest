#!/usr/bin/env node
// tools/lib/imports.mjs — does every ESM import path point at a file that exists?
//
// The browser resolves `/web/ui/craft.js` against the server's static handler
// and Node resolves `./slots.js` against the filesystem; neither tells you
// anything useful when the target is missing. In the browser you get a bare
// "Failed to load module script" with no mention of which import; on the server
// you get ERR_MODULE_NOT_FOUND at boot. Both are two minutes of confusion that
// this turns into one line.
//
// It also flags extensionless relative imports, which work under a bundler and
// do not work here — there is no bundler, by contract.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'data', '.git', 'tools']);

const C = process.stdout.isTTY
  ? { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { r: '', g: '', y: '', d: '', b: '', x: '' };
const say = (s = '') => process.stdout.write(`${s}\n`);

export function walkJs(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkJs(abs, out);
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

// Static import / export-from / dynamic import(). Deliberately regex rather
// than a parser: zero dependencies, and it only has to understand this codebase.
const SPECIFIER_RE = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function stripCommentsAndStrings(src) {
  // Blank out block/line comments so a commented-out import is not reported.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

export function importsIn(file) {
  const src = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
  const out = [];
  let m;
  SPECIFIER_RE.lastIndex = 0;
  while ((m = SPECIFIER_RE.exec(src)) !== null) {
    const spec = m[1] || m[2];
    if (spec) out.push({ spec, index: m.index });
  }
  return out;
}

function lineOf(file, index) {
  const src = fs.readFileSync(file, 'utf8');
  return src.slice(0, index).split('\n').length;
}

export function checkImports() {
  const files = walkJs();
  const problems = [];
  let checked = 0;

  for (const file of files) {
    for (const { spec, index } of importsIn(file)) {
      if (spec.startsWith('node:') || spec.startsWith('http')) continue;
      // A bare specifier means npm, which this project does not have.
      if (!spec.startsWith('.') && !spec.startsWith('/')) {
        problems.push({ file, spec, line: lineOf(file, index),
          why: `bare specifier "${spec}" — this project has zero dependencies and no bundler` });
        continue;
      }
      checked += 1;
      // "/web/ui/x.js" is a URL the server resolves from ROOT; "./x.js" is a path.
      const abs = spec.startsWith('/')
        ? path.join(ROOT, spec)
        : path.resolve(path.dirname(file), spec);

      if (!/\.(js|mjs|css|json)$/.test(spec)) {
        problems.push({ file, spec, line: lineOf(file, index),
          why: 'no file extension — the browser will not resolve this without a bundler' });
        continue;
      }
      if (!fs.existsSync(abs)) {
        problems.push({ file, spec, line: lineOf(file, index),
          why: `does not exist (${path.relative(ROOT, abs)})` });
      }
    }
  }
  return { files: files.length, checked, problems };
}

// Also verify the module scripts index.html pulls in, which no JS file mentions.
export function checkHtml() {
  const problems = [];
  const html = path.join(ROOT, 'index.html');
  if (!fs.existsSync(html)) return problems;
  const src = fs.readFileSync(html, 'utf8');
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (!url.startsWith('/')) continue;
    const abs = path.join(ROOT, url);
    if (!fs.existsSync(abs)) {
      problems.push({ file: html, spec: url, line: src.slice(0, m.index).split('\n').length,
        why: `index.html references a file that does not exist (${url})` });
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, checked, problems } = checkImports();
  const htmlProblems = checkHtml();
  const all = [...problems, ...htmlProblems];
  for (const p of all) {
    say(`  ${C.r}✗${C.x} ${path.relative(ROOT, p.file)}:${p.line}  ${C.b}${p.spec}${C.x}`);
    say(`      ${C.d}${p.why}${C.x}`);
  }
  if (all.length) {
    say(`\n${C.r}✗ ${all.length} unresolvable import(s) across ${files} file(s)${C.x}`);
    process.exit(1);
  }
  say(`  ${C.g}✓${C.x} ${checked} import path(s) across ${files} file(s) all resolve`);
  process.exit(0);
}
