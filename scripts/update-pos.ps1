param(
    [string]$Device = "10.0.0.20:5555"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidSdk = "F:\Android\Sdk"
$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
$Keystore = "$env:USERPROFILE\.android\debug.keystore"
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
Write-Host "Downloading latest successful GitHub APK..."
Write-Host ""

Invoke-WebRequest `
    -Uri $ReleaseUrl `
    -OutFile $DownloadedApk `
    -UseBasicParsing

if (!(Test-Path $DownloadedApk) -or (Get-Item $DownloadedApk).Length -lt 1000000) {
    throw "Latest SEZA APK download failed or returned an invalid file."
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
if ($Connected -notmatch [regex]::Escape($Device) + "\s+device") {
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
