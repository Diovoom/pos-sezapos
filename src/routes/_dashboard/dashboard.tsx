import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { OwnerDashboardFooter } from "@/components/OwnerDashboardFooter";
import { TrialCountdown } from "@/components/TrialCountdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  ChevronRight,
  Loader2,
  CalendarDays,
  Info,
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
type DetailKey =
  | "sales"
  | "transactions"
  | "items"
  | "cash"
  | "card"
  | "tax"
  | "refunds"
  | "discounts"
  | "net"
  | "best"
  | "hour"
  | "employees";

export const Route = createFileRoute("/_dashboard/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard - SEZA POS" },
      { name: "description", content: "Interactive daily business summary for SEZA POS owners." },
    ],
  }),
  component: DashboardPage,
});

function hourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });
}

function DashboardPage() {
  const { data: me } = useMe();
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const ownerFirstName = String(me?.profile?.full_name || me?.user?.email || "Owner").trim().split(/\s+/)[0];
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-day", selectedDate, me?.store?.id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const today = new Date(`${selectedDate}T00:00:00`);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const week = new Date(today);
      week.setDate(week.getDate() - 6);

      const [salesRes, refundsRes, products, lowStock, store, openShifts, timeEntries] =
        await Promise.all([
          sb
            .from("sales")
            .select("id,receipt_number,total,subtotal,tax,discount,created_at,payment_method,cashier_id,status")
            .gte("created_at", week.toISOString())
            .lt("created_at", tomorrow.toISOString())
            .order("created_at", { ascending: false }),
          sb
            .from("refunds")
            .select("id,total,created_at,refund_type,reason,sale_id")
            .gte("created_at", today.toISOString())
            .lt("created_at", tomorrow.toISOString())
            .order("created_at", { ascending: false }),
          sb.from("products").select("id,price,stock", { count: "exact" }),
          sb
            .from("products")
            .select("id,name,stock,min_stock")
            .lte("stock", 5)
            .order("stock")
            .limit(8),
          sb.from("stores").select("currency").limit(1).maybeSingle(),
          sb.from("register_sessions").select("id,opened_by,opened_at,cash_sales").eq("status", "open"),
          sb
            .from("time_entries")
            .select("user_id,clock_in,clock_out")
            .gte("clock_in", today.toISOString())
            .lt("clock_in", tomorrow.toISOString())
            .order("clock_in", { ascending: false }),
        ]);

      if (salesRes.error) throw salesRes.error;
      if (refundsRes.error) throw refundsRes.error;

      const allSales = (salesRes.data ?? []) as any[];
      const completed = allSales.filter((s) => s.status === "completed");
      const todays = completed.filter((s) => { const created = new Date(s.created_at); return created >= today && created < tomorrow; });
      const previousDaySales = completed.filter((s) => { const created = new Date(s.created_at); return created >= yesterday && created < today; });
      const previousTotal = previousDaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
      const todayTotal = todays.reduce((a, s) => a + Number(s.total || 0), 0);
      const cashSales = todays.filter((s) => s.payment_method === "cash");
      const cardSales = todays.filter((s) => s.payment_method !== "cash");
      const cashTotal = cashSales.reduce((a, s) => a + Number(s.total || 0), 0);
      const cardTotal = cardSales.reduce((a, s) => a + Number(s.total || 0), 0);
      const totalTax = todays.reduce((a, s) => a + Number(s.tax || 0), 0);
      const totalDiscount = todays.reduce((a, s) => a + Number(s.discount || 0), 0);
      const refunds = (refundsRes.data ?? []) as any[];
      const refundAmount = refunds
        .filter((r) => r.refund_type !== "void")
        .reduce((a, r) => a + Number(r.total || 0), 0);
      const netRevenue = todayTotal - refundAmount;

      const saleIds = todays.map((s) => s.id);
      const items = saleIds.length
        ? (((await sb.from("sale_items").select("sale_id,product_name,quantity,line_total").in("sale_id", saleIds)).data ?? []) as any[])
        : [];
      const perProduct = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const item of items) {
        const name = item.product_name || "Unnamed item";
        const current = perProduct.get(name) ?? { name, qty: 0, revenue: 0 };
        current.qty += Number(item.quantity || 0);
        current.revenue += Number(item.line_total || 0);
        perProduct.set(name, current);
      }
      const topProducts = Array.from(perProduct.values()).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
      const itemsSold = topProducts.reduce((sum, item) => sum + item.qty, 0);

      const hourlyChart = new Array(24).fill(0).map((_, hour) => ({
        hour,
        label: hourLabel(hour),
        sales: 0,
        transactions: 0,
        items: 0,
      }));
      for (const sale of todays) {
        const hour = new Date(sale.created_at).getHours();
        hourlyChart[hour].sales += Number(sale.total || 0);
        hourlyChart[hour].transactions += 1;
      }
      for (const item of items) {
        const sale = todays.find((candidate) => candidate.id === item.sale_id);
        if (sale) hourlyChart[new Date(sale.created_at).getHours()].items += Number(item.quantity || 0);
      }
      const busiestHour = hourlyChart.reduce(
        (best, current) => current.transactions > best.transactions ? current : best,
        hourlyChart[0],
      );

      const buckets: Record<string, number> = {};
      for (let index = 6; index >= 0; index--) {
        const date = new Date(today);
        date.setDate(date.getDate() - index);
        buckets[date.toISOString().slice(0, 10)] = 0;
      }
      for (const sale of completed) {
        const key = new Date(sale.created_at).toISOString().slice(0, 10);
        if (key in buckets) buckets[key] += Number(sale.total || 0);
      }
      const chart = Object.entries(buckets).map(([date, total]) => ({
        date: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
        total: Math.round(total * 100) / 100,
      }));

      const employeeIds = [...new Set((timeEntries.data ?? []).map((entry: any) => entry.user_id).filter(Boolean))];
      const employeeProfiles = employeeIds.length
        ? (((await sb.from("profiles").select("id,full_name,employee_id").in("id", employeeIds)).data ?? []) as any[])
        : [];
      const employeeMap = new Map(employeeProfiles.map((profile) => [profile.id, profile]));
      const employees = (timeEntries.data ?? []).map((entry: any) => ({
        ...entry,
        name: employeeMap.get(entry.user_id)?.full_name ?? "Employee",
        employeeId: employeeMap.get(entry.user_id)?.employee_id ?? null,
      }));

      return {
        todayTotal,
        previousTotal,
        cashTotal,
        cardTotal,
        totalTax,
        totalDiscount,
        refundAmount,
        netRevenue,
        txCount: todays.length,
        itemsSold,
        bestSelling: topProducts[0]?.name ?? "No sales yet",
        busiestHour: busiestHour.transactions ? busiestHour.label : "No sales yet",
        busiestHourData: busiestHour,
        employeesWorked: employeeIds.length,
        openShiftCount: (openShifts.data ?? []).length,
        topProducts,
        hourlyChart,
        chart,
        lowStock: lowStock.data ?? [],
        currency: store.data?.currency ?? "USD",
        todays,
        cashSales,
        cardSales,
        refunds,
        employees,
        weekTotal: Object.values(buckets).reduce((sum, total) => sum + total, 0),
      };
    },
  });

  const cur = data?.currency ?? "USD";
  const kpis = [
    { key: "sales" as const, icon: TrendingUp, label: "Today's sales", value: fmtCurrency(data?.todayTotal ?? 0, cur) },
    { key: "transactions" as const, icon: Receipt, label: "Transactions", value: fmtNumber(data?.txCount ?? 0) },
    { key: "items" as const, icon: Package, label: "Items sold", value: fmtNumber(data?.itemsSold ?? 0) },
    { key: "cash" as const, icon: Wallet, label: "Cash sales", value: fmtCurrency(data?.cashTotal ?? 0, cur) },
    { key: "card" as const, icon: Wallet, label: "Card sales", value: fmtCurrency(data?.cardTotal ?? 0, cur) },
    { key: "tax" as const, icon: Percent, label: "Tax collected", value: fmtCurrency(data?.totalTax ?? 0, cur) },
    { key: "refunds" as const, icon: RotateCcw, label: "Refunds", value: fmtCurrency(data?.refundAmount ?? 0, cur) },
    { key: "discounts" as const, icon: Percent, label: "Discounts", value: fmtCurrency(data?.totalDiscount ?? 0, cur) },
    { key: "net" as const, icon: TrendingUp, label: "Net revenue", value: fmtCurrency(data?.netRevenue ?? 0, cur), highlight: true },
    { key: "best" as const, icon: Trophy, label: "Best seller", value: data?.bestSelling ?? "No sales yet", small: true },
    { key: "hour" as const, icon: Clock, label: "Busiest hour", value: data?.busiestHour ?? "No sales yet" },
    { key: "employees" as const, icon: Users, label: "Employees today", value: fmtNumber(data?.employeesWorked ?? 0) },
  ];

  const selected = new Date(`${selectedDate}T12:00:00`);
  const todayKey = (() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; })();
  const isToday = selectedDate === todayKey;
  const periodName = isToday ? "Today" : selected.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const prior = new Date(selected); prior.setDate(prior.getDate() - 1);
  const comparisonName = isToday ? "Yesterday" : prior.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const comparisonChange = data?.previousTotal ? (((data.todayTotal - data.previousTotal) / data.previousTotal) * 100) : null;

  return (
    <>
      <div className="space-y-6 p-4 md:p-6">
        <section className="rounded-3xl border bg-gradient-to-br from-background via-background to-primary/5 p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">Owner overview</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">Welcome, {ownerFirstName}!</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-lg font-bold">
                <span>{periodName}</span><span className="font-normal text-muted-foreground">vs.</span><span>{comparisonName}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Data updates every 30 seconds</span><Info className="size-4" />
                {comparisonChange !== null ? <span className={comparisonChange >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-destructive"}>{comparisonChange >= 0 ? "+" : ""}{comparisonChange.toFixed(1)}% sales</span> : null}
              </div>
            </div>
            <Button variant="outline" className="gap-2 self-start rounded-full lg:self-auto" onClick={() => setDateDialogOpen(true)}>
              <CalendarDays className="size-4" /> Edit date
            </Button>
          </div>
        </section>
        <TrialCountdown />
        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Loading today's summary…</div>
        ) : isError ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Today's summary could not be loaded. Please refresh or try again shortly.</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {kpis.map(({ key, ...kpi }) => <Kpi key={key} {...kpi} onClick={() => setDetail(key)} />)}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Sales · last 7 days</CardTitle>
                  <span className="text-xs text-muted-foreground">Week total: {fmtCurrency(data?.weekTotal ?? 0, cur)}</span>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.chart ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value: number) => fmtCurrency(value, cur)} />
                      <Area dataKey="total" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.14} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="cursor-pointer transition hover:border-primary/40" onClick={() => setDetail("hour")}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Busiest times · today</CardTitle>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.hourlyChart ?? []}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="hour" tickFormatter={(hour) => hour % 3 === 0 ? hourLabel(hour) : ""} fontSize={10} />
                      <YAxis allowDecimals={false} fontSize={11} />
                      <Tooltip labelFormatter={(hour) => hourLabel(Number(hour))} />
                      <Bar dataKey="transactions" name="Transactions" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="cursor-pointer lg:col-span-2" onClick={() => setDetail("best")}>
                <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Top products today</CardTitle><ChevronRight className="size-4 text-muted-foreground" /></CardHeader>
                <CardContent><ProductRanking products={(data?.topProducts ?? []).slice(0, 5)} currency={cur} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" /> Register status</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Open shifts</span><span className="text-xl font-semibold">{data?.openShiftCount ?? 0}</span></div>
                  <Link to="/shifts" className="block text-sm text-primary hover:underline">Review shifts and time clock →</Link>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-warning" /> Low stock</CardTitle></CardHeader>
              <CardContent>
                {(data?.lowStock?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">All products are well stocked.</p> : (
                  <div className="divide-y">{data!.lowStock.map((product: any) => <div key={product.id} className="flex items-center justify-between py-3 text-sm"><span className="font-medium">{product.name}</span><span className="font-mono text-warning">{Number(product.stock)} left</span></div>)}</div>
                )}
              </CardContent>
            </Card>
          </>
        )}
        <OwnerDashboardFooter />
      </div>
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose a business date</DialogTitle>
            <DialogDescription>Daily Summary will compare the selected date with the day before it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input type="date" value={selectedDate} max={todayKey} onChange={(event) => setSelectedDate(event.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedDate(todayKey)}>Today</Button>
              <Button onClick={() => setDateDialogOpen(false)}>View summary</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <SummaryDialog detail={detail} onOpenChange={(open: boolean) => !open && setDetail(null)} data={data} currency={cur} />
    </>
  );
}

