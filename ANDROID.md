# SEZA POS — Android (Capacitor)

The Android app is a thin Capacitor WebView over the deployed production
site at `https://sezapos.com/auth?native=1`. All authentication, POS,
Stripe, Supabase, MCP, and screen-share features continue to run against
the live Cloudflare Workers backend — the mobile app is only a shell.

## First-time setup (per machine)

Requires Android Studio + JDK 17.

```bash
bun install
npx cap add android          # generates ./android on first run only
bun run android:assets       # generate launcher icons + splash from resources/
bun run android:sync         # copy config + assets into android/
npx cap open android
```

## Day-to-day

The shell always loads the live site, so JS/UI changes deploy through
the normal pipeline. Re-sync only when native config or plugins change:

```bash
bun run android:sync
npx cap open android         # then Run ▶ in Android Studio
```

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

This replaces every default Capacitor / Android placeholder — launcher
icon, round icon, adaptive icon, Android 13 themed icon, notification
icon, and splash — with the SEZA identity.

## Native startup flow

1. Android launches the native splash (SEZA blue background + logo,
   `launchAutoHide: false`).
2. The WebView opens directly at `/auth?native=1` — never the marketing
   homepage, pricing, features, dashboard, or admin.
3. React mounts a full-screen branded loading overlay (`NativeLoadingOverlay`)
   and immediately calls `SplashScreen.hide()` — no white flash.
4. When the destination route (Employee PIN or POS Register) has hydrated,
   the overlay fades out.
5. Authenticated users skip the PIN screen entirely (existing session ->
   redirected to `/pos`).

The root router guard in `src/routes/__root.tsx` continues to block any
navigation to marketing / owner / admin routes while in native mode.

## App identity

- Package / appId: `com.sezapos.app`
- App name: `SEZA POS`
- Theme / splash color: `#1e40af`
