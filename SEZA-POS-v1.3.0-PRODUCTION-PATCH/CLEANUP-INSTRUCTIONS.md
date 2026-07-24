# Repository Cleanup Instructions

## Remove the nested project copy

The uploaded archive contained a complete second project at:

```text
F:\pos-sezapos\pos-sezapos-main
```

After confirming `F:\pos-sezapos\package.json`, `src`, and `android` are the working outer project, remove only the nested copy:

```powershell
Remove-Item 'F:\pos-sezapos\pos-sezapos-main' -Recurse -Force
```

## Remove stale generated output before rebuilding

```powershell
Remove-Item 'F:\pos-sezapos\dist' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'F:\pos-sezapos\android-webdir' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'F:\pos-sezapos\android\app\build' -Recurse -Force -ErrorAction SilentlyContinue
```

## Review backup files

List them first:

```powershell
Get-ChildItem 'F:\pos-sezapos' -Recurse -File -Include '*.bak','*.backup','*.tmp','*~'
```

After confirming they are obsolete:

```powershell
Get-ChildItem 'F:\pos-sezapos' -Recurse -File -Include '*.bak','*.backup','*.tmp','*~' | Remove-Item -Force
```

## Protect environment secrets

Keep your active local `.env` files, but make sure Git does not track them:

```powershell
git status --short
git ls-files .env .env.development .env.production .env.local
```

When any are listed as tracked:

```powershell
git rm --cached .env .env.development .env.production .env.local
```

Commit only an `.env.example` containing variable names and no live values.

## Never commit

- `node_modules/`
- `dist/`
- `android-webdir/`
- `android/app/build/`
- APK or AAB files
- signing keystores or passwords
- `.env*` secrets
- the nested duplicate source tree
