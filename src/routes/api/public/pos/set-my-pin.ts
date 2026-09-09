// Public HTTPS endpoint for the bundled Android POS shell.
//
// Sets or clears the signed-in employee's 6-digit POS PIN. Requires a
// valid Supabase bearer token in the Authorization header  -  we resolve
// the user via supabaseAdmin.auth.getUser(token) and update only that
// user's own profile.pin_hash. Never trust a user_id from the body.
import { createFileRoute } from "@tanstack/react-router";

type Body = { pin?: unknown };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/pos/set-my-pin")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.set_pin",
          limit: 10,
          windowSeconds: 600,
          blockSeconds: 1800,
          maxBodyBytes: 8192,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return json({ error: "Missing bearer token" }, 401);

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const raw = body.pin;
        const pin: string | null =
          raw === null || raw === "" ? null : typeof raw === "string" ? raw : "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userRes, error: uerr } = await supabaseAdmin.auth.getUser(token);
        if (uerr || !userRes.user) return json({ error: "Unauthorized" }, 401);
        const userId = userRes.user.id;

        const admin: any = supabaseAdmin;

        const { data: prof, error: profileError } = await admin
          .from("profiles")
          .select("store_id")
          .eq("id", userId)
          .maybeSingle();
        if (profileError) return json({ error: "Unable to verify store assignment" }, 500);
        if (!prof?.store_id) return json({ error: "You are not assigned to a store" }, 400);

        // PIN replacement is a protected credential operation. Scope the role
        // check to the employee's active store so a manager role in Store A
        // cannot authorize PIN changes while the profile is assigned to Store B.
        const { data: roleRows, error: roleError } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("store_id", prof.store_id);
        if (roleError) return json({ error: "Unable to verify PIN-management access" }, 500);
        const mayManagePin = (roleRows ?? []).some((row: { role?: string }) =>
          ["owner", "admin", "manager", "super_admin"].includes(String(row.role ?? "")),
        );
        if (!mayManagePin)
          return json({ error: "Ask a manager or owner to reset your employee PIN" }, 403);

        if (pin === null) {
          const { error } = await admin
            .from("profiles")
            .update({ pin_hash: null, pin_fingerprint: null })
            .eq("id", userId);
          if (error) return json({ error: error.message }, 500);
          try {
            await admin.from("audit_log").insert({
              actor_id: userId,
              store_id: prof.store_id,
              action: "pin_cleared",
              entity: "employee",
              entity_id: userId,
              details: { channel: "native_shell" },
            });
          } catch {
            /* ignore */
          }
          return json({ ok: true });
        }
        if (!/^\d{6}$/.test(pin)) return json({ error: "PIN must be exactly 6 digits" }, 400);

        const { hashPin } = await import("@/lib/pin.server");
        const { isWeakPin, pinFingerprint } = await import("@/lib/pos/fingerprint.server");
        if (isWeakPin(pin))
          return json(
            { error: "That PIN is too easy to guess. Pick a less obvious 6-digit code." },
            400,
          );

        // Fingerprints speed up duplicate checks, but they are not required
        // to store or verify a PIN. If the deployment is missing the optional
        // PIN_FINGERPRINT_HMAC_SECRET, fall back to checking the scrypt hashes
        // for active employees in this store instead of blocking setup.
        let fp: string | null = null;
        try {
          fp = pinFingerprint(prof.store_id, pin);
        } catch {
          fp = null;
        }

        let conflict = false;
        if (fp) {
          const { data, error: conflictError } = await admin.rpc("pos_pin_conflict_check", {
            _store_id: prof.store_id,
            _fingerprint: fp,
            _exclude_user: userId,
          });
          if (conflictError) return json({ error: "Employee PINs could not be checked right now" }, 503);
          conflict = !!data;
        } else {
          const { verifyPin } = await import("@/lib/pin.server");
          const { data: activeProfiles, error: readError } = await admin
            .from("profiles")
            .select("id,pin_hash")
            .eq("store_id", prof.store_id)
            .eq("status", "active")
            .neq("id", userId);
          if (readError) return json({ error: "Employee PINs could not be checked right now" }, 503);
          conflict = (activeProfiles ?? []).some(
            (row: { pin_hash?: string | null }) =>
              !!row.pin_hash && verifyPin(pin, row.pin_hash),
          );
        }

        if (conflict)
          return json(
            {
              error:
                "Another active employee at this register already uses that PIN. Pick a different one.",
            },
            409,
          );

        const { error } = await admin
          .from("profiles")
          .update({ pin_hash: hashPin(pin), pin_fingerprint: fp, must_change_pin: false })
          .eq("id", userId);
        if (error) return json({ error: error.message }, 500);

        try {
          await admin.from("audit_log").insert({
            actor_id: userId,
            store_id: prof.store_id,
            action: "pin_set",
            entity: "employee",
            entity_id: userId,
            details: { channel: "native_shell" },
          });
        } catch {
          /* ignore */
        }

        return json({ ok: true });
      },
    },
  },
});
