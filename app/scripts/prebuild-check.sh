#!/usr/bin/env bash
# Schnellcheck vor eas build – kein nativer Build nötig.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

warn() { echo "❌ $*"; FAIL=1; }
ok() { echo "✅ $*"; }

if command -v magick >/dev/null 2>&1 && [[ -f assets/logo.png ]]; then
  dims=$(magick identify -format '%wx%h' assets/logo.png 2>/dev/null || true)
  if [[ "$dims" != *x* ]]; then
    warn "assets/logo.png konnte nicht gelesen werden"
  elif [[ "${dims%%x*}" != "${dims##*x}" ]]; then
    warn "assets/logo.png ist nicht quadratisch ($dims) – nativer Splash/Icon-Absturz möglich"
  else
    ok "assets/logo.png ist quadratisch ($dims)"
  fi
fi

echo "=== Startplatzbörse App Pre-Build Check ==="
echo "Verzeichnis: $ROOT"
echo ""

if [[ -x "$ROOT/scripts/audit-env.sh" ]]; then
  bash "$ROOT/scripts/audit-env.sh" || true
  echo ""
fi

# 1) Richtiges Projekt (Monorepo app/, nicht alter Code/-Ordner)
if [[ "$ROOT" == *"startplatzboerse-app/Code"* ]]; then
  warn "Du bist im ALTEN Ordner startplatzboerse-app/Code – bitte nur startplatzboerse/app/ nutzen!"
else
  ok "Projektpfad ist app/ im Monorepo"
fi

# 2) Env lokal (Metro)
if [[ -f .env.local ]] || [[ -f .env ]]; then
  ok "Lokale Env-Datei vorhanden (.env.local oder .env)"
  # shellcheck disable=SC1091
  set -a
  [[ -f .env.local ]] && source .env.local
  [[ -f .env ]] && source .env
  set +a
  if [[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" && -n "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
    ok "Supabase-Keys in lokaler Env gesetzt"
  else
    warn "EXPO_PUBLIC_SUPABASE_* fehlen in .env.local"
  fi
else
  warn "Keine .env.local – Metro startet ohne Keys (EAS-Build hat Keys aus eas.json)"
fi

# 3) EAS env
if node -e "
const j=require('./eas.json');
const e=j.build?.development?.env||{};
if(!e.EXPO_PUBLIC_SUPABASE_URL||!e.EXPO_PUBLIC_SUPABASE_ANON_KEY) process.exit(1);
"; then
  ok "eas.json development: Supabase-Keys gesetzt"
else
  warn "eas.json development: Supabase-Keys fehlen"
fi

# 4) Crash-Muster im Quellcode
if grep -E "Updates\.reloadAsync\s*\(" App.tsx >/dev/null 2>&1; then
  warn "App.tsx ruft Updates.reloadAsync() auf – Kaltstart-Absturz möglich"
else
  ok "Kein Updates.reloadAsync()-Aufruf in App.tsx"
fi

if grep -q "throw new Error('Missing EXPO_PUBLIC" src/lib/supabase.ts 2>/dev/null; then
  warn "supabase.ts wirft beim Import – fehlende Keys = sofortiger Crash"
else
  ok "supabase.ts wirft nicht beim Import"
fi

if [[ -f app.config.js ]]; then
  ok "app.config.js vorhanden (Updates-Steuerung)"
else
  warn "app.config.js fehlt"
fi

if [[ -f android/gradle.properties ]] && grep -q '^newArchEnabled=true' android/gradle.properties; then
  warn "New Architecture aktiv – kann Splash-Abstürze verursachen (app.json: newArchEnabled: false + prebuild)"
fi

MANIFEST="android/app/src/main/AndroidManifest.xml"
if [[ -f "$MANIFEST" ]]; then
  if grep -q 'expo.modules.updates.ENABLED" android:value="true"' "$MANIFEST" \
    && grep -q 'EXPO_UPDATES_CHECK_ON_LAUNCH" android:value="ALWAYS"' "$MANIFEST"; then
    warn "AndroidManifest: expo-updates ALWAYS aktiv – Dev-Client kann am Splash crashen"
  else
    ok "AndroidManifest: kein aggressives OTA beim Start"
  fi
else
  warn "android/ fehlt – nach Änderungen: npx expo prebuild --platform android"
fi

# 5) JS-Bundle (ohne APK)
echo ""
echo "Bundle-Test (Metro export)…"
TMP="${TMPDIR:-/tmp}/spb-prebuild-$$"
if npx expo export --platform android --output-dir "$TMP" >/dev/null 2>&1; then
  ok "Android-JS-Bundle baut fehlerfrei"
  rm -rf "$TMP"
else
  warn "expo export fehlgeschlagen – Syntax/Import-Fehler im JS"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "=== Alles OK – ein Build ist sinnvoll. ==="
  echo "EAS nur aus diesem Ordner: cd app && eas build --profile development"
  exit 0
fi
echo "=== Bitte Fehler beheben, DANN erst eas build. ==="
exit 1
