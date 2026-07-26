import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RateLimitOptions = {
  scope: string;
  limit: number;
  windowSeconds: number;
  identifier?: string | null;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  source: "database" | "memory";
};

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();
let lastCleanup = 0;
const warningTimestamps = new Map<string, number>();

function clientAddress(request: Request): string {
  const forwarded =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";
  return forwarded.split(",")[0]?.trim().slice(0, 100) || "unknown";
}

function normalizeScope(scope: string): string {
  return scope
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, "-")
    .slice(0, 100);
}

function bucketHash(request: Request, options: RateLimitOptions): string {
  const rawIdentifier = options.identifier?.trim().slice(0, 300) || "anonymous";
  const material = [normalizeScope(options.scope), clientAddress(request), rawIdentifier].join("|");
  return createHash("sha256").update(material).digest("hex");
}

function memoryFallback(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  if (now - lastCleanup > 60_000) {
    lastCleanup = now;
    for (const [bucketKey, bucket] of memoryBuckets) {
      if (bucket.resetAt <= now) memoryBuckets.delete(bucketKey);
    }
  }

  const existing = memoryBuckets.get(key);
  const bucket =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + windowSeconds * 1000 }
      : existing;
  bucket.count += 1;
  memoryBuckets.set(key, bucket);

  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    source: "memory",
  };
}

/**
 * Database-backed fixed-window limiter for public/server-role endpoints.
 *
 * The database RPC is the source of truth across server instances. The
 * in-memory fallback avoids turning a temporary migration/database problem
 * into a full login outage, but it is intentionally more conservative and is
 * not a replacement for applying the included migration.
 */
export async function checkPublicRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const scope = normalizeScope(options.scope);
  const limit = Math.max(1, Math.min(10_000, Math.floor(options.limit)));
  const windowSeconds = Math.max(1, Math.min(86_400, Math.floor(options.windowSeconds)));
  const keyHash = bucketHash(request, { ...options, scope });

  try {
    const { data, error } = await (supabaseAdmin.rpc as any)("consume_public_rate_limit", {
      p_scope: scope,
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") throw new Error("Invalid rate-limit response");
    return {
      allowed: row.allowed,
      remaining: Math.max(0, Number(row.remaining ?? 0)),
      retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds ?? 0)),
      source: "database",
    };
  } catch (error) {
    const now = Date.now();
    const previousWarning = warningTimestamps.get(scope) ?? 0;
    if (now - previousWarning > 60_000) {
      warningTimestamps.set(scope, now);
      console.warn("[security] database rate limiter unavailable; using process-local fallback", {
        scope,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    return memoryFallback(`${scope}:${keyHash}`, limit, windowSeconds);
  }
}

export function rateLimitResponse(
  result: RateLimitResult,
  message = "Too many requests. Please wait and try again.",
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "retry-after": String(Math.max(1, result.retryAfterSeconds)),
      ...extraHeaders,
    },
  });
}
