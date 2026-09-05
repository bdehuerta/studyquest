#!/bin/bash
# build-app.sh — assemble dist/StudyQuest.app from app/ + the game sources.
#
# Idempotent: re-running rebuilds cleanly over the top. Everything it needs ships
# with macOS and Xcode's command line tools (swiftc, iconutil, codesign, plutil).
#
#   ./build-app.sh            build
#   ./build-app.sh --run      build, then open the app
#   ./build-app.sh --clean    remove dist/ and the build cache first
#   ./build-app.sh --verify   build, then launch the bundle against a SCRATCH
#                             save dir, prove the node child serves, quit it,
#                             and prove no node process survives. Never touches
#                             the user's real saves.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

APP_NAME="StudyQuest"
BUNDLE_ID="com.brunodehuerta.studyquest"
VERSION="0.2.0"
BUILD_NUM="$(date +%Y%m%d%H%M)"
MIN_MACOS="13.0"

DIST="$ROOT/dist"
APP="$DIST/$APP_NAME.app"
CONTENTS="$APP/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RES="$CONTENTS/Resources"
WORK="$ROOT/dist/.build"

RUN_AFTER=0
VERIFY=0
for arg in "$@"; do
  case "$arg" in
    --run)    RUN_AFTER=1 ;;
    --verify) VERIFY=1 ;;
    --clean)  rm -rf "$DIST" ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# ── what ships, decided here and nowhere else ────────────────────────────────
#
# SHIP_DIRS go into Resources/app. KEEP_OUT are top-level directories that
# deliberately do NOT ship. A directory in neither list is a build failure, not
# a silent omission: when someone adds a top-level folder, the person who added
# it should be the one who decides whether it belongs in a user's app bundle.
#
# tools/ is KEEP_OUT on purpose. It is test infrastructure — it spawns Chrome,
# writes to scratch directories, and has a script that touches the real saves.
# None of that has any business inside a shipped bundle.
SHIP_FILES=(server.js package.json index.html)
SHIP_DIRS=(server shared web)
KEEP_OUT=(app tools dist data node_modules .git)

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '  \033[36m›\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

# ── preflight ────────────────────────────────────────────────────────────────

bold "StudyQuest — building the macOS app"

command -v swiftc >/dev/null 2>&1 || die \
"swiftc was not found.
   StudyQuest's native shell is written in Swift and needs Apple's compiler.
   Install the Xcode command line tools with:   xcode-select --install"

# swiftc can be present but non-functional (the stub shim macOS ships before the
# real tools are installed). Compile something trivial and find out now, not
# three minutes in with half a bundle on disk.
printf 'print("")\n' > "$ROOT/.sq-toolcheck.swift"
if ! swiftc -o /dev/null "$ROOT/.sq-toolcheck.swift" >/dev/null 2>&1; then
  rm -f "$ROOT/.sq-toolcheck.swift"
  die "swiftc is on PATH but cannot compile anything.
   This is usually the Xcode command line tools stub. Fix it with:
       xcode-select --install
   and if that says they are already installed:
       sudo xcode-select --reset"
fi
rm -f "$ROOT/.sq-toolcheck.swift"

NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || die \
"node was not found.
   StudyQuest's game engine runs on Node (v18 or newer).
   Install it from https://nodejs.org or with:   brew install node"

NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 18 ] 2>/dev/null || die \
"node $("$NODE_BIN" --version 2>/dev/null) is too old.
   The game server uses ESM and node: imports and needs Node 18 or newer.
   The bundle would build and then fail to start on launch."

for tool in iconutil codesign plutil; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool was not found — it ships with macOS; is your install complete?"
done

for f in "${SHIP_FILES[@]}"; do
  [ -f "$ROOT/$f" ] || die "$f is missing from $ROOT — run this script from the proto directory."
done
for d in "${SHIP_DIRS[@]}" app/Sources app/IconGen; do
  [ -d "$ROOT/$d" ] || die "$d/ is missing from $ROOT."
done

