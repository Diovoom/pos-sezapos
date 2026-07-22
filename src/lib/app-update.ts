import { isNativeMode } from "@/lib/native";

export const SEZA_APP_VERSION = "1.2.0";
export const SEZA_APP_BUILD = 3;
export const SEZA_APP_UPDATE_EVENT = "seza-app-update-available";

export type SezaVersionManifest = {
  version: string;
  build: number;
  minimumSupportedVersion?: string;
  mandatory?: boolean;
  updateUrl: string;
  releaseNotes?: string[];
};

function parts(value: string) {
  return value.split(".").map((part) => Number(part.replace(/\D.*/, "")) || 0);
}

export function isNewerVersion(candidate: string, current: string) {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}

export async function initializeAppUpdateWorkflow() {
  if (!isNativeMode()) return;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch (error) {
    console.warn("[SEZA update] updater readiness notification failed", error);
  }

  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const response = await fetch(`https://sezapos.com/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const manifest = (await response.json()) as SezaVersionManifest;
    if (!isNewerVersion(manifest.version, info.version || SEZA_APP_VERSION)) return;
    window.dispatchEvent(new CustomEvent(SEZA_APP_UPDATE_EVENT, { detail: manifest }));
  } catch (error) {
    console.warn("[SEZA update] version check failed", error);
  }
}
