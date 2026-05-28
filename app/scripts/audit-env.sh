#!/usr/bin/env bash
# Prüft alle Env-Quellen der App – ohne Secrets auszugeben.
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP/.." && pwd)"
FAIL=0

warn() { echo "❌ $*"; FAIL=1; }
ok() { echo "✅ $*"; }
info() { echo "ℹ️  $*"; }

get_url() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  grep -E '^(EXPO_PUBLIC_|PUBLIC_)?SUPABASE_URL=' "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d ' "'\''\r' || true
}

get_key_len() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  grep -E '^(EXPO_PUBLIC_|PUBLIC_)?SUPABASE_ANON_KEY=' "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d ' "'\''\r' | wc -c
}

echo "=== Env-Audit Startplatzbörse App ==="
echo "App:  $APP"
echo "Root: $ROOT"
echo ""

# --- app/.env.local (Metro) ---
if [[ -f "$APP/.env.local" ]]; then
  if grep -q '^EXPO_PUBLIC_SUPABASE_' "$APP/.env.local"; then
    ok "app/.env.local nutzt EXPO_PUBLIC_* (korrekt für Expo)"
  else
    warn "app/.env.local ohne EXPO_PUBLIC_* – Expo ignoriert PUBLIC_* Variablen!"
  fi
else
  warn "app/.env.local fehlt – lokal nur mit eas.json-Keys im Build, Metro evtl. ohne Keys"
fi

# --- app/.env (optional, oft Verwirrung) ---
if [[ -f "$APP/.env" ]]; then
  info "app/.env existiert"
  if grep -q '^EXPO_PUBLIC_SUPABASE_' "$APP/.env"; then
    local_url=$(get_url "$APP/.env")
    local_len=$(get_key_len "$APP/.env")
    info "  app/.env host: ${local_url:-?} | key length: ${local_len:-0}"
  else
    warn "app/.env ohne EXPO_PUBLIC_* – wird von Expo nicht gelesen (oder nur als Fallback)"
  fi
  if [[ -f "$APP/.env.local" ]]; then
    u_env=$(get_url "$APP/.env")
    u_local=$(get_url "$APP/.env.local")
    if [[ -n "$u_env" && -n "$u_local" && "$u_env" != "$u_local" ]]; then
      warn "app/.env und app/.env.local haben UNTERSCHIEDLICHE Supabase-URLs – gilt: .env.local gewinnt bei Metro"
    else
      ok "app/.env und app/.env.local: gleiche URL (oder eine leer)"
    fi
    l_env=$(get_key_len "$APP/.env")
    l_local=$(get_key_len "$APP/.env.local")
    if [[ -n "$l_env" && -n "$l_local" && "$l_env" != "$l_local" ]]; then
      warn "app/.env und app/.env.local haben UNTERSCHIEDLICHE Key-Längen – .env.local gewinnt bei Metro"
    fi
  fi
else
  ok "Kein app/.env (gut – weniger Verwirrung; nur .env.local reicht)"
fi

# --- Monorepo-Root .env (Web / Astro) ---
if [[ -f "$ROOT/.env" ]]; then
  if grep -q '^PUBLIC_SUPABASE_' "$ROOT/.env" && ! grep -q '^EXPO_PUBLIC_' "$ROOT/.env"; then
    ok "Root .env ist für die Website (PUBLIC_*), nicht für die App – Expo in app/ ignoriert das"
  elif grep -q '^EXPO_PUBLIC_' "$ROOT/.env"; then
    info "Root .env enthält EXPO_PUBLIC_* – Expo lädt das nur, wenn du aus app/ startest und .env dort vererbt wird (normalerweise nicht)"
  fi
  root_url=$(get_url "$ROOT/.env")
  app_url=$(get_url "$APP/.env.local")
  if [[ -n "$root_url" && -n "$app_url" && "$root_url" == "$app_url" ]]; then
    ok "Root .env und app/.env.local: gleiche Supabase-Instanz ($root_url)"
  elif [[ -n "$root_url" && -n "$app_url" ]]; then
    warn "Root .env und app/.env.local zeigen auf verschiedene URLs!"
    echo "     Root: $root_url"
    echo "     App:  $app_url"
  fi
fi

# --- eas.json ---
eas_url=$(node -e "console.log(require('$APP/eas.json').build.development.env.EXPO_PUBLIC_SUPABASE_URL||'')")
eas_len=$(node -e "const k=require('$APP/eas.json').build.development.env.EXPO_PUBLIC_SUPABASE_ANON_KEY||''; console.log(k.length)")
if [[ -n "$eas_url" && "$eas_len" -gt 50 ]]; then
  ok "eas.json development: EXPO_PUBLIC_* gesetzt (URL: $eas_url)"
else
  warn "eas.json development: Supabase-Env unvollständig – EAS-Build ohne Keys!"
fi

app_local_url=$(get_url "$APP/.env.local")
if [[ -n "$app_local_url" && -n "$eas_url" && "$app_local_url" != "$eas_url" ]]; then
  warn "Metro (.env.local) und EAS (eas.json) nutzen verschiedene Supabase-URLs!"
elif [[ -n "$app_local_url" ]]; then
  ok "Metro und EAS: gleiche Supabase-URL"
fi

# --- Crash-Risiko alter supabase.ts ---
if grep -q "throw new Error('Missing EXPO_PUBLIC" "$APP/src/lib/supabase.ts" 2>/dev/null; then
  warn "supabase.ts wirft beim Import ohne Keys → sofortiger Splash-Crash in Release-Builds"
else
  ok "supabase.ts crasht nicht mehr beim Import (zeigt Konfig-Screen wenn Keys fehlen)"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "=== Env-Audit: keine Konflikte ==="
else
  echo "=== Env-Audit: Konflikte beheben (siehe oben) ==="
fi
exit "$FAIL"
