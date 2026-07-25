# SEZA POS 1.3.2 Cleanup Manifest

Release identity: **1.3.2 / Android build 8**  
Source reviewed: `pos-sezapos-main 9(2).zip`

## What this patch intentionally does not do

- It does not combine the frontend or backend into one giant file. The existing TanStack file-route boundaries and feature modules are easier to debug and safer to build.
- It does not delete a source file merely because its name looks unused.
- It does not contain `.env` files, service-role keys, signing keys, APK/AAB files, `node_modules`, or generated build output.
- It does not claim that printer, drawer, scanner, card-reader, production database, or real Android behavior has been proven without physical testing.

## Added files

| File | Purpose |
|---|---|
| `PROJECT-MAP.md` | Maps marketing, owner, POS, admin, Android, backend, security, and database code. |
| `docs/releases/SEZA-1.3.2-CLEANUP-MANIFEST.md` | Exact release/change record and validation status. |
| `scripts/cleanup-project.ps1` | Safe Windows cleanup of known caches, backups, generated output, nested release copies, and old one-time patch files. |
| `scripts/cleanup-project.sh` | Equivalent cleanup for macOS/Linux/Git Bash. |
| `capacitor-shell/screens/BootFailureScreen.tsx` | Shows retry/copy-diagnostics UI instead of a blank Android WebView. |
| `src/lib/security/public-rate-limit.server.ts` | Hashed database-backed public API rate limiter with conservative process-local fallback. |
| `supabase/migrations/20260725043000_public_api_rate_limits.sql` | Shared fixed-window rate-limit table/RPC restricted to the service role. |

## Android startup and APK changes

| File | Change |
|---|---|
| `capacitor-shell/index.html` | Added an immediate static SEZA loading screen before React executes. |
| `capacitor-shell/main.tsx` | Added startup timeouts, configuration failure handling, reliable native-splash hiding, query cache defaults, and recovery rendering. |
| `capacitor-shell/supabase.ts` | Changed Supabase creation to lazy initialization, validates HTTPS/public keys, and prevents secret keys from being bundled. |
| `vite.capacitor.config.ts` | Always injects defined public Supabase build values and aligns bundled-shell aliases/output. |
| `capacitor-shell/screens/BrandedBootScreen.tsx` | Added per-step timeout behavior so a stalled network read cannot trap startup. |
| `capacitor-shell/assets/seza-logo.png` | Resized/compressed the APK logo asset for faster startup and a smaller bundle. |
| `capacitor.config.ts` | Corrected Android build instructions to the maintained npm command. |
| `android/capacitor.settings.gradle` | Removed the unused ML Kit camera-scanner plugin project. |
| `android/app/capacitor.build.gradle` | Removed the unused ML Kit camera-scanner dependency. |

## Public endpoint security changes

The following routes now call the shared limiter before expensive service-role operations:

| File | Protected operation |
|---|---|
| `src/routes/api/public/pos/pair-device.ts` | One-time device pairing attempts. |
| `src/routes/api/public/pos/verify-pin.ts` | Paired-register PIN sign-in. |
| `src/routes/api/public/pos/verify-employee-pin.ts` | Employee PIN verification. |
| `src/routes/api/public/pos/verify-manager-pin.ts` | Manager approval attempts. |
| `src/routes/api/public/pos/device-heartbeat.ts` | Device heartbeat traffic. |
| `src/routes/api/public/pos/timeclock.ts` | Public time-clock actions. |
| `src/routes/api/public/live-chat.ts` | Website live-chat start/send/poll traffic. |

Raw IP addresses, PINs, device secrets, manager tokens, pairing codes, and chat tokens are not stored in the rate-limit table; only SHA-256 bucket keys are stored.

## Performance and logging changes

| File | Change |
|---|---|
| `src/router.tsx` | Added React Query stale/cache/retry defaults to reduce repeated reads during navigation/remounts. |
| `src/assets/seza-logo.png` | Resized/compressed the shared logo asset. |
| `src/lib/offline/sync.ts` | Development-only informational logging; operational warnings/errors remain. |
| `src/lib/pos/payment-terminal.ts` | Development-only informational logging. |
| `capacitor-shell/support/nativeScreenCapture.ts` | Development-only informational logging. |

