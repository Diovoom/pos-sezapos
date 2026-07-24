# SEZA POS v1.3.0 Production Patch Manifest

**Target:** the current outer project root, normally `F:\pos-sezapos`  
**Source reviewed:** `pos-sezapos-main 6(2).zip`  
**Patch release:** application `1.3.0`, Android build `6`  
**Source archive SHA-256:** `4cd4dfe170b2b3b86e59eb109485773ba39f10d0c31f103d54f4a9d14bcfd5ce`

This package contains only changed or newly added project files. It does not contain the full repository, `.env` files, `.git`, `node_modules`, generated web output, APKs, or the nested duplicate project.

## Files included

### `.github/workflows/quality.yml`
Runs install, release-contract verification, lint, hosted build, Capacitor synchronization, and Android debug compilation on GitHub pushes and pull requests.

### `.gitignore`
Excludes secrets, generated web/Android outputs, APK/AAB files, backups, temporary files, and the nested duplicate project.

### `.nvmrc`
Pins Node.js 24 for the locked dependency set.

### `android/app/build.gradle`
Raises Android release identity to version 1.3.0, build 6.

### `android/app/src/main/AndroidManifest.xml`
Disables Android app-data backup and registers explicit backup/data-transfer exclusion rules.

### `android/app/src/main/java/com/sezapos/app/MainActivity.java`
Registers the native secure-storage plugin during Capacitor startup.

### `android/app/src/main/java/com/sezapos/security/SezaSecureStoragePlugin.java`
Encrypts the device-pairing record with AES-GCM using Android Keystore.

### `android/app/src/main/res/xml/backup_rules.xml`
Excludes all POS app data from legacy Android cloud backup.

### `android/app/src/main/res/xml/data_extraction_rules.xml`
Excludes all POS app data from Android cloud backup and device transfer.

### `capacitor-shell/lib/pairing.ts`
Migrates the long-lived pairing secret out of WebView localStorage and into Keystore-backed native storage.

### `capacitor-shell/main.tsx`
Initializes secure pairing before rendering and makes native mutations execute locally even while offline.

### `capacitor-shell/screens/PairDeviceScreen.tsx`
Waits for secure persistence before treating a register as paired.

### `capacitor-shell/screens/PendingSyncScreen.tsx`
Shows sales, cash, action queues, permanent failures, and unsafe store-switch conflicts.

### `capacitor-shell/screens/SettingsScreen.tsx`
Removes employee-PIN management from cashier settings while retaining manager/owner access.

### `package-lock.json`
Locks the 1.3.0 release metadata consistently.

### `package.json`
Adds production verification and sets application version 1.3.0.

### `public/version.json`
Publishes build 6 release metadata and accurate release notes.

### `scripts/verify-production.mjs`
Checks version consistency, migration contracts, offline guarantees, Android security, legal links, and repository hygiene.

### `src/components/i18n/GlobalLanguageRuntime.tsx`
Eliminates substring replacement that corrupted words and merchant-authored text; unknown content falls back to whole English strings.

### `src/components/marketing/MarketingShell.tsx`
Replaces the nonfunctional hardware-shop presentation with an honest compatibility-guide entry point.

### `src/components/pos/CloseShiftDialog.tsx`
Allows local-first shift closing and queues the action safely when offline.

### `src/components/pos/OpenDrawerDialog.tsx`
Makes drawer/cash actions offline-capable, durable, audited, and honest about hardware failures.

### `src/components/pos/ReceiptDialog.tsx`
Distinguishes a locally queued email receipt from provider-confirmed delivery.

### `src/components/pos/SmsReceiptPanel.tsx`
Distinguishes queued, already-sent, and provider-confirmed SMS states.

### `src/lib/admin/company-admin.functions.ts`
Keeps support priority/chat lifecycle consistent across claim, investigate, wait, resolve, close, and reopen operations.

### `src/lib/audit-log.ts`
Adds tenant-scoped audit rows and queues audit events through offline/retry failures instead of silently dropping them.

### `src/lib/legal/config.ts`
Defines explicit Terms and Privacy policy version identifiers.

### `src/lib/offline/db.ts`
Adds transaction-safe local receipt sequencing, durable retry metadata, audit actions, and hard protection against deleting unsynced records during store reassignment.

### `src/lib/offline/sync.ts`
Uses atomic sale finalization, bounded retries, permanent-failure states, register dependencies, receipt dependencies, audit syncing, and safe shift-close ordering.

### `src/lib/pos/product-images.ts`
Stores actual product-image blobs behind stable cache keys so images survive signed-URL expiry and app restarts offline.

### `src/routes/_dashboard/setup.tsx`
Replaces placeholder legal links, records policy version/timestamp, and prevents advancing when setup persistence fails.

### `src/routes/_pos/pos.tsx`
Implements immediate offline cash checkout, atomic online checkout, tenant-safe query caches, scroll/safe-area fixes, image fallbacks, and store-switch checkout blocking.

### `src/routes/_pos/register.tsx`
Ensures register and cash-movement mutations execute and queue locally while offline.

### `src/routes/_pos/timeclock.tsx`
Ensures clock, break, and related mutations execute and queue locally while offline.

### `src/routes/api/public/pos/set-my-pin.ts`
Scopes PIN-management authorization to the active store, blocks cashiers, and audits both set and clear actions.

### `src/routes/hardware.tsx`
Turns the unfinished storefront into a professional compatibility and purchasing-preparation guide.

### `src/routes/index.tsx`
Removes misleading hardware checkout claims from the homepage.

### `src/routes/signup.tsx`
Stores legal policy versions and acceptance timestamp in signup metadata.

### `supabase/migrations/20260723212000_tenant_permission_scope.sql`
Prevents a role in one merchant store from granting permissions in another store.

### `supabase/migrations/20260723213000_atomic_pos_sale_finalize.sql`
Creates an idempotent, inventory-locked PostgreSQL transaction for sale header, items, payment ledger, and stock effects.

### `supabase/migrations/20260723214500_support_and_platform_consistency.sql`
Repairs production support columns/state, maintenance settings, indexes, and realtime publication membership.

### `supabase/migrations/20260723220000_legal_acceptance_records.sql`
Creates immutable, versioned legal-acceptance records and a session-scoped recording RPC.

## Files intentionally not included

- `.env`, `.env.development`, `.env.production`, and `.env.local`
- `.git/`
- `node_modules/`
- `dist/` and `android-webdir/`
- Existing APK/AAB/build outputs
- The nested second copy at `pos-sezapos-main/`
- Unchanged source files

## Patch boundaries

This release fixes the highest-risk production foundations found in the supplied ZIP. Physical hardware, live provider credentials, production database execution, and a complete device acceptance test cannot be proven from source alone. Read `KNOWN-LIMITATIONS.md` and complete `RELEASE-TEST-CHECKLIST.md` before merchant use.
