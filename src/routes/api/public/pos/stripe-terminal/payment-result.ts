import { createFileRoute } from "@tanstack/react-router";
import { userFacingError } from "@/lib/errors/user-facing";

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

export const Route = createFileRoute("/api/public/pos/stripe-terminal/payment-result")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.stripe_payment_result",
          limit: 60,
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
        const reference = typeof body.reference === "string" ? body.reference.trim() : "";
        const status = body.status === "completed" ? "completed" : "failed";
        const message = typeof body.message === "string" ? body.message.slice(0, 500) : null;
        if (!reference.startsWith("pi_")) return json({ error: "Invalid payment reference" }, 400);

        const auth = request.headers.get("authorization") ?? "";
        const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        try {
          const {
            resolveStripeTerminalCaller,
            resolveStripeTerminalMerchant,
            createTerminalStripeClient,
          } = await import("@/lib/stripe-terminal.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          if (body.action === "status") {
            const merchant = await resolveStripeTerminalMerchant({
              bearerToken,
              nativeAuth: body.nativeAuth,
              requireActiveTerminal: false,
            });
            const stripe = createTerminalStripeClient(merchant.environment);
            const intent = await stripe.paymentIntents.retrieve(reference, {
              stripeAccount: merchant.stripeAccountId,
            });
            if (String(intent.metadata?.seza_store_id || "") !== merchant.storeId) {
              return json({ error: "Payment does not belong to this store." }, 403);
            }
            if (Boolean(intent.livemode) !== (merchant.environment === "live")) {
              return json({ error: "Stripe payment environment mismatch." }, 409);
            }
            const lastError = intent.last_payment_error?.message || null;
            const auditStatus =
              intent.status === "succeeded" || intent.status === "requires_capture"
                ? "completed"
                : intent.status === "canceled" || intent.status === "requires_payment_method"
                  ? "failed"
                  : null;
            if (auditStatus) {
              await (supabaseAdmin.from as any)("payment_attempts")
                .update({
                  status: auditStatus,
                  message:
                    auditStatus === "completed"
                      ? "Stripe Terminal payment approved"
                      : lastError || `Stripe PaymentIntent ${intent.status}`,
                })
                .eq("store_id", merchant.storeId)
                .eq("reference", reference)
                .eq("provider", "stripe_terminal");
            }
            return json({
              ok: true,
              status: intent.status,
              last_payment_error: lastError,
              environment: merchant.environment,
              livemode: Boolean(intent.livemode),
            });
          }

          const caller = await resolveStripeTerminalCaller({ bearerToken, nativeAuth: body.nativeAuth });
          const { error } = await (supabaseAdmin.from as any)("payment_attempts")
            .update({ status, message })
            .eq("store_id", caller.storeId)
            .eq("reference", reference)
            .eq("provider", "stripe_terminal");
          if (error) throw error;
          return json({ ok: true });
        } catch (error) {
          return json({ error: userFacingError(error, "Could not update payment result.") }, 400);
        }
      },
    },
  },
});
