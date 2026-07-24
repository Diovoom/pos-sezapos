import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FOUNDER_EMAIL = "admin@sezapos.com";
const COMPANY_ROLES = [
  "super_admin",
  "operations_admin",
  "support_admin",
  "billing_admin",
  "analyst",
] as const;

type ServerContext = { supabase: any; userId: string };

async function currentIdentity(context: ServerContext) {
  const [{ data: roleRows, error }, { data: userRes }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.auth.getUser(),
  ]);
  if (error) throw new Error("Authorization check failed");
  const roles: string[] = (roleRows ?? []).map((row: any) => String(row.role));
  const email = String(userRes?.user?.email ?? "").toLowerCase();
  return { roles, email };
}

async function ensurePlatformStaff(context: ServerContext) {
  const identity = await currentIdentity(context);
  if (!identity.roles.some((role) => (COMPANY_ROLES as readonly string[]).includes(role))) {
    throw new Error("Forbidden: SEZA company staff required");
  }
  return identity;
}

async function ensureSupportStaff(context: ServerContext) {
  const identity = await ensurePlatformStaff(context);
  const allowed = ["super_admin", "operations_admin", "support_admin"];
  if (!identity.roles.some((role) => allowed.includes(role))) {
    throw new Error("Forbidden: support access required");
  }
  return identity;
}

async function ensureFounder(context: ServerContext) {
  const identity = await ensurePlatformStaff(context);
  if (identity.email !== FOUNDER_EMAIL || !identity.roles.includes("super_admin")) {
    throw new Error("Forbidden: Founder & CEO access required");
  }
  return identity;
}

