# SEZA POS PIN Real Fix V4

Build marker: `SEZA-POS-PIN-FINGERPRINT-FALLBACK-2026-08-29-4`

Root cause fixed:
`/api/public/pos/verify-pin` called `pinFingerprint()` unconditionally.
When `PIN_FINGERPRINT_HMAC_SECRET` was missing, the server threw before the
store-scoped fallback and returned a generic 500/non-JSON response. The APK
then displayed "Sign-in failed. Please try again."

V4 makes fingerprinting optional for register entry. A paired device can log
an active employee in by verifying the store-scoped scrypt PIN hashes directly
when the fingerprint secret/RPC/index is unavailable.

The legacy employee PIN fingerprint backfill is also best-effort, and the APK
logs non-SEZA HTTP failures internally without exposing technical details to the cashier.
