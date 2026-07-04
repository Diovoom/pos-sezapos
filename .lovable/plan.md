
## Goal

One Lovable project, three clearly separated experiences behind role-based guards. Later you can point `dashboard.sezapos.com` and `pos.sezapos.com` at the same app via path rewrites — no code changes needed.

## Final URL layout

```text
/                          Marketing (existing MarketingShell)
/features /pricing /about /contact /support /status /legal/*   Marketing
/auth /signup /reset-password                                  Auth (public)

/dashboard/*               Merchant Dashboard (owner/manager only)
  dashboard, products, inventory, customers, employees,
  reports, sales, shifts, payroll, settings, setup, onboarding

/pos/*                     POS Register (cashier + manager + owner)
  sell (checkout), register (open/close), refunds,
  timeclock, shift
  Locked behind PIN unlock, not email/password.
```

## Role gates

- **Public**: everything under `/`, `/features`, `/pricing`, `/about`, `/contact`, `/support`, `/status`, `/legal/*`, `/auth`, `/signup`, `/reset-password`.
- **`/dashboard/*`** → requires session AND role in `{owner, admin, manager}`. Cashiers hitting it get redirected to `/pos`.
- **`/pos/*`** → requires session AND (role in `{owner, admin, manager, cashier}`) AND active PIN unlock in `sessionStorage`. No PIN → PIN screen.

Post-login redirect:
- owner/admin/manager → `/dashboard`
- cashier → `/pos` (PIN screen first)

## Shell changes

- **MarketingShell** — already good; add `/status` link in footer.
- **DashboardShell** (rename of current `AppShell`): sidebar shows business management only (Dashboard, Products, Inventory, Customers, Employees, Sales, Reports, Shifts, Payroll, Settings). Owner/manager gets a header button **"Open POS"** → `/pos`.
- **PosShell** (new): minimal top bar with Store name, current cashier, Clock in/out, and — for owner/manager only — **"Switch to Dashboard"** link. Left rail with just: Sell, Register, Refunds, Timeclock, Shift. No products/inventory/reports/settings.

## PIN unlock (cashiers)

- Reuse existing `src/lib/pin.server.ts` and `profiles.pin_hash` (already in schema based on employee flows).
- New server fn `verifyCashierPin({ employee_id, pin })` returns `{ userId, storeId, roles }` on success.
- POS PIN screen: employee_id + 4-6 digit PIN. On success store `{ userId, expiresAt }` in `sessionStorage` under `pos_unlock`. Auto-lock after 15 min idle or on tab close.
- Owners/managers already have a Supabase session; PIN screen offers "Unlock as manager" that just requires their PIN too, so the POS device has a consistent unlock model.

## File moves & new files

Move (rename URL from `/pos` in `_authenticated` → new `/pos` shell; keep dashboard routes but shift under `/dashboard/*`):

```text
NEW  src/routes/_dashboard/route.tsx        (owner/manager gate, DashboardShell)
NEW  src/routes/_dashboard/dashboard.tsx    (from _authenticated/dashboard.tsx)
NEW  src/routes/_dashboard/products.tsx     (moved)
NEW  src/routes/_dashboard/inventory.tsx    (moved)
NEW  src/routes/_dashboard/customers.tsx    (moved)
NEW  src/routes/_dashboard/employees.tsx    (moved)
NEW  src/routes/_dashboard/employees.$id.tsx(moved)
NEW  src/routes/_dashboard/sales.tsx        (moved — read-only history)
NEW  src/routes/_dashboard/reports.tsx      (moved)
NEW  src/routes/_dashboard/shifts.tsx       (moved)
NEW  src/routes/_dashboard/payroll.tsx      (moved)
NEW  src/routes/_dashboard/settings.tsx     (moved)
NEW  src/routes/_dashboard/setup.tsx        (moved)
NEW  src/routes/_dashboard/onboarding.tsx   (moved)

NEW  src/routes/pos/route.tsx               (session + PIN gate, PosShell)
NEW  src/routes/pos/index.tsx               (redirect → /pos/sell)
NEW  src/routes/pos/sell.tsx                (from _authenticated/pos.tsx)
NEW  src/routes/pos/register.tsx            (from _authenticated/register.tsx)
NEW  src/routes/pos/refunds.tsx             (moved)
NEW  src/routes/pos/timeclock.tsx           (moved)
NEW  src/routes/pos/shift.tsx               (cashier-facing shift summary)

NEW  src/routes/status.tsx                  (static "All systems operational")
NEW  src/components/dashboard/DashboardShell.tsx
NEW  src/components/pos/PosShell.tsx
NEW  src/components/pos/PinUnlock.tsx
NEW  src/lib/pos/pin-session.ts             (sessionStorage helpers)
NEW  src/lib/pos/pin.functions.ts           (verifyCashierPin server fn)

DELETE  src/routes/_authenticated/*         (whole folder)
```

The old `_authenticated` folder is retired entirely so there's only one gated shell per app. Existing `AppShell` becomes the dashboard shell; POS gets a purpose-built shell.

## Redirects for old URLs

`/dashboard` stays the same. Old paths that used to be `/pos`, `/register`, `/refunds`, `/timeclock`, `/products`, `/settings`, etc. get one-line route files at the old locations that `redirect()` to the new home so bookmarks and in-app links keep working. I'll grep the codebase for hardcoded old URLs (`to: "/pos"`, `to: "/products"`, …) and rewrite them to `/pos/sell`, `/dashboard/products`, etc. in the same pass.

## Post-login router

`/auth` submit handler and OAuth callback:
1. `getUser()` + fetch roles.
2. If roles ∩ {owner, admin, manager} → `navigate('/dashboard')`.
3. Else if `cashier` → `navigate('/pos')` (PIN screen renders).
4. Else → sign out with "no store access" message.

## Status page

`/status` static page: green "All systems operational" badge, four components (POS Register, Merchant Dashboard, Payments, Email/SMS) each with green dot, "Last checked" timestamp = build time. Note that this is a placeholder and real monitoring is coming.

## Out of scope (this turn)

- Real subdomain hosting (needs your DNS + Lovable custom-domain setup after the code lands).
- Real uptime monitoring.
- New POS features (Apple Pay, offline mode, camera scanning).
- Any DB schema changes — reuses existing `profiles.pin_hash`, `user_roles`, `stores`.

## Verification

After the moves I'll run `bun run build`-equivalent typecheck via the harness and click through `/`, `/auth`, `/dashboard`, `/pos` in the preview to confirm role gates and PIN unlock work.

---

This is a large refactor (~25 file moves + 6 new files + one grep-and-replace pass for internal links). I'll ship it in this next turn end-to-end, then we can iterate on POS UI polish. Approve to proceed.
