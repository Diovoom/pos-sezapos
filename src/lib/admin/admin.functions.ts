import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createStripeClient,
  getStripeErrorMessage,
  type StripeEnv,
} from "@/lib/stripe.server";

// ============================================================================
// Shared helpers
// ============================================================================

async function ensureSuperAdmin(context: {
  supabase: any;
  userId: string;
}): Promise<{ email: string | null }> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error("Authorization check failed");
  const isSuper = (data ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (!isSuper) throw new Error("Forbidden: super_admin required");
  const { data: user } = await context.supabase.auth.getUser();
  return { email: user?.user?.email ?? null };
}

// Read-only gate — any SEZA platform-staff role may read admin data.
// Mutations continue to use ensureSuperAdmin.
async function ensurePlatformStaff(context: {
  supabase: any;
  userId: string;
}): Promise<{ email: string | null; roles: string[] }> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error("Authorization check failed");
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const { PLATFORM_ROLES } = await import("@/lib/platform-roles");
  const ok = roles.some((r: string) => (PLATFORM_ROLES as readonly string[]).includes(r));
  if (!ok) throw new Error("Forbidden: platform staff required");
  const { data: user } = await context.supabase.auth.getUser();
  return { email: user?.user?.email ?? null, roles };
}

// Support-scoped gate — super_admin, operations_admin, or support_admin.
async function ensureSupportStaff(context: {
  supabase: any;
  userId: string;
}): Promise<{ email: string | null; roles: string[] }> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error("Authorization check failed");
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const allowed = ["super_admin", "operations_admin", "support_admin"];
  if (!roles.some((r: string) => allowed.includes(r))) throw new Error("Forbidden: support staff required");
  const { data: user } = await context.supabase.auth.getUser();
  return { email: user?.user?.email ?? null, roles };
}

async function writeAudit(
  supabaseAdmin: any,
  entry: {
    actor_id: string;
    actor_email: string | null;
    store_id?: string | null;
    action: string;
    entity?: string;
    entity_id?: string;
    details?: Record<string, unknown>;
  },
) {
  await supabaseAdmin.from("audit_log").insert({
    actor_id: entry.actor_id,
    actor_email: entry.actor_email,
    store_id: entry.store_id ?? null,
    action: entry.action,
    entity: entry.entity ?? null,
    entity_id: entry.entity_id ?? null,
    details: entry.details ?? {},
  });
}

function requireReason(reason: string | undefined | null, min = 4): string {
  const t = (reason ?? "").trim();
  if (t.length < min) throw new Error("A reason of at least 4 characters is required");
  return t;
}

// ============================================================================
// Overview stats
// ============================================================================

export const adminOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      stores,
      trialing,
      active,
      pastDue,
      suspended,
      terminals,
      offlineTerminals,
      openTickets,
      recentErrors,
    ] = await Promise.all([
      supabaseAdmin.from("stores").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("stores").select("*", { count: "exact", head: true }).eq("plan_status", "trialing"),
      supabaseAdmin.from("stores").select("*", { count: "exact", head: true }).eq("plan_status", "active"),
      supabaseAdmin.from("stores").select("*", { count: "exact", head: true }).eq("plan_status", "past_due"),
      supabaseAdmin.from("stores").select("*", { count: "exact", head: true }).not("suspended_at", "is", null),
      supabaseAdmin.from("payment_terminals").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("payment_terminals")
        .select("*", { count: "exact", head: true })
        .or("last_seen_at.is.null,last_seen_at.lt." + new Date(Date.now() - 24 * 3600_000).toISOString()),
      supabaseAdmin.from("support_tickets").select("*", { count: "exact", head: true }).in("status", ["open", "investigating"]),
      supabaseAdmin
        .from("audit_log")
        .select("*", { count: "exact", head: true })
        .eq("action", "system.error")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString()),
    ]);

    const { data: recent } = await supabaseAdmin
      .from("audit_log")
      .select("id, action, actor_email, entity, entity_id, store_id, created_at, details")
      .order("created_at", { ascending: false })
      .limit(15);

    return {
      totals: {
        businesses: stores.count ?? 0,
        trialing: trialing.count ?? 0,
        active: active.count ?? 0,
        past_due: pastDue.count ?? 0,
        suspended: suspended.count ?? 0,
        devices: terminals.count ?? 0,
        offline_devices: offlineTerminals.count ?? 0,
        open_tickets: openTickets.count ?? 0,
        recent_errors: recentErrors.count ?? 0,
      },
      recent: recent ?? [],
    };
  });

// ============================================================================
// Global search
// ============================================================================

export const adminGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    if (!data.query || data.query.trim().length < 1) return { results: [] };
    const { data: results, error } = await context.supabase.rpc("admin_global_search", {
      _q: data.query.trim(),
      _limit: 25,
    });
    if (error) throw new Error(error.message);
    return { results: results ?? [] };
  });

// ============================================================================
// Businesses
// ============================================================================

