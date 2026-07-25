# Repository Cleanup Instructions

Run the included cleanup script from PowerShell after copying the patch files into the project:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup-project.ps1 -ProjectPath 'F:\pos-sezapos'
```

The script removes only verified disposable artifacts:

- `.eslintcache`
- `*.bak`, `*.backup`, `*.orig`, and editor `*~` files
- nested `SEZA-POS-v*-PRODUCTION-PATCH` project copies
- stale generated build folders such as `android-webdir`, `dist`, and Android Gradle build output
- old one-time patch/recovery documents listed in the script

It does not remove `.env`, source files, migrations, Android resources, or Git history.

After cleanup:

```powershell
cd F:\pos-sezapos
npm ci
npm run verify:production
npm run typecheck
npm run lint
npm test
npm run build
npm run android:sync
```

The new public API rate-limit migration must be applied to Lovable Cloud before relying on cross-instance protection:

```text
supabase/migrations/20260725043000_public_api_rate_limits.sql
```

The source includes a process-local fallback so a temporary database error does not lock every cashier out, but the database migration is the real shared limiter.
