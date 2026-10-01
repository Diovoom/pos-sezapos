// Runs only in a new in-memory PostgreSQL database. Never connects to Supabase.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createDatabase } from "./fixtures/merchant-schema.mjs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const db = await createDatabase();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(11),
  B = id(12),
  owner = id(1),
  employee = id(2),
  other = id(3),
  P = id(21),
  R = id(31),
  foreignR = id(32);
let passed = 0;
const check = (name, value) => {
  assert.ok(value, name);
  passed++;
  console.log("PASS", name);
};
async function actor(user) {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user ?? ""}',false),set_config('request.jwt.claim.role','${user ? "authenticated" : "service_role"}',false); ${user ? "SET ROLE authenticated" : ""}`,
  );
}
async function denied(sql, params = []) {
  try {
    await db.query(sql, params);
    return false;
  } catch (e) {
    return ["42501", "23514", "23505", "40001"].includes(e.code);
  }
}
const sale = (n, ref) => ({
  id: id(n),
  idempotency_key: id(n),
  store_id: A,
  subtotal: 10,
  tax: 0,
  discount: 0,
  total: 10,
  payment_method: "card",
  terminal_ref: ref,
  status: "completed",
});
const items = [
  { product_id: P, product_name: "Fixture", quantity: 1, unit_price: 10, line_total: 10 },
];
const payments = (ref) => [
  { method: "card", amount: 10, provider: null, provider_reference: ref, status: "completed" },
];
try {
  await db.exec(
    fs.readFileSync(
      `${root}/supabase/migrations/20260930033719_production_audit_security_integrity.sql`,
      "utf8",
    ),
  );
  await actor(null);
  await db.exec(`INSERT INTO stores(id,name) VALUES('${A}','Fixture A'),('${B}','Fixture B');`);
  for (const [user, store] of [
    [owner, A],
    [employee, A],
    [other, B],
  ]) {
    await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,'{}')", [
      user,
      `${user}@example.invalid`,
    ]);
    await db.query("UPDATE profiles SET store_id=$2,status='active' WHERE id=$1", [user, store]);
    await db.query("DELETE FROM user_roles WHERE user_id=$1", [user]);
    await db.query("INSERT INTO user_roles(user_id,store_id,role) VALUES($1,$2,$3)", [
      user,
      store,
      user === employee ? "cashier" : "owner",
    ]);
  }
  await db.query("INSERT INTO role_permissions(store_id,role,permission) VALUES($1,'cashier','sales.create') ON CONFLICT DO NOTHING", [A]);
  await db.query(
    "INSERT INTO products(id,store_id,name,price,stock,track_inventory) VALUES($1,$2,'Fixture',10,100,true)",
    [P, A],
  );
  await db.query(
    "INSERT INTO register_sessions(id,store_id,opened_by,status,closed_at) VALUES($1,$2,$3,'closed',now()),($4,$5,$6,'open',null)",
    [R, A, owner, foreignR, B, other],
  );
  await actor(employee);
  await db.exec("BEGIN");
  await db.query(
    "INSERT INTO cash_movements(store_id,user_id,register_session_id,type,amount,reason) VALUES($1,$2,$3,'deposit',1,'fixture')",
    [A, other, foreignR],
  );
  check("Reproduced baseline cash spoof and foreign register acceptance", true);
  await db.query("SELECT finalize_pos_sale($1,$2,$3)", [
    sale(101, "pi_fixture"),
    items,
    payments("pi_fixture"),
  ]);
  await db.query("SELECT finalize_pos_sale($1,$2,$3)", [
    sale(102, "pi_fixture"),
    items,
    payments("pi_fixture"),
  ]);
  check(
    "Reproduced one PI funding two different sale IDs",
    (await db.query("SELECT count(*)::int n FROM sales WHERE terminal_ref='pi_fixture'")).rows[0]
      .n === 2,
  );
  await actor(null);
  try {
    await db.exec(
      fs.readFileSync(
        `${root}/supabase/migrations/20261001033349_android_payment_recovery_guards.sql`,
        "utf8",
      ),
    );
    assert.fail("Migration accepted duplicate funding");
  } catch (e) {
    check(
      "Migration refuses preexisting duplicate funding instead of repairing money",
      e.message.includes("already fund different sales"),
    );
  }
  await db.exec("ROLLBACK");
  await actor(null);
  await db.exec(
    fs.readFileSync(
      `${root}/supabase/migrations/20261001033349_android_payment_recovery_guards.sql`,
      "utf8",
    ),
  );
  await actor(employee);
  const cashSql =
    "INSERT INTO cash_movements(store_id,user_id,register_session_id,type,amount,reason) VALUES($1,$2,$3,$4,1,'fixture')";
  check("Spoofed cash actor denied", await denied(cashSql, [A, owner, R, "deposit"]));
  check("Foreign register denied", await denied(cashSql, [A, employee, foreignR, "deposit"]));
  check("Foreign store denied", await denied(cashSql, [B, employee, foreignR, "deposit"]));
  for (const type of ["deposit", "payout", "safe_drop"]) {
    await db.query(cashSql, [A, employee, R, type]);
    check(`${type} allowed for different opener and closed session`, true);
  }
  const first = (
    await db.query("SELECT finalize_pos_sale($1,$2,$3) result", [
      sale(103, "pi_fixed"),
      items,
      payments("pi_fixed"),
    ])
  ).rows[0].result;
  const retry = (
    await db.query("SELECT finalize_pos_sale($1,$2,$3) result", [
      sale(104, "pi_fixed"),
      items,
      payments("pi_fixed"),
    ])
  ).rows[0].result;
  check(
    "Identical new-ID retry recovers original sale",
    retry.id === first.id && retry.already_existed,
  );
  check(
    "Retry decrements inventory once",
    Number((await db.query("SELECT stock FROM products WHERE id=$1", [P])).rows[0].stock) === 99,
  );
  check(
    "Changed payload using original PI rejected",
    await denied("SELECT finalize_pos_sale($1,$2,$3)", [
      sale(105, "pi_fixed"),
      [{ ...items[0], product_name: "changed" }],
      payments("pi_fixed"),
    ]),
  );
  check(
    "Header-only reference reuse rejected",
    await denied(
      "INSERT INTO sales(id,store_id,cashier_id,subtotal,total,terminal_ref) VALUES($1,$2,$3,10,10,'pi_fixed')",
      [id(106), A, employee],
    ),
  );
  await db.query(
    "INSERT INTO sales(id,store_id,cashier_id,subtotal,total) VALUES($1,$2,$3,10,10)",
    [id(107), A, employee],
  );
  check(
    "Ledger-only reuse rejected",
    await denied(
      "INSERT INTO sale_payments(sale_id,store_id,method,amount,provider_reference) VALUES($1,$2,'card',10,'pi_fixed')",
      [id(107), A],
    ),
  );
  check(
    "Same-sale duplicate payment row rejected",
    await denied(
      "INSERT INTO sale_payments(sale_id,store_id,method,amount,provider_reference) VALUES($1,$2,'card',10,'pi_fixed')",
      [id(103), A],
    ),
  );
  check(
    "PI disguised as cash cannot bypass uniqueness",
    await denied(
      "INSERT INTO sale_payments(sale_id,store_id,method,amount,provider_reference) VALUES($1,$2,'cash',10,'pi_fixed')",
      [id(107), A],
    ),
  );
  check(
    "Whitespace and provider alias cannot bypass PI uniqueness",
    await denied(
      "INSERT INTO sale_payments(sale_id,store_id,method,amount,provider,provider_reference) VALUES($1,$2,'card',10,'other',' pi_fixed ')",
      [id(107), A],
    ),
  );
  await actor(owner);
  check(
    "Another employee cannot claim original sale on retry",
    await denied("SELECT finalize_pos_sale($1,$2,$3)", [
      sale(112, "pi_fixed"),
      items,
      payments("pi_fixed"),
    ]),
  );
  await actor(employee);
  await actor(other);
  check(
    "Cross-merchant PI reuse rejected",
    await denied("SELECT finalize_pos_sale($1,$2,$3)", [
      { ...sale(108, "pi_fixed"), store_id: B },
      items,
      payments("pi_fixed"),
    ]),
  );
  await actor(employee);
  const split = { ...sale(109, "pi_split"), payment_method: "split" };
  await db.query("SELECT finalize_pos_sale($1,$2,$3)", [
    split,
    items,
    [
      { method: "cash", amount: 4 },
      { method: "card", amount: 6, provider_reference: "pi_split" },
    ],
  ]);
  check("Valid split tender succeeds", true);
  await db.query("SELECT finalize_pos_sale($1,$2,$3)", [
    { ...sale(113, "pi_splitA"), payment_method: "split" },
    items,
    [
      { method: "card", amount: 4, provider_reference: "pi_splitA" },
      { method: "card", amount: 6, provider_reference: "pi_splitB" },
    ],
  ]);
  check("Two distinct card allocations remain valid", true);
  const stockBeforeDuplicate = Number(
    (await db.query("SELECT stock FROM products WHERE id=$1", [P])).rows[0].stock,
  );
  check(
    "Same PI cannot be counted twice within split tender",
    await denied("SELECT finalize_pos_sale($1,$2,$3)", [
      { ...sale(114, "pi_twice"), payment_method: "split" },
      items,
      [
        { method: "card", amount: 4, provider_reference: "pi_twice" },
        { method: "card", amount: 6, provider_reference: "pi_twice" },
      ],
    ]),
  );
  check(
    "Rejected split leaves no sale or inventory side effect",
    Number((await db.query("SELECT stock FROM products WHERE id=$1", [P])).rows[0].stock) ===
      stockBeforeDuplicate &&
      (await db.query("SELECT count(*)::int n FROM sales WHERE id=$1", [id(114)])).rows[0].n === 0,
  );
  await db.query("SELECT finalize_pos_sale($1,$2,$3)", [
    { ...sale(110, null), payment_method: "cash" },
    items,
    [{ method: "cash", amount: 10 }],
  ]);
  await db.query("SELECT finalize_pos_sale($1,$2,$3)", [
    { ...sale(111, null), payment_method: "cash" },
    items,
    [{ method: "cash", amount: 10 }],
  ]);
  check("Independent cash sales remain valid", true);
  check(
    "Authenticated cannot call privileged recovery",
    await denied("SELECT finalize_terminal_checkout($1,$2)", [id(120), "pi_recovery"]),
  );
  const request = {
    actor_id: employee,
    sale: {
      ...sale(120, null),
      cash_base_total: 10,
      card_price_adjustment: 0,
      final_amount_charged: 10,
      register_session_id: R,
    },
    items,
    payments: payments(null),
  };
  await actor(null);
  const prepare = () =>
    db.query("SELECT prepare_terminal_checkout($1,$2,$3,$4,$5,$6,$7) result", [
      employee,
      A,
      "acct_fixture",
      "sandbox",
      request,
      1000,
      "usd",
    ]);
  await prepare();
  await prepare();
  check(
    "Durable preparation retry preserves one original checkout",
    (await db.query("SELECT count(*)::int n FROM pos_terminal_checkouts")).rows[0].n === 1,
  );
  check(
    "Another checkout blocked while original unresolved",
    await denied("SELECT prepare_terminal_checkout($1,$2,$3,$4,$5,$6,$7)", [
      employee,
      A,
      "acct_fixture",
      "sandbox",
      { ...request, sale: { ...request.sale, id: id(121), idempotency_key: id(121) } },
      1000,
      "usd",
    ]),
  );
  await db.query("UPDATE pos_terminal_checkouts SET payment_intent_id='pi_recovery' WHERE id=$1", [
    id(120),
  ]);
  const before = Number(
    (await db.query("SELECT stock FROM products WHERE id=$1", [P])).rows[0].stock,
  );
  await db.query("UPDATE products SET stock=0 WHERE id=$1", [P]);
  check(
    "Failed persistence leaves checkout recoverable",
    await denied("SELECT finalize_terminal_checkout($1,$2)", [id(120), "pi_recovery"]),
  );
  check(
    "Failed persistence created no partial sale",
    (await db.query("SELECT count(*)::int n FROM sales WHERE id=$1", [id(120)])).rows[0].n === 0,
  );
  await db.query("UPDATE products SET stock=$2 WHERE id=$1", [P, before]);
  const recovered = (
    await db.query("SELECT finalize_terminal_checkout($1,$2) result", [id(120), "pi_recovery"])
  ).rows[0].result;
  const again = (
    await db.query("SELECT finalize_terminal_checkout($1,$2) result", [id(120), "pi_recovery"])
  ).rows[0].result;
  check("Recovery after failed commit returns one sale", recovered.id === again.id);
  check(
    "Recovery decrements inventory once",
    Number((await db.query("SELECT stock FROM products WHERE id=$1", [P])).rows[0].stock) ===
      before - 1,
  );
  check(
    "Recovery preserves original employee",
    (await db.query("SELECT cashier_id FROM sales WHERE id=$1", [id(120)])).rows[0].cashier_id ===
      employee,
  );
  await actor(other);
  check(
    "Other employee cannot read checkout snapshots",
    await denied("SELECT * FROM pos_terminal_checkouts"),
  );
  await actor(null);
  await db.query("UPDATE profiles SET status='inactive' WHERE id=$1", [employee]);
  await actor(employee);
  check("Inactive employee cash denied", await denied(cashSql, [A, employee, R, "deposit"]));
  console.log(`${passed} database checks passed`);
} catch (e) {
  console.error(e.message, e.code, e.query);
  process.exitCode = 1;
} finally {
  await db.close();
}
