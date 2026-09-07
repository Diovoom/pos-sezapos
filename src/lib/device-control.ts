import { registerPlugin } from "@capacitor/core";
import { isNativeMode } from "@/lib/native";

export type DeviceControlState = {
  launchOnBoot: boolean;
  keepAwake: boolean;
  immersive: boolean;
  inLockTask: boolean;
  deviceOwner: boolean;
  brightness: number;
};

type DeviceControlPlugin = {
  getState(): Promise<DeviceControlState>;
  setLaunchOnBoot(options: { enabled: boolean }): Promise<void>;
  setKeepAwake(options: { enabled: boolean }): Promise<void>;
  setImmersive(options: { enabled: boolean }): Promise<void>;
  setBrightness(options: { value: number }): Promise<void>;
  openDisplaySettings(): Promise<void>;
  startKiosk(): Promise<void>;
  stopKiosk(): Promise<void>;
  relaunch(): Promise<void>;
  exitToLauncher(): Promise<void>;
};

const NativeDeviceControl = registerPlugin<DeviceControlPlugin>("SezaDeviceControl");

export const deviceControl = {
  supported: isNativeMode,
  getState: () => NativeDeviceControl.getState(),
  setLaunchOnBoot: (enabled: boolean) => NativeDeviceControl.setLaunchOnBoot({ enabled }),
  setKeepAwake: (enabled: boolean) => NativeDeviceControl.setKeepAwake({ enabled }),
  setImmersive: (enabled: boolean) => NativeDeviceControl.setImmersive({ enabled }),
  setBrightness: (value: number) => NativeDeviceControl.setBrightness({ value }),
  openDisplaySettings: () => NativeDeviceControl.openDisplaySettings(),
  startKiosk: () => NativeDeviceControl.startKiosk(),
  stopKiosk: () => NativeDeviceControl.stopKiosk(),
  relaunch: () => NativeDeviceControl.relaunch(),
  exitToLauncher: () => NativeDeviceControl.exitToLauncher(),
};
