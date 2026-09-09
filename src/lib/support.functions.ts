import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authenticatedWriteRateLimit } from "@/lib/security/rate-limit";

const VALID_CATEGORIES = new Set(["account", "billing", "inventory", "register", "payments", "other"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.split("\u0000").join("").trim().slice(0, max) : "";
}

async function merchantIdentity(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin: any = supabaseAdmin;
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,store_id,full_name,email,status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.store_id) throw new Error("Your store could not be found. Contact SEZA Support.");
  if (profile.status && profile.status !== "active") throw new Error("This employee account is inactive.");
  return { admin, profile };
}

async function canManageSupportCase(admin: any, userId: string, requesterId: string | null | undefined) {
  if (requesterId && requesterId === userId) return true;
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["owner", "manager"]);
  return Boolean(roles?.length);
}

async function notifySupport(input: {
  ticketId: string;
  ticketNumber?: number | null;
  subject: string;
  body: string;
  merchantEmail?: string | null;
  merchantName?: string | null;
  storeId: string;
  action: "created" | "reply";
}) {
  const { sendSupportEmailBestEffort, supportInbox } = await import("@/lib/support-email.server");
  const caseLabel = input.ticketNumber ? `#${input.ticketNumber}` : input.ticketId.slice(0, 8);
  await sendSupportEmailBestEffort({
    to: supportInbox(),
    replyTo: input.merchantEmail || undefined,
    subject: `[SEZA Support ${caseLabel}] ${input.subject}`,
    text: [
      input.action === "created"
        ? "A merchant opened a new SEZA support case."
        : "A merchant replied to a SEZA support case.",
      `Case: ${caseLabel}`,
      `Store ID: ${input.storeId}`,
      input.merchantName ? `Merchant: ${input.merchantName}` : "",
      input.merchantEmail ? `Email: ${input.merchantEmail}` : "",
      `Subject: ${input.subject}`,
      "",
      input.body,
      "",
      "Open admin.sezapos.com to respond and resolve the case.",
    ]
      .filter(Boolean)
      .join("\n"),
    idempotencyKey: `support-${input.action}-${input.ticketId}-${crypto.randomUUID()}`,
  });
}

export const createMerchantSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .inputValidator((data: { subject: string; body: string; category?: string; priority?: string }) => data)
  .handler(async ({ data, context }) => {
    const subject = clean(data.subject, 120);
    const body = clean(data.body, 4000);
    const category = VALID_CATEGORIES.has(String(data.category)) ? String(data.category) : "other";
    const priority = VALID_PRIORITIES.has(String(data.priority)) ? String(data.priority) : "normal";
    if (subject.length < 3) throw new Error("Enter a short subject for the support case.");
    if (body.length < 3) throw new Error("Tell SEZA what happened before sending the request.");

    const { admin, profile } = await merchantIdentity(context.userId);
    const now = new Date().toISOString();

    // Use the server/service-role client for merchant support creation. This keeps
    // the browser out of direct INSERT/RLS/rate-limit edge cases while the store
    // and requester are still derived from the authenticated user's profile.
    const { data: ticket, error } = await admin
      .from("support_tickets")
      .insert({
        store_id: profile.store_id,
        requester_id: context.userId,
        requester_email: profile.email || null,
        subject,
        category,
        priority,
        status: "open",
        chat_status: "waiting",
        last_message_at: now,
      })
      .select("id,ticket_number,subject")
      .single();
    if (error) throw error;

    const { error: noteError } = await admin.from("support_ticket_notes").insert({
      ticket_id: ticket.id,
      author_id: context.userId,
      author_email: profile.email || null,
      body,
      internal: false,
    });
    if (noteError) {
      await admin.from("support_tickets").delete().eq("id", ticket.id);
      throw noteError;
    }

    await notifySupport({
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject,
      body,
      merchantEmail: profile.email,
      merchantName: profile.full_name,
      storeId: profile.store_id,
      action: "created",
    });

    return { id: ticket.id as string, ticketNumber: ticket.ticket_number as number | null };
  });

export const merchantReplySupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .inputValidator((data: { ticketId: string; body: string }) => data)
  .handler(async ({ data, context }) => {
    const ticketId = clean(data.ticketId, 80);
    const body = clean(data.body, 4000);
    if (!ticketId) throw new Error("Support case not found.");
    if (!body) throw new Error("Write a message first.");

    const { admin, profile } = await merchantIdentity(context.userId);
    const { data: ticket, error } = await admin
      .from("support_tickets")
      .select("id,ticket_number,subject,status,store_id,requester_id,requester_email,chat_status")
      .eq("id", ticketId)
      .maybeSingle();
    if (error) throw error;
    if (!ticket || ticket.store_id !== profile.store_id) throw new Error("Support case not found.");

    const now = new Date().toISOString();
    const shouldReopen =
      ["resolved", "closed"].includes(String(ticket.status)) || ticket.chat_status === "ended";

    if (shouldReopen) {
      const { error: reopenError } = await admin
        .from("support_tickets")
        .update({
          status: "open",
          chat_status: "active",
          chat_ended_at: null,
          chat_ended_by: null,
          resolved_at: null,
          closed_at: null,
          updated_at: now,
          last_message_at: now,
          last_merchant_read_at: now,
        })
        .eq("id", ticketId);
      if (reopenError) throw reopenError;
    }

    const { error: noteError } = await admin.from("support_ticket_notes").insert({
      ticket_id: ticketId,
      author_id: context.userId,
      author_email: profile.email || null,
      body,
      internal: false,
    });
    if (noteError) throw noteError;

    if (!shouldReopen) {
      const { error: activityError } = await admin
        .from("support_tickets")
        .update({ last_message_at: now, last_merchant_read_at: now, updated_at: now })
        .eq("id", ticketId);
      if (activityError) throw activityError;
    }

    await notifySupport({
      ticketId,
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      body,
      merchantEmail: profile.email,
      merchantName: profile.full_name,
      storeId: profile.store_id,
      action: "reply",
    });

    return { ok: true, reopened: shouldReopen };
  });

