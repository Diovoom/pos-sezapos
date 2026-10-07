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
  const state={initialized:false,reader:null,connects:0,initializes:0,requests:[],tokens:[],events:new Map(),discovered:{serialNumber:'STRM2D606003633',deviceType:'stripeM2'},store:'A',failToken:false,failClear:false,failSave:false,failPermission:false,empty:false,failConnect:false,holdConnect:null,holdToken:null,usbPresent:true,usbGranted:true,merchantReady:true,locationReady:true,permissionCalls:0,discoveries:0};
  const events=Object.fromEntries(['RequestedConnectionToken','DiscoveredReaders','DisconnectedReader','ReaderReconnectStarted','ReaderReconnectSucceeded','ReaderReconnectFailed','StartInstallingUpdate','ReaderSoftwareUpdateProgress','FinishInstallingUpdate'].map(s=>[s,s]));
  const sdk={
    addListener:async(event,fn)=>{const list=state.events.get(event)||new Set();list.add(fn);state.events.set(event,list);return {remove:async()=>list.delete(fn)}},
    initialize:async()=>{if(!state.initialized)state.initializes++;state.initialized=true},
    getConnectedReader:async()=>{if(!state.initialized)throw Error('not initialized');return {reader:state.reader}},
    setConnectionToken:async({token})=>{state.tokens.push(token);if(!token)throw Error('failure delivered')},
    discoverReaders:async()=>{state.discoveries++;if(state.tokenOnDiscovery){for(const fn of state.events.get('RequestedConnectionToken')||[])fn({requestId:'1'});for(let n=0;n<30&&!state.tokens.length;n++)await tick();if(!state.tokens[0])throw Object.assign(Error('Connection token failed'),{code:'CONNECTION_TOKEN_PROVIDER_ERROR'})}return {readers:state.empty?[]:[state.discovered]}},
    cancelDiscoverReaders:async()=>{},cancelReaderReconnection:async()=>{},
    connectReader:async()=>{state.connects++;if(state.holdConnect)await state.holdConnect.promise;if(state.failConnect)throw Object.assign(Error('sk_test_fixture secret'),{code:state.connectError||'BLUETOOTH_ERROR'});state.reader=state.discovered},
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
      if(url.endsWith('/context'))result={ready:state.merchantReady,connectStatus:state.merchantReady?'ready':'pending',cardPaymentsStatus:'active',terminalLocationReady:state.locationReady,locationId:state.locationReady?`location-${state.store}`:null,terminals:[{id:`terminal-${state.store}`,store_id:state.store,status:'active',serial:state.savedSerial||null,config:{reader_type:'stripe-m2',connection_method:'usb'}}]};
      if(url.endsWith('/connection-token')){if(state.holdToken)await state.holdToken.promise;if(state.failToken){status=503;result={error:'network secret fixture'}}else result={secret:`token-${body.nativeAuth.store_id}`}}
      if(url.endsWith('/payment-intent'))result={id:'pi_fixture',client_secret:'pi_fixture_secret_fixture',status:state.approved?'succeeded':'requires_payment_method'};
      if(url.endsWith('/reader')&&state.failSave){status=503;result={error:'API secret fixture'}}
      return new Response(JSON.stringify(result),{status});
    }},
    '@/lib/device-control':{deviceControl:{getTerminalUsbState:async()=>({usbDeviceFound:state.usbPresent,usbGranted:state.usbGranted}),requestTerminalPermissions:async()=>{state.permissionCalls++;return {granted:!state.failPermission&&state.usbGranted,locationGranted:!state.failPermission,bluetoothGranted:true,usbDeviceFound:state.usbPresent,usbGranted:state.usbGranted}}}},
    '@capacitor-community/stripe-terminal':mod,'./index':{setActiveTerminal(){}},'@/lib/pos/payment-terminal':{setActivePaymentProvider(){}},
  };
  const api=load('src/lib/hardware/terminal-stripe.ts',mocks,'\nexport { installConnectionTokenListener, initialize, stripeRuntime, activeConfiguration, ensureReader };');
  return {state,sdk,mod,d,api,async emit(event,data){for(const fn of state.events.get(event)||[])fn(data);await tick()},runtime:()=>global.__sezaStripeTerminalRuntime};
}
test('strict diagnostic allowlist removes arbitrary native objects, credentials and forged identities',()=>{
  const d=load('src/lib/hardware/reader-diagnostics.ts');
  const safe=d.sanitizeReaderDiagnostic({stage:'CONNECT_READER_NATIVE',status:'error',native_error_code:'NATIVE',native_error:'sk_live_leak',message:'pi_secret',stack:'Authorization bearer',store_id:'evil',reader_serial:'acct_bad',token:'secret',timestamp:'junk'});
  assert.equal(safe.reader_serial,null);assert.ok(!JSON.stringify(safe).match(/sk_live|pi_secret|Authorization|evil|acct_bad/));assert.equal(safe.native_error,d.READER_MESSAGES.NATIVE);
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
  assert.deepEqual(f.state.tokens,['']);assert.equal(f.d.getReaderDiagnostic().stage,'CONNECTION_TOKEN_REQUEST');
  f.state.failToken=false;await f.emit('RequestedConnectionToken');await f.runtime().tokenDeliveryQueue;
  assert.deepEqual(f.state.tokens,['','token-A']);assert.equal(f.state.requests.filter(x=>x.url.endsWith('/connection-token')).length,2);
});
test('overlapping manual/automatic connects share one native operation and remove discovery listeners',async()=>{
  const f=fixture();f.state.holdConnect=deferred();const a=f.api.connectReader('stripe-m2'),b=f.api.connectReader('stripe-m2');
  for(let n=0;n<15&&f.state.connects===0;n++)await tick();assert.equal(f.state.connects,1);f.state.holdConnect.resolve();await Promise.all([a,b]);
  assert.equal(f.state.connects,1);assert.equal(f.state.events.get('DiscoveredReaders').size,0);assert.equal(f.d.getReaderDiagnostic().stage,'CONNECTED');
});
test('physical USB present but not adopted records distinct evidence and generic cashier error',async()=>{
  const f=fixture();f.state.empty=true;await assert.rejects(f.api.connectReader('stripe-m2'),e=>e.message===f.d.READER_MESSAGES.USB_NOT_ADOPTED);
  assert.equal(f.d.getReaderDiagnostic().stage,'DISCOVER_USB_EMPTY');assert.equal(f.d.getReaderDiagnostic().native_error_code,'USB_NOT_ADOPTED');assert.equal(f.state.connects,0);
});
test('native connect failure stays at native stage and never marks API connected',async()=>{
  const f=fixture();f.state.failConnect=true;await assert.rejects(f.api.connectReader('stripe-m2'),e=>e.message===f.d.READER_MESSAGES.NATIVE);
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
  assert.equal(result.error,f.d.READER_MESSAGES.PERMISSION);assert.equal(f.d.getReaderDiagnostic().stage,'ANDROID_PERMISSION');assert.equal(f.state.requests.filter(x=>x.url.endsWith('/payment-intent')).length,0);
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
test('no USB hardware stops promptly before Stripe discovery and gives the exact cashier message',async()=>{
  const f=fixture();f.state.usbPresent=false;
  await assert.rejects(f.api.connectReader('stripe-m2'),{message:'No card reader detected. Connect and power on the Stripe Reader M2, then try again.'});
  assert.equal(f.state.discoveries,0);assert.equal(f.state.permissionCalls,0);assert.equal(f.d.getReaderDiagnostic().failed_stage,'ANDROID_USB_DETECTION');assert.equal(f.d.getReaderDiagnostic().usb_device_found,false);
});
test('detected USB with denied permission never enters Stripe discovery',async()=>{
  const f=fixture();f.state.usbGranted=false;
  await assert.rejects(f.api.connectReader('stripe-m2'),{message:f.d.READER_MESSAGES.USB_PERMISSION});
  assert.equal(f.state.discoveries,0);assert.equal(f.d.getReaderDiagnostic().usb_permission_granted,false);assert.equal(f.d.getReaderDiagnostic().failed_stage,'ANDROID_PERMISSION');
});
test('granted USB discovery connects the current Reader and persists its real serial',async()=>{
  const f=fixture();const result=await f.api.connectReader('stripe-m2');
  assert.equal(result.serialNumber,f.state.discovered.serialNumber);assert.equal(f.state.connects,1);
  const stored=JSON.parse(localStorage.getItem('pos.stripe.readerSelection'));assert.equal(stored.serial,f.state.discovered.serialNumber);
  assert.equal(f.state.requests.find(x=>x.body.action==='connected').body.serial,f.state.discovered.serialNumber);
  assert.equal(localStorage.getItem('pos.terminal.lastError'),null);
  const timeline=f.d.getReaderDiagnostic().timeline;for(const name of ['STRIPE_INITIALIZE','ANDROID_USB_DETECTION','ANDROID_PERMISSION','USB_DEVICE_FOUND','STRIPE_READER_DISCOVERED','CONNECT_READER_NATIVE','READER_API_SAVE','CONNECTED'])assert.ok(timeline.some(x=>x.stage===name),name);
});
test('connection token succeeds during discovery and its stage timeline contains no secret',async()=>{
  const f=fixture();f.state.tokenOnDiscovery=true;await f.api.connectReader('stripe-m2');
  assert.ok(f.d.getReaderDiagnostic().timeline.some(x=>x.stage==='CONNECTION_TOKEN_REQUEST'));assert.ok(f.d.getReaderDiagnostic().timeline.some(x=>x.stage==='CONNECTION_TOKEN_DELIVERED'));
  assert.equal(f.state.requests.find(x=>x.url.endsWith('/connection-token')).body.nativeAuth.store_id,'A');
  assert.ok(!JSON.stringify(f.d.getReaderDiagnostic()).includes('token-A'));
});
test('connection token failure rejects discovery promptly instead of returning USB empty',async()=>{
  const f=fixture();f.state.tokenOnDiscovery=true;f.state.failToken=true;
  await assert.rejects(f.api.connectReader('stripe-m2'),{message:f.d.READER_MESSAGES.TOKEN});
  assert.equal(f.state.tokens[0],'');assert.equal(f.d.getReaderDiagnostic().failed_stage,'CONNECTION_TOKEN_REQUEST');assert.equal(f.state.connects,0);
});
test('duplicate native request ID cannot mint or deliver a second token',async()=>{
  const f=fixture();await f.api.initialize(false);await f.emit('RequestedConnectionToken',{requestId:'17'});await f.runtime().tokenDeliveryQueue;await f.emit('RequestedConnectionToken',{requestId:'17'});await f.runtime().tokenDeliveryQueue;
  assert.equal(f.state.tokens.length,1);
});
test('restart rediscovers the saved serial and never substitutes another reader',async()=>{
  const f=fixture();await f.api.connectReader('stripe-m2');f.state.reader=null;delete global.__sezaStripeTerminalRuntime;
  f.state.discovered={serialNumber:'STRM2OTHER',deviceType:'stripeM2'};
  await assert.rejects(f.api.connectReader('stripe-m2'));assert.equal(f.state.connects,1);
  f.state.discovered={serialNumber:'STRM2D606003633',deviceType:'stripeM2'};await f.api.connectReader('stripe-m2');assert.equal(f.state.connects,2);
});
test('restart with absent reader stops at USB detection',async()=>{
  const f=fixture();await f.api.connectReader('stripe-m2');f.state.reader=null;delete global.__sezaStripeTerminalRuntime;f.state.usbPresent=false;
  await assert.rejects(f.api.connectReader('stripe-m2'),{message:f.d.READER_MESSAGES.USB_ABSENT});assert.equal(f.state.connects,1);
});
test('merchant and location setup failures remain distinct',async()=>{
  const f=fixture();f.state.merchantReady=false;await assert.rejects(f.api.connectReader('stripe-m2'),{message:f.d.READER_MESSAGES.MERCHANT_SETUP});
  f.state.merchantReady=true;f.state.locationReady=false;await assert.rejects(f.api.connectReader('stripe-m2'),{message:f.d.READER_MESSAGES.LOCATION});assert.equal(f.state.connects,0);
});
test('reader busy elsewhere requires a real Stripe error code',async()=>{
  const f=fixture();f.state.failConnect=true;f.state.connectError='READER_IN_USE';await assert.rejects(f.api.connectReader('stripe-m2'),{message:f.d.READER_MESSAGES.READER_IN_USE});
  assert.equal(f.d.readerErrorCode({message:'Already connected somewhere'}),'BUSY');assert.equal(f.d.readerErrorCode({code:'OPERATION_IN_PROGRESS'}),'BUSY');
});
test('cashier messages exclude developer information and update/battery failures are actionable',()=>{
  const d=load('src/lib/hardware/reader-diagnostics.ts');
  for(const secret of ['java.lang.Exception','com.stripe.TerminalException','acct_fixture','sk_test_fixture','pi_fixture_secret_fixture','Bearer private','token=secret'])assert.equal(d.safeReaderMessage(new Error(secret)),d.READER_CONNECTION_MESSAGE);
  assert.equal(d.readerErrorCode({code:'READER_SOFTWARE_UPDATE_FAILED_BATTERY_LOW'}),'BATTERY');assert.equal(d.readerErrorCode({code:'READER_SOFTWARE_UPDATE_FAILED'}),'UPDATE');
  assert.equal(d.sanitizeReaderDiagnostic({stage:'ANDROID_USB_DETECTION',reader_serial:'STRM2D606003633',reader_discovered:false}).reader_serial,null);
});
test('unexpected disconnect clears the connected state and manual reconnect scans again',async()=>{
  const f=fixture();await f.api.connectReader('stripe-m2');f.state.reader=null;await f.emit('DisconnectedReader');assert.equal(f.api.connectedReader(),null);
  await f.api.connectReader('stripe-m2');assert.equal(f.state.discoveries,2);assert.equal(f.state.connects,2);
});
function merchantServerFixture() {
  const state={tokens:[],browserAuthReads:0,failed:false};
  const admin={auth:{getUser:async()=>{state.browserAuthReads++;return {data:{user:{id:'browser-B'}}}}},from(table){
    const filters={};const q=new Proxy({}, {get(_,key){
      if(key==='maybeSingle')return async()=>{
        let data=null;
        if(table==='device_registrations')data={id:'device-A',store_id:'store-A',status:'active',secret_hash:'valid'};
        if(table==='profiles')data={id:filters.id,store_id:filters.id==='browser-B'?'store-B':'store-A',status:'active'};
        if(table==='stores')data={id:filters.id,stripe_connected_account_id:filters.id==='store-A'?'acct_A':'acct_B',stripe_terminal_location_id:'tml_A',stripe_card_payments_status:'active'};
        return {data,error:null};
      };
      return (...args)=>{if(key==='eq')filters[args[0]]=args[1];return q};
    }});return q;
  }};
  const d=load('src/lib/hardware/reader-diagnostics.ts');
  const server=load('src/lib/stripe-terminal.server.ts',{
    '@/lib/hardware/reader-diagnostics':d,'@/integrations/supabase/client.server':{supabaseAdmin:admin},
    '@/lib/pos/device.server':{verifyDeviceSecret:(input)=>input==='valid'},
    '@/lib/pos/authorization.server':{verifyPosGrant:()=>({userId:'employee-A',storeId:'store-A',deviceId:'device-A'})},
    '@/lib/stripe.server':{getStripeMode:()=> 'sandbox',createStripeClient:()=>({terminal:{connectionTokens:{create:async(body,options)=>{state.tokens.push(options.stripeAccount);if(state.failed)throw Error('sk_test_private acct_private');return {secret:'fixture-'+state.tokens.length}}}}})},
  });
  const nativeAuth={store_id:'store-A',device_id:'device-A',device_secret:'valid',caller_id:'employee-A',actor_token:'grant'};
  const route=load('src/routes/api/public/pos/stripe-terminal/connection-token.ts',{
    '@/lib/hardware/reader-diagnostics':d,'@tanstack/react-router':{createFileRoute:()=>x=>x},
    '@/lib/security/api-security.server':{guardApiRequest:async()=>null},'@/lib/stripe-terminal.server':server,
  }).Route;
  const send=()=>route.server.handlers.POST({request:new Request('https://fixture.invalid/api/public/pos/stripe-terminal/connection-token',{method:'POST',headers:{authorization:'Bearer cached-browser-B'},body:JSON.stringify({nativeAuth})})});
  return {state,server,nativeAuth,send,d};
}
test('server token authorization uses current pairing instead of cached bearer for another merchant',async()=>{
  const f=merchantServerFixture();const caller=await f.server.resolveStripeTerminalCaller({bearerToken:'cached-B',nativeAuth:f.nativeAuth});
  assert.equal(caller.storeId,'store-A');assert.equal(caller.deviceId,'device-A');assert.equal(f.state.browserAuthReads,0);
  const response=await f.send();assert.equal(response.status,200);assert.deepEqual(f.state.tokens,['acct_A']);
});
test('fresh token requests are uncached and malformed paired credentials never fall back to browser auth',async()=>{
  const f=merchantServerFixture();const a=await f.send(),b=await f.send();assert.notEqual((await a.json()).secret,(await b.json()).secret);assert.equal(a.headers.get('cache-control'),'no-store, private');
  await assert.rejects(f.server.resolveStripeTerminalCaller({bearerToken:'cached-B',nativeAuth:{...f.nativeAuth,store_id:'store-B'}}));assert.equal(f.state.browserAuthReads,0);
});
test('token endpoint failures return a safe authorization classification without Stripe secrets',async()=>{
  const f=merchantServerFixture();f.state.failed=true;const response=await f.send(),data=await response.json();assert.equal(response.status,400);assert.equal(data.code,'TOKEN');assert.equal(data.error,f.d.READER_MESSAGES.TOKEN);assert.ok(!JSON.stringify(data).includes('private'));
});
function heartbeatFixture() {
  const state={writes:[],valid:true,missing:false,diagnosticAttempts:0};
  const admin={from(table){let patch;const q=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve().then(()=>{
    if(table==='admin_device_diagnostics'){state.diagnosticAttempts++;if(state.missing)return {error:{code:'PGRST205'}};}
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
test('missing diagnostics table is throttled while normal heartbeats continue',async()=>{
  const f=heartbeatFixture();f.state.missing=true;assert.equal((await f.send()).status,200);assert.equal((await f.send()).status,200);assert.equal(f.state.diagnosticAttempts,1);assert.equal(f.state.writes.filter(w=>w.table==='device_registrations').length,2);
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
  const terminal=fs.readFileSync(path.join(base,'StripeTerminal.kt'),'utf8');assert.match(terminal,/SEZA_PATCH_DISCOVERY_FAILURE/);assert.match(terminal,/call.reject\("Stripe reader discovery failed", e.errorCode.toString\(\)\)/);
});
(async()=>{let failed=0;for(const [name,fn] of tests){try{await fn();console.log(`PASS ${name}`)}catch(e){failed++;console.error(`FAIL ${name}`,e)}}console.log(`${tests.length-failed}/${tests.length} M2 reliability checks passed`);if(failed)process.exitCode=1})()

