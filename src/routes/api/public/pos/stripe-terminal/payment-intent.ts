// Create a card-present PaymentIntent for Stripe Terminal. Returns the
// client_secret the Terminal SDK uses to collect + confirm the payment.
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

type Body = { amount?: unknown; currency?: unknown; description?: unknown };

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
          maxBodyBytes: 16384,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return json({ error: "Missing bearer token" }, 401);

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const amount = typeof body.amount === "number" ? Math.round(body.amount) : NaN;
        const currency =
          typeof body.currency === "string" && body.currency ? body.currency.toLowerCase() : "usd";
        const description =
          typeof body.description === "string" ? body.description.slice(0, 200) : undefined;
        if (!Number.isInteger(amount) || amount < 50)
          return json({ error: "amount must be an integer ≥ 50 (in cents)" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userRes, error: uerr } = await supabaseAdmin.auth.getUser(token);
        if (uerr || !userRes.user) return json({ error: "Unauthorized" }, 401);
        const userId = userRes.user.id;

        // Resolve store for audit.

        const admin: any = supabaseAdmin;
        const { data: profile } = await admin
          .from("profiles")
          .select("store_id")
          .eq("id", userId)
          .maybeSingle();
        const storeId = profile?.store_id ?? null;

        try {
          const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
          const env = (process.env.STRIPE_LIVE_API_KEY ? "live" : "sandbox") as "live" | "sandbox";
          const stripe = createStripeClient(env);
          const pi = await stripe.paymentIntents.create({
            amount,
            currency,
            payment_method_types: ["card_present"],
            capture_method: "automatic",
            description,
            metadata: { store_id: storeId ?? "", cashier_id: userId, channel: "pos_terminal" },
          });
          try {
            await admin.from("payment_attempts").insert({
              store_id: storeId,
              cashier_id: userId,
              amount_cents: amount,
              currency,
              provider: "stripe_terminal",
              provider_ref: pi.id,
              status: "created",
            });
          } catch {
            /* payment_attempts columns may differ; audit is best-effort */
          }
          return json({ id: pi.id, client_secret: pi.client_secret });
        } catch (e) {
          const { getStripeErrorMessage } = await import("@/lib/stripe.server").catch(() => ({
            getStripeErrorMessage: () => "Stripe error",
          }));
          return json({ error: getStripeErrorMessage(e) }, 500);
        }
      },
    },
  },
});
