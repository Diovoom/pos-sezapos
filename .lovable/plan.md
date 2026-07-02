## SEZA Merchant Onboarding + Admin Portal

This is a large, multi-phase build. I'll break it into 3 shippable phases so you can review each before we move on. Below is the plan for **Phase 1** (public signup + trial activation) with Phases 2 and 3 outlined.

---

### Phase 1 — Public Merchant Registration & Trial Activation

**Goal:** "Start Free Trial" opens a real signup form; verified owners land in the POS onboarding wizard with a fresh store on a 14-day trial.

**New route:** `/signup`
Fields: Business Name, Owner Full Name, Business Email, Password, Phone, Country (select), Time Zone (auto-detected, editable), Accept ToS + Privacy checkbox.

**Flow:**
1. Landing page "Start Free Trial" → `/signup` (not `/auth`).
2. Submit calls `supabase.auth.signUp` with `emailRedirectTo` + metadata (business name, phone, country, tz, full name).
3. Supabase sends verification email (already scaffolded via Lovable Emails). Show "Check your inbox" screen.
4. On verification click → user lands on `/auth/callback` → session established.
5. Existing `handle_new_user` trigger is **rewritten**: for a brand-new signup (no invite), create a fresh `stores` row (with country/tz/name from metadata), a unique short Store ID, seed 14-day trial, insert profile + `owner` role scoped to that store. For subsequent staff signups (invited by an owner), skip store creation.
6. Redirect owner to `/onboarding` (POS wizard already exists).

**Data changes (migration):**
- Add `store_code` (unique short human ID, e.g. `SZ-8F3K2A`) to `stores` if missing.
- Add `phone`, `country`, `time_zone` to `stores` (some already exist — will verify).
- Update `handle_new_user` to read from `raw_user_meta_data` and branch on invite vs. self-signup.

---

### Phase 2 — SEZA Admin Portal (outline, built after Phase 1 is approved)

- New `app_role` value: `seza_admin` (platform-level, not tied to a store).
- Route group `/admin/*` gated by `has_role(auth.uid(), 'seza_admin')`. Non-admins get 404.
- Pages: Dashboard (store/trial/sub counts), Stores (search by name/owner/email/store_code, view subscription + payment status, suspend/reactivate), Announcements (broadcast to merchants), Audit Logs, System Errors, Version/Maintenance banner control.
- Tables: `announcements`, `maintenance_notices`, `platform_audit_log`. Store suspension via `stores.suspended_at` + RLS check.

### Phase 3 — Secure Support Access (outline)

- Table `support_access_requests` (admin_id, store_id, reason, status, requested_at, approved_at, expires_at, revoked_at).
- Admin requests access → merchant gets in-app notification + email → approve/deny in Owner Portal.
- On approval: admin gets a scoped, time-limited impersonation token; RLS checks `has_active_support_grant(auth.uid(), store_id)`.
- Every action during a support session is written to `support_session_events` (timestamp, admin, action, target).
- Auto-expire via cron; merchant can revoke early.

### Employee Management

The Owner Portal already supports creating employees, assigning roles, wages, PINs, and generating unique 6-digit IDs (via `generate_employee_id`). No changes needed unless you spot gaps — flag them and I'll fold into Phase 1.

---

### Confirm before I build

1. Proceed with **Phase 1 only** this turn, then review before Phase 2/3? (Recommended — each phase is substantial.)
2. Email verification: keep Supabase's default (user must click link before first sign-in), correct?
3. For `seza_admin` in Phase 2: should I bootstrap it by hardcoding your email, or add a one-time SQL/UI to promote the first admin?
