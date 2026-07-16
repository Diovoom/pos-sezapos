import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminOverviewStats } from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Building2, CreditCard, Monitor, LifeBuoy, ScrollText, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin")({
  head: () => ({ meta: [{ title: "Overview — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminOverview,
});

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">{value.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
        <Icon className={`h-8 w-8 ${tone ?? "text-primary"}`} />
      </CardContent>
    </Card>
  );
}

function AdminOverview() {
  const fetchStats = useServerFn(adminOverviewStats);
  const { data, isLoading } = useQuery({
    queryKey: ["admin_overview_stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 30_000,
  });

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Live platform totals from production data.</p>
      </div>

      {isLoading || !t ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Businesses" value={t.businesses} icon={Building2} />
            <StatCard label="Active" value={t.active} icon={CheckCircle2} tone="text-green-600" />
            <StatCard label="Trials" value={t.trialing} icon={Clock} tone="text-blue-600" />
            <StatCard label="Past due" value={t.past_due} icon={AlertTriangle} tone="text-amber-600" />
            <StatCard label="Suspended" value={t.suspended} icon={AlertTriangle} tone="text-red-600" />
            <StatCard label="Devices" value={t.devices} icon={Monitor} />
            <StatCard label="Offline devices" value={t.offline_devices} icon={Monitor} tone="text-amber-600" />
            <StatCard label="Open tickets" value={t.open_tickets} icon={LifeBuoy} />
            <StatCard label="Errors (7d)" value={t.recent_errors} icon={AlertTriangle} tone="text-red-600" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent platform activity</CardTitle>
              <CardDescription>Latest audit events across all businesses.</CardDescription>
            </CardHeader>
            <CardContent>
              {(data.recent ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">No recent activity.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2 w-40">When</th>
                        <th className="p-2">Actor</th>
                        <th className="p-2">Action</th>
                        <th className="p-2">Store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r: any) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="p-2 font-mono text-xs whitespace-nowrap">
                            {format(new Date(r.created_at), "MMM d, HH:mm:ss")}
                          </td>
                          <td className="p-2 text-xs">{r.actor_email ?? "system"}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="font-mono text-xs">{r.action}</Badge>
                          </td>
                          <td className="p-2 text-xs font-mono">
                            {r.store_id ? (
                              <Link to="/admin/businesses/$storeId" params={{ storeId: r.store_id }} className="text-primary hover:underline">
                                {r.store_id.slice(0, 8)}
                              </Link>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
