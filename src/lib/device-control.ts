import { registerPlugin } from "@capacitor/core";
import { isNativeMode } from "@/lib/native";

export type DeviceControlState = {
  launchOnBoot: boolean;
  keepAwake: boolean;
  immersive: boolean;
  inLockTask: boolean;
  deviceOwner: boolean;
};

type DeviceControlPlugin = {
  getState(): Promise<DeviceControlState>;
  setLaunchOnBoot(options: { enabled: boolean }): Promise<void>;
  setKeepAwake(options: { enabled: boolean }): Promise<void>;
  setImmersive(options: { enabled: boolean }): Promise<void>;
  startKiosk(): Promise<void>;
  stopKiosk(): Promise<void>;
  relaunch(): Promise<void>;
};

const NativeDeviceControl = registerPlugin<DeviceControlPlugin>("SezaDeviceControl");

export const deviceControl = {
  supported: isNativeMode,
  getState: () => NativeDeviceControl.getState(),
  setLaunchOnBoot: (enabled: boolean) => NativeDeviceControl.setLaunchOnBoot({ enabled }),
  setKeepAwake: (enabled: boolean) => NativeDeviceControl.setKeepAwake({ enabled }),
  setImmersive: (enabled: boolean) => NativeDeviceControl.setImmersive({ enabled }),
  startKiosk: () => NativeDeviceControl.startKiosk(),
  stopKiosk: () => NativeDeviceControl.stopKiosk(),
  relaunch: () => NativeDeviceControl.relaunch(),
};
