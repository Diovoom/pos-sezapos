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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const routedRequest = rewriteKeyyBeautyHtmlRequest(request);
      const response = await handler.fetch(routedRequest, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return applySearchIndexPolicy(request, normalized);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
