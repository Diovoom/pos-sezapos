import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authenticatedWriteRateLimit } from "@/lib/security/rate-limit";

const EDITABLE_ROLES = new Set(["manager", "cashier"]);
const PERMISSION_KEY = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

export const updatePlanRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .inputValidator(
    (data: { role: string; permission: string; enabled: boolean }) => data,
  )
  .handler(async ({ data, context }) => {
    const role = String(data.role || "");
    const permission = String(data.permission || "").trim();
    if (!EDITABLE_ROLES.has(role)) throw new Error("Only manager and cashier permissions can be customized.");
    if (!PERMISSION_KEY.test(permission) || permission.length > 80) {
      throw new Error("Invalid permission key.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    const userId = (context as { userId: string }).userId;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("store_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.store_id) throw new Error("You are not assigned to a store.");

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("store_id", profile.store_id);
    if (rolesError) throw new Error(rolesError.message);
    const roleSet = new Set((roles ?? []).map((row: { role: string }) => row.role));
    if (!(roleSet.has("owner") || roleSet.has("admin"))) {
      throw new Error("Only an owner or admin can customize role permissions.");
    }

    const { assertStoreFeature } = await import("@/lib/billing/plan-entitlements.server");
    await assertStoreFeature({
      supabase: admin,
      storeId: profile.store_id,
      feature: "team_permissions",
    });

    if (data.enabled) {
      const { error } = await admin.from("role_permissions").upsert(
        {
          store_id: profile.store_id,
          role,
          permission,
        },
        { onConflict: "store_id,role,permission", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from("role_permissions")
        .delete()
        .eq("store_id", profile.store_id)
        .eq("role", role)
        .eq("permission", permission);
      if (error) throw new Error(error.message);
    }

    try {
      await admin.from("audit_log").insert({
        actor_id: userId,
        store_id: profile.store_id,
        action: "role_permissions.update",
        entity: "role",
        entity_id: role,
        details: { permission, enabled: data.enabled },
      });
    } catch {
      /* audit must not turn an otherwise valid permission change into a failure */
    }

    return { ok: true };
  });
