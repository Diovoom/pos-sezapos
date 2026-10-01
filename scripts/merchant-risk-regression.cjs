// Execute the real sync driver against deterministic queue/transport boundaries.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const source =
  fs
    .readFileSync(path.join(__dirname, "../src/lib/offline/sync.ts"), "utf8")
    .replaceAll("import.meta.env.DEV", "false") + "\nexport { syncAction, syncCashMovement };";
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(existing, insertError = { code: "23505", message: "duplicate" }) {
  const updates = [],
    requests = [];
  let authCalls = 0;
  const supabase = {
    auth: {
      async getUser() {
        authCalls++;
        return { data: { user: null } };
      },
    },
    from(table) {
      const r = { table, operation: "", token: null, filters: [] };
      requests.push(r);
      return {
        insert(p) {
          r.operation = "insert";
          r.payload = p;
          return this;
        },
        upsert(p) {
          r.operation = "upsert";
          r.payload = p;
          if (existing) Object.assign(existing, p);
          return this;
        },
        update(p) {
          r.operation = "update";
          r.payload = p;
          return this;
        },
        select() {
          return this;
        },
        eq(k, v) {
          r.filters.push([k, v]);
          return this;
        },
        setHeader(k, v) {
          r.token = v;
          return this;
        },
        maybeSingle() {
          return this;
        },
        then(resolve) {
          return Promise.resolve(
            resolve({
              data: existing,
              error:
                r.operation === "insert" || (r.operation === "upsert" && !existing)
                  ? insertError
                  : null,
            }),
          );
        },
      };
    },
  };
  const db = {
    updateOfflineAction: async (id, p) => updates.push({ id, ...p }),
    updateOfflineCashMovement: async (id, p) => updates.push({ id, ...p }),
  };
  const mocks = {
    "@/integrations/supabase/client": { supabase },
    "./db": db,
    "./useOnline": { emitSync() {}, isOnlineNow: () => true },
    "@/lib/timeclock/client": {},
    "@/lib/email/send": {},
    "@/lib/sms/send": {},
  };
  const m = { exports: {} };
  new Function("require", "module", "exports", js)(
    (n) => {
      if (!(n in mocks)) throw Error(n);
      return mocks[n];
    },
    m,
    m.exports,
  );
  return { api: m.exports, requests, updates, authCalls: () => authCalls };
}
const opened = "2026-09-30T10:00:00.000Z";
const action = {
  id: "queue",
  kind: "register_open",
  store_id: "store-A",
  user_id: "employee-A",
  attempts: 0,
  local_created_at: opened,
  payload: { id: "register-A", opened_at: opened, opening_cash: 100 },
};
const register = () => ({
  id: "register-A",
  store_id: "store-A",
  opened_by: "employee-A",
  opened_at: opened,
  opening_cash: 100,
  status: "closed",
  closed_at: "2026-09-30T12:00:00Z",
});
const cash = {
  id: "cash-A",
  idempotency_key: "cash:cash-A",
  store_id: "store-A",
  user_id: "employee-A",
  register_session_id: "register-A",
  type: "deposit",
  amount: 5,
  reason: "Float",
  notes: null,
  attempts: 0,
};
const tests = [];
const test = (n, f) => tests.push([n, f]);
test("concurrent reconnects start one worker", async () => {
  const h = harness(null);
  await Promise.all([h.api.syncNow(), h.api.syncNow()]);
  assert.equal(h.authCalls(), 1);
});
test("lock releases after early return", async () => {
  const h = harness(null);
  await h.api.syncNow();
  await h.api.syncNow();
  assert.equal(h.authCalls(), 2);
});
test("open replay preserves closed shared register and original token", async () => {
  const row = register(),
    h = harness(row);
  await h.api.syncAction(action, "original");
  assert.equal(row.status, "closed");
  assert.equal(h.updates.at(-1).status, "synced");
  assert.ok(h.requests.every((r) => r.token === "Bearer original"));
});
test("different register uniqueness collision stays queued", async () => {
  const h = harness(null);
  await assert.rejects(h.api.syncAction(action, "original"));
  assert.equal(h.updates.at(-1).status, "needs_attention");
});
test("different employee register collision stays queued", async () => {
  const h = harness({ ...register(), opened_by: "employee-B" });
  await assert.rejects(h.api.syncAction(action, "original"));
  assert.equal(h.updates.at(-1).status, "needs_attention");
});
test("new register pins original identity", async () => {
  const h = harness(null, null);
  await h.api.syncAction(action, "original");
  assert.equal(h.requests[0].operation, "insert");
  assert.equal(h.requests[0].payload.opened_by, "employee-A");
  assert.equal(h.requests[0].token, "Bearer original");
});
test("invisible register close is not silently discarded", async () => {
  const h = harness(null);
  await assert.rejects(h.api.syncAction({ ...action, kind: "register_close" }, "original"));
  assert.equal(h.updates.at(-1).status, "needs_attention");
});
test("register close pins token and scopes store", async () => {
  const h = harness(register());
  await h.api.syncAction({ ...action, kind: "register_close" }, "original");
  assert.equal(h.requests[0].token, "Bearer original");
  assert.ok(h.requests[0].filters.some(([k, v]) => k === "store_id" && v === "store-A"));
});
test("identical cash retry succeeds", async () => {
  const h = harness({ ...cash, amount: "5.00" });
  await h.api.syncCashMovement(cash, "original");
  assert.equal(h.updates.at(-1).status, "synced");
  assert.ok(h.requests.every((r) => r.token === "Bearer original"));
});
test("cash collision with different amount stays queued", async () => {
  const h = harness({ ...cash, amount: 6 });
  await assert.rejects(h.api.syncCashMovement(cash, "original"));
  assert.equal(h.updates.at(-1).status, "needs_attention");
});
test("invisible cash collision stays queued", async () => {
  const h = harness(null);
  await assert.rejects(h.api.syncCashMovement(cash, "original"));
  assert.equal(h.updates.at(-1).status, "needs_attention");
});
test("temporary cash failure backs off", async () => {
  const h = harness(null, { code: "08006", message: "network" });
  await assert.rejects(h.api.syncCashMovement(cash, "original"));
  assert.equal(h.updates.at(-1).status, "failed");
  assert.ok(h.updates.at(-1).next_retry_at);
});
(async () => {
  let failed = 0;
  for (const [n, f] of tests) {
    try {
      await f();
      console.log("PASS", n);
    } catch (e) {
      failed++;
      console.error("FAIL", n, e.message);
    }
  }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