async function audit(
  supabaseAdmin: any,
  context: ServerContext,
  identity: { email: string },
  input: {
    action: string;
    entity?: string;
    entityId?: string | null;
    storeId?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await supabaseAdmin.from("audit_log").insert({
    actor_id: context.userId,
    actor_email: identity.email || null,
    store_id: input.storeId ?? null,
    action: input.action,
    entity: input.entity ?? null,
    entity_id: input.entityId ?? null,
    details: input.details ?? {},
  });
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function requireReason(value: unknown, label = "Reason", min = 4) {
  const reason = cleanText(value, 2000);
  if (reason.length < min) throw new Error(`${label} must be at least ${min} characters`);
  return reason;
}

function isMissingRelationError(error: any, relation?: string) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || message.includes("schema cache")
    || message.includes("does not exist")
    || Boolean(relation && message.includes(relation.toLowerCase()) && message.includes("not find"));
}

function missingColumnName(error: any): string | null {
  const message = String(error?.message ?? error ?? "");
  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]?([a-zA-Z0-9_]+)['"]? does not exist/i,
    /schema cache.*?['"]([^'"]+)['"]/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Update support_tickets while remaining compatible with production schemas
 * that have not received every optional support-workflow column yet. Core
 * fields (status / assignee / resolution / updated_at) are always attempted;
 * only the exact missing optional column reported by PostgREST is removed.
 */
async function updateSupportTicketCompat(
  supabaseAdmin: any,
  ticketId: string,
  input: Record<string, unknown>,
) {
  const patch: Record<string, unknown> = { ...input };
  const removed: string[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const keys = Object.keys(patch);
    if (!keys.length) throw new Error("No compatible support-ticket fields are available");
    const { error } = await (supabaseAdmin.from as any)("support_tickets")
      .update(patch)
      .eq("id", ticketId);
    if (!error) return { removed };
    const column = missingColumnName(error);
    if (column && Object.prototype.hasOwnProperty.call(patch, column)) {
      delete patch[column];
      removed.push(column);
      continue;
    }
    throw new Error(error.message ?? "Support case update failed");
  }
  throw new Error("Support case update could not be applied to the current database schema");
}

async function readPlatformSettingsAuditFallback(supabaseAdmin: any) {
  const { data, error } = await supabaseAdmin
    .from("audit_log")
    .select("details,created_at")
    .eq("action", "admin.platform_settings.update")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.details && typeof data.details === "object" ? data.details : null;
}

async function withTimeout<T>(promise: PromiseLike<T>, fallback: T, timeoutMs = 7000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise).catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readOptionalStaffProfile(supabaseAdmin: any, userId: string) {
  const result = await (supabaseAdmin.from as any)("admin_staff_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error && !isMissingRelationError(result.error, "admin_staff_profiles")) {
    throw new Error(result.error.message);
  }
  return result.data ?? null;
}

async function readOptionalStaffProfiles(supabaseAdmin: any, userIds: string[]) {
  if (!userIds.length) return [];
  const result = await (supabaseAdmin.from as any)("admin_staff_profiles")
    .select("user_id,title,department,employment_status,phone,started_on,manager_user_id,notification_preferences,notes,updated_at")
    .in("user_id", userIds);
  if (result.error && !isMissingRelationError(result.error, "admin_staff_profiles")) {
    throw new Error(result.error.message);
  }
  return result.data ?? [];
}

async function upsertOptionalStaffProfile(supabaseAdmin: any, row: Record<string, unknown>) {
  const result = await (supabaseAdmin.from as any)("admin_staff_profiles")
    .upsert(row, { onConflict: "user_id" });
  if (result.error && !isMissingRelationError(result.error, "admin_staff_profiles")) {
    throw new Error(result.error.message);
  }
  return !result.error;
}

async function ensureAdminProfile(supabaseAdmin: any, userId: string) {
  const existing = await supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,phone,status,avatar_url,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const authResult = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = authResult?.data?.user;
  if (!user) throw new Error("Staff member not found");
  const fullName = cleanText(user.user_metadata?.full_name || user.user_metadata?.name || user.email, 160);
  const row = {
    id: user.id,
    email: user.email ?? null,
    full_name: fullName || user.email || "SEZA Staff",
    phone: cleanText(user.user_metadata?.phone, 80) || null,
    store_id: null,
    status: "active",
  };
  const saved = await supabaseAdmin.from("profiles").upsert(row, { onConflict: "id" }).select("id,email,full_name,phone,status,avatar_url,created_at").maybeSingle();
  if (saved.error) throw new Error(saved.error.message);
  return saved.data ?? row;
}

async function companyStaffRows(supabaseAdmin: any) {
  const { data: roleRows, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role, created_at")
    .in("role", COMPANY_ROLES as unknown as any);
  if (error) throw new Error(error.message);

  const userIds: string[] = Array.from(new Set<string>((roleRows ?? []).map((row: any) => String(row.user_id)).filter(Boolean)));
  if (!userIds.length) return [];

  const [profilesResult, staff, activeCasesResult, auditsResult] = await Promise.all([
    withTimeout(
      supabaseAdmin.from("profiles").select("id, full_name, email, phone, avatar_url, status, created_at").in("id", userIds),
      { data: [], error: null } as any,
    ),
    readOptionalStaffProfiles(supabaseAdmin, userIds),
    withTimeout(
      supabaseAdmin.from("support_tickets").select("assigned_admin_id").in("assigned_admin_id", userIds).not("status", "in", "(resolved,closed)"),
      { data: [], error: null } as any,
    ),
    withTimeout(
      supabaseAdmin.from("audit_log").select("actor_id, created_at, action").in("actor_id", userIds).order("created_at", { ascending: false }).limit(500),
      { data: [], error: null } as any,
    ),
  ]);

  const profiles = [...(profilesResult.data ?? [])];
  const existingIds = new Set(profiles.map((profile: any) => profile.id));
  const missingIds = userIds.filter((id) => !existingIds.has(id));
  if (missingIds.length) {
    const recovered = await Promise.all(missingIds.map(async (id) => {
      try { return await ensureAdminProfile(supabaseAdmin, id); } catch { return null; }
    }));
    profiles.push(...recovered.filter(Boolean));
  }

  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
  const staffMap = new Map((staff ?? []).map((p: any) => [p.user_id, p]));
  const rolesMap = new Map<string, string[]>();
  for (const row of roleRows ?? []) {
    const list = rolesMap.get(row.user_id) ?? [];
    if (!list.includes(String(row.role))) list.push(String(row.role));
    rolesMap.set(row.user_id, list);
  }
  const workload = new Map<string, number>();
  for (const row of activeCasesResult.data ?? []) {
    if (row.assigned_admin_id) workload.set(row.assigned_admin_id, (workload.get(row.assigned_admin_id) ?? 0) + 1);
  }
  const lastActivity = new Map<string, { created_at: string; action: string }>();
  for (const row of auditsResult.data ?? []) {
    if (row.actor_id && !lastActivity.has(row.actor_id)) lastActivity.set(row.actor_id, { created_at: row.created_at, action: row.action });
  }

  return userIds.map((id) => {
    const profile: any = profileMap.get(id) ?? {};
    const meta: any = staffMap.get(id) ?? {};
    const email = String(profile.email ?? "").toLowerCase();
    const founder = email === FOUNDER_EMAIL;
    return {
      id,
      full_name: profile.full_name || profile.email || (founder ? "Dave Marcelin" : "SEZA Staff"),
      email: profile.email ?? null,
      avatar_url: profile.avatar_url ?? null,
      account_status: profile.status ?? "active",
      title: founder ? "Founder & CEO" : meta.title ?? null,
      department: founder ? "Executive" : meta.department ?? "Operations",
      employment_status: founder ? "active" : meta.employment_status ?? "active",
      phone: meta.phone ?? profile.phone ?? null,
      started_on: meta.started_on ?? null,
      roles: rolesMap.get(id) ?? [],
      active_cases: workload.get(id) ?? 0,
      last_activity_at: lastActivity.get(id)?.created_at ?? null,
      last_action: lastActivity.get(id)?.action ?? null,
      is_founder: founder,
    };
  }).sort((a, b) => Number(b.is_founder) - Number(a.is_founder) || a.full_name.localeCompare(b.full_name));
}


async function loadTrialConversionRows(supabaseAdmin: any) {
  const { data: payments, error } = await (supabaseAdmin.from as any)("merchant_billing_payments")
    .select("*")
    .in("status", ["paid", "succeeded"])
    .gt("amount_paid_cents", 0)
    .not("stripe_subscription_id", "is", null)
    .order("occurred_at", { ascending: true })
    .limit(10000);
  if (error) throw new Error(error.message);

  const paymentStoreIds = Array.from(
    new Set((payments ?? []).map((payment: any) => payment.store_id).filter(Boolean)),
  );
  if (!paymentStoreIds.length) return [];

  const [{ data: stores }, { data: subscriptions }] = await Promise.all([
    supabaseAdmin
      .from("stores")
      .select("id,name,email,plan_tier,plan_status,trial_ends_at,created_at")
      .in("id", paymentStoreIds),
    supabaseAdmin
      .from("subscriptions")
      .select("store_id,status,price_id,product_id,current_period_start,current_period_end,environment,stripe_subscription_id,created_at")
      .in("store_id", paymentStoreIds)
      .order("created_at", { ascending: false }),
  ]);

  const storeMap = new Map((stores ?? []).map((store: any) => [store.id, store]));
  const subscriptionMap = new Map<string, any>();
  for (const subscription of subscriptions ?? []) {
    if (subscription.store_id && !subscriptionMap.has(subscription.store_id)) {
      subscriptionMap.set(subscription.store_id, subscription);
    }
  }

  // A sale is counted only once: the merchant's earliest successful SEZA
  // subscription invoice on or after the recorded free-trial end.
  const firstQualifiedPayment = new Map<string, any>();
  for (const payment of payments ?? []) {
    const storeId = payment.store_id as string | null;
    if (!storeId || firstQualifiedPayment.has(storeId)) continue;
    const store: any = storeMap.get(storeId);
    if (!store?.trial_ends_at) continue;
    const paidAt = payment.paid_at ?? payment.occurred_at;
    if (!paidAt) continue;
    if (new Date(paidAt).getTime() < new Date(store.trial_ends_at).getTime()) continue;
    firstQualifiedPayment.set(storeId, payment);
  }

  return Array.from(firstQualifiedPayment.entries()).map(([storeId, payment]) => ({
    store_id: storeId,
    store: storeMap.get(storeId) ?? null,
    subscription: subscriptionMap.get(storeId) ?? null,
    first_payment: payment,
    converted_at: payment.paid_at ?? payment.occurred_at,
    amount_cents: Number(payment.amount_paid_cents ?? 0),
    environment: payment.environment,
  }));
}

export const adminOperationsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const offlineCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

    const safe = <T>(promise: PromiseLike<T>, fallback: T) => withTimeout(promise, fallback, 8000);
    const emptyCount = { count: 0, data: [], error: null } as any;
    const emptyRows = { data: [], error: null } as any;

    const [businesses, active, trials, pastDue, registers, offlineRegisters, openCases, urgentCases, activeChats, paidThisMonth, conversions, recentCases, recentPayments] = await Promise.all([
      safe(supabaseAdmin.from("stores").select("id", { count: "exact", head: true }), emptyCount),
      safe(supabaseAdmin.from("stores").select("id", { count: "exact", head: true }).eq("plan_status", "active"), emptyCount),
      safe(supabaseAdmin.from("stores").select("id", { count: "exact", head: true }).eq("plan_status", "trialing"), emptyCount),
      safe(supabaseAdmin.from("stores").select("id", { count: "exact", head: true }).eq("plan_status", "past_due"), emptyCount),
      safe(supabaseAdmin.from("device_registrations").select("id", { count: "exact", head: true }).eq("status", "active"), emptyCount),
      safe(supabaseAdmin.from("device_registrations").select("id", { count: "exact", head: true }).eq("status", "active").or(`last_seen_at.is.null,last_seen_at.lt.${offlineCutoff}`), emptyCount),
      safe(supabaseAdmin.from("support_tickets").select("id", { count: "exact", head: true }).not("status", "in", "(resolved,closed)"), emptyCount),
      safe(supabaseAdmin.from("support_tickets").select("id", { count: "exact", head: true }).eq("priority", "urgent").not("status", "in", "(resolved,closed)"), emptyCount),
      safe(supabaseAdmin.from("support_tickets").select("id", { count: "exact", head: true }).not("status", "in", "(resolved,closed)"), emptyCount),
      safe((supabaseAdmin.from as any)("merchant_billing_payments").select("amount_paid_cents,status", { count: "exact" }).in("status", ["paid", "succeeded"]).gte("occurred_at", monthStart.toISOString()).limit(1000), emptyRows),
      safe((supabaseAdmin.from as any)("merchant_billing_payments").select("store_id").in("status", ["paid", "succeeded"]).eq("billing_reason", "subscription_create").gte("occurred_at", thirtyDaysAgo).limit(1000), emptyRows),
      safe(supabaseAdmin.from("support_tickets").select("id,ticket_number,subject,status,priority,store_id,assigned_admin_id,updated_at").order("updated_at", { ascending: false }).limit(8), emptyRows),
      safe((supabaseAdmin.from as any)("merchant_billing_payments").select("id,store_id,status,amount_paid_cents,currency,occurred_at,environment").order("occurred_at", { ascending: false }).limit(8), emptyRows),
    ]);

    const paidRows = paidThisMonth.data ?? [];
    const paymentVolumeCents = paidRows.reduce((sum: number, row: any) => sum + Number(row.amount_paid_cents ?? 0), 0);
    const conversionStoreIds = new Set((conversions.data ?? []).map((row: any) => row.store_id).filter(Boolean));
    const storeIds = Array.from(new Set([
      ...(recentCases.data ?? []).map((row: any) => row.store_id),
      ...(recentPayments.data ?? []).map((row: any) => row.store_id),
    ].filter(Boolean)));
    const storeMap = new Map<string, string>();
    if (storeIds.length) {
      const storesResult = await safe(supabaseAdmin.from("stores").select("id,name").in("id", storeIds), emptyRows);
      for (const store of storesResult.data ?? []) storeMap.set(store.id, store.name);
    }

    return {
      totals: {
        businesses: businesses.count ?? 0, active: active.count ?? 0, trialing: trials.count ?? 0, past_due: pastDue.count ?? 0,
        registers: registers.count ?? 0, offline_registers: offlineRegisters.count ?? 0, open_cases: openCases.count ?? 0,
        urgent_cases: urgentCases.count ?? 0, active_chats: activeChats.count ?? 0, payments_this_month: paidThisMonth.count ?? paidRows.length,
        payment_volume_cents: paymentVolumeCents, conversions_30d: conversionStoreIds.size,
      },
      recent_cases: (recentCases.data ?? []).map((row: any) => ({
        ...row,
        store_name: storeMap.get(row.store_id) ?? null,
        chat_status: ["resolved", "closed"].includes(String(row.status)) ? "ended" : "active",
      })),
      recent_payments: (recentPayments.data ?? []).map((row: any) => ({ ...row, store_name: storeMap.get(row.store_id) ?? null })),
      partial: [businesses, active, trials, pastDue, registers, openCases].some((result: any) => result.error),
      generated_at: new Date().toISOString(),
    };
  });


export const adminListCompanyEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { rows: await companyStaffRows(supabaseAdmin) };
  });