export const adminListBusinesses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      filter?: string;
      search?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortDir?: "asc" | "desc";
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize ?? 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Whitelist sortable columns to prevent injection via order string.
    const SORTABLE = new Set([
      "created_at",
      "updated_at",
      "name",
      "plan_status",
      "plan_tier",
      "trial_ends_at",
      "plan_period_end",
      "suspended_at",
    ]);
    const sortBy = data.sortBy && SORTABLE.has(data.sortBy) ? data.sortBy : "created_at";
    const sortDir: "asc" | "desc" = data.sortDir === "asc" ? "asc" : "desc";

    // Skip select-string type-parsing to keep tsc fast.
    const sel = (s: string): string => s;

    let q = supabaseAdmin
      .from("stores")
      .select(
        sel(
          "id, name, email, phone, city, country, store_code, plan_tier, plan_status, plan_period_end, trial_ends_at, suspended_at, created_at, updated_at",
        ),
        { count: "exact" },
      )
      .order(sortBy, { ascending: sortDir === "asc", nullsFirst: false })
      .range(from, to);

    switch (data.filter) {
      case "active":
        q = q.eq("plan_status", "active");
        break;
      case "trial":
        q = q.eq("plan_status", "trialing");
        break;
      case "past_due":
        q = q.eq("plan_status", "past_due");
        break;
      case "expired":
        q = q.eq("plan_status", "expired");
        break;
      case "canceled":
        q = q.eq("plan_status", "canceled");
        break;
      case "suspended":
        q = q.not("suspended_at", "is", null);
        break;
    }
    if (data.search && data.search.trim()) {
      // Escape PostgREST `or` metacharacters (commas, parens) in user input
      // to prevent filter injection.
      const raw = data.search.trim().slice(0, 100);
      const s = raw.replace(/[,()]/g, " ").replace(/\s+/g, " ");
      q = q.or(
        `name.ilike.%${s}%,email.ilike.%${s}%,store_code.ilike.%${s}%,phone.ilike.%${s}%,city.ilike.%${s}%`,
      );
    }

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: rows ?? [],
      count: count ?? 0,
      page,
      pageSize,
      sortBy,
      sortDir,
    };
  });

export const adminGetBusinessWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storeId: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const storeId = data.storeId;

    const nowIso = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

    const [
      store, employees, products, terminals, openShifts, recentShifts, sub, sales,
      recentActivity, recentIssues, tickets, refunds, salesToday, sales7d, sales30d,
      refunds30d, offlineSales, supportSessions, cashMoves,
    ] = await Promise.all([
      supabaseAdmin.from("stores").select("*").eq("id", storeId).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, phone, status, employee_id, created_at, updated_at, last_sign_in_at")
        .eq("store_id", storeId),
      supabaseAdmin.from("products").select("*", { count: "exact", head: true }).eq("store_id", storeId),
      supabaseAdmin
        .from("payment_terminals")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("register_sessions")
        .select("id, opened_at, opened_by, closed_at, terminal_id, status, opening_cash, expected_cash, counted_cash, variance")
        .eq("store_id", storeId)
        .eq("status", "open"),
      supabaseAdmin
        .from("register_sessions")
        .select("id, opened_at, closed_at, opened_by, closed_by, terminal_id, status, opening_cash, expected_cash, counted_cash, variance")
        .eq("store_id", storeId)
        .order("opened_at", { ascending: false })
        .limit(15),
      supabaseAdmin
        .from("subscriptions").select("*").eq("store_id", storeId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("sales")
        .select("id, total, status, created_at, payment_method, receipt_number, refund_status, synced_from_offline")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false }).limit(20),
      supabaseAdmin
        .from("audit_log")
        .select("id, action, actor_email, entity, entity_id, created_at, details")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false }).limit(100),
      supabaseAdmin
        .from("payment_attempts")
        .select("id, method, status, message, amount, created_at")
        .eq("store_id", storeId)
        .in("status", ["declined", "failed", "error"])
        .order("created_at", { ascending: false }).limit(20),
      supabaseAdmin
        .from("support_tickets")
        .select("id, ticket_number, subject, status, priority, created_at, updated_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false }).limit(20),
      supabaseAdmin
        .from("refunds")
        .select("id, sale_id, refund_type, reason, total, payment_method, status, created_at, cashier_id")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("sales").select("total, refunded_amount", { count: "exact" })
        .eq("store_id", storeId).gte("created_at", dayAgo).neq("status", "voided"),
      supabaseAdmin.from("sales").select("total, refunded_amount", { count: "exact" })
        .eq("store_id", storeId).gte("created_at", weekAgo).neq("status", "voided"),
      supabaseAdmin.from("sales").select("total, refunded_amount", { count: "exact" })
        .eq("store_id", storeId).gte("created_at", monthAgo).neq("status", "voided"),
      supabaseAdmin.from("refunds").select("total", { count: "exact" })
        .eq("store_id", storeId).gte("created_at", monthAgo),
      supabaseAdmin.from("sales").select("id", { count: "exact", head: true })
        .eq("store_id", storeId).eq("synced_from_offline", true).gte("created_at", weekAgo),
      supabaseAdmin.from("admin_support_sessions")
        .select("id, admin_id, admin_email, reason, status, requested_at, decided_at, started_at, ended_at, expires_at, client_capability")
        .eq("store_id", storeId)
        .order("requested_at", { ascending: false }).limit(10),
      supabaseAdmin.from("cash_movements")
        .select("id, type, amount, reason, created_at, user_id, register_session_id")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    if (!store.data) throw new Error("Business not found");

    const ownerRoles = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .eq("store_id", storeId)
      .in("role", ["owner", "admin"]);
    const ownerIds = (ownerRoles.data ?? []).map((r: any) => r.user_id);
    const ownerProfiles =
      ownerIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id, full_name, email, phone").in("id", ownerIds)
        : { data: [] };

    // Resolve names for shifts / cash movements
    const userIds = new Set<string>();
    [...(openShifts.data ?? []), ...(recentShifts.data ?? [])].forEach((s: any) => {
      if (s.opened_by) userIds.add(s.opened_by);
      if (s.closed_by) userIds.add(s.closed_by);
    });
    (cashMoves.data ?? []).forEach((c: any) => c.user_id && userIds.add(c.user_id));
    (refunds.data ?? []).forEach((r: any) => r.cashier_id && userIds.add(r.cashier_id));
    const nameMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: names } = await supabaseAdmin
        .from("profiles").select("id, full_name, email").in("id", Array.from(userIds));
      (names ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.email || p.id.slice(0, 8); });
    }

    const sumTotals = (rows: any[]) => rows.reduce((acc, r) => ({
      gross: acc.gross + Number(r.total ?? 0),
      refunded: acc.refunded + Number(r.refunded_amount ?? 0),
    }), { gross: 0, refunded: 0 });

    const lastSale = sales.data?.[0]?.created_at ?? null;
    const lastAudit = recentActivity.data?.[0]?.created_at ?? null;
    const lastActivity = [lastSale, lastAudit].filter(Boolean).sort().reverse()[0] ?? null;

    const now = Date.now();
    const offlineTerminals = (terminals.data ?? []).filter(
      (t: any) => !t.last_seen_at || new Date(t.last_seen_at).getTime() < now - 24 * 3600_000,
    );

    const active_support_session = (supportSessions.data ?? []).find(
      (s: any) => (s.status === "pending" || s.status === "accepted") &&
        (!s.expires_at || new Date(s.expires_at).getTime() > now),
    ) ?? null;

    const t7 = sumTotals(sales7d.data ?? []);
    const t30 = sumTotals(sales30d.data ?? []);
    const tToday = sumTotals(salesToday.data ?? []);

    return {
      store: store.data,
      owners: ownerProfiles.data ?? [],
      counts: {
        employees: (employees.data ?? []).length,
        products: products.count ?? 0,
        terminals: (terminals.data ?? []).length,
        open_shifts: (openShifts.data ?? []).length,
      },
      employees: employees.data ?? [],
      terminals: terminals.data ?? [],
      offline_terminals: offlineTerminals.length,
      subscription: sub.data?.[0] ?? null,
      subscriptions: sub.data ?? [],
      recent_sales: sales.data ?? [],
      recent_activity: recentActivity.data ?? [],
      recent_issues: recentIssues.data ?? [],
      tickets: tickets.data ?? [],
      last_activity: lastActivity,
      // Phase 2 additions
      open_shifts: (openShifts.data ?? []).map((s: any) => ({ ...s, opened_by_name: nameMap[s.opened_by] ?? null })),
      recent_shifts: (recentShifts.data ?? []).map((s: any) => ({
        ...s,
        opened_by_name: nameMap[s.opened_by] ?? null,
        closed_by_name: s.closed_by ? nameMap[s.closed_by] ?? null : null,
      })),
      refunds: (refunds.data ?? []).map((r: any) => ({ ...r, cashier_name: r.cashier_id ? nameMap[r.cashier_id] ?? null : null })),
      cash_movements: (cashMoves.data ?? []).map((c: any) => ({ ...c, user_name: c.user_id ? nameMap[c.user_id] ?? null : null })),
      sales_summary: {
        today: { count: salesToday.count ?? 0, ...tToday },
        last_7d: { count: sales7d.count ?? 0, ...t7 },
        last_30d: { count: sales30d.count ?? 0, ...t30 },
        refunds_30d: { count: refunds30d.count ?? 0, total: (refunds30d.data ?? []).reduce((a: number, r: any) => a + Number(r.total ?? 0), 0) },
        offline_sales_7d: offlineSales.count ?? 0,
      },
      support_sessions: supportSessions.data ?? [],
      active_support_session,
      generated_at: nowIso,
    };
  });


