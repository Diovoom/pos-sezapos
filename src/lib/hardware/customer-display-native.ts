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
  start(options: { displayId: number; storeId: string; storeName?: string; idlePayload?: string }): Promise<{ started: boolean; displayId: number }>;
  update(options: { payload: string }): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ running: boolean; displayId: number }>;
};

const NativeCustomerDisplay = registerPlugin<CustomerDisplayPlugin>("SezaCustomerDisplay");

export async function listNativeCustomerDisplays() {
  return NativeCustomerDisplay.listDisplays();
}

export async function startNativeCustomerDisplay(
  displayId: number,
  storeId: string,
  storeName?: string,
  idlePayload?: unknown,
) {
  return NativeCustomerDisplay.start({
    displayId,
    storeId,
    storeName,
    idlePayload: idlePayload ? JSON.stringify(idlePayload) : undefined,
  });
}

export async function updateNativeCustomerDisplay(payload: unknown) {
  await NativeCustomerDisplay.update({ payload: JSON.stringify(payload) });
}

export async function stopNativeCustomerDisplay() {
  await NativeCustomerDisplay.stop();
}

export async function nativeCustomerDisplayStatus() {
  return NativeCustomerDisplay.status();
}
