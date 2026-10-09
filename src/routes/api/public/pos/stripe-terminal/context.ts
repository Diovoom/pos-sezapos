import { createFileRoute } from "@tanstack/react-router";
import { readerMessage } from "@/lib/hardware/reader-diagnostics";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const CONTEXT_REVISION = "m2-context-20261007-2";

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store, private", "X-SEZA-Terminal-API": CONTEXT_REVISION, ...CORS, ...extra },
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
          blockSeconds: 0,
          maxBodyBytes: 16384,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) {
          const limited = blocked.status === 429;
          return json({ error: readerMessage(limited ? "CONTEXT_RATE_LIMIT" : "CONTEXT"),
            code: limited ? "CONTEXT_RATE_LIMIT" : "CONTEXT", context_step: limited ? "RATE_LIMIT" : "REQUEST_GUARD", api_revision: CONTEXT_REVISION,
            ...(limited ? { retry_after_seconds: Number(blocked.headers.get("retry-after") || 1) } : {}),
          }, blocked.status, limited ? { "Retry-After": blocked.headers.get("retry-after") || "1" } : {});
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // An empty or non-JSON body is allowed; authorization headers can still identify the caller.
        }
        const auth = request.headers.get("authorization") ?? "";
        const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        let step = "CALLER_AUTH";
        try {
          const {
            resolveStripeTerminalCaller,
            loadStripeTerminalStore,
            listStripeTerminals,
          } = await import("@/lib/stripe-terminal.server");
          const caller = await resolveStripeTerminalCaller({ bearerToken, nativeAuth: body.nativeAuth });
          if (body.setup === true) {
            step = "SETUP_REQUIREMENTS";
            const { loadReaderSetup } = await import("@/lib/stripe-reader-setup.server");
            return json({ setup: await loadReaderSetup(caller), api_revision: CONTEXT_REVISION });
          }
          step = "MERCHANT_STORE";
          const state = await loadStripeTerminalStore(caller);
          step = "READER_LIST";
          const allTerminals = await listStripeTerminals(caller.storeId);
          const terminals = caller.deviceId
            ? allTerminals.filter((terminal: any) => {
                const deviceId = String(terminal.config?.device_id || "");
                return !deviceId || deviceId === caller.deviceId;
              })
            : allTerminals;
          step = "RESPONSE";
          return json({
            api_revision: CONTEXT_REVISION,
            ready: state.ready,
            connectStatus: state.store.stripe_connect_status ?? "not_started",
            cardPaymentsStatus: state.cardStatus || null,
            terminalLocationReady: Boolean(state.locationId),
            locationId: state.locationId || null,
            environment: state.environment,
            terminals,
          });
        } catch (error) {
          const code = (error as { code?: string })?.code === "SESSION" ? "SESSION" : "CONTEXT";
          return json({ error: readerMessage(code), code, context_step: step, api_revision: CONTEXT_REVISION }, code === "SESSION" ? 401 : 503);
        }
      },
    },
  },
});
