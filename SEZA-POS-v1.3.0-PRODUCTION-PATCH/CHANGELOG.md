# Changelog — SEZA POS 1.3.0 (Android build 6)

## Database and transaction safety

- Added tenant-scoped permission evaluation.
- Added atomic/idempotent sale finalization.
- Added product-row locking and aggregate inventory checks.
- Added support/admin consistency and realtime repair migration.
- Added immutable policy-acceptance records.

## Offline Android POS

- Checkout executes locally while offline instead of being paused by React Query.
- Local receipt sequence is transaction-safe.
- Store reassignment cannot erase unsynced financial records.
- Register-open, sales, drawer movements, receipts, and register-close synchronize in dependency order.
- Failed operations use backoff and explicit `Needs Attention` states.
- Pending Sync shows all queues and store conflicts.
- Product images persist across restart and signed-URL expiry.

## Android security

- Pairing secrets moved to Android Keystore-encrypted storage.
- Android cloud backup and device-transfer backup are disabled for POS data.
- Cashiers cannot change protected PIN credentials.
- PIN set/clear operations are tenant-scoped and audited.

## Website and merchant onboarding

- Removed word-substring translation corruption.
- Replaced placeholder Terms/Privacy links.
- Added policy version/timestamp capture.
- Replaced misleading hardware shopping claims with a compatibility guide.

## Support and Admin

- Claim/investigate/wait/reopen activate chat consistently.
- Resolve/close end chat, record end metadata, and normalize priority.
- Audit events include the active store and queue offline.

## Release engineering

- Version raised to 1.3.0 / Android build 6.
- Added Node 24 pin, static production verifier, repository cleanup rules, and GitHub Actions quality workflow.