export const merchantListSupportCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, profile } = await merchantIdentity(context.userId);
    const { data, error } = await admin
      .from("support_tickets")
      .select(
        "id,ticket_number,subject,status,priority,category,chat_status,created_at,updated_at,last_message_at,resolution_summary,resolution",
      )
      .eq("store_id", profile.store_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as any[];
  });

export const merchantGetSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    const ticketId = clean(data.ticketId, 80);
    if (!ticketId) throw new Error("Support case not found.");

    const { admin, profile } = await merchantIdentity(context.userId);
    const [{ data: ticket, error: ticketError }, { data: notes, error: notesError }] =
      await Promise.all([
        admin
          .from("support_tickets")
          .select(
            "id,ticket_number,subject,status,priority,category,requester_id,requester_email,assigned_admin_id,chat_status,chat_ended_at,resolution_summary,resolution,created_at,updated_at,last_message_at",
          )
          .eq("id", ticketId)
          .eq("store_id", profile.store_id)
          .maybeSingle(),
        admin
          .from("support_ticket_notes")
          .select("id,ticket_id,author_id,author_email,body,internal,sender_kind,created_at")
          .eq("ticket_id", ticketId)
          .eq("internal", false)
          .order("created_at", { ascending: true }),
      ]);
    if (ticketError) throw ticketError;
    if (notesError) throw notesError;
    if (!ticket) throw new Error("Support case not found.");

    await admin
      .from("support_tickets")
      .update({ last_merchant_read_at: new Date().toISOString() })
      .eq("id", ticketId)
      .eq("store_id", profile.store_id);

    return {
      ticket,
      messages: notes ?? [],
      currentUserId: context.userId,
      currentUserEmail: profile.email ?? null,
    };
  });

export const merchantCloseSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    const ticketId = clean(data.ticketId, 80);
    if (!ticketId) throw new Error("Support case not found.");

    const { admin, profile } = await merchantIdentity(context.userId);
    const { data: ticket, error: readError } = await admin
      .from("support_tickets")
      .select("id,ticket_number,subject,status,store_id,requester_id")
      .eq("id", ticketId)
      .eq("store_id", profile.store_id)
      .maybeSingle();
    if (readError) throw readError;
    if (!ticket) throw new Error("Support case not found.");
    if (!(await canManageSupportCase(admin, context.userId, ticket.requester_id))) {
      throw new Error("Only the case requester, owner, or manager can close this conversation.");
    }
    if (ticket.status === "closed") return { ok: true };

    const now = new Date().toISOString();
    const { error } = await admin
      .from("support_tickets")
      .update({
        status: "closed",
        chat_status: "ended",
        chat_ended_at: now,
        chat_ended_by: context.userId,
        closed_at: now,
        updated_at: now,
        last_message_at: now,
        last_merchant_read_at: now,
      })
      .eq("id", ticketId)
      .eq("store_id", profile.store_id);
    if (error) throw error;

    try {
      await admin.from("audit_log").insert({
        actor_id: context.userId,
        actor_email: profile.email ?? null,
        store_id: profile.store_id,
        action: "merchant.support.close",
        entity: "support_ticket",
        entity_id: ticketId,
        details: { ticket_number: ticket.ticket_number, previous_status: ticket.status },
      });
    } catch {
      // Closing support must not fail because optional audit logging is unavailable.
    }

    return { ok: true };
  });

export const merchantDeleteSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, authenticatedWriteRateLimit])
  .inputValidator((data: { ticketId: string }) => data)
  .handler(async ({ data, context }) => {
    const ticketId = clean(data.ticketId, 80);
    if (!ticketId) throw new Error("Support case not found.");

    const { admin, profile } = await merchantIdentity(context.userId);
    const { data: ticket, error: readError } = await admin
      .from("support_tickets")
      .select("id,ticket_number,subject,status,store_id,requester_id")
      .eq("id", ticketId)
      .eq("store_id", profile.store_id)
      .maybeSingle();
    if (readError) throw readError;
    if (!ticket) return { ok: true };
    if (!(await canManageSupportCase(admin, context.userId, ticket.requester_id))) {
      throw new Error("Only the case requester, owner, or manager can delete this conversation.");
    }
    if (ticket.status !== "closed") {
      throw new Error("Close this support case before deleting the conversation.");
    }

    // Keep a minimal audit marker with no conversation text, then permanently
    // remove the case. support_ticket_notes cascade with the ticket.
    try {
      await admin.from("audit_log").insert({
        actor_id: context.userId,
        actor_email: profile.email ?? null,
        store_id: profile.store_id,
        action: "merchant.support.delete",
        entity: "support_ticket",
        entity_id: ticketId,
        details: { ticket_number: ticket.ticket_number, subject: ticket.subject },
      });
    } catch {
      // Deletion is still allowed if the optional audit insert is unavailable.
    }

    try {
      await (admin.from as any)("support_ticket_events").delete().eq("ticket_id", ticketId);
    } catch {
      // Some deployments may not have this optional lifecycle table.
    }

    const { error } = await admin
      .from("support_tickets")
      .delete()
      .eq("id", ticketId)
      .eq("store_id", profile.store_id);
    if (error) throw error;
    return { ok: true };
  });
