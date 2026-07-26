// Server-only PIN fingerprint + weak-PIN blocklist.
//
// A "fingerprint" is HMAC-SHA256(secret, store_id || ":" || pin). It is a
// keyed one-way value we can safely persist and query on: two employees at
// the same store with the same PIN produce the same fingerprint, but the
// fingerprint reveals nothing about the PIN without the server-only
// PIN_FINGERPRINT_HMAC_SECRET (rotating that secret invalidates every stored
// fingerprint at once, which is the desired kill-switch behaviour).
//
// NEVER expose fingerprints or PINs to the client. Client code only ever
// sends PLAIN PIN over HTTPS; the server hashes locally, computes the
// fingerprint, and stores it.
import { createHmac } from "node:crypto";

// Common trivially-guessable 6-digit PINs. Kept intentionally short; the
// real defence is store-scoped uniqueness + rate limiting.
const WEAK_PINS = new Set<string>([
  "000000",
  "111111",
  "222222",
  "333333",
  "444444",
  "555555",
  "666666",
  "777777",
  "888888",
  "999999",
  "123456",
  "654321",
  "121212",
  "112233",
  "123123",
  "159753",
  "147258",
  "789456",
  "456789",
  "987654",
  "012345",
  "543210",
  "111222",
  "222111",
  "101010",
  "202020",
]);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

export function pinFingerprint(storeId: string, pin: string): string {
  const secret = process.env.PIN_FINGERPRINT_HMAC_SECRET;
  if (!secret) throw new Error("PIN fingerprint secret is not configured");
  return createHmac("sha256", secret)
    .update(`${storeId}:${pin.normalize("NFKC")}`)
    .digest("hex");
}
