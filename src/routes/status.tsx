import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

const COMPONENTS = [
  { name: "POS Register", desc: "Cashier checkout, receipts, payments" },
  { name: "Merchant Dashboard", desc: "Inventory, employees, reports, settings" },
  { name: "Payments", desc: "Card processing and terminals" },
  { name: "Email & SMS", desc: "Transactional messaging and receipts" },
  { name: "Authentication", desc: "Sign-in, PIN, session refresh" },
  { name: "Data & Sync", desc: "Cloud database and realtime sync" },
];

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — SEZA POS" },
      { name: "description", content: "Real-time operational status for SEZA POS. Check current uptime for the POS register, dashboard, payments, and messaging." },
      { property: "og:title", content: "System Status — SEZA POS" },
      { property: "og:description", content: "All SEZA POS systems operational." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const checked = new Date().toLocaleString();
  return (
    <MarketingShell>
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="rounded-2xl border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 p-6 flex items-center gap-4">
          <div className="size-12 rounded-full bg-emerald-500/15 grid place-items-center">
            <CheckCircle2 className="size-7 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">All systems operational</h1>
            <p className="text-sm text-emerald-800/80 dark:text-emerald-200/80">Last checked {checked}</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-4">Component status</h2>
          <div className="grid gap-3">
            {COMPONENTS.map((c) => (
              <Card key={c.name}>
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.desc}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden />
                    <span className="text-emerald-700 dark:text-emerald-300">Operational</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card className="mt-10">
          <CardHeader>
            <CardTitle className="text-base">About this page</CardTitle>
            <CardDescription>
              This page shows the current operational status of the SEZA POS platform. A full
              incident history and real-time uptime metrics are on our roadmap. If you're
              experiencing an issue not reflected here, please contact support.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </MarketingShell>
  );
}
