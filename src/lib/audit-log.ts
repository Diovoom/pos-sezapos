import { supabase } from "@/integrations/supabase/client";
import { isOnlineNow } from "@/lib/offline/useOnline";
import { readMeta, saveOfflineAction } from "@/lib/offline/db";

export type AuditAction =
  | "login"
  | "logout"
  | "clock_in"
  | "clock_out"
  | "break_start"
  | "break_end"
  | "sale.create"
  | "sale.void"
  | "sale.discount"
  | "sale.price_override"
  | "refund.create"
  | "refund.approve"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "inventory.adjust"
  | "employee.create"
  | "employee.update"
  | "employee.disable"
  | "employee.reset"
  | "settings.update"
  | "role_permissions.update"
  | "payment.attempt"
  | "payment.approved"
  | "payment.declined"
  | "register.open"
  | "register.close"
  | "hardware.connect"
  | "hardware.disconnect"
  | "hardware.test"
  | "override.granted"
  | "override.denied"
  | "system.error";

export type AuditEntry = {
  action: AuditAction | string;
  entity?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
};

type CachedStore = { id?: string } | null;
type CachedProfile = { id?: string; email?: string | null; store_id?: string | null } | null;

async function resolveAuditContext(entry: AuditEntry) {
  const { data } = await supabase.auth.getSession();
  const cachedProfile = await readMeta<CachedProfile>("profile").catch(() => null);
  const cachedStore = await readMeta<CachedStore>("store").catch(() => null);
  const detailsStore = typeof entry.details?.store_id === "string" ? entry.details.store_id : null;
  const actorId = data.session?.user?.id ?? cachedProfile?.id ?? null;
  let storeId = detailsStore ?? cachedProfile?.store_id ?? cachedStore?.id ?? null;
  let actorEmail = data.session?.user?.email ?? cachedProfile?.email ?? null;

  if (isOnlineNow() && actorId && (!storeId || !actorEmail)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("store_id,email")
      .eq("id", actorId)
      .maybeSingle();
    storeId = storeId ?? profile?.store_id ?? null;
    actorEmail = actorEmail ?? profile?.email ?? null;
  }

  return { actorId, actorEmail, storeId };
}

/**
 * Durable audit logging. Audit events are written immediately when online and
 * queued in IndexedDB when offline or when the insert fails temporarily.
 * This function intentionally never throws into a checkout flow.
 */
export async function logAudit(entry: AuditEntry) {
  try {
    const { actorId, actorEmail, storeId } = await resolveAuditContext(entry);
    if (!actorId || !storeId) {
      console.warn("[audit] skipped because actor/store context is unavailable", entry.action);
      return;
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const row = {
      id,
      actor_id: actorId,
      actor_email: actorEmail,
      store_id: storeId,
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entity_id ?? null,
      details: entry.details ?? {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      created_at: createdAt,
    };

    if (isOnlineNow()) {
      const { error } = await (supabase.from as any)("audit_log").insert(row);
      if (!error || error.code === "23505") return;
      console.warn("[audit] online insert failed; queued for retry", error);
    }

    await saveOfflineAction({
      id,
      idempotency_key: `audit:${id}`,
      kind: "audit_event",
      store_id: storeId,
      user_id: actorId,
      payload: row,
      local_created_at: createdAt,
      status: "pending",
      attempts: 0,
    });
  } catch (error) {
    console.warn("[audit] failed", error);
  }
}
