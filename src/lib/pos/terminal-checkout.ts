// A frozen checkout contains no credentials or Stripe client secret.
export type TerminalCheckout = {
  actor_id: string;
  sale: Record<string, any> & { id: string; store_id: string };
  items: Record<string, any>[];
  payments: Record<string, any>[];
};

export function validateTerminalCheckout(value: any, actor: string, store: string, cents: number) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !value ||
    value.actor_id !== actor ||
    value.sale?.store_id !== store ||
    !uuid.test(value.sale?.id ?? "") ||
    value.sale.idempotency_key !== value.sale.id ||
    !Array.isArray(value.items) ||
    !value.items.length ||
    value.items.length > 1000 ||
    !Array.isArray(value.payments) ||
    value.payments.length > 2
  )
    throw new Error("Invalid checkout context");
  const money = (n: any) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const s = value.sale;
  if (
    !["card", "tap", "apple_pay", "google_pay", "split"].includes(s.payment_method) ||
    s.status !== "completed" ||
    s.terminal_ref ||
    !money(s.amount_tendered) ||
    !money(s.change_due)
  )
    throw new Error("Invalid checkout header");
  for (const key of [
    "subtotal",
    "tax",
    "discount",
    "total",
    "cash_base_total",
    "card_price_adjustment",
    "final_amount_charged",
  ])
    if (!money(s[key])) throw new Error("Invalid checkout totals");
  const equal = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);
  if (
    s.discount > s.subtotal ||
    !equal(s.total, s.subtotal - s.discount + s.tax) ||
    !equal(s.cash_base_total, s.total) ||
    !equal(s.final_amount_charged, s.total + s.card_price_adjustment)
  )
    throw new Error("Checkout totals differ");
  let subtotal = 0;
  for (const item of value.items) {
    if (
      (item.product_id !== null && !uuid.test(item.product_id ?? "")) ||
      !item.product_name?.trim() ||
      !money(item.quantity) ||
      item.quantity <= 0 ||
      !money(item.unit_price) ||
      !money(item.line_total) ||
      !equal(item.line_total, item.quantity * item.unit_price)
    )
      throw new Error("Invalid checkout item");
    subtotal += item.line_total;
  }
  const cards = value.payments.filter((p: any) => p.method !== "cash");
  if (
    cards.length !== 1 ||
    !["card", "tap_to_pay"].includes(cards[0].method) ||
    Math.round(cards[0].amount * 100) !== cents ||
    value.payments.some((p: any) => !money(p.amount) || p.amount <= 0 || p.provider_reference)
  )
    throw new Error("Invalid checkout payment allocation");
  if (
    !equal(subtotal, s.subtotal) ||
    !equal(
      value.payments.reduce((n: number, p: any) => n + p.amount, 0),
      s.final_amount_charged,
    )
  )
    throw new Error("Checkout allocations differ");
  return value as TerminalCheckout;
}
