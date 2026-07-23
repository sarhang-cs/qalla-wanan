#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/sarhang-cs/qalla-wanan.git"
TARGET="$HOME/QALLA-WANAN-NAV-KURD-MAP-R1"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/QALLA-WANAN-backup-before-R15-$STAMP"
GIT_RESTORE="$HOME/.qalla-r15-git-restore"
ENV_KEEP="$HOME/.qalla-r15-env-local-$STAMP"
FONT_KEEP="$HOME/.qalla-r15-money-heist-font-$STAMP.ttf"
FONT_NAME="UniQAIDAR-Money-Heist-002.ttf"

printf '\n=================================================\n'
printf ' QALLA WANAN R15 — LARGE READABLE RTL LABELS\n'
printf '=================================================\n'

pkg install -y git nodejs >/dev/null
for required in package.json src/nav-map.js scripts/check-data.mjs public/data/nav/labels-native.geojson; do
  [ -s "$SOURCE/$required" ] || { echo "❌ پەکەجی R15 ناتەواوە: $required"; exit 1; }
done

# The user's font stays in Downloads. This installer finds it automatically,
# validates it, copies it into the project, builds it and commits it with the app.
FONT_SOURCE=""
for candidate in \
  "$HOME/storage/downloads/$FONT_NAME" \
  "/sdcard/Download/$FONT_NAME" \
  "$TARGET/public/fonts/$FONT_NAME"; do
  if [ -s "$candidate" ]; then FONT_SOURCE="$candidate"; break; fi
done
if [ -z "$FONT_SOURCE" ]; then
  FONT_SOURCE="$(find "$HOME/storage/downloads" /sdcard/Download "$TARGET/public/fonts" \
    -maxdepth 2 -type f \( \
      -iname 'UniQAIDAR-Money-Heist-002.ttf' -o \
      -iname 'UniQAIDAR*Money*Heist*002*.ttf' -o \
      -iname '*Money*Heist*002*.ttf' \
    \) 2>/dev/null | head -n 1 || true)"
fi
if [ -z "$FONT_SOURCE" ] || [ ! -s "$FONT_SOURCE" ]; then
  echo "❌ فۆنتەکە لە Downloads نەدۆزرایەوە"
  echo "فایلەکە بەم ناوە بخەرە Downloads: $FONT_NAME"
  exit 1
fi
FONT_BYTES="$(wc -c < "$FONT_SOURCE" | tr -d ' ')"
if [ "$FONT_BYTES" -lt 20000 ]; then
  echo "❌ فایلی فۆنت ناتەواو یان خراپە: $FONT_SOURCE"
  exit 1
fi
cp -f "$FONT_SOURCE" "$FONT_KEEP"
echo "✅ فۆنت خۆکارانە دۆزرایەوە: $FONT_SOURCE ($FONT_BYTES bytes)"

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
mkdir -p "$TARGET/public/fonts"
cp -f "$FONT_KEEP" "$TARGET/public/fonts/$FONT_NAME"
rm -f "$FONT_KEEP"

cd "$TARGET"
git config user.name "Sarhang Salah"
git config user.email "sarhang.salah9@gmail.com"
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$REPO_URL"; else git remote add origin "$REPO_URL"; fi
git branch -M main
[ "$(git remote get-url origin)" = "$REPO_URL" ] || { echo "❌ Remote هەڵەیە"; exit 1; }

printf '📦 فۆنت، RTL، قەبارەی ناوەکان، 69,000 شوێن، Satellite و GPS دەپشکنرێن...\n'
npm install --no-audit --no-fund
npm run check
npm run build

node - <<'NODE'
const fs=require('fs');
const m=JSON.parse(fs.readFileSync('DATA_MANIFEST.json','utf8'));
if(m.source_records!==69000 || m.render_records!==69000) throw new Error('69,000 data contract failed');
if(m.coordinate_mutation!==0 || m.outside_canonical_boundary!==0) throw new Error('coordinate/boundary contract failed');
for (const file of [
  'public/fonts/UniQAIDAR-Money-Heist-002.ttf',
  'dist/fonts/UniQAIDAR-Money-Heist-002.ttf',
  'public/data/nav/labels-major.geojson',
  'public/data/nav/labels-poi.geojson',
  'public/data/nav/labels-detail.geojson'
]) if (!fs.existsSync(file) || fs.statSync(file).size===0) throw new Error(`missing build asset: ${file}`);
NODE

grep -q "UniQAIDAR_Money Heist 002" src/nav-map.js
grep -q "UniQAIDAR-Money-Heist-002.ttf" src/nav-map.css
grep -q 'const width = 44' src/nav-map.js
grep -q "text-halo-width': 0" src/nav-map.js
! grep -q 'toggle3D\|setTerrain\|navKurdToggle3D\|btn-layers' src/nav-map.js index.html

printf '📤 Push بۆ تەنها sarhang-cs/qalla-wanan...\n'
git add -A
if ! git diff --cached --quiet; then
  git commit -m "R15: install map font automatically and enlarge readable Kurdish Arabic labels"
else
  echo "ℹ️ هیچ گۆڕانکارییەکی نوێ بۆ Commit نییە."
fi
git push -u origin main

printf '\n=================================================\n'
printf '✅ R15 Push کرا\n'
printf '✅ فۆنت خۆکارانە لە Downloads گوازرایەوە و لەگەڵ ئەپ upload کرا\n'
printf '✅ فۆنتی UI ـی ئەپ نەگۆڕدرا\n'
printf '✅ ناوی کوردی/عەرەبی گەورە، خوێنراو و RTL ـیان ڕێکخرا\n'
printf '✅ 69,000 تۆمار، Satellite، GPS و route پارێزرا\n'
printf '✅ Repo: https://github.com/sarhang-cs/qalla-wanan\n'
printf '✅ Backup: %s\n' "$BACKUP"
printf '=================================================\n'
