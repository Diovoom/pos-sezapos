// Shift summary aggregator. Given a register_session_id, fetch and compute
// every metric the end-of-shift report needs. Pure data — no UI.
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ShiftSummary = Awaited<ReturnType<typeof fetchShiftSummary>>;

export async function fetchShiftSummary(sessionId: string) {
  const { data: session } = await sb.from("register_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Shift not found");

  const [store, cashier, sales, refunds, timeEntry, terminal, movements, noSales, approver] = await Promise.all([
    sb.from("stores").select("*").eq("id", session.store_id).maybeSingle(),
    sb.from("profiles").select("id, full_name, first_name, last_name, email, employee_id").eq("id", session.opened_by).maybeSingle(),
    sb.from("sales").select("id, receipt_number, cashier_id, subtotal, tax, discount, total, payment_method, amount_tendered, change_due, status, created_at, refunded_amount")
      .eq("register_session_id", sessionId).order("created_at"),
    sb.from("refunds").select("id, sale_id, cashier_id, approver_id, refund_type, reason, notes, total, payment_method, status, created_at, sales!inner(receipt_number, register_session_id)")
      .eq("sales.register_session_id", sessionId).order("created_at"),
    session.opened_by ? sb.from("time_entries").select("*").eq("user_id", session.opened_by)
      .gte("clock_in", session.opened_at).order("clock_in").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    session.terminal_id ? sb.from("payment_terminals").select("*").eq("id", session.terminal_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("cash_movements").select("id, type, amount, reason, notes, created_at, user_id")
      .eq("register_session_id", sessionId).order("created_at"),
    sb.from("audit_log").select("id, actor_id, actor_email, details, created_at")
      .eq("action", "drawer.no_sale_open").eq("entity_id", sessionId).order("created_at"),
    session.approver_id ? sb.from("profiles").select("id, full_name, email").eq("id", session.approver_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const saleIds = (sales.data ?? []).map((s: { id: string }) => s.id);
  const items = saleIds.length
    ? (await sb.from("sale_items").select("*").in("sale_id", saleIds)).data ?? []
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (sales.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (refunds.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const it = items as any[];

  const completedSales = s.filter((x) => x.status === "completed");
  const voidedSales = s.filter((x) => x.status === "voided");

  // Sales aggregates
  const totalTx = completedSales.length;
  const totalItems = it.length;
  const totalQty = it.reduce((a, x) => a + Number(x.quantity || 0), 0);
  const grossSales = completedSales.reduce((a, x) => a + Number(x.subtotal || 0), 0);
  const netSales = completedSales.reduce((a, x) => a + Number(x.total || 0) - Number(x.tax || 0), 0);
  const totalTax = completedSales.reduce((a, x) => a + Number(x.tax || 0), 0);
  const totalDiscount = completedSales.reduce((a, x) => a + Number(x.discount || 0), 0);
  const totals = completedSales.map((x) => Number(x.total || 0));
  const highestSale = totals.length ? Math.max(...totals) : 0;
  const lowestSale = totals.length ? Math.min(...totals) : 0;
  const avgTx = totalTx ? completedSales.reduce((a, x) => a + Number(x.total || 0), 0) / totalTx : 0;
  const avgItems = totalTx ? totalItems / totalTx : 0;

  // Payment methods
  const paymentKinds = ["cash", "card", "tap", "apple_pay", "google_pay", "gift_card", "split", "store_credit"] as const;
  const byMethod = Object.fromEntries(paymentKinds.map((k) => [k, 0])) as Record<typeof paymentKinds[number], number>;
  for (const x of completedSales) {
    const m = x.payment_method as typeof paymentKinds[number];
    if (m in byMethod) byMethod[m] += Number(x.total || 0);
  }
  const totalCashReceived = completedSales.filter((x) => x.payment_method === "cash").reduce((a, x) => a + Number(x.amount_tendered || x.total || 0), 0);
  const totalChangeGiven = completedSales.filter((x) => x.payment_method === "cash").reduce((a, x) => a + Number(x.change_due || 0), 0);
  const totalCardSales = byMethod.card + byMethod.tap + byMethod.apple_pay + byMethod.google_pay;
  const grandTotal = completedSales.reduce((a, x) => a + Number(x.total || 0), 0);

  // Refunds
  const refundAmount = r.filter((x) => x.refund_type !== "void").reduce((a, x) => a + Number(x.total || 0), 0);
  const voidCount = r.filter((x) => x.refund_type === "void").length;
  const exchanges = r.filter((x) => x.refund_type === "exchange").length;
  const storeCreditIssued = r.filter((x) => x.payment_method === "store_credit").reduce((a, x) => a + Number(x.total || 0), 0);

  // Top / lowest products
  const perProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const x of it) {
    const key = x.product_id ?? x.product_name;
    const entry = perProduct.get(key) ?? { name: x.product_name, qty: 0, revenue: 0 };
    entry.qty += Number(x.quantity || 0);
    entry.revenue += Number(x.line_total || 0);
    perProduct.set(key, entry);
  }
  const productsSorted = Array.from(perProduct.values()).sort((a, b) => b.qty - a.qty);
  const topProducts = productsSorted.slice(0, 10);
  const lowestProducts = productsSorted.slice(-5).reverse();

  // Sales by hour
  const byHour = new Map<number, { hour: number; sales: number; count: number }>();
  for (let h = 0; h < 24; h++) byHour.set(h, { hour: h, sales: 0, count: 0 });
  for (const x of completedSales) {
    const h = new Date(x.created_at).getHours();
    const e = byHour.get(h)!;
    e.sales += Number(x.total || 0);
    e.count += 1;
  }
  const hourly = Array.from(byHour.values());

  // Duration
  const start = new Date(session.opened_at).getTime();
  const end = session.closed_at ? new Date(session.closed_at).getTime() : Date.now();
  const durationMin = Math.round((end - start) / 60000);

  return {
    session,
    store: store.data,
    cashier: cashier.data,
    terminal: terminal?.data ?? null,
    timeEntry: timeEntry?.data ?? null,
    durationMin,
    sales: completedSales,
    voidedSales,
    refunds: r,
    items: it,
    // sections
    salesSummary: {
      totalTx, totalItems, totalQty, grossSales, netSales, totalTax, totalDiscount,
      avgTx, highestSale, lowestSale, avgItems,
    },
    paymentSummary: { byMethod, totalCashReceived, totalChangeGiven, totalCardSales, grandTotal },
    refundSummary: { refundAmount, voidCount, exchanges, storeCreditIssued, refundCount: r.length - voidCount },
    products: { top: topProducts, lowest: lowestProducts, total: productsSorted.length },
    hourly,
  };
}
