# SEZA POS project map

SEZA stays split by responsibility. Do not combine the whole frontend or backend into one giant file.

| Area | Main location |
|---|---|
| Public marketing website | `src/routes/index.tsx`, `src/components/marketing/` |
| Owner dashboard | `src/routes/_dashboard/` |
| Owner inventory | `src/routes/_dashboard/inventory.tsx`, `src/components/inventory/` |
| Browser POS | `src/routes/_pos/`, `src/components/pos/` |
| Platform admin | `src/routes/_adminApp/`, `src/lib/admin/` |
| Support cases | `src/routes/_adminApp/admin.support*`, `src/components/support/` |
| Login and signup security | `src/lib/auth/`, `src/features/auth/` |
| API rate limits | `src/lib/security/` |
| Public HTTP endpoints | `src/routes/api/public/` |
| Lovable email/SMS handlers | `src/routes/lovable/`, `src/routes/email/` |
| Database schema and policies | `supabase/migrations/` |
| Android application shell | `capacitor-shell/` |
| Native Android project | `android/` |
| Shared Supabase clients/types | `src/integrations/supabase/` |

## Where to start when something breaks

- White screen in APK: `capacitor-shell/main.tsx`, `capacitor-shell/supabase.ts`, `vite.capacitor.config.ts`
- Barcode inventory lookup: `src/routes/_dashboard/inventory.tsx`
- Item edit/delete menu: inventory route/components
- Owner login/signup: `src/routes/auth.tsx`, `src/routes/signup.tsx`, `src/lib/auth/auth.functions.ts`
- Admin login: `src/routes/admin.auth.tsx`, `src/lib/auth/auth.functions.ts`
- Request spam or HTTP 429: `src/lib/security/rate-limit.server.ts`, `src/lib/security/api-security.server.ts`
- Wrong business data visible: database RLS migration/policy for that table
- Duplicate sale: sale idempotency/finalization migration and POS sync code
- Admin case claim/close/reply: admin support routes and `src/lib/admin/`

## Rules for new code

1. Route files render pages or receive HTTP requests.
2. Business/database operations belong in the matching `src/lib/<feature>/` module.
3. Shared UI belongs in `src/components/`; feature-only UI stays in its feature folder.
4. Secret keys never go in `src/`, `public/`, `capacitor-shell/`, or `VITE_*` variables.
5. Every new public write endpoint must use a durable rate limit and input validation.
6. Every new table must enable RLS before the migration is complete.
