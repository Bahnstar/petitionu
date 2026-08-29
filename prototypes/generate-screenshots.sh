#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
OUT="$DIR/screenshots"
mkdir -p "$OUT"
echo "Generating screenshots to $OUT ..."

# Prefer http so Tailwind CDN loads reliably; fall back to file://
if curl -sf http://localhost:8001/index.html > /dev/null 2>&1; then
  BASE="http://localhost:8001"
else
  BASE="file://$DIR"
  echo "(no http server at :8001 — using file://; CDN may be slower)"
fi

for file in direction-a-editorial.html direction-b-civic.html direction-c-pulse.html index.html; do
  src="$BASE/$file"
  dest="$OUT/${file%.html}.png"
  echo "→ $file → $dest"
  npx playwright screenshot --full-page --viewport-size=1280,900 --wait-for-timeout=3000 "$src" "$dest"
done

# Mobile viewports (375×812) for key directions
for file in direction-a-editorial.html direction-b-civic.html direction-c-pulse.html; do
  src="$BASE/$file"
  dest="$OUT/${file%.html}-mobile.png"
  echo "→ $file (mobile) → $dest"
  npx playwright screenshot --full-page --viewport-size=375,812 --wait-for-timeout=3000 "$src" "$dest" || true
done

# Also generate a comparison composite (just copy for now)
echo "Done. Files:"
ls -lh "$OUT"
