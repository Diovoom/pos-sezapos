import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminSalesOverview } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/sales")({
  head: () => ({ meta: [{ title: "Sales — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SalesPage,
});

function fmt(n: number) { return `$${(Number(n) || 0).toFixed(2)}`; }

function SalesPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["businesses.view", "billing.view"]) ?? false;
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "sales", days],
    queryFn: () => adminSalesOverview({ data: { days } }),
    enabled: canView,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
          <p className="text-sm text-muted-foreground">Aggregated sales activity across all stores.</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d}d</Button>
          ))}
        </div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Transactions" value={String(data?.totals.count ?? 0)} />
            <StatCard label="Gross" value={fmt(data?.totals.gross ?? 0)} />
            <StatCard label="Offline synced" value={String(data?.totals.offline ?? 0)} />
            <StatCard label="Refunded / voided" value={String(data?.totals.refunded ?? 0)} />
          </div>
          <Card>
            <CardHeader><CardTitle>Top stores</CardTitle><CardDescription>By gross in last {days} days</CardDescription></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Store</th><th>Count</th><th>Gross</th></tr></thead>
                <tbody>
                  {(data?.topStores ?? []).map((s: any) => (
                    <tr key={s.id} className="border-t"><td className="py-2">{s.name}</td><td>{s.count}</td><td>{fmt(s.gross)}</td></tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent transactions</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Time</th><th>Total</th><th>Status</th><th>Source</th></tr></thead>
                <tbody>
                  {(data?.recent ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                      <td>{fmt(r.total)}</td>
                      <td><Badge variant="outline">{r.status ?? "—"}</Badge></td>
                      <td className="text-xs">{r.synced_from_offline ? "offline" : "online"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{value}</div></CardContent></Card>;
}