export const adminFounderTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { rows: await companyStaffRows(supabaseAdmin), founder_email: FOUNDER_EMAIL };
  });

export const adminInviteCompanyStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    email: string;
    fullName: string;
    role: string;
    title?: string;
    department?: string;
  }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureFounder(context);
    const email = cleanText(data.email, 320).toLowerCase();
    const fullName = cleanText(data.fullName, 160);
    const role = cleanText(data.role, 80);
    if (!email.includes("@")) throw new Error("A valid email is required");
    if (!fullName) throw new Error("Full name is required");
    if (!(COMPANY_ROLES as readonly string[]).includes(role) || role === "super_admin") {
      throw new Error("Choose a valid staff role");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, platform_staff: true, seza_company_staff: true },
      redirectTo: `${process.env.APP_URL ?? "https://admin.sezapos.com"}/admin/auth`,
    });
    if (error) throw new Error(error.message);
    const userId = invite.user?.id;
    if (!userId) throw new Error("Invite did not return a user");

    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      full_name: fullName,
      store_id: null,
    }, { onConflict: "id" });

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).in("role", COMPANY_ROLES as unknown as any);
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: role as any,
      store_id: null,
    });
    if (roleError) throw new Error(roleError.message);

    await upsertOptionalStaffProfile(supabaseAdmin, {
      user_id: userId,
      title: cleanText(data.title, 160) || null,
      department: cleanText(data.department, 120) || "Operations",
      employment_status: "invited",
    });

    await audit(supabaseAdmin, context, identity, {
      action: "admin.staff.invite",
      entity: "admin_staff",
      entityId: userId,
      details: { email, role, title: data.title, department: data.department },
    });
    return { ok: true };
  });

