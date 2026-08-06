// Native-only helpers that connect the existing production ReceiptData
// pipeline to the modular hardware drivers in src/lib/hardware.
//
// APK scope only  -  every entry point is a no-op on the web POS. Never throws
// upward: printer/drawer failure must never fail a finalized sale.

import { isNativeMode } from "@/lib/native";
import { getActivePrinter } from "@/lib/hardware";
import type { ReceiptPayload } from "@/lib/hardware/escpos";
import type { ReceiptData } from "@/components/pos/Receipt";
import { logAudit } from "@/lib/audit-log";

const LS = {
  paperWidth: "pos.receipt.paperWidth",
  autoPrint: "pos.receipt.autoPrint",
  copies: "pos.receipt.copies",
  drawerEnabled: "pos.drawer.enabled",
  kickOnCash: "pos.drawer.kickOnCash",
  kickOnRefund: "pos.drawer.kickOnRefund",
  drawerPulseMs: "pos.drawer.pulseMs",
  lastPrintOk: "pos.hardware.lastPrintOk",
  lastPrintErr: "pos.hardware.lastPrintErr",
  lastDrawerOk: "pos.hardware.lastDrawerOk",
  lastDrawerErr: "pos.hardware.lastDrawerErr",
} as const;

const printedTx = new Set<string>();
const drawerTx = new Set<string>();

function ls(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, val: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
}

export function getPaperColumns(): 32 | 42 {
  // 42 Font-A columns fills an 80mm head more naturally on common Rongta
  // mechanisms. 48 columns produced the cramped, 58mm-looking output.
  return ls(LS.paperWidth) === "80" ? 42 : 32;
}

export function isAutoPrintEnabled(): boolean {
  const raw = ls(LS.autoPrint);
  return raw === null ? true : raw === "1";
}
export function isDrawerEnabled(): boolean {
  const raw = ls(LS.drawerEnabled);
  return raw === null ? true : raw === "1";
}
export function isKickOnCashEnabled(): boolean {
  if (!isDrawerEnabled()) return false;
  const raw = ls(LS.kickOnCash);
  return raw === null ? true : raw === "1";
}
export function isKickOnRefundEnabled(): boolean {
  if (!isDrawerEnabled()) return false;
  const raw = ls(LS.kickOnRefund);
  return raw === null ? false : raw === "1";
}
export function getDrawerPulseMs(): number {
  const n = Number(ls(LS.drawerPulseMs) ?? "120");
  return Number.isFinite(n) && n >= 20 && n <= 510 ? Math.round(n) : 120;
}
export function getCopies(): number {
  const n = Number(ls(LS.copies) ?? "1");
  return Number.isFinite(n) && n >= 1 && n <= 3 ? Math.floor(n) : 1;
}

export function receiptDataToPayload(
  d: ReceiptData,
  opts: { banner?: string | null; copyLabel?: string | null } = {},
): ReceiptPayload {
  const columns = getPaperColumns();
  const header: string[] = [];
  if (d.store.address) header.push(String(d.store.address));
  if (d.store.phone) header.push(String(d.store.phone));
  if (d.store.receipt_header) header.push(String(d.store.receipt_header));
  if (opts.banner) header.push(`*** ${opts.banner} ***`);
  if (d.refund) header.push("*** REFUND ***");
  if (opts.copyLabel) header.push(`*** ${opts.copyLabel} ***`);

  const footer: string[] = [];
  if (d.store.return_policy) footer.push(String(d.store.return_policy));
  if (d.store.receipt_footer) footer.push(String(d.store.receipt_footer));
  footer.push(`Ref: ${d.transactionId.slice(0, 8).toUpperCase()}`);

  return {
    storeName: d.store.name ?? "Store",
    ticketNumber: d.receiptNumber ?? d.transactionId.slice(0, 8),
    cashierName: d.cashierName ?? undefined,
    timestamp: d.createdAt,
    items: d.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPrice: l.unit_price,
      total: l.line_total,
    })),
    subtotal: d.subtotal,
    tax: d.tax,
    discount: d.discount,
    total: d.total,
    tender:
      d.amountTendered != null
        ? { method: d.paymentMethod.replace("_", " ").toUpperCase(), amount: d.amountTendered }
        : undefined,
    change: d.changeDue ?? undefined,
    currency: d.store.currency ?? "USD",
    columns,
    header,
    footer,
  };
}

