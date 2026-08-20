// Stripe Terminal connection token endpoint. The Android POS shell
// requests this on demand; the token is passed to the Terminal SDK so it
// can talk to Stripe as this merchant. Bearer-authenticated so only
// signed-in employees can mint tokens on behalf of their store.
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
          maxBodyBytes: 8192,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return json({ error: "Missing bearer token" }, 401);

        try {
          const { resolveStripeTerminalMerchant } = await import("@/lib/stripe-terminal.server");
          const merchant = await resolveStripeTerminalMerchant(token);
          const { createTerminalStripeClient } = await import("@/lib/stripe-terminal.server");
          const stripe = createTerminalStripeClient(merchant.testMode);
          // Direct-charge architecture: Terminal resources are scoped to the connected merchant.
          const ct = await stripe.terminal.connectionTokens.create(
            {},
            { stripeAccount: merchant.stripeAccountId },
          );
          return json({ secret: ct.secret });
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