// ============================================================================
// Businesses — safe mutations
// ============================================================================

async function loadStoreOrThrow(supabaseAdmin: any, id: string) {
  const { data, error } = await supabaseAdmin.from("stores").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Business not found");
  return data;
}

export const adminSuspendBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storeId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadStoreOrThrow(supabaseAdmin, data.storeId);
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ suspended_at: new Date().toISOString(), suspended_reason: reason })
      .eq("id", data.storeId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: data.storeId,
      action: "admin.business.suspend",
      entity: "store",
      entity_id: data.storeId,
      details: { reason },
    });
    return { ok: true };
  });

export const adminUnsuspendBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storeId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadStoreOrThrow(supabaseAdmin, data.storeId);
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ suspended_at: null, suspended_reason: null })
      .eq("id", data.storeId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: data.storeId,
      action: "admin.business.unsuspend",
      entity: "store",
      entity_id: data.storeId,
      details: { reason },
    });
    return { ok: true };
  });

export const adminUpdateBusinessContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      storeId: string;
      reason: string;
      name?: string;
      email?: string;
      phone?: string;
      website?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadStoreOrThrow(supabaseAdmin, data.storeId);
    const patch: Record<string, any> = {};
    for (const k of ["name", "email", "phone", "website", "address", "city", "state", "zip"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (Object.keys(patch).length === 0) throw new Error("Nothing to update");
    const { error } = await supabaseAdmin.from("stores").update(patch as any).eq("id", data.storeId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: data.storeId,
      action: "admin.business.update_contact",
      entity: "store",
      entity_id: data.storeId,
      details: { reason, patch },
    });
    return { ok: true };
  });

export const adminExtendTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storeId: string; days: number; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    if (!Number.isFinite(data.days) || data.days <= 0 || data.days > 365)
      throw new Error("Invalid extension length");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const store = await loadStoreOrThrow(supabaseAdmin, data.storeId);
    const base = store.trial_ends_at ? new Date(store.trial_ends_at) : new Date();
    const newEnd = new Date(Math.max(base.getTime(), Date.now()) + data.days * 24 * 3600_000);
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ trial_ends_at: newEnd.toISOString() })
      .eq("id", data.storeId);
    if (error) throw new Error(error.message);
    // Recompute plan derived state
    try { await supabaseAdmin.rpc("recompute_store_plan", { _store_id: data.storeId }); } catch {}
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: data.storeId,
      action: "admin.trial.extend",
      entity: "store",
      entity_id: data.storeId,
      details: { reason, days: data.days, new_end: newEnd.toISOString() },
    });
    return { ok: true, trial_ends_at: newEnd.toISOString() };
  });

export const adminEndTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storeId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadStoreOrThrow(supabaseAdmin, data.storeId);
    const past = new Date(Date.now() - 60_000).toISOString();
    const { error } = await supabaseAdmin.from("stores").update({ trial_ends_at: past }).eq("id", data.storeId);
    if (error) throw new Error(error.message);
    try { await supabaseAdmin.rpc("recompute_store_plan", { _store_id: data.storeId }); } catch {}
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: data.storeId,
      action: "admin.trial.end",
      entity: "store",
      entity_id: data.storeId,
      details: { reason },
    });
    return { ok: true };
  });

