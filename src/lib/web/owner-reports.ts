import { collectExportRows } from "../paginated-export";

type Sale = { id: string; total: number; tax: number; discount: number; created_at: string; payment_method: string; status: string; refunded_amount: number };
type Item = { id: string; product_name: string; quantity: number; line_total: number };
type Payment = { id: string; method: string; amount: number; status: string };
export type ReportRange = "today" | "7d" | "30d" | "mtd";
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function reportDate(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key)!.value).join("-");
}
function shiftDay(day: string, amount: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
function midnight(day: string, timeZone: string) {
  const target = Date.parse(`${day}T00:00:00Z`);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 4; i++) {
    const fields = Object.fromEntries(formatter.formatToParts(candidate).map(p => [p.type, p.value]));
    const represented = Date.parse(`${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}Z`);
    const delta = target - represented;
    if (!delta) break;
    candidate += delta;
  }
  return new Date(candidate);
}
export function reportBounds(range: ReportRange, timeZone: string, now = new Date()) {
  const today = reportDate(now, timeZone);
  const firstDay = range === "mtd" ? `${today.slice(0, 8)}01` : shiftDay(today, range === "7d" ? -6 : range === "30d" ? -29 : 0);
  return { from: midnight(firstDay, timeZone), to: new Date(midnight(shiftDay(today, 1), timeZone).getTime() - 1), firstDay, lastDay: today };
}

export async function loadOwnerReport(client: any, storeId: string, bounds: ReturnType<typeof reportBounds>, timeZone: string) {
  const sales = await collectExportRows<Sale>(after => {
    let query = client.from("sales").select("id,total,tax,discount,created_at,payment_method,status,refunded_amount")
      .eq("store_id", storeId).gte("created_at", bounds.from.toISOString()).lte("created_at", bounds.to.toISOString()).order("id").limit(500);
    if (after) query = query.gt("id", after);
    return query;
  });
  const completed = sales.filter(s => s.status === "completed");
  const items: Item[] = [], allocations: Payment[] = [];
  // Bound URL size and page each related collection; Supabase row caps must
  // never silently turn a busy merchant's report into the first 1,000 rows.
  for (let offset = 0; offset < completed.length; offset += 100) {
    const ids = completed.slice(offset, offset + 100).map(s => s.id);
    const page = <T extends { id: string }>(table: string, select: string) => collectExportRows<T>(after => {
      let query = client.from(table).select(select).in("sale_id", ids).order("id").limit(500);
      if (after) query = query.gt("id", after);
      return query;
    });
    items.push(...await page<Item>("sale_items", "id,product_name,quantity,line_total"));
    allocations.push(...await page<Payment>("sale_payments", "id,method,amount,status"));
  }
  const totalSales = money(completed.reduce((n, s) => n + Number(s.total), 0));
  const totalTax = money(completed.reduce((n, s) => n + Number(s.tax), 0));
  const totalDiscount = money(completed.reduce((n, s) => n + Number(s.discount), 0));
  const refundedAmount = money(completed.reduce((n, s) => n + Number(s.refunded_amount || 0), 0));
  const payments = new Map<string, number>();
  for (const p of allocations.filter(p => p.status === "completed")) payments.set(p.method, (payments.get(p.method) ?? 0) + Number(p.amount));
  const days = new Map<string, number>();
  for (let day = bounds.firstDay; day <= bounds.lastDay; day = shiftDay(day, 1)) days.set(day, 0);
  for (const sale of completed) {
    const day = reportDate(sale.created_at, timeZone);
    if (days.has(day)) days.set(day, days.get(day)! + Number(sale.total));
  }
  const products = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const item of items) {
    const row = products.get(item.product_name) ?? { name: item.product_name, qty: 0, revenue: 0 };
    row.qty += Number(item.quantity); row.revenue += Number(item.line_total); products.set(row.name, row);
  }
  return {
    totalSales, totalTax, totalDiscount, refundedAmount, txCount: completed.length,
    avgSale: completed.length ? money(totalSales / completed.length) : 0,
    // No historical cost is recorded on sales or sale_items. Current product
    // cost cannot truthfully be presented as profit at the time of sale.
    grossProfit: null,
    paymentBreakdown: [...payments].map(([name, value]) => ({ name, value: money(value) })).sort((a, b) => b.value - a.value),
    timeline: [...days].map(([day, total]) => ({ date: new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" }), total: money(total) })),
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
}
