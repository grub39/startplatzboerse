# App im Monorepo – was zählt

Dieses Repo ist **kein** Turborepo/Nx-Workspace. `web/`, `app/` und `supabase/` sind **getrennte Ordner** mit jeweils eigenem `package.json` und eigenem `node_modules`.

## Kein Shared-Package-Problem

Die App importiert **nichts** aus `../web/`. Splash-Crashes kommen hier **nicht** von Metro-Workspaces oder `@shared/*`-Aliases.

## Richtig arbeiten

```bash
cd app          # immer hier: Metro, eas build, npm install
npm run check   # Env + Bundle + natives Manifest
```

**Nicht** aus dem Monorepo-Root `expo start` (Root-`.env` ist `PUBLIC_*` für Astro, nicht `EXPO_PUBLIC_*` für die App).

## Logo

- `assets/logo-original-wide.png` – Original (breit)
- `assets/logo.png` – **quadratisch 1024×1024** für Icon/Splash (von Expo verlangt)

Breites `logo.png` (12500×8334) hat laut `expo-doctor` zu nativen Build-/Splash-Problemen geführt.
