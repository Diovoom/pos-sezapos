import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const KEYY_BEAUTY_HOST = "keyybeauty.sezapos.com";
const KEYY_BEAUTY_ROUTE = "/dahv-yzg-xk";

function rewriteKeyyBeautyHtmlRequest(request: Request): Request {
  if (request.method !== "GET") return request;

  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== KEYY_BEAUTY_HOST) return request;

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/html")) return request;

  // Internal rewrite only: the browser keeps showing keyybeauty.sezapos.com.
  // Any HTML navigation on this host stays inside the Keyy Beauty microsite.
  if (url.pathname !== KEYY_BEAUTY_ROUTE) {
    url.pathname = KEYY_BEAUTY_ROUTE;
  }

  return new Request(url, request);
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"}  -  try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function applySearchIndexPolicy(request: Request, response: Response): Response {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const noindexHost =
    hostname === "dashboard.sezapos.com" ||
    hostname === "admin.sezapos.com" ||
    hostname === "pos.sezapos.com" ||
    hostname === KEYY_BEAUTY_HOST;

  if (!noindexHost) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const EDGE_ALLOWED_ORIGINS = new Set([
  "https://sezapos.com",
  "https://www.sezapos.com",
  "https://dashboard.sezapos.com",
  "https://admin.sezapos.com",
  "https://pos.sezapos.com",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
]);

function configuredAllowedOrigins(): Set<string> {
  const origins = new Set(EDGE_ALLOWED_ORIGINS);
  const configured = process.env.SEZA_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || "";
  for (const raw of configured.split(",")) {
    const origin = raw.trim().replace(/\/$/, "");
    if (origin) origins.add(origin);
  }
  return origins;
}

function appendVary(headers: Headers, value: string) {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", value);
    return;
  }
  const values = current
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!values.includes(value.toLowerCase())) {
    headers.set("Vary", `${current}, ${value}`);
  }
}

function applyEdgeSecurityPolicy(request: Request, response: Response): Response {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const headers = new Headers(response.headers);

  if (
    url.protocol === "https:" &&
    (hostname === "sezapos.com" || hostname.endsWith(".sezapos.com"))
  ) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  const contentType = headers.get("content-type") ?? "";
  const sensitiveHtmlHost =
    hostname === "dashboard.sezapos.com" ||
    hostname === "admin.sezapos.com" ||
    hostname === "pos.sezapos.com";

  if (url.pathname.startsWith("/api/") || (sensitiveHtmlHost && contentType.includes("text/html"))) {
    headers.set("Cache-Control", "no-store");
  }

  // Account, Admin and POS pages must never be framed by another site. This
  // removes a common credential-overlay / clickjacking path without changing
  // scripts, OAuth redirects, APIs or native POS networking.
  if (sensitiveHtmlHost && contentType.includes("text/html")) {
    headers.set("X-Frame-Options", "DENY");
    const currentCsp = headers.get("Content-Security-Policy")?.trim();
    if (!currentCsp) {
      headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    } else if (!/\bframe-ancestors\b/i.test(currentCsp)) {
      headers.set(
        "Content-Security-Policy",
        `${currentCsp.replace(/;?\s*$/, "")}; frame-ancestors 'none'`,
      );
    }
  }

  // Several route handlers still emit Access-Control-Allow-Origin: *.
  // Tighten that at the Cloudflare Worker boundary so browsers can only read
  // those API responses from SEZA's known web/native origins.
  if (headers.get("Access-Control-Allow-Origin") === "*") {
    const origin = request.headers.get("Origin")?.replace(/\/$/, "") ?? "";
    if (origin && configuredAllowedOrigins().has(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      appendVary(headers, "Origin");
    } else {
      headers.delete("Access-Control-Allow-Origin");
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const routedRequest = rewriteKeyyBeautyHtmlRequest(request);
      const response = await handler.fetch(routedRequest, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const indexed = applySearchIndexPolicy(request, normalized);
      return applyEdgeSecurityPolicy(request, indexed);
    } catch (error) {
      console.error(error);
      const errorResponse = new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      return applyEdgeSecurityPolicy(
        request,
        applySearchIndexPolicy(request, errorResponse),
      );
    }
  },
};
