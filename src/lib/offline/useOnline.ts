// Online/offline hook + broadcast of sync events.
import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
function snapshot() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
function serverSnapshot() {
  return true;
}
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/* Simple event bus for sync progress */
type SyncEvent = { type: "start" | "progress" | "done" | "error"; pending?: number; message?: string };
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
    return () => { listeners.delete(l); };
  }, []);
  return last;
}
