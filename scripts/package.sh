#!/bin/sh
# Build the unpacked-extension release archive; run from any directory.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=$(node -p "require(process.argv[1]).version" "$ROOT/manifest.json")
OUT="$ROOT/dist/workspace-manager-v$VERSION.zip"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT HUP INT TERM
mkdir -p "$ROOT/dist"
for path in manifest.json background.js bridge.js content.js main_world.js icons presets ui utils; do
  cp -R "$ROOT/$path" "$STAGE/"
done
find "$STAGE" -name .DS_Store -type f -delete
find "$STAGE/ui" -type f -name '_*.html' -delete
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$OUT" .)
printf 'Built %s\n' "$OUT"
