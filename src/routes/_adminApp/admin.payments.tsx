import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminPaymentsOverview } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["billing.view"]) ?? false;
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", days],
    queryFn: () => adminPaymentsOverview({ data: { days } }),
    enabled: canView,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">In-person payment attempts across all stores.</p>
        </div>
        <div className="flex gap-2">{[7, 30, 90].map((d) => <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d}d</Button>)}</div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Attempts" value={String(data?.totals.total ?? 0)} />
            <StatCard label="Succeeded" value={String(data?.totals.succeeded ?? 0)} />
            <StatCard label="Failed" value={String(data?.totals.failed ?? 0)} />
            <StatCard label="Gross captured" value={`$${(data?.totals.gross ?? 0).toFixed(2)}`} />
          </div>
          <Card>
            <CardHeader><CardTitle>Recent attempts</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Time</th><th>Provider</th><th>Amount</th><th>Status</th><th>Message</th></tr></thead>
                <tbody>{(data?.recent ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.provider ?? "—"}</td>
                    <td>${Number(r.amount ?? 0).toFixed(2)}</td>
                    <td><Badge variant={r.status === "succeeded" || r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge></td>
                    <td className="text-xs text-muted-foreground max-w-xs truncate">{r.message ?? "—"}</td>
                  </tr>
                ))}</tbody>
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
