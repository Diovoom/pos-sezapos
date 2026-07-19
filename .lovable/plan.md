This is a large, multi-phase migration. Below is the plan I'll execute in order. I'll pause for your approval before shipping code because it touches auth, public HTTPS endpoints, and every POS route.

## Phase 1 — Public HTTPS endpoints for native auth

The bundled shell can't call `createServerFn` (those are RPC over the same TanStack origin), so I'll add signed public routes the Android app posts to over HTTPS to `sezapos.com`:

- `POST /api/public/pos/verify-employee-pin` — body `{ store_code, employee_id, pin }` → returns a Supabase session (email/password sign-in server-side using a per-employee shadow password derived from the PIN hash, OR mint a short-lived magic link and exchange). Concretely: verify PIN with `verifyPin`, then use `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })` and return `{ access_token, refresh_token }` from `verifyOtp` server-side. Rate-limited, audited.
- `POST /api/public/pos/verify-manager-pin` — body `{ store_id, pin }` → returns `{ ok, manager_id, override_token }` for refunds/voids/age/payouts. Token is a signed JWT (HMAC with `SUPABASE_JWT_SECRET`) with 5 min TTL and action scope; server-side callers verify before privileged writes.
- Both routes verify a shared `X-Seza-Native-Key` header (new secret `NATIVE_APP_SHARED_KEY`) plus per-store rate limits, and write to `audit_log`.

## Phase 2 — Android auth flow

Replace `AuthScreen` email/password with:
1. **Store code entry** (once, persisted in localStorage).
2. **6-digit PIN pad** (large touch targets, native feel).
3. On success → session set via `supabase.auth.setSession(...)`.
4. Route to `/timeclock` if not clocked in, else `/pos`.

No email input anywhere in Android.

## Phase 3 — Route every production page in the shell router

Replace all `placeholder(...)` calls in `capacitor-shell/router.tsx` with the real production route components, imported the same way `PosPage` already is:

- `/register` → `RegisterPage` (export from `src/routes/_pos/register.tsx`)
- `/refunds` → `RefundsPage` (export from `src/routes/_pos/refunds.tsx`)
- `/timeclock` → `TimeclockPage` (export from `src/routes/_pos/timeclock.tsx`)
- `/shifts` → `ShiftsPage` (export from `src/routes/_dashboard/shifts.tsx`)
- `/settings` → `SettingsPage` (limited: only cashier-relevant tabs)
- `/reports` → cashier-scoped shift summary only
- `/support` → merchant support request screen

For each source route, add a named `export function XPage()` so it can be reused (mirroring what was done for `PosPage`). All wrapped in `<PosShell>` in the router.

## Phase 4 — Replace stubs with real functionality

- `capacitor-shell/stubs/ManagerOverrideDialog.tsx` — swap `overrides.functions.ts` call for a `fetch('/api/public/pos/verify-manager-pin', ...)`-based verification. Same UX, same result shape, so `PosPage` unchanged.
- `SupportRequestListener` stub can stay disabled in native (platform admin support is a web-only feature for now) OR be re-enabled reading realtime directly — I'll leave disabled unless you want it.

## Phase 5 — Branding & splash

- Audit every `<img>` / logo reference reachable in the shell bundle. Replace any missing/broken with `@/assets/seza-logo.png.asset.json`. CDN asset URLs are absolute and already work in Capacitor.
- Regenerate launcher icons + splash from `resources/` (`bun run android:assets`).
- Splash: `launchAutoHide: false` already set. Confirm `SplashScreen.hide()` fires only after first paint of `/pos` or `/auth` (currently fires on mount of `ShellApp` — I'll move it to after router `onLoad`).

## Phase 6 — Verification

- `bun run android:build` (must succeed).
- `rg PosPlaceholder`, `rg "Coming soon"`, `rg "web dashboard"` inside `capacitor-shell/` — must be empty.
- Manual native check list (documented in `ANDROID.md`): every nav item opens real screen, PIN login works offline of email, manager PIN gates refunds.

## Files I'll create

- `src/routes/api/public/pos/verify-employee-pin.ts`
- `src/routes/api/public/pos/verify-manager-pin.ts`
- `src/lib/pos/native-auth.ts` (shared HMAC helpers, server-only)
- `capacitor-shell/screens/PinLoginScreen.tsx`
- `capacitor-shell/screens/StoreCodeScreen.tsx`
- New named exports on existing route files.

## Files I'll edit

- `capacitor-shell/router.tsx` — mount real production pages.
- `capacitor-shell/main.tsx` — splash hide timing.
- `capacitor-shell/screens/AuthRoute.tsx` — PIN flow, no email.
- `capacitor-shell/stubs/ManagerOverrideDialog.tsx` — real HTTPS call.
- `vite.capacitor.config.ts` — additional aliases if any newly-imported production route depends on server-fn modules.
- `ANDROID.md` — new auth + navigation notes.
- Existing `src/routes/_pos/*.tsx` and `src/routes/_dashboard/shifts.tsx` — add named exports; no logic changes.

## Risks / things I need your OK on

1. **PIN → session bridge.** Using `supabaseAdmin.auth.admin.generateLink` + server-side `verifyOtp` requires each employee to have an email in `profiles` (they do). Alternative: sign a custom JWT ourselves. Simpler = generateLink. OK to proceed with generateLink?
2. **Shared native key.** I'll add `NATIVE_APP_SHARED_KEY` secret. The Android bundle will embed it (it's not a user secret, it's a soft app-attestation token; real security is PIN + rate limits + audit). OK?
3. **Settings/Reports scope on Android.** Cashiers realistically only need: change PIN, view own shift summary, sign out. I'll gate the rest behind role. OK, or do you want full parity for managers on Android?
4. **Support screen sharing on Android** — requires `getDisplayMedia`, which Capacitor Android does NOT support without a native plugin. I'll ship a "Support unavailable on mobile" notice rather than a broken screen. OK?

Reply "go" to execute, or answer the four questions above and I'll adjust before shipping.