#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
SOURCE="${1:-/sdcard/Download/UniQAIDAR_Hewal 031.ttf}"
TARGET="$(cd "$(dirname "$0")/.." && pwd)/public/fonts/UniQAIDAR_Hewal_031.ttf"
if [ ! -f "$SOURCE" ]; then
  echo "فۆنت نەدۆزرایەوە: $SOURCE" >&2
  echo 'نموونە: bash scripts/install-font.sh "/sdcard/Download/UniQAIDAR_Hewal 031.ttf"' >&2
  exit 1
fi
mkdir -p "$(dirname "$TARGET")"
cp "$SOURCE" "$TARGET"
echo "فۆنت دانرا: $TARGET"
