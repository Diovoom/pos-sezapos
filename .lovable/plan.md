# Production-Ready Overhaul — Phased Plan

This is a large, multi-phase effort. Some pieces are already done and will be preserved, not rebuilt. I'll ship in reviewable phases so you can approve each before the next.

## What's already in place (keep, don't rebuild)

- Public/private split via `MarketingShell` + `_authenticated` layout
- Marketing routes: Home, Features, Hardware, Pricing, Contact, Support
- Auth flow (signup → email verify → `/select-plan` → Paddle checkout with card-on-file trial → `/dashboard`)
- POS sidebar (`AppShell`) with Billing shortcut
- Billing tab inside Settings (plan, upgrade, cancel, Paddle customer portal)
- Legal Center at `/legal` with 14 documents, sticky TOC, search, print/PDF
- Auto-redirect signed-in users from `/` to `/dashboard`

## What this plan adds/changes

---

### Phase 1 — Marketing site completion (public)

**New routes**
- `/industries` — sections for Convenience, Liquor, Specialty Retail, Grocery, Cafe/QSR, Smoke shops (feature bullets per vertical; no fake logos)
- `/integrations` — categorized grid (Payments, SMS, Accounting, E-commerce, Hardware) with clearly-marked "Available" vs "Roadmap" tags
- `/security` — public-facing security overview (encryption, RLS, backups, incident response) — deep-links into Legal Center
- `/about` — Story, Mission, Vision, Why we built this, Values, Security commitment, Reliability commitment, Roadmap. No invented founders/awards/customer counts; company info uses `[Company Name]`, `[Founded Year]`, `[Business Address]` placeholders from `LEGAL_CONFIG`
- `/faq` — grouped accordion (Getting started, Billing, Hardware, Security, Data)
- `/blog` — clean empty-state "Coming soon — sign up for updates" (no fake posts)
- `/careers` — "We're not hiring yet — reach out at [email]" placeholder page

**Existing marketing pages — audit & polish**
- Rewrite Home hero + sections to remove any demo stats/testimonials/fake logos and match the enterprise tone
- Rewrite Features, Hardware, Pricing, Contact, Support for consistent copy, real product features only

**MarketingShell**
- Expand nav: Features · Industries · Pricing · Hardware · Integrations · Company (dropdown: About, Security, Blog, Careers, Contact) · Support
- Full footer with all requested sections (Product, Company, Trust, Legal, Support, Social placeholders)

---

### Phase 2 — POS sidebar & feature scaffolding

**Sidebar expansion in `AppShell`**
Add missing entries and route stubs where they don't exist yet:
- Sales, Inventory, Products, Customers, Employees (existing — keep)
- Suppliers, Purchase Orders, Reports, Analytics, Register, Help (new routes if missing)
- Group into sections (Operate / Manage / Insights / Account) for scannability
- Logout at the bottom, calls the full sign-out hygiene sequence (cancel queries → clear cache → signOut → replace-navigate to `/auth`)

**Feature audit — placeholder replacement, not rewrite**
- Sweep all POS routes and components for lorem ipsum, TODO comments, `example.com`, `John Doe`, and mock arrays; replace with empty-states + real copy
- Ensure Reports/Analytics/Suppliers/Purchase Orders routes exist even if the feature is minimal — each shows a proper empty state with "Coming in an upcoming release" rather than a blank/broken page

I will **not** build brand-new POS features (Gift Cards, Apple/Google Pay, offline mode redesign, camera scanning rewrites) in this pass — those are individually large. I'll flag which of the listed POS features already work vs. need dedicated follow-up work, and mark the not-yet-built ones with clean coming-soon placeholders in the UI.

---

### Phase 3 — Trust Center & Support Center

**Trust Center** at `/trust`
- Landing hub linking to: Security, Compliance, System Status, Privacy, Legal Center, Incident Response, Encryption, Backups, Responsible Disclosure
- Reuses Legal Center content — Trust Center is a curated presentation, not duplicated docs
- System Status shows a static "Operational" badge + link to a future status page (clearly labeled placeholder)

**Support Center** at `/help` (public) and `/dashboard/help` (in-app)
- Knowledge Base: category grid → article stubs organized by topic (Getting started, Sales, Inventory, Employees, Payments, Hardware, Troubleshooting)
- Contact Support form (routes to `[Support Email]`)
- Video Tutorials — labeled placeholder
- Documentation — link to KB
- Release Notes — placeholder empty state
- System Status — link into Trust Center

---

### Phase 4 — Onboarding polish & Settings audit

**Onboarding flow refinement**
- After signup → email verify → `/select-plan` → checkout → success
- Post-checkout: land on `/onboarding` (new) that walks Owner through: business info → tax settings → receipt settings → first employee (optional) → Dashboard
- This makes the "create workspace + first store" step explicit instead of implicit

**Settings audit**
- Verify sections exist: Store Profile, Business Info, Tax, Receipts, SMS, Email, Payments, Employees, Roles/Permissions, Security, Notifications, Integrations, Backups, API Keys (labeled "Coming soon"), Billing
- Fill any missing tab with a proper empty/coming-soon state

---

### Phase 5 — Global UI/polish pass

- Notification center in POS topbar (bell icon → dropdown, backed by an existing signal like low stock alerts)
- Global loading skeletons for slow POS pages (Products, Reports)
- 404 + generic error components refreshed to match design
- Consistent empty states component reused across POS
- Dark/light already supported — verify parity on new pages
- Sitemap.xml update to include new public routes

---

## Technical Details

- All new pages use `MarketingShell` (public) or `AppShell` (POS)
- All placeholder company info comes from `src/lib/legal/config.ts` (`LEGAL_CONFIG`) — single source of truth
- New public routes each get proper `head()` metadata (title, description, og:*), per TanStack routing rules
- No new database schema in this plan; POS feature stubs use existing tables where applicable
- No new server functions unless required for a specific page
- Signed-in redirect from `/` to `/dashboard` already works; will extend to `/pricing`, `/features` etc? **See question below.**

## Explicit non-goals for this plan

- Not implementing new payment methods (Apple Pay, Google Pay, split payments) — those need dedicated design + Paddle/Stripe work
- Not implementing offline mode from scratch
- Not building a real status page (labeled placeholder linking out)
- Not rewriting the checkout/POS transaction engine
- Not writing real blog posts, real KB articles, or real release notes (structure + empty states only)

## Questions before I start

1. **Signed-in visitors on marketing pages**: currently only `/` redirects them to `/dashboard`. Should visiting `/features`, `/pricing`, `/about`, etc. while signed in also auto-redirect to `/dashboard`, or should signed-in users be allowed to browse marketing content (with a "Back to Dashboard" button)?
2. **Phase order**: OK to execute Phase 1 → 2 → 3 → 4 → 5 in that order across multiple turns, or do you want a different sequence (e.g. sidebar/POS first)?
3. **Any of the "Explicit non-goals" you want moved into scope**? (Each of those is a full separate build.)
