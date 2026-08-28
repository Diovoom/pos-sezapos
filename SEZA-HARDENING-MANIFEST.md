# SEZA POS Real Register Hardening

Build marker: `SEZA-POS-HARDENED-LOCAL-FIRST-2026-08-28-2`

This cumulative patch replaces the earlier Android/network/PIN patches.

## Reliability contract

After a register is successfully paired, normal cash-register operation is local-first:

- paired terminal identity is stored locally
- Android backend traffic uses native Capacitor HTTP, not WebView fetch
- store, products, categories, employees, roles, and permissions are cached
- selected cashier identity is local-first
- PIN login can open the register without waiting for a Supabase Auth session
- register open/close and cash movements commit locally first
- cash sales commit locally first
- cached product stock updates immediately after a local cash sale
- receipts are not blocked by cloud synchronization
- pending records synchronize in the background when an authenticated cloud session is available
- manager override can use paired-device credentials if the cashier cloud session is unavailable
- device heartbeat refreshes the merchant snapshot using device credentials
- cloud/session failures do not force a paired cashier out of the POS
- raw `Failed to fetch` is not shown by the Android shell

Card/processor-backed payments remain online/provider-authorized operations.

## Server routes changed

These require Git push + Cloudflare deployment before testing the new APK:

- `src/routes/api/public/pos/pair-device.ts`
- `src/routes/api/public/pos/verify-pin.ts`
- `src/routes/api/public/pos/verify-manager-pin.ts`
- `src/routes/api/public/pos/device-bootstrap.ts`

## Validation performed

- 29 changed TypeScript/TSX files parsed with TypeScript: 0 syntax errors
- Android shell direct WebView `fetch()` calls: 0
- Android shell raw `Failed to fetch` strings: 0
- cash checkout path does not require `supabase.auth.getUser()`
- remaining checkout Auth gate is for card/processor-backed tenders
- build verifier requires this hardening marker in compiled Android assets

A full Android/Gradle build must still be performed on the Windows development machine.
