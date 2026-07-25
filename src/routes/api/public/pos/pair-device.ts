// Public HTTPS endpoint: consume a one-time pairing code and register the
// physical Android install as a store-scoped device. Returns the device_id
// and a device_secret that the APK stores locally and re-sends on every
// PIN sign-in from that install.
//
// The code MUST be short-lived (default 15 minutes) and single-use.
import { createFileRoute } from "@tanstack/react-router";

type Body = { code?: unknown; label?: unknown; platform?: unknown };

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

export const Route = createFileRoute("/api/public/pos/pair-device")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.pair_device",
          limit: 10,
          windowSeconds: 600,
          blockSeconds: 1800,
          maxBodyBytes: 16384,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        let body: Body;
        try { body = (await request.json()) as Body; } catch { return json({ error: "Invalid JSON" }, 400); }

        const codeRaw = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
        const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : "POS Register";
        const platform = typeof body.platform === "string" ? body.platform.slice(0, 40) : "android";
        if (!/^[A-Z2-9]{10}$/.test(codeRaw)) return json({ error: "Invalid pairing code" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { hashPairingCode, generateDeviceSecret, hashDeviceSecret } = await import("@/lib/pos/device.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin: any = supabaseAdmin;

        const codeHash = hashPairingCode(codeRaw);
        const { data: pc } = await admin
          .from("device_pairing_codes")
          .select("id, store_id, label, expires_at, consumed_at")
          .eq("code_hash", codeHash)
          .maybeSingle();
        if (!pc) return json({ error: "Unknown or expired pairing code" }, 404);
        if (pc.consumed_at) return json({ error: "Pairing code already used" }, 409);
        if (new Date(pc.expires_at).getTime() < Date.now()) {
          return json({ error: "Pairing code has expired" }, 410);
        }

        const secret = generateDeviceSecret();
        const { data: dev, error: devErr } = await admin
          .from("device_registrations")
          .insert({
            store_id: pc.store_id,
            label: pc.label || label,
            secret_hash: hashDeviceSecret(secret),
            platform,
            status: "active",
          })
          .select("id, store_id, label")
          .single();
        if (devErr || !dev) return json({ error: devErr?.message ?? "Could not register device" }, 500);

        await admin
          .from("device_pairing_codes")
          .update({ consumed_at: new Date().toISOString(), consumed_device_id: dev.id })
          .eq("id", pc.id);

        try {
          await admin.from("audit_log").insert({
            action: "device.pair",
            entity: "device",
            entity_id: dev.id,
            details: { store_id: pc.store_id, label: dev.label, platform },
          });
        } catch { /* ignore */ }

        return json({
          device_id: dev.id,
          device_secret: secret,
          store_id: dev.store_id,
          label: dev.label,
        });
      },
    },
  },
});
