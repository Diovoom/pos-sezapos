import { Buffer } from "node:buffer";
import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function verifyTerminalWebhook(request: Request): Promise<any> {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  const secret = env("STRIPE_TERMINAL_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing Stripe signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1" && value) v1Signatures.push(value);
  }

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Invalid Stripe signature format");
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) throw new Error("Invalid Stripe signature timestamp");
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
    throw new Error("Stripe webhook timestamp too old");
  }

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

  if (!v1Signatures.includes(expected)) throw new Error("Invalid Stripe webhook signature");
  return JSON.parse(body);
}

function objectId(value: any): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : typeof value.id === "string" ? value.id : null;
}

async function paymentIntentFromDispute(event: any, dispute: any): Promise<string | null> {
  const direct = objectId(dispute?.payment_intent);
  if (direct) return direct;

  const chargeId = objectId(dispute?.charge);
  const connectedAccountId = typeof event?.account === "string" ? event.account : null;
  if (!chargeId || !connectedAccountId) return null;

  const { createStripeClient } = await import("@/lib/stripe.server");
  const stripe = createStripeClient("live");
  const charge = await stripe.charges.retrieve(chargeId, {
    stripeAccount: connectedAccountId,
  });
  return objectId((charge as any).payment_intent);
}

async function updateAttempt(
  reference: string | null,
  status: string,
  message: string,
  storeId?: string | null,
) {
  if (!reference?.startsWith("pi_")) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = (supabaseAdmin.from as any)("payment_attempts")
    .update({ status, message: message.slice(0, 500) })
    .eq("reference", reference)
    .eq("provider", "stripe_terminal");

  if (storeId) query = query.eq("store_id", storeId);

  const { error } = await query;
  if (error) throw error;
}

async function handleEvent(event: any) {
  const object = event?.data?.object;
  if (!object) return;

  switch (event.type) {
    case "payment_intent.succeeded": {
      await updateAttempt(
        objectId(object),
        "completed",
        "Stripe Terminal payment completed",
        typeof object?.metadata?.seza_store_id === "string" ? object.metadata.seza_store_id : null,
      );
      return;
    }

    case "payment_intent.payment_failed": {
      const failure =
        object?.last_payment_error?.message ||
        object?.last_payment_error?.decline_code ||
        "Stripe Terminal payment failed";
      await updateAttempt(
        objectId(object),
        "failed",
        String(failure),
        typeof object?.metadata?.seza_store_id === "string" ? object.metadata.seza_store_id : null,
      );
      return;
    }

    case "charge.refunded": {
      await updateAttempt(
        objectId(object?.payment_intent),
        "refunded",
        "Stripe Terminal payment refunded",
      );
      return;
    }

    case "charge.dispute.created": {
      const paymentIntentId = await paymentIntentFromDispute(event, object);
      await updateAttempt(
        paymentIntentId,
        "disputed",
        "Stripe dispute opened for this payment",
      );
      return;
    }

    default:
      return;
  }
}

export const Route = createFileRoute("/api/public/pos/stripe-terminal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "live") return json({ error: "Live environment required" }, 400);

        try {
          const event = await verifyTerminalWebhook(request);
          await handleEvent(event);
          return json({ received: true });
        } catch (error) {
          console.error("Stripe Terminal live webhook failed", error);
          return json({ error: "Webhook verification or processing failed" }, 400);
        }
      },
    },
  },
});
