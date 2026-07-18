# SEZA POS — Android (Capacitor)

The Android app is a thin Capacitor WebView that loads the deployed
production site at `https://sezapos.com`. All authentication, POS,
Stripe, Supabase, and MCP calls continue to run against the live
Cloudflare Workers backend — the mobile app is only a shell.

Why: this repo is a TanStack Start SSR app. Capacitor cannot host the
SSR server, `createServerFn` RPCs, or the `/api/*` and `/mcp` routes,
so wrapping the deployed URL is the only path that keeps all shipped
features working unchanged.

## First-time setup (once per machine)

Requires Android Studio + JDK 17.

```bash
bun install
npx cap add android      # generates ./android on first run only
npx cap sync android
npx cap open android
```

## Day-to-day

Nothing on the JS side needs rebuilding for config changes to reach
the app — the shell always loads the live site. You only need to
sync when you change `capacitor.config.ts` or a native plugin:

```bash
npx cap sync android
npx cap open android     # then Run ▶ in Android Studio
```

## App identity

- Package / appId: `com.sezapos.app`
- App name: `SEZA POS`
- Splash / status bar color: `#1e40af`

Change these in `capacitor.config.ts`, then `npx cap sync android`.

## Switching to an offline / installable shell later

If you decide to ship a fully offline SPA instead of a remote URL:

1. Add a Vite SPA build target that emits static output (no SSR, no
   server routes) and points all data access at the deployed
   backend + Supabase over HTTPS.
2. In `capacitor.config.ts`, remove `server.url` and set
   `webDir` to the SPA output folder.
3. `npx cap sync android`.

That is a larger refactor and is intentionally out of scope for the
current wrapper.