// ============================================================================
// Auth actions (password reset, resend verification, revoke sessions)
// ============================================================================

export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (uErr || !u?.user?.email) throw new Error("User not found");
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: u.user.email,
    });
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      action: "admin.user.password_reset",
      entity: "user",
      entity_id: data.userId,
      details: { reason, email: u.user.email },
    });
    return { ok: true };
  });

export const adminResendVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (uErr || !u?.user?.email) throw new Error("User not found");
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: u.user.email,
    });
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      action: "admin.user.resend_verification",
      entity: "user",
      entity_id: data.userId,
      details: { reason, email: u.user.email },
    });
    return { ok: true };
  });

export const adminRevokeSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      action: "admin.user.revoke_sessions",
      entity: "user",
      entity_id: data.userId,
      details: { reason },
    });
    return { ok: true };
  });

// ============================================================================
// Employees — merchant-managed only.
// Platform Admin is NOT permitted to promote/demote employees, reset PINs,
// disable accounts, or otherwise manage merchant staffing. The Business Owner
// (or an authorized manager per the merchant permissions system) handles this
// inside the Merchant Dashboard. These stubs remain exported to preserve the
// public API surface but always refuse.
// ============================================================================

const NOT_PERMITTED_EMPLOYEE_MGMT =
  "Merchant employee management is not permitted from the Platform Admin. The Business Owner must perform this action inside the Merchant Dashboard.";

export const adminSetEmployeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; status: "active" | "disabled"; reason: string }) => data)
  .handler(async () => {
    throw new Error(NOT_PERMITTED_EMPLOYEE_MGMT);
  });

export const adminResetEmployeePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; reason: string }) => data)
  .handler(async () => {
    throw new Error(NOT_PERMITTED_EMPLOYEE_MGMT);
  });

export const adminChangeEmployeeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      userId: string;
      storeId: string;
      role: "owner" | "admin" | "manager" | "cashier";
      reason: string;
    }) => data,
  )
  .handler(async () => {
    throw new Error(NOT_PERMITTED_EMPLOYEE_MGMT);
  });


// ============================================================================
// Devices / terminals
// ============================================================================

export const adminRenameTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { terminalId: string; label: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    if (!data.label.trim()) throw new Error("Label is required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: term } = await supabaseAdmin.from("payment_terminals").select("store_id").eq("id", data.terminalId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("payment_terminals")
      .update({ label: data.label.trim() })
      .eq("id", data.terminalId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: term?.store_id ?? null,
      action: "admin.terminal.rename",
      entity: "terminal",
      entity_id: data.terminalId,
      details: { reason, label: data.label.trim() },
    });
    return { ok: true };
  });

export const adminSetTerminalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { terminalId: string; status: "active" | "inactive"; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    if (data.status !== "active" && data.status !== "inactive") throw new Error("Invalid status");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: term } = await supabaseAdmin.from("payment_terminals").select("store_id").eq("id", data.terminalId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("payment_terminals")
      .update({ status: data.status })
      .eq("id", data.terminalId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: term?.store_id ?? null,
      action: data.status === "inactive" ? "admin.terminal.deactivate" : "admin.terminal.activate",
      entity: "terminal",
      entity_id: data.terminalId,
      details: { reason },
    });
    return { ok: true };
  });

export const adminRevokeTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { terminalId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: term } = await supabaseAdmin.from("payment_terminals").select("store_id, label").eq("id", data.terminalId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("payment_terminals")
      .update({ status: "revoked", config: {} })
      .eq("id", data.terminalId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: term?.store_id ?? null,
      action: "admin.terminal.revoke",
      entity: "terminal",
      entity_id: data.terminalId,
      details: { reason, label: term?.label },
    });
    return { ok: true };
  });

export const adminListDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      filter?: string;
      provider?: string;
      search?: string;
      sortBy?: string;
      sortDir?: "asc" | "desc";
      page?: number;
      pageSize?: number;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize ?? 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const SORTABLE = new Set(["last_seen_at", "created_at", "label", "provider", "status"]);
    const sortBy = data.sortBy && SORTABLE.has(data.sortBy) ? data.sortBy : "last_seen_at";
    const sortDir: "asc" | "desc" = data.sortDir === "asc" ? "asc" : "desc";

    let q = supabaseAdmin
      .from("payment_terminals")
      .select(
        "id, store_id, label, provider, serial, location, status, last_seen_at, created_at, config",
        { count: "exact" },
      )
      .order(sortBy, { ascending: sortDir === "asc", nullsFirst: false })
      .range(from, to);

    if (data.filter === "offline") {
      const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
      q = q.or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`);
    } else if (data.filter === "online") {
      const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
      q = q.gte("last_seen_at", cutoff);
    } else if (data.filter === "active" || data.filter === "inactive" || data.filter === "revoked") {
      q = q.eq("status", data.filter);
    }
    if (data.provider && data.provider !== "all") {
      q = q.eq("provider", data.provider);
    }
    if (data.search && data.search.trim()) {
      const raw = data.search.trim().slice(0, 100);
      const s = raw.replace(/[,()]/g, " ").replace(/\s+/g, " ");
      q = q.or(`label.ilike.%${s}%,serial.ilike.%${s}%,location.ilike.%${s}%`);
    }

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const storeIds = Array.from(new Set((rows ?? []).map((r: any) => r.store_id).filter(Boolean)));
    const storesMap = new Map<string, string>();
    if (storeIds.length) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name").in("id", storeIds);
      (stores ?? []).forEach((s: any) => storesMap.set(s.id, s.name));
    }

    // Redact config; only expose whether it's populated.
    return {
      rows: (rows ?? []).map((r: any) => {
        const { config, ...safe } = r;
        return {
          ...safe,
          store_name: storesMap.get(r.store_id) ?? "—",
          has_config: !!config && Object.keys(config ?? {}).length > 0,
        };
      }),
      count: count ?? 0,
      page,
      pageSize,
      sortBy,
      sortDir,
    };
  });

export const adminDeviceCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [all, active, inactive, revoked, online, offline] = await Promise.all([
      supabaseAdmin.from("payment_terminals").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("payment_terminals").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("payment_terminals").select("*", { count: "exact", head: true }).eq("status", "inactive"),
      supabaseAdmin.from("payment_terminals").select("*", { count: "exact", head: true }).eq("status", "revoked"),
      supabaseAdmin.from("payment_terminals").select("*", { count: "exact", head: true }).gte("last_seen_at", cutoff),
      supabaseAdmin
        .from("payment_terminals")
        .select("*", { count: "exact", head: true })
        .or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`),
    ]);
    const providersRes = await supabaseAdmin.from("payment_terminals").select("provider");
    const providers = Array.from(
      new Set(
        ((providersRes.data ?? []) as { provider: string | null }[])
          .map((r) => r.provider)
          .filter((p): p is string => !!p),
      ),
    ).sort();
    return {
      all: all.count ?? 0,
      active: active.count ?? 0,
      inactive: inactive.count ?? 0,
      revoked: revoked.count ?? 0,
      online: online.count ?? 0,
      offline: offline.count ?? 0,
      providers,
    };
  });

