#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/sarhang-cs/qalla-wanan.git"
PROJECT="${HOME}/QALLA-WANAN-NAV-KURD-MAP-R1"
SOURCE_ROOT="$(cd "$(dirname "$0")" && pwd)"
TEMP_GIT="${HOME}/.qalla-r5-git-restore"

fail(){ printf '\n❌ %s\n' "$1" >&2; exit 1; }

[ -f "${SOURCE_ROOT}/package.json" ] || fail "پەکەجی R5 ناتەواوە"
[ -d "$PROJECT" ] || mkdir -p "$PROJECT"

printf '🔒 پاراستنی Git و Environment...\n'
if [ ! -d "$PROJECT/.git" ]; then
  rm -rf "$TEMP_GIT"
  git clone --single-branch --branch main --no-tags "$REPO_URL" "$TEMP_GIT"
  cp -a "$TEMP_GIT/.git" "$PROJECT/.git"
  rm -rf "$TEMP_GIT"
fi

ENV_BACKUP="${HOME}/.qalla-r5-env-backup"
rm -rf "$ENV_BACKUP"
mkdir -p "$ENV_BACKUP"
for file in .env.local .env; do
  [ -f "$PROJECT/$file" ] && cp -f "$PROJECT/$file" "$ENV_BACKUP/$file"
done

printf '🧹 گۆڕینی source ـی کۆن بە R5 ـی native...\n'
find "$PROJECT" -mindepth 1 -maxdepth 1 \
  ! -name '.git' ! -name '.env.local' ! -name '.env' \
  -exec rm -rf {} +

(
  cd "$SOURCE_ROOT"
  tar --exclude='./dist' --exclude='./TERMUX_INSTALL_R5_AND_PUSH.sh' -cf - .
) | (
  cd "$PROJECT"
  tar -xf -
)
cp -f "$SOURCE_ROOT/TERMUX_INSTALL_R5_AND_PUSH.sh" "$PROJECT/TERMUX_INSTALL_R5_AND_PUSH.sh"
chmod +x "$PROJECT/TERMUX_INSTALL_R5_AND_PUSH.sh"

for file in .env.local .env; do
  [ -f "$ENV_BACKUP/$file" ] && cp -f "$ENV_BACKUP/$file" "$PROJECT/$file"
done
rm -rf "$ENV_BACKUP"

cd "$PROJECT"
printf '📦 پشکنین و Build...\n'
npm install --no-audit --no-fund
npm run check
npm run build

[ -s "dist/data/nav/labels-native.geojson" ] || fail "labels-native.geojson نەچووەتە build"
[ -s "dist/data/nav/full-source/kri-base.pmtiles" ] || fail "kri-base.pmtiles نەچووەتە build"
[ -s "dist/fonts/UniQAIDAR_Hewal_031.ttf" ] || fail "فۆنت نەچووەتە build"

git config user.name "Sarhang Salah"
git config user.email "sarhang.salah9@gmail.com"
git remote set-url origin "$REPO_URL"
git branch -M main

git add -A
if ! git diff --cached --quiet; then
  git commit -m "R5 native map data: fixed labels GPS route and full dataset"
else
  printf 'ℹ️ هیچ گۆڕانکارییەکی نوێ نییە.\n'
fi

printf '🚀 Push بۆ sarhang-cs/qalla-wanan...\n'
git push -u origin main

printf '\n========================================\n'
printf '✅ R5 بە سەرکەوتوویی Push کرا\n'
printf '✅ ناوەکان native MapLibre symbol layer ـن\n'
printf '✅ Canvas/DOM overlay نییە\n'
printf '✅ GitHub: https://github.com/sarhang-cs/qalla-wanan\n'
printf '========================================\n'
