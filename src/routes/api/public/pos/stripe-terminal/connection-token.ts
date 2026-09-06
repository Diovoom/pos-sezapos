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

export const Route = createFileRoute("/api/public/pos/stripe-terminal/connection-token")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.stripe_connection",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 16384,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;

        let body: any = {};
        try {
          body = await request.json();
        } catch {}
        const auth = request.headers.get("authorization") ?? "";
        const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        try {
          const { resolveStripeTerminalMerchant, createTerminalStripeClient } = await import(
            "@/lib/stripe-terminal.server"
          );
          const merchant = await resolveStripeTerminalMerchant({ bearerToken, nativeAuth: body.nativeAuth });
          const stripe = createTerminalStripeClient(merchant.environment);
          const token = await stripe.terminal.connectionTokens.create(
            {},
            { stripeAccount: merchant.stripeAccountId },
          );
          return json({ secret: token.secret, environment: merchant.environment });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Stripe connection failed" }, 400);
        }
      },
    },
  },
});
