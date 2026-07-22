param(
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Require-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path`nRun this from the SEZA project root, normally F:\pos-sezapos."
    }
}

function Save-Utf8([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText(
        $Path,
        $Content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

$marketingPath = Join-Path $ProjectRoot "src\components\marketing\MarketingShell.tsx"
$appShellPath  = Join-Path $ProjectRoot "src\components\pos\AppShell.tsx"

Require-File $marketingPath
Require-File $appShellPath

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath $marketingPath -Destination "$marketingPath.$timestamp.bak"
Copy-Item -LiteralPath $appShellPath  -Destination "$appShellPath.$timestamp.bak"

# ---------------------------------------------------------------------------
# Marketing website: open Dashboard auth/signup separately.
# Safe to run more than once.
# ---------------------------------------------------------------------------
$marketing = Get-Content -LiteralPath $marketingPath -Raw

$marketing = $marketing.Replace(
    '<a href={dashboardUrl("/auth")}>',
    '<a href={dashboardUrl("/auth")} target="_blank" rel="noopener noreferrer">'
)
$marketing = $marketing.Replace(
    '<a href={dashboardUrl("/signup")}>',
    '<a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer">'
)

Save-Utf8 $marketingPath $marketing

# ---------------------------------------------------------------------------
# Dashboard shell recovery.
# Removes only risky dashboard startup hooks and keeps the rest of the shell.
# ---------------------------------------------------------------------------
$app = Get-Content -LiteralPath $appShellPath -Raw

# Remove the two startup imports when present.
$app = [regex]::Replace(
    $app,
    '(?m)^\s*import\s+\{\s*useStoreLanguageSync\s*\}\s+from\s+"@/hooks/useStoreLanguageSync";\s*\r?\n',
    ''
)
$app = [regex]::Replace(
    $app,
    '(?m)^\s*import\s+\{\s*useTranslation\s*\}\s+from\s+"react-i18next";\s*\r?\n',
    ''
)

# Restore stable, literal navigation labels.
$navPattern = '(?s)const NAV:\s*\{.*?\}\[\]\s*=\s*\[.*?\];'
$navReplacement = @'
const NAV: {
  to: string;
  label: string;
  icon: any;
  search?: Record<string, string>;
}[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/products", label: "Products", icon: Package },
  { to: "/employees", label: "Employees", icon: UserPlus },
  { to: "/payroll", label: "Payroll", icon: BarChart3 },
  { to: "/shifts", label: "Shifts", icon: Clock },
  { to: "/devices", label: "POS Devices", icon: Monitor },
  { to: "/settings", label: "Settings", icon: Settings },
];
'@

if ([regex]::IsMatch($app, $navPattern)) {
    $app = [regex]::Replace($app, $navPattern, $navReplacement, 1)
} else {
    throw "Could not locate the NAV block in AppShell.tsx. No AppShell changes were saved."
}

# Remove startup calls if present.
$app = [regex]::Replace(
    $app,
    '(?m)^\s*const\s+\{\s*t\s*\}\s*=\s*useTranslation\(\);\s*\r?\n',
    ''
)
$app = [regex]::Replace(
    $app,
    '(?m)^\s*useStoreLanguageSync\(\);\s*\r?\n',
    ''
)

# Replace the one-line appearance initializer with a crash-safe initializer.
$safeTheme = @'
  // Appearance preferences must never be able to crash the owner dashboard.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    try {
      cleanup = initializeUiPreferences();
    } catch (error) {
      console.error("SEZA appearance startup failed; using the light fallback.", error);
      document.documentElement.classList.remove("dark");
      document.documentElement.dataset.uiDensity = "comfortable";
      document.documentElement.dataset.uiText = "normal";
      document.documentElement.dataset.uiTouch = "false";
    }
    return () => cleanup?.();
  }, []);
'@

if ($app -match 'useEffect\(\(\)\s*=>\s*initializeUiPreferences\(\),\s*\[\]\);') {
    $app = [regex]::Replace(
        $app,
        '^\s*useEffect\(\(\)\s*=>\s*initializeUiPreferences\(\),\s*\[\]\);\s*$',
        $safeTheme,
        [System.Text.RegularExpressions.RegexOptions]::Multiline
    )
}
elseif ($app -notmatch 'Appearance preferences must never be able to crash') {
    throw "Could not locate the appearance initializer. No AppShell changes were saved."
}

# Convert any remaining translated shell labels to the stable literal labels.
$replacements = @{
    'aria-label={t(item.labelKey)}' = 'aria-label={item.label}'
    '<span className="hidden lg:inline">{t(item.labelKey)}</span>' = '<span className="hidden lg:inline">{item.label}</span>'
    'label={t("common.home")}' = 'label="Home"'
    'label={t("nav.sales")}' = 'label="Sales"'
    'label={t("common.staff")}' = 'label="Staff"'
    '{t("common.more")}' = 'More'
    '<Icon className="size-4 mr-2" /> {t(item.labelKey)}' = '<Icon className="size-4 mr-2" /> {item.label}'
}

foreach ($entry in $replacements.GetEnumerator()) {
    $app = $app.Replace($entry.Key, $entry.Value)
}

# Final safety checks.
if ($app -match 'useStoreLanguageSync\(\)' -or
    $app -match 'useTranslation\(\)' -or
    $app -match 'labelKey') {
    throw "Old dashboard startup/navigation references still remain. No AppShell changes were saved."
}

Save-Utf8 $appShellPath $app

Write-Host ""
Write-Host "SEZA dashboard recovery V2 applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Backups created:" -ForegroundColor Cyan
Write-Host "  $marketingPath.$timestamp.bak"
Write-Host "  $appShellPath.$timestamp.bak"
Write-Host ""
Write-Host "Now run:" -ForegroundColor Yellow
Write-Host "  bun run build"
Write-Host ""
