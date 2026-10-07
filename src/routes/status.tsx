import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { marketingUrl } from "@/lib/host";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [
    { title: "System Status - SEZA POS" },
    { name: "description", content: "Current public availability of SEZA POS." },
  ]}),
  component: StatusPage,
});

type Health = { status: "operational" | "degraded"; checkedAt: string; version: string };

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
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <div className={`border-y py-7 ${operational ? "border-emerald-300" : "border-amber-300"}`}>
          <div className="flex items-start gap-4">
            {health.isLoading ? <Loader2 className="mt-0.5 size-6 animate-spin text-primary" /> : operational ? <CheckCircle2 className="mt-0.5 size-6 text-emerald-700" /> : <AlertTriangle className="mt-0.5 size-6 text-amber-700" />}
            <div>
              <h1 className="text-2xl font-bold">{health.isLoading ? "Checking SEZA POS…" : operational ? "All systems operational" : "SEZA POS is experiencing an issue"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Public service status. Refreshed automatically.</p>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t pt-7">
          <h2 className="text-xl font-bold">Need help?</h2>
          <p className="mt-2 text-muted-foreground">If your register or account is not working as expected, contact SEZA Support.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button asChild><a href={marketingUrl("/support")}>Contact support</a></Button>
            <Button asChild variant="outline"><a href={marketingUrl("/contact")}>Report an issue</a></Button>
          </div>
        </div>
        {health.data?.checkedAt && <p className="mt-5 text-center text-xs text-muted-foreground">Last checked {new Date(health.data.checkedAt).toLocaleString()}</p>}
      </div>
    </MarketingShell>
  );
}
