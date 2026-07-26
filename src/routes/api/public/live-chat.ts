import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });

const clean = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .trim()
        .split("\u0000")
        .join("")
        .slice(0, max)
    : "";

const normalizePhone = (value: unknown) => {
  const raw = clean(value, 40);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return raw;
};

async function hashValue(value: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

async function findTicket(admin: any, token: string) {
  if (!token || token.length < 32 || token.length > 256) return null;
  const tokenHash = await hashValue(token);
  const { data } = await admin
    .from("support_tickets")
    .select("*")
    .eq("guest_token_hash", tokenHash)
    .eq("source", "website_live_chat")
    .maybeSingle();
  return data ?? null;
}

async function publicMessages(admin: any, ticketId: string) {
  const { data, error } = await admin
    .from("support_ticket_notes")
    .select("id,body,created_at,author_email,internal,sender_kind")
    .eq("ticket_id", ticketId)
    .eq("internal", false)
    .order("created_at", { ascending: true })
    .limit(250);
  if (error) throw new Error(error.message);
  return (data ?? []).map((item: any) => ({
    id: item.id,
    body: item.body,
    createdAt: item.created_at,
    from: item.sender_kind === "admin" ? "agent" : "visitor",
    author: item.sender_kind === "admin" ? item.author_email || "SEZA Support" : null,
  }));
}

export const Route = createFileRoute("/api/public/live-chat")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { guardApiRequest } = await import("@/lib/security/api-security.server");
        const blocked = await guardApiRequest(request, {
          scope: "api.live_chat",
          limit: 30,
          windowSeconds: 60,
          blockSeconds: 300,
          maxBodyBytes: 24576,
          allowMissingOrigin: true,
          skipOriginCheck: false,
        });
        if (blocked) return blocked;
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid request." }, 400);
        }

        const action = clean(body.action, 30);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin: any = supabaseAdmin;

        if (action === "start") {
          // Honeypot: real visitors never fill this hidden field.
          if (clean(body.website, 100)) return json({ error: "Request blocked." }, 400);

          const name = clean(body.name, 100);
          const phone = normalizePhone(body.phone);
          const message = clean(body.message, 3000);
          if (name.length < 2) return json({ error: "Please enter your name." }, 400);
          if (!phone) return json({ error: "Please enter a valid phone number." }, 400);
          if (message.length < 2) return json({ error: "Please tell us how we can help." }, 400);

          const forwarded =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for") ||
            "unknown";
          const ip = forwarded.split(",")[0]?.trim() || "unknown";
          const ipHash = await hashValue(ip);
          const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
          const { count } = await admin
            .from("support_tickets")
            .select("id", { count: "exact", head: true })
            .eq("source", "website_live_chat")
            .eq("visitor_ip_hash", ipHash)
            .gte("created_at", tenMinutesAgo);
          if ((count ?? 0) >= 5) {
            return json(
              { error: "Too many chat requests. Please wait a few minutes and try again." },
              429,
            );
          }

          const { randomBytes } = await import("node:crypto");
          const token = randomBytes(32).toString("hex");
          const tokenHash = await hashValue(token);
          const now = new Date().toISOString();
          const { data: ticket, error: ticketError } = await admin
            .from("support_tickets")
            .insert({
              subject: `Website live chat — ${name}`,
              category: "website",
              priority: "normal",
              status: "open",
              chat_status: "waiting",
              last_message_at: now,
              visitor_name: name,
              visitor_phone: phone,
              guest_token_hash: tokenHash,
              visitor_ip_hash: ipHash,
              source: "website_live_chat",
            })
            .select("id,ticket_number,chat_status,status,visitor_name")
            .single();
          if (ticketError || !ticket)
            return json({ error: ticketError?.message || "Could not start chat." }, 500);

          const { error: noteError } = await admin.from("support_ticket_notes").insert({
            ticket_id: ticket.id,
            author_id: null,
            author_email: `${name} (website visitor)`,
            body: message,
            internal: false,
          });
          if (noteError) {
            await admin.from("support_tickets").delete().eq("id", ticket.id);
            return json({ error: noteError.message }, 500);
          }

          return json({
            ok: true,
            token,
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            chatStatus: ticket.chat_status,
            visitorName: name,
            messages: [
              {
                id: `initial-${ticket.id}`,
                body: message,
                createdAt: now,
                from: "visitor",
                author: null,
              },
            ],
          });
        }

        const token = clean(body.token, 256);
        const ticket = await findTicket(admin, token);
        if (!ticket) return json({ error: "Chat session not found." }, 404);

        if (action === "poll") {
          return json({
            ok: true,
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            chatStatus:
              ticket.chat_status ??
              (["resolved", "closed"].includes(ticket.status) ? "ended" : "active"),
            status: ticket.status,
            visitorName: ticket.visitor_name,
            messages: await publicMessages(admin, ticket.id),
          });
        }

        if (action === "send") {
          if (ticket.chat_status === "ended" || ["resolved", "closed"].includes(ticket.status)) {
            return json({ error: "This live chat has ended." }, 409);
          }
          const message = clean(body.message, 3000);
          if (!message) return json({ error: "Write a message first." }, 400);
          const now = new Date().toISOString();
          const { error } = await admin.from("support_ticket_notes").insert({
            ticket_id: ticket.id,
            author_id: null,
            author_email: `${ticket.visitor_name || "Website visitor"} (website visitor)`,
            body: message,
            internal: false,
          });
          if (error) return json({ error: error.message }, 500);
          await admin
            .from("support_tickets")
            .update({
              chat_status: ticket.chat_status === "waiting" ? "waiting" : "active",
              last_message_at: now,
              last_merchant_read_at: now,
              updated_at: now,
            })
            .eq("id", ticket.id);
          return json({ ok: true, messages: await publicMessages(admin, ticket.id) });
        }

        if (action === "end") {
          const now = new Date().toISOString();
          await admin
            .from("support_tickets")
            .update({
              chat_status: "ended",
              chat_ended_at: now,
              status: "closed",
              closed_at: now,
              resolution: "Website visitor ended the live chat.",
              resolution_summary: "Website visitor ended the live chat.",
              resolution_code: "visitor_ended",
              updated_at: now,
            })
            .eq("id", ticket.id);
          return json({ ok: true, chatStatus: "ended" });
        }

        return json({ error: "Unknown action." }, 400);
      },
    },
  },
});
