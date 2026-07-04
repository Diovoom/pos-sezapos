import { useQuery } from "@tanstack/react-query";
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
  { key: "employees.view", label: "View employees", group: "Employees" },
  { key: "employees.manage", label: "Manage employees", group: "Employees" },
  { key: "settings.view", label: "View settings", group: "Settings" },
  { key: "settings.edit", label: "Edit settings", group: "Settings" },
  { key: "audit.view", label: "View audit log", group: "Security" },
];

export const ROLES = ["owner", "admin", "manager", "cashier"] as const;
export type Role = (typeof ROLES)[number];

export function useRolePermissions() {
  return useQuery({
    queryKey: ["role_permissions"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from as any)("role_permissions").select("role, permission");
      return (data ?? []) as { role: Role; permission: string }[];
    },
  });
}

export function usePermissions() {
  const me = useMe();
  const perms = useRolePermissions();
  const myRoles = (me.data?.roles ?? []) as Role[];
  const rows = perms.data ?? [];
  const mine = new Set(
    rows
      .filter((r) => myRoles.includes(r.role))
      .map((r) => r.permission),
  );
  // Owner and admin are always super users — full permissions, never blocked
  // by manager-approval flows. Enforced client-side so a slow/failed
  // role_permissions fetch never locks the owner out of their own store.
  const isSuper =
    myRoles.includes("owner") ||
    myRoles.includes("admin") ||
    rows.some((r) => myRoles.includes(r.role) && r.permission === "*");

  const has = (p: string) => isSuper || mine.has(p);
  return { has, isSuper, myRoles, loading: me.isLoading || perms.isLoading };
}
