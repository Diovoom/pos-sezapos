// Modular hardware abstraction for SEZA POS.
//
// Merchants pick a driver in Settings; the POS resolves the active driver
// via getActivePrinter() / getActiveCashDrawer() / getActiveTerminal().
// Each driver is a thin adapter over a vendor SDK; the shell ships:
//
//   printer:      "none" | "escpos" (generic BT/USB) | "star" | "epson"
//   cash-drawer:  driven by the active printer's kick-drawer command
//                 OR "usb" via the terminal, OR "none".
//   terminal:     "none" | "stripe-tap-to-pay" | "stripe-wisepos" | "stripe-wisepad3"
//
// Native SDK integration (StarPRNT .aar, Epson ePOS .aar, Stripe Terminal
// React Native bridge) must be linked in the Android module. Web/JS driver
// stubs here return `capable: false` outside Capacitor so the merchant UI
// can show "Not connected on this device".

import { isNativeMode } from "@/lib/native";

export type PrinterDriverId = "none" | "escpos" | "star" | "epson";
export type TerminalDriverId = "none" | "stripe-tap-to-pay" | "stripe-wisepos" | "stripe-wisepad3";
export type DrawerDriverId = "none" | "via-printer" | "usb";

export interface PrinterDriver {
  id: PrinterDriverId;
  label: string;
  capable(): Promise<boolean>;
  printReceipt(escposBytes: Uint8Array | string): Promise<void>;
  kickDrawer(): Promise<void>;
}

export interface TerminalDriver {
  id: TerminalDriverId;
  label: string;
  capable(): Promise<boolean>;
  charge(input: { amountCents: number; currency: string; saleId: string }): Promise<{ ok: true; ref: string } | { ok: false; error: string }>;
  disconnect?(): Promise<void>;
}

// Generic ESC/POS over any transport the merchant configured (BT/USB).
const escposDriver: PrinterDriver = {
  id: "escpos",
  label: "Generic ESC/POS",
  async capable() { return isNativeMode(); },
  async printReceipt() { throw new Error("ESC/POS bridge not linked in this build"); },
  async kickDrawer() { throw new Error("ESC/POS bridge not linked in this build"); },
};

const starDriver: PrinterDriver = {
  id: "star",
  label: "Star Micronics (StarPRNT)",
  async capable() { return isNativeMode(); },
  async printReceipt() { throw new Error("StarPRNT SDK not linked in this build"); },
  async kickDrawer() { throw new Error("StarPRNT SDK not linked in this build"); },
};

const epsonDriver: PrinterDriver = {
  id: "epson",
  label: "Epson TM (ePOS)",
  async capable() { return isNativeMode(); },
  async printReceipt() { throw new Error("Epson ePOS SDK not linked in this build"); },
  async kickDrawer() { throw new Error("Epson ePOS SDK not linked in this build"); },
};

const nullPrinter: PrinterDriver = {
  id: "none", label: "None",
  async capable() { return true; },
  async printReceipt() { /* noop */ },
  async kickDrawer() { /* noop */ },
};

export const printerDrivers: Record<PrinterDriverId, PrinterDriver> = {
  none: nullPrinter, escpos: escposDriver, star: starDriver, epson: epsonDriver,
};

const stripeTapToPay: TerminalDriver = {
  id: "stripe-tap-to-pay",
  label: "Stripe Tap to Pay on Android",
  async capable() { return isNativeMode(); },
  async charge() { return { ok: false, error: "Stripe Terminal bridge not linked in this build" }; },
};
const stripeWisePos: TerminalDriver = { ...stripeTapToPay, id: "stripe-wisepos", label: "BBPOS WisePOS E" };
const stripeWisePad3: TerminalDriver = { ...stripeTapToPay, id: "stripe-wisepad3", label: "BBPOS WisePad 3" };
const nullTerminal: TerminalDriver = {
  id: "none", label: "None",
  async capable() { return true; },
  async charge() { return { ok: false, error: "No terminal configured" }; },
};

export const terminalDrivers: Record<TerminalDriverId, TerminalDriver> = {
  none: nullTerminal,
  "stripe-tap-to-pay": stripeTapToPay,
  "stripe-wisepos": stripeWisePos,
  "stripe-wisepad3": stripeWisePad3,
};

const LS_PRINTER = "pos.hardware.printer";
const LS_TERMINAL = "pos.hardware.terminal";

export function getActivePrinter(): PrinterDriver {
  if (typeof window === "undefined") return nullPrinter;
  const id = (window.localStorage.getItem(LS_PRINTER) as PrinterDriverId) || "none";
  return printerDrivers[id] ?? nullPrinter;
}
export function setActivePrinter(id: PrinterDriverId) {
  if (typeof window !== "undefined") window.localStorage.setItem(LS_PRINTER, id);
}
export function getActiveTerminal(): TerminalDriver {
  if (typeof window === "undefined") return nullTerminal;
  const id = (window.localStorage.getItem(LS_TERMINAL) as TerminalDriverId) || "none";
  return terminalDrivers[id] ?? nullTerminal;
}
export function setActiveTerminal(id: TerminalDriverId) {
  if (typeof window !== "undefined") window.localStorage.setItem(LS_TERMINAL, id);
}
