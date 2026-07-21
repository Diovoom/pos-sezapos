// Server-only helpers for POS device pairing.
//
// A pairing code is a short (10-char) uppercase alphanumeric string that an
// owner/admin/manager generates on the dashboard and reads aloud (or shows)
// to whoever is setting up the physical Android register. The APK POSTs the
// code once to /api/public/pos/pair-device; the server verifies it, deletes
// it, and returns a long-lived device_secret bound to that store. From then
// on, the APK sends {store_id, device_id, device_secret, pin} to sign in.
//
// The pairing code is hashed at rest (only the SHA-256 hash lives in
// device_pairing_codes.code_hash) so a database read cannot pair a rogue
// device. The device secret is similarly hashed at rest — the plaintext is
// returned exactly once, when the code is consumed.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Excludes O/0/I/1 to keep codes easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePairingCode(): string {
  const buf = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

// Device secrets: 32 bytes → 64 hex chars.
export function generateDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifyDeviceSecret(candidate: string, storedHash: string): boolean {
  try {
    const a = Buffer.from(hashDeviceSecret(candidate), "hex");
    const b = Buffer.from(storedHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