// ============================================================================
// Subscriptions
// ============================================================================

export const adminListSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { filter?: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(100, data.pageSize ?? 50);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabaseAdmin
      .from("subscriptions")
      .select(
        "id, store_id, user_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, environment, stripe_customer_id, stripe_subscription_id, updated_at",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (data.filter && data.filter !== "all") q = q.eq("status", data.filter);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    const storeIds = Array.from(new Set((rows ?? []).map((r: any) => r.store_id).filter(Boolean)));
    const storesMap = new Map<string, { name: string; email: string | null }>();
    if (storeIds.length) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name, email").in("id", storeIds);
      (stores ?? []).forEach((s: any) => storesMap.set(s.id, { name: s.name, email: s.email }));
    }
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        store_name: storesMap.get(r.store_id)?.name ?? "—",
        store_email: storesMap.get(r.store_id)?.email ?? null,
      })),
      count: count ?? 0,
      page,
      pageSize,
    };
  });

export const adminRefreshSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, store_id, stripe_subscription_id, environment")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) throw new Error("Subscription not linked to Stripe");
    try {
      const stripe = createStripeClient(data.environment);
      const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const item = s.items?.data?.[0];
      const periodEnd = (item as any)?.current_period_end ?? (s as any).current_period_end;
      const periodStart = (item as any)?.current_period_start ?? (s as any).current_period_start;
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: s.status,
          current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancel_at_period_end: s.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.subscriptionId);
      if (sub.store_id) {
        try { await supabaseAdmin.rpc("recompute_store_plan", { _store_id: sub.store_id }); } catch {}
      }
      await writeAudit(supabaseAdmin, {
        actor_id: context.userId,
        actor_email: admin.email,
        store_id: sub.store_id ?? null,
        action: "admin.subscription.refresh",
        entity: "subscription",
        entity_id: data.subscriptionId,
        details: { stripe_status: s.status },
      });
      return { ok: true, status: s.status };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const adminCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: StripeEnv; reason: string; atPeriodEnd: boolean }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, store_id, stripe_subscription_id")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) throw new Error("Subscription not linked to Stripe");
    try {
      const stripe = createStripeClient(data.environment);
      const updated = data.atPeriodEnd
        ? await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true })
        : await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: updated.status,
          cancel_at_period_end: updated.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.subscriptionId);
      await writeAudit(supabaseAdmin, {
        actor_id: context.userId,
        actor_email: admin.email,
        store_id: sub.store_id ?? null,
        action: data.atPeriodEnd ? "admin.subscription.cancel_at_period_end" : "admin.subscription.cancel_now",
        entity: "subscription",
        entity_id: data.subscriptionId,
        details: { reason },
      });
      return { ok: true, status: updated.status };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const adminRestoreSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: StripeEnv; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, store_id, stripe_subscription_id")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) throw new Error("Subscription not linked to Stripe");
    try {
      const stripe = createStripeClient(data.environment);
      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: false,
      });
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: updated.status,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.subscriptionId);
      await writeAudit(supabaseAdmin, {
        actor_id: context.userId,
        actor_email: admin.email,
        store_id: sub.store_id ?? null,
        action: "admin.subscription.restore",
        entity: "subscription",
        entity_id: data.subscriptionId,
        details: { reason },
      });
      return { ok: true, status: updated.status };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// ============================================================================
// Support tickets
// ============================================================================

export const adminListTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      status?: string;
      priority?: string;
      assignee?: string; // "me" | "unassigned" | "any" | uuid
      storeId?: string;
      q?: string;
      sort?: string; // updated_at | created_at | priority
      dir?: "asc" | "desc";
      page?: number;
      pageSize?: number;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(100, data.pageSize ?? 25);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const sortCol = ["updated_at", "created_at", "priority", "status"].includes(data.sort ?? "")
      ? (data.sort as string)
      : "updated_at";
    const ascending = data.dir === "asc";
    let q = supabaseAdmin
      .from("support_tickets")
      .select("*", { count: "exact" })
      .order(sortCol, { ascending })
      .range(from, to);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.priority && data.priority !== "all") q = q.eq("priority", data.priority);
    if (data.storeId) q = q.eq("store_id", data.storeId);
    if (data.assignee === "me") q = q.eq("assigned_admin_id", context.userId);
    else if (data.assignee === "unassigned") q = q.is("assigned_admin_id", null);
    else if (data.assignee && data.assignee !== "any") q = q.eq("assigned_admin_id", data.assignee);
    if (data.q?.trim()) {
      const term = data.q.trim().replace(/[%,()]/g, "");
      q = q.or(`subject.ilike.%${term}%,requester_email.ilike.%${term}%`);
    }
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    const storeIds = Array.from(new Set((rows ?? []).map((r: any) => r.store_id).filter(Boolean)));
    const assigneeIds = Array.from(new Set((rows ?? []).map((r: any) => r.assigned_admin_id).filter(Boolean)));
    const storesMap = new Map<string, string>();
    const agentsMap = new Map<string, string>();
    if (storeIds.length) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name").in("id", storeIds);
      (stores ?? []).forEach((s: any) => storesMap.set(s.id, s.name));
    }
    if (assigneeIds.length) {
      const { data: agents } = await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", assigneeIds);
      (agents ?? []).forEach((a: any) => agentsMap.set(a.id, a.full_name || a.email));
    }
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        store_name: storesMap.get(r.store_id) ?? null,
        assignee_name: r.assigned_admin_id ? agentsMap.get(r.assigned_admin_id) ?? null : null,
      })),
      count: count ?? 0,
      page,
      pageSize,
    };
  });

