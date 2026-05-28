# Startplatzbörse

Monorepo für Website (Astro) und Mobile App (Expo).

## Struktur

```
├── web/        Astro-Website (Vercel: Root Directory = web)
├── app/        Expo/React-Native-App (EAS Builds aus app/)
└── supabase/   Backend, Edge Functions, Migrationen (gemeinsam)
```

## Branches

| Branch | Zweck |
|--------|--------|
| `main` | Produktion (live) |
| `Version-2.0.0` | Entwicklung v2 — Monorepo & neue Features |

Wenn v2 fertig ist: `Version-2.0.0` in `main` mergen.

## Entwicklung

```bash
# Website
cd web && npm install && npm run dev

# App (nur dieser Ordner – nicht mehr startplatzboerse-app/Code/)
cd app && npm install && npm run start

# Vor eas build (ohne Wartezeit auf Cloud-Build):
cd app && npm run check
```

**Env:** Website nutzt `PUBLIC_*` in `.env` im **Repo-Root** (siehe `web/.env.example`). App nutzt `EXPO_PUBLIC_*` in `app/.env.local` (siehe `app/.env.example`). Nicht committen.

## Deploy

- **Web:** Vercel-Projekt mit Root Directory `web`
- **App:** `cd app && eas build` / `eas update`
