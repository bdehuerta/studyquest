// Fails if any relative import RESOLVES outside the project root.
// A bare "../../" is not the test: web/ui and web/world sit two levels down, so
// ../../shared/constants.js is correct and lands on app/shared in the bundle.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const bad = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
    if (!e.name.endsWith('.js')) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(p), m[1]);
      if (!target.startsWith(root + path.sep)) bad.push(`${path.relative(root, p)} -> ${m[1]}`);
    }
  }
}

for (const d of ['server', 'shared', 'web']) {
  const f = path.join(root, d);
  if (fs.existsSync(f)) walk(f);
}

if (bad.length) { console.error(bad.map((b) => '     ' + b).join('\n')); process.exit(1); }
