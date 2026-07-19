// Standalone Supabase client for the bundled Capacitor Android app.
//
// This client is intentionally separate from src/integrations/supabase/client.ts
// because the Android shell is a static bundle with NO server, NO SSR, and
// NO server functions. All backend access is:
//
//   1. Direct Supabase (auth + RLS-scoped data reads/writes), OR
//   2. Explicit HTTPS calls to https://sezapos.com/api/public/* endpoints
//      using a bearer token from the Supabase session.
//
// Auth persists in localStorage inside the Capacitor WebView, so employees
// stay signed in across app launches.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function isNewKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

// sb_ keys are opaque, not JWTs — strip the redundant Authorization header
// the Supabase JS client adds by default, mirroring src/integrations/supabase/client.ts.
const patchedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
  );
  if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (
    isNewKey(SUPABASE_PUBLISHABLE_KEY) &&
    headers.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
  ) {
    headers.delete("Authorization");
  }
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Distinct storage key so the bundled shell never collides with the web
    // app's session if both are ever loaded in the same origin during dev.
    storageKey: "seza-native-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: { fetch: patchedFetch },
});

// Base URL for future authenticated calls into the deployed backend
// (e.g. server functions or public API routes). Kept as a constant so
// offline mode can later swap it or queue requests against it.
export const API_BASE_URL = "https://sezapos.com";

export async function getBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
