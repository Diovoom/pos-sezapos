import { registerPlugin } from "@capacitor/core";

export type UsbPrinterDevice = {
  deviceId: number; vendorId: number; productId: number; name: string;
  manufacturer?: string | null; permission: boolean; printerCandidate: boolean;
  endpointType?: number; interfaceCount?: number;
};
type UsbPrinterProfile = { vendorId: number; productId: number; name?: string | null; manufacturer?: string | null };
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
function localGet(key:string){ if(typeof window==="undefined") return null; try{return window.localStorage.getItem(key)}catch{return null} }
function localSet(key:string,value:string){ if(typeof window==="undefined")return; try{window.localStorage.setItem(key,value)}catch{} }
function readProfile():UsbPrinterProfile|null{const raw=localGet(PROFILE_KEY);if(!raw)return null;try{const v=JSON.parse(raw) as Partial<UsbPrinterProfile>;if(!Number.isInteger(v.vendorId)||!Number.isInteger(v.productId))return null;return{vendorId:Number(v.vendorId),productId:Number(v.productId),name:typeof v.name==="string"?v.name:null,manufacturer:typeof v.manufacturer==="string"?v.manufacturer:null}}catch{return null}}
function saveProfile(d:UsbPrinterDevice){localSet(PROFILE_KEY,JSON.stringify({vendorId:d.vendorId,productId:d.productId,name:d.name||null,manufacturer:d.manufacturer||null} satisfies UsbPrinterProfile))}
function profileMatches(d:UsbPrinterDevice,p:UsbPrinterProfile){if(d.vendorId!==p.vendorId||d.productId!==p.productId)return false;if(p.manufacturer&&d.manufacturer&&p.manufacturer!==d.manufacturer)return false;return true}
export function selectedUsbDeviceId(){const v=Number(localGet(KEY));return Number.isInteger(v)&&v>=0?v:null}
export function selectUsbDevice(deviceId:number){localSet(KEY,String(deviceId));if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("pos-hardware-change"))}
export function clearUsbDevice(){if(typeof window==="undefined")return;window.localStorage.removeItem(KEY);window.localStorage.removeItem(PROFILE_KEY);window.dispatchEvent(new CustomEvent("pos-hardware-change"))}

export async function listUsbPrinters() {
  const devices = (await NativeUsbPrinter.listDevices()).devices.filter((d) => {
    if (!d.printerCandidate) return false;
    const identity = `${d.manufacturer ?? ""} ${d.name ?? ""}`;
    // Stripe/BBPOS M2 (known VID 5538) is a payment terminal, never a printer.
    if (d.vendorId === 5538 || /bbpos|stripe|strm2|reader\s*m2/i.test(identity)) return false;
    return true;
  });
  const bulk = devices.filter((d) => d.endpointType === 2);
  return bulk.length > 0 ? bulk : devices;
}
async function resolveSelectedUsbPrinter():Promise<UsbPrinterDevice|null>{const devices=await listUsbPrinters();if(!devices.length)return null;const id=selectedUsbDeviceId();const profile=readProfile();const selected=id==null?null:devices.find(d=>d.deviceId===id)??null;if(selected&&(!profile||profileMatches(selected,profile))){if(!profile)saveProfile(selected);return selected}if(profile){const remapped=devices.find(d=>profileMatches(d,profile));if(remapped){localSet(KEY,String(remapped.deviceId));return remapped}}if(id!=null&&devices.length===1){saveProfile(devices[0]);localSet(KEY,String(devices[0].deviceId));return devices[0]}return null}
export async function pairUsbPrinter(deviceId:number){const devices=await listUsbPrinters();const device=devices.find(d=>d.deviceId===deviceId);if(!device)throw new Error("USB printer not found");const result=await NativeUsbPrinter.requestPermission({deviceId});if(!result.granted)throw new Error("USB printer permission was denied");saveProfile(device);selectUsbDevice(deviceId)}
export async function autoReconnectUsbPrinter(){const device=await resolveSelectedUsbPrinter();if(!device)return false;let status=await NativeUsbPrinter.status({deviceId:device.deviceId});if(status.ready)return true;if(!status.connected)return false;if(!status.permission){const result=await NativeUsbPrinter.requestPermission({deviceId:device.deviceId});if(!result.granted)return false}status=await NativeUsbPrinter.status({deviceId:device.deviceId});if(status.ready){localSet(KEY,String(device.deviceId));saveProfile(device);if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("pos-hardware-change"))}return status.ready}
export async function usbPrinterReady(){const device=await resolveSelectedUsbPrinter();if(!device)return false;return (await NativeUsbPrinter.status({deviceId:device.deviceId})).ready}
function bytesToBase64(bytes:Uint8Array){let binary="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary)}
async function readyDeviceForWrite(){const ready=await autoReconnectUsbPrinter();if(!ready)throw new Error("USB printer is not ready");const device=await resolveSelectedUsbPrinter();if(!device)throw new Error("No USB printer selected");return device.deviceId}
export async function writeUsb(bytes:Uint8Array){const deviceId=await readyDeviceForWrite();await NativeUsbPrinter.write({deviceId,base64:bytesToBase64(bytes)})}
export async function nativeUsbTestPrint(){const deviceId=await readyDeviceForWrite();await NativeUsbPrinter.testPrint({deviceId})}
