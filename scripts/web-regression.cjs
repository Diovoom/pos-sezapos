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
test('owner read-marker loop reproduced on baseline; repeated fetch now writes once', async () => {
  for (const baseline of compareBaseline ? [true, false] : [false]) {
    const b = backend();
    const api = load('src/lib/support.functions.ts', b.mocks, '', baseline);
    for (let i = 0; i < 3; i++) await api.merchantGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context });
    assert.equal(b.state.writes, baseline ? 3 : 1);
    if (!baseline) assert.equal(b.state.ticket.last_merchant_read_at, b.state.notes[0].created_at);
  }
});
test('owner support rejects another store and never marks it read', async () => {
  const b = backend(); b.state.ticket.store_id = 'store-B';
  const api = load('src/lib/support.functions.ts', b.mocks);
  await assert.rejects(api.merchantGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context }), /not found/);
  assert.equal(b.state.writes, 0);
});
test('owner read state never regresses and database failures are surfaced', async () => {
  const b = backend(); const api = load('src/lib/support.functions.ts', b.mocks);
  b.state.ticket.last_merchant_read_at = '2026-01-02T00:00:00.000Z';
  await api.merchantGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context });
  assert.equal(b.state.writes, 0);
  b.state.ticket.last_merchant_read_at = null; b.state.failMarker = true;
  await assert.rejects(api.merchantGetSupportCase({ data: { ticketId: 'ticket-A' }, context: b.context }));
});
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
test('employee fallback excludes foreign-store and unscoped legacy cache rows', () => {
  const { employeesForStore } = load('src/lib/web/owner-employees.ts');
  assert.deepEqual(employeesForStore([{ id: 1, store_id: 'A' }, { id: 2, store_id: 'B' }, { id: 3 }], 'A'), [{ id: 1, store_id: 'A' }]);
});
test('owner Realtime reconnect catches up; teardown stops callbacks, timer and listeners', () => {
  const { subscribeOwnerWebUpdates } = load('src/lib/web/owner-live.ts');
  let status, poll, removed = 0, cleared = 0; const listeners = new Map(), changes = [], invalidated = [];
  global.window = { setInterval: fn => { poll = fn; return 1; }, clearInterval: () => cleared++, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  global.document = { visibilityState: 'visible' };
  const channel = { on: (_, filter, fn) => { changes.push([filter, fn]); return channel; }, subscribe: fn => { status = fn; return channel; } };
  const stop = subscribeOwnerWebUpdates({ channel: () => channel, removeChannel: () => removed++ }, { invalidateQueries: ({ queryKey }) => invalidated.push(queryKey) }, 'A');
  assert.ok(changes.every(([f]) => f.filter === 'store_id=eq.A'));
  status('SUBSCRIBED'); const initial = invalidated.length;
  status('SUBSCRIBED'); assert.equal(invalidated.length, initial * 2);
  poll(); assert.ok(invalidated.some(k => k[0] === 'employee-roles'));
  stop(); const count = invalidated.length;
  status('SUBSCRIBED'); changes[0][1](); poll();
  assert.equal(invalidated.length, count); assert.equal(removed, 1); assert.equal(cleared, 1); assert.equal(listeners.size, 0);
});
test('Admin session switch/expiry invalidates once; refresh and cleaned-up callbacks do not', async () => {
  const { watchAdminSession } = load('src/lib/web/admin-session.ts');
  let callback, invalidations = 0, unsubscribed = 0;
  const auth = { onAuthStateChange: fn => { callback = fn; return { data: { subscription: { unsubscribe: () => unsubscribed++ } } }; } };
  let stop = watchAdminSession(auth, 'A', () => invalidations++);
  callback('TOKEN_REFRESHED', { user: { id: 'A' } }); await Promise.resolve(); assert.equal(invalidations, 0);
  callback('SIGNED_IN', { user: { id: 'B' } }); callback('SIGNED_OUT', null); await Promise.resolve(); assert.equal(invalidations, 1);
  stop(); assert.equal(unsubscribed, 1);
  stop = watchAdminSession(auth, 'A', () => invalidations++);
  callback('SIGNED_OUT', null); stop(); await Promise.resolve(); assert.equal(invalidations, 1);
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
test('baseline owner conversation route fails to render Outlet; fixed route renders exact child', () => {
  const file = 'src/routes/_dashboard/help.tsx';
  if (compareBaseline) {
    const before = ui(file, '', true); assert.notEqual(before.render(before.module.Route.options.component).type, 'Outlet');
  }
  const after = ui(file); assert.equal(after.render(after.module.Route.options.component).type, 'Outlet');
  after.control.pathname = '/help'; assert.equal(after.render(after.module.Route.options.component).type.name, 'HelpPage');
});
test('owner and Admin workspace reset draft state on exact ticket navigation', () => {
  for (const file of ['src/routes/_dashboard/help.$ticketId.tsx', 'src/routes/_adminApp/admin.support.$ticketId.tsx']) {
    const h = ui(file); assert.equal(h.render(h.module.Route.options.component).key, 'ticket-A');
    h.control.ticketId = 'ticket-B'; assert.equal(h.render(h.module.Route.options.component).key, 'ticket-B');
  }
});
test('owner chat waits for identity instead of showing a false initial load error', () => {
  const h = ui('src/routes/_dashboard/help.$ticketId.tsx', '\nexports.Chat = MerchantSupportChat;');
  h.control.query = () => ({ isPending: true, isLoading: false, data: undefined });
  assert.match(JSON.stringify(h.render(h.module.Chat)), /Loading support chat/);
});
test('closed owner chat can use existing reopen-by-reply behavior; rapid clicks send once', async () => {
  const h = ui('src/routes/_dashboard/help.$ticketId.tsx', '\nexports.Chat = MerchantSupportChat;');
  h.control.query = () => ({ data: { ticket: { id: 'ticket-A', status: 'closed', chat_status: 'ended' }, messages: [] } });
  const render = () => h.render(h.module.Chat);
  nodes(render()).find(n => n.type === 'Textarea').props.onChange({ target: { value: 'Please reopen' } });
  const send = nodes(render()).find(n => n.type === 'Button' && n.props.onClick?.name === 'sendMessage').props.onClick;
  await Promise.all([send(), send()]); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1].data.ticketId, 'ticket-A');
});
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
test('contact failed request stays visible without a marketing toast host; double submit sends once', async () => {
  const h = ui('src/routes/contact.tsx');
  const render = () => h.render(h.module.Route.options.component);
  render();
  const formIndex = h.state.findIndex(v => v && typeof v === 'object' && 'business' in v);
  h.state[formIndex] = { name: 'Fixture', email: 'fixture@example.invalid', business: 'Store', phone: '5555555555', message: 'Test consultation request' };
  h.state[0] = 3;
  let done, requests = 0; global.fetch = () => { requests++; return new Promise(resolve => { done = resolve; }); };
  const submit = nodes(render()).find(n => n.type === 'form').props.onSubmit;
  const first = submit({ preventDefault() {} }); const second = submit({ preventDefault() {} });
  assert.equal(requests, 1); done({ ok: false, json: async () => ({}) }); await Promise.all([first, second]);
  assert.ok(nodes(render()).some(n => n.props?.role === 'alert'));
  assert.equal(h.state[formIndex].message, 'Test consultation request');
});
test('public marketing no longer advertises the APK download route', () => {
  const shell = source('src/components/marketing/MarketingShell.tsx');
  const devices = source('src/routes/_dashboard/devices.tsx');
  const sitemap = source('src/routes/sitemap[.]xml.ts');
  const download = source('src/routes/download.tsx');
  assert.doesNotMatch(shell, /to:\s*["']\/download["']/);
  assert.doesNotMatch(devices, /marketingUrl\(["']\/download["']\)/);
  assert.doesNotMatch(sitemap, /path:\s*["']\/download["']/);
  assert.match(download, /noindex, nofollow, noarchive, nosnippet/);
});
test('Admin support keeps optional context from blocking the core case read', () => {
  const server = source('src/lib/admin/company-admin.functions.ts');
  assert.match(server, /async function optionalSupportRead/);
  assert.match(server, /Promise\.allSettled\(\[/);
  assert.match(server, /This active case is already assigned to another admin/);
});
test('Admin investigation exposes a persisted visible workspace', () => {
  const route = source('src/routes/_adminApp/admin.support.$ticketId.tsx');
  assert.match(route, /Investigation in progress/);
  assert.match(route, /id="investigation-workspace"/);
  assert.match(route, /id="merchant-conversation"/);
  assert.match(route, /retry:\s*2/);
});
test('merchant support cannot resolve close or delete cases', () => {
  const help = source('src/routes/_dashboard/help.tsx');
  const detail = source('src/routes/_dashboard/help.$ticketId.tsx');
  const shared = source('src/components/support/MerchantLiveSupport.tsx');
  const android = source('capacitor-shell/screens/SupportScreen.tsx');
  const server = source('src/lib/support.functions.ts');
  assert.doesNotMatch(help, /Delete conversation|Permanently delete this closed support conversation|merchantDeleteSupportCase/);
  assert.doesNotMatch(detail, /Mark solved & close|Delete conversation|window\.confirm/);
  assert.doesNotMatch(shared, /merchant_close_support_case|Close case|window\.confirm\("Mark this support case/);
  assert.doesNotMatch(android, /merchant_close_support_case|closeTicket\.mutate/);
  assert.match(server, /Only SEZA Support can resolve or close support cases/);
  assert.match(server, /Only SEZA Support can delete support conversations/);
});
test('owner support badge refreshes immediately after a conversation is read', () => {
  const detail = source('src/routes/_dashboard/help.$ticketId.tsx');
  const shared = source('src/components/support/MerchantLiveSupport.tsx');
  assert.match(detail, /latestVisibleMessageAt/);
  assert.match(detail, /invalidateQueries\(\{ queryKey: \["owner-support-unread"\] \}\)/);
  assert.match(shared, /merchant_mark_support_read/);
  assert.match(shared, /invalidateQueries\(\{ queryKey: \["owner-support-unread"\] \}\)/);
});
test('owner support bubble stays hidden across dashboard navigation until a hard reload', () => {
  const shell = source('src/components/pos/AppShell.tsx');
  assert.match(shell, /supportBubbleDismissed, setSupportBubbleDismissed/);
  assert.match(shell, /!supportBubbleDismissed &&/);
  assert.match(shell, /setSupportBubbleDismissed\(true\)/);
  assert.match(shell, /Hide support button until reload/);
  assert.doesNotMatch(shell, /supportBubbleDismissedPath/);
  assert.doesNotMatch(shell, /setSupportBubbleDismissed\(false\)/);
});
test('POS keeps Fast Cash visible but safe, defaults to cash, and gives the cart more room', () => {
  const pos = source('src/routes/_pos/pos.tsx');
  assert.match(pos, /useState<PaymentMethod>\("cash"\)/);
  assert.match(pos, /const completeFastCash = \(\) =>/);
  assert.match(pos, /finalize\.isPending \|\| tender !== "cash"/);
  assert.match(pos, /method: "cash",[\s\S]*amountTendered: total,[\s\S]*changeDue: 0/);
  assert.match(pos, /Fast Cash exact tender/);
  assert.match(pos, /tender !== "cash" \|\|[\s\S]*Select Cash to use Fast Cash/);
  assert.match(pos, /md:basis-\[67%\]/);
  assert.match(pos, /md:basis-\[33%\]/);
  assert.match(pos, /min-w-\[340px\] max-w-\[500px\]/);
  assert.doesNotMatch(pos, /Cash customers receive the lower cash price\. The card price is set before the card is presented\./);
  assert.match(pos, /if \(isTrainingMode\(\)\)/);
  assert.match(pos, /id: "pos-item-added"[\s\S]*position: "bottom-center"[\s\S]*duration: 650/);
});
test('POS can target a manual discount to the selected cart line without changing other items', () => {
  const pos = source('src/routes/_pos/pos.tsx');
  const dialog = source('src/components/pos/DiscountDialog.tsx');
  assert.match(pos, /selectedDiscountProductId/);
  assert.match(pos, /discountTargetProductId/);
  assert.match(pos, /Selected for discount/);
  assert.match(pos, /Promo −/);
  assert.match(pos, /setDiscountTargetProductId\(nextDiscount \? selectedDiscountProductId : null\)/);
  assert.match(pos, /discountBase = discountTargetLine/);
  assert.match(pos, /discountTargetLine\.product\.taxable/);
  assert.match(dialog, /targetLabel/);
  assert.match(dialog, /Applies only to/);
});
test('terminal recovery silently clears definitely unpaid canceled checkouts', () => {
  const recovery = source('src/components/pos/TerminalRecoveryNotice.tsx');
  assert.match(recovery, /const DEFINITELY_UNPAID = new Set/);
  assert.match(recovery, /"requires_payment_method"/);
  assert.match(recovery, /"requires_confirmation"/);
  assert.match(recovery, /"canceled"/);
  assert.match(recovery, /"unprepared"/);
  assert.match(recovery, /recoverStripeCheckout\("abandon", row\.checkoutId\)/);
  assert.match(recovery, /loadVisibleRecoveryRows/);
  assert.match(recovery, /Checking…/);
  assert.doesNotMatch(recovery, /Cancel unpaid checkout/);
});
test('merchant close RPC is revoked from authenticated clients', () => {
  const migration = source('supabase/migrations/20261003073000_support_admin_only_case_closure.sql');
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.merchant_close_support_case\(uuid\) FROM authenticated/);
});
test('owner password login stays on the SEZA same-origin server path', () => {
  const auth = source('src/routes/auth.tsx');
  assert.doesNotMatch(auth, /supabase\.auth\.signInWithPassword/);
  assert.match(auth, /secureOwnerPasswordSignIn/);
  assert.match(auth, /AuthTrustPanel portal="owner"/);
});
test('credential pages identify the official SEZA portal', () => {
  const trust = source('src/components/auth/AuthTrustPanel.tsx');
  assert.match(trust, /Official SEZA Technologies Inc/);
  assert.match(trust, /sezapos\.com/);
  for (const file of ['src/routes/auth.tsx', 'src/routes/signup.tsx', 'src/routes/reset-password.tsx', 'src/routes/admin.auth.tsx']) {
    assert.match(source(file), /AuthTrustPanel/);
  }
});
test('web password fields declare explicit password-manager semantics', () => {
  const files = [
    'src/routes/auth.tsx',
    'src/routes/signup.tsx',
    'src/routes/reset-password.tsx',
    'src/routes/admin.auth.tsx',
    'src/routes/_dashboard/onboarding.tsx',
    'src/routes/_dashboard/settings.tsx',
    'src/routes/_adminApp/admin.settings.tsx',
    'src/components/pos/ManagerOverrideDialog.tsx',
    'src/components/settings/SmsSettingsPanel.tsx',
  ];
  for (const file of files) {
    const text = source(file);
    const inputs = [...text.matchAll(/<Input\b[\s\S]*?\/>/g)].map((match) => match[0]);
    const passwordInputs = inputs.filter((input) => /type=(?:["']password["']|\{[^}]*["']password["'][^}]*\})/.test(input));
    assert.ok(passwordInputs.length > 0, `${file} should contain a password-like input`);
    for (const input of passwordInputs) assert.match(input, /autoComplete=/, `${file} password input missing autoComplete`);
  }
  assert.match(source('src/routes/auth.tsx'), /autoComplete="current-password"/);
  assert.match(source('src/routes/admin.auth.tsx'), /autoComplete="current-password"/);
  for (const file of ['src/routes/signup.tsx', 'src/routes/reset-password.tsx', 'src/routes/_dashboard/onboarding.tsx', 'src/routes/_dashboard/settings.tsx', 'src/routes/_adminApp/admin.settings.tsx']) {
    assert.match(source(file), /autoComplete="new-password"/);
  }
  for (const file of ['src/components/pos/ManagerOverrideDialog.tsx', 'src/components/settings/SmsSettingsPanel.tsx']) {
    assert.match(source(file), /autoComplete="off"/);
  }
});
test('sensitive SEZA HTML cannot be framed by another origin', () => {
  const server = source('src/server.ts');
  assert.match(server, /X-Frame-Options["'], ["']DENY/);
  assert.match(server, /frame-ancestors 'none'/);
});
test('dashboard, Admin and POS hosts are fully excluded from robots crawling', () => {
  const robots = source('src/routes/robots[.]txt.ts');
  assert.match(robots, /Account, Admin and POS hosts are intentionally excluded/);
  const tail = robots.slice(robots.indexOf('Account, Admin and POS hosts'));
  assert.doesNotMatch(tail, /Allow: \//);
});
test('public trial buttons leave marketing for owner signup, preserving each selected plan', () => {
  for (const file of ['src/routes/pricing.tsx', 'src/routes/features.tsx', 'src/routes/industries.tsx']) {
    const h = ui(file);
    const links = nodes(h.render(h.module.Route.options.component)).filter(n => n.type === 'a' && n.props.href?.includes('/signup'));
    assert.equal(links.length, file.includes('pricing') ? 3 : 1);
    for (const link of links) assert.equal(new URL(link.props.href).origin, 'https://dashboard.sezapos.com');
    if (file.includes('pricing')) assert.deepEqual(links.map(n => new URL(n.props.href).searchParams.get('plan')), ['starter', 'pro', 'business']);
  }
});

(async () => {
  for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
  console.log(`${tests.length}/${tests.length} web regression checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
