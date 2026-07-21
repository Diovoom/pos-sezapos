import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListAuditLogs, adminAuditFacets, adminExportAuditLogs } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("all");
  const [actorEmail, setActorEmail] = useState("");
  const [storeId, setStoreId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const list = useServerFn(adminListAuditLogs);
  const facets = useServerFn(adminAuditFacets);
  const doExport = useServerFn(adminExportAuditLogs);

  const commonFilters = () => ({
    action: action || undefined,
    entity: entity !== "all" ? entity : undefined,
    actorEmail: actorEmail || undefined,
    storeId: storeId || undefined,
    from: fromDate ? new Date(fromDate).toISOString() : undefined,
    to: toDate ? new Date(toDate + "T23:59:59").toISOString() : undefined,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin_audit", action, entity, actorEmail, storeId, fromDate, toDate, page],
    queryFn: () => list({ data: { ...commonFilters(), page, pageSize: 100 } }),
  });
  const { data: facetData } = useQuery({ queryKey: ["admin_audit_facets"], queryFn: () => facets() });

  async function download() {
    try {
      const r = await doExport({ data: commonFilters() });
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${r.count} rows`);
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
  }

  function reset() {
    setAction(""); setEntity("all"); setActorEmail(""); setStoreId(""); setFromDate(""); setToDate(""); setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">Immutable platform-wide audit trail. Cannot be edited or deleted.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>Reset filters</Button>
          <Button size="sm" onClick={download}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        <Input placeholder="Filter action (contains)…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(1); }}>
          <SelectTrigger><SelectValue placeholder="Entity type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {(facetData?.entities ?? []).map((e: string) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Actor email…" value={actorEmail} onChange={(e) => { setActorEmail(e.target.value); setPage(1); }} />
        <Input placeholder="Store UUID…" value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }} />
        <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
      </div>

      {facetData && facetData.actions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground self-center mr-1">Quick action:</span>
          {facetData.actions.slice(0, 12).map((a: string) => (
            <Badge
              key={a}
              variant={action === a ? "default" : "outline"}
              className="cursor-pointer font-mono text-xs"
              onClick={() => { setAction(action === a ? "" : a); setPage(1); }}
            >{a}</Badge>
          ))}
        </div>
      )}

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
                      <td className="p-2 text-xs font-mono">{r.store_id ? <Link to="/admin/businesses/$storeId" params={{ storeId: r.store_id }} className="text-primary hover:underline">{r.store_id.slice(0, 8)}</Link> : "—"}</td>
                      <td className="p-2 text-xs">{r.entity ?? "—"}{r.entity_id ? ` #${String(r.entity_id).slice(0, 8)}` : ""}</td>
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
