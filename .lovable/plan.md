# SEZA POS — Migration Audit: Lovable Cloud → Own Supabase + Cloudflare

Audit only. No files were changed. Everything below was verified by reading the code/config and querying the live database this turn.

## 1. Lovable Cloud / platform dependencies currently relied on

| Dependency | Where | Migration action |
| --- | --- | --- |
| Managed Supabase project (`xbirnlsbckbcjbxqkmjn`) — DB, Auth, Storage, Realtime | `.env`, `supabase/config.toml`, `vite.config.ts` (hardcoded URL + publishable key fallbacks) | Recreate on your own Supabase org; replace URL/keys, remove hardcoded fallbacks |
| Lovable email delivery (`@lovable.dev/email-js`, `LOVABLE_API_KEY`, `LOVABLE_SEND_URL`) | `src/routes/lovable/email/**`, `src/lib/email/*`, `src/lib/email-templates/*` | Replace with own ESP (Resend/SES/Postmark); keep queue + templates, swap the send call |
| Lovable webhook verification (`@lovable.dev/webhooks-js`) | `src/routes/lovable/email/auth/webhook.ts`, `suppression.ts` | Replace with own HMAC verification |
| Lovable Stripe connector gateway (`connector-gateway.lovable.dev/stripe` + `LOVABLE_API_KEY`, `STRIPE_SANDBOX_API_KEY` / `STRIPE_LIVE_API_KEY` connection keys) | `src/lib/stripe.server.ts` | Switch to direct `api.stripe.com` with real Stripe secret keys |
| Lovable auth broker (`@lovable.dev/cloud-auth-js`) | `src/integrations/lovable/index.ts` — present but **not** used by the sign-in UI | Delete; `src/routes/auth.tsx` already calls `supabase.auth.signInWithOAuth` directly for Google/Apple |
| Lovable MCP runtime (`@lovable.dev/mcp-js` + Vite plugin) | `src/routes/mcp.ts`, `src/routes/[.mcp]/**`, `src/routes/[.well-known]/oauth-protected-resource.ts`, `src/lib/mcp/**`, `vite.config.ts` | Keep only if agent integrations are wanted off-platform; otherwise remove the routes, deps, and plugin |
| Lovable hosted Vite preset (`@lovable.dev/vite-tanstack-config`, incl. Nitro/Cloudflare target, env injection, `@` alias, dedupe, componentTagger) | `vite.config.ts` | Replace with an explicit `vite.config.ts` (tanstackStart + react + tailwind + tsconfigPaths + nitro cloudflare preset) |
| Lovable error reporting | `src/lib/lovable-error-reporting.ts`, `src/routes/__root.tsx` | Replace with Sentry/no-op |
| `*.lovable.app` host allow-lists / noindex rules | `src/server.ts`, `src/lib/security/api-security.server.ts`, `src/lib/auth/auth.server.ts` | Replace with your own hosts |
| DB cron calling `project--<id>.lovable.app/lovable/email/queue/process` + vault secret `email_queue_service_role_key` | `email_queue_dispatch()`, `email_queue_wake()` | Rewrite URL to the new Cloudflare domain; recreate vault secret |
| `LOVABLE_BUILD_ID` in platform-health output | `src/lib/admin/admin.functions.ts` | Swap for `CF_VERSION_METADATA` / commit SHA |

## 2. Backend inventory to migrate

**Schema (public):** 41 tables, 0 views/matviews, 84 functions (46 SECURITY DEFINER), 35 triggers, 98 RLS policies.
Tables: admin_login_attempts, admin_permissions, admin_support_sessions, age_verifications, api_rate_limit_buckets, audit_log, business_trial_registry, cash_movements, categories, country_profiles, customers, device_pairing_codes, device_registrations, email_send_log, email_send_state, email_unsubscribe_tokens, legal_acceptances, passkey_challenges, passkey_credentials, payment_attempts, payment_terminals, platform_settings, products, profiles, refund_items, refunds, register_sessions, role_permissions, sale_items, sale_payments, sales, signup_risk_events, sms_send_log, sms_settings, stores, subscriptions, support_ticket_notes, support_tickets, suppressed_emails, time_entries, user_roles.
Sequences to preserve current values: `receipt_number_seq`, `support_ticket_number_seq`, pgmq msg-id sequences.

