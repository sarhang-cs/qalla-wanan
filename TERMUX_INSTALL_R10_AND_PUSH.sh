#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/sarhang-cs/qalla-wanan.git"
TARGET="$HOME/QALLA-WANAN-NAV-KURD-MAP-R1"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/QALLA-WANAN-backup-before-R10-$STAMP"
GIT_RESTORE="$HOME/.qalla-r10-git-restore"
ENV_KEEP="$HOME/.qalla-r10-env-local-$STAMP"

printf '\n=================================================\n'
printf ' QALLA WANAN R10 — GLASS LABELS + 69,000 DATA\n'
printf '=================================================\n'

pkg install -y git nodejs >/dev/null

for required in package.json src/nav-map.js scripts/check-data.mjs public/data/nav/labels-native.geojson; do
  if [ ! -s "$SOURCE/$required" ]; then
    echo "❌ پەکەجی R10 ناتەواوە: $required"
    exit 1
  fi
done

mkdir -p "$TARGET"
if [ -n "$(find "$TARGET" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  echo "🧰 Backup: $BACKUP"
  mkdir -p "$BACKUP"
  tar -C "$TARGET" --exclude='.git' --exclude='node_modules' --exclude='dist' -cf - . | tar -C "$BACKUP" -xf -
fi

# Restore Git metadata only from the one authorized repository when missing.
if ! git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "🔧 .git لە Repo ـی سەرەکی دەگەڕێندرێتەوە..."
  rm -rf "$GIT_RESTORE"
  git clone --single-branch --branch main --no-tags "$REPO_URL" "$GIT_RESTORE"
  rm -rf "$TARGET/.git"
  cp -a "$GIT_RESTORE/.git" "$TARGET/.git"
  rm -rf "$GIT_RESTORE"
fi

if [ -f "$TARGET/.env.local" ]; then cp -f "$TARGET/.env.local" "$ENV_KEEP"; fi

# Replace application files, never .git and never the user's local environment.
find "$TARGET" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env.local' -exec rm -rf -- {} +
tar -C "$SOURCE" --exclude='.git' --exclude='node_modules' --exclude='dist' -cf - . | tar -C "$TARGET" -xf -

if [ -f "$ENV_KEEP" ]; then
  cp -f "$ENV_KEEP" "$TARGET/.env.local"
  rm -f "$ENV_KEEP"
fi

cd "$TARGET"
git config user.name "Sarhang Salah"
git config user.email "sarhang.salah9@gmail.com"
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$REPO_URL"; else git remote add origin "$REPO_URL"; fi
git branch -M main
[ "$(git remote get-url origin)" = "$REPO_URL" ] || { echo "❌ Remote هەڵەیە"; exit 1; }

printf '📦 داتای 69,000 شوێن، glass labels و Build دەپشکنرێن...\n'
npm install --no-audit --no-fund
npm run check
npm run build

# Hard gates: exact data count, glass-native layers, font, and complete deployment artifact.
node - <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('DATA_MANIFEST.json', 'utf8'));
if (manifest.source_records !== 69000 || manifest.render_records !== 69000) throw new Error('69,000 data contract failed');
if (manifest.coordinate_mutation !== 0 || manifest.outside_canonical_boundary !== 0) throw new Error('coordinate/boundary contract failed');
NODE

test -s public/fonts/UniQAIDAR_Hewal_031.ttf
test -s public/data/nav/labels-major.geojson
test -s public/data/nav/labels-poi.geojson
test -s public/data/nav/labels-detail.geojson
test -s public/data/nav/full-source/kri-labels-69000.geojson
grep -q "icon-text-fit': 'both" src/nav-map.js
grep -q "text-halo-width': 0" src/nav-map.js
grep -q "nav-glass-poi" src/nav-map.js
grep -q "nav-label-detail" src/nav-map.js

test -s dist/data/nav/labels-major.geojson
test -s dist/data/nav/labels-poi.geojson
test -s dist/data/nav/labels-detail.geojson
test -s dist/data/nav/full-source/kri-labels-69000.geojson
test -s dist/fonts/UniQAIDAR_Hewal_031.ttf

printf '📤 Push بۆ تەنها sarhang-cs/qalla-wanan...\n'
git add -A
if ! git diff --cached --quiet; then
  git commit -m "R10: native glass labels and verified 69,000-place map dataset"
else
  echo "ℹ️ هیچ گۆڕانکارییەکی نوێ بۆ Commit نییە."
fi
git push -u origin main

printf '\n=================================================\n'
printf '✅ R10 Push کرا\n'
printf '✅ 69,000 تۆمار پشکنرا\n'
printf '✅ Repo: https://github.com/sarhang-cs/qalla-wanan\n'
printf '✅ Backup: %s\n' "$BACKUP"
printf '=================================================\n'
