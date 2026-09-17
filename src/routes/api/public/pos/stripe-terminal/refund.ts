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

export const Route = createFileRoute("/api/public/pos/stripe-terminal/refund")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.stripe_refund",
          limit: 15,
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
        const saleId = typeof body.saleId === "string" ? body.saleId.trim() : "";
        const amount = typeof body.amount === "number" ? Math.round(body.amount) : NaN;
        const idempotencyId = typeof body.idempotencyId === "string" ? body.idempotencyId.trim().slice(0, 200) : "";
        if (!saleId || !Number.isInteger(amount) || amount <= 0 || !idempotencyId) {
          return json({ error: "Invalid refund request" }, 400);
        }

        const auth = request.headers.get("authorization") ?? "";
        const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        try {
          const { resolveStripeTerminalMerchant, createTerminalStripeClient } = await import(
            "@/lib/stripe-terminal.server"
          );
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const merchant = await resolveStripeTerminalMerchant({ bearerToken, nativeAuth: body.nativeAuth });
          const admin: any = supabaseAdmin;
          const { data: sale, error } = await admin
            .from("sales")
            .select("id,store_id,total,refunded_amount,payment_method,terminal_ref")
            .eq("id", saleId)
            .eq("store_id", merchant.storeId)
            .maybeSingle();
          if (error) throw error;
          if (!sale) throw new Error("Sale not found.");
          const paymentIntentId = typeof sale.terminal_ref === "string" ? sale.terminal_ref : "";
          if (!paymentIntentId.startsWith("pi_")) throw new Error("This sale is not linked to a Stripe card payment.");
          const refundableCents = Math.round((Number(sale.total || 0) - Number(sale.refunded_amount || 0)) * 100);
          if (amount > refundableCents) throw new Error("Refund amount is greater than the remaining card payment.");

          const stripe = createTerminalStripeClient(merchant.environment);
          const refund = await stripe.refunds.create(
            {
              payment_intent: paymentIntentId,
              amount,
              metadata: { seza_store_id: merchant.storeId, seza_sale_id: sale.id },
            },
            {
              stripeAccount: merchant.stripeAccountId,
              idempotencyKey: `seza-refund-${idempotencyId}`,
            },
          );
          return json({ id: refund.id, status: refund.status });
        } catch (error) {
          return json({ error: "Stripe refund failed" }, 400);
        }
      },
    },
  },
});
