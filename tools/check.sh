#!/bin/bash
# tools/check.sh — the fast pre-flight. No server, no browser, under a second.
#
# Three questions, in the order they bite:
#   1. does every .js file parse at all?
#   2. does every import path point at a file that exists?
#   3. do the id lists in shared/constants.js match the modules that implement
#      them? (recipes.js asserts this AT LOAD, so a mismatch is not a missing
#      item — it is a throw inside an import that takes the whole app down.)
#
# Run this before anything slower. Exit 0 = green, 1 = something is broken.
#
#   ./tools/check.sh              report and exit non-zero on a hard failure
#   ./tools/check.sh --strict     treat "not implemented yet" as a failure too
#   ./tools/check.sh --quiet      only print failures

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STRICT=""
QUIET=0
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT="--strict" ;;
    --quiet)  QUIET=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; X=$'\033[0m'
else R=""; G=""; Y=""; B=""; D=""; X=""; fi

bold() { [ "$QUIET" -eq 1 ] || printf '%s%s%s\n' "$B" "$*" "$X"; }
note() { [ "$QUIET" -eq 1 ] || printf '  %s·%s %s%s%s\n' "$D" "$X" "$D" "$*" "$X"; }

FAILED=0

command -v node >/dev/null 2>&1 || { printf '%s✗ node is not on PATH — nothing can be checked%s\n' "$R" "$X"; exit 1; }

# ── 1. syntax ────────────────────────────────────────────────────────────────
bold "1/3  syntax"

# `find -print0` + a while loop, because a filename with a space must not split.
SYNTAX_BAD=0
COUNT=0
while IFS= read -r -d '' f; do
  COUNT=$((COUNT + 1))
  if ! OUT="$(node --check "$f" 2>&1)"; then
    SYNTAX_BAD=$((SYNTAX_BAD + 1))
    printf '  %s✗%s %s\n' "$R" "$X" "${f#"$ROOT"/}"
    printf '%s\n' "$OUT" | sed 's/^/      /' | head -6
  fi
done < <(find "$ROOT" \
  \( -name node_modules -o -name dist -o -name data -o -name .git \) -prune -o \
  \( -name '*.js' -o -name '*.mjs' \) -print0)

if [ "$SYNTAX_BAD" -eq 0 ]; then
  printf '  %s✓%s %s file(s) parse\n' "$G" "$X" "$COUNT"
else
  printf '  %s✗ %s of %s file(s) do not parse%s\n' "$R" "$SYNTAX_BAD" "$COUNT" "$X"
  FAILED=1
fi

# ── 2. import paths ──────────────────────────────────────────────────────────
bold "2/3  import paths"
if node "$ROOT/tools/lib/imports.mjs"; then :; else FAILED=1; fi

# ── 3. id lists vs data modules ──────────────────────────────────────────────
bold "3/3  id lists vs data modules"
if [ "$SYNTAX_BAD" -ne 0 ]; then
  printf '  %s~%s skipped — fix the syntax errors first, the modules cannot be imported\n' "$Y" "$X"
else
  if node "$ROOT/tools/lib/idcheck.mjs" $STRICT; then :; else FAILED=1; fi
fi

# ── verdict ──────────────────────────────────────────────────────────────────
echo
if [ "$FAILED" -eq 0 ]; then
  printf '%s%s✓ pre-flight clean%s\n\n' "$G" "$B" "$X"
  exit 0
fi
printf '%s%s✗ pre-flight found problems — fix these before running the smoke suite%s\n\n' "$R" "$B" "$X"
exit 1
