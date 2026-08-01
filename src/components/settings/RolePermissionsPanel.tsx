import { useMemo, Fragment } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { ALL_PERMISSIONS, ROLES, useRolePermissions, type Role } from "@/hooks/usePermissions";
import { useMe } from "@/hooks/useMe";
import { logAudit } from "@/lib/audit-log";

export function RolePermissionsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const me = useMe();
  const storeId = me.data?.profile?.store_id as string | undefined;
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
    }) => {
      if (!storeId) throw new Error("No store context");
      if (enabled) {
        const { error } = await (supabase.from as any)("role_permissions").insert({
          role,
          permission,
          store_id: storeId,
        });
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await (supabase.from as any)("role_permissions")
          .delete()
          .eq("role", role)
          .eq("permission", permission)
          .eq("store_id", storeId);
        if (error) throw error;
      }
      void logAudit({
        action: "role_permissions.update",
        entity: "role",
        entity_id: role,
        details: { permission, enabled },
      });
    },
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="p-2 text-center capitalize">
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
                        <td className="p-2">
                          <div>{p.label}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.key}</div>
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
        )}
      </CardContent>
    </Card>
  );
}