export const adminUpdateCompanyStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    userId: string;
    fullName?: string;
    role?: string;
    title?: string;
    department?: string;
    employmentStatus?: "invited" | "active" | "inactive";
    phone?: string;
    reason: string;
  }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureFounder(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const target = await ensureAdminProfile(supabaseAdmin, data.userId);
    const isFounder = String(target.email ?? "").toLowerCase() === FOUNDER_EMAIL;

    const profilePatch: Record<string, unknown> = {};
    if (data.fullName !== undefined) profilePatch.full_name = cleanText(data.fullName, 160) || target.full_name || target.email;
    if (data.phone !== undefined) profilePatch.phone = cleanText(data.phone, 80) || null;
    if (Object.keys(profilePatch).length) {
      const profileUpdate = await supabaseAdmin.from("profiles").update(profilePatch).eq("id", data.userId);
      if (profileUpdate.error) throw new Error(profileUpdate.error.message);
    }

    const staffPatch: Record<string, unknown> = {};
    if (data.title !== undefined) staffPatch.title = isFounder ? "Founder & CEO" : cleanText(data.title, 160) || null;
    if (data.department !== undefined) staffPatch.department = isFounder ? "Executive" : cleanText(data.department, 120) || "Operations";
    if (data.employmentStatus !== undefined) {
      if (isFounder && data.employmentStatus !== "active") throw new Error("The founder account cannot be deactivated");
      staffPatch.employment_status = data.employmentStatus;
    }
    if (data.phone !== undefined) staffPatch.phone = cleanText(data.phone, 80) || null;
    if (Object.keys(staffPatch).length) {
      await upsertOptionalStaffProfile(supabaseAdmin, { user_id: data.userId, ...staffPatch });
      if (data.employmentStatus === "active" && !isFounder) {
        await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" }).catch(() => undefined);
      }
    }

    if (data.role !== undefined) {
      if (isFounder) throw new Error("The founder role cannot be changed");
      if (!(COMPANY_ROLES as readonly string[]).includes(data.role) || data.role === "super_admin") {
        throw new Error("Choose a valid staff role");
      }
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).in("role", COMPANY_ROLES as unknown as any);
      const { error } = await supabaseAdmin.from("user_roles").insert({
        user_id: data.userId,
        role: data.role as any,
        store_id: null,
      });
      if (error) throw new Error(error.message);
    }

    await audit(supabaseAdmin, context, identity, {
      action: "admin.staff.update",
      entity: "admin_staff",
      entityId: data.userId,
      details: { ...staffPatch, role: data.role, reason },
    });
    return { ok: true };
  });

export const adminDeactivateCompanyStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureFounder(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await ensureAdminProfile(supabaseAdmin, data.userId);
    if (String(target.email ?? "").toLowerCase() === FOUNDER_EMAIL || data.userId === context.userId) {
      throw new Error("The founder account cannot be deactivated");
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).in("role", COMPANY_ROLES as unknown as any);
    await upsertOptionalStaffProfile(supabaseAdmin, { user_id: data.userId, employment_status: "inactive" });
    await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" }).catch(() => undefined);

    await audit(supabaseAdmin, context, identity, {
      action: "admin.staff.deactivate",
      entity: "admin_staff",
      entityId: data.userId,
      details: { reason },
    });
    return { ok: true };
  });

export const adminGetPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const identity = await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profile = await ensureAdminProfile(supabaseAdmin, context.userId);
    const staff = await readOptionalStaffProfile(supabaseAdmin, context.userId);
    const settingsResult = await (supabaseAdmin.from as any)("platform_settings").select("*").eq("id", "global").maybeSingle();
    if (settingsResult.error && !isMissingRelationError(settingsResult.error, "platform_settings")) throw new Error(settingsResult.error.message);
    const auditFallback = settingsResult.data ? null : await readPlatformSettingsAuditFallback(supabaseAdmin);
    const defaultSettings = {
      id: "global", company_name: "SEZA POS", support_email: "support@sezapos.com", billing_email: "billing@sezapos.com",
      incident_email: FOUNDER_EMAIL, timezone: "America/New_York", default_trial_days: 14, support_sla_minutes: 60,
      live_chat_enabled: true, maintenance_mode: false, maintenance_message: null, merchant_banner: null,
    };
    const isFounder = identity.email === FOUNDER_EMAIL && identity.roles.includes("super_admin");
    return {
      settings: { ...defaultSettings, ...(auditFallback ?? {}), ...(settingsResult.data ?? {}) },
      profile,
      staff: { ...(staff ?? {}), phone: staff?.phone ?? profile?.phone ?? null, title: isFounder ? "Founder & CEO" : staff?.title ?? null },
      roles: identity.roles,
      is_founder: isFounder,
      schema_ready: Boolean(staff) && (!settingsResult.error || Boolean(auditFallback)),
    };
  });


export const adminUpdatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    companyName: string;
    supportEmail: string;
    billingEmail: string;
    incidentEmail: string;
    timezone: string;
    defaultTrialDays: number;
    supportSlaMinutes: number;
    liveChatEnabled: boolean;
    maintenanceMode: boolean;
    maintenanceMessage?: string;
    merchantBanner?: string;
    reason: string;
  }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureFounder(context);
    const reason = requireReason(data.reason);
    const patch = {
      company_name: cleanText(data.companyName, 160) || "SEZA POS",
      support_email: cleanText(data.supportEmail, 320).toLowerCase(),
      billing_email: cleanText(data.billingEmail, 320).toLowerCase(),
      incident_email: cleanText(data.incidentEmail, 320).toLowerCase(),
      timezone: cleanText(data.timezone, 120) || "America/New_York",
      default_trial_days: Math.max(1, Math.min(90, Number(data.defaultTrialDays) || 14)),
      support_sla_minutes: Math.max(5, Math.min(10080, Number(data.supportSlaMinutes) || 60)),
      live_chat_enabled: Boolean(data.liveChatEnabled),
      maintenance_mode: Boolean(data.maintenanceMode),
      maintenance_message: cleanText(data.maintenanceMessage, 1000) || null,
      merchant_banner: cleanText(data.merchantBanner, 1000) || null,
      updated_by: context.userId,
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("platform_settings").upsert({
      id: "global",
      ...patch,
    }, { onConflict: "id" });
    if (error && !isMissingRelationError(error, "platform_settings")) throw new Error(error.message);
    await audit(supabaseAdmin, context, identity, {
      action: "admin.platform_settings.update",
      entity: "platform_settings",
      entityId: "global",
      details: { ...patch, reason },
    });
    return { ok: true };
  });

