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

export const Route = createFileRoute("/api/public/pos/stripe-terminal/payment-result")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
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
          const { resolveStripeTerminalCaller } = await import("@/lib/stripe-terminal.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const caller = await resolveStripeTerminalCaller({ bearerToken, nativeAuth: body.nativeAuth });
          const { error } = await (supabaseAdmin.from as any)("payment_attempts")
            .update({ status, message })
            .eq("store_id", caller.storeId)
            .eq("reference", reference)
            .eq("provider", "stripe_terminal");
          if (error) throw error;
          return json({ ok: true });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Could not update payment result" }, 400);
        }
      },
    },
  },
});
