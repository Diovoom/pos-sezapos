param(
    [string]$Device = "10.0.0.20:5555"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidSdk = "F:\Android\Sdk"
$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
$LegacyDebugKeystore = "$env:USERPROFILE\.android\debug.keystore"
$SigningDir = Join-Path $ProjectRoot ".seza-signing"
$PinnedKeystore = Join-Path $SigningDir "seza-pos-update.keystore"
$Keystore = $null

$WorkflowApiBase = "https://api.github.com/repos/Diovoom/pos-sezapos/actions/workflows/android-build.yml/runs"
$ArtifactName = "SEZA-POS-APK"
$ApkName = "SEZA-POS-latest.apk"

$UpdateDir = Join-Path $ProjectRoot ".seza-update"
$ArtifactZip = Join-Path $UpdateDir "SEZA-POS-APK.zip"
$ArtifactDir = Join-Path $UpdateDir "artifact"
$DownloadedApk = Join-Path $UpdateDir $ApkName
$SignedApk = Join-Path $UpdateDir "SEZA-POS-update.apk"

if (!(Test-Path $Adb)) {
    throw "ADB not found at $Adb"
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

function Get-GitHubJson {
    param([Parameter(Mandatory = $true)][string]$Url)

    $Json = & $Curl -L --silent --show-error --fail --retry 3 --retry-delay 2 `
        -H "Accept: application/vnd.github+json" `
        -H "Authorization: Bearer $GitHubToken" `
        -H "X-GitHub-Api-Version: 2022-11-28" `
        -H "User-Agent: SEZA-POS-Updater" `
        $Url 2>&1

    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    try {
        return (($Json -join "`n") | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Show-FailedWorkflowDetails {
    param([Parameter(Mandatory = $true)]$Run)

    Write-Host ""
    Write-Host "GitHub workflow did not finish cleanly." -ForegroundColor Yellow
    if ($Run.html_url) {
        Write-Host "Run: $($Run.html_url)"
    }

    $JobsApi = "https://api.github.com/repos/Diovoom/pos-sezapos/actions/runs/$($Run.id)/jobs?filter=latest&per_page=100"
    $JobsData = Get-GitHubJson -Url $JobsApi
    if (-not $JobsData) {
        Write-Host "Could not retrieve failed-job details from GitHub." -ForegroundColor Yellow
        return
    }

    $FailedJobs = $JobsData.jobs | Where-Object {
        $_.conclusion -and $_.conclusion -notin @("success", "skipped", "neutral")
    }

    foreach ($Job in $FailedJobs) {
        Write-Host ""
        Write-Host "Failed job: $($Job.name)" -ForegroundColor Red
        $FailedSteps = $Job.steps | Where-Object {
            $_.conclusion -and $_.conclusion -notin @("success", "skipped", "neutral")
        }
        foreach ($Step in $FailedSteps) {
            Write-Host "Failed step: $($Step.name) ($($Step.conclusion))" -ForegroundColor Yellow
        }

        $LogPath = Join-Path $UpdateDir "github-job-$($Job.id).log"
        $LogApi = "https://api.github.com/repos/Diovoom/pos-sezapos/actions/jobs/$($Job.id)/logs"
        & $Curl -L --silent --show-error --fail --retry 3 --retry-delay 2 `
            -H "Accept: application/vnd.github+json" `
            -H "Authorization: Bearer $GitHubToken" `
            -H "X-GitHub-Api-Version: 2022-11-28" `
            -H "User-Agent: SEZA-POS-Updater" `
            --output $LogPath `
            $LogApi 2>$null

        if ($LASTEXITCODE -eq 0 -and (Test-Path $LogPath)) {
            Write-Host ""
            Write-Host "Last GitHub build lines:" -ForegroundColor Yellow
            Get-Content $LogPath -Tail 140 | Out-Host
            Write-Host ""
            Write-Host "Full job log saved to: $LogPath"
        }
    }
}

Write-Host ""
Write-Host "SEZA POS Update"
Write-Host "Commit: $ExpectedSha"
Write-Host ""

$Deadline = (Get-Date).AddMinutes(20)
$Run = $null
$Artifact = $null

while ((Get-Date) -lt $Deadline) {
    $RunData = Get-GitHubJson -Url $WorkflowApi

    if (-not $RunData) {
        Write-Host "GitHub status check failed. Retrying..."
        Start-Sleep -Seconds 10
        continue
    }

    $Run = $RunData.workflow_runs | Select-Object -First 1

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

    if ($Run.status -ne "completed") {
        Write-Host "GitHub is building the APK... status: $($Run.status)"
        Start-Sleep -Seconds 10
        continue
    }

    # The Android APK may already be valid even if a later release-publish step fails.
    # Always look for the exact workflow artifact from this commit before treating the run as fatal.
    $ArtifactsApi = "https://api.github.com/repos/Diovoom/pos-sezapos/actions/runs/$($Run.id)/artifacts?per_page=100"
    $ArtifactsData = Get-GitHubJson -Url $ArtifactsApi
    if ($ArtifactsData) {
        $Artifact = $ArtifactsData.artifacts |
            Where-Object { $_.name -eq $ArtifactName -and -not $_.expired } |
            Sort-Object created_at -Descending |
            Select-Object -First 1
    }

    if ($Artifact -and $Artifact.archive_download_url) {
        if ($Run.conclusion -eq "success") {
            Write-Host "GitHub APK build succeeded."
        } else {
            Write-Host ""
            Write-Host "APK was built successfully, but a later GitHub publish step failed." -ForegroundColor Yellow
            Write-Host "Using the APK workflow artifact directly, so the POS update can continue." -ForegroundColor Green
        }
        break
    }

    # No usable APK artifact exists. In that case the workflow failure is real for the updater.
    if ($Run.conclusion -ne "success") {
        Show-FailedWorkflowDetails -Run $Run
        throw "GitHub did not produce a usable $ArtifactName artifact for commit $ExpectedSha."
    }

    throw "GitHub completed the APK workflow but did not publish the $ArtifactName artifact for commit $ExpectedSha."
}

if (-not $Run -or $Run.status -ne "completed") {
    throw "Timed out waiting for GitHub to finish the SEZA POS APK build."
}

if (-not $Artifact -or -not $Artifact.archive_download_url) {
    throw "The GitHub workflow did not provide a usable $ArtifactName artifact."
}

Write-Host ""
Write-Host "Downloading APK artifact for this exact commit..."

if (Test-Path $ArtifactZip) {
    Remove-Item $ArtifactZip -Force
}
if (Test-Path $ArtifactDir) {
    Remove-Item $ArtifactDir -Recurse -Force
}
if (Test-Path $DownloadedApk) {
    Remove-Item $DownloadedApk -Force
}

$ArtifactDownloadUrl = "https://api.github.com/repos/Diovoom/pos-sezapos/actions/artifacts/$($Artifact.id)/zip"

& $Curl -L --fail --show-error --retry 5 --retry-delay 2 --connect-timeout 20 `
    -H "Accept: application/vnd.github+json" `
    -H "Authorization: Bearer $GitHubToken" `
    -H "X-GitHub-Api-Version: 2022-11-28" `
    -H "User-Agent: SEZA-POS-Updater" `
    --output $ArtifactZip `
    $ArtifactDownloadUrl

if ($LASTEXITCODE -ne 0) {
    throw "Could not download the GitHub APK artifact."
}

if (!(Test-Path $ArtifactZip) -or (Get-Item $ArtifactZip).Length -lt 1000000) {
    throw "The downloaded GitHub artifact ZIP is missing or invalid."
}

New-Item -ItemType Directory -Force $ArtifactDir | Out-Null
Expand-Archive -LiteralPath $ArtifactZip -DestinationPath $ArtifactDir -Force

$ArtifactApk = Get-ChildItem $ArtifactDir -Recurse -File -Filter "*.apk" |
    Where-Object { $_.Name -eq $ApkName } |
    Select-Object -First 1

if (-not $ArtifactApk) {
    $ArtifactApk = Get-ChildItem $ArtifactDir -Recurse -File -Filter "*.apk" | Select-Object -First 1
}

if (-not $ArtifactApk) {
    throw "The GitHub artifact did not contain an APK file."
}

Copy-Item -LiteralPath $ArtifactApk.FullName -Destination $DownloadedApk -Force

if (!(Test-Path $DownloadedApk) -or (Get-Item $DownloadedApk).Length -lt 1000000) {
    throw "The extracted SEZA APK is missing or invalid."
}

if (Test-Path $SignedApk) {
    Remove-Item $SignedApk -Force
}

function Invoke-SezaNative {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [Parameter(Mandatory = $true)][string[]]$Args
    )

    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $Output = @(& $Exe @Args 2>&1 | ForEach-Object { "$_" })
        $ExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }

    return [pscustomobject]@{
        ExitCode = $ExitCode
        Output = $Output
        Text = ($Output -join "`n")
    }
}

