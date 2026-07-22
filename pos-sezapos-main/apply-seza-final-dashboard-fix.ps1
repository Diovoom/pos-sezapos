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

function Ensure-Import(
    [string]$Content,
    [string]$ImportLine,
    [string]$AfterPattern
) {
    if ($Content.Contains($ImportLine)) {
        return $Content
    }

    $match = [regex]::Match($Content, $AfterPattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if (-not $match.Success) {
        throw "Could not find where to add: $ImportLine"
    }

    return $Content.Insert($match.Index + $match.Length, "`r`n$ImportLine")
}

$paths = @{
    Marketing = Join-Path $ProjectRoot "src\components\marketing\MarketingShell.tsx"
    AppShell = Join-Path $ProjectRoot "src\components\pos\AppShell.tsx"
    Branding = Join-Path $ProjectRoot "src\hooks\useStoreBranding.ts"
    Language = Join-Path $ProjectRoot "src\hooks\useStoreLanguageSync.ts"
    Preferences = Join-Path $ProjectRoot "src\lib\ui-preferences.ts"
}

foreach ($p in $paths.Values) {
    Require-File $p
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
foreach ($p in $paths.Values) {
    Copy-Item -LiteralPath $p -Destination "$p.$timestamp.bak"
}

# ---------------------------------------------------------------------------
# 1. Marketing website remains open. Owner auth opens in a separate tab.
# ---------------------------------------------------------------------------
$marketing = Get-Content -LiteralPath $paths.Marketing -Raw

$marketing = [regex]::Replace(
    $marketing,
    '<a\s+href=\{dashboardUrl\("/auth"\)\}(?![^>]*target=)',
    '<a href={dashboardUrl("/auth")} target="_blank" rel="noopener noreferrer"'
)

$marketing = [regex]::Replace(
    $marketing,
    '<a\s+href=\{dashboardUrl\("/signup"\)\}(?![^>]*target=)',
    '<a href={dashboardUrl("/signup")} target="_blank" rel="noopener noreferrer"'
)

Save-Utf8 $paths.Marketing $marketing

# ---------------------------------------------------------------------------
# 2. Fix the exact Supabase crash:
#    Two mounted StoreLogo components were reusing the same Realtime channel.
#    Supabase then received .on(postgres_changes) after that channel subscribed.
#    Give every hook instance a unique topic.
# ---------------------------------------------------------------------------
$branding = Get-Content -LiteralPath $paths.Branding -Raw

$branding = $branding.Replace(
    '.channel(`store-branding:${storeId}`)',
    '.channel(`store-branding:${storeId}:${Math.random().toString(36).slice(2)}`)'
)

if (-not $branding.Contains('store-branding:${storeId}:${Math.random().toString(36).slice(2)}')) {
    throw "Could not patch the store-branding Realtime channel."
}

Save-Utf8 $paths.Branding $branding

# Prevent the same duplicate-topic problem in store language sync.
$language = Get-Content -LiteralPath $paths.Language -Raw

$language = $language.Replace(
    '.channel(`store-language:${storeId}`)',
    '.channel(`store-language:${storeId}:${Math.random().toString(36).slice(2)}`)'
)

if (-not $language.Contains('store-language:${storeId}:${Math.random().toString(36).slice(2)}')) {
    throw "Could not patch the store-language Realtime channel."
}

Save-Utf8 $paths.Language $language

# ---------------------------------------------------------------------------
# 3. Start the owner dashboard in white once, while keeping Appearance controls.
#    V3 intentionally ignores the previously saved broken/system theme value.
# ---------------------------------------------------------------------------
$preferences = Get-Content -LiteralPath $paths.Preferences -Raw
$preferences = $preferences.Replace(
    'const KEY = "seza.ui.preferences.v2";',
    'const KEY = "seza.ui.preferences.v3";'
)
$preferences = [regex]::Replace(
    $preferences,
    'theme:\s*"system",',
    'theme: "light",',
    1
)

if (-not $preferences.Contains('const KEY = "seza.ui.preferences.v3";')) {
    throw "Could not migrate the appearance preference key."
}

Save-Utf8 $paths.Preferences $preferences

# ---------------------------------------------------------------------------
# 4. Restore dashboard language sync and translated navigation if the V2
#    recovery script temporarily removed them.
# ---------------------------------------------------------------------------
$app = Get-Content -LiteralPath $paths.AppShell -Raw

$app = Ensure-Import `
    $app `
    'import { useStoreLanguageSync } from "@/hooks/useStoreLanguageSync";' `
    '(?m)^import \{ initializeUiPreferences \} from "@/lib/ui-preferences";$'

$app = Ensure-Import `
    $app `
    'import { useTranslation } from "react-i18next";' `
    '(?m)^import \{ useStoreLanguageSync \} from "@/hooks/useStoreLanguageSync";$'

$navPattern = '(?s)const NAV:\s*\{.*?\}\[\]\s*=\s*\[.*?\];'
$navReplacement = @'
const NAV: {
  to: string;
  labelKey: string;
  icon: any;
  search?: Record<string, string>;
}[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/sales", labelKey: "nav.sales", icon: Receipt },
  { to: "/products", labelKey: "nav.products", icon: Package },
  { to: "/employees", labelKey: "nav.employees", icon: UserPlus },
  { to: "/payroll", labelKey: "nav.payroll", icon: BarChart3 },
  { to: "/shifts", labelKey: "nav.shifts", icon: Clock },
  { to: "/devices", labelKey: "nav.devices", icon: Monitor },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];
'@

if ([regex]::IsMatch($app, $navPattern)) {
    $app = [regex]::Replace($app, $navPattern, $navReplacement, 1)
} else {
    throw "Could not restore the dashboard navigation block."
}

if ($app -notmatch 'const\s+\{\s*t\s*\}\s*=\s*useTranslation\(\);') {
    $app = [regex]::Replace(
        $app,
        '(?m)^(\s*const\s+\{\s*data:\s*me\s*\}\s*=\s*useMe\(\);\s*)$',
        '$1' + "`r`n  const { t } = useTranslation();",
        1
    )
}

if ($app -notmatch 'useStoreLanguageSync\(\);') {
    $app = [regex]::Replace(
        $app,
        '(?m)^(\s*const\s+\{\s*t\s*\}\s*=\s*useTranslation\(\);\s*)$',
        '$1' + "`r`n  useStoreLanguageSync();",
        1
    )
}

# Stable crash-safe appearance initializer.
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
        '(?m)^\s*useEffect\(\(\)\s*=>\s*initializeUiPreferences\(\),\s*\[\]\);\s*$',
        $safeTheme,
        1
    )
}
elseif ($app -notmatch 'Appearance preferences must never be able to crash') {
    $app = [regex]::Replace(
        $app,
        '(?m)^(\s*useStoreLanguageSync\(\);\s*)$',
        '$1' + "`r`n`r`n$safeTheme",
        1
    )
}