export const adminListMerchantBillingPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    status?: string;
    environment?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => data)
  .handler(async ({ data, context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = Math.max(1, Number(data.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(data.pageSize) || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = (supabaseAdmin.from as any)("merchant_billing_payments")
      .select("*", { count: "exact" })
      .order("occurred_at", { ascending: false })
      .range(from, to);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.environment && data.environment !== "all") query = query.eq("environment", data.environment);
    if (cleanText(data.search, 100)) {
      const term = cleanText(data.search, 100).replace(/[%,()]/g, "");
      query = query.or(`stripe_invoice_id.ilike.%${term}%,stripe_customer_id.ilike.%${term}%,stripe_subscription_id.ilike.%${term}%`);
    }

    const [{ data: rows, count, error }, { data: summary }] = await Promise.all([
      query,
      (supabaseAdmin.from as any)("merchant_billing_payments")
        .select("status,amount_paid_cents,currency,occurred_at"),
    ]);
    if (error) throw new Error(error.message);

    const storeIds = Array.from(new Set((rows ?? []).map((row: any) => row.store_id).filter(Boolean)));
    const storeMap = new Map<string, any>();
    if (storeIds.length) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id,name,email,plan_tier,plan_status").in("id", storeIds);
      for (const store of stores ?? []) storeMap.set(store.id, store);
    }
    const all = summary ?? [];
    const paid = all.filter((row: any) => ["paid", "succeeded"].includes(row.status));
    const failed = all.filter((row: any) => ["failed", "uncollectible", "void"].includes(row.status));
    return {
      rows: (rows ?? []).map((row: any) => ({ ...row, store: storeMap.get(row.store_id) ?? null })),
      count: count ?? 0,
      page,
      pageSize,
      summary: {
        total: all.length,
        paid: paid.length,
        failed: failed.length,
        collected_cents: paid.reduce((sum: number, row: any) => sum + Number(row.amount_paid_cents ?? 0), 0),
      },
    };
  });

export const adminListTrialConversions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { days?: number; search?: string }) => data)
  .handler(async ({ data, context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = Math.max(1, Math.min(3650, Number(data.days) || 90));
    const cutoff = new Date(Date.now() - days * 86400_000).getTime();
    const term = cleanText(data.search, 100).toLowerCase();

    const rows = (await loadTrialConversionRows(supabaseAdmin))
      .filter((row: any) => new Date(row.converted_at).getTime() >= cutoff)
      .filter(
        (row: any) =>
          !term ||
          String(row.store?.name ?? "").toLowerCase().includes(term) ||
          String(row.store?.email ?? "").toLowerCase().includes(term),
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.converted_at).getTime() - new Date(a.converted_at).getTime(),
      );

    return {
      rows,
      summary: {
        conversions: rows.length,
        revenue_cents: rows.reduce(
          (sum: number, row: any) => sum + Number(row.amount_cents ?? 0),
          0,
        ),
        live: rows.filter((row: any) => row.environment === "live").length,
        sandbox: rows.filter((row: any) => row.environment === "sandbox").length,
      },
      days,
    };
  });

const CASE_STATUSES = ["open", "investigating", "waiting_for_merchant", "resolved", "closed"] as const;

async function insertCaseEvent(
  supabaseAdmin: any,
  ticketId: string,
  identity: { email: string },
  context: ServerContext,
  eventType: string,
  fromStatus: string | null,
  toStatus: string | null,
  details: Record<string, unknown> = {},
) {
  try {
    const { error } = await (supabaseAdmin.from as any)("support_ticket_events").insert({
      ticket_id: ticketId,
      actor_id: context.userId,
      actor_email: identity.email || null,
      event_type: eventType,
      from_status: fromStatus,
      to_status: toStatus,
      details,
    });
    if (error && !isMissingRelationError(error, "support_ticket_events")) {
      console.warn("Support event log failed", { ticketId, eventType, error: error.message });
    }
  } catch (error) {
    // Event history is useful, but it must never prevent an admin from
    // claiming, replying to, or resolving a merchant's live support case.
    console.warn("Support event log unavailable", { ticketId, eventType, error });
  }
}


async function auditSupportBestEffort(
  supabaseAdmin: any,
  context: ServerContext,
  identity: { email: string },
  input: Parameters<typeof audit>[3],
) {
  try {
    await audit(supabaseAdmin, context, identity, input);
  } catch (error) {
    // A temporary audit-log/schema issue must not strand a merchant's case.
    console.warn("Support audit log unavailable", { action: input.action, error });
  }
}

