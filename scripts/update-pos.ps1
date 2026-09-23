param(
    [string]$Device = "10.0.0.20:5555"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidSdk = "F:\Android\Sdk"
$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
$Keystore = "$env:USERPROFILE\.android\debug.keystore"

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

& $Curl -L --fail --show-error --retry 5 --retry-delay 2 --connect-timeout 20 `
    -H "Accept: application/octet-stream" `
    -H "Authorization: Bearer $GitHubToken" `
    -H "X-GitHub-Api-Version: 2022-11-28" `
    -H "User-Agent: SEZA-POS-Updater" `
    --output $ArtifactZip `
    $Artifact.archive_download_url

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