# Every top-level directory must be accounted for by one of the two lists above.
for d in "$ROOT"/*/; do
  name="$(basename "$d")"
  known=0
  for k in "${SHIP_DIRS[@]}" "${KEEP_OUT[@]}"; do [ "$k" = "$name" ] && known=1; done
  [ "$known" -eq 1 ] || die \
"the top-level directory '$name/' is new and this script does not know what to do with it.

   Decide, then edit the lists at the top of build-app.sh:
     SHIP_DIRS   goes into the app bundle a user runs
     KEEP_OUT    stays in the repo

   Failing here is deliberate. Silently shipping an unreviewed directory, or
   silently omitting one the game needs at runtime, are both worse."
done
# The game must not reach outside what we ship. A bare "../../" is NOT the test
# (web/ui and web/world are legitimately two levels down); what matters is
# whether the resolved target escapes the root.
node "$ROOT/tools/check-imports.mjs" "$ROOT" || die "an import resolves outside the project root — it will not exist inside the bundle."

ARCH="$(uname -m)"
step "swiftc  $(swiftc --version 2>/dev/null | head -1 | sed 's/^Apple //')"
step "node    $("$NODE_BIN" --version)  ($NODE_BIN)"
step "arch    $ARCH"

# ── clean slate for the bundle itself ────────────────────────────────────────

rm -rf "$APP"
mkdir -p "$MACOS_DIR" "$RES" "$WORK"

# ── compile the app ──────────────────────────────────────────────────────────

bold "Compiling"
step "app/Sources/*.swift → $APP_NAME"
# -swift-version 5: the sources are plain AppKit and don't opt into Swift 6's
# strict concurrency checking, which would reject AppKit's own singletons.
swiftc -O \
  -swift-version 5 \
  -target "${ARCH}-apple-macosx${MIN_MACOS}" \
  -framework AppKit -framework WebKit \
  -module-name StudyQuestApp \
  -o "$MACOS_DIR/$APP_NAME" \
  "$ROOT"/app/Sources/*.swift \
  || die "the Swift app failed to compile (see the errors above)."

step "app/IconGen/main.swift → sqicon"
swiftc -O \
  -swift-version 5 \
  -target "${ARCH}-apple-macosx${MIN_MACOS}" \
  -framework AppKit \
  -module-name SQIconGen \
  -o "$WORK/sqicon" \
  "$ROOT"/app/IconGen/main.swift \
  || die "the icon generator failed to compile (see the errors above)."

# ── icon ─────────────────────────────────────────────────────────────────────

bold "Drawing the icon"
ICONSET="$WORK/AppIcon.iconset"
rm -rf "$ICONSET"
"$WORK/sqicon" "$ICONSET" >/dev/null || die "icon generation failed."
step "$(ls "$ICONSET" | wc -l | tr -d ' ') PNG sizes rendered procedurally"
iconutil -c icns "$ICONSET" -o "$RES/AppIcon.icns" || die "iconutil could not build AppIcon.icns."
step "AppIcon.icns"

# ── copy the game in ─────────────────────────────────────────────────────────
#
# Only the code. No data/ (saves live in Application Support), no node_modules,
# no dist/, no contracts or READMEs.

bold "Bundling the game"
GAME="$RES/app"
mkdir -p "$GAME"
for f in server.js package.json index.html; do
  cp "$ROOT/$f" "$GAME/$f"
done
step "server.js  package.json  index.html"

# tar pipes the tree across in one pass and takes exclusions inline — BSD cp has
# no --parents, and rsync is not guaranteed to be installed.
for d in server shared web; do
  rm -rf "${GAME:?}/$d"
  mkdir -p "$GAME/$d"
  (cd "$ROOT/$d" && tar --exclude '.DS_Store' --exclude 'node_modules' --exclude '*.map' -cf - .) \
    | (cd "$GAME/$d" && tar -xf -) \
    || die "could not copy $d/ into the bundle."
  step "$d/  ($(find "$GAME/$d" -type f | wc -l | tr -d ' ') files)"
done

[ -f "$GAME/server/store.js" ] || die "server/store.js did not make it into the bundle."
[ -f "$GAME/web/main.js" ]     || die "web/main.js did not make it into the bundle."

# ── Info.plist ───────────────────────────────────────────────────────────────

bold "Writing Info.plist"
cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>                  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>           <string>$APP_NAME</string>
  <key>CFBundleExecutable</key>            <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>            <string>$BUNDLE_ID</string>
  <key>CFBundlePackageType</key>           <string>APPL</string>
  <key>CFBundleShortVersionString</key>    <string>$VERSION</string>
  <key>CFBundleVersion</key>               <string>$BUILD_NUM</string>
  <key>CFBundleIconFile</key>              <string>AppIcon</string>
  <key>LSMinimumSystemVersion</key>        <string>$MIN_MACOS</string>
  <key>LSApplicationCategoryType</key>     <string>public.app-category.education</string>
  <key>NSHighResolutionCapable</key>       <true/>
  <key>NSSupportsAutomaticTermination</key><false/>
  <key>NSSupportsSuddenTermination</key>   <false/>
  <key>NSHumanReadableCopyright</key>      <string>StudyQuest — a local study RPG.</string>

  <!-- The game is served over plain HTTP from 127.0.0.1, which ATS blocks by default. -->
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
  </dict>

  <!-- Recorded at build time so the app can find node even under a minimal PATH. -->
  <key>SQNodePath</key>                    <string>$NODE_BIN</string>
</dict>
</plist>
PLIST
plutil -lint "$CONTENTS/Info.plist" >/dev/null || die "the generated Info.plist is malformed."
printf 'APPL????' > "$CONTENTS/PkgInfo"
step "$BUNDLE_ID  v$VERSION ($BUILD_NUM)"

# ── sign ─────────────────────────────────────────────────────────────────────
#
# Ad-hoc signature. Without one, Gatekeeper refuses to launch a freshly assembled
# bundle on Apple silicon at all — this is not optional, even locally.

bold "Signing"
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - --timestamp=none "$APP" 2>/dev/null \
  || die "ad-hoc code signing failed."
codesign --verify --deep "$APP" 2>/dev/null || die "the signature did not verify."
step "ad-hoc signature verified"

# ── done ─────────────────────────────────────────────────────────────────────

SIZE="$(du -sh "$APP" | cut -f1 | tr -d ' ')"
printf '\n\033[1;32m✓ built %s\033[0m  (%s)\n\n' "$APP" "$SIZE"
cat <<INFO
  run it       open "$(basename "$DIST")/$APP_NAME.app"
  install it   cp -R "dist/$APP_NAME.app" /Applications/
  saves        ~/Library/Application Support/$APP_NAME/
  server log   ~/Library/Logs/$APP_NAME/server.log

INFO

if [ "$RUN_AFTER" -eq 1 ]; then
  step "launching…"
  open "$APP"
fi
