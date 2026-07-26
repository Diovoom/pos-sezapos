import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";

export type RateLimitOptions = {
  scope: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
  identifier?: string;
  request?: Request | null;
  /** Use the database-backed limiter. Set false for high-volume authenticated reads. */
  durable?: boolean;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export class RateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please try again later.");
    this.name = "RateLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

type MemoryBucket = {
  count: number;
  startedAt: number;
  blockedUntil: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();
const MAX_MEMORY_BUCKETS = 10_000;
const fallbackWarnings = new Map<string, number>();
let lastDatabaseCleanupAt = 0;

function normalize(value: string): string {
  return value.trim().toLowerCase().slice(0, 512);
}

export function getClientIp(request?: Request | null): string {
  const req = request ?? getRequest();
  if (!req?.headers) return "unknown";
  const direct = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  if (direct) return direct.trim().slice(0, 128);
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0]?.trim() || "unknown").slice(0, 128);
}

export function requestPath(request?: Request | null): string {
  const req = request ?? getRequest();
  try {
    return req ? new URL(req.url).pathname.slice(0, 240) : "unknown";
  } catch {
    return "unknown";
  }
}

function keyHash(scope: string, identifier: string): string {
  return createHash("sha256")
    .update(`${normalize(scope)}:${normalize(identifier)}`)
    .digest("hex");
}

function memoryConsume(
  bucketKey: string,
  limit: number,
  windowSeconds: number,
  blockSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const blockMs = blockSeconds * 1000;
  let bucket = memoryBuckets.get(bucketKey);

  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { count: 1, startedAt: now, blockedUntil: 0 };
    memoryBuckets.set(bucketKey, bucket);
    trimMemoryBuckets(now, windowMs);
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  if (bucket.count >= limit) {
    bucket.blockedUntil = blockMs > 0 ? now + blockMs : bucket.startedAt + windowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds: 0 };
}

function trimMemoryBuckets(now: number, windowMs: number) {
  if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) return;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.blockedUntil < now && now - bucket.startedAt > windowMs * 2) {
      memoryBuckets.delete(key);
    }
    if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) break;
  }
  // A distributed attack can create many active identifiers in one window.
  // Hard-evict the oldest entries so the fallback cannot grow without bound.
  while (memoryBuckets.size > MAX_MEMORY_BUCKETS) {
    const oldest = memoryBuckets.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryBuckets.delete(oldest);
  }
}

/**
 * Atomic, database-backed limiter. The in-memory fallback keeps protection
 * active before the migration is deployed or during a temporary DB issue.
 * Identifiers are SHA-256 hashed before storage, so raw IPs/emails never enter
 * the rate-limit table.
 */
export async function consumeRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const request = options.request ?? getRequest();
  const identifier = options.identifier || `${getClientIp(request)}:${requestPath(request)}`;
  const bucketKey = keyHash(options.scope, identifier);
  const blockSeconds = Math.max(0, options.blockSeconds ?? 0);
  const limit = Math.max(1, Math.floor(options.limit));
  const windowSeconds = Math.max(1, Math.floor(options.windowSeconds));

  if (options.durable !== false) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (supabaseAdmin.rpc as any)("consume_api_rate_limit", {
        p_key_hash: bucketKey,
        p_scope: options.scope.slice(0, 120),
        p_limit: limit,
        p_window_seconds: windowSeconds,
        p_block_seconds: blockSeconds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row.allowed === "boolean") {
        const now = Date.now();
        if (now - lastDatabaseCleanupAt > 60 * 60 * 1000) {
          lastDatabaseCleanupAt = now;
          void Promise.resolve(
            (supabaseAdmin.rpc as any)("cleanup_api_rate_limit_buckets", {}),
          ).catch(() => undefined);
        }
        return {
          allowed: row.allowed,
          remaining: Number(row.remaining ?? 0),
          retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
        };
      }
    } catch (error) {
      // The migration may not be applied yet. Do not disable protection; use a
      // process-local fallback and log only the error class, never identifiers.
      const now = Date.now();
      const lastWarning = fallbackWarnings.get(options.scope) ?? 0;
      if (now - lastWarning > 60_000) {
        fallbackWarnings.set(options.scope, now);
        console.warn("[rate-limit] database limiter unavailable; using fallback", {
          scope: options.scope,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    }
  }

  return memoryConsume(bucketKey, limit, windowSeconds, blockSeconds);
}

export async function enforceRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const result = await consumeRateLimit(options);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
  return result;
}

export function rateLimitResponse(error: unknown): Response | null {
  if (!(error instanceof RateLimitError)) return null;
  return Response.json(
    {
      error: "Too many requests. Please try again later.",
      retry_after_seconds: error.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": String(error.retryAfterSeconds),
      },
    },
  );
}
