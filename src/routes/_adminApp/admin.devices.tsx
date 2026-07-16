import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListDevices } from "@/lib/admin/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";

export const Route = createFileRoute("/_adminApp/admin/devices")({
  head: () => ({ meta: [{ title: "Devices — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: DevicesPage,
});

function DevicesPage() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const list = useServerFn(adminListDevices);
  const { data, isLoading } = useQuery({
    queryKey: ["admin_devices", filter, page],
    queryFn: () => list({ data: { filter: filter === "all" ? undefined : filter, page, pageSize: 50 } }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
        <p className="text-sm text-muted-foreground">All registered POS payment terminals.</p>
      </div>
      <div className="flex gap-2">
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            <SelectItem value="offline">Offline (24h+)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No devices registered.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Device</th><th className="p-3">Business</th><th className="p-3">Provider</th><th className="p-3">Status</th><th className="p-3">Last seen</th><th className="p-3"></th></tr></thead>
                <tbody>
                  {data!.rows.map((t: any) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-3">
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.serial ?? "no serial"}</div>
                      </td>
                      <td className="p-3 text-xs">
                        {t.store_id ? (
                          <Link to="/admin/businesses/$storeId" params={{ storeId: t.store_id }} className="text-primary hover:underline">{t.store_name}</Link>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-xs">{t.provider}</td>
                      <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                      <td className="p-3 text-xs">{t.last_seen_at ? format(new Date(t.last_seen_at), "MMM d, HH:mm") : "never"}</td>
                      <td className="p-3">
                        {t.store_id && <Link to="/admin/businesses/$storeId" params={{ storeId: t.store_id }} className="text-sm text-primary hover:underline">Manage</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {(data?.count ?? 0) > 50 && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