export const adminTicketCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const statuses = ["open", "investigating", "waiting_for_merchant", "resolved", "closed"];
    const counts: Record<string, number> = { all: 0, mine: 0, unassigned: 0, urgent: 0 };
    for (const s of statuses) counts[s] = 0;
    const [{ count: total }, { count: mine }, { count: unassigned }, { count: urgent }] = await Promise.all([
      supabaseAdmin.from("support_tickets").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("support_tickets").select("*", { count: "exact", head: true }).eq("assigned_admin_id", context.userId).not("status", "in", "(resolved,closed)"),
      supabaseAdmin.from("support_tickets").select("*", { count: "exact", head: true }).is("assigned_admin_id", null).not("status", "in", "(resolved,closed)"),
      supabaseAdmin.from("support_tickets").select("*", { count: "exact", head: true }).eq("priority", "urgent").not("status", "in", "(resolved,closed)"),
    ]);
    counts.all = total ?? 0;
    counts.mine = mine ?? 0;
    counts.unassigned = unassigned ?? 0;
    counts.urgent = urgent ?? 0;
    for (const s of statuses) {
      const { count } = await supabaseAdmin.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", s);
      counts[s] = count ?? 0;
    }
    return counts;
  });

export const adminListSupportAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["super_admin", "operations_admin", "support_admin"]);
    const ids = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    return (profs ?? []).map((p: any) => ({ id: p.id, email: p.email, name: p.full_name || p.email }));
  });

export const adminGetTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");
    const { data: notes } = await supabaseAdmin
      .from("support_ticket_notes")
      .select("*")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: true });
    let store = null;
    if (ticket.store_id) {
      const { data: s } = await supabaseAdmin.from("stores").select("id, name, email").eq("id", ticket.store_id).maybeSingle();
      store = s ?? null;
    }
    let assignee = null;
    if (ticket.assigned_admin_id) {
      const { data: a } = await supabaseAdmin.from("profiles").select("id, email, full_name").eq("id", ticket.assigned_admin_id).maybeSingle();
      assignee = a ?? null;
    }
    return { ticket, notes: notes ?? [], store, assignee };
  });

export const adminCreateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      storeId?: string;
      subject: string;
      category?: string;
      priority?: string;
      body?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const admin = await ensureSupportStaff(context);
    if (!data.subject.trim()) throw new Error("Subject required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        store_id: data.storeId ?? null,
        subject: data.subject.trim(),
        category: data.category ?? "general",
        priority: data.priority ?? "normal",
        status: "open",
        assigned_admin_id: context.userId,
        requester_email: admin.email,
      })
      .select("id, ticket_number")
      .single();
    if (error) throw new Error(error.message);
    if (data.body?.trim()) {
      await supabaseAdmin.from("support_ticket_notes").insert({
        ticket_id: t.id,
        author_id: context.userId,
        author_email: admin.email,
        body: data.body.trim(),
        internal: false,
      });
    }
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: data.storeId ?? null,
      action: "admin.ticket.create",
      entity: "ticket",
      entity_id: t.id,
      details: { subject: data.subject, priority: data.priority ?? "normal" },
    });
    return { ok: true, id: t.id, ticket_number: t.ticket_number };
  });

export const adminUpdateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      ticketId: string;
      status?: string;
      priority?: string;
      category?: string;
      assigned_admin_id?: string | null;
      resolution?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const admin = await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = {};
    for (const k of ["status", "priority", "category", "assigned_admin_id", "resolution"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (Object.keys(patch).length === 0) throw new Error("Nothing to update");
    const { data: t } = await supabaseAdmin.from("support_tickets").select("store_id").eq("id", data.ticketId).maybeSingle();
    const { error } = await supabaseAdmin.from("support_tickets").update(patch as any).eq("id", data.ticketId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: t?.store_id ?? null,
      action: "admin.ticket.update",
      entity: "ticket",
      entity_id: data.ticketId,
      details: patch,
    });
    return { ok: true };
  });

export const adminClaimTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Claiming assigns ownership but must NEVER remove the ticket from active
    // work — do not change status here. Staff explicitly transition status
    // via adminUpdateTicket when they begin investigating or resolve.
    const { data: existing } = await supabaseAdmin
      .from("support_tickets")
      .select("status, assigned_admin_id")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!existing) throw new Error("Ticket not found");
    const { error } = await supabaseAdmin
      .from("support_tickets")
      .update({ assigned_admin_id: context.userId, updated_at: new Date().toISOString() })
      .eq("id", data.ticketId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      action: "admin.ticket.claim",
      entity: "ticket",
      entity_id: data.ticketId,
      details: { previous_status: existing.status, previous_assignee: existing.assigned_admin_id },
    });
    return { ok: true };
  });

