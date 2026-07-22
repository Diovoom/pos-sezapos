import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — SEZA POS" },
      { name: "description", content: "SEZA POS system status. A public real-time status page with monitored uptime metrics is coming soon." },
      { property: "og:title", content: "System Status — SEZA POS" },
      { property: "og:description", content: "Live status monitoring for SEZA POS is coming soon." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  return (
    <MarketingShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="rounded-2xl border bg-muted/30 p-6 flex items-center gap-4">
          <div className="size-12 rounded-full bg-primary/10 grid place-items-center">
            <Activity className="size-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Live status monitoring — coming soon</h1>
            <p className="text-sm text-muted-foreground mt-1">
              We're building a public status page with real-time uptime metrics and incident history.
            </p>
          </div>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">In the meantime</CardTitle>
            <CardDescription>
              If you're experiencing an issue with SEZA POS, we want to hear from you right away.
              Contact support and we'll respond as quickly as possible.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild><Link to="/support">Contact support</Link></Button>
            <Button asChild variant="outline"><Link to="/contact">Report an issue</Link></Button>
          </CardContent>
        </Card>

        <p className="mt-8 text-xs text-muted-foreground text-center">
          When we launch the live status page, it will appear here automatically.
        </p>
      </div>
    </MarketingShell>
  );
}
