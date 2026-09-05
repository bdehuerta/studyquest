#!/bin/bash
# tools/backup-saves.sh — a timestamped copy of the REAL save directory.
#
# This is the only script in tools/ that is allowed to touch
# ~/Library/Application Support/StudyQuest. Everything else runs against a
# scratch dir and refuses, in code, to resolve anywhere near the real one.
#
# It only ever READS the saves. It never writes, moves or deletes anything
# inside them — the copy goes somewhere else entirely.
#
#   ./tools/backup-saves.sh                 back up to ~/StudyQuest-Backups/
#   ./tools/backup-saves.sh --to DIR        back up somewhere else
#   ./tools/backup-saves.sh --list          list the backups that exist
#   ./tools/backup-saves.sh --verify        back up, then re-read every JSON file
#                                           in the copy and confirm it parses
#   ./tools/backup-saves.sh --prune N       keep only the N most recent backups

set -euo pipefail

APP_NAME="StudyQuest"
SRC="$HOME/Library/Application Support/$APP_NAME"
DEST_ROOT="$HOME/$APP_NAME-Backups"
VERIFY=0
PRUNE=""
LIST=0

while [ $# -gt 0 ]; do
  case "$1" in
    --to)     DEST_ROOT="$2"; shift 2 ;;
    --verify) VERIFY=1; shift ;;
    --prune)  PRUNE="$2"; shift 2 ;;
    --list)   LIST=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; X=$'\033[0m'
else R=""; G=""; Y=""; B=""; D=""; X=""; fi

die() { printf '%s✗ %s%s\n' "$R" "$*" "$X" >&2; exit 1; }

if [ "$LIST" -eq 1 ]; then
  printf '%sbackups in %s%s\n' "$B" "$DEST_ROOT" "$X"
  if [ -d "$DEST_ROOT" ]; then
    for d in "$DEST_ROOT"/*/; do
      [ -d "$d" ] || continue
      printf '  %-32s %s%s%s\n' "$(basename "$d")" "$D" "$(du -sh "$d" 2>/dev/null | cut -f1)" "$X"
    done
  else
    printf '  %s(none yet)%s\n' "$D" "$X"
  fi
  exit 0
fi

[ -d "$SRC" ] || die "there is no save directory at
   $SRC
   Nothing to back up — the app has not been run on this Mac yet."

STAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="$DEST_ROOT/$STAMP"

printf '%s%s — backing up saves%s\n' "$B" "$APP_NAME" "$X"
printf '  %sfrom%s %s\n' "$D" "$X" "$SRC"
printf '  %sto  %s %s\n' "$D" "$X" "$DEST"

mkdir -p "$DEST"

# cp -R rather than rsync: rsync is not guaranteed to be installed, cp is.
# The trailing /. copies the CONTENTS, so DEST is the save dir, not its parent.
cp -R "$SRC/." "$DEST/" || die "the copy failed — nothing was changed in the original."

FILES="$(find "$DEST" -type f | wc -l | tr -d ' ')"
SIZE="$(du -sh "$DEST" | cut -f1 | tr -d ' ')"
printf '  %s✓%s %s file(s), %s\n' "$G" "$X" "$FILES" "$SIZE"

# A copy that cannot be read back is not a backup.
if [ "$VERIFY" -eq 1 ]; then
  printf '%sverifying the copy%s\n' "$B" "$X"
  BAD=0
  CHECKED=0
  while IFS= read -r -d '' f; do
    CHECKED=$((CHECKED + 1))
    if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$f" 2>/dev/null; then
      BAD=$((BAD + 1))
      printf '  %s✗%s %s does not parse as JSON\n' "$R" "$X" "${f#"$DEST"/}"
    fi
  done < <(find "$DEST" -type f -name '*.json' -print0)
  if [ "$BAD" -eq 0 ]; then
    printf '  %s✓%s all %s JSON file(s) in the copy parse\n' "$G" "$X" "$CHECKED"
  else
    printf '  %s✗ %s file(s) in the copy are unreadable%s\n' "$R" "$BAD" "$X"
    printf '  %sNote: this may mean the ORIGINAL is already corrupt. The backup was still made.%s\n' "$Y" "$X"
    exit 1
  fi
fi

if [ -n "$PRUNE" ]; then
  KEEP="$PRUNE"
  case "$KEEP" in ''|*[!0-9]*) die "--prune needs a number" ;; esac
  [ "$KEEP" -ge 1 ] || die "--prune must keep at least 1"
  # Names are sortable timestamps, so "oldest" is just the top of a sorted list.
  TOTAL="$(find "$DEST_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  if [ "$TOTAL" -gt "$KEEP" ]; then
    printf '%spruning%s %s backup(s), keeping the newest %s\n' "$B" "$X" "$((TOTAL - KEEP))" "$KEEP"
    find "$DEST_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | head -n "$((TOTAL - KEEP))" | while read -r old; do
      # Paranoia: never rm anything that is not under DEST_ROOT.
      case "$old" in
        "$DEST_ROOT"/*) rm -rf "$old"; printf '  %sremoved %s%s\n' "$D" "$(basename "$old")" "$X" ;;
        *) printf '  %sskipped %s (outside the backup root)%s\n' "$Y" "$old" "$X" ;;
      esac
    done
  fi
fi

printf '\n%s%s✓ saves backed up%s  %s%s%s\n\n' "$G" "$B" "$X" "$D" "$DEST" "$X"
printf '  restore with   cp -R "%s/." "%s/"\n\n' "$DEST" "$SRC"