function Get-ApkSignerDigest {
    param([Parameter(Mandatory = $true)][string]$ApkPath)

    if (!(Test-Path $ApkPath)) {
        return $null
    }

    $Verify = Invoke-SezaNative -Exe $ApkSigner -Args @("verify", "--print-certs", $ApkPath)
    foreach ($Line in $Verify.Output) {
        if ($Line -match "SHA-256 digest:\s*([0-9A-Fa-f]+)") {
            return $Matches[1].ToLowerInvariant()
        }
    }

    return $null
}

function Sign-SezaApk {
    param(
        [Parameter(Mandatory = $true)][string]$InputApk,
        [Parameter(Mandatory = $true)][string]$OutputApk,
        [Parameter(Mandatory = $true)][string]$KeyPath
    )

    if (Test-Path $OutputApk) {
        Remove-Item $OutputApk -Force
    }

    $Sign = Invoke-SezaNative -Exe $ApkSigner -Args @(
        "sign",
        "--ks", $KeyPath,
        "--ks-key-alias", "androiddebugkey",
        "--ks-pass", "pass:android",
        "--key-pass", "pass:android",
        "--out", $OutputApk,
        $InputApk
    )

    if ($Sign.ExitCode -ne 0) {
        return $false
    }

    $Verify = Invoke-SezaNative -Exe $ApkSigner -Args @("verify", $OutputApk)
    return ($Verify.ExitCode -eq 0)
}

