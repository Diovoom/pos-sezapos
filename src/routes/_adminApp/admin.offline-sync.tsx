import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminOfflineSyncOverview } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/offline-sync")({
  head: () => ({ meta: [{ title: "Offline Sync — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: OfflineSyncPage,
});

function OfflineSyncPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["businesses.view", "diagnostics.view"]) ?? false;
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "offline-sync"],
    queryFn: () => adminOfflineSyncOverview(),
    enabled: canView,
    refetchInterval: 60_000,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Offline sync</h1>
        <p className="text-sm text-muted-foreground">Sales reconciled from Android POS offline mode (last 7 days).</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Offline sales synced</div><div className="text-3xl font-bold">{data?.total ?? 0}</div></CardContent></Card>
          <Card>
            <CardHeader><CardTitle>By store</CardTitle><CardDescription>Which stores are relying on offline mode</CardDescription></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Store</th><th>Offline sales</th></tr></thead>
                <tbody>{(data?.byStore ?? []).map((s: any) => <tr key={s.id} className="border-t"><td className="py-2">{s.name}</td><td>{s.count}</td></tr>)}</tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent syncs</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Time</th><th>Store</th><th>Total</th><th>Idempotency key</th></tr></thead>
                <tbody>{(data?.recent ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.store_name}</td>
                    <td>${Number(r.total ?? 0).toFixed(2)}</td>
                    <td className="font-mono text-xs">{r.idempotency_key ?? "—"}</td>
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
