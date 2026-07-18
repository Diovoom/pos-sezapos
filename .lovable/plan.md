# SEZA Platform Admin — Production Hardening Plan

## Root cause of "admin becomes cashier"

`handle_new_user()` (DB trigger on `auth.users`) inserts every new signup into `public.profiles` with a `store_id` and into `public.user_roles` as either `owner` (if `business_name` in metadata or first user) or **`cashier`** as a fallback. The current super_admin user was created through this path, so they carry BOTH `super_admin` and `cashier` rows in `user_roles`, plus a `profiles.store_id` pointing at a merchant store.

Downstream:
- `useMe()` reads all roles → merchant surfaces (`_pos/route.tsx`, `_dashboard/route.tsx`) see `cashier`/`owner` and let the admin in.
- `admin.auth.tsx` only checks `super_admin` presence, not exclusivity.
- No guard rejects platform staff from merchant contexts.

**Fix**: (a) treat platform roles as mutually exclusive with merchant roles — a user with any platform role must not have a `store_id` or merchant role; (b) change `handle_new_user()` so it skips profile/role provisioning when the new user is marked platform staff (via metadata) or already has a platform role; (c) add positive guards on `_dashboard` and `_pos` layouts that redirect platform staff to `/admin`; (d) purge merchant rows for existing super_admins in a migration.

---

## Phase 1 — Auth & session separation (do first, ship, verify)

**DB migration**
- Extend `app_role` enum: add `operations_admin`, `support_admin`, `billing_admin`, `analyst`.
- Add helper `public.is_platform_staff(uuid)` returning true if the user has any of the 5 platform roles.
- Update `handle_new_user()`: if `raw_user_meta_data->>'platform_staff' = 'true'` OR user already has a platform role → do NOT insert into `profiles`/`user_roles`.
- Add trigger `tg_enforce_role_exclusivity` on `user_roles` INSERT/UPDATE: reject inserting a merchant role for a user who has any platform role, and vice versa.
- Data cleanup: delete `profiles` and merchant `user_roles` rows for existing users who have a platform role (super_admin bootstrap included).
- Tighten `has_role`/`has_any_role` so platform-role checks don't leak merchant permissions (they already scope by store, but audit).

**Frontend**
- `src/routes/_dashboard/route.tsx` + `src/routes/_pos/route.tsx`: after `useMe()` loads, if `roles` includes any platform role → `navigate("/admin", replace: true)` and return.
- `src/routes/index.tsx` (and any post-login redirect in `auth.tsx`): if platform staff, redirect to `/admin`.
- `_adminApp/route.tsx`: accept any of the 5 platform roles, not just `super_admin` (super_admin remains required for Settings).
- Add `usePlatformRole()` helper for permission gating in admin pages.

**Verify**: sign in on `/admin/auth` → land on `/admin`; manually visit `/pos`, `/dashboard` → bounced to `/admin`; merchant owner visiting `/admin` → bounced to `/admin/auth`; refresh on `/admin/*` stays put.

---

## Phase 2 — Businesses

Existing: `admin.businesses.tsx` list + `admin.businesses.$storeId.tsx` workspace already partially exist. Fill gaps:
- Extend `adminListBusinesses` server fn: add sort (newest/oldest/name/last_activity), owner-name/email search, real device count, real user count.
- Business Detail: wire Overview, Owner, Stores, Employees, Devices, Subscription, Sales summary, Recent shifts, Support, Screen-sharing history, Internal notes, Audit history — one server fn per section, all under super_admin/ops_admin RLS.
- Actions: Suspend (already exists) — require reason + confirm; Reactivate; Add internal note; Open support ticket. All audited.

---

## Phase 3 — Support (real, end-to-end)

Existing tables: `support_tickets`, `support_ticket_notes`, `admin_support_sessions`. Extend/reuse; don't duplicate.

**DB**
- Add `support_ticket_messages` (merchant ↔ admin chat, distinct from internal notes which stay in `support_ticket_notes`).
- Enable Realtime on `support_tickets`, `support_ticket_messages`, `support_ticket_notes`.
- RLS: merchants see only their store's tickets; platform staff with `support_admin`/`super_admin` see all.

**Merchant UI**
- New route `src/routes/_dashboard/support.tsx` and entry in POS settings menu: list own tickets, create ticket (category, subject, priority, description, attachments via `product-images` bucket subpath), view thread, reply, request screen share.

**Admin UI**
- Rebuild `admin.support.tsx` list with real filters (status, priority, assignee, business).
- `admin.support.$ticketId.tsx`: full thread, reply, internal notes, status/priority/assignee controls, link to business/store, screen-share join button.

---

## Phase 4 — Merchant-authorized screen sharing (WebRTC, view-only)

