import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  BackPriority,
  registerBackHandler,
  runBackHandlers,
  _resetForTests,
} from "./backButtonCoordinator.ts";

beforeEach(() => _resetForTests());

test("runs highest-priority handler first and stops on true", async () => {
  const calls: string[] = [];
  registerBackHandler(BackPriority.Screen, () => { calls.push("screen"); return false; });
  registerBackHandler(BackPriority.Overlay, () => { calls.push("overlay"); return true; });
  registerBackHandler(BackPriority.PaymentBusy, () => { calls.push("payment"); return true; });

  const handled = await runBackHandlers();
  assert.equal(handled, true);
  assert.deepEqual(calls, ["overlay"]);
});

test("falls through when no handler claims the press", async () => {
  registerBackHandler(BackPriority.Screen, () => false);
  assert.equal(await runBackHandlers(), false);
});

test("skips handlers that throw", async () => {
  registerBackHandler(BackPriority.Overlay, () => { throw new Error("boom"); });
  registerBackHandler(BackPriority.Screen, () => true);
  assert.equal(await runBackHandlers(), true);
});

test("unregister removes handler", async () => {
  const unregister = registerBackHandler(BackPriority.Overlay, () => true);
  unregister();
  assert.equal(await runBackHandlers(), false);
});

test("respects priority ordering", async () => {
  const calls: string[] = [];
  registerBackHandler(BackPriority.UnsavedWork, () => { calls.push("cart"); return false; });
  registerBackHandler(BackPriority.PaymentBusy, () => { calls.push("payment"); return true; });
  registerBackHandler(BackPriority.Screen, () => { calls.push("screen"); return false; });

  await runBackHandlers();
  assert.deepEqual(calls, ["payment"]);
});
