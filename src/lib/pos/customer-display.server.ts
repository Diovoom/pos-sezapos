/**
 * Server-only helpers for the customer-facing display channel.
 *
 * The realtime topic is readable by anyone who knows a store id, so every
 * payload is signed server-side with an HMAC. Displays reject any payload that
 * is not signed, which prevents outsiders from pushing fake totals or a fake
 * "payment complete" screen.
 */

function signingSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("Customer display signing secret is not configured");
  return secret;
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`seza-customer-display:${signingSecret()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Stable string used for signing: only the fields a display trusts. */
export function displayCanonicalPayload(payload: Record<string, unknown>): string {
  const { signature: _signature, ...rest } = payload as { signature?: string };
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export async function signDisplayPayload(payload: Record<string, unknown>): Promise<string> {
  return hmac(displayCanonicalPayload(payload));
}

export async function verifyDisplaySignature(
  payload: Record<string, unknown>,
  signature: string,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await hmac(displayCanonicalPayload(payload));
  return expected === signature;
}

export async function broadcastDisplayPayload(
  storeId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured");

  const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceKey,
    },
    body: JSON.stringify({
      messages: [{ topic: `customer-display:${storeId}`, event, payload, private: false }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Customer display broadcast failed (${response.status})`);
  }
}
