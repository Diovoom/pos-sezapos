import { createHmac, timingSafeEqual } from "node:crypto";

type Grant = { purpose: string; expires: number; [key: string]: unknown };
function signature(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server authorization is unavailable");
  return createHmac("sha256", secret).update(`seza-pos-grant-v1:${payload}`).digest();
}

/** Opaque proof of a successful server-side verification; never a substitute for current membership checks. */
export function issuePosGrant(purpose: string, claims: Record<string, unknown>, ttlSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, purpose, expires: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyPosGrant(token: unknown, purpose: string): Grant {
  if (typeof token !== "string" || token.length > 4096) throw new Error("Employee authorization expired. Enter your PIN again.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid employee authorization");
  const expected = signature(parts[0]);
  const received = Buffer.from(parts[1], "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Invalid employee authorization");
  const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Grant;
  if (claims.purpose !== purpose || !Number.isFinite(claims.expires) || claims.expires <= Date.now()) throw new Error("Employee authorization expired. Enter your PIN again.");
  return claims;
}
