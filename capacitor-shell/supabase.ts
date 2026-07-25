// Standalone Supabase client for the bundled Capacitor Android app.
import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://xbirnlsbckbcjbxqkmjn.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_D06VufRmNrbKI6Fe0OF70Q_Wzr5pkBn";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  FALLBACK_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
  )?.trim() || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

if (!/^https:\/\//i.test(SUPABASE_URL)) {
  throw new Error("SEZA Android configuration error: invalid Supabase URL.");
}
if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "SEZA Android configuration error: missing Supabase publishable key.",
  );
}
if (SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")) {
  throw new Error(
    "SEZA Android security error: a secret Supabase key cannot be bundled in the APK.",
  );
}

function isOpaqueKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

const patchedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request
      ? input.headers
      : undefined,
  );
  if (init?.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }
  if (
    isOpaqueKey(SUPABASE_PUBLISHABLE_KEY) &&
    headers.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
  ) {
    headers.delete("Authorization");
  }
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("SEZA request timed out"), 15_000);
  if (init?.signal) {
    if (init.signal.aborted) controller.abort(init.signal.reason);
    else init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason), { once: true });
  }

  return fetch(input, { ...init, headers, signal: controller.signal })
    .catch((error) => {
      console.error("[SEZA Android] Supabase request failed", {
        url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        error,
      });
      throw error;
    })
    .finally(() => window.clearTimeout(timeoutId));
};

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storageKey: "seza-native-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: { fetch: patchedFetch },
  },
);

export const API_BASE_URL = "https://sezapos.com";

export async function getBearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
