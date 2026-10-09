import { isNativeMode } from "@/lib/native";

export const SEZA_APP_VERSION = "1.3.3";
export const SEZA_APP_BUILD = 10;
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

export function isNewerAppRelease(manifest: SezaVersionManifest, currentVersion: string, currentBuild: string | number) {
  if (isNewerVersion(manifest.version, currentVersion)) return true;
  if (isNewerVersion(currentVersion, manifest.version)) return false;
  const build = Number(currentBuild);
  return Number.isSafeInteger(manifest.build) && Number.isSafeInteger(build) && manifest.build > build;
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
    const { nativeFetch } = await import("../../capacitor-shell/lib/nativeHttp");
    const response = await nativeFetch(`https://sezapos.com/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const manifest = (await response.json()) as SezaVersionManifest;
    if (!isNewerAppRelease(manifest, info.version || SEZA_APP_VERSION, info.build || SEZA_APP_BUILD)) return;
    window.dispatchEvent(new CustomEvent(SEZA_APP_UPDATE_EVENT, { detail: manifest }));
  } catch (error) {
    console.warn("[SEZA update] version check failed", error);
  }
}