export const adminAddTicketNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string; body: string; internal: boolean }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSupportStaff(context);
    if (!data.body.trim()) throw new Error("Note body required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("support_ticket_notes").insert({
      ticket_id: data.ticketId,
      author_id: context.userId,
      author_email: admin.email,
      body: data.body.trim(),
      internal: data.internal,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Audit logs
// ============================================================================

export const adminListAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { storeId?: string; action?: string; actorEmail?: string; entity?: string; from?: string; to?: string; page?: number; pageSize?: number }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(200, data.pageSize ?? 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = supabaseAdmin
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.storeId) q = q.eq("store_id", data.storeId);
    if (data.action) q = q.ilike("action", `%${data.action}%`);
    if (data.actorEmail) q = q.ilike("actor_email", `%${data.actorEmail}%`);
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0, page, pageSize };
  });

export const adminAuditFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Pull recent distinct action/entity values for facet dropdowns.
    const { data: rows } = await supabaseAdmin
      .from("audit_log")
      .select("action, entity")
      .order("created_at", { ascending: false })
      .limit(2000);
    const actions = Array.from(new Set((rows ?? []).map((r: any) => r.action).filter(Boolean))).sort();
    const entities = Array.from(new Set((rows ?? []).map((r: any) => r.entity).filter(Boolean))).sort();
    return { actions, entities };
  });

export const adminExportAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { storeId?: string; action?: string; actorEmail?: string; entity?: string; from?: string; to?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_log")
      .select("created_at, actor_email, action, entity, entity_id, store_id, details")
      .order("created_at", { ascending: false })
      .limit(10000);
    if (data.storeId) q = q.eq("store_id", data.storeId);
    if (data.action) q = q.ilike("action", `%${data.action}%`);
    if (data.actorEmail) q = q.ilike("actor_email", `%${data.actorEmail}%`);
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const esc = (v: any) => {
      if (v == null) return "";
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "created_at,actor_email,action,entity,entity_id,store_id,details";
    const body = (rows ?? []).map((r: any) => [r.created_at, r.actor_email, r.action, r.entity, r.entity_id, r.store_id, r.details].map(esc).join(",")).join("\n");
    return { csv: `${header}\n${body}`, count: rows?.length ?? 0 };
  });

export const adminSubscriptionStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("id, store_id, status, price_id, environment, current_period_end, cancel_at_period_end, updated_at");
    const rows = subs ?? [];
    const counts: Record<string, number> = { total: rows.length };
    const byTier: Record<string, number> = {};
    const byEnv: Record<string, number> = { sandbox: 0, live: 0 };
    let mrrCents = 0;
    // Rough price mapping in USD cents; matches plan_tier_for_price mapping.
    const priceMap: Record<string, number> = { starter_monthly: 2900, pro_monthly: 6900, business_monthly: 14900 };
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      byEnv[r.environment] = (byEnv[r.environment] ?? 0) + 1;
      if (r.status === "active" || r.status === "trialing") {
        byTier[r.price_id ?? "unknown"] = (byTier[r.price_id ?? "unknown"] ?? 0) + 1;
        if (r.status === "active" && r.environment === "live") {
          mrrCents += priceMap[r.price_id ?? ""] ?? 0;
        }
      }
    }
    const pastDue = rows.filter((r: any) => r.status === "past_due");
    const storeIds = Array.from(new Set(pastDue.map((r: any) => r.store_id).filter(Boolean)));
    const storesMap = new Map<string, { name: string; email: string | null }>();
    if (storeIds.length) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name, email").in("id", storeIds);
      (stores ?? []).forEach((s: any) => storesMap.set(s.id, { name: s.name, email: s.email }));
    }
    return {
      counts,
      by_tier: byTier,
      by_env: byEnv,
      mrr_usd: mrrCents / 100,
      past_due: pastDue.map((r: any) => ({
        id: r.id,
        store_id: r.store_id,
        store_name: storesMap.get(r.store_id)?.name ?? "—",
        store_email: storesMap.get(r.store_id)?.email ?? null,
        price_id: r.price_id,
        current_period_end: r.current_period_end,
      })),
    };
  });



// ============================================================================
// Support view sessions
// ============================================================================

export const adminStartSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storeId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cancel any pre-existing pending request from this admin for this store.
    await supabaseAdmin
      .from("admin_support_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("admin_id", context.userId)
      .eq("store_id", data.storeId)
      .eq("status", "pending");

    const expires = new Date(Date.now() + 30 * 60_000).toISOString();
    const { data: row, error } = await supabaseAdmin
      .from("admin_support_sessions")
      .insert({
        admin_id: context.userId,
        admin_email: admin.email,
        store_id: data.storeId,
        reason,
        expires_at: expires,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select("id, expires_at, status")
      .single();
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: data.storeId,
      action: "admin.support_view.request",
      entity: "support_session",
      entity_id: row.id,
      details: { reason },
    });
    return { ok: true, id: row.id, expires_at: row.expires_at, status: row.status };
  });

export const adminCancelSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sess } = await supabaseAdmin
      .from("admin_support_sessions")
      .select("store_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!sess || sess.status !== "pending") return { ok: true };
    const { error } = await supabaseAdmin
      .from("admin_support_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: admin.email,
      store_id: sess.store_id,
      action: "admin.support_view.cancel",
      entity: "support_session",
      entity_id: data.sessionId,
    });
    return { ok: true };
  });

export const adminEndSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { runSafeAction } = await import("@/lib/admin/safe-action.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("admin_support_sessions")
      .select("id, store_id, status, ended_at, expires_at")
      .eq("id", data.sessionId)
      .maybeSingle();
    await runSafeAction({
      context,
      permission: "support.end_view",
      danger: "sensitive",
      action: "admin.support_view.end",
      entity: "support_session",
      entityId: data.sessionId,
      storeId: before?.store_id ?? null,
      reason: data.reason ?? "Admin ended support view",
      before,
      apply: async () => {
        const { error } = await supabaseAdmin
          .from("admin_support_sessions")
          .update({ ended_at: new Date().toISOString(), status: "ended" })
          .eq("id", data.sessionId)
          .is("ended_at", null);
        if (error) throw new Error(error.message);
        return { ended: true };
      },
      captureAfter: async () => {
        const { data: after } = await supabaseAdmin
          .from("admin_support_sessions")
          .select("id, status, ended_at")
          .eq("id", data.sessionId)
          .maybeSingle();
        return after;
      },
    });
    return { ok: true };
  });

