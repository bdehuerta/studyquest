# tools/checks — the smoke-test suites

Every `.json` or `.mjs` file in this directory is a suite. `node tools/smoke.mjs`
runs all of them; `node tools/smoke.mjs boot migration` runs the named ones.
**Adding a test case means adding a step here — never editing `tools/smoke.mjs`.**

Each suite gets its own scratch port and its own scratch `SQ_DATA_DIR`. The real
save directory is never touched (`tools/lib/server.mjs` refuses to boot against it).

## Suite shape

```jsonc
{
  "name": "Boot",            // shown in the report
  "order": 10,               // suites run in ascending order (default 100)
  "browser": true,           // false = API-only, no Chrome needed
  "env": { "SQ_X": "1" },    // extra env for the server child
  "seed": { "state.json": { /* … */ } },   // files written into the scratch data dir first
  "allowConsole": ["favicon"],             // regexes for console errors that are OK
  "allowServerErrors": [],                 // same, for server stderr lines
  "steps": [ /* … */ ]
}
```

A `.mjs` suite `export default`s the same object (or a function returning one),
which is how the migration suite builds its v1/v2/v3 fixtures in code.

## Steps

Every step takes an optional `label` (used in the report) and `optional: true`
(a failure is reported but does not fail the suite).

| type | fields | does |
|---|---|---|
| `navigate` | `url` (relative to the server), `waitUntil`, `timeoutMs` | loads a page |
| `wait` | `ms` | sleeps |
| `waitFor` | `expr`, `timeoutMs`, `intervalMs` | polls a page expression until truthy |
| `eval` | `expr`, `into` | evaluates in the page; `into` stores the value |
| `assert` | `expr`, `equals` | evaluates; must be truthy, or deep-equal `equals` |
| `click` | `selector`, `settleMs` | real mouse click at the element's centre |
| `key` | `key`, `times`, `gapMs`, `settleMs` | real key event (`"e"`, `"Tab"`, `"Escape"`, `"ArrowUp"`…) |
| `screenshot` | `file` | PNG into `tools/shots/` (or `--shots-dir`) |
| `api` | `route`, `body`, `expectStatus`, `expectOk`, `path`, `equals`, `truthy`, `into` | calls the HTTP API directly; omit `body` for GET |
| `file` | `path` (relative to the scratch data dir), `exists`, `json` | asserts a save file's existence and contents |
| `clearErrors` | — | empties the console-error buffer (for steps that throw on purpose) |
| `note` | `text` | prints a line |

`path` / `json` keys are dotted: `"player.coins.focus"`, `"slots.0.name"`.

## What runs on every suite whether you ask or not

- **Console errors and uncaught page exceptions fail the suite.** This is the
  point of the harness. `web/main.js` deliberately swallows a panel's `setState`
  throw (`console.error('setState failed', …)`) so the other panels keep
  rendering — which means the console is the *only* place that failure appears.
- Server stderr is scanned for `[api]` and friends; a caught-but-real server
  exception fails the suite too.
- Chrome and the server are killed by pid/process-group on the way out, pass or
  fail. Nothing is left listening.
