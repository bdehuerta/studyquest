#!/bin/bash
# tools/ship.sh — take a change from "it works on my machine" to "it is in the
# game Bruno is holding", in one command, in the order that actually catches
# things.
#
#   ./tools/ship.sh                 check, smoke, build, verify
#   ./tools/ship.sh --fast          check + build only (no browser suites)
#   ./tools/ship.sh --only 23-mountain 25-elderwatch
#   ./tools/ship.sh --no-build      verify only; leave the .app alone
#
# WHY THIS EXISTS. The dance below was done by hand dozens of times in one
# session and got it wrong twice, both times expensively:
#
#   1. A whole session's fixes were committed and never built. Bruno came back
#      reporting every one of them as still broken, and three rounds of
#      diagnosis went into a map that was already correct in the repo.
#      COMMITTING IS NOT SHIPPING.
#   2. Two full smoke runs were started at once. The machine hit load 18 and
#      eight suites failed on servers not answering, dropped CDP sockets and
#      screenshot timeouts — none of it real. A red suite that is really an
#      overloaded laptop costs more than the bug it hides.
#
# So: one run at a time, never against the real save directory, and the bundle
# is GREPPED afterwards rather than assumed. `node --check` passing means the
# file parses; it does not mean the change is in the app.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAST=0
BUILD=1
ONLY=()
for arg in "$@"; do
  case "$arg" in
    --fast)     FAST=1 ;;
    --no-build) BUILD=0 ;;
    --only)     ;;                       # suites follow; collected below
    -h|--help)  sed -n '2,12p' "$0"; exit 0 ;;
    -*)         echo "unknown option: $arg" >&2; exit 2 ;;
    *)          ONLY+=("$arg") ;;
  esac
done

if [ -t 1 ]; then R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; X=$'\033[0m'
else R=""; G=""; Y=""; B=""; D=""; X=""; fi
step() { printf '\n%s▸ %s%s\n' "$B" "$*" "$X"; }
fail() { printf '%s✗ %s%s\n\n' "$R" "$*" "$X"; exit 1; }

# ── 0. nothing else may be running ───────────────────────────────────────────
# One suite at a time. Two is not twice as fast, it is both of them failing.
if pgrep -f "node tools/smoke.mjs" >/dev/null 2>&1; then
  fail "a smoke run is already going — wait for it, or: pkill -f 'node tools/smoke.mjs'"
fi

# ── 1. the fast contracts ────────────────────────────────────────────────────
# Syntax, import paths, id lists, and the map geometry: every declared
# coordinate on real ground, patrol lanes walkable, locks that actually lock,
# gear never behind itself, and the Codex's pages never filling their own gaps.
step "1/4  contracts  (syntax, ids, map geometry)"
./tools/check.sh --quiet || fail "pre-flight failed — fix this before anything slower"

# ── 2. the browser suites ────────────────────────────────────────────────────
if [ "$FAST" -eq 1 ]; then
  printf '\n%s▸ 2/4  smoke — SKIPPED (--fast)%s\n' "$Y" "$X"
else
  step "2/4  smoke  (headless Chrome; ~4 min for all 25)"
  LOAD="$(uptime | sed 's/.*averages*: *//' | cut -d' ' -f1 | tr ',' '.')"
  # A loaded machine produces failures that are about the laptop, not the game.
  if awk "BEGIN{exit !($LOAD > 8)}" 2>/dev/null; then
    printf '  %s! load is %s — suites may time out on servers and screenshots%s\n' "$Y" "$LOAD" "$X"
    printf '  %s  a red run at this load is worth re-running before believing%s\n' "$D" "$X"
  fi
  # NEVER the real save directory. Tests seed and wipe whatever they are given.
  SCRATCH="$(mktemp -d)"
  trap 'rm -rf "$SCRATCH"' EXIT
  LOG="$SCRATCH/smoke.log"
  SQ_DATA_DIR="$SCRATCH/data" node tools/smoke.mjs "${ONLY[@]+"${ONLY[@]}"}" >"$LOG" 2>&1
  grep -E "^  ✗ |FAIL " "$LOG" || true
  if ! grep -q "suite(s) passed" "$LOG"; then
    printf '\n%s  full log: %s%s\n' "$D" "$LOG" "$X"
    trap - EXIT                                   # keep the log for reading
    fail "smoke failed — see the log above"
  fi
  grep -E "suite\(s\) passed" "$LOG" | sed 's/^/  /'
fi

# ── 3. build the thing he actually opens ─────────────────────────────────────
if [ "$BUILD" -eq 0 ]; then
  printf '\n%s▸ 3/4  build — SKIPPED (--no-build); the .app is now STALE%s\n' "$Y" "$X"
else
  step "3/4  build the .app"
  ./build-app.sh >/dev/null 2>&1 || fail "build-app.sh failed"
  printf '  %s✓%s dist/StudyQuest.app rebuilt\n' "$G" "$X"
fi

# ── 4. prove it is in the bundle ─────────────────────────────────────────────
# The step that would have saved a whole session: do not trust that a source
# change reached the app — read it back out of the app.
step "4/4  verify the bundle"
APP="$ROOT/dist/StudyQuest.app/Contents/Resources/app"
[ -d "$APP" ] || fail "no bundle at $APP — run without --no-build"
node --input-type=module -e "
  const app = '$APP';
  const [C, Q] = await Promise.all([
    import(app + '/shared/constants.js'),
    import(app + '/shared/quests.js'),
  ]);
  const rows = [
    ['areas',        C.AREA_IDS.length + ' (' + C.AREA_IDS.join(', ') + ')'],
    ['quests',       Q.QUESTS.length],
    ['quest steps',  Q.QUESTS.reduce((n, q) => n + q.steps.length, 0)],
    ['tile types',   Object.keys(C.TILE_TYPES).length],
  ];
  for (const [k, v] of rows) console.log('  ' + String(k).padEnd(13) + v);
" 2>/dev/null | grep -v '^\[sprites\]' || fail "the bundle will not import — it is broken, not just stale"

STAMP="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$ROOT/dist/StudyQuest.app/Contents/Info.plist" 2>/dev/null || echo '?')"
printf '  %sbuild id%s     %s\n' "$D" "$X" "$STAMP"

# ── and the one thing a script cannot do ─────────────────────────────────────
RUNNING="$(pgrep -f 'StudyQuest.app/Contents/MacOS' | head -1)"
printf '\n%s%s✓ shipped%s\n' "$G" "$B" "$X"
if [ -n "$RUNNING" ]; then
  printf '%s  StudyQuest is OPEN (pid %s) and is still running the OLD code.%s\n' "$Y" "$RUNNING" "$X"
  printf '%s  Rebuilding does not restart a window. Tell Bruno: ⌘Q and reopen.%s\n' "$Y" "$X"
else
  printf '%s  open dist/StudyQuest.app%s\n' "$D" "$X"
fi
echo
