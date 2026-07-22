// Native-mode detection for the Capacitor Android WebView.
//
// The Android app launches at `/auth?native=1`; we persist that flag in
// localStorage so subsequent navigations stay in "native" mode. We also
// detect the Capacitor global directly when present. Any route outside the
// employee POS surface is redirected back to `/auth` so store staff never
// see marketing, pricing, or owner-only dashboards.

const KEY = "pos.native.mode";

export function detectAndPersistNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Capacitor injects window.Capacitor when running inside a native shell.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    const isCapacitor = !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform();
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("native");
    if (flag === "1" || isCapacitor) {
      window.localStorage.setItem(KEY, "1");
    }
    // Clean the query param so it doesn't leak into shared links.
    if (flag !== null) {
      url.searchParams.delete("native");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + url.hash);
    }
    return window.localStorage.getItem(KEY) === "1" || isCapacitor;
  } catch {
    return false;
  }
}

export function isNativeMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return true;
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// Paths the Android POS app is allowed to render. Anything else redirects
// to /auth. Prefix match; also allow exact "/auth" and receipt shares.
const ALLOWED_PREFIXES = [
  "/auth",
  "/pos",
  "/register",
  "/refunds",
  "/timeclock",
  "/inventory",
  "/customers",
  "/products",
  "/shifts",
  "/settings",
  "/onboarding",
  "/reset-password",
  "/r/",
];

// Explicitly blocked in native mode (owner surfaces, marketing, admin).
const BLOCKED_PREFIXES = [
  "/dashboard",
  "/reports",
  "/payroll",
  "/employees",
  "/sales",
  "/admin",
  "/pricing",
  "/features",
  "/about",
  "/contact",
  "/blog",
  "/signup",
  "/careers",
  "/industries",
  "/integrations",
  "/hardware",
  "/faq",
  "/security",
  "/trust",
  "/support",
  "/status",
  "/select-plan",
  "/legal",
  "/privacy",
  "/terms",
  "/refund",
  "/unsubscribe",
];

export function isPathAllowedInNative(pathname: string): boolean {
  if (pathname === "/") return false;
  if (BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}
