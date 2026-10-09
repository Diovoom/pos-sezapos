// Public HTTPS endpoint: consume a one-time pairing code and register the
// physical Android install as a store-scoped device. Returns the device_id
// and a device_secret that the APK stores locally and re-sends on every
// PIN sign-in from that install.
//
// The code MUST be short-lived (default 15 minutes) and single-use.
import { createFileRoute } from "@tanstack/react-router";
import { userFacingError } from "@/lib/errors/user-facing";

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
          limit: 20,
          windowSeconds: 600,
          blockSeconds: 600,
          maxBodyBytes: 16384,
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

        const codeRaw = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
        const label =
          typeof body.label === "string" && body.label.trim()
            ? body.label.trim().slice(0, 60)
            : "POS Register";
        const platform = typeof body.platform === "string" ? body.platform.slice(0, 40) : "android";
        if (!/^[A-Z2-9]{10}$/.test(codeRaw)) return json({ error: "Invalid pairing code" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { hashPairingCode, generateDeviceSecret, hashDeviceSecret } =
          await import("@/lib/pos/device.server");

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

        // Enforce the register allowance again at code consumption time. A
        // merchant can generate more than one short-lived code before either
        // is used, so the dashboard-side check alone is not enough.
        const { count: activeRegisters, error: registerCountError } = await admin
          .from("device_registrations")
          .select("id", { count: "exact", head: true })
          .eq("store_id", pc.store_id)
          .eq("status", "active");
        if (registerCountError) {
          return json({ error: "Could not verify this store's register allowance" }, 503);
        }
        try {
          const { assertStoreResourceLimit } = await import(
            "@/lib/billing/plan-entitlements.server"
          );
          await assertStoreResourceLimit({
            supabase: admin,
            storeId: pc.store_id,
            resource: "registers",
            currentCount: activeRegisters ?? 0,
          });
        } catch (error) {
          return json(
            {
              error: userFacingError(
                error,
                "This store has reached its POS register allowance.",
              ),
              code: "PLAN_REGISTER_LIMIT",
            },
            403,
          );
        }

        const secret = generateDeviceSecret();
        // The deployed RPC locks and consumes the code in the same transaction
        // as registration. Separate INSERT/UPDATE requests allow duplicate pairing.
        const { data: paired, error: pairError } = await admin.rpc("consume_pos_pairing_code", {
          _code_hash: codeHash,
          _secret_hash: hashDeviceSecret(secret),
          _fallback_label: label,
          _platform: platform,
        });
        if (pairError) {
          const known: Record<string, [string, number]> = {
            PAIRING_CODE_UNKNOWN: ["Unknown or expired pairing code", 404],
            PAIRING_CODE_USED: ["Pairing code already used", 409],
            PAIRING_CODE_EXPIRED: ["Pairing code has expired", 410],
          };
          const safe = known[pairError.message];
          return json({ error: safe?.[0] ?? "Could not register this POS device. Please try again." }, safe?.[1] ?? 503);
        }
        const row = Array.isArray(paired) ? paired[0] : paired;
        if (!row?.device_id || row.store_id !== pc.store_id) {
          return json({ error: "Could not confirm this POS device. Generate a new pairing code." }, 503);
        }
        const dev = { id: row.device_id, store_id: row.store_id, label: row.label };

        // Provision the non-sensitive store snapshot immediately. This makes
        // the terminal useful even before the first employee PIN creates a
        // cloud session and removes one more round-trip from first boot.
        let bootstrap;
        try {
          const { loadDeviceBootstrap } = await import("@/lib/pos/device-bootstrap.server");
          bootstrap = await loadDeviceBootstrap(admin, dev.store_id);
        } catch {
          // Pairing already committed. Always return its one-time secret;
          // the ordinary bootstrap refresh can recover the catalog later.
          bootstrap = undefined;
        }

        return json({
          device_id: dev.id,
          device_secret: secret,
          store_id: dev.store_id,
          label: dev.label,
          bootstrap,
        });
      },
    },
  },
});
