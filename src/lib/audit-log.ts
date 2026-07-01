import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "login" | "logout"
  | "clock_in" | "clock_out" | "break_start" | "break_end"
  | "sale.create" | "sale.void" | "sale.discount" | "sale.price_override"
  | "refund.create" | "refund.approve"
  | "product.create" | "product.update" | "product.delete"
  | "inventory.adjust"
  | "employee.create" | "employee.update" | "employee.disable" | "employee.reset"
  | "settings.update" | "role_permissions.update"
  | "payment.attempt" | "payment.approved" | "payment.declined"
  | "register.open" | "register.close"
  | "hardware.connect" | "hardware.disconnect" | "hardware.test"
  | "override.granted" | "override.denied"
  | "system.error";

export type AuditEntry = {
  action: AuditAction | string;
  entity?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
};

/** Best-effort audit log. Never throws. */
export async function logAudit(entry: AuditEntry) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)("audit_log").insert({
      actor_id: u.user.id,
      actor_email: u.user.email ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entity_id ?? null,
      details: entry.details ?? {},
      user_agent: ua,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[audit] failed", e);
  }
}
