// Isolated web regression tests. No network, real messages, or database writes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const tests = [];
const compareBaseline = process.argv.includes('--compare-main');
const test = (name, run) => tests.push([name, run]);
function source(file, baseline = false) {
  return baseline ? execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8');
}
function load(file, mocks = {}, extra = '', baseline = false) {
  const js = ts.transpileModule(source(file, baseline) + extra, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => {
    if (name in mocks) return mocks[name];
    throw Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const serverFn = () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn) => fn };
  return builder;
};
function backend() {
  const state = {
    ticket: { id: 'ticket-A', store_id: 'store-A', status: 'open', last_merchant_read_at: null, last_admin_read_at: null },
    notes: [{ id: 'note-1', body: 'Reply', internal: false, created_at: '2026-01-01T10:00:00.000Z' }],
    writes: 0, role: 'support_admin', failNotes: false, failMarker: false, failEvents: false,
  };
  const admin = { auth: { getUser: async () => ({ data: { user: { id: 'user-A', email: 'fixture@example.invalid' } } }) },
    from(table) {
      let update, filters = [], condition;
      const chain = new Proxy({}, { get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve().then(() => {
          if (update) {
            if (state.failMarker) return { error: { message: 'marker unavailable' } };
            const [field, stamp] = Object.entries(update)[0];
            const matches = filters.every(([key, value]) => state.ticket[key] === value);
            if (matches && (!condition || !state.ticket[field] || state.ticket[field] < stamp)) {
              state.writes++;
              Object.assign(state.ticket, update);
            }
            return { data: null, error: null };
          }
          if (table === 'profiles') return { data: { id: 'user-A', store_id: 'store-A', status: 'active' }, error: null };
          if (table === 'user_roles') return { data: [{ role: state.role }], error: null };
          if (table === 'support_tickets') return { data: filters.every(([k,v]) => state.ticket[k] === v) ? { ...state.ticket } : null, error: null };
          if (table === 'support_ticket_notes') return state.failNotes ? { data: null, error: { message: 'notes unavailable' } } : { data: state.notes.map(n => ({ ...n })), error: null };
          if (table === 'support_ticket_events' && state.failEvents) return { data: null, error: { code: '42P01', message: 'Optional events table is absent' } };
          return { data: [], error: null };
        }).then(resolve, reject);
        return (...args) => {
          if (prop === 'update') update = args[0];
          if (prop === 'eq') filters.push(args);
          if (prop === 'or') condition = args[0];
          return chain;
        };
      }});
      return chain;
    },
  };
  const mocks = {
    '@tanstack/react-start': { createServerFn: serverFn },
    '@/integrations/supabase/auth-middleware': { requireSupabaseAuth: {} },
    '@/lib/security/rate-limit': { authenticatedWriteRateLimit: {} },
    '@/integrations/supabase/client.server': { supabaseAdmin: admin },
  };
  return { state, admin, mocks, context: { userId: 'user-A', supabase: admin } };
}
test('Admin background case fetch no longer writes read state', async () => {
  const b = backend(); b.state.ticket.store_id = null;
  const api = load('src/lib/admin/company-admin.functions.ts', b.mocks);
  await api.adminGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context });
  await api.adminGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context });
  assert.equal(b.state.writes, 0);
});
test('Admin transcript failure is an error, not an empty conversation', async () => {
  const b = backend(); b.state.ticket.store_id = null; b.state.failNotes = true;
  const api = load('src/lib/admin/company-admin.functions.ts', b.mocks);
  await assert.rejects(api.adminGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context }), /notes unavailable/);
});
test('absent optional Admin event table does not prevent opening the real transcript', async () => {
  const b = backend(); b.state.ticket.store_id = null; b.state.failEvents = true;
  const api = load('src/lib/admin/company-admin.functions.ts', b.mocks);
  const result = await api.adminGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context });
  assert.equal(result.messages[0].body, 'Reply'); assert.deepEqual(result.events, []);
});
test('Admin displayed-message marker is idempotent and preserves newer unread replies', async () => {
  const b = backend(); const api = load('src/lib/admin/company-admin.functions.ts', b.mocks);
  const readThrough = b.state.notes[0].created_at;
  b.state.notes.push({ id: 'note-2', created_at: '2026-01-01T10:01:00.000Z' });
  for (let i = 0; i < 3; i++) await api.adminMarkCommunicationRead({ data: { ticketId: 'ticket-A', readThrough }, context: b.context });
  assert.equal(b.state.writes, 1);
  assert.ok(b.state.ticket.last_admin_read_at < b.state.notes[1].created_at);
  await api.adminMarkCommunicationRead({ data: { ticketId: 'ticket-A' }, context: b.context });
  assert.equal(b.state.writes, 1);
});
test('merchant cannot execute Admin support reads or read markers', async () => {
  const b = backend(); b.state.role = 'owner';
  const api = load('src/lib/admin/company-admin.functions.ts', b.mocks);
  for (const method of ['adminGetSupportCase', 'adminMarkCommunicationRead']) {
    await assert.rejects(api[method]({ data: { ticketId: 'ticket-A' }, context: b.context }), /Forbidden/);
  }
  assert.equal(b.state.writes, 0);
});
test('Admin read watermark retains database microseconds and rejects malformed timestamps', async () => {
  const b = backend(); const api = load('src/lib/admin/company-admin.functions.ts', b.mocks);
  const readThrough = '2026-01-01T10:00:00.123456+00:00';
  await api.adminMarkCommunicationRead({ data: { ticketId: 'ticket-A', readThrough }, context: b.context });
  assert.equal(b.state.ticket.last_admin_read_at, readThrough);
  for (const invalid of ['2026', 'not-a-date', '2999-01-01T00:00:00Z']) {
    await assert.rejects(api.adminMarkCommunicationRead({ data: { ticketId: 'ticket-A', readThrough: invalid }, context: b.context }), /Invalid read marker/);
  }
});

