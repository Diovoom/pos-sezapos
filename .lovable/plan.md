# Phase 1 — Admin Foundation

Much of Phase 1 already exists in the codebase (admin auth route, isolated admin Supabase client, `_adminApp` protected layout, global search, overview, audit log page, ~1600-line `admin.functions.ts`). This plan closes the specific Phase 1 gaps without duplicating what's already shipped.

## What already exists (keep as-is)
- `admin.sezapos.com` gating in `src/routes/__root.tsx` and `/admin/auth` sign-in
- Isolated admin session (`sb-seza-admin-auth`) via `admin-client.ts` + `auth-attacher-dual.ts`
- `_adminApp` `beforeLoad` gate requiring a platform role
- Global search server fn + header UI, overview stats, audit log viewer
- `audit_log` table + `logAudit()` helper
- Platform role enum (`super_admin`, `operations_admin`, `support_admin`, `billing_admin`, `analyst`) and DB triggers preventing platform/merchant role mixing and protecting `super_admin` role writes

## Gaps to close in Phase 1

### 1. Extend platform-staff roles to the full 7 roles
Add two roles to the `app_role` enum and to `PLATFORM_ROLES`:
- `technical_support`, `merchant_support`, `compliance_support` (rename existing `support_admin` → keep as `merchant_support`? — additive only: add the 3 new roles; keep existing values so nothing breaks). Update `is_platform_staff()` accordingly.

### 2. Granular admin permissions
- New table `public.admin_permissions (role app_role, permission text, primary key(role, permission))` — separate from merchant `role_permissions` (which is store-scoped). Seed with the permission list from the spec, mapped per platform role.
- SECURITY DEFINER function `public.has_admin_permission(_user uuid, _perm text) returns boolean` — `super_admin` always true; otherwise EXISTS join on `admin_permissions`.
- Client hook `useAdminPermissions()` (reads via server fn, cached) — used to hide UI. Server enforcement is authoritative.

### 3. Safe-action framework (server-side)
New helper `src/lib/admin/safe-action.ts` (server-only) exporting `runSafeAction({ ctx, permission, danger, target, reason, before, apply })`:
- Verifies caller is platform staff via `context.supabase` (RLS), then checks `has_admin_permission`
- For `dangerous` actions, requires non-empty `reason` and `confirm === true`
- Runs `apply()`, captures `after` state
- Writes an `audit_log` row with `{ action, entity, entity_id, details: { danger, reason, before, after, correlation_id } }`
- Returns `{ ok, result, correlation_id }`; on failure logs a `system.error` audit row and rethrows a redacted error
All future admin server fns (Phase 2+) will use this wrapper. Phase 1 wires it into two existing sensitive actions (`adminEndSupportSession`, admin sign-out) as proof.

### 4. Admin login hardening
- Rate-limit table `public.admin_login_attempts (email citext, ip text, attempted_at timestamptz, success boolean)` with an index on `(email, attempted_at)`.
- Server fn `recordAdminLoginAttempt({ email, success })` called from `admin.auth.tsx` after sign-in. Blocks (returns `rate_limited`) when > 5 failures in 15 min for the same email.
- Extend `admin.auth.tsx` to call the fn on both success/failure paths; keep the generic error message.
- Add "Active sessions" section under existing `/admin/settings` (already scaffolded) using `supabase.auth.getSession()` info + `signOut({ scope: 'others' })` to revoke other sessions.

### 5. Permission-aware nav
Update `NAV` in `_adminApp/route.tsx` to filter items by `has_admin_permission` (e.g. hide Subscriptions from technical_support). Add the missing nav items the spec calls out but that don't have pages yet as **placeholder routes returning a "Coming in Phase X" empty state** so links don't 404:
- Stores, Employees, Sales Operations, Offline Sync, Payments, Incidents, Communications, Admin Team, Platform Health
Each placeholder is ~20 lines and gated on the appropriate permission.

## Files

**Migrations (single migration)**
- `supabase/migrations/<ts>_phase1_admin_foundation.sql`:
  - `ALTER TYPE app_role ADD VALUE` for the 3 new platform roles
  - `CREATE TABLE public.admin_permissions` + GRANTs + RLS + policies (`SELECT` for authenticated platform staff, admin writes via service role only)
  - Seed rows for each platform role
  - `CREATE FUNCTION public.has_admin_permission`
  - `CREATE TABLE public.admin_login_attempts` + GRANTs + RLS (insert allowed to authenticated; select restricted to super_admin)
  - Update `public.is_platform_staff` to include the 3 new roles

**New files**
- `src/lib/admin/safe-action.ts` — safe-action wrapper (server-only)
- `src/lib/admin/permissions.ts` — permission key constants + `useAdminPermissions()` hook
- `src/lib/admin/login-attempts.functions.ts` — `recordAdminLoginAttempt` server fn
- `src/routes/_adminApp/admin.stores.tsx`, `admin.employees.tsx`, `admin.sales.tsx`, `admin.offline-sync.tsx`, `admin.payments.tsx`, `admin.incidents.tsx`, `admin.communications.tsx`, `admin.team.tsx`, `admin.platform-health.tsx` — placeholder pages

**Changed**
- `src/lib/platform-roles.ts` — add 3 roles
- `src/routes/admin.auth.tsx` — call rate-limit fn; audit on success + failure
- `src/routes/_adminApp/route.tsx` — filter NAV by permission
- `src/routes/_adminApp/admin.settings.tsx` — add "My account / Active sessions" section
- `src/lib/admin/admin.functions.ts` — wire `runSafeAction` into `adminEndSupportSession`

## Out of scope for Phase 1 (comes later)
- Real Businesses / Support / Devices workspace rebuilds (Phase 2–3)
- Ticket workspace, saved replies, KB (Phase 3)
- Real content on the new placeholder pages (Phase 4–5)
- MFA UI, notification preferences

## Validation
- `bunx tsgo` typecheck
- `bun run build` web build
- Manual: sign in as merchant → `/admin` redirects to `/admin/auth`; sign in as platform staff → nav filtered by role; trigger 6 failed logins → 6th blocked with generic message; end a Support View → audit row has `before/after/reason/correlation_id`.

Stop after Phase 1 for review.
