// Bluetooth Low Energy transport for generic ESC/POS printers.
// Uses @capacitor-community/bluetooth-le. Works on Android/iOS when the
// Capacitor plugin is registered; falls back with a clear error on web.
//
// Pairing model:
//   1. scan() briefly to enumerate nearby printers advertising a printer
//      service or any known printer name prefix.
//   2. User taps one -> we persist { deviceId, serviceUuid, writeCharUuid }
//      in localStorage.
//   3. write() connects on demand, writes the ESC/POS bytes in ≤180-byte
//      chunks (default BLE MTU), and disconnects.
//
// This is intentionally minimal  -  merchants that need advanced printer
// features (image logo, kanji, cash-drawer pulse tuning) should use the
// Star or Epson driver once their SDK is linked.

import { isNativeMode } from "@/lib/native";

const LS_KEY = "pos.hardware.escpos.ble";

export interface EscPosBleTarget {
  deviceId: string;
  name?: string;
  serviceUuid: string;
  writeCharUuid: string;
}

// Well-known printer service UUIDs (ESC/POS / RN4020-style modules).
const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // common ESC/POS
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // some Star/BT modules
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip RN
];

const NAME_HINTS = ["printer", "escpos", "pos", "rpp", "mtp", "gp-", "xp-", "hm-a", "srp-"];

type BleClient = (typeof import("@capacitor-community/bluetooth-le"))["BleClient"];
let cache: BleClient | null = null;
async function ble(): Promise<BleClient> {
  if (cache) return cache;
  const mod = await import("@capacitor-community/bluetooth-le");
  cache = mod.BleClient;
  await cache.initialize({ androidNeverForLocation: true });
  return cache;
}

export function getSavedTarget(): EscPosBleTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as EscPosBleTarget) : null;
  } catch {
    return null;
  }
}

export function saveTarget(t: EscPosBleTarget | null) {
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem(LS_KEY, JSON.stringify(t));
  else window.localStorage.removeItem(LS_KEY);
}

export async function scanForPrinters(
  onDevice: (d: { deviceId: string; name?: string; rssi?: number }) => void,
  ms = 6000,
): Promise<void> {
  if (!isNativeMode()) throw new Error("Bluetooth scanning is only available in the SEZA POS app.");
  const client = await ble();
  await client.requestLEScan({}, (r) => {
    const name = r.device.name?.toLowerCase() ?? r.localName?.toLowerCase() ?? "";
    const looksLikePrinter =
      NAME_HINTS.some((h) => name.includes(h)) ||
      (r.uuids ?? []).some((u) => PRINTER_SERVICES.includes(u.toLowerCase()));
    if (looksLikePrinter || name) {
      onDevice({ deviceId: r.device.deviceId, name: r.device.name ?? r.localName, rssi: r.rssi });
    }
  });
  await new Promise((r) => setTimeout(r, ms));
  await client.stopLEScan();
}

async function discoverWritable(
  client: BleClient,
  deviceId: string,
): Promise<{ serviceUuid: string; writeCharUuid: string } | null> {
  const services = await client.getServices(deviceId);
  // Prefer known printer services.
  for (const s of services) {
    const isKnown = PRINTER_SERVICES.includes(s.uuid.toLowerCase());
    for (const c of s.characteristics) {
      const canWrite = c.properties.write || c.properties.writeWithoutResponse;
      if (canWrite && (isKnown || services.length === 1)) {
        return { serviceUuid: s.uuid, writeCharUuid: c.uuid };
      }
    }
  }
  // Fallback: first writable characteristic we find.
  for (const s of services) {
    for (const c of s.characteristics) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        return { serviceUuid: s.uuid, writeCharUuid: c.uuid };
      }
    }
  }
  return null;
}

export async function pair(deviceId: string, name?: string): Promise<EscPosBleTarget> {
  const client = await ble();
  await client.connect(deviceId, undefined, { timeout: 15000 });
  try {
    const found = await discoverWritable(client, deviceId);
    if (!found) throw new Error("No writable characteristic found on this device.");
    const target: EscPosBleTarget = { deviceId, name, ...found };
    saveTarget(target);
    return target;
  } finally {
    try {
      await client.disconnect(deviceId);
    } catch {
      /* ignore */
    }
  }
}

export async function write(payload: Uint8Array): Promise<void> {
  const target = getSavedTarget();
  if (!target) throw new Error("No printer paired. Open Settings → Printer to pair one.");
  const client = await ble();
  await client.connect(target.deviceId, undefined, { timeout: 12000 });
  try {
    // Chunk into 180-byte writes (safe for default 185 MTU minus 3-byte ATT header).
    const CHUNK = 180;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const dv = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
      await client.writeWithoutResponse(
        target.deviceId,
        target.serviceUuid,
        target.writeCharUuid,
        dv,
      );
    }
  } finally {
    try {
      await client.disconnect(target.deviceId);
    } catch {
      /* ignore */
    }
  }
}

export async function isPaired(): Promise<boolean> {
  return !!getSavedTarget();
}
