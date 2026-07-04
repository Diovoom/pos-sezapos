# Subdomain-aware multi-app routing

Your three custom domains (`sezapos.com`, `dashboard.sezapos.com`, `pos.sezapos.com`) all serve this same project today. This plan makes each subdomain behave like its own dedicated app — clean URLs, isolated navigation, cross-subdomain sign-in, and per-host SEO.

## What each subdomain will serve

| Subdomain | Purpose | Routes exposed |
|---|---|---|
| `sezapos.com` | Marketing website | `/`, `/features`, `/pricing`, `/about`, `/contact`, `/support`, `/status`, `/legal/*`, `/auth`, `/signup` |
| `dashboard.sezapos.com` | Merchant Dashboard | `/` → dashboard home, `/products`, `/inventory`, `/reports`, … (all `_dashboard` routes), plus `/auth` |
| `pos.sezapos.com` | POS Register | `/` → sell screen, `/register`, `/refunds`, `/timeclock`, `/shift`, plus `/auth` |

## Clean URLs (chosen)

The internal file tree stays as `src/routes/_dashboard/*` and `src/routes/_pos/*`. A tiny host-aware layer rewrites the URL bar so:

- `dashboard.sezapos.com/products` → renders `_dashboard/products`
- `pos.sezapos.com/sell` → renders `_pos/pos`
- `sezapos.com/` → renders marketing home

Implementation: a middleware on the server side (`src/start.ts` request middleware) that inspects `Host` and rewrites the incoming pathname before TanStack Router matches. On the client, a small `Link` wrapper and `useNavigate` helper strip/add the prefix based on `window.location.host`.

## Cross-subdomain behavior

- **Cashier hits `dashboard.sezapos.com`** → redirect to `https://pos.sezapos.com/` (as requested).
- **Owner/manager hits `pos.sezapos.com`** → allowed; a "Switch to Dashboard" link points to `https://dashboard.sezapos.com/`.
- **Anyone hits `sezapos.com/dashboard` or `/pos`** → 302 to the correct subdomain.
- **Unauth on dashboard/pos subdomain** → send to `/auth` on the same subdomain; after login, redirect by role (owner/manager stays, cashier is bounced to POS host).

## Shared sign-in across subdomains

Currently Supabase persists the session in `localStorage`, which is per-origin — signing in on `sezapos.com` doesn't sign you in on `dashboard.sezapos.com`.

Fix: switch the Supabase client to cookie-based storage scoped to `.sezapos.com` (parent domain). One session, all three subdomains. `localhost` preview continues to work because we set the cookie domain only when the host ends in `sezapos.com`.

## Per-subdomain SEO & metadata

- Root `head()` sets a generic title only; each subdomain's landing route defines its own title, description, canonical, and og tags.
- `dashboard.*` and `pos.*` get `<meta name="robots" content="noindex, nofollow">` on every route so only the marketing site is indexed.
- `robots.txt` and `sitemap.xml` become host-aware server routes: on `sezapos.com` they list marketing URLs; on `dashboard.*`/`pos.*` they disallow all crawling.
- Canonical URLs always point to the marketing host for shared pages (e.g. `/auth` canonical is `https://sezapos.com/auth`).

## Shell adjustments

- **MarketingShell**: "Open Dashboard" / "Open POS" buttons link to the absolute subdomain URLs.
- **DashboardShell**: internal nav uses relative paths (no `/dashboard` prefix visible). "Open POS" button → `https://pos.sezapos.com/`.
- **PosShell**: internal nav relative. "Switch to Dashboard" → `https://dashboard.sezapos.com/` (owner/manager only).

## Files touched (new/edit)

New:
- `src/lib/host.ts` — `getAppFromHost(host)` → `"marketing" | "dashboard" | "pos" | "unknown"`, plus URL builders (`dashboardUrl(path)`, `posUrl(path)`, `marketingUrl(path)`).
- `src/lib/subdomain-router.ts` — client-side `AppLink` and `useAppNavigate` that translate clean paths to internal `_dashboard/_pos` paths.
- Request middleware in `src/start.ts` — rewrites `request.url` pathname based on `Host` before SSR routing.
- Host-aware `src/routes/robots[.]txt.ts`.

Edit:
- `src/integrations/supabase/client.ts` — cookie storage on `.sezapos.com` (only auto-generated file we'd touch; if off-limits, we'll add a wrapping session bridge instead — see Technical notes).
- `src/routes/_dashboard/route.tsx` + `src/routes/_pos/route.tsx` — add host guard (`beforeLoad`) that 302s wrong-subdomain hits, and set `noindex` head.
- `src/routes/__root.tsx` — read host at SSR, expose via router context so components can render subdomain-correct links.
- `src/routes/auth.tsx` — post-login redirect uses absolute subdomain URLs.
- `src/components/marketing/MarketingShell.tsx`, `src/components/pos/AppShell.tsx`, `src/components/pos/PosShell.tsx` — subdomain-aware nav links.
- `src/routes/sitemap[.]xml.ts` — host-aware output.

## Technical notes

- **SSR host detection**: read `Host` header in a request middleware; stash on request-scoped context (via `AsyncLocalStorage` from `@tanstack/react-start/server`) so route `head()` and components can read it during SSR.
- **Client host detection**: `window.location.host` in a small hook; falls back to SSR-provided value during hydration to avoid mismatch.
- **Supabase client is auto-generated** and off-limits to edit. Workaround: after `createClient(...)`, in a project-owned module (`src/integrations/supabase/session-bridge.ts`) install a cookie sync — write the session to a `.sezapos.com` cookie on `SIGNED_IN`, restore on load if `localStorage` is empty but the cookie exists. This gives cross-subdomain SSO without touching the generated file.
- **Preview & localhost unaffected**: all host logic no-ops when host isn't `*.sezapos.com`, so `id-preview--*.lovable.app` keeps serving the whole app at path prefixes.
- **No DNS or hosting changes needed** — all three domains already point at this project.

## Out of scope

- Splitting into three separate Lovable projects.
- Real DNS/registrar work.
- Changing the POS PIN flow, roles table, or any DB schema.
- New features inside dashboard or POS.

## Verification

After build passes, click through:
1. `sezapos.com/` shows marketing; nav has no dashboard/POS internals.
2. `dashboard.sezapos.com/` (signed in as owner) shows dashboard home at path `/`, not `/dashboard`.
3. `pos.sezapos.com/` (signed in as cashier) shows PIN → sell.
4. Sign in on marketing, then hit `dashboard.sezapos.com` — no re-login.
5. Cashier hitting `dashboard.sezapos.com` gets bounced to `pos.sezapos.com`.

Approve to build.