**Key RPC/business logic that must exist before the app can run:** `finalize_pos_sale`, `handle_new_user`, `current_store_id`, `has_role` / `has_any_role` / `has_permission` / `has_admin_permission` / `is_super_admin` / `is_platform_staff` / `can_manage_employee` / `is_last_owner`, `recompute_store_plan` / `has_active_plan` / `is_read_only` / `plan_tier_for_price` / `simulate_trial_expiry`, `activate_verified_business_trial` / `seza_attach_signup_identity` / `seza_prepare_new_store_trial`, `consume_api_rate_limit` / `enforce_authenticated_write_rate_limit` / `cleanup_api_rate_limit_buckets`, `pos_find_pin_candidates` / `pos_pin_conflict_check` / `pos_list_unfingerprinted` / `email_for_employee_id`, `record_legal_acceptance`, `merchant_update_support_ticket`, `admin_global_search`, `generate_store_code` / `generate_employee_id`, email queue helpers (`enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`, `email_queue_wake`, `email_queue_dispatch`), and all `tg_*` protection triggers (stores platform fields, profiles/time_entries privileged self-update, device secret_hash, super_admin role, role exclusivity, stock decrement/restock, refund totals, receipt/ticket numbering).
Also migrate the explicit GRANTs — several tables rely on **column-level** grants (profiles, stores, device_registrations) and revoked EXECUTE on internal functions. A plain `pg_dump` of data alone will not carry the security posture; the 96 files in `supabase/migrations/` are the source of truth.

**Extensions:** plpgsql, pgcrypto, uuid-ossp, pg_trgm, pg_net, pg_cron, pgmq, supabase_vault, pg_stat_statements. `pg_cron`/`pg_net`/`pgmq` must be enabled on the new project before the email-queue migrations apply.

**Storage:** buckets `product-images` (private), `avatars` (private) + 9 `storage.objects` policies. Objects must be copied, and paths are store-id prefixed — so store IDs must be preserved.

**Realtime:** publication `supabase_realtime` on stores, time_entries, role_permissions, payment_terminals, support_tickets, support_ticket_notes, admin_support_sessions; plus 2 RLS policies on `realtime.messages` for the HMAC-signed customer-display topics. `device_registrations` is intentionally excluded (secret_hash leak fix) — keep it excluded.

**Auth:** providers in use today are `email`, `google`, `apple` (9 users / 10 identities). Email/password + magic-link (`verifyOtp` for passkey sessions), passkeys via `passkey_credentials`/`passkey_challenges`, and cashier PIN via HMAC fingerprints. Auth hook (send-email) currently points at `/lovable/email/auth/webhook`. JWT secret is used server-side (`SUPABASE_JWT_SECRET`).

**Scheduled/queued:** pgmq queues `auth_emails`, `transactional_emails` + both DLQs; `pg_cron` job `process-email-queue` is created on demand by `email_queue_wake` (currently none scheduled) and unscheduled when queues drain.

**Server functions (17 `createServerFn` modules):** admin, company-admin, login-attempts, auth, passkeys, verification-status, barcode-lookup, billing/checkout, employees, overrides, platform-settings, pos/customer-display, pos/device-pairing, pos/stripe-terminal, receipts/public, rate-limit. All run on the Cloudflare worker — no Supabase Edge Functions exist, so nothing to port there.

**Public API routes (must keep identical paths — the Android APK hardcodes `https://sezapos.com` + these paths):** `api/public/health`, `api/public/live-chat`, `api/public/payments/webhook`, and `api/public/pos/{verify-pin, verify-employee-pin, verify-manager-pin, set-my-pin, pair-device, device-heartbeat, complete-first-login, timeclock, support-respond, support-end, stripe-terminal/connection-token, stripe-terminal/payment-intent, finix/sale, finix/status, finix/cancel}`.

**Secrets/env to recreate on Cloudflare:** SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PROJECT_ID, SUPABASE_JWT_SECRET, VITE_SUPABASE_{URL,PUBLISHABLE_KEY,PROJECT_ID}, STRIPE_{SANDBOX,LIVE}_API_KEY, PAYMENTS_{SANDBOX,LIVE}_WEBHOOK_SECRET, STRIPE_{SANDBOX,LIVE}_WEBHOOK_SECRET, FINIX_{SANDBOX,LIVE}_{USERNAME,PASSWORD}, PIN_FINGERPRINT_HMAC_SECRET, TRIAL_FINGERPRINT_SECRET, PASSKEY_RP_ID, PASSKEY_ORIGINS, ALLOWED_ORIGINS, SEZA_ALLOWED_ORIGINS, APP_URL, APP_VERSION, PUBLIC_DASHBOARD_URL / VITE_DASHBOARD_URL, VITE_TURNSTILE_SITE_KEY, VITE_PAYMENTS_CLIENT_TOKEN, VITE_SEZA_TURN_{URL,USERNAME,CREDENTIAL}, plus replacements for LOVABLE_API_KEY / LOVABLE_SEND_URL / LOVABLE_BUILD_ID. SMS (Twilio/Vonage) credentials live per-store in the `sms_settings` table, not in env.

