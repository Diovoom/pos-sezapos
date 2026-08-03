// Build a full ESC/POS shift-summary receipt and send it through the exact
// same native printer selected for sale receipts.
import type { ShiftSummary } from "@/lib/shift-summary";
import { escposBuilder } from "@/lib/hardware/escpos";
import { getActivePrinter } from "@/lib/hardware";
import { getPaperColumns } from "@/lib/hardware/native-receipt";

const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const enc = new TextEncoder();

function line(cols: number) { return "-".repeat(cols); }
function safe(value: unknown, fallback = "—") {
  const result = String(value ?? "").trim();
  return result || fallback;
}
function clip(value: unknown, width: number) {
  const text = safe(value);
  return text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text;
}
function row(label: string, value: string, cols: number) {
  const left = clip(label, Math.max(8, Math.floor(cols * 0.55)));
  const right = clip(value, Math.max(6, cols - left.length - 1));
  return `${left}${" ".repeat(Math.max(1, cols - left.length - right.length))}${right}`;
}
function wrap(value: unknown, cols: number): string[] {
  const words = safe(value, "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > cols) {
      if (current) lines.push(current);
      current = "";
      for (let index = 0; index < word.length; index += cols) lines.push(word.slice(index, index + cols));
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > cols) {
      if (current) lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function durationLabel(minutes: number) {
  const hours = Math.floor(Math.max(0, minutes) / 60);
  const mins = Math.max(0, minutes) % 60;
  return `${hours}h ${mins}m`;
}

export async function printShiftSummary(d: ShiftSummary): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const cols = getPaperColumns();
  const widePaper = cols > 32;
  const b = escposBuilder;
  const parts: Uint8Array[] = [];
  const text = (value: string) => parts.push(enc.encode(value));
  const section = (title: string) => {
    text(`${line(cols)}\n`);
    parts.push(b.bold(true));
    text(`${title.toUpperCase()}\n`);
    parts.push(b.bold(false));
  };
  const addRow = (label: string, value: string) => text(`${row(label, value, cols)}\n`);

  const session = d.session as Record<string, any>;
  const timeEntry = d.timeEntry as Record<string, any> | null;
  const movements = (d.movements ?? []) as Array<Record<string, any>>;
  const deposits = movements.filter((movement) => movement.type === "deposit");
  const payouts = movements.filter((movement) => movement.type === "payout");
  const depositTotal = deposits.reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const payoutTotal = payouts.reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const expected = Number(session.expected_cash ?? 0);
  const counted = session.closing_cash == null ? null : Number(session.closing_cash);
  const variance = counted == null ? null : counted - expected;
  const cashierName = d.cashier?.full_name ||
    `${d.cashier?.first_name ?? ""} ${d.cashier?.last_name ?? ""}`.trim() || "Unknown";

  parts.push(b.init(), b.font("a"), b.charSpacing(widePaper ? 1 : 0));
  parts.push(b.align("center"), b.bold(true));
  text("REGISTER SHIFT SUMMARY\n");
  text(`${safe(d.store?.name, "SEZA POS")}\n`);
  parts.push(b.bold(false));
  text(`${new Date().toLocaleString()}\n`);
  parts.push(b.align("left"));

  section("Shift details");
  addRow("Shift", safe(session.id).slice(0, 12));
  addRow("Employee", clip(cashierName, cols - 12));
  addRow("Employee ID", safe(d.cashier?.employee_id));
  addRow("Register", safe(d.terminal?.label ?? d.terminal?.name, "Default"));
  addRow("Terminal", safe(d.terminal?.serial_number ?? d.terminal?.id, "Not assigned"));
  addRow("Opened", new Date(session.opened_at).toLocaleString());
  addRow("Closed", session.closed_at ? new Date(session.closed_at).toLocaleString() : "Still open");
  addRow("Duration", durationLabel(d.durationMin));
  if (timeEntry?.clock_in) addRow("Clock in", new Date(timeEntry.clock_in).toLocaleString());
  if (timeEntry?.clock_out) addRow("Clock out", new Date(timeEntry.clock_out).toLocaleString());
  addRow("Break", `${Number(timeEntry?.break_minutes ?? 0)} min`);
  if (d.approver) addRow("Approved by", safe(d.approver.full_name ?? d.approver.email));

  section("Sales");
  addRow("Transactions", String(d.salesSummary.totalTx));
  addRow("Items / quantity", `${d.salesSummary.totalItems} / ${d.salesSummary.totalQty}`);
  addRow("Unique products", String(d.products.total));
  addRow("Gross sales", fmt(d.salesSummary.grossSales));
  addRow("Discounts", `-${fmt(d.salesSummary.totalDiscount)}`);
  addRow("Tax", fmt(d.salesSummary.totalTax));
  addRow("Net sales", fmt(d.salesSummary.netSales));
  addRow("Average ticket", fmt(d.salesSummary.avgTx));
  addRow("Average items", d.salesSummary.avgItems.toFixed(2));
  addRow("Highest sale", fmt(d.salesSummary.highestSale));
  addRow("Lowest sale", fmt(d.salesSummary.lowestSale));

  section("Payments");
  for (const [method, value] of Object.entries(d.paymentSummary.byMethod)) {
    const amount = Number(value || 0);
    if (amount !== 0 || method === "cash" || method === "card") {
      addRow(method.replaceAll("_", " "), fmt(amount));
    }
  }
  addRow("Cash received", fmt(d.paymentSummary.totalCashReceived));
  addRow("Change given", `-${fmt(d.paymentSummary.totalChangeGiven)}`);
  addRow("Card total", fmt(d.paymentSummary.totalCardSales));
  parts.push(b.bold(true));
  addRow("Grand total", fmt(d.paymentSummary.grandTotal));
  parts.push(b.bold(false));

  section("Returns & exceptions");
  addRow("Refund count", String(d.refundSummary.refundCount));
  addRow("Refund total", `-${fmt(d.refundSummary.refundAmount)}`);
  addRow("Voids", String(d.refundSummary.voidCount));
  addRow("Voided sales", String(d.voidedSales.length));
  addRow("Exchanges", String(d.refundSummary.exchanges));
  addRow("Store credit", fmt(d.refundSummary.storeCreditIssued));
  addRow("No-sale opens", String(d.noSaleEvents.length));

  section("Cash movements");
  addRow("Opening cash", fmt(Number(session.opening_cash ?? 0)));
  addRow("Cash sales", fmt(Number(session.cash_sales ?? d.paymentSummary.byMethod.cash ?? 0)));
  addRow("Cash refunds", `-${fmt(Number(session.cash_refunds ?? 0))}`);
  addRow("Deposits", fmt(depositTotal));
  addRow("Payouts", `-${fmt(payoutTotal)}`);
  addRow("Safe drops", `-${fmt(d.safeDropTotal)}`);
  addRow("Expected cash", fmt(expected));
  addRow("Counted cash", counted == null ? "Not counted" : fmt(counted));
  addRow("Over / short", variance == null ? "—" : `${variance > 0 ? "+" : ""}${fmt(variance)}`);

  if (d.products.top.length) {
    section("Top products");
    for (const [index, product] of d.products.top.slice(0, widePaper ? 8 : 5).entries()) {
      for (const lineText of wrap(`${index + 1}. ${product.name}`, cols)) text(`${lineText}\n`);
      addRow(`  Qty ${product.qty}`, fmt(product.revenue));
    }
  }

  if (session.notes) {
    section("Notes");
    for (const noteLine of wrap(session.notes, cols)) text(`${noteLine}\n`);
  }

  text(`${line(cols)}\n`);
  parts.push(b.align("center"));
  text("END OF SHIFT REPORT\n");
  text("SEZA POS v1.3.2\n\n\n");
  parts.push(b.charSpacing(0), b.cut());

  const printer = getActivePrinter();
  if (printer.id === "none" || !(await printer.isReady())) {
    return { ok: false, error: "Printer is not configured." };
  }
  try {
    const raw = concat(parts);
    if (printer.id === "escpos-usb") {
      const escposUsb = await import("@/lib/hardware/escpos-usb");
      await escposUsb.writeUsb(raw);
    } else if (printer.id === "escpos-ble") {
      const escposBle = await import("@/lib/hardware/escpos-ble");
      await escposBle.write(raw);
    } else {
      return { ok: false, error: `Report printing is not available for ${printer.label}.` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Printer error" };
  }
}
