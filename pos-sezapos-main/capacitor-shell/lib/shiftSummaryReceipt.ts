// Build an ESC/POS shift-summary receipt and send it to the active printer.
import type { ShiftSummary } from "@/lib/shift-summary";
import { escposBuilder } from "@/lib/hardware/escpos";
import { getActivePrinter } from "@/lib/hardware";

const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const enc = new TextEncoder();

function width(paper: "58" | "80") { return paper === "80" ? 42 : 32; }
function line(cols: number) { return "-".repeat(cols); }
function pad(label: string, value: string, cols: number) {
  const room = Math.max(1, cols - label.length - value.length);
  return label + " ".repeat(room) + value;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export async function printShiftSummary(d: ShiftSummary): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const paper = ((typeof window !== "undefined" && window.localStorage.getItem("pos.receipt.paperWidth")) || "58") as "58" | "80";
  const cols = width(paper);
  const b = escposBuilder;
  const parts: Uint8Array[] = [];
  parts.push(b.init(), b.align("center"), b.bold(true), enc.encode("REGISTER SHIFT SUMMARY\n"), b.bold(false));
  parts.push(enc.encode(`${d.store?.name ?? ""}\n${new Date().toLocaleString()}\n`));
  parts.push(b.align("left"), enc.encode(line(cols) + "\n"));
  parts.push(enc.encode(pad("Shift", d.session.id.slice(0, 8), cols) + "\n"));
  parts.push(enc.encode(pad("Employee", (d.cashier?.full_name ?? "—").slice(0, cols - 10), cols) + "\n"));
  parts.push(enc.encode(pad("Register", (d.terminal?.label ?? "Default").slice(0, cols - 10), cols) + "\n"));
  parts.push(enc.encode(pad("Opened", new Date(d.session.opened_at).toLocaleTimeString(), cols) + "\n"));
  parts.push(enc.encode(pad("Closed", d.session.closed_at ? new Date(d.session.closed_at).toLocaleTimeString() : "—", cols) + "\n"));
  parts.push(enc.encode(line(cols) + "\n"));
  parts.push(b.bold(true), enc.encode("Sales\n"), b.bold(false));
  parts.push(enc.encode(pad("Transactions", String(d.salesSummary.totalTx), cols) + "\n"));
  parts.push(enc.encode(pad("Gross", fmt(d.salesSummary.grossSales), cols) + "\n"));
  parts.push(enc.encode(pad("Discounts", fmt(d.salesSummary.totalDiscount), cols) + "\n"));
  parts.push(enc.encode(pad("Tax", fmt(d.salesSummary.totalTax), cols) + "\n"));
  parts.push(enc.encode(pad("Net", fmt(d.salesSummary.netSales), cols) + "\n"));
  parts.push(enc.encode(line(cols) + "\n"));
  parts.push(b.bold(true), enc.encode("Payments\n"), b.bold(false));
  for (const [k, v] of Object.entries(d.paymentSummary.byMethod)) {
    parts.push(enc.encode(pad(k, fmt(v as number), cols) + "\n"));
  }
  parts.push(enc.encode(pad("Grand total", fmt(d.paymentSummary.grandTotal), cols) + "\n"));
  parts.push(enc.encode(line(cols) + "\n"));
  parts.push(b.bold(true), enc.encode("Cash reconciliation\n"), b.bold(false));
  parts.push(enc.encode(pad("Opening", fmt(d.session.opening_cash ?? 0), cols) + "\n"));
  parts.push(enc.encode(pad("Cash sales", fmt(d.session.cash_sales ?? 0), cols) + "\n"));
  parts.push(enc.encode(pad("Refunds", `-${fmt(d.session.cash_refunds ?? 0)}`, cols) + "\n"));
  parts.push(enc.encode(pad("Safe drops", `-${fmt(d.safeDropTotal)}`, cols) + "\n"));
  parts.push(enc.encode(pad("Expected", fmt(d.session.expected_cash ?? 0), cols) + "\n"));
  parts.push(enc.encode(pad("Counted", d.session.closing_cash != null ? fmt(d.session.closing_cash) : "—", cols) + "\n"));
  if (d.session.closing_cash != null) {
    const v = Number(d.session.closing_cash) - Number(d.session.expected_cash ?? 0);
    parts.push(enc.encode(pad("Over/short", (v > 0 ? "+" : "") + fmt(v), cols) + "\n"));
  }
  parts.push(enc.encode(line(cols) + "\n"));
  parts.push(b.align("center"), enc.encode("SEZA POS\n\n\n"), b.cut());

  const printer = getActivePrinter();
  if (printer.id === "none" || !(await printer.isReady())) {
    return { ok: false, error: "Printer is not configured." };
  }
  try {
    const escposBle = await import("@/lib/hardware/escpos-ble");
    await escposBle.write(concat(parts));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Printer error" };
  }
}
