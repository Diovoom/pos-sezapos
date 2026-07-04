// Cross-subdomain single sign-on for *.sezapos.com.
//
// Supabase persists the auth session in localStorage, which is scoped per
// origin. Signing in on sezapos.com does NOT sign you in on
// dashboard.sezapos.com or pos.sezapos.com. To make the three subdomains
// feel like one app, we mirror the current session to a cookie scoped to
// `.sezapos.com` (readable from every subdomain), and on load we restore
// that cookie into localStorage when no session exists locally.
//
// No-op on non-sezapos.com hosts (previews, localhost, lovable.app).

import { supabase } from "./client";
import { isSezaposHost } from "@/lib/host";

const COOKIE_NAME = "sb-shared-session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ROOT_DOMAIN = "sezapos.com";

function writeCookie(name: string, value: string, maxAgeSec: number) {
  if (typeof document === "undefined") return;
  const attrs = [
    `${name}=${value}`,
    `Domain=.${ROOT_DOMAIN}`,
    "Path=/",
    `Max-Age=${maxAgeSec}`,
    "SameSite=Lax",
    "Secure",
  ];
  document.cookie = attrs.join("; ");
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Domain=.${ROOT_DOMAIN}; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

let installed = false;

export function installSessionBridge(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (!isSezaposHost()) return; // only for the three subdomains
  installed = true;

  // Restore from shared cookie if we don't have a local session yet.
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // We're already signed in locally; sync our session out to the cookie.
        syncSessionToCookie(data.session.access_token, data.session.refresh_token);
        return;
      }
      const raw = readCookie(COOKIE_NAME);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
      if (!parsed.access_token || !parsed.refresh_token) return;
      await supabase.auth.setSession({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      });
    } catch {
      // stale/corrupt cookie — clear it and let user sign in fresh
      clearCookie(COOKIE_NAME);
    }
  })();

  // Keep the shared cookie in sync with local session changes.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      clearCookie(COOKIE_NAME);
      return;
    }
    if (
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "USER_UPDATED" ||
      event === "INITIAL_SESSION"
    ) {
      syncSessionToCookie(session.access_token, session.refresh_token);
    }
  });
}

function syncSessionToCookie(access_token: string, refresh_token: string) {
  const value = encodeURIComponent(JSON.stringify({ access_token, refresh_token }));
  writeCookie(COOKIE_NAME, value, COOKIE_MAX_AGE);
}
