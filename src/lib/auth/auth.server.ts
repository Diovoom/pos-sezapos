import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function isOpaqueKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function apiFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (isOpaqueKey(key) && headers.get("authorization") === `Bearer ${key}`) {
      headers.delete("authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export function createPublicAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Authentication is temporarily unavailable.");
  if (key.startsWith("sb_secret_")) {
    throw new Error("Authentication configuration error: use a publishable key for public auth.");
  }
  return createClient<Database>(url, key, {
    global: { fetch: apiFetch(key) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function safeDashboardOrigin(request: Request): string {
  const configured = process.env.PUBLIC_DASHBOARD_URL || process.env.VITE_DASHBOARD_URL || "";
  const candidates = [configured, new URL(request.url).origin];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol === "https:" &&
        (host === "sezapos.com" ||
          host.endsWith(".sezapos.com"))
      ) {
        return url.origin;
      }
      if (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1")) {
        return url.origin;
      }
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("Authentication redirect is not configured.");
}