**Stripe:** merchant subscription billing (checkout + `subscriptions` table + `tg_subscription_recompute` + `recompute_store_plan`), webhook at `/api/public/payments/webhook` with HMAC verification in `src/lib/stripe.server.ts`, and Stripe Terminal for in-person payments. Webhook endpoints must be re-pointed to the new domain and new signing secrets stored.

## 3. Lovable-only files that do NOT need migrating

`.lovable/**` (incl. `.lovable/mcp/generated`), `src/integrations/lovable/index.ts` (unused broker), `src/lib/lovable-error-reporting.ts`, `src/routes/[.mcp]/**` + `[.well-known]/oauth-protected-resource.ts` + `src/routes/mcp.ts` + `src/lib/mcp/**` (only if dropping agent integrations), `supabase/config.toml`, and the large set of one-off patch/report docs at repo root (`PATCH-*`, `SEZA-*.txt/md`, `APPLY-*`, `*-INSTRUCTIONS.md`, `lint-errors.txt`, `SHA256SUMS.txt`). Auto-generated files that get regenerated, not hand-migrated: `src/integrations/supabase/{client,client.server,types,auth-middleware,auth-attacher}.ts`, `src/routeTree.gen.ts`.

## 4. Migration order (no downtime, no data loss)

1. **Freeze point prep** — new Supabase project created; enable pg_cron, pg_net, pgmq, pgcrypto, pg_trgm, uuid-ossp, vault.
2. **Schema first, from `supabase/migrations/`** — apply all 96 migrations in order against the new project (not a `pg_dump --schema-only`), so grants, revokes, column-level privileges and policies match exactly. Verify counts: 41 tables, 84 functions, 35 triggers, 98 public policies, 9 storage policies, 2 realtime policies.
3. **Configure auth on the new project** — email provider, Google, Apple (new client IDs or reuse existing OAuth apps), redirect URLs, JWT settings. Do **not** enable anonymous sign-ups or auto-confirm.
4. **Code cut-over branch (no deploy yet)** — replace the Lovable Vite preset, email send layer, webhook verification, Stripe gateway base, host allow-lists, error reporting; remove the unused Lovable auth broker; decide MCP keep/drop.
5. **Cloudflare staging deploy** on a temporary hostname pointing at the new Supabase; run the full validation checklist in §6 against seeded/test data.
6. **Announce maintenance window; put POS registers into cash-only offline mode intentionally** (offline queue is designed for this) and stop writes to the old DB.
7. **Data migration, `auth` schema first** — copy `auth.users`, `auth.identities`, `auth.sessions`(optional), `auth.mfa_*`, then `public` tables in FK order (stores → profiles → user_roles → everything else), preserving all UUID primary keys. Then restore sequence values.
8. **Copy Storage objects** for `product-images` and `avatars` preserving object paths and owners.
9. **Recreate vault secret** `email_queue_service_role_key` and update `email_queue_dispatch`/`email_queue_wake` URLs to the new domain; confirm the `process-email-queue` cron arms/disarms.
10. **Re-point external services** — Stripe webhooks (live + sandbox) and Terminal, Supabase auth send-email hook, Finix, Turnstile domain, TURN server allow-list, Capgo OTA/`version.json` `updateUrl`.
11. **DNS cut-over** for sezapos.com, dashboard/admin/pos subdomains to Cloudflare; keep the old deployment reachable but read-only for rollback.
12. **Drain offline queues** — bring registers back online and confirm queued cash sales and receipt emails sync with idempotency keys intact.
13. **Android APK** — only needs a rebuild if the API base host changes; verify pairing, PIN login, heartbeat, support view against the new backend before publishing.
14. **Post-cutover** — re-run the security scan, then decommission the Lovable project after a verification window.

## 5. Risks that could break existing Google / Apple / email users or IDs