export const adminGetSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await (supabaseAdmin.from as any)("support_tickets")
      .select("*")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Support case not found");

    const [
      { data: notes },
      { data: events },
      { data: store },
      { data: assignee },
      { data: requester },
      { data: device },
    ] = await Promise.all([
      supabaseAdmin.from("support_ticket_notes").select("*").eq("ticket_id", data.ticketId).order("created_at", { ascending: true }),
      (supabaseAdmin.from as any)("support_ticket_events").select("*").eq("ticket_id", data.ticketId).order("created_at", { ascending: true }),
      ticket.store_id ? supabaseAdmin.from("stores").select("id,name,email,phone,store_code,plan_tier,plan_status").eq("id", ticket.store_id).maybeSingle() : Promise.resolve({ data: null }),
      ticket.assigned_admin_id ? supabaseAdmin.from("profiles").select("id,email,full_name").eq("id", ticket.assigned_admin_id).maybeSingle() : Promise.resolve({ data: null }),
      ticket.requester_id ? supabaseAdmin.from("profiles").select("id,email,full_name,employee_id,status").eq("id", ticket.requester_id).maybeSingle() : Promise.resolve({ data: null }),
      ticket.device_registration_id ? supabaseAdmin.from("device_registrations").select("id,label,status,platform,last_seen_at").eq("id", ticket.device_registration_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const noteAuthorIds = Array.from(
      new Set((notes ?? []).map((note: any) => note.author_id).filter(Boolean)),
    );
    const [{ data: authorRoles }, { data: authorProfiles }] = await Promise.all([
      noteAuthorIds.length
        ? supabaseAdmin
            .from("user_roles")
            .select("user_id,role")
            .in("user_id", noteAuthorIds)
            .in("role", COMPANY_ROLES as unknown as any)
        : Promise.resolve({ data: [] }),
      noteAuthorIds.length
        ? supabaseAdmin.from("profiles").select("id,full_name,email").in("id", noteAuthorIds)
        : Promise.resolve({ data: [] }),
    ]);
    const platformAuthorIds = new Set((authorRoles ?? []).map((row: any) => row.user_id));
    const authorProfileMap = new Map((authorProfiles ?? []).map((row: any) => [row.id, row]));
    const enrichedNotes = (notes ?? []).map((note: any) => {
      const author: any = note.author_id ? authorProfileMap.get(note.author_id) : null;
      return {
        ...note,
        author_is_platform: note.sender_kind === "admin" || Boolean(note.author_id && platformAuthorIds.has(note.author_id)),
        author_name: author?.full_name || author?.email || note.author_email || null,
      };
    });

    try {
      await updateSupportTicketCompat(supabaseAdmin, data.ticketId, {
        last_admin_read_at: new Date().toISOString(),
      });
    } catch {
      // Reading a case must never fail because an optional read-marker column
      // has not reached production yet.
    }

    const publicMessages = enrichedNotes.filter((note: any) => !note.internal);
    const problemMessage =
      publicMessages.find((note: any) => !note.author_is_platform) ??
      publicMessages[0] ??
      null;

    const compatibleTicket = {
      ...ticket,
      chat_status: ticket.chat_status ?? (["resolved", "closed"].includes(String(ticket.status)) ? "ended" : "active"),
      last_message_at: ticket.last_message_at ?? publicMessages.at(-1)?.created_at ?? ticket.updated_at,
    };

    return {
      ticket: compatibleTicket,
      messages: publicMessages,
      problem_message: problemMessage,
      internal_notes: enrichedNotes.filter((note: any) => note.internal),
      events: events ?? [],
      store: store ?? null,
      assignee: assignee ?? null,
      requester: requester ?? null,
      device: device ?? null,
    };
  });

export const adminClaimSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket } = await (supabaseAdmin.from as any)("support_tickets")
      .select("id,status,assigned_admin_id,store_id")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!ticket) throw new Error("Support case not found");

    await updateSupportTicketCompat(supabaseAdmin, data.ticketId, {
      assigned_admin_id: context.userId,
      claimed_at: new Date().toISOString(),
      chat_status: "active",
      chat_ended_at: null,
      chat_ended_by: null,
      last_admin_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await insertCaseEvent(supabaseAdmin, data.ticketId, identity, context, "claimed", ticket.status, ticket.status, {
      previous_assignee: ticket.assigned_admin_id,
    });
    await auditSupportBestEffort(supabaseAdmin, context, identity, {
      action: "admin.ticket.claim",
      entity: "ticket",
      entityId: data.ticketId,
      storeId: ticket.store_id,
      details: { previous_status: ticket.status, previous_assignee: ticket.assigned_admin_id },
    });
    return { ok: true };
  });

export const adminTransitionSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    ticketId: string;
    status: string;
    resolutionSummary?: string;
    resolutionCode?: string;
    reason?: string;
  }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureSupportStaff(context);
    if (!(CASE_STATUSES as readonly string[]).includes(data.status)) throw new Error("Invalid support status");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket } = await (supabaseAdmin.from as any)("support_tickets")
      .select("*")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!ticket) throw new Error("Support case not found");

    const currentStatus = ({
      waiting_support: "investigating",
      in_progress: "investigating",
      waiting_customer: "waiting_for_merchant",
    } as Record<string, string>)[String(ticket.status)] ?? String(ticket.status);

    const allowedTransitions: Record<string, string[]> = {
      open: ["investigating", "waiting_for_merchant", "resolved"],
      investigating: ["open", "waiting_for_merchant", "resolved"],
      waiting_for_merchant: ["open", "investigating", "resolved"],
      resolved: ["open", "closed"],
      closed: ["open"],
    };
    if (!(allowedTransitions[currentStatus] ?? []).includes(data.status)) {
      throw new Error(`Cannot move a ${currentStatus} case directly to ${data.status}`);
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: data.status,
      assigned_admin_id: ticket.assigned_admin_id ?? context.userId,
    };
    let eventType = "status_changed";
    if (data.status === "investigating") {
      patch.claimed_at = ticket.claimed_at ?? now;
      patch.chat_status = "active";
      patch.chat_ended_at = null;
      patch.chat_ended_by = null;
      eventType = "investigation_started";
    } else if (data.status === "waiting_for_merchant") {
      patch.chat_status = "active";
      patch.chat_ended_at = null;
      patch.chat_ended_by = null;
      eventType = "waiting_for_merchant";
    } else if (data.status === "resolved") {
      const summary = requireReason(data.resolutionSummary, "Resolution summary", 5);
      patch.resolution_summary = summary;
      patch.resolution = summary;
      patch.resolution_code = cleanText(data.resolutionCode, 80) || "fixed";
      patch.resolved_at = now;
      patch.closed_at = null;
      patch.chat_status = "ended";
      patch.chat_ended_at = now;
      patch.chat_ended_by = context.userId;
      patch.priority = "normal";
      eventType = "resolved";
    } else if (data.status === "closed") {
      if (currentStatus !== "resolved") {
        throw new Error("Resolve the case before closing it");
      }
      const summary = cleanText(data.resolutionSummary || ticket.resolution_summary || ticket.resolution, 4000);
      if (summary.length < 5) throw new Error("Resolve the case with a summary before closing it");
      patch.resolution_summary = summary;
      patch.resolution = summary;
      patch.closed_at = now;
      patch.resolved_at = ticket.resolved_at ?? now;
      patch.chat_status = "ended";
      patch.chat_ended_at = ticket.chat_ended_at ?? now;
      patch.chat_ended_by = ticket.chat_ended_by ?? context.userId;
      patch.priority = "normal";
      eventType = "closed";
    } else if (data.status === "open" && ["resolved", "closed"].includes(currentStatus)) {
      patch.resolved_at = null;
      patch.closed_at = null;
      patch.chat_status = "active";
      patch.chat_ended_at = null;
      patch.chat_ended_by = null;
      eventType = "reopened";
    }

    const reason = cleanText(data.reason, 2000);
    patch.updated_at = now;
    await updateSupportTicketCompat(supabaseAdmin, data.ticketId, patch);

    await insertCaseEvent(supabaseAdmin, data.ticketId, identity, context, eventType, ticket.status, data.status, {
      reason: reason || null,
      resolution_summary: patch.resolution_summary ?? null,
      resolution_code: patch.resolution_code ?? null,
    });
    await auditSupportBestEffort(supabaseAdmin, context, identity, {
      action: `admin.ticket.${eventType}`,
      entity: "ticket",
      entityId: data.ticketId,
      storeId: ticket.store_id,
      details: { from: ticket.status, to: data.status, reason, resolution: patch.resolution_summary ?? null },
    });
    return { ok: true };
  });

