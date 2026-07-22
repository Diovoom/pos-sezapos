export type AppSurface =
  "marketing" | "dashboard" | "admin" | "pos" | "unknown";

const MARKETING_HOSTS = new Set(["sezapos.com", "www.sezapos.com"]);
const DASHBOARD_HOST = "dashboard.sezapos.com";
const ADMIN_HOST = "admin.sezapos.com";
const LEGACY_POS_HOST = "pos.sezapos.com";

function hostnameOnly(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().split(":")[0] ?? "";
}

export function getAppFromHost(host: string | null | undefined): AppSurface {
  const name = hostnameOnly(host);
  if (MARKETING_HOSTS.has(name)) return "marketing";
  if (name === DASHBOARD_HOST) return "dashboard";
  if (name === ADMIN_HOST) return "admin";
  if (name === LEGACY_POS_HOST) return "pos";
  return "unknown";
}

export function currentHost(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.host;
}

export function currentApp(): AppSurface {
  return getAppFromHost(currentHost());
}

export function isSezaposHost(host?: string | null): boolean {
  return getAppFromHost(host ?? currentHost()) !== "unknown";
}

function rel(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function urlFor(host: string, path: string): string {
  const normalizedPath = rel(path);
  // Keep localhost and hosted preview navigation inside the current origin.
  // Production custom domains use explicit cross-subdomain URLs.
  if (currentApp() === "unknown") return normalizedPath;
  return `https://${host}${normalizedPath}`;
}

export const marketingUrl = (path: string = "/") => urlFor("sezapos.com", path);
export const dashboardUrl = (path: string = "/dashboard") =>
  urlFor(DASHBOARD_HOST, path);

// The browser POS surface is retired. Keep this helper for old imports, but
// send browser traffic to the owner dashboard. The native Capacitor shell uses
// its own memory router and is not affected by this production-host helper.
export const posUrl = (path: string = "/dashboard") =>
  dashboardUrl(path === "/pos" ? "/dashboard" : path);
