// Manager override verification. A cashier calls this with a manager's
// employee ID + PIN to authorize a privileged action (void, discount,
// price override, refund). Returns the manager's id/name on success and
// writes an audit_log row. Never returns credentials.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MANAGER_ROLES = ["owner", "admin", "manager"] as const;

export const verifyManagerOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { employee_id: string; pin: string; action: string; details?: Record<string, unknown> }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    if (!/^\d{6}$/.test(data.employee_id)) throw new Error("Invalid employee ID");
    if (!/^\d{4,8}$/.test(data.pin)) throw new Error("Invalid PIN");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    const ctx = context as { userId: string };

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, status, pin_hash")
      .eq("employee_id", data.employee_id)
      .maybeSingle();

    const deny = async (reason: string) => {
      await admin.from("audit_log").insert({
        actor_id: ctx.userId,
        action: "override.denied",
        entity: "manager_override",
        details: { requested_action: data.action, employee_id: data.employee_id, reason, ...(data.details ?? {}) },
      });
      throw new Error(reason);
    };

    if (!profile) return deny("No employee found with that ID");
    if (profile.status !== "active") return deny("Manager account is disabled");
    if (!profile.pin_hash) return deny("Manager has no PIN set");

    const { verifyPin } = await import("./pin.server");
    if (!verifyPin(data.pin, profile.pin_hash as string)) return deny("Incorrect PIN");

    const { data: hasRole } = await admin.rpc("has_any_role", {
      _user_id: profile.id,
      _roles: MANAGER_ROLES,
    });
    if (!hasRole) return deny("Employee is not a manager");

    await admin.from("audit_log").insert({
      actor_id: ctx.userId,
      action: "override.granted",
      entity: "manager_override",
      entity_id: profile.id,
      details: {
        requested_action: data.action,
        manager_employee_id: data.employee_id,
        manager_name: profile.full_name,
        ...(data.details ?? {}),
      },
    });

    return {
      manager_id: profile.id as string,
      manager_name:
        (profile.full_name as string) ||
        `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
        (profile.email as string),
    };
  });
