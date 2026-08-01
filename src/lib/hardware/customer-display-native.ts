import { registerPlugin } from "@capacitor/core";

export type NativeDisplayInfo = {
  displayId: number;
  name: string;
  state: number;
  valid: boolean;
  active: boolean;
};

type CustomerDisplayPlugin = {
  listDisplays(): Promise<{ displays: NativeDisplayInfo[]; activeDisplayId: number }>;
  start(options: { displayId: number; storeId: string }): Promise<{ started: boolean; displayId: number; url: string }>;
  stop(): Promise<void>;
  status(): Promise<{ running: boolean; displayId: number }>;
};

const NativeCustomerDisplay = registerPlugin<CustomerDisplayPlugin>("SezaCustomerDisplay");

export async function listNativeCustomerDisplays() {
  return NativeCustomerDisplay.listDisplays();
}

export async function startNativeCustomerDisplay(displayId: number, storeId: string) {
  return NativeCustomerDisplay.start({ displayId, storeId });
}

export async function stopNativeCustomerDisplay() {
  await NativeCustomerDisplay.stop();
}

export async function nativeCustomerDisplayStatus() {
  return NativeCustomerDisplay.status();
}
