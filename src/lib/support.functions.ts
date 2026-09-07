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
