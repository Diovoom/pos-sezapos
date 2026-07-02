import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileBarChart, ClipboardList, LayoutDashboard, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — SEZA POS" }, { name: "description", content: "Shift, sales, tax, and cash reports for your store." }] }),
  component: ReportsPage,
});

const REPORTS = [
  { to: "/shifts", label: "Shift Summaries", desc: "End-of-shift register reports with cash reconciliation, sales, payments, refunds, and charts.", icon: ClipboardList },
  { to: "/dashboard", label: "Daily Summary", desc: "Live overview of today's sales, transactions, tax, refunds, best sellers, and busiest hour.", icon: LayoutDashboard },
  { to: "/register", label: "Register", desc: "Open / close the register and view current shift totals.", icon: Wallet },
  { to: "/sales", label: "Sales History", desc: "Every completed sale with receipts, refunds, and search.", icon: FileBarChart },
] as const;

function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" subtitle="Shift, sales, tax, and cash reports" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {REPORTS.map((r) => (
            <Link key={r.to} to={r.to} className="block">
              <Card className="hover:border-primary/40 transition">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <r.icon className="size-5 text-primary" />
                    <CardTitle>{r.label}</CardTitle>
                  </div>
                  <CardDescription>{r.desc}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-primary">Open →</CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
