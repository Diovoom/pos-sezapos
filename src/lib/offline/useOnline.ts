// Online/offline hook + broadcast of sync events.
//
// Android WebView's `navigator.onLine` is unreliable for pages loaded from
// the `capacitor://` scheme  -  it often stays `true` after Wi-Fi is turned
// off. We layer an authoritative override on top, driven by the Capacitor
// Network plugin (wired in androidLifecycle.ts). When the override is set,
// it takes precedence over `navigator.onLine`.
import { useEffect, useState, useSyncExternalStore } from "react";

let overrideOnline: boolean | null = null;
let backendReachable: boolean | null = null;
let backendCheckedAt = 0;
const overrideListeners = new Set<() => void>();

/** Called by the native lifecycle bridge whenever the OS reports a change. */
export function setNativeOnline(state: boolean) {
  if (overrideOnline === state) return;
  overrideOnline = state;
  if (!state) backendReachable = false;
  // Fire standard window events so any consumer polling navigator.onLine
  // also gets a chance to re-render.
  try {
    window.dispatchEvent(new Event(state ? "online" : "offline"));
  } catch {
    /* SSR */
  }
  overrideListeners.forEach((l) => l());
}


/**
 * Marks whether the SEZA cloud itself is reachable. A device may have Wi-Fi
 * while DNS/TLS/Cloudflare is unavailable; treating that as fully online is
 * what used to send cashiers down fragile cloud-only paths.
 */
export function setBackendReachable(state: boolean) {
  backendReachable = state;
  backendCheckedAt = Date.now();
  overrideListeners.forEach((l) => l());
}

export function isNetworkConnectedNow(): boolean {
  if (overrideOnline !== null) return overrideOnline;
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function isBackendReachableNow(): boolean {
  if (!isNetworkConnectedNow()) return false;
  if (backendReachable === false && Date.now() - backendCheckedAt < 30_000) return false;
  return true;
}

/** Imperative read used by non-React code paths (sync driver, finalize). */
export function isOnlineNow(): boolean {
  return isBackendReachableNow();
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  overrideListeners.add(cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    overrideListeners.delete(cb);
  };
}
function snapshot() {
  return isOnlineNow();
}
function serverSnapshot() {
  return true;
}
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/* Simple event bus for sync progress */
type SyncEvent = {
  type: "start" | "progress" | "done" | "error";
  pending?: number;
  message?: string;
};
type Listener = (e: SyncEvent) => void;
const listeners = new Set<Listener>();
export function emitSync(e: SyncEvent) {
  listeners.forEach((l) => l(e));
}
export function useSyncEvents() {
  const [last, setLast] = useState<SyncEvent | null>(null);
  useEffect(() => {
    const l: Listener = (e) => setLast(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return last;
}
