# Changelog — SEZA POS 1.3.2 (Android build 8)

## Android reliability

- Added a static pre-React loading screen so the WebView never starts as a blank white page.
- Added startup configuration validation, pairing/session timeouts, and a user-safe recovery screen with a diagnostic code.
- Added timeouts to branded boot data checks so a stalled network request cannot trap the register indefinitely.
- Added stable public Supabase build fallbacks for the bundled APK while rejecting secret keys.
- Reduced the bundled Android logo from about 763 KB to about 151 KB.

## Security and abuse protection

- Added database-backed rate limits for device pairing, employee PIN sign-in, manager approvals, device heartbeat, time clock, and website live chat.
- Rate-limit keys are SHA-256 hashes; raw IP addresses, PINs, device secrets, and pairing codes are not stored in the limiter table.
- Added a conservative process-local fallback when the database limiter is temporarily unavailable.
- Removed the unused ML Kit camera barcode plugin from npm and Android Gradle configuration. Physical USB/Bluetooth scanner support remains.

## Performance and maintenance

- Added shared React Query cache defaults to reduce repeated reads during navigation and component remounts.
- Added `PROJECT-MAP.md` showing the marketing, owner, POS, admin, Android, backend, security, and database locations.
- Added repeatable Windows and shell cleanup scripts.
- Added `typecheck` and built-in Node test commands and included both in CI.
- Aligned package, public release, and Android version metadata at 1.3.2 / build 8.
- Removed the nested v1.3.0 project copy, `.eslintcache`, and verified editor backup files from the maintained tree.

## Preserved production workflows

- Atomic/idempotent sale finalization and duplicate protection.
- Durable offline cash sale, action, drawer, and receipt queues.
- Store-switch protection for unsynced financial records.
- Physical scanner auto-detection and product search.
- Inventory edit/delete/price/stock actions.
- Admin support claim, reply, resolve, close, and reopen workflows.

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
