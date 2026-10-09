import { loadOwnerReport, reportBounds, type ReportRange } from "@/lib/web/owner-reports";
import { useMe } from "@/hooks/useMe";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Receipt,
  TrendingUp,
  DollarSign,
  Percent,
  ShoppingBag,
  Download,
  ClipboardList,
  LayoutDashboard,
  Wallet,
  FileBarChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";


export const Route = createFileRoute("/_dashboard/reports")({
  head: () => ({
    meta: [
      { title: "Reports  -  SEZA POS" },
      {
        name: "description",
        content: "Sales, payments, taxes, and performance reports for your store.",
      },
    ],
  }),
  component: ReportsPage,
});

const PAY_COLORS: Record<string, string> = {
  cash: "#10b981",
  card: "#2563eb",
  tap: "#a855f7",
  other: "#f59e0b",
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("size-12 rounded-2xl grid place-items-center", toneMap[tone])}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl font-bold mt-0.5 tabular-nums truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const QUICK_LINKS = [
  {
    to: "/shifts",
    label: "Shift Summaries",
    desc: "End-of-shift cash reconciliation",
    icon: ClipboardList,
  },
  {
    to: "/dashboard",
    label: "Daily Summary",
    desc: "Live overview of today",
    icon: LayoutDashboard,
  },
  { to: "/devices", label: "POS Devices", desc: "Register status and pairing", icon: Wallet },
  { to: "/sales", label: "Sales History", desc: "Every completed sale", icon: FileBarChart },
] as const;

function ReportsPage() {
  const [range, setRange] = useState<ReportRange>("30d");
  const me = useMe();
  const store = me.data?.store;
  const timeZone = store?.time_zone || "America/New_York";
  const day = new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  const bounds = useMemo(() => reportBounds(range, timeZone), [range, timeZone, day]);
  const currency = store?.currency ?? "USD";
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["reports", store?.id, range, bounds.from.toISOString(), timeZone],
    enabled: !!store?.id,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () => loadOwnerReport(supabase, store!.id, bounds, timeZone),
  });

  const exportCsv = () => {
    if (!data) return;
    const lines = [
      "Metric,Value",
      `Total Sales,${data.totalSales.toFixed(2)}`,
      `Transactions,${data.txCount}`,
      `Average Sale,${data.avgSale.toFixed(2)}`,
      "Gross Profit,Not available - historical cost was not recorded",
      `Discounts,${data.totalDiscount.toFixed(2)}`,
      `Tax Collected,${data.totalTax.toFixed(2)}`,
      `Refunds Against These Sales,${data.refundedAmount.toFixed(2)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${bounds.from.toISOString().slice(0, 10)}-to-${bounds.to.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPay = data?.paymentBreakdown.reduce((a, p) => a + p.value, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Review sales, payments, and performance for your business."
        actions={
          <>
            <Select value={range} onValueChange={(v) => setRange(v as ReportRange)}>
              <SelectTrigger className="h-9 w-40 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="mtd">Month to date</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data || isError}>
              <Download className="size-4 mr-1.5" /> Export
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isError ? <div role="alert" className="space-y-3">
          <p>Reports could not be loaded. Try again; no totals have been substituted.</p>
          <Button onClick={() => void refetch()}>Try again</Button>
        </div> : isPending ? <p role="status">Loading reports…</p> : <>
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <SummaryCard
            icon={ShoppingBag}
            label="Total Sales"
            value={fmtCurrency(data?.totalSales ?? 0, currency)}
            tone="primary"
          />
          <SummaryCard
            icon={Receipt}
            label="Transactions"
            value={fmtNumber(data?.txCount ?? 0)}
            tone="primary"
          />
          <SummaryCard
            icon={TrendingUp}
            label="Average Sale"
            value={fmtCurrency(data?.avgSale ?? 0, currency)}
            tone="success"
          />
          <SummaryCard
            icon={DollarSign}
            label="Gross Profit"
            value="Not available"
            tone="success"
          />
          <SummaryCard
            icon={Percent}
            label="Discounts"
            value={fmtCurrency(data?.totalDiscount ?? 0, currency)}
            tone="warning"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Sales Over Time</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.timeline ?? []}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => fmtCurrency(v, currency)}
                  />
                  <Area
                    dataKey="total"
                    stroke="var(--color-primary)"
                    fill="url(#salesGrad)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Payment Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.paymentBreakdown.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No payments in this range.
                </p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-36 h-36 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data!.paymentBreakdown}
                          dataKey="value"
                          innerRadius={38}
                          outerRadius={62}
                          paddingAngle={2}
                        >
                          {data!.paymentBreakdown.map((p, i) => (
                            <Cell key={i} fill={PAY_COLORS[p.name] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2 text-sm min-w-0">
                    {data!.paymentBreakdown.map((p) => {
                      const pct = totalPay > 0 ? (p.value / totalPay) * 100 : 0;
                      return (
                        <div key={p.name} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ background: PAY_COLORS[p.name] ?? "#94a3b8" }}
                            />
                            <span className="capitalize truncate">{p.name}</span>
                          </span>
                          <span className="font-mono text-xs">
                            {fmtCurrency(p.value, currency)}{" "}
                            <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t flex items-center justify-between font-semibold">
                      <span>Total</span>
                      <span className="font-mono">{fmtCurrency(totalPay, currency)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tables row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Top Selling Products</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface/50">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.topProducts.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No products sold in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data!.topProducts.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono">{p.qty.toFixed(0)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {fmtCurrency(p.revenue, currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SummaryRow
                label="Sales including tax"
                value={fmtCurrency(data?.totalSales ?? 0, currency)}
              />
              <SummaryRow
                label="Discounts"
                value={`-${fmtCurrency(data?.totalDiscount ?? 0, currency)}`}
                tone="warning"
              />
              <SummaryRow
                label="Taxes Collected"
                value={fmtCurrency(data?.totalTax ?? 0, currency)}
              />
              <SummaryRow
                label="Net Sales"
                value={fmtCurrency((data?.totalSales ?? 0) - (data?.totalTax ?? 0), currency)}
              />
              <div className="pt-3 border-t rounded-lg bg-success/10 p-3 -mx-1 flex items-center justify-between">
                <span className="font-semibold text-success">Gross Profit</span>
                <span className="font-mono font-bold text-lg text-success">
                  Not available
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">Amounts are before refunds. Refunds against sales in this range: {fmtCurrency(data?.refundedAmount ?? 0, currency)}. Historical product costs were not recorded, so gross profit is unavailable.</p>
        </>}
        {/* Quick links */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            More reports
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_LINKS.map((r) => (
              <Link key={r.to} to={r.to} className="group">
                <Card className="shadow-sm hover:shadow-md hover:border-primary/40 transition-all h-full">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="size-10 rounded-xl bg-primary/10 grid place-items-center text-primary shrink-0">
                      <r.icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold">{r.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-semibold", tone === "warning" && "text-warning")}>
        {value}
      </span>
    </div>
  );
}
