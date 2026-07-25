param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $ProjectPath).Path

if (-not (Test-Path (Join-Path $root 'package.json')) -or -not (Test-Path (Join-Path $root 'src'))) {
  throw "The selected folder does not look like the SEZA POS project: $root"
}

Write-Host "Cleaning SEZA POS at $root" -ForegroundColor Cyan

$directories = @(
  '.eslintcache',
  'android-webdir',
  'dist',
  'dist-ssr',
  '.output',
  '.vinxi',
  'android\.gradle',
  'android\build',
  'android\app\build'
)

Get-ChildItem $root -Directory -Filter 'SEZA-POS-v*-PRODUCTION-PATCH' -ErrorAction SilentlyContinue |
  ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
    Write-Host "Removed nested release project $($_.Name)"
  }

foreach ($relative in $directories) {
  $target = Join-Path $root $relative
  if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
    Write-Host "Removed $relative"
  }
}

Get-ChildItem $root -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -like '*.bak' -or
    $_.Name -like '*.backup' -or
    $_.Name -like '*.orig' -or
    $_.Name.EndsWith('~')
  } |
  ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "Removed backup $($_.FullName.Substring($root.Length + 1))"
  }

$staleReleaseFiles = @(
  'APPLY-PATCH.ps1',
  'APPLY-SEZA-HOMEPAGE-UPDATE.bat',
  'INSTALL-SEZA-1.2.0.bat',
  'PATCH-FILES.json',
  'PATCH-MANIFEST.md',
  'ROLLBACK-INSTRUCTIONS.md',
  'SEZA-1.2.1-UPDATE.txt',
  'SEZA-1.2.2-CHANGED-FILES.txt',
  'SEZA-1.2.2-RELIABILITY-UPDATE.txt',
  'SEZA-GOOGLE-OAUTH-BRANDING.md',
  'SEZA-HOMEPAGE-UPDATE.md',
  'SEZA-MAJOR-UPDATE.md',
  'SHA256SUMS.txt',
  'SOURCE-AUDIT.md',
  'VALIDATION-RESULTS.md',
  'apply-seza-dashboard-recovery-v2.ps1',
  'apply-seza-final-dashboard-fix.ps1',
  'apply-seza-roles-permissions-fix.ps1'
)

foreach ($relative in $staleReleaseFiles) {
  $target = Join-Path $root $relative
  if (Test-Path $target) {
    Remove-Item $target -Force
    Write-Host "Removed stale release artifact $relative"
  }
}

Write-Host 'Cleanup complete. Your .env files were not touched.' -ForegroundColor Green
