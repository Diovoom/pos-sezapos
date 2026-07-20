// Toast-driven "Press back again to exit" UI for the main register screen.
//
// Renders a small live region controlled by `showExitToast()`. We use a
// singleton (not React state per-mount) so the Android lifecycle callback
// can trigger it from anywhere without wiring context.
import { useEffect, useState } from "react";

type Listener = (visible: boolean) => void;
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showExitToast(durationMs = 2000) {
  listeners.forEach((l) => l(true));
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    listeners.forEach((l) => l(false));
    hideTimer = null;
  }, durationMs);
}

export function ExitConfirmToast() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const l: Listener = (v) => setVisible(v);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-black/85 px-4 py-2 text-sm font-medium text-white shadow-lg"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      Press back again to exit
    </div>
  );
}
