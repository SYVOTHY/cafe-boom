#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  generate-icons.sh
#  Generates all PWA icon sizes from a single source image.
#
#  Requirements: ImageMagick (brew install imagemagick / apt install imagemagick)
#
#  Usage:
#    chmod +x generate-icons.sh
#    ./generate-icons.sh logo.png
#
#  Output: public/icons/icon-{size}.png  (all 8 sizes)
# ═══════════════════════════════════════════════════════════════════

SOURCE="${1:-logo.png}"
OUT_DIR="public/icons"

if [ ! -f "$SOURCE" ]; then
  echo "❌ Source image not found: $SOURCE"
  echo "   Usage: ./generate-icons.sh your-logo.png"
  exit 1
fi

if ! command -v convert &>/dev/null; then
  echo "❌ ImageMagick not installed."
  echo "   macOS:  brew install imagemagick"
  echo "   Ubuntu: sudo apt install imagemagick"
  exit 1
fi

mkdir -p "$OUT_DIR"

SIZES=(72 96 128 144 152 192 384 512)

for SIZE in "${SIZES[@]}"; do
  OUT="$OUT_DIR/icon-${SIZE}.png"
  convert "$SOURCE" \
    -resize "${SIZE}x${SIZE}" \
    -background "#09080A" \
    -gravity center \
    -extent "${SIZE}x${SIZE}" \
    "$OUT"
  echo "✅ Generated: $OUT (${SIZE}x${SIZE})"
done

echo ""
echo "🎉 All icons generated in $OUT_DIR/"
echo "   Make sure to copy this folder into your public/ directory."
