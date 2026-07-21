// Build an ESC/POS shift-summary receipt and send it to the active printer.
// Uses the same escposBuilder as ordinary sales; formats for 58mm/80mm.
import type { ShiftSummary } from "@/lib/shift-summary";
import { escposBuilder } from "@/lib/hardware/escpos";
import { getActivePrinter } from "@/lib/hardware";

const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;

function width(paper: "58" | "80") { return paper === "80" ? 42 : 32; }
function line(cols: number) { return "-".repeat(cols); }
function pad(label: string, value: string, cols: number) {
  const room = Math.max(1, cols - label.length - value.length);
  return label + " ".repeat(room) + value;
}

export async function printShiftSummary(d: ShiftSummary): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const paper = ((typeof window !== "undefined" && window.localStorage.getItem("pos.receipt.paperWidth")) || "58") as "58" | "80";
  const cols = width(paper);
  const b = escposBuilder;
  const parts: Uint8Array[] = [];
  parts.push(b.init());
  parts.push(b.align("center"));
  parts.push(b.bold(true));
  parts.push(b.text("REGISTER SHIFT SUMMARY\n"));
  parts.push(b.bold(false));
  parts.push(b.text(`${d.store?.name ?? ""}\n`));
  parts.push(b.text(`${new Date().toLocaleString()}\n`));
  parts.push(b.align("left"));
  parts.push(b.text(line(cols) + "\n"));
  parts.push(b.text(pad("Shift", d.session.id.slice(0, 8), cols) + "\n"));
  parts.push(b.text(pad("Employee", (d.cashier?.full_name ?? "—").slice(0, cols - 10), cols) + "\n"));
  parts.push(b.text(pad("Register", (d.terminal?.label ?? "Default").slice(0, cols - 10), cols) + "\n"));
  parts.push(b.text(pad("Opened", new Date(d.session.opened_at).toLocaleString(), cols) + "\n"));
  parts.push(b.text(pad("Closed", d.session.closed_at ? new Date(d.session.closed_at).toLocaleString() : "—", cols) + "\n"));
  parts.push(b.text(line(cols) + "\n"));
  parts.push(b.bold(true)); parts.push(b.text("Sales\n")); parts.push(b.bold(false));
  parts.push(b.text(pad("Transactions", String(d.salesSummary.totalTx), cols) + "\n"));
  parts.push(b.text(pad("Gross", fmt(d.salesSummary.grossSales), cols) + "\n"));
  parts.push(b.text(pad("Discounts", fmt(d.salesSummary.totalDiscount), cols) + "\n"));
  parts.push(b.text(pad("Tax", fmt(d.salesSummary.totalTax), cols) + "\n"));
  parts.push(b.text(pad("Net", fmt(d.salesSummary.netSales), cols) + "\n"));
  parts.push(b.text(line(cols) + "\n"));
  parts.push(b.bold(true)); parts.push(b.text("Payments\n")); parts.push(b.bold(false));
  for (const [k, v] of Object.entries(d.paymentSummary.byMethod)) {
    parts.push(b.text(pad(k, fmt(v as number), cols) + "\n"));
  }
  parts.push(b.text(pad("Grand total", fmt(d.paymentSummary.grandTotal), cols) + "\n"));
  parts.push(b.text(line(cols) + "\n"));
  parts.push(b.bold(true)); parts.push(b.text("Cash reconciliation\n")); parts.push(b.bold(false));
  parts.push(b.text(pad("Opening", fmt(d.session.opening_cash ?? 0), cols) + "\n"));
  parts.push(b.text(pad("Cash sales", fmt(d.session.cash_sales ?? 0), cols) + "\n"));
  parts.push(b.text(pad("Refunds", `-${fmt(d.session.cash_refunds ?? 0)}`, cols) + "\n"));
  parts.push(b.text(pad("Safe drops", `-${fmt(d.safeDropTotal)}`, cols) + "\n"));
  parts.push(b.text(pad("Expected", fmt(d.session.expected_cash ?? 0), cols) + "\n"));
  parts.push(b.text(pad("Counted", d.session.closing_cash != null ? fmt(d.session.closing_cash) : "—", cols) + "\n"));
  if (d.session.closing_cash != null) {
    const v = Number(d.session.closing_cash) - Number(d.session.expected_cash ?? 0);
    parts.push(b.text(pad("Over/short", (v > 0 ? "+" : "") + fmt(v), cols) + "\n"));
  }
  parts.push(b.text(line(cols) + "\n"));
  parts.push(b.align("center"));
  parts.push(b.text("SEZA POS\n\n\n"));
  parts.push(b.cut());

  const bytes = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let off = 0;
  for (const p of parts) { bytes.set(p, off); off += p.length; }

  const printer = getActivePrinter();
  if (printer.id === "none" || !(await printer.isReady())) {
    return { ok: false, error: "Printer is not configured." };
  }
  try {
    // Use the raw write path for ESC/POS printers.
    const escposBle = await import("@/lib/hardware/escpos-ble");
    await escposBle.write(bytes);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Printer error" };
  }
}
