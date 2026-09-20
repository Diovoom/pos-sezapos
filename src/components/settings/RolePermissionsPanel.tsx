import { useMemo, Fragment } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { ALL_PERMISSIONS, ROLES, useRolePermissions, type Role } from "@/hooks/usePermissions";
import { updatePlanRolePermission } from "@/lib/billing/role-permissions.functions";

export function RolePermissionsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const updatePermission = useServerFn(updatePlanRolePermission);
  const { data: rows = [], isLoading } = useRolePermissions();

  const map = useMemo(() => {
    const m = new Map<Role, Set<string>>();
    ROLES.forEach((r) => m.set(r, new Set()));
    rows.forEach((r) => m.get(r.role)?.add(r.permission));
    return m;
  }, [rows]);

  const toggle = useMutation({
    mutationFn: async ({
      role,
      permission,
      enabled,
    }: {
      role: Role;
      permission: string;
      enabled: boolean;
    }) =>
      updatePermission({
        data: { role, permission, enabled },
      }),
    onSuccess: (_data, vars) => {
      toast.success(`${vars.role} permission ${vars.enabled ? "enabled" : "removed"}`);
      void qc.invalidateQueries({ queryKey: ["role_permissions"] });
    },
    onError: (e) => toast.error(userFacingError(e, "Update failed")),
  });

  const groups = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.group)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles &amp; Permissions</CardTitle>
        <CardDescription>
          Grant fine-grained abilities to each role. Owner and Admin have{" "}
          <Badge variant="outline">*</Badge> - full access.
          {!canEdit && (
            <span className="block text-warning mt-1">
              Read-only: only owners and admins can edit.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading permissions…</div>
        ) : (
          <div>
            <div className="mb-3 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground md:hidden">
              Permissions are grouped below. Swipe horizontally to compare roles; the permission name stays pinned while you review access.
            </div>
            <div
              className="-mx-4 max-w-[calc(100%+2rem)] touch-auto overflow-x-auto overscroll-x-contain px-4 [-webkit-overflow-scrolling:touch] md:mx-0 md:max-w-full md:px-0"
            >
            <table className="min-w-[720px] w-full table-fixed text-sm md:min-w-[820px]">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-20 w-[220px] bg-background p-3 text-left shadow-[1px_0_0_hsl(var(--border))] md:w-[280px]">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="w-[110px] whitespace-nowrap p-3 text-center capitalize md:w-[130px]">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group}>
                    <tr key={`g-${group}`} className="bg-muted/30">
                      <td
                        colSpan={ROLES.length + 1}
                        className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground"
                      >
                        {group}
                      </td>
                    </tr>
                    {ALL_PERMISSIONS.filter((p) => p.group === group).map((p) => (
                      <tr key={p.key} className="border-b last:border-b-0">
                        <td className="sticky left-0 z-10 w-[220px] bg-background p-3 shadow-[1px_0_0_hsl(var(--border))] md:w-[280px]">
                          <div className="font-medium leading-tight">{p.label}</div>
                          <div className="mt-1 break-all text-[10px] leading-tight text-muted-foreground font-mono md:text-xs">{p.key}</div>
                        </td>
                        {ROLES.map((role) => {
                          const set = map.get(role)!;
                          const builtInSuper = role === "owner" || role === "admin";
                          const enabled = builtInSuper || set.has("*") || set.has(p.key);
                          const isSuper = builtInSuper || set.has("*");
                          return (
                            <td key={role} className="p-2 text-center">
                              <Checkbox
                                checked={enabled}
                                disabled={!canEdit || isSuper || toggle.isPending}
                                onCheckedChange={(v) =>
                                  toggle.mutate({ role, permission: p.key, enabled: !!v })
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
