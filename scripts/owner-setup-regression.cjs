// Production modules with isolated database/auth fixtures. No live writes or emails.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, mocks = {}, extra = '') {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8') + extra, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', js)(k => { if (k in mocks) return mocks[k]; throw Error('Unmocked ' + k); }, m, m.exports);
  return m.exports;
}
const legal = load('src/lib/legal/config.ts'), disposable = load('src/lib/security/disposable-email.ts');
const model = load('src/lib/setup/model.ts', { '@/lib/legal/config': legal, '@/lib/security/disposable-email': disposable });
const clone = o => structuredClone(o), tests = [];
const test = (name, run) => tests.push([name, run]);
function valid() {
  const s = model.DEFAULT_STATE();
  Object.assign(s.owner, { first_name: 'Owner', last_name: 'Example', email: 'owner@example.com', accepted_terms: true, terms_version: legal.LEGAL_CONFIG.termsVersion, privacy_version: legal.LEGAL_CONFIG.privacyVersion });
  s.store.name = 'Fixture Store'; return s;
}
function fixture() {
  const db = { stores: [{ id: 'store-A', name: 'Original', setup_state: {}, setup_completed_at: null, stripe_connected_account_id: 'untouched', business_hours: { monday: 'existing' } }], profiles: [{ id: 'owner', store_id: 'store-A', status: 'active', email: 'owner@example.com' }], user_roles: [{ user_id: 'owner', store_id: 'store-A', role: 'owner' }], products: [], legal_acceptances: [] };
  const calls = [], f = { db, calls, fail: null, invites: 0, legal: 0 };
  const admin = { from(table) {
    let op = 'read', patch, filters = [], range;
    const q = { select() { return q; }, update(p) { op = 'update'; patch = p; return q; }, upsert(p) { op = 'upsert'; patch = p; return q; }, eq(k,v) { filters.push([k,v]); return q; }, is(k,v) { return q.eq(k,v); }, order() { return q; }, range(a,b) { range = [a,b]; return q; }, maybeSingle() { return run(true); }, single() { return run(true); }, then(a,b) { return run(false).then(a,b); } };
    async function run(single) {
      calls.push({ table, op, patch: clone(patch), filters: clone(filters) });
      if (f.fail === `${table}:${op}`) return { data: null, error: Error('private database details') };
      let rows = db[table].filter(row => filters.every(([k,v]) => k === 'setup_state' && typeof v === 'string' ? JSON.stringify(row[k]) === v : row[k] === v));
      if (op === 'update') rows.forEach(row => Object.assign(row, clone(patch)));
      if (op === 'upsert') { for (const row of patch) if (!db[table].some(p => p.id === row.id)) db[table].push(clone(row)); rows = []; }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: clone(single ? rows[0] ?? null : rows), error: null };
    }
    return q;
  } };
  const context = { userId: 'owner', supabase: { rpc: async (name, args) => { assert.equal(name, 'record_legal_acceptance'); f.legal++; db.legal_acceptances.push({ user_id: 'owner', store_id: 'store-A', terms_version: args.p_terms_version, privacy_version: args.p_privacy_version, accepted_at: args.p_accepted_at }); return { error: null }; } } };
  const api = load('src/lib/setup/setup.server.ts', { '@/integrations/supabase/client.server': { supabaseAdmin: admin }, './model': model, '@/lib/legal/config': legal, '@/lib/employees.functions': { createEmployeeForOwner: async (data,ctx,retry) => { assert.equal(data.expectedStoreId, 'store-A'); assert.equal(ctx, context); assert.equal(retry, true); if (f.inviteError) throw Error('Employee invitation could not be sent. Try again.'); if (!f.invites) f.invites++; } } });
  const data = { actorId: 'owner', storeId: 'store-A', revision: null, state: valid() };
  return Object.assign(f, { admin, context, api, data, save: () => api.saveSetup(context, data), finish: () => api.finishSetup(context, data) });
}
test('hydration preserves real address, receipts, tax, owner and currency', () => {
 const s = model.hydrateSetup({ name: 'Existing', address: '1 Main St', city: 'Miami', email: 'store@example.com', tax_rate: .075, tax_inclusive: true, receipt_footer: 'Keep', receipt_logo_url: 'https://example.com/logo', currency: 'CAD', social_links: { instagram: 'keep' } }, { first_name: 'Existing owner', email: 'current@example.com' }, { store: { phone: 'draft' } });
 assert.equal(s.store.address, '1 Main St'); assert.equal(s.receipt.footer, 'Keep'); assert.equal(s.tax.rate, 7.5); assert.equal(s.tax.inclusive,true); assert.equal(s.owner.email,'current@example.com'); assert.equal(s.store.phone,'draft'); assert.equal(s.receipt.social.instagram,'keep');
});
test('CSV quoted commas, escaped quotes, CRLF and BOM parse and validate', () => {
 const s = valid(); s.products = { mode:'import', items:[], csv:'\ufeffname,sku,price,stock\r\n"Large, \"\"Blue\"\"",ABC,2.50,3\r\n' };
 assert.deepEqual(model.setupProducts(s), [{name:'Large, "Blue"',sku:'ABC',price:2.5,stock:3}]);
});
for (const csv of ['name,price\nA,NaN','name,price\nA,-1','name,price\nA,0x10','name,price\nA,1.001','name,price\n"A,1','name,price\nA,1,extra','sku,price\nA,1','name,price,price\nA,1,2','name,price,secret\nA,1,x','name,sku,price\nA,X,1\nB,x,2','name,price\nA,1\na,2']) test('invalid CSV rejected: '+JSON.stringify(csv), () => { const s=valid(); s.products={mode:'import',items:[],csv}; assert.throws(()=>model.setupProducts(s)); });
test('each required step validates, optional skips preserve entered data', () => {
 const s=valid(); assert.equal(model.validateSetup(s),null); s.owner.first_name=''; assert.equal(model.validateSetup(s).step,1); s.owner.first_name='Owner'; s.store.name=''; assert.equal(model.validateSetup(s).step,2); s.store.name='Store'; s.tax.rate=101; assert.equal(model.validateSetup(s).step,3); s.tax.rate=0; s.employee.skip=false; assert.equal(model.validateSetup(s).step,5); s.employee.skip=true; s.products.mode='manual'; assert.equal(model.validateSetup(s).step,6);
});
test('allowlisted settings never modify Stripe, billing or unknown store fields', () => {
 const s=valid(); s.store.stripe_connected_account_id='attacker'; s.store.plan_tier='enterprise'; s.receipt.social.instagram='new'; const clean=model.cleanSetup(s); const patch=model.setupStorePatch(clean,{social_links:{other:'keep'},business_hours:{monday:'keep'}}); assert.equal(patch.stripe_connected_account_id,undefined); assert.equal(patch.plan_tier,undefined); assert.equal(patch.business_hours.monday,'keep'); assert.equal(patch.social_links.other,'keep'); assert.equal(patch.tax_rate,0);
});
test('draft saves only setup_state, not products, profile, legal or real settings', async () => { const f=fixture(); f.data.state.store.name='Draft'; const r=await f.save(); assert.ok(r.revision); assert.equal(f.db.stores[0].name,'Original'); assert.equal(f.legal,0); assert.equal(f.invites,0); assert.deepEqual(Object.keys(f.calls.find(c=>c.op==='update').patch),['setup_state']); });
test('returning owner restores saved draft and legal acceptance without writes',async()=>{const f=fixture();const r=await f.save();f.calls.length=0;const result=await f.api.readSetup(f.context,f.data);assert.equal(result.revision,r.revision);assert.equal(result.state.store.name,'Fixture Store');assert.ok(f.calls.every(c=>c.op==='read'));});
for(const kind of ['actor','store','role','disabled'])test('rejects '+kind+' scope before mutation',async()=>{const f=fixture();if(kind==='actor')f.data.actorId='other';if(kind==='store')f.data.storeId='store-B';if(kind==='role')f.db.user_roles=[];if(kind==='disabled')f.db.profiles[0].status='disabled';await assert.rejects(f.finish,/SETUP_SCOPE/);assert.ok(f.calls.every(c=>c.op==='read'));});
test('stale revision rejected; parallel saves only one succeeds',async()=>{const f=fixture();const results=await Promise.allSettled([f.save(),f.save()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/SETUP_CONFLICT/);});
test('CSV completion actually inserts rows, saves settings, and completes once',async()=>{const f=fixture();f.data.state.products={mode:'import',items:[],csv:'name,sku,price,stock\nCoffee,C,2.5,20'};f.data.state.tax.rate=8.25;f.data.state.receipt.header='Welcome';await f.finish();assert.equal(f.db.products.length,1);assert.equal(f.db.products[0].store_id,'store-A');assert.equal(f.db.products[0].stock,20);assert.equal(f.db.stores[0].tax_rate,.0825);assert.equal(f.db.stores[0].receipt_header,'Welcome');assert.equal(f.db.stores[0].stripe_connected_account_id,'untouched');assert.ok(f.db.stores[0].setup_completed_at);await f.finish();assert.equal(f.db.products.length,1);assert.equal(f.legal,1);});
test('simultaneous Finish requests cannot duplicate actions',async()=>{const f=fixture();f.data.state.products={mode:'manual',csv:'',items:[{name:'A',sku:'A',price:1,stock:2}]};const result=await Promise.allSettled([f.finish(),f.finish()]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.db.products.length,1);assert.equal(f.legal,1);});
test('partial completion retries do not duplicate products or legal acceptance',async()=>{const f=fixture();f.data.state.products={mode:'manual',csv:'',items:[{name:'A',sku:'A',price:1,stock:2}]};f.data.state.employee={skip:false,first_name:'Staff',last_name:'Member',email:'staff@example.com',phone:'',role:'cashier'};f.inviteError=true;await assert.rejects(f.finish,/invitation/);assert.equal(f.db.products.length,1);assert.equal(f.db.stores[0].setup_completed_at,null);f.inviteError=false;await f.finish();assert.equal(f.db.products.length,1);assert.equal(f.invites,1);assert.equal(f.legal,1);});
test('existing products after first database page are preserved without duplicates',async()=>{const f=fixture();f.db.products=Array.from({length:501},(_,i)=>({id:String(i),store_id:'store-A',sku:'sku'+i,name:'P'+i,price:99,stock:88}));f.data.state.products={mode:'manual',csv:'',items:[{name:'Renamed',sku:'SKU500',price:1,stock:2}]};const r=await f.finish();assert.equal(f.db.products.length,501);assert.equal(f.db.products[500].stock,88);assert.equal(r.skipped,1);});
for(const stage of ['products:upsert','profiles:update'])test('failed '+stage+' leaves setup incomplete and retryable',async()=>{const f=fixture();f.data.state.products={mode:'manual',csv:'',items:[{name:'A',sku:'A',price:1,stock:2}]};f.fail=stage;await assert.rejects(f.finish);assert.equal(f.db.stores[0].setup_completed_at,null);assert.equal(f.db.stores[0].setup_state._lock,undefined);f.fail=null;await f.finish();assert.equal(f.db.products.length,1);assert.ok(f.db.stores[0].setup_completed_at);});
test('safe errors hide raw database, secrets and JSON; rate limit remains understandable',()=>{for(const message of ['PGRST302 internal','{"token":"secret"}','SQL stack trace','sk_live_private'])assert.equal(model.setupError(Error(message)),'Setup could not be saved. Your draft is kept on this device. Check your connection and try again.');assert.match(model.setupError(Error('RATE_LIMITED')),/wait a moment/);});
// Exercise the real secure employee invitation helper used by completion.
function employeeFixture() {
 const f={profiles:[{id:'owner',store_id:'store-A',email:'owner@example.com',status:'active'}],invites:[],provisions:[],deleted:[],limit:0};
 const builder={middleware(){return builder},inputValidator(){return builder},handler(fn){return fn}};
 const admin={from(table){assert.equal(table,'profiles');const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>({data:f.profiles.find(p=>filters.every(([k,v])=>p[k]===v))??null})};return q},auth:{admin:{inviteUserByEmail:async(email,options)=>{f.invites.push({email,options});return {data:{user:{id:'staff'}}}},deleteUser:async id=>f.deleted.push(id)}},rpc:async(name,args)=>{assert.equal(name,'provision_invited_employee');f.provisions.push(args);if(f.provisionError)return {error:Error('provision failed')};f.profiles.push({id:'staff',store_id:args.p_store_id,email:f.invites[0].email,status:'active',employee_id:'123456'});return {error:null}}};
 const api=load('src/lib/employees.functions.ts',{'@tanstack/react-start':{createServerFn:()=>builder},'@/lib/security/rate-limit':{},'@/integrations/supabase/auth-middleware':{},'@/integrations/supabase/client.server':{supabaseAdmin:admin},'@/lib/billing/plan-entitlements.server':{getStorePlanUsage:async()=>({employees:0}),assertStoreResourceLimit:async()=>{f.limit++;if(f.limitError)throw Error('The store plan has no employee seats available.')}}});
 const context={userId:'owner',supabase:{rpc:async()=>({data:!f.denied})}};
 const data={expectedActorId:'owner',expectedStoreId:'store-A',first_name:'Staff',last_name:'Member',email:'staff@example.com',role:'cashier'};
 return Object.assign(f,{data,run:()=>api.createEmployeeForOwner(data,context,true)});
}
test('secure invitation creates no password and retry never resends the invitation',async()=>{const f=employeeFixture();await f.run();await f.run();assert.equal(f.invites.length,1);assert.equal(f.provisions.length,1);assert.equal(f.provisions[0].p_store_id,'store-A');assert.equal(f.provisions[0].p_role,'cashier');assert.ok(!JSON.stringify(f.invites[0]).includes('"password":'));assert.ok(f.invites[0].options.redirectTo.endsWith('/reset-password'));});
test('employee plan limit and authorization are enforced before sending email',async()=>{for(const kind of ['denied','limitError']){const f=employeeFixture();f[kind]=true;await assert.rejects(f.run);assert.equal(f.invites.length,0);}});
test('existing email in another store cannot be attached or invited',async()=>{const f=employeeFixture();f.profiles.push({id:'other',email:'staff@example.com',store_id:'store-B',status:'active'});await assert.rejects(f.run,/already has an account/);assert.equal(f.invites.length,0);assert.equal(f.provisions.length,0);});
test('provisioning failure uses existing orphan cleanup and never reports success',async()=>{const f=employeeFixture();f.provisionError=true;await assert.rejects(f.run);assert.deepEqual(f.deleted,['staff']);});
// Render all wizard steps and exercise their actual event handlers without a browser session.
const React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
function ui(step, edits=false) {
 const s=valid();s.step=step; let current=clone(s), stateIndex=0,refIndex=0, writes=0; const buttons=[],links=[];
 const stateValues=[s,true,false,false,'','Draft saved',false];
 const refs=[null,edits?'old':JSON.stringify({...s,step:0}),s,null,false,false];
 const primitive=tag=>({children,onClick,...p})=>{if(tag==='button')buttons.push({children,onClick,...p}); return React.createElement(tag,{...Object.fromEntries(Object.entries(p).filter(([k])=>!['asChild','variant','size','onValueChange','onCheckedChange'].includes(k))),onClick},children);};
 const mocks={react:{...React,useState:init=>{const i=stateIndex++;return [i<stateValues.length?stateValues[i]:(typeof init==='function'?init():init),v=>{if(i===0)current=typeof v==='function'?v(current):v;}];},useRef:()=>({current:refs[refIndex++]}),useEffect:()=>{}},'react/jsx-runtime':require('react/jsx-runtime'),'@tanstack/react-start':{useServerFn:fn=>fn},'@tanstack/react-router':{createFileRoute:()=>()=>({}),Link:({to,children,...p})=>{links.push(to);return React.createElement('a',{href:to,...p},children)},useNavigate:()=>()=>{}},'@tanstack/react-query':{useQuery:()=>({data:{state:s,revision:null}}),useQueryClient:()=>({invalidateQueries:async()=>{}})},'@/lib/setup/model':model,'@/lib/setup/setup.functions':{getOwnerSetup:async()=>{},saveOwnerSetup:async()=>{writes++;return {revision:'next'}},finishOwnerSetup:async()=>{writes++;return {completed:true}}},'@/integrations/supabase/client':{supabase:{}},'@/hooks/useMe':{useMe:()=>({})},'sonner':{toast:{}},'@/lib/utils':{cn:(...a)=>a.filter(x=>typeof x==='string').join(' ')},'@/hooks/useLocale':{useCountryList:()=>({data:[{country_code:'US',country_name:'United States'}]})},'@/lib/legal/config':legal,'@/lib/security/disposable-email':disposable,'@/lib/errors/user-facing':{userFacingError:model.setupError}};
 for(const [file,names,tag] of [['button',['Button'],'button'],['input',['Input'],'input'],['label',['Label'],'label'],['textarea',['Textarea'],'textarea'],['switch',['Switch'],'input'],['checkbox',['Checkbox'],'input'],['select',['Select','SelectContent','SelectItem','SelectTrigger','SelectValue'],'div'],['tabs',['Tabs','TabsList','TabsTrigger','TabsContent'],'div']])mocks['@/components/ui/'+file]=Object.fromEntries(names.map(n=>[n,primitive(tag)]));
 mocks['lucide-react']=new Proxy({},{get:()=>()=>null});
 const {ScopedSetup}=load('src/routes/_dashboard/setup.tsx',mocks,'\nexport { ScopedSetup };');
 const html=renderToStaticMarkup(React.createElement(ScopedSetup,{actorId:'owner',storeId:'store-A'}));
 return {html,buttons,links,state:()=>current,writes:()=>writes};
}
for(let step=0;step<12;step++)test('wizard step '+step+' renders without technical errors',()=>{const f=ui(step);assert.ok(f.html.includes('owner-setup'));assert.ok(!/undefined|PGRST|RATE_LIMITED/.test(f.html));if(step<11)assert.ok(f.links.includes('/help'));if(step===11)assert.ok(f.links.includes('/devices'));});
test('Back, Continue and Review do not write, including repeated navigation',()=>{const f=ui(10);for(const b of f.buttons.filter(b=>b.onClick&&String(b.children).includes('Store')))b.onClick(); const back=f.buttons.find(b=>Array.isArray(b.children)&&b.children.includes('Back'));if(back)for(let i=0;i<20;i++)back.onClick();assert.equal(f.writes(),0);});
test('unchanged explicit Save draft makes no request',async()=>{const f=ui(2);await f.buttons.find(b=>b.children==='Save draft').onClick();assert.equal(f.writes(),0);});
test('setup excludes floating support; dismissal and position are scoped to account',()=>{const shell=fs.readFileSync(path.join(root,'src/components/pos/AppShell.tsx'),'utf8');assert.match(shell,/pathname !== "\/setup"/);assert.match(shell,/seza\.owner\.support:\$\{me\?\.user.id/);assert.match(shell,/localStorage.setItem\(`\$\{supportScope\}:dismissed`/);assert.ok(!shell.includes('seza.owner.support-bubble.position'));const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');assert.match(css,/@media \(pointer: coarse\)/);assert.match(css,/font-size: 16px !important/);assert.ok(!/user-scalable:\s*no|maximum-scale:\s*1/.test(css));});
(async()=>{for(const [name,run] of tests){try{await run();console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}console.log(`${tests.length} owner setup regressions passed`);})().catch(e=>{console.error(e);process.exitCode=1;});
