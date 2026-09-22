param(
    [string]$Device = "10.0.0.20:5555"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidSdk = "F:\Android\Sdk"
$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
$Keystore = "$env:USERPROFILE\.android\debug.keystore"

$WorkflowApiBase = "https://api.github.com/repos/Diovoom/pos-sezapos/actions/workflows/android-build.yml/runs"
$ReleaseApi = "https://api.github.com/repos/Diovoom/pos-sezapos/releases/tags/seza-pos-latest"
$ReleaseAssetName = "SEZA-POS-latest.apk"

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

# Reuse the GitHub credential already stored by Git Credential Manager.
$CredentialRequest = "protocol=https`nhost=github.com`n`n"
$CredentialResponse = $CredentialRequest | & $Git credential fill 2>$null

if ($LASTEXITCODE -ne 0 -or -not $CredentialResponse) {
    throw "Could not read the GitHub credential from Git Credential Manager. Run a normal git pull/push and sign in to GitHub, then try again."
}

$GitHubToken = $null
foreach ($Line in $CredentialResponse) {
    if ($Line -like "password=*") {
        $GitHubToken = $Line.Substring("password=".Length)
    }
}

if (-not $GitHubToken) {
    throw "Git Credential Manager did not return a GitHub token. Run a normal git pull/push and sign in to GitHub, then try again."
}

$WorkflowApi = "${WorkflowApiBase}?branch=main&head_sha=$ExpectedSha&per_page=1"

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

$Deadline = (Get-Date).AddMinutes(20)
$Ready = $false

while ((Get-Date) -lt $Deadline) {
    $RunJson = & $Curl -L --silent --show-error --fail --retry 3 --retry-delay 2 `
        -H "Accept: application/vnd.github+json" `
        -H "Authorization: Bearer $GitHubToken" `
        -H "X-GitHub-Api-Version: 2022-11-28" `
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
Write-Host "Finding latest SEZA POS APK release..."

$ReleaseJson = & $Curl -L --silent --show-error --fail --retry 3 --retry-delay 2 `
    -H "Accept: application/vnd.github+json" `
    -H "Authorization: Bearer $GitHubToken" `
    -H "X-GitHub-Api-Version: 2022-11-28" `
    -H "User-Agent: SEZA-POS-Updater" `
    $ReleaseApi 2>&1

if ($LASTEXITCODE -ne 0) {
    throw "Could not read the SEZA POS private release from GitHub."
}

try {
    $ReleaseData = ($ReleaseJson -join "`n") | ConvertFrom-Json
    $ReleaseAsset = $ReleaseData.assets | Where-Object { $_.name -eq $ReleaseAssetName } | Select-Object -First 1
} catch {
    throw "Could not read the SEZA POS release information."
}

if (-not $ReleaseAsset -or -not $ReleaseAsset.url) {
    throw "The GitHub release does not contain $ReleaseAssetName."
}

Write-Host "Downloading latest SEZA POS APK..."

if (Test-Path $DownloadedApk) {
    Remove-Item $DownloadedApk -Force
}

& $Curl -L --fail --show-error --retry 5 --retry-delay 2 --connect-timeout 20 `
    -H "Accept: application/octet-stream" `
    -H "Authorization: Bearer $GitHubToken" `
    -H "X-GitHub-Api-Version: 2022-11-28" `
    -H "User-Agent: SEZA-POS-Updater" `
    --output $DownloadedApk `
    $ReleaseAsset.url

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
