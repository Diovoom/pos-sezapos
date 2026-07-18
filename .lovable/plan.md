## Root cause (verified in preview)

Playwright, signed in as super_admin, hit `/admin`, `/admin/businesses`, `/admin/subscriptions`, `/admin/devices`, `/admin/support`, `/admin/audit-logs`, `/admin/settings`. The URL updates on every navigation but the rendered content is the Overview page on all seven routes.

`src/routes/_adminApp/admin.tsx` owns the route `/_adminApp/admin` and its component renders no `<Outlet />`. Sibling files (`admin.businesses.tsx`, `admin.devices.tsx`, `admin.support.tsx`, `admin.subscriptions.tsx`, `admin.audit-logs.tsx`, `admin.settings.tsx`, `admin.businesses.$storeId.tsx`, `admin.support.$ticketId.tsx`) are children of that route in TanStack's flat routing, so they match but can't render — Overview stays on screen. This one issue is what makes every admin section look broken.

Platform-admin auth itself is fine: the sign-in succeeded, `_adminApp/route.tsx` admitted the user, and the shell loads on every path. The individual page files are also implemented (server fns for businesses/devices/support/subscriptions/audit/settings already exist and pass through `ensurePlatformStaff`).

## Fix

1. Rename `src/routes/_adminApp/admin.tsx` → `src/routes/_adminApp/admin.index.tsx`. That makes Overview the index child at `/admin` instead of a parent layout, so the six sibling section routes render normally. No component change needed — the file already declares route path `/_adminApp/admin` and the router treats `admin.index.tsx` as the same path as an index route.
2. Re-run the Playwright pass on all seven admin URLs and confirm each renders its own page (Businesses table, Subscriptions list, Devices table, Support queue, Audit Logs table, Settings form) instead of Overview.
3. If the re-verification surfaces any real per-page failure (server-fn error, empty state that isn't correct, crash), fix that page in the same turn and re-verify — do not report success until every page passes.

## Technical details

- No route path or component code changes; only a filename move. TanStack Router's Vite plugin regenerates `routeTree.gen.ts` on save.
- `admin.businesses.$storeId.tsx` and `admin.support.$ticketId.tsx` also become correct siblings under the auto-parent — the detail routes were also unreachable before this fix.
- No DB, RLS, server-function, or auth-guard changes.

## Out of scope

- No changes to `_adminApp/route.tsx`, `admin.auth.tsx`, `handle_new_user`, role gates, or any server function in `src/lib/admin/admin.functions.ts` unless step 3 surfaces a real defect.
- No changes to merchant POS/dashboard code.