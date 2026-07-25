# Build and Installation Instructions — SEZA POS 1.3.2

## 1. Use the real project root

The correct root contains all three paths:

```powershell
Test-Path .\package.json
Test-Path .\src
Test-Path .\android
```

Each command must return `True`. Do not keep another full SEZA project or an old production-patch folder inside this root.

## 2. Copy the patch files

Extract the cleanup patch into the project root and choose **Replace files in the destination**. The ZIP preserves paths such as `src/`, `capacitor-shell/`, `android/`, `scripts/`, and `supabase/migrations/`.

The patch does not contain `.env` files, signing keys, `node_modules`, APK/AAB files, or generated builds.

## 3. Remove verified disposable artifacts

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\cleanup-project.ps1 -ProjectPath (Get-Location).Path
```

macOS/Linux/Git Bash:

```bash
./scripts/cleanup-project.sh .
```

The scripts do not delete environment files.

## 4. Use the locked runtime

```powershell
nvm install 24
nvm use 24
node --version
npm --version
```

## 5. Install and validate

```powershell
npm ci
npm run verify:production
npm run typecheck
npm run lint
npm test
npm run build
```

Fix every failure. Do not use `--force` to hide install or compiler problems.

## 6. Apply database migrations

Follow `DATABASE-INSTRUCTIONS.md`. At minimum, make sure the atomic sale, support/legal, live-chat, and public rate-limit migrations are present in production.

## 7. Build/sync Android

```powershell
npm run android:sync
npx cap open android
```

## 8. Build a debug APK

```powershell
cd android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

Expected output:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

Install it on a dedicated test POS and complete `RELEASE-TEST-CHECKLIST.md`.

## 9. Release signing

Keep the keystore and passwords outside Git. Build a signed AAB/APK only after the debug build passes the full checklist.

## 10. Publish all surfaces from one revision

The marketing website, merchant dashboard, web POS, admin portal, and Android APK must come from the same tested commit/version: 1.3.2, Android build 8.
