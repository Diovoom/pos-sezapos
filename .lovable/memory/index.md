# Project Memory

## Core
Merchant subscription billing = seamless SEZA-managed Stripe (`enable_stripe_payments`). Do NOT propose Paddle or bring-your-own-key Stripe (`enable_stripe`) as alternatives.
Stripe price IDs: `starter_monthly` ($29), `pro_monthly` ($59), `business_monthly` ($89). Plan tier is derived from `subscriptions.price_id` via `public.plan_tier_for_price`, never from `product_id` (which differs sandbox vs live).
Trial-expired stores flip to read-only and are pushed to `/select-plan` / Settings > Billing to subscribe. Do not extend trials automatically or unlock read-only writes.
In-store card payments (Stripe Terminal) are scaffolded only — server fns exist at `src/lib/pos/stripe-terminal.functions.ts`, POS UI keeps card tender blocked with a "coming soon" state until a real reader is paired.

## Memories
- [Security posture](mem://security-notes) — see @security-memory for tenant isolation + accepted risks (has_any_role, current_store_id).
