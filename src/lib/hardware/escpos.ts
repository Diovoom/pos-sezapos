// Minimal ESC/POS command builder for 58mm and 80mm thermal printers.
// Emits raw bytes that any generic ESC/POS printer (Bluetooth or LAN)
// understands. No vendor SDK required.

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type ReceiptLine =
  | { kind: "text"; value: string; bold?: boolean; align?: "left" | "center" | "right"; size?: 1 | 2 }
  | { kind: "row"; left: string; right: string }
  | { kind: "sep" }
  | { kind: "feed"; lines?: number }
  | { kind: "cut" }
  | { kind: "kick" };

export interface ReceiptPayload {
  header?: string[];
  footer?: string[];
  storeName: string;
  ticketNumber: string | number;
  cashierName?: string;
  timestamp: Date | string;
  items: Array<{ name: string; qty: number; unitPrice: number; total: number }>;
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  tender?: { method: string; amount: number };
  change?: number;
  currency?: string;
  columns?: 32 | 42 | 48; // 58mm≈32, 80mm≈42/48
}

const enc = new TextEncoder();

function bytes(...parts: Array<number | Uint8Array | string>): Uint8Array {
  const arrs = parts.map((p) =>
    typeof p === "number" ? new Uint8Array([p]) : typeof p === "string" ? enc.encode(p) : p,
  );
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

const CMD = {
  init: () => bytes(ESC, 0x40),
  align: (a: "left" | "center" | "right") =>
    bytes(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2),
  bold: (on: boolean) => bytes(ESC, 0x45, on ? 1 : 0),
  size: (n: 1 | 2) => bytes(GS, 0x21, n === 2 ? 0x11 : 0x00),
  feed: (n = 1) => bytes(ESC, 0x64, Math.max(1, Math.min(255, n))),
  cut: () => bytes(GS, 0x56, 0x42, 0x00),
  kickDrawer: () => bytes(ESC, 0x70, 0x00, 0x19, 0xfa), // pulse pin 2
};

function pad(str: string, width: number, right = false): string {
  if (str.length >= width) return str.slice(0, width);
  const gap = " ".repeat(width - str.length);
  return right ? gap + str : str + gap;
}

function money(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function buildReceipt(p: ReceiptPayload): Uint8Array {
  const cols = p.columns ?? 32;
  const currency = p.currency ?? "USD";
  const parts: Uint8Array[] = [CMD.init()];

  parts.push(CMD.align("center"), CMD.bold(true), CMD.size(2), enc.encode(p.storeName + "\n"));
  parts.push(CMD.size(1), CMD.bold(false));
  for (const line of p.header ?? []) parts.push(enc.encode(line + "\n"));

  parts.push(CMD.align("left"), enc.encode("-".repeat(cols) + "\n"));
  parts.push(enc.encode(`Ticket:  ${p.ticketNumber}\n`));
  if (p.cashierName) parts.push(enc.encode(`Cashier: ${p.cashierName}\n`));
  parts.push(enc.encode(`Date:    ${new Date(p.timestamp).toLocaleString()}\n`));
  parts.push(enc.encode("-".repeat(cols) + "\n"));

  for (const it of p.items) {
    const line1 = it.name.slice(0, cols);
    parts.push(enc.encode(line1 + "\n"));
    const left = `  ${it.qty} x ${money(it.unitPrice, currency)}`;
    const right = money(it.total, currency);
    parts.push(enc.encode(pad(left, cols - right.length) + right + "\n"));
  }

  parts.push(enc.encode("-".repeat(cols) + "\n"));
  const row = (l: string, r: string, bold = false) => {
    if (bold) parts.push(CMD.bold(true));
    parts.push(enc.encode(pad(l, cols - r.length) + r + "\n"));
    if (bold) parts.push(CMD.bold(false));
  };
  row("Subtotal", money(p.subtotal, currency));
  if (typeof p.discount === "number" && p.discount > 0) row("Discount", "-" + money(p.discount, currency));
  if (typeof p.tax === "number" && p.tax > 0) row("Tax", money(p.tax, currency));
  row("TOTAL", money(p.total, currency), true);
  if (p.tender) row(p.tender.method, money(p.tender.amount, currency));
  if (typeof p.change === "number" && p.change > 0) row("Change", money(p.change, currency));

  parts.push(enc.encode("\n"), CMD.align("center"));
  for (const line of p.footer ?? []) parts.push(enc.encode(line + "\n"));
  parts.push(enc.encode("\n\n"));
  parts.push(CMD.feed(1), CMD.cut());

  const total = parts.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of parts) { out.set(a, o); o += a.length; }
  return out;
}

export const escposBuilder = CMD;