// Render route components with controlled hooks. Their real callbacks execute;
// UI libraries and server boundaries are stubbed, not merchant records.
function ui(file, extra = '', baseline = false) {
  const state = [], refs = [], effects = [], calls = []; let cursor = 0, refCursor = 0;
  const control = { pathname: '/help/ticket-A', ticketId: 'ticket-A', query: () => ({ data: undefined, isLoading: false }), server: async () => ({}) };
  global.window = { location: { host: 'sezapos.com' }, localStorage: { getItem: () => 'ticket-A' }, confirm: () => true };
  const generic = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
  const React = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
    useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
    useEffect: fn => effects.push(fn), useMemo: fn => fn(),
  };
  const mocks = {
    react: React,
    'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    '@tanstack/react-router': { createFileRoute: () => options => ({ options, useParams: () => ({ ticketId: control.ticketId }) }), Link: 'Link', Outlet: 'Outlet', useNavigate: () => () => {}, useSearch: () => ({}), useRouterState: ({ select }) => select({ location: { pathname: control.pathname } }) },
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }), useQuery: options => control.query(options), useMutation: () => ({}) },
    '@tanstack/react-start': { useServerFn: name => (...args) => { calls.push([name, ...args]); return control.server(name, ...args); } },
    '@/hooks/useMe': { useMe: () => ({ data: { user: { id: 'A' }, store: { id: 'store-A' } } }) },
    '@/hooks/useFloatingPosition': { useFloatingPosition: () => ({}) },
    '@/lib/security/disposable-email': { isDisposableEmail: () => false },
    '@/lib/host': load('src/lib/host.ts'),
    '@/lib/plans': load('src/lib/plans.ts'),
    zod: require('zod'),
    sonner: { toast: { error() {}, success() {} } },
    'date-fns': { format: () => 'date', formatDistanceToNow: () => 'now' },
  };
  const contents = source(file, baseline) + extra;
  const imports = [...contents.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
  for (const name of imports) mocks[name] ??= generic;
  const module = load(file, mocks, extra, baseline);
  return { module, state, effects, calls, control, render(fn) { cursor = 0; refCursor = 0; effects.length = 0; return fn(); } };
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
test('closed Admin bubble does not fetch and mark an unseen conversation', () => {
  const h = ui('src/components/admin/AdminPersistentChat.tsx');
  let enabled;
  h.control.query = options => { if (options.queryKey[0] === 'admin_support_case') enabled = options.enabled; return { data: undefined }; };
  h.render(h.module.AdminPersistentChat); assert.equal(enabled, false);
});
test('Admin communication draft stays with its ticket, including a late send response', async () => {
  const h = ui('src/routes/_adminApp/admin.communications.tsx');
  h.control.query = ({ queryKey }) => queryKey[0] === 'admin_support_case' ? { data: { ticket: { id: queryKey[1], status: 'open' }, messages: [] } } : { data: { rows: [] } };
  const render = () => h.render(h.module.Route.options.component);
  const draft = () => nodes(render()).find(n => n.type === 'Textarea');
  draft().props.onChange({ target: { value: 'For A only' } });
  let done; h.control.server = () => new Promise(resolve => { done = resolve; });
  const sendButton = nodes(render()).find(n => n.type === 'Button' && n.props.onClick?.name === 'sendReply');
  const first = sendButton.props.onClick(); const second = sendButton.props.onClick();
  assert.equal(h.calls.length, 1);
  h.state[2] = 'ticket-B'; assert.equal(draft().props.value, '');
  draft().props.onChange({ target: { value: 'For B only' } });
  done({}); await Promise.all([first, second]); assert.equal(draft().props.value, 'For B only');
  h.state[2] = 'ticket-A'; assert.equal(draft().props.value, '');
});


function workflowBackend() {
  const tables = {
    support_tickets: [{ id: 'ticket-A', ticket_number: 19, store_id: 'store-A', requester_id: 'merchant-A', subject: 'Test support', status: 'open', chat_status: 'waiting', assigned_admin_id: null }],
    support_ticket_notes: [{ id: 'note-A', ticket_id: 'ticket-A', author_id: 'merchant-A', body: 'Original problem', internal: false, created_at: '2026-01-01T10:00:00Z' }],
    user_roles: [{ user_id: 'admin-A', role: 'support_admin' }],
    profiles: [{ id: 'merchant-A', store_id: 'store-A', status: 'active' }], audit_log: [], admin_support_sessions: [],
  };
  let serial = 0;
  const failures = {};
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'merchant-A', email: 'fixture@example.invalid' } } }) },
    from(table) {
      let op, values, mode, cap, sort, countOnly = false; const filters = [];
      const chain = new Proxy({}, { get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve().then(() => {
          if (failures[table]) return { data: null, error: failures[table] };
          let rows = (tables[table] ?? []).filter(row => filters.every(fn => fn(row)));
          if (op === 'insert') {
            rows = (Array.isArray(values) ? values : [values]).map(value => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...value }));
            (tables[table] ??= []).push(...rows);
          } else if (op === 'update') rows.forEach(row => Object.assign(row, values));
          if (sort) rows.sort((a,b) => String(a[sort[0]]).localeCompare(String(b[sort[0]])) * (sort[1]?.ascending === false ? -1 : 1));
          if (cap) rows = rows.slice(0, cap);
          const result = structuredClone(mode ? rows[0] ?? null : rows);
          return { data: countOnly ? null : result, count: rows.length, error: null };
        }).then(resolve, reject);
        return (...args) => {
          if (prop === 'insert' || prop === 'update') { op = prop; values = args[0]; }
          if (prop === 'eq') filters.push(row => row[args[0]] === args[1]);
          if (prop === 'is') filters.push(row => (row[args[0]] ?? null) === args[1]);
          if (prop === 'in') filters.push(row => args[1].includes(row[args[0]]));
          if (prop === 'gt') filters.push(row => row[args[0]] > args[1]);
          if (prop === 'neq') filters.push(row => row[args[0]] !== args[1]);
          if (prop === 'or') {
            const match = args[0].match(/^last_admin_read_at.is.null,last_admin_read_at.lt.(.*)$/);
            if (match) filters.push(row => !row.last_admin_read_at || row.last_admin_read_at < match[1]);
          }
          if (prop === 'maybeSingle' || prop === 'single') mode = prop;
          if (prop === 'limit') cap = args[0];
          if (prop === 'order') sort = args;
          if (prop === 'select') countOnly = Boolean(args[1]?.head);
          return chain;
        };
      }});
      return chain;
    },
  };
  const mocks = {
    '@tanstack/react-start': { createServerFn: serverFn },
    '@tanstack/react-router': { createFileRoute: () => config => config },
    '@/integrations/supabase/auth-middleware': { requireSupabaseAuth: {} },
    '@/lib/security/rate-limit': { authenticatedWriteRateLimit: {} },
    '@/integrations/supabase/client.server': { supabaseAdmin: admin },
    '@/lib/security/api-security.server': { guardApiRequest: async () => null },
    '@/lib/support-email.server': { sendSupportEmailBestEffort: async () => {}, supportInbox: () => 'test@example.invalid' },
  };
  const context = { userId: 'admin-A', supabase: admin };
  const api = load('src/lib/admin/company-admin.functions.ts', mocks);
  return { tables, failures, admin, mocks, context, api };
}
test('current main read-loop fix is preserved', async () => {
  const b = backend(); b.state.ticket.store_id = null;
  const after = load('src/lib/admin/company-admin.functions.ts', b.mocks);
  for (let i=0; i<3; i++) await after.adminGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context });
  assert.equal(b.state.writes, 0);
});
test('POS creation returns committed UUID and Admin can open it immediately with optional events absent', async () => {
  const b = workflowBackend(); b.failures.support_ticket_events = { code: '42P01', message: 'relation does not exist' };
  const endpoint = load('src/routes/api/public/pos/support-ticket.ts', b.mocks).Route.server.handlers.POST;
  const response = await endpoint({ request: new Request('https://fixture.invalid/api/public/pos/support-ticket', {
    method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', subject: 'Printer problem', body: 'Original merchant problem' }),
  }) });
  assert.equal(response.status, 200); const created = await response.json();
  const result = await b.api.adminGetSupportCase({ context: b.context, data: { ticketId: created.id } });
  assert.equal(result.ticket.id, created.id); assert.equal(result.problem_message.body, 'Original merchant problem');
});
test('investigate persists actor/time; duplicate retry preserves timestamp; waiting/reopen/resolve retain transcript', async () => {
  const b = workflowBackend(); const invoke = (status, extra = {}) => b.api.adminTransitionSupportCase({ context: b.context, data: { ticketId: 'ticket-A', status, ...extra } });
  await invoke('investigating'); const row = b.tables.support_tickets[0]; const started = row.investigation_started_at;
  assert.ok(started); assert.equal(row.investigation_started_by, 'admin-A'); assert.equal(row.assigned_admin_id, 'admin-A');
  await invoke('investigating'); assert.equal(row.investigation_started_at, started);
  const read = await b.api.adminGetSupportCase({ context: b.context, data: { ticketId: 'ticket-A' } });
  assert.equal(read.ticket.status, 'investigating'); assert.equal(read.ticket.investigation_started_at, started);
  assert.equal(read.problem_message.body, 'Original problem');
  await b.api.adminSendSupportMessage({ context: b.context, data: { ticketId: 'ticket-A', body: 'Please check cable' } });
  await invoke('waiting_for_merchant'); assert.equal(row.chat_status, 'active');
  await invoke('resolved', { resolutionSummary: 'Cable reconnected and tested' });
  assert.equal(row.chat_status, 'ended'); assert.ok(row.resolved_at);
  await assert.rejects(b.api.adminSendSupportMessage({ context: b.context, data: { ticketId: 'ticket-A', body: 'Must reopen' } }), /Reopen/);
  await invoke('open'); assert.equal(row.resolved_at, null); assert.equal(row.chat_status, 'active');
  await invoke('closed', { resolutionSummary: 'Verified working' }); assert.ok(row.closed_at);
  const history = await b.api.adminGetSupportCase({ context: b.context, data: { ticketId: 'ticket-A' } });
  assert.equal(history.messages.length, 2); assert.equal(history.problem_message.body, 'Original problem');
});
test('missing investigation migration fails visibly rather than pretending investigation started', async () => {
  const b = workflowBackend(); b.failures.support_tickets = { message: 'investigation_started_at missing' };
  await assert.rejects(b.api.adminTransitionSupportCase({ context: b.context, data: { ticketId: 'ticket-A', status: 'investigating' } }));
  assert.equal(b.tables.support_tickets[0].status, 'open');
});
test('concurrent admins cannot steal a claim; another admin cannot change investigation state', async () => {
  const b = workflowBackend(); b.tables.user_roles.push({ user_id: 'admin-B', role: 'support_admin' });
  const result = await Promise.allSettled(['admin-A','admin-B'].map(userId => b.api.adminClaimSupportCase({ context: { ...b.context, userId }, data: { ticketId: 'ticket-A' } })));
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  const winner = b.tables.support_tickets[0].assigned_admin_id;
  const loser = winner === 'admin-A' ? 'admin-B' : 'admin-A';
  await assert.rejects(b.api.adminTransitionSupportCase({ context: { ...b.context, userId: loser }, data: { ticketId: 'ticket-A', status: 'investigating' } }), /assigned admin/);
});
test('ambiguous message insert failure never triggers a second insert attempt', async () => {
  const b = workflowBackend(); b.tables.support_tickets[0].assigned_admin_id = 'admin-A';
  b.failures.support_ticket_notes = { code: 'NETWORK', message: 'Connection lost after write' };
  await assert.rejects(b.api.adminSendSupportMessage({ context: b.context, data: { ticketId: 'ticket-A', body: 'Reply' } }), /Connection lost/);
  assert.equal(b.tables.support_ticket_notes.length, 1);
});
test('missing events table uses actual audit history for old investigation time', async () => {
  const b = workflowBackend(); b.failures.support_ticket_events = { code: '42P01', message: 'relation does not exist' };
  b.tables.audit_log.push({ id: 'audit-A', entity: 'ticket', entity_id: 'ticket-A', actor_id: 'admin-A', action: 'admin.ticket.investigation_started', created_at: '2026-01-01T10:05:00Z', details: { from: 'open', to: 'investigating' } });
  const result = await b.api.adminGetSupportCase({ context: b.context, data: { ticketId: 'ticket-A' } });
  assert.equal(result.events.length, 1); assert.equal(result.ticket.investigation_started_at, '2026-01-01T10:05:00Z');
});
test('Admin route keys isolate drafts; refresh failure retains loaded case; start double press submits once', async () => {
  const h = ui('src/routes/_adminApp/admin.support.$ticketId.tsx', '\nexports.Page = SupportCasePage;');
  assert.equal(h.render(h.module.Route.options.component).key, 'ticket-A');
  h.control.ticketId = 'ticket-B'; assert.equal(h.render(h.module.Route.options.component).key, 'ticket-B'); h.control.ticketId = 'ticket-A';
  h.control.query = () => ({ isError: true, data: { ticket: { id: 'ticket-A', status: 'open' }, messages: [], internal_notes: [], events: [] }, refetch: async () => {} });
  const render = () => h.render(h.module.Page);
  assert.match(JSON.stringify(render()), /Problem reported by the merchant/);
  const button = nodes(render()).find(n => n.type === 'Button' && JSON.stringify(n.props.children).includes('Start investigating'));
  assert.ok(button); await Promise.all([button.props.onClick(), button.props.onClick()]);
  assert.equal(h.calls.filter(([name]) => name === 'adminTransitionSupportCase').length, 1);
});

