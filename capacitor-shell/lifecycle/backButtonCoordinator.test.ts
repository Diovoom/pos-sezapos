import { describe, it, expect, beforeEach } from "vitest";
import {
  BackPriority,
  registerBackHandler,
  runBackHandlers,
  _resetForTests,
} from "./backButtonCoordinator";

describe("backButtonCoordinator", () => {
  beforeEach(() => _resetForTests());

  it("runs highest-priority handler first and stops on true", async () => {
    const calls: string[] = [];
    registerBackHandler(BackPriority.Screen, () => { calls.push("screen"); return false; });
    registerBackHandler(BackPriority.Overlay, () => { calls.push("overlay"); return true; });
    registerBackHandler(BackPriority.PaymentBusy, () => { calls.push("payment"); return true; });

    const handled = await runBackHandlers();
    expect(handled).toBe(true);
    expect(calls).toEqual(["overlay"]);
  });

  it("falls through when no handler claims the press", async () => {
    registerBackHandler(BackPriority.Screen, () => false);
    const handled = await runBackHandlers();
    expect(handled).toBe(false);
  });

  it("skips handlers that throw", async () => {
    registerBackHandler(BackPriority.Overlay, () => { throw new Error("boom"); });
    registerBackHandler(BackPriority.Screen, () => true);
    const handled = await runBackHandlers();
    expect(handled).toBe(true);
  });

  it("unregister removes handler", async () => {
    const off = registerBackHandler(BackPriority.Overlay, () => true);
    off();
    const handled = await runBackHandlers();
    expect(handled).toBe(false);
  });

  it("respects priority ordering: PaymentBusy > UnsavedWork > Screen", async () => {
    const calls: string[] = [];
    registerBackHandler(BackPriority.UnsavedWork, () => { calls.push("cart"); return false; });
    registerBackHandler(BackPriority.PaymentBusy, () => { calls.push("payment"); return true; });
    registerBackHandler(BackPriority.Screen, () => { calls.push("screen"); return false; });

    await runBackHandlers();
    expect(calls).toEqual(["payment"]);
  });
});
