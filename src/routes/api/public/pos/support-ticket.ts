import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

const categories = new Set([
  "login",
  "register",
  "sale",
  "payment",
  "refund",
  "printer",
  "scanner",
  "cash_drawer",
  "customer_display",
  "inventory",
  "shift",
  "offline",
  "employee",
  "reports",
  "device",
  "performance",
  "general",
  "account",
  "billing",
  "payments",
  "other",
]);
const priorities = new Set(["low", "normal", "high", "urgent"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.split("\u0000").join("").trim().slice(0, max) : "";
}

export const Route = createFileRoute("/api/public/pos/support-ticket")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.pos.support_ticket",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 16384,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;

        const authz = request.headers.get("authorization") ?? "";
        const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
        if (!token) return json({ error: "Unauthorized" }, 401);

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin: any = supabaseAdmin;
        const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);

        const callerId = userRes.user.id;
        const { data: profile, error: profileError } = await admin
          .from("profiles")
          .select("id,store_id,full_name,email,status")
          .eq("id", callerId)
          .maybeSingle();
        if (profileError || !profile?.store_id) return json({ error: "Store not found" }, 403);
        if (profile.status && profile.status !== "active") return json({ error: "Inactive employee" }, 403);

        const action = body.action === "reply" ? "reply" : body.action === "create" ? "create" : null;
        if (!action) return json({ error: "Invalid action" }, 400);

        if (action === "create") {
          const subject = clean(body.subject, 120);
          const message = clean(body.body, 4000);
          const category = categories.has(String(body.category)) ? String(body.category) : "general";
          const priority = priorities.has(String(body.priority)) ? String(body.priority) : "normal";
          if (subject.length < 3 || message.length < 3) {
            return json({ error: "Subject and message are required" }, 400);
          }

          const now = new Date().toISOString();
          const { data: ticket, error: ticketError } = await admin
            .from("support_tickets")
            .insert({
              store_id: profile.store_id,
              requester_id: callerId,
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
          if (ticketError) {
            console.error("[support] ticket create failed", {
              code: ticketError.code,
              constraint: ticketError.details,
            });
            return json({ error: "Support request could not be created. Please try again." }, 400);
          }

          const { error: noteError } = await admin.from("support_ticket_notes").insert({
            ticket_id: ticket.id,
            author_id: callerId,
            author_email: profile.email || null,
            body: message,
            internal: false,
          });
          if (noteError) {
            await admin.from("support_tickets").delete().eq("id", ticket.id);
            console.error("[support] first message create failed", { code: noteError.code });
            return json({ error: "Support request could not be created. Please try again." }, 400);
          }

          try {
            const { sendSupportEmailBestEffort, supportInbox } = await import("@/lib/support-email.server");
            const caseLabel = ticket.ticket_number ? `#${ticket.ticket_number}` : String(ticket.id).slice(0, 8);
            await sendSupportEmailBestEffort({
              to: supportInbox(),
              replyTo: profile.email || undefined,
              subject: `[SEZA Support ${caseLabel}] ${subject}`,
              text: [
                "A merchant opened a support case from the Android POS.",
                `Case: ${caseLabel}`,
                profile.full_name ? `Merchant: ${profile.full_name}` : "",
                profile.email ? `Email: ${profile.email}` : "",
                `Store ID: ${profile.store_id}`,
                "",
                message,
              ]
                .filter(Boolean)
                .join("\n"),
              idempotencyKey: `pos-support-create-${ticket.id}-${crypto.randomUUID()}`,
            });
          } catch {
            // Email is best-effort; the live support case is already stored.
          }

          return json({ ok: true, id: ticket.id, ticketNumber: ticket.ticket_number });
        }

        const ticketId = clean(body.ticketId, 80);
        const message = clean(body.body, 4000);
        if (!ticketId || !message) return json({ error: "Message is required" }, 400);

        const { data: ticket, error: ticketError } = await admin
          .from("support_tickets")
          .select("id,ticket_number,subject,status,store_id,chat_status")
          .eq("id", ticketId)
          .maybeSingle();
        if (ticketError || !ticket || ticket.store_id !== profile.store_id) {
          return json({ error: "Support case not found" }, 404);
        }

        const now = new Date().toISOString();
        const reopen = ["resolved", "closed"].includes(String(ticket.status)) || ticket.chat_status === "ended";
        const { error: noteError } = await admin.from("support_ticket_notes").insert({
          ticket_id: ticketId,
          author_id: callerId,
          author_email: profile.email || null,
          body: message,
          internal: false,
        });
        if (noteError) {
          console.error("[support] reply create failed", { code: noteError.code });
          return json({ error: "Message could not be sent. Please try again." }, 400);
        }

        const patch: Record<string, unknown> = {
          status: "waiting_support",
          chat_status: "active",
          last_message_at: now,
          last_merchant_read_at: now,
          updated_at: now,
        };
        if (reopen) {
          patch.chat_ended_at = null;
          patch.chat_ended_by = null;
          patch.resolved_at = null;
          patch.closed_at = null;
        }
        const { error: updateError } = await admin.from("support_tickets").update(patch).eq("id", ticketId);
        if (updateError) {
          console.error("[support] ticket update failed", { code: updateError.code });
          return json({ error: "Support request could not be updated. Please try again." }, 400);
        }

        return json({ ok: true, reopened: reopen });
      },
    },
  },
});
