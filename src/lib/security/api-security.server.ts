import { RateLimitError, consumeRateLimit, getClientIp } from "./rate-limit.server";

export type ApiGuardOptions = {
  scope: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
  maxBodyBytes?: number;
  allowMissingOrigin?: boolean;
  skipOriginCheck?: boolean;
  identifier?: string;
};

const DEFAULT_ALLOWED_HOSTS = [
  "sezapos.com",
  "www.sezapos.com",
  "dashboard.sezapos.com",
  "admin.sezapos.com",
  "pos.sezapos.com",
];

const NATIVE_ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
];

function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // Ignore malformed request URL; the platform normally guarantees one.
  }
  for (const host of DEFAULT_ALLOWED_HOSTS) {
    origins.add(`https://${host}`);
  }
  for (const origin of NATIVE_ALLOWED_ORIGINS) origins.add(origin);
  const configured = process.env.SEZA_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || "";
  for (const raw of configured.split(",")) {
    const origin = raw.trim();
    if (origin) origins.add(origin.replace(/\/$/, ""));
  }
  return origins;
}


async function requestBodyTooLarge(request: Request, maximum: number): Promise<boolean> {
  const rawLength = request.headers.get("content-length");
  if (rawLength) {
    const contentLength = Number(rawLength);
    if (Number.isFinite(contentLength) && contentLength >= 0) {
      return contentLength > maximum;
    }
  }

  if (request.method === "GET" || request.method === "HEAD" || !request.body) return false;

  // Some proxies use chunked transfer encoding and omit Content-Length. Read a
  // clone only up to the configured ceiling so that those requests cannot
  // bypass the size guard. The original request remains available to the route.
  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel("SEZA request body limit exceeded");
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function isLovablePreviewOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "lovable.app" || host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com");
  } catch {
    return false;
  }
}

export async function guardApiRequest(
  request: Request,
  options: ApiGuardOptions,
): Promise<Response | null> {
  if (!options.skipOriginCheck) {
    const origin = request.headers.get("origin");
    if (!origin) {
      if (options.allowMissingOrigin === false) {
        return Response.json({ error: "Origin required" }, { status: 403, headers: securityHeaders() });
      }
    } else if (!allowedOrigins(request).has(origin.replace(/\/$/, "")) && !isLovablePreviewOrigin(origin)) {
      return Response.json({ error: "Origin not allowed" }, { status: 403, headers: securityHeaders() });
    }
  }

  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
  if (await requestBodyTooLarge(request, maxBodyBytes)) {
    return Response.json(
      { error: "Request body too large" },
      { status: 413, headers: securityHeaders() },
    );
  }

  const result = await consumeRateLimit({
    scope: options.scope,
    limit: options.limit,
    windowSeconds: options.windowSeconds,
    blockSeconds: options.blockSeconds,
    identifier: options.identifier || `${getClientIp(request)}:${new URL(request.url).pathname}`,
    request,
  });

  if (!result.allowed) {
    const error = new RateLimitError(result.retryAfterSeconds);
    return Response.json(
      { error: error.message, retry_after_seconds: error.retryAfterSeconds },
      {
        status: 429,
        headers: securityHeaders({
          "retry-after": String(error.retryAfterSeconds),
        }),
      },
    );
  }

  return null;
}

export function securityHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("cache-control", headers.get("cache-control") || "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return headers;
}
