import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";

export const ALL_PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: "sales.create", label: "Create sales", group: "Sales" },
  { key: "sales.void", label: "Void sales", group: "Sales" },
  { key: "sales.discount", label: "Apply discounts", group: "Sales" },
  { key: "sales.price_override", label: "Override prices", group: "Sales" },
  { key: "refunds.create", label: "Create refunds", group: "Refunds" },
  { key: "refunds.approve", label: "Approve refunds", group: "Refunds" },
  { key: "products.create", label: "Create products", group: "Products" },
  { key: "products.edit", label: "Edit products", group: "Products" },
  { key: "products.delete", label: "Delete products", group: "Products" },
  { key: "inventory.edit", label: "Edit inventory", group: "Inventory" },
  { key: "reports.view", label: "View reports", group: "Reports" },
  { key: "reports.export", label: "Export reports", group: "Reports" },
  { key: "register.open", label: "Open register", group: "Register" },
  { key: "register.close", label: "Close register", group: "Register" },
  {
    key: "payment.cancel",
    label: "Cancel/change an uncommitted tender without manager PIN",
    group: "Register",
  },
  { key: "employees.view", label: "View employees", group: "Employees" },
  { key: "employees.manage", label: "Manage employees", group: "Employees" },
  { key: "settings.view", label: "View settings", group: "Settings" },
  { key: "settings.edit", label: "Edit settings", group: "Settings" },
  {
    key: "hardware.configure",
    label: "Configure printer/drawer/scanner/terminal",
    group: "Settings",
  },
  {
    key: "products.quick_add",
    label: "Quick-add product from Register (unknown barcode)",
    group: "Products",
  },
  { key: "audit.view", label: "View audit log", group: "Security" },
];

export const ROLES = ["owner", "admin", "manager", "cashier"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Store-scoped role permissions with realtime invalidation.
 * The same hook is bundled into the Android APK, so a checkbox change in the
 * owner dashboard reaches an online register without rebuilding or signing out.
 */
export function useRolePermissions() {
  const me = useMe();
  const qc = useQueryClient();
  const storeId = (me.data?.profile?.store_id ?? me.data?.store?.id) as string | undefined;

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`role-permissions:${storeId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "role_permissions",
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["role_permissions", storeId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, storeId]);

  return useQuery({
    queryKey: ["role_permissions", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("role_permissions")
        .select("role, permission")
        .eq("store_id", storeId);
      if (error) throw error;
      return (data ?? []) as { role: Role; permission: string }[];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Realtime is primary. This small fallback covers deployments where the
    // table was not yet added to the realtime publication.
    refetchInterval: 60_000,
  });
}

export function usePermissions() {
  const me = useMe();
  const perms = useRolePermissions();
  const myRoles = (me.data?.roles ?? []) as Role[];
  const rows = perms.data ?? [];
  const mine = new Set(rows.filter((r) => myRoles.includes(r.role)).map((r) => r.permission));

  // Owners/admins are permanently full-access and cannot be accidentally
  // locked out by the role matrix.
  const isSuper =
    myRoles.includes("owner") ||
    myRoles.includes("admin") ||
    rows.some((r) => myRoles.includes(r.role) && r.permission === "*");

  const has = (p: string) => isSuper || mine.has("*") || mine.has(p);
  return { has, isSuper, myRoles, loading: me.isLoading || perms.isLoading };
}
