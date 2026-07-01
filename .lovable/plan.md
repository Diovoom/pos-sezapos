## Global POS Platform — Phased Architecture Plan

This is a large architectural shift. Rather than one mega-change, I'll break it into safe, shippable phases that layer onto the existing POS without breaking the current single-country flow. Each phase is independently testable.

---

### Phase G1 — Country Profiles & Localization Foundation
**Goal:** Every store has a country profile that drives currency, formats, and defaults.

- New table `country_profiles` (seeded): country_code, default_language, currency, currency_symbol, decimal_precision, thousands_sep, decimal_sep, date_format, time_format, address_format (JSONB), phone_format, postal_regex, paper_size, default_tax_rate, tax_inclusive_default, receipt_format (JSONB), age_defaults (JSONB), business_reg_fields (JSONB).
- Extend `stores`: `country_code`, `region_code`, `time_zone` (already exists), `locale`, `paper_size`, `address_format_override`, `phone_format_override`.
- Extend `profiles`: `preferred_language`, `preferred_locale`.
- New `src/lib/i18n/formatters.ts`: `formatCurrency`, `formatDate`, `formatTime`, `formatNumber`, `formatPhone`, `formatAddress` — all driven by store/user locale, replacing the current hard-coded `en-US`/`USD` in `src/lib/format.ts`.
- Update Setup Wizard: add Country + Region + Time Zone step at position 2; auto-populate downstream defaults from the country profile.
- Seed ~30 country profiles (US, CA, GB, HT, MX, BR, FR, DE, ES, IT, NL, PL, RO, TR, GR, RU, UA, SA, IL, IN, CN, TW, JP, KR, TH, VN, ID, MY, AU, PT).

---

### Phase G2 — Multi-Language (i18n) Runtime
**Goal:** Dynamic language switching, RTL support, language-pack architecture.

- Add `i18next` + `react-i18next` + `i18next-browser-languagedetector`.
- Locale files under `src/locales/{lang}/common.json` — start with `en-US`, `es`, `fr`, `ht`, `pt-BR`, `ar`, `he`. Others as stub packs to be filled progressively.
- `<html dir>` toggled by RTL languages; Tailwind `rtl:` variants where needed.
- Language selector in top-bar and Settings > General; persists to `profiles.preferred_language`.
- Migrate visible strings in AppShell, POS checkout, Receipt, SetupWizard, Settings — remaining screens tracked as follow-up.
- "Language packs" = additional JSON files loadable at runtime from Supabase Storage bucket `language-packs` (no code change to add a language).

---

### Phase G3 — Tax Engine
**Goal:** Replace single `store.tax_rate` with a rule-based engine.

- New tables:
  - `tax_rates` (store_id, code, name, rate, region_code, inclusive, active)
  - `tax_rules` (store_id, tax_rate_id, applies_to: 'all'|'category'|'product', target_id, priority, start_date, end_date)
  - `tax_exemptions` (store_id, customer_id/reason, tax_rate_id)
  - `tax_holidays` (store_id, name, start, end, scope JSONB)
- `src/lib/tax/engine.ts`: pure function `computeTaxes(cart, context) → { lines, breakdown, total }`. Supports inclusive/exclusive, multiple stacked rates (e.g. GST+PST), category/product overrides, exemptions, holidays.
- Products: `tax_class_id` FK replaces boolean `taxable` (keep `taxable` as a computed fallback for backward compat).
- Settings > Taxes: CRUD UI for rates, rules, exemptions, holidays.
- Checkout tax breakdown line-item shown on receipt.

---

### Phase G4 — Currency Engine
**Goal:** Store transacts in its base currency; formatters + optional FX for display.

- New table `currencies` (code, symbol, decimal_precision, thousands_sep, decimal_sep, symbol_position). Seed common set.
- `stores.currency_code` references `currencies.code`; remove hard-coded `"USD"` defaults from formatters.
- Optional `exchange_rates` table for future multi-currency display (schema only, no UI yet).
- All `fmtCurrency` call sites (POS, receipts, reports, dashboard) route through `formatCurrency(value, storeCurrency)`.

---

### Phase G5 — Regional Age Verification
**Goal:** Age rules per country/region/category, no hardcoded ages.

- New table `age_rules` (store_id, country_code, region_code, category, min_age, id_types_accepted TEXT[], require_scan, require_manager_override, active).
- Migrate existing `age_verification_settings` (localStorage → DB) with per-store persistence.
- Country profile seeds default rules (US alcohol=21, EU alcohol=18, etc.); owner can override.
- `src/lib/age-verification.ts` reads rules from DB rather than a static settings object.
- Settings > Age Verification updated to region-aware CRUD.

---

### Phase G6 — Payment Provider Framework
**Goal:** Generic `PaymentProvider` interface; concrete adapters are plugins.

