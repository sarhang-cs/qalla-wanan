#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/sarhang-cs/qalla-wanan.git"
TARGET="$HOME/QALLA-WANAN-NAV-KURD-MAP-R1"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/QALLA-WANAN-backup-before-R13-$STAMP"
GIT_RESTORE="$HOME/.qalla-r13-git-restore"
ENV_KEEP="$HOME/.qalla-r13-env-local-$STAMP"

printf '\n=================================================\n'
printf ' QALLA WANAN R13 — READABLE NAV LABELS + SATELLITE + GPS\n'
printf '=================================================\n'

pkg install -y git nodejs >/dev/null
for required in package.json src/nav-map.js scripts/check-data.mjs public/data/nav/labels-native.geojson; do
  [ -s "$SOURCE/$required" ] || { echo "❌ پەکەجی R13 ناتەواوە: $required"; exit 1; }
done

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

[ -f "$TARGET/.env.local" ] && cp -f "$TARGET/.env.local" "$ENV_KEEP"

find "$TARGET" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env.local' -exec rm -rf -- {} +
tar -C "$SOURCE" --exclude='.git' --exclude='node_modules' --exclude='dist' -cf - . | tar -C "$TARGET" -xf -

if [ -f "$ENV_KEEP" ]; then cp -f "$ENV_KEEP" "$TARGET/.env.local"; rm -f "$ENV_KEEP"; fi

cd "$TARGET"
git config user.name "Sarhang Salah"
git config user.email "sarhang.salah9@gmail.com"
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$REPO_URL"; else git remote add origin "$REPO_URL"; fi
git branch -M main
[ "$(git remote get-url origin)" = "$REPO_URL" ] || { echo "❌ Remote هەڵەیە"; exit 1; }

printf '📦 69,000 ناو، فۆنتی ئەپ، قالبی NAV، Satellite و GPS دەپشکنرێن...\n'
npm install --no-audit --no-fund
npm run check
npm run build

node - <<'NODE'
const fs=require('fs');
const m=JSON.parse(fs.readFileSync('DATA_MANIFEST.json','utf8'));
if(m.source_records!==69000 || m.render_records!==69000) throw new Error('69,000 data contract failed');
if(m.coordinate_mutation!==0 || m.outside_canonical_boundary!==0) throw new Error('coordinate/boundary contract failed');
NODE

test -s public/data/nav/labels-major.geojson
test -s public/data/nav/labels-poi.geojson
test -s public/data/nav/labels-detail.geojson
test -s dist/data/nav/labels-major.geojson
test -s dist/data/nav/labels-poi.geojson
test -s dist/data/nav/labels-detail.geojson
grep -q "Noto Kufi Arabic" src/nav-map.js
grep -q "Vazirmatn" src/nav-map.js
grep -q "minzoom: 17.6" src/nav-map.js
grep -q "text-halo-width': 0" src/nav-map.js
! grep -q "toggle3D\|setTerrain\|navKurdToggle3D\|btn-layers" src/nav-map.js index.html

printf '📤 Push بۆ تەنها sarhang-cs/qalla-wanan...\n'
git add -A
if ! git diff --cached --quiet; then
  git commit -m "R13: readable app-font labels, compact NAV capsules, decluttered satellite map and stable GPS"
else
  echo "ℹ️ هیچ گۆڕانکارییەکی نوێ بۆ Commit نییە."
fi
git push -u origin main

printf '\n=================================================\n'
printf '✅ R13 Push کرا\n'
printf '✅ 69,000 تۆمار پارێزرا و پشکنرا\n'
printf '✅ ناوەکان native و جێگیرن، فۆنتی ئەپ خوێنراوە\n'
printf '✅ Satellite + GPS/route تەنها map runtime ـن\n'
printf '✅ Repo: https://github.com/sarhang-cs/qalla-wanan\n'
printf '✅ Backup: %s\n' "$BACKUP"
printf '=================================================\n'
