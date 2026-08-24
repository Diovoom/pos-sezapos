# Known Limitations and Required Real-World Validation

This cleanup improves code safety and maintainability, but a source review cannot prove external hardware, provider, and production-database behavior.

## Validation completed in this review

- All TypeScript/TSX source files passed syntax transpilation.
- The Android lifecycle tests passed with Node's built-in test runner.
- Package/public/Android release metadata is aligned at 1.3.2/build 8.
- The unused ML Kit barcode dependency was removed from npm, Bun, Capacitor, and Android Gradle configuration.
- The nested release project, `.eslintcache`, and source backup files were removed from the maintained tree.

## Validation still required on your machine/CI

A complete `npm ci`, Vite build, ESLint run, type-check, and Gradle build could not be completed in the review container because the configured package registry returned a temporary service-unavailable response while installing dependencies. Run:

```bash
npm ci
npm run verify:production
npm run typecheck
npm run lint
npm test
npm run build
npm run android:sync
```

Then build the Android debug APK and complete the release checklist. Do not publish merely because syntax checks passed.

## Requires production credentials or physical hardware

- Database migrations and RLS behavior in the live Supabase project
- Receipt printer and cash-drawer pulse
- USB/Bluetooth HID barcode scanner on the exact NRS terminal
- Stripe Terminal/Tap to Pay certification and merchant approval
- Screen-sharing media-projection service and device logs
- Real email/SMS provider delivery
- Customer-facing display behavior

## Offline storage

Financial queues remain in IndexedDB inside the Capacitor WebView. The project includes idempotency, transaction-safe local receipt sequencing, retry/backoff, dependency ordering, store-switch protection, and `Needs Attention` states. Native SQLite remains a future hardening project and would require a tested migration of existing device data.

## Rate-limit fallback

When the shared database limiter is unavailable, the server uses a process-local fallback so all POS users are not locked out by one transient database error. This fallback is not shared across server instances. Apply `20260725043000_public_api_rate_limits.sql` before production release.

## Automated coverage

The current tests cover Android lifecycle coordination and static production contracts. They are not a complete end-to-end suite. A controlled pilot shift and the full release checklist remain mandatory.
