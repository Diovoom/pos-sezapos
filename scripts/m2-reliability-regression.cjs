// Isolated SDK/API/database fixtures: no readers, network or financial actions.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, mocks = {}, extra = '') {
  const source = fs.readFileSync(path.join(root,file),'utf8') + extra;
  const js = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const m={exports:{}};
  new Function('require','module','exports',js)(key=>{if(!(key in mocks))throw Error(`Unexpected dependency ${key}`);return mocks[key]},m,m.exports);
  return m.exports;
}
const tests=[]; const test=(name,fn)=>tests.push([name,fn]);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const tick=()=>new Promise(setImmediate);
function fixture() {
  delete global.__sezaStripeTerminalRuntime;
  const storage=new Map();global.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  global.window={location:{origin:'https://fixture.invalid'},dispatchEvent(){},clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms>=10000?40:ms)};
  const d=load('src/lib/hardware/reader-diagnostics.ts');
  const state={initialized:false,reader:null,connects:0,initializes:0,requests:[],tokens:[],events:new Map(),discovered:{serialNumber:'STRM2D606003633',deviceType:'stripeM2'},store:'A',failToken:false,failClear:false,failSave:false,failPermission:false,empty:false,failConnect:false,holdConnect:null,holdToken:null};
  const events=Object.fromEntries(['RequestedConnectionToken','DiscoveredReaders','DisconnectedReader','ReaderReconnectStarted','ReaderReconnectSucceeded','ReaderReconnectFailed'].map(s=>[s,s]));
  const sdk={
    addListener:async(event,fn)=>{const list=state.events.get(event)||new Set();list.add(fn);state.events.set(event,list);return {remove:async()=>list.delete(fn)}},
    initialize:async()=>{state.initialized=true;state.initializes++},
    getConnectedReader:async()=>{if(!state.initialized)throw Error('not initialized');return {reader:state.reader}},
    setConnectionToken:async({token})=>{state.tokens.push(token);if(!token)throw Error('failure delivered')},
    discoverReaders:async()=>({readers:state.empty?[]:[state.discovered]}),
    cancelDiscoverReaders:async()=>{},
    connectReader:async()=>{state.connects++;if(state.holdConnect)await state.holdConnect.promise;if(state.failConnect)throw Error('native token sk_test_fixture secret');state.reader=state.discovered},
    collectPaymentMethod:async()=>{if(state.decline)throw Error('Your card was declined.');},
    confirmPaymentIntent:async()=>{},
    cancelCollectPaymentMethod:async()=>{},
    disconnectReader:async()=>{state.reader=null},
    clearCachedCredentials:async()=>{if(state.failClear)throw Error('clear failed')},
  };
  const mod={StripeTerminal:sdk,TerminalEventsEnum:events,TerminalConnectTypes:{Usb:'usb',Bluetooth:'bluetooth',Simulated:'simulated'}};
  const mocks={
    './reader-diagnostics':d,'@/lib/native':{isNativeMode:()=>true},'@/integrations/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:null}})}}},
    '@/lib/offline/db':{readMeta:async()=> 'employee'},'@/lib/errors/user-facing':{userFacingError:e=>e.message},
    '../../../capacitor-shell/lib/pairing':{getPairing:()=>({storeId:state.store,deviceId:'device',deviceSecret:'fixture'})},
    '../../../capacitor-shell/lib/nativeHttp':{nativeFetch:async(url,opts)=>{
      const body=JSON.parse(opts.body);state.requests.push({url,body});
      let result={},status=200;
      if(url.endsWith('/context'))result={ready:true,locationId:`location-${state.store}`,terminals:[{id:`terminal-${state.store}`,store_id:state.store,status:'active',config:{reader_type:'stripe-m2',connection_method:'usb'}}]};
      if(url.endsWith('/connection-token')){if(state.holdToken)await state.holdToken.promise;if(state.failToken){status=503;result={error:'network secret fixture'}}else result={secret:`token-${body.nativeAuth.store_id}`}}
      if(url.endsWith('/payment-intent'))result={id:'pi_fixture',client_secret:'pi_fixture_secret_fixture',status:state.approved?'succeeded':'requires_payment_method'};
      if(url.endsWith('/reader')&&state.failSave){status=503;result={error:'API secret fixture'}}
      return new Response(JSON.stringify(result),{status});
    }},
    '@/lib/device-control':{deviceControl:{requestTerminalPermissions:async()=>({granted:!state.failPermission,locationGranted:!state.failPermission,usbDeviceFound:true,usbGranted:true})}},
    '@capacitor-community/stripe-terminal':mod,'./index':{setActiveTerminal(){}},'@/lib/pos/payment-terminal':{setActivePaymentProvider(){}},
  };
  const api=load('src/lib/hardware/terminal-stripe.ts',mocks,'\nexport { installConnectionTokenListener, initialize, stripeRuntime, activeConfiguration, ensureReader };');
  return {state,sdk,mod,d,api,async emit(event){for(const fn of state.events.get(event)||[])fn();await tick()},runtime:()=>global.__sezaStripeTerminalRuntime};
}
test('strict diagnostic allowlist removes arbitrary native objects, credentials and forged identities',()=>{
  const d=load('src/lib/hardware/reader-diagnostics.ts');
  const safe=d.sanitizeReaderDiagnostic({stage:'CONNECT_READER_NATIVE',status:'error',native_error_code:'NATIVE',native_error:'sk_live_leak',message:'pi_secret',stack:'Authorization bearer',store_id:'evil',reader_serial:'acct_bad',token:'secret',timestamp:'junk'});
  assert.equal(safe.reader_serial,null);assert.ok(!JSON.stringify(safe).match(/sk_live|pi_secret|Authorization|evil|acct_bad/));assert.equal(safe.native_error,'The native reader operation failed.');
  assert.equal(d.sanitizeReaderDiagnostic({stage:'arbitrary'}),null);
  d.recordReaderDiagnostic('CONNECT_READER_NATIVE','error',{native_error_code:'NATIVE'});d.recordReaderDiagnostic('CONNECTED','ok');assert.equal(d.getReaderDiagnostic().native_error,null);
  const snapshot=d.operationalSnapshot({terminal:{driver:'stripe-m2',connected:true,last_error:'native secret',rawError:'secret'},reader_diagnostic:safe});
  assert.deepEqual(snapshot.terminal,{driver:'stripe-m2',connected:true});assert.ok(!JSON.stringify(snapshot).includes('secret'));
});
test('initialization and global SDK listener registration are idempotent',async()=>{
  const f=fixture();await Promise.all([f.api.initialize(false),f.api.initialize(false),f.api.initialize(false)]);
  assert.equal(f.state.initializes,1);for(const list of f.state.events.values())assert.equal(list.size,1);
});
test('failed token retrieval completes native callback, then next request recovers',async()=>{
  const f=fixture();await f.api.initialize(false);f.state.failToken=true;await f.emit('RequestedConnectionToken');await f.runtime().tokenDeliveryQueue;
  assert.deepEqual(f.state.tokens,['']);assert.equal(f.d.getReaderDiagnostic().stage,'CONNECTION_TOKEN');
  f.state.failToken=false;await f.emit('RequestedConnectionToken');await f.runtime().tokenDeliveryQueue;
  assert.deepEqual(f.state.tokens,['','token-A']);assert.equal(f.state.requests.filter(x=>x.url.endsWith('/connection-token')).length,2);
});
test('overlapping manual/automatic connects share one native operation and remove discovery listeners',async()=>{
  const f=fixture();f.state.holdConnect=deferred();const a=f.api.connectReader('stripe-m2'),b=f.api.connectReader('stripe-m2');
  for(let n=0;n<15&&f.state.connects===0;n++)await tick();assert.equal(f.state.connects,1);f.state.holdConnect.resolve();await Promise.all([a,b]);
  assert.equal(f.state.connects,1);assert.equal(f.state.events.get('DiscoveredReaders').size,0);assert.equal(f.d.getReaderDiagnostic().stage,'CONNECTED');
});
test('physical USB present but not adopted records distinct evidence and generic cashier error',async()=>{
  const f=fixture();f.state.empty=true;await assert.rejects(f.api.connectReader('stripe-m2'),e=>e.message===f.d.READER_CONNECTION_MESSAGE);
  assert.equal(f.d.getReaderDiagnostic().stage,'DISCOVER_USB_EMPTY');assert.equal(f.d.getReaderDiagnostic().native_error_code,'USB_NOT_ADOPTED');assert.equal(f.state.connects,0);
});
test('native connect failure stays at native stage and never marks API connected',async()=>{
  const f=fixture();f.state.failConnect=true;await assert.rejects(f.api.connectReader('stripe-m2'),e=>e.message===f.d.READER_CONNECTION_MESSAGE);
  assert.equal(f.d.getReaderDiagnostic().stage,'CONNECT_READER_NATIVE');assert.equal(f.state.requests.filter(x=>x.body.action==='connected').length,0);
});
test('API-save failure recovers existing native connection without connecting again',async()=>{
  const f=fixture();f.state.failSave=true;await assert.rejects(f.api.connectReader('stripe-m2'));
  assert.equal(f.d.getReaderDiagnostic().stage,'READER_API_SAVE');f.state.failSave=false;await f.api.connectReader('stripe-m2');
  assert.equal(f.state.connects,1);assert.equal(f.d.getReaderDiagnostic().native_error,null);
});
test('merchant reset invalidates old token response, then resolves fresh merchant account',async()=>{
  const f=fixture();await f.api.initialize(false);f.state.holdToken=deferred();await f.emit('RequestedConnectionToken');
  const reset=f.api.resetStripeTerminalForMerchantSwitch();f.state.holdToken.resolve();await reset;assert.deepEqual(f.state.tokens,['']);
  f.state.store='B';await f.api.connectReader('stripe-m2');await f.emit('RequestedConnectionToken');await f.runtime().tokenDeliveryQueue;
  assert.equal(f.runtime().storeId,'B');assert.equal(f.state.tokens.at(-1),'token-B');
});
test('reset waits for stale connect, disconnects it, and does not register it to next merchant',async()=>{
  const f=fixture();f.state.holdConnect=deferred();const connect=f.api.connectReader('stripe-m2');connect.catch(()=>{});
  for(let n=0;n<15&&f.state.connects===0;n++)await tick();const reset=f.api.resetStripeTerminalForMerchantSwitch();f.state.holdConnect.resolve();await reset;
  await assert.rejects(connect);assert.equal(f.state.reader,null);assert.equal(f.state.requests.filter(x=>x.body.action==='connected').length,0);
});
test('failed credential reset fails closed, no new discovery/payment',async()=>{
  const f=fixture();await f.api.connectReader('stripe-m2');f.state.failClear=true;await assert.rejects(f.api.resetStripeTerminalForMerchantSwitch());
  f.state.store='B';await assert.rejects(f.api.connectReader('stripe-m2'));assert.equal(f.state.connects,1);assert.equal(f.d.getReaderDiagnostic().stage,'MERCHANT_RESET');
});
test('SDK reconnect blocks competing discovery and updates API when connection is restored',async()=>{
  const f=fixture();await f.api.connectReader('stripe-m2');f.state.reader=null;await f.emit('ReaderReconnectStarted');
  assert.equal(f.api.readerOperationBusy(),true);await assert.rejects(f.api.discoverReaders('stripe-m2'));f.state.reader=f.state.discovered;await f.emit('ReaderReconnectSucceeded');
  for(let i=0;i<10&&f.d.getReaderDiagnostic().stage!=='CONNECTED';i++)await tick();assert.equal(f.d.getReaderDiagnostic().stage,'CONNECTED');assert.equal(f.d.getReaderDiagnostic().native_error,null);
});
test('payment setup permission error is generic and creates no PaymentIntent',async()=>{
  const f=fixture();f.state.failPermission=true;const result=await f.api.charge('stripe-m2',{amountCents:100,currency:'usd'});
  assert.equal(result.error,f.d.READER_CONNECTION_MESSAGE);assert.equal(f.d.getReaderDiagnostic().stage,'ANDROID_PERMISSION');assert.equal(f.state.requests.filter(x=>x.url.endsWith('/payment-intent')).length,0);
});
test('pairing adoption stays inside merchant-reset lock', async()=>{
  const f=fixture(), gate=deferred(); let started=false;
  const resetting=f.api.resetStripeTerminalForMerchantSwitch(async()=>{started=true;await gate.promise;f.state.store='B'});
  for(let i=0;i<20&&!started;i++)await tick();
  assert.ok(started);await assert.rejects(f.api.connectReader('stripe-m2'));assert.equal(f.state.connects,0);
  gate.resolve();await resetting;await f.api.connectReader('stripe-m2');assert.equal(f.runtime().storeId,'B');
});
test('remembered disconnected reader survives JS restart and cannot select a different merchant',async()=>{
  const f=fixture();await f.api.connectReader('stripe-m2');
  delete global.__sezaStripeTerminalRuntime;
  const context={terminals:[{id:'terminal-A',store_id:'A',status:'configured'}]};
  assert.equal(f.api.selectedStripeTerminal(context).id,'terminal-A');
  assert.equal(f.api.selectedStripeTerminal({terminals:[{id:'terminal-A',store_id:'B',status:'configured'}]}),undefined);
  await f.api.disconnect();assert.equal(f.api.selectedStripeTerminal(context),undefined);
});
test('rejected native token delivery does not consume another pending callback',async()=>{
  const f=fixture();f.sdk.setConnectionToken=async({token})=>{f.state.tokens.push(token);throw Error('already consumed')};
  await f.api.initialize(false);await f.emit('RequestedConnectionToken');await f.runtime().tokenDeliveryQueue;
  assert.deepEqual(f.state.tokens,['token-A']);
});
test('card decline remains customer-facing and releases the payment lock',async()=>{
  const f=fixture();f.state.decline=true;
  const result=await f.api.charge('stripe-m2',{amountCents:100,currency:'usd'});
  assert.equal(result.error,'Your card was declined.');assert.equal(f.runtime().paymentInFlight,false);
});
test('already-approved retry returns its reference without another collection or confirmation',async()=>{
  const f=fixture();f.state.approved=true;
  f.sdk.collectPaymentMethod=async()=>{throw Error('must not collect again')};
  f.sdk.confirmPaymentIntent=async()=>{throw Error('must not confirm again')};
  const result=await f.api.charge('stripe-m2',{amountCents:100,currency:'usd'});
  assert.deepEqual(result,{ok:true,ref:'pi_fixture'});assert.equal(f.runtime().paymentInFlight,false);
});
function heartbeatFixture() {
  const state={writes:[],valid:true,missing:false};
  const admin={from(table){let patch;const q=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve().then(()=>{
    if(table==='admin_device_diagnostics'&&state.missing)throw Error('table absent');
    if(patch){state.writes.push({table,patch});return {error:null}}
    return {data:table==='device_registrations'?{id:'device-A',store_id:'store-A',status:'active',secret_hash:'hash'}:null};
  }).then(resolve,reject);return (...args)=>{if(['upsert','update'].includes(key))patch=args[0];return q}}});return q}};
  const route=load('src/routes/api/public/pos/device-heartbeat.ts',{
    '@/lib/hardware/reader-diagnostics':load('src/lib/hardware/reader-diagnostics.ts'),
    '@tanstack/react-router':{createFileRoute:()=>x=>x},
    '@/lib/security/api-security.server':{guardApiRequest:async()=>null},
    '@/integrations/supabase/client.server':{supabaseAdmin:admin},
    '@/lib/pos/device.server':{verifyDeviceSecret:()=>state.valid},
  }).Route;
  const send=patch=>route.server.handlers.POST({request:new Request('https://fixture.invalid/api/public/pos/device-heartbeat',{method:'POST',body:JSON.stringify({store_id:'store-A',device_id:'device-A',device_secret:'fixture',status_snapshot:{terminal:{last_error:'SECRET'}},reader_diagnostic:{stage:'CONNECTED',status:'ok',device_id:'other',store_id:'other',native_error:'SECRET'},...patch})})});
  return {state,send};
}
test('heartbeat rejects invalid credentials and cross-store identity before any write',async()=>{
  const f=heartbeatFixture();f.state.valid=false;assert.equal((await f.send()).status,401);f.state.valid=true;assert.equal((await f.send({store_id:'store-B'})).status,401);assert.equal(f.state.writes.length,0);
});
test('heartbeat stores server-derived identities and sanitized separate diagnostics',async()=>{
  const f=heartbeatFixture();assert.equal((await f.send()).status,200);const record=f.state.writes.find(w=>w.table==='admin_device_diagnostics');assert.equal(record.patch.store_id,'store-A');assert.equal(record.patch.device_id,'device-A');assert.ok(!JSON.stringify(f.state.writes).includes('SECRET'));
});
test('missing diagnostics relation never fails normal heartbeat',async()=>{
  const f=heartbeatFixture();f.state.missing=true;assert.equal((await f.send()).status,200);assert.ok(f.state.writes.some(w=>w.table==='device_registrations'));
});
test('diagnostics table rejects merchant reads; service role retains isolated storage',async()=>{
  delete global.window;
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
  try {await db.exec('create role anon; create role authenticated; create role service_role; create table device_registrations(id uuid primary key, status_snapshot jsonb); create table stores(id uuid primary key);');
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261006164528_admin_device_diagnostics.sql'),'utf8'));
    await db.exec('set role authenticated');await assert.rejects(db.query('select * from admin_device_diagnostics'),/permission denied/);await db.exec('reset role');
    const r=await db.query("select relrowsecurity from pg_class where relname='admin_device_diagnostics'");assert.equal(r.rows[0].relrowsecurity,true);
  } finally {await db.close()}
});
test('native patch forwards discovery failures and removes token logging',()=>{
  const base=path.join(root,'node_modules/@capacitor-community/stripe-terminal/android/src/main/java/com/getcapacitor/community/stripe/terminal');
  const provider=fs.readFileSync(path.join(base,'TokenProvider.kt'),'utf8');assert.ok(!/Log\.d\([^\n]*secret/.test(provider));
  const terminal=fs.readFileSync(path.join(base,'StripeTerminal.kt'),'utf8');assert.match(terminal,/SEZA_PATCH_DISCOVERY_FAILURE\s+call.reject/);
});
(async()=>{let failed=0;for(const [name,fn] of tests){try{await fn();console.log(`PASS ${name}`)}catch(e){failed++;console.error(`FAIL ${name}`,e)}}console.log(`${tests.length-failed}/${tests.length} M2 reliability checks passed`);if(failed)process.exitCode=1})()
