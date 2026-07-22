
# SEZA Platform Admin Operations — Implementation Plan

This spec is very large (17 admin surfaces, new case lifecycle, live chat, incidents, device source-of-truth fix, permissions overhaul, platform health, etc.). Landing it in a single turn would produce an unreviewable diff and a high risk of regressing the marketing site, owner dashboard, and Android APK — all of which the spec explicitly says must be preserved.

I want to ship it as **five sequenced phases**, each ending with a green `bun run build` and a clear report before moving on. Every phase reuses existing tables and server functions; migrations are additive only.

## Phase 1 — Foundations (fixes the "known problems" first)

Goal: unblock the three current bugs and set up shared infra everything else depends on.

- **Devices source-of-truth fix (G)**: rewrite `admin.devices.tsx` to query `device_registrations` for Android registers, with a separate Payment Terminals tab reading `payment_terminals`. Fix Ops Center device counts to match. Online = ≤5m, Stale 5–30m, Offline >30m. Never expose `device_secret`/`secret_hash`.
- **Support "disappearing ticket" fix (C, partial)**:
  - Migration: extend `support_tickets` status check to include `new`, `claimed`, `investigating`, `waiting_for_merchant`, `resolved`, `closed`, `reopened`; keep legacy `open` accepted and treated as active.
  - Add `claimed_at`, `claimed_by`, `resolved_at`, `resolved_by`, `closed_at`, `closed_by`, `resolution_summary`, `root_cause`, `reopen_reason` columns (nullable, additive).
  - Add `support_ticket_activity` table (append-only case timeline) with RLS + GRANTs per project rules.
  - Support list default view = "Active Problems" (new/claimed/investigating/waiting_for_merchant/reopened/legacy-open). Claim keeps the row visible and routes to case workspace.
- **Permissions catalog audit (M, partial)**: seed `admin_permissions` rows for operations_admin/support_admin/billing_admin/analyst against the existing catalog in `src/lib/admin/permissions.ts`. Sidebar hides unauthorized pages via `useAdminPermissions`. No changes to `super_admin`.
- **Realtime safety helper**: small util that enforces "register callbacks before subscribe, cleanup on unmount, polling fallback". Used by every realtime surface in later phases.

Exit criteria: paired Android device shows in Admin Devices; claim no longer hides tickets; sidebar reflects role; build green.

## Phase 2 — Case management + Communications (C, D)

- Full case workspace (`admin.support.$ticketId.tsx`): reported-problem header, status/priority/category/assignee, requester, business/store, linked device, app version/heartbeat/sync, sanitized diagnostics, related sales/refunds/payments/sync failures near report time, merchant messages vs internal notes (separate), activity timeline. Actions: claim, assign/transfer (reason), start investigation, request info, reply, internal note, change category/priority (reason for escalation), link device/sale/refund/payment/sync, start Support View, resolve (summary required), close (confirmation), reopen (reason). All audited via `runSafeAction`.
- Support list rework: queue cards (New, Unassigned, Mine, Urgent, Waiting, Resolved Today, All); filters; URL-persisted; SLA/age badges.
- Communications system:
  - New tables `support_conversations` and `support_conversation_messages` (+ RLS + GRANTs). Lifecycle: waiting/active/waiting_for_merchant/ended. Merchant-visible vs internal messages. Optional link to `support_tickets` and `device_registrations`.
  - Merchant entry points: owner dashboard support page + Android support screen (reuses existing entry points; no redesign).
  - Admin Communications page: Waiting / My active / Team active / Ended. Realtime via the safety helper with polling fallback. Claim keeps convo visible; only explicit End removes it from active. Transfer + create/link ticket, both audited.

Exit criteria: acceptance tests 7–15 pass; build green.

## Phase 3 — Businesses, Stores, Employees, Sales, Offline Sync (E, F, H, I)

- Businesses page: real directory with owner/plan/trial/devices/employees/open cases/active chats/offline count; safe CSV export; opens Business Support Workspace (already exists — extend tabs Overview/Health/Activity/Employees/Devices/Sales/Payments/Offline Sync/Support/Subscription/Audit).
- Stores page (replaces placeholder): production `stores` data with location, code, plan, employees, devices, open shifts, last sale, last heartbeat, open cases, health.
- Employees page: real `profiles` + `user_roles`; safe platform actions only (view, password reset, resend verification, revoke sessions, suspend/reactivate where policy allows); never expose PIN hashes; wages/schedules/roles stay in owner dashboard.
- Sales page: cross-store investigation over `sales`/`sale_items`/`refunds`; filters, detail drawer, read-only.
- Offline Sync page: pending/retrying/failed/completed over existing offline structures; safe retry/dismiss (reason); no PII/tokens.

Exit criteria: no placeholders in these five pages; build green.

## Phase 4 — Subscriptions, Payments, Incidents, Audit, Admin Team, Platform Health, Settings (J–O)

- Subscriptions/Payments: keep existing Stripe-connected views; add past-due queue, safe refresh/cancel/restore with confirm+reason+audit; Payments cross-store filter/search/export from `payment_attempts` + related sale/refund.
- Incidents: new `platform_incidents` + `platform_incident_updates` tables (RLS + GRANTs). Lifecycle investigating/identified/monitoring/resolved. Ops Center surfaces active incidents. Reopen with reason. Link support cases. No auto-publish to public status page.
- Audit Logs: keep viewer immutable; add filters + safe CSV export; every new action writes meaningful rows.
- Admin Team: list platform staff via `user_roles` + `is_platform_staff`; invite/add via existing auth flow; change role with confirmation + audit; prevent removing last active super_admin; enforce lower roles cannot modify higher.
- Platform Health: honest signals (DB reachable, Stripe configured, email configured, background jobs, heartbeat rate, sync failures, incident count, build version). States: Healthy/Degraded/Down/Not configured/Unknown.
- Settings: Admin Profile, Notifications, Platform, Security, Integrations/System Status. No secrets exposed.

Exit criteria: acceptance test 18 passes for every listed page; build green.

## Phase 5 — Operations Center + polish (B, P) and acceptance sweep

- Rebuild `/admin` as the live Operations Center: real metrics + the five panels (New Problems, My Active Work, Active Communications, Device/Sync Attention, Platform Alerts). Uses realtime safety helper + polling fallback.
- Global search: businesses, stores, owners, employees, devices, terminals, tickets, subscription refs.
- UX pass: loading/empty/retry states, URL-persisted filters, pagination, CSV exports, double-submit guards, no dark flash, no duplicated sidebar names, noindex/nofollow on all admin routes.
- Run the 20-point acceptance list; confirm marketing (`sezapos.com`), owner dashboard (`dashboard.sezapos.com`), and Android web assets still build clean.

## Ground rules applied to every phase

- Reuse existing tables/functions; migrations are additive only, always with GRANTs then RLS then policies.
- Every sensitive write wrapped in `runSafeAction` (permission + reason + audit + correlation id).
- No secrets, PIN hashes, device secrets, card data, or private internal notes leak to merchant surfaces.
- Realtime: callbacks before `.subscribe()`, cleanup on unmount, polling fallback.
- Admin routes stay `noindex, nofollow`.
- No fake data, no "Coming soon" left behind in listed sections.
- End of each phase: `bun run build` must pass; I'll report files changed, migrations added, tables reused vs added, permissions wired, anything deferred, and test results.

## What I need from you

Confirm you want me to proceed **phase by phase in this order**, starting with Phase 1 now. If you'd rather reorder (e.g. Communications before Devices), tell me and I'll adjust before writing code. If you want it all in one shot anyway, say so explicitly — I'll do it, but the diff will be very large and higher risk.
