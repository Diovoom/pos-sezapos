## Scope

Turn the bundled Capacitor shell into a fully production-ready POS by reusing the existing web production code, DB schema, storage buckets (`avatars`, `product-images`), and settings surfaces. No parallel systems.

## 1. Business branding (foundation for everything else)

- Add columns to `public.stores`: `logo_url text`, `receipt_logo_url text` (single migration, no data changes).
- Reuse existing `product-images` bucket? No — logos are store-level. Create a new **public** storage bucket `store-branding` via `supabase--storage_create_bucket`, with RLS policies on `storage.objects`:
  - Public SELECT
  - INSERT/UPDATE/DELETE restricted to authenticated users whose `profiles.store_id` matches path prefix `<store_id>/...` AND has role owner/admin.
- Add a **Branding** section inside existing web Settings (`src/routes/_dashboard/settings.tsx`) — upload logo → writes to bucket → updates `stores.logo_url`. Do not create a separate settings system.
- Create `useStoreBranding()` hook returning `{ logoUrl, receiptLogoUrl }` with SEZA fallback via existing `resolveLogoUrl()`.

## 2. Employee profile photos

- Reuse existing `avatars` bucket (already exists, private). Add public read policy scoped to authenticated users of the same store, or switch to signed URLs on read.
- `profiles` already has fields; verify `avatar_url` column exists — if not, add it in the same migration.
- Extend existing employee edit dialog in `src/routes/_dashboard/employees.tsx` with photo upload.
- Update `AppShell.tsx` cashier avatar block: if `profile.avatar_url` → `<img>`, else initials (existing behavior).

## 3. Branded loading screen (shell)

Replace `NativeLoadingOverlay` / current post-login blank with a `BrandedBootScreen` in `capacitor-shell/screens/`:
- Fetches store + profile once
- Displays merchant logo (fallback SEZA), store name, "Loading POS…", spinner
- Runs sequential steps with live status text: Connecting → Syncing products → Loading register → Loading permissions → Ready
- Each step is a real query (products count, active register session, `useMe`) — no fake delays
- Auto-transitions to `/pos` when done

Wire into `capacitor-shell/main.tsx` so it shows between auth success and first POS render.

## 4. POS header logo

Update `src/components/pos/PosShell.tsx` header: show store logo (from `useStoreBranding`) next to business name; SEZA fallback.

## 5. Menu ☰ → Settings + Sign Out

In shell, the ☰ currently only signs out. Update to a dropdown with **Settings** (navigates to `/settings` route in shell) and **Sign Out**. Wire `/settings` shell route to the existing production `SettingsScreen` (already exists in `capacitor-shell/screens/SettingsScreen.tsx`) — extend it with the new Branding section that calls the same server endpoints.

## 6. Receipts + customer display

- Update ESC/POS receipt builder (`src/lib/hardware/escpos.ts`) to optionally include the receipt logo (bitmap header) when `receipt_logo_url` set.
- `src/components/pos/Receipt.tsx` renders store logo at top.
- Customer display (if present) reads same logo hook.

## 7. Remove placeholders in shell

Audit `capacitor-shell/` for `PlaceholderScreen` usage and any temp branding. Replace remaining pointer routes with real production pages already exported (Refunds, Timeclock, Shifts, Register are done). Confirm no `PlaceholderScreen` imports remain in `router.tsx`.

## 8. Fill remaining POS workflows

Everything on the request list is already implemented in the web codebase and mounted in the shell EXCEPT documented native limitations (Star/Epson vendor SDKs, iOS). Verify each route mounts a real page:
- Settings, Register, Shifts, Cash Management (Open/Close drawer dialogs), Receipts, Barcode Scanning (native ML Kit + browser fallback), Camera scanning (already), Offline Sync (existing IndexedDB), Device/Printer/Terminal (shell Settings tabs).
- For any that still route to `PlaceholderScreen`, wire to the production page.

## Technical

Files to add:
- `supabase/migrations/<ts>_branding.sql` — add columns + bucket policies (bucket via tool call).
- `src/hooks/useStoreBranding.ts`
- `capacitor-shell/screens/BrandedBootScreen.tsx`
- `src/components/settings/BrandingPanel.tsx`

Files to edit:
- `src/routes/_dashboard/settings.tsx` — mount BrandingPanel
- `src/routes/_dashboard/employees.tsx` — photo upload
- `src/components/pos/AppShell.tsx` — avatar photo, menu Settings entry
- `src/components/pos/PosShell.tsx` — header logo
- `src/components/pos/Receipt.tsx` — logo header
- `src/lib/hardware/escpos.ts` — optional bitmap header
- `capacitor-shell/main.tsx` — mount BrandedBootScreen after auth
- `capacitor-shell/router.tsx` — Settings route wired to existing SettingsScreen; remove any remaining placeholders
- `capacitor-shell/screens/SettingsScreen.tsx` — Branding tab

No new auth. No new roles. Reuses existing RLS. One migration. One new bucket.

## Verify

- `bun run build` (web) passes
- `bun run android:sync` passes
- Manual: web Settings → upload logo → POS header + boot screen show it
- Shell: PIN login → BrandedBootScreen shows live steps → POS opens with logo