// Disposable in-memory PostgreSQL only. Never connects to a merchant database.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createDatabase } from './fixtures/merchant-schema.mjs';
const db = await createDatabase();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1),B=id(2),owner=id(3),P=id(4),S=id(5);
let passed=0;
const check=(name,condition)=>{assert.ok(condition,name);passed++;console.log('PASS',name);};
const denied=async(sql,args=[])=>{try{await db.query(sql,args);return false;}catch{return true;}};
try {
  for(const file of ['20260930033719_production_audit_security_integrity.sql','20260930041624_atomic_refund_consistency.sql','20260930055829_refund_completion_guards.sql']) {
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false)");
  await db.query('INSERT INTO stores(id,name) VALUES($1,\'Fixture A\'),($2,\'Fixture B\')',[A,B]);
  await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'audit@example.invalid','{}')",[owner]);
  await db.query("UPDATE profiles SET store_id=$1,status='active' WHERE id=$2",[A,owner]);
  await db.query("INSERT INTO user_roles(user_id,store_id,role) VALUES($1,$2,'owner')",[owner,A]);
  await db.query("INSERT INTO device_pairing_codes(code_hash,store_id,label,expires_at,created_by) VALUES('fixture-code',$1,'Fixture POS',now()+interval '15 minutes',$2)",[A,owner]);
  const paired=(await db.query("SELECT * FROM consume_pos_pairing_code('fixture-code','fixture-secret-hash','POS','android')")).rows[0];
  check('atomic pairing binds the intended store',paired.store_id===A);
  check('consumed code cannot register a second device',await denied("SELECT * FROM consume_pos_pairing_code('fixture-code','other-secret','POS','android')"));
  check('single-use pairing leaves exactly one device',(await db.query('SELECT count(*)::int n FROM device_registrations')).rows[0].n===1);
  check('unknown code rejected',await denied("SELECT * FROM consume_pos_pairing_code('missing','hash','POS','android')"));
  await db.query("INSERT INTO products(id,store_id,name,price,stock,track_inventory) VALUES($1,$2,'Fixture product',10,20,true)",[P,A]);
  await db.query("INSERT INTO sales(id,store_id,cashier_id,subtotal,discount,tax,total,cash_base_total,final_amount_charged,payment_method,status) VALUES($1,$2,$3,20,2,1.8,19.8,19.8,19.8,'cash','completed')",[S,A,owner]);
  const item=(await db.query("INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,line_total) VALUES($1,$2,'Fixture product',2,10,20) RETURNING id",[S,P])).rows[0].id;
  const request={store_id:A,sale_id:S,cashier_id:owner,idempotency_key:'refund-fixture',refund_type:'partial',reason:'other',restock:true};
  const selected=[{sale_item_id:item,quantity:1}];
  const prepare=async(r=request,items=selected)=>(await db.query('SELECT prepare_pos_refund($1,$2) result',[r,items])).rows[0].result;
  const prepared=await prepare();
  check('partial refund prorates sale discount and tax',Number(prepared.refund.total)===9.9);
  check('retry keeps original refund',(await prepare()).refund.id===prepared.refund.id);
  const before=Number((await db.query('SELECT stock FROM products WHERE id=$1',[P])).rows[0].stock);
  check('pending refund has not restocked inventory',before===18);
  await db.query('SELECT complete_pos_refund($1)',[prepared.refund.id]);
  await db.query('SELECT complete_pos_refund($1)',[prepared.refund.id]);
  check('completion retry restocks exactly once',Number((await db.query('SELECT stock FROM products WHERE id=$1',[P])).rows[0].stock)===19);
  check('refund cannot use another store',await denied('SELECT prepare_pos_refund($1,$2)',[{...request,store_id:B,idempotency_key:'foreign'},selected]));
  check('over-refund rejected',await denied('SELECT prepare_pos_refund($1,$2)',[{...request,idempotency_key:'too-many'},[{sale_item_id:item,quantity:2}]]));
  check('zero quantity rejected',await denied('SELECT prepare_pos_refund($1,$2)',[{...request,idempotency_key:'zero'},[{sale_item_id:item,quantity:0}]]));
  check('unauthenticated client cannot complete refunds',(await db.query("SELECT has_function_privilege('anon','public.complete_pos_refund(uuid,text,text)','EXECUTE') allowed")).rows[0].allowed===false);
  console.log(`${passed} pre-launch database checks passed`);
} finally {await db.close();}
