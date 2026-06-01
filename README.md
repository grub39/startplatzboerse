# Startplatzbörse

Monorepo für Website (Astro) und Mobile App (Expo)

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

## Firebase API Key

The `google-services.json` files (`app/google-services.json` and `app/android/app/google-services.json`)
contain a placeholder for the Firebase API key (`FIREBASE_API_KEY_REMOVED_SEE_README`).

To build the app, replace the placeholder with the real key from the Firebase Console:
1. Open [Firebase Console](https://console.firebase.google.com/) → Project `startplatzboerse-19425`
2. Go to Project Settings → Your apps → Android app
3. Download the `google-services.json` and place it in both locations above

**Do not commit the real API key to this repository.**