function Get-InstalledSezaApk {
    $PackageResult = Invoke-SezaNative -Exe $Adb -Args @("shell", "pm", "path", "com.sezapos.app")
    if ($PackageResult.ExitCode -ne 0) {
        return $null
    }

    $PackagePath = $PackageResult.Output |
        Where-Object { "$_" -like "package:*base.apk*" } |
        Select-Object -First 1

    if (-not $PackagePath) {
        $PackagePath = $PackageResult.Output |
            Where-Object { "$_" -like "package:*" } |
            Select-Object -First 1
    }

    if (-not $PackagePath) {
        return $null
    }

    $RemoteApk = ("$PackagePath").Trim() -replace "^package:", ""
    if (-not $RemoteApk) {
        return $null
    }

    $InstalledApk = Join-Path $UpdateDir "SEZA-POS-installed.apk"
    if (Test-Path $InstalledApk) {
        Remove-Item $InstalledApk -Force
    }

    $Pull = Invoke-SezaNative -Exe $Adb -Args @("pull", $RemoteApk, $InstalledApk)
    if ($Pull.ExitCode -ne 0 -or !(Test-Path $InstalledApk)) {
        return $null
    }

    return $InstalledApk
}

function Get-CandidateSignerDigest {
    param([Parameter(Mandatory = $true)][string]$KeyPath)

    if (!(Test-Path $KeyPath)) {
        return $null
    }

    $CandidateApk = Join-Path $UpdateDir "signer-check.apk"
    try {
        if (-not (Sign-SezaApk -InputApk $DownloadedApk -OutputApk $CandidateApk -KeyPath $KeyPath)) {
            return $null
        }
        return Get-ApkSignerDigest -ApkPath $CandidateApk
    } finally {
        if (Test-Path $CandidateApk) {
            Remove-Item $CandidateApk -Force
        }
    }
}