**DB**
- New table `screen_share_sessions`: id, ticket_id, business_id, store_id, merchant_user_id, admin_user_id, status (requested/waiting_for_admin/active/ended/declined/expired/failed), created_at, started_at, ended_at, end_reason, expires_at.
- New table `screen_share_signals`: session_id, from_user_id, kind (offer/answer/ice), payload jsonb, created_at — auto-purged on session end.
- RLS: merchant sees own sessions; admin sees only sessions where they're the assigned admin OR the ticket is unassigned and they have `support_admin`.
- Enable Realtime on both tables.

**Merchant flow**
- Button in support ticket + POS help menu: "Share screen with SEZA Support".
- Consent dialog → `navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })` → insert `screen_share_sessions` row (status=waiting_for_admin, expires_at=+10min).
- Persistent banner "Your screen is being shared" with Stop button + admin name once joined.
- On tab close / stream ended → mark session ended.

**Admin flow**
- Realtime alert in admin Support page + on Business Detail when a session is pending.
- "Join Screen Share" button → creates WebRTC peer connection, exchanges offer/answer/ICE via `screen_share_signals` (Supabase Realtime channel).
- Viewer component (video element) with duration, End Session button.
- No recording, no screenshots, no audio, no remote control.

**Cleanup**
- Client `beforeunload` and periodic heartbeat; server-side cron (`pg_net` → server route) marks sessions expired after inactivity.
- All lifecycle events audited (requested/joined/left/ended/expired/failed) — metadata only.

---

## Phase 5 — Devices

Existing `payment_terminals` + `register_sessions` provide device+heartbeat data.
- Rebuild `admin.devices.tsx` list: real terminals + registers, filter by business/store/status, last activity from `register_sessions.opened_at`/`sales.created_at`.
- Device Detail modal/page: overview, recent sessions, recent sales, recent shifts, support tickets referencing device, screen-share sessions, audit.
- Actions: rename, reassign, deactivate/reactivate — audited.
- Status: derive "active recently" (< 24h activity), "inactive", "unknown" — no fake "online".

---

## Phase 6 — Subscriptions

Existing `subscriptions` table + Stripe integration via `stripe.server.ts`.
- Rebuild `admin.subscriptions.tsx`: list with plan/status/trial/period/cancellation/stripe refs. Filters by status.
- Subscription Detail: current plan, trial, billing period, invoice history (Stripe API list), Stripe event history if stored, related tickets, audit.
- Admin actions gated by `billing_admin`/`super_admin`: cancel at period end, extend trial (already exists), refresh from Stripe. All require confirmation dialog with effect description; all audited. NO auto-charge, no manual refunds in v1 (deferred).

---

## Phase 7 — Audit Logs

Existing `audit_log` table.
- Rebuild `admin.audit-logs.tsx`: filters (date range, actor, actor role, business, store, action, entity type, success/failure), search, pagination (already partial).
- Ensure new phase events are logged (business actions, support actions, screen-share lifecycle, subscription actions, settings changes, admin login/failed access).
- RLS: super_admin read; no UPDATE/DELETE from any role except service_role.
- Redact secrets/tokens/PINs in `details` at write time (helper wrapper).

---

## Phase 8 — Settings (super_admin only)

New table `platform_settings` (single-row keyed config) with sections: platform info, support, trial, operational, feature defaults. Never expose secrets. Every change audited with before/after.

---

## Phase 9 — Regression & delivery

After each phase: build, fix errors, spot-check merchant signup/login/POS sale/PIN clock-in flows still work.

---

## Scope & delivery model

This is 40–60+ files, 6–8 migrations, and a WebRTC integration. I cannot ship all 9 phases in one turn without producing something half-broken. Proposed delivery:

- **This session**: Phase 1 (auth separation + migration + guards + verification) end-to-end. This is the security-critical piece and unblocks everything else.
- **Follow-up turns**: one phase per turn, with a build check and short verification report after each.

Reply "approved" (or "approved, do phase 1") to start, or edit any phase before I begin.

## Technical details (for reference)

- Enum expansion needs `ALTER TYPE app_role ADD VALUE` in its own migration (Postgres constraint on new enum values used in same tx).
- Role-exclusivity trigger must be `SECURITY DEFINER` and check the OTHER role class via `has_role`.
- Realtime channels for screen-share signaling must filter by `session_id` on both sides; RLS enforces access.
- WebRTC uses free public STUN (`stun.l.google.com:19302`); no TURN in v1 — sessions on symmetric NAT will fail with "connection failed" audit + fallback message to merchant.
- `getDisplayMedia` requires HTTPS; already true on `.lovable.app` and `admin.sezapos.com`.
- No new secrets required; reuses existing Supabase + Stripe.
