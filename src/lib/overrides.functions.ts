// Manager override verification. Two flows:
//   verifyManagerOverride  — legacy: employee_id + PIN
//   verifyManagerPin       — PIN-only: matches any active manager/owner/admin
//                            in the caller's store by PIN. Cashiers no longer
//                            need to know the manager's employee ID.
// Both write an audit_log row and never return credentials.

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

// PIN-only manager approval. Iterates active managers/owners/admins in the
// caller's store and finds the one whose PIN matches. Owner and admin PINs
// implicitly bypass any manager-only rule.
export const verifyManagerPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { pin: string; action: string; details?: Record<string, unknown> }) => data,
  )
  .handler(async ({ data, context }) => {
    if (!/^\d{4,8}$/.test(data.pin)) throw new Error("Invalid PIN");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    const ctx = context as { userId: string };

    const { data: caller } = await admin
      .from("profiles").select("store_id").eq("id", ctx.userId).maybeSingle();
    const storeId = caller?.store_id ?? null;

    const rolesQ = admin.from("user_roles").select("user_id, role").in("role", MANAGER_ROLES);
    if (storeId) rolesQ.eq("store_id", storeId);
    const { data: roleRows } = await rolesQ;
    const managerIds = Array.from(new Set(((roleRows ?? []) as { user_id: string }[]).map((r) => r.user_id)));

    const deny = async (reason: string) => {
      await admin.from("audit_log").insert({
        actor_id: ctx.userId,
        action: "override.denied",
        entity: "manager_override",
        details: { requested_action: data.action, reason, ...(data.details ?? {}) },
      });
      throw new Error(reason);
    };

    if (managerIds.length === 0) return deny("No managers configured for this store");

    const { data: managers } = await admin
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, status, pin_hash, employee_id")
      .in("id", managerIds)
      .eq("status", "active");

    const { verifyPin } = await import("./pin.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = (managers ?? []).find((m: any) => m.pin_hash && verifyPin(data.pin, m.pin_hash));

    if (!match) return deny("Incorrect manager PIN");

    await admin.from("audit_log").insert({
      actor_id: ctx.userId,
      action: "override.granted",
      entity: "manager_override",
      entity_id: match.id,
      details: {
        requested_action: data.action,
        manager_employee_id: match.employee_id,
        manager_name: match.full_name,
        ...(data.details ?? {}),
      },
    });

    return {
      manager_id: match.id as string,
      manager_name:
        (match.full_name as string) ||
        `${match.first_name ?? ""} ${match.last_name ?? ""}`.trim() ||
        (match.email as string),
    };
  });
