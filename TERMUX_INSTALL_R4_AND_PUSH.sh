#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/sarhang-cs/qalla-wanan.git"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_PROJECT="$HOME/QALLA-WANAN-NAV-KURD-MAP-R1"
PROJECT="$DEFAULT_PROJECT"

if [ ! -f "$PROJECT/package.json" ]; then
  FOUND=""
  while IFS= read -r CANDIDATE; do
    CANDIDATE_DIR="$(dirname "$CANDIDATE")"
    [ "$CANDIDATE_DIR" = "$SOURCE_DIR" ] && continue
    case "$CANDIDATE_DIR" in
      "$HOME/.qalla-r4-run"*) continue ;;
    esac
    FOUND="$CANDIDATE"
    break
  done < <(find "$HOME" -maxdepth 6 -type f -name package.json 2>/dev/null | grep -Ei '/[^/]*(qalla|wanan|nav-kurd)[^/]*/package.json$' || true)
  [ -n "$FOUND" ] && PROJECT="$(dirname "$FOUND")"
fi

if [ ! -f "$PROJECT/package.json" ]; then
  echo "❌ پڕۆژەکە لە Termux نەدۆزرایەوە"
  echo "فۆڵدەری پێشبینی‌کراو: $DEFAULT_PROJECT"
  exit 1
fi

if [ "$SOURCE_DIR" = "$PROJECT" ]; then
  echo "❌ ZIP ـی R4 دەبێت لە فۆڵدەرێکی جیاواز بکرێتەوە"
  exit 1
fi

CURRENT_REMOTE="$(git -C "$PROJECT" remote get-url origin 2>/dev/null || true)"
if [ -n "$CURRENT_REMOTE" ] && [ "$CURRENT_REMOTE" != "$REPO_URL" ]; then
  echo "⚠️  origin ـی کۆن: $CURRENT_REMOTE"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/qalla-wanan-backup-r4-$STAMP"
mkdir -p "$BACKUP"

# Backup source without heavy generated/cache directories.
tar -C "$PROJECT" \
  --exclude='.git' --exclude='node_modules' --exclude='dist' \
  -czf "$BACKUP/project-before-r4.tar.gz" .

ENV_BACKUP=""
[ -f "$PROJECT/.env.local" ] && ENV_BACKUP="$BACKUP/.env.local"
[ -n "$ENV_BACKUP" ] && cp -f "$PROJECT/.env.local" "$ENV_BACKUP"

# Full replacement: keep only repository identity and local private environment.
find "$PROJECT" -mindepth 1 -maxdepth 1 \
  ! -name '.git' ! -name '.env.local' \
  -exec rm -rf {} +

cp -a "$SOURCE_DIR"/. "$PROJECT"/
rm -rf "$PROJECT/node_modules" "$PROJECT/dist"
[ -n "$ENV_BACKUP" ] && cp -f "$ENV_BACKUP" "$PROJECT/.env.local"

cd "$PROJECT"

pkg install -y nodejs git >/dev/null
npm install --no-audit --no-fund
npm run check
npm run build

[ -s "public/fonts/UniQAIDAR_Hewal_031.ttf" ] || { echo "❌ فۆنت لە source نییە"; exit 1; }
[ -s "dist/fonts/UniQAIDAR_Hewal_031.ttf" ] || { echo "❌ فۆنت نەچووەتە build"; exit 1; }
[ -s "dist/data/nav/labels.compact.json" ] || { echo "❌ داتای ناوەکان نەچووەتە build"; exit 1; }

git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
ACTUAL_REMOTE="$(git remote get-url origin)"
[ "$ACTUAL_REMOTE" = "$REPO_URL" ] || { echo "❌ origin ڕاست نییە: $ACTUAL_REMOTE"; exit 1; }

git branch -M main
git add -A
if ! git diff --cached --quiet; then
  git commit -m "R4 root fix: stable georeferenced labels GPS and route"
else
  echo "ℹ️ هیچ گۆڕانکارییەکی نوێ نییە"
fi
git push -u origin main

echo ""
echo "✅ R4 بە تەواوی دامەزرا و push کرا"
echo "✅ Repo: https://github.com/sarhang-cs/qalla-wanan"
echo "✅ Backup: $BACKUP/project-before-r4.tar.gz"
echo "✅ GitHub Actions خۆکارانە deploy دەکات"
