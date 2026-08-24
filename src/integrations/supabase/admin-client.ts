// Separate Supabase client for the Platform Admin surface.
// Uses a DIFFERENT localStorage storageKey than the merchant client so
// Platform Admin sessions are fully isolated from Marketing / Merchant
// Dashboard / POS sessions on the same origin.
//
// Signing in or out here never touches the merchant session, and vice
// versa. Only ever used by /admin/* routes and admin auth.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const ADMIN_STORAGE_KEY = "sb-seza-admin-auth";

function isOpaqueSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function assertBrowserSafeKey(value: string): void {
  if (value.startsWith("sb_secret_")) {
    throw new Error(
      "Security configuration error: the admin browser received a secret Supabase key.",
    );
  }
}

function createAdminFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isOpaqueSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createAdminClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase env vars for admin client.");
  }
  assertBrowserSafeKey(SUPABASE_PUBLISHABLE_KEY);

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createAdminFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      flowType: "implicit",
      detectSessionInUrl: true,
      storageKey: ADMIN_STORAGE_KEY,
    },
  });
}

let _client: ReturnType<typeof createAdminClient> | undefined;

export const supabaseAdminAuth = new Proxy({} as ReturnType<typeof createAdminClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createAdminClient();
    return Reflect.get(_client, prop, receiver);
  },
});
