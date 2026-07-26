// Public HTTPS endpoint: PIN-only sign-in for a PAIRED Android register.
//
// Requires the caller to prove it is a registered device for a specific
// store by presenting {store_id, device_id, device_secret}. The server then
// finds cashiers at THAT store whose PIN fingerprint matches, verifies the
// PIN hash, and returns a magic-link token_hash for supabase.auth.verifyOtp.
//
// Compared with /verify-employee-pin, this endpoint:
//   * scopes the PIN search to one store, so cross-tenant PIN collisions
//     are impossible by construction;
//   * never returns which specific employee was matched until the PIN hash
//     also verifies;
//   * handles legacy employees whose pin_fingerprint has not been backfilled
//     yet by falling back to a per-store PIN check.
import { createFileRoute } from "@tanstack/react-router";

type Body = {
  store_id?: unknown;
  device_id?: unknown;
  device_secret?: unknown;
  pin?: unknown;
  employee_id?: unknown;
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

export const Route = createFileRoute("/api/public/pos/verify-pin")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.verify_pin",
          limit: 8,
          windowSeconds: 900,
          blockSeconds: 1800,
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
        const pin = typeof body.pin === "string" ? body.pin : "";
        const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
        if (!storeId || !deviceId || !deviceSecret)
          return json({ error: "Device not paired" }, 401);
        if (!/^\d{6}$/.test(pin)) return json({ error: "PIN must be exactly 6 digits" }, 400);
        if (employeeId && !/^\d{6}$/.test(employeeId))
          return json({ error: "Invalid employee ID" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyDeviceSecret } = await import("@/lib/pos/device.server");
        const { pinFingerprint } = await import("@/lib/pos/fingerprint.server");
        const { verifyPin } = await import("@/lib/pin.server");

        const admin: any = supabaseAdmin;

        // 1. Validate the device.
        const { data: dev } = await admin
          .from("device_registrations")
          .select("id, store_id, status, secret_hash")
          .eq("id", deviceId)
          .maybeSingle();
        if (!dev || dev.status !== "active" || dev.store_id !== storeId) {
          return json({ error: "Device is not paired to this store" }, 401);
        }
        if (!verifyDeviceSecret(deviceSecret, dev.secret_hash)) {
          return json({ error: "Invalid device credentials" }, 401);
        }

        // 2. Find candidate cashier(s) at this store.
        const fp = pinFingerprint(storeId, pin);
        let candidates: Array<{ id: string; email: string | null; pin_hash: string | null }> = [];

        if (employeeId) {
          const { data: p } = await admin
            .from("profiles")
            .select("id, email, pin_hash, status, store_id")
            .eq("employee_id", employeeId)
            .maybeSingle();
          if (!p || p.status !== "active" || p.store_id !== storeId) {
            return json({ error: "No matching employee at this register" }, 404);
          }
          candidates = [p];
        } else {
          const { data: fpMatches } = await admin.rpc("pos_find_pin_candidates", {
            _store_id: storeId,
            _fingerprint: fp,
          });
          candidates = (fpMatches ?? []) as typeof candidates;
          if (candidates.length === 0) {
            // Legacy fallback: some active cashiers may not have a
            // fingerprint yet. Try their pin_hash directly, still scoped
            // to this one store so cross-tenant matches are impossible.
            const { data: legacy } = await admin.rpc("pos_list_unfingerprinted", {
              _store_id: storeId,
            });
            candidates = ((legacy ?? []) as typeof candidates).filter(
              (r) => r.pin_hash && verifyPin(pin, r.pin_hash),
            );
          }
        }

        if (candidates.length === 0) return json({ error: "Incorrect PIN" }, 401);

        // 3. Verify the PIN hash for each candidate.
        const matched: Array<{ id: string; email: string | null }> = [];
        for (const c of candidates) {
          if (c.pin_hash && verifyPin(pin, c.pin_hash)) matched.push({ id: c.id, email: c.email });
        }
        if (matched.length === 0) return json({ error: "Incorrect PIN" }, 401);
        if (matched.length > 1) {
          return json(
            {
              error: "MULTIPLE_MATCHES",
              message:
                "Two employees at this register share this PIN. Enter your 6-digit Employee ID to continue.",
            },
            409,
          );
        }

        const chosen = matched[0];
        if (!chosen.email) return json({ error: "Employee has no email on file" }, 400);

        const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: chosen.email,
        });
        if (linkErr || !link.properties) return json({ error: "Could not create session" }, 500);

        // Best-effort audit + device heartbeat.
        try {
          await admin
            .from("device_registrations")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", deviceId);
          await admin.from("audit_log").insert({
            actor_id: chosen.id,
            action: "login",
            entity: "employee",
            entity_id: chosen.id,
            details: {
              method: employeeId ? "pin_with_id" : "pin_device",
              channel: "native_shell",
              device_id: deviceId,
              store_id: storeId,
            },
          });
        } catch {
          /* ignore */
        }

        return json({
          email: chosen.email,
          token_hash: (link.properties as { hashed_token: string }).hashed_token,
        });
      },
    },
  },
});
