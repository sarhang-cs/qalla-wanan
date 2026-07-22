#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT="$HOME/QALLA-WANAN-NAV-KURD-MAP-R1"
if [ ! -d "$PROJECT/.git" ]; then
  PACKAGE_FILE="$(find "$HOME" -maxdepth 5 -type f -name package.json 2>/dev/null | grep -Ei 'qalla|wanan' | head -n 1 || true)"
  [ -n "$PACKAGE_FILE" ] && PROJECT="$(dirname "$PACKAGE_FILE")"
fi
[ -d "$PROJECT/.git" ] || { echo '❌ فۆڵدەری Git ـی qalla-wanan نەدۆزرایەوە'; exit 1; }
DOWNLOADS="$HOME/storage/downloads"
ZIP="$(find "$DOWNLOADS" /sdcard/Download -maxdepth 1 -type f -iname 'QALLA-WANAN-NAV-KURD-MAP-R2-FIX*.zip' 2>/dev/null | head -n 1 || true)"

[ -n "$ZIP" ] || { echo '❌ ZIP ـی R2 لە Downloads نەدۆزرایەوە'; exit 1; }

FONT="$(find "$DOWNLOADS" /sdcard/Download "$PROJECT/public/fonts" -maxdepth 1 -type f \
  \( -iname 'UniQAIDAR_Hewal 031.ttf' -o -iname 'UniQAIDAR_Hewal_031.ttf' -o -iname '*QAIDAR*Hewal*.ttf' \) \
  2>/dev/null | head -n 1 || true)"

BACKUP="$HOME/qalla-wanan-backup-$(date +%Y%m%d-%H%M%S)"
[ -d "$PROJECT" ] && cp -a "$PROJECT" "$BACKUP"

TMP="$HOME/.qalla-r2-tmp"
rm -rf "$TMP"
mkdir -p "$TMP"
unzip -q -o "$ZIP" -d "$TMP"
SRC="$TMP/QALLA-WANAN-NAV-KURD-MAP-R2-FIX"
[ -d "$SRC" ] || { echo '❌ ناوەڕۆکی ZIP هەڵەیە'; exit 1; }

mkdir -p "$PROJECT"
cp -a "$SRC"/. "$PROJECT"/

if [ -n "$FONT" ]; then
  mkdir -p "$PROJECT/public/fonts"
  cp -f "$FONT" "$PROJECT/public/fonts/UniQAIDAR_Hewal_031.ttf"
  echo '✅ فۆنت دانرا'
else
  echo '⚠️ فۆنت نەدۆزرایەوە؛ fallback font بەکاردێت'
fi

cd "$PROJECT"
npm install --no-audit --no-fund
npm run check
npm run build

git config --global user.name 'Sarhang Salah'
git config --global user.email 'sarhang.salah9@gmail.com'
[ -d .git ] || git init
git branch -M main
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin https://github.com/sarhang-cs/qalla-wanan.git
else
  git remote add origin https://github.com/sarhang-cs/qalla-wanan.git
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -m 'Fix map labels, onboarding button and GitHub Pages variables'
fi
git push -u origin main
rm -rf "$TMP"
echo '✅ R2 push کرا بۆ https://github.com/sarhang-cs/qalla-wanan'
