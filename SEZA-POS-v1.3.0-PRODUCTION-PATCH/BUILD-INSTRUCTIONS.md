# Build and Installation Instructions

## 1. Confirm the real project root

The supplied ZIP contained a second full project inside the first. Use the outer project as the real root.

```powershell
Test-Path F:\pos-sezapos\package.json
Test-Path F:\pos-sezapos\src
Test-Path F:\pos-sezapos\android
```

All three commands should return `True`.

## 2. Back up and apply the patch

Extract this ZIP somewhere outside the project, then run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\APPLY-PATCH.ps1 -ProjectPath 'F:\pos-sezapos'
```

The script copies only the files listed in `PATCH-FILES.json` and backs up every replaced file beside the project. It does not copy or modify `.env` files.

Manual alternative: copy the patch folders/files into `F:\pos-sezapos` and select **Replace files in the destination**.

## 3. Clean ambiguous and generated content

Follow `CLEANUP-INSTRUCTIONS.md`. In particular, remove the nested duplicate `F:\pos-sezapos\pos-sezapos-main` after confirming the outer root is correct. Do not delete the active `.env` files; untrack them from Git if necessary.

## 4. Use the locked runtime

The dependency lock requires Node 24.

```powershell
nvm install 24
nvm use 24
node --version
npm --version
```

## 5. Install and validate

```powershell
cd F:\pos-sezapos
npm ci
npm run verify:production
npm run lint
npm run build
```

Fix any failure before deployment. Do not use `--force` to hide dependency or compile errors.

## 6. Apply the database migrations

Complete `DATABASE-INSTRUCTIONS.md` before releasing the website or APK.

## 7. Build Android web assets and sync Capacitor

```powershell
cd F:\pos-sezapos
npm run android:build
npx cap sync android
```

Confirm the sync output includes `SezaSecureStorage` and the expected native plugins.

## 8. Clean-build a test APK

```powershell
cd F:\pos-sezapos\android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

Expected debug APK:

```text
F:\pos-sezapos\android\app\build\outputs\apk\debug\app-debug.apk
```

Install that build on a dedicated test terminal and complete every item in `RELEASE-TEST-CHECKLIST.md`.

## 9. Release signing

A Play Store or merchant release must use your private signing keystore and protected Gradle properties. Never place the keystore password or signing secrets in Git or this patch. Build an AAB only after the debug acceptance test passes:

```powershell
.\gradlew.bat bundleRelease
```

## 10. Deploy website/admin

Deploy the same commit and version that produced Android build 6. Confirm:

- `sezapos.com`
- merchant dashboard host
- POS host
- admin host

all point to the intended release and not the nested duplicate source tree.
