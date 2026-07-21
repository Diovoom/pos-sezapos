// Client-facing catalog of admin permission keys + React hook.
// Server enforcement remains authoritative — this hook is used to hide UI.

import { useQuery } from "@tanstack/react-query";
import { supabaseAdminAuth } from "@/integrations/supabase/admin-client";
import { PLATFORM_ROLES } from "@/lib/platform-roles";

export const ADMIN_PERMISSIONS = [
  "businesses.view",
  "businesses.manage",
  "stores.view",
  "stores.manage",
  "employees.view",
  "employees.manage",
  "devices.view",
  "devices.manage",
  "support.view",
  "support.manage",
  "support.assign",
  "support.internal_notes",
  "support.request_view",
  "support.end_view",
  "billing.view",
  "billing.manage",
  "trials.manage",
  "subscriptions.manage",
  "refunds.platform_manage",
  "diagnostics.view",
  "sync.manage",
  "hardware.manage",
  "incidents.view",
  "incidents.manage",
  "audit.view",
  "audit.export",
  "admin_users.view",
  "admin_users.manage",
  "platform_settings.view",
  "platform_settings.manage",
  "dangerous_actions.execute",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type AdminPermissionSet = {
  roles: string[];
  isSuperAdmin: boolean;
  permissions: Set<string>;
  has: (p: AdminPermission | string) => boolean;
  hasAny: (perms: (AdminPermission | string)[]) => boolean;
};

/**
 * Reads the current admin's roles and permissions via the admin Supabase
 * client (which carries the isolated admin session).
 */
export function useAdminPermissions() {
  return useQuery<AdminPermissionSet>({
    queryKey: ["admin_permissions_self"],
    queryFn: async () => {
      const { data: userRes } = await supabaseAdminAuth.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        return {
          roles: [],
          isSuperAdmin: false,
          permissions: new Set<string>(),
          has: () => false,
          hasAny: () => false,
        };
      }
      const [{ data: roles }, { data: rows }] = await Promise.all([
        supabaseAdminAuth.from("user_roles").select("role").eq("user_id", uid),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabaseAdminAuth.from as any)("admin_permissions").select("role, permission"),
      ]);
      const myRoles = (roles ?? [])
        .map((r) => r.role as string)
        .filter((r) => (PLATFORM_ROLES as readonly string[]).includes(r));
      const isSuper = myRoles.includes("super_admin");
      const perms = new Set<string>();
      for (const r of rows ?? []) {
        if (myRoles.includes(r.role)) perms.add(r.permission);
      }
      const has = (p: string) => isSuper || perms.has(p) || perms.has("*");
      const hasAny = (ps: string[]) => ps.some(has);
      return { roles: myRoles, isSuperAdmin: isSuper, permissions: perms, has, hasAny };
    },
    staleTime: 60_000,
  });
}
