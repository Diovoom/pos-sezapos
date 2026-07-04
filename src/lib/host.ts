// Single-domain mode. Subdomain routing was removed — every URL helper
// returns a relative path and every app-surface check reports "unknown".
// These exports are kept so existing imports continue to compile.

export type AppSurface = "marketing" | "dashboard" | "pos" | "unknown";

export function getAppFromHost(_host: string | null | undefined): AppSurface {
  return "unknown";
}

export function currentHost(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.host;
}

export function currentApp(): AppSurface {
  return "unknown";
}

export function isSezaposHost(_host?: string | null): boolean {
  return false;
}

function rel(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export const marketingUrl = (path: string = "/") => rel(path);
export const dashboardUrl = (path: string = "/dashboard") => rel(path);
export const posUrl = (path: string = "/pos") => rel(path);
