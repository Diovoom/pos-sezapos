# Known Limitations and Required Real-World Validation

This patch materially improves the production foundation, but source inspection cannot honestly prove every external integration.

## Not fully executable in the review environment

- Full `npm ci`, Vite build, ESLint, and Gradle dependency resolution could not complete because the review environment had no usable external package/Gradle network access.
- The changed TypeScript/TSX files passed TypeScript syntactic transpilation.
- The production contract verifier passed.
- The native secure-storage Java class passed a Java 17 syntax/API-shape compile against local stubs.
- SQL migrations were reviewed but not applied to your live Lovable Cloud database.

Run the complete build commands locally and in the included GitHub Actions workflow.

## Requires physical hardware or provider credentials

- Receipt printer and cash-drawer pulse
- USB/Bluetooth barcode scanner and Android camera scanner
- Stripe Terminal/Tap to Pay/reader certification and merchant approval
- Screen-sharing media-projection service and device logs
- Real email provider/domain verification and delivery
- Real SMS provider number, compliance, and delivery receipts
- Customer display behavior

## Offline storage architecture

Financial queues remain in IndexedDB inside the Capacitor WebView. This patch adds transaction-safe receipt numbering, idempotency, ordering, backoff, hard store-switch protection, and recovery states. Native SQLite remains a future hardening project and would require a carefully tested data migration on real devices.

## Translation coverage

The dangerous substring translator is removed, and the current locale files contain the existing English key set. New or still-hardcoded UI text that lacks an explicit translation safely remains a complete English sentence instead of becoming corrupted mixed-language text.

## Automated tests

The patch adds CI and production contract checks, but it does not pretend to provide a complete unit/integration/end-to-end test suite. The release checklist is mandatory before merchant use.