# Restore translated labels.
$app = $app.Replace('aria-label={item.label}', 'aria-label={t(item.labelKey)}')
$app = $app.Replace(
    '<span className="hidden lg:inline">{item.label}</span>',
    '<span className="hidden lg:inline">{t(item.labelKey)}</span>'
)
$app = $app.Replace('label="Home"', 'label={t("common.home")}')
$app = $app.Replace('label="Sales"', 'label={t("nav.sales")}')
$app = $app.Replace('label="Staff"', 'label={t("common.staff")}')
$app = $app.Replace('<Icon className="size-4 mr-2" /> {item.label}', '<Icon className="size-4 mr-2" /> {t(item.labelKey)}')

# Replace only standalone More labels inside JSX.
$app = [regex]::Replace(
    $app,
    '(?m)^(\s*)More(\s*)$',
    '$1{t("common.more")}$2'
)

if ($app -notmatch 'useStoreLanguageSync\(\);' -or
    $app -notmatch 'useTranslation\(\)' -or
    $app -notmatch 'labelKey') {
    throw "Dashboard language/navigation restoration did not complete."
}

Save-Utf8 $paths.AppShell $app

Write-Host ""
Write-Host "SEZA FINAL dashboard fix applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Fixed:" -ForegroundColor Cyan
Write-Host "  - Supabase store-branding dashboard crash"
Write-Host "  - duplicate store-language Realtime channel"
Write-Host "  - white default dashboard appearance"
Write-Host "  - live language/navigation sync"
Write-Host "  - marketing Sign In opens owner portal separately"
Write-Host ""
Write-Host "Now run:" -ForegroundColor Yellow
Write-Host "  bun run build"
Write-Host ""
