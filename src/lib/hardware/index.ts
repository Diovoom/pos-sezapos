// Modular hardware abstraction for SEZA POS.
//
// Merchants pick a driver in Settings; the POS resolves the active driver
// via getActivePrinter() / getActiveTerminal(). Each driver is a thin
// adapter over a vendor SDK or generic protocol.
//
// Drivers included in this build:
//   printer:  "none" | "escpos-ble" (generic BT, fully functional)
//             | "star"  (StarPRNT  -  stub; needs Star SDK .aar)
//             | "epson" (ePOS  -  stub; needs Epson SDK .aar)
//   terminal: "none" | "stripe-tap-to-pay" | "stripe-wisepos" | "stripe-wisepad3"
//             (Stripe drivers wrap @capacitor-community/stripe-terminal
//              via dynamic import  -  see terminal-stripe.ts.)
//
// Adding a vendor SDK later requires only:
//   1. Install the Capacitor plugin exposing the SDK's JS API.
//   2. Implement the printer/terminal methods in the driver file.
//   3. No consumer code changes.

import { isNativeMode } from "@/lib/native";
import * as escposBle from "./escpos-ble";
import { buildReceipt, escposBuilder, type ReceiptPayload } from "./escpos";
import * as stripeTerminal from "./terminal-stripe";

export type PrinterDriverId = "none" | "escpos-ble" | "star" | "epson";
export type TerminalDriverId = "none" | "stripe-tap-to-pay" | "stripe-wisepos" | "stripe-wisepad3";

export interface PrinterDriver {
  id: PrinterDriverId;
  label: string;
  capable(): Promise<boolean>;
  isReady(): Promise<boolean>;
  printReceipt(payload: ReceiptPayload): Promise<void>;
  kickDrawer(pulseMs?: number): Promise<void>;
}

export interface TerminalDriver {
  id: TerminalDriverId;
  label: string;
  capable(): Promise<boolean>;
  isReady(): Promise<boolean>;
  charge(input: {
    amountCents: number;
    currency: string;
    description?: string;
  }): Promise<{ ok: true; ref: string } | { ok: false; error: string }>;
  disconnect?(): Promise<void>;
}

/* ---------------------------------- printers ------------------------------ */

const nullPrinter: PrinterDriver = {
  id: "none",
  label: "None",
  async capable() {
    return true;
  },
  async isReady() {
    return true;
  },
  async printReceipt() {
    /* noop */
  },
  async kickDrawer() {
    /* noop */
  },
};

const escposBleDriver: PrinterDriver = {
  id: "escpos-ble",
  label: "Generic ESC/POS (Bluetooth)",
  async capable() {
    return isNativeMode();
  },
  async isReady() {
    return escposBle.isPaired();
  },
  async printReceipt(payload) {
    const bytes = buildReceipt(payload);
    await escposBle.write(bytes);
  },
  async kickDrawer(pulseMs?: number) {
    await escposBle.write(escposBuilder.kickDrawer(pulseMs));
  },
};

const starDriver: PrinterDriver = {
  id: "star",
  label: "Star Micronics (StarPRNT)",
  async capable() {
    return false;
  }, // enable once Star SDK plugin is linked
  async isReady() {
    return false;
  },
  async printReceipt() {
    throw new Error(
      "Star driver selected but the StarPRNT SDK is not linked in this build. " +
        "Ask your admin to install the Star SDK plugin.",
    );
  },
  async kickDrawer(_pulseMs?: number) {
    throw new Error("StarPRNT SDK not linked in this build.");
  },
};

const epsonDriver: PrinterDriver = {
  id: "epson",
  label: "Epson TM (ePOS)",
  async capable() {
    return false;
  }, // enable once Epson SDK plugin is linked
  async isReady() {
    return false;
  },
  async printReceipt() {
    throw new Error(
      "Epson driver selected but the ePOS SDK is not linked in this build. " +
        "Ask your admin to install the Epson SDK plugin.",
    );
  },
  async kickDrawer(_pulseMs?: number) {
    throw new Error("Epson ePOS SDK not linked in this build.");
  },
};

export const printerDrivers: Record<PrinterDriverId, PrinterDriver> = {
  none: nullPrinter,
  "escpos-ble": escposBleDriver,
  star: starDriver,
  epson: epsonDriver,
};

/* --------------------------------- terminals ------------------------------ */

const nullTerminal: TerminalDriver = {
  id: "none",
  label: "None",
  async capable() {
    return true;
  },
  async isReady() {
    return true;
  },
  async charge() {
    return {
      ok: false,
      error: "No card terminal configured. Take cash or select a terminal in Settings.",
    };
  },
};

function makeStripeDriver(id: Exclude<TerminalDriverId, "none">, label: string): TerminalDriver {
  return {
    id,
    label,
    async capable() {
      return isNativeMode();
    },
    async isReady() {
      return stripeTerminal.isReady(id);
    },
    async charge(input) {
      return stripeTerminal.charge(id, input);
    },
    async disconnect() {
      return stripeTerminal.disconnect();
    },
  };
}

export const terminalDrivers: Record<TerminalDriverId, TerminalDriver> = {
  none: nullTerminal,
  "stripe-tap-to-pay": makeStripeDriver("stripe-tap-to-pay", "Stripe Tap to Pay on Android"),
  "stripe-wisepos": makeStripeDriver("stripe-wisepos", "BBPOS WisePOS E"),
  "stripe-wisepad3": makeStripeDriver("stripe-wisepad3", "BBPOS WisePad 3"),
};

/* --------------------------- active-driver selection ---------------------- */

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

/* ------------------------------- auto-preference --------------------------
 *
 * If no terminal is configured yet, prefer Tap to Pay on any NFC-capable
 * Android where the merchant has Stripe approval; otherwise fall back to
 * WisePOS E, then WisePad 3. Only ever returns a driver id  -  the caller
 * still has to persist it via setActiveTerminal().
 */
export async function suggestPreferredTerminal(): Promise<TerminalDriverId> {
  if (!isNativeMode()) return "none";
  const candidates: TerminalDriverId[] = ["stripe-tap-to-pay", "stripe-wisepos", "stripe-wisepad3"];
  for (const id of candidates) {
    const d = terminalDrivers[id];
    if (await d.capable()) return id;
  }
  return "none";
}

export { type ReceiptPayload };
