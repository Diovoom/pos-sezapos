import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pos/finix/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardApiRequest, securityHeaders } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.finix.cancel",
          limit: 30,
          windowSeconds: 60,
          maxBodyBytes: 4096,
          allowMissingOrigin: true,
        });
        if (blocked) return blocked;
        try {
          const { authenticatePosUser, resolveFinixTerminal, finixRequest } = await import("@/lib/finix/client.server");
          const { admin, storeId } = await authenticatePosUser(request);
          const terminal = await resolveFinixTerminal(admin, storeId);
          const result = await finixRequest(terminal.environment, `/devices/${encodeURIComponent(terminal.deviceId)}`, {
            method: "PUT",
            body: JSON.stringify({ action: "CANCEL" }),
          });
          return Response.json({ ok: true, result }, { headers: securityHeaders() });
        } catch (error: any) {
          return Response.json({ error: error?.message || "Could not cancel the Finix terminal transaction." }, { status: Number(error?.status) || 500, headers: securityHeaders() });
        }
      },
    },
  },
});
