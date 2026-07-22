#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/sarhang-cs/qalla-wanan.git"
TARGET="$HOME/QALLA-WANAN-NAV-KURD-MAP-R1"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/QALLA-WANAN-backup-before-R9-$STAMP"
GIT_RESTORE="$HOME/.qalla-r9-git-restore"

printf '\n=============================================\n'
printf ' QALLA WANAN R9 — FULL NATIVE LABELS\n'
printf '=============================================\n'

pkg install -y git nodejs >/dev/null

if [ ! -f "$SOURCE/package.json" ] || [ ! -f "$SOURCE/src/nav-map.js" ]; then
  echo "❌ پەکەجی R9 ناتەواوە."
  exit 1
fi

mkdir -p "$TARGET"
if [ -n "$(find "$TARGET" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  echo "🧰 Backup: $BACKUP"
  mkdir -p "$BACKUP"
  tar -C "$TARGET" --exclude='.git' --exclude='node_modules' --exclude='dist' -cf - . | tar -C "$BACKUP" -xf -
fi

if ! git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "🔧 .git لە Repo ـی سەرەکی دەگەڕێندرێتەوە..."
  rm -rf "$GIT_RESTORE"
  git clone --single-branch --branch main --no-tags "$REPO_URL" "$GIT_RESTORE"
  rm -rf "$TARGET/.git"
  cp -a "$GIT_RESTORE/.git" "$TARGET/.git"
  rm -rf "$GIT_RESTORE"
fi

ENV_KEEP=""
if [ -f "$TARGET/.env.local" ]; then
  ENV_KEEP="$HOME/.qalla-r9-env-local-$STAMP"
  cp -f "$TARGET/.env.local" "$ENV_KEEP"
fi

find "$TARGET" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env.local' -exec rm -rf -- {} +
tar -C "$SOURCE" --exclude='.git' --exclude='node_modules' --exclude='dist' -cf - . | tar -C "$TARGET" -xf -

if [ -n "$ENV_KEEP" ] && [ -f "$ENV_KEEP" ]; then
  cp -f "$ENV_KEEP" "$TARGET/.env.local"
  rm -f "$ENV_KEEP"
fi

cd "$TARGET"
git config user.name "Sarhang Salah"
git config user.email "sarhang.salah9@gmail.com"
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$REPO_URL"; else git remote add origin "$REPO_URL"; fi
git branch -M main
[ "$(git remote get-url origin)" = "$REPO_URL" ] || { echo "❌ Remote هەڵەیە"; exit 1; }

echo "📦 پشکنین و Build..."
npm install --no-audit --no-fund
npm run check
npm run build

test -s public/fonts/UniQAIDAR_Hewal_031.ttf
test -s public/data/nav/labels-major.geojson
test -s public/data/nav/labels-poi.geojson
test -s public/data/nav/labels.compact.json
grep -q 'ensureProjectFont' src/nav-map.js
grep -q 'verifyNativeLabelVisibility' src/nav-map.js
grep -q "'nav-label-major':" src/nav-map.js
grep -q "'nav-label-poi':" src/nav-map.js
grep -q 'nativeLabelDefinitions.map' src/nav-map.js

# Confirm the full deployment artifact contains labels and font.
test -s dist/data/nav/labels-major.geojson
test -s dist/data/nav/labels-poi.geojson
test -s dist/fonts/UniQAIDAR_Hewal_031.ttf

echo "📤 Push بۆ تەنها sarhang-cs/qalla-wanan..."
git add -A
if ! git diff --cached --quiet; then
  git commit -m "R9: use complete immutable native label sources with stable zoom styling"
else
  echo "ℹ️ هیچ گۆڕانکارییەکی نوێ بۆ Commit نییە."
fi
git push -u origin main

printf '\n=============================================\n'
printf '✅ R9 Push کرا\n'
printf '✅ Repo: https://github.com/sarhang-cs/qalla-wanan\n'
printf '✅ Backup: %s\n' "$BACKUP"
printf '=============================================\n'