Write-Host ""
Write-Host "Connecting to POS at $Device..."
$Connect = Invoke-SezaNative -Exe $Adb -Args @("connect", $Device)
$Connect.Output | Out-Host

$Devices = Invoke-SezaNative -Exe $Adb -Args @("devices")
if ($Devices.Text -notmatch ([regex]::Escape($Device) + "\s+device")) {
    throw "POS is not connected over ADB at $Device"
}

# Pin the signing key that matches the APK already installed on the POS.
# This prevents Android update signature mismatches if the normal debug
# keystore is later regenerated or replaced.
New-Item -ItemType Directory -Force $SigningDir | Out-Null

$InstalledApk = Get-InstalledSezaApk
$InstalledDigest = if ($InstalledApk) { Get-ApkSignerDigest -ApkPath $InstalledApk } else { $null }

$CandidateKeys = @()
if (Test-Path $PinnedKeystore) {
    $CandidateKeys += $PinnedKeystore
}
if (Test-Path $LegacyDebugKeystore) {
    $LegacyResolved = (Resolve-Path $LegacyDebugKeystore).Path
    $AlreadyIncluded = $CandidateKeys | Where-Object {
        (Resolve-Path $_).Path -eq $LegacyResolved
    }
    if (-not $AlreadyIncluded) {
        $CandidateKeys += $LegacyDebugKeystore
    }
}

$ProjectDebugKeystore = Join-Path $ProjectRoot "android\app\debug.keystore"
if (Test-Path $ProjectDebugKeystore) {
    $ProjectResolved = (Resolve-Path $ProjectDebugKeystore).Path
    $AlreadyIncluded = $CandidateKeys | Where-Object {
        (Resolve-Path $_).Path -eq $ProjectResolved
    }
    if (-not $AlreadyIncluded) {
        $CandidateKeys += $ProjectDebugKeystore
    }
}

if ($InstalledDigest) {
    Write-Host "Installed SEZA signer: $InstalledDigest"

    foreach ($CandidateKey in $CandidateKeys) {
        $CandidateDigest = Get-CandidateSignerDigest -KeyPath $CandidateKey
        if ($CandidateDigest -and $CandidateDigest -eq $InstalledDigest) {
            $Keystore = $CandidateKey
            break
        }
    }

    if (-not $Keystore) {
        throw @"
The installed SEZA POS is signed with a key that is not available on this laptop.

Installed signer SHA-256: $InstalledDigest

The updater did NOT uninstall SEZA POS and did NOT erase any app data.
To preserve seamless updates, the original signing key used for the installed app must be restored once.
"@
    }

    # Once the matching key is found, preserve a dedicated copy for all future
    # SEZA updates instead of depending on Android's replaceable debug.keystore.
    if ((Resolve-Path $Keystore).Path -ne $PinnedKeystore) {
        Copy-Item -LiteralPath $Keystore -Destination $PinnedKeystore -Force
        $Keystore = $PinnedKeystore
        Write-Host "Pinned the matching SEZA signing key for future updates."
    }
} else {
    if (Test-Path $PinnedKeystore) {
        $Keystore = $PinnedKeystore
    } elseif (Test-Path $LegacyDebugKeystore) {
        Copy-Item -LiteralPath $LegacyDebugKeystore -Destination $PinnedKeystore -Force
        $Keystore = $PinnedKeystore
        Write-Host "Pinned the SEZA signing key for future updates."
    } else {
        throw "No SEZA signing key is available. Expected $PinnedKeystore or $LegacyDebugKeystore"
    }
}

