# SEZA POS billing — full implementation plan

## What exists today
- Paddle tokens + webhook secrets registered.
- **Nothing else**: no `subscriptions` table, no Paddle catalog products, no webhook route, no checkout, no pricing page, no gating. Any signup = free unlimited POS.

## What I'll build

### 1. Paddle catalog (test env, syncs to live on publish)
Create 3 monthly products via `batch_create_product`:
- `starter_plan` → `starter_monthly` — $29/mo
- `pro_plan` → `pro_monthly` — $59/mo (most popular)
- `business_plan` → `business_monthly` — $89/mo

### 2. Database (single migration)
- `subscriptions` table (per `paddle-database` spec) — one row per Paddle subscription, keyed by `paddle_subscription_id`, includes `environment`, `trial_ends_at`.
- Add `trial_ends_at timestamptz` + `plan_tier text` columns to `stores` (denormalized for fast gate checks). Trigger keeps them in sync from the newest active `subscriptions` row.
- `handle_new_user` trigger update: first user of a new store gets `trial_ends_at = now() + interval '7 days'`, `plan_tier = 'trial_pro'` (full Pro-level access during trial).
- `has_active_plan(store_id, min_tier)` SQL helper → returns bool. Tier order: `starter < pro < business`. Trial counts as `pro`.
- `is_read_only(store_id)` SQL helper → true when trial ended AND no active/grace subscription.
- RLS + grants per template.

### 3. Server code
- `src/lib/paddle.server.ts` — canonical shared util (`getPaddleClient`, `verifyWebhook`, `gatewayFetch`, `getPaddleEnvironment`).
- `src/lib/paddle.ts` — client SDK loader + env detection.
- `src/utils/payments.functions.ts` — `resolvePaddlePrice`, `createPortalSession`, `getMySubscription` (server fns).
- `src/routes/api/public/payments/webhook.ts` — handles `subscription.created/updated/canceled`, upserts by `paddle_subscription_id`, writes `environment`, links via `customData.userId → stores.id`.

### 4. Frontend
- `src/components/PaymentTestModeBanner.tsx` — mount in `__root.tsx`.
- `src/routes/pricing.tsx` — public 3-tier comparison table, Pro highlighted, "Start Free Trial" / "Choose Plan" CTAs.
- `src/hooks/useSubscription.ts` — reads store's `plan_tier`, `trial_ends_at`, active sub row (filtered by env).
- `src/hooks/usePlanGate.ts` — `canAccess(feature)` + `isReadOnly()`.
- `src/components/UpgradeModal.tsx` — shown when locked feature is attempted.
- `src/components/TrialCountdown.tsx` — dashboard banner.
- `src/components/settings/BillingPanel.tsx` — current plan, change plan, cancel, invoice history (via Paddle portal), read-only badge.
- Add "Billing" section to Settings (`settings.tsx` SECTIONS array).

### 5. Enforcement
- `_authenticated/route.tsx` client-only check: if `is_read_only` AND user tries a mutating route (`pos`, `products` write, `refunds`, `register`, `timeclock`), redirect to `settings#billing` with toast. Read routes (`dashboard`, `sales`, `reports`) stay open.
- Plan-tier gates on features per your spec:
  - Multiple registers, roles/permissions edit, refunds, shift tracking → Pro+
  - Unlimited employees/registers, audit log, multi-store, API → Business
  - Employee count enforced on invite (block create if over plan cap).

### 6. Legal pages (public routes, required for Paddle go-live)
- `src/routes/terms.tsx` — Seller: **SEZA POS LLC**, Paddle MoR disclosure, misuse, IP, suspension.
- `src/routes/refund.tsx` — 30-day money-back, direct to paddle.net.
- `src/routes/privacy.tsx` — controller, data categories, Paddle as recipient, retention, rights.
- Footer links on pricing + auth pages.

### 7. Fixes to existing setup
- Rewrite `.env.development` / `.env.production` with proper newlines (single line today).
- Update `src/start.ts` if bearer middleware isn't attached (verify).

## How you'll test in the preview

1. **Test mode banner** appears at top of every page (orange). Confirms you're on the test token.
2. **Sign up** with a fresh email → you land on dashboard with a "7-day free trial — Pro features unlocked" countdown.
3. Open **Settings → Billing** → click "Change plan" → pick Pro → Paddle overlay opens.
4. Pay with test card **`4242 4242 4242 4242`**, CVC `123`, any future expiry, any name/ZIP.
5. Checkout closes → webhook fires → Billing panel refreshes to "Pro — active, renews on <date>".
6. **Cancel test**: Billing → "Cancel plan" → opens Paddle portal in new tab → confirm cancel. Row updates to `canceled`, `cancel_at_period_end=true`. You keep access until period end.
7. **Trial expiry test**: In Billing → "Simulate trial expiry" dev button (test env only) sets `trial_ends_at = now() - 1m`. POS / refunds routes now redirect to Billing with "Read-only mode" toast; Reports still opens.
8. **Failed payment test**: card `4000 0027 6000 3184`, then use Paddle dashboard's "fast-forward renewal" to see `past_due` banner in the app.
9. **Upgrade modal test**: While on Starter, try to open a 2nd register → modal appears with "Upgrade to Pro" CTA.

## Going live (after testing passes)
Publish the app → Paddle readiness check runs against your published legal pages → fill verification form in the Payments dashboard → Paddle approves → live checkout starts working. Products auto-sync to live on publish.

## Notes / assumptions
- All 3 plans are monthly-only per your spec (annual can come later).
- "Read-only mode" = mutating routes blocked; view-only routes stay open. Same effect as Starter downgrade for now (simpler UX than a hybrid).
- Plan **downgrade** applies at period end via Paddle's scheduled change; **upgrade** is prorated immediately.
- Multi-store, offline mode, plugin marketplace, API access = flagged in code as "Business+" but no implementation yet (your spec calls these "future-ready" — I'll gate the UI, not build the feature).
- Employee/register limits are enforced at create-time; existing rows above the cap are grandfathered (no destructive downgrade).