test('screen request retry reuses its session and does not replace another case session', async()=>{
  const b=workflowBackend();
  b.tables.admin_support_sessions=[{id:'screen-A',admin_id:'admin-A',store_id:'store-A',status:'active',reason:'Case ticket-A',expires_at:'2999-01-01T00:00:00Z'}];
  const api=load('src/lib/admin/admin.functions.ts',{...b.mocks,'@/lib/stripe.server':{}});
  const result=await api.adminStartSupportSession({context:b.context,data:{storeId:'store-A',reason:'Case ticket-A'}});
  assert.equal(result.id,'screen-A');assert.equal(b.tables.admin_support_sessions.length,1);
  await assert.rejects(api.adminStartSupportSession({context:b.context,data:{storeId:'store-A',reason:'Case ticket-B'}}),/Another screen-share/);
  assert.equal(b.tables.admin_support_sessions[0].status,'active');
});
test('pending investigation migration preserves tenant policies and enables support staff realtime reads', async()=>{
  delete global.window;
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
  const staff='00000000-0000-4000-8000-000000000001',merchant='00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table user_roles(user_id uuid,role text);
      create table support_tickets(id uuid,requester_id uuid);
      create table support_ticket_notes(ticket_id uuid, internal boolean);
      create table admin_support_sessions(id uuid,store_id uuid);
      alter table support_tickets enable row level security;
      alter table support_ticket_notes enable row level security;
      alter table admin_support_sessions enable row level security;
      grant select on user_roles,support_tickets,support_ticket_notes,admin_support_sessions to authenticated;
      create policy original_merchant on support_tickets for select to authenticated using(requester_id=auth.uid());
      create policy merchant_session on admin_support_sessions for select to authenticated using(store_id=auth.uid());
      insert into user_roles values ('${staff}','support_admin'),('${merchant}','cashier');
      insert into support_tickets values ('${staff}','${staff}');
      insert into support_ticket_notes values ('${staff}',true);
      insert into admin_support_sessions values ('${staff}','${staff}');`);
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261006165130_support_investigation_workflow.sql'),'utf8'));
    await db.exec(`set role authenticated; select set_config('test.uid','${merchant}',false)`);
    assert.equal((await db.query('select * from support_tickets')).rows.length,0);
    assert.equal((await db.query('select * from support_ticket_notes')).rows.length,0);
    assert.equal((await db.query('select * from admin_support_sessions')).rows.length,0);
    await db.exec(`select set_config('test.uid','${staff}',false)`);
    assert.equal((await db.query('select * from support_tickets')).rows.length,1);
    assert.equal((await db.query('select * from support_ticket_notes')).rows.length,1);
    assert.equal((await db.query('select * from admin_support_sessions')).rows.length,1);
  } finally {await db.close()}
});

(async () => {
  let failed = 0;
  for (const [name, run] of tests) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}`, error); }
  }
  console.log(`${tests.length - failed}/${tests.length} support regression checks passed`);
  if (failed) process.exitCode = 1;
})();
