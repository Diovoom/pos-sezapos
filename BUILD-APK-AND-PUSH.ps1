$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "`n=== SEZA POS 1.3.3: install, verify, build APK, commit and push ===" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  throw "package.json was not found in $Root"
}
if (-not (Test-Path (Join-Path $Root '.git'))) {
  throw "This folder is not a Git repository. Put this script inside your cloned F:\pos-sezapos folder."
}

$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path $env:JAVA_HOME)) {
  throw "Android Studio Java was not found at $env:JAVA_HOME"
}
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Write-Host "`n[1/7] Installing npm dependencies..." -ForegroundColor Yellow
try {
  npm ci
} catch {
  Write-Host "npm ci failed; trying npm install..." -ForegroundColor DarkYellow
  npm install
}
if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed." }

Write-Host "`n[2/7] Type checking..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }

Write-Host "`n[3/7] Running production verification..." -ForegroundColor Yellow
npm run verify:production
if ($LASTEXITCODE -ne 0) { throw "Production verification failed." }

Write-Host "`n[4/7] Building and syncing Android..." -ForegroundColor Yellow
npm run android:sync
if ($LASTEXITCODE -ne 0) { throw "Android sync failed." }

Write-Host "`n[5/7] Building debug APK..." -ForegroundColor Yellow
Push-Location (Join-Path $Root 'android')
try {
  .\gradlew.bat clean assembleDebug
  if ($LASTEXITCODE -ne 0) { throw "Gradle APK build failed." }
} finally {
  Pop-Location
}

$Apk = Join-Path $Root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $Apk)) { throw "APK was not created at $Apk" }

$ReleaseDir = Join-Path $Root 'release'
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
$ReleaseApk = Join-Path $ReleaseDir 'SEZA-POS-1.3.3-debug.apk'
Copy-Item $Apk $ReleaseApk -Force
Write-Host "APK created: $ReleaseApk" -ForegroundColor Green

Write-Host "`n[6/7] Committing source changes..." -ForegroundColor Yellow
git add .
$pending = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "git status failed." }
if ($pending) {
  git commit -m "Release SEZA POS 1.3.3 customer display fixes"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
} else {
  Write-Host "No source changes to commit." -ForegroundColor DarkYellow
}

Write-Host "`n[7/7] Pushing current branch to GitHub..." -ForegroundColor Yellow
$branch = (git branch --show-current).Trim()
if (-not $branch) { throw "Could not determine the current Git branch." }
git push origin $branch
if ($LASTEXITCODE -ne 0) { throw "git push failed." }

Write-Host "`nDONE" -ForegroundColor Green
Write-Host "GitHub branch: $branch"
Write-Host "APK: $ReleaseApk"
