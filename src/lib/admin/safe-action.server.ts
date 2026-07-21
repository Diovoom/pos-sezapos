// Server-only safe-action framework for admin server functions.
// Every modifying admin operation should be wrapped in `runSafeAction`. It:
//   1. verifies the caller is SEZA platform staff
//   2. checks a granular admin permission via public.has_admin_permission
//   3. for "dangerous" actions, requires a typed confirmation + reason
//   4. captures before/after state and writes a single audit_log row
//   5. returns { ok, result, correlation_id }
//
// This file is server-only (never imported by client-reachable route/component
// modules directly). Import it inside a createServerFn handler.

import { randomUUID } from "crypto";

export type Danger = "safe" | "sensitive" | "dangerous";

export type SafeActionInput<T> = {
  context: { supabase: any; userId: string };
  permission: string;
  danger: Danger;
  action: string;
  entity?: string;
  entityId?: string;
  storeId?: string | null;
  reason?: string | null;
  confirm?: boolean;
  before?: unknown;
  apply: (ctx: { correlationId: string; actorEmail: string | null }) => Promise<T>;
  captureAfter?: (result: T) => Promise<unknown> | unknown;
};

export type SafeActionResult<T> = {
  ok: true;
  result: T;
  correlation_id: string;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensurePlatformStaff(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error("Authorization check failed");
  const { PLATFORM_ROLES } = await import("@/lib/platform-roles");
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r: string) => (PLATFORM_ROLES as readonly string[]).includes(r));
  if (!ok) throw new Error("Forbidden");
  return roles as string[];
}

async function ensurePermission(
  ctx: { supabase: any; userId: string },
  permission: string,
) {
  const { data, error } = await ctx.supabase.rpc("has_admin_permission", {
    _user_id: ctx.userId,
    _permission: permission,
  });
  if (error || data !== true) {
    throw new Error("Forbidden");
  }
}

async function actorEmail(ctx: { supabase: any }) {
  const { data } = await ctx.supabase.auth.getUser();
  return (data?.user?.email ?? null) as string | null;
}

/**
 * Wrap a modifying admin operation with permission + audit + reason gates.
 * Throws a redacted Error on failure; the raw provider error is logged
 * server-side inside the audit row.
 */
export async function runSafeAction<T>(input: SafeActionInput<T>): Promise<SafeActionResult<T>> {
  const correlationId = randomUUID();

  await ensurePlatformStaff(input.context);
  await ensurePermission(input.context, input.permission);

  const reason = (input.reason ?? "").trim();
  if (input.danger === "dangerous") {
    if (!input.confirm) throw new Error("Confirmation is required for this action");
    if (reason.length < 4) throw new Error("A reason of at least 4 characters is required");
  }

  const email = await actorEmail(input.context);
  const admin = await loadAdmin();

  try {
    const result = await input.apply({ correlationId, actorEmail: email });
    let after: unknown = undefined;
    if (input.captureAfter) {
      try {
        after = await input.captureAfter(result);
      } catch {
        after = undefined;
      }
    }
    await admin.from("audit_log").insert({
      actor_id: input.context.userId,
      actor_email: email,
      store_id: input.storeId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
      details: {
        danger: input.danger,
        permission: input.permission,
        reason: reason || null,
        before: input.before ?? null,
        after: after ?? null,
        correlation_id: correlationId,
      },
    });
    return { ok: true, result, correlation_id: correlationId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Best-effort error audit; never mask the original error.
    try {
      await admin.from("audit_log").insert({
        actor_id: input.context.userId,
        actor_email: email,
        store_id: input.storeId ?? null,
        action: "system.error",
        entity: input.entity ?? null,
        entity_id: input.entityId ?? null,
        details: {
          danger: input.danger,
          permission: input.permission,
          reason: reason || null,
          failed_action: input.action,
          error: msg,
          correlation_id: correlationId,
        },
      });
    } catch {
      /* swallow */
    }
    // Redact provider details from the user-visible message.
    throw new Error("Action failed. Please retry or contact SEZA engineering.");
  }
}