- `src/lib/payments/provider.ts`: interface
  ```ts
  interface PaymentProvider {
    id: string; name: string; countries: string[]; methods: PaymentMethod[];
    charge(input): Promise<PaymentResult>;
    refund(input): Promise<RefundResult>;
    capabilities: { tap?: boolean; wallet?: boolean; installments?: boolean };
  }
  ```
- `src/lib/payments/registry.ts`: runtime registry; providers register themselves.
- Refactor `PaymentDialog` to call `registry.get(activeProviderId).charge(...)` instead of the current inline logic.
- Ship built-in `manual` provider (mirrors current behavior) + stub adapters for Stripe, Square, Adyen, SumUp, Moneris, Mercado Pago (metadata + `throw NotImplemented` where credentials aren't wired).
- New table `payment_provider_configs` (store_id, provider_id, credentials JSONB — encrypted-at-rest via Supabase, active).
- Settings > Payments lists providers filtered by store country.

---

### Phase G7 — Plugin Marketplace Scaffolding
**Goal:** Formalize the extension model without shipping a full marketplace UI.

- New tables:
  - `plugins` (id, name, category, version, entry_point, countries, industries, description, publisher)
  - `installed_plugins` (store_id, plugin_id, config JSONB, enabled, installed_at)
- Categories: payment, tax, accounting, loyalty, delivery, ecommerce, ai, compliance, reporting, hardware, industry.
- Client-side plugin registry (`src/lib/plugins/registry.ts`) with lifecycle hooks: `onCheckout`, `onSaleComplete`, `onRefund`, `beforeReceiptRender`, `menuItems`, `settingsPanels`.
- Bundle payment providers, tax modules, and hardware drivers as first-party plugins in this registry.
- Settings > Plugins page listing available + installed. Marketplace UI itself is out of scope for this phase — install/enable is manual toggle.

---

### Phase G8 — Compliance Packages (thin layer)
**Goal:** Country-specific business rules bundled as compliance plugins.

- `CompliancePackage` = plugin with metadata declaring: receipt requirements, business-registration fields on setup, tax reporting exports, privacy notices.
- Ship stubs for: US (state sales tax), EU (VAT + GDPR notice + fiscal receipt), CA (GST/HST/QST), BR (NFC-e placeholder), MX (CFDI placeholder). Real fiscal integrations documented as future work.

---

### Phase G9 — Cloud & Multi-Store
**Goal:** Enable multi-store owners; realtime sync; backups.

- `stores` already exists; add `organization_id` grouping. New `organizations` table.
- `user_roles.store_id` already scopes access; add org-level roles (`org_owner`, `org_manager`).
- Store switcher in top-bar for multi-store users.
- Supabase Realtime channels for sales/inventory across devices in a store (already partially in place).
- Automatic backups: rely on Supabase PITR (documented, not code). Add `backup_exports` cron edge function to snapshot key tables to Storage weekly.
- Data encryption at rest: Supabase default; document key rotation.

---

### Phase G10 — Industry Modules (future skeleton)
**Goal:** Same core, industry-specific feature flags.

- `stores.industry` enum: retail, convenience, grocery, liquor, restaurant, cafe, pharmacy, apparel, electronics, hardware, beauty, wholesale, service.
- Plugin registry filters `menuItems` and `settingsPanels` by industry.
- Setup Wizard asks industry → recommends plugin bundle.
- No industry-specific UI shipped in this pass; the scaffolding is the deliverable.

---

## Delivery Order

I recommend shipping in this order, one phase per turn so you can review:

```text
G1 Country Profiles + Localization foundation
G2 i18n runtime + first 6 languages
G4 Currency engine   ← small, unblocks receipts globally
G3 Tax engine
G5 Regional age rules
G6 Payment provider framework
G7 Plugin scaffolding
G8 Compliance packages
G9 Multi-store / org
G10 Industry modules
```

G4 is intentionally ahead of G3 because currency is a smaller, lower-risk change that immediately makes non-USD stores usable.

## Technical Notes

- All new tables get `GRANT` + RLS scoped to `store_id` via existing `has_role` pattern.
- Country/currency/language reference data seeded via migration (not user-editable).
- `src/lib/format.ts` becomes a thin re-export of the new locale-aware formatters to avoid mass rewrites in one go; call sites migrate opportunistically.
- No breaking changes to existing single-store US deployments — every new column has a safe default derived from a `US` country profile.
- Each phase includes: migration → types regen → UI wiring → docs entry in `AGENTS.md`.

## What I Need From You

1. **Approve the phased approach**, or tell me to collapse phases.
2. **Confirm Phase G1 is next** (Country Profiles + Localization foundation) — or pick a different starting phase.
3. Any countries/languages beyond the list above that are must-haves for your first launch?
