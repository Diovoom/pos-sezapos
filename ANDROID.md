# SEZA POS — Android (Capacitor, bundled)

The Android app is a **bundled** Capacitor application. All web assets ship
inside the APK under `android-webdir/`; the WebView loads them instantly
via the `capacitor://` scheme with **no remote HTML fetch on launch**.

Backend access happens over HTTPS from the bundled JS:
- Supabase auth + RLS-scoped reads/writes go directly to Supabase.
- Server functions and public API routes go to `https://sezapos.com`.

This split is the foundation for offline mode: local reads can be served
from IndexedDB, and writes can be queued against the same base URL when
the network returns.

## First-time setup (per machine)

Requires Android Studio + JDK 17.

```bash
bun install
bun run android:build        # build the bundled SPA into android-webdir/
npx cap add android          # generates ./android on first run only
bun run android:assets       # generate launcher icons + splash from resources/
bun run android:sync         # rebuild shell + copy config + assets into android/
npx cap open android
```

## Day-to-day

The shell is bundled, so JS/UI changes must be rebuilt and re-synced:

```bash
bun run android:sync         # runs android:build then cap sync
npx cap open android         # then Run ▶ in Android Studio
```

## Where the bundled shell lives

- `capacitor-shell/` — source for the bundled SPA (React, Supabase client,
  splash / auth / register screens).
- `vite.capacitor.config.ts` — standalone Vite build config (does NOT use
  TanStack Start; the Android app has no server).
- `android-webdir/` — build output packaged into the APK. Regenerated on
  every `android:build`. Do not hand-edit.

## Branding

All Android launcher icons and the native splash screen are generated
from files in `resources/` via `@capacitor/assets`:

- `resources/icon.png` — 1024×1024 launcher icon (SEZA logo on blue)
- `resources/icon-foreground.png` — Android 13+ adaptive/themed icon
- `resources/icon-background.png` — solid SEZA blue background layer
- `resources/splash.png` / `splash-dark.png` — 2732×2732 splash artwork

Regenerate after any brand change:

```bash
bun run android:assets && bun run android:sync
```

## Native startup flow

1. Android launches the native splash (SEZA blue background + logo,
   `launchAutoHide: false`).
2. The WebView loads `android-webdir/index.html` instantly from disk.
3. React mounts, restores any cached Supabase session from localStorage,
   then calls `SplashScreen.hide()`.
4. Users with a valid session land on the POS register; others see the
   employee sign-in screen.

## App identity

- Package / appId: `com.sezapos.app`
- App name: `SEZA POS`
- Theme / splash color: `#1e40af`
