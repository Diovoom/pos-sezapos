import { nativeFetch, userSafeNetworkMessage } from "./nativeHttp";
import { API_BASE_URL } from "../supabase";
import { getPairing } from "./pairing";
import { hardwareSnapshot } from "@/lib/hardware/native-receipt";
import { getActiveTerminal } from "@/lib/hardware";
import { loadScannerConfig } from "./scannerConfig";
import * as escposBle from "@/lib/hardware/escpos-ble";
import * as stripeTerminal from "@/lib/hardware/terminal-stripe";
import { refreshDeviceBootstrap } from "./deviceBootstrap";
import { isNetworkConnectedNow } from "@/lib/offline/useOnline";

const FOREGROUND_INTERVAL_MS = 5 * 60_000;
const MAX_SILENCE_MS = 15 * 60_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;
let stopped = false;
let lastSentAt = 0;
let lastSnapshotKey = "";

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
  try {
    terminalPlugin = await stripeTerminal.pluginAvailable();
  } catch {
    // Optional native terminal plugin.
  }
  try {
    tapToPay = await stripeTerminal.isTapToPaySupported();
  } catch {
    // Optional device capability.
  }
  const activeTerminal = getActiveTerminal();

  return {
    captured_at: new Date().toISOString(),
    online: isNetworkConnectedNow(),
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

function stableSnapshotKey(snapshot: Awaited<ReturnType<typeof buildSnapshot>>): string {
  const { captured_at: _capturedAt, ...stable } = snapshot;
  return JSON.stringify(stable);
}

export async function sendDeviceHeartbeat(force = false) {
  if (sending || stopped) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden" && !force) return;
  if (!isNetworkConnectedNow()) return;

  const pairing = getPairing();
  if (!pairing) return;

  const snapshot = await buildSnapshot();
  const key = stableSnapshotKey(snapshot);
  const now = Date.now();
  if (!force && key === lastSnapshotKey && now - lastSentAt < MAX_SILENCE_MS) return;

  sending = true;
  try {
    const response = await nativeFetch(`${API_BASE_URL}/api/public/pos/device-heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        store_id: pairing.storeId,
        device_id: pairing.deviceId,
        device_secret: pairing.deviceSecret,
        app_version: await appVersion(),
        status_snapshot: snapshot,
      }),
    });
    if (response.ok) {
      lastSnapshotKey = key;
      lastSentAt = now;
      // Successful heartbeat proves the backend path is healthy. Drain queued
      // register work now instead of waiting for another cashier action.
      void refreshDeviceBootstrap().catch(() => undefined);
      void import("@/lib/offline/sync").then(({ syncNow }) =>
        syncNow().catch(() => undefined),
      );
    }
  } catch {
    // Diagnostic only. Never block checkout.
  } finally {
    sending = false;
  }
}

function scheduleNext() {
  if (stopped || typeof document === "undefined" || document.visibilityState === "hidden") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    await sendDeviceHeartbeat();
    scheduleNext();
  }, FOREGROUND_INTERVAL_MS);
}

export function startDeviceHeartbeat() {
  if (typeof window === "undefined") return () => {};
  stopped = false;
  void sendDeviceHeartbeat(true);
  scheduleNext();

  const onOnline = () => void sendDeviceHeartbeat(true);
  const onFocus = () => void sendDeviceHeartbeat();
  const onConfigChanged = () => void sendDeviceHeartbeat(true);
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      void sendDeviceHeartbeat();
      scheduleNext();
    } else if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("seza:device-config-changed", onConfigChanged as EventListener);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("seza:device-config-changed", onConfigChanged as EventListener);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
