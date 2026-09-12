import Stripe from "stripe";
import { Buffer } from "node:buffer";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

export function getStripeMode(): StripeEnv {
  // SEZA merchant card processing (Connect + Terminal) is production-only.
  // Keep this independent from software subscription billing, which has its
  // own STRIPE_BILLING_MODE and can remain in sandbox.
  return "live";
}

/**
 * Software subscription billing is intentionally independent from Stripe
 * Connect/Terminal mode. It defaults to sandbox and only enters live mode when
 * STRIPE_BILLING_MODE is explicitly set to "live" on the server.
 */
export function getStripeBillingMode(): StripeEnv {
  return process.env.STRIPE_BILLING_MODE === "live" ? "live" : "sandbox";
}

export function getStripeSecretKey(env: StripeEnv): string {
  return env === "sandbox" ? getEnv("STRIPE_SANDBOX_SECRET_KEY") : getEnv("STRIPE_LIVE_SECRET_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  return new Stripe(getStripeSecretKey(env), {
    apiVersion: "2026-03-25.dahlia",
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const stripeError = error as {
      type?: string;
      code?: string;
      decline_code?: string;
      raw?: {
        type?: string;
        code?: string;
        decline_code?: string;
      };
    };

    const type = String(stripeError.raw?.type ?? stripeError.type ?? "").toLowerCase();
    const code = String(stripeError.raw?.code ?? stripeError.code ?? "").toLowerCase();
    const declineCode = String(stripeError.raw?.decline_code ?? stripeError.decline_code ?? "").toLowerCase();

    if (code === "card_declined" || declineCode) {
      return "The card was declined. Try another payment method.";
    }
    if (code === "expired_card") return "The card has expired. Try another payment method.";
    if (code === "incorrect_cvc") return "The card security code is incorrect.";
    if (code === "processing_error") return "The payment could not be processed. Please try again.";
    if (type.includes("rate_limit")) return "The payment service is busy. Please try again in a moment.";
    if (type.includes("authentication") || code.includes("api_key") || code === "invalid_v2_key") {
      return "Payment setup is temporarily unavailable. Please contact SEZA Support.";
    }
    if (type.includes("permission") || code.includes("permission")) {
      return "Payment setup needs attention. Please contact SEZA Support.";
    }
  }

  return "The payment service could not complete the request. Please try again.";
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ id?: string; type: string; created?: number; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret =
    env === "sandbox"
      ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
      : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) throw new Error("Invalid signature format");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = Buffer.from(new Uint8Array(signed)).toString("hex");

  if (!v1Signatures.includes(expected)) throw new Error("Invalid webhook signature");

  return JSON.parse(body);
}
