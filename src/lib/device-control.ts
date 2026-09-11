import { registerPlugin } from "@capacitor/core";
import { isNativeMode } from "@/lib/native";

export type ConnectivityState = {
  wifiSupported: boolean;
  wifiEnabled: boolean;
  bluetoothSupported: boolean;
  bluetoothEnabled: boolean | null;
};

export type TerminalPermissionState = {
  granted: boolean;
  locationGranted: boolean;
  bluetoothGranted: boolean;
};

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
  getConnectivityState(): Promise<ConnectivityState>;
  openWifiSettings(): Promise<void>;
  openBluetoothSettings(): Promise<void>;
  requestTerminalPermissions(options: { method: "usb" | "bluetooth" }): Promise<TerminalPermissionState>;
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
  getConnectivityState: () => NativeDeviceControl.getConnectivityState(),
  openWifiSettings: () => NativeDeviceControl.openWifiSettings(),
  openBluetoothSettings: () => NativeDeviceControl.openBluetoothSettings(),
  requestTerminalPermissions: (method: "usb" | "bluetooth") =>
    NativeDeviceControl.requestTerminalPermissions({ method }),
  startKiosk: () => NativeDeviceControl.startKiosk(),
  stopKiosk: () => NativeDeviceControl.stopKiosk(),
  relaunch: () => NativeDeviceControl.relaunch(),
  exitToLauncher: () => NativeDeviceControl.exitToLauncher(),
};
