// No network, Stripe mutations or production database access.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const root = path.join(__dirname, "..");
function load(file, mocks = {}, extra = "") {
  const source =
    fs.readFileSync(path.join(root, file), "utf8").replaceAll("import.meta.env.DEV", "false") +
    extra;
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(
    (key) => {
      if (!(key in mocks)) throw Error(`Unexpected dependency: ${key}`);
      return mocks[key];
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const validation = load("src/lib/pos/terminal-checkout.ts");
const checkout = {
  id: "00000000-0000-4000-8000-000000000001",
  store_id: "store-A",
  cashier_id: "employee-A",
  stripe_account_id: "acct_A",
  environment: "sandbox",
  amount_cents: 1000,
  currency: "usd",
  payment_intent_id: "pi_original",
};
const approved = {
  id: "pi_original",
  amount: 1000,
  amount_received: 1000,
  currency: "usd",
  livemode: false,
  status: "succeeded",
  metadata: {
    seza_checkout_id: checkout.id,
    seza_store_id: "store-A",
    seza_cashier_id: "employee-A",
  },
};
let intent = approved,
  rpcCalls = 0,
  retrieves = 0,
  failDatabase = false,
  financialCalls = 0;
const stripe = {
  paymentIntents: {
    retrieve: async (id, params, options) => {
      retrieves++;
      assert.equal(id, "pi_original");
      assert.equal(options.stripeAccount, "acct_A");
      return intent;
    },
    create() {
      financialCalls++;
      throw Error("Recovery attempted charge creation");
    },
    confirm() {
      financialCalls++;
      throw Error("Recovery attempted confirmation");
    },
  },
};
const admin = {
  rpc: async (name, params) => {
    rpcCalls++;
    assert.equal(name, "finalize_terminal_checkout");
    assert.equal(params.p_checkout, checkout.id);
    assert.equal(params.p_reference, "pi_original");
    return failDatabase
      ? { error: { code: "08006" } }
      : { data: { id: checkout.id, receipt_number: 1 } };
  },
};
const service = load("src/lib/pos/terminal-checkout.server.ts", {
  "@/integrations/supabase/client.server": { supabaseAdmin: admin },
  "@/lib/stripe-terminal.server": { createTerminalStripeClient: () => stripe },
  "./terminal-checkout": validation,
});
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
test("approved payment recovers the original sale without charging", async () => {
  const result = await service.recoverTerminalCheckout(checkout);
  assert.equal(result.sale.id, checkout.id);
  assert.equal(financialCalls, 0);
});
test("lost persistence response can retry recovery without charging", async () => {
  failDatabase = true;
  await assert.rejects(service.recoverTerminalCheckout(checkout), /Do not charge again/);
  failDatabase = false;
  assert.equal((await service.recoverTerminalCheckout(checkout)).sale.id, checkout.id);
  assert.equal(financialCalls, 0);
});
test("already-saved checkout needs no Stripe request", async () => {
  const before = retrieves;
  await service.recoverTerminalCheckout({ ...checkout, sale_result: { id: checkout.id } });
  assert.equal(retrieves, before);
});
test("unmapped interrupted preparation never creates a PI", async () => {
  assert.equal(
    (await service.recoverTerminalCheckout({ ...checkout, payment_intent_id: null })).status,
    "unprepared",
  );
  assert.equal(financialCalls, 0);
});
test("processing and uncaptured authorization do not finalize", async () => {
  const before = rpcCalls;
  for (const status of ["processing", "requires_capture", "requires_payment_method", "canceled"]) {
    intent = { ...approved, status };
    await service.recoverTerminalCheckout(checkout);
  }
  assert.equal(rpcCalls, before);
  intent = approved;
});
for (const [name, patch] of [
  ["amount", { amount: 999 }],
  ["received amount", { amount_received: 999 }],
  ["currency", { currency: "eur" }],
  ["environment", { livemode: true }],
  ["store", { metadata: { ...approved.metadata, seza_store_id: "store-B" } }],
  ["employee", { metadata: { ...approved.metadata, seza_cashier_id: "employee-B" } }],
  ["checkout", { metadata: { ...approved.metadata, seza_checkout_id: "other" } }],
]) {
  test(`mismatched ${name} rejected before database finalization`, async () => {
    const before = rpcCalls;
    intent = { ...approved, ...patch };
    await assert.rejects(service.recoverTerminalCheckout(checkout));
    assert.equal(rpcCalls, before);
    intent = approved;
  });
}
test("connected-account mismatch rejected", () =>
  assert.throws(() => service.verifyCheckoutIntent(checkout, approved, "acct_B")));
test("historical unmapped webhook does not invent a sale", async () => {
  const before = rpcCalls;
  await service.recoverTerminalWebhook({ data: { object: { metadata: {} } } });
  assert.equal(rpcCalls, before);
});
test("catalog FK rejection retains queue and draft for attention", async () => {
  const updates = [];
  let removed = 0;
  const query = {
    delete() {
      return this;
    },
    eq() {
      return this;
    },
    then(resolve) {
      resolve({ error: { code: "23503", message: "Product is referenced" } });
    },
  };
  const sync = load(
    "src/lib/offline/sync.ts",
    {
      "@/integrations/supabase/client": { supabase: { from: () => query } },
      "./db": { updateOfflineAction: async (id, p) => updates.push(p) },
      "./useOnline": {},
      "@/lib/timeclock/client": {},
      "@/lib/email/send": {},
      "@/lib/sms/send": {},
      "@/lib/inventory-drafts": {
        loadInventoryDrafts: () => [{ productId: "p", id: "draft" }],
        removeInventoryDraft: () => removed++,
      },
    },
    "\nexport {syncAction};",
  );
  await assert.rejects(
    sync.syncAction(
      {
        id: "queue",
        kind: "catalog_mutation",
        attempts: 0,
        store_id: "store-A",
        user_id: "employee-A",
        payload: { operation: "delete", productId: "p", draftId: "draft" },
      },
      "original",
    ),
  );
  assert.equal(updates.at(-1).status, "needs_attention");
  assert.equal(updates.at(-1).next_retry_at, null);
  assert.equal(removed, 0);
});
test("valid frozen split and cash allocations pass validation", () => {
  const value = {
    actor_id: "employee-A",
    sale: {
      id: checkout.id,
      idempotency_key: checkout.id,
      store_id: "store-A",
      subtotal: 15,
      tax: 0,
      discount: 0,
      total: 15,
      cash_base_total: 15,
      card_price_adjustment: 0,
      final_amount_charged: 15,
      payment_method: "split",
      amount_tendered: 15,
      change_due: 0,
      status: "completed",
    },
    items: [
      { product_id: null, product_name: "Custom", quantity: 1, unit_price: 15, line_total: 15 },
    ],
    payments: [
      { method: "cash", amount: 5 },
      { method: "card", amount: 10 },
    ],
  };
  validation.validateTerminalCheckout(value, "employee-A", "store-A", 1000);
  assert.throws(() => validation.validateTerminalCheckout(value, "employee-B", "store-A", 1000));
  assert.throws(() =>
    validation.validateTerminalCheckout(
      { ...value, payments: [...value.payments, { method: "card", amount: 10 }] },
      "employee-A",
      "store-A",
      1000,
    ),
  );
});
function queryHarness(rows, updated = { id: checkout.id }) {
  const queries = [];
  admin.from = () => {
    const q = { filters: [], update: false };
    queries.push(q);
    return {
      select() {
        return this;
      },
      eq(k, v) {
        q.filters.push([k, v]);
        return this;
      },
      is(k, v) {
        q.filters.push([k, v]);
        return this;
      },
      or(v) {
        q.or = v;
        return this;
      },
      update() {
        q.update = true;
        return this;
      },
      maybeSingle() {
        return this;
      },
      then(resolve) {
        resolve({ data: q.update ? updated : rows, error: null });
      },
    };
  };
  return queries;
}
test("discard races binding with a conditional unbound-row update", async () => {
  const queries = queryHarness([{ ...checkout, payment_intent_id: null }]);
  const before = retrieves;
  const result = await service.checkoutAction(
    { storeId: checkout.store_id, userId: checkout.cashier_id },
    "abandon",
    checkout.id,
  );
  assert.equal(result.checkouts[0].status, "canceled");
  assert.equal(retrieves, before);
  assert.ok(queries[1].filters.some(([k, v]) => k === "payment_intent_id" && v === null));
  assert.ok(queries[1].filters.some(([k, v]) => k === "acknowledged" && v === false));
});
test("if payment binding wins, discard cannot acknowledge it", async () => {
  queryHarness([{ ...checkout, payment_intent_id: null }], null);
  await assert.rejects(
    service.checkoutAction(
      { storeId: checkout.store_id, userId: checkout.cashier_id },
      "abandon",
      checkout.id,
    ),
    /changed/,
  );
});
test("binding cannot release a secret for a discarded checkout", async () => {
  const queries = queryHarness([], null);
  await assert.rejects(
    service.bindCheckoutIntent({ ...checkout, payment_intent_id: null }, approved, "acct_A"),
    /conflict/,
  );
  assert.ok(queries[0].filters.some(([k, v]) => k === "acknowledged" && v === false));
});
test("recovery lookup is pinned to both original employee and store", async () => {
  const queries = queryHarness([checkout]);
  intent = approved;
  await service.checkoutAction(
    { storeId: checkout.store_id, userId: checkout.cashier_id },
    "recover",
    checkout.id,
  );
  assert.ok(queries[0].filters.some(([k, v]) => k === "cashier_id" && v === checkout.cashier_id));
  assert.ok(queries[0].filters.some(([k, v]) => k === "store_id" && v === checkout.store_id));
});
test("approved payments cannot be abandoned", async () => {
  const queries = queryHarness([checkout]);
  intent = approved;
  await assert.rejects(
    service.checkoutAction(
      { storeId: checkout.store_id, userId: checkout.cashier_id },
      "abandon",
      checkout.id,
    ),
    /recover it/,
  );
  assert.ok(queries.every((q) => !q.update));
  assert.equal(financialCalls, 0);
});
test("database recovery failure cannot turn Stripe success into failure status", async () => {
  queryHarness([]);
  intent = approved;
  const route = load("src/routes/api/public/pos/stripe-terminal/payment-result.ts", {
    "@tanstack/react-router": { createFileRoute: () => (x) => x },
    "@/lib/errors/user-facing": { userFacingError: (_, s) => s },
    "@/lib/security/api-security.server": { guardApiRequest: async () => null },
    "@/lib/stripe-terminal.server": {
      resolveStripeTerminalMerchant: async () => ({
        storeId: "store-A",
        userId: "employee-A",
        stripeAccountId: "acct_A",
        environment: "sandbox",
      }),
      createTerminalStripeClient: () => stripe,
    },
    "@/integrations/supabase/client.server": { supabaseAdmin: admin },
    "@/lib/pos/terminal-checkout.server": {
      checkoutAction: async () => {
        throw Error("Database unavailable");
      },
    },
  });
  const response = await route.Route.server.handlers.POST({
    request: new Request("https://example.invalid", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ reference: "pi_original" }),
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "succeeded");
  assert.equal(body.recovery_pending, true);
});
test("double-clicking split tender launches one provider operation", async () => {
  const source = fs.readFileSync(path.join(root, "src/components/pos/PaymentDialog.tsx"), "utf8");
  const ast = ts.createSourceFile(
    "PaymentDialog.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let fn;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === "chargeRemaining")
      fn = n.initializer;
    ts.forEachChild(n, visit);
  }
  visit(ast);
  const code = ts.transpileModule(`module.exports=${fn.getText(ast)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let charges = 0;
  const mocks = {
    cardCharge: 10,
    provider: {
      id: "stripe-terminal",
      charge: async () => {
        charges++;
        return { finalStatus: "approved" };
      },
    },
    charging: false,
    splitStartingRef: { current: false },
    isOnlineNow: () => true,
    setEvent() {},
    abortRef: {},
    setCharging() {},
    setResult() {},
    checkoutRef: { current: null },
    prepareTerminalPayment: async () => ({ sale: { id: checkout.id } }),
    finalAmount: 15,
    total: 15,
    cash: 5,
    roundMoney: (x) => x,
    cardQuote: { estimatedProcessingFee: 1, estimatedMerchantNet: 9 },
    splitAttemptRef: { current: checkout.id },
    currency: "usd",
    userFacingError: (e) => e.message,
  };
  const m = { exports: {} };
  new Function(...Object.keys(mocks), "module", code)(...Object.values(mocks), m);
  await Promise.all([m.exports(), m.exports()]);
  assert.equal(charges, 1);
  assert.equal(mocks.splitStartingRef.current, false);
});
for (const mode of ["binding-fails", "mapped-retry"]) {
  test(`payment-intent endpoint ${mode} cannot create a replacement charge`,async()=>{
    let creates=0,reads=0;
    const saved={...checkout,created_at:"2020-01-01T00:00:00Z",payment_intent_id:mode==="mapped-retry"?"pi_original":null};
    if(mode==="binding-fails")saved.created_at=new Date().toISOString();
    const responseIntent={...approved,client_secret:"test_only_secret"};
    const route=load('src/routes/api/public/pos/stripe-terminal/payment-intent.ts',{
      '@tanstack/react-router':{createFileRoute:()=>x=>x},
      '@/lib/security/api-security.server':{guardApiRequest:async()=>null},
      '@/lib/stripe-terminal.server':{resolveStripeTerminalMerchant:async()=>({storeId:'store-A',userId:'employee-A',stripeAccountId:'acct_A',environment:'sandbox'}),
        createTerminalStripeClient:()=>({paymentIntents:{create:async(_,options)=>{creates++;assert.equal(options.idempotencyKey,`seza-checkout-${checkout.id}`);return responseIntent},retrieve:async()=>{reads++;return responseIntent}}})},
      '@/integrations/supabase/client.server':{supabaseAdmin:{from:()=>({insert:async()=>({error:null})})}},
      '@/lib/pos/terminal-checkout.server':{prepareTerminalCheckout:async()=>saved,bindCheckoutIntent:async()=>{if(mode==='binding-fails')throw Error('Database unavailable')}},
    });
    const originalTimer=global.setTimeout;
    global.setTimeout=(...args)=>{const timer=originalTimer(...args);timer.unref?.();return timer};
    try {
      const response=await route.Route.server.handlers.POST({request:new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount:1000,currency:'usd',checkout:{sale:{id:checkout.id}}})})});
      const body=await response.json();
      if(mode==='binding-fails'){assert.equal(response.status,400);assert.equal(body.client_secret,undefined);assert.equal(creates,1)}
      else {assert.equal(response.status,200);assert.equal(body.id,'pi_original');assert.equal(creates,0);assert.equal(reads,1)}
    } finally {global.setTimeout=originalTimer;}
  });
}
(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("PASS", name);
    } catch (e) {
      failed++;
      console.error("FAIL", name, e.message);
    }
  }
  console.log(`${tests.length - failed}/${tests.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
})();
