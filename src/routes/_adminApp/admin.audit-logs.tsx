import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListAuditLogs } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { format } from "date-fns";

export const Route = createFileRoute("/_adminApp/admin/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [storeId, setStoreId] = useState("");
  const [page, setPage] = useState(1);
  const list = useServerFn(adminListAuditLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["admin_audit", action, actorEmail, storeId, page],
    queryFn: () => list({ data: { action: action || undefined, actorEmail: actorEmail || undefined, storeId: storeId || undefined, page, pageSize: 100 } }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Immutable platform-wide audit trail. Cannot be edited or deleted.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Filter action…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="max-w-xs" />
        <Input placeholder="Actor email…" value={actorEmail} onChange={(e) => { setActorEmail(e.target.value); setPage(1); }} className="max-w-xs" />
        <Input placeholder="Store UUID…" value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }} className="max-w-xs" />
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No matching events.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr className="text-left"><th className="p-2 w-40">When</th><th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Store</th><th className="p-2">Entity</th><th className="p-2">Details</th></tr></thead>
                <tbody>
                  {data!.rows.map((r: any) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-2 font-mono text-xs whitespace-nowrap">{format(new Date(r.created_at), "MMM d, HH:mm:ss")}</td>
                      <td className="p-2 text-xs">{r.actor_email ?? "system"}</td>
                      <td className="p-2"><Badge variant="outline" className="font-mono text-xs">{r.action}</Badge></td>
                      <td className="p-2 text-xs font-mono">{r.store_id ? <Link to="/admin/businesses/$storeId" params={{ storeId: r.store_id }} className="text-primary hover:underline">{r.store_id.slice(0,8)}</Link> : "—"}</td>
                      <td className="p-2 text-xs">{r.entity ?? "—"}{r.entity_id ? ` #${String(r.entity_id).slice(0,8)}` : ""}</td>
                      <td className="p-2 text-xs font-mono text-muted-foreground max-w-md truncate">{r.details ? JSON.stringify(r.details) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data?.count ?? 0} total</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 100} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
