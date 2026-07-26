// Public HTTPS endpoint for the bundled Android POS shell.
//
// Mirrors the `signInWithPin` / `signInWithEmployeePin` server functions but
// is reachable via a stable public URL so the Capacitor WebView (which is
// NOT a TanStack Start client and has no server-fn hashes) can authenticate.
//
// Returns a magic-link token_hash the shell passes to supabase.auth.verifyOtp
// to mint a real Supabase session. Never returns credentials.
import { createFileRoute } from "@tanstack/react-router";

type Body = { pin?: unknown; employee_id?: unknown };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/api/public/pos/verify-employee-pin")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.verify_employee_pin",
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

        const pin = typeof body.pin === "string" ? body.pin : "";
        const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
        if (!/^\d{6}$/.test(pin)) return json({ error: "PIN must be exactly 6 digits" }, 400);
        if (employeeId && !/^\d{6}$/.test(employeeId))
          return json({ error: "Invalid employee ID" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyPin } = await import("@/lib/pin.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin: any = supabaseAdmin;

        let match: { id: string; email: string } | null = null;

        if (employeeId) {
          const { data: p } = await admin
            .from("profiles")
            .select("id, email, pin_hash, pin_fingerprint, store_id, status")
            .eq("employee_id", employeeId)
            .maybeSingle();
          if (!p) return json({ error: "No employee found with that ID" }, 404);
          if (p.status !== "active") return json({ error: "Account is disabled" }, 403);
          if (!p.email) return json({ error: "Employee has no email on file" }, 400);
          if (!p.pin_hash) return json({ error: "No PIN set for this account" }, 400);
          if (!verifyPin(pin, p.pin_hash)) return json({ error: "Incorrect PIN" }, 401);
          match = { id: p.id, email: p.email };

          // Backfill the fingerprint on first successful sign-in so future
          // store-scoped uniqueness checks include this employee.
          if (!p.pin_fingerprint && p.store_id) {
            try {
              const { pinFingerprint } = await import("@/lib/pos/fingerprint.server");
              await admin
                .from("profiles")
                .update({ pin_fingerprint: pinFingerprint(p.store_id, pin) })
                .eq("id", p.id);
            } catch {
              /* best effort */
            }
          }
        } else {
          // PIN-only sign-in is disabled: matching a PIN across every store on
          // the platform allowed cross-tenant collisions. Always require the
          // globally-unique 6-digit Employee ID.
          return json(
            {
              error: "MULTIPLE_MATCHES",
              message: "Please also enter your 6-digit Employee ID to sign in.",
            },
            409,
          );
        }

        const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: match.email,
        });
        if (linkErr || !link.properties) return json({ error: "Could not create session" }, 500);

        // Best-effort audit trail — do not fail the sign-in on log errors.
        try {
          await admin.from("audit_log").insert({
            actor_id: match.id,
            action: "login",
            entity: "employee",
            entity_id: match.id,
            details: { method: employeeId ? "pin_with_id" : "pin", channel: "native_shell" },
          });
        } catch {
          /* ignore */
        }

        return json({
          email: match.email,
          token_hash: (link.properties as { hashed_token: string }).hashed_token,
        });
      },
    },
  },
});
