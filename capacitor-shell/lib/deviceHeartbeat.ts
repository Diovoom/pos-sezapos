import { nativeFetch, userSafeNetworkMessage } from "./nativeHttp";
import { API_BASE_URL } from "../supabase";
import { getPairing } from "./pairing";
import { hardwareSnapshot } from "@/lib/hardware/native-receipt";
import { getActiveTerminal } from "@/lib/hardware";
import { loadScannerConfig } from "./scannerConfig";
import * as escposBle from "@/lib/hardware/escpos-ble";
import * as escposUsb from "@/lib/hardware/escpos-usb";
import * as stripeTerminal from "@/lib/hardware/terminal-stripe";
import { refreshDeviceBootstrap } from "./deviceBootstrap";
import { isNetworkConnectedNow } from "@/lib/offline/useOnline";
import { cacheMeta, readMeta } from "@/lib/offline/db";

const LOCAL_CONNECTION_POLL_MS = 1_000;
const CLOUD_KEEPALIVE_MS = 10_000;
const MAX_SILENCE_MS = CLOUD_KEEPALIVE_MS;
let timer: ReturnType<typeof setTimeout> | null = null;
let localConnectionTimer: ReturnType<typeof setInterval> | null = null;
let sending = false;
let stopped = false;
let lastSentAt = 0;
let lastSnapshotKey = "";
let lastLocalConnectionKey = "";

function publishHeartbeatState(cloudReachable: boolean) {
  if (typeof window === "undefined") return;
  const detail = { cloudReachable, lastCheckedAt: new Date().toISOString() };
  try { window.localStorage.setItem("seza.device.heartbeatState", JSON.stringify(detail)); } catch {}
  window.dispatchEvent(new CustomEvent("seza:device-heartbeat-state", { detail }));
}

