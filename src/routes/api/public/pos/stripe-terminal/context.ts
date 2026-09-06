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

export const Route = createFileRoute("/api/public/pos/stripe-terminal/context")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.stripe_context",
          limit: 60,
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
          const {
            resolveStripeTerminalCaller,
            loadStripeTerminalStore,
            listStripeTerminals,
          } = await import("@/lib/stripe-terminal.server");
          const caller = await resolveStripeTerminalCaller({ bearerToken, nativeAuth: body.nativeAuth });
          const state = await loadStripeTerminalStore(caller);
          const allTerminals = await listStripeTerminals(caller.storeId);
          const terminals = caller.deviceId
            ? allTerminals.filter((terminal: any) => {
                const deviceId = String(terminal.config?.device_id || "");
                return !deviceId || deviceId === caller.deviceId;
              })
            : allTerminals;
          return json({
            ready: state.ready,
            connectStatus: state.store.stripe_connect_status ?? "not_started",
            cardPaymentsStatus: state.cardStatus || null,
            terminalLocationReady: Boolean(state.locationId),
            locationId: state.locationId || null,
            environment: state.environment,
            terminals,
          });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Stripe setup unavailable" }, 401);
        }
      },
    },
  },
});
