# SEZA POS security controls

## Included in code

- Server-side rate limits for login, signup, password reset, verification resend, PIN checks, public APIs, authenticated writes, admin operations, Stripe/checkout work, email, SMS and other expensive actions.
- Atomic Lovable Cloud database counters using hashed identifiers. Raw IP addresses and emails are not stored in the rate-limit table.
- Process-local fallback limits if the database migration is not available.
- Owner and platform-admin role verification on the server before a session is accepted by each portal.
- Generic authentication errors to reduce account enumeration.
- Request-origin and request-size checks on public routes.
- Browser and APK builds fail if a `sb_secret_...` key is accidentally supplied as a publishable key.
- React Query caching/retry defaults and slower dashboard polling to reduce repeated Cloud requests.
- Existing sale idempotency and RLS policies remain in place.

## Limits used

- Owner password login: 5 attempts per 15 minutes; 30-minute block.
- Admin password login: 3 attempts per 15 minutes; 60-minute block.
- Signup: 3 attempts per hour; 6-hour block.
- Password reset: 3 attempts per hour.
- Verification resend: 1 per minute and 5 per day.
- Public reads: normally 60 per minute.
- Public writes: normally 20 per minute.
- Authenticated writes: normally 60 per minute.
- Expensive actions: normally 10 per minute.
- Dangerous admin actions: 5 per minute.

Route-specific limits are defined beside each endpoint and may be lower.

## Lovable Cloud settings to verify manually

These settings do not require asking the Lovable AI agent to rewrite code:

1. Require email verification for merchant signup.
2. Configure CAPTCHA/Turnstile for production auth and set `VITE_TURNSTILE_SITE_KEY` for the website widget.
3. Keep service-role/secret keys only in server secrets.
4. Review Cloud usage and billing limits/alerts.
5. Apply the three new migrations in `supabase/migrations/` if they are not applied automatically during deployment.

## Expected behavior

A blocked request returns HTTP `429` with a `Retry-After` header. A request from an unapproved browser origin returns `403`. Oversized request bodies return `413`.
