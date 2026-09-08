$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Adb = 'F:\Android\Sdk\platform-tools\adb.exe'
$Device = '10.0.0.20:5555'
$TempDir = 'F:\Temp'
$GradleCache = 'F:\GradleCache'

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE. Nothing was pushed to GitHub."
  }
}

Write-Host "`n=== SEZA POS validated APK + Git release ===" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $Root 'package.json'))) { throw "package.json not found." }
if (-not (Test-Path (Join-Path $Root '.git'))) { throw "This folder is not a Git repository." }
if (-not (Test-Path $Adb)) { throw "ADB not found at $Adb" }

# Make the committed pre-push gate active for this clone.
git config core.hooksPath .githooks
Assert-LastExitCode 'Git hook setup'

Write-Host "`n[1/6] Running the same release checks GitHub runs..." -ForegroundColor Yellow
npm run verify:production
Assert-LastExitCode 'Production verification'
npm run verify:security
Assert-LastExitCode 'Security verification'
npm run lint
Assert-LastExitCode 'Lint'
npm run build
Assert-LastExitCode 'Hosted website build'
npm run android:build
Assert-LastExitCode 'Android web build'
npm run android:verify-native
Assert-LastExitCode 'Android native verification'

Write-Host "`n[2/6] Syncing Android..." -ForegroundColor Yellow
npm run android:sync
Assert-LastExitCode 'Android sync'

New-Item -ItemType Directory -Force $TempDir | Out-Null
New-Item -ItemType Directory -Force $GradleCache | Out-Null
$env:TEMP = $TempDir
$env:TMP = $TempDir
$env:GRADLE_USER_HOME = $GradleCache

Write-Host "`n[3/6] Building APK..." -ForegroundColor Yellow
Push-Location (Join-Path $Root 'android')
try {
  .\gradlew --stop
  .\gradlew assembleDebug --no-daemon --max-workers=1
  Assert-LastExitCode 'Gradle APK build'
} finally {
  Pop-Location
}

$Apk = Join-Path $Root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $Apk)) { throw "APK was not created at $Apk" }

Write-Host "`n[4/6] Installing APK on POS..." -ForegroundColor Yellow
& $Adb connect $Device
Assert-LastExitCode 'ADB connect'
& $Adb install --no-streaming -r $Apk
Assert-LastExitCode 'APK install'
& $Adb shell am force-stop com.sezapos.app
Assert-LastExitCode 'Stop SEZA POS'
& $Adb shell am start -n com.sezapos.app/.MainActivity
Assert-LastExitCode 'Start SEZA POS'

Write-Host "`n[5/6] Committing validated source..." -ForegroundColor Yellow
git add -A
Assert-LastExitCode 'git add'
$pending = git status --porcelain
Assert-LastExitCode 'git status'
if ($pending) {
  git commit -m "Update SEZA POS"
  Assert-LastExitCode 'git commit'
} else {
  Write-Host 'No source changes to commit.' -ForegroundColor DarkYellow
}

Write-Host "`n[6/6] Pushing validated commit..." -ForegroundColor Yellow
$branch = (git branch --show-current).Trim()
if (-not $branch) { throw 'Could not determine current branch.' }
git push origin $branch
Assert-LastExitCode 'git push'

Write-Host "`nDONE - build passed locally before GitHub push." -ForegroundColor Green
Write-Host "APK: $Apk"