export const adminMyActiveSupportSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;
    const { data } = await admin
      .from("admin_support_sessions")
      .select("id, store_id, started_at, expires_at, reason, status, decided_at, decision_note, requested_at, decided_by, client_capability, client_metadata, channel_token")
      .eq("admin_id", context.userId)
      .in("status", ["pending", "active"])
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || !data.store_id) return { session: null };

    // Enrich with business + employee context for the admin banner.
    const [storeRes, employeeRes] = await Promise.all([
      supabaseAdmin.from("stores").select("id, name, store_code").eq("id", data.store_id).maybeSingle(),
      data.decided_by
        ? supabaseAdmin.from("profiles").select("id, full_name, email, employee_id").eq("id", data.decided_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const session = {
      id: data.id as string,
      store_id: data.store_id as string,
      status: data.status as string,
      started_at: (data.started_at as string | null) ?? null,
      expires_at: data.expires_at as string,
      client_capability: (data.client_capability as string | null) ?? null,
      channel_token: data.channel_token as string,
      // Serialize metadata as a JSON string to satisfy strict server-fn
      // serializer; consumers parse it back.
      client_metadata_json: data.client_metadata ? JSON.stringify(data.client_metadata) : null,
      store: storeRes.data ?? null,
      accepted_by: employeeRes.data ?? null,
    };
    return { session };
  });

// ============================================================================
// Merchant-side response to a support view request
// ============================================================================

export const merchantRespondSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      sessionId: string;
      decision: "accept" | "decline";
      note?: string;
      clientCapability?: "web_screen_share" | "android_diagnostics_only" | "android_screen_share";
      clientMetadata?: Record<string, unknown> | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    if (data.decision !== "accept" && data.decision !== "decline") {
      throw new Error("Invalid decision");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin;

    const { data: profile } = await admin
      .from("profiles")
      .select("id, store_id, full_name, email, employee_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.store_id) throw new Error("No store associated with this user");

    const { data: sess } = await admin
      .from("admin_support_sessions")
      .select("id, store_id, status, admin_id, admin_email, reason")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!sess) throw new Error("Support request not found");
    if (sess.store_id !== profile.store_id) throw new Error("Not authorized");
    if (sess.status !== "pending") throw new Error("Request already resolved");

    // Sanitize any client-supplied metadata — strip forbidden keys.
    const FORBIDDEN = /(pin|password|token|secret|apikey|api_key|authorization|card|cvv|cvc|track|pan|refresh)/i;
    function scrub(v: unknown): unknown {
      if (v == null || typeof v !== "object") return v;
      const out: Record<string, unknown> = Array.isArray(v) ? ([] as unknown as Record<string, unknown>) : {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (FORBIDDEN.test(k)) continue;
        out[k] = typeof val === "object" && val !== null ? scrub(val) : val;
      }
      return out;
    }
    const safeMetadata = data.clientMetadata ? scrub(data.clientMetadata) : null;
    const capability =
      data.clientCapability === "web_screen_share" ||
      data.clientCapability === "android_diagnostics_only" ||
      data.clientCapability === "android_screen_share"
        ? data.clientCapability
        : null;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> =
      data.decision === "accept"
        ? {
            status: "active",
            decided_at: now,
            decided_by: context.userId,
            decision_note: data.note ?? null,
            started_at: now,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            client_capability: capability,
            client_metadata: safeMetadata,
          }
        : {
            status: "declined",
            decided_at: now,
            decided_by: context.userId,
            decision_note: data.note ?? null,
            ended_at: now,
          };
    const { error } = await admin
      .from("admin_support_sessions")
      .update(patch)
      .eq("id", data.sessionId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: profile.email,
      store_id: profile.store_id,
      action:
        data.decision === "accept"
          ? "merchant.support_view.accept"
          : "merchant.support_view.decline",
      entity: "support_session",
      entity_id: data.sessionId,
      details: {
        admin_id: sess.admin_id,
        admin_email: sess.admin_email,
        employee_name: profile.full_name ?? profile.email,
        employee_id: profile.employee_id,
        reason: sess.reason,
        note: data.note ?? null,
        client_capability: capability,
      },
    });
    return { ok: true, status: patch.status as string };
  });

export const merchantEndSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string; note?: string }) => data)

  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, store_id, full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.store_id) throw new Error("No store associated");
    const { data: sess } = await supabaseAdmin
      .from("admin_support_sessions")
      .select("id, store_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!sess || sess.store_id !== profile.store_id) throw new Error("Not authorized");
    if (sess.status === "ended" || sess.status === "declined" || sess.status === "expired") {
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("admin_support_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: profile.email,
      store_id: profile.store_id,
      action: "merchant.support_view.end",
      entity: "support_session",
      entity_id: data.sessionId,
      details: { employee_name: profile.full_name ?? profile.email, note: data.note ?? null },
    });
    return { ok: true };
  });



// ============================================================================
// Platform health
// ============================================================================

export const adminPlatformHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dbOk = await supabaseAdmin.from("stores").select("id", { head: true, count: "exact" }).limit(1);
    return {
      database: dbOk.error ? { ok: false, error: dbOk.error.message } : { ok: true },
      stripe_sandbox: { configured: !!process.env.STRIPE_SANDBOX_API_KEY },
      stripe_live: { configured: !!process.env.STRIPE_LIVE_API_KEY },
      email: { configured: true },
      app_version: process.env.LOVABLE_BUILD_ID ?? "dev",
    };
  });