export const adminSendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string; body: string; internal?: boolean }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureSupportStaff(context);
    const body = requireReason(data.body, data.internal ? "Internal note" : "Message", 1);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket } = await (supabaseAdmin.from as any)("support_tickets")
      .select("*")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!ticket) throw new Error("Support case not found");

    const { error } = await supabaseAdmin.from("support_ticket_notes").insert({
      ticket_id: data.ticketId,
      author_id: context.userId,
      author_email: identity.email || null,
      body,
      internal: Boolean(data.internal),
    });
    if (error) throw new Error(error.message);

    if (!data.internal) {
      const patch: Record<string, unknown> = {
        last_admin_read_at: new Date().toISOString(),
      };
      if (!ticket.first_response_at) patch.first_response_at = new Date().toISOString();
      patch.updated_at = new Date().toISOString();
      await updateSupportTicketCompat(supabaseAdmin, data.ticketId, patch);
      await insertCaseEvent(supabaseAdmin, data.ticketId, identity, context, "message_sent", ticket.status, ticket.status);
    }
    return { ok: true };
  });

export const adminEndSupportChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensureSupportStaff(context);
    const reason = requireReason(data.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket } = await (supabaseAdmin.from as any)("support_tickets")
      .select("*")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!ticket) throw new Error("Support case not found");

    const now = new Date().toISOString();
    await updateSupportTicketCompat(supabaseAdmin, data.ticketId, {
      chat_status: "ended",
      chat_ended_at: now,
      chat_ended_by: context.userId,
      updated_at: now,
    });

    await insertCaseEvent(supabaseAdmin, data.ticketId, identity, context, "chat_ended", ticket.status, ticket.status, { reason });
    await auditSupportBestEffort(supabaseAdmin, context, identity, {
      action: "admin.ticket.chat_end",
      entity: "ticket",
      entityId: data.ticketId,
      storeId: ticket.store_id,
      details: { reason },
    });
    return { ok: true };
  });

export const adminListCommunications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { view?: "active" | "ended" | "all"; search?: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin.from as any)("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (data.view === "ended") query = query.in("status", ["resolved", "closed"]);
    else if (data.view !== "all") query = query.not("status", "in", "(resolved,closed)");
    if (cleanText(data.search, 100)) {
      const term = cleanText(data.search, 100).replace(/[%,()]/g, "");
      query = query.or(`subject.ilike.%${term}%,requester_email.ilike.%${term}%`);
    }
    const { data: tickets, error } = await query;
    if (error) throw new Error(error.message);

    const ticketIds = (tickets ?? []).map((row: any) => row.id);
    const storeIds = Array.from(new Set((tickets ?? []).map((row: any) => row.store_id).filter(Boolean)));
    const assigneeIds = Array.from(new Set((tickets ?? []).map((row: any) => row.assigned_admin_id).filter(Boolean)));

    const [{ data: notes }, { data: stores }, { data: assignees }] = await Promise.all([
      ticketIds.length
        ? supabaseAdmin.from("support_ticket_notes").select("id,ticket_id,body,author_email,internal,created_at").in("ticket_id", ticketIds).eq("internal", false).order("created_at", { ascending: false }).limit(1000)
        : Promise.resolve({ data: [] }),
      storeIds.length
        ? supabaseAdmin.from("stores").select("id,name,email").in("id", storeIds)
        : Promise.resolve({ data: [] }),
      assigneeIds.length
        ? supabaseAdmin.from("profiles").select("id,full_name,email").in("id", assigneeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const lastMessage = new Map<string, any>();
    for (const note of notes ?? []) if (!lastMessage.has(note.ticket_id)) lastMessage.set(note.ticket_id, note);
    const storeMap = new Map((stores ?? []).map((row: any) => [row.id, row]));
    const assigneeMap = new Map((assignees ?? []).map((row: any) => [row.id, row]));

    return {
      rows: (tickets ?? []).map((ticket: any) => ({
        ...ticket,
        store: storeMap.get(ticket.store_id) ?? null,
        assignee: assigneeMap.get(ticket.assigned_admin_id) ?? null,
        last_message: lastMessage.get(ticket.id) ?? null,
        unread: Boolean(lastMessage.get(ticket.id)?.created_at) && (!ticket.last_admin_read_at || new Date(lastMessage.get(ticket.id).created_at) > new Date(ticket.last_admin_read_at)),
        chat_status: ["resolved", "closed"].includes(String(ticket.status)) ? "ended" : "active",
        last_message_at: lastMessage.get(ticket.id)?.created_at ?? ticket.last_message_at ?? ticket.updated_at,
      })),
    };
  });

export const adminMarkCommunicationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureSupportStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await updateSupportTicketCompat(supabaseAdmin, data.ticketId, {
        last_admin_read_at: new Date().toISOString(),
      });
    } catch {
      /* optional read marker */
    }
    return { ok: true };
  });


export const adminUpdateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    fullName: string; phone?: string; emailNotifications: boolean; urgentCaseNotifications: boolean; liveChatNotifications: boolean;
  }) => data)
  .handler(async ({ data, context }) => {
    const identity = await ensurePlatformStaff(context);
    const fullName = cleanText(data.fullName, 160);
    if (!fullName) throw new Error("Full name is required");
    const phone = cleanText(data.phone, 80) || null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminProfile(supabaseAdmin, context.userId);
    const profileUpdate = await supabaseAdmin.from("profiles").update({ full_name: fullName, phone }).eq("id", context.userId);
    if (profileUpdate.error) throw new Error(profileUpdate.error.message);

    await upsertOptionalStaffProfile(supabaseAdmin, {
      user_id: context.userId,
      title: identity.email === FOUNDER_EMAIL ? "Founder & CEO" : undefined,
      department: identity.email === FOUNDER_EMAIL ? "Executive" : undefined,
      employment_status: "active",
      phone,
      notification_preferences: {
        email: Boolean(data.emailNotifications), urgent_cases: Boolean(data.urgentCaseNotifications), live_chat: Boolean(data.liveChatNotifications),
      },
    });

    await audit(supabaseAdmin, context, identity, {
      action: "admin.profile.update", entity: "admin_staff", entityId: context.userId,
      details: { full_name: fullName, phone_updated: Boolean(phone), notification_preferences: {
        email: Boolean(data.emailNotifications), urgent_cases: Boolean(data.urgentCaseNotifications), live_chat: Boolean(data.liveChatNotifications),
      }},
    });
    return { ok: true, full_name: fullName, phone };
  });

export const adminGetPrivateBusinessWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storeId: string }) => data)
  .handler(async ({ data, context }) => {
    // Privacy-first merchant account workspace. It never queries or returns
    // checkout sales, refunds, cash movements, products, employee records, or shifts.
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const storeId = data.storeId;
    const offlineCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const emptyRows = { data: [], error: null } as any;

    const [storeResult, rolesResult, devicesResult, subscriptionsResult, ticketsResult, activityResult, supportSessionsResult] = await Promise.all([
      withTimeout(supabaseAdmin.from("stores").select("id,name,email,phone,address,city,state,zip,country,time_zone,store_code,plan_tier,plan_status,trial_ends_at,plan_period_end,suspended_at,suspended_reason,created_at,updated_at").eq("id", storeId).maybeSingle(), { data: null, error: null } as any, 7000),
      withTimeout(supabaseAdmin.from("user_roles").select("user_id,role").eq("store_id", storeId).in("role", ["owner", "admin"]), emptyRows, 7000),
      withTimeout(supabaseAdmin.from("device_registrations").select("id,label,status,platform,app_version,paired_at,last_seen_at,last_sync_at,revoked_at,revoke_reason").eq("store_id", storeId).order("paired_at", { ascending: false }), emptyRows, 7000),
      withTimeout(supabaseAdmin.from("subscriptions").select("id,status,environment,stripe_customer_id,stripe_subscription_id,price_id,product_id,current_period_start,current_period_end,cancel_at_period_end,canceled_at,created_at,updated_at").eq("store_id", storeId).order("created_at", { ascending: false }), emptyRows, 7000),
      withTimeout(supabaseAdmin.from("support_tickets").select("id,ticket_number,subject,status,priority,created_at,updated_at,assigned_admin_id").eq("store_id", storeId).order("updated_at", { ascending: false }).limit(30), emptyRows, 7000),
      withTimeout(supabaseAdmin.from("audit_log").select("id,action,actor_email,entity,entity_id,created_at,details").eq("store_id", storeId).order("created_at", { ascending: false }).limit(100), emptyRows, 7000),
      withTimeout(supabaseAdmin.from("admin_support_sessions").select("id,admin_id,admin_email,reason,status,requested_at,decided_at,started_at,ended_at,expires_at,client_capability").eq("store_id", storeId).order("requested_at", { ascending: false }).limit(10), emptyRows, 7000),
    ]);

    if (!storeResult.data) throw new Error(storeResult.error?.message ?? "Business not found");
    const ownerIds: string[] = (rolesResult.data ?? []).map((row: any) => String(row.user_id)).filter(Boolean);
    const ownersResult = ownerIds.length
      ? await withTimeout(supabaseAdmin.from("profiles").select("id,full_name,email,phone,status,created_at").in("id", ownerIds), emptyRows, 5000)
      : emptyRows;

    const devices = devicesResult.data ?? [];
    const tickets = (ticketsResult.data ?? []).map((ticket: any) => ({
      ...ticket,
      chat_status: ["resolved", "closed"].includes(String(ticket.status)) ? "ended" : "active",
    }));
    const now = Date.now();
    const activeSupportSession = (supportSessionsResult.data ?? []).find((session: any) =>
      ["pending", "accepted"].includes(session.status) && (!session.expires_at || new Date(session.expires_at).getTime() > now),
    ) ?? null;
    const offlineDevices = devices.filter((device: any) => device.status === "active" && (!device.last_seen_at || device.last_seen_at < offlineCutoff)).length;
    const lastDevice = devices.map((device: any) => device.last_seen_at).filter(Boolean).sort().reverse()[0] ?? null;
    const lastAudit = activityResult.data?.[0]?.created_at ?? null;
    const lastTicket = tickets[0]?.updated_at ?? null;
    const lastActivity = [lastDevice, lastAudit, lastTicket].filter(Boolean).sort().reverse()[0] ?? null;
    const openTickets = tickets.filter((ticket: any) => !["resolved", "closed"].includes(ticket.status));

    return {
      store: storeResult.data,
      owners: ownersResult.data ?? [],
      devices,
      offline_devices: offlineDevices,
      subscription: subscriptionsResult.data?.[0] ?? null,
      subscriptions: subscriptionsResult.data ?? [],
      tickets,
      open_tickets: openTickets,
      recent_activity: activityResult.data ?? [],
      support_sessions: supportSessionsResult.data ?? [],
      active_support_session: activeSupportSession,
      counts: { devices: devices.length, offline_devices: offlineDevices, open_cases: openTickets.length },
      last_activity: lastActivity,
      generated_at: new Date().toISOString(),
      privacy_mode: true,
    };
  });

export const adminListPlatformIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { days?: number }) => data)
  .handler(async ({ data, context }) => {
    await ensurePlatformStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = Math.max(1, Math.min(90, Number(data.days) || 7));
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const emptyRows = { data: [], error: null } as any;
    const [ticketsResult, billingResult] = await Promise.all([
      withTimeout(supabaseAdmin.from("support_tickets").select("id,ticket_number,subject,priority,status,store_id,assigned_admin_id,created_at,updated_at").in("priority", ["high", "urgent"]).not("status", "in", "(resolved,closed)").gte("updated_at", since).order("updated_at", { ascending: false }).limit(100), emptyRows, 7000),
      withTimeout((supabaseAdmin.from as any)("merchant_billing_payments").select("id,store_id,status,amount_due_cents,currency,failure_message,occurred_at,environment,stripe_invoice_id").in("status", ["failed", "uncollectible", "void"]).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(100), emptyRows, 7000),
    ]);
    const storeIds = Array.from(new Set([...(ticketsResult.data ?? []), ...(billingResult.data ?? [])].map((row: any) => row.store_id).filter(Boolean)));
    const storesResult = storeIds.length ? await withTimeout(supabaseAdmin.from("stores").select("id,name,email,plan_status").in("id", storeIds), emptyRows, 5000) : emptyRows;
    const storeMap = new Map((storesResult.data ?? []).map((row: any) => [row.id, row]));
    return {
      tickets: (ticketsResult.data ?? []).map((row: any) => ({ ...row, store: storeMap.get(row.store_id) ?? null })),
      billing_alerts: (billingResult.data ?? []).map((row: any) => ({ ...row, store: storeMap.get(row.store_id) ?? null })),
      days, generated_at: new Date().toISOString(),
    };
  });