## Dependency, version, and quality changes

| File | Change |
|---|---|
| `package.json` | Renamed package to `seza-pos`, aligned version 1.3.2, removed unused ML Kit dependency, added maintained Android sync, type-check, and test commands. |
| `package-lock.json` | Aligned package/version and removed the unused ML Kit lock entry. |
| `bun.lock` | Aligned package name and removed the same ML Kit dependency so Lovable/Bun cannot restore it. |
| `public/version.json` | Aligned version 1.3.2/build 8 and release notes. |
| `android/app/build.gradle` | Already contained version 1.3.2/build 8 and is now verified against public/package metadata. |
| `.github/workflows/quality.yml` | Added type-check and unit-test jobs to the existing verify/lint/web/Android pipeline. |
| `capacitor-shell/lifecycle/backButtonCoordinator.test.ts` | Converted undeclared Vitest usage to Node's built-in test runner. |
| `scripts/verify-production.mjs` | Added version, startup fallback, rate-limit, nested-project, sensitive-file, and removed-dependency release contracts. |
| `.gitignore` | Generalized old production-patch exclusion and ignores local ZIP release archives. |

## Documentation changes

| File | Change |
|---|---|
| `ANDROID.md` | Replaced old Bun/build-6/camera-scanner instructions with npm/build-8/physical-scanner workflow. |
| `DATABASE-INSTRUCTIONS.md` | Lists the complete pending migration chain and shared rate-limit verification. |
| `BUILD-INSTRUCTIONS.md` | Adds paste-ready patch application, safe cleanup, validation, migration, Android, and release steps. |
| `CLEANUP-INSTRUCTIONS.md` | Documents exactly what cleanup scripts remove and preserve. |
| `KNOWN-LIMITATIONS.md` | Separates completed static validation from hardware/live-environment work still required. |
| `RELEASE-TEST-CHECKLIST.md` | Updated to 1.3.2/build 8, adds type-check/tests/rate-limit checks, and removes camera-scanner testing. |
| `CHANGELOG.md` | Added the complete 1.3.2/build 8 release record while retaining 1.3.0 history. |

## Verified removals

The cleanup script removes these categories from the project root after the patch is copied:

- Nested `SEZA-POS-v*-PRODUCTION-PATCH` full-project copies
- `.eslintcache`
- `*.bak`, `*.backup`, `*.orig`, and editor `*~` files
- Generated `android-webdir`, `dist`, `.output`, `.vinxi`, and Android Gradle build folders
- Old one-time 1.2.x/homepage/recovery patch scripts, manifests, checksums, and validation files listed inside the cleanup scripts

The reviewed ZIP specifically contained 13 timestamped `.bak` source files and a 55-file nested v1.3.0 project payload; neither belongs in the maintained project.

## Existing production work preserved

No replacement was made for code already present and materially correct:

- Atomic/idempotent online sale finalization
- Durable offline sale/action/drawer/receipt queues
- Duplicate transaction protection
- Register dependency ordering and store-switch conflict protection
- Physical scanner reconstruction and catalog search
- Inventory edit/delete/price/stock actions
- Admin support claim, chat, resolve, close, and reopen flow
- Device secure storage and Android backup protection

## Validation performed

Passed in the review container:

- `node scripts/verify-production.mjs`
- 5 Android lifecycle tests with Node's built-in test runner
- Shell syntax check for `scripts/cleanup-project.sh`
- JSON parsing for `package.json`, `package-lock.json`, and `public/version.json`
- TypeScript/TSX syntax transpilation for 338 source files

Not completed in the review container:

- Full `npm ci`
- Full TypeScript semantic type-check
- ESLint
- Hosted Vite build
- Capacitor sync/Gradle APK build
- Production migration application
- Physical hardware/provider testing

Dependency installation was blocked by a temporary service-unavailable response from the package registry configured in the lockfile. Run the complete command sequence in `BUILD-INSTRUCTIONS.md` before publishing.
