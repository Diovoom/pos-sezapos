# Store-Scoped PIN Login + Device Pairing

## Goal
Cashier's daily login on a paired Android register becomes: **enter 6-digit PIN → in**. Employee ID + PIN stays as a fallback. Cross-tenant PIN lookup stays disabled. Same-store PIN duplicates are blocked at every write path.

## Architecture

```text
Merchant dashboard              APK (Capacitor)              Public API
─────────────────────           ────────────────────          ──────────────────────
Devices > Pair register   →     Enter pairing code    →      /pos/pair-device
   (owner/manager)              (once, first launch)         → device_secret + store/business
       │                               │
       ▼                               ▼
device_registrations           localStorage:                 /pos/verify-pin
(store_id, business_id,        - device_id                     (device_id + secret + PIN)
 label, secret_hash,           - device_secret               → scoped candidate lookup
 status, last_seen, ...)       - paired store/business       → verify salted hash
                                                             → magiclink token_hash
                               PIN entry screen
                               (no Employee ID by default)
```

## Database (single migration)

1. `device_registrations`
   - `id`, `business_id`, `store_id`, `label`, `secret_hash` (scrypt),
     `status` ('active'|'revoked'), `paired_by`, `paired_at`, `last_seen_at`,
     `revoked_at`, `revoked_by`, `platform` (nullable).
   - RLS: owner/admin/manager of the store can select/insert/update/delete;
     service_role full access. No anon.
2. `device_pairing_codes` (short-lived one-shot)
   - `code_hash`, `store_id`, `business_id`, `label`, `created_by`,
     `expires_at`, `consumed_device_id`, `consumed_at`.
3. `profiles.pin_fingerprint` (nullable text) — HMAC(business_id || store_id || pin) with `PIN_FINGERPRINT_HMAC_SECRET`.
   - Partial unique index: `(store_id, pin_fingerprint) WHERE status='active' AND pin_fingerprint IS NOT NULL`.
   - Column readable only via server functions (revoke SELECT to anon; keep authenticated for now scoped by existing profiles RLS but never returned in client selects).
4. RPCs (`SECURITY DEFINER`, `search_path=public`):
   - `pos_find_pin_candidates(_store_id uuid, _fingerprint text)` → returns candidate row(s) (id, email, pin_hash) — callable only by service_role.
   - `pos_pin_conflict_check(_store_id uuid, _fingerprint text, _exclude_user uuid)` → boolean, callable by authenticated (used by dashboard UI preview) but ALSO re-checked server-side on write.
5. Audit action strings: `pin_created`, `pin_changed`, `pin_reset`, `pin_conflict_blocked`, `device_paired`, `device_revoked`, `pin_login_scope_mismatch`, `pin_fallback_used`.

## New / changed files

**Server (server-only, never bundled to client)**
- `src/lib/pos/fingerprint.server.ts` — `pinFingerprint(businessId, storeId, pin)` using HMAC-SHA256 over `PIN_FINGERPRINT_HMAC_SECRET`.
- `src/lib/pos/device.server.ts` — pairing code mint/consume, device secret hash/verify, `resolveDeviceContext(deviceId, deviceSecret)` returns `{store_id, business_id}` or throws.

**Public API routes (APK-callable)**
- `src/routes/api/public/pos/pair-device.ts` — POST { code, label, platform } → { device_id, device_secret, store_id, business_id, store_name }.
- `src/routes/api/public/pos/verify-pin.ts` — POST { device_id, device_secret, pin, employee_id? } → magiclink token_hash. Scoped lookup by device→store; falls back to Employee ID + PIN on ambiguity or when device unpaired.
- Keep existing `verify-employee-pin.ts` as legacy Employee ID + PIN fallback (no cross-tenant lookup — already fixed).
- `src/routes/api/public/pos/device-heartbeat.ts` — updates `last_seen_at` (bearer auth).

**Merchant dashboard**
- Extend `src/routes/_dashboard/settings.tsx` (or new panel `src/components/settings/RegisterDevicesPanel.tsx`) with:
  - List paired devices for the current store.
  - "Pair new register" → generates 8-char code, valid 15 min, one-time use, copy-to-clipboard.
  - Revoke device (with reason + audit).
- `src/lib/employees.functions.ts`:
  - `setEmployeePin` and `resetEmployeePin` compute fingerprint for every assigned store and check `pos_pin_conflict_check` before write; block with generic "already in use at this location".
  - `updateEmployeeStores` (if exists) or the store-assignment path validates fingerprint at each new store.
  - Weak-PIN blocklist (000000, 111111…, 123456, 654321, employee_id, ascending/descending, all same digit).
- `src/routes/_dashboard/employees.$id.tsx` `PinCard`: surface the generic conflict message; no employee identity leaked.

**APK (Capacitor shell)**
- `capacitor-shell/screens/PairDeviceScreen.tsx` — first-launch pairing code entry.
- `capacitor-shell/screens/AuthScreen.tsx` — when paired, show PIN-only pad; expose "Sign in with Employee ID" link for fallback.
- `capacitor-shell/lib/device.ts` — localStorage device_id/secret, `getDeviceContext()`, `unpair()`.
- `capacitor-shell/router.tsx` — route to PairDeviceScreen when unpaired.
- `capacitor-shell/screens/SettingsScreen.tsx` — show paired store + "Unpair this register" (requires manager PIN via existing override).

**Offline cache**
- `src/lib/offline/db.ts` — cached employee list scoped by `paired store_id` only; drop entries whose `store_id` no longer matches; store `pin_hash` + `id` + `email`, never plaintext.
- Sync: on reconnect, refresh cache from `pos_list_store_employees(store_id)` RPC (service-side, device-authenticated).

## Secrets
- Generate `PIN_FINGERPRINT_HMAC_SECRET` (64 chars) via `generate_secret`. Used only in server-only helpers.

## Fingerprint backfill strategy
Existing PIN hashes are salted scrypt — cannot derive plaintext. Migration:
1. Add `pin_fingerprint` column NULL.
2. Any employee with NULL fingerprint continues to authenticate only via Employee ID + PIN fallback (or PIN-only if they happen to be the sole candidate at their store).
3. On next successful PIN auth OR any PIN change/reset, populate fingerprint. After success, uniqueness index enforces future writes.
4. Unresolved same-store dupes are surfaced in Employees list with a "Reset PIN required" badge for the owner.

## Validation
- One paired-store employee: PIN-only → in.
- Two employees, same store, same PIN: second creation blocked with generic message.
- Different stores / businesses may share a PIN.
- Client sending a forged store_id in `/verify-pin` is ignored — server derives store from `device_id + device_secret`.
- Revoked device → PIN-only refused, must re-pair.
- Ambiguous (legacy null-fingerprint dupes) → neutral "enter Employee ID" prompt.
- Weak PIN blocked at creation/reset.
- Offline cache never contains cross-store employees.
- Rate limits (existing `admin_login_attempts`-style pattern) applied per device + per store.
- Audit events emitted for pair/revoke/conflict/fallback/scope-mismatch.

## Explicitly NOT touched
Marketing site, `_adminApp/*`, subscriptions/billing, `channel_token` / support WebRTC, `admin_permissions` policy, unrelated merchant dashboard pages, existing PIN hashing scheme.

## Rollout order
1. Migration + generate HMAC secret.
2. Server helpers + public API routes.
3. Merchant dashboard pairing UI + employee PIN uniqueness enforcement.
4. APK pairing + PIN-only screen + offline cache scoping.
5. Audit + rate limit wiring.
6. Typecheck + smoke via Playwright on the merchant dashboard pairing flow.
