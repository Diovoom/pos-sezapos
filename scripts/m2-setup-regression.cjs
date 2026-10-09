// Isolated production modules, rendered UI, Stripe/API mocks. Never live writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.join(__dirname,'..');
function load(file,mocks={}){const js=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const m={exports:{}};new Function('require','module','exports',js)(k=>{if(k in mocks)return mocks[k];throw Error('Unmocked '+k)},m,m.exports);return m.exports;}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const id='3709ee54-8b69-4835-be87-b6c9dab616c2';
function fixture(){
 const store={id,name:'Store',address:'1 Main Street',city:'Naples',state:'FL',zip:'34101',country:'US',stripe_connect_status:'ready',stripe_terminal_location_id:'tml_current'};
 const account={id:'acct_fixture',livemode:true,charges_enabled:true,capabilities:{card_payments:'active'},requirements:{currently_due:[],past_due:[],pending_verification:[]}};
 const state={store,accountId:account.id,locationId:'tml_current',cardStatus:'active',environment:'live',account,reads:[],creates:[],writes:[],matches:true,locations:[],allow:true};
 const stripe={accounts:{retrieve:async(...args)=>{state.reads.push(args);if(state.accountError)throw state.accountError;return state.account}},terminal:{locations:{retrieve:async(...args)=>{state.locationRead=args;if(state.locationError)throw state.locationError;return {id:'tml_current'}},list:(...args)=>{state.listArgs=args;return {autoPagingToArray:async()=>state.locations}},create:async(...args)=>{state.creates.push(args);if(state.createError)throw state.createError;return {id:'tml_new'}}}}};
 const admin={from(table){assert.equal(table,'stores');const q={update(patch){state.writes.push(patch);return q},eq(k,v){(state.filters??=[]).push([k,v]);return q},is(k,v){return q.eq(k,v)},select(){return q},maybeSingle:async()=>({data:state.matches?{id}:null,error:state.saveError})};return q;}};
 const api=load('src/lib/stripe-reader-setup.server.ts',{'@/integrations/supabase/client.server':{supabaseAdmin:admin},'@/lib/stripe.server':{createStripeClient:()=>stripe},'@/lib/stripe-terminal.server':{loadStripeTerminalStore:async()=>state,requireStripeTerminalManager:async()=>{if(!state.allow)throw Error('denied')}}});
 return {state,api,run:()=>api.loadReaderSetup({storeId:id,userId:'owner',deviceId:'register'})};
}
test('ready account and valid location skip all setup, without database writes',async()=>{const f=fixture();assert.equal((await f.run()).step,'reader');assert.equal(f.state.writes.length,0);assert.equal(f.state.creates.length,0);assert.equal(f.state.reads[0][0],'acct_fixture');assert.equal(f.state.locationRead[2].stripeAccount,'acct_fixture');});
test('new store asks for Stripe before address',async()=>{const f=fixture();f.state.accountId='';f.state.store.address='';assert.equal((await f.run()).step,'connect_stripe');assert.equal(f.state.reads.length,0);});
test('verification comes before bank and address, then advances as requirements clear',async()=>{const f=fixture();f.state.account.requirements.currently_due=['company.tax_id','external_account'];assert.equal((await f.run()).step,'verification');f.state.account.requirements.currently_due=['external_account'];assert.equal((await f.run()).step,'bank');f.state.account.requirements.currently_due=[];assert.equal((await f.run()).step,'reader');});
test('future requirements never repeat completed onboarding',async()=>{const f=fixture();f.state.account.requirements.eventually_due=['company.tax_id'];assert.equal((await f.run()).step,'reader');});
test('pending Stripe review does not ask for documents again',async()=>{const f=fixture();f.state.account.charges_enabled=false;f.state.account.requirements.pending_verification=['company.tax_id'];assert.equal((await f.run()).step,'review');});
test('generic restriction does not invent address or bank requirement',async()=>{const f=fixture();f.state.account.charges_enabled=false;assert.equal((await f.run()).step,'retry');});
test('missing requirement data is unknown, never ready',async()=>{const f=fixture();delete f.state.account.requirements;assert.equal((await f.run()).step,'retry');});
test('Stripe outage does not overwrite account or request onboarding',async()=>{const f=fixture();f.state.accountError=Error('sk_live_private raw error');assert.equal((await f.run()).step,'retry');assert.equal(f.state.writes.length,0);});
test('wrong environment and deleted account never replaced',async()=>{for(const patch of [{livemode:false},{deleted:true},{id:'acct_other'}]){const f=fixture();Object.assign(f.state.account,patch);assert.equal((await f.run()).step,'retry');assert.equal(f.state.writes.length,0);}});
test('existing valid location remains usable if local address is incomplete',async()=>{const f=fixture();f.state.store.address='';assert.equal((await f.run()).step,'reader');});
test('missing location with absent address requests only address',async()=>{const f=fixture();f.state.store.stripe_terminal_location_id=null;f.state.locationId='';f.state.store.address=' ';assert.equal((await f.run()).step,'address');assert.equal(f.state.creates.length,0);});
test('address creates location scoped to account and saves verified readiness',async()=>{const f=fixture();f.state.store.stripe_terminal_location_id=null;f.state.locationId='';assert.equal((await f.run()).step,'reader');assert.equal(f.state.creates[0][1].stripeAccount,'acct_fixture');assert.equal(f.state.writes[0].stripe_terminal_location_id,'tml_new');assert.deepEqual(f.state.filters,[['id',id],['stripe_connected_account_id','acct_fixture'],['stripe_terminal_location_id',null]]);});
test('retries use stable location idempotency; changed account changes key',async()=>{const f=fixture();f.state.store.stripe_terminal_location_id=null;f.state.locationId='';await f.run();await f.run();assert.equal(f.state.creates[0][1].idempotencyKey,f.state.creates[1][1].idempotencyKey);f.state.account.id=f.state.accountId='acct_B';await f.run();assert.notEqual(f.state.creates[1][1].idempotencyKey,f.state.creates[2][1].idempotencyKey);});
test('recover previous location by merchant metadata without creating duplicate',async()=>{const f=fixture();f.state.locationError={statusCode:404};f.state.locations=[{id:'tml_other',metadata:{seza_store_id:'other'}},{id:'tml_recovered',metadata:{seza_store_id:id}}];assert.equal((await f.run()).step,'reader');assert.equal(f.state.writes[0].stripe_terminal_location_id,'tml_recovered');assert.equal(f.state.creates.length,0);});
test('transient location lookup never recreates or blames address',async()=>{const f=fixture();f.state.locationError={statusCode:503};assert.equal((await f.run()).step,'location');assert.equal(f.state.creates.length,0);assert.equal(f.state.writes.length,0);});
test('location creation error is safe and actionable',async()=>{const f=fixture();f.state.store.stripe_terminal_location_id=null;f.state.createError=Error('StripeClass sk_live_secret');assert.equal((await f.run()).step,'location');assert.equal(f.state.writes.length,0);});
test('database failure and concurrent account switch do not report ready',async()=>{for(const patch of [{matches:false},{saveError:{message:'private SQL'}}]){const f=fixture();f.state.store.stripe_terminal_location_id=null;Object.assign(f.state,patch);assert.equal((await f.run()).step,'retry');}});
test('cashier cannot run setup mutations',async()=>{const f=fixture();f.state.allow=false;await assert.rejects(f.run);assert.equal(f.state.reads.length,0);assert.equal(f.state.creates.length,0);});
const copy=load('src/lib/hardware/reader-setup.ts');
test('every setup action has fixed safe wording and only secure allowlisted navigation',()=>{for(const [step,item] of Object.entries(copy.READER_SETUP)){assert.ok(item.message&&item.action);const url=copy.readerSetupUrl(step,id);if(url){assert.equal(new URL(url).origin,'https://dashboard.sezapos.com');assert.equal(new URL(url).searchParams.get('readerStore'),id);}assert.ok(!/acct_|sk_|JSON|TokenProvider|Exception/.test(item.message));}});
const cache=new Map();global.sessionStorage={getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
const handoff=load('src/lib/hardware/reader-setup-return.ts');
test('owner login resumes exact setup step and store once',()=>{handoff.rememberReaderSetupReturn('?readerSetup=bank&readerStore='+id);assert.deepEqual(handoff.consumeReaderSetupReturn(),{section:'payments',readerSetup:'bank',readerStore:id});assert.equal(handoff.consumeReaderSetupReturn(),null);});
test('external redirects, malformed merchant IDs, and expired intents are rejected',()=>{for(const query of ['?readerSetup=https://evil.test&readerStore='+id,'?readerSetup=bank&readerStore=other'])assert.equal(handoff.parseReaderSetupReturn(query),null);cache.set('seza.readerSetupReturn',JSON.stringify({expires:0,target:{readerSetup:'bank',readerStore:id}}));assert.equal(handoff.consumeReaderSetupReturn(),null);});
function renderPanel({step='reader',connected=false,serial=null,contextError=false,canEdit=true,paired=true}={}){
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const buttons=[];let mutation,mutations=[];const calls=[];
 const terminal=serial?{id:'terminal',serial,config:{}}:null;
 const panel=load('capacitor-shell/stubs/PaymentTerminalsPanel.tsx',{
  react:React,'react/jsx-runtime':require('react/jsx-runtime'),
  '@tanstack/react-query':{useQuery:({queryKey})=>queryKey[0]==='stripe-terminal-context'?{isError:contextError,error:Error('sk_live_raw'),data:{terminals:[]}}:queryKey[0]==='stripe-reader-ready'?{data:connected,isSuccess:true}:queryKey[0]==='stripe-reader-setup'?{data:{step}}:{},useQueryClient:()=>({setQueryData(){}}),useMutation:options=>{mutation=options;return {mutate:a=>mutations.push(a),isPending:false}}},
  'lucide-react':Object.fromEntries(['Loader2','RefreshCw','Unplug','Wifi'].map(k=>[k,()=>null])),sonner:{toast:{}},'@/lib/hardware':{setActiveTerminal:v=>calls.push(['active',v])},
  '@/lib/hardware/terminal-stripe':{selectedStripeTerminal:()=>terminal,getStripeReaderConnectionMethod:()=>null,getStripeTerminalContext:async()=>({terminals:terminal?[terminal]:[]}),getStripeReaderSetup:async()=>({step}),disconnect:async o=>calls.push(['disconnect',o]),connectReader:async(d,cb,o)=>calls.push(['connect',d,o]),isReady:async()=>true,updateStripeTerminal:async(...args)=>calls.push(['update',...args]),clearStripeReaderConnectionMethod:v=>calls.push(['clear',v])},
  '@/lib/hardware/reader-diagnostics':load('src/lib/hardware/reader-diagnostics.ts'),'@/lib/pos/payment-terminal':{setActivePaymentProvider:v=>calls.push(['provider',v])},'@/lib/device-control':{},
  '@/lib/hardware/reader-setup':copy,'@/hooks/useMe':{useMe:()=>({data:{user:{id:'owner'}}})},'../lib/pairing':{getPairing:()=>paired?{storeId:id,deviceId:'register'}:null},
  '@/components/ui/button':{Button:({children,...props})=>{buttons.push({children,...props});return React.createElement('button',{'disabled':props.disabled},children)}}
 }).PaymentTerminalsPanel;
 return {html:renderToStaticMarkup(React.createElement(panel,{canEdit})),buttons,mutation,mutations,calls};
}
for(const step of ['connect_stripe','verification','bank','review','address','location','retry','reader'])test('renders only the current missing step: '+step,()=>{const {html}=renderPanel({step});assert.ok(html.includes(copy.READER_SETUP[step].message.replaceAll('’','’')));for(const [other,item] of Object.entries(copy.READER_SETUP))if(other!==step)assert.ok(!html.includes(item.message));assert.ok(!/sk_live|bg-gradient|<Card/.test(html));});
test('connected reader shows status without setup instructions',()=>{const {html}=renderPanel({connected:true,serial:'M2_fixture',step:'bank'});assert.ok(html.includes('Connected'));for(const item of Object.values(copy.READER_SETUP))assert.ok(!html.includes(item.message));assert.ok(html.includes('Test reader'));});
test('saved disconnected reader does not show first-time instructions',()=>{const {html}=renderPanel({serial:'M2_fixture'});assert.ok(html.includes('Reader configured'));assert.ok(!html.includes('get started'));assert.ok(html.includes('Reconnect'));});
test('cashier sees no Stripe account instructions or technical errors',()=>{const {html}=renderPanel({canEdit:false,step:'bank',contextError:true});assert.ok(!html.includes('sk_live'));assert.ok(!html.includes(copy.READER_SETUP.bank.message));assert.ok(html.includes('owner or manager'));});
test('unpaired register does not suggest merchant setup',()=>{const {html}=renderPanel({paired:false,step:'verification'});assert.ok(html.includes('Pair this register'));assert.ok(!html.includes(copy.READER_SETUP.verification.message));});
test('double USB tap is serialized before asynchronous work starts',()=>{const f=renderPanel();const button=f.buttons.find(b=>b.onClick&&!b.disabled);button.onClick();button.onClick();assert.deepEqual(f.mutations,['usb']);});
for (const action of ['usb','bluetooth','reconnect','test']) test('button invokes existing native flow: '+action,async()=>{
 const f=renderPanel({serial:'M2_fixture'});const message=await f.mutation.mutationFn(action);
 assert.ok(message.includes('connected'));
 const connection=f.calls.find(c=>c[0]==='connect');assert.equal(connection[1],'stripe-m2');assert.equal(connection[2].method,action==='bluetooth'?'bluetooth':'usb');
 assert.equal(f.calls.filter(c=>c[0]==='disconnect').length,action==='test'?0:1);
 if(action==='test')assert.ok(message.includes('No payment was taken'));
});
test('missing requirement prevents native discovery and disconnect on fresh setup',async()=>{const f=renderPanel({step:'verification'});assert.equal(await f.mutation.mutationFn('usb'),copy.READER_SETUP.verification.message);assert.deepEqual(f.calls,[]);});
test('forget removes only the selected reader and clears local selection',async()=>{
 global.localStorage={removeItem:k=>{}};global.window={dispatchEvent:()=>{}};
 const f=renderPanel({serial:'M2_fixture'});await f.mutation.mutationFn('forget');assert.deepEqual(f.calls.find(c=>c[0]==='update'),['update','remove','terminal']);assert.ok(f.calls.some(c=>c[0]==='active'&&c[1]==='none'));
});
test('setup context route authenticates before setup and isolates existing context branch',async()=>{
 const steps=[];let failAuth=false;
 const route=load('src/routes/api/public/pos/stripe-terminal/context.ts',{
  '@tanstack/react-router':{createFileRoute:()=>v=>v},'@/lib/hardware/reader-diagnostics':load('src/lib/hardware/reader-diagnostics.ts'),
  '@/lib/security/api-security.server':{guardApiRequest:async()=>null},
  '@/lib/stripe-terminal.server':{resolveStripeTerminalCaller:async()=>{steps.push('auth');if(failAuth)throw Object.assign(Error('secret'),{code:'SESSION'});return {storeId:id}},loadStripeTerminalStore:async()=>{throw Error('legacy context should not run')}},
  '@/lib/stripe-reader-setup.server':{loadReaderSetup:async caller=>{steps.push('setup');assert.equal(caller.storeId,id);return {step:'bank',checkedAt:'2026-10-08T00:00:00Z'}}}
 }).Route;
 const request=()=>new Request('https://sezapos.com/api/public/pos/stripe-terminal/context',{method:'POST',body:JSON.stringify({setup:true,nativeAuth:{}})});
 const response=await route.server.handlers.POST({request:request()});assert.deepEqual(steps,['auth','setup']);assert.equal((await response.json()).setup.step,'bank');assert.ok(response.headers.get('cache-control').includes('no-store'));
 failAuth=true;steps.length=0;const denied=await route.server.handlers.POST({request:request()});assert.equal(denied.status,401);assert.deepEqual(steps,['auth']);assert.ok(!(await denied.text()).includes('secret'));
});
(async()=>{let failed=0;for(const [name,fn] of tests){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name,e)}}console.log(`${tests.length-failed}/${tests.length} M2 setup checks passed`);if(failed)process.exitCode=1;})();
