param(
  [string]$ProjectPath = 'F:\pos-sezapos',
  [switch]$SkipBackup
)

$ErrorActionPreference = 'Stop'
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManifestPath = Join-Path $PatchRoot 'PATCH-FILES.json'

if (-not (Test-Path $ManifestPath)) {
  throw "PATCH-FILES.json was not found beside APPLY-PATCH.ps1"
}
if (-not (Test-Path (Join-Path $ProjectPath 'package.json'))) {
  throw "package.json was not found at $ProjectPath. Point -ProjectPath to the outer SEZA project root."
}

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$parent = Split-Path -Parent $ProjectPath
$leaf = Split-Path -Leaf $ProjectPath
$backupRoot = Join-Path $parent "$leaf-PATCH-BACKUP-$timestamp"

if (-not $SkipBackup) {
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
}

$copied = 0
foreach ($relative in $manifest.files) {
  $platformRelative = $relative -replace '/', [IO.Path]::DirectorySeparatorChar
  $source = Join-Path $PatchRoot $platformRelative
  $destination = Join-Path $ProjectPath $platformRelative

  if (-not (Test-Path $source)) {
    throw "Patch file is missing: $relative"
  }

  if (-not $SkipBackup -and (Test-Path $destination)) {
    $backup = Join-Path $backupRoot $platformRelative
    New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
    Copy-Item -LiteralPath $destination -Destination $backup -Force
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
  $copied++
}

Write-Host "Applied $copied SEZA patch files to $ProjectPath" -ForegroundColor Green
if (-not $SkipBackup) {
  Write-Host "Replaced-file backup: $backupRoot" -ForegroundColor Cyan
}

$nested = Join-Path $ProjectPath 'pos-sezapos-main'
if (Test-Path $nested) {
  Write-Warning "Nested duplicate project still exists at $nested. Review CLEANUP-INSTRUCTIONS.md before building."
}

Write-Host "Next: apply database migrations, then run npm ci, npm run verify:production, npm run lint, and npm run build." -ForegroundColor Yellow
