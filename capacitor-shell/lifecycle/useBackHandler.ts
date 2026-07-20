import { useEffect } from "react";
import { registerBackHandler, type BackHandler } from "./backButtonCoordinator";

/**
 * React hook: register an Android back-button handler for the lifetime of
 * this component. Handler receives no args and returns true when the press
 * has been consumed. Unregisters automatically on unmount / handler change.
 */
export function useBackHandler(priority: number, handler: BackHandler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const off = registerBackHandler(priority, handler);
    return off;
  }, [enabled, priority, handler]);
}
