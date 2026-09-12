import { Network } from "@capacitor/network";
import { getActivePrinter, getActiveTerminal } from "@/lib/hardware";
import { getDeviceId } from "@/lib/offline/db";
import { isNativeMode } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";
import { setBackendReachable } from "@/lib/offline/useOnline";

export type PosConnectionState = {
  networkConnected: boolean;
  connectionType: string;
  cloudReachable: boolean;
  heartbeatAcknowledged: boolean;
  lastCheckedAt: string;
  printerReady: boolean;
  terminalReady: boolean;
  pendingSync: number;
};

const KEY = "seza.pos.connectionState";
const REMOTE_API_ORIGIN = "https://sezapos.com";

function apiOrigin(): string {
  if (typeof window === "undefined") return REMOTE_API_ORIGIN;
  return isNativeMode() ? REMOTE_API_ORIGIN : window.location.origin;
}
function save(state: PosConnectionState) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("seza-pos-connection", { detail: state }));
}
export function readPosConnectionState(): PosConnectionState | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as PosConnectionState | null; }
  catch { return null; }
}

type DeviceCredentials = { store_id: string; device_id: string; device_secret: string };
function credentials(): DeviceCredentials | null {
  const candidates = ["seza.pos.device_credentials", "seza.device.credentials", "pos.device.credentials"];
  for (const key of candidates) {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null");
      if (value?.store_id && value?.device_id && value?.device_secret) return value;
    } catch { /* ignore */ }
  }
  return null;
}

export async function sendPosHeartbeat(input: {
  storeId?: string;
  registerId?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  shiftId?: string | null;
  pendingSync?: number;
}): Promise<PosConnectionState> {
  const nativeStatus = isNativeMode() ? await Network.getStatus().catch(() => null) : null;
  const networkConnected = nativeStatus?.connected ?? navigator.onLine;
  const connectionType = nativeStatus?.connectionType ?? (networkConnected ? "browser" : "none");
  const [printerReady, terminalReady] = await Promise.all([
    getActivePrinter().isReady().catch(() => false),
    getActiveTerminal().isReady().catch(() => false),
  ]);
  let cloudReachable = false;
  let heartbeatAcknowledged = false;
  if (networkConnected) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    try {
      const creds = credentials();
      if (creds && (!input.storeId || creds.store_id === input.storeId)) {
        const response = await fetch(`${apiOrigin()}/api/public/pos/device-heartbeat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...creds,
            app_version: import.meta.env.VITE_APP_VERSION ?? "android",
            status_snapshot: {
              network_connected: networkConnected,
              connection_type: connectionType,
              cloud_sync: true,
              printer_ready: printerReady,
              terminal_ready: terminalReady,
              register_id: input.registerId ?? null,
              employee_id: input.employeeId ?? null,
              employee_name: input.employeeName ?? null,
              shift_id: input.shiftId ?? null,
              pending_sync: input.pendingSync ?? 0,
              runtime: isNativeMode() ? "android" : "web",
              local_device_id: getDeviceId(),
            },
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        cloudReachable = response.status < 500;
        heartbeatAcknowledged = response.ok;
      } else {
        const response = await fetch(`${apiOrigin()}/api/public/health?ts=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        const body = response.ok ? await response.json().catch(() => null) : null;
        cloudReachable = Boolean(response.ok && (!body || body?.status === "operational" || body?.status === "degraded" || body?.ok === true));
        heartbeatAcknowledged = cloudReachable;
      }
    } catch {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const { error } = await supabase.from("stores").select("id").limit(1);
          cloudReachable = !error;
          heartbeatAcknowledged = !error;
        }
      } catch {
        cloudReachable = false;
        heartbeatAcknowledged = false;
      }
    }
    finally { window.clearTimeout(timeout); }
  }
  setBackendReachable(networkConnected && cloudReachable);
  const state: PosConnectionState = {
    networkConnected, connectionType, cloudReachable, heartbeatAcknowledged,
    lastCheckedAt: new Date().toISOString(), printerReady, terminalReady, pendingSync: input.pendingSync ?? 0,
  };
  save(state);
  return state;
}

export function isSezaCloudOnline(): boolean {
  const state = readPosConnectionState();
  return Boolean(state?.networkConnected && state?.cloudReachable && state?.heartbeatAcknowledged);
}
