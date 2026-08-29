# SEZA POS PIN Login Final V3

Build marker: `SEZA-POS-PIN-COMPAT-2026-08-29-3`

This is cumulative over the Real Register Hardening patch.

The PIN client now accepts both:
- newer verify-pin responses: user_id + bootstrap + optional token_hash
- older deployed verify-pin responses: email + token_hash

For an older response the APK:
1. verifies the returned token,
2. recovers the employee user ID,
3. tries the paired-device bootstrap route,
4. falls back to authenticated Supabase reads if that route is not deployed,
5. caches the cashier/store/catalog/permissions snapshot,
6. stores the device-bound offline PIN verifier,
7. enters /pos.

This removes the API-version mismatch that produced the generic
"Sign-in failed. Please try again." immediately after entering a valid PIN.

The Android sync verification marker was bumped so stale APK builds are rejected.
