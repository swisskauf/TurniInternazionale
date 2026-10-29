#!/usr/bin/env bash
# Installs (or updates) Swissync Turni inside your local Swissync folder on macOS.
#
#   bash install-on-mac.sh                    # → ~/Swissync/swissync-turni
#   bash install-on-mac.sh "/path/to/Swissync"
#
# Requires git and Node.js 22+ (https://nodejs.org or `brew install node`).
set -euo pipefail

REPO="https://github.com/swisskauf/TurniInternazionale.git"
BRANCH="${SWISSYNC_TURNI_BRANCH:-claude/kind-lovelace-23ogat}"
SWISSYNC_DIR="${1:-$HOME/Swissync}"
TARGET="$SWISSYNC_DIR/swissync-turni"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Scarico Swissync Turni ($BRANCH)…"
git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$TMP/repo"

mkdir -p "$SWISSYNC_DIR"
if [ -d "$TARGET" ]; then
  echo "→ Aggiorno $TARGET (i tuoi file .env.local restano invariati)…"
else
  echo "→ Installo in $TARGET…"
fi
rsync -a --delete \
  --exclude node_modules --exclude dist --exclude .env.local --exclude 'android/app/build' --exclude 'ios/App/build' \
  "$TMP/repo/swissync-turni/" "$TARGET/"

if command -v npm >/dev/null 2>&1; then
  echo "→ Installo le dipendenze…"
  (cd "$TARGET" && npm ci --no-audit --no-fund)
  echo ""
  echo "✓ Fatto. Per avviare l'app:"
  echo "    cd \"$TARGET\" && npm run dev        # http://localhost:3000"
  echo "  Per aprire l'app iOS in Xcode:"
  echo "    cd \"$TARGET\" && npm run cap:ios"
else
  echo "✓ File copiati. Installa Node.js 22+ e poi esegui: cd \"$TARGET\" && npm ci"
fi
