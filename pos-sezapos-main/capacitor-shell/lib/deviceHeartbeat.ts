import { API_BASE_URL } from "../supabase";
import { getPairing } from "./pairing";
import { hardwareSnapshot } from "@/lib/hardware/native-receipt";
import { getActiveTerminal } from "@/lib/hardware";
import { loadScannerConfig } from "./scannerConfig";
import * as escposBle from "@/lib/hardware/escpos-ble";
import * as stripeTerminal from "@/lib/hardware/terminal-stripe";

let timer: ReturnType<typeof setInterval> | null = null;
let sending = false;

async function appVersion(): Promise<string> {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return `${info.version} (${info.build})`;
  } catch {
    return "web-bundle";
  }
}

async function buildSnapshot() {
  const hardware = hardwareSnapshot();
  const scanner = loadScannerConfig();
  const savedPrinter = escposBle.getSavedTarget();
  let terminalPlugin: boolean | null = null;
  let tapToPay: boolean | null = null;
  try { terminalPlugin = await stripeTerminal.pluginAvailable(); } catch { /* noop */ }
  try { tapToPay = await stripeTerminal.isTapToPaySupported(); } catch { /* noop */ }
  const activeTerminal = getActiveTerminal();

  return {
    captured_at: new Date().toISOString(),
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    route: typeof window === "undefined" ? null : window.location.pathname,
    printer: {
      driver: hardware.driver,
      driver_label: hardware.driverLabel,
      paired: !!savedPrinter,
      name: savedPrinter?.name ?? null,
      paper_width: hardware.paperWidth,
      auto_print: hardware.autoPrint,
      last_ok: hardware.lastPrintOk,
      last_error: hardware.lastPrintErr,
    },
    drawer: {
      enabled: hardware.drawerEnabled,
      open_on_cash: hardware.kickOnCash,
      open_on_refund: hardware.kickOnRefund,
      last_ok: hardware.lastDrawerOk,
      last_error: hardware.lastDrawerErr,
    },
    scanner: {
      mode: scanner.type,
      suffix: scanner.suffixEnter ? "enter" : scanner.suffixTab ? "tab" : "none",
      debounce_ms: scanner.debounceMs,
      last_scan_at: scanner.lastScanAt ?? null,
    },
    terminal: {
      driver: activeTerminal.id,
      label: activeTerminal.label,
      plugin_linked: terminalPlugin,
      tap_to_pay_supported: tapToPay,
      connected_reader: stripeTerminal.connectedReader(),
      last_connected_at: localStorage.getItem("pos.terminal.connectedAt"),
      last_error: localStorage.getItem("pos.terminal.lastError"),
    },
  };
}

export async function sendDeviceHeartbeat() {
  if (sending) return;
  const pairing = getPairing();
  if (!pairing) return;
  sending = true;
  try {
    await fetch(`${API_BASE_URL}/api/public/pos/device-heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        store_id: pairing.storeId,
        device_id: pairing.deviceId,
        device_secret: pairing.deviceSecret,
        app_version: await appVersion(),
        status_snapshot: await buildSnapshot(),
      }),
    });
  } catch {
    // Heartbeat is diagnostic only and must never block POS usage.
  } finally {
    sending = false;
  }
}

export function startDeviceHeartbeat() {
  if (typeof window === "undefined") return () => {};
  if (timer) clearInterval(timer);
  void sendDeviceHeartbeat();
  timer = setInterval(() => void sendDeviceHeartbeat(), 30_000);
  const refresh = () => void sendDeviceHeartbeat();
  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("seza:device-config-changed", refresh as EventListener);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener("online", refresh);
    window.removeEventListener("offline", refresh);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("seza:device-config-changed", refresh as EventListener);
  };
}
