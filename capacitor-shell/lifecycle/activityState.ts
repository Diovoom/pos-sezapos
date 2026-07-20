// Central Android-shell activity + lifecycle state.
//
// One module tracks the flags the back-button coordinator, resume gate, and
// exit-confirmation UI need. Kept as a plain module (not React state) so it
// can be read from Capacitor listener callbacks without stale closures.
import { NATIVE_ACTIVITY_EVENT, type NativeActivityFlags } from "@/lib/native-activity";

type State = {
  hasCart: boolean;
  paymentBusy: boolean;
  /** Timestamp (ms) at which the app most recently backgrounded, or null. */
  backgroundedAt: number | null;
  /** Last time the user pressed back on the register (for double-press exit). */
  lastBackAt: number | null;
};

const state: State = {
  hasCart: false,
  paymentBusy: false,
  backgroundedAt: null,
  lastBackAt: null,
};

export const getActivityState = (): Readonly<State> => state;

export function setBackgroundedAt(ts: number | null) { state.backgroundedAt = ts; }
export function markBackPress(ts: number) { state.lastBackAt = ts; }

let wired = false;
export function wireNativeActivityListener() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener(NATIVE_ACTIVITY_EVENT, (e: Event) => {
    const flags = (e as CustomEvent<NativeActivityFlags>).detail;
    if (!flags) return;
    state.hasCart = !!flags.hasCart;
    state.paymentBusy = !!flags.paymentBusy;
  });
}
