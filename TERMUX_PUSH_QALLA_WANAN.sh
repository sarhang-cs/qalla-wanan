#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/sarhang-cs/qalla-wanan.git"
BRANCH="main"
PROJECT_DIR="${1:-$PWD}"

pkg update -y
pkg install -y git nodejs
cd "$PROJECT_DIR"

if [ ! -f package.json ]; then
  echo "package.json لەم فۆڵدەدا نییە: $PROJECT_DIR" >&2
  exit 1
fi

npm install
npm run check
npm run build

git config --global user.name "Sarhang Salah"
git config --global user.email "sarhang.salah9@gmail.com"

if [ ! -d .git ]; then git init; fi
git branch -M "$BRANCH"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -m "Integrate NAV KURD satellite map into index87"
fi

git push -u origin "$BRANCH"
echo "تەواو: $REPO_URL"
