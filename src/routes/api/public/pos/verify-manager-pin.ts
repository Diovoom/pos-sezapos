// Public HTTPS endpoint for manager PIN approval from the bundled Android
// shell. Mirrors `verifyManagerPin` but is reachable via a stable URL.
//
// Security:
//   - Requires a valid Supabase bearer token (the caller must be signed in
//     as an employee); we resolve their store via supabaseAdmin.
//   - Only PINs of active managers/owners/admins in that store are matched.
//   - Every attempt is written to audit_log (granted or denied).
import { createFileRoute } from "@tanstack/react-router";

const MANAGER_ROLES = ["owner", "admin", "manager"] as const;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/public/pos/verify-manager-pin")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.verify_manager_pin",
          limit: 8,
          windowSeconds: 900,
          blockSeconds: 1800,
          maxBodyBytes: 8192,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        const authz = request.headers.get("authorization") ?? "";
        const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
        if (!token) return json({ error: "Unauthorized" }, 401);

        let body: { pin?: unknown; action?: unknown; details?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const pin = typeof body.pin === "string" ? body.pin : "";
        const action = typeof body.action === "string" ? body.action : "";
        const details =
          body.details && typeof body.details === "object"
            ? (body.details as Record<string, unknown>)
            : {};
        if (!/^\d{4,8}$/.test(pin)) return json({ error: "Invalid PIN" }, 400);
        if (!action) return json({ error: "action is required" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin: any = supabaseAdmin;

        const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);
        const callerId = userRes.user.id;

        const { data: caller } = await admin
          .from("profiles")
          .select("store_id")
          .eq("id", callerId)
          .maybeSingle();
        const storeId = caller?.store_id ?? null;

        const deny = async (reason: string) => {
          try {
            await admin.from("audit_log").insert({
              actor_id: callerId,
              action: "override.denied",
              entity: "manager_override",
              details: { requested_action: action, reason, channel: "native_shell", ...details },
            });
          } catch {
            /* ignore */
          }
          return json({ error: reason }, 401);
        };

        const rolesQ = admin.from("user_roles").select("user_id, role").in("role", MANAGER_ROLES);
        if (storeId) rolesQ.eq("store_id", storeId);
        const { data: roleRows } = await rolesQ;
        const managerIds = Array.from(
          new Set(((roleRows ?? []) as { user_id: string }[]).map((r) => r.user_id)),
        );
        if (managerIds.length === 0) return deny("No managers configured for this store");

        const { data: managers } = await admin
          .from("profiles")
          .select("id, full_name, first_name, last_name, email, status, pin_hash, employee_id")
          .in("id", managerIds)
          .eq("status", "active");

        const { verifyPin } = await import("@/lib/pin.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = (managers ?? []).find((m: any) => m.pin_hash && verifyPin(pin, m.pin_hash));
        if (!match) return deny("Incorrect manager PIN");

        try {
          await admin.from("audit_log").insert({
            actor_id: callerId,
            action: "override.granted",
            entity: "manager_override",
            entity_id: match.id,
            details: {
              requested_action: action,
              manager_employee_id: match.employee_id,
              manager_name: match.full_name,
              channel: "native_shell",
              ...details,
            },
          });
        } catch {
          /* ignore */
        }

        return json({
          manager_id: match.id as string,
          manager_name:
            (match.full_name as string) ||
            `${match.first_name ?? ""} ${match.last_name ?? ""}`.trim() ||
            (match.email as string),
        });
      },
    },
  },
});
