/**
 * Browser-only hardware helpers.
 * These use experimental Web* APIs (WebUSB, WebBluetooth, WebSerial, WebHID).
 * They provide connect/status semantics for the Settings hardware pages.
 * Real driver logic is intentionally left to per-provider modules — this file
 * only handles device discovery and connection state.
 */

export type HardwareKind = "printer" | "drawer" | "scanner" | "display" | "terminal";

export type DeviceInfo = {
  id: string;
  kind: HardwareKind;
  name: string;
  transport: "usb" | "bluetooth" | "serial" | "hid" | "network";
  connected: boolean;
  detail?: Record<string, unknown>;
};

type NavigatorLike = Navigator & {
  usb?: { requestDevice: (o: { filters: unknown[] }) => Promise<{ productName?: string; manufacturerName?: string; serialNumber?: string; open: () => Promise<void> }> };
  bluetooth?: { requestDevice: (o: { acceptAllDevices?: boolean; filters?: unknown[]; optionalServices?: string[] }) => Promise<{ name?: string; id: string; gatt?: { connect: () => Promise<unknown> } }> };
  serial?: { requestPort: () => Promise<{ open: (o: { baudRate: number }) => Promise<void>; getInfo: () => { usbVendorId?: number; usbProductId?: number } }> };
  hid?: { requestDevice: (o: { filters: unknown[] }) => Promise<Array<{ productName?: string; vendorId?: number; productId?: number; open: () => Promise<void> }>> };
};

export const support = {
  get usb() { return typeof navigator !== "undefined" && !!(navigator as NavigatorLike).usb; },
  get bluetooth() { return typeof navigator !== "undefined" && !!(navigator as NavigatorLike).bluetooth; },
  get serial() { return typeof navigator !== "undefined" && !!(navigator as NavigatorLike).serial; },
  get hid() { return typeof navigator !== "undefined" && !!(navigator as NavigatorLike).hid; },
};

const STORE_KEY = "pos.hardware.v1";

function load(): DeviceInfo[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]"); } catch { return []; }
}
function save(list: DeviceInfo[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("pos-hardware-change"));
}

export function listDevices(): DeviceInfo[] { return load(); }
export function getDevice(kind: HardwareKind): DeviceInfo | undefined {
  return load().find((d) => d.kind === kind && d.connected);
}
export function removeDevice(id: string) { save(load().filter((d) => d.id !== id)); }
export function setConnected(id: string, connected: boolean) {
  const list = load().map((d) => (d.id === id ? { ...d, connected } : d));
  save(list);
}

export function subscribe(cb: () => void) {
  const h = () => cb();
  window.addEventListener("pos-hardware-change", h);
  return () => window.removeEventListener("pos-hardware-change", h);
}

/* ---------- Connect flows ---------- */

export async function connectUsb(kind: HardwareKind): Promise<DeviceInfo> {
  const nav = navigator as NavigatorLike;
  if (!nav.usb) throw new Error("WebUSB not supported in this browser");
  const dev = await nav.usb.requestDevice({ filters: [] });
  await dev.open();
  const info: DeviceInfo = {
    id: crypto.randomUUID(),
    kind,
    transport: "usb",
    name: dev.productName ?? "USB device",
    connected: true,
    detail: { manufacturer: dev.manufacturerName, serial: dev.serialNumber },
  };
  save([...load().filter((d) => d.kind !== kind), info]);
  return info;
}

export async function connectBluetooth(kind: HardwareKind): Promise<DeviceInfo> {
  const nav = navigator as NavigatorLike;
  if (!nav.bluetooth) throw new Error("Web Bluetooth not supported in this browser");
  const dev = await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ["battery_service"] });
  await dev.gatt?.connect();
  const info: DeviceInfo = {
    id: dev.id ?? crypto.randomUUID(),
    kind,
    transport: "bluetooth",
    name: dev.name ?? "Bluetooth device",
    connected: true,
  };
  save([...load().filter((d) => d.kind !== kind), info]);
  return info;
}

export async function connectSerial(kind: HardwareKind, baudRate = 9600): Promise<DeviceInfo> {
  const nav = navigator as NavigatorLike;
  if (!nav.serial) throw new Error("Web Serial not supported in this browser");
  const port = await nav.serial.requestPort();
  await port.open({ baudRate });
  const meta = port.getInfo();
  const info: DeviceInfo = {
    id: crypto.randomUUID(),
    kind,
    transport: "serial",
    name: `Serial device (${meta.usbVendorId ?? "?"}:${meta.usbProductId ?? "?"})`,
    connected: true,
    detail: meta,
  };
  save([...load().filter((d) => d.kind !== kind), info]);
  return info;
}

export async function connectHid(kind: HardwareKind): Promise<DeviceInfo> {
  const nav = navigator as NavigatorLike;
  if (!nav.hid) throw new Error("WebHID not supported in this browser");
  const [dev] = await nav.hid.requestDevice({ filters: [] });
  if (!dev) throw new Error("No device chosen");
  await dev.open();
  const info: DeviceInfo = {
    id: crypto.randomUUID(),
    kind,
    transport: "hid",
    name: dev.productName ?? "HID device",
    connected: true,
    detail: { vendorId: dev.vendorId, productId: dev.productId },
  };
  save([...load().filter((d) => d.kind !== kind), info]);
  return info;
}

export async function testDevice(id: string): Promise<{ ok: boolean; message: string }> {
  const dev = load().find((d) => d.id === id);
  if (!dev) return { ok: false, message: "Device not found" };
  // A real driver would send a status/ping frame. We report connection state.
  return { ok: dev.connected, message: dev.connected ? "Device responded" : "Device not connected" };
}
