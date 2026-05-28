#!/usr/bin/env bash
# App-Icons aus dem Quell-Logo erzeugen (1024×1024, Safe Zone ~66 % für Android).
# Voraussetzung: ImageMagick (magick)
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE="${1:-assets/logo.png}"
SIZE=1024
# ~50 % der Kantenlänge: Android-Maske schneidet stark zu (Kreis/Squircle)
SAFE=520
BG="#323232"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick fehlt. Install: sudo pacman -S imagemagick  (oder apt install imagemagick)"
  exit 1
fi

if [[ ! -f "$SOURCE" ]]; then
  echo "Quelldatei nicht gefunden: $SOURCE"
  exit 1
fi

echo "Quelle: $SOURCE"
# Optional: quadratische Hilfsdateien – app.json nutzt direkt assets/logo.png
magick "$SOURCE" -resize "${SAFE}x${SAFE}>" -background "$BG" -alpha remove -gravity center -extent "${SIZE}x${SIZE}" assets/logo-square.png
magick "$SOURCE" -resize 48x48\> -background "$BG" -alpha remove -gravity center -extent 48x48 assets/favicon.png

echo "Erstellt (optional):"
echo "  assets/logo-square.png (nur falls du eine quadratische Variante brauchst)"
echo "  assets/favicon.png"
echo "App-Icon in app.json: assets/logo.png"
echo ""
echo "Danach natives Projekt aktualisieren:"
echo "  npx expo prebuild --platform android,ios"
echo "  oder neuer EAS Build"
