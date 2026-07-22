param(
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Require-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path`nRun this from F:\pos-sezapos."
    }
}

function Save-Utf8([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText(
        $Path,
        $Content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

$permissionsPath = Join-Path $ProjectRoot "src\hooks\usePermissions.ts"
$panelPath = Join-Path $ProjectRoot "src\components\settings\RolePermissionsPanel.tsx"

Require-File $permissionsPath
Require-File $panelPath

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath $permissionsPath -Destination "$permissionsPath.$timestamp.bak"
Copy-Item -LiteralPath $panelPath -Destination "$panelPath.$timestamp.bak"

# ---------------------------------------------------------------------------
# Fix duplicate Realtime channel crash.
# SettingsPage mounts usePermissions(), while RolePermissionsPanel mounts
# useRolePermissions() again. Each hook instance needs its own channel topic.
# ---------------------------------------------------------------------------
$permissions = Get-Content -LiteralPath $permissionsPath -Raw

$permissions = $permissions.Replace(
    '.channel(`role-permissions:${storeId}`)',
    '.channel(`role-permissions:${storeId}:${Math.random().toString(36).slice(2)}`)'
)

if (-not $permissions.Contains('role-permissions:${storeId}:${Math.random().toString(36).slice(2)}')) {
    throw "Could not patch the role-permissions Realtime channel."
}

Save-Utf8 $permissionsPath $permissions

# ---------------------------------------------------------------------------
# Make the panel resilient and use the same store fallback as the hook.
# ---------------------------------------------------------------------------
$panel = Get-Content -LiteralPath $panelPath -Raw

$panel = $panel.Replace(
    'const storeId = me.data?.profile?.store_id as string | undefined;',
    'const storeId = (me.data?.profile?.store_id ?? me.data?.store?.id) as string | undefined;'
)

$panel = $panel.Replace(
    'const { data: rows = [], isLoading } = useRolePermissions();',
    'const { data: rows = [], isLoading, error, refetch } = useRolePermissions();'
)

$oldContent = @'
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading permissions…</div>
        ) : (
'@

$newContent = @'
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading permissions…</div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div className="font-medium text-destructive">Could not load role permissions</div>
            <div className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "The permission service could not be reached."}
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              Try again
            </button>
          </div>
        ) : (
'@

if (-not $panel.Contains($oldContent)) {
    throw "Could not locate the permission panel loading block."
}

$panel = $panel.Replace($oldContent, $newContent)

Save-Utf8 $panelPath $panel

Write-Host ""
Write-Host "SEZA Roles & Permissions fix applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Fixed:" -ForegroundColor Cyan
Write-Host "  - duplicate Supabase permission Realtime channel"
Write-Host "  - owner store context fallback"
Write-Host "  - panel-level retry instead of full dashboard crash"
Write-Host "  - live permission invalidation remains enabled for Android"
Write-Host ""
Write-Host "Now run:" -ForegroundColor Yellow
Write-Host "  bun run build"
Write-Host ""
