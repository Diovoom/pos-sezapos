import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminPermissions } from "@/lib/admin/permissions";
import { adminPlatformHealth } from "@/lib/admin/admin.functions";
import { Activity, Database, Mail, RefreshCw, ShieldCheck, Webhook } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin/platform-health")({
  head: () => ({
    meta: [
      { title: "Platform Health — SEZA Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PlatformHealthPage,
});

function PlatformHealthPage() {
  const { data: perms } = useAdminPermissions();
  const canView = perms?.hasAny(["diagnostics.view", "platform_settings.view"]) ?? false;
  const query = useQuery({
    queryKey: ["admin", "platform-health"],
    queryFn: () => adminPlatformHealth(),
    enabled: canView,
    refetchInterval: 60_000,
  });

  if (perms && !canView) return <p className="text-sm text-muted-foreground">Not authorized.</p>;

  const data = query.data;
  const services = data ? [
    {
      label: "Supabase database",
      icon: Database,
      ok: data.database.ok,
      detail: data.database.ok
        ? `${data.database.latency_ms} ms · ${data.database.businesses ?? 0} businesses reachable`
        : (data.database as any).error ?? "Database unavailable",
    },
    {
      label: "Supabase server configuration",
      icon: ShieldCheck,
      ok: data.supabase.configured,
      detail: data.supabase.configured ? "URL, publishable key, and service role are configured" : "One or more server variables are missing",
    },
    {
      label: "Stripe sandbox",
      icon: Webhook,
      ok: data.stripe_sandbox.configured && data.stripe_sandbox.webhook_configured,
      detail: `${data.stripe_sandbox.configured ? "API key ready" : "API key missing"} · ${data.stripe_sandbox.webhook_configured ? "webhook ready" : "webhook secret missing"}`,
    },
    {
      label: "Stripe live",
      icon: Webhook,
      ok: data.stripe_live.configured && data.stripe_live.webhook_configured,
      detail: `${data.stripe_live.configured ? "API key ready" : "API key missing"} · ${data.stripe_live.webhook_configured ? "webhook ready" : "webhook secret missing"}`,
    },
    {
      label: "Transactional email",
      icon: Mail,
      ok: data.email.configured,
      detail: data.email.configured ? "Email API and send endpoint configured" : "Email API or send endpoint missing",
    },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Health</h1>
          <p className="text-sm text-muted-foreground">Live, non-secret checks for the services SEZA Admin depends on.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh checks
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Core services</CardTitle>
          <CardDescription>No keys or secrets are displayed—only whether required configuration is present.</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Running service checks…</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <div key={service.label} className="grid gap-2 p-4 sm:grid-cols-[220px_100px_1fr] sm:items-center">
                    <div className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-muted-foreground" /> {service.label}</div>
                    <Badge variant={service.ok ? "default" : "destructive"} className="w-fit">{service.ok ? "Ready" : "Needs attention"}</Badge>
                    <div className="text-xs text-muted-foreground">{service.detail}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Build information</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Application version</div><div className="font-mono">{data?.app_version ?? "—"}</div></div>
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Last checked</div><div>{data?.checked_at ? new Date(data.checked_at).toLocaleString() : "—"}</div></div>
        </CardContent>
      </Card>
    </div>
  );
}