export type PrintResult =
  | { ok: true; copies: number }
  | {
      ok: false;
      reason: "not_native" | "no_driver" | "not_ready" | "driver_error";
      error?: string;
    };

async function printOnceInternal(payload: ReceiptPayload, copies: number): Promise<PrintResult> {
  if (!isNativeMode()) return { ok: false, reason: "not_native" };
  const driver = getActivePrinter();
  if (driver.id === "none") return { ok: false, reason: "no_driver" };
  try {
    const ready = await driver.isReady();
    if (!ready) return { ok: false, reason: "not_ready" };
  } catch {
    return { ok: false, reason: "not_ready" };
  }
  try {
    for (let i = 0; i < copies; i++) {
      await driver.printReceipt(payload);
    }
    lsSet(LS.lastPrintOk, new Date().toISOString());
    lsSet(LS.lastPrintErr, "");
    return { ok: true, copies };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lsSet(LS.lastPrintErr, `${new Date().toISOString()} ${msg}`.slice(0, 500));
    return { ok: false, reason: "driver_error", error: msg };
  }
}

/**
 * Auto-print a completed sale receipt. Idempotent per transactionId within
 * this app session  -  screen rotations, resumes, or re-renders will not
 * trigger a second print. Safe-fail: never throws.
 */
export async function autoPrintOnComplete(d: ReceiptData): Promise<PrintResult> {
  if (!isNativeMode()) return { ok: false, reason: "not_native" };
  if (!isAutoPrintEnabled()) return { ok: false, reason: "no_driver" };
  const key = d.transactionId;
  if (printedTx.has(key)) return { ok: true, copies: 0 };
  printedTx.add(key);
  const payload = receiptDataToPayload(d);
  const res = await printOnceInternal(payload, getCopies());
  void logAudit({
    action: "hardware.print.auto",
    entity: "sale",
    entity_id: d.transactionId,
    details: { ok: res.ok, reason: res.ok ? undefined : res.reason },
  }).catch(() => {
    /* audit failure never blocks sale */
  });
  return res;
}

/**
 * Explicit reprint (manager/user-initiated). Always attempts a print,
 * always marks the copy as DUPLICATE / REPRINT. Safe-fail.
 */
export async function reprintReceipt(d: ReceiptData): Promise<PrintResult> {
  const payload = receiptDataToPayload(d, { banner: "REPRINT", copyLabel: "DUPLICATE" });
  const res = await printOnceInternal(payload, 1);
  void logAudit({
    action: "hardware.print.reprint",
    entity: "sale",
    entity_id: d.transactionId,
    details: { ok: res.ok, reason: res.ok ? undefined : res.reason },
  }).catch(() => {
    /* ignore */
  });
  return res;
}

/** Fire a manual test print through the active driver. */
export async function testPrint(): Promise<PrintResult> {
  const columns = getPaperColumns();
  const payload: ReceiptPayload = {
    storeName: "SEZA POS",
    ticketNumber: "TEST",
    cashierName: "Setup",
    timestamp: new Date(),
    items: [
      { name: "Sample item A", qty: 1, unitPrice: 4.99, total: 4.99 },
      { name: "Sample item B (longer name to test wrap)", qty: 2, unitPrice: 2.5, total: 5.0 },
    ],
    subtotal: 9.99,
    tax: 0.8,
    total: 10.79,
    columns,
    header: ["Printer test"],
    footer: ["Test completed", "If you can read this, your printer is ready."],
  };
  return printOnceInternal(payload, 1);
}

export type DrawerResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_native" | "no_driver" | "not_ready" | "driver_error";
      error?: string;
    };

