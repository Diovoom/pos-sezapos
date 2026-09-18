// Shift summary aggregator. Given a register_session_id, fetch and compute
// every metric the end-of-shift report needs. Pure data - no UI.
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type ShiftSummary = Awaited<ReturnType<typeof fetchShiftSummary>>;

type CategoryBucket = {
  category: string;
  quantity: number;
  netSales: number;
};

type CardBrandBucket = {
  brand: string;
  amount: number;
  count: number;
};

function readableCategory(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "No Category";
}

function metadataNumber(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object") return 0;
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = Number(record[key] ?? 0);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return 0;
}

function metadataText(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object") return "";
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = String(record[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function bucketList(map: Map<string, CategoryBucket>) {
  return Array.from(map.values()).sort((a, b) => {
    if (b.netSales !== a.netSales) return b.netSales - a.netSales;
    return a.category.localeCompare(b.category);
  });
}

export async function fetchShiftSummary(sessionId: string) {
  const { data: session } = await sb
    .from("register_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) throw new Error("Shift not found");

  const [store, cashier, sales, refunds, timeEntry, terminal, movements, noSales, approver] =
    await Promise.all([
      sb.from("stores").select("*").eq("id", session.store_id).maybeSingle(),
      sb
        .from("profiles")
        .select("id, full_name, first_name, last_name, email, employee_id")
        .eq("id", session.opened_by)
        .maybeSingle(),
      sb
        .from("sales")
        .select(
          "id, receipt_number, cashier_id, subtotal, tax, discount, total, payment_method, amount_tendered, change_due, status, created_at, refunded_amount",
        )
        .eq("register_session_id", sessionId)
        .order("created_at"),
      sb
        .from("refunds")
        .select(
          "id, sale_id, cashier_id, approver_id, refund_type, reason, notes, total, payment_method, status, created_at, sales!inner(receipt_number, register_session_id)",
        )
        .eq("sales.register_session_id", sessionId)
        .order("created_at"),
      session.opened_by
        ? sb
            .from("time_entries")
            .select("*")
            .eq("user_id", session.opened_by)
            .gte("clock_in", session.opened_at)
            .order("clock_in")
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      session.terminal_id
        ? sb.from("payment_terminals").select("*").eq("id", session.terminal_id).maybeSingle()
        : Promise.resolve({ data: null }),
      sb
        .from("cash_movements")
        .select("id, type, amount, reason, notes, created_at, user_id")
        .eq("register_session_id", sessionId)
        .order("created_at"),
      sb
        .from("audit_log")
        .select("id, actor_id, actor_email, details, created_at")
        .eq("action", "drawer.no_sale_open")
        .eq("entity_id", sessionId)
        .order("created_at"),
      session.approver_id
        ? sb
            .from("profiles")
            .select("id, full_name, email")
            .eq("id", session.approver_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const s = (sales.data ?? []) as any[];
  const r = (refunds.data ?? []) as any[];
  const saleIds = s.map((sale: { id: string }) => sale.id);

  const [itemsResult, paymentsResult] = saleIds.length
    ? await Promise.all([
        sb.from("sale_items").select("*").in("sale_id", saleIds),
        sb
          .from("sale_payments")
          .select("sale_id, amount, method, provider, metadata, status")
          .in("sale_id", saleIds),
      ])
    : [{ data: [] }, { data: [] }];

  const it = (itemsResult.data ?? []) as any[];
  const paymentRows = (paymentsResult.data ?? []) as any[];
  const productIds = Array.from(
    new Set(it.map((item) => item.product_id).filter((value): value is string => Boolean(value))),
  );
  const productRows = productIds.length
    ? (((await sb.from("products").select("id, category_id, name").in("id", productIds)).data ?? []) as any[])
    : [];
  const categoryIds = Array.from(
    new Set(productRows.map((product) => product.category_id).filter((value): value is string => Boolean(value))),
  );
  const categoryRows = categoryIds.length
    ? (((await sb.from("categories").select("id, name").in("id", categoryIds)).data ?? []) as any[])
    : [];
  const categoryById = new Map(categoryRows.map((category) => [category.id, category.name]));
  const categoryByProduct = new Map(
    productRows.map((product) => [product.id, readableCategory(categoryById.get(product.category_id))]),
  );

  const completedSales = s.filter((sale) => sale.status === "completed");
  const voidedSales = s.filter((sale) => sale.status === "voided");
  const completedSaleIds = new Set(completedSales.map((sale) => sale.id));
  const voidedSaleIds = new Set(voidedSales.map((sale) => sale.id));
  const completedItems = it.filter((item) => completedSaleIds.has(item.sale_id));
  const salesById = new Map(s.map((sale) => [sale.id, sale]));

  // Sales aggregates
  const totalTx = completedSales.length;
  const totalItems = completedItems.length;
  const totalQty = completedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const grossSales = completedSales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
  const netSales = completedSales.reduce(
    (sum, sale) => sum + Number(sale.total || 0) - Number(sale.tax || 0),
    0,
  );
  const totalTax = completedSales.reduce((sum, sale) => sum + Number(sale.tax || 0), 0);
  const totalDiscount = completedSales.reduce((sum, sale) => sum + Number(sale.discount || 0), 0);
  const totals = completedSales.map((sale) => Number(sale.total || 0));
  const highestSale = totals.length ? Math.max(...totals) : 0;
  const lowestSale = totals.length ? Math.min(...totals) : 0;
  const avgTx = totalTx
    ? completedSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0) / totalTx
    : 0;
  const avgItems = totalTx ? totalQty / totalTx : 0;

  // Payment methods
  const paymentKinds = [
    "cash",
    "card",
    "tap",
    "apple_pay",
    "google_pay",
    "gift_card",
    "split",
    "store_credit",
  ] as const;
  const byMethod = Object.fromEntries(paymentKinds.map((kind) => [kind, 0])) as Record<
    (typeof paymentKinds)[number],
    number
  >;
  const settledPaymentRows = paymentRows.filter(
    (payment) =>
      completedSaleIds.has(payment.sale_id) &&
      (!payment.status || ["completed", "succeeded", "approved"].includes(payment.status)),
  );
  const paymentSaleIds = new Set(settledPaymentRows.map((payment) => payment.sale_id));
  const normalizePaymentMethod = (value: unknown): (typeof paymentKinds)[number] | null => {
    const method = String(value ?? "").toLowerCase();
    if (method === "tap_to_pay") return "tap";
    if (method === "manual_card") return "card";
    return (paymentKinds as readonly string[]).includes(method)
      ? (method as (typeof paymentKinds)[number])
      : null;
  };
  for (const payment of settledPaymentRows) {
    const method = normalizePaymentMethod(payment.method);
    if (method) byMethod[method] += Number(payment.amount || 0);
  }
  for (const sale of completedSales) {
    if (paymentSaleIds.has(sale.id)) continue;
    const method = normalizePaymentMethod(sale.payment_method);
    if (method) byMethod[method] += Number(sale.total || 0);
  }
  const totalCashReceived = completedSales.reduce((sum, sale) => {
    const rows = settledPaymentRows.filter((payment) => payment.sale_id === sale.id);
    if (rows.length) {
      return (
        sum +
        rows
          .filter((payment) => normalizePaymentMethod(payment.method) === "cash")
          .reduce((part, payment) => part + Number(payment.amount || 0), 0)
      );
    }
    return sum +
      (sale.payment_method === "cash"
        ? Number(sale.amount_tendered || sale.total || 0)
        : 0);
  }, 0);
  const totalChangeGiven = completedSales
    .filter((sale) => sale.payment_method === "cash")
    .reduce((sum, sale) => sum + Number(sale.change_due || 0), 0);
  const totalCardSales = byMethod.card + byMethod.tap + byMethod.apple_pay + byMethod.google_pay;
  const grandTotal = completedSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

  // Category summaries, split between cash and non-cash sales.
  const allCategories = new Map<string, CategoryBucket>();
  const cashCategories = new Map<string, CategoryBucket>();
  const nonCashCategories = new Map<string, CategoryBucket>();
  for (const item of completedItems) {
    const sale = salesById.get(item.sale_id);
    const category = readableCategory(categoryByProduct.get(item.product_id));
    const quantity = Number(item.quantity || 0);
    const amount = Number(item.line_total || 0);
    const target = sale?.payment_method === "cash" ? cashCategories : nonCashCategories;
    for (const map of [allCategories, target]) {
      const bucket = map.get(category) ?? { category, quantity: 0, netSales: 0 };
      bucket.quantity += quantity;
      bucket.netSales += amount;
      map.set(category, bucket);
    }
  }

  // Card brands, fees, tips and gratuities are read from processor metadata
  // when the connected provider supplies them. We never invent a brand.
  const cardBrands = new Map<string, CardBrandBucket>();
  let gratuityTotal = 0;
  let feeTotal = 0;
  for (const payment of paymentRows) {
    if (payment.status && !["completed", "succeeded", "approved"].includes(payment.status)) continue;
    gratuityTotal += metadataNumber(payment.metadata, ["tip", "tip_amount", "gratuity", "gratuity_amount"]);
    feeTotal += metadataNumber(payment.metadata, ["fee", "fee_amount", "service_fee", "surcharge"]);
    const method = String(payment.method ?? "").toLowerCase();
    if (!["card", "tap", "apple_pay", "google_pay"].includes(method)) continue;
    const rawBrand = metadataText(payment.metadata, ["card_brand", "brand", "network", "card_network"]);
    const brand = rawBrand || "Card - brand unavailable";
    const bucket = cardBrands.get(brand) ?? { brand, amount: 0, count: 0 };
    bucket.amount += Number(payment.amount || 0);
    bucket.count += 1;
    cardBrands.set(brand, bucket);
  }
  if (!cardBrands.size && totalCardSales > 0) {
    cardBrands.set("Card - brand unavailable", {
      brand: "Card - brand unavailable",
      amount: totalCardSales,
      count: completedSales.filter((sale) =>
        ["card", "tap", "apple_pay", "google_pay"].includes(sale.payment_method),
      ).length,
    });
  }

  // Refunds and voids
  const refundAmount = r
    .filter((refund) => refund.refund_type !== "void")
    .reduce((sum, refund) => sum + Number(refund.total || 0), 0);
  const refundVoidRows = r.filter((refund) => refund.refund_type === "void");
  const voidCount = refundVoidRows.length;
  const exchanges = r.filter((refund) => refund.refund_type === "exchange").length;
  const storeCreditIssued = r
    .filter((refund) => refund.payment_method === "store_credit")
    .reduce((sum, refund) => sum + Number(refund.total || 0), 0);
  const voidAmount =
    voidedSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0) +
    refundVoidRows.reduce((sum, refund) => sum + Number(refund.total || 0), 0);
  const voidItemCount = it
    .filter((item) => voidedSaleIds.has(item.sale_id))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const voidPercent = grossSales > 0 ? (voidAmount / grossSales) * 100 : 0;

  // Top / lowest products
  const perProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const item of completedItems) {
    const key = item.product_id ?? item.product_name;
    const entry = perProduct.get(key) ?? { name: item.product_name, qty: 0, revenue: 0 };
    entry.qty += Number(item.quantity || 0);
    entry.revenue += Number(item.line_total || 0);
    perProduct.set(key, entry);
  }
  const productsSorted = Array.from(perProduct.values()).sort((a, b) => b.qty - a.qty);
  const topProducts = productsSorted.slice(0, 10);
  const lowestProducts = productsSorted.slice(-5).reverse();

  // Gift cards sold as inventory items, not gift cards redeemed as payment.
  const giftCardItems = completedItems.filter((item) => {
    const category = readableCategory(categoryByProduct.get(item.product_id)).toLowerCase();
    const name = String(item.product_name ?? "").toLowerCase();
    return category.includes("gift card") || name.includes("gift card");
  });
  const giftCardsSold = {
    quantity: giftCardItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    amount: giftCardItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0),
  };

  // Sales by hour
  const byHour = new Map<number, { hour: number; sales: number; count: number }>();
  for (let hour = 0; hour < 24; hour += 1) byHour.set(hour, { hour, sales: 0, count: 0 });
  for (const sale of completedSales) {
    const hour = new Date(sale.created_at).getHours();
    const entry = byHour.get(hour)!;
    entry.sales += Number(sale.total || 0);
    entry.count += 1;
  }
  const hourly = Array.from(byHour.values());

  // Duration
  const start = new Date(session.opened_at).getTime();
  const end = session.closed_at ? new Date(session.closed_at).getTime() : Date.now();
  const durationMin = Math.round((end - start) / 60000);

  const movs = (movements.data ?? []) as any[];
  const safeDrops = movs.filter((movement) => movement.type === "safe_drop");
  const safeDropTotal = safeDrops.reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const deposits = movs.filter((movement) => movement.type === "deposit");
  const payouts = movs.filter((movement) => movement.type === "payout");
  const depositTotal = deposits.reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const payoutTotal = payouts.reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const expectedCash = Number(session.expected_cash ?? 0);
  const countedCash = session.closing_cash == null ? null : Number(session.closing_cash);
  const variance = countedCash == null ? null : countedCash - expectedCash;

  const noSaleEvents = (noSales.data ?? []) as any[];

  return {
    session,
    store: store.data,
    cashier: cashier.data,
    terminal: terminal?.data ?? null,
    timeEntry: timeEntry?.data ?? null,
    approver: approver?.data ?? null,
    durationMin,
    sales: completedSales,
    voidedSales,
    refunds: r,
    items: completedItems,
    movements: movs,
    safeDrops,
    safeDropTotal,
    noSaleEvents,
    // sections
    salesSummary: {
      totalTx,
      totalItems,
      totalQty,
      grossSales,
      netSales,
      totalTax,
      totalDiscount,
      avgTx,
      highestSale,
      lowestSale,
      avgItems,
    },
    paymentSummary: { byMethod, totalCashReceived, totalChangeGiven, totalCardSales, grandTotal },
    refundSummary: {
      refundAmount,
      voidCount,
      exchanges,
      storeCreditIssued,
      refundCount: r.length - voidCount,
    },
    voidSummary: {
      amount: voidAmount,
      orderCount: voidedSales.length + refundVoidRows.length,
      itemCount: voidItemCount,
      percent: voidPercent,
    },
    categorySummary: {
      all: bucketList(allCategories),
      cash: bucketList(cashCategories),
      nonCash: bucketList(nonCashCategories),
    },
    cardBrands: Array.from(cardBrands.values()).sort((a, b) => b.amount - a.amount),
    feesSummary: { gratuityTotal, feeTotal, total: gratuityTotal + feeTotal },
    cashAccount: {
      openingCash: Number(session.opening_cash ?? 0),
      cashSales: settledPaymentRows.length ? byMethod.cash : Number(session.cash_sales ?? byMethod.cash ?? 0),
      cashRefunds: Number(session.cash_refunds ?? 0),
      depositTotal,
      payoutTotal,
      safeDropTotal,
      expectedCash,
      countedCash,
      variance,
    },
    payoutDetails: payouts.map((movement) => ({
      reason: String(movement.reason ?? movement.notes ?? "Payout"),
      amount: Number(movement.amount || 0),
    })),
    giftCardsSold,
    products: { top: topProducts, lowest: lowestProducts, total: productsSorted.length },
    hourly,
  };
}
