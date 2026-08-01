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

type UsbPrinterPlugin = {
  listDevices(): Promise<{ devices: UsbPrinterDevice[] }>;
  requestPermission(options: { deviceId: number }): Promise<{ granted: boolean; deviceId: number }>;
  status(options: { deviceId: number }): Promise<{ connected: boolean; permission: boolean; ready: boolean }>;
  write(options: { deviceId: number; base64: string }): Promise<{ bytesWritten: number }>;
  testPrint(options: { deviceId: number }): Promise<void>;
};

const NativeUsbPrinter = registerPlugin<UsbPrinterPlugin>("SezaUsbPrinter");
const KEY = "pos.hardware.usbPrinterDevice";

export function selectedUsbDeviceId(): number | null {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(KEY));
  return Number.isInteger(value) && value >= 0 ? value : null;
}
export function selectUsbDevice(deviceId: number) {
  window.localStorage.setItem(KEY, String(deviceId));
  window.dispatchEvent(new CustomEvent("pos-hardware-change"));
}
export function clearUsbDevice() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("pos-hardware-change"));
}
export async function listUsbPrinters() {
  return (await NativeUsbPrinter.listDevices()).devices.filter((d) => d.printerCandidate);
}
export async function pairUsbPrinter(deviceId: number) {
  const result = await NativeUsbPrinter.requestPermission({ deviceId });
  if (!result.granted) throw new Error("USB printer permission was denied");
  selectUsbDevice(deviceId);
}
export async function usbPrinterReady() {
  const deviceId = selectedUsbDeviceId();
  if (deviceId == null) return false;
  const status = await NativeUsbPrinter.status({ deviceId });
  return status.ready;
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
export async function writeUsb(bytes: Uint8Array) {
  const deviceId = selectedUsbDeviceId();
  if (deviceId == null) throw new Error("No USB printer selected");
  await NativeUsbPrinter.write({ deviceId, base64: bytesToBase64(bytes) });
}
export async function nativeUsbTestPrint() {
  const deviceId = selectedUsbDeviceId();
  if (deviceId == null) throw new Error("No USB printer selected");
  await NativeUsbPrinter.testPrint({ deviceId });
}
