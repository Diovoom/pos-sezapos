import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminListIncidents } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/incidents")({
  head: () => ({ meta: [{ title: "Incidents — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: IncidentsPage,
});

function IncidentsPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["incidents.view", "diagnostics.view"]) ?? false;
  const [days, setDays] = useState(7);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "incidents", days],
    queryFn: () => adminListIncidents({ data: { days } }),
    enabled: canView,
    refetchInterval: 30_000,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground">Elevated support tickets and payment failures.</p>
        </div>
        <div className="flex gap-2">{[1, 7, 30].map((d) => <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d}d</Button>)}</div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <Card>
            <CardHeader><CardTitle>Urgent & high tickets</CardTitle><CardDescription>Active, unresolved</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">#</th><th>Subject</th><th>Priority</th><th>Status</th><th></th></tr></thead>
                <tbody>{(data?.tickets ?? []).map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2 font-mono text-xs">#{t.ticket_number}</td>
                    <td>{t.subject}</td>
                    <td><Badge variant={t.priority === "urgent" ? "destructive" : "default"}>{t.priority}</Badge></td>
                    <td><Badge variant="outline">{t.status}</Badge></td>
                    <td className="text-right"><Button asChild size="sm" variant="outline"><Link to="/admin/support/$ticketId" params={{ ticketId: t.id }}>Open</Link></Button></td>
                  </tr>
                ))}</tbody>
              </table>
              {!(data?.tickets ?? []).length && <p className="text-sm text-muted-foreground py-6 text-center">No elevated tickets.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Failed payments</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Time</th><th>Provider</th><th>Amount</th><th>Message</th></tr></thead>
                <tbody>{(data?.failedPayments ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.provider ?? "—"}</td>
                    <td>${Number(r.amount ?? 0).toFixed(2)}</td>
                    <td className="text-xs text-muted-foreground max-w-md truncate">{r.message ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!(data?.failedPayments ?? []).length && <p className="text-sm text-muted-foreground py-6 text-center">No failed payments in this window.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
