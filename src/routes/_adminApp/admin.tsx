import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, CreditCard, Monitor, LifeBuoy, ScrollText, Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/_adminApp/admin")({
  head: () => ({ meta: [{ title: "Overview — SEZA Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminOverview,
});

const SECTIONS = [
  { title: "Businesses", desc: "Merchants, stores, owners.", icon: Building2 },
  { title: "Subscriptions", desc: "Plans, billing status, trials.", icon: CreditCard },
  { title: "Devices", desc: "Registers, terminals, printers.", icon: Monitor },
  { title: "Support", desc: "Tickets and merchant assistance.", icon: LifeBuoy },
  { title: "Audit Logs", desc: "Platform-wide activity.", icon: ScrollText },
  { title: "Settings", desc: "Platform configuration.", icon: SettingsIcon },
];

function AdminOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Welcome to the SEZA platform admin console.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{s.title}</CardTitle>
                </div>
                <CardDescription>{s.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Coming soon.</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
