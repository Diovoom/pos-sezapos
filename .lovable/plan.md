P3 is a very large scope (20 sections spanning permissions, scanner, printer, drawer, terminal, email, shift print/PDF, diagnostics). Rather than silently truncate, here is the delivery plan I will execute in this turn, scoped strictly to the Android APK / Capacitor shell, preserving all P1/P2 work.

## Scope discipline
- APK-only changes: `capacitor-shell/**`, native-only stubs, and `src/lib/hardware/**`, `src/lib/offline/**` where the shell already reuses them.
- Shared code (web POS, dashboard, admin) touched **only** for the P3.1 permission fix (`payment.cancel`) — behavior-neutral for the web (permission maps to same owner/manager set).
- No new tables. No schema migrations. No new backend services. Email + shift-summary print use existing endpoints and existing driver layer.

## Sections & files

### 1. Permission-driven tender cancel (§1)
- `src/hooks/usePermissions.ts`: add `payment.cancel` derived permission (true for owner/admin/manager + anyone holding the DB `payment.cancel` grant). Web behavior unchanged (same set was already bypass in previous branches on web = none; on APK previously role-label).
- `src/routes/_pos/pos.tsx`: compute `bypassCancelApproval = perms.has('payment.cancel')` instead of role-label check.

### 2–5. Scanner settings, test screen, quick-add (§2–5)
- `capacitor-shell/screens/settings/ScannerSettingsScreen.tsx` — new: enable/type/suffix/debounce/min-max/sound/vibrate/allow-in-register/allow-in-search; persisted to `localStorage` under device-scoped key `seza.device.scanner.v1`.
- `capacitor-shell/screens/settings/TestScannerScreen.tsx` — new: keyboard-wedge listener with debounce + suffix handling; uses existing product lookup via Supabase (`products` table by barcode) scoped by store; never mutates cart.
- `capacitor-shell/screens/settings/QuickAddProductDialog.tsx` — new: gated by `products.manage`/existing product-create permission; uses existing insert path.
- `capacitor-shell/lib/scannerConfig.ts` — new: typed getters/setters and duplicate-scan guard.

### 6–8. Printer configuration (§6–8)
- `capacitor-shell/screens/settings/PrinterSettingsScreen.tsx` — full config UI: active driver, paper width (58/80), auto-print, copies, logo, kick-drawer-via-printer, last success/error timestamps. Reuses `src/lib/hardware/index.ts` drivers; only exposes drivers whose `capable()` returns true.
- Persist under `seza.device.printer.v1`.
- Test Print uses existing `buildReceipt` sample payload.

### 9. Cash drawer (§9)
- `capacitor-shell/screens/settings/CashDrawerSettingsScreen.tsx` — enable, linked printer status, open-after-cash-sale/refund/paidout/safedrop, test open (requires configured printer). Uses `getActivePrinter().kickDrawer()`.

### 10. Payment terminal (§10)
- `capacitor-shell/screens/settings/TerminalSettingsScreen.tsx` — choose driver, compatibility check (NFC/native), backend readiness check via existing `/api/public/pos/stripe-terminal/connection-token` HEAD/GET; real discover/connect via existing `terminal-stripe.ts`; no fake success.

### 11. Hardware status (§11)
- Extend existing `SettingsScreen.tsx` hardware panel with fields listed; wire "Open each configuration screen" links.

### 12. Email receipts (§12)
- `capacitor-shell/lib/emailReceipt.ts` — new: posts to existing `/lovable/email/transactional/send` with template `receipt` (already registered). Requires online + finalized sale id + receipt number. Blocked for offline/unsynced sales.
- `src/components/pos/ReceiptDialog.tsx` — APK: add email field (native-only branch) + Send button with success/error/duplicate-guard states. Web behavior unchanged.

### 13. Shift summary print (§13)
- `capacitor-shell/lib/shiftSummaryReceipt.ts` — new: builds ESC/POS bytes for 58/80mm from existing shift-summary data (`src/lib/shift-summary.ts`).
- Wire "Print" in existing `ShiftSummaryReport.tsx` behind `isNativeMode()` to call this; web still uses browser print.

### 14. Shift summary PDF (§14)
- `capacitor-shell/lib/shiftSummaryPdf.ts` — new: uses `jspdf` (add dep) to produce real PDF bytes; Capacitor Filesystem + Share for Save/Share; safe filename.
- Wire "PDF" button in `ShiftSummaryReport.tsx` behind `isNativeMode()`.

### 15–19. Permissions/device-scope/support diagnostics/lifecycle/safe errors
- Reuse existing `usePermissions`, existing `activityState`/back-button coordinator, existing diagnostics module (`capacitor-shell/support/diagnostics.ts`) — extend with hardware snapshot fields already partially present; scrub any secrets.
- All error strings from the spec's safe-error list.

### 20. Validation
- Run `bun run build` (SSR) + `bunx vite build --config vite.capacitor.config.ts` (APK bundle) + `bunx tsgo --noEmit` on changed files.
- No physical device testing (not available in sandbox); will state so in the report.

### Explicitly deferred (spec allows, out of P3-in-one-turn realism)
- Advanced multi-printer per-register selection UI beyond one active printer.
- Real BBPOS reader discovery beyond the existing `terminal-stripe.ts` — will surface whatever that module supports; not writing a new SDK integration.
- Auth for `has_permission('payment.cancel')` DB check — will use client `usePermissions` which already reads role_permissions; no new server-side RPC.

## Confirmation
This is still the largest single P-turn so far. Confirm and I execute. If you want to trim (e.g. skip PDF or terminal setup), say which.