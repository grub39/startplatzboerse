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

# App
cd app && npm install && npm run start
```

Kopiere jeweils `.env.example` nach `.env` (nicht committen).

## Deploy

- **Web:** Vercel-Projekt mit Root Directory `web`
- **App:** `cd app && eas build` / `eas update`
