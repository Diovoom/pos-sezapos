// Host-aware helpers for the subdomain split:
//   sezapos.com            → marketing
//   dashboard.sezapos.com  → merchant dashboard
//   pos.sezapos.com        → POS register
//
// Anything else (preview, localhost, lovable.app) is treated as "unknown" and
// the app behaves as a single monolith at path prefixes — nothing redirects.

export type AppSurface = "marketing" | "dashboard" | "pos" | "unknown";

const ROOT_DOMAIN = "sezapos.com";

export function getAppFromHost(host: string | null | undefined): AppSurface {
  if (!host) return "unknown";
  const h = host.toLowerCase().split(":")[0];
  if (h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}`) return "marketing";
  if (h === `dashboard.${ROOT_DOMAIN}`) return "dashboard";
  if (h === `admin.${ROOT_DOMAIN}`) return "dashboard";
  if (h === `pos.${ROOT_DOMAIN}`) return "pos";
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
  const h = (host ?? currentHost() ?? "").toLowerCase().split(":")[0];
  return h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`);
}

/** Build an absolute URL on a specific subdomain, preserving the current
 *  protocol. When we're not on a sezapos.com host (previews, localhost),
 *  return a relative path so nothing jumps off-origin. */
function buildUrl(sub: "" | "dashboard" | "pos", path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") {
    // On the server we don't emit absolute cross-host links; the client
    // will re-render with the real host and pick the right URL.
    return p;
  }
  if (!isSezaposHost()) return p;
  const proto = window.location.protocol; // "https:" or "http:"
  const host = sub ? `${sub}.${ROOT_DOMAIN}` : ROOT_DOMAIN;
  return `${proto}//${host}${p}`;
}

export const marketingUrl = (path: string = "/") => buildUrl("", path);
export const dashboardUrl = (path: string = "/") => buildUrl("dashboard", path);
export const posUrl = (path: string = "/") => buildUrl("pos", path);