function Kpi({ icon: Icon, label, value, highlight, small, onClick }: any) {
  return (
    <button type="button" className="min-w-0 text-left" onClick={onClick}>
      <Card className={`h-full transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
        <CardContent className="p-4">
          <div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span><Icon className="size-3.5 text-muted-foreground" /></div>
          <div className={`font-mono font-bold ${small ? "truncate text-sm" : "text-xl"}`}>{value}</div>
          <div className="mt-2 flex items-center text-[10px] font-medium text-primary">View details <ChevronRight className="ml-0.5 size-3" /></div>
        </CardContent>
      </Card>
    </button>
  );
}

function ProductRanking({ products, currency }: { products: any[]; currency: string }) {
  if (!products.length) return <p className="text-sm text-muted-foreground">No products sold yet today.</p>;
  return <div className="divide-y">{products.map((product, index) => <div key={`${product.name}-${index}`} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-3"><div className="grid size-7 place-items-center rounded-full bg-muted text-xs font-bold">{index + 1}</div><div className="min-w-0"><div className="truncate font-medium">{product.name}</div><div className="text-xs text-muted-foreground">{fmtNumber(product.qty)} sold</div></div><div className="font-mono text-sm">{fmtCurrency(product.revenue, currency)}</div></div>)}</div>;
}

function SaleList({ sales, currency }: { sales: any[]; currency: string }) {
  if (!sales.length) return <p className="text-sm text-muted-foreground">No matching transactions today.</p>;
  return <div className="max-h-[55vh] divide-y overflow-y-auto">{sales.slice(0, 40).map((sale) => <div key={sale.id} className="flex items-center justify-between gap-4 py-3"><div><div className="font-medium">Receipt {sale.receipt_number || "Pending"}</div><div className="text-xs text-muted-foreground">{new Date(sale.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {String(sale.payment_method || "payment").replaceAll("_", " ")}</div></div><div className="font-mono font-semibold">{fmtCurrency(Number(sale.total || 0), currency)}</div></div>)}</div>;
}

function SummaryDialog({ detail, onOpenChange, data, currency }: any) {
  const titles: Record<DetailKey, string> = { sales: "Today's sales", transactions: "Transactions", items: "Items sold", cash: "Cash sales", card: "Card sales", tax: "Tax collected", refunds: "Refunds", discounts: "Discounts", net: "Net revenue", best: "Best sellers", hour: "Busiest hours", employees: "Employees today" };
  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        {detail && <><DialogHeader><DialogTitle>{titles[detail as DetailKey]}</DialogTitle><DialogDescription>Live details for today.</DialogDescription></DialogHeader><div className="mt-2">
          {detail === "sales" && <><div className="mb-4 grid grid-cols-2 gap-3"><Mini label="Gross sales" value={fmtCurrency(data?.todayTotal ?? 0, currency)} /><Mini label="Net revenue" value={fmtCurrency(data?.netRevenue ?? 0, currency)} /></div><SaleList sales={data?.todays ?? []} currency={currency} /></>}
          {detail === "transactions" && <SaleList sales={data?.todays ?? []} currency={currency} />}
          {detail === "items" && <ProductRanking products={data?.topProducts ?? []} currency={currency} />}
          {detail === "cash" && <SaleList sales={data?.cashSales ?? []} currency={currency} />}
          {detail === "card" && <SaleList sales={data?.cardSales ?? []} currency={currency} />}
          {detail === "tax" && <Breakdown rows={[ ["Tax collected", data?.totalTax], ["Taxable sales", data?.todayTotal] ]} currency={currency} />}
          {detail === "discounts" && <Breakdown rows={[ ["Discounts given", data?.totalDiscount], ["Gross sales", data?.todayTotal] ]} currency={currency} />}
          {detail === "net" && <Breakdown rows={[ ["Gross sales", data?.todayTotal], ["Refunds", -(data?.refundAmount ?? 0)], ["Net revenue", data?.netRevenue] ]} currency={currency} />}
          {detail === "best" && <ProductRanking products={data?.topProducts ?? []} currency={currency} />}
          {detail === "refunds" && ((data?.refunds?.length ?? 0) ? <div className="divide-y">{data.refunds.map((refund: any) => <div key={refund.id} className="flex justify-between py-3"><div><div className="font-medium">{refund.refund_type === "void" ? "Void" : "Refund"}</div><div className="text-xs text-muted-foreground">{refund.reason || "No reason entered"} · {new Date(refund.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div><div className="font-mono">{fmtCurrency(Number(refund.total || 0), currency)}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No refunds today.</p>)}
          {detail === "hour" && <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.hourlyChart ?? []}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="hour" tickFormatter={(hour) => hour % 2 === 0 ? hourLabel(hour) : ""} fontSize={10} /><YAxis allowDecimals={false} /><Tooltip labelFormatter={(hour) => hourLabel(Number(hour))} /><Bar dataKey="transactions" name="Transactions" fill="var(--color-primary)" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>}
          {detail === "employees" && ((data?.employees?.length ?? 0) ? <div className="divide-y">{data.employees.map((employee: any, index: number) => <div key={`${employee.user_id}-${index}`} className="flex justify-between py-3"><div><div className="font-medium">{employee.name}</div><div className="text-xs text-muted-foreground">{employee.employeeId ? `ID ${employee.employeeId} · ` : ""}{employee.clock_out ? "Clocked out" : "Currently clocked in"}</div></div><div className="text-sm">{new Date(employee.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No employees clocked in today.</p>)}
        </div></>}
      </DialogContent>
    </Dialog>
  );
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-mono text-lg font-bold">{value}</div></div>; }
function Breakdown({ rows, currency }: { rows: [string, number][]; currency: string }) { return <div className="divide-y rounded-lg border px-4">{rows.map(([label, value]) => <div key={label} className="flex justify-between py-4"><span>{label}</span><span className="font-mono font-semibold">{fmtCurrency(Number(value || 0), currency)}</span></div>)}</div>; }
