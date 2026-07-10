import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Receipt, TrendingUp, DollarSign, Percent, ShoppingBag, Download,
  ClipboardList, LayoutDashboard, Wallet, FileBarChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_dashboard/reports")({
  head: () => ({
    meta: [
      { title: "Reports — SEZA POS" },
      { name: "description", content: "Sales, payments, taxes, and performance reports for your store." },
    ],
  }),
  component: ReportsPage,
});

type RangeKey = "today" | "7d" | "30d" | "mtd";

function rangeBounds(key: RangeKey): { from: Date; to: Date; label: string } {
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (key === "7d") from.setDate(from.getDate() - 6);
  else if (key === "30d") from.setDate(from.getDate() - 29);
  else if (key === "mtd") from.setDate(1);
  const label =
    key === "today" ? "Today" :
    key === "7d" ? "Last 7 days" :
    key === "30d" ? "Last 30 days" : "Month to date";
  return { from, to, label };
}

const PAY_COLORS: Record<string, string> = {
  cash: "#10b981",
  card: "#2563eb",
  tap: "#a855f7",
  other: "#f59e0b",
};

function SummaryCard({
  icon: Icon, label, value, tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; tone?: "primary" | "success" | "warning" | "destructive";
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
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-0.5 tabular-nums truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const QUICK_LINKS = [
  { to: "/shifts", label: "Shift Summaries", desc: "End-of-shift cash reconciliation", icon: ClipboardList },
  { to: "/dashboard", label: "Daily Summary", desc: "Live overview of today", icon: LayoutDashboard },
  { to: "/register", label: "Register", desc: "Open / close the register", icon: Wallet },
  { to: "/sales", label: "Sales History", desc: "Every completed sale", icon: FileBarChart },
] as const;

function ReportsPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const bounds = useMemo(() => rangeBounds(range), [range]);

  const { data: store } = useQuery({
    queryKey: ["store"],
    queryFn: async () => (await supabase.from("stores").select("id,currency").limit(1).maybeSingle()).data,
  });
  const currency = store?.currency ?? "USD";

  const { data } = useQuery({
    queryKey: ["reports", range],
    queryFn: async () => {
      const [salesRes] = await Promise.all([
        sb.from("sales")
          .select("id,total,subtotal,tax,discount,cost,created_at,payment_method,status")
          .gte("created_at", bounds.from.toISOString())
          .lte("created_at", bounds.to.toISOString())
          .order("created_at"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allSales = (salesRes.data ?? []) as any[];
      const completed = allSales.filter((s) => s.status === "completed");

      const totalSales = completed.reduce((a, s) => a + Number(s.total || 0), 0);
      const totalTax = completed.reduce((a, s) => a + Number(s.tax || 0), 0);
      const totalDiscount = completed.reduce((a, s) => a + Number(s.discount || 0), 0);
      const totalCost = completed.reduce((a, s) => a + Number(s.cost || 0), 0);
      const txCount = completed.length;
      const avgSale = txCount > 0 ? totalSales / txCount : 0;
      const grossProfit = totalSales - totalTax - totalCost;

      // Payment breakdown
      const payments = new Map<string, number>();
      for (const s of completed) {
        const key = (s.payment_method ?? "other").toString();
        payments.set(key, (payments.get(key) ?? 0) + Number(s.total || 0));
      }
      const paymentBreakdown = Array.from(payments.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // Sales over time (by day)
      const days = new Map<string, number>();
      const start = new Date(bounds.from);
      const end = new Date(bounds.to);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.set(d.toISOString().slice(0, 10), 0);
      }
      for (const s of completed) {
        const k = new Date(s.created_at).toISOString().slice(0, 10);
        if (days.has(k)) days.set(k, days.get(k)! + Number(s.total || 0));
      }
      const timeline = Array.from(days.entries()).map(([date, total]) => ({
        date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        total: Math.round(total * 100) / 100,
      }));

      // Top selling products
      const saleIds = completed.map((s) => s.id);
      const items = saleIds.length
        ? ((await sb.from("sale_items").select("product_name,quantity,line_total").in("sale_id", saleIds)).data ?? [])
        : [];
      const perProduct = new Map<string, { name: string; qty: number; revenue: number }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const it of items as any[]) {
        const e = perProduct.get(it.product_name) ?? { name: it.product_name, qty: 0, revenue: 0 };
        e.qty += Number(it.quantity || 0);
        e.revenue += Number(it.line_total || 0);
        perProduct.set(it.product_name, e);
      }
      const topProducts = Array.from(perProduct.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      return {
        totalSales, totalTax, totalDiscount, txCount, avgSale, grossProfit,
        paymentBreakdown, timeline, topProducts,
      };
    },
  });

  const exportCsv = () => {
    if (!data) return;
    const lines = [
      "Metric,Value",
      `Total Sales,${data.totalSales.toFixed(2)}`,
      `Transactions,${data.txCount}`,
      `Average Sale,${data.avgSale.toFixed(2)}`,
      `Gross Profit,${data.grossProfit.toFixed(2)}`,
      `Discounts,${data.totalDiscount.toFixed(2)}`,
      `Tax Collected,${data.totalTax.toFixed(2)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report-${bounds.from.toISOString().slice(0, 10)}-to-${bounds.to.toISOString().slice(0, 10)}.csv`;
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
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="h-9 w-40 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="mtd">Month to date</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4 mr-1.5" /> Export
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <SummaryCard icon={ShoppingBag} label="Total Sales" value={fmtCurrency(data?.totalSales ?? 0, currency)} tone="primary" />
          <SummaryCard icon={Receipt} label="Transactions" value={fmtNumber(data?.txCount ?? 0)} tone="primary" />
          <SummaryCard icon={TrendingUp} label="Average Sale" value={fmtCurrency(data?.avgSale ?? 0, currency)} tone="success" />
          <SummaryCard icon={DollarSign} label="Gross Profit" value={fmtCurrency(data?.grossProfit ?? 0, currency)} tone="success" />
          <SummaryCard icon={Percent} label="Discounts" value={fmtCurrency(data?.totalDiscount ?? 0, currency)} tone="warning" />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => fmtCurrency(v, currency)} />
                  <Area dataKey="total" stroke="var(--color-primary)" fill="url(#salesGrad)" strokeWidth={2.5} />
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
                <p className="text-sm text-muted-foreground py-8 text-center">No payments in this range.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-36 h-36 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data!.paymentBreakdown} dataKey="value" innerRadius={38} outerRadius={62} paddingAngle={2}>
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
                            <span className="size-2.5 rounded-full shrink-0" style={{ background: PAY_COLORS[p.name] ?? "#94a3b8" }} />
                            <span className="capitalize truncate">{p.name}</span>
                          </span>
                          <span className="font-mono text-xs">{fmtCurrency(p.value, currency)} <span className="text-muted-foreground">({pct.toFixed(1)}%)</span></span>
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
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No products sold in this range.</TableCell></TableRow>
                  ) : data!.topProducts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono">{p.qty.toFixed(0)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmtCurrency(p.revenue, currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SummaryRow label="Gross Sales" value={fmtCurrency(data?.totalSales ?? 0, currency)} />
              <SummaryRow label="Discounts" value={`-${fmtCurrency(data?.totalDiscount ?? 0, currency)}`} tone="warning" />
              <SummaryRow label="Taxes Collected" value={fmtCurrency(data?.totalTax ?? 0, currency)} />
              <SummaryRow label="Net Sales" value={fmtCurrency((data?.totalSales ?? 0) - (data?.totalTax ?? 0), currency)} />
              <div className="pt-3 border-t rounded-lg bg-success/10 p-3 -mx-1 flex items-center justify-between">
                <span className="font-semibold text-success">Gross Profit</span>
                <span className="font-mono font-bold text-lg text-success">{fmtCurrency(data?.grossProfit ?? 0, currency)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick links */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">More reports</h2>
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
      <span className={cn("font-mono font-semibold", tone === "warning" && "text-warning")}>{value}</span>
    </div>
  );
}
