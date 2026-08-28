import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { setBackendReachable } from "@/lib/offline/useOnline";

export const SEZA_ANDROID_BUILD_ID = "SEZA-POS-HARDENED-LOCAL-FIRST-2026-08-28-2";

function normalizeUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Native-first HTTP for the installed SEZA POS app.
 * On Android this bypasses WebView fetch/XHR completely and uses the OS
 * networking stack through CapacitorHttp. Browser development keeps fetch.
 */
export async function nativeFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (!Capacitor.isNativePlatform()) return fetch(input, init);

  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const url = normalizeUrl(input);
  const method = String(init.method || request?.method || "GET").toUpperCase();

  const headers = new Headers(request?.headers);
  if (init.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const nativeHeaders: Record<string, string> = {};
  headers.forEach((value, key) => { nativeHeaders[key] = value; });

  let body: unknown = init.body;
  if (body == null && request && method !== "GET" && method !== "HEAD") {
    try { body = await request.clone().text(); } catch { body = undefined; }
  }
  if (typeof body === "string" && (headers.get("content-type") || "").includes("application/json")) {
    try { body = JSON.parse(body); } catch { /* keep string */ }
  }

  try {
    const result = await CapacitorHttp.request({
      url,
      method,
      headers: nativeHeaders,
      data: method === "GET" || method === "HEAD" ? undefined : body,
      connectTimeout: 15000,
      readTimeout: 30000,
      responseType: "text",
    });

    // Any HTTP response proves the network path exists. 4xx/5xx is an app or
    // server response, not an Android transport failure.
    setBackendReachable(true);
    const responseHeaders = new Headers();
    Object.entries(result.headers || {}).forEach(([key, value]) => {
      if (value != null) responseHeaders.set(key, String(value));
    });
    const text = typeof result.data === "string" ? result.data : JSON.stringify(result.data ?? null);
    return new Response(text, { status: result.status, headers: responseHeaders });
  } catch (error) {
    setBackendReachable(false);
    throw error;
  }
}

export function userSafeNetworkMessage(): string {
  return "Could not connect to SEZA. Check the internet connection and try again.";
}
