# SEZA POS — Android (Capacitor, bundled)

The Android app is a bundled Capacitor application. Its web assets ship inside the APK under `android-webdir/`; the WebView does not depend on a remote homepage to render the register.

Backend traffic still uses HTTPS:

- Supabase authentication and RLS-scoped data access use the configured Supabase project.
- Public POS/API functions use `https://sezapos.com` unless a different production API base is supplied at build time.
- Offline cash operations use IndexedDB queues and synchronize after connectivity returns.

## Requirements

- Node version from `.nvmrc` (Node 24)
- npm
- Android Studio
- JDK 17 or newer supported by the included Android Gradle setup

## First-time setup

```bash
npm ci
npm run android:build
npx cap add android          # only when ./android does not exist
npm run android:assets
npm run android:sync
npx cap open android
```

## Day-to-day Android build

```bash
npm run android:sync
npx cap open android
```

`android:sync` rebuilds the bundled shell and runs Capacitor sync. Do not hand-edit `android-webdir/` because it is generated.

## Android shell locations

- `capacitor-shell/` — bundled React application
- `capacitor-shell/index.html` — static loading fallback shown before React
- `capacitor-shell/main.tsx` — startup/session/pairing bootstrap
- `capacitor-shell/screens/BootFailureScreen.tsx` — white-screen recovery UI
- `vite.capacitor.config.ts` — standalone Vite configuration
- `capacitor.config.ts` — native Capacitor settings
- `android/` — native Android project

## Barcode scanner policy

The dedicated Android POS uses physical USB or Bluetooth HID/wedge scanners. The scanner sends barcode characters like a keyboard and the register automatically searches the catalog. The unused ML Kit camera-scanner plugin is intentionally removed from the APK.

## Branding

Launcher icons and splash assets come from `resources/`:

```bash
npm run android:assets
npm run android:sync
```

## Startup flow

1. Android shows the native SEZA splash.
2. `capacitor-shell/index.html` immediately shows a static branded loading screen.
3. React validates public configuration and initializes pairing/session state with timeouts.
4. The native splash is hidden even when startup fails.
5. A recoverable error screen appears instead of a blank WebView when initialization cannot complete.

## App identity

- Package/app ID: `com.sezapos.app`
- App name: `SEZA POS`
- Current release: 1.3.2
- Android build: 8