Write-Host "Signing APK with the pinned SEZA POS key..."

if (-not (Sign-SezaApk -InputApk $DownloadedApk -OutputApk $SignedApk -KeyPath $Keystore)) {
    throw "APK signing or signature verification failed."
}

$UpdateDigest = Get-ApkSignerDigest -ApkPath $SignedApk
if (-not $UpdateDigest) {
    throw "Could not read the signer from the newly signed SEZA APK."
}

Write-Host "Update SEZA signer:    $UpdateDigest"

if ($InstalledDigest -and $UpdateDigest -ne $InstalledDigest) {
    throw "Signing preflight failed: installed and update APK signatures do not match. Installation was not attempted."
}

function Invoke-SezaAdbInstall {
    param([Parameter(Mandatory = $true)][string[]]$InstallArgs)

    return Invoke-SezaNative -Exe $Adb -Args $InstallArgs
}

Write-Host ""
Write-Host "Installing SEZA POS update..."

# Stop the running process before replacement. This does not clear application
# data and makes package replacement more reliable on older Android POS images.
$null = Invoke-SezaNative -Exe $Adb -Args @("shell", "am", "force-stop", "com.sezapos.app")

$Install = Invoke-SezaAdbInstall -InstallArgs @("install", "--no-streaming", "-r", $SignedApk)
$Install.Output | Out-Host

if ($Install.ExitCode -ne 0 -or $Install.Text -notmatch "Success") {
    if ($Install.Text -match "Unknown option: --no-streaming|unknown option --no-streaming") {
        Write-Host "This ADB target does not support --no-streaming. Retrying normally..." -ForegroundColor Yellow
        $Install = Invoke-SezaAdbInstall -InstallArgs @("install", "-r", $SignedApk)
        $Install.Output | Out-Host
    }
}

if ($Install.ExitCode -ne 0 -or $Install.Text -notmatch "Success") {
    if ($Install.Text -match "INSTALL_FAILED_VERSION_DOWNGRADE") {
        Write-Host "Installed POS has a higher version code. Retrying while preserving app data..." -ForegroundColor Yellow
        $Install = Invoke-SezaAdbInstall -InstallArgs @("install", "--no-streaming", "-r", "-d", $SignedApk)
        if ($Install.Text -match "Unknown option: --no-streaming|unknown option --no-streaming") {
            $Install = Invoke-SezaAdbInstall -InstallArgs @("install", "-r", "-d", $SignedApk)
        }
        $Install.Output | Out-Host
    }
}

if ($Install.ExitCode -ne 0 -or $Install.Text -notmatch "Success") {
    if ($Install.Text -match "device offline|no devices|closed|connection reset") {
        Write-Host "ADB connection dropped. Reconnecting once and retrying..." -ForegroundColor Yellow
        $null = Invoke-SezaNative -Exe $Adb -Args @("disconnect", $Device)
        Start-Sleep -Seconds 2
        $Reconnect = Invoke-SezaNative -Exe $Adb -Args @("connect", $Device)
        $Reconnect.Output | Out-Host
        $Install = Invoke-SezaAdbInstall -InstallArgs @("install", "--no-streaming", "-r", $SignedApk)
        if ($Install.Text -match "Unknown option: --no-streaming|unknown option --no-streaming") {
            $Install = Invoke-SezaAdbInstall -InstallArgs @("install", "-r", $SignedApk)
        }
        $Install.Output | Out-Host
    }
}

if ($Install.ExitCode -ne 0 -or $Install.Text -notmatch "Success") {
    throw "SEZA POS update failed. Android/ADB said:`n$($Install.Text)"
}

Write-Host ""
Write-Host "SEZA POS updated successfully."
Write-Host "Signing key pinned at: $PinnedKeystore"

