import { createFileRoute } from "@tanstack/react-router";

type Body = {
  store_id?: unknown;
  device_id?: unknown;
  device_secret?: unknown;
  app_version?: unknown;
  status_snapshot?: unknown;
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/public/pos/device-heartbeat")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.device_heartbeat",
          limit: 180,
          windowSeconds: 60,
          blockSeconds: 60,
          maxBodyBytes: 8192,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const storeId = typeof body.store_id === "string" ? body.store_id : "";
        const deviceId = typeof body.device_id === "string" ? body.device_id : "";
        const deviceSecret = typeof body.device_secret === "string" ? body.device_secret : "";
        const appVersion =
          typeof body.app_version === "string" ? body.app_version.slice(0, 80) : null;
        const snapshot =
          body.status_snapshot && typeof body.status_snapshot === "object"
            ? body.status_snapshot
            : {};

        if (!storeId || !deviceId || !deviceSecret) {
          return json({ error: "Device not paired" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyDeviceSecret } = await import("@/lib/pos/device.server");

        const admin: any = supabaseAdmin;

        const { data: device } = await admin
          .from("device_registrations")
          .select("id, store_id, status, secret_hash")
          .eq("id", deviceId)
          .maybeSingle();

        if (!device || device.status !== "active" || device.store_id !== storeId) {
          return json({ error: "Device is not active for this store" }, 401);
        }
        if (!verifyDeviceSecret(deviceSecret, device.secret_hash)) {
          return json({ error: "Invalid device credentials" }, 401);
        }

        const now = new Date().toISOString();
        const { error } = await admin
          .from("device_registrations")
          .update({
            last_seen_at: now,
            last_sync_at: now,
            app_version: appVersion,
            status_snapshot: snapshot,
          })
          .eq("id", deviceId);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, server_time: now });
      },
    },
  },
});
