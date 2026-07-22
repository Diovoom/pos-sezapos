import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminPlatformHealth } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_adminApp/admin/platform-health")({
  head: () => ({ meta: [{ title: "Platform Health — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PlatformHealthPage,
});

function PlatformHealthPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["diagnostics.view"]) ?? false;
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "platform-health"],
    queryFn: () => adminPlatformHealth(),
    enabled: canView,
    refetchInterval: 30_000,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  const rows = data ? [
    { label: "Database", ok: data.database.ok, detail: data.database.ok ? "Reachable" : (data.database as any).error },
    { label: "Stripe sandbox", ok: data.stripe_sandbox.configured, detail: data.stripe_sandbox.configured ? "Connected" : "Not configured" },
    { label: "Stripe live", ok: data.stripe_live.configured, detail: data.stripe_live.configured ? "Connected" : "Not configured" },
    { label: "Email service", ok: data.email.configured, detail: "Configured" },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform health</h1>
        <p className="text-sm text-muted-foreground">Live status of core infrastructure.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Services</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <table className="w-full text-sm"><tbody>{rows.map((r) => (
              <tr key={r.label} className="border-t"><td className="py-3">{r.label}</td><td><Badge variant={r.ok ? "default" : "destructive"}>{r.ok ? "Healthy" : "Down"}</Badge></td><td className="text-xs text-muted-foreground">{r.detail}</td></tr>
            ))}</tbody></table>
          )}
        </CardContent>
      </Card>
      {data?.app_version && <p className="text-xs text-muted-foreground">Build: {data.app_version}</p>}
    </div>
  );
}
