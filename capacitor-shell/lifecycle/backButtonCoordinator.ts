// Priority-based Android back-button coordinator.
//
// Screens/dialogs register a handler with a priority. On each back press the
// highest-priority handler runs first; if it returns `true` (or a Promise
// resolving to true) the press is considered handled and no further handler
// runs. If no handler claims the press, the shell fallback runs (router
// back / exit-confirmation / app exit).
//
// The coordinator is intentionally framework-agnostic so it can be tested
// with pure decision-order unit tests.

export type BackHandler = () => boolean | Promise<boolean>;

export const BackPriority = {
  /** Top-most modal / dialog / drawer / scanner. Always closes first. */
  Overlay: 100,
  /** Manager approval / PIN dialog busy verifying. */
  ManagerBusy: 90,
  /** Payment currently being processed by processor/terminal. */
  PaymentBusy: 80,
  /** Active cart or unsaved-form confirmation. */
  UnsavedWork: 60,
  /** Custom per-screen behavior (nested route back, etc.). */
  Screen: 40,
} as const;

type Entry = { id: number; priority: number; handler: BackHandler };

let nextId = 1;
const entries: Entry[] = [];

export function registerBackHandler(priority: number, handler: BackHandler): () => void {
  const id = nextId++;
  entries.push({ id, priority, handler });
  entries.sort((a, b) => b.priority - a.priority || b.id - a.id);
  return () => {
    const i = entries.findIndex((e) => e.id === id);
    if (i >= 0) entries.splice(i, 1);
  };
}

/**
 * Runs handlers in priority order. Returns true when a handler consumed the
 * press. Guards against a handler that throws — it counts as unhandled.
 */
export async function runBackHandlers(): Promise<boolean> {
  // Copy to avoid mutation-during-iteration when a handler unregisters itself.
  const snapshot = entries.slice();
  for (const entry of snapshot) {
    try {
      const result = await entry.handler();
      if (result) return true;
    } catch (err) {
      console.warn("[back] handler threw", err);
    }
  }
  return false;
}

export function _resetForTests() {
  entries.length = 0;
  nextId = 1;
}
