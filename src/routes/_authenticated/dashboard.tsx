import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import { TrendingUp, Receipt, Package, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const week = new Date(today);
      week.setDate(week.getDate() - 7);

      const [sales, products, lowStock, store] = await Promise.all([
        supabase.from("sales").select("total,created_at,payment_method").gte("created_at", week.toISOString()).order("created_at"),
        supabase.from("products").select("id,price,stock", { count: "exact" }),
        supabase.from("products").select("id,name,stock,min_stock").lte("stock", 5).order("stock").limit(5),
        supabase.from("stores").select("currency").limit(1).maybeSingle(),
      ]);

      const allSales = sales.data ?? [];
      const todays = allSales.filter((s) => new Date(s.created_at) >= today);
      const weekTotal = allSales.reduce((s, r) => s + Number(r.total), 0);
      const todayTotal = todays.reduce((s, r) => s + Number(r.total), 0);
      const inventoryValue = (products.data ?? []).reduce((s, p) => s + Number(p.price) * Number(p.stock), 0);

      // Daily buckets
      const buckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        buckets[d.toISOString().slice(0, 10)] = 0;
      }
      for (const s of allSales) {
        const key = new Date(s.created_at).toISOString().slice(0, 10);
        if (key in buckets) buckets[key] += Number(s.total);
      }
      const chart = Object.entries(buckets).map(([date, total]) => ({
        date: new Date(date).toLocaleDateString(undefined, { weekday: "short" }),
        total: Math.round(total * 100) / 100,
      }));

      return {
        todayTotal,
        weekTotal,
        txCount: todays.length,
        productCount: products.count ?? 0,
        inventoryValue,
        lowStock: lowStock.data ?? [],
        chart,
        currency: store.data?.currency ?? "USD",
      };
    },
  });

  const cur = data?.currency ?? "USD";

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Today's snapshot" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Kpi icon={TrendingUp} label="Today's sales" value={fmtCurrency(data?.todayTotal ?? 0, cur)} />
          <Kpi icon={Receipt} label="Transactions" value={fmtNumber(data?.txCount ?? 0)} />
          <Kpi icon={Package} label="Inventory value" value={fmtCurrency(data?.inventoryValue ?? 0, cur)} />
          <Kpi icon={TrendingUp} label="7-day sales" value={fmtCurrency(data?.weekTotal ?? 0, cur)} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Sales · last 7 days</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chart ?? []}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtCurrency(v, cur)}
                />
                <Area dataKey="total" stroke="var(--color-primary)" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

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
                {data!.lowStock.map((p) => (
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

function Kpi({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold font-mono">{value}</div>
      </CardContent>
    </Card>
  );
}
