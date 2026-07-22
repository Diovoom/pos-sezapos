import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminListTickets } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/communications")({
  head: () => ({ meta: [{ title: "Communications — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: CommunicationsPage,
});

function CommunicationsPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["support.view"]) ?? false;
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "communications-active"],
    queryFn: () => adminListTickets({ data: { assignee: "me", status: "all", page: 1, pageSize: 25 } }),
    enabled: canView,
    refetchInterval: 15_000,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  const active = (data?.rows ?? []).filter((t: any) => !["resolved", "closed"].includes(t.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Communications</h1>
        <p className="text-sm text-muted-foreground">Your active support conversations. Live chat continues until a case is explicitly closed.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>My active cases</CardTitle><CardDescription>Threads assigned to you across all merchants.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : active.length ? (
            <table className="w-full text-sm min-w-[600px]">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">#</th><th>Subject</th><th>Store</th><th>Status</th><th></th></tr></thead>
              <tbody>{active.map((t: any) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2 font-mono text-xs">#{t.ticket_number}</td>
                  <td>{t.subject}</td>
                  <td>{t.store_name ?? "—"}</td>
                  <td><Badge variant="outline">{t.status}</Badge></td>
                  <td className="text-right"><Button asChild size="sm" variant="outline"><Link to="/admin/support/$ticketId" params={{ ticketId: t.id }}>Open thread</Link></Button></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-muted-foreground py-6 text-center">No active conversations. Claim a ticket from the Support queue to begin.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
