// Isolated tests of production modules. No network, payments, messages or live writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.join(__dirname, '..'), tests = [];
const test = (name, run) => tests.push([name, run]);
function load(file, mocks = {}, extra = '') {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('import.meta.env.VITE_SUPABASE_URL', '"https://fixture.invalid"') + extra;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', js)(key => {
    if (!(key in mocks)) throw Error('Unexpected dependency ' + key);
    return mocks[key];
  }, m, m.exports);
  return m.exports;
}
const nativeHarness = (operation, native = true) => {
  const reachable = [], calls = [];
  const api = load('capacitor-shell/lib/nativeHttp.ts', {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => native }, CapacitorHttp: { request: async args => { calls.push(args); return operation(args); } } },
    '@/lib/offline/useOnline': { setBackendReachable: value => reachable.push(value) },
  });
  return { ...api, reachable, calls };
};
for (const status of [204, 205, 304]) test(`native HTTP ${status} succeeds without false offline state`, async () => {
  const h = nativeHarness(async () => ({ status, data: '', headers: { 'x-result': 'ok' } }));
  const result = await h.nativeFetch('https://fixture.invalid');
  assert.equal(result.status, status); assert.equal(result.body, null); assert.equal(await result.text(), ''); assert.deepEqual(h.reachable, [true]);
});
test('native JSON, HEAD, error statuses and request headers preserve Fetch behavior', async () => {
  const h = nativeHarness(async () => ({ status: 200, data: { ok: true }, headers: {} }));
  const res = await h.nativeFetch(new Request('https://fixture.invalid', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer fixture' }, body: '{"value":1}' }));
  assert.deepEqual(await res.json(), { ok: true }); assert.deepEqual(h.calls[0].data, { value: 1 });
  assert.equal(h.calls[0].headers.authorization, 'Bearer fixture');
  assert.equal((await h.nativeFetch('https://fixture.invalid', { method: 'HEAD' })).body, null);
  const bad = nativeHarness(async () => ({ status: 403, data: 'forbidden', headers: {} }));
  assert.equal((await bad.nativeFetch('https://fixture.invalid')).status, 403); assert.deepEqual(bad.reachable, [true]);
});
test('native transport failure alone marks backend unreachable', async () => {
  const h = nativeHarness(async () => { throw Error('network'); });
  await assert.rejects(h.nativeFetch('https://fixture.invalid'), /network/); assert.deepEqual(h.reachable, [false]);
});
test('already aborted native request never starts an OS operation', async () => {
  const h = nativeHarness(async () => { throw Error('should not run'); }); const controller = new AbortController(); controller.abort();
  await assert.rejects(h.nativeFetch('https://fixture.invalid', { signal: controller.signal }), e => e.name === 'AbortError'); assert.equal(h.calls.length, 0);
});
test('in-flight abort settles promptly and ignores late native response without offline or retry', async () => {
  let finish; const h = nativeHarness(() => new Promise(resolve => { finish = resolve; })); const c = new AbortController();
  const waiting = h.nativeFetch('https://fixture.invalid', { signal: c.signal }); c.abort();
  await assert.rejects(waiting, e => e.name === 'AbortError'); finish({ status: 200, data: 'late' });
  await Promise.resolve(); assert.equal(h.calls.length, 1); assert.deepEqual(h.reachable, []);
});
const pagination = load('src/lib/paginated-export.ts');
const reports = load('src/lib/web/owner-reports.ts', { '../paginated-export': pagination });
function db(tables, failTable) {
  const requests = [];
  return { requests, from(table) {
    let filtered = tables[table] || [], limit = 37, columns, single = false;
    const q = {
      select(value) { columns = value; return q; },
      eq(k,v) { filtered = filtered.filter(row => row[k] === v); return q; },
      in(k,vs) { filtered = filtered.filter(row => vs.includes(row[k])); return q; },
      gte(k,v) { filtered = filtered.filter(row => row[k] >= v); return q; },
      lte(k,v) { filtered = filtered.filter(row => row[k] <= v); return q; },
      gt(k,v) { filtered = filtered.filter(row => row[k] > v); return q; },
      order(k) { filtered = [...filtered].sort((a,b) => String(a[k]).localeCompare(String(b[k]))); return q; },
      limit(n) { limit = Math.min(n,37); return q; },
      maybeSingle() { single = true; return q; },
      then(resolve,reject) { requests.push({table, columns}); return Promise.resolve(table === failTable ? {error: Error('fixture query failure')} : {data: single ? filtered[0] ?? null : filtered.slice(0,limit), error:null}).then(resolve,reject); },
    }; return q;
  } };
}
test('reports page through >1,000 sales and allocations without querying nonexistent costs', async () => {
  const sales = Array.from({length: 1007}, (_,i) => ({ id: String(i).padStart(6,'0'), store_id:'A', created_at:'2026-10-08T06:00:00Z', status:'completed', total:10, tax:1, discount:0, refunded_amount: i === 0 ? 2 : 0, payment_method:'split' }));
  const h = db({ sales: [...sales, {...sales[0],id:'foreign',store_id:'B',total:99999}], sale_items: sales.map(s => ({id:s.id,sale_id:s.id,product_name:'Product',quantity:1,line_total:9})), sale_payments: sales.flatMap(s => [{id:s.id+'a',sale_id:s.id,method:'cash',amount:4,status:'completed'},{id:s.id+'b',sale_id:s.id,method:'card',amount:6,status:'completed'}]) });
  const result = await reports.loadOwnerReport(h,'A',reports.reportBounds('today','America/New_York',new Date('2026-10-08T07:00:00Z')),'America/New_York');
  assert.equal(result.txCount,1007); assert.equal(result.totalSales,10070); assert.equal(result.totalTax,1007); assert.equal(result.refundedAmount,2);
  assert.equal(result.topProducts[0].qty,1007); assert.equal(result.grossProfit,null);
  assert.deepEqual(result.paymentBreakdown,[{name:'card',value:6042},{name:'cash',value:4028}]);
  assert.equal(result.timeline[0].total,10070); assert.ok(h.requests.every(r => !r.columns.split(',').includes('cost')));
});
test('report failures propagate instead of fabricating an empty successful report', async () => {
  await assert.rejects(reports.loadOwnerReport(db({},'sales'),'A',reports.reportBounds('today','UTC'),'UTC'),/query failure/);
  const sale = {id:'1',store_id:'A',created_at:'2026-10-08T12:00:00Z',status:'completed'};
  await assert.rejects(reports.loadOwnerReport(db({sales:[sale]},'sale_items'),'A',reports.reportBounds('today','UTC',new Date('2026-10-08T12:00:00Z')),'UTC'),/query failure/);
});
test('report days follow merchant timezone across UTC midnight and daylight saving', () => {
  const b = reports.reportBounds('today','America/New_York',new Date('2026-10-08T02:00:00Z'));
  assert.equal(b.firstDay,'2026-10-07'); assert.equal(b.from.toISOString(),'2026-10-07T04:00:00.000Z'); assert.equal(b.to.toISOString(),'2026-10-08T03:59:59.999Z');
  const dst = reports.reportBounds('today','America/New_York',new Date('2026-11-01T18:00:00Z'));
  assert.equal(dst.to.getTime() - dst.from.getTime() + 1, 25*60*60*1000);
});
const updates = load('src/lib/app-update.ts', {'@/lib/native': {isNativeMode:()=>false}});
test('update detection includes same-version build increases without suggesting downgrades', () => {
  assert.equal(updates.isNewerAppRelease({version:'1.3.3',build:11},'1.3.3','10'),true);
  assert.equal(updates.isNewerAppRelease({version:'1.3.4',build:1},'1.3.3','10'),true);
  assert.equal(updates.isNewerAppRelease({version:'1.3.2',build:500},'1.3.3','10'),false);
  assert.equal(updates.isNewerAppRelease({version:'1.3.3',build:10},'1.3.3','10'),false);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/version.json')));assert.equal(updates.SEZA_APP_VERSION,manifest.version);assert.equal(updates.SEZA_APP_BUILD,manifest.build);
});
test('unconfigured or forgotten USB printer stays unselected, not device zero', () => {
  const values = new Map(); const savedWindow=global.window;
  global.window={localStorage:{getItem:key=>values.get(key)??null}};
  try {
    const printer=load('src/lib/hardware/escpos-usb.ts',{'@capacitor/core':{registerPlugin:()=>({})}});
    assert.equal(printer.selectedUsbDeviceId(),null);values.set('pos.hardware.usbPrinterDevice','');assert.equal(printer.selectedUsbDeviceId(),null);
    values.set('pos.hardware.usbPrinterDevice','0');assert.equal(printer.selectedUsbDeviceId(),0);
    values.set('pos.hardware.usbPrinterDevice','17');assert.equal(printer.selectedUsbDeviceId(),17);
  } finally { global.window=savedWindow; }
});
test('suppressed email response never becomes a sent receipt', async () => {
  const original=global.fetch; global.fetch=async()=>Response.json({success:false,reason:'email_suppressed'});
  try {
    const email=load('src/lib/email/send.ts',{'@/integrations/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}}},'@/lib/native':{isNativeMode:()=>false},'@/lib/offline/db':{},'@/lib/offline/useOnline':{isOnlineNow:()=>true}});
    const result=await email.sendTransactionalEmail({templateName:'receipt',recipientEmail:'fixture@example.invalid'});
    assert.equal(result.ok,false); assert.match(result.error,/another address/);
    global.fetch=async()=>Response.json({success:true,messageId:'delivery'});
    assert.deepEqual(await email.sendTransactionalEmail({templateName:'receipt',recipientEmail:'fixture@example.invalid'}),{ok:true,messageId:'delivery'});
  } finally {global.fetch=original;}
});
function route(file, mocks) { return load(file, {'@tanstack/react-router':{createFileRoute:()=>config=>config},...mocks}).Route.server.handlers.POST; }
function chain(result) { const q=new Proxy({}, {get:(_,k)=>k==='then'?(resolve,reject)=>Promise.resolve(result()).then(resolve,reject):()=>q});return q; }
function smsHarness(options={}) {
  let sends=0;const filters=[];
  const admin={auth:{getUser:async()=>({data:{user:{id:'employee'}}})},from(table){
    const q=chain(()=>table==='profiles'?{data:{store_id:'A',status:options.status??'active'}}:table==='user_roles'?{data:[{role:options.role??'owner'}]}:table==='sales'?{data:options.sale===false?null:{id:'sale'}}:table==='sms_settings'?{data:{provider:'fixture',enabled:true,credentials:{}}}:{data:null});
    return new Proxy(q,{get:(target,k)=>k==='eq'?(key,value)=>{filters.push([table,key,value]);return target;}:target[k]});
  }};
  const post=route('src/routes/api/sms/send.ts',{'@supabase/supabase-js':{createClient:()=>admin},'@/lib/sms/providers.server':{sendViaProvider:async()=>{sends++;return{ok:true,providerMessageId:'sent'};}},'@/lib/errors/user-facing':{userFacingError:()=> 'safe'},'@/lib/security/api-security.server':{guardApiRequest:async()=>null},'@/lib/security/rate-limit.server':{consumeRateLimit:async()=>({allowed:true})},'@/lib/billing/plan-entitlements.server':{assertStoreFeature:async()=>({})}});
  return {send:body=>post({request:new Request('https://fixture.invalid/api/sms/send',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify(body)})}),sends:()=>sends,filters};
}
const smsBody={to:'+15555550123',body:'Fixture receipt',saleId:'00000000-0000-4000-8000-000000000001'};
for(const status of ['disabled','removed','suspended'])test(`SMS rejects ${status} employee before provider call`,async()=>{const h=smsHarness({status});assert.equal((await h.send(smsBody)).status,403);assert.equal(h.sends(),0);});
test('SMS rejects missing or foreign sale and cashier configuration tests',async()=>{
  const foreign=smsHarness({sale:false});assert.equal((await foreign.send(smsBody)).status,404);assert.equal(foreign.sends(),0);
  const missing=smsHarness();assert.equal((await missing.send({...smsBody,saleId:null})).status,400);
  const cashier=smsHarness({role:'cashier'});assert.equal((await cashier.send({...smsBody,test:true})).status,403);assert.equal(cashier.sends(),0);
});
test('authorized SMS receipt and owner configuration test still reach provider',async()=>{
  const h=smsHarness();assert.equal((await h.send(smsBody)).status,200);assert.equal(h.sends(),1);
  assert.equal((await h.send({...smsBody,saleId:null,test:true})).status,200);assert.equal(h.sends(),2);
});
function pairingHarness(error) {
  const writes=[],rpc=[]; const admin={from(table){return chain(()=>{
    if(table==='device_pairing_codes')return{data:{id:'code',store_id:'A',expires_at:'2099-01-01T00:00:00Z'}};
    if(table==='device_registrations')return{count:0};return{data:[]};
  });},rpc:async(name,args)=>{rpc.push({name,args});return error?{error:{message:error}}:{data:[{device_id:'device',store_id:'A',label:'POS'}]};}};
  const post=route('src/routes/api/public/pos/pair-device.ts',{'@/lib/errors/user-facing':{userFacingError:()=> 'safe'},'@/lib/security/api-security.server':{guardApiRequest:async()=>null},'@/integrations/supabase/client.server':{supabaseAdmin:admin},'@/lib/pos/device.server':{hashPairingCode:()=> 'hashed-code',generateDeviceSecret:()=> 'fixture-device-secret',hashDeviceSecret:()=> 'hashed-secret'},'@/lib/billing/plan-entitlements.server':{assertStoreResourceLimit:async()=>({})}});
  return{rpc,call:()=>post({request:new Request('https://fixture.invalid/pair',{method:'POST',body:JSON.stringify({code:'ABCDE23456'})})})};
}
test('pairing uses the deployed atomic RPC with hashes and returns committed identity',async()=>{
  const h=pairingHarness();const res=await h.call();assert.equal(res.status,200);assert.equal((await res.json()).device_id,'device');
  assert.deepEqual(h.rpc,[{name:'consume_pos_pairing_code',args:{_code_hash:'hashed-code',_secret_hash:'hashed-secret',_fallback_label:'POS Register',_platform:'android'}}]);
});
for(const [code,status] of [['PAIRING_CODE_USED',409],['PAIRING_CODE_EXPIRED',410],['PAIRING_CODE_UNKNOWN',404],['internal sentinel',503]])test(`pairing fails safely for ${code}`,async()=>{
  const res=await pairingHarness(code).call();assert.equal(res.status,status);const body=await res.json();assert.ok(!body.device_secret);assert.ok(!JSON.stringify(body).includes('sentinel'));
});

const bootstrapServer = load('src/lib/pos/device-bootstrap.server.ts', {'../paginated-export':pagination});
test('bootstrap loads a full catalog above Supabase caps and removes internal store notes', async()=>{
  const products=Array.from({length:1003},(_,i)=>({id:String(i).padStart(5,'0'),store_id:'A',name:'Product '+i,status:'active'}));
  const h=db({stores:[{id:'A',admin_notes:'SENTINEL'}],products:[...products,{id:'foreign',store_id:'B',name:'Foreign',status:'active'}],categories:[{id:'c',store_id:'A',name:'Category',sort_order:0}],profiles:[],role_permissions:[]});
  const result=await bootstrapServer.loadDeviceBootstrap(h,'A');assert.equal(result.products.length,1003);assert.equal(result.store.id,'A');assert.equal(result.store.admin_notes,undefined);
});
test('bootstrap query failures never become empty replacement caches',async()=>{
  await assert.rejects(bootstrapServer.loadDeviceBootstrap(db({stores:[{id:'A'}]},'products'),'A'),/query failure/);
  await assert.rejects(bootstrapServer.loadDeviceBootstrap(db({stores:[{id:'A'}]},'role_permissions'),'A'),/configuration/);
});
function bootstrapClientHarness() {
  let pairing={storeId:'A',deviceId:'D',deviceSecret:'fixture'},user='employee',finish;
  const writes=[],events=[],deletes=[];let calls=0,signouts=0;
  const h=load('capacitor-shell/lib/deviceBootstrap.ts',{
    './nativeHttp':{nativeFetch:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});}},
    '../supabase':{API_BASE_URL:'https://fixture.invalid',supabase:{auth:{signOut:async()=>{signouts++;}}}},
    './pairing':{getPairing:()=>pairing},
    '@/lib/offline/db':{readMeta:async()=>user,cacheMeta:async(...args)=>{writes.push(args);},cacheProducts:async rows=>{writes.push(['products',rows]);},cacheEmployees:async()=>{},deleteMeta:async key=>{deletes.push(key);}},
  });
  return {...h,writes,events,deletes,signouts:()=>signouts,calls:()=>calls,switchStore:()=>{pairing={...pairing,storeId:'B'};},respond:(body,status=200)=>finish(Response.json(body,{status}))};
}
test('late bootstrap from previous merchant is ignored before any cache writes',async()=>{
  const old=global.window;global.window={dispatchEvent(){}};
  try {const h=bootstrapClientHarness();const pending=h.refreshDeviceBootstrap(true);await new Promise(setImmediate);h.switchStore();h.respond({store:{id:'A'},products:[]});assert.equal(await pending,false);assert.equal(h.writes.length,0);}finally{global.window=old;}
});
test('bootstrap preserves cache on network/API error and revokes only authoritative inactive identity',async()=>{
  const old=global.window,oldStorage=global.localStorage;const flags=new Map();global.window={dispatchEvent(){}};global.localStorage={setItem:(k,v)=>flags.set(k,v)};
  try{
    const h=bootstrapClientHarness();const pending=h.refreshDeviceBootstrap(true);await new Promise(setImmediate);h.respond({error:'query'},503);assert.equal(await pending,false);assert.equal(h.writes.length,0);assert.equal(h.signouts(),0);
    const retry=h.refreshDeviceBootstrap(true);await new Promise(setImmediate);h.respond({store:{id:'A'},products:[],employees:[],profile:null});assert.equal(await retry,true);assert.equal(h.signouts(),1);assert.equal(flags.get('seza.employee_select_required'),'1');assert.ok(h.deletes.includes('authenticated_me_current_user'));
  }finally{global.window=old;global.localStorage=oldStorage;}
});
test('shift financial queries propagate errors before printing a partial summary',async()=>{
  const h=db({register_sessions:[{id:'shift',store_id:'A'}]},'sales');
  const shift=load('src/lib/shift-summary.ts',{'./paginated-export':pagination,'@/integrations/supabase/client':{supabase:h}});
  await assert.rejects(shift.fetchShiftSummary('shift'),/query failure/);
});
test('release publication is manual and signed; ordinary APK build cannot publish debug',()=>{
  const source=f=>fs.readFileSync(path.join(root,f),'utf8');
  assert.doesNotMatch(source('.github/workflows/android-build.yml'),/gh release (upload|create)/);
  const release=source('.github/workflows/android-release.yml');assert.match(release,/workflow_dispatch/);assert.doesNotMatch(release,/\n  push:/);assert.match(release,/assembleRelease/);assert.match(release,/application-debuggable/);assert.match(release,/apksigner/);
});
(async()=>{const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';let failed=0;
for(const [name,run] of tests)try{await run();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}
if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
console.log(`${tests.length-failed}/${tests.length} pre-launch regression checks passed`);process.exitCode=failed?1:0;
})();
