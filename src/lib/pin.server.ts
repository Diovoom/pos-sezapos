// PIN hashing utilities. scrypt is a memory-hard KDF that ships with Node's
// crypto module  -  no extra dependency required and safe for Cloudflare Workers
// via nodejs_compat.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;
const N = 16384; // CPU/memory cost
const r = 8;
const p = 1;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pin.normalize("NFKC"), salt, KEYLEN, { N, r, p });
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  try {
    const [scheme, saltHex, keyHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    const actual = scryptSync(pin.normalize("NFKC"), salt, expected.length, { N, r, p });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
