// Android-shell activity signal (safe no-op on web).
//
// The bundled Android shell needs to know when the POS has an active cart or
// a payment in progress so the hardware back button, app-backgrounding, and
// session-resume flows can protect the transaction. The web POS uses local
// component state for the cart, so this module gives the shell a tiny,
// dependency-free signal: on every change, dispatch a window CustomEvent
// carrying the current flags. The Android shell subscribes to that event;
// on the web nobody listens and it costs one addEventListener no-op.
//
// This file MUST remain browser-safe (no Capacitor imports) — it is
// imported from web POS routes as well as the shell.
import { useEffect, useRef } from "react";

export const NATIVE_ACTIVITY_EVENT = "seza:native-activity";

export type NativeActivityFlags = {
  /** Cart has at least one line the user could lose. */
  hasCart: boolean;
  /** A payment / sale is being submitted or a terminal charge is running. */
  paymentBusy: boolean;
};

// Latest broadcast flags — consumed by anything that needs to check
// "is a payment in flight right now?" without listening to the event
// stream (e.g. the Clock Out gate on the Time Clock screen).
let _lastFlags: NativeActivityFlags = { hasCart: false, paymentBusy: false };

export function emitNativeActivity(flags: NativeActivityFlags) {
  _lastFlags = flags;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NATIVE_ACTIVITY_EVENT, { detail: flags }));
}

export function getNativeActivityFlags(): Readonly<NativeActivityFlags> {
  return _lastFlags;
}

/**
 * Broadcasts current cart / payment activity to the Android shell.
 * No-op on the web (no shell listener present) — safe to call unconditionally.
 */
export function useNativeActivitySignal(flags: NativeActivityFlags) {
  const last = useRef<NativeActivityFlags | null>(null);
  useEffect(() => {
    const prev = last.current;
    if (prev && prev.hasCart === flags.hasCart && prev.paymentBusy === flags.paymentBusy) return;
    last.current = flags;
    emitNativeActivity(flags);
  }, [flags.hasCart, flags.paymentBusy]);

  // Clear on unmount so the shell doesn't retain a stale "has cart" flag
  // across route changes.
  useEffect(() => {
    return () => emitNativeActivity({ hasCart: false, paymentBusy: false });
  }, []);
}
