import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status  -  SEZA POS" },
      {
        name: "description",
        content:
          "Current SEZA POS platform, authentication, database, dashboard, sync, and billing service status.",
      },
      { property: "og:title", content: "System Status  -  SEZA POS" },
      { property: "og:description", content: "Current SEZA POS service health and availability." },
    ],
  }),
  component: StatusPage,
});

type Health = {
  status: "operational" | "degraded";
  services: Record<string, string>;
  responseTimeMs: number;
  checkedAt: string;
  version: string;
};

function StatusPage() {
  const health = useQuery<Health>({
    queryKey: ["public-health"],
    queryFn: async () => {
      const response = await fetch("/api/public/health", { cache: "no-store" });
      if (!response.ok) throw new Error("Health check unavailable");
      return response.json();
    },
    refetchInterval: 60_000,
  });
  const operational = health.data?.status === "operational";
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div
          className={`flex items-center gap-4 rounded-2xl border p-6 ${operational ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" : "bg-muted/30"}`}
        >
          <div
            className={`grid size-12 place-items-center rounded-full ${operational ? "bg-emerald-600 text-white" : "bg-primary/10 text-primary"}`}
          >
            {health.isLoading ? (
              <Loader2 className="size-7 animate-spin" />
            ) : operational ? (
              <CheckCircle2 className="size-7" />
            ) : (
              <AlertTriangle className="size-7" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {health.isLoading
                ? "Checking SEZA services…"
                : operational
                  ? "All systems operational"
                  : "Some services may be degraded"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatically refreshed every minute. Version {health.data?.version ?? "1.2.2"}.
            </p>
          </div>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Service health</CardTitle>
            <CardDescription>
              Live application-level checks. Provider-specific outages may take additional time to
              confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {Object.entries(
              health.data?.services ?? { website: health.isError ? "degraded" : "checking" },
            ).map(([name, status]) => (
              <div key={name} className="flex items-center justify-between py-3 text-sm">
                <span className="capitalize">{name.replaceAll("_", " ")}</span>
                <span
                  className={
                    status === "operational"
                      ? "font-medium text-emerald-600"
                      : "font-medium text-amber-600"
                  }
                >
                  {status === "operational"
                    ? "Operational"
                    : status === "checking"
                      ? "Checking"
                      : "Degraded"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
          <div>
            <div className="font-semibold">Experiencing a register issue?</div>
            <p className="text-sm text-muted-foreground">
              Contact customer service with the store name, device and time of the issue.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/support">Contact support</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">Report an issue</Link>
            </Button>
          </div>
        </div>
        {health.data?.checkedAt && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Last checked {new Date(health.data.checkedAt).toLocaleString()} ·{" "}
            {health.data.responseTimeMs} ms
          </p>
        )}
      </div>
    </MarketingShell>
  );
}
