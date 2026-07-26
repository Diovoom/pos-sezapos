import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { TrialCountdown } from "@/components/TrialCountdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import {
  TrendingUp,
  Receipt,
  Package,
  AlertTriangle,
  Users,
  Percent,
  RotateCcw,
  Trophy,
  Clock,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  YAxis,
} from "recharts";

const sb = supabase as any;

export const Route = createFileRoute("/_dashboard/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard  -  SEZA POS" },
      {
        name: "description",
        content:
          "Live overview of today's sales, transactions, tax, refunds, best sellers, and busiest hour.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard-today"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const week = new Date(today);
      week.setDate(week.getDate() - 7);

      const [salesRes, refundsRes, products, lowStock, store, openShifts, employeesToday] =
        await Promise.all([
          sb
            .from("sales")
            .select("id,total,subtotal,tax,discount,created_at,payment_method,cashier_id,status")
            .gte("created_at", week.toISOString())
            .order("created_at"),
          sb
            .from("refunds")
            .select("total,created_at,refund_type")
            .gte("created_at", today.toISOString()),
          sb.from("products").select("id,price,stock", { count: "exact" }),
          sb
            .from("products")
            .select("id,name,stock,min_stock")
            .lte("stock", 5)
            .order("stock")
            .limit(5),
          sb.from("stores").select("currency").limit(1).maybeSingle(),
          sb
            .from("register_sessions")
            .select("id,opened_by,opened_at,cash_sales")
            .eq("status", "open"),
          sb.from("time_entries").select("user_id").gte("clock_in", today.toISOString()),
        ]);

      const allSales = (salesRes.data ?? []) as any[];
      const completed = allSales.filter((s) => s.status === "completed");
      const todays = completed.filter((s) => new Date(s.created_at) >= today);

      const todayTotal = todays.reduce((a, s) => a + Number(s.total), 0);
      const weekTotal = completed.reduce((a, s) => a + Number(s.total), 0);
      const cashSales = todays
        .filter((s) => s.payment_method === "cash")
        .reduce((a, s) => a + Number(s.total), 0);
      const cardSales = todays
        .filter((s) => s.payment_method !== "cash")
        .reduce((a, s) => a + Number(s.total), 0);
      const totalTax = todays.reduce((a, s) => a + Number(s.tax || 0), 0);
      const totalDiscount = todays.reduce((a, s) => a + Number(s.discount || 0), 0);

      const refundAmount = (refundsRes.data ?? [])
        .filter((r: any) => r.refund_type !== "void")
        .reduce((a: number, r: any) => a + Number(r.total || 0), 0);
      const netRevenue = todayTotal - refundAmount;

      // Best-selling product & busiest hour (today only)
      const saleIds = todays.map((s) => s.id);
      const items = saleIds.length
        ? ((
            await sb
              .from("sale_items")
              .select("product_name,quantity,line_total")
              .in("sale_id", saleIds)
          ).data ?? [])
        : [];
      const perProduct = new Map<string, { name: string; qty: number; revenue: number }>();

      for (const it of items as any[]) {
        const e = perProduct.get(it.product_name) ?? { name: it.product_name, qty: 0, revenue: 0 };
        e.qty += Number(it.quantity || 0);
        e.revenue += Number(it.line_total || 0);
        perProduct.set(it.product_name, e);
      }
      const topProducts = Array.from(perProduct.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      const bestSelling = topProducts[0]?.name ?? " - ";

      const byHour = new Array(24).fill(0).map((_, h) => ({ hour: h, sales: 0, count: 0 }));
      for (const s of todays) {
        const h = new Date(s.created_at).getHours();
        byHour[h].sales += Number(s.total);
        byHour[h].count += 1;
      }
      const busiestHour = byHour.reduce((best, x) => (x.count > best.count ? x : best), byHour[0]);
      const hourlyChart = byHour.filter((h) => h.count > 0);

      // 7-day trend
      const buckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        buckets[d.toISOString().slice(0, 10)] = 0;
      }
      for (const s of completed) {
        const key = new Date(s.created_at).toISOString().slice(0, 10);
        if (key in buckets) buckets[key] += Number(s.total);
      }
      const chart = Object.entries(buckets).map(([date, total]) => ({
        date: new Date(date).toLocaleDateString(undefined, { weekday: "short" }),
        total: Math.round(total * 100) / 100,
      }));

      const inventoryValue = (products.data ?? []).reduce(
        (s: number, p: any) => s + Number(p.price) * Number(p.stock),
        0,
      );

      const employeesWorked = new Set((employeesToday.data ?? []).map((t: any) => t.user_id)).size;

      const openShiftCount = (openShifts.data ?? []).length;
      const itemsSold = items.length;

      return {
        todayTotal,
        weekTotal,
        cashSales,
        cardSales,
        totalTax,
        totalDiscount,
        refundAmount,
        netRevenue,
        txCount: todays.length,
        itemsSold,
        bestSelling,
        busiestHour: busiestHour.count > 0 ? `${busiestHour.hour}:00` : " - ",
        employeesWorked,
        openShiftCount,
        topProducts,
        hourlyChart,
        chart,
        productCount: products.count ?? 0,
        inventoryValue,
        lowStock: lowStock.data ?? [],
        currency: store.data?.currency ?? "USD",
      };
    },
  });

  const cur = data?.currency ?? "USD";

  return (
    <>
      <PageHeader
        title="Daily Summary"
        subtitle="Live overview of today's business · updates every 30s"
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <TrialCountdown />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi
            icon={TrendingUp}
            label="Today's sales"
            value={fmtCurrency(data?.todayTotal ?? 0, cur)}
          />
          <Kpi icon={Receipt} label="Transactions" value={fmtNumber(data?.txCount ?? 0)} />
          <Kpi icon={Package} label="Items sold" value={fmtNumber(data?.itemsSold ?? 0)} />
          <Kpi icon={Wallet} label="Cash sales" value={fmtCurrency(data?.cashSales ?? 0, cur)} />
          <Kpi icon={Wallet} label="Card sales" value={fmtCurrency(data?.cardSales ?? 0, cur)} />
          <Kpi icon={Percent} label="Tax collected" value={fmtCurrency(data?.totalTax ?? 0, cur)} />
          <Kpi icon={RotateCcw} label="Refunds" value={fmtCurrency(data?.refundAmount ?? 0, cur)} />
          <Kpi
            icon={Percent}
            label="Discounts"
            value={fmtCurrency(data?.totalDiscount ?? 0, cur)}
          />
          <Kpi
            icon={TrendingUp}
            label="Net revenue"
            value={fmtCurrency(data?.netRevenue ?? 0, cur)}
            highlight
          />
          <Kpi icon={Trophy} label="Best seller" value={data?.bestSelling ?? " - "} small />
          <Kpi icon={Clock} label="Busiest hour" value={data?.busiestHour ?? " - "} />
          <Kpi icon={Users} label="Employees today" value={fmtNumber(data?.employeesWorked ?? 0)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Sales · last 7 days</CardTitle>
              <span className="text-xs text-muted-foreground">
                Week total: {fmtCurrency(data?.weekTotal ?? 0, cur)}
              </span>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.chart ?? []}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
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
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => fmtCurrency(v, cur)}
                  />
                  <Area
                    dataKey="total"
                    stroke="var(--color-primary)"
                    fill="url(#g)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales by hour · today</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {(data?.hourlyChart?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground">No sales yet today.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data!.hourlyChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip
                      formatter={(v: number) => fmtCurrency(v, cur)}
                      labelFormatter={(h) => `${h}:00`}
                    />
                    <Bar dataKey="sales" fill="var(--color-primary)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Top products today</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.topProducts?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No products sold yet today.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="py-2">Product</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.topProducts.map((p, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">{p.name}</td>
                        <td className="text-right tabular-nums">{p.qty.toFixed(2)}</td>
                        <td className="text-right tabular-nums">{fmtCurrency(p.revenue, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="size-4" /> Register status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Open shifts</span>
                <span className="text-xl font-semibold">{data?.openShiftCount ?? 0}</span>
              </div>
              <Link to="/register" className="block text-sm text-primary hover:underline">
                Open / close register →
              </Link>
              <Link to="/shifts" className="block text-sm text-primary hover:underline">
                All shift reports →
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" /> Low stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.lowStock?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">All products are well stocked.</p>
            ) : (
              <div className="divide-y">
                {data!.lowStock.map((p: { id: string; name: string; stock: number }) => (
                  <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="font-mono text-warning">{Number(p.stock)} left</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  highlight,
  small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {label}
          </span>
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <div className={`font-bold font-mono ${small ? "text-sm truncate" : "text-xl"}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
