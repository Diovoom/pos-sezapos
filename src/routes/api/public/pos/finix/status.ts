import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pos/finix/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardApiRequest, securityHeaders } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.finix.status",
          limit: 60,
          windowSeconds: 60,
          maxBodyBytes: 1024,
          allowMissingOrigin: true,
        });
        if (blocked) return blocked;
        try {
          const { authenticatePosUser, resolveFinixTerminal, finixRequest } = await import("@/lib/finix/client.server");
          const { admin, storeId } = await authenticatePosUser(request);
          const terminal = await resolveFinixTerminal(admin, storeId);
          const device: any = await finixRequest(terminal.environment, `/devices/${encodeURIComponent(terminal.deviceId)}?include_connection=true`);
          return Response.json({
            ok: true,
            terminal_id: terminal.terminalId,
            device_id: terminal.deviceId,
            environment: terminal.environment,
            connected: device?.connection?.connected ?? device?.connected ?? null,
            serial_number: device?.serial_number ?? null,
            model: device?.model ?? null,
          }, { headers: securityHeaders() });
        } catch (error: any) {
          return Response.json({ error: error?.message || "Could not check Finix terminal." }, { status: Number(error?.status) || 500, headers: securityHeaders() });
        }
      },
    },
  },
});
