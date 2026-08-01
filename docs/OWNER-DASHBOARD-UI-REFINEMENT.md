# Owner Dashboard UI Refinement

This update keeps SEZA's existing blue, white, and black palette while removing generic dashboard-template patterns.

## Included

- Compact inventory pulse instead of four oversized summary cards.
- Phone-first inventory rows with product, barcode/SKU, price, stock, and direct actions.
- Desktop table retained for dense operational work.
- Shape-matched skeleton loaders for inventory rows and table content.
- Longer in-memory query caching plus an allowlisted, user-scoped session cache for owner-dashboard data.
- Cache clears on sign-out and never mixes users.
- Floating glass-style mobile navigation with a non-blur fallback.
- Existing SEZA routes, data model, draft/publish behavior, and colors remain unchanged.

## Scope

Owner dashboard website only. No Android POS or platform-admin screen was intentionally redesigned.
