import { useEffect, useState } from "react";

let enabled = false;
const listeners = new Set<() => void>();
const BANNER_ID = "seza-training-mode-banner";

function syncBanner() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(BANNER_ID);
  if (!enabled) {
    existing?.remove();
    document.documentElement.removeAttribute("data-seza-training-mode");
    return;
  }
  document.documentElement.setAttribute("data-seza-training-mode", "true");
  if (existing) return;
  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.textContent = "TRAINING MODE — NO REAL TRANSACTIONS";
  banner.setAttribute("role", "status");
  Object.assign(banner.style, {
    position: "fixed", top: "0", left: "0", right: "0", zIndex: "2147483647",
    background: "#f59e0b", color: "#111827", fontWeight: "800", textAlign: "center",
    padding: "6px 12px", fontSize: "13px", letterSpacing: ".04em", pointerEvents: "none",
  });
  document.body.appendChild(banner);
}

export function isTrainingMode() { return enabled; }

export function setTrainingMode(next: boolean) {
  enabled = next;
  syncBanner();
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("seza:training-mode-changed", { detail: { enabled } }));
}

export function useTrainingMode() {
  const [value, setValue] = useState(enabled);
  useEffect(() => {
    const listener = () => setValue(enabled);
    listeners.add(listener);
    syncBanner();
    return () => { listeners.delete(listener); };
  }, []);
  return value;
}
