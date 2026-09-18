param(
    [string]$Device = "10.0.0.20:5555"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidSdk = "F:\Android\Sdk"
$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
$Keystore = "$env:USERPROFILE\.android\debug.keystore"

$WorkflowApi = "https://api.github.com/repos/Diovoom/pos-sezapos/actions/workflows/android-build.yml/runs?branch=main&per_page=1"
$ReleaseUrl = "https://github.com/Diovoom/pos-sezapos/releases/download/seza-pos-latest/SEZA-POS-latest.apk"

$UpdateDir = Join-Path $ProjectRoot ".seza-update"
$DownloadedApk = Join-Path $UpdateDir "SEZA-POS-latest.apk"
$SignedApk = Join-Path $UpdateDir "SEZA-POS-update.apk"

if (!(Test-Path $Adb)) {
    throw "ADB not found at $Adb"
}

if (!(Test-Path $Keystore)) {
    throw "SEZA signing key not found at $Keystore"
}

$Curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
if (-not $Curl) {
    throw "curl.exe was not found on this Windows PC."
}

$Git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
if (-not $Git) {
    throw "git.exe was not found."
}

$ExpectedSha = (& $Git -C $ProjectRoot rev-parse HEAD).Trim()
if (-not $ExpectedSha) {
    throw "Could not determine the current SEZA Git commit."
}

$BuildTools = Get-ChildItem (Join-Path $AndroidSdk "build-tools") -Directory |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1

if (-not $BuildTools) {
    throw "Android build-tools not found."
}

$ApkSigner = Join-Path $BuildTools.FullName "apksigner.bat"
if (!(Test-Path $ApkSigner)) {
    throw "apksigner not found at $ApkSigner"
}

New-Item -ItemType Directory -Force $UpdateDir | Out-Null

Write-Host ""
Write-Host "SEZA POS Update"
Write-Host "Commit: $ExpectedSha"
Write-Host ""

# Wait for GitHub Actions to finish building the APK for the exact commit
# currently checked out in VS Code. This prevents installing the previous APK
# when the user runs the updater immediately after git push.
$Deadline = (Get-Date).AddMinutes(20)
$Ready = $false

while ((Get-Date) -lt $Deadline) {
    $RunJson = & $Curl -L --silent --show-error --fail --retry 3 --retry-delay 2 `
        -H "Accept: application/vnd.github+json" `
        -H "User-Agent: SEZA-POS-Updater" `
        $WorkflowApi 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "GitHub status check failed. Retrying..."
        Start-Sleep -Seconds 10
        continue
    }

    try {
        $RunData = ($RunJson -join "`n") | ConvertFrom-Json
        $Run = $RunData.workflow_runs | Select-Object -First 1
    } catch {
        Write-Host "Could not read GitHub build status. Retrying..."
        Start-Sleep -Seconds 10
        continue
    }

    if (-not $Run) {
        Write-Host "Waiting for GitHub to start the APK build..."
        Start-Sleep -Seconds 10
        continue
    }

    if ($Run.head_sha -ne $ExpectedSha) {
        Write-Host "Waiting for GitHub to start this commit..."
        Start-Sleep -Seconds 10
        continue
    }

    if ($Run.status -eq "completed") {
        if ($Run.conclusion -ne "success") {
            throw "GitHub APK build failed for commit $ExpectedSha. Check the Build SEZA POS APK workflow."
        }

        $Ready = $true
        break
    }

    Write-Host "GitHub is building the APK... status: $($Run.status)"
    Start-Sleep -Seconds 10
}

if (-not $Ready) {
    throw "Timed out waiting for GitHub to finish the SEZA POS APK build."
}

Write-Host ""
Write-Host "GitHub build succeeded."
Write-Host "Downloading latest SEZA POS APK..."

if (Test-Path $DownloadedApk) {
    Remove-Item $DownloadedApk -Force
}

& $Curl -L --fail --show-error --retry 5 --retry-delay 2 --connect-timeout 20 `
    --output $DownloadedApk `
    $ReleaseUrl

if ($LASTEXITCODE -ne 0) {
    throw "Could not download the published SEZA POS APK from GitHub."
}

if (!(Test-Path $DownloadedApk) -or (Get-Item $DownloadedApk).Length -lt 1000000) {
    throw "The downloaded SEZA APK is missing or invalid."
}

if (Test-Path $SignedApk) {
    Remove-Item $SignedApk -Force
}

Write-Host "Signing APK with the existing SEZA POS key..."

& $ApkSigner sign `
    --ks $Keystore `
    --ks-key-alias androiddebugkey `
    --ks-pass pass:android `
    --key-pass pass:android `
    --out $SignedApk `
    $DownloadedApk

if ($LASTEXITCODE -ne 0) {
    throw "APK signing failed."
}

& $ApkSigner verify $SignedApk
if ($LASTEXITCODE -ne 0) {
    throw "APK signature verification failed."
}

Write-Host ""
Write-Host "Connecting to POS at $Device..."
& $Adb connect $Device | Out-Host

$Connected = & $Adb devices
if (($Connected -join "`n") -notmatch ([regex]::Escape($Device) + "\s+device")) {
    throw "POS is not connected over ADB at $Device"
}

Write-Host ""
Write-Host "Installing SEZA POS update..."

$InstallOutput = & $Adb install -r $SignedApk 2>&1
$InstallOutput | Out-Host

if ($LASTEXITCODE -ne 0 -or ($InstallOutput -join "`n") -notmatch "Success") {
    throw "SEZA POS update failed."
}

Write-Host ""
Write-Host "SEZA POS updated successfully."
