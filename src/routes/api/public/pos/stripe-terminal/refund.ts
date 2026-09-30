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
        const auth = request.headers.get("authorization") ?? "";
        const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

        try {
          const { createPosRefund } = await import("@/lib/pos/refunds.server");
          const result = await createPosRefund({ bearerToken, nativeAuth: body.nativeAuth, request: body.request, approvalToken: body.approvalToken });
          return json(result);
        } catch (error) {
          const { userFacingError } = await import("@/lib/errors/user-facing");
          return json({ error: userFacingError(error, "Refund could not be completed. Retry the same request.") }, 400);
        }
      },
    },
  },
});
