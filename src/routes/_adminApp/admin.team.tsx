import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminListAdmins } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/team")({
  head: () => ({ meta: [{ title: "Admin Team — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["admin_users.view"]) ?? false;
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "team"],
    queryFn: () => adminListAdmins(),
    enabled: canView,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin team</h1>
        <p className="text-sm text-muted-foreground">Platform staff and their assigned roles.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Members</CardTitle><CardDescription>Only super admins can add or remove admin roles.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <table className="w-full text-sm min-w-[600px]">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Name</th><th>Email</th><th>Roles</th><th>Status</th></tr></thead>
              <tbody>{(data?.rows ?? []).map((u: any) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2">{u.name}</td>
                  <td>{u.email}</td>
                  <td className="flex flex-wrap gap-1 py-2">{u.roles.map((r: string) => <Badge key={r} variant="outline">{r}</Badge>)}</td>
                  <td><Badge variant={u.status === "active" ? "default" : "outline"}>{u.status}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
