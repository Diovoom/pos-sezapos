import { registerPlugin } from "@capacitor/core";

export type UsbPrinterDevice = {
  deviceId: number;
  vendorId: number;
  productId: number;
  name: string;
  manufacturer?: string | null;
  permission: boolean;
  printerCandidate: boolean;
  endpointType?: number;
  interfaceCount?: number;
};

type UsbPrinterProfile = {
  vendorId: number;
  productId: number;
  name?: string | null;
  manufacturer?: string | null;
};

type UsbPrinterPlugin = {
  listDevices(): Promise<{ devices: UsbPrinterDevice[] }>;
  requestPermission(options: { deviceId: number }): Promise<{ granted: boolean; deviceId: number }>;
  status(options: { deviceId: number }): Promise<{ connected: boolean; permission: boolean; ready: boolean }>;
  write(options: { deviceId: number; base64: string }): Promise<{ bytesWritten: number }>;
  testPrint(options: { deviceId: number }): Promise<void>;
};

const NativeUsbPrinter = registerPlugin<UsbPrinterPlugin>("SezaUsbPrinter");
const KEY = "pos.hardware.usbPrinterDevice";
const PROFILE_KEY = "pos.hardware.usbPrinterProfile";

function localGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function localSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch {}
}

function readProfile(): UsbPrinterProfile | null {
  const raw = localGet(PROFILE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<UsbPrinterProfile>;
    if (!Number.isInteger(value.vendorId) || !Number.isInteger(value.productId)) return null;
    return {
      vendorId: Number(value.vendorId),
      productId: Number(value.productId),
      name: typeof value.name === "string" ? value.name : null,
      manufacturer: typeof value.manufacturer === "string" ? value.manufacturer : null,
    };
  } catch {
    return null;
  }
}

function saveProfile(device: UsbPrinterDevice) {
  localSet(PROFILE_KEY, JSON.stringify({
    vendorId: device.vendorId,
    productId: device.productId,
    name: device.name || null,
    manufacturer: device.manufacturer || null,
  } satisfies UsbPrinterProfile));
}

function profileMatches(device: UsbPrinterDevice, profile: UsbPrinterProfile): boolean {
  if (device.vendorId !== profile.vendorId || device.productId !== profile.productId) return false;
  // Android can change UsbDevice.deviceName across boots (for example a
  // /dev/bus/usb/... path), so never use that transient name as an identity
  // gate. VID/PID is stable; manufacturer is only a safe optional tie-breaker.
  if (profile.manufacturer && device.manufacturer && profile.manufacturer !== device.manufacturer) return false;
  return true;
}

export function selectedUsbDeviceId(): number | null {
  const value = Number(localGet(KEY));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function selectUsbDevice(deviceId: number) {
  localSet(KEY, String(deviceId));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pos-hardware-change"));
}

export function clearUsbDevice() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(PROFILE_KEY);
  window.dispatchEvent(new CustomEvent("pos-hardware-change"));
}

export async function listUsbPrinters() {
  const devices = (await NativeUsbPrinter.listDevices()).devices.filter((d) => d.printerCandidate);
  // Stripe Reader M2 exposes an interrupt OUT endpoint and can look like a
  // generic writable USB device. Prefer true BULK endpoints for receipt printers
  // so SEZA never auto-selects the card reader as a printer.
  const bulk = devices.filter((d) => d.endpointType === 2);
  if (bulk.length > 0) return bulk;
  return devices.filter((d) => !/bbpos|stripe|strm2/i.test(`${d.manufacturer ?? ""} ${d.name ?? ""}`));
}

async function resolveSelectedUsbPrinter(): Promise<UsbPrinterDevice | null> {
  const devices = await listUsbPrinters();
  if (devices.length === 0) return null;

  const selectedId = selectedUsbDeviceId();
  const profile = readProfile();
  const selected = selectedId == null ? null : devices.find((d) => d.deviceId === selectedId) ?? null;

  if (selected && (!profile || profileMatches(selected, profile))) {
    if (!profile) saveProfile(selected);
    return selected;
  }

  if (profile) {
    const remapped = devices.find((d) => profileMatches(d, profile));
    if (remapped) {
      // Android USB deviceId values are ephemeral and commonly change after a
      // reboot/power outage. Remap the saved printer to its new deviceId.
      localSet(KEY, String(remapped.deviceId));
      return remapped;
    }
  }

  // Backward compatibility for older installs that saved only a deviceId. If
  // there is exactly one real USB printer, adopt it and persist a stable profile.
  if (selectedId != null && devices.length === 1) {
    saveProfile(devices[0]);
    localSet(KEY, String(devices[0].deviceId));
    return devices[0];
  }

  return null;
}

export async function pairUsbPrinter(deviceId: number) {
  const devices = await listUsbPrinters();
  const device = devices.find((d) => d.deviceId === deviceId);
  if (!device) throw new Error("USB printer not found");
  const result = await NativeUsbPrinter.requestPermission({ deviceId });
  if (!result.granted) throw new Error("USB printer permission was denied");
  saveProfile(device);
  selectUsbDevice(deviceId);
}

/**
 * Restore the saved USB printer after app/device restart. Android assigns a new
 * deviceId after many reboots, so this resolves the stable VID/PID profile and
 * requests USB permission only when the OS hasn't already granted it.
 */
export async function autoReconnectUsbPrinter(): Promise<boolean> {
  const device = await resolveSelectedUsbPrinter();
  if (!device) return false;

  let status = await NativeUsbPrinter.status({ deviceId: device.deviceId });
  if (status.ready) return true;
  if (!status.connected) return false;

  if (!status.permission) {
    const result = await NativeUsbPrinter.requestPermission({ deviceId: device.deviceId });
    if (!result.granted) return false;
  }

  status = await NativeUsbPrinter.status({ deviceId: device.deviceId });
  if (status.ready) {
    localSet(KEY, String(device.deviceId));
    saveProfile(device);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pos-hardware-change"));
  }
  return status.ready;
}

export async function usbPrinterReady() {
  const device = await resolveSelectedUsbPrinter();
  if (!device) return false;
  const status = await NativeUsbPrinter.status({ deviceId: device.deviceId });
  return status.ready;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function readyDeviceForWrite(): Promise<number> {
  const ready = await autoReconnectUsbPrinter();
  if (!ready) throw new Error("USB printer is not ready");
  const device = await resolveSelectedUsbPrinter();
  if (!device) throw new Error("No USB printer selected");
  return device.deviceId;
}

export async function writeUsb(bytes: Uint8Array) {
  const deviceId = await readyDeviceForWrite();
  await NativeUsbPrinter.write({ deviceId, base64: bytesToBase64(bytes) });
}

export async function nativeUsbTestPrint() {
  const deviceId = await readyDeviceForWrite();
  await NativeUsbPrinter.testPrint({ deviceId });
}
