import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/pos/stripe-terminal/payment-intent")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.stripe_payment",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 32768,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;

        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const amount = typeof body.amount === "number" ? Math.round(body.amount) : NaN;
        const currency = typeof body.currency === "string" && body.currency ? body.currency.toLowerCase() : "usd";
        const description = typeof body.description === "string" ? body.description.slice(0, 200) : undefined;
        const idempotencyId =
          typeof body.idempotencyId === "string" && body.idempotencyId.trim()
            ? body.idempotencyId.trim().slice(0, 200)
            : undefined;
        if (!Number.isInteger(amount) || amount < 50) {
          return json({ error: "Payment amount must be at least 50 cents." }, 400);
        }

        const auth = request.headers.get("authorization") ?? "";
        const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        try {
          const { resolveStripeTerminalMerchant, createTerminalStripeClient } = await import(
            "@/lib/stripe-terminal.server"
          );
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const merchant = await resolveStripeTerminalMerchant({
            bearerToken,
            nativeAuth: body.nativeAuth,
            requireActiveTerminal: true,
          });
          const stripe = createTerminalStripeClient(merchant.environment);
          const intentRequest = stripe.paymentIntents.create(
            {
              amount,
              currency,
              payment_method_types: ["card_present"],
              capture_method: "automatic",
              description,
              metadata: {
                seza_store_id: merchant.storeId,
                seza_cashier_id: merchant.userId,
                seza_terminal_id: merchant.terminalId ?? "",
                seza_channel: "android_pos",
              },
            },
            {
              stripeAccount: merchant.stripeAccountId,
              ...(idempotencyId ? { idempotencyKey: `seza-pos-${idempotencyId}` } : {}),
            },
          );

          const intentTimeout = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("[stripe-terminal/payment-intent] Stripe PaymentIntent creation timed out after 15 seconds")),
              15_000,
            );
          });

          const intent = await Promise.race([intentRequest, intentTimeout]);

          const auditWrite = (supabaseAdmin.from as any)("payment_attempts").insert({
            store_id: merchant.storeId,
            attempted_by: merchant.userId,
            provider: "stripe_terminal",
            method: "card",
            amount: amount / 100,
            currency,
            status: "created",
            message: "Stripe Terminal PaymentIntent created",
            reference: intent.id,
          });

          // Audit logging is useful, but must never hold the customer's card flow.
          await Promise.race([
            Promise.resolve(auditWrite).catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 1_000)),
          ]);

          return json({ id: intent.id, client_secret: intent.client_secret });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Stripe payment failed" }, 400);
        }
      },
    },
  },
});
