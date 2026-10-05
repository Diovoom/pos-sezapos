import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachDualAuth } from "@/integrations/supabase/auth-attacher-dual";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const SENSITIVE_APP_HOSTS = new Set([
  "dashboard.sezapos.com",
  "admin.sezapos.com",
  "pos.sezapos.com",
]);

const NOINDEX_HOSTS = new Set([
  ...SENSITIVE_APP_HOSTS,
  "keyybeauty.sezapos.com",
]);

const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();

  if (
    url.protocol === "https:" &&
    (hostname === "sezapos.com" || hostname.endsWith(".sezapos.com"))
  ) {
    setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  setResponseHeader("X-Content-Type-Options", "nosniff");
  setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (NOINDEX_HOSTS.has(hostname)) {
    setResponseHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  if (SENSITIVE_APP_HOSTS.has(hostname)) {
    setResponseHeader("Cache-Control", "no-store");
    setResponseHeader("X-Frame-Options", "DENY");
    setResponseHeader("Content-Security-Policy", "frame-ancestors 'none'");
  }

  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, attachDualAuth],
  // Keep securityHeadersMiddleware outermost so it also hardens error responses
  // returned by errorMiddleware.
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));
