## Goal
Make the custom domains behave like three separate websites instead of one app constantly redirecting between path prefixes:

```text
sezapos.com            -> marketing website only
dashboard.sezapos.com  -> dashboard website
pos.sezapos.com        -> POS website
```

## Plan

1. **Remove self-reloading redirects**
   - Fix the protected route guards so they never call `window.location.replace()` with the same current URL.
   - If a dashboard route is reached on `pos.sezapos.com`, send it to the POS home.
   - If a POS route is reached on `dashboard.sezapos.com`, send it to the dashboard home.

2. **Make `/` route domain-aware**
   - On `pos.sezapos.com/`, render/route directly to the POS register.
   - On `dashboard.sezapos.com/`, render/route directly to the dashboard.
   - On `sezapos.com/`, keep the marketing website.
   - Avoid bouncing through `/auth` unless the user is actually signed out.

3. **Keep clean user-facing URLs**
   - Keep public navigation on the marketing domain as normal marketing pages.
   - Keep POS users on `pos.sezapos.com`.
   - Keep dashboard users on `dashboard.sezapos.com`.
   - Avoid preserving incompatible paths across domains, because that is what can create loops like `pos.sezapos.com/dashboard -> pos.sezapos.com/dashboard`.

4. **Simplify auth redirects**
   - After PIN sign-in, go to POS.
   - After owner/manager email sign-in, go to Dashboard.
   - If already on the correct subdomain, use client-side navigation instead of a full page reload.

5. **Verify the loop is gone**
   - Check that `pos.sezapos.com/` lands once on POS and stops refreshing.
   - Check that `dashboard.sezapos.com/` lands once on Dashboard and stops refreshing.
   - Check that `sezapos.com/` remains the marketing website.
   - Check signed-out users land on sign-in once, not in a reload loop.