async function kickInternal(pulseMs?: number): Promise<DrawerResult> {
  if (!isNativeMode()) return { ok: false, reason: "not_native" };
  if (!isDrawerEnabled()) return { ok: false, reason: "no_driver" };
  const driver = getActivePrinter();
  // Drawer requires a printer that supports the RJ-11 kick-out. "none" and
  // vendor stubs (star/epson without linked SDK) throw on kickDrawer().
  if (driver.id === "none") return { ok: false, reason: "no_driver" };
  try {
    const ready = await driver.isReady();
    if (!ready) return { ok: false, reason: "not_ready" };
  } catch {
    return { ok: false, reason: "not_ready" };
  }
  try {
    await driver.kickDrawer(pulseMs ?? getDrawerPulseMs());
    lsSet(LS.lastDrawerOk, new Date().toISOString());
    lsSet(LS.lastDrawerErr, "");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lsSet(LS.lastDrawerErr, `${new Date().toISOString()} ${msg}`.slice(0, 500));
    return { ok: false, reason: "driver_error", error: msg };
  }
}

/**
 * Open the drawer once per transaction after a completed cash sale.
 * Gated by the saved "drawer enabled" + "kick on cash sale" settings. Uses
 * the saved pulse duration. Card-only sales and reprints never open the
 * drawer. Safe-fail: hardware error never reverses the sale.
 */
export async function openDrawerAfterCashSale(d: ReceiptData): Promise<DrawerResult> {
  if (!isNativeMode()) return { ok: false, reason: "not_native" };
  if (!isKickOnCashEnabled()) return { ok: false, reason: "no_driver" };
  const method = (d.paymentMethod || "").toLowerCase();
  if (!method.includes("cash")) return { ok: false, reason: "no_driver" };
  const key = `sale:${d.transactionId}`;
  if (drawerTx.has(key)) return { ok: true };
  drawerTx.add(key);
  const res = await kickInternal();
  void logAudit({
    action: "hardware.drawer.auto",
    entity: "sale",
    entity_id: d.transactionId,
    details: { ok: res.ok, reason: res.ok ? undefined : res.reason, trigger: "cash_sale" },
  }).catch(() => {
    /* ignore */
  });
  return res;
}

/**
 * Open the drawer once per refund after a completed cash refund. Only fires
 * when both "drawer enabled" and "kick on cash refund" are saved on, and the
 * refund's payment method is cash. Safe-fail.
 */
export async function openDrawerAfterCashRefund(d: ReceiptData): Promise<DrawerResult> {
  if (!isNativeMode()) return { ok: false, reason: "not_native" };
  if (!isKickOnRefundEnabled()) return { ok: false, reason: "no_driver" };
  const method = (d.paymentMethod || "").toLowerCase();
  if (!method.includes("cash")) return { ok: false, reason: "no_driver" };
  const key = `refund:${d.transactionId}`;
  if (drawerTx.has(key)) return { ok: true };
  drawerTx.add(key);
  const res = await kickInternal();
  void logAudit({
    action: "hardware.drawer.auto",
    entity: "refund",
    entity_id: d.transactionId,
    details: { ok: res.ok, reason: res.ok ? undefined : res.reason, trigger: "cash_refund" },
  }).catch(() => {
    /* ignore */
  });
  return res;
}

export async function testDrawer(): Promise<DrawerResult> {
  return kickInternal();
}

/** Read-only snapshot for the Hardware Status view / support diagnostics. */
export function hardwareSnapshot() {
  const driver = getActivePrinter();
  return {
    driver: driver.id,
    driverLabel: driver.label,
    paperWidth: (ls(LS.paperWidth) === "80" ? "80mm" : "58mm") as "58mm" | "80mm",
    autoPrint: isAutoPrintEnabled(),
    copies: getCopies(),
    drawerEnabled: isDrawerEnabled(),
    kickOnCash: isKickOnCashEnabled(),
    kickOnRefund: isKickOnRefundEnabled(),
    drawerPulseMs: getDrawerPulseMs(),
    lastPrintOk: ls(LS.lastPrintOk),
    lastPrintErr: ls(LS.lastPrintErr),
    lastDrawerOk: ls(LS.lastDrawerOk),
    lastDrawerErr: ls(LS.lastDrawerErr),
    native: isNativeMode(),
  };
}