async function pollLocalConnections() {
  if (stopped || typeof window === "undefined") return;
  const nativeConnectedReader = await stripeTerminal.getNativeConnectedReader().catch(() => null);
  const detail = {
    online: isNetworkConnectedNow(),
    terminalConnected: Boolean(nativeConnectedReader),
    terminalReader: nativeConnectedReader?.serialNumber || nativeConnectedReader?.label || stripeTerminal.connectedReader(),
  };
  const key = JSON.stringify(detail);
  if (key === lastLocalConnectionKey) return;
  lastLocalConnectionKey = key;
  window.dispatchEvent(new CustomEvent("seza:connection-state", { detail }));
  void sendDeviceHeartbeat(true);
}

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
  const selectedUsbPrinterId = escposUsb.selectedUsbDeviceId();
  let usbPrinterConnected = false;
  let usbPrinterName: string | null = null;
  if (hardware.driver === "escpos-usb" && selectedUsbPrinterId != null) {
    try {
      usbPrinterConnected = await escposUsb.usbPrinterReady();
    } catch {
      usbPrinterConnected = false;
    }
    try {
      const devices = await escposUsb.listUsbPrinters();
      usbPrinterName = devices.find((device) => device.deviceId === selectedUsbPrinterId)?.name ?? null;
    } catch {
      usbPrinterName = null;
    }
  }
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
  let terminalSetup: {
    ready: boolean;
    connectStatus: string;
    locationReady: boolean;
    configuredReader: string | null;
  } = {
    ready: false,
    connectStatus: "not_started",
    locationReady: false,
    configuredReader: null,
  };
  try {
    const context = await stripeTerminal.getStripeTerminalContext();
    const configuredTerminal =
      context.terminals.find((terminal) => terminal.status === "active") ?? context.terminals[0];
    terminalSetup = {
      ready: Boolean(context.ready),
      connectStatus: context.connectStatus || "not_started",
      locationReady: Boolean(context.terminalLocationReady),
      configuredReader: configuredTerminal
        ? configuredTerminal.serial || configuredTerminal.label || "Stripe Reader M2"
        : null,
    };
  } catch {}

  const nativeConnectedReader = await stripeTerminal.getNativeConnectedReader().catch(() => null);

  return {
    captured_at: new Date().toISOString(),
    online: isNetworkConnectedNow(),
    route: typeof window === "undefined" ? null : window.location.pathname,
    printer: {
      driver: hardware.driver,
      driver_label: hardware.driverLabel,
      configured: hardware.driver !== "none",
      paired:
        hardware.driver === "escpos-usb"
          ? selectedUsbPrinterId != null
          : Boolean(savedPrinter || hardware.lastPrintOk),
      connected: hardware.driver === "escpos-usb" ? usbPrinterConnected : Boolean(savedPrinter),
      name:
        hardware.driver === "escpos-usb"
          ? usbPrinterName ?? (selectedUsbPrinterId != null ? `USB printer ${selectedUsbPrinterId}` : null)
          : savedPrinter?.name ?? null,
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
      merchant_ready: terminalSetup.ready,
      connect_status: terminalSetup.connectStatus,
      location_ready: terminalSetup.locationReady,
      configured_reader: terminalSetup.configuredReader,
      connected_reader:
        nativeConnectedReader?.serialNumber ||
        nativeConnectedReader?.label ||
        stripeTerminal.connectedReader(),
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

  sending = true;
  try {
    const snapshot = await buildSnapshot();
    const key = stableSnapshotKey(snapshot);
    const now = Date.now();
    if (!force && key === lastSnapshotKey && now - lastSentAt < MAX_SILENCE_MS) return;

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
      publishHeartbeatState(true);
      const result = (await response.json().catch(() => ({}))) as { store_config?: any };
      lastSnapshotKey = key;
      lastSentAt = now;

      if (result.store_config && result.store_config.id === pairing.storeId) {
        const cacheKey = `store:${pairing.storeId}`;
        const previousStore = await readMeta<any>(cacheKey).catch(() => undefined);
        const nextStore = { ...(previousStore ?? {}), ...result.store_config };
        await Promise.all([
          cacheMeta(cacheKey, nextStore),
          cacheMeta("store", nextStore),
        ]).catch(() => undefined);

        const currentUserId = await readMeta<string>("authenticated_me_current_user").catch(() => undefined);
        if (currentUserId) {
          const meKey = `authenticated_me:${currentUserId}`;
          const cachedMe = await readMeta<any>(meKey).catch(() => undefined);
          if (cachedMe?.store?.id === pairing.storeId) {
            await cacheMeta(meKey, { ...cachedMe, store: nextStore }).catch(() => undefined);
          }
        }
        window.dispatchEvent(new Event("seza:bootstrap-updated"));
      }

      // Catalog/employee refresh remains throttled separately; lightweight
      // operating settings above update every foreground heartbeat.
      void refreshDeviceBootstrap().catch(() => undefined);
      void import("@/lib/offline/sync").then(({ syncNow }) =>
        syncNow().catch(() => undefined),
      );
    }
  } catch {
    publishHeartbeatState(false);
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
  }, CLOUD_KEEPALIVE_MS);
}

export function startDeviceHeartbeat() {
  if (typeof window === "undefined") return () => {};
  stopped = false;
  void (async () => {
    // Restore Stripe once at startup, then keep connection monitoring read-only.
    // This prevents the heartbeat from reinitializing/replacing Stripe while
    // USB discovery or a payment is in flight.
    await stripeTerminal.restoreStripeTerminalSelection().catch(() => false);
    if (stopped) return;
    await pollLocalConnections();
    if (stopped) return;
    localConnectionTimer = setInterval(() => { void pollLocalConnections(); }, LOCAL_CONNECTION_POLL_MS);
    await sendDeviceHeartbeat(true);
    scheduleNext();
  })();

  const refreshForegroundSnapshot = () => {
    // Refresh store/products whenever cashier returns to SEZA.
    void refreshDeviceBootstrap(true).catch(() => undefined);
    void sendDeviceHeartbeat(true);
  };

  const onOnline = refreshForegroundSnapshot;
  const onFocus = refreshForegroundSnapshot;
  const onConfigChanged = () => void sendDeviceHeartbeat(true);
  const onHardwareChanged = () => void sendDeviceHeartbeat(true);

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      refreshForegroundSnapshot();
      scheduleNext();
    } else if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("seza:device-config-changed", onConfigChanged as EventListener);
  window.addEventListener("pos-hardware-change", onHardwareChanged as EventListener);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (localConnectionTimer) clearInterval(localConnectionTimer);
    localConnectionTimer = null;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("seza:device-config-changed", onConfigChanged as EventListener);
    window.removeEventListener("pos-hardware-change", onHardwareChanged as EventListener);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
