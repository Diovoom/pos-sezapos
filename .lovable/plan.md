## Problem

On `pos.sezapos.com` and `dashboard.sezapos.com`, the page reloads in a loop instead of landing on `/pos` (or `/dashboard`).

**Root cause — race between the shared-cookie session bridge and route guards:**

1. Supabase sessions are stored in `localStorage`, which is scoped per subdomain, so a fresh visit to `pos.sezapos.com` has an empty local session.
2. `installSessionBridge()` (which reads the `.sezapos.com` cookie and calls `supabase.auth.setSession(...)`) runs inside a `useEffect` in `__root.tsx` — asynchronously, after the router has already started matching.
3. `_pos/route.tsx` `beforeLoad` calls `supabase.auth.getUser()` before the bridge has hydrated the session, sees no user, and redirects to `/auth`.
4. `/auth`'s mount effect eventually sees the session (bridge has now completed), calls `goToLanding(..., "/pos")`, which resolves to `https://pos.sezapos.com/pos` and does `window.location.replace(...)`.
5. Full page reload → back to step 1 → infinite loop.

## Fix

Make the session bridge synchronous with respect to route matching, and don't full-reload when we're already on the correct subdomain.

### 1. `src/integrations/supabase/session-bridge.ts`
- Add an exported `hydrateSessionFromCookie(): Promise<void>` that:
  - No-ops off `sezapos.com`.
  - If `supabase.auth.getSession()` already has a session, returns.
  - Otherwise reads the shared cookie and awaits `supabase.auth.setSession(...)` before resolving.
  - Caches the in-flight promise so concurrent callers share one hydration.
- `installSessionBridge()` keeps handling `onAuthStateChange` → cookie sync, but delegates the initial restore to `hydrateSessionFromCookie()`.

### 2. Await hydration in the protected layout guards
In `src/routes/_dashboard/route.tsx` and `src/routes/_pos/route.tsx` `beforeLoad`:
- After the subdomain check and before `supabase.auth.getUser()`, `await hydrateSessionFromCookie()`.
- This closes the race: by the time `getUser()` runs, any valid shared-cookie session is already in `localStorage`.

### 3. Await hydration in `/auth` and `/`
- `src/routes/auth.tsx`: in the mount effect, `await hydrateSessionFromCookie()` before `getSession()` so an already-signed-in visitor is bounced immediately without a reload.
- `src/routes/index.tsx`: same — await hydration before the `useSession`-driven redirect decision.

### 4. Avoid a full reload when we're already on the target subdomain
In `src/lib/host.ts`, update `buildUrl(sub, path)`:
- If the current host is already the target host (e.g. we're on `pos.sezapos.com` and asked for a `pos.sezapos.com` URL), return the relative `path` instead of an absolute URL.
- This makes `goToLanding` in `auth.tsx` use client-side `navigate(...)` on the same subdomain instead of `window.location.replace(...)`, eliminating the reload half of the loop even if the race resurfaces.

### 5. Also install the bridge eagerly
In `src/routes/__root.tsx`, call `installSessionBridge()` at module scope (guarded by `typeof window !== "undefined"`) in addition to the `useEffect`, so the `onAuthStateChange` listener is wired up before any route effect runs. The `useEffect` call becomes a no-op via the existing `installed` guard.

## Out of scope
- Any change to Supabase storage strategy (staying on `localStorage` + cookie mirror).
- DNS, hosting rewrites, other subdomain plumbing.
- Marketing, settings, POS feature work.

## Verification
- On `pos.sezapos.com/` while signed in: lands on `/pos` with no reload.
- On `dashboard.sezapos.com/` while signed in as owner: lands on `/dashboard` with no reload.
- Signed out visit to either subdomain: single redirect to `/auth`, no loop.
- Sign in on `sezapos.com/auth` as cashier: one `window.location.replace` to `pos.sezapos.com/pos`, then no further reloads.
