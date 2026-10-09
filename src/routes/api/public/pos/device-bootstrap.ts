// Device-authenticated operating snapshot for the installed SEZA POS.
//
// This endpoint deliberately authenticates the PHYSICAL REGISTER rather than
// requiring a Supabase employee session. It lets a paired terminal refresh the
// store/catalog/employee/permission snapshot even when user Auth is degraded.
import { createFileRoute } from "@tanstack/react-router";

type Body = {
  store_id?: unknown;
  device_id?: unknown;
  device_secret?: unknown;
  user_id?: unknown;
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

export const Route = createFileRoute("/api/public/pos/device-bootstrap")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.device_bootstrap",
          limit: 60,
          windowSeconds: 600,
          blockSeconds: 300,
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
        const userId = typeof body.user_id === "string" ? body.user_id : "";
        if (!storeId || !deviceId || !deviceSecret) return json({ error: "Device not paired" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyDeviceSecret } = await import("@/lib/pos/device.server");
        const admin: any = supabaseAdmin;

        const { data: dev } = await admin
          .from("device_registrations")
          .select("id,store_id,status,secret_hash,label")
          .eq("id", deviceId)
          .maybeSingle();
        if (!dev || dev.status !== "active" || dev.store_id !== storeId || !verifyDeviceSecret(deviceSecret, dev.secret_hash)) {
          return json({ error: "Device is not paired to this store" }, 401);
        }

        let snapshot;
        try {
          const { loadDeviceBootstrap } = await import("@/lib/pos/device-bootstrap.server");
          snapshot = await loadDeviceBootstrap(admin, storeId);
        } catch {
          return json({ error: "Store configuration could not be refreshed. Cached data has been preserved." }, 503);
        }

        let profile: any = null;
        let roles: string[] = [];
        if (userId) {
          const [profileResult, rolesResult] = await Promise.all([
            admin.from("profiles").select("*").eq("id", userId).eq("store_id", storeId).maybeSingle(),
            admin.from("user_roles").select("role").eq("user_id", userId).eq("store_id", storeId),
          ]);
          if (profileResult.error || rolesResult.error) return json({ error: "Employee configuration could not be refreshed." }, 503);
          const p = profileResult.data, r = rolesResult.data;
          if (p?.status === "active") {
            const { pin_hash: _hash, pin_fingerprint: _fingerprint, ...safeProfile } = p;
            profile = safeProfile;
            roles = (r ?? []).map((row: { role: string }) => row.role);
          }
        }

        try {
          await admin
            .from("device_registrations")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", deviceId);
        } catch {
          /* heartbeat is best-effort */
        }

        return json({
          ...snapshot,
          profile,
          roles,
          device: { id: dev.id, label: dev.label, store_id: dev.store_id },
          prepared_at: new Date().toISOString(),
        });
      },
    },
  },
});
