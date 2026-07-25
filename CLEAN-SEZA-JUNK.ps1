$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$paths = @(
  ".eslintcache",
  "SEZA-POS-v1.3.0-PRODUCTION-PATCH",
  "APPLY-PATCH.ps1",
  "APPLY-SEZA-HOMEPAGE-UPDATE.bat",
  "INSTALL-SEZA-1.2.0.bat",
  "apply-seza-dashboard-recovery-v2.ps1",
  "apply-seza-final-dashboard-fix.ps1",
  "apply-seza-roles-permissions-fix.ps1",
  "CLEANUP-INSTRUCTIONS.md",
  "PATCH-FILES.json",
  "PATCH-MANIFEST.md",
  "ROLLBACK-INSTRUCTIONS.md",
  "SEZA-1.2.1-UPDATE.txt",
  "SEZA-1.2.2-CHANGED-FILES.txt",
  "SEZA-1.2.2-RELIABILITY-UPDATE.txt",
  "SEZA-HOMEPAGE-UPDATE.md",
  "SEZA-MAJOR-UPDATE.md",
  "SHA256SUMS.txt",
  "SOURCE-AUDIT.md",
  "VALIDATION-RESULTS.md",
  "src/lib/admin/login-attempts.functions.ts",
  "src/components/marketing/MarketingShell.tsx.20260721-192825.bak",
  "src/components/marketing/MarketingShell.tsx.20260721-193342.bak",
  "src/components/marketing/MarketingShell.tsx.20260721-195030.bak",
  "src/components/pos/AppShell.tsx.20260721-192825.bak",
  "src/components/pos/AppShell.tsx.20260721-193342.bak",
  "src/components/pos/AppShell.tsx.20260721-195030.bak",
  "src/components/settings/RolePermissionsPanel.tsx.20260721-202016.bak",
  "src/components/settings/RolePermissionsPanel.tsx.20260721-205721.bak",
  "src/hooks/usePermissions.ts.20260721-202016.bak",
  "src/hooks/usePermissions.ts.20260721-205721.bak",
  "src/hooks/useStoreBranding.ts.20260721-195030.bak",
  "src/hooks/useStoreLanguageSync.ts.20260721-195030.bak",
  "src/lib/ui-preferences.ts.20260721-195030.bak"
)

$removed = 0
foreach ($relative in $paths) {
  $target = Join-Path $ProjectRoot $relative
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed $relative"
    $removed++
  }
}

Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '\.(bak|backup|orig)$' } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "Removed $($_.FullName.Substring($ProjectRoot.Length + 1))"
    $removed++
  }

Write-Host "SEZA cleanup complete. Removed $removed old/duplicate item(s)." -ForegroundColor Green
