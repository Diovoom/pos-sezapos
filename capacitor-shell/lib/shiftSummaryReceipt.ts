// Build a complete ESC/POS shift-review report and send it through the exact
// same native printer selected for sale receipts.
import type { ShiftSummary } from "@/lib/shift-summary";
import { escposBuilder } from "@/lib/hardwimport { userFacingError } from "@/lib/errors/user-facing";
are/escpos";
import { getActivePrinter } from "@/lib/hardware";
import { getPaperColumns } from "@/lib/hardware/native-receipt";

const fmt = (n: number) => `$${Math.abs(Number(n || 0)).toFixed(2)}`;
const enc = new TextEncoder();

function line(cols: number) {
  return "-".repeat(cols);
}
function safe(value: unknown, fallback = "—") {
  const result = String(value ?? "").trim();
  return result || fallback;
}
function clip(value: unknown, width: number) {
  const text = safe(value);
  return text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text;
}
function row(label: string, value: string, cols: number) {
  const left = clip(label, Math.max(8, Math.floor(cols * 0.58)));
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
      for (let index = 0; index < word.length; index += cols) {
        lines.push(word.slice(index, index + cols));
      }
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > cols) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function durationLabel(minutes: number) {
  const hours = Math.floor(Math.max(0, minutes) / 60);
  const mins = Math.max(0, minutes) % 60;
  return `${hours}h ${mins}m`;
}
function signedMoney(value: number) {
  const amount = Number(value || 0);
  return `${amount > 0 ? "+" : amount < 0 ? "-" : ""}${fmt(amount)}`;
}
function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function printShiftSummary(
  d: ShiftSummary,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cols = getPaperColumns();
  const widePaper = cols > 32;
  const b = escposBuilder;
  const parts: Uint8Array[] = [];
  const text = (value: string) => parts.push(enc.encode(value));
  const addRow = (label: string, value: string) => text(`${row(label, value, cols)}\n`);
  const centered = (value: string) => {
    parts.push(b.align("center"));
    text(`${value}\n`);
    parts.push(b.align("left"));
  };
  const section = (title: string) => {
    text(`${line(cols)}\n`);
    parts.push(b.align("center"), b.bold(true));
    text(`*** ${title.toUpperCase()} ***\n`);
    parts.push(b.bold(false), b.align("left"));
  };
  const subsection = (title: string) => {
    parts.push(b.bold(true));
    text(`${title}\n`);
    parts.push(b.bold(false));
  };

  const session = d.session as Record<string, any>;
  const timeEntry = d.timeEntry as Record<string, any> | null;
  const cashierName =
    d.cashier?.full_name ||
    `${d.cashier?.first_name ?? ""} ${d.cashier?.last_name ?? ""}`.trim() ||
    "Unknown";
  const openedAt = new Date(session.opened_at);
  const closedAt = session.closed_at ? new Date(session.closed_at) : new Date();
  const printedAt = new Date();
  const countedCash = d.cashAccount.countedCash;
  const variance = d.cashAccount.variance;

  parts.push(
    b.init(),
    b.font("a"),
    b.leftMargin(0),
    b.printAreaWidth(widePaper ? 576 : 384),
    b.charSpacing(0),
  );
  parts.push(b.align("center"), b.bold(true));
  text("SHIFT REVIEW SUMMARY\n");
  parts.push(b.bold(false));
  text(`${safe(cashierName)}\n`);
  text(`${safe(d.store?.name, "SEZA POS")}\n`);
  text(`${openedAt.toLocaleDateString()}\n`);
  text(`${openedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${closedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}\n`);
  parts.push(b.align("left"));

  section("Shift details");
  addRow("Shift", safe(session.id).slice(0, 12));
  addRow("Employee", clip(cashierName, cols - 12));
  addRow("Employee ID", safe(d.cashier?.employee_id));
  addRow("Register", safe(d.terminal?.label ?? d.terminal?.name, "Default"));
  addRow("Terminal", safe(d.terminal?.serial_number ?? d.terminal?.serial, "Not assigned"));
  addRow("Opened", openedAt.toLocaleString());
  addRow("Closed", session.closed_at ? closedAt.toLocaleString() : "Still open");
  addRow("Duration", durationLabel(d.durationMin));
  if (timeEntry?.clock_in) addRow("Clock in", new Date(timeEntry.clock_in).toLocaleString());
  if (timeEntry?.clock_out) addRow("Clock out", new Date(timeEntry.clock_out).toLocaleString());
  addRow("Break", `${Number(timeEntry?.break_minutes ?? 0)} min`);
  if (d.approver) addRow("Approved by", safe(d.approver.full_name ?? d.approver.email));

  section("Employee cash account");
  addRow("Opening cash", fmt(d.cashAccount.openingCash));
  addRow("Cash collected", fmt(d.cashAccount.cashSales));
  addRow("Cash refunds", `-${fmt(d.cashAccount.cashRefunds)}`);
  addRow("Payouts", `-${fmt(d.cashAccount.payoutTotal)}`);
  addRow("Safe drops", `-${fmt(d.cashAccount.safeDropTotal)}`);
  addRow("Deposits", fmt(d.cashAccount.depositTotal));
  addRow("Expected in drawer", fmt(d.cashAccount.expectedCash));
  addRow("Counted in drawer", countedCash == null ? "Not counted" : fmt(countedCash));
  parts.push(b.bold(true));
  addRow("Over / short", variance == null ? "—" : signedMoney(variance));
  parts.push(b.bold(false));

  section("Cash / non-cash by category");
  subsection("Cash sales");
  if (d.categorySummary.cash.length) {
    for (const category of d.categorySummary.cash) {
      addRow(`${category.category} (${category.quantity})`, fmt(category.netSales));
    }
  } else {
    text("No cash category sales\n");
  }
  text("\n");
  subsection("Non-cash sales");
  if (d.categorySummary.nonCash.length) {
    for (const category of d.categorySummary.nonCash) {
      addRow(`${category.category} (${category.quantity})`, fmt(category.netSales));
    }
  } else {
    text("No non-cash category sales\n");
  }

  section("Credit card breakdown");
  if (d.cardBrands.length) {
    for (const card of d.cardBrands) {
      addRow(`${titleCase(card.brand)} (${card.count})`, fmt(card.amount));
    }
    parts.push(b.bold(true));
    addRow("Card total", fmt(d.paymentSummary.totalCardSales));
    parts.push(b.bold(false));
  } else {
    text("No card payments for this shift\n");
  }

  section("Sales & taxes summary");
  if (d.categorySummary.all.length) {
    subsection("Category / quantity / net sales");
    for (const category of d.categorySummary.all) {
      addRow(`${category.category} (${category.quantity})`, fmt(category.netSales));
    }
    text(`${line(cols)}\n`);
  }
  addRow("Transactions", String(d.salesSummary.totalTx));
  addRow("Items sold", String(d.salesSummary.totalQty));
  addRow("Unique products", String(d.products.total));
  addRow("Total net sales", fmt(d.salesSummary.netSales));
  addRow("Tax", fmt(d.salesSummary.totalTax));
  addRow("Discounts", `-${fmt(d.salesSummary.totalDiscount)}`);
  addRow("Gross sales", fmt(d.paymentSummary.grandTotal));
  addRow("Gratuity / tips", fmt(d.feesSummary.gratuityTotal));
  addRow("Fees", fmt(d.feesSummary.feeTotal));
  parts.push(b.bold(true));
  addRow("Total amount", fmt(d.paymentSummary.grandTotal + d.feesSummary.total));
  parts.push(b.bold(false));
  text("\n");
  subsection("Ticket performance");
  addRow("Average ticket", fmt(d.salesSummary.avgTx));
  addRow("Average items", d.salesSummary.avgItems.toFixed(2));
  addRow("Highest sale", fmt(d.salesSummary.highestSale));
  addRow("Lowest sale", fmt(d.salesSummary.lowestSale));

  section("Payments");
  for (const [method, value] of Object.entries(d.paymentSummary.byMethod)) {
    const amount = Number(value || 0);
    if (amount !== 0 || method === "cash" || method === "card") {
      addRow(titleCase(method), fmt(amount));
    }
  }
  addRow("Cash received", fmt(d.paymentSummary.totalCashReceived));
  addRow("Change given", `-${fmt(d.paymentSummary.totalChangeGiven)}`);
  parts.push(b.bold(true));
  addRow("Grand total", fmt(d.paymentSummary.grandTotal));
  parts.push(b.bold(false));

  section("Returns and exceptions");
  addRow("Refund count", String(d.refundSummary.refundCount));
  addRow("Refund total", `-${fmt(d.refundSummary.refundAmount)}`);
  addRow("Exchanges", String(d.refundSummary.exchanges));
  addRow("Store credit issued", fmt(d.refundSummary.storeCreditIssued));
  addRow("No-sale drawer opens", String(d.noSaleEvents.length));

  section("Total voids");
  addRow("Void amount", fmt(d.voidSummary.amount));
  addRow("Void order count", String(d.voidSummary.orderCount));
  addRow("Void item count", String(d.voidSummary.itemCount));
  addRow("Void percent", `${d.voidSummary.percent.toFixed(2)}%`);

  section("Payouts and cash movements");
  if (d.payoutDetails.length) {
    for (const payout of d.payoutDetails) {
      const wrappedReason = wrap(payout.reason, Math.max(12, cols - 12));
      if (wrappedReason.length <= 1) {
        addRow(wrappedReason[0] ?? "Payout", `-${fmt(payout.amount)}`);
      } else {
        for (const reasonLine of wrappedReason) text(`${reasonLine}\n`);
        addRow("  Amount", `-${fmt(payout.amount)}`);
      }
    }
  } else {
    text("No payouts recorded\n");
  }
  addRow("Total payouts", `-${fmt(d.cashAccount.payoutTotal)}`);
  addRow("Total safe drops", `-${fmt(d.cashAccount.safeDropTotal)}`);
  addRow("Total deposits", fmt(d.cashAccount.depositTotal));

  section("Gift cards sold");
  addRow("Quantity", String(d.giftCardsSold.quantity));
  addRow("Total amount", fmt(d.giftCardsSold.amount));

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

  section("Shift sign-off");
  text("\nEmployee signature: __________________\n\n");
  text("Cash received by: ____________________\n\n");
  addRow("Printed", printedAt.toLocaleString());
  addRow("By", cashierName);

  text(`${line(cols)}\n`);
  parts.push(b.align("center"), b.bold(true));
  text("END SHIFT REVIEW SUMMARY\n");
  parts.push(b.bold(false));
  text("SEZA POS v1.3.4\n\n\n");
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
    return { ok: false, error: userFacingError(error, "Printer error. Please try again.") };
  }
}