- **`auth.users.id` must be preserved verbatim.** Every `public` table (profiles, user_roles, sales.cashier_id, audit_log, legal_acceptances, passkey_credentials, time_entries…) keys off it. Re-creating users via the Admin API without explicit ids silently orphans all history.
- **`auth.identities` must be copied with the original `provider_id` / `sub`.** For Google/Apple the `sub` is what links the provider account to the user; a mismatch creates a *second* account on next sign-in.
- **Apple is the highest-risk provider.** Apple's `sub` is scoped to the Apple *Service ID / Team*. If you register a new Apple Service ID instead of transferring the existing one, every Apple user gets a brand-new `sub` and cannot reach their store. Also note Apple only returns the email on first consent — a new Service ID may not re-supply it. Reuse the existing Apple app/Service ID and add the new redirect URL.
- **Google is safer but still needs the same OAuth client** (or a client in the same project) so `sub` values stay stable; the new Supabase callback URL must be added to the authorized redirect URIs.
- **Password hashes** must come over via the raw `auth.users.encrypted_password`; a logical export that skips it forces password resets for all email users.
- **Email confirmation state**: `email_confirmed_at` drives `activate_verified_business_trial`. Losing it re-triggers trial logic or blocks verified stores.
- **`handle_new_user` trigger on a fresh project**: if it is active while users are being imported, it will create duplicate stores/profiles/roles for every imported user. Import auth users with the trigger disabled, then re-enable.
- **PIN + trial + display fingerprints** are HMACs of `PIN_FINGERPRINT_HMAC_SECRET` / `TRIAL_FINGERPRINT_SECRET`. New secrets invalidate every stored `pin_fingerprint` and `business_fingerprint` — cashiers cannot log in. Carry the existing secret values across.
- **Passkeys break if `PASSKEY_RP_ID` changes.** Keep `sezapos.com` as the RP ID; any change requires all owners to re-register.
- **Device pairing secrets** (`device_registrations.secret_hash`) are protected by a trigger and only writable by service_role — import them as service_role with the trigger accounted for, or every Android register must be re-paired.
- **JWT signing key change invalidates live sessions**: expect all users to be signed out at cut-over. `SUPABASE_JWT_SECRET`-dependent server code must be updated in the same deploy, and the Android app must handle a forced re-login.
- **Stripe**: reusing sandbox keys/webhook secrets against a live domain, or forgetting to re-point the webhook, silently stops subscription state updates while stores appear active. Stripe Terminal must stay marked unavailable until in-person payments are re-tested end to end on the new stack.
- **Offline queue loss**: any register with unsynced IndexedDB actions during cut-over must sync *before* DNS moves, or those cash sales land in a decommissioned backend.
- **Realtime dependency**: support tickets, screen-share signaling, role permissions and customer display all rely on the publication + `realtime.messages` policies. Missing them looks like "support view hangs" rather than an error.

## 6. Validation checklist (run on staging, then again after cut-over)

**Structure:** table/function/trigger/policy counts match §2; column-level grants on profiles/stores/device_registrations present; EXECUTE revoked from `anon`/`PUBLIC` on internal trigger functions; extensions all present; realtime publication table list matches and excludes `device_registrations`.
**Auth:** existing email user signs in with old password; existing Google user lands on the same store/dashboard (no new user row); existing Apple user likewise; passkey sign-in works; password reset email delivers; new merchant signup creates exactly one store + owner role and a 14-day trial.
**Data integrity:** row counts per table match source; a known sale's receipt_number, cashier, items and payments render identically; `receipt_number_seq` next value is above the max existing receipt; store IDs unchanged so storage paths resolve; avatars and product images load.
**POS:** cashier PIN login, clock in/out, cash sale, card sale, refund, drawer open with reason log, offline cash sale then sync (no duplicates thanks to `idempotency_key`), customer display shows signed updates, barcode scan.
**Android APK:** paired device does not re-ask for employee ID, heartbeat appears in fleet view, support view request → merchant accept → screen share, OTA update check hits the new `version.json`.
**Admin/dashboard:** admin auth isolated from merchant session, global search returns stores/owners/terminals/subscriptions, business workspace loads, audit log writes, platform health reports the new build id.
**Billing:** Stripe checkout in test mode creates a subscription and `recompute_store_plan` flips plan_status; webhook signature verification passes on the new secret; trial expiry simulation downgrades correctly.
**Email/SMS:** auth email via the new provider, transactional receipt email (server-derived data only), suppression/unsubscribe route, queue drains and the cron unschedules itself, per-store Twilio/Vonage SMS receipt sends.
**Security/ops:** rate limiting triggers on repeated logins and DB writes, cross-store access attempts denied for each role, `noindex` headers on dashboard/admin/pos hosts, no secrets in the client bundle, and a full security scan with no new findings